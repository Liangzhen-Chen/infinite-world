// 事务模块的最小写入层（S1-1 卡 A；卷二 §2.7 :541 拒写处置、:545 唯一事务裸写者）。
// 本文件是内核里唯一对状态做裸写（赋值、删除）与持有撤销记录的地方；存储模块的全部写入经 txSet / txDelete。
// 作用域不放模块级登记（会触发 c_module_state）：writeScope 把作用域对象 tx 作为参数传给 fn，写函数显式收 tx。
// 事务与提案见下（卡 B1）；日志簿与存档在 save.mjs（卡 B2）。

import { KernelError, reportError } from './errors.mjs';
import { invalidateTop } from './memo.mjs';
import { checkValue } from './validate/types.mjs';
import { appendEntry, nextRequestSeq, tickEnd } from './save.mjs';
import { newState, kindOfEntity, createEntity, setEntityProp, readPath } from './storage.mjs';

/** @typedef {{engine: any, state: any, open: boolean, undo: Array<{obj: any, key: string, had: boolean, old: any}>, touched: any[], events: Array<Readonly<{verb: string, payload: any, targets: readonly string[]}>>}} WriteScope */

/**
 * 开写入作用域执行 fn(tx) 并返回结果；fn 抛错时按撤销记录逆序撤回本作用域全部写入（整笔撤销，卷二 :541 第 1 点），再原样抛出。
 * 撤销后作废本作用域碰过的顶层键缓存。作用域结束后 tx 失效。
 * 不做嵌套检测（不放模块级登记）：fn 内要继续写就用传入的 tx，不要再对同一 state 开新作用域。
 * @template T
 * @param {any} engine 装配层交入的 engine（挂在 tx.engine；writePath 从它取路径句柄 P 与登记表）
 * @param {any} state
 * @param {(tx: WriteScope) => T} fn
 * @returns {T}
 */
export function writeScope(engine, state, fn) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'state must be a plain object');
  if (typeof fn !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'writeScope needs a function');
  /** @type {WriteScope} */
  const tx = { engine, state, open: true, undo: [], touched: [], events: [] };
  try {
    return fn(tx);
  } catch (e) {
    for (let i = tx.undo.length - 1; i >= 0; i--) {
      const u = tx.undo[i];
      if (u.had) u.obj[u.key] = u.old;
      else delete u.obj[u.key];
    }
    for (const top of tx.touched) invalidateTop(state, top);
    throw e;
  } finally {
    tx.open = false;
  }
}

/** 核对 tx 是该 state 的、仍开着的写入作用域；否则抛。 @param {any} state @param {any} tx @returns {WriteScope} */
export function requireScope(state, tx) {
  if (tx === null || typeof tx !== 'object' || tx.open !== true || tx.state !== state || !Array.isArray(tx.undo)) {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'write outside an open write scope of this state');
  }
  return tx;
}

/** 写 obj[key] = value，先记撤销。 @param {any} tx @param {any} obj @param {string} key @param {any} value @returns {void} */
export function txSet(tx, obj, key, value) {
  requireScope(tx && tx.state, tx);
  tx.undo.push({ obj, key, had: Object.hasOwn(obj, key), old: obj[key] });
  obj[key] = value;
}

/** 删 obj[key]，先记撤销。 @param {any} tx @param {any} obj @param {string} key @returns {void} */
export function txDelete(tx, obj, key) {
  requireScope(tx && tx.state, tx);
  tx.undo.push({ obj, key, had: Object.hasOwn(obj, key), old: obj[key] });
  delete obj[key];
}

/**
 * 事务内发事件（S2-0a；卷二 :557 终止事件、卷二十四 :356 事件日志归内核；勘误 1126s20）：记进本作用域的事件缓冲，不认识任何动词。
 * 事务提交后由提交方按序追加进日志簿；事务回滚即整批丢弃（随作用域失效）。record = {verb, payload, targets}：verb 是非空代号串，
 * payload 是普通对象，targets 是实体 id 串的数组；不合即 E-DIM-STRUCT-FIELD。
 * @param {any} tx @param {{verb: string, payload: Record<string, any>, targets: string[]}} record @returns {void}
 */
