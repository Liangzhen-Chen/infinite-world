// 物品读入口与物品表加载期派生（卷三乙《物态类别与物品》§3.1 :420–:425、§4.1.1 聚合口径 :630–:672、§4.2 物品通用字段 :886–:917、
// §4.3.3 类别派生 C-1、C-6、C-8 :980–:992；块 6 第 6-2 张）。
// `itemView(engine, state, id)`：模板 id → 表头全部维度的基值 Fact，其中密度、体积、尺寸档、可能物态集、类别（categoryKind 与 class 族）由本文件派生，
//   库存槽按 categoryKind 开（C-6）；`materialView(engine, state, id)`：材料 id → 卷三甲 §2.1 手填维度与卷三乙 §2.1 派生量（数值维度经唯一管线给有效值、带 base，本入口不套修正表，M-12）；
//   物品模板 id → 按 rules.items.aggregation 把各材料组聚合成物品的材料量（M-1），带 known、applicable、partial。
// 实例与批次（itemInstances、批次引用）的读法随 6-3 物品写者：实例没有登记在 idIndex，kindOf 即 E-DIM-REF-MISSING，不静默当模板读。
// `checkItemTables(view)`：加载期校验与派生（I-5、I-6、I-8、I-9、C-1、C-8），派生结果挂在 item 表的 `itemDerived`，运行期只读它。
// 读规则表值：键在 rules.items.unbuilt（卷文无首批值）即未给，求出的量按未知带缺口，不编数（卷二 §1.6）。
// 不认任何物品、材料、类别、组件类代号；族条目的字段只按登记读；数值一律经 det-math 的定点算术。

import { dim, modified, readsUnbuilt } from './dimensions.mjs';
import { kindOf } from './vocab.mjs';
import { KernelError } from './errors.mjs';
import { fixedUnits, fixedAdd, fixedSub, fixedMultiply, fixedDivide, fixedToNumber, truncateTo } from './det-math.mjs';
import { compileRXInScope, evaluateRX, RxError, splitDimKey, rxChildren, nsKey, dimRxType } from './rx.mjs';
import { valueOf, requirement } from './validate/rows.mjs';
import { T } from './handles/markers.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 表与规则表代号、键名（卷三乙 §2.2、§2.5；固定记号，单一定义）。
const KIND = Object.freeze({ item: 'item', material: 'material' });
const RULES = Object.freeze({ items: 'items', materials: 'materials', climate: 'climate' });
const KEY = Object.freeze({
  aggregation: 'aggregation', categoryRules: 'categoryRules', classRules: 'classRules', materialClassMin: 'materialClassMin',
  sizeClasses: 'sizeClasses', staticStateOrder: 'staticStateOrder', envTempDomain: 'envTempDomain', substanceClass: 'substanceClass',
});
// 物品表与材料表的维度键（表头登记的名字）。
const DIM = Object.freeze({
  massKg: 'massKg', material: 'material', bulkForm: 'bulkForm', density: 'density', volumeL: 'volumeL', sizeClass: 'sizeClass',
  possibleMatterStates: 'possibleMatterStates', categoryKind: 'categoryKind', substance: 'substance', categories: 'categories',
  meltPoint: 'meltPoint', boilPoint: 'boilPoint', decomposePoint: 'decomposePoint', moisture: 'moisture',
});
const SHARE = Object.freeze({ group: 'group', materialRef: 'materialRef', share: 'share' });
// matter 族是封闭的三项（卷三乙 §2.4）：固、液、气；密度等分态量的栏名取条目代号去掉族前缀。
const MATTER = Object.freeze({ solid: T.matter_state.matter_solid, liquid: T.matter_state.matter_liquid, gas: T.matter_state.matter_gas });
// I-7 点名的承力四项（卷三乙 :912；硬度、韧性由强度派生，韧展性不在其内）。
const SOLID_REQUIRED = Object.freeze(['strength', 'sharpnessMax', 'wearResistance', 'armorMult']);
const ENTRY = Object.freeze({ bearsLoad: 'bearsLoad', structural: 'structural', stockSlot: 'stockSlot', materialClass: 'materialClass', broader: 'broader' });
const CODE = Object.freeze({
  portionSum: 'E-DIM-INVARIANT-PORTION-SUM', duplicate: 'E-DIM-DUPLICATE-KEY', derivedWritten: 'E-DIM-DERIVED-WRITTEN', required: 'E-DIM-REQUIRED-MISSING',
  range: 'E-DIM-DOMAIN-RANGE', derivedConflict: 'E-DIM-DERIVED-CONFLICT', structField: 'E-DIM-STRUCT-FIELD', refMissing: 'E-DIM-REF-MISSING', unknownRead: 'E-DIM-UNKNOWN-READ', modRx: 'E-MOD-RX',
});
const AGG = T.code_enum.agg_mode;
// 表头 required 策略里本文件用到的一个固定记号（卷二 §1.2）。
const REQUIRED_NEVER = T.required_policy.never;

const KNOWN = (value, extra = {}) => Object.freeze({ known: true, applicable: true, value, ...extra });
const UNKNOWN = (reason) => Object.freeze({ known: false, applicable: true, ...(reason === undefined ? {} : { reason }) });
const NOT_APPLICABLE = Object.freeze({ known: false, applicable: false });

// ---------- 规则表读取 ----------

function ruleValue(rules, table, key) {
  const t = rules && isObj(rules[table]) ? rules[table] : undefined;
  return t !== undefined && Object.hasOwn(t, key) ? t[key] : undefined;
}

const familyOf = (vocab, name) => (vocab && vocab.families instanceof Map ? vocab.families.get(name) : undefined);
const entryOf = (vocab, code) => (vocab && vocab.index instanceof Map && vocab.index.has(code) ? vocab.index.get(code).entry : undefined);

// 族名取自物品表头（派生优先，不在内核里点名族）：物态族是 possibleMatterStates 的元素族，类别族是 categoryKind 的族。
const vocabNameOf = (itemDims, key) => {
  const d = isObj(itemDims) ? itemDims[key] : undefined;
  return isObj(d) ? (d.vocab !== undefined ? d.vocab : isObj(d.of) ? d.of.vocab : undefined) : undefined;
};
const matterFamilyOf = (vocab, itemDims) => familyOf(vocab, vocabNameOf(itemDims, DIM.possibleMatterStates));

