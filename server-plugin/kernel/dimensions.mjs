// 横切入口 dim、modified、explain（卷二 §2.1 :436；§2.7 kernelApi :568–570；求值管线 §3.3"九步、定点、全序"）。
// dim 只给基值（§2.2 :445），按 §1.3"取值（唯一算法）"：不适用 → 偏离行与实体行（instanceRow）→ 类别链（precedence）→ 派生 → 采样 → 未知。
// modified 走 §3.3 唯一管线：基值转定点 → 可用修正项 → 同源去重、(target, stage) 内 stackGroup 去重 → 无修正返回基值原生值 →
// add → mul（正负分开、各按全序键、叠加惩罚表 rules.modifiers.stackingTable）→ max → min → set → post → clamp → 按 precision 向零截断。
// 修正键开放于数据：凡维度表登记的 modifiable number/integer/map<…,number> 维度（含派生维度）都是修正键，经 kernel/handles/keys.mjs#modKeyOf 构造，
// 本文件不手写槽、不认任何具体表、维度或键（体检 K2-05）。只有一条节奏通路：本管线不乘任何节奏系数（卷二十 §4.10 规则 5、6；体检 K2-06、K2-23b）。
// 整条管线只有 BigInt 加、乘、整除、比较与查表（kernel/det-math.mjs），无浮点运算。

import { fixedUnits, fixedAdd, fixedMultiply, truncateTo, fixedToNumber, fixedScale } from './det-math.mjs';
import { sample } from './sample.mjs';
import { dimKeyOf, modKeyOf } from './handles/keys.mjs';
import { registry } from './vocab.mjs';
import { stateMemo } from './memo.mjs';
import { evaluateRX, rxChildren, splitDimKey } from './rx.mjs';
import { KernelError } from './errors.mjs';
import { ruleTable } from './load/rules.mjs';
import { markersOf, T } from './validate/types.mjs';
import { STACKING_MARKERS } from './validate/dimensions-validate.mjs';

/** @typedef {import('./types.d.ts').ModKey} ModKey */
/**
 * @typedef {{known: boolean, applicable: boolean, value?: any, base?: any, unit?: string, source?: string, chain?: string[]}} Fact
 * Fact（§2.2 :442）：source 取 instance（偏离行或实体行自身的值）、class（类别链）、modified（经修正）；chain 是参与取值的类别链。
 * @typedef {{tables: Map<string, {doc: any, flat: {classes: Map<string, any>, rows: Map<string, any>}}>, vocab: {index: Map<string, {entry: any}>}, rules: Record<string, any>}} Engine
 * engine：统一加载器 loadWorld 的结果（维度表原文与展平结果、词表、规则表）。
 * @typedef {{key?: string | number, clock?: {day?: number, season?: string}}} ReadOptions
 * key：map 维度的下标（键名 `<kind>.<dimension>[<key>]`，§3.1）；clock：求值时刻的 clock.day / clock.season（`when` 只能读到这两项，§2.2 :448）。
 * @typedef {{id: string, target: string, stage: string, value?: number, valueRX?: any, curve?: any, when?: any, source: {kind?: string, id?: string, via?: string},
 *   stackGroup?: string | null, priority?: number, unpenalized?: boolean}} ModifierRow
 * 修正项（§3.2 :1296 格式；运行态 valueRX / when 是加载期编译好的 rxTree）。
 */

