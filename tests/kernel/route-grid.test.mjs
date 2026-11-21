// 格子迁移 G4 卡内测试之一：区格寻路核心（卷五 §4.1 规则 4、5；§4.10 规则 1、5）。
// 期望值按卷文公式手算成字面量，推算写在各用例注释；不读仓库此刻的计数。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { regionPath, stepLengths, slopeTerm, pathMetrics, mixShares } from '../../server-plugin/kernel/route-grid.mjs';
import { fixedUnits } from '../../server-plugin/kernel/det-math.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装配定点常数与 sqrt/atan 表
assert.ok(W.ok, W.text);
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

// 区格下标 k = y × cellsX + x。步长按规则表 regionCellM = 100（值只作测试前提）。
const lens = stepLengths({ regionCellM: 100 });
const box = (cellsX, cellsY) => ({ x0: 0, y0: 0, cellsX, cellsY });
const flatEnv = (b, blocked = new Set()) => ({
  box: b,
  lens,
  lower: { orth: Number(lens.orth), diag: Number(lens.diag) },
  stepCost: (u, v, len) => (blocked.has(v) ? null : len),
});

// ---------- 规则 4：步长 ----------

test('卷五 §4.1 规则 4：正交步长 = regionCellM，斜向 = fixedSqrtInt(2 × regionCellM²)，定点 BigInt', () => {
  // orth = 100 m × 10⁴ = 1000000；diag = ⌊√2 × 10⁶⌋ = ⌊1414213.56⌋ = 1414213。
  assert.deepEqual(stepLengths({ regionCellM: 100 }), { orth: 1000000n, diag: 1414213n });
});

// ---------- 规则 5：区格寻路 ----------

test('卷五 §4.1 规则 5：起点等于终点返回单格、代价 0、展开 0、未封顶', () => {
  assert.deepEqual(regionPath(flatEnv(box(5, 5)), 7, 7, 100), { cells: [7], cost: 0, expanded: 0, capped: false });
});

test('卷五 §4.1 规则 5：斜走最省，(0,0)→(1,1)→(2,2) 两步斜向', () => {
  // 两步斜向，每步 1414213，合计 2828426。
  const r = regionPath(flatEnv(box(5, 5)), 0, 12, 100);
  assert.deepEqual(r.cells, [0, 6, 12]);
  assert.equal(r.cost, 2828426);
});

test('卷五 §4.1 规则 5：同价同步数时取区格序号 (x, y) 序列字典序小的', () => {
  // 0=(0,0) 到 7=(2,1) 有两条同价同步数（正交+斜向，2414213）：
  //   先正交后斜向：0(0,0) → 1(1,0) → 7(2,1)；先斜后正交：0(0,0) → 6(1,1) → 7(2,1)。
  // 第二格 (1,0) 与 (1,1) 的 x 同为 1，y=0 < 1，取 (1,0)。
  const r = regionPath(flatEnv(box(5, 5)), 0, 7, 100);
  assert.deepEqual(r.cells, [0, 1, 7]);
  assert.equal(r.cost, 2414213); // 1000000 + 1414213
});

test('卷五 §4.1 规则 5：同价时取步数少的', () => {
  // 正交一步 1000000、斜向一步 2000000：0 到 12=(2,2) 的所有走法代价都是 4000000
  // （两斜 2 步、一斜两正交 3 步、四正交 4 步），步数最少的两斜步胜出。
  const env = {
    box: box(5, 5),
    lens,
    lower: { orth: 1000000, diag: 2000000 },
    stepCost: (u, v, len) => (len === lens.diag ? 2000000n : 1000000n),
  };
  const r = regionPath(env, 0, 12, 100);
  assert.deepEqual(r.cells, [0, 6, 12]);
  assert.equal(r.cost, 4000000);
});

test('卷五 §4.1 规则 5：绕开不可走的区格', () => {
  // 5×3，格 (1,0)=1 与 (1,1)=6 不可走；0=(0,0) 到 2=(2,0) 只能上绕：
  // 0(0,0)→5(0,1)→11(1,2)→7(2,1)→2(2,0)，正交 2 步 + 斜向 2 步 = 2000000 + 2828426。
  const r = regionPath(flatEnv(box(5, 3), new Set([1, 6])), 0, 2, 100);
  assert.deepEqual(r.cells, [0, 5, 11, 7, 2]);
  assert.equal(r.cost, 4828426);
});

test('卷五 §4.1 规则 5：没有通路时返回空，不封顶', () => {
  // 5×3，整列 x=1 的三格（1、6、11）不可走，0=(0,0) 与 4=(4,0) 被隔断。
  const r = regionPath(flatEnv(box(5, 3), new Set([1, 6, 11])), 0, 4, 100);
  assert.equal(r.cells, null);
  assert.equal(r.cost, null);
  assert.equal(r.capped, false);
});

