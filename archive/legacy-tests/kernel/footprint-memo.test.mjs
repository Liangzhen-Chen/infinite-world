// 格子迁移 G5b：全规模划分的实现形态——类型化堆、各行不常驻格列表、内容键划分记忆、外包框过大拒收（卷五 §4.1 规则 10、规则 16；卷二十七 R27-5.9、R27-6.9）。
// 规则 10 的语义由 footprint.test.mjs 手算用例守；本文件守"换了实现形态而结果逐位不变"：用测试里独立写的朴素参照（对象堆式的逐轮扫描，O(n²)）在 40 × 30 区格上比对归属，
// 再守记忆与缓存互不串味。全规模（约 4,020 万区格）的耗时与内存是腾讯云测量点（R27-6.9 第 2 步，见 docs/卡回报/g5b-convert.md），不在本机测。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { FOOTPRINT_KIND, planRegionFootprints, cellList } from '../../server-plugin/kernel/footprint.mjs';
import { buildPlan } from '../../server-plugin/kernel/place-plan.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 }); // 与 tests/kernel/fixture.mjs 同值
const GRID = Object.freeze({ cellM: 1, storeyM: 3, regionCellM: 100, fullTurnDeg: 360, facingDirections: 8 });
const CELL_AREA = 10000; // regionCellM² （米²）
const region = (parent, extra = {}) => ({ parent, kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null, terrain: 'terrain_plain', anchorElevationM: null, ...extra });
const seedAt = (x, y) => ({ x: x * 100 + 50, y: y * 100 + 50 }); // 区格 (x, y) 的中心点（米）

// 朴素参照：规则 10 的字面实现。每轮按子行 id 序，每个未达目标的子行从自己足迹的四邻空格里取"离自己种子距离平方最小、并列取 (x, y) 字典序小"的一格。
function reference(cellsX, cellsY, children) {
  const owner = new Array(cellsX * cellsY).fill(-1);
  const mine = children.map(() => []);
  children.forEach((c, i) => { owner[c.seed.y * cellsX + c.seed.x] = i; mine[i].push(c.seed); });
  for (let moved = true; moved;) {
    moved = false;
    children.forEach((c, i) => {
      if (mine[i].length >= c.target) return;
      let best = null;
      for (const p of mine[i]) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = p.x + dx;
          const y = p.y + dy;
          if (x < 0 || y < 0 || x >= cellsX || y >= cellsY || owner[y * cellsX + x] !== -1) continue;
          const d2 = (x - c.seed.x) ** 2 + (y - c.seed.y) ** 2;
          if (best === null || d2 < best.d2 || (d2 === best.d2 && (x < best.x || (x === best.x && y < best.y)))) best = { d2, x, y };
        }
      }
      if (best === null) return;
      owner[best.y * cellsX + best.x] = i;
      mine[i].push({ x: best.x, y: best.y });
      moved = true;
    });
  }
  return mine.map((list) => list.map((p) => `${p.x},${p.y}`).sort());
}

test('类型化堆的划分与朴素参照逐格相同：40 × 30 区格、三个子行（两个有目标面积、一个平分余下）、种子彼此挨得近以逼出争格与并列', () => {
  const cellsX = 40;
  const cellsY = 30;
  // 前提：a 目标 300 格（3,000,000 m² ÷ 10,000 m²）、b 目标 200 格、c 无目标，平分 1,200 − 0 − 500 = 700 格（规则 10）。种子区格：a (10,10)、b (12,10)、c (11,14)。
  const kids = [
    { id: 'loc_a', seed: { x: 10, y: 10 }, target: 300, area: 3_000_000 },
    { id: 'loc_b', seed: { x: 12, y: 10 }, target: 200, area: 2_000_000 },
    { id: 'loc_c', seed: { x: 11, y: 14 }, target: 700, area: null },
  ];
  const rows = new Map([['loc_root', region(null)], ...kids.map((k) => [k.id, region('loc_root', { coord: seedAt(k.seed.x, k.seed.y), targetAreaM2: k.area })])]);
  const { plans, errors } = planRegionFootprints(GRID, [{ w: 0, box: { x0: 0, y0: 0, cellsX, cellsY }, root: 'loc_root' }], rows);
  assert.deepEqual(errors, []);
  const plan = plans.get(0);
  const want = reference(cellsX, cellsY, kids);
  kids.forEach((k, i) => assert.deepEqual(cellList(plan, k.id).map((c) => `${c.x},${c.y}`).sort(), want[i], k.id));
  assert.equal(want[0].length, 300); // 手算：a 的目标 3,000,000 ÷ 10,000 = 300 格，空地足够，故恰达标
  assert.equal(want[1].length, 200);
});

