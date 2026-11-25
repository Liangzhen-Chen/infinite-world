// 格子迁移 G8《洞穴与地下体积》卡内测试之一：洞穴生成器纯函数 caveCellsOf、volumeDerived（server-plugin/kernel/cave.mjs）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 37–42、45 行；卷十 R10-2.14（docs/统一底层设计/卷十-世界随机生成.md :429–:434）。
// 前提都在测试里造：格常数 cellM 1 m、storeyM 3 m、regionCellM 100 m（卷五 §2.3，与 world/rules/tables/grid.json 同；测试自带，不读仓库值）；区格 (0,0) 的中心列是 (50, 50)。
// 期望值按卷文公式手算成字面量，推算写在用例里；哈希次序决定的细节（先长哪一列）不抄进断言，只断言与次序无关的集合、个数、连通、边界。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { fixedUnits } from '../../server-plugin/kernel/det-math.mjs';
import { caveCellsOf, volumeDerived, topLayerOf, CAVE_REASON } from '../../server-plugin/kernel/cave.mjs';
import { identitySeedKey, orderKeyAt } from '../../server-plugin/kernel/sample.mjs';

// 卷十 R10-2.14 :431：种子是身份采样键（模板种子、实体类 place、行 id、抽取点），起点与生长同用它；次序键 hash(种子, 序号)。区格与列用同一个次序键。
const caveRegionKey = (seed, row, x, y) => orderKeyAt(identitySeedKey('gen_cave', 'site_gen_cave_grow', seed, 'place', row), x, y);
const caveColumnKey = caveRegionKey;

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok); // 装配定点常数（fixedScale、fixedUnits 读 rules.kernelConstants）

const GRID = { cellM: 1, storeyM: 3, regionCellM: 100 };
const SEED = 'seed_test';
const ROW = 'vol_a';
const key = (x, y) => `${x},${y}`;
const set = (list) => new Set(list.map((c) => key(c.x, c.y)));
// 地表：处处高 31 m → 地表层 floor(31 ÷ 3) = 10。
const FLAT = () => ({ h: fixedUnits(31), z: 10 });
// 默认输入：顶面 15 m → t = floor(15 ÷ 3) = 5；两层（层 4、5）；父足迹全开（只有区格 (0,0)）；无兄弟；有洞口。
const spec = (over = {}) => ({
  grid: GRID, worldSeed: SEED, rowId: ROW, anchorElevationM: 15, spanZ: 2, targetAreaM2: 4, mouth: true, maxAreaM2: 200000,
  parentRegions: [{ x: 0, y: 0 }], inParent: () => true, claimed: () => false, surface: FLAT, parentBottomZ: null, ...over,
});
// 只让一小块列可凿的父足迹：块外 inParent 为假。
const inBlock = (cols) => { const s = set(cols); return (x, y) => s.has(key(x, y)); };
const BLOCK4 = [{ x: 50, y: 50 }, { x: 51, y: 50 }, { x: 50, y: 51 }, { x: 51, y: 51 }];

test('次序键拼串移入 handles/keys.mjs 后键值逐字节不变：等于直接对 "种子键|x|y" 取 sha256', () => {
  const seed = identitySeedKey('gen_cave', 'site_gen_cave_grow', SEED, 'place', ROW);
  assert.equal(orderKeyAt(seed, 50, -7), createHash('sha256').update(`${seed}|50|-7`, 'utf8').digest('hex'));
  assert.equal(orderKeyAt(seed, 3), createHash('sha256').update(`${seed}|3`, 'utf8').digest('hex'));
});

test('顶层号 t = floor(anchorElevationM ÷ storeyM)：15 m → 5；负海拔向下取整；整层边界', () => {
  assert.equal(topLayerOf(GRID, 15), 5);
  assert.equal(topLayerOf(GRID, 17.9), 5);
  assert.equal(topLayerOf(GRID, 18), 6);
  assert.equal(topLayerOf(GRID, -1), -1); // floor(−1 ÷ 3) = −1
  assert.equal(topLayerOf(GRID, 0), 0);
});

