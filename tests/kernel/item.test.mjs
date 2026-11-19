// 块 6 第 6-2 张《物品表头与读入口》：item 表头与 itemView、materialView（卷三乙 §3.1 :420–:425、§4.1.1 聚合口径、§4.2 物品通用字段 I-1、I-5–I-9、
// §4.3.3 类别派生 C-1、C-6、C-8、§4.2.6 V3-4.2-I）与持有种类端类型解析（卷十八 §4.1.1 :457）。
// 测试先写：期望值按卷文公式手算成字面量（定点 4 位、截断），前提在 tests/kernel/item-world.mjs 的临时世界里造；真实 world/ 只有表头。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { baseFixture, loadItemWorld, engineOf, itemRow, share, ROOT } from './item-world.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { itemView, materialView, stockSlots, itemsInSlot } from '../../server-plugin/kernel/item.mjs';
import { checkHoldingKindRows } from '../../server-plugin/kernel/holdings.mjs';

const body = (m, s) => share('mgroup_body', m, s);
const IRON = 'mat_test_iron';
const TIN = 'mat_test_tin';
const WOOD = 'mat_test_wood';
const ICE = 'mat_test_ice';
const GAS = 'mat_test_gas';
const OIL = 'mat_test_oil';

// 一件铁斧：工作部铁六成、握持部木四成（卷三乙 §4.2.5 例 1 的组成），工具类。
const axe = (iron = 0.6, wood = 0.4, extra = {}) => itemRow(1.6, [share('mgroup_working', IRON, iron), share('mgroup_grip', WOOD, wood)], { classes: ['comp_tool'], ...extra });

const world = (edit) => { const f = baseFixture(); if (edit) edit(f); return loadItemWorld(f); };
const loaded = (edit) => { const r = world(edit); assert.ok(r.ok, JSON.stringify(r.messages)); return { r, eng: engineOf(r.world) }; };
const has = (r, code, id) => r.messages.some((m) => m.startsWith(code) && (id === undefined || m.includes(id))) || r.errors.some(([c, , row]) => c === code && (id === undefined || row === id));

// ---------- 真实 world/：只有表头 ----------

test('真实 world：item 表头载入、没有行；massKg、material 恒必填；表头没有旧价格字段 basePrice，也没有任何手填的派生维度', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, JSON.stringify(r.errors));
  const doc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/item.json'), 'utf8'));
  assert.deepEqual(doc.entity.idPrefix, ['item_']);
  assert.deepEqual(doc.rows, {});
  assert.equal(doc.dimensions.massKg.required, 'always');
  assert.equal(doc.dimensions.material.required, 'always');
  assert.equal(Object.hasOwn(doc.dimensions, 'basePrice'), false);
  // 卷三乙 §2.2：密度、体积、尺寸档、类别、可能物态集、基础价值都是派生，行上不得手写（表头声明 derived）。
  for (const k of ['density', 'volumeL', 'sizeClass', 'categoryKind', 'possibleMatterStates', 'valueBase']) assert.notEqual(doc.dimensions[k].derived, undefined, k);
});

test('真实 world：规则表首批值卷文没给的键登在 rules.items.unbuilt（不编数）；聚合口径表覆盖材料表全部数值、映射、结构维度（M-10）', () => {
  const r = loadWorld(ROOT);
  assert.deepEqual([...r.rules.items.unbuilt].sort(), ['categoryRules', 'classRules', 'materialClassMin', 'sizeClasses']);
  assert.equal(Object.hasOwn(r.rules.items, 'sizeClasses'), false);
  const matDims = r.tables.get('material').doc.dimensions;
  const have = new Set(r.rules.items.aggregation.map((s) => s.dimension));
  for (const [k, d] of Object.entries(matDims)) if (['number', 'integer', 'map', 'struct'].includes(d.type)) assert.ok(have.has(k), `aggregation row for ${k}`);
});

test('真实 world：他卷 byClass／always 必填列整类登记未建列（丙10）；未登记的必填列缺值照报（massKg 缺即 E-DIM-REQUIRED-MISSING）', () => {
  assert.ok(has(world((f) => { f.items.item_test_a = { ...itemRow(1, [body(IRON, 1)]) }; delete f.items.item_test_a.massKg; }), 'E-DIM-REQUIRED-MISSING'));
  const ok = world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { classes: ['comp_tool'] }); });
  assert.ok(ok.ok, JSON.stringify(ok.messages)); // comp_tool 要 abilities、wearPerUse：两列登记为未建列，行上缺值放行
});

