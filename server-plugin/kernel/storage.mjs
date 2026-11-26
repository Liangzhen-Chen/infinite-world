// kernelApi 存储函数：运行期黑户判定 kindOfEntity、按路径读写 readPath/writePath、新建实体 createEntity
// （卷二 §2.6"按路径读写" :493–497；docs/gemini/kickoff-1125.md:90"state.created 改走 kindOfEntity"）。
// 本卡只做这四件（S1-1 卡 A）；事务、存档序列化等其余存储入口由卡 B 补。
// "id 属于哪个 kind"的唯一判断处是 kindOfEntity：先经加载器交入的 kindOfLoaded 查加载期登记，查不到再看运行期新建的 state.created[id]，
// 按各表 entity.idPrefix / entity.singletonIds 匹配（前缀各表互斥，由 rules/load/registry.mjs 建表时核）。别处一律调它。
// 写路径的值：`created.<id>.props.<维度>` 按该 kind 维度表的声明判，声明为 ref 时调公共部件 validate/types.mjs#checkValue 核目标；
// 其余路径的顶层键须在 engine.stateKeys（world/ontology/state-owners.json 的 stateKeys）里登记。
// null 与空串作 ref 目标一律拒（只在声明为 ref 的维度上判）。

import { KernelError } from './errors.mjs';
import { CODE_RE, T } from './handles.mjs';
import { requireScope, txSet, txTouch } from './transaction.mjs';
import { checkValue } from './validate/types.mjs';

// 路径写入时不得作为段的名字（JS 原型链键，不是状态数据）。
const UNSAFE_KEYS = Object.freeze(['__proto__', 'prototype', 'constructor']);

/** @param {any} state @returns {void} */
function requireState(state) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'state must be a plain object');
  }
}

// 路径实参须是句柄 P 发出的冻结对象 {pattern, segs}（卷二 :536）；裸数组、裸字串一律拒。返回段数组。
/** @param {any} path @returns {readonly any[]} */
function requirePath(path) {
  const ok = path !== null && typeof path === 'object' && !Array.isArray(path) && Object.isFrozen(path)
    && typeof path.pattern === 'string' && Array.isArray(path.segs) && path.segs.length > 0;
  if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'path must be a frozen {pattern, segs} issued by engine.P');
  return path.segs;
}

// 按段读；中途不是对象或没有该键即 undefined。段名运行期才知道，只能按下标取。
function getAt(state, path) {
  let cur = state;
  for (const s of path) {
    if (cur === null || typeof cur !== 'object' || !Object.hasOwn(cur, s)) return undefined;
    cur = cur[s];
  }
  return cur;
}

// 顶层键是否在声明表 stateKeys 里登记（engine.stateKeys 是装配层交入的冻结对象）。
function topKeyRegistered(engine, key) {
  const keys = engine && engine.stateKeys;
  if (keys === null || typeof keys !== 'object') return false;
  return Object.hasOwn(keys, key);
}

// `created.<id>.props.<维度>` 的维度定义；不是该形状返回 undefined，形状对但维度未定义即抛。
// 段名取 handles.mjs 的 STATE_RECORD_SEGS（T.state_record，定义源一处），顶层键还须在 engine.stateKeys 里登记。
function createdPropsDef(engine, state, segs) {
  const [top, id, field, dimension, ...rest] = segs;
  if (rest.length !== 0 || id === undefined || field === undefined || dimension === undefined) return undefined;
  if (top !== T.state_record.created || field !== T.state_record.props) return undefined;
  if (!topKeyRegistered(engine, top)) return undefined;
  const kind = kindOfEntity(engine, state, id);
  const table = engine && engine.registry && engine.registry.tables instanceof Map ? engine.registry.tables.get(kind) : undefined;
  const dims = table && table.dimensions !== null && typeof table.dimensions === 'object' ? table.dimensions : {};
  if (!Object.hasOwn(dims, dimension)) throw new KernelError('E-DIM-UNKNOWN-READ', {}, `dimension ${kind}.${dimension}: not defined in the loaded table`);
  return dims[dimension];
}

