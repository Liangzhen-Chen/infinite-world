// 格子迁移 G3《足迹划分、zoneAt、place.mjs 包含校验与纬度》卡内测试之一：足迹几何纯函数（kernel/footprint.mjs）。
// 依据：卷五 §4.1 规则 2（足迹种类只按组件类判）、规则 3（包含与不重叠）、规则 5（直线距离 straightM）、规则 10（区域足迹划分）、
// 规则 12（zoneAt）、规则 13（派生几何量）、规则 14（落格）、§4.2 规则 12–13（方位角与前后左右）、§4.14 规则 2（相邻是派生）、规则 9（开阔边界出口）。
// 对照表 docs/迁移体检/格子G1-G5-规矩检查对照.md 第 18、19、20、21、22、25、26、27、28 行。
// 期望值全部按卷文规则手算成字面量，推算过程写在各用例注释里；不读仓库此刻的计数。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import {
  FOOTPRINT_KIND, footprintKindOf, planRegionFootprints, regionOfPos, zoneOfPos, cellList, regionGeometry, regionHeights, regionCellPos,
  landRegionCell, accessCell, openBoundaryCells, footprintAdjacency, straightFixed, bearingView,
} from '../../server-plugin/kernel/footprint.mjs';
import { fixedUnits } from '../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数与 sqrt/atan 表
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

// 夹具常数照 world/rules/tables/grid.json（卷五 §2.3 :271，拍板第 1 条；值只作测试前提）。
const GRID = Object.freeze({
  cellM: 1, storeyM: 3, regionCellM: 100, heightCtrlK: 4, reliefOctaves: 4, surfaceElevationMinM: -12000, surfaceElevationMaxM: 9000, fullTurnDeg: 360, facingDirections: 8,
});
const box = (cellsX, cellsY) => ({ x0: 0, y0: 0, cellsX, cellsY });
const row = (parent, extra = {}) => ({ parent, kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null, terrain: 'terrain_plain', anchorElevationM: null, ...extra });
const at = (x, y) => ({ x, y });
const rowsOf = (entries) => new Map(entries);
const plan0 = (rows, b) => {
  const r = planRegionFootprints(GRID, [{ w: 0, box: b, root: 'loc_root' }], rows);
  return { plan: r.plans.get(0), errors: r.errors };
};
const codesOf = (errors) => errors.map((e) => `${e.code} ${e.id}`);

// ---------- 规则 2：足迹种类只按组件类判（对照表第 18 行） ----------

test('规则 2：足迹种类只按组件类判，次序固定；没有 id 与名字的参与', () => {
  const S = (...c) => new Set(c);
  assert.equal(footprintKindOf(S('comp_facility'), []), 'building');
  assert.equal(footprintKindOf(S('comp_zone'), [S('comp_facility')]), 'room'); // 有挂 comp_facility 的祖先
  assert.equal(footprintKindOf(S('comp_zone'), [S('comp_region')]), 'region'); // 没有建筑祖先的 comp_zone 属"其余各行"
  assert.equal(footprintKindOf(S('comp_volume'), [S('comp_region')]), 'volume');
  assert.equal(footprintKindOf(S('comp_layer_root'), []), 'region'); // 层根是它那个格空间的全域区域足迹
  assert.equal(footprintKindOf(S('comp_region', 'comp_tract'), []), 'region');
  assert.equal(footprintKindOf(S(), []), 'region');
  // 次序：建筑先于房间先于体积。
  assert.equal(footprintKindOf(S('comp_facility', 'comp_zone', 'comp_volume'), [S('comp_facility')]), 'building');
  assert.equal(footprintKindOf(S('comp_zone', 'comp_volume'), [S('comp_facility')]), 'room');
});

// ---------- 规则 10：区域足迹划分（对照表第 20 行） ----------

// 4×4 区格（400 m 见方），根 loc_root；子行 loc_a 种子 (50,50)→区格 (0,0)，loc_b 种子 (350,350)→区格 (3,3)，都没有目标面积。
// 手算（卷五 §4.1 规则 10）：平分 16 − 0 − 0 = 16 格 → 各 8 格。多源同步生长，每轮按 id 序，取离自己种子直线最近的四邻空格（距离平方并列取 (x,y) 字典序小）：
//   a：(0,1)→(1,0)→(1,1)→(0,2)→(2,0)→(1,2)→(0,3)；b：(2,3)→(3,2)→(2,2)→(1,3)→(3,1)→(2,1)→(3,0)（第 6 轮 b 想取的 (1,2) 已被 a 本轮先取，改取 (2,1)）。
const A_CELLS = [at(0, 0), at(0, 1), at(0, 2), at(0, 3), at(1, 0), at(1, 1), at(1, 2), at(2, 0)];
const B_CELLS = [at(1, 3), at(2, 1), at(2, 2), at(2, 3), at(3, 0), at(3, 1), at(3, 2), at(3, 3)];
const sample = (order) => rowsOf(order.map((id) => [id, {
  loc_root: row(null, { coord: at(200, 200) }),
  loc_a: row('loc_root', { coord: at(50, 50) }),
  loc_b: row('loc_root', { coord: at(350, 350) }),
}[id]]));

