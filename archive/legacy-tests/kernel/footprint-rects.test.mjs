// 格子迁移 G5b：boundary 的矩形之并写法（卷五 §2.1 :98、§4.1 规则 10 作者覆盖，封卷后勘误 1121k22）：与逐格写法是同一个区格集合，校验同一套。
// 期望值全部手算成字面量；格 = 区格序号，矩形左闭右开。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { FOOTPRINT_KIND, planRegionFootprints, cellList, regionGeometry, isRectEntry, rectsConnected } from '../../server-plugin/kernel/footprint.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
const GRID = Object.freeze({ cellM: 1, storeyM: 3, regionCellM: 100, fullTurnDeg: 360, facingDirections: 8 });
const region = (parent, extra = {}) => ({ parent, kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null, terrain: 'terrain_plain', anchorElevationM: null, ...extra });
const run = (rows, cellsX = 8, cellsY = 6) => {
  const r = planRegionFootprints(GRID, [{ w: 0, box: { x0: 0, y0: 0, cellsX, cellsY }, root: 'loc_root' }], new Map([['loc_root', region(null)], ...Object.entries(rows)]));
  return { plan: r.plans.get(0), codes: r.errors.map((e) => `${e.code} ${e.id}`) };
};
const rect = (x0, x1, y0, y1) => ({ x0, x1, y0, y1 });

test('矩形之并 = 逐格写法的同一集合：[0,2)×[0,2) 与 [1,4)×[1,3) 的并 = 4 + 6 − 重叠 1 格 (1,1) = 9 格；两种写法划出的足迹逐格相同', () => {
  const byRects = run({ loc_r: region('loc_root', { boundary: [rect(0, 2, 0, 2), rect(1, 4, 1, 3)] }) });
  assert.deepEqual(byRects.codes, []);
  // 手算并集：行 y=0：x 0,1；行 y=1：x 0,1,2,3；行 y=2：x 1,2,3。按 (x, y) 字典序：
  const want = [[0, 0], [0, 1], [1, 0], [1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]];
  assert.deepEqual(cellList(byRects.plan, 'loc_r').map((c) => [c.x, c.y]), want);
  assert.equal(byRects.plan.sizes.get('loc_r'), 9);
  const byCells = run({ loc_r: region('loc_root', { boundary: want.map(([x, y]) => ({ x, y })) }) });
  assert.deepEqual(cellList(byCells.plan, 'loc_r'), cellList(byRects.plan, 'loc_r'));
});

test('矩形之并的足迹不存格列表（cells 登记为 undefined，格由归属数组现扫），逐格写法存表序列表；面积 = 格数 × 区格面积（海 5 × 3 = 15 格 → 150,000 m²）', () => {
  const rects = run({ loc_sea: region('loc_root', { boundary: [rect(2, 7, 3, 6)] }) });
  assert.equal(rects.plan.cells.get('loc_sea'), undefined);
  assert.equal(rects.plan.cells.has('loc_sea'), true);
  assert.equal(rects.plan.sizes.get('loc_sea'), 15);
  assert.equal(regionGeometry(GRID, rects.plan, 'loc_sea').areaM2, 150000);
  const cells = run({ loc_r: region('loc_root', { boundary: [{ x: 3, y: 3 }, { x: 3, y: 2 }] }) });
  assert.deepEqual([...cells.plan.cells.get('loc_r')], [27, 19]); // 区格下标 y × 8 + x：(3,3) = 27、(3,2) = 19，表序保留
});

test('矩形之并的校验：不连通（只共一个角、或相隔）E-DIM-DOMAIN-RANGE；出父足迹 E-GRID-FOOTPRINT-OUTSIDE-PARENT；与兄弟相交 E-GRID-SIBLING-OVERLAP；公共边或相交即连通', () => {
  assert.deepEqual(run({ loc_a: region('loc_root', { boundary: [rect(0, 2, 0, 2), rect(2, 4, 2, 4)] }) }).codes, ['E-DIM-DOMAIN-RANGE loc_a']); // 只在角 (2,2) 相碰
  assert.deepEqual(run({ loc_a: region('loc_root', { boundary: [rect(0, 2, 0, 2), rect(3, 5, 0, 2)] }) }).codes, ['E-DIM-DOMAIN-RANGE loc_a']); // 相隔一列
  assert.deepEqual(run({ loc_a: region('loc_root', { boundary: [rect(0, 2, 0, 2), rect(2, 4, 1, 3)] }) }).codes, []); // 公共边 x=2、y∈[1,2)
  assert.deepEqual(run({ loc_a: region('loc_root', { boundary: [rect(6, 9, 0, 2)] }) }).codes, ['E-GRID-FOOTPRINT-OUTSIDE-PARENT loc_a']); // 外包框 x 0..7，9 越界
  const two = run({ loc_a: region('loc_root', { boundary: [rect(0, 3, 0, 3)] }), loc_b: region('loc_root', { boundary: [rect(2, 5, 2, 5)] }) });
  assert.deepEqual(two.codes, ['E-GRID-SIBLING-OVERLAP loc_b']); // (2,2) 两行都要
  assert.equal(rectsConnected([rect(0, 1, 0, 1)]), true);
  assert.equal(rectsConnected([]), true);
});

test('写法的拒收：矩形与逐格混写、矩形缺字段、x0 ≥ x1、非整数都报 E-DIM-STRUCT-FIELD；流水水体写矩形报 E-DIM-STRUCT-FIELD、逐格照旧', () => {
  const bad = (boundary, extra = {}) => run({ loc_a: region('loc_root', { boundary, ...extra }) }).codes;
  assert.deepEqual(bad([rect(0, 2, 0, 2), { x: 5, y: 5 }]), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([{ x0: 0, x1: 2, y0: 0 }]), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([rect(2, 2, 0, 2)]), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([rect(3, 1, 0, 2)]), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([rect(0, 1.5, 0, 2)]), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([rect(0, 2, 0, 2)], { flowing: true }), ['E-DIM-STRUCT-FIELD loc_a']);
  assert.deepEqual(bad([{ x: 0, y: 0 }, { x: 1, y: 0 }], { flowing: true }), []);
  assert.equal(isRectEntry({ x0: 0, x1: 1, y0: 0, y1: 1, x: 0 }), false);
});
