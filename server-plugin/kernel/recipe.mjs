// 配方表 `recipe` 的读入口与加载期校验（卷三乙《物态类别与物品》§2.7 :365 配方表列、§3.1 recipeView、§4.7 需求块 N-7、§4.8 R-6 基础留存率、R-12 估值递归判环；块 6 第 6-9 张，
// 丙1 选 A：配方表与工价按规则子集前移，本卡只含估值要读的部分——craftOutcome 的开工条件、材料继承、产率、检定、失败（§4.8 R-1 至 R-11、R-13 与三方合力公式）归后卡）。
// `recipeView(engine, state, id)`：配方 id → 表头每个维度的基值 Fact（纯读，不写状态）。
// `pricingRecipeOf(engine, itemId)`：V-1 ① 的“定价配方”——产出指名该物品的配方里 skillMin 最低者，平局按代号字典序；只读表数据，一次建索引。
// `checkRecipeTable(view)`：加载期校验（N-7 候选项的 per 与选择器口径、R-6 基础留存率与产物件数大于 0、R-7 品位三列的相互关系、Q-2 品质曲线必填、R-12 价值递归无环）。
// 不认任何配方、物品、类别、材料代号；选择器键与 per 取值是卷三乙 §4.7 的封闭集合，单一定义在下面 SEL 与 PER。

import { dim } from './dimensions.mjs';
import { KernelError } from './errors.mjs';
import { fixedUnits, fixedMultiply, fixedSub } from './det-math.mjs';
import { T } from './handles/markers.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isBool = (v) => typeof v === 'boolean';
const isNumber = (v) => typeof v === 'number';
const isText = (v) => typeof v === 'string';
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const KIND = Object.freeze({ recipe: 'recipe', item: 'item' });
const CODE = Object.freeze({ range: 'E-DIM-DOMAIN-RANGE', structField: 'E-DIM-STRUCT-FIELD', cycle: 'E-DIM-DERIVED-CYCLE', required: 'E-DIM-REQUIRED-MISSING', refMissing: 'E-DIM-REF-MISSING' });

/** 需求块候选项的选择器键（卷三乙 §4.7.1 :1165，封闭六种里的五个数据键；`req` 是嵌套引用，`abilities` 不计量）。 */
export const SEL = Object.freeze({ items: 'items', classes: 'classes', matcats: 'matcats', where: 'where', abilities: 'abilities', req: 'req' });
/** per 的取值（卷三乙 §4.7.1 :1176 代码内封闭枚举，定义在 markers.mjs 的 code_enum req_per）。 */
export const PER = T.code_enum.req_per;
// 各计量选择器允许的 per（§4.7.1 表；classes 必须显式写，三者之一）。
const ALLOWED_PER = Object.freeze({
  [SEL.items]: [PER.piece],
  [SEL.classes]: [PER.piece, PER.kg, PER.pool],
  [SEL.matcats]: [PER.kg],
  [SEL.where]: [PER.kg],
});
// 组件类：Q-2 点名“产物模板挂 comp_crafted 且逐件建实例”的那一个（卷三乙 §4.5.3 Q-2 :1088）。
const COMP_CRAFTED = 'comp_crafted';

const tableOf = (engine, kind) => {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  if (!t) throw new KernelError(CODE.refMissing, {}, `kind ${JSON.stringify(kind)}: no dimension table`);
  return t;
};

/**
 * `recipeView(engine, state, id)`（卷三乙 §3.1、§5.2）：配方 id → {id, dims}；dims 是表头每个维度的基值 Fact（不是配方表的实体 id 抛 E-DIM-REF-MISSING）。
 * @param {any} engine @param {any} state @param {string} id
 */
export function recipeView(engine, state, id) {
  const t = tableOf(engine, KIND.recipe);
  const header = isObj(t.doc.dimensions) ? t.doc.dimensions : {};
  const dims = Object.fromEntries(Object.keys(header).sort(cmp).map((k) => [k, dim(engine, state, KIND.recipe, id, k)]));
  return Object.freeze({ id, dims: Object.freeze(dims) });
}

// 全部配方行（展平后，按代号序）。
function rowsOf(t) {
  const flat = t.flat && t.flat.rows instanceof Map ? t.flat.rows : new Map();
  return [...flat.keys()].sort(cmp).map((id) => [id, flat.get(id)]);
}

// 产出指名某物品的配方索引（item → 按 skillMin 升序、平局代号升序的 [{id, index}]）；表一旦载入就不变，按表对象记一份。
const indexMemo = new WeakMap();
function indexOf(t) {
  if (indexMemo.has(t)) return indexMemo.get(t);
  const by = new Map();
  for (const [id, row] of rowsOf(t)) {
    const outs = Array.isArray(row.outputs) ? row.outputs : [];
    outs.forEach((o, index) => {
      if (!isObj(o) || typeof o.item !== 'string') return;
      if (!by.has(o.item)) by.set(o.item, []);
      by.get(o.item).push({ id, index, skillMin: typeof row.skillMin === 'number' ? row.skillMin : null });
    });
  }
  for (const list of by.values()) list.sort((a, b) => (a.skillMin === null ? 1 : b.skillMin === null ? -1 : a.skillMin - b.skillMin) || cmp(a.id, b.id));
  indexMemo.set(t, by);
  return by;
}

