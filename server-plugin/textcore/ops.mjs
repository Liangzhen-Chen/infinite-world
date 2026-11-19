// 文字运算（卷二 §2.8 textcore 行"从字串运算产出 Text 只许在 ops.mjs 一个文件里"；groupApi :667–:673）。
// 6-17 改一轮只建 outputGate 与 gate 当下用到的五个：concatText、nfc、mapCodePoints、sliceByCodePoints、intDigits；
// trimByTable、menuIndexKeys 随 inputEdge 卡。输入必须全是 Text 或冻结表，不提供查找与比较。

import { makeText, textValue } from './text-types.mjs';
import { fail } from './fail.mjs';

// 十进制位表（卷二 :876 intDigits"按同一十进制位表构造"；kernelApi codepointTables 未建，暂列在此，表长即进制，代码里没有数字字面量）。
const DIGIT_TABLE = Object.freeze(Array.from('0123456789'));
const need = (t) => { const s = textValue(t); if (s === undefined) throw new TypeError('ops: Text required'); return s; };

/**
 * 拼接。
 * @param {...object} parts Text
 * @returns {object} Text
 */
export function concatText(...parts) {
  let out = '';
  for (const p of parts) out += need(p);
  return makeText(out);
}

/**
 * NFC。
 * @param {object} text Text
 * @returns {object} Text
 */
export function nfc(text) {
  return makeText(need(text).normalize('NFC'));
}

/**
 * 按冻结码点表逐码点映射：表里有的码点换成表给的码点列表，没有的原样。
 * @param {object} text Text
 * @param {ReadonlyMap<number, readonly number[]>} table
 * @returns {object} Text
 */
export function mapCodePoints(text, table) {
  let out = '';
  for (const ch of need(text)) {
    const cp = ch.codePointAt(0);
    out += table.has(cp) ? String.fromCodePoint(...table.get(cp)) : ch;
  }
  return makeText(out);
}

/**
 * 按码点取段 [start, end)，end 省略取到末尾；只对 output-gate/redact.mjs 开放（groupApi callerFiles）。
 * @param {object} text Text
 * @param {number} start 非负整数码点序
 * @param {number} [end]
 * @returns {object} Text
 */
export function sliceByCodePoints(text, start, end) {
  if (!Number.isInteger(start) || start < 0 || (end !== undefined && (!Number.isInteger(end) || end < start))) throw new TypeError('sliceByCodePoints: bad range');
  const cps = Array.from(need(text));
  return makeText(cps.slice(start, end).join(''));
}

/**
 * 非负整数成十进制数字文字，不足 minWidth 位前面补零；负号由模板给，不进本函数；只对 output-gate/templates.mjs 开放。
 * @param {number} n 非负安全整数
 * @param {number} minWidth 非负整数，0 即不补
 * @returns {object} Text
 */
export function intDigits(n, minWidth) {
  if (!Number.isSafeInteger(n) || n < 0 || !Number.isInteger(minWidth) || minWidth < 0) return fail('E_TPL_KEY', 'intDigits: non-negative integer required');
  const base = DIGIT_TABLE.length;
  let rest = n;
  let digits = '';
  do {
    digits = DIGIT_TABLE[rest % base] + digits;
    rest = Math.floor(rest / base);
  } while (rest > 0);
  while (digits.length < minWidth) digits = DIGIT_TABLE[0] + digits;
  return makeText(digits);
}
