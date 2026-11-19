// 事件记录写者（内核组）：卷二十四《事件叙事调度与历史》§2.2 表 A（事件记录，:126–:154）、表 B（verb 族行字段，:156–:173）、
// R24-1.1 事务写下事件 :395、R24-1.6 写下后不改 :400、R24-1.9 事件里没有话 :403、R24-2.1 注册只有这一处 :437、
// R24-2.3 事件估值 :439、R24-2.4 牵连人数与波及层级 :440、R24-2.5 分量档 :441；卷九 §2.9 事件 id 各处取法 :432–:443；
// 卷二十七 R27-8.2 键成分 :719、R27-8.9 事件 id 派生 :739；卷二 §1.10 派生函数 :320、§2.7 事件派生函数登记与 emits :770。
// 李白 11-18 22:10 丙1：eventDerive 最小版并入本卡（估值读不出按 R24-2.3 末句计 0 记缺口、scopeLevel 无政区取空）。
//
// 分工与边界：
// - 本文件是内核组的事件写者，kernelApi 两个入口：emit（callers rules）、registerEventDerive（callers rules），条目名照卷二 §2.7 :602、:608。
// - 事件日志归存档层（doc_log，卷二 :940、卷二十七 R27-4.1）；内核用日志簿（kernel/save.mjs appendLogEntry）追加，只追加、写下后不改。
//   只在事务内写；追加经 transaction.mjs#registerLogUndo 纳入本事务回滚范围（提交才落、回滚即无；R24-1.1 :395、卷二 §2.6 :509）。
//   mount 时由挂接方交入当前存档的日志簿（installEventLog，kernel 组内用，不在 kernelApi；与 transaction.mjs 的 installProposalSession 同法）。
// - 事件 id 由 §1.10 派生函数（sha256）取卷二十七 R27-8.9 五样成分算出，不收外来串（卷二 §1.10 :197、§2.9 强转豁免表）。
//   卷二 §2.9 :1119 定的构造函数位置是 kernel/handles/keys.mjs#eventId；本卡文件所有权未含 keys.mjs，构造函数暂在本文件实现，
//   行为与五样成分校验照卷文（见 docs/卡回报/ds-b5-2.md 的“已定”）。
// - 表 A 校验只按表 A 的字段与类型判，不按动词名、实体 id 或场景开分支。

import { CODE_RE } from './handles/vocab-handle.mjs';
import { isHex64 } from './handles/keys.mjs';
import { GRAMMAR_TOKENS } from './handles/markers.mjs';
import { isSeedTemplate } from './sample.mjs';
import { sha256Text, appendLogEntry } from './save.mjs';
import { currentTransaction, registerLogUndo } from './transaction.mjs';
import { report } from './report.mjs';
import { KernelError } from './errors.mjs';

// 本文件比较用到的字串与记号（S13 ④：不写裸字串比较；与 load/state-owners.mjs 的常量写法同法）。
const S = Object.freeze({
  empty: '',
  verbFamily: 'verb',
  nullableSuffix: ' nullable',
  refPrefix: 'ref ',
  enumPrefix: 'enum ',
  listPrefix: 'list<',
  setPrefix: 'set<',
  mapPrefix: 'map<',
  structPrefix: 'struct',
  integerType: 'integer',
  integerPrefix: 'integer ',
  numberType: 'number',
  numberPrefix: 'number ',
  booleanType: 'boolean',
  eventIdType: 'EventId',
  entityIdType: 'EntityId',
  edgeIdType: 'EdgeId',
  refVerbType: 'ref vocab verb',
  stringType: 'string',
  side: Object.freeze({ destroyed: 'destroyed', moved: 'moved', stake: 'stake', heads: 'heads' }),
  field: Object.freeze({ actor: 'actor', targets: 'targets' }),
  mark: Object.freeze({ open: 'open', done: 'done' }),
  emitSource: 'kernel',
  kernelKey: 'kernel',
  emitsKey: 'emits',
  systemsKey: 'systems',
  diceKeyChars: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_|-:',
});
const CODE = Object.freeze({ shape: 'E-EVT-SHAPE', verb: 'E-EVT-VERB', emitter: 'E-EVT-EMITTER', seedComponent: 'E-SEED-COMPONENT', collision: 'E-SEED-COLLISION', writerDuplicate: 'E-WRITER-DUPLICATE', structField: 'E-DIM-STRUCT-FIELD', undeclaredWrite: 'E-VIEW-UNDECLARED-WRITE' });

