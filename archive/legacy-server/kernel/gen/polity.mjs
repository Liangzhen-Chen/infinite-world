// 开局政体、持有与职位阶段（卷八 R8-18.9；封卷后勘误，卷十 C10-2）：本阶段是第 0 日组织行、职位行与统治边的写者（卷十 R10-2.11）。
// 生成器只读卷十 R10-1.3 所列四样（数据表、世界种子、先行阶段已写的行、规则表），交出行提案（组织行、职位行）与调用提案（setGovernor），由写回器与调用提案应用器在世界创建事务内写入；
// 不写别卷的维度，没有抽取（所以不登记抽取点）。对每个 `R`（按 id 升序；层级须是 rules.gen.pop.cultureLevel 所指层级）：
//   ① 政体：R 有落位文化、其下有站点、且 realmRows 有一行 whenRX 为真时，建一条主权组织行（orgKind、polity 取行序最前的真行），seat 取 R 之下站点类型条目 rank 最大的站点（并列 id 最小），并按 R8-3.3 建 councilOffices 所列各种类的职位行；
//   ② 聚落与层级：R 之下每个站点（按 id 升序）建一条聚落组织行（orgKind 取 settlementKind，seat 为该站点，parent 取 ① 的主权组织），tier 取 openTiers 里 whenRX 为真的各行所指层级中 order 最大者（并列代号最小），
//      并按该层级 grantsOffices 建职位行；开局层级不求 requiresRX（它读设施计数，设施清单到经济阶段才有，读它即成环）；
//   ③ 统治边：对 ② 的每个站点交一份 setGovernor(站点, 该聚落组织)，原因取 holdCause；再对每个写了作者字段 originSite 的地点行 P：originSite 所指站点有统治边（本阶段交出的，或作者手写的，Opus 核 G5b 形制与改挂必须改第 1 条）、且 P 自身没有统治边时，同持有组织、同原因交 setGovernor(P, 持有组织)
//      （卷八封卷后勘误 1123k32：P 因种子不在旧父站点足迹内、不再在原站点的包含子树里，"属于某村"由这条统治边表达）；资格由调用提案应用器按 R8-5.3 核（kernel/title.mjs），不合格不写；
//   ④ 不写任职边（worldgen 相不为居民建行，R10-1.11）；⑤ 组织行未列出的维度取种类条目 template 所指模板行的值——生成的行写整值（卷十 R10-9.4），所以这里把模板行的值抄成整值；
//      id 由 instanceIdOf 给：主权组织以 R 为父、聚落组织以站点为父，序号都取 0；职位行以所属组织为父，序号取所建各种类行按 id 升序的位次。
// 手写优先（卷十 R10-1.7）：R 之下已有手写主权组织驻地的不做 ①，已有手写聚落组织驻地的站点不做 ②，已有统治边的站点不做 ③。
// 输入不全（落位文化、站点类型条目、开局人数在世界里还没有生产者）时不编，整阶段进 deferred 并列出缺口，同卷十水体阶段"世界还没有格空间表时划不出足迹"的处置。
// 纯函数，只读入参；不读 state、墙钟，不用 Math.*。

import { instanceIdOf, instanceDigestOf } from './ids.mjs';
import { chainOf } from './rows.mjs';
import { officeRowKinds } from '../validate/polity-tables.mjs';

// 开局政体阶段要的输入（卷八 R8-18.9）：自己经统一读入口 ctx.read 取（规则表、三张表的展平行、表头与 id 前缀）；落位文化、站点类型条目、开局人数三个读入口世界里还没有生产者，
// 由调用方经 ctx.views（opts.genViews）交入，没交即 undefined，阶段整段进 deferred 并列缺口，不编。
function polityInputs(ctx) {
  const read = ctx.read;
  const views = ctx.views;
  const polity = read.rules('polity');
  const purposes = polity.rolesPurposes;
  return {
    polityRules: { genRealmRows: polity.genRealmRows, genSettlementKind: polity.genSettlementKind, genOpenTiers: polity.genOpenTiers, genHoldCause: polity.genHoldCause, genIdSlots: polity.genIdSlots },
    classRows: new Map(Object.entries(read.classes('org'))),
    officeActualKind: (officeRowKinds(read.dims('office'), ctx.vocab.families) || {}).actual,
    cultureLevel: views.cultureLevel,
    seatCultureOf: views.seatCultureOf, cultureDimsOf: views.cultureDimsOf, siteOf: views.siteOf, sitePopOf: views.sitePopOf,
    orgRows: read.rows('org'), polityRows: read.rows('polity'), officeRows: read.rows('office'),
    orgDims: read.dims('org'), officeDims: read.dims('office'), orgIdPrefix: read.idPrefix('org'), officeIdPrefix: read.idPrefix('office'),
    treasury: purposes && typeof purposes.general === 'string' ? [purposes.general] : [],
    heldBy: new Map(views.heldBy || []), // 作者写的统治边：地点 → {org, cause}（手写优先；子站点按 originSite 连到原站点那条边的持有组织与原因）
  };
}

