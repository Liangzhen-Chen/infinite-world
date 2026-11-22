// 持有写者（内核组）：卷十八《社会关系与家族》§2.6 持有种类条目字段（:309–:350）、§4.1 持有种类表与两条转移协议（:451–:534）、
// R18-1.5 互斥/上限/容量/缔结（:521）、R18-1.6 带关系的边（:522）、R18-1.10 常住变化事件（:526）、R18-1.11 持有变化事件（:528）、
// R18-1.12 存续条件（:529–:532）、R18-1.13 准入入口与三元定位（:534）；卷二 §2.6 写者与三接口（:498–:517：按路径读写、事务内拒写、
// holdWhile 提交前重算钩子、持有写者开边关边次序）、§2.7 声明表（:542 起）；卷九 §4.2.1 holding 四原语（:630–:633）。
// 李白 11-18 22:10 块 5 体检裁定：丙2 装置内批次位置用持有边表达（装置/容器为持有者、批次为标的，本卡写者写，不另开位置路径）、
// 丙5 端类型名先收为模板名闭集（按实体表解析的核对随第一张建对应实体表的卡启用）、丙7 带 record 的边关闭一律整笔拒收
// （E-ACT-WRITER-NOT-READY，不关边不回填史实）。
//
// 边界与已定：
// - state.holdings 的唯一写者。存储形 `holdings.<持有者 id>.<边句柄>`，值是卷二 §1.5 的 `struct:holding`
//   `{kind, holder, subject, terms, grantedBy}`（卷二 :212）；边句柄由本文件按现有最大序号加一生成，不另存计数器（派生优先）。
//   路径与 keyKinds 由 5-3 登进 state-owners.json：`holdings.*.*` = `struct:holding`，第一段是持有者实体、第二段是运行时句柄（`handle`）。
// - 写直接落在调用方已开的内核事务上（与 kernel/ledger.mjs 同一做法：账本路径不经 writePath，卷二 §2.6 第 4 条），
//   不自己开事务；任一拒写抛带登记码的错误，由事务整笔回滚。
// - 本卡不建关系写者（卷十八 §3.3，块 7）：`carriesRel` 为真的种类一律整笔拒收 E-ACT-WRITER-NOT-READY；
//   带 `record` 的边关闭同码（丙7，不关边不回填史实）。
// - 准入入口（种类行 `admission`）在块 5 无登记实现，非空即整笔拒收 E-ACT-WRITER-NOT-READY，不静默跳过。
// - 事件（R18-1.10 常住变化、R18-1.11 持有变化）经 kernelApi `emit` 写，随本事务提交才落；事务事件尚未接线（块 6），
//   `actor` 取 null。有事务事件时链首取所涉边 id；没有事务事件（别的写者的推进钩子直写触发本写者）时按卷九 §2.9 :442
//   取该钩子的登记代号与主体 id，拿不到即整笔拒收（记“部分”、挂块 6）。
// - 提交前重算的 engine 由挂接处经 installHoldingEngine 交入（不在写者入口里猜）；engine 由装配文件组成（块 6），接点挂块 6 装配卡（5-7 核定）。
//   未交入时四个写者入口与提交前重算（本笔写到持有边或持有端路径）一律整笔拒收 E-ACT-WRITER-NOT-READY，不静默跳过。
// - 数值常量不写字面量（S10 const_literal 只放 0/1/-1）：边序号从现有边推出，份额比较用 data 里的 shareSum。
// - 不按持有种类名或实体 id 开分支：一切行为只读种类行字段（R18-1.1、S18-2）。

import { CODE_RE } from './handles/vocab-handle.mjs';
import { KernelError } from './errors.mjs';
import { currentTransaction, registerHoldWhileRecompute } from './transaction.mjs';
import { invalidateMemo } from './memo.mjs';
import { TERMINATED_KEY } from './storage.mjs';
import { emit, findEvent } from './events.mjs';
import { isHex64 } from './handles/keys.mjs';
import { dim } from './dimensions.mjs';
import { kindOf } from './vocab.mjs';
import { compileRXInScope, evaluateRX } from './rx.mjs';
import { readView } from './view-registry.mjs';
import { T } from './handles/markers.mjs';

// 定义源只此一份：路径键、事件动词、种类字段与协议代号。动词代号由卷十八 §2.3 登记（:200–:222），持有写者是唯一发出系统。
const S = Object.freeze({
  holdings: 'holdings',
  clock: 'clock',
  minute: 'minute',
  since: 'since',
  until: 'until',
  endReason: 'endReason',
  suspended: 'suspended',
  consentAct: 'consentAct',
  grantor: 'grantor',
  origin: 'origin',
  edgePrefix: 'hld_',
  position: 'pos.kernel',
  privateVisibility: 'private',
  intent: 'intent',
});

const VERB = Object.freeze({
  holdingChanged: 'verb_holding_changed',
  domicileChanged: 'verb_domicile_changed',
});

// 持有变化封闭枚举（卷十八 §2.2 :144，代码内封闭枚举，值不带前缀）。
const CHANGE = Object.freeze({ established: 'established', ended: 'ended', transferred: 'transferred' });

// 处置代号里本卡会用到的两个（handover 族，卷十八 §2.2；块 5 只执行“关闭”一路，别的处置待 5-4 终止协议）。
const HANDOVER = Object.freeze({ close: 'ho_close', stay: 'ho_stay', succeed: 'ho_succeed', revert: 'ho_revert' });

// 互斥策略（卷十八 §2.2 :1531）与候补来源里本卡用到的取值。
const POLICY = Object.freeze({ forbid: 'forbid', autoVacate: 'auto_vacate' });
const SUCCEED = Object.freeze({ grantor: 'grantor' });

// 本文件比较用到的错误码（比较处引用成员，S13 ④ 不写裸字串比较）。
const CODE = Object.freeze({ unknownRead: 'E-DIM-UNKNOWN-READ' });

// 端类型名闭集（卷十八 §4.1.1 :457 的两种名字：① 实体模板名；② 目录行所在的实体表名；丙5：块 5 先收为名字闭集，
// 按实体表解析的核对随第一张建对应实体表的卡启用。名字全部取自 §4.1.5 的 47 行数据，不写死任何单个种类行为）。
const TEMPLATE_NAMES = Object.freeze([
  'agent', 'business', 'collective', 'instrument', 'interim', 'office', 'place', 'population', 'thing',
  'account', 'holding', 'profession', 'skill',
]);

// 种类行主列（§2.6：`id` 至 `pins` 18 列，登记卷逐列给全，E-HK-ROW-FIELDS）。
const MAIN_COLUMNS = Object.freeze(['id', 'hyper', 'from', 'to', 'exclusive', 'gone', 'vacated', 'defected', 'subjectEnd', 'concluded', 'functional', 'membership', 'headship', 'carriesRel', 'conduct', 'conductBack', 'adopt', 'pins']);

