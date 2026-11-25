// 格子迁移 G2《高度场与区格派生》卡内测试（卷五 §4.3 规则 8–9、§4.1 规则 15；卷二十七 R27-5.9、A27-5.6）。
// 期望值按卷文公式手算成字面量（控制面平方反比加权、层号向下取整、取值域截断）；起伏噪声是 sha256 派生，只断言确定性、幅度界与 reliefM=0 归零。
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { installFixedConstants, fixedUnits, fixedToNumber } from '../../server-plugin/kernel/det-math.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { controlSurfaceAt, reliefAt, surfaceHeightAt, surfaceStorey, cellClassOf, regionCellSeedKey, heightMeters } from '../../server-plugin/kernel/grid.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

// 夹具常数照 world/rules/tables/grid.json（值只作测试前提，不抄仓库运行态读数）。
const GRID = Object.freeze({
  storeyM: 3, regionCellM: 100, heightCtrlK: 4, reliefOctaves: 4,
  surfaceElevationMinM: -12000, surfaceElevationMaxM: 9000,
});

const m = (v) => fixedUnits(v); // 米 → 定点

test('控制面未知传播：最近 K 个控制点里有海拔未知（null）者即未知；未入选的远处缺值点不影响；surfaceHeightAt 同样返回 null（不加起伏、不夹取）', () => {
  const g = { ...GRID, heightCtrlK: 2 };
  const near = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 100, y: 0, elevM: 200 }];
  // 第三个点很远且缺值：K=2 时不入选，结果同只有 a、b（(50,0) 到 a、b 距离平方都是 2500，权相等 → 150）。
  assert.equal(controlSurfaceAt(g, [...near, { id: 'z', x: 50000, y: 0, elevM: null }], 50, 0), m(150));
  // 缺值点变成第二近：入选，未知。
  assert.equal(controlSurfaceAt(g, [near[0], { id: 'n', x: 100, y: 0, elevM: null }, { id: 'f', x: 900, y: 0, elevM: 300 }], 50, 0), null);
  // 恰在有值点上、另一入选点缺值：取该点的值（卷五 :656，结果不依赖别的点）：(100,0) 恰在 b 上，b = 200，入选的 n（缺值）不影响。
  assert.equal(controlSurfaceAt(g, [{ id: 'n', x: 0, y: 0, elevM: null }, near[1]], 100, 0), m(200));
  // 恰在缺值点上也是未知（不当作"取该点的值"，也不取别点）。
  assert.equal(controlSurfaceAt(g, [{ id: 'n', x: 0, y: 0, elevM: null }, near[1]], 0, 0), null);
  assert.equal(surfaceHeightAt(g, 's5', 0, [{ id: 'n', x: 0, y: 0, elevM: null }, near[1]], 10, 0.5, 0, 0), null);
});

test('控制面：单个控制点，任意列 h 等于其 anchorElevationM（heightCtrlK 取 1，加权平均一项等于本身）', () => {
  const g = { ...GRID, heightCtrlK: 1 };
  const cps = [{ id: 'p', x: 0, y: 0, elevM: 150 }];
  assert.equal(controlSurfaceAt(g, cps, 0, 0), m(150));
  assert.equal(controlSurfaceAt(g, cps, 300, 0), m(150));
});

test('控制面：该列恰在某控制点上时取该点的值', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 100, y: 0, elevM: 200 }];
  assert.equal(controlSurfaceAt(GRID, cps, 0, 0), m(100));
  assert.equal(controlSurfaceAt(GRID, cps, 100, 0), m(200));
});

test('控制面：平方反比加权（两点等距取平均，手算 150）', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 0, y: 100, elevM: 200 }];
  // 查询 (0, 50)：d_a² = d_b²，等权 → (100 + 200) / 2 = 150。
  assert.equal(controlSurfaceAt(GRID, cps, 0, 50), m(150));
});