// 修正阶段（§3.2 stage 即运算；代码内封闭枚举 stage，§1.9）。
const STAGES = Object.freeze(['add', 'mul', 'max', 'min', 'set', 'post']);
// 修正阶段句柄：成员由上面的 STAGES 派生（与 CODE_ENUMS.stage 同一组取值）。
const STAGE = markersOf('stage', STAGES);
// 叠加惩罚表所在规则表与键（§3.3 :1356 rules.modifiers.stackingTable）。
const STACKING_TABLE = Object.freeze({ table: 'modifiers', key: 'stackingTable' });
const MEMO_SCOPE = 'kernel/dimensions.mjs#modified';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// required 策略取值（卷二 §1.2）与 precedence 缺省组名（§3.2 修正项次序）：本文件用的固定记号，单一定义。
const REQUIRED_POLICY = Object.freeze({ byClass: 'byClass', ifPresent: 'ifPresent' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// ---------- 修正项来源 ----------

/** @type {null | ((engine: Engine, state: any, at: {target: ModKey, kind: string, id: string}) => ModifierRow[])} */
let modifierSource = null;

/**
 * 修正项来源（kernel 组内用，不在 kernelApi）：§3.2 的五处来源（维度表行、规则表 modifiers/*.json、state.modifiers、实例附魔、效果族输出）
 * 各由其写者与作用域解析（§3.5）那几张卡接入；它们在加载时交入一个收集函数，按 (target, 主体) 返回已解析作用域的修正项。
 * 未交入前没有任何修正项（modified 返回基值原生值）。只许交入一次（重复交入、fn 非函数都是调用方程序缺陷，抛不带登记码的 Error，卷二 §4.3 勘误 1118b25）。
 * @param {(engine: Engine, state: any, at: {target: ModKey, kind: string, id: string}) => ModifierRow[]} fn
 */
export function installModifierSource(fn) {
  if (typeof fn !== 'function') throw new Error('kernel/dimensions.mjs: installModifierSource: fn must be a function');
  if (modifierSource) throw new Error('kernel/dimensions.mjs: installModifierSource: modifier source already installed');
  modifierSource = fn;
}

/** 测试与重新挂接用：清掉已交入的修正项来源（kernel 组内用）。 */
export function resetModifierSource() {
  modifierSource = null;
}

// ---------- 基值 ----------

function tableOf(engine, kind) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  if (!t) throw new KernelError('E-DIM-REF-MISSING', {}, `kind ${JSON.stringify(kind)}: no dimension table`);
  return t;
}

// 存档偏离行（state.created[id]）；kernel 读自己的存储，不经 readPath（readPath 的写者核对与本读无关）。
function createdRow(state, id) {
  const c = isObj(state) && isObj(state.created) && Object.hasOwn(state.created, id) ? state.created[id] : undefined;
  return isObj(c) ? c : undefined;
}

// 实例声明的类别（含组件类），沿词表 broader 上位链展开（§1.3"成员关系单一来源"；RB-S4）。
function memberClasses(engine, t, state, id) {
  const created = createdRow(state, id);
  const doc = t.doc || {};
  const own = created && Array.isArray(created.classes) ? created.classes
    : isObj(doc.rows) && isObj(doc.rows[id]) && Array.isArray(doc.rows[id].classes) ? doc.rows[id].classes
      : isObj(doc.generated) && isObj(doc.generated[id]) && Array.isArray(doc.generated[id].classes) ? doc.generated[id].classes : [];
  const out = new Set();
  const stack = [...own];
  while (stack.length) {
    const c = stack.pop();
    if (typeof c !== 'string' || out.has(c)) continue;
    out.add(c);
    const rec = engine.vocab && engine.vocab.index ? engine.vocab.index.get(c) : undefined;
    const broader = rec && isObj(rec.entry) ? rec.entry.broader : undefined;
    for (const b of Array.isArray(broader) ? broader : broader === undefined ? [] : [broader]) stack.push(b);
  }
  return out;
}

// required 的 byClass / ifPresent 条件不满足即不适用（§1.3 取值算法第一行、§1.6 三种状态；RA-N5）。其余策略只管加载期必填，不影响适用性。
function applicable(engine, t, state, kind, id, def) {
  const req = typeof def.required === 'string' ? def.required : '';
  const colon = req.indexOf(':');
  const policy = colon < 0 ? req : req.slice(0, colon);
  const arg = colon < 0 ? '' : req.slice(colon + 1);
  if (policy === REQUIRED_POLICY.byClass) return memberClasses(engine, t, state, id).has(arg);
  if (policy === REQUIRED_POLICY.ifPresent) return readBase(engine, state, kind, id, arg, undefined).known;
  return true;
}

function unitOf(def) {
  if (def.type === T.type.map) return isObj(def.value) && typeof def.value.unit === 'string' ? def.value.unit : undefined;
  return typeof def.unit === 'string' ? def.unit : undefined;
}

// 取下标：map 维度带下标时取该键的值；键不在映射里即未知（§1.6 第 4 项"缺键只是该键未知"），显式 null 照原样交回（"没有"）。
function pick(v, key) {
  if (key === undefined) return v;
  return isObj(v) && Object.hasOwn(v, key) ? v[key] : undefined;
}

function readBase(engine, state, kind, id, dimension, key) {
  const t = tableOf(engine, kind);
  dimKeyOf(registry(), kind, dimension, key); // 维度与下标已登记（E-DIM-REF-MISSING / E-DIM-ID-FORMAT）
  const def = t.doc.dimensions[dimension];
  const known = registry().idIndex.get(id);
  const created = createdRow(state, id);
  if (known !== kind && !created) throw new KernelError('E-DIM-REF-MISSING', { entity: null }, `${JSON.stringify(id)} is not a ${kind} entity`);
  const unit = unitOf(def);
  const fact = (f) => Object.freeze(unit === undefined ? f : { ...f, unit });
  if (!applicable(engine, t, state, kind, id, def)) return Object.freeze({ known: false, applicable: false });
  // 偏离行（state.created 的 props）覆盖实体行有效值（含 extends 展平与 generated 节）：§1.3 覆盖顺序总表。
  const props = created && isObj(created.props) ? created.props : undefined;
  if (props && Object.hasOwn(props, dimension)) {
    const v = pick(props[dimension], key);
    if (v !== undefined) return fact({ known: true, applicable: true, value: v, source: 'instance' });
  }
  const row = t.flat && t.flat.rows instanceof Map ? t.flat.rows.get(id) : undefined;
  if (row && Object.hasOwn(row, dimension)) {
    const v = pick(row[dimension], key);
    if (v !== undefined) return fact({ known: true, applicable: true, value: v, source: 'instance' });
  }
  const doc = t.doc;
  const group = isObj(doc.precedenceOf) && typeof doc.precedenceOf[dimension] === 'string' ? doc.precedenceOf[dimension] : 'default';
  const order = isObj(doc.precedenceGroups) && Array.isArray(doc.precedenceGroups[group]) ? doc.precedenceGroups[group] : [];
  const members = memberClasses(engine, t, state, id);
  const flatClasses = t.flat && t.flat.classes instanceof Map ? t.flat.classes : new Map();
  const chain = order.filter((c) => members.has(c) && flatClasses.has(c));
  for (let i = 0; i < chain.length; i++) {
    const cls = flatClasses.get(chain[i]);
    if (!Object.hasOwn(cls, dimension)) continue;
    const v = pick(cls[dimension], key);
    if (v !== undefined) return fact({ known: true, applicable: true, value: v, source: 'class', chain: Object.freeze(chain.slice(0, i + 1)) });
  }
  // 加载期反查索引（§1.12 封卷后勘误 1118k23；卷三乙 :627）：索引由加载器建好，读时只按行查；无行指向即空集（已知值）。
  if (def.reverseIndex !== undefined) {
    const index = t.reverse instanceof Map ? t.reverse.get(dimension) : undefined;
    const v = index instanceof Map && index.has(id) ? index.get(id) : Object.freeze([]);
    return fact({ known: true, applicable: true, value: v, source: 'index' });
  }
  // 加载期规则分类（§1.12 封卷后勘误 1118k31；卷三乙 :618 派生大类）：加载器逐行求好，读时只按行查；无命中为空集（已知值）。
  if (def.ruleIndex !== undefined) {
    const index = t.ruleIndexes instanceof Map ? t.ruleIndexes.get(dimension) : undefined;
    const v = index instanceof Map && index.has(id) ? index.get(id) : Object.freeze([]);
    return fact({ known: true, applicable: true, value: v, source: 'index' });
  }
  // 派生式（§1.12）：按 §1.3 取值顺序在类别链之后求值，变量一律读基值，未知按 TA-S1 整条未知。
  // 编译树由加载器交下（validateDimensions 的 t.derived，§2.9 第 4 条 :1182）；本文件读时只消费；采样（§1.10）走 kernelApi sample（kernel/sample.mjs，块 4-3）。
  if (def.derived !== undefined) {
    // 登记在案的未建派生（§1.12 封卷后勘误 1118k23）：加载期已跳过编译，运行时读到直接抛已登记码，不静默给值。
    if (t.unbuilt instanceof Set && t.unbuilt.has(dimension)) throw new KernelError('E-MOD-RX', { entity: id }, `derived ${kind}.${dimension} is registered unbuilt (aggregate/set primitives or data missing)`);
    const d = evaluateDerived(engine, state, kind, id, dimension);
    return d.known ? fact(d) : d;
  }
  if (def.sample !== undefined) {
    return fact({ known: true, applicable: true, value: sample(engine, kind, id, dimension), source: 'sample' });
  }
  return Object.freeze({ known: false, applicable: true });
}

// ---------- 派生（§1.12） ----------

// 同一趟求值里重入同一 (kind, id, 维度) 即环（§1.12 RA-N3）；不带 recursive 的按 E-DIM-DERIVED-CYCLE（加载期已判，这里防御），
// 带 recursive 的合法自引用要走 §1.12 聚合原语，而 agg 求值未建，按已登记码 E-MOD-RX 报未实现，不判环。
const deriving = new Set();

// 派生结果按维度类型交回并截断（§1.12 :381"派生结果按 precision 截断"）；类型不合按 RX 求值失败报 E-MOD-RX。
// map/set/list/struct 的派生维度已在加载期按 E-MOD-RX 拒收（validate/dimensions-validate.mjs），这里不再有 map 当标量的分支。
function derivedValue(def, v, at) {
  const type = def.type;
  if (type === T.type.number || type === T.type.integer) {
    if (typeof v !== 'number') throw new KernelError('E-MOD-RX', {}, `derived ${at}: result is not a number`);
    return { known: true, applicable: true, value: fixedToNumber(truncateTo(fixedUnits(v), precisionOf(def))), source: 'derived' };
  }
  if (type === T.type.boolean) {
    if (typeof v !== 'boolean') throw new KernelError('E-MOD-RX', {}, `derived ${at}: result is not a boolean`);
    return { known: true, applicable: true, value: v, source: 'derived' };
  }
  if (type !== T.type.ref && type !== T.type.enum) throw new KernelError('E-MOD-RX', {}, `derived ${at}: result type ${type} is not a scalar RX result`);
  if (typeof v !== 'string') throw new KernelError('E-MOD-RX', {}, `derived ${at}: result is ${typeof v}`);
  return { known: true, applicable: true, value: v, source: 'derived' };
}

// 派生求值（§1.12）：读同主体的各变量基值（§1.12 :378"派生变量一律读基值"）；任一变量 known:false / applicable:false / 显式 null
// 即整条未知（TA-S1 :379），不按 0 代入。编译树只消费加载期交下的 t.derived（§2.9 第 4 条），读时不编译。
function evaluateDerived(engine, state, kind, id, dimension) {
  const t = tableOf(engine, kind);
  const def = t.doc.dimensions[dimension];
  const at = `${kind}.${dimension} of ${JSON.stringify(id)}`;
  const tree = t.derived instanceof Map ? t.derived.get(dimension) : undefined;
  if (tree === undefined) throw new Error(`kernel/dimensions.mjs: derived tree for ${at} missing; the dimension table was not compiled at load`);
  const stackKey = `${kind}\u0000${id}\u0000${dimension}`;
  if (deriving.has(stackKey)) {
    if (def.recursive !== undefined) throw new KernelError('E-MOD-RX', { entity: id }, `recursive derived ${at} needs aggregate primitives (not built)`);
    throw new KernelError('E-DIM-DERIVED-CYCLE', { entity: id }, `derived cycle at ${at}`);
  }
  deriving.add(stackKey);
  try {
    const dims = {};
    for (const k of rxDimKeys(tree)) {
      const { dim: base, sub } = splitDimKey(k);
      const f = readBase(engine, state, kind, id, base, sub);
      // map 维度的一个键写着显式 null（§1.6 第 2 点"没有"）：派生量不适用（勘误 1118k31；卷三乙 :626）。
      if (sub !== undefined && f.known && f.value === null) return Object.freeze({ known: false, applicable: false });
      if (!f.known || !f.applicable || f.value === null || f.value === undefined) return Object.freeze({ known: false, applicable: true });
      dims[k] = f.value;
    }
    const v = evaluateRX(tree, { dim: dims, clock: {} }, {});
    return derivedValue(def, v, at);
  } finally {
    deriving.delete(stackKey);
  }
}

/**
 * kernelApi `dim(engine, state, kind, id, dimension)`（§2.1 :436，acceptsState: true）：基值 Fact，不经修正（§2.2 :445）。
 * 不写状态、不采样写回。map 维度可带下标 opts.key。
 * @param {Engine} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension @param {ReadOptions} [opts]
 * @returns {Fact}
 */
export function dim(engine, state, kind, id, dimension, opts = {}) {
  return readBase(engine, state, kind, id, dimension, opts.key);
}

// ---------- RX 变量绑定（读求值管线；P2-20） ----------

// RX 树里引用的维度键（§2.9 第 4 条 `dim` 变体）：派生式求值与修正项绑定共用这一处遍历，排序后返回。
function rxDimKeys(tree) {
  const keys = new Set();
  const walk = (n) => {
    if (!isObj(n)) return;
    if (n.op === T.rx_op.dim && typeof n.key === 'string') keys.add(n.key);
    rxChildren(n).forEach(walk);
  };
  walk(tree);
  return [...keys].sort();
}

/**
 * 修正项 when / valueRX 的变量绑定（§3.2 :1303"只能经 dim() 读来源与对象的基值"；§2.2 :448 clock.day / clock.season）：
 * 收集树里引用的维度键，逐个经 dim() 读主体的基值；未知、不适用或显式 null 的不进绑定（求值时缺读数即 E-MOD-RX，不当 0）。kernel 组内用。
 * @param {Engine} engine @param {any} state @param {string} kind @param {string} id @param {any} tree @param {ReadOptions['clock']} [clock]
 * @returns {{dim: Record<string, any>, clock: Record<string, any>}}
 */
export function rxBindings(engine, state, kind, id, tree, clock) {
  const dims = {};
  for (const k of rxDimKeys(tree)) {
    const { dim: base, sub } = splitDimKey(k);
    const f = readBase(engine, state, kind, id, base, sub);
    if (f.known && f.value !== null) dims[k] = f.value;
  }
  const c = {};
  if (isObj(clock)) for (const k of ['day', 'season']) if (clock[k] !== undefined) c[k] = clock[k];
  return { dim: dims, clock: c };
}

// ---------- 求值管线（§3.3） ----------

const absBig = (v) => (v < 0n ? -v : v);

// 全序键（§3.3 :1338）：一般阶段 (priority desc, |value| desc, source.id asc, id asc)；set (priority desc, source.id asc, id asc)；post (priority desc, id asc)。
function orderOf(stage) {
  return (a, b) => {
    const p = b.priority - a.priority;
    if (p !== 0) return p;
    if (stage !== STAGE.set && stage !== STAGE.post) {
      const d = absBig(b.fixed) - absBig(a.fixed);
      if (d !== 0n) return d > 0n ? 1 : -1;
    }
    if (stage !== STAGE.post) { const s = cmpTuple(a.sourceId, b.sourceId); if (s !== 0) return s; }
    return cmp(a.id, b.id);
  };
}

// 来源 id 是代号或代号元组（卷四 §4.2.3 B-5a (a)：读入口合成项的 source.id 是复合键，按分量逐项比较与排序）：一律化成元组，
// 单个代号即一元元组，没有 id 取 via，都没有为空元组。逐分量比，前缀相同短者在前（一元元组之间即按代号比，与原单值比较一致）。
function sourceKey(source) {
  if (Array.isArray(source.id)) return source.id.map(String);
  if (typeof source.id === 'string') return [source.id];
  return typeof source.via === 'string' ? [source.via] : [];
}
function cmpTuple(a, b) {
  for (let i = 0; i < a.length && i < b.length; i++) { const c = cmp(a[i], b[i]); if (c !== 0) return c; }
  return a.length - b.length;
}

// 叠加惩罚系数 S[n]（§3.3 :1356–1357）：只查表，n 越过表长系数为 0（唯一的越界写法，TA-M1）。
function stackingTable(engine) {
  const table = ruleTable(engine.rules, STACKING_TABLE.table)[STACKING_TABLE.key];
  if (!Array.isArray(table) || !table.length) throw new KernelError('E-RULES-UNREGISTERED', {}, `rules.${STACKING_TABLE.table}.${STACKING_TABLE.key} missing`);
  return table.map((s) => fixedUnits(s));
}

/**
 * 分段线性曲线（§1.5 curve 行；§3.3 第 7 步"曲线点为定点，线性插值截断"）：x 落在首尾点之外取端点值。
 * 块 6 6-28 起导出，供卷二十 climate.mjs 的 groundDampCurve 同一份插值（不另写第二份）。
 * @param {{points?: [number, number][]}} curve 曲线点 [x, y] 的有序列表
 * @param {bigint} v 定点自变量
 * @returns {bigint}
 */
export function lookupCurve(curve, v) {
  const pts = isObj(curve) && Array.isArray(curve.points) ? curve.points.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]) : [];
  if (!pts.length) throw new KernelError('E-MOD-STAGE', {}, 'post stage needs a curve with points');
  if (v <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    if (v <= x1) {
      const [x0, y0] = pts[i - 1];
      return y0 + ((y1 - y0) * (v - x0)) / (x1 - x0);
    }
  }
  return pts[pts.length - 1][1];
}

