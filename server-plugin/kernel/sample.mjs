// 随机实例化（卷二 §1.10 :305–:331）与骰值键（卷二十七 R27-8.5 :721–:733；卷一 §8.2 :637–:638）。
// 本文件是 kernelApi `sample`（卷二 §2.7 :579）：h_i/u 取数、首批分布求值与参数校验在这里；
// 种子键、h_i 输入串与骰值键的拼接一律在 kernel/handles/keys.mjs（卷二 §2.8 :852），这里只调用。
// 采样是纯函数（:328）：不写状态、不读墙钟、不共享随机流；同 (template.seed, kind, id, dim) 永远同值。
// 摘要只经注入的 DigestCap（卷二 §2.9 :984，kernel 不 import node:crypto），复用 kernel/save.mjs 的 sha256Text。
// 定点算术用 kernel/det-math.mjs（同一标度、同一种截断），不另写一份。

import { KernelError } from './errors.mjs';
import { sha256Text } from './save.mjs';
import { fixedUnits, fixedScale, truncateTo, fixedToNumber } from './det-math.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { isHex64, seedKeyText, seedHashText, diceKeyText } from './handles/keys.mjs';

// 分布种类（卷二 §1.10 :307–:316 的 `dist` 取值，单一定义源；别处只引用）。
const DIST = Object.freeze({
  normal: 'normal',
  lognormal: 'lognormal',
  uniform: 'uniform',
  triangular: 'triangular',
  categorical: 'categorical',
  curve: 'curve',
  joint: 'joint',
  ref: 'ref',
});

// 种子模板字符集（卷二 §1.10 :320）：单一定义源，长度上限即字符集的字符数，不另写字面量 64。
// 键串拼接在 handles/keys.mjs（卷二 §2.8 :852），这里只做文法核对和 sha256。
const SEED_CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';
const SEED_MAX = SEED_CHARS.split('').length;
const HEX_PREFIX = '0x';
// 64 位均匀数取 sha256 十六进制串的高 64 位：256 − 64 = 192 位（0xc0），整数右移即可，不写字面量 16。
const U_SHIFT_HEX = 'c0';
// 2^64（uniform 的 `u / 2^64`）：64 个二进制 1 的掩码加一。
const WORD_ONES = 'ffffffffffffffff';
const TWO64 = BigInt(HEX_PREFIX + WORD_ONES) + 1n;

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isSafeInteger(v);

const paramError = (detail) => new KernelError('E-DIM-SAMPLE-PARAM', {}, detail);
const componentError = (detail) => new KernelError('E-SEED-COMPONENT', {}, detail);

/** 种子模板 `template.seed` 是否合卷二 :320 的字符集（1–64 个 [A-Za-z0-9_-]）。 @param {unknown} s @returns {boolean} */
export function isSeedTemplate(s) {
  if (typeof s !== 'string' || !s.length || s.length > SEED_MAX) return false;
  for (const ch of s) if (!SEED_CHARS.includes(ch)) return false;
  return true;
}

/**
 * kernelApi 之外的内核入口（测试与 sample 用）：种子键 = sha256(utf8(种子键文本))（卷二 §1.10 :320）。
 * 键串拼接在 handles/keys.mjs 的 seedKeyText（卷二 §2.8 :852），这里做文法核对与摘要。
 * @param {string} templateSeed @param {string} kind @param {string} instanceId @param {string} dimension @param {string} [group]
 * @returns {string} 64 位小写十六进制
 */
export function seedKeyFor(templateSeed, kind, instanceId, dimension, group) {
  if (!isSeedTemplate(templateSeed)) throw paramError(`template.seed ${JSON.stringify(templateSeed)}: want ^[A-Za-z0-9_-]{1,64}$`);
  if (typeof kind !== 'string' || !CODE_RE.test(kind)) throw paramError(`kind ${JSON.stringify(kind)} is not a code`);
  if (typeof instanceId !== 'string' || !CODE_RE.test(instanceId)) throw paramError(`instanceId ${JSON.stringify(instanceId)} is not a code`);
  if (typeof dimension !== 'string' || !CODE_RE.test(dimension)) throw paramError(`dimension ${JSON.stringify(dimension)} is not a code`);
  if (group !== undefined && (typeof group !== 'string' || !CODE_RE.test(group))) throw paramError(`joint group ${JSON.stringify(group)} is not a code`);
  return sha256Text(seedKeyText(templateSeed, kind, instanceId, dimension, group));
}

