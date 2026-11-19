// 卷四 6-4 测试夹具：把真实 world/ 的维度表目录与规则目录抄到仓库外临时根，再在抄件上加测试自己的前提（词表条目、身体图行、物种行、
// 一张只为测试主体存在的最小 person 表、rules.body.integrity），经统一加载器加载。真实 world/ 不放这些行（内容行归 6-23，人物表归 6-6）。
// 数值取自卷四 §4.2.5 人形示例（部位大小、贡献），只在测试里用；期望值在各用例里按卷文公式手算。
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIMS = 'world/ontology/dimensions';
const RULES = 'world/rules';
const clone = (v) => JSON.parse(JSON.stringify(v));
const readDim = (f) => JSON.parse(readFileSync(join(ROOT, DIMS, f), 'utf8'));

// 测试用材料：取真实材料表的前三行（只当组织材料的引用目标，不读其维度）。
const realMaterials = Object.keys(readDim('material.json').rows).sort().slice(0, 3);
export const MAT = Object.freeze({ a: realMaterials[0], b: realMaterials[1], c: realMaterials[2] });

const part = (id, parent, sizeFraction, contributes, vital, extra = {}) => ({ id, parent, sizeFraction, contributes, vital, ...extra });

export function baseFixture() {
  return {
    capabilities: {
      cap_breathing: { dimKey: 'breathing', limitedBy: {} },
      cap_consciousness: { dimKey: 'consciousness', limitedBy: { cap_breathing: 0.5 } },
      cap_manipulation: { dimKey: 'manipulation', limitedBy: {} },
      cap_moving: { dimKey: 'moving', limitedBy: {} },
    },
    vocab: {
      body_part: ['bpart_torso', 'bpart_head', 'bpart_arm_l', 'bpart_hand_l', 'bpart_arm_r', 'bpart_hand_r', 'bpart_leg_l', 'bpart_leg_r', 'bpart_mass'],
      tissue: { tissue_flesh: { depthOrder: 2, reserve: false }, tissue_bone: { depthOrder: 3, reserve: false } },
      attr: { attr_test: { physical: true, hidden: false, heritability: 0.5, residualFactor: 0.9354, agingCurve: 'flat' } },
      sex: { sex_test: { bears: true } },
      gait: { gait_test: { drivenBy: 'cap_moving', exertion: 1 } },
      taxon: { taxon_test: {} },
      class: { class_test_beast: {} },
      life_stage: {},
      trait: {},
    },
    plans: {
      body_test_humanoid: {
        tissueFractions: { tissue_flesh: 0.6, tissue_bone: 0.4 },
        parts: [
          part('bpart_torso', null, 0.46, { cap_breathing: 1 }, true, { tissueOverride: { tissue_flesh: MAT.c } }),
          part('bpart_head', 'bpart_torso', 0.08, { cap_consciousness: 1 }, true),
          part('bpart_arm_l', 'bpart_torso', 0.05, { cap_manipulation: 0.2 }, false),
          part('bpart_hand_l', 'bpart_arm_l', 0.01, { cap_manipulation: 0.3 }, false),
          part('bpart_arm_r', 'bpart_torso', 0.05, { cap_manipulation: 0.2 }, false),
          part('bpart_hand_r', 'bpart_arm_r', 0.01, { cap_manipulation: 0.3 }, false),
          part('bpart_leg_l', 'bpart_torso', 0.17, { cap_moving: 0.5 }, false),
          part('bpart_leg_r', 'bpart_torso', 0.17, { cap_moving: 0.5 }, false),
        ],
        basis: 'test',
      },
      body_test_blob: {
        tissueFractions: { tissue_flesh: 0.6, tissue_bone: 0.4 },
        parts: [part('bpart_mass', null, 1, { cap_consciousness: 1, cap_moving: 1, cap_manipulation: 1 }, true)],
        basis: 'test',
      },
    },
    species: {
      species_test_a: speciesRow('body_test_humanoid'),
      species_test_b: speciesRow('body_test_blob'),
    },
    speciesClasses: {},
    persons: {
      npc_test_a: { species: 'species_test_a', massKg: 60, tissueDelta: { bpart_head: { tissue_bone: MAT.c } }, basis: 'test' },
      npc_test_b: { species: 'species_test_b', basis: 'test' },
      npc_test_c: { species: 'species_test_a', bodyPlanOverride: 'body_test_blob', basis: 'test' },
    },
    lostBelow: 0.1,
  };
}

