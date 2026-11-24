// 验收测试（出题方：Claude Haiku 5.5，标识 haiku-test-c5；未参与写码与审卡）。
// 依据：卷三乙 :429（materialView 接受材料 id、物品模板 id、实例 id 或 lotRef；给实例或批次时返回带该实例或批次材料偏离的组成；给模板按静态读法）；
//       卷三乙 I-3 :918（实例的材料偏离写在 itemInstances.<id>.props.material，偏离后按组重算）；卷三乙 §2.3 :271（批次 material 为本批的材料偏离，
//       不同组成的批次不合并）；卷三乙 M-1 :681（物品的材料量按 rules.items.aggregation 聚合）、:656（wearResistance 为 mean，承担组为工作部）、
//       :658（rotRate 为 mean，全部组）。
// 测什么：
//   ② 材料 id 的固态密度：materialView(材料 id).dims.density.value.solid 等于夹具材料行的 solid 栏字面量（铁 4、锡 2）。
//   ③a 实例无偏离：刃模板工作部铁 wearResistance 50，materialView(实例 id) 读到 50（与模板一致）。
//   ③b 实例 material 偏离成锡（wearResistance 25）：materialView(实例 id) 读到 25（带实例偏离的组成）。
//   ③c 批次 material 偏离成 rotRate 0.08 的料：materialView(lotRef) 读到 0.08；同模板的无偏离批次读到 0.04（与模板一致）。
// 修前结果（实测，node --test）：② 绿（对照）；③a、③b 红、③c 红，原因都是 materialView 的 kindOf（server-plugin/kernel/vocab.mjs:74）
//   只查加载期 idIndex：实例 id 报 E-DIM-REF-MISSING（"not in idIndex"），lotRef 对象同样报错（item.mjs:659）。卷三乙 :429 要求这两种 id 都接受。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share } from '../../kernel/item-world.mjs';
import { miniClimatePlaceDoc } from '../../kernel/mini-place-world.mjs';
import { installVocab } from '../../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { post } from '../../../server-plugin/kernel/ledger.mjs';
import { createItemInstance, writeItemDeviation } from '../../../server-plugin/kernel/dimension-writers.mjs';
import { materialView } from '../../../server-plugin/kernel/item.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const IRON = 'mat_test_iron';
const TIN = 'mat_test_tin';
const GRAIN = 'mat_test_grain';
const GRAIN_FAST = 'mat_test_grain_fast';
const SH = 'purpose_test_shelf';
const PA = 'loc_county_xichui_longqu';
const PB = 'loc_hw';
const KERNEL = { file: 'kernel/ledger.mjs', node: 'test_kernel' };

// 粮料行：rotRate 与 moisture、能量密度等取值照夹具；只有 rotRate 两条不同（0.04 与 0.08），其余维度相同。
const grainRow = (rotRate) => ({ flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate, moisture: 0.12, energyDensity: 15 });

