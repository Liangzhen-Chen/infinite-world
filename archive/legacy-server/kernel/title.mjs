// 领地持有权（卷八 §4.5：R8-5.1 实际统治是一条互斥边、R8-5.2 持有资格、R8-5.3 和平取得须有资格；§3.1 `governorOf`、`holdingAllowed`，§3.2 `setGovernor`）。
// 统治边是卷十八已登记的持有种类行（规则表 rules.polity.rolesKinds.governs，持有者是组织、标的是站点或政区，exclusive 为真）；本文件不写第二套存储：
// `setGovernor` 是统治边的唯一写入口，经持有写者 openHolding 开边（exclusive 的旧边由持有写者按 R18-1.5 经"离任"格让位，统治行 vacated 取 ho_revert、授予者为空按关闭，R18-1.2 :518），
// 一处至多一条现役统治边；换边（持有组织变了）同一事务发一条"统治者变更"事件（R8-5.6、:403，载荷 {from, to, cause}，targets 取旧新两组织去掉空）。
// 不按站点类型代号、政体代号、组织 id、地点 id 分支：资格只读政体行的 holderEligibility（rx）与 landless（R8-5.2、S8-6）。
// 未落（卷文推不出现有可读数据，不自编）：holderEligibility 里读"站点类型代号""当家者信仰的解锁旗标"（卷五 §4.6 的 siteType 维度与 site 族、卷七 faithUnlocked）——
//   这两样现在世界里没有，求值只绑定组织表的维度；表达式引用别的名字时编译失败，抛编译错误，不静默按假。
// 纯读的 governorOf、holdingAllowed 不写状态；setGovernor 写在调用方已开的事务上（同 holdings.mjs）。

import { KernelError } from './errors.mjs';
import { openHolding, openHoldingsOfKind } from './holdings.mjs';
import { emit } from './events.mjs';
import { V } from './handles/generated.mjs';
import { clockView } from './scheduler.mjs';
import { relWithin } from './place.mjs';
import { dim } from './dimensions.mjs';
import { compileRXInScope, evaluateRX, rxChildren, splitDimKey, RxError } from './rx.mjs';
import { T } from './handles/markers.mjs';

const KIND = Object.freeze({ org: 'org', polity: 'polity' });
const DIM = Object.freeze({ polity: 'polity', parent: 'parent', orgKind: 'orgKind', landless: 'landless', holderEligibility: 'holderEligibility' });
const REASON = Object.freeze({ noPolity: 'hold_no_polity', landless: 'hold_landless', ineligible: 'hold_ineligible' });
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function polityRules(engine) {
  const r = isObj(engine) && isObj(engine.rules) ? engine.rules.polity : undefined;
  if (!isObj(r)) throw new KernelError('E-DIM-REF-MISSING', {}, 'rules.polity is not loaded');
  return r;
}

/** 统治边的持有种类（规则表 rules.polity.rolesKinds.governs；规则层不出现种类代号字面量，卷八 §2.6 `polity.roles.kinds`）。 */
function governsKind(engine) {
  const k = polityRules(engine).rolesKinds;
  if (!isObj(k) || typeof k.governs !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, 'rules.polity.rolesKinds.governs is missing');
  return k.governs;
}

const factValue = (f) => (isObj(f) && f.known === true && f.applicable !== false ? f.value : undefined);
const orgDim = (engine, state, orgId, key) => factValue(dim(engine, state, KIND.org, orgId, key));

// R8-3.2：组织行 `polity` 非 null 取它；null 即沿 `realm`（沿 parent 向上第一个 sovereign 种类且没有上级的组织，自己就是则取自己）取其政体行。
function polityOfOrg(engine, state, orgId) {
  const own = orgDim(engine, state, orgId, DIM.polity);
  if (typeof own === 'string') return own;
  const seen = new Set();
  for (let cur = orgId; typeof cur === 'string' && !seen.has(cur); cur = orgDim(engine, state, cur, DIM.parent)) {
    seen.add(cur);
    const kindEntry = engine.vocab.index.get(orgDim(engine, state, cur, DIM.orgKind));
    const up = orgDim(engine, state, cur, DIM.parent);
    if (kindEntry && kindEntry.entry && kindEntry.entry.sovereign === true && up === null) {
      const p = orgDim(engine, state, cur, DIM.polity);
      return typeof p === 'string' ? p : null;
    }
  }
  return null;
}

/** @type {WeakMap<object, Map<string, any>>} */
const rxCache = new WeakMap();

function compiledEligibility(engine, text) {
  let cache = rxCache.get(engine);
  if (!cache) { cache = new Map(); rxCache.set(engine, cache); }
  if (!cache.has(text)) {
    const dims = engine.tables.get(KIND.org).doc.dimensions;
    const maxDepth = engine.rules.kernelConstants.rxMaxDepth;
    cache.set(text, compileRXInScope(text, 'data', { dims: new Map(Object.entries(dims)), vocabIndex: engine.vocab.index, ns: [], maxDepth }).tree);
  }
  return cache.get(text);
}

