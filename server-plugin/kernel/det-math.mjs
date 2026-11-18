// 定点算术（卷二 §3.3"定点算术"）：标度 SCALE，一切输入先转定点（小数第 5 位起截断），乘除 BigInt 整除向零截断，越界即错。
// 本文件是卷二 S10 登记豁免的 kernel 定点文件之一；文件里的常数逐条登记在 world/rules/tables/kernel-constants.json，
// 值只从那张表来（加载入口 installFixedConstants 收下），本文件不另定一份（李白 11-18 08:20 第 2 条）。
// 小数位数上限不另设常数：precision p 合法当且仅当 BASE^p 整除 SCALE（§1.2 的 0–4）；扩展标度 p 须使 BASE^p = SCALE²（§1.2、§3.3 第 6 条的 8）。

const LIMIT = BigInt(Number.MAX_SAFE_INTEGER);
// 状态整数上限 safeIntMax（卷二十七 §2.2 :168）：登记值经 installDetNumeric 收下；未装时用 IEEE 754 固定值。
let safeIntMaxLimit = LIMIT;
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
  // fixedLn 的算法常数（卷二 §3.3 :1335–:1339）：W、升标度、级数项数、LN2。单独装的测试可以先不交这四条，
  // 调用 fixedLn 时缺即报加载顺序错（与 diceKeyMaxQualifiers 同法），不在代码里给缺省值。
  const optInt = (k) => {
    const v = c ? c[k] : undefined;
    if (v === undefined) return null;
    if (!Number.isInteger(v) || v < 1) throw new FixedError('E-DIM-STRUCT-FIELD', `rules.kernelConstants.${k} is not a positive integer`);
    return v;
  };
  const optDigits = (k) => {
    const v = c ? c[k] : undefined;
    if (v === undefined) return null;
    let digits = typeof v === 'string' && v.length > 0;
    if (digits) for (const ch of v) if (!isDigit(ch)) digits = false;
    if (!digits) throw new FixedError('E-DIM-STRUCT-FIELD', `rules.kernelConstants.${k} is not a decimal digit string`);
    return BigInt(v);
  };
  installed = Object.freeze({
    base: need('BASE'), scale: need('SCALE'), permille: need('PERMILLE'), bps: need('BPS'),
    lnWorkExp: optInt('fixedLnWorkExponent'), lnInputExp: optInt('fixedLnInputExponent'),
    lnTerms: optInt('fixedLnSeriesTerms'), ln2: optDigits('LN2'),
  });
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
  if (v > safeIntMaxLimit || v < -safeIntMaxLimit) throw new FixedError('E-DET-OVERFLOW', 'fixed overflow');
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
  if (typeof x === 'bigint') return checkedFixed(x * scale);
  if (typeof x === 'number' && !Number.isFinite(x)) throw new FixedError('E-DIM-DOMAIN-RANGE', 'nonfinite');
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

// ---------- 10⁸ 标度与定点指数、对数、整数次幂（卷二 §3.3"定点指数与整数次幂（唯一定义）" :1328–:1340） ----------
// 指数表由加载入口 installExpTable 收下（world/ontology/dimensions/_distributions.json，tools/gen-det-tables.mjs 离线生成）；
// 运行期只读表、不现算（卷二十七 R27-5.2 :572–:574）。本文件是五个函数的唯一定义，别处只引用。

/** 10⁸ 标度（SCALE²）。@returns {bigint} */
const scale8 = () => { const s = fixedScale(); return s * s; };

/** @type {null | {int: bigint[], frac: bigint[]}} */
let expTables = null;

const isFixed8 = (v) => typeof v === 'bigint';

/**
 * 加载期收下 exp 表（卷二 §1.10 :325）：expInt[k−kMin] 与 expFrac[m]，值可为十进制字串（大值超出 2⁵³）。
 * @param {{scale: number, expInt: {kMin: number, kMax: number, values: (string | number)[]}, expFrac: {steps: number, values: (string | number)[]}}} doc
 * @returns {void}
 */