test('规则 10：多源同步生长，两个无目标子行平分父足迹（手算 8 + 8），根没有剩余', () => {
  const { plan, errors } = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4));
  assert.deepEqual(errors, []);
  assert.deepEqual(cellList(plan, 'loc_a'), A_CELLS);
  assert.deepEqual(cellList(plan, 'loc_b'), B_CELLS);
  assert.equal(cellList(plan, 'loc_root').length, 16); // 父足迹含全部子足迹的格
});

test('规则 10：打乱行的存放顺序，划分逐格相同（A5-1.2）', () => {
  const orders = [['loc_root', 'loc_b', 'loc_a'], ['loc_b', 'loc_a', 'loc_root'], ['loc_a', 'loc_root', 'loc_b']];
  for (const o of orders) {
    const { plan } = plan0(sample(o), box(4, 4));
    assert.deepEqual(cellList(plan, 'loc_a'), A_CELLS, o.join());
    assert.deepEqual(cellList(plan, 'loc_b'), B_CELLS, o.join());
  }
});

test('规则 10：同一输入派生两次逐格相同（确定性）', () => {
  const x = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4)).plan;
  const y = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4)).plan;
  assert.deepEqual([...x.owner], [...y.owner]);
  assert.equal(x.queued, null); // 生长用的排队标记划完即释放，不常驻
});

test('规则 10：目标面积向上取整、没有目标者平分余下（5×1 区格：目标 20000 m² → 2 格，余 3 格归无目标者）', () => {
  // 20000 ÷ 100² = 2 格（整除）；余 5 − 0 − 2 = 3 格给 loc_d。c：(0,0)→(1,0)；d：(4,0)→(3,0)→(2,0)。
  const rows = rowsOf([['loc_root', row(null, { coord: at(250, 50) })], ['loc_c', row('loc_root', { coord: at(50, 50), targetAreaM2: 20000 })], ['loc_d', row('loc_root', { coord: at(450, 50) })]]);
  const { plan, errors } = plan0(rows, box(5, 1));
  assert.deepEqual(errors, []);
  assert.deepEqual(cellList(plan, 'loc_c'), [at(0, 0), at(1, 0)]);
  assert.deepEqual(cellList(plan, 'loc_d'), [at(2, 0), at(3, 0), at(4, 0)]);
  // 20001 ÷ 10000 向上取整 = 3 格：c 取 3 格，余 5 − 3 = 2 格给 d。
  const rows2 = rowsOf([['loc_root', row(null, { coord: at(250, 50) })], ['loc_c', row('loc_root', { coord: at(50, 50), targetAreaM2: 20001 })], ['loc_d', row('loc_root', { coord: at(450, 50) })]]);
  const p2 = plan0(rows2, box(5, 1)).plan;
  assert.deepEqual(cellList(p2, 'loc_c'), [at(0, 0), at(1, 0), at(2, 0)]);
  assert.deepEqual(cellList(p2, 'loc_d'), [at(3, 0), at(4, 0)]);
});

test('规则 10：目标之和超过父格数时无格可取即停，没有目标者各取 1 格（5×1 区格：c 要 6 格）', () => {
  // c 目标 60000 m² = 6 格；余 5 − 0 − 6 = −1 ≤ 0，d 取 1 格：d 只有种子 (4,0)；c 从 (0,0) 长到 (3,0) 后无格可取，只有 4 格。
  const rows = rowsOf([['loc_root', row(null, { coord: at(250, 50) })], ['loc_c', row('loc_root', { coord: at(50, 50), targetAreaM2: 60000 })], ['loc_d', row('loc_root', { coord: at(450, 50) })]]);
  const { plan, errors } = plan0(rows, box(5, 1));
  assert.deepEqual(errors, []);
  assert.deepEqual(cellList(plan, 'loc_c'), [at(0, 0), at(1, 0), at(2, 0), at(3, 0)]);
  assert.deepEqual(cellList(plan, 'loc_d'), [at(4, 0)]);
});

test('规则 10：剩下没被占的区格归父行自己（野外）', () => {
  // 3×1：子行目标各 1 格（10000 m²），种子 (0,0) 与 (2,0)；中间 (1,0) 无人要，zoneOfPos 取到父行。
  const rows = rowsOf([['loc_root', row(null, { coord: at(150, 50) })], ['loc_c', row('loc_root', { coord: at(50, 50), targetAreaM2: 10000 })], ['loc_d', row('loc_root', { coord: at(250, 50), targetAreaM2: 10000 })]]);
  const { plan } = plan0(rows, box(3, 1));
  const plans = new Map([[0, plan]]);
  assert.equal(zoneOfPos(GRID, plans, { w: 0, x: 150, y: 50 }), 'loc_root');
  assert.equal(zoneOfPos(GRID, plans, { w: 0, x: 50, y: 50 }), 'loc_c');
  assert.equal(zoneOfPos(GRID, plans, { w: 0, x: 299, y: 99 }), 'loc_d');
});

test('规则 10 作者覆盖：boundary 先于派生占格；其余子行在剩下的格里长（3×3：boundary 取中心格，loc_f 长 8 格）', () => {
  const rows = rowsOf([['loc_root', row(null, { coord: at(150, 150) })], ['loc_e', row('loc_root', { boundary: [at(1, 1)] })], ['loc_f', row('loc_root', { coord: at(50, 50) })]]);
  const { plan, errors } = plan0(rows, box(3, 3));
  assert.deepEqual(errors, []);
  assert.deepEqual(cellList(plan, 'loc_e'), [at(1, 1)]);
  // 余 9 − 1 = 8 格全归 loc_f（环绕中心格四邻连通可达）。
  assert.equal(cellList(plan, 'loc_f').length, 8);
  assert.ok(!cellList(plan, 'loc_f').some((c) => c.x === 1 && c.y === 1));
});