// 读到的组织维度没有值（未知）按未命中、即假（R8-5.2 末"含没有政体可读"同处理：不为真即不允许）。
function eligibilityHolds(engine, state, orgId, text) {
  const tree = compiledEligibility(engine, text);
  const bound = {};
  const walk = (n) => {
    if (n === null || typeof n !== 'object') return;
    if (n.op === T.rx_op.dim) {
      const v = orgDim(engine, state, orgId, splitDimKey(n.key).dim);
      if (v !== undefined && v !== null) bound[n.key] = v;
    }
    rxChildren(n).forEach(walk);
  };
  walk(tree);
  try { return evaluateRX(tree, { dim: bound, clock: {} }, {}) === true; } catch (e) {
    if (e instanceof RxError && e.key !== undefined) return false;
    throw e;
  }
}

/**
 * kernelApi `holdingAllowed(engine, state, orgId, placeId)`（R8-5.2）：组织适用的政体行（R8-3.2）的 holderEligibility 为真且 landless 为假。纯读。
 * @param {any} engine @param {any} state @param {string} orgId @param {string} placeId
 * @returns {{ok: boolean, reason: string | null}} reason 是代号：没有政体可读 hold_no_polity、无地政体 hold_landless、资格不成立 hold_ineligible；ok 时为 null
 */
export function holdingAllowed(engine, state, orgId, placeId) {
  if (typeof placeId !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, 'holdingAllowed: placeId is a place id');
  const polityId = polityOfOrg(engine, state, orgId);
  if (polityId === null) return { ok: false, reason: REASON.noPolity };
  const landless = factValue(dim(engine, state, KIND.polity, polityId, DIM.landless));
  if (landless !== false) return { ok: false, reason: REASON.landless };
  const text = factValue(dim(engine, state, KIND.polity, polityId, DIM.holderEligibility));
  if (typeof text !== 'string' || !eligibilityHolds(engine, state, orgId, text)) return { ok: false, reason: REASON.ineligible };
  return { ok: true, reason: null };
}

/**
 * kernelApi `governorOf(engine, state, placeId)`（R8-5.1）：取该地点自身的统治边；没有则沿包含树向上取最近祖先的统治边；都没有即无主（返回 null）。
 * org 是该边的持有组织；`eligible` 是读时现算的 holdingAllowed(org, 该边标的)，不存（R8-5.3）；
 * `direct`：本次取到的边是否就挂在被问的地点自身上（false 即沿包含树继承来的）。卷文对 direct 的定义见回报"卷文含糊"，此为现行读法。纯读。
 * @param {any} engine @param {any} state @param {string} placeId
 * @returns {{org: string, direct: boolean, eligible: boolean, subject: string} | null}
 */
export function governorOf(engine, state, placeId) {
  const bySubject = new Map(openHoldingsOfKind(state, governsKind(engine)).map((e) => [e.subject, e]));
  const chain = relWithin(engine, state, placeId);
  for (let i = 0; i < chain.length; i += 1) {
    const e = bySubject.get(chain[i]);
    if (e !== undefined) return { org: e.holder, direct: i === 0, eligible: holdingAllowed(engine, state, e.holder, e.subject).ok, subject: e.subject };
  }
  return null;
}

/**
 * kernelApi `setGovernor(engine, state, placeId, orgId, cause)`（统治边的唯一写入口，R8-5.3）：原因代号不在 rules.polity.holdForcibleCauses 里的（和平取得）
 * 须 holdingAllowed 为真，否则拒写 E-HOLD-INELIGIBLE；在集合里的（征服、篡夺）不核资格。成功即经持有写者开一条统治边，返回边句柄。
 * @param {any} engine @param {any} state @param {string} placeId @param {string} orgId @param {string} cause 原因代号（verb 族条目）
 * @returns {string}
 */
export function setGovernor(engine, state, placeId, orgId, cause) {
  const forcible = polityRules(engine).holdForcibleCauses;
  if (!Array.isArray(forcible)) throw new KernelError('E-DIM-REF-MISSING', {}, 'rules.polity.holdForcibleCauses is missing');
  if (!forcible.includes(cause)) {
    const r = holdingAllowed(engine, state, orgId, placeId);
    if (!r.ok) throw new KernelError('E-HOLD-INELIGIBLE', { reason: r.reason }, `setGovernor(${placeId}, ${orgId}): ${r.reason}; cause ${cause} is not a forcible cause`);
  }
  // 一处至多一条现役统治边（R8-5.1）：旧边由持有写者在 openHolding 里按 R18-1.5 经"离任"格处置，本入口不自关边。
  const old = openHoldingsOfKind(state, governsKind(engine)).find((e) => e.subject === placeId);
  const edge = openHolding(engine, state, { holdingKind: governsKind(engine), holder: orgId, subject: placeId, cause });
  const from = old === undefined ? null : old.holder;
  if (from !== orgId) {
    // R8-5.6 统治者变更事件（:403）：每次更换恰一条，载荷 {from, to, cause}，targets 取旧新两组织（去掉空）；事件 id 的主体取新边句柄（同地同刻多次换边各一条）。
    emit(engine, state, {
      minute: clockView(engine, state).minute,
      verb: V.verb.verb_governor_changed,
      actor: null,
      targets: [from, orgId].filter((x) => x !== null).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)), // 事件表 A 要求 targets 按 id 升序
      primitives: [],
      cause,
      witnesses: [],
      visibility: 'private',
      payload: { from, to: orgId, cause, place: placeId }, // place 是公共载荷字段，统治者变更取该统治边的标的地点（卷八 :395）
    }, { rule: cause, subject: edge, position: 'pos.only' });
  }
  return edge;
}
