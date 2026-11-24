// 验收测试（出题方：Claude Haiku 5.5，标识 haiku-test-c3；未参与写码与审卡）。
// 卡：公共部件修理 C3「事务、账本与持有」。只经公开入口测行为，不测实现细节；期望值照卷文公式手算成字面量。
// 前提（不读仓库当前数据）：临时世界经 tests/kernel/item-world.mjs 的夹具加载，账本数量用 post 发生，批次键由账本发出。
//
// T1 库存读数一致 —— 依据：卷六:354（读 balance、accountsOf、stockIn；写只 post）；卷六:104（物品类资源键是批次）；卷三乙:267（批次只存属性，数量是账本余额）。
//    测什么：同一批次经 lotsView 读到的数量，与 balance、accountsOf 读到的相同；已清零批次不列；stockIn 有候选时按 E-DIM-UNKNOWN-READ 拒读（不当作 0 放过）。
//    修前：预期已绿（lotsView 与 balance 直读同一份账户状态），留作对照。
//
// T2 持有边现役 —— 依据：卷十八:461（until 为整数分钟或空）；卷十八:526（建立时带预定到期的边，until 即该预定值，仍是现役）；卷十八:523（终止只关现役）。
//    测什么：openHoldingsOfKind 列出的现役边，与终止残余核对 terminationResidue 认定的现役边一致；until 为未来时刻的边是现役；until 已过的边不是。
//    修前：预期已绿（两处都经 edgeIsActive），留作对照。
//
// T3 批次键 —— 依据：卷三乙:267（批次键形状为 lot_ 加全局递增序号，base36 小写）；卷六:104（物品类资源键即批次键）；卷二:291（代号文法 ^[a-z][a-z0-9_]{1,47}$，总长不超过 48）。
//    测什么（只经账本公开入口 post、批次读口 lotsView）：账本发出的键是规范写法；非规范写法（前导零、小数点、空序号、非 base36 字符、超长）不能寻址已有批次，经 post 出账被拒且余额不动。
//    修前：只经公开入口测，不导入任何内部函数（上一版直接导入 item-state 的 lotSeq，修后该函数不存在，已改）。修前的红/绿结果见出题.md。
//
// T4 份额求和定点 —— 依据：卷二:406（份额之和为 1 的口径：定点，和恒等于 SCALE）；卷二:1392（SCALE = 10⁴，定点向零截断）；卷十八:342（shareSum：同一标的现役边的 share 之和须等于它）；卷十八:470（share 为定点数）。
//    测什么：100 份各 0.01 合计 10000 = SCALE，提交通过；0.3333、0.3333、0.3334 合计 10000，提交通过；0.3333 三份合计 9999，拒 E-HK-PROTOCOL。
//    修前红：checkShareSums 用浮点加 Number.EPSILON 容差判等，100 份 0.01 的浮点和超出该容差，提交被拒，断言会失败。
//
// A 腐坏枚举（回归守护）—— 依据：卷三乙 腐坏条；卷六:354。测什么：同用途下有货物批次（已坏透）与非货物账户时，rottenLots 不报错、只列货物批次。
//    修前：主线绿；写码分支 4c4cbc0fe 上红（只读副本实测，报 E-DIM-STRUCT-FIELD）；修后 51be1e726 绿。
//
// B 份额精度（回归守护 B1、主线红 B2）—— 依据：卷二:406（份额定点 4 位）；卷二:1392（输入先转定点，第 5 位起截断）；卷十八:342（shareSum）。卷文没有明写精度外输入拒收还是量化，
//    断言只取写明的下限：精度外份额不得静默放行（要么拒收，要么存下的值是 4 位定点）。B1（0.50009 + 0.5）修前绿；B2（三条 0.33333 + 0.00001）修前红，主线浮点容差下被静默放行，见出题.md。
//
// T5 不出：卷文没有"事务日志"的明文（卷六:354 只规定写只经 post），推不出"事务日志有对应记录"，故本文件不出该条，理由记入出题.md。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share } from '../../kernel/item-world.mjs';
import { miniClimatePlaceDoc } from '../../kernel/mini-place-world.mjs';
import { installVocab } from '../../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../../server-plugin/kernel/report.mjs';
import { codeOf } from '../../../server-plugin/kernel/errors.mjs';
import { post, balance, accountsOf, stockIn } from '../../../server-plugin/kernel/ledger.mjs';
import { lotsView, rottenLots } from '../../../server-plugin/kernel/item-state.mjs';
import { openHolding, openHoldingsOfKind, installHoldingEngine } from '../../../server-plugin/kernel/holdings.mjs';
import { terminationResidue } from '../../../server-plugin/kernel/terminate.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
useReportSink(() => {});

