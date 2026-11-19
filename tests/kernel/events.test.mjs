// 块 5 第 5-2 张《事件记录表 A、verb 族与写者协议》：卷二十四 §2.2 表 A（:126–:154）、R24-1.1 :395、R24-1.6 :400、
// R24-2.3 :439、R24-2.4 :440（丙1 最小 eventDerive 前移）；卷九 §2.9 事件 id :432–:443、R9-2.3 :658；卷二十七 R27-8.9 :738；
// 李白 11-18 22:10 丙1（eventDerive 最小版并入 5-2：估值读不出计 0 记缺口、scopeLevel 无政区取空）。
// 测试先写，期望值一律按卷文公式或卷九 §2.9／R27-8.9 手算成字面量，不抄仓库当前读数。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import {
  runTransaction, openTickJournal, closeTickJournal, rollbackTickJournal, registerHoldWhileRecompute, resetHoldWhileRecompute,
  installProposalSession, submitProposal,
} from '../../server-plugin/kernel/transaction.mjs';
import { openAccount, balance } from '../../server-plugin/kernel/ledger.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installDigestCap, installDigestExclude, saveDigest } from '../../server-plugin/kernel/save.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { execute } from '../../server-plugin/primitives-runtime.mjs';
import {
  emit, registerEventDerive, resetEventDerive, installEventLog, resetEventLog, eventDerive, deriveEventId, checkVerbRows,
} from '../../server-plugin/kernel/events.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
// 存档摘要（A9-2.2）用：测试里没有世界装配的排除表，按空表收下（摘要只算，不写盘）。
installDigestExclude([]);

// 拒收会经 report 出口打日志；测试里换成空出口。
const REPORTS = [];
useReportSink((rec) => { REPORTS.push(rec); });

const SEED = 'test_world_seed';

// 表 B 公共取值的最小行（字段照卷二十四 :156–:173，本测试只用于注入本进程的 verb 族条目，不进 world/）。
const VERB_ROW = Object.freeze({
  parent: null,
  payloadShape: {},
  kindFrom: null,
  kindOnly: false,
  worthSlots: { destroyed: [], moved: [], stake: [] },
  headSlot: null,
  sigBase: 0,
  tallies: [],
  perceivable: false,
  senses: [],
  visibilityAllowed: ['private', 'public', 'witnessed'],
  scandal: false,
  calendarBound: false,
});
// 带一个实体槽的测试动词行（eventDerive 估值缺口用）。
const WORTH_ROW = Object.freeze({
  ...VERB_ROW,
  payloadShape: { id: 'EntityId' },
  worthSlots: { destroyed: ['id'], moved: [], stake: [] },
});

// 登记场景：测试动词只进本进程的注册表，不进 world/（块 3 起同法）。
const vocab = {
  families: W.vocab.families,
  index: new Map([...W.vocab.index,
    ['verb_test_exec', { family: 'verb', prefix: 'verb_', entry: VERB_ROW }],
    ['verb_test_worth', { family: 'verb', prefix: 'verb_', entry: WORTH_ROW }],
  ]),
};
installVocab({ vocab, idIndex: new Map([...W.idIndex, ['npc_a', 'person'], ['org_b', 'org'], ['item_q', 'item']]), tables: W.tables });
const ENGINE = { vocab, rules: W.rules, units: W.env.units, template: { seed: SEED } };
const DECL = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));

// 账本三元键（卷六 §4.1 规则 1）：npc_a.purpose_unmaterialized.res_building_share.bld_x。
const BLD = { kind: 'res_building_share', key: 'bld_x' };
const UNMAT = 'purpose_unmaterialized';
const FROM = 'npc_a.purpose_unmaterialized.res_building_share.bld_x';
const TO = 'org_b.purpose_unmaterialized.res_building_share.bld_x';
const CTX = { node: 'test_setup', file: 'tests/kernel/events.test.mjs' };
const codeIs = (code) => (e) => e.code === code;
const clone = (v) => JSON.parse(JSON.stringify(v));

function freshLog() {
  const book = { entries: [] };
  installEventLog(book);
  return book;
}

