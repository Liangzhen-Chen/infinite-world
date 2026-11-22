// 估值入口（卷三乙《物态类别与物品》§4.16 估值公式与稀缺度派生 V-1 至 V-8、§4.18 Y-1 货值密度、§5.2 入口 `valuation`、`scarcity`、`registerValuer`；块 6 第 6-9 张）。
// 全书估值只有这一个入口（台账 I-02）；价格形成（卷六 §4.21 `priceFor`，server-plugin/price.mjs）经它取物的内在值，别处不直读 valueBase（卷六 A6-21.1）。
// V-1 `valueBaseOf`：① 有定价配方（recipe.mjs pricingRecipeOf）→（Σ 各消耗项参考价值 + minutes × 工价）×（1 + valueAdd）÷ 基础产出件数；② 否则 massKg × 按 M-1 聚合的 valueMult × unitValue。
// V-2、V-3 `valuation`：value = valueBase（读修正后值，品质是 valueBase 上的修正项）× 材质项 × 成色项 × 新鲜项 + 装饰项；稀缺项 scarcityFactor 单独返回，不乘进 value。
// V-5 `scarcity`：ctx.supply ÷ (ctx.demandPerDay × scarcityHorizonDays)，两项由卷六传入，本文件不读账本存量；V-8：估不出就返回未知带缺口代号，不回退、不当零。
// V-7：纯函数，无随机、无写入；explain 各项按同一顺序用定点算术折叠，等于结果。纯读：只读状态与规则表。数值一律经 det-math 定点。
// 不认任何物品、材料、类别、配方、用途、角色代号；曲线与阈值只读 rules.valuation.*、rules.crafting.*、rules.quality.*。

import { KernelError } from './errors.mjs';
import { dim, modifiedWith } from './dimensions.mjs';
import { kindOf } from './vocab.mjs';
import { materialView, aggregateMaterialFor, itemView } from './item.mjs';
import { instanceRow, instanceView, instanceDeviation, itemOfResource, lotsView } from './item-state.mjs';
import { recipeView, pricingRecipeOf, groupsOf, measuringKeys, SEL, PER } from './recipe.mjs';
import { fixedUnits, fixedAdd, fixedMultiply, fixedDivide, fixedToNumber, fixedCurveAt } from './det-math.mjs';
import { buildE } from './handles/generated.mjs';

const E = buildE();

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 表、规则表与维度键（卷三乙 §2.2、§2.5；固定记号，单一定义）。
const KIND = Object.freeze({ item: 'item' });
const RT = Object.freeze({ valuation: 'valuation', crafting: 'crafting', quality: 'quality', wear: 'wear' });
const RK = Object.freeze({
  unitValue: 'unitValue', conditionCurve: 'conditionCurve', freshnessCurve: 'freshnessCurve', scarcityCurve: 'scarcityCurve', scarcityHorizonDays: 'scarcityHorizonDays',
  selectorRepresentative: 'selectorRepresentative', laborRate: 'laborRate', valueAdd: 'valueAdd', tiers: 'tiers', baselineTier: 'baselineTier',
});
const DIM = Object.freeze({ massKg: 'massKg', material: 'material', valueMult: 'valueMult', valueBase: 'valueBase', qualityTier: 'qualityTier', purports: 'purports', durability: 'durability', spoilage: 'spoilage' });
// 修正键 item.valueBase：品质表的列（卷三乙 Q-1、V-2）与修正管线的表名、维度名。
const MOD = Object.freeze({ ns: 'item', dimension: 'valueBase', key: 'item.valueBase' });
// 估值单位：valueBase 表头登记 copper（卷三乙 §2.2）；精度四位即定点标度，定点乘除本身截到这一位，不另截。
const UNIT = Object.freeze({ copper: 'copper', copperPerKg: 'copper_per_kg' });
// 估值对象的种类（模板、实例、批次、别类实体）。
const SUBJECT = Object.freeze({ template: 'template', instance: 'instance', lot: 'lot', other: 'other' });
// 词表族名（卷三乙 §2.4 quality 族）。
const FAMILY = Object.freeze({ quality: 'quality' });
// 代表值取法（rules.valuation.selectorRepresentative）：本文件实现的取法代号。
const REPRESENTATIVE = Object.freeze({ lowerMedian: 'lowerMedian' });
// 缺口代号：规则表键以 rules.<表>.<键> 写；其余是读不到的上游量或未建机制（V-8：估不出就未知带缺口，不回退）。
const GAP = Object.freeze({
  material: 'material', cycle: 'pricing_cycle', massChain: 'pricing_mass_chain_unbuilt', qtyDistribution: 'pricing_qty_distribution', yieldZero: 'pricing_yield_zero',
  requirement: 'requirement_family_unbuilt', rawForm: 'material_rawForm_unbuilt', combo: 'selector_combination_unbuilt', pool: 'substitute_pool_unbuilt',
  noMember: 'members_none', memberUnknown: 'members_value_unknown', beauty: 'item.beauty', frame: 'purports_frame_unbuilt',
  supply: 'ctx.supply', demand: 'ctx.demandPerDay', valuer: 'valuer_unregistered', valueMultZero: 'valueMult_zero',
});

