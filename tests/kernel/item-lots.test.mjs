// 块 6 第 6-3 张《批次字段与物品写者》：批次字段与写者、逐件实例、容器装入（K-1）、批次拆并先陈后新（K-3）、转移不改 taint（K-4）、taint 只由账本写、
// create 实物同事务源汇腿（卷九 R9-2.7）、成色（D-1、D-2）与新鲜（P-1）的锚点式。依据：卷三乙 §2.3 :225、§3.3 :434、§4.2.3 I-2、§4.4.3 K-1 至 K-9、
// §4.10 D-1、D-2、§4.12 P-1、P-2、P-4；卷二十 §4.5。期望值按卷文公式手算成字面量（定点 4 位、向零截断），前提在临时世界与登记场景里造，不读仓库当前数据。
// 登记场景同 tests/kernel/ledger-post.test.mjs：资源种类行、用途、持有人加在注册表与规则表的副本里（不进 world/）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share, ROOT } from './item-world.mjs';
import { miniClimatePlaceDoc } from './mini-place-world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post, transfer, recordTaint, mergeLots, auditLots, auditLedger, lotsUnmergeable } from '../../server-plugin/kernel/ledger.mjs';
import { codeOf } from '../../server-plugin/kernel/errors.mjs';
import { createItemInstance, writeItemDeviation } from '../../server-plugin/kernel/dimension-writers.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';
import { lotsView, rotStep, wearStep, instanceView, canContain, containerView, durabilityOn, loadPlan } from '../../server-plugin/kernel/item-state.mjs';
import { transferGoods, reanchorLot, settleRotted } from '../../server-plugin/item-lots.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { advanceHook } from '../../server-plugin/kernel/advance-registry.mjs';
import { applyUse, reanchorWear, initDurability } from '../../server-plugin/item-condition.mjs';
import { P } from '../../server-plugin/kernel/handles/generated.mjs';
import { writePath } from '../../server-plugin/kernel/storage.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const IRON = 'mat_test_iron';
const WOOD = 'mat_test_wood';
const ICE = 'mat_test_ice';
const OIL = 'mat_test_oil';
const GRAIN = 'mat_test_grain';
const SH = 'purpose_test_shelf';
const PA = 'loc_county_xichui_longqu';
const PB = 'loc_hw';
const TEST_VERBS = ['verb_test', 'verb_test_buy'];

// 持有人 PA、PB 是真实地点行（垄渠郡与其下的河湾村，挂太原气候单元），腐坏读数经 place.mjs 的气候输入读到"当日温度"；
// 这些用例的温度曲线取常数 1，期望值不依赖具体气温（读太原温度的精确断言在 item-rot-real.test.mjs）。

const itemsFixture = () => {
  const water = itemRow(1, [share('mgroup_body', OIL, 1)]);
  delete water.bulkForm; // 可能物态集不含固：写了形态即报错（I-8）
  return {
    item_test_grain: itemRow(1, [share('mgroup_body', GRAIN, 1)]),
    item_test_axe: itemRow(1.6, [share('mgroup_working', IRON, 0.6), share('mgroup_grip', WOOD, 0.4)], { classes: ['comp_tool'], wearPerUse: 0.05, dailyUses: 40 }),
    item_test_blade: itemRow(0.5, [share('mgroup_working', IRON, 1)], { classes: ['comp_tool', 'comp_crafted'], wearPerUse: 0.05, dailyUses: 10 }),
    item_test_jar: itemRow(4, [share('mgroup_body', IRON, 1)], { classes: ['comp_container'], volumeCapacity: 20, maxLoadKg: 30, sealed: true, holdsLiquid: true, accepts: ['matter_liquid', 'subst_plant'] }),
    item_test_basket: itemRow(2, [share('mgroup_body', WOOD, 1)], { classes: ['comp_container'], volumeCapacity: 50, maxLoadKg: 30, sealed: false, holdsLiquid: false }),
    item_test_ingot: itemRow(40, [share('mgroup_body', IRON, 1)]),
    item_test_water: water,
    item_test_icecube: itemRow(2, [share('mgroup_body', ICE, 1)]),
  };
};

// 测试世界：前提在这里造。rules.rot：温度曲线常数 1（任何温度都取 1，期望值只看日数）、四档腐坏（0、0.3、0.7、1）、合并进度差上限 0.1；
// rules.wear：湿度曲线常数 1；rules.containers 不给（嵌套未建）。
function build(edit) {
  const f = baseFixture();
  f.materials[GRAIN] = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate: 0.04, moisture: 0.12, energyDensity: 15 };
  f.items = itemsFixture();
  // 持有人是真实地点行（6-24：垄渠郡挂太原气候单元，河湾村在其下）；测试前提只是让它们能作账本持有人（ledgerHolder 为真）。
  // 小格世界（mini-place-world.mjs）：真实世界的足迹与高度场是全规模，本机要数分钟；两行都是账本持有人，纬度、海拔与旧读法一致，温度曲线取常数不影响期望。
  f.editPlaceDoc = (doc) => miniClimatePlaceDoc(doc, { place: PA, child: PB });
  f.editOrgDoc = (doc) => { doc.rows = {}; };
  f.rulesExtra = {
    rot: { tempCurve: [[-100, 1], [100, 1]], stages: [{ minSpoilage: 0 }, { minSpoilage: 0.3 }, { minSpoilage: 0.7 }, { minSpoilage: 1 }], mergeMaxGap: 0.1 },
    wear: { envCurve: [[0, 1], [1, 1]] },
  };
  if (edit) edit(f);
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  // 登记场景：用途、verb、资源种类（粮食一行，指向粮食模板；斧、刃各一行）、持有人（人物，kind 来自 idIndex）。
  const index = new Map(W.vocab.index);
  index.set('purpose_test_shelf', { family: 'purpose', prefix: 'purpose_', entry: { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false } });
  for (const v of TEST_VERBS) index.set(v, { family: 'verb', prefix: 'verb_', entry: {} });
  const resources = { res_test_grain: 'item_test_grain', res_test_axe: 'item_test_axe', res_test_blade: 'item_test_blade', res_test_ingot: 'item_test_ingot', res_test_jar: 'item_test_jar', res_test_basket: 'item_test_basket' };
  for (const [res, item] of Object.entries(resources)) index.set(res, { family: 'resource', prefix: 'res_', entry: { item } });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  const row = (family, sources, sinks) => ({ family, unit: 'count', transferable: 'tr_free', counterpartRX: null, sources, sinks, onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false });
  for (const res of Object.keys(resources)) rules.economyResources[res] = row('resfam_goods', ['src_regrow'], ['sink_consume', 'sink_decay']);
  const engine = { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_world_seed' } };
  return { engine, W };
}

const at = (day, extra = {}) => ({ clock: { minute: day * 1440, seq: 0 }, ...extra });
const LOTS = { file: 'item-lots.mjs', node: 'item_lots_node' };
const COND = { file: 'item-condition.mjs', node: 'item_condition_node' };
const KERNEL = { file: 'kernel/ledger.mjs', node: 'test_kernel' };
const acct = (holder, kind) => ({ holder, purpose: SH, kind });