export function txEmit(tx, record) {
  const scope = requireScope(tx && tx.state, tx);
  const r = record !== null && typeof record === 'object' ? record : /** @type {any} */ ({});
  const ok = typeof r.verb === 'string' && r.verb.length > 0 && r.payload !== null && typeof r.payload === 'object' && !Array.isArray(r.payload)
    && Array.isArray(r.targets) && r.targets.every((/** @type {unknown} */ t) => typeof t === 'string' && t.length > 0);
  if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'txEmit: record must be {verb, payload: object, targets: string[]}');
  scope.events.push(Object.freeze({ verb: r.verb, payload: r.payload, targets: Object.freeze([...r.targets]) }));
}

/** 写完作废该顶层键缓存，并记下它：撤销时再作废一次。 @param {any} tx @param {any} topKey @returns {void} */
export function txTouch(tx, topKey) {
  const scope = requireScope(tx && tx.state, tx);
  scope.touched.push(topKey);
  invalidateTop(scope.state, topKey);
}

// ---- 卡 B1：事务与提案（卷二 :539–:545、卷二十七 :742；存档与重放是卡 B2）----

// 「事务已开」登记：engine.openStates（装配层建的 WeakSet，不放模块级、不挂在 state 上）。

/**
 * 开一笔事务执行 fn(tx)：成功返回 {ok:true, value, events}（events 是本事务经 txEmit 发出的事件，按发出次序）；fn 抛错整笔撤回，带登记码的错误经 report 记被拒码并返回 {ok:false, code}；
 * 无登记码的错误撤回后原样抛出。不嵌套：作用域内再调即抛；不重试。
 * @template T
 * @param {any} engine
 * @param {any} state
 * @param {(tx: WriteScope) => T} fn
 * @returns {{ok: boolean, value?: T, code?: any, events?: ReadonlyArray<Readonly<{verb: string, payload: any, targets: readonly string[]}>>}}
 */
export function runTransaction(engine, state, fn) {
  const open = engine.openStates;
  if (open.has(state)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'nested transaction');
  open.add(state);
  try {
    /** @type {ReadonlyArray<Readonly<{verb: string, payload: any, targets: readonly string[]}>>} */
    let events = [];
    const value = writeScope(engine, state, (tx) => { const v = fn(tx); events = Object.freeze([...tx.events]); return v; });
    return { ok: true, value, events };
  } catch (e) {
    return { ok: false, code: reportError(e) };
  } finally {
    open.delete(state);
  }
}

/**
 * 装配初始 state：newState() 建空 state，再在一笔事务里依次调各顶层键登记写者的初始化函数 inits(engine, state, tx)；
 * 任一被拒即抛。装配层只传初始化函数，不自己碰 state。
 * @param {any} engine @param {Array<(engine: any, state: any, tx: WriteScope) => void>} inits @returns {any}
 */
export function buildState(engine, inits) {
  const fresh = newState();
  const r = runTransaction(engine, fresh, (tx) => { for (const init of inits) init(engine, fresh, tx); });
  if (!r.ok) throw new KernelError(/** @type {any} */ (r.code), {}, 'initial state build rejected');
  return fresh;
}

/**
 * 取下一个请求编号并把输入条目单独记进日志簿（卷二十七 :742 条目先单独提交；日志簿不在 state，天然在回滚之外）。
 * @param {any} engine @param {import('./save.mjs').LogBook} book @param {Record<string, any>} entry 不含 seq 的输入条目
 * @returns {number}
 */
export function recordInput(engine, book, entry) {
  const seq = nextRequestSeq(book);
  appendEntry(book, { seq, ...entry });
  return seq;
}

