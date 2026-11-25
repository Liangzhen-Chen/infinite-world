// 河床（水底）高：卷五 §4.3 规则 8 "河床"（封卷后勘误 1121k17，李白 11-21 裁定"沿下游都不许上坡、河湖海一视同仁"；卷十 R10-2.18 ⑥）。纯函数，不存档，不读状态。
// 每个区域足迹水体行（挂 comp_waterbody，流水、静水、手写、生成一视同仁）的足迹各区格先有代表地表高 h₀(c)（规则 8 的控制面加起伏），再取河床高 bed(c)；
// 约束的量是 bed，不是水面（水面由 bed 派生，规则 10）。上游行 X 指 downstream 指向本行 D 的水体行；X 的出口值 out(X) = X 足迹各区格的 bed 与 X 全部上游的 out 之最小
// （都没有为 +∞；downstream 图无环，按上游先求值必终止、结果唯一）。
//   有表序的行（flowing 为真且 boundary 非空，表序 = 区格列表的次序）：X 在 D 上的汇入格 j(X) = D 的表序里到 X 足迹曼哈顿距离（区格）最小的格中表序最前的一格
//     （X 足迹没有区格时取 D 的首格）；e(c) = h₀(c) 与汇入格为 c 的各上游 X 的 out(X) 之最小；bed(c) = 表序在 c 之前（含 c）全部区格的 e 之最小。
//     所以上游的界只从汇入格起向下游传，汇入格以上的一段不受影响。
//   没有表序的行（静水的湖、海，以及 boundary 为空的流水行）：bed(c) = h₀(c) 与全部上游 X 的 out(X) 之最小。
// 不变量：处处 bed(c) ≤ h₀(c)，只降不抬；有表序的行沿表序 bed 不升。任何一个需要的 h₀ 未知（调用方交 null）即该行的 bed 未知，下游也未知，不借别的量顶替。
// 求值次序（卷十 R10-2.12 已定）：生成水体行的 downstream 链按未修正的 h₀ 派生；链定之后才调本文件求 bed，bed 不回头改链。
// 只比较与取小，不做算术，所以数值类型不限（定点 BigInt 或普通数），+∞ 用 Infinity。

import { KernelError } from './errors.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * @param {{
 *   upstreamsOf: (id: string) => string[],
 *   infoOf: (id: string) => {ordered: boolean, cells: {xs: ArrayLike<number>, ys: ArrayLike<number>}, h0: ArrayLike<any> | null}
 * }} src
 *   upstreamsOf(id)：downstream 指向 id 的水体行 id；infoOf(id)：本行足迹区格的序号列（xs、ys 两列，有表序的行按表序给；列式存放，全规模的海不建逐格对象）
 *   与各区格的 h₀（与 cells 同序；未知给 null）
 * @returns {{bedOf: (id: string) => ArrayLike<any> | null, outOf: (id: string) => any | null}}
 *   bedOf：与 cells 同序的河床高，未知为 null；outOf：出口值，没有（+∞）为 Infinity，未知为 null
 */
