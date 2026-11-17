// 维度键、修正键、state 路径的拼接与核对（卷二 §2.8 表 kernel 行"种子键与维度键拼接只在 kernel/handles/keys.mjs"；
// §2.9 第 2 条强转豁免文件表 keys.mjs 行：按各自文法解析并查注册表，StatePath 另核对模式在 pathTypes 内且不是 textPath 与账本路径）。
// 本文件只做 DimKey、ModKey、StatePath 三种（块 2 第 2-1 张）；SeedKey、NodeName、RxId、TextScope、EventId 的构造随各自那张卡加。
// 注册表全部来自加载结果（维度表表头、idIndex、词表索引、pathTypes），不认任何具体表、维度或路径。

import { CODE_RE, HandleError } from './vocab-handle.mjs';

/** @typedef {import('../types.d.ts').DimKey} DimKey */
/** @typedef {import('../types.d.ts').ModKey} ModKey */
/**
 * @typedef {{tableDims: Map<string, Record<string, any>>, idIndex: Map<string, string>, vocabIndex: Map<string, {family: string}>}} KeyRegistry
 * tableDims：kind → 该表 dimensions 表头；idIndex：实体 id → kind；vocabIndex：词表代号 → {family}。
 */

// 维度键与 struct 字段名文法（§1.9 :278）。
const DIM_RE = /^[a-z][a-zA-Z0-9]{0,47}$/;
// `<kind>.<dimension>[<key>]`（§2.8 第 1 条 DimKey；§5.0 下标键语法 :1586）。
const DIM_KEY_RE = /^([a-z][a-z0-9_]{1,47})\.([a-z][a-zA-Z0-9]{0,47})(?:\[([^[\]]+)\])?$/;
const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;
const NUMERIC = ['number', 'integer'];

// 下标是否合该 map 维度的键定义：数值键收有限数；代号键按键定义的族或 kind 查注册表，没写族与 kind 的查 idIndex 或词表。
function subKeyOk(reg, keyDef, key) {
  const kd = keyDef && typeof keyDef === 'object' ? keyDef : {};
  if (typeof key === 'number') return Number.isFinite(key) && NUMERIC.includes(kd.type);
  if (typeof key !== 'string' || !CODE_RE.test(key)) return false;
  const fam = kd.vocab !== undefined ? kd.vocab : (kd.domain && typeof kd.domain === 'object' ? kd.domain.vocab : undefined);
  if (fam !== undefined) return reg.vocabIndex.has(key) && reg.vocabIndex.get(key).family === fam;
  if (kd.kind !== undefined) return reg.idIndex.get(key) === kd.kind;
  if (Array.isArray(kd.kinds)) return kd.kinds.includes(reg.idIndex.get(key));
  return reg.idIndex.has(key) || reg.vocabIndex.has(key);
}

// 共用：查表头，返回维度定义；未登记交调用方按各自的码报。
function dimDef(reg, kind, dimension) {
  if (typeof kind !== 'string' || !CODE_RE.test(kind)) throw new HandleError('E-DIM-ID-FORMAT', `kind ${JSON.stringify(kind)}: want ^[a-z][a-z0-9_]{1,47}$`);
  if (typeof dimension !== 'string' || !DIM_RE.test(dimension)) throw new HandleError('E-DIM-ID-FORMAT', `dimension ${JSON.stringify(dimension)}: want ^[a-z][a-zA-Z0-9]{0,47}$`);
  const dims = reg.tableDims.get(kind);
  return dims && Object.hasOwn(dims, dimension) ? dims[dimension] : undefined;
}

function join(kind, dimension, key) {
  return key === undefined ? `${kind}.${dimension}` : `${kind}.${dimension}[${key}]`;
}

/**
 * 拼 DimKey：kind 有维度表、dimension 在其表头；带下标时该维必须是 map，下标合其键定义（§5.0 :1586）。
 * 未登记的 kind、维度或下标 E-DIM-REF-MISSING；文法不合 E-DIM-ID-FORMAT。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 * @returns {DimKey}
 */
