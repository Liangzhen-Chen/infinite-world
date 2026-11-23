// C0 公共部件检查首批（亮圳「公共部件审查1122」Q-3）：四条报告档规则（le_baseline 逐行基线）与入口生产调用者报告。
// 规则的正反例在绕法用例里（tests/accept/bypass/ 下 timer_global、undo_raw_push、float_math、ledger_state_read，由 runner 的用例回归跑）；
// 这里测基线机制落到这四条上：新增违例拒、持平过、基线外的新违例（总数持平也）拒、违例减少过。期望行键按行键拼法（R12-8.2）手写成字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accRun } from '../../tools/accept/run.mjs';
import { readRegistry, accBaseline, loadContext } from '../../tools/accept/read.mjs';
import { entryTable } from '../../tools/accept/entry-report.mjs';
import { ROOT } from './temp-repo.mjs';

// 每条规则：条目键、基线分量、一个必报的小文件、它的行键（分量|文件|所在符号|节点种类|同符号内序号）。
// files：必报的小文件（路径: 源码）；rowKeys：它们产生的行键。
const RULES = [
  { itemKey: 'vol27.S27-3.timer', comp: 'c_pp_timer_ast', files: { 'server-plugin/rules-c0-timer.mjs': 'export function f(fn) {\n  return setTimeout(fn, 1);\n}\n' }, rowKeys: ['c_pp_timer_ast|server-plugin/rules-c0-timer.mjs|f|call|0'] },
  { itemKey: 'vol2.S5.undo', comp: 'c_pp_undo_push_ast', files: { 'server-plugin/kernel/c0-undo.mjs': 'export function g(tx) {\n  tx.undo.push(1);\n}\n' }, rowKeys: ['c_pp_undo_push_ast|server-plugin/kernel/c0-undo.mjs|g|call|0'] },
  { itemKey: 'vol27.A27-5.1.float', comp: 'c_pp_float_math_ast2', files: { 'server-plugin/rules-c0-float.mjs': 'export function h(x) {\n  return Math.exp(x);\n}\n' }, rowKeys: ['c_pp_float_math_ast2|server-plugin/rules-c0-float.mjs|h|call|0'] },
  { itemKey: 'vol6.S6-1.read', comp: 'c_pp_ledger_read_ast2', files: { 'server-plugin/rules-c0-ledger.mjs': 'export function k(state) {\n  return state.stockLots;\n}\n' }, rowKeys: ['c_pp_ledger_read_ast2|server-plugin/rules-c0-ledger.mjs|k|member|0'] },
  // 续做：lit_scope pattern、decl_cmp dupExport、path_access readerSet 三种新能力各取代表规则。
  { itemKey: 'vol27.A27-5.1.pp_epsilon', comp: 'c_pp_epsilon_ast2', files: { 'server-plugin/rules-c0-eps.mjs': 'export function q(a) {\n  return a < Number.EPSILON;\n}\n' }, rowKeys: ['c_pp_epsilon_ast2|server-plugin/rules-c0-eps.mjs|q|epsilon:member|0'] },
  { itemKey: 'vol2.S3.pp_deep_clone', comp: 'c_pp_deep_clone_ast', files: { 'server-plugin/rules-c0-clone.mjs': 'export function w(v) {\n  return JSON.parse(JSON.stringify(v));\n}\n' }, rowKeys: ['c_pp_deep_clone_ast|server-plugin/rules-c0-clone.mjs|w|clone:nested|0'] },
  { itemKey: 'vol20.T-3.pp_year_minutes', comp: 'c_pp_year_minutes_ast', files: { 'server-plugin/rules-c0-year.mjs': 'export function e(c) {\n  return c.yearMinutes;\n}\n' }, rowKeys: ['c_pp_year_minutes_ast|server-plugin/rules-c0-year.mjs|e|ident:ident|0'] },
  { itemKey: 'vol27.A27-8.1.pp_seed_args', comp: 'c_pp_seed_args_ast', files: { 'server-plugin/rules-c0-seed.mjs': "export function t(s) {\n  return genDraw(s, 'daily', 1);\n}\n" }, rowKeys: ['c_pp_seed_args_ast|server-plugin/rules-c0-seed.mjs|t|arg:arg0|0'] },
  { itemKey: 'vol27.A27-5.1.pp_dup_export', comp: 'c_pp_dup_export_ast', files: { 'server-plugin/rules-c0-twin-a.mjs': 'export function twinc0() {\n  return 1;\n}\n', 'server-plugin/rules-c0-twin-b.mjs': 'export function twinc0() {\n  return 2;\n}\n' }, rowKeys: ['c_pp_dup_export_ast|server-plugin/rules-c0-twin-a.mjs|twinc0|export|0', 'c_pp_dup_export_ast|server-plugin/rules-c0-twin-b.mjs|twinc0|export|0'] },
  { itemKey: 'vol2.S3.pp_tpl_key', comp: 'c_pp_tpl_key_ast', files: { 'server-plugin/rules-c0-tpl-a.mjs': 'export function ka(w, x, y) {\n  return `${w}#${x}#${y}`;\n}\n', 'server-plugin/rules-c0-tpl-b.mjs': 'export function kb(w, x, y) {\n  return `${y}#${x}#${w}`;\n}\n' }, rowKeys: ['c_pp_tpl_key_ast|server-plugin/rules-c0-tpl-a.mjs|ka:${}#${}#${}|tplkey|0', 'c_pp_tpl_key_ast|server-plugin/rules-c0-tpl-b.mjs|kb:${}#${}#${}|tplkey|0'] },
  { itemKey: 'vol3.S3.pp_unit_literal', comp: 'c_pp_unit_literal_ast', files: { 'server-plugin/rules-c0-unit.mjs': "export function u() {\n  return 'copper';\n}\n" }, rowKeys: ['c_pp_unit_literal_ast|server-plugin/rules-c0-unit.mjs|u|unit:unit|0'] },
  { itemKey: 'vol18.R18-1.10.pp_holdings_read', comp: 'c_pp_holdings_read_ast3', files: { 'server-plugin/rules-c0-hold.mjs': 'export function r(state) {\n  return state.holdings;\n}\n' }, rowKeys: ['c_pp_holdings_read_ast3|server-plugin/rules-c0-hold.mjs|r|member|0'] },
];
const stale = (comp) => `${comp}|server-plugin/stale-c0.mjs|s|call|0`;

