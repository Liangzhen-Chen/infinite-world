// 水体阶段（卷十 R10-2.12 :427、R10-1.7 :374 手写优先生成补缺、R10-1.14 :381 事务内读卷五派生）：给水体行补它缺的水体字段。
// 水体行 = 挂水体组件类的行（句柄取规则表 rules.gen.roleWaterbody，不认组件类代号）；作者写了的字段一律不动，只补缺：
//   capacityM3 = ⌊surfaceM2 × 按所挂规则行 depthM 抽得的水深 ÷ 立方米换算⌋（整立方米，封卷后勘误 1123k53，李白 11-23 事件 b41e0801 P10-4 水体存量单位由升改立方米；水深抽取点 site_gen_water_depth，对象 = 水体行 id；
//     立方米换算 m3PerUnit 取容量维度所标单位在单位表里的 si（m3 为 1），由调用方交入）；
//   surfaceM2 = 本行足迹面积 areaM2（卷五由足迹派生，调用方交入）；
//   排水去处 = 与本行足迹有一对四邻接区格、代表海拔严格低于它的存量单元（挂 rules.gen.roleTract 的行）中海拔最低者（并列取 id 最小），没有即空；
//   downstream = 从本水体的排水去处出发沿排水去处走、遇到的第一个水体，走到空为止都没遇到则空（海拔沿途严格下降，链必然终止）；
//   catchmentM2 = 沿排水去处首先到达本水体的全部存量单元（含本单元）的 areaM2 之和。
// runoffCoef 由 gfield 条目给（自然量阶段，同一个 target 机制），不在这里。
// 规则行的选取：水体行已知 waterKind，取 rules.gen.waterRows 里 waterKind 相同者中 priority 最大、并列取行序最小的一行；
// 没有即该水体行整体缺口、进 deferred（流不流由 water 词表条目的 flowing 定、跟着水体类走，卷五 §2.2 :248；没有规则行的水体类（如海）不借别的水深顶替）。
// 缺口不编、不借别的量顶替：足迹未知（格空间还没有、行还不能划分）、水体类缺、液体缺的水体行，不出提案，进 deferred（含原因代号与缺哪些字段）。
// 本文件不读 state、墙钟，不用 Math.*（面积与海拔来自卷五派生，几何不自算，S10-11）。

import { KernelError } from '../errors.mjs';
import { genDraw, genDiceKey } from './draw.mjs';
import { fixedUnits, fixedAdd, fixedScale, fixedToNumber } from '../det-math.mjs';

/** 阶段接口（A10-1.3）：登记表只认 {run(ctx)}；ctx 由 worldgen.mjs 统一给，本阶段自己取要的东西。 */
export const stage = {
  run: (ctx) => genWater({
    ...ctx,
    waterRows: ctx.rules.waterRows,
    roleTract: ctx.rules.roleTract,
    roleWaterbody: ctx.rules.roleWaterbody,
    m3PerUnit: ctx.m3PerUnit,
    // 水体阶段只读水体行与存量单元行的面积、海拔（汇水、排水去处）：只对这两类行求高度，其余行（政区、站点）不逐区格求高度场。
    footprints: ctx.footprints({ bed: false, heights: (id) => { const r = ctx.rows.get(id); return r !== undefined && (r.classes.has(ctx.rules.roleWaterbody) || r.classes.has(ctx.rules.roleTract)); } }),
  }),
};

