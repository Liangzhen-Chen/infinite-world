// 格子迁移第 4 步 G12–G16 开写前门禁（对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md 的 6 条门禁条目）：
// vol17.S17-1（pos、facing 的写入点）、vol5.S5-5（本地清醒判断）、vol9.R9-2.10（perceiveEvent 调用点）、
// vol20.S20-fieldCells（离屏路径不调场写入口）、vol20.S20-4.7.6（场步进不读路网边，按具名导入判）、vol20.T-4（规则表读者）。
// 每条正例（违规被拦）、反例（合规放过）；期望计数都是按样本手算的字面量。守护对象现在大多还没落地，
// 所以"声明写者"的情形用声明表覆盖（在内存里改声明表的副本，不碰磁盘登记）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext, readDecl, readRegistry } from '../../tools/accept/read.mjs';
import { detect as declGuard } from '../../tools/accept/detectors/decl_guard.mjs';
import { detect as pathAccess } from '../../tools/accept/detectors/path_access.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DECL = readDecl(ROOT);
const ITEMS = readRegistry(ROOT, 'items');
const CLASSES = new Map(readRegistry(ROOT, 'scanclasses').map((c) => [c.scanClass, c]));
const item = (key) => ITEMS.find((i) => i.itemKey === key);

// 夹具的文件集是虚拟的；谓词提供文件 action-capacity.mjs 对照真实仓库清单核存在（path_access predicateFiles），故 repoFiles 带上它。
function ctxOf(map, decl) {
  const files = new Map(Object.entries(map));
  return { ...loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p), decl: decl || DECL }), repoFiles: [...files.keys(), 'server-plugin/action-capacity.mjs'] };
}
const guard = (key, map, decl) => declGuard(ctxOf(map, decl), item(key).params, CLASSES.get(item(key).scanClass));
const access = (key, map) => pathAccess(ctxOf(map), item(key).params, CLASSES.get(item(key).scanClass));
const realRepo = (key) => (item(key).detector === 'decl_guard' ? declGuard : pathAccess)(loadContext(ROOT, {}), item(key).params, CLASSES.get(item(key).scanClass));

const WRITERS = "import { writePersonRow, writeItemDeviation, createItemInstance } from './kernel/dimension-writers.mjs';\n";
// 声明表覆盖：个体 pos、facing 的声明写者 position.mjs（卷十七 :288）。
const withPosWriter = (facingToo = true) => ({
  ...DECL,
  stateKeys: { ...DECL.stateKeys, created: { ...DECL.stateKeys.created, writers: { ...DECL.stateKeys.created.writers, '*.props.pos': 'position.mjs', ...(facingToo ? { '*.props.facing': 'position.mjs' } : {}) } } },
});
// 声明表覆盖：场的声明写者 env-fields.mjs（卷二十 :458、:459）。
const withFieldWriter = { ...DECL, stateKeys: { ...DECL.stateKeys, fields: { readers: [], writers: { '*.*': 'env-fields.mjs' } }, fieldCells: { readers: [], writers: { '*.*.*.*': 'env-fields.mjs' } } } };

test('六条门禁条目都已登记为 implemented，各自检测器与类别正确', () => {
  const want = {
    'vol17.S17-1': ['decl_guard', 'decl_guard'], 'vol9.R9-2.10': ['decl_guard', 'decl_guard'], 'vol20.S20-fieldCells': ['decl_guard', 'decl_guard'],
    'vol20.S20-4.7.6': ['decl_guard', 'decl_guard'], 'vol5.S5-5': ['path_access', 'module_edge'], 'vol20.T-4': ['path_access', 'module_edge'],
  };
  for (const [k, [det, cls]] of Object.entries(want)) {
    assert.deepEqual([item(k).state, item(k).detector, item(k).scanClass, item(k).expect], ['implemented', det, cls, 'zero'], k);
  }
});

// ---------- vol17.S17-1 / S17-4：pos、facing 的写入点 ----------

test('S17-1 守写入点：通用维度写者写 pos、facing（键名、简写、成员名、const 别名、命名空间）一律计，各计一处', () => {
  const hits = (body) => guard('vol17.S17-1', { 'server-plugin/a.mjs': WRITERS + body });
  assert.equal(hits("export const f = (e, s) => writePersonRow(e, s, { id: 'p', pos: { x: 1 }, facing: 2 });").length, 2);
  assert.equal(hits("export const f = (e, s, id, v) => writeItemDeviation(e, s, id, 'pos', v);").length, 1);
  assert.equal(hits('export const f = (e, s, id, v) => writeItemDeviation(e, s, id, D.pos, v);').length, 1);
  assert.equal(hits('export const f = (e, s, id, pos) => writePersonRow(e, s, { id, pos });').length, 1);
  assert.equal(hits("const DIR = 'facing';\nexport const f = (e, s, id, v) => writeItemDeviation(e, s, id, DIR, v);").length, 1);
  assert.equal(hits('export const f = (e, s) => createItemInstance(e, s, { fields: { pos: 1 } });').length, 1);
  const ns = guard('vol17.S17-1', { 'server-plugin/b.mjs': "import * as W from './kernel/dimension-writers.mjs';\nexport const f = (e, s) => W.createItemInstance(e, s, { fields: { facing: 1 } });" });
  assert.deepEqual(ns.map((h) => [h.nodeKind, h.code, h.line]), [['dim_write', 'E-POS-WRITER', 2]]);
});

