// 块 6 第 6-9 张《估值与 priceFor》之估值半：卷三乙 §4.16 估值公式与稀缺度派生（V-1 基础价值、V-2 单件估值、V-3 各项、V-5 稀缺度、V-7 纯函数与 explain 复算、V-8 没有回退）、
// §4.18 Y-1 货值密度、§2.7 配方表与 §4.7 N-7、R-6 除数下界、R-12 判环的加载期校验；工价与加成读 rules.crafting（V-1 ①）。
// 期望值按卷文公式手算成字面量（定点 4 位、向零截断），前提在 tests/kernel/item-world.mjs 的临时世界里造；规则表的暂定值（unitValue 10、valueAdd 0.1、laborRate 一阶 0.2 铜每分钟、
// conditionCurve 恒等线、freshnessCurve 反向恒等线、scarcityCurve [[0,3],[1,1]]、scarcityHorizonDays 30、品质表 −0.5 到 +1）在各用例开头抄成字面量再算，不读当前计数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, engineOf, itemRow, share, ROOT } from './item-world.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post } from '../../server-plugin/kernel/ledger.mjs';
import { valueBaseOf, valueDensityOf, valuation, scarcity, registerValuer, resetValuers } from '../../server-plugin/kernel/valuation.mjs';
import { pricingRecipeOf, recipeView } from '../../server-plugin/kernel/recipe.mjs';
import { fixedUnits, fixedMultiply, fixedToNumber } from '../../server-plugin/kernel/det-math.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const IRON = 'mat_test_iron'; // valueMult 3（item-world.mjs）
const TIN = 'mat_test_tin'; // valueMult 1
const WOOD = 'mat_test_wood'; // valueMult 1
const GRAIN = 'mat_test_grain';
const body = (m, s) => share('mgroup_body', m, s);
const PA = 'loc_county_xichui_longqu';
const SH = 'purpose_test_shelf';
const rec = (inputs, outputs, extra = {}) => ({ basis: '测试', inputs, outputs, yield: 1, wasteFraction: 0, minutes: 0, skillMin: 0, ...extra });
const piece = (item, qty) => ({ items: [item], qty, per: 'piece', consumed: true });
// 类别选择器的前提：用 classRules 让挂 comp_tool 的物品派生出测试类别 class_test_tool（类别不能手写在物品行上，I-6）。
const toolClass = (f) => {
  f.rulesItems = { ...f.rulesItems, classRules: [...f.rulesItems.classRules, { when: 'member(comp_tool, item.classes)', value: 'class_test_tool' }] };
  f.vocab.class.class_test_tool = {};
  delete f.items.item_test_axe; // 斧也挂 comp_tool，类别选择器的例子只要三根杆做成员
};

// 物品：valueMult 是 M-1 的 sum 口径（份额 × valueMult 之和）。
// ingot 2 kg 铁：valueMult 3；mixed 4 kg 铁锡各半：0.5×3 + 0.5×1 = 2；tin_bar 2 kg 锡：1；plank 3 kg 木：1。
const itemsFixture = () => ({
  item_test_ingot: itemRow(2, [body(IRON, 1)]),
  item_test_mixed: itemRow(4, [body(IRON, 0.5), body(TIN, 0.5)]),
  item_test_nail: itemRow(0.1, [body(IRON, 1)]),
  item_test_box: itemRow(1, [body(WOOD, 1)]),
  item_test_axe: itemRow(1.6, [share('mgroup_working', IRON, 0.6), share('mgroup_grip', WOOD, 0.4)], { classes: ['comp_tool'], wearPerUse: 0.05, dailyUses: 40 }),
  item_test_rod_a: itemRow(1, [body(IRON, 1)], { classes: ['comp_tool'] }), // 1×3×10 = 30
  item_test_rod_b: itemRow(2, [body(TIN, 1)], { classes: ['comp_tool'] }), // 2×1×10 = 20
  item_test_rod_c: itemRow(3, [body(WOOD, 1)], { classes: ['comp_tool'] }), // 3×1×10 = 30
  item_test_grain: itemRow(1, [body(GRAIN, 1)]),
  item_test_chest: itemRow(1, [body(WOOD, 1)]),
  item_test_chest_kg: itemRow(1, [body(WOOD, 1)]),
});

