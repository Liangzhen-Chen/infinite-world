// 世界创建事务里 worldgen 相的生成补缺（卷十 §4.1.2 `generateWorld` 的最小部分，R10-1.1–1.7、R10-1.14）：
// 按 genPlan() 的次序逐阶段调生成器（生成器按条目的 generator 节点名从下面的登记表取，流程代码里没有阶段代号），提案交写回器，写回器核对后落成 generated 节偏离行。
// 已建的阶段：水体足迹补缺、自然量、高低次序投影、水体、站点面积（现只有手写建筑行缺维度的补缺，R10-7.12）；骨架、经济、文化等阶段由各自卡登记条目与生成器，不改本文件的流程。
// 作者输入（world/geo 数据卡、转换前还没进表的作者行）由调用方交入，生成器把它当作者数据读（手写优先，R10-1.7）；作者写的值与先行阶段生成的值分得开（isAuthored），
// 投影只动生成值（R10-2.18），补缺只补作者没写的维度（R10-1.7）。
// 水体与水体足迹阶段要读尚未落盘的行提案的足迹与派生量：经卷五 planFootprints（R10-1.14，S10-11 禁自算足迹划分）；世界还没有格空间表时划不出足迹，水体行进 deferred，不编。
// 水体阶段的足迹派生量取未修正的 h₀（卷十 R10-2.12 求值次序：生成水体行的下游链先按 h₀ 派生，链定后才求河床，河床不回头改链）。
// 纯函数：只读表、世界种子、作者输入与先行阶段的产出；不读 state、墙钟。输出整个世界创建的 generated 节、不进表的待转换提案、缺口清单、生成报告，由调用方写进数据副本。

import { ruleTable } from '../load/rules.mjs';
import { planFootprints, placeLatitude } from '../place.mjs';
import { blueprintRulesFrom } from '../place-building.mjs';
import { KernelError } from '../errors.mjs';
import { genPlan } from './stages.mjs';
import { buildGenRows } from './rows.mjs';
import { genFields } from './fields.mjs';
import { genOrder } from './order.mjs';
import { genWater } from './water.mjs';
import { genWaterFoot } from './waterfoot.mjs';
import { genSiteForm } from './siteform.mjs';
import { genEnvelope } from './envelope.mjs';
import { STATE } from '../grid-base.mjs';
import { makeWhen } from './when.mjs';
import { writeback, createRows } from './writeback.mjs';
import { genPolity } from './polity.mjs';
import { genOpeningAssets } from './holdings-open.mjs';
import { chainOf } from './rows.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';
import { SCHEMA as LEDGER } from '../ledger.mjs';
import { officeRowKinds } from '../validate/polity-tables.mjs';

const RULES_CODE = 'gen';
const MATERIAL_TABLE = 'material'; // 材料表（kind material）
const GRID_CODE = 'grid';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 生成器登记表：条目的 generator 节点名 → 运行函数 (ctx) => {proposals, deferred?, report?}。新阶段只在这里加一行并登记 gstage 条目（A10-1.3）。
const NODE = Object.freeze({ fields: 'gen/fields.mjs', water: 'gen/water.mjs', waterfoot: 'gen/waterfoot.mjs', order: 'gen/order.mjs', siteform: 'gen/siteform.mjs', envelope: 'gen/envelope.mjs', polity: 'gen/polity.mjs', holdings: 'gen/holdings-open.mjs' });
const RUNNERS = Object.freeze(Object.fromEntries([
  [NODE.fields, (ctx) => ({ proposals: genFields(ctx), deferred: [] })],
  [NODE.order, (ctx) => genOrder({ ...ctx, elevationDim: ctx.geo.elevationDim, downhill: ctx.geo.downhill, roleWaterbody: ctx.rules.roleWaterbody })],
  [NODE.waterfoot, (ctx) => genWaterFoot({
    ...ctx,
    waterFillRows: ctx.rules.waterFillRows,
    roleWaterbody: ctx.rules.roleWaterbody,
    footprints: () => ctx.footprints({ heights: false }),
  })],
  [NODE.water, (ctx) => genWater({
    ...ctx,
    waterRows: ctx.rules.waterRows,
    roleTract: ctx.rules.roleTract,
    roleWaterbody: ctx.rules.roleWaterbody,
    m3PerUnit: ctx.m3PerUnit,
    // 水体阶段只读水体行与存量单元行的面积、海拔（汇水、排水去处）：只对这两类行求高度，其余行（政区、站点）不逐区格求高度场。
    footprints: ctx.footprints({ bed: false, heights: (id) => { const r = ctx.rows.get(id); return r !== undefined && (r.classes.has(ctx.rules.roleWaterbody) || r.classes.has(ctx.rules.roleTract)); } }),
  })],
  [NODE.siteform, (ctx) => genSiteForm({ ...ctx, bldfillRows: ctx.rules.bldfillRows, roleFacility: ctx.rules.roleFacility, roleTract: ctx.rules.roleTract, roleWaterbody: ctx.rules.roleWaterbody, layoutCoverage: ctx.rules.layoutCoverage, layoutGapCells: ctx.rules.layoutGapCells })],
  [NODE.envelope, (ctx) => genEnvelope({ ...ctx, roleFacility: ctx.rules.roleFacility, openingCondition: ctx.rules.openingCondition, densityOf: ctx.materialDensityOf })],
  [NODE.polity, (ctx) => genPolity({ ...ctx, ...ctx.polity })],
  [NODE.holdings, (ctx) => openingAssets(ctx)],
]));