// 分态量的栏名：matter 条目代号去掉族前缀（matter_solid → solid）。
function stateField(fam, matterCode) {
  return fam ? matterCode.slice(fam.prefix.length) : matterCode;
}

// 分态量：struct 维度，字段名恰是 matter 族全部条目的栏名（密度、比热、导热）。
function isPerState(fam, def) {
  if (!fam || !isObj(def) || def.type !== T.type.struct || !isObj(def.fields)) return false;
  const cols = Object.keys(fam.entries).map((c) => c.slice(fam.prefix.length)).sort(cmp);
  const have = Object.keys(def.fields).sort(cmp);
  return cols.length > 0 && cols.length === have.length && cols.every((c, i) => c === have[i]);
}

// ---------- 物态（T-2 材料级判法、T-13 可能物态集、T-14 静态读法） ----------

const isNum = (r) => isObj(r) && r.known === true && typeof r.value === 'number';

/**
 * T-13：把 T-2 的材料级判法用在环境温度域 [min, max] 上得到的物态集（按 staticStateOrder 的次序给出）；要用的点未知返回 null。
 * 读 meltPoint、boilPoint、decomposePoint 三个读数（{known, value}）。
 * @param {{melt: any, boil: any, decompose: any}} points @param {{min: number, max: number} | undefined} domain
 * @returns {string[] | null}
 */
export function matterStatesOf(points, domain) {
  const { melt, boil, decompose } = points;
  if (!isObj(domain) || typeof domain.min !== 'number' || typeof domain.max !== 'number') return null;
  const byDecompose = !isNum(melt) || (isNum(decompose) && decompose.value < melt.value);
  if (byDecompose) return isNum(decompose) ? [MATTER.solid] : null;
  const out = [];
  if (domain.min < melt.value) out.push(MATTER.solid);
  if (melt.value <= domain.max && (!isNum(boil) || domain.min < boil.value)) out.push(MATTER.liquid);
  if (isNum(boil) && boil.value <= domain.max) out.push(MATTER.gas);
  return out;
}

// T-14：staticStateOrder 里最先出现在该份可能物态集中的那个物态；规则表没有次序或集合未知即 null。
function staticState(states, order) {
  if (!Array.isArray(states) || !Array.isArray(order)) return null;
  const hit = order.find((s) => states.includes(s));
  return hit === undefined ? null : hit;
}

// ---------- 材料读取器：加载期读行数据，运行期读 dim/modified ----------

// 加载期（表刚载入、注册表未装）：读展平后的行与类别链，不求派生（卷三乙 M-12 ①，加载校验读修正前的值）。
function loadReader(tables, env) {
  const matT = tables.get(KIND.material);
  const mat = matT && { ...matT, env }; // 报告里的表没有 env，valueOf 的类别链判定要它
  return (id, key) => {
    if (!mat || !mat.flat || !mat.flat.rows.has(id)) return UNKNOWN();
    if (key === DIM.categories) {
      const ix = mat.ruleIndexes instanceof Map ? mat.ruleIndexes.get(key) : undefined;
      return ix instanceof Map && ix.has(id) ? KNOWN(ix.get(id)) : UNKNOWN();
    }
    const raw = (isObj(mat.doc.rows) && mat.doc.rows[id]) || (isObj(mat.doc.generated) && mat.doc.generated[id]) || {};
    const r = valueOf(mat, id, raw, key);
    if (r.known && r.value !== undefined && r.value !== null) return KNOWN(r.value);
    // 条件必填（byClass、ifPresent 等）的条件都不满足：这份材料没有这个量，不适用（卷二 §1.3；卷三乙 M-1 ①"铁没有热值"），与运行期 dim 同口径。
    const req = requirement(mat, id, raw, key);
    return req.conditional && !req.applicable ? NOT_APPLICABLE : UNKNOWN();
  };
}

// 运行期：数值标量维度经唯一管线给有效值（带 base），其余读基值；登记在案的未建派生按未知带码交出（同 speciesView 口径）。
function runtimeReader(engine, state) {
  const mat = engine.tables.get(KIND.material);
  return (id, key) => {
    const def = mat && mat.doc.dimensions ? mat.doc.dimensions[key] : undefined;
    // 只有表头登记 modifiable 的数值标量才是修正键（卷二 §3.3）；不可修正的维度有效值就是基值。
    const viaPipeline = isObj(def) && (def.type === T.type.number || def.type === T.type.integer) && def.modifiable === true && def.derived === undefined;
    try {
      return viaPipeline ? modified(engine, state, KIND.material, id, key) : dim(engine, state, KIND.material, id, key);
    } catch (e) {
      if (isObj(e) && e.code === CODE.modRx && readsUnbuilt(engine, KIND.material, key)) return UNKNOWN(CODE.modRx);
      throw e;
    }
  };
}

const domainOf = (rules) => {
  const d = ruleValue(rules, RULES.climate, KEY.envTempDomain);
  return isObj(d) ? d : undefined;
};

function statesOfMaterial(read, rules, matId) {
  return matterStatesOf({ melt: read(matId, DIM.meltPoint), boil: read(matId, DIM.boilPoint), decompose: read(matId, DIM.decomposePoint) }, domainOf(rules));
}

// ---------- 份额与主料 ----------

// 一件物品的 material 列表规整成 [{group, materialRef, share(定点)}]；形状不合返回 null。
function sharesOf(list) {
  if (!Array.isArray(list)) return null;
  const out = [];
  for (const e of list) {
    if (!isObj(e) || typeof e[SHARE.materialRef] !== 'string' || typeof e[SHARE.group] !== 'string' || typeof e[SHARE.share] !== 'number') return null;
    out.push({ group: e[SHARE.group], materialRef: e[SHARE.materialRef], share: fixedUnits(e[SHARE.share]) });
  }
  return out;
}

