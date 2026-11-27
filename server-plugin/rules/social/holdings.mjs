// 持有写者（卷十八 §4.1 持有种类表与两条转移协议、R18-1.1–1.5、1.10、1.11；卷二 :550 写者、:721 holdings.*.*；S2-H 草案 §3）。
// 边存 holdings.<持有者>（struct:holderHoldings：边 id → struct:holding），边 id = rules.social.edgePrefix + holdingCounters.edgeNext；
// 按标的、按种类、按边 id 的反查是 stateMemo 派生索引（不进 saveDigest，随 holdings 写入失效、可从空重建）。状态只经 readPath / writePath / matchPaths 加 P 句柄读写。
// 一切按种类行字段与 rules.social 数据判：不认任何种类、物品或组件类代号；处置按行上「协议甲」三格的取值查表分派（BY_DISPOSITION）。
// 本卡未建的能力（同意、关系、存续条件、准入、候补顺序等）走未建数据门 E-ACT-WRITER-NOT-READY，写明等哪张卡。换持有实现只改 rules/social/*。
import { KernelError } from '../../kernel/errors.mjs';
import { GRAMMAR_TOKENS } from '../../kernel/handles.mjs';
import { readPath, writePath, matchPaths, kindOfEntity } from '../../kernel/storage.mjs';
import { txEmit } from '../../kernel/transaction.mjs';
import { stateMemo } from '../../kernel/memo.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { clone } from '../../kernel/bytes.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { registerPrimitiveWriter } from '../load/primitive-writers.mjs';
import { registerTerminationCleanup } from '../lifecycle/terminate.mjs';

// 规则表登记代号与键（world/rules/registry.json social）。
export const SOCIAL = 'social';
export const RULE = Object.freeze({ endKinds: 'endKinds', edgePrefix: 'edgePrefix', events: 'events', primitiveOps: 'primitiveOps' });
// 持有种类所在词表族（卷十八 §2.6）。
export const KIND_FAMILY = 'holding_kind';
// 种类行里本写者读的字段（卷十八 §2.6、§4.1.1）；holding-check.mjs 据此核 E-HK-ROW-FIELDS。
export const ROW = Object.freeze({
  from: 'from', to: 'to', exclusive: 'exclusive', gone: 'gone', vacated: 'vacated', defected: 'defected', subjectEnd: 'subjectEnd',
  concluded: 'concluded', carriesRel: 'carriesRel', intimate: 'intimate', holdWhile: 'holdWhile', admission: 'admission',
  holderMax: 'holderMax', capacityKey: 'capacityKey', incompatible: 'incompatible', termsKeys: 'termsKeys', grantedBy: 'grantedBy',
  succeedBy: 'succeedBy', domicile: 'domicile', uniqueTriple: 'uniqueTriple',
});
// 协议甲的三种触发（卷十八 R18-1.2：终止、离任、脱离，各读种类行同名一格）。
export const TRIGGER = Object.freeze({ gone: ROW.gone, vacated: ROW.vacated, defected: ROW.defected });
// terms 公共键（卷十八 §4.1.1 :461 struct:holding_terms）。
const TERMS = Object.freeze({ since: 'since', until: 'until', endReason: 'endReason', suspended: 'suspended', consentAct: 'consentAct', grantor: 'grantor' });
// succeedBy 取「按授予者指定」的值（卷十八 R18-1.8；succession_source 枚举）：写入时 terms.grantor 必填（E-HK-SUCCEED-SOURCE）。
const SUCCEED_GRANTOR = 'grantor';
// 产物引用、按边 id 关边、按三元关边的参数名（world/ontology/primitives.json holding.close / transfer 的 oneOf）。
const PARAM = Object.freeze({ holding: 'holding', id: 'id', kind: 'holdingKind', holder: 'holder', subject: 'subject', newHolder: 'newHolder', terms: 'terms' });
// 本卡未建能力的去处（未建数据门：拒收并写明等哪张卡）。
const UNBUILT = Object.freeze({
  concluded: '卷九同意条款卡（concluded 为真的种类只能由带同意条款的动作成立，卷十八 R18-1.5；S2-H 主会话 Q8 乙）',
  relation: '卷十八关系写者卡（carriesRel、intimate 为真的边经 writeRelation，卷十八 :389、R18-1.6；S2-H 主会话 Q9 甲）',
  holdWhile: '卷十三手持存续条件卡（holdWhile 成组求值与重算，卷十八 R18-1.12）',
  admission: '准入入口卡（卷十八 R18-1.13 admission）',
  endKind: '端类型所指实体表的建表卡（rules.social.endKinds 未映射该端类型）',
  triple: '三元定位卡（uniqueTriple 为真的种类才许按三元关边，卷十八 R18-1.13 ②）',
});
// 协议甲处置「不动」（卷十八 R18-1.2：持有者终止时不得取它，holding-check.mjs 核）。
export const STAY = 'ho_stay';
// 协议甲处置格里本卡未建的取值（S2-H 主会话 Q9 甲：走到才拒）。
const UNBUILT_DISPOSITION = Object.freeze({
  ho_succeed: '卷十八候补顺序卡（succeedBy 顺序提供入口，R18-1.8）',
  ho_vacate: '卷八职位卡（空出职位）',
  ho_revert: '卷十八授予者卡（回到授予者，R18-1.2）',
  ho_retain_disputed: '卷八b 实控与主张卡（保留实控并立主张）',
});