const items = readRegistry(ROOT, 'items');
const real = (comp) => {
  const row = accBaseline(ROOT).find((b) => b.compCode === comp);
  assert.ok(row, `基线里要有分量 ${comp}（pre_merge 登记）`);
  return row;
};
// 基线行：入库的真实行，加上若干额外行键（现值按行键数同步）。
const baseRows = (extra) => RULES.map((r) => {
  const row = real(r.comp);
  const keys = [...row.rowKeys, ...extra(r)];
  return { ...row, rowKeys: keys, current: keys.length };
});
const overrides = Object.assign({}, ...RULES.map((r) => r.files));
const run = (opts) => accRun('pre_commit', 'c0', null, { root: ROOT, filter: { itemKey: RULES.map((r) => r.itemKey) }, ...opts });
const failedOf = (report, key) => (report.items.failed.find((f) => f.itemKey === key) || {}).codes;

test('四条规则都登记成 in_core 的 le_baseline 条目，并各有正反两类绕法用例', () => {
  const cases = readRegistry(ROOT, 'cases');
  for (const r of RULES) {
    const it = items.find((x) => x.itemKey === r.itemKey);
    assert.equal(it.state, 'in_core', r.itemKey);
    assert.equal(it.expect, 'le_baseline', r.itemKey);
    assert.equal(it.baseComp, r.comp, r.itemKey);
    const pol = new Set(cases.filter((c) => c.scanClass === it.scanClass).map((c) => c.polarity));
    assert.deepEqual([...pol].sort(), ['must_fail', 'must_pass'], r.itemKey);
  }
});

test('现在就拦：墙钟、本地随机数（甲 R4）与 seed_sites 两条已有条目进必过集合，违例为 0', () => {
  for (const key of ['vol27.S27-3', 'vol27.A27-8.1.a', 'vol27.A27-8.1.b', 'vol27.A27-8.1.c']) {
    const it = items.find((x) => x.itemKey === key);
    assert.equal(it.state, 'in_core', key);
    assert.equal(it.expect, 'zero', key);
  }
});