// 开局持有阶段 gstage_holdings（卷十 R10-3.9、R10-7.2 ④，卷六 :642；李白 11-24 S6-1、H-1）：对全部建筑行推开局 ownerRef，交出入账提案 assets 与缺口 assetGaps；
// 入账在世界创建事务里由 assetcalls.mjs 的 applyOpeningAssets 做（同 R8-18.9 ③ 的调用提案由 holdcalls.mjs 应用）。读先行阶段已交出的组织行（created.org，开局政体阶段建的聚落组织）、
// 统治边提案（calls 与作者手写的 heldBy）与表里的组织行（含试玩地区的村社与家户行）；规则表键 tenureModes、dwellingIntendedType（卷十 :185 住处意图，值是设施类型行 id，设施类型归入类词表，李白 11-24「家户两问1122」①）缺了即拒（E-RULES-UNREGISTERED）。
function openingAssets(ctx) {
  const g = ctx.rules;
  const need = (k) => { if (g[k] === undefined) throw new KernelError('E-RULES-UNREGISTERED', {}, `gen/holdings-open: rules.gen.${k} is needed`); return g[k]; };
  const h = ctx.holdings;
  const orgs = new Map(h.orgFlat);
  for (const [id, row] of Object.entries((ctx.created && ctx.created.org) || {})) orgs.set(id, row);
  const edges = new Map([...ctx.polity.heldBy].map(([place, e]) => [place, e.org]));
  for (const c of ctx.calls) if (!edges.has(c.place)) edges.set(c.place, c.org);
  const orgIds = [...orgs.keys()].sort(cmp);
  const entryOf = (id) => (ctx.vocab.index.get(orgs.get(id).orgKind) || { entry: {} }).entry;
  const domestic = (id) => { const t = h.orgTraits[orgs.get(id).orgKind]; return t !== undefined && t.domestic === true; };
  const buildings = [...ctx.rows.values()].filter((r) => r.kind === FOOTPRINT_KIND.building && ctx.authoredIds.has(r.id)).sort((a, b) => cmp(a.id, b.id)) // 足迹种类是建筑：挂 comp_facility 的行，或转换输入标明是建筑的行（rows.mjs buildingIds，G5b 换表前）
    .map((r) => ({ id: r.id, intendedType: r.dims.intendedType ?? null, owner: h.ownerOf ? (h.ownerOf(r.id) ?? null) : null }));
  const r = genOpeningAssets({
    buildings, dwellingType: need('dwellingIntendedType'), tenureModes: need('tenureModes'),
    placeKind: ctx.table, kindOf: (id) => (orgs.has(id) ? 'org' : h.kindOf(id)),
    holderKinds: LEDGER.holderKinds.filter((k) => !LEDGER.catalogKinds.includes(k) && !Object.hasOwn(LEDGER.subjectFlags, k)), // 账本持有人类型里的主体，去掉信仰、神祇目录与须带标记的地点
    governorOf: (p) => { for (const a of chainOf(ctx.rows, p)) if (edges.has(a)) return edges.get(a); return null; },
    placeChain: (p) => chainOf(ctx.rows, p), isSite: h.isSite,
    settlementOrgAt: (p) => { const hit = orgIds.filter((id) => orgs.get(id).seat === p && entryOf(id).settlement === true); return hit.length === 0 ? null : hit[0]; },
    tenureOf: (o) => orgs.get(o).tenure ?? null, parentOrgOf: (o) => orgs.get(o).parent ?? null,
    householdsAt: (p) => orgIds.filter((id) => orgs.get(id).seat === p && domestic(id)),
  });
  return { proposals: [], deferred: [], assets: r.entries, assetGaps: r.gaps };
}

