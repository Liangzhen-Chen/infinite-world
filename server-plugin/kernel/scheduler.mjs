// 调度器（卷二十《时间日历天气与环境》§4.1 刻、同刻全序、调度器与到期语义；§2.1 rules.clock、due_kind、reaction_priority；§3.2 唯一写者）。
// 块 4 第 4-1 张《调度器骨架、同刻全序与时钟入口》：由 old-final-1117 server-plugin/scheduler.mjs 改了搬（方案 §1.2 第 10 行 :53）。
//   搬：六段 tick_stage、同刻全序键与比较、争夺裁决（价、先到、位次、抽签与多标的整单分配）、每刻推进驱动。
//   改：键段只有整数位次与代号（§4.1.3 第 4 条 :494–501）——到期项按 due_kind.rank、反应项按 reaction_priority.rank、层按整数 layerRank，
//       不再有中文类名、中文层键、优先类字串（M20-2、M20-3、M20-5）；常数进 rules.clock（M20-1，卷一 R-6）；争夺缺省表进 rules.clock.contestDefault
//       （CONTEST_RULES，方案 :53），按标的种类的旧分派不转；中文原因文字删去，败者的原因就是该标的的争夺方式代号（M20-4 改原因代号）；
//       骰值键不在本文件拼、不用 createHash：抽签的抽取值由调用方经 draw 接口给出，五段键构造待 4-3（kernel/sample.mjs，卷二十 :508、R27-8.5）；
//       config_set 写上限与按环境变量切新旧路径的开关退役（M20-7、M20-8，§4.1.3 第 7、8 条）。
//   新：clockView、整刻作废的刻级回退点（§4.1.3 第 7 条，回退能力在 kernel/transaction.mjs 刻日志）、墙钟能力 createWallTimer（卷二 §2.9 第 0 条 WallTimerCap）、
//       rules.clock 与 due_kind、reaction_priority 条目的加载校验 checkClockTables。
// 块 4 第 4-2 张《到期堆、推进钩子与整刻作废》（体检 块4.md 第四节 4-2 条：K4-01 后半、K4-04 后半、K4-10、K4-11、K4-12、K4-28、K4-43、K4-46）：
//   到期项 due.<句柄>（struct:dueItem 五字段，§4.1.1）与按 dueMinute 的到期堆、schedule/cancel、墓碑（取消只删状态行，堆里旧项弹出时丢弃，§4.1.3 第 5 条）；
//   入堆缩放只在 schedule 一处、按 due_kind.paceClass（§4.10.3 第 2、6 条 :969、:973），系数是 rules.clock.paceFactor 一项显式配置（待补，李白 11-18 02:40 K4-43）；
//   钩子节拍对齐绝对分钟（§4.1.3 第 3 条）、cadence/phaseOffset 逐钩子加载核对（E-CLOCK-CADENCE，K4-46）；钩子函数经 kernel/advance-registry.mjs 交入；
//   反应队列按代广度优先（§4.1.3 第 4 条）、超 reactionDepthMax/proposalMax 即整刻作废并报 E-CLOCK-REACTION-LIMIT（李白 11-18 03:22 裁定①）。
//   不在本卡：骰值键与 sample（4-3）；advancePlan 的回调时机与层序、钩子节拍按层步长放大（块 6 卷二十七 §4.1 卡，K4-42 选 A）；
//   （到期事件 verb_due_elapsed 6-19 起由本文件 due 段自己发，订阅分发在 kernel/subscribers.mjs）；按实体撤销全部到期项（块 5 终止协议 e9，本卡只给 cancel）。
// 本文件只读登记数据（规则表、词表条目字段、单位表），不认任何具体到期项种类、钩子、阶段名或实体 id；字串字面量只有 ASCII（§4.1.6 扫描式）。

import { KernelError } from './errors.mjs';
import { checkValue, markersOf } from './validate/types.mjs';
const HANDLE_PREFIX = 'due_';
import { readPath, writePath } from './storage.mjs';
import { P } from './handles/generated.mjs';
import { runTransaction, openTickJournal, closeTickJournal, rollbackTickJournal, currentTransaction } from './transaction.mjs';
import { invalidateMemo } from './memo.mjs';
import { report } from './report.mjs';
import { registry } from './vocab.mjs';
import { CODE_RE } from './validate/types.mjs';
import { advanceHook, advanceHookNames } from './advance-registry.mjs';
import { snakeCaseKey } from './handles/keys.mjs';
import { emit } from './events.mjs';

// ---------- 代码内封闭枚举（卷二十 §8 问题 5 :1318 列为代码内封闭、不登卷二） ----------

/** tick_stage：一刻内六段，按位次排（§4.1.3 第 4 条 :495"沿用现调度器六段"）。 */
export const TICK_STAGE = Object.freeze(['external', 'due', 'clock', 'contest', 'reaction', 'assertion']);
/** pace_class：延迟类、均衡类（§2.10 :408）。due_kind.paceClass 取其一。 */
export const PACE_CLASS = Object.freeze(['equilibrium', 'latency']);
// 节拍阶段与 paces 的族句柄：成员由上面的 TICK_STAGE、PACE_CLASS 派生。
const STAGE = markersOf('tick_stage', TICK_STAGE);
const PACE = markersOf('pace_class', PACE_CLASS);
/** 争夺方式：每种是一段裁决算法（旧 CONTEST_RULES 的四值），代码内封闭；哪个标的用哪种由数据给（rules.clock.contestDefault 与提案的 contest）。 */
export const CONTEST_MODES = Object.freeze(['arrival', 'lottery', 'price', 'rank']);

