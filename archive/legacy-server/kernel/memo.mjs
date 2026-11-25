// kernelApi `stateMemo`（卷二 §2.7 kernelApi :573，调用者 ["rules"]，acceptsState: true；§2.2 :448"modified 的 memo inputs 含 day"）。
// 从 old-final-1117 server-plugin/storage.mjs:271 改写搬入（体检 K2-01）：不搬 records 索引一族与 withRecordIndex 开关（K2-39），
// 不搬"依赖路径选择器"与按 PatchCursor 携带缓存（旧实现）。新底子的作废口径只有一条：这份 state 经 kernel 写入一次，按它算的缓存全部作废
// （kernel/storage.mjs 每次写入、kernel/transaction.mjs 每次回滚都调 invalidateMemo），所以缓存命中与重算恒得同一结果。
// `inputsOf`（:574）由块 2 第 2-5 张建（主会话定归属）：依赖闭包在 kernel/declare.mjs 加载期定稿，这里只按名取。

import { closureOf } from './declare.mjs';

/**
 * kernelApi `inputsOf(node)`（§2.3 :471、§2.7 :574，acceptsState: false）：节点的最终依赖数组，加载期算一次、冻结，每次返回同一对象。
 * 未声明的节点 E-DIM-REF-MISSING。
 * @param {string} node
 * @returns {readonly string[]}
 */
export function inputsOf(node) {
  return closureOf(node);
}

/** @type {WeakMap<object, Map<string, Map<unknown, any>>>} */
let memos = new WeakMap();
const VALUE = Symbol('memo value');

/**
 * 按 (state, scope, inputs) 缓存 build() 的结果。state 不是对象时不缓存，直接 build()。
 * inputs 逐项按 Map 键（SameValueZero）比较，应是代号或数值（例如 day、实体 id）；同一 scope 下 inputs 个数应固定。
 * 返回的是缓存里的同一个值，调用者不得改它。
 * @template T
 * @param {any} state
 * @param {string} scope 调用方登记的缓存名（同一 state 下不同用途互不相混）
 * @param {ReadonlyArray<unknown>} inputs
 * @param {() => T} build
 * @returns {T}
 */
export function stateMemo(state, scope, inputs, build) {
  if (state === null || typeof state !== 'object') return build();
  let scopes = memos.get(state);
  if (!scopes) memos.set(state, (scopes = new Map()));
  let node = scopes.get(scope);
  if (!node) scopes.set(scope, (node = new Map()));
  for (const input of inputs) {
    let next = node.get(input);
    if (!next) node.set(input, (next = new Map()));
    node = next;
  }
  if (!node.has(VALUE)) node.set(VALUE, build());
  return node.get(VALUE);
}

/**
 * 作废这份 state 上的全部缓存（kernel 组内用：storage 写入与事务回滚时调；不在 kernelApi）。
 * @param {any} state
 * @returns {void}
 */
export function invalidateMemo(state) {
  if (state !== null && typeof state === 'object') memos.delete(state);
}

/** 测试与重新挂接用：清空全部缓存（kernel 组内用）。 */
export function resetMemos() {
  memos = new WeakMap();
}
