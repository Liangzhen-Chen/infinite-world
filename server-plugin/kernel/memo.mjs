// kernelApi `stateMemo` 与切片失活 `invalidateTop`（卷二 §2.7 kernelApi :509、:573；docs/gemini/kickoff-1125.md:64、:91）。
// 本文件是内核里唯一声明顶层 WeakMap/Map 的模块（L-09 ③）。缓存分片按状态顶层键：每个缓存格记下它依赖的各顶层键的代号快照，
// 命中时比快照；内核写状态时只对该顶层键调 invalidateTop，代号 +1，其余顶层键下的格照旧命中。
// 不读墙钟、不用随机数；只按参数与 state 的顶层键代号判，不认任何具体顶层键名。

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