const KNOWN = (value, extra = {}) => Object.freeze({ known: true, applicable: true, value, ...extra });
const UNKNOWN = (...gaps) => Object.freeze({ known: false, applicable: true, gaps: Object.freeze([...new Set(gaps)].sort(cmp)) });
const ONE = () => fixedUnits(1);
const rulesGap = (table, key) => `rules.${table}.${key}`;

function ruleOf(engine, table, key) {
  const t = isObj(engine.rules) && isObj(engine.rules[table]) ? engine.rules[table] : undefined;
  return t !== undefined && Object.hasOwn(t, key) ? t[key] : undefined;
}

const curvePoints = (c) => (Array.isArray(c) && c.length ? c.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]) : null);
const toNumber = fixedToNumber;

// 模板 id 才是物品估值的对象；别的 id 抛引用缺失。
function assertTemplate(itemId) {
  if (typeof itemId !== 'string' || kindOf(itemId) !== KIND.item) throw new KernelError('E-DIM-REF-MISSING', { entity: typeof itemId === 'string' ? itemId : null }, `${JSON.stringify(itemId)} is not an item template`);
}

// ---------- 代表值（V-1 selectorRepresentative） ----------

/**
 * 下中位数：{id, value(定点)} 列表按（value、id 字典序）升序，取第 ceil(n÷2) 个，即下标 (n − 1) 右移一位；n 为 0 返回 null。
 * @param {{id: string, value: bigint}[]} members @returns {bigint | null}
 */
function lowerMedian(members) {
  if (!members.length) return null;
  const sorted = [...members].sort((a, b) => (a.value < b.value ? -1 : a.value > b.value ? 1 : cmp(a.id, b.id)));
  return sorted[(sorted.length - 1) >> 1].value;
}

// ---------- V-1 基础价值 ----------

// 工价：laborRate 是单值（每分钟铜；卷三乙 V-1 勘误 1121k7，李白 11-21 攒批第八批第一条），不按技能阶查表，技能只经配方 minutes 与产率体现（卷十四 SK-7）；没给值按未知。
function laborRate(engine) {
  const v = ruleOf(engine, RT.crafting, RK.laborRate);
  return typeof v === 'number' ? { fixed: fixedUnits(v) } : { gaps: [rulesGap(RT.crafting, RK.laborRate)] };
}

