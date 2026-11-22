// 试玩地区开局组织（作者手写，world/design/opening-polity-hw.json）：河湾村村社与王国的行进真实的 org、polity 表头校验，两条统治边写进统治边表，
// 原属站点（originSite）指向河湾村的子站点（世界地理建模附表改挂清单 world/geo/subsite-reparent.json，作者数据）经 R8-18.9 ③ 连到原村，governorOf 查回河湾村村社。
// 真实 place 表的数据行还没换成附表（place.json 行里没有 originSite，G5b 上格排在前置卡之后），所以子站点的 originSite 取自附表清单本身；地点 id 都是真实 place 表里的行。
// treasury：卷六还没有公库缺省分区 purpose_general（前置卡 A 第 6 项另开卡），夹具带 purpose_test；真实表那条用例等第 6 项合入后补。期望的组织 id 是作者数据里的字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { governorOf } from '../../server-plugin/kernel/title.mjs';
import { genPolity } from '../../server-plugin/kernel/gen/polity.mjs';
import { applyGovernorCalls } from '../../server-plugin/kernel/gen/holdcalls.mjs';
import { loadPolityWorld, ROOT } from './polity-world.mjs';

useReportSink(() => {});
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OPENING = json('world/design/opening-polity-hw.json');
const REPARENT = json('world/geo/subsite-reparent.json').rows;
const VILLAGE = 'org_village_hw';
const VILLAGE_SITE = 'loc_hw';
const withTreasury = (rows) => Object.fromEntries(Object.entries(rows).map(([id, r]) => [id, { ...r, treasury: ['purpose_test'] }]));

const W = loadPolityWorld(withTreasury(OPENING.org), OPENING.polity);
installVocab({ vocab: W.vocab, idIndex: W.idIndex, tables: W.tables });
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units, tables: W.tables, template: { seed: 'opening_hw_seed' } };
const CTX = { node: 'test_opening_hw', file: 'tests/kernel/polity-opening-hw.test.mjs' };

function opened() {
  installHoldingEngine(ENGINE);
  installEventLog({ entries: [] });
  const state = { clock: { minute: 10, seq: 0 } };
  const authored = OPENING.governs.map((g) => ({ place: g.place, org: g.org, cause: g.cause }));
  assert.deepEqual(runTransaction(state, CTX, (s) => { assert.equal(applyGovernorCalls(ENGINE, s, authored).skipped.length, 0); }), { ok: true });
  return state;
}

test('作者手写的两条统治边：河湾村站点归河湾村村社（直接挂在站点上）；王都站点归王国组织', () => {
  const s = opened();
  assert.deepEqual(governorOf(ENGINE, s, VILLAGE_SITE), { org: VILLAGE, direct: true, eligible: true, subject: VILLAGE_SITE });
  assert.equal(governorOf(ENGINE, s, 'loc_capital').org, 'org_realm_main');
});

test('⑧ 开局统治边的原因（李白 11-23 b41e0801，卷八 1123k42）：rules.polity.genHoldCause 是新登的 kindOnly 动词 verb_opening，不是封授 verb_grant，不在 holdForcibleCauses 里；作者手写的每条开局边都取它', () => {
  const polity = W.rules.polity;
  assert.equal(polity.genHoldCause, 'verb_opening');
  assert.notEqual(polity.genHoldCause, 'verb_grant');
  assert.equal(polity.holdForcibleCauses.includes(polity.genHoldCause), false);
  const verb = W.vocab.families.get('verb').entries[polity.genHoldCause];
  assert.deepEqual([verb.kindOnly, verb.kindFrom, verb.payloadShape], [true, null, {}]);
  assert.ok(OPENING.governs.length > 0 && OPENING.governs.every((g) => g.cause === polity.genHoldCause));
});

test('⑨ 王国继承不再是占位（李白 11-23 b41e0801）：successionDefault 指议案选出条目——orderSource 取 succsrc_motion、不设候选范围 poolRX 为恒真式、heirSource 与 contestSkill 为空、cost 空表；条目 id 与 basis 不含"pending""占位"', () => {
  const id = OPENING.polity.polity_realm_main.successionDefault;
  const e = W.vocab.families.get('succession').entries[id];
  assert.deepEqual([e.orderSource, e.heirSource, e.contestSkill, e.poolRX, e.cost], ['succsrc_motion', null, null, '1 == 1', []]);
  assert.equal(/pending|占位/.test(id + e.basis), false);
  assert.ok(e.basis.includes('待调'));
});

test('村社组织的 polity 为 null、沿 parent 的王国取政体行：持有资格为真（王国政体 holderEligibility 1 == 1、landless 假）', () => {
  assert.equal(W.tables.get('org').flat.rows.get(VILLAGE).polity, null);
  assert.equal(W.tables.get('org').flat.rows.get(VILLAGE).parent, 'org_realm_main');
});

test('R8-18.9 ③ + 1123k32：附表里 originSite 指向河湾村站点的每个子站点（磨坊一类）经生成阶段连到作者手写的那条边，governorOf 查回河湾村村社；不靠包含树', () => {
  const s = opened();
  const subs = Object.entries(REPARENT).filter(([k, v]) => typeof v === 'object' && v !== null && v.originSite === VILLAGE_SITE).map(([k]) => k);
  assert.ok(subs.length > 0);
  const rows = new Map(subs.map((id) => [id, { id, parent: REPARENT[id].parent, dims: { originSite: VILLAGE_SITE } }]));
  const heldBy = new Map(OPENING.governs.map((g) => [g.place, { org: g.org, cause: g.cause }]));
  const r = genPolity({ stage: 'gstage_polity', rows, heldBy, polityRules: {}, treasury: [] });
  assert.deepEqual(r.proposals, []); // 输入不全：不建行
  assert.equal(r.deferred.length, 1);
  assert.deepEqual(runTransaction(s, CTX, (st) => { assert.equal(applyGovernorCalls(ENGINE, st, r.calls).skipped.length, 0); }), { ok: true });
  for (const id of subs) assert.deepEqual(governorOf(ENGINE, s, id), { org: VILLAGE, direct: true, eligible: true, subject: id });
});