// terms 键的类型（卷十八 §4.1.1 键表 :465–:499；公共键在前，其余只在种类行 termsKeys 里出现才可写）。
const TK = Object.freeze({ code: 'code', eventId: 'eventId', integer: 'integer', number: 'number', boolean: 'boolean', codes: 'codes', rx: 'rx' });
const COMMON_TERMS = Object.freeze([S.since, S.until, S.endReason, S.suspended, S.consentAct, S.grantor]);
const TERMS_TYPES = Object.freeze({
  [S.since]: TK.integer, [S.until]: TK.integer, [S.endReason]: TK.code, [S.suspended]: TK.boolean,
  [S.consentAct]: TK.eventId, [S.grantor]: TK.code,
  rel: TK.code, adoptive: TK.boolean, rank: TK.integer, share: TK.number, scope: TK.code, phase: TK.code,
  honor: TK.code, asOf: TK.integer, use: TK.code, rent: TK.number, rate: TK.number, task: TK.code,
  representative: TK.code, feeAccount: TK.code, aspect: TK.code, treaty: TK.code, regime: TK.code,
  case: TK.code, reach: TK.code, consensual: TK.boolean, graspAnchorBps: TK.integer, anchorAt: TK.integer,
  via: TK.code, liftWhen: TK.rx, origin: TK.code, cert: TK.code, actBasis: TK.code, basis: TK.code,
  pressed: TK.boolean, site: TK.code, estate: TK.code, vows: TK.codes,
});

// holdWhile 的四个读数（卷十八 §2.4 变量表 :276；键名与取数归卷十三，经 personView / itemView 读出）。
const HOLD_GRASP_LIMBS = 'holder.graspLimbs';
const HOLD_HANDS_HELD = 'holder.handsHeld';
const HOLD_WIELD_HANDS = 'subject.wieldHands';
const HOLD_WIELDERS = 'subject.wielders';
const HOLD_WHILE_DIMS = Object.freeze([HOLD_GRASP_LIMBS, HOLD_HANDS_HELD, HOLD_WIELD_HANDS, HOLD_WIELDERS]);
const VIEW = Object.freeze({ person: 'personView', item: 'itemView' });

const TYPEOF_STRING = typeof S.holdings;
const TYPEOF_NUMBER = typeof 0;
const TYPEOF_BOOLEAN = typeof true;
const TYPEOF_FUNCTION = typeof (() => {});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCode = (v) => typeof v === TYPEOF_STRING && CODE_RE.test(v);
// consentAct 的类型是 EventId（卷十八 :461）：事件 id 是 64 位十六进制，可能数字打头，不是 CODE 文法；代号形仍收（同 events.mjs 载荷的 EventId 校验）。
const isEventRef = (v) => isCode(v) || (typeof v === TYPEOF_STRING && isHex64(v));
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const own = (o, k) => isObj(o) && Object.hasOwn(o, k);

function deny(code, detail, entity = null) {
  return new KernelError(code, { entity }, detail);
}

function needTx(state) {
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw deny('E-VIEW-UNDECLARED-WRITE', 'holding writer outside the transaction of this state');
  return tx;
}

// engine 未交入即整笔拒收（卡头第二节第 3 条，不留绕过口子）：没有它，提交前重算与 holdWhile 求值都跑不了，
// 写者不静默照写。挂接处经 installHoldingEngine 交入；装配文件未建，接点挂块 6 装配卡。
function needEngine() {
  if (!engineRef) throw deny('E-ACT-WRITER-NOT-READY', 'holding writer needs installHoldingEngine (commit-time recompute cannot run without engine)');
}

// 事务内写（记撤销项，与 kernel/ledger.mjs 的 setInTx 同一格式）。
function setInTx(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i += 1) {
    const s = segs[i];
    if (!own(cur, s) || !isObj(cur[s])) {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs: [...segs], existed: Object.hasOwn(cur, last), prev: cur[last] });
  cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state);
}

const minuteOf = (state) => (isObj(state) && isObj(state[S.clock]) && Number.isSafeInteger(state[S.clock][S.minute]) ? state[S.clock][S.minute] : 0);

// ---------- 种类行（唯一定义在卷十八 §2.6） ----------

function kindRow(engine, code) {
  if (!isCode(code)) throw deny('E-HK-UNREGISTERED', `holding kind ${JSON.stringify(code)} is not a code`);
  const idx = engine && isObj(engine.vocab) ? engine.vocab.index : undefined;
  const rec = idx && typeof idx.get === TYPEOF_FUNCTION ? idx.get(code) : undefined;
  if (!rec || rec.family !== T.vocab_family.holding_kind || !isObj(rec.entry)) throw deny('E-HK-UNREGISTERED', `holding kind ${JSON.stringify(code)} is not a registered holding_kind row`);
  return rec.entry;
}

// 端类型名解析（卷十八 §4.1.1 :457；李白 22:10 丙5）：先按实体模板名（TEMPLATE_NAMES），再按目录行所在的实体表名（engine.tables 的 kind，
// 每建一张实体表即多一批可解析的名字，块 6 第 6-2 张起启用）；两边都解析不到即 E-HK-END-TYPE。engine 没交 tables 时只按模板名（夹具）。
function endNameResolves(engine, name) {
  if (typeof name !== TYPEOF_STRING) return false;
  if (TEMPLATE_NAMES.includes(name)) return true;
  if (engine === undefined || engine === null || !(engine.tables instanceof Map) || !engine.tables.has(name)) return false;
  // 卷十八 §4.1.1 :457：实体表名只在该表不是卷二 §2.6 所定的可终止实体类时才算（可终止的表由实体模板名覆盖）；可终止即类别行写了 termination。
  const classes = engine.tables.get(name).doc && engine.tables.get(name).doc.classes;
  return !(isObj(classes) && Object.values(classes).some((c) => isObj(c) && c.termination !== undefined));
}

function rowEndNames(row, engine) {
  const list = [];
  for (const side of ['from', 'to']) {
    if (!Array.isArray(row[side]) || row[side].length === 0) throw deny('E-HK-ROW-FIELDS', `holding kind ${JSON.stringify(row.id)}: ${side} is a non-empty list`);
    for (const name of row[side]) {
      if (!endNameResolves(engine, name)) throw deny('E-HK-END-TYPE', `holding kind ${JSON.stringify(row.id)}: ${side} name ${JSON.stringify(name)} is neither an entity template name nor an entity table name`);
      list.push(name);
    }
  }
  return list;
}

// terms 的字段与类型（§4.1.1）：公共键总可写，其余键须在种类行 termsKeys 里；不许多余键、不许文字。
function prepareTerms(engine, row, input, minute) {
  const src = input === undefined ? {} : input;
  if (!isObj(src)) throw deny('E-HK-PROTOCOL', 'holding terms is an object');
  const allowed = new Set([...COMMON_TERMS, ...(Array.isArray(row.termsKeys) ? row.termsKeys : [])]);
  for (const key of Object.keys(src)) {
    if (!allowed.has(key)) throw deny('E-HK-PROTOCOL', `terms.${key} is not in this kind termsKeys`);
    const type = Object.hasOwn(TERMS_TYPES, key) ? TERMS_TYPES[key] : undefined;
    if (type === undefined) throw deny('E-HK-PROTOCOL', `terms.${key} has no registered key type`);
    const v = src[key];
    if (type === TK.code && !(v === null || isCode(v))) throw deny('E-HK-PROTOCOL', `terms.${key} is a code or null`);
    if (type === TK.eventId && !(v === null || isEventRef(v))) throw deny('E-HK-PROTOCOL', `terms.${key} is an EventId or null`);
    if (type === TK.integer && !(v === null || Number.isSafeInteger(v))) throw deny('E-HK-PROTOCOL', `terms.${key} is an integer or null`);
    if (type === TK.number && !(typeof v === TYPEOF_NUMBER && Number.isFinite(v))) throw deny('E-HK-PROTOCOL', `terms.${key} is a finite number`);
    if (type === TK.boolean && typeof v !== TYPEOF_BOOLEAN) throw deny('E-HK-PROTOCOL', `terms.${key} is a boolean`);
    if (type === TK.codes && !(Array.isArray(v) && v.every(isCode))) throw deny('E-HK-PROTOCOL', `terms.${key} is a list of codes`);
    if (type === TK.rx && !isObj(v)) throw deny('E-HK-PROTOCOL', `terms.${key} is a compiled rx object`);
  }
  const terms = {
    [S.since]: own(src, S.since) ? src[S.since] : minute,
    [S.until]: own(src, S.until) ? src[S.until] : null,
    [S.endReason]: own(src, S.endReason) ? src[S.endReason] : null,
    [S.suspended]: own(src, S.suspended) ? src[S.suspended] : false,
    [S.consentAct]: own(src, S.consentAct) ? src[S.consentAct] : null,
    [S.grantor]: own(src, S.grantor) ? src[S.grantor] : null,
  };
  for (const key of Object.keys(src)) if (!Object.hasOwn(terms, key)) terms[key] = src[key];
  return terms;
}

