// 数量取账、位置取序（卷五 §4.7 规则 12 :908–:913；格层不存数量，S5-8）：有形存量（树、竹、灌丛、矿体、在田作物）在格上画几个、画在哪，
// 一律由账户余额派生，格只给次序与差分标记。纯函数、不读引擎与状态、不生成细格基底（候选格只用区格层与高度场判）。
// - stockCount：N = floor(余额 ÷ 单位质量)。
// - distributeStock：把 N 个位置分到区格（只排区格、只读差分计数，规模是区格数，不是细格数）。
// - pickStockCells：区格内按次序键取前 n_c 格。
// - plantCandidateCells：植物的候选格（地表层上一层、列的整数坐标）。
// 全整数。次序键经 kernel/grid.mjs 的 stockRegionKey、stockCellKey（种子抽取点已登 seed-keys.json）。

import { fixedUnits } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { stockRegionKey, stockCellKey } from './grid.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 画几个：N = floor(余额 ÷ 单位质量)（卷五 §4.7 规则 12 :910）。余额与单位质量同单位（kg）；单位质量须为正（否则 E-DET-DOMAIN，不做除零、不给缺省）；余额为负拒收。
 * @param {number} balance 账户余额 @param {number} unitMass 单位质量（植物取个体质量，矿取一格体积 × 材料密度）
 * @returns {number}
 */
export function stockCount(balance, unitMass) {
  const b = fixedUnits(balance);
  const u = fixedUnits(unitMass);
  if (u <= 0n) throw new KernelError('E-DET-DOMAIN', {}, 'stockCount: unit mass must be positive');
  if (b < 0n) throw new KernelError('E-DET-DOMAIN', {}, 'stockCount: balance must not be negative');
  return Number(b / u);
}

/**
 * 分到区格（卷五 §4.7 规则 12 :911）。入参：
 *  regions——U 内允许 x 的区格（共 E 个）{x, y, cap（候选格数 cap_c）, excluded（差分里排除格个数 S_c）}；
 *  N——要画的个数（stockCount 的结果）。
 * 区格次序：按 hash(世界种子, U, x, 区格序号) 升序排（并列按区格 (x, y) 字典序），名次 r_c 从 0 起；T = N + S（S = Σ S_c）；
 * m_c = floor(T ÷ E) + (r_c < T mod E 时 1，否则 0)；n_c = m_c − S_c；n_c 越界 [0, cap_c − S_c] 的先截到界内，
 * 截下的差额按净差补平（被截掉的多画 plus 与被截上去的少画 minus 先相抵）：净差为正从区格次序末尾往前，在仍有余量（n_c < cap_c − S_c）的区格里依次加；
 * 净差为负从末尾往前，在 n_c > 0 的区格里依次减；补平后 Σ n_c 恰为 N。
 * N + S 超过 Σ cap_c 报 E-GRID-STOCK-OVER-CAP（不截）；S_c 大于 cap_c（差分记了比候选格还多的排除格）同样报该码。
 * @param {{worldSeed: string, w: number, unit: string, stock: string, N: number, regions: {x: number, y: number, cap: number, excluded: number}[]}} input
 * @returns {{x: number, y: number, n: number}[]} 按区格 (x, y) 字典序，每个入参区格一项
 */