export function installExpTable(doc) {
  const intDoc = doc && doc.expInt;
  const fracDoc = doc && doc.expFrac;
  const ints = intDoc && Array.isArray(intDoc.values) ? intDoc.values : null;
  const fracs = fracDoc && Array.isArray(fracDoc.values) ? fracDoc.values : null;
  const bad = (m) => { throw new FixedError('E-DIM-STRUCT-FIELD', `_distributions.json expTable: ${m}`); };
  if (!ints || ints.length < 1 || (ints.length & 1) !== 1) bad('expInt.values must be an odd-length array');
  if (!fracs || fracs.length < 1) bad('expFrac.values must be a non-empty array');
  if (Number(intDoc.kMin) !== -Number(intDoc.kMax)) bad('expInt.kMin must equal -kMax');
  if (Number(intDoc.kMax) - Number(intDoc.kMin) + 1 !== ints.length) bad('expInt.kMin/kMax must span values');
  if (Number(fracDoc.steps) !== fracs.length - 1) bad('expFrac.steps must be values.length - 1');
  if (Number(doc.scale) !== Number(scale8())) bad('scale must equal SCALE squared');
  const toBig = (v, where) => {
    if (typeof v === 'string' && v.length > 0) {
      let digits = true;
      for (const ch of v) if (!isDigit(ch)) digits = false;
      if (digits) return BigInt(v);
    }
    if (typeof v === 'number' && Number.isSafeInteger(v) && v >= 0) return BigInt(v);
    return bad(`${where} must be a non-negative decimal integer`);
  };
  expTables = Object.freeze({
    int: Object.freeze(ints.map((v, i) => toBig(v, `expInt.values[${i}]`))),
    frac: Object.freeze(fracs.map((v, i) => toBig(v, `expFrac.values[${i}]`))),
  });
}

function expTableOf() {
  if (!expTables) throw new FixedError('E-DIM-STRUCT-FIELD', '_distributions.json expTable missing (load order: installExpTable)');
  return expTables;
}

/**
 * 十进制字串 → 10⁸ 标度整数，小数第 9 位起向零截断（卷二 §3.3 :1329）。
 * @param {number | bigint | string} x @returns {bigint}
 */
export function fixedUnits8(x) {
  const s8 = scale8();
  if (typeof x === 'bigint') return x * s8;
  if (typeof x === 'number' && !Number.isFinite(x)) throw new FixedError('E-DET-DOMAIN', 'nonfinite');
  const m = parseDecimalLiteral(x);
  if (!m) throw new FixedError('E-DET-DOMAIN', `not a decimal: ${x}`);
  const [, sign, whole, fraction, exponent] = m;
  let digits = whole + (fraction || '');
  let point = whole.length + Number(exponent || 0);
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) { digits = digits + '0'.repeat(point - digits.length); }
  const intPart = digits.slice(0, point) || '0';
  const frac = digits.slice(point);
  const v = BigInt(intPart) * s8 + (BigInt(frac || '0') * s8) / powBase(frac.length);
  return sign ? -v : v;
}

/** 两个 10⁸ 标度数相乘，BigInt 整除向零截断（卷二 §3.3 :1330）。@param {bigint} a @param {bigint} b @returns {bigint} */
export const fixedMultiply8 = (a, b) => (a * b) / scale8();

// 向下取整的整数除法（b > 0）；BigInt 的 / 向零截断，负数要再修正。
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && (r < 0n) !== (b < 0n) ? q - 1n : q;
}

function bitLength(v) {
  let n = 0;
  let x = v;
  while (x > 0n) { x >>= 1n; n += 1; }
  return n;
}

/**
 * 定点指数（卷二 §3.3 :1332）：入参、返回都是 10⁸ 标度；取值域 [−40, 40]（由 expInt 表长定），越界即错。
 * k = floor(x)，r = x − k，e^r 由 expFrac 线性插值，全程整数、向零截断。
 * @param {bigint} x 10⁸ 标度输入 @returns {bigint} 10⁸ 标度的 e^x
 */
export function fixedExp(x) {
  if (!isFixed8(x)) throw new FixedError('E-DET-DOMAIN', `fixedExp input ${String(x)}: want a fixed 10^8 integer`);
  const t = expTableOf();
  const s8 = scale8();
  const half = t.int.length >> 1;
  const bound = BigInt(half) * s8;
  if (x < -bound || x > bound) throw new FixedError('E-DET-DOMAIN', `fixedExp input ${x} outside [-${half}, ${half}]`);
  const k = Number(floorDiv(x, s8));
  const r = x - BigInt(k) * s8;
  const steps = BigInt(t.frac.length - 1);
  const m = Number((r * steps) / s8);
  const rem = r * steps - BigInt(m) * s8;
  const f0 = t.frac[m];
  const f1 = t.frac[m + 1];
  const eR = f0 + ((f1 - f0) * rem) / s8;
  return (t.int[k + half] * eR) / s8;
}