// T-2 ② 定主料：结构组（matgroup 条目 structural 为真）里份额最大的一份，平局按材料代号字典序；没有结构组时在全部组里取。
function mainMaterialOf(vocab, shares) {
  const structural = shares.filter((s) => { const e = entryOf(vocab, s.group); return isObj(e) && e[ENTRY.structural] === true; });
  const pool = structural.length ? structural : shares;
  let best = null;
  for (const s of pool) if (best === null || s.share > best.share || (s.share === best.share && s.materialRef < best.materialRef)) best = s;
  return best === null ? null : best.materialRef;
}

// ---------- 聚合（M-1；口径与承担组在 rules.items.aggregation，代码里没有任何一个维度的专门写法） ----------

function specOf(rules, dimKey) {
  const list = ruleValue(rules, RULES.items, KEY.aggregation);
  return Array.isArray(list) ? list.find((s) => isObj(s) && s.dimension === dimKey) : undefined;
}

// 承担组筛选：写了承担组且物品至少有一份在其中，只取这些份；物品没有表里指定的组时退回全部组（卷三乙 :672）。
function inGroups(spec, shares) {
  const groups = Array.isArray(spec.groups) ? spec.groups : [];
  if (!groups.length) return shares;
  const hit = shares.filter((s) => groups.includes(s.group));
  return hit.length ? hit : shares;
}

const sumOf = (xs) => xs.reduce((a, x) => fixedAdd(a, x), fixedUnits(0));

// 一个口径、一列 {s 份额, v 定点值, m 含水率(dmean 用)} → 定点结果；没有可参加的份返回 null（不做除法，按不适用）。
function combine(mode, rows) {
  if (!rows.length) return null;
  const zero = fixedUnits(0);
  const shareSum = sumOf(rows.map((r) => r.s));
  switch (mode) {
    case AGG.sum: return sumOf(rows.map((r) => fixedMultiply(r.s, r.v)));
    case AGG.mean: return shareSum === zero ? null : fixedDivide(sumOf(rows.map((r) => fixedMultiply(r.s, r.v))), shareSum);
    case AGG.hmean: {
      const inv = sumOf(rows.map((r) => fixedDivide(r.s, r.v)));
      return inv === zero ? null : fixedDivide(shareSum, inv);
    }
    case AGG.dmean: {
      const w = rows.map((r) => fixedMultiply(r.s, fixedSub(fixedUnits(1), r.m)));
      const total = sumOf(w);
      return total === zero ? null : fixedDivide(sumOf(rows.map((r, i) => fixedMultiply(w[i], r.v))), total);
    }
    case AGG.max: return rows.reduce((a, r) => (r.v > a ? r.v : a), rows[0].v);
    case AGG.min: return rows.reduce((a, r) => (r.v < a ? r.v : a), rows[0].v);
    default: throw new KernelError(CODE.unknownRead, {}, `aggregation mode ${String(mode)} has no combiner`);
  }
}

/**
 * 物品的一个材料量（M-1）：对每份先分开三种状态——不适用的不参加；未知的按该维 onUnknown（error 抛、skip 使整件退出、gap 不计入且结果带 partial）；已知的参加。
 * 返回 Fact：{known, applicable, partial, value}；承担组内没有适用份时不适用。分态量先按静态读法取栏，固相量只在静态物态为固时适用（T-14、I-7）。
 * @param {{vocab: any, rules: any, matDims: Record<string, any>}} ctx @param {(id: string, key: string) => any} read
 * @param {{group: string, materialRef: string, share: bigint}[]} shares @param {string} dimKey
 */
function aggregateDim(ctx, read, shares, dimKey) {
  const { vocab, rules, matDims } = ctx;
  const spec = specOf(rules, dimKey);
  if (!isObj(spec)) throw new KernelError(CODE.unknownRead, {}, `material dimension ${dimKey} has no row in rules.items.aggregation (M-10)`);
  if (spec.mode === AGG.none) throw new KernelError(CODE.unknownRead, {}, `material dimension ${dimKey} is not aggregated to the item level (mode none, M-10)`);
  const def = matDims[dimKey];
  const perState = isPerState(ctx.matter, def);
  const order = ruleValue(rules, RULES.items, KEY.staticStateOrder);
  const onUnknown = isObj(def) ? def.onUnknown : T.code_enum.onUnknown.gap;
  const main = mainMaterialOf(vocab, shares);
  // I-7 使用时：不具有 class_formed（散粒、粉末、不可能为固）的物品，承力各项对它不适用，材料行填了也不读。
  if (spec.solidOnly === true && ctx.formed === false) return NOT_APPLICABLE;
  // 分态量、固相量要先定静态物态（T-14），那要环境温度域（T-13）：规则表还没给这个键（登在 unbuilt）时整件按未知带出，不抛错、不编数。
  if ((perState || spec.solidOnly === true) && domainOf(rules) === undefined) return UNKNOWN(`rules.${RULES.climate}.${KEY.envTempDomain}`);
  if (spec.mode === AGG.dominant) {
    if (main === null) return NOT_APPLICABLE;
    const f = read(main, dimKey);
    if (f.applicable === false || (f.known && f.value === null)) return NOT_APPLICABLE;
    return f.known ? KNOWN(f.value, { partial: false }) : UNKNOWN();
  }
  let partial = false;
  const rows = [];
  // M-1 第 ② 种：未知按该维 onUnknown——error 抛；skip 使整件物品退出（返回真）；gap 这一份不计入、结果记 partial（返回假）。
  const skipsWhole = () => {
    if (onUnknown === T.code_enum.onUnknown.error) throw new KernelError(CODE.required, {}, `material dimension ${dimKey} unknown for a share (onUnknown error)`);
    return onUnknown === T.code_enum.onUnknown.skip;
  };
  const stateful = perState || spec.solidOnly === true;
  for (const e of inGroups(spec, shares)) {
    const phase = stateful ? staticState(statesOfMaterial(read, rules, e.materialRef), order) : null;
    if (stateful && phase === null) { if (skipsWhole()) return UNKNOWN(); partial = true; continue; }
    if (spec.solidOnly === true && phase !== MATTER.solid) continue; // 固相量在静态物态非固时不适用
    const f = read(e.materialRef, dimKey);
    if (f.applicable === false) continue;
    // 材料表头写 never 的维度：这份材料没填就是"没有这个量"，不适用（盐没有热值）；固相量是例外，它的缺失按 I-7 算未知。
    if (!f.known && isObj(def) && def.required === REQUIRED_NEVER && spec.solidOnly !== true) continue;
    let v = f.known ? f.value : undefined;
    if (perState && isObj(v)) v = v[stateField(ctx.matter, phase)];
    if (v === undefined || v === null) {
      if (f.known && !perState) continue; // 显式 null：这一份"没有"，不适用
      if (skipsWhole()) return UNKNOWN();
      partial = true;
      continue;
    }
    // dmean 按干物质份额加权，要这一份的含水率；含水率未知按同一维的 onUnknown 处置。
    const moisture = spec.mode === AGG.dmean ? read(e.materialRef, DIM.moisture) : undefined;
    if (spec.mode === AGG.dmean && !isNum(moisture)) { if (skipsWhole()) return UNKNOWN(); partial = true; continue; }
    rows.push({ s: e.share, v, m: moisture === undefined ? undefined : fixedUnits(moisture.value) });
  }
  const unit = isObj(def) && typeof def.unit === 'string' ? def.unit : undefined;
  const out = (value) => KNOWN(value, { partial, ...(unit === undefined ? {} : { unit }) });
  if (isObj(rows[0] && rows[0].v)) return aggregateKeyed(spec.mode, rows, partial, out);
  const result = combine(spec.mode, rows.map((r) => ({ ...r, v: fixedUnits(r.v) })));
  if (result === null) return partial ? Object.freeze({ known: false, applicable: true, partial: true }) : NOT_APPLICABLE;
  return out(fixedToNumber(result));
}

