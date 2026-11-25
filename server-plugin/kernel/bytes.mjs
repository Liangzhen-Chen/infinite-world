// 字节与文字的编解码（卷二 §2.9 第 1 条"专用项" :1047：kernel 自带 base64 码表逐字节查表，不用 Buffer、atob、TextDecoder；卷二 :983 导入的存档文件是 base64 的字节）。
// 三个函数：base64ToBytes（严格：非法字符、填充不合、长度不合、末位带非零残位都拒）、utf8ToText（严格：过长编码、代理区、越界、截断、孤立续字节都拒）、
// utf8Length（按 UTF-16 码元数出 UTF-8 字节数，导入长度上限的计量，卷二 :946 单位是 byte）。拒收一律返回 null，由调用方定码。
// 数值常数只从规则表 kernelConstants 来（与 det-math 同法，卷二 S10；加载入口 installByteConstants 收下，本文件不写 0、1、-1 以外的数值字面量）。
// 不读墙钟、不用随机数。

import { KernelError } from './errors.mjs';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PAD = '=';
const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';
const INT_KEYS = Object.freeze(['byteRadix', 'base64Radix', 'base64GroupChars', 'utf8ContinuationBase', 'utf8PayloadRadix', 'unicodeMax', 'surrogateFirst', 'surrogateLast']);
const LIST_KEYS = Object.freeze(['utf8LeadBases', 'utf8MinCodePoint']);

/** @type {Readonly<Record<string, any>> | null} */
let C = null;

/**
 * 加载入口收下 rules.kernelConstants 里的字节常数（kernel 组内用，不在 kernelApi）。缺键或类型不对即 E-DIM-STRUCT-FIELD。
 * @param {Record<string, any>} c
 * @returns {void}
 */
export function installByteConstants(c) {
  const bad = (k) => new KernelError(CODE_STRUCT, {}, `rules.kernelConstants.${k} missing or not usable by kernel/bytes.mjs`);
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of INT_KEYS) { if (!Number.isInteger(c && c[k]) || c[k] < 1) throw bad(k); out[k] = c[k]; }
  for (const k of LIST_KEYS) { if (!Array.isArray(c && c[k]) || !c[k].every((v) => Number.isInteger(v) && v >= 1)) throw bad(k); out[k] = Object.freeze([...c[k]]); }
  // 码表长度就是 base64 的进制：两处不一致是登记错，启动即拒。
  if (ALPHABET[out.base64Radix - 1] === undefined || ALPHABET[out.base64Radix] !== undefined) throw bad('base64Radix');
  C = Object.freeze(out);
}

function k() {
  if (C === null) throw new Error('kernel/bytes.mjs: byte constants not installed (load order: installByteConstants)');
  return C;
}

/**
 * base64 文本 → 字节（整数数组）。字母表 A–Z a–z 0–9 + /，填充 `=` 只在末尾；字符数按组补齐；最后一组多出的位必须全零（规范编码，同字节同文本）。不合即 null。
 * @param {string} text
 * @returns {number[] | null}
 */
export function base64ToBytes(text) {
  if (typeof text !== 'string') return null;
  const c = k();
  let end = text.length;
  while (end > 0 && PAD.indexOf(text[end - 1]) >= 0) end -= 1;
  const pads = text.length - end;
  const chars = end;
  const rest = chars % c.base64GroupChars;
  if (rest === 1 || pads !== (rest === 0 ? 0 : c.base64GroupChars - rest)) return null;
  const radix = c.base64Radix;
  const bytes = [];
  let acc = 0;
  let scale = 1;
  for (let i = 0; i < chars; i++) {
    const v = ALPHABET.indexOf(text[i]);
    if (v < 0) return null;
    acc = acc * radix + v;
    scale *= radix;
    while (scale >= c.byteRadix) {
      scale /= c.byteRadix;
      bytes.push(Math.floor(acc / scale));
      acc %= scale;
    }
  }
  return acc === 0 ? bytes : null;
}

/**
 * UTF-8 字节 → 文字，严格：最短编码、不含代理区码点、不超 U+10FFFF、续字节齐全、无孤立续字节；不合即 null。
 * @param {number[]} bytes
 * @returns {string | null}
 */
export function utf8ToText(bytes) {
  const c = k();
  const leads = c.utf8LeadBases;
  let out = '';
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    if (b < c.utf8ContinuationBase) { out += String.fromCodePoint(b); i += 1; continue; }
    let n = 0;
    for (let j = 1; j < leads.length; j++) if (b >= leads[j - 1] && b < leads[j]) n = j;
    if (n === 0) return null;
    let cp = b - leads[n - 1];
    for (let j = 1; j <= n; j++) {
      const x = bytes[i + j];
      if (x === undefined || x < c.utf8ContinuationBase || x >= leads[0]) return null;
      cp = cp * c.utf8PayloadRadix + (x - c.utf8ContinuationBase);
    }
    if (cp < c.utf8MinCodePoint[n - 1] || cp > c.unicodeMax || (cp >= c.surrogateFirst && cp <= c.surrogateLast)) return null;
    out += String.fromCodePoint(cp);
    i += n + 1;
  }
  return out;
}

/**
 * 一个字串编成 UTF-8 的字节数（按 UTF-16 码元累加：1 字节、2 字节、3 字节三档，代理对每个码元记 2，两个码元共 4 字节，与 UTF-8 一致；孤立代理按同一档，只会多算）。
 * @param {string} s
 * @returns {number}
 */
export function utf8Length(s) {
  const c = k();
  const [oneMax, twoMax] = c.utf8MinCodePoint;
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const u = s.charCodeAt(i);
    const surrogate = u >= c.surrogateFirst && u <= c.surrogateLast;
    total += 1 + Number(u >= oneMax) + Number(u >= twoMax && !surrogate);
  }
  return total;
}
