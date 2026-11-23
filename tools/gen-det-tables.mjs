// 冻结分布表离线生成器（卷二 §1.10 :323–:327；卷二十七 R27-5.2 :569–:575）。
// 生成 world/ontology/dimensions/_distributions.json：normalQuantile（Φ⁻¹(j/4096) 的 4 位定点，4097 点，两端钳 ±3.9000）、
// expInt（e^k 的 8 位定点，k=−40..40）、expFrac（e^(m/4096) 的 8 位定点，m=0..4096），各表带 sha256。
// 用法：node tools/gen-det-tables.mjs          重新生成；有变化时改写入库文件
//       node tools/gen-det-tables.mjs --check  重新生成并逐位比对入库文件，不一致退出码 1，不写盘
//
// 算法依据（卡文做法第 2 条）：表值必须是数学真值的精确截断，不能用 Math.exp 乘标度取整——
// e^40×10⁸ ≈ 2.35×10²⁵ 超出双精度有效位。本脚本全部用 BigInt 定点：
//   · 工作标度 WORK_EXP = 10⁶⁰。e 用 Taylor 级数 Σ 1/i!（每项整除，截尾 < 10⁻¹²⁰·W）；e^k 用固定次序的平方乘；
//     e^(1/4096) 同法，再用平方乘得 e^(m/4096)。各步相对误差 ~10⁻⁵⁷，远小于输出 10⁻⁸ 的半个单位。
//   · 反正态用高精度 Φ 做牛顿迭代：Φ(x) = (1+erf(x/√2))/2，erf 用 Taylor 级数（工作标度 WORK_Z = 10⁵⁰，
//     |x| ≤ 3.9 时级数项峰值 ~e^{x²/2}，抵消后仍余 40 位以上）；π 用 Machin 公式，√π、√2、√(2π) 用 BigInt 整数开方。
//     初值只借双精度 Acklam 近似（误差 ~10⁻⁹），随后 6 步 BigInt 牛顿收敛到 10⁻⁴⁰ 以下。
//   · 截断按"向零"：正数 floor，负数 ceil。每个候选值都用高精度 Φ 复核落在 [k/10⁴, (k+1)/10⁴] 的正确一侧
//     （或负数侧的对称区间）；复核不过即抛错，不写半截表。这是 4 位截断稳定的判据。
// sha256 的口径：values.map(String).join(',') 的 UTF-8 字节（expInt 的值以十进制字串入库，保证 >2⁵³ 的值不丢位）。
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repoRoot, safeSegment } from './path-segment.mjs';

const FILE = '_distributions.json';
const OUT_EXP_SCALE = 10n ** 8n;
const OUT_Z_SCALE = 10n ** 4n;
const WORK_EXP = 10n ** 60n;
const WORK_Z = 10n ** 50n;
const EXP_MIN = -40;
const EXP_MAX = 40;
const FRAC_STEPS = 4096;
const QUANTILE_POINTS = 4097;
const CLAMP_Z = 39000;
const PER_LINE = 12;

const isqrt = (n) => {
  if (n < 2n) return n;
  let x = n;
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
};
const mul = (a, b, w) => (a * b) / w;

// 固定指数：e^a 的 W 标度值，a ≥ 0（Taylor，逐项整除；a 可为 0）。
function expFixed(a, w) {
  let sum = w;
  let term = w;
  for (let i = 1; ; i += 1) {
    term = (term * a) / (w * BigInt(i));
    if (term === 0n) break;
    sum += term;
  }
  return sum;
}

// 固定幂：base^n 的 W 标度值，n 为非负整数；按二进制位高到低反复平方与相乘，次序固定。
function powFixed(base, n, w) {
  let result = w;
  for (const bit of n.toString(2)) {
    result = mul(result, result, w);
    if (bit === '1') result = mul(result, base, w);
  }
  return result;
}

// atan(1/q) 的 W 标度值（Machin 用）：Σ (−1)^k / ((2k+1) q^(2k+1))。
function atanInv(q, w) {
  const q2 = q * q;
  let sum = 0n;
  let qpow = q; // q^(2k+1)：k=0 时是 q，之后每轮乘 q²
  let sign = 1n;
  for (let k = 0; ; k += 1) {
    const term = w / (BigInt(2 * k + 1) * qpow);
    if (term === 0n) break;
    sum += sign * term;
    sign = -sign;
    qpow *= q2;
  }
  return sum;
}