// 声明为 ref 的维度：null / 空串照旧拒，其余交 checkValue 按 ref 声明核（不在这里另判一份 ref）。
function checkRefValue(engine, state, def, value, segs) {
  if (!def || def.type !== T.type.ref) return;
  if (value === null || (typeof value === 'string' && value.length === 0)) {
    throw new KernelError('E-DIM-REF-MISSING', {}, 'null or empty string cannot be a ref target');
  }
  const reg = engine && engine.registry;
  /** @type {Map<string, Record<string, any>>} */
  const tableDims = new Map();
  if (reg && reg.tables instanceof Map) for (const [kind, doc] of reg.tables) tableDims.set(kind, doc && doc.dimensions ? doc.dimensions : {});
  const env = {
    kindOf: (x) => kindOfEntity(engine, state, x),
    tableDims,
    vocab: { index: engine && engine.vocabIndex instanceof Map ? engine.vocabIndex : new Map() },
  };
  /** @type {{code: string, want?: unknown} | null} */
  let bad = null;
  checkValue(def, value, env, {}, (e) => { if (bad === null) bad = /** @type {any} */ (e); });
  if (bad !== null) throw new KernelError(bad.code, {}, `ref check failed: ${String(bad.want)}`);
}

/**
 * `id 属于哪个 kind`（唯一判断处）：加载期登记的 id 经 kindOfLoaded；运行期新建的实体（state.created.<id> 有偏离行）按登记前缀 / 单例 id 匹配。
 * 两处都认不出 E-DIM-REF-MISSING。state 非对象、id 非字符串或空串一律抛，不放行。只读。
 * @param {{registry: {kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>, kindOfLoaded?: (id: string) => string | undefined}}} engine
 * @param {any} state
 * @param {string} id
 * @returns {string}
 */
export function kindOfEntity(engine, state, id) {
  requireState(state);
  if (typeof id !== 'string' || id.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'id must be a non-empty string');
  const reg = engine && engine.registry;
  if (!reg || typeof reg.kindOfLoaded !== 'function') throw new KernelError('E-DIM-REF-MISSING', {}, 'registry.kindOfLoaded is required');
  const known = reg.kindOfLoaded(id);
  if (known !== undefined) return known;
  const made = state.created !== null && typeof state.created === 'object' && Object.hasOwn(state.created, id);
  if (made && reg && reg.kindIds instanceof Map) {
    for (const [kind, rec] of reg.kindIds) {
      const prefixes = Array.isArray(rec.idPrefix) ? rec.idPrefix : [];
      const singles = Array.isArray(rec.singletonIds) ? rec.singletonIds : [];
      if (prefixes.some((p) => id.startsWith(p)) || singles.includes(id)) return kind;
    }
  }
  throw new KernelError('E-DIM-REF-MISSING', CODE_RE.test(id) ? { entity: id } : {}, `id ${JSON.stringify(id)}: not loaded and not a created entity`);
}

/**
 * kernelApi `readPath(state, path)`（卷二 :535–:536）：按路径段读取（没有即 undefined）。path 须是句柄 P 发出的路径。不写状态、不碰缓存。
 * @template {string} P
 * @param {any} state
 * @param {import('./types.d.ts').StatePath<P>} path
 * @returns {any}
 */
export function readPath(state, path) {
  requireState(state);
  return getAt(state, requirePath(path));
}

/**
 * kernelApi `writePath(state, path, value, tx)`（卷二 :535–:538）：按路径段写入；写完只作废依赖 path[0] 的缓存。engine 取自 tx.engine。
 * path 须是 tx.engine.P 发出的（P.issued 核来路，裸数组、手搓对象、别的 engine 发的一律拒）。
 * `created.<id>.props.<维度>` 的值按该维度声明判：声明为 ref 时目标须存在（null、空串拒）；其余路径的顶层键须已登记。
 * @template {string} P
 * @param {any} state
 * @param {import('./types.d.ts').StatePath<P>} path
 * @param {any} value
 * @param {any} tx writeScope 给的作用域
 * @returns {void}
 */
