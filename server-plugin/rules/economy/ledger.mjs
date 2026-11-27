// 账本（卷六 §4.1 账本三元键与守恒；S2-L 草案 §4）：全书改变任何数量只有 post 一个写入口（卷六 :289、§4.1.2），一笔之内全成或全败。
// 状态 accounts.<持有人>（struct:holderAccounts：用途 → 资源种类 → 资源键 → 余额）、ledgerTotals（struct:resourceTotals）、outflowTotals.<持有人>
// （struct:holderOutflow）、ledgerCounters.lotNext 只经 readPath / writePath 加路径句柄 P 读写（卷二 :535；唯一写者登记在 state-owners.d/economy.json）。
// 规则与参数全在数据：资源种类行（world/rules/tables/economy/resources.json）、来源去处与用途词表条目（_vocab.json src、sink、purpose）、
// rules.economyLedger 的 budget（限额通道窗口）、account（账户串文法、批次键前缀、持有人主体标记）、primitiveReason；不认任何资源、持有人或来历 id。
// 换账本实现只改 rules/economy/*。
import { KernelError } from '../../kernel/errors.mjs';
import { GRAMMAR_TOKENS, T } from '../../kernel/handles.mjs';
import { readPath, readPathIn, writePath, matchPaths, kindOfEntity } from '../../kernel/storage.mjs';
import { txEmit } from '../../kernel/transaction.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { clone } from '../../kernel/bytes.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { parseNumberType } from '../../kernel/validate/types.mjs';
import { ruleValue, ruleRow, unitSi } from '../load/registry.mjs';
import { headerOf } from '../body/body-plan.mjs';
import { registerPrimitiveWriter } from '../load/primitive-writers.mjs';
import { registerTerminationCleanup } from '../lifecycle/terminate.mjs';

// 规则表登记代号（world/rules/registry.json）与 rules.economyLedger 的键。
export const LEDGER = 'economyLedger';
const RESOURCES = 'economyResources';
const RULE = Object.freeze({ account: 'account', budget: 'budget', primitiveReason: 'primitiveReason', terminateReason: 'terminateReason' });
// 终止协议规则表（world/rules/tables/terminate.json）里登记未建取值的键（卷二 §2.6；rules.terminate.unbuilt {onTerminate: [...], card}）。
const TERMINATE = Object.freeze({ table: 'terminate', unbuilt: 'unbuilt' });
// 词表族（卷六 §2.1–§2.2、§4.22.1）。
export const FAM = Object.freeze({ src: 'src', sink: 'sink', purpose: 'purpose', verb: 'verb', resource: 'resource' });
// 来源去处条目与用途条目的字段（卷六 §4.22.1 budgetMode、pairedWith；§2.2 trackOutflow）。
const ENTRY = Object.freeze({ budgetMode: 'budgetMode', pairedWith: 'pairedWith', trackOutflow: 'trackOutflow' });
// 资源种类行的字段（卷六 §2.1）。
const ROW = Object.freeze({ transferable: 'transferable', counterpartRX: 'counterpartRX', onTerminate: 'onTerminate', salvageFraction: 'salvageFraction' });
// 限额通道（卷六 §4.1 规则 6；budget_mode 族封闭两值，只有限额通道要核窗口）。
export const CAPPED = 'bm_capped';
// budget 窗口的字段（卷六 §2.5 :224；生效日窗口照李白 11-18 02:20 K3-40）。
export const WINDOW = Object.freeze({ from: 'activeFromDay', to: 'activeToDay', limit: 'limit' });
// 账户串各段（卷六 :103–:104 账户三元键 + 资源键；主会话 Q5 甲）。
const ACCOUNT_FIELDS = Object.freeze(['holder', 'purpose', 'resource', 'key']);
// 腿的三种形状（卷六 §4.1 规则 2）：账户腿 {account, delta}；来源腿、去处腿 {source|sink, resource, qty}，sign 是它在 L = S − K 里的号。
const FLOW_LEGS = Object.freeze([
  Object.freeze({ field: 'source', family: FAM.src, rowSet: 'sources', sign: 1 }),
  Object.freeze({ field: 'sink', family: FAM.sink, rowSet: 'sinks', sign: -1 }),
]);
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
// 本卡未建能力的去处（同 rules/lifecycle/terminate.mjs 的未建数据门：拒收并写明等哪张卡）。
const UNBUILT = Object.freeze({
  holderFlag: '地点 ledgerHolder 数据卡（_unbuilt-derived.json place.ledgerHolder，排在 S2-0c1 之前）',
  noWindow: '边界供货与日终分配结算卡（卷六 §4.6 规则 8、§4.1 规则 6 settleCappedAllocation）',
  counterpart: 'counterpartRX 求值卡（卷六 :117 读双方实体类别代号与持有边，持有边归 S2-H）',
  noSuccessor: '卷十八家户卡（inherit / liquidate 的后继与残骸落位，S2-0c1 主会话 Q4）',
});