// emit 只在本状态的事务内写（R24-1.1 :395、R24-1.2 :396）；测试经 runTransaction 跑，抛错原样上抛给断言（事务已整笔回滚）。
function inTx(state, fn) {
  let out;
  let err = null;
  runTransaction(state, CTX, (s) => {
    try { out = fn(s); } catch (e) { err = e; throw e; }
  });
  if (err) throw err;
  return out;
}

// 逻辑文档五部分（R27-4.1）：摘要要算的 doc_log 就是日志簿的条目。
function docOf(book) {
  return { doc_data: {}, doc_state: {}, doc_holdings: {}, doc_ledger: {}, doc_log: book.entries };
}

// 造前提：事务外直接置 clock 与账户余额（造前提用，断言不看这个数当基线）。
function funded(qty) {
  const state = { clock: { minute: 0, seq: 0 } };
  assert.deepEqual(runTransaction(state, CTX, (s) => { openAccount(ENGINE, s, 'npc_a', BLD, UNMAT); }), { ok: true });
  state.accounts.npc_a.purpose_unmaterialized.res_building_share.bld_x = qty;
  return state;
}

// 一条合法的协议事件（卷二 :524 终止行载荷；primitives 空表，位次 pos.kernel）。
function terminationEvent(overrides = {}) {
  return {
    minute: 0,
    verb: 'verb_entity_terminated',
    actor: null,
    actorAs: null,
    targets: ['npc_a'],
    primitives: [],
    cause: 'rule_test_term',
    witnesses: [],
    rollKey: null,
    visibility: 'private',
    payload: { id: 'npc_a', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null },
    ...overrides,
  };
}
const KERNEL_ID = { rule: 'rule_test_term', subject: 'evt_prev', position: 'pos.kernel' };

// ---------- 事件 id 派生（卷九 §2.9 :432–:443；卷二十七 R27-8.9 :738） ----------

test('事件 id：五样成分相同即同一 id，任一成分变即不同；成分只收代号、id 与整数', () => {
  const id = deriveEventId(ENGINE, { rule: 'act_trade_buy', subject: 'npc_a', minute: 100, position: 'pos.commit' });
  assert.equal(id.length, 64);
  assert.equal(id, deriveEventId(ENGINE, { rule: 'act_trade_buy', subject: 'npc_a', minute: 100, position: 'pos.commit' }));
  const base = [id];
  for (const parts of [
    { rule: 'act_trade_sell', subject: 'npc_a', minute: 100, position: 'pos.commit' },
    { rule: 'act_trade_buy', subject: 'org_b', minute: 100, position: 'pos.commit' },
    { rule: 'act_trade_buy', subject: 'npc_a', minute: 101, position: 'pos.commit' },
    { rule: 'act_trade_buy', subject: 'npc_a', minute: 100, position: 'pos.only' },
  ]) base.push(deriveEventId(ENGINE, parts));
  assert.equal(new Set(base).size, 5);
  // 世界种子也是成分：换种子即换 id（R27-8.9 五样之一）。
  assert.notEqual(deriveEventId({ ...ENGINE, template: { seed: 'other_seed' } }, { rule: 'act_trade_buy', subject: 'npc_a', minute: 100, position: 'pos.commit' }), id);
  // 禁止成分：空串、文字、非整数时刻、缺世界种子都拒（E-SEED-COMPONENT，R27-8.2 :719）。
  assert.throws(() => deriveEventId(ENGINE, { rule: '', subject: 'npc_a', minute: 100, position: 'pos.commit' }), codeIs('E-SEED-COMPONENT'));
  assert.throws(() => deriveEventId(ENGINE, { rule: '动作', subject: 'npc_a', minute: 100, position: 'pos.commit' }), codeIs('E-SEED-COMPONENT'));
  assert.throws(() => deriveEventId(ENGINE, { rule: 'act_x', subject: 'npc_a', minute: 1.5, position: 'pos.commit' }), codeIs('E-SEED-COMPONENT'));
  assert.throws(() => deriveEventId(ENGINE, { rule: 'act_x', subject: 'npc_a', minute: 1, position: 'pos.commit', count: 1 }), codeIs('E-SEED-COMPONENT'));
  assert.throws(() => deriveEventId({ vocab, rules: W.rules }, { rule: 'act_x', subject: 'npc_a', minute: 1, position: 'pos.commit' }), codeIs('E-SEED-COMPONENT'));
});

