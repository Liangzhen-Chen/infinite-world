// 卷五 §4.1 规则 10"流水水体的足迹"（E-GRID-WATER-BAND，封卷后勘误 1121k17、卷二 1121k19）与 §4.3 规则 8"河床"（区格代表地表高取河床高）接进足迹划分与高度读入口（kernel/footprint.mjs）：
// 纯函数 createWaterBeds 的用例（kernel/water-bed.mjs，手算数）在 water-bed.test.mjs；本文件测接线——
//   ① 流水水体（flowing 真）有 boundary 时，表序必须前缀连通，否则 E-GRID-WATER-BAND；静水、没有 boundary 的流水行不受影响；
//   ② 水体足迹的区格代表地表高取河床高 bed，其余区格取 h₀：处处 bed ≤ h₀（只降不抬）、有表序的河沿表序 bed 不升、河进湖海不上坡、支流只从汇入格起影响干流（汇入格以上的格与没有这条支流时逐格相同）；
//   ③ 计划标了 bedOff（卷十 R10-2.12 求值次序）时一律取 h₀，与不接河床时逐格相同；regionBedDelta = h₀ − bed 不小于 0，非水体区格为 0；
//   ④ planFootprints 的 probe（has、cells）按 (x, y) 字典序惰性给出父足迹的区格。
// 前提在测试里造（只改行输入与格空间，不经 loadWorld 的数据）：K = 1（每列取最近一个控制点）、起伏 0，所以 h₀ 只由各行形心的控制海拔定；h₀ 的期望不抄仓库读数，由同一计划标 bedOff 后读出。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { FOOTPRINT_KIND, planRegionFootprints, regionCellHeight, regionBedDelta, regionHeights, footprintHas, footprintCells, cellList } from '../../server-plugin/kernel/footprint.mjs';
import { fixedUnits } from '../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const GRID = Object.freeze({
  cellM: 1, storeyM: 3, regionCellM: 100, heightCtrlK: 1, reliefOctaves: 4, surfaceElevationMinM: -12000, surfaceElevationMaxM: 9000, fullTurnDeg: 360, facingDirections: 8,
});
const FLAT = () => ({ reliefM: 0, reliefRough: 0.5 });
const at = (x, y) => ({ x, y });
const row = (parent, extra = {}) => ({ parent, kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null, terrain: 'terrain_plain', anchorElevationM: null, waterKind: undefined, downstream: null, flowing: false, ...extra });
const river = (parent, boundary, downstream, anchorElevationM) => row(parent, { boundary, waterKind: 'water_river', flowing: true, downstream, anchorElevationM });
const BOX = { x0: 0, y0: 0, cellsX: 12, cellsY: 4 };
const plan0 = (rows) => {
  const r = planRegionFootprints(GRID, [{ w: 0, box: BOX, root: 'loc_root' }], rows);
  return { plan: r.plans.get(0), errors: r.errors };
};
const codesOf = (errors) => errors.map((e) => `${e.code} ${e.id}`);

