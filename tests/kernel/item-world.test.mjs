// 块 6 第 6-22 张《物品行内容转换》：真实世界的 item 表（world/ontology/dimensions/item.json 的 rows）与 rules.items 首批值、goods 资源种类。
// 卷三乙《物态类别与物品》§7 M3b-9 :2046、M3b-10 :2047、M3b-24 :2063、M3b-27 :2066、M3b-28 :2067 与 :2072 起"旧用途标签对照表"；
// §4.3.3 C-1、C-8、§4.2.3 I-5；卷六《经济》§2.1 :112–:122 资源种类表、§4.22.1 :1238–:1247 来源去处、§4.21 规则 9（旧价只作标定参考）；
// docs/迁移体检/块6.md 第四节 6-22 段（旧数据有的值照转，没有的列登记未建，不编数字）。
// 数量与期望一律从旧数据（world/meta/items.json、item-size-classes.json）当场算出；用途标签到能力代号的对照取卷三乙 :2074 起的表（字面量）。
// 类别规则表的条件，在 tests/kernel/item-world.mjs 的临时世界里加测试材料后逐条核（真实世界的物品行没有 material，规则表读不到材料量，见回报）。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { itemView } from '../../server-plugin/kernel/item.mjs';
import { spawnSync } from 'node:child_process';
import { convertItems } from '../../tools/convert-items.mjs';
import { candidates } from '../../tools/material-candidates.mjs';
import { baseFixture, loadItemWorld, engineOf, itemRow, share, ROOT } from './item-world.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
useReportSink(() => {});
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OLD = readJson('world/meta/items.json');
const OLD_USE = readJson('world/meta/item-use-tags.json');
const OLD_SIZES = readJson('world/meta/item-size-classes.json');
const W = loadWorld(ROOT);
const ITEM = W.tables.get('item').doc;
const ROWS = ITEM.rows;
const VOCAB = readJson('world/ontology/dimensions/_vocab.json').families;
const LABELS = readJson('world/i18n/labels.zh.json');
const UNBUILT = readJson('world/ontology/dimensions/_unbuilt-derived.json');
const RULES = Object.fromEntries(readJson('world/rules/tables/items.json').rows.map((r) => [r.key, r.value]));
const RESOURCES = readJson('world/rules/tables/economy/resources.json').rows;
const tagsOf = (it) => it.tags ?? [];

// 卷三乙 :2074 起的旧用途标签对照表（字面量）：旧标签 → 能力代号。
const ABILITY_OF = { soil_work: 'ability_dig', harvest: 'ability_reap', grip: 'ability_grip', probe: 'ability_probe', pry: 'ability_pry', cut: 'ability_cut', pierce: 'ability_drill', unlock: 'ability_pick_lock' };
const abilityTags = (it) => tagsOf(it).filter((t) => Object.hasOwn(ABILITY_OF, t));

test('真实世界：加载零错误（物品行过表头类型、必填、引用闭合，rules.items 值过类别规则编译，goods 资源行过资源种类表校验）', () => {
  assert.equal(W.ok, true, W.text);
});

test('规模与内容：行数与代号集合 = 旧物品；显示名在 labels、与旧名一致；massKg = 旧 weight 且大于 0', () => {
  assert.ok(OLD.length > 0);
  assert.deepEqual(Object.keys(ROWS).sort(), OLD.map((it) => it.id).sort());
  for (const it of OLD) {
    assert.equal(LABELS[it.id].label, it.name, it.id);
    assert.equal(ROWS[it.id].massKg, it.weight, it.id);
    assert.ok(ROWS[it.id].massKg > 0, it.id);
  }
});

test('旧价与派生量：行上没有 basePrice、valueBase（M3b-27：旧价不进 valueBase）；旧价留在旧文件交 6-9 标定', () => {
  assert.equal(Object.hasOwn(ITEM.dimensions, 'basePrice'), false);
  for (const [id, row] of Object.entries(ROWS)) {
    for (const k of ['basePrice', 'valueBase', 'unit', 'categoryKind', 'density', 'volumeL', 'sizeClass', 'shelfLifeDays']) assert.equal(Object.hasOwn(row, k), false, `${id}.${k}`);
  }
  assert.equal(OLD.filter((it) => typeof it.basePrice === 'number').length, OLD.length);
});