// ---------- 表 A 结构校验与写入（卷二十四 §2.2 :126–:154、R24-1.1 :395、R24-1.6 :400） ----------

test('表 A：合法协议事件写入日志，id 派生、补充字段齐、primitives 空表、冻结不可改', () => {
  const book = freshLog();
  const rec = inTx({}, (s) => emit(ENGINE, s, terminationEvent(), KERNEL_ID));
  assert.equal(book.entries.length, 1);
  assert.equal(book.entries[0], rec);
  assert.equal(rec.id, deriveEventId(ENGINE, { ...KERNEL_ID, minute: 0 }));
  assert.deepEqual(rec.primitives, []);
  assert.deepEqual(rec.targets, ['npc_a']);
  assert.equal(rec.verb, 'verb_entity_terminated');
  // 六个补充字段（丙1：R24-1.6 写下后不改、onUnknown error，故必须写下）。
  assert.deepEqual(rec.worth, { destroyed: 0, moved: 0, stake: 0 });
  assert.equal(rec.heads, 1);
  assert.equal(rec.scopeLevel, null);
  assert.equal(rec.typeRef, null);
  assert.equal(rec.instanceRef, null);
  assert.equal(Number.isInteger(rec.eventSig), true);
  assert.equal(Object.isFrozen(rec), true);
  assert.throws(() => { rec.minute = 5; }, TypeError);
  assert.throws(() => { rec.payload.id = 'item_q'; }, TypeError);
  resetEventLog();
});

test('表 A：必填缺失、verb 未登记、visibility 越权、文字字段、targets/witnesses 乱序、primitives 形状不合都拒', () => {
  const book = freshLog();
  const bad = (overrides, code, idParts = KERNEL_ID) => assert.throws(() => inTx({}, (s) => emit(ENGINE, s, terminationEvent(overrides), idParts)), codeIs(code));
  // 最小十字段缺一即 E-EVT-SHAPE（卷二十四 :134、:154）。
  bad({ minute: undefined }, 'E-EVT-SHAPE');
  bad({ cause: undefined }, 'E-EVT-SHAPE');
  bad({ verb: undefined }, 'E-EVT-SHAPE');
  bad({ visibility: undefined }, 'E-EVT-SHAPE');
  // verb 不在 verb 族即 E-EVT-VERB（表 A :134）。
  bad({ verb: 'act_not_a_verb' }, 'E-EVT-VERB');
  // visibility 须在动词行 visibilityAllowed 内（表 A :137）。
  bad({ visibility: 'secret' }, 'E-EVT-SHAPE');
  // 事件记录没有任何文字字段（R24-1.9 :403）：载荷字段值写成中文即拒。
  bad({ payload: { id: 'npc_a', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null, note: '中文' } }, 'E-EVT-SHAPE');
  // 载荷键须在动词行 payloadShape 内（表 A :139）：未登记字段即拒。
  bad({ payload: { id: 'npc_a', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null, extra: null } }, 'E-EVT-SHAPE');
  // targets 按 id 序、无重复（表 A :136）。
  bad({ targets: ['org_b', 'npc_a'] }, 'E-EVT-SHAPE');
  bad({ targets: ['npc_a', 'npc_a'] }, 'E-EVT-SHAPE');
  // witnesses 按 observer 序、senses 非空按感官代号序、margin ≥ 0（表 A :140）。
  bad({ witnesses: [{ observer: 'org_b', senses: [{ sense: 'sight', margin: 0 }] }, { observer: 'npc_a', senses: [{ sense: 'sight', margin: 0 }] }] }, 'E-EVT-SHAPE');
  bad({ witnesses: [{ observer: 'npc_a', senses: [] }] }, 'E-EVT-SHAPE');
  bad({ witnesses: [{ observer: 'npc_a', senses: [{ sense: 'sight', margin: -1 }] }] }, 'E-EVT-SHAPE');
  bad({ witnesses: [{ observer: 'npc_a', senses: [{ sense: 'touch', margin: 0 }, { sense: 'sight', margin: 0 }] }] }, 'E-EVT-SHAPE');
  // primitives 每项是 {op, ...}（表 A :135）：不是对象即拒。
  bad({ primitives: ['transfer'] }, 'E-EVT-SHAPE');
  // 写坏的一律不落日志。
  assert.equal(book.entries.length, 0);
  resetEventLog();
});

