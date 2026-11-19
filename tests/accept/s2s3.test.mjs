// 块 2 第 2-3 张：S2（卷十二 §4.2 读文字）与 S3（§4.3 写入归属）各检测器的必须报与必须不报（卷十二 §4.14 R12-13.3），
// 以及导出参数类型标注从第一个文件起全量适用（块 2 体检 K2-46，卷二 §2.8 第 4 条末句）。期望值一律手写字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readRegistry, readDecl } from '../../tools/accept/read.mjs';
import { detect as typedPos } from '../../tools/accept/detectors/typed_pos.mjs';
import { detect as pathAccess, components } from '../../tools/accept/detectors/path_access.mjs';
import { detect as declCmp } from '../../tools/accept/detectors/decl_cmp.mjs';
import { accRun } from '../../tools/accept/run.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLS = Object.fromEntries(readRegistry(ROOT, 'scanclasses').map((r) => [r.scanClass, r]));
const SERVER = ['rules', 'kernel', 'textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate', 'assembly'];

function ctxOf(map) {
  const files = new Map(Object.entries(map));
  return loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });
}
const text = (src, checks, file = 'server-plugin/a.mjs') => typedPos(ctxOf({ [file]: src }), { groups: SERVER, checks }, CLS.text_judge).map((h) => [h.code, h.line, h.nodeKind]);
const esc = (src, file = 'server-plugin/a.mjs') => typedPos(ctxOf({ [file]: src }), { groups: SERVER, checks: ['directive', 'anyType', 'assertCast'] }, CLS.escape_hatch).map((h) => [h.code, h.line]);
const writes = (map, codes = ['E-VIEW-UNDECLARED-WRITE', 'E-VIEW-BYPASS']) => pathAccess(ctxOf(map), { groups: SERVER, access: 'write', codes }, CLS.cross_write).map((h) => [h.code, h.file, h.comp || '']);
const dyn = (src) => declCmp(ctxOf({ 'server-plugin/a.mjs': src }), { groups: ['rules'], checks: ['dynamicState'] }).map((h) => h.nodeKind);

test('text_judge regex：正则字面量与 RegExp 构造计入，注释与字串里的斜杠不计；regexFiles 内的文件放行', () => {
  assert.deepEqual(text("const r = /a+/;\nconst s = new RegExp('b');\nconst t = RegExp('c');", ['regex']), [['E-VIEW-TEXT-MATCH', 1, 'regex'], ['E-VIEW-TEXT-MATCH', 2, 'regex'], ['E-VIEW-TEXT-MATCH', 3, 'regex']]);
  assert.deepEqual(text("// /x/ 在注释里\nconst a = 'a/b/c'; const q = 4 / 2 / 1;", ['regex']), []);
  assert.deepEqual(text('const r = /a+/;', ['regex'], 'server-plugin/kernel/handles/x.mjs'), []);
  assert.deepEqual(text('const r = /a+/;', ['regex'], 'server-plugin/kernel/x.mjs'), [['E-KERNEL-ONLY', 1, 'regex']]);
});

test('text_judge nonAscii：非 ASCII 字串与模板计入；throw new X(文案) 与注释不计；组码按 groupCodes', () => {
  assert.deepEqual(text("const a = '睡';\nconst b = `x${y}醒`;", ['nonAscii']), [['E-VIEW-TEXT-MATCH', 1, 'literal_non_ascii'], ['E-VIEW-TEXT-MATCH', 2, 'literal_non_ascii']]);
  assert.deepEqual(text("// 注释\nif (!x) throw new Error('缺', { cause: 1 });", ['nonAscii']), []);
  assert.deepEqual(text("throw new Error('ok', '第二个实参');", ['nonAscii']), [['E-VIEW-TEXT-MATCH', 1, 'literal_non_ascii']]);
  assert.deepEqual(text("const a = '睡';", ['nonAscii'], 'server-plugin/input/x.mjs'), [['E-INPUT-FUZZY', 1, 'literal_non_ascii']]);
  assert.deepEqual(text("const a = '睡';", ['nonAscii'], 'server-plugin/gate/x.mjs'), [['E-GATE-FUZZY', 1, 'literal_non_ascii']]);
});