test('控制面：权按距离平方反比（近者权大，手算 120）', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 300, y: 0, elevM: 200 }];
  // 查询 (100, 0)：d_a = 100、d_b = 200 → d² 之比 1:4，权之比 4:1 → (4·100 + 1·200) / 5 = 120。
  assert.equal(controlSurfaceAt(GRID, cps, 100, 0), m(120));
});

test('控制面：控制点相距很远（十万米）仍有定义，不因权取整为 0 而除零', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 100 }, { id: 'b', x: 200000, y: 0, elevM: 200 }];
  // 查询 (100000, 0)：两点各距 100000 m，等权 → 150。
  assert.equal(controlSurfaceAt(GRID, cps, 100000, 0), m(150));
});

test('起伏：reliefOctaves 过大使格距降到 0 时报 E-DET-DOMAIN，不除零', () => {
  assert.throws(() => reliefAt({ ...GRID, reliefOctaves: 40 }, 's0', 0, 5, 0.5, 1, 1), (e) => e.code === 'E-DET-DOMAIN' || /E-DET-DOMAIN/.test(String(e.message)));
});

test('控制面：并列取 id 码点序小的（heightCtrlK=1，两点等距不等高，查询点不在任一点上）', () => {
  const g = { ...GRID, heightCtrlK: 1 };
  // 查询 (0,0)：a 在 (−50,0)、b 在 (50,0)，d² 相等；只取 1 个，须取 id 小的 a，不论输入次序。
  const ab = [{ id: 'a', x: -50, y: 0, elevM: 100 }, { id: 'b', x: 50, y: 0, elevM: 200 }];
  assert.equal(controlSurfaceAt(g, ab, 0, 0), m(100));
  assert.equal(controlSurfaceAt(g, [...ab].reverse(), 0, 0), m(100));
});

test('控制面：没有控制点时拒收 E-DET-DOMAIN，不给缺省高度', () => {
  assert.throws(() => controlSurfaceAt(GRID, [], 0, 0), (e) => /E-DET-DOMAIN/.test(String(e.code) + String(e.message)));
});

test('起伏：reliefM=0 时起伏恒为 0', () => {
  assert.equal(reliefAt(GRID, 's1', 0, 0, 0.5, 123, 456), 0n);
});

test('起伏：同种子同输入逐位相同，且幅度不超过 reliefM × Σ reliefRough^k（手算 5 × 1.875 = 9.375）', () => {
  const a = reliefAt(GRID, 's2', 1, 5, 0.5, 300, 300);
  const b = reliefAt(GRID, 's2', 1, 5, 0.5, 300, 300);
  assert.equal(a, b);
  const bound = 93750n; // 9.375 m × 10⁴（4 级：1 + 0.5 + 0.25 + 0.125 = 1.875）
  assert.ok(a >= -bound && a <= bound, `relief ${a} within ±${bound}`);
});

test('地表高：取值域截到 [−12000, 9000]', () => {
  const hi = surfaceHeightAt(GRID, 's3', 0, [{ id: 'p', x: 0, y: 0, elevM: 20000 }], 0, 0.5, 0, 0);
  const lo = surfaceHeightAt(GRID, 's3', 0, [{ id: 'p', x: 0, y: 0, elevM: -20000 }], 0, 0.5, 0, 0);
  assert.equal(hi, m(9000));
  assert.equal(lo, m(-12000));
});

test('地表高：reliefM=0 时相邻区格只随控制面变（两控制点插值）', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 0 }, { id: 'b', x: 0, y: 200, elevM: 100 }];
  const h0 = surfaceHeightAt(GRID, 's4', 0, cps, 0, 0.5, 0, 0);
  const h1 = surfaceHeightAt(GRID, 's4', 0, cps, 0, 0.5, 0, 100);
  assert.equal(h0, m(0)); // 恰在控制点 a 上
  assert.equal(h1, m(50)); // (0,100)：与 a 距 100、与 b 距 100，等权平均 (0+100)/2
});

