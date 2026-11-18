// P-1 检测器单项：每个检测器正反两极性（卷十二 R12-13.3），计数按 R12-1.3、R12-4.2 的"换写法不少计、只计一次"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, prefixesFromDir, mergePrefixes, readRegistry, LAYOUT } from '../../tools/accept/read.mjs';
import { detect as litScope } from '../../tools/accept/detectors/lit_scope.mjs';
import { detect as ledgerCount } from '../../tools/accept/detectors/ledger_count.mjs';
import { detect as importEdge } from '../../tools/accept/detectors/import_edge.mjs';
import { detect as pathAccess } from '../../tools/accept/detectors/path_access.mjs';
import { detect as callEdge } from '../../tools/accept/detectors/call_edge.mjs';
import { detect as docStruct, definedNumbers } from '../../tools/accept/detectors/doc_struct.mjs';
import { detect as dataShape } from '../../tools/accept/detectors/data_shape.mjs';
import { detect as declCmp } from '../../tools/accept/detectors/decl_cmp.mjs';
import { REGISTERED_CODES } from '../../server-plugin/kernel/error-codes.mjs';
import { ENUM } from '../../tools/accept/lib/item-form.mjs';
import { tempRepo } from './temp-repo.mjs';
import { testTempRoot, writeUnderTempRoot, assertRelUnderTempRoot } from './temp-root.mjs';
import { repoRoot, safeSegment } from '../../tools/path-segment.mjs';
import { relative, isAbsolute } from 'node:path';
import { realpathSync, rmSync, readFileSync, existsSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIX = mergePrefixes(prefixesFromDir(join(ROOT, LAYOUT.bypassDimsDir)));
const RT = ['rules', 'kernel', 'textcore', 'inputEdge', 'gate', 'outputGate', 'aiGate', 'assembly', 'host', 'display', 'clientTextcore'];
const CLS = Object.fromEntries(readRegistry(ROOT, 'scanclasses').map((r) => [r.scanClass, r]));

function ctxOf(map) {
  const files = new Map(Object.entries(map));
  return loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p), prefixes: FIX });
}
const ids = (src, extra = {}) => litScope(ctxOf({ 'server-plugin/a.mjs': src, ...extra }), { groups: RT, literal: 'entityPrefix' }, CLS.instance_name);
const nums = (src) => litScope(ctxOf({ 'server-plugin/a.mjs': src }), { groups: RT, literal: 'number' }, CLS.const_literal);
const edges = (map, codes) => importEdge(ctxOf(map), { groups: RT, codes: codes || ['E-KERNEL-UPWARD-IMPORT', 'E-VIEW-INPUT-IMPORT', 'E-TEXTCORE-IMPORT', 'E-PROC-IMPORT', 'E-GLOBAL-UNLISTED', 'E-TSC-PARSE'] });
const forks = (src) => pathAccess(ctxOf({ 'server-plugin/a.mjs': src }), { groups: ['rules', 'kernel'], paths: ['metadata.format', 'version', '*Version', 'legacy'], access: 'branch', code: 'E-REPLAY-VERSION-BRANCH' });

test('lit_scope 实体前缀：各种写法到达同一值各计一次', () => {
  assert.equal(ids("const a = 'fxa_oats';").length, 1);
  assert.equal(ids("const a = 'fxa_' + 'oats';").length, 1);
  assert.equal(ids('const f = (n) => `fxa_${n}`;').length, 1);
  assert.equal(ids('const k = String.fromCharCode(102, 120, 97, 95, 113);').length, 1);
  assert.equal(ids("const h = 'fx'; const id = h + 'a_beta'; if (x === id) y();").length, 1);
  assert.equal(ids("const a = ['fxa', 'b'].join('_');").length, 1);
  assert.equal(ids("const a = 'fxa_\\x71';").length, 1);
  assert.equal(ids("if (who === 'fxsolo') go();").length, 1);
  assert.equal(ids("const a = cond ? 'fxa_a' : 'fxa_b';").length, 2);
});

test('lit_scope 实体前缀：跨文件常量在定义处计，范围外文件在 import 处计', () => {
  const inScope = ids("import { R } from './c.mjs'; const id = R;", { 'server-plugin/c.mjs': "export const R = 'fxa_q';" });
  assert.equal(inScope.length, 1);
  assert.equal(inScope[0].file, 'server-plugin/c.mjs');
  const outScope = ids("import { R } from '../tools/c.mjs'; const id = R;", { 'tools/c.mjs': "export const R = 'fxa_q';" });
  assert.deepEqual(outScope.map((h) => [h.file, h.nodeKind]), [['server-plugin/a.mjs', 'import']]);
});

test('lit_scope 实体前缀：不该报的不报', () => {
  assert.equal(ids("// 'fxa_oats' 在注释里\nconst t = 'fxaoats'; const l = 'pre fxa_';").length, 0);
  assert.equal(ids("import { h } from './fxa_helpers.mjs';\nexport { h };").length, 0);
  assert.equal(ids("const a = 'fxsolo2';").length, 0);
});

test('lit_scope 数值：常量折叠后不在白名单即计，白名单内不计', () => {
  assert.equal(nums('const m = 60 * 24;').length, 1);
  assert.equal(nums('const m = x * 60 * 24;').length, 2);
  assert.equal(nums('const m = x + 60 * 24;').length, 1);
  assert.equal(nums('const a = arr[2];').length, 1);
  assert.equal(nums('const n = [0, 0, 0].length;').length, 1);
  assert.equal(nums('const b = 300n;').length, 1);
  assert.equal(nums('const s = 1 << 4;').length, 1);
  assert.equal(nums('const s = 1 + 1;').length, 1);
  assert.equal(nums('const h = Math.floor(x / 2);').length, 1);
  assert.equal(nums('const s = `t${2}`;').length, 1);
  assert.equal(nums('if (a.length > 0 && a[0] === x) y = n - 1; z = n === -1 ? 1 : 0;').length, 0);
  assert.equal(nums('const r = /a{2}/; // 9 in a comment\n const s = "7";').length, 0);
});

test('import_edge：按声明表的矩阵判，违例码各归其位', () => {
  const one = (map) => edges(map).map((h) => h.code);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "import { x } from '../thing.mjs';" }), ['E-KERNEL-UPWARD-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "import { x } from '../textcore/t.mjs';" }), ['E-KERNEL-UPWARD-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "import { x } from './textcore/t.mjs';" }), ['E-TEXTCORE-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "import { x } from './gate/s.mjs';" }), ['E-VIEW-INPUT-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "import { x } from './legacy/o.mjs';" }), ['E-PROC-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "const m = await import('../tools/accept/run.mjs');" }), ['E-GLOBAL-UNLISTED']);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "const m = await import('./b.mjs');" }), ['E-GLOBAL-UNLISTED']);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "import { b } from './b.mjs';" }), []);
  assert.deepEqual(one({ 'extension/v.mjs': "import { k } from '../server-plugin/kernel/k.mjs';" }), ['E-PROC-IMPORT']);
  assert.deepEqual(one({ 'extension/host/h.mjs': "import { g } from '../../server-plugin/gate/s.mjs';" }), ['E-PROC-IMPORT']);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "import fs from 'fs';" }), ['E-GLOBAL-UNLISTED']);
  assert.deepEqual(one({ 'server-plugin/kernel/a.mjs': "import fs from 'node:fs';" }), ['E-GLOBAL-UNLISTED']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "const m = await import(name);" }), ['E-GLOBAL-UNLISTED']);
  assert.deepEqual(one({ 'server-plugin/r.mjs': "import t from '../world/rules/x.json' with { type: 'json' };" }), ['E-TSC-PARSE']);
  assert.deepEqual(one({ 'extension/x.mjs': "import { c } from '../../../extensions.js';" }), ['E-GLOBAL-UNLISTED']);
});