test('text_judge bareCompare：裸字面量参与 ===、case、includes 数组、get/has 键计入；`in`（B2-W4g 起不计）与句柄比较、普通实参不计', () => {
  const src = [
    "if (a === 'x') f();",
    "if ('y' !== b) f();",
    "switch (k) { case 'up': break; }",
    "if ('k' in o) f();",
    "if (['p', 'q'].includes(z)) f();",
    "const v = m.get('key');",
    "const ok = s.has(`lit`);",
  ].join('\n');
  // 第 4 行 `'k' in o` 不计：卷二 :2412 ④ 只列 ===/!==/switch/Map 键/数组元素，`in` 属 ②（B2-W4g）。
  assert.deepEqual(text(src, ['bareCompare']).map((h) => h[1]), [1, 2, 3, 5, 5, 6, 7]);
  assert.deepEqual(text("if (a === V.fam.x_y) f(); g('arg'); const o = { k: 'v' }; const t = [1, 'n'].length;", ['bareCompare']), []);
});

test('text_judge bareCompare 补洞写法（卷二 §2.8 代表性正反例、S13 补洞②③）：别名溯源、族前缀拼接、V 动态访问、字面量判断表', () => {
  const lines = (src) => text(src, ['bareCompare']).map((h) => h[1]);
  const cls = { ...CLS.text_judge, handleRoots: ['V'] };
  const withRoots = (src) => typedPos(ctxOf({ 'server-plugin/a.mjs': src }), { groups: SERVER, checks: ['bareCompare'] }, cls).map((h) => [h.line, h.nodeKind]);
  // 别名溯源：const 折叠为字串的名字（含折叠后的拼接）参与比较
  assert.deepEqual(lines("const S = 'sleep';\nif (x === S) f();"), [2]);
  assert.deepEqual(lines("const S = 'sfam_' + 'sleep';\nswitch (k) { case S: break; }"), [1, 2]);
  assert.deepEqual(lines("const n = 4;\nconst h = V.a.x;\nif (x === h || x === n) f();"), []);
  // 族前缀拼接
  assert.deepEqual(lines("const a = 'sfam_' + k;\nconst b = `sfam_${k}`;\nconst c = String.fromCharCode(97);"), [1, 2, 3]);
  assert.deepEqual(lines("const a = 'sfam_';\nconst b = `x ${k}y`;\nconst c = 'ab' + k;\nconst d = 'a_b' + k;"), []);
  // V 动态访问与模板串下标
  assert.deepEqual(withRoots('const a = V[fam][id];\nconst b = V[`sfam_${k}`];\nconst c = o[`k${i}`];\nconst d = V.status_family.sfam_sleep;\nconst e = o.V[k];'), [[1, 'literal_compare'], [2, 'literal_compare'], [2, 'literal_compare'], [3, 'literal_compare']]);
  // 字面量判断表
  assert.deepEqual(lines("const a = {sleep: 1}[x];\nconst b = ['sleep'][0];\nconst c = ({ a: 's' }).a;\nconst d = { k: 'v' };\nconst e = [1, 2];\nfoo({ a: 1 }).b;"), [1, 2, 3]);
  assert.deepEqual(lines("const m = new Map([['sleep', 1], [V.a.x, 2]]).get(x);\nconst s = new Set(['a', V.a.x]).has(x);\nconst t = new Map([[V.a.x, 1]]);\nconst u = new Set([V.a.x]);"), [1, 2]);
  assert.deepEqual(lines('/** @param {Handle} h @returns {boolean} */\nexport function f(h) { return [V.a.x, V.a.y].includes(h) && h === V.a.x; }'), []);
});