/**
 * 第 i 个哈希：h_i = sha256(seedKey + "|" + i)，i 从 0 起，i=0 也再哈希一次（卷二 §1.10 :323）。
 * 输入串拼接在 handles/keys.mjs 的 seedHashText（卷二 §2.8 :852），这里做文法核对与摘要。
 * @param {string} seedKey 种子键（64 位十六进制） @param {number} i 非负整数
 * @returns {string} 64 位小写十六进制
 */
export function hashAt(seedKey, i) {
  if (typeof seedKey !== 'string' || !isHex64(seedKey)) throw paramError(`seedKey ${JSON.stringify(seedKey)}: want 64 hex chars`);
  if (!isInt(i) || i < 0) throw paramError(`i ${JSON.stringify(i)}: want a non-negative integer`);
  return sha256Text(seedHashText(seedKey, i));
}

/**
 * 第 i 个 64 位均匀数：u = BigInt("0x" + h_i.slice(0, 16))（卷二 §1.10 :323）。
 * @param {string} seedKey @param {number} i @returns {bigint}
 */
export function uniformAt(seedKey, i) {
  return BigInt(HEX_PREFIX + hashAt(seedKey, i)) >> BigInt(HEX_PREFIX + U_SHIFT_HEX);
}

// 骰值键的限定成分：登记代号、实体 id（均合代号文法）或数据行内的固定序号（非负整数）；不得是计数（R27-8.5 :730–:732）。
const isQualifier = (x) => (typeof x === 'string' && CODE_RE.test(x)) || (isInt(x) && x >= 0);

/**
 * 骰值键（卷二十七 R27-8.5 :721–:733，全书唯一写法）：恰五段
 * `(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)`，主体 id 后接一到两个限定成分、各成分用 `|` 连接。
 * 五段由构造器保证；各成分只能是代号、id、整数，空段、多余成分、计数一律拒收（E-SEED-COMPONENT）。
 * 各成分核对在本函数，键串拼接在 handles/keys.mjs 的 diceKeyText（卷二 §2.8 :852）。
 * @param {string} worldSeed 世界种子
 * @param {string} streamCode 流代号
 * @param {string | Array<string | number>} subjectId 主体 id；数组为「id + 一到两个限定成分」
 * @param {number} worldTime 世界时钟分钟数
 * @param {string} drawSiteCode 抽取点代号
 * @returns {string}
 */
export function diceKeyOf(worldSeed, streamCode, subjectId, worldTime, drawSiteCode) {
  if (!isSeedTemplate(worldSeed)) throw componentError(`worldSeed ${JSON.stringify(worldSeed)}: want ^[A-Za-z0-9_-]{1,64}$`);
  if (typeof streamCode !== 'string' || !CODE_RE.test(streamCode)) throw componentError(`streamCode ${JSON.stringify(streamCode)} is not a code`);
  const parts = typeof subjectId === 'string' ? [subjectId] : Array.isArray(subjectId) ? subjectId : null;
  const [first, q1, q2, extra] = parts || [];
  if (!parts || first === undefined || extra !== undefined) throw componentError(`subjectId ${JSON.stringify(subjectId)}: want an id plus 0-2 qualifiers`);
  if (typeof first !== 'string' || !isQualifier(first)) throw componentError(`subjectId first component ${JSON.stringify(first)}: want a code or entity id`);
  if (q1 !== undefined && !isQualifier(q1)) throw componentError(`subjectId qualifier ${JSON.stringify(q1)}: want a registered code, entity id or fixed row ordinal`);
  if (q2 !== undefined && !isQualifier(q2)) throw componentError(`subjectId qualifier ${JSON.stringify(q2)}: want a registered code, entity id or fixed row ordinal`);
  if (!isInt(worldTime)) throw componentError(`worldTime ${JSON.stringify(worldTime)}: want an integer minute`);
  if (typeof drawSiteCode !== 'string' || !CODE_RE.test(drawSiteCode)) throw componentError(`drawSiteCode ${JSON.stringify(drawSiteCode)} is not a code`);
  return diceKeyText(worldSeed, streamCode, [first, q1, q2].filter((x) => x !== undefined), worldTime, drawSiteCode);
}