test('#37 唯一算法、纯函数：同输入两次逐列逐层相同；区格遍历次序不影响结果', () => {
  const regions = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 7 }];
  const a = caveCellsOf(spec({ parentRegions: regions, targetAreaM2: 30 }));
  const b = caveCellsOf(spec({ parentRegions: regions, targetAreaM2: 30 }));
  const c = caveCellsOf(spec({ parentRegions: [...regions].reverse(), targetAreaM2: 30 }));
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  assert.deepEqual(a, c); // 遍历次序换了，起点与每一步取的列都不变
  // 层段：t = 5、spanZ = 2 → 层 4 到 5；格数 = 列数 × 2（洞口通路不计）。
  assert.equal(a.topZ, 5);
  assert.equal(a.bottomZ, 4);
  assert.equal(a.columns.length, 30);
  assert.equal(a.cellCount, 60);
});

test('#37 种子是行 id 的身份键：换一行 id 起点与形状可以不同，同一行永远相同', () => {
  const a = caveCellsOf(spec({ rowId: 'vol_a', targetAreaM2: 40 }));
  const b = caveCellsOf(spec({ rowId: 'vol_b', targetAreaM2: 40 }));
  const aa = caveCellsOf(spec({ rowId: 'vol_a', targetAreaM2: 40 }));
  assert.deepEqual(a, aa);
  assert.notDeepEqual(a.columns.map((c) => key(c.x, c.y)), b.columns.map((c) => key(c.x, c.y)));
});

test('#38 可凿列三条件：①不在父足迹（或被更深区域足迹占）②先于本行的兄弟占用 ③地表层不够高，逐一造反例', () => {
  // 一条 4 列的线 x 50..53、y 50：起点是区格 (0,0) 的中心列 (50, 50)。
  const line = inBlock([50, 51, 52, 53].map((x) => ({ x, y: 50 })));
  // 基线：目标 4 列，全可凿 → 4 列。
  const base = caveCellsOf(spec({ inParent: line, targetAreaM2: 4 }));
  assert.deepEqual([...set(base.columns)].sort(), ['50,50', '51,50', '52,50', '53,50']);
  // ① 起点列不在父足迹里（更深的区域足迹占了中心列）：整行没有起点。
  const noStart = caveCellsOf(spec({ inParent: inBlock([{ x: 51, y: 50 }, { x: 52, y: 50 }]), targetAreaM2: 4 }));
  assert.equal(noStart.ok, false);
  assert.equal(noStart.reason, CAVE_REASON.noParentColumn);
  // ② 先于本行的兄弟占了 (52, 50)：4 列的目标只能长到 (50,50)、(51,50) 两列，(53, 50) 被兄弟隔在后面。
  const claimed = caveCellsOf(spec({ inParent: line, claimed: (x, y) => x === 52 && y === 50, targetAreaM2: 4 }));
  assert.deepEqual([...set(claimed.columns)].sort(), ['50,50', '51,50']);
  // ② 兄弟占了起点列：没有起点。
  assert.equal(caveCellsOf(spec({ inParent: line, claimed: (x, y) => x === 50 && y === 50 })).reason, CAVE_REASON.noParentColumn);
  // ③ (51, 50) 的地表层是 5（t + 1 = 6 不满足）：不可凿，目标 4 列也只长出起点一列。
  const low = caveCellsOf(spec({ inParent: line, surface: (x) => (x === 51 ? { h: fixedUnits(16), z: 5 } : FLAT()), targetAreaM2: 4 }));
  assert.deepEqual([...set(low.columns)], ['50,50']);
  // ③ 临界：地表层恰为 t + 1 = 6 可凿。
  const edge = caveCellsOf(spec({ inParent: line, surface: (x) => (x === 51 ? { h: fixedUnits(18), z: 6 } : FLAT()), targetAreaM2: 4 }));
  assert.equal(edge.columns.length, 4);
  // ③ 全部列地表层都不够高：顶面够不到地表以下一层，原因是 topExposed（深度太浅）。
  const shallow = caveCellsOf(spec({ inParent: line, surface: () => ({ h: fixedUnits(16), z: 5 }) }));
  assert.equal(shallow.ok, false);
  assert.equal(shallow.reason, CAVE_REASON.topExposed);
});