test('基线机制：新增违例拒（E-ACC-BASELINE-UP），行键不含行号', async () => {
  const { report, rows } = await run({ overrides, baselineRows: baseRows(() => []) });
  for (const r of RULES) {
    assert.deepEqual(failedOf(report, r.itemKey), ['E-ACC-BASELINE-UP'], r.itemKey);
    for (const k of r.rowKeys) assert.ok(rows.some((x) => x.rowKey === k), k);
    assert.equal(report.components[r.comp].current, real(r.comp).rowKeys.length + r.rowKeys.length, r.comp);
  }
});

test('基线机制：新违例已在基线里（持平）过', async () => {
  const { report } = await run({ overrides, baselineRows: baseRows((r) => r.rowKeys) });
  for (const r of RULES) assert.equal(failedOf(report, r.itemKey), undefined, r.itemKey);
});

test('基线机制：基线外的新违例拒，哪怕总数与基线持平', async () => {
  const { report } = await run({ overrides, baselineRows: baseRows((r) => [stale(r.comp)]) });
  for (const r of RULES) assert.deepEqual(failedOf(report, r.itemKey), ['E-ACC-BASELINE-UP'], r.itemKey);
});

test('基线机制：违例比基线少（基线里多出已修掉的行）过', async () => {
  const { report } = await run({ baselineRows: baseRows((r) => [stale(r.comp)]) });
  for (const r of RULES) {
    assert.equal(failedOf(report, r.itemKey), undefined, r.itemKey);
    assert.ok(report.components[r.comp].current < report.components[r.comp].last, r.comp);
  }
});

test('C0 全部新登条目（类别 pp_ 开头与前四类）：in_core，每类各有必报与必不报两种绕法用例，必报用例带期望码', () => {
  const cases = readRegistry(ROOT, 'cases');
  // 待人审清单 pp_dynamic_review 是 report_only，只报不拦，不进必过集合。
  const pp = items.filter((it) => /^pp_|^(timer_global|undo_raw_push|float_math|ledger_state_read)$/.test(it.scanClass || '') && it.expect !== 'report_only');
  assert.ok(pp.length >= 22);
  for (const it of pp) {
    assert.equal(it.state, 'in_core', it.itemKey);
    assert.ok(it.expect === 'zero' || (it.expect === 'le_baseline' && it.baseComp), it.itemKey);
    const mine = cases.filter((c) => c.scanClass === it.scanClass);
    assert.ok(mine.some((c) => c.polarity === 'must_fail' && c.expectCode), `${it.itemKey} 缺必报用例`);
    assert.ok(mine.some((c) => c.polarity === 'must_pass'), `${it.itemKey} 缺必不报用例`);
  }
});

test('零违例档的生成器调用者规则（乙 9）：生成器函数在 world-create.mjs 之外被 import 即拒，码 E-VIEW-BYPASS', async () => {
  const key = 'vol10.S10-3.pp_gen_callers';
  assert.equal(items.find((x) => x.itemKey === key).expect, 'zero');
  const bad = { 'server-plugin/rules-c0-gen.mjs': "import { generateFill } from './kernel/gen/worldgen.mjs';\nexport const g = generateFill;\n" };
  const { report } = await accRun('pre_commit', 'c0', null, { root: ROOT, filter: { itemKey: [key] }, overrides: bad });
  assert.deepEqual(failedOf(report, key), ['E-VIEW-BYPASS']);
  const ok = await accRun('pre_commit', 'c0', null, { root: ROOT, filter: { itemKey: [key] } });
  assert.equal(failedOf(ok.report, key), undefined);
});