function build() {
  const f = baseFixture();
  f.materials[TIN].wearResistance = 25;
  f.materials[GRAIN] = grainRow(0.04);
  f.materials[GRAIN_FAST] = grainRow(0.08);
  f.items = {
    item_test_grain: itemRow(1, [share('mgroup_body', GRAIN, 1)]),
    item_test_blade: itemRow(0.5, [share('mgroup_working', IRON, 1)], { classes: ['comp_tool', 'comp_crafted'], wearPerUse: 0.05, dailyUses: 10 }),
  };
  f.editPlaceDoc = (doc) => miniClimatePlaceDoc(doc, { place: PA, child: PB });
  f.editOrgDoc = (doc) => { doc.rows = {}; };
  f.rulesExtra = {
    rot: { tempCurve: [[-100, 1], [100, 1]], stages: [{ minSpoilage: 0 }, { minSpoilage: 0.3 }, { minSpoilage: 0.7 }, { minSpoilage: 1 }], mergeMaxGap: 0.1 },
    wear: { envCurve: [[0, 1], [1, 1]] },
  };
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  const index = new Map(W.vocab.index);
  index.set(SH, { family: 'purpose', prefix: 'purpose_', entry: { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false } });
  index.set('verb_test', { family: 'verb', prefix: 'verb_', entry: {} });
  for (const [res, item] of Object.entries({ res_test_grain: 'item_test_grain', res_test_blade: 'item_test_blade' })) index.set(res, { family: 'resource', prefix: 'res_', entry: { item } });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  const row = (sources, sinks) => ({ family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources, sinks, onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false });
  for (const res of ['res_test_grain', 'res_test_blade']) rules.economyResources[res] = row(['src_regrow'], ['sink_consume', 'sink_decay']);
  return { engine: { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_world_seed' } } };
}

const at = (day) => ({ clock: { minute: day * 1440, seq: 0 } });

// 建一把刃的实例（材料取模板铁）。
function makeBlade(engine, state, id) {
  const spec = { id, template: 'item_test_blade', holder: PA, purpose: SH, flow: 'src_regrow', reason: 'verb_test', taint: 0, fields: { madeDay: 0, qualityTier: 'quality_normal' } };
  assert.deepEqual(runTransaction(state, KERNEL, (s) => { createItemInstance(engine, s, spec); }), { ok: true });
}

// 放一批粮（可带 attrs 偏离），返回 lotRef。
function stockGrain(engine, state, attrs) {
  let key;
  const r = runTransaction(state, KERNEL, (s) => {
    const res = post(engine, s, { legs: [{ account: { holder: PA, purpose: SH, resource: { kind: 'res_test_grain' } }, delta: 10, lot: { attrs: { enteredDay: 0, taint: 0, spoilage: 0, rotAnchorDay: 0, ...attrs } } }, { flow: 'src_regrow', kind: 'res_test_grain', qty: 10 }], reason: 'verb_test' });
    key = res.lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return { account: { holder: PA, purpose: SH, kind: 'res_test_grain' }, lotKey: key };
}

test('② 材料 id 的固态密度：materialView 读到的 density.solid 等于材料行 solid 栏（铁 4、锡 2，夹具字面量；卷三乙 :429、卷三甲 :110）', () => {
  const { engine } = build();
  const state = at(3);
  assert.equal(materialView(engine, state, IRON).dims.density.value.solid, 4);
  assert.equal(materialView(engine, state, TIN).dims.density.value.solid, 2);
});

test('③a 实例无偏离：刃实例的 materialView 工作部 wearResistance 读到模板值 50（卷三乙 :429 "没有偏离时与模板一致"，M-1 mean）', () => {
  const { engine } = build();
  const state = at(3);
  makeBlade(engine, state, 'item_inst_1');
  assert.equal(materialView(engine, state, 'item_inst_1', { dimensions: ['wearResistance'] }).dims.wearResistance.value, 50);
});

test('③b 实例 material 偏离（铁 → 锡，I-3 :918）：刃实例的 materialView 工作部 wearResistance 读到 25，不再是模板的 50（卷三乙 :429）', () => {
  const { engine } = build();
  const state = at(3);
  makeBlade(engine, state, 'item_inst_1');
  assert.deepEqual(runTransaction(state, KERNEL, (s) => { writeItemDeviation(engine, s, 'item_inst_1', 'material', [share('mgroup_working', TIN, 1)]); }), { ok: true });
  assert.equal(materialView(engine, state, 'item_inst_1', { dimensions: ['wearResistance'] }).dims.wearResistance.value, 25);
});

test('③c 批次：material 偏离成 rotRate 0.08 的料（卷三乙 §2.3 :271）时 materialView(lotRef) 的 rotRate 为 0.08；无偏离的同模板批次为模板的 0.04（卷三乙 :429）', () => {
  const { engine } = build();
  const state = at(0);
  const plain = stockGrain(engine, state, {});
  const fast = stockGrain(engine, state, { material: [share('mgroup_body', GRAIN_FAST, 1)] });
  assert.equal(materialView(engine, state, plain, { dimensions: ['rotRate'] }).dims.rotRate.value, 0.04);
  assert.equal(materialView(engine, state, fast, { dimensions: ['rotRate'] }).dims.rotRate.value, 0.08);
});
