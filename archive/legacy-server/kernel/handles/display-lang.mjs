// 显示语言代号 DisplayLang 的出口（卷二 :639 kernelApi `kernel/handles/display-lang.mjs#displayLangs`，callers textcore、gate、outputGate、aiGate；:1075 入口表）。
// 名单由 kernel/load/display-langs.mjs 读 world/i18n/locales.json 的各行 id；本文件把它交出成冻结名单，不产出 Text。

import { readDisplayLangIds } from '../load/display-langs.mjs';

/**
 * kernelApi `displayLangs(root)`：显示语言代号的冻结名单（按 locales.json 行序）。
 * @param {string} root 仓库根
 * @returns {readonly string[]}
 */
export function displayLangs(root) {
  return readDisplayLangIds(root);
}
