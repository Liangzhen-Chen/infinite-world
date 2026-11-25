// 区格寻路核心（格子迁移 G4；卷五 §4.1 规则 4 栅格化、规则 5 位置到位置的区格寻路、§4.10 规则 1、5 步进系数与路况）。
// 纯函数：不读状态、不读引擎；格的属性（地表高、地形步进系数、是否水体可航）由调用方（route-edges.mjs）经 attrs(k) 交入，
// 本文件只做图搜索与路段派生量。全程整数（区格下标整数、代价为定点 BigInt 的单步值累加成安全整数 Number），不调 Math.*（S5-10），
// 几何只经 det-math 的定点开方 fixedSqrtInt（步长全书同一个数）；常数只来自规则表 rules.grid，本文件不写 0、1、-1 以外的数字字面量。
//
// 寻路（规则 5）：八邻，一步代价 = 步长 × 终点区格步进系数 × 坡度项（定点，一次整除截断，下限由 lower 给出）；
// 并列取法固定："代价最小，并列取步数少的，再并列取区格序号 (x, y) 序列字典序小的"。实现用带启发的搜索加速（规则 5 末句：
// 返回的必须是这张图上的代价最小路径，与不加速的逐格寻路逐位相同）：
//  ① 一致且可采纳的启发 = 八邻格距 × 每步代价下界（lower，调用方保证不大于任一真实一步代价）求出最小代价 C*；
//  ② 展开所有 f ≤ C* 的节点（令每个节点的 g 精确），在"代价紧"的弧上先算最少步数，再从起点按区格序号字典序贪心取下一格；
//  这样并列取法精确，与遍历顺序、堆内次序无关。展开上限 cap 以展开的节点数计，超过即返回空（规则 5 末句：上限内找不到返回空）。
// 规模：搜索只在 Map 里存被触及的区格（g、最少步数），触及数不超过展开数的八邻（cap 百万级时百万级条目，远低于 V8 单个 Map 上限约 1,677 万）；
// 不把全世界约 4,020 万区格装进任何 Map/Set（路网区格集与高度缓存在 route-edges.mjs 按格空间分片）。

import { fixedUnits, fixedSqrtInt, fixedCurveAt, fixedScale, fixedDivide } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { NEIGHBORS_8 } from './grid-geom.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const absDiff = (a, b) => (a > b ? a - b : b - a);
const NOT_FOUND = Object.freeze({ cells: null, cost: null });

/**
 * 区格一步的步长（卷五 §4.1 规则 4：正交 = regionCellM，斜向 = fixedSqrtInt(2 × regionCellM²)，全书同一个数）。定点 BigInt。
 * @param {{regionCellM: number}} grid rules.grid @returns {{orth: bigint, diag: bigint}}
 */
export function stepLengths(grid) {
  const orth = fixedUnits(grid.regionCellM);
  return Object.freeze({ orth, diag: fixedSqrtInt(orth * orth + orth * orth) });
}

// 一步的步长：两格同时变 x 与 y 即斜向。
const lenOf = (lens, dx, dy) => (dx !== 0 && dy !== 0 ? lens.diag : lens.orth);

/**
 * 坡度项（卷五 §4.10 规则 5）：lookup(slopeCurve, 一步地表高差绝对值 ÷ 步长)。points 是定点点列 [[x, y]…]（x 严格递增）。
 * @param {[bigint, bigint][]} points @param {bigint} dh 高差绝对值（定点米） @param {bigint} len 步长（定点米） @returns {bigint}
 */
export function slopeTerm(points, dh, len) {
  return fixedCurveAt(points, fixedDivide(dh, len));
}

// 二叉最小堆：键 f（安全整数），值 k（区格下标）；只按 f 比，f 相同次序不影响结果（见文件头 ②）。
class MinHeap {
  constructor() { this.f = []; this.k = []; }
  get size() { return this.f.length; }
  peek() { return this.f[0]; }
  push(f, k) {
    const F = this.f;
    const K = this.k;
    let i = F.length;
    F.push(f);
    K.push(k);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (F[p] <= f) break;
      F[i] = F[p];
      K[i] = K[p];
      i = p;
    }
    F[i] = f;
    K[i] = k;
  }
  pop() {
    const F = this.f;
    const K = this.k;
    const top = K[0];
    const lf = F.pop();
    const lk = K.pop();
    const n = F.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        const l = i + i + 1;
        if (l >= n) break;
        const r = l + 1;
        const m = r < n && F[r] < F[l] ? r : l;
        if (F[m] >= lf) break;
        F[i] = F[m];
        K[i] = K[m];
        i = m;
      }
      F[i] = lf;
      K[i] = lk;
    }
    return top;
  }
}