/** @typedef {import('../economy/ledger.mjs').LedgerEngine} SocialEngine */
/** 世界状态（只经 readPath / writePath 读写，本文件不看它的形状）。 @typedef {object} SocialState */
/** 一条边（struct:holding，另带边 id）。 @typedef {Readonly<{id: string, kind: string, holder: string, subject: string, terms: Readonly<Record<string, unknown>>, grantedBy: string | null}>} Edge */
/** 种类行（字段按名读）。 @typedef {Record<string, unknown>} KindRow */

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** 行上的列表字段（不是数组即空表）。 @param {unknown} v @returns {unknown[]} */
const listOf = (v) => (Array.isArray(v) ? v : []);
const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);
const notReady = (/** @type {string} */ what, /** @type {string} */ card) => new KernelError('E-ACT-WRITER-NOT-READY', {}, `${what}: not built yet, wait for ${card}`);

/** rules.social 的一个键。 @param {SocialEngine} engine @param {string} key @returns {unknown} */
function rule(engine, key) {
  return ruleValue(engine.docData, SOCIAL, key);
}

/**
 * 持有种类行（卷十八 R18-1.1：每条边的种类必须在表里）；不在即 E-HK-UNREGISTERED。
 * @param {SocialEngine} engine @param {unknown} kind @returns {KindRow}
 */
export function kindRow(engine, kind) {
  const entries = Object(Object(Object(Object(engine.vocab).families)[KIND_FAMILY]).entries);
  if (typeof kind !== 'string' || !Object.hasOwn(entries, kind)) throw new KernelError('E-HK-UNREGISTERED', {}, `${JSON.stringify(kind)}: not a ${KIND_FAMILY} entry`);
  return Object(entries[kind]);
}

/** 顶层键 holdings 的名字（取自路径句柄，不写字面）。 @param {SocialEngine} engine @returns {string} */
const topKey = (engine) => engine.P.holdings(GRAMMAR_TOKENS.wildcard).segs[0];

/**
 * 派生索引（stateMemo，依赖顶层键 holdings）：边 id → 边、标的 → 边、种类 → 边、持有者 → 边，各表内按边 id 排序，冻结。
 * 声明表没登记 holdings（engine.P 无该成员）即无边可写，返回空索引。
 * @param {SocialEngine} engine @param {SocialState} state
 * @returns {{byId: ReadonlyMap<string, Edge>, byHolder: ReadonlyMap<string, readonly Edge[]>, bySubject: ReadonlyMap<string, readonly Edge[]>, byKind: ReadonlyMap<string, readonly Edge[]>}}
 */
