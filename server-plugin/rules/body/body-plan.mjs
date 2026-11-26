// 身体图（卷四 §2.2 :190–:202、§4.2）：加载期不变量 checkBodyPlans，与物种、身体、尸体三个读入口共用的身体图读法（表 kind、结构基值、组织份额）。
// 只按表头与行数据判，不认任何具体物种、身体图、部位、组织或能力代号；映射一律经 presentEntries 遍历（契约 ctr_map_nonnull_view），null 键不进。
// 数值一律定点（kernel/det-math.mjs，标度来自 rules.kernelConstants）；「和 = 1」即定点和等于 fixedScale()。
import { KernelError } from '../../kernel/errors.mjs';
import { dim, presentEntries } from '../../kernel/dimensions.mjs';
import { fixedUnits, fixedAdd, fixedScale } from '../../kernel/det-math.mjs';
import { ruleValue } from '../load/registry.mjs';

/**
 * 读入口用到的 engine 部分（装配层 rules/load/mount.mjs 建）。
 * @typedef {{registry: {tables: Map<string, unknown>, kindIds: Map<string, {idPrefix?: readonly string[], singletonIds?: readonly string[]}>, kindOfLoaded?: (id: string) => string}, docData: Parameters<typeof ruleValue>[0], vocab: unknown, modifierSources: ReadonlyArray<Function>}} BodyEngine
 */
/**
 * 身体图的一个部位（卷四 §2.2 parts 的 struct）。
 * @typedef {{id: string, parent: string | null, sizeFraction: number, contributes: Record<string, number | null>, vital: boolean, tissueOverride?: Record<string, string | null> | null}} Part
 */

// 物种表的 kind（卷四 §2.1）；身体图表的 kind 与能力族名都从表头的 ref 声明取，不写代号。
export const SPECIES_KIND = 'species';
// 卷四 §2.1、§2.2 的维度名（卷文定义，非数值、非种类代号）。
export const DIM = Object.freeze({ bodyPlan: 'bodyPlan', tissues: 'tissues', parts: 'parts', tissueFractions: 'tissueFractions' });

/** 某 kind 的维度表文档（没有即 E-DIM-REF-MISSING）。 @param {BodyEngine} engine @param {string} kind @returns {Record<string, unknown>} */
export function tableOf(engine, kind) {
  const doc = engine && engine.registry && engine.registry.tables instanceof Map ? engine.registry.tables.get(kind) : undefined;
  if (doc === null || typeof doc !== 'object') throw new KernelError('E-DIM-REF-MISSING', {}, `kind ${JSON.stringify(kind)}: no dimension table`);
  return Object(doc);
}

/** 某表表头一维度的声明（没有即空对象）。 @param {BodyEngine} engine @param {string} kind @param {string} dimension @returns {Record<string, unknown>} */
export function headerOf(engine, kind, dimension) {
  const defs = Object(tableOf(engine, kind).dimensions);
  return Object.hasOwn(defs, dimension) ? Object(defs[dimension]) : {};
}

/** 身体图表的 kind：物种表头 bodyPlan 维度的 ref kind（卷四 §2.1）。 @param {BodyEngine} engine @returns {string} */
export function planKindOf(engine) {
  const kind = headerOf(engine, SPECIES_KIND, DIM.bodyPlan).kind;
  if (typeof kind !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `species.${DIM.bodyPlan}: header must declare a ref kind`);
  return kind;
}