// 卷二十定义的结构名（表代号、词表族、状态路径、单位代号），不是内容数据。
const SCHEMA = Object.freeze({
  table: 'clock',
  tableKeys: Object.freeze(['cadence', 'contestDefault', 'drawSites', 'paceFactor', 'phaseOffset', 'proposalMax', 'reactionDepthMax']),
  // 两个上限的键（§2.1 :132；超了报 E-CLOCK-REACTION-LIMIT，信息带键名、上限、实际值）。
  depthKey: 'reactionDepthMax',
  countKey: 'proposalMax',
  // 到期堆的状态顶层键（§3.2 :445 `due.*`，元素 struct:dueItem）。
  dueKey: 'due',
  clockKey: 'clock',
  constantsTable: 'kernelConstants',
  radixKey: 'handleRadix',
  dueNextField: 'dueNext',
  dueKind: 'due_kind',
  dueFields: Object.freeze(['calendarBound', 'floorRX', 'paceClass', 'rank']),
  reactionPriority: 'reaction_priority',
  reactionFields: Object.freeze(['rank']),
  docFields: Object.freeze(['basis']),
  file: 'kernel/scheduler.mjs',
  // 日 = 1440 分钟是单位换算（§4.1.3 第 1 条 :491），由 _units.json 两行的 si 之比得出，不写数。
  minuteUnit: 'minute',
  dayUnit: 'day',
  // 争夺方式各自比较的提案字段与方向（大者优先为真）。
  modeField: Object.freeze({ arrival: 'arrival', price: 'bid', rank: 'rank' }),
  modeHigh: Object.freeze({ arrival: false, price: true, rank: false }),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// 空字串（本文件内部）。
const SEG = Object.freeze({ empty: '' });
const isCode = (v) => typeof v === 'string' && v !== SEG.empty;

// ---------- 同刻全序键（§4.1.3 第 4 条） ----------

/**
 * 段的位次。不是六段之一即 E-DIM-DOMAIN-ENUM。
 * @param {string} stage
 * @returns {number}
 */
export function stageRank(stage) {
  const r = TICK_STAGE.indexOf(stage);
  if (r < 0) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, `tick_stage ${JSON.stringify(stage)}: want one of ${TICK_STAGE.join(', ')}`);
  return r;
}

function int(v, what) {
  if (!Number.isSafeInteger(v)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `order key ${what}: want a safe integer`);
  return v;
}
function word(v, what) {
  if (!isCode(v)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `order key ${what}: want a non-empty code or id`);
  return v;
}
const frozen = (parts) => Object.freeze(parts);

/**
 * 到期项（due 段）：(stage, due_kind.rank, layerRank, owner, ref, registeredMinute)（§4.1.3 第 4 条 :498）。
 * @param {{kindRank: number, layerRank: number, owner: string, ref: string, registeredMinute: number}} k
 * @returns {readonly (number|string)[]}
 */
export function dueKey(k) {
  return frozen([stageRank('due'), int(k.kindRank, 'kindRank'), int(k.layerRank, 'layerRank'), word(k.owner, 'owner'), word(k.ref, 'ref'), int(k.registeredMinute, 'registeredMinute')]);
}

/**
 * 钩子项（clock 段）：(stage, phase 位次, sortKey, layerRank, 钩子代号, 对象 id)（§4.1.3 第 4 条 :496；phase 位次与 sortKey 取 state-owners.json，卷二 §2.7 :768）。
 * @param {{phaseRank: number, sortKey: number, layerRank: number, hook: string, subject: string}} k
 * @returns {readonly (number|string)[]}
 */
export function clockKey(k) {
  return frozen([stageRank('clock'), int(k.phaseRank, 'phaseRank'), int(k.sortKey, 'sortKey'), int(k.layerRank, 'layerRank'), word(k.hook, 'hook'), word(k.subject, 'subject')]);
}

/**
 * 同一起因引出的反应项（reaction 段）：(stage, reaction_priority.rank, 规则包代号, 规则代号, 主体 id)（§4.1.3 第 4 条 :499）。
 * 代际广度优先与"同代按起因在本刻全序里的先后"由 4-2 的反应队列在外层排，本键只排同一起因下的各项。
 * @param {{priorityRank: number, pack: string, rule: string, subject: string}} k
 * @returns {readonly (number|string)[]}
 */
export function reactionKey(k) {
  return frozen([stageRank('reaction'), int(k.priorityRank, 'priorityRank'), word(k.pack, 'pack'), word(k.rule, 'rule'), word(k.subject, 'subject')]);
}

/**
 * 其余三段（external、contest、assertion）：(stage, layerRank, 来源代号, 主体 id)（§4.1.3 第 4 条 :500；卷文这三段不给 classRank）。
 * @param {'external'|'contest'|'assertion'} stage
 * @param {{layerRank: number, source: string, subject: string}} k
 * @returns {readonly (number|string)[]}
 */
export function sourceKey(stage, k) {
  const r = stageRank(stage);
  if (r === stageRank('due') || r === stageRank('clock') || r === stageRank('reaction')) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, `sourceKey: stage ${stage} has its own key`);
  return frozen([r, int(k.layerRank, 'layerRank'), word(k.source, 'source'), word(k.subject, 'subject')]);
}

/**
 * 键的字典序：逐段比，整数按数值、代号按码元序；同一位置两边类型不同即 E-DIM-DOMAIN-RANGE（键由上面的构造函数给出时不会发生）。
 * @param {readonly (number|string)[]} a
 * @param {readonly (number|string)[]} b
 * @returns {number}
 */
export function compareKeys(a, b) {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i];
    const y = b[i];
    if (typeof x !== typeof y) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `order keys differ in segment type at ${i}`);
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return a.length < b.length ? -1 : a.length > b.length ? 1 : 0;
}

function entryRank(engine, family, id) {
  const rec = typeof id === 'string' ? engine.vocab.index.get(id) : undefined;
  if (!rec || rec.family !== family) throw new KernelError('E-DIM-REF-MISSING', {}, `${JSON.stringify(id)} is not an entry of ${family}`);
  return rec.entry.rank;
}

/** due_kind 条目的 rank（到期项键的 classRank；§2.1 :140）。 @param {{vocab: any}} engine @param {string} kind @returns {number} */
export function dueKindRank(engine, kind) {
  return entryRank(engine, SCHEMA.dueKind, kind);
}

/** reaction_priority 条目的 rank（§2.1 :149）。 @param {{vocab: any}} engine @param {string} priority @returns {number} */
export function reactionPriorityRank(engine, priority) {
  return entryRank(engine, SCHEMA.reactionPriority, priority);
}

// ---------- 时钟（§3.1 clockView :420；§4.1.3 第 1 条） ----------

/**
 * 一日的分钟数：_units.json 里 day 与 minute 两行 si 之比；不是正整数即 E-DIM-UNIT-UNKNOWN。
 * @param {{units: Map<string, {si: number}>}} engine
 * @returns {number}
 */
export function minutesPerDay(engine) {
  const units = engine.units;
  const day = units instanceof Map ? units.get(SCHEMA.dayUnit) : undefined;
  const minute = units instanceof Map ? units.get(SCHEMA.minuteUnit) : undefined;
  const per = day && minute ? day.si / minute.si : NaN;
  if (!Number.isSafeInteger(per) || per < 1) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, `_units.json: ${SCHEMA.dayUnit}.si / ${SCHEMA.minuteUnit}.si must be a positive integer`);
  return per;
}

function clockField(state, path) {
  const v = readPath(state, path);
  if (!Number.isSafeInteger(v)) throw new KernelError('E-DIM-UNKNOWN-READ', {}, `${path} is not set (the clock starts at world creation)`);
  return v;
}

/**
 * kernelApi `clockView(engine, state)`：全书唯一的"现在几点"，{minute, day, seq}，全整数（卷二十 §3.1 :420）。
 * day 是世界日序 = minute 整除一日的分钟数（单位换算，T-3 豁免本文件）；seq 是事件日志位次，只是输出，不进任何排序键与抽取键（§3.2 :444）。
 * @param {{units: Map<string, {si: number}>}} engine
 * @param {any} state
 * @returns {Readonly<{minute: number, day: number, seq: number}>}
 */
export function clockView(engine, state) {
  const minute = clockField(state, P.clock_minute());
  const seq = clockField(state, P.clock_seq());
  return Object.freeze({ minute, day: Math.floor(minute / minutesPerDay(engine)), seq });
}

// ---------- 到期登记与到期堆（§4.1.1、§4.1.2 :487、§4.1.3 第 5 条；§4.10.3 第 2、6 条） ----------

/** @type {Readonly<Record<string, any>> | null} 加载期收下的 rules.clock（schedule 不收 engine，入堆缩放读它）。 */
let installedClock = null;
/** @type {number | null} 加载期收下的句柄序号进制。 */
let installedRadix = null;

/**
 * 加载期收下 rules.clock（加载入口在全部校验通过后调一次，与 installStorage 同时；kernel 组内用，不在 kernelApi）。
 * @param {Record<string, any>} rules engine.rules
 */