function edgeIndex(engine, state) {
  const build = () => {
    /** @type {Map<string, Edge>} */
    const byId = new Map();
    /** @type {Map<string, Edge[]>} */
    const byHolder = new Map();
    /** @type {Map<string, Edge[]>} */
    const bySubject = new Map();
    /** @type {Map<string, Edge[]>} */
    const byKind = new Map();
    const push = (/** @type {Map<string, Edge[]>} */ m, /** @type {string} */ k, /** @type {Edge} */ e) => { const l = m.get(k); if (l) l.push(e); else m.set(k, [e]); };
    if (Object.hasOwn(engine.P, 'holdings')) {
      for (const m of matchPaths(engine, state, engine.P.holdings(GRAMMAR_TOKENS.wildcard).pattern, {})) {
        const book = Object(m.value);
        for (const id of Object.keys(book).sort(cmp)) {
          const v = Object(book[id]);
          /** @type {Edge} */
          const e = Object.freeze({ id, kind: String(v.kind), holder: String(v.holder), subject: String(v.subject), terms: Object.freeze({ ...Object(v.terms) }), grantedBy: v.grantedBy === undefined ? null : v.grantedBy });
          byId.set(id, e);
          push(byHolder, e.holder, e);
          push(bySubject, e.subject, e);
          push(byKind, e.kind, e);
        }
      }
    }
    for (const m of [byHolder, bySubject, byKind]) for (const l of m.values()) l.sort((a, b) => cmp(a.id, b.id));
    return Object.freeze({ byId, byHolder, bySubject, byKind });
  };
  if (!Object.hasOwn(engine.P, 'holdings')) return build();
  return stateMemo(state, engine, ['rules/social/holdings.mjs#edgeIndex'], build, [[topKey(engine)]]);
}

const pick = (/** @type {readonly Edge[] | undefined} */ l, /** @type {string | undefined} */ kind) => Object.freeze((l || []).filter((e) => kind === undefined || e.kind === kind));

/**
 * kernelApi holdingsOf：持有者名下的现役边（可按种类筛），按边 id 排序，冻结。只读。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} holderId @param {string} [kind] @returns {readonly Edge[]}
 */
export function holdingsOf(engine, state, holderId, kind) {
  return pick(edgeIndex(engine, state).byHolder.get(holderId), kind);
}

/**
 * kernelApi holdersOf：以 subjectId 为标的的现役边（可按种类筛），按边 id 排序，冻结。只读。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} subjectId @param {string} [kind] @returns {readonly Edge[]}
 */
export function holdersOf(engine, state, subjectId, kind) {
  return pick(edgeIndex(engine, state).bySubject.get(subjectId), kind);
}

/**
 * kernelApi holdingsOfKind：某种类的全部现役边，按边 id 排序，冻结。只读（control.mjs 列受控实体用）。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} kind @returns {readonly Edge[]}
 */
export function holdingsOfKind(engine, state, kind) {
  return pick(edgeIndex(engine, state).byKind.get(kind), undefined);
}

/** 按边 id 取现役边；没有即 E-DIM-REF-MISSING。 @param {SocialEngine} engine @param {SocialState} state @param {unknown} edgeId @returns {Edge} */
function edgeOf(engine, state, edgeId) {
  const e = typeof edgeId === 'string' ? edgeIndex(engine, state).byId.get(edgeId) : undefined;
  if (e === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `holding ${JSON.stringify(edgeId)}: no such active edge`);
  return e;
}

/**
 * 端类型核对（卷十八 §4.1.1 :455，E-HK-END-TYPE）：该端实体的表落在种类行 field（from 或 to）所列端类型经 rules.social.endKinds 映射的表之内；
 * 落不进而该行有未映射的端类型即未建数据门（S2-H 主会话 Q3 甲）。实体不在即 kindOfEntity 照抛。
 * @param {SocialEngine} engine @param {SocialState} state @param {KindRow} row @param {string} kindCode @param {string} field @param {unknown} id
 */
function checkEnd(engine, state, row, kindCode, field, id) {
  if (typeof id !== 'string' || id.length === 0) throw new KernelError('E-EFF-PARAM', {}, `${kindCode}.${field}: end must be an entity id`);
  const kind = kindOfEntity(engine, state, id);
  const map = Object(rule(engine, RULE.endKinds));
  const types = listOf(row[field]);
  if (types.some((t) => typeof t === 'string' && Object.hasOwn(map, t) && listOf(map[t]).includes(kind))) return;
  const unmapped = types.filter((t) => typeof t !== 'string' || !Object.hasOwn(map, t));
  if (unmapped.length > 0) throw notReady(`${kindCode}.${field} ${unmapped.join(',')} for ${kind} ${id}`, UNBUILT.endKind);
  throw new KernelError('E-HK-END-TYPE', {}, `${kindCode}.${field}: ${kind} ${id} is not one of ${types.join(',')}`);
}