test('#38 嵌套：父行是体积时顶层号须低于父体积底层号（t = 5 对父底层 5 不行，对 6 行）', () => {
  assert.equal(caveCellsOf(spec({ parentBottomZ: 5 })).reason, CAVE_REASON.notBelowParent);
  assert.equal(caveCellsOf(spec({ parentBottomZ: 4 })).reason, CAVE_REASON.notBelowParent);
  assert.equal(caveCellsOf(spec({ parentBottomZ: 6 })).ok, true);
});

test('#39 起点：中心列可凿的区格里取区格次序键最小者；只有一个区格可凿时起点就是它的中心列；没有可凿列即不可行并带原因', () => {
  // 区格 (0,0)、(1,0) 的中心列是 (50, 50)、(150, 50)，都可凿：起点是 caveRegionKey 较小的那个。
  const regions = [{ x: 0, y: 0 }, { x: 1, y: 0 }];
  const r = caveCellsOf(spec({ parentRegions: regions, targetAreaM2: 1 }));
  const expectFirst = caveRegionKey(SEED, ROW, 0, 0) < caveRegionKey(SEED, ROW, 1, 0) ? { x: 50, y: 50 } : { x: 150, y: 50 };
  assert.deepEqual(r.start, expectFirst);
  // 只有区格 (1, 2)（中心列 (150, 250)）的中心列在父足迹里：起点是它，不管别的区格次序键多小。
  const only = caveCellsOf(spec({ parentRegions: [{ x: 0, y: 0 }, { x: 1, y: 2 }], inParent: inBlock([{ x: 150, y: 250 }, { x: 151, y: 250 }]), targetAreaM2: 2 }));
  assert.deepEqual(only.start, { x: 150, y: 250 });
  assert.deepEqual([...set(only.columns)].sort(), ['150,250', '151,250']);
  // 父足迹没有区格（太小）：不可行，原因 noParentColumn。
  const none = caveCellsOf(spec({ parentRegions: [] }));
  assert.equal(none.ok, false);
  assert.equal(none.reason, CAVE_REASON.noParentColumn);
});

test('#40 生长：目标 4 格在 2×2 可凿块里长成整块；无列可取时提前停；全整数；一步一列', () => {
  const block = caveCellsOf(spec({ inParent: inBlock(BLOCK4), targetAreaM2: 4 }));
  // 手算：可凿集合恰为 (50,50)(51,50)(50,51)(51,51)，起点 (50,50)，目标 ceil(4 ÷ 1) = 4 列 = 整块，与哈希次序无关。
  assert.deepEqual([...set(block.columns)].sort(), ['50,50', '50,51', '51,50', '51,51']);
  assert.deepEqual(block.start, { x: 50, y: 50 });
  assert.equal(block.columns[0].x, 50); // 第一列是起点
  assert.equal(block.columns[0].y, 50);
  // 提前停：目标 10 列但可凿的只有 4 列。
  const early = caveCellsOf(spec({ inParent: inBlock(BLOCK4), targetAreaM2: 10 }));
  assert.equal(early.columns.length, 4);
  // 目标 2 列：恰 2 列，连通（四邻）、含起点。
  const two = caveCellsOf(spec({ inParent: inBlock(BLOCK4), targetAreaM2: 2 }));
  assert.equal(two.columns.length, 2);
  assert.ok(Math.abs(two.columns[0].x - two.columns[1].x) + Math.abs(two.columns[0].y - two.columns[1].y) === 1);
  // 非整数目标面积 ceil：4.5 m² ÷ 1 = 4.5 → 5 列。
  assert.equal(caveCellsOf(spec({ targetAreaM2: 4.5 })).columns.length, 5);
  // 层段：每列层 t − spanZ + 1 到 t；spanZ 3 → 层 3..5。
  const three = caveCellsOf(spec({ inParent: inBlock(BLOCK4), spanZ: 3 }));
  assert.equal(three.bottomZ, 3);
  assert.equal(three.topZ, 5);
  assert.equal(three.cellCount, 12);
  // 生长的列都连成一片：从起点出发四邻可达全部列。
  const big = caveCellsOf(spec({ targetAreaM2: 50 }));
  const cols = set(big.columns);
  const reach = new Set([key(big.start.x, big.start.y)]);
  const stack = [big.start];
  while (stack.length) {
    const c = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c.x + dx, c.y + dy);
      if (cols.has(k) && !reach.has(k)) { reach.add(k); stack.push({ x: c.x + dx, y: c.y + dy }); }
    }
  }
  assert.equal(reach.size, 50);
});

