// 按日生效写者 dated（卷二 §2.7 dated :796、§1.3 最上一级 :164；对照表 #52、#53 与待定 5；卷五 §3.3 :371、§4.1 规则 16 :509；卷二十七 R27-1.16 :327）。
// 测试夹具：tests/kernel/fixture.mjs 的虚构表 gadget 加一个声明表（本文件造，不是世界内容）：顶层键 shaped 的 `*.*` 是 dated 写者模式（记录路径：实体、维度），
// 写者文件 sys/shaper.mjs；不建真实写者，测试只调写入口 writeDated 与读入口 dim、inputVersionAt。期望值一律手算字面量。
// 世界时钟：一日 1440 分钟（minute 单位 60 秒、day 单位 86400 秒）。state.clock.minute = 日序 × 1440。

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { P, buildE, installHandles } from '../../server-plugin/kernel/handles/generated.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installStorage, readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { codeOf } from '../../server-plugin/kernel/errors.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { dim, modified } from '../../server-plugin/kernel/dimensions.mjs';
import { writeDated, inputVersionAt } from '../../server-plugin/kernel/dated.mjs';
import { resetMemos } from '../../server-plugin/kernel/memo.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { createHash } from 'node:crypto';
import { compileRXInScope } from '../../server-plugin/kernel/rx.mjs';
import { installModifierSource } from '../../server-plugin/kernel/dimensions.mjs';

// inputVersionAt 经 kernel/save.mjs 的 sha256Text：测试里装一个摘要能力（同 dimensions.test.mjs）。
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });

const E = buildE();

const DECL = {
  stateKeys: {
    clock: { readers: [], writers: { minute: 'kernel/scheduler.mjs', seq: 'kernel/scheduler.mjs' } },
    terminated: { readers: [], writers: { '*': 'kernel/terminate.mjs' } },
    shaped: { readers: ['dim:*'], writers: { '*.*': { create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true } } },
  },
  systems: {},
  textPaths: [],
  textWriters: {},
  pathTypes: { 'clock.minute': 'integer:minute', 'clock.seq': 'integer:count', 'terminated.*': 'struct:terminated', 'shaped.*.*': 'list<struct:datedRewrite>' },
  keyKinds: { 'terminated.*': [['gadget']], 'shaped.*.*': [['gadget'], 'dimKey'] },
  phases: [],
};

// 维度表：gadget（mass 数值 kg、twice 派生 mass * 2）。
function world() {
  const f = fixture();
  f.units.units.push({ id: 'minute', dimension: 'time', si: 60 }, { id: 'day', dimension: 'time', si: 86400 });
  const common = { required: 'never', onUnknown: 'gap', source: 'test', owner: 'test' };
  f.gadget.dimensions.twice = { type: 'number', unit: 'kg', domain: [0, 200], precision: 2, derived: 'mass * 2', modifiable: false, ...common };
  f.gadget.dimensions.workSpeed = { type: 'number', unit: 'count', domain: [0, 100], precision: 4, modifiable: true, stacking: 'none', bounds: [0, 100], ...common };
  f.gadget.rows.gad_box.workSpeed = 1;
  return validateDimensions(sourcesOf(f), OPTIONS);
}
const report = world();
installVocab(report);
const merged = mergeStateOwners(DECL, { units: new Set(['minute', 'count']), kinds: new Set(['gadget']) });
installStorage(merged.merged);
installHandles({ vocab: report.vocab, decl: DECL });
const engine = { tables: report.tables, vocab: report.vocab, rules: { modifiers: { stackingTable: [1, 1, 1, 1, 1, 1, 1, 1, 1] } }, template: { seed: 'fixture_seed' }, env: report.env, units: report.env.units };

const SHAPER = { node: 'view:shaper', file: 'sys/shaper.mjs' };
const OTHER = { node: 'view:other', file: 'sys/other.mjs' };
// 当前日为 day 的状态（clock.minute = day × 1440）。
const at = (day) => ({ clock: { minute: day * 1440, seq: 0 } });
const MASS = P.shaped('gad_box', 'mass');
const run = (state, ctx, fn) => runTransaction(state, ctx, fn);
const rec = (fromDay, value, cause = 'evt_quake') => ({ fromDay, value, cause });