test('写下后不改：日志存冻结的深副本，调用方改自己的入参也不改已写事件', () => {
  const book = freshLog();
  const input = terminationEvent();
  inTx({}, (s) => emit(ENGINE, s, input, KERNEL_ID));
  const stored = book.entries[0];
  input.payload.id = 'item_q';
  input.targets.push('org_b');
  assert.equal(stored.payload.id, 'npc_a');
  assert.deepEqual(stored.targets, ['npc_a']);
  assert.throws(() => { stored.verb = 'verb_other'; }, TypeError);
  resetEventLog();
});

test('协议事件：primitives 空表、位次 pos.kernel；同一事务多条按所涉实体链式取主体 id，id 两两不同', () => {
  const book = freshLog();
  const [first, chained] = inTx({}, (s) => {
    const a = emit(ENGINE, s, terminationEvent(), KERNEL_ID);
    const b = emit(ENGINE, s, terminationEvent({ targets: ['org_b'], payload: { id: 'org_b', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null } }), { ...KERNEL_ID, subject: a.id });
    return [a, b];
  });
  assert.deepEqual(first.primitives, []);
  assert.deepEqual(chained.primitives, []);
  assert.notEqual(first.id, chained.id);
  assert.equal(book.entries.length, 2);
  resetEventLog();
});

test('同一事务同一成分再发一条即 E-SEED-COLLISION（R27-8.9 不用计数区分）', () => {
  const book = freshLog();
  inTx({}, (s) => {
    emit(ENGINE, s, terminationEvent(), KERNEL_ID);
    assert.throws(() => emit(ENGINE, s, terminationEvent(), KERNEL_ID), codeIs('E-SEED-COLLISION'));
  });
  assert.equal(book.entries.length, 1);
  resetEventLog();
});

// ---------- 事件随事务提交才落、回滚即无（R24-1.1 :395、R24-1.2 :396；卷二 §2.6 :509／:512；A9-2.2 :683） ----------

test('事件只在事务内写：事务外 emit 即 E-VIEW-UNDECLARED-WRITE，不落日志', () => {
  const book = freshLog();
  assert.throws(() => emit(ENGINE, {}, terminationEvent(), KERNEL_ID), codeIs('E-VIEW-UNDECLARED-WRITE'));
  assert.equal(book.entries.length, 0);
  resetEventLog();
});

test('事务成功：事件恰一条且提交后仍在；调用方在 emit 后抛错则条数回到事务前', () => {
  const book = freshLog();
  const state = {};
  assert.deepEqual(runTransaction(state, CTX, (s) => { emit(ENGINE, s, terminationEvent(), KERNEL_ID); }), { ok: true });
  assert.equal(book.entries.length, 1);
  // 同一日志里再加一条、调用方随后失败：整笔回滚，只留事务前那一条（卷二 :509 整笔回滚，不只丢一笔）。
  assert.throws(() => runTransaction(state, CTX, (s) => {
    emit(ENGINE, s, terminationEvent({ targets: ['org_b'], payload: { id: 'org_b', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null } }), { ...KERNEL_ID, subject: 'org_b' });
    throw new Error('caller failed after emit');
  }), /caller failed after emit/);
  assert.equal(book.entries.length, 1);
  resetEventLog();
});