// ---------- 分布参数校验（卷二 §1.10 :318） ----------

function checkCategorical(dist, dimDef, engine) {
  const w = dist.weights;
  if (!isObj(w)) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'categorical: weights must be an object');
  let total = 0;
  for (const key of Object.keys(w)) {
    const v = w[key];
    if (!Number.isInteger(v) || v < 0) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, `categorical weight ${key}=${v}: want a non-negative integer`);
    total += v;
    if (dimDef && typeof dimDef.vocab === 'string' && engine && engine.vocab && engine.vocab.index instanceof Map) {
      const rec = engine.vocab.index.get(key);
      if (!rec || rec.family !== dimDef.vocab) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, `categorical key ${key}: not an entry of vocab family ${dimDef.vocab}`);
    }
  }
  if (total <= 0) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'categorical: weights must sum above zero');
}

function checkCorr(corr) {
  if (!Array.isArray(corr) || !corr.length) throw new KernelError('E-DIM-SAMPLE-CORR', {}, 'joint: corr must be a square matrix');
  const n = corr.length;
  for (let i = 0; i < n; i++) {
    if (!Array.isArray(corr[i]) || corr[i].length !== n || !corr[i].every(isNum)) throw new KernelError('E-DIM-SAMPLE-CORR', {}, 'joint: corr must be a square numeric matrix');
    if (corr[i][i] !== 1) throw new KernelError('E-DIM-SAMPLE-CORR', {}, `joint: corr diagonal ${i} is not 1`);
    for (let j = 0; j < n; j++) if (corr[i][j] !== corr[j][i]) throw new KernelError('E-DIM-SAMPLE-CORR', {}, `joint: corr (${i},${j}) is not symmetric`);
  }
  // 半正定：Cholesky 分解，主元为负即拒（RA-S9）。
  const a = corr.map((row) => row.slice());
  for (let i = 0; i < n; i++) {
    let pivot = a[i][i];
    for (let k = 0; k < i; k++) pivot -= a[i][k] * a[i][k];
    if (pivot < 0) throw new KernelError('E-DIM-SAMPLE-CORR', {}, 'joint: corr is not positive semidefinite');
    a[i][i] = pivot > 0 ? Math.sqrt(pivot) : 0;
    for (let j = i + 1; j < n; j++) {
      let s = a[j][i];
      for (let k = 0; k < i; k++) s -= a[j][k] * a[i][k];
      a[j][i] = a[i][i] > 0 ? s / a[i][i] : 0;
    }
  }
}

function checkClamp(dist, dimDef) {
  if (dist.clamp === undefined) return;
  const cl = dist.clamp;
  if (!Array.isArray(cl) || !(cl.length > 1) || !isNum(cl[0]) || !isNum(cl[1]) || cl[0] > cl[1]) throw paramError('clamp must be [lo, hi] with lo <= hi');
  const dom = dimDef && Array.isArray(dimDef.domain) ? dimDef.domain : null;
  if (dom && dom.length > 1) {
    const lo = dom[0];
    const hi = dom[1];
    if ((lo !== null && cl[0] < lo) || (hi !== null && cl[1] > hi)) throw new KernelError('E-DIM-SAMPLE-DOMAIN', {}, `clamp ${JSON.stringify(cl)} is outside dimension domain ${JSON.stringify(dom)}`);
  }
}

