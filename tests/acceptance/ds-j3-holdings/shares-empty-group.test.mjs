// 验收测试（出题方：Claude Sonnet 5.5 中档）。依据：卷十八 :342 shareSum "同一标的各现役边的 terms.share 之和必须等于它"；
// 李白 11-22 裁定 ⑦（事件 c60252be）：同一标的现役边数为 0 时不核份额合计（暂时无主，如终止协议关光全部边）；有 1 条及以上现役边时合计须等于 shareSum。
// 测什么：份额种类 shareSum=1 的标的，两条边 0.4+0.6 在同一事务关光，提交通过；对照：只关 0.4 剩 0.6 一条，合计不足 1，仍拒 E-HK-PROTOCOL。
// 修前红绿：见出题.md（关光一条当前代码已绿，对照一条已绿）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../../server-plugin/kernel/events.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { useReportSink } from '../../../server-plugin/kernel/report.mjs';
import { openHolding, closeHolding, installHoldingEngine } from '../../../server-plugin/kernel/holdings.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
useReportSink(() => {});
const CAUSE = 'act_test_hold';
const CTX = { node: 'test_holdings', file: 'tests/acceptance/ds-j3-holdings/shares-empty-group.test.mjs' };
installVocab({ vocab: W.vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['npc_b', 'person'], ['item_q', 'item']]), tables: W.tables });
const rowOf = () => ({
  id: 'hk_test_share', hyper: null, from: ['agent'], to: ['thing'], exclusive: false,
  gone: 'ho_close', vacated: 'ho_close', defected: null, subjectEnd: 'send_close',
  concluded: false, functional: false, membership: false, headship: false, carriesRel: false,
  conduct: 0, conductBack: 0, adopt: 0, pins: 'pside_none',
  intimate: false, bodyControl: false, holderMax: null, succeedBy: null, excludes: false,
  grantsEntry: false, entryRankMax: null, visibility: 'public', contest: null, capacityKey: null,
  transferable: false, incompatible: [], grants: [], hooks: [], termsKeys: ['share'], shareSum: 1,
  grantedBy: [], domicile: false, holdWhile: null, revival: null, admission: null, uniqueTriple: false,
});
function setup() {
  const index = new Map(W.vocab.index);
  index.set('hk_test_share', { family: 'holding_kind', prefix: 'hk_', entry: rowOf() });
  const engine = { vocab: { ...W.vocab, index }, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'test_holdings_seed' } };
  installHoldingEngine(engine);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 10, seq: 0 } };
  const ids = [];
  assert.deepEqual(runTransaction(state, CTX, (s) => {
    ids.push(openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_a', subject: 'item_q', terms: { share: 0.4 }, cause: CAUSE }));
    ids.push(openHolding(engine, s, { holdingKind: 'hk_test_share', holder: 'npc_b', subject: 'item_q', terms: { share: 0.6 }, cause: CAUSE }));
  }), { ok: true });
  return { engine, state, ids };
}

test('关光：同一标的两条份额边（0.4+0.6）同一事务全部关闭，现役边数为 0，不核份额合计，提交通过（李白 11-22 裁定 ⑦）', () => {
  const { engine, state, ids } = setup();
  assert.deepEqual(runTransaction(state, CTX, (s) => { for (const id of ids) closeHolding(engine, s, { id, cause: CAUSE }); }), { ok: true });
  for (const id of ids) assert.equal(Object.values(state.holdings).flatMap((h) => Object.entries(h)).find(([k]) => k === id)[1].terms.until, 10);
});

test('对照：只关 0.4 那条，标的上剩一条 0.6，合计不足 shareSum=1，仍拒 E-HK-PROTOCOL，状态不变', () => {
  const { engine, state, ids } = setup();
  assert.deepEqual(runTransaction(state, CTX, (s) => { closeHolding(engine, s, { id: ids[0], cause: CAUSE }); }), { ok: false, code: 'E-HK-PROTOCOL' });
  assert.equal(state.holdings.npc_a[ids[0]].terms.until, null);
});
