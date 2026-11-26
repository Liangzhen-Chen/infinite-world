// 身体读入口 bodyView（卷四 §3.1 :410、§4.2.3 B-1 至 B-9）：全书唯一给出 body.* 的地方。纯读，不写状态。
// 主体：表头声明 bodyPlan 的实体（物种行或以物种行为 template 新建的实体，卷二:131）读自身；否则经主体的 species 维度找物种（个体）。
// 有效身体图（B-9）：主体 bodyPlanOverride 非空取它，否则取物种 bodyPlan。部位完好度（B-2）基值恒 1，只接受挂部位状态实例的修正——
// 状态实例的写者 status.mjs 未建，故此处完好度即基值；有效完好度 eff 按 B-3 读 rules.body.integrity.lostBelow。
// 能力值（B-7）：结构基值（B-1）加 B-4 部位折算项，再过登记修正来源（kernel modifiedWith），钳到表头 bounds。B-5 能力依赖项未建：能力族条目带非空 limitedBy 即报未知读取，不静默略过。
// 部位质量 = 主体 massKg × sizeFraction（B-9）。主体质量按卷四 L-2 派生（individualMassKg，S2-0b）：adultMassKg × lookup(rules.life.growthCurve, relMaturity)，
// relMaturity = 年龄 ÷ 物种 maturityYears，年龄 = 时钟 − birthMinute，单位换算一律取单位表（_units.json si / siFromRule），不写单位代号；物种实体自身没有个体质量，读出未知。组织材料按 B-9 优先级：主体 tissueDelta → 部位 tissueOverride → 物种 tissues。
// 遍历映射一律经 presentEntries（null 键不进）；不认任何具体物种、身体图、部位、组织或能力代号，也不按 kind 分支（只看表头声明）。
import { dim, modifiedWith, presentEntries, lookupCurve } from '../../kernel/dimensions.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { KernelError } from '../../kernel/errors.mjs';
import { fixedUnits, fixedSub, fixedMultiply, fixedAdd, fixedScale, fixedToNumber } from '../../kernel/det-math.mjs';
import { SPECIES_KIND, DIM, tableOf, headerOf, planKindOf, structuralBase, fixedZero } from './body-plan.mjs';
import { UNKNOWN } from './species.mjs';
import { ruleValue } from '../load/registry.mjs';

/** @typedef {import('./body-plan.mjs').BodyEngine} BodyEngine */
/** @typedef {import('./body-plan.mjs').Part} Part */
/**
 * 主体的身体（B-9）。
 * @typedef {{kind: string, speciesId: string, planKind: string, planId: string, parts: ReadonlyArray<Part>, fractions: ReadonlyArray<readonly [string, unknown]>, tissues: unknown, delta: unknown}} Body
 */

// 卷四 §2.3 个体维度名（个体 → 物种、个体级身体图与组织偏离）与 §2.2 实例维度名。
const PERSON_DIM = Object.freeze({ species: 'species', bodyPlanOverride: 'bodyPlanOverride', tissueDelta: 'tissueDelta', massKg: 'massKg', adultMassKg: 'adultMassKg', birthMinute: 'birthMinute' });
// 卷四 §2.1 物种维度（成熟年龄）与 §2.5 rules.life 的成长曲线键（L-2）。
const MATURITY_DIM = 'maturityYears';
const LIFE_TABLE = 'life';
const GROWTH_CURVE = 'growthCurve';
// 单位表 siFromRule.key 的写法 "rules.<表>.<键>"（卷二 §1.4）。
const RULE_KEY_RE = /^rules\.([A-Za-z][A-Za-z0-9]*)\.([A-Za-z][A-Za-z0-9]*)$/;
const PART_INTEGRITY = 'partIntegrity';
// 卷二 §1.6 onUnknown 取值：skip = 缺值不参与。
const ON_UNKNOWN_SKIP = 'skip';

