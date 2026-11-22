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
// form：作者没写（该键缺）时本阶段先补（封卷后勘误 1123k31 按设施类型补；1123k52 改为按"适用设施类型"挑，李白 11-23 事件 b41e0801 P10-1 选乙）：候选 = 形制登记（bform 族）里
// 条目的 facilityTypes 含本行 intendedType 的全部形制，按代号序，按抽取点 site_gen_bldfill_form（对象为本行 id，等权 categorical）取一个，写成该行 generated 节的偏离行（来源"生成补缺"，作者之后手写即覆盖）；
// 原按采光、开口两项上限筛（卷十九 §4.5 规则 2 ③）与"最小可展开平面"设计围合值的做法已撤；
// 行上没有 intendedType、或没有任何形制适用本行的设施类型，都算"该设施类型在登记里找不到形制"：不补、不报错、不自造，记缺口 form_type_unmatched，
// 该行不参加本阶段其余各项（也不计入站点占地），缺口按行列进交接文件；作者写了 form 的一律不动，写了不在登记里的仍 E-GEN-ROW-INVALID。
// intendedType 是卷十九必填的作者输入，不补；
// 来源标记与覆盖同 R10-2.17：补出的维度写成该行的 generated 偏离行（generated.by 记 gstage_siteform），作者之后手写同一维度即覆盖（世界重新创建时本阶段不再补它）。
// 同种子同结果：抽取只用 site_gen_bldfill_area、site_gen_bldfill_storeys 两个抽取点与行 id，其余是形制条目与纯函数；取值范围是生成规则（占位值待标定），出处写"生成规则"，不是设定原文。
// 未落（卷文推不出或代码没有，不自编）：storeysMax 取卷十九 buildPlan 按 form、materialKg、wallThicknessM 给出的层数上限，buildPlan 还没有，现取规则表 rules.facility.blueprint.storeysMax
//   （planBlueprint 输入域的上限）顶替——材料约束的上限随卷十九建行卡落；房间行的补建要卷十九的建行函数与房间位次登记（R10-7.8 ②），还没有，只列缺口不造行；
//   materialKg 缺时的补法（R10-7.12 末"未落"，仍由作者写）；补出面积是否满足意图类型的功能需求量（R10-7.3 第二次抬升，手写行没有户规模与装置需求，本条不做）；
//   站点面积（R10-7.5，见 siteAreas）：起始 N 超过所在存量单元足迹格数即 E-GEN-ROW-INVALID 只在站点的父行是存量单元（roleTract）时判；父行不是存量单元的手写站点，
//   卷文推不出"所在存量单元"是哪一行，不判（写进 docs/问题.md"G5b 机制遗留"）；世界没有格空间表时父足迹格数未知，记缺口 tract_footprint_unplanned、不判；有格空间表而存量单元没有足迹即 E-GEN-ROW-INVALID。
// 本文件不读 state、墙钟，不用 Math.*。

import { KernelError } from '../errors.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';
import { planBlueprint, planFeasible, planCellsOf, REASON as BP_REASON } from '../blueprint.mjs';
import { genDraw, genDiceKey } from './draw.mjs';
import { layoutOf, defaultFacing } from '../layout.mjs';
import { fixedUnits, fixedAdd, fixedMultiply, fixedToNumber, truncateTo } from '../det-math.mjs';