// 原语目录的参数简写 → 类型定义（卷二 §1.5 类型清单；判定交公共部件 validate/types.mjs#checkValue）。
// 加一种简写只添一行；未列入的简写一律拒收。id/dimension/ref/account 都是代号串；map 只核是对象、键为串，
// 值的具体维度类型由 storage 写入时按维度声明核（这里取 distribution 即不另核值，checkValue 对它无检查）。
const PARAM_TYPES = Object.freeze({
  integer: { type: 'integer' },
  number: { type: 'number' },
  id: { type: 'string' },
  dimension: { type: 'string' },
  ref: { type: 'string' },
  account: { type: 'string' },
  map: { type: 'map', key: { type: 'string' }, value: { type: 'distribution' } },
});

// 原语参数不含 ref 型定义，checkValue 的引用环境用不到；每次现造一份空环境（模块顶层不放 Map/Set，docs/gemini/kickoff-1125.md:64）。
const paramEnv = () => ({ vocab: { index: new Map(), families: new Set() }, kindOf: () => undefined, tableDims: new Map() });

/** 原语参数核对：规格经 PARAM_TYPES 转成类型定义，交公共部件 checkValue 判；认不出的规格一律拒收。 @param {any} spec @param {any} v @returns {boolean} */
function typeOk(spec, v) {
  const def = typeof spec === 'string' && Object.hasOwn(PARAM_TYPES, spec) ? PARAM_TYPES[spec] : undefined;
  if (def === undefined) return false;
  let ok = true;
  checkValue(def, v, paramEnv(), {}, () => { ok = false; });
  return ok;
}

/** @param {Record<string, any>} fields @param {any} effect @returns {boolean} */
function fieldsOk(fields, effect) {
  return Object.keys(fields).every((k) => Object.hasOwn(effect, k) && typeOk(fields[k], effect[k]));
}

/** 按原语条目核一个 effect 的 required、unless、oneOf；不合即抛 E-EFF-PARAM。 */
function checkEffect(prim, effect) {
  const bad = (/** @type {string} */ why) => new KernelError('E-EFF-PARAM', {}, `${prim.op}: ${why}`);
  if (prim.required && !fieldsOk(prim.required, effect)) throw bad('required parameter missing or wrong type');
  for (const u of prim.unless || []) {
    if (effect[u.field] !== u.notEquals && !fieldsOk(u.required || {}, effect)) throw bad(`parameters required unless ${u.field}`);
  }
  for (const group of prim.oneOf || []) {
    if (group.filter((/** @type {any} */ alt) => fieldsOk(alt, effect)).length !== 1) throw bad('oneOf group not satisfied exactly once');
  }
}

// 原语 → 处理函数 分派表（唯一一处；键取 primitives.json 的 op）。处理函数只做 resolve，不直接写状态。
/** @type {Record<string, (engine: any, state: any, effect: any, ctx: {seq: number, index: number}) => {write?: (tx: WriteScope) => void, advanceMinutes?: number}>} */
const HANDLERS = {
  time: (engine, state, effect) => {
    if (effect.minutes <= 0) throw new KernelError('E-EFF-PARAM', {}, 'time.minutes must be a positive integer');
    return { advanceMinutes: effect.minutes };
  },
  create: (engine, state, effect, ctx) => {
    const rec = engine.registry && engine.registry.kindIds instanceof Map ? engine.registry.kindIds.get(effect.kind) : undefined;
    const prefix = rec && Array.isArray(rec.idPrefix) ? rec.idPrefix[0] : undefined;
    if (typeof prefix !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, `kind ${effect.kind}: no id prefix to derive an id`);
    // 原语目录的 create 不带 id：id = 该种类首个前缀 + 请求编号（同请求内多个 create 追加序号），确定性。
    const id = ctx.index === 0 ? `${prefix}${ctx.seq}` : `${prefix}${ctx.seq}_${ctx.index}`;
    // template 须是该 kind 表里登记的实体行 id（卷二:128、:131；卷九:640）；不是即拒收。mark 不带 template。
    if (Object.hasOwn(effect, 'template')) {
      const tpl = effect.template;
      const tables = engine.registry && engine.registry.tables instanceof Map ? engine.registry.tables : undefined;
      const doc = tables ? tables.get(effect.kind) : undefined;
      const rows = doc && doc.rows !== null && typeof doc.rows === 'object' ? doc.rows : {};
      if (kindOfEntity(engine, state, tpl) !== effect.kind || !Object.hasOwn(rows, tpl)) {
        throw new KernelError('E-DIM-REF-MISSING', {}, `create.template ${JSON.stringify(tpl)}: not a registered ${effect.kind} entity row`);
      }
    }
    return {
      write: (tx) => {
        createEntity(state, id, effect.kind, {}, tx, effect.template);
        for (const [field, value] of Object.entries(effect.facts)) setEntityProp(state, id, field, value, tx);
      },
    };
  },
  // destroy（卷九 :641 实体终止协议）：解析时核实体存在；写入阶段调装配层注入的 engine.lifecycle.destroy（规则层按登记路由，草案 §4.1），没有注入即 E-EFF-PARAM。
  destroy: (engine, state, effect) => {
    kindOfEntity(engine, state, effect.entity);
    const life = engine.lifecycle;
    if (life === null || typeof life !== 'object' || typeof life.destroy !== 'function') throw new KernelError('E-EFF-PARAM', {}, 'destroy: engine.lifecycle.destroy is not assembled');
    return { write: (tx) => { life.destroy(state, effect.entity, tx); } };
  },
  'fact.set': (engine, state, effect) => ({
    write: (tx) => {
      const { P } = engine;
      const value = Object.hasOwn(effect, 'value') ? effect.value : readPath(state, P.created_props(effect.entity, effect.field)) + effect.delta;
      setEntityProp(state, effect.entity, effect.field, value, tx);
    },
  }),
};

