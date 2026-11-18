// RX 表达式词法与返回形状的正则叶子（卷二 §2.8 表 kernel 行 :852，封卷后勘误 1118k17；S13 (b)）。
// 本文件是 handles 叶子：只放从 rx.mjs 搬来的正则与按正则取段的具名函数，不 import 任何其他 kernel 文件（避免 import 环）。
// 其余格式正则按用途就近放在 S13 (b) 允许的已有文件里：代号/键/路径格式在 handles/keys.mjs，
// 类型与错误码文法在 validate/types.mjs，required 策略分隔在 validate/rows.mjs，JSON 文本与标量在 load/vocab-load.mjs。

// ---------- RX 表达式与返回形状（rx） ----------

// RX 词法：数字、名字（可带点分下标）、运算符；粘性匹配从 at 起。
const RX_TOKEN = /\s*(?:(\d+(?:\.\d+)?)|([a-z][A-Za-z0-9_]*(?:\.[A-Za-z0-9_]+)*)|(==|!=|<=|>=|&&|\|\||[-+*/%<>()!,]))/y;
/** @param {string} text @param {number} at @returns {{groups: (string | undefined)[], end: number} | null} */
export function rxTokenAt(text, at) {
  RX_TOKEN.lastIndex = at;
  const m = RX_TOKEN.exec(text);
  if (!m) return null;
  const [, numTok, nameTok, opTok] = m;
  return { groups: [numTok, nameTok, opTok], end: RX_TOKEN.lastIndex };
}

// 返回形状里每个 `<…>` 占位是一段 arg。
const SHAPE_ARG = /<[^<>]+>/g;
/** @param {string} shape @returns {number} */
export const shapeArgCount = (shape) => (shape.match(SHAPE_ARG) || []).length;

// 返回形状里写明"（set，只作 member 的 set）"的字段名：`<字段>（set，只作 member 的 set）`。
const SET_FIELD = /([A-Za-z_][\w]*)（set，只作 member 的 set）/g;
/** @param {string} shape @returns {string[]} */
export const setFieldNames = (shape) => [...String(shape).matchAll(SET_FIELD)].map((m) => m[1]);