// 12×4 区格。主河 loc_main 自西向东 (1,1)…(10,1) 十格（作者画，表序即流向序），下游是湖 loc_lake（种子 (11,1)，目标 3 格）；
// 支流 loc_trib 画 (5,3)、(5,2)（(5,2) 与主河第五格 (5,1) 四邻相接，汇入格 = 主河表序下标 4）；两座山 loc_h1（区格 (3,2)，20 m）、loc_h2（区格 (8,2)，90 m）各一格。
// 手算 h₀（K=1 取最近控制点，控制点是各行形心：山 (350,250)、(850,250)，主河 (600,150)，支流 (550,300)，湖 (1150,150)）：主河十格 (1,1)…(10,1) 的 h₀ 依次为
// 20、20、20、20（最近是西山）、50、50（最近是主河自己）、90、90、90（最近是东山）、30（最近是湖）——沿表序有上坡。
// 有支流时主河 bed 手算：前缀最小，汇入格下标 4 并入支流出口值 10（支流两格 h₀ 都是 10）：20、20、20、20、10、10、10、10、10、10（没有支流时 20 ×9、末格 30 → 20）；出口值 10。
// 湖三格 (11,0)(11,1)(11,2) 的 h₀ 都是 30（湖形心最近）：有主河这条上游时水底都是 min(30, 10) = 10。
const MAIN = Array.from({ length: 10 }, (_, i) => at(i + 1, 1));
const build = ({ tribDownstream = 'loc_main', mainDownstream = 'loc_lake' } = {}) => new Map([
  ['loc_root', row(null, { coord: at(600, 200), anchorElevationM: 60 })],
  ['loc_h1', row('loc_root', { coord: at(350, 250), targetAreaM2: 10000, anchorElevationM: 20 })],
  ['loc_h2', row('loc_root', { coord: at(850, 250), targetAreaM2: 10000, anchorElevationM: 90 })],
  ['loc_main', river('loc_root', MAIN, mainDownstream, 50)],
  ['loc_trib', river('loc_root', [at(5, 3), at(5, 2)], tribDownstream, 10)],
  ['loc_lake', row('loc_root', { coord: at(1150, 150), targetAreaM2: 30000, waterKind: 'water_sea', flowing: false, anchorElevationM: 30 })],
]);
const FX = (list) => list.map((v) => fixedUnits(v)); // 米 → 定点米（内核标度 10⁴）
const cellsOf = (plan, id) => cellList(plan, id); // (x, y) 字典序
// 某行足迹每格的高：bed 与 h₀（同一计划里先标 bedOff 读 h₀、再取消标记读 bed）。
const heightsOf = (plan, rows, id, cells = cellsOf(plan, id)) => {
  const read = () => cells.map((c) => regionCellHeight(GRID, 'seed_t', plan, rows, FLAT, c.x, c.y));
  plan.bedOff = true;
  const h0 = read();
  plan.bedOff = false;
  const bed = read();
  return { cells, h0, bed };
};

test('E-GRID-WATER-BAND：流水水体 boundary 表序首格之外每格都要与前面某一格四邻相接；静水与无 boundary 的流水行不受影响', () => {
  const mk = (boundary, extra = {}) => new Map([['loc_root', row(null, { coord: at(600, 200), anchorElevationM: 60 })], ['loc_w', river('loc_root', boundary, null, 10)]]).set('loc_w', { ...river('loc_root', boundary, null, 10), ...extra });
  // 整块四邻连通但表序第二格 (3,1) 与第一格 (1,1) 不相接：前缀不连通。
  assert.deepEqual(codesOf(plan0(mk([at(1, 1), at(3, 1), at(2, 1)])).errors), ['E-GRID-WATER-BAND loc_w']);
  // 顺着流向相接：通过。宽河（两格同序前进）也通过：每格只要与排在它前面的某一格相接。
  assert.deepEqual(plan0(mk([at(1, 1), at(2, 1), at(3, 1)])).errors, []);
  assert.deepEqual(plan0(mk([at(1, 1), at(1, 2), at(2, 1), at(2, 2)])).errors, []);
  // 同样的次序，静水（flowing 假）不报 E-GRID-WATER-BAND（不是流水，没有表序）。
  assert.deepEqual(codesOf(plan0(mk([at(1, 1), at(3, 1), at(2, 1)], { flowing: false, waterKind: 'water_sea' })).errors), []);
  // 流水而 boundary 为空：照派生划分，不报码（卷十 R10-2.12 的生成水体行）。
  assert.deepEqual(plan0(mk(null, { coord: at(250, 150), targetAreaM2: 30000 })).errors, []);
});

test('河床：处处 bed ≤ h₀，主河沿表序 bed 不升；h₀、bed 的手算数逐格相等（有一条支流汇入第五格）', () => {
  const rows = build();
  const { plan, errors } = plan0(rows);
  assert.deepEqual(errors, []);
  const m = heightsOf(plan, rows, 'loc_main', MAIN);
  assert.deepEqual(m.h0, FX([20, 20, 20, 20, 50, 50, 90, 90, 90, 30]));
  assert.deepEqual(m.bed, FX([20, 20, 20, 20, 10, 10, 10, 10, 10, 10]));
  for (let i = 0; i < MAIN.length; i += 1) assert.ok(m.bed[i] <= m.h0[i], `主河第 ${i} 格 bed 不高于 h₀`);
  for (let i = 1; i < MAIN.length; i += 1) assert.ok(m.bed[i] <= m.bed[i - 1], `主河第 ${i} 格 bed 不高于前一格`);
});