/**
 * 开边门槛（卷十八 R18-1.5、1.6、1.12、1.13；S2-H 主会话 Q8 乙、Q9 甲）：concluded、carriesRel、intimate 为真，holdWhile、admission 非空的种类整类开边即拒（未建数据门）。
 * @param {KindRow} row @param {string} kind
 */
function gateOpen(row, kind) {
  if (row[ROW.concluded] === true) throw notReady(`${kind}: concluded`, UNBUILT.concluded);
  if (row[ROW.carriesRel] === true || row[ROW.intimate] === true) throw notReady(`${kind}: relation edge`, UNBUILT.relation);
  if (row[ROW.holdWhile] !== null) throw notReady(`${kind}: holdWhile`, UNBUILT.holdWhile);
  if (row[ROW.admission] !== null) throw notReady(`${kind}: admission`, UNBUILT.admission);
}

/**
 * 新边的 terms（卷十八 §4.1.1 :461）：公共键 since 取当刻、until 与 endReason、consentAct 空、suspended 假、grantor 取给的或空；
 * 调用方另给的键只许种类行 termsKeys 所列（外加 grantor），否则 E-EFF-PARAM；种类行 grantedBy 非空或 succeedBy 取授予者而 grantor 为空即 E-HK-SUCCEED-SOURCE。
 * @param {SocialEngine} engine @param {SocialState} state @param {KindRow} row @param {string} kind @param {unknown} given @returns {Record<string, unknown>}
 */
function newTerms(engine, state, row, kind, given) {
  const g = given === undefined ? {} : given;
  if (!isObj(g)) throw new KernelError('E-EFF-PARAM', {}, `${kind}: terms must be a plain object`);
  const keys = listOf(row[ROW.termsKeys]);
  for (const k of Object.keys(Object(g))) if (k !== TERMS.grantor && !keys.includes(k)) throw new KernelError('E-EFF-PARAM', {}, `${kind}: terms key ${k} is not in termsKeys`);
  const grantor = Object.hasOwn(Object(g), TERMS.grantor) ? Object(g)[TERMS.grantor] : null;
  const needsGrantor = listOf(row[ROW.grantedBy]).length > 0 || row[ROW.succeedBy] === SUCCEED_GRANTOR;
  if (needsGrantor && (typeof grantor !== 'string' || grantor.length === 0)) throw new KernelError('E-HK-SUCCEED-SOURCE', {}, `${kind}: terms.grantor is required`);
  return { ...clone(Object(g)), [TERMS.since]: clockMinute(engine, state), [TERMS.until]: null, [TERMS.endReason]: null, [TERMS.suspended]: false, [TERMS.consentAct]: null, [TERMS.grantor]: grantor };
}

/**
 * 持有变化事件（卷十八 R18-1.11；targets 照卷十八:222）与常住变化事件（R18-1.10，种类行 domicile 为真才发）。动词与 change 取值取 rules.social.events。
 * @param {SocialEngine} engine @param {SocialState} state @param {Edge} edge @param {string} change events.change 的键 @param {string | null} prevHolder @param {unknown} tx
 */
function emitChange(engine, state, edge, change, prevHolder, tx) {
  const ev = Object(rule(engine, RULE.events));
  const at = clockMinute(engine, state);
  // targets 取 [subject]（卷十八:222 持有变化行）。
  const targets = [edge.subject];
  txEmit(tx, { verb: ev.verb, payload: { edge: edge.id, kind: edge.kind, holder: edge.holder, subject: edge.subject, change: Object(ev.change)[change], prevHolder, at }, targets });
}

