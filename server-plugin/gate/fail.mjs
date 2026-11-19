// gate 组内抛带登记码的错：码取 kernelApi E（卷二 §2.7 :625，callers *）。同 textcore/fail.mjs，组内各一份，不跨组 import。

import { E } from '../kernel/handles/generated.mjs';

/**
 * @param {string} member E 的成员名（如 E_I18N_LOCALE）
 * @param {string} [detail]
 * @returns {never}
 */
export function fail(member, detail = '') {
  const code = E[member];
  const e = new Error(`${code} ${detail}`);
  Object.assign(e, { code, fields: {} });
  throw e;
}