export function speciesRow(bodyPlan) {
  return {
    taxon: 'taxon_test', bodyPlan, bodyMassKg: { dist: 'normal', mean: 60, sd: 9, clamp: [30, 120] },
    lifespanYears: { dist: 'normal', mean: 62, sd: 9, clamp: [30, 95] }, sexes: { sex_test: 1 }, ageless: false,
    diet: [], tissues: { tissue_flesh: MAT.a, tissue_bone: MAT.b }, renewables: {}, speedBase: 80, gaits: { gait_test: 1 },
    carryMult: 1, metabolismMult: 1, coreTempC: 37, coolingC: 5, pharmSensitivity: {}, sapient: false,
    temperament: 0, damageResist: {}, packSize: null, maturityYears: 16, growthRate: 0, sleepHoursPerDay: 8, coverDim: null,
    restartKg: 0, basis: 'test',
  };
}

// 测试物种行的属性分布：attr 族每个条目同一个分布（真实族条目与夹具条目一起覆盖，卷二 §1.6 第 4 项；E-SPECIES-ATTR-KEYS）。
export const TEST_ATTR_DIST = Object.freeze({ dist: 'normal', mean: 10, sd: 2, clamp: [3, 18] });

// 只为测试主体存在的最小人物表（卷四 §2.3 中 bodyView 读的四个维度；正式人物表归 6-6）。
function personTable(rows) {
  const meta = { source: 'test', owner: 'test' };
  return {
    kind: 'person', namespace: 'core', version: 1, behaviors: ['test'],
    entity: { idPrefix: ['npc_'], classPrefix: 'class_', singletonIds: [], instanceTable: null },
    dimensions: {
      species: { type: 'ref', kind: 'species', required: 'always', onUnknown: 'error', modifiable: false, ...meta },
      bodyPlanOverride: { type: 'ref', kind: 'body_plan', nullable: true, required: 'never', onUnknown: 'skip', modifiable: false, ...meta },
      massKg: { type: 'number', unit: 'kg', domain: [0, 200000], precision: 4, required: 'never', onUnknown: 'gap', modifiable: true, stacking: 'none', bounds: [0, 200000], ...meta },
      tissueDelta: { type: 'map', key: { type: 'ref', vocab: 'body_part' }, value: { type: 'map', key: { type: 'ref', vocab: 'tissue' }, value: { type: 'ref', kind: 'material' } }, required: 'never', onUnknown: 'skip', modifiable: false, ...meta },
    },
    classes: {}, rows, generated: {},
  };
}

/**
 * 按 f（baseFixture 的结构，可先改）建临时世界并加载。返回 {ok, errors: [[码, 表, 行, 维]], world}；world 是 loadWorld 的结果。
 * @param {ReturnType<typeof baseFixture>} f
 */
