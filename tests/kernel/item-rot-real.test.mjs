// 块 6 第 6-3 张改三轮：真实世界数据下食物会坏，且坏得与温度有关。前提只在临时世界里加一件食物（真实材料月华浆果 mat_moon_berry，rotRate 0.2 per_day_rot）
// 和让垄渠郡（挂太原气候单元，6-24）能当持有人；腐坏读数走默认接线（地点→天气单元→太原气候输入，纬度由 coord.y 与 rules.astro 推出），
// 温度曲线与档表是 rules.rot 的真实暂定值（world/rules/tables/rot.json），不在测试里造。
// 期望值按 tempCurve（[-20,0] [0,0.25] [10,0.5] [20,1] [30,2] [40,4]，点间线性）与太原单元当日平均气温手算成字面量：
//   第 1 日均温 4.2101、第 2 日 4.4272（冬）：倍数 0.25 + T/10 × 0.25 = 0.3552525、0.36068；
//   第 91 日 23.4397、第 92 日 23.5601（夏）：倍数 1 + (T − 20)/10 = 1.34397、1.35601。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share } from './item-world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { post } from '../../server-plugin/kernel/ledger.mjs';
import { rotStep } from '../../server-plugin/kernel/item-state.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const PLACE = 'loc_county_xichui_longqu';
const SH = 'purpose_test_shelf';

function world() {
  const f = baseFixture();
  f.items = { item_test_berry: itemRow(0.1, [share('mgroup_body', 'mat_moon_berry', 1)], { bulkForm: 'bform_granule' }) };
  f.editPlaceDoc = (doc) => { doc.rows[PLACE].ledgerHolder = true; };
  const r = loadItemWorld(f);
  assert.ok(r.ok, JSON.stringify(r.messages) + JSON.stringify(r.errors));
  const W = r.world;
  const index = new Map(W.vocab.index);
  index.set(SH, { family: 'purpose', prefix: 'purpose_', entry: { spendable: true, locksFor: null, visibleToMarket: true, trackOutflow: false } });
  index.set('verb_test', { family: 'verb', prefix: 'verb_', entry: {} });
  index.set('res_test_berry', { family: 'resource', prefix: 'res_', entry: { item: 'item_test_berry' } });
  const vocab = { families: W.vocab.families, index };
  installVocab({ vocab, idIndex: W.idIndex, tables: W.tables });
  const rules = structuredClone(W.rules);
  rules.economyResources.res_test_berry = { family: 'resfam_goods', unit: 'count', transferable: 'tr_free', counterpartRX: null, sources: ['src_regrow'], sinks: ['sink_decay'], onTerminate: 'successor', salvageFraction: 0, countsAsWealth: true, unitOfAccount: false, issuerBacked: false };
  return { vocab, rules, units: W.env.units, tables: W.tables };
}

// 在第 entryDay 日入账 3 件新鲜浆果（腐坏 0），返回读数引用。
function enter(engine, state, entryDay) {
  let key;
  const r = runTransaction(state, { file: 'kernel/ledger.mjs', node: 'n' }, (s) => {
    key = post(engine, s, { legs: [{ account: { holder: PLACE, purpose: SH, resource: { kind: 'res_test_berry' } }, delta: 3, lot: { attrs: { enteredDay: entryDay, taint: 0, spoilage: 0, rotAnchorDay: entryDay } } }, { flow: 'src_regrow', kind: 'res_test_berry', qty: 3 }], reason: 'verb_test' }).lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return { account: { holder: PLACE, purpose: SH, kind: 'res_test_berry' }, lotKey: key };
}

test('真实数据：夏季（第 90 日）入账的月华浆果放 2 日：0.2 × (1.34397 + 1.35601) = 0.539996，读数 0.54（定点截断到万分位）；放到第 120 日坏透封顶 1、末档、坏透日在第 90 日之后第 5 日之内', () => {
  const engine = world();
  const state = { clock: { minute: 90 * 1440, seq: 0 } };
  const ref = enter(engine, state, 90);
  state.clock.minute = 92 * 1440;
  const day2 = rotStep(engine, state, ref, 0);
  assert.equal(day2.spoilage.known, true, JSON.stringify(day2.spoilage));
  assert.ok(Math.abs(day2.spoilage.value - 0.539996) < 0.0002, String(day2.spoilage.value));
  state.clock.minute = 120 * 1440;
  const day30 = rotStep(engine, state, ref, 0);
  assert.deepEqual([day30.spoilage.known, day30.spoilage.value, day30.stage], [true, 1, 3]);
  // 夏季每日约 0.27，第 4 日累计 0.2 × (1.34397 + 1.35601 + 1.36768 + 1.37898) = 1.0893 已封顶，第 3 日 0.2 × 4.06766 = 0.81 未封顶：坏透日是第 94 日。
  assert.equal(day30.expiresDay, 94);
  assert.deepEqual(day30.transform, { to: 'sink' });
});

test('真实数据：温度有关——同一地点冬季（第 0 日）入账放 2 日，0.2 × (0.3552525 + 0.36068) = 0.1432，远低于夏季同样 2 日的 0.54；两季读数之比与手算倍数之比一致', () => {
  const engine = world();
  const state = { clock: { minute: 0, seq: 0 } };
  const ref = enter(engine, state, 0);
  state.clock.minute = 2 * 1440;
  const winter = rotStep(engine, state, ref, 0).spoilage;
  assert.equal(winter.known, true, JSON.stringify(winter));
  assert.ok(Math.abs(winter.value - 0.1432) < 0.0002, String(winter.value));
  state.clock.minute = 90 * 1440;
  const sref = enter(engine, state, 90);
  state.clock.minute = 92 * 1440;
  const summer = rotStep(engine, state, sref, 0).spoilage;
  assert.ok(summer.value > 3.5 * winter.value, `${summer.value} vs ${winter.value}`);
});
