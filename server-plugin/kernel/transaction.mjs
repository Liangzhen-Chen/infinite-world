// 事务模块的最小写入层（S1-1 卡 A；卷二 §2.7 :541 拒写处置、:545 唯一事务裸写者）。
// 本文件是内核里唯一对状态做裸写（赋值、删除）与持有撤销记录的地方；存储模块的全部写入经 txSet / txDelete。
// 作用域不放模块级登记（会触发 c_module_state）：writeScope 把作用域对象 tx 作为参数传给 fn，写函数显式收 tx。
// 完整事务（runTransaction、submitProposal、时间推进、存档）是卡 B，不在这里。

import { KernelError } from './errors.mjs';
import { invalidateTop } from './memo.mjs';

/** @typedef {{state: any, open: boolean, undo: Array<{obj: any, key: string, had: boolean, old: any}>, touched: any[]}} WriteScope */

/**
 * 开写入作用域执行 fn(tx) 并返回结果；fn 抛错时按撤销记录逆序撤回本作用域全部写入（整笔撤销，卷二 :541 第 1 点），再原样抛出。
 * 撤销后作废本作用域碰过的顶层键缓存。作用域结束后 tx 失效。
 * 不做嵌套检测（不放模块级登记）：fn 内要继续写就用传入的 tx，不要再对同一 state 开新作用域。
 * @template T
 * @param {any} state
 * @param {(tx: WriteScope) => T} fn
 * @returns {T}
 */
export function writeScope(state, fn) {
  if (state === null || typeof state !== 'object' || Array.isArray(state)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'state must be a plain object');
  if (typeof fn !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'writeScope needs a function');
  /** @type {WriteScope} */
  const tx = { state, open: true, undo: [], touched: [] };
  try {
    return fn(tx);
  } catch (e) {
    for (let i = tx.undo.length - 1; i >= 0; i--) {
      const u = tx.undo[i];
      if (u.had) u.obj[u.key] = u.old;
      else delete u.obj[u.key];
    }
    for (const top of tx.touched) invalidateTop(state, top);
    throw e;
  } finally {
    tx.open = false;
  }
}

/** 核对 tx 是该 state 的、仍开着的写入作用域；否则抛。 @param {any} state @param {any} tx @returns {WriteScope} */
export function requireScope(state, tx) {
  if (tx === null || typeof tx !== 'object' || tx.open !== true || tx.state !== state || !Array.isArray(tx.undo)) {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'write outside an open write scope of this state');
  }
  return tx;
}

/** 写 obj[key] = value，先记撤销。 @param {any} tx @param {any} obj @param {string} key @param {any} value @returns {void} */
export function txSet(tx, obj, key, value) {
  requireScope(tx && tx.state, tx);
  tx.undo.push({ obj, key, had: Object.hasOwn(obj, key), old: obj[key] });
  obj[key] = value;
}

/** 删 obj[key]，先记撤销。 @param {any} tx @param {any} obj @param {string} key @returns {void} */
export function txDelete(tx, obj, key) {
  requireScope(tx && tx.state, tx);
  tx.undo.push({ obj, key, had: Object.hasOwn(obj, key), old: obj[key] });
  delete obj[key];
}

/** 写完作废该顶层键缓存，并记下它：撤销时再作废一次。 @param {any} tx @param {any} topKey @returns {void} */
export function txTouch(tx, topKey) {
  const scope = requireScope(tx && tx.state, tx);
  scope.touched.push(topKey);
  invalidateTop(scope.state, topKey);
}