test('旧 unit 并入 massKg（M3b-24）：有 unit 的物品行质量就是旧 weight，basis 记了旧 unit', () => {
  const withUnit = OLD.filter((it) => it.unit !== undefined);
  assert.ok(withUnit.length > 0);
  for (const it of withUnit) {
    assert.equal(ROWS[it.id].massKg, it.weight, it.id);
    assert.ok(ROWS[it.id].basis.includes(`旧 unit「${it.unit}」`), it.id);
  }
});

test('组件类：由旧标签与旧字段对到物品表组件类；行上没有 class 族条目与材料派生组件（I-6）', () => {
  const comps = new Set(Object.entries(W.vocab.families.get('component').entries).filter(([, e]) => e.table === 'item').map(([k]) => k));
  for (const it of OLD) {
    const want = new Set();
    const tags = tagsOf(it);
    if (tags.includes('tool') || abilityTags(it).length) want.add('comp_tool');
    if (tags.includes('weapon') || it.combat !== undefined) want.add('comp_weapon');
    if (tags.includes('clothing')) want.add('comp_wearable');
    if (tags.includes('container') || tags.includes('liquid_container') || it.capacityMl !== undefined) want.add('comp_container');
    if (tags.includes('book') || it.book !== undefined) want.add('comp_readable');
    if (tags.includes('work')) want.add('comp_work');
    assert.deepEqual(ROWS[it.id].classes, [...want].sort(), it.id);
    for (const c of ROWS[it.id].classes) assert.ok(comps.has(c), `${it.id} ${c}`);
  }
});

test('abilities（M3b-28）：有旧用途标签的工具按对照表迁成 1 级、其余键写 null；用途标签里不是工具能力的 drinkable、liquid_container 不写；没有用途标签的工具登未建列', () => {
  const family = Object.keys(VOCAB.ability.entries).sort();
  assert.deepEqual(family, Object.values(ABILITY_OF).sort());
  const tools = OLD.filter((it) => ROWS[it.id].classes.includes('comp_tool'));
  assert.ok(tools.length > 0);
  for (const it of OLD) {
    const row = ROWS[it.id];
    const tags = abilityTags(it);
    if (!row.classes.includes('comp_tool')) { assert.equal(Object.hasOwn(row, 'abilities'), false, it.id); continue; }
    if (tags.length === 0) { assert.equal(Object.hasOwn(row, 'abilities'), false, it.id); continue; }
    assert.deepEqual(Object.keys(row.abilities).sort(), family, it.id);
    for (const a of family) assert.equal(row.abilities[a], tags.some((t) => ABILITY_OF[t] === a) ? 1 : null, `${it.id} ${a}`);
  }
  // 必填满足或登未建：有工具行没有 abilities，该列就必须在未建列登记里（否则加载已报 E-DIM-REQUIRED-MISSING，上一条已核）。
  const missing = tools.filter((it) => !Object.hasOwn(ROWS[it.id], 'abilities'));
  assert.equal(missing.length > 0, UNBUILT.columns.some((c) => c.table === 'item' && c.dimension === 'abilities'));
  assert.equal(Object.hasOwn(VOCAB, 'ability_drinkable'), false);
});

test('容器与可读物：capacityMl 毫升折升照转；liquid_container 标签迁 holdsLiquid；书的 readingMinutes 迁 readMinutes；旧数据没有的列登未建', () => {
  for (const it of OLD) {
    const row = ROWS[it.id];
    if (!row.classes.includes('comp_container')) { for (const k of ['holdsLiquid', 'volumeCapacity']) assert.equal(Object.hasOwn(row, k), false, `${it.id}.${k}`); }
    else {
      assert.equal(row.holdsLiquid, tagsOf(it).includes('liquid_container') ? true : undefined, it.id);
      assert.equal(row.volumeCapacity, it.capacityMl === undefined ? undefined : it.capacityMl / 1000, it.id);
    }
    assert.equal(row.readMinutes, it.book?.readingMinutes, it.id);
  }
  for (const k of ['holdsLiquid', 'maxLoadKg', 'sealed', 'volumeCapacity', 'material']) assert.ok(UNBUILT.columns.some((c) => c.table === 'item' && c.dimension === k), k);
});

