// 横切入口 dim / modified 的最小版（S1-1 卡 A；卷二 §2.1 :436、§2.2 :445）。
// dim 只给基值，取值顺序：state.created[id].props（偏离行）→ 实体行 rows[created[id].template ?? id] → 类别行 classes[<实体行的 classes>] → 表默认值 def.default；
// 都没有即抛错（不给缺省）。结果按顶层键 'created' 切片缓存在这份 state 上（kernel/memo.mjs），实体行与类别行是加载期数据、不入依赖。
// modified = dim 后依次过 engine.modifierSources（冻结数组；空数组即零个修正项；不是数组即抛，不兜底）。来源的统一调用口径是 source(value, ctx)，
// ctx = {engine, state, kind, id, dimension}；一元函数忽略多余实参或直接用 ctx 都行。本卡不实现九步管线与来源解析（卡 B 起再补）。
// 只按登记数据判，不认任何具体 kind、维度或 id。

import { KernelError } from './errors.mjs';
import { T, GRAMMAR_TOKENS } from './handles.mjs';
import { stateMemo, inputsOf } from './memo.mjs';

const DIM_MEMO = 'kernel/dimensions.mjs#dim';
// dim 的依赖节点名前缀（卷二 :502 示例 `dim:<kind>`）；按 kind 取 `dim:<kind>`，由 memo.mjs 解析到下面这条通配声明。
const DIM_NODE = 'dim:';
/**
 * dim 的依赖声明（卷二 :509–:513；装配层收齐交 memo.mjs#closeInputs）：任一 kind 只依赖 state.created 下的实体记录
 * （实体行、类别行与表默认值是加载期数据）。段名取 handles.mjs（T.state_record、GRAMMAR_TOKENS.wildcard，定义源一处）。
 */
export const DIM_DECL = Object.freeze({
  node: `${DIM_NODE}${GRAMMAR_TOKENS.wildcard}`,
  own: Object.freeze([Object.freeze([T.state_record.created, GRAMMAR_TOKENS.wildcard])]),
  uses: Object.freeze([]),
});

/** @param {{registry: {tables: Map<string, Record<string, any>>}}} engine @param {string} kind @returns {Record<string, any>} */
function tableDoc(engine, kind) {
  const doc = engine && engine.registry && engine.registry.tables instanceof Map ? engine.registry.tables.get(kind) : undefined;
  if (!doc) throw new KernelError('E-DIM-REF-MISSING', {}, `kind ${JSON.stringify(kind)}: no dimension table`);
  return doc;
}

// 偏离行（state.created[id].props）；没有即 undefined。
function createdProps(state, id) {
  const row = state !== null && typeof state === 'object' && state.created !== null && typeof state.created === 'object' ? state.created[id] : undefined;
  return row !== null && typeof row === 'object' && row.props !== null && typeof row.props === 'object' ? row.props : undefined;
}

// 实例的实体行 id：运行期新建实体记了 template 就取模板实体行（卷二:131），否则就是它自己。
function rowId(state, id) {
  const rec = state !== null && typeof state === 'object' && state.created !== null && typeof state.created === 'object' && Object.hasOwn(state.created, id) ? state.created[id] : undefined;
  return rec !== null && typeof rec === 'object' && typeof rec.template === 'string' ? rec.template : id;
}

// 实体的手写类别（实体行的 classes 数组）；没有即空数组。
function rowClasses(row) {
  return row !== null && typeof row === 'object' && Array.isArray(row.classes) ? row.classes : [];
}

// 依次查偏离行、实体行、类别行、表默认值；第一个有该维度的即取，返回 {value, source}（source 是取值来自哪一级，标记表 T.fact_source）。都没有抛 E-DIM-UNKNOWN-READ。
function readBase(engine, state, kind, id, dimension) {
  const doc = tableDoc(engine, kind);
  const props = createdProps(state, id);
  if (props && Object.hasOwn(props, dimension)) return { value: props[dimension], source: T.fact_source.created_row };
  const rows = doc.rows !== null && typeof doc.rows === 'object' && !Array.isArray(doc.rows) ? doc.rows : {};
  const rid = rowId(state, id);
  const row = Object.hasOwn(rows, rid) ? rows[rid] : undefined;
  if (row !== null && typeof row === 'object' && Object.hasOwn(row, dimension)) return { value: row[dimension], source: T.fact_source.entity_row };
  const classes = doc.classes !== null && typeof doc.classes === 'object' ? doc.classes : {};
  for (const cls of rowClasses(row)) {
    const c = Object.hasOwn(classes, cls) ? classes[cls] : undefined;
    if (c !== null && typeof c === 'object' && Object.hasOwn(c, dimension)) return { value: c[dimension], source: T.fact_source.category_row };
  }
  const defs = doc.dimensions !== null && typeof doc.dimensions === 'object' ? doc.dimensions : {};
  const def = Object.hasOwn(defs, dimension) ? defs[dimension] : undefined;
  if (def !== null && typeof def === 'object' && Object.hasOwn(def, 'default')) return { value: def.default, source: T.fact_source.table_default };
  throw new KernelError('E-DIM-UNKNOWN-READ', {}, `${kind}.${dimension} of ${JSON.stringify(id)}: no created value, entity row, class row or table default`);
}