export function installScheduler(rules) {
  installedClock = isObj(rules) && isObj(rules[SCHEMA.table]) ? rules[SCHEMA.table] : null;
  // 句柄序号进制：内核常数表 kernelConstants.handleRadix（base36 小写，李白 11-18 03:31 裁定 2），不在代码里写字面量。
  const radix = isObj(rules) && isObj(rules[SCHEMA.constantsTable]) ? rules[SCHEMA.constantsTable][SCHEMA.radixKey] : undefined;
  installedRadix = Number.isInteger(radix) ? radix : null;
}

function handleRadix() {
  if (installedRadix === null) throw new Error(`kernel/scheduler.mjs: rules.${SCHEMA.constantsTable}.${SCHEMA.radixKey} missing (load order)`);
  return installedRadix;
}

function clockTable() {
  if (!installedClock) throw new Error('kernel/scheduler.mjs: schedule used before installScheduler (load order)');
  return installedClock;
}

/**
 * 入堆延迟（§4.10.3 第 2 条 :969；只在 schedule 入堆这一处做，第 6 条 :973）：延迟类 = max(下界, floor(原延迟 × den ÷ num))，下界由 floorRX 给、不小于 1 分钟；
 * 均衡类不缩放。num/den 取 rules.clock.paceFactor 这一项显式配置——五档系数与 pace.mjs 归块 7 首卡，块 4 期间全部延迟类按这一项（暂为 1/1，待补；
 * 李白 11-18 02:40 K4-43、卷二十 §4.10.5）。floorRX 非空的求值要卷十七等的读数，待首个延迟类条目所在卷接入：遇到即抛错，不静默按 1。
 * @param {Record<string, any>} clock rules.clock
 * @param {{paceClass: string, floorRX: unknown}} kindEntry due_kind 条目
 * @param {number} delay 原延迟（分钟，正整数）
 * @returns {number}
 */
export function enqueueDelay(clock, kindEntry, delay) {
  if (!Number.isSafeInteger(delay) || delay < 1) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'schedule: delayMinutes must be an integer >= 1');
  if (kindEntry.paceClass === PACE.equilibrium) return delay;
  if (kindEntry.paceClass !== PACE.latency) throw new KernelError('E-PACE-UNCLASSIFIED', {}, `due_kind paceClass ${JSON.stringify(kindEntry.paceClass)}`);
  const f = isObj(clock) ? clock.paceFactor : undefined;
  if (!isObj(f) || !Number.isSafeInteger(f.num) || !Number.isSafeInteger(f.den) || f.num < 1 || f.den < 1) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'rules.clock.paceFactor: want {num >= 1, den >= 1}');
  if (kindEntry.floorRX !== null) throw new Error('kernel/scheduler.mjs enqueueDelay: floorRX evaluation pending the first latency due_kind with a floor');
  const scaled = Math.floor((delay * f.den) / f.num);
  if (!Number.isSafeInteger(scaled)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'schedule: scaled delay out of safe integer range');
  return Math.max(1, scaled);
}

// 到期堆：按 state 分开（WeakMap），由 state.due 派生，不进存档；元素 {handle, dueMinute, registeredMinute}，按 dueMinute 小顶堆。
// 状态行是唯一真相：取消只删状态行，堆里那一项成墓碑，弹出时与状态行比对不符即丢弃（§4.1.3 第 5 条"取消只打墓碑，堆顶弹出时丢弃"）。
// 整刻作废后丢掉这份堆，下次用时从状态重建。
/** @type {WeakMap<object, {handle: string, dueMinute: number, registeredMinute: number}[]>} */
const heaps = new WeakMap();

const heapLess = (a, b) => a.dueMinute < b.dueMinute || (a.dueMinute === b.dueMinute && a.handle < b.handle);
function heapPush(h, e) {
  h.push(e);
  for (let i = h.length - 1; i > 0;) {
    const p = (i - 1) >> 1;
    if (!heapLess(h[i], h[p])) break;
    [h[i], h[p]] = [h[p], h[i]];
    i = p;
  }
}
function heapPop(h) {
  const top = h[0];
  const last = h.pop();
  if (h.length) {
    h[0] = last;
    for (let i = 0; ;) {
      const l = i + i + 1, r = l + 1; // 二叉堆的两个子下标
      let m = i;
      if (l < h.length && heapLess(h[l], h[m])) m = l;
      if (r < h.length && heapLess(h[r], h[m])) m = r;
      if (m === i) break;
      [h[i], h[m]] = [h[m], h[i]];
      i = m;
    }
  }
  return top;
}

const dueRows = (state) => (isObj(state) && isObj(state[SCHEMA.dueKey]) ? state[SCHEMA.dueKey] : {});
function heapOf(state) {
  let h = heaps.get(state);
  if (!h) {
    h = [];
    const rows = dueRows(state);
    for (const handle of Object.keys(rows).sort()) heapPush(h, { handle, dueMinute: rows[handle].dueMinute, registeredMinute: rows[handle].registeredMinute });
    heaps.set(state, h);
  }
  return h;
}
// 堆项仍是活的：状态行在，且两个时刻与入堆时一致（同一句柄取消后又登记，旧项也成墓碑）。
function live(state, e) {
  const row = dueRows(state)[e.handle];
  return isObj(row) && row.dueMinute === e.dueMinute && row.registeredMinute === e.registeredMinute;
}

// 事务内写、删 due.<句柄>（本文件是 due.* 唯一写者，§4.1.2；撤销项与 kernel/storage.mjs、kernel/ledger.mjs 同一格式，事务回滚与整刻作废照撤）。
function txSet(tx, segs, value) {
  let cur = tx.state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    if (!Object.hasOwn(cur, s) || !isObj(cur[s])) {
      tx.undo.push({ segs: segs.slice(0, i + 1), existed: Object.hasOwn(cur, s), prev: cur[s] });
      cur[s] = {};
    }
    cur = cur[s];
  }
  const last = segs[segs.length - 1];
  tx.undo.push({ segs: [...segs], existed: Object.hasOwn(cur, last), prev: cur[last] });
  if (value === undefined) delete cur[last]; else cur[last] = value;
  tx.written.push([...segs]);
  invalidateMemo(tx.state);
}

// 被拒即在当前事务上记"已被拒"：规则层 catch 住也照样整笔回滚（卷二 §2.6"事务内拒写的处置"，同 storage、ledger）。
function denied(e) {
  const tx = currentTransaction();
  if (tx && typeof e.code === 'string' && tx.denied === undefined) tx.denied = e;
  return e;
}

function txOrDeny(what) {
  const tx = currentTransaction();
  if (!tx) throw denied(new KernelError('E-VIEW-UNDECLARED-WRITE', {}, `${what} outside a transaction`));
  return tx;
}