// ---------- I-5：material 与 massKg ----------

test('I-5 share 之和必须恰为 1（定点四位）：0.5+0.4 拒；0.3333+0.3333+0.3334 过；空列表（和 0）拒', () => {
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 0.5), body(TIN, 0.4)]); }), 'E-DIM-INVARIANT-PORTION-SUM', 'item_test_a'));
  assert.ok(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 0.3333), body(TIN, 0.3333), body(WOOD, 0.3334)]); }).ok);
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, []); }), 'E-DIM-INVARIANT-PORTION-SUM', 'item_test_a'));
});

test('I-5 同一（组，材料）不重复；同组可有几种材料；引用的材料行必须存在', () => {
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 0.5), body(IRON, 0.5)]); }), 'E-DIM-DUPLICATE-KEY', 'item_test_a'));
  assert.ok(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 0.5), body(TIN, 0.5)]); }).ok);
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body('mat_no_such', 1)]); }), 'E-DIM-REF-MISSING'));
});

test('massKg 必填且大于 0（它在件数、货值密度、每千克折合量里作除数）：缺、0、负数、超上限都拒，正数过', () => {
  assert.ok(has(world((f) => { const r = itemRow(1, [body(IRON, 1)]); delete r.massKg; f.items.item_test_a = r; }), 'E-DIM-REQUIRED-MISSING'));
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(0, [body(IRON, 1)]); }), 'E-DIM-DOMAIN-RANGE', 'item_test_a'));
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(-1, [body(IRON, 1)]); }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(100001, [body(IRON, 1)]); }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(world((f) => { f.items.item_test_a = itemRow(0.0001, [body(IRON, 1)]); }).ok);
  assert.ok(has(world((f) => { const r = itemRow(1, []); delete r.material; f.items.item_test_a = r; }), 'E-DIM-REQUIRED-MISSING'));
});

// ---------- I-1、I-6：派生维度与 classes 不手写 ----------

test('I-1 密度、体积、尺寸档、类别手写即 E-DIM-DERIVED-WRITTEN（表头 derived，没有偏离通道）', () => {
  for (const [k, v] of [['density', 1], ['volumeL', 1], ['sizeClass', 'size_test_s'], ['categoryKind', 'category_test_tool'], ['possibleMatterStates', ['matter_solid']]]) {
    assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { [k]: v }); }), 'E-DIM-DERIVED-WRITTEN', 'item_test_a'), k);
  }
});

test('I-6 classes 里手写 class 族条目或材料派生组件都是 E-DIM-DERIVED-WRITTEN（对照表第 2 行）；手写物品表组件类可以', () => {
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { classes: ['class_metal'] }); }), 'E-DIM-DERIVED-WRITTEN', 'item_test_a'));
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { classes: ['comp_burnable'] }); }), 'E-DIM-DERIVED-WRITTEN', 'item_test_a'));
  assert.ok(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { classes: ['comp_crafted'] }); }).ok);
});

test('旧价格字段 basePrice 出现在物品行即加载失败（卷六 A6-21.1、卷三乙 M3b-27）：它不是表头维度，旧价不进任何规则输入', () => {
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(IRON, 1)], { basePrice: 5 }); }), 'E-DIM-STRUCT-FIELD', 'item_test_a'));
});

// ---------- I-1：密度、体积、尺寸档 ----------

test('I-1 密度按 hmean 聚合：铁（4）与锡（2）各半 = 1 ÷ (0.5÷4 + 0.5÷2) = 2.6666；体积 = 8 ÷ 2.6666 = 3.0000（定点截断）；体积 3 < 10 取小档', () => {
  const { eng } = loaded((f) => { f.items.item_test_mix = itemRow(8, [body(IRON, 0.5), body(TIN, 0.5)]); });
  const v = itemView(eng, {}, 'item_test_mix');
  assert.equal(v.dims.density.value, 2.6666);
  assert.equal(v.dims.volumeL.value, 3);
  assert.equal(v.dims.sizeClass.value, 'size_test_s');
  assert.equal(v.dims.density.unit, 'kg_per_L');
});