/** @typedef {{holder: string, purpose: string, resource: string, key: string}} Account */
// 装配层 engine 里账本用到的部分（与 rules/body/body-plan.mjs BodyEngine 兼容，headerOf 收它）。
/** @typedef {{P: Readonly<Record<string, (...args: string[]) => import('../../kernel/types.d.ts').StatePath<string>>>, registry: {tables: Map<string, unknown>, kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>, kindOfLoaded: (id: string) => string | undefined}, docData: Parameters<typeof ruleValue>[0], vocab: unknown, modifierSources: ReadonlyArray<Function>}} LedgerEngine */
/** 世界状态（只经 readPath / writePath 读写，本文件不看它的形状）。 @typedef {object} LedgerState */
/** 一个持有人名下的余额表（卷二 §1.5 struct:holderAccounts：用途 → 资源种类 → 资源键 → 余额）。 @typedef {Record<string, Record<string, Record<string, number>>>} HolderBook */
/** 一个持有人名下被跟踪分区的流出累计（struct:holderOutflow）。 @typedef {Record<string, Record<string, Record<string, {cumulative: number}>>>} HolderOutflow */
/** 资源种类行或词表条目（字段按名读，值形状由各处判）。 @typedef {Record<string, unknown>} Row */

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);
const isQty = (/** @type {unknown} */ v) => Number.isSafeInteger(v) && Number(v) > 0;

/** rules.economyLedger 的 account 行（登记声明已核三栏都是串）。 @param {LedgerEngine} engine @returns {{sep: string, lotPrefix: string, holderFlag: string}} */
function accountRule(engine) {
  const v = Object(ruleValue(engine.docData, LEDGER, RULE.account));
  return { sep: String(v.sep), lotPrefix: String(v.lotPrefix), holderFlag: String(v.holderFlag) };
}

/**
 * 词表条目（只认自有键）；族或条目不在即 E-DIM-REF-MISSING。
 * @param {LedgerEngine} engine @param {string} family @param {unknown} code @returns {Row}
 */
export function vocabEntry(engine, family, code) {
  const entries = Object(Object(Object(Object(engine.vocab).families)[family]).entries);
  if (typeof code !== 'string' || !Object.hasOwn(entries, code)) throw new KernelError('E-DIM-REF-MISSING', {}, `${JSON.stringify(code)}: not an entry of vocab family ${family}`);
  return Object(entries[code]);
}

/** 资源种类行里一个代号集合栏（sources、sinks；登记声明已核是串集合）。 @param {Row} row @param {string} field @returns {unknown[]} */
export function codesOf(row, field) {
  const v = row[field];
  return Array.isArray(v) ? v : [];
}

/** 资源种类行（经公共部件 ruleRow 核）。 @param {LedgerEngine} engine @param {unknown} resource @returns {Row} */
export function resourceRow(engine, resource) {
  return Object(ruleRow(engine.docData, RESOURCES, String(resource)));
}

/**
 * 账户串 → 四段（文法 <持有人><sep><用途><sep><资源种类><sep><资源键>，分隔符取 rules.economyLedger.account.sep）；不合即 E-EFF-PARAM。
 * @param {LedgerEngine} engine @param {unknown} text @returns {Account}
 */
export function parseAccount(engine, text) {
  const { sep } = accountRule(engine);
  const parts = typeof text === 'string' ? text.split(sep) : [];
  if (parts.length !== ACCOUNT_FIELDS.length || parts.some((p) => p.length === 0)) {
    throw new KernelError('E-EFF-PARAM', {}, `account ${JSON.stringify(text)}: want ${ACCOUNT_FIELDS.join(sep)}`);
  }
  const [holder, purpose, resource, key] = parts;
  return { holder, purpose, resource, key };
}

/** 四段 → 账户串。 @param {LedgerEngine} engine @param {Account} a @returns {string} */
function accountText(engine, a) {
  return [a.holder, a.purpose, a.resource, a.key].join(accountRule(engine).sep);
}