test('import_edge：矩阵允许的不报', () => {
  assert.equal(edges({ 'server-plugin/kernel/load/a.mjs': "import fs from 'node:fs'; import { b } from '../b.mjs';" }).length, 0);
  assert.equal(edges({ 'server-plugin/kernel/validate/narrow.mjs': "import Ajv from 'ajv';" }).length, 0);
  assert.equal(edges({ 'server-plugin/r.mjs': "import { d } from './kernel/dimensions.mjs'; export * from './s.mjs';" }).length, 0);
  assert.equal(edges({ 'extension/host/bootstrap.mjs': "import { c } from '../../../extensions.js'; import { p } from '../panel.mjs';" }).length, 0);
  assert.equal(edges({ 'server-plugin/output-gate/o.mjs': "import { s } from '../gate/screen.mjs'; import { t } from '../textcore/labels.mjs';" }).length, 0);
  assert.equal(edges({ 'tools/x.mjs': "import { k } from '../server-plugin/kernel/k.mjs';" }).length, 0);
});

test('path_access 版本分叉：读到并据此分支才计', () => {
  assert.equal(forks("if (doc.metadata.format === 'x') return;").length, 1);
  assert.equal(forks('return save.worldVersion > a ? a : b;').length, 1);
  assert.equal(forks("switch (s.replay['version']) { case 1: break; }").length, 1);
  assert.equal(forks('const ok = !doc.legacy;').length, 1);
  assert.equal(forks('if (doc.rulesDigest === d) return doc.formatted;').length, 0);
  assert.equal(forks('const v = doc.metadata.version;').length, 0);
  assert.equal(forks('if (version === 2) go();').length, 0);
});

test('lit_scope 登记豁免（卷二 S10）：只豁免登记文件里、登记表有同文件同值行的常数', () => {
  const table = 'world/rules/tables/kernel-constants.json';
  const rows = JSON.stringify({ rows: [{ key: 'S', value: 10000, file: 'server-plugin/kernel/det-math.mjs' }] });
  const src = 'export const S = 10000n; const z = x * 77;';
  const run = (map) => litScope(ctxOf(map), { groups: RT, literal: 'number' }, CLS.const_literal).length;
  assert.equal(run({ 'server-plugin/kernel/det-math.mjs': src, [table]: rows }), 1);
  assert.equal(run({ 'server-plugin/kernel/other.mjs': src, [table]: rows }), 2);
  assert.equal(run({ 'server-plugin/kernel/det-math.mjs': src }), 2);
});

test('import_edge 成员闭集：按 filesList 清单判，清单外的组内文件计 E-FILE-UNASSIGNED', () => {
  const files = { 'server-plugin/kernel/a.mjs': 'export const a = 0;', 'server-plugin/kernel/load/b.mjs': 'export const b = 0;' };
  const unassigned = (map) => edges(map, ['E-FILE-UNASSIGNED']).map((h) => h.file);
  assert.deepEqual(unassigned({ ...files, 'server-plugin/kernel/files.json': '["server-plugin/kernel/a.mjs"]' }), ['server-plugin/kernel/load/b.mjs']);
  assert.deepEqual(unassigned({ ...files, 'server-plugin/kernel/files.json': '["server-plugin/kernel/a.mjs","server-plugin/kernel/load/b.mjs"]' }), []);
  assert.deepEqual(unassigned(files), ['server-plugin/kernel/a.mjs', 'server-plugin/kernel/load/b.mjs']);
});

test('import_edge 声明文件（卷二 §2.9 第 2 条）：.d.ts 不算模块文件、不报 E-FILE-UNASSIGNED，未登记的 .mjs 仍报', () => {
  const unassigned = (map) => edges(map, ['E-FILE-UNASSIGNED']).map((h) => h.file);
  const map = { 'server-plugin/kernel/a.mjs': 'export const a = 0;', 'server-plugin/kernel/types.d.ts': 'export type T = string;', 'server-plugin/kernel/files.json': '["server-plugin/kernel/a.mjs"]' };
  assert.deepEqual(unassigned(map), []);
  assert.deepEqual(unassigned({ ...map, 'server-plugin/kernel/b.mjs': 'export const b = 0;' }), ['server-plugin/kernel/b.mjs']);
  assert.deepEqual(unassigned({ ...map, 'server-plugin/kernel/c.d.mts': 'export type U = number;' }), []);
});

test('doc_struct 编号口径（裁定二）：只数定义处；引用、"第 n 条"、条文中间的编号不算；编号族来自登记数据', () => {
  const text = ['| V-1 | 条 |', '| **V-2** | 条 |', '### V-3 标题', '**V-8 分阶段**：见 V-4', '- V-5 列表项', '见 V-6 与 R-6 第 5 条', 'V-7 普通段落开头', '| 条 | V-9 在非首列 |', '| S12-1 | 别的族 |', '| V-1 | 重复定义 |'].join('\n');
  assert.deepEqual([...definedNumbers(text, ['V-']).entries()], [['V-1', 1], ['V-2', 2], ['V-3', 3], ['V-8', 4], ['V-5', 5]]);
  assert.deepEqual([...definedNumbers(text, ['S12-']).keys()], ['S12-1']);
  assert.equal(definedNumbers(text, []).size, 0);
});

test('doc_struct 形式名前缀（裁定一）：只有列表项开头"登记的形式名＋全角冒号＋编号"算定义处，形式名来自登记数据', () => {
  const text = ['- 扫描式：A12-1.1 条', '- 不变量式：A12-1.2 条', '  - 流程式：A12-1.3', '- 某某式：A12-2.1 别的名', '- 扫描式:A12-2.2 半角冒号', '扫描式：A12-2.3 非列表项', '见 扫描式：A12-2.4', '- 扫描式：见 A12-2.5'].join('\n');
  const names = ['扫描式', '不变量式', '扩展性式', '流程式'];
  assert.deepEqual([...definedNumbers(text, ['A12-'], names).keys()], ['A12-1.1', 'A12-1.2', 'A12-1.3']);
  assert.equal(definedNumbers(text, ['A12-']).size, 0);
  assert.equal(definedNumbers(text, ['A12-'], ['别的']).size, 0);
});

test('doc_struct 列表项开头（裁定二）：列表符或加粗后紧跟编号才算，对所有族一样；别的字在前不算', () => {
  const text = ['- S1 列表项', '* S2 星号列表', '1. S3 有序列表', '- **S4** 加粗', '- 说明 S5', '- (S6)', '段落中 S7 引用', '- `S8` 反引号', '- 扫描式：`S9`'].join('\n');
  assert.deepEqual([...definedNumbers(text, ['S']).keys()], ['S1', 'S2', 'S3', 'S4']);
  assert.equal(definedNumbers('- 扫描式：`S9`', ['S'], ['扫描式']).size, 0);
});

