// 格子迁移 G6《gridKey 格坐标段》的纯函数与加载/写入核（卷二 §2.7 keyKinds (c) `gridKey`，封卷后勘误 1121k1；李白 11-21 裁定）。
// gridKeyOf/gridKeyParse/gridPathOf 互逆、isGridKeySeg 核"格键所在里块须等于路径里的里块号"、加载器核 gridKey 只用于 cells/fieldCells 前三段、
// storage 运行期写入处三段合起来核。期望值按卷二 :852 串形手算成字面量；不推进世界（本机 F 盘可跑）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../accept/temp-root.mjs';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { gridChunkCells, gridKeyOf, gridKeyParse, isGridKeySeg, gridPathOf } from '../../server-plugin/kernel/handles/keys.mjs';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { installStorage, writePath, installGridRules } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';

// 定点常数先装（gridChunkCells 经 fixedUnits 读 SCALE；夹具值与 world/rules/tables/kernel-constants.json 同）。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });

// chunkCells = chunkRegionCells × regionCellM ÷ cellM = 10 × 100 ÷ 1 = 1000（卷二 :852 串形的分母；值只作测试前提）。
const GRID = { cellM: 1, regionCellM: 100, chunkRegionCells: 10 };

// ---------- gridChunkCells ----------

test('gridChunkCells：chunkRegionCells × regionCellM ÷ cellM = 1000；非正整数即 E-DET-DOMAIN', () => {
  assert.equal(gridChunkCells(GRID), 1000);
  // cellM 为 0、chunkRegionCells 为 0 或负、cellM 非整数，一律 E-DET-DOMAIN（不得返回 0 或 NaN）。
  for (const grid of [
    { cellM: 0, regionCellM: 100, chunkRegionCells: 10 },
    { cellM: 1, regionCellM: 100, chunkRegionCells: 0 },
    { cellM: 1, regionCellM: 100, chunkRegionCells: -1 },
    { cellM: 1.5, regionCellM: 100, chunkRegionCells: 10 },
    { cellM: 1, regionCellM: 100.5, chunkRegionCells: 10 },
  ]) {
    assert.throws(() => gridChunkCells(grid), (e) => e.code === 'E-DET-DOMAIN', JSON.stringify(grid));
  }
  // 除不尽的（chunkRegionCells × regionCellM 不被 cellM 整除）也 E-DET-DOMAIN。
  assert.throws(() => gridChunkCells({ cellM: 3, regionCellM: 100, chunkRegionCells: 10 }), (e) => e.code === 'E-DET-DOMAIN');
});

// ---------- gridKeyOf ----------

test('gridKeyOf：w 段、里块号段 `<cx>:<cy>`、格键段 `<x>:<y>:<z>`（向负无穷取整）', () => {
  assert.deepEqual(gridKeyOf(GRID, { w: 0, x: 0, y: 0, z: 0 }), { w: '0', chunk: '0:0', cell: '0:0:0' });
  // x=-1 → cx=floor(-1/1000)=-1；y=1000 → cy=floor(1000/1000)=1。
  assert.deepEqual(gridKeyOf(GRID, { w: -3, x: -1, y: 1000, z: -2 }), { w: '-3', chunk: '-1:1', cell: '-1:1000:-2' });
});

test('gridKeyOf：里块号 x 边界向负无穷取整（x=999→0、1000→1、-1000→-1、-1001→-2）', () => {
  const cxOf = (x) => gridKeyOf(GRID, { w: 0, x, y: 0, z: 0 }).chunk;
  assert.equal(cxOf(999), '0:0');
  assert.equal(cxOf(1000), '1:0');
  assert.equal(cxOf(-1000), '-1:0');
  assert.equal(cxOf(-1001), '-2:0');
});

// ---------- gridKeyParse 与互逆 ----------