// ---------- 读：现有边 ----------

function rootOf(state) {
  return isObj(state) && isObj(state[S.holdings]) ? state[S.holdings] : null;
}

function eachEdge(state, visit) {
  const root = rootOf(state);
  if (!root) return;
  for (const holder of Object.keys(root)) {
    const edges = root[holder];
    if (!isObj(edges)) continue;
    for (const id of Object.keys(edges)) {
      const record = edges[id];
      if (isObj(record)) visit({ holder, id, record });
    }
  }
}

function findEdge(state, id) {
  let hit = null;
  eachEdge(state, (e) => {
    if (hit === null && e.id === id) hit = e;
  });
  return hit;
}

function activeEdges(state, match) {
  const out = [];
  eachEdge(state, (e) => {
    if (isObj(e.record.terms) && e.record.terms[S.until] === null && match(e)) out.push(e);
  });
  return out;
}

/**
 * kernelApi `openHoldingsOfKind(state, kind)`（只读；卷九 R9-3.9 的玩家席位边、卷十八 §4.1 持有边的读入口之一）：
 * 状态里该持有种类的全部开着的边（`terms.until` 为空），按持有者 id、边句柄的码点序，返回 {id, holder, subject}（副本）。没有 holdings 节为空表。
 * @param {any} state @param {string} kind @returns {{id: string, holder: string, subject: string}[]}
 */
