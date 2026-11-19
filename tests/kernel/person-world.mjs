// 卷四 6-6 测试夹具：真实 world/ 的维度表与规则目录抄到临时根，加上测试自己的前提（物种行、身体图、测试材料与尸体模板行、两个测试类别行与个体行），
// 经统一加载器加载，再在引擎副本上登记账本资源种类、用途与复生类持有种类行。真实 world/ 不放这些（人物行归 6-23、物品行归 6-22）。
// 年长改成整数分钟（365 日，astro.yearDays 365/1）使年龄期望值可手算；一年 = 525600 分钟。
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadBodyWorld, engineOf, ROOT } from './body-world.mjs';
import { itemRow, share } from './item-world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';

export { engineOf, ROOT };
export const MPY = 525600;
export const PLACE = 'loc_county_xichui_longqu';
export const FLESH = 'mat_test_flesh';
export const BONE = 'mat_test_bone';
export const ATTR = ['attr_agility', 'attr_charisma', 'attr_constitution', 'attr_intellect', 'attr_luck', 'attr_spirit', 'attr_strength', 'attr_test'];
const clone = (v) => JSON.parse(JSON.stringify(v));
const realFam = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8')).families;
const part = (id, parent, sizeFraction, contributes, vital, extra = {}) => ({ id, parent, sizeFraction, contributes, vital, ...extra });

// 一个固定值的"分布"：clamp 上下界相等，采样结果恒为该值（手算期望用）。
export const pin = (v) => ({ dist: 'normal', mean: v, sd: 1, clamp: [v, v] });
export const ATTRS = (v) => Object.fromEntries(ATTR.map((k) => [k, v]));

const plain = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200 };

// 测试个体行（作者侧）：成年男性，属性全 10。
export const personRow = (over = {}) => ({
  classes: ['class_test_heir'], species: 'species_test_a', sex: 'sex_male', birthMinute: 0, birthplace: PLACE, location: PLACE,
  lifespanYears: 60, adultMassKg: 70, attributes: ATTRS(10), basis: '测试', ...over,
});

