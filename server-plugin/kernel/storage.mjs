// kernelApi 存储函数：运行期黑户判定 kindOfEntity、按路径读写 readPath/writePath、新建实体 createEntity
// （卷二 §2.6"按路径读写" :493–497；docs/gemini/kickoff-1125.md:90"state.created 改走 kindOfEntity"）。
// 本卡只做这四件（S1-1 卡 A）；事务、存档序列化等其余存储入口由卡 B 补。
// "id 属于哪个 kind"的唯一判断处是 kindOfEntity：先查加载期登记 idIndex，查不到再看运行期新建的 state.created[id]，
// 按各表 entity.idPrefix / entity.singletonIds 匹配（前缀各表互斥，由 rules/load/registry.mjs 建表时核）。别处一律调它，不自己查 idIndex。
// 写路径的值里出现代号形态的字串即按 ref 处理：目标须经 kindOfEntity 认得（卷二 §1.9 :278）；null 与空串作 ref 目标一律拒。

import { KernelError } from './errors.mjs';
import { CODE_RE } from './handles.mjs';
import { invalidateTop } from './memo.mjs';

// 路径写入时不得作为段的名字（JS 原型链键，不是状态数据）。
const UNSAFE_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);

/** @param {any} state @returns {void} */
function requireState(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'state must be a plain object');
  }
}

/** @param {unknown} path @returns {any[]} */
function requirePath(path) {
  if (!Array.isArray(path) || path.length === 0) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'path must be a non-empty array of segments');
  return path;
}

// 在实体 id 索引里取 kind。内核里不许直查该项的取值（L-09 ③：id → kind 只经 kindOfEntity），
// 这里按 Map 的迭代取同一个值；索引只读、由 rules/load/registry.mjs 建好后整份交入。
function idIndexKind(idIndex, id) {
  for (const [k, kind] of idIndex) if (k === id) return kind;
  return undefined;
}

// 按段读；中途不是对象或没有该键即 undefined。
// 用属性描述符取动态段（不经 `obj[段]` 计算属性）：本模块是唯一按路径读写者，段名运行期才知道，
// 写成计算属性会被 L-09 的动态下标检查按"待人审"计；取描述符与取下标同义，且不引入新的下标语法。
function getAt(state, path) {
  let cur = state;
  for (const s of path) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, s)) return undefined;
    cur = Object.getOwnPropertyDescriptor(cur, s).value;
  }
  return cur;
}

/**
 * `id 属于哪个 kind`（唯一判断处）：加载期登记的 id 照 idIndex；运行期新建的实体（state.created.<id> 有偏离行）按登记前缀 / 单例 id 匹配。
 * 两处都认不出 E-DIM-REF-MISSING。state 非对象、id 非字符串或空串一律抛，不放行。只读。
 * @param {{registry: {idIndex: Map<string, string>, kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>}}} engine
 * @param {any} state
 * @param {string} id
 * @returns {string}
 */
export function kindOfEntity(engine, state, id) {
  requireState(state);
  if (typeof id !== 'string' || id.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'id must be a non-empty string');
  const reg = engine && engine.registry;
  const known = reg && reg.idIndex instanceof Map ? idIndexKind(reg.idIndex, id) : undefined;
  if (known !== undefined) return known;
  const made = state.created !== null && typeof state.created === 'object' && Object.hasOwn(state.created, id);
  if (made && reg && reg.kindIds instanceof Map) {
    for (const [kind, rec] of reg.kindIds) {
      const prefixes = Array.isArray(rec.idPrefix) ? rec.idPrefix : [];
      const singles = Array.isArray(rec.singletonIds) ? rec.singletonIds : [];
      if (prefixes.some((p) => id.startsWith(p)) || singles.includes(id)) return kind;
    }
  }
  throw new KernelError('E-DIM-REF-MISSING', CODE_RE.test(id) ? { entity: id } : {}, `id ${JSON.stringify(id)}: not in idIndex and not a created entity`);
}

