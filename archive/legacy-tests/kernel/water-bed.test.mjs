// createWaterBeds 测试：卷五 §4.3 规则 8 "河床"（docs/统一底层设计/卷五-地点地形与资源场.md :661–:664；卷十 A10-2.4 ② :471）。
// 处处 bed(c) ≤ h0(c)；有表序的行沿表序 bed 不升；上游的界只从汇入格起向下游传；任一需要的 h0 未知则该行及其下游的 bed 都未知（null），不借别的量顶替。
// 期望值按卷文公式手算后写字面量，不抄仓库当前读数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWaterBeds } from '../../server-plugin/kernel/water-bed.mjs';

// 给一张 {行id: {downstream, ordered, xs, ys, h0}} 的表，算出 upstreamsOf 与 infoOf 再调被测函数。
// downstream 指向本行 D 的行即 D 的上游。
function makeBeds(table) {
  const ids = Object.keys(table);
  const upstreams = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    const down = table[id].downstream;
    if (down != null) upstreams.get(down).push(id);
  }
  const upstreamsOf = (id) => upstreams.get(id);
  const infoOf = (id) => {
    const row = table[id];
    return { ordered: row.ordered, cells: { xs: row.xs, ys: row.ys }, h0: row.h0 };
  };
  return createWaterBeds({ upstreamsOf, infoOf });
}

// 1. 单条有表序的河：bed 沿表序取前缀最小；outOf 为各区格 bed 的最小。
test('用例1：单条有表序的河 R，bed 沿表序不升，outOf 取最小', () => {
  const beds = makeBeds({
    R: { ordered: true, xs: [0, 1, 2, 3], ys: [0, 0, 0, 0], h0: [10, 12, 9, 11] },
  });
  assert.deepEqual(beds.bedOf('R'), [10, 10, 9, 9]);
  assert.equal(beds.outOf('R'), 9);
});

// 2. 上游从首格汇入：上游 U 的出口值只压到 D 的汇入格（首格），之后照表序传递。
test('用例2：上游 U 汇入 D 首格', () => {
  const beds = makeBeds({
    U: { downstream: 'D', ordered: true, xs: [0], ys: [1], h0: [9] },
    D: { ordered: true, xs: [0, 1], ys: [0, 0], h0: [10, 8] },
  });
  assert.deepEqual(beds.bedOf('D'), [9, 8]);
  assert.deepEqual(beds.bedOf('U'), [9]);
  assert.equal(beds.outOf('U'), 9);
});

// 3. 河→湖→河：湖（无表序）由上游出口值封顶；下游河再从湖的汇入格起传界。
test('用例3：河→湖→河', () => {
  const beds = makeBeds({
    X: { downstream: 'W', ordered: true, xs: [0], ys: [0], h0: [9] },
    W: { downstream: 'E', ordered: false, xs: [1, 2], ys: [0, 0], h0: [8, 7] },
    E: { ordered: true, xs: [3, 4], ys: [0, 0], h0: [10, 8] },
  });
  assert.deepEqual(beds.bedOf('W'), [8, 7]);
  assert.equal(beds.outOf('W'), 7);
  assert.deepEqual(beds.bedOf('E'), [7, 7]);
});

// 4. 河进湖：湖各区格由上游出口值封顶（只降不抬）。
test('用例4：河进湖，湖 bed 由上游出口值封顶', () => {
  const beds = makeBeds({
    X: { downstream: 'W', ordered: true, xs: [0], ys: [0], h0: [5] },
    W: { ordered: false, xs: [1, 2], ys: [0, 0], h0: [9, 7] },
  });
  assert.deepEqual(beds.bedOf('W'), [5, 5]);
  assert.equal(beds.outOf('W'), 5);
});

// 5. 支流从干流中段汇入：汇入格之前的格不被上游修正。
test('用例5：支流从干流中段汇入', () => {
  const beds = makeBeds({
    D: { ordered: true, xs: [0, 1, 2, 3], ys: [0, 0, 0, 0], h0: [10, 8, 6, 4] },
    U: { downstream: 'D', ordered: true, xs: [2], ys: [1], h0: [5] },
  });
  assert.deepEqual(beds.bedOf('D'), [10, 8, 5, 4]);
});

// 6. 湖有两条上游：先压到全部上游出口值之最小。
test('用例6：湖有两条上游，压到二者出口值之最小', () => {
  const beds = makeBeds({
    W: { ordered: false, xs: [5, 6], ys: [5, 5], h0: [9, 3] },
    X1: { downstream: 'W', ordered: true, xs: [4], ys: [5], h0: [6] },
    X2: { downstream: 'W', ordered: true, xs: [7], ys: [5], h0: [4] },
  });
  assert.deepEqual(beds.bedOf('W'), [4, 3]);
  assert.equal(beds.outOf('W'), 3);
});

// 7. 未知向下传：上游 h0 未知则该行 bed 未知，下游也未知，不借别的量顶替。
test('用例7：h0 未知向下传', () => {
  const beds = makeBeds({
    U: { downstream: 'D', ordered: true, xs: [0], ys: [1], h0: null },
    D: { ordered: true, xs: [0, 1], ys: [0, 0], h0: [10, 8] },
  });
  assert.equal(beds.bedOf('U'), null);
  assert.equal(beds.outOf('U'), null);
  assert.equal(beds.bedOf('D'), null);
  assert.equal(beds.outOf('D'), null);
});

// 8. 没有上游的湖：bed 等于 h0，且返回值是副本，改返回数组不影响传入的 h0。
test('用例8：无上游的湖，bed 为 h0 副本', () => {
  const h0 = [7, 3];
  const beds = makeBeds({
    W: { ordered: false, xs: [0, 1], ys: [0, 0], h0 },
  });
  const bed = beds.bedOf('W');
  assert.deepEqual(bed, [7, 3]);
  bed[0] = 999;
  assert.deepEqual(h0, [7, 3]);
});