// 一个消耗项候选的参考价值（V-1 第二段）：{fixed} 或 {gaps}。stack 是正在定价的物品链（判环防御，加载期已判）。
function termOf(engine, state, c, stack) {
  if (c.consumed === false || (Object.hasOwn(c, SEL.abilities) && !measuringKeys(c).length)) return { fixed: 0n };
  if (Object.hasOwn(c, SEL.req)) return { gaps: [GAP.requirement] };
  const keys = measuringKeys(c);
  if (keys.includes(SEL.matcats) || keys.includes(SEL.where)) return { gaps: [GAP.rawForm] };
  if (keys.length !== 1) return { gaps: [GAP.combo] };
  const qty = fixedUnits(c.qty);
  if (keys[0] === SEL.items) {
    const first = [...c.items].sort(cmp)[0];
    const v = baseOf(engine, state, first, null, stack);
    return v.known ? { fixed: fixedMultiply(fixedUnits(v.value), qty) } : { gaps: v.gaps };
  }
  if (c.per === PER.pool) return { gaps: [GAP.pool] };
  // classes：物品的类别（沿上位链展开）与所列类别相交的全部成员；piece 取成员 valueBase 的代表值，kg 取 valueBase ÷ massKg 的代表值。
  const wanted = new Set(c.classes);
  const members = [];
  const itemT = engine.tables.get(KIND.item);
  for (const id of [...itemT.flat.rows.keys()].sort(cmp)) if (itemView(engine, state, id).classes.some((k) => wanted.has(k))) members.push(id);
  if (!members.length) return { gaps: [GAP.noMember] };
  const rows = [];
  for (const id of members) {
    const v = baseOf(engine, state, id, null, stack);
    if (!v.known) return { gaps: [GAP.memberUnknown, ...v.gaps] };
    if (c.per === PER.kg) {
      const mass = dim(engine, state, KIND.item, id, DIM.massKg);
      if (!mass.known || !(mass.value > 0)) return { gaps: [GAP.memberUnknown, DIM.massKg] };
      rows.push({ id, value: fixedDivide(fixedUnits(v.value), fixedUnits(mass.value)) });
    } else rows.push({ id, value: fixedUnits(v.value) });
  }
  const how = ruleOf(engine, RT.valuation, RK.selectorRepresentative);
  if (how !== REPRESENTATIVE.lowerMedian) return { gaps: [rulesGap(RT.valuation, RK.selectorRepresentative)] };
  return { fixed: fixedMultiply(lowerMedian(rows), qty) };
}

// ① 配方成本价（沿配方图递归）。
function byRecipe(engine, state, pr, stack) {
  const rv = recipeView(engine, state, pr.id);
  const gaps = ['inputs', 'outputs', 'minutes', 'skillMin', 'yield', 'wasteFraction'].filter((k) => !rv.dims[k].known).map((k) => `recipe.${k}`);
  if (gaps.length) return UNKNOWN(...gaps);
  const out = rv.dims.outputs.value[pr.index];
  if (isObj(out) && typeof out.reaction === 'string') return UNKNOWN(GAP.massChain); // R-6 甲：件数要消耗质量与反应产率，craftOutcome 才有
  if (!isObj(out) || typeof out.qty !== 'number') return UNKNOWN(GAP.qtyDistribution);
  const r0 = fixedMultiply(fixedUnits(rv.dims.yield.value), ONE() - fixedUnits(rv.dims.wasteFraction.value));
  if (!(r0 > 0n) || !(out.qty > 0)) return UNKNOWN(GAP.yieldZero); // 加载期已拒；这里防御，不做零除
  const add = ruleOf(engine, RT.crafting, RK.valueAdd);
  if (typeof add !== 'number') return UNKNOWN(rulesGap(RT.crafting, RK.valueAdd));
  const rate = laborRate(engine);
  if (rate.gaps) return UNKNOWN(...rate.gaps);
  const groups = groupsOf(rv.dims.inputs.value);
  if (groups === null) return UNKNOWN(GAP.requirement);
  let sum = 0n;
  const termGaps = [];
  for (const g of groups) {
    if (!g.length) continue;
    const t = termOf(engine, state, g[0], stack); // 每组取第一个候选项
    if (t.gaps) termGaps.push(...t.gaps); else sum = fixedAdd(sum, t.fixed);
  }
  if (termGaps.length) return UNKNOWN(...termGaps);
  const labor = fixedMultiply(fixedUnits(rv.dims.minutes.value), rate.fixed);
  const total = fixedDivide(fixedMultiply(fixedAdd(sum, labor), ONE() + fixedUnits(add)), fixedUnits(out.qty));
  return KNOWN(toNumber(total), { unit: UNIT.copper, source: 'recipe', recipe: pr.id });
}