const piFixed = (w) => 4n * (4n * atanInv(5n, w) - atanInv(239n, w));

// erf(t) 的 W 标度值（Taylor：2/√π Σ (−1)^n t^(2n+1)/(n!(2n+1))，t 取绝对值后按符号还原）。
function erfFixed(t, w, sqrtPi) {
  const neg = t < 0n;
  const a = neg ? -t : t;
  const a2 = mul(a, a, w);
  let sum = a;
  let term = a;
  for (let n = 1; ; n += 1) {
    term = (term * a2 * BigInt(2 * n - 1)) / (w * BigInt(n) * BigInt(2 * n + 1));
    if (term === 0n) break;
    sum += n % 2 === 0 ? term : -term;
  }
  const out = ((sum + sum) * w) / sqrtPi;
  return neg ? -out : out;
}

// Φ(x) 的 W 标度值。
const PhiOf = (x, w, sqrtPi, sqrt2) => (w + erfFixed((x * w) / sqrt2, w, sqrtPi)) / 2n;

// 标准正态密度 φ(x) 的 W 标度值。
function phiOf(x, w, sqrt2pi) {
  const half = mul(x, x, w) / 2n;
  const e = expFixed(half, w);
  return ((w * w) / e) * w / sqrt2pi;
}

// 双精度 Acklam 近似（只作牛顿初值；最终值全部由 BigInt 迭代与复核决定）。
function acklam(p) {
  const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
  const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
  const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
  const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

function fail(message) { throw new Error(`gen-det-tables: ${message}`); }

// 一个分位点的 4 位向零截断值：牛顿求根，再用高精度 Φ 复核截断区间。
function quantilePoint(j, w, sqrtPi, sqrt2, sqrt2pi) {
  const p = (w * BigInt(j)) / BigInt(QUANTILE_POINTS - 1); // W 标度；W 被 4096 整除，精确
  let x = BigInt(Math.round(acklam(j / (QUANTILE_POINTS - 1)) * Number(w)));
  for (let i = 0; i < 6; i += 1) {
    const f = PhiOf(x, w, sqrtPi, sqrt2);
    const ph = phiOf(x, w, sqrt2pi);
    if (ph === 0n) fail(`normalQuantile j=${j}: phi=0 at x=${x}`);
    x -= ((f - p) * w) / ph;
  }
  const k = (x * OUT_Z_SCALE) / w; // BigInt 除法向零截断
  const at = (kk) => PhiOf((kk * w) / OUT_Z_SCALE, w, sqrtPi, sqrt2);
  // 正数：k/10⁴ ≤ z < (k+1)/10⁴；负数向零截断：k/10⁴ ≥ z > (k−1)/10⁴。
  const ok = x >= 0n
    ? at(k) <= p && p < at(k + 1n)
    : at(k) >= p && p > at(k - 1n);
  if (!ok) fail(`normalQuantile j=${j}: 4 位截断复核不过`);
  return Number(k);
}

function buildNormalQuantile() {
  const pi = piFixed(WORK_Z);
  const sqrtPi = isqrt(pi * WORK_Z);
  const sqrt2 = isqrt(2n * WORK_Z * WORK_Z);
  const sqrt2pi = isqrt(2n * pi * WORK_Z);
  const values = new Array(QUANTILE_POINTS);
  values[0] = -CLAMP_Z;
  values[QUANTILE_POINTS - 1] = CLAMP_Z;
  for (let j = 1; j < QUANTILE_POINTS - 1; j += 1) values[j] = quantilePoint(j, WORK_Z, sqrtPi, sqrt2, sqrt2pi);
  if (values[QUANTILE_POINTS >> 1] !== 0) fail('normalQuantile 中点不是 0');
  for (let j = 1; j < QUANTILE_POINTS; j += 1) if (!(values[j] > values[j - 1])) fail(`normalQuantile j=${j} 非严格递增`);
  if (values[0] !== -CLAMP_Z || values[QUANTILE_POINTS - 1] !== CLAMP_Z) fail('normalQuantile 端点钳位不对');
  return values;
}

function buildExpInt() {
  const e = expFixed(WORK_EXP, WORK_EXP);
  const values = [];
  for (let k = EXP_MIN; k <= EXP_MAX; k += 1) {
    const v = k >= 0 ? (k === 0 ? WORK_EXP : powFixed(e, k, WORK_EXP)) : (WORK_EXP * WORK_EXP) / powFixed(e, -k, WORK_EXP);
    values.push(((v * OUT_EXP_SCALE) / WORK_EXP).toString());
  }
  if (values[0 - EXP_MIN] !== (OUT_EXP_SCALE).toString()) fail('expInt k=0 不是 10⁸');
  if (values[1 - EXP_MIN] !== '271828182') fail(`expInt k=1 不是 floor(e×10⁸)=271828182，实为 ${values[1 - EXP_MIN]}`);
  for (let i = 1; i < values.length; i += 1) if (!(BigInt(values[i]) >= BigInt(values[i - 1]))) fail(`expInt 第 ${i} 项非递增`);
  return values;
}

function buildExpFrac(expInt) {
  const q = expFixed(WORK_EXP / BigInt(FRAC_STEPS), WORK_EXP);
  const values = [];
  for (let m = 0; m <= FRAC_STEPS; m += 1) {
    const v = m === 0 ? WORK_EXP : powFixed(q, m, WORK_EXP);
    values.push(Number((v * OUT_EXP_SCALE) / WORK_EXP));
  }
  if (values[0] !== Number(OUT_EXP_SCALE)) fail('expFrac m=0 不是 10⁸');
  if (values[FRAC_STEPS] !== Number(expInt[1 - EXP_MIN])) fail(`expFrac m=4096 与 expInt k=1 不一致（${values[FRAC_STEPS]} vs ${expInt[1 - EXP_MIN]}）`);
  for (let i = 1; i < values.length; i += 1) if (!(values[i] >= values[i - 1])) fail(`expFrac 第 ${i} 项非递增`);
  return values;
}

// ---------- det-numeric 规则表（卷二十七 §2.2 :171、R27-5.2 :570–:575） ----------
// 表值同样用 BigInt 高精度离线算出：工作标度 W = 10⁶⁰，截到输出标度 10⁸ 前逐值核对不贴截断边界。
// 工作标度内的截断误差远小于 10⁻⁴⁰，所以"离边界不足 10⁻⁴⁰"即视为算不准，抛错不写半截表。
const DET_FILE = 'det-numeric.json';
const W = 10n ** 60n;
const OUT8 = 10n ** 8n;
const W_PER_OUT = W / OUT8;
const TRIG_PERIOD = 628_320_000;   // 2π 截到 10⁻⁴ 的 10⁸ 标度值（6.2832）
const TRIG_STEP = 40_000;          // 4×10⁻⁴
const ATAN_LIM = 100_000_000;      // ±1
const ATAN_STEP = 100_000;         // 10⁻³
const SQRT_ITERATIONS = 32;        // 卷二 §1.10 :326 牛顿法固定 32 步
const SAFE_INT_MAX = 9_007_199_254_740_991; // 2⁵³−1

const bitLength = (v) => { let n = 0; let x = v; while (x > 0n) { x >>= 1n; n += 1; } return n; };
// 大整数开方（初值取 2 的幂，牛顿迭代至稳定）；工作标度里算 1+x² 的平方根用。
function isqrtBig(n) {
  if (n < 2n) return n;
  let x = 1n << BigInt((bitLength(n) + 1) >> 1);
  for (;;) { const y = (x + n / x) >> 1n; if (y >= x) return x; x = y; }
}

// sin/cos 的 W 标度值：先按 2π 取余，再 Taylor 级数（r < 2π，约 45 项后为 0）。
function sinW(a, w, pi) {
  const twoPi = pi + pi;
  let r = a % twoPi;
  if (r < 0n) r += twoPi;
  const r2 = (r * r) / w;
  let term = r;
  let sum = r;
  for (let n = 1; ; n += 1) {
    term = -(((term * r2) / w)) / BigInt((2 * n) * (2 * n + 1));
    if (term === 0n) break;
    sum += term;
  }
  return sum;
}

function cosW(a, w, pi) {
  const twoPi = pi + pi;
  let r = a % twoPi;
  if (r < 0n) r += twoPi;
  const r2 = (r * r) / w;
  let term = w;
  let sum = w;
  for (let n = 1; ; n += 1) {
    term = -(((term * r2) / w)) / BigInt((2 * n - 1) * (2 * n));
    if (term === 0n) break;
    sum += term;
  }
  return sum;
}

// atan 的 W 标度值：反复用 atan(x)=2·atan(x/(1+√(1+x²))) 把 |x| 压到 0.1 以下，再 Taylor。
function atanW(x, w) {
  const neg = x < 0n;
  let y = neg ? -x : x;
  let factor = 1n;
  while (y * 10n > w) {
    const root = isqrtBig(w * w + y * y);
    y = (y * w) / (w + root);
    factor += factor;
  }
  const y2 = (y * y) / w;
  let p = y;
  let sum = y;
  for (let i = 1; ; i += 1) {
    p = -((p * y2) / w);
    const term = p / BigInt(2 * i + 1);
    if (term === 0n) break;
    sum += term;
  }
  const out = factor * sum;
  return neg ? -out : out;
}

// W 标度值截到 10⁸ 标度（向零截断）；离截断边界不足 10⁻⁴⁰ 视为算不准，抛错。
function truncOut(v, name) {
  const k = v / W_PER_OUT;
  const rem = v - k * W_PER_OUT;
  const mag = rem < 0n ? -rem : rem;
  if (mag !== 0n && (mag < 10n ** 40n || W_PER_OUT - mag < 10n ** 40n)) fail(`${name}: 截断边界过近（rem=${rem}）`);
  const out = Number(k);
  if (!Number.isSafeInteger(out)) fail(`${name}: 结果超出安全整数（${k}）`);
  return out;
}

function buildTrig(fn, name) {
  const pi = piFixed(W);
  const values = [];
  for (let a = 0; a <= TRIG_PERIOD; a += TRIG_STEP) values.push(truncOut(fn(BigInt(a) * W_PER_OUT, W, pi), `${name} a=${a}`));
  return values;
}

function buildAtan() {
  const values = [];
  for (let x = -ATAN_LIM; x <= ATAN_LIM; x += ATAN_STEP) values.push(truncOut(atanW(BigInt(x) * W_PER_OUT, W), `atan x=${x}`));
  if (values[(0 + ATAN_LIM) / ATAN_STEP] !== 0) fail('atan x=0 不是 0');
  if (values[(50_000_000 + ATAN_LIM) / ATAN_STEP] !== 46364760) fail(`atan x=0.5 不是 ⌊atan 0.5×10⁸⌋=46364760，实为 ${values[(50_000_000 + ATAN_LIM) / ATAN_STEP]}`);
  if (values[(100_000_000 + ATAN_LIM) / ATAN_STEP] !== 78539816) fail(`atan x=1 不是 ⌊π/4×10⁸⌋=78539816，实为 ${values[(100_000_000 + ATAN_LIM) / ATAN_STEP]}`);
  if (values[(100_000_000 + ATAN_LIM) / ATAN_STEP] !== -values[0]) fail('atan 两端不对称');
  return values;
}

// 一条 fnTable 的 JSON 文本（字段顺序固定：标度、定义域、步长、可选 iterations/values/sha256、basis）。
function fnEntryText(name, meta, values) {
  const out = [`   "${name}": {`];
  out.push(`    "inScale": ${meta.inScale},`);
  out.push(`    "outScale": ${meta.outScale},`);
  out.push(`    "domainMin": ${meta.domainMin},`);
  out.push(`    "domainMax": ${meta.domainMax},`);
  out.push(`    "step": ${meta.step},`);
  if (meta.iterations !== undefined) out.push(`    "iterations": ${meta.iterations},`);
  if (values) {
    out.push(`    "values": ${block(values, '    ')},`);
    out.push(`    "sha256": "${digestOf(values)}",`);
  }
  out.push(`    "basis": ${JSON.stringify(meta.basis)}`);
  out.push('   }');
  return out.join('\n');
}

const LN_BASIS = '不另立表：直接指向卷二 §3.3 的 fixedLn（唯一定义），标度 10⁸；定义域以 fixedLn 为准（0 < x ≤ expInt[40]，上端超出安全整数，行内取 1 与 2⁵³−1 只作输入类型界），越界报 E-DET-DOMAIN；精度界 <2×10⁻⁸ 见卷二 §3.3。';
const SIN_BASIS = '输入 10⁸ 标度；表覆盖一个周期 6.2832 rad（2π 截到 10⁻⁴，端点误差 1.47×10⁻⁵，由输入先按周期取余消化），步长 4×10⁻⁴（4×10⁴）；插值误差 ≤ h²/8 = 2×10⁻⁸。首次标定：周期取 10⁸ 标度上最接近 2π 的 10⁻⁴ 整倍数。';
const COS_BASIS = SIN_BASIS;
const ATAN_BASIS = '输入 10⁸ 标度；定义域 [-1, 1]，步长 10⁻³（10⁵）；插值误差 ≤ h²·max|f″|/8 ≈ (10⁻³)²×0.65/8 = 8.1×10⁻⁸。域外按 atan(x)=sign(x)·π/2−atan(1/x) 折回，π/2 由本表 x=1 的值乘 2 得出，不另写常数。';
const EXP_BASIS = '不另立表：直接指向卷二 §1.10 冻结指数表与 fixedExp（唯一定义），标度 10⁸、取值域 [-40, 40] 与卷二 §3.3 一致。';
const SQRT_BASIS = '不查表：整数牛顿法固定 32 步（卷二 §1.10 :326），32 登在 iterations；结果取 min(y, ⌊n/y⌋) 保证向下取整。定义域 [0, 2⁵³−1] 按输入 10⁸ 标度。';
const POW_BASIS = '由 exp 与 ln 组合（卷二 §3.3 :1408 非整数次幂唯一写法）：exp(k·ln x)，底数须为正；定义域随 fixedLn，k·ln x 须落在 fixedExp 的 [-40, 40]。';

function detNumericText() {
  const sin = buildTrig(sinW, 'sin');
  const cos = buildTrig(cosW, 'cos');
  const atan = buildAtan();
  if (sin[2_500] !== 84147098) fail(`sin x=1 不是 ⌊sin 1×10⁸⌋=84147098，实为 ${sin[2_500]}`); // 10⁸/4×10⁴ = 2500
  if (cos[2_500] !== 54030230) fail(`cos x=1 不是 ⌊cos 1×10⁸⌋=54030230，实为 ${cos[2_500]}`);
  if (sin[0] !== 0 || cos[0] !== OUT8_NUMBER) fail('sin/cos 在 0 处的值不对');
  const entries = [
    fnEntryText('exp', { inScale: 100_000_000, outScale: 100_000_000, domainMin: -4_000_000_000, domainMax: 4_000_000_000, step: 1, basis: EXP_BASIS }),
    fnEntryText('ln', { inScale: 100_000_000, outScale: 100_000_000, domainMin: 1, domainMax: SAFE_INT_MAX, step: 1, basis: LN_BASIS }),
    fnEntryText('sin', { inScale: 100_000_000, outScale: 100_000_000, domainMin: 0, domainMax: TRIG_PERIOD, step: TRIG_STEP, basis: SIN_BASIS }, sin),
    fnEntryText('cos', { inScale: 100_000_000, outScale: 100_000_000, domainMin: 0, domainMax: TRIG_PERIOD, step: TRIG_STEP, basis: COS_BASIS }, cos),
    fnEntryText('atan', { inScale: 100_000_000, outScale: 100_000_000, domainMin: -ATAN_LIM, domainMax: ATAN_LIM, step: ATAN_STEP, basis: ATAN_BASIS }, atan),
    fnEntryText('sqrt', { inScale: 100_000_000, outScale: 100_000_000, domainMin: 0, domainMax: SAFE_INT_MAX, step: 1, iterations: SQRT_ITERATIONS, basis: SQRT_BASIS }),
    fnEntryText('pow', { inScale: 100_000_000, outScale: 100_000_000, domainMin: 1, domainMax: SAFE_INT_MAX, step: 1, basis: POW_BASIS }),
  ];
  const text = `{
 "rows": [
  {
   "key": "mathAllow",
   "value": ["abs", "min", "max", "sign", "round", "trunc", "floor", "ceil"],
   "source": "卷二十七 §2.2 :167 mathAllow（规则层可用的整数安全数学成员：取整、绝对值、最大最小、符号一类）；空表 = 全禁"
  },
  {
   "key": "safeIntMax",
   "value": ${SAFE_INT_MAX},
   "source": "卷二十七 §2.2 :168（IEEE 754 双精度可精确表示的最大整数 2⁵³−1，固定值）"
  },
  {
   "key": "fnTables",
   "value": {
${entries.join(',\n')}
   },
   "source": "卷二十七 §2.2 :171、R27-5.2 :570–:575（expo 七函数各一行；exp 指向卷二 §1.10 冻结表；ln 指向卷二 fixedLn；sqrt 牛顿固定步；pow=exp∘ln）"
  }
 ]
}
`;
  return { text, counts: { sin: sin.length, cos: cos.length, atan: atan.length } };
}

const OUT8_NUMBER = Number(OUT8);
const digestOf = (values) => createHash('sha256').update(values.map(String).join(','), 'utf8').digest('hex');

// 值数组的排版：每行 PER_LINE 个；closePad 是收尾 ] 的缩进。
function block(values, closePad) {
  const itemPad = `${closePad} `;
  const rows = [];
  for (let i = 0; i < values.length; i += PER_LINE) rows.push(itemPad + values.slice(i, i + PER_LINE).join(', '));
  return `[\n${rows.join(',\n')}\n${closePad}]`;
}

export function generate() {
  const normalQuantile = buildNormalQuantile();
  const expInt = buildExpInt();
  const expFrac = buildExpFrac(expInt);
  const det = detNumericText();
  const text = `{
 "generatedBy": "tools/gen-det-tables.mjs",
 "note": "expInt 的值是十进制字串（e^k×10⁸ 超出 2⁵³）；expFrac 与 normalQuantile 是 JSON 数。sha256 对 values.map(String).join(',') 的 UTF-8 字节。",
 "normalQuantile": {
  "scale": ${OUT_Z_SCALE},
  "sha256": "${digestOf(normalQuantile)}",
  "values": ${block(normalQuantile, '  ')}
 },
 "expTable": {
  "scale": ${OUT_EXP_SCALE},
  "expInt": {
   "kMin": ${EXP_MIN},
   "kMax": ${EXP_MAX},
   "sha256": "${digestOf(expInt)}",
   "values": ${block(expInt.map((v) => JSON.stringify(v)), '   ')}
  },
  "expFrac": {
   "steps": ${FRAC_STEPS},
   "sha256": "${digestOf(expFrac)}",
   "values": ${block(expFrac, '   ')}
  }
 }
}
`;
  return { text, detText: det.text, counts: { normalQuantile: normalQuantile.length, expInt: expInt.length, expFrac: expFrac.length, ...det.counts } };
}

function targetPath() {
  return join(repoRoot(), 'world', 'ontology', 'dimensions', safeSegment(FILE));
}

function detTargetPath() {
  return join(repoRoot(), 'world', 'rules', 'tables', safeSegment(DET_FILE));
}

function main(argv) {
  const { text, detText, counts } = generate();
  const file = targetPath();
  const detFile = detTargetPath();
  const same = existsSync(file) && readFileSync(file, 'utf8') === text;
  const detSame = existsSync(detFile) && readFileSync(detFile, 'utf8') === detText;
  const summary = `${counts.normalQuantile}/${counts.expInt}/${counts.expFrac}/${counts.sin}/${counts.cos}/${counts.atan}`;
  if (argv.includes('--check')) {
    process.stdout.write(same && detSame
      ? `det tables up to date (${summary})\n`
      : 'det tables differ from the generated tables (run node tools/gen-det-tables.mjs)\n');
    return same && detSame ? 0 : 1;
  }
  if (!same) writeFileSync(file, text);
  if (!detSame) writeFileSync(detFile, detText);
  process.stdout.write(same && detSame ? 'unchanged\n' : 'written\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = main(process.argv.slice(2));