test('I-1 单一材料：密度就是该料的静态栏；体积恰在档界上取上档（铁 4，40 kg → 10 L，minVolumeL 10）', () => {
  const { eng } = loaded((f) => { f.items.item_test_ingot = itemRow(40, [body(IRON, 1)]); f.items.item_test_small = itemRow(8, [body(IRON, 1)]); });
  const big = itemView(eng, {}, 'item_test_ingot');
  assert.deepEqual([big.dims.density.value, big.dims.volumeL.value, big.dims.sizeClass.value], [4, 10, 'size_test_m']);
  assert.deepEqual([itemView(eng, {}, 'item_test_small').dims.volumeL.value, itemView(eng, {}, 'item_test_small').dims.sizeClass.value], [2, 'size_test_s']);
});

test('T-14 静态读法：冰水料域内可固可液，取 staticStateOrder 里最先的固，密度取固栏 0.9；体积 9 ÷ 0.9 = 10', () => {
  const { eng } = loaded((f) => { f.items.item_test_cube = itemRow(9, [body(ICE, 1)]); });
  const v = itemView(eng, {}, 'item_test_cube');
  assert.deepEqual(v.dims.possibleMatterStates.value, ['matter_solid', 'matter_liquid']);
  assert.deepEqual([v.dims.density.value, v.dims.volumeL.value], [0.9, 10]);
});

test('密度与体积不随温度：同一模板读两次（不同 state）逐位相同；任何行的密度、体积不手填（I-1）', () => {
  const { eng } = loaded((f) => { f.items.item_test_cube = itemRow(9, [body(ICE, 1)]); });
  assert.deepEqual(itemView(eng, {}, 'item_test_cube').dims.density, itemView(eng, { clock: { minute: 5 } }, 'item_test_cube').dims.density);
});

// ---------- T-13、I-8、I-9：可能物态集、聚集形态、分态栏 ----------

test('T-13 可能物态集：金属只有固；木只有分解点按固；冰水固与液；低温气只有气；只有液栏的料只有液', () => {
  const { eng } = loaded((f) => {
    f.items.item_a = itemRow(1, [body(IRON, 1)]);
    f.items.item_b = itemRow(1, [body(WOOD, 1)]);
    f.items.item_c = itemRow(1, [body(ICE, 1)]);
    f.items.item_d = itemRow(1, [body(GAS, 1)]);
    delete f.items.item_d.bulkForm;
    f.items.item_e = itemRow(1, [body(OIL, 1)]);
    delete f.items.item_e.bulkForm;
  });
  const states = (id) => itemView(eng, {}, id).dims.possibleMatterStates.value;
  assert.deepEqual(states('item_a'), ['matter_solid']);
  assert.deepEqual(states('item_b'), ['matter_solid']);
  assert.deepEqual(states('item_c'), ['matter_solid', 'matter_liquid']);
  assert.deepEqual(states('item_d'), ['matter_gas']);
  assert.deepEqual(states('item_e'), ['matter_liquid']);
});

test('I-8 可能物态集含固必填 bulkForm（没有缺省形态）；不含固而写了即报错', () => {
  assert.ok(has(world((f) => { const r = itemRow(1, [body(IRON, 1)]); delete r.bulkForm; f.items.item_test_a = r; }), 'E-DIM-REQUIRED-MISSING', 'item_test_a'));
  assert.ok(has(world((f) => { f.items.item_test_a = itemRow(1, [body(GAS, 1)]); }), 'E-DIM-STRUCT-FIELD', 'item_test_a'));
  assert.ok(world((f) => { const r = itemRow(1, [body(GAS, 1)]); delete r.bulkForm; f.items.item_test_a = r; }).ok);
});

test('I-9 每份材料的每个可能物态在 density 里的栏必须有值：低温气料只有固栏即报错', () => {
  const r = world((f) => {
    f.materials.mat_test_gas2 = { ...f.materials[GAS], density: { solid: 1 } };
    const row = itemRow(1, [body('mat_test_gas2', 1)]);
    delete row.bulkForm;
    f.items.item_test_a = row;
  });
  assert.ok(has(r, 'E-DIM-REQUIRED-MISSING', 'item_test_a'));
  assert.equal(has(world((f) => { const row = itemRow(1, [body(GAS, 1)]); delete row.bulkForm; f.items.item_test_a = row; }), 'E-DIM-REQUIRED-MISSING'), false);
});

test('环境温度域没给（rules.climate.unbuilt）时可能物态集与分态量按未知带出，不抛错、不编数；形态必填不判', () => {
  const { eng } = loaded((f) => { f.envTempDomain = null; const r = itemRow(1, [body(IRON, 1)]); delete r.bulkForm; f.items.item_test_a = r; });
  const v = itemView(eng, {}, 'item_test_a');
  assert.deepEqual([v.dims.possibleMatterStates.known, v.dims.density.known, v.dims.volumeL.known, v.dims.sizeClass.known], [false, false, false, false]);
  assert.equal(v.dims.possibleMatterStates.reason, 'envTempDomain');
});

