// 长测，腾讯云块验收（G18）跑；本机常规测试不跑（tests/cloud/ 目录，主会话 11-24 已定）。
// 与 tests/kernel/item-rot-real.test.mjs 同一前提（真实材料月华浆果、真实太原气候单元与 rules.rot），但地点是真实世界原样：真实的全规模格空间、足迹与高度场，不缩成小格夹具。
// 作块 6 真实世界可玩的端到端守卫：第一次读垄渠郡的当日温度，走 placeClimateInput（地点→天气单元→纬度由形心、海拔由足迹与高度场派生），腐坏读数须已知，且同一地点冬季低、夏季高。
// 只断言已知与冬低夏高，不核字面量（真实世界的形心与海拔手算不了，不抄运行读数）；同时记耗时，作性能卡的验收对照。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { baseFixture, loadItemWorld, itemRow, share } from '../kernel/item-world.mjs';
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
  return { vocab, rules, units: W.env.units, tables: W.tables, template: { seed: 'seed_test' } };
}

function enter(engine, state, entryDay) {
  let key;
  const r = runTransaction(state, { file: 'kernel/ledger.mjs', node: 'n' }, (s) => {
    key = post(engine, s, { legs: [{ account: { holder: PLACE, purpose: SH, resource: { kind: 'res_test_berry' } }, delta: 3, lot: { attrs: { enteredDay: entryDay, taint: 0, spoilage: 0, rotAnchorDay: entryDay } } }, { flow: 'src_regrow', kind: 'res_test_berry', qty: 3 }], reason: 'verb_test' }).lots[0][1];
  });
  assert.deepEqual(r, { ok: true });
  return { account: { holder: PLACE, purpose: SH, kind: 'res_test_berry' }, lotKey: key };
}

test('真实世界原样：垄渠郡上月华浆果放 2 日，读数已知；冬季（第 0 日入账）读数低于夏季（第 90 日入账）', { timeout: 1800000 }, () => {
  const t0 = Date.now();
  const engine = world();
  const state = { clock: { minute: 0, seq: 0 } };
  const wref = enter(engine, state, 0);
  state.clock.minute = 2 * 1440;
  const winter = rotStep(engine, state, wref, 0).spoilage;
  assert.equal(winter.known, true, JSON.stringify(winter));
  state.clock.minute = 90 * 1440;
  const sref = enter(engine, state, 90);
  state.clock.minute = 92 * 1440;
  const summer = rotStep(engine, state, sref, 0).spoilage;
  assert.equal(summer.known, true, JSON.stringify(summer));
  assert.ok(summer.value > winter.value, `${summer.value} vs ${winter.value}`);
  console.log(`real-world rot reading: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
});
