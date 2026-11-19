// 卷四《生物身体与人物》本卷表与词表族的加载期跨字段校验（卷四 §2.1、§2.2 校验栏与"身体图不变量"、§2.4 条目字段、§2.7 错误码）。
// 统一加载器在维度校验通过后调一次（kernel/load/world.mjs，与 checkVerbRows、checkHoldingKindRows 同一处），违者加载失败。
// 只读已展平的行、词表条目与表头；不认任何具体物种、身体图、部位、组织或能力代号，表名、族名、字段名都是卷文定名，收在下面 S 里。
// 数值比较一律定点（kernel/det-math.mjs）：份额之和"= 1"按定点整数相等判，不用浮点。

import { fixedUnits, fixedAdd, fixedScale } from '../det-math.mjs';
import { KEY_RE } from './types.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const sortedKeys = (o) => Object.keys(o).sort();
// 映射展平后覆盖全族、"没有"的键写 null（卷二 §1.6 第 4 项）；卷文说的"键集"即值非 null 的键。
const presentKeys = (o) => Object.keys(o).filter((k) => o[k] !== null).sort();
const sameKeys = (a, b) => { const x = presentKeys(a); const y = presentKeys(b); return x.length === y.length && x.every((k, i) => k === y[i]); };
const presentValues = (o) => Object.values(o).filter((v) => v !== null);

// 卷文定名（卷四 §2.1、§2.2、§2.4；卷二 §3.6 表头 capabilities 段）。身体图表的 kind 不写字面量：取物种表 bodyPlan 维度所引的表（§2.1 `ref body_plan`）。
const S = Object.freeze({
  speciesKind: 'species',
  capsSection: 'capabilities',
  family: Object.freeze({ capability: 'capability', attr: 'attr' }),
  dim: Object.freeze({
    parts: 'parts', tissueFractions: 'tissueFractions', bodyPlan: 'bodyPlan', tissues: 'tissues', attributesBase: 'attributesBase',
    gaits: 'gaits', speedBase: 'speedBase', sexes: 'sexes', diet: 'diet', dietShares: 'dietShares', maturityYears: 'maturityYears',
  }),
  part: Object.freeze({ id: 'id', parent: 'parent', sizeFraction: 'sizeFraction', contributes: 'contributes', vital: 'vital', tissueOverride: 'tissueOverride' }),
  cap: Object.freeze({ dimKey: 'dimKey', limitedBy: 'limitedBy' }),
  // 有向图遍历的两种标记（同 kernel/events.mjs 上位词无环检查）。
  mark: Object.freeze({ open: 'open', done: 'done' }),
});

// §2.4 本卷词表族的条目字段（"列定义"）：字段 → 取值类型。capability 的 limitedBy 另按能力族核对键与权重（下面 checkCapabilities）。
// 类型记号：boolean；integer；count（正整数）；fraction（[0,1] 的数）；number（有限数）；key（维度键文法的字串）；string（非空字串）；capRef（capability 族条目）；capWeights（map<capability 条目, fraction>）。
const FIELD_TYPES = Object.freeze({ boolean: 'boolean', integer: 'integer', count: 'count', fraction: 'fraction', number: 'number', key: 'key', string: 'string', capRef: 'capRef', capWeights: 'capWeights' });
const T = FIELD_TYPES;
const ENTRY_FIELDS = Object.freeze({
  capability: { dimKey: T.key, limitedBy: T.capWeights },
  tissue: { depthOrder: T.integer, reserve: T.boolean },
  attr: { physical: T.boolean, hidden: T.boolean, heritability: T.fraction, residualFactor: T.number, agingCurve: T.string },
  gait: { drivenBy: T.capRef, exertion: T.number },
  life_stage: { adult: T.boolean, fertile: T.boolean },
  sex: { bears: T.boolean },
  trait: { heritability: T.fraction, residualFactor: T.number, visible: T.boolean, bands: T.count },
});

