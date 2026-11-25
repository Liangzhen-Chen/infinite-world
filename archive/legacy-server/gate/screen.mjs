// 显示闸的 screen（卷二 §2.9 第 6 条"screen 与替换后的复核"；groupApi gate/screen.mjs#screen callers outputGate、aiGate；S19 :2438"screen 之外产出 Screened<Text> = 0"）。
// screen(text, lang)：调 matchBlocklist；零命中才产出 Screened<Text>（经 textcore/text-types.mjs 的 makeScreened，全仓库只有本文件调它），否则返回命中列表，
// 替换裁决与复核由 outputGate 的 redact.mjs 做。

import { makeScreened } from '../textcore/text-types.mjs';
import { matchBlocklist } from './matcher.mjs';

/**
 * @param {object} text Text
 * @param {string} lang 显示语言代号
 * @returns {{screened: object} | {hits: Array<{start: number, end: number, origStart: number, origEnd: number, categories: string[]}>}}
 */
export function screen(text, lang) {
  const hits = matchBlocklist(text, lang);
  return hits.length === 0 ? { screened: makeScreened(text) } : { hits };
}