// 事件记录的 visibility 三档（表 A :137 唯一定义；规则只比代号）。
const VISIBILITY = Object.freeze(['private', 'public', 'witnessed']);
// 调用方可给的字段（id 与六个补充字段由写者定，不收外来值）。
const INPUT_FIELDS = Object.freeze(['minute', 'verb', 'actor', 'actorAs', 'targets', 'primitives', 'cause', 'witnesses', 'rollKey', 'visibility', 'payload']);
// 载荷公共字段（表 A :141–:144）：place、related、causedBy。
const PAYLOAD_COMMON = Object.freeze(['place', 'related', 'causedBy']);
// 表 B 各栏（:156–:173：行上必写、没有缺省）。
const VERB_ROW_FIELDS = Object.freeze([
  'parent', 'payloadShape', 'kindFrom', 'kindOnly', 'worthSlots', 'headSlot', 'sigBase', 'tallies',
  'perceivable', 'senses', 'visibilityAllowed', 'scandal', 'calendarBound',
]);
const WORTH_SIDES = Object.freeze(['destroyed', 'moved', 'stake']);
// 事件 id 五样成分（卷二十七 R27-8.9 :739）；世界时刻取事件的 minute，其余四项由调用方给。
const ID_PARTS = Object.freeze(['rule', 'subject', 'minute', 'position']);
// 派生函数的分隔串（卷二 §1.10 :320；文法记号定义源 handles/markers.mjs）。
const KEY_JOIN = GRAMMAR_TOKENS.joinSep;
// typeof 的取值记号由语言自身给出（不写裸字串比较；S13 ④）。
const TYPEOF_STRING = typeof S.empty;
const TYPEOF_BOOLEAN = typeof true;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrList = (v) => Array.isArray(v) && v.every((s) => typeof s === 'string');
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const isCode = (v) => typeof v === 'string' && CODE_RE.test(v);
// 位次代号在卷九 §2.9 写作 pos.commit／pos.only／pos.kernel（点分代号，不是单段 CODE_RE）。
const isDottedCode = (v) => typeof v === 'string' && v.length > 0 && v.split(GRAMMAR_TOKENS.pathSep).every(isCode);
const isEventId = (v) => typeof v === 'string' && isHex64(v);

// 错误形状同 KernelError（kernel/transaction.mjs 的 codeOf 按 e.code 认）；fields 只含代号与数值。
function deny(code, detail) {
  return new KernelError(code, {}, detail);
}

// ---------- 事件日志簿（mount 时交入） ----------

/** @type {null | {entries: any[]}} */
let logBook = null;

/**
 * 挂接时交入当前存档的事件日志簿（kernel 组内用，不在 kernelApi；与 installProposalSession 同法）。
 * @param {{entries: any[]} | null} book
 */
export function installEventLog(book) {
  logBook = book && Array.isArray(book.entries) ? book : null;
}

/** 测试与重新挂接用：清掉已交入的日志簿（kernel 组内用）。 */
export function resetEventLog() {
  logBook = null;
}

/**
 * 按 EventId 读事件日志簿里的一条冻结记录（kernel 组内用，不在 kernelApi）；没有即 null。
 * 持有写者核本笔同意事件的当事人（卷十八 R18-1.5，表 A 的 actor 与 targets）时用。
 * @param {string} id
 * @returns {any | null}
 */
export function findEvent(id) {
  return eventLog().entries.find((e) => isObj(e) && e.id === id) || null;
}

function eventLog() {
  if (!logBook) throw new Error('kernel/events.mjs: emit before installEventLog (mount order)');
  return logBook;
}

// ---------- 派生函数（卷二 §1.10 :320；卷二十七 R27-8.9 :739） ----------

/**
 * 事件 id：§1.10 派生函数取五样成分（世界种子、规则或指令代号、主体 id、世界时刻、固定位次代号），
 * 五样相同即同一 id；成分只能是代号、id（含 EventId）与整数，不收计数、文字、墙钟与随机标识（R27-8.2、R27-8.9）。
 * @param {{template?: {seed?: string}}} engine
 * @param {{rule: string, subject: string, minute: number, position: string}} parts
 * @returns {string} 64 位小写十六进制
 */