// map、struct 型的材料量（强度、营养、防护系数、易燃度区间）：逐键各自按同一口径聚合，只在有该键值的份里算。
function aggregateKeyed(mode, rows, partial, out) {
  const keys = [...new Set(rows.flatMap((r) => Object.keys(r.v)))].sort(cmp);
  const value = {};
  for (const k of keys) {
    const part = rows.filter((r) => typeof r.v[k] === 'number').map((r) => ({ ...r, v: fixedUnits(r.v[k]) }));
    const c = combine(mode, part);
    if (c !== null) value[k] = fixedToNumber(c);
  }
  return Object.keys(value).length ? out(Object.freeze(value)) : NOT_APPLICABLE;
}

// ---------- 物品表加载期校验与派生 ----------

const rowOf = (t, id) => (isObj(t.doc.rows) && t.doc.rows[id]) || (isObj(t.doc.generated) && t.doc.generated[id]) || {};

// 材料类别（C-8 ①）：本源成分的份额和、派生大类（沿 broader 展开）的份额和不低于 rules.items.materialClassMin 时，取对应的类别。
// 返回 {classes, conflicts}：conflicts 是同时出自本源成分与派生大类两条来源的类别（M-9：一个类别只许出自其中一条来源）。
// 本源成分到类别读 rules.materials.substanceClass（卷三乙 :326，首批值 :566）；该键没给值时本源成分一支按未知，不出类别。
function materialClassesOf(view, read, shares) {
  const min = ruleValue(view.rules, RULES.items, KEY.materialClassMin);
  if (typeof min !== 'number') return { classes: new Set(), conflicts: [] };
  const floor = fixedUnits(min);
  const bySubstance = ruleValue(view.rules, RULES.materials, KEY.substanceClass);
  const fromSubstance = new Set();
  const out = new Set();
  const subShare = new Map();
  const catShare = new Map();
  const add = (m, k, s) => m.set(k, fixedAdd(m.get(k) || fixedUnits(0), s));
  for (const e of shares) {
    const sub = read(e.materialRef, DIM.substance);
    if (sub.known && typeof sub.value === 'string') add(subShare, sub.value, e.share);
    const cats = read(e.materialRef, DIM.categories);
    if (cats.known && Array.isArray(cats.value)) {
      const all = new Set(cats.value.flatMap((c) => [c, ...(typeof view.vocab.ancestors === 'function' ? view.vocab.ancestors(c) : [])]));
      for (const c of all) add(catShare, c, e.share);
    }
  }
  for (const [sub, s] of subShare) {
    const cls = isObj(bySubstance) && Object.hasOwn(bySubstance, sub) ? bySubstance[sub] : undefined;
    if (s >= floor && typeof cls === 'string') { out.add(cls); fromSubstance.add(cls); }
  }
  const conflicts = [];
  for (const [c, s] of catShare) {
    const cls = (entryOf(view.vocab, c) || {})[ENTRY.materialClass];
    if (s < floor || typeof cls !== 'string') continue;
    if (fromSubstance.has(cls)) conflicts.push(cls);
    out.add(cls);
  }
  return { classes: out, conflicts: [...new Set(conflicts)].sort(cmp) };
}

// material.<维度键> 在类别规则里读的是被求值物品按 M-1 聚合的材料量（卷三乙 C-1 ②、§3.1 :425）：只收聚合表里口径不为 none 的材料维度，
// 且物品层读数是 RX 读数（数值、布尔、代号、句柄；分态量按静态读法 T-14 取一栏，读数是数值）。不合返回说明，合格返回 null。
function materialFieldProblem(view, matter, arg) {
  const field = (arg || []).join('.');
  const mat = view.tables.get(KIND.material);
  const def = mat && isObj(mat.doc.dimensions) ? mat.doc.dimensions[field] : undefined;
  const spec = specOf(view.rules, field);
  if (!isObj(def) || !isObj(spec) || spec.mode === AGG.none) return `${KIND.material}.${field} is not a material dimension aggregated to the item level (rules.items.aggregation, M-1)`;
  if (isPerState(matter, def)) return null;
  try { dimRxType(def, field); return null; } catch (e) {
    if (e instanceof RxError) return `${KIND.material}.${field}: ${e.message}`;
    throw e;
  }
}