test('S17-1 反例：别的维度、裸变量名 pos 作实参、别的模块同名函数、写者定义文件自己，都不计', () => {
  const hits = (map) => guard('vol17.S17-1', map);
  assert.equal(hits({ 'server-plugin/a.mjs': WRITERS + "export const f = (e, s, id, pos) => writeItemDeviation(e, s, id, 'durability', pos);" }).length, 0);
  assert.equal(hits({ 'server-plugin/a.mjs': "import { writePersonRow } from './mine.mjs';\nexport const f = (e, s) => writePersonRow(e, s, { pos: 1 });" }).length, 0);
  assert.equal(hits({ 'server-plugin/kernel/dimension-writers.mjs': "import * as me from './dimension-writers.mjs';\nme.writeItemDeviation(1, 2, 3, 'pos', 4);" }).length, 0);
  assert.equal(hits({ 'server-plugin/a.mjs': "export const f = (e, s) => ({ pos: 1, facing: 2 });" }).length, 0);
});

test('S17-1 声明写者：声明表登了 pos、facing 的写者文件后，该文件不计，别的文件仍计；只登 pos 时 facing 仍计', () => {
  const body = WRITERS + "export const f = (e, s) => writePersonRow(e, s, { pos: 1, facing: 2 });";
  assert.equal(guard('vol17.S17-1', { 'server-plugin/position.mjs': body }, withPosWriter()).length, 0);
  assert.equal(guard('vol17.S17-1', { 'server-plugin/other.mjs': body }, withPosWriter()).length, 2);
  assert.deepEqual(guard('vol17.S17-1', { 'server-plugin/position.mjs': body }, withPosWriter(false)).map((h) => h.nodeKind), ['dim_write']);
});

test('S17-1 现仓库计数为 0（声明表尚无 pos、facing 写者）', () => {
  assert.equal(realRepo('vol17.S17-1').length, 0);
});

// ---------- vol9.R9-2.10、vol20.S20-fieldCells：登记之外不许调用的入口 ----------

for (const [key, name, code] of [['vol9.R9-2.10', 'perceiveEvent', 'E-VIEW-BYPASS'], ['vol20.S20-fieldCells', 'foldBubbleFields', 'E-SIM-BYPASS']]) {
  test(`${key} ${name}：还没登记的入口，定义文件之外具名导入、别名导入、重导出、命名空间引用各计一处`, () => {
    const hits = (body, file = 'server-plugin/a.mjs') => guard(key, { [file]: body });
    assert.deepEqual(hits(`import { ${name} } from './kernel/place.mjs';\nexport const f = (e) => ${name}(e);`).map((h) => [h.nodeKind, h.code, h.line]), [['import', code, 1]]);
    assert.equal(hits(`import { ${name} as g } from './x.mjs';\nexport const f = (e) => g(e);`).length, 1);
    assert.deepEqual(hits(`export { ${name} } from './x.mjs';`).map((h) => h.nodeKind), ['reexport']);
    assert.deepEqual(hits(`import * as P from './x.mjs';\nexport const f = (e) => P.${name}(e);`).map((h) => h.nodeKind), ['member']);
    assert.equal(hits(`import { other } from './x.mjs';\nexport const f = (e) => other(e);`).length, 0);
    assert.equal(hits(`export function ${name}(e) { return e; }\nexport const f = (e) => ${name}(e);`).length, 0);
  });

  test(`${key} ${name}：登记进 kernelApi 后按登记的 callerFiles 判，登记文件不计、别的文件计`, () => {
    const decl = { ...DECL, kernelApi: { exports: [...DECL.kernelApi.exports, { export: `kernel/place.mjs#${name}`, callerFiles: ['adapter.mjs'], acceptsState: true }] } };
    const body = `import { ${name} } from './kernel/place.mjs';\nexport const f = (e) => ${name}(e);`;
    assert.equal(guard(key, { 'server-plugin/adapter.mjs': body }, decl).length, 0);
    assert.deepEqual(guard(key, { 'server-plugin/batch.mjs': body }, decl).map((h) => [h.file, h.nodeKind, h.code]), [['server-plugin/batch.mjs', 'import', code]]);
  });

  test(`${key} ${name}：现仓库计数为 0`, () => {
    assert.equal(realRepo(key).length, 0);
  });
}

// ---------- vol20.S20-4.7.6：场步进不读路网边，按具名导入判 ----------

