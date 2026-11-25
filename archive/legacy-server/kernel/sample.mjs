// 随机实例化（卷二 §1.10 :305–:331）与骰值键（卷二十七 R27-8.5 :721–:733；卷一 §8.2 :637–:638）。
// 本文件是 kernelApi `sample`（卷二 §2.7 :579）：h_i/u 取数、首批分布求值与参数校验在这里；
// 种子键、h_i 输入串与骰值键的拼接一律在 kernel/handles/keys.mjs（卷二 §2.8 :852），这里只调用。
// 采样是纯函数（:328）：不写状态、不读墙钟、不共享随机流；同 (template.seed, kind, id, dim) 永远同值。
// 摘要只经注入的 DigestCap（卷二 §2.9 :984，kernel 不 import node:crypto），复用 kernel/save.mjs 的 sha256Text。
// 定点算术用 kernel/det-math.mjs（同一标度、同一种截断），不另写一份。

import { KernelError } from './errors.mjs';
import { sha256Text } from './save.mjs';
import { fixedUnits, fixedAdd, fixedDivide, fixedScale, truncateTo, fixedToNumber, fixedExp, fixedSqrtInt, fixedUnits8 } from './det-math.mjs';
import { CODE_RE } from './handles/vocab-handle.mjs';
import { KEY_RE, T } from './validate/types.mjs';
import { isHex64, seedKeyText, seedHashText, diceKeyText, orderKeyText } from './handles/keys.mjs';

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