function precisionOf(def) {
  const d = def.type === T.type.map ? def.value || {} : def;
  if (d.type === T.type.integer) return 0;
  return Number.isInteger(d.precision) ? d.precision : 0;
}

// 修正项规整：校验阶段，取值（value 或 valueRX），判 when。不适用返回 null。
function prepareRow(engine, state, kind, id, row, clock) {
  if (!isObj(row) || typeof row.id !== 'string') throw new KernelError('E-MOD-STAGE', { entity: id }, 'modifier row needs an id');
  if (!STAGES.includes(row.stage)) throw new KernelError('E-MOD-STAGE', { entity: id }, `modifier ${row.id}: stage ${JSON.stringify(row.stage)}`);
  if (row.when !== undefined && row.when !== null) {
    const r = evaluateRX(row.when, rxBindings(engine, state, kind, id, row.when, clock), {});
    if (r !== true && r !== false) throw new KernelError('E-MOD-RX', { entity: id }, `modifier ${row.id}: when is not boolean`);
    if (!r) return null;
  }
  let fixed = 0n;
  let value = null;
  if (row.stage !== STAGE.post) {
    value = row.valueRX !== undefined && row.valueRX !== null ? evaluateRX(row.valueRX, rxBindings(engine, state, kind, id, row.valueRX, clock), {}) : row.value;
    if (typeof value !== 'number') throw new KernelError('E-MOD-RX', { entity: id }, `modifier ${row.id}: value is not a number`);
    fixed = fixedUnits(value);
  }
  const source = isObj(row.source) ? row.source : {};
  const sourceId = sourceKey(source);
  return {
    id: row.id, stage: row.stage, value, fixed, curve: row.curve, source, sourceId,
    stackGroup: typeof row.stackGroup === 'string' ? row.stackGroup : null,
    priority: Number.isInteger(row.priority) ? row.priority : 0, unpenalized: row.unpenalized === true,
  };
}