// ② 材料价：massKg × 按 M-1 聚合的 valueMult × unitValue；material 非 null 时用调用方给的材料组成（实例偏离，V-3 对 ② 定价者“直接用实例材料算”）。
function byMaterial(engine, state, itemId, material) {
  const unit = ruleOf(engine, RT.valuation, RK.unitValue);
  if (typeof unit !== 'number') return UNKNOWN(rulesGap(RT.valuation, RK.unitValue));
  const mass = dim(engine, state, KIND.item, itemId, DIM.massKg);
  if (!mass.known || typeof mass.value !== 'number') return UNKNOWN(DIM.massKg);
  let mult;
  try {
    mult = material === null ? materialView(engine, state, itemId, { dimensions: [DIM.valueMult] }).dims[DIM.valueMult] : aggregateMaterialFor(engine, state, itemId, material, DIM.valueMult);
  } catch (e) {
    if (isObj(e) && e.code === E.E_DIM_REQUIRED_MISSING) return UNKNOWN(DIM.material);
    throw e;
  }
  if (!mult.known || typeof mult.value !== 'number') return UNKNOWN(DIM.material);
  const total = fixedMultiply(fixedMultiply(fixedUnits(mass.value), fixedUnits(mult.value)), fixedUnits(unit));
  return KNOWN(toNumber(total), { unit: UNIT.copper, source: 'material' });
}

function baseOf(engine, state, itemId, material, stack) {
  if (stack.includes(itemId)) return UNKNOWN(GAP.cycle);
  const pr = pricingRecipeOf(engine, itemId);
  return pr === null ? byMaterial(engine, state, itemId, material) : byRecipe(engine, state, pr, [...stack, itemId]);
}

/**
 * V-1 基础价值（内在值的锚，不含品质与供需）：模板 id → Fact（铜；未知带 gaps）。读 valueBase 只经本函数与 valuation（卷六 A6-21.1）。
 * @param {any} engine @param {any} state @param {string} itemId
 * @returns {any}
 */
export function valueBaseOf(engine, state, itemId) {
  assertTemplate(itemId);
  return baseOf(engine, state, itemId, null, []);
}

/**
 * Y-1 货值密度 = valueBase ÷ massKg（铜每千克，内在值不含稀缺项）；valueBase 或质量未知则未知带缺口。
 * @param {any} engine @param {any} state @param {string} itemId
 * @returns {any}
 */
export function valueDensityOf(engine, state, itemId) {
  const v = valueBaseOf(engine, state, itemId);
  if (!v.known) return v;
  const mass = dim(engine, state, KIND.item, itemId, DIM.massKg);
  if (!mass.known || !(mass.value > 0)) return UNKNOWN(DIM.massKg);
  return KNOWN(toNumber(fixedDivide(fixedUnits(v.value), fixedUnits(mass.value))), { unit: UNIT.copperPerKg });
}

// ---------- V-5 稀缺度 ----------

/**
 * V-5 稀缺度 = ctx.supply ÷（ctx.demandPerDay × scarcityHorizonDays）（覆盖天数比，越小越稀缺）。supply、demandPerDay 由卷六传入，本函数不读账本；
 * 未传、日需求未知或为 0 都按未知（不做除法、不取端点、不用常数代替），一律按 V-3“未知即不乘并记缺口”。传入值是负数或非有限数抛 E-DIM-DOMAIN-RANGE。
 * @param {any} engine @param {any} state @param {string} itemId @param {{supply?: number | null, demandPerDay?: number | null}} [ctx]
 * @returns {any}
 */
