// 统治边（S2-TP1；卷八 §4.5 R8-5.1 :773、R8-5.3 :775，§3 :474 governorOf、:510 setGovernor，R8-18.9 ③ :1267 开局统治边）。
// 统治边种类取 rules.polity.rolesKinds.governs，开局原因取 rules.polity.genHoldCause，强取原因集合取 rules.polity.holdForcibleCauses；规则层不写种类、动词、组织、地点代号。
// 边的读写只经 rules/social/holdings.mjs 的 openHolding、holdersOf；排他（一处至多一条现役统治边）由种类行 exclusive 在 openHolding 里判，本文件不另判。
// 换统治边的实现只改本文件；聚落组织的判据（orgkind 条目 settlement 为真）只在 settlementOrgsOf 一处。
import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { openHolding, holdersOf } from '../social/holdings.mjs';
import { vocabEntry } from '../economy/ledger.mjs';

/** 本域读的 engine 字段：账本与持有写者要的（LedgerEngine）加烘焙层地点树。 @typedef {import('../economy/ledger.mjs').LedgerEngine & {bake: {placeTree: {kind: string, byLevel: readonly string[], ancestorsOf: (id: string) => readonly string[]}}}} PolityEngine */

// 规则表代号与键（卷八 §2.6 :326、:342、:378）。
const POLITY = 'polity';
const RULE = Object.freeze({ rolesKinds: 'rolesKinds', forcible: 'holdForcibleCauses', holdCause: 'genHoldCause' });
const ROLE_GOVERNS = 'governs';
// 组织表的 kind（卷八 §2.1 组织维度表 world/ontology/dimensions/org.json）与本文件读的组织维度、地点维度。
export const ORG_KIND = 'org';
const DIM = Object.freeze({ orgKind: 'orgKind', seat: 'seat', originSite: 'originSite' });
// 组织种类条目（orgkind 族，卷八 §2.4）里「是聚落组织」的字段。
const ORGKIND_FAMILY = 'orgkind';
const SETTLEMENT_FIELD = 'settlement';
const VERB_FAMILY = 'verb';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
// 未建去处（未建数据门：拒收并写明等哪张卡）。
const UNBUILT_ELIGIBILITY = '卷八 holdingAllowed 持有资格卡（R8-5.3：和平取得的原因须核资格）';

/** 统治边种类代号（rules.polity.rolesKinds.governs）。 @param {PolityEngine} engine @returns {string} */
function governsKind(engine) {
  return String(Object(ruleValue(engine.docData, POLITY, RULE.rolesKinds))[ROLE_GOVERNS]);
}

/** 组织表全部行 id（升序）。本卡各开局步骤遍历组织只经这里。 @param {PolityEngine} engine @returns {string[]} */
export function orgIdsOf(engine) {
  const doc = engine.registry.tables.get(ORG_KIND);
  return Object.keys(Object(Object(doc).rows)).sort();
}

/**
 * 聚落组织（卷八 R8-18.9 ②：每个站点一条聚落组织行）：组织行 orgKind 所指 orgkind 条目 settlement 为真的组织 id（升序）。
 * @param {PolityEngine} engine @param {object} state @returns {string[]}
 */
export function settlementOrgsOf(engine, state) {
  return orgIdsOf(engine).filter((id) => Object(vocabEntry(engine, ORGKIND_FAMILY, dim(engine, state, ORG_KIND, id, DIM.orgKind).value))[SETTLEMENT_FIELD] === true);
}

/**
 * governorOf（卷八 :474、R8-5.1）：先取该地点自身的统治边，没有则沿包含树（烘焙层 placeTree.ancestorsOf）向上取最近祖先的；都没有为 null（无主）。
 * 返回 {org, direct, eligible}：org 是该边持有组织；direct 为真指边挂在被问地点自身；eligible 读 holdingAllowed，该入口未建，取 null（如实未知）。
 * @param {PolityEngine} engine @param {object} state @param {string} placeId
 * @returns {Readonly<{org: string, direct: boolean, eligible: null}> | null}
 */
export function governorOf(engine, state, placeId) {
  const kind = governsKind(engine);
  const chain = [placeId, ...engine.bake.placeTree.ancestorsOf(placeId)];
  for (const at of chain) {
    const edges = holdersOf(engine, state, at, kind);
    if (edges.length > 0) return Object.freeze({ org: edges[0].holder, direct: at === placeId, eligible: null });
  }
  return null;
}

