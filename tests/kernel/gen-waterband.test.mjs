// 卷十 R10-2.17 流水条（docs/统一底层设计/卷十-世界随机生成.md :437）、A10-2.4 ③ :471：
// 河道窄带的几何纯函数（kernel/gen/waterband.mjs 的 centerLine、bandCells、chooseBand）的行为测试。
// 期望值全部按卷文规则手算成字面量（推算过程见各用例注释），不读仓库此刻的计数；不推进世界，本机 F 盘跑。
// 用例前提：inParent 恒真、occupied 恒假，除非该用例另说。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerLine, bandCells, chooseBand } from '../../server-plugin/kernel/gen/waterband.mjs';

const at = (x, y) => ({ x, y });
const keyOf = (c) => `${c.x},${c.y}`;
const ctx = ({ inParent = () => true, occupied = () => false } = {}) => ({ inParent, occupied });
const isIn = (cells) => {
  const s = new Set(cells.map(keyOf));
  return (x, y) => s.has(`${x},${y}`);
};
const inBox = (x0, y0, x1, y1) => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
// 用例 1 的中心线：(2,2)→(5,2)，y=2 上连成四格。
const LINE = [at(2, 2), at(3, 2), at(4, 2), at(5, 2)];

test('中心线：自种子 s 沿到 g 剩余距离较大的轴前进，止于与 T 四邻相接处，不含 T 的格', () => {
  // g=(6,2)，曼哈顿距离 4：每步 x 分量较大，走 (3,2)、(4,2)、(5,2)，(5,2) 已与 (6,2) 四邻相接即止；(6,2) 被占用不影响（不在线上）。
  assert.deepEqual(centerLine(at(2, 2), [at(6, 2)], ctx({ occupied: isIn([at(6, 2)]) })), LINE);
});

test('窄带 r=1：表序＝流向序共 13 格（(6,2) 被占用不入）；r=0 的窄带即中心线', () => {
  const c = ctx({ occupied: isIn([at(6, 2)]) });
  // 表序：最近中心线格下标小者在前（下标 0 的三格按 (x,y) 字典序 (1,2)、(2,1)、(2,3)，其余类推）。
  assert.deepEqual(bandCells(LINE, 1, c), [
    at(2, 2), at(1, 2), at(2, 1), at(2, 3),
    at(3, 2), at(3, 1), at(3, 3),
    at(4, 2), at(4, 1), at(4, 3),
    at(5, 2), at(5, 1), at(5, 3),
  ]);
  assert.deepEqual(bandCells(LINE, 0, c), LINE);
});

for (const r of [1, 2]) {
  test(`窄带性质（r=${r}）：含全部中心线格、格到中心线距离不超过 r、表序前缀连通、无重复格`, () => {
    const band = bandCells(LINE, r, ctx());
    // 含全部中心线格。
    for (const l of LINE) assert.ok(band.some((c) => keyOf(c) === keyOf(l)), `缺中心线格 ${keyOf(l)}`);
    // 每格到中心线某格的曼哈顿距离不超过 r。
    for (const c of band) {
      assert.ok(LINE.some((l) => Math.abs(l.x - c.x) + Math.abs(l.y - c.y) <= r), `(${keyOf(c)}) 距中心线超过 ${r}`);
    }
    // 表序上除首格外每格都与排在它前面的某一格四邻相接。
    band.forEach((c, i) => {
      if (i === 0) return;
      assert.ok(band.slice(0, i).some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1), `(${keyOf(c)}) 与前缀不连通`);
    });
    // 没有重复格。
    const seen = new Set();
    for (const c of band) {
      assert.equal(seen.has(keyOf(c)), false, `重复格 ${keyOf(c)}`);
      seen.add(keyOf(c));
    }
  });
}

test('上游已有占用：中心线止于与下游窄带相接处（不报错），被占格不入带且前缀仍连通', () => {
  // 下游 D 的窄带 T 占去 (5,2) 及其四周；离 s=(2,2) 最近的 T 格是 (4,2)（距离 2），走到 (3,2) 即与 T 相接。
  const T = [at(5, 2), at(4, 2), at(6, 2), at(5, 1), at(5, 3)];
  const c = ctx({ occupied: isIn(T) });
  const line = centerLine(at(2, 2), T, c);
  assert.deepEqual(line, [at(2, 2), at(3, 2)]);
  // r=1：(4,2) 被占用不入，余下 7 格。
  assert.deepEqual(bandCells(line, 1, c), [at(2, 2), at(1, 2), at(2, 1), at(2, 3), at(3, 2), at(3, 1), at(3, 3)]);
});