/**
 * kernelApi `schedule(owner, kind, delayMinutes, ref)`：在当前事务里登记一个到期项，返回它的句柄（cancel 用；即 due.* 的 `*` 段，keyKinds `handle`）。
 * dueMinute = 当前分钟 + 入堆延迟（enqueueDelay）；registeredMinute = 当前分钟。同一 (owner, kind, ref) 至多一项，重复即 E-DUE-DUPLICATE（§4.1.1）；
 * kind 不是 due_kind 条目即 E-DUE-UNDECLARED；owner、ref 不合代号文法即 E-DIM-ID-FORMAT。句柄 = 'due_' + 世界状态里计数器 clock.dueNext 的 base36 小写值，
 * 随后计数器加 1（只增不回收，cancel 后不复用；计数器随存档走，同一存档重放得同一句柄；李白 11-18 03:31 裁定 2）。
 * 重复判断不靠句柄：按 (owner, kind, ref) 三项扫 due 行（§4.1.1 :483）。被拒即整笔回滚（计数器也回滚）。
 * @param {string} owner @param {string} kind @param {number} delayMinutes @param {string} ref
 * @returns {string}
 */
export function schedule(owner, kind, delayMinutes, ref) {
  const tx = txOrDeny('schedule');
  try {
    const rec = typeof kind === 'string' ? registry().vocabIndex.get(kind) : undefined;
    if (!rec || rec.family !== SCHEMA.dueKind) throw new KernelError('E-DUE-UNDECLARED', {}, `schedule: ${JSON.stringify(kind)} is not a ${SCHEMA.dueKind} entry`);
    for (const [what, v] of [['owner', owner], ['ref', ref]]) {
      if (typeof v !== 'string' || !CODE_RE.test(v)) throw new KernelError('E-DIM-ID-FORMAT', {}, `schedule: ${what} ${JSON.stringify(v)} is not a code (vol2 s1.9 code grammar)`);
    }
    const delay = enqueueDelay(clockTable(), rec.entry, delayMinutes);
    const now = clockField(tx.state, P.clock_minute());
    const dueMinute = now + delay;
    if (!Number.isSafeInteger(dueMinute)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'schedule: due minute out of safe integer range');
    for (const row of Object.values(dueRows(tx.state))) {
      if (row.owner === owner && row.kind === kind && row.ref === ref) throw new KernelError('E-DUE-DUPLICATE', { entity: owner }, `schedule: (${owner}, ${kind}, ${ref}) already in the due heap`);
    }
    const next = readPath(tx.state, P.clock_dueNext()) ?? 0;
    if (!Number.isSafeInteger(next) || next < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'schedule: clock.dueNext is not a non-negative integer');
    const handle = `${HANDLE_PREFIX}${next.toString(handleRadix())}`;
    txSet(tx, [SCHEMA.clockKey, SCHEMA.dueNextField], next + 1);
    txSet(tx, [SCHEMA.dueKey, handle], { dueMinute, kind, owner, ref, registeredMinute: now });
    if (heaps.has(tx.state)) heapPush(heaps.get(tx.state), { handle, dueMinute, registeredMinute: now });
    return handle;
  } catch (e) {
    throw (typeof e.code === 'string' ? denied(e) : e);
  }
}

/**
 * kernelApi `cancel(handle)`：在当前事务里撤销一个到期项——只删 due.<句柄> 这一行，堆里旧项成墓碑，弹出时丢弃；不改已发事件（§4.1.3 第 5 条）。
 * 句柄不合运行时句柄文法即 E-DIM-ID-FORMAT；堆里没有这一项即 E-DIM-REF-MISSING（不静默）。
 * @param {string} handle
 * @returns {void}
 */
export function cancel(handle) {
  const tx = txOrDeny('cancel');
  if (typeof handle !== 'string' || !CODE_RE.test(handle)) throw denied(new KernelError('E-DIM-ID-FORMAT', {}, `cancel: ${JSON.stringify(handle)} is not a runtime handle`));
  if (!Object.hasOwn(dueRows(tx.state), handle)) throw denied(new KernelError('E-DIM-REF-MISSING', {}, `cancel: no due item ${handle}`));
  txSet(tx, [SCHEMA.dueKey, handle], undefined);
}

// 到期事件的固定记号（卷二十 §5.1 :1074 动词；卷九 :440 到期一条的位次代号 pos.only）。
const DUE_EVENT = Object.freeze({ verb: 'verb_due_elapsed', position: 'pos.only', visibility: 'private' });

// 在当前事务内写下一条到期事件：actor 空、targets 空，规则段取到期项种类、主体段取拥有者 id（卷九 :440）。
function emitDue(engine, state, item) {
  emit(engine, state, {
    minute: clockView(engine, state).minute,
    verb: DUE_EVENT.verb,
    actor: null,
    targets: [],
    primitives: [],
    cause: item.kind,
    witnesses: [],
    visibility: DUE_EVENT.visibility,
    payload: { kind: item.kind, owner: item.owner },
  }, { rule: item.kind, subject: item.owner, position: DUE_EVENT.position });
}

/**
 * 到期项来源（due 段；交给 advance 的 TickSource）：next 取堆顶活项的 dueMinute（墓碑先弹掉）；某刻 minute 取全部 dueMinute ≤ minute 的活项，
 * 每项一笔事务（写者本文件）：先删 due.<句柄>（到期即出堆），再由本文件在 due 段自己发 verb_due_elapsed（载荷 {kind, owner}，卷二十 §4.1.3 第 5 条 :507、§5.1 :1074；
 * 事件 id 位次 pos.only，卷九 :440）；订阅者（拥有者一方）在事件投递时处理后果（kernel/subscribers.mjs），调度器不知道后果是什么。
 * 执行前该行已被同刻先执行的项取消即什么也不做（墓碑）。layerRankOf(owner) 给全序键的 layerRank（卷二十七 advancePlan 的层序，块 6）。
 * @param {{vocab: any, rules: any, template?: any}} engine
 * @param {{layerRankOf: (owner: string) => number}} io
 * @returns {TickSource}
 */
export function dueSource(engine, io) {
  if (!isObj(io) || typeof io.layerRankOf !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'dueSource: want {layerRankOf}');
  const { layerRankOf } = io;
  return {
    next(state, after) {
      const h = heapOf(state);
      while (h.length && !live(state, h[0])) heapPop(h);
      return h.length ? Math.max(h[0].dueMinute, after + 1) : null;
    },
    items(state, minute, stage) {
      if (stage !== STAGE.due) return [];
      const h = heapOf(state);
      const out = [];
      const seen = new Set();
      while (h.length && h[0].dueMinute <= minute) {
        const e = heapPop(h);
        if (!live(state, e) || seen.has(e.handle)) continue;
        seen.add(e.handle);
        const row = dueRows(state)[e.handle];
        const item = Object.freeze({ dueMinute: row.dueMinute, kind: row.kind, owner: row.owner, ref: row.ref, registeredMinute: row.registeredMinute });
        out.push({
          key: dueKey({ kindRank: dueKindRank(engine, item.kind), layerRank: layerRankOf(item.owner), owner: item.owner, ref: item.ref, registeredMinute: item.registeredMinute }),
          node: 'advance',
          file: SCHEMA.file,
          run: (st) => {
            if (!live(st, e)) return;
            txSet(currentTransaction(), [SCHEMA.dueKey, e.handle], undefined);
            emitDue(engine, st, item);
          },
        });
      }
      return out;
    },
  };
}

// ---------- 推进钩子与节拍（§4.1.3 第 2、3 条；§2.1 :130–131 cadence、phaseOffset；卷二 §2.7 :773 phase/sortKey） ----------

/**
 * 钩子 h 在 after 之后的下一拍：最小的 m > after，使 (m − phaseOffset) mod cadence = 0（节拍只由分钟决定，§4.1.3 第 3 条）。
 * @param {number} after @param {number} cadence @param {number} offset
 * @returns {number}
 */
