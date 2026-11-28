// 低阶传送法阵：谁有法阵（S2-TP1；接口稿 draft-s2-tp §2.1、§3 甲、§4；主会话 TP 裁定 Q2、Q5、Q7、Q9、Q12 与更正节）。
// 法阵＝宿主建筑（组织行 seatBuilding）上一条持有边，种类取 rules.circle.holdingKind，持有者是聚落组织，terms.circleTier 记档。互通与「使用法阵」归 TP2。
// 本地规矩是词表族 circle_rule 的一条（字段即规矩内容；规则表键与值不得为实体 id，卷六 S6-2 :325，故规矩行放词表），由组织行 circleRule 挂上，
// 沿组织 parent 链继承（只在 circleRuleOf 一处）；合法性读 rules.circle.lawGate 所指门控条目，栈空（世界 0 部法典）取条目 defaultAllow（卷八b R8b-1.8 :594）；
// 不合法视为不存在、回退上一级（Q7 甲）。有无法阵的判据只在 runOpeningCircles 读规矩 buildRX。
// 规则层不写规矩、组织、地点、建筑、设施代号；没有「已解锁、可传送」一类状态字段（卷十五 A15-15.1 :1086），法阵只是一条持有边。
import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { evaluateRX } from '../../kernel/rx.mjs';
import { ruleValue } from '../load/registry.mjs';
import { rxScopeOf, compileRuleRX } from '../load/rx-compile.mjs';
import { openHolding, holdingsOfKind } from '../social/holdings.mjs';
import { accountsOf, vocabEntry } from '../economy/ledger.mjs';
import { governorOf, settlementOrgsOf, ORG_KIND } from '../polity/govern.mjs';

/** @typedef {import('../polity/govern.mjs').PolityEngine} CircleEngine */

// 规则表 rules.circle 的键与规矩条目字段。
const CIRCLE = 'circle';
const KEY = Object.freeze({ holdingKind: 'holdingKind', lawGate: 'lawGate' });
const RULE_ROW = Object.freeze({ houseTypes: 'houseTypes', buildRX: 'buildRX', tier: 'tier', currency: 'currency' });
// 公库缺省分区（卷八 §2.6 :328 rules.polity.rolesPurposes.general）。
const POLITY = 'polity';
const PURPOSES = 'rolesPurposes';
const GENERAL = 'general';
// 组织维度（S2-TP1 新维 circleRule、seatBuilding；卷八 :128 parent）与地点用途维度（卷十九 §2.1 intendedType）。
const DIM = Object.freeze({ circleRule: 'circleRule', parent: 'parent', seatBuilding: 'seatBuilding', intendedType: 'intendedType' });
// 词表族与门控条目字段（卷八b §2 :247 gate 族）。
const FAM = Object.freeze({ rule: 'circle_rule', tier: 'circle_tier', gate: 'gate' });
const GATE = Object.freeze({ defaultAllow: 'defaultAllow' });
// 持有边 terms 里记法阵档的键（种类行 termsKeys）。
const TERMS_TIER = 'circleTier';
// buildRX 的命名空间（world/ontology/state-owners.d/travel.json rxNamespaces）：户数、公库、档行字段、规矩行字段。
const NS = Object.freeze({ houses: 'site.houses', funds: 'org.funds', tier: 'tier', rule: 'rule' });
const NS_SEP = '.';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';

/** rules.circle 的一个键。 @param {CircleEngine} engine @param {string} key */
const circleRule = (engine, key) => ruleValue(engine.docData, CIRCLE, key);

/** 规矩条目（circle_rule 族）；没有即 E-DIM-REF-MISSING（vocabEntry）。 @param {CircleEngine} engine @param {string} id @returns {Record<string, unknown>} */
const ruleRowOf = (engine, id) => Object(vocabEntry(engine, FAM.rule, id));

/**
 * 本地规矩在此是否合法（卷八b 门控，接口稿 §2.2）：读 rules.circle.lawGate 所指 gate 条目。卷八b lawGate 与法典表未建、世界 0 部法典，栈确为空，
 * 按 R8b-1.8 取条目 defaultAllow；它须是布尔，否则 E-DIM-STRUCT-FIELD（允许类门控的缺省答案必写，卷八b :247）。lawGate 落地后整体换成调它，签名不变。
 * @param {CircleEngine} engine @returns {boolean}
 */