const PA = 'loc_county_xichui_longqu';
const PB = 'loc_hw';
const SH = 'purpose_test_shelf';
const GRAIN = 'mat_test_grain';
const KIND = 'res_test_grain';
const ASSET = 'res_test_asset';
const HK = 'hk_test_share';
const KERNEL = { file: 'kernel/ledger.mjs', node: 'test_kernel' };
const HOLD = { file: 'tests/acceptance/ds-c3-ledger/c3-ledger-reads.test.mjs', node: 'test_c3_holdings' };
const PERSONS = Array.from({ length: 100 }, (_, i) => `npc_${String(i).padStart(2, '0')}`);

function holdingRow() {
  return {
    id: HK, hyper: null, from: ['agent'], to: ['thing'], exclusive: false,
    gone: 'ho_close', vacated: 'ho_close', defected: null, subjectEnd: 'send_close',
    concluded: false, functional: false, membership: false, headship: false, carriesRel: false,
    conduct: 0, conductBack: 0, adopt: 0, pins: 'pside_none',
    intimate: false, bodyControl: false, holderMax: null, succeedBy: null, excludes: false,
    grantsEntry: false, entryRankMax: null, visibility: 'public', contest: null, capacityKey: null,
    transferable: false, incompatible: [], grants: [], hooks: [], termsKeys: ['share'], shareSum: 1,
    grantedBy: [], domicile: false, holdWhile: null, revival: null, admission: null, uniqueTriple: false,
  };
}

// 临时世界：一种可腐粮食（资源种类 KIND 指向物品 item_test_grain）、一种铁锭、两个地点持有人、一个用途、一个持有种类。
function build() {
  const f = baseFixture();
  f.materials[GRAIN] = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate: 0.04, moisture: 0.12, energyDensity: 15 };
  f.items = { item_test_grain: itemRow(1, [share('mgroup_body', GRAIN, 1)]), item_test_ingot: itemRow(40, [share('mgroup_body', 'mat_test_iron', 1)]) };
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
  index.set(KIND, { family: 'resource', prefix: 'res_', entry: { item: 'item_test_grain' } });
  index.set(HK, { family: 'holding_kind', prefix: 'hk_', entry: holdingRow() });
  const vocab = { families: W.vocab.families, index };
  const idIndex = new Map([...W.idIndex, ...PERSONS.map((p) => [p, 'person'])]);
  installVocab({ vocab, idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  rules.economyResources[KIND] = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_consume', 'sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  // 非货物账户：资源种类不指向任何物品模板（同建筑份额一类，键是设施实例）。
  index.set(ASSET, { family: 'resource', prefix: 'res_', entry: {} });
  rules.economyResources[ASSET] = { family: 'resfam_asset', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_consume'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  return { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_c3_seed' } };
}

