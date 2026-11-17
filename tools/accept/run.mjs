// acc-runner（卷十二 §3.2）：执行只有一个入口 accRun(gate, subject, contentPrint)。
// 提交钩子、云门禁、清扫卡、封卷检查都调它（§2.11 门禁设施登记 acc-runner）。
// 按代号取检测器模块（§2.3），没有按检测器名、条目名、文件名的分支（S12-5）；不读墙钟、不读随机源（S12-11）。
// 报告确定（R12-10.5）：列表按条目键、行键升序，正文里没有时刻。

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRequiredTests } from './lib/required-tests.mjs';
import {
  LAYOUT, loadContext, readRegistry, accItems, accHits, accBaseline, prefixesFromDir, mergePrefixes, groupDir, isCode, REGISTRY,
} from './read.mjs';

export const RUNNER_VERSION = 1;
const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNABLE = ['implemented', 'in_core'];

export function stableJson(v) {
  const norm = (x) => {
    if (Array.isArray(x)) return x.map(norm);
    if (x && typeof x === 'object') return Object.fromEntries(Object.keys(x).sort().map((k) => [k, norm(x[k])]));
    return x;
  };
  return JSON.stringify(norm(v), null, 1) + '\n';
}

// 内容指纹：全部文件按路径排序后的（路径、git 对象号）序列的摘要。对象号与 git 同算法（未改动的已跟踪文件直接取索引里的），
// 所以同一内容不论暂存与否指纹相同。
export function contentPrintOf(ctx) {
  const h = createHash('sha256');
  for (const f of [...ctx.files].sort()) {
    let id = ctx.blobs.get(f);
    if (!id) { const buf = ctx.raw(f); id = createHash('sha1').update(`blob ${buf.length}\0`).update(buf).digest('hex'); }
    h.update(f + '\0' + id + '\n');
  }
  return h.digest('hex');
}

// 代码文件集合指纹：现读磁盘（不用本次执行开头的快照），只取代码扩展名的文件。
function codeSetPrint(root) {
  const c = loadContext(root);
  return contentPrintOf({ ...c, files: c.files.filter((f) => isCode(f, c.model)) });
}

const detectorCache = new Map();
async function detectorOf(code) {
  if (!detectorCache.has(code)) detectorCache.set(code, await import(pathToFileURL(join(HERE, '..', '..', REGISTRY.detectors.moduleDir, `${code}.mjs`)).href));
  return detectorCache.get(code);
}

// 行键（R12-8.2）：分量、文件、符号链、节点种类、同符号内序号；不含行号。
// 分量：命中自带的派生分量（卷十二 §2.5"写入归属类的分量不手列"，按声明项派生，块 2 体检 K2-13）优先，否则取条目登记的 baseComp。
const compOf = (item, h) => h.comp || item.baseComp || '';
function toRows(item, hits) {
  const seen = new Map();
  return hits.map((h) => {
    const base = [compOf(item, h), h.file, h.symbolPath, h.nodeKind].join('|');
    const ordinal = seen.get(base) || 0;
    seen.set(base, ordinal + 1);
    return { rowKey: `${base}|${ordinal}`, compCode: compOf(item, h), file: h.file, symbolPath: h.symbolPath, nodeKind: h.nodeKind, ordinal, line: h.line, errorCode: h.code, itemKey: item.itemKey, state: 'open' };
  });
}

async function runItem(ctx, item, classes) {
  const det = await detectorOf(item.detector);
  const cls = classes.get(item.scanClass) || {};
  return det.detect(ctx, item.params || {}, cls);
}

function verdictOf(item, n) {
  if (item.expect === 'zero') return n === 0 ? 'pass' : 'fail';
  return 'not_run';
}