/**
 * onUnknown 为 skip 的可选维度：表头没声明或该主体没有值即 null（卷二 §1.6）；其余错误照抛。
 * @param {BodyEngine} engine @param {unknown} state @param {string} kind @param {string} id @param {string} dimension @returns {unknown}
 */
function optional(engine, state, kind, id, dimension) {
  if (headerOf(engine, kind, dimension).onUnknown !== ON_UNKNOWN_SKIP) return null;
  try {
    return dim(engine, state, kind, id, dimension).value;
  } catch (e) {
    if (Object(e).code === 'E-DIM-UNKNOWN-READ') return null;
    throw e;
  }
}

/**
 * 主体的物种实体、有效身体图与主体级组织偏离（B-9）。表头声明了 bodyPlan 的表，主体自身即物种实体；否则读主体的 species 维度。
 * @param {BodyEngine} engine @param {unknown} state @param {string} subjectId @returns {Body}
 */
export function bodyOf(engine, state, subjectId) {
  const kind = kindOfEntity(engine, state, subjectId);
  const ownPlan = Object.keys(headerOf(engine, kind, DIM.bodyPlan)).length > 0;
  const speciesId = ownPlan ? subjectId : dim(engine, state, kind, subjectId, PERSON_DIM.species).value;
  const override = optional(engine, state, kind, subjectId, PERSON_DIM.bodyPlanOverride);
  const planId = override !== null && override !== undefined ? String(override) : dim(engine, state, SPECIES_KIND, speciesId, DIM.bodyPlan).value;
  const planKind = planKindOf(engine);
  return {
    kind, speciesId, planKind, planId,
    parts: dim(engine, state, planKind, planId, DIM.parts).value,
    fractions: presentEntries(dim(engine, state, planKind, planId, DIM.tissueFractions).value),
    tissues: dim(engine, state, SPECIES_KIND, speciesId, DIM.tissues).value,
    delta: optional(engine, state, kind, subjectId, PERSON_DIM.tissueDelta),
  };
}

/**
 * 一个单位的 si 值，作有理数 [分子, 分母]（BigInt，定点 fixedUnits 折算，不经浮点）：单位表行写 si 即取它；写 siFromRule 的，取所指规则表键
 * （数值，或 {num, den} 有理数）乘以其 unit 的 si，invert 为真取倒数（卷二 §1.4 单位表）。单位缺行、规则键写法不合即 E-DIM-UNIT-UNKNOWN。
 * @param {BodyEngine} engine @param {unknown} unit @returns {[bigint, bigint]}
 */
function siOf(engine, unit) {
  const doc = Object(engine.docData);
  /** @type {unknown[]} */
  const units = Array.isArray(Object(doc.unitsDoc).units) ? Object(doc.unitsDoc).units : [];
  const row = Object(units.find((u) => Object(u).id === unit));
  const one = fixedScale();
  if (row.si !== undefined) return [fixedUnits(Number(row.si)), one];
  const rule = Object(row.siFromRule);
  const m = typeof rule.key === 'string' ? RULE_KEY_RE.exec(rule.key) : null;
  if (m === null) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, `unit ${JSON.stringify(unit)}: no si or siFromRule in the units table`);
  const [, table, key] = m;
  const v = ruleValue(doc, table, key);
  /** @type {[bigint, bigint]} */
  const ratio = typeof v === 'number' ? [fixedUnits(v), one] : [BigInt(Number(Object(v).num)), BigInt(Number(Object(v).den))];
  const [bn, bd] = siOf(engine, rule.unit);
  return rule.invert === true ? [ratio[1] * bd, ratio[0] * bn] : [ratio[0] * bn, ratio[1] * bd];
}