test('S20-4.7.6 场步进实现文件具名导入 routeView、pathView 计，同一模块里的 zoneAt、regionCell 不计', () => {
  const hits = (body, file = 'server-plugin/env-fields.mjs', decl = withFieldWriter) => guard('vol20.S20-4.7.6', { [file]: body }, decl);
  assert.deepEqual(hits("import { routeView, zoneAt } from './kernel/place.mjs';").map((h) => [h.nodeKind, h.code, h.line]), [['import', 'E-VIEW-BYPASS', 1]]);
  assert.equal(hits("import { zoneAt, regionCell } from './kernel/place.mjs';\nexport const f = (e, s, p) => zoneAt(e, s, p);").length, 0);
  assert.equal(hits("import { pathView } from './kernel/place.mjs';").length, 1);
  assert.equal(hits("import { routeView as rv, pathView } from './kernel/place.mjs';").length, 2);
  assert.deepEqual(hits("import * as P from './kernel/place.mjs';\nexport const f = (e, s) => P.routeView(e, s, 1, 2);").map((h) => h.nodeKind), ['member']);
  assert.equal(hits("import * as P from './kernel/place.mjs';\nexport const f = (e, s) => P.zoneAt(e, s, 1);").length, 0);
});

test('S20-4.7.6 路网边模块 route-edges、route-grid 的任何导入都计', () => {
  const hits = (body) => guard('vol20.S20-4.7.6', { 'server-plugin/env-fields.mjs': body }, withFieldWriter);
  assert.deepEqual(hits("import { stepLengths } from './kernel/route-grid.mjs';").map((h) => h.nodeKind), ['import_module']);
  assert.deepEqual(hits("import * as E from './kernel/route-edges.mjs';").map((h) => h.nodeKind), ['import_module']);
});

test('S20-4.7.6 范围只取声明表里 fields、fieldCells 的写者文件：别的文件、没登记写者、写者文件不在清单里，都不计', () => {
  const body = "import { routeView } from './kernel/place.mjs';";
  assert.equal(guard('vol20.S20-4.7.6', { 'server-plugin/trip.mjs': body }, withFieldWriter).length, 0);
  assert.equal(guard('vol20.S20-4.7.6', { 'server-plugin/env-fields.mjs': body }).length, 0);
  assert.equal(guard('vol20.S20-4.7.6', { 'server-plugin/other.mjs': body }, withFieldWriter).length, 0);
});

test('S20-4.7.6 现仓库计数为 0', () => {
  assert.equal(realRepo('vol20.S20-4.7.6').length, 0);
});

// ---------- vol5.S5-5：本地清醒判断 ----------

test('S5-5 感知模块自己读 awake 的两个输入（suppressesAwake、awakeMin）计，解构同计；谓词提供文件不计', () => {
  const hits = (map) => access('vol5.S5-5', map);
  assert.equal(hits({ 'server-plugin/perception.mjs': 'export const f = (fam) => fam.suppressesAwake;' }).length, 1);
  assert.equal(hits({ 'server-plugin/perception.mjs': 'export const f = (fam) => { const { suppressesAwake } = fam; return suppressesAwake; };' }).length, 1);
  assert.equal(hits({ 'server-plugin/perception.mjs': 'export const f = (engine) => engine.rules.capacity.awakeMin;' }).length, 1);
  assert.equal(hits({ 'server-plugin/action-capacity.mjs': 'export const f = (engine) => engine.rules.capacity.awakeMin;' }).length, 0);
  assert.equal(hits({ 'server-plugin/perception.mjs': 'export const f = (engine, state, id) => awake(engine, state, id).ok;' }).length, 0);
});

test('S5-5 现仓库计数为 0', () => {
  assert.equal(realRepo('vol5.S5-5').length, 0);
});

// ---------- vol20.T-4：规则表读者 ----------

test('T-4 kernel 以外读卷二十的十二张规则表（rules.<表>）各计一处；kernel 内、状态里的同名键、别的规则表不计', () => {
  const tables = ['clock', 'astro', 'weather', 'climate', 'water', 'fields', 'light', 'sound', 'season', 'calendar', 'agroclock', 'env']; // 卷二十 :478 原文十二张
  for (const t of tables) assert.equal(access('vol20.T-4', { 'server-plugin/a.mjs': `export const f = (engine) => engine.rules.${t}.x;` }).length, 1, t);
  assert.equal(access('vol20.T-4', { 'server-plugin/kernel/calendar.mjs': 'export const f = (engine) => engine.rules.astro.yearDays;' }).length, 0);
  assert.equal(access('vol20.T-4', { 'server-plugin/a.mjs': 'export const f = (state) => state.clock.minute + state.weather.x;' }).length, 0);
  assert.equal(access('vol20.T-4', { 'server-plugin/a.mjs': 'export const f = (engine) => engine.rules.capacity.full + engine.rules.simTiers.x;' }).length, 0);
});

test('T-4 现仓库计数为 0', () => {
  assert.equal(realRepo('vol20.T-4').length, 0);
});
