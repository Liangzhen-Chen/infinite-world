// release：Screened<Text> → 字串（卷二 §2.9 第 2 条；groupApi callerFiles output-gate/envelope-exit.mjs、ai-gate/prompt.mjs）。
// 出口只认 gate/screen.mjs 产出的 Screened；任何别的东西（裸字串、Text、伪造对象）都是 E-TEXT-EXIT（卷二 :969 同条违例码，卷二 S19 :2438）。

import { screenedText, textValue } from './text-types.mjs';
import { fail } from './fail.mjs';

/**
 * @param {unknown} screened
 * @returns {string}
 */
export function release(screened) {
  const t = screenedText(screened);
  if (t === undefined) return fail('E_TEXT_EXIT', 'release: not a Screened<Text>');
  return textValue(t);
}