test('text_judge exportParams：导出函数每个形参要有 JSDoc 类型标注（含解构、箭头、默认值；@type 整体标注算）', () => {
  const ok = [
    '/** @param {A} a @param {{x: B}} [b] */ export function f(a, b = 1) {}',
    '/**\n * @param {A} a\n */\nexport const g = (a) => a;',
    '/** @type {(a: A) => void} */\nexport const h = (a) => {};',
    '/** @param {Opts} opts */ export function k({ x, y }) {}',
    'export function none() {}',
    'function local(a) {}',
  ].join('\n');
  assert.deepEqual(text(ok, ['exportParams']), []);
  const bad = 'export function f(a) {}\n/** @param {A} a */\nexport function g(a, b) {}\nexport const h = (q) => q;\nexport const i = q => q;';
  assert.deepEqual(text(bad, ['exportParams']), [['E-VIEW-FAMILY-UNRESOLVED', 1, 'export_param'], ['E-VIEW-FAMILY-UNRESOLVED', 3, 'export_param'], ['E-VIEW-FAMILY-UNRESOLVED', 4, 'export_param'], ['E-VIEW-FAMILY-UNRESOLVED', 5, 'export_param']]);
});

test('escape_hatch：指令注释、JSDoc any 与 *、强转与类型谓词计入；声明前 @type、castFiles 内的强转不计', () => {
  assert.deepEqual(esc('// @ts-ignore\nconst a = 1;\n/* eslint-disable */\n/** @param {any} x */\nfunction f(x) {}\n/** @type {*} */\nlet y;\nconst z = /** @type {T} */ (w);\n/** @returns {asserts v is T} */\nfunction g(v) {}'),
    [['E-TSC-ESCAPE-DIRECTIVE', 1], ['E-TSC-ESCAPE-DIRECTIVE', 3], ['E-TSC-ESCAPE-ANY', 4], ['E-TSC-ESCAPE-ANY', 6], ['E-TSC-ESCAPE-ASSERT', 8], ['E-TSC-ESCAPE-ASSERT', 9]]);
  assert.deepEqual(esc('/** @type {number} */\nlet n = 0;\n/** @param {Array<number>} xs 任何（any）数 */\nfunction f(xs) {}\nconst s = "/** @type {T} */ (x)";'), []);
  assert.deepEqual(esc('const z = /** @type {T} */ (w);', 'server-plugin/kernel/handles/keys.mjs'), []);
});

test('cross_write：登记写者写自己的路径不计；越权写、非 P 实参、直写 state 计入，分量按声明项派生', () => {
  assert.deepEqual(writes({ 'server-plugin/kernel/transaction.mjs': 'writePath(state, P.pendingPost(id), []);' }), []);
  assert.deepEqual(writes({ 'server-plugin/sys/a.mjs': 'writePath(state, P.pendingPost(id), []);\nwritePath(state, p, 0);\nstate.terminated[id] = 1;\nengine.state.created.x = 2;\ndelete state.playerNotes[id];\nstate.other++;' }), [
    ['E-VIEW-UNDECLARED-WRITE', 'server-plugin/sys/a.mjs', 'c_write_pendingPost'],
    ['E-VIEW-UNDECLARED-WRITE', 'server-plugin/sys/a.mjs', ''],
    ['E-VIEW-BYPASS', 'server-plugin/sys/a.mjs', 'c_write_terminated'],
    ['E-VIEW-BYPASS', 'server-plugin/sys/a.mjs', 'c_write_created'],
    ['E-VIEW-BYPASS', 'server-plugin/sys/a.mjs', 'c_write_playerNotes'],
    ['E-VIEW-BYPASS', 'server-plugin/sys/a.mjs', ''],
  ]);
  assert.deepEqual(writes({ 'server-plugin/sys/a.mjs': 'const x = state.terminated[id]; if (state.created === y) f(state); const o = { state: 1 };' }), []);
  assert.deepEqual(writes({ 'server-plugin/sys/a.mjs': 'writePath(state, P.pendingPost(id), []); state.x = 1;' }, ['E-VIEW-BYPASS']).map((h) => h[0]), ['E-VIEW-BYPASS']);
  const decl = readDecl(ROOT);
  assert.deepEqual(components(loadContext(ROOT, { files: [], read: () => '', decl }), { access: 'write' }), ['c_write_accounts', 'c_write_aggregates', 'c_write_clock', 'c_write_created', 'c_write_displayNames', 'c_write_due', 'c_write_holdings', 'c_write_itemInstances', 'c_write_ledgerCounters', 'c_write_ledgerTotals', 'c_write_outflowTotals', 'c_write_pendingPost', 'c_write_playerNotes', 'c_write_statuses', 'c_write_stockLots', 'c_write_terminated']);
  assert.deepEqual(components(loadContext(ROOT, { files: [], read: () => '', decl }), { access: 'read' }), []);
});