// 入账一批粮，批次键由账本发出，返回该键。
function stock(engine, state, holder, qty, attrs = { spoilage: 0, rotAnchorDay: 0 }) {
  let key;
  const r = runTransaction(state, KERNEL, (s) => {
    const res = post(engine, s, { legs: [{ account: { holder, purpose: SH, resource: { kind: KIND } }, delta: qty, lot: { attrs: { enteredDay: 0, taint: 0, ...attrs } } }, { flow: 'src_regrow', kind: KIND, qty }], reason: 'verb_test' });
    key = res.lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return key;
}

// 出掉一批中的 qty（经 post 的出账腿，资源键指名该批次）。
function drain(engine, state, holder, key, qty) {
  const r = runTransaction(state, KERNEL, (s) => {
    post(engine, s, { legs: [{ account: { holder, purpose: SH, resource: { kind: KIND, key } }, delta: -qty }, { flow: 'sink_consume', kind: KIND, qty }], reason: 'verb_test' });
  });
  assert.deepEqual(r, { ok: true });
}

test('T1 库存读数一致：同一批次经 lotsView 读到的数量，与 balance、accountsOf 相同；已清零批次不列；stockIn 有候选时拒读（卷六:354）', () => {
  const engine = build();
  const state = { clock: { minute: 5 * 1440, seq: 0 } };
  const a = stock(engine, state, PA, 3);
  const b = stock(engine, state, PA, 2);
  const c = stock(engine, state, PA, 4);
  const d = stock(engine, state, PB, 5);
  drain(engine, state, PA, b, 2);
  const expected = { [PA]: [[a, 3], [c, 4]], [PB]: [[d, 5]] };
  for (const holder of [PA, PB]) {
    const view = lotsView(engine, state, holder, 'item_test_grain', SH).map((x) => [x.lotKey, x.qty]);
    assert.deepEqual(view, expected[holder]);
    for (const [key, qty] of view) assert.equal(balance(engine, state, holder, { kind: KIND, key }, SH), qty);
    const nonZero = accountsOf(engine, state, holder, { purpose: SH }).filter((x) => x.balance !== 0).map((x) => [x.resource.key, x.balance]);
    assert.deepEqual(nonZero, expected[holder]);
  }
  assert.equal(balance(engine, state, PA, { kind: KIND, key: b }, SH), 0);
  assert.throws(() => stockIn(engine, state, PA, { kind: KIND }), (e) => codeOf(e) === 'E-DIM-UNKNOWN-READ');
});

test('T2 持有边现役：openHoldingsOfKind 与终止残余核对认定的现役边一致；until 为未来时刻仍是现役，until 已过的不是（卷十八:461、:526、:523）', () => {
  const engine = build();
  const edge = (holder, until, s) => ({ holder, kind: HK, subject: 'item_test_grain', terms: { since: 0, until, share: s } });
  const state = {
    clock: { minute: 10, seq: 0 },
    holdings: {
      npc_00: { edge_1: edge('npc_00', null, 0.4), edge_2: edge('npc_00', 100, 0.3) },
      npc_01: { edge_3: edge('npc_01', 5, 0.3) },
    },
  };
  assert.deepEqual(openHoldingsOfKind(state, HK).map((e) => e.id), ['edge_1', 'edge_2']);
  const residue = (holder) => terminationResidue(engine, state, holder).filter((x) => x.startsWith('holdings:')).map((x) => x.slice('holdings:'.length)).sort();
  assert.deepEqual(residue('npc_00'), ['edge_1', 'edge_2']);
  assert.deepEqual(residue('npc_01'), []);
});

test('T3 批次键：账本发出的键是规范写法；非规范写法经 post 出账被拒，原批次余额不动（卷三乙:267；卷六:104；卷二:291）', () => {
  const engine = build();
  const state = { clock: { minute: 0, seq: 0 } };
  const k1 = stock(engine, state, PA, 3);
  const k2 = stock(engine, state, PA, 2);
  assert.match(k1, /^lot_[0-9a-z]+$/);
  assert.match(k2, /^lot_[0-9a-z]+$/);
  assert.equal(lotsView(engine, state, PA, 'item_test_grain', SH).map((x) => x.lotKey).join(','), [k1, k2].join(','));
  const aliases = [`lot_0${k1.slice(4)}`, 'lot_1.5', 'lot_', 'lot_A1', `${k1}-2`, `lot_${'1'.repeat(45)}`];
  for (const bad of aliases) {
    const r = runTransaction(state, KERNEL, (s) => {
      post(engine, s, { legs: [{ account: { holder: PA, purpose: SH, resource: { kind: KIND, key: bad } }, delta: -1 }, { flow: 'sink_consume', kind: KIND, qty: 1 }], reason: 'verb_test' });
    });
    assert.equal(r.ok, false, `should reject ${bad}`);
  }
  assert.equal(balance(engine, state, PA, { kind: KIND, key: k1 }, SH), 3);
  assert.equal(balance(engine, state, PA, { kind: KIND, key: k2 }, SH), 2);
});

function openShares(engine, state, subject, shares) {
  return runTransaction(state, HOLD, (s) => {
    for (const [holder, share0] of shares) openHolding(engine, s, { holdingKind: HK, holder, subject, terms: { share: share0 }, cause: 'verb_test' });
  });
}

// T4 三条分开：各自独立的状态，互不遮挡。
function shareEngine() {
  const engine = build();
  installHoldingEngine(engine);
  installEventLog({ entries: [] });
  return engine;
}

test('T4a 份额求和定点：100 份各 0.01 合计 10000（= SCALE）提交通过，不靠浮点容差（卷二:406、:1392；卷十八:342）', () => {
  const engine = shareEngine();
  const hundred = PERSONS.map((p) => [p, 0.01]);
  assert.deepEqual(openShares(engine, { clock: { minute: 10, seq: 0 } }, 'item_test_grain', hundred), { ok: true });
});

test('T4b 份额求和定点：0.3333、0.3333、0.3334 合计 10000（= SCALE）提交通过（卷二:406、:1392；卷十八:342）', () => {
  const engine = shareEngine();
  const third = [['npc_00', 0.3333], ['npc_01', 0.3333], ['npc_02', 0.3334]];
  assert.deepEqual(openShares(engine, { clock: { minute: 10, seq: 0 } }, 'item_test_ingot', third), { ok: true });
});

test('T4c 份额求和定点：0.3333 三份合计 9999（不足 SCALE 10000）拒 E-HK-PROTOCOL（卷二:406；卷十八:342）', () => {
  const engine = shareEngine();
  const short = [['npc_00', 0.3333], ['npc_01', 0.3333], ['npc_02', 0.3333]];
  assert.deepEqual(openShares(engine, { clock: { minute: 10, seq: 0 } }, 'item_test_ingot', short), { ok: false, code: 'E-HK-PROTOCOL' });
});

// A 腐坏枚举（回归守护）：修前绿；写码分支 4c4cbc0fe 上红（审卡 87b494052 指出）；修后应绿。
// 同一主体、同用途、同种类下有两处建筑份额（两个非批次键的账户键），再加一批已坏透的货物：rottenLots 不报错，只列货物的坏透批次。
// 依据：卷三乙 腐坏条（坏透即进度 1，转化提案 to sink，见 tests/kernel/item-lots.test.mjs 同款前提）；卷六:354（读只经公开读口）。
test('A 腐坏枚举：同主体同用途有两处非货物账户（建筑份额，键非批次键）加货物批次，rottenLots 不报错，只列货物的坏透批次（卷三乙腐坏条；卷六:354）', () => {
  const engine = build();
  const state = { clock: { minute: 0, seq: 0 } };
  const rotten = stock(engine, state, PA, 3);
  const r = runTransaction(state, KERNEL, (s) => {
    post(engine, s, { legs: [
      { account: { holder: PA, purpose: SH, resource: { kind: ASSET, key: 'fac_test_a' } }, delta: 1 },
      { account: { holder: PA, purpose: SH, resource: { kind: ASSET, key: 'fac_test_b' } }, delta: 1 },
      { flow: 'src_regrow', kind: ASSET, qty: 2 },
    ], reason: 'verb_test' });
  });
  assert.deepEqual(r, { ok: true });
  assert.equal(balance(engine, state, PA, { kind: ASSET, key: 'fac_test_a' }, SH), 1);
  assert.equal(balance(engine, state, PA, { kind: ASSET, key: 'fac_test_b' }, SH), 1);
  state.clock.minute = 30 * 1440;
  const list = rottenLots(engine, state).map((x) => [x.account.holder, x.account.purpose, x.account.kind, x.lotKey, x.qty]);
  assert.deepEqual(list, [[PA, SH, KIND, rotten, 3]]);
});

// B 份额精度（回归守护）：修前绿；写码分支 4c4cbc0fe 上红（审卡 87b494052 指出）；修后应绿。
// 依据：卷二:406（份额定点 4 位，"各条份额 fixedUnits 转定点"）；卷二:1392（一切输入先转定点，小数第 5 位起截断）；卷十八:342（shareSum 合计须等于它）。
// 卷文没有明写"持有 terms.share 的精度外输入拒收还是量化"，故断言只取写明的下限：精度外份额不得静默放行，即要么拒收，要么存下的值已是 4 位定点。
function assertNoSilentOffPrecision(r, state) {
  if (r.ok !== true) return;
  for (const holder of Object.keys(state.holdings)) {
    for (const rec of Object.values(state.holdings[holder])) {
      const v = rec.terms.share * 10000;
      assert.ok(Math.abs(v - Math.round(v)) < 1e-6, `share ${rec.terms.share} stored with more than 4 decimals`);
    }
  }
}

test('B1 份额精度：0.50009 与 0.5 两条不得被当作合计恰为 1 静默放行（卷二:406；卷二:1392；卷十八:342）', () => {
  const engine = shareEngine();
  const state = { clock: { minute: 10, seq: 0 }, holdings: {} };
  const r = openShares(engine, state, 'item_test_grain', [['npc_00', 0.50009], ['npc_01', 0.5]]);
  assertNoSilentOffPrecision(r, state);
});

test('B2 份额精度：三条 0.33333 与一条 0.00001 合计恰为 1（十进制），不得静默放行精度外份额（卷二:406；卷二:1392；卷十八:342）', () => {
  const engine = shareEngine();
  const state = { clock: { minute: 10, seq: 0 }, holdings: {} };
  const r = openShares(engine, state, 'item_test_ingot', [['npc_00', 0.33333], ['npc_01', 0.33333], ['npc_02', 0.33333], ['npc_03', 0.00001]]);
  assertNoSilentOffPrecision(r, state);
});