/**
 * 区格寻路：从区格下标 src 到 dst，代价最小，并列依次取步数少的、区格序号 (x, y) 序列字典序小的（卷五 §4.1 规则 4、5）。
 * env：{box: {x0, y0, cellsX, cellsY}（区格序号）, lens: stepLengths 的结果, stepCost(u, v, len) → 定点 BigInt（> 0）| null（这一步不可走）,
 *       lower: {orth: number, diag: number}（每步代价下界，定点单位的安全整数，不大于 stepCost 的任一返回值）}。
 * stepCost 返回不大于 0 的值即数据越过取值域（paceFactor 与 slopeCurve 严格大于 0，卷五 §4.10.1），抛 E-DIM-DOMAIN-RANGE，不放过。
 * cap 是展开节点数上限（rules.grid.longCostCap）；超过返回 {cells: null, capped: true}。
 * 返回 {cells: 区格下标串（含两端）| null, cost: 定点代价（安全整数）| null, expanded: 展开节点数, capped: boolean}。
 * @param {any} env @param {number} src @param {number} dst @param {number} cap
 */
export function regionPath(env, src, dst, cap) {
  if (src === dst) return { cells: [src], cost: 0, expanded: 0, capped: false };
  const { box, lens, lower } = env;
  const w = box.cellsX;
  const xs = (k) => box.x0 + (k % w);
  const ys = (k) => box.y0 + (k - (k % w)) / w;
  const tx = xs(dst);
  const ty = ys(dst);
  const heur = (k) => {
    const dx = tx > xs(k) ? tx - xs(k) : xs(k) - tx;
    const dy = ty > ys(k) ? ty - ys(k) : ys(k) - ty;
    const lo = dx < dy ? dx : dy;
    return lo * lower.diag + (dx + dy - lo - lo) * lower.orth;
  };
  // 触及的邻居：区格下标与步长（越出外包框的略去）。
  const each = (k, fn) => {
    const x = xs(k);
    const y = ys(k);
    for (const [mx, my] of NEIGHBORS_8) {
      const nx = x + mx;
      const ny = y + my;
      if (nx < box.x0 || nx >= box.x0 + w || ny < box.y0 || ny >= box.y0 + box.cellsY) continue;
      fn(k + my * w + mx, lenOf(lens, mx, my));
    }
  };
  const costOf = (u, v, len) => {
    const c = env.stepCost(u, v, len);
    if (c === null) return null;
    if (c <= 0n) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `region path step cost ${c} is not positive (paceFactor and slopeCurve must be > 0)`);
    return Number(c);
  };
  // ① 带启发搜索，展开全部 f ≤ C* 的节点。
  const g = new Map([[src, 0]]);
  const done = new Set();
  const order = [];
  const heap = new MinHeap();
  heap.push(heur(src), src);
  let best = null;
  while (heap.size > 0) {
    if (best !== null && heap.peek() > best) break;
    const u = heap.pop();
    if (done.has(u)) continue;
    done.add(u);
    if (done.size > cap) return { ...NOT_FOUND, expanded: done.size, capped: true };
    order.push(u);
    const gu = g.get(u);
    if (u === dst) best = gu;
    each(u, (v, len) => {
      if (done.has(v)) return;
      const c = costOf(u, v, len);
      if (c === null) return;
      const cand = gu + c;
      if (!g.has(v) || cand < g.get(v)) {
        g.set(v, cand);
        heap.push(cand + heur(v), v);
      }
    });
  }
  if (best === null) return { ...NOT_FOUND, expanded: done.size, capped: false };
  // ② 代价紧的弧：g(u) + c(u→v) = g(v)（u、v 都在展开集内）。
  const tight = (u, v, len) => {
    if (!done.has(v)) return false;
    const c = costOf(u, v, len);
    return c !== null && g.get(u) + c === g.get(v);
  };
  order.sort((a, b) => g.get(a) - g.get(b));
  const steps = new Map([[src, 0]]);
  for (const u of order) {
    if (!steps.has(u)) continue;
    const su = steps.get(u) + 1;
    each(u, (v, len) => { if (tight(u, v, len) && (!steps.has(v) || su < steps.get(v))) steps.set(v, su); });
  }
  // 在代价紧且步数也紧的弧上，从终点倒推出"在最优路上"的节点。
  const onBest = new Set([dst]);
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const v = order[i];
    if (!onBest.has(v)) continue;
    each(v, (u, len) => {
      if (!steps.has(u) || steps.get(u) + 1 !== steps.get(v)) return;
      if (tight(u, v, len)) onBest.add(u);
    });
  }
  // 从起点贪心取下一格：在最优路上、弧紧、步数紧的邻居里取区格序号 (x, y) 字典序最小者。
  const cells = [src];
  let cur = src;
  while (cur !== dst) {
    let next = null;
    each(cur, (v, len) => {
      if (!onBest.has(v) || steps.get(v) !== steps.get(cur) + 1 || !tight(cur, v, len)) return;
      if (next === null || xs(v) < xs(next) || (xs(v) === xs(next) && ys(v) < ys(next))) next = v;
    });
    cells.push(next);
    cur = next;
  }
  return { cells, cost: best, expanded: done.size, capped: false };
}