export function scarcity(engine, state, itemId, ctx = {}) {
  assertTemplate(itemId);
  const c = isObj(ctx) ? ctx : {};
  for (const k of ['supply', 'demandPerDay']) {
    const v = c[k];
    if (v !== undefined && v !== null && !(typeof v === 'number' && Number.isFinite(v) && v >= 0)) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `scarcity ctx.${k} is a non-negative finite number`);
  }
  const days = ruleOf(engine, RT.valuation, RK.scarcityHorizonDays);
  if (!Number.isSafeInteger(days) || days < 1) return UNKNOWN(rulesGap(RT.valuation, RK.scarcityHorizonDays));
  const gaps = [];
  if (c.supply === undefined || c.supply === null) gaps.push(GAP.supply);
  if (c.demandPerDay === undefined || c.demandPerDay === null || c.demandPerDay === 0) gaps.push(GAP.demand);
  if (gaps.length) return UNKNOWN(...gaps);
  const denom = fixedMultiply(fixedUnits(c.demandPerDay), fixedUnits(days));
  if (!(denom > 0n)) return UNKNOWN(GAP.demand); // 日需求小到定点截成 0：同样不做除法
  return KNOWN(fixedToNumber(fixedDivide(fixedUnits(c.supply), denom)), { unit: 'dimensionless' });
}

// 曲线取值（定点）；曲线未给按未知带规则表缺口。返回 {fixed} 或 {gaps}。
function lookupRule(engine, key, x) {
  const pts = curvePoints(ruleOf(engine, RT.valuation, key));
  return pts === null ? { gaps: [rulesGap(RT.valuation, key)] } : { fixed: fixedCurveAt(pts, fixedUnits(x)) };
}

// ---------- V-2、V-3 估值 ----------

/** 别类实体的估值器登记（V-8、§4.16.2 registerValuer）：kind → fn(engine, state, subjectRef, ctx) → {value, scarcityFactor, explain}。 */
const valuers = new Map();

/**
 * kernelApi `registerValuer(kind, fn)`：别类实体（地产、合同债权、牲畜等）的估值器登记到同一入口，公式归登记它的卷。同一 kind 登记两次即 E-WRITER-DUPLICATE。
 * @param {string} kind @param {(engine: any, state: any, subjectRef: any, ctx: any) => any} fn
 */
export function registerValuer(kind, fn) {
  if (typeof kind !== 'string' || !kind) throw new KernelError('E-DIM-ID-FORMAT', {}, 'registerValuer: kind is a non-empty table kind');
  if (typeof fn !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `registerValuer ${kind}: fn must be a function`);
  if (valuers.has(kind)) throw new KernelError('E-WRITER-DUPLICATE', {}, `registerValuer: ${kind} already registered`);
  valuers.set(kind, fn);
}

/** 测试与重新挂接用：清掉已登记的别类估值器。 */
export function resetValuers() {
  valuers.clear();
}

const createdMaterial = (state, id) => {
  const m = instanceDeviation(state, id, DIM.material);
  return Array.isArray(m) ? m : null;
};

// 估值对象规整：模板、实例（itemInstances 行）、批次引用（lotRef）；别类实体 {other: kind}。
function subjectOf(engine, state, ref) {
  if (typeof ref === 'string') {
    const row = instanceRow(state, ref);
    if (row !== undefined) return { type: SUBJECT.instance, id: ref, template: row.template, quality: typeof row[DIM.qualityTier] === 'string' ? row[DIM.qualityTier] : null, purports: row[DIM.purports], material: createdMaterial(state, ref) };
    const kind = kindOf(ref);
    return kind === KIND.item ? { type: SUBJECT.template, template: ref } : { type: SUBJECT.other, kind };
  }
  if (isObj(ref) && isObj(ref.account) && typeof ref.lotKey === 'string') {
    const { holder, purpose, kind } = ref.account;
    const template = itemOfResource(engine, kind);
    if (template === null) throw new KernelError('E-DIM-REF-MISSING', {}, `resource kind ${String(kind)} has no item (lotRef)`);
    const lot = lotsView(engine, state, holder, template, purpose).find((l) => l.lotKey === ref.lotKey);
    if (lot === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `lot ${ref.lotKey} has no non-empty batch`);
    const a = lot.attrs;
    return { type: SUBJECT.lot, template, qty: lot.qty, quality: typeof a[DIM.qualityTier] === 'string' ? a[DIM.qualityTier] : null, purports: a[DIM.purports], material: Array.isArray(a[DIM.material]) ? a[DIM.material] : null, spoilage: lot.spoilage };
  }
  throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'valuation subjectRef is an id or a lotRef {account: {holder, purpose, kind}, lotKey}');
}

