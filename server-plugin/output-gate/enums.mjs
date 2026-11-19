// outputGate 用到的代码内封闭枚举与抛错入口（6-17 改二轮）。
// 枚举定义只在 kernel/handles/markers.mjs 的 CODE_ENUMS 一处（label_form、tpl_kind、fill_kind 取卷二十九 §2.1 :124–:153，gate_verdict、reply_result 取卷二 §1.9 :288，
// segment_kind 取卷九 :147）；本文件经 kernelApi `kernel/handles/markers.mjs#T`（callerFiles 只本文件）引用，别的 outputGate 文件从本文件取，不各自 import T。
// 抛错：码取 kernelApi E（卷二 :625，callers *），错误值带 code 与 fields，kernelApi reportError 照常规整。

import { T } from '../kernel/handles/markers.mjs';
import { E } from '../kernel/handles/generated.mjs';

export const FORM = T.code_enum.label_form;
export const KIND = T.code_enum.tpl_kind;
export const FILL = T.code_enum.fill_kind;
export const VERDICT = T.code_enum.gate_verdict;
export const RESULT = T.code_enum.reply_result;
export const SEGMENT = T.code_enum.segment_kind;

/**
 * @param {string} member E 的成员名（如 E_TPL_KEY）
 * @param {string} [detail]
 * @returns {never}
 */
export function fail(member, detail = '') {
  const code = E[member];
  const e = new Error(`${code} ${detail}`);
  Object.assign(e, { code, fields: {} });
  throw e;
}
