// 格子迁移 G6《细格地形生成》卡内测试之一：纯函数层（grid-base.mjs、grid-template.mjs、grid-stock.mjs、grid.mjs 的新抽取键）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 1–4、6–8、10–13、15、16 行；gridView 的接线测试在 tests/kernel/grid-view.test.mjs。
// 期望值按卷文公式手算成字面量并在注释写推算；sha256 派生的次序只断言它与"按键排序"的关系和确定性，不抄哈希值。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installFixedConstants, fixedUnits, fixedToNumber } from '../../server-plugin/kernel/det-math.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { regionCellSeedKey, stockRegionKey, stockCellKey, tplBlockKey, uniformBelow, cellClassOf } from '../../server-plugin/kernel/grid.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../accept/temp-root.mjs';
import { cellAt, cellFlags, waterOfRegion as waterOfRegionRaw, iceLayersOf, regionSlope, isNaturalColumn, naturalStepOk, columnSurface, nearControlPoints } from '../../server-plugin/kernel/grid-base.mjs';
import { templateBlocksOf, blockAt, checkGenTemplates, genTemplateOf } from '../../server-plugin/kernel/grid-template.mjs';
import { stockCount, distributeStock, pickStockCells, plantCandidateCells } from '../../server-plugin/kernel/grid-stock.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

// 夹具常数照 world/rules/tables/grid.json（只作测试前提）。
const GRID = Object.freeze({ storeyM: 3, cellM: 1, regionCellM: 100, heightCtrlK: 4, reliefOctaves: 4, surfaceElevationMinM: -12000, surfaceElevationMaxM: 9000 });
const m = (v) => fixedUnits(v);
// 升换立方米取单位表 _units.json 里 L 的 si（卷二单位表），不借千分母（修改轮 M6）；waterOfRegion 多收这一个入参，测试里经包装统一交入。
const M3_PER_L = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_units.json'), 'utf8')).units.find((u) => u.id === 'L').si;
const waterOfRegion = (grid, body, rep, min, bottom, si = M3_PER_L) => waterOfRegionRaw(grid, body, rep, min, bottom, si);
// 夹具模板的 airMaterial 是 'A'（空气是一行材料，gentemplate 必填字段）。
const TPL = Object.freeze({ surfaceMaterial: 'S', airMaterial: 'A', soilLayers: 2, soilMaterial: 'D', rockMaterial: 'R', blocks: [] });
const col = (extra = {}) => ({ x: 0, y: 0, surfaceZ: 5, tpl: TPL, rockMaterial: null, water: null, blocks: [], overlay: null, ...extra });
const err = (code) => (e) => e && e.code === code;

// ---------- 叠层次序（#3，卷五 §4.3 规则 10；A5-3.2） ----------

test('叠层次序：地表层号以下依次是土（soilLayers 层）、岩，地表层是地表材料，以上是空气；岩层材料可被存量单元岩层覆盖', () => {
  // 地表层 5、soilLayers 2：z=6 及以上空气；z=5 地表 S；z=4、3 土 D（5−2 = 3 为土的下界）；z=2 起岩 R。
  const c = col();
  assert.deepEqual(cellAt(c, 6), { material: 'A', state: 'gas', selfSupport: false });
  assert.deepEqual(cellAt(c, 100), { material: 'A', state: 'gas', selfSupport: false });
  assert.deepEqual(cellAt(c, 5), { material: 'S', state: 'solid', selfSupport: false });
  assert.equal(cellAt(c, 4).material, 'D');
  assert.equal(cellAt(c, 3).material, 'D');
  assert.equal(cellAt(c, 2).material, 'R');
  assert.equal(cellAt(c, -40).material, 'R');
  // 所在存量单元的 stratum 条目有材料：岩取它，土层不受影响（卷五 :661）。
  const s = col({ rockMaterial: 'X' });
  assert.equal(cellAt(s, 3).material, 'D');
  assert.equal(cellAt(s, 2).material, 'X');
  // soilLayers 为 0：地表层之下直接是岩。
  assert.equal(cellAt(col({ tpl: { ...TPL, soilLayers: 0 } }), 4).material, 'R');
});

test('叠层次序：水体在地表之上、模板格块再叠其上；同一格同时落在多层时后叠的胜出', () => {
  // 地表层 1，水面层 4（水柱 2、3、4 三层），格块覆盖 z=3..5 的 (0,0)：z=3 变成格块 B，z=2 仍是水，z=4 仍是水（格块只到 5？z=4、5 在块内）。
  const water = { levelZ: 4, liquidL: 1n, iceL: 0n, liquidMaterial: 'W' };
  const blocks = [{ j: 0, x0: 0, x1: 0, y0: 0, y1: 0, z0: 3, z1: 5, material: 'B', selfSupport: true }];
  const c = col({ surfaceZ: 1, water, blocks });
  assert.equal(cellAt(c, 2).material, 'W');
  assert.deepEqual(cellAt(c, 3), { material: 'B', state: 'solid', selfSupport: true });
  assert.equal(cellAt(c, 4).material, 'B');
  assert.equal(cellAt(c, 5).material, 'B');
  assert.equal(cellAt(c, 6).material, 'A');
  // 同一格两个块重叠：块序号大者胜（blockAt 取最后一个命中者）。
  const two = [{ j: 0, x0: 0, x1: 3, y0: 0, y1: 3, z0: 0, z1: 9, material: 'A', selfSupport: false }, { j: 1, x0: 2, x1: 2, y0: 2, y1: 2, z0: 4, z1: 4, material: 'C', selfSupport: true }];
  assert.equal(blockAt(two, 2, 2, 4).material, 'C');
  assert.equal(blockAt(two, 2, 2, 5).material, 'A');
  assert.equal(blockAt(two, 9, 9, 4), null);
});