// 在状态里放一批粮：数量 n、批次属性 attrs（走账本 post 的来源腿，批次键由账本发）。返回批次键。
function stock(eng, state, holder, qty, attrs, kind = 'res_test_grain') {
  let key;
  const r = runTransaction(state, KERNEL, (s) => {
    const res = post(eng, s, { legs: [{ account: { holder, purpose: SH, resource: { kind } }, delta: qty, lot: { attrs: { enteredDay: 0, taint: 0, ...attrs } } }, { flow: 'src_regrow', kind, qty }], reason: 'verb_test' });
    key = res.lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return key;
}

test('真实 world：item 表头有实例维度（taint 恒必填、durability 与 wearAnchorDay 同挂耐用、spoilage 与 rotAnchorDay 同挂可腐）；quality 七档有序；rules.items.instancedComponents 是 I-2 首批十二类', () => {
  const { engine } = build();
  const doc = engine.tables.get('item').doc;
  assert.equal(doc.instanceDimensions.taint.required, 'always');
  assert.deepEqual([doc.instanceDimensions.durability.required, doc.instanceDimensions.wearAnchorDay.required], ['byClass:comp_durable', 'byClass:comp_durable']);
  assert.deepEqual([doc.instanceDimensions.spoilage.required, doc.instanceDimensions.rotAnchorDay.required], ['byClass:comp_rottable', 'byClass:comp_rottable']);
  // 品质七档（卷三乙 :304 "劣、次、常、良、优、精、绝"；李白 11-19 20:3x ⑥）：代号与 rank 1–7；wear 五档（卷三乙 :310 "完好、旧、损、残、毁"）rank 0–4。
  const quality = engine.vocab.families.get('quality').entries;
  assert.deepEqual(Object.entries(quality).map(([k, e]) => [e.rank, k]).sort((a, b) => a[0] - b[0]),
    [[1, 'quality_awful'], [2, 'quality_poor'], [3, 'quality_normal'], [4, 'quality_good'], [5, 'quality_excellent'], [6, 'quality_masterwork'], [7, 'quality_legendary']]);
  const wear = engine.vocab.families.get('wear').entries;
  assert.deepEqual(Object.entries(wear).map(([k, e]) => [e.rank, k]).sort((a, b) => a[0] - b[0]),
    [[0, 'wear_intact'], [1, 'wear_worn'], [2, 'wear_damaged'], [3, 'wear_broken'], [4, 'wear_ruined']]);
  assert.ok(!engine.rules.quality.unbuilt.includes('tierCodes'));
  assert.ok(!engine.rules.wear.unbuilt.includes('wearKinds'));
  assert.deepEqual(engine.rules.containers.unbuilt, ['maxNesting']);
  assert.equal(engine.rules.items.instancedComponents.length, 12);
  assert.ok(!engine.rules.items.instancedComponents.includes('comp_crafted'));
});

// ---------- P-1 新鲜：30 日食物会坏（锚点式，卷二十 §4.5 温度） ----------

const lotRef = (holder, key, kind = 'res_test_grain') => ({ account: acct(holder, kind), lotKey: key });

test('P-1、P-2：腐坏率 0.04、温度曲线取 1、批次新鲜入账：放 30 日坏透（进度 1、末档、转化提案），第 10 日 0.4（第二档），保质日数 1÷0.04 = 25 日（坏透日）', () => {
  const { engine } = build();
  const state = at(0);
  const key = stock(engine, state, PA, 10, { spoilage: 0, rotAnchorDay: 0 });
  state.clock.minute = 10 * 1440;
  const r10 = rotStep(engine, state, lotRef(PA, key), 0);
  assert.deepEqual([r10.spoilage.known, r10.spoilage.value, r10.stage, r10.expiresDay, r10.transform], [true, 0.4, 1, 25, null]);
  assert.deepEqual(r10.reanchor, { spoilage: 0.4, rotAnchorDay: 10 });
  state.clock.minute = 30 * 1440;
  const r30 = rotStep(engine, state, lotRef(PA, key), 0);
  assert.deepEqual([r30.spoilage.value, r30.stage, r30.expiresDay, r30.transform], [1, 3, 25, { to: 'sink' }]);
  // 一次跳 30 日与分段读（先看第 10 日再看第 30 日）读到的是同一个值：状态里存的仍是锚点值（平时不写状态，D-2、P-1）。
  assert.deepEqual([state.stockLots[PA][SH].res_test_grain[key].spoilage, state.stockLots[PA][SH].res_test_grain[key].rotAnchorDay], [0, 0]);
  // days 参数：从第 10 日起看再过 15 日（第 25 日）＝ 0.04 × 25 = 1。
  state.clock.minute = 10 * 1440;
  assert.equal(rotStep(engine, state, lotRef(PA, key), 15).spoilage.value, 1);
  assert.equal(rotStep(engine, state, lotRef(PA, key), 14).spoilage.value, 0.96);
});

test('P-1：存的进度 0.5、锚点日第 5 日、今日第 10 日：0.5 + 5 × 0.04 = 0.7（恰在第三档下界，入第三档）；坏透日第 18 日（第 17 日 0.98，第 18 日 1.02 封顶 1）', () => {
  const { engine } = build();
  const state = at(10);
  const key = stock(engine, state, PA, 1, { spoilage: 0.5, rotAnchorDay: 5 });
  const r = rotStep(engine, state, lotRef(PA, key), 0);
  assert.deepEqual([r.spoilage.value, r.stage, r.expiresDay], [0.7, 2, 18]);
});

test('P-6：温度曲线在低温处取 0（冻住不坏）：放 30 日进度仍是存的值，没有坏透日；规则表没给曲线或接线没交入，读数按未知带缺口，不借常数', () => {
  const frozen = build((f) => { f.rulesExtra.rot.tempCurve = [[-100, 0], [100, 0]]; });
  const s1 = at(30);
  const k1 = stock(frozen.engine, s1, PA, 1, { spoilage: 0.1, rotAnchorDay: 0 });
  const r1 = rotStep(frozen.engine, s1, lotRef(PA, k1), 0);
  assert.deepEqual([r1.spoilage.value, r1.stage, r1.expiresDay, r1.transform], [0.1, 0, null, null]);
  // 所在处给不出气候输入（缺纬度参数 rules.astro.latitudeOriginDeg）：未知带缺口
  const { engine } = build();
  delete engine.rules.astro.latitudeOriginDeg;
  const s2 = at(30);
  const k2 = stock(engine, s2, PA, 1, { spoilage: 0, rotAnchorDay: 0 });
  const r2 = rotStep(engine, s2, lotRef(PA, k2), 0);
  assert.deepEqual([r2.spoilage.known, r2.spoilage.applicable, [...r2.spoilage.gaps]], [false, true, ['place_env_unbuilt']]);
  const noCurve = build();
  delete noCurve.engine.rules.rot.tempCurve; // 真实表现在有暂定曲线；这里模拟规则表没给
  const s3 = at(30);
  const k3 = stock(noCurve.engine, s3, PA, 1, { spoilage: 0, rotAnchorDay: 0 });
  assert.deepEqual([...rotStep(noCurve.engine, s3, lotRef(PA, k3), 0).spoilage.gaps], ['rules.rot.tempCurve']);
});

test('P-1：整件不可腐的批次（铁锭）腐坏读数不适用；当日就是锚点日时不读环境（未接线也读得出）', () => {
  const { engine } = build();
  const state = at(0);
  const ingot = stock(engine, state, PA, 1, {}, 'res_test_ingot');
  assert.deepEqual([rotStep(engine, state, lotRef(PA, ingot, 'res_test_ingot'), 0).spoilage.applicable], [false]);
  const grain = stock(engine, state, PA, 1, { spoilage: 0.25, rotAnchorDay: 0 });
  assert.equal(rotStep(engine, state, lotRef(PA, grain), 0).spoilage.value, 0.25);
});

test('lotsView：某账户某物的批次清单按批次键序号升序，带今日数量、属性、腐坏进度与档；数量为 0 的批次不列', () => {
  const { engine } = build();
  const state = at(5);
  const a = stock(engine, state, PA, 3, { spoilage: 0, rotAnchorDay: 5 });
  const b = stock(engine, state, PA, 2, { spoilage: 0.5, rotAnchorDay: 5 });
  const c = stock(engine, state, PA, 4, { spoilage: 0.1, rotAnchorDay: 5 });
  state.accounts[PA][SH].res_test_grain[b] = 0;
  const v = lotsView(engine, state, PA, 'item_test_grain', SH);
  assert.deepEqual(v.map((x) => [x.lotKey, x.qty, x.spoilage.value, x.stage]), [[a, 3, 0, 0], [c, 4, 0.1, 0]]);
  assert.deepEqual(lotsView(engine, state, PB, 'item_test_grain', SH), []);
});

// ---------- K-3 拆并先陈后新、K-4 转移不改 taint ----------

const run = (state, ctx, fn) => runTransaction(state, ctx, fn);
const lotRows = (state, holder, kind = 'res_test_grain') => Object.entries(state.accounts[holder][SH][kind]).filter(([, q]) => q > 0).map(([k, q]) => [k, q, state.stockLots[holder][SH][kind][k]]);

test('K-3 先陈后新：腐坏进度高的先出，进度相同序号小的先出；一批不够取下一批；转入的两批同键同档并成一批', () => {
  const { engine } = build();
  const state = at(0);
  const fresh = stock(engine, state, PA, 5, { spoilage: 0, rotAnchorDay: 0 });
  const old1 = stock(engine, state, PA, 5, { spoilage: 0.5, rotAnchorDay: 0 });
  const old2 = stock(engine, state, PA, 5, { spoilage: 0.5, rotAnchorDay: 0 });
  let out;
  assert.deepEqual(run(state, LOTS, (s) => { out = transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty: 7, reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(out.moved.map((m) => [m.from, m.qty]), [[old1, 5], [old2, 2]]);
  assert.equal(state.accounts[PA][SH].res_test_grain[fresh], 5);
  assert.equal(state.accounts[PA][SH].res_test_grain[old1], 0);
  assert.equal(state.accounts[PA][SH].res_test_grain[old2], 3);
  // 到 npc_b：两个新批次进度同为 0.5、同键，并成一批 7 件。
  const rows = lotRows(state, PB);
  assert.equal(rows.length, 1);
  assert.deepEqual([rows[0][1], rows[0][2].spoilage, rows[0][2].rotAnchorDay], [7, 0.5, 0]);
  assert.equal(out.merged.length, 1);
  assert.deepEqual(auditLots(engine, state), []);
});

test('K-3 转入合并：同键、同一腐坏档、进度差不超 mergeMaxGap 才并；并时 spoilage 与 taint 按数量加权、enteredDay 取较早；不并的分立（新货冲不淡陈货）', () => {
  const { engine } = build();
  const state = at(0);
  stock(engine, state, PB, 10, { spoilage: 0.1, rotAnchorDay: 0, taint: 0.2, enteredDay: 3 });
  stock(engine, state, PA, 30, { spoilage: 0.12, rotAnchorDay: 0, taint: 0.6, enteredDay: 7 });
  const t = (qty) => run(state, LOTS, (s) => { transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty, reason: 'verb_test' }); });
  assert.deepEqual(t(30), { ok: true });
  const rows = lotRows(state, PB);
  assert.equal(rows.length, 1);
  // 进度 (0.1 × 10 + 0.12 × 30) ÷ 40 = 4.6 ÷ 40 = 0.115；taint (0.2 × 10 + 0.6 × 30) ÷ 40 = 20 ÷ 40 = 0.5；enteredDay min(3, 7)
  assert.deepEqual([rows[0][1], rows[0][2].spoilage, rows[0][2].taint, rows[0][2].enteredDay], [40, 0.115, 0.5, 3]);
  // 进度差 0.5 > 0.1：陈货进新货的账户里不并（0.115 对 0.65 的档与差都不合）
  stock(engine, state, PA, 2, { spoilage: 0.65, rotAnchorDay: 0, taint: 0.5, enteredDay: 1 });
  assert.deepEqual(t(2), { ok: true });
  assert.equal(lotRows(state, PB).length, 2);
  assert.deepEqual(auditLots(engine, state), []);
});

test('K-3 不合并的情形：同差内但不同腐坏档（0.25 对 0.35）、品质档不同、批次已受热（temperature 非空）都分立', () => {
  const { engine } = build();
  const cases = [
    [{ spoilage: 0.25, rotAnchorDay: 0 }, { spoilage: 0.35, rotAnchorDay: 0 }],
    [{ spoilage: 0, rotAnchorDay: 0, qualityTier: 'quality_good' }, { spoilage: 0, rotAnchorDay: 0 }],
    [{ spoilage: 0, rotAnchorDay: 0, temperature: 40, tempAnchorMinute: 0 }, { spoilage: 0, rotAnchorDay: 0 }],
  ];
  for (const [dest, src] of cases) {
    const state = at(0);
    stock(engine, state, PB, 4, dest);
    stock(engine, state, PA, 4, src);
    assert.deepEqual(run(state, LOTS, (s) => { transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty: 4, reason: 'verb_test' }); }), { ok: true });
    assert.equal(lotRows(state, PB).length, 2, JSON.stringify(dest));
  }
});

test('K-4 转移不改 taint：整批转给没有同类批次的人，新批次 taint 原样 0.25；转出一部分后原批次 taint 仍 0.25', () => {
  const { engine } = build();
  const state = at(0);
  const k = stock(engine, state, PA, 4, { spoilage: 0, rotAnchorDay: 0, taint: 0.25 });
  assert.deepEqual(run(state, LOTS, (s) => { transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty: 1, reason: 'verb_test' }); }), { ok: true });
  assert.equal(lotRows(state, PB)[0][2].taint, 0.25);
  assert.equal(state.stockLots[PA][SH].res_test_grain[k].taint, 0.25);
  assert.deepEqual([state.accounts[PA][SH].res_test_grain[k], lotRows(state, PB)[0][1]], [3, 1]);
});