test('提交前重算（holdWhileRecompute）抛错：事务整笔回滚，事件一并截掉', () => {
  const book = freshLog();
  const state = {};
  // primitives-runtime 的模块加载会带入持有写者并登记它自己的重算钩子（5-3）；本测试要独占，先清掉再登记。
  resetHoldWhileRecompute();
  registerHoldWhileRecompute(() => { throw new Error('hold while failed'); });
  try {
    assert.throws(() => runTransaction(state, CTX, (s) => { emit(ENGINE, s, terminationEvent(), KERNEL_ID); }), /hold while failed/);
  } finally {
    resetHoldWhileRecompute();
  }
  assert.equal(book.entries.length, 0);
  resetEventLog();
});

test('存档摘要：事件随事务回滚后前后相同（A9-2.2 :683）', () => {
  const book = freshLog();
  const state = {};
  const before = saveDigest(docOf(book));
  // 先证明日志参与摘要：同一条事件若留在 doc_log，摘要会变。
  const probe = { entries: [] };
  installEventLog(probe);
  inTx({}, (s) => emit(ENGINE, s, terminationEvent(), KERNEL_ID));
  assert.notEqual(saveDigest(docOf(probe)), before);
  installEventLog(book);
  // 被拒事务（emit 之后抛错）前后摘要相同。
  assert.throws(() => runTransaction(state, CTX, (s) => {
    emit(ENGINE, s, terminationEvent(), KERNEL_ID);
    throw new Error('rejected');
  }), /rejected/);
  assert.equal(book.entries.length, 0);
  assert.equal(saveDigest(docOf(book)), before);
  resetEventLog();
});

test('整刻作废：本刻已提交事务的事件一并截掉；正常收刻保留（卷二十 §4.1.3 :523／:525）', () => {
  const book = freshLog();
  const state = {};
  openTickJournal(state);
  assert.deepEqual(runTransaction(state, CTX, (s) => { emit(ENGINE, s, terminationEvent(), KERNEL_ID); }), { ok: true });
  assert.equal(book.entries.length, 1);
  rollbackTickJournal();
  assert.equal(book.entries.length, 0);
  // 正常收刻：本刻事件保留。
  openTickJournal(state);
  assert.deepEqual(runTransaction(state, CTX, (s) => { emit(ENGINE, s, terminationEvent(), KERNEL_ID); }), { ok: true });
  closeTickJournal();
  assert.equal(book.entries.length, 1);
  resetEventLog();
});

test('整刻作废：刻内穿插的请求条目留在日志里且编号不变，只删本刻事务追加的事件（卷二 §2.6 :512；卷二十七 R27-7.3 :668）', () => {
  const book = freshLog();
  const state = {};
  openTickJournal(state);
  installProposalSession({ state, book, resolve: () => ({ node: 'test_proposal', file: CTX.file, handler() {} }) });
  try {
    // 刻内第一笔事务：emit 一条。
    assert.deepEqual(runTransaction(state, CTX, (s) => { emit(ENGINE, s, terminationEvent(), KERNEL_ID); }), { ok: true });
    // 中间受理一个请求：请求条目先单独提交入 doc_log，在回滚范围之外（卷二 :512）。
    assert.deepEqual(submitProposal({ request: 42 }), { ok: true });
    const requestEntry = book.entries[1];
    // 刻内第二笔事务：再 emit 一条。
    assert.deepEqual(runTransaction(state, CTX, (s) => {
      emit(ENGINE, s, terminationEvent({ targets: ['org_b'], payload: { id: 'org_b', cause: 'verb_entity_terminated', source: null, mode: 'inherit', successorId: null } }), { ...KERNEL_ID, subject: 'org_b' });
    }), { ok: true });
    assert.equal(book.entries.length, 3);
    rollbackTickJournal();
    // 整刻作废后只剩请求条目：还是同一条、编号不变（R27-7.3 :668），两条事件都被删去。
    assert.equal(book.entries.length, 1);
    assert.equal(book.entries[0], requestEntry);
    assert.equal(book.entries[0].request, 42);
  } finally {
    closeTickJournal();
    installProposalSession(null);
    resetEventLog();
  }
});

