// 个体建档补全（卷四 §2.3 :208–:232 person 维度、§4.10 P-4 个体实例化；S1-3c 草案 §1、§3、§4、§5）。
// instantiatePerson 由 create 原语经 engine.lifecycle.instantiate 按 state-owners systems.person.instantiate 路由来，在建行同一事务里补齐经采样的 always 维度：
//   ① species 须可读且是登记的物种行（模板行写，设计册 14:228「由文化定」在数据层落实），否则整笔拒；
//   ② 按 rules.person.sampleFrom 逐行（person 维度 ← 物种维度）：已有值不覆盖；物种维度读不到即不写（数据门，读者照旧报未知）；
//      取值方式由两边表头类型定——分布抽一次、分布映射逐键抽、整数权重映射按 categorical 抽——不按维度名分支；
//   ③ birthMinute = 建行分钟 − 开局年龄（模板行或 facts 的 startAgeYears，否则 rules.life.stages 首个成年行的 relMaturityMin × 物种 maturityYears）。
// speciesOf 同时是选来历的数据门 origin.ready 的读数（rules/act/catalog.mjs），同一判断一处。

import { KernelError } from '../../kernel/errors.mjs';
import { dim, presentEntries } from '../../kernel/dimensions.mjs';
import { kindOfEntity, readPath, setEntityProp } from '../../kernel/storage.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { fixedUnits, fixedMultiply, fixedScale, truncateTo, fixedToNumber } from '../../kernel/det-math.mjs';
import { drawByKey } from '../gen/sample.mjs';
import { ruleValue, unitSi } from '../load/registry.mjs';
import { registerInstantiator } from '../lifecycle/terminate.mjs';
import { headerOf } from './body-plan.mjs';

/** @typedef {import('./body-plan.mjs').BodyEngine & import('../gen/sample.mjs').SampleEngine & {P: Readonly<Record<string, Function>>}} PersonEngine */

// rules.person 的键（world/rules/tables/person.json）与 rules.life 的阶段表（卷四 §4.4 L-1）。
const PERSON = 'person';
const SAMPLE_FROM = 'sampleFrom';
const LIFE = 'life';
const STAGES = 'stages';
// 卷四 §2.3 的个体维度名（卷文定义，非数值、非种类代号）与物种维度 maturityYears（卷四 §2.1）。
const DIM = Object.freeze({ species: 'species', birthMinute: 'birthMinute', startAgeYears: 'startAgeYears', maturityYears: 'maturityYears' });
// life_stage 条目的成年字段（卷四 §2.3 :217）；阶段行的字段（卷四 L-1）。
const ADULT_FIELD = 'adult';
const STAGE_FIELD = 'stage';
// 阶段行 stage 所指的词表族（rules.life.stages 登记类型 ref vocab life_stage，卷四 §2.4）。
const LIFE_STAGE_FAMILY = 'life_stage';
const REL_MATURITY_MIN = 'relMaturityMin';
// categorical 的分布种类代号（卷二 §1.10）：物种的整数权重映射（如 sexes，卷四 :209）按它抽。
const CATEGORICAL = 'categorical';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 读一个维度；读不到（E-DIM-UNKNOWN-READ）即 undefined，别的错误照抛。
 * @param {PersonEngine} engine @param {unknown} state @param {string} kind @param {string} id @param {string} dimension @returns {unknown}
 */
function tryDim(engine, state, kind, id, dimension) {
  try {
    return dim(engine, state, kind, id, dimension).value;
  } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return undefined;
    throw e;
  }
}

/**
 * 个体（或来历模板行）的物种：species 维度可读，且是表头所声明 ref kind 的登记实体行，返回物种 id；否则 null。
 * 建档补全（不是即整笔拒）与选来历数据门 origin.ready（不是即候选隐藏）共用这一个判断。
 * @param {PersonEngine} engine @param {unknown} state @param {string} id @returns {string | null}
 */
