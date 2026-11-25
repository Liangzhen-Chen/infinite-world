// 高低次序投影阶段（卷十 R10-2.18、封卷后勘误 1121k16；R10-1.7 手写优先、R10-9.4 偏离行）：控制海拔沿下游不上坡，生成值服从作者写的次序，取投影、不拒收；
// 只有作者自相矛盾（约束成环，或固定值之间次序反了）才 E-GEN-ORDER-CONFLICT，整个世界创建失败，不改作者值。
// ① 约束 (u, v)：u 的 anchorElevationM 不低于 v 的。来源：作者写了 downstream 的水体行与它的 downstream 行；作者次序链（相邻两项各成一条）。
//    约束图的节点是地表存量单元或区域足迹行；作用对象只有一个维度（调用方交入，现为 anchorElevationM）。
// ③ 节点值分：作者写的（固定）、生成的（可投影）、缺的（未知，不由投影造值）。
// ④ lo(n) = n 的全部下游节点（沿约束可达、不含 n）中固定值之最大（没有为 −∞）；按上游先、同层 id 升序处理；bound(n) = n 的全部直接上游节点最终值之最小
//    （没有为 +∞；未知节点的最终值取它自己的 bound，约束因此透过未知节点传递）；固定值最终值就是它；生成值 g 的最终值 = min(max(g, lo(n)), bound(n))；未知不赋值。
// ⑤ 日志：逐条按行 id 升序 {row, from, to, end, by}，另记改了几个值；生成值 g 小于 lo(n) 记 floor 与取得 lo(n) 的下游固定值行 id（并列取 id 最小），
//    否则 g 大于 bound(n) 记 cap 与取得 bound(n) 的直接上游行 id（并列取 id 最小）。
// 纯函数：只比较与取小取大，不做算术，所以直接用数（不会有舍入）；不读状态、墙钟，不抽取，结果与约束的给出次序、遍历容器次序无关。

import { KernelError } from '../errors.mjs';
import { report } from '../report.mjs';

/** 阶段接口（A10-1.3）：登记表只认 {run(ctx)}；ctx 由 worldgen.mjs 统一给，本阶段自己取要的东西。 */
export const stage = { run: (ctx) => genOrder({ ...ctx, elevationDim: ctx.geo.elevationDim, downhill: ctx.geo.downhill, roleWaterbody: ctx.rules.roleWaterbody }) };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const conflict = (why) => new KernelError('E-GEN-ORDER-CONFLICT', {}, why);

/**
 * 投影的纯函数核心。
 * @param {{constraints: Array<[string, string]>, values: Map<string, {value: number, fixed: boolean}>}} input
 *   constraints：有序对 [u, v]，u 不低于 v；values：有值的节点（固定或生成），没有登记的节点是未知
 * @returns {{final: Map<string, number>, projections: Array<{row: string, from: number, to: number, end: 'floor' | 'cap', by: string}>, changed: number}}
 *   final：有值的节点的最终值（固定值原样）；projections 按行 id 升序
 */
export function projectOrder(input) {
  const down = new Map(); // 节点 → 直接下游（去重、代号序）
  const up = new Map();
  const touch = (m, k) => { if (!m.has(k)) m.set(k, new Set()); return m.get(k); };
  for (const [u, v] of input.constraints) {
    if (u === v) throw conflict(`ordering constraint ${u} -> ${u} is a cycle`);
    touch(down, u).add(v);
    touch(up, v).add(u);
    touch(down, v);
    touch(up, u);
  }
  const nodes = [...down.keys()].sort(cmp);
  // 拓扑序（上游先，同层 id 升序）；剩下的节点即在环上。
  const indeg = new Map(nodes.map((n) => [n, up.get(n).size]));
  const order = [];
  let layer = nodes.filter((n) => indeg.get(n) === 0);
  while (layer.length > 0) {
    layer.sort(cmp);
    order.push(...layer);
    const next = [];
    for (const n of layer) {
      for (const d of [...down.get(n)].sort(cmp)) {
        indeg.set(d, indeg.get(d) - 1);
        if (indeg.get(d) === 0) next.push(d);
      }
    }
    layer = next;
  }
  if (order.length < nodes.length) {
    const onCycle = nodes.filter((n) => !order.includes(n));
    throw conflict(`ordering constraints form a cycle through ${onCycle.join(',')}`);
  }
  const valueOf = (n) => input.values.get(n);
  // lo(n)：下游固定值之最大，带取得它的行 id（并列取 id 最小）。自下游向上游一遍求出。
  const lo = new Map();
  for (const n of [...order].reverse()) {
    let best = null;
    for (const d of [...down.get(n)].sort(cmp)) {
      const dv = valueOf(d);
      const cands = [];
      if (dv && dv.fixed) cands.push({ value: dv.value, id: d });
      const through = lo.get(d);
      if (through) cands.push(through);
      for (const c of cands) if (best === null || c.value > best.value || (c.value === best.value && c.id < best.id)) best = c;
    }
    lo.set(n, best);
  }
  for (const n of order) {
    const v = valueOf(n);
    const l = lo.get(n);
    if (v && v.fixed && l !== null && l.value > v.value) throw conflict(`authored value ${v.value} at ${n} is lower than authored value ${l.value} at ${l.id} further downstream`);
  }
  // 自上游向下游：bound(n) = 直接上游最终值之最小（未知节点的最终值取它自己的 bound）。
  const through = new Map(); // 节点 → 传给下游的值（有值者取最终值，未知取它自己的 bound，没有为 Infinity）
  const final = new Map();
  const projections = [];
  for (const n of order) {
    let bound = Infinity;
    let boundBy = null;
    for (const u of [...up.get(n)].sort(cmp)) {
      const t = through.get(u);
      if (t < bound || boundBy === null) { bound = t; boundBy = u; } // u 按代号升序，并列留先到者（id 最小）
    }
    const v = valueOf(n);
    if (!v) { through.set(n, bound); continue; }
    if (v.fixed) { final.set(n, v.value); through.set(n, v.value); continue; }
    const l = lo.get(n);
    let value = v.value;
    let end = null;
    let by = null;
    if (l !== null && value < l.value) { value = l.value; end = 'floor'; by = l.id; }
    if (value > bound) { value = bound; end = 'cap'; by = boundBy; }
    final.set(n, value);
    through.set(n, value);
    if (value !== v.value) projections.push({ row: n, from: v.value, to: value, end, by });
  }
  for (const [n, v] of input.values) if (!final.has(n)) final.set(n, v.value); // 不在任何约束里的节点原样
  projections.sort((a, b) => cmp(a.row, b.row));
  return { final, projections, changed: projections.length };
}