// ---------- eventDerive 最小版（丙1：R24-2.3 :439、R24-2.4 :440） ----------

test('eventDerive：估值读不出计 0 并记缺口、heads 取 actor 与 targets 去重个数、scopeLevel 无政区取空', () => {
  const event = {
    minute: 0, verb: 'verb_test_worth', actor: 'npc_a', actorAs: null, targets: ['npc_a', 'org_b'],
    primitives: [], cause: 'rule_test_worth', witnesses: [], rollKey: null, visibility: 'private', payload: { id: 'item_q' },
  };
  const { fields, gaps } = eventDerive(ENGINE, {}, event);
  // 估值读不出：该件计 0 并记缺口（卷二十四 :439 末句）；没有价格入口（卷六 §4.21）可读。
  assert.deepEqual(fields.worth, { destroyed: 0, moved: 0, stake: 0 });
  assert.deepEqual(gaps, [{ side: 'destroyed', field: 'id' }]);
  // heads = actor 与 targets 去重后的个数：{npc_a, npc_a, org_b} → 2（R24-2.4）。
  assert.equal(fields.heads, 2);
  // scopeLevel 无政区取空（R24-2.4；本块没有地点与政区数据）。
  assert.equal(fields.scopeLevel, null);
  assert.equal(fields.typeRef, null);
  assert.equal(fields.instanceRef, null);
});

test('emit 把估值缺口经 report 记下（W-DIM-GAP），事件照常写下、不让整条失败', () => {
  freshLog();
  REPORTS.length = 0;
  const event = {
    minute: 0, verb: 'verb_test_worth', actor: 'npc_a', actorAs: null, targets: [],
    primitives: [], cause: 'rule_test_worth', witnesses: [], rollKey: null, visibility: 'private', payload: { id: 'item_q' },
  };
  const rec = inTx({}, (s) => emit(ENGINE, s, event, { rule: 'rule_test_worth', subject: 'npc_a', position: 'pos.only' }));
  assert.deepEqual(rec.worth, { destroyed: 0, moved: 0, stake: 0 });
  assert.equal(REPORTS.length, 1);
  assert.equal(REPORTS[0].code, 'W-DIM-GAP');
  assert.equal(REPORTS[0].fields.field, 'id');
  assert.equal(REPORTS[0].fields.side, 'destroyed');
  resetEventLog();
});

test('registerEventDerive：只许交入一次，交入后由它给补充字段（卷二 §2.7 :770）', () => {
  const custom = () => ({ worth: { destroyed: 1, moved: 2, stake: 3 }, heads: 4, scopeLevel: null, eventSig: 0, typeRef: null, instanceRef: null });
  registerEventDerive(custom);
  assert.throws(() => registerEventDerive(custom), codeIs('E-WRITER-DUPLICATE'));
  const book = freshLog();
  const rec = inTx({}, (s) => emit(ENGINE, s, terminationEvent(), KERNEL_ID));
  assert.deepEqual(rec.worth, { destroyed: 1, moved: 2, stake: 3 });
  assert.equal(rec.heads, 4);
  assert.deepEqual(book.entries[0].worth, { destroyed: 1, moved: 2, stake: 3 });
  resetEventDerive();
  resetEventLog();
});

// ---------- 执行器本卡不写事务事件（卷九 R9-2.3 :658、表 A :134／:142；李白 11-18 22:10 五.2／总原则） ----------