test('display_read：读声明表显示集合（display 与 textPaths）计入，别的路径与写不计', () => {
  const run = (src) => pathAccess(ctxOf({ 'server-plugin/a.mjs': src }), { groups: ['rules'], access: 'display', codes: ['E-VIEW-DISPLAY-READ'] }).map((h) => h.line);
  assert.deepEqual(run('const a = state.displayNames[id].text;\nconst b = state.narration[k];\nconst c = state.playerNotes.n1.text;'), [1, 2, 3]);
  assert.deepEqual(run('const a = state.displayNames[id].seq;\nconst b = other.displayNames[id].text;'), []);
});

test('undeclared_io dynamicState：计算属性、展开、Object 枚举、for…in 计入；按名读不计', () => {
  assert.deepEqual(dyn('const a = state[k];\nconst b = { ...state };\nconst c = Object.keys(state);\nfor (const k in state) f(k);\nconst d = engine.state[key].x;'), ['state_computed', 'state_spread', 'state_enumerate', 'state_for_in', 'state_computed']);
  assert.deepEqual(dyn('const a = state.created;\nconst b = state["created"];\nf(state);\nconst c = state.created[id].props;'), []);
});

test('K2-46：仓库现有服务端各组文件的导出函数形参全部带类型标注（从第一个文件起全量适用）', () => {
  const ctx = loadContext(ROOT);
  const hits = typedPos(ctx, { groups: SERVER, checks: ['exportParams'] }, CLS.text_judge).map((h) => `${h.file}:${h.line} ${h.symbolPath}`);
  assert.deepEqual(hits, []);
});

test('S2、S3 条目在真实仓库上零命中（零基线），且条目状态照实', async () => {
  const { report, rows } = await accRun('pre_commit', 'test', null, { root: ROOT });
  const keys = ['vol1.V-2.a', 'vol1.V-2.b', 'vol1.V-3', 'vol1.V-20', 'vol1.V-23', 'vol2.S2', 'vol2.S3.a', 'vol2.S5', 'vol2.S7', 'vol2.S15', 'vol2.S18', 'vol2.S19.a', 'vol2.S19.b'];
  assert.deepEqual(rows.filter((r) => keys.includes(r.itemKey)), []);
  assert.deepEqual(report.gaps.filter((k) => ['vol1.V-2.a', 'vol1.V-20', 'vol1.V-23', 'vol1.V-24.a', 'vol1.V-25.a', 'vol1.V-29.a', 'vol1.V-31.a', 'vol2.S2', 'vol2.S3.a', 'vol2.S18', 'vol2.S19.a', 'vol2.S3.b', 'vol2.S9', 'vol2.S13', 'vol2.S15', 'vol2.S17.a', 'vol2.S17.b'].includes(k)),
    ['vol1.V-2.a', 'vol1.V-20', 'vol1.V-23', 'vol1.V-24.a', 'vol1.V-25.a', 'vol1.V-29.a', 'vol1.V-31.a', 'vol2.S13', 'vol2.S15', 'vol2.S17.a', 'vol2.S17.b', 'vol2.S18', 'vol2.S19.a', 'vol2.S2', 'vol2.S3.a', 'vol2.S3.b', 'vol2.S9']);
  // 卷十二 R12-11.7：text_judge 靠 tsc 才能判的反例现有词法检测器报不出，规则层组的条目全部退回 registered（不虚报 implemented）；
  // kernel 组的三条走 le_baseline 逐行基线（B2-W2b，李白 11-18 08:18 第 1 条），词法可判，基线已登记，进必过集合。
  assert.deepEqual(readRegistry(ROOT, 'items').filter((it) => it.scanClass === 'text_judge' && it.state !== 'registered').map((it) => it.itemKey),
    ['vol2.S13.k1', 'vol2.S13.k3', 'vol2.S13.k4']);
  for (const c of ['escape_hatch', 'display_read', 'cross_write']) {
    for (const k of Object.keys(report.cases).filter((x) => x.startsWith(`${c}-`))) assert.equal(report.cases[k], 'pass', k);
  }
  // S15 的"state 传给登记之外的函数"未判（R12-3.4），undeclared_io 下没有已实现条目，用例不跑（A12 :2375 反例 undeclared_io-04 是缺口）。
  assert.deepEqual(readRegistry(ROOT, 'items').filter((it) => it.scanClass === 'undeclared_io' && it.state !== 'registered').map((it) => it.itemKey), []);
  for (const k of Object.keys(report.cases).filter((x) => x.startsWith('text_judge-') || x.startsWith('undeclared_io-'))) assert.equal(report.cases[k], 'not_run', k);
});