/**
 * 高低次序投影阶段（gstage_order）：从作者行视图收集约束与节点值，投影，交出被改的生成值的提案与日志。
 * @param {{
 *   table: string, stage: string, rows: Map<string, import('./rows.mjs').GenRow>, elevationDim: string,
 *   roleWaterbody: string, downhill: Array<{chain: string[], dim?: string}>,
 *   isAuthored: (id: string, dim: string) => boolean
 * }} ctx
 *   rows：作者行视图（已并上先行阶段的生成值）；isAuthored(id, dim)：该行该维度的值是作者写的（不是先行阶段生成的）；
 *   downhill：作者次序链（带它约束的维度 dim，只取与 elevationDim 同维度者）
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, number>, by: string, seedKey: string, revise: true}>, deferred: [], report: {projections: Array<{row: string, dim: string, from: number, to: number, end: string, by: string}>, changed: number}}}
 */
export function genOrder(ctx) {
  const dim = ctx.elevationDim;
  // 没有登记控制海拔维度（调用方不交）就没有约束的对象，不投影。
  if (typeof dim !== 'string') return { proposals: [], deferred: [], report: { projections: [], changed: 0 } };
  const constraints = [];
  // 作者写了 downstream 的水体行与它的 downstream 行（生成水体行的 downstream 由 gstage_water 写、晚于本阶段，且沿代表海拔严格下降派生，不进约束图）。
  for (const r of [...ctx.rows.values()].sort((a, b) => cmp(a.id, b.id))) {
    if (!r.classes.has(ctx.roleWaterbody) || !ctx.isAuthored(r.id, 'downstream')) continue;
    const d = r.dims.downstream;
    if (typeof d === 'string' && ctx.rows.has(d)) constraints.push([r.id, d]);
  }
  for (const entry of ctx.downhill || []) {
    if (entry.dim !== undefined && entry.dim !== dim) continue;
    const chain = entry.chain.filter((id) => ctx.rows.has(id));
    for (let i = 1; i < chain.length; i += 1) constraints.push([chain[i - 1], chain[i]]);
  }
  const values = new Map();
  for (const r of ctx.rows.values()) {
    const v = r.dims[dim];
    if (typeof v === 'number') values.set(r.id, { value: v, fixed: ctx.isAuthored(r.id, dim) });
  }
  const { projections, changed } = projectOrder({ constraints, values });
  const proposals = projections.map((p) => ({ table: ctx.table, id: p.row, dims: { [dim]: p.to }, by: ctx.stage, seedKey: '', revise: true }));
  const rep = projections.map((p) => ({ row: p.row, dim, from: p.from, to: p.to, end: p.end, by: p.by }));
  // 内核报告出口记告警（只含代号与数值），同 R10-9.2 的追溯性质：规则层不读它。
  for (const p of rep) report('W-GEN-DOWNHILL-PROJECTED', { row: p.row, from: p.from, to: p.to, end: p.end, by: p.by });
  return { proposals, deferred: [], report: { projections: rep, changed } };
}
