// 块 5 验收（迁移体检 docs/迁移体检/块5.md 第四节 5-7）：块 5 能跑通的半边写真断言，依赖未建设施的半边记在
// docs/审查/块5验收/验收记录.md（not_run／部分，挂卡），本文件不造设施凑过。
// - 附 终止残余（卷二 §2.6 :525 E-TERM-RESIDUE）：已终止实体无持有边、无非零余额、无以它为 owner/ref 的到期项（窗口项除外）；之后对它的写入拒写。
// - 终止时账户分流守恒（卷六《经济》:380 规则 9；I1′ 方案 :366）：逐资源 Σ账户 终止前后相等。
// - I16′ 事件主写（方案 :370；卷九 R9-2.3 :663）内核写者半边：提交的终止恰一条终止事件、每关一条边恰一条持有变化事件；被拒的事务不留事件、状态不动。
//   原语层"一次事务恰一条原语事件"与"快照加日志重建"两半不在本文件：前者等 emit 适配器（李白 11-18 22:10 五.2），后者等 det_save_load 模板（卷十二 R12-6.7）。
// - 复生窗口期满（卷二 §2.6 :530；卷二十 §4.1.3 第 5 条 :506）：窗口项经调度器 due 段发到，交 expireReviveWindow 删 hold 记录、标记不动。
//   deliver 在这里由测试组装（到期事件的订阅分发归块 6 装配卡），本条在验收记录里记"部分"。
// 输入：卷十二 R12-5.6 :806 要求用 §2.8 登记场景加性质测试；场景登记表（scenario）尚未建，本文件在测试里造前提（虚构可终止人物表，同
// tests/kernel/terminate.test.mjs），对表里每个可终止实体逐个断言同一组性质，不写某个实例应得多少。只跑不推进世界存档的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog } from '../../server-plugin/kernel/events.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { openHolding, installHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { openAccount } from '../../server-plugin/kernel/ledger.mjs';
import { advance, dueSource } from '../../server-plugin/kernel/scheduler.mjs';
import { terminate, installTermination, resetTermination, expireReviveWindow, terminationResidue } from '../../server-plugin/kernel/terminate.mjs';
import { OPTIONS } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
useReportSink(() => {});
const REAL_DECL = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
const KERNEL_EMITS = new Set(REAL_DECL.kernel.emits);

const CAUSE = 'verb_entity_terminated';
const CTX = { node: 'test_block5', file: 'tests/kernel/block5-accept.test.mjs' };
const MPD = W.env.units.get('day').si / W.env.units.get('minute').si;
const DAY = 4;
const MINUTE = DAY * MPD + 10;
const WINDOW_DAYS = 3;

