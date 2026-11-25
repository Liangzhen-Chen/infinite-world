// 6-23 人类物种行落地（李白 11-22 P-1、P-6～P-17；卡 F:/dnd-tmp/card-species-fill.md）。
// 期望值取数据列的字面量或按卷文手算：节段比和 0.497 + 0.081 + 2×0.044 + 2×0.006 + 2×0.161 = 1，属性刻度 [0, 99]（旧数据 attr.cap.human）。
// 真实世界直接加载；"person 行引用 species"一条用 body-world 夹具造最小人物表，只加测试自己的前提。只跑不推进世界的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { baseFixture, loadBodyWorld, ROOT } from './body-world.mjs';

const REAL = loadWorld(ROOT);
const rowsOf = (kind) => REAL.tables.get(kind).doc.rows;
const human = () => rowsOf('species').species_human;
const MARK = '暂定·待试玩标定';

test('真实世界带人类物种行与人形身体图加载成功，没有必填缺失与出处占位错误', () => {
  const errs = REAL.errors.filter((e) => e.severity === 'error');
  assert.deepEqual(errs.map((e) => [e.code, e.table, e.row, e.dim]), []);
  assert.ok(!REAL.errors.some((e) => e.code === 'E-DIM-REQUIRED-MISSING' || e.code === 'E-DIM-SOURCE-PLACEHOLDER'));
  assert.ok(Object.hasOwn(rowsOf('species'), 'species_human'));
  assert.ok(Object.hasOwn(rowsOf('body_plan'), 'body_humanoid'));
});

test('人类行的有出处值与结构取值照数据列字面量', () => {
  const h = human();
  assert.equal(h.maturityYears, 19);
  assert.equal(h.lifespanYears.mean, 62);
  assert.equal(h.coreTempC, 36.8);
  assert.deepEqual(h.diet, ['diet_omnivore']);
  assert.equal(h.dietShares.diet_omnivore, 1);
  assert.equal(h.sleepHoursPerDay, 7);
  assert.equal(h.sapient, true);
  assert.deepEqual(h.classes, ['comp_sapient']);
  assert.deepEqual([h.carryMult, h.metabolismMult, h.growthRate, h.restartKg, h.temperament], [1, 1, 0, 0, 0]);
  assert.deepEqual([h.packSize, h.coverDim], [null, null]);
  // 双胎率 12.0‰ → {1: 988, 2: 12}；生育间隔不小于妊娠期（卷四 :134）。
  assert.deepEqual(h.litterSize.weights, { 1: 988, 2: 12 });
  assert.ok(h.birthIntervalDays >= h.gestationDays);
  // coolingC 归卷二十一标定、登未建列，行上不写值（李白 P-16）。
  assert.equal(Object.hasOwn(h, 'coolingC'), false);
});

test('人形身体图：节段比按 Dempster 合并后和为 1，部位树与能力贡献合卷四 §2.2 不变量（由加载器核），数值取字面量', () => {
  const plan = rowsOf('body_plan').body_humanoid;
  const by = Object.fromEntries(plan.parts.map((p) => [p.id, p.sizeFraction]));
  assert.deepEqual(by, { bpart_torso: 0.497, bpart_head: 0.081, bpart_arm_l: 0.044, bpart_hand_l: 0.006, bpart_arm_r: 0.044, bpart_hand_r: 0.006, bpart_leg_l: 0.161, bpart_leg_r: 0.161 });
  // 千分之一为单位的整数和：497 + 81 + 2×44 + 2×6 + 2×161 = 1000。
  assert.equal(Object.values(by).reduce((s, v) => s + Math.round(v * 1000), 0), 1000);
  assert.deepEqual(plan.parts.filter((p) => p.vital).map((p) => p.id).sort(), ['bpart_head', 'bpart_torso']);
});

test('身体图每个组织都映射到已存在的材料行，组织键集 = 物种 tissues 键集，且组织份额之和为 1', () => {
  const plan = rowsOf('body_plan').body_humanoid;
  const tissues = human().tissues;
  assert.deepEqual(Object.keys(tissues).sort(), Object.keys(plan.tissueFractions).sort());
  for (const [t, mat] of Object.entries(tissues)) assert.ok(Object.hasOwn(rowsOf('material'), mat), `${t} -> ${mat}`);
  assert.equal(Object.values(plan.tissueFractions).reduce((s, v) => s + Math.round(v * 100), 0), 100);
  // reserve 只有脂肪为真。
  const ents = REAL.vocab.families.get('tissue').entries;
  assert.deepEqual(Object.keys(ents).filter((k) => ents[k].reserve), ['tissue_fat']);
});

test('七项属性分布：键集 = attr 族，均值 10、clamp 落在 rules.attr.bounds = [0, 99] 内', () => {
  const b = REAL.rules.attr.bounds;
  assert.deepEqual(b, { min: 0, max: 99 });
  const attrs = human().attributesBase;
  assert.deepEqual(Object.keys(attrs).sort(), Object.keys(REAL.vocab.families.get('attr').entries).sort());
  assert.equal(Object.keys(attrs).length, 7);
  for (const d of Object.values(attrs)) {
    assert.equal(d.mean, 10);
    assert.ok(d.clamp[0] >= b.min && d.clamp[1] <= b.max && d.clamp[0] < d.mean && d.mean < d.clamp[1]);
  }
});

test('所有"暂定·待试玩标定"的值都能从数据里按标记查到（只核标记存在）', () => {
  for (const [kind, id] of [['species', 'species_human'], ['body_plan', 'body_humanoid']]) {
    const basis = rowsOf(kind)[id].basis;
    assert.ok(basis.includes(MARK), `${id} basis 带标记`);
  }
  const text = JSON.stringify(rowsOf('species').species_human.basis);
  for (const p of ['P-7', 'P-13', 'P-15', 'P-17']) assert.ok(text.includes(p), p);
});

test('一个引用人类物种的 person 夹具行通过加载期 species 引用校验', () => {
  // 夹具保留真实人类行与人形身体图（realHuman），去掉夹具自己的测试词表、身体图与物种行，只留一个引用人类的最小人物表行。
  const f = baseFixture();
  Object.assign(f, { realHuman: true, capabilities: {}, plans: {}, species: {}, persons: {} });
  f.vocab = { body_part: [], tissue: {}, attr: {}, sex: {}, gait: {}, taxon: {}, class: {}, life_stage: {}, trait: {} };
  f.persons.npc_test_human = { species: 'species_human', basis: 'test' };
  const r = loadBodyWorld(f);
  assert.deepEqual(r.errors, []);
  assert.ok(r.ok);
  // 引用不存在的物种仍被拒（校验没被放宽）。
  f.persons.npc_test_human = { species: 'species_nobody', basis: 'test' };
  assert.deepEqual(loadBodyWorld(f).errors, [['E-DIM-REF-MISSING', 'person', 'npc_test_human', 'species']]);
});

test('带标记的规则表行 rules.attr.bounds 出处写旧数据路径', () => {
  const row = JSON.parse(readFileSync(join(ROOT, 'world/rules/tables/attr.json'), 'utf8')).rows.find((x) => x.key === 'bounds');
  assert.ok(row.basis.includes('world/rules/tables/balance/attributes.json'));
  assert.ok(row.source.includes('M4-50'));
});