/**
 * 路段派生量（卷五 §4.1 规则 4 派生量、§4.10 规则 1、5）：cells 是路段的区格下标串（含两端，相邻两格八邻相接）。
 *  distance = 各步步长之和（定点米）；ascent = 相邻区格地表高差绝对值之和（任一格缺地表高为 null）；
 *  mix = 各终点区格地形按步长加权的份额（mixShares，各项之和为 1；任一终点区格没有地形为 null）；
 *  speed = distance ÷ Σ(步长 × 步进系数)：路段区格都是道路或航道，步进系数 = roadPace × 坡度项，水体格与水路段的坡度项按 1 计（§4.10 规则 1、5）；
 *  陆地步缺地表高则 speed 为 null。门边不经本函数（门边路程计 0，不做除法，规则 1）。
 * env：{box, lens, attrs(k) → {h: 定点米 | null, terrain: 代号 | null, water: boolean} | null, slopePoints, roadPace}；cells 里的格 attrs 须非 null。
 * @param {any} env @param {number[]} cells @param {boolean} waterway
 * @returns {{distance: bigint, ascent: bigint | null, mix: Map<string, bigint> | null, speed: bigint | null}}
 */
export function pathMetrics(env, cells, waterway) {
  const { box, lens, attrs, slopePoints, roadPace } = env;
  const scale = fixedScale();
  const colOf = (k) => k % box.cellsX;
  const rowOf = (k) => (k - (k % box.cellsX)) / box.cellsX;
  let distance = 0n;
  let ascent = 0n;
  let weighted = 0n;
  let mixOk = true;
  const weights = new Map();
  for (let i = 1; i < cells.length; i += 1) {
    const u = cells[i - 1];
    const v = cells[i];
    const len = colOf(u) !== colOf(v) && rowOf(u) !== rowOf(v) ? lens.diag : lens.orth;
    const a = attrs(u);
    const b = attrs(v);
    distance += len;
    const heightsKnown = a.h !== null && b.h !== null;
    if (!heightsKnown) ascent = null;
    else if (ascent !== null) ascent += absDiff(a.h, b.h);
    let slope = scale;
    if (!waterway && !b.water) {
      if (heightsKnown) slope = slopeTerm(slopePoints, absDiff(a.h, b.h), len);
      else weighted = null;
    }
    if (weighted !== null) weighted += (len * roadPace * slope) / (scale * scale);
    if (b.terrain === null) mixOk = false;
    else weights.set(b.terrain, (weights.has(b.terrain) ? weights.get(b.terrain) : 0n) + len);
  }
  const speed = weighted === null || weighted === 0n ? null : (distance * scale) / weighted;
  return { distance, ascent, mix: mixOk ? mixShares(weights) : null, speed };
}

/**
 * 地形构成（卷五 §4.1 规则 4：各地形的区格按步长加权的份额；§4.10 A5-10.2 各项和为 1）：weights 是地形代号 → 步长权重（定点，> 0），
 * 份额取最大余数法凑满 1（定点整数，各项之和恰为一整份）：先各取向零截断的份额，余下的最小单位依次给小数部分大的，并列取代号码点序小的。
 * @param {Map<string, bigint>} weights @returns {Map<string, bigint>} 地形代号 → 定点份额
 */
export function mixShares(weights) {
  const scale = fixedScale();
  const codes = [...weights.keys()].sort(cmp);
  let total = 0n;
  for (const c of codes) total += weights.get(c);
  const out = new Map();
  if (total === 0n) return out;
  const rest = [];
  let used = 0n;
  for (const c of codes) {
    const num = weights.get(c) * scale;
    out.set(c, num / total);
    used += num / total;
    rest.push([c, num % total]);
  }
  rest.sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : cmp(a[0], b[0])));
  for (let i = 0n; i < scale - used; i += 1n) out.set(rest[Number(i)][0], out.get(rest[Number(i)][0]) + 1n);
  return out;
}