test('独立验收补漏：换写法（别名、解构、下标、globalThis、bind）取超越函数、计时器、墙钟、随机数仍被拦', async () => {
  const cases = [
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a1.mjs', "const { sqrt: s } = Math;\nexport function f(x) {\n  return s(x);\n}\n", ['E-ACC-BASELINE-UP']],
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a2.mjs', "export function f(x) {\n  return Math['cbrt'](x);\n}\n", ['E-ACC-BASELINE-UP']],
    ['vol27.S27-3.timer', 'server-plugin/rules-c0-a3.mjs', 'export function f(g) {\n  return globalThis.setInterval(g, 1);\n}\n', ['E-ACC-BASELINE-UP']],
    ['vol27.S27-3', 'server-plugin/rules-c0-a4.mjs', 'const tick = Date.now.bind(Date);\nexport function f() {\n  return tick();\n}\n', ['E-GLOBAL-UNLISTED']],
    ['vol27.A27-8.1.a', 'server-plugin/rules-c0-a5.mjs', 'const { random } = Math;\nexport function f() {\n  return random();\n}\n', ['E-SEED-KEY']],
    // 语法树才跟得到的写法：经形参、对象成员、函数返回值、赋值别名传递，运行期才知道的下标（待人审）。
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a6.mjs', 'function run(fn, v) {\n  return fn(v);\n}\nexport const f = (x) => run(Math.sqrt, x);\n', ['E-ACC-BASELINE-UP']],
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a7.mjs', 'const o = { go: Math.pow };\nexport const f = (x) => o.go(x, 2);\n', ['E-ACC-BASELINE-UP']],
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a8.mjs', 'let g;\ng = Math.sqrt;\nexport const f = (x) => g(x);\n', ['E-ACC-BASELINE-UP']],
    ['vol27.A27-5.1.float', 'server-plugin/rules-c0-a9.mjs', 'export const f = (k, x) => Math[k](x);\n', ['E-ACC-BASELINE-UP']],
    ['vol27.S27-4.pp_eval', 'server-plugin/rules-c0-b1.mjs', 'export const run = (code) => globalThis.eval(code);\n', ['E-GLOBAL-UNLISTED']],
    ['vol12.S12-12.pp_no_acorn_runtime', 'server-plugin/rules-c0-b2.mjs', "import * as parser from 'acorn';\nexport const p = parser;\n", ['E-VIEW-BYPASS']],
  ];
  for (const [key, file, src, codes] of cases) {
    const { report } = await accRun('pre_commit', 'c0', null, { root: ROOT, filter: { itemKey: [key] }, overrides: { [file]: src } });
    assert.deepEqual(failedOf(report, key), codes, `${key} ${file}`);
  }
});

// ---------- 入口生产调用者报告 ----------

const DATA = {
  codeRoot: 'server-plugin/',
  reachRoot: 'server-plugin/index.mjs',
  entries: [
    { name: 'alpha', file: 'server-plugin/a.mjs', via: 'import' },
    { name: 'beta', file: 'server-plugin/b.mjs', via: 'import' },
    { name: 'gamma', file: 'server-plugin/c.mjs', via: 'import' },
    { name: 'delta', file: 'server-plugin/d.mjs', via: 'import' },
    { name: 'epsilon', file: 'server-plugin/e.mjs', via: 'member' },
  ],
};
const VIRTUAL = {
  'server-plugin/index.mjs': "import { alpha as first } from './a.mjs';\nimport { host } from './e.mjs';\nexport function init() {\n  first(1);\n  first(2);\n  host().epsilon(3);\n}\n",
  'server-plugin/a.mjs': 'export function alpha(x) {\n  return x;\n}\n',
  'server-plugin/b.mjs': 'export function beta() {}\n',
  'server-plugin/orphan.mjs': "import { beta } from './b.mjs';\nexport function g() {\n  return beta();\n}\n",
  'server-plugin/c.mjs': 'export function gamma() {}\n',
  'server-plugin/d.mjs': 'export const other = 1;\n',
  'server-plugin/e.mjs': 'export function host() {\n  return { epsilon(v) { return v; } };\n}\n',
  'tests/decoy.mjs': "import { gamma } from '../server-plugin/c.mjs';\ngamma();\n",
};

test('入口报告：定义、调用点、可达四种状态各一例；测试目录里的调用不计', () => {
  const ctx = loadContext(ROOT, { files: Object.keys(VIRTUAL).sort(), read: (p) => VIRTUAL[p] });
  const byName = Object.fromEntries(entryTable(ctx, DATA).map((r) => [r.name, r]));
  assert.deepEqual([byName.alpha.status, byName.alpha.callSites, byName.alpha.callerFiles, byName.alpha.reachableCallerFiles], ['ok', 2, 1, 1]);
  assert.deepEqual([byName.beta.status, byName.beta.callSites, byName.beta.reachableCallerFiles], ['unreachable', 1, 0]);
  assert.deepEqual([byName.gamma.status, byName.gamma.callSites], ['no-caller', 0]);
  assert.equal(byName.delta.status, 'no-def');
  assert.deepEqual([byName.epsilon.status, byName.epsilon.callSites], ['ok', 1]);
});