/**
 * 分布对象参数校验（卷二 §1.10 :318）：normal sd>0；lognormal sigma>0；uniform min<max；triangular min≤mode≤max；
 * categorical 权重非负整数且和>0、键在枚举域（E-DIM-SAMPLE-WEIGHTS）；clamp ⊂ domain（E-DIM-SAMPLE-DOMAIN）；
 * joint corr 对称、对角 1、半正定（E-DIM-SAMPLE-CORR）；其他 E-DIM-SAMPLE-PARAM。
 * @param {Record<string, unknown>} dist 分布对象
 * @param {Record<string, unknown>} [dimDef] 维度定义（vocab/domain）
 * @param {any} [engine] 加载结果（categorical 查词表域用）
 * @returns {void}
 */
export function validateDistribution(dist, dimDef = {}, engine = null) {
  if (!isObj(dist) || typeof dist.dist !== 'string') throw paramError(`distribution ${JSON.stringify(dist)}: want an object with a dist code`);
  switch (dist.dist) {
    case DIST.normal:
      if (!isNum(dist.mean) || !isNum(dist.sd) || !(dist.sd > 0)) throw paramError('normal: mean is a number and sd > 0');
      break;
    case DIST.lognormal:
      if (!isNum(dist.mu) || !isNum(dist.sigma) || !(dist.sigma > 0)) throw paramError('lognormal: mu is a number and sigma > 0');
      break;
    case DIST.uniform:
      if (!isNum(dist.min) || !isNum(dist.max) || !(dist.min < dist.max)) throw paramError('uniform: min and max are numbers with min < max');
      break;
    case DIST.triangular:
      if (!isNum(dist.min) || !isNum(dist.mode) || !isNum(dist.max) || !(dist.min <= dist.mode && dist.mode <= dist.max)) throw paramError('triangular: min <= mode <= max');
      break;
    case DIST.categorical:
      checkCategorical(dist, dimDef, engine);
      break;
    case DIST.joint:
      if (!isObj(dist.marginals)) throw paramError('joint: marginals must be an object');
      for (const k of Object.keys(dist.marginals).sort()) validateDistribution(dist.marginals[k], {}, engine);
      checkCorr(dist.corr);
      break;
    case DIST.curve:
      if (typeof dist.curve !== 'string' || typeof dist.x !== 'string') throw paramError('curve: curve and x must be dimension names');
      break;
    case DIST.ref:
      if (typeof dist.name !== 'string') throw paramError('ref: name must be a string');
      break;
    default:
      throw paramError(`unknown distribution ${JSON.stringify(dist.dist)}`);
  }
  checkClamp(dist, dimDef);
}

// ---------- 首批分布求值 ----------

function mul(a, b) {
  return (a * b) / fixedScale();
}

// 牛顿法整数开方（向零收敛；等价于固定 32 步的结果，不写迭代次数常数）。
function isqrt(n) {
  if (n <= 1n) return n;
  let x = n;
  for (;;) {
    const y = (x + n / x) >> 1n;
    if (y >= x) return x;
    x = y;
  }
}

// 定点值的平方根：real = v / SCALE，sqrt(real) * SCALE = sqrt(v * SCALE)。
const sqrtFixed = (v) => isqrt(v * fixedScale());

function clampAndTrunc(v, dist, def) {
  const p = def.precision;
  if (!Number.isInteger(p) || p < 0) throw paramError(`dimension precision ${JSON.stringify(p)}: want 0-4`);
  let x = truncateTo(v, p);
  const range = Array.isArray(dist.clamp) ? dist.clamp : (Array.isArray(def.domain) ? def.domain : null);
  if (range && range.length > 1) {
    const lo = range[0];
    const hi = range[1];
    if (lo !== null && x < fixedUnits(lo)) x = fixedUnits(lo);
    if (hi !== null && x > fixedUnits(hi)) x = fixedUnits(hi);
  }
  return fixedToNumber(x);
}