// 去重（§3.3、§3.4，封卷后勘误 1118b26，李白 11-18 块 2-5 裁定③）：同源去重键是 (source.id, target, subject, stage)，分阶段各自去重——
// 同一来源在不同阶段的条都计；同一来源在同一阶段的多条只留按该阶段全序键（§3.3 :1338）排最前的一条。本函数的行已是同一 (target, subject)。
// stackGroup 只在同一 (target, stage) 内取序最高者（§3.2 :1313）。
function dedupe(rows) {
  const bySource = new Map();
  for (const r of rows) {
    const k = `${r.stage}\u0000${r.sourceId.length === 0 ? `\u0000${r.id}` : JSON.stringify(r.sourceId)}`;
    const old = bySource.get(k);
    if (!old || orderOf(r.stage)(r, old) < 0) bySource.set(k, r);
  }
  const out = [];
  for (const stage of STAGES) {
    const inStage = [...bySource.values()].filter((r) => r.stage === stage).sort(orderOf(stage));
    const groups = new Set();
    for (const r of inStage) {
      if (r.stackGroup !== null) { if (groups.has(r.stackGroup)) continue; groups.add(r.stackGroup); }
      out.push(r);
    }
  }
  return out;
}

const num = (v) => fixedToNumber(v);

/**
 * 管线本体（§3.3 伪代码）：base 为基值原生值，rows 为已去重、已按阶段与全序键排好的修正项，def 为维度定义，subjectKind 为主体种类（boundsByKind 用）。
 * 返回 {value: 原生数, steps: explain 段}；rows 为空时返回基值原生值、不经定点与截断（§3.3 :1316，体检 K2-06）。kernel 组内用（过程主体槽同一管线，§3.7）。
 * @param {Engine} engine @param {number} base @param {ReturnType<typeof prepareRow>[]} rows @param {Record<string, any>} def @param {string} subjectKind
 */