// 开局持有阶段要的输入：表里的组织行与 orgTraits（卷十八 :239 家户判定）、实体 kind 注册表；作者写的建筑 owner（旧数据，place 表没有这一维）与站点判定（卷五 §4.6，世界里还没有生产者）由调用方经 opts.genViews 交入，没交即不用。
function holdingsInputs(world, opts) {
  const rowsOf = (kind) => { const t = world.tables.get(kind); return t ? new Map([...t.flat.rows].map(([id, r]) => [id, { ...r }])) : new Map(); };
  const views = opts.genViews || {};
  const social = world.rules.social || {};
  return {
    orgFlat: rowsOf('org'),
    orgTraits: social.orgTraits || {},
    kindOf: (id) => (world.idIndex && world.idIndex.has(id) ? world.idIndex.get(id) : null),
    ownerOf: views.ownerOf, isSite: views.siteOf instanceof Function ? (p) => Boolean(views.siteOf(p)) : undefined,
  };
}

// 开局政体阶段要的输入（卷八 R8-18.9）：规则表、三张表的展平行、表头与 id 前缀；落位文化、站点类型条目、开局人数三个读入口（卷十 R10-4.2、卷五 §4.6、卷十 R10-3.3）
// 世界里还没有生产者，由调用方经 opts.genViews 交入；没交即 undefined，阶段整段进 deferred 并列缺口，不编。
function polityInputs(world, opts) {
  const rows = (kind) => { const t = world.tables.get(kind); return t ? new Map([...t.flat.rows].map(([id, r]) => [id, { ...r }])) : new Map(); };
  const dimsOf = (kind) => { const t = world.tables.get(kind); return t ? t.doc.dimensions : {}; };
  const classesOf = (kind) => { const t = world.tables.get(kind); return t && t.doc.classes ? t.doc.classes : {}; };
  const prefixOf = (kind) => { const t = world.tables.get(kind); return t && t.doc.entity && Array.isArray(t.doc.entity.idPrefix) ? t.doc.entity.idPrefix[0] : undefined; };
  const polity = world.rules.polity || {};
  const purposes = polity.rolesPurposes;
  const views = opts.genViews || {};
  return {
    polityRules: { genRealmRows: polity.genRealmRows, genSettlementKind: polity.genSettlementKind, genOpenTiers: polity.genOpenTiers, genHoldCause: polity.genHoldCause, genIdSlots: polity.genIdSlots },
    classRows: new Map(Object.entries(classesOf('org'))),
    officeActualKind: (officeRowKinds(dimsOf('office'), world.vocab.families) || {}).actual,
    cultureLevel: views.cultureLevel,
    seatCultureOf: views.seatCultureOf, cultureDimsOf: views.cultureDimsOf, siteOf: views.siteOf, sitePopOf: views.sitePopOf,
    orgRows: rows('org'), polityRows: rows('polity'), officeRows: rows('office'),
    orgDims: dimsOf('org'), officeDims: dimsOf('office'), orgIdPrefix: prefixOf('org'), officeIdPrefix: prefixOf('office'),
    treasury: purposes && typeof purposes.general === 'string' ? [purposes.general] : [],
    heldBy: new Map(views.heldBy || []), // 作者写的统治边：地点 → {org, cause}（手写优先；子站点按 originSite 连到原站点那条边的持有组织与原因）
  };
}

/** 生成器登记表里的节点名（加载期核对 gstage 条目的 generator 用）。@returns {string[]} */
export const generatorNames = () => Object.keys(RUNNERS);

// 表的有效行：展平行并上 generated 节偏离行（flatten.mjs 已合并），再带上行自己挂的组件类。
function effectiveRows(t) {
  const out = new Map();
  for (const [id, flat] of t.flat.rows) {
    const own = (t.doc.rows && t.doc.rows[id]) || (t.doc.generated && t.doc.generated[id]) || {};
    const gen = (t.doc.generated && t.doc.generated[id]) || {};
    out.set(id, { ...flat, classes: Array.isArray(own.classes) ? own.classes : Array.isArray(gen.classes) ? gen.classes : [] });
  }
  return out;
}