const finite = (v) => typeof v === 'number' && Number.isFinite(v);
// 条目字段取值是否合类型；capability 族条目表 caps 供 capRef 与 capWeights 核对。
function fieldOk(type, v, caps) {
  switch (type) {
    case T.boolean: return typeof v === 'boolean';
    case T.integer: return Number.isInteger(v);
    case T.count: return Number.isInteger(v) && v > 0;
    case T.fraction: return finite(v) && v >= 0 && v <= 1;
    case T.number: return finite(v);
    case T.key: return typeof v === 'string' && KEY_RE.test(v);
    case T.string: return typeof v === 'string' && v.length > 0;
    case T.capRef: return typeof v === 'string' && Object.hasOwn(caps, v);
    case T.capWeights: return isObj(v) && Object.entries(v).every(([k, w]) => Object.hasOwn(caps, k) && finite(w) && w >= 0 && w <= 1);
    default: return false;
  }
}

// 份额之和（定点）；值须是有限数，已由维度校验保证。
const fixedSum = (values) => values.reduce((s, v) => fixedAdd(s, fixedUnits(v)), 0n);

/**
 * @param {{vocab: {families: Map<string, {entries: Record<string, object>}>}, tables: Map<string, {doc: object, flat?: {rows: Map<string, object>}}>}} view
 * @param {{maxChainDepth: number, unbuiltFields?: Map<string, Set<string>>}} limits maxChainDepth：§2.2"链深 ≤ 8"的上限，取自内核常数表
 *   kernelConstants.bodyPartChainMaxDepth（卷二 S10）；unbuiltFields：未建条目字段登记（维度校验器读入的 _unbuilt-derived.json fields）
 * @returns {{code: string, level: string, table: string, row: string, dim: string, path: string, got: unknown, want: string}[]}
 */