/**
 * V-1 ① 的定价配方：产出指名该物品的配方里 skillMin 最低者，平局按配方代号字典序（skillMin 缺失者排最后）；没有返回 null。
 * 返回 {id, index}：index 是该配方 outputs 里指名该物品的那一条。
 * @param {any} engine @param {string} itemId @returns {{id: string, index: number} | null}
 */
export function pricingRecipeOf(engine, itemId) {
  const list = indexOf(tableOf(engine, KIND.recipe)).get(itemId);
  return list === undefined ? null : { id: list[0].id, index: list[0].index };
}

/**
 * 内联需求块的候选项展平：组按书写序、组内候选按书写序；返回 [[候选…]…]。`inputs` 是命名需求块引用（字串）或形状不合时返回 null。
 * @param {unknown} inputs @returns {object[][] | null}
 */
export function groupsOf(inputs) {
  if (!isObj(inputs) || !Array.isArray(inputs.groups)) return null;
  const out = [];
  for (const g of inputs.groups) {
    if (!Array.isArray(g) || g.some((c) => !isObj(c))) return null;
    out.push(g);
  }
  return out;
}

/** 候选项的计量选择器键（按 §4.7.1 表的次序）。 @param {object} c @returns {string[]} */
export const measuringKeys = (c) => [SEL.items, SEL.classes, SEL.matcats, SEL.where].filter((k) => Object.hasOwn(c, k));

/**
 * 一个候选项允许的 per 集合：各计量选择器允许集合的交集（单独的 where 只许 kg）；没有计量选择器返回 null。
 * @param {object} c @returns {string[] | null}
 */
export function allowedPer(c) {
  const keys = measuringKeys(c);
  if (!keys.length) return null;
  const withoutWhere = keys.filter((k) => k !== SEL.where);
  const use = withoutWhere.length ? withoutWhere : keys;
  return use.map((k) => ALLOWED_PER[k]).reduce((a, b) => a.filter((p) => b.includes(p)));
}

// ---------- 加载期校验 ----------

/**
 * 配方表的加载期校验。view：{vocab, rules, tables}（tables 含 item 表及其 itemDerived，用于 R-12 的类别成员判环与 Q-2）。返回 "<码> <所在> <说明>" 文字行。
 * @param {{vocab: any, rules: any, tables: Map<string, any>}} view @returns {string[]}
 */