export function nextBeat(after, cadence, offset) {
  const from = after + 1;
  const r = (((offset - from) % cadence) + cadence) % cadence;
  return from + r;
}

/**
 * 钩子来源（clock 段；交给 advance 的 TickSource）。hooks 是声明表合并结果里的钩子行（state-owners.json systems.<名>.phase，含 sortKey），
 * phases 是声明表的阶段序列（钩子键的 phase 位次）；plan 是推进计划（list<struct:advancePlanItem>，卷二 §2.9 第 0 条 provider 的返回值；
 * 回调时机与按层步长放大节拍归块 6 卷二十七 §4.1 卡，本函数只按给定的计划排）。每个钩子在每一拍对计划里每个单元执行一次，
 * 键 = (clock, phase 位次, sortKey, 该单元层序, 钩子代号, 单元 id)。钩子函数取 kernel/advance-registry.mjs；声明了没交函数、交了函数没声明，
 * 都是 E-DIM-REF-MISSING；节拍取 rules.clock，缺即 E-CLOCK-CADENCE（加载期已逐钩子查，这里不再兜底）。
 * @param {{rules: any}} engine
 * @param {{hooks: {hook: string, phase: string, sortKey: number}[], phases: string[]}} decl
 * @param {{unit: string, tierOrder: number}[]} plan
 * @returns {TickSource}
 */
export function hookSource(engine, decl, plan) {
  const t = isObj(engine.rules) && isObj(engine.rules[SCHEMA.table]) ? engine.rules[SCHEMA.table] : {};
  const cadence = isObj(t.cadence) ? t.cadence : {};
  const offset = isObj(t.phaseOffset) ? t.phaseOffset : {};
  if (!isObj(decl) || !Array.isArray(decl.hooks) || !Array.isArray(decl.phases)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'hookSource: want {hooks, phases}');
  if (!Array.isArray(plan)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'hookSource: plan must be a list of advance plan items');
  const declared = new Set(decl.hooks.map((h) => h.hook));
  for (const name of advanceHookNames()) if (!declared.has(name)) throw new KernelError('E-DIM-REF-MISSING', {}, `hook ${name} registered but not declared in state-owners systems.*.phase`);
  const rows = decl.hooks.map((h) => {
    const entry = advanceHook(h.hook);
    if (!entry) throw new KernelError('E-DIM-REF-MISSING', {}, `hook ${h.hook} declared but no function registered (registerAdvanceHook)`);
    const c = cadence[h.hook];
    const o = offset[h.hook];
    if (!Number.isSafeInteger(c) || c < 1 || !Number.isSafeInteger(o) || o < 0 || o >= c) throw new KernelError('E-CLOCK-CADENCE', {}, `hook ${h.hook}: rules.clock cadence/phaseOffset`);
    const phaseRank = decl.phases.indexOf(h.phase);
    if (phaseRank < 0) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, `hook ${h.hook}: phase ${String(h.phase)} not in phases`);
    return { hook: h.hook, phaseRank, sortKey: h.sortKey, cadence: c, offset: o, entry };
  });
  const units = plan.map((p) => {
    if (!isObj(p) || !isCode(p.unit) || !Number.isSafeInteger(p.tierOrder)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'advance plan item: want {unit, tierOrder}');
    return { unit: p.unit, tierOrder: p.tierOrder };
  });
  return {
    next(_state, after) {
      if (!units.length || !rows.length) return null;
      return Math.min(...rows.map((r) => nextBeat(after, r.cadence, r.offset)));
    },
    items(_state, minute, stage) {
      if (stage !== STAGE.clock) return [];
      const out = [];
      for (const r of rows) {
        if ((((minute - r.offset) % r.cadence) + r.cadence) % r.cadence !== 0) continue;
        for (const u of units) {
          out.push({
            key: clockKey({ phaseRank: r.phaseRank, sortKey: r.sortKey, layerRank: u.tierOrder, hook: r.hook, subject: u.unit }),
            node: r.hook,
            file: r.entry.file,
            run: (st) => r.entry.run(engine, st, Object.freeze({ unit: u.unit, minute })),
          });
        }
      }
      return out;
    },
  };
}

/**
 * 加载期逐钩子查节拍（§2.1 :130–131，K4-46）：声明表里每个钩子在 rules.clock.cadence 必有一项（缺即 E-CLOCK-CADENCE）、取值整数 ≥ 1；
 * phaseOffset 每钩子一项（不设缺省，卷二 §1.6）、0 ≤ 值 < 对应 cadence；两表里有声明表没有的钩子即 E-DIM-REF-MISSING（onUnknown error）。
 * 没有钩子时两表为空即合法。返回与 checkClockTables 同格式的错误行。
 * @param {Record<string, any>} rules engine.rules
 * @param {{hook: string}[]} hooks 声明表合并结果的钩子行（mergeStateOwners().merged.hooks）
 */
export function checkHookCadence(rules, hooks) {
  const errors = [];
  const table = `rules.${SCHEMA.table}`;
  const push = (errCode, row, dim, got, want) => errors.push({ code: errCode, level: 'L2', table, row, dim, path: `${table}#/${row}/${dim}`, got, want });
  const t = isObj(rules) && isObj(rules[SCHEMA.table]) ? rules[SCHEMA.table] : {};
  const cadence = isObj(t.cadence) ? t.cadence : {};
  const offset = isObj(t.phaseOffset) ? t.phaseOffset : {};
  const names = [...new Set((Array.isArray(hooks) ? hooks : []).map((h) => h.hook))].sort();
  for (const h of names) {
    const c = cadence[h];
    if (!Object.hasOwn(cadence, h)) push('E-CLOCK-CADENCE', 'cadence', h, 'missing', 'one cadence entry per registered hook (minutes >= 1)');
    else if (!Number.isSafeInteger(c) || c < 1) push('E-DIM-DOMAIN-RANGE', 'cadence', h, c, 'integer minutes >= 1');
    const o = offset[h];
    if (!Object.hasOwn(offset, h)) push('E-DIM-STRUCT-FIELD', 'phaseOffset', h, 'missing', 'one phaseOffset entry per registered hook (no default)');
    else if (!Number.isSafeInteger(o) || o < 0 || (Number.isSafeInteger(c) && c >= 1 && o >= c)) push('E-DIM-DOMAIN-RANGE', 'phaseOffset', h, o, 'integer minutes in [0, cadence)');
  }
  for (const [field, map] of [['cadence', cadence], ['phaseOffset', offset]]) {
    for (const k of Object.keys(map).sort()) if (!names.includes(k)) push('E-DIM-REF-MISSING', field, k, k, 'a hook declared in state-owners systems.*.phase');
  }
  return errors;
}

// ---------- 推进（§4.1.3 第 2、7、8 条） ----------

