// 骰值键采样（卷二 §1.10 :327–:346「自带 PRNG 与定点算术」「骰值键按分布取值」；卷二十七 R27-8.5 :794 骰值键五段；S1-3c 草案 §2）。
// state-owners kernelApi 登记的 kernel/sample.mjs 未建，按「未落地的 kernel/*.mjs 一律落 rules/<域>/」落在本文件（S1-3c 草案 §2）。
// 纯函数：不写状态，无游标、无计数（R27-8.3）；同五段、同分布即同值。分布按种类查一张处理表（加一种只添一项），不按种类名写分支。
// 首批实现 normal、lognormal、uniform、categorical；triangular 要整数开方表（det-numeric fnTables.sqrt）装入，随首个读者卡做，现报 E-DIM-SAMPLE-PARAM。

import { KernelError } from '../../kernel/errors.mjs';
import { GRAMMAR_TOKENS } from '../../kernel/handles.mjs';
import { LOWER_CAMEL_RE } from '../../kernel/validate/types.mjs';
import { presentEntries } from '../../kernel/dimensions.mjs';
import { fixedUnits, fixedScale, fixedAdd, fixedMultiply, fixedExp, fixedToNumber } from '../../kernel/det-math.mjs';
import { ruleValue } from '../load/registry.mjs';

// 均匀数取摘要十六进制串的前若干位（卷二 :330 h_i.slice(0,16)）；位数登记在 rules.kernelConstants.prngHexDigits（卷二 §7 S10 常数登记）。
const KC = 'kernelConstants';
const HEX_DIGITS = 'prngHexDigits';
const MAX_QUALIFIERS = 'diceKeyMaxQualifiers';
const HEX_PREFIX = '0x';
const HEX_MAX_DIGIT = 'f';
const UTF8 = 'utf8';

/**
 * 本模块读的 engine 字段：摘要能力 digestCap（卷二 :1054，规则层不 import node:crypto）与世界数据副本 docData（分位数表 distributionsDoc、规则表）。
 * @typedef {{digestCap: {sha256Hex: (data: string, encoding: 'utf8') => string}, docData: any}} SampleEngine
 */

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const paramErr = (/** @type {string} */ why) => new KernelError('E-DIM-SAMPLE-PARAM', {}, why);
const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);

/**
 * 骰值键文本（卷二 :346：worldSeed | streamCode | subjectId | worldTime | drawSiteCode；R27-8.5 复合对象段 id | 限定成分）。
 * 成分只收代号、id 与整数（R27-8.2）；限定成分一到 rules.kernelConstants.diceKeyMaxQualifiers 个；不合即 E-SEED-COMPONENT。
 * @param {SampleEngine} engine @param {number} worldSeed @param {string} stream @param {string | string[]} subject @param {number} worldTime @param {string} site
 * @returns {string}
 */
function diceKeyText(engine, worldSeed, stream, subject, worldTime, site) {
  const parts = Array.isArray(subject) ? subject : [subject];
  const maxQ = Number(ruleValue(engine.docData, KC, MAX_QUALIFIERS));
  const codes = [stream, site, ...parts];
  const ok = Number.isSafeInteger(worldSeed) && Number.isSafeInteger(worldTime) && parts.length >= 1 && parts.length - 1 <= maxQ
    && codes.every((c) => typeof c === 'string' && LOWER_CAMEL_RE.test(c));
  if (!ok) throw new KernelError('E-SEED-COMPONENT', {}, 'drawByKey: key parts must be integer seed and time, code stream/site and an id with at most diceKeyMaxQualifiers code qualifiers');
  const sep = GRAMMAR_TOKENS.joinSep;
  return [String(worldSeed), stream, parts.join(sep), String(worldTime), site].join(sep);
}

/**
 * 第 0 个均匀数（卷二 :330：h_0 = sha256(键 | 0)，键是五段文本的 sha256，取前 prngHexDigits 位十六进制）与它的取值上界（全 f 加一，即 2^(4×位数)）。
 * @param {SampleEngine} engine @param {string} key @returns {{u: bigint, range: bigint}}
 */
function uniformOf(engine, key) {
  const digits = Number(ruleValue(engine.docData, KC, HEX_DIGITS));
  const h = engine.digestCap.sha256Hex([key, String(0)].join(GRAMMAR_TOKENS.joinSep), UTF8);
  return { u: BigInt(HEX_PREFIX + h.slice(0, digits)), range: BigInt(HEX_PREFIX + HEX_MAX_DIGIT.repeat(digits)) + 1n };
}