/** 能力族名：身体图表头 parts.contributes 的键声明（卷四 §2.2）。 @param {BodyEngine} engine @returns {string} */
function capabilityFamilyOf(engine) {
  const fam = Object(Object(Object(Object(headerOf(engine, planKindOf(engine), DIM.parts).of).fields).contributes).key).vocab;
  if (typeof fam !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${DIM.parts}.contributes: header must declare a vocab key`);
  return fam;
}

/** 映射的非 null 键（码点序）。 @param {unknown} map @returns {string[]} */
export const presentKeys = (map) => presentEntries(map).map(([k]) => k);

/** 定点零（空和）。 @returns {bigint} */
export const fixedZero = () => fixedUnits(0);

const shape = (/** @type {string} */ planId, /** @type {string} */ why) => new KernelError('E-BODY-PLAN-SHAPE', {}, `body plan ${JSON.stringify(planId)}: ${why}`);

/**
 * 一张身体图的不变量（卷四 :202、:197）：恰一个根；父部位都在图内；无环且链深（链上部位数）≤ maxDepth；同一 id 不重复；
 * sizeFraction 之和 = 1；每个能力的贡献之和为 0 或 1；至少一个 vital；tissueOverride 的非 null 键 ⊆ tissueFractions 的非 null 键；
 * tissueFractions 非 null 份额之和 = 1（非 null 键集为空即显式空映射，另由物种侧核配对）。违者 E-BODY-PLAN-SHAPE。
 * @param {string} planId @param {unknown} parts @param {unknown} fractions @param {number} maxDepth
 */
function checkPlan(planId, parts, fractions, maxDepth) {
  const one = fixedScale();
  if (!Array.isArray(parts)) throw shape(planId, 'parts must be a list');
  /** @type {Map<unknown, Record<string, unknown>>} */
  const byId = new Map(parts.map((p) => [Object(p).id, Object(p)]));
  if (byId.size !== parts.length) throw shape(planId, 'duplicate part id');
  if (parts.filter((p) => Object(p).parent === null).length !== 1) throw shape(planId, 'must have exactly one root part');
  /** @type {Map<string, bigint>} */
  const contrib = new Map();
  let size = fixedZero();
  const tissueKeys = new Set(presentKeys(fractions));
  for (const p of byId.values()) {
    let depth = 1;
    for (let at = p; at.parent !== null; at = Object(byId.get(at.parent))) {
      if (!byId.has(at.parent)) throw shape(planId, `part ${JSON.stringify(p.id)}: parent not in plan`);
      depth += 1;
      if (depth > maxDepth) throw shape(planId, `part ${JSON.stringify(p.id)}: chain deeper than ${maxDepth} or cyclic`);
    }
    size = fixedAdd(size, fixedUnits(Number(p.sizeFraction)));
    for (const [cap, w] of presentEntries(p.contributes)) contrib.set(cap, fixedAdd(contrib.get(cap) ?? fixedZero(), fixedUnits(Number(w))));
    if (p.tissueOverride !== null && p.tissueOverride !== undefined && !presentKeys(p.tissueOverride).every((t) => tissueKeys.has(t))) {
      throw shape(planId, `part ${JSON.stringify(p.id)}: tissueOverride keys must be within tissueFractions`);
    }
  }
  if (size !== one) throw shape(planId, 'sizeFraction must sum to 1');
  for (const [cap, sum] of contrib) if (sum !== fixedZero() && sum !== one) throw shape(planId, `capability ${JSON.stringify(cap)}: contributions must sum to 0 or 1`);
  if (!parts.some((p) => Object(p).vital === true)) throw shape(planId, 'needs at least one vital part');
  const tf = presentEntries(fractions);
  if (tf.length > 0 && tf.reduce((acc, [, v]) => fixedAdd(acc, fixedUnits(Number(v))), fixedZero()) !== one) throw shape(planId, 'tissueFractions must sum to 1');
}

/**
 * 加载期核全部身体图与物种的身体配对（卷四 :202、:197、:144）：每张身体图过 checkPlan；每个物种行的 bodyPlan 须是已登记的身体图行（E-DIM-REF-MISSING），
 * 其 tissues 的非 null 键集须等于该图 tissueFractions 的非 null 键集（E-BODY-TISSUE-KEYS；契约 ctr_map_nonnull_view：仅在 null 键上不同的两份数据都通过）。
 * 链深上限读 rules.kernelConstants.bodyPartChainMaxDepth。行值经 dim 读（实体行 → 类别行 → 表默认值；加载期无偏离行，state 交 null）。
 * @param {BodyEngine} engine
 */
export function checkBodyPlans(engine) {
  const planKind = planKindOf(engine);
  const maxDepth = Number(ruleValue(engine.docData, 'kernelConstants', 'bodyPartChainMaxDepth'));
  const plans = Object(tableOf(engine, planKind).rows);
  for (const planId of Object.keys(plans)) {
    checkPlan(planId, dim(engine, null, planKind, planId, DIM.parts).value, dim(engine, null, planKind, planId, DIM.tissueFractions).value, maxDepth);
  }
  for (const speciesId of Object.keys(Object(tableOf(engine, SPECIES_KIND).rows))) {
    const planId = dim(engine, null, SPECIES_KIND, speciesId, DIM.bodyPlan).value;
    if (!Object.hasOwn(plans, planId)) throw new KernelError('E-DIM-REF-MISSING', {}, `species ${JSON.stringify(speciesId)}: body plan ${JSON.stringify(planId)} not registered`);
    const want = presentKeys(dim(engine, null, planKind, planId, DIM.tissueFractions).value);
    const got = presentKeys(dim(engine, null, SPECIES_KIND, speciesId, DIM.tissues).value);
    if (want.length !== got.length || !want.every((t, i) => t === got[i])) {
      throw new KernelError('E-BODY-TISSUE-KEYS', {}, `species ${JSON.stringify(speciesId)}: non-null tissues keys must equal body plan ${JSON.stringify(planId)} non-null tissueFractions keys`);
    }
  }
}

/**
 * 结构基值（卷四 B-1）：能力族每个条目（经世界数据 _vocab 的能力族；键取条目 dimKey，即表头 capabilities 段的键）在给定部位上的贡献之和。
 * 本图没有部位贡献的能力为 0（卷四 :202）。返回 dimKey → {cap: 条目代号, base: 定点和, limitedBy: 条目的限制者映射（卷四 B-5）}。
 * @param {BodyEngine} engine @param {ReadonlyArray<Part>} parts @returns {Map<string, {cap: string, base: bigint, limitedBy: unknown}>}
 */
export function structuralBase(engine, parts) {
  const fam = capabilityFamilyOf(engine);
  const families = Object(Object(engine.vocab).families);
  if (!Object.hasOwn(families, fam)) throw new KernelError('E-DIM-REF-MISSING', {}, `vocab family ${JSON.stringify(fam)}: not loaded (world data _vocab.json)`);
  /** @type {Map<string, {cap: string, base: bigint, limitedBy: unknown}>} */
  const out = new Map();
  for (const [cap, entry] of presentEntries(Object(families[fam]).entries)) {
    const key = Object(entry).dimKey;
    if (typeof key !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `capability ${JSON.stringify(cap)}: entry must carry dimKey`);
    const base = parts.reduce((acc, p) => {
      const w = presentEntries(p.contributes).find(([c]) => c === cap);
      return w === undefined ? acc : fixedAdd(acc, fixedUnits(Number(w[1])));
    }, fixedZero());
    out.set(key, { cap, base, limitedBy: Object(entry).limitedBy });
  }
  return out;
}