test('s 本身已与 T 四邻相接则只有 s；T 为空则只有 s', () => {
  assert.deepEqual(centerLine(at(5, 2), [at(6, 2)], ctx()), [at(5, 2)]);
  assert.deepEqual(centerLine(at(2, 2), [], ctx()), [at(2, 2)]);
});

const reasonOf = (fn) => {
  try {
    fn();
  } catch (e) {
    assert.equal(e.code, 'E-GEN-WATER-FOOTPRINT');
    return e.fields.reason;
  }
  assert.fail('应当抛出 E-GEN-WATER-FOOTPRINT');
};

test('报错：跨父（T 无一格在父足迹内／中心线出父足迹）与占用，事由代号在 e.fields.reason', () => {
  // a. T 没有一格在父足迹内（x≥5 不在父足迹）。
  assert.equal(reasonOf(() => centerLine(at(2, 2), [at(8, 2)], ctx({ inParent: (x) => x < 5 }))), 'cross_parent');
  // b. 走到 (4,2) 时出父足迹。
  assert.equal(reasonOf(() => centerLine(at(2, 2), [at(6, 2)], ctx({ inParent: (x, y) => !(x === 4 && y === 2) }))), 'cross_parent');
  // c. 走到 (4,2) 时被别行占用。
  assert.equal(reasonOf(() => centerLine(at(2, 2), [at(6, 2)], ctx({ occupied: isIn([at(4, 2)]) }))), 'occupied');
  // d. 种子本身在 T 里。
  assert.equal(reasonOf(() => centerLine(at(6, 2), [at(6, 2)], ctx())), 'occupied');
  // e. 种子在父足迹外。
  assert.equal(reasonOf(() => centerLine(at(2, 2), [at(6, 2)], ctx({ inParent: (x, y) => !(x === 2 && y === 2) }))), 'cross_parent');
});

test('半宽的取法：无目标格数取给定半宽；有目标格数取不超过目标的最大 r（r=0 已超出也取 0，再加一级不增长即停）', () => {
  const c = ctx();
  // 未被占用时 r=0、1、2 的格数：4、(6+4+4)=14、(8+6+6+4+4)=28。
  assert.equal(bandCells(LINE, 0, c).length, 4);
  assert.equal(bandCells(LINE, 1, c).length, 14);
  assert.equal(bandCells(LINE, 2, c).length, 28);

  const a = chooseBand(LINE, { targetCells: 20, halfWidth: null }, c);
  assert.equal(a.r, 1);
  assert.equal(a.cells.length, 14);

  const b14 = chooseBand(LINE, { targetCells: 14, halfWidth: null }, c);
  assert.equal(b14.r, 1);
  const b3 = chooseBand(LINE, { targetCells: 3, halfWidth: null }, c);
  assert.equal(b3.r, 0);
  assert.equal(b3.cells.length, 4);
  const b28 = chooseBand(LINE, { targetCells: 28, halfWidth: null }, c);
  assert.equal(b28.r, 2);
  assert.equal(b28.cells.length, 28);

  const given = chooseBand(LINE, { targetCells: null, halfWidth: 1 }, c);
  assert.equal(given.r, 1);
  assert.deepEqual(given.cells, a.cells);

  // 目标大于父足迹（父足迹限 x、y∈[0,9] 共 100 格）：r 不为 0，格数不超过 100，再加一级不再增长（函数在这里停下）。
  const box = ctx({ inParent: inBox(0, 0, 9, 9) });
  const over = chooseBand(LINE, { targetCells: 1000, halfWidth: null }, box);
  assert.notEqual(over.r, 0);
  assert.ok(over.cells.length <= 100);
  assert.equal(bandCells(LINE, over.r + 1, box).length, over.cells.length);
});

test('确定性：同一输入调两次结果逐项相等', () => {
  const c = ctx({ occupied: isIn([at(6, 2)]) });
  assert.deepEqual(centerLine(at(2, 2), [at(6, 2)], c), centerLine(at(2, 2), [at(6, 2)], c));
  assert.deepEqual(bandCells(LINE, 2, c), bandCells(LINE, 2, c));
  assert.deepEqual(
    chooseBand(LINE, { targetCells: 20, halfWidth: null }, c),
    chooseBand(LINE, { targetCells: 20, halfWidth: null }, c),
  );
});
