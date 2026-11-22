// 感知判定 perceive、事件目击名单 perceiveEvent、在感知范围内 withinReach、感知一个实体 perceivesEntity（卷五《地点地形与资源场》§3.2 :326–:330、§4.2 规则 1–11；卷九 R9-2.10；格子迁移 G13 = 6-8）。
// 规则层，纯读：对账本与任何状态键的写调用为 0；同一状态上调用前后存档摘要不变（卡内测试守）。位置一律读 G12 的 whereOf（个体 pos），距离经 kernelApi straightM，几何不自算（S5-10）。
// 清醒只读 action-capacity.mjs 的 awake 谓词（S5-5），感官能力值读 bodyView，感官阈值读 speciesView().dims.senses，通道的三项（perceivedAsleep、capability、rangeDim）读 sense 族条目；
// 判定式里没有任何 sense_ 代号字面量、不按通道代号分支，只读条目字段（A5-2.1、A5-2.3）。判定式的算术全部是定点（det-math），本文件没有距离衰减、材料扣损或按天衰减的算术——到达量原样取自 propagate 的返回（卷五规则 1）。
//
// 已定（理由在后）：
// 1. propagate（卷二十 §4.8.2，G14 落）与位置层环境维度 envAt（卷二十 §3.1，归 G16）现在都不存在。本文件只经两个单点接缝取它们：registerPropagate(handler)、registerEnvAt(handler)（与 registerEventDerive、
//    registerValuer 同法，全表只许一处）；没交入处理函数时，到达强度、可及距离的环境维度读不到，按卷五规则 3 的未知通则：margin 为未知、perceived 为假、不拿别的量顶替、不跳过那一步。
//    处理函数形状：propagate(engine, state, channel, sourcePos, observerPos, sourceLevel) → 到达量（number）或 null；envAt(engine, state, pos, dimKey) → number 或 null。理由：不自造场、不自写 log10（对照表待定 11 归 G14）。
// 2. margin = 到达强度 × 感官能力值 − 阈值 − marginBase，经定点算出再转数；"全部经卷二 §3.3 求值管线、可被修正项改变"（卷五规则 3）：能力值来自 bodyView（已含修正项管线）、阈值来自物种维度，
//    margin 自己这一步没有登记的修正目标键（卷五只登记了 sense.sourceStrength，不含 margin），所以本式不另挂管线；未落。
// 3. 事件目击候选读 straightM 的距离与 sense 条目 rangeDim（与 withinReach 同一个距离、同一个可及距离，任一未知不入候选），rangeDim 为空取 rules.perception.candidateRadiusM；候选个体的枚举读 bubble.mjs 的 personIds 一遍全扫，
//    不建位置索引（无实测依据，测量点：perceiveEvent 每个感官一遍全扫，G18 全规模个体数下测）。
// 4. 一次性源强 sourceLevelsOf：基值取行为人的物种行 sourceStrength[s]（个体取其物种行，卷五规则 7），读不到为 null（未知）；规则 7 的"动作行 sourceStrength 作加性修正项"与"技能、潜行、器具挂修正项"
//    依赖卷九动作行与 `sense.sourceStrength` 修正命名空间，两者都未建，未落——现只有基值。
// 5. 规则 11 感知一个实体：个体读 pos 与物种行；物品要批次 spot（未登记）、地点行要 place 表 sourceStrength 列（未登记）——所在表没有该列，或位置未知，一律判没有感知到（规则 7、11 原句），不拿别的量顶替。
// 未落：explain 记"无发生位置"（卷五 :594；explain 设施未建，发生位置未知时只返回空表）。

import { dim } from './kernel/dimensions.mjs';
import { kindOf, kindOfEntity } from './kernel/vocab.mjs';
import { fixedUnits, fixedMultiply, fixedSub, fixedToNumber } from './kernel/det-math.mjs';
import { straightM } from './kernel/place.mjs';
import { E } from './kernel/handles/generated.mjs';
import { awake } from './action-capacity.mjs';
import { bodyView } from './body.mjs';
import { speciesView } from './species.mjs';
import { whereOf } from './position.mjs';
import { personIds } from './bubble.mjs';

