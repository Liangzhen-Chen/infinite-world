// 块 2 第 2-3 张《读写、事务、报告》：readPath/writePath/readSealed/writeSealed、事务整笔拒写三件处置、report 与 reportError。
// 依据卷二 §2.6"按路径读写"第 1–4 条与"事务内拒写的处置"（:493–503）、"持有存续条件的提交前重算钩子"（:505）、§2.7 kernelApi :580–581、:590、:612–615、:630–631、
// §2.9 第 1 条 catch 变量与 report.mjs 出口、第 3 条 readSealed/writeSealed；卷二十七 R27-4.4（未声明路径写不进状态）。
// 测试用的声明表是本文件造的虚构顶层键（gauge、notes、terminated），不是世界内容；期望值一律手写字面量。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { buildP, buildE } from '../../server-plugin/kernel/handles/generated.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installStorage, readPath, writePath, readSealed, writeSealed, installCredentialCheck } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction, submitProposal, installProposalSession, registerHoldWhileRecompute, resetHoldWhileRecompute } from '../../server-plugin/kernel/transaction.mjs';
import { report, useReportSink, checkFields } from '../../server-plugin/kernel/report.mjs';
import { reportError, KernelError } from '../../server-plugin/kernel/errors.mjs';

const E = buildE();

const DECL = {
  stateKeys: {
    gauge: { readers: [], writers: { '*.level': 'sys/gauge.mjs', '*.grade': 'sys/gauge.mjs', '*.dims.*': 'sys/gauge.mjs', '*.seal': 'sys/gauge.mjs', '*.born': { create: ['sys/maker.mjs'], rewrite: null, viaRelocate: false } } },
    notes: { readers: [], writers: {} },
    terminated: { readers: [], writers: { '*': 'kernel/terminate.mjs' } },
  },
  systems: {},
  textPaths: ['notes.*.text'],
  textWriters: { 'notes.*.text': 'gate/note.mjs' },
  pathTypes: {
    'gauge.*.level': 'integer:count',
    'gauge.*.grade': 'enum:grade',
    'gauge.*.dims.*': 'dimension',
    'gauge.*.seal': 'list<EventId>',
    'gauge.*.born': 'integer:count',
    'notes.*.text': 'sealed',
    'terminated.*': 'struct:terminated',
  },
  keyKinds: {
    'gauge.*.level': ['gadget'], 'gauge.*.grade': ['gadget'], 'gauge.*.dims.*': ['gadget', 'dimKey'], 'gauge.*.seal': ['gadget'], 'gauge.*.born': ['gadget'],
    'terminated.*': [['gadget']],
  },
  phases: [],
};

const merged = mergeStateOwners(DECL, { units: new Set(['count']), kinds: new Set(['gadget']) });
const P = buildP(DECL);

installVocab({
  vocab: { families: new Map([['grade', { name: 'grade', prefix: 'grd_', closed: true, entries: { grd_a: {} } }]]), index: new Map([['grd_a', { family: 'grade', prefix: 'grd_', entry: {} }]]) },
  idIndex: new Map([['gad_one', 'gadget'], ['gad_two', 'gadget']]),
  tables: new Map(),
});
installStorage(merged.merged);

const logs = [];
useReportSink((rec) => logs.push(rec));

const GAUGE = { node: 'view:gauge', file: 'sys/gauge.mjs' };
const fresh = () => ({ gauge: { gad_one: { level: 1 } } });

test('测试声明表本身合并通过（前提）', () => {
  assert.equal(merged.ok, true, merged.text);
});

test('readPath：P 句柄给的路径读得到值，返回副本', () => {
  const st = { gauge: { gad_one: { dims: { mass: [1, 2] } } } };
  const v = readPath(st, P.gauge_dims('gad_one', 'mass'));
  assert.deepEqual(v, [1, 2]);
  v.push(3);
  assert.deepEqual(st.gauge.gad_one.dims.mass, [1, 2]);
  assert.equal(readPath(st, P.gauge_level('gad_two')), undefined);
});