function sampleUniform(seedKey, dist, def) {
  const min = fixedUnits(dist.min);
  const span = fixedUnits(dist.max) - min;
  const v = min + (span * uniformAt(seedKey, 0)) / TWO64;
  return clampAndTrunc(v, dist, def);
}

function sampleTriangular(seedKey, dist, def) {
  const a = fixedUnits(dist.min);
  const b = fixedUnits(dist.mode);
  const c = fixedUnits(dist.max);
  if (c === a) return clampAndTrunc(a, dist, def);
  const r = (uniformAt(seedKey, 0) * fixedScale()) / TWO64;
  const f = ((b - a) * fixedScale()) / (c - a);
  const v = r < f
    ? a + sqrtFixed(mul(r, mul(c - a, b - a)))
    : c - sqrtFixed(mul(fixedScale() - r, mul(c - a, c - b)));
  return clampAndTrunc(v, dist, def);
}

function sampleCategorical(seedKey, dist) {
  const keys = Object.keys(dist.weights).sort();
  let total = 0n;
  for (const k of keys) total += BigInt(dist.weights[k]);
  const x = uniformAt(seedKey, 0) % total;
  let acc = 0n;
  for (const k of keys) {
    acc += BigInt(dist.weights[k]);
    if (x < acc) return k;
  }
  throw paramError('categorical: no bucket matched');
}

function defOf(engine, kind, dim) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  const dims = t && t.doc && t.doc.dimensions;
  return dims && Object.hasOwn(dims, dim) ? dims[dim] : undefined;
}

/**
 * kernelApi `sample(engine, kind, id, dim)`（卷二 §1.10 :328、§2.7 :579）：纯函数，返回该维度的采样值，不写状态。
 * 种子取自世界模板参数 `engine.template.seed`（卷十 R10-12.5 的世界模板参数，存档）；无分布、种子不合文法即拒。
 * 首批求值：uniform、triangular、categorical；normal/lognormal 的冻结分位数表与 exp 表、curve/ref 的分布表、
 * joint 的向量求值分别在卷四-4 与卷二十六落（卷二 :318 "joint 只定格式，卷二十六实现"），此处先过参数校验，求值待表。
 * @param {any} engine 加载结果（tables、vocab、template）
 * @param {string} kind 实体类代号
 * @param {string} id 实例 id
 * @param {string} dim 维度名
 * @returns {number | string}
 */
export function sample(engine, kind, id, dim) {
  const def = defOf(engine, kind, dim);
  if (!def) throw new KernelError('E-DIM-REF-MISSING', {}, `${JSON.stringify(kind)}.${JSON.stringify(dim)}: no dimension definition`);
  const dist = def.sample;
  if (dist === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `${JSON.stringify(kind)}.${JSON.stringify(dim)}: dimension has no sample`);
  validateDistribution(dist, def, engine);
  const templateSeed = engine && engine.template ? engine.template.seed : undefined;
  if (!isSeedTemplate(templateSeed)) throw paramError(`template.seed ${JSON.stringify(templateSeed)}: want ^[A-Za-z0-9_-]{1,64}$`);
  if (typeof id !== 'string' || !CODE_RE.test(id)) throw paramError(`id ${JSON.stringify(id)} is not a code`);
  const group = dist.dist === DIST.joint ? dist.group : undefined;
  if (group !== undefined && (typeof group !== 'string' || !CODE_RE.test(group))) throw paramError(`joint group ${JSON.stringify(group)} is not a code`);
  const seedKey = seedKeyFor(templateSeed, kind, id, dim, group);
  switch (dist.dist) {
    case DIST.uniform: return sampleUniform(seedKey, dist, def);
    case DIST.triangular: return sampleTriangular(seedKey, dist, def);
    case DIST.categorical: return sampleCategorical(seedKey, dist);
    default:
      // 求值依赖冻结表/内核原语，分别由 4-4 与卷二十六落地；这里不静默给假值。
      throw new Error(`kernel/sample.mjs: distribution ${dist.dist} evaluation needs its frozen tables (vol2 :324-:327, vol27 R27-8) not yet built`);
  }
}