export function runPipeline(engine, base, rows, def, subjectKind) {
  if (!rows.length) return { value: base, steps: [] };
  const S = stackingTable(engine);
  const penalized = def.stacking === STACKING_MARKERS.penalized;
  const steps = [];
  const baseFixed = fixedUnits(base);
  let v = baseFixed;
  const push = (r, penalty, before, after) => steps.push(Object.freeze({ stage: r.stage, id: r.id, source: r.source, value: r.value, penalty, before: num(before), after: num(after) }));
  // 第 2 步 add：绝对量，不受罚。
  for (const r of rows.filter((x) => x.stage === STAGE.add)) { const b = v; v = fixedAdd(v, r.fixed); push(r, null, b, v); }
  // 第 3 步 mul：正负分开，各侧按全序键施加；受罚序号各侧从 0 起，unpenalized 乘 S[0] 且不占序号；stacking:none 全部用 S[0]。
  const mul = rows.filter((x) => x.stage === STAGE.mul);
  for (const side of [mul.filter((x) => x.fixed >= 0n), mul.filter((x) => x.fixed < 0n)]) {
    let pen = 0;
    for (const r of side) {
      const s = !penalized || r.unpenalized ? S[0] : pen < S.length ? S[pen++] : (pen++, 0n);
      const b = v;
      v = fixedMultiply(v, fixedScale() + fixedMultiply(r.fixed, s));
      push(r, num(s), b, v);
    }
  }
  // 第 4、5 步 max、min。
  for (const r of rows.filter((x) => x.stage === STAGE.max)) { const b = v; if (r.fixed > v) v = r.fixed; push(r, null, b, v); }
  for (const r of rows.filter((x) => x.stage === STAGE.min)) { const b = v; if (r.fixed < v) v = r.fixed; push(r, null, b, v); }
  // 第 6 步 set：只取序最前的一条。
  const set = rows.filter((x) => x.stage === STAGE.set);
  if (set.length) { const b = v; v = set[0].fixed; push(set[0], null, b, v); }
  // 第 7 步 post：依序查曲线。
  for (const r of rows.filter((x) => x.stage === STAGE.post)) { const b = v; v = lookupCurve(r.curve, v); push(r, null, b, v); }
  // 第 8 步 clamp：boundsByKind[主体种类] 优先于 bounds；boundsRelative 时区间乘基值；null 端无界。
  const byKind = isObj(def.boundsByKind) && Array.isArray(def.boundsByKind[subjectKind]) ? def.boundsByKind[subjectKind] : null;
  const bounds = byKind || (Array.isArray(def.bounds) ? def.bounds : null);
  if (bounds) {
    const lim = bounds.map((b) => (b === null ? null : def.boundsRelative === true ? fixedMultiply(baseFixed, fixedUnits(b)) : fixedUnits(b)));
    const [lo, hi] = lim[0] !== null && lim[1] !== null && lim[0] > lim[1] ? [lim[1], lim[0]] : lim;
    if (lo !== null && v < lo) v = lo;
    if (hi !== null && v > hi) v = hi;
  }
  // 第 9 步 round：按维度 precision 向零截断。
  v = truncateTo(v, precisionOf(def));
  return { value: num(v), steps };
}