test('readPath/writePath：非 StatePath 实参（未声明模式、textPath、非字串、空段）一律 E-PATH-UNDECLARED', () => {
  const st = fresh();
  for (const bad of ['gauge.gad_one.color', 'notes.nt_one.text', 'gauge..level', 42, null, undefined]) {
    assert.throws(() => readPath(st, bad), (e) => e.code === 'E-PATH-UNDECLARED', String(bad));
  }
  logs.length = 0;
  const r = runTransaction(st, GAUGE, (s) => { writePath(s, P.gauge_level('gad_one'), 2); writePath(s, 'gauge.gad_one.color', 1); });
  assert.deepEqual(r, { ok: false, code: 'E-PATH-UNDECLARED' });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
});

test('writePath：事务外调用即拒 E-VIEW-UNDECLARED-WRITE', () => {
  assert.throws(() => writePath(fresh(), P.gauge_level('gad_one'), 2), (e) => e.code === 'E-VIEW-UNDECLARED-WRITE');
});

test('writePath：登记写者在事务内写入并提交；中间层自动补对象', () => {
  const st = fresh();
  const r = runTransaction(st, GAUGE, (s) => {
    writePath(s, P.gauge_level('gad_one'), 5);
    writePath(s, P.gauge_dims('gad_two', 'mass'), 3);
    writePath(s, P.gauge_grade('gad_two'), 'grd_a');
    writePath(s, P.gauge_seal('gad_two'), ['evt_one']);
  });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(st, { gauge: { gad_one: { level: 5 }, gad_two: { dims: { mass: 3 }, grade: 'grd_a', seal: ['evt_one'] } } });
});

