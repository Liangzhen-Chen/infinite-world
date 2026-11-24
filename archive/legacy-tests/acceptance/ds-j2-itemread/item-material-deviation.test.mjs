// 验收测试（出题方：Claude Sonnet 5.5 中档；写修复的是另一个模型，审卡的是第三方）。
// 依据：卷三乙 :428（itemView 实例行 "material 取实例偏离值"，批次 "material 取批次偏离值"）、:429（materialView 接受实例 id 或 lotRef，按 M-1 聚合）、
//       D-1 :1398（用损读"修正后值"，品质与材料经此进入）、P-1 :1530（腐坏率是按 M-1 聚合的 rotRate）、§2.3 批次结构 material 行（:262 起，"本批的材料偏离"）、
//       I-3 :918（实例的材料偏离写在 created.<id>.props）；偏离清查-1122 甲 2（04c #1）。
// 测什么：实例与批次一旦带了材料偏离（或维度偏离），用损、腐坏的读数要按偏离后的材料与维度算，不再一律按模板：
//   ① 实例 material 偏离：刃模板工作部铁（wearResistance 50），实例偏离成锡（wearResistance 25）；wearPerUse 0.05；
//      用一次损耗 = 0.05 ÷ 25 = 0.002（模板口径是 0.05 ÷ 50 = 0.001）。
//   ② 实例 wearPerUse 偏离 0.1（props）：用一次损耗 = 0.1 ÷ 50 = 0.002。
//   ③ 批次 material 偏离：粮模板主料 rotRate 0.04，批次偏离成 rotRate 0.08 的料；温度曲线取常数 1；放 10 日腐坏进度 = 0.08 × 10 = 0.8（模板口径 0.4）。
//   ④ 对照：没有偏离的实例、批次仍按模板（0.001、0.4），防止修成"一律按偏离"。
// 为什么修前失败：item-state.mjs aggregated()（:210-214）、templateValue()（:415-418）只把模板 id 交给读口，实例与批次的偏离读不到；
//   修前 ①②读到 0.001，③读到 0.4。
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
import { rotStep, wearStep } from '../../../server-plugin/kernel/item-state.mjs';
import { initDurability } from '../../../server-plugin/item-condition.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const IRON = 'mat_test_iron';
const TIN = 'mat_test_tin';
const WOOD = 'mat_test_wood';
const GRAIN = 'mat_test_grain';
const GRAIN_FAST = 'mat_test_grain_fast';
const SH = 'purpose_test_shelf';
const PA = 'loc_county_xichui_longqu';
const PB = 'loc_hw';
const KERNEL = { file: 'kernel/ledger.mjs', node: 'test_kernel' };
const COND = { file: 'item-condition.mjs', node: 'item_condition_node' };

const grainRow = (rotRate) => ({ flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate, moisture: 0.12, energyDensity: 15 });

function build() {
  const f = baseFixture();
  // 材料：铁 wearResistance 50（夹具默认）、锡改成 25；两种粮料，腐坏率 0.04 与 0.08（密度等其余格相同）。
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

// 建一把刃的实例（耐久初值 1）。
function makeBlade(engine, state, id) {
  const spec = { id, template: 'item_test_blade', holder: PA, purpose: SH, flow: 'src_regrow', reason: 'verb_test', taint: 0, fields: { madeDay: 0, qualityTier: 'quality_normal' } };
  assert.deepEqual(runTransaction(state, KERNEL, (s) => { createItemInstance(engine, s, spec); }), { ok: true });
  assert.deepEqual(runTransaction(state, COND, (s) => { initDurability(engine, s, id, 1); }), { ok: true });
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

test('④ 对照：没有偏离的刃实例用一次损耗 0.05 ÷ 50 = 0.001；没有偏离的批次放 10 日腐坏 0.04 × 10 = 0.4（模板口径不变）', () => {
  const { engine } = build();
  const state = at(10);
  makeBlade(engine, state, 'item_inst_1');
  assert.equal(wearStep(engine, state, 'item_inst_1', 'use').delta.value, 0.001);
  const ref = stockGrain(engine, state, {});
  assert.equal(rotStep(engine, state, ref, 0).spoilage.value, 0.4);
});

test('① 实例 material 偏离（铁 → 锡，wearResistance 50 → 25）：用一次损耗 0.05 ÷ 25 = 0.002（卷三乙 :428、D-1 :1398）', () => {
  const { engine } = build();
  const state = at(3);
  makeBlade(engine, state, 'item_inst_1');
  assert.deepEqual(runTransaction(state, KERNEL, (s) => { writeItemDeviation(engine, s, 'item_inst_1', 'material', [share('mgroup_working', TIN, 1)]); }), { ok: true });
  assert.equal(wearStep(engine, state, 'item_inst_1', 'use').delta.value, 0.002);
});

test('② 实例 wearPerUse 偏离 0.1（卷三乙 I-3、:428）：用一次损耗 0.1 ÷ 50 = 0.002', () => {
  const { engine } = build();
  const state = at(3);
  makeBlade(engine, state, 'item_inst_1');
  assert.deepEqual(runTransaction(state, KERNEL, (s) => { writeItemDeviation(engine, s, 'item_inst_1', 'wearPerUse', 0.1); }), { ok: true });
  assert.equal(wearStep(engine, state, 'item_inst_1', 'use').delta.value, 0.002);
});

test('③ 批次 material 偏离（粮料 rotRate 0.04 → 0.08）：温度曲线取常数 1，放 10 日腐坏进度 0.08 × 10 = 0.8（卷三乙 :428、P-1 :1530、批次结构 material 行）', () => {
  const { engine } = build();
  const state = at(0);
  const ref = stockGrain(engine, state, { material: [share('mgroup_body', GRAIN_FAST, 1)] });
  state.clock.minute = 10 * 1440;
  assert.equal(rotStep(engine, state, ref, 0).spoilage.value, 0.8);
});