test('各行不常驻格列表：区域行的 cells 登记为 undefined（只记有足迹），格由归属数组现扫；作者画了 boundary 的行存表序列表（流向序有意义）；层根为 null', () => {
  const rows = new Map([
    ['loc_root', region(null)],
    ['loc_a', region('loc_root', { coord: seedAt(0, 0), targetAreaM2: 3 * CELL_AREA })],
    ['loc_r', region('loc_root', { boundary: [{ x: 3, y: 3 }, { x: 3, y: 2 }, { x: 2, y: 2 }] })],
  ]);
  const { plans, errors } = planRegionFootprints(GRID, [{ w: 0, box: { x0: 0, y0: 0, cellsX: 4, cellsY: 4 }, root: 'loc_root' }], rows);
  assert.deepEqual(errors, []);
  const plan = plans.get(0);
  assert.equal(plan.cells.get('loc_root'), null);
  assert.equal(plan.cells.has('loc_a'), true);
  assert.equal(plan.cells.get('loc_a'), undefined);
  assert.equal(plan.cells.get('loc_r') instanceof Int32Array, true);
  // 手算：boundary 表序 (3,3)、(3,2)、(2,2) → 区格下标 y × 4 + x = 15、11、10（表序保留，不排序）；loc_a 从 (0,0) 起长 3 格：(0,0)，再取离种子最近的四邻 (0,1)（d²=1，(x,y) 字典序小于 (1,0)），再 (1,0)。
  assert.deepEqual([...plan.cells.get('loc_r')], [15, 11, 10]);
  assert.deepEqual(cellList(plan, 'loc_a'), [{ x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]);
  assert.equal(plan.sizes.get('loc_a'), 3);
  assert.deepEqual(plan.rect.get('loc_a'), { x0: 0, x1: 1, y0: 0, y1: 1 }); // 外包矩形取自划出的格
});

// ---------- 划分记忆（place-plan.mjs buildPlan） ----------

const planFor = (rows, cellsX = 4, cellsY = 4) => buildPlan({
  ids: Object.keys(rows),
  get: (id, key) => rows[id][key],
  classesOf: () => new Set(),
  relocatable: () => false,
  grid: GRID,
  gridSpaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX, cellsY }, root: 'loc_root' }],
});
const plain = (coordCell, extra = {}) => ({ parent: 'loc_root', coord: seedAt(...coordCell), ...extra });
const worldRows = (aCell) => ({ loc_root: { parent: null }, loc_a: plain(aCell), loc_b: plain([3, 3]) });

test('划分记忆：同一份划分输入划两次，归属数组是同一个对象；高度、几何、相邻缓存与 bedOff 标记各自独立，不串味', () => {
  const a = planFor(worldRows([0, 0])).plans.get(0);
  const b = planFor(worldRows([0, 0])).plans.get(0);
  assert.equal(a.owner, b.owner); // 同输入只划一次（内容键）
  assert.notEqual(a, b);
  assert.notEqual(a.geometry, b.geometry);
  assert.notEqual(a.heights, b.heights);
  b.bedOff = true;
  assert.equal(a.bedOff, undefined);
  a.geometry.set('x', 1);
  assert.equal(b.geometry.size, 0);
});