test('wearPerUse（李白 21:0x ④）：旧 durability 是可用次数（每次用掉 1），工具、武器、衣物、容器的 wearPerUse = 1 ÷ 旧 durability（四位）；其余物品不写', () => {
  for (const it of OLD) {
    const durable = ROWS[it.id].classes.some((c) => ['comp_tool', 'comp_weapon', 'comp_wearable', 'comp_container'].includes(c));
    assert.equal(ROWS[it.id].wearPerUse, durable ? Number((1 / it.durability).toFixed(4)) : undefined, it.id);
    if (durable) assert.ok(ROWS[it.id].wearPerUse > 0 && ROWS[it.id].wearPerUse <= 1, it.id);
  }
});

test('material：旧数据没有材料字段，行上不写；凡写了的行份额和为 1（I-5）；未写的列登未建、不借别的值顶', () => {
  for (const [id, row] of Object.entries(ROWS)) {
    if (row.material === undefined) continue;
    assert.equal(Number(row.material.reduce((s, m) => s + m.share, 0).toFixed(4)), 1, id);
  }
  if (Object.values(ROWS).some((r) => r.material === undefined)) assert.ok(UNBUILT.columns.some((c) => c.table === 'item' && c.dimension === 'material'));
});

test('origin 照转旧 origin（引用地点表、闭合由加载校验核）；没有 origin 的旧物品不写', () => {
  for (const it of OLD) assert.equal(ROWS[it.id].origin, typeof it.origin === 'string' ? it.origin : undefined, it.id);
});

test('重跑转换得到入库的行（可重跑、--check 只比对）；旧 cut 标签物品逐件列清单交人裁定锯、凿（旧数据无结构化标注，转换不读名称文字）', () => {
  const out = convertItems(OLD, OLD_USE);
  assert.deepEqual(out.rows, ROWS);
  assert.equal(out.report.cutNames.length, OLD.filter((it) => tagsOf(it).includes('cut')).length);
});

test('rules.items 首批值：sizeClasses 由旧 item-size-classes.json 折成 minVolumeL（旧每档上界就是下一档的下界）；materialClassMin 在 (0,1]；四个键不再登未建', () => {
  const classes = OLD_SIZES.classes;
  assert.equal(RULES.sizeClasses.length, classes.length);
  classes.forEach((c, i) => {
    assert.equal(RULES.sizeClasses[i].minVolumeL, i === 0 ? 0 : classes[i - 1].maxVolumeL, c.name);
    assert.equal(LABELS[RULES.sizeClasses[i].size].label, c.name);
  });
  assert.ok(RULES.materialClassMin > 0 && RULES.materialClassMin <= 1);
  for (const k of ['categoryRules', 'classRules', 'materialClassMin', 'sizeClasses']) assert.equal(RULES.unbuilt.includes(k), false, k);
  assert.deepEqual([...RULES.unbuilt].sort(), ['instanceLotPointer', 'wearPerUseResolution']);
  for (const e of Object.values(VOCAB.category.entries)) assert.equal(typeof e.stockSlot, 'boolean');
});

test('材料候选（李白 21:0x ①(a)）：候选只落在材料表已有行里；候选与对不上合计 = 旧物品数；清单文件与脚本重跑一致；item 行本阶段不写 material', () => {
  const mats = new Set(Object.keys(readJson('world/ontology/dimensions/material.json').rows));
  const out = candidates(OLD, [...mats]);
  assert.equal(out.length, OLD.length);
  for (const r of out) {
    if (r.status === '候选') assert.ok(mats.has(r.material), `${r.id} ${r.material}`);
    else assert.ok(r.status === '无' || r.status === '冲突');
  }
  assert.ok(out.some((r) => r.status === '候选') && out.some((r) => r.status === '无'));
  assert.equal(spawnSync(process.execPath, [join(ROOT, 'tools/material-candidates.mjs'), '--check']).status, 0);
  assert.ok(Object.values(ROWS).every((r) => r.material === undefined));
});

// ---------- 规则表条件在临时世界里逐条核（真实规则值 + 测试材料行） ----------

const body = (m, s = 1) => share('mgroup_body', m, s);
const WOOD = 'mat_test_wood';
function realRulesWorld(items) {
  const f = baseFixture();
  f.vocab = { class: {}, category: VOCAB.category.entries, size: VOCAB.size.entries }; // 夹具清空这两族，这里换上真实条目
  f.rulesItems = { categoryRules: RULES.categoryRules, classRules: RULES.classRules, materialClassMin: RULES.materialClassMin, sizeClasses: RULES.sizeClasses };
  Object.assign(f.items, items);
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages));
  return engineOf(r.world);
}