/**
 * 该原语有没有登记处理函数（只读分派表，不暴露表本身）。动作目录加载期据此核「动作可达的原语都有处理函数」（S1-3a；草案 §2.2：防菜单里出现点了必拒的动作）。
 * @param {string} op @returns {boolean}
 */
export function handlesOp(op) {
  return typeof op === 'string' && Object.hasOwn(HANDLERS, op);
}

/** resolve：逐个 effect 核原语与参数并取处理结果。未登记原语或无处理函数一律拒收。 */
function resolve(engine, state, proposal, seq) {
  if (proposal === null || typeof proposal !== 'object' || !Array.isArray(proposal.effects)) throw new KernelError('E-EFF-PARAM', {}, 'proposal.effects must be an array');
  const writes = [];
  let advanceMinutes = 0;
  proposal.effects.forEach((/** @type {any} */ effect, /** @type {number} */ index) => {
    if (effect === null || typeof effect !== 'object' || typeof effect.op !== 'string') throw new KernelError('E-EFF-PRIMITIVE', {}, 'effect needs an op');
    const prim = engine.primitives instanceof Map ? engine.primitives.get(effect.op) : undefined;
    if (!prim) throw new KernelError('E-EFF-PRIMITIVE', {}, `op ${effect.op}: not in primitives catalog`);
    checkEffect(prim, effect);
    const h = Object.hasOwn(HANDLERS, effect.op) ? HANDLERS[effect.op] : undefined;
    if (!h) throw new KernelError('E-EFF-PRIMITIVE', {}, `op ${effect.op}: no handler registered`);
    const out = h(engine, state, effect, { seq, index });
    if (out.write) writes.push(out.write);
    advanceMinutes += out.advanceMinutes || 0;
  });
  return { writes, advanceMinutes };
}

/**
 * 外来输入的唯一处理管线（卷二十七 :742）：先把输入条目单独记进日志簿 → resolve → 单事务 execute → 事务提交后记结果事件
 * （日志簿不随事务回滚）→ 事务外按 advanceMinutes 纯推进 → tickEnd（刻边界）。条目的 kind 只作标签留在日志，这里不按它分支；
 * 玩家指令与推进请求都以效果原语提案 input.proposal 处理；带意图 input.intent 的条目（菜单动作，S1-3a）先经装配层注入的
 * engine.resolveIntent 收窄成提案，收窄被拒即记拒绝事件（卷二:545 被拒请求按请求编号留在输入序列，复演时同处同样被拒）。
 * 复演对每条输入条目也走这里，意图在复演时按同一目录重新收窄。
 * @param {any} engine @param {any} state @param {import('./save.mjs').LogBook} book
 * @param {{kind: string, proposal?: {effects: Array<Record<string, any>>}, intent?: unknown}} input 不含 seq 的输入条目
 * @returns {{ok: boolean, code?: string, seq: number, advancedMinutes: number}}
 */