test('叠层：叠入口 overlay 在模板格块之后、返回非 null 即覆盖（留给体积凿空、建筑蓝图、存量形态、格差分，按卷五 :660 次序）', () => {
  const calls = [];
  const c = col({ overlay: (cc, z, cell) => { calls.push([z, cell.material]); return z === 6 ? { material: 'T', state: 'solid', selfSupport: false } : null; } });
  assert.equal(cellAt(c, 6).material, 'T');
  assert.equal(cellAt(c, 5).material, 'S');
  assert.deepEqual(calls, [[6, 'A'], [5, 'S']]);
});

// ---------- 水面（#4，卷五 §4.3.3 "水面"，勘误 1121k3） ----------

test('水面：静水全片一面（足迹各区格代表地表高最低者 + 平均水深）、至少一层水、冰占比按顶部层数；没有水或面积 0 不做除法', () => {
  // 平均水深 d = (液 600000 L + 冰 0) ÷ (1000 × 1000 m²) = 0.6 m；足迹最低代表高 10 m → 水面海拔 10.6 → floor(10.6 ÷ 3) = 3。
  const body = { liquidL: 600000, iceL: 0, surfaceM2: 1000, flowing: false };
  assert.equal(waterOfRegion(GRID, body, m(40), m(10), 2).levelZ, 3); // 水底层号 2：max(3, 2 + 1) = 3
  assert.equal(waterOfRegion(GRID, body, m(40), m(10), 3).levelZ, 4); // 水底层号 3：水面层不够，取水底 + 1 = 4（每个区格最低一列至少一层水）
  // 流水逐区格：水面海拔 = 本区格代表地表高 + d = 20.6 → floor = 6；水底层号 5 → max(6, 6) = 6。静水时本区格代表高 20 不参与。
  const river = { ...body, flowing: true };
  assert.equal(waterOfRegion(GRID, river, m(20), m(10), 5).levelZ, 6);
  assert.equal(waterOfRegion(GRID, body, m(20), m(10), 2).levelZ, 3); // 同一输入静水仍按最低者 10 m
  // 水面在零下：负海拔向下取整。足迹最低 −10 m + 0.6 = −9.4 → floor(−9.4 ÷ 3) = −4；水底层号 −5 → max(−4, −4) = −4。
  assert.equal(waterOfRegion(GRID, body, m(0), m(-10), -5).levelZ, -4);
  // 升换立方米来自单位表（0.001），不是别处的 1000：把它改成 0.002（一升 2 L 体积的假想单位表），平均水深加倍 1.2 m：10 + 1.2 = 11.2 → floor(11.2 ÷ 3) = 3 仍是 3，
  // 再换 0.01（一升 10 L 的假想）→ d = 6 m：16 → floor(16 ÷ 3) = 5。证明水深确由入参 m3PerL 定，不借常数。
  assert.equal(waterOfRegion(GRID, body, m(40), m(10), 2, 0.002).levelZ, 3);
  assert.equal(waterOfRegion(GRID, body, m(40), m(10), 2, 0.01).levelZ, 5);
  assert.throws(() => waterOfRegion(GRID, body, m(40), m(10), 2, 0), err('E-DET-DOMAIN'));
  // 余额合计为 0 或水面面积为 0：没有水（不做除法）。
  assert.equal(waterOfRegion(GRID, { ...body, liquidL: 0 }, m(40), m(10), 2), null);
  assert.equal(waterOfRegion(GRID, { ...body, surfaceM2: 0 }, m(40), m(10), 2), null);
  // 冰也计入余额合计：液 0、冰 600000 → 同样 0.6 m，面不变（冻结是账户转移，不改水面）。
  assert.equal(waterOfRegion(GRID, { ...body, liquidL: 0, iceL: 600000 }, m(40), m(10), 2).levelZ, 3);
  assert.equal(waterOfRegion(GRID, { ...body, liquidL: 450000, iceL: 150000 }, m(40), m(10), 2).levelZ, 3);
});

test('冰层数：ceil(水层数 × 冰余额 ÷ 余额合计)；冰为 0 没有冰；水柱顶部画冰、料同 liquid 材料、物态 solid，其余层 liquid', () => {
  const w = { levelZ: 4, liquidL: 450000n * 10000n, iceL: 150000n * 10000n }; // 冰占 1/4（定点同标度，比值不变）
  assert.equal(iceLayersOf(3, w), 1); // 3 × 1/4 = 0.75 → ceil 1
  assert.equal(iceLayersOf(4, w), 1); // 恰为 1
  assert.equal(iceLayersOf(5, w), 2); // 1.25 → 2
  assert.equal(iceLayersOf(0, w), 0);
  assert.equal(iceLayersOf(3, { ...w, iceL: 0n }), 0);
  // 地表层 1、水面层 4 → 水柱 2、3、4 共 3 层，冰 1 层：z=4 冰（solid），z=2、3 液；z=5 空气。
  const c = col({ surfaceZ: 1, water: { ...w, liquidMaterial: 'W' } });
  assert.deepEqual([2, 3, 4, 5].map((z) => [cellAt(c, z).material, cellAt(c, z).state]), [['W', 'liquid'], ['W', 'liquid'], ['W', 'solid'], ['A', 'gas']]);
  // 列地表层不低于水面层的列没有水：地表层 4、水面层 4。
  assert.equal(cellAt(col({ surfaceZ: 4, water: { ...w, liquidMaterial: 'W' } }), 5).material, 'A');
});

// ---------- 遮天、承托、可立足（#7，卷五 §4.5.1、规则 1、5；A5-5.1） ----------