/**
 * 定点整数次幂（卷二 §3.3 :1333）：底数 10⁸ 标度非负，指数非负整数；按二进制位高到低反复平方与相乘。
 * @param {bigint} b 10⁸ 标度底数 @param {number | bigint} n 非负整数指数 @returns {bigint} 10⁸ 标度结果
 */
export function fixedPow(b, n) {
  if (!isFixed8(b) || b < 0n) throw new FixedError('E-DET-DOMAIN', 'fixedPow base: want a non-negative fixed 10^8 integer');
  const e = typeof n === 'bigint' ? n : (Number.isSafeInteger(n) && n >= 0 ? BigInt(n) : null);
  if (e === null || e < 0n) throw new FixedError('E-DET-DOMAIN', 'fixedPow exponent: want a non-negative integer');
  let result = scale8();
  for (let i = bitLength(e) - 1; i >= 0; i -= 1) {
    result = fixedMultiply8(result, result);
    if (((e >> BigInt(i)) & 1n) === 1n) result = fixedMultiply8(result, b);
  }
  return result;
}

function lnConstants() {
  const c = fixedConstants();
  if (c.lnWorkExp === null || c.lnInputExp === null || c.lnTerms === null || c.ln2 === null) {
    throw new FixedError('E-DIM-STRUCT-FIELD', 'rules.kernelConstants fixedLnWorkExponent/fixedLnInputExponent/fixedLnSeriesTerms/LN2 missing (load order)');
  }
  return c;
}

/**
 * 定点自然对数（卷二 §3.3 :1334–:1341）：入参 10⁸ 标度，定义域 0 < x ≤ expInt[40]，越界即错、不钳位。
 * 返回 10⁸ 标度的 ln x；固定六步、无随入参变化的迭代次数。
 * @param {bigint} x 10⁸ 标度输入 @returns {bigint} 10⁸ 标度结果
 */
export function fixedLn(x) {
  if (!isFixed8(x)) throw new FixedError('E-DET-DOMAIN', `fixedLn input ${String(x)}: want a fixed 10^8 integer`);
  const t = expTableOf();
  const top = t.int[t.int.length - 1];
  if (x <= 0n || x > top) throw new FixedError('E-DET-DOMAIN', `fixedLn input ${x} outside (0, ${top}]`);
  const c = lnConstants();
  const w = fixedBase() ** BigInt(c.lnWorkExp);
  const up = fixedBase() ** BigInt(c.lnInputExp);
  const a = x * up;
  // 第 2 步：唯一的 n 使 2ⁿW ≤ A < 2ⁿ⁺¹W。
  let n;
  if (a >= w) {
    n = bitLength(a / w) - 1;
  } else {
    const r = w / a;
    const rbits = bitLength(r) - 1;
    const exact = w % a === 0n;
    const powerOfTwo = (r & (r - 1n)) === 0n;
    n = -(exact && powerOfTwo ? rbits : rbits + 1);
  }
  const m = n >= 0 ? a / (1n << BigInt(n)) : a * (1n << BigInt(-n));
  // 第 3 步：换元。
  const tv = ((m - w) * w) / (m + w);
  const t2 = (tv * tv) / w;
  // 第 4 步：固定项数级数。
  let s = 0n;
  let p = tv;
  for (let i = 0; i < c.lnTerms; i += 1) {
    s += p / BigInt(i + i + 1);
    p = (p * t2) / w;
  }
  // 第 5、6 步：合并并按 10¹⁰ 降标度，向零截断。
  const l = BigInt(n) * c.ln2 + s + s;
  return l / up;
}

// ---------- 族 detfn 的查表函数（卷二十七 R27-5.2 :570–:575） ----------
// 七值各一行登记在规则表 det-numeric 的 fnTables（卷二十七 §2.2 :171）；本文件是这些函数的唯一实现。
// 表值由 tools/gen-det-tables.mjs 离线生成入库，运行期只读表、不现算（R27-5.2 :574）。

/** @type {null | Record<string, {inScale: bigint, outScale: bigint, domainMin: bigint, domainMax: bigint, step: bigint, iterations: bigint | null, values: bigint[] | null}>} */
let detTables = null;