export function deriveEventId(engine, parts) {
  const p = isObj(parts) ? parts : {};
  const extra = Object.keys(p).filter((k) => !ID_PARTS.includes(k));
  if (extra.length) throw deny(CODE.seedComponent, `event id parts: unknown component ${JSON.stringify(extra[0])}`);
  const seed = engine && isObj(engine.template) ? engine.template.seed : undefined;
  if (!isSeedTemplate(seed)) throw deny(CODE.seedComponent, 'event id: world seed missing or not ^[A-Za-z0-9_-]{1,64}$');
  if (!isCode(p.rule)) throw deny(CODE.seedComponent, `event id rule ${JSON.stringify(p.rule)} is not a code`);
  const subjectOk = isCode(p.subject) || isEventId(p.subject);
  if (!subjectOk) throw deny(CODE.seedComponent, `event id subject ${JSON.stringify(p.subject)} is not a code or EventId`);
  if (!Number.isSafeInteger(p.minute)) throw deny(CODE.seedComponent, `event id minute ${JSON.stringify(p.minute)} is not an integer`);
  if (!isDottedCode(p.position)) throw deny(CODE.seedComponent, `event id position ${JSON.stringify(p.position)} is not a position code`);
  return sha256Text([seed, p.rule, p.subject, String(p.minute), p.position].join(KEY_JOIN));
}

// ---------- 动词行（表 B） ----------

// verb 族行一律从加载期词表索引取（family 'verb'；条目即表 B 行），不认任何具体代号。
function verbEntries(engine) {
  const idx = engine && isObj(engine.vocab) ? engine.vocab.index : undefined;
  const out = {};
  if (!idx || typeof idx[Symbol.iterator] !== 'function') return out;
  for (const [code, rec] of idx) if (rec && rec.family === S.verbFamily) out[code] = isObj(rec.entry) ? rec.entry : {};
  return out;
}

function verbRow(engine, verb) {
  const idx = engine && isObj(engine.vocab) ? engine.vocab.index : undefined;
  const rec = idx && typeof idx.get === 'function' ? idx.get(verb) : undefined;
  if (!rec || rec.family !== S.verbFamily) throw deny(CODE.verb, `event verb ${JSON.stringify(verb)} is not a registered verb row`);
  if (!isObj(rec.entry)) throw deny(CODE.verb, `event verb ${JSON.stringify(verb)} has no table B row`);
  return rec.entry;
}

// 载荷类型串（表 B payloadShape 的值）：只拒文字类型；已知基底逐类校。
function payloadTypeOk(spec, value) {
  if (typeof spec !== 'string' || spec.length === 0) return false;
  const nullable = spec.endsWith(S.nullableSuffix);
  const base = nullable ? spec.slice(0, -S.nullableSuffix.length) : spec;
  if (value === null || value === undefined) return nullable;
  if (base === S.stringType) return false;
  if (base === S.integerType || base.startsWith(S.integerPrefix)) return Number.isSafeInteger(value);
  if (base === S.numberType || base.startsWith(S.numberPrefix)) return typeof value === 'number' && Number.isFinite(value);
  if (base === S.booleanType) return typeof value === 'boolean';
  if (base === S.eventIdType) return isEventId(value) || isCode(value);
  if (base === S.entityIdType || base === S.edgeIdType) return isCode(value);
  if (base.startsWith(S.refPrefix) || base.startsWith(S.enumPrefix)) return isCode(value);
  if (base.startsWith(S.listPrefix) || base.startsWith(S.setPrefix)) return Array.isArray(value) && value.every((v) => typeof v === 'number' || typeof v === 'string');
  if (base.startsWith(S.mapPrefix) || base.startsWith(S.structPrefix)) return isObj(value);
  return false;
}

