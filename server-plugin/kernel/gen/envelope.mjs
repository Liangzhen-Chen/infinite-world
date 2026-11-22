// 手写建筑行的开局建账（卷十 R10-7.12 末、R10-1.7 手写优先生成补缺；卷十九 §2.1 :108–:109、:118、§4.1 规则 7 与规则 11 表第一行"开局建行"、§4.4 规则 1；
// 封卷后勘误 1123k60，李白 11-23 事件 7fc731e6《C 卡开局建账 0847》①②都选甲）：对全部手写建筑行（挂 comp_facility 的作者行，句柄 rules.gen.roleFacility；不分站点、类型，不按 id 或名字），
// 在 siteform 阶段补出形制、平面格数、层数之后，对缺的三项逐一补，作者写了的原样不动：
//   ① materialKg（围护里每种料的质量，缺时）：按"形制默认料 × 围护体积 × 密度"补（卷十九 §4.4 规则 1 的式子 m = V × v_i × density，升乘千克每升，定点四位、向零截断一次）：
//      围护体积取 planBlueprint 蓝图各结构元的设计体积，按用料角色（墙、梁架、屋顶，blueprint.mjs volumeByMaterialRole）分；每个角色用形制条目 defaultMaterials 里指的那一种料，
//      两个角色同一种料则质量相加；密度取材料行固态栏的基值（读入口 ctx.densityOf，worldgen.mjs 直接读材料表行值）：表头 density 是按物态分栏的 struct 且 modifiable false，
//      只有登记了可修正的数值标量才走修正管线（item.mjs runtimeReader 同一判据），所以它的有效值按定义就是基值，卷三乙 M-12 ② 要的有效值读到了；
//   ② condition（缺时）：取规则 rules.gen.openingCondition（暂定 1，待调）；与形制、蓝图无关，缺 form 的行也补；
//   ③ wallFlowKg（围护流水账，缺时；作者不写，作者写了即 E-GEN-ROW-INVALID，卷十九 :419）：开局建行记砌入——每种料 laidKg = 行上 materialKg（作者写的或本阶段补出的），takenKg、lostKg 为 0
//      （kernel/wall-flow.mjs openingWallFlow，开局流水账值的唯一构造函数；手写行不得免账，0 也照记）。账本一边照卷六 §4.1 规则 5（本阶段没有建筑的持有人输入，资产分录归开局持有卡，不在这里）。
// 缺 form 的建筑行（siteform 记了缺口 form_type_unmatched）读不到蓝图：materialKg 不补、不报错、不自造，本阶段再记一条同码缺口；作者写了 materialKg 的行仍记 wallFlowKg。
// 补出的维度写成该行 generated 偏离行（来源"生成补缺"，generated.by 记 gstage_envelope），作者之后手写同一维度即覆盖。同输入同结果：不抽取、不读 state、墙钟，不用 Math.*。
// 未落（卷文推不出或没有数，不自编）：开局 condition 按建成年代折（挂 PLAN）；梁架角色对应的结构元（楼梯、楼板、桥面）是本卡按蓝图结构元种类对应的口径，卷十九没有逐元写，
// 已定：体元里外墙与隔墙归墙、楼梯归梁架，顶元里屋面归屋顶、楼板与桥面归梁架（理由：形制默认料三项是墙、梁架、屋顶，蓝图的承托构件只有这几种，没有第四种可归）。

import { KernelError } from '../errors.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';
import { planBlueprint, volumeByMaterialRole, MATERIAL_ROLES } from '../blueprint.mjs';
import { openingWallFlow } from '../wall-flow.mjs';
import { fixedUnits, fixedMultiply, fixedAdd, fixedToNumber } from '../det-math.mjs';

const FAMILY = Object.freeze({ form: 'bform' });
const REASON = Object.freeze({ formTypeUnmatched: 'form_type_unmatched', planMissing: 'envelope_plan_missing' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @param {{
 *   table: string, stage: string, vocab: any, rows: Map<string, import('./rows.mjs').GenRow>, authoredIds: Set<string>, roleFacility: string,
 *   blueprint: {cellM: number, storeyM: number, facingDirections: number, m3PerL: number, limits: Record<string, any>} | null,
 *   densityOf: (code: string) => number | undefined, openingCondition: number, isAuthored: (id: string, dim: string) => boolean
 * }} ctx
 *   densityOf：材料代号 → 固态栏密度（千克每升，基值即有效值），读不到为 undefined；openingCondition：rules.gen.openingCondition；isAuthored(id, dim)：该行该维的值是作者写的
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{id: string, reason: string, gaps: string[]}>}}
 */