// 材料行三布尔夹具（按物态栏）：岩土类固栏真；水液栏假、固栏（冰）真；材料 Q 的数据缺（未知）。
const FLAGS = {
  S: { solid: { blocksSky: true, bearsLoad: true } }, D: { solid: { blocksSky: true, bearsLoad: true } }, R: { solid: { blocksSky: true, bearsLoad: true } },
  B: { solid: { blocksSky: true, bearsLoad: true } },
  W: { liquid: { blocksSky: false, bearsLoad: false }, solid: { blocksSky: true, bearsLoad: true } },
  A: { gas: { blocksSky: false, bearsLoad: false } }, // 空气是一行材料：气栏四布尔皆假由数据给（卷三甲 :129–:131），不是代码常量
  Q: {},
};
const flagOf = (material, state, flag) => {
  const row = FLAGS[material];
  const v = row && row[state] ? row[state][flag] : undefined;
  return v === undefined ? null : v;
};

test('标志：按材料分态布尔与格种类算，不按材料代号；空气三标志为假；地面上一层空气可立足、再上一层不可立足', () => {
  const c = col(); // 地表层 5，地表材料 S
  assert.deepEqual(cellFlags(c, 6, flagOf), { blocksSky: false, bearsLoad: false, standable: true }); // 地面上的空气：头顶无遮、脚下承托
  assert.deepEqual(cellFlags(c, 7, flagOf), { blocksSky: false, bearsLoad: false, standable: false }); // 脚下是空气，不可立足
  assert.deepEqual(cellFlags(c, 5, flagOf), { blocksSky: false, bearsLoad: true, standable: false }); // 地表层本身是实心，不可穿行
  assert.equal(cellFlags(c, 4, flagOf).blocksSky, true); // 土层之上有地表实心料遮天
});

test('标志：结冰的水面可立足、液态水面不可立足；水柱里的格头顶有冰则遮天（冰固栏遮天为真、液栏为假）', () => {
  const frozen = col({ surfaceZ: 1, water: { levelZ: 4, liquidL: 450000n, iceL: 150000n, liquidMaterial: 'W' } }); // 冰 1 层在 z=4
  assert.equal(cellFlags(frozen, 5, flagOf).standable, true); // 冰面之上一层空气，脚下冰承托
  assert.equal(cellFlags(frozen, 4, flagOf).bearsLoad, true); // 冰格能承托
  assert.equal(cellFlags(frozen, 3, flagOf).bearsLoad, false); // 液态水格不能
  assert.equal(cellFlags(frozen, 3, flagOf).standable, false); // 水格不是空气类，且脚下（z=2）是液态水不承托
  assert.equal(cellFlags(frozen, 3, flagOf).blocksSky, true); // z=4 的冰遮天
  const liquid = col({ surfaceZ: 1, water: { levelZ: 4, liquidL: 600000n, iceL: 0n, liquidMaterial: 'W' } });
  assert.equal(cellFlags(liquid, 5, flagOf).standable, false); // 水面之上的空气，脚下是液态水
  assert.equal(cellFlags(liquid, 3, flagOf).blocksSky, false); // 水之上都是液体与空气，不遮天
});

test('标志：材料行缺数据（未知）按未知往下传，不当成假：承托未知则可立足未知、上方有未知材料且没有确定遮天者则遮天未知', () => {
  const q = col({ tpl: { ...TPL, surfaceMaterial: 'Q' } });
  assert.equal(cellFlags(q, 6, flagOf).standable, null);
  assert.equal(cellFlags(q, 4, flagOf).blocksSky, null);
  // 上方另有确定遮天的格块：遮天为真（真值胜过未知）。
  const withBlock = col({ tpl: { ...TPL, surfaceMaterial: 'Q' }, blocks: [{ j: 0, x0: 0, x1: 0, y0: 0, y1: 0, z0: 9, z1: 9, material: 'B', selfSupport: true }] });
  assert.equal(cellFlags(withBlock, 4, flagOf).blocksSky, true);
  // 空气也是一行材料，标志来自它的行：读口给 null（真未知）就是未知，代码里没有"空气恒为假"。
  assert.equal(cellFlags(col(), 6, () => null).standable, null); // 脚下地表料读不到
  assert.equal(cellFlags(col(), 4, () => null).blocksSky, null); // 头顶的地表料读不到
  assert.equal(cellFlags(col(), 8, flagOf).blocksSky, false); // 头顶是空气行：气栏遮天为假（来自数据）
  assert.equal(cellFlags(col({ tpl: { ...TPL, airMaterial: 'Q' } }), 6, flagOf).bearsLoad, null); // 空气行换成数据缺的材料：未知，不是假
});

test('自然坡：两个相邻自然列且站立层恰差一层可一步走通，差两层是崖；格块压在地表层或其上一层的列不算自然列', () => {
  const a = col({ x: 0, surfaceZ: 5 });
  assert.equal(naturalStepOk(a, col({ x: 1, surfaceZ: 6 })), true);
  assert.equal(naturalStepOk(a, col({ x: 1, surfaceZ: 4 })), true);
  assert.equal(naturalStepOk(a, col({ x: 1, surfaceZ: 5 })), false); // 同层不是"差一层"的坡（平走另算）
  assert.equal(naturalStepOk(a, col({ x: 1, surfaceZ: 7 })), false); // 崖
  const blocked = col({ x: 1, surfaceZ: 6, blocks: [{ j: 0, x0: 1, x1: 1, y0: 0, y1: 0, z0: 7, z1: 8, material: 'B', selfSupport: true }] });
  assert.equal(isNaturalColumn(blocked), false); // 地表层上一层（7）被格块占
  assert.equal(naturalStepOk(a, blocked), false);
  // 格块在更高处（z=9）不影响这两层：仍是自然列。
  assert.equal(isNaturalColumn(col({ x: 1, surfaceZ: 6, blocks: [{ j: 0, x0: 1, x1: 1, y0: 0, y1: 0, z0: 9, z1: 9, material: 'B', selfSupport: true }] })), true);
  // 叠入口改动了这两层之一（存量形态、差分）：不算自然列。
  assert.equal(isNaturalColumn(col({ overlay: (c, z) => (z === 6 ? { material: 'T', state: 'solid', selfSupport: false } : null) })), false);
});

