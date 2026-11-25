// 格子迁移 G9《挤出落点与差分读口的纯函数核》：只测两个纯函数，不推进世界、不读写状态、不进引擎。
// 卷文依据：卷五 :762（挤出：landSearchRadiusCells 内最近〔直线距离〕的可立足格，并列取格序号字典序最小；找不到即被埋）、
// 卷五 :503（差分存 cells.<w>.<里块>.<格键>，每格一条 {material, fixture, mark, sinceMinute}）、grid-diff-read.mjs 文件头（全空记录读作没有差分）。
// 期望值全部按卷文公式手算成字面量（每处推算写在用例里）；不抄仓库此刻的基线读数。本机 F 盘可跑。
import test from 'node:test';
import assert from 'node:assert/strict';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { extrudeLanding, extrudeLayerReach } from '../../server-plugin/kernel/grid-base.mjs';
import { createDiffReader } from '../../server-plugin/kernel/grid-diff-read.mjs';

// 定点常数先装（差分读口经 handles/keys.mjs 的 gridChunkCells 读 SCALE；夹具值与 world/rules/tables/kernel-constants.json 同）。
installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });

// 挤出用的网格：一格 1 m、一层 3 m（卷五 :762 的 d² = (dx·cellM)² + (dy·cellM)² + (dz·storeyM)²）。
const GRID = { cellM: 1, storeyM: 3 };

// 可立足表：集合里有该格即 true，否则 false。
const standableIn = (set) => (x, y, z) => set.has(`${x},${y},${z}`);

// ---------- extrudeLanding（卷五 :762） ----------

test('extrudeLanding：半径 1 时竖向 floor(1×1÷3)=0 层，四邻 d²=1 并列取 x 最小的 (-1,0,0)', () => {
  // 候选：dz=0，dx、dy ∈ [-1,1]，d²=dx²+dy² ≤ 1²=1；from (0,0,0) 自己 d²=0 也在候选里（不可立足）。
  const at = (x, y, z) => !(x === 0 && y === 0 && z === 0);
  assert.deepEqual(extrudeLanding(GRID, 1, { x: 0, y: 0, z: 0 }, at), { kind: 'land', cell: { x: -1, y: 0, z: 0 } });
});

test('extrudeLanding：半径 1 四邻都不可立足即被埋（竖向一层 3 m 超范围）', () => {
  // 候选只有 (0,0,0) 与四邻（d² ≤ 1）；全部 false → buried，不是 unknown。
  assert.deepEqual(extrudeLanding(GRID, 1, { x: 0, y: 0, z: 0 }, () => false), { kind: 'buried' });
});

test('extrudeLanding：半径 2 取直线距离近的 (1,1,0)（d²=2）而不是 (2,0,0)（d²=4）', () => {
  // d²(1,1,0)=1²+1²=2；d²(2,0,0)=2²=4；其余全 false。升序先遇 2。
  const at = standableIn(new Set(['1,1,0', '2,0,0']));
  assert.deepEqual(extrudeLanding(GRID, 2, { x: 0, y: 0, z: 0 }, at), { kind: 'land', cell: { x: 1, y: 1, z: 0 } });
});

test('extrudeLanding：半径 3 竖向可达 floor(3÷3)=1 层，(0,0,±1) d²=9 并列取 z 小的 (0,0,-1)', () => {
  // dz=±1 时 (dz·storeyM)²=9，水平须为 0 才 ≤ 3²=9；两层 d² 并列 9，按 (x,y,z) 升序 z=-1 在前。
  const at = standableIn(new Set(['0,0,-1', '0,0,1']));
  assert.deepEqual(extrudeLanding(GRID, 3, { x: 0, y: 0, z: 0 }, at), { kind: 'land', cell: { x: 0, y: 0, z: -1 } });
});

test('extrudeLanding：半径 5 取 (2,2,0)（d²=8）而非 (0,0,1)（d²=9），是直线距离不是切比雪夫', () => {
  // d²(2,2,0)=4+4=8；d²(0,0,1)=9；其余全 false。
  const at = standableIn(new Set(['2,2,0', '0,0,1']));
  assert.deepEqual(extrudeLanding(GRID, 5, { x: 0, y: 0, z: 0 }, at), { kind: 'land', cell: { x: 2, y: 2, z: 0 } });
});

test('extrudeLanding：from 自己可立足时返回 from（d²=0 最小）', () => {
  assert.deepEqual(extrudeLanding(GRID, 1, { x: 0, y: 0, z: 0 }, () => true), { kind: 'land', cell: { x: 0, y: 0, z: 0 } });
});

test('extrudeLanding：升序里先遇到 null 即 unknown，不跳过它取更远的格', () => {
  // from 自己 false → 下一格 d²=1 里 (-1,0,0) 是 null → 落点无从判定，返回 unknown。
  const at = (x, y, z) => {
    if (x === 0 && y === 0 && z === 0) return false;
    if (x === -1 && y === 0 && z === 0) return null;
    return true;
  };
  assert.deepEqual(extrudeLanding(GRID, 1, { x: 0, y: 0, z: 0 }, at), { kind: 'unknown' });
});