/**
 * setGovernor（卷八 :510，统治边的唯一写入口）：给 placeId 开一条 orgId 持有的统治边，返回边 id。
 * causeHandle 须是 verb 族条目；在 rules.polity.holdForcibleCauses 里（强取）不核资格（R8-5.3）；是开局原因 rules.polity.genHoldCause 的，
 * 由开局生成按 R8-18.9 ③ 交出，资格由生成判据成立；其余原因须过 holdingAllowed，该入口未建即拒（E-ACT-WRITER-NOT-READY）。
 * 该地点已有现役统治边时由种类行 exclusive 让旧边按「离任」格处置（openHolding）；那一格未建即整笔拒，不会出现两条现役统治边。
 * @param {PolityEngine} engine @param {object} state @param {string} placeId @param {string} orgId @param {string} causeHandle @param {unknown} tx
 * @returns {string}
 */
export function setGovernor(engine, state, placeId, orgId, causeHandle, tx) {
  vocabEntry(engine, VERB_FAMILY, causeHandle);
  const forcible = ruleValue(engine.docData, POLITY, RULE.forcible);
  const opening = ruleValue(engine.docData, POLITY, RULE.holdCause);
  if (!(Array.isArray(forcible) && forcible.includes(causeHandle)) && causeHandle !== opening) {
    throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `setGovernor ${placeId} -> ${orgId}: cause ${causeHandle} needs holdingAllowed, wait for ${UNBUILT_ELIGIBILITY}`);
  }
  return openHolding(engine, state, { kind: governsKind(engine), holder: orgId, subject: placeId }, tx);
}

/**
 * 地点的原属站点（originSite，place.json 作者字段，只给开局生成读）；读不到或为空即 null。
 * @param {PolityEngine} engine @param {object} state @param {string} placeId @returns {string | null}
 */
function originSiteOf(engine, state, placeId) {
  try {
    const v = dim(engine, state, engine.bake.placeTree.kind, placeId, DIM.originSite).value;
    return typeof v === 'string' ? v : null;
  } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return null;
    throw e;
  }
}

/**
 * 站点的持有者（R8-18.9 ③）：站点自身统治边的持有组织；自身没有而它也写了原属站点的，取原属站点的持有者（逐级，成环即 E-DIM-REF-MISSING）；都没有为 null。
 * @param {PolityEngine} engine @param {object} state @param {string} site @returns {string | null}
 */
function siteHolderOf(engine, state, site) {
  const kind = governsKind(engine);
  const seen = new Set();
  let at = site;
  for (;;) {
    if (seen.has(at)) throw new KernelError('E-DIM-REF-MISSING', {}, `originSite cycle at ${at}`);
    seen.add(at);
    const edges = holdersOf(engine, state, at, kind);
    if (edges.length > 0) return edges[0].holder;
    const next = originSiteOf(engine, state, at);
    if (next === null) return null;
    at = next;
  }
}

/**
 * 开局统治边（卷八 R8-18.9 ③；接在开局一步末尾，主会话 TP 裁定 Q9 甲）：
 * 每个聚落组织在其驻地开统治边（原因 genHoldCause）；再对烘焙层树上每个自身没有统治边、写了原属站点的地点，给原属站点的持有者开统治边。
 * 原属站点无主的地点不开边（如实无主）。返回 {unowned}：写了原属站点却找不到持有者的地点 id（按 byLevel 序）。
 * @param {PolityEngine} engine @param {object} state @param {unknown} tx @returns {{unowned: string[]}}
 */
export function runOpeningGovern(engine, state, tx) {
  const cause = String(ruleValue(engine.docData, POLITY, RULE.holdCause));
  for (const org of settlementOrgsOf(engine, state)) {
    setGovernor(engine, state, String(dim(engine, state, ORG_KIND, org, DIM.seat).value), org, cause, tx);
  }
  const kind = governsKind(engine);
  /** @type {string[]} */
  const unowned = [];
  for (const id of engine.bake.placeTree.byLevel) {
    const site = originSiteOf(engine, state, id);
    if (site === null || holdersOf(engine, state, id, kind).length > 0) continue;
    const holder = siteHolderOf(engine, state, site);
    if (holder === null) unowned.push(id);
    else setGovernor(engine, state, id, holder, cause, tx);
  }
  return { unowned };
}