export function personFixture() {
  const f = baseFixture();
  f.realPerson = true;
  f.persons = {};
  f.lostBelow = 0;
  f.materials = {
    [FLESH]: { ...plain, classes: ['comp_rottable'], rotRate: 0.04, moisture: 0.12, energyDensity: 15 },
    [BONE]: { ...plain, decomposePoint: 300, moisture: 0.12, energyDensity: 15 },
  };
  f.items = { item_test_corpse: itemRow(70, [share('mgroup_body', FLESH, 1)], { classes: ['comp_corpse'] }) };
  f.editPlaceDoc = (doc) => { doc.rows[PLACE].ledgerHolder = true; };
  // 尸体模板行要有类别（C-1：categoryKind 派生不到即加载失败）：真实 category 族与规则表没有尸体类，测试加一个兜底类别与条件。
  f.editRules = { items: (rows) => { rows.find((r) => r.key === 'categoryRules').value.push({ when: 'massKg > 0', value: 'category_test_other' }); } };
  // 身体图：躯干（0.46）里的肉组织换成骨料，部位大小与组织比例手算友好（肉 0.6、骨 0.4）。
  f.plans.body_test_humanoid.parts[0].tissueOverride = { tissue_flesh: BONE };
  f.species = {
    species_test_a: {
      taxon: 'taxon_test', bodyPlan: 'body_test_humanoid', bodyMassKg: pin(70), lifespanYears: pin(60), sexes: { sex_male: 1, sex_female: 0 }, ageless: false,
      diet: [], tissues: { tissue_flesh: FLESH, tissue_bone: BONE }, renewables: {}, speedBase: 80, gaits: { gait_test: 1 },
      carryMult: 1, metabolismMult: 1, coreTempC: 37, coolingC: 5, pharmSensitivity: {}, sapient: false,
      temperament: 0, damageResist: {}, packSize: null, maturityYears: 16, growthRate: 0, sleepHoursPerDay: 8, coverDim: null,
      restartKg: 0, classes: ['class_test_heir'], attributesBase: Object.fromEntries(ATTR.map((k) => [k, pin(10)])), traitsBase: { trait_test_a: pin(0.25) }, basis: 'test',
    },
    species_test_beast: {
      taxon: 'taxon_test', bodyPlan: 'body_test_humanoid', bodyMassKg: { dist: 'normal', mean: 70, sd: 9, clamp: [40, 100] }, lifespanYears: { dist: 'normal', mean: 60, sd: 9, clamp: [30, 90] },
      sexes: { sex_male: 1, sex_female: 1 }, ageless: false, diet: [], tissues: { tissue_flesh: FLESH, tissue_bone: BONE }, renewables: {}, speedBase: 80, gaits: { gait_test: 1 },
      carryMult: 1, metabolismMult: 1, coreTempC: 37, coolingC: 5, pharmSensitivity: {}, sapient: false,
      temperament: 0, damageResist: {}, packSize: null, maturityYears: 16, growthRate: 0, sleepHoursPerDay: 8, coverDim: null,
      restartKg: 0, classes: ['class_person_beast'], attributesBase: Object.fromEntries(ATTR.map((k) => [k, { dist: 'normal', mean: 10, sd: 2, clamp: [3, 18] }])), basis: 'test',
    },
  };
  f.speciesClasses = { class_test_heir: { basis: 'test' }, class_person_beast: { basis: 'test' } };
  f.editVocab = (doc) => {
    for (const c of ['class_test_heir', 'class_test_mortal']) doc.families.class.entries[c] = {};
    doc.families.category.entries.category_test_other = { stockSlot: false };
    doc.families.trait.entries.trait_test_a = { heritability: 0.5, residualFactor: 0.9354, visible: true, bands: 4 };
    doc.families.purpose.entries.purpose_test_shelf = { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false };
  };
  // 个体表：加测试维度 heir（后继表达式读它）与两个类别行：class_test_heir 有复生窗口 3 日，class_test_mortal 无窗口（0）。
  f.editPersonDoc = (doc) => {
    doc.dimensions.heir = { type: 'ref', kind: 'person', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' };
    const term = (days) => ({ mode: 'inherit', successorRX: 'heir', reviveWindowDays: days });
    doc.classes.class_test_heir = { termination: term(3), basis: 'test' };
    doc.classes.class_test_mortal = { termination: term(0), basis: 'test' };
    doc.precedenceGroups = { default: ['class_person_mind', 'class_person_beast', 'class_test_heir', 'class_test_mortal'] };
  };
  f.personRows = {
    npc_a: personRow({ heir: 'npc_b' }),
    npc_b: personRow(),
    npc_mortal: personRow({ classes: ['class_test_mortal'], heir: 'npc_b' }),
    npc_beast: personRow({ classes: ['class_person_beast'], species: 'species_test_beast' }),
  };
  return f;
}

/**
 * 加载夹具世界并造引擎：年长 365 日；rules.death.corpsePurpose 给测试用途；资源种类行、复生类持有种类行加在词表索引与规则表的副本里。
 * @param {(f: ReturnType<typeof personFixture>) => void} [edit]
 */
export function buildPersonWorld(edit) {
  const f = personFixture();
  if (edit) edit(f);
  const r = loadBodyWorld(f);
  if (!r.ok) throw new Error(`fixture world does not load: ${JSON.stringify(r.errors)}`);
  const W = r.world;
  const index = new Map(W.vocab.index);
  index.set('res_test_corpse', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_corpse' } });
  const base = W.vocab.index.get('hk_resides').entry;
  index.set('hk_test_revive', { family: 'holding_kind', prefix: 'hk_', entry: { ...base, id: 'hk_test_revive', revival: { cooldownDays: 30, cost: null, effects: [] } } });
  index.set('hk_test_revive_paid', { family: 'holding_kind', prefix: 'hk_', entry: { ...base, id: 'hk_test_revive_paid', revival: { cooldownDays: 0, cost: { resource: 'res_test_corpse', amountRX: '1' }, effects: [] } } });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const rules = clone(W.rules);
  rules.economyResources.res_test_corpse = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_birth'], sinks: ['sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: false, unitOfAccount: false, issuerBacked: false };
  rules.death = { ...rules.death, corpsePurpose: 'purpose_test_shelf' };
  rules.astro = { ...rules.astro, yearDays: { num: 365, den: 1 } };
  // 阶段表与成长曲线：真实世界登 unbuilt（示意数不算出处，推不出，待李白）；测试自己给前提（卷四 §4.4.5 :654 形状的四行，数值只在测试里用，期望值按它们手算），
  // life_stage 条目的 adult 字段同在副本里写（relMaturityMin ≥ 1 的行为成年）。
  const st = (stage, relMaturityMin, relAgeMin, foodFactor, sleepFactor) => ({ stage, relMaturityMin, relAgeMin, foodFactor, sleepFactor, modifiers: [] });
  rules.life = { ...rules.life, stages: [st('lstage_infant', 0, 0, 1.6, 1.8), st('lstage_juvenile', 0.15, 0, 1.25, 1.2), st('lstage_adult', 1, 0, 1, 1), st('lstage_elder', 1, 0.7, 0.9, 0.95)], growthCurve: [[0, 0.05], [1, 1]], unbuilt: rules.life.unbuilt.filter((k) => k !== 'stages' && k !== 'growthCurve') };
  for (const [code, adult] of [['lstage_infant', false], ['lstage_juvenile', false], ['lstage_adult', true], ['lstage_elder', true]]) index.set(code, { ...index.get(code), entry: { ...index.get(code).entry, adult } });
  const engine = { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_person_seed' } };
  return { engine, W, f };
}