function evaluate(engine, state, kind, id, dimension, opts) {
  const reg = registry();
  const target = modKeyOf(reg, kind, dimension, opts.key); // E-MOD-KEY-UNREGISTERED / E-DIM-REF-MISSING
  const def = tableOf(engine, kind).doc.dimensions[dimension];
  const base = readBase(engine, state, kind, id, dimension, opts.key);
  // 基值未知或不适用：不单独求值，原样交回，由消费者按 onUnknown 处置（§3.8 :1440）；显式 null（"没有"）同样不进管线。
  if (!base.known || typeof base.value !== 'number') return { fact: base, steps: Object.freeze([]) };
  const raw = modifierSource ? modifierSource(engine, state, { target, kind, id }) : [];
  const rows = [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!isObj(row) || row.target !== target) continue;
    const r = prepareRow(engine, state, kind, id, row, opts.clock);
    if (r) rows.push(r);
  }
  const { value, steps } = runPipeline(engine, base.value, dedupe(rows), def, kind);
  if (!steps.length) return { fact: base, steps: Object.freeze([]) };
  const unit = unitOf(def);
  const fact = { known: true, applicable: true, value, base: base.value, source: 'modified', ...(base.chain ? { chain: base.chain } : {}) };
  return { fact: Object.freeze(unit === undefined ? fact : { ...fact, unit }), steps: Object.freeze(steps) };
}