test('尺寸档规则表没给（rules.items.unbuilt）时 sizeClass 按未知带出，体积照算', () => {
  const { eng } = loaded((f) => { f.rulesItems.sizeClasses = null; f.items.item_test_a = itemRow(8, [body(IRON, 1)]); });
  const v = itemView(eng, {}, 'item_test_a');
  assert.deepEqual([v.dims.volumeL.value, v.dims.sizeClass.known, v.dims.sizeClass.reason], [2, false, 'rules.items.sizeClasses']);
});

// ---------- C-1、C-8、C-6：类别派生与库存槽 ----------

test('C-8 ① 材料类别随材料份额变：铁六木四 = 金属类；改成铁四木六 = 木质类；各占五成都入（≥ materialClassMin）；不改任何 .mjs', () => {
  const view = (iron, wood) => { const { eng } = loaded((f) => { f.items.item_test_axe = axe(iron, wood); }); return itemView(eng, {}, 'item_test_axe'); };
  assert.deepEqual(view(0.6, 0.4).classes, ['class_metal', 'comp_tool']);
  assert.deepEqual(view(0.4, 0.6).classes, ['class_wood', 'comp_tool']);
  assert.deepEqual(view(0.5, 0.5).classes, ['class_metal', 'class_wood', 'comp_tool']);
});

test('C-8 ② classRules 命中的类别也是派生：挂容器类且盛液 = 容器类 class_vessel；不盛液则不入', () => {
  const jug = (holds) => itemRow(2, [body(WOOD, 1)], { classes: ['comp_container'], volumeCapacity: 5, maxLoadKg: 3, sealed: false, holdsLiquid: holds });
  const a = loaded((f) => { f.items.item_test_jug = jug(true); });
  assert.deepEqual(itemView(a.eng, {}, 'item_test_jug').classes, ['class_vessel', 'class_wood', 'comp_container']);
  const b = loaded((f) => { f.items.item_test_jug = jug(false); });
  assert.deepEqual(itemView(b.eng, {}, 'item_test_jug').classes, ['class_wood', 'comp_container']);
});

test('C-1 categoryKind = first(rules.items.categoryRules)：工具类入工具槽，容器类入容器槽，余者落兜底条；派生不命中即加载失败', () => {
  const { eng } = loaded((f) => {
    f.items.item_test_axe = axe();
    f.items.item_test_jug = itemRow(2, [body(WOOD, 1)], { classes: ['comp_container'], volumeCapacity: 5, maxLoadKg: 3, sealed: false, holdsLiquid: true });
    f.items.item_test_lump = itemRow(1, [body(IRON, 1)]);
  });
  assert.equal(itemView(eng, {}, 'item_test_axe').categoryKind, 'category_test_tool');
  assert.equal(itemView(eng, {}, 'item_test_jug').categoryKind, 'category_test_pack');
  assert.equal(itemView(eng, {}, 'item_test_lump').categoryKind, 'category_test_other');
  assert.equal(itemView(eng, {}, 'item_test_axe').dims.categoryKind.value, 'category_test_tool');
  const r = world((f) => {
    f.rulesItems.categoryRules = [{ when: 'member(comp_tool, item.classes)', value: 'category_test_tool' }];
    f.items.item_test_lump = itemRow(1, [body(IRON, 1)]);
  });
  assert.ok(has(r, 'E-DIM-REQUIRED-MISSING', 'item_test_lump'));
});