test('lit_scope 修正键族（卷二 S8、§3.1 :1290）：按 <kind>.<dimension>[<key>] 键形与数值类型判，裸维度名不报', () => {
  const dims = 'world/ontology/dimensions/fx.json';
  const table = JSON.stringify({ kind: 'fx', dimensions: {
    fxSharpness: { type: 'number', modifiable: true },
    fxFixed: { type: 'number', modifiable: false },
    fxLabel: { type: 'string', modifiable: true },
    fxFlag: { type: 'boolean', modifiable: true },
    fxWeights: { type: 'map', value: { type: 'number' }, key: { type: 'integer' }, modifiable: true },
    fxSeed: { type: 'map', value: { type: 'number' }, key: { type: 'string', vocab: 'fxseed' }, modifiable: true },
  } });
  const run = (src, extra = {}) => litScope(ctxOf({ 'server-plugin/a.mjs': src, [dims]: table, ...extra }), { groups: RT, literal: 'modifierKey' }, CLS.instance_name).length;
  assert.equal(run("const k = 'fx.fxSharpness';"), 1);
  assert.equal(run("const k = 'fx.' + 'fxSharpness';"), 1);
  assert.equal(run("const k = 'fx.fxWeights[3]';"), 1);
  assert.equal(run("const k = 'fxSharpness';"), 0); // 裸维度名不是修正键
  assert.equal(run("const k = 'fxSharp' + 'ness';"), 0);
  assert.equal(run('const k = `fx${n}`;'), 0);
  assert.equal(run("const k = 'fx.fxFixed';"), 0); // 不可修改
  assert.equal(run("const k = 'fx.fxLabel';"), 0); // 数值类型以外
  assert.equal(run("const k = 'fx.fxFlag';"), 0);
  assert.equal(run("const k = 'fx.fxWeights';"), 0); // map 维度要下标
  assert.equal(run("const k = 'zz.fxSharpness';"), 0); // 没登记的 kind
  // 卷二 :1290：map 下标须是登记词表代号。夹具自造小词表（不动 world/），已登记代号算修正键（must_fail 极性，必须报），
  // 未登记代号不算（must_pass 极性，必须不报）；没有词表登记时不得凭键形放行。
  const vocab = 'world/ontology/dimensions/_vocab.json';
  const vocabDoc = JSON.stringify({ families: {
    fxseed: { prefix: 'fxv_', entries: { fxv_alpha: {} } },
    fxother: { prefix: 'fxo_', entries: { fxo_beta: {} } },
  } });
  const seedRun = (src) => litScope(ctxOf({ 'server-plugin/a.mjs': src, [dims]: table, [vocab]: vocabDoc }), { groups: RT, literal: 'modifierKey' }, CLS.instance_name).length;
  assert.equal(seedRun("const k = 'fx.fxSeed[fxv_alpha]';"), 1);
  assert.equal(seedRun("const k = 'fx.fxSeed[fxv_missing]';"), 0);
  assert.equal(seedRun("const k = 'fx.fxSeed[fxo_beta]';"), 0); // 别的族的代号也不行（键定义写的是 fxseed 族）
  assert.equal(run("const k = 'fx.fxSeed[fxv_alpha]';"), 0); // 被查内容里没有词表登记：核不了代号，不算
  assert.equal(run("// 'fx.fxSharpness' 在注释里\nconst k = 'fx.fxSharpnes';"), 0);
  assert.equal(litScope(ctxOf({ 'server-plugin/a.mjs': "const k = 'fx.fxSharpness';" }), { groups: RT, literal: 'modifierKey' }, CLS.instance_name).length, 0);
  // 卷二 §3.6：body_plan 表头的 capabilities 段注册为 body.<capability>。
  const body = JSON.stringify({ kind: 'body_plan', capabilities: { moving: { type: 'number', modifiable: true } }, dimensions: {} });
  const bodyRun = (src) => litScope(ctxOf({ 'server-plugin/a.mjs': src, 'world/ontology/dimensions/body_plan.json': body }), { groups: RT, literal: 'modifierKey' }, CLS.instance_name).length;
  assert.equal(bodyRun("const k = 'body.moving';"), 1);
  assert.equal(bodyRun("const k = 'body.unknown';"), 0);
  assert.equal(bodyRun("const k = 'moving';"), 0);
  // 卷二 §3.7：derived-process.json 的 slots 注册为 process.<slot>。
  const proc = 'world/rules/tables/derived-process.json';
  const procTable = JSON.stringify({ slots: { price: {}, wage: {} } });
  const procRun = (src) => litScope(ctxOf({ 'server-plugin/a.mjs': src, [proc]: procTable }), { groups: RT, literal: 'modifierKey' }, CLS.instance_name).length;
  assert.equal(procRun("const k = 'process.price';"), 1);
  assert.equal(procRun("const k = 'process.unknown';"), 0);
});

test('ledger_count 基线单调（V-11、E-ACC-BASELINE-UP）：当次现值高于上次合入的值即计一条，一分量一条；不读 out/ 下的记录', () => {
  const run = (components, baseline, files = {}) => ledgerCount({ ...ctxOf(files), gateState: { components, baseline } }, { cond: 'baselineMonotone', code: 'E-ACC-BASELINE-UP' });
  assert.equal(run({ c_instance_id: 3 }, { c_instance_id: 2 }).length, 1);
  assert.equal(run({ c_instance_id: 3 }, { c_instance_id: 3 }).length, 0);
  assert.equal(run({ c_instance_id: 2 }, { c_instance_id: 3 }).length, 0);
  assert.equal(run({ c_instance_id: 5 }, {}).length, 1);
  assert.equal(run({ c_instance_id: 0 }, {}).length, 0);
  assert.deepEqual(run({ c_instance_id: 3, c_id_parse: 1, c_other: 0 }, { c_instance_id: 2, c_id_parse: 0, c_other: 0 }).map((h) => h.symbolPath), ['c_id_parse', 'c_instance_id']);
  // out/ 下有旧的上升记录，当次不升：不误挡。
  const old = JSON.stringify({ components: { c_instance_id: { last: 2, current: 3 } } });
  assert.equal(run({ c_instance_id: 3 }, { c_instance_id: 3 }, { 'tools/accept/out/p/pre_merge.json': old }).length, 0);
  // 没有 gateState 不静默放行。
  assert.throws(() => ledgerCount(ctxOf({}), { cond: 'baselineMonotone' }), /gateState/);
});

test('item_ledger 登记的形式名与 acc_form 的四个值一一对应', () => {
  const row = loadContext(ROOT).regs.scanclasses.find((c) => c.scanClass === 'item_ledger');
  assert.deepEqual(Object.keys(row.formNames).sort(), [...ENUM.form].sort());
});

test('doc_struct 三项：登记表缺的、定义处缺的、条数不等的卷各自报码', () => {
  const doc = 'docs/v.md';
  const cls = { docVolumes: { vx: doc, vy: 'docs/none.md' }, docFamilies: { vx: ['X-'], vy: ['Y-'] } };
  const run = (items, text) => docStruct(ctxOf({ [doc]: text, 'tools/accept/items.json': JSON.stringify({ rows: items }) }), { checks: ['orphan', 'unregistered', 'count'] }, cls).map((h) => `${h.code} ${h.symbolPath}`).sort();
  const row = (no) => ({ itemKey: `vx.${no}`, localNo: no, volume: 'vx' });
  assert.deepEqual(run([row('X-1'), row('X-2')], '| X-1 | a |\n| X-2 | b |'), []);
  assert.deepEqual(run([row('X-1')], '| X-1 | a |\n| X-2 | b |'), ['E-ACC-ITEM-COUNT vx', 'E-ACC-ITEM-UNREGISTERED vx.X-2']);
  assert.deepEqual(run([row('X-1'), row('X-9')], '| X-1 | a |\n见 X-9'), ['E-ACC-ITEM-COUNT vx', 'E-ACC-ITEM-ORPHAN vx.X-9']);
  assert.deepEqual(run([{ ...row('Y-1'), volume: 'vy' }], '| X-1 | a |'), ['E-ACC-ITEM-COUNT vx', 'E-ACC-ITEM-ORPHAN vx.Y-1', 'E-ACC-ITEM-UNREGISTERED vx.X-1']);
});