/**
 * kernelApi `modified(engine, state, kind, id, dimension)`（§2.1 :436，acceptsState: true）：修正后 Fact，走 §3.3 九步管线。
 * memo inputs 含 day（§2.2 :448）：按 (修正键, 主体, clock.day) 缓存在这份 state 上，state 经内核写入或回滚即整份作废（kernel/memo.mjs）。
 * 无可用修正项时返回基值 Fact 本身（原生值，不经定点截断；§3.3 :1316，体检 K2-06）。
 * @param {Engine} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension @param {ReadOptions} [opts]
 * @returns {Fact}
 */
export function modified(engine, state, kind, id, dimension, opts = {}) {
  const target = modKeyOf(registry(), kind, dimension, opts.key);
  const day = isObj(opts.clock) && opts.clock.day !== undefined ? opts.clock.day : null;
  return stateMemo(state, MEMO_SCOPE, [target, id, day], () => evaluate(engine, state, kind, id, dimension, opts).fact);
}

/**
 * kernelApi `explain(engine, state, kind, id, dimension)`（§3.3 :1362，acceptsState: true）：逐段 `{stage, id, source, value, penalty, before, after}`，
 * 按施加顺序；逐段复算等于 modified 的结果（末段 after 之后只剩 clamp 与按 precision 截断）。无修正返回空列表。
 * @param {Engine} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension @param {ReadOptions} [opts]
 */
export function explain(engine, state, kind, id, dimension, opts = {}) {
  return evaluate(engine, state, kind, id, dimension, opts).steps;
}

// ---------- 读到登记在案的未建派生（卷二 §1.12 封卷后勘误 1118k23） ----------

/**
 * 维度 key 本身登在未建派生登记里，或它的派生式（沿派生式读到的维度递归）依赖了登记项，即真。kernel 组内与 kernelApi 共用一处
 * （kernel/place.mjs 的 placeView、规则层 species.mjs 的 speciesView）：只有这类维度读到 E-MOD-RX 时可按未知交出，其余 E-MOD-RX 照抛。
 * @param {{derived?: Map<string, any>, unbuilt?: Set<string>}} t 加载结果里的一张表 @param {string} key
 * @param {Set<string>} [seen] 递归时已走过的维度（防环）
 * @returns {boolean}
 */