/**
 * @param {any} world 加载结果（loadWorld 的返回）
 * @param {{worldSeed: string, genesisMinute: number, table?: string, geo?: {authored: Map<string, Record<string, any>>, downhill: Array<{chain: string[], dim?: string}>, elevationDim?: string, buildingIds: string[]}}} opts
 * @returns {{plan: Array<{stage: string, phase: string, scope: string}>, generated: Record<string, any>, pending: Array<{id: string, dims: Record<string, any>, by: string, seedKey: string}>, deferred: Array<{stage: string, id: string, reason: string, gaps: string[]}>, report: {projections: Array<{row: string, dim: string, from: number, to: number, end: string, by: string}>, changed: number}}}
 *   report：生成报告（高低次序投影改了哪些值，R10-2.18 ⑤；随事务返回，不进存档与 generated 节，规则层不读）
 */
export function generateFill(world, opts) {
  const table = opts.table || 'place';
  const t = world.tables.get(table);
  const geo = opts.geo || { authored: new Map(), downhill: [], buildingIds: [] };
  const plan = genPlan(world.vocab, generatorNames());
  const rules = ruleTable(world.rules, RULES_CODE);
  const dims = t.doc.dimensions;
  const unit = world.env.units.get(dims.capacityM3.unit); // 水体容量的单位（m3，勘误 1123k53）；siteform 的蓝图体积另读 L（place-building.mjs），不是这一个
  const tableIds = new Set(t.flat.rows.keys());
  const when = makeWhen(world);
  const grid = world.rules[GRID_CODE];
  // 作者写的行：表的 rows 节里有的、作者输入里有的（只在 generated 节里的行是先行阶段或骨架生成的，不是作者行）。
  const authoredIds = new Set([...Object.keys(t.doc.rows || {}), ...geo.authored.keys()]);
  let generated = {};
  const pendingById = new Map();
  const deferred = [];
  const report = { projections: [], changed: 0 };
  const polity = polityInputs(world, opts);
  const holdings = holdingsInputs(world, opts);
  const assets = []; // 开局持有阶段交出的入账提案（建筑 → 持有人），由 assetcalls.mjs 在世界创建事务内第 0 日入账
  const assetGaps = []; // 推不出归属的建筑及原因
  // 材料的固态栏密度（千克每升）：读材料表的行值。materialView 读材料维度也不套修正表（卷三乙 M-12，数值标量的有效值才走管线，density 是按物态分栏的 map、不是修正键，有效值即基值），
  // 且它要世界创建事务外才装的词表注册表（kindOf），所以这里直接读同一张表的行值，与 materialView(...).dims.density 同值（测试对照）；读不到为 undefined，由用料阶段报错。
  const materialTable = world.tables.get(MATERIAL_TABLE);
  const materialDensityOf = (code) => {
    const row = materialTable && materialTable.flat && materialTable.flat.rows instanceof Map ? materialTable.flat.rows.get(code) : undefined;
    const byState = row ? row.density : undefined;
    return byState !== null && typeof byState === 'object' ? byState[STATE.solid] : undefined;
  };
  let created = {}; // 阶段新建的行（别的表的整行，R10-1.2 建行写回）：表代号 → {id: 整行}
  const calls = []; // 阶段交出的调用提案（卷八 R8-18.9 ③ setGovernor），由 holdcalls.mjs 在世界创建事务内应用
  // 该行该维度的值是作者写的：表里有这个维度的值而 generated 节没有（展平行已并上偏离行，所以要看偏离行），或作者输入里有；本次世界创建里先行阶段刚生成的值不是作者值。
  const isAuthored = (id, dim) => {
    const flat = t.flat.rows.get(id);
    const g = (t.doc.generated && t.doc.generated[id]) || {};
    const mine = generated[id] || {};
    if (flat && flat[dim] !== undefined && g[dim] === undefined && mine[dim] === undefined) return true;
    const a = geo.authored.get(id);
    const pend = pendingById.get(id);
    return a !== undefined && a[dim] !== undefined && mine[dim] === undefined && !(pend && pend.generatedDims.has(dim));
  };
  for (const step of plan) {
    const run = RUNNERS[world.vocab.index.get(step.stage).entry.generator];
    // 先行阶段的产出对本阶段可见：偏离行并进有效行、待转换的行并进作者输入层（R10-1.2 后行阶段可读先行阶段暂存的行提案）。
    const effective = effectiveRows(t);
    for (const [id, row] of Object.entries(generated)) effective.set(id, { ...(effective.get(id) || {}), ...row });
    const earlier = new Map(geo.authored);
    for (const [id, p] of pendingById) earlier.set(id, { ...(earlier.get(id) || {}), ...p.dims });
    const rows = buildGenRows(effective, world.vocab, { authored: earlier, buildingIds: geo.buildingIds });
    const entry = world.vocab.index.get(step.stage).entry;
    const result = run({
      table, stage: step.stage, worldSeed: opts.worldSeed, genesisMinute: opts.genesisMinute, vocab: world.vocab, rows, dims, rules, geo,
      m3PerUnit: unit ? unit.si : undefined,
      authoredIds, isAuthored, when, polity, materialDensityOf, holdings, created, calls,
      gridSpaceCount: Array.isArray(t.doc.gridSpaces) ? t.doc.gridSpaces.length : 0, // 格空间表的行数；0 即世界还没有格空间，划不出足迹
      regionCellM: grid && typeof grid.regionCellM === 'number' ? grid.regionCellM : undefined,
      blueprint: blueprintRulesFrom(world.rules, world.env.units),
      // o.extra：本次调用另加的行提案（id → 维度；站点面积阶段试排时给站点试写的 targetAreaM2，R10-7.5），叠在先行阶段已生成的偏离行之上，不进 generated。
      footprints: (o = {}) => {
        const base = {};
        for (const [id, r] of rows) base[id] = r.dims;
        const proposals = {};
        for (const [id, row] of Object.entries(generated)) proposals[id] = row;
        for (const [id, row] of Object.entries(o.extra || {})) proposals[id] = { ...(proposals[id] || {}), ...row };
        const fp = planFootprints({ ...world, template: { seed: opts.worldSeed } }, { base, proposals, withCells: false, bed: o.bed, heights: o.heights });
        return { footprints: fp.footprints, adjacency: fp.adjacency, probe: fp.probe };
      },
      // 站点的纬度（卷二十 §2.7 latitudeDeg，place 派生的唯一读法 placeLatitude）：落位补朝向时"面向赤道"要它（卷十九 §4.5 规则 11）。
      latitudeDegOf: (centroid) => placeLatitude(world, { dims: { centroid: centroid === undefined ? { known: false } : { known: true, value: centroid } } }),
    });
    // 提案按表分：本表的是补缺（writeback），别的表的是建行（createRows，阶段须在 writesKinds 里声明那张表，R10-9.9）。
    const own = result.proposals.filter((p) => p.table === table);
    const done = entry.writesKinds.includes(table) || own.length > 0
      ? writeback({ table, stage: step.stage, stageEntry: entry, proposals: own, rows, tableIds, dims, env: world.env, genesisMinute: opts.genesisMinute, generated, isAuthored })
      : { generated, pending: [] };
    generated = done.generated;
    for (const other of [...new Set(result.proposals.map((p) => p.table).filter((t) => t !== table))].sort(cmp)) {
      const ot = world.tables.get(other);
      if (!ot) throw new KernelError('E-GEN-ROW-INVALID', {}, `stage ${step.stage}: proposal table ${other} is not a loaded table`);
      created = { ...created, [other]: createRows({ table: other, stage: step.stage, stageEntry: entry, proposals: result.proposals.filter((p) => p.table === other), tableIds: new Set(ot.flat.rows.keys()), authoredIds: new Set(), classIds: new Set(Object.keys(ot.doc.classes || {})), dims: ot.doc.dimensions, env: world.env, genesisMinute: opts.genesisMinute, created: created[other] || {} }) };
    }
    calls.push(...(result.calls || []));
    assets.push(...(result.assets || []));
    assetGaps.push(...(result.assetGaps || []));
    // 同一待转换行被两个阶段补时记先写的阶段与键（与偏离行同一口径，R10-1.2），维度合并；改写（revise）只许改先行阶段已生成的维度。
    for (const p of done.pending) {
      const prev = pendingById.get(p.id);
      if (p.revise === true) {
        for (const dim of Object.keys(p.dims)) {
          if (!prev || !prev.generatedDims.has(dim)) throw new KernelError('E-GEN-ROW-INVALID', {}, `proposal ${p.id}: ${dim} has no generated value to revise (a projection only moves generated values)`);
        }
      }
      const generatedDims = new Set([...(prev ? prev.generatedDims : []), ...Object.keys(p.dims)]);
      pendingById.set(p.id, prev ? { ...prev, dims: { ...prev.dims, ...p.dims }, generatedDims } : { id: p.id, dims: p.dims, by: p.by, seedKey: p.seedKey, generatedDims });
    }
    for (const d of result.deferred || []) deferred.push({ stage: step.stage, ...d });
    if (result.report) { report.projections.push(...result.report.projections); report.changed += result.report.changed; }
  }
  const pending = [...pendingById.values()].map(({ generatedDims, ...p }) => p).sort((a, b) => cmp(a.id, b.id));
  return { plan, generated, created, calls, assets, assetGaps, pending, deferred, report };
}
