// 个体读入口 `personView` 与建行写入口 `instantiatePerson`（卷四《生物身体与人物》§3.1 :411、§3.3 :419、§4.10 :969–:985；§4.3 A-1 基值；§4.5 H-1 遗传律只在有亲本时用，块 6 无）。
// `personView`（全书读个体的唯一入口）：dims = person 表头全部维度的 Fact；年龄、阶段、成年、体重五项派生由 life.mjs 的 lifeFacts 求（表头里登记为未建派生，RX 写不成）；
// 别卷未前移的派生（attrMod、nativeLanguage、living 等）读到登记在案的 E-MOD-RX 按未知交出并带原因，不编值。occupation、presentedKey 的出处（持有边、身份键，卷十八、§4.9）块 6 未建，按未知交出；body 是 bodyView 的结果（不复制）。
// `instantiatePerson`（个体偏离行的唯一写入时机，P-1、P-4）：建行时一次取齐——物种、出生地、出生时刻必给；性别、寿命、成年体重、属性、外貌轴未给的按卷二 §1.10 种子键从物种行的分布采样一次
// （一键一抽，kernel/sample.mjs 的 sampleDistribution）；给了的取给定值（G-3 属性基数取物种均值再加分配、G-6 外貌取档中点都是创建例程算出后作指定值传入，本文件另导出 speciesAttributeMeans、bandMidpoint 两个纯函数供它用）。
// 此后没有任何模块再写这些基础值。id 由调用方给（卷十 R10-12.1 的 id 派生未建，未给即 E-ACT-WRITER-NOT-READY）。亲本遗传、技能初值（卷十四）、母语熟练度、身份键、出身给予块 6 不建；
// 他卷 always 维度（personality、sensitivity、pos、facing）整类登未建列（丙9），不写缺省；个体所在地点不是本表维度，读 zoneAt(pos)（卷二 §5.5 :1773）。写落在调用方已开的内核事务上，经 kernelApi writePersonRow。
// 不认任何物种、阶段、属性或人物代号；玩家不特例（P-5）。

import { dim, readsUnbuilt, modified } from './kernel/dimensions.mjs';
import { kindOf, kindOfEntity } from './kernel/vocab.mjs';
import { sampleDistribution } from './kernel/sample.mjs';
import { writePersonRow } from './kernel/dimension-writers.mjs';
import { clockView } from './kernel/scheduler.mjs';
import { astroView } from './kernel/calendar.mjs';
import { fixedUnits, fixedAdd, fixedDivide, fixedToNumber, fixedScale, truncateTo } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';
import { bodyView } from './body.mjs';
import { lifeFacts } from './life.mjs';