export function speciesOf(engine, state, id) {
  const kind = kindOfEntity(engine, state, id);
  const v = tryDim(engine, state, kind, id, DIM.species);
  const want = headerOf(engine, kind, DIM.species).kind;
  const loaded = engine.registry.kindOfLoaded;
  return typeof v === 'string' && typeof loaded === 'function' && loaded(v) === want ? v : null;
}

/** @typedef {(dist: unknown, quals: string[], def: Record<string, unknown>) => number | string} Draw */

/**
 * 写回目标维度前的截断（卷二 :346：调用方按目标维度 precision 向零截断）：数值按 precision（没写即 0 位）；键原样。
 * 分布自带 clamp 须落在目标维度取值域内（卷二 :325），否则 E-DIM-SAMPLE-DOMAIN。
 * @param {Record<string, unknown>} def 目标维度（或映射值）的类型声明 @param {unknown} dist @param {number | string} v @returns {number | string}
 */
function fitTo(def, dist, v) {
  const [dlo, dhi] = Array.isArray(def.domain) ? def.domain : [];
  const clamp = Object(dist).clamp;
  const [clo, chi] = Array.isArray(clamp) ? clamp : [];
  const below = typeof dlo === 'number' && typeof clo === 'number' && clo < dlo;
  const above = typeof dhi === 'number' && typeof chi === 'number' && chi > dhi;
  if (below || above) throw new KernelError('E-DIM-SAMPLE-DOMAIN', {}, `distribution clamp ${JSON.stringify(clamp)} is not inside the target domain ${JSON.stringify(def.domain)}`);
  if (typeof v === 'string') return v;
  return fixedToNumber(truncateTo(fixedUnits(v), Number.isInteger(def.precision) ? Number(def.precision) : 0));
}

// 物种映射维度按值类型的抽法（卷二 §1.10、卷四 §2.3）：值为 distribution 逐键抽（空值键不进）；值为整数即权重，按 categorical 抽一次。
/** @type {Record<string, (draw: Draw, src: unknown, def: Record<string, unknown>) => unknown>} */
const BY_MAP_VALUE = {
  distribution: (draw, src, def) => {
    const v = Object(def.value);
    return Object.fromEntries(presentEntries(src).map(([k, d]) => [k, draw(d, [k], v)]));
  },
  integer: (draw, src, def) => draw({ dist: CATEGORICAL, weights: src }, [], def),
};

/** 表里认一项（只认自有键）。 @template T @param {Record<string, T>} table @param {unknown} key @returns {T | undefined} */
const pick = (table, key) => (typeof key === 'string' && Object.hasOwn(table, key) ? table[key] : undefined);

// 物种维度按声明类型的抽法：distribution 抽一次；map 按值类型再查上表。认不出即 E-DIM-STRUCT-FIELD。
/** @type {Record<string, (draw: Draw, src: unknown, def: Record<string, unknown>, srcDef: Record<string, unknown>) => unknown>} */
const BY_SOURCE = {
  distribution: (draw, src, def) => draw(src, [], def),
  map: (draw, src, def, srcDef) => {
    const by = pick(BY_MAP_VALUE, Object(srcDef.value).type);
    if (by === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'sampleFrom source map: values must be distributions or integer weights');
    return by(draw, src, def);
  },
};

/**
 * 开局年龄（S1-3c 主会话 Q3）：模板行或 facts 写了 startAgeYears 即取它；否则取 rules.life.stages 中首个成年行（life_stage 条目 adult 为真）的
 * relMaturityMin × 物种 maturityYears（成年下界，零新数值）。返回 SCALE 定点年数与其单位代号。
 * @param {PersonEngine} engine @param {unknown} state @param {string} kind @param {string} id @param {string} speciesKind @param {string} species
 * @returns {{age: bigint, unit: unknown}}
 */