test('gridKeyParse：三段文本还原成整数；与 gridKeyOf 互逆', () => {
  assert.deepEqual(gridKeyParse(['0', '0:0', '0:0:0']), { w: 0, cx: 0, cy: 0, x: 0, y: 0, z: 0 });
  assert.deepEqual(gridKeyParse(['-3', '-1:1', '-1:1000:-2']), { w: -3, cx: -1, cy: 1, x: -1, y: 1000, z: -2 });
  const roundTrip = (pos) => { const k = gridKeyOf(GRID, pos); return gridKeyParse([k.w, k.chunk, k.cell]); };
  assert.deepEqual(roundTrip({ w: 0, x: 0, y: 0, z: 0 }), { w: 0, cx: 0, cy: 0, x: 0, y: 0, z: 0 });
  assert.deepEqual(roundTrip({ w: -3, x: -1, y: 1000, z: -2 }), { w: -3, cx: -1, cy: 1, x: -1, y: 1000, z: -2 });
});

test('gridKeyParse：前导零、`-0`、小数、空串、多余冒号、非数字一律 null', () => {
  for (const segs of [
    ['007', '0:0', '0:0:0'], // w 前导零
    ['0', '0:007', '0:0:0'], // chunk 前导零
    ['0', '0:0', '0:0:007'], // cell 前导零
    ['-0', '0:0', '0:0:0'], // -0
    ['0', '-0:0', '0:0:0'],
    ['0', '0:0', '0:-0:0'],
    ['1.5', '0:0', '0:0:0'], // 小数
    ['', '0:0', '0:0:0'], // 空串
    ['0', '0:0', '1:2:3:4'], // 多余冒号
    ['0', 'a:b', '0:0:0'], // 非数字
    ['0', '0:0', 'a:b:c'],
    ['0', '0', '0:0:0'], // chunk 缺一段
    ['0', '0:0', '0:0'], // cell 缺一段
  ]) {
    assert.equal(gridKeyParse(segs), null, JSON.stringify(segs));
  }
  assert.equal(gridKeyParse(['0', '0:0']), null); // 只有两段
  assert.equal(gridKeyParse('0.0:0.0:0:0'), null); // 非数组
});

test('gridPathOf：拼 `cells.<w>.<cx>:<cy>.<x>:<y>:<z>`，与 gridKeyParse 互逆', () => {
  assert.equal(gridPathOf(GRID, { w: 0, x: 0, y: 0, z: 0 }), 'cells.0.0:0.0:0:0');
  assert.equal(gridPathOf(GRID, { w: -3, x: -1, y: 1000, z: -2 }), 'cells.-3.-1:1.-1:1000:-2');
  const path = gridPathOf(GRID, { w: -3, x: -1001, y: 0, z: 0 });
  assert.deepEqual(gridKeyParse(path.split('.').slice(1)), { w: -3, cx: -2, cy: 0, x: -1001, y: 0, z: 0 });
});

// ---------- isGridKeySeg ----------

test('isGridKeySeg：三段合文法且格键 (x, y) 算出的里块等于里块号；不一致或不合文法则 false', () => {
  assert.equal(isGridKeySeg(GRID, '0', '0:0', '0:0:0'), true);
  assert.equal(isGridKeySeg(GRID, '-3', '-1:1', '-1:1000:-2'), true);
  // 里块与格坐标不一致：chunk '1:0' 配 cell '5:5:0'（cell 的 x=5 → cx=0 ≠ 1）。
  assert.equal(isGridKeySeg(GRID, '0', '1:0', '5:5:0'), false);
  // 不合文法。
  assert.equal(isGridKeySeg(GRID, '0', '0:0', '007:0:0'), false);
  assert.equal(isGridKeySeg(GRID, '0', '0:0', '-0:0:0'), false);
});

// ---------- 加载期核对（mergeStateOwners） ----------

const CTX = { units: new Set(['count']), kinds: new Set() };
const loadCodes = (d) => mergeStateOwners(d, CTX).errors.map((e) => e.code).sort();
const cellsDecl = (kk) => ({
  stateKeys: { cells: { readers: [], writers: { '*.*.*': 'grid-diff.mjs' } } },
  systems: {}, textPaths: [], textWriters: {},
  pathTypes: { 'cells.*.*.*': 'struct:gridCellDiff' },
  keyKinds: { 'cells.*.*.*': kk },
  phases: [],
});

test('加载核对：cells.*.*.* 前三项恰为 gridKey 通过；第 2 项写成 handle 即 E-PATH-KEYKINDS', () => {
  assert.deepEqual(loadCodes(cellsDecl(['gridKey', 'gridKey', 'gridKey'])), []);
  assert.deepEqual(loadCodes(cellsDecl(['gridKey', 'handle', 'gridKey'])), ['E-PATH-KEYKINDS']);
});

