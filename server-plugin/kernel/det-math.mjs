// 定点算术（卷二 §3.3"定点算术"）：标度 SCALE，一切输入先转定点（小数第 5 位起截断），乘除 BigInt 整除向零截断，越界即错。
// 本文件是卷二 S10 登记豁免的 kernel 定点文件之一；文件里的常数逐条登记在 world/rules/tables/kernel-constants.json。
// 小数位数上限不另设常数：precision p 合法当且仅当 BASE^p 整除 SCALE（§1.2 的 0–4）；扩展标度 p 须使 BASE^p = SCALE²（§1.2、§3.3 第 6 条的 8）。

export const BASE = 10n;
export const SCALE = 10000n;

const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);

export class FixedError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function checkedFixed(v) {
  if (v > LIMIT || v < -LIMIT) throw new FixedError('E-DIM-DOMAIN-RANGE', 'fixed overflow');
  return v;
}

const powBase = (p) => BASE ** BigInt(p);
// 维度 precision 在 SCALE 可表示的小数位内（0 至 SCALE 的位数）。
export const precisionOk = (p) => Number.isInteger(p) && p >= 0 && SCALE % powBase(p) === 0n;
// stockMode extScale 的 precision：BASE^p = SCALE²。
export function extPrecisionOk(p) {
  if (!Number.isInteger(p) || p < 0) return false;
  const q = powBase(p);
  return q % SCALE === 0n && q / SCALE === SCALE;
}

// 十进制文本（含 JS 数的指数写法）→ 定点整数，小数超出位数的部分截断（不四舍五入）。
export function fixedUnits(x) {
  if (typeof x === 'bigint') return checkedFixed(x * SCALE);
  if (typeof x === 'number' && !Number.isFinite(x)) throw new FixedError('E-DIM-DOMAIN-RANGE', 'nonfinite');
  const m = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(x));
  if (!m) throw new FixedError('E-DIM-DOMAIN-RANGE', `not a decimal: ${x}`);
  const [, sign, whole, fraction, exponent] = m;
  let digits = whole + (fraction || '');
  let point = whole.length + Number(exponent || 0);
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) { digits = digits + '0'.repeat(point - digits.length); }
  const intPart = digits.slice(0, point) || '0';
  const frac = digits.slice(point);
  // 小数部分按 SCALE 折算，整除即截断。
  const v = BigInt(intPart) * SCALE + (BigInt(frac || '0') * SCALE) / powBase(frac.length);
  return checkedFixed(sign ? -v : v);
}

export const fixedAdd = (a, b) => checkedFixed(a + b);
export const fixedSub = (a, b) => checkedFixed(a - b);
export const fixedMultiply = (a, b) => checkedFixed((a * b) / SCALE);
export function fixedDivide(a, b) {
  if (b === 0n) throw new FixedError('E-MOD-RX', 'division by zero');
  return checkedFixed((a * SCALE) / b);
}

// 按维度 precision 向零截断。
export function truncateTo(v, precision) {
  const step = SCALE / powBase(precision);
  return (v / step) * step;
}

// 定点整数 → JS 数（按十进制文本转换，不经浮点乘除）。小数部分加 SCALE 再去掉首位，得到补足前导零的各位。
export function fixedToNumber(v) {
  const neg = v < 0n; const a = neg ? -v : v;
  return Number(`${neg ? '-' : ''}${a / SCALE}.${String((a % SCALE) + SCALE).slice(1)}`);
}

export const isWholeFixed = (v) => v % SCALE === 0n;
