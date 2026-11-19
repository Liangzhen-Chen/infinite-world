// textcore 组内抛带登记码的错：码取 kernelApi E（卷二 §2.7 :625，callers *），错误值带 code 与 fields，kernelApi reportError 照常规整。
// kernel 的 KernelError 不在 kernelApi 里，textcore 不 import 它（卷二 §2.7 矩阵"只经 kernelApi"）。

import { E } from '../kernel/handles/generated.mjs';

/**
 * @param {string} member E 的成员名（错误码把连字符换成下划线，如 E_I18N_LABEL_MISSING）
 * @param {string} [detail]
 * @returns {never}
 */
export function fail(member, detail = '') {
  const code = E[member];
  const e = new Error(`${code} ${detail}`);
  Object.assign(e, { code, fields: {} });
  throw e;
}