// 品质修正（Q-1：每个键一条 stage:mul 的 unpenalized 修正，经唯一管线 modifiedWith；本入口只给 item.valueBase 一列）。
function applyQuality(engine, state, template, tier, base) {
  const tiers = ruleOf(engine, RT.quality, RK.tiers);
  if (!Array.isArray(tiers)) return { gaps: [rulesGap(RT.quality, RK.tiers)] };
  const row = tiers.find((r) => r.tier === tier && r.key === MOD.key);
  if (row === undefined) return { gaps: [rulesGap(RT.quality, RK.tiers)] };
  // 修正管线的主体是模板行（实例没有登记在 idIndex，不是管线认得的实体）；实例自己的登记修正项（附魔等）待修正来源接入。
  const r = modifiedWith(engine, state, MOD.ns, template, MOD.dimension, { base, derived: [{ id: `quality/${tier}`, stage: 'mul', value: row.value, unpenalized: true, source: { kind: 'quality', id: tier, via: MOD.dimension } }] });
  return { fixed: fixedUnits(r.fact.value) };
}

// 材质项（V-3）：实例材料聚合的 valueMult ÷ 模板参考材料聚合的 valueMult；除数为 0 或任一读不到，材质项未知记缺口，取用方按“不乘”。返回 {fixed} 或 {gap}。
function materialRatio(engine, state, template, material) {
  const own = materialView(engine, state, template, { dimensions: [DIM.valueMult] }).dims[DIM.valueMult];
  const inst = aggregateMaterialFor(engine, state, template, material, DIM.valueMult);
  if (!own.known || !inst.known || typeof own.value !== 'number' || typeof inst.value !== 'number') return { gap: DIM.material };
  if (own.value === 0) return { gap: GAP.valueMultZero };
  return { fixed: fixedDivide(fixedUnits(inst.value), fixedUnits(own.value)) };
}