// 本文件定名（单一定义）：族名、条目字段、规则表键、维度名、visibility 档。
const S = Object.freeze({
  senseFamily: 'sense', capFamily: 'capability',
  field: Object.freeze({ perceivedAsleep: 'perceivedAsleep', capability: 'capability', rangeDim: 'rangeDim', dimKey: 'dimKey' }),
  rules: Object.freeze({ table: 'perception', marginBase: 'marginBase', candidateRadiusM: 'candidateRadiusM' }),
  dim: Object.freeze({ species: 'species', senses: 'senses', sourceStrength: 'sourceStrength' }),
  person: 'person', species: 'species', verbFamily: 'verb',
  verbField: Object.freeze({ perceivable: 'perceivable', senses: 'senses' }),
  visibility: Object.freeze({ private: 'private', witnessed: 'witnessed', public: 'public' }),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isSafeInteger(v);
const isPos = (p) => isObj(p) && isInt(p.w) && isInt(p.x) && isInt(p.y) && isInt(p.z) && typeof p.coarse === 'boolean';
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// ---------- 两个外接缝（见文件头已定 1） ----------

/** @type {null | ((engine: object, state: object, channel: string, sourcePos: object, observerPos: object, sourceLevel: number | null) => number | null)} */
let propagateHandler = null;
/** @type {null | ((engine: object, state: object, pos: object, dimKey: string) => number | null)} */
let envAtHandler = null;

/**
 * 交入卷二十 propagate（G14 落）：全表只许一处。
 * @param {(engine: object, state: object, channel: string, sourcePos: object, observerPos: object, sourceLevel: number | null) => number | null} handler
 */
export function registerPropagate(handler) {
  if (typeof handler !== 'function') throw deny(E.E_DIM_STRUCT_FIELD, 'registerPropagate: handler must be a function');
  if (propagateHandler !== null) throw deny(E.E_WRITER_DUPLICATE, 'propagate handler already registered');
  propagateHandler = handler;
}

/**
 * 交入卷二十 envAt 的位置层读法（G16 落）：全表只许一处。
 * @param {(engine: object, state: object, pos: object, dimKey: string) => number | null} handler
 */
export function registerEnvAt(handler) {
  if (typeof handler !== 'function') throw deny(E.E_DIM_STRUCT_FIELD, 'registerEnvAt: handler must be a function');
  if (envAtHandler !== null) throw deny(E.E_WRITER_DUPLICATE, 'envAt handler already registered');
  envAtHandler = handler;
}

/** 测试与重新挂接用：清掉已交入的两个处理函数。 */
export function resetPerceptionPorts() {
  propagateHandler = null;
  envAtHandler = null;
}

// ---------- 条目与读数 ----------

function senseEntries(engine) {
  const fam = engine.vocab && engine.vocab.families instanceof Map ? engine.vocab.families.get(S.senseFamily) : undefined;
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  return Object.keys(entries).sort(cmp).map((code) => ({ code, entry: entries[code] }));
}

function senseEntry(engine, code) {
  const hit = senseEntries(engine).find((e) => e.code === code);
  if (!hit) throw deny(E.E_DIM_REF_MISSING, `perceive: ${String(code)} is not a ${S.senseFamily} entry`);
  return hit.entry;
}

// 个体位置：读 G12 的 whereOf（个体 pos）；读不到 null。
function posOfPerson(engine, state, id) {
  const w = whereOf(engine, state, id);
  return w.pos !== null && isPos(w.pos) ? w.pos : null;
}

// 观察者的物种行 id；读不到 null。
function speciesOf(engine, state, id) {
  const f = dim(engine, state, kindOfEntity(state, id), id, S.dim.species);
  return f.known && typeof f.value === 'string' ? f.value : null;
}

// 位置层的环境维度值（number）；没交入 envAt、或读不到为 null。
function envValue(engine, state, pos, dimKey) {
  if (envAtHandler === null) return null;
  const v = envAtHandler(engine, state, pos, dimKey);
  return isNum(v) ? v : null;
}

// rules.perception 的一个键下按通道取值；表或键缺为 null。
function rulesValue(engine, key, channel) {
  const t = isObj(engine.rules) && isObj(engine.rules[S.rules.table]) ? engine.rules[S.rules.table] : undefined;
  const m = t !== undefined && isObj(t[key]) ? t[key] : undefined;
  return m !== undefined && isNum(m[channel]) ? m[channel] : null;
}

// 感官能力值（bodyView 里该通道条目 capability 所指能力的 dimKey 那一项）；读不到 null。
function capabilityValue(engine, state, observerId, entry) {
  const cap = engine.vocab && engine.vocab.families instanceof Map ? engine.vocab.families.get(S.capFamily) : undefined;
  const capEntry = cap && isObj(cap.entries) ? cap.entries[entry[S.field.capability]] : undefined;
  if (!isObj(capEntry) || typeof capEntry[S.field.dimKey] !== 'string') return null;
  const body = bodyView(engine, state, observerId);
  if (body === null) return null;
  const f = body.dims[capEntry[S.field.dimKey]];
  return f && f.known && isNum(f.value) ? f.value : null;
}

// 物种阈值 阈值(物种, 通道)：speciesView().dims.senses[通道]；物种没有这个感官（null）或读不到为 null。
function thresholdValue(engine, state, observerId, channel) {
  const sp = speciesOf(engine, state, observerId);
  if (sp === null) return null;
  const f = speciesView(engine, state, sp).dims[S.dim.senses];
  return f && f.known && isObj(f.value) && isNum(f.value[channel]) ? f.value[channel] : null;
}

const unknownResult = (channel, shortfall = null) => Object.freeze({ perceived: false, channel, margin: null, rangeShortfallM: shortfall });

/**
 * `perceive(engine, state, observerId, {channel, sourcePos, sourceLevel})`（卷五 §3.2、§4.2 规则 1、3、8）：全书唯一的"是否感知到"判定，纯读。
 * 返回 `{perceived, channel, margin, rangeShortfallM}`：margin = 到达强度 × 感官能力值 − 阈值 − marginBase（到达强度原样取自 propagate）；观察者 awake 为真或该通道 perceivedAsleep 为真时 perceived = (margin ≥ 0)，否则假；
 * 通道有 rangeDim 时先读观察者位置层的那个环境维度与直线距离：距离大于它不调 propagate，perceived 假、margin 未知、rangeShortfallM = 距离 − 它（米，正数）；
 * 任一量缺数据（到达强度、能力值、阈值、marginBase、可及距离、直线距离）margin 为 null（未知）、perceived 假、rangeShortfallM 为空。
 * @param {object} engine @param {object} state @param {string} observerId
 * @param {{channel: string, sourcePos: object, sourceLevel?: number | null}} input
 * @returns {{perceived: boolean, channel: string, margin: number | null, rangeShortfallM: number | null}}
 */
export function perceive(engine, state, observerId, input) {
  if (!isObj(input) || !isPos(input.sourcePos)) throw deny(E.E_DIM_STRUCT_FIELD, 'perceive: input is {channel, sourcePos: struct:pos, sourceLevel}');
  const level = input.sourceLevel === undefined ? null : input.sourceLevel;
  if (!(level === null || isNum(level))) throw deny(E.E_DIM_STRUCT_FIELD, 'perceive: sourceLevel is a number or null');
  const { channel } = input;
  const entry = senseEntry(engine, channel);
  const obsPos = posOfPerson(engine, state, observerId);
  if (obsPos === null) return unknownResult(channel);
  // 规则 8：可及距离先于 propagate。
  if (entry[S.field.rangeDim] !== null) {
    const limit = envValue(engine, state, obsPos, entry[S.field.rangeDim]);
    const dist = straightM(engine, input.sourcePos, obsPos);
    if (limit === null || dist === null) return unknownResult(channel);
    const over = dist - fixedUnits(limit);
    if (over > 0n) return unknownResult(channel, fixedToNumber(over));
  }
  const arrival = propagateHandler === null ? null : propagateHandler(engine, state, channel, input.sourcePos, obsPos, level);
  const cap = capabilityValue(engine, state, observerId, entry);
  const threshold = thresholdValue(engine, state, observerId, channel);
  const base = rulesValue(engine, S.rules.marginBase, channel);
  if (!isNum(arrival) || cap === null || threshold === null || base === null) return unknownResult(channel);
  const margin = fixedSub(fixedSub(fixedMultiply(fixedUnits(arrival), fixedUnits(cap)), fixedUnits(threshold)), fixedUnits(base));
  const a = awake(engine, state, observerId);
  const present = (a.known && a.ok) || entry[S.field.perceivedAsleep] === true;
  return Object.freeze({ perceived: present && margin >= 0n, channel, margin: fixedToNumber(margin), rangeShortfallM: null });
}

/**
 * `withinReach(engine, state, observerId, otherId, channel)`（卷五 §3.2、§4.2 规则 10）：对方是否在观察者这个通道的可及距离之内。channel 须是 rangeDim 非空的 sense 代号（否则抛 E-DIM-DOMAIN-RANGE）。
 * 读两人的 pos 的直线距离与观察者位置层该通道 rangeDim 之值（与规则 8、事件目击候选同一个距离、同一个可及距离）：不大于为真、大于为假、任一未知返回 null；不调 propagate，不看清醒与阈值。
 * @param {object} engine @param {object} state @param {string} observerId @param {string} otherId @param {string} channel
 * @returns {boolean | null}
 */
export function withinReach(engine, state, observerId, otherId, channel) {
  const entry = senseEntry(engine, channel);
  if (entry[S.field.rangeDim] === null) throw deny(E.E_DIM_DOMAIN_RANGE, `withinReach: ${channel} has no rangeDim (only senses with a reach limit are ranges)`);
  const a = posOfPerson(engine, state, observerId);
  const b = posOfPerson(engine, state, otherId);
  if (a === null || b === null) return null;
  const limit = envValue(engine, state, a, entry[S.field.rangeDim]);
  const dist = straightM(engine, a, b);
  if (limit === null || dist === null) return null;
  return dist <= fixedUnits(limit);
}

/**
 * `sourceLevelsOf(engine, state, actorId)`（卷五 §4.2 规则 7，见文件头已定 4）：以行为人为主体求各感官的一次性源强 `{sense: number | null}`（键覆盖 sense 全族；读不到为 null）。基值取行为人物种行的 sourceStrength。
 * @param {object} engine @param {object} state @param {string} actorId
 * @returns {Record<string, number | null>}
 */
export function sourceLevelsOf(engine, state, actorId) {
  const out = {};
  const ids = senseEntries(engine).map((e) => e.code);
  for (const id of ids) out[id] = null;
  if (kindOfEntity(state, actorId) !== S.person) return out;
  const sp = speciesOf(engine, state, actorId);
  if (sp === null) return out;
  const header = engine.tables instanceof Map && engine.tables.get(kindOf(sp)) ? engine.tables.get(kindOf(sp)).doc.dimensions : {};
  if (!isObj(header) || !Object.hasOwn(header, S.dim.sourceStrength)) return out;
  const f = dim(engine, state, kindOf(sp), sp, S.dim.sourceStrength);
  if (!f.known || !isObj(f.value)) return out;
  for (const id of ids) if (isNum(f.value[id])) out[id] = f.value[id];
  return out;
}

// 事件的发生位置：给了 pos 用它；为空取行为人的 pos；仍没有为 null（见卷五 :594）。
function eventPos(engine, state, pos, actor) {
  if (pos !== null && pos !== undefined) return isPos(pos) ? pos : null;
  return typeof actor === 'string' ? posOfPerson(engine, state, actor) : null;
}

/**
 * `perceiveEvent(engine, state, {verb, visibility, actor, targets, place, pos, sourceLevels})`（卷五 §3.2、§4.2 规则 9；卷九 R9-2.10）：对一件将要落定的事件求目击名单，纯读、本身不写知情。
 * 只由卷九 emit 适配器在事务内、事件落定之前调一次（门禁 vol9.R9-2.10 守调用点）。`private` 与动词行 perceivable 为假、发生地点为空、发生位置未知一律空表；`witnessed`、`public` 同按下面求（public 的群体注入归卷二十二）；
 * 只去掉 actor（自知域），targets 与旁人一样经判定。对动词行 senses 里每个感官（代号字典序）的每个候选者调一次 perceive；perceived 真记一项 {sense, margin}。
 * 结果每项 {observer, senses}：senses 按感官代号序、非空者进结果、按 observer id 序。不按动词、感官代号分支，只读动词行的 perceivable、senses 与事件的 visibility。
 * @param {object} engine @param {object} state
 * @param {{verb: string, visibility: string, actor: string | null, targets: readonly string[], place: string | null, pos: object | null, sourceLevels: Record<string, number | null>}} ev
 * @returns {{observer: string, senses: {sense: string, margin: number}[]}[]}
 */
export function perceiveEvent(engine, state, ev) {
  if (!isObj(ev)) throw deny(E.E_DIM_STRUCT_FIELD, 'perceiveEvent: needs {verb, visibility, actor, targets, place, pos, sourceLevels}');
  const rec = engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index.get(ev.verb) : undefined;
  if (!rec || rec.family !== S.verbFamily || !isObj(rec.entry)) throw deny(E.E_DIM_REF_MISSING, `perceiveEvent: ${String(ev.verb)} is not a verb row`);
  const row = rec.entry;
  if (!Object.values(S.visibility).includes(ev.visibility)) throw deny(E.E_DIM_DOMAIN_RANGE, 'perceiveEvent: visibility is private, witnessed or public');
  if (ev.visibility === S.visibility.private) return [];
  if (row[S.verbField.perceivable] !== true || ev.place === null || ev.place === undefined) return [];
  const at = eventPos(engine, state, ev.pos, ev.actor);
  if (at === null) return [];
  const levels = isObj(ev.sourceLevels) ? ev.sourceLevels : {};
  const channels = [...new Set(Array.isArray(row[S.verbField.senses]) ? row[S.verbField.senses] : [])].sort(cmp);
  const byObserver = new Map();
  const everyone = personIds(engine, state);
  for (const channel of channels) {
    const entry = senseEntry(engine, channel);
    const radius = entry[S.field.rangeDim] === null ? rulesValue(engine, S.rules.candidateRadiusM, channel) : null;
    for (const id of everyone) {
      if (id === ev.actor) continue;
      const p = posOfPerson(engine, state, id);
      if (p === null) continue;
      const dist = straightM(engine, at, p);
      if (dist === null) continue;
      const reach = entry[S.field.rangeDim] === null ? radius : envValue(engine, state, p, entry[S.field.rangeDim]);
      if (reach === null || dist > fixedUnits(reach)) continue;
      const level = isNum(levels[channel]) ? levels[channel] : null;
      const r = perceive(engine, state, id, { channel, sourcePos: at, sourceLevel: level });
      if (r.perceived !== true || r.margin === null || r.margin < 0) continue;
      if (!byObserver.has(id)) byObserver.set(id, []);
      byObserver.get(id).push({ sense: channel, margin: r.margin });
    }
  }
  return [...byObserver.keys()].sort(cmp).map((observer) => ({ observer, senses: byObserver.get(observer) }));
}

/**
 * `perceivesEntity(engine, state, observerId, entityId)`（卷五 §4.2 规则 11，单点定义）：观察者 X 经感官 s 感知到实体 E，当且仅当 perceive(X, {channel: s, sourcePos: E 的位置, sourceLevel: 以 E 为行为人求得的 s 一次性源强}) 为真。
 * 返回 {perceived, senses: [{sense, margin}]}（senses 按代号序，perceived 为 senses 非空）。E 的位置：个体读 pos；物品要批次 spot、地点行要 place 表 sourceStrength 列，现都未登记，判没有感知到；
 * 位置未知、E 所在表没有 sourceStrength 列、该感官源强读不到，都判该感官没有感知到（不拿别的量顶替）。
 * @param {object} engine @param {object} state @param {string} observerId @param {string} entityId
 * @returns {{perceived: boolean, senses: {sense: string, margin: number}[]}}
 */
export function perceivesEntity(engine, state, observerId, entityId) {
  const none = Object.freeze({ perceived: false, senses: [] });
  if (kindOfEntity(state, entityId) !== S.person) return none;
  const at = posOfPerson(engine, state, entityId);
  if (at === null) return none;
  const levels = sourceLevelsOf(engine, state, entityId);
  const hits = [];
  for (const { code } of senseEntries(engine)) {
    if (!isNum(levels[code])) continue;
    const r = perceive(engine, state, observerId, { channel: code, sourcePos: at, sourceLevel: levels[code] });
    if (r.perceived === true) hits.push({ sense: code, margin: r.margin });
  }
  return Object.freeze({ perceived: hits.length > 0, senses: hits });
}
