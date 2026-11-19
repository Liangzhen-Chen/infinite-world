// 卷三乙 6-2 测试夹具：把真实 world/ 的维度表目录与规则目录抄到仓库外临时根，再在抄件上加测试自己的前提
// （测试材料行、尺寸档与类别词表条目、规则表 rules.items 的首批以外的值、环境温度域、物品行），经统一加载器加载。
// 真实 world/ 不放这些：物品内容行归 6-22，规则表首批值卷文没给（登在 rules.items.unbuilt）。期望值在各用例里按卷文公式手算成字面量。
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { gradedCells } from '../../server-plugin/kernel/validate/cell-grades.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIMS = 'world/ontology/dimensions';
const RULES = 'world/rules';
const clone = (v) => JSON.parse(JSON.stringify(v));
const readDim = (f) => JSON.parse(readFileSync(join(ROOT, DIMS, f), 'utf8'));

// 测试材料：每行逐格记 designed（卷三甲 M-22 键集合须等于填了值的格）。
const graded = (dimensions, row) => ({ ...row, cellGrades: Object.fromEntries([...gradedCells(dimensions, row).keys()].map((k) => [k, { grade: 'designed', citation: null, basis: '测试行' }])) });
const plain = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null };
// 固相材料的承力量：具有 class_formed 的物品里结构组的固态材料必须有 wearResistance（error 级，卷三乙 I-7）。
const solid = { wearResistance: 50 };

// 五种测试材料：固态金属（熔点远高于域上限）、木料（只有分解点，按分解点判固）、冰水（熔点 0、沸点 100：域内固与液）、
// 低温气（熔点沸点都低于域下限：域内只有气）、只有液栏的怪料（熔点低于域下限、没有沸点：域内只有液）。
export const MATERIALS = Object.freeze({
  mat_test_iron: { ...plain, ...solid, basis: '测试', classes: ['comp_durable'], substance: 'subst_metal', density: { solid: 4 }, valueMult: 3, meltPoint: 1500, boilPoint: 2800, specificHeat: { solid: 0.4 }, repairedWith: 'class_metal', corrosionRate: 0.001, sharpnessMax: 40 },
  mat_test_tin: { ...plain, ...solid, basis: '测试', classes: ['comp_durable'], substance: 'subst_metal', density: { solid: 2 }, valueMult: 1, meltPoint: 230, boilPoint: 2600, specificHeat: { solid: 0.2 }, repairedWith: 'class_metal', corrosionRate: 0.002, sharpnessMax: 20 },
  mat_test_wood: { ...plain, ...solid, basis: '测试', substance: 'subst_wood', density: { solid: 1 }, decomposePoint: 300 },
  mat_test_ice: { ...plain, ...solid, basis: '测试', substance: 'subst_water', density: { solid: 0.9, liquid: 1 }, meltPoint: 0, boilPoint: 100 },
  mat_test_gas: { ...plain, basis: '测试', substance: 'subst_water', density: { gas: 0.001 }, meltPoint: -200, boilPoint: -100 },
  mat_test_oil: { ...plain, basis: '测试', substance: 'subst_water', density: { liquid: 0.8 }, meltPoint: -100 },
});

// 物品行：massKg、material、bulkForm（可能物态集含固时必填）与组件类要求的维度；basis 是实体行必填的文档字段。
export const itemRow = (massKg, material, extra = {}) => ({ basis: '测试', massKg, material, bulkForm: 'bform_block', classes: [], ...extra });
export const share = (group, materialRef, s) => ({ group, materialRef, share: s });

const ruleRows = (file, edit) => {
  const doc = JSON.parse(readFileSync(join(ROOT, RULES, 'tables', file), 'utf8'));
  edit(doc.rows);
  return doc;
};
const setRule = (rows, key, value) => {
  const i = rows.findIndex((r) => r.key === key);
  const row = { key, value, source: '测试', grade: 'designed', basis: '测试前提' };
  if (i < 0) rows.push(row); else rows[i] = row;
};

