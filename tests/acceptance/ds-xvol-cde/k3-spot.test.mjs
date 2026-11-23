// 验收测试（出题方 Claude Sonnet 5.5 中档，写码方不得看、不得改）：跨卷判定 K-3 —— 判同键含批次字段 spot，落点不同的批次不合并。
// 依据：卷三乙 §2.3 :285（批次 `spot` 行，封卷后勘误 1121k2："落点不同的批次不合并（K-3）"；`struct:pos`，在容器里、在人身上为空）；卷五 §4.5 规则 6 :502（"批次多一个批次字段 spot……落点不同的批次不合并"）；
//   卷三乙 §4.4.3 :1046 K-3（判同键现列 source / qualityTier / purports / batchTag / material / project，漏了 spot，勘误补）；卷二 §1.5 :253 `struct:pos` = {w, x, y, z, coarse}；
//   裁定 X-H（李白 11-22）；判定文 docs/研究/偏离清查-1122-跨卷判定.md 第 11 条 (a)。
// 测什么：经账本公开入口 lotsUnmergeable（纯函数）与 mergeLots（事务内）：只差 spot 的两批不得当同键合并；spot 全同、或两批都空（在容器里、人身上）仍可并（对照，修后不得误伤）；
//   一批有落点一批空也算不同（空对空才算同，卷三乙 :285 "在容器里、在人身上为空"）。
// 修前为什么红：ledger.mjs LOT_SAME_KEYS 不含 spot，只差 spot 的两批被判可并（lotsUnmergeable 返回 null、mergeLots 成功），"不并"断言红；"可并"对照修前即绿。
// 前提在本文件里造（账本场景同 tests/kernel/item-lots.test.mjs 的写法：造粮食行、用途、持有人在注册表副本里），不读仓库当前数据。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share } from '../../kernel/item-world.mjs';
import { miniClimatePlaceDoc } from '../../kernel/mini-place-world.mjs';
import { installVocab } from '../../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { post, mergeLots, auditLots, lotsUnmergeable } from '../../../server-plugin/kernel/ledger.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const GRAIN = 'mat_test_grain';
const SH = 'purpose_test_shelf';
const PA = 'loc_county_xichui_longqu';
const PB = 'loc_hw';
const KERNEL = { file: 'kernel/ledger.mjs', node: 'test_kernel' };
const spotA = { w: 0, x: 10, y: 20, z: 0, coarse: false };
const spotB = { w: 0, x: 11, y: 20, z: 0, coarse: false };

// ---------- 纯函数层：lotsUnmergeable ----------
const lot = (extra = {}) => ({ source: null, qualityTier: null, purports: null, batchTag: null, material: 'mat_test_grain', project: null, enteredDay: 0, taint: 0, ...extra });
const unmergeable = (a, b) => lotsUnmergeable(a, b, 'lot_0', 'lot_1');

test('K-3 spot ①：只差 spot（x 不同）的两批判不可并（返回一句说明，不是 null）', () => {
  assert.equal(typeof unmergeable(lot({ spot: spotA }), lot({ spot: spotB })), 'string');
});

test('K-3 spot ②：spot 的每一个字段都算落点（只差 w、y、z、coarse 也不可并）', () => {
  for (const diff of [{ w: 1 }, { y: 21 }, { z: 1 }, { coarse: true }]) {
    assert.equal(typeof unmergeable(lot({ spot: spotA }), lot({ spot: { ...spotA, ...diff } })), 'string', JSON.stringify(diff));
  }
});

test('K-3 spot ③：一批有落点、另一批为空（缺键或 null）也不可并；两个方向都判', () => {
  for (const empty of [{}, { spot: null }]) {
    assert.equal(typeof unmergeable(lot({ spot: spotA }), lot(empty)), 'string');
    assert.equal(typeof unmergeable(lot(empty), lot({ spot: spotA })), 'string');
  }
});

test('K-3 spot ④（对照，修后不得误伤）：spot 全同可并；两批都空（缺键对 null）可并（在容器里、在人身上）', () => {
  assert.equal(unmergeable(lot({ spot: spotA }), lot({ spot: { ...spotA } })), null);
  assert.equal(unmergeable(lot(), lot()), null);
  assert.equal(unmergeable(lot({ spot: null }), lot()), null);
});

// ---------- 账本层：mergeLots ----------
function build() {
  const f = baseFixture();
  f.materials[GRAIN] = { flammability: 0, salvageFraction: 0.5, workDifficulty: 10, valueMult: 1, refMaterial: null, wearResistance: 20, basis: '测试', classes: ['comp_rottable'], substance: 'subst_plant', density: { solid: 1 }, decomposePoint: 200, rotRate: 0.04, moisture: 0.12, energyDensity: 15 };
  f.items = { item_test_grain: itemRow(1, [share('mgroup_body', GRAIN, 1)]) };
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
  index.set('res_test_grain', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_grain' } });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  rules.economyResources.res_test_grain = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_consume', 'sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  return { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'test_world_seed' } };
}

const state0 = () => ({ clock: { minute: 0, seq: 0 } });
function stock(engine, state, qty, attrs) {
  let key;
  const r = runTransaction(state, KERNEL, (s) => {
    const res = post(engine, s, { legs: [{ account: { holder: PA, purpose: SH, resource: { kind: 'res_test_grain' } }, delta: qty, lot: { attrs: { enteredDay: 0, taint: 0, spoilage: 0, rotAnchorDay: 0, ...attrs } } }, { flow: 'src_regrow', kind: 'res_test_grain', qty }], reason: 'verb_test' });
    key = res.lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return key;
}
const merge = (engine, state, into, from) => runTransaction(state, KERNEL, (s) => { mergeLots(engine, s, { holder: PA, purpose: SH, kind: 'res_test_grain', into, from }); });

test('K-3 spot ⑤：mergeLots 整笔拒只差落点的两批（码 E-DIM-STRUCT-FIELD，同判同键不同的现行报法）；账户余额与批次行原样、K-8 审计仍过', () => {
  const engine = build();
  const state = state0();
  const a = stock(engine, state, 2, { spot: spotA });
  const b = stock(engine, state, 3, { spot: spotB });
  const c = stock(engine, state, 4, {}); // 在人身上或容器里：无落点
  assert.deepEqual(merge(engine, state, a, b), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  assert.deepEqual(merge(engine, state, a, c), { ok: false, code: 'E-DIM-STRUCT-FIELD' });
  const bal = state.accounts[PA][SH].res_test_grain;
  assert.deepEqual([bal[a], bal[b], bal[c]], [2, 3, 4]);
  assert.deepEqual(auditLots(engine, state), []);
});

test('K-3 spot ⑥（对照）：落点全同的两批仍可并，余额相加 2 + 5 = 7，被并批次行删除，落点留在并入批次上', () => {
  const engine = build();
  const state = state0();
  const a = stock(engine, state, 2, { spot: spotA });
  const d = stock(engine, state, 5, { spot: { ...spotA } });
  assert.deepEqual(merge(engine, state, a, d), { ok: true });
  assert.equal(state.accounts[PA][SH].res_test_grain[a], 7);
  assert.ok(!Object.hasOwn(state.stockLots[PA][SH].res_test_grain, d));
  assert.deepEqual(state.stockLots[PA][SH].res_test_grain[a].spot, spotA);
  assert.deepEqual(auditLots(engine, state), []);
});