test('区格坡度：相邻区格中心地表高差绝对值的最大者 ÷ regionCellM，截到 [0, 1]；未知邻格不参加；没有可比邻格为 0', () => {
  // 本区格 100 m，邻格 90、120、100：差 10、20、0 → 最大 20 ÷ 100 = 0.2。
  assert.equal(regionSlope(GRID, m(100), [m(90), m(120), m(100)]), 0.2);
  assert.equal(regionSlope(GRID, m(100), []), 0); // 没有框内邻格（外包框外不是区格，调用方不交）
  assert.equal(regionSlope(GRID, m(0), [m(250)]), 1); // 250 ÷ 100 = 2.5 → 截到 1
  // 框内邻格高度未知（null）：最大者未知，坡度未知，按卷二 §1.12 往下传，不跳过（M3）。
  assert.equal(regionSlope(GRID, m(100), [m(90), null, m(100)]), null);
  assert.equal(regionSlope(GRID, m(100), [null, null]), null);
  // 例外：已知部分已截到 1（再大也是 1），未知邻格不改变结果。
  assert.equal(regionSlope(GRID, m(0), [m(250), null]), 1);
  assert.equal(regionSlope(GRID, m(0), [m(100), null]), 1); // 100 ÷ 100 = 1 恰为上界
});

// ---------- 模板格块（#8，卷十 R10-2.15 :435） ----------

const BLOCK = (extra = {}) => ({ material: 'B', selfSupport: true, liftLayers: 2, thickLayers: 4, radiusCells: 3, permille: 1000, ...extra });

test('模板格块：中心列地表层之上 liftLayers 空层后起 thickLayers 层、切比雪夫半径 radiusCells；区格 (0,0) 中心列 x=y=50', () => {
  // 区格边长 100 细格：中心列 50；地表层 10：z0 = 10 + 1 + 2 = 13，z1 = 13 + 4 − 1 = 16；x、y 取 47..53。
  const [h] = templateBlocksOf(GRID, 'seed', 0, { x: 0, y: 0 }, [BLOCK()], 10);
  assert.deepEqual(h, { j: 0, x0: 47, x1: 53, y0: 47, y1: 53, z0: 13, z1: 16, material: 'B', selfSupport: true });
  // 负区格序号：(−1, 2) 的 x 范围 −100..−1、中心 −50；半径 60 向右到 −50 + 60 = 10，截到区格内 −1；向左 −110 截到 −100。y：200..299 中心 250 → 190..310 截到 200..299。
  const [t] = templateBlocksOf(GRID, 'seed', 0, { x: -1, y: 2 }, [BLOCK({ radiusCells: 60 })], 0);
  assert.deepEqual([t.x0, t.x1, t.y0, t.y1], [-100, -1, 200, 299]);
  // liftLayers 0：紧贴地面上一层起。
  assert.equal(templateBlocksOf(GRID, 'seed', 0, { x: 0, y: 0 }, [BLOCK({ liftLayers: 0 })], 10)[0].z0, 11);
});

test('模板格块：千分数取自区格种子的抽取点 tplblock.<j>：permille 1000 必中、0 必不中；同输入逐位相同、与派生次序无关；中间值命中频率落在宽带内', () => {
  const blocks = [BLOCK({ permille: 1000 }), BLOCK({ permille: 0 }), BLOCK({ permille: 1000, material: 'C' })];
  const hits = templateBlocksOf(GRID, 's1', 3, { x: 7, y: 9 }, blocks, 4);
  assert.deepEqual(hits.map((h) => h.j), [0, 2]);
  assert.deepEqual(hits, templateBlocksOf(GRID, 's1', 3, { x: 7, y: 9 }, blocks, 4));
  // 相邻两区格乱序派生，逐格结果相同（各区格互不依赖）。
  const a1 = templateBlocksOf(GRID, 's1', 3, { x: 7, y: 9 }, blocks, 4);
  const b1 = templateBlocksOf(GRID, 's1', 3, { x: 8, y: 9 }, blocks, 4);
  const b2 = templateBlocksOf(GRID, 's1', 3, { x: 8, y: 9 }, blocks, 4);
  const a2 = templateBlocksOf(GRID, 's1', 3, { x: 7, y: 9 }, blocks, 4);
  assert.deepEqual([a1, b1], [a2, b2]);
  // 千分数 500：400 个区格里命中数应在 200 ± 60 内（均匀抽取；宽带只防"从不/总是"的错）。
  let n = 0;
  for (let i = 0; i < 400; i += 1) if (templateBlocksOf(GRID, 'hit', 0, { x: i, y: 0 }, [BLOCK({ permille: 500 })], 0).length === 1) n += 1;
  assert.ok(n > 140 && n < 260, `hits ${n}`);
  // 换世界种子、换区格种子键，抽取点键不同。
  assert.notEqual(tplBlockKey(regionCellSeedKey('a', 0, 0, 0), 0), tplBlockKey(regionCellSeedKey('b', 0, 0, 0), 0));
  assert.notEqual(tplBlockKey(regionCellSeedKey('a', 0, 0, 0), 0), tplBlockKey(regionCellSeedKey('a', 0, 0, 0), 1));
  // uniformBelow 的边：u 取 0 → 0；取 2^64 − 1 → n − 1。
  assert.equal(uniformBelow(0n, 1000n), 0n);
  assert.equal(uniformBelow(BigInt('0xffffffffffffffff'), 1000n), 999n);
  assert.throws(() => uniformBelow(1n, 0n), err('E-DET-DOMAIN'));
});