// 表 B 一行的形状核对（行上必写、没有缺省；只按行字段判，不按动词名分支）。返回错误串列表。
function verbRowIssues(code, row, table) {
  const out = [];
  if (!isObj(row)) { const why = `${code}: table B row is an object`; return [why]; }
  for (const field of VERB_ROW_FIELDS) if (!Object.hasOwn(row, field)) out.push(`${code}.${field}: required (table B has no defaults)`);
  if (!(row.parent === null || (isCode(row.parent) && Object.hasOwn(table, row.parent)))) out.push(`${code}.parent: null or a registered verb code`);
  if (!isObj(row.payloadShape)) out.push(`${code}.payloadShape: map<field, type>`);
  else for (const [field, spec] of Object.entries(row.payloadShape)) {
    if (typeof spec !== TYPEOF_STRING || spec === S.empty || spec.startsWith(S.stringType)) out.push(`${code}.payloadShape.${field}: type without text`);
  }
  const shape = isObj(row.payloadShape) ? row.payloadShape : {};
  const refVerb = (field) => typeof shape[field] === TYPEOF_STRING && shape[field].startsWith(S.refVerbType);
  if (!(row.kindFrom === null || (typeof row.kindFrom === TYPEOF_STRING && refVerb(row.kindFrom)))) out.push(`${code}.kindFrom: null or a payload field of type ref vocab verb`);
  if (typeof row.kindOnly !== TYPEOF_BOOLEAN) out.push(`${code}.kindOnly: boolean`);
  if (!isObj(row.worthSlots)) out.push(`${code}.worthSlots: {destroyed, moved, stake}`);
  else for (const side of WORTH_SIDES) {
    const list = row.worthSlots[side];
    if (!isStrList(list)) { out.push(`${code}.worthSlots.${side}: list of field codes`); continue; }
    for (const field of list) if (!(field === S.field.actor || field === S.field.targets || Object.hasOwn(shape, field))) out.push(`${code}.worthSlots.${side}.${field}: payload field or actor/targets`);
  }
  if (!(row.headSlot === null || (typeof row.headSlot === TYPEOF_STRING && typeof shape[row.headSlot] === TYPEOF_STRING && shape[row.headSlot].startsWith(S.integerType)))) out.push(`${code}.headSlot: null or a count payload field`);
  if (!Number.isSafeInteger(row.sigBase) || row.sigBase < 0) out.push(`${code}.sigBase: integer >= 0`);
  if (!Array.isArray(row.tallies)) out.push(`${code}.tallies: list (empty list when none)`);
  if (typeof row.perceivable !== TYPEOF_BOOLEAN) out.push(`${code}.perceivable: boolean`);
  if (!isStrList(row.senses)) out.push(`${code}.senses: list of sense codes`);
  else if (row.perceivable === true && row.senses.length === 0) out.push(`${code}.senses: non-empty when perceivable`);
  if (!(isStrList(row.visibilityAllowed) && row.visibilityAllowed.length > 0 && row.visibilityAllowed.every((v) => VISIBILITY.includes(v)))) out.push(`${code}.visibilityAllowed: non-empty subset of the visibility enum`);
  if (typeof row.scandal !== TYPEOF_BOOLEAN) out.push(`${code}.scandal: boolean`);
  if (typeof row.calendarBound !== TYPEOF_BOOLEAN) out.push(`${code}.calendarBound: boolean`);
  return out;
}

