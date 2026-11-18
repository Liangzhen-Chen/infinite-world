// 词表代号与错误码的构造函数（卷二 §2.9 第 2 条强转豁免文件表 `kernel/handles/vocab-handle.mjs` 行：
// string → Handle<F>、ErrorCode，强转前"按代号正则校验并在词表或错误码登记表内"）。
// 只按登记数据判，不认任何具体族、代号或错误码。

/** @typedef {import('../types.d.ts').ErrorCode} ErrorCode */

import { CODE_RE, isErrorCode } from '../validate/types.mjs';
import { REGISTERED_CODES } from '../error-codes.mjs';

// 代号文法（§1.9 :278）：实体 id、类别 id、枚举值；定义在 validate/types.mjs，这里转出给 entity-id、keys 沿用。
export { CODE_RE };

/** 构造函数拒收时抛出；`code` 是卷二 §4.3 登记的码。 */
export class HandleError extends Error {
  /** @param {string} code @param {string} message */
  constructor(code, message) {
    super(`${code} ${message}`);
    this.code = code;
  }
}

/**
 * string → Handle<F>：代号合文法、在词表索引内、属于族 F。
 * 不合文法 E-DIM-ID-FORMAT；不在词表 E-DIM-REF-MISSING（§1.9 :278、§4.1 L2）；在词表但属别族 E-VIEW-FAMILY-MISMATCH（§7 S13 (a)）。
 * @template {string} F
 * @param {Map<string, {family: string}>} index loadVocab 的 index（代号 → {family, …}）
 * @param {F} family
 * @param {string} id
 * @returns {import('../types.d.ts').Handle<F>}
 */
export function handleOf(index, family, id) {
  if (typeof id !== 'string' || !CODE_RE.test(id)) throw new HandleError('E-DIM-ID-FORMAT', `vocab code ${JSON.stringify(id)}: want ^[a-z][a-z0-9_]{1,47}$`);
  const rec = index.get(id);
  if (!rec) throw new HandleError('E-DIM-REF-MISSING', `vocab code ${id}: not registered in _vocab.json`);
  if (rec.family !== family) throw new HandleError('E-VIEW-FAMILY-MISMATCH', `vocab code ${id}: family ${rec.family}, want ${family}`);
  return /** @type {import('../types.d.ts').Handle<F>} */ (id);
}

/**
 * string → ErrorCode：码合 §4.2 文法、在错误码登记表（kernel/error-codes.mjs）内。
 * 不合文法 E-DIM-ID-FORMAT；未登记 E-DIM-REF-MISSING。
 * @param {string} code
 * @param {ReadonlySet<string>} [registered] 默认读错误码登记表
 * @returns {ErrorCode}
 */
export function errorCodeOf(code, registered = REGISTERED_CODES) {
  if (!isErrorCode(code)) throw new HandleError('E-DIM-ID-FORMAT', `error code ${JSON.stringify(code)}: want E-<area>-<name> / W-...`);
  if (!registered.has(code)) throw new HandleError('E-DIM-REF-MISSING', `error code ${code}: not in error code registry`);
  return /** @type {ErrorCode} */ (code);
}

/**
 * 错误码 → `E` 句柄成员名（§4.2"句柄的标识符映射"）：每个连字符换成下划线。
 * @param {ErrorCode} code
 * @returns {string}
 */
export function errorMemberName(code) {
  return code.split('-').join('_');
}