test('卷五 §4.1 规则 5 末句：展开数超过上限即返回空并记封顶', () => {
  // cap=2 时展开第 3 个节点即超限；cap=100 足够找到 5×5 的 24=(4,4)。
  assert.equal(regionPath(flatEnv(box(5, 5)), 0, 24, 2).cells, null);
  assert.equal(regionPath(flatEnv(box(5, 5)), 0, 24, 2).capped, true);
  const r = regionPath(flatEnv(box(5, 5)), 0, 24, 100);
  assert.ok(Array.isArray(r.cells));
  assert.equal(r.cells[0], 0);
  assert.equal(r.cells[r.cells.length - 1], 24);
  assert.equal(r.capped, false);
});

test('卷五 §4.10.1：一步代价非正即拒（E-DIM-DOMAIN-RANGE），不放过', () => {
  const env = { ...flatEnv(box(3, 3)), stepCost: () => 0n };
  assert.throws(() => regionPath(env, 0, 8, 100), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
});

test('卷五 §4.1 规则 5 末句：带启发的结果与不带启发的逐格寻路逐位相同', () => {
  // 终点格 (x,y) 的步进系数 1 + ((7x + 3y) mod 5) ≥ 1，故 lower 取每步步长本身可采纳，取 0 等价于不带启发。
  // 系数只看终点格，反向路可以不同，只断言同向两种 lower 的结果彼此相同。
  const envOf = (lower) => ({
    box: box(6, 6),
    lens,
    lower,
    stepCost: (u, v, len) => len * BigInt(1 + (((v % 6) * 7 + (v - (v % 6)) / 6 * 3) % 5)),
  });
  const heur = envOf({ orth: Number(lens.orth), diag: Number(lens.diag) });
  const plain = envOf({ orth: 0, diag: 0 });
  const fwdH = regionPath(heur, 0, 35, 1000);
  const fwdP = regionPath(plain, 0, 35, 1000);
  assert.deepEqual(fwdH.cells, fwdP.cells);
  assert.equal(fwdH.cost, fwdP.cost);
  const revH = regionPath(heur, 35, 0, 1000);
  const revP = regionPath(plain, 35, 0, 1000);
  assert.deepEqual(revH.cells, revP.cells);
  assert.equal(revH.cost, revP.cost);
});

// ---------- 规则 4：地形构成（§4.10 A5-10.2 各项和为 1） ----------

test('卷五 §4.1 规则 4：mixShares 最大余数法凑满整份，余数并列取码点序小的', () => {
  // 三份等权：每份 10000÷3 = 3333，余 1 个最小单位；三份余数并列，给码点序最小的 terrain_a。
  const even = mixShares(new Map([['terrain_a', 1n], ['terrain_b', 1n], ['terrain_c', 1n]]));
  assert.deepEqual([...even], [['terrain_a', 3334n], ['terrain_b', 3333n], ['terrain_c', 3333n]]);
  assert.equal([...even.values()].reduce((s, v) => s + v, 0n), 10000n);
  // 2 : 1：2×10000÷3 = 6666 余 2，1×10000÷3 = 3333 余 1；余下 1 个最小单位给余数大的 x。
  const uneven = mixShares(new Map([['x', 2n], ['y', 1n]]));
  assert.deepEqual([...uneven], [['x', 6667n], ['y', 3333n]]);
  assert.equal([...uneven.values()].reduce((s, v) => s + v, 0n), 10000n);
});

// ---------- §4.10 规则 5：坡度项 ----------

test('卷五 §4.10 规则 5：坡度项按分段线性曲线插值，出域取端点', () => {
  // points：坡度 0、0.1、1 分别对应 1.0、2.0、3.0（定点 y 10000、20000、30000）。
  const points = [[0n, 10000n], [1000n, 20000n], [10000n, 30000n]];
  // 高差 10 m ÷ 步长 100 m = 0.1，定点 1000，恰在点上得 20000。
  assert.equal(slopeTerm(points, fixedUnits(10), lens.orth), 20000n);
  // 高差 15 m：定点 1500，2.0 + 1.0×(1500−1000)÷(10000−1000) = 2.0555… → 20000 + 5000000÷9000 截断 555 = 20555。
  assert.equal(slopeTerm(points, fixedUnits(15), lens.orth), 20555n);
  // 高差 0 落在首点，得 10000。
  assert.equal(slopeTerm(points, fixedUnits(0), lens.orth), 10000n);
  // 高差 1000 m：定点 100000 越过末点 10000，取端点 30000。
  assert.equal(slopeTerm(points, fixedUnits(1000), lens.orth), 30000n);
});

// ---------- 路段派生量（§4.1 规则 4 派生量、§4.10 规则 1、5） ----------

const SLOPE_POINTS = [[0n, 10000n], [1000n, 20000n], [10000n, 30000n]];

test('卷五 §4.10 规则 1、5：陆路路段 distance、ascent、mix、speed', () => {
  // 4 格同一行，三步都是正交 1000000。高度 0、10、25、25 m：
  //   步 1 高差 10 m → 坡度项 20000；步 2 高差 15 m → 20555；步 3 高差 0 → 10000。
  // 步进代价 = 步长 × roadPace(0.8) × 坡度项 ÷ 10⁸：1600000、1644400、800000，合计 4044400。
  // distance = 3000000；ascent = 10 + 15 + 0 = 25 m = 250000。
  // speed = 3000000 × 10000 ÷ 4044400 = 7417.66… 向零截断 7417。
  // mix：终点格地形 terrain_a（步 1，权重 1000000）、terrain_b（步 2、3，权重 2000000）：
  //   10000×1/3 = 3333 余 1、10000×2/3 = 6666 余 2；余 1 个最小单位给余数大的 terrain_b。
  const A = [
    { h: fixedUnits(0), terrain: 'terrain_a', water: false },
    { h: fixedUnits(10), terrain: 'terrain_a', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
  ];
  const env = { box: box(4, 1), lens, attrs: (k) => A[k], slopePoints: SLOPE_POINTS, roadPace: fixedUnits(0.8) };
  const r = pathMetrics(env, [0, 1, 2, 3], false);
  assert.equal(r.distance, 3000000n);
  assert.equal(r.ascent, 250000n);
  assert.equal(r.speed, 7417n);
  assert.deepEqual([...r.mix], [['terrain_a', 3333n], ['terrain_b', 6667n]]);
});

test('卷五 §4.10 规则 1：水路路段坡度项按 1 计，speed 由航速折出', () => {
  // 同上数据，waterway=true：每步坡度项 10000（1.0），步进代价各 800000，合计 2400000。
  // speed = 3000000 × 10000 ÷ 2400000 = 12500；ascent 与 distance 不变。
  const A = [
    { h: fixedUnits(0), terrain: 'terrain_a', water: false },
    { h: fixedUnits(10), terrain: 'terrain_a', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
  ];
  const env = { box: box(4, 1), lens, attrs: (k) => A[k], slopePoints: SLOPE_POINTS, roadPace: fixedUnits(0.8) };
  const r = pathMetrics(env, [0, 1, 2, 3], true);
  assert.equal(r.distance, 3000000n);
  assert.equal(r.ascent, 250000n);
  assert.equal(r.speed, 12500n);
});

test('卷五 §4.10 规则 1：缺地表高、缺地形、水体格的特殊值按规则处理', () => {
  const base = () => [
    { h: fixedUnits(0), terrain: 'terrain_a', water: false },
    { h: fixedUnits(10), terrain: 'terrain_a', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
    { h: fixedUnits(25), terrain: 'terrain_b', water: false },
  ];
  const envOf = (A) => ({ box: box(4, 1), lens, attrs: (k) => A[k], slopePoints: SLOPE_POINTS, roadPace: fixedUnits(0.8) });
  // 一格缺地表高：ascent 为 null；陆路 speed 为 null（水路 speed 不看高度，仍是 12500）。
  const noHeight = base();
  noHeight[2] = { ...noHeight[2], h: null };
  const landH = pathMetrics(envOf(noHeight), [0, 1, 2, 3], false);
  assert.equal(landH.ascent, null);
  assert.equal(landH.speed, null);
  assert.equal(pathMetrics(envOf(noHeight), [0, 1, 2, 3], true).speed, 12500n);
  // 一格没有地形：mix 为 null。
  const noTerrain = base();
  noTerrain[3] = { ...noTerrain[3], terrain: null };
  assert.equal(pathMetrics(envOf(noTerrain), [0, 1, 2, 3], false).mix, null);
  // 终点格是水体：陆路该步坡度项按 1 计，步进代价 1600000 + 800000 + 800000 = 3200000，speed = 30000000000 ÷ 3200000 = 9375。
  const water = base();
  water[2] = { ...water[2], water: true };
  const landW = pathMetrics(envOf(water), [0, 1, 2, 3], false);
  assert.equal(landW.ascent, 250000n);
  assert.equal(landW.speed, 9375n);
});

test('卷五 §4.10 规则 1、5：斜向一步的步长与步进代价', () => {
  // (0,0)→(1,1) 一步斜向：distance = 1414213。
  // 步进代价 = 1414213 × 8000 × 10000 ÷ 10⁸ = 1131370（向零截断）；
  // speed = 1414213 × 10000 ÷ 1131370 = 12500.004… → 12500。
  const env = {
    box: box(4, 2),
    lens,
    attrs: () => ({ h: fixedUnits(0), terrain: 'terrain_a', water: false }),
    slopePoints: SLOPE_POINTS,
    roadPace: fixedUnits(0.8),
  };
  const r = pathMetrics(env, [0, 5], false);
  assert.equal(r.distance, 1414213n);
  assert.equal(r.speed, 12500n);
});