test('#41 洞口：mouth 真取 H 中地表层减 t 最小的列（并列取列次序键最小），通路格层 t+1 到地表层；mouth 假封闭', () => {
  // 2×2 块的地表层：(50,50)→10、(51,50)→8、(50,51)→9、(51,51)→8；t = 5，地表层减 t 分别是 5、3、4、3：最小 3，并列 (51,50) 与 (51,51)。
  const z = { '50,50': 10, '51,50': 8, '50,51': 9, '51,51': 8 };
  const surface = (x, y) => ({ h: fixedUnits(z[key(x, y)] * 3), z: z[key(x, y)] });
  const r = caveCellsOf(spec({ inParent: inBlock(BLOCK4), surface, targetAreaM2: 4 }));
  const winner = caveColumnKey(SEED, ROW, 51, 50) < caveColumnKey(SEED, ROW, 51, 51) ? { x: 51, y: 50 } : { x: 51, y: 51 };
  assert.deepEqual({ x: r.mouth.x, y: r.mouth.y }, winner);
  assert.equal(r.mouth.fromZ, 6); // t + 1
  assert.equal(r.mouth.toZ, 8); // 该列地表层
  // 封闭的洞：mouth 假没有洞口，体积足迹的格不变。
  const closed = caveCellsOf(spec({ inParent: inBlock(BLOCK4), surface, targetAreaM2: 4, mouth: false }));
  assert.equal(closed.mouth, null);
  assert.deepEqual(closed.columns, r.columns);
  // 地表层相同时洞口列也在 H 里（唯一最小者）：把 (50,50) 地表降到 7，最小差 2，唯一。
  const z2 = { ...z, '50,50': 7 };
  const r2 = caveCellsOf(spec({ inParent: inBlock(BLOCK4), surface: (x, y) => ({ h: fixedUnits(z2[key(x, y)] * 3), z: z2[key(x, y)] }), targetAreaM2: 4 }));
  assert.deepEqual({ x: r2.mouth.x, y: r2.mouth.y, toZ: r2.mouth.toZ }, { x: 50, y: 50, toZ: 7 });
});

test('#42 格数上限：目标超过 ceil(maxAreaM2 ÷ cellM²) 列拒收；上限内的洞不超 列数上限 × spanZ；特殊值不放行', () => {
  // 上限 6 m² → 6 列：目标 7 拒收（overCap），目标 6 放行，cellCount = 6 × spanZ(3) = 18 = 上限 × spanZ。
  const over = caveCellsOf(spec({ maxAreaM2: 6, targetAreaM2: 7 }));
  assert.equal(over.ok, false);
  assert.equal(over.reason, CAVE_REASON.overCap);
  const at = caveCellsOf(spec({ maxAreaM2: 6, targetAreaM2: 6, spanZ: 3 }));
  assert.equal(at.columns.length, 6);
  assert.equal(at.cellCount, 18);
  // 非整数上限 5.5 → ceil = 6 列：目标 5.5 → 6 列 放行；目标 6.5 → 7 列 拒收。
  assert.equal(caveCellsOf(spec({ maxAreaM2: 5.5, targetAreaM2: 5.5 })).ok, true);
  assert.equal(caveCellsOf(spec({ maxAreaM2: 5.5, targetAreaM2: 6.5 })).reason, CAVE_REASON.overCap);
  // 特殊值：上限 0、负、NaN、缺省，目标 0、负，spanZ 0、小数，mouth 缺省，一律 badInput，不因"不限"、0 被放过。
  for (const bad of [0, -1, NaN, undefined, null, Infinity]) assert.equal(caveCellsOf(spec({ maxAreaM2: bad })).reason, CAVE_REASON.badInput, `max ${bad}`);
  for (const bad of [0, -4, NaN, undefined]) assert.equal(caveCellsOf(spec({ targetAreaM2: bad })).reason, CAVE_REASON.badInput, `target ${bad}`);
  for (const bad of [0, 1.5, -1, undefined]) assert.equal(caveCellsOf(spec({ spanZ: bad })).reason, CAVE_REASON.badInput, `span ${bad}`);
  assert.equal(caveCellsOf(spec({ mouth: undefined })).reason, CAVE_REASON.badInput);
});

