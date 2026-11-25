// 身体读入口 `bodyView`（卷四《生物身体与人物》§3.1 :409、§4.2 :513–:545、§4.11 :1016–:1030）：`body.*` 的唯一出处。
// 对每个能力 c，五项来源顺序固定（§4.11.3 C-1）：① 结构基值（B-1）→ ② 部位折算项（B-2 至 B-4：挂部位状态实例 → 部位完好度 → 按贡献折算的 add 项）
// → ③ 能力依赖项（B-5：按 limitedBy 拓扑序、读限制者最终值的 mul 项）→ ④ 登记的修正项（B-6，由内核修正项来源按修正键交来）→ ⑤ 管线钳位（B-7）。
// ②③ 是读入口在求值时合成的派生项（B-5a），不存放、不登记进 state.modifiers；②③④ 同入卷二 §3.3 九步管线（kernelApi modifiedWith）。
// 本文件不导出任何谓词（§3.2）：清醒、行动能力、死亡三问只在 action-capacity.mjs（卷二 §2.5）。本文件不写状态，纯读，不设缓存（C-6）。
// 不认任何物种、身体图、部位、组织或能力代号：能力取自 capability 族条目，部位与组织取自身体图行；数值一律定点（kernel/det-math.mjs）。

import { dim, modifiedWith } from './kernel/dimensions.mjs';
import { kindOf, kindOfEntity, CAPABILITY_NAMESPACE } from './kernel/vocab.mjs';
import { fixedUnits, fixedAdd, fixedSub, fixedMultiply, fixedDivide, fixedToNumber, fixedScale } from './kernel/det-math.mjs';
import { massOf } from './life.mjs';