test('前提：测试声明表合并通过', () => {
  assert.equal(merged.ok, true, merged.text);
  assert.deepEqual(report.errors.filter((e) => e.severity === 'error'), []);
});

test('追加与取值：第 5 日追加 fromDay 8 的记录；第 7 日（d−1）读建行值 5，第 8 日（d）读新值 9，更早与更晚取值各自不变', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.deepEqual(readPath(state, MASS), [{ fromDay: 8, value: 9, cause: 'evt_quake' }]);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 0 }).value, 5);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 7 }).value, 5);
  assert.deepEqual(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8 }), { known: true, applicable: true, value: 9, source: 'dated', unit: 'kg' });
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 100 }).value, 9);
});

test('最后追加的赢：第 7、8 日都取后追加的 fromDay 7 那条（按追加次序，不按 fromDay 排）', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(7, 6))), { ok: true });
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 6 }).value, 5);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 7 }).value, 6);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8 }).value, 6);
});

test('拒写 fromDay：不大于当前日、非安全整数或非数一律 E-DATED-FROMDAY，不落任何记录；fromDay 6 通过', () => {
  const state = at(5);
  for (const fromDay of [5, 4, 0, -1, 5.5, NaN, Infinity, '8', null, undefined]) {
    assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(fromDay, 9))), { ok: false, code: 'E-DATED-FROMDAY' }, `fromDay ${String(fromDay)}`);
  }
  assert.equal(readPath(state, MASS), undefined);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(6, 9))), { ok: true });
  assert.deepEqual(readPath(state, MASS), [{ fromDay: 6, value: 9, cause: 'evt_quake' }]);
});

test('整笔回滚：同一事务里先追加合法记录、再追加非法记录，合法的那条也回滚', () => {
  const state = at(5);
  const r = run(state, SHAPER, (s) => {
    writeDated(engine, s, MASS, rec(9, 1));
    writeDated(engine, s, MASS, rec(5, 1));
  });
  assert.deepEqual(r, { ok: false, code: 'E-DATED-FROMDAY' });
  assert.equal(readPath(state, MASS), undefined);
});

test('写者核对：非登记文件写、dated 路径直接 writePath、事务外 writeDated 都 E-VIEW-UNDECLARED-WRITE', () => {
  const state = at(5);
  assert.deepEqual(run(state, OTHER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.deepEqual(run(state, SHAPER, (s) => writePath(s, MASS, [rec(8, 9)])), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
  assert.throws(() => writeDated(engine, state, MASS, rec(8, 9)), (e) => codeOf(e) === 'E-VIEW-UNDECLARED-WRITE');
  assert.equal(readPath(state, MASS), undefined);
});

test('记录形状：缺键、多键、cause 非代号得 E-DIM-STRUCT-FIELD；value 非有限数得 E-DET-NONFINITE；非代号字串得 E-TEXT-UNGATED', () => {
  const state = at(5);
  const bad = (record, code) => assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, record)), { ok: false, code }, JSON.stringify(record));
  bad({ fromDay: 8, value: 9 }, 'E-DIM-STRUCT-FIELD');
  bad({ fromDay: 8, value: 9, cause: 'evt_quake', extra: 1 }, 'E-DIM-STRUCT-FIELD');
  bad({ fromDay: 8, value: 9, cause: 'Quake Day' }, 'E-DIM-STRUCT-FIELD');
  bad(rec(8, NaN), 'E-DET-NONFINITE');
  bad(rec(8, 'hello world'), 'E-TEXT-UNGATED');
  assert.equal(readPath(state, MASS), undefined);
});

test('目标核对：未载入实体与未知维度得 E-DIM-REF-MISSING；派生维度得 E-DIM-DERIVED-WRITTEN；已终止实体得 E-TERM-RESIDUE', () => {
  const state = at(5);
  const write = (path) => run(state, SHAPER, (s) => writeDated(engine, s, path, rec(8, 9)));
  assert.deepEqual(write(P.shaped('gad_nope', 'mass')), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(write(P.shaped('gad_box', 'nope')), { ok: false, code: 'E-DIM-REF-MISSING' });
  assert.deepEqual(write(P.shaped('gad_box', 'twice')), { ok: false, code: 'E-DIM-DERIVED-WRITTEN' });
  const dead = { clock: { minute: 5 * 1440, seq: 0 }, terminated: { gad_box: {} } };
  assert.deepEqual(run(dead, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: false, code: 'E-TERM-RESIDUE' });
});

test('过去日不变、多条：追加不动旧值；当前日 9 时 fromDay 9 拒、fromDay 10 通过', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  state.clock.minute = 9 * 1440;
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(12, 11))), { ok: true });
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 7 }).value, 5);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8 }).value, 9);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 11 }).value, 9);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 12 }).value, 11);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(9, 1))), { ok: false, code: 'E-DATED-FROMDAY' });
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(10, 1))), { ok: true });
});

