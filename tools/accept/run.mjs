// acc-runner（卷十二 §3.2）：执行只有一个入口 accRun(gate, subject, contentPrint)。
// 提交钩子、云门禁、清扫卡、封卷检查都调它（§2.11 门禁设施登记 acc-runner）。
// 按代号取检测器模块（§2.3），没有按检测器名、条目名、文件名的分支（S12-5）；不读墙钟、不读随机源（S12-11）。
// 报告确定（R12-10.5）：列表按条目键、行键升序，正文里没有时刻。

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRequiredTests, runTestFile } from './lib/required-tests.mjs';

// 方法是测试的条目（卷十二 §4.5.1 :782 进必过集合的三种方法）：没有检测器（§2.2 :194 非静态条目可空），实现就是 `impl` 所指的测试文件
// （§2.2 :203），期望 `all_pass`（§2.1"用例全过"）——执行器真跑该文件，全过才 pass。
export const TEST_METHODS = ['load_check', 'unit_test', 'property_test'];
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

// 方法是测试的条目（卷十二 §4.5.1 :782；§2.2 :194 detector 可空、:203 impl 是测试文件；期望 all_pass）：真跑 impl 所指的测试文件，
// 全部用例通过才 pass（R12-11.7 :1100"在当前主干上为 pass"）；没跑出一条通过、有失败、有 skip/todo 都不过，不默认通过。
// 文件缺失报 E-ACC-ITEM-FORM（§2.12：条目缺必填字段；impl 自 implemented 起必填）。测试失败卷十二 §2.12 没有专码，codes 空、cases 写原因。
// runsOn 不是 local_static 的条目只在登记为该种类的测试台跑（R12-9.7 :990），本机不跑，记 not_run。
// 同一次执行里同一文件只跑一次（几条条目可共用一个测试文件）。
function runTestItem(root, item, bench, cache) {
  if (item.runsOn !== 'local_static' && item.runsOn !== bench) return { verdict: 'not_run' };
  if (!item.impl) return { verdict: 'fail', codes: ['E-ACC-ITEM-FORM'], cases: ['impl:missing'] };
  if (!cache.has(item.impl)) cache.set(item.impl, runTestFile(root, item.impl).reason);
  const reason = cache.get(item.impl);
  if (reason === null) return { verdict: 'pass' };
  return { verdict: 'fail', codes: reason === 'missing' ? ['E-ACC-ITEM-FORM'] : [], cases: [`${item.impl}:${reason}`] };
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
    // 夹具正文若是 JSON，同时当 gateState（{components, baseline}）给要看当次分量的判定用（baseline_monotone 用例）。
    let gateState; try { gateState = JSON.parse(files.get(main)); } catch { gateState = undefined; }
    const cctx = { ...ctx, files: [...files.keys()].sort(), read: (p) => files.get(p), prefixes, gateState };
    const own = items.filter((it) => it.scanClass === c.scanClass);
    // 类别下没有已实现的条目（全是 registered，如 text_judge 靠 tsc 才能判的反例还报不出，卷十二 R12-11.7）：用例不跑，记 not_run，不算回归。
    if (!own.length) { out[c.caseKey] = 'not_run'; continue; }
    const hits = [];
    for (const it of own) hits.push(...await runItem(cctx, it, classes));
    const flagged = hits.length > 0 && (!c.expectCode || hits.some((h) => h.code === c.expectCode));
    const ok = c.polarity === 'must_fail' ? flagged : hits.length === 0;
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
  // 条目过滤参数（R12-10.2 :1028"要少跑，就用关口与条目过滤的参数，照样出执行记录"）：opts.filter 是 accItems 的过滤（§3.1），关口照旧。
  // 滤掉的条目不许从报告里消失（R12-10.7 :1047）：列 not_run，必过集合按整个关口全部条目算。
  const gateItems = accItems(root, { gate });
  const items = accItems(root, { ...(opts.filter || {}), gate });
  const keptKeys = new Set(items.map((it) => it.itemKey));
  const filteredOut = gateItems.filter((it) => !keptKeys.has(it.itemKey));
  const runnable = items.filter((it) => RUNNABLE.includes(it.state));
  const testCache = new Map();

  const results = {}; const failed = [];
  for (const it of filteredOut) results[it.itemKey] = 'not_run'; const components = {}; let rows = [];
  // 上次合入的值（R12-8.4、R12-8.5）：入库的 baseline.json，只在合入关口写；不读 out/ 下的本地记录。
  // opts.baselineRows 只供测试代入（测试不得写登记路径 baseline.json，§2.11）；真实执行不传。
  const base = Object.fromEntries((opts.baselineRows || accBaseline(root)).map((b) => [b.compCode, b]));
  // 要看本次分量现值才能判的条目（检测器导出 needsGateState，按条目参数定）排在其余条目之后，判时给 ctx 加 gateState（当次现值与上次合入值）。
  const lateKeys = new Set();
  for (const item of items) {
    if (!RUNNABLE.includes(item.state) || !item.detector) continue;
    const d = await detectorOf(item.detector);
    if (typeof d.needsGateState === 'function' && d.needsGateState(item.params || {})) lateKeys.add(item.itemKey);
  }
  const ordered = [...items.filter((i) => !lateKeys.has(i.itemKey)), ...items.filter((i) => lateKeys.has(i.itemKey))];
  for (const item of ordered) {
    if (!RUNNABLE.includes(item.state)) { results[item.itemKey] = 'not_run'; continue; }
    // 没有检测器的条目：方法是测试的按 impl 真跑测试文件；其余方法（场景、模板、基准等，§2.8、§4.6）本路径不执行，记 not_run。
    if (!item.detector) {
      const t = TEST_METHODS.includes(item.method) ? runTestItem(root, item, opts.bench || '', testCache) : { verdict: 'not_run' };
      results[item.itemKey] = t.verdict;
      if (t.verdict === 'fail') failed.push({ itemKey: item.itemKey, codes: t.codes, cases: t.cases });
      continue;
    }
    // 扩展性条目（R12-6.2 ①⑥）：执行前后各记一次代码文件集合指纹，不同即该条目不过、码 E-ACC-EXT-CODE-CHANGED（S12-12 数执行记录里的这类）。
    const before = item.form === 'extend' ? codeSetPrint(root) : null;
    const itemCtx = lateKeys.has(item.itemKey)
      ? { ...ctx, gateState: { components: { ...components }, baseline: Object.fromEntries(Object.entries(base).map(([k, b]) => [k, b.current])) } }
      : ctx;
    const hits = await runItem(itemCtx, item, classes);
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
  const caseFails = Object.keys(cases).filter((k) => cases[k] === 'fail');
  if (caseFails.length) failed.push({ itemKey: 'bypass', codes: ['E-ACC-BYPASS-REGRESSION'], cases: caseFails });

  // 必跑测试（李白 11-17 裁定②）：opts.runRequired 时真执行登记的 requiredTests，失败、跳过、缺失都算不过；
  // 只有命令行与提交钩子开它（测试里直接调 accRun 不开，免得递归）。
  if (opts.runRequired) {
    const rf = runRequiredTests(root, ctx.regs.gatefacs);
    if (rf.length) failed.push({ itemKey: 'required-tests', codes: ['E-ACC-REQUIRED-TEST'], cases: rf.map((f) => `${f.facCode}:${f.file}:${f.name}:${f.reason}`) });
  }

  const prevKeys = new Set(accHits(root).map((h) => h.rowKey));
  const curKeys = new Set(rows.map((h) => h.rowKey));
  const vs = Object.values(results);
  const count = (v) => vs.filter((x) => x === v).length;
  const mustPass = new Set(gateItems.filter((it) => it.state === 'in_core').map((it) => it.itemKey));
  // 必过集合里的 not_run 与 blocked 都当不过（R12-10.7 :1047），列进不过的条目（卷十二 §2.12 没有专码，codes 空、cases 写结论）。
  for (const k of [...mustPass].sort()) if (results[k] === 'not_run' || results[k] === 'blocked') failed.push({ itemKey: k, codes: [], cases: [`verdict:${results[k]}`] });
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
