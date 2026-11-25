// brand：RawText → Text（卷二 §2.9 第 2 条 textcore 行"brand.mjs 只做 RawText → Text"；groupApi callers textcore、gate、aiGate）。
// 运行期的 RawText 就是字串（来自文件或模型返回体），本函数是它变成 Text 的唯一门。brandTurn、brandQuote 随 inputEdge、aiGate 卡。

import { makeText } from './text-types.mjs';

/**
 * @param {string} raw
 * @returns {object} Text
 */
export function brand(raw) {
  if (typeof raw !== 'string') throw new TypeError('brand: RawText must be a string');
  return makeText(raw);
}