// 卷文定名：表名、维度、物种维度、词表族与规格字段。
const S = Object.freeze({
  kind: 'person',
  speciesKind: 'species',
  dim: Object.freeze({
    species: 'species', sex: 'sex', birthMinute: 'birthMinute', birthplace: 'birthplace', lifespanYears: 'lifespanYears', adultMassKg: 'adultMassKg',
    attributes: 'attributes', traits: 'traits', culture: 'culture', adult: 'adult',
  }),
  speciesDim: Object.freeze({ sexes: 'sexes', lifespanYears: 'lifespanYears', bodyMassKg: 'bodyMassKg', attributesBase: 'attributesBase', traitsBase: 'traitsBase' }),
  dist: Object.freeze({ categorical: 'categorical', normal: 'normal', uniform: 'uniform', triangular: 'triangular' }),
  spec: Object.freeze(['instanceId', 'species', 'birthMinute', 'ageYears', 'birthplace', 'sex', 'lifespanYears', 'adultMassKg', 'attributes', 'traits', 'culture']),
  derived: Object.freeze(['ageYears', 'relMaturity', 'relAge', 'lifeStage', 'adult', 'massKg']),
  // 轴值域下界 −1（卷四 §2.3 traits、§4.5 H-5）；均值与等分公式里的系数 2、3 由 1 相加得到，不写数字字面量；数值精度读表头 precision。
  axisMin: -1,
  one: 1,
  precisionKey: 'precision',
  mapType: 'map',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 登记码错误（形状同 kernel/errors.mjs#KernelError，kernel/transaction.mjs 的 codeOf 按 e.code 认）。
function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

// 一个维度的基值 Fact；只有登记在案的未建派生（或依赖它的派生）读到 E-MOD-RX 时按未知交出并带上码（同 speciesView 口径）。
function readDim(engine, state, kind, id, key, opts) {
  try {
    return dim(engine, state, kind, id, key, opts);
  } catch (e) {
    if (isObj(e) && e.code === E.E_MOD_RX && readsUnbuilt(engine, kind, key)) return Object.freeze({ known: false, applicable: true, reason: E.E_MOD_RX });
    throw e;
  }
}

/**
 * `personView(engine, state, personId)`（卷四 §3.1 :411；签名与返回形状按卷二 §2.2）：个体的全部维度、职业、示人键与身体。
 * dims 每项是 Fact；有修正的映射维度（attributes、sensitivity）逐键交有效值 Fact（映射，键取基值映射的键）；其余映射交基值 Fact。
 * @param {object} engine @param {object} state @param {string} personId
 */
export function personView(engine, state, personId) {
  const kind = kindOfEntity(state, personId);
  const t = engine.tables instanceof Map ? engine.tables.get(kind) : undefined;
  const header = t && isObj(t.doc) && isObj(t.doc.dimensions) ? t.doc.dimensions : {};
  const life = lifeFacts(engine, state, personId);
  const dims = {};
  for (const key of Object.keys(header).sort(cmp)) {
    if (S.derived.includes(key)) { dims[key] = life[key]; continue; }
    const base = readDim(engine, state, kind, personId, key);
    const def = header[key];
    if (def.modifiable === true && def.type === S.mapType && base.known && isObj(base.value)) {
      dims[key] = Object.freeze(Object.fromEntries(Object.keys(base.value).sort(cmp).map((k) => [k, modified(engine, state, kind, personId, key, { key: k })])));
    } else dims[key] = base;
  }
  const unbuilt = Object.freeze({ known: false, applicable: true, reason: 'unbuilt' });
  return Object.freeze({ dims: Object.freeze(dims), occupation: unbuilt, presentedKey: unbuilt, body: bodyView(engine, state, personId) });
}

// 定点结果交回成表头 `key` 维度的值精度（映射维度取其值定义）并向零截断。
function outNumber(engine, key, f) {
  const def = engine.tables.get(S.kind).doc.dimensions[key];
  const d = def.type === S.mapType ? def.value : def;
  return fixedToNumber(truncateTo(f, d[S.precisionKey]));
}

// 分布的均值（卷四 §4.12 G-3"物种该属性分布的均值"）：normal 取 mean、uniform 取 (min+max)/2、triangular 取 (min+mode+max)/3，全程定点；其余分布没有闭式均值实现，拒。
function distributionMean(engine, key, dist) {
  if (!isObj(dist)) throw deny(E.E_DIM_SAMPLE_PARAM, 'distribution is an object');
  const one = fixedUnits(S.one);
  const two = fixedAdd(one, one);
  if (dist.dist === S.dist.normal) return outNumber(engine, key, fixedUnits(dist.mean));
  if (dist.dist === S.dist.uniform) return outNumber(engine, key, fixedDivide(fixedAdd(fixedUnits(dist.min), fixedUnits(dist.max)), two));
  if (dist.dist === S.dist.triangular) return outNumber(engine, key, fixedDivide(fixedAdd(fixedAdd(fixedUnits(dist.min), fixedUnits(dist.mode)), fixedUnits(dist.max)), fixedAdd(two, one)));
  throw deny(E.E_DIM_SAMPLE_PARAM, `mean of distribution ${JSON.stringify(dist.dist)} is not built`);
}

/**
 * 物种各属性分布的均值（卷四 §4.12 G-3 :1086"各项基数 = 所选物种该属性分布的均值"）：给创建例程算指定值用的纯读。返回 {属性代号: 均值}。
 * @param {object} engine @param {object} state @param {string} speciesId
 */
export function speciesAttributeMeans(engine, state, speciesId) {
  const f = dim(engine, state, S.speciesKind, speciesId, S.speciesDim.attributesBase);
  if (!f.known || !isObj(f.value)) throw deny(E.E_DIM_UNKNOWN_READ, `species ${speciesId} has no readable ${S.speciesDim.attributesBase}`);
  return Object.freeze(Object.fromEntries(Object.keys(f.value).sort(cmp).map((k) => [k, distributionMean(engine, S.dim.attributes, f.value[k])])));
}

/**
 * 外貌轴档中点（卷四 §4.12 G-6 :1089"traitBands 给出各可见外貌轴的档号，取该档中点为基值"；§4.5 H-5 档号把 [−1, 1] 等分为 bands 份）：
 * 第 band 档（从 0 起）的中点 = −1 + (2·band + 1) ÷ bands。band 须在 [0, bands) 的整数，bands 须为正整数。
 * @param {object} engine @param {number} band @param {number} bands
 */
export function bandMidpoint(engine, band, bands) {
  if (!Number.isInteger(bands) || bands < 1 || !Number.isInteger(band) || band < 0 || band >= bands) throw deny(E.E_DIM_DOMAIN_RANGE, `band ${band} of ${bands}: want an integer in [0, bands)`);
  return outNumber(engine, S.dim.traits, fixedAdd(fixedUnits(S.axisMin), fixedDivide(fixedUnits(band + band + S.one), fixedUnits(bands))));
}

/**
 * `instantiatePerson(engine, state, spec)`（卷四 §3.3 :419；§4.10 P-4）：在调用方的内核事务里建一条个体偏离行，返回 `{id}`。
 * spec 只含代号与数值：instanceId（必给，id 派生未建）、species、birthplace 必给；birthMinute 与 ageYears 二选一必给（ageYears 须落在成年阶段，G-6，转成 birthMinute = 现刻 − ageYears × 年长）；
 * sex、lifespanYears、adultMassKg、attributes（映射，可只给一部分键）、traits、culture 可给，未给的 sex 按物种 sexes 权重、lifespanYears 按物种寿命分布、
 * adultMassKg 按物种体重分布、attributes 与 traits 按物种分布逐键，都从种子键采样一次；不存类别（人物类别由物种行派生，李白 11-19 ⑤）；culture 未给不写（卷七文化表未前移，记 gap）。
 * sex 不在物种 sexes 的键内 E-PERSON-SEX（给定与采样都核）。
 * @param {object} engine @param {object} state
 * @param {{instanceId?: string, species: string, birthplace: string, birthMinute?: number, ageYears?: number, sex?: string, lifespanYears?: number, adultMassKg?: number, attributes?: Record<string, number>, traits?: Record<string, number>, culture?: string}} spec
 * @returns {Readonly<{id: string}>}
 */
export function instantiatePerson(engine, state, spec) {
  if (!isObj(spec) || Object.keys(spec).some((k) => !S.spec.includes(k))) throw deny(E.E_DIM_STRUCT_FIELD, `instantiatePerson spec has only ${S.spec.join(', ')}`);
  if (spec.instanceId === undefined) throw deny(E.E_ACT_WRITER_NOT_READY, 'instantiatePerson without instanceId needs the entity id derivation (vol10 R10-12.1, vol27 R27-8.9), not built');
  const id = spec.instanceId;
  for (const k of [S.dim.species, S.dim.birthplace]) if (spec[k] === undefined) throw deny(E.E_DIM_REQUIRED_MISSING, `instantiatePerson: ${k} is required`);
  if ((spec.birthMinute === undefined) === (spec.ageYears === undefined)) throw deny(E.E_DIM_REQUIRED_MISSING, 'instantiatePerson: exactly one of birthMinute and ageYears');
  if (typeof spec.species !== 'string' || kindOf(spec.species) !== S.speciesKind) throw deny(E.E_DIM_REF_MISSING, `${JSON.stringify(spec.species)} is not a species`);

  const sp = (key) => {
    const f = dim(engine, state, S.speciesKind, spec.species, key);
    if (!f.known) throw deny(E.E_DIM_UNKNOWN_READ, `species ${spec.species} has no readable ${key}`);
    return f.value;
  };
  const sexes = sp(S.speciesDim.sexes);
  const props = {};
  props[S.dim.species] = spec.species;
  props[S.dim.birthplace] = spec.birthplace;
  // 物种 sexes 里值为 null 的键是"没有这种性别"（卷二 §1.6 第 4 项），不进权重、也不是合法性别。
  const weights = isObj(sexes) ? Object.fromEntries(Object.entries(sexes).filter(([, w]) => w !== null)) : {};
  props[S.dim.sex] = spec.sex !== undefined ? spec.sex : sampleDistribution(engine, S.kind, id, S.dim.sex, { dist: S.dist.categorical, weights }, undefined);
  if (!Object.hasOwn(weights, props[S.dim.sex])) throw deny(E.E_PERSON_SEX, `sex ${JSON.stringify(props[S.dim.sex])} is not a key of species ${spec.species} sexes`);
  props[S.dim.lifespanYears] = spec.lifespanYears !== undefined ? spec.lifespanYears : sampleDistribution(engine, S.kind, id, S.dim.lifespanYears, sp(S.speciesDim.lifespanYears), undefined);
  props[S.dim.adultMassKg] = spec.adultMassKg !== undefined ? spec.adultMassKg : sampleDistribution(engine, S.kind, id, S.dim.adultMassKg, sp(S.speciesDim.bodyMassKg), undefined);
  const attrBase = sp(S.speciesDim.attributesBase);
  const given = isObj(spec.attributes) ? spec.attributes : {};
  props[S.dim.attributes] = Object.fromEntries(Object.keys(attrBase).sort(cmp).map((k) => [k, Object.hasOwn(given, k) ? given[k] : sampleDistribution(engine, S.kind, id, S.dim.attributes, attrBase[k], k)]));
  for (const k of Object.keys(given)) if (!Object.hasOwn(attrBase, k)) throw deny(E.E_DIM_REF_MISSING, `attribute ${k} is not in species ${spec.species} attributesBase`);
  const traitBase = dim(engine, state, S.speciesKind, spec.species, S.speciesDim.traitsBase);
  const traitGiven = isObj(spec.traits) ? spec.traits : {};
  const traitKeys = new Set([...(traitBase.known && isObj(traitBase.value) ? Object.keys(traitBase.value) : []), ...Object.keys(traitGiven)]);
  if (traitKeys.size > 0) {
    props[S.dim.traits] = Object.fromEntries([...traitKeys].sort(cmp).map((k) => {
      if (Object.hasOwn(traitGiven, k)) return [k, traitGiven[k]];
      if (!(traitBase.known && isObj(traitBase.value) && Object.hasOwn(traitBase.value, k))) throw deny(E.E_DIM_REF_MISSING, `trait ${k} is not in species ${spec.species} traitsBase`);
      return [k, sampleDistribution(engine, S.kind, id, S.dim.traits, traitBase.value[k], k)];
    }));
  }
  if (spec.culture !== undefined) props[S.dim.culture] = spec.culture;

  const now = clockView(engine, state).minute;
  if (spec.birthMinute !== undefined) props[S.dim.birthMinute] = spec.birthMinute;
  else {
    if (typeof spec.ageYears !== 'number' || !(spec.ageYears >= 0)) throw deny(E.E_DIM_DOMAIN_RANGE, 'ageYears is a number >= 0');
    const year = astroView(engine).yearMinutes;
    props[S.dim.birthMinute] = now - Number((BigInt(fixedUnits(spec.ageYears)) * BigInt(year.num)) / (BigInt(fixedScale()) * BigInt(year.den)));
  }
  writePersonRow(engine, state, { id, props });
  // G-6：ageYears 须落在成年阶段内（建行后用同一份 lifeFacts 判，不另写一份判定；不合整笔回滚）。
  if (spec.ageYears !== undefined) {
    const adult = lifeFacts(engine, state, id).adult;
    // 阶段未知（阶段表等登在 unbuilt）是"不知道"，报未建码；已知而不成年才是取值越界。
    if (!adult.known) throw deny(E.E_ACT_WRITER_NOT_READY, `ageYears ${spec.ageYears}: the adult stage is unknown (${adult.reason}); use birthMinute until the stage table is built`);
    if (adult.value !== true) throw deny(E.E_DIM_DOMAIN_RANGE, `ageYears ${spec.ageYears} does not land in an adult stage`);
  }
  return Object.freeze({ id });
}