// 骰值键（卷十 §4.12.1 :861 `stream.gen.water` / `site.gen.water.depth`，对象段取水体行 id；代号写成下划线，同卷二十天气抽取点的写法；调用处写字面量并登记在 seed-keys.json）。
const DEFER = Object.freeze({ footprint: 'footprint_unknown', rule: 'water_rule_missing', kind: 'water_kind_missing', liquid: 'liquid_missing' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 满足某组件类的行。
const withClass = (rows, code) => [...rows.values()].filter((r) => r.classes.has(code));

/**
 * @param {{
 *   table: string, stage: string, worldSeed: string, genesisMinute: number, vocab: any,
 *   rows: Map<string, import('./rows.mjs').GenRow>,
 *   waterRows: Array<{priority: number, waterKind: string, depthM: Record<string, any>}>,
 *   roleTract: string, roleWaterbody: string, m3PerUnit: number,
 *   footprints: null | {footprints: Record<string, {areaM2: number | null, elevationM: number | null}>, adjacency: Record<string, string[]>},
 * }} ctx
 *   footprints：卷五 planFootprints 的返回（足迹派生量与足迹相邻集）；null 表示还划不出足迹
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{id: string, reason: string, gaps: string[]}>}}
 */
export function genWater(ctx) {
  const waters = withClass(ctx.rows, ctx.roleWaterbody).sort((a, b) => cmp(a.id, b.id));
  const tracts = new Set(withClass(ctx.rows, ctx.roleTract).map((r) => r.id));
  const waterIds = new Set(waters.map((r) => r.id));
  const fp = (id) => (ctx.footprints && ctx.footprints.footprints ? ctx.footprints.footprints[id] : undefined);
  const known = (v) => Number.isFinite(v);
  // 排水去处：足迹相邻、海拔严格更低的存量单元中海拔最低者，并列取 id 最小；没有即 null。
  const drain = (id) => {
    const here = fp(id);
    if (!here || !known(here.elevationM)) return null;
    let best = null;
    for (const n of (ctx.footprints.adjacency && ctx.footprints.adjacency[id]) || []) {
      const f = fp(n);
      if (!tracts.has(n) || !f || !known(f.elevationM) || !(f.elevationM < here.elevationM)) continue;
      if (best === null || f.elevationM < fp(best).elevationM || (f.elevationM === fp(best).elevationM && n < best)) best = n;
    }
    return best;
  };
  const firstWater = new Map();
  const reach = (id) => {
    if (firstWater.has(id)) return firstWater.get(id);
    const v = waterIds.has(id) ? id : (() => { const d = drain(id); return d === null ? null : reach(d); })();
    firstWater.set(id, v);
    return v;
  };
  const proposals = [];
  const deferred = [];
  for (const w of waters) {
    const d = w.dims;
    const missing = ['capacityM3', 'surfaceM2', 'catchmentM2', 'downstream'].filter((k) => d[k] === undefined);
    if (missing.length === 0) continue;
    if (typeof d.waterKind !== 'string') { deferred.push({ id: w.id, reason: DEFER.kind, gaps: missing }); continue; }
    if (typeof d.liquid !== 'string') { deferred.push({ id: w.id, reason: DEFER.liquid, gaps: missing }); continue; }
    const rule = ctx.waterRows.filter((r) => r.waterKind === d.waterKind).reduce((best, r) => (best === null || r.priority > best.priority ? r : best), null);
    if (rule === null) { deferred.push({ id: w.id, reason: DEFER.rule, gaps: missing }); continue; }
    const f = fp(w.id);
    if (!f || !known(f.areaM2)) { deferred.push({ id: w.id, reason: DEFER.footprint, gaps: missing }); continue; }
    const dims = {};
    const surface = d.surfaceM2 !== undefined ? d.surfaceM2 : f.areaM2;
    if (d.surfaceM2 === undefined) dims.surfaceM2 = f.areaM2;
    if (d.capacityM3 === undefined) {
      const depth = fixedUnits(genDraw('gen_water', 'site_gen_water_depth', ctx.worldSeed, w.id, ctx.genesisMinute, rule.depthM));
      // 整立方米数 = ⌊面积 × 水深 ÷ 容量单位的立方米数⌋：三个量都是 10⁴ 标度整数 S、D、M，结果 = ⌊S × D ÷ (M × 标度)⌋（逐步向下取整与一步取整相同）；
      // 不经容量的定点值（它的 10⁴ 标度值对大水体会越过定点安全上限而溢出 E-DET-OVERFLOW），整数自己装不进安全整数才报错（单位改立方米后，南湾 8.04×10¹⁰ m² 乘 100 m 才 8.04×10¹² m³，深海也装得下）。
      const unitsM = fixedUnits(ctx.m3PerUnit);
      if (unitsM === 0n) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: the capacity unit in cubic metres (m3PerUnit) is zero`);
      const whole = Number((fixedUnits(surface) * depth) / (unitsM * fixedScale()));
      if (!Number.isSafeInteger(whole)) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: capacityM3 does not fit a safe integer (surface ${surface} m2, depth ${fixedToNumber(depth)} m)`);
      if (!(whole >= 1)) throw new KernelError('E-GEN-ROW-INVALID', {}, `water ${w.id}: capacityM3 ${whole} is below 1 m3 (surface ${surface} m2, depth ${fixedToNumber(depth)} m)`);
      dims.capacityM3 = whole;
    }
    if (d.downstream === undefined) { const dr = drain(w.id); dims.downstream = dr === null ? null : reach(dr); }
    if (d.catchmentM2 === undefined) {
      let sum = fixedUnits(0);
      for (const id of [...tracts].sort(cmp)) if (reach(id) === w.id && fp(id) && known(fp(id).areaM2)) sum = fixedAdd(sum, fixedUnits(fp(id).areaM2));
      dims.catchmentM2 = fixedToNumber(sum);
    }
    const seedKey = genDiceKey('gen_water', 'site_gen_water_depth', ctx.worldSeed, w.id, ctx.genesisMinute);
    proposals.push({ table: ctx.table, id: w.id, dims, by: ctx.stage, seedKey });
  }
  // 水体的 downstream 图无环（卷五 §2.1 :149、卷十 R10-2.10）：作者写的与本阶段补的合起来核；成环是骨架不合（E-GEN-SKELETON）。
  const next = new Map(waters.map((w) => [w.id, w.dims.downstream !== undefined ? w.dims.downstream : (proposals.find((p) => p.id === w.id) || { dims: {} }).dims.downstream ?? null]));
  for (const id of next.keys()) {
    const seen = new Set();
    for (let p = id; p !== null && p !== undefined; p = next.get(p)) {
      if (seen.has(p)) throw new KernelError('E-GEN-SKELETON', {}, `water downstream graph has a cycle through ${p}`);
      seen.add(p);
    }
  }
  return { proposals, deferred };
}
