// 查显示名（S1-4 草案 §3.2；主会话裁定 Q1 甲，过渡做法）：经静态路由读 locales.json，取 order 最小的显示语言，再读该语言的 labels 文件。
// 显示名回落只在本文件 labelOf 一处（卷二十九 R29-1.6）：有该形态用该形态 → 没有用 label → 条目也没有即显示代号本身，并标「未译」。
// 语言包读不到（白名单拔掉、404、坏 JSON）时，所有地方显示代号，照样能玩（卷二十九 总则 2）。
// 过渡：客户端直读语言包违背卷二十九:225（读文字的只有 textcore/labels.mjs），S2-U1 建信封后本文件的 labelOf 换成开信封的出口。

/** @typedef {{getJson: (path: string) => Promise<unknown>}} JsonNet */
/** @typedef {{locales: string, labels: Record<string, string>}} I18nPaths layout.json 的 i18n 行：语言表与各显示语言的 labels 文件（路径在数据里，代码不拼） */
/** @typedef {{text: string, translated: boolean}} Shown 查名结果：translated 为假即回落到了代号 */
/** @typedef {{labelOf: (code: string, form?: string) => Shown}} Labels */

const LABEL = 'label';

/**
 * 读语言包；任一步读不到即空表（全部回落到代号）。
 * @param {JsonNet} net @param {I18nPaths} paths @returns {Promise<Labels>}
 */
export async function loadLabels(net, paths) {
  /** @type {Record<string, Record<string, string>>} */
  let table = {};
  try {
    const locales = /** @type {Array<{id: string, order: number}>} */ (await net.getJson(paths.locales));
    const lang = [...locales].sort((a, b) => a.order - b.order)[0];
    if (lang !== undefined && Object.hasOwn(paths.labels, lang.id)) table = /** @type {Record<string, Record<string, string>>} */ (await net.getJson(paths.labels[lang.id]));
  } catch {
    table = {};
  }
  return {
    labelOf(code, form = LABEL) {
      const row = Object.hasOwn(table, code) ? table[code] : undefined;
      if (row !== undefined && typeof row[form] === 'string') return { text: row[form], translated: true };
      if (row !== undefined && typeof row[LABEL] === 'string') return { text: row[LABEL], translated: true };
      return { text: code, translated: false };
    },
  };
}