export function genEnvelope(ctx) {
  const proposals = [];
  const deferred = [];
  if (ctx.blueprint === null) throw new KernelError('E-RULES-UNREGISTERED', {}, 'envelope: rules.grid, rules.facility.blueprint and the volume unit are needed to read the blueprint volumes');
  if (typeof ctx.openingCondition !== 'number' || !(ctx.openingCondition >= 0 && ctx.openingCondition <= 1)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'envelope: rules.gen.openingCondition (a number in [0, 1]) is needed');
  if (typeof ctx.densityOf !== 'function') throw new KernelError('E-RULES-UNREGISTERED', {}, 'envelope: a material solid-density reader (ctx.densityOf) is needed');
  if (typeof ctx.isAuthored !== 'function') throw new KernelError('E-RULES-UNREGISTERED', {}, 'envelope: ctx.isAuthored is needed to tell an authored wallFlowKg from a generated one');
  const buildings = [...ctx.rows.values()].filter((r) => r.kind === FOOTPRINT_KIND.building && r.classes.has(ctx.roleFacility) && ctx.authoredIds.has(r.id)).sort((a, b) => cmp(a.id, b.id));
  for (const b of buildings) {
    const d = b.dims;
    const dims = {};
    let materialKg = isObj(d.materialKg) ? d.materialKg : null; // 行上已有（作者写的）：原样当输入读，不补
    const formCode = d.form;
    const rec = typeof formCode === 'string' && ctx.vocab.index instanceof Map ? ctx.vocab.index.get(formCode) : undefined;
    // 完好度与形制、蓝图无关（卷十九 :118；李白 C-2"一律 1"）：缺 condition 一律补，缺 form 的行也补。
    if (d.condition === undefined) dims.condition = ctx.openingCondition;
    if (formCode === undefined) {
      if (d.materialKg === undefined) deferred.push({ id: b.id, reason: REASON.formTypeUnmatched, gaps: ['materialKg'] });
    } else {
      if (!rec || rec.family !== FAMILY.form || !isObj(rec.entry)) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: form ${JSON.stringify(formCode)} is not an entry of the bform family`);
      if (materialKg === null) {
        if (!isObj(d.planCells) || !Number.isInteger(d.storeys)) deferred.push({ id: b.id, reason: REASON.planMissing, gaps: ['materialKg'] });
        else {
          materialKg = fillMaterialKg(ctx, b.id, rec.entry, d);
          dims.materialKg = materialKg;
        }
      }
    }
    // 围护流水账是账、作者不写（卷十九 :419）：作者在行上写了即拒收；先行阶段生成的（世界重建时已在偏离行里）不重写。
    if (d.wallFlowKg !== undefined && ctx.isAuthored(b.id, 'wallFlowKg')) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: wallFlowKg is the ledger, authors do not write it (vol19 :419)`);
    if (materialKg !== null && d.wallFlowKg === undefined) dims.wallFlowKg = openingWallFlow(materialKg);
    if (Object.keys(dims).length > 0) proposals.push({ table: ctx.table, id: b.id, dims, by: ctx.stage, seedKey: '' });
  }
  return { proposals, deferred };
}

// 一栋建筑的围护各料质量：蓝图各角色的设计体积 × 形制默认料的密度（定点升 × 千克每升，四位，向零截断），同一种料的角色相加；质量为 0 的料不出现。
function fillMaterialKg(ctx, id, form, d) {
  const defaults = form.defaultMaterials;
  if (!isObj(defaults) || !MATERIAL_ROLES.every((role) => typeof defaults[role] === 'string')) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${id}: form ${d.form} has no defaultMaterials {${MATERIAL_ROLES.join(', ')}} to fill materialKg from`);
  let bp;
  try { bp = planBlueprint({ form, planCells: d.planCells, storeys: d.storeys, wallThicknessM: typeof d.wallThicknessM === 'number' ? d.wallThicknessM : null, facing: Number.isInteger(d.facing) ? d.facing : 0 }, ctx.blueprint); } catch (e) {
    if (e && typeof e.code === 'string' && (e.code.startsWith('E-DET-') || e.code.startsWith('E-DIM-'))) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${id}: ${e.message}`);
    throw e;
  }
  if (!bp.ok) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${id}: the planCells do not unfold into a blueprint (${bp.reason}), the envelope volume is unknown`);
  const volumes = volumeByMaterialRole(bp);
  const mass = new Map(); // 材料代号 → 定点千克
  for (const role of MATERIAL_ROLES) {
    if (volumes[role] === 0n) continue;
    const code = defaults[role];
    const density = ctx.densityOf(code);
    if (typeof density !== 'number' || !(density > 0)) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${id}: material ${code} (default ${role} of form ${d.form}) has no positive solid density`);
    mass.set(code, fixedAdd(mass.get(code) ?? 0n, fixedMultiply(volumes[role], fixedUnits(density))));
  }
  const out = {};
  for (const code of [...mass.keys()].sort(cmp)) if (mass.get(code) > 0n) out[code] = fixedToNumber(mass.get(code));
  return out;
}
