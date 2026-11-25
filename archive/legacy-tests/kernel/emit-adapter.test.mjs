// G13（6-8）emit 适配器：卷九 R9-2.3（成功后恰产出一条以本事务原语为 primitives 的事件）、R9-2.10（事务内、事件落定之前对该事件调一次卷五 perceiveEvent，结果原样写进 witnesses）、A9-2.1；
// 对照表 docs/迁移体检/格子G12-G16-规矩检查对照.md #31、#87。适配器本体在 server-plugin/primitives-runtime.mjs（经 execute 走）；夹具见 perceive-world.mjs。
// 事务事件的 actor、targets、payload、id 成分来自提交段（resolve()，6-14），execute 的第五个参数 event 就是这份上下文；没有它按卷九 §2.9 无从取值，整笔在写入前拒收（既有口径，primitives-runtime.test.mjs）。
// propagate 与 envAt 经 registerPropagate、registerEnvAt 交入测试替身（见 perceive.test.mjs 头注）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE, pos, fresh } from './perceive-world.mjs';
import { execute, primitiveContract } from '../../server-plugin/primitives-runtime.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog, resetEventLog } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { perceiveEvent, sourceLevelsOf, registerPropagate, registerEnvAt, resetPerceptionPorts } from '../../server-plugin/perceive.mjs';

useReportSink(() => {});
const SRC = pos(22, 122);
const VERB = { parent: null, payloadShape: {}, kindFrom: null, kindOnly: false, worthSlots: { destroyed: [], moved: [], stake: [] }, headSlot: null, sigBase: 0, tallies: [], perceivable: true, senses: ['sense_sight', 'sense_hearing'], visibilityAllowed: ['private', 'public', 'witnessed'], scandal: false, calendarBound: false };
const EV = { ...ENGINE, vocab: { ...ENGINE.vocab, index: new Map([...ENGINE.vocab.index, ['verb_test_loud', { family: 'verb', prefix: 'verb_', entry: VERB }]]) } };
const CTX = { node: 'test_setup', file: 'tests/kernel/emit-adapter.test.mjs' };
const PEOPLE = {
  npc_act: { pos: SRC, species: 'species_test_a' },
  npc_in: { pos: pos(22, 119), species: 'species_test_a' },
  npc_blind: { pos: pos(24, 121), species: 'species_test_blind' },
  npc_far: { pos: pos(22, 290), species: 'species_test_a' },
};
const EMIT = { op: 'emit', verb: 'verb_test_loud', visibility: 'public' };
const eventCtx = (extra = {}) => ({ actor: 'npc_act', targets: ['npc_in'], payload: { place: 'loc_a', pos: SRC }, idParts: { rule: 'act_test', subject: 'npc_act', position: 'pos.commit' }, ...extra });

// 交入替身并记下 propagate 的调用次数。
function ports() {
  resetPerceptionPorts();
  const calls = [];
  registerPropagate((eng, st, channel, src, obs, level) => { calls.push([channel, level]); return 0.5; });
  registerEnvAt(() => 100);
  return calls;
}
const fresh_ = () => { const book = { entries: [] }; installEventLog(book); return book; };

test('#31 R9-2.10 事务内恰对该事件调一次 perceiveEvent、结果原样写进 witnesses：事件的 witnesses 等于直接调 perceiveEvent 的返回（手算：到达 0.5、能力 1、阈值 0.2 → 听视各 0.3，盲者只有听觉，npc_far 168 m 外不在）；propagate 的调用次数与直接调一次相同（没有二次求目击）', () => {
  const book = fresh_();
  const calls = ports();
  const s = fresh(PEOPLE);
  const direct = perceiveEvent(EV, s, { verb: 'verb_test_loud', visibility: 'public', actor: 'npc_act', targets: ['npc_in'], place: 'loc_a', pos: SRC, sourceLevels: sourceLevelsOf(EV, s, 'npc_act') });
  const once = calls.length;
  assert.ok(once > 0);
  assert.deepEqual(direct.map((w) => [w.observer, w.senses.map((x) => [x.sense, x.margin])]), [['npc_blind', [['sense_hearing', 0.3]]], ['npc_in', [['sense_hearing', 0.3], ['sense_sight', 0.3]]]]);
  calls.length = 0;
  const r = runTransaction(s, CTX, (st) => execute(EV, st, [EMIT], 'act_test', eventCtx()));
  assert.deepEqual(r, { ok: true });
  assert.equal(calls.length, once, '事务内只算一次');
  assert.equal(book.entries.length, 1);
  assert.deepEqual(book.entries[0].witnesses, direct);
  resetEventLog();
});

test('R9-2.3 成功后恰产出一条以本事务原语为 primitives 的事件：primitives 是本批排好序的原语列表，verb、visibility 取自 emit 原语，actor、targets、payload 取提交段上下文，cause 取 execute 的 cause', () => {
  const book = fresh_();
  ports();
  const s = fresh(PEOPLE);
  assert.deepEqual(runTransaction(s, CTX, (st) => execute(EV, st, [EMIT], 'act_test', eventCtx())), { ok: true });
  assert.equal(book.entries.length, 1);
  const e = book.entries[0];
  assert.deepEqual([e.verb, e.visibility, e.actor, e.targets, e.cause, e.minute], ['verb_test_loud', 'public', 'npc_act', ['npc_in'], 'act_test', 1234]);
  assert.deepEqual(e.primitives, [EMIT]);
  assert.deepEqual(e.payload, { place: 'loc_a', related: [], causedBy: [], pos: SRC });
  resetEventLog();
});

