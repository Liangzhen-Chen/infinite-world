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
  return { text, counts: { normalQuantile: normalQuantile.length, expInt: expInt.length, expFrac: expFrac.length } };
}

function targetPath() {
  return join(repoRoot(), 'world', 'ontology', 'dimensions', safeSegment(FILE));
}

function main(argv) {
  const { text, counts } = generate();
  const file = targetPath();
  const same = existsSync(file) && readFileSync(file, 'utf8') === text;
  if (argv.includes('--check')) {
    process.stdout.write(same
      ? `det tables up to date (${counts.normalQuantile}/${counts.expInt}/${counts.expFrac})\n`
      : 'det tables differ from the generated tables (run node tools/gen-det-tables.mjs)\n');
    return same ? 0 : 1;
  }
  if (!same) writeFileSync(file, text);
  process.stdout.write(same ? 'unchanged\n' : 'written\n');
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) process.exitCode = main(process.argv.slice(2));