/** 持有人名下的余额表（struct:holderAccounts；没有即空）。 @param {LedgerEngine} engine @param {LedgerState} state @param {string} holder @returns {HolderBook} */
function holderAccounts(engine, state, holder) {
  const v = readPath(state, engine.P.accounts(holder));
  return isObj(v) ? v : {};
}

/** 已开户账户的余额；没开户即 undefined。 @param {LedgerEngine} engine @param {LedgerState} state @param {Account} a @returns {number | undefined} */
function balanceOf(engine, state, a) {
  const v = readPathIn(state, engine.P.accounts(a.holder), [a.purpose, a.resource, a.key]);
  return Number.isSafeInteger(v) ? v : undefined;
}

/**
 * 持有人须是账本主体（卷六 :103 holder、:1642 E-LEDGER-HOLDER-NOT-SUBJECT）：种类在 state-owners keyKinds 的 accounts.* 段之内；
 * 该种类的表声明了主体标记维度（rules.economyLedger.account.holderFlag）的，该行此维度须为真；数据未建即 E-ACT-WRITER-NOT-READY 并写明等哪张卡。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {string} holderId
 */
function checkHolder(engine, state, holderId) {
  const kind = kindOfEntity(engine, state, holderId);
  const kinds = Object(Object(Object(engine.docData).owners).keyKinds)[engine.P.accounts(holderId).pattern];
  if (!Array.isArray(kinds) || !Array.isArray(kinds[0]) || !kinds[0].includes(kind)) {
    throw new KernelError('E-LEDGER-HOLDER-NOT-SUBJECT', {}, `${kind} ${holderId}: not a ledger holder kind`);
  }
  const flag = accountRule(engine).holderFlag;
  if (Object.keys(headerOf(engine, kind, flag)).length === 0) return;
  let v;
  try {
    v = dim(engine, state, kind, holderId, flag).value;
  } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${kind} ${holderId}: ${flag} has no data yet, wait for ${UNBUILT.holderFlag}`);
    throw e;
  }
  if (v !== true) throw new KernelError('E-LEDGER-HOLDER-NOT-SUBJECT', {}, `${kind} ${holderId}: ${flag} is not true`);
}

/**
 * 新开一个散货批次键（卷三乙 §2.3：前缀 + 全局递增序号，序号取 ledgerCounters.lotNext，只增不回收；计数器未写过即从 0 起）。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {unknown} tx @returns {string}
 */
function newLotKey(engine, state, tx) {
  const { P } = engine;
  const cur = readPath(state, P.ledgerCounters_lotNext());
  const n = cur === undefined ? 0 : Number(cur);
  writePath(state, P.ledgerCounters_lotNext(), n + 1, tx);
  return `${accountRule(engine).lotPrefix}${n}`;
}

/**
 * kernelApi openAccount（卷六 :291；草案 §4 第 3 行）：给 holderId 开一个零余额账户 (用途 purposeCode, 资源 resourceRef.kind, 键 resourceRef.key)，返回账户串。
 * resourceRef.key 不给即新开一个散货批次键（卷三乙 §2.3）。持有人须是账本主体（checkHolder）；用途须是 purpose 族条目；资源种类须有行；同一账户已开即 E-DIM-ID-DUPLICATE。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {string} holderId @param {{kind: string, key?: string}} resourceRef @param {string} purposeCode @param {unknown} tx
 * @returns {string}
 */
export function openAccount(engine, state, holderId, resourceRef, purposeCode, tx) {
  checkHolder(engine, state, holderId);
  vocabEntry(engine, FAM.purpose, purposeCode);
  const ref = Object(resourceRef);
  resourceRow(engine, ref.kind);
  if (ref.key !== undefined && (typeof ref.key !== 'string' || ref.key.length === 0)) throw new KernelError('E-EFF-PARAM', {}, 'openAccount: resourceRef.key must be a non-empty string when given');
  const key = ref.key === undefined ? newLotKey(engine, state, tx) : ref.key;
  /** @type {Account} */
  const a = { holder: holderId, purpose: purposeCode, resource: String(ref.kind), key };
  const text = accountText(engine, a);
  parseAccount(engine, text);
  if (balanceOf(engine, state, a) !== undefined) throw new KernelError('E-DIM-ID-DUPLICATE', {}, `account ${text}: already open`);
  const next = clone(holderAccounts(engine, state, holderId));
  next[a.purpose] = { ...Object(next[a.purpose]), [a.resource]: { ...Object(Object(next[a.purpose])[a.resource]), [a.key]: 0 } };
  const { P } = engine;
  writePath(state, P.accounts(holderId), next, tx);
  return text;
}

/**
 * 当前世界日（卷六 §4.1 规则 6：日序 = ⌊(时钟 − genesisMinute) ÷ 一日分钟数⌋）。一日分钟数 = budget 窗口字段的单位 si ÷ 时钟路径单位 si（单位表经公共入口 unitSi），须为正整数。
 * @param {LedgerEngine} engine @param {LedgerState} state @returns {number}
 */
function worldDay(engine, state) {
  const doc = Object(engine.docData);
  const spec = Object(engine.docData.registryRows.find((r) => r.code === LEDGER));
  const dayUnit = Object(Object(Object(Object(Object(spec.type)[RULE.budget]).value).value).fields)[WINDOW.from];
  const clock = parseNumberType(String(Object(Object(doc.owners).pathTypes)[engine.P.clock_minute().pattern]));
  if (!clock || !clock.unit || typeof Object(dayUnit).unit !== 'string') throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, 'ledger: budget window and clock paths must carry units');
  const [an, ad] = unitSi(doc, Object(dayUnit).unit);
  const [bn, bd] = unitSi(doc, clock.unit);
  const num = an * bd;
  const den = ad * bn;
  const perDay = den > 0n && num % den === 0n ? Number(num / den) : NaN;
  if (!Number.isInteger(perDay) || perDay <= 0) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, 'ledger: day unit / clock unit must have a positive integer ratio in the units table');
  const genesis = Number(readPath(state, engine.P.genesis_genesisMinute()));
  return Math.floor((clockMinute(engine, state) - genesis) / perDay);
}

/**
 * 限额通道的腿（卷六 §4.1 规则 6）：须有 rules.economyLedger.budget[资源][代号] 窗口行，没有即 E-ACT-WRITER-NOT-READY（边界供货与日终分配未建）；
 * 窗口 limit 非空（要按比例分配）同此拒为 E-LEDGER-CAPPED-DIRECT（分配入口未建）；当日不在 [activeFromDay, activeToDay] 之内即 E-LEDGER-CAPPED-DIRECT。
 * @param {LedgerEngine} engine @param {string} resource @param {string} code @param {number} day
 */
function checkCapped(engine, resource, code, day) {
  const w = Object(Object(Object(ruleValue(engine.docData, LEDGER, RULE.budget))[resource])[code]);
  if (!Object.hasOwn(w, WINDOW.limit)) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${resource} ${code}: capped channel has no budget window, wait for ${UNBUILT.noWindow}`);
  if (w[WINDOW.limit] !== null) throw new KernelError('E-LEDGER-CAPPED-DIRECT', {}, `${resource} ${code}: a limited capped channel must go through the daily allocation, wait for ${UNBUILT.noWindow}`);
  if (!(Number.isInteger(w[WINDOW.from]) && Number.isInteger(w[WINDOW.to]) && w[WINDOW.from] <= day && day <= w[WINDOW.to])) {
    throw new KernelError('E-LEDGER-CAPPED-DIRECT', {}, `${resource} ${code}: day ${day} is outside the budget window`);
  }
}

