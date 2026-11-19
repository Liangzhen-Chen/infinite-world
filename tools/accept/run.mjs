// acc-runner（卷十二 §3.2）：执行只有一个入口 accRun(gate, subject, contentPrint)。
// 提交钩子、云门禁、清扫卡、封卷检查都调它（§2.11 门禁设施登记 acc-runner）。
// 按代号取检测器模块（§2.3），没有按检测器名、条目名、文件名的分支（S12-5）；不读墙钟、不读随机源（S12-11）。
// 报告确定（R12-10.5）：列表按条目键、行键升序，正文里没有时刻。

import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { runRequiredTests, runTestFile } from './lib/required-tests.mjs';
import { REGISTERED_CODES } from '../../server-plugin/kernel/error-codes.mjs';

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

// 基线分量的现值（R12-8.1）：逐行清单里属于该分量的行数；逐行清单一并留行键（R12-8.2，不含行号），供集合比较。
function compValues(rows) {
  const keys = new Map();
  for (const r of rows) if (r.compCode) { if (!keys.has(r.compCode)) keys.set(r.compCode, []); keys.get(r.compCode).push(r.rowKey); }
  return keys;
}

// 基线提交上的内容（R12-8.9）：文件清单与内容都取自该提交（git ls-tree / git show），不碰当前工作树；判据、模型与登记取当前。
// 用来对新分量数出 B0，免得把同一次合入带进来的违例当成基线。
export function commitContext(root, ref) {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
  const files = git(['ls-tree', '-r', '--name-only', '-z', ref]).split('\0').filter(Boolean).sort();
  const cache = new Map();
  const read = (p) => { if (!cache.has(p)) cache.set(p, git(['show', `${ref}:${p}`])); return cache.get(p); };
  return loadContext(root, { files, read });
}

// 新分量在基线提交上的行键（R12-8.9）：按登记的检测器与条目参数，在基线提交的内容上重数属于这些分量的行。
// 只跑可能产出这些分量的条目（baseComp 或检测器派生的分量命中即算），原样走同一套行键拼法（R12-8.2）。
export async function baselineKeysAt(root, ref, compCodes, items, classes) {
  const ctx = commitContext(root, ref);
  const out = new Map([...compCodes].map((c) => [c, []]));
  for (const item of items) {
    if (!RUNNABLE.includes(item.state) || !item.detector) continue;
    const det = await detectorOf(item.detector);
    const declared = typeof det.components === 'function' ? det.components(ctx, item.params || {}) : [];
    if (![item.baseComp, ...declared].some((c) => c && out.has(c))) continue;
    const hits = await det.detect(ctx, item.params || {}, classes.get(item.scanClass) || {});
    for (const r of toRows(item, hits)) if (out.has(r.compCode)) out.get(r.compCode).push(r.rowKey);
  }
  return out;
}

// le_baseline（卷十二 R12-8.4、R12-8.5、R12-8.9）：条目 baseComp 分量的本次实测不高于上次合入的值即 pass；
// 自上一次合入起新出现任一行键即不过（集合比较：现值行键集合不是基线行键集合的子集），码 E-ACC-BASELINE-UP（§2.12）。
// 基线行带行键清单时按集合比（少一条仍过）；旧基线行没有清单时按行数比。
// 首次登记（baseline.json 里没有该分量）不放行：B0 按基线提交的内容数出（b0.rowKeys），现值行键集合不是 B0 集合的子集即不过；
// 没拿到基线提交的 B0 也不放行，不拿本次实测当 B0（R12-8.9）。
export function baselineVerdict(itemRows, current, baseRow, b0) {
  if (!baseRow) {
    if (!b0) return 'fail';
    const priorB0 = new Set(b0.rowKeys || []);
    return itemRows.every((r) => priorB0.has(r.rowKey)) ? 'pass' : 'fail';
  }
  if (Array.isArray(baseRow.rowKeys)) {
    const prior = new Set(baseRow.rowKeys);
    return itemRows.every((r) => prior.has(r.rowKey)) ? 'pass' : 'fail';
  }
  return current <= (typeof baseRow.current === 'number' ? baseRow.current : 0) ? 'pass' : 'fail';
}