// 物品（模板、实例、批次）的内在值与解释。返回 {value, explain}。
function itemValue(engine, state, s) {
  const tpl = s.template;
  const priced = pricingRecipeOf(engine, tpl) !== null;
  const dev = s.material !== undefined && s.material !== null ? s.material : null;
  const explain = [];
  const gaps = [];
  // V-6 表象：ctx.frame 的观察者是否识破要读卷二十二知情范围（未建）；有表象的主体不替观察者擅自取真实值。frame 为空表示不限视角（真实值）。
  if (s.purports !== undefined && s.purports !== null && s.frameGiven) return { value: UNKNOWN(GAP.frame), explain };
  const base = baseOf(engine, state, tpl, !priced ? dev : null, []);
  if (!base.known) return { value: base, explain };
  let baseNumber = base.value;
  if (s.quality !== null && s.quality !== undefined) {
    const q = applyQuality(engine, state, tpl, s.quality, baseNumber);
    if (q.gaps) return { value: UNKNOWN(...q.gaps), explain };
    baseNumber = fixedToNumber(q.fixed);
  }
  let acc = fixedUnits(baseNumber);
  explain.push({ term: 'valueBase', factor: baseNumber });
  const mul = (term, f) => { acc = fixedMultiply(acc, f); explain.push({ term, factor: fixedToNumber(f) }); };
  if (priced && dev !== null) {
    const m = materialRatio(engine, state, tpl, dev);
    if (m.gap) gaps.push(m.gap); else mul('material', m.fixed);
  }
  // 成色项、新鲜项：耐久、腐坏的当日读数由 item-state 的锚点式给出（6-3，Fact）；不适用（没有该维度或不磨损、不腐）则不乘；读不到按未知，估值不替它补数（V-8）。
  const aging = [];
  if (s.type === SUBJECT.instance) {
    const iv = instanceView(engine, state, s.id);
    aging.push([RK.conditionCurve, 'condition', iv.durability], [RK.freshnessCurve, 'freshness', iv.spoilage]);
  } else if (s.type === SUBJECT.lot) aging.push([RK.freshnessCurve, 'freshness', s.spoilage]);
  for (const [curve, term, fact] of aging) {
    if (fact === null || fact === undefined || fact.applicable === false) continue;
    if (!fact.known) return { value: UNKNOWN(...fact.gaps), explain };
    const f = lookupRule(engine, curve, fact.value);
    if (f.gaps) return { value: UNKNOWN(...f.gaps), explain };
    mul(term, f.fixed);
  }
  // 装饰项（beauty × beautyValue + 名气加成）读卷二十三（beauty 维度与 renownBonus 未建）：读不到，记缺口，不写缺省、不当零加。
  gaps.push(GAP.beauty);
  if (s.type === SUBJECT.lot) {
    acc = fixedMultiply(fixedUnits(s.qty), acc);
    explain.push({ term: 'quantity', factor: s.qty });
  }
  return { value: KNOWN(toNumber(acc), { unit: UNIT.copper, partial: gaps.length > 0, gaps: Object.freeze([...new Set(gaps)].sort(cmp)) }), explain };
}

/**
 * kernelApi `valuation(engine, state, subjectRef, ctx)`（卷三乙 §4.16.2）→ `{value, scarcityFactor, explain}`。
 * subjectRef 是物品模板、实例 id、批次引用 lotRef，或别类实体（转交 registerValuer 登记的估值器，没登记按 V-8 未知）。
 * ctx = {role, frame, place, supply, demandPerDay}：supply、demandPerDay 由卷六 priceFor 传入；本函数不含任何角色常数，role 只随 ctx 透传给别类估值器。
 * value 是内在值（铜，不含供需）；scarcityFactor 单独给，供需只许计一次——价格形成以 value 为锚，不得再乘 scarcityFactor（§4.16.2）。
 * explain：按求值次序的 [{term, factor}]，valueBase 之后各项连乘（lot 另有 quantity）严格等于 value（装饰项读不到，value 的 gaps 里记缺口）。
 * @param {any} engine @param {any} state @param {string | {account: {holder: string, purpose: string, kind: string}, lotKey: string}} subjectRef
 * @param {{role?: string, frame?: unknown, place?: string, supply?: number | null, demandPerDay?: number | null}} [ctx]
 */
export function valuation(engine, state, subjectRef, ctx = {}) {
  const c = isObj(ctx) ? ctx : {};
  const s = subjectOf(engine, state, subjectRef);
  if (s.type === SUBJECT.other) {
    const fn = valuers.get(s.kind);
    if (fn === undefined) return Object.freeze({ value: UNKNOWN(`${GAP.valuer}:${s.kind}`), scarcityFactor: UNKNOWN(`${GAP.valuer}:${s.kind}`), explain: Object.freeze([]) });
    return fn(engine, state, subjectRef, c);
  }
  const { value, explain } = itemValue(engine, state, { ...s, frameGiven: c.frame !== undefined && c.frame !== null });
  const sc = scarcity(engine, state, s.template, { supply: c.supply, demandPerDay: c.demandPerDay });
  let scarcityFactor;
  if (!sc.known) scarcityFactor = UNKNOWN(...sc.gaps);
  else {
    const f = lookupRule(engine, RK.scarcityCurve, sc.value);
    scarcityFactor = f.gaps ? UNKNOWN(...f.gaps) : KNOWN(fixedToNumber(f.fixed), { unit: 'dimensionless', scarcity: sc.value });
  }
  return Object.freeze({ value, scarcityFactor, explain: Object.freeze(explain.map((e) => Object.freeze(e))) });
}