// 转让性（卷六 §2.1 transferable；§4.1 规则 7）：按值查表，表外即 E-DIM-STRUCT-FIELD。持有人多于一个（真有对手）才核。
/** @type {Record<string, (resource: string, row: Row) => void>} */
const BY_TRANSFERABLE = {
  tr_free: () => {},
  tr_restricted: (resource, row) => {
    if (row[ROW.counterpartRX] === null) throw new KernelError('E-LEDGER-TRANSFER-RESTRICTED', {}, `${resource}: restricted and no counterpart condition registered`);
    throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${resource}: counterpartRX is not evaluable yet, wait for ${UNBUILT.counterpart}`);
  },
  tr_bound: (resource) => {
    throw new KernelError('E-LEDGER-TRANSFER-RESTRICTED', {}, `${resource}: bound to its issuer, no transfer between holders (issuer not registered on resource rows)`);
  },
};

/**
 * 腿的规整（按腿序）：账户腿核账户串与已开户、增减量为非零安全整数；来源去处腿核代号在该族、在资源种类行的 sources/sinks 之内（否则 E-LEDGER-CODE-UNREGISTERED）、数量为正。
 * 账户腿、来源去处腿分两张表返回（各保腿序），另给按原腿序的事件载荷。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {unknown[]} legs
 * @returns {{accounts: Array<{account: Account, text: string, delta: number}>, flows: Array<{field: string, family: string, code: string, resource: string, qty: number, sign: number}>, payload: Array<Record<string, unknown>>}}
 */
function normalizeLegs(engine, state, legs) {
  /** @type {ReturnType<typeof normalizeLegs>} */
  const out = { accounts: [], flows: [], payload: [] };
  for (const leg of legs) {
    const l = Object(leg);
    const flow = FLOW_LEGS.filter((f) => Object.hasOwn(l, f.field));
    const isAccount = Object.hasOwn(l, 'account');
    if (flow.length + (isAccount ? 1 : 0) !== 1) throw new KernelError('E-EFF-PARAM', {}, 'post: each leg needs exactly one of account, source, sink');
    if (isAccount) {
      const account = parseAccount(engine, l.account);
      if (!Number.isSafeInteger(l.delta) || l.delta === 0) throw new KernelError('E-EFF-PARAM', {}, `post: leg ${l.account} delta must be a non-zero safe integer`);
      if (balanceOf(engine, state, account) === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `post: account ${l.account} is not open`);
      out.accounts.push({ account, text: String(l.account), delta: Number(l.delta) });
      out.payload.push({ account: String(l.account), delta: Number(l.delta) });
      continue;
    }
    const f = flow[0];
    const code = l[f.field];
    vocabEntry(engine, f.family, code);
    if (!isQty(l.qty)) throw new KernelError('E-EFF-PARAM', {}, `post: ${f.field} leg qty must be a positive safe integer`);
    const row = resourceRow(engine, l.resource);
    if (!codesOf(row, f.rowSet).includes(code)) throw new KernelError('E-LEDGER-CODE-UNREGISTERED', {}, `post: ${code} is not in ${l.resource}.${f.rowSet}`);
    out.flows.push({ field: f.field, family: f.family, code: String(code), resource: String(l.resource), qty: Number(l.qty), sign: f.sign });
    out.payload.push({ [f.field]: String(code), resource: String(l.resource), qty: Number(l.qty) });
  }
  return out;
}

/**
 * kernelApi post（卷六 :289 账本唯一写入口；§4.1 规则 2–7、13）：一笔之内全成或全败（任一核对不过即抛，事务整笔撤回）。
 * 核：腿形与已开户（normalizeLeg）；逐资源种类 L − S + K = 0（E-LEDGER-UNBALANCED）；来源去处条目 pairedWith 所指代号在同笔（E-LEDGER-PAIR-MISSING）；
 * 限额通道窗口（checkCapped）；同一资源种类的账户腿涉及多于一个持有人时按 transferable 核（BY_TRANSFERABLE）；按腿序逐条记账，任一腿使余额为负即 E-LEDGER-NEGATIVE。
 * 写：accounts.<持有人>、trackOutflow 为真的用途分区减量腿记 outflowTotals.<持有人>（规则 13）、来源去处腿记 ledgerTotals 的 cumulative 与当日 usedByDay；
 * 记完经 txEmit 发事件 {verb: reason, payload: {legs, refs}, targets: 账户持有人}，随事务提交进日志簿。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {{legs: unknown[], reason: string, refs?: Record<string, unknown>}} entry @param {unknown} tx
 */
export function post(engine, state, entry, tx) {
  const { P } = engine;
  const e = Object(entry);
  if (!Array.isArray(e.legs) || e.legs.length === 0) throw new KernelError('E-EFF-PARAM', {}, 'post: legs must be a non-empty array');
  vocabEntry(engine, FAM.verb, e.reason);
  const refs = e.refs === undefined ? {} : e.refs;
  if (!isObj(refs)) throw new KernelError('E-EFF-PARAM', {}, 'post: refs must be a plain object');
  const { accounts, flows, payload } = normalizeLegs(engine, state, e.legs);
  /** @type {Map<string, {l: number, f: number, holders: Set<string>}>} */
  const byResource = new Map();
  const tally = (/** @type {string} */ r) => {
    const had = byResource.get(r);
    if (had !== undefined) return had;
    /** @type {{l: number, f: number, holders: Set<string>}} */
    const fresh = { l: 0, f: 0, holders: new Set() };
    byResource.set(r, fresh);
    return fresh;
  };
  for (const leg of accounts) { const t = tally(leg.account.resource); t.l += leg.delta; t.holders.add(leg.account.holder); }
  for (const leg of flows) tally(leg.resource).f += leg.sign * leg.qty;
  for (const [resource, t] of byResource) {
    if (t.l !== t.f) throw new KernelError('E-LEDGER-UNBALANCED', {}, `post: ${resource} accounts net ${t.l} but sources minus sinks ${t.f}`);
  }
  const day = worldDay(engine, state);
  for (const leg of flows) {
    const ent = vocabEntry(engine, leg.family, leg.code);
    const pair = ent[ENTRY.pairedWith];
    if (pair !== null && pair !== undefined && !flows.some((o) => o.code === pair)) throw new KernelError('E-LEDGER-PAIR-MISSING', {}, `post: ${leg.code} needs ${pair} in the same post`);
    if (ent[ENTRY.budgetMode] === CAPPED) checkCapped(engine, leg.resource, leg.code, day);
  }
  for (const [resource, t] of byResource) {
    if (t.holders.size <= 1) continue;
    const row = resourceRow(engine, resource);
    const tr = String(row[ROW.transferable]);
    const rule = Object.hasOwn(BY_TRANSFERABLE, tr) ? BY_TRANSFERABLE[tr] : undefined;
    if (rule === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${resource}: transferable ${JSON.stringify(tr)} has no rule`);
    rule(resource, row);
  }
  /** @type {Map<string, HolderBook>} */
  const books = new Map();
  /** @type {Map<string, HolderOutflow>} */
  const outflows = new Map();
  for (const leg of accounts) {
    const a = leg.account;
    const book = books.get(a.holder) || books.set(a.holder, clone(holderAccounts(engine, state, a.holder))).get(a.holder);
    const cell = Object(Object(book)[a.purpose])[a.resource];
    const next = Number(cell[a.key]) + leg.delta;
    if (next < 0) throw new KernelError('E-LEDGER-NEGATIVE', {}, `post: account ${leg.text} would go negative`);
    cell[a.key] = next;
    if (leg.delta < 0 && vocabEntry(engine, FAM.purpose, a.purpose)[ENTRY.trackOutflow] === true) {
      const cur = readPath(state, P.outflowTotals(a.holder));
      const out = outflows.get(a.holder) || outflows.set(a.holder, clone(isObj(cur) ? cur : {})).get(a.holder);
      const byRes = { ...Object(Object(out)[a.purpose]) };
      const byKey = { ...Object(byRes[a.resource]) };
      byKey[a.key] = { cumulative: Number(Object(byKey[a.key]).cumulative || 0) - leg.delta };
      byRes[a.resource] = byKey;
      Object(out)[a.purpose] = byRes;
    }
  }
  for (const holder of [...books.keys()].sort(cmp)) writePath(state, P.accounts(holder), books.get(holder), tx);
  for (const holder of [...outflows.keys()].sort(cmp)) writePath(state, P.outflowTotals(holder), outflows.get(holder), tx);
  if (flows.length > 0) {
    const cur = readPath(state, P.ledgerTotals());
    const totals = clone(isObj(cur) ? cur : {});
    for (const leg of flows) {
      const byCode = totals[leg.resource] = { ...Object(totals[leg.resource]) };
      const c = Object(byCode[leg.code]);
      const used = Array.isArray(c.usedByDay) ? [...c.usedByDay] : [];
      const last = used.length > 0 ? Object(used[used.length - 1]) : undefined;
      if (last !== undefined && last.day > day) throw new KernelError('E-LEDGER-USEDBYDAY-ORDER', {}, `post: ${leg.resource} ${leg.code} usedByDay already has day ${last.day} after ${day}`);
      if (last !== undefined && last.day === day) used[used.length - 1] = { day, used: last.used + leg.qty };
      else used.push({ day, used: leg.qty });
      byCode[leg.code] = { cumulative: Number(c.cumulative || 0) + leg.qty, usedByDay: used };
    }
    writePath(state, P.ledgerTotals(), totals, tx);
  }
  txEmit(tx, { verb: e.reason, payload: { legs: payload, refs: clone(refs) }, targets: [...new Set(accounts.map((l) => l.account.holder))].sort(cmp) });
}