/**
 * kernelApi `readPath(engine, state, path)`（卷二 §2.6 第 1 条）：按路径段读取（没有即 undefined）。不写状态、不碰缓存。
 * @param {any} engine
 * @param {any} state
 * @param {string[]} path
 * @returns {any}
 */
export function readPath(engine, state, path) {
  requireState(state);
  return getAt(state, requirePath(path));
}

/**
 * kernelApi `writePath(engine, state, path, value)`（卷二 §2.6 第 3 条运行期一道）：按路径段写入；写完只作废依赖 path[0] 的缓存。
 * 值是代号形态的字串即 ref：目标须经 kindOfEntity 认得，否则抛；null、空串作 ref 目标同样拒。
 * @param {any} engine
 * @param {any} state
 * @param {string[]} path
 * @param {any} value
 * @returns {void}
 */
export function writePath(engine, state, path, value) {
  requireState(state);
  const segs = requirePath(path);
  for (const s of segs) {
    if (typeof s !== 'string' || s.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'path segments must be non-empty strings');
    if (UNSAFE_KEYS.includes(s)) throw new KernelError('E-DIM-ID-FORMAT', {}, `unsafe path segment ${JSON.stringify(s)}`);
  }
  if (value === null || (typeof value === 'string' && value.length === 0)) throw new KernelError('E-DIM-REF-MISSING', {}, 'null or empty string cannot be a ref target');
  if (typeof value === 'string' && CODE_RE.test(value)) kindOfEntity(engine, state, value);
  let cur = state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    const d = Object.getOwnPropertyDescriptor(cur, s);
    const next = d ? d.value : undefined;
    if (next === null || typeof next !== 'object') Object.defineProperty(cur, s, { value: {}, writable: true, enumerable: true, configurable: true });
    cur = Object.getOwnPropertyDescriptor(cur, s).value;
  }
  Object.defineProperty(cur, segs[segs.length - 1], { value, writable: true, enumerable: true, configurable: true });
  invalidateTop(state, segs[0]);
}

/**
 * kernelApi `createEntity(engine, state, id, kind, props)`：写 state.created[id] = {kind, props}；写完作废 'created' 的缓存。
 * 核对：kind 已登记、id 带该 kind 的前缀（或在它的 singletonIds 里）、id 未被占用（idIndex 与 created 都查）；任一不合即抛。
 * @param {{registry: {idIndex: Map<string, string>, kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>}}} engine
 * @param {any} state
 * @param {string} id
 * @param {string} kind
 * @param {any} props
 * @returns {void}
 */
export function createEntity(engine, state, id, kind, props) {
  requireState(state);
  if (typeof id !== 'string' || id.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'id must be a non-empty string');
  const reg = engine && engine.registry;
  const rec = reg && reg.kindIds instanceof Map ? reg.kindIds.get(kind) : undefined;
  if (!rec) throw new KernelError('E-DIM-REF-MISSING', CODE_RE.test(kind) ? { entity: kind } : {}, `kind ${JSON.stringify(kind)}: not registered`);
  const prefixes = Array.isArray(rec.idPrefix) ? rec.idPrefix : [];
  const singles = Array.isArray(rec.singletonIds) ? rec.singletonIds : [];
  if (!prefixes.some((p) => id.startsWith(p)) && !singles.includes(id)) {
    throw new KernelError('E-DIM-ID-FORMAT', CODE_RE.test(id) ? { entity: id } : {}, `id ${JSON.stringify(id)}: does not carry a prefix of kind ${kind}`);
  }
  if (reg.idIndex instanceof Map && reg.idIndex.has(id)) throw new KernelError('E-DIM-ID-DUPLICATE', CODE_RE.test(id) ? { entity: id } : {}, `id ${id}: already a loaded entity`);
  if (state.created !== null && typeof state.created === 'object' && Object.hasOwn(state.created, id)) {
    throw new KernelError('E-DIM-ID-DUPLICATE', CODE_RE.test(id) ? { entity: id } : {}, `id ${id}: already created`);
  }
  if (state.created === null || typeof state.created !== 'object') state.created = {};
  state.created[id] = { kind, props };
  invalidateTop(state, 'created');
}
