// kernelApi `reportError`（卷二 §2.7 kernelApi :631；§2.9 第 1 条"catch 变量"：catch、Promise.catch、finally 里的错误值是 unknown，
// 只能原样传给本函数，不得被收窄）与内核拒写错误 KernelError（§2.6"事务内拒写的处置"：被拒的错误码上抛到 kernel/transaction.mjs）。
// 规整后一律走 kernel/report.mjs 的 report(code, fields)（§2.9 第 1 条 report.mjs 行："reportError 规整后也走这里"）。
// 只按错误码登记表判，不认任何具体错误码；不收 E-MIG-*（块 2 体检 K2-49，登记表本来就不含）。

import { errorCodeOf } from './handles/vocab-handle.mjs';
import { REGISTERED_CODES } from './error-codes.mjs';
import { report, checkFields } from './report.mjs';

/**
 * 内核运行期拒写与拒收：带登记码与只含代号、数值的字段（事务处置第 2 件"记日志"用）。
 * 抛它的地方：writePath 的写者、类型、终止核对（§2.6 第 3 条），事务入口，以及日后各运行期核对（2-5 的非有限值拒写同此）。
 */
export class KernelError extends Error {
  /**
   * @param {string} code 登记表里的码（构造时核对，不在表内即 E-DIM-REF-MISSING）
   * @param {Record<string, null | boolean | number | string>} [fields] 只含代号与数值（report 同一核对）
   * @param {string} [detail] 给开发者的说明（不进日志，不进 state）
   */
  constructor(code, fields = {}, detail = '') {
    const c = errorCodeOf(code);
    super(detail ? `${c} ${detail}` : c);
    this.code = c;
    this.fields = Object.freeze({ ...checkFields(fields) });
  }
}

/**
 * 错误规整：带登记码的错误（KernelError、HandleError 及其他带 `code` 字段的错误）规整成 report(code, fields)，返回所报的码；
 * 没有登记码的错误原样抛回——错误码登记表里没有"未分类错误"一类的通用码，本函数不自造码（交李白裁定前不吞错）。
 * @param {unknown} e
 * @returns {import('./types.d.ts').ErrorCode}
 */
export function reportError(e) {
  const code = codeOf(e);
  if (code === null) throw e;
  const raw = e !== null && typeof e === 'object' && 'fields' in e ? e.fields : undefined;
  let fields = {};
  try { fields = raw === undefined ? {} : checkFields(raw); } catch { fields = {}; }
  report(code, fields);
  return code;
}

/**
 * 错误值上的登记码；不是对象、没有 code、code 不在登记表内都返回 null。
 * @param {unknown} e
 * @returns {import('./types.d.ts').ErrorCode | null}
 */
export function codeOf(e) {
  if (e === null || typeof e !== 'object' || !('code' in e)) return null;
  const c = e.code;
  return typeof c === 'string' && REGISTERED_CODES.has(c) ? errorCodeOf(c) : null;
}
