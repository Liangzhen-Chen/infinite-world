// 块 6 第 6-22 张第三阶段（李白 11-19 22:0x）：真实世界物品行配上材料后的读数与哪些物品写了／没写 material。
// 卷三乙《物态类别与物品》§4.2.1 I-1（密度 = 材料按份额聚合、体积 = 质量 ÷ 密度）、I-5（份额和为 1）、I-7（成形固体结构组需承力四项）、I-8（bulkForm）、
// C-1／C-8（类别由材料与功能派生）、§4.10 D-1（用损 = wearPerUse ÷ wearResistance）、§4.12 P-1（腐坏锚点式）；
// 期望值按卷文公式手算成字面量：材料取值抄自材料表行（密度 mat_wheat 1.3、mat_paper 0.8、mat_linen_cloth 1.5 kg/L；耐磨 mat_linen_cloth 14、mat_bamboo 22；腐坏率 mat_wheat 0.101 /日）。
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
import { convertItems, materialContext, HELD_MATERIAL } from '../../tools/convert-items.mjs';
import { candidates } from '../../tools/material-candidates.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post } from '../../server-plugin/kernel/ledger.mjs';
import { rotStep } from '../../server-plugin/kernel/item-state.mjs';
import { baseFixture, loadItemWorld, engineOf, ROOT } from './item-world.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
useReportSink(() => {});
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OLD = readJson('world/meta/items.json');
const OLD_USE = readJson('world/meta/item-use-tags.json');
const W = loadWorld(ROOT);
assert.equal(W.ok, true, W.text);
const ROWS = W.tables.get('item').doc.rows;
const MATS = readJson('world/ontology/dimensions/material.json').rows;
const ENG = engineOf(W);
const view = (id) => itemView(ENG, {}, id);

test('写入：每件写了 material 的物品都是候选清单里的候选、单组主体份额 1、材料行真实存在；bulkForm 同时写；没写的有明确原因（暂缺清单 = 候选里没写的）', () => {
  const cand = new Map(candidates(OLD, Object.keys(MATS)).filter((r) => r.status === '候选').map((r) => [r.id, r.material]));
  const out = convertItems(OLD, OLD_USE, materialContext(OLD));
  const written = Object.entries(ROWS).filter(([, r]) => r.material !== undefined).map(([id]) => id);
  assert.ok(written.length > 0);
  assert.deepEqual([...written].sort(), [...out.report.materialWritten].sort());
  for (const id of written) {
    assert.deepEqual(ROWS[id].material, [{ group: 'mgroup_body', materialRef: cand.get(id), share: 1 }], id);
    assert.ok(Object.hasOwn(MATS, ROWS[id].material[0].materialRef), id);
    assert.equal(typeof ROWS[id].bulkForm, 'string', id);
  }
  // 候选里没写的 = 暂缺清单；每一条都有原因，原因要么是材料缺值（HELD_MATERIAL），要么是类别规则读不出类别。
  assert.deepEqual([...cand.keys()].filter((id) => !written.includes(id)).sort(), out.report.heldMaterial.map((h) => h.id).sort());
  for (const h of out.report.heldMaterial) assert.ok(h.reason.length > 10 && (Object.hasOwn(HELD_MATERIAL, h.material) || h.reason.includes('类别')), h.id);
  assert.ok(out.report.heldMaterial.some((h) => h.material === 'mat_stoneware'), '陶器缺 wearResistance 被挡');
});

test('读数（I-1）：净麦粒 0.5 kg、麦密度 1.3 → 体积 0.5÷1.3；燕麦粉 0.4 kg 同密度 → 0.4÷1.3；麻布粮袋 0.32 kg、麻布 1.5 → 0.32÷1.5；工序册 0.12 kg、纸 0.8 → 0.15', () => {
  const cases = [['item_wheat_grain', 0.5 / 1.3], ['item_oat_flour', 0.4 / 1.3], ['item_grain_sack', 0.32 / 1.5], ['item_book_mill_oats', 0.12 / 0.8]];
  for (const [id, volume] of cases) {
    const v = view(id);
    assert.equal(v.dims.density.known, true, id);
    assert.ok(Math.abs(v.dims.volumeL.value - volume) < 1e-3, `${id} ${v.dims.volumeL.value} vs ${volume}`);
    assert.equal(v.dims.sizeClass.value, 'size_small', id); // 0.05 ≤ 体积 < 0.5
  }
  assert.equal(view('item_wheat_grain').dims.density.value, 1.3);
  assert.equal(view('item_book_mill_oats').dims.density.value, 0.8);
});

test('类别（C-1、C-8）：粮食读材料可食量派生 category_food、材料类别 class_grain；书按文书；粮袋按容器；竹鱼竿按工具；粉与粒只在形态上不同', () => {
  for (const id of ['item_wheat_grain', 'item_oats', 'item_pearl_barley', 'item_rye_flour', 'item_oat_flour']) {
    const v = view(id);
    assert.equal(v.categoryKind, 'category_food', id);
    assert.ok(v.classes.includes('class_grain'), `${id} ${JSON.stringify(v.classes)}`); // 材料类别：麦类本源成分过半（materialClassMin 0.5）
  }
  assert.equal(view('item_book_mill_oats').categoryKind, 'category_document');
  assert.equal(view('item_grain_sack').categoryKind, 'category_container');
  assert.equal(view('item_bamboo_fishing_rod').categoryKind, 'category_tool');
  assert.deepEqual([ROWS.item_oat_flour.bulkForm, ROWS.item_oats.bulkForm, ROWS.item_book_mill_oats.bulkForm], ['bform_powder', 'bform_granule', 'bform_sheet']);
});