// 配方（工价取 laborRate 一阶 0.2 铜每分钟，加成 valueAdd 0.1；基础留存率 r0 = yield × (1 − wasteFraction)）：
//   nail_a：skillMin 100，50 分钟，投 1 件 ingot，产 10 枚 nail：（60 + 50×0.2）×1.1 ÷ 10 = 77 ÷ 10 = 7.7
//   nail_z：skillMin 50（更低，所以是定价配方），20 分钟，投 0.5 件 ingot（30），产 5 枚：（30 + 20×0.2）×1.1 ÷ 5 = 37.4 ÷ 5 = 7.48
const recipesFixture = () => ({
  recipe_test_nail_a: rec({ groups: [[piece('item_test_ingot', 1)]] }, [{ item: 'item_test_nail', qty: 10 }], { wasteFraction: 0.2, minutes: 50, skillMin: 100 }),
  recipe_test_nail_z: rec({ groups: [[piece('item_test_ingot', 0.5)]] }, [{ item: 'item_test_nail', qty: 5 }], { minutes: 20, skillMin: 50 }),
  // box：投 5 枚 nail（递归，nail 走 nail_z 的 7.48）：（5×7.48 + 10×0.2）×1.1 ÷ 1 = (37.4 + 2)×1.1 = 43.34
  recipe_test_box: rec({ groups: [[piece('item_test_nail', 5)]] }, [{ item: 'item_test_box', qty: 1 }], { minutes: 10 }),
});

function build(edit) {
  const f = baseFixture();
  f.materials[GRAIN] = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate: 0.04, moisture: 0.12, energyDensity: 15 };
  f.items = itemsFixture();
  f.recipes = recipesFixture();
  f.editPlaceDoc = (doc) => { doc.rows[PA].ledgerHolder = true; };
  f.rulesExtra = { rot: { tempCurve: [[-100, 1], [100, 1]], stages: [{ minSpoilage: 0 }, { minSpoilage: 0.3 }, { minSpoilage: 0.7 }, { minSpoilage: 1 }], mergeMaxGap: 0.1 }, wear: { envCurve: [[0, 1], [1, 1]] } };
  if (edit) edit(f);
  const r = loadItemWorld(f);
  return { r, f };
}

