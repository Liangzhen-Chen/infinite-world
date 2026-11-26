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
  const sources = engine !== null && typeof engine === 'object' ? engine.modifierSources : undefined;
  if (!Array.isArray(sources)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.modifierSources must be an array');
  const fact = dim(engine, state, kind, id, dimension);
  let value = fact.value;
  const ctx = Object.freeze({ engine, state, kind, id, dimension });
  for (const source of sources) {
    if (typeof source !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.modifierSources entries must be functions');
    value = source(value, ctx);
  }
  return Object.freeze({ ...fact, value, base: fact.value });
}