export function dependsOnUnbuilt(t, key, seen = new Set()) {
  if (seen.has(key)) return false;
  seen.add(key);
  if (t.unbuilt instanceof Set && t.unbuilt.has(key)) return true;
  const tree = t.derived instanceof Map ? t.derived.get(key) : undefined;
  if (tree === undefined) return false;
  return rxDimKeys(tree).some((k) => dependsOnUnbuilt(t, splitDimKey(k).dim, seen));
}

/**
 * kernelApi `readsUnbuilt(engine, kind, dimension)`：该表这个维度是否登记在案的未建派生或依赖了它（见 dependsOnUnbuilt）。
 * @param {Engine} engine @param {string} kind @param {string} dimension
 * @returns {boolean}
 */
export function readsUnbuilt(engine, kind, dimension) {
  return dependsOnUnbuilt(tableOf(engine, kind), dimension);
}

// ---------- 读入口在求值时合成的派生项（卷四 §4.2.3 B-5a，提请卷二 §3.2 接收的"第六种来源"） ----------

// 合成项规整：只带算好的数值 value（B-5a (b)，不带 valueRX、when），阶段与数值核对同 prepareRow。
function prepareDerived(d, subjectId, target) {
  if (!isObj(d) || typeof d.id !== 'string') throw new KernelError('E-MOD-STAGE', { entity: subjectId }, `${target}: derived modifier needs an id`);
  if (!STAGES.includes(d.stage) || d.stage === STAGE.post) throw new KernelError('E-MOD-STAGE', { entity: subjectId }, `${target}: derived modifier ${d.id}: stage ${JSON.stringify(d.stage)}`);
  if (typeof d.value !== 'number' || !Number.isFinite(d.value)) throw new KernelError('E-MOD-RX', { entity: subjectId }, `${target}: derived modifier ${d.id}: value is not a finite number`);
  const source = isObj(d.source) ? d.source : {};
  return {
    id: d.id, stage: d.stage, value: d.value, fixed: fixedUnits(d.value), curve: undefined, source, sourceId: sourceKey(source),
    stackGroup: null, priority: 0, unpenalized: d.unpenalized === true,
  };
}

/**
 * kernelApi `modifiedWith(engine, state, ns, subjectId, dimension, opts)`（卷四 §4.2.3 B-5a、B-7；求值管线卷二 §3.3 同一条）：
 * 给"读入口在求值时现场合成派生项"的修正键求值。ns 是修正键的表（`<kind>`）或命名空间（`CAPABILITY_NAMESPACE`），与 dimension、opts.key 拼成修正键
 * （未登记即 E-MOD-KEY-UNREGISTERED）。基值由调用方按卷文给出（opts.base，有限数；卷四 B-1 结构基值、B-2 完好度基值恒 1）；
 * opts.derived 是合成项 `[{id, stage, value, source: {kind, id, via}, unpenalized?}]`，source.id 可为复合键元组；它们不登记进 state.modifiers（B-5a (c)）。
 * 另收修正项来源按 (修正键, 主体) 交来的登记项（B-6），合成项与登记项一起去重、排全序、过九步管线并钳位截断。
 * 返回 {fact, steps}：fact.base 是 opts.base，fact.value 是管线结果；steps 即 explain 逐段，可逐条复算。纯读，不缓存（卷四 §4.11.3 C-6）。
 * @param {Engine} engine @param {any} state @param {string} ns @param {string} subjectId @param {string} dimension
 * @param {{base: number, key?: string|number, derived?: any[], clock?: ReadOptions['clock']}} opts
 */
export function modifiedWith(engine, state, ns, subjectId, dimension, opts) {
  const reg = registry();
  const o = isObj(opts) ? opts : {};
  const target = modKeyOf(reg, ns, dimension, o.key);
  const def = reg.tableDims.get(ns)[dimension];
  if (typeof o.base !== 'number' || !Number.isFinite(o.base)) throw new KernelError('E-MOD-RX', { entity: subjectId }, `${target}: base must be a finite number`);
  const subjectKind = reg.idIndex.get(subjectId);
  const rows = (Array.isArray(o.derived) ? o.derived : []).map((d) => prepareDerived(d, subjectId, target));
  const raw = modifierSource ? modifierSource(engine, state, { target, kind: subjectKind, id: subjectId }) : [];
  for (const row of Array.isArray(raw) ? raw : []) {
    if (!isObj(row) || row.target !== target) continue;
    const r = prepareRow(engine, state, subjectKind, subjectId, row, o.clock);
    if (r) rows.push(r);
  }
  const { value, steps } = runPipeline(engine, o.base, dedupe(rows), def, subjectKind);
  const unit = unitOf(def);
  const fact = { known: true, applicable: true, value, base: o.base, source: steps.length ? 'modified' : 'derived' };
  return { fact: Object.freeze(unit === undefined ? fact : { ...fact, unit }), steps: Object.freeze(steps) };
}