test('转移：余额不足整笔拒（E-LEDGER-NEGATIVE）、状态不变；数量须是正整数', () => {
  const { engine } = build();
  const state = at(0);
  stock(engine, state, PA, 2, { spoilage: 0, rotAnchorDay: 0 });
  const before = structuredClone(state);
  const t = (qty) => run(state, LOTS, (s) => { transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty, reason: 'verb_test' }); });
  assert.deepEqual(t(3), { ok: false, code: 'E-LEDGER-NEGATIVE' });
  assert.deepEqual(state, before);
  assert.deepEqual(t(0), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(t(1.5), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
});

test('转移后锚点重设：转到别处的新批次与被拆过的原批次，进度写成当日值、锚点日为当日（换账户与拆分是条件变化，P-1）', () => {
  const { engine } = build();
  const state = at(10);
  const k = stock(engine, state, PA, 4, { spoilage: 0, rotAnchorDay: 0 });
  assert.deepEqual(run(state, LOTS, (s) => { transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty: 1, reason: 'verb_test' }); }), { ok: true });
  // 10 日 × 0.04 = 0.4
  assert.deepEqual([state.stockLots[PA][SH].res_test_grain[k].spoilage, state.stockLots[PA][SH].res_test_grain[k].rotAnchorDay], [0.4, 10]);
  const nb = lotRows(state, PB)[0][2];
  assert.deepEqual([nb.spoilage, nb.rotAnchorDay], [0.4, 10]);
});

