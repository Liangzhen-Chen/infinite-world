// 个体的年龄、阶段与体重读数（卷四《生物身体与人物》§2.3 :212–:220 派生维度；§4.4 L-1 阶段、L-2 成长；:39 `living` 的出处）：
// `lifeFacts` 求 ageYears、relMaturity、relAge、lifeStage、adult、massKg 六个派生维度（表头里它们登记为未建派生：现行 RX 没有时钟、年长、有序列表取末项与曲线查值，
// 见 _unbuilt-derived.json），personView 与 bodyView 共用这一份；`lifeInputs` 把 §4.4 两条曲线（背景死亡、生育）的入参 relMaturity、relAge、living 交出，
// living 是卷六定义的数值 Fact，未知时原样带出缺口，本文件不以任何常数代替、不给缺省（卷四 :39；方案 §3.5 第 11 条）。
// 全部定点（kernel/det-math.mjs），不读墙钟；不写状态、不设缓存。lifeTick（背景死亡、受孕、分娩）块 6 不建，不在本文件。
// 不认任何物种、阶段、人物代号；阶段与成年读规则表与阶段条目字段。

import { dim, modified, modifiedWith, lookupCurve, readsUnbuilt } from './kernel/dimensions.mjs';
import { astroView } from './kernel/calendar.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { kindOfEntity, vocab } from './kernel/vocab.mjs';
import { fixedUnits, fixedMultiply, fixedDivide, fixedScale, fixedToNumber, truncateTo } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';