/**
 * verb 族与发出系统加载核对（卷二十四 R24-1.3 :397、R24-2.1 :437；卷二 §2.7 :770）：表 B 各栏行上必写、
 * 每个非 kindOnly 动词行恰被一处 emits 列出、kindOnly 行零处、上位词无环。
 * @param {{vocab: any}} engine
 * @param {any} decl state-owners.json 解析结果（systems.<名>.emits 与 kernel.emits）
 * @param {Record<string, any>} [rows] 仅供测试传入改坏的 verb 行；缺省取 engine 的 verb 族
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkVerbRows(engine, decl, rows) {
  const errors = [];
  const table = isObj(rows) ? rows : verbEntries(engine);
  const d = isObj(decl) ? decl : {};
  // 发出系统：非 kindOnly 行恰一处、kindOnly 行零处（E-EVT-EMITTER）。
  const emitted = new Map();
  const addEmit = (source, list) => {
    for (const verb of Array.isArray(list) ? list : []) {
      const prev = emitted.get(verb);
      if (prev) prev.push(source); else emitted.set(verb, [source]);
    }
  };
  addEmit(S.emitSource, isObj(d[S.kernelKey]) ? d[S.kernelKey][S.emitsKey] : undefined);
  for (const [name, sys] of Object.entries(isObj(d[S.systemsKey]) ? d[S.systemsKey] : {})) addEmit(name, isObj(sys) ? sys[S.emitsKey] : undefined);
  for (const [code, row] of Object.entries(table).sort(([a], [b]) => cmp(a, b))) {
    errors.push(...verbRowIssues(code, row, table).map((m) => `${CODE.shape} ${m}`));
    const sources = emitted.get(code) || [];
    const kindOnly = isObj(row) && row.kindOnly === true;
    if (kindOnly && sources.length !== 0) errors.push(`${CODE.emitter} ${code}: kindOnly row is listed by ${sources.join(', ')}`);
    if (!kindOnly && sources.length !== 1) errors.push(`${CODE.emitter} ${code}: non-kindOnly row must be listed by exactly one emits (got ${sources.length})`);
  }
  // 上位词无环（表 B parent）。
  const marks = new Map();
  const visit = (code, trail) => {
    if (marks.get(code) === S.mark.done) return;
    if (marks.get(code) === S.mark.open) { errors.push(`${CODE.shape} ${code}: parent cycle ${[...trail, code].join(' -> ')}`); return; }
    marks.set(code, S.mark.open);
    const up = isObj(table[code]) ? table[code].parent : null;
    if (typeof up === 'string' && Object.hasOwn(table, up)) visit(up, [...trail, code]);
    marks.set(code, S.mark.done);
  };
  for (const code of Object.keys(table).sort(cmp)) visit(code, []);
  return { ok: errors.length === 0, errors };
}

// ---------- 表 A 校验 ----------

// 载荷：公共字段 place/related/causedBy 与动词行 payloadShape 的字段；不许多余键、不许文字值。
function normalizePayload(row, payload) {
  const p = isObj(payload) ? payload : {};
  const shape = isObj(row.payloadShape) ? row.payloadShape : {};
  for (const key of Object.keys(p)) if (!PAYLOAD_COMMON.includes(key) && !Object.hasOwn(shape, key)) {
    throw deny(CODE.shape, `payload.${key}: field is not in the verb row payloadShape`);
  }
  const place = p.place === undefined ? null : p.place;
  if (!(place === null || isCode(place))) throw deny(CODE.shape, 'payload.place: place id or null');
  const related = p.related === undefined ? [] : p.related;
  if (!isStrList(related) || !related.every(isCode)) throw deny(CODE.shape, 'payload.related: list of entity ids');
  const causedBy = p.causedBy === undefined ? [] : p.causedBy;
  if (!isStrList(causedBy) || !causedBy.every(isEventId)) throw deny(CODE.shape, 'payload.causedBy: list of EventId');
  const out = { place, related, causedBy };
  for (const [field, spec] of Object.entries(shape)) {
    const value = p[field] === undefined ? null : p[field];
    if (!payloadTypeOk(spec, value)) throw deny(CODE.shape, `payload.${field}: want ${spec}`);
    out[field] = value;
  }
  return out;
}

function normalizeWitnesses(witnesses) {
  if (!Array.isArray(witnesses)) throw deny(CODE.shape, 'witnesses: list');
  const observers = [];
  const out = [];
  for (const w of witnesses) {
    if (!isObj(w) || !isCode(w.observer) || !Array.isArray(w.senses) || w.senses.length === 0) throw deny(CODE.shape, 'witness: {observer, senses: non-empty list}');
    let prev = null;
    const senses = [];
    for (const s of w.senses) {
      if (!isObj(s) || !isCode(s.sense) || typeof s.margin !== 'number' || !Number.isFinite(s.margin) || s.margin < 0) throw deny(CODE.shape, 'witness sense: {sense, margin >= 0}');
      if (prev !== null && cmp(prev, s.sense) >= 0) throw deny(CODE.shape, 'witness senses: sorted by sense code');
      prev = s.sense;
      senses.push({ sense: s.sense, margin: s.margin });
    }
    if (observers.length && cmp(observers[observers.length - 1], w.observer) >= 0) throw deny(CODE.shape, 'witnesses: sorted by observer id');
    observers.push(w.observer);
    out.push({ observer: w.observer, senses });
  }
  return out;
}

function normalizePrimitives(primitives) {
  if (!Array.isArray(primitives)) throw deny(CODE.shape, 'primitives: list');
  return primitives.map((p, i) => {
    if (!isObj(p) || !isCode(p.op)) throw deny(CODE.shape, `primitive at index ${i}: {op, ...fields}`);
    return p;
  });
}

// 骰值键（卷二十七 R27-8.5）：五段、主体段可带一到两个 `|` 连接的限定成分；本卡事件未抽取时为空。
// 键由内核 sample.diceKeyOf 造，事件写者只核它是键的字符集与非空（不重写键文法）。
function isDiceKeyShape(v) {
  if (typeof v !== 'string' || v.length === 0) return false;
  for (const ch of v) if (!S.diceKeyChars.includes(ch)) return false;
  return true;
}

// 事件记录没有任何文字字段（R24-1.9）：一切字串是代号、EventId、代号按点分段的结构 id 或骰值键。
function noText(v, isRollKey = false) {
  if (typeof v === 'string') {
    if (isRollKey) return true;
    if (isCode(v) || isEventId(v)) return true;
    const segs = v.split(GRAMMAR_TOKENS.pathSep);
    return segs.length > 1 && segs.every(isCode);
  }
  if (Array.isArray(v)) return v.every((x) => noText(x));
  if (isObj(v)) return Object.values(v).every((x) => noText(x));
  return true;
}

/**
 * 表 A 校验并补齐：调用方给最小字段与动词行需要的载荷；写出前逐项核对，返回写者要落日志的记录（不含 id）。
 * @returns {{record: any, row: any}}
 */
