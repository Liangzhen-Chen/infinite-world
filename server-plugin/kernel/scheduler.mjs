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
//   不在本卡：到期堆、schedule/cancel 的实现、钩子节拍、反应队列与代际顺序、上限计数（4-2）；骰值键与 sample（4-3）；advancePlan 的层序（块 6、块 7）。
// 本文件只读登记数据（规则表、词表条目字段、单位表），不认任何具体到期项种类、钩子、阶段名或实体 id；字串字面量只有 ASCII（§4.1.6 扫描式）。

import { KernelError } from './errors.mjs';
import { checkValue } from './validate/types.mjs';
import { readPath, writePath } from './storage.mjs';
import { P } from './handles/generated.mjs';
import { runTransaction, openTickJournal, closeTickJournal, rollbackTickJournal } from './transaction.mjs';

// ---------- 代码内封闭枚举（卷二十 §8 问题 5 :1318 列为代码内封闭、不登卷二） ----------

/** tick_stage：一刻内六段，按位次排（§4.1.3 第 4 条 :495"沿用现调度器六段"）。 */
export const TICK_STAGE = Object.freeze(['external', 'due', 'clock', 'contest', 'reaction', 'assertion']);
/** pace_class：延迟类、均衡类（§2.10 :408）。due_kind.paceClass 取其一。 */
export const PACE_CLASS = Object.freeze(['equilibrium', 'latency']);
/** 争夺方式：每种是一段裁决算法（旧 CONTEST_RULES 的四值），代码内封闭；哪个标的用哪种由数据给（rules.clock.contestDefault 与提案的 contest）。 */
export const CONTEST_MODES = Object.freeze(['arrival', 'lottery', 'price', 'rank']);

// 卷二十定义的结构名（表代号、词表族、状态路径、单位代号），不是内容数据。
const SCHEMA = Object.freeze({
  table: 'clock',
  tableKeys: Object.freeze(['contestDefault', 'drawSites', 'proposalMax', 'reactionDepthMax']),
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
const isCode = (v) => typeof v === 'string' && v !== '';

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

// ---------- 到期登记（§4.1.2 :487；实现归 4-2） ----------

/**
 * kernelApi `schedule(owner, kind, delayMinutes, ref)`：登记到期项。到期堆、入堆缩放与墓碑归块 4 第 4-2 张；在此之前调用即抛错（不静默登记、不返回假句柄）。
 * @param {string} owner @param {string} kind @param {number} delayMinutes @param {string} ref
 * @returns {never}
 */
export function schedule(owner, kind, delayMinutes, ref) {
  throw new Error(`kernel/scheduler.mjs schedule(${String(owner)}, ${String(kind)}, ${String(delayMinutes)}, ${String(ref)}): due heap pending card 4-2`);
}

/**
 * kernelApi `cancel(handle)`：撤销到期项（只打墓碑）。实现归块 4 第 4-2 张；在此之前调用即抛错。
 * @param {string} handle
 * @returns {never}
 */
export function cancel(handle) {
  throw new Error(`kernel/scheduler.mjs cancel(${String(handle)}): due heap pending card 4-2`);
}

// ---------- 推进（§4.1.3 第 2、7、8 条） ----------

/**
 * @typedef {{key: readonly (number|string)[], node: string, file: string, run: (state: any) => void}} TickItem
 * 一刻内的一个待处理项：key 由上面的键构造函数给出；node、file 是它所在的节点名与文件（相对 server-plugin/，事务写者核对用）；run 在一笔事务里执行。
 * @typedef {{next: (state: any, after: number) => (number | null), items: (state: any, minute: number, stage: string) => TickItem[]}} TickSource
 * 待处理项的来源（到期堆、钩子节拍、外部提案、争夺池、反应队列等，各由所在的卡接入）：next 给出 after 之后最早有项的刻（没有为 null），
 * items 给出某刻某段的项；按段依次取，前段执行完才取后段，后段可以读到前段写下的结果。
 */

/**
 * 推进 minutes 分钟（§4.1.3 第 2 条）：反复取 next = min(各来源的下一刻, 目标刻)，时钟跳到 next 并处理这一刻；只有这一条推进路径（第 8 条）。
 * 任一项被拒（事务回 ok: false，含写入被拒与日后的超上限）即整刻作废（第 7 条）：这一刻已执行的各项连同时钟跳动一并撤销，时钟停在上一个处理完的刻，
 * 本次推进到此结束，返回 {ok: false, code, tick, stage}；报告已由事务按（码、实体、请求、刻、段位次）发出，这里不重复报。之前各刻保留。
 * 下次推进从时钟所在刻起照常取 next，取到的仍是被作废的那一刻，从头再做（续推点就是 clock.minute，不另存）。
 * @param {{units: Map<string, {si: number}>}} engine
 * @param {any} state
 * @param {number} minutes 推进的分钟数（非负整数）
 * @param {TickSource[]} sources
 * @returns {{ok: true, minute: number} | {ok: false, code: string, tick: number, stage: number | null}}
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
    const r = runTick(state, next, sources);
    if (!r.ok) return r;
    now = next;
  }
  return { ok: true, minute: now };
}

// 处理一刻：开刻日志（刻级回退点）→ 时钟跳到 t → 六段依次取项、按键排序、逐项一笔事务。任一笔被拒即撤销整刻；来源本身抛错（程序缺陷）也先撤销整刻再抛。
function runTick(state, t, sources) {
  openTickJournal(state);
  let settled = false;
  try {
    const moved = runTransaction(state, { node: 'advance', file: SCHEMA.file, tick: t }, (st) => writePath(st, P.clock_minute(), t));
    if (!moved.ok) { rollbackTickJournal(); settled = true; return { ok: false, code: moved.code, tick: t, stage: null }; }
    for (const stage of TICK_STAGE) {
      const rank = stageRank(stage);
      const items = [];
      for (const s of sources) for (const it of s.items(state, t, stage)) items.push(it);
      items.sort((a, b) => compareKeys(a.key, b.key));
      items.forEach((it, i) => {
        if (it.key[0] !== rank) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, `tick ${t}: item of stage ${String(it.key[0])} offered for stage ${stage}`);
        if (i > 0 && compareKeys(items[i - 1].key, it.key) === 0) throw new KernelError('E-DIM-ID-DUPLICATE', {}, `tick ${t} stage ${stage}: two items share one order key`);
      });
      for (const it of items) {
        const r = runTransaction(state, { node: it.node, file: it.file, tick: t, stage: rank }, it.run);
        if (!r.ok) { rollbackTickJournal(); settled = true; return { ok: false, code: r.code, tick: t, stage: rank }; }
      }
    }
    closeTickJournal();
    settled = true;
    return { ok: true };
  } finally {
    if (!settled) rollbackTickJournal();
  }
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
 * floorRX 的"结果 ≥ 1 分钟"是入堆时的运行期核对，随 4-2。
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
