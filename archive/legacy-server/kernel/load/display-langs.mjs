// 显示语言名单加载器（卷二 §2.9 第 1 条入口表 :1075 `kernel/load/display-langs.mjs`；kernelApi `displayLangs`，卷二 :639；卷二十九 §2.2 语言登记行）。
// 只读 world/i18n/locales.json 的各行 `id`（显示语言代号 DisplayLang：代号格式、不带族前缀），不读该文件其他列，也不读语言包里任何含文字的文件；
// 不产出 Text、不进任何摘要。返回按文件行序的冻结名单。文件缺失、不是数组、没有任何一行、行没有合格的 id、id 重复都拒（E-I18N-LOCALE）：
// 没有显示语言就没有屏蔽词表与语言包可加载，不静默给缺省语言。

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KernelError } from '../errors.mjs';
import { CODE_RE } from '../handles/vocab-handle.mjs';

const LOCALES_FILE = 'world/i18n/locales.json';
const CODE = 'E-I18N-LOCALE';

/**
 * 读 locales.json 的各行 id（kernel 组内；对外出口是 kernel/handles/display-lang.mjs 的 displayLangs）。
 * @param {string} root 仓库根
 * @returns {readonly string[]}
 */
export function readDisplayLangIds(root) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(root, LOCALES_FILE), 'utf8')); } catch { throw new KernelError(CODE, {}, `${LOCALES_FILE}: missing or not JSON`); }
  if (!Array.isArray(rows) || rows.length === 0) throw new KernelError(CODE, {}, `${LOCALES_FILE}: want a non-empty list of rows`);
  const ids = rows.map((r, i) => {
    const id = r !== null && typeof r === 'object' ? r.id : undefined;
    if (typeof id !== 'string' || !CODE_RE.test(id)) throw new KernelError(CODE, {}, `${LOCALES_FILE}[${i}].id: want a DisplayLang code`);
    return id;
  });
  if (new Set(ids).size !== ids.length) throw new KernelError(CODE, {}, `${LOCALES_FILE}: duplicate id`);
  return Object.freeze(ids);
}