// 卷文定名：维度、规则表键、阶段表字段、词表族。
const S = Object.freeze({
  dim: Object.freeze({
    species: 'species', birthMinute: 'birthMinute', lifespanYears: 'lifespanYears', adultMassKg: 'adultMassKg', massKg: 'massKg', maturityYears: 'maturityYears', living: 'living',
  }),
  rules: Object.freeze({ table: 'life', stages: 'stages', growthCurve: 'growthCurve', unbuilt: 'unbuilt' }),
  stage: Object.freeze({ stage: 'stage', relMaturityMin: 'relMaturityMin', relAgeMin: 'relAgeMin' }),
  family: Object.freeze({ lifeStage: 'life_stage' }),
  entry: Object.freeze({ adult: 'adult' }),
  ageYears: 'ageYears',
  relMaturity: 'relMaturity',
  relAge: 'relAge',
  precisionKey: 'precision',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const unknown = (reason) => Object.freeze({ known: false, applicable: true, reason });
const known = (value) => Object.freeze({ known: true, applicable: true, value, source: 'derived' });
// 定点值按表头里该维度声明的精度向零截断成数（精度读 person 表头 precision，不写数字）。
const roundTo = (engine, kind, key, f) => fixedToNumber(truncateTo(f, engine.tables.get(kind).doc.dimensions[key][S.precisionKey]));
const fixedFact = (engine, kind, key, f) => known(roundTo(engine, kind, key, f));

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// 一个维度的基值 Fact；只有登记在案的未建派生读到 E-MOD-RX 时按未知交出并带上码（同 speciesView 口径）。
function readDim(engine, state, kind, id, key) {
  try {
    return dim(engine, state, kind, id, key);
  } catch (e) {
    if (isObj(e) && e.code === E.E_MOD_RX && readsUnbuilt(engine, kind, key)) return Object.freeze({ known: false, applicable: true, reason: E.E_MOD_RX });
    throw e;
  }
}

const ruleOf = (engine, key) => (isObj(engine.rules) && isObj(engine.rules[S.rules.table]) ? engine.rules[S.rules.table][key] : undefined);
const isUnbuilt = (engine, key) => {
  const u = ruleOf(engine, S.rules.unbuilt);
  return Array.isArray(u) && u.includes(key);
};
const num = (f) => (f && f.known && typeof f.value === 'number' ? f.value : null);

/**
 * 阶段表（rules.life.stages）：逐行核形状（E-LIFE-STAGES，卷四 §4.4 L-1 :639、:374）：非空有序列表，每行两个数值下界 ≥ 0，首行两个下界都为 0（保证任何个体都落进某一行）。
 * 登在 rules.life.unbuilt 返回 null（读到按未知）。
 * @param {object} engine
 */
function stageTable(engine) {
  if (isUnbuilt(engine, S.rules.stages)) return null;
  const rows = ruleOf(engine, S.rules.stages);
  if (!Array.isArray(rows) || rows.length === 0) throw deny(E.E_LIFE_STAGES, 'rules.life.stages is a non-empty ordered list (neither built nor registered in rules.life.unbuilt)');
  const first = rows[0];
  const bad = rows.some((r) => !isObj(r) || !(typeof r[S.stage.relMaturityMin] === 'number' && r[S.stage.relMaturityMin] >= 0) || !(typeof r[S.stage.relAgeMin] === 'number' && r[S.stage.relAgeMin] >= 0));
  if (bad || first[S.stage.relMaturityMin] !== 0 || first[S.stage.relAgeMin] !== 0) throw deny(E.E_LIFE_STAGES, 'every stage row has two non-negative lower bounds and the first row has both at 0');
  return rows;
}

/**
 * 现龄（定点标度）= 已过分钟 ÷ 年长分钟（rules.astro.yearDays 经 astroView，卷四 :212）：现龄换算的唯一一份实现，lifeFacts 与 person.mjs 的寿命条件采样都调它。
 * 全程 BigInt：年长是 36524219/100000 日 × 1440 分钟的有理数，elapsed × den × 标度 在真实年龄下会超出安全整数；向零截断到定点标度，不判负（负值由调用方按自己的约定处理）。
 * @param {object} engine @param {number} elapsedMinutes 现刻 − 出生时刻（分钟）
 * @returns {bigint}
 */
export function ageFixedOfElapsed(engine, elapsedMinutes) {
  const year = astroView(engine).yearMinutes;
  return (BigInt(elapsedMinutes) * BigInt(year.den) * fixedScale()) / BigInt(year.num);
}

/**
 * 个体的六个派生读数（卷四 §2.3 :212–:220；§4.4 L-1、L-2）。返回 `{ageYears, relMaturity, relAge, lifeStage, adult, massKg}`，每项是 Fact：
 * 出生时刻、物种、成熟龄、寿命、成年体重任一读不到，依赖它的项按未知交出并带 reason，不取缺省。
 * ageYears = (clock.minute − birthMinute) ÷ 年长（rules.astro.yearDays 经 astroView，卷四 :212）；relMaturity = ageYears ÷ species.maturityYears；
 * relAge = ageYears ÷ lifespanYears（有效值）；lifeStage = 阶段表里两个下界都已达到的最后一行（L-1）；adult 读该阶段条目的 adult 字段；
 * massKg = adultMassKg × lookup(rules.life.growthCurve, relMaturity)（L-2），再经 massKg 的修正项（modifiable，stacking none）。
 * 出生在未来（负年龄）、成熟龄或寿命不为正都是数据错误（取值域 ≥ 0、除数恒正），照抛，不当 0。
 * @param {object} engine @param {object} state @param {string} personId
 */
export function lifeFacts(engine, state, personId) {
  const kind = kindOfEntity(state, personId);
  const out = {};
  const birth = readDim(engine, state, kind, personId, S.dim.birthMinute);
  if (!birth.known || typeof birth.value !== 'number') {
    const u = unknown(S.dim.birthMinute);
    return Object.freeze({ ageYears: u, relMaturity: u, relAge: u, lifeStage: u, adult: u, massKg: u });
  }
  const elapsed = clockView(engine, state).minute - birth.value;
  if (elapsed < 0) throw deny(E.E_DIM_DOMAIN_RANGE, `${personId}: birthMinute is after the current minute (ageYears domain is >= 0)`);
  const age = ageFixedOfElapsed(engine, elapsed);
  out.ageYears = fixedFact(engine, kind, S.ageYears, age);

  const sp = readDim(engine, state, kind, personId, S.dim.species);
  const maturity = sp.known && typeof sp.value === 'string' ? num(readDim(engine, state, kindOfEntity(state, sp.value), sp.value, S.dim.maturityYears)) : null;
  let relMat = null;
  if (maturity !== null) {
    if (!(maturity > 0)) throw deny(E.E_DIM_DOMAIN_RANGE, `${personId}: species maturityYears must be > 0 to relate age to maturity`);
    relMat = fixedDivide(age, fixedUnits(maturity));
    out.relMaturity = fixedFact(engine, kind, S.relMaturity, relMat);
  } else out.relMaturity = unknown(S.dim.species);

  const lifespan = num(modified(engine, state, kind, personId, S.dim.lifespanYears));
  let relAge = null;
  if (lifespan !== null) {
    if (!(lifespan > 0)) throw deny(E.E_DIM_DOMAIN_RANGE, `${personId}: lifespanYears must be > 0`);
    relAge = fixedDivide(age, fixedUnits(lifespan));
    out.relAge = fixedFact(engine, kind, S.relAge, relAge);
  } else out.relAge = unknown(S.dim.lifespanYears);

  const rows = stageTable(engine);
  if (rows === null) {
    out.lifeStage = unknown(`${S.rules.table}.${S.rules.unbuilt}`);
    out.adult = out.lifeStage;
  } else if (relMat !== null && relAge !== null) {
    let stage = null;
    for (const r of rows) if (relMat >= fixedUnits(r[S.stage.relMaturityMin]) && relAge >= fixedUnits(r[S.stage.relAgeMin])) stage = r[S.stage.stage];
    out.lifeStage = known(stage);
    const entry = vocab(engine, S.family.lifeStage, stage);
    out.adult = typeof entry[S.entry.adult] === 'boolean' ? known(entry[S.entry.adult]) : unknown(`${S.family.lifeStage}.${S.entry.adult}`);
  } else {
    out.lifeStage = unknown(relMat === null ? S.dim.species : S.dim.lifespanYears);
    out.adult = out.lifeStage;
  }

  const adultMass = num(readDim(engine, state, kind, personId, S.dim.adultMassKg));
  const curve = ruleOf(engine, S.rules.growthCurve);
  if (adultMass === null) out.massKg = unknown(S.dim.adultMassKg);
  else if (relMat === null) out.massKg = unknown(S.dim.species);
  else if (isUnbuilt(engine, S.rules.growthCurve) || !Array.isArray(curve) || curve.length === 0) out.massKg = unknown(`${S.rules.table}.${S.rules.growthCurve}`);
  else {
    const base = fixedMultiply(fixedUnits(adultMass), lookupCurve({ points: curve }, relMat));
    out.massKg = Object.freeze({ ...modifiedWith(engine, state, kind, personId, S.dim.massKg, { base: roundTo(engine, kind, S.dim.massKg, base) }).fact, source: 'derived' });
  }
  return Object.freeze(out);
}

/**
 * 主体体重 Fact（卷四 §4.4 L-2；bodyView 的部位质量、death.mjs 的 carcassOf 共用）：主体表头里 massKg 是登记在案的未建派生（个体表）时按 L-2 由 lifeFacts 求（含 massKg 的修正项），
 * 否则照常经修正管线读（别的实体表若给 massKg 以存储值）。
 * @param {object} engine @param {object} state @param {string} subjectId
 */
export function massOf(engine, state, subjectId) {
  const kind = kindOfEntity(state, subjectId);
  return readsUnbuilt(engine, kind, S.dim.massKg) ? lifeFacts(engine, state, subjectId).massKg : modified(engine, state, kind, subjectId, S.dim.massKg);
}

/**
 * §4.4 两条曲线（背景死亡 L-3、生育 L-5）的入参：`{relMaturity, relAge, living}`，三项都是 Fact。`living` 取个体表头同名维度（卷六定义的数值 Fact，
 * 卷四 :39）：读不到或卷六交来未知，就原样交未知 Fact 与 reason，不以任何常数代替、不给缺省；曲线求值方（lifeTick，块 6 不建）读到 known:false 时当日不判定。
 * @param {object} engine @param {object} state @param {string} personId
 */
export function lifeInputs(engine, state, personId) {
  const f = lifeFacts(engine, state, personId);
  const living = readDim(engine, state, kindOfEntity(state, personId), personId, S.dim.living);
  return Object.freeze({ relMaturity: f.relMaturity, relAge: f.relAge, living });
}