function buildRecord(engine, event) {
  const input = isObj(event) ? event : {};
  for (const key of Object.keys(input)) if (!INPUT_FIELDS.includes(key)) throw deny(CODE.shape, `event.${key}: writer-owned or unknown field`);
  for (const field of ['minute', 'verb', 'cause', 'primitives', 'visibility']) {
    if (input[field] === undefined) throw deny(CODE.shape, `event.${field}: required (table A)`);
  }
  if (!Number.isSafeInteger(input.minute)) throw deny(CODE.shape, 'event.minute: integer minute');
  const row = verbRow(engine, input.verb);
  if (!isCode(input.cause)) throw deny(CODE.shape, 'event.cause: rule or instruction code');
  if (!VISIBILITY.includes(input.visibility)) throw deny(CODE.shape, `event.visibility: one of ${VISIBILITY.join('/')}`);
  if (!(isStrList(row.visibilityAllowed) && row.visibilityAllowed.includes(input.visibility))) throw deny(CODE.shape, 'event.visibility: not allowed by the verb row visibilityAllowed');
  const actor = input.actor === undefined ? null : input.actor;
  if (!(actor === null || isCode(actor))) throw deny(CODE.shape, 'event.actor: entity id or null');
  const actorAs = input.actorAs === undefined ? null : input.actorAs;
  if (!(actorAs === null || Number.isSafeInteger(actorAs))) throw deny(CODE.shape, 'event.actorAs: identity key number or null');
  const targets = input.targets === undefined ? [] : input.targets;
  if (!isStrList(targets) || !targets.every(isCode)) throw deny(CODE.shape, 'event.targets: list of entity ids');
  for (let i = 1; i < targets.length; i += 1) if (cmp(targets[i - 1], targets[i]) >= 0) throw deny(CODE.shape, 'event.targets: sorted by id, no duplicates');
  const witnesses = normalizeWitnesses(input.witnesses === undefined ? [] : input.witnesses);
  const rollKey = input.rollKey === undefined ? null : input.rollKey;
  if (!(rollKey === null || isDiceKeyShape(rollKey))) throw deny(CODE.shape, 'event.rollKey: dice key or null');
  const primitives = normalizePrimitives(input.primitives);
  const payload = normalizePayload(row, input.payload === undefined ? {} : input.payload);
  const record = {
    minute: input.minute, verb: input.verb, actor, actorAs, targets, primitives,
    cause: input.cause, witnesses, rollKey, visibility: input.visibility, payload,
  };
  if (!noText(record)) throw deny(CODE.shape, 'event: text fields are not allowed (codes, ids and numbers only)');
  return { record, row };
}

// ---------- eventDerive 最小版（丙1；R24-2.3 :439、R24-2.4 :440、R24-2.5 :441） ----------

/** @type {null | ((engine: any, state: any, event: any) => any)} */
let deriveHandler = null;

/**
 * kernelApi `registerEventDerive(handler)`（卷二 §2.7 :770）：交入补充字段派生函数，全表只许一处；
 * 内核写下每条事件时在同一事务内调一次。签名 handler(engine, state, event)，返回六个补充字段，不写状态。
 * @param {(engine: any, state: any, event: any) => any} handler
 */
export function registerEventDerive(handler) {
  if (typeof handler !== 'function') throw deny(CODE.structField, 'registerEventDerive: handler must be a function');
  if (deriveHandler) throw deny(CODE.writerDuplicate, 'event derive handler already registered');
  deriveHandler = handler;
}

/** 测试与重新挂接用：清掉已交入的派生函数（kernel 组内用）。 */
export function resetEventDerive() {
  deriveHandler = null;
}

// 档(x, 表)：表中不超过 x 的阈值个数（R24-2.5）。
function band(x, thresholds) {
  if (!Array.isArray(thresholds)) return 0;
  let n = 0;
  for (const t of thresholds) if (Number.isFinite(t) && t <= x) n += 1;
  return n;
}