export function openHoldingsOfKind(state, kind) {
  const out = activeEdges(state, (e) => e.record.kind === kind).map((e) => ({ id: e.id, holder: e.holder, subject: e.record.subject }));
  return out.sort((a, b) => (a.holder < b.holder ? -1 : a.holder > b.holder ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function nextEdgeId(state) {
  let max = 0;
  eachEdge(state, (e) => {
    if (typeof e.id === TYPEOF_STRING && e.id.startsWith(S.edgePrefix)) {
      const n = Number(e.id.slice(S.edgePrefix.length));
      if (Number.isSafeInteger(n) && n > max) max = n;
    }
  });
  return S.edgePrefix + String(max + 1);
}

// ---------- 事件（R18-1.10、R18-1.11；卷九 §2.9 写者协议行的位次 pos.kernel） ----------

/** @type {WeakMap<object, {cause: string | null, fallbackSubject: string | null, lastEvent: string | null, newEdges: Set<string>}>} */
const txBook = new WeakMap();

function txEntry(tx, cause) {
  let book = txBook.get(tx);
  if (!book) {
    book = { cause, fallbackSubject: null, lastEvent: null, newEdges: new Set() };
    txBook.set(tx, book);
  } else if (typeof cause === TYPEOF_STRING && cause.length > 0) {
    book.cause = cause;
  }
  return book;
}

// 规则或指令代号：有事务事件时取它的 cause；没有时按卷九 §2.9 :442 取推进钩子的登记代号（事务上下文 node）。
function eventCause(tx, book) {
  if (typeof book.cause === TYPEOF_STRING && book.cause.length > 0) return book.cause;
  return tx && isCode(tx.node) ? tx.node : null;
}

// seed 是链首主体（同事务第二条起改用上一条事件 id，R9-2.9 表“写者协议在事务内另发的事件”一行）。
// 有事务事件时链首取“边句柄 + 变化”（块 5 没有事务事件 id，接提交段后改取事务事件 id，挂块 6）；
// 没有事务事件时（别的写者的推进钩子经 writePath 直写触发本写者）按 §2.9 :442 取该钩子的主体 id，
// 取不到即整笔拒收（不传 null 让事件形状失败），记“部分、挂块 6”。
function emitKernelEvent(engine, state, tx, verb, payload, seed, target) {
  const book = txEntry(tx, null);
  const hasTxEvent = typeof book.cause === TYPEOF_STRING && book.cause.length > 0;
  const cause = eventCause(tx, book);
  if (cause === null) throw deny('E-EVT-SHAPE', 'writer protocol event needs a cause code (no transaction event and no hook node code)');
  const subject = book.lastEvent !== null ? book.lastEvent : hasTxEvent ? seed : book.fallbackSubject;
  if (typeof subject !== TYPEOF_STRING) throw deny('E-EVT-SHAPE', 'writer protocol event needs a chain-head subject (no transaction event and no hook subject id)');
  const stored = emit(engine, state, {
    minute: minuteOf(state),
    verb,
    actor: null,
    targets: [target],
    primitives: [],
    cause,
    witnesses: [],
    visibility: S.privateVisibility,
    payload,
  }, { rule: cause, subject, position: S.position });
  book.lastEvent = stored.id;
  return stored;
}

function emitHoldingChanged(engine, state, tx, record, edgeId, change, prevHolder) {
  const payload = {
    edge: edgeId,
    kind: record.kind,
    holder: record.holder,
    subject: record.subject,
    change,
    prevHolder: prevHolder === undefined ? null : prevHolder,
    at: minuteOf(state),
  };
  return emitKernelEvent(engine, state, tx, VERB.holdingChanged, payload, `${edgeId}_${change}`, record.subject);
}

function emitDomicileChanged(engine, state, tx, row, holder, place, since, until, edgeId) {
  if (row.domicile !== true) return null;
  const payload = { person: holder, place, since, until };
  const phase = until === null ? 'in' : 'out';
  return emitKernelEvent(engine, state, tx, VERB.domicileChanged, payload, `${edgeId}_domicile_${phase}`, holder);
}

// ---------- holdWhile（R18-1.12） ----------

/** @type {WeakMap<object, Map<string, {tree: object | null, error: string | null}>>} */
const rxCache = new WeakMap();

function compileHoldWhile(engine, text) {
  if (!isObj(engine)) throw deny('E-HK-PROTOCOL', 'holdWhile needs engine');
  let cache = rxCache.get(engine);
  if (!cache) { cache = new Map(); rxCache.set(engine, cache); }
  const hit = cache.get(text);
  if (hit) return hit;
  const dims = new Map(HOLD_WHILE_DIMS.map((k) => [k, { type: T.type.number }]));
  const maxDepth = engine && isObj(engine.rules) && isObj(engine.rules.kernelConstants) ? engine.rules.kernelConstants.rxMaxDepth : undefined;
  if (!Number.isSafeInteger(maxDepth)) throw deny('E-DIM-STRUCT-FIELD', 'rules.kernelConstants.rxMaxDepth is a positive integer');
  let out;
  try {
    const compiled = compileRXInScope(text, 'data', { dims, vocabIndex: engine.vocab.index, ns: [], maxDepth });
    out = { tree: compiled.tree, error: null };
  } catch (e) {
    out = { tree: null, error: e && e.message ? e.message : 'holdWhile does not compile' };
  }
  cache.set(text, out);
  return out;
}

function viewField(engine, state, view, id, field) {
  let got;
  try {
    got = readView(view, engine, state, id);
  } catch (e) {
    if (e && e.code === CODE.unknownRead) return undefined;
    throw e;
  }
  if (!isObj(got)) return undefined;
  if (own(got, field)) return got[field];
  if (isObj(got.dims) && own(got.dims, field)) return got.dims[field];
  return undefined;
}

// 未知（读数缺、服务未登记、求值失败）按假处理（R18-1.12 ③）。
function holdWhileHolds(engine, state, row, record) {
  if (row.holdWhile === null) return true;
  const compiled = compileHoldWhile(engine, row.holdWhile);
  if (compiled.tree === null) return false;
  const values = {
    [HOLD_GRASP_LIMBS]: viewField(engine, state, VIEW.person, record.holder, 'graspLimbs'),
    [HOLD_HANDS_HELD]: viewField(engine, state, VIEW.person, record.holder, 'handsHeld'),
    [HOLD_WIELD_HANDS]: viewField(engine, state, VIEW.item, record.subject, 'wieldHands'),
    [HOLD_WIELDERS]: viewField(engine, state, VIEW.item, record.subject, 'wielders'),
  };
  const bound = {};
  for (const key of HOLD_WHILE_DIMS) {
    const v = values[key];
    if (typeof v !== TYPEOF_NUMBER || !Number.isFinite(v)) return false;
    bound[key] = v;
  }
  try {
    const result = evaluateRX(compiled.tree, { dim: bound }, {});
    return result === true;
  } catch (e) {
    return false;
  }
}

// ---------- 写 ----------

function termsUntil(record) {
  return isObj(record.terms) && own(record.terms, S.until) ? record.terms[S.until] : null;
}

function closeEdge(engine, state, tx, edge, cause, endReason, withEvent) {
  const row = kindRow(engine, edge.record.kind);
  const minute = minuteOf(state);
  const terms = { ...edge.record.terms, [S.until]: minute, [S.endReason]: endReason === undefined ? (isObj(edge.record.terms) ? edge.record.terms[S.endReason] : null) : endReason };
  const next = { ...edge.record, terms };
  setInTx(tx, [S.holdings, edge.holder, edge.id], next);
  if (withEvent !== false) {
    emitHoldingChanged(engine, state, tx, next, edge.id, CHANGE.ended, null);
    emitDomicileChanged(engine, state, tx, row, next.holder, next.subject, terms[S.since], minute, edge.id);
  }
  return next;
}

// 旧边按种类行“离任”格处置（R18-1.5）；块 5 只执行“关闭”，别的处置待 5-4 终止协议，整笔拒收不静默照写。
// ho_revert（回到授予者，R18-1.2 :518）：授予者为空或已终止时按关闭处置（口径同 terminate.mjs 的 revert 格）；授予者在世要协议转移，仍整笔拒收。
function vacatesByClose(state, row, rec) {
  if (row.vacated === HANDOVER.close) return true;
  if (row.vacated !== HANDOVER.revert) return false;
  const grantor = rec.terms[S.grantor];
  const marks = isObj(state) ? state[TERMINATED_KEY] : undefined;
  return !isCode(grantor) || (isObj(marks) && Object.hasOwn(marks, grantor));
}

function vacateEdge(engine, state, tx, edge, cause) {
  const row = kindRow(engine, edge.record.kind);
  if (vacatesByClose(state, row, edge.record)) { closeEdge(engine, state, tx, edge, cause, null, true); return; }
  throw deny('E-ACT-WRITER-NOT-READY', `holding kind ${edge.record.kind}: vacated disposition ${JSON.stringify(row.vacated)} is not wired in block 5`);
}

function checkAdmission(row) {
  if (row.admission !== null && row.admission !== undefined) throw deny('E-ACT-WRITER-NOT-READY', `holding kind ${row.id}: admission ${JSON.stringify(row.admission)} is not wired in block 5`);
}

// R18-1.5：concluded 的种类只能由带同意条款的动作成立。`terms.origin = seeded` 只是生成路径事务里的例外；
// 块 5 没有“生成路径事务”标记，运行期一律不认 seeded（挂生成路径卡，见回报“部分与挂卡”），只认本笔事务自己的同意事件编号。
function checkConsent(row, terms) {
  if (row.concluded !== true) return;
  if (!isEventRef(isObj(terms) ? terms[S.consentAct] : undefined)) throw deny('E-REL-CONSENT', `holding kind ${row.id}: concluded edge needs terms.consentAct from this transaction (runtime seeded is not a generation-path transaction)`);
}

// 转移/改份额的入参带本笔同意（R18-1.5 :521）：与开边同形的 `terms.consentAct`，只取这一个键；
// 承接边/新增边的其余 terms 照旧边或种类行，不从入参取（不复制旧边的 origin/consentAct）。
function issuedConsent(input) {
  if (!isObj(input) || input.terms === undefined) return null;
  if (!isObj(input.terms)) throw deny('E-HK-PROTOCOL', 'holding terms is an object');
  if (!Object.hasOwn(input.terms, S.consentAct)) return null;
  const v = input.terms[S.consentAct];
  if (!(v === null || isEventRef(v))) throw deny('E-HK-PROTOCOL', `terms.${S.consentAct} is an EventId or null`);
  return v;
}

// 同意事件的当事人 = 该事件的 actor（非空时）∪ targets（卷十八 R18-1.5，李白 11-19 10:2x 裁定；唯一定义处）。
// 凡写出的边其持有者或标的换了人（开边、转移的承接边）都核两端在当事人内；改份额两端不变，只核新增持有人（03:20 裁定 2）。
// 事件查不到或缺任一个都按 E-REL-CONSENT 拒（卷十八 :298）。判“须同意”目前只看 concluded（关系条目 consent 指向的一半随块 7 关系写者）。
function checkConsentCovers(row, consentAct, ends) {
  if (row.concluded !== true || ends.length === 0) return;
  const event = isEventRef(consentAct) ? findEvent(consentAct) : null;
  if (event === null) throw deny('E-REL-CONSENT', `holding kind ${row.id}: terms.consentAct names no event in the log`);
  const parties = new Set([event.actor, ...(Array.isArray(event.targets) ? event.targets : [])]);
  const missing = ends.find((h) => !parties.has(h));
  if (missing !== undefined) throw deny('E-REL-CONSENT', `holding kind ${row.id}: consent event parties do not cover ${missing}`, missing);
}

function checkGrantor(row, terms) {
  const needsGrantor = (Array.isArray(row.grantedBy) && row.grantedBy.length > 0) || row.succeedBy === SUCCEED.grantor;
  if (needsGrantor && !isCode(terms[S.grantor])) throw deny('E-HK-SUCCEED-SOURCE', `holding kind ${row.id}: terms.grantor required`);
}

function checkCapacity(engine, state, row, subject) {
  if (row.capacityKey === null || row.capacityKey === undefined) return;
  const kind = kindOf(subject);
  const cap = dim(engine, state, kind, subject, row.capacityKey);
  if (!cap || cap.known !== true || typeof cap.value !== TYPEOF_NUMBER) throw deny('E-DIM-UNKNOWN-READ', `holding kind ${row.id}: capacity ${row.capacityKey} of ${subject} is unknown`);
  const count = activeEdges(state, (e) => e.record.kind === row.id && e.record.subject === subject).length;
  if (count >= cap.value) throw deny('E-HK-CAPACITY', `holding kind ${row.id}: ${subject} is at capacity (${count}/${cap.value})`, subject);
}

function checkHolderMax(state, row, holder) {
  if (row.holderMax === null || row.holderMax === undefined) return;
  const count = activeEdges(state, (e) => e.record.kind === row.id && e.record.holder === holder).length;
  if (count >= row.holderMax) throw deny('E-HK-HOLDER-MAX', `holding kind ${row.id}: holder ${holder} is at the limit (${count}/${row.holderMax})`, holder);
}

// 承接者一端的互斥（R18-1.5）：forbid 拒写，auto_vacate 同一事务先按旧边种类行的离任格处置旧边。
function checkIncompatible(engine, state, tx, row, holder, cause) {
  if (!Array.isArray(row.incompatible)) return;
  for (const rule of row.incompatible) {
    const clashes = activeEdges(state, (e) => e.record.kind === rule.kind && e.record.holder === holder);
    if (clashes.length === 0) continue;
    if (rule.policy === POLICY.forbid) throw deny('E-HK-HOLDER-MAX', `holding kind ${row.id}: holder ${holder} already has incompatible ${rule.kind}`, holder);
    if (rule.policy === POLICY.autoVacate) { for (const old of clashes) vacateEdge(engine, state, tx, old, cause); continue; }
    throw deny('E-HK-PROTOCOL', `holding kind ${row.id}: unknown incompatible policy ${JSON.stringify(rule.policy)}`);
  }
}

function checkExclusive(engine, state, tx, row, subject, cause) {
  if (row.exclusive !== true) return;
  const clashes = activeEdges(state, (e) => e.record.kind === row.id && e.record.subject === subject);
  for (const old of clashes) vacateEdge(engine, state, tx, old, cause);
}

function checkShare(row, terms) {
  if (row.shareSum === null || row.shareSum === undefined) return;
  const share = isObj(terms) ? terms.share : undefined;
  if (!(typeof share === TYPEOF_NUMBER && Number.isFinite(share) && share > 0 && share <= row.shareSum)) throw deny('E-HK-PROTOCOL', `holding kind ${row.id}: terms.share must be in (0, ${row.shareSum}]`);
}

function makeRecord(row, holder, subject, terms, grantedBy) {
  const record = { kind: row.id, holder, subject, terms, grantedBy: isCode(grantedBy) ? grantedBy : terms[S.grantor] };
  record.grantedBy = isCode(record.grantedBy) ? record.grantedBy : null;
  return record;
}

function insertEdge(engine, state, tx, row, holder, subject, terms, grantedBy, cause) {
  const id = nextEdgeId(state);
  const record = makeRecord(row, holder, subject, terms, grantedBy);
  setInTx(tx, [S.holdings, holder, id], record);
  txEntry(tx, cause).newEdges.add(id);
  return { holder, id, record };
}

function emitEstablished(engine, state, tx, row, edge, cause) {
  emitHoldingChanged(engine, state, tx, edge.record, edge.id, CHANGE.established, null);
  emitDomicileChanged(engine, state, tx, row, edge.record.holder, edge.record.subject, edge.record.terms[S.since], termsUntil(edge.record), edge.id);
}

function assertEnds(holder, subject) {
  if (!isCode(holder) || !isCode(subject)) throw deny('E-HK-END-TYPE', 'holding holder and subject are entity ids');
}

// 卷十八 §3.3 :389：carriesRel 或 intimate 为真的种类一律转交内核关系写者（kernel/relations.mjs）；块 5 未建，整笔拒收。
function assertCarriesRel(engine, row, terms) {
  if (row.carriesRel === true || row.intimate === true) throw deny('E-ACT-WRITER-NOT-READY', `holding kind ${row.id}: carriesRel/intimate edges belong to kernel/relations.mjs (not built in block 5)`);
  if (isObj(terms) && terms.rel !== undefined && terms.rel !== null) {
    const idx = engine && isObj(engine.vocab) ? engine.vocab.index : undefined;
    const rec = idx && typeof idx.get === TYPEOF_FUNCTION ? idx.get(terms.rel) : undefined;
    if (rec && rec.family === T.vocab_family.relation && isObj(rec.entry) && rec.entry.record !== null && rec.entry.record !== undefined) {
      throw deny('E-ACT-WRITER-NOT-READY', `holding edge with record ${JSON.stringify(rec.entry.record)}: relation writer not built (block 5, ruling 11-18 22:10 B/record)`);
    }
    throw deny('E-ACT-WRITER-NOT-READY', `holding kind ${row.id}: terms.rel belongs to kernel/relations.mjs (not built in block 5)`);
  }
}

function assertNotTerminated(state, id) {
  const marks = isObj(state) ? state[TERMINATED_KEY] : undefined;
  if (isObj(marks) && Object.hasOwn(marks, id)) throw deny('E-TERM-RESIDUE', `entity ${id} is terminated`, id);
}

/**
 * `openHolding(engine, state, input)`（卷十八 R18-1.13 开边；卷九 §4.2.1 `holding.open`）：
 * 先校种类行与 terms，再按 R18-1.5 处置互斥/上限/容量、按 R18-1.12 求 holdWhile，写边成功后发 R18-1.10、R18-1.11 事件。
 * @param {{vocab: any, rules: any}} engine
 * @param {any} state
 * @param {{holdingKind: string, holder: string, subject: string, terms?: object, grantedBy?: string, cause: string}} input
 * @returns {string} 新边句柄
 */
export function openHolding(engine, state, input) {
  const tx = needTx(state);
  needEngine();
  const p = isObj(input) ? input : {};
  if (!isCode(p.cause)) throw deny('E-HK-PROTOCOL', 'holding.open needs a cause code');
  txEntry(tx, p.cause);
  if (!isCode(p.holder) || !isCode(p.subject)) throw deny('E-HK-END-TYPE', 'holding.open holder and subject are entity ids');
  assertEnds(p.holder, p.subject);
  const row = kindRow(engine, p.holdingKind);
  rowEndNames(row, engine);
  assertNotTerminated(state, p.holder);
  assertNotTerminated(state, p.subject);
  checkAdmission(row);
  const terms = prepareTerms(engine, row, p.terms, minuteOf(state));
  assertCarriesRel(engine, row, terms);
  checkConsent(row, terms);
  checkConsentCovers(row, terms[S.consentAct], [p.holder, p.subject]);
  checkGrantor(row, terms);
  checkShare(row, terms);
  if (row.uniqueTriple === true) {
    const dup = activeEdges(state, (e) => e.record.kind === row.id && e.record.holder === p.holder && e.record.subject === p.subject);
    if (dup.length > 0) throw deny('E-HK-PROTOCOL', `holding kind ${row.id}: uniqueTriple edge already exists`);
  }
  checkExclusive(engine, state, tx, row, p.subject, p.cause);
  checkIncompatible(engine, state, tx, row, p.holder, p.cause);
  checkHolderMax(state, row, p.holder);
  checkCapacity(engine, state, row, p.subject);
  const edge = insertEdge(engine, state, tx, row, p.holder, p.subject, terms, p.grantedBy, p.cause);
  if (!holdWhileHolds(engine, state, row, edge.record)) throw deny('E-HK-HOLD-WHILE', `holding kind ${row.id}: holdWhile is false or unknown for new edge`, p.holder);
  emitEstablished(engine, state, tx, row, edge, p.cause);
  return edge.id;
}

function resolveCloseTarget(engine, state, p) {
  if (isCode(p.id)) {
    const hit = findEdge(state, p.id);
    if (!hit) throw deny('E-HK-PROTOCOL', `holding ${JSON.stringify(p.id)} does not exist`);
    return hit;
  }
  if (isCode(p.holdingKind) && isCode(p.holder) && isCode(p.subject)) {
    const row = kindRow(engine, p.holdingKind);
    if (row.uniqueTriple !== true) throw deny('E-HK-PROTOCOL', `holding kind ${p.holdingKind}: uniqueTriple is false, triple close not allowed`);
    const hits = activeEdges(state, (e) => e.record.kind === p.holdingKind && e.record.holder === p.holder && e.record.subject === p.subject);
    if (hits.length !== 1) throw deny('E-HK-PROTOCOL', `holding triple closes exactly one active edge (got ${hits.length})`);
    return hits[0];
  }
  throw deny('E-HK-PROTOCOL', 'holding.close takes an edge id or a (holdingKind, holder, subject) triple');
}

/**
 * `closeHolding(engine, state, input)`（卷十八 R18-1.13 关边；卷九 §4.2.1 `holding.close`）：
 * 边 id 与三元定位二选一（三元须种类行 `uniqueTriple` 为真）；带 record 的边按李白 11-18 22:10 丙7 整笔拒收。
 * @param {{vocab: any, rules: any}} engine
 * @param {any} state
 * @param {{id?: string, holdingKind?: string, holder?: string, subject?: string, endReason?: string | null, cause: string}} input
 * @returns {string} 关闭的边句柄
 */
export function closeHolding(engine, state, input) {
  const tx = needTx(state);
  needEngine();
  const p = isObj(input) ? input : {};
  if (!isCode(p.cause)) throw deny('E-HK-PROTOCOL', 'holding.close needs a cause code');
  txEntry(tx, p.cause);
  const edge = resolveCloseTarget(engine, state, p);
  const row = kindRow(engine, edge.record.kind);
  checkAdmission(row);
  assertCarriesRel(engine, row, edge.record.terms);
  if (!isObj(edge.record.terms) || edge.record.terms[S.until] !== null) throw deny('E-HK-PROTOCOL', `holding ${edge.id} is already closed`);
  const endReason = isCode(p.endReason) ? p.endReason : null;
  closeEdge(engine, state, tx, edge, p.cause, endReason, true);
  return edge.id;
}

function insertTransferred(engine, state, tx, row, old, newHolder, terms, cause) {
  return insertEdge(engine, state, tx, row, newHolder, old.record.subject, terms, old.record.grantedBy, cause);
}

/**
 * `transferHolding(engine, state, input)`（卷十八 R18-1.11 的“转移”；卷九 §4.2.1 `holding.transfer`）：
 * 同一事务关闭旧边、为同一标的写同种、换持有者的承接边，只发一条 `transferred`（holder 取承接者、prevHolder 取原持有者）；
 * 常住边另照 R18-1.10 发结束、建立两条常住变化事件。
 * @param {{vocab: any, rules: any}} engine
 * @param {any} state
 * @param {{id?: string, holdingKind?: string, holder?: string, subject?: string, newHolder?: string, terms?: {consentAct?: string | null}, cause: string}} input
 * @returns {string} 承接边的句柄
 */
export function transferHolding(engine, state, input) {
  const tx = needTx(state);
  needEngine();
  const p = isObj(input) ? input : {};
  if (!isCode(p.cause)) throw deny('E-HK-PROTOCOL', 'holding.transfer needs a cause code');
  txEntry(tx, p.cause);
  const edge = resolveCloseTarget(engine, state, p);
  const newHolder = isCode(p.newHolder) ? p.newHolder : p.holder;
  if (!isCode(newHolder)) throw deny('E-HK-END-TYPE', 'holding.transfer needs a new holder id');
  if (newHolder === edge.record.holder) throw deny('E-HK-PROTOCOL', 'holding.transfer new holder is the current holder');
  const row = kindRow(engine, edge.record.kind);
  checkAdmission(row);
  assertCarriesRel(engine, row, edge.record.terms);
  if (row.transferable !== true) throw deny('E-HK-PROTOCOL', `holding kind ${row.id} is not transferable`);
  if (!isObj(edge.record.terms) || edge.record.terms[S.until] !== null) throw deny('E-HK-PROTOCOL', `holding ${edge.id} is already closed`);
  assertNotTerminated(state, newHolder);
  const minute = minuteOf(state);
  // 承接边是 R18-1.5 意义上的新边：只带本笔事务自己的同意（入参 terms.consentAct），不复制旧边的 origin/consentAct；
  // 旧边上的其余 terms（share、grantor 等）随种类照带。运行期没有本笔同意即拒 E-REL-CONSENT。
  const consentAct = issuedConsent(p);
  const { [S.consentAct]: _oldConsent, [S.origin]: _oldOrigin, ...carriedTerms } = edge.record.terms;
  const terms = { ...carriedTerms, [S.since]: minute, [S.until]: null, [S.endReason]: null, [S.consentAct]: consentAct };
  checkConsent(row, terms);
  checkConsentCovers(row, consentAct, [newHolder, edge.record.subject]);
  checkGrantor(row, terms);
  checkShare(row, terms);
  const oldClosed = { ...edge, record: { ...edge.record, terms: { ...edge.record.terms, [S.until]: minute, [S.endReason]: null } } };
  setInTx(tx, [S.holdings, edge.holder, edge.id], oldClosed.record);
  checkIncompatible(engine, state, tx, row, newHolder, p.cause);
  checkHolderMax(state, row, newHolder);
  checkCapacity(engine, state, row, edge.record.subject);
  const next = insertTransferred(engine, state, tx, row, edge, newHolder, terms, p.cause);
  emitHoldingChanged(engine, state, tx, next.record, next.id, CHANGE.transferred, edge.record.holder);
  emitDomicileChanged(engine, state, tx, row, edge.record.holder, edge.record.subject, edge.record.terms[S.since], minute, edge.id);
  emitDomicileChanged(engine, state, tx, row, newHolder, edge.record.subject, minute, null, next.id);
  return next.id;
}

/**
 * `rescaleHolding(engine, state, input)`（卷九 §4.2.1 `holding.rescale`；卷十八 §2.6 `shareSum`）：
 * 同一标的的份额整组改写；同持有人只改 `terms.share` 不建不关（不发事件），去掉的持有人关闭旧边（发 ended），
 * 新持有人建边（发 established）；份额之和须恰等于种类行的 `shareSum`。
 * @param {{vocab: any, rules: any}} engine
 * @param {any} state
 * @param {{holdingKind: string, subject: string, shares: Record<string, number>, terms?: {consentAct?: string | null}, cause: string}} input
 * @returns {string[]} 改写后该标的的现役边句柄（按持有者 id 升序）
 */
export function rescaleHolding(engine, state, input) {
  const tx = needTx(state);
  needEngine();
  const p = isObj(input) ? input : {};
  if (!isCode(p.cause)) throw deny('E-HK-PROTOCOL', 'holding.rescale needs a cause code');
  txEntry(tx, p.cause);
  if (!isCode(p.subject) || !isObj(p.shares)) throw deny('E-HK-PROTOCOL', 'holding.rescale takes subject and shares');
  const row = kindRow(engine, p.holdingKind);
  if (row.shareSum === null || row.shareSum === undefined) throw deny('E-HK-PROTOCOL', `holding kind ${row.id} has no shareSum`);
  let total = 0;
  for (const holder of Object.keys(p.shares)) {
    const share = p.shares[holder];
    if (!isCode(holder) || !(typeof share === TYPEOF_NUMBER && Number.isFinite(share) && share > 0)) throw deny('E-HK-PROTOCOL', 'holding.rescale shares are positive numbers keyed by holder id');
    total += share;
  }
  if (Math.abs(total - row.shareSum) > Number.EPSILON) throw deny('E-HK-PROTOCOL', `holding kind ${row.id}: shares sum to ${total}, want ${row.shareSum}`);
  checkAdmission(row);
  assertCarriesRel(engine, row, null);
  const current = activeEdges(state, (e) => e.record.kind === row.id && e.record.subject === p.subject);
  const existing = new Map(current.map((e) => [e.record.holder, e]));
  for (const edge of current) {
    if (!Object.hasOwn(p.shares, edge.record.holder)) { closeEdge(engine, state, tx, edge, p.cause, null, true); continue; }
    const share = p.shares[edge.record.holder];
    if (edge.record.terms.share !== share) setInTx(tx, [S.holdings, edge.holder, edge.id], { ...edge.record, terms: { ...edge.record.terms, share } });
  }
  // 新增持有人的边是 R18-1.5 意义上的新边：base 只照带 share/grantor 等字段，不带旧边的 origin/consentAct；
  // 本笔同意取入参 terms.consentAct；运行期没有本笔事务自己的同意即拒 E-REL-CONSENT。
  const consentAct = issuedConsent(p);
  checkConsentCovers(row, consentAct, Object.keys(p.shares).filter((h) => !existing.has(h)).sort(cmp));
  const { [S.consentAct]: _baseConsent, [S.origin]: _baseOrigin, ...baseTerms } = current.length > 0 ? current[0].record.terms : {};
  const base = baseTerms;
  for (const holder of Object.keys(p.shares).sort(cmp)) {
    if (existing.has(holder)) continue;
    const share = p.shares[holder];
    assertNotTerminated(state, holder);
    assertNotTerminated(state, p.subject);
    const terms = prepareTerms(engine, row, { ...base, share, [S.consentAct]: consentAct }, minuteOf(state));
    terms[S.since] = minuteOf(state);
    terms[S.until] = null;
    terms[S.endReason] = null;
    // 新增持有人与普通开边同一套字段核对（R18-1.5）：缔结、授予者、互斥、上限、容量；exclusive 不用于改份额（同一标的的分享边本就并存）。
    checkConsent(row, terms);
    checkGrantor(row, terms);
    checkIncompatible(engine, state, tx, row, holder, p.cause);
    checkHolderMax(state, row, holder);
    checkCapacity(engine, state, row, p.subject);
    const edge = insertEdge(engine, state, tx, row, holder, p.subject, terms, base[S.grantor], p.cause);
    emitEstablished(engine, state, tx, row, edge, p.cause);
  }
  return activeEdges(state, (e) => e.record.kind === row.id && e.record.subject === p.subject).map((e) => e.id).sort(cmp);
}

// ---------- 提交前重算与核对（卷二 §2.6 :515 钩子；卷十八 R18-1.12、shareSum） ----------

// 现役、holdWhile 非空的边的持有者与标的（只按种类行字段判，不按种类名）。别的写者写到时靠这张索引认受影响边。
function holdWhileEnds(state) {
  const ids = new Set();
  eachEdge(state, (e) => {
    if (!isObj(e.record.terms) || e.record.terms[S.until] !== null) return;
    const row = kindRowFromState(e.record.kind);
    if (!row || row.holdWhile === null) return;
    ids.add(e.record.holder);
    ids.add(e.record.subject);
  });
  return ids;
}

function touchedFrom(state, written) {
  const edges = new Set();
  const ends = new Set();
  // 持有写者自己写的 holdings 路径：记边与两端。
  for (const segs of written) {
    if (!Array.isArray(segs) || segs[0] !== S.holdings) continue;
    const [, holder, edgeId] = segs;
    if (holder !== undefined) ends.add(holder);
    if (edgeId !== undefined) {
      edges.add(edgeId);
      const root = rootOf(state);
      const rec = root && isObj(root[holder]) ? root[holder][edgeId] : undefined;
      if (isObj(rec)) { ends.add(rec.holder); ends.add(rec.subject); }
    }
  }
  // 别的写者（卷二 §2.6 :515：不论发起这笔事务的是哪个写者）写到的路径：凡有一段等于现役 holdWhile 边的
  // 持有者或标的 id，就算写到那条边的一端。按 holder/subject 索引找受影响边，不认具体路径形状与顶层键。
  const watch = holdWhileEnds(state);
  if (watch.size > 0) {
    for (const segs of written) {
      if (!Array.isArray(segs) || segs[0] === S.holdings) continue;
      for (const seg of segs) if (watch.has(seg)) ends.add(seg);
    }
  }
  return { edges, ends };
}

function checkShareSums(state, written) {
  const groups = new Map();
  const add = (kind, subject) => {
    const row = kindRowFromState(kind);
    if (!row || row.shareSum === null || row.shareSum === undefined) return;
    groups.set(`${kind}\u0000${subject}`, { kind, subject, row });
  };
  for (const segs of written) {
    if (!Array.isArray(segs) || segs[0] !== S.holdings) continue;
    const [, holder, edgeId] = segs;
    if (edgeId === undefined) continue;
    const root = rootOf(state);
    const rec = root && isObj(root[holder]) ? root[holder][edgeId] : undefined;
    if (isObj(rec)) add(rec.kind, rec.subject);
  }
  for (const g of groups.values()) {
    const edges = activeEdges(state, (e) => e.record.kind === g.kind && e.record.subject === g.subject);
    if (edges.length === 0) continue;
    let sum = 0;
    for (const e of edges) sum += isObj(e.record.terms) && typeof e.record.terms.share === TYPEOF_NUMBER ? e.record.terms.share : 0;
    if (Math.abs(sum - g.row.shareSum) > Number.EPSILON) throw deny('E-HK-PROTOCOL', `holding kind ${g.kind}: shares on ${g.subject} sum to ${sum}, want ${g.row.shareSum}`, g.subject);
  }
}

/** @type {null | {vocab: any, rules: any}} */
let engineRef = null;

function kindRowFromState(kind) {
  if (!engineRef) return null;
  const idx = isObj(engineRef.vocab) ? engineRef.vocab.index : undefined;
  const rec = idx && typeof idx.get === TYPEOF_FUNCTION ? idx.get(kind) : undefined;
  return rec && rec.family === T.vocab_family.holding_kind && isObj(rec.entry) ? rec.entry : null;
}

// 未装 engine 时无法按种类行判哪些边带 holdWhile（种类行要读 engine.vocab）；保守取全部现役边的两端，
// 不漏掉任何一条可能带 holdWhile 的边（宁可多拒，不静默跳过）。
function activeHoldingEnds(state) {
  const ids = new Set();
  eachEdge(state, (e) => {
    if (!isObj(e.record.terms) || e.record.terms[S.until] !== null) return;
    ids.add(e.record.holder);
    ids.add(e.record.subject);
  });
  return ids;
}

function writesHolding(state, written) {
  const ends = activeHoldingEnds(state);
  for (const segs of written) {
    if (!Array.isArray(segs)) continue;
    if (segs[0] === S.holdings) return true;
    for (const seg of segs) if (ends.has(seg)) return true;
  }
  return false;
}

function recompute(state, written) {
  const engine = engineRef;
  // 没有 engine 时不静默跳过（卡头第二节第 3 条）：本笔写到持有边或持有端路径即整笔拒收，
  // 因为 holdWhile 重算与事件主体都取不到；没碰持有端的其它事务照常提交。
  if (!engine) {
    if (writesHolding(state, written)) throw deny('E-ACT-WRITER-NOT-READY', 'holding recompute needs installHoldingEngine (transaction touched a holding edge)');
    return;
  }
  const tx = currentTransaction();
  const { edges, ends } = touchedFrom(state, written);
  if (edges.size === 0 && ends.size === 0) return;
  const book = tx ? txEntry(tx, null) : null;
  // 没有事务事件时（别的写者的推进钩子经 writePath 直写触发本写者），事件链首要取该钩子的主体 id（卷九 §2.9 :442）：
  // 触发本钩子的实体恰好一个时可取，取不到由 emitKernelEvent 整笔拒收（不传 null）。
  if (book && !(typeof book.cause === TYPEOF_STRING && book.cause.length > 0)) {
    const triggers = [...ends].sort(cmp);
    book.fallbackSubject = triggers.length === 1 ? triggers[0] : null;
  }
  checkShareSums(state, written);
  // 新边按 R18-1.12 ① 成组求值：任一条为假或未知，本事务这类新边一并拒写。
  for (const id of book ? book.newEdges : []) {
    const edge = findEdge(state, id);
    if (!edge) continue;
    const row = kindRow(engine, edge.record.kind);
    if (row.holdWhile !== null && !holdWhileHolds(engine, state, row, edge.record)) throw deny('E-HK-HOLD-WHILE', `holding kind ${row.id}: holdWhile is false or unknown for new edge`, edge.record.holder);
  }
  // 现役边重算（R18-1.12 ②）：写到的持有者或标的所属的这类边按建立先后逐条放回，假的按离任格处置；关了再扫，直到不动。
  let changed = true;
  while (changed) {
    changed = false;
    eachEdge(state, (edge) => {
      if (changed) return;
      const row = kindRowFromState(edge.record.kind);
      if (!row || row.holdWhile === null) return;
      if (!isObj(edge.record.terms) || edge.record.terms[S.until] !== null) return;
      const touched = edges.has(edge.id) || ends.has(edge.record.holder) || ends.has(edge.record.subject);
      if (!touched) return;
      if (holdWhileHolds(engine, state, row, edge.record)) return;
      if (!vacatesByClose(state, row, edge.record)) throw deny('E-ACT-WRITER-NOT-READY', `holding kind ${row.id}: vacated disposition ${JSON.stringify(row.vacated)} is not wired in block 5`);
      closeEdge(engine, state, tx, edge, book && book.cause ? book.cause : null, null, true);
      changed = true;
    });
  }
}

/**
 * 种类表加载期核对（卷十八 §2.5 :286–:292、§2.6 :309–:350）：主列逐列给全、端类型名在模板名闭集内、
 * 上位词存在且无环、holdWhile 可编译、termsKeys 在键表内；§2.5 可静态判的项——intimate 逐行显式（E-REL-INTIMATE-FIELD）、
 * concluded 行 termsKeys 含 origin、gone 不取 ho_stay（E-HK-PROTOCOL）、任一格 ho_succeed 则 succeedBy 非空（E-HK-SUCCEED-SOURCE）。
 * 只按行字段判，不点名任何种类。`grantedBy` 的授予者模板核对要实体模板表，随第一张实体模板卡启用（见回报“部分与挂卡”）。
 * 统一加载器（kernel/load/world.mjs）在词表收齐后调用，违者加载失败（5-7 接线）；测试也直接调用。
 * @param {{vocab: any, rules: any}} engine
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkHoldingKindRows(engine) {
  const errors = [];
  const idx = engine && isObj(engine.vocab) ? engine.vocab.index : undefined;
  if (!idx || typeof idx.get !== TYPEOF_FUNCTION) return { ok: false, errors: ['E-DIM-REF-MISSING vocab index missing'] };
  const rows = new Map();
  for (const [code, rec] of idx) if (rec && rec.family === T.vocab_family.holding_kind && isObj(rec.entry)) rows.set(code, rec.entry);
  for (const [code, row] of rows) {
    for (const col of MAIN_COLUMNS) if (!Object.hasOwn(row, col)) errors.push(`E-HK-ROW-FIELDS ${code}: missing ${col}`);
    try { rowEndNames(row, engine); } catch (e) { errors.push(`${e.code} ${code}: ${e.message}`); }
    if (!Object.hasOwn(row, 'intimate')) errors.push(`E-REL-INTIMATE-FIELD ${code}: intimate column must be written per row`);
    const termsKeys = Array.isArray(row.termsKeys) ? row.termsKeys : [];
    if (row.concluded === true && !termsKeys.includes(S.origin)) errors.push(`E-HK-PROTOCOL ${code}: concluded row termsKeys must include origin`);
    if (row.gone === HANDOVER.stay) errors.push(`E-HK-PROTOCOL ${code}: gone must not take ho_stay`);
    if ([row.gone, row.vacated, row.defected].includes(HANDOVER.succeed) && (row.succeedBy === null || row.succeedBy === undefined)) errors.push(`E-HK-SUCCEED-SOURCE ${code}: a handover cell takes ho_succeed but succeedBy is empty`);
    if (row.grantsEntry === true && (row.entryRankMax === null || row.entryRankMax === undefined)) errors.push(`E-HK-ROW-FIELDS ${code}: entryRankMax required when grantsEntry`);
    if (row.grantsEntry !== true && row.entryRankMax !== null && row.entryRankMax !== undefined) errors.push(`E-HK-ROW-FIELDS ${code}: entryRankMax must be null when grantsEntry is false`);
    if (row.hyper !== null && row.hyper !== undefined && !rows.has(row.hyper)) errors.push(`E-HK-HYPER ${code}: hyper ${JSON.stringify(row.hyper)} is not registered`);
    if (row.holdWhile !== null && row.holdWhile !== undefined) {
      if (row.vacated === null || row.vacated === HANDOVER.stay) errors.push(`E-HK-PROTOCOL ${code}: holdWhile row needs a vacated disposition other than none/stay`);
      const compiled = compileHoldWhile(engine, row.holdWhile);
      if (compiled.tree === null) errors.push(`E-HK-PROTOCOL ${code}: holdWhile does not compile: ${compiled.error}`);
    }
    for (const key of termsKeys) if (!Object.hasOwn(TERMS_TYPES, key)) errors.push(`E-HK-PROTOCOL ${code}: terms key ${JSON.stringify(key)} is not in the key table`);
  }
  for (const code of [...rows.keys()].sort(cmp)) {
    const seen = new Set([code]);
    let cur = rows.get(code);
    while (cur && cur.hyper !== null && cur.hyper !== undefined) {
      if (seen.has(cur.hyper)) { errors.push(`E-HK-HYPER ${code}: hyper cycle`); break; }
      seen.add(cur.hyper);
      cur = rows.get(cur.hyper);
      if (!cur) break;
    }
  }
  return { ok: errors.length === 0, errors };
}

// 模块加载时交入提交前重算钩子（卷二 §2.6 :515，只许一处；与 registerTerminationCleanup 同一做法）。
registerHoldWhileRecompute((state, written) => recompute(state, written));

/**
 * 挂接时交入当前 engine（与 installEventLog／installProposalSession 同一 install* 模式；kernel 组内用，不在 kernelApi）。
 * 程序装载只能在挂接处调一次，不在四个写者入口里猜：提交前重算要查种类行、求 holdWhile，没有 engine 就无法重算。
 * engine 含存档模板种子等装配期才齐的字段，由装配文件 server-plugin/index.mjs（块 6，卷二 :958 封闭清单）交入；5-7 核定挂块 6 装配卡。
 * @param {{vocab: any, rules: any}} engine
 */
export function installHoldingEngine(engine) {
  engineRef = engine;
}

/** 测试与重新挂接用：清掉交入的 engine（kernel 组内用，不在 kernelApi）。 */
export function resetHoldingEngine() {
  engineRef = null;
}