/** 常住变化事件（R18-1.10）：建立时 until 取边上预定值，结束时取实际结束时刻。 @param {SocialEngine} engine @param {SocialState} state @param {Edge} edge @param {boolean} ending @param {unknown} tx */
function emitDomicile(engine, state, edge, ending, tx) {
  if (kindRow(engine, edge.kind)[ROW.domicile] !== true) return;
  const ev = Object(rule(engine, RULE.events));
  const until = ending ? clockMinute(engine, state) : edge.terms[TERMS.until];
  txEmit(tx, { verb: ev.domicileVerb, payload: { person: edge.holder, place: edge.subject, since: edge.terms[TERMS.since], until: until === undefined ? null : until }, targets: [...new Set([edge.holder, edge.subject])].sort(cmp) });
}

/**
 * 写一条新边（不发事件、不做核对）：边 id = edgePrefix + holdingCounters.edgeNext（只增不回收，计数器未写过即从 0 起），并进持有者名下。
 * @param {SocialEngine} engine @param {SocialState} state @param {{kind: string, holder: string, subject: string, terms: Record<string, unknown>}} e @param {unknown} tx @returns {Edge}
 */
function writeEdge(engine, state, e, tx) {
  const { P } = engine;
  const cur = readPath(state, P.holdingCounters_edgeNext());
  const n = cur === undefined ? 0 : Number(cur);
  writePath(state, P.holdingCounters_edgeNext(), n + 1, tx);
  const id = `${String(rule(engine, RULE.edgePrefix))}${n}`;
  const book = readPath(state, P.holdings(e.holder));
  const value = { kind: e.kind, holder: e.holder, subject: e.subject, terms: e.terms, grantedBy: null };
  writePath(state, P.holdings(e.holder), { ...(isObj(book) ? clone(book) : {}), [id]: value }, tx);
  return Object.freeze({ id, ...value, terms: Object.freeze({ ...e.terms }) });
}

/** 从持有者名下删去一条边（不发事件）。 @param {SocialEngine} engine @param {SocialState} state @param {Edge} edge @param {unknown} tx */
function dropEdge(engine, state, edge, tx) {
  const { P } = engine;
  const book = clone(Object(readPath(state, P.holdings(edge.holder))));
  delete book[edge.id];
  writePath(state, P.holdings(edge.holder), book, tx);
}

/**
 * 持有者一端的核对（卷十八 R18-1.5）：新边种类行 incompatible 逐条——policy 取「禁止」而持有者在所列种类下已有现役边即 E-HK-HOLDER-MAX，取「自动让出」即先按旧边「离任」格处置；
 * 之后 holderMax 非空时，写入后持有者在该种类下的现役边数超限即 E-HK-HOLDER-MAX。
 * @param {SocialEngine} engine @param {SocialState} state @param {KindRow} row @param {string} kind @param {string} holder @param {unknown} tx
 */