function startAge(engine, state, kind, id, speciesKind, species) {
  const given = tryDim(engine, state, kind, id, DIM.startAgeYears);
  if (given !== undefined) return { age: fixedUnits(Number(given)), unit: headerOf(engine, kind, DIM.startAgeYears).unit };
  const entries = Object(Object(Object(Object(engine.vocab).families)[LIFE_STAGE_FAMILY]).entries);
  const stages = ruleValue(engine.docData, LIFE, STAGES);
  const adult = Object((Array.isArray(stages) ? stages : []).find((s) => Object(entries[Object(s)[STAGE_FIELD]])[ADULT_FIELD] === true));
  if (!Object.hasOwn(adult, REL_MATURITY_MIN)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${LIFE}.${STAGES}: no stage row whose life stage entry is ${ADULT_FIELD}`);
  const maturity = dim(engine, state, speciesKind, species, DIM.maturityYears).value;
  return { age: fixedMultiply(fixedUnits(Number(adult[REL_MATURITY_MIN])), fixedUnits(Number(maturity))), unit: headerOf(engine, speciesKind, DIM.maturityYears).unit };
}

/**
 * 个体实例化（卷四 §4.10 P-4；S1-3c 草案 §5）：create 原语建行后在同一事务里调（engine.lifecycle.instantiate 路由）。写入只经 setEntityProp。
 * 物种读不到或不是物种行即 E-DIM-UNKNOWN-READ，整笔回滚。
 * @param {PersonEngine} engine @param {unknown} state @param {string} id @param {unknown} tx
 */
export function instantiatePerson(engine, state, id, tx) {
  const kind = kindOfEntity(engine, state, id);
  const species = speciesOf(engine, state, id);
  if (species === null) throw new KernelError(UNKNOWN_READ, {}, `${kind} ${id}: ${DIM.species} must be readable and name a registered species row`);
  const speciesKind = String(headerOf(engine, kind, DIM.species).kind);
  const worldSeed = readPath(state, engine.P.genesis_worldSeed());
  const minute = clockMinute(engine, state);
  const has = (/** @type {string} */ d) => tryDim(engine, state, kind, id, d) !== undefined;
  const rows = ruleValue(engine.docData, PERSON, SAMPLE_FROM);
  for (const row of Array.isArray(rows) ? rows : []) {
    const target = String(Object(row).target);
    const source = String(Object(row).source);
    if (has(target)) continue;
    const src = tryDim(engine, state, speciesKind, species, source);
    if (src === undefined) continue;
    const srcDef = headerOf(engine, speciesKind, source);
    const by = pick(BY_SOURCE, srcDef.type);
    if (by === undefined) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${PERSON}.${SAMPLE_FROM}: ${speciesKind}.${source} is not a distribution or a map`);
    // 对象段为复合：个体 id | 目标维度 [| 映射键]（卷二十七 R27-8.5 :801）；流代号与抽取点代号登记在 rules.seedKeys。
    /** @type {Draw} */
    const draw = (dist, quals, def) => fitTo(def, dist,
      drawByKey('person_instantiate', 'person_sample', engine, Number(worldSeed), [id, target, ...quals], minute, dist));
    setEntityProp(state, id, target, by(draw, src, headerOf(engine, kind, target), srcDef), tx);
  }
  if (!has(DIM.birthMinute)) {
    const { age, unit } = startAge(engine, state, kind, id, speciesKind, species);
    // 年数折分钟：两单位 si 之比经公共入口 unitSi（有理数），向零截断（卷二十:504 单位换算取单位表）。
    const [an, ad] = unitSi(engine.docData, unit);
    const [bn, bd] = unitSi(engine.docData, headerOf(engine, kind, DIM.birthMinute).unit);
    const minutes = (age * an * bd) / (ad * bn * fixedScale());
    setEntityProp(state, id, DIM.birthMinute, minute - Number(minutes), tx);
  }
}

/** 建档补全的登记项（systems.person.instantiate；装配层收进 engine.instantiators）。 */
export const PERSON_INSTANTIATOR = registerInstantiator('rules/body/person.mjs#instantiatePerson', instantiatePerson);
