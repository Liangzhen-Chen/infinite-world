// kernelApi `stateMemo` 与切片失活 `invalidateTop`（卷二 §2.7 kernelApi :509、:573；docs/gemini/kickoff-1125.md:64、:91）。
// 本文件是内核里唯一声明顶层 WeakMap/Map 的模块（L-09 ③）。缓存分片按状态顶层键：每个缓存格记下它依赖的各顶层键的代号快照，
// 命中时比快照；内核写状态时只对该顶层键调 invalidateTop，代号 +1，其余顶层键下的格照旧命中。
// 不读墙钟、不用随机数；只按参数与 state 的顶层键代号判，不认任何具体顶层键名。
// 另含依赖声明的闭包 closeInputs 与按名取闭包的 inputsOf（结果挂 engine.inputs，本文件不另存顶层状态）。

import { KernelError } from './errors.mjs';
import { GRAMMAR_TOKENS } from './handles.mjs';

/**
 * state → {gen: 顶层键 → 代号, cells: 缓存键 → {snapshot, value}}。
 * @type {WeakMap<object, {gen: Map<any, number>, cells: Map<string, {snapshot: number[], value: any}>}>}
 */
let memos = new WeakMap();

// inputs 的校核与顶层键提取：非空路径数组，每项非空路径（取 path[0] 为顶层键）。不合即抛（不静默当成无依赖）。
function topKeysOf(inputs) {
  if (!Array.isArray(inputs) || inputs.length === 0) throw new Error('kernel/memo.mjs: stateMemo inputs must be a non-empty array of paths');
  const tops = [];
  for (const p of inputs) {
    if (!Array.isArray(p) || p.length === 0) throw new Error('kernel/memo.mjs: stateMemo inputs must be non-empty path arrays');
    tops.push(p[0]);
  }
  return tops;
}

// 缓存键：调用方给的 cache 名 + 依赖路径（同一 cache 名配不同依赖不串格）。
// key 是非空数组（缓存名 + 参数，卷二:509），整体 JSON 序列化，['a,b'] 与 ['a','b'] 不撞键。
const cellKeyOf = (key, inputs) => JSON.stringify([key, inputs]);

function requireKey(key) {
  if (!Array.isArray(key) || key.length === 0) throw new Error('kernel/memo.mjs: stateMemo key must be a non-empty array');
}

function recordOf(state) {
  let rec = memos.get(state);
  if (!rec) memos.set(state, (rec = { gen: new Map(), cells: new Map() }));
  return rec;
}

/**
 * 按 (state, key, inputs) 缓存 build() 的结果：命中条件是各依赖顶层键的代号与缓存时相同。
 * inputs 是非空的路径数组，每项是路径数组，取 path[0] 为顶层键（如 `[['created']]`）。
 * state 不是对象时不缓存，直接 build()。返回缓存里的同一个值，调用者不得改它。
 * @template T
 * @param {any} state
 * @param {any} engine
 * @param {ReadonlyArray<unknown>} key 非空数组：缓存名 + 参数（同一 state 下不同用途互不相混）
 * @param {() => T} build
 * @param {ReadonlyArray<ReadonlyArray<any>>} inputs 依赖路径数组（非空）
 * @returns {T}
 */
export function stateMemo(state, engine, key, build, inputs) {
  requireKey(key);
  const tops = topKeysOf(inputs);
  if (state === null || typeof state !== 'object') return build();
  const rec = recordOf(state);
  const ck = cellKeyOf(key, inputs);
  const snapshot = tops.map((t) => rec.gen.get(t) || 0);
  const cell = rec.cells.get(ck);
  if (cell && cell.snapshot.length === snapshot.length && cell.snapshot.every((n, i) => n === snapshot[i])) return cell.value;
  const value = build();
  rec.cells.set(ck, { snapshot, value });
  return value;
}

/**
 * 作废依赖该顶层键的全部缓存格：该键代号 +1。内核写状态（writePath、createEntity 等）写完调它；不在 kernelApi。
 * @param {any} state
 * @param {any} topKey 顶层键（如 'created'）
 * @returns {void}
 */
export function invalidateTop(state, topKey) {
  if (state === null || typeof state !== 'object') return;
  const rec = recordOf(state);
  rec.gen.set(topKey, (rec.gen.get(topKey) || 0) + 1);
}

// 依赖声明的闭包（卷二 :509–:513、:2476 A10；S1-1c 派卡「主会话已定」第 4 条）：声明是各模块导出的冻结常量
// {node, own, uses}，装配层（rules/load/mount.mjs）收齐后调 closeInputs 算一次传递闭包，结果挂 engine.inputs；inputsOf 按名取同一冻结数组。
// 节点名解析只有一条通用规则：精确名优先，否则「冒号前缀:*」的声明（不认具体前缀或 kind）。
// 节点名「<前缀>:<名>」的分隔符（卷二 :502–:513 示例 `dim:place`、`view:placeView`）。
const NODE_SEP = ':';