// 合入关口通过后写 baseline.json（R12-8.5；§2.11 基线分量的唯一写者是执行器）。只降不升：现值低于上次合入才更新。
// 合入号必填（没有则拒写）；首次出现的新分量按 R12-8.9 把基线提交上数出的 B0 与本次实测一起登记（b0Map），不拿本次实测当 B0。
// 未测到的旧分量原样保留。行按分量代号升序，行键升序，报告确定。
export function writeBaseline(root, baseRows, components, rows, mergeRef, b0Map) {
  if (!mergeRef) throw new Error('E-ACC-BASELINE-EDIT pre_merge 写基线需要 --merge-ref（R12-8.5）');
  const keysOf = compValues(rows);
  const prev = new Map(baseRows.map((r) => [r.compCode, r]));
  const out = [];
  for (const compCode of Object.keys(components).sort()) {
    const cur = components[compCode];
    const rowKeys = (keysOf.get(compCode) || []).slice().sort();
    const p = prev.get(compCode);
    if (!p) {
      const b = b0Map && b0Map.get(compCode);
      if (!b) throw new Error(`E-ACC-BASELINE-UP ${compCode} 首次登记缺基线提交的 B0（R12-8.9）`);
      out.push({ compCode, b0: b.count, b0Source: 'counted', locked: false, current: cur, lastMergeRef: mergeRef, rowKeys });
      continue;
    }
    // 持平保持原样（行集合有变而总数持平的已在 le_baseline 条目上按集合拦下，关口不过就不会走到这里）。
    out.push(cur < p.current ? { ...p, current: cur, rowKeys, lastMergeRef: mergeRef } : { ...p, lastMergeRef: mergeRef });
  }
  for (const r of baseRows) if (!(r.compCode in components)) out.push(r);
  out.sort((a, b) => (a.compCode < b.compCode ? -1 : a.compCode > b.compCode ? 1 : 0));
  writeFileSync(join(root, LAYOUT.accDir, 'baseline.json'), stableJson({ rows: out }));
}
// 检测器命中带的码为空或不在码表里（条目没登 params.code 等），按条目缺字段报 E-ACC-ITEM-FORM（§2.12 :542 整类规则：不过必带登记的码，没有空码）。
const codeOrItemForm = (code) => (code && REGISTERED_CODES.has(code) ? code : 'E-ACC-ITEM-FORM');
function toRows(item, hits) {
  const seen = new Map();
  return hits.map((h) => {
    const base = [compOf(item, h), h.file, h.symbolPath, h.nodeKind].join('|');
    const ordinal = seen.get(base) || 0;
    seen.set(base, ordinal + 1);
    return { rowKey: `${base}|${ordinal}`, compCode: compOf(item, h), file: h.file, symbolPath: h.symbolPath, nodeKind: h.nodeKind, ordinal, line: h.line, errorCode: codeOrItemForm(h.code), itemKey: item.itemKey, state: 'open' };
  });
}