// 卷文定名（卷四 §2.1、§2.2、§2.3、§2.4、§2.5）：维度、字段、族名与规则表键。
const S = Object.freeze({
  capFamily: 'capability',
  dim: Object.freeze({
    species: 'species', bodyPlanOverride: 'bodyPlanOverride', bodyPlan: 'bodyPlan', parts: 'parts', tissueFractions: 'tissueFractions',
    partIntegrity: 'partIntegrity', massKg: 'massKg', tissues: 'tissues', tissueDelta: 'tissueDelta',
  }),
  part: Object.freeze({ id: 'id', parent: 'parent', sizeFraction: 'sizeFraction', contributes: 'contributes', vital: 'vital', tissueOverride: 'tissueOverride' }),
  cap: Object.freeze({ dimKey: 'dimKey', limitedBy: 'limitedBy' }),
  // rules.body.integrity.lostBelow（§2.5：部位视为丧失的完好度阈值）；登在 rules.body.unbuilt 的键读到按未知。
  rules: Object.freeze({ table: 'body', integrity: 'integrity', lostBelow: 'lostBelow', unbuilt: 'unbuilt', lostBelowKey: 'integrity.lostBelow' }),
  stage: Object.freeze({ add: 'add', mul: 'mul' }),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const UNKNOWN = Object.freeze({ known: false, applicable: true });
const ONE = () => fixedScale();
const num = (f) => fixedToNumber(f);

// capability 族条目（代号 → {dimKey, limitedBy}），按代号升序。
function capabilities(engine) {
  const fam = engine.vocab && engine.vocab.families instanceof Map ? engine.vocab.families.get(S.capFamily) : undefined;
  const entries = fam && isObj(fam.entries) ? fam.entries : {};
  // limitedBy 缺（登记为未建条目字段）即 null：该能力的依赖项求不了，读数按未知（卷二 §1.6），不当作"不受限"。
  return Object.keys(entries).sort().map((code) => ({ code, dimKey: entries[code][S.cap.dimKey], limitedBy: isObj(entries[code][S.cap.limitedBy]) ? entries[code][S.cap.limitedBy] : null }));
}

// B-5 拓扑序：限制者先求（E-BODY-CAP-CYCLE 已在加载期保证无环），同层按代号。
function topoOrder(caps) {
  const byCode = new Map(caps.map((c) => [c.code, c]));
  const out = [];
  const done = new Set();
  const visit = (c) => {
    if (done.has(c.code)) return;
    done.add(c.code);
    for (const k of Object.keys(c.limitedBy || {}).sort()) if (byCode.has(k)) visit(byCode.get(k));
    out.push(c);
  };
  for (const c of caps) visit(c);
  return out;
}

// 有效身体图（B-9，C15-7）：个体 bodyPlanOverride 非空取它，否则取其物种的 bodyPlan。返回 {planId, speciesId}，读不到为 null。
function effectivePlan(engine, state, subjectKind, subjectId) {
  const sp = dim(engine, state, subjectKind, subjectId, S.dim.species);
  const speciesId = sp.known && typeof sp.value === 'string' ? sp.value : null;
  const over = dim(engine, state, subjectKind, subjectId, S.dim.bodyPlanOverride);
  if (over.known && typeof over.value === 'string') return { planId: over.value, speciesId };
  if (!speciesId) return { planId: null, speciesId };
  const plan = dim(engine, state, kindOf(speciesId), speciesId, S.dim.bodyPlan);
  return { planId: plan.known && typeof plan.value === 'string' ? plan.value : null, speciesId };
}

// rules.body.integrity.lostBelow 的定点值；规则表没登记或键缺即未知（卷二 §1.6，不以常数代替）。
function lostBelowOf(engine) {
  const table = isObj(engine.rules) && isObj(engine.rules[S.rules.table]) ? engine.rules[S.rules.table] : undefined;
  if (table && Array.isArray(table[S.rules.unbuilt]) && table[S.rules.unbuilt].includes(S.rules.lostBelowKey)) return null;
  const integrity = table && isObj(table[S.rules.integrity]) ? table[S.rules.integrity] : undefined;
  const v = integrity ? integrity[S.rules.lostBelow] : undefined;
  return typeof v === 'number' && Number.isFinite(v) ? fixedUnits(v) : null;
}

// B-1 / S-4：身体图各部位对能力 code 的贡献之和（定点）；部位没写这项能力即不贡献。
function structuralBase(parts, code) {
  let s = 0n;
  for (const p of parts) {
    const w = isObj(p[S.part.contributes]) ? p[S.part.contributes][code] : undefined;
    if (typeof w === 'number') s = fixedAdd(s, fixedUnits(w));
  }
  return s;
}

/**
 * 物种级能力基线（卷四 §4.1.3 S-4，speciesView 的 `capabilityBaseline`）：身体图 planId 各部位对每个能力的贡献之和（0 或 1），
 * 按能力的 dimKey 给出。读的是物种身体图本身（B-9 末句"物种级的派生量仍读物种身体图"），不经个体与修正。身体图读不到为 null。
 * @param {object} engine @param {object} state @param {string} planId
 * @returns {Readonly<Record<string, number>> | null}
 */
export function capabilityBaseline(engine, state, planId) {
  const f = dim(engine, state, kindOf(planId), planId, S.dim.parts);
  if (!f.known || !Array.isArray(f.value)) return null;
  return Object.freeze(Object.fromEntries(capabilities(engine).map((c) => [c.dimKey, num(structuralBase(f.value, c.code))])));
}

const sourceIds = (steps) => Object.freeze(steps.map((s) => (isObj(s.source) && s.source.id !== undefined ? s.source.id : null)));

/**
 * `bodyView(engine, state, subjectId)`（卷四 §3.1 :409；签名与返回形状按卷二 §2.2）：
 * `dims` = 表头 capabilities 段的每个能力（Fact，`base` = 结构基值，`value` = 管线结果，`chain` = 生效修正项的来源 id，`steps` = explain 逐段）
 * 与 `partIntegrity`（部位 → Fact）；另附 `parts`（展开后的部位表：大小、是否致命、完好度、有效完好度 eff、质量 Fact、各组织材料 Fact）
 * 与 `condition`（Σ 部位大小 × eff，只供显示与叙述）。主体没有可读的身体图时整份为 null。
 * @param {object} engine @param {object} state @param {string} subjectId
 */
export function bodyView(engine, state, subjectId) {
  const subjectKind = kindOfEntity(state, subjectId);
  const { planId, speciesId } = effectivePlan(engine, state, subjectKind, subjectId);
  if (!planId) return null;
  const planKind = kindOf(planId);
  const partsFact = dim(engine, state, planKind, planId, S.dim.parts);
  const parts = partsFact.known && Array.isArray(partsFact.value) ? partsFact.value : [];
  const byId = new Map(parts.map((p) => [p[S.part.id], p]));
  const lostBelow = lostBelowOf(engine);

  // B-2 部位完好度：基值恒 1，修正只来自挂该部位的状态实例（经内核修正项来源，按修正键 body_plan.partIntegrity[p] 交来）。
  const integrity = new Map();
  for (const p of parts) integrity.set(p[S.part.id], modifiedWith(engine, state, planKind, subjectId, S.dim.partIntegrity, { key: p[S.part.id], base: num(ONE()) }).fact);
  // B-3 丧失与传播：p 或其任一祖先的完好度 ≤ lostBelow 取 0，否则取 p 自己的完好度；上游的部分损伤不向下传播。阈值未知则 eff 未知。
  const eff = new Map();
  for (const p of parts) {
    if (lostBelow === null) { eff.set(p[S.part.id], null); continue; }
    let lost = false;
    for (let cur = p, seen = new Set(); cur && !seen.has(cur[S.part.id]); cur = byId.get(cur[S.part.parent])) {
      seen.add(cur[S.part.id]);
      if (fixedUnits(integrity.get(cur[S.part.id]).value) <= lostBelow) { lost = true; break; }
    }
    eff.set(p[S.part.id], lost ? 0n : fixedUnits(integrity.get(p[S.part.id]).value));
  }
  const effKnown = lostBelow !== null;

  // ①–⑤：按 limitedBy 拓扑序逐能力求值。
  const caps = topoOrder(capabilities(engine));
  const baseOf = new Map();
  const valueOf = new Map();
  const dims = {};
  for (const c of caps) {
    // ① B-1 结构基值：有效身体图各部位 contributes[c] 之和。
    const base = structuralBase(parts, c.code);
    baseOf.set(c.code, base);
    // 要用到部位 eff 的只有有部位贡献的能力（B-4）；没有部位贡献的能力 eff 未知也照常求值（C-2：确知的 0）。
    const needsEff = parts.some((p) => isObj(p[S.part.contributes]) && typeof p[S.part.contributes][c.code] === 'number' && p[S.part.contributes][c.code] > 0);
    if ((!effKnown && needsEff) || c.limitedBy === null) { dims[c.dimKey] = UNKNOWN; continue; }
    const derived = [];
    // ② B-4 部位折算项：每个 contributes[p][c] > 0 的部位一条，add，值 −contributes × (1 − eff(p))，来源 (身体图行, 部位 p)。
    for (const p of [...parts].sort((a, b) => cmp(a[S.part.id], b[S.part.id]))) {
      const w = isObj(p[S.part.contributes]) ? p[S.part.contributes][c.code] : undefined;
      if (!(typeof w === 'number' && w > 0)) continue;
      const v = -fixedMultiply(fixedUnits(w), fixedSub(ONE(), eff.get(p[S.part.id])));
      derived.push({ id: `${planId}/${p[S.part.id]}/${c.code}`, stage: S.stage.add, value: num(v), source: { kind: planKind, id: [planId, p[S.part.id]], via: p[S.part.id] } });
    }
    // ③ B-5 能力依赖项：每个 base_k > 0 的限制者 k（权重 w）一条，mul，值 −w × (1 − v_k ÷ base_k)，unpenalized，来源 (能力 c, 限制者 k)。
    let depKnown = true;
    for (const k of Object.keys(c.limitedBy).sort()) {
      const bk = baseOf.get(k);
      if (bk === undefined || bk <= 0n) continue;
      if (!valueOf.has(k)) { depKnown = false; break; }
      const v = -fixedMultiply(fixedUnits(c.limitedBy[k]), fixedSub(ONE(), fixedDivide(valueOf.get(k), bk)));
      derived.push({ id: `${c.code}/${k}`, stage: S.stage.mul, value: num(v), unpenalized: true, source: { kind: S.capFamily, id: [c.code, k], via: k } });
    }
    if (!depKnown) { dims[c.dimKey] = UNKNOWN; continue; }
    // ④⑤ 登记的修正项与钳位：内核同一条管线（modifiedWith 收修正项来源按 body.<c> 交来的登记项）。
    const r = modifiedWith(engine, state, CAPABILITY_NAMESPACE, subjectId, c.dimKey, { base: num(base), derived });
    valueOf.set(c.code, fixedUnits(r.fact.value));
    dims[c.dimKey] = Object.freeze({ ...r.fact, chain: sourceIds(r.steps), steps: r.steps });
  }
  dims[S.dim.partIntegrity] = Object.freeze(Object.fromEntries(parts.map((p) => [p[S.part.id], integrity.get(p[S.part.id])])));

  // 主体体重（卷四 §4.4 L-2；个体表的 massKg 登记为未建派生，由 life.mjs 求，别的表照常经修正管线读）。
  const mass = massOf(engine, state, subjectId);
  const tissueKeys = (() => { const f = dim(engine, state, planKind, planId, S.dim.tissueFractions); return f.known && isObj(f.value) ? Object.keys(f.value).sort() : []; })();
  const out = parts.map((p) => {
    const id = p[S.part.id];
    const e = eff.get(id);
    return Object.freeze({
      id, parent: p[S.part.parent], sizeFraction: p[S.part.sizeFraction], vital: p[S.part.vital] === true,
      integrity: integrity.get(id).value, eff: e === null ? null : num(e),
      // B-9 部位质量 = 主体 massKg × sizeFraction；主体体重未知即未知。
      massKg: mass.known && typeof mass.value === 'number' ? Object.freeze({ known: true, applicable: true, value: num(fixedMultiply(fixedUnits(mass.value), fixedUnits(p[S.part.sizeFraction]))) }) : UNKNOWN,
      tissues: Object.freeze(Object.fromEntries(tissueKeys.map((t) => [t, tissueMaterial(engine, state, subjectKind, subjectId, speciesId, p, t)]))),
    });
  });
  // condition = Σ sizeFraction × eff（§3.1；完好主体恒为 1）。
  const condition = effKnown ? num(parts.reduce((s, p) => fixedAdd(s, fixedMultiply(fixedUnits(p[S.part.sizeFraction]), eff.get(p[S.part.id]))), 0n)) : null;
  return Object.freeze({ bodyPlan: planId, dims: Object.freeze(dims), parts: Object.freeze(out), condition });
}

// B-9 部位 p 某组织 t 的材料：个体 tissueDelta[p][t] → 有效身体图部位 p 的 tissueOverride[t] → 物种 tissues[t]；三处都没有即未知，不以别的材料代替。
function tissueMaterial(engine, state, subjectKind, subjectId, speciesId, part, tissue) {
  const delta = dim(engine, state, subjectKind, subjectId, S.dim.tissueDelta, { key: part[S.part.id] });
  if (delta.known && isObj(delta.value) && typeof delta.value[tissue] === 'string') return Object.freeze({ known: true, applicable: true, value: delta.value[tissue], source: 'instance' });
  const over = part[S.part.tissueOverride];
  if (isObj(over) && typeof over[tissue] === 'string') return Object.freeze({ known: true, applicable: true, value: over[tissue], source: 'class' });
  if (speciesId) {
    const f = dim(engine, state, kindOf(speciesId), speciesId, S.dim.tissues, { key: tissue });
    if (f.known && typeof f.value === 'string') return f;
  }
  return UNKNOWN;
}
