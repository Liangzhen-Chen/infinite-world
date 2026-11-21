// 手写建筑行缺维度的补缺（卷十 R10-7.12、封卷后勘误 1121k16，李白 11-21 裁定事件 b58f7dca；R10-1.7 整类规则之二，水体行同类见 R10-2.17；卷十九 §2.1、§4.5 规则 7）：
// 对全部手写建筑行（挂 comp_facility 的作者行，句柄 rules.gen.roleFacility；不分站点、类型，不按 id 或名字），在 R10-7.11 落位之前，对缺的维度逐一补，作者写了的原样当输入读：
//   ① wallThicknessM（形制 walled 为真而缺时）：取形制条目的 wallThicknessDefaultM（数据出自形制条目，不抽取）；
//   ② planCells（缺时）：先定面积 A：取 rules.gen.bldfill.rows 里 whenRX 为真者中 priority 最大的一行（并列取行序最小；没有行适用即 E-GEN-ROW-INVALID，不拿常量兜底），
//      按其 areaM2 分布抽取（抽取点 site_gen_bldfill_area，对象为本行 id）；再 planCellsOf({form, areaM2: A, wallThicknessM})；
//   ③ storeys（缺时）：取同一规则行的 storeys 分布抽取（抽取点 site_gen_bldfill_storeys），夹进 [max(1, 1 − 形制 storeyBase), storeysMax]；区间为空即 E-GEN-ROW-INVALID；
//   ④ 房间行（缺时）：planBlueprint 的 rooms 里作者没有以同一 roomRole、同角色序号写了房间行的房间，列入 deferred（room_rows_unbuilt），见下"未落"。
// 补出的房子必须能展开：补完前三项后先经 planFeasible（不铺格的可行性预判，与面积无关的代价）判，ok 为假（如房间分不下）时把 A 加倍后重做 planCellsOf，可行才调 planBlueprint 真铺，直到 ok 为真；planCells 任一边将超过该形制登记的外包边长上限
// （形制条目 planSideMaxCells，卷十九 §2.4、封卷后勘误 1121k21、李白 11-22 裁定事件 3ce50e60 取甲；planCellsOf 越界抛，没有全局数）仍不行，即拒收：E-GEN-ROW-INVALID，字段写进生成日志（building、form、
// need_width_cells、need_depth_cells、max_cells、reason=plan_cells_over_form_cap），不静默截断、不悄悄缩房间。作者写了 planCells 的不重做、不加倍，超形制上限或 ok 为假同样 E-GEN-ROW-INVALID（作者数据错）。
// form、intendedType 是卷十九必填的作者输入，不补，缺 form 即 E-GEN-ROW-INVALID（intendedType 现在还不是 place 表登记的维度，见回报）。
// 来源标记与覆盖同 R10-2.17：补出的维度写成该行的 generated 偏离行（generated.by 记 gstage_siteform），作者之后手写同一维度即覆盖（世界重新创建时本阶段不再补它）。
// 同种子同结果：抽取只用 site_gen_bldfill_area、site_gen_bldfill_storeys 两个抽取点与行 id，其余是形制条目与纯函数；取值范围是生成规则（占位值待标定），出处写"生成规则"，不是设定原文。
// 未落（卷文推不出或代码没有，不自编）：storeysMax 取卷十九 buildPlan 按 form、materialKg、wallThicknessM 给出的层数上限，buildPlan 还没有，现取规则表 rules.facility.blueprint.storeysMax
//   （planBlueprint 输入域的上限）顶替——材料约束的上限随卷十九建行卡落；房间行的补建要卷十九的建行函数与房间位次登记（R10-7.8 ②），还没有，只列缺口不造行；
//   materialKg 缺时的补法（R10-7.12 末"未落"，仍由作者写）；补出面积是否满足意图类型的功能需求量（R10-7.3 第二次抬升，手写行没有户规模与装置需求，本条不做）。
// 本文件不读 state、墙钟，不用 Math.*。

import { KernelError } from '../errors.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';
import { planBlueprint, planFeasible, planCellsOf, REASON as BP_REASON } from '../blueprint.mjs';
import { genDraw, genDiceKey } from './draw.mjs';
import { fixedUnits, fixedAdd, fixedToNumber, truncateTo } from '../det-math.mjs';

