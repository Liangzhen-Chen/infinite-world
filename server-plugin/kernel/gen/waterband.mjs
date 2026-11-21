// 河道窄带的几何（卷十 R10-2.17 流水条，封卷后勘误 1121k16 修改轮 M1–M3）：中心线、带的取法、半宽 r 的搜索。纯函数，整数区格，不抽取、不读状态；
// 区格是否在父足迹内、是否被别行占用由调用方交入判定函数（占用者：作者 boundary 覆盖的格、同父兄弟种子格、本阶段先处理的水体行已取的种子格与已写的窄带格）。
// 所有出错都是 E-GEN-WATER-FOOTPRINT，事由代号随码返回（fields.reason）：cross_parent（跨父：下游目标一格都不在父足迹内，或中心线出父足迹）、occupied（压在他行占用的格上）。
// 次序全由 (x, y) 字典序与下标定，与遍历容器顺序无关。

import { KernelError } from '../errors.mjs';

const REASON = Object.freeze({ crossParent: 'cross_parent', occupied: 'occupied' });
const keyOf = (c) => `${c.x},${c.y}`;
const manhattan = (a, b) => (a.x > b.x ? a.x - b.x : b.x - a.x) + (a.y > b.y ? a.y - b.y : b.y - a.y);
const cellLess = (a, b) => a.x < b.x || (a.x === b.x && a.y < b.y);
const NEIGHBORS = Object.freeze([[1, 0], [-1, 0], [0, 1], [0, -1]]);

const fail = (reason, why) => new KernelError('E-GEN-WATER-FOOTPRINT', { reason }, why);

/**
 * 中心线：自本行种子区格 s 到下游行足迹的曼哈顿折线，止于与下游目标格集四邻相接的一格（不含目标格）。
 * 取目标格集 T 中父足迹内、离 s 曼哈顿距离最近的一格 g（并列取 (x, y) 字典序最小）；每步取到 g 的剩余距离（x、y 两分量的绝对值）较大的轴前进一格（并列取 x 轴）；
 * s 本身已与 T 四邻相接则只有 s 一格；没有下游（target 空）则只有 s。
 * @param {{x: number, y: number}} seed @param {Array<{x: number, y: number}>} target 下游目标格集 T_D（空表示没有下游）
 * @param {{inParent: (x: number, y: number) => boolean, occupied: (x: number, y: number) => boolean}} ctx
 * @returns {Array<{x: number, y: number}>} 自 s 起的中心线格
 */
export function centerLine(seed, target, ctx) {
  const check = (c) => {
    if (!ctx.inParent(c.x, c.y)) throw fail(REASON.crossParent, `center line cell (${c.x},${c.y}) is outside the parent footprint`);
    if (ctx.occupied(c.x, c.y)) throw fail(REASON.occupied, `center line cell (${c.x},${c.y}) is occupied by another row`);
  };
  check(seed);
  if (target.length === 0) return [seed];
  const inT = new Set(target.map(keyOf));
  if (inT.has(keyOf(seed))) throw fail(REASON.occupied, `seed cell (${seed.x},${seed.y}) lies in the downstream footprint`);
  const touches = (c) => NEIGHBORS.some(([dx, dy]) => inT.has(`${c.x + dx},${c.y + dy}`));
  let g = null;
  for (const t of target) {
    if (!ctx.inParent(t.x, t.y)) continue;
    if (g === null || manhattan(seed, t) < manhattan(seed, g) || (manhattan(seed, t) === manhattan(seed, g) && cellLess(t, g))) g = t;
  }
  if (g === null) throw fail(REASON.crossParent, 'no cell of the downstream footprint lies inside the parent footprint');
  const line = [seed];
  let c = seed;
  while (!touches(c)) {
    const dx = g.x - c.x;
    const dy = g.y - c.y;
    const adx = dx < 0 ? -dx : dx;
    const ady = dy < 0 ? -dy : dy;
    c = adx >= ady ? { x: c.x + (dx > 0 ? 1 : -1), y: c.y } : { x: c.x, y: c.y + (dy > 0 ? 1 : -1) };
    check(c);
    line.push(c);
  }
  return line;
}

/**
 * 半宽 r 的窄带：对父足迹内、到中心线曼哈顿距离不超过 r 的候选格，按（最近中心线格的下标（并列取小）、到该格的距离、(x, y) 字典序）排成表；
 * 中心线格全部入带，其余候选格依表序逐个判：不被占用者占着、且与已入带的某一格四邻相接者入带，否则不入。表序即流向序（前缀连通）。
 * @param {Array<{x: number, y: number}>} line 中心线 @param {number} r @param {{inParent: (x: number, y: number) => boolean, occupied: (x: number, y: number) => boolean}} ctx
 * @returns {Array<{x: number, y: number}>}
 */
export function bandCells(line, r, ctx) {
  const best = new Map(); // 格 → {index, d}
  line.forEach((c, i) => {
    for (let dx = -r; dx <= r; dx += 1) {
      const rest = r - (dx < 0 ? -dx : dx);
      for (let dy = -rest; dy <= rest; dy += 1) {
        const cell = { x: c.x + dx, y: c.y + dy };
        const d = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
        const k = keyOf(cell);
        const had = best.get(k);
        if (!had || d < had.d) best.set(k, { cell, index: i, d });
      }
    }
  });
  const isCenter = new Set(line.map(keyOf));
  const table = [...best.values()].filter((e) => isCenter.has(keyOf(e.cell)) || ctx.inParent(e.cell.x, e.cell.y));
  table.sort((a, b) => a.index - b.index || a.d - b.d || (cellLess(a.cell, b.cell) ? -1 : cellLess(b.cell, a.cell) ? 1 : 0));
  const taken = new Set();
  const out = [];
  for (const e of table) {
    const k = keyOf(e.cell);
    if (isCenter.has(k)) { taken.add(k); out.push(e.cell); continue; }
    if (ctx.occupied(e.cell.x, e.cell.y)) continue;
    if (NEIGHBORS.some(([dx, dy]) => taken.has(`${e.cell.x + dx},${e.cell.y + dy}`))) { taken.add(k); out.push(e.cell); }
  }
  return out;
}

/**
 * 半宽的取法：作者写了 targetAreaM2 的，取使窄带格数不超过 targetCells 的最大 r（从 r = 0 起逐级加一，到再加一级格数超过目标、或再加一级格数不再增长为止；
 * r = 0 已超出也取 0，作者的目标面积即宽度输入）；没写的取调用方交入的 halfWidth（抽得的整数，不搜索）。
 * 格数随 r 不减、父足迹有限，所以必终止，目标大于父足迹时也不会无上界。
 * @param {Array<{x: number, y: number}>} line
 * @param {{targetCells: number | null, halfWidth: number | null}} width
 * @param {{inParent: (x: number, y: number) => boolean, occupied: (x: number, y: number) => boolean}} ctx
 * @returns {{r: number, cells: Array<{x: number, y: number}>}}
 */
export function chooseBand(line, width, ctx) {
  if (width.targetCells === null) return { r: width.halfWidth, cells: bandCells(line, width.halfWidth, ctx) };
  let r = 0;
  let cur = bandCells(line, 0, ctx);
  if (cur.length > width.targetCells) return { r, cells: cur };
  for (;;) {
    const next = bandCells(line, r + 1, ctx);
    if (next.length > width.targetCells || next.length === cur.length) break;
    r += 1;
    cur = next;
  }
  return { r, cells: cur };
}