// 9. 上游有多格：汇入格取到上游足迹曼哈顿距离最小者中表序最前的一格。
test('用例9：上游有多格，汇入格取距离最小的最前一格', () => {
  const beds = makeBeds({
    X: { downstream: 'D', ordered: true, xs: [0, 1], ys: [1, 1], h0: [5, 7] },
    D: { ordered: true, xs: [0, 1, 2], ys: [0, 0, 0], h0: [10, 9, 8] },
  });
  assert.deepEqual(beds.bedOf('X'), [5, 5]);
  assert.equal(beds.outOf('X'), 5);
  assert.deepEqual(beds.bedOf('D'), [5, 5, 5]);
});

// 10. 上游没有区格：下游汇入格取首格；空行的 outOf 为 +∞，不压任何格。
test('用例10：上游没有区格，outOf 为 Infinity', () => {
  const beds = makeBeds({
    X: { downstream: 'D', ordered: true, xs: [], ys: [], h0: [] },
    D: { ordered: true, xs: [0, 1], ys: [0, 0], h0: [10, 8] },
  });
  assert.equal(beds.outOf('X'), Infinity);
  assert.deepEqual(beds.bedOf('D'), [10, 8]);
});

// 11. 成环：下游图有环报 E-DIM-CYCLE。
test('用例11：成环报 E-DIM-CYCLE', () => {
  const beds = makeBeds({
    A: { downstream: 'B', ordered: true, xs: [0], ys: [0], h0: [5] },
    B: { downstream: 'A', ordered: true, xs: [1], ys: [0], h0: [5] },
  });
  assert.throws(() => beds.bedOf('A'), (e) => e.code === 'E-DIM-CYCLE');
});

// 12. 数值类型不限：BigInt64Array 的 h0 与普通数同法求 bed，outOf 保持 BigInt。
test('用例12：BigInt64Array 的 h0 得到同值 BigInt bed', () => {
  const beds = makeBeds({
    R: { ordered: true, xs: [0, 1, 2, 3], ys: [0, 0, 0, 0], h0: BigInt64Array.from([10n, 12n, 9n, 11n]) },
  });
  assert.deepEqual(Array.from(beds.bedOf('R')), [10n, 10n, 9n, 9n]);
  assert.equal(beds.outOf('R'), 9n);
});

// 13. 性质：每格 bed ≤ h0；有表序的行沿表序 bed 不升（用例 5 的 D）。
test('用例13：bed ≤ h0 且沿表序不升', () => {
  const h0 = [10, 8, 6, 4];
  const beds = makeBeds({
    D: { ordered: true, xs: [0, 1, 2, 3], ys: [0, 0, 0, 0], h0 },
    U: { downstream: 'D', ordered: true, xs: [2], ys: [1], h0: [5] },
  });
  const bed = beds.bedOf('D');
  for (let i = 0; i < bed.length; i += 1) assert.ok(bed[i] <= h0[i]);
  for (let i = 1; i < bed.length; i += 1) assert.ok(bed[i] <= bed[i - 1]);
});

// 修改轮 M2：汇入格先查四邻相接（O(|D| log|X|)），不相接才退回逐格求距离；两条路与暴力解逐格相同。
const bruteJunction = (x, d) => {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < d.xs.length; i += 1) {
    let m = Infinity;
    for (let j = 0; j < x.xs.length; j += 1) m = Math.min(m, Math.abs(x.xs[j] - d.xs[i]) + Math.abs(x.ys[j] - d.ys[i]));
    if (m < bestD) { bestD = m; best = i; }
  }
  return best;
};

test('用例14：大 X（200×200 的湖）汇入长 D（300 格，表序自西向东贴着湖北缘）：汇入格与暴力解相同，D 的 bed 自汇入格起降到出口值', () => {
  const lx = [];
  const ly = [];
  for (let x = 0; x < 200; x += 1) for (let y = 0; y < 200; y += 1) { lx.push(x); ly.push(y); }
  const dx = Array.from({ length: 300 }, (_, i) => i - 50);
  const dy = dx.map(() => -1);
  const J = bruteJunction({ xs: lx, ys: ly }, { xs: dx, ys: dy });
  assert.equal(J, 50, '暴力解：表序第 50 格 (0,-1) 起贴着湖');
  const beds = makeBeds({
    X: { downstream: 'D', ordered: false, xs: lx, ys: ly, h0: lx.map(() => 5) },
    D: { ordered: true, xs: dx, ys: dy, h0: dx.map(() => 100) },
  });
  const bed = beds.bedOf('D');
  assert.deepEqual(bed.slice(0, J), dx.slice(0, J).map(() => 100));
  assert.deepEqual(bed.slice(J), dx.slice(J).map(() => 5));
});

test('用例15：一格都不相接（作者手画）退回逐格求距离：汇入格是到 X 距离最小者中表序最前的一格，与暴力解相同', () => {
  const dx = [0, 1, 2, 3, 4, 5];
  const dy = dx.map(() => 0);
  const X = { xs: [3, 4], ys: [5, 5] }; // 距 D 的 (3,0)、(4,0) 都是 5，表序最前取 (3,0)
  const J = bruteJunction(X, { xs: dx, ys: dy });
  assert.equal(J, 3);
  const beds = makeBeds({
    X: { downstream: 'D', ordered: true, xs: X.xs, ys: X.ys, h0: [2, 2] },
    D: { ordered: true, xs: dx, ys: dy, h0: [9, 9, 9, 9, 9, 9] },
  });
  assert.deepEqual(beds.bedOf('D'), [9, 9, 9, 2, 2, 2]);
});