test('#42 与世界大小无关：父足迹有 400 个区格，生长只取 caveRegionKey 最小的可凿起点，格数仍只由目标面积定', () => {
  const regions = [];
  for (let x = 0; x < 20; x += 1) for (let y = 0; y < 20; y += 1) regions.push({ x, y });
  const r = caveCellsOf(spec({ parentRegions: regions, targetAreaM2: 12 }));
  assert.equal(r.columns.length, 12);
  assert.equal(r.cellCount, 24);
  // 起点是 400 个区格里 caveRegionKey 最小者的中心列。
  let best = regions[0];
  for (const g of regions) if (caveRegionKey(SEED, ROW, g.x, g.y) < caveRegionKey(SEED, ROW, best.x, best.y)) best = g;
  assert.deepEqual(r.start, { x: best.x * 100 + 50, y: best.y * 100 + 50 });
});

test('地表未知（控制点海拔未知）往下传：结果是 unknown，不当可行也不当不可行', () => {
  const r = caveCellsOf(spec({ surface: () => null }));
  assert.equal(r.ok, false);
  assert.equal(r.reason, CAVE_REASON.unknown);
});

test('#45 派生量：areaM2 = 最低一层格数 × cellM²，zRange、elevationM、centroid、depthM 非负，underground 当且仅当 depthM > 0', () => {
  const r = caveCellsOf(spec({ inParent: inBlock(BLOCK4), targetAreaM2: 4 }));
  const d = volumeDerived(GRID, r);
  // 4 列 × cellM² 1 = 4 m²；层 4..5；elevationM = 4 × 3 = 12；centroid = 列中心 (50.5, 51.5) 平均 = (51, 51)。
  assert.equal(d.areaM2, 4);
  assert.deepEqual(d.zRange, { zMin: 4, zMax: 5 });
  assert.equal(d.elevationM, 12);
  assert.deepEqual(d.centroid, { x: 51, y: 51 });
  // 地表高 31 m 处处相同：surfaceRef = 31；顶面以上 (zMax + 1) × 3 = 18；depthM = 31 − 18 = 13 > 0 → underground 真。
  assert.equal(d.surfaceRefElevationM, 31);
  assert.equal(d.depthM, 13);
  assert.equal(d.underground, true);
  // 边界：地表恰在顶面之上一层的顶（18 m，层 6，t = 5 可凿）：depthM = 18 − 18 = 0 → underground 假。
  const flush = caveCellsOf(spec({ inParent: inBlock(BLOCK4), surface: () => ({ h: fixedUnits(18), z: 6 }), targetAreaM2: 4 }));
  const df = volumeDerived(GRID, flush);
  assert.equal(df.depthM, 0);
  assert.equal(df.underground, false);
  // 地表高各列不同：h = 18、20、18、20 → 平均 19 → depthM = 19 − 18 = 1。
  const hs = { '50,50': 18, '51,50': 20, '50,51': 18, '51,51': 20 };
  const mixed = caveCellsOf(spec({ inParent: inBlock(BLOCK4), surface: (x, y) => ({ h: fixedUnits(hs[key(x, y)]), z: 6 }), targetAreaM2: 4 }));
  const dm = volumeDerived(GRID, mixed);
  assert.equal(dm.surfaceRefElevationM, 19);
  assert.equal(dm.depthM, 1);
  assert.equal(dm.underground, true);
});