/**
 * kernelApi `dim(engine, state, kind, id, dimension)`（卷二 §2.1 :436、§2.2 :445）：基值，不经修正；返回 Fact（卷二 :484，本卡给 known/applicable/current 为 true 的形状）。
 * 按顶层键 'created' 缓存在这份 state 上（stateMemo）。
 * @param {any} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension
 * @returns {{known: true, applicable: true, value: any, source: string, current: true}}
 */
export function dim(engine, state, kind, id, dimension) {
  const key = [DIM_MEMO, kind, id, dimension];
  return stateMemo(state, engine, key, () => {
    const got = readBase(engine, state, kind, id, dimension);
    return Object.freeze({ known: true, applicable: true, value: got.value, source: got.source, current: true });
  }, inputsOf(engine, `${DIM_NODE}${kind}`));
}

/**
 * kernelApi `modified(engine, state, kind, id, dimension)`（卷二 §2.1 :436）：dim 后依次过 engine.modifierSources。
 * 空数组即零个修正项（value 等于 base）；engine.modifierSources 不是数组即 E-DIM-STRUCT-FIELD（装配层须显式交，不兜底）。返回 Fact，另带 base（dim 的 value）。每个来源以 source(value, ctx) 调用，ctx = {engine, state, kind, id, dimension}。
 * @param {any} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension
 * @returns {any}
 */