/**
 * 个体质量（卷四 §2.3 :220、§4.4 L-2）：massKg = adultMassKg × lookup(rules.life.growthCurve, relMaturity)，
 * relMaturity = (clock − birthMinute) ÷ 物种 maturityYears（卷四 §2.3 :212–:213），两边各按表头单位换成 si 后相除（有理数，最后一次整除截断）。
 * 再过登记修正来源（massKg 表头 modifiable）。主体表头没有声明 massKg（物种实体）或任一输入读出未知（E-DIM-UNKNOWN-READ）即未知。
 * @param {BodyEngine} engine @param {unknown} state @param {Body} body @param {string} subjectId
 */
function individualMassKg(engine, state, body, subjectId) {
  if (Object.keys(headerOf(engine, body.kind, PERSON_DIM.massKg)).length === 0 || body.speciesId === subjectId) return UNKNOWN;
  let adult; let birth; let maturity;
  try {
    adult = dim(engine, state, body.kind, subjectId, PERSON_DIM.adultMassKg).value;
    birth = dim(engine, state, body.kind, subjectId, PERSON_DIM.birthMinute).value;
    maturity = dim(engine, state, SPECIES_KIND, body.speciesId, MATURITY_DIM).value;
  } catch (e) {
    if (Object(e).code === 'E-DIM-UNKNOWN-READ') return UNKNOWN;
    throw e;
  }
  const [an, ad] = siOf(engine, headerOf(engine, body.kind, PERSON_DIM.birthMinute).unit);
  const [mn, md] = siOf(engine, headerOf(engine, SPECIES_KIND, MATURITY_DIM).unit);
  const one = fixedScale();
  const age = BigInt(clockMinute(engine, state) - Number(birth));
  const mat = fixedUnits(Number(maturity));
  if (mat <= fixedZero()) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `species ${JSON.stringify(body.speciesId)}: ${MATURITY_DIM} must be > 0`);
  // relMaturity（定点）= age·an/ad ÷ (mat/one · mn/md) × one。
  const rel = (age * an * md * one * one) / (ad * mat * mn);
  const y = lookupCurve(ruleValue(engine.docData, LIFE_TABLE, GROWTH_CURVE), rel);
  const base = fixedToNumber(fixedMultiply(fixedUnits(Number(adult)), y));
  return modifiedWith(engine, state, body.kind, subjectId, PERSON_DIM.massKg, base, []);
}

/**
 * 部位 p 组织 t 的材料（B-9）：主体 tissueDelta[p][t] → 部位 tissueOverride[t] → 物种 tissues[t]，取第一个非 null 者；三处都没有即 undefined（缺口，不以别的材料代替）。
 * @param {Body} body @param {Part} part @param {string} tissue @returns {string | undefined}
 */
export function tissueMaterial(body, part, tissue) {
  const pick = (/** @type {unknown} */ map) => (map === null || map === undefined ? undefined : presentEntries(map).find(([t]) => t === tissue));
  const deltaRow = body.delta === null || body.delta === undefined ? undefined : presentEntries(body.delta).find(([p]) => p === part.id);
  const hit = (deltaRow === undefined ? undefined : pick(deltaRow[1])) ?? pick(part.tissueOverride) ?? pick(body.tissues);
  return hit === undefined ? undefined : String(hit[1]);
}

/**
 * 有效完好度（B-3）：部位或其任一祖先的完好度 ≤ lostBelow 即 0（丧失并向下传播），否则取本部位完好度。integrity: 部位 id → 定点。
 * @param {Map<string, Part>} byId @param {Map<string, bigint>} integrity @param {bigint} lostBelow @param {Part} part @returns {bigint}
 */
function effOf(byId, integrity, lostBelow, part) {
  for (let at = part; at !== undefined; at = at.parent === null ? undefined : byId.get(at.parent)) {
    if ((integrity.get(at.id) ?? fixedZero()) <= lostBelow) return fixedZero();
  }
  return integrity.get(part.id) ?? fixedZero();
}