// 绕法用例回归（R12-13.6）：片段放进该组的临时文件位置，按同类别各条目的参数判，结果须与极性相符。
// 片段里 `// @file 名字` 起的段是同目录的另一个文件；名字里带 `/` 的是仓库根相对路径（判据按文件路径判的用例要把文件放到原位，
// 如 S10 登记豁免的文件与登记表）。
export function splitFixture(text, mainPath) {
  const dir = mainPath.slice(0, mainPath.lastIndexOf('/') + 1);
  const files = new Map(); let cur = mainPath; let buf = [];
  for (const line of text.split('\n')) {
    const m = /^\/\/ @file (\S+)\s*$/.exec(line);
    if (m) { files.set(cur, buf.join('\n')); cur = m[1].includes('/') ? m[1] : dir + m[1]; buf = []; continue; }
    buf.push(line);
  }
  files.set(cur, buf.join('\n'));
  return files;
}

async function runCases(root, ctx, items, classes) {
  const cases = readRegistry(root, 'cases');
  const fixturePrefixes = prefixesFromDir(join(root, LAYOUT.bypassDimsDir));
  const prefixes = mergePrefixes({ prefixes: new Set(ctx.prefixes.prefixes), singletons: new Set(ctx.prefixes.singletons) }, fixturePrefixes);
  const out = {};
  for (const c of [...cases].sort((a, b) => (a.caseKey < b.caseKey ? -1 : 1))) {
    const dir = groupDir(ctx.model, c.group);
    const main = `${dir}__case__/${c.caseKey}.mjs`;
    const files = splitFixture(readFileSync(join(root, c.fixture), 'utf8'), main);
    const cctx = { ...ctx, files: [...files.keys()].sort(), read: (p) => files.get(p), prefixes };
    const own = items.filter((it) => it.scanClass === c.scanClass);
    const hits = [];
    for (const it of own) hits.push(...await runItem(cctx, it, classes));
    const flagged = hits.length > 0 && (!c.expectCode || hits.some((h) => h.code === c.expectCode));
    const ok = own.length > 0 && (c.polarity === 'must_fail' ? flagged : hits.length === 0);
    out[c.caseKey] = ok ? 'pass' : 'fail';
  }
  return out;
}

