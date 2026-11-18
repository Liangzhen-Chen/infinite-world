// 定点算术（卷二 §3.3"定点算术"）：标度 SCALE，一切输入先转定点（小数第 5 位起截断），乘除 BigInt 整除向零截断，越界即错。
// 本文件是卷二 S10 登记豁免的 kernel 定点文件之一；文件里的常数逐条登记在 world/rules/tables/kernel-constants.json，
// 值只从那张表来（加载入口 installFixedConstants 收下），本文件不另定一份（李白 11-18 08:20 第 2 条）。
// 小数位数上限不另设常数：precision p 合法当且仅当 BASE^p 整除 SCALE（§1.2 的 0–4）；扩展标度 p 须使 BASE^p = SCALE²（§1.2、§3.3 第 6 条的 8）。

import { T } from './handles/markers.mjs';

const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);
// 十进制文本文法的字元记号（逐字符解析，见文件头；单一定义）。
const CH = Object.freeze({ minus: '-', dot: '.', expLower: 'e', expUpper: 'E', plus: '+' });

export class FixedError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// 内核定点常数（BASE、SCALE、PERMILLE、BPS）：由加载入口在读到规则表后调一次（与 installScheduler 同法）。
/** @type {null | {base: bigint, scale: bigint, permille: bigint, bps: bigint}} */
let installed = null;

/**
 * 加载期收下 kernelConstants 的四条定点常数（卷二 S10 登记豁免表；不许在代码里另写数值）。
 * @param {{BASE: number, SCALE: number, PERMILLE: number, BPS: number}} c
 * @returns {void}
 */
export function installFixedConstants(c) {
  const need = (k) => {
    if (!c || !Number.isInteger(c[k]) || c[k] < 1) throw new FixedError('E-DIM-STRUCT-FIELD', `rules.kernelConstants.${k} is not a positive integer`);
    return BigInt(c[k]);
  };
  installed = Object.freeze({ base: need('BASE'), scale: need('SCALE'), permille: need('PERMILLE'), bps: need('BPS') });
}

function fixedConstants() {
  if (!installed) throw new FixedError('E-DIM-STRUCT-FIELD', 'rules.kernelConstants missing (load order: installFixedConstants)');
  return installed;
}

/** 定点底（10）。@returns {bigint} */
export const fixedBase = () => fixedConstants().base;
/** 定点标度（10⁴）。@returns {bigint} */
export const fixedScale = () => fixedConstants().scale;
/** 千分满值（1000）。@returns {bigint} */
export const permille = () => fixedConstants().permille;
/** 基点满值（10000）。@returns {bigint} */
export const bps = () => fixedConstants().bps;

/** @param {bigint} v 定点整数 @returns {bigint} */
export function checkedFixed(v) {
  if (v > LIMIT || v < -LIMIT) throw new FixedError('E-DIM-DOMAIN-RANGE', 'fixed overflow');
  return v;
}

const powBase = (p) => fixedBase() ** BigInt(p);
// 维度 precision 在 SCALE 可表示的小数位内（0 至 SCALE 的位数）。
/** @param {number} p @returns {boolean} */
export const precisionOk = (p) => Number.isInteger(p) && p >= 0 && fixedScale() % powBase(p) === 0n;
// stockMode extScale 的 precision：BASE^p = SCALE²。
/** @param {number} p @returns {boolean} */
export function extPrecisionOk(p) {
  if (!Number.isInteger(p) || p < 0) return false;
  const q = powBase(p);
  const s = fixedScale();
  return q % s === 0n && q / s === s;
}

// 十进制文本的逐字符解析（原 handles/patterns.mjs 的 /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i，行为逐条等价）。
// 用逐字符判断而非正则：det-math 若 import handles/*、validate/* 任一文件都会成 import 环（vocab-handle → validate/types → det-math），
// 而本文件不在 S13 (b) 允许用正则的文件之列。接受的文法：可选 `-`（`+` 不收）；至少一位 0–9；可选 `.` 后至少一位 0–9（前导点、尾点不收）；
// 可选 `e`/`E` 后可选 `+`/`-` 再接至少一位 0–9；整串必须恰好用尽（不 trim、不收尾随换行）。
// 返回 [全文, 符号, 整数位, 小数位, 指数]（未出现的分组为 undefined，与 RegExpExecArray 同形），不合文法返回 null。
const isDigit = (ch) => ch >= '0' && ch <= '9';