/** 阶段接口（A10-1.3）：登记表只认 {run(ctx)}；ctx 由 worldgen.mjs 统一给，本阶段自己取要的东西。 */
export const stage = { run: (ctx) => genPolity({ ...ctx, ...polityInputs(ctx) }) };

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const KIND = Object.freeze({ org: 'org', office: 'office' });
const FIRST = 0;

/**
 * @param {{
 *   stage: string, worldSeed: string, genesisMinute: number, vocab: any,
 *   rows: Map<string, import('./rows.mjs').GenRow>,
 *   polityRules: {genRealmRows: Array<{whenRX: string, orgKind: string, polity: string}>, genSettlementKind: string, genOpenTiers: Array<{tier: string, whenRX: string}>, genHoldCause: string, genIdSlots: {realm: string, settlement: string, office: string}},
 *   cultureLevel: string | undefined,
 *   seatCultureOf: ((regionId: string) => string | null) | undefined,
 *   cultureDimsOf: ((culture: string) => Record<string, any>) | undefined,
 *   siteOf: ((placeId: string) => {rank: number, dims: Record<string, any>} | null) | undefined,
 *   sitePopOf: ((placeId: string) => number | undefined) | undefined,
 *   classRows: Map<string, Record<string, any>>, officeActualKind: string | undefined,
 *   orgRows: Map<string, Record<string, any>>, polityRows: Map<string, Record<string, any>>, officeRows: Map<string, Record<string, any>>,
 *   orgDims: Record<string, any>, officeDims: Record<string, any>, orgIdPrefix: string, officeIdPrefix: string,
 *   treasury: string[], heldBy: Map<string, {org: string, cause: string}>,
 *   when: (text: string, dims: Record<string, any>) => boolean
 * }} ctx
 *   seatCultureOf：卷十 R10-4.2 的落位文化（gen.seatCulture，null 即该政区无人定居）；cultureDimsOf：文化行的维度（realmRows 的 whenRX 读它）；siteOf：卷五 §4.6 站点类型条目（rank 与条目字段），非站点为 null；
 *   sitePopOf：卷十 R10-3.3 的站点开局人数（genView().sitePop）；orgRows、polityRows、officeRows：三张表的展平行（模板行、政体行、职位种类目录行与手写组织行）；
 *   heldBy：作者数据里已有现役统治边的地点（手写优先）及其持有组织与原因；treasury：新建组织行的公库分区（规则表 polity.roles.purposes.general）
 * @returns {{proposals: Array<{table: string, id: string, dims: Record<string, any>, by: string, seedKey: string}>, calls: Array<{place: string, org: string, cause: string}>,
 *   deferred: Array<{id: string, reason: string, gaps: string[]}>}}
 */