test('call_edge 测试临时根：路径落在临时根加常量相对路径内才不计', () => {
  const head = "import { join } from 'node:path';\nimport { writeFileSync } from 'node:fs';\nimport { testTempRoot } from '../tests/accept/temp-root.mjs';\n";
  const run = (body) => callEdge(ctxOf({ 'tools/x.mjs': head + body }), { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'] }, CLS.registry_write).length;
  assert.equal(run("const d = testTempRoot(); writeFileSync(join(d, 'tools/accept/items.json'), 'x');"), 0);
  assert.equal(run("const d = testTempRoot(); const p = join(d, 'a'); writeFileSync(p, 'x');"), 1);
  assert.equal(run("const d = testTempRoot(); writeFileSync(join(d, '../a'), 'x');"), 1);
  assert.equal(run("const d = testTempRoot(); const d = 1; writeFileSync(join(d, 'a'), 'x');"), 1);
  assert.equal(run("let d = testTempRoot(); d = '/etc'; writeFileSync(join(d, 'a'), 'x');"), 1);
  assert.equal(run("let d = testTempRoot(); d += '..'; writeFileSync(join(d, 'a'), 'x');"), 1);
  assert.equal(run("let d = testTempRoot(); d++; writeFileSync(join(d, 'a'), 'x');"), 1);
  assert.equal(run("let d = testTempRoot(); writeFileSync(join(d, 'a'), 'x'); d ||= '/';"), 1);
  assert.equal(run("writeFileSync(join(testTempRoot(), 'a'), 'x');"), 1);
  assert.equal(callEdge(ctxOf({ 'tools/x.mjs': head + "const d = testTempRoot(); writeFileSync(join(d, 'a'), 'x');" }), { groups: ['offline'], callers: [], callees: ['registry_write'] }, CLS.registry_write).length, 1);
});

test('call_edge 写函数豁免（裁定四收窄）：只豁免 assertedWriters 里先调用断言再写入的函数体；缺断言、断言在写入后、tempRepo/testTempRoot 体内写入、同文件别的函数、别的文件同名函数都照计', () => {
  const head = "import { writeFileSync } from 'node:fs';\nfunction assertRelUnderTempRoot(r, p) { return p; }\n";
  const fn = (name, inner) => `${head}export function ${name}(r, p, d) { ${inner} }\n`;
  const run = (file, src) => callEdge(ctxOf({ [file]: src }), { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'] }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length;
  const T = 'tests/accept/temp-root.mjs';
  const ok = 'const n = assertRelUnderTempRoot(r, p); writeFileSync(n, d);';
  assert.equal(run(T, fn('writeUnderTempRoot', ok)), 0);
  assert.equal(run(T, fn('writeUnderTempRoot', 'writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'writeFileSync(p, d); assertRelUnderTempRoot(r, p);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'if (d) { assertRelUnderTempRoot(r, p); } writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'assertNotListed(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'obj.assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'if (d) assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'd && assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const f = () => assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'if (d) { x(); } const n = assertRelUnderTempRoot(r, p); writeFileSync(n, d);')), 0);
  // 裁定①：写入的路径实参须用到断言返回值绑定的变量；不绑返回值、字面量路径、别的变量、重新赋值后都照计。
  assert.equal(run(T, fn('writeUnderTempRoot', 'assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); writeFileSync("tools/accept/items.json", d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); writeFileSync(n, d); writeFileSync(p, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); n = p; writeFileSync(n, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); writeFileSync(o.n, d);')), 1);
  assert.equal(run(T, fn('writeUnderTempRoot', 'const n = assertRelUnderTempRoot(r, p); mkdirSync(dirname(n)); writeFileSync(n, d);')), 0);
  assert.equal(run(T, fn('tempRepo', ok)), 1);
  assert.equal(run(T, fn('testTempRoot', ok)), 1);
  assert.equal(run(T, fn('otherWriter', ok)), 1);
  assert.equal(run(T, `${fn('writeUnderTempRoot', ok)}export function other(p, d) { writeFileSync(p, d); }\n`), 1);
  assert.equal(run('tests/accept/x.test.mjs', fn('writeUnderTempRoot', ok)), 1);
  const noDecl = `import { writeFileSync } from 'node:fs';\nexport function writeUnderTempRoot(r, p, d) { assertRelUnderTempRoot(r, p); writeFileSync(p, d); }\n`;
  assert.equal(run(T, noDecl), 1);
});

test('call_edge 写函数豁免"用到"（李白 11-17 收紧）：实参是绑定变量本身、或从它往下拼常量段才通过；带 .. 、dirname、非常量段、别的调用都判不过', () => {
  const head = "import { writeFileSync } from 'node:fs';\nimport { join, resolve, dirname } from 'node:path';\nfunction assertRelUnderTempRoot(r, p) { return p; }\n";
  const run = (w) => callEdge(ctxOf({ 'tests/accept/temp-root.mjs': `${head}export function writeUnderTempRoot(r, p, d) { const full = assertRelUnderTempRoot(r, p); ${w} }\n` }),
    { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'] }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length;
  assert.equal(run('writeFileSync(full, d);'), 0);
  assert.equal(run("writeFileSync(join(full, 'sub.json'), d);"), 0);
  assert.equal(run("writeFileSync(resolve(full, 'a', 'b.json'), d);"), 0);
  assert.equal(run("writeFileSync(join(full, '..', 'x'), d);"), 1);
  assert.equal(run("writeFileSync(join(full, 'a/../../x'), d);"), 1);
  assert.equal(run("writeFileSync(join(full, '/etc/x'), d);"), 1);
  assert.equal(run('writeFileSync(dirname(full), d);'), 1);
  assert.equal(run("writeFileSync(join(dirname(full), 'x'), d);"), 1);
  assert.equal(run('writeFileSync(join(full, p), d);'), 1);
  assert.equal(run("writeFileSync(join('a', full), d);"), 1);
  assert.equal(run("writeFileSync(other(full, 'x'), d);"), 1);
  assert.equal(run("writeFileSync(full + '/x', d);"), 1);
});

test('writeUnderTempRoot 与断言函数（裁定四）：判据名取自登记数据，真实 temp-root.mjs 的写函数通过 call_edge，且体内先调用登记的断言', () => {
  const ctx = loadContext(ROOT);
  const fac = ctx.regs.gatefacs.find((g) => g.facCode === 'test-temp-root');
  assert.deepEqual(fac.assertedWriters, ['writeUnderTempRoot']);
  assert.deepEqual(fac.writerAsserts, ['assertRelUnderTempRoot']);
  const hits = callEdge(ctx, { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'] }, CLS.registry_write);
  assert.deepEqual(hits.filter((h) => h.file === 'tests/accept/temp-root.mjs'), []);
});

test('必跑测试（李白 11-17 裁定②）：登记的断言应抛错测试存在、在门禁运行的测试集合里、未跳过；删除、skip、todo、only、套进分支都判不过', () => {
  const ctx = loadContext(ROOT);
  const fac = ctx.regs.gatefacs.find((g) => g.facCode === 'test-temp-root');
  const params = { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'], code: 'E-ACC-REGISTRY-WRITE' };
  const req = fac.requiredTests[0];
  assert.ok(req.names.length >= 3);
  const bad = (c) => callEdge(c, params, CLS.registry_write).filter((h) => h.nodeKind === 'test');
  assert.deepEqual(bad(ctx), []);
  const src = ctx.read(req.file);
  const withSrc = (s) => ({ ...ctx, read: (p) => (p === req.file ? s : ctx.read(p)) });
  const title = req.names[0];
  const line = src.split('\n').find((l) => l.startsWith(`test('${title}`));
  assert.ok(line, 'required test line');
  assert.deepEqual(bad(withSrc(src.replace(line, line.replace(title, 'renamed')))).map((h) => h.symbolPath), [title]);
  assert.equal(bad(withSrc(src.replace(line, line.replace("test('", "test.skip('")))).length, 1);
  assert.equal(bad(withSrc(src.replace(line, line.replace("test('", "test.todo('")))).length, 1);
  assert.equal(bad(withSrc(src.replace(line, line.replace("', () =>", "', { skip: true }, () =>")))).length, 1);
  assert.equal(bad(withSrc(src.replace(line, `if (false) { ${line}`))).length >= 1, true);
  assert.equal(bad(withSrc(src.replace(line, `if (false) ${line}`))).length, 1);
  // 本文件里登记的必跑测试名共 5 个：test-temp-root 的 3 个加 offline-path-segment 的 2 个（李白 11-17 21:2x 裁定一）。
  assert.equal(bad(withSrc(src + "\ntest.only('x', () => {});\n")).length, 5);
  assert.equal(bad(withSrc(src.replace("from 'node:test'", "from 'node:other'"))).length, 5);
  // 文件不在被扫文件里、或不在 testGlobs 内，也判不过。
  assert.equal(bad({ ...ctx, files: ctx.files.filter((f) => f !== req.file) }).length, 2); // 两个 gatefac 行各登记了该文件
  const noGlob = { ...ctx, regs: { ...ctx.regs, gatefacs: ctx.regs.gatefacs.map((g) => (g.facCode === fac.facCode ? { ...g, testGlobs: ['tests/other/*.mjs'] } : g)) } };
  assert.equal(bad(noGlob).length, 1);
});

test('call_edge 无 requiredTests 不给写函数豁免（删登记不能绕过）', () => {
  const ctx = loadContext(ROOT);
  const params = { groups: ['offline'], callers: [], callees: ['registry_write'], roots: ['test-temp-root'], code: 'E-ACC-REGISTRY-WRITE' };
  const strip = (f) => ({ ...ctx, regs: { ...ctx.regs, gatefacs: ctx.regs.gatefacs.map((g) => (g.facCode === 'test-temp-root' ? f(g) : g)) } });
  const inHelper = (c) => callEdge(c, params, CLS.registry_write).filter((h) => h.file === 'tests/accept/temp-root.mjs' && h.nodeKind === 'call');
  assert.deepEqual(inHelper(ctx), []);
  assert.ok(inHelper(strip(({ requiredTests, ...g }) => g)).length >= 1);
  assert.ok(inHelper(strip((g) => ({ ...g, requiredTests: [] }))).length >= 1);
});

test('assertRelUnderTempRoot（裁定四）：越出临时根与命中 §2.11 的路径直接抛错', () => {
  const dir = testTempRoot('arutr-');
  try {
    for (const bad of ['../a', 'a/../../b', '/etc/x', 'C:/x', 'tools/accept/items.json']) assert.throws(() => assertRelUnderTempRoot(dir, bad), /temp root|§2\.11/, bad);
    assert.equal(assertRelUnderTempRoot(dir, 'a/b.json'), join(dir, 'a/b.json'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeUnderTempRoot（裁定四）：`..`、绝对路径、命中 §2.11 受保护模式时抛错；合规相对路径写入临时根内', () => {
  const dir = testTempRoot('wutr-');
  try {
    for (const bad of ['../a.json', 'a/../../b.json', '..', '.', ROOT, '/etc/x', 'C:/x/y.json', 'tools/accept/items.json', 'tools/accept/out/x.json', 'tools/whitelist.json', 'a/../tools/accept/gatefacs.json']) {
      assert.throws(() => writeUnderTempRoot(dir, bad, 'x'), /temp root|§2\.11/, bad);
    }
    const p = writeUnderTempRoot(dir, 'sub/dir/ok.json', 'hi');
    assert.equal(readFileSync(p, 'utf8'), 'hi');
    assert.ok(!relative(dir, p).startsWith('..'));
    assert.equal(readFileSync(join(dir, 'sub/dir/ok.json'), 'utf8'), 'hi');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('writeUnderTempRoot（只核第 2 条）：root 在仓库内（仓库根、仓库内子目录）时抛错，且不落盘', () => {
  for (const root of [ROOT, join(ROOT, 'server-plugin'), join(ROOT, 'tests')]) {
    assert.throws(() => writeUnderTempRoot(root, 'wutr-should-not-exist.mjs', 'x'), /outside the repository/, root);
    assert.ok(!existsSync(join(root, 'wutr-should-not-exist.mjs')), root);
  }
});

test('test-temp-root 登记（裁定三、四）：entries 封闭为 testTempRoot、tempRepo、writeUnderTempRoot；tempRepo() 返回的目录在仓库外', () => {
  const fac = loadContext(ROOT).regs.gatefacs.find((g) => g.facCode === 'test-temp-root');
  assert.deepEqual([...fac.entries].sort(), ['tempRepo', 'testTempRoot', 'writeUnderTempRoot']);
  assert.equal(fac.inRepo, false);
  assert.ok(fac.assertedWriters.every((w) => fac.entries.includes(w)));
  const dir = tempRepo();
  try {
    const r = relative(realpathSync(ROOT), realpathSync(dir));
    assert.ok(r.startsWith('..') || isAbsolute(r), `tempRepo() dir inside repo: ${dir}`);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('kernel/files.json 与磁盘上的 kernel 组文件一致（排序、只列 .mjs）', () => {
  const ctx = loadContext(ROOT);
  const listPath = ctx.decl.kernel.filesList;
  const listed = JSON.parse(ctx.read(listPath));
  assert.deepEqual(listed, [...listed].sort());
  assert.ok(listed.every((f) => f.endsWith('.mjs')));
  assert.deepEqual(importEdge(ctx, { groups: ['kernel'], codes: ['E-FILE-UNASSIGNED'] }), []);
});

test('safeSegment（裁定一）：空串、点、分隔符、..、绝对路径、盘符一律抛错；单段原样返回', () => {
  for (const bad of ['', '.', '..', 'a/b', 'a\\b', '../x', 'a/../b', '/etc', 'C:', 'C:x', 'x..y', 'a\0b']) assert.throws(() => safeSegment(bad), /unsafe path segment/, JSON.stringify(bad));
  assert.equal(safeSegment('dimensions-coverage.2026-11-17.txt'), 'dimensions-coverage.2026-11-17.txt');
  assert.equal(safeSegment('2026-11-17T01-02-03-123Z-manual'), '2026-11-17T01-02-03-123Z-manual');
  assert.equal(safeSegment(5), '5');
});

test('repoRoot（裁定一）：返回仓库根，tools/path-segment.mjs 的上一级', () => {
  assert.equal(realpathSync(repoRoot()), realpathSync(ROOT));
  assert.ok(existsSync(join(repoRoot(), 'tools', 'path-segment.mjs')));
});

test('call_edge 离线路径段（裁定一）：仓库根＋不命中 §2.11 的常量前导段＋校验函数尾段不计；首段可变、尾段未过校验、前导段命中模式、根不是仓库根都计入', () => {
  const head = "import { writeFileSync } from 'node:fs';\nimport { join, resolve } from 'node:path';\nimport { repoRoot, safeSegment } from './path-segment.mjs';\n";
  const run = (body, file = 'tools/x.mjs') => callEdge(ctxOf({ [file]: head + body }), { groups: ['offline'], callers: [], callees: ['registry_write'], code: 'E-ACC-REGISTRY-WRITE' }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length;
  // 必须不报（§4.14）：logs/ 前缀＋日期尾段、backups/ 前缀＋时间尾段。
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', safeSegment(`dimensions-coverage.${d}.txt`)), 'x');"), 0);
  assert.equal(run("const r = repoRoot(); writeFileSync(join(r, 'backups', safeSegment(stamp)), 'x');"), 0);
  assert.equal(run("writeFileSync(resolve(repoRoot(), 'backups', safeSegment(stamp), safeSegment(name)), 'x');"), 0);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs/sub', safeSegment(d)), 'x');"), 0);
  // 默认导入的 path.join 与命名空间导入的 path.join 同样认。
  const viaNs = "import fs from 'node:fs/promises';\nimport path from 'node:path';\nimport * as nsp from 'node:path';\nimport { repoRoot, safeSegment } from './path-segment.mjs';\n";
  const runNs = (body) => callEdge(ctxOf({ 'tools/x.mjs': viaNs + body }), { groups: ['offline'], callers: [], callees: ['registry_write'], code: 'E-ACC-REGISTRY-WRITE' }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length;
  assert.equal(runNs("await fs.writeFile(path.join(repoRoot(), 'backups', safeSegment(s), safeSegment(f)), b);"), 0);
  assert.equal(runNs("await fs.writeFile(nsp.resolve(repoRoot(), 'backups', safeSegment(s)), b);"), 0);
  assert.equal(runNs("await fs.writeFile(path.join(repoRoot(), 'tools', safeSegment(f)), b);"), 1);
  assert.equal(runNs("await fs.writeFile(path.dirname(repoRoot(), 'backups', safeSegment(f)), b);"), 1);
  // 必须报：首段可变（前导段为空）。
  assert.equal(run("writeFileSync(join(repoRoot(), safeSegment(a), safeSegment(b)), 'x');"), 1);
  // 必须报：尾段未过校验函数（变量、含分隔符的常量、含 .. 的常量、本文件自己声明的同名函数）。
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', name), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', 'a/b'), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', '..', 'tools', 'accept', 'items.json'), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', 'a/../../tools/whitelist.json'), 'x');"), 1);
  assert.equal(run("function safeSegment2(x) { return x; }\nwriteFileSync(join(repoRoot(), 'logs', safeSegment2(n)), 'x');"), 1);
  // 同名遮蔽：本文件声明的同名函数、参数遮蔽、局部 const 遮蔽、重新赋值（safeSegment 本身、repoRoot 本身）都不认，计入。
  assert.equal(run("function safeSegment(x) { return x; }\nwriteFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(run("function f(safeSegment, n) { writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x'); }"), 1);
  assert.equal(run("const g = (safeSegment) => writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(run("function f(n) { const safeSegment = (x) => x; writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x'); }"), 1);
  assert.equal(run("safeSegment = (x) => x;\nwriteFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(run("function f(repoRoot) { writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x'); }"), 1);
  // 对照：没有遮蔽的同类写法不计。
  assert.equal(run("function f(n) { writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x'); }"), 0);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', safeSegment(n), 'x'), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', ...parts), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'logs', o.safeSegment(n)), 'x');"), 1);
  // 必须报：常量前导段命中 §2.11 模式（整个文件、目录、整目录模式、前导段是模式的祖先目录）。
  assert.equal(run("writeFileSync(join(repoRoot(), 'tools/accept/items.json', safeSegment(n)), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'tools', 'accept', safeSegment(n)), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'tools', safeSegment('whitelist.json')), 'x');"), 1);
  assert.equal(run("writeFileSync(join(repoRoot(), 'tools/accept/out', safeSegment(n), safeSegment(m)), 'x');"), 1);
  // 受保护模式含中间 `**`：前导段比到 `**` 即判可能落入，计入（夹具模式 a/**/c.json 与 a/b/c.json 一类）。
  const starCtx = (body) => { const c = ctxOf({ 'tools/x.mjs': head + body }); return { ...c, regs: { ...c.regs, scanclasses: c.regs.scanclasses.map((s) => (s.scanClass === 'registry_write' ? { ...s, guardedPaths: ['logs/**/c.json', 'other/x.json'] } : s)) } }; };
  const runStar = (body) => callEdge(starCtx(body), { groups: ['offline'], callers: [], callees: ['registry_write'], code: 'E-ACC-REGISTRY-WRITE' }, starCtx(body).regs.scanclasses.find((s) => s.scanClass === 'registry_write')).filter((h) => h.nodeKind === 'call').length;
  assert.equal(runStar("writeFileSync(join(repoRoot(), 'logs', 'a', safeSegment(n)), 'x');"), 1);
  assert.equal(runStar("writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(runStar("writeFileSync(join(repoRoot(), 'elsewhere', safeSegment(n)), 'x');"), 0);
  // 必须报：根不是仓库根函数的返回值、函数不是从登记文件 import 来的。
  assert.equal(run("writeFileSync(join(dir, 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(run("writeFileSync(join(process.cwd(), 'logs', safeSegment(n)), 'x');"), 1);
  assert.equal(run("let r = repoRoot(); r = '/'; writeFileSync(join(r, 'logs', safeSegment(n)), 'x');"), 1);
  const other = "import { writeFileSync } from 'node:fs';\nimport { join } from 'node:path';\nimport { repoRoot, safeSegment } from './other.mjs';\n";
  assert.equal(callEdge(ctxOf({ 'tools/x.mjs': `${other}writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');` }), { groups: ['offline'], callers: [], callees: ['registry_write'], code: 'E-ACC-REGISTRY-WRITE' }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length, 1);
  // 删登记不能绕过：gatefac 行没有非空 requiredTests 就不认这条口子。
  const ctx = ctxOf({ 'tools/x.mjs': `${head}writeFileSync(join(repoRoot(), 'logs', safeSegment(n)), 'x');` });
  const strip = { ...ctx, regs: { ...ctx.regs, gatefacs: ctx.regs.gatefacs.map((g) => (g.segmentFns ? { ...g, requiredTests: [] } : g)) } };
  assert.equal(callEdge(strip, { groups: ['offline'], callers: [], callees: ['registry_write'], code: 'E-ACC-REGISTRY-WRITE' }, CLS.registry_write).filter((h) => h.nodeKind === 'call').length, 1);
});

test('离线路径段登记（裁定一）：gatefac 行登记 rootFns、segmentFns 与必跑测试；必跑测试被改名即判不过；真实仓库里 S12-2 的调用命中为 0', () => {
  const ctx = loadContext(ROOT);
  const fac = ctx.regs.gatefacs.find((g) => g.segmentFns);
  assert.deepEqual(fac.rootFns, ['repoRoot']);
  assert.deepEqual(fac.segmentFns, ['safeSegment']);
  assert.deepEqual(fac.paths, ['tools/path-segment.mjs']);
  const params = { groups: ['offline'], callers: ['acc-register', 'acc-runner'], callees: ['registry_write'], roots: ['test-temp-root'], code: 'E-ACC-REGISTRY-WRITE' };
  // 真实用到校验函数的离线工具（日志、备份报告写入）都不计。
  const users = ['tools/dim-coverage.mjs', 'tools/backup.mjs'];
  assert.deepEqual(callEdge(ctx, params, CLS.registry_write).filter((h) => users.includes(h.file)), []);
  assert.deepEqual(callEdge(ctx, params, CLS.registry_write).filter((h) => h.nodeKind === 'test'), []);
  const req = fac.requiredTests[0];
  const src = ctx.read(req.file);
  const line = src.split('\n').find((l) => l.startsWith(`test('${req.names[0]}`));
  assert.ok(line, 'required test line');
  const broken = { ...ctx, read: (p) => (p === req.file ? src.replace(line, line.replace(req.names[0], 'renamed')) : ctx.read(p)) };
  assert.deepEqual(callEdge(broken, params, CLS.registry_write).filter((h) => h.nodeKind === 'test').map((h) => h.symbolPath), [req.names[0]]);
  // 没有 guardedPaths 的类别不检查路径段设施的必跑测试（修订记录称“判定口径不变”）。
  assert.deepEqual(CLS.wallclock.guardedPaths, undefined);
  assert.deepEqual(callEdge(broken, { ...params, callees: ['wallclock'] }, CLS.wallclock).filter((h) => h.nodeKind === 'test').map((h) => h.symbolPath).filter((s) => s === req.names[0]), []);
});

// ---------- instance_name 整类登码与 S6-2 规则表一支（卷六 S6-2；卷十二 §2.12 :540、:545；李白 11-18 07:27 裁定①） ----------

const TBL = 'world/rules/tables/economy/resources.json';
const KEYCHECK = { checks: ['entityKey'], code: 'E-ACC-INSTANCE-NAME' };
const tableHits = (doc, extra = {}, cls = CLS.instance_name) => dataShape(ctxOf({ [TBL]: JSON.stringify(doc), ...extra }), KEYCHECK, cls);

test('instance_name 整类登码：类别下每一条目（含 CORE 的 vol2.S1）都登 E-ACC-INSTANCE-NAME，且码在码表里', () => {
  const own = readRegistry(ROOT, 'items').filter((it) => it.scanClass === 'instance_name');
  assert.deepEqual(own.map((it) => it.itemKey).sort(), ['vol1.V-1.a', 'vol2.S1', 'vol2.S8', 'vol6.S6-2.a', 'vol6.S6-2.b']);
  for (const it of own) assert.equal(it.params.code, 'E-ACC-INSTANCE-NAME', it.itemKey);
  assert.ok(REGISTERED_CODES.has('E-ACC-INSTANCE-NAME'));
  assert.equal(litScope(ctxOf({ 'server-plugin/a.mjs': "const a = 'fxa_oats';" }), { groups: RT, literal: 'entityPrefix', code: 'E-ACC-INSTANCE-NAME' }, CLS.instance_name)[0].code, 'E-ACC-INSTANCE-NAME');
});

test('S6-2 规则表一支：键是实体 id 报一条（nodeKind key），值是实体 id 或单例 id 各报一条（value），码取条目参数', () => {
  const k = tableHits({ rows: [{ key: 'res_x', value: { fxa_oats: 1 } }] });
  assert.deepEqual(k.map((h) => [h.file, h.nodeKind, h.symbolPath, h.code]), [[TBL, 'key', 'rows[].value', 'E-ACC-INSTANCE-NAME']]);
  const v = tableHits({ rows: [{ key: 'res_x', value: { family: 'fxa_oats', sources: ['src_genesis', 'fxsolo'], cls: 'fxclass_a' } }] });
  assert.deepEqual(v.map((h) => [h.nodeKind, h.symbolPath]), [['value', 'rows[].value.family'], ['value', 'rows[].value.sources[]'], ['value', 'rows[].value.cls']]);
});

test('S6-2 规则表一支：词表代号、固定键名、前缀不带下划线或在中段的字串、数字与布尔都不报', () => {
  assert.deepEqual(tableHits({ rows: [{ key: 'res_x', value: { family: 'resfam_asset', note: 'fxa without underscore, pre_fxa_ in the middle', fxa: 1, n: 5, ok: true, nothing: null, sources: ['src_genesis'], fxsolo2: 'fxsolo2' } }] }), []);
});

// 规则表取 world/rules/registry.json 全部登记行（卷十二 §2.4 :236），登记与文件存在性取真实根 ctx.root；这里换一个临时根造"登记缺失、无行、登记的文件不存在"。
const ROW = '{"rows": [{"code": "fxTab", "file": "tables/nope.json", "structure": "processSlots", "volume": "vol6", "multiSourceMerge": "own_key_only", "packOverridable": true}]}';
const shape = (base, fakeRoot) => dataShape({ ...base, root: fakeRoot }, KEYCHECK, CLS.instance_name).map((h) => [h.nodeKind, h.code, h.file, h.symbolPath]);

test('S6-2 规则表一支：登记缺失、登记里没有表行、登记的文件不存在，都报 E-ACC-ITEM-PARAM（不静默放过）', () => {
  const base = ctxOf({ 'server-plugin/a.mjs': 'export const x = 1;' });
  const dir = testTempRoot('s62-reg-');
  try {
    assert.deepEqual(shape(base, dir), [['param', 'E-ACC-ITEM-PARAM', 'world/rules/registry.json', 'rules registry missing']]);
    writeUnderTempRoot(dir, 'world/rules/registry.json', '{"rows": []}');
    assert.deepEqual(shape(base, dir), [['param', 'E-ACC-ITEM-PARAM', 'world/rules/registry.json', 'rules registry has no table rows']]);
    writeUnderTempRoot(dir, 'world/rules/registry.json', ROW);
    assert.deepEqual(shape(base, dir), [['param', 'E-ACC-ITEM-PARAM', 'world/rules/tables/nope.json', 'registered table file missing']]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('S6-2 规则表一支：扫登记的全部表而不限经济目录；登记里的表不在被查文件集里则不读；不在登记里的文件不读', () => {
  const MOD = 'world/rules/tables/modifiers.json';
  const hit = dataShape(ctxOf({ [MOD]: JSON.stringify({ rows: [{ key: 'fxa_oats', value: 1 }] }) }), KEYCHECK, CLS.instance_name);
  assert.deepEqual(hit.map((h) => [h.file, h.nodeKind, h.code]), [[MOD, 'value', 'E-ACC-INSTANCE-NAME']]);
  assert.deepEqual(dataShape(ctxOf({ 'world/rules/tables/economy/unregistered.json': JSON.stringify({ rows: [{ key: 'fxa_oats', value: 1 }] }) }), KEYCHECK, CLS.instance_name), []);
  assert.deepEqual(dataShape(ctxOf({ 'server-plugin/a.mjs': 'export const x = 1;' }), KEYCHECK, undefined), []);
});

test('S6-2 规则表一支：表文件不是合法 JSON 报 E-ACC-ITEM-FORM，不静默跳过', () => {
  const ctx = ctxOf({ [TBL]: '{"rows": [' });
  assert.deepEqual(dataShape(ctx, KEYCHECK, CLS.instance_name).map((h) => [h.file, h.code]), [[TBL, 'E-ACC-ITEM-FORM']]);
});

test('S6-2 真实仓库：登记的全部规则表键值零命中（登记的实体前缀取自维度表表头，不写死）；扫到的表数等于登记行数', () => {
  const ctx = loadContext(ROOT);
  const rows = JSON.parse(readFileSync(join(ROOT, 'world/rules/registry.json'), 'utf8')).rows;
  assert.equal(rows.length, 8);
  assert.ok(rows.every((r) => ctx.files.includes(`world/rules/${r.file}`)));
  assert.deepEqual(dataShape(ctx, KEYCHECK, CLS.instance_name), []);
});

test('vol2.S10 补码：const_literal 类条目登 E-ACC-CONST-LITERAL，码在码表里；全部在跑的 lit_scope、call_edge、path_access 等取 params.code 的条目都登了码', () => {
  assert.ok(REGISTERED_CODES.has('E-ACC-CONST-LITERAL'));
  const own = readRegistry(ROOT, 'items').filter((it) => it.scanClass === 'const_literal');
  assert.deepEqual(own.map((it) => [it.itemKey, it.params.code]), [['vol2.S10', 'E-ACC-CONST-LITERAL']]);
  const codeFromParam = new Set(['lit_scope', 'call_edge', 'file_set', 'data_shape', 'decl_cmp']);
  for (const it of readRegistry(ROOT, 'items')) {
    if (it.state === 'registered' || !codeFromParam.has(it.detector) || (it.params || {}).checks) continue;
    assert.ok(REGISTERED_CODES.has((it.params || {}).code), `${it.itemKey} running without a registered code`);
  }
});

// ---------- A12-4.5 参数必须有消费者（卷十二 §4.4.6 :784；李白 11-18 08:20 裁定②，勘误 1118k18） ----------

const VALUATION = 'world/rules/tables/valuation.json';
const PC = { checks: ['paramConsumed'], code: 'E-ACC-PARAM-UNCONSUMED' };
const pc = (map) => declCmp(ctxOf(map), PC, CLS.param_consumed);

test('param_consumed：规则层读到即不算（成员访问、下标、同值字串），读别的键报 E-ACC-PARAM-UNCONSUMED', () => {
  const table = { [VALUATION]: '{"rows": []}' };
  assert.deepEqual(pc({ ...table, 'server-plugin/rates.mjs': 'export const f = (t) => t.unitValue;' }), []);
  assert.deepEqual(pc({ ...table, 'server-plugin/rates.mjs': "export const f = (t) => t['unitValue'];" }), []);
  assert.deepEqual(pc({ ...table, 'server-plugin/rates.mjs': "const K = 'unitValue'; export const f = (t) => t[K];" }), []);
  assert.deepEqual(pc({ ...table, 'server-plugin/kernel/rates.mjs': 'export const f = (t) => t.unitValue;' }), []);
  const hit = pc({ ...table, 'server-plugin/rates.mjs': 'export const f = (t) => t.other;' });
  assert.deepEqual(hit.map((h) => [h.file, h.nodeKind, h.symbolPath, h.code]), [['world/rules/registry.json', 'param', 'valuation.unitValue', 'E-ACC-PARAM-UNCONSUMED']]);
});

test('param_consumed：加载器（kernel/load/）、校验器（kernel/validate/）与测试读全表都不算消费者', () => {
  const table = { [VALUATION]: '{"rows": []}' };
  const src = 'export const f = (t) => t.unitValue;';
  for (const file of ['server-plugin/kernel/load/x.mjs', 'server-plugin/kernel/validate/x.mjs', 'tests/kernel/x.mjs']) {
    assert.equal(pc({ ...table, [file]: src }).length, 1, file);
  }
});

test('param_consumed：范围经登记解析；被查内容里没有登记的键表、或内核组登记缺失报 E-ACC-ITEM-PARAM，不静默放过', () => {
  assert.deepEqual(pc({ 'server-plugin/rates.mjs': 'export const x = 1;' }).map((h) => [h.nodeKind, h.code]), [['param', 'E-ACC-ITEM-PARAM']]);
  const ctx = ctxOf({ [VALUATION]: '{"rows": []}', 'server-plugin/rates.mjs': 'export const f = (t) => t.unitValue;' });
  const noKernel = Object.fromEntries(Object.entries(ctx.decl).filter(([k]) => k !== 'kernel'));
  assert.deepEqual(declCmp({ ...ctx, decl: noKernel }, PC, CLS.param_consumed).map((h) => [h.nodeKind, h.code]), [['param', 'E-ACC-ITEM-PARAM']]);
});

test('param_consumed 真实仓库：如实报无运行期消费者的登记参数（B2-W2 起 det-math 常数已接上），有读者的键不计', () => {
  assert.ok(REGISTERED_CODES.has('E-ACC-PARAM-UNCONSUMED'));
  assert.ok(REGISTERED_CODES.has('E-ACC-PROMISE-UNREACHABLE'));
  const hits = declCmp(loadContext(ROOT), PC, CLS.param_consumed);
  assert.ok(hits.every((h) => h.code === 'E-ACC-PARAM-UNCONSUMED'));
  const keys = hits.map((h) => h.symbolPath).sort();
  // B2-W2 起 det-math.mjs 的 BASE/SCALE/PERMILLE/BPS 经规则表 kernelConstants 读入（installFixedConstants），该四键已有消费者；
  // extendsMaxDepth/rxMaxDepth 只被加载器与校验器读到，按消费者口径不算；valuation.unitValue 只有测试读。
  assert.deepEqual(keys, [
    'kernelConstants.extendsMaxDepth', 'kernelConstants.rxMaxDepth', 'valuation.unitValue',
  ]);
  for (const k of ['kernelConstants.handleRadix', 'modifiers.stackingTable', 'economyLedger.budget', 'economyLedger.alert',
    'clock.cadence', 'clock.phaseOffset', 'clock.paceFactor', 'clock.contestDefault', 'clock.reactionDepthMax', 'clock.proposalMax', 'clock.drawSites',
    'saveLayout.segmentEvents', 'saveLayout.snapshotEveryEvents', 'saveLayout.keepSnapshots']) assert.ok(!keys.includes(k), k);
});

test('A12-4.5 登记：条目 vol12.A12-4.5 登码 E-ACC-PARAM-UNCONSUMED、scanClass 与检测器已登记；A12-4.4 仍 registered 并挂 B5-ACT', () => {
  const items = readRegistry(ROOT, 'items');
  const a45 = items.find((it) => it.itemKey === 'vol12.A12-4.5');
  assert.deepEqual([a45.state, a45.scanClass, a45.detector, a45.params.code], ['implemented', 'param_consumed', 'decl_cmp', 'E-ACC-PARAM-UNCONSUMED']);
  assert.ok(CLS.param_consumed.detectors.includes('decl_cmp'));
  const a44 = items.find((it) => it.itemKey === 'vol12.A12-4.4');
  assert.equal(a44.state, 'registered');
  assert.match(a44.source, /B5-ACT/);
});