export function loadBodyWorld(f) {
  const tmp = testTempRoot('b64-body-');
  try {
    for (const name of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) {
      const doc = readDim(name);
      if (name === '_vocab.json') {
        const fam = doc.families;
        Object.assign(fam.capability.entries, clone(f.capabilities));
        for (const id of f.vocab.body_part) fam.body_part.entries[id] = {};
        for (const k of ['tissue', 'attr', 'sex', 'gait', 'taxon', 'class', 'life_stage', 'trait']) Object.assign(fam[k].entries, clone(f.vocab[k]));
        if (typeof f.editVocab === 'function') f.editVocab(doc);
      }
      if (name === '_unbuilt-derived.json' && typeof f.editUnbuilt === 'function') f.editUnbuilt(doc);
      // 状态表（kind status，6-5）：真实表头只有 family 一个维度、没有行；夹具按 f.statuses 在抄件上加测试状态行（行内容归卷二十一，不进 world/）。
      if (name === 'status.json' && f.statuses) Object.assign(doc.rows, clone(f.statuses));
      if (name === 'body_plan.json') {
        const def = doc.capabilities.smell;
        for (const c of Object.values(f.capabilities)) if (typeof c.dimKey === 'string' && !doc.capabilities[c.dimKey]) doc.capabilities[c.dimKey] = clone(def);
        Object.assign(doc.rows, clone(f.plans));
        if (typeof f.editPlanDoc === 'function') f.editPlanDoc(doc);
      }
      if (name === 'species.json') {
        // 映射键集覆盖全族、"没有"写 null（卷二 §1.6 第 4 项）：没写的 crossbreeds、dietShares 按全族逐键写 null；
        // gaits、sexes 只写了夹具条目的，真实族条目补 null；attributesBase 没写的，每个 attr 条目取同一个测试分布。
        const fams = readDim('_vocab.json').families;
        const keysOf = (name) => [...Object.keys(fams[name].entries), ...Object.keys(f.vocab[name] || {})];
        const rows = clone(f.species);
        for (const row of Object.values(rows)) {
          if (row.crossbreeds === undefined) row.crossbreeds = Object.fromEntries(Object.keys(rows).map((k) => [k, null]));
          if (row.dietShares === undefined) row.dietShares = Object.fromEntries(keysOf('diet').map((k) => [k, null]));
          if (row.attributesBase === undefined) row.attributesBase = Object.fromEntries(keysOf('attr').map((k) => [k, clone(TEST_ATTR_DIST)]));
          for (const dim of ['gaits', 'sexes']) {
            const fam = dim === 'gaits' ? 'gait' : 'sex';
            if (row[dim] && typeof row[dim] === 'object') for (const k of keysOf(fam)) if (!Object.hasOwn(row[dim], k)) row[dim][k] = null;
          }
        }
        Object.assign(doc.rows, rows);
        if (typeof f.editSpeciesDoc === 'function') f.editSpeciesDoc(doc);
        if (Object.keys(f.speciesClasses).length) {
          Object.assign(doc.classes, clone(f.speciesClasses));
          // 有类别行时须有 precedenceGroups.default（卷二 §1.2）；抽象类别行不进 precedence 组。
          doc.precedenceGroups = { default: Object.keys(f.speciesClasses).filter((c) => f.speciesClasses[c].abstract !== true).sort() };
        }
      }
      writeUnderTempRoot(tmp, `dims/${name}`, JSON.stringify(doc));
    }
    writeUnderTempRoot(tmp, 'dims/person.json', JSON.stringify(personTable(clone(f.persons))));
    const readRule = (file) => readFileSync(join(ROOT, RULES, file), 'utf8');
    const reg = JSON.parse(readRule('registry.json'));
    for (const row of reg.rows) writeUnderTempRoot(tmp, `rules/${row.file}`, readRule(row.file));
    // rules.body：夹具在抄件上给测试阈值（f.lostBelow）；f.lostBelow 为 null 时把该键登进 unbuilt、不给值（测"未建即未知"）。
    if (f.lostBelow !== undefined) {
      // 真实 rules.body.unbuilt 登了 metabolism（§4.7 未建，speciesView 的 meanDailyFoodNeed 读它）；夹具默认同，f.bodyUnbuilt 可改（测"没登记即报错"）。
      const unb = f.bodyUnbuilt || ['metabolism'];
      writeUnderTempRoot(tmp, 'rules/tables/body.json', JSON.stringify({ rows: f.lostBelow === null
        ? [{ key: 'unbuilt', value: ['integrity.lostBelow', ...unb], source: 'test', grade: 'designed', basis: 'test' }]
        : [{ key: 'unbuilt', value: unb, source: 'test', grade: 'designed', basis: 'test' },{ key: 'integrity', value: { lostBelow: f.lostBelow }, source: 'test', grade: 'designed', basis: 'test' }] }));
    }
    writeUnderTempRoot(tmp, 'rules/registry.json', JSON.stringify(reg));
    const r = loadWorld(ROOT, { dimensionsDir: relative(ROOT, join(tmp, 'dims')), rulesDir: join(tmp, 'rules') });
    return { ok: r.ok, errors: r.errors.filter((e) => e.severity === 'error').map((e) => [e.code, e.table, e.row, e.dim]), world: r };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export const engineOf = (w) => ({ vocab: w.vocab, rules: w.rules, units: w.env.units, tables: w.tables });