export function baseFixture() {
  return {
    items: {},
    materials: clone(MATERIALS),
    vocab: {
      class: {},
      category: { category_test_tool: { stockSlot: true }, category_test_pack: { stockSlot: true }, category_test_other: { stockSlot: false } },
      size: { size_test_s: {}, size_test_m: {} },
    },
    // rules.items：真实表的 aggregation、instancedComponents、staticStateOrder 等照用；下面是卷文没给首批值、测试自己给的前提。
    rulesItems: {
      materialClassMin: 0.5,
      categoryRules: [
        { when: 'member(comp_tool, item.classes)', value: 'category_test_tool' },
        { when: 'member(comp_container, item.classes)', value: 'category_test_pack' },
        { when: 'massKg > 0', value: 'category_test_other' },
      ],
      classRules: [{ when: 'member(comp_container, item.classes) && holdsLiquid', value: 'class_vessel' }],
      sizeClasses: [{ size: 'size_test_s', minVolumeL: 0 }, { size: 'size_test_m', minVolumeL: 10 }],
    },
    envTempDomain: { min: -60, max: 60 },
  };
}

/**
 * 按 f 建临时世界并加载。返回 {ok, errors: [[码, 表, 行, 维]], world}；world 是 loadWorld 的结果。
 * @param {ReturnType<typeof baseFixture>} f
 */
export function loadItemWorld(f) {
  const tmp = testTempRoot('b62-item-');
  try {
    for (const name of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) {
      const doc = readDim(name);
      if (name === '_vocab.json') {
        for (const [fam, entries] of Object.entries(f.vocab)) Object.assign(doc.families[fam].entries, clone(entries));
        if (typeof f.editVocab === 'function') f.editVocab(doc);
      }
      if (name === 'material.json') {
        for (const [id, row] of Object.entries(f.materials)) doc.rows[id] = graded(doc.dimensions, clone(row));
        if (typeof f.editMaterialDoc === 'function') f.editMaterialDoc(doc);
      }
      if (name === 'item.json') {
        Object.assign(doc.rows, clone(f.items));
        if (typeof f.editItemDoc === 'function') f.editItemDoc(doc);
      }
      writeUnderTempRoot(tmp, `dims/${name}`, JSON.stringify(doc));
    }
    const reg = JSON.parse(readFileSync(join(ROOT, RULES, 'registry.json'), 'utf8'));
    for (const row of reg.rows) writeUnderTempRoot(tmp, `rules/${row.file}`, readFileSync(join(ROOT, RULES, row.file), 'utf8'));
    // rules.items：首批以外的键测试给值，并从 unbuilt 里去掉；f.rulesItems 里写 null 的键保持未建。
    const items = ruleRows('items.json', (rows) => {
      const given = Object.entries(f.rulesItems).filter(([, v]) => v !== null);
      for (const [k, v] of given) setRule(rows, k, clone(v));
      const un = rows.find((r) => r.key === 'unbuilt');
      un.value = un.value.filter((k) => !given.some(([g]) => g === k));
      if (typeof f.editRulesItems === 'function') f.editRulesItems(rows);
    });
    writeUnderTempRoot(tmp, 'rules/tables/items.json', JSON.stringify(items));
    const mats = ruleRows('materials.json', (rows) => { if (typeof f.editRulesMaterials === 'function') f.editRulesMaterials(rows); });
    writeUnderTempRoot(tmp, 'rules/tables/materials.json', JSON.stringify(mats));
    const climate = ruleRows('climate.json', (rows) => {
      const un = rows.find((r) => r.key === 'unbuilt');
      if (f.envTempDomain !== null) {
        setRule(rows, 'envTempDomain', clone(f.envTempDomain));
      } else { // 域没给：真世界已登值，这里去掉并登回 unbuilt，造"尚未给值"的前提
        rows.splice(rows.findIndex((r) => r.key === 'envTempDomain'), 1);
        un.value = [...un.value, 'envTempDomain'].sort();
      }
    });
    writeUnderTempRoot(tmp, 'rules/tables/climate.json', JSON.stringify(climate));
    writeUnderTempRoot(tmp, 'rules/registry.json', JSON.stringify(reg));
    const r = loadWorld(ROOT, { dimensionsDir: relative(ROOT, join(tmp, 'dims')), rulesDir: join(tmp, 'rules') });
    const errs = r.errors.filter((e) => e.severity === 'error');
    // messages：内核写者核对（物品表行校验、聚合表）报的错没有行字段，说明在 got 里，用例按它认行。
    return { ok: r.ok, errors: errs.map((e) => [e.code, e.table, e.row, e.dim]), messages: errs.map((e) => `${e.code} ${typeof e.got === 'string' ? e.got : JSON.stringify(e.got)}`), world: r };
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

export const engineOf = (w) => ({ vocab: w.vocab, rules: w.rules, units: w.env.units, tables: w.tables });