const FAMILY = Object.freeze({ form: 'bform' }); // 形制词表族（卷十九 §2.4）
const REASON = Object.freeze({ roomRows: 'room_rows_unbuilt', storeysCap: 'storeys_max_unchecked' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const CAP_REASON = 'plan_cells_over_form_cap'; // blueprint.mjs overFormCap 的 reason
const wrapDomain = (id, formCode, e) => {
  if (e instanceof KernelError && Object.hasOwn(e.fields, 'max_cells')) { // 只有 blueprint.mjs overFormCap 的错带这组字段（reason plan_cells_over_form_cap）
    const f = e.fields;
    return new KernelError('E-GEN-ROW-INVALID', { reason: CAP_REASON, building: id, form: formCode, need_width_cells: f.need_width_cells, need_depth_cells: f.need_depth_cells, max_cells: f.max_cells },
      `building ${id}: form ${formCode} needs ${f.need_width_cells}x${f.need_depth_cells} cells, its registered planSideMaxCells is ${f.max_cells}; refused (never truncated, never shrunk)`);
  }
  if (e && typeof e.code === 'string' && (e.code.startsWith('E-DET-') || e.code.startsWith('E-DIM-'))) return new KernelError('E-GEN-ROW-INVALID', {}, `building ${id}: ${e.message}`);
  return e;
};

/**
 * @param {{
 *   table: string, stage: string, worldSeed: string, genesisMinute: number, vocab: any,
 *   rows: Map<string, import('./rows.mjs').GenRow>, authoredIds: Set<string>,
 *   bldfillRows: Array<{whenRX: string, priority: number, areaM2: any, storeys: any}>, roleFacility: string,
 *   blueprint: {cellM: number, storeyM: number, facingDirections: number, m3PerL: number, limits: Record<string, any>} | null,
 *   when: (text: string, dims: Record<string, any>) => boolean
 * }} ctx
 *   blueprint：蓝图要的规则常数（place-building.mjs blueprintRulesFrom 的返回）；缺即 null，本阶段无法判展开，抛 E-RULES-UNREGISTERED
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{id: string, reason: string, gaps: string[]}>}}
 */
export function genSiteForm(ctx) {
  const proposals = [];
  const deferred = [];
  const buildings = [...ctx.rows.values()].filter((r) => r.kind === FOOTPRINT_KIND.building && r.classes.has(ctx.roleFacility) && ctx.authoredIds.has(r.id)).sort((a, b) => cmp(a.id, b.id));
  if (buildings.length === 0) return { proposals, deferred };
  if (ctx.blueprint === null) throw new KernelError('E-RULES-UNREGISTERED', {}, 'siteform: rules.grid, rules.facility.blueprint and the volume unit are needed to fill building rows');
  const limits = ctx.blueprint.limits;
  for (const b of buildings) {
    const d = b.dims;
    const rec = typeof d.form === 'string' && ctx.vocab.index instanceof Map ? ctx.vocab.index.get(d.form) : undefined;
    if (!rec || rec.family !== FAMILY.form || rec.entry === null || typeof rec.entry !== 'object') throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: form ${JSON.stringify(d.form)} is not an entry of the bform family (form is a required authored input, it is never filled)`);
    const form = rec.entry;
    const dims = {};
    // ① 墙厚。
    let wall = typeof d.wallThicknessM === 'number' ? d.wallThicknessM : null;
    if (form.walled === true && wall === null) {
      if (typeof form.wallThicknessDefaultM !== 'number') throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: form ${d.form} has no wallThicknessDefaultM to fill the wall thickness from`);
      wall = form.wallThicknessDefaultM;
      dims.wallThicknessM = wall;
    }
    const needCells = d.planCells === undefined || d.planCells === null;
    const needStoreys = typeof d.storeys !== 'number';
    // 规则行：只在要补面积或层数时选（两者共用一行）。
    let rule = null;
    if (needCells || needStoreys) {
      let best = null;
      for (const r of ctx.bldfillRows) if (ctx.when(r.whenRX, d) && (best === null || r.priority > best.priority)) best = r;
      if (best === null) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: no rules.gen.bldfill.rows row applies (whenRX), a required input is never filled with a constant`);
      rule = best;
    }
    // ③ 层数（夹进区间；区间为空报错）。
    let storeys = needStoreys ? null : d.storeys;
    if (needStoreys) {
      const lowest = form.storeyBase !== undefined && 1 - form.storeyBase > 1 ? 1 - form.storeyBase : 1;
      const highest = limits.storeysMax;
      if (highest < lowest) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: storeys range [${lowest}, ${highest}] is empty (storeyBase ${form.storeyBase})`);
      const drawn = fixedToNumber(truncateTo(fixedUnits(genDraw('gen_siteform', 'site_gen_bldfill_storeys', ctx.worldSeed, b.id, ctx.genesisMinute, rule.storeys)), 0));
      storeys = drawn < lowest ? lowest : drawn > highest ? highest : drawn;
      dims.storeys = storeys;
      // 上限是 planBlueprint 输入域的上限，不是卷十九 buildPlan 按材料给的 storeysMax（storeyCurve 还没登记）：这行的层数没核材料承重，如实记缺口（归卷十九建行卡，真上限落地后在此处换掉并删本缺口）。
      deferred.push({ id: b.id, reason: REASON.storeysCap, gaps: ['storeys'] });
    }
    // ② 平面格数；补出的房子必须能展开（A 加倍重做，直到可展开或越过形制登记上限）。
    const facing = Number.isInteger(d.facing) ? d.facing : 0;
    const expand = (planCells) => {
      try {
        return planBlueprint({ form, planCells, storeys, wallThicknessM: wall, facing }, ctx.blueprint);
      } catch (e) { throw wrapDomain(b.id, d.form, e); }
    };
    let planCells = needCells ? null : d.planCells;
    let bp;
    if (needCells) {
      let area = fixedUnits(genDraw('gen_siteform', 'site_gen_bldfill_area', ctx.worldSeed, b.id, ctx.genesisMinute, rule.areaM2));
      for (;;) {
        try { planCells = planCellsOf({ form, areaM2: fixedToNumber(area), wallThicknessM: wall }, ctx.blueprint); } catch (e) { throw wrapDomain(b.id, d.form, e); }
        // 先用不铺格的可行性预判（blueprint.mjs planFeasible，代价与平面面积无关）；可行才真铺蓝图。ok 为假一律加倍，终止靠卷十 :688 的形制登记上限（planCellsOf 越该形制 planSideMaxCells 抛，转 E-GEN-ROW-INVALID 并带字段，不截断）。
        // 已定：只有 entranceNotAdjacent 提前报错——它只读 storeyBase 加 storeys（blueprint.mjs build 的入口判断），与面积无关，加倍到上限的结局也是同一个 E-GEN-ROW-INVALID，提前停结果等价。
        let feas;
        try { feas = planFeasible({ form, planCells, storeys, wallThicknessM: wall, facing }, ctx.blueprint); } catch (e) { throw wrapDomain(b.id, d.form, e); }
        if (feas.ok) { bp = expand(planCells); break; }
        if (feas.reason === BP_REASON.entranceNotAdjacent) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: the form cannot unfold at any area (${feas.reason} reads only storeyBase and storeys)`);
        area = fixedAdd(area, area); // 面积加倍
      }
      dims.planCells = planCells;
    } else {
      bp = expand(planCells);
      if (!bp.ok) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: the authored planCells do not unfold into a blueprint (${bp.reason})`);
    }
    // ④ 房间行缺口：同一 roomRole 的房间行按行 id 序对应蓝图里该角色的第 k 间。
    const have = new Map();
    for (const r of ctx.rows.values()) {
      if (r.kind !== FOOTPRINT_KIND.room) continue;
      let p = r.parent;
      const seen = new Set();
      while (p !== null && ctx.rows.has(p) && !seen.has(p) && p !== b.id) { seen.add(p); p = ctx.rows.get(p).parent; }
      if (p !== b.id) continue;
      const role = r.dims.roomRole;
      have.set(role, (have.get(role) || 0) + 1);
    }
    const used = new Map();
    const missing = [];
    for (const room of bp.rooms) {
      const k = used.get(room.role) || 0;
      used.set(room.role, k + 1);
      if ((have.get(room.role) || 0) <= k) missing.push(`${room.role}#${k}`);
    }
    if (missing.length > 0) deferred.push({ id: b.id, reason: REASON.roomRows, gaps: missing });
    if (Object.keys(dims).length > 0) {
      proposals.push({ table: ctx.table, id: b.id, dims, by: ctx.stage, seedKey: genDiceKey('gen_siteform', 'site_gen_bldfill_area', ctx.worldSeed, b.id, ctx.genesisMinute) });
    }
  }
  return { proposals, deferred };
}