export function checkRecipeTable(view) {
  const errors = [];
  const t = view.tables.get(KIND.recipe);
  if (!t) return errors;
  const itemT = view.tables.get(KIND.item);
  const derived = itemT && itemT.itemDerived instanceof Map ? itemT.itemDerived : new Map();
  const instanced = isObj(view.rules.items) && Array.isArray(view.rules.items.instancedComponents) ? view.rules.items.instancedComponents : [];
  const rows = rowsOf(t);
  // 物品模板的类别：手写组件类并上派生类别（itemDerived.classes 只有派生部分）。
  const classesOfItem = (id) => {
    const own = itemT && isObj(itemT.doc.rows) && itemT.doc.rows[id] && Array.isArray(itemT.doc.rows[id].classes) ? itemT.doc.rows[id].classes : [];
    const d = derived.get(id);
    return new Set([...own, ...(d ? d.classes : [])]);
  };
  for (const [id, row] of rows) {
    const at = `${KIND.recipe} ${id}`;
    const outs = Array.isArray(row.outputs) ? row.outputs : [];
    // R-6、V-1 三个除数的下界：基础留存率与产物条目 qty 都大于 0，算不出正件数的配方加载失败。
    if (isNumber(row.yield) && isNumber(row.wasteFraction) && !(fixedMultiply(fixedUnits(row.yield), fixedSub(fixedUnits(1), fixedUnits(row.wasteFraction))) > 0n)) {
      errors.push(`${CODE.range} ${at}: yield times (1 minus wasteFraction) must be > 0 (R-6, V-1 divisor)`);
    }
    outs.forEach((o, i) => { if (isObj(o) && typeof o.qty === 'number' && !(o.qty > 0)) errors.push(`${CODE.range} ${at}.outputs[${i}]: qty must be > 0 (R-6)`); });
    if (!outs.length) errors.push(`${CODE.structField} ${at}: outputs is empty`);
    // R-7：yieldCap 不小于 yield（品位列）。
    if (isNumber(row.yieldCap) && isNumber(row.yield) && row.yieldCap < row.yield) errors.push(`${CODE.range} ${at}: yieldCap must be >= yield (R-7)`);
    const groups = groupsOf(row.inputs);
    if (groups !== null) {
      groups.forEach((g, gi) => g.forEach((c, ci) => {
        const where = `${at}.inputs[${gi}][${ci}]`;
        const keys = measuringKeys(c);
        const hasAbility = Object.hasOwn(c, SEL.abilities);
        const hasReq = Object.hasOwn(c, SEL.req);
        if (hasReq && (keys.length || hasAbility)) errors.push(`${CODE.structField} ${where}: a nested req candidate carries no other selector (N-7)`);
        if (hasReq && Object.hasOwn(c, 'qty')) errors.push(`${CODE.structField} ${where}: a nested req candidate carries times, not qty (N-7)`);
        if (!hasReq && Object.hasOwn(c, 'times')) errors.push(`${CODE.structField} ${where}: times belongs to a nested req candidate (N-7)`);
        if (hasAbility) {
          if (keys.length || Object.hasOwn(c, 'qty') || Object.hasOwn(c, 'per') || c.consumed === true) errors.push(`${CODE.structField} ${where}: an abilities candidate carries no qty or per and consumed is false (N-7)`);
        } else if (!hasReq) {
          if (!keys.length) errors.push(`${CODE.structField} ${where}: candidate has no selector (N-7: items, classes, matcats, abilities, where or req)`);
          if (!isBool(c.consumed)) errors.push(`${CODE.required} ${where}: consumed is required (N-7)`);
          if (!(typeof c.qty === 'number' && c.qty > 0)) errors.push(`${CODE.range} ${where}: qty must be a number > 0 (N-7)`);
          const per = allowedPer(c);
          if (per !== null) {
            if (!isText(c.per)) errors.push(`${CODE.required} ${where}: per is required on a measured candidate (N-7)`);
            else if (!per.includes(c.per)) errors.push(`${CODE.structField} ${where}: per ${c.per} is not allowed for these selectors (allowed ${per.join('/') || 'none'}, N-7)`);
            if (c.consumed === false && c.per !== PER.piece) errors.push(`${CODE.structField} ${where}: a non-consumed candidate is counted per piece (N-7)`);
          }
        }
      }));
      // R-7：gradeFrom 所指输入组须存在且 consumed 为真（序号按展平后的组序，从 0 起）。
      if (typeof row.gradeFrom === 'number') {
        const g = groups[row.gradeFrom];
        if (g === undefined || !g.some((c) => c.consumed === true)) errors.push(`${CODE.range} ${at}: gradeFrom ${row.gradeFrom} must name a consumed input group (R-7)`);
      }
    }
    // Q-2：产物模板挂 comp_crafted 且逐件建实例时，qualityCurve 必填。
    const needsCurve = outs.some((o) => isObj(o) && typeof o.item === 'string' && (() => { const cs = classesOfItem(o.item); return cs.has(COMP_CRAFTED) && instanced.some((c) => cs.has(c)); })());
    if (needsCurve && row.qualityCurve === undefined) errors.push(`${CODE.required} ${at}: qualityCurve is required when an output template carries ${COMP_CRAFTED} and is made as instances (Q-2)`);
  }
  errors.push(...cycleErrors(rows, view, classesOfItem, itemT));
  return errors;
}

// R-12：配方图上“产物价值由成本推”的递归以基础材料外生为界，有环即 E-DIM-DERIVED-CYCLE。
// 边：物品 X（有定价配方）→ 定价配方每组第一个候选项里的指名物品（items 取第一个模板），或 classes 选中的全部成员（成员依赖本产物同样成环）。
function cycleErrors(rows, view, classesOfItem, itemT) {
  const t = view.tables.get(KIND.recipe);
  const by = indexOf(t);
  const flat = t.flat.rows;
  const itemIds = itemT && itemT.flat && itemT.flat.rows instanceof Map ? [...itemT.flat.rows.keys()].sort(cmp) : [];
  const edges = new Map();
  for (const [item, list] of by) {
    const row = flat.get(list[0].id);
    const groups = groupsOf(row.inputs);
    const deps = new Set();
    for (const g of groups || []) {
      const c = g[0];
      if (!isObj(c) || c.consumed === false || Object.hasOwn(c, SEL.abilities)) continue;
      if (Array.isArray(c.items) && c.items.length) deps.add([...c.items].sort(cmp)[0]);
      else if (Array.isArray(c.classes)) for (const m of itemIds) if (c.classes.some((k) => classesOfItem(m).has(k))) deps.add(m);
    }
    edges.set(item, [...deps].sort(cmp));
  }
  const errors = [];
  const onPath = new Set(); // 深度优先里当前路径上的物品；再碰到它即成环
  const done = new Set(); // 已走完的物品
  const walk = (n, path) => {
    onPath.add(n);
    for (const m of edges.get(n) || []) {
      if (onPath.has(m)) { errors.push(`${CODE.cycle} recipe graph: ${[...path, n, m].join(' -> ')} (R-12)`); continue; }
      if (!done.has(m) && edges.has(m)) walk(m, [...path, n]);
    }
    onPath.delete(n);
    done.add(n);
  };
  for (const n of [...edges.keys()].sort(cmp)) if (!done.has(n)) walk(n, []);
  return errors;
}