export function writePath(state, path, value, tx) {
  requireState(state);
  requireScope(state, tx);
  const engine = tx.engine;
  const segs = requirePath(path);
  if (!engine || !engine.P || typeof engine.P.issued !== 'function' || !engine.P.issued(path)) {
    throw new KernelError('E-PATH-UNDECLARED', {}, 'path was not issued by this engine.P');
  }
  for (const s of segs) {
    if (typeof s !== 'string' || s.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'path segments must be non-empty strings');
    if (UNSAFE_KEYS.includes(s)) throw new KernelError('E-DIM-ID-FORMAT', {}, `unsafe path segment ${JSON.stringify(s)}`);
  }
  const def = createdPropsDef(engine, state, segs);
  if (def !== undefined) checkRefValue(engine, state, def, value, segs);
  else if (!topKeyRegistered(engine, segs[0])) throw new KernelError('E-PATH-UNDECLARED', {}, `top-level state key ${JSON.stringify(segs[0])}: not registered in stateKeys`);
  let cur = state;
  for (let i = 0; i < segs.length - 1; i++) {
    const s = segs[i];
    const next = Object.hasOwn(cur, s) ? cur[s] : undefined;
    if (next === null || typeof next !== 'object') txSet(tx, cur, s, {});
    cur = cur[s];
  }
  txSet(tx, cur, segs[segs.length - 1], value);
  txTouch(tx, segs[0]);
}

/**
 * kernelApi `createEntity(state, id, kind, props, tx)`（卷二 :535）：写 state.created[id] = {kind, props}；写完作废 'created' 的缓存。engine 取自 tx.engine。
 * 核对：kind 已登记、id 带该 kind 的前缀（或在它的 singletonIds 里）、id 未被占用（加载期登记与 created 都查）；任一不合即抛。
 * @param {any} state
 * @param {string} id
 * @param {string} kind
 * @param {any} props
 * @param {any} tx writeScope 给的作用域
 * @returns {void}
 */
export function createEntity(state, id, kind, props, tx) {
  requireState(state);
  requireScope(state, tx);
  const engine = tx.engine;
  if (typeof id !== 'string' || id.length === 0) throw new KernelError('E-DIM-ID-FORMAT', {}, 'id must be a non-empty string');
  const reg = engine && engine.registry;
  const rec = reg && reg.kindIds instanceof Map ? reg.kindIds.get(kind) : undefined;
  if (!rec) throw new KernelError('E-DIM-REF-MISSING', CODE_RE.test(kind) ? { entity: kind } : {}, `kind ${JSON.stringify(kind)}: not registered`);
  const prefixes = Array.isArray(rec.idPrefix) ? rec.idPrefix : [];
  const singles = Array.isArray(rec.singletonIds) ? rec.singletonIds : [];
  if (!prefixes.some((p) => id.startsWith(p)) && !singles.includes(id)) {
    throw new KernelError('E-DIM-ID-FORMAT', CODE_RE.test(id) ? { entity: id } : {}, `id ${JSON.stringify(id)}: does not carry a prefix of kind ${kind}`);
  }
  if (typeof reg.hasLoaded !== 'function') throw new KernelError('E-DIM-REF-MISSING', {}, 'registry.hasLoaded is required');
  if (reg.hasLoaded(id)) throw new KernelError('E-DIM-ID-DUPLICATE', CODE_RE.test(id) ? { entity: id } : {}, `id ${id}: already a loaded entity`);
  if (state.created !== null && typeof state.created === 'object' && Object.hasOwn(state.created, id)) {
    throw new KernelError('E-DIM-ID-DUPLICATE', CODE_RE.test(id) ? { entity: id } : {}, `id ${id}: already created`);
  }
  if (state.created === null || typeof state.created !== 'object') txSet(tx, state, 'created', {});
  txSet(tx, state.created, id, { kind, props });
  txTouch(tx, 'created');
}