export function distributeStock(input) {
  const { worldSeed, w, unit, stock, N, regions } = input;
  if (!Number.isInteger(N) || N < 0) throw new KernelError('E-DET-DOMAIN', {}, 'distributeStock: N must be a non-negative integer');
  let capSum = 0;
  let S = 0;
  for (const r of regions) {
    if (!Number.isInteger(r.cap) || r.cap < 0 || !Number.isInteger(r.excluded) || r.excluded < 0) throw new KernelError('E-DET-DOMAIN', {}, 'distributeStock: cap and excluded must be non-negative integers');
    if (r.excluded > r.cap) throw new KernelError('E-GRID-STOCK-OVER-CAP', {}, `distributeStock: region ${r.x},${r.y} has ${r.excluded} excluded cells over ${r.cap} candidates`);
    capSum += r.cap;
    S += r.excluded;
  }
  if (N + S > capSum) throw new KernelError('E-GRID-STOCK-OVER-CAP', {}, `distributeStock: N ${N} + S ${S} exceeds total candidate cells ${capSum}`);
  const E = regions.length;
  if (E === 0) return [];
  const ranked = regions
    .map((r) => ({ ...r, key: stockRegionKey(worldSeed, unit, stock, w, r.x, r.y) }))
    .sort((a, b) => cmp(a.key, b.key) || cmp(a.x, b.x) || cmp(a.y, b.y));
  const T = N + S;
  const extra = T % E;
  const base = (T - extra) / E; // floor(T ÷ E)
  let plus = 0; // 被截掉的多画（要补给别处）
  let minus = 0; // 被截上去的少画（要从别处扣）
  for (let i = 0; i < E; i += 1) {
    const r = ranked[i];
    const upper = r.cap - r.excluded;
    const raw = base + (i < extra ? 1 : 0) - r.excluded;
    if (raw > upper) { plus += raw - upper; r.n = upper; } else if (raw < 0) { minus += -raw; r.n = 0; } else r.n = raw;
  }
  // 截之前 Σ raw 恒为 N，截之后 Σ n = N − plus + minus，真正要补平的只有净差 delta = plus − minus（正的被截掉的多画与负的被截上去的少画先相抵）。
  // delta > 0：从区格次序末尾往前，在 n_c < cap_c − S_c 的区格里依次加；delta < 0：从末尾往前，在 n_c > 0 的区格里依次减。
  // 在 N + S ≤ Σcap 下一定补得平（delta > 0 时余量合计 = Σ(cap_c − S_c) − (N − delta) ≥ delta；delta < 0 时 Σ n = N + |delta| ≥ |delta|），
  // 补不平是实现的内部不变量被破坏，不是数据错，直接当内部错抛出。
  let delta = plus - minus;
  for (let i = E - 1; i >= 0 && delta > 0; i -= 1) {
    const room = ranked[i].cap - ranked[i].excluded - ranked[i].n;
    const take = room < delta ? room : delta;
    ranked[i].n += take;
    delta -= take;
  }
  for (let i = E - 1; i >= 0 && delta < 0; i -= 1) {
    const take = ranked[i].n < -delta ? ranked[i].n : -delta;
    ranked[i].n -= take;
    delta += take;
  }
  if (delta !== 0) throw new Error('distributeStock: invariant broken, per-region counts cannot be balanced although N + S <= total candidates');
  return ranked.map((r) => ({ x: r.x, y: r.y, n: r.n })).sort((a, b) => cmp(a.x, b.x) || cmp(a.y, b.y));
}

/**
 * 区格内取格（卷五 §4.7 规则 12 :912）：候选格（已去掉排除格）按 hash(世界种子, U, x, 格序号) 升序（并列按 (x, y, z) 字典序），取前 n 格。
 * 候选格不足 n 报 E-GRID-STOCK-OVER-CAP。只依赖入参，与候选格的给出次序无关。
 * @param {{worldSeed: string, w: number, unit: string, stock: string}} id @param {{x: number, y: number, z: number}[]} candidates @param {number} n
 * @returns {{x: number, y: number, z: number}[]}
 */
export function pickStockCells(id, candidates, n) {
  if (!Number.isInteger(n) || n < 0) throw new KernelError('E-DET-DOMAIN', {}, 'pickStockCells: n must be a non-negative integer');
  if (n > candidates.length) throw new KernelError('E-GRID-STOCK-OVER-CAP', {}, `pickStockCells: ${n} cells wanted, ${candidates.length} candidates`);
  return candidates
    .map((c) => ({ ...c, key: stockCellKey(id.worldSeed, id.unit, id.stock, id.w, c.x, c.y, c.z) }))
    .sort((a, b) => cmp(a.key, b.key) || cmp(a.x, b.x) || cmp(a.y, b.y) || cmp(a.z, b.z))
    .slice(0, n)
    .map(({ x, y, z }) => ({ x, y, z }));
}

/**
 * 植物的候选格（卷五 §4.7 规则 12 :909）：区格内地表层上的细格，即每列的 (x, y, 地表层号 + 1)；只用高度场（surfaceZAt 回调给列的地表层号，
 * 不生成细格基底）；不在建筑足迹内——建筑足迹随 G7，这里由调用方经 skip(x, y) 回调给出要跳过的列（没有则全取）。
 * @param {{x: number, y: number}} region 区格序号 @param {number} perCell 区格边长（细格数） @param {(x: number, y: number) => number} surfaceZAt @param {(x: number, y: number) => boolean} [skip]
 * @returns {{x: number, y: number, z: number}[]} 按 (x, y) 字典序
 */
export function plantCandidateCells(region, perCell, surfaceZAt, skip) {
  const out = [];
  const x0 = region.x * perCell;
  const y0 = region.y * perCell;
  for (let x = x0; x < x0 + perCell; x += 1) {
    for (let y = y0; y < y0 + perCell; y += 1) {
      if (skip && skip(x, y)) continue;
      out.push({ x, y, z: surfaceZAt(x, y) + 1 });
    }
  }
  return out;
}