export function genPolity(ctx) {
  const gaps = [];
  const need = (name, v) => { if (v === undefined || v === null) gaps.push(name); };
  need('input_gen_pop_cultureLevel', ctx.cultureLevel);
  need('input_seat_culture_reader', ctx.seatCultureOf);
  need('input_culture_row_reader', ctx.cultureDimsOf);
  need('input_site_type_reader', ctx.siteOf);
  need('input_site_pop_reader', ctx.sitePopOf);
  need('input_rules_gen_realmRows', ctx.polityRules.genRealmRows); // 未建不得顶成空表（空表会静默生成"零政体"）
  need('input_rules_gen_openTiers', ctx.polityRules.genOpenTiers);
  need('input_rules_gen_holdCause', ctx.polityRules.genHoldCause);
  need('input_rules_gen_idSlots', ctx.polityRules.genIdSlots);
  need('input_office_row_kind_actual', ctx.officeActualKind);
  need('input_rules_gen_settlementKind', ctx.polityRules.genSettlementKind);
  if (ctx.treasury.length === 0) gaps.push('input_rules_roles_purposes_general');
  // 缺输入时不建行、不抽取（行提案要落位文化、站点类型、开局人数、层级，缺了不编，卷十缺输入口径）；但 originSite 的连边（③ 后半）只读作者写的统治边与地点行的 originSite，不缺输入，照做：
  // 子站点的统治边取原站点那条边的持有组织与原因（卷八 1123k32：含作者手写的边）。
  if (gaps.length > 0) return { proposals: [], calls: originCalls(ctx.rows, new Map(ctx.heldBy)), deferred: [{ id: ctx.stage, reason: 'inputs_unbuilt_for_polity', gaps }] };

  const SLOT = ctx.polityRules.genIdSlots; // 三条位次（卷八 R8-18.9 ⑤），句柄取自规则表，不写字面量
  const proposals = [];
  const calls = [];
  const kindEntry = (code) => ctx.vocab.index.get(code).entry;
  const idOf = (slot, parent, ordinal, prefix) => instanceIdOf(ctx.vocab, ctx.worldSeed, ctx.genesisMinute, slot, parent, ordinal, prefix);
  const seedOf = (slot, parent, ordinal) => instanceDigestOf(ctx.vocab, ctx.worldSeed, ctx.genesisMinute, slot, parent, ordinal);
  const dimsOf = (id) => ctx.rows.get(id).dims;

  // 手写组织驻地：驻地在哪个地点上，种类是否主权（手写优先的判据）。
  const authoredOrgs = [...ctx.orgRows].filter(([, d]) => d.abstract !== true && typeof d.seat === 'string').map(([id, d]) => ({ id, seat: d.seat, sovereign: kindEntry(d.orgKind).sovereign === true }));

  // 站点：有站点类型条目的地点行（卷五 §4.6，规则只读条目字段）。
  const siteInfo = new Map();
  for (const id of ctx.rows.keys()) { const s = ctx.siteOf(id); if (s !== null && s !== undefined) siteInfo.set(id, s); }
  const regions = [...ctx.rows.values()].filter((r) => r.regionLevel === ctx.cultureLevel).map((r) => r.id).sort(cmp);
  const regionOfSite = new Map(); // 站点 → 它所在的落位级政区
  for (const s of siteInfo.keys()) {
    const hit = chainOf(ctx.rows, s).find((a) => regions.includes(a));
    if (hit !== undefined) regionOfSite.set(s, hit);
  }
  const jurisOf = (placeId) => { const hit = chainOf(ctx.rows, placeId).find((a) => ctx.rows.get(a).regionLevel !== null); return hit === undefined ? null : ctx.rows.get(hit).regionLevel; };

  // 按种类行新建职位行（卷八 §2.2 表后"按种类行新建职位行时"）：officeKind 指该种类行，officeRowKind 取 orowk_actual，titular、revoked 取假，domain 取 null，
  // jurisdictionLevel 取所属组织驻地所在政区的层级，其余维度取种类行的值；已有该种类（offices 里 officeKind 等于它、revoked 为假）的不重建（本阶段新建的组织 offices 开始为空，所以按种类去重即可）。
  const buildOffices = (orgId, seat, kindIds) => {
    const made = [];
    [...new Set(kindIds)].sort(cmp).forEach((k, ordinal) => {
      const kindRow = ctx.officeRows.get(k);
      const dims = {};
      for (const [dk, v] of Object.entries(kindRow)) if (isObj(ctx.officeDims[dk]) && ctx.officeDims[dk].derived === undefined) dims[dk] = v;
      Object.assign(dims, { officeKind: k, officeRowKind: ctx.officeActualKind, titular: false, revoked: false, domain: null });
      const level = jurisOf(seat);
      if (level !== null) dims.jurisdictionLevel = level;
      const id = idOf(SLOT.office, orgId, ordinal, ctx.officeIdPrefix);
      proposals.push({ table: KIND.office, id, dims, by: ctx.stage, seedKey: seedOf(SLOT.office, orgId, ordinal) });
      made.push(id);
    });
    return made;
  };

  // 组织行：未列出的维度（tenure、charter、charterRules、covert、termination 等）取种类条目 template 所指模板行的值（R8-18.9 ⑤、卷二 §1.3）：
  // 模板行是 org 表的 abstract 类别行；生成行写整值（卷十 R10-9.4，偏离行不用继承写法），所以把模板行里表头登记的、非派生的维度值抄成整值，再用 `classes` 挂上模板类别行（终止方式等公共字段经类别链取）。
  const orgRow = (orgKind, seat, parent, polity, offices, tier) => {
    const template = kindEntry(orgKind).template;
    const dims = {};
    for (const [k, v] of Object.entries(ctx.classRows.get(template) || {})) if (isObj(ctx.orgDims[k]) && ctx.orgDims[k].derived === undefined) dims[k] = structuredClone(v);
    Object.assign(dims, { classes: [template], orgKind, polity, seat, parent, offices, headOffice: null, treasury: [...ctx.treasury] });
    if (tier !== undefined) dims.tier = tier;
    return dims;
  };

  const settlementOrgs = new Map(); // 站点 → 本阶段为它建的聚落组织 id
  for (const R of regions) {
    const sites = [...siteInfo.keys()].filter((s) => regionOfSite.get(s) === R).sort(cmp);
    if (sites.length === 0) continue;
    // ① 政体
    let realmId = null;
    const culture = ctx.seatCultureOf(R);
    const handRealm = authoredOrgs.some((o) => o.sovereign && chainOf(ctx.rows, o.seat).includes(R));
    if (!handRealm && typeof culture === 'string') {
      const cdims = { ...dimsOf(R), ...ctx.cultureDimsOf(culture) };
      const row = ctx.polityRules.genRealmRows.find((r) => ctx.when(r.whenRX, cdims));
      if (row !== undefined) {
        const seat = sites.reduce((best, s) => (best === null || siteInfo.get(s).rank > siteInfo.get(best).rank ? s : best), null); // sites 已按 id 升序，严格大于才换，并列取 id 最小
        realmId = idOf(SLOT.realm, R, FIRST, ctx.orgIdPrefix);
        const council = ctx.polityRows.get(row.polity).councilOffices;
        const offices = buildOffices(realmId, seat, council);
        proposals.push({ table: KIND.org, id: realmId, dims: orgRow(row.orgKind, seat, null, row.polity, offices), by: ctx.stage, seedKey: seedOf(SLOT.realm, R, FIRST) });
      }
    }
    // ② 聚落与层级
    for (const s of sites) {
      if (authoredOrgs.some((o) => !o.sovereign && o.seat === s)) continue;
      const pop = ctx.sitePopOf(s);
      const sdims = { ...siteInfo.get(s).dims, ...(pop === undefined ? {} : { sitePop: pop }) };
      const tiers = ctx.polityRules.genOpenTiers.filter((t) => ctx.when(t.whenRX, sdims)).map((t) => t.tier);
      const tier = tiers.reduce((best, t) => (best === undefined || kindEntry(t).order > kindEntry(best).order || (kindEntry(t).order === kindEntry(best).order && t < best) ? t : best), undefined);
      const orgId = idOf(SLOT.settlement, s, FIRST, ctx.orgIdPrefix);
      const offices = tier === undefined ? [] : buildOffices(orgId, s, kindEntry(tier).grantsOffices);
      proposals.push({ table: KIND.org, id: orgId, dims: orgRow(ctx.polityRules.genSettlementKind, s, realmId, null, offices, tier), by: ctx.stage, seedKey: seedOf(SLOT.settlement, s, FIRST) });
      settlementOrgs.set(s, orgId);
    }
  }
  // ③ 统治边：站点自身，再按作者字段 originSite 连到本行（手写优先：已有统治边的地点不做）。
  const cause = ctx.polityRules.genHoldCause;
  const edges = new Map(ctx.heldBy); // 地点 → {org, cause}：作者写的统治边，再加本阶段交出的
  for (const [s, orgId] of [...settlementOrgs].sort((a, b) => cmp(a[0], b[0]))) {
    if (!edges.has(s)) { calls.push({ place: s, org: orgId, cause }); edges.set(s, { org: orgId, cause }); }
  }
  calls.push(...originCalls(ctx.rows, edges));
  return { proposals, calls, deferred: [] };
}

/** ③ 后半：每个写了作者字段 originSite 的地点 P，原站点有统治边（作者手写的，或前半交出的）且 P 自己没有时，同持有组织、同原因给 P 交一份 setGovernor（按地点 id 升序）。纯函数。 */
function originCalls(rows, edges) {
  const calls = [];
  for (const id of [...rows.keys()].sort(cmp)) {
    const origin = rows.get(id).dims.originSite;
    if (typeof origin !== 'string' || !edges.has(origin) || edges.has(id)) continue;
    const e = edges.get(origin);
    calls.push({ place: id, org: e.org, cause: e.cause });
  }
  return calls;
}