test('缺省取当前日：不给 day 时按 clock 的当前日求值', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  state.clock.minute = 7 * 1440;
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass').value, 5);
  state.clock.minute = 8 * 1440;
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass').value, 9);
});

test('派生按日求值与行隔离：twice 随 mass 的按日值变；gad_hammer 不受 gad_box 的记录影响；无记录时完整 Fact', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'twice', { day: 7 }).value, 10);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'twice', { day: 8 }).value, 18);
  // gad_hammer 的 mass 由类别链得 cls_base 1 → cls_tool ×2 = 2 → cls_heavy_tool +3.5 = 5.5（夹具 categories，不随 gad_box 的记录变）
  assert.equal(dim(engine, state, 'gadget', 'gad_hammer', 'mass', { day: 100 }).value, 5.5);
  assert.deepEqual(dim(engine, at(5), 'gadget', 'gad_box', 'mass', { day: 8 }), { known: true, applicable: true, value: 5, source: 'instance', unit: 'kg' });
});

test('求值日非法：dim 的 day 取负数、小数、NaN、字串、null 一律 E-DIM-STRUCT-FIELD（有记录与无记录各试一次）', () => {
  const plain = at(5);
  const recorded = at(5);
  assert.deepEqual(run(recorded, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  for (const day of [-1, 1.5, NaN, '3', null]) {
    for (const state of [plain, recorded]) {
      assert.throws(() => dim(engine, state, 'gadget', 'gad_box', 'mass', { day }), (e) => codeOf(e) === 'E-DIM-STRUCT-FIELD');
    }
  }
});

test('inputVersionAt：当日有效记录内容的摘要（64 位十六进制）；生效前同空、生效后变、过去日不因追加而变', () => {
  const state = at(5);
  const none = inputVersionAt(engine, at(5)); // 没有任何记录
  assert.match(none, /^[0-9a-f]{64}$/);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, P.shaped('gad_hammer', 'mass'), rec(10, 1))), { ok: true });
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 2))), { ok: true });
  const v = (d) => inputVersionAt(engine, state, d);
  assert.equal(v(0), none);
  assert.equal(v(7), none);
  assert.equal(inputVersionAt(engine, state), none); // 不给 day：当前第 5 日
  assert.notEqual(v(8), none);
  assert.equal(v(9), v(8)); // 第 9 日没有新生效的记录，有效内容同第 8 日
  assert.notEqual(v(10), v(9)); // 第 10 日 gad_hammer 的记录生效
  const before = [v(7), v(8), v(10)];
  state.clock.minute = 9 * 1440;
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(12, 7))), { ok: true });
  assert.deepEqual([v(7), v(8), v(10)], before); // 过去日追加后不变
  assert.equal(v(11), before[2]);
  assert.notEqual(v(12), v(11)); // 将来日（第 12 日）因追加而变
  for (const day of [-1, 1.5]) assert.throws(() => inputVersionAt(engine, state, day), (e) => codeOf(e) === 'E-DIM-STRUCT-FIELD');
});

test('inputVersionAt 是内容身份不是计数：条数相同内容不同的两份状态版本不同；事务回滚后再追加另一值，版本与回滚前不同', () => {
  const a = at(5);
  const b = at(5);
  assert.deepEqual(run(a, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.deepEqual(run(b, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 10))), { ok: true });
  assert.notEqual(inputVersionAt(engine, a, 8), inputVersionAt(engine, b, 8));
  // 回滚前的版本；整笔拒写回滚后与空一致；再追加另一值，版本不等于回滚前追加另一值时的版本。
  const state = at(5);
  const empty = inputVersionAt(engine, state, 8);
  let first;
  run(state, SHAPER, (s) => { writeDated(engine, s, MASS, rec(8, 9)); first = inputVersionAt(engine, s, 8); writeDated(engine, s, MASS, rec(5, 1)); });
  assert.equal(readPath(state, MASS), undefined);
  assert.equal(inputVersionAt(engine, state, 8), empty);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 11))), { ok: true });
  assert.notEqual(inputVersionAt(engine, state, 8), first);
  assert.notEqual(inputVersionAt(engine, state, 8), empty);
});