test('加载核对：gridKey 用在 statuses.*（非 cells/fieldCells）即 E-PATH-KEYKINDS', () => {
  const d = {
    stateKeys: { statuses: { readers: [], writers: { '*': 'status.mjs' } } },
    systems: {}, textPaths: [], textWriters: {},
    pathTypes: { 'statuses.*': 'integer:count' },
    keyKinds: { 'statuses.*': ['gridKey'] },
    phases: [],
  };
  assert.deepEqual(loadCodes(d), ['E-PATH-KEYKINDS']);
});

// ---------- 运行期写入核对（storage.mjs writePath） ----------

const CELLS_DECL = cellsDecl(['gridKey', 'gridKey', 'gridKey']);
const CELLS_MERGED = mergeStateOwners(CELLS_DECL, CTX);
const CELLS_WRITER = { node: 'view:grid', file: 'grid-diff.mjs' };
const DIFF = { material: null, fixture: null, mark: null, sinceMinute: 0 };

installVocab({ vocab: { families: new Map(), index: new Map() }, idIndex: new Map(), tables: new Map() });
installStorage(CELLS_MERGED.merged);
installGridRules(GRID);

test('运行期写入：三段合文法且里块一致写入成功；不合文法或里块不一致即 E-PATH-KEYKINDS', () => {
  assert.equal(CELLS_MERGED.ok, true, CELLS_MERGED.text);
  const st = {};
  assert.deepEqual(runTransaction(st, CELLS_WRITER, (s) => writePath(s, 'cells.0.0:0.0:0:0', DIFF)), { ok: true });
  assert.deepEqual(st, { cells: { '0': { '0:0': { '0:0:0': DIFF } } } });

  // 不合文法：w 段前导零。
  const st2 = {};
  assert.deepEqual(runTransaction(st2, CELLS_WRITER, (s) => writePath(s, 'cells.007.0:0.0:0:0', DIFF)), { ok: false, code: 'E-PATH-KEYKINDS' });
  assert.deepEqual(st2, {});

  // 里块不一致：chunk '1:0' 配 cell '5:5:0'（cell 的 cx=0 ≠ 1）。
  const st3 = {};
  assert.deepEqual(runTransaction(st3, CELLS_WRITER, (s) => writePath(s, 'cells.0.1:0.5:5:0', DIFF)), { ok: false, code: 'E-PATH-KEYKINDS' });
  assert.deepEqual(st3, {});
});

test('rules.grid 随世界加载装入（world.mjs 调 installGridRules）、每次重装覆盖上一次：未登记时报 E-RULES-UNREGISTERED（不是普通 Error）；重装后恢复；各测试各自装入互不串扰', () => {
  const st = {};
  installGridRules(null); // 世界没有登记 rules.grid
  assert.deepEqual(runTransaction(st, CELLS_WRITER, (s) => writePath(s, 'cells.0.0:0.0:0:0', DIFF)), { ok: false, code: 'E-RULES-UNREGISTERED' });
  assert.deepEqual(st, {});
  installGridRules(GRID);
  assert.deepEqual(runTransaction(st, CELLS_WRITER, (s) => writePath(s, 'cells.0.0:0.0:0:0', DIFF)), { ok: true });
  // 另一份格常数（里块边长 10）：同一路径的里块号随之不同，旧常数下合文法的写入在新常数下被拒——说明读的是最近一次装入。
  installGridRules({ ...GRID, chunkRegionCells: 1, regionCellM: 10 });
  assert.deepEqual(runTransaction({}, CELLS_WRITER, (s) => writePath(s, 'cells.0.0:0.15:0:0', DIFF)), { ok: false, code: 'E-PATH-KEYKINDS' });
  installGridRules(GRID);
});

test('world.mjs 在世界加载通过后装入 rules.grid：源码里调用 installGridRules(read.rules.grid)，与 installStorage 同块', () => {
  const text = readFileSync(join(ROOT, 'server-plugin/kernel/load/world.mjs'), 'utf8');
  assert.match(text, /installGridRules\(read\.rules\.grid\)/);
  assert.ok(text.indexOf('installStorage(owners.merged)') < text.indexOf('installGridRules(read.rules.grid)'));
});