test('C-1、C-8 when 不得恒真、不得读 class 族条目；编不过的条件即加载失败', () => {
  const bad = (when) => world((f) => { f.rulesItems.categoryRules = [{ when, value: 'category_test_other' }]; });
  assert.ok(has(bad('1 == 1'), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(bad('massKg > 0 && member(class_metal, item.classes)'), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(bad('density > 0'), 'E-MOD-RX')); // 派生量不在类别规则的变量域
});

test('C-6 库存槽按 categoryKind 开：stockSlot 为真的类别各一槽；加一件物品自动入槽，加一个类别条目自动多一槽，都不改 .mjs', () => {
  const before = loaded((f) => { f.items.item_test_axe = axe(); });
  assert.deepEqual(stockSlots(before.eng), ['category_test_pack', 'category_test_tool']);
  assert.deepEqual(itemsInSlot(before.eng, {}, 'category_test_tool'), ['item_test_axe']);
  assert.equal(itemView(before.eng, {}, 'item_test_axe').stockSlot, 'category_test_tool');
  const after = loaded((f) => { f.items.item_test_axe = axe(); f.items.item_test_adze = axe(0.7, 0.3); f.vocab.category.category_test_new = { stockSlot: true }; });
  assert.deepEqual(itemsInSlot(after.eng, {}, 'category_test_tool'), ['item_test_adze', 'item_test_axe']);
  assert.deepEqual(stockSlots(after.eng), ['category_test_new', 'category_test_pack', 'category_test_tool']);
  // 兜底类别条目 stockSlot 为假：不开槽，物品 stockSlot 为空。
  const lump = loaded((f) => { f.items.item_test_lump = itemRow(1, [body(IRON, 1)]); });
  assert.equal(itemView(lump.eng, {}, 'item_test_lump').stockSlot, null);
});

// ---------- 读入口 ----------

test('itemView：dims 给表头每个维度的 Fact；写了的值原样、派生登记未建的按未知带码；实例与批次 id 不静默当模板读', () => {
  const { eng } = loaded((f) => { f.items.item_test_axe = axe(1, 0, {}); f.items.item_test_axe.material = [share('mgroup_working', IRON, 1)]; });
  const v = itemView(eng, {}, 'item_test_axe');
  assert.deepEqual(Object.keys(v.dims).sort(), Object.keys(eng.tables.get('item').doc.dimensions).sort());
  assert.deepEqual([v.dims.massKg.known, v.dims.massKg.value, v.dims.massKg.unit], [true, 1.6, 'kg']);
  assert.deepEqual(v.dims.valueBase, { known: false, applicable: true, reason: 'E-MOD-RX' });
  assert.deepEqual(v.dims.shelfLifeDays, { known: false, applicable: true, reason: 'E-MOD-RX' });
  // 不适用：byClass 条件不满足（这件不是容器）。
  assert.deepEqual(v.dims.volumeCapacity, { known: false, applicable: false });
  // 卷二 §2.2 :466：不是物品表实体的 id（未登记、材料、实例引用）返回 null；带 options 照常。
  assert.equal(itemView(eng, {}, 'item_not_registered'), null);
  assert.equal(itemView(eng, {}, IRON), null);
  assert.equal(itemView(eng, {}, 'item_test_axe', { clock: { minute: 0 } }).id, 'item_test_axe');
});

test('materialView(材料 id)：手填维度原样、带单位；派生登记未建的（hardness）按未知带码；不适用交 applicable:false；不自套修正表', () => {
  const { eng } = loaded();
  const m = materialView(eng, {}, IRON);
  assert.equal(m.kind, 'material');
  assert.deepEqual(m.dims.density.value, { solid: 4 });
  assert.equal(m.dims.valueMult.value, 3);
  assert.deepEqual(m.dims.hardness, { known: false, applicable: true, reason: 'E-MOD-RX' });
  assert.deepEqual(m.dims.categories.value, []);
  assert.deepEqual(m.dims.hydration, { known: false, applicable: false }); // 不挂可饮组件类
  assert.equal(m.dims.valueMult.base, undefined); // 无修正项时就是基值 Fact，没有 base 字段（修正前后同值）
  assert.deepEqual(Object.keys(m.dims).sort(), Object.keys(eng.tables.get('material').doc.dimensions).sort());
});

test('materialView(物品模板)：按 rules.items.aggregation 聚合——sum 不归一、承担组、固相量、dominant 取主料；带 known、applicable、partial', () => {
  const { eng } = loaded((f) => { f.items.item_test_axe = axe(); });
  const m = materialView(eng, {}, 'item_test_axe').dims;
  assert.equal(m.valueMult.value, 2.2); // sum：0.6×3 + 0.4×1
  assert.deepEqual([m.density.value, m.density.partial], [1.8181, false]); // hmean：1 ÷ (0.6÷4 + 0.4÷1)
  assert.deepEqual([m.sharpnessMax.value, m.sharpnessMax.partial], [40, false]); // 承担组只有工作部（铁），固相量
  assert.equal(m.meltPoint.value, 1500); // dominant：结构组份额最大的一份（铁）
  assert.deepEqual([m.luminousOutput.known, m.luminousOutput.applicable], [false, false]); // 没有一份有这一维：不适用
  assert.equal(m.corrosionRate.value, 0.001); // mean 全部组：只有铁有腐蚀率，木料不适用（没有该必填条件）
  assert.equal(Object.hasOwn(m, 'salvageFraction'), false); // 口径 none：物品层不聚合
  const v = itemView(eng, {}, 'item_test_axe');
  assert.equal(v.dims.density.value, 1.8181);
  assert.equal(v.dims.volumeL.value, 0.88); // 1.6 ÷ 1.8181 截断到 4 位
});

test('M-1 三种状态：未知按 onUnknown 处置——gap 的维度不计入这一份、结果带 partial；承担组没有该组时退回全部组', () => {
  const { eng } = loaded((f) => { f.items.item_test_mix = itemRow(2, [body(IRON, 0.5), body(WOOD, 0.5)]); });
  const m = materialView(eng, {}, 'item_test_mix').dims;
  // 承担组 mgroup_working 一份也没有：退回全部组；木料没有 sharpnessMax（gap）：不计入、记 partial，铁的 40 独自作均值。
  assert.deepEqual([m.sharpnessMax.value, m.sharpnessMax.partial], [40, true]);
  const only = loaded((f) => { f.items.item_test_stick = itemRow(1, [body(WOOD, 1)]); });
  const s = materialView(only.eng, {}, 'item_test_stick').dims.sharpnessMax;
  assert.deepEqual([s.known, s.applicable, s.partial], [false, true, true]);
  // onUnknown 为 error 的维度：点名读它即抛（M-1 第 ② 种），列全部口径时按未知带码交出，不拖垮别的维度。
  assert.throws(() => materialView(only.eng, {}, 'item_test_stick', { dimensions: ['breathabilityBase'] }), (e) => e.code === 'E-DIM-REQUIRED-MISSING');
  assert.deepEqual(materialView(only.eng, {}, 'item_test_stick').dims.breathabilityBase, { known: false, applicable: true, reason: 'E-DIM-REQUIRED-MISSING' });
});

test('M-10 聚合口径表缺任一材料数值维度的行即加载失败；多余的行（非材料维度）与重复行也拒', () => {
  const r = world((f) => { f.editRulesItems = (rows) => { const a = rows.find((x) => x.key === 'aggregation'); a.value = a.value.filter((s) => s.dimension !== 'meltPoint'); }; });
  assert.ok(has(r, 'E-DIM-REQUIRED-MISSING', 'meltPoint'));
  assert.ok(has(world((f) => { f.editRulesItems = (rows) => { rows.find((x) => x.key === 'aggregation').value.push({ dimension: 'noSuchDim', mode: 'mean' }); }; }), 'E-DIM-REF-MISSING', 'noSuchDim'));
  assert.ok(has(world((f) => { f.editRulesItems = (rows) => { rows.find((x) => x.key === 'aggregation').value.push({ dimension: 'moisture', mode: 'mean' }); }; }), 'E-DIM-DUPLICATE-KEY', 'moisture'));
});

// ---------- K6-29：持有种类端类型解析 ----------

test('K6-29 持有种类行的端类型：先按实体模板名、再按实体表名（item 表建成后 item 可解析）；两边都解析不到即 E-HK-END-TYPE', () => {
  const { eng } = loaded();
  const kind = [...eng.vocab.index].find(([, rec]) => rec.family === 'holding_kind');
  const code = kind[0];
  const check = (from) => checkHoldingKindRows({ vocab: { index: new Map([[code, { family: 'holding_kind', entry: { ...kind[1].entry, from }, prefix: 'hk_' }]]) }, rules: eng.rules, tables: eng.tables }).errors;
  assert.deepEqual(check(['agent']).filter((e) => e.startsWith('E-HK-END-TYPE')), []); // 实体模板名
  assert.deepEqual(check(['item']).filter((e) => e.startsWith('E-HK-END-TYPE')), []); // 实体表名（块 6 第 6-2 张起）
  assert.equal(check(['no_such_table']).some((e) => e.startsWith('E-HK-END-TYPE')), true);
  // 不带 tables 的引擎（只收模板名）：实体表名不解析。
  const bare = checkHoldingKindRows({ vocab: { index: new Map([[code, { family: 'holding_kind', entry: { ...kind[1].entry, from: ['item'] } }]]) }, rules: eng.rules }).errors;
  assert.equal(bare.some((e) => e.startsWith('E-HK-END-TYPE')), true);
});