const detInt = (v, where) => {
  if (typeof v === 'bigint') return v;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
  throw new FixedError('E-DIM-STRUCT-FIELD', `det-numeric ${where}: want an integer`);
};

/**
 * 加载期收下 det-numeric 的 fnTables（卷二十七 §2.2 :171）：值可为 JSON 数或 BigInt。
 * 逐行转换；不在这里重做规则表校验（加载器 load/rules.mjs 已按形状查过）。
 * @param {Record<string, object>} fnTables
 * @returns {void}
 */
export function installDetTables(fnTables) {
  if (fnTables === null || typeof fnTables !== 'object' || Array.isArray(fnTables)) throw new FixedError('E-DIM-STRUCT-FIELD', 'det-numeric fnTables: want an object');
  const rows = Object.create(null);
  for (const name of Object.keys(fnTables)) {
    const r = fnTables[name];
    if (r === null || typeof r !== 'object') throw new FixedError('E-DIM-STRUCT-FIELD', `det-numeric fnTables.${name}: want an object`);
    const values = Array.isArray(r.values) ? Object.freeze(r.values.map((v, i) => detInt(v, `${name}.values[${i}]`))) : null;
    rows[name] = Object.freeze({
      inScale: detInt(r.inScale, `${name}.inScale`),
      outScale: detInt(r.outScale, `${name}.outScale`),
      domainMin: detInt(r.domainMin, `${name}.domainMin`),
      domainMax: detInt(r.domainMax, `${name}.domainMax`),
      step: detInt(r.step, `${name}.step`),
      iterations: r.iterations === undefined ? null : detInt(r.iterations, `${name}.iterations`),
      values,
    });
  }
  detTables = Object.freeze(rows);
}

/** @type {string[] | null} */
let mathAllowList = null;

/**
 * 加载期收下 det-numeric 表的三个键（卷二十七 §2.2 :167–:171）：fnTables 交 installDetTables，
 * safeIntMax 交 checkedFixed 的上限，mathAllow 交 mathAllowed（空表 = 全禁）。
 * @param {Record<string, unknown>} rules engine.rules
 * @returns {void}
 */
export function installDetNumeric(rules) {
  const t = rules && rules.detNumeric;
  if (t === null || typeof t !== 'object') return;
  installDetTables(t.fnTables);
  if (Number.isSafeInteger(t.safeIntMax) && t.safeIntMax > 0) safeIntMaxLimit = BigInt(t.safeIntMax);
  mathAllowList = Object.freeze(Array.isArray(t.mathAllow) ? [...t.mathAllow] : []);
}

/** mathAllow 判定：规则层可用的整数安全数学成员（卷二十七 :167；空表 = 全禁）。@param {string} member @returns {boolean} */
export const mathAllowed = (member) => mathAllowList !== null && mathAllowList.includes(member);

function detRow(name) {
  if (!detTables || !Object.hasOwn(detTables, name)) throw new FixedError('E-DIM-STRUCT-FIELD', `rules.det-numeric.fnTables.${name} missing (load order: installDetTables)`);
  return detTables[name];
}

// 查表线性插值（卷二十七 R27-5.2 :571）：两点之间全程整数，除法向零截断；域外 E-DET-DOMAIN，不外推不钳位。
function tableLookup(row, x, name) {
  if (row.values === null) throw new FixedError('E-DIM-STRUCT-FIELD', `fnTables.${name}: this row has no values table`);
  if (x < row.domainMin || x > row.domainMax) throw new FixedError('E-DET-DOMAIN', `${name} input ${x} outside [${row.domainMin}, ${row.domainMax}]`);
  const off = x - row.domainMin;
  const idx = off / row.step;
  const rem = off - idx * row.step;
  const i = Number(idx);
  if (rem === 0n) return row.values[i];
  const a = row.values[i];
  const b = row.values[i + 1];
  return a + ((b - a) * rem) / row.step;
}

/**
 * ln：查表线性插值（卷二十七 :571）。入参、返回按该行的 inScale/outScale（现均为 10⁸）。
 * @param {number | bigint} x @returns {bigint}
 */
export function ln(x) {
  return tableLookup(detRow('ln'), detInt(x, 'ln input'), 'ln');
}

// 周期函数：输入先按 [domainMin, domainMax) 取余，再查表（卷二十七 :573）。
function periodicLookup(name, x) {
  const row = detRow(name);
  const v = detInt(x, `${name} input`);
  const period = row.domainMax - row.domainMin;
  if (period <= 0n) throw new FixedError('E-DIM-STRUCT-FIELD', `fnTables.${name}: empty period`);
  let r = (v - row.domainMin) % period;
  if (r < 0n) r += period;
  return tableLookup(row, row.domainMin + r, name);
}

