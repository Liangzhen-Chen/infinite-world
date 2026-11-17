// P-1 检测器单项：每个检测器正反两极性（卷十二 R12-13.3），计数按 R12-1.3、R12-4.2 的"换写法不少计、只计一次"。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, prefixesFromDir, mergePrefixes, readRegistry, LAYOUT } from '../../tools/accept/read.mjs';
import { detect as litScope } from '../../tools/accept/detectors/lit_scope.mjs';
import { detect as importEdge } from '../../tools/accept/detectors/import_edge.mjs';
import { detect as pathAccess } from '../../tools/accept/detectors/path_access.mjs';
import { detect as callEdge } from '../../tools/accept/detectors/call_edge.mjs';
import { detect as docStruct, definedNumbers } from '../../tools/accept/detectors/doc_struct.mjs';

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

test('doc_struct 编号口径（裁定二）：只数定义处；引用、"第 n 条"、条文中间的编号不算；编号族来自登记数据', () => {
  const text = ['| V-1 | 条 |', '| **V-2** | 条 |', '### V-3 标题', '**V-8 分阶段**：见 V-4', '- V-5 列表项', '见 V-6 与 R-6 第 5 条', 'V-7 普通段落开头', '| 条 | V-9 在非首列 |', '| S12-1 | 别的族 |', '| V-1 | 重复定义 |'].join('\n');
  assert.deepEqual([...definedNumbers(text, ['V-']).entries()], [['V-1', 1], ['V-2', 2], ['V-3', 3], ['V-8', 4], ['V-5', 5]]);
  assert.deepEqual([...definedNumbers(text, ['S12-']).keys()], ['S12-1']);
  assert.equal(definedNumbers(text, []).size, 0);
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
  assert.equal(run("writeFileSync(join(testTempRoot(), 'a'), 'x');"), 1);
  assert.equal(callEdge(ctxOf({ 'tools/x.mjs': head + "const d = testTempRoot(); writeFileSync(join(d, 'a'), 'x');" }), { groups: ['offline'], callers: [], callees: ['registry_write'] }, CLS.registry_write).length, 1);
});

test('kernel/files.json 与磁盘上的 kernel 组文件一致（排序、只列 .mjs）', () => {
  const ctx = loadContext(ROOT);
  const listPath = ctx.decl.kernel.filesList;
  const listed = JSON.parse(ctx.read(listPath));
  assert.deepEqual(listed, [...listed].sort());
  assert.ok(listed.every((f) => f.endsWith('.mjs')));
  assert.deepEqual(importEdge(ctx, { groups: ['kernel'], codes: ['E-FILE-UNASSIGNED'] }), []);
});