test('reanchorLot：写回当日值并设锚点日；已是当日、读不出（所在处没有气候输入，缺纬度参数）都不写', () => {
  const { engine } = build();
  const state = at(10);
  const k = stock(engine, state, PA, 1, { spoilage: 0, rotAnchorDay: 0 });
  const blind = build();
  delete blind.engine.rules.astro.latitudeOriginDeg;
  assert.deepEqual(run(state, LOTS, (s) => { assert.equal(reanchorLot(blind.engine, s, lotRef(PA, k)), false); }), { ok: true });
  assert.deepEqual(run(state, LOTS, (s) => { assert.equal(reanchorLot(engine, s, lotRef(PA, k)), true); assert.equal(reanchorLot(engine, s, lotRef(PA, k)), false); }), { ok: true });
  assert.deepEqual([state.stockLots[PA][SH].res_test_grain[k].spoilage, state.stockLots[PA][SH].res_test_grain[k].rotAnchorDay], [0.4, 10]);
});

// ---------- 账本写批次合并与 taint（卷三乙 §3.3） ----------

test('mergeLots：判同键不同（品质档、purports）、受热或燃烧（temperature、burn、leakAnchorDay）非空都整笔拒；可并时余额相加、被并批次的余额行与批次行都删，K-8 审计仍过', () => {
  const { engine } = build();
  const state = at(0);
  const a = stock(engine, state, PA, 2, { spoilage: 0, rotAnchorDay: 0 });
  const b = stock(engine, state, PA, 3, { spoilage: 0, rotAnchorDay: 0, qualityTier: 'quality_good' });
  const c = stock(engine, state, PA, 3, { spoilage: 0, rotAnchorDay: 0, purports: { item: 'item_test_axe', forgeryGrade: 10 } });
  const d = stock(engine, state, PA, 3, { spoilage: 0, rotAnchorDay: 0, burn: { sinceMinute: 0, remainingKg: 1 } });
  const e = stock(engine, state, PA, 4, { spoilage: 0, rotAnchorDay: 0 });
  const m = (into, from) => run(state, KERNEL, (s) => { mergeLots(engine, s, { holder: PA, purpose: SH, kind: 'res_test_grain', into, from }); });
  assert.deepEqual(m(a, b), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(m(a, c), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(m(a, d), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(m(a, a), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(m(a, e), { ok: true });
  assert.equal(state.accounts[PA][SH].res_test_grain[a], 6);
  assert.ok(!Object.hasOwn(state.accounts[PA][SH].res_test_grain, e));
  assert.ok(!Object.hasOwn(state.stockLots[PA][SH].res_test_grain, e));
  assert.deepEqual(auditLots(engine, state), []);
});

test('mergeLots：oreGrade 按数量加权（(60 × 1 + 80 × 3) ÷ 4 = 75）、有一批为空结果为空；costBasis 两批都有则相加、否则不写', () => {
  const { engine } = build();
  const state = at(0);
  const m = (into, from) => run(state, KERNEL, (s) => { mergeLots(engine, s, { holder: PA, purpose: SH, kind: 'res_test_grain', into, from }); });
  const a = stock(engine, state, PA, 1, { oreGrade: 60, costBasis: 10 });
  const b = stock(engine, state, PA, 3, { oreGrade: 80, costBasis: 30 });
  assert.deepEqual(m(a, b), { ok: true });
  assert.deepEqual([state.stockLots[PA][SH].res_test_grain[a].oreGrade, state.stockLots[PA][SH].res_test_grain[a].costBasis], [75, 40]);
  const c = stock(engine, state, PA, 1, {});
  assert.deepEqual(m(a, c), { ok: true });
  assert.equal(state.stockLots[PA][SH].res_test_grain[a].oreGrade, null);
  assert.ok(!Object.hasOwn(state.stockLots[PA][SH].res_test_grain[a], 'costBasis'));
});

test('taint 只由账本写：recordTaint 改批次与实例的 taint（只改值、不改数量，cause 须是登记 verb）；越界、cause 不合、实例已有值再写初值都拒；第二个文件写 taint 路径无从构造', () => {
  const { engine } = build();
  const state = at(0);
  const k = stock(engine, state, PA, 4, { spoilage: 0, rotAnchorDay: 0, taint: 0.1 });
  const set = (target, taint, cause) => run(state, KERNEL, (s) => { recordTaint(engine, s, { target, taint, cause }); });
  const lot = { lot: { holder: PA, purpose: SH, kind: 'res_test_grain', lotKey: k } };
  assert.deepEqual(set(lot, 0.8, 'verb_test'), { ok: true });
  assert.deepEqual([state.stockLots[PA][SH].res_test_grain[k].taint, state.accounts[PA][SH].res_test_grain[k]], [0.8, 4]);
  assert.deepEqual(set(lot, 1.5, 'verb_test'), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(set(lot, -0.1, 'verb_test'), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(set(lot, 0.5, 'src_regrow'), { ok: false, code: 'E-EVT-VERB' });
  assert.deepEqual(set(lot, 0.5, null), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.equal(state.stockLots[PA][SH].res_test_grain[k].taint, 0.8);
  // 实例：初值（cause 为 null）只在还没有 taint 时可写，有了再改须带 cause。
  state.itemInstances = { item_inst_9: { template: 'item_test_axe' } };
  assert.deepEqual(set({ instance: 'item_inst_9' }, 0.3, null), { ok: true });
  assert.deepEqual(set({ instance: 'item_inst_9' }, 0.4, null), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(set({ instance: 'item_inst_9' }, 0.4, 'verb_test'), { ok: true });
  assert.equal(state.itemInstances.item_inst_9.taint, 0.4);
  assert.deepEqual(set({ instance: 'item_nope' }, 0.4, 'verb_test'), { ok: false, code: 'E-DIM-REF-MISSING' });
  // 规则层没有写 taint 的句柄（账本路径不生成 P 构造函数），腐坏字段只有 item-lots.mjs、耐久字段只有 item-condition.mjs 能经 writePath 写。
  assert.equal(P.itemInstances_taint, undefined);
  assert.equal(P.stockLots_taint, undefined);
  state.itemInstances.item_inst_9.durability = 1;
  state.itemInstances.item_inst_9.wearAnchorDay = 0;
  assert.deepEqual(run(state, LOTS, (s) => { writePath(s, P.itemInstances_durability('item_inst_9'), 0.5); }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(run(state, COND, (s) => { writePath(s, P.itemInstances_durability('item_inst_9'), 0.5); }), { ok: true });
  assert.deepEqual(run(state, COND, (s) => { writePath(s, P.stockLots_spoilage(PA, SH, 'res_test_grain', k), 0.5); }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(run(state, LOTS, (s) => { writePath(s, P.stockLots_spoilage(PA, SH, 'res_test_grain', k), 0.5); }), { ok: true });
});

// ---------- I-2 逐件建实例；R9-2.7 create 实物同事务源汇腿 ----------

const spec = (over = {}) => ({ id: 'item_inst_1', template: 'item_test_axe', holder: PA, purpose: SH, flow: 'src_regrow', reason: 'verb_test', taint: 0.25, fields: {}, ...over });
// 建实例不写耐久（§3.3：归 item-condition.mjs）：建成之后，含耐用份的模板（斧、刃、罐）在以 item-condition.mjs 为节点的事务里落耐久初值 1；over.bare 不落。
const DURABLE = ['item_test_axe', 'item_test_blade', 'item_test_jar'];
function create(eng, state, over = {}) {
  const { bare, ...rest } = over;
  const o = spec(rest);
  const r = run(state, KERNEL, (s) => { createItemInstance(eng, s, o); });
  if (r.ok && !bare && DURABLE.includes(o.template)) return run(state, COND, (s) => { initDurability(eng, s, o.id, 1); });
  return r;
}

test('I-2：只有挂 rules.items.instancedComponents 所列组件类的模板能建实例（斧、刃、罐可以；粮、铁锭是存量，建实例即拒），被拒不留任何写入', () => {
  const { engine } = build();
  const state = at(3);
  const before = structuredClone(state);
  for (const template of ['item_test_grain', 'item_test_ingot', 'item_test_water']) assert.deepEqual(create(engine, state, { template, fields: {} }), { ok: false, code: 'E-DIM-STRUCT-FIELD' }, template);
  assert.deepEqual(state, before);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  assert.deepEqual(state.itemInstances.item_inst_1, { template: 'item_test_axe', durability: 1, wearAnchorDay: 3, taint: 0.25 });
});

test('R9-2.7 create 涉及实物：同一事务内经账本记一件新批次与登记来源腿（粮食行没有登记的来源 src_genesis 拒 E-ACT-PRIMITIVE，整笔回滚）；成功后总量增 1、来源累计 1、批次一致性审计过', () => {
  const { engine } = build();
  const state = at(3);
  const before = structuredClone(state);
  assert.deepEqual(create(engine, state, { flow: 'src_genesis' }), { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.deepEqual(state, before);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  const v = lotsView(engine, state, PA, 'item_test_axe', SH);
  assert.equal(v.length, 1);
  assert.deepEqual([v[0].qty, v[0].attrs.taint, v[0].attrs.enteredDay], [1, 0.25, 3]);
  assert.deepEqual(state.ledgerTotals.res_test_axe, { src_regrow: { cumulative: 1, usedByDay: [{ day: 3, used: 1 }] } });
  assert.deepEqual(auditLots(engine, state), []);
});

test('实例必填与取值域：耐用的缺 durability 拒、wearAnchorDay 缺省取当日；taint 必给且在 [0,1]；挂 comp_crafted 的缺 qualityTier、madeDay 拒，档位不在 quality 族拒；不适用的字段（刃上写 spoilage）拒；id 重复、前缀不是物品拒', () => {
  const { engine } = build();
  const state = at(3);
  const code = (over) => create(engine, state, over);
  // 耐久、腐坏及其锚点日不由建实例的写者写（§3.3）：写在 fields 里即拒；taint 归账本。
  assert.deepEqual(code({ fields: { durability: 1 } }), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(code({ fields: { spoilage: 0, rotAnchorDay: 3 } }), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(code({ taint: undefined }), { ok: false, code: 'E-DIM-REQUIRED-MISSING' });
  assert.deepEqual(code({ taint: 1.5 }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(code({ fields: { taint: 0.5 } }), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  const blade = { template: 'item_test_blade', id: 'item_inst_2' };
  assert.deepEqual(code({ ...blade, fields: { madeDay: 2 } }), { ok: false, code: 'E-DIM-REQUIRED-MISSING' });
  assert.deepEqual(code({ ...blade, fields: { qualityTier: 'quality_good' } }), { ok: false, code: 'E-DIM-REQUIRED-MISSING' });
  assert.deepEqual(code({ ...blade, fields: { madeDay: 2, qualityTier: 'quality_nope' } }), { ok: false, code: 'E-DIM-DOMAIN-ENUM' });
  assert.deepEqual(code({ ...blade, fields: { madeDay: 2, qualityTier: 'quality_good' } }), { ok: true });
  assert.deepEqual(state.itemInstances.item_inst_2, { template: 'item_test_blade', durability: 1, wearAnchorDay: 3, madeDay: 2, qualityTier: 'quality_good', taint: 0.25 });
  assert.deepEqual(code({ ...blade }), { ok: false, code: 'E-DIM-ID-DUPLICATE' });
  assert.deepEqual(code({ id: 'npc_x1' }), { ok: false, code: 'E-DIM-ID-FORMAT' });
});

test('实例偏离行（I-3）：偏离值落在 created.<id>.props，读 dim 得偏离值；实例维度、派生维度、未登记维度、取值域外都拒', () => {
  const { engine } = build();
  const state = at(0);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  const w = (dimension, value) => run(state, KERNEL, (s) => { writeItemDeviation(engine, s, 'item_inst_1', dimension, value); });
  assert.deepEqual(w('fragility', 0.2), { ok: true });
  assert.equal(dim(engine, state, 'item', 'item_inst_1', 'fragility').value, 0.2);
  assert.deepEqual(w('durability', 0.5), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(w('taint', 0.5), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(w('density', 2), { ok: false, code: 'E-DIM-DERIVED-WRITTEN' });
  assert.deepEqual(w('noSuchDim', 1), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(w('fragility', 2), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
});

// ---------- D-1 用损、D-2 自然劣化（锚点式） ----------

test('D-1 用损：耐磨取承担组（工作部铁 50），每次用损 0.05 ÷ 50 = 0.001；用 3 次 0.997（一次算 0.15 ÷ 50 = 0.003，不是三次各自截断）；写耐久与锚点日', () => {
  const { engine } = build();
  const state = at(3);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  assert.equal(wearStep(engine, state, 'item_inst_1', 'use').delta.value, 0.001);
  assert.equal(wearStep(engine, state, 'item_inst_1', 'worn').delta.value, 0.04);
  assert.deepEqual([...wearStep(engine, state, 'item_inst_1', 'damage').delta.gaps], ['damage_amount']);
  assert.throws(() => wearStep(engine, state, 'item_inst_1', 'bogus'), (e) => e.code === 'E-DIM-DOMAIN-ENUM');
  let w;
  assert.deepEqual(run(state, COND, (s) => { w = applyUse(engine, s, 'item_inst_1', 3); }), { ok: true });
  assert.deepEqual(w, { durability: 0.997, wearAnchorDay: 3 });
  assert.deepEqual([state.itemInstances.item_inst_1.durability, state.itemInstances.item_inst_1.wearAnchorDay], [0.997, 3]);
  // 用到见底：下限 0，不出负数。
  assert.deepEqual(run(state, COND, (s) => { w = applyUse(engine, s, 'item_inst_1', 1000); }), { ok: true });
  assert.equal(w.durability, 0);
  assert.deepEqual(run(state, COND, (s) => { applyUse(engine, s, 'item_inst_1', 0); }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
});

// 卷三乙 §4.10.5 例 1 铁斧：wearResistance 60、wearPerUse 0.002、dailyUses 40，lifeDays = 60 ÷ (0.002 × 40) = 750（卷二 §5.1 式）。
// durability 是 stockMode extScale、precision 8（李白 11-19 20:3x ③；卷二 §1.2、§3.3 第 6 条）：单次 0.002 ÷ 60 = 0.0000333…，10⁸ 标度向零截断为 0.00003333（10⁴ 标度会截成 0，工具永远磨不动）。
const ironAxe = (f) => { f.materials[IRON].wearResistance = 60; f.items.item_test_axe.wearPerUse = 0.002; };

test('③ durability 声明 extScale、precision 8；§4.10.5 铁斧：单次用损 0.00003333、一日 40 次 0.00133333，750 日逐日磨下来耐久只剩 0.0000025，一次磨 30000 次正好磨尽', () => {
  const { engine } = build(ironAxe);
  const def = engine.tables.get('item').doc.instanceDimensions.durability;
  assert.deepEqual([def.stockMode, def.precision], ['extScale', 8]);
  const state = at(3);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  assert.equal(wearStep(engine, state, 'item_inst_1', 'use').delta.value, 0.00003333);
  assert.equal(wearStep(engine, state, 'item_inst_1', 'worn').delta.value, 0.00133333);
  // 单次用损写进存储值：1 − 0.00003333 = 0.99996667（不是原样不动）。
  let w;
  assert.deepEqual(run(state, COND, (s) => { w = applyUse(engine, s, 'item_inst_1', 1); }), { ok: true });
  assert.deepEqual(w, { durability: 0.99996667, wearAnchorDay: 3 });
  // 寿命：从 1 起每日 40 次，750 日 = 750 × 0.00133333 = 0.9999975，剩 0.0000025；一次 30000 次 = 0.002 × 30000 ÷ 60 = 1，磨尽到 0。
  const fresh = at(3);
  assert.deepEqual(create(engine, fresh, {}), { ok: true });
  assert.deepEqual(run(fresh, COND, (s) => { for (let day = 0; day < 750; day += 1) applyUse(engine, s, 'item_inst_1', 40); }), { ok: true });
  assert.equal(fresh.itemInstances.item_inst_1.durability, 0.0000025);
  const once = at(3);
  assert.deepEqual(create(engine, once, {}), { ok: true });
  assert.deepEqual(run(once, COND, (s) => { w = applyUse(engine, s, 'item_inst_1', 30000); }), { ok: true });
  assert.equal(w.durability, 0);
});

test('D-2 自然劣化：腐蚀率 0.001（铁，只在含耐用份里取平均）、湿度曲线取 1：放 100 日损 0.1；存的值不动，读到 0.897；再用一次重设锚点（0.897 − 0.001 = 0.896，锚点日 103），再放 100 日读 0.796', () => {
  const { engine } = build();
  const state = at(3);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  assert.deepEqual(run(state, COND, (s) => { applyUse(engine, s, 'item_inst_1', 3); }), { ok: true });
  state.clock.minute = 103 * 1440;
  // 实例的所在处走持有边（装入关系未登记）、湿度要天气上下文（世界种子流未登记）：自然劣化的环境输入真实世界里还没有，读数按未知带缺口，不当 0 也不借常数。
  const d = durabilityOn(engine, state, 'item_inst_1', 103);
  assert.deepEqual([d.known, [...d.gaps]], [false, ['place_env_unbuilt']]);
  assert.equal(state.itemInstances.item_inst_1.durability, 0.997);
});

test('M5 可腐或耐用物缺锚点字段不当"不可腐"绕过：批次缺 spoilage 或 rotAnchorDay、实例缺耐久，读数按未知带缺口；整件不可腐的才是不适用；用损拒', () => {
  const { engine } = build();
  const state = at(3);
  const bare = stock(engine, state, PA, 2, {});
  const r = rotStep(engine, state, lotRef(PA, bare), 0);
  assert.deepEqual([r.spoilage.known, r.spoilage.applicable, [...r.spoilage.gaps], r.transform], [false, true, ['rot_anchor_missing'], null]);
  const ingot = stock(engine, state, PA, 1, {}, 'res_test_ingot');
  assert.equal(rotStep(engine, state, lotRef(PA, ingot, 'res_test_ingot'), 0).spoilage.applicable, false);
  assert.deepEqual(create(engine, state, { bare: true }), { ok: true });
  const d = durabilityOn(engine, state, 'item_inst_1', 3);
  assert.deepEqual([d.known, d.applicable, [...d.gaps]], [false, true, ['wear_anchor_missing']]);
  assert.deepEqual(run(state, COND, (s) => { applyUse(engine, s, 'item_inst_1', 1); }), { ok: false, code: 'E-DIM-UNKNOWN-READ' });
  // 初值只写一次、取值域 [0,1]
  assert.deepEqual(run(state, COND, (s) => { initDurability(engine, s, 'item_inst_1', 1.5); }), { ok: false, code: 'E-DIM-DOMAIN-RANGE' });
  assert.deepEqual(run(state, COND, (s) => { initDurability(engine, s, 'item_inst_1', 0.5); }), { ok: true });
  assert.deepEqual(run(state, COND, (s) => { initDurability(engine, s, 'item_inst_1', 0.9); }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual([state.itemInstances.item_inst_1.durability, state.itemInstances.item_inst_1.wearAnchorDay], [0.5, 3]);
  // 建实例的写者不写耐久：别的文件做节点也不能经 writePath 写（声明写者核对）
  assert.deepEqual(run(state, LOTS, (s) => { initDurability(engine, s, 'item_inst_1', 0.9); }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
});

function reanchorWearOf(engine, state) {
  let r;
  assert.deepEqual(run(state, COND, (s) => { r = reanchorWear(engine, s, 'item_inst_1'); }), { ok: true });
  return r;
}

test('D-2 读不出自然劣化（环境未接线）：读数按未知带缺口，不当 0；用损只从存的值里扣、锚点日不动（与重设锚点同一结果，不编自然劣化量）；条件变化重设锚点不写', () => {
  const { engine } = build();
  const state = at(3);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  state.clock.minute = 103 * 1440;
  const d = durabilityOn(engine, state, 'item_inst_1', 103);
  assert.deepEqual([d.known, [...d.gaps]], [false, ['place_env_unbuilt']]);
  assert.deepEqual(run(state, COND, (s) => { applyUse(engine, s, 'item_inst_1', 1); }), { ok: true });
  assert.deepEqual([state.itemInstances.item_inst_1.durability, state.itemInstances.item_inst_1.wearAnchorDay], [0.999, 3]);
  assert.equal(reanchorWearOf(engine, state), false);
});

// ---------- K-1 容器装入 ----------

const jar = (eng, state) => { assert.deepEqual(create(eng, state, { id: 'item_inst_jar', template: 'item_test_jar' }), { ok: true }); };
// 筐是木的：木料不挂耐用组件类，筐实例没有耐久维度（不要求、也不许写）。
const basket = (eng, state) => { assert.deepEqual(create(eng, state, { id: 'item_inst_bsk', template: 'item_test_basket', fields: {} }), { ok: true }); };

test('K-1：物态条目 needsHolds 为真的东西（水，可能物态只有液）须装进 holdsLiquid 的容器：罐可、筐不可（leak，不因筐没封口而拒，罐也不因封口才收）；accepts 非空须相交（铁锭不属液也不属植物质：accepts）', () => {
  const { engine } = build();
  const state = at(0);
  jar(engine, state);
  basket(engine, state);
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', 'item_test_water', 5), { ok: true, reason: null });
  assert.deepEqual(canContain(engine, state, 'item_inst_bsk', 'item_test_water', 5), { ok: false, reason: 'leak' });
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', 'item_test_ingot', 1), { ok: false, reason: 'accepts' });
  // 谷物的本源成分是植物质，在罐的 accepts 里
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', 'item_test_grain', 1), { ok: true, reason: null });
});

test('K-1 体积与载重：罐容 20 L，谷物每件 1 L 1 kg：20 件恰满可装、21 件 volume；筐容 50 L 限重 30 kg，铁锭 40 kg 体积 10 L：load；物态未知（冰：可能物态固与液）不许装入 matter_unknown', () => {
  const { engine } = build();
  const state = at(0);
  jar(engine, state);
  basket(engine, state);
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', 'item_test_grain', 20), { ok: true, reason: null });
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', 'item_test_grain', 21), { ok: false, reason: 'volume' });
  assert.deepEqual(canContain(engine, state, 'item_inst_bsk', 'item_test_ingot', 1), { ok: false, reason: 'load' });
  assert.deepEqual(canContain(engine, state, 'item_inst_bsk', 'item_test_ingot', 0.5), { ok: true, reason: null });
  assert.deepEqual(canContain(engine, state, 'item_inst_bsk', 'item_test_icecube', 1), { ok: false, reason: 'matter_unknown' });
  assert.throws(() => canContain(engine, state, 'item_inst_bsk', 'item_test_grain', 0), (e) => e.code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => canContain(engine, state, 'item_inst_nope', 'item_test_grain', 1), (e) => e.code === 'E-DIM-REF-MISSING');
});

test('K-1：批次引用也能作装入对象（取批次所属资源种类的物品）；容器视图今无内容物（持有种类里没有登记装入关系，K-2），自由容积与限重等于容量', () => {
  const { engine } = build();
  const state = at(0);
  jar(engine, state);
  const k = stock(engine, state, PA, 30, { spoilage: 0, rotAnchorDay: 0 });
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', lotRef(PA, k), 20), { ok: true, reason: null });
  assert.deepEqual(canContain(engine, state, 'item_inst_jar', lotRef(PA, k), 25), { ok: false, reason: 'volume' });
  assert.deepEqual(containerView(engine, state, 'item_inst_jar'), { contents: [], usedL: 0, usedKg: 0, freeL: 20, freeKg: 30 });
  assert.throws(() => containerView(engine, state, 'item_inst_nope'), (e) => e.code === 'E-DIM-REF-MISSING');
});

test('K-2 容器不作账本持有人：以容器实例为持有人入账即拒（物品不在持有人类型里），不开账户', () => {
  const { engine } = build();
  const state = at(0);
  jar(engine, state);
  const before = structuredClone(state);
  const r = run(state, KERNEL, (s) => { post(engine, s, { legs: [{ account: { holder: 'item_inst_jar', purpose: SH, resource: { kind: 'res_test_grain' } }, delta: 1, lot: { attrs: { enteredDay: 0, taint: 0 } } }, { flow: 'src_regrow', kind: 'res_test_grain', qty: 1 }], reason: 'verb_test' }); });
  assert.equal(r.ok, false);
  assert.deepEqual(state, before);
});

test('K-8 批次校验：purports.item 非空须是物品模板（实例 id、人物、未登记代号都不是）、taint ∈ [0,1]；批次键与余额行一一对应（缺一报 E-DIM-REF-MISSING）', () => {
  const { engine } = build();
  const state = at(0);
  const ok = stock(engine, state, PA, 1, { purports: { item: 'item_test_axe', forgeryGrade: 5 } });
  assert.deepEqual(auditLots(engine, state), []);
  const bad = stock(engine, state, PA, 1, { purports: { item: PB, forgeryGrade: 5 } });
  const missing = stock(engine, state, PA, 1, { purports: { item: 'item_not_registered', forgeryGrade: 5 } });
  const rows = auditLots(engine, state).map((x) => [x.code, x.path.split('.').pop()]);
  assert.deepEqual(rows, [['E-DIM-REF-MISSING', bad], ['E-DIM-REF-MISSING', missing]].sort((a, b) => (a[1] < b[1] ? -1 : 1)));
  assert.ok(!rows.some(([, k]) => k === ok));
  delete state.accounts[PA][SH].res_test_grain[ok];
  assert.ok(auditLots(engine, state).some((x) => x.code === 'E-DIM-REF-MISSING' && x.path.endsWith(ok)));
});

test('实例读入口：instanceView 给 taint、品质档等存的字段与耐久、腐坏的今日值；不是实例返回 null', () => {
  const { engine } = build();
  const state = at(3);
  assert.deepEqual(create(engine, state, {}), { ok: true });
  const v = instanceView(engine, state, 'item_inst_1');
  assert.deepEqual([v.id, v.template, v.taint, v.durability.value, v.spoilage], ['item_inst_1', 'item_test_axe', 0.25, 1, null]);
  assert.equal(instanceView(engine, state, 'item_inst_none'), null);
});

test('规则表校验（P-7）：stages 的 minSpoilage 须严格递增且首档为 0；tempCurve 单调不降、不取负值；envCurve 不取负值，否则加载失败', () => {
  const load = (rot, wear) => {
    const f = baseFixture();
    f.materials[GRAIN] = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate: 0.04, moisture: 0.12, energyDensity: 15 };
    f.items = itemsFixture();
    f.rulesExtra = { rot, wear };
    return loadItemWorld(f);
  };
  const ok = load({ stages: [{ minSpoilage: 0 }, { minSpoilage: 0.5 }], tempCurve: [[0, 0], [10, 1]] }, { envCurve: [[0, 0], [1, 2]] });
  assert.ok(ok.ok, JSON.stringify(ok.messages));
  const has = (r, code) => r.errors.some(([c]) => c === code);
  assert.ok(has(load({ stages: [{ minSpoilage: 0.1 }, { minSpoilage: 0.5 }] }, {}), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ stages: [{ minSpoilage: 0 }, { minSpoilage: 0.5 }, { minSpoilage: 0.5 }] }, {}), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ tempCurve: [[0, 1], [10, 0.5]] }, {}), 'E-DIM-DOMAIN-CURVE'));
  assert.ok(has(load({ tempCurve: [[0, -1], [10, 1]] }, {}), 'E-DIM-DOMAIN-CURVE'));
  assert.ok(has(load({}, { envCurve: [[0, 1], [1, -1]] }), 'E-DIM-DOMAIN-CURVE'));
});

// ---------- P-4 坏透结算与 itemRot 钩子；K-9 分户装载 ----------

test('itemRot 钩子登记（environment 阶段、文件 item-lots.mjs、节拍一日）；坏透结算：已坏透的整件可腐批次整批记入 sink_decay 汇，新鲜的与不可腐的不动，总量守恒、K-8 审计过', () => {
  assert.equal(advanceHook('itemRot').file, 'item-lots.mjs');
  const { engine } = build();
  assert.deepEqual(engine.rules.clock.cadence, { itemRot: 1440, rebaseBubble: 1440 }); // 6-27 另登记 rebaseBubble（卷二十七 R27-1.16）
  const state = at(0);
  const book = { entries: [] };
  installEventLog(book);
  const rotten = stock(engine, state, PA, 10, { spoilage: 0, rotAnchorDay: 0 });
  const ingot = stock(engine, state, PA, 1, {}, 'res_test_ingot');
  state.clock.minute = 30 * 1440; // 30 × 0.04 = 1.2 封顶 1：坏透
  const fresh = stock(engine, state, PA, 5, { spoilage: 0, rotAnchorDay: 30 });
  let n;
  assert.deepEqual(run(state, LOTS, (s) => { n = settleRotted(engine, s); }), { ok: true });
  assert.equal(n, 1);
  // M4：坏透那一笔发 verb_item_spoiled（lot 载荷形状：持有人、物品、用途、批次键）。
  assert.equal(book.entries.length, 1);
  assert.equal(book.entries[0].verb, 'verb_item_spoiled');
  assert.deepEqual({ instance: book.entries[0].payload.instance, lot: book.entries[0].payload.lot }, { instance: null, lot: { holder: PA, item: 'item_test_grain', purpose: SH, lotKey: rotten } });
  assert.equal(state.accounts[PA][SH].res_test_grain[rotten], 0);
  assert.equal(state.accounts[PA][SH].res_test_grain[fresh], 5);
  assert.equal(state.accounts[PA][SH].res_test_ingot[ingot], 1);
  assert.deepEqual(state.ledgerTotals.res_test_grain.sink_decay.cumulative, 10);
  assert.deepEqual(run(state, LOTS, (s) => { n = settleRotted(engine, s); }), { ok: true });
  assert.equal(n, 0);
  assert.deepEqual(auditLots(engine, state), []);
});

// ---------- K-3 实例批次不合并；实例批次键 lot_i_<实例id>（勘误 1119k13） ----------

test('K-3 实例批次永不合并：PA 建斧 a、b，PB 建斧 c，PA 转 2 件给 PB，PB 名下三个实例批次各数量 1，键由实例 id 派生，不占批次计数器；审计过', () => {
  const { engine } = build();
  const state = at(3);
  assert.deepEqual(create(engine, state, { id: 'item_inst_1', holder: PA }), { ok: true });
  assert.deepEqual(create(engine, state, { id: 'item_inst_2', holder: PA }), { ok: true });
  assert.deepEqual(create(engine, state, { id: 'item_inst_3', holder: PB }), { ok: true });
  assert.equal(state.ledgerCounters, undefined);
  let out;
  assert.deepEqual(run(state, LOTS, (s) => { out = transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_axe', qty: 2, reason: 'verb_test' }); }), { ok: true });
  assert.deepEqual(out.merged, []);
  assert.deepEqual(out.moved.map((m) => [m.from, m.to, m.qty]), [['lot_i_item_inst_1', 'lot_i_item_inst_1', 1], ['lot_i_item_inst_2', 'lot_i_item_inst_2', 1]]);
  assert.deepEqual(Object.entries(state.accounts[PB][SH].res_test_axe), [['lot_i_item_inst_3', 1], ['lot_i_item_inst_1', 1], ['lot_i_item_inst_2', 1]]);
  assert.deepEqual(lotsView(engine, state, PB, 'item_test_axe', SH).map((x) => [x.lotKey, x.qty]), [['lot_i_item_inst_1', 1], ['lot_i_item_inst_2', 1], ['lot_i_item_inst_3', 1]]);
  assert.deepEqual(lotsView(engine, state, PA, 'item_test_axe', SH), []);
  assert.equal(Object.keys(state.stockLots[PB][SH].res_test_axe).length, 3);
  assert.equal(state.accounts[PA][SH].res_test_axe.lot_i_item_inst_1, undefined);
  assert.equal(state.stockLots[PA][SH].res_test_axe.lot_i_item_inst_1, undefined);
  assert.deepEqual(auditLots(engine, state), []);
  // 散货批次照旧合并（同键同档、进度差不超上限）。
  const g1 = stock(engine, state, PA, 5, { spoilage: 0, rotAnchorDay: 3 });
  stock(engine, state, PB, 5, { spoilage: 0, rotAnchorDay: 3 });
  assert.deepEqual(run(state, LOTS, (s) => { out = transferGoods(engine, s, { from: { holder: PA, purpose: SH }, to: { holder: PB, purpose: SH }, item: 'item_test_grain', qty: 5, reason: 'verb_test' }); }), { ok: true });
  assert.equal(out.merged.length, 1);
  assert.equal(state.accounts[PA][SH].res_test_grain[g1], 0);
  assert.deepEqual(lotRows(state, PB).map((r) => r[1]), [10]);
});

test('K-3 实例批次 mergeLots 拒（整类条件，不看属性）；lotsUnmergeable 两键都要给', () => {
  const { engine } = build();
  const state = at(3);
  create(engine, state, { id: 'item_inst_1' });
  create(engine, state, { id: 'item_inst_2' });
  const r = run(state, KERNEL, (s) => { mergeLots(engine, s, { holder: PA, purpose: SH, kind: 'res_test_axe', into: 'lot_i_item_inst_1', from: 'lot_i_item_inst_2' }); });
  assert.deepEqual(r, { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.equal(state.accounts[PA][SH].res_test_axe.lot_i_item_inst_2, 1);
  assert.throws(() => lotsUnmergeable({}, {}), (e) => codeOf(e) === 'E-DIM-STRUCT-FIELD');
  assert.equal(typeof lotsUnmergeable({}, {}, 'lot_i_a', 'lot_1'), 'string');
  assert.equal(lotsUnmergeable({}, {}, 'lot_0', 'lot_1'), null);
});

test('K-8 实例批次键审计：多一件（键里的实例不存在）、少一件（实例没有自己那一批）、数量不为 1、两处账户同键，均报已登记码；序号键仍只核序号', () => {
  const { engine } = build();
  const state = at(3);
  create(engine, state, { id: 'item_inst_1' });
  assert.deepEqual(auditLots(engine, state), []);
  // 多一件：造一批键指向不存在实例的批次。
  const extra = structuredClone(state);
  extra.accounts[PA][SH].res_test_axe.lot_i_item_inst_9 = 1;
  extra.stockLots[PA][SH].res_test_axe.lot_i_item_inst_9 = { enteredDay: 3 };
  assert.deepEqual(auditLots(engine, extra).map((x) => [x.code, x.path.split('.').pop()]), [['E-DIM-REF-MISSING', 'lot_i_item_inst_9']]);
  // 少一件：实例行在、批次不在。
  const lacking = structuredClone(state);
  lacking.itemInstances.item_inst_2 = { template: 'item_test_axe' };
  assert.deepEqual(auditLots(engine, lacking).map((x) => [x.code, x.path.split('.').pop()]), [['E-DIM-REF-MISSING', 'item_inst_2']]);
  // 数量不为 1。
  const two = structuredClone(state);
  two.accounts[PA][SH].res_test_axe.lot_i_item_inst_1 = 2;
  assert.deepEqual(auditLots(engine, two).map((x) => x.code), ['E-DIM-DOMAIN-RANGE']);
  // 同键出现在两个账户。
  const dup = structuredClone(state);
  dup.accounts[PB] = { [SH]: { res_test_axe: { lot_i_item_inst_1: 1 } } };
  dup.stockLots[PB] = { [SH]: { res_test_axe: { lot_i_item_inst_1: { enteredDay: 3 } } } };
  assert.ok(auditLots(engine, dup).some((x) => x.code === 'E-DIM-ID-DUPLICATE'));
  // 序号键不能写成实例键形、也不能借序号读回：lot_i_ 开头的键不按序号核。
  const serial = structuredClone(state);
  serial.accounts[PA][SH].res_test_grain = { lot_zz: 1 };
  serial.stockLots[PA][SH].res_test_grain = { lot_zz: { enteredDay: 3 } };
  assert.deepEqual(auditLots(engine, serial).map((x) => x.code), ['E-DIM-ID-FORMAT']);
  // 错种类：斧实例的批次记在粮食种类名下。
  const wrongKind = structuredClone(state);
  wrongKind.accounts[PA][SH].res_test_grain = { lot_i_item_inst_1: 1 };
  wrongKind.stockLots[PA][SH].res_test_grain = { lot_i_item_inst_1: { enteredDay: 3 } };
  delete wrongKind.accounts[PA][SH].res_test_axe;
  delete wrongKind.stockLots[PA][SH].res_test_axe;
  assert.deepEqual(auditLots(engine, wrongKind).map((x) => x.code), ['E-DIM-REF-MISSING']);
  // 实例已终止而批次仍有余额。
  const dead = structuredClone(state);
  dead.terminated = { item_inst_1: { minute: 0 } };
  assert.deepEqual(auditLots(engine, dead).map((x) => x.code), ['E-TERM-RESIDUE']);
});

test('K-9 loadPlan：须装进容器的批次（水，needsHolds）按物品代号升序、容器按 id 升序逐件装到装不下；罐容 20 L、水每件 1.25 L，装 16 件（恰 20 L），余 14 件留下；筐盛不了液体；不需容器的批次不出现', () => {
  const { engine } = build();
  const state = at(0);
  jar(engine, state);
  basket(engine, state);
  const plan = loadPlan(engine, state, [{ item: 'item_test_water', qty: 30 }, { item: 'item_test_grain', qty: 5 }], ['item_inst_jar', 'item_inst_bsk']);
  assert.deepEqual(plan, { placed: [{ container: 'item_inst_jar', item: 'item_test_water', qty: 16 }], left: [{ item: 'item_test_water', qty: 14 }] });
});