/**
 * 标准正态分位数（卷二 :331）：normalQuantile 表按 u 线性插值，整数运算、向零截断；返回 SCALE 标度定点。
 * 表点数 n+1 时下标 j = ⌊u·n / 范围⌋、余量 f = u·n mod 范围；n = 4096 时即卷二原文的 u >> 52 与低 52 位。
 * @param {SampleEngine} engine @param {{u: bigint, range: bigint}} r @returns {bigint}
 */
function normalZ(engine, r) {
  const q = Object(Object(engine.docData).distributionsDoc).normalQuantile;
  const values = isObj(q) && Array.isArray(q.values) ? q.values : [];
  const n = values.length - 1;
  if (!(n > 0) || !Number.isSafeInteger(q.scale)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'drawByKey: world data has no _distributions.json normalQuantile table');
  const steps = BigInt(n);
  const pos = r.u * steps;
  const j = Number(pos / r.range);
  const z0 = BigInt(values[j]);
  const z = z0 + ((BigInt(values[j + 1]) - z0) * (pos % r.range)) / r.range;
  return (z * fixedScale()) / BigInt(q.scale);
}

/** 正数参数核对（normal sd、lognormal sigma > 0，卷二 :325）。 @param {Record<string, unknown>} d @param {string[]} keys @param {string} pos */
function needNums(d, keys, pos) {
  for (const k of keys) if (!isNum(d[k])) throw paramErr(`distribution ${String(d.dist)}: ${k} must be a number`);
  if (pos && !(Number(d[pos]) > 0)) throw paramErr(`distribution ${String(d.dist)}: ${pos} must be > 0`);
}

// 分布种类 → 取值（卷二 :331–:335）。数值分布返回 SCALE 标度定点（bigint），categorical 返回键（string）。
/** @type {Record<string, (engine: SampleEngine, d: Record<string, unknown>, key: string) => bigint | string>} */
const DRAW = {
  normal: (engine, d, key) => {
    needNums(d, ['mean', 'sd'], 'sd');
    return fixedAdd(fixedUnits(Number(d.mean)), fixedMultiply(fixedUnits(Number(d.sd)), normalZ(engine, uniformOf(engine, key))));
  },
  // lognormal = exp(mu + sigma×z)：exp 即内核原语 fixedExp（10⁸ = SCALE² 标度），结果降回 SCALE（卷二 :332）。
  lognormal: (engine, d, key) => {
    needNums(d, ['mu', 'sigma'], 'sigma');
    const x = fixedAdd(fixedUnits(Number(d.mu)), fixedMultiply(fixedUnits(Number(d.sigma)), normalZ(engine, uniformOf(engine, key))));
    return fixedExp(x * fixedScale()) / fixedScale();
  },
  uniform: (engine, d, key) => {
    needNums(d, ['min', 'max'], '');
    const lo = fixedUnits(Number(d.min));
    const hi = fixedUnits(Number(d.max));
    if (!(lo < hi)) throw paramErr('distribution uniform: min must be < max');
    const r = uniformOf(engine, key);
    return lo + ((hi - lo) * r.u) / r.range;
  },
  // categorical（卷二 :334）：权重须为非负整数、和 > 0（E-DIM-SAMPLE-WEIGHTS）；空值权重不参与；u mod Σw 按键码点序累加命中。
  categorical: (engine, d, key) => {
    if (!isObj(d.weights)) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'distribution categorical: weights must be a map');
    const entries = presentEntries(d.weights);
    if (!entries.every(([, w]) => Number.isSafeInteger(w) && Number(w) >= 0)) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'distribution categorical: weights must be non-negative integers');
    const total = entries.reduce((s, [, w]) => s + BigInt(Number(w)), 0n);
    if (total <= 0n) throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'distribution categorical: weights must sum to > 0');
    let left = uniformOf(engine, key).u % total;
    for (const [k, w] of entries) {
      if (left < BigInt(Number(w))) return k;
      left -= BigInt(Number(w));
    }
    throw new KernelError('E-DIM-SAMPLE-WEIGHTS', {}, 'distribution categorical: no entry hit');
  },
};

/**
 * 数值结果按分布自带的 clamp 夹取（卷二 :346：drawByKey 只取分布对象自带的 clamp）；clamp 须是两个数且 lo ≤ hi，否则 E-DIM-SAMPLE-PARAM。
 * @param {Record<string, unknown>} d @param {bigint} v @returns {bigint}
 */