// 类别规则表（categoryRules、classRules）：每条 when 按物品表的非派生维度（加可能物态集）、item.classes 与 material.<维度键> 编译；读到未知按未命中（卷二 §1.12）。
function compileWhens(view, itemT, key, errors) {
  const list = ruleValue(view.rules, RULES.items, key);
  if (!Array.isArray(list)) return null;
  const dims = new Map(Object.entries(itemT.doc.dimensions).filter(([k, d]) => isObj(d) && (d.derived === undefined || k === DIM.possibleMatterStates)));
  // 命名空间收两张表的 kind 同名的登记行（state-owners.json rxNamespaces）：item 读被求值的那一件物品的维度与 classes；
  // material 读同一件物品按 M-1 聚合的材料量（变量口径同卷三乙 C-1 ②，卷四 §4.7.7）。
  const kind = [...view.tables.keys()].find((k) => view.tables.get(k) === itemT);
  const nsKinds = [kind, KIND.material];
  const scope = { dims, vocabIndex: view.vocab.index, ns: (Array.isArray(view.ns) ? view.ns : []).filter((r) => nsKinds.includes(r.ns)), maxDepth: view.maxDepth, rules: view.rules };
  const matter = matterFamilyOf(view.vocab, itemT.doc.dimensions);
  const out = [];
  list.forEach((entry, i) => {
    const at = `rules.items.${key}[${i}]`;
    let c;
    try { c = compileRXInScope(entry.when, 'data', scope); } catch (e) {
      if (!(e instanceof RxError)) throw e;
      errors.push(`${CODE.modRx} ${at}: ${e.message}`);
      return;
    }
    // C-1、C-8：when 不得读 class 族类别（整类指定）、不得恒真（至少读一个变量）。
    let reads = 0;
    let readsClass = false;
    const nsReads = [];
    const problems = [];
    const walk = (n) => {
      if (!isObj(n)) return;
      if (n.op === T.rx_op.dim || n.op === T.rx_op.ns) reads += 1;
      if (n.op === T.rx_op.ns) {
        nsReads.push({ key: nsKey(n), ns: n.ns, field: (n.arg || []).join('.') });
        const why = n.ns === KIND.material ? materialFieldProblem(view, matter, n.arg) : null;
        if (why !== null) problems.push(why);
      }
      if (n.op === T.rx_op.handle && (view.vocab.index.get(n.value) || {}).family === T.vocab_family.class) readsClass = true;
      rxChildren(n).forEach(walk);
    };
    walk(c.tree);
    if (!reads) errors.push(`${CODE.structField} ${at}: when reads no variable (constant condition is not allowed, C-1)`);
    if (readsClass) errors.push(`${CODE.structField} ${at}: when reads a class-family entry (C-1, C-8)`);
    for (const why of problems) errors.push(`${CODE.modRx} ${at}: ${why}`);
    if (!problems.length) out.push({ tree: c.tree, value: entry.value, nsReads });
  });
  return out;
}

// readers：命名空间代号 → 按字段名给读数的函数（读不到给 undefined，按未知不命中）。
function evalWhen(c, read, readers) {
  const bound = {};
  const walk = (n) => {
    if (!isObj(n)) return;
    if (n.op === T.rx_op.dim) { const v = read(splitDimKey(n.key).dim); if (v !== undefined) bound[n.key] = v; }
    rxChildren(n).forEach(walk);
  };
  walk(c.tree);
  const nsReads = {};
  for (const r of c.nsReads) {
    const v = Object.hasOwn(readers, r.ns) ? readers[r.ns](r.field) : undefined;
    if (v !== undefined) nsReads[r.key] = v;
  }
  try { return evaluateRX(c.tree, { dim: bound, clock: {} }, nsReads) === true; } catch (e) {
    if (e instanceof RxError && e.key !== undefined) return false; // 缺读数 = 未知，按未命中
    throw e;
  }
}

// M-10：聚合口径表覆盖材料表的全部 number、integer、map、struct 维度（物品层要读的给口径，只逐份用或只作引用的给 none），缺一个键即加载失败；
// 表里每一行的维度（取 <维度键>@<用途> 的前半）须是材料表维度，同一键不重复；承担组引用的 matgroup 条目存在由登记的类型检查负责。
const AGGREGATED_TYPES = Object.freeze([T.type.number, T.type.integer, T.type.map, T.type.struct]);
function checkAggregation(view, errors) {
  const list = ruleValue(view.rules, RULES.items, KEY.aggregation);
  const mat = view.tables.get(KIND.material);
  if (!Array.isArray(list) || !mat) return;
  const dims = mat.doc.dimensions;
  const seen = new Set();
  for (const s of list) {
    const base = typeof s.dimension === 'string' ? s.dimension.split('@')[0] : '';
    if (!Object.hasOwn(dims, base)) errors.push(`${CODE.refMissing} rules.items.aggregation ${String(s.dimension)}: not a material dimension`);
    if (seen.has(s.dimension)) errors.push(`${CODE.duplicate} rules.items.aggregation ${String(s.dimension)}: two rows for one key`);
    seen.add(s.dimension);
  }
  const have = new Set(list.map((s) => String(s.dimension).split('@')[0]));
  for (const k of Object.keys(dims).sort(cmp)) {
    if (AGGREGATED_TYPES.includes(dims[k].type) && !have.has(k)) errors.push(`${CODE.required} rules.items.aggregation ${k}: material dimension has no aggregation row (M-10)`);
  }
}

/**
 * I-6（卷三乙 :912；对照表第 2 行）：物品行（含类别行）的 classes 里出现 class 族条目或材料表组件类（材料派生组件）即 E-DIM-DERIVED-WRITTEN。
 * 不等其他校验通过：材料派生组件挂进物品行同时会被卷二 §1.8 的 E-DIM-COMPONENT-TABLE 拒，本函数先于它按 I-6 的码报。
 * @param {{vocab: any, tables: Map<string, any>}} view @returns {{ok: boolean, errors: string[]}}
 */