test('按维度定义核 value：number 维度写代号串、写出 domain（mass 域 [0, 100]）的数、写负数各被拒，不落记录；域内的数通过', () => {
  const state = at(5);
  for (const value of ['evt_x', 101, -1, [1]]) {
    const r = run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, value)));
    assert.equal(r.ok, false, JSON.stringify(value));
  }
  assert.equal(readPath(state, MASS), undefined);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 100))), { ok: true });
});

test('修正项与基值同一求值日：valueRX 读 dated 维度 mass，modified 的 {day: 8} 与 {clock: {day: 8}} 结果相同（1 + 9 × 0.01 = 1.09），先后互换、同一 state 都不撞键', () => {
  const scope = { dims: new Map(Object.entries(report.tables.get('gadget').doc.dimensions)), vocabIndex: report.vocab.index, ns: [], maxDepth: 16 };
  const tree = compileRXInScope('mass * 0.01', 'data', scope).tree;
  installModifierSource(() => [{ id: 'm_mass', target: 'gadget.workSpeed', stage: 'add', valueRX: tree, source: { kind: 'test', id: 'src_mass' } }]);
  const make = () => { const s = at(5); run(s, SHAPER, (t) => writeDated(engine, t, MASS, rec(8, 9))); return s; };
  const byDay = (s) => modified(engine, s, 'gadget', 'gad_box', 'workSpeed', { day: 8 }).value;
  const byClock = (s) => modified(engine, s, 'gadget', 'gad_box', 'workSpeed', { clock: { day: 8 } }).value;
  const a = make();
  assert.equal(byDay(a), 1.09);
  assert.equal(byClock(a), 1.09);
  const b = make();
  assert.equal(byClock(b), 1.09);
  assert.equal(byDay(b), 1.09);
  assert.equal(modified(engine, a, 'gadget', 'gad_box', 'workSpeed', { day: 7 }).value, 1.05);
});

test('求值日只有一个出处：只给 clock.day 时基值按该日取；opts.day 与 clock.day 都给且不等即 E-DIM-STRUCT-FIELD，相等通过', () => {
  const state = at(5);
  assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, MASS, rec(8, 9))), { ok: true });
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { clock: { day: 7 } }).value, 5);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { clock: { day: 8 } }).value, 9);
  assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8, clock: { day: 8 } }).value, 9);
  assert.throws(() => dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8, clock: { day: 7 } }), (e) => codeOf(e) === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => modified(engine, state, 'gadget', 'gad_box', 'size', { day: 8, clock: { day: 7 } }), (e) => codeOf(e) === 'E-DIM-STRUCT-FIELD');
});

// 加载期校验：克隆声明表改一处，合并后取错误码列表（期望码手写）。
const codesOf = (mutate) => {
  const decl = structuredClone(DECL);
  mutate(decl);
  return mergeStateOwners(decl, { units: new Set(['minute', 'count']), kinds: new Set(['gadget']) }).errors.map((e) => e.code);
};
const shapedWriter = (decl) => decl.stateKeys.shaped.writers['*.*'];