test('划分记忆是内容键：种子换一格、格空间换大小、行的其他划分输入（目标面积）换了，都重划，结果与单独划分相同', () => {
  const base = planFor(worldRows([0, 0])).plans.get(0);
  const moved = planFor(worldRows([1, 0])).plans.get(0);
  assert.notEqual(base.owner, moved.owner);
  // 手算：4 × 4 平分 16 格各 8。种子在 (0,0) 时区格 (0,0) 是 a 的种子；种子换到 (1,0) 时，a 第一个取格是离 (1,0) 最近的四邻 (0,0)（d²=1，(x,y) 字典序小于 (1,1)、(2,0)）。
  // 两个世界里 (0,0) 都归 a，但 a 的 8 格不同：新世界 a 的 8 格都在离 (1,0) 距离平方不超过 5 之内，(0,3)（d²=10）取不到；原世界 a 含 (0,3)（footprint.test.mjs 的 A_CELLS）。
  assert.equal(moved.owner[0], moved.idx.get('loc_a'));
  assert.equal(base.owner[0], base.idx.get('loc_a'));
  assert.notDeepEqual(cellList(moved, 'loc_a'), cellList(base, 'loc_a'));
  // 同输入回来是原来那一份（记忆留最近两份：base、moved 都在）。
  assert.equal(planFor(worldRows([0, 0])).plans.get(0).owner, base.owner);
  assert.equal(planFor(worldRows([1, 0])).plans.get(0).owner, moved.owner);
  const sized = planFor(worldRows([0, 0]), 5, 4).plans.get(0);
  assert.equal(sized.owner.length, 20); // 格空间 5 × 4
  const withTarget = planFor({ ...worldRows([0, 0]), loc_a: plain([0, 0], { targetAreaM2: 2 * CELL_AREA }) }).plans.get(0);
  assert.equal(withTarget.sizes.get('loc_a'), 2); // 目标 2 格：20,000 ÷ 10,000
  assert.equal(base.sizes.get('loc_a'), 8);
  // 只留最近两份：sized、withTarget 之后 base 被挤出，同输入再划得到内容相同但不是同一个数组。
  const again = planFor(worldRows([0, 0])).plans.get(0);
  assert.notEqual(again.owner, base.owner);
  assert.deepEqual(again.owner, base.owner);
});

test('划分记忆的错误也记：违规输入（种子在外包框外）每次返回同样的错误，不抛', () => {
  const bad = { loc_root: { parent: null }, loc_a: plain([9, 9]), loc_b: plain([3, 3]) };
  const first = planFor(bad);
  const second = planFor(bad);
  assert.deepEqual(first.errors.map((e) => `${e.code} ${e.id}`), ['E-GRID-FOOTPRINT-OUTSIDE-PARENT loc_a']);
  assert.deepEqual(second.errors, first.errors);
});

// ---------- 外包框过大拒收 ----------

test('外包框大到打包键装不下 2⁵³（距离平方上限 × 区格数）即拒收、不降级不静默放过：不分配归属数组、该格空间没有计划', () => {
  // 手算：200,000 × 200,000 区格，距离平方上限 = 2 × 199,999² ≈ 8.0×10¹⁰，乘区格数 4×10¹⁰ ≈ 3.2×10²¹ > 2⁵³ ≈ 9.0×10¹⁵。
  const rows = new Map([['loc_root', region(null)], ['loc_a', region('loc_root', { coord: seedAt(0, 0) })]]);
  const { plans, errors } = planRegionFootprints(GRID, [{ w: 0, box: { x0: 0, y0: 0, cellsX: 200000, cellsY: 200000 }, root: 'loc_root' }], rows);
  assert.equal(plans.size, 0);
  assert.deepEqual(errors.map((e) => `${e.code} ${e.id}`), ['E-DIM-DOMAIN-RANGE loc_root']);
  // 主世界全规模外包框 7,801 × 5,151（旧坐标范围）装得下：(7800² + 5150²) × 40,182,951 ≈ 3.5×10¹⁵ < 2⁵³。
  const maxD2 = 7800 * 7800 + 5150 * 5150;
  assert.equal(Number.isSafeInteger((maxD2 + 1) * 7801 * 5151), true);
});