function settleHolderSide(engine, state, row, kind, holder, tx) {
  for (const raw of listOf(row[ROW.incompatible])) {
    const inc = Object(raw);
    const policy = Object.hasOwn(BY_POLICY, inc.policy) ? BY_POLICY[inc.policy] : undefined;
    if (policy === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${kind}.${ROW.incompatible}: policy ${JSON.stringify(inc.policy)} has no rule`);
    policy(engine, state, kind, holder, String(inc.kind), tx);
  }
  const max = row[ROW.holderMax];
  if (max !== null && holdingsOf(engine, state, holder, kind).length + 1 > Number(max)) throw new KernelError('E-HK-HOLDER-MAX', {}, `${kind}: ${holder} would exceed holderMax ${max}`);
}

// incompatible 条目的 policy（卷十八 §2.6 incompat_policy：forbid / auto_vacate）：按值查表，表外即 E-DIM-STRUCT-FIELD。
/** @type {Record<string, (engine: SocialEngine, state: SocialState, kind: string, holder: string, other: string, tx: unknown) => void>} */
const BY_POLICY = {
  forbid: (engine, state, kind, holder, other) => {
    if (holdingsOf(engine, state, holder, other).length > 0) throw new KernelError('E-HK-HOLDER-MAX', {}, `${kind}: ${holder} already holds ${other}, which it forbids`);
  },
  auto_vacate: (engine, state, kind, holder, other, tx) => { holderEnded(engine, state, holder, TRIGGER.vacated, null, tx, { kind: other }); },
};

/**
 * kernelApi openHolding（卷二 :550；卷十八 R18-1.5、1.11）：开一条 kind 种类、holder 持有 subject 的边，返回边 id。
 * 次序：种类行（E-HK-UNREGISTERED）→ 开边门槛（gateOpen）→ 两端类型（checkEnd）→ terms → exclusive 为真即标的上同种类旧边先按「离任」格处置 →
 * 持有者一端 incompatible 与 holderMax → capacityKey 非空即标的在该种类下现役边数须小于标的该维度值（E-HK-CAPACITY）→ 写边 → 发持有变化事件（与常住变化事件）。
 * 任一核对不过即抛，事务整笔撤回。
 * @param {SocialEngine} engine @param {SocialState} state @param {{kind: string, holder: string, subject: string, terms?: unknown}} spec @param {unknown} tx @returns {string}
 */
export function openHolding(engine, state, spec, tx) {
  const { kind, holder, subject } = Object(spec);
  const row = kindRow(engine, kind);
  gateOpen(row, kind);
  checkEnd(engine, state, row, kind, ROW.from, holder);
  checkEnd(engine, state, row, kind, ROW.to, subject);
  const terms = newTerms(engine, state, row, kind, Object(spec).terms);
  if (row[ROW.exclusive] === true) {
    for (const old of holdersOf(engine, state, subject, kind)) holderEnded(engine, state, old.holder, TRIGGER.vacated, null, tx, { kind, subject });
  }
  settleHolderSide(engine, state, row, kind, holder, tx);
  const capKey = row[ROW.capacityKey];
  if (capKey !== null) {
    const cap = dim(engine, state, kindOfEntity(engine, state, subject), subject, String(capKey)).value;
    if (!(holdersOf(engine, state, subject, kind).length < Number(cap))) throw new KernelError('E-HK-CAPACITY', {}, `${kind}: ${subject} is at ${capKey} ${cap}`);
  }
  const edge = writeEdge(engine, state, { kind, holder, subject, terms }, tx);
  emitChange(engine, state, edge, 'established', null, tx);
  emitDomicile(engine, state, edge, false, tx);
  return edge.id;
}

/**
 * kernelApi closeHolding（卷二 :550；卷十八 R18-1.11）：关一条现役边（从持有者名下删去），发持有变化事件（结束）与常住变化事件。
 * 种类行 admission 非空即未建数据门（R18-1.13 关边也先过准入）。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} edgeId @param {unknown} tx
 */
export function closeHolding(engine, state, edgeId, tx) {
  const edge = edgeOf(engine, state, edgeId);
  if (kindRow(engine, edge.kind)[ROW.admission] !== null) throw notReady(`${edge.kind}: admission`, UNBUILT.admission);
  dropEdge(engine, state, edge, tx);
  emitChange(engine, state, edge, 'ended', null, tx);
  emitDomicile(engine, state, edge, true, tx);
}

/**
 * kernelApi transferHolding（卷二 :550；卷十八 R18-1.11 转移）：关闭一条边、为同一标的写同一种类、持有者换成 newHolder 的承接边（terms 照旧，since 取当刻），只发一条持有变化事件（转移，带 prevHolder）；
 * 承接者过端类型与持有者一端核对（R18-1.5「按候补顺序移交而来」同受 incompatible、holderMax 管；不增标的边数，不受 capacityKey 限）。返回承接边 id。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} edgeId @param {string} newHolder @param {unknown} tx @returns {string}
 */
export function transferHolding(engine, state, edgeId, newHolder, tx) {
  const old = edgeOf(engine, state, edgeId);
  const row = kindRow(engine, old.kind);
  if (row[ROW.admission] !== null) throw notReady(`${old.kind}: admission`, UNBUILT.admission);
  checkEnd(engine, state, row, old.kind, ROW.from, newHolder);
  dropEdge(engine, state, old, tx);
  settleHolderSide(engine, state, row, old.kind, newHolder, tx);
  const edge = writeEdge(engine, state, { kind: old.kind, holder: newHolder, subject: old.subject, terms: { ...clone(old.terms), [TERMS.since]: clockMinute(engine, state) } }, tx);
  emitChange(engine, state, edge, 'transferred', old.holder, tx);
  emitDomicile(engine, state, old, true, tx);
  emitDomicile(engine, state, edge, false, tx);
  return edge.id;
}

// 协议甲处置格的取值（卷十八 R18-1.2）：本卡建关闭、转入承接实体、不动三种；其余走未建数据门（UNBUILT_DISPOSITION），表外即 E-HK-PROTOCOL。
/** @type {Record<string, (engine: SocialEngine, state: SocialState, edge: Edge, successor: string | null, tx: unknown) => void>} */
const BY_DISPOSITION = {
  ho_close: (engine, state, edge, successor, tx) => { closeHolding(engine, state, edge.id, tx); },
  // 转入承接实体：没有承接实体即按关闭（同 R18-1.2「授予者为空即按关闭」的口径）。
  ho_estate: (engine, state, edge, successor, tx) => {
    if (successor === null) closeHolding(engine, state, edge.id, tx);
    else transferHolding(engine, state, edge.id, successor, tx);
  },
  [STAY]: () => {},
};

/**
 * 按种类行协议甲的一格处置一条边。格为空即 E-HK-PROTOCOL（该种类没有这条路）。
 * @param {SocialEngine} engine @param {SocialState} state @param {Edge} edge @param {string} trigger @param {string | null} successor @param {unknown} tx
 */
function dispose(engine, state, edge, trigger, successor, tx) {
  const cell = kindRow(engine, edge.kind)[trigger];
  if (typeof cell === 'string' && Object.hasOwn(BY_DISPOSITION, cell)) { BY_DISPOSITION[cell](engine, state, edge, successor, tx); return; }
  if (typeof cell === 'string' && Object.hasOwn(UNBUILT_DISPOSITION, cell)) throw notReady(`${edge.kind}.${trigger} ${cell}`, UNBUILT_DISPOSITION[cell]);
  throw new KernelError('E-HK-PROTOCOL', {}, `${edge.kind}.${trigger}: ${JSON.stringify(cell)} is not a disposition`);
}

/**
 * kernelApi holderEnded（卷十八 R18-1.2 协议甲）：持有者 holderId 名下的现役边（filter 可限种类、标的），各按种类行 trigger 那一格处置；
 * successorId 是承接实体（转入承接实体用，可空）。trigger 须是 TRIGGER 之一，否则 E-DIM-STRUCT-FIELD。
 * 本卡的调用者：openHolding 的 exclusive 让出与 incompatible 自动让出（离任）；终止触发（gone）归 S2-0c1。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} holderId @param {string} trigger @param {string | null} successorId @param {unknown} tx
 * @param {{kind?: string, subject?: string}} [filter]
 */
export function holderEnded(engine, state, holderId, trigger, successorId, tx, filter = {}) {
  if (!Object.values(TRIGGER).some((t) => t === trigger)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `holderEnded: trigger ${JSON.stringify(trigger)} is not one of ${Object.values(TRIGGER).join(', ')}`);
  for (const edge of holdingsOf(engine, state, holderId, filter.kind)) {
    if (filter.subject === undefined || edge.subject === filter.subject) dispose(engine, state, edge, trigger, successorId, tx);
  }
}

/**
 * kernelApi subjectEnded（卷十八 R18-1.3 协议乙；卷二 §2.6 终止第 4 步）：以 subjectId 为标的的现役边一律关闭（不论种类行 subjectEnd 写什么，现行只许「关闭」）。
 * @param {SocialEngine} engine @param {SocialState} state @param {string} subjectId @param {unknown} tx
 */
export function subjectEnded(engine, state, subjectId, tx) {
  for (const edge of holdersOf(engine, state, subjectId)) closeHolding(engine, state, edge.id, tx);
}

/**
 * 终止清理（卷二 :561 handler(engine, state, info, tx)；state-owners systems.holdings.terminationCleanup）：被终止实体作标的的边经协议乙关闭（S2-H 主会话 Q9 甲）。
 * @param {SocialEngine} engine @param {SocialState} state @param {{id: string}} info @param {unknown} tx
 */
export function subjectEndCleanup(engine, state, info, tx) {
  subjectEnded(engine, state, info.id, tx);
}

/** 终止清理的登记项（social 域 manifest 收齐）。 */
export const SUBJECT_END_CLEANUP = registerTerminationCleanup('rules/social/holdings.mjs#subjectEndCleanup', subjectEndCleanup);

/**
 * 原语里所指的那条边（world/ontology/primitives.json oneOf）：给 holding 或 id 即按边 id；给三元 {holdingKind, holder, subject} 只许种类行 uniqueTriple 为真（卷十八 R18-1.13 ②），
 * 否则未建数据门；三元找不到恰一条即 E-DIM-REF-MISSING。
 * @param {SocialEngine} engine @param {SocialState} state @param {Record<string, unknown>} effect @returns {string}
 */
function edgeIdOf(engine, state, effect) {
  for (const k of [PARAM.holding, PARAM.id]) if (Object.hasOwn(effect, k)) return String(effect[k]);
  const kind = String(effect[PARAM.kind]);
  if (kindRow(engine, kind)[ROW.uniqueTriple] !== true) throw notReady(`${kind}: close by triple`, UNBUILT.triple);
  const hits = holdingsOf(engine, state, String(effect[PARAM.holder]), kind).filter((e) => e.subject === effect[PARAM.subject]);
  if (hits.length !== 1) throw new KernelError('E-DIM-REF-MISSING', {}, `${kind}: no unique edge for the triple`);
  return hits[0].id;
}

// 写入口（rules.social.primitiveOps 的值 → 函数；代码不按 op 名分支）。
/** @type {Record<string, (engine: SocialEngine, state: SocialState, effect: Record<string, unknown>, tx: unknown) => void>} */
const WRITE_ENTRIES = {
  open: (engine, state, effect, tx) => { openHolding(engine, state, { kind: String(effect[PARAM.kind]), holder: String(effect[PARAM.holder]), subject: String(effect[PARAM.subject]), terms: effect[PARAM.terms] }, tx); },
  close: (engine, state, effect, tx) => { closeHolding(engine, state, edgeIdOf(engine, state, effect), tx); },
  transfer: (engine, state, effect, tx) => {
    const to = Object.hasOwn(effect, PARAM.newHolder) ? effect[PARAM.newHolder] : effect[PARAM.holder];
    transferHolding(engine, state, edgeIdOf(engine, state, effect), String(to), tx);
  },
};

/**
 * holding.open / close / transfer 原语的写者（卷九 :630–:633；S2-L 草案 §3 R0，经 state-owners systems.holdings.primitiveWriter 登记、内核 resolve 回落调用）：
 * 按 rules.social.primitiveOps[op] 查写入口；两端实体存在与否到写入阶段才核（同一提案前面的 create 要到写入阶段才落地）。
 * @param {SocialEngine} engine @param {SocialState} state @param {Record<string, unknown>} effect
 */
export function holdingWriter(engine, state, effect) {
  const entry = Object(rule(engine, RULE.primitiveOps))[String(effect.op)];
  const fn = typeof entry === 'string' && Object.hasOwn(WRITE_ENTRIES, entry) ? WRITE_ENTRIES[entry] : undefined;
  if (fn === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SOCIAL}.${RULE.primitiveOps}.${String(effect.op)}: ${JSON.stringify(entry)} is not a holding write entry`);
  return { write: (/** @type {unknown} */ tx) => fn(engine, state, effect, tx) };
}

/** holding.* 原语写者的登记项（systems.holdings.primitiveWriter；social 域 manifest 收齐）。 */
export const HOLDING_WRITER = registerPrimitiveWriter('rules/social/holdings.mjs#holdingWriter', holdingWriter);

/** 写入口名单（holding-check.mjs 核 primitiveOps 的值）。 @returns {readonly string[]} */
export function writeEntryNames() {
  return Object.freeze(Object.keys(WRITE_ENTRIES).sort(cmp));
}

/** 本卡建了的处置取值与未建的处置取值（holding-check.mjs 核种类行处置格）。 @returns {{built: readonly string[], unbuilt: readonly string[]}} */
export function dispositionNames() {
  return { built: Object.freeze(Object.keys(BY_DISPOSITION).sort(cmp)), unbuilt: Object.freeze(Object.keys(UNBUILT_DISPOSITION).sort(cmp)) };
}