test('规则 10 校验：同父两个种子在同一区格 → E-GRID-SEED-SAME-CELL（建筑与所在村同点、路长为 0 这类数据由此报出）', () => {
  const rows = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_g', row('loc_root', { coord: at(50, 50) })], ['loc_h', row('loc_root', { coord: at(60, 70) })]]);
  const { errors } = plan0(rows, box(4, 4));
  assert.deepEqual(codesOf(errors), ['E-GRID-SEED-SAME-CELL loc_h']); // id 小的 loc_g 留着种子
});

test('规则 3/10 校验：种子或边界不在父足迹内 → E-GRID-FOOTPRINT-OUTSIDE-PARENT；种子压在兄弟边界里、边界与兄弟边界相交 → E-GRID-SIBLING-OVERLAP', () => {
  const outside = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_i', row('loc_root', { coord: at(5000, 50) })]]);
  assert.deepEqual(codesOf(plan0(outside, box(4, 4)).errors), ['E-GRID-FOOTPRINT-OUTSIDE-PARENT loc_i']);
  const negative = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_i', row('loc_root', { coord: at(-1, 50) })]]);
  assert.deepEqual(codesOf(plan0(negative, box(4, 4)).errors), ['E-GRID-FOOTPRINT-OUTSIDE-PARENT loc_i']); // −1 m 向下取整在区格 −1，在外包框外
  const bOut = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_i', row('loc_root', { boundary: [at(4, 0)] })]]);
  assert.deepEqual(codesOf(plan0(bOut, box(4, 4)).errors), ['E-GRID-FOOTPRINT-OUTSIDE-PARENT loc_i']);
  const seedInCover = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_j', row('loc_root', { boundary: [at(0, 0)] })], ['loc_k', row('loc_root', { coord: at(50, 50) })]]);
  assert.deepEqual(codesOf(plan0(seedInCover, box(4, 4)).errors), ['E-GRID-SIBLING-OVERLAP loc_k']);
  const overlap = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_j', row('loc_root', { boundary: [at(0, 0), at(1, 0)] })], ['loc_k', row('loc_root', { boundary: [at(1, 0), at(2, 0)] })]]);
  assert.deepEqual(codesOf(plan0(overlap, box(4, 4)).errors), ['E-GRID-SIBLING-OVERLAP loc_k']);
});

test('规则 10 校验：boundary 须四邻连通，缺 coord 的派生子行报缺必填；出错的子行不划格，也不连累别的兄弟', () => {
  const rows = rowsOf([['loc_root', row(null, { coord: at(200, 200) })], ['loc_j', row('loc_root', { boundary: [at(0, 0), at(2, 2)] })], ['loc_l', row('loc_root', {})], ['loc_m', row('loc_root', { coord: at(350, 350), targetAreaM2: 10000 })]]);
  const { plan, errors } = plan0(rows, box(4, 4));
  assert.deepEqual(codesOf(errors).sort(), ['E-DIM-DOMAIN-RANGE loc_j', 'E-DIM-REQUIRED-MISSING loc_l']);
  assert.deepEqual(cellList(plan, 'loc_m'), [at(3, 3)]);
  assert.deepEqual(cellList(plan, 'loc_l'), []);
});

test('规则 3：子足迹 ⊆ 父足迹、兄弟不相交（嵌套两层，抽样全部区格恰属一个最深行）', () => {
  // 4×4：loc_a、loc_b 同上例；loc_a 之下 loc_a1 种子 (50,150)→区格 (0,1)，目标 20000 m² = 2 格。a1 取 (0,1) 后四邻 (0,0)、(0,2)、(1,1)：距离平方 1、1、1，并列取 (x,y) 小的 (0,0)。
  const rows = sample(['loc_root', 'loc_a', 'loc_b']);
  rows.set('loc_a1', row('loc_a', { coord: at(50, 150), targetAreaM2: 20000 }));
  const { plan, errors } = plan0(rows, box(4, 4));
  assert.deepEqual(errors, []);
  const a1 = cellList(plan, 'loc_a1');
  assert.deepEqual(a1, [at(0, 0), at(0, 1)]);
  const aSet = new Set(cellList(plan, 'loc_a').map((c) => `${c.x},${c.y}`));
  for (const c of a1) assert.ok(aSet.has(`${c.x},${c.y}`), `a1 ⊆ a: ${c.x},${c.y}`);
  const seen = new Map();
  for (const id of ['loc_a', 'loc_b']) for (const c of cellList(plan, id)) { assert.ok(!seen.has(`${c.x},${c.y}`), 'siblings disjoint'); seen.set(`${c.x},${c.y}`, id); }
  const plans = new Map([[0, plan]]);
  for (let ry = 0; ry < 4; ry += 1) for (let rx = 0; rx < 4; rx += 1) {
    const z = zoneOfPos(GRID, plans, { w: 0, x: rx * 100 + 50, y: ry * 100 + 50 });
    const want = a1.some((c) => c.x === rx && c.y === ry) ? 'loc_a1' : seen.get(`${rx},${ry}`);
    assert.equal(z, want, `cell ${rx},${ry}`);
  }
});