test('块 5 的 execute 不写占位事件：批里没有 emit 原语即拿不到 verb，整笔拒收、日志与状态都不动', () => {
  const book = freshLog();
  const state = funded(10);
  const batch = [{ op: 'transfer', from: FROM, to: TO, qty: 3 }];
  const snap = clone(state);
  // cause 是规则/指令代号（表 A :139），不再拿它顶事件 verb；没有 emit 原语就没有本笔真实动词。
  assert.deepEqual(runTransaction(state, CTX, (s) => execute(ENGINE, s, batch, 'act_trade_test')), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(book.entries.length, 0);
  assert.deepEqual(state, snap);
  resetEventLog();
});

test('被拒的 execute 不留事件（emit 原语在批里，但它的事件写者尚未上线）', () => {
  const book = freshLog();
  const state = funded(10);
  // 批里有 emit 原语（verb 有真值），但 emit 适配器未建：整笔拒收，transfer 也不写。
  const batch = [{ op: 'transfer', from: FROM, to: TO, qty: 3 }, { op: 'emit', verb: 'verb_test_exec', visibility: 'private' }];
  const snap = clone(state);
  assert.deepEqual(runTransaction(state, CTX, (s) => execute(ENGINE, s, batch, 'act_trade_test')), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(book.entries.length, 0);
  assert.deepEqual(state, snap);
  resetEventLog();
});

// ---------- verb 族行与发出系统（卷二十四表 B :156–:173、R24-1.3 :397；卷二 §2.7 :770） ----------

test('verb 族行：真实 world/ 数据全过；缺栏、kindOnly 被列出、文字类型、未登记发出系统都拒', () => {
  const REAL = W.vocab.families.get('verb').entries;
  assert.deepEqual(checkVerbRows({ vocab: W.vocab }, DECL), { ok: true, errors: [] });
  // 缺栏（表 B 行上必写、没有缺省）。
  for (const field of ['parent', 'payloadShape', 'kindFrom', 'kindOnly', 'worthSlots', 'headSlot', 'sigBase', 'tallies', 'perceivable', 'senses', 'visibilityAllowed', 'scandal', 'calendarBound']) {
    const row = { ...REAL.verb_entity_terminated };
    delete row[field];
    assert.equal(checkVerbRows({ vocab: W.vocab }, DECL, { verb_entity_terminated: row }).ok, false, field);
  }
  // kindOnly 行不得被任何 emits 列出（R24-1.3）。
  const ko = checkVerbRows({ vocab: W.vocab }, DECL, { verb_entity_terminated: { ...REAL.verb_entity_terminated, kindOnly: true } });
  assert.equal(ko.ok, false);
  assert.ok(ko.errors.some((e) => e.includes('E-EVT-EMITTER')));
  // payloadShape 不许有文字类型（表 B :161）。
  const str = checkVerbRows({ vocab: W.vocab }, DECL, { verb_entity_terminated: { ...REAL.verb_entity_terminated, payloadShape: { id: 'string' } } });
  assert.equal(str.ok, false);
  // 未登记的发出系统：把该行从 emits 里拿掉。
  const decl = clone(DECL);
  decl.kernel.emits = decl.kernel.emits.filter((v) => v !== 'verb_entity_terminated');
  const miss = checkVerbRows({ vocab: W.vocab }, decl);
  assert.equal(miss.ok, false);
  assert.ok(miss.errors.some((e) => e.includes('E-EVT-EMITTER')));
});

test('verb 族数据：四条块 5 内核/持有事件行齐全，发出系统与卷二 §2.6、卷十八 R18-1.10/R18-1.11 一致', () => {
  const entries = W.vocab.families.get('verb').entries;
  assert.deepEqual(Object.keys(entries).sort(), ['verb_domicile_changed', 'verb_entity_revived', 'verb_entity_terminated', 'verb_holding_changed']);
  // 持有变化与常住变化两条事件由同一个持有写者（kernel/holdings.mjs）发出，同列 kernel.emits（卷二 §2.7 :770；R18-1.10、R18-1.11）。
  assert.deepEqual(DECL.kernel.emits.slice().sort(), ['verb_domicile_changed', 'verb_entity_revived', 'verb_entity_terminated', 'verb_holding_changed']);
  assert.deepEqual(DECL.systems['sys.social'].emits, []);
  // 终止行 worthSlots.destroyed 含 id、kindFrom = cause（卷二 :524）。
  assert.deepEqual(entries.verb_entity_terminated.worthSlots, { destroyed: ['id'], moved: [], stake: [] });
  assert.equal(entries.verb_entity_terminated.kindFrom, 'cause');
  assert.equal(entries.verb_entity_revived.kindFrom, 'cause');
});