test('河进湖不上坡：湖各格水底取 min(h₀, 主河出口值)，只降不抬；没有上游时湖的 bed 就是 h₀', () => {
  const rows = build();
  const { plan } = plan0(rows);
  const lake = heightsOf(plan, rows, 'loc_lake');
  assert.deepEqual(lake.cells, [at(11, 0), at(11, 1), at(11, 2)]);
  assert.deepEqual(lake.h0, FX([30, 30, 30]));
  assert.deepEqual(lake.bed, FX([10, 10, 10])); // 主河出口值 = 主河各格 bed 之最小 = 10
  // 没有这条上游（主河不再指向湖）时湖按 h₀。
  const alone = build({ mainDownstream: null });
  const lakeAlone = heightsOf(plan0(alone).plan, alone, 'loc_lake');
  assert.deepEqual(lakeAlone.bed, FX([30, 30, 30]));
});

test('支流从汇入格起才影响干流：没有这条支流时主河 bed 为 20 ×10（前缀最小）；有支流时汇入格（下标 4）之前仍是 20，不被削平，之后降到支流出口值 10', () => {
  const noTrib = build({ tribDownstream: null });
  const withTrib = build();
  const mn = heightsOf(plan0(noTrib).plan, noTrib, 'loc_main', MAIN);
  const mw = heightsOf(plan0(withTrib).plan, withTrib, 'loc_main', MAIN);
  assert.deepEqual(mn.bed, FX([20, 20, 20, 20, 20, 20, 20, 20, 20, 20]));
  assert.deepEqual(mw.bed.slice(0, 4), mn.bed.slice(0, 4), '汇入格之上的四格逐格相同');
  assert.deepEqual(mw.bed.slice(4), FX([10, 10, 10, 10, 10, 10]));
  // 支流自己（两格 h₀ 都是 10）不受影响，出口值 10。
  const tr = heightsOf(plan0(withTrib).plan, withTrib, 'loc_trib');
  assert.deepEqual(tr.h0, FX([10, 10]));
  assert.deepEqual(tr.bed, FX([10, 10]));
});

test('bedOff：计划标了 bedOff 时一律取 h₀；regionBedDelta = h₀ − bed 不小于 0，非水体区格为 0；regionHeights 的水体行平均值取 bed', () => {
  const rows = build();
  const { plan } = plan0(rows);
  const m = heightsOf(plan, rows, 'loc_main', MAIN);
  for (let i = 0; i < MAIN.length; i += 1) {
    const d = regionBedDelta(GRID, 'seed_t', plan, rows, FLAT, MAIN[i].x, MAIN[i].y);
    assert.equal(d, m.h0[i] - m.bed[i]);
    assert.ok(d >= 0n);
  }
  assert.equal(regionBedDelta(GRID, 'seed_t', plan, rows, FLAT, 0, 0), 0n, '非水体区格没有修正');
  // 区域足迹的代表海拔（规则 13）取河床高：bed 平均 (20×4 + 10×6) ÷ 10 = 14（h₀ 平均是 (20×4 + 50×2 + 90×3 + 30) ÷ 10 = 48）。
  const mean = regionHeights(GRID, 'seed_avg', plan, rows, FLAT, 'loc_main').elevationM;
  assert.equal(mean, 14);
  // bedOff：与不接河床时逐格相同。
  plan.bedOff = true;
  const off = MAIN.map((c) => regionCellHeight(GRID, 'seed_t', plan, rows, FLAT, c.x, c.y));
  assert.deepEqual(off, m.h0);
});

test('probe：has 判区格是否在行足迹里（含后代的格）；cells 按 (x, y) 字典序惰性遍历，层根取整个外包框，与 cellList 同序同格', () => {
  const rows = build();
  const { plan } = plan0(rows);
  const lakeCells = cellList(plan, 'loc_lake');
  assert.deepEqual([...footprintCells(plan, 'loc_lake')], lakeCells);
  assert.deepEqual([...footprintCells(plan, 'loc_main')], MAIN);
  const rootCells = [...footprintCells(plan, 'loc_root')];
  assert.equal(rootCells.length, 12 * 4);
  assert.deepEqual(rootCells.slice(0, 5), [at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0)]);
  assert.equal(footprintHas(plan, 'loc_root', 11, 3), true);
  assert.equal(footprintHas(plan, 'loc_main', 3, 1), true);
  assert.equal(footprintHas(plan, 'loc_main', 3, 2), false);
  assert.equal(footprintHas(plan, 'loc_main', 99, 1), false);
  assert.equal(footprintHas(plan, 'loc_nope', 3, 1), false);
});