export function modified(engine, state, kind, id, dimension) {
  if (!Array.isArray(engine !== null && typeof engine === 'object' ? engine.modifierSources : undefined)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.modifierSources must be an array');
  const fact = dim(engine, state, kind, id, dimension);
  return modifiedWith(engine, state, kind, id, dimension, fact.value, Object.freeze([]), fact);
}

/**
 * 读入口合成派生项的求值（卷四 B-5a、B-7）：基值 base 先加上读入口现场合成的 add 项 terms（数值，按序相加），再依次过 engine.modifierSources（同 modified 的调用口径）。
 * modified 即 terms 为空、base 取 dim 值的这一种；读入口（如 bodyView 的能力值）没有维度行可读时直接交基值。返回 Fact，另带 base。
 * engine.modifierSources 不是数组、来源不是函数、terms 不是数值数组即 E-DIM-STRUCT-FIELD（不兜底）。
 * @param {any} engine @param {any} state @param {string} kind @param {string} id @param {string} dimension @param {any} base @param {ReadonlyArray<number>} terms
 * @param {{source?: string}} [fact] 基值来自 dim 时交 dim 的 Fact（带取值来源）
 * @returns {any}
 */
export function modifiedWith(engine, state, kind, id, dimension, base, terms, fact) {
  const sources = engine !== null && typeof engine === 'object' ? engine.modifierSources : undefined;
  if (!Array.isArray(sources)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.modifierSources must be an array');
  if (!Array.isArray(terms) || !terms.every((t) => typeof t === 'number') || (terms.length > 0 && typeof base !== 'number')) {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'modifiedWith: terms must be numbers added to a numeric base');
  }
  let value = terms.reduce((acc, t) => acc + t, base);
  const ctx = Object.freeze({ engine, state, kind, id, dimension });
  for (const source of sources) {
    if (typeof source !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.modifierSources entries must be functions');
    value = source(value, ctx);
  }
  return Object.freeze({ known: true, applicable: true, ...(fact && fact.source !== undefined ? { source: fact.source } : {}), current: true, value, base });
}

// 码点序比较（契约 ctr_map_nonnull_view：按键码点序）；逐码点比，不按 UTF-16 码元。
/** @param {string} a @param {string} b @returns {number} */
function codePointOrder(a, b) {
  const x = [...a];
  const y = [...b];
  for (let i = 0; i < x.length && i < y.length; i += 1) {
    const d = Number(x[i].codePointAt(0)) - Number(y[i].codePointAt(0));
    if (d !== 0) return d;
  }
  return x.length - y.length;
}

/**
 * 全族映射的非 null 只读视图（契约 ctr_map_nonnull_view，world/ontology/contracts.json:225；卷二 §1.6 第 4 项）：映射展平后覆盖键类型全族，
 * 「某键没有」写 null；规则层遍历映射一律经它，只见值非 null 的项，按键码点序，冻结。dim 照旧原样给含 null 的映射（null 是已知值）。
 * 不是映射（null、数组、非对象）即 E-DIM-STRUCT-FIELD。
 * @param {unknown} map @returns {ReadonlyArray<readonly [string, unknown]>}
 */
export function presentEntries(map) {
  if (map === null || typeof map !== 'object' || Array.isArray(map)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'presentEntries: value must be a map');
  const m = Object(map);
  /** @type {Array<readonly [string, unknown]>} */
  const out = [];
  for (const k of Object.keys(m).filter((key) => m[key] !== null).sort(codePointOrder)) {
    /** @type {readonly [string, unknown]} */
    const pair = Object.freeze([k, m[k]]);
    out.push(pair);
  }
  return Object.freeze(out);
}

// ---- S2-0a：所属类别行（卷二 §1.3 :17–:18、:137–:157 取值算法的「类别行一级」；公共部件，终止协议第 1 步读 termination 经它）----

/** 同表 rows 或 classes 里的一行；都没有即 undefined。 @param {Record<string, any>} doc @param {string} rid */
function tableRow(doc, rid) {
  const rows = doc.rows !== null && typeof doc.rows === 'object' ? doc.rows : {};
  if (Object.hasOwn(rows, rid)) return rows[rid];
  const classes = doc.classes !== null && typeof doc.classes === 'object' ? doc.classes : {};
  return Object.hasOwn(classes, rid) ? classes[rid] : undefined;
}

/**
 * 一行连同它 extends 链上的各行（卷二 :137：extends 复制父有效行，子先父后）；目标不在同表 E-DIM-EXTENDS-TARGET，成环 E-DIM-CYCLE。
 * @param {Record<string, any>} doc @param {string} rid @returns {Array<readonly [string, any]>}
 */
function extendsChain(doc, rid) {
  /** @type {Array<readonly [string, any]>} */
  const out = [];
  /** @type {string | undefined} */
  let cur = rid;
  while (cur !== undefined) {
    const at = cur;
    if (out.some(([seen]) => seen === at)) throw new KernelError('E-DIM-CYCLE', {}, `extends chain of ${JSON.stringify(rid)} loops at ${JSON.stringify(at)}`);
    const row = tableRow(doc, at);
    if (row === null || typeof row !== 'object') throw new KernelError('E-DIM-EXTENDS-TARGET', {}, `${JSON.stringify(at)}: extends target not in table ${String(doc.kind)}`);
    out.push(Object.freeze([at, row]));
    cur = typeof row[T.row_field.extends] === 'string' ? row[T.row_field.extends] : undefined;
  }
  return out;
}

/**
 * kernelApi `classRowsOf(engine, state, kind, id)`：按取值次序列出该实体要依次查的各行 [行 id, 行]，冻结：
 * ① 实体行（运行期新建的取 template 所指实体行）及其 extends 链；
 * ② 所属类别行：实体行 classes（表头写了 classesFrom 的，再加该维度所指那一行的 classes，卷二:562「由物种行派生」），
 *    只取本表 classes 里有、且列在 precedenceGroups.default 里的类别行，按该组次序（卷二:156–:157），各带自己的 extends 链。
 * 只按表头与行数据判，不认任何 kind、类别或 id；运行期新建实体没有实体行时 ① 为空。
 * @param {any} engine @param {any} state @param {string} kind @param {string} id
 * @returns {ReadonlyArray<readonly [string, any]>}
 */
export function classRowsOf(engine, state, kind, id) {
  const doc = tableDoc(engine, kind);
  const rid = rowId(state, id);
  const rows = doc.rows !== null && typeof doc.rows === 'object' ? doc.rows : {};
  const own = Object.hasOwn(rows, rid) ? extendsChain(doc, rid) : [];
  /** @type {string[]} */
  const member = [];
  for (const [, row] of own) for (const c of rowClasses(row)) member.push(c);
  if (typeof doc.classesFrom === 'string') {
    const ref = readBase(engine, state, kind, id, doc.classesFrom).value;
    const refKind = engine.registry.kindOfLoaded(ref);
    if (typeof refKind !== 'string') throw new KernelError('E-DIM-REF-MISSING', {}, `${kind}.${doc.classesFrom} of ${JSON.stringify(id)}: not a loaded row`);
    for (const [, row] of extendsChain(tableDoc(engine, refKind), ref)) for (const c of rowClasses(row)) member.push(c);
  }
  const classes = doc.classes !== null && typeof doc.classes === 'object' ? doc.classes : {};
  const groups = doc.precedenceGroups !== null && typeof doc.precedenceGroups === 'object' ? doc.precedenceGroups : {};
  const order = Array.isArray(groups.default) ? groups.default : [];
  const present = [...new Set(member)].filter((c) => Object.hasOwn(classes, c));
  const ranked = order.filter((c) => present.includes(c));
  /** @type {Array<readonly [string, any]>} */
  const out = [...own];
  for (const c of ranked) for (const pair of extendsChain(doc, c)) if (!out.some(([seen]) => seen === pair[0])) out.push(pair);
  return Object.freeze(out);
}