test('模板格块自承托标志随格块；格块不是存量：模板里没有任何余额或件数字段（格块项只有材料、自承托、层、半径、千分数）', () => {
  const [h] = templateBlocksOf(GRID, 'seed', 0, { x: 0, y: 0 }, [BLOCK({ selfSupport: false })], 0);
  assert.equal(h.selfSupport, false);
  assert.deepEqual(Object.keys(h).sort(), ['j', 'material', 'selfSupport', 'x0', 'x1', 'y0', 'y1', 'z0', 'z1']);
});

// ---------- 加载期校验：gentemplate 族与 cellclass.genTemplate（#6、#16） ----------

const MATS = new Set(['mat_soil', 'mat_rock', 'mat_air']);
const hasMat = (c) => MATS.has(c);
const idx = (entries) => new Map(entries.map(([code, family, entry]) => [code, { family, entry }]));
const GOOD = { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 2, soilMaterial: 'mat_soil', rockMaterial: 'mat_rock', blocks: [{ material: 'mat_rock', selfSupport: true, liftLayers: 0, thickLayers: 1, radiusCells: 1, permille: 1000 }] };

test('gentemplate 加载校验：材料引用不存在、soilLayers 负数或非整数、格块项越域逐条报；cellclass 指向不存在的模板报 E-DIM-REF-MISSING', () => {
  const ok = idx([['gtpl_a', 'gentemplate', GOOD], ['cellclass_a', 'cellclass', { genTemplate: 'gtpl_a' }]]);
  assert.deepEqual(checkGenTemplates(ok, hasMat, true), []);
  const codesOf = (entry, requireRefs = true) => checkGenTemplates(idx([['gtpl_a', 'gentemplate', entry]]), hasMat, requireRefs).map((s) => s.split(' ')[0]);
  assert.deepEqual(codesOf({ ...GOOD, surfaceMaterial: 'mat_none' }), ['E-DIM-REF-MISSING']);
  assert.deepEqual(codesOf({ ...GOOD, rockMaterial: undefined }), ['E-DIM-REF-MISSING']);
  assert.deepEqual(codesOf({ ...GOOD, airMaterial: undefined }), ['E-DIM-REF-MISSING']); // 空气是一行材料，必填
  assert.deepEqual(codesOf({ ...GOOD, airMaterial: 'mat_none' }), ['E-DIM-REF-MISSING']);
  assert.deepEqual(codesOf({ ...GOOD, soilLayers: -1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(codesOf({ ...GOOD, soilLayers: 1.5 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(codesOf({ ...GOOD, blocks: null }), ['E-DIM-DOMAIN-RANGE']);
  const bad = (patch) => codesOf({ ...GOOD, blocks: [{ ...GOOD.blocks[0], ...patch }] });
  assert.deepEqual(bad({ material: 'mat_none' }), ['E-DIM-REF-MISSING']);
  assert.deepEqual(bad({ thickLayers: 0 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ radiusCells: 0 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ liftLayers: -1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ permille: 1001 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ permille: -1 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ selfSupport: 'yes' }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(bad({ permille: 0 }), []); // 端值合法
  // cellclass 引用：缺 genTemplate、指向不存在、指向别的族都拒；requireRefs 为假不核。
  const noRef = idx([['gtpl_a', 'gentemplate', GOOD], ['cellclass_a', 'cellclass', {}]]);
  assert.deepEqual(checkGenTemplates(noRef, hasMat, true).map((s) => s.split(' ')[0]), ['E-DIM-REF-MISSING']);
  assert.deepEqual(checkGenTemplates(noRef, hasMat, false), []);
  const wrongFamily = idx([['gtpl_a', 'gentemplate', GOOD], ['cellclass_a', 'cellclass', { genTemplate: 'cellclass_b' }], ['cellclass_b', 'cellclass', { genTemplate: 'gtpl_a' }]]);
  assert.deepEqual(checkGenTemplates(wrongFamily, hasMat, true).map((s) => s.split(' ')[0]), ['E-DIM-REF-MISSING']);
});

test('扩展性（A5-3.3）：只加数据——新增一条 cellclass 与它的 gentemplate，条件成立的区格自动改用它，不改代码', () => {
  const entries = [
    ['cellclass_plain', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_grass' }],
  ];
  const input = { terrain: 'terrain_plain', waterKind: null, slope: 0.7, onRoad: false, inSettlement: false };
  assert.equal(cellClassOf(entries, input), 'cellclass_plain');
  // 加一条只在陡坡上成立、优先级更高的条目（新数据）：陡坡区格改用它，缓坡区格不变。
  const more = [...entries, ['cellclass_cliff', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0.5, 1], onRoad: null, inSettlement: null, priority: 5, genTemplate: 'gtpl_rock' }]];
  assert.equal(cellClassOf(more, input), 'cellclass_cliff');
  assert.equal(cellClassOf(more, { ...input, slope: 0.1 }), 'cellclass_plain');
  // 地形类取得模板：经词表索引读 cellclass.genTemplate → gentemplate 条目。
  const v = idx([['cellclass_cliff', 'cellclass', more[1][1]], ['gtpl_rock', 'gentemplate', GOOD]]);
  assert.equal(genTemplateOf(v, 'cellclass_cliff').code, 'gtpl_rock');
  assert.equal(genTemplateOf(v, 'cellclass_cliff').soilLayers, 2);
  assert.throws(() => genTemplateOf(v, 'cellclass_none'), err('E-DIM-REF-MISSING'));
});

// ---------- 数量取账、位置取序（#10–#13，卷五 §4.7 规则 12） ----------

test('画几个：N = floor(余额 ÷ 单位质量)；单位质量非正或余额为负拒收（不除零）', () => {
  assert.equal(stockCount(1000, 60), 16); // 1000 ÷ 60 = 16.67 → 16
  assert.equal(stockCount(59.9, 60), 0);
  assert.equal(stockCount(0, 60), 0);
  assert.equal(stockCount(120, 60), 2);
  assert.throws(() => stockCount(100, 0), err('E-DET-DOMAIN'));
  assert.throws(() => stockCount(100, -5), err('E-DET-DOMAIN'));
  assert.throws(() => stockCount(-1, 5), err('E-DET-DOMAIN'));
});

const WS = 'w-seed';
const reg = (x, y, cap = 100, excluded = 0) => ({ x, y, cap, excluded });
const dist = (regions, N, extra = {}) => distributeStock({ worldSeed: WS, w: 0, unit: 'place_u', stock: 'tree', N, regions, ...extra });
// 区格按次序键排名（与规则 :911 同一键；并列按区格序号）。
const rankOf = (regions) => regions.map((r) => ({ ...r, key: stockRegionKey(WS, 'place_u', 'tree', 0, r.x, r.y) })).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.x - b.x || a.y - b.y)).map((r) => `${r.x},${r.y}`);
const nOf = (out) => Object.fromEntries(out.map((o) => [`${o.x},${o.y}`, o.n]));
const sum = (out) => out.reduce((s, o) => s + o.n, 0);

test('分到区格：m_c = floor(T ÷ E) + (名次 < T mod E 时 1)；Σ n_c 恰为 N；结果与区格输入次序无关', () => {
  const R = [reg(0, 0), reg(1, 0), reg(0, 1)]; // E = 3
  // N = 7、S = 0 → T = 7：floor = 2、mod = 1，名次 0 的区格 3 棵，其余 2 棵。
  const out = dist(R, 7);
  const order = rankOf(R);
  assert.deepEqual(nOf(out), { [order[0]]: 3, [order[1]]: 2, [order[2]]: 2 });
  assert.equal(sum(out), 7);
  // 输入次序打乱，结果相同；输出按区格 (x, y) 字典序。
  assert.deepEqual(dist([R[2], R[0], R[1]], 7), out);
  assert.deepEqual(out.map((o) => [o.x, o.y]), [[0, 0], [0, 1], [1, 0]]);
  // 余额增长一棵（N = 8 → T = 8：mod 2）：名次 1 的区格多一棵，其余不动（再生落在轮流分配的下一个位置所在区格）。
  const more = nOf(dist(R, 8));
  assert.deepEqual(more, { [order[0]]: 3, [order[1]]: 3, [order[2]]: 2 });
});

test('一致性（A5-1.2）：玩家砍一棵＝N 减一、S 加一、T 不变，各 m_c 不变，只有那一区格 n_c 减一；泡外伐木只减账户，整单元恰少 k 棵、从轮流分配末尾少', () => {
  const R = [reg(0, 0), reg(1, 0), reg(2, 0)];
  // 起：N = 6、S = 0、T = 6、E = 3 → 每区格 2 棵。玩家在 (1,0) 砍一棵：N = 5、该区格排除 1（树桩）→ T = 6 不变，各 m_c = 2 不变；
  // 只有 (1,0) 的 n = 2 − 1 = 1，其余 2、2，合计 5 = N。被排除的恰是那一格（排除格不再进候选，见 pickStockCells 用例）。
  const before = nOf(dist(R, 6));
  assert.deepEqual(before, { '0,0': 2, '1,0': 2, '2,0': 2 });
  const chopped = nOf(dist([reg(0, 0), reg(1, 0, 100, 1), reg(2, 0)], 5));
  assert.deepEqual(chopped, { '0,0': 2, '1,0': 1, '2,0': 2 });
  // 泡外伐木 k = 1：只减账户，N = 5、S = 0、T = 5：floor 1、mod 2 → 名次 0、1 的区格 2 棵，名次 2 的 1 棵；与 N = 6 相比恰是名次末尾（2）的区格少一棵。
  const away = nOf(dist(R, 5));
  const order = rankOf(R);
  assert.deepEqual(away, { [order[0]]: 2, [order[1]]: 2, [order[2]]: 1 });
  // k = 3 → N = 3：每区格 1 棵，整单元少 3。
  assert.equal(sum(dist(R, 3)), 3);
  // 任何时刻个数恰等于余额折出的个数：遍历 N = 0..30 逐个核。
  for (let N = 0; N <= 30; N += 1) assert.equal(sum(dist(R, N)), N);
});

test('越界截断：n_c 超过 cap_c − S_c 的截到界内，差额从区格次序末尾往前补到仍有余量的区格；n_c 为负的截到 0，差额从末尾往前扣；Σ n_c 恰为 N', () => {
  const R = [reg(0, 0, 1), reg(1, 0), reg(2, 0)]; // (0,0) 只有 1 个候选格
  const order = rankOf(R);
  // N = 6、S = 0 → 每区格 2；(0,0) 上限 1，截下 1 个补到次序末尾往前第一个有余量的区格：末位若是 (0,0) 则跳过它，取倒数第二。
  const out = nOf(dist(R, 6));
  assert.equal(out['0,0'], 1);
  const lastWithRoom = [...order].reverse().find((k) => k !== '0,0');
  assert.equal(out[lastWithRoom], 3);
  assert.equal(Object.values(out).reduce((s, v) => s + v, 0), 6);
  // 负：(0,0) 排除 3 个（S = 3）、cap 10；N = 1 → T = 4、E = 3：floor 1、mod 1，m = [2,1,1]（按名次）；(0,0) 的 n = m − 3 ≤ −1，截到 0，差额从末尾往前扣。
  const neg = dist([reg(0, 0, 10, 3), reg(1, 0), reg(2, 0)], 1);
  assert.equal(sum(neg), 1);
  assert.equal(nOf(neg)['0,0'], 0);
  assert.ok(neg.every((o) => o.n >= 0));
  // 恰好占满：N + S = Σcap 通过，每格都画上。
  const full = dist([reg(0, 0, 2, 1), reg(1, 0, 3)], 4); // Σcap = 5，S = 1，N = 4
  assert.deepEqual(nOf(full), { '0,0': 1, '1,0': 3 });
});

test('越界截断：正负差额并存时按净差补平，不误报超限（复核反例）：A{cap 1, S 0}、B{cap 3, S 3}，N = 1', () => {
  // S = 3、T = 4、E = 2、m = 2：A 的 raw = 2 超上界 1（plus 1），B 的 raw = 2 − 3 = −1（minus 1）；净差 0，截后 A 1、B 0，Σ = 1 = N，N + S = 4 = Σcap 可行。
  // 与两区格的次序无关：不同坐标各试。
  for (const [a, b] of [[[0, 0], [1, 0]], [[1, 0], [0, 0]], [[5, 5], [2, 7]]]) {
    const out = dist([reg(a[0], a[1], 1, 0), reg(b[0], b[1], 3, 3)], 1);
    assert.deepEqual(nOf(out), { [`${a[0]},${a[1]}`]: 1, [`${b[0]},${b[1]}`]: 0 });
  }
  // 净差为负：A{cap 10, S 5}、B、C{cap 10}，N = 1：T = 6、E = 3、m = 2，A 的 n = 2 − 5 = −3 截到 0（minus 3），B、C 各 2；截后 Σ = 4，净差 = 1 − 4 = −3，
  // 从次序末尾往前在 n > 0 的区格扣共 3，Σ n = 1。
  const neg = dist([reg(0, 0, 10, 5), reg(1, 0), reg(2, 0)], 1);
  assert.equal(sum(neg), 1);
  assert.equal(nOf(neg)['0,0'], 0);
  // 小输入穷举：Σ n 恰为 N、每区格 n ∈ [0, cap − S]（N 取 0 到可行上限）。
  for (const caps of [[1, 3, 3], [2, 2, 1], [0, 3, 3], [1, 1, 4]]) for (const ex of [[0, 0, 0], [0, 3, 3], [1, 2, 0], [0, 1, 1]]) {
    const R = caps.map((c, i) => reg(i, 0, c, Math.min(ex[i], c)));
    const free = R.reduce((s, r) => s + r.cap - r.excluded, 0);
    for (let N = 0; N <= free; N += 1) {
      const out = dist(R, N);
      assert.equal(sum(out), N, JSON.stringify([caps, ex, N]));
      for (const o of out) { const r = R.find((q) => q.x === o.x); assert.ok(o.n >= 0 && o.n <= r.cap - r.excluded, JSON.stringify([caps, ex, N, o])); }
    }
  }
});

test('N + S 超过 Σ cap_c：报 E-GRID-STOCK-OVER-CAP，不截；某区格排除格比候选格还多同样报；N 非整数或为负拒收；没有区格时 N 为 0 返回空、非 0 报超限', () => {
  assert.throws(() => dist([reg(0, 0, 2), reg(1, 0, 2)], 5), err('E-GRID-STOCK-OVER-CAP'));
  assert.throws(() => dist([reg(0, 0, 2, 1), reg(1, 0, 2)], 4), err('E-GRID-STOCK-OVER-CAP')); // N + S = 5 > 4
  assert.throws(() => dist([reg(0, 0, 1, 2)], 0), err('E-GRID-STOCK-OVER-CAP'));
  assert.throws(() => dist([reg(0, 0)], -1), err('E-DET-DOMAIN'));
  assert.throws(() => dist([reg(0, 0)], 1.5), err('E-DET-DOMAIN'));
  assert.throws(() => dist([reg(0, 0, 1.5)], 1), err('E-DET-DOMAIN'));
  assert.deepEqual(dist([], 0), []);
  assert.throws(() => dist([], 1), err('E-GRID-STOCK-OVER-CAP'));
  assert.deepEqual(nOf(dist([reg(0, 0, 0)], 0)), { '0,0': 0 }); // 候选格 0、N 0：合法
});

test('区格内取格：候选格（已去掉排除格）按 hash(世界种子, U, x, 格序号) 升序取前 n；与候选格给出次序无关；n 超过候选格数报超限', () => {
  const id = { worldSeed: WS, w: 0, unit: 'place_u', stock: 'tree' };
  const cells = [];
  for (let x = 0; x < 4; x += 1) for (let y = 0; y < 4; y += 1) cells.push({ x, y, z: 3 });
  const picked = pickStockCells(id, cells, 5);
  // 期望：把 16 格按 stockCellKey 升序取前 5（测试里按同一键排序算出）。
  const byKey = [...cells].sort((a, b) => { const ka = stockCellKey(WS, 'place_u', 'tree', 0, a.x, a.y, a.z); const kb = stockCellKey(WS, 'place_u', 'tree', 0, b.x, b.y, b.z); return ka < kb ? -1 : ka > kb ? 1 : 0; });
  assert.deepEqual(picked, byKey.slice(0, 5));
  assert.deepEqual(pickStockCells(id, [...cells].reverse(), 5), picked);
  // 砍倒的那一格进排除格（候选里去掉）：其余已画的树不挪（前 n 格里去掉它之后，顺位递补只在 n 不变时发生；这里 n 减一，所以前 4 格正是原来前 5 格去掉被砍那一格）。
  const chopped = picked[2];
  const rest = cells.filter((c) => !(c.x === chopped.x && c.y === chopped.y));
  assert.deepEqual(pickStockCells(id, rest, 4), picked.filter((c) => c !== chopped));
  assert.deepEqual(pickStockCells(id, cells, 0), []);
  assert.throws(() => pickStockCells(id, cells, 17), err('E-GRID-STOCK-OVER-CAP'));
  assert.throws(() => pickStockCells(id, cells, -1), err('E-DET-DOMAIN'));
});

test('候选格只用高度场：每列 (x, y, 地表层 + 1)，不调用基底生成；skip 回调跳过建筑足迹的列', () => {
  const surface = (x, y) => (x === 1 && y === 1 ? 7 : 3); // 只给层号，不给材料
  const out = plantCandidateCells({ x: 0, y: 0 }, 2, surface); // 区格边长 2 细格
  assert.deepEqual(out, [{ x: 0, y: 0, z: 4 }, { x: 0, y: 1, z: 4 }, { x: 1, y: 0, z: 4 }, { x: 1, y: 1, z: 8 }]);
  assert.deepEqual(plantCandidateCells({ x: -1, y: 0 }, 2, surface, (x) => x === -2).map((c) => [c.x, c.y]), [[-1, 0], [-1, 1]]);
});

test('控制点子集（nearControlPoints）是精确的：区格内任一列在子集上求的控制面与在全部控制点上求的逐位相同，包括并列距离与控制点恰在列上', () => {
  // 格点布局：16 × 16 个控制点、间距 100 m，处处有等距并列；海拔按点序变化，使并列点的权不同。
  const cps = [];
  for (let i = 0; i < 16; i += 1) for (let j = 0; j < 16; j += 1) cps.push({ id: `p${String(i).padStart(2, '0')}${String(j).padStart(2, '0')}`, x: i * 100 + 50, y: j * 100 + 50, elevM: 10 + ((i * 7 + j * 3) % 11) * 9 });
  cps.push({ id: 'unknown', x: 1555, y: 777, elevM: null }); // 缺值点：入选才影响，子集必须与全集同入同不入
  const entry = { reliefM: 0, reliefRough: 0.5 };
  for (const [rx, ry] of [[0, 0], [5, 5], [7, 3], [15, 15], [-1, -1], [3, 7]]) {
    const near = nearControlPoints(GRID, cps, rx, ry);
    for (let dx = 0; dx < 100; dx += 9) for (let dy = 0; dy < 100; dy += 11) {
      const x = rx * 100 + dx;
      const y = ry * 100 + dy;
      assert.deepEqual(columnSurface(GRID, 's', 0, near, entry, x, y), columnSurface(GRID, 's', 0, cps, entry, x, y), `region ${rx},${ry} column ${x},${y}`);
    }
    // 恰在控制点上的列（点 (50 + 100i, 50 + 100j)，取该点的值）。
    const onPoint = columnSurface(GRID, 's', 0, near, entry, rx * 100 + 50, ry * 100 + 50);
    assert.deepEqual(onPoint, columnSurface(GRID, 's', 0, cps, entry, rx * 100 + 50, ry * 100 + 50));
  }
  // 区格 (7,3) 远离缺值点 (1555, 777)：子集里没有它；真正的近处确实缩小了集合（256 个点里只留几十个）。
  const far = nearControlPoints(GRID, cps, 7, 3);
  assert.ok(far.length < 80 && !far.some((p) => p.id === 'unknown'));
  // 控制点不多于 K 个：原样返回同一数组。
  const few = [{ id: 'a', x: 0, y: 0, elevM: 1 }, { id: 'b', x: 9, y: 9, elevM: 2 }];
  assert.equal(nearControlPoints(GRID, few, 3, 3), few);
});

// ---------- 确定性与整数（#1、#2、#15） ----------

test('确定性：列地表只依赖（世界种子、w、控制点、地形条目、列坐标），共用格点噪声的 memo 有无不改结果；输出全是整数', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 300, y: 0, elevM: 220 }];
  const entry = { reliefM: 40, reliefRough: 0.5 };
  const memo = new Map();
  const cols = [];
  for (let x = 40; x < 46; x += 1) for (let y = 10; y < 14; y += 1) cols.push([x, y]);
  const withMemo = cols.map(([x, y]) => columnSurface(GRID, 'sd', 0, cps, entry, x, y, memo));
  const without = cols.map(([x, y]) => columnSurface(GRID, 'sd', 0, cps, entry, x, y));
  assert.deepEqual(withMemo, without);
  // 打乱遍历次序、清 memo 重算，逐位相同。
  const shuffled = [...cols].reverse().map(([x, y]) => columnSurface(GRID, 'sd', 0, cps, entry, x, y, new Map())).reverse();
  assert.deepEqual(shuffled, without);
  for (const c of without) assert.ok(typeof c.h === 'bigint' && Number.isInteger(c.z));
  // 地表层号 = floor(h ÷ storeyM)：层号 × 3 m ≤ h < (层号 + 1) × 3 m。
  for (const c of without) assert.ok(c.h >= m(c.z * 3) && c.h < m((c.z + 1) * 3));
  // 换世界种子，起伏不同（reliefM 40 下 24 列里至少一列不同）。
  const other = cols.map(([x, y]) => columnSurface(GRID, 'sd2', 0, cps, entry, x, y));
  assert.notDeepEqual(other, without);
  // reliefM = 0：高度只随控制面（平滑），任一列 h 落在两控制点海拔之间。
  const flat = columnSurface(GRID, 'sd', 0, cps, { reliefM: 0, reliefRough: 0.5 }, 150, 0);
  assert.ok(flat.h > m(100) && flat.h < m(220));
  assert.equal(fixedToNumber(columnSurface(GRID, 'sd', 0, [{ id: 'p', x: 0, y: 0, elevM: 150 }], { reliefM: 0, reliefRough: 0.5 }, 0, 0).h), 150);
});