export function createWaterBeds(src) {
  const beds = new Map();
  const outs = new Map();
  const visiting = new Set();

  // X 的区格排成升序的打包键（(x−x0)×跨度 + (y−y0)，不超过 2⁵³），供二分查"某格在不在 X 里"；不建 Map（海可能有上千万格）。
  function packedOf(xCells) {
    const n = xCells.xs.length;
    let x0 = xCells.xs[0];
    let y0 = xCells.ys[0];
    let y1 = y0;
    for (let j = 1; j < n; j += 1) {
      if (xCells.xs[j] < x0) x0 = xCells.xs[j];
      if (xCells.ys[j] < y0) y0 = xCells.ys[j];
      if (xCells.ys[j] > y1) y1 = xCells.ys[j];
    }
    const span = y1 - y0 + 1 + 1 + 1; // 范围 y1 − y0 + 1 格，两侧各留一格：邻格的 y 可比范围大 1
    const keys = new Float64Array(n);
    for (let j = 0; j < n; j += 1) keys[j] = (xCells.xs[j] - x0 + 1) * span + (xCells.ys[j] - y0 + 1);
    keys.sort();
    const has = (x, y) => {
      if (y < y0 - 1 || y > y1 + 1 || x < x0 - 1) return false;
      const k = (x - x0 + 1) * span + (y - y0 + 1);
      let lo = 0;
      let hi = n - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (keys[mid] === k) return true;
        if (keys[mid] < k) lo = mid + 1; else hi = mid - 1;
      }
      return false;
    };
    return has;
  }

  // 上游 X 在 D 上的汇入格下标：D 的格里到 X 足迹曼哈顿距离最小者中表序最前的一个。
  // 两块足迹互不相交，最小距离至少 1；只要 D 有一格与 X 四邻相接，最小距离就是 1、汇入格就是表序里第一个这样的格：
  // 先按 D 的表序逐格查四个邻格在不在 X 里（二分），代价 O(|D| log|X|)。生成的链与卷十 R10-2.17 补出的窄带按构造必然相接；
  // 只有一格都不相接（作者手画、不相接的 boundary）才退回下面逐格求距离的 O(|D|·|X|)，那是少见的作者数据情形。
  function junction(xCells, dCells) {
    if (xCells.xs.length === 0) return 0;
    const has = packedOf(xCells);
    for (let i = 0; i < dCells.xs.length; i += 1) {
      const x = dCells.xs[i];
      const y = dCells.ys[i];
      if (has(x + 1, y) || has(x - 1, y) || has(x, y + 1) || has(x, y - 1)) return i;
    }
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < dCells.xs.length; i += 1) {
      let d = Infinity;
      for (let j = 0; j < xCells.xs.length; j += 1) {
        const m = (xCells.xs[j] > dCells.xs[i] ? xCells.xs[j] - dCells.xs[i] : dCells.xs[i] - xCells.xs[j])
          + (xCells.ys[j] > dCells.ys[i] ? xCells.ys[j] - dCells.ys[i] : dCells.ys[i] - xCells.ys[j]);
        if (m < d) d = m;
      }
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function compute(id) {
    if (beds.has(id)) return;
    if (visiting.has(id)) throw new KernelError('E-DIM-CYCLE', {}, `water downstream graph has a cycle through ${id}`);
    visiting.add(id);
    const info = src.infoOf(id);
    const ups = [...src.upstreamsOf(id)].sort(cmp);
    let unknown = !info || info.h0 === null;
    const upOut = [];
    for (const x of ups) {
      const o = outOf(x);
      if (o === null) unknown = true;
      else upOut.push({ id: x, out: o });
    }
    visiting.delete(id);
    if (unknown) { beds.set(id, null); outs.set(id, null); return; }
    const h0 = info.h0;
    const n = info.cells.xs.length;
    const bed = typeof h0.slice === 'function' ? h0.slice() : Array.from(h0);
    if (info.ordered) {
      const e = typeof h0.slice === 'function' ? h0.slice() : Array.from(h0);
      for (const u of upOut) {
        const j = n === 0 ? -1 : junction(src.infoOf(u.id).cells, info.cells);
        if (j >= 0 && u.out < e[j]) e[j] = u.out;
      }
      let run = null;
      for (let i = 0; i < n; i += 1) {
        if (run === null || e[i] < run) run = e[i];
        bed[i] = run;
      }
    } else {
      let cap = Infinity;
      for (const u of upOut) if (u.out < cap) cap = u.out;
      for (let i = 0; i < n; i += 1) if (cap < bed[i]) bed[i] = cap;
    }
    let out = Infinity;
    for (let i = 0; i < n; i += 1) if (bed[i] < out) out = bed[i];
    for (const u of upOut) if (u.out < out) out = u.out;
    beds.set(id, bed);
    outs.set(id, out);
  }

  function outOf(id) { compute(id); return outs.get(id); }
  return { bedOf: (id) => { compute(id); return beds.get(id); }, outOf };
}