const FAMILY = Object.freeze({ form: 'bform' }); // 形制词表族（卷十九 §2.4）；设施类型是维度表（卷十九 §2.2），本阶段只读形制条目的 facilityTypes，不读类型表
const REASON = Object.freeze({
  roomRows: 'room_rows_unbuilt', storeysCap: 'storeys_max_unchecked', tractUnplanned: 'tract_footprint_unplanned', formTypeUnmatched: 'form_type_unmatched',
  layoutGrid: 'layout_grid_missing', layoutFootprint: 'layout_footprint_unplanned', latitudeUnknown: 'facing_latitude_unknown', anchorZ: 'anchor_z_unknown',
});
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
  if (ctx.blueprint === null) throw new KernelError('E-RULES-UNREGISTERED', {}, 'siteform: rules.grid, rules.facility.blueprint and the volume unit are needed to fill building rows');
  const limits = ctx.blueprint.limits;
  const planOf = new Map(); // 建筑 id → 平面格数（作者写的或本阶段补的）；站点面积一节读
  const specOf = new Map(); // 建筑 id → 展开蓝图要的输入 {form, planCells, storeys, wall}（作者写的或本阶段补的）；站点面积一节的落位读
  // 形制登记：bform 族全部条目的代号，按代号序（算一次）。
  const registered = ctx.vocab.index instanceof Map ? [...ctx.vocab.index].filter(([, r]) => r && r.family === FAMILY.form && r.entry !== null && typeof r.entry === 'object').map(([code]) => code).sort(cmp) : [];
  // 本行设施类型的候选形制：形制条目的 facilityTypes（适用设施类型，卷十九 §2.4，封卷后勘误 1123k52）含本行 intendedType 的全部形制，按代号序；行上没有类型即空表。
  const candidatesOf = (b) => {
    const type = b.dims.intendedType;
    if (typeof type !== 'string') return [];
    return registered.filter((code) => {
      const types = ctx.vocab.index.get(code).entry.facilityTypes;
      return Array.isArray(types) && types.includes(type);
    });
  };
  for (const b of buildings) {
    const dims = {};
    let formSeedKey = null;
    let formCode = b.dims.form;
    if (formCode === undefined) {
      // 作者没写形制：按设施类型从登记里按种子取一个（卷十 R10-7.12，封卷后勘误 1123k31）；找不到形制不补、不自造，列缺口。
      const candidates = candidatesOf(b);
      if (candidates.length === 0) { deferred.push({ id: b.id, reason: REASON.formTypeUnmatched, gaps: ['form'] }); continue; }
      formCode = genDraw('gen_siteform', 'site_gen_bldfill_form', ctx.worldSeed, b.id, ctx.genesisMinute, { dist: 'categorical', weights: Object.fromEntries(candidates.map((c) => [c, 1])) });
      formSeedKey = genDiceKey('gen_siteform', 'site_gen_bldfill_form', ctx.worldSeed, b.id, ctx.genesisMinute);
      dims.form = formCode;
    }
    const d = { ...b.dims, form: formCode };
    // 作者写了形制但不在登记里（或不是字串）：作者数据错，E-GEN-ROW-INVALID。
    const rec = typeof formCode === 'string' && ctx.vocab.index instanceof Map ? ctx.vocab.index.get(formCode) : undefined;
    if (!rec || rec.family !== FAMILY.form || rec.entry === null || typeof rec.entry !== 'object') throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: form ${JSON.stringify(formCode)} is not an entry of the bform family`);
    const form = rec.entry;
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
    planOf.set(b.id, planCells);
    specOf.set(b.id, { form, planCells, storeys, wall });
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
      proposals.push({ table: ctx.table, id: b.id, dims, by: ctx.stage, seedKey: formSeedKey ?? genDiceKey('gen_siteform', 'site_gen_bldfill_area', ctx.worldSeed, b.id, ctx.genesisMinute) });
    }
  }
  siteAreas(ctx, buildings, planOf, specOf, proposals, deferred);
  return { proposals, deferred };
}

// 站点面积由占地反推（卷十 R10-7.5，不分片站点：模板与分片角色未接线，R10-7.1 站点下有直挂手写建筑行即不分片；R10-1.7 手写优先、生成补缺）：
// 站点 = 作者写的、不是政区也不是存量单元与水体的区域足迹行（地点）；作者写了 targetAreaM2 或 boundary 的不动。占地 = 各建筑平面格数（宽 × 深，细格）× cellM²；
// N = max(1, ceil(占地 ÷ (layoutCoverage × regionCellM²)))，写 targetAreaM2 = N × regionCellM²（定点整除、向上取整）；N 只由占地决定，不按子行加量（卷文没有这一句，见 docs/问题.md"G5b 机制遗留"）。
// 站点的父行是存量单元时，起始 N 超过该存量单元足迹格数即 E-GEN-ROW-INVALID（R10-7.5 末）。
// 落位与重排（R10-7.11、R10-3.12、R10-7.5 末）：站点下直挂的手写建筑行（有形制、平面格数、层数者）缺 anchor、facing 时，按 layoutOf 排出来写成 generated 偏离行（来源"生成补缺"）；
// 作者写了的原样不动，anchor 已写的当障碍；facing 缺时取 defaultFacing（意图、文化偏好两路现无来源，传空，即面向赤道，纬度取站点起始 N 足迹的形心，卷二十 §2.7 :334）。试排用站点的足迹（经 ctx.footprints 读，
// 站点 targetAreaM2 试写成 N × A）：排不下就 N 加一重排，至多加到站点所在父足迹的区格数，仍排不下即 E-GEN-ROW-INVALID；作者写了 targetAreaM2 或 boundary 的站点 N 取作者足迹的区格数、不加，
// 排不下同样即 E-GEN-ROW-INVALID。所有站点同一轮试排、排不下的一起加一，重排到没有排不下的为止（N 只增，所以必止）。不分片（R10-7.1）：zones 恒空，整个站点足迹当一个分片。
// 缺 form（缺口 form_type_unmatched）的建筑读不到蓝图外包：不排位、不当障碍、不写 anchor 与 facing。
// 未落：分片角色归并（模板与分片角色未接线）；建筑 ordinal（手写行没有，同组按行 id 序）。
function siteAreas(ctx, buildings, planOf, specOf, proposals, deferred) {
  const coverage = ctx.layoutCoverage;
  const regionCellM = ctx.regionCellM;
  const cellM = ctx.blueprint.cellM;
  if (typeof coverage !== 'number' || !(coverage > 0) || coverage > 1) throw new KernelError('E-GEN-ROW-INVALID', {}, 'rules.gen.layoutCoverage must be a number in (0, 1]');
  if (typeof regionCellM !== 'number') throw new KernelError('E-RULES-UNREGISTERED', {}, 'siteform: rules.grid.regionCellM is needed for the site area');
  const sites = new Map();
  for (const b of buildings) {
    if (!sites.has(b.parent)) sites.set(b.parent, []);
    sites.get(b.parent).push(b);
  }
  const cellArea = fixedUnits(regionCellM * regionCellM);
  const denominator = fixedMultiply(fixedUnits(coverage), cellArea);
  const occupancyN = (siteId) => {
    let cells = 0;
    for (const b of sites.get(siteId) || []) {
      const pc = planOf.get(b.id); // 每栋建筑要么补出、要么读到平面格数；只有按设施类型找不到形制而没补出的行（缺口 form_type_unmatched）没有，不计占地
      if (pc === undefined) continue;
      cells += pc.widthCells * pc.depthCells;
    }
    const need = (fixedUnits(cells * cellM * cellM) + denominator - 1n) / denominator; // 向上取整（定点两边同标度，商是整数）
    return need > 1n ? need : 1n;
  };
  // 所在存量单元的足迹格数（R10-7.5 末：起始 N 超过它即 E-GEN-ROW-INVALID）：站点的父行是存量单元时才判；足迹经卷五 planFootprints 读，一次、用到才读。
  let tractFootprints;
  const tractCellCount = (tractId) => {
    if (tractFootprints === undefined) tractFootprints = typeof ctx.footprints === 'function' ? ctx.footprints({ bed: false, heights: false }) : null;
    const f = tractFootprints && tractFootprints.footprints ? tractFootprints.footprints[tractId] : undefined;
    return f !== undefined && Number.isInteger(f.cellCount) ? f.cellCount : null;
  };
  // 要写面积的行：作者写的区域足迹行里不是政区（没有 regionLevel）、不是存量单元与水体（它们的面积来自作者或各自的阶段）、没写 targetAreaM2 与 boundary 者——
  // 即"地点"：没有建筑清单的地点占地为 0，取最少 1 区格（卷五 §4.1 规则 2、13：区域足迹至少一格）；政区与存量单元仍照规则 10 在父足迹里平分。
  const siteRows = [...ctx.rows.values()].filter((r) => r.kind === FOOTPRINT_KIND.region && r.parent !== null && r.regionLevel === null && ctx.authoredIds.has(r.id)
    && !r.classes.has(ctx.roleTract) && !r.classes.has(ctx.roleWaterbody)).sort((a, b) => cmp(a.id, b.id));
  const authoredSized = (r) => typeof r.dims.targetAreaM2 === 'number' || (Array.isArray(r.dims.boundary) && r.dims.boundary.length > 0);
  const places = siteRows.filter((r) => !authoredSized(r));
  const startN = new Map();
  // 站点的"所在存量单元"（李白 11-23 b41e0801 第⑩条取甲，卷十 R10-7.5 勘误 1123k45）：沿 parent 往上第一个挂存量单元组件类（roleTract）的祖先行；没有为 null。
  const tractOf = (site) => {
    const seen = new Set();
    for (let id = site.parent; id !== null && id !== undefined && !seen.has(id); id = ctx.rows.has(id) ? ctx.rows.get(id).parent : null) {
      seen.add(id);
      const r = ctx.rows.get(id);
      if (r !== undefined && r.classes.has(ctx.roleTract)) return id;
    }
    return null;
  };
  for (const site of places) {
    const siteId = site.id;
    const n = occupancyN(siteId);
    const tractId = tractOf(site);
    // 一路往上都没有存量单元：不判起始 N；N 加一的上界退回父行足迹区格数（见 placeBuildings）。这条退路是临时的（李白 11-23 da3cd65a 选甲），
    // 等真实世界存量单元卡（块 6 之后）补上存量单元后撤。
    if (tractId !== null) {
      const have = tractCellCount(tractId);
      if (have === null) {
        // 世界没有格空间表：任何行都没有足迹，判不了，如实记缺口；有格空间表而这个存量单元没有足迹：这块地放不下站点，是数据缺口（R10-7.5 排不下同一口径）。
        if (!(Number.isInteger(ctx.gridSpaceCount) && ctx.gridSpaceCount > 0)) deferred.push({ id: siteId, reason: REASON.tractUnplanned, gaps: [tractId] });
        else throw new KernelError('E-GEN-ROW-INVALID', { site: siteId, tract: tractId, reason: 'tract_has_no_footprint' }, `site ${siteId}: its stock unit ${tractId} has no footprint in a world that has grid spaces (R10-7.5); the site does not fit on this land`);
      } else if (n > BigInt(have)) throw new KernelError('E-GEN-ROW-INVALID', { site: siteId, tract: tractId, need_cells: Number(n), tract_cells: have }, `site ${siteId}: its starting N = ${n} cells exceeds the ${have} cells of its stock unit ${tractId} (R10-7.5); the site does not fit on this land`);
    }
    startN.set(siteId, n);
  }
  // 落位：试排排不下的站点 N 加一（R10-7.5 末），得最终 N 与各建筑的 anchor、facing。
  const jobs = [];
  for (const site of siteRows) {
    const kids = buildings.filter((b) => b.parent === site.id && specOf.has(b.id));
    if (kids.length > 0) jobs.push({ site, siteId: site.id, capId: tractOf(site) ?? site.parent, auto: !authoredSized(site), kids }); // capId：N 加一上界取其足迹区格数；无存量单元时临时退回父行
  }
  // 直挂在非站点行（存量单元、政区、层根……）下的手写建筑不在任何站点里：落位是站点的事（R10-7.11），这类行不排位；它们缺的 anchor、facing 由加载校验报必填缺值，不在这里另记缺口。
  const finalN = placeBuildings(ctx, jobs, specOf, startN, cellArea, proposals, deferred);
  for (const site of places) {
    const n = finalN.get(site.id);
    proposals.push({ table: ctx.table, id: site.id, dims: { targetAreaM2: fixedToNumber(n * cellArea) }, by: ctx.stage, seedKey: genDiceKey('gen_siteform', 'site_gen_bldfill_area', ctx.worldSeed, site.id, ctx.genesisMinute) });
  }
}

const isXY = (a) => a !== null && typeof a === 'object' && !Array.isArray(a) && Number.isInteger(a.x) && Number.isInteger(a.y);

// 落位（卷十 R10-7.11；R10-3.12 补写 anchor、facing；R10-7.5 排不下 N 加一）。jobs 按站点行 id 序，每项 {site, siteId, auto, kids}。返回自动定面积站点的最终 N（bigint，只增）。
function placeBuildings(ctx, jobs, specOf, startN, cellArea, proposals, deferred) {
  const nNow = new Map(startN);
  if (jobs.length === 0) return nNow;
  const gap = (id, reason, gaps) => deferred.push({ id, reason, gaps });
  if (!(Number.isInteger(ctx.gridSpaceCount) && ctx.gridSpaceCount > 0)) {
    // 世界没有格空间表：划不出足迹，落位无从做，如实记缺口（同 tract_footprint_unplanned）。
    for (const j of jobs) {
      const lacking = j.kids.filter((b) => b.dims.anchor === undefined || b.dims.facing === undefined).map((b) => b.id);
      if (lacking.length > 0) gap(j.siteId, REASON.layoutGrid, lacking);
    }
    return nNow;
  }
  if (!Number.isInteger(ctx.layoutGapCells) || ctx.layoutGapCells < 1) throw new KernelError('E-RULES-UNREGISTERED', {}, 'siteform: rules.gen.layoutGapCells (integer >= 1) is needed for the layout (R10-7.11)');
  const grid = { cellM: ctx.blueprint.cellM, regionCellM: ctx.regionCellM, facingDirections: ctx.blueprint.facingDirections };
  const seedKeyOf = () => ''; // 落位不抽取（R10-7.11 首句），来源标记 seedKey 为空（R10-9.2、R10-12.7，同 order.mjs 投影提案）
  // 每栋的朝向与蓝图外包（旋转后，相对锚点的细格偏移）：作者写了 facing 取作者的，否则 defaultFacing（卷十九 §4.5 规则 11）。
  const prepared = [];
  // 纬度读站点足迹的形心（卷二十 §2.7 :334 第十一版起不读 coord）：取起始 N 下的足迹（最终 N 依赖朝向再定，取起始 N 是无环的定点）；这份结果也作下面试排第一轮的足迹。
  const startExtra = {};
  for (const [id, n] of nNow) startExtra[id] = { targetAreaM2: fixedToNumber(n * cellArea) };
  const fp0 = typeof ctx.footprints === 'function' ? ctx.footprints({ heights: false, extra: startExtra }) : null;
  for (const j of jobs) {
    const coord = j.site.dims.coord;
    if (!(coord !== null && typeof coord === 'object' && typeof coord.x === 'number' && typeof coord.y === 'number')) { gap(j.siteId, REASON.layoutFootprint, ['coord']); continue; }
    const centroid = fp0 && fp0.footprints && fp0.footprints[j.siteId] ? fp0.footprints[j.siteId].centroid : undefined;
    let latitude;
    const items = [];
    for (const b of j.kids) {
      if (b.dims.facing !== undefined && !Number.isInteger(b.dims.facing)) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: authored facing ${JSON.stringify(b.dims.facing)} is not an integer`);
      if (b.dims.anchor !== undefined && !isXY(b.dims.anchor)) throw new KernelError('E-GEN-ROW-INVALID', {}, `building ${b.id}: authored anchor ${JSON.stringify(b.dims.anchor)} is not a position {x, y, ...}`);
      let facing = b.dims.facing;
      if (facing === undefined) {
        if (latitude === undefined) latitude = typeof ctx.latitudeDegOf === 'function' ? ctx.latitudeDegOf(centroid) : null;
        if (latitude === null) { gap(b.id, REASON.latitudeUnknown, ['facing']); continue; }
        facing = defaultFacing(grid, { intentFacing: null, culturePref: null, latitudeDeg: latitude });
      }
      const spec = specOf.get(b.id);
      let bbox;
      try { bbox = planBlueprint({ form: spec.form, planCells: spec.planCells, storeys: spec.storeys, wallThicknessM: spec.wall, facing }, ctx.blueprint).bbox; } catch (e) { throw wrapDomain(b.id, 'form', e); }
      items.push({ b, facing, bbox, anchor: b.dims.anchor === undefined ? null : b.dims.anchor });
    }
    prepared.push({ ...j, coord, items });
  }
  // 试排：所有要排的站点同一轮，排不下的一起 N 加一，直到都排得下（N 只增，父足迹格数是上界，所以必止）。
  let active = prepared.filter((j) => j.items.some((i) => i.anchor === null));
  const result = new Map();
  for (let round = 0; ; round += 1) {
    const extra = {};
    for (const [id, n] of nNow) extra[id] = { targetAreaM2: fixedToNumber(n * cellArea) };
    // 第一轮的输入就是起始 N（上面 fp0 同一份输入），直接复用，省一次全规模划分；之后 N 加一才重算。
    const fp = round === 0 ? fp0 : typeof ctx.footprints === 'function' ? ctx.footprints({ heights: false, extra }) : null;
    const failed = [];
    const kept = [];
    for (const j of active) {
      const f = fp && fp.footprints ? fp.footprints[j.siteId] : undefined;
      if (!f || !fp.probe || typeof fp.probe.cells !== 'function') { result.delete(j.siteId); gap(j.siteId, REASON.layoutFootprint, ['footprint']); continue; }
      kept.push(j);
      const S = [...fp.probe.cells(j.siteId)];
      const n = j.auto ? Number(nNow.get(j.siteId)) : S.length; // 作者定了面积（targetAreaM2、boundary）：N 取作者足迹的区格数，不加（R10-7.5）
      const input = {
        siteId: j.siteId, coord: j.coord, cellCount: n, gapCells: ctx.layoutGapCells, regionCells: S, zones: [],
        buildings: j.items.map((i) => ({ key: i.b.id, ordinal: 0, handWritten: true, facing: i.facing, bbox: i.bbox, anchor: i.anchor === null ? null : { x: i.anchor.x, y: i.anchor.y } })),
      };
      if (typeof fp.probe.surfaceStoreyAt === 'function') input.surfaceStoreyAt = (x, y) => fp.probe.surfaceStoreyAt(j.siteId, x, y);
      const r = n >= 1 ? layoutOf(grid, input) : { ok: false, reason: 'layout_site_too_small', detail: 'the site has no footprint cell' };
      if (r.ok) result.set(j.siteId, { r, w: f.w }); else failed.push({ j, r, n, parentCells: fp.footprints[j.capId] ? fp.footprints[j.capId].cellCount : null });
    }
    active = kept;
    if (failed.length === 0) break;
    for (const { j, r, n, parentCells } of failed) {
      result.delete(j.siteId);
      // 至多加到所在存量单元（沿 parent 往上第一个存量单元，勘误 1123k45）足迹的区格数；仍排不下即 E-GEN-ROW-INVALID。
      if (!j.auto || !Number.isInteger(parentCells) || n >= parentCells) {
        throw new KernelError('E-GEN-ROW-INVALID', { site: j.siteId, reason: r.reason, need_cells: n, max_cells: j.auto && Number.isInteger(parentCells) ? parentCells : n },
          `site ${j.siteId}: its buildings do not fit at N = ${n} cells (${r.reason}: ${r.detail}); ${j.auto ? 'N cannot grow past the footprint of its parent' : 'an authored footprint is never grown'} (R10-7.5, R10-7.11)`);
      }
      nNow.set(j.siteId, BigInt(n + 1));
    }
  }
  // 写偏离行：作者写了的维度不出提案（手写优先）；anchor 的 z 读不到（未知）时该栋 anchor、facing 都不写，记缺口。
  for (const j of active) {
    const res = result.get(j.siteId);
    const placed = new Map(res ? res.r.buildings.map((p) => [p.key, p]) : []);
    for (const i of j.items) {
      const dims = {};
      if (i.anchor === null) {
        const p = placed.get(i.b.id);
        if (!p || !Number.isInteger(p.anchor.z)) { gap(i.b.id, REASON.anchorZ, ['anchor']); continue; }
        dims.anchor = { w: res.w, x: p.anchor.x, y: p.anchor.y, z: p.anchor.z, coarse: false };
      }
      if (i.b.dims.facing === undefined) dims.facing = i.facing;
      if (Object.keys(dims).length > 0) proposals.push({ table: ctx.table, id: i.b.id, dims, by: ctx.stage, seedKey: seedKeyOf(i.b.id) });
    }
  }
  // 不要排位的站点（建筑的 anchor 都已写，只缺 facing）：只补 facing。
  for (const j of prepared) {
    if (j.items.some((i) => i.anchor === null)) continue;
    for (const i of j.items) if (i.b.dims.facing === undefined) proposals.push({ table: ctx.table, id: i.b.id, dims: { facing: i.facing }, by: ctx.stage, seedKey: seedKeyOf(i.b.id) });
  }
  return nNow;
}