test('加载期校验：dated 写者对象的必写字段、与 viaRelocate/create 互斥、记录路径形状、同一实体类至多一条', () => {
  assert.deepEqual(codesOf((d) => { delete shapedWriter(d).dated; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { shapedWriter(d).dated = 'yes'; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { Object.assign(shapedWriter(d), { viaRelocate: true, rewriteRows: { withComponent: ['cmp_x'], inside: [] } }); }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { const w = shapedWriter(d); w.rewrite = null; delete w.rewriteRows; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { shapedWriter(d).create = ['a.mjs']; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { d.pathTypes['shaped.*.*'] = 'integer:count'; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { d.keyKinds['shaped.*.*'] = [['gadget'], ['gadget']]; }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => {
    d.stateKeys.shaped2 = { readers: ['dim:*'], writers: { '*.*': { create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true } } };
    d.pathTypes['shaped2.*.*'] = 'list<struct:datedRewrite>';
    d.keyKinds['shaped2.*.*'] = [['gadget'], 'dimKey'];
  }), ['E-DATED-WRITER']);
  assert.deepEqual(codesOf((d) => { shapedWriter(d).dated = false; }), []);
});

// 字面维度段：dated 模式最后一段写死维度名（只这一维），卷五可只登它那几维，位置量等其他维度没有记录路径。
const DATED_W = { create: [], rewrite: 'sys/shaper.mjs', rewriteRows: 'all', viaRelocate: false, dated: true };
const literalDecl = (d, dims) => {
  delete d.stateKeys.shaped.writers['*.*']; delete d.pathTypes['shaped.*.*']; delete d.keyKinds['shaped.*.*'];
  for (const m of dims) { d.stateKeys.shaped.writers[`*.${m}`] = { ...DATED_W }; d.pathTypes[`shaped.*.${m}`] = 'list<struct:datedRewrite>'; d.keyKinds[`shaped.*.${m}`] = [['gadget']]; }
};

test('字面维度段：可登记；两家分登同类不同维度通过；通配与字面相交、同类同维度两条都报 E-DATED-WRITER；字面维度不是该类的维度报码', () => {
  assert.deepEqual(codesOf((d) => literalDecl(d, ['mass'])), []);
  assert.deepEqual(codesOf((d) => literalDecl(d, ['mass', 'size'])), []);
  // 通配（shaped2.*.*）与字面（shaped.*.mass）同为 gadget：相交。
  assert.deepEqual(codesOf((d) => {
    literalDecl(d, ['mass']);
    d.stateKeys.shaped2 = { readers: ['dim:*'], writers: { '*.*': { ...DATED_W } } };
    d.pathTypes['shaped2.*.*'] = 'list<struct:datedRewrite>'; d.keyKinds['shaped2.*.*'] = [['gadget'], 'dimKey'];
  }), ['E-DATED-WRITER']);
  // 不同顶层键下同类同维度两条字面模式。
  assert.deepEqual(codesOf((d) => {
    literalDecl(d, ['mass']);
    d.stateKeys.shaped2 = { readers: ['dim:*'], writers: { '*.mass': { ...DATED_W } } };
    d.pathTypes['shaped2.*.mass'] = 'list<struct:datedRewrite>'; d.keyKinds['shaped2.*.mass'] = [['gadget']];
  }), ['E-DATED-WRITER']);
  // 最后一段是 `*` 却没有 dimKey（实体段之外再一个 `*`）、字面维度不在表里。
  assert.deepEqual(codesOf((d) => { literalDecl(d, ['mass']); d.pathTypes['shaped.*.mass'] = 'integer:count'; }), ['E-DATED-WRITER']);
  const dims = new Map([['gadget', report.tables.get('gadget').doc.dimensions]]);
  const decl = structuredClone(DECL); literalDecl(decl, ['nope']);
  assert.deepEqual(mergeStateOwners(decl, { units: new Set(['minute', 'count']), kinds: new Set(['gadget']), tableDims: dims }).errors.map((e) => e.code), ['E-DATED-WRITER']);
});

test('字面维度模式运行期：只能追加登记的那一维（其他维度没有记录路径，E-PATH-UNDECLARED），读取按该维取值', () => {
  const decl = structuredClone(DECL); literalDecl(decl, ['mass']);
  const m2 = mergeStateOwners(decl, { units: new Set(['minute', 'count']), kinds: new Set(['gadget']) });
  assert.equal(m2.ok, true, m2.text);
  installStorage(m2.merged);
  try {
    const state = at(5);
    assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, 'shaped.gad_box.mass', rec(8, 9))), { ok: true });
    assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, 'shaped.gad_box.size', rec(8, 9))), { ok: false, code: 'E-PATH-UNDECLARED' });
    assert.deepEqual(run(state, SHAPER, (s) => writeDated(engine, s, 'shaped.gad_box.parent', rec(8, 9))), { ok: false, code: 'E-PATH-UNDECLARED' });
    assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 7 }).value, 5);
    assert.equal(dim(engine, state, 'gadget', 'gad_box', 'mass', { day: 8 }).value, 9);
    assert.deepEqual(Object.keys(state.shaped.gad_box), ['mass']);
  } finally {
    installStorage(merged.merged);
  }
});
