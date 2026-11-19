// 块 5 第 5-4 张《终止与复生》：卷二 §2.6 实体终止协议 :519–:525、可终止实体类 :526、两个登记点 :527–:529、窗口期满 :530、
// 复生 :531；§2.5 :495 terminated 谓词；卷六 §4.1 规则 9 :380；卷十八 R18-1.2、R18-1.3、R18-1.8；卷九 R9-2.7 :667；
// 李白 11-18 22:10 丙3、丙4、丙7。测试先写；期望值按卷文规则手算成字面量，不抄仓库当前读数。只跑不推进世界的小检查（本机 F 盘）。
// 块 5 没有可终止的真类别行（人物、组织等实体表在块 6/7）：本文件在测试里造一张虚构 person 表、几条测试记录类与清理函数作前提，
// 不进 world/，不做测试 provider。
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
import { schedule } from '../../server-plugin/kernel/scheduler.mjs';
import { terminate, revive, registerTerminationCleanup, registerSuccessionOrder, installTermination, resetTermination, expireReviveWindow, checkTerminationTables, terminationResidue } from '../../server-plugin/kernel/terminate.mjs';
import { terminated, dead } from '../../server-plugin/action-capacity.mjs';
import { execute } from '../../server-plugin/primitives-runtime.mjs';
import { writePath } from '../../server-plugin/kernel/storage.mjs';
import { P } from '../../server-plugin/kernel/handles/generated.mjs';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { OPTIONS } from './fixture.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
installDigestCap(createDigestCap());
useReportSink(() => {});
const REAL_DECL = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));

const CAUSE = 'verb_entity_terminated';
const REVIVE_CAUSE = 'verb_entity_revived';
const CTX = { node: 'test_terminate', file: 'tests/kernel/terminate.test.mjs' };
// 测试世界的日长：取真实 _units 的 day/minute 换算（与内核同一出处），时刻按它拼。
const MPD = W.env.units.get('day').si / W.env.units.get('minute').si;
const DAY = 4;
const MINUTE = DAY * MPD + 10;