test('离场行与它的后代、非区域足迹行、自己开格空间的层根都不参加划分（规则 3 末句、规则 8）', () => {
  const rows = sample(['loc_root', 'loc_a', 'loc_b']);
  rows.set('loc_off', row(null, { offstage: true, coord: at(250, 250) }));
  rows.set('loc_off_kid', row('loc_off', { offstage: true, coord: at(250, 250) }));
  rows.set('loc_bld', row('loc_a', { kind: FOOTPRINT_KIND.building }));
  const { plan, errors } = plan0(rows, box(4, 4));
  assert.deepEqual(errors, []);
  assert.deepEqual(cellList(plan, 'loc_a'), A_CELLS); // 没被它们改动
  assert.ok(!plan.cells.has('loc_off') && !plan.cells.has('loc_off_kid') && !plan.cells.has('loc_bld'));
});

// ---------- 规则 12：zoneAt（对照表第 21 行） ----------

test('规则 12：位置在外包框之外、格空间不存在为未知；负坐标向下取整；coarse 位置照存的格求', () => {
  const plans = new Map([[0, plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4)).plan]]);
  const z = (p) => zoneOfPos(GRID, plans, p);
  assert.equal(z({ w: 0, x: 0, y: 0, z: 0, coarse: false }), 'loc_a');
  assert.equal(z({ w: 0, x: 399, y: 399, z: 0, coarse: true }), 'loc_b'); // 区格 (3,3)，coarse 照存的格求
  assert.equal(z({ w: 0, x: 400, y: 0, z: 0, coarse: false }), null); // 区格 (4,0) 在外包框外
  assert.equal(z({ w: 0, x: -1, y: 0, z: 0, coarse: false }), null); // floor(−1/100) = −1
  assert.equal(z({ w: 1, x: 0, y: 0, z: 0, coarse: false }), null); // 格空间不存在
  assert.deepEqual(regionOfPos(GRID, { x: -1, y: 250 }), { x: -1, y: 2 });
  assert.deepEqual(regionOfPos(GRID, { x: 199, y: 200 }), { x: 1, y: 2 });
});

// ---------- 规则 13：派生几何量（对照表第 22 行） ----------

test('规则 13：areaM2 = 区格数 × regionCellM²；centroid = 区格中心的平均（手算）', () => {
  const { plan } = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4));
  // a：8 区格 × 100² = 80000 m²。中心 x：50×4（x=0 四格）+150×3+250 = 900，÷8 = 112.5；中心 y：y=0,1,2,3,0,1,2,0 → 50,150,250,350,50,150,250,50 = 1300，÷8 = 162.5。
  assert.deepEqual(regionGeometry(GRID, plan, 'loc_a'), { cellCount: 8, areaM2: 80000, centroid: { x: 112.5, y: 162.5 } });
  // 根：16 区格 = 160000 m²，形心 (200, 200)。
  assert.deepEqual(regionGeometry(GRID, plan, 'loc_root'), { cellCount: 16, areaM2: 160000, centroid: { x: 200, y: 200 } });
  assert.equal(regionGeometry(GRID, plan, 'loc_none'), null);
});

test('规则 13：形心变化纬度的输入随之变化——换种子让足迹形状变，形心跟着变（区格粒度，向零截断）', () => {
  // 3×1，c 目标 1 格：种子在 (0,0) 时形心 x = 50；种子在 (2,0) 时形心 x = 250。
  const mk = (sx) => plan0(rowsOf([['loc_root', row(null, { coord: at(150, 50) })], ['loc_c', row('loc_root', { coord: at(sx, 50), targetAreaM2: 10000 })]]), box(3, 1)).plan;
  assert.equal(regionGeometry(GRID, mk(50), 'loc_c').centroid.x, 50);
  assert.equal(regionGeometry(GRID, mk(250), 'loc_c').centroid.x, 250);
  // 负坐标的平均向零截断：区格 (−1,0) 与 (0,0)（中心 −50、50）平均 0；(−2,0)、(−1,0)、(0,0) 中心 −150、−50、50 平均 −50。
  const negBox = { x0: -2, y0: 0, cellsX: 3, cellsY: 1 };
  const np = planRegionFootprints(GRID, [{ w: 0, box: negBox, root: 'loc_root' }], rowsOf([['loc_root', row(null, { coord: at(-50, 50) })]])).plans.get(0);
  assert.equal(regionGeometry(GRID, np, 'loc_root').centroid.x, -50);
});

// 2×1 区格：根（anchorElevationM 100）下 loc_a（种子 (50,50)，目标 1 格，anchorElevationM 0）、loc_b（种子 (150,50)，anchorElevationM 200）。
// reliefM = 0 使起伏为 0：控制点是 a (50,50)=0、b (150,50)=200（层根不是控制点，其 anchorElevationM 不入控制面）；区格中心 (50,50) 恰在 a 的形心上 → h = 0；(150,50) 恰在 b 上 → h = 200。
// 地表层号 floor(h ÷ 3)：0 → 0；200 → 66。
const hrows = () => rowsOf([
  ['loc_root', row(null, { coord: at(100, 50), anchorElevationM: 100 })],
  ['loc_a', row('loc_root', { coord: at(50, 50), targetAreaM2: 10000, anchorElevationM: 0 })],
  ['loc_b', row('loc_root', { coord: at(150, 50), anchorElevationM: 200 })],
]);
const FLAT = () => ({ reliefM: 0, reliefRough: 0.5 });