export function processInput(engine, state, book, input) {
  const seq = recordInput(engine, book, input);
  try {
    if (!Object.hasOwn(input, 'intent')) return processProposal(engine, state, book, input.proposal, seq);
    const plan = typeof engine.resolveIntent === 'function' ? engine.resolveIntent(state, input.intent) : { ok: false, code: 'E-ACT-UNKNOWN' };
    if (!plan.ok) {
      appendEntry(book, { seq, kind: 'event', ok: false, code: plan.code });
      return { ok: false, code: plan.code, seq, advancedMinutes: 0 };
    }
    return processProposal(engine, state, book, plan.proposal, seq);
  } finally {
    tickEnd(engine, state, book);
  }
}

/**
 * 提交意图（菜单动作，S1-3a）：输入条目 {kind: command, intent} 先单独记进日志（卷二十七 :742），再走 processInput 的意图分支。
 * @param {any} engine @param {any} state @param {import('./save.mjs').LogBook} book @param {unknown} intent
 * @returns {{ok: boolean, code?: string, seq: number, advancedMinutes: number}}
 */
export function submitIntent(engine, state, book, intent) {
  return processInput(engine, state, book, { kind: 'command', intent });
}

/**
 * 提交提案（玩家指令）：输入条目标签 command，走 processInput。
 * @param {any} engine @param {any} state @param {import('./save.mjs').LogBook} book @param {{effects: Array<Record<string, any>>}} proposal
 * @returns {{ok: boolean, code?: string, seq: number, advancedMinutes: number}}
 */
export function submitProposal(engine, state, book, proposal) {
  return processInput(engine, state, book, { kind: 'command', proposal });
}

/** submitProposal 的处理段（条目已记）。 @param {any} engine @param {any} state @param {any} book @param {any} proposal @param {number} seq */
function processProposal(engine, state, book, proposal, seq) {
  let plan;
  try {
    plan = resolve(engine, state, proposal, seq);
  } catch (e) {
    const code = reportError(e);
    appendEntry(book, { seq, kind: 'event', ok: false, code });
    return { ok: false, code, seq, advancedMinutes: 0 };
  }
  if (plan.advanceMinutes > 0 && typeof engine.advance !== 'function') {
    appendEntry(book, { seq, kind: 'event', ok: false, code: 'E-EFF-PARAM' });
    return { ok: false, code: 'E-EFF-PARAM', seq, advancedMinutes: 0 };
  }
  const r = runTransaction(engine, state, (tx) => { for (const w of plan.writes) w(tx); });
  if (!r.ok) {
    appendEntry(book, { seq, kind: 'event', ok: false, code: r.code });
    return { ok: false, code: r.code, seq, advancedMinutes: 0 };
  }
  appendEntry(book, { seq, kind: 'event', ok: true, advanceMinutes: plan.advanceMinutes });
  // 事务内经 txEmit 发出的事件随提交按序记进日志簿（卷二 :557；回滚的事务没有这一步）。
  for (const ev of r.events || []) appendEntry(book, { seq, kind: 'event', ok: true, verb: ev.verb, payload: ev.payload, targets: ev.targets });
  if (plan.advanceMinutes > 0) {
    const a = engine.advance(state, book, plan.advanceMinutes);
    if (a.ok) return { ok: true, seq, advancedMinutes: a.advancedMinutes };
    // 推进中途被拒：上面那条 ok:true 已提交，另追加一条如实的失败事件（产品原则一.4、二.4）。
    appendEntry(book, { seq, kind: 'event', ok: false, code: a.code, advancedMinutes: a.advancedMinutes });
    return { ok: false, code: a.code, seq, advancedMinutes: a.advancedMinutes };
  }
  return { ok: true, seq, advancedMinutes: 0 };
}