function kindBase(engine, row, event) {
  let base = Number.isSafeInteger(row.sigBase) ? row.sigBase : 0;
  if (typeof row.kindFrom === 'string') {
    const kindVerb = isObj(event.payload) ? event.payload[row.kindFrom] : undefined;
    if (isCode(kindVerb)) {
      const kindRow = verbEntries(engine)[kindVerb];
      if (isObj(kindRow) && Number.isSafeInteger(kindRow.sigBase) && kindRow.sigBase > base) base = kindRow.sigBase;
    }
  }
  return base;
}

/**
 * `eventDerive(engine, state, event)`（卷二十四 §3.2 :357；丙1 最小版）：事件的 worth、heads、scopeLevel、
 * eventSig、typeRef、instanceRef 六个补充字段。
 * - worth 按动词行 worthSlots 三项求和；本块没有卷六 priceFor／valuation 入口，读不出的那件计 0 并记缺口（R24-2.3 末句）。
 * - heads 取 headSlot；为空取 actor 与 targets 去重后的个数（R24-2.4）。
 * - scopeLevel 取能容下地点的最小政区；本块没有地点与政区数据，按“无政区”取空（R24-2.4、李白 22:10 丙1）。
 * - eventSig 按 R24-2.5；sig 规则表未建时退化为基值（公式的下界 max(基值, 0, 0, 0)），不手填到事件上。
 * 交入过 registerEventDerive 的，由它给六字段（卷二 §2.7）。
 * @param {{vocab: any, rules: any}} engine
 * @param {any} state
 * @param {any} event 已过表 A 校验的事件记录（含 verb 与 payload）
 * @returns {{fields: {worth: any, heads: number, scopeLevel: any, eventSig: number, typeRef: any, instanceRef: any}, gaps: {side: string, field: string}[]}}
 */
export function eventDerive(engine, state, event) {
  if (deriveHandler) {
    const got = deriveHandler(engine, state, event);
    if (!isObj(got)) throw deny(CODE.shape, 'eventDerive handler must return the six supplementary fields');
    return { fields: got, gaps: [] };
  }
  const row = verbRow(engine, event.verb);
  const gaps = [];
  const worth = { destroyed: 0, moved: 0, stake: 0 };
  for (const side of WORTH_SIDES) {
    const slots = isObj(row.worthSlots) && Array.isArray(row.worthSlots[side]) ? row.worthSlots[side] : [];
    for (const field of slots) {
      const value = field === S.field.actor ? event.actor : field === S.field.targets ? event.targets : event.payload[field];
      const items = Array.isArray(value) ? value : (value === null || value === undefined ? [] : [value]);
      // 没有估值入口（卷六 §4.21 priceFor）：每一件都读不出，计 0 并记缺口，不让整条事件失败。
      for (const item of items) if (item !== null && item !== undefined) gaps.push({ side, field });
    }
  }
  let heads;
  if (row.headSlot === null) {
    const set = new Set();
    if (event.actor !== null && event.actor !== undefined) set.add(event.actor);
    for (const t of event.targets) set.add(t);
    heads = set.size;
  } else {
    const v = event.payload[row.headSlot];
    if (Number.isSafeInteger(v) && v >= 0) heads = v;
    else { heads = 0; gaps.push({ side: S.side.heads, field: row.headSlot }); }
  }
  const scopeLevel = null;
  const base = kindBase(engine, row, event);
  const sig = engine && isObj(engine.rules) ? engine.rules.sig : undefined;
  let eventSig = base;
  if (isObj(sig) && Number.isSafeInteger(sig.maxBand)) {
    const worthSum = worth.destroyed + worth.moved + worth.stake;
    eventSig = Math.min(sig.maxBand, Math.max(base, band(worthSum, sig.worthBands), band(heads, sig.headBands), band(0, sig.levelBands)));
  }
  return { fields: { worth, heads, scopeLevel, eventSig, typeRef: null, instanceRef: null }, gaps };
}

// ---------- 写入口 ----------