/**
 * @typedef {{key: readonly (number|string)[], node: string, file: string, run: (state: any) => void}} TickItem
 * 一刻内的一个待处理项：key 由上面的键构造函数给出；node、file 是它所在的节点名与文件（相对 server-plugin/，事务写者核对用）；run 在一笔事务里执行。
 * @typedef {{next: (state: any, after: number) => (number | null), items: (state: any, minute: number, stage: string) => TickItem[], reactions?: (state: any, minute: number, cause: TickItem) => TickItem[]}} TickSource
 * 待处理项的来源（到期堆 dueSource、钩子节拍 hookSource、外部提案、争夺池等，各由所在的卡接入）：next 给出 after 之后最早有项的刻（没有为 null），
 * items 给出某刻某段的项；按段依次取，前段执行完才取后段，后段可以读到前段写下的结果。reaction 段不经 items：
 * 有反应规则的来源给 reactions，按起因（本刻已执行的一项）给出它引出的反应项（键由 reactionKey 给），由反应队列按代执行（runReactions）。
 */

/**
 * 推进 minutes 分钟（§4.1.3 第 2 条）：反复取 next = min(各来源的下一刻, 目标刻)，时钟跳到 next 并处理这一刻；只有这一条推进路径（第 8 条）。
 * 任一项被拒（事务回 ok: false，含写入被拒与日后的超上限）即整刻作废（第 7 条）：这一刻已执行的各项连同时钟跳动一并撤销，时钟停在上一个处理完的刻，
 * 本次推进到此结束，返回 {ok: false, code, tick, stage}；报告已由事务按（码、实体、请求、刻、段位次）发出，这里不重复报。之前各刻保留。
 * 反应超上限同样整刻作废，返回另带 detail（"<键名>: limit <上限>, actual <实际>"），报告由本文件发，字段另带 limit、actual 两个数。
 * 下次推进从时钟所在刻起照常取 next，取到的仍是被作废的那一刻，从头再做（续推点就是 clock.minute，不另存）。
 * @param {{units: Map<string, {si: number}>}} engine
 * @param {any} state
 * @param {number} minutes 推进的分钟数（非负整数）
 * @param {TickSource[]} sources
 * @returns {{ok: true, minute: number} | {ok: false, code: string, tick: number, stage: number | null, detail?: string}}
 */
export function advance(engine, state, minutes, sources) {
  if (!Number.isSafeInteger(minutes) || minutes < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'advance: minutes must be a non-negative integer');
  if (!Array.isArray(sources)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'advance: sources must be a list');
  let now = clockView(engine, state).minute;
  const target = now + minutes;
  if (!Number.isSafeInteger(target)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'advance: target minute out of safe integer range');
  while (now < target) {
    let next = target;
    for (const s of sources) {
      const m = s.next(state, now);
      if (m === null) continue;
      if (!Number.isSafeInteger(m) || m <= now) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `advance: a source gave next minute ${String(m)} not after ${now}`);
      if (m < next) next = m;
    }
    const r = runTick(engine, state, next, sources);
    if (!r.ok) return r;
    now = next;
  }
  return { ok: true, minute: now };
}

// 处理一刻：开刻日志（刻级回退点）→ 时钟跳到 t → 六段依次取项、按键排序、逐项一笔事务；reaction 段由反应队列按代生成（runReactions）。
// 任一笔被拒或反应超上限即撤销整刻（连同这一刻对到期堆的改动：丢掉派生堆，下次从状态重建）；来源本身抛错（程序缺陷）也先撤销整刻再抛。
function runTick(engine, state, t, sources) {
  openTickJournal(state);
  let settled = false;
  const abandon = () => { rollbackTickJournal(); heaps.delete(state); settled = true; };
  try {
    const moved = runTransaction(state, { node: 'advance', file: SCHEMA.file, tick: t }, (st) => writePath(st, P.clock_minute(), t));
    if (!moved.ok) { abandon(); return { ok: false, code: moved.code, tick: t, stage: null }; }
    /** @type {TickItem[]} 本刻已执行的项，按执行先后（反应的第一代起因）。 */
    const done = [];
    for (const stage of TICK_STAGE) {
      const rank = stageRank(stage);
      if (stage === STAGE.reaction) {
        const r = runReactions(engine, state, t, sources, done, rank);
        if (!r.ok) { abandon(); if (r.report) report(r.code, r.report); return r.result; }
        continue;
      }
      const items = [];
      for (const s of sources) for (const it of s.items(state, t, stage)) items.push(it);
      sortChecked(items, rank, `tick ${t} stage ${stage}`);
      for (const it of items) {
        const r = runTransaction(state, { node: it.node, file: it.file, tick: t, stage: rank }, it.run);
        if (!r.ok) { abandon(); return { ok: false, code: r.code, tick: t, stage: rank }; }
        done.push(it);
      }
    }
    closeTickJournal();
    settled = true;
    return { ok: true };
  } finally {
    if (!settled) abandon();
  }
}

// 一组项按键排序，并核对都属本段、两两键不同（键由构造函数给出时不会撞；撞了是来源的缺陷）。
function sortChecked(items, rank, where) {
  items.sort((a, b) => compareKeys(a.key, b.key));
  items.forEach((it, i) => {
    if (it.key[0] !== rank) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, `${where}: item of stage ${String(it.key[0])} offered for stage rank ${rank}`);
    if (i > 0 && compareKeys(items[i - 1].key, it.key) === 0) throw new KernelError('E-DIM-ID-DUPLICATE', {}, `${where}: two items share one order key`);
  });
}

/**
 * 反应队列（§4.1.3 第 4 条反应项、第 7 条上限）：按起因广度优先——第 1 代的起因是本刻前四段已执行的各项（按执行先后），
 * 每个起因向各来源的 reactions(state, t, cause) 要它引出的反应项，同一起因的各项按反应键排（reaction_priority.rank、规则包、规则、主体），
 * 各起因的组按起因的先后接成一代；整代执行完，这一代的各项作下一代的起因，直到某代为空。反应队列不存档，整刻作废后重做时从起因重新生成。
 * 某代非空而代数超 rules.clock.reactionDepthMax、或本刻反应项累计超 proposalMax，即中止本刻并报 E-CLOCK-REACTION-LIMIT（李白 11-18 03:22 裁定①：
 * 一码管两上限，信息写明键名、上限值、实际值），不截断、不豁免任何一类。
 */
function runReactions(engine, state, t, sources, causesIn, rank) {
  let causes = causesIn;
  let depth = 0;
  let count = 0;
  for (;;) {
    const gen = [];
    for (const cause of causes) {
      const group = [];
      for (const s of sources) if (typeof s.reactions === 'function') for (const it of s.reactions(state, t, cause)) group.push(it);
      sortChecked(group, rank, `tick ${t} reactions of one cause`);
      for (const it of group) gen.push(it);
    }
    if (!gen.length) return { ok: true };
    depth += 1;
    count += gen.length;
    const limit = (key, actual) => {
      const max = limitOf(engine, key);
      if (actual <= max) return null;
      const detail = `${key}: limit ${max}, actual ${actual}`;
      // 日志只收代号文法字段（report.mjs）：limitKey 取上限键的代号形（驼峰转下划线小写，卷二十 §4.1.3 第 7 条对照表；李白 11-18 03:52）；驼峰名只在 detail。
      const limitKey = snakeCaseKey(key);
      return { ok: false, code: 'E-CLOCK-REACTION-LIMIT', report: { entity: null, request: null, tick: t, stage: rank, limit: max, actual, limit_key: limitKey }, result: { ok: false, code: 'E-CLOCK-REACTION-LIMIT', tick: t, stage: rank, detail } };
    };
    const over = limit(SCHEMA.depthKey, depth) || limit(SCHEMA.countKey, count);
    if (over) return over;
    for (const it of gen) {
      const r = runTransaction(state, { node: it.node, file: it.file, tick: t, stage: rank }, it.run);
      if (!r.ok) return { ok: false, result: { ok: false, code: r.code, tick: t, stage: rank } };
    }
    causes = gen;
  }
}