export async function accRun(gate, subject, contentPrint, opts = {}) {
  const root = opts.root || join(HERE, '..', '..');
  const ctx = loadContext(root, opts);
  const print = contentPrint || contentPrintOf(ctx);
  const classes = new Map(readRegistry(root, 'scanclasses').map((r) => [r.scanClass, r]));
  const criteria = Object.fromEntries(readRegistry(root, 'criteria').map((r) => [r.scanClass, r.rev]));
  const items = accItems(root, { gate });
  const runnable = items.filter((it) => RUNNABLE.includes(it.state));

  const results = {}; const failed = []; const components = {}; let rows = [];
  for (const item of items) {
    if (!RUNNABLE.includes(item.state)) { results[item.itemKey] = 'not_run'; continue; }
    // 扩展性条目（R12-6.2 ①⑥）：执行前后各记一次代码文件集合指纹，不同即该条目不过、码 E-ACC-EXT-CODE-CHANGED（S12-12 数执行记录里的这类）。
    const before = item.form === 'extend' ? codeSetPrint(root) : null;
    const hits = await runItem(ctx, item, classes);
    const extChanged = before !== null && codeSetPrint(root) !== before;
    if (extChanged) hits.push({ file: '', line: 0, nodeKind: 'run', symbolPath: '', code: 'E-ACC-EXT-CODE-CHANGED' });
    const r = toRows(item, hits);
    rows = rows.concat(r);
    results[item.itemKey] = extChanged ? 'fail' : verdictOf(item, hits.length);
    if (item.baseComp) components[item.baseComp] = components[item.baseComp] || 0;
    // 检测器按登记数据派生的分量（如每个写者声明项一个，R12-3.3）：没有命中的也列出，现值 0。
    const det = await detectorOf(item.detector);
    if (typeof det.components === 'function') for (const c of det.components(ctx, item.params || {})) components[c] = components[c] || 0;
    for (const x of r) if (x.compCode) components[x.compCode] = (components[x.compCode] || 0) + 1;
    if (results[item.itemKey] === 'fail') failed.push({ itemKey: item.itemKey, codes: [...new Set(r.map((x) => x.errorCode))].sort() });
  }
  rows.sort((a, b) => (a.rowKey < b.rowKey ? -1 : a.rowKey > b.rowKey ? 1 : 0));

  const cases = await runCases(root, ctx, runnable, classes);
  const caseFails = Object.keys(cases).filter((k) => cases[k] !== 'pass');
  if (caseFails.length) failed.push({ itemKey: 'bypass', codes: ['E-ACC-BYPASS-REGRESSION'], cases: caseFails });

  // 必跑测试（李白 11-17 裁定②）：opts.runRequired 时真执行登记的 requiredTests，失败、跳过、缺失都算不过；
  // 只有命令行与提交钩子开它（测试里直接调 accRun 不开，免得递归）。
  if (opts.runRequired) {
    const rf = runRequiredTests(root, ctx.regs.gatefacs);
    if (rf.length) failed.push({ itemKey: 'required-tests', codes: ['E-ACC-REQUIRED-TEST'], cases: rf.map((f) => `${f.facCode}:${f.file}:${f.name}:${f.reason}`) });
  }

  const prevKeys = new Set(accHits(root).map((h) => h.rowKey));
  const curKeys = new Set(rows.map((h) => h.rowKey));
  const base = Object.fromEntries(accBaseline(root).map((b) => [b.compCode, b]));
  const vs = Object.values(results);
  const count = (v) => vs.filter((x) => x === v).length;
  const mustPass = new Set(items.filter((it) => it.state === 'in_core').map((it) => it.itemKey));
  const blocking = failed.filter((f) => f.itemKey === 'bypass' || f.itemKey === 'required-tests' || mustPass.has(f.itemKey));

  const report = {
    contentPrint: print, gate, subject: subject || '', bench: opts.bench || '',
    versions: { runner: RUNNER_VERSION, criteria },
    items: { total: vs.length, pass: count('pass'), fail: count('fail'), not_run: count('not_run'), blocked: count('blocked'), failed },
    components: Object.fromEntries(Object.keys(components).sort().map((k) => [k, {
      b0: base[k] ? base[k].b0 : null, last: base[k] ? base[k].current : null, current: components[k],
      diff: base[k] ? components[k] - base[k].current : null,
    }])),
    rowSet: { new: [...curKeys].filter((k) => !prevKeys.has(k)).sort(), gone: [...prevKeys].filter((k) => !curKeys.has(k)).sort(), drift: [] },
    openHits: Object.fromEntries([...new Set(items.map((i) => i.scanClass))].sort().map((c) => [c, rows.filter((r) => items.find((i) => i.itemKey === r.itemKey).scanClass === c).length])),
    cases,
    approvals: 'not_run',
    gaps: items.filter((it) => !RUNNABLE.includes(it.state)).map((it) => it.itemKey),
    verdict: blocking.length ? 'fail' : 'pass',
  };

  if (opts.write) {
    const outDir = join(root, LAYOUT.accDir, 'out', print);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${gate}.json`), stableJson(report));
    writeFileSync(join(root, LAYOUT.accDir, 'hits.json'), stableJson({ rows }));
  }
  return { report, rows, text: stableJson(report) };
}

// 命令行：node tools/accept/run.mjs <关口> [对象] [--write] [--root 目录]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const root = flag('--root');
  const write = args.includes('--write');
  const pos = args.filter((a) => a !== '--write');
  if (!pos[0]) { process.stderr.write('usage: run.mjs <gate> [subject] [--write] [--root dir]\n'); process.exit(2); }
  const { report, text } = await accRun(pos[0], pos[1] || '', null, { root: root || undefined, write, runRequired: true });
  process.stdout.write(text);
  process.exit(report.verdict === 'pass' ? 0 : 1);
}