test('categoryRules 真实值（C-1）：武器、服装、文书、容器、工具各派生各的类别；身兼容器与工具的按容器；class_vessel 只给盛液容器（C-8）', () => {
  const eng = realRulesWorld({
    item_t_weapon: itemRow(1, [body(WOOD)], { classes: ['comp_weapon'] }),
    item_t_wear: itemRow(1, [body(WOOD)], { classes: ['comp_wearable'] }),
    item_t_book: itemRow(1, [body(WOOD)], { classes: ['comp_readable'] }),
    item_t_work: itemRow(1, [body(WOOD)], { classes: ['comp_work'] }),
    item_t_tool: itemRow(1, [body(WOOD)], { classes: ['comp_tool'] }),
    item_t_jug: itemRow(1, [body(WOOD)], { classes: ['comp_container'], volumeCapacity: 5, maxLoadKg: 3, sealed: false, holdsLiquid: true }),
    item_t_sack: itemRow(1, [body(WOOD)], { classes: ['comp_container'], volumeCapacity: 5, maxLoadKg: 3, sealed: false, holdsLiquid: false }),
    item_t_pot: itemRow(1, [body(WOOD)], { classes: ['comp_container', 'comp_tool'], volumeCapacity: 5, maxLoadKg: 3, sealed: false, holdsLiquid: true }),
  });
  const cat = (id) => itemView(eng, {}, id).categoryKind;
  assert.deepEqual(['item_t_weapon', 'item_t_wear', 'item_t_book', 'item_t_work', 'item_t_tool', 'item_t_jug', 'item_t_sack', 'item_t_pot'].map(cat),
    ['category_weapon', 'category_apparel', 'category_document', 'category_document', 'category_tool', 'category_container', 'category_container', 'category_container']);
  assert.ok(itemView(eng, {}, 'item_t_jug').classes.includes('class_vessel'));
  assert.ok(itemView(eng, {}, 'item_t_pot').classes.includes('class_vessel'));
  assert.equal(itemView(eng, {}, 'item_t_sack').classes.includes('class_vessel'), false);
});

test('sizeClasses 真实值：边界取下一档（旧规则"第一个 maxVolumeL 大于体积的档"）；密度 1 的测试料，体积 = 质量', () => {
  const masses = { item_t_a: 0.04, item_t_b: 0.05, item_t_c: 0.49, item_t_d: 0.5, item_t_e: 4.99, item_t_f: 5, item_t_g: 49.99, item_t_h: 50, item_t_i: 900 };
  const eng = realRulesWorld(Object.fromEntries(Object.entries(masses).map(([id, m]) => [id, itemRow(m, [body(WOOD)], { classes: ['comp_tool'] })])));
  assert.deepEqual(Object.keys(masses).map((id) => itemView(eng, {}, id).dims.sizeClass.value),
    ['size_tiny', 'size_small', 'size_small', 'size_medium', 'size_medium', 'size_large', 'size_large', 'size_huge', 'size_huge']);
});

// ---------- goods 资源种类 ----------

test('goods 资源种类：每件物品一个 res_ 条目指回它（item 字段，6-3 暂定口径）与一行 resfam_goods 规则行；来源去处的 families 由行反推', () => {
  const entries = VOCAB.resource.entries;
  const goodsRows = RESOURCES.filter((r) => r.value.family === 'resfam_goods');
  assert.equal(goodsRows.length, OLD.length);
  assert.deepEqual(Object.values(entries).filter((e) => e.item !== undefined).map((e) => e.item).sort(), OLD.map((it) => it.id).sort());
  for (const r of goodsRows) {
    assert.ok(entries[r.key].item !== undefined, r.key);
    assert.equal(r.value.transferable, 'tr_free');
    assert.equal(r.value.issuerBacked, false);
    assert.equal(r.value.unitOfAccount, false);
    for (const s of r.value.sources) assert.ok(VOCAB.src.entries[s].families.includes('resfam_goods'), s);
    for (const s of r.value.sinks) assert.ok(VOCAB.sink.entries[s].families.includes('resfam_goods'), s);
  }
  // 物品行上别义的 count 不能同时是资源数量单位（S6-14：一个单位代号只许一个意思）
  assert.notEqual(goodsRows[0].value.unit, 'count');
  assert.equal(RULES.unbuilt.includes('resourceItemRef'), false, '物品→资源种类指向 item 字段已由李白 20:3x ⑤ 认可');
});