/** @param {unknown} x @returns {(string | undefined)[] | null} */
export function parseDecimalLiteral(x) {
  const s = String(x);
  let i = 0;
  let sign = '';
  if (s[i] === CH.minus) { sign = '-'; i += 1; }
  const wholeStart = i;
  while (isDigit(s[i])) i += 1;
  if (i === wholeStart) return null;
  const whole = s.slice(wholeStart, i);
  let fraction;
  if (s[i] === CH.dot) {
    i += 1;
    const fractionStart = i;
    while (isDigit(s[i])) i += 1;
    if (i === fractionStart) return null;
    fraction = s.slice(fractionStart, i);
  }
  let exponent;
  if (s[i] === CH.expLower || s[i] === CH.expUpper) {
    i += 1;
    const expStart = i;
    if (s[i] === CH.plus || s[i] === CH.minus) i += 1;
    const expDigits = i;
    while (isDigit(s[i])) i += 1;
    if (i === expDigits) return null;
    exponent = s.slice(expStart, i);
  }
  if (i !== s.length) return null;
  return [s, sign, whole, fraction, exponent];
}

// 十进制文本（含 JS 数的指数写法）→ 定点整数，小数超出位数的部分截断（不四舍五入）。
/** @param {number | bigint | string} x @returns {bigint} */
export function fixedUnits(x) {
  const scale = fixedScale();
  if (typeof x === T.js_type.bigint) return checkedFixed(x * scale);
  if (typeof x === T.js_type.number && !Number.isFinite(x)) throw new FixedError('E-DIM-DOMAIN-RANGE', 'nonfinite');
  const m = parseDecimalLiteral(x);
  if (!m) throw new FixedError('E-DIM-DOMAIN-RANGE', `not a decimal: ${x}`);
  const [, sign, whole, fraction, exponent] = m;
  let digits = whole + (fraction || '');
  let point = whole.length + Number(exponent || 0);
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) { digits = digits + '0'.repeat(point - digits.length); }
  const intPart = digits.slice(0, point) || '0';
  const frac = digits.slice(point);
  // 小数部分按 SCALE 折算，整除即截断。
  const v = BigInt(intPart) * scale + (BigInt(frac || '0') * scale) / powBase(frac.length);
  return checkedFixed(sign ? -v : v);
}

/** @param {bigint} a @param {bigint} b @returns {bigint} */
export const fixedAdd = (a, b) => checkedFixed(a + b);
/** @param {bigint} a @param {bigint} b @returns {bigint} */
export const fixedSub = (a, b) => checkedFixed(a - b);
/** @param {bigint} a @param {bigint} b @returns {bigint} */
export const fixedMultiply = (a, b) => checkedFixed((a * b) / fixedScale());
/** @param {bigint} a @param {bigint} b @returns {bigint} */
export function fixedDivide(a, b) {
  if (b === 0n) throw new FixedError('E-MOD-RX', 'division by zero');
  return checkedFixed((a * fixedScale()) / b);
}

// 按维度 precision 向零截断。
/** @param {bigint} v @param {number} precision @returns {bigint} */
export function truncateTo(v, precision) {
  const step = fixedScale() / powBase(precision);
  return (v / step) * step;
}

// 定点整数 → JS 数（按十进制文本转换，不经浮点乘除）。小数部分加 SCALE 再去掉首位，得到补足前导零的各位。
/** @param {bigint} v @returns {number} */
export function fixedToNumber(v) {
  const neg = v < 0n; const a = neg ? -v : v; const scale = fixedScale();
  return Number(`${neg ? '-' : ''}${a / scale}.${String((a % scale) + scale).slice(1)}`);
}

/** @param {bigint} v @returns {boolean} */
export const isWholeFixed = (v) => v % fixedScale() === 0n;