export function checkItemClasses(view) {
  const errors = [];
  const itemT = view && view.tables instanceof Map ? view.tables.get(KIND.item) : undefined;
  if (!itemT || !view.vocab || !(view.vocab.index instanceof Map)) return { ok: true, errors };
  for (const section of [T.row_field.classes, 'rows', 'generated']) {
    const rows = isObj(itemT.doc[section]) ? itemT.doc[section] : {};
    for (const id of Object.keys(rows).sort(cmp)) {
      for (const c of Array.isArray(rows[id] && rows[id].classes) ? rows[id].classes : []) {
        const rec = view.vocab.index.get(c);
        if (rec && (rec.family === T.vocab_family.class || (rec.family === T.vocab_family.component && rec.entry.table !== itemT.doc.kind))) errors.push(`${CODE.derivedWritten} ${id}: classes carries ${c} (derived from material and rules, not written)`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

// matter 族条目须恰是 markers 里的三项（定义源在 markers.mjs 的 MATTER_STATES，_vocab.json 登记同一组，二者不一致即报）。
function checkMatterFamily(view, fam, errors) {
  const have = fam ? Object.keys(fam.entries).sort(cmp) : [];
  const want = [...Object.values(MATTER)].sort(cmp);
  if (have.length !== want.length || have.some((c, i) => c !== want[i])) errors.push(`${CODE.refMissing} matter family: entries must be exactly ${want.join(', ')}`);
}

/**
 * 物品表的加载期校验与派生（卷三乙 I-5、I-6、I-8、I-9、C-1、C-8；块 6 对照表第 1、2、5、12 行）。没载入 item 表即无事可核。
 * 返回 "<登记码> <所在> <说明>" 文字行；通过的行的派生结果挂在 item 表的 `itemDerived`（Map: 行代号 → {classes, categoryKind, possibleMatterStates, mainMaterial}）。
 * @param {{vocab: any, rules: any, tables: Map<string, any>, maxDepth?: number}} view
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkItemTables(view) {
  const errors = [];
  const itemT = view && view.tables instanceof Map ? view.tables.get(KIND.item) : undefined;
  if (!itemT || !itemT.flat) return { ok: true, errors };
  const read = loadReader(view.tables, view.env);
  const rowsT = { ...itemT, env: view.env };
  const domain = domainOf(view.rules);
  const order = ruleValue(view.rules, RULES.items, KEY.staticStateOrder);
  const classRules = compileWhens(view, itemT, KEY.classRules, errors);
  const categoryRules = compileWhens(view, itemT, KEY.categoryRules, errors);
  const matter = matterFamilyOf(view.vocab, itemT.doc.dimensions);
  const matDims = view.tables.has(KIND.material) ? view.tables.get(KIND.material).doc.dimensions : {};
  checkAggregation(view, errors);
  checkMatterFamily(view, matter, errors);
  const derived = new Map();
  for (const id of [...itemT.flat.rows.keys()].sort(cmp)) {
    const raw = rowOf(itemT, id);
    const val = (key) => { const r = valueOf(rowsT, id, raw, key); return r.known && r.value !== undefined && r.value !== null ? r.value : undefined; };
    const mass = val(DIM.massKg);
    if (typeof mass === 'number' && !(mass > 0)) errors.push(`${CODE.range} ${id}: massKg must be above 0 (it divides density, value and per-kg quantities)`);
    const shares = sharesOf(val(DIM.material));
    if (shares === null) continue; // 缺或形状不合：必填与类型检查已报
    const seen = new Set();
    for (const s of shares) {
      const key = `${s.group}\u0000${s.materialRef}`;
      if (seen.has(key)) errors.push(`${CODE.duplicate} ${id}: (${s.group}, ${s.materialRef}) appears twice in material`);
      seen.add(key);
    }
    if (sumOf(shares.map((s) => s.share)) !== fixedUnits(1)) errors.push(`${CODE.portionSum} ${id}: material shares must sum to exactly 1`);
    const main = mainMaterialOf(view.vocab, shares);
    const states = main !== null && domain !== undefined ? statesOfMaterial(read, view.rules, main) : null;
    // I-8：模板的可能物态集含固就必填 bulkForm，不含固就不适用、写了即报错。
    if (states !== null) {
      const written = val(DIM.bulkForm);
      if (states.includes(MATTER.solid) && written === undefined) errors.push(`${CODE.required} ${id}: bulkForm is required when the possible matter states include solid (I-8)`);
      if (!states.includes(MATTER.solid) && written !== undefined) errors.push(`${CODE.structField} ${id}: bulkForm is not applicable when the possible matter states exclude solid (I-8)`);
    }
    // 具有 class_formed（C-8：可能物态集含固且 bulkForm 条目 bearsLoad 为真，读可能物态集、不读当时物态）。
    const formed = states === null ? null : states.includes(MATTER.solid) && (entryOf(view.vocab, val(DIM.bulkForm)) || {})[ENTRY.bearsLoad] === true;
    // I-7 加载期：具有 class_formed 时，承担组里结构组且可能物态含固的每份材料缺承力四项之一即按该项 onUnknown 处理（error 报错，gap 记缺口、不阻加载）。
    if (formed === true) {
      for (const key of SOLID_REQUIRED) {
        const spec = specOf(view.rules, key);
        if (!isObj(spec)) continue;
        const bearers = inGroups(spec, shares).filter((s) => (entryOf(view.vocab, s.group) || {})[ENTRY.structural] === true && (statesOfMaterial(read, view.rules, s.materialRef) || []).includes(MATTER.solid));
        const onUnknown = (matDims[key] || {}).onUnknown;
        for (const s of bearers) if (!read(s.materialRef, key).known && onUnknown === T.code_enum.onUnknown.error) errors.push(`${CODE.required} ${id}: ${s.materialRef} lacks ${key} but the item is formed (I-7)`);
      }
    }
    // I-9：逐份材料，它每个可能物态在 density 里的栏都必须有值。
    if (domain !== undefined) {
      for (const s of shares) {
        const ms = statesOfMaterial(read, view.rules, s.materialRef);
        const d = read(s.materialRef, DIM.density);
        if (ms === null || !d.known || !isObj(d.value)) continue;
        for (const st of ms) {
          const column = d.value[stateField(matter, st)];
          if (typeof column !== 'number') errors.push(`${CODE.required} ${id}: ${s.materialRef} may be ${st} but density has no such column (I-9)`);
        }
      }
    }
    // C-8、C-1：类别派生。读行的函数给 when 用：维度读行值，item.classes 读手写组件类（含上位）。
    const ownComps = [...new Set((Array.isArray(raw.classes) ? raw.classes : []).flatMap((c) => [c, ...(typeof view.vocab.ancestors === 'function' ? view.vocab.ancestors(c) : [])]))].sort(cmp);
    const derivedReads = { [T.row_field.classes]: ownComps, [DIM.possibleMatterStates]: states === null ? undefined : states };
    const reader = (key) => (Object.hasOwn(derivedReads, key) ? derivedReads[key] : val(key));
    // material.<维度键>：这件物品按 M-1 聚合的材料量，模板按静态读法（T-14），读法与 materialView 给模板 id 同一个 aggregateDim；
    // 未知、不适用都不交读数（按未命中）；该维 onUnknown 为 error 的未知照 M-1 报错。
    const aggCtx = { vocab: view.vocab, rules: view.rules, matDims, matter, formed };
    const aggregated = new Map();
    const materialReader = (field) => {
      if (!aggregated.has(field)) {
        let f;
        try { f = aggregateDim(aggCtx, read, shares, field); } catch (e) {
          if (!isObj(e) || e.code !== CODE.required) throw e;
          errors.push(`${CODE.required} ${id}: ${e.message}`);
          f = UNKNOWN(CODE.required);
        }
        aggregated.set(field, f);
      }
      const v = aggregated.get(field).known ? aggregated.get(field).value : undefined;
      return typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean' ? v : undefined;
    };
    const readers = { [KIND.item]: reader, [KIND.material]: materialReader };
    const material = materialClassesOf(view, read, shares);
    const classes = new Set(material.classes);
    for (const c of material.conflicts) errors.push(`${CODE.derivedConflict} ${id}: class ${c} comes from both substance and a derived category (M-9, one source only)`);
    for (const c of classRules || []) {
      if (!evalWhen(c, reader, readers)) continue;
      if (material.classes.has(c.value)) errors.push(`${CODE.derivedConflict} ${id}: class ${c.value} comes from both material and rules.items.classRules (C-8, one source only)`);
      classes.add(c.value);
    }
    let categoryKind = null;
    if (categoryRules !== null) {
      const hit = categoryRules.find((c) => evalWhen(c, reader, readers));
      if (hit === undefined) errors.push(`${CODE.required} ${id}: categoryKind derives to nothing (no rules.items.categoryRules entry matches, C-1)`);
      else categoryKind = hit.value;
    }
    derived.set(id, Object.freeze({ classes: Object.freeze([...classes].sort(cmp)), categoryKind, possibleMatterStates: states === null ? null : Object.freeze(order && Array.isArray(order) ? order.filter((o) => states.includes(o)) : [...states]), mainMaterial: main, formed }));
  }
  if (!errors.length) itemT.itemDerived = derived;
  return { ok: errors.length === 0, errors };
}

// ---------- 读入口 ----------

function tableOf(engine, kind) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  if (!t) throw new KernelError(CODE.refMissing, {}, `kind ${JSON.stringify(kind)}: no dimension table`);
  return t;
}

// id 所属的表代号；不在 idIndex（含实例与批次引用）返回 null，不抛。
function idKind(id) {
  try { return kindOf(id); } catch (e) {
    if (isObj(e) && e.code === CODE.refMissing) return null;
    throw e;
  }
}

// 一个维度的基值 Fact；登记在案的未建派生（或依赖它的派生）读到 E-MOD-RX 时按未知带码交出，其余照抛（同 speciesView、placeView 口径）。
function readDim(engine, state, kind, id, key) {
  // 卷二 §2.2：View.dims 给修正后值、Fact.base 给基值；只有表头登记 modifiable 的数值标量走唯一管线，其余基值就是有效值。
  const def = tableOf(engine, kind).doc.dimensions[key];
  const viaPipeline = isObj(def) && (def.type === T.type.number || def.type === T.type.integer) && def.modifiable === true && def.derived === undefined;
  try { return viaPipeline ? modified(engine, state, kind, id, key) : dim(engine, state, kind, id, key); } catch (e) {
    if (isObj(e) && e.code === CODE.modRx && readsUnbuilt(engine, kind, key)) return UNKNOWN(CODE.modRx);
    throw e;
  }
}

function lookupSize(rules, volumeL) {
  const list = ruleValue(rules, RULES.items, KEY.sizeClasses);
  if (!Array.isArray(list) || !list.length) return UNKNOWN('rules.items.sizeClasses');
  const v = fixedUnits(volumeL);
  const sorted = [...list].sort((a, b) => cmp(fixedUnits(b.minVolumeL), fixedUnits(a.minVolumeL)));
  const hit = sorted.find((e) => fixedUnits(e.minVolumeL) <= v);
  return hit === undefined ? UNKNOWN('rules.items.sizeClasses') : KNOWN(hit.size, { source: 'derived' });
}

/**
 * `itemView(engine, state, id)`（卷三乙 §3.1 :420）：模板 id → {id, dims, classes, categoryKind, stockSlot, mainMaterial}。
 * dims 是表头每个维度的基值 Fact；密度、体积、尺寸档按静态读法（T-14）由 massKg 与 material 推出（I-1），取不到的量按未知带出（带 reason），不以常数代替；
 * classes 是手写组件类（含上位）加派生类别（C-8）；stockSlot 是 categoryKind 的类别条目 stockSlot 为真时的该类别（C-6），否则 null。
 * 签名照卷二 §2.2 :466：`itemView(engine, state, id, options = {}) → View | null`，不是物品表实体的 id 返回 null（卷三乙 §3.1 没有另定拒收）；
 * options 收卷二 §2.1 的 {clock}，本卡模板读法不读时间，留作实例读法（6-3）用。
 * @param {any} engine @param {any} state @param {string} id @param {{clock?: any}} [options]
 * @returns {any}
 */
export function itemView(engine, state, id, options = {}) {
  const kind = idKind(id);
  if (kind !== KIND.item) return null;
  const t = tableOf(engine, kind);
  const header = isObj(t.doc.dimensions) ? t.doc.dimensions : {};
  const dims = Object.fromEntries(Object.keys(header).sort(cmp).map((k) => [k, readDim(engine, state, kind, id, k)]));
  const d = t.itemDerived instanceof Map ? t.itemDerived.get(id) : undefined;
  const mat = readDim(engine, state, kind, id, DIM.material);
  const shares = mat.known ? sharesOf(mat.value) : null;
  const ctx = { vocab: engine.vocab, rules: engine.rules, matDims: tableOf(engine, KIND.material).doc.dimensions, matter: matterFamilyOf(engine.vocab, header), formed: d === undefined ? null : d.formed };
  dims[DIM.possibleMatterStates] = d !== undefined && d.possibleMatterStates !== null ? KNOWN(d.possibleMatterStates, { source: 'derived' }) : UNKNOWN(KEY.envTempDomain);
  dims[DIM.categoryKind] = d !== undefined && d.categoryKind !== null ? KNOWN(d.categoryKind, { source: 'derived' }) : UNKNOWN('rules.items.categoryRules');
  let density = UNKNOWN('material');
  if (shares !== null) density = aggregateDim(ctx, runtimeReader(engine, state), shares, DIM.density);
  dims[DIM.density] = density.known ? Object.freeze({ ...density, unit: header[DIM.density].unit, source: 'derived' }) : density;
  const mass = dims[DIM.massKg];
  if (density.known && mass.known && typeof mass.value === 'number') {
    const prec = header[DIM.volumeL] && header[DIM.volumeL].precision;
    const v = fixedToNumber(truncateTo(fixedDivide(fixedUnits(mass.value), fixedUnits(density.value)), prec));
    dims[DIM.volumeL] = KNOWN(v, { unit: header[DIM.volumeL].unit, source: 'derived' });
    dims[DIM.sizeClass] = lookupSize(engine.rules, v);
  } else {
    dims[DIM.volumeL] = UNKNOWN('density');
    dims[DIM.sizeClass] = UNKNOWN('volumeL');
  }
  const comps = new Set();
  const own = (isObj(t.doc.rows) && t.doc.rows[id] && t.doc.rows[id].classes) || [];
  for (const c of own) comps.add(c);
  const classes = [...new Set([...comps, ...(d === undefined ? [] : d.classes)])].sort(cmp);
  const slot = d !== undefined && d.categoryKind !== null && (entryOf(engine.vocab, d.categoryKind) || {})[ENTRY.stockSlot] === true ? d.categoryKind : null;
  return Object.freeze({ id, dims: Object.freeze(dims), classes: Object.freeze(classes), categoryKind: d === undefined ? null : d.categoryKind, stockSlot: slot, mainMaterial: d === undefined ? null : d.mainMaterial });
}

/**
 * `materialView(engine, state, id)`（卷三乙 §3.1 :425）：材料 id → 表头每个维度的 Fact（数值标量经唯一管线给有效值并带 base，本入口不套修正表，M-12）；
 * 物品模板 id → rules.items.aggregation 里每个非 none 口径的维度聚合成物品的材料量（M-1，静态读法），Fact 带 known、applicable、partial。
 * 实例与批次随 6-3。options.dimensions（物品模板时）：只读这几个维度，onUnknown 为 error 的未知照 M-1 抛 E-DIM-REQUIRED-MISSING；
 * 不给时列全部口径，某维读到 error 级未知按未知带码交出，不让一个无关维度拖垮整张读数。
 * @param {any} engine @param {any} state @param {string} id @param {{dimensions?: string[]}} [options]
 */
export function materialView(engine, state, id, options = {}) {
  const kind = kindOf(id);
  if (kind === KIND.material) {
    const t = tableOf(engine, kind);
    const read = runtimeReader(engine, state);
    const dims = Object.fromEntries(Object.keys(t.doc.dimensions).sort(cmp).map((k) => [k, read(id, k)]));
    return Object.freeze({ id, kind, dims: Object.freeze(dims) });
  }
  if (kind !== KIND.item) throw new KernelError(CODE.refMissing, { entity: id }, `${JSON.stringify(id)} is neither a material nor an item template`);
  const list = ruleValue(engine.rules, RULES.items, KEY.aggregation);
  const mat = readDim(engine, state, kind, id, DIM.material);
  const shares = mat.known ? sharesOf(mat.value) : null;
  const ctx = { vocab: engine.vocab, rules: engine.rules, matDims: tableOf(engine, KIND.material).doc.dimensions, matter: matterFamilyOf(engine.vocab, tableOf(engine, KIND.item).doc.dimensions), formed: tableOf(engine, KIND.item).itemDerived instanceof Map && tableOf(engine, KIND.item).itemDerived.has(id) ? tableOf(engine, KIND.item).itemDerived.get(id).formed : null };
  const read = runtimeReader(engine, state);
  const dims = {};
  const asked = Array.isArray(options.dimensions) ? options.dimensions : null;
  const specs = asked === null ? (Array.isArray(list) ? list : []).filter((s) => s.mode !== AGG.none).map((s) => s.dimension) : asked;
  for (const key of [...specs].sort(cmp)) {
    if (shares === null) { dims[key] = UNKNOWN('material'); continue; }
    try { dims[key] = aggregateDim(ctx, read, shares, key); } catch (e) {
      if (asked !== null || !isObj(e) || e.code !== CODE.required) throw e;
      dims[key] = UNKNOWN(CODE.required);
    }
  }
  return Object.freeze({ id, kind, dims: Object.freeze(dims) });
}

/**
 * 库存槽（C-6）：类别条目 stockSlot 为真者各开一槽，按代号序。槽由数据定，加一个类别条目与一件物品即自动多一个槽、多一件入槽，不改本文件。
 * @param {any} engine @returns {readonly string[]}
 */
export function stockSlots(engine) {
  const fam = familyOf(engine.vocab, vocabNameOf(tableOf(engine, KIND.item).doc.dimensions, DIM.categoryKind));
  if (!fam) return Object.freeze([]);
  return Object.freeze(Object.keys(fam.entries).filter((c) => isObj(fam.entries[c]) && fam.entries[c][ENTRY.stockSlot] === true).sort(cmp));
}

/** 某槽里的全部物品模板（itemView.stockSlot 等于该槽的），按代号序。@param {any} engine @param {any} state @param {string} slot */
export function itemsInSlot(engine, state, slot) {
  const t = tableOf(engine, KIND.item);
  const ids = t.itemDerived instanceof Map ? [...t.itemDerived.keys()] : [];
  return Object.freeze(ids.filter((id) => itemView(engine, state, id).stockSlot === slot).sort(cmp));
}