export function dimKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  if (!def) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension)}: dimension not registered`);
  if (key !== undefined && (def.type !== 'map' || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of a map dimension`);
  return /** @type {DimKey} */ (join(kind, dimension, key));
}

/**
 * 拼 ModKey（§3.1）：`modifiable:true` 的 number/integer/map<…,number> 维度即修正键。
 * 未登记或不可修正 E-MOD-KEY-UNREGISTERED；map 子键不存在 E-DIM-REF-MISSING（§7 A3 :2358）。
 * 本函数只覆盖 `<kind>.<dimension>[<key>]` 一类；`body.<capability>`、`process.<slot>`、存量目标键等另立命名空间随其登记卡加。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 * @returns {ModKey}
 */
export function modKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  const valueType = def && def.type === 'map' ? (def.value || {}).type : def && def.type;
  if (!def || def.modifiable !== true || !NUMERIC.includes(valueType)) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension, key)}: not a modifiable number/integer/map<…,number> dimension`);
  if (def.type === 'map' && key === undefined) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension)}: map dimension needs a subscript`);
  if (key !== undefined && (def.type !== 'map' || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of the map dimension`);
  return /** @type {ModKey} */ (join(kind, dimension, key));
}

/**
 * 解析 DimKey 字串（§5.0 :1586"kernel 拆出维代号与下标，分别查维度登记与 idIndex（或按数值读）"），拆完按 dimKeyOf 同一套核对。
 * @param {KeyRegistry} reg @param {string} text
 * @returns {{key: DimKey, kind: string, dimension: string, sub: string|number|undefined}}
 */
export function parseDimKey(reg, text) {
  const m = typeof text === 'string' ? DIM_KEY_RE.exec(text) : null;
  if (!m) throw new HandleError('E-DIM-ID-FORMAT', `dim key ${JSON.stringify(text)}: want <kind>.<dimension>[<key>]`);
  const [, kind, dimension, raw] = m;
  const def = dimDef(reg, kind, dimension);
  const numericKey = def && def.type === 'map' && NUMERIC.includes((def.key || {}).type);
  const sub = raw === undefined ? undefined : (numericKey && DECIMAL_RE.test(raw) ? Number(raw) : raw);
  return { key: dimKeyOf(reg, kind, dimension, sub), kind, dimension, sub };
}

/**
 * 模式的 `*` 段数（§2.7 路径模式匹配语义：按 `.` 分段，`*` 恰匹配一段）。
 * @param {string} pattern
 */
export function wildcardCount(pattern) {
  return pattern.split('.').filter((s) => s === '*').length;
}

/** pathTypes 模式字面段文法（李白 11-17 pathTypes 段文法裁定及其修正，卷二 §2.7）：小写字母开头，后面允许大小写字母、数字、下划线。 */
export const PATH_SEGMENT_RE = /^[a-z][a-zA-Z0-9_]*$/;
/** 保留字段名（防原型污染，与 __proto__ 同理）：整类拒收。 */
export const PATH_SEGMENT_RESERVED = new Set(['constructor', 'prototype']);

/**
 * 校验一条 pathTypes 模式：每个非 `*` 段合 PATH_SEGMENT_RE，且至少一个字面段（全 `*` 的模式派生成员名为空串）。
 * 违者 E-PATH-SEGMENT-GRAMMAR。所有读 pathTypes 模式生成句柄的入口都经它（generated.mjs buildP）。
 * @param {string} pattern
 */
export function checkPathPattern(pattern) {
  const segs = typeof pattern === 'string' ? pattern.split('.') : [];
  const bad = segs.find((s) => s !== '*' && (!PATH_SEGMENT_RE.test(s) || PATH_SEGMENT_RESERVED.has(s)));
  if (!segs.length || bad !== undefined) throw new HandleError('E-PATH-SEGMENT-GRAMMAR', `pathTypes pattern ${JSON.stringify(pattern)}: literal segment ${JSON.stringify(bad)} not ^[a-z][a-zA-Z0-9_]*$ or reserved word`);
  if (!segs.some((s) => s !== '*')) throw new HandleError('E-PATH-SEGMENT-GRAMMAR', `pathTypes pattern ${JSON.stringify(pattern)}: needs at least one literal segment`);
}

/**
 * 拆 state 路径或路径模式为段（§2.7 路径模式匹配语义：按 `.` 分段）。kernel 组里 state 路径的字串拆分只在本文件做（§2.8 表 kernel 行），
 * storage.mjs 读写时经它拿段，不自己切字串。不是非空字串、或有空段，返回 null。
 * @param {unknown} path
 * @returns {string[] | null}
 */
export function statePathSegments(path) {
  if (typeof path !== 'string' || path === '') return null;
  const segs = path.split('.');
  return segs.includes('') ? null : segs;
}

/**
 * @typedef {{base: 'number'|'integer'|'boolean'|'dimension'|'sealed'|'EventId'} | {base: 'ref'|'enum'|'struct', name: string} | {base: 'list', item: PathTypeShape}} PathTypeShape
 */

/**
 * 解析 pathTypes 的值类型串为结构（文法同 kernel/load/state-owners.mjs 的核对：number[:单位]、integer[:单位]、boolean、ref:<kind>、enum:<族>、
 * dimension、struct:<名>、sealed、EventId、list<…>）。类型文法的解析只在本文件（§2.8 表 kernel 行），storage.mjs 运行期按结构核对值。
 * 不合文法返回 null（加载期已由合并器报，运行期按值类型不符处置）。
 * @param {unknown} t
 * @returns {PathTypeShape | null}
 */
export function pathTypeShape(t) {
  if (typeof t !== 'string') return null;
  const list = /^list<(.+)>$/.exec(t);
  if (list) { const item = pathTypeShape(list[1]); return item ? { base: 'list', item } : null; }
  const num = /^(number|integer)(?::.*)?$/.exec(t);
  if (num) return { base: /** @type {'number'|'integer'} */ (num[1]) };
  if (t === 'boolean' || t === 'dimension' || t === 'sealed' || t === 'EventId') return { base: t };
  const named = /^(ref|enum|struct):([a-zA-Z][a-zA-Z0-9_<>]*)$/.exec(t);
  if (named) { const [, base, name] = named; return { base: /** @type {'ref'|'enum'|'struct'} */ (base), name }; }
  return null;
}

/**
 * 拼 StatePath<P>（§2.6 第 1 条）：pattern 必须是可生成 P 构造函数的模式（在 pathTypes 内、不是 textPath 与账本路径，由调用方给出集合），
 * 每个 `*` 段按次序换成一个实参；实参须是非空、不含 `.` 的字串（EntityId、EventId 或 Handle 的值形态），保证拼出的路径仍由该模式匹配。
 * 模式不在集合内或实参个数不符 E-PATH-UNDECLARED；段值不合 E-DIM-ID-FORMAT。
 * @template {string} P
 * @param {Set<string>} patterns @param {P} pattern @param {string[]} segs
 * @returns {import('../types.d.ts').StatePath<P>}
 */
export function statePathOf(patterns, pattern, segs) {
  if (!patterns.has(pattern)) throw new HandleError('E-PATH-UNDECLARED', `${JSON.stringify(pattern)}: not a P-constructible pathTypes pattern`);
  const parts = pattern.split('.');
  if (segs.length !== wildcardCount(pattern)) throw new HandleError('E-PATH-UNDECLARED', `${pattern}: ${segs.length} segment(s) given, ${wildcardCount(pattern)} wildcard(s)`);
  let i = 0;
  const out = parts.map((p) => {
    if (p !== '*') return p;
    const s = segs[i++];
    if (typeof s !== 'string' || s === '' || s.includes('.')) throw new HandleError('E-DIM-ID-FORMAT', `${pattern}: segment ${JSON.stringify(s)} not a single path segment`);
    return s;
  });
  return /** @type {import('../types.d.ts').StatePath<P>} */ (out.join('.'));
}