test('越权写者：整笔回滚（先前的写也撤销），事务结束后 report 带实体 id 与请求编号，返回码', () => {
  const st = fresh();
  logs.length = 0;
  const r = runTransaction(st, { node: 'view:other', file: 'sys/other.mjs', request: 7 }, (s) => {
    writePath(s, P.gauge_level('gad_one'), 9);
  });
  assert.deepEqual(r, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
  assert.deepEqual(logs, [{ code: 'E-VIEW-UNDECLARED-WRITE', fields: { entity: 'gad_one', request: 7 } }]);

  const st2 = fresh();
  const r2 = runTransaction(st2, { ...GAUGE, request: 8 }, (s) => {
    writePath(s, P.gauge_level('gad_one'), 2);
    writePath(s, P.gauge_dims('gad_two', 'mass'), 4);
    writePath(s, P.gauge_born('gad_one'), 1); // born 只有建行写者 sys/maker.mjs
  });
  assert.deepEqual(r2, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(st2, { gauge: { gad_one: { level: 1 } } });
});

test('规则层 catch 住被拒写入后事务仍整笔回滚、状态不变（卷二 :499）', () => {
  const st = fresh();
  logs.length = 0;
  const r = runTransaction(st, { ...GAUGE, request: 21 }, (s) => {
    writePath(s, P.gauge_level('gad_one'), 2);
    try { writePath(s, P.gauge_born('gad_one'), 1); } catch { /* 规则层吞掉 */ }
    writePath(s, P.gauge_dims('gad_two', 'mass'), 4);
  });
  assert.deepEqual(r, { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
  assert.deepEqual(logs, [{ code: 'E-VIEW-UNDECLARED-WRITE', fields: { entity: 'gad_one', request: 21 } }]);
  // 值类型不符被 catch 同样整笔回滚
  const st2 = fresh();
  const r2 = runTransaction(st2, GAUGE, (s) => {
    writePath(s, P.gauge_level('gad_one'), 3);
    try { writePath(s, P.gauge_level('gad_one'), 'raw text'); } catch { /* 吞 */ }
  });
  assert.deepEqual(r2, { ok: false, code: 'E-TEXT-UNGATED' });
  assert.deepEqual(st2, { gauge: { gad_one: { level: 1 } } });
});

test('值类型不符（裸文字、非整数、别族代号、非代号字串）一律 E-TEXT-UNGATED', () => {
  const cases = [
    [P.gauge_level('gad_one'), 'ten'],
    [P.gauge_level('gad_one'), 1.5],
    [P.gauge_grade('gad_one'), 'gad_two'],
    [P.gauge_dims('gad_one', 'mass'), 'heavy load'],
    [P.gauge_seal('gad_one'), ['evt_one', 3]],
  ];
  for (const [path, value] of cases) {
    const st = fresh();
    const r = runTransaction(st, GAUGE, (s) => writePath(s, path, value));
    assert.deepEqual(r, { ok: false, code: 'E-TEXT-UNGATED' }, JSON.stringify(value));
    assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
  }
});

test('目标实体已终止：E-TERM-RESIDUE，日志带被终止实体', () => {
  const st = { gauge: {}, terminated: { gad_two: { day: 3 } } };
  logs.length = 0;
  const r = runTransaction(st, { ...GAUGE, request: 11 }, (s) => writePath(s, P.gauge_level('gad_two'), 2));
  assert.deepEqual(r, { ok: false, code: 'E-TERM-RESIDUE' });
  assert.deepEqual(st, { gauge: {}, terminated: { gad_two: { day: 3 } } });
  assert.deepEqual(logs, [{ code: 'E-TERM-RESIDUE', fields: { entity: 'gad_two', request: 11 } }]);
});

test('建行写者：路径上还没有值时可写初值，已有值再写即拒', () => {
  const maker = { node: 'view:maker', file: 'sys/maker.mjs' };
  const st = fresh();
  assert.deepEqual(runTransaction(st, maker, (s) => writePath(s, P.gauge_born('gad_one'), 4)), { ok: true });
  assert.equal(st.gauge.gad_one.born, 4);
  assert.deepEqual(runTransaction(st, maker, (s) => writePath(s, P.gauge_born('gad_one'), 5)), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.equal(st.gauge.gad_one.born, 4);
});

test('viaRelocate 的改写写者不得直接 writePath（只经行改挂原语）', () => {
  installStorage({
    writers: [{ pattern: 'gauge.*.level', create: [], rewrite: 'sys/gauge.mjs', rewriteRows: { withComponent: ['cmp_x'], inside: [] }, viaRelocate: true }],
    pathTypes: { 'gauge.*.level': 'integer:count' }, keyKinds: { 'gauge.*.level': ['gadget'] }, textPaths: [], ledgerPaths: [],
  });
  try {
    const st = fresh();
    assert.deepEqual(runTransaction(st, GAUGE, (s) => writePath(s, P.gauge_level('gad_one'), 2)), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
    assert.equal(st.gauge.gad_one.level, 1);
  } finally {
    installStorage(merged.merged);
  }
});

test('推进中被拒：日志另带刻与段', () => {
  logs.length = 0;
  const st = fresh();
  runTransaction(st, { node: 'view:other', file: 'sys/other.mjs', request: 2, tick: 40, stage: 3 }, (s) => writePath(s, P.gauge_level('gad_one'), 2));
  assert.deepEqual(logs, [{ code: 'E-VIEW-UNDECLARED-WRITE', fields: { entity: 'gad_one', request: 2, stage: 3, tick: 40 } }]);
});

test('任何带登记码的错误同一处置：处理函数自己抛的码也整笔回滚并上报；无登记码的错误回滚后原样抛出', () => {
  logs.length = 0;
  const st = fresh();
  const r = runTransaction(st, { ...GAUGE, request: 3 }, (s) => {
    writePath(s, P.gauge_level('gad_one'), 2);
    throw new KernelError('E-DET-NONFINITE', { entity: 'gad_one' });
  });
  assert.deepEqual(r, { ok: false, code: 'E-DET-NONFINITE' });
  assert.equal(st.gauge.gad_one.level, 1);
  assert.deepEqual(logs, [{ code: 'E-DET-NONFINITE', fields: { entity: 'gad_one', request: 3 } }]);

  const st2 = fresh();
  assert.throws(() => runTransaction(st2, GAUGE, (s) => { writePath(s, P.gauge_level('gad_one'), 2); throw new TypeError('bug'); }), TypeError);
  assert.equal(st2.gauge.gad_one.level, 1);
  // 抛出后不留事务：下一笔照常
  assert.deepEqual(runTransaction(st2, GAUGE, (s) => writePath(s, P.gauge_level('gad_one'), 6)), { ok: true });
});

test('提交前重算钩子：收到本笔写过的路径；它抛码即整笔拒绝；只许交入一次', () => {
  resetHoldWhileRecompute();
  const seen = [];
  registerHoldWhileRecompute((s, written) => {
    seen.push(written);
    if (s.gauge.gad_one.level > 8) throw new KernelError('E-HK-HOLD-WHILE', { entity: 'gad_one' });
  });
  try {
    assert.throws(() => registerHoldWhileRecompute(() => {}), (e) => e.code === 'E-WRITER-DUPLICATE');
    const st = fresh();
    assert.deepEqual(runTransaction(st, GAUGE, (s) => writePath(s, P.gauge_level('gad_one'), 3)), { ok: true });
    assert.deepEqual(runTransaction(st, GAUGE, (s) => writePath(s, P.gauge_level('gad_one'), 9)), { ok: false, code: 'E-HK-HOLD-WHILE' });
    assert.equal(st.gauge.gad_one.level, 3);
    assert.deepEqual(seen, [[['gauge', 'gad_one', 'level']], [['gauge', 'gad_one', 'level']]]);
  } finally {
    resetHoldWhileRecompute();
  }
});

test('submitProposal：带回应句柄的被拒回码，心跳推进（无句柄）只回拒绝；通过回 ok', () => {
  const st = fresh();
  // 日志簿只用到 entries（kernel/save.mjs appendLogEntry）；完整日志簿与"先记 doc_log 再处理"的次序见 tests/kernel/save.test.mjs。
  const book = /** @type {any} */ ({ entries: [] });
  installProposalSession({ state: st, book, resolve: (p) => ({ node: 'view:act', file: p.as, handler: (s, q) => writePath(s, P.gauge_level('gad_one'), q.to) }) });
  try {
    assert.deepEqual(submitProposal({ request: 1, reply: {}, as: 'sys/gauge.mjs', to: 4 }), { ok: true });
    assert.deepEqual(submitProposal({ request: 2, reply: {}, as: 'sys/other.mjs', to: 5 }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
    assert.deepEqual(submitProposal({ request: 3, as: 'sys/other.mjs', to: 6 }), { ok: false });
    assert.equal(st.gauge.gad_one.level, 4);
    assert.deepEqual(book.entries, [{ request: 1, as: 'sys/gauge.mjs', to: 4 }, { request: 2, as: 'sys/other.mjs', to: 5 }, { request: 3, as: 'sys/other.mjs', to: 6 }]);
  } finally {
    installProposalSession(null);
  }
});

test('readSealed/writeSealed：只走 textPaths；凭证核对未交入或不过、非登记写者、非 Sealed 形态都 E-TEXT-UNGATED', () => {
  const sealed = { bytes: 'AAEC', digest: 'ab12' };
  const writer = { node: 'view:note', file: 'gate/note.mjs' };
  const st = {};
  installCredentialCheck(null);
  assert.deepEqual(runTransaction(st, writer, (s) => writeSealed(s, 'cred', 'notes.nt_one.text', sealed)), { ok: false, code: 'E-TEXT-UNGATED' });
  installCredentialCheck((cred, path) => cred === 'cred' && path === 'notes.nt_one.text');
  try {
    assert.deepEqual(runTransaction(st, writer, (s) => writeSealed(s, 'cred', 'notes.nt_one.text', sealed)), { ok: true });
    assert.deepEqual(readSealed(st, 'notes.nt_one.text'), { bytes: 'AAEC', digest: 'ab12' });
    assert.deepEqual(runTransaction(st, writer, (s) => writeSealed(s, 'cred', 'notes.nt_two.text', sealed)), { ok: false, code: 'E-TEXT-UNGATED' });
    assert.deepEqual(runTransaction(st, GAUGE, (s) => writeSealed(s, 'cred', 'notes.nt_one.text', sealed)), { ok: false, code: 'E-TEXT-UNGATED' });
    assert.deepEqual(runTransaction(st, writer, (s) => writeSealed(s, 'cred', 'notes.nt_one.text', 'plain text')), { ok: false, code: 'E-TEXT-UNGATED' });
    assert.throws(() => readSealed(st, 'gauge.gad_one.level'), (e) => e.code === 'E-PATH-UNDECLARED');
    assert.deepEqual(runTransaction(st, GAUGE, (s) => writePath(s, 'notes.nt_one.text', sealed)), { ok: false, code: 'E-PATH-UNDECLARED' });
    assert.deepEqual(Object.keys(st), ['notes']);
    assert.deepEqual(st.notes, { nt_one: { text: { bytes: 'AAEC', digest: 'ab12' } } });
    // 规则层 catch 住被拒的 writeSealed：整笔仍回滚，nt_one 不变
    const r = runTransaction(st, writer, (s) => {
      writeSealed(s, 'cred', 'notes.nt_one.text', { bytes: 'ZZZZ', digest: 'ff00' });
      try { writeSealed(s, 'cred', 'notes.nt_two.text', sealed); } catch { /* 吞 */ }
    });
    assert.deepEqual(r, { ok: false, code: 'E-TEXT-UNGATED' });
    assert.deepEqual(st.notes, { nt_one: { text: { bytes: 'AAEC', digest: 'ab12' } } });
  } finally {
    installCredentialCheck(null);
  }
});

test('report：码须登记（经 E 句柄），字段只收代号与数值', () => {
  logs.length = 0;
  assert.deepEqual(report(E.E_TERM_RESIDUE, { entity: 'gad_one', tick: 3, ok: false, other: null }), { code: 'E-TERM-RESIDUE', fields: { entity: 'gad_one', ok: false, other: null, tick: 3 } });
  assert.equal(logs.length, 1);
  assert.throws(() => report('E-NOT-A-CODE', {}), (e) => e.code === 'E-DIM-REF-MISSING');
  assert.throws(() => report(E.E_TERM_RESIDUE, { note: '被拒了' }), (e) => e.code === 'E-DIM-ID-FORMAT');
  assert.throws(() => report(E.E_TERM_RESIDUE, { Bad: 1 }), (e) => e.code === 'E-DIM-ID-FORMAT');
  assert.throws(() => report(E.E_TERM_RESIDUE, { tick: Number.NaN }), (e) => e.code === 'E-DET-NONFINITE');
  assert.throws(() => checkFields([1]), (e) => e.code === 'E-DIM-ID-FORMAT');
  assert.equal(logs.length, 1);
});

test('reportError：带登记码的错误规整后走 report；不带登记码的原样抛回（不自造码）', () => {
  logs.length = 0;
  assert.equal(reportError(new KernelError('E-SAVE-TORN', { slot: 2 })), 'E-SAVE-TORN');
  assert.deepEqual(logs, [{ code: 'E-SAVE-TORN', fields: { slot: 2 } }]);
  const plain = new Error('boom');
  assert.throws(() => reportError(plain), (e) => e === plain);
  assert.throws(() => reportError('E-SAVE-TORN'), (e) => e === 'E-SAVE-TORN');
  const odd = { code: 'E-SAVE-TORN', fields: { note: 'free text' } };
  assert.equal(reportError(odd), 'E-SAVE-TORN');
  assert.deepEqual(logs[1], { code: 'E-SAVE-TORN', fields: {} });
});
