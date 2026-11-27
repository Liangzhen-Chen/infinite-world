// 原语写者登记（S2-L 草案 §3 R0）：规则层登记效果原语的处理函数，内核 kernel/transaction.mjs resolve 在内置 HANDLERS 查不到时回落查 engine.primitiveWriters。
// 写法与建档实例化、终止清理同一条路：登记项由声明它的模块导出、在本域 manifest 收齐，装配层（rules/load/mount.mjs）按 state-owners
// systems.<名>.primitiveWriter {ops, handler} 认函数装成 op → 函数 的表。换原语写者的装配只改本文件。
import { KernelError } from '../../kernel/errors.mjs';
import { handlesOp } from '../../kernel/transaction.mjs';
import { handlerEntry } from '../lifecycle/terminate.mjs';

// state-owners systems.<名> 下原语写者的登记字段（草案 §3）。
const WRITER_FIELD = 'primitiveWriter';

/**
 * 原语写者的登记项（与 registerInstantiator 同形）：返回冻结的 {handlerRef, handler}；handler 形状同内核 HANDLERS：
 * (engine, state, effect, ctx) → {write?: (tx) => void, advanceMinutes?: number}。
 * @param {string} handlerRef "<文件>#<函数>" @param {Function} handler @returns {Readonly<{handlerRef: string, handler: Function}>}
 */
export function registerPrimitiveWriter(handlerRef, handler) {
  return handlerEntry(handlerRef, handler);
}

/**
 * 装原语写者表（加载期一次）：按系统名序读 owners.systems.*.primitiveWriter {ops, handler}，按 handlerRef 在登记项 entries 里认函数，
 * 对不上即 E-DIM-REF-MISSING；登记形状不合即 E-DIM-STRUCT-FIELD；同一 op 被两处登记、或撞上内核已有的处理函数（handlesOp），即 E-DIM-DUPLICATE-KEY。
 * @param {unknown} owners 合并后的 state-owners @param {ReadonlyArray<unknown>} entries 各域 manifest 收齐的登记项
 * @returns {ReadonlyMap<string, Function>}
 */
export function assemblePrimitiveWriters(owners, entries) {
  const systems = Object(Object(owners).systems);
  /** @type {Map<string, Function>} */
  const out = new Map();
  for (const name of Object.keys(systems).sort()) {
    const w = Object(systems[name])[WRITER_FIELD];
    if (w === undefined) continue;
    const ok = Array.isArray(w.ops) && w.ops.length > 0 && w.ops.every((/** @type {unknown} */ op) => typeof op === 'string' && op.length > 0) && typeof w.handler === 'string';
    if (!ok) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `systems.${name}.${WRITER_FIELD} needs non-empty ops and a handler`);
    const hit = entries.find((e) => Object(e).handlerRef === w.handler);
    const fn = Object(hit).handler;
    if (typeof fn !== 'function') throw new KernelError('E-DIM-REF-MISSING', {}, `${WRITER_FIELD} ${w.handler} (systems.${name}): no handler registered`);
    for (const op of w.ops) {
      if (handlesOp(op) || out.has(op)) throw new KernelError('E-DIM-DUPLICATE-KEY', {}, `${WRITER_FIELD} op ${op} (systems.${name}): already has a handler`);
      out.set(op, fn);
    }
  }
  return out;
}