test('text_judge 用例集：§2.8 代表性正反例逐条录入；词法可判的报出、要 tsc 才能判的现在报不出（照实，不虚报）', () => {
  const cases = readRegistry(ROOT, 'cases').filter((c) => c.scanClass === 'text_judge');
  const flagged = {};
  for (const c of cases) {
    const src = readFileSync(join(ROOT, c.fixture), 'utf8');
    flagged[c.caseKey] = typedPos(ctxOf({ 'server-plugin/a.mjs': src }), { groups: SERVER, checks: ['regex', 'nonAscii', 'bareCompare', 'exportParams'] }, CLS.text_judge).length > 0;
  }
  assert.deepEqual(flagged, {
    'text_judge-01': true, 'text_judge-02': true, 'text_judge-03': true, 'text_judge-04': true, 'text_judge-05': true, 'text_judge-06': true,
    'text_judge-11': false, 'text_judge-21': false, 'text_judge-22': false,
    'text_judge-23': true, 'text_judge-24': true, 'text_judge-25': true, 'text_judge-26': true, 'text_judge-27': true, 'text_judge-28': true,
    'text_judge-29': true, 'text_judge-30': true, 'text_judge-31': true, 'text_judge-32': true, 'text_judge-33': true, 'text_judge-34': true,
    'text_judge-35': false, 'text_judge-36': true,
    'text_judge-41': false, 'text_judge-42': false, 'text_judge-43': false, 'text_judge-44': false, 'text_judge-45': false,
    'text_judge-46': false, 'text_judge-47': false, 'text_judge-48': false,
    // B2-W2b kernel 组用例（组 kernel，按条目的 params.groups 判）：①③④ 词法可判，正例不报。
    'text_judge_kernel-01': true, 'text_judge_kernel-02': true, 'text_judge_kernel-03': true, 'text_judge_kernel-11': false,
  });
  // 极性与上表一致的（must_fail 报出、must_pass 不报）才是现在能判的；其余的正是条目不得 implemented 的原因
  const cannot = cases.filter((c) => (c.polarity === 'must_fail') !== flagged[c.caseKey]).map((c) => c.caseKey);
  assert.deepEqual(cannot, ['text_judge-35', 'text_judge-41', 'text_judge-42', 'text_judge-43', 'text_judge-44', 'text_judge-45', 'text_judge-46', 'text_judge-47', 'text_judge-48']);
});

test('词法可判的 text_judge 检查项（regex、nonAscii、bareCompare、导出参数标注）在真实仓库上仍零命中', () => {
  const ctx = loadContext(ROOT);
  // 退回 registered 的 11 条（vol2.S13 是整个 kernel 与共享库组的逐行基线，另有它自己的口径，不在此列）
  const demoted = ['vol1.V-2.a', 'vol1.V-20', 'vol1.V-23', 'vol1.V-24.a', 'vol1.V-25.a', 'vol1.V-29.a', 'vol1.V-31.a', 'vol2.S18', 'vol2.S19.a', 'vol2.S2', 'vol2.S3.a'];
  const items = readRegistry(ROOT, 'items').filter((it) => demoted.includes(it.itemKey));
  assert.equal(items.length, 11);
  for (const it of items) assert.deepEqual(typedPos(ctx, it.params, CLS.text_judge).map((h) => `${h.file}:${h.line} ${h.code}`), [], it.itemKey);
});