test('用损标定（D-1）：材料耐磨已知的耐用物品 wearPerUse = 耐磨 ÷ 旧 durability（可用次数 = 耐磨 ÷ wearPerUse = 旧次数）：粮袋 14÷90、竹鱼竿 22÷100；材料未知的仍是 1÷旧 durability 占位', () => {
  assert.equal(ROWS.item_grain_sack.wearPerUse, 0.1556);
  assert.equal(ROWS.item_bamboo_fishing_rod.wearPerUse, 0.22);
  assert.equal(ROWS.item_clothes.material, undefined);
  assert.equal(ROWS.item_clothes.wearPerUse, 0.01);
  // 反推可用次数：粮袋 14 ÷ 0.1556 ≈ 90，竹鱼竿 22 ÷ 0.22 = 100
  assert.ok(Math.abs(14 / ROWS.item_grain_sack.wearPerUse - 90) < 0.1);
  assert.equal(22 / ROWS.item_bamboo_fishing_rod.wearPerUse, 100);
});

test('腐坏（P-1，6-3 的读法）：真实粮食行配上真实麦材料后，放 5 日进度 0.101×5 = 0.505（第二档），放 30 日坏透（1、末档、坏透提案）；温度曲线取常数 1 免读气候，期望只看日数', () => {
  const SH = 'purpose_test_shelf';
  const PA = 'loc_hw';
  const f = baseFixture();
  const rules = readJson('world/rules/tables/items.json').rows;
  const given = (k) => rules.find((r) => r.key === k).value;
  f.vocab = { class: {}, category: readJson('world/ontology/dimensions/_vocab.json').families.category.entries, size: readJson('world/ontology/dimensions/_vocab.json').families.size.entries };
  f.rulesItems = { categoryRules: given('categoryRules'), classRules: given('classRules'), materialClassMin: given('materialClassMin'), sizeClasses: given('sizeClasses') };
  f.items = { item_wheat_grain: structuredClone(ROWS.item_wheat_grain) };
  f.editPlaceDoc = (doc) => { doc.rows[PA].ledgerHolder = true; };
  f.rulesExtra = {
    rot: { tempCurve: [[-100, 1], [100, 1]], stages: [{ minSpoilage: 0 }, { minSpoilage: 0.3 }, { minSpoilage: 0.7 }, { minSpoilage: 1 }], mergeMaxGap: 0.1 },
    wear: { envCurve: [[0, 1], [1, 1]] },
  };
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const world = r.world;
  const index = new Map(world.vocab.index);
  index.set('purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false } });
  index.set('verb_test', { family: 'verb', prefix: 'verb_', entry: {} });
  index.set('res_test_wheat', { family: 'resource', prefix: 'res_', entry: { item: 'item_wheat_grain' } });
  installVocab({ vocab: { families: world.vocab.families, index }, idIndex: world.idIndex, tables: world.tables });
  const eng = { vocab: { families: world.vocab.families, index }, rules: structuredClone(world.rules), units: world.env.units, tables: world.tables, template: { seed: 'test_world_seed' } };
  eng.rules.economyResources.res_test_wheat = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_consume', 'sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  const state = { clock: { minute: 0, seq: 0 } };
  let key;
  assert.deepEqual(runTransaction(state, { file: 'kernel/ledger.mjs', node: 'test_kernel' }, (s) => {
    const res = post(eng, s, { legs: [{ account: { holder: PA, purpose: SH, resource: { kind: 'res_test_wheat' } }, delta: 10, lot: { attrs: { enteredDay: 0, taint: 0, spoilage: 0, rotAnchorDay: 0 } } }, { flow: 'src_regrow', kind: 'res_test_wheat', qty: 10 }], reason: 'verb_test' });
    key = res.lots[0][1];
  }), { ok: true });
  const ref = { account: { holder: PA, purpose: SH, kind: 'res_test_wheat' }, lotKey: key };
  state.clock.minute = 5 * 1440;
  const r5 = rotStep(eng, state, ref, 0);
  assert.deepEqual([r5.spoilage.known, r5.spoilage.value, r5.stage], [true, 0.505, 1]);
  state.clock.minute = 30 * 1440;
  const r30 = rotStep(eng, state, ref, 0);
  assert.deepEqual([r30.spoilage.value, r30.stage, r30.transform], [1, 3, { to: 'sink' }]);
});

test('未写 material 的行：没有 bulkForm（I-8 只在写了材料后必填）、列仍登未建', () => {
  const unbuilt = readJson('world/ontology/dimensions/_unbuilt-derived.json').columns;
  assert.ok(unbuilt.some((c) => c.table === 'item' && c.dimension === 'material'));
  for (const [id, r] of Object.entries(ROWS)) if (r.material === undefined) assert.equal(r.bulkForm, undefined, id);
});