export function checkBodyTables(view, limits) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}${row ? '/' + row : ''}${dim ? '#' + dim : ''}`, got, want });
  const families = view.vocab && view.vocab.families instanceof Map ? view.vocab.families : new Map();
  const entriesOf = (name) => (families.has(name) && isObj(families.get(name).entries) ? families.get(name).entries : {});
  const caps = entriesOf(S.family.capability);

  // §2.4 条目字段：每条必写、类型合；登记为未建条目字段（_unbuilt-derived.json fields）的缺值放行、写了照常核对。
  const unbuilt = limits.unbuiltFields instanceof Map ? limits.unbuiltFields : new Map();
  for (const [family, set] of [...unbuilt].sort(([a], [b]) => cmp(a, b))) {
    // 现只有本卷七族有条目字段的核对处；别的族登记了也没人放行，按登记所指不存在报（不让登记成为空转的后门）。
    if (!Object.hasOwn(ENTRY_FIELDS, family)) { push('E-DIM-REF-MISSING', '_unbuilt-derived', family, '', family, `family whose entry fields are checked (${Object.keys(ENTRY_FIELDS).join(',')})`); continue; }
    for (const f of [...set].sort()) if (!Object.hasOwn(ENTRY_FIELDS[family], f)) push('E-DIM-STRUCT-FIELD', '_unbuilt-derived', family, f, f, `entry field of ${family} (${Object.keys(ENTRY_FIELDS[family]).join(',')})`);
  }
  for (const [family, fields] of Object.entries(ENTRY_FIELDS).sort(([a], [b]) => cmp(a, b))) {
    const open = unbuilt.get(family) || new Set();
    for (const [id, entry] of Object.entries(entriesOf(family)).sort(([a], [b]) => cmp(a, b))) {
      for (const [field, type] of Object.entries(fields)) {
        const v = isObj(entry) ? entry[field] : undefined;
        if (v === undefined && open.has(field)) continue;
        if (!fieldOk(type, v, caps)) push('E-DIM-STRUCT-FIELD', '_vocab', id, field, v === undefined ? 'missing' : v, `${family} entry field ${field}: ${type}`);
      }
    }
  }
  checkCapabilities(caps, push);

  const species = view.tables instanceof Map ? view.tables.get(S.speciesKind) : undefined;
  const planRef = species && isObj(species.doc) && isObj(species.doc.dimensions) && isObj(species.doc.dimensions[S.dim.bodyPlan]) ? species.doc.dimensions[S.dim.bodyPlan].kind : undefined;
  const planKind = typeof planRef === 'string' ? planRef : undefined;
  const plans = planKind && view.tables instanceof Map ? view.tables.get(planKind) : undefined;
  const flatRows = (t) => (t && t.flat && t.flat.rows instanceof Map ? t.flat.rows : new Map());
  if (plans) {
    // §2.2 表头 capabilities 段：段内键集 = capability 族全部条目的 dimKey。
    const section = isObj(plans.doc) && isObj(plans.doc[S.capsSection]) ? plans.doc[S.capsSection] : {};
    const dimKeys = Object.values(caps).filter((e) => isObj(e) && typeof e[S.cap.dimKey] === 'string').map((e) => e[S.cap.dimKey]).sort();
    const have = sortedKeys(section);
    if (have.length !== dimKeys.length || have.some((k, i) => k !== dimKeys[i])) push('E-DIM-STRUCT-FIELD', planKind, '', S.capsSection, have, `capabilities keys = dimKey of every capability entry (${dimKeys.join(',')})`);
    const bad = (code, row, dim, got, want) => push(code, planKind, row, dim, got, want);
    for (const [id, row] of [...flatRows(plans)].sort(([a], [b]) => cmp(a, b))) checkPlanRow(id, row, limits.maxChainDepth, bad);
  }
  if (species) {
    const planRows = flatRows(plans);
    for (const [id, row] of [...flatRows(species)].sort(([a], [b]) => cmp(a, b))) checkSpeciesRow(id, row, planRows, entriesOf, push);
  }
  return errors;
}

// capability 族：dimKey 族内不重；limitedBy 无环（E-BODY-CAP-CYCLE），不含自身。
function checkCapabilities(caps, push) {
  const seen = new Map();
  for (const [id, e] of Object.entries(caps).sort(([a], [b]) => cmp(a, b))) {
    const k = isObj(e) ? e[S.cap.dimKey] : undefined;
    if (typeof k !== 'string') continue;
    if (seen.has(k)) push('E-DIM-DUPLICATE-KEY', '_vocab', id, S.cap.dimKey, k, `dimKey unique in capability family (also ${seen.get(k)})`);
    else seen.set(k, id);
  }
  const marks = new Map();
  const visit = (id, trail) => {
    if (marks.get(id) === S.mark.done) return;
    if (marks.get(id) === S.mark.open) { push('E-BODY-CAP-CYCLE', '_vocab', id, S.cap.limitedBy, [...trail, id], 'acyclic limitedBy'); return; }
    marks.set(id, S.mark.open);
    const lim = isObj(caps[id]) && isObj(caps[id][S.cap.limitedBy]) ? caps[id][S.cap.limitedBy] : {};
    for (const k of sortedKeys(lim)) if (Object.hasOwn(caps, k)) visit(k, [...trail, id]);
    marks.set(id, S.mark.done);
  };
  for (const id of sortedKeys(caps)) visit(id, []);
}

// §2.2 身体图不变量（E-BODY-PLAN-SHAPE）与 tissueFractions 和 = 1（取值域，E-DIM-DOMAIN-RANGE）。
function checkPlanRow(id, row, maxChainDepth, report) {
  const bad = (got, want) => report('E-BODY-PLAN-SHAPE', id, S.dim.parts, got, want);
  const fractions = isObj(row[S.dim.tissueFractions]) ? row[S.dim.tissueFractions] : {};
  const fvals = presentValues(fractions);
  if (fvals.length && fixedSum(fvals) !== fixedScale()) report('E-DIM-DOMAIN-RANGE', id, S.dim.tissueFractions, fvals, 'tissue fractions sum to 1');
  const parts = Array.isArray(row[S.dim.parts]) ? row[S.dim.parts].filter(isObj) : [];
  const byId = new Map();
  for (const p of parts) {
    if (byId.has(p[S.part.id])) bad(p[S.part.id], 'part ids unique');
    byId.set(p[S.part.id], p);
  }
  const roots = parts.filter((p) => p[S.part.parent] === null);
  if (roots.length !== 1) bad(roots.map((p) => p[S.part.id]), 'exactly one root (parent null)');
  for (const p of parts) {
    const up = p[S.part.parent];
    if (up !== null && !byId.has(up)) bad(`${p[S.part.id]}->${up}`, 'parent is a part of this plan');
  }
  // 无环、链深：沿 parent 上溯，经过的部位个数（含自身）不超过上限，重回已经过的部位即环。
  for (const p of parts) {
    const chain = [p[S.part.id]];
    let cur = p;
    while (cur && cur[S.part.parent] !== null && byId.has(cur[S.part.parent])) {
      const up = cur[S.part.parent];
      if (chain.includes(up)) { bad([...chain, up], 'acyclic parent chain'); break; }
      chain.push(up);
      cur = byId.get(up);
    }
    if (chain.length > maxChainDepth) bad(chain, `chain depth <= ${maxChainDepth}`);
  }
  if (parts.length && fixedSum(parts.map((p) => p[S.part.sizeFraction])) !== fixedScale()) bad(parts.map((p) => p[S.part.sizeFraction]), 'sizeFraction sums to 1');
  // 每个能力在全部部位上的贡献之和为 0 或 1。
  const totals = new Map();
  for (const p of parts) for (const [c, w] of Object.entries(isObj(p[S.part.contributes]) ? p[S.part.contributes] : {})) totals.set(c, fixedAdd(totals.get(c) || 0n, fixedUnits(w)));
  for (const [c, total] of [...totals].sort(([a], [b]) => cmp(a, b))) if (total !== 0n && total !== fixedScale()) bad(`${c}`, 'contributions of a capability sum to 0 or 1');
  if (parts.length && !parts.some((p) => p[S.part.vital] === true)) bad('no vital part', 'at least one vital part');
  for (const p of parts) {
    const over = p[S.part.tissueOverride];
    if (isObj(over)) for (const t of presentKeys(over)) if (fractions[t] === null || fractions[t] === undefined) bad(`${p[S.part.id]}:${t}`, 'tissueOverride keys within tissueFractions');
  }
}

// §2.1 物种行跨字段校验：组织键集（E-BODY-TISSUE-KEYS）、属性键集（E-SPECIES-ATTR-KEYS）与本卷几个键集、权重、份额栏。
function checkSpeciesRow(id, row, planRows, entriesOf, push) {
  const plan = typeof row[S.dim.bodyPlan] === 'string' ? planRows.get(row[S.dim.bodyPlan]) : undefined;
  const tissues = row[S.dim.tissues];
  if (plan && isObj(tissues) && isObj(plan[S.dim.tissueFractions]) && !sameKeys(tissues, plan[S.dim.tissueFractions])) {
    push('E-BODY-TISSUE-KEYS', S.speciesKind, id, S.dim.tissues, presentKeys(tissues), `keys of ${row[S.dim.bodyPlan]}.tissueFractions (${presentKeys(plan[S.dim.tissueFractions]).join(',')})`);
  }
  const attrs = row[S.dim.attributesBase];
  if (isObj(attrs) && !sameKeys(attrs, entriesOf(S.family.attr))) push('E-SPECIES-ATTR-KEYS', S.speciesKind, id, S.dim.attributesBase, presentKeys(attrs), 'every attr entry, nothing else');
  // gaits：至少一个值非空，除非 speedBase = 0（键集覆盖 gait 全族由映射键集规则保证，卷二 §1.6 第 4 项）。
  const gaits = row[S.dim.gaits];
  if (isObj(gaits) && row[S.dim.speedBase] !== 0 && !presentValues(gaits).length) push('E-DIM-DOMAIN-RANGE', S.speciesKind, id, S.dim.gaits, gaits, 'at least one non-null gait unless speedBase = 0');
  // maturityYears 取值域 (0, 10000]（§2.1）：表头 domain 只写得出闭区间 [0, 10000]，下端开口在此核。
  if (row[S.dim.maturityYears] === 0) push('E-DIM-DOMAIN-RANGE', S.speciesKind, id, S.dim.maturityYears, 0, '(0, 10000] year');
  // sexes：权重和 > 0。
  const sexes = row[S.dim.sexes];
  if (isObj(sexes) && !(fixedSum(presentValues(sexes)) > 0n)) push('E-DIM-DOMAIN-RANGE', S.speciesKind, id, S.dim.sexes, sexes, 'sex weights sum > 0');
  // dietShares：有份额的键 = diet，和 = 1（diet 非空时）。
  const diet = row[S.dim.diet];
  const shares = row[S.dim.dietShares];
  if (Array.isArray(diet) && diet.length && isObj(shares)) {
    const keys = presentKeys(shares);
    const want = [...diet].sort();
    if (keys.length !== want.length || keys.some((k, i) => k !== want[i]) || fixedSum(presentValues(shares)) !== fixedScale()) push('E-DIM-DOMAIN-RANGE', S.speciesKind, id, S.dim.dietShares, shares, 'keys = diet, shares sum to 1');
  }
}