/**
 * kernelApi transfer（卷六 :290，post 的两腿简写）：from 减 qty、to 加 qty，两账户须是同一资源种类 resource。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {{from: string, to: string, resource: string, qty: number, reason: string}} t @param {unknown} tx
 */
export function transfer(engine, state, t, tx) {
  const from = parseAccount(engine, t.from);
  const to = parseAccount(engine, t.to);
  if (from.resource !== t.resource || to.resource !== t.resource) throw new KernelError('E-EFF-PARAM', {}, `transfer: ${t.from} and ${t.to} must both hold ${t.resource}`);
  if (!isQty(t.qty)) throw new KernelError('E-EFF-PARAM', {}, 'transfer: qty must be a positive safe integer');
  post(engine, state, { legs: [{ account: t.from, delta: -t.qty }, { account: t.to, delta: t.qty }], reason: t.reason }, tx);
}

/**
 * transfer 原语的写者（卷九 :629；草案 §3 R0，经 state-owners systems.ledger.primitiveWriter 登记、内核 resolve 回落调用）：
 * 解析期核账户串，事由取 rules.economyLedger.primitiveReason；写入阶段调 transfer。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {{from: string, to: string, qty: number}} effect
 */
export function transferWriter(engine, state, effect) {
  const { resource } = parseAccount(engine, effect.from);
  parseAccount(engine, effect.to);
  const reason = String(ruleValue(engine.docData, LEDGER, RULE.primitiveReason));
  return { write: (/** @type {unknown} */ tx) => transfer(engine, state, { from: effect.from, to: effect.to, resource, qty: effect.qty, reason }, tx) };
}