/**
 * kernelApi `emit(engine, state, event, idParts)`（卷二 §2.7 :608；卷二十四 R24-1.1 :395、R24-1.6 :400）：
 * 表 A 校验 → 派生补充字段 → 按 R27-8.9 五成分定 id → 追加进事件日志簿。事件是事实，写下后不改：日志里存冻结的深副本。
 * 只在写下它的那笔事务内写（R24-1.1 :395、R24-1.2 :396）：事务外即 E-VIEW-UNDECLARED-WRITE；
 * 追加向本事务登记撤销项，调用方回滚或整刻作废时这一条一并截掉（卷二 §2.6 :509／:512；A9-2.2 :683）。
 * 写者协议在事务内另发的事件由调用方给 primitives: [] 与位次 pos.kernel（卷九 §2.9）。
 * @param {{vocab: any, rules: any, template?: {seed?: string}}} engine
 * @param {any} state
 * @param {any} event {minute, verb, actor?, actorAs?, targets?, primitives, cause, witnesses?, rollKey?, visibility, payload?}
 * @param {{rule: string, subject: string, position: string}} idParts 规则或指令代号、主体 id、固定位次代号（世界时刻取 event.minute）
 * @returns {any} 日志里那条冻结的记录
 */
export function emit(engine, state, event, idParts) {
  // 事件由写下它的那笔事务写（R24-1.1 :395）：事务外没有回滚范围，写即无法撤销，拒。
  const tx = currentTransaction();
  if (!tx || tx.state !== state) throw deny(CODE.undeclaredWrite, 'emit outside the transaction of this state');
  const { record } = buildRecord(engine, event);
  const id = deriveEventId(engine, {
    rule: isObj(idParts) ? idParts.rule : undefined,
    subject: isObj(idParts) ? idParts.subject : undefined,
    minute: record.minute,
    position: isObj(idParts) ? idParts.position : undefined,
  });
  const { fields, gaps } = eventDerive(engine, state, { ...record });
  const full = {
    id,
    minute: record.minute,
    verb: record.verb,
    actor: record.actor,
    actorAs: record.actorAs,
    targets: record.targets,
    primitives: record.primitives,
    cause: record.cause,
    witnesses: record.witnesses,
    rollKey: record.rollKey,
    visibility: record.visibility,
    payload: record.payload,
    typeRef: fields.typeRef === undefined ? null : fields.typeRef,
    instanceRef: fields.instanceRef === undefined ? null : fields.instanceRef,
    worth: fields.worth,
    heads: fields.heads,
    scopeLevel: fields.scopeLevel === undefined ? null : fields.scopeLevel,
    eventSig: fields.eventSig,
  };
  // 表 A 的补充字段也要过类型与无文字核对。
  if (!isObj(full.worth) || WORTH_SIDES.some((s) => !Number.isSafeInteger(full.worth[s]) || full.worth[s] < 0)) throw deny(CODE.shape, 'event.worth: {destroyed, moved, stake} non-negative integers');
  if (!Number.isSafeInteger(full.heads) || full.heads < 0) throw deny(CODE.shape, 'event.heads: non-negative integer');
  if (!(full.scopeLevel === null || isCode(full.scopeLevel))) throw deny(CODE.shape, 'event.scopeLevel: juris code or null');
  if (!(full.typeRef === null || isCode(full.typeRef))) throw deny(CODE.shape, 'event.typeRef: event_type row id or null');
  if (!(full.instanceRef === null || isCode(full.instanceRef))) throw deny(CODE.shape, 'event.instanceRef: instance id or null');
  if (!Number.isSafeInteger(full.eventSig) || full.eventSig < 0) throw deny(CODE.shape, 'event.eventSig: non-negative integer');
  if (!noText({ ...full, rollKey: null })) throw deny(CODE.shape, 'event: text fields are not allowed (codes, ids and numbers only)');
  // R27-8.9：五样成分相同即同一 id；同一条日志里再出一条同 id 即撞号（不用计数区分）。
  const book = eventLog();
  if (book.entries.some((e) => isObj(e) && e.id === id)) throw deny(CODE.collision, `event id ${id} already in the log`);
  // 追加后把这条的引用登记给本事务：回滚或所在刻整刻作废时按引用删去，不误删刻内穿插的请求条目（R24-1.1、R24-1.2；卷二 §2.6 :509、:512）。
  const stored = book.entries[appendLogEntry(book, full)];
  registerLogUndo(book, stored);
  deepFreeze(stored);
  // 估值缺口按 R24-2.3 末句记下，不让整条事件失败。
  for (const gap of gaps) report('W-DIM-GAP', { entity: full.actor, side: gap.side, field: gap.field });
  return stored;
}

function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const x of Object.values(v)) deepFreeze(x);
  }
  return v;
}