// ---------- 前提：虚构可终止人物表（只在本进程，不进 world/） ----------
const vocabDoc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8'));
for (const c of ['class_test_mortal', 'class_test_spirit', 'class_test_base']) vocabDoc.families.class.entries[c] = {};
const term = (reviveWindowDays) => ({ mode: 'inherit', successorRX: 'heir', reviveWindowDays });
const personDoc = {
  kind: 'person', namespace: 'core', version: 1,
  entity: { idPrefix: ['npc_'], classPrefix: 'class_', singletonIds: [], instanceTable: null },
  behaviors: ['value'],
  dimensions: { heir: { type: 'ref', kind: 'person', required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' } },
  precedenceGroups: { default: ['class_test_mortal', 'class_test_spirit'] },
  classes: {
    class_test_base: { abstract: true, basis: 'b' },
    class_test_mortal: { extends: 'class_test_base', termination: term(0), basis: 'b' },
    class_test_spirit: { extends: 'class_test_base', termination: term(WINDOW_DAYS), basis: 'b' },
  },
  // 继承人 npc_h 不终止；其余每人都是被测的终止对象。
  rows: {
    npc_h: { classes: ['class_test_mortal'], basis: 'b' },
    npc_a: { classes: ['class_test_mortal'], heir: 'npc_h', basis: 'b' },
    npc_c: { classes: ['class_test_mortal'], heir: 'npc_h', basis: 'b' },
    npc_s: { classes: ['class_test_spirit'], heir: 'npc_h', basis: 'b' },
  },
  generated: {},
};
const REP = validateDimensions({
  units: readFileSync(join(ROOT, 'world/ontology/dimensions/_units.json'), 'utf8'),
  vocab: JSON.stringify(vocabDoc),
  tables: [{ file: 'person.json', text: JSON.stringify(personDoc) }],
}, OPTIONS);
assert.ok(REP.ok, REP.text);
const TABLES = new Map([...W.tables, ...REP.tables]);
installVocab({ vocab: REP.vocab, idIndex: new Map([...W.idIndex, ...REP.idIndex, ['place_x', 'place']]), tables: TABLES });
const SUBJECTS = ['npc_a', 'npc_c', 'npc_s'];
const PEOPLE = ['npc_h', ...SUBJECTS];

// 一条 hold 去留的测试记录类，窗口期满时应被删（卷二 :529、:530）。
const RECORDS = { rcls_test_hold: { atTerminate: 'hold', atRevive: 'clear' } };
const ENGINE = {
  vocab: REP.vocab, rules: { ...W.rules, terminate: { ...W.rules.terminate, records: RECORDS } },
  units: W.env.units, tables: TABLES, template: { seed: 'test_block5_seed' },
};
const DECL = {
  stateKeys: { ...REAL_DECL.stateKeys, testHold: { readers: [], writers: { '*': 'test/hold.mjs' }, subjectRecords: { '*': { recordClass: 'rcls_test_hold', subjectSegments: [1] } } } },
  systems: REAL_DECL.systems,
};

const RES = { kind: 'res_building_share', key: 'bld_x' };
const PURPOSE = 'purpose_unmaterialized';

/** @type {{entries: any[]}} */
let book;
// 场景：四人各有一份余额与一条常住边；testHold 每人一条记录。
function fresh() {
  installHoldingEngine(ENGINE);
  book = { entries: [] };
  installEventLog(book);
  resetTermination();
  installTermination(DECL);
  const accounts = {};
  PEOPLE.forEach((id, i) => { accounts[id] = { [PURPOSE]: { [RES.kind]: { [RES.key]: 1000 * (i + 1) } } }; });
  const state = { clock: { minute: MINUTE, seq: 0, dueNext: 0 }, accounts, testHold: Object.fromEntries(PEOPLE.map((id) => [id, 1])) };
  assert.deepEqual(run(state, (s) => { for (const id of PEOPLE) openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: id, subject: 'place_x', cause: CAUSE }); }), { ok: true });
  return state;
}

const run = (state, body) => runTransaction(state, CTX, body);
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const snapshot = (state) => JSON.stringify(canon(state));
// 逐资源（种类 + 键）把全部账户余额加总（卷六规则 1 三元键；I1′ Σ账户）。
function totals(state) {
  const out = {};
  for (const byPurpose of Object.values(state.accounts || {})) for (const byKind of Object.values(byPurpose)) for (const [kind, byKey] of Object.entries(byKind)) {
    for (const [key, qty] of Object.entries(byKey)) out[`${kind}.${key}`] = (out[`${kind}.${key}`] || 0) + qty;
  }
  return out;
}
const edges = (state) => Object.values(state.holdings || {}).flatMap((es) => Object.values(es));
const activeOf = (state, id) => edges(state).filter((r) => r.terms.until === null && (r.holder === id || r.subject === id));