// ---------- 虚构 person 表（只在本进程） ----------
const vocabDoc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/dimensions/_vocab.json'), 'utf8'));
for (const c of ['class_test_mortal', 'class_test_spirit', 'class_test_orphan', 'class_test_guild', 'class_test_base']) vocabDoc.families.class.entries[c] = {};
const term = (mode, successorRX, reviveWindowDays) => ({ mode, successorRX, reviveWindowDays });
const personDoc = {
  kind: 'person', namespace: 'core', version: 1,
  entity: { idPrefix: ['npc_'], classPrefix: 'class_', singletonIds: [], instanceTable: null },
  behaviors: ['value'],
  dimensions: {
    heir: { type: 'ref', kind: 'person', required: 'never', onUnknown: 'skip', modifiable: false, source: 'test', owner: 'test' },
  },
  precedenceGroups: { default: ['class_test_mortal', 'class_test_spirit', 'class_test_orphan', 'class_test_guild'] },
  classes: {
    class_test_base: { abstract: true, basis: 'b' },
    class_test_mortal: { extends: 'class_test_base', termination: term('inherit', 'heir', 0), basis: 'b' },
    class_test_spirit: { extends: 'class_test_base', termination: term('inherit', 'heir', 3), basis: 'b' },
    class_test_orphan: { extends: 'class_test_base', termination: term('inherit', null, 0), basis: 'b' },
    class_test_guild: { extends: 'class_test_base', termination: term('liquidate', null, 0), basis: 'b' },
  },
  rows: {
    npc_a: { classes: ['class_test_mortal'], heir: 'npc_b', basis: 'b' },
    npc_b: { classes: ['class_test_mortal'], basis: 'b' },
    npc_c: { classes: ['class_test_mortal'], heir: 'npc_b', basis: 'b' },
    npc_s: { classes: ['class_test_spirit'], heir: 'npc_b', basis: 'b' },
    npc_o: { classes: ['class_test_orphan'], basis: 'b' },
    npc_g: { classes: ['class_test_guild'], basis: 'b' },
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
installVocab({ vocab: REP.vocab, idIndex: new Map([...W.idIndex, ...REP.idIndex, ['place_x', 'place'], ['org_h', 'org'], ['org_x', 'org']]), tables: TABLES });

// 测试记录类与去留取值（卷二 :529 三种去留；卷二十一 §3.3 :306–:307 的同类登记写法）。
const RECORDS = {
  rcls_test_conc: { atTerminate: 'clear' },
  rcls_test_immune: { atTerminate: 'hold', atRevive: 'keep' },
  rcls_test_dose: { atTerminate: 'hold', atRevive: 'clear' },
  rcls_test_rumor: { atTerminate: 'keep' },
};
function engineWith(over = {}) {
  const index = new Map(REP.vocab.index);
  for (const r of over.holdingRows || []) index.set(r.id, { family: 'holding_kind', prefix: 'hk_', entry: r });
  // 去留表：真实表的行（6-6 起有 revivals、created 等）加本文件的测试记录类；真实声明表里的键须都有取值（E-TERM-RECORD-UNLISTED）。
  const rules = { ...W.rules, terminate: { ...W.rules.terminate, records: { ...W.rules.terminate.records, ...RECORDS } }, ...(over.rules || {}) };
  return { vocab: { ...REP.vocab, index }, rules, units: W.env.units, tables: TABLES, template: { seed: 'test_terminate_seed' } };
}
const ENGINE = engineWith();
// 真实声明里 6-6 起有 sys.death（settleBody 的清理登记，只在死亡测试里交入）：本文件用虚构 person 表与自己的两个测试清理，不带它。
const { 'sys.death': _death, ...REAL_SYSTEMS } = REAL_DECL.systems;
const DECL = {
  stateKeys: {
    ...REAL_DECL.stateKeys,
    testConc: { readers: [], writers: { '*.*': 'test/conc.mjs' }, subjectRecords: { '*.*': { recordClass: 'rcls_test_conc', subjectSegments: [1] } } },
    testImmune: { readers: [], writers: { '*': 'test/immune.mjs' }, subjectRecords: { '*': { recordClass: 'rcls_test_immune', subjectSegments: [1] } } },
    testDose: { readers: [], writers: { '*': 'test/dose.mjs' }, subjectRecords: { '*': { recordClass: 'rcls_test_dose', subjectSegments: [1] } } },
    testRumor: { readers: [], writers: { '*.*': 'test/rumor.mjs' }, subjectRecords: { '*.*': { recordClass: 'rcls_test_rumor', subjectSegments: [1, 2] } } },
  },
  systems: {
    ...REAL_SYSTEMS,
    'sys.test_body': { tables: [], entryCallerFiles: {}, entryJudges: [], terminationCleanup: { kinds: ['person'], handler: 'test/body.mjs#settleBody', sortKey: 2 } },
    'sys.test_identity': { tables: [], entryCallerFiles: {}, entryJudges: [], terminationCleanup: { kinds: ['person'], handler: 'test/identity.mjs#closeIdentities', sortKey: 1 } },
    'sys.test_place': { tables: [], entryCallerFiles: {}, entryJudges: [], terminationCleanup: { kinds: ['place'], handler: 'test/place.mjs#ruin', sortKey: 1 } },
  },
};

const RES = { kind: 'res_building_share', key: 'bld_x' };
const PURPOSE = 'purpose_unmaterialized';

/** @type {{entries: any[]}} */
let book;
/** @type {string[]} */
let calls;
// 每个用例：装持有写者 engine、新事件日志、声明表与两个清理函数（记下调用次序与当时的状态读数）。
function fresh(engine = ENGINE, extra = {}) {
  installHoldingEngine(engine);
  book = { entries: [] };
  installEventLog(book);
  resetTermination();
  installTermination(DECL);
  calls = [];
  const probe = (name) => (eng, st, info) => calls.push({ name, info, marked: !!(st.terminated && st.terminated[info.id]), balance: st.accounts && st.accounts[info.id] ? st.accounts[info.id][PURPOSE][RES.kind][RES.key] : null });
  registerTerminationCleanup('test/body.mjs#settleBody', extra.body || probe('body'));
  registerTerminationCleanup('test/identity.mjs#closeIdentities', probe('identity'));
  return {
    clock: { minute: MINUTE, seq: 0, dueNext: 0 },
    accounts: { npc_a: { [PURPOSE]: { [RES.kind]: { [RES.key]: 7000 } } }, npc_b: { [PURPOSE]: { [RES.kind]: { [RES.key]: 1000 } } } },
    testConc: { npc_a: { drug_x: 3 }, npc_b: { drug_x: 1 } },
    testImmune: { npc_a: 5, npc_s: 6 },
    testDose: { npc_a: 2, npc_s: 4 },
    testRumor: { npc_a: { npc_b: 1 }, npc_b: { npc_a: 2 } },
  };
}

const run = (state, body) => runTransaction(state, CTX, body);
// 回滚按撤销项恢复值，键的先后可能变（删后再加回在末尾）：比较用键排序后的规范形。
const canon = (v) => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
const snapshot = (state) => JSON.stringify(canon(state));
function fails(state, body, code) {
  const before = snapshot(state);
  const n = book.entries.length;
  assert.deepEqual(run(state, body), { ok: false, code });
  assert.equal(snapshot(state), before, 'state unchanged after rollback');
  assert.equal(book.entries.length, n, 'no event left after rollback');
}
const edges = (state) => Object.entries(state.holdings || {}).flatMap(([h, es]) => Object.entries(es).map(([id, rec]) => ({ holder: h, id, rec })));
const active = (state) => edges(state).filter((e) => e.rec.terms.until === null);

// ---------- 五步与次序 ----------

test('终止五步：先定后继与清理（清理函数按 sortKey 次序、此时未标记、余额未动），再标记、分流、关边、发事件', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => { openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  const before = book.entries.length;
  let out;
  assert.deepEqual(run(state, (s) => { out = terminate(ENGINE, s, 'npc_a', CAUSE, null); }), { ok: true });
  assert.deepEqual(out, { mode: 'inherit', successorId: 'npc_b' });
  // 第 1 步：清理函数按 sortKey 升序（identity 1 在 body 2 之前），调用时尚无终止标记、账户尚未分流。
  assert.deepEqual(calls.map((c) => [c.name, c.marked, c.balance]), [['identity', false, 7000], ['body', false, 7000]]);
  assert.deepEqual(calls[0].info, { id: 'npc_a', cause: CAUSE, mode: 'inherit', successorId: 'npc_b' });
  // 第 2 步：标记只有代号与数值；day = floor(MINUTE / 日长) = DAY。
  assert.deepEqual(state.terminated, { npc_a: { day: DAY, cause: CAUSE, mode: 'inherit' } });
  // 第 3 步：7000 转给后继，后继 1000 + 7000 = 8000；本体余额 0（I1′：两人合计 8000 前后相等）。
  assert.equal(state.accounts.npc_a[PURPOSE][RES.kind][RES.key], 0);
  assert.equal(state.accounts.npc_b[PURPOSE][RES.kind][RES.key], 8000);
  // 第 4 步：常住边关闭（until = 终止时刻）。
  assert.equal(active(state).length, 0);
  assert.equal(edges(state)[0].rec.terms.until, MINUTE);
  // 第 5 步：终止事件是本笔最后一条，载荷照 :524。
  const mine = book.entries.slice(before);
  assert.deepEqual(mine.map((e) => e.verb), ['verb_holding_changed', 'verb_domicile_changed', 'verb_entity_terminated']);
  const ev = mine[mine.length - 1];
  const { id, cause, source, mode, successorId } = ev.payload;
  assert.deepEqual({ id, cause, source, mode, successorId }, { id: 'npc_a', cause: CAUSE, source: null, mode: 'inherit', successorId: 'npc_b' });
  assert.deepEqual(ev.targets, ['npc_a']);
  assert.equal(ev.actor, null);
  assert.deepEqual(terminationResidue(ENGINE, state, 'npc_a'), []);
});

test('任一步失败整笔回滚：清理函数抛错，标记、账户、边、事件都不落', () => {
  const state = fresh(ENGINE, { body: () => { throw Object.assign(new Error('boom'), { code: 'E-DIM-STRUCT-FIELD' }); } });
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-DIM-STRUCT-FIELD');
});

test('谓词 terminated／dead：只读终止标记；终止前假、终止后真且 reason 为 cause；dead 是同一函数', () => {
  const state = fresh();
  assert.equal(dead, terminated);
  assert.deepEqual(terminated(ENGINE, state, 'npc_a'), { ok: false, reason: null });
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.deepEqual(dead(ENGINE, state, 'npc_a'), { ok: true, reason: CAUSE });
});

test('终止后对该实体的写入一律拒写：开账户、开边都 E-TERM-RESIDUE；重复终止同码', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  fails(state, (s) => openAccount(ENGINE, s, 'npc_a', RES, PURPOSE), 'E-TERM-RESIDUE');
  fails(state, (s) => openHolding(ENGINE, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: CAUSE }), 'E-TERM-RESIDUE');
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-TERM-RESIDUE');
});

