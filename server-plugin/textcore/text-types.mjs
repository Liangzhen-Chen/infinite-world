// 文字类型的运行期载体（卷二 §2.9 第 2 条类型登记表 Text、Screened<Text>；§2.8 textcore 行；体检 K6-82，6-17 改一轮）。
// 编译期品牌在 JS 里没有对应物，这里用模块私有的 WeakMap 登记：只有本文件的构造函数能造出被登记的对象，
// 所以 Text 只来自 brand/ops/labels，Screened 只来自 gate/screen.mjs 调 makeScreened，没有第二个产出者；
// 取底层字串的 textValue 只开给 gate/matcher.mjs（做命中查找）与 textcore 内部，release 只开给 envelope-exit 与 prompt。
// 本文件不做任何文字运算。

const TEXTS = new WeakMap();
const SCREENEDS = new WeakMap();

/**
 * textcore 内部：由字串造 Text（只给 brand.mjs、ops.mjs、labels.mjs）。
 * @param {string} s
 * @returns {object}
 */
export function makeText(s) {
  if (typeof s !== 'string') throw new TypeError('makeText: string required');
  const t = Object.freeze({});
  TEXTS.set(t, s);
  return t;
}

/**
 * 取 Text 的底层字串；不是 Text 返回 undefined。
 * @param {unknown} t
 * @returns {string | undefined}
 */
export function textValue(t) {
  return t !== null && typeof t === 'object' ? TEXTS.get(t) : undefined;
}

/**
 * 只给 gate/screen.mjs：把一个零命中的 Text 变成 Screened<Text>。
 * @param {object} text
 * @returns {object}
 */
export function makeScreened(text) {
  if (textValue(text) === undefined) throw new TypeError('makeScreened: Text required');
  const s = Object.freeze({});
  SCREENEDS.set(s, text);
  return s;
}

/**
 * 取 Screened 包着的 Text；不是 Screened 返回 undefined。
 * @param {unknown} s
 * @returns {object | undefined}
 */
export function screenedText(s) {
  return s !== null && typeof s === 'object' ? SCREENEDS.get(s) : undefined;
}