// 卷五 §4.3 规则 8 :656（G5a 修改轮必须改 2）：控制点是全部区域足迹行（层根除外），最近 K 个里任一个海拔未知，这一列的 h 即未知，不跳过它、不借别的点。
test('控制点未知传播：最近控制点缺 anchorElevationM 则该列高度未知；更近的点有值时远处的缺值点不影响（K=1 手算）；层根不是控制点', () => {
  // 2×1 区格，同上夹具但 loc_a 缺海拔：K=4 时两个控制点 a、b 都入选。区格 (0,0) 中心 (50,50) 恰在缺值的 a 上 → 未知；
  // 区格 (1,0) 中心 (150,50) 恰在有值的 b 的形心上 → 取该点的值 200（卷五 :656 "恰在某控制点上时取该点的值"，结果不依赖 a，不因 a 缺值而未知），层号 floor(200÷3) = 66。
  // 所以 loc_a 未知、loc_b = {200, [66,66]}；loc_root 含区格 (0,0)，未知。
  const rows = hrows();
  rows.get('loc_a').anchorElevationM = null;
  const { plan } = plan0(rows, box(2, 1));
  assert.deepEqual(regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_b'), { elevationM: 200, zRange: { zMin: 66, zMax: 66 } });
  for (const id of ['loc_a', 'loc_root']) assert.equal(regionHeights(GRID, 'seed_t', plan, rows, FLAT, id), null, id);
  // K=1：每列只取最近的一个控制点。区格 (1,0) 中心 (150,50) 恰在 b 的形心上 → h = 200（b 有值，不受 a 缺值影响）；区格 (0,0) 中心 (50,50) 恰在 a 的形心上 → 未知。
  const g1 = { ...GRID, heightCtrlK: 1 };
  const p1 = plan0(rows, box(2, 1)).plan;
  assert.deepEqual(regionHeights(g1, 'seed_t', p1, rows, FLAT, 'loc_b'), { elevationM: 200, zRange: { zMin: 66, zMax: 66 } });
  assert.equal(regionHeights(g1, 'seed_t', p1, rows, FLAT, 'loc_a'), null);
  // 3×1 区格：根（层根，anchorElevationM 999，形心在 (150,50)）、a 种子 (50,50) 1 格海拔 0、b 种子 (250,50) 1 格海拔 200，区格 (1,0) 归根。
  // 层根除外时控制点只有 a、b：(150,50) 到两者距离平方都是 100²，权相等 → h = (0 + 200) ÷ 2 = 100；若误把层根当控制点（形心恰在该列上）会取 999。
  // 根的 elevationM = (0 + 100 + 200) ÷ 3 = 100，层号 floor(0÷3) = 0、floor(100÷3) = 33、floor(200÷3) = 66 → zRange [0, 66]。
  const r3 = rowsOf([
    ['loc_root', row(null, { coord: at(150, 50), anchorElevationM: 999 })],
    ['loc_a', row('loc_root', { coord: at(50, 50), targetAreaM2: 10000, anchorElevationM: 0 })],
    ['loc_b', row('loc_root', { coord: at(250, 50), targetAreaM2: 10000, anchorElevationM: 200 })],
  ]);
  const p3 = plan0(r3, box(3, 1)).plan;
  assert.deepEqual(regionHeights(GRID, 'seed_t', p3, r3, FLAT, 'loc_root'), { elevationM: 100, zRange: { zMin: 0, zMax: 66 } });
});

test('规则 13：elevationM 取各区格中心列 h 的平均，zRange 取层号最小最大（手算：a 0 与 [0,0]；b 200 与 [66,66]；根 100 与 [0,66]）', () => {
  const rows = hrows();
  const { plan, errors } = plan0(rows, box(2, 1));
  assert.deepEqual(errors, []);
  assert.deepEqual(regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_a'), { elevationM: 0, zRange: { zMin: 0, zMax: 0 } });
  assert.deepEqual(regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_b'), { elevationM: 200, zRange: { zMin: 66, zMax: 66 } });
  assert.deepEqual(regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_root'), { elevationM: 100, zRange: { zMin: 0, zMax: 66 } });
  // 没有世界种子、或 terrain 条目读不到：未知（null），不借别的量。
  assert.equal(regionHeights(GRID, undefined, plan, rows, FLAT, 'loc_a'), null);
  // terrain 条目读不到（用新计划：高度按（世界种子，行）缓存在计划上，同一计划换 terrainOf 不重算）。
  const fresh = plan0(rows, box(2, 1)).plan;
  assert.equal(regionHeights(GRID, 'seed_t', fresh, rows, () => null, 'loc_a'), null);
  // 缓存：同一计划、同世界种子再读同一行返回同一份结果。
  assert.equal(regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_b'), regionHeights(GRID, 'seed_t', plan, rows, FLAT, 'loc_b'));
});

test('规模（卷五 §4.1.4）：2,000 × 2,000 区格外包框（400 万格）、三层树划分在本机几秒内跑完——总格数守恒、同一输入再划一次归属逐位相同、相邻集只算一次', () => {
  // 根 → 两个省（目标各 1,200,000 与 1,000,000 格）→ 省 p1 下两个郡（目标各 300,000 格，其余归省野外）。种子各在自己的角上。
  const big = box(2000, 2000);
  const cell = 10000; // 一格的面积 m²
  const rows = rowsOf([
    ['loc_root', row(null, { coord: at(100000, 100000) })],
    ['loc_p1', row('loc_root', { coord: at(50, 50), targetAreaM2: 1200000 * cell })],
    ['loc_p2', row('loc_root', { coord: at(199950, 199950), targetAreaM2: 1000000 * cell })],
    ['loc_c1', row('loc_p1', { coord: at(50, 50), targetAreaM2: 300000 * cell })],
    ['loc_c2', row('loc_p1', { coord: at(50, 100050), targetAreaM2: 300000 * cell })],
  ]);
  const { plan, errors } = plan0(rows, big);
  assert.deepEqual(errors, []);
  const n = (id) => plan.sizes.get(id);
  assert.equal(n('loc_root'), 4000000);
  assert.equal(n('loc_p1'), 1200000);
  assert.equal(n('loc_p2'), 1000000);
  assert.equal(n('loc_c1'), 300000);
  assert.equal(n('loc_c2'), 300000);
  // 守恒：归属数组里各行的格数之和 = 总格数；p1 的足迹 = 自己野外 + 两个郡。
  const count = new Map();
  for (let k = 0; k < plan.total; k += 1) count.set(plan.owner[k], (count.get(plan.owner[k]) || 0) + 1);
  const own = (id) => count.get(plan.idx.get(id)) || 0;
  assert.equal(own('loc_root') + own('loc_p1') + own('loc_p2') + own('loc_c1') + own('loc_c2'), 4000000);
  assert.equal(own('loc_p1') + own('loc_c1') + own('loc_c2'), 1200000);
  assert.equal(own('loc_root'), 4000000 - 1200000 - 1000000);
  // 与小算法逐格一致：同一输入再划一次，归属数组逐位相同（确定性）。
  const again = plan0(rows, big).plan;
  assert.ok(Buffer.from(plan.owner.buffer).equals(Buffer.from(again.owner.buffer)));
  // 相邻集只算一次（缓存同一个 Map）。
  assert.equal(footprintAdjacency(plan), footprintAdjacency(plan));
});

test('规则 14 / §3.1 regionCell：区格中心列地表层那一格，coarse 为真；区格在外包框外为未知', () => {
  const rows = hrows();
  const { plan } = plan0(rows, box(2, 1));
  // 细格序号 = 区格序号 × (regionCellM ÷ cellM = 100) + 50；z 取上例的层号。
  assert.deepEqual(regionCellPos(GRID, 'seed_t', plan, rows, FLAT, 0, 0), { w: 0, x: 50, y: 50, z: 0, coarse: true });
  assert.deepEqual(regionCellPos(GRID, 'seed_t', plan, rows, FLAT, 1, 0), { w: 0, x: 150, y: 50, z: 66, coarse: true });
  assert.equal(regionCellPos(GRID, 'seed_t', plan, rows, FLAT, 2, 0), null);
  // 落出的代表格 zoneAt 就是它所在的地点（规则 14：zoneAt 给出的仍是它真在的地点）。
  const plans = new Map([[0, plan]]);
  assert.equal(zoneOfPos(GRID, plans, regionCellPos(GRID, 'seed_t', plan, rows, FLAT, 1, 0)), 'loc_b');
});

test('规则 14 落格：只在 zoneAt 恰为该地点的区格里取（后代足迹里的不算）；同输入同结果；无可落区格为未知', () => {
  // 3×1：根下 loc_a 取 (0,0)（目标 1 格）、loc_b 取 (2,0)；根自己只剩 (1,0)。
  const rows = rowsOf([
    ['loc_root', row(null, { coord: at(150, 50), anchorElevationM: 100 })],
    ['loc_a', row('loc_root', { coord: at(50, 50), targetAreaM2: 10000, anchorElevationM: 0 })],
    ['loc_b', row('loc_root', { coord: at(250, 50), targetAreaM2: 10000, anchorElevationM: 0 })],
  ]);
  const { plan } = plan0(rows, box(3, 1));
  const land = (id, key) => landRegionCell(GRID, 'seed_t', plan, rows, FLAT, id, key, (p) => zoneOfPos(GRID, new Map([[0, plan]]), p) === id);
  // 根的足迹含 3 格，但 zoneAt 恰为根的只有 (1,0)；落格只可能落在 (1,0)：x = 100 + 50。
  const r1 = land('loc_root', 'k1');
  assert.deepEqual([r1.w, r1.x, r1.y, r1.coarse], [0, 150, 50, true]);
  assert.deepEqual(land('loc_root', 'k1'), r1); // 纯函数
  assert.deepEqual(land('loc_a', 'k9'), { w: 0, x: 50, y: 50, z: 0, coarse: true });
  assert.equal(land('loc_none', 'k1'), null);
  // 子行占满父足迹的全部区格时，父行没有可落的区格 → 未知，不落到别的地点。
  const full = rowsOf([['loc_root', row(null, { coord: at(50, 50), anchorElevationM: 0 })], ['loc_a', row('loc_root', { coord: at(50, 50), anchorElevationM: 0 })]]);
  const pf = plan0(full, box(2, 1)).plan;
  assert.equal(landRegionCell(GRID, 'seed_t', pf, full, FLAT, 'loc_root', 'k1', (p) => zoneOfPos(GRID, new Map([[0, pf]]), p) === 'loc_root'), null);
});

// ---------- §4.14 规则 2：相邻是派生；规则 9 开阔边界；规则 4 接入格 ----------

test('§4.14 规则 2：足迹有一对四邻接区格即相邻，祖先与后代不算；新增一个区域足迹子行相邻集自动派生', () => {
  const rows = rowsOf([
    ['loc_root', row(null, { coord: at(150, 50) })],
    ['loc_a', row('loc_root', { coord: at(50, 50), targetAreaM2: 10000 })],
    ['loc_b', row('loc_root', { coord: at(150, 50), targetAreaM2: 10000 })],
    ['loc_c', row('loc_root', { coord: at(250, 50), targetAreaM2: 10000 })],
  ]);
  const adj = footprintAdjacency(plan0(rows, box(3, 1)).plan);
  assert.deepEqual([...adj.get('loc_a')], ['loc_b']);
  assert.deepEqual([...adj.get('loc_b')].sort(), ['loc_a', 'loc_c']);
  assert.deepEqual([...adj.get('loc_c')], ['loc_b']);
  assert.ok(!adj.has('loc_root')); // 祖先与后代不算相邻
  // 加一个子行（不改任何代码、不手填邻居）：4×1，loc_d 取 (3,0)，与 loc_c 相邻。
  rows.set('loc_d', row('loc_root', { coord: at(350, 50), targetAreaM2: 10000 }));
  const adj2 = footprintAdjacency(plan0(rows, box(4, 1)).plan);
  assert.deepEqual([...adj2.get('loc_d')], ['loc_c']);
  assert.deepEqual([...adj2.get('loc_c')].sort(), ['loc_b', 'loc_d']);
});

test('§4.14 规则 2：嵌套下相邻按独有的行配对（a1 在 a 内，贴着 b：a1 与 b 相邻、a 与 b 也相邻，a1 与 a 不相邻）', () => {
  const rows = rowsOf([
    ['loc_root', row(null, { coord: at(150, 50) })],
    ['loc_a', row('loc_root', { coord: at(50, 50), targetAreaM2: 20000 })],
    ['loc_a1', row('loc_a', { coord: at(150, 50), targetAreaM2: 10000 })],
    ['loc_b', row('loc_root', { coord: at(350, 50), targetAreaM2: 20000 })],
  ]);
  // 4×1：a 取 (0,0)(1,0)；a1 取 (1,0)；b 取 (3,0)(2,0)（b 种子 (3,0)，长到 (2,0)）。a1 的右邻 (2,0) 属 b。
  const { plan, errors } = plan0(rows, box(4, 1));
  assert.deepEqual(errors, []);
  const adj = footprintAdjacency(plan);
  assert.deepEqual([...adj.get('loc_a1')], ['loc_b']);
  assert.deepEqual([...adj.get('loc_a')], ['loc_b']);
  assert.deepEqual([...adj.get('loc_b')].sort(), ['loc_a', 'loc_a1']);
});

test('规则 9 开阔边界：足迹里与外侧（外包框内、不属本行）相邻的区格，一格一项按 (x,y) 字典序；整个外包框没有外侧', () => {
  const { plan } = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4));
  // a 的格里与 b 的格相邻者（手查）：(0,3)↔(1,3)、(1,1)↔(2,1)、(1,2)↔(2,2)、(2,0)↔(3,0)(2,1)。
  assert.deepEqual(openBoundaryCells(plan, 'loc_a'), [at(0, 3), at(1, 1), at(1, 2), at(2, 0)]);
  assert.deepEqual(openBoundaryCells(plan, 'loc_root'), []);
});

test('规则 4 接入格：足迹内离目标点最近的区格，并列取 (x,y) 字典序最小', () => {
  const { plan } = plan0(sample(['loc_root', 'loc_a', 'loc_b']), box(4, 4));
  // a 的格中心里离 (350,350) 最近的是 (1,2)（中心 (150,250)，距离平方 200²+100² = 50000；其余 (1,1) 80000、(0,3) 90000、(2,0) 100000）。
  assert.deepEqual(accessCell(GRID, plan, 'loc_a', fixedUnits(350), fixedUnits(350)), at(1, 2));
  // 目标点 (100,50) 到 (0,0) 中心 (50,50) 与 (1,0) 中心 (150,50) 等距（2500）→ 取 (0,0)。
  assert.deepEqual(accessCell(GRID, plan, 'loc_a', fixedUnits(100), fixedUnits(50)), at(0, 0));
});

// ---------- 规则 5：straightM（对照表第 26 行） ----------

const P = (x, y, z, w = 0) => ({ w, x, y, z, coarse: false });
const m = (v) => fixedUnits(v);

test('规则 5 直线距离：3-4-5 与含层高的 5-12-13（dz = 层号差 × storeyM）；定点米', () => {
  assert.equal(straightFixed(GRID,P(0, 0, 0), P(3, 4, 0)), m(5)); // √(3² + 4²) = 5
  assert.equal(straightFixed(GRID,P(0, 0, 0), P(5, 0, 4)), m(13)); // dz = 4 × 3 = 12 m：√(25 + 144) = 13
  assert.equal(straightFixed(GRID,P(7, 7, 7), P(7, 7, 7)), 0n);
});

test('规则 5 直线距离：对称；满足三角不等式（定点开方各截断至多差 1，容差 +2）；不同格空间为未知', () => {
  const pts = [P(0, 0, 0), P(3, 4, 0), P(-10, 25, 2), P(1000, -37, -3), P(5, 5, 5)];
  for (const a of pts) for (const b of pts) assert.equal(straightFixed(GRID,a, b), straightFixed(GRID,b, a));
  for (const a of pts) for (const b of pts) for (const c of pts) {
    assert.ok(straightFixed(GRID,a, c) <= straightFixed(GRID,a, b) + straightFixed(GRID,b, c) + 2n, 'triangle');
  }
  assert.equal(straightFixed(GRID,P(0, 0, 0, 0), P(0, 0, 0, 1)), null);
});

// ---------- §4.2 规则 12–13：方位角与前后左右（对照表第 27 行） ----------

test('规则 12 方位角：正北 0、正东 90、东北 45、正南 180、正西 270、西南 225、西北 315（dx 向东、dy 向北）；平面重合与跨格空间为未知', () => {
  const b = (x, y, z = 0) => bearingView(GRID, P(0, 0, 0), P(x, y, z));
  assert.equal(b(0, 10).bearingDeg, 0);
  assert.equal(b(10, 0).bearingDeg, 90);
  assert.equal(b(10, 10).bearingDeg, 45);
  assert.equal(b(0, -10).bearingDeg, 180);
  assert.equal(b(-10, 0).bearingDeg, 270);
  assert.equal(b(-10, -10).bearingDeg, 225);
  assert.equal(b(-10, 10).bearingDeg, 315);
  assert.equal(b(0, 0, 3), null); // 平面重合：只看平面差，不看高差
  assert.equal(bearingView(GRID, P(0, 0, 0, 0), P(5, 5, 0, 1)), null);
  // 一般角：atan(1/2) = 26.565°（定点 atan 表插值，容差 0.01°）。
  const g = b(1, 2).bearingDeg;
  assert.ok(Math.abs(g - 26.565) < 0.01, `got ${g}`);
  // 反向差 180：b→a 的方位与 a→b 相差半圈。
  const ab = bearingView(GRID, P(0, 0, 0), P(3, 7, 0)).bearingDeg;
  const ba = bearingView(GRID, P(3, 7, 0), P(0, 0, 0)).bearingDeg;
  assert.ok(Math.abs(Math.abs(ab - ba) - 180) < 0.01, `${ab} ${ba}`);
});

test('规则 12 方位角只依赖整圈度数、不依赖朝向档数：把 facingDirections 换成 16 或 4，方位角与 8 档时逐值相同（档数只许八由规则表加载校验守，见 place-footprint.test.mjs）', () => {
  const vectors = [[0, 10], [10, 0], [10, 10], [1, 2], [3, 7], [-10, 0], [-3, -7], [-10, 10], [7, -2]];
  for (const dirs of [16, 4]) {
    const g = { ...GRID, facingDirections: dirs };
    for (const [x, y] of vectors) {
      assert.equal(bearingView(g, P(0, 0, 0), P(x, y, 0)).bearingDeg, bearingView(GRID, P(0, 0, 0), P(x, y, 0)).bearingDeg, `${dirs}: ${x},${y}`);
    }
  }
});

test('规则 13 前后左右：朝向 × 45 度；朝东（2）看正北为"左"，朝北（0）看正东为"右"；上下看层号差；非法朝向拒收', () => {
  const north = P(0, 10, 0);
  const east = P(10, 0, 0);
  assert.equal(bearingView(GRID, P(0, 0, 0), north, 2).relative, 'left'); // 相对角 (0 − 90) mod 360 = 270 → 扇区 floor((270+22.5)/45) = 6
  assert.equal(bearingView(GRID, P(0, 0, 0), east, 0).relative, 'right'); // 相对角 90 → 扇区 2
  assert.equal(bearingView(GRID, P(0, 0, 0), north, 0).relative, 'front');
  assert.equal(bearingView(GRID, P(0, 0, 0), P(0, -10, 0), 0).relative, 'back');
  assert.equal(bearingView(GRID, P(0, 0, 0), P(10, 10, 0), 0).relative, 'frontRight');
  assert.equal(bearingView(GRID, P(0, 0, 0), P(-10, -10, 0), 0).relative, 'backLeft');
  assert.equal(bearingView(GRID, P(0, 0, 0), P(-10, 10, 0), 7).relative, 'front'); // 朝西北（7）看西北：相对角 0
  assert.equal(bearingView(GRID, P(0, 0, 0), north).relative, null); // 没给朝向不给相对方位
  assert.equal(bearingView(GRID, P(0, 0, 0), P(0, 10, 5)).vertical, 'up');
  assert.equal(bearingView(GRID, P(0, 0, 5), P(0, 10, 0)).vertical, 'down');
  assert.equal(bearingView(GRID, P(0, 0, 0), P(0, 10, 0)).vertical, 'level');
  for (const f of [-1, 8, 1.5]) assert.throws(() => bearingView(GRID, P(0, 0, 0), north, f), (e) => e.code === 'E-DIM-DOMAIN-RANGE', String(f));
});