// ---------- 第 1 步：后继与可终止实体类 ----------

test('算不出后继退为 wreck，残骸要建行写者（未上线）整笔拒收；liquidate 要债权人（未上线）同拒', () => {
  const state = fresh();
  fails(state, (s) => terminate(ENGINE, s, 'npc_o', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  fails(state, (s) => terminate(ENGINE, s, 'npc_g', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  // 后继已终止也算不出后继（:520 后继须是未终止实体）：前提里先放 npc_b 的终止标记。
  state.terminated = { npc_b: { day: 1, cause: CAUSE, mode: 'inherit' } };
  fails(state, (s) => terminate(ENGINE, s, 'npc_c', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
});

test('liquidate 不改写成 wreck：债权人写者（卷六合同）未上线即按 liquidate 本身拒收，清理函数不跑', () => {
  const state = fresh();
  let message = null;
  fails(state, (s) => { try { terminate(ENGINE, s, 'npc_g', CAUSE, null); } catch (e) { message = e.message; throw e; } }, 'E-ACT-WRITER-NOT-READY');
  assert.match(message, /liquidate/);
  assert.doesNotMatch(message, /wreck/);
  assert.deepEqual(calls, []);
});

test('清理函数只许写本系统登记为写者的路径：写本系统路径通过，写别系统路径拒 E-VIEW-UNDECLARED-WRITE', () => {
  // created.*.props.* 的登记写者是 kernel/dimension-writers.mjs（真实声明表）；按清理函数所在文件分正反两例。
  const decl = (file) => ({ stateKeys: DECL.stateKeys, systems: { 'sys.test_names': { tables: [], entryCallerFiles: {}, entryJudges: [], terminationCleanup: { kinds: ['person'], handler: `${file}#closeNames`, sortKey: 1 } } } });
  const writeSeq = (eng, st, info) => writePath(st, P.created_props(info.id, 'heir'), 'npc_c');
  for (const [file, want] of [['kernel/dimension-writers.mjs', { ok: true }], ['test/body.mjs', { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' }]]) {
    const state = fresh();
    resetTermination();
    installTermination(decl(file));
    registerTerminationCleanup(`${file}#closeNames`, writeSeq);
    if (want.ok) {
      assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), want);
      assert.equal(state.created.npc_a.props.heir, 'npc_c');
    } else {
      fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), want.code);
    }
  }
});

test('不可终止实体：实体表未载入拒 E-ACT-WRITER-NOT-READY；cause 不是 verb 拒 E-EVT-VERB；未载入 id 拒 E-DIM-REF-MISSING', () => {
  const state = fresh();
  fails(state, (s) => terminate(ENGINE, s, 'org_x', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', 'act_not_a_verb', null), 'E-EVT-VERB');
  fails(state, (s) => terminate(ENGINE, s, 'npc_zz', CAUSE, null), 'E-DIM-REF-MISSING');
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, '中文'), 'E-DIM-ID-FORMAT');
});

test('声明表未交入（installTermination）即整笔拒收，不静默跳过清理与去留', () => {
  const state = fresh();
  resetTermination();
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
});

test('清理函数登记名须对上声明表 terminationCleanup.handler：先交声明表后登记、先登记后交声明表，对不上都拒 E-DIM-REF-MISSING', () => {
  fresh();
  assert.throws(() => registerTerminationCleanup('test/other.mjs#stray', () => {}), (e) => e.code === 'E-DIM-REF-MISSING');
  resetTermination();
  registerTerminationCleanup('test/other.mjs#stray', () => {});
  assert.throws(() => installTermination(DECL), (e) => e.code === 'E-DIM-REF-MISSING');
  resetTermination();
  registerTerminationCleanup('test/body.mjs#settleBody', () => {});
  installTermination(DECL);
});

test('登记了清理函数但没交入：整笔拒收 E-ACT-WRITER-NOT-READY；同一 ref 交两次 E-WRITER-DUPLICATE', () => {
  const state = fresh();
  assert.throws(() => registerTerminationCleanup('test/body.mjs#settleBody', () => {}), (e) => e.code === 'E-WRITER-DUPLICATE');
  assert.throws(() => registerTerminationCleanup('not a ref', () => {}), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  resetTermination();
  installTermination(DECL);
  registerTerminationCleanup('test/identity.mjs#closeIdentities', () => {});
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
});

test('清理函数里调 terminate 即拒（:528 不得调 terminate、revive）', () => {
  const state = fresh(ENGINE, { body: (eng, st) => terminate(eng, st, 'npc_c', CAUSE, null) });
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-VIEW-UNDECLARED-WRITE');
});

// ---------- 去留表（:529） ----------

test('去留表：窗口为 0 时 clear 与 hold 在第 1 步删，keep 原样；只删主体段等于本体的路径，旁人的不动', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  // 整条删除路径（叶子 testConc.npc_a.drug_x），只删不改值；空的上层对象留着不算记录。
  assert.deepEqual(state.testConc, { npc_a: {}, npc_b: { drug_x: 1 } });
  assert.deepEqual(state.testImmune, { npc_s: 6 });
  assert.deepEqual(state.testDose, { npc_s: 4 });
  assert.deepEqual(state.testRumor, { npc_a: { npc_b: 1 }, npc_b: { npc_a: 2 } });
});

test('去留表：窗口 > 0 时 hold 留到窗口期满（期满删 hold，标记不动），clear 照删', () => {
  const state = fresh();
  state.testConc.npc_s = { drug_x: 9 };
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_s', CAUSE, null)), { ok: true });
  assert.deepEqual(state.testConc.npc_s, {});
  assert.equal(state.testImmune.npc_s, 6);
  assert.equal(state.testDose.npc_s, 4);
  // 窗口到期项：owner 为本体、种类 due_revive_window，到期时刻 = (终止日 + 3) 日的起点。
  const due = Object.values(state.due);
  assert.deepEqual(due.map((d) => [d.kind, d.owner, d.dueMinute]), [['due_revive_window', 'npc_s', (DAY + 3) * MPD]]);
  assert.deepEqual(run(state, (s) => expireReviveWindow(ENGINE, s, due[0])), { ok: true });
  assert.equal(state.testImmune.npc_s, undefined);
  assert.equal(state.testDose.npc_s, undefined);
  assert.deepEqual(state.terminated.npc_s, { day: DAY, cause: CAUSE, mode: 'inherit' });
});

test('记录类在规则表没有取值即 E-TERM-RECORD-UNLISTED（运行期同码）', () => {
  const engine = engineWith({ rules: { terminate: { records: { rcls_test_conc: { atTerminate: 'clear' } } } } });
  const state = fresh(engine);
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-TERM-RECORD-UNLISTED');
});

// ---------- 第 3 步：账户分流（卷六规则 9） ----------

test('账户分流：sink 登记为未建（rules.terminate.unbuilt）拒 E-ACT-WRITER-NOT-READY；未登记又未建拒 E-DIM-STRUCT-FIELD；remains 要残骸拒 E-ACT-WRITER-NOT-READY', () => {
  const row = W.rules.economyResources.res_building_share;
  assert.deepEqual(W.rules.terminate.unbuilt.onTerminate, ['sink']);
  const withMode = (onTerminate, unbuilt) => engineWith({ rules: { terminate: { records: RECORDS, unbuilt }, economyResources: { ...W.rules.economyResources, res_building_share: { ...row, onTerminate } } } });
  for (const [engine, code] of [
    [withMode('sink', W.rules.terminate.unbuilt), 'E-ACT-WRITER-NOT-READY'],
    [withMode('sink', { onTerminate: [], card: 'pre_first_reader_card' }), 'E-DIM-STRUCT-FIELD'],
    [withMode('remains', W.rules.terminate.unbuilt), 'E-ACT-WRITER-NOT-READY'],
  ]) {
    const state = fresh(engine);
    fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), code);
  }
  // 加载期：已建的取值登进未建表即报
  const bad = engineWith({ rules: { terminate: { records: RECORDS, unbuilt: { onTerminate: ['sink', 'successor'], card: 'pre_first_reader_card' } } } });
  assert.deepEqual(checkTerminationTables(bad, { stateKeys: {}, systems: {} }).map((e) => e.split(' ')[0]), ['E-DIM-STRUCT-FIELD']);
});

test('账户分流：余额为 0 的账户不过账，提交后核对不报', () => {
  const state = fresh();
  state.accounts.npc_a[PURPOSE][RES.kind][RES.key] = 0;
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.equal(state.accounts.npc_b[PURPOSE][RES.kind][RES.key], 1000);
});

// ---------- 第 4 步：持有边（R18-1.2、R18-1.3、R18-1.8；丙7） ----------

const testRow = (over) => ({
  id: 'hk_test_x', hyper: null, from: ['agent'], to: ['agent', 'thing', 'place'], exclusive: false,
  gone: 'ho_close', vacated: 'ho_close', defected: null, subjectEnd: 'send_close',
  concluded: false, functional: false, membership: false, headship: false, carriesRel: false,
  conduct: 0, conductBack: 0, adopt: 0, pins: 'pside_none',
  intimate: false, bodyControl: false, holderMax: null, succeedBy: null, excludes: false,
  grantsEntry: false, entryRankMax: null, visibility: 'public', contest: null, capacityKey: null,
  transferable: false, incompatible: [], grants: [], hooks: [], termsKeys: [], shareSum: null,
  grantedBy: [], domicile: false, holdWhile: null, revival: null, admission: null, uniqueTriple: false,
  ...over,
});

test('协议乙：以它为标的的边一律解除；协议甲 gone = 关闭的边关闭', () => {
  const engine = engineWith({ holdingRows: [testRow({})] });
  const state = fresh(engine);
  assert.deepEqual(run(state, (s) => {
    openHolding(engine, s, { holdingKind: 'hk_test_x', holder: 'npc_b', subject: 'npc_a', cause: CAUSE });
    openHolding(engine, s, { holdingKind: 'hk_test_x', holder: 'npc_a', subject: 'place_x', cause: CAUSE });
  }), { ok: true });
  assert.deepEqual(run(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.equal(active(state).length, 0);
  assert.deepEqual(edges(state).map((e) => e.rec.terms.until), [MINUTE, MINUTE]);
});

test('按候补顺序移交：列表为空或全已终止按关闭；有未终止接班人要协议转移（持有写者未建）整笔拒收；入口未交入同拒', () => {
  const row = testRow({ id: 'hk_test_head', gone: 'ho_succeed', succeedBy: 'regime_head' });
  const engine = engineWith({ holdingRows: [row] });
  const open = (state) => assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_head', holder: 'npc_a', subject: 'org_h', cause: CAUSE }); }), { ok: true });
  // 入口未交入
  let state = fresh(engine);
  open(state);
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  // 列表只有本体与已终止者 → 关闭
  state = fresh(engine);
  state.terminated = { npc_x: { day: 1, cause: CAUSE, mode: 'inherit' } };
  registerSuccessionOrder('regime_head', () => ['npc_a', 'npc_x']);
  open(state);
  assert.deepEqual(run(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.equal(active(state).length, 0);
  // 有未终止接班人 → 要协议转移，未建即拒
  state = fresh(engine);
  registerSuccessionOrder('regime_head', () => ['npc_b']);
  open(state);
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  // 入口返回值不是实体列表 → E-DIM-STRUCT-FIELD
  state = fresh(engine);
  registerSuccessionOrder('regime_head', () => 'npc_b');
  open(state);
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-DIM-STRUCT-FIELD');
});

test('回到授予者：授予者为空按关闭；授予者在世要协议转移（未建）整笔拒收；其余未接线的格（如 ho_estate）同拒', () => {
  const row = testRow({ id: 'hk_test_fief', gone: 'ho_revert', vacated: 'ho_close' });
  const engine = engineWith({ holdingRows: [row, testRow({ id: 'hk_test_estate', gone: 'ho_estate' })] });
  let state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_fief', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null)), { ok: true });
  state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_fief', holder: 'npc_a', subject: 'place_x', terms: { grantor: 'npc_b' }, cause: CAUSE }); }), { ok: true });
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
  state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_estate', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
});

test('丙7：带关系的边（carriesRel）在第 4 步关闭即整笔拒收 E-ACT-WRITER-NOT-READY，不关边不回填史实', () => {
  const state = fresh();
  state.holdings = { npc_a: { hld_9: { kind: 'hk_companion', holder: 'npc_a', subject: 'npc_b', terms: { since: 0, until: null, endReason: null, suspended: false, consentAct: null, grantor: null, rel: null }, grantedBy: null } } };
  fails(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null), 'E-ACT-WRITER-NOT-READY');
});

test('残余核对：持有者终止格不适用（null）的边留着即 E-TERM-RESIDUE 整笔回滚', () => {
  const engine = engineWith({ holdingRows: [testRow({ id: 'hk_test_null', gone: null })] });
  const state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_null', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  fails(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null), 'E-TERM-RESIDUE');
});

test('复生点边（6-6 起路径已登记）：窗口 > 0 关边并整组覆盖 revivals.<主体>.points（每条边一项：持有种类、标的）；窗口为 0 只关边、不记点', () => {
  const engine = engineWith({ holdingRows: [testRow({ id: 'hk_test_rev', revival: 'rev_test' })] });
  let state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_rev', holder: 'npc_s', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, (s) => terminate(engine, s, 'npc_s', CAUSE, null)), { ok: true });
  assert.equal(active(state).length, 0);
  assert.deepEqual(state.revivals, { npc_s: { points: [{ kind: 'hk_test_rev', counterpart: 'place_x' }] } });
  state = fresh(engine);
  assert.deepEqual(run(state, (s) => { openHolding(engine, s, { holdingKind: 'hk_test_rev', holder: 'npc_a', subject: 'place_x', cause: CAUSE }); }), { ok: true });
  assert.deepEqual(run(state, (s) => terminate(engine, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.equal(active(state).length, 0);
  assert.equal(state.revivals, undefined);
});

// ---------- 第 5 步：到期项 ----------

test('到期项：以它为 owner 或 ref 的到期项经 cancel 撤销，别人的不动；窗口为 0 不登记窗口项', () => {
  const state = fresh();
  assert.deepEqual(run(state, () => {
    schedule('npc_a', 'due_recurrence', 30, 'npc_b');
    schedule('npc_b', 'due_recurrence', 30, 'npc_a');
    schedule('npc_b', 'due_recurrence', 30, 'npc_b');
  }), { ok: true });
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  assert.deepEqual(Object.values(state.due).map((d) => [d.owner, d.ref]), [['npc_b', 'npc_b']]);
});

// ---------- 复生（:531） ----------

test('复生：窗口内（当前日 − 终止日 < 3）通过；删标记、撤销窗口项、删 atRevive = clear 的 hold 记录、keep 的留下；已分流的不还原', () => {
  const state = fresh();
  state.accounts.npc_s = { [PURPOSE]: { [RES.kind]: { [RES.key]: 500 } } };
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_s', CAUSE, null)), { ok: true });
  state.clock.minute = (DAY + 2) * MPD + 10;
  const before = book.entries.length;
  assert.deepEqual(run(state, (s) => revive(ENGINE, s, 'npc_s', REVIVE_CAUSE)), { ok: true });
  assert.deepEqual(state.terminated, {});
  assert.deepEqual(state.due, {});
  assert.equal(state.testImmune.npc_s, 6); // hold + keep
  assert.equal(state.testDose.npc_s, undefined); // hold + clear
  assert.equal(state.accounts.npc_s[PURPOSE][RES.kind][RES.key], 0);
  assert.equal(state.accounts.npc_b[PURPOSE][RES.kind][RES.key], 1500);
  assert.deepEqual(book.entries.slice(before).map((e) => [e.verb, e.payload.id, e.payload.cause]), [['verb_entity_revived', 'npc_s', REVIVE_CAUSE]]);
  assert.deepEqual(terminated(ENGINE, state, 'npc_s'), { ok: false, reason: null });
});

test('复生窗口边界：当前日 − 终止日 = 3 即拒 E-TERM-REVIVE-DENIED；窗口为 0 终止当日也拒；没有终止标记拒', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => { terminate(ENGINE, s, 'npc_s', CAUSE, null); terminate(ENGINE, s, 'npc_a', CAUSE, null); }), { ok: true });
  fails(state, (s) => revive(ENGINE, s, 'npc_a', REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  fails(state, (s) => revive(ENGINE, s, 'npc_b', REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  state.clock.minute = (DAY + 3) * MPD;
  fails(state, (s) => revive(ENGINE, s, 'npc_s', REVIVE_CAUSE), 'E-TERM-REVIVE-DENIED');
  state.clock.minute = (DAY + 3) * MPD - 1;
  assert.deepEqual(run(state, (s) => revive(ENGINE, s, 'npc_s', REVIVE_CAUSE)), { ok: true });
});

// ---------- destroy 适配器（K5-14） ----------

test('destroy 原语：块 5 内 execute 因 emit 适配器未上线整批拒收 E-ACT-WRITER-NOT-READY，状态不变（既定口径）', () => {
  const state = fresh();
  fails(state, (s) => execute(ENGINE, s, [{ op: 'destroy', entity: 'npc_a' }, { op: 'emit', verb: CAUSE, visibility: 'public' }], 'act_test'), 'E-ACT-WRITER-NOT-READY');
});

// 适配器本体被 execute 的 emit 前置检查拒住、走不到（ADAPTERS 不导出）；这里在内核层直接测它调用的写者路径：
// destroy(engine, state, p, reason) = terminate(engine, state, p.entity, reason, null)——reason 是本批 emit 的 verb，source 恒为 null。
test('destroy 适配器所调写者路径：terminate(entity, emit 的 verb, null) 完成五步，终止事件 source 为 null、cause 为该 verb', () => {
  const state = fresh();
  assert.deepEqual(run(state, (s) => terminate(ENGINE, s, 'npc_a', CAUSE, null)), { ok: true });
  const ev = book.entries[book.entries.length - 1];
  assert.deepEqual([ev.verb, ev.payload.id, ev.payload.cause, ev.payload.source], ['verb_entity_terminated', 'npc_a', CAUSE, null]);
  assert.deepEqual(state.terminated.npc_a, { day: DAY, cause: CAUSE, mode: 'inherit' });
});

// ---------- 加载期核对（:526 ①、:528、:529；丙4） ----------

test('真实 world：终止登记核对 0 违例，去留表覆盖核对 0 违例（丙4）', () => {
  assert.deepEqual(checkTerminationTables({ rules: W.rules, tables: W.tables }, REAL_DECL), []);
  assert.deepEqual(W.errors.filter((e) => e.code === 'E-TERM-RECORD-UNLISTED'), []);
  assert.deepEqual(checkTerminationTables(ENGINE, DECL), []);
});

test('加载期核对：atRevive 只在 hold 时写；记录类无取值；主体段序号越界；清理登记缺字段；类别行 termination 整表不一致', () => {
  const bad = engineWith({ rules: { terminate: { records: { rcls_a: { atTerminate: 'hold' }, rcls_b: { atTerminate: 'clear', atRevive: 'keep' }, rcls_c: { atTerminate: 'hold', atRevive: 'hold' } } } } });
  const decl = {
    stateKeys: { k: { subjectRecords: { '*': { recordClass: 'rcls_none', subjectSegments: [2] } } } },
    systems: { 'sys.x': { terminationCleanup: { kinds: ['person'], handler: 'x', sortKey: 1 } } },
  };
  const errs = checkTerminationTables(bad, decl).map((e) => e.split(' ').slice(0, 2).join(' '));
  assert.deepEqual(errs, ['E-DIM-STRUCT-FIELD rcls_a:', 'E-DIM-STRUCT-FIELD rcls_b:', 'E-DIM-STRUCT-FIELD rcls_c:', 'E-DIM-STRUCT-FIELD k.*:', 'E-TERM-RECORD-UNLISTED k.*:', 'E-DIM-STRUCT-FIELD sys.x:']);
  const partial = { ...personDoc, classes: { ...personDoc.classes, class_test_orphan: { extends: 'class_test_base', basis: 'b' } } };
  const tables = new Map([['person', { doc: partial }]]);
  assert.deepEqual(checkTerminationTables({ rules: ENGINE.rules, tables }, { stateKeys: {}, systems: {} }), ['E-DIM-REQUIRED-MISSING person: termination is written on every non-abstract class row or on none (3/4)']);
});

test('覆盖核对：可终止实体类的键须有 subjectRecords（mergeStateOwners 同码），测试键有登记即不报', () => {
  const decl = JSON.parse(JSON.stringify(REAL_DECL));
  decl.stateKeys.testConc = { readers: [], writers: { '*.*': 'test/conc.mjs' } };
  decl.pathTypes['testConc.*.*'] = 'integer:count';
  decl.keyKinds['testConc.*.*'] = [['person'], 'handle'];
  const ctx = { units: W.env.units, kinds: new Set(TABLES.keys()), families: new Set(W.vocab.families.keys()), terminableKinds: ['person'] };
  assert.ok(mergeStateOwners(decl, ctx).errors.some((e) => e.code === 'E-TERM-RECORD-UNLISTED' && e.row === 'testConc.*.*'));
  decl.stateKeys.testConc.subjectRecords = { '*.*': { recordClass: 'rcls_test_conc', subjectSegments: [1] } };
  assert.ok(!mergeStateOwners(decl, ctx).errors.some((e) => e.row === 'testConc.*.*'));
});