function clamped(d, v) {
  if (!Object.hasOwn(d, 'clamp')) return v;
  const [a, b, ...extra] = Array.isArray(d.clamp) ? d.clamp : [];
  if (extra.length > 0 || !isNum(a) || !isNum(b) || Number(a) > Number(b)) throw paramErr('distribution clamp must be [lo, hi] numbers with lo <= hi');
  const lo = fixedUnits(Number(a));
  const hi = fixedUnits(Number(b));
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * 种子键（卷二 §1.10 :346；卷二十七 R27-8.5 五段）：键 = sha256(utf8(世界种子、流代号、对象、世界时刻、抽取点代号 五段文本))，与 drawByKey 同一取法，
 * 供按种子键求散列而不取分布值的调用方（如卷五 landCell 的 hash(seedKey, 格序号)）。实参次序同 drawByKey：流代号与抽取点代号在前，调用处写字面量。
 * @param {string} streamCode 流代号 @param {string} drawSiteCode 抽取点代号 @param {SampleEngine} engine
 * @param {number} worldSeed 世界种子 @param {string | string[]} subjectId 对象 id，或 [id, 限定成分…] @param {number} worldTime 世界分钟 @returns {string}
 */
export function seedKeyHex(streamCode, drawSiteCode, engine, worldSeed, subjectId, worldTime) {
  return engine.digestCap.sha256Hex(diceKeyText(engine, worldSeed, streamCode, subjectId, worldTime, drawSiteCode), UTF8);
}

/**
 * 种子键下的一项散列（卷五 §4.1 规则 14 landCell 的 hash(seedKey, 格序号)；取法同卷二 :330 第 i 个均匀数对「键 | i」取 sha256）：sha256(键 | 项)，项是调用方给的规范文本。
 * @param {SampleEngine} engine @param {string} seedKey 种子键（seedKeyHex 的结果或调用方给的键） @param {string} part 项 @returns {string}
 */
export function keyedHex(engine, seedKey, part) {
  return engine.digestCap.sha256Hex([seedKey, part].join(GRAMMAR_TOKENS.joinSep), UTF8);
}

/**
 * kernelApi `drawByKey`（卷二 §1.10 :346 骰值键按分布取值；卷二十七 R27-8.5 五段）：键 = (worldSeed, streamCode, subjectId, worldTime, drawSiteCode)，
 * PRNG 与分布求值照卷二 :329–:335。数值分布返回 SCALE 标度（4 位）的 JS 数，已按分布自带 clamp 夹取，调用方写回目标维度时再按该维度 precision 截断；
 * categorical 返回所中的键。只认 normal、lognormal、uniform、categorical；其余种类（含 curve、joint、ref、truncate）报 E-DIM-SAMPLE-PARAM。不写状态。
 * 实参次序：流代号与抽取点代号在前（调用处写字面量，门禁 seed_sites 与种子键登记表 rules.seedKeys 双向比对认它，卷二十七 :790），其余照卷二 :346 次序。
 * @param {string} streamCode 流代号 @param {string} drawSiteCode 抽取点代号 @param {SampleEngine} engine
 * @param {number} worldSeed 世界种子 @param {string | string[]} subjectId 对象 id，或 [id, 限定成分…]（复合对象段） @param {number} worldTime 世界分钟
 * @param {unknown} distribution 分布对象 @returns {number | string}
 */
export function drawByKey(streamCode, drawSiteCode, engine, worldSeed, subjectId, worldTime, distribution) {
  const d = Object(distribution);
  if (!isObj(distribution) || typeof d.dist !== 'string' || !Object.hasOwn(DRAW, d.dist)) throw paramErr(`drawByKey: distribution ${JSON.stringify(d.dist)} is not drawn by dice key here`);
  if (Object.hasOwn(d, 'truncate')) throw paramErr('drawByKey: truncate is not built yet');
  // 键 = sha256(utf8(五段文本))（卷二 :346）；第 i 个均匀数再对「键 | i」取 sha256（卷二 :330）。
  const key = engine.digestCap.sha256Hex(diceKeyText(engine, worldSeed, streamCode, subjectId, worldTime, drawSiteCode), UTF8);
  const v = DRAW[d.dist](engine, d, key);
  return typeof v === 'string' ? v : fixedToNumber(clamped(d, v));
}