test('地表层号：floor(h ÷ storeyM)，负海拔向下取整', () => {
  assert.equal(surfaceStorey(GRID, m(150)), 50);
  assert.equal(surfaceStorey(GRID, m(0)), 0);
  assert.equal(surfaceStorey(GRID, m(-1)), -1);
  assert.equal(surfaceStorey(GRID, m(-12000)), -4000);
  assert.equal(surfaceStorey(GRID, m(9000)), 3000);
});

test('区格地形类：每区格恰一条成立且 priority 最大（并列取代号码点序最小）', () => {
  const entries = [
    ['cellclass_plain', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1 }],
    ['cellclass_rough', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 2 }],
    ['cellclass_lake', { terrains: ['terrain_lake'], waterAny: ['water_navigable'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 3 }],
    ['cellclass_road', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0, 1], onRoad: true, inSettlement: null, priority: 4 }],
  ];
  assert.equal(cellClassOf(entries, { terrain: 'terrain_plain', waterKind: null, slope: 0, onRoad: null, inSettlement: null }), 'cellclass_rough');
  assert.equal(cellClassOf(entries, { terrain: 'terrain_plain', waterKind: null, slope: 0, onRoad: true, inSettlement: null }), 'cellclass_road');
  assert.equal(cellClassOf(entries, { terrain: 'terrain_lake', waterKind: 'water_navigable', slope: 0, onRoad: null, inSettlement: null }), 'cellclass_lake');
  // 无条目成立 → null（数据须给全兜底条目，调用方报加载校验错，不在代码设缺省）
  assert.equal(cellClassOf(entries, { terrain: 'terrain_mountain', waterKind: null, slope: 0, onRoad: null, inSettlement: null }), null);
});

test('区格地形类：waterAny 非空而列不在水体足迹里即不成立；onRoad/inSettlement 空表示不限', () => {
  const entries = [
    ['cellclass_water', { terrains: ['terrain_plain'], waterAny: ['water_navigable'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1 }],
    ['cellclass_land', { terrains: ['terrain_plain'], waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1 }],
  ];
  assert.equal(cellClassOf(entries, { terrain: 'terrain_plain', waterKind: null, slope: 0, onRoad: null, inSettlement: null }), 'cellclass_land');
  assert.equal(cellClassOf(entries, { terrain: 'terrain_plain', waterKind: 'water_navigable', slope: 0, onRoad: null, inSettlement: null }), 'cellclass_water');
});

test('每区格独立种子键：确定性、64 位十六进制、无版本成分', () => {
  const a = regionCellSeedKey('world-seed-1', 0, 3, 7);
  const b = regionCellSeedKey('world-seed-1', 0, 3, 7);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
  // 种子键文本 = 世界种子 | grid | cell | w | 区格 x | 区格 y，不放版本成分（R27-5.9）
  const expected = createHash('sha256').update('world-seed-1|grid|cell|0|3|7', 'utf8').digest('hex');
  assert.equal(a, expected);
});

test('确定性：同一世界种子派生两遍、两种遍历次序，逐格相同（A27-5.6）', () => {
  const cps = [{ id: 'a', x: 0, y: 0, elevM: 80 }, { id: 'b', x: 0, y: 300, elevM: 160 }, { id: 'c', x: 300, y: 0, elevM: 40 }];
  const cells = [];
  for (let rx = 0; rx < 4; rx += 1) for (let ry = 0; ry < 4; ry += 1) cells.push([rx, ry]);
  const at = ([rx, ry]) => surfaceHeightAt(GRID, 'det-seed', 0, cps, 5, 0.5, rx * 100 + 50, ry * 100 + 50);
  const fwd = cells.map(at);
  const rev = [...cells].reverse().map(at);
  const again = cells.map(at);
  assert.deepEqual(fwd, again, '同一次序两遍相同');
  assert.deepEqual(rev, [...fwd].reverse(), '乱序派生逐格与正序相同');
});

test('heightMeters：定点米读出', () => {
  assert.equal(heightMeters(m(150)), 150);
  assert.equal(heightMeters(m(-1)), -1);
  assert.equal(heightMeters(1500000n), 150);
});