test('R9-2.3 适配器回滚整批：同一事务里 execute 之后再失败，事件（连同 witnesses）一并撤销，日志与状态逐位不变', () => {
  const book = fresh_();
  ports();
  const s = fresh(PEOPLE);
  const before = JSON.stringify(s);
  const r = runTransaction(s, CTX, (st) => {
    execute(EV, st, [EMIT], 'act_test', eventCtx());
    assert.equal(book.entries.length, 1, '事务内已写');
    throw Object.assign(new Error('E-ACT-PRIMITIVE after emit'), { code: 'E-ACT-PRIMITIVE', fields: {} });
  });
  assert.deepEqual(r, { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.equal(book.entries.length, 0);
  assert.equal(JSON.stringify(s), before);
  resetEventLog();
});

test('R9-2.10 private 事件 witnesses 为空表（档位全在 perceiveEvent 内，适配器不按档分支）', () => {
  const book = fresh_();
  ports();
  const s = fresh(PEOPLE);
  runTransaction(s, CTX, (st) => execute(EV, st, [{ ...EMIT, visibility: 'private' }], 'act_test', eventCtx()));
  assert.deepEqual(book.entries[0].witnesses, []);
  resetEventLog();
});

test('R9-2.3 一批至多一条 emit（恰一条事件）：两条 emit 整批在写入前拒收 E-ACT-PRIMITIVE；有 emit 而没有提交段上下文仍整笔拒收 E-ACT-WRITER-NOT-READY，日志与状态不变', () => {
  const book = fresh_();
  ports();
  const s = fresh(PEOPLE);
  const before = JSON.stringify(s);
  assert.deepEqual(runTransaction(s, CTX, (st) => execute(EV, st, [EMIT, { ...EMIT, visibility: 'private' }], 'act_test', eventCtx())), { ok: false, code: 'E-ACT-PRIMITIVE' });
  assert.deepEqual(runTransaction(s, CTX, (st) => execute(EV, st, [EMIT], 'act_test')), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.deepEqual(runTransaction(s, CTX, (st) => execute(EV, st, [EMIT], 'act_test', { actor: 'npc_act' })), { ok: false, code: 'E-ACT-WRITER-NOT-READY' }, 'idParts 缺');
  assert.equal(book.entries.length, 0);
  assert.equal(JSON.stringify(s), before);
  resetEventLog();
});

test('emit 在其他原语之后（目录固定序）：同批 move 先落位，事件没给 pos 时取行为人"此刻"的 pos——move 把 npc_act 移到 loc_b 的代表格，名单是 loc_b 一带的 npc_b，而不是原处 loc_a 的人', () => {
  const book = fresh_();
  ports();
  const s = fresh({ ...PEOPLE, npc_b: { pos: pos(150, 150), species: 'species_test_a' } });
  const batch = [EMIT, { op: 'move', to: 'loc_b', subject: 'npc_act' }];
  // 事务的节点文件是登记的委托方 primitives-runtime.mjs（systems.position.writeDelegations），move 经它委托 position.mjs#placeSubject。
  const r = runTransaction(s, { node: 'commit', file: 'primitives-runtime.mjs' }, (st) => execute(EV, st, batch, 'act_test', eventCtx({ payload: { place: 'loc_b' } })));
  assert.deepEqual(r, { ok: true });
  assert.equal(book.entries.length, 1);
  const seen = book.entries[0].witnesses.map((w) => w.observer);
  assert.ok(seen.includes('npc_b'), `移到 loc_b 后 npc_b 听得到：${seen}`);
  assert.ok(!seen.includes('npc_in'), '原处的 npc_in 离新位置很远');
  assert.deepEqual(book.entries[0].primitives, [{ op: 'move', to: 'loc_b', subject: 'npc_act' }, EMIT], 'primitives 按目录固定序：move 在 emit 之前');
  resetEventLog();
});

// ---------- A9-2.1 适配器文件（卷九 A9-2.1 :684；对照表 #87：不新造检测器，实体 id 字面量另由 vol2.S1 扫描守） ----------

const RUNTIME = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'server-plugin', 'primitives-runtime.mjs'), 'utf8');
const CODE_ONLY = RUNTIME.split('\n').filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*') && !line.trim().startsWith('/**')).join('\n');

test('A9-2.1 适配器文件里实体 id 字面量数为 0（按各实体表前缀逐个查，代码部分、不含注释）', () => {
  for (const prefix of ['npc_', 'item_', 'org_', 'loc_', 'bld_', 'species_', 'faith_', 'deity_', 'lore_', 'skill_']) {
    assert.equal(new RegExp(`['"\`]${prefix}[a-z0-9_]+['"\`]`).test(CODE_ONLY), false, prefix);
  }
});

test('A9-2.1 原语目录之外的原语名在适配器文件里出现次数为 0：适配器表的键与代码里 op: 字面量都是目录里的原语（primitiveContract 认得）', () => {
  // 适配器表 ADAPTERS 一段（到创建例程表 CREATORS 为止；CREATORS 的键是实体类，不是原语）。
  const block = CODE_ONLY.slice(CODE_ONLY.indexOf('const ADAPTERS'), CODE_ONLY.indexOf('const CREATORS'));
  const adapterKeys = [...block.matchAll(/^ {2}'?([a-z.]+)'?\(engine, state, p/gm)].map((m) => m[1]);
  assert.ok(adapterKeys.includes('emit') && adapterKeys.includes('move') && adapterKeys.includes('transfer'), `适配器表键：${adapterKeys}`);
  for (const op of adapterKeys) assert.doesNotThrow(() => primitiveContract(op), op);
  const literalOps = [...CODE_ONLY.matchAll(/\bop: '([a-z.]+)'/g)].map((m) => m[1]);
  for (const op of literalOps) assert.doesNotThrow(() => primitiveContract(op), op);
  assert.throws(() => primitiveContract('item.create'), /E-ACT-PRIMITIVE/);
});