/** transfer 原语写者的登记项（systems.ledger.primitiveWriter；economy 域 manifest 收齐）。 */
export const TRANSFER_WRITER = registerPrimitiveWriter('rules/economy/ledger.mjs#transferWriter', transferWriter);

/**
 * kernelApi balance（卷六 :354）：账户串所指账户的余额；没开户即 E-DIM-REF-MISSING。只读。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {string} accountKey @returns {number}
 */
export function balance(engine, state, accountKey) {
  const v = balanceOf(engine, state, parseAccount(engine, accountKey));
  if (v === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `balance: account ${accountKey} is not open`);
  return v;
}

/**
 * kernelApi accountsOf（卷六 :354）：持有人名下全部账户，按账户串排序，冻结。只读。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {string} holderId
 * @returns {ReadonlyArray<Readonly<{account: string, purpose: string, resource: string, key: string, balance: number}>>}
 */
export function accountsOf(engine, state, holderId) {
  /** @type {Array<Readonly<{account: string, purpose: string, resource: string, key: string, balance: number}>>} */
  const out = [];
  for (const [purpose, byRes] of Object.entries(holderAccounts(engine, state, holderId))) {
    for (const [resource, byKey] of Object.entries(Object(byRes))) {
      for (const [key, v] of Object.entries(Object(byKey))) {
        out.push(Object.freeze({ account: accountText(engine, { holder: holderId, purpose, resource, key }), purpose, resource, key, balance: Number(v) }));
      }
    }
  }
  return Object.freeze(out.sort((a, b) => cmp(a.account, b.account)));
}