// 方法是测试的条目（卷十二 §4.5.1 :782；§2.2 :194 detector 可空、:203 impl 是测试文件；期望 all_pass）：真跑 impl 所指的测试文件，
// 全部用例通过才 pass（R12-11.7 :1100"在当前主干上为 pass"）；没跑出一条通过、有失败、有 skip/todo 都不过，不默认通过。
// 文件缺失报 E-ACC-ITEM-FORM（§2.12：条目缺必填字段；impl 自 implemented 起必填）。测试文件有失败、skip、todo、零用例报 E-ACC-TEST-FAIL（§2.12 勘误 1118k14；李白 11-18 06:41 ①），cases 写原因；
// 验收报告里凡条目不过/未跑都落到 §2.12 登记的码，没有无码状态。
// runsOn 不是 local_static 的条目只在登记为该种类的测试台跑（R12-9.7 :994），本机不跑，记 not_run。
// 同一次执行里同一文件只跑一次（几条条目可共用一个测试文件）。
function runTestItem(root, item, bench, cache) {
  if (item.runsOn !== 'local_static' && item.runsOn !== bench) return { verdict: 'not_run' };
  if (!item.impl) return { verdict: 'fail', codes: ['E-ACC-ITEM-FORM'], cases: ['impl:missing'] };
  if (!cache.has(item.impl)) cache.set(item.impl, runTestFile(root, item.impl).reason);
  const reason = cache.get(item.impl);
  if (reason === null) return { verdict: 'pass' };
  return { verdict: 'fail', codes: reason === 'missing' ? ['E-ACC-ITEM-FORM'] : ['E-ACC-TEST-FAIL'], cases: [`${item.impl}:${reason}`] };
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

// 用例写明放在哪个组的位置上判（R12-13.4）：条目的 params.groups 不含该组时，片段根本不在它登记的范围里，不归它判。
// 没有 groups 的条目（按 facs/modules 取范围，或像 V-11 只看 gateState 的）照旧对全部用例判。
function coversGroup(item, group) {
  const gs = item.params && item.params.groups;
  return !Array.isArray(gs) || gs.includes(group);
}

async function runCases(root, ctx, items, classes) {
  const cases = readRegistry(root, 'cases');
  const fixturePrefixes = prefixesFromDir(join(root, LAYOUT.bypassDimsDir));
  const prefixes = mergePrefixes({ prefixes: new Set(ctx.prefixes.prefixes), singletons: new Set(ctx.prefixes.singletons), classPrefixes: new Set(ctx.prefixes.classPrefixes || []) }, fixturePrefixes);
  const out = {};
  for (const c of [...cases].sort((a, b) => (a.caseKey < b.caseKey ? -1 : 1))) {
    const dir = groupDir(ctx.model, c.group);
    const main = `${dir}__case__/${c.caseKey}.mjs`;
    const files = splitFixture(readFileSync(join(root, c.fixture), 'utf8'), main);
    // 夹具正文若是 JSON，同时当 gateState（{components, baseline}）给要看当次分量的判定用（baseline_monotone 用例）。
    let gateState; try { gateState = JSON.parse(files.get(main)); } catch { gateState = undefined; }
    const cctx = { ...ctx, repoFiles: ctx.files, files: [...files.keys()].sort(), read: (p) => files.get(p), prefixes, gateState };
    const own = items.filter((it) => it.scanClass === c.scanClass && coversGroup(it, c.group));
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
  // 条目过滤参数（R12-10.2 :1032"要少跑，就用关口与条目过滤的参数，照样出执行记录"）：opts.filter 是 accItems 的过滤（§3.1），关口照旧。
  // 滤掉的条目不许从报告里消失（R12-10.7 :1051）：列 not_run，必过集合按整个关口全部条目算。
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
  const itemRows = new Map(); const extChangedItems = new Set();
  // 新分量首次登记的 B0（R12-8.9）：合入关口上按基线提交（opts.mergeRef）的内容数出；提交关口不登记新分量（返回空表）。
  // 结果按当前新分量集合缓存；没有基线提交就返回 null，不许拿本次实测当 B0（不 silent pass）。
  let b0Map = new Map(); let b0Sig = '';
  const ensureB0 = async () => {
    if (gate !== 'pre_merge') return new Map();
    const comps = Object.keys(components).filter((k) => !(k in base)).sort();
    const sig = comps.join(',');
    if (sig === b0Sig) return b0Map;
    b0Sig = sig;
    if (!comps.length) { b0Map = new Map(); return b0Map; }
    if (!opts.mergeRef) { b0Map = null; return b0Map; }
    const keys = await baselineKeysAt(root, opts.mergeRef, comps, items, classes);
    b0Map = new Map(comps.map((c) => [c, { count: (keys.get(c) || []).length, rowKeys: (keys.get(c) || []).slice() }]));
    return b0Map;
  };
  // 上次合入值表：合入关口上，本次首次出现的分量取基线提交上数出的 B0（R12-8.9），没有 B0 按零；
  // 提交关口仍按零基线（R12-8.4）。V-11 这类 late 条目在其余条目数完之后取这张表。
  const lastMergeTable = (comps, b0s) => {
    const out = Object.fromEntries(Object.entries(base).map(([k, b]) => [k, typeof b.current === 'number' ? b.current : 0]));
    if (gate === 'pre_merge') for (const k of Object.keys(comps)) if (!(k in out)) out[k] = b0s && b0s.get(k) ? b0s.get(k).count : 0;
    return out;
  };
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
      ? { ...ctx, gateState: { components: { ...components }, baseline: lastMergeTable(components, await ensureB0()) } }
      : ctx;
    const hits = await runItem(itemCtx, item, classes);
    const extChanged = before !== null && codeSetPrint(root) !== before;
    if (extChanged) { hits.push({ file: '', line: 0, nodeKind: 'run', symbolPath: '', code: 'E-ACC-EXT-CODE-CHANGED' }); extChangedItems.add(item.itemKey); }
    const r = toRows(item, hits);
    rows = rows.concat(r);
    itemRows.set(item.itemKey, r);
    // le_baseline 的判定要等所有条目把分量数完（现值是分量合计），先记 pending，循环后统一判。
    results[item.itemKey] = item.expect === 'le_baseline' ? 'pending' : (extChanged ? 'fail' : verdictOf(item, hits.length));
    if (item.baseComp) components[item.baseComp] = components[item.baseComp] || 0;
    // 检测器按登记数据派生的分量（如每个写者声明项一个，R12-3.3）：没有命中的也列出，现值 0。
    const det = await detectorOf(item.detector);
    if (typeof det.components === 'function') for (const c of det.components(ctx, item.params || {})) components[c] = components[c] || 0;
    for (const x of r) if (x.compCode) components[x.compCode] = (components[x.compCode] || 0) + 1;
    if (results[item.itemKey] === 'fail') failed.push({ itemKey: item.itemKey, codes: [...new Set(r.map((x) => x.errorCode))].sort() });
  }
  // le_baseline 判定（R12-8.4）：读该条目 baseComp 分量的现值和 baseline.json 的上次合入值；不过的码是 §2.12 的 E-ACC-BASELINE-UP。
  // 新分量（baseline.json 里没有）只在合入关口登记，B0 取基线提交上数出的值（R12-8.9）；提交关口尚未登记，不拿零基线拒。
  const b0 = await ensureB0();
  for (const item of ordered) {
    if (!RUNNABLE.includes(item.state) || !item.detector || item.expect !== 'le_baseline') continue;
    if (extChangedItems.has(item.itemKey)) { results[item.itemKey] = 'fail'; failed.push({ itemKey: item.itemKey, codes: ['E-ACC-EXT-CODE-CHANGED'] }); continue; }
    if (!base[item.baseComp] && gate !== 'pre_merge') { results[item.itemKey] = 'pass'; continue; }
    const v = baselineVerdict(itemRows.get(item.itemKey) || [], components[item.baseComp] || 0, base[item.baseComp], b0 && b0.get(item.baseComp));
    results[item.itemKey] = v;
    if (v === 'fail') failed.push({ itemKey: item.itemKey, codes: ['E-ACC-BASELINE-UP'] });
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
  // 必过集合里的 not_run 与 blocked 都当不过（R12-10.7 :1051），列进不过的条目，码 E-ACC-REQUIRED-NOT-RUN（§2.12 勘误 1118k14），cases 写结论。
  for (const k of [...mustPass].sort()) if (results[k] === 'not_run' || results[k] === 'blocked') failed.push({ itemKey: k, codes: ['E-ACC-REQUIRED-NOT-RUN'], cases: [`verdict:${results[k]}`] });
  const blocking = failed.filter((f) => f.itemKey === 'bypass' || f.itemKey === 'required-tests' || mustPass.has(f.itemKey));

  const report = {
    contentPrint: print, gate, subject: subject || '', bench: opts.bench || '',
    versions: { runner: RUNNER_VERSION, criteria },
    items: { total: vs.length, pass: count('pass'), fail: count('fail'), not_run: count('not_run'), blocked: count('blocked'), failed },
    components: Object.fromEntries(Object.keys(components).sort().map((k) => [k, {
      b0: base[k] ? base[k].b0 : (b0 && b0.get(k) ? b0.get(k).count : null),
      last: base[k] ? base[k].current : null, current: components[k],
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
    // R12-8.5：合入关口通过后由执行器把各分量现值写入 baseline.json（只在合入关口，pre_commit 不写）；别的途径改它是 E-ACC-BASELINE-EDIT。
    // 合入号必填：没有 --merge-ref 就拒写（writeBaseline 抛 E-ACC-BASELINE-EDIT）。
    if (gate === 'pre_merge' && report.verdict === 'pass') writeBaseline(root, Object.values(base), components, rows, opts.mergeRef, b0);
  }
  return { report, rows, text: stableJson(report) };
}

// 命令行：node tools/accept/run.mjs <关口> [对象] [--write] [--merge-ref 提交] [--root 目录]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args.splice(i, 2)[1] : null; };
  const root = flag('--root');
  const mergeRef = flag('--merge-ref');
  const write = args.includes('--write');
  const pos = args.filter((a) => a !== '--write');
  if (!pos[0]) { process.stderr.write('usage: run.mjs <gate> [subject] [--write] [--merge-ref 提交] [--root dir]\n'); process.exit(2); }
  // R12-8.5：合入关口写基线必须带合入号；不带就不写、停下报已登记码（不自造码）。
  if (pos[0] === 'pre_merge' && write && !mergeRef) {
    process.stderr.write('E-ACC-BASELINE-EDIT pre_merge --write requires --merge-ref <提交>（R12-8.5）\n');
    process.exit(2);
  }
  const { report, text } = await accRun(pos[0], pos[1] || '', null, { root: root || undefined, write, mergeRef: mergeRef || undefined, runRequired: true });
  process.stdout.write(text);
  process.exit(report.verdict === 'pass' ? 0 : 1);
}