function limitOf(engine, key) {
  const t = isObj(engine) && isObj(engine.rules) ? engine.rules[SCHEMA.table] : undefined;
  const v = isObj(t) ? t[key] : undefined;
  if (!Number.isSafeInteger(v) || v < 1) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SCHEMA.table}.${key}: want an integer >= 1 (only in this table)`);
  return v;
}

// ---------- 争夺裁决（contest 段；旧 resolveContest / resolveCompositeContest 合一） ----------

/**
 * @typedef {{target: string, quantity: number, capacity: number, contest: string | null}} Claim
 * @typedef {{id: string, claims: Claim[], bid?: number, arrival?: number, rank?: number}} ContestProposal
 * 一份提案要一到多个标的，全部拿到才算赢（整单分配，不执行半份）；claims 每项写全四个字段，不设缺省（卷二 §1.6）：
 * quantity 本单要的份数（≥ 1），capacity 该标的的总份数（同一标的各单须一致），contest 争夺方式（null 即取 rules.clock.contestDefault）。
 * 按方式比较的字段：price 比 bid（大者先）、arrival 比 arrival（小者先）、rank 比 rank（小者先），只在用到该方式时必填；lottery 只比抽取值。
 */

/**
 * 争夺裁决：每个标的先按其方式给全部提案排出先后（主字段相同或方式为 lottery 时比抽取值，大者先；再相同按提案 id）；
 * 再把各提案按"它所要的标的里排在最前的那个标的的序号、它在那个标的里的名次、id"排成总序，依次整单分配，放得下才赢。
 * 返回各标的（按标的代号升序）的 {target, contest, winners, losers}：败者的原因就是该标的的争夺方式代号 contest，不另带文字。
 * draw(proposal, target) 给出这份提案在这个标的上的抽取值（安全整数）——**待 4-3**：由 kernel/sample.mjs 按五段骰值键（卷二十 :508、R27-8.5）给出；
 * 本函数不拼键、不取摘要、不设缺省抽取。只在需要比抽取值时调用。
 * @param {{rules: any}} engine
 * @param {ContestProposal[]} proposals
 * @param {(proposal: ContestProposal, target: string) => number} draw
 * @returns {{target: string, contest: string, winners: ContestProposal[], losers: ContestProposal[]}[]}
 */
export function resolveContest(engine, proposals, draw) {
  if (typeof draw !== 'function') throw new Error('kernel/scheduler.mjs resolveContest: draw interface required (five-part dice key pending card 4-3)');
  if (!Array.isArray(proposals)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'resolveContest: proposals must be a list');
  const table = engine.rules[SCHEMA.table];
  const fallback = isObj(table) ? table.contestDefault : undefined;
  /** @type {Map<string, {mode: string, capacity: number, members: ContestProposal[]}>} */
  const resources = new Map();
  /** @type {Map<ContestProposal, Map<string, number>>} */
  const demands = new Map();
  const ids = new Set();
  for (const p of proposals) {
    if (!isObj(p) || !isCode(p.id) || ids.has(p.id)) throw new KernelError('E-DIM-ID-FORMAT', {}, 'contest proposal: want a unique non-empty id');
    ids.add(p.id);
    if (!Array.isArray(p.claims) || p.claims.length === 0) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: p.id }, 'contest proposal: claims must be a non-empty list');
    const mine = new Map();
    for (const c of p.claims) {
      if (!isObj(c) || !isCode(c.target) || !Number.isSafeInteger(c.quantity) || c.quantity < 1 || !Number.isSafeInteger(c.capacity) || c.capacity < 0 || !Object.hasOwn(c, 'contest')) {
        throw new KernelError('E-DIM-STRUCT-FIELD', { entity: p.id }, 'contest claim: want {target, quantity >= 1, capacity >= 0, contest}');
      }
      if (mine.has(c.target)) throw new KernelError('E-DIM-ID-DUPLICATE', { entity: p.id }, `contest claim: target ${c.target} listed twice in one proposal`);
      mine.set(c.target, c.quantity);
      const mode = c.contest === null ? fallback : c.contest;
      if (!CONTEST_MODES.includes(mode)) throw new KernelError('E-DIM-DOMAIN-ENUM', { entity: p.id }, `contest mode ${JSON.stringify(mode)}: want one of ${CONTEST_MODES.join(', ')}`);
      const r = resources.get(c.target);
      if (!r) resources.set(c.target, { mode, capacity: c.capacity, members: [p] });
      else {
        if (r.mode !== mode) throw new KernelError('E-DIM-DOMAIN-ENUM', { entity: p.id }, `target ${c.target}: proposals disagree on contest mode`);
        if (r.capacity !== c.capacity) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: p.id }, `target ${c.target}: proposals disagree on capacity`);
        r.members.push(p);
      }
    }
    demands.set(p, mine);
  }
  const drawn = new Map();
  const drawOf = (p, target) => {
    const k = `${p.id}\u0000${target}`;
    if (!drawn.has(k)) {
      const v = draw(p, target);
      if (!Number.isSafeInteger(v)) throw new KernelError('E-DIM-DOMAIN-RANGE', { entity: p.id }, 'contest draw: want a safe integer');
      drawn.set(k, v);
    }
    return drawn.get(k);
  };
  const fieldOf = (p, mode) => {
    const v = p[SCHEMA.modeField[mode]];
    if (!Number.isSafeInteger(v)) throw new KernelError('E-DIM-STRUCT-FIELD', { entity: p.id }, `contest mode ${mode}: proposal needs integer ${SCHEMA.modeField[mode]}`);
    return v;
  };
  const targets = [...resources.keys()].sort();
  for (const t of targets) {
    const { mode, members } = resources.get(t);
    if (Object.hasOwn(SCHEMA.modeField, mode)) for (const p of members) fieldOf(p, mode);
  }
  /** @type {Map<ContestProposal, number[]>} */
  const priority = new Map();
  targets.forEach((target, index) => {
    const { mode, members } = resources.get(target);
    const order = [...members].sort((a, b) => {
      if (Object.hasOwn(SCHEMA.modeField, mode)) {
        const x = fieldOf(a, mode);
        const y = fieldOf(b, mode);
        if (x !== y) return (x > y) === SCHEMA.modeHigh[mode] ? -1 : 1;
      }
      const dx = drawOf(a, target);
      const dy = drawOf(b, target);
      if (dx !== dy) return dx > dy ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
    order.forEach((p, place) => { if (!priority.has(p)) priority.set(p, [index, place]); });
  });
  const ordered = [...proposals].sort((a, b) => compareKeys([...priority.get(a), a.id], [...priority.get(b), b.id]));
  const left = new Map(targets.map((t) => [t, resources.get(t).capacity]));
  const won = new Set();
  for (const p of ordered) {
    const need = demands.get(p);
    if ([...need].some(([t, q]) => q > left.get(t))) continue;
    for (const [t, q] of need) left.set(t, left.get(t) - q);
    won.add(p);
  }
  return targets.map((target) => {
    const { mode, members } = resources.get(target);
    const inOrder = ordered.filter((p) => members.includes(p));
    return { target, contest: mode, winners: inOrder.filter((p) => won.has(p)), losers: inOrder.filter((p) => !won.has(p)) };
  });
}

// ---------- 墙钟能力（卷二 §2.9 第 0 条 WallTimerCap；定时器只此一处与客户端 bootstrap） ----------

function wallMs(ms, min) {
  if (!Number.isSafeInteger(ms) || ms < min) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'wall timer: duration must be an integer number of milliseconds');
  return ms;
}

/**
 * kernelApi `createWallTimer()`（只给装配文件 index.mjs）：{deadline(ms) → 到点中止的信号, heartbeat(ms, fn) → 停止函数}。
 * 墙钟只决定"还等不等"与"要不要投递一条请求"；回调自己不写 state，推进多少由世界时钟与规则表步长决定（卷二 §2.9 第 0 条"定时器"）。时长由调用方取规则表。
 * @returns {Readonly<{deadline: (ms: number) => AbortSignal, heartbeat: (ms: number, fn: () => void) => () => void}>}
 */
export function createWallTimer() {
  return Object.freeze({
    deadline(ms) {
      const c = new AbortController();
      const h = setTimeout(() => c.abort(), wallMs(ms, 0));
      c.signal.addEventListener('abort', () => clearTimeout(h), { once: true });
      return c.signal;
    },
    heartbeat(ms, fn) {
      const every = wallMs(ms, 1);
      if (typeof fn !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'wall timer heartbeat: fn must be a function');
      let h = setTimeout(function beat() { h = setTimeout(beat, every); fn(); }, every);
      return () => clearTimeout(h);
    },
  });
}

// ---------- 加载校验（卷二十 §2.1；E-DUE-RANK-DUP、E-PACE-UNCLASSIFIED） ----------

/**
 * rules.clock 各键有行、contestDefault 是争夺方式之一；due_kind 条目四字段每行必写（卷二 §1.6 不设缺省），rank 非负整数且全族互不相同，
 * paceClass 是 pace_class 之一（缺即 E-PACE-UNCLASSIFIED），floorRX 为 null 或可编译的 rx，calendarBound 为布尔；
 * reaction_priority 条目只有 rank（整数、全族互不相同）。字段含义只在本文件读。加载入口在规则表与词表都读到后调一次（kernel/load/world.mjs）。
 * floorRX 的"结果 ≥ 1 分钟"是入堆时的运行期核对（enqueueDelay 取 max(1, …)；floorRX 求值待首个带下界的延迟类条目）。
 * cadence、phaseOffset 的逐钩子核对在 checkHookCadence（要声明表的钩子，加载入口在声明表合并之后调）。
 * @param {Record<string, any>} rules engine.rules
 * @param {{vocab: any, compiled: Map<string, unknown>, rxScope?: unknown}} env 维度加载的 env
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkClockTables(rules, env) {
  const errors = [];
  const push = (errCode, table, row, dim, got, want) => errors.push({ code: errCode, level: 'L2', table, row, dim, path: `${table}#/${row}${dim ? '/' + dim : ''}`, got, want });
  if (Object.hasOwn(rules, SCHEMA.table) && isObj(rules[SCHEMA.table])) {
    const t = rules[SCHEMA.table];
    const table = `rules.${SCHEMA.table}`;
    for (const k of SCHEMA.tableKeys) if (!Object.hasOwn(t, k)) push('E-DIM-STRUCT-FIELD', table, k, '', 'missing', `${k} (every registered key has a row; no default)`);
    if (Object.hasOwn(t, 'contestDefault') && !CONTEST_MODES.includes(t.contestDefault)) push('E-DIM-DOMAIN-ENUM', table, 'contestDefault', '', t.contestDefault, CONTEST_MODES.join('|'));
  }
  const entriesOf = (fam) => {
    const f = env.vocab.families.get(fam);
    return f && isObj(f.entries) ? Object.keys(f.entries).sort().map((id) => [id, isObj(f.entries[id]) ? f.entries[id] : {}]) : [];
  };
  const closed = (table, id, e, fields) => {
    for (const f of Object.keys(e).sort()) if (!fields.includes(f) && !SCHEMA.docFields.includes(f)) push('E-DIM-STRUCT-FIELD', table, id, f, f, `one of ${[...fields, ...SCHEMA.docFields].join(', ')}`);
    if (Object.hasOwn(e, 'basis') && typeof e.basis !== 'string') push('E-DIM-STRUCT-FIELD', table, id, 'basis', e.basis, 'string');
  };
  const ranks = (table, rows, dupCode) => {
    const seen = new Map();
    for (const [id, e] of rows) {
      if (!Object.hasOwn(e, 'rank')) continue;
      if (seen.has(e.rank)) push(dupCode, table, id, 'rank', [seen.get(e.rank), id], 'rank unique within the family');
      else seen.set(e.rank, id);
    }
  };

  const dueTable = `_vocab.${SCHEMA.dueKind}`;
  const dues = entriesOf(SCHEMA.dueKind);
  for (const [id, e] of dues) {
    closed(dueTable, id, e, SCHEMA.dueFields);
    if (!Object.hasOwn(e, 'paceClass')) push('E-PACE-UNCLASSIFIED', dueTable, id, 'paceClass', 'missing', PACE_CLASS.join('|'));
    else if (!PACE_CLASS.includes(e.paceClass)) push('E-DIM-DOMAIN-ENUM', dueTable, id, 'paceClass', e.paceClass, PACE_CLASS.join('|'));
    for (const f of ['calendarBound', 'floorRX', 'rank']) if (!Object.hasOwn(e, f)) push('E-DIM-STRUCT-FIELD', dueTable, id, f, 'missing', `${f} (every entry, no default)`);
    if (Object.hasOwn(e, 'rank') && (!Number.isSafeInteger(e.rank) || e.rank < 0)) push('E-DIM-DOMAIN-RANGE', dueTable, id, 'rank', e.rank, 'integer >= 0');
    if (Object.hasOwn(e, 'calendarBound') && typeof e.calendarBound !== 'boolean') push('E-DIM-DOMAIN-RANGE', dueTable, id, 'calendarBound', e.calendarBound, 'boolean');
    if (Object.hasOwn(e, 'floorRX') && e.floorRX !== null) {
      checkValue({ type: 'rx', nullable: true }, e.floorRX, env, { table: dueTable, row: id, dim: 'floorRX', path: `${dueTable}#/${id}/floorRX` }, (x) => errors.push(x));
    }
  }
  ranks(dueTable, dues, 'E-DUE-RANK-DUP');

  const rpTable = `_vocab.${SCHEMA.reactionPriority}`;
  const rps = entriesOf(SCHEMA.reactionPriority);
  for (const [id, e] of rps) {
    closed(rpTable, id, e, SCHEMA.reactionFields);
    if (!Object.hasOwn(e, 'rank')) push('E-DIM-STRUCT-FIELD', rpTable, id, 'rank', 'missing', 'rank (every entry, no default)');
    else if (!Number.isSafeInteger(e.rank)) push('E-DIM-DOMAIN-RANGE', rpTable, id, 'rank', e.rank, 'integer');
  }
  ranks(rpTable, rps, 'E-DIM-VOCAB-FIELD');
  return errors;
}