function engine(edit) {
  const { r } = build(edit);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  const index = new Map(W.vocab.index);
  index.set(SH, { family: 'purpose', prefix: 'purpose_', entry: { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false } });
  index.set('verb_test', { family: 'verb', prefix: 'verb_', entry: {} });
  index.set('res_test_grain', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_grain' } });
  installVocab({ vocab: { families: W.vocab.families, index }, idIndex: W.idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  rules.economyResources.res_test_grain = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_consume', 'sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  return { vocab: { families: W.vocab.families, index }, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_world_seed' } };
}

const at = (day, extra = {}) => ({ clock: { minute: day * 1440, seq: 0 }, ...extra });
const failedWith = (r, code, text) => !r.ok && r.messages.some((m) => m.startsWith(code) && (text === undefined || m.includes(text)));
// explain 复算：valueBase 一项起，其余各项按同一顺序定点连乘（卷三乙 V-7），结果须逐位等于 value。
const fold = (explain) => explain.slice(1).reduce((acc, e) => fixedMultiply(acc, fixedUnits(e.factor)), fixedUnits(explain[0].factor));

// ---------- V-1 ② 材料价 ----------

test('V-1 ② 无配方的物品：massKg × 按 M-1 聚合的 valueMult × unitValue；铁 2 kg × 3 × 10 = 60；铁锡各半 4 kg × (0.5×3 + 0.5×1 = 2) × 10 = 80；只加一件物品行就有价，不改 .mjs', () => {
  const eng = engine();
  const state = at(0);
  const a = valueBaseOf(eng, state, 'item_test_ingot');
  assert.deepEqual([a.known, a.value, a.unit, a.source], [true, 60, 'copper', 'material']);
  assert.equal(valueBaseOf(eng, state, 'item_test_mixed').value, 80);
  assert.equal(valueBaseOf(eng, state, 'item_test_rod_a').value, 30);
});

test('V-1 ② 不是物品模板的 id 拒（E-DIM-REF-MISSING），不静默给价', () => {
  const eng = engine();
  assert.throws(() => valueBaseOf(eng, at(0), 'mat_test_iron'), (e) => e.code === 'E-DIM-REF-MISSING');
  assert.throws(() => valueBaseOf(eng, at(0), 'item_nope'), (e) => e.code === 'E-DIM-REF-MISSING');
});

test('Y-1 货值密度 = valueBase ÷ massKg：铁锭 60 ÷ 2 = 30；混合 80 ÷ 4 = 20；不含稀缺项', () => {
  const eng = engine();
  assert.deepEqual([valueDensityOf(eng, at(0), 'item_test_ingot').value, valueDensityOf(eng, at(0), 'item_test_ingot').unit], [30, 'copper_per_kg']);
  assert.equal(valueDensityOf(eng, at(0), 'item_test_mixed').value, 20);
});

// ---------- V-1 ① 配方价 ----------

test('V-1 ① 有配方：多条取 skillMin 最低者为定价配方（nail_z 的 50 低于 nail_a 的 100），价 = (30 + 20×0.2) × 1.1 ÷ 5 = 7.48，不是 nail_a 的 7.7', () => {
  const eng = engine();
  assert.deepEqual(pricingRecipeOf(eng, 'item_test_nail'), { id: 'recipe_test_nail_z', index: 0 });
  const v = valueBaseOf(eng, at(0), 'item_test_nail');
  assert.deepEqual([v.known, v.value, v.source, v.recipe], [true, 7.48, 'recipe', 'recipe_test_nail_z']);
});

test('V-1 ① 定价配方 skillMin 平局按配方代号字典序：两条都 skillMin 100，价取代号靠前的 nail_a = (60 + 50×0.2) × 1.1 ÷ 10 = 7.7', () => {
  const eng = engine((f) => { delete f.recipes.recipe_test_nail_z; f.recipes.recipe_test_nail_b = rec({ groups: [[piece('item_test_ingot', 0.5)]] }, [{ item: 'item_test_nail', qty: 5 }], { minutes: 20, skillMin: 100 }); });
  assert.equal(pricingRecipeOf(eng, 'item_test_nail').id, 'recipe_test_nail_a');
  assert.equal(valueBaseOf(eng, at(0), 'item_test_nail').value, 7.7);
});

test('V-1 ① 递归沿配方图，原料以 ② 为界：box = (5 × 7.48 + 10 × 0.2) × 1.1 ÷ 1 = 43.34；用 ingot 的 ② 价 60 沉到 nail、再到 box', () => {
  const eng = engine();
  assert.equal(valueBaseOf(eng, at(0), 'item_test_box').value, 43.34);
});

test('V-1 ① 模板价不随谁做的变：定价配方 valueBase × 基础产出件数 ≥ 各消耗项参考价值之和（V3-4.16-I）：7.48 × 5 = 37.4 ≥ 30；工与加成非负', () => {
  const eng = engine();
  const v = valueBaseOf(eng, at(0), 'item_test_nail');
  assert.ok(fixedMultiply(fixedUnits(v.value), fixedUnits(5)) >= fixedUnits(30));
});

test('V-1 ① 加一条配方行只改数据：给 item_test_chest 配方后它的价由 ② 的 10 变为配方价；不改 .mjs（V3-4.16-E）', () => {
  const eng0 = engine();
  assert.equal(valueBaseOf(eng0, at(0), 'item_test_chest').value, 10); // 1 kg 木 × 1 × 10，无配方
  const eng1 = engine((f) => { f.recipes.recipe_test_chest = rec({ groups: [[piece('item_test_ingot', 1)]] }, [{ item: 'item_test_chest', qty: 1 }], { minutes: 100 }); });
  // (60 + 100×0.2) × 1.1 ÷ 1 = 88
  assert.equal(valueBaseOf(eng1, at(0), 'item_test_chest').value, 88);
});

test('V-1 ① 消耗项 consumed 为假（工具、原件）不计；abilities 项不计：同一配方加一个 consumed 假的 ingot 项，价不变', () => {
  const eng = engine((f) => {
    f.recipes.recipe_test_nail_z.inputs = { groups: [[piece('item_test_ingot', 0.5)], [{ items: ['item_test_ingot'], qty: 9, per: 'piece', consumed: false }]] };
  });
  assert.equal(valueBaseOf(eng, at(0), 'item_test_nail').value, 7.48);
});

test('V-1 ① 每组只取第一个候选项：第一候选 ingot 0.5 件，第二候选 mixed 99 件被忽略，价仍 7.48', () => {
  const eng = engine((f) => { f.recipes.recipe_test_nail_z.inputs = { groups: [[piece('item_test_ingot', 0.5), piece('item_test_mixed', 99)]] }; });
  assert.equal(valueBaseOf(eng, at(0), 'item_test_nail').value, 7.48);
});

test('V-1 ① classes 选择器（piece）：成员 rod_a 30、rod_b 20、rod_c 30 的 valueBase 下中位数 = 升序 [20,30,30] 的第 2 个 = 30；qty 2 → 60；(60 + 0)×1.1 = 66；per kg 取 valueBase ÷ massKg = [30,10,10] 下中位数 10 × 2 = 20 → 22', () => {
  const eng = engine((f) => {
    toolClass(f);
    f.recipes.recipe_test_chest = rec({ groups: [[{ classes: ['class_test_tool'], qty: 2, per: 'piece', consumed: true }]] }, [{ item: 'item_test_chest', qty: 1 }]);
    f.recipes.recipe_test_chest_kg = rec({ groups: [[{ classes: ['class_test_tool'], qty: 2, per: 'kg', consumed: true }]] }, [{ item: 'item_test_chest_kg', qty: 1 }]);
  });
  assert.equal(valueBaseOf(eng, at(0), 'item_test_chest').value, 66);
  assert.equal(valueBaseOf(eng, at(0), 'item_test_chest_kg').value, 22);
});

// ---------- V-8 没有回退：未知带缺口，不当零 ----------

test('V-8 工价规则表没给值：配方价未知带缺口 rules.crafting.laborRate，沿配方图传到 box；不回退到材料价、不当零；无配方的物品不受影响', () => {
  const eng = engine((f) => {
    f.editRules = { crafting: (rows) => { rows.splice(rows.findIndex((r) => r.key === 'laborRate'), 1); const u = rows.find((r) => r.key === 'unbuilt'); u.value = [...u.value, 'laborRate'].sort(); } };
  });
  const nail = valueBaseOf(eng, at(0), 'item_test_nail');
  assert.deepEqual([nail.known, nail.value, nail.gaps], [false, undefined, ['rules.crafting.laborRate']]);
  assert.deepEqual(valueBaseOf(eng, at(0), 'item_test_box').gaps, ['rules.crafting.laborRate']);
  assert.equal(valueBaseOf(eng, at(0), 'item_test_ingot').value, 60);
});

test('V-8 matcats、where、pool 选择器要材料 rawForm 或替代池折算（未建）：配方价未知带缺口，不编数', () => {
  const eng = engine((f) => {
    toolClass(f);
    f.recipes.recipe_test_chest = rec({ groups: [[{ matcats: ['matcat_char'], qty: 1, per: 'kg', consumed: true }]] }, [{ item: 'item_test_chest', qty: 1 }]);
    f.recipes.recipe_test_chest_kg = rec({ groups: [[{ classes: ['class_test_tool'], qty: 1, per: 'pool', consumed: true }]] }, [{ item: 'item_test_chest_kg', qty: 1 }]);
  });
  assert.deepEqual(valueBaseOf(eng, at(0), 'item_test_chest').gaps, ['material_rawForm_unbuilt']);
  assert.deepEqual(valueBaseOf(eng, at(0), 'item_test_chest_kg').gaps, ['substitute_pool_unbuilt']);
});

test('V-8 unitValue 规则表没给值：材料价未知带缺口 rules.valuation.unitValue，不是 0', () => {
  const eng = engine((f) => { f.editRules = { valuation: (rows) => { rows.splice(rows.findIndex((r) => r.key === 'unitValue'), 1); const u = rows.find((r) => r.key === 'unbuilt'); u.value = [...u.value, 'unitValue'].sort(); } }; });
  const v = valueBaseOf(eng, at(0), 'item_test_ingot');
  assert.deepEqual([v.known, v.value, v.gaps], [false, undefined, ['rules.valuation.unitValue']]);
});

// ---------- V-5 稀缺度、V-3 稀缺项 ----------

test('V-5 稀缺度 = supply ÷ (demandPerDay × 30)：供 30、日需求 2 → 30 ÷ 60 = 0.5，因子 = scarcityCurve [[0,3],[1,1]] 在 0.5 处 = 2；供 0 → 比 0，因子 3；供 100 → 比 1.6666，曲线端点外取 1', () => {
  const eng = engine();
  const s = (supply, demandPerDay) => scarcity(eng, at(0), 'item_test_ingot', { supply, demandPerDay });
  assert.equal(s(30, 2).value, 0.5);
  assert.equal(s(100, 2).value, 1.6666);
  const factor = (supply) => valuation(eng, at(0), 'item_test_ingot', { supply, demandPerDay: 2 }).scarcityFactor;
  assert.equal(factor(30).value, 2);
  assert.equal(factor(0).value, 3);
  assert.equal(factor(100).value, 1);
});

test('V-5 supply 未传、日需求未传或为 0：稀缺度未知带缺口（不做除法、不取端点、不用常数），scarcityFactor 同样未知；传入负数拒', () => {
  const eng = engine();
  assert.deepEqual(scarcity(eng, at(0), 'item_test_ingot', {}).gaps, ['ctx.demandPerDay', 'ctx.supply']);
  assert.deepEqual(scarcity(eng, at(0), 'item_test_ingot', { supply: 5, demandPerDay: 0 }).gaps, ['ctx.demandPerDay']);
  assert.deepEqual(scarcity(eng, at(0), 'item_test_ingot', { supply: null, demandPerDay: 3 }).gaps, ['ctx.supply']);
  const v = valuation(eng, at(0), 'item_test_ingot', { supply: 5, demandPerDay: 0 });
  assert.deepEqual([v.scarcityFactor.known, v.scarcityFactor.gaps], [false, ['ctx.demandPerDay']]);
  assert.throws(() => scarcity(eng, at(0), 'item_test_ingot', { supply: -1, demandPerDay: 2 }), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
});

test('V-2 内在值不含供需：value 不随范围内供给变（供 0、供 1e6、未传都是 60）；scarcityFactor 单独返回，不乘进 value', () => {
  const eng = engine();
  for (const supply of [0, 1000000, undefined]) assert.equal(valuation(eng, at(0), 'item_test_ingot', { supply, demandPerDay: 2 }).value.value, 60);
});

// ---------- V-2、V-3 实例与批次 ----------

const axeInstance = (over = {}) => ({ template: 'item_test_axe', taint: 0, qualityTier: 'quality_good', durability: 0.5, wearAnchorDay: 4, ...over });

test('V-2 实例：斧 1.6 kg，valueMult = 0.6×3 + 0.4×1 = 2.2，valueBase = 1.6 × 2.2 × 10 = 35.2；良档 +0.25（品质是 valueBase 上的修正项，Q-1）→ 44；durability 0.5 当日 → conditionCurve(0.5) = 0.5 → 22', () => {
  const eng = engine();
  const state = at(4, { itemInstances: { item_inst_1: axeInstance() } });
  assert.equal(valueBaseOf(eng, state, 'item_test_axe').value, 35.2);
  const v = valuation(eng, state, 'item_inst_1', {});
  assert.deepEqual([v.value.known, v.value.value, v.value.unit], [true, 22, 'copper']);
  assert.deepEqual(v.explain.map((e) => [e.term, e.factor]), [['valueBase', 44], ['condition', 0.5]]);
  assert.equal(fold(v.explain), fixedUnits(v.value.value));
});

test('V-2 品质七档按暂定表：劣 −0.5、次 −0.25、常 0、良 0.25、优 0.5、精 0.75、绝 1 乘在 valueBase 上（35.2 × [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] 逐档定点截断）；durability 1 不折', () => {
  const eng = engine();
  const tiers = { quality_awful: 17.6, quality_poor: 26.4, quality_normal: 35.2, quality_good: 44, quality_excellent: 52.8, quality_masterwork: 61.6, quality_legendary: 70.4 };
  for (const [tier, want] of Object.entries(tiers)) {
    const state = at(4, { itemInstances: { item_inst_1: axeInstance({ qualityTier: tier, durability: 1 }) } });
    assert.equal(valuation(eng, state, 'item_inst_1', {}).value.value, want, tier);
  }
});

test('V-3 成色项读 durability 当日值：存 0.5、锚点日 4，当日 4 取 0.5；毁坏（durability 0）无价', () => {
  const eng = engine();
  assert.equal(valuation(eng, at(4, { itemInstances: { i: axeInstance({ qualityTier: 'quality_normal', durability: 0 }) } }), 'i', {}).value.value, 0);
});

test('V-3 品质表里没有这一档（引擎规则表副本去掉良档；加载期 Q-6 会拒这样的表，这里只验读者的行为）：估值未知带缺口 rules.quality.tiers，不当常档', () => {
  const eng = engine();
  eng.rules.quality.tiers = eng.rules.quality.tiers.filter((x) => x.tier !== 'quality_good');
  const state = at(4, { itemInstances: { item_inst_1: axeInstance({ durability: 1 }) } });
  const v = valuation(eng, state, 'item_inst_1', {}).value;
  assert.deepEqual([v.known, v.gaps], [false, ['rules.quality.tiers']]);
});

test('V-3 材质项：模板按 ② 定价的实例直接用实例材料算 ②（铁锭 2 kg，实例材料换成锡：2 × 1 × 10 = 20）；按 ① 定价的模板乘 实例 valueMult ÷ 模板 valueMult（nail 7.48 × 1 ÷ 3 = 7.48 × 0.3333 = 2.4930，定点截断）', () => {
  const eng = engine();
  const state = at(0, {
    itemInstances: { item_inst_a: { template: 'item_test_ingot', taint: 0 }, item_inst_b: { template: 'item_test_nail', taint: 0 } },
    created: { item_inst_a: { props: { material: [{ group: 'mgroup_body', materialRef: TIN, share: 1 }] } }, item_inst_b: { props: { material: [{ group: 'mgroup_body', materialRef: TIN, share: 1 }] } } },
  });
  assert.equal(valuation(eng, state, 'item_inst_a', {}).value.value, 20);
  const b = valuation(eng, state, 'item_inst_b', {});
  assert.equal(b.value.value, 2.493);
  assert.deepEqual(b.explain.map((e) => [e.term, e.factor]), [['valueBase', 7.48], ['material', 0.3333]]);
  assert.equal(fold(b.explain), fixedUnits(2.493));
});

test('V-3 装饰项读卷二十三（beauty 与 renownBonus 未建）：读不到，value 带缺口 item.beauty 且 partial，不写缺省、不当零加', () => {
  const eng = engine();
  const v = valuation(eng, at(0), 'item_test_ingot', {}).value;
  assert.deepEqual([v.known, v.value, v.partial, v.gaps], [true, 60, true, ['item.beauty']]);
});

test('V-4 批次估值 = 件数 × 单件，新鲜项读腐坏当日值：粮 10 件第 10 日腐坏 0.04 × 10 = 0.4，freshnessCurve 反向恒等线 → 0.6；单件 10 × 0.6 = 6，批 6 × 10 = 60', () => {
  const eng = engine();
  const state = at(0);
  let key;
  const r = runTransaction(state, { file: 'kernel/ledger.mjs', node: 'test_kernel' }, (s) => {
    key = post(eng, s, { legs: [{ account: { holder: PA, purpose: SH, resource: { kind: 'res_test_grain' } }, delta: 10, lot: { attrs: { enteredDay: 0, taint: 0, spoilage: 0, rotAnchorDay: 0 } } }, { flow: 'src_regrow', kind: 'res_test_grain', qty: 10 }], reason: 'verb_test' }).lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  state.clock.minute = 10 * 1440;
  const lot = { account: { holder: PA, purpose: SH, kind: 'res_test_grain' }, lotKey: key };
  const v = valuation(eng, state, lot, {});
  assert.deepEqual([v.value.known, v.value.value], [true, 60]);
  assert.deepEqual(v.explain.map((e) => [e.term, e.factor]), [['valueBase', 10], ['freshness', 0.6], ['quantity', 10]]);
  assert.equal(fold(v.explain), fixedUnits(60));
});

test('V-6 表象：实例带 purports 且 ctx.frame 给了观察者，识破与否要读卷二十二知情范围（未建）：按未知带缺口，不替观察者取真实值；不给 frame 取真实值', () => {
  const eng = engine();
  const state = at(4, { itemInstances: { i: axeInstance({ purports: { template: 'item_test_ingot' }, qualityTier: 'quality_normal', durability: 1 }) } });
  const seen = valuation(eng, state, 'i', { frame: 'npc_observer' }).value;
  assert.deepEqual([seen.known, seen.gaps], [false, ['purports_frame_unbuilt']]);
  assert.equal(valuation(eng, state, 'i', {}).value.value, 35.2);
});

test('V-7 纯函数：同状态同参数两次逐位相同、不改状态；explain 复算严格相等（模板与实例）', () => {
  const eng = engine();
  const state = at(4, { itemInstances: { item_inst_1: axeInstance() } });
  const before = structuredClone(state);
  const a = valuation(eng, state, 'item_inst_1', { supply: 30, demandPerDay: 2 });
  const b = valuation(eng, state, 'item_inst_1', { supply: 30, demandPerDay: 2 });
  assert.deepEqual(a, b);
  assert.deepEqual(state, before);
  assert.equal(fold(valuation(eng, state, 'item_test_box', {}).explain), fixedUnits(43.34));
});

// ---------- 别类实体 registerValuer ----------

test('registerValuer：别类实体（本例用 material id 当“别类”）没登记估值器按 V-8 返回未知带缺口，登记后转交该估值器；同一 kind 登记两次拒', () => {
  const eng = engine();
  resetValuers();
  const none = valuation(eng, at(0), 'mat_test_iron', {});
  assert.deepEqual([none.value.known, none.value.gaps], [false, ['valuer_unregistered:material']]);
  registerValuer('material', () => ({ value: { known: true, applicable: true, value: 7 }, scarcityFactor: { known: false, applicable: true, gaps: ['x'] }, explain: [] }));
  assert.equal(valuation(eng, at(0), 'mat_test_iron', {}).value.value, 7);
  assert.throws(() => registerValuer('material', () => null), (e) => e.code === 'E-WRITER-DUPLICATE');
  resetValuers();
});

// ---------- 加载期校验 ----------

const loadFails = (edit, code, text) => { const { r } = build(edit); assert.ok(failedWith(r, code, text), JSON.stringify(r.messages)); };

test('R-12 配方图有环加载失败（E-DIM-DERIVED-CYCLE）：ingot 由 nail 做、nail 由 ingot 做', () => {
  loadFails((f) => { f.recipes.recipe_test_ingot = rec({ groups: [[piece('item_test_nail', 1)]] }, [{ item: 'item_test_ingot', qty: 1 }]); }, 'E-DIM-DERIVED-CYCLE');
});

test('R-12 自指也成环：box 的配方投 box', () => {
  loadFails((f) => { f.recipes.recipe_test_box = rec({ groups: [[piece('item_test_box', 1)]] }, [{ item: 'item_test_box', qty: 1 }]); }, 'E-DIM-DERIVED-CYCLE');
});

test('R-6 V-1 除数下界：基础留存率 yield × (1 − wasteFraction) 为 0（yield 0、wasteFraction 1）或产物 qty 为 0 加载失败', () => {
  loadFails((f) => { f.recipes.recipe_test_nail_a.yield = 0; }, 'E-DIM-DOMAIN-RANGE', 'yield');
  loadFails((f) => { f.recipes.recipe_test_nail_a.wasteFraction = 1; }, 'E-DIM-DOMAIN-RANGE', 'yield');
  loadFails((f) => { f.recipes.recipe_test_nail_a.outputs[0].qty = 0; }, 'E-DIM-DOMAIN-RANGE', 'qty');
});

test('N-7 需求块候选项：计量项必写 per、qty 大于 0、per 在选择器允许集合内（items 只 piece、matcats 只 kg）、consumed 为假只 piece', () => {
  loadFails((f) => { f.recipes.recipe_test_nail_a.inputs = { groups: [[{ items: ['item_test_ingot'], qty: 1, consumed: true }]] }; }, 'E-DIM-REQUIRED-MISSING', 'per');
  loadFails((f) => { f.recipes.recipe_test_nail_a.inputs = { groups: [[{ items: ['item_test_ingot'], qty: 1, per: 'kg', consumed: true }]] }; }, 'E-DIM-STRUCT-FIELD', 'per kg');
  loadFails((f) => { f.recipes.recipe_test_nail_a.inputs = { groups: [[{ matcats: ['matcat_char'], qty: 1, per: 'piece', consumed: true }]] }; }, 'E-DIM-STRUCT-FIELD', 'per piece');
  loadFails((f) => { f.recipes.recipe_test_nail_a.inputs = { groups: [[{ items: ['item_test_ingot'], qty: 0, per: 'piece', consumed: true }]] }; }, 'E-DIM-DOMAIN-RANGE', 'qty');
  loadFails((f) => { toolClass(f); f.recipes.recipe_test_nail_a.inputs = { groups: [[{ classes: ['class_test_tool'], qty: 1, per: 'kg', consumed: false }]] }; }, 'E-DIM-STRUCT-FIELD', 'non-consumed');
  loadFails((f) => { f.recipes.recipe_test_nail_a.inputs = { groups: [[{ qty: 1, per: 'piece', consumed: true }]] }; }, 'E-DIM-STRUCT-FIELD', 'no selector');
  loadFails((f) => { f.vocab.ability = { ability_cut: {} }; f.recipes.recipe_test_nail_a.inputs = { groups: [[{ abilities: { ability_cut: 1 }, qty: 1 }]] }; }, 'E-DIM-STRUCT-FIELD', 'abilities');
});

test('R-7 品位三列：yieldCap 小于 yield 失败；gradeFrom 指向的输入组须存在且 consumed 为真', () => {
  loadFails((f) => { Object.assign(f.recipes.recipe_test_nail_a, { gradeFrom: 0, gradeRef: 50, yieldCap: 0.5 }); }, 'E-DIM-DOMAIN-RANGE', 'yieldCap');
  loadFails((f) => { Object.assign(f.recipes.recipe_test_nail_a, { gradeFrom: 3, gradeRef: 50, yieldCap: 1 }); }, 'E-DIM-DOMAIN-RANGE', 'gradeFrom');
});

test('Q-2 产物模板挂 comp_crafted 且逐件建实例（comp_crafted 与 instancedComponents 里的组件类同挂）时 qualityCurve 必填：缺则失败，给了过', () => {
  const crafted = (f) => { f.items.item_test_blade = itemRow(0.5, [body(IRON, 1)], { classes: ['comp_tool', 'comp_crafted'], wearPerUse: 0.05, dailyUses: 10 }); };
  loadFails((f) => { crafted(f); f.recipes.recipe_test_blade = rec({ groups: [[piece('item_test_ingot', 1)]] }, [{ item: 'item_test_blade', qty: 1 }]); }, 'E-DIM-REQUIRED-MISSING', 'qualityCurve');
  const { r } = build((f) => { crafted(f); f.recipes.recipe_test_blade = rec({ groups: [[piece('item_test_ingot', 1)]] }, [{ item: 'item_test_blade', qty: 1 }], { qualityCurve: [[0, 0], [1000, 100]] }); });
  assert.ok(r.ok, JSON.stringify(r.messages));
});

test('规则表跨键校验：scarcityCurve 沿覆盖比必须单调不升、品质表基准档各列为 0、laborRate 阶下界严格升序、wear.levels 的 minDurability 严格递减', () => {
  const bad = (code, edit, text) => { const { r } = build((f) => { f.rulesExtra = { ...f.rulesExtra, ...edit }; }); assert.ok(failedWith(r, code, text), JSON.stringify(r.messages)); };
  bad('E-DIM-DOMAIN-CURVE', { valuation: { scarcityCurve: [[0, 1], [1, 3]] } });
  bad('E-DIM-DOMAIN-RANGE', { quality: { tiers: [{ tier: 'quality_awful', key: 'item.valueBase', value: -0.5 }, { tier: 'quality_poor', key: 'item.valueBase', value: -0.25 }, { tier: 'quality_normal', key: 'item.valueBase', value: 0.1 }, { tier: 'quality_good', key: 'item.valueBase', value: 0.25 }, { tier: 'quality_excellent', key: 'item.valueBase', value: 0.5 }, { tier: 'quality_masterwork', key: 'item.valueBase', value: 0.75 }, { tier: 'quality_legendary', key: 'item.valueBase', value: 1 }] } });
  bad('E-DIM-DOMAIN-RANGE', { crafting: { laborRate: [{ minScore: 100, copperPerMinute: 0.5 }, { minScore: 100, copperPerMinute: 0.6 }] } });
  bad('E-DIM-DOMAIN-RANGE', { wear: { levels: [{ level: 'wear_intact', minDurability: 0.5, modifiers: [] }, { level: 'wear_worn', minDurability: 0.5, modifiers: [] }] } });
});

test('规则表跨键校验：品质表缺一档（Q-6 各档齐全）与负的 valueAdd 都失败', () => {
  const { r } = build((f) => { f.rulesExtra = { ...f.rulesExtra, quality: { tiers: [{ tier: 'quality_normal', key: 'item.valueBase', value: 0 }] } }; });
  assert.ok(failedWith(r, 'E-DIM-REQUIRED-MISSING', 'quality_awful'), JSON.stringify(r.messages));
  const neg = build((f) => { f.rulesExtra = { ...f.rulesExtra, crafting: { valueAdd: -0.1 } }; }).r;
  assert.equal(neg.ok, false);
});

// ---------- 真实 world ----------

test('真实 world：配方表有表头、没有行；估值规则表载入暂定值；有材料的真实物品（竹钓竿 1 kg 竹，竹 valueMult 1）估值 = 1 × 1 × 10 = 10；没配材料的物品估值未知带缺口 material，不回退、不当零', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const eng = { vocab: r.vocab, rules: r.rules, units: r.env.units, tables: r.tables };
  assert.equal(Object.keys(r.tables.get('recipe').doc.rows).length, 0);
  assert.deepEqual([r.rules.valuation.unitValue, r.rules.crafting.valueAdd, r.rules.valuation.scarcityHorizonDays], [10, 0.1, 30]);
  assert.equal(JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/item.json'), 'utf8')).dimensions.valueBase.modifiable, true);
  const v = valueBaseOf(eng, at(0), 'item_bamboo_fishing_rod');
  assert.deepEqual([v.known, v.value], [true, 10]);
  const none = valueBaseOf(eng, at(0), 'item_acid_moss_gel');
  assert.deepEqual([none.known, none.value, none.gaps], [false, undefined, ['material']]);
  const price = valuation(eng, at(0), 'item_bamboo_fishing_rod', {});
  assert.deepEqual([price.value.value, price.scarcityFactor.known], [10, false]);
});

test('配方表表头登记 §2.7 全部列；recipeView 读基值 Fact', () => {
  const eng = engine();
  const names = Object.keys(JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/recipe.json'), 'utf8')).dimensions).sort();
  assert.deepEqual(names, ['batchFactor', 'byproducts', 'failureRX', 'gradeFrom', 'gradeRef', 'inputs', 'learnFrom', 'laborHeads', 'minutes', 'outputs', 'qualityCurve', 'season', 'skill', 'skillMin', 'toolAbilities', 'toolWear', 'wasteFraction', 'workstation', 'yield', 'yieldCap'].sort());
  const v = recipeView(eng, at(0), 'recipe_test_nail_a');
  assert.deepEqual([v.dims.minutes.value, v.dims.skillMin.value, v.dims.yield.value, v.dims.wasteFraction.value], [50, 100, 1, 0.2]);
  assert.equal(fixedToNumber(fixedUnits(v.dims.yield.value)), 1);
});