test('extrudeLanding：更近的格已是 true 时，后面的 null 不影响结果', () => {
  // from 自己 true（d²=0 最先），(-1,0,0) 是 null 但排在 d²=1，不会再读到。
  const at = (x, y, z) => !(x === -1 && y === 0 && z === 0);
  assert.deepEqual(extrudeLanding(GRID, 1, { x: 0, y: 0, z: 0 }, at), { kind: 'land', cell: { x: 0, y: 0, z: 0 } });
});

test('extrudeLanding：结果与 standableAt 的读取次序无关，且调用次序的 d² 单调不降', () => {
  // 半径 2、只 (2,0,0) 可立足：升序为 d²=0 → 1×4 格 → 2×4 格 → 4 的四格里 (2,0,0) 最后一个 true。
  const table = new Set(['2,0,0']);
  const run = (seen) => extrudeLanding(GRID, 2, { x: 0, y: 0, z: 0 }, (x, y, z) => {
    seen.push([x, y, z]);
    return table.has(`${x},${y},${z}`);
  });
  const first = [];
  const second = [];
  const a = run(first);
  const b = run(second);
  assert.deepEqual(a, b);
  assert.deepEqual(a, { kind: 'land', cell: { x: 2, y: 0, z: 0 } });
  // d² 按候选构造的同一公式：(dx·1)² + (dy·1)² + (dz·3)²。
  const d2 = ([x, y, z]) => x * x + y * y + z * 3 * (z * 3);
  assert.deepEqual(first, second); // 两次读取次序逐格相同
  for (let i = 1; i < first.length; i += 1) assert.ok(d2(first[i]) >= d2(first[i - 1]), `第 ${i} 次读取 d² 回退`);
});

test('extrudeLanding：参数不合一律 E-DET-DOMAIN', () => {
  const from = { x: 0, y: 0, z: 0 };
  const isDomain = (e) => e.code === 'E-DET-DOMAIN';
  for (const radius of [0, -1, 1.5, NaN, undefined, '3']) {
    assert.throws(() => extrudeLanding(GRID, radius, from, () => true), isDomain, `radius=${String(radius)}`);
  }
  for (const grid of [{ cellM: 0, storeyM: 3 }, { cellM: 1, storeyM: 0 }, { cellM: 1, storeyM: 1.5 }]) {
    assert.throws(() => extrudeLanding(grid, 1, from, () => true), isDomain, JSON.stringify(grid));
  }
});

// ---------- extrudeLayerReach（卷五 :762 竖向层数） ----------

test('extrudeLayerReach：floor(半径 × cellM ÷ storeyM)', () => {
  // {cellM:1, storeyM:3}：1÷3=0、2÷3=0、3÷3=1、5÷3=1、6÷3=2。
  assert.equal(extrudeLayerReach({ cellM: 1, storeyM: 3 }, 1), 0);
  assert.equal(extrudeLayerReach({ cellM: 1, storeyM: 3 }, 2), 0);
  assert.equal(extrudeLayerReach({ cellM: 1, storeyM: 3 }, 3), 1);
  assert.equal(extrudeLayerReach({ cellM: 1, storeyM: 3 }, 5), 1);
  assert.equal(extrudeLayerReach({ cellM: 1, storeyM: 3 }, 6), 2);
  // {cellM:2, storeyM:3} 半径 2：2×2=4，4÷3 向下取整 1。
  assert.equal(extrudeLayerReach({ cellM: 2, storeyM: 3 }, 2), 1);
});

test('extrudeLayerReach：参数不合一律 E-DET-DOMAIN', () => {
  const isDomain = (e) => e.code === 'E-DET-DOMAIN';
  for (const radius of [0, -1, 1.5, NaN, undefined, '3']) {
    assert.throws(() => extrudeLayerReach(GRID, radius), isDomain, `radius=${String(radius)}`);
  }
  for (const grid of [{ cellM: 0, storeyM: 3 }, { cellM: 1, storeyM: 0 }, { cellM: 1, storeyM: 1.5 }]) {
    assert.throws(() => extrudeLayerReach(grid, 1), isDomain, JSON.stringify(grid));
  }
});

// ---------- createDiffReader（卷五 :503） ----------

// 里块边长 = chunkRegionCells × regionCellM ÷ cellM = 10 × 100 ÷ 1 = 1000 细格；
// 里块号 = floor(x÷1000)、floor(y÷1000)（向负无穷）：x=5/7/1000→0/0/1，x=-5→-1，y=6→0。
const DIFF_GRID = { cellM: 1, regionCellM: 100, chunkRegionCells: 10 };

