// 6-2 只核改一轮的补测（docs/审查/6-2-Sonnet只核-1119.md M1、M2、M3、S2、S4 与定义源一致性）。前提同 item.test.mjs：临时世界里造，期望照卷文手算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadItemWorld, engineOf, itemRow, share, ROOT, MATERIALS } from './item-world.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { materialView, itemView } from '../../server-plugin/kernel/item.mjs';
import { checkHoldingKindRows } from '../../server-plugin/kernel/holdings.mjs';
import { MATTER_STATES } from '../../server-plugin/kernel/handles/markers.mjs';

const body = (m, s) => share('mgroup_body', m, s);
const world = (edit) => { const f = baseFixture(); if (edit) edit(f); return loadItemWorld(f); };
const has = (r, code, id) => r.messages.some((m) => m.startsWith(code) && (id === undefined || m.includes(id))) || r.errors.some(([c, , row]) => c === code && (id === undefined || row === id));
const realVocab = () => JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8'));

test('M1 本源成分到类别在规则表 rules.materials.substanceClass（卷三乙 :326、:566），不在 substance 词表条目上；首批九条', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true);
  assert.equal(Object.keys(r.rules.materials.substanceClass).length, 9);
  assert.equal(r.rules.materials.substanceClass.subst_metal, 'class_metal');
  for (const e of Object.values(realVocab().families.substance.entries)) assert.equal(Object.hasOwn(e, 'materialClass'), false);
});

test('M-9 同一类别同时出自本源成分与派生大类即 E-DIM-DERIVED-CONFLICT；只出自一条来源不报', () => {
  const conflict = (f) => {
    f.editVocab = (doc) => { doc.families.matcat.entries.matcat_test_metalish = { materialClass: 'class_metal' }; };
    f.editRulesMaterials = (rows) => { rows.find((x) => x.key === 'matcatRules').value.push({ when: 'substance == subst_metal && meltPoint > 1000', value: 'matcat_test_metalish' }); };
  };
  assert.ok(has(world((f) => { conflict(f); f.items.item_test_a = itemRow(1, [body('mat_test_iron', 1)]); }), 'E-DIM-DERIVED-CONFLICT', 'item_test_a'));
  // 锡熔点 230 不过派生大类条件：金属类只出自本源成分一条来源。
  assert.ok(world((f) => { conflict(f); f.items.item_test_a = itemRow(1, [body('mat_test_tin', 1)]); }).ok);
});

test('I-7 加载期：具有 class_formed（可能物态集含固且 bulkForm 承重）的物品，结构组固态材料缺 wearResistance（error 级）即加载失败；散粒形态不要求', () => {
  const soft = (f) => { const m = { ...MATERIALS.mat_test_iron }; delete m.wearResistance; f.materials.mat_test_soft = m; };
  assert.ok(has(world((f) => { soft(f); f.items.item_test_a = itemRow(1, [body('mat_test_soft', 1)]); }), 'E-DIM-REQUIRED-MISSING', 'item_test_a'));
  assert.ok(world((f) => { soft(f); f.items.item_test_a = itemRow(1, [body('mat_test_soft', 1)], { bulkForm: 'bform_granule' }); }).ok);
  // 非结构组（装填）的份不参加。
  assert.ok(world((f) => { soft(f); f.items.item_test_a = itemRow(2, [body('mat_test_iron', 0.5), share('mgroup_fill', 'mat_test_soft', 0.5)]); }).ok);
});

test('I-7 使用时：不具有 class_formed（散粒）的物品承力各项不适用、材料行填了也不读；成形的照读', () => {
  const r = world((f) => {
    f.items.item_test_block = itemRow(1, [body('mat_test_iron', 1)]);
    f.items.item_test_dust = itemRow(1, [body('mat_test_iron', 1)], { bulkForm: 'bform_granule' });
  });
  assert.ok(r.ok, JSON.stringify(r.messages));
  const eng = engineOf(r.world);
  assert.equal(materialView(eng, {}, 'item_test_block').dims.sharpnessMax.value, 40);
  assert.deepEqual(materialView(eng, {}, 'item_test_dust').dims.sharpnessMax, { known: false, applicable: false });
  assert.equal(materialView(eng, {}, 'item_test_dust').dims.valueMult.value, 3); // 非固相量照读
});

test('M3 表头声明卷三乙 §2.2 的 emits、attachModifiers、launch、guard 四维；launch.source 取卷十三 launchsrc 三值；未建列机读登记', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/item.json'), 'utf8'));
  for (const k of ['emits', 'attachModifiers', 'launch', 'guard']) assert.ok(doc.dimensions[k], k);
  assert.deepEqual(Object.keys(doc.dimensions.guard.fields).sort(), ['coverBps', 'thicknessMm']);
  assert.deepEqual(doc.dimensions.guard.fields.coverBps.domain, [1, 10000]);
  assert.equal(doc.dimensions.launch.fields.source.vocab, 'launchsrc');
  const unbuilt = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_unbuilt-derived.json'), 'utf8'));
  const cols = unbuilt.columns.filter((c) => c.table === 'item').map((c) => c.dimension);
  assert.equal(cols.length, 18);
  for (const k of ['attachModifiers', 'launch', 'guard']) assert.ok(cols.includes(k), k);
});

test('定义源一致：markers 的 MATTER_STATES 恰是 _vocab matter 族全部条目；两边不一致加载即失败', () => {
  assert.deepEqual(Object.keys(realVocab().families.matter.entries).sort(), [...MATTER_STATES].sort());
  assert.ok(world((f) => { f.editVocab = (doc) => { doc.families.matter.entries.matter_plasma = {}; }; }).errors.length > 0);
});

test('K6-29 实体表名解析排除可终止实体类（卷十八 §4.1.1 :457）：类别行写了 termination 的表名不算端类型', () => {
  const r = world();
  const eng = engineOf(r.world);
  const kind = [...eng.vocab.index].find(([, rec]) => rec.family === 'holding_kind');
  const check = (from, tables) => checkHoldingKindRows({ vocab: { index: new Map([[kind[0], { family: 'holding_kind', entry: { ...kind[1].entry, from } }]]) }, rules: eng.rules, tables }).errors.some((e) => e.startsWith('E-HK-END-TYPE'));
  const tables = new Map([['item', eng.tables.get('item')], ['mortal_x', { doc: { classes: { class_m: { termination: { mode: 'x' } } } } }]]);
  assert.equal(check(['item'], tables), false);
  assert.equal(check(['mortal_x'], tables), true);
});

test('itemView 签名照卷二 §2.2：不存在的 id 返回 null，有 options 参数', () => {
  const eng = engineOf(world((f) => { f.items.item_test_a = itemRow(1, [body('mat_test_iron', 1)]); }).world);
  assert.equal(itemView.length, 3); // options 带缺省值，length 不计
  assert.equal(itemView(eng, {}, 'item_test_a', {}).id, 'item_test_a');
  assert.equal(itemView(eng, {}, 'item_nobody'), null);
});