function ruleLawful(engine) {
  const code = String(circleRule(engine, KEY.lawGate));
  const allow = Object(vocabEntry(engine, FAM.gate, code))[GATE.defaultAllow];
  if (typeof allow !== 'boolean') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${FAM.gate}.${code}.${GATE.defaultAllow} must be a boolean for an allow gate`);
  return allow;
}

/**
 * circleRuleOf：组织的生效本地规矩 id。从 orgId 起沿组织 parent 链，取第一条非空且合法的 circleRule；违法的视为不存在、继续向上（Q7 甲）；整条链都没有为 null（不取缺省行）。
 * parent 成环即 E-DIM-REF-MISSING。
 * @param {CircleEngine} engine @param {object} state @param {string} orgId @returns {string | null}
 */
export function circleRuleOf(engine, state, orgId) {
  const seen = new Set();
  let at = orgId;
  for (;;) {
    if (seen.has(at)) throw new KernelError('E-DIM-REF-MISSING', {}, `org parent cycle at ${at}`);
    seen.add(at);
    const rule = dim(engine, state, ORG_KIND, at, DIM.circleRule).value;
    if (typeof rule === 'string' && ruleLawful(engine)) {
      ruleRowOf(engine, rule);
      return rule;
    }
    const parent = dim(engine, state, ORG_KIND, at, DIM.parent).value;
    if (typeof parent !== 'string') return null;
    at = parent;
  }
}

/** 地点的用途（intendedType）；没写为 null。 @param {CircleEngine} engine @param {object} state @param {string} id @returns {unknown} */
function intendedTypeOf(engine, state, id) {
  try { return dim(engine, state, engine.bake.placeTree.kind, id, DIM.intendedType).value; } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return null;
    throw e;
  }
}

/** 组织公库缺省分区里该资源的余额合计（账本 accountsOf）。 @param {CircleEngine} engine @param {object} state @param {string} orgId @param {unknown} resource @returns {number} */
function fundsOf(engine, state, orgId, resource) {
  const general = Object(ruleValue(engine.docData, POLITY, PURPOSES))[GENERAL];
  return accountsOf(engine, state, orgId).filter((a) => a.purpose === general && a.resource === resource).reduce((s, a) => s + a.balance, 0);
}

/**
 * siteView：聚落组织的站点读数 {rule, host, houses, funds}。rule 是生效规矩（circleRuleOf）；host 是组织行 seatBuilding（空为 null）；
 * houses 是统治归本组织（governorOf）且用途落在规矩 houseTypes 里的地点数；funds 是公库缺省分区里规矩 currency 的余额。没有规矩时 houses、funds 为 null（无从算起）。
 * @param {CircleEngine} engine @param {object} state @param {string} orgId
 * @returns {Readonly<{rule: string | null, host: string | null, houses: number | null, funds: number | null}>}
 */
export function siteView(engine, state, orgId) {
  const rule = circleRuleOf(engine, state, orgId);
  const seat = dim(engine, state, ORG_KIND, orgId, DIM.seatBuilding).value;
  const host = typeof seat === 'string' ? seat : null;
  if (rule === null) return Object.freeze({ rule, host, houses: null, funds: null });
  const row = ruleRowOf(engine, rule);
  const types = row[RULE_ROW.houseTypes];
  if (!Array.isArray(types)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${FAM.rule}.${rule}.${RULE_ROW.houseTypes} must be a list`);
  let houses = 0;
  for (const id of engine.bake.placeTree.byLevel) {
    if (!types.includes(intendedTypeOf(engine, state, id))) continue;
    const g = governorOf(engine, state, id);
    if (g !== null && g.org === orgId) houses += 1;
  }
  return Object.freeze({ rule, host, houses, funds: fundsOf(engine, state, orgId, row[RULE_ROW.currency]) });
}

/** 一行的标量字段作命名空间读数（<ns>.<字段>）。 @param {string} ns @param {Record<string, unknown>} row @param {Record<string, unknown>} into */
function scalarReads(ns, row, into) {
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'string') into[`${ns}${NS_SEP}${k}`] = v;
  }
}

/**
 * 开局法阵（接在开局一步末尾，Q9 甲）：对每个聚落组织（升序）——没有生效规矩的不建（如实没有）；有规矩而 seatBuilding 为空的不建并记缺口；
 * 否则求规矩 buildRX（读 site.houses、org.funds、tier.<字段>、rule.<字段>；经共用编译入口 rules/load/rx-compile.mjs），为真即在宿主建筑上开法阵持有边，terms.circleTier 取规矩 tier。
 * 返回 {gaps}：有规矩却没写宿主建筑的组织 id。
 * @param {CircleEngine} engine @param {object} state @param {unknown} tx @returns {{gaps: string[]}}
 */
export function runOpeningCircles(engine, state, tx) {
  const kind = String(circleRule(engine, KEY.holdingKind));
  const scope = rxScopeOf({ vocab: engine.vocab, docData: engine.docData });
  /** @type {string[]} */
  const gaps = [];
  /** @type {Map<string, unknown>} */
  const trees = new Map();
  for (const org of settlementOrgsOf(engine, state)) {
    const site = siteView(engine, state, org);
    if (site.rule === null) continue;
    if (site.host === null) { gaps.push(org); continue; }
    const row = ruleRowOf(engine, site.rule);
    const tier = String(row[RULE_ROW.tier]);
    /** @type {Record<string, unknown>} */
    const reads = { [NS.houses]: site.houses, [NS.funds]: site.funds };
    scalarReads(NS.rule, row, reads);
    scalarReads(NS.tier, Object(vocabEntry(engine, FAM.tier, tier)), reads);
    if (!trees.has(site.rule)) trees.set(site.rule, compileRuleRX(scope, row[RULE_ROW.buildRX], new Map(), `${FAM.rule}.${site.rule}.${RULE_ROW.buildRX}`, 'E-MOD-RX'));
    if (evaluateRX(trees.get(site.rule), {}, reads) !== true) continue;
    openHolding(engine, state, { kind, holder: org, subject: site.host, terms: { [TERMS_TIER]: tier } }, tx);
  }
  return { gaps };
}

/**
 * circlesOf：现役法阵（法阵持有边）列表 [{holder, host, tier}]，按边序。
 * @param {CircleEngine} engine @param {object} state @returns {ReadonlyArray<Readonly<{holder: string, host: string, tier: unknown}>>}
 */
export function circlesOf(engine, state) {
  const kind = String(circleRule(engine, KEY.holdingKind));
  return Object.freeze(holdingsOfKind(engine, state, kind).map((e) => Object.freeze({ holder: e.holder, host: e.subject, tier: e.terms[TERMS_TIER] })));
}