// 本模块要读的内核常数：表代号与常数键（卷二 §7 S10 :2407；值登记在 world/rules/tables/kernel-constants.json）。
const SCHEMA = Object.freeze({
  constantsTable: 'kernelConstants',
  maxQualifiersKey: 'diceKeyMaxQualifiers',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isInt = (v) => Number.isSafeInteger(v);

// 骰值键限定成分个数上限：加载期从规则表收下（与 installScheduler 同法），代码里不写字面量。
/** @type {number | null} */
let installedMaxQualifiers = null;

/**
 * 加载期收下 kernelConstants.diceKeyMaxQualifiers（卷二 :2407 数值来自 engine.rules 即不计；卷二十七 R27-8.5 :728）。
 * @param {Record<string, any>} rules engine.rules
 * @returns {void}
 */
export function installSampleConstants(rules) {
  const v = isObj(rules) && isObj(rules[SCHEMA.constantsTable]) ? rules[SCHEMA.constantsTable][SCHEMA.maxQualifiersKey] : undefined;
  installedMaxQualifiers = Number.isInteger(v) ? v : null;
}

function diceKeyMaxQualifiers() {
  if (installedMaxQualifiers === null) throw new Error(`kernel/sample.mjs: rules.${SCHEMA.constantsTable}.${SCHEMA.maxQualifiersKey} missing (load order)`);
  return installedMaxQualifiers;
}

// normal 分位数表（卷二 §1.10 :324）：4097 点、4 位定点、两端钳 ±3.9000；离线生成、运行期只读（卷二十七 R27-5.2）。
/** @type {null | bigint[]} */
let normalQuantile = null;

/**
 * 加载期收下 _distributions.json.normalQuantile（4 位定点表，点数须为 2 的幂加一）。
 * @param {{normalQuantile: {scale: number, values: number[]}}} doc
 * @returns {void}
 */
export function installSampleDistributions(doc) {
  const q = doc && doc.normalQuantile;
  const values = q && Array.isArray(q.values) ? q.values : null;
  const bad = (m) => { throw new KernelError('E-DIM-STRUCT-FIELD', {}, `_distributions.json normalQuantile: ${m}`); };
  if (!values || values.length < 1 || (values.length & 1) !== 1) bad('values must be an odd-length array');
  const points = BigInt(values.length - 1);
  if ((points & (points - 1n)) !== 0n) bad('values.length - 1 must be a power of two');
  if (Number(q.scale) !== Number(fixedScale())) bad('scale must equal SCALE');
  if (!values.every((v) => Number.isSafeInteger(v))) bad('values must be integers');
  normalQuantile = Object.freeze(values.map((v) => BigInt(v)));
}

function quantileTable() {
  if (normalQuantile === null) throw new KernelError('E-DIM-STRUCT-FIELD', {}, '_distributions.json normalQuantile missing (load order: installSampleDistributions)');
  return normalQuantile;
}

function bitLength(v) {
  let n = 0;
  let x = v;
  while (x > 0n) { x >>= 1n; n += 1; }
  return n;
}

const paramError = (detail) => new KernelError('E-DIM-SAMPLE-PARAM', {}, detail);
const componentError = (detail) => new KernelError('E-SEED-COMPONENT', {}, detail);
// 骰值键复合对象段里取值为空的限定成分的填充代号（卷二 §2.9 第 0 条"内核信号代号"小族登记；卷二十七 R27-8.5 :730）。
const EMPTY_SEEDPART = 'nil_seedpart';

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
  // 维度键按卷二 §1.9 :284 的 lowerCamel 文法（`bodyMassKg` 合、`body_mass` 不合），与代号文法不同。
  if (typeof dimension !== 'string' || !KEY_RE.test(dimension)) throw paramError(`dimension ${JSON.stringify(dimension)}: want ^[a-z][a-zA-Z0-9]{0,47}$`);
  if (group !== undefined && (typeof group !== 'string' || !CODE_RE.test(group))) throw paramError(`joint group ${JSON.stringify(group)} is not a code`);
  return sha256Text(seedKeyText(templateSeed, kind, instanceId, dimension, group));
}

/**
 * 身份采样的种子键（卷二 §1.10 :326：sha256(template.seed | 实体类 | 实例 id | 第四段)；卷十 R10-2.14 :431、§4.12.1 :882、R10-12.3 ④ :939：洞穴生长取
 * 实体类、体积行 id、抽取点 site.gen.cave.grow）。第四段在这里是抽取点代号（代号文法，下划线写法，如 site_gen_cave_grow），不是维度键，所以与 seedKeyFor 分开、不放宽它。
 * stream、site 是调用处的字面量（seed-keys.json 登记行的流代号与抽取点代号，seed_sites 检测器按它们双向比对）；键里不含流代号（卷二 :326 的键串只有四段）。
 * @param {string} stream 流代号（登记用，不入键） @param {string} site 抽取点代号 @param {string} templateSeed @param {string} kind 实体类代号 @param {string} instanceId 实例 id
 * @returns {string} 64 位小写十六进制
 */
export function identitySeedKey(stream, site, templateSeed, kind, instanceId) {
  if (!isSeedTemplate(templateSeed)) throw paramError(`template.seed ${JSON.stringify(templateSeed)}: want ^[A-Za-z0-9_-]{1,64}$`);
  for (const [name, v] of [['stream', stream], ['site', site], ['kind', kind], ['instanceId', instanceId]]) {
    if (typeof v !== 'string' || !CODE_RE.test(v)) throw paramError(`${name} ${JSON.stringify(v)} is not a code`);
  }
  return sha256Text(seedKeyText(templateSeed, kind, instanceId, site));
}

/**
 * 种子之下的次序键 hash(种子, 序号...)：sha256(种子键 | 整数 | 整数)；序号是区格序号或列的整数坐标，同输入同结果，与遍历次序无关。
 * @param {string} seedKey 64 位十六进制种子键 @param {...number} parts 整数序号
 * @returns {string}
 */
export function orderKeyAt(seedKey, ...parts) {
  if (typeof seedKey !== 'string' || !isHex64(seedKey)) throw paramError(`seedKey ${JSON.stringify(seedKey)}: want 64 hex chars`);
  for (const p of parts) if (!isInt(p)) throw paramError(`order part ${JSON.stringify(p)}: want an integer`);
  return sha256Text(orderKeyText(seedKey, ...parts)); // 键串拼接在 handles/keys.mjs（卷二 :889）
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
  // 恰一个主体 id 后接零到 diceKeyMaxQualifiers 个限定成分（卷二十七 R27-8.5 :728）：超过上限即拒，
  // 位置上的空值也算位置，不省略。上限由内核常数表读入，不写字面量。
  const maxQualifiers = diceKeyMaxQualifiers();
  if (!parts || parts.length === 0 || parts.length - 1 > maxQualifiers) throw componentError(`subjectId ${JSON.stringify(subjectId)}: want an id plus 0-${maxQualifiers} qualifiers`);
  const [first, ...rawQualifiers] = parts;
  if (typeof first !== 'string' || !isQualifier(first)) throw componentError(`subjectId first component ${JSON.stringify(first)}: want a code or entity id`);
  // 复合对象段某个限定成分取值为空时，该位置填 nil_seedpart，不省略该位置（卷二十七 R27-8.5 :730）；
  // 空只认 undefined（位置存在而值缺），null 与其他非代号值照拒，不当作空成分。
  const qualifiers = rawQualifiers.map((q) => (q === undefined ? EMPTY_SEEDPART : q));
  for (const q of qualifiers) if (!isQualifier(q)) throw componentError(`subjectId qualifier ${JSON.stringify(q)}: want a registered code, entity id or fixed row ordinal`);
  if (!isInt(worldTime)) throw componentError(`worldTime ${JSON.stringify(worldTime)}: want an integer minute`);
  if (typeof drawSiteCode !== 'string' || !CODE_RE.test(drawSiteCode)) throw componentError(`drawSiteCode ${JSON.stringify(drawSiteCode)} is not a code`);
  return diceKeyText(worldSeed, streamCode, [first, ...qualifiers], worldTime, drawSiteCode);
}

/**
 * kernelApi `diceSeedKey(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)`（卷二十七 R27-8.5 :721–:733；卷十七 §3.3 :299 给地点落格的 seedKey）：
 * 骰值键五段（diceKeyOf 的五段与核对）的 sha256 十六进制串，即卷五 landCell 要的 64 位种子键；不消耗分布，只给键。同输入同结果。
 * @param {string} worldSeed @param {string} streamCode @param {string | Array<string | number>} subjectId @param {number} worldTime @param {string} drawSiteCode
 * @returns {string} 64 位小写十六进制
 */
export function diceSeedKey(worldSeed, streamCode, subjectId, worldTime, drawSiteCode) {
  return sha256Text(diceKeyOf(worldSeed, streamCode, subjectId, worldTime, drawSiteCode));
}

/**
 * 按骰值键抽一个 [0, total) 的整数（卷二十 §4.3.3 第 2 条天气抽取；键五段同 diceKeyOf）：
 * u = 骰值键的 sha256 作种子键的第 0 个 64 位均匀数（uniformAt），结果 = ⌊u × total ÷ 2^64⌋，BigInt 整除，同键同值。
 * @param {number | bigint} total 正整数 @param {string} worldSeed @param {string} streamCode @param {string | Array<string | number>} subjectId @param {number} worldTime @param {string} drawSiteCode
 * @returns {bigint}
 */
export function drawBelow(total, worldSeed, streamCode, subjectId, worldTime, drawSiteCode) {
  const t = BigInt(total);
  if (t <= 0n) throw paramError('drawBelow: total must be positive');
  const u = uniformAt(sha256Text(diceKeyOf(worldSeed, streamCode, subjectId, worldTime, drawSiteCode)), 0);
  return (u * t) / TWO64;
}

// 按骰值键取值可用的分布种类：只取消耗骰值的五种（卷二 §1.10 封卷后勘误 1121k1）；curve 无随机、joint 归卷二十六、ref 不展开，都拒。
// 种类清单只在下面的分布种类表 DIST_KINDS（byDice 栏）一处。
const drawKinds = () => Object.keys(DIST_KINDS).filter((k) => DIST_KINDS[k].byDice === true);

/**
 * kernelApi `drawByKey`（卷二 §1.10 封卷后勘误 1121k1，卷十 C10-14 ⑤；卷十 R10-2.6 场偏差与 rules.gen.* 里的分布用它取值）：
 * 键 = sha256(骰值键五段文本)（diceKeyOf 的五段，`distribution` 不是键成分）；第 0 个 64 位均匀数照 §1.10 的 h_i 展开，不另造键、无游标，
 * 与调用先后、遍历次序无关；返回 4 位定点值（精度取内核定点标度的位数），clamp 只取分布对象自带的 `clamp`，目标维度的 precision 由调用方写回时再截；categorical 返回键。
 * 不是维度表头的 `.sample`。非法分布按分布参数校验报 E-DIM-SAMPLE-PARAM、-DOMAIN、-WEIGHTS。
 * @param {string} worldSeed @param {string} streamCode @param {string | Array<string | number>} subjectId @param {number} worldTime @param {string} drawSiteCode
 * @param {Record<string, unknown>} distribution
 * @returns {number | string}
 */
export function drawByKey(worldSeed, streamCode, subjectId, worldTime, drawSiteCode, distribution) {
  validateDistribution(distribution);
  const row = kindRow(distribution.dist);
  if (row.byDice !== true) throw paramError(`drawByKey: distribution ${JSON.stringify(distribution.dist)} is not drawn by dice key (want ${drawKinds().join('|')})`);
  const seedKey = sha256Text(diceKeyOf(worldSeed, streamCode, subjectId, worldTime, drawSiteCode));
  const def = { precision: String(fixedScale()).length - 1 };
  return row.draw(seedKey, distribution, def);
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
  // 半正定：不开方的整数对称消元（RA-S9）。判定本来不需要开方，也不用浮点：每个元素先转 10⁸ 标度整数
  // （卷二十七 :634 不现算浮点、:615 只经内核定点设施），主元为负即拒；主元为 0 时该行余下元素须全为 0（否则不是半正定，卷二:325），
  // 全为 0 则无需更新后续元素；主元为正时对 i 后的每个 (j,k) 令 a[j][k] ← a[j][k]·p − a[j][i]·a[i][k]（整行同乘正数 p，不改变后续主元正负号，全程无除法）。
  const a = corr.map((row) => row.map((v) => fixedUnits8(v)));
  for (let i = 0; i < n; i++) {
    const pivot = a[i][i];
    if (pivot < 0n) throw new KernelError('E-DIM-SAMPLE-CORR', {}, 'joint: corr is not positive semidefinite');
    if (pivot === 0n) {
      for (let k = i + 1; k < n; k++) if (a[i][k] !== 0n) throw new KernelError('E-DIM-SAMPLE-CORR', {}, 'joint: corr is not positive semidefinite');
      continue;
    }
    for (let j = i + 1; j < n; j++) {
      for (let k = j; k < n; k++) {
        const v = a[j][k] * pivot - a[j][i] * a[i][k];
        a[j][k] = v;
        a[k][j] = v;
      }
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
  kindRow(dist.dist).validate(dist, dimDef, engine);
  checkClamp(dist, dimDef);
  checkTruncate(dist);
}

// truncate: [lo, hi]（卷二 §1.10 封卷后勘误 1124k81）：只有分布种类表里 truncatable 的种类可截断（categorical 无序、curve 无随机、joint 归卷二十六）；lo ≤ hi，都是数。
function checkTruncate(dist) {
  if (dist.truncate === undefined) return;
  if (kindRow(dist.dist).truncatable !== true) throw paramError(`truncate: ${dist.dist} cannot be truncated`);
  const t = dist.truncate;
  const [lo, hi, ...rest] = Array.isArray(t) ? t : [];
  if (!isNum(lo) || !isNum(hi) || rest.length > 0 || lo > hi) throw paramError('truncate must be [lo, hi] with numbers and lo <= hi');
}

// ---------- 首批分布求值 ----------

function mul(a, b) {
  return (a * b) / fixedScale();
}

// 定点值的平方根：real = v / SCALE，sqrt(real) * SCALE = sqrt(v * SCALE)。
// 开方只有 kernel/det-math.mjs 一份（整数牛顿法固定步数，步数登在 fnTables.sqrt.iterations；卷二 §1.10 :326、卷二十七 :573），
// 这里只按标度放大后调用，不另写实现、不另写步数常数。
const sqrtFixed = (v) => fixedSqrtInt(v * fixedScale());

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

// 标准正态分位数 z（10⁴ 标度）：j = u 的高位、f = 余下低位，整数线性插值（卷二 §1.10 :324）。
function normalZ(seedKey) {
  const table = quantileTable();
  const u = uniformAt(seedKey, 0);
  // 高位位数 = u 的位数 − 表区间数的位数（64 − 12 = 52），从表长与 TWO64 派生，不写 52。
  const shift = BigInt(bitLength(TWO64) - bitLength(BigInt(table.length - 1)));
  const j = Number(u >> shift);
  const f = u & ((1n << shift) - 1n);
  return table[j] + (((table[j + 1] - table[j]) * f) >> shift);
}

// 截断采样（卷二 §1.10 封卷后勘误 1124k81）：分布对象可带 truncate: [lo, hi]，按原分布的形状只在 [lo, hi] 内取值（反 CDF 截断）。
// 同一个种子键、同一个均匀数 u，不拒绝重抽、不加计数；区间内取不到值报 E-DIM-SAMPLE-PARAM。返回 10⁴ 标度定点 [lo, hi] 或 null（未截断）。
function truncateOf(dist) {
  if (dist.truncate === undefined) return null;
  return [fixedUnits(dist.truncate[0]), fixedUnits(dist.truncate[1])];
}

const noValue = (dist) => paramError(`truncate ${JSON.stringify(dist.truncate)}: the interval holds no value of ${dist.dist}`);

// 标准正态分位数表的截断：valueAt(z) 对 z 单调不减（normal 的 mean + sd×z、lognormal 的 exp(mu + sigma×z)），
// 二分找出表下标区间 [iLo, iHi]（取值落在 [lo, hi] 内的表点），再把 u 均匀映到这个下标区间上、区间内相邻两点整数线性插值（同 normalZ 的插值法）。
function truncatedZ(seedKey, dist, valueAt, tr) {
  const table = quantileTable();
  let a = 0;
  let b = table.length;
  while (a < b) { const m = (a + b) >> 1; if (valueAt(table[m]) >= tr[0]) b = m; else a = m + 1; }
  const iLo = a;
  a = 0;
  b = table.length;
  while (a < b) { const m = (a + b) >> 1; if (valueAt(table[m]) > tr[1]) b = m; else a = m + 1; }
  const iHi = a - 1;
  if (iLo > iHi) throw noValue(dist);
  if (iLo === iHi) return table[iLo];
  const shift = BigInt(bitLength(TWO64) - 1);
  const prod = uniformAt(seedKey, 0) * BigInt(iHi - iLo);
  const j = iLo + Number(prod >> shift);
  const f = prod & ((1n << shift) - 1n);
  return table[j] + (((table[j + 1] - table[j]) * f) >> shift);
}

function sampleNormal(seedKey, dist, def) {
  const mean = fixedUnits(dist.mean);
  const sd = fixedUnits(dist.sd);
  const tr = truncateOf(dist);
  const z = tr === null ? normalZ(seedKey) : truncatedZ(seedKey, dist, (zz) => mean + mul(sd, zz), tr);
  return clampAndTrunc(mean + mul(sd, z), dist, def);
}

// lognormal = exp(mu + sigma×z)：exp 只经内核 fixedExp（唯一定义），再降到 10⁴ 标度（卷二 §1.10 :325、§3.3 :1332）。
function sampleLognormal(seedKey, dist, def) {
  const mu = fixedUnits(dist.mu);
  const sigma = fixedUnits(dist.sigma);
  const valueAt = (zz) => fixedExp((mu + mul(sigma, zz)) * fixedScale()) / fixedScale();
  const tr = truncateOf(dist);
  const z = tr === null ? normalZ(seedKey) : truncatedZ(seedKey, dist, valueAt, tr);
  return clampAndTrunc(valueAt(z), dist, def);
}

function sampleUniform(seedKey, dist, def) {
  let min = fixedUnits(dist.min);
  let max = fixedUnits(dist.max);
  const tr = truncateOf(dist);
  if (tr !== null) {
    if (tr[0] > min) min = tr[0];
    if (tr[1] < max) max = tr[1];
    if (min > max) throw noValue(dist);
  }
  const v = min + ((max - min) * uniformAt(seedKey, 0)) / TWO64;
  return clampAndTrunc(v, dist, def);
}

// 三角分布的累积分布 F(x)（10⁴ 标度）：左支 (x−a)² ÷ ((c−a)(b−a))，右支 1 − (c−x)² ÷ ((c−a)(c−b))。
function triangularCdf(x, a, b, c) {
  const one = fixedScale();
  if (x <= a) return 0n;
  if (x >= c) return one;
  if (x <= b) return ((x - a) * (x - a) * one) / ((c - a) * (b - a));
  return one - ((c - x) * (c - x) * one) / ((c - a) * (c - b));
}

function sampleTriangular(seedKey, dist, def) {
  const a = fixedUnits(dist.min);
  const b = fixedUnits(dist.mode);
  const c = fixedUnits(dist.max);
  if (c === a) return clampAndTrunc(a, dist, def);
  let r = (uniformAt(seedKey, 0) * fixedScale()) / TWO64;
  const tr = truncateOf(dist);
  let lo = a;
  let hi = c;
  if (tr !== null) {
    if (tr[0] > lo) lo = tr[0];
    if (tr[1] < hi) hi = tr[1];
    if (lo > hi) throw noValue(dist);
    // 反 CDF 截断：r 从 [0, 1] 映到 [F(lo), F(hi)]。
    const fLo = triangularCdf(lo, a, b, c);
    r = fLo + (r * (triangularCdf(hi, a, b, c) - fLo)) / fixedScale();
  }
  const f = ((b - a) * fixedScale()) / (c - a);
  let v = r < f
    ? a + sqrtFixed(mul(r, mul(c - a, b - a)))
    : c - sqrtFixed(mul(fixedScale() - r, mul(c - a, c - b)));
  if (tr !== null) { if (v < lo) v = lo; if (v > hi) v = hi; }
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

// ---------- 分布种类表（模块化原则 1122：同一判断只一处；加一种分布只加一行） ----------
// 每个分布种类的全部分派都在这一张表里，别处不再按种类写 switch 或 if 链（validateDistribution、drawByKey、sample、sampleDistribution、person.mjs 的属性均值都查它）：
//   validate(dist, dimDef, engine)  参数校验，必有；
//   draw(seedKey, dist, def)        求值，没有即该种类还没有首批求值（joint、curve、ref；照旧拒、不给假值）；
//   byDice                          true = 可经 drawByKey 按骰值键取值（卷二 §1.10 封卷后勘误 1121k1：消耗骰值的五种）；
//   truncatable                     true = 可带 truncate: [lo, hi]（卷二 §1.10 封卷后勘误 1124k81；draw 自己读 truncate）；
//   mean(dist)                      闭式均值（10⁴ 标度定点），没有即没有闭式均值实现；
//   group(dist)                     joint 一次抽整个向量：种子键第四段的 joint 组名。
const DIST_KINDS = Object.freeze({
  [DIST.normal]: Object.freeze({
    validate: (dist) => { if (!isNum(dist.mean) || !isNum(dist.sd) || !(dist.sd > 0)) throw paramError('normal: mean is a number and sd > 0'); },
    draw: sampleNormal,
    byDice: true,
    truncatable: true,
    mean: (dist) => fixedUnits(dist.mean),
  }),
  [DIST.lognormal]: Object.freeze({
    validate: (dist) => { if (!isNum(dist.mu) || !isNum(dist.sigma) || !(dist.sigma > 0)) throw paramError('lognormal: mu is a number and sigma > 0'); },
    draw: sampleLognormal,
    byDice: true,
    truncatable: true,
  }),
  [DIST.uniform]: Object.freeze({
    validate: (dist) => { if (!isNum(dist.min) || !isNum(dist.max) || !(dist.min < dist.max)) throw paramError('uniform: min and max are numbers with min < max'); },
    draw: sampleUniform,
    byDice: true,
    truncatable: true,
    mean: (dist) => fixedDivide(fixedAdd(fixedUnits(dist.min), fixedUnits(dist.max)), fixedAdd(fixedScale(), fixedScale())),
  }),
  [DIST.triangular]: Object.freeze({
    validate: (dist) => { if (!isNum(dist.min) || !isNum(dist.mode) || !isNum(dist.max) || !(dist.min <= dist.mode && dist.mode <= dist.max)) throw paramError('triangular: min <= mode <= max'); },
    draw: sampleTriangular,
    byDice: true,
    truncatable: true,
    mean: (dist) => fixedDivide(fixedAdd(fixedAdd(fixedUnits(dist.min), fixedUnits(dist.mode)), fixedUnits(dist.max)), fixedAdd(fixedAdd(fixedScale(), fixedScale()), fixedScale())),
  }),
  [DIST.categorical]: Object.freeze({
    validate: (dist, dimDef, engine) => checkCategorical(dist, dimDef, engine),
    draw: (seedKey, dist) => sampleCategorical(seedKey, dist),
    byDice: true,
  }),
  [DIST.joint]: Object.freeze({
    validate: (dist, dimDef, engine) => {
      if (!isObj(dist.marginals)) throw paramError('joint: marginals must be an object');
      for (const k of Object.keys(dist.marginals).sort()) validateDistribution(dist.marginals[k], {}, engine);
      checkCorr(dist.corr);
    },
    group: (dist) => dist.group,
  }),
  [DIST.curve]: Object.freeze({
    validate: (dist) => { if (typeof dist.curve !== 'string' || typeof dist.x !== 'string') throw paramError('curve: curve and x must be dimension names'); },
  }),
  [DIST.ref]: Object.freeze({
    validate: (dist) => { if (typeof dist.name !== 'string') throw paramError('ref: name must be a string'); },
  }),
});

// 查分布种类表；不在表里的种类一律 E-DIM-SAMPLE-PARAM。
function kindRow(kind) {
  if (typeof kind !== 'string' || !Object.hasOwn(DIST_KINDS, kind)) throw paramError(`unknown distribution ${JSON.stringify(kind)}`);
  return DIST_KINDS[kind];
}

/**
 * 分布的闭式均值（10⁴ 标度定点）：查分布种类表的 mean 栏；该种类没有闭式均值实现返回 null（调用方按各自约定报错，不编值）。
 * 卷四 §4.12 G-3"各项基数 = 所选物种该属性分布的均值"经 person.mjs 的 speciesAttributeMeans 用它。
 * @param {Record<string, unknown>} dist 分布对象 @returns {bigint | null}
 */
export function distributionMeanFixed(dist) {
  if (typeof dist.dist !== 'string' || !Object.hasOwn(DIST_KINDS, dist.dist)) return null;
  const row = DIST_KINDS[dist.dist];
  return row.mean === undefined ? null : row.mean(dist);
}

function defOf(engine, kind, dim) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  const dims = t && t.doc && t.doc.dimensions;
  return dims && Object.hasOwn(dims, dim) ? dims[dim] : undefined;
}

/**
 * kernelApi `sample(engine, kind, id, dim)`（卷二 §1.10 :328、§2.7 :579）：纯函数，返回该维度的采样值，不写状态。
 * 种子取自世界模板参数 `engine.template.seed`（卷十 R10-12.5 的世界模板参数，存档）；无分布、种子不合文法即拒。
 * 首批求值：normal、lognormal、uniform、triangular、categorical（normal/lognormal 读 _distributions.json 的冻结表，
 * lognormal 的 exp 只经 kernel/det-math.mjs 的 fixedExp）；curve/ref 的分布表、joint 的向量求值在卷二十六落
 * （卷二 :318 "joint 只定格式，卷二十六实现"），此处先过参数校验，求值待表。
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
  const row = kindRow(dist.dist);
  return drawFrom(engine, kind, id, dim, dist, def, row.group === undefined ? undefined : row.group(dist));
}

/**
 * kernelApi `sampleDistribution(engine, kind, id, dim, dist, key)`（卷二 §1.10 :305–:331；卷四 §4.10 P-4）：按调用方给的分布对象采样，
 * 种子键仍是 (template.seed, kind, id, dim)，其余同 `sample`。用于分布不挂在被采样维度表头 `sample` 上、而来自别处的情形
 * （个体的成年体重、寿命、属性、外貌轴取自物种行的分布，卷四 §2.1、§2.3）；精度与取值域读 dim 在 kind 表头里的定义（map 维度读其值定义）。
 * map 维度逐键采样时用 `key`（代号）：种子键第四段写 `joint:<key>`，与 joint"整组一次抽"同一写法，不同键得不同种子键（一键一抽）。
 * 纯函数，不写状态；joint、curve、ref 分布没有首批求值，照旧拒（不静默给值）。
 * @param {any} engine @param {string} kind @param {string} id @param {string} dim @param {any} dist @param {string | undefined} key
 * @returns {number | string}
 */
export function sampleDistribution(engine, kind, id, dim, dist, key) {
  const def = defOf(engine, kind, dim);
  if (!def) throw new KernelError('E-DIM-REF-MISSING', {}, `${JSON.stringify(kind)}.${JSON.stringify(dim)}: no dimension definition`);
  return drawFrom(engine, kind, id, dim, dist, isObj(def.value) && def.type === T.type.map ? def.value : def, key);
}

function drawFrom(engine, kind, id, dim, dist, def, group) {
  validateDistribution(dist, def, engine);
  const templateSeed = engine && engine.template ? engine.template.seed : undefined;
  if (!isSeedTemplate(templateSeed)) throw paramError(`template.seed ${JSON.stringify(templateSeed)}: want ^[A-Za-z0-9_-]{1,64}$`);
  if (typeof id !== 'string' || !CODE_RE.test(id)) throw paramError(`id ${JSON.stringify(id)} is not a code`);
  if (group !== undefined && (typeof group !== 'string' || !CODE_RE.test(group))) throw paramError(`joint group ${JSON.stringify(group)} is not a code`);
  const seedKey = seedKeyFor(templateSeed, kind, id, dim, group);
  const row = kindRow(dist.dist);
  // 没有 draw 的种类（joint、curve、ref）求值依赖冻结表/内核原语，分别由卷二十六落地；这里不静默给假值。
  if (row.draw === undefined) throw new Error(`kernel/sample.mjs: distribution ${dist.dist} evaluation needs its frozen tables (vol2 :318, vol27 R27-8) not yet built`);
  return row.draw(seedKey, dist, def);
}