/**
 * 全部账户（守恒核对用，ledger-check.mjs 调）：按登记模式 accounts.* 列出持有人与其余额表。只读。
 * 声明表没登记账本路径（engine.P 无 accounts 成员）即没有任何账户可写（writePath 只认登记路径），返回空。
 * @param {LedgerEngine} engine @param {LedgerState} state @returns {ReadonlyArray<{holder: string, book: HolderBook}>}
 */
export function allHolders(engine, state) {
  if (!Object.hasOwn(engine.P, 'accounts')) return [];
  return matchPaths(engine, state, engine.P.accounts(GRAMMAR_TOKENS.wildcard).pattern, {}).map((m) => ({ holder: m.keys[0], book: Object(m.value) }));
}

/**
 * rules.terminate.unbuilt 里登记为未建的 onTerminate 取值：拒收并写明等哪张卡（同 terminate.mjs 的未建数据门）。
 * @param {LedgerEngine} engine @param {string} what @returns {KernelError}
 */
function terminateNotReady(engine, what) {
  const u = Object(ruleValue(engine.docData, TERMINATE.table, TERMINATE.unbuilt));
  return new KernelError('E-ACT-WRITER-NOT-READY', {}, `${what}: not built yet, wait for ${String(u.card)}`);
}

// 资源种类行 onTerminate 的取值 → 余额去处的持有人（卷二 :556 第 3 步：successor 转给后继，remains 留在残骸上）。
// sink（转入登记的汇）在 rules.terminate.unbuilt 登记为未建；表外取值即 E-DIM-STRUCT-FIELD。
/** @type {Record<string, (engine: LedgerEngine, resource: string, row: Row, info: {mode: string, successorId: string | null}) => string>} */
const BY_ON_TERMINATE = {
  successor: (engine, resource, row, info) => {
    if (info.successorId === null) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${resource}: mode ${info.mode} has no successor, wait for ${UNBUILT.noSuccessor}`);
    return info.successorId;
  },
  // 留在残骸上（卷二 :556）：只有 wreck 模式有残骸（即后继）；salvageFraction 以外的部分入登记的汇（卷六 :119），汇未建，比例不是 1 即同 sink 拒。
  remains: (engine, resource, row, info) => {
    if (info.mode !== T.code_enum.successor_mode.wreck || info.successorId === null) throw new KernelError('E-ACT-WRITER-NOT-READY', {}, `${resource}: remains needs a wreck, mode ${info.mode}, wait for ${UNBUILT.noSuccessor}`);
    if (row[ROW.salvageFraction] !== 1) throw terminateNotReady(engine, `${resource}: salvageFraction ${JSON.stringify(row[ROW.salvageFraction])} sends the rest to a sink`);
    return info.successorId;
  },
};

/**
 * 终止清理：账户分流（卷二 §2.6 :556 第 3 步、:561 handler(engine, state, {id, cause, mode, successorId}, tx)；state-owners systems.ledgerTerminate.terminationCleanup）。
 * 被终止实体名下每个非零账户，按资源种类行 onTerminate 查 BY_ON_TERMINATE 得去处持有人，转进它名下同用途、同资源种类、同资源键的账户（没开即 openAccount，过 checkHolder）；
 * 全部腿合成一笔 post（全程守恒，事由 rules.economyLedger.terminateReason）。写完核本域残留：名下仍有非零余额即 E-TERM-RESIDUE（卷二 :558）。
 * @param {LedgerEngine} engine @param {LedgerState} state @param {{id: string, cause: string, mode: string, successorId: string | null}} info @param {unknown} tx
 */
export function settleAccountsOnTerminate(engine, state, info, tx) {
  const unbuilt = Object(ruleValue(engine.docData, TERMINATE.table, TERMINATE.unbuilt))[ROW.onTerminate];
  /** @type {Array<{account: string, delta: number}>} */
  const legs = [];
  for (const a of accountsOf(engine, state, info.id)) {
    if (a.balance === 0) continue;
    const row = resourceRow(engine, a.resource);
    const how = String(row[ROW.onTerminate]);
    if (Array.isArray(unbuilt) && unbuilt.includes(how)) throw terminateNotReady(engine, `${a.resource}: ${ROW.onTerminate} ${how}`);
    const to = Object.hasOwn(BY_ON_TERMINATE, how) ? BY_ON_TERMINATE[how] : undefined;
    if (to === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${a.resource}: ${ROW.onTerminate} ${JSON.stringify(how)} has no rule`);
    /** @type {Account} */
    const target = { holder: to(engine, a.resource, row, info), purpose: a.purpose, resource: a.resource, key: a.key };
    if (balanceOf(engine, state, target) === undefined) openAccount(engine, state, target.holder, { kind: target.resource, key: target.key }, target.purpose, tx);
    legs.push({ account: a.account, delta: -a.balance }, { account: accountText(engine, target), delta: a.balance });
  }
  if (legs.length > 0) post(engine, state, { legs, reason: String(ruleValue(engine.docData, LEDGER, RULE.terminateReason)) }, tx);
  const left = accountsOf(engine, state, info.id).filter((a) => a.balance !== 0).map((a) => a.account);
  if (left.length > 0) throw new KernelError('E-TERM-RESIDUE', {}, `terminate: ${info.id} still holds ${left.join(', ')}`);
}

/** 账户分流清理函数的登记项（systems.ledgerTerminate.terminationCleanup；economy 域 manifest 收齐）。 */
export const SETTLE_ACCOUNTS_CLEANUP = registerTerminationCleanup('rules/economy/ledger.mjs#settleAccountsOnTerminate', settleAccountsOnTerminate);