/**
 * kernelApi 读入口 bodyView(engine, state, subjectId)（卷四 §3.1 :410）。
 * 返回 {kind, id, bodyPlan, massKg: Fact, dims: {<能力 dimKey>: Fact（base = 结构基值）, partIntegrity: Fact}, parts: [{id, parent, sizeFraction, vital, integrity, eff, massKg: Fact, tissues: {<组织>: Fact}}], condition}。
 * @param {BodyEngine} engine @param {unknown} state @param {string} subjectId
 */
export function bodyView(engine, state, subjectId) {
  const body = bodyOf(engine, state, subjectId);
  const one = fixedScale();
  const lostBelow = fixedUnits(Number(Object(ruleValue(engine.docData, 'body', 'integrity')).lostBelow));
  const byId = new Map(body.parts.map((p) => [p.id, p]));
  const integrity = new Map(body.parts.map((p) => [p.id, one]));
  const eff = new Map(body.parts.map((p) => [p.id, effOf(byId, integrity, lostBelow, p)]));
  const effAt = (/** @type {Part} */ p) => eff.get(p.id) ?? fixedZero();
  const capDefs = Object(tableOf(engine, body.planKind).capabilities);
  /** @type {Record<string, Readonly<{known: boolean, applicable: boolean, current: boolean, value: unknown, base?: number}>>} */
  const dims = {};
  for (const [key, c] of structuralBase(engine, body.parts)) {
    if (presentEntries(c.limitedBy).length > 0) throw new KernelError('E-DIM-UNKNOWN-READ', {}, `capability ${JSON.stringify(c.cap)}: limitedBy terms (卷四 B-5) not built`);
    // B-4：每个贡献 > 0 的部位一条 add 项 −contributes × (1 − eff)。
    const terms = body.parts.flatMap((p) => presentEntries(p.contributes).filter(([cap, w]) => cap === c.cap && fixedUnits(Number(w)) > fixedZero())
      .map(([, w]) => fixedToNumber(fixedSub(fixedZero(), fixedMultiply(fixedUnits(Number(w)), fixedSub(one, effAt(p)))))));
    const fact = modifiedWith(engine, state, body.planKind, subjectId, key, fixedToNumber(c.base), terms);
    const bounds = Object(capDefs[key]).bounds;
    if (!Array.isArray(bounds)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${body.planKind}.capabilities.${key}: header must declare bounds`);
    dims[key] = Object.freeze({ ...fact, value: Math.min(Math.max(fact.value, bounds[0]), bounds[1]) });
  }
  dims[PART_INTEGRITY] = Object.freeze({ known: true, applicable: true, current: true, value: Object.freeze(Object.fromEntries([...integrity].map(([p, v]) => [p, fixedToNumber(v)]))) });
  const mass = individualMassKg(engine, state, body, subjectId);
  const parts = Object.freeze(body.parts.map((p) => Object.freeze({
    id: p.id, parent: p.parent, sizeFraction: p.sizeFraction, vital: p.vital,
    integrity: fixedToNumber(integrity.get(p.id) ?? fixedZero()), eff: fixedToNumber(effAt(p)),
    massKg: mass.known ? Object.freeze({ ...mass, value: fixedToNumber(fixedMultiply(fixedUnits(Number(mass.value)), fixedUnits(Number(p.sizeFraction)))) }) : UNKNOWN,
    tissues: Object.freeze(Object.fromEntries(body.fractions.map(([t]) => {
      const mat = tissueMaterial(body, p, t);
      return [t, mat === undefined ? UNKNOWN : Object.freeze({ known: true, applicable: true, current: true, value: mat })];
    }))),
  })));
  const condition = body.parts.reduce((acc, p) => fixedAdd(acc, fixedMultiply(fixedUnits(Number(p.sizeFraction)), effAt(p))), fixedZero());
  return Object.freeze({ kind: body.kind, id: subjectId, bodyPlan: body.planId, massKg: mass, dims: Object.freeze(dims), parts, condition: fixedToNumber(condition) });
}
