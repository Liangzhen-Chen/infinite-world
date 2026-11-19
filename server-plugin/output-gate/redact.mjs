// 显示闸的替换裁决（卷二 §2.9 第 6 条"screen 与替换后的复核"；§2.8 outputGate 行：redact.mjs 按 [origStart, origEnd] 取段，取段只经 textcore sliceByCodePoints，拼接只经 concatText；
// 卷二十九 R29-7.6；体检 K6-82，6-17 改一轮）。
// 一个文字字段：screen 零命中即 pass；有命中则把每段命中（原文坐标）换成替换记号，再 screen 复核，通过为 replace；复核仍命中则这个字段整个改用替换记号，为 block。
// 一次输出至多判两次，不循环；返回的 Screened 一定出自 gate/screen.mjs。替换记号自己必须零命中，否则加载即失败（E-I18N-REDACT-HIT）。

import { screen } from '../gate/screen.mjs';
import { concatText, sliceByCodePoints } from '../textcore/ops.mjs';
import { VERDICT, fail } from './enums.mjs';

/**
 * @param {object} mark 替换记号（labels 里 uitok_redacted 的当前语言形态，Text）
 * @param {string} lang 显示语言代号
 * @returns {(text: object) => {screened: object, verdict: string}}
 */
export function createRedactor(mark, lang) {
  const markScreen = screen(mark, lang);
  if (markScreen.screened === undefined) fail('E_I18N_REDACT_HIT', 'redaction mark hits the blocklist');
  return (text) => {
    const first = screen(text, lang);
    if (first.screened !== undefined) return { screened: first.screened, verdict: VERDICT.pass };
    const parts = [];
    let at = 0;
    for (const h of first.hits) {
      parts.push(sliceByCodePoints(text, at, h.origStart), mark);
      at = h.origEnd;
    }
    parts.push(sliceByCodePoints(text, at));
    const second = screen(concatText(...parts), lang);
    if (second.screened !== undefined) return { screened: second.screened, verdict: VERDICT.replace };
    return { screened: markScreen.screened, verdict: VERDICT.block };
  };
}