/** 按名找声明：精确名，否则 `<前缀>:*`；都没有返回 undefined。 @param {ReadonlyMap<string, any>} byNode @param {string} node */
function resolveNode(byNode, node) {
  if (byNode.has(node)) return node;
  const cut = typeof node === 'string' ? node.indexOf(NODE_SEP) : -1;
  const wild = cut < 0 ? undefined : `${node.slice(0, cut + NODE_SEP.length)}${GRAMMAR_TOKENS.wildcard}`;
  return wild !== undefined && byNode.has(wild) ? wild : undefined;
}

const undeclared = (/** @type {unknown} */ node) => new KernelError('E-VIEW-UNDECLARED-READ', {}, `inputsOf: node ${JSON.stringify(node)} has no declaration`);

/**
 * 依赖声明的传递闭包（kernel 组内；callerFiles rules/load/mount.mjs）：每个节点的依赖路径 = own ∪ 其 uses 各节点的闭包，按首次出现去重，
 * 每条路径与整组冻结。uses 指向未声明节点 E-VIEW-UNDECLARED-READ；成环 E-VIEW-DEPS-CYCLE；声明形状不对或同名重复 E-DIM-STRUCT-FIELD。
 * @param {ReadonlyArray<{node: string, own: ReadonlyArray<ReadonlyArray<string>>, uses: ReadonlyArray<string>}>} decls
 * @returns {ReadonlyMap<string, ReadonlyArray<ReadonlyArray<string>>>}
 */
export function closeInputs(decls) {
  if (!Array.isArray(decls)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'closeInputs: declarations must be an array');
  /** @type {Map<string, {node: string, own: ReadonlyArray<ReadonlyArray<string>>, uses: ReadonlyArray<string>}>} */
  const byNode = new Map();
  for (const d of decls) {
    const ok = d !== null && typeof d === 'object' && typeof d.node === 'string' && d.node.length > 0
      && Array.isArray(d.own) && d.own.every((p) => Array.isArray(p) && p.length > 0)
      && Array.isArray(d.uses) && d.uses.every((u) => typeof u === 'string');
    if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'closeInputs: a declaration must be {node: string, own: path[], uses: string[]}');
    if (byNode.has(d.node)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `closeInputs: node ${d.node} declared twice`);
    byNode.set(d.node, d);
  }
  /** @type {Map<string, ReadonlyArray<ReadonlyArray<string>>>} */
  const closed = new Map();
  /** @type {Set<string>} */
  const onPath = new Set();
  /** @param {string} name @returns {ReadonlyArray<ReadonlyArray<string>>} */
  const close = (name) => {
    const done = closed.get(name);
    if (done) return done;
    if (onPath.has(name)) throw new KernelError('E-VIEW-DEPS-CYCLE', {}, `closeInputs: ${[...onPath, name].join(' -> ')}`);
    onPath.add(name);
    const d = /** @type {{own: ReadonlyArray<ReadonlyArray<string>>, uses: ReadonlyArray<string>}} */ (byNode.get(name));
    /** @type {Map<string, ReadonlyArray<string>>} */
    const paths = new Map();
    const add = (/** @type {ReadonlyArray<string>} */ p) => { const k = JSON.stringify(p); if (!paths.has(k)) paths.set(k, Object.freeze([...p])); };
    d.own.forEach(add);
    for (const u of d.uses) {
      const target = resolveNode(byNode, u);
      if (target === undefined) throw undeclared(u);
      close(target).forEach(add);
    }
    onPath.delete(name);
    const out = Object.freeze([...paths.values()]);
    closed.set(name, out);
    return out;
  };
  for (const name of byNode.keys()) close(name);
  return closed;
}

/**
 * kernelApi `inputsOf(engine, node)`（卷二 :618；签名加 engine 见卷二勘误）：返回装配期算好的该节点依赖路径（冻结，同名每次同一对象）。
 * engine.inputs 不是 Map 即 E-DIM-STRUCT-FIELD；节点未声明 E-VIEW-UNDECLARED-READ。
 * @param {any} engine @param {string} node @returns {ReadonlyArray<ReadonlyArray<string>>}
 */
export function inputsOf(engine, node) {
  const table = engine !== null && typeof engine === 'object' ? engine.inputs : undefined;
  if (!(table instanceof Map)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'engine.inputs must be the Map built by closeInputs');
  const name = resolveNode(table, node);
  if (name === undefined) throw undeclared(node);
  return table.get(name);
}