test('附 终止残余 + 守恒 + I16′ 内核半边：对每个可终止实体，提交的终止无残余、逐资源 Σ账户 不变、事件与状态变化一一对应', () => {
  for (const id of SUBJECTS) {
    const state = fresh();
    const before = totals(state);
    const closing = activeOf(state, id).length;
    assert.ok(closing > 0 && before[`${RES.kind}.${RES.key}`] > 0, `${id}: scenario has an edge and a balance to move`);
    const n = book.entries.length;
    assert.deepEqual(run(state, (s) => terminate(ENGINE, s, id, CAUSE, null)), { ok: true }, id);
    // E-TERM-RESIDUE 不变量：残余核对为空。
    assert.deepEqual(terminationResidue(ENGINE, state, id), [], id);
    assert.equal(activeOf(state, id).length, 0, id);
    // I1′：终止只在账户之间分流，逐资源合计前后相等。
    assert.deepEqual(totals(state), before, id);
    // I16′ 内核半边：本笔事件全是内核登记发出的动词；恰一条终止事件且在最后；每关一条边恰一条持有变化事件。
    const mine = book.entries.slice(n);
    assert.ok(mine.every((e) => KERNEL_EMITS.has(e.verb)), `${id}: ${mine.map((e) => e.verb)}`);
    assert.deepEqual(mine.filter((e) => e.verb === CAUSE).map((e) => e.payload.id), [id]);
    assert.equal(mine[mine.length - 1].verb, CAUSE);
    assert.equal(mine.filter((e) => e.verb === 'verb_holding_changed').length, closing, id);
  }
});

test('I16′ 被拒动作不留事件：对已终止实体再终止、开账户都拒 E-TERM-RESIDUE，状态与事件日志都不变', () => {
  for (const id of SUBJECTS) {
    const state = fresh();
    assert.deepEqual(run(state, (s) => terminate(ENGINE, s, id, CAUSE, null)), { ok: true });
    for (const body of [(s) => terminate(ENGINE, s, id, CAUSE, null), (s) => openAccount(ENGINE, s, id, RES, PURPOSE)]) {
      const snap = snapshot(state);
      const n = book.entries.length;
      assert.deepEqual(run(state, body), { ok: false, code: 'E-TERM-RESIDUE' }, id);
      assert.equal(snapshot(state), snap, id);
      assert.equal(book.entries.length, n, id);
    }
  }
});

test('规则目录未登记去留表的世界（加载器"登记了才核"）：运行期 terminate 读表即拒 E-RULES-UNREGISTERED，状态与事件日志不变，不成口子', () => {
  const { terminate: _omit, ...rules } = ENGINE.rules;
  const engine = { ...ENGINE, rules };
  for (const id of SUBJECTS) {
    const state = fresh();
    const snap = snapshot(state);
    const n = book.entries.length;
    assert.deepEqual(run(state, (s) => terminate(engine, s, id, CAUSE, null)), { ok: false, code: 'E-RULES-UNREGISTERED' }, id);
    assert.equal(snapshot(state), snap, id);
    assert.equal(book.entries.length, n, id);
  }
});

test('复生窗口期满经调度器 due 段发到（deliver 由测试组装，订阅分发挂块 6）：期满前 hold 记录留着，期满那一刻删，终止标记不动', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_s', CAUSE, null)), { ok: true });
  assert.equal(state.testHold.npc_s, 1);
  const source = dueSource(ENGINE, { layerRankOf: () => 0, deliver: (st, item) => expireReviveWindow(ENGINE, st, item) });
  // 窗口项到期时刻 = (终止日 + 窗口日数) 日的起点（卷二 :530）。
  const dueMinute = (DAY + WINDOW_DAYS) * MPD;
  assert.deepEqual(advance(ENGINE, state, dueMinute - 1 - state.clock.minute, [source]), { ok: true, minute: dueMinute - 1 });
  assert.equal(state.testHold.npc_s, 1);
  assert.deepEqual(advance(ENGINE, state, 1, [source]), { ok: true, minute: dueMinute });
  assert.equal(state.testHold.npc_s, undefined);
  assert.equal(state.testHold.npc_h, 1);
  assert.deepEqual(state.terminated.npc_s, { day: DAY, cause: CAUSE, mode: 'inherit' });
  resetTermination();
});