// ---------- 加载期校验 ----------

/**
 * rules.valuation、rules.crafting 的跨键校验（V-1、V-3、V-5、Q-6）：曲线值不为负，稀缺曲线沿覆盖比单调不升（越稀缺越贵），
 * selectorRepresentative 是本实现认得的取法，laborRate 单值非负（由登记域 [0, null] 守，不在此重复），品质表基准档各列为 0、乘子不使价值为负、每档每列齐全。
 * 返回错误行（格式同 checkItemStateTables）。
 * @param {Record<string, any>} rules engine.rules @param {{vocab?: any}} [view]
 */
export function checkValuationTables(rules, view = {}) {
  const errors = [];
  const push = (code, table, row, got, want) => errors.push({ code, level: 'L2', table: `rules.${table}`, row, dim: '', path: `rules.${table}#/${row}`, got, want });
  const val = isObj(rules[RT.valuation]) ? rules[RT.valuation] : {};
  for (const k of [RK.conditionCurve, RK.freshnessCurve, RK.scarcityCurve]) {
    if (Array.isArray(val[k]) && val[k].some((p) => p[1] < 0)) push('E-DIM-DOMAIN-CURVE', RT.valuation, k, val[k].map((p) => p[1]), `${k} values >= 0`);
  }
  if (Array.isArray(val[RK.scarcityCurve]) && val[RK.scarcityCurve].some((p, i) => i > 0 && p[1] > val[RK.scarcityCurve][i - 1][1])) push('E-DIM-DOMAIN-CURVE', RT.valuation, RK.scarcityCurve, val[RK.scarcityCurve].map((p) => p[1]), 'scarcityCurve non-increasing (V-3: the scarcer, the dearer)');
  if (val[RK.selectorRepresentative] !== undefined && !Object.values(REPRESENTATIVE).includes(val[RK.selectorRepresentative])) push('E-DIM-DOMAIN-ENUM', RT.valuation, RK.selectorRepresentative, val[RK.selectorRepresentative], `one of ${Object.values(REPRESENTATIVE).join('/')}`);
  const q = isObj(rules[RT.quality]) ? rules[RT.quality] : {};
  if (Array.isArray(q[RK.tiers])) {
    const fam = view.vocab && view.vocab.families instanceof Map ? view.vocab.families.get(FAMILY.quality) : undefined;
    const tierCodes = fam ? Object.keys(fam.entries).sort(cmp) : [];
    const keys = [...new Set(q[RK.tiers].map((r) => r.key))].sort(cmp);
    const seen = new Set();
    for (const r of q[RK.tiers]) {
      const id = `${r.tier}|${r.key}`;
      if (seen.has(id)) push('E-DIM-DUPLICATE-KEY', RT.quality, RK.tiers, id, 'one row per (tier, key)');
      seen.add(id);
      if (r.value < -1) push('E-DIM-DOMAIN-RANGE', RT.quality, RK.tiers, r.value, '1 + value >= 0 (a quality tier cannot make a value negative)');
    }
    for (const k of keys) for (const t of tierCodes) if (!seen.has(`${t}|${k}`)) push('E-DIM-REQUIRED-MISSING', RT.quality, RK.tiers, `${t}|${k}`, 'every quality tier has a multiplier for every column (Q-6)');
    const base = q[RK.baselineTier];
    if (typeof base === 'string' && q[RK.tiers].some((r) => r.tier === base && r.value !== 0)) push('E-DIM-DOMAIN-RANGE', RT.quality, RK.baselineTier, base, 'baselineTier has multiplier 0 in every column (Q-6)');
  }
  return errors;
}