/** sin：表覆盖一个整周期，输入先按周期取余（卷二十七 :573）。 @param {number | bigint} x @returns {bigint} */
export const sin = (x) => periodicLookup('sin', x);

/** cos：表覆盖一个整周期，输入先按周期取余（卷二十七 :573）。 @param {number | bigint} x @returns {bigint} */
export const cos = (x) => periodicLookup('cos', x);

/**
 * atan：定义域内查表；域外按 atan(x)=sign(x)·π/2−atan(1/x) 折回（卷二十七 :573）。
 * π/2 由本表 x=1（inScale）处的值乘 2 得出，不另写常数。
 * @param {number | bigint} x @returns {bigint}
 */
export function atan(x) {
  const row = detRow('atan');
  const v = detInt(x, 'atan input');
  if (v >= row.domainMin && v <= row.domainMax) return tableLookup(row, v, 'atan');
  const reciprocal = (row.inScale * row.inScale) / v;
  const folded = tableLookup(row, reciprocal, 'atan');
  const halfPi = tableLookup(row, row.inScale, 'atan') + tableLookup(row, row.inScale, 'atan');
  return (v < 0n ? -halfPi : halfPi) - folded;
}

/**
 * exp：不另立表，直接用卷二 §1.10 冻结指数表与 fixedExp（唯一定义；卷二十七 :572）。
 * 该行只给出标度与指向；域外由 fixedExp 报 E-DET-DOMAIN。
 * @param {number | bigint} x @returns {bigint}
 */
export function exp(x) {
  const row = detRow('exp');
  const v = detInt(x, 'exp input');
  if (v < row.domainMin || v > row.domainMax) throw new FixedError('E-DET-DOMAIN', `exp input ${v} outside [${row.domainMin}, ${row.domainMax}]`);
  const s8 = scale8();
  const x8 = (v * s8) / row.inScale;
  const e8 = fixedExp(x8);
  return (e8 * row.outScale) / s8;
}

/**
 * sqrt：整数牛顿固定步数，不查表（卷二 §1.10 :326、卷二十七 :573）；步数登在该行 iterations。
 * 输出取 min(y, ⌊n/y⌋)，保证返回 ⌊√n⌋。
 * @param {number | bigint} x @returns {bigint}
 */
export function sqrt(x) {
  const row = detRow('sqrt');
  const v = detInt(x, 'sqrt input');
  if (v < row.domainMin || v > row.domainMax) throw new FixedError('E-DET-DOMAIN', `sqrt input ${v} outside [${row.domainMin}, ${row.domainMax}]`);
  if (v < 0n) throw new FixedError('E-DET-DOMAIN', `sqrt input ${v} is negative`);
  if (row.iterations === null) throw new FixedError('E-DIM-STRUCT-FIELD', 'fnTables.sqrt.iterations missing');
  const n = (v * row.outScale * row.outScale) / row.inScale;
  if (n === 0n) return 0n;
  let y = 1n << BigInt((bitLength(n) + 1) >> 1);
  for (let i = 0n; i < row.iterations; i += 1n) y = (y + n / y) >> 1n;
  const q = n / y;
  return q < y ? q : y;
}

/**
 * pow：由 exp 与 ln 组合（卷二 §3.3 :1341 非整数次幂唯一写法）：exp(k·ln x)，底数须为正。
 * k 为 10⁸ 标度指数；结果按 exp 行的 outScale 给出。
 * @param {number | bigint} x 底数（ln 行的 inScale 标度） @param {number | bigint} k 指数（10⁸ 标度） @returns {bigint}
 */
export function pow(x, k) {
  const v = detInt(x, 'pow base');
  if (v <= 0n) throw new FixedError('E-DET-DOMAIN', `pow base ${v} must be positive`);
  const lnRow = detRow('ln');
  const expRow = detRow('exp');
  const s8 = scale8();
  const lnOut = tableLookup(lnRow, v, 'ln');
  const ln8 = (lnOut * s8) / lnRow.outScale;
  const product = fixedMultiply8(detInt(k, 'pow exponent'), ln8);
  const e8 = fixedExp(product);
  return (e8 * expRow.outScale) / s8;
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