// 状态自己造（只带 cells 差分）：
//   '0:0' 里块：'5:6:0'（material mat_a）、'5:6:3'（fixture item_x、material 空）、'7:7:1'（三项全空＝没有差分）
//   '1:0' 里块：'1000:6:2'（mark cellmark_m）
//   '-1:0' 里块：'-5:6:0'（material mat_b；x=-5 的里块是 -1）
const STATE = {
  cells: {
    0: {
      '0:0': {
        '5:6:0': { material: 'mat_a', sinceMinute: 120 },
        '5:6:3': { material: null, fixture: 'item_x', sinceMinute: 210 },
        '7:7:1': { material: null, fixture: null, mark: null },
      },
      '1:0': { '1000:6:2': { mark: 'cellmark_m', sinceMinute: 300 } },
      '-1:0': { '-5:6:0': { material: 'mat_b', sinceMinute: 400 } },
    },
  },
};

// 冻结副本的期望值：缺项补 null（material/fixture/mark），sinceMinute 原样带出。
const REC_A = { material: 'mat_a', fixture: null, mark: null, sinceMinute: 120 };
const REC_X = { material: null, fixture: 'item_x', mark: null, sinceMinute: 210 };
const REC_M = { material: null, fixture: null, mark: 'cellmark_m', sinceMinute: 300 };
const REC_B = { material: 'mat_b', fixture: null, mark: null, sinceMinute: 400 };

test('createDiffReader.cellAt：有效差分返回冻结记录，缺项补 null；全空与没记录都返回 null', () => {
  const reader = createDiffReader(STATE, DIFF_GRID);
  const a = reader.cellAt(0, 5, 6, 0);
  assert.deepEqual(a, REC_A);
  assert.ok(Object.isFrozen(a));
  assert.deepEqual(reader.cellAt(0, 5, 6, 3), REC_X);
  // 三项全空＝没有差分（文件头定），不是一份三项皆 null 的记录。
  assert.equal(reader.cellAt(0, 7, 7, 1), null);
  // 该列有别的层、但这一层没记录。
  assert.equal(reader.cellAt(0, 5, 6, 1), null);
  // x=-5 落在里块 -1，读口按格坐标重算里块，不靠调用方指路。
  assert.deepEqual(reader.cellAt(0, -5, 6, 0), REC_B);
});

test('createDiffReader.columnTop：该列有效差分的最高层号；全空列与空列是 null', () => {
  const reader = createDiffReader(STATE, DIFF_GRID);
  // (5,6) 有 z=0、z=3 两条有效差分 → 3。
  assert.equal(reader.columnTop(0, 5, 6), 3);
  // (7,7) 只有全空记录 → 该列没有有效差分 → null。
  assert.equal(reader.columnTop(0, 7, 7), null);
  // (1000,6) 在里块 '1:0'，z=2。
  assert.equal(reader.columnTop(0, 1000, 6), 2);
  // (9,9) 没有任何记录 → null。
  assert.equal(reader.columnTop(0, 9, 9), null);
});

test('createDiffReader.activeIn：闭区间内有效差分按 (x,y,z) 升序，跳过全空与范围外', () => {
  const reader = createDiffReader(STATE, DIFF_GRID);
  // x 0..1100 跨里块 0 与 1；y 0..10、z 0..10。全空 (7,7,1) 不算；里块 -1 的 (-5,6,0) 在 x 范围外。
  assert.deepEqual(reader.activeIn(0, { x0: 0, y0: 0, z0: 0, x1: 1100, y1: 10, z1: 10 }), [
    { x: 5, y: 6, z: 0, rec: REC_A },
    { x: 5, y: 6, z: 3, rec: REC_X },
    { x: 1000, y: 6, z: 2, rec: REC_M },
  ]);
  // z 收到 1..2：只剩 z=2 的 (1000,6,2)（z=0、z=3 都出界）。
  assert.deepEqual(reader.activeIn(0, { x0: 0, y0: 0, z0: 1, x1: 1100, y1: 10, z1: 2 }), [
    { x: 1000, y: 6, z: 2, rec: REC_M },
  ]);
  // x 收到 -10..10：跨里块 -1 与 0，(-5,6,0) 按 x 升序排最前；全空 (7,7,1) 仍不算；x=1000 出界。
  assert.deepEqual(reader.activeIn(0, { x0: -10, y0: 0, z0: 0, x1: 10, y1: 10, z1: 10 }), [
    { x: -5, y: 6, z: 0, rec: REC_B },
    { x: 5, y: 6, z: 0, rec: REC_A },
    { x: 5, y: 6, z: 3, rec: REC_X },
  ]);
});

test('createDiffReader：state 里没有 cells 键时 cellAt/columnTop 返回 null、activeIn 返回 []', () => {
  const reader = createDiffReader({}, DIFF_GRID);
  assert.equal(reader.cellAt(0, 5, 6, 0), null);
  assert.equal(reader.columnTop(0, 5, 6), null);
  assert.deepEqual(reader.activeIn(0, { x0: 0, y0: 0, z0: 0, x1: 1100, y1: 10, z1: 10 }), []);
});
