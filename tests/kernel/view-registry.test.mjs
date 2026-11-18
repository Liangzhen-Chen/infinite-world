// 块 3-2 续（李白 11-18 05:28 裁定①②）：
// ① 视图读取函数登记 registerViewReader（照 advance-registry 同法；内核按登记名调用、不 import 规则层；未登记 E-DIM-UNKNOWN-READ 不放行）；
// ② keyKinds (c) 加 seedKey：由种子派生的实体 id 段（卷二 §1.10 :320 部件按代号规范、:234 ownerKey.aggregate: SeedKey；卷二十七 :348 聚合体 id），
//    文法即 §1.9 代号文法，且不是词表代号、不是已载入实体 id；不合 E-PATH-KEYKINDS（卷二 :1545、:815）；
//    state-owners 登 aggregates.*.ledgerHolder（卷二十七 :200，写者 aggregate.mjs；定义卷二 §5.6 :1765）。
// 期望值一律手写字面量。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { registerViewReader, readView, viewReaderNames, resetViewRegistry } from '../../server-plugin/kernel/view-registry.mjs';
import { isSeedKey, seedKeyOf } from '../../server-plugin/kernel/handles/keys.mjs';
import { P } from '../../server-plugin/kernel/handles/generated.mjs';
import { readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { SCHEMA } from '../../server-plugin/kernel/ledger.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);

const codeIs = (code) => (e) => e.code === code;
const quiet = (fn) => { const prev = useReportSink(() => {}); try { return fn(); } finally { useReportSink(prev); } };

// ---------- ① 视图读取函数登记 ----------

test('registerViewReader：登记后按名调用、实参原样交给读取函数；未登记 E-DIM-UNKNOWN-READ；形状不合与重复登记被拒', () => {
  resetViewRegistry();
  try {
    assert.throws(() => readView('buildProjectView', {}, {}, 'bp_t_a'), codeIs('E-DIM-UNKNOWN-READ'));
    const seen = [];
    const engine = { tag: 'e' }, state = { tag: 's' };
    registerViewReader('buildProjectView', 'rules/test-views.mjs', (e, s, id) => { seen.push([e.tag, s.tag, id]); return { sponsor: 'npc_a' }; });
    assert.deepEqual(readView('buildProjectView', engine, state, 'bp_t_a'), { sponsor: 'npc_a' });
    assert.deepEqual(seen, [['e', 's', 'bp_t_a']]);
    assert.deepEqual(viewReaderNames(), ['buildProjectView']);
    assert.throws(() => registerViewReader('buildProjectView', 'rules/test-views.mjs', () => null), codeIs('E-WRITER-DUPLICATE'));
    assert.throws(() => registerViewReader('BuildView', 'rules/test-views.mjs', () => null), codeIs('E-DIM-ID-FORMAT'));
    assert.throws(() => registerViewReader('otherView', '../x.mjs', () => null), codeIs('E-DIM-STRUCT-FIELD'));
    assert.throws(() => registerViewReader('otherView', 'rules/test-views.mjs', 'fn'), codeIs('E-DIM-STRUCT-FIELD'));
    assert.deepEqual(viewReaderNames(), ['buildProjectView']);
    resetViewRegistry();
    assert.deepEqual(viewReaderNames(), []);
    assert.throws(() => readView('buildProjectView', engine, state, 'bp_t_a'), codeIs('E-DIM-UNKNOWN-READ'));
  } finally {
    resetViewRegistry();
  }
});

test('kernelApi 与 files.json：registerViewReader 只给规则层、不收 state；view-registry 只 import errors.mjs；账本经登记名取视图、SCHEMA 不再有原始状态键', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  assert.deepEqual(decl.kernelApi.exports.filter((x) => x.export.startsWith('kernel/view-registry.mjs#')), [
    { export: 'kernel/view-registry.mjs#registerViewReader', callers: ['rules'], acceptsState: false },
  ]);
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'server-plugin/kernel/files.json'), 'utf8')).includes('server-plugin/kernel/view-registry.mjs'));
  const src = readFileSync(join(ROOT, 'server-plugin/kernel/view-registry.mjs'), 'utf8');
  assert.deepEqual([...src.matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]), ['./errors.mjs']);
  assert.equal(SCHEMA.projectView, 'buildProjectView');
  assert.equal(SCHEMA.aggregateView, 'aggregateView');
  assert.equal(Object.hasOwn(SCHEMA, 'buildProject'), false);
  assert.equal(Object.hasOwn(SCHEMA, 'aggregates'), false);
});

// ---------- ② seedKey 段 ----------

test('keyKinds (c) seedKey：加载器收 seedKey（单独或混列）；写错的代号仍 E-PATH-KEYKINDS', () => {
  const base = (kk) => ({ stateKeys: { box: { readers: [], writers: { '*.flag': 'box.mjs' } } }, pathTypes: { 'box.*.flag': 'boolean' }, keyKinds: { 'box.*.flag': kk }, systems: {}, phases: [] });
  assert.deepEqual(mergeStateOwners(base(['seedKey']), {}).errors, []);
  assert.deepEqual(mergeStateOwners(base([['person', 'seedKey']]), {}).errors, []);
  assert.deepEqual(mergeStateOwners(base(['seedkey']), {}).errors.map((e) => e.code), ['E-PATH-KEYKINDS']);
  assert.deepEqual(mergeStateOwners(base(['seed']), {}).errors.map((e) => e.code), ['E-PATH-KEYKINDS']);
});

test('SeedKey 文法：代号文法、非词表代号、非已载入实体 id；不合 E-PATH-KEYKINDS', () => {
  const reg = { vocabIndex: new Map([['sink_t_eat', { family: 'sink' }]]), idIndex: new Map([['npc_q', 'person']]) };
  for (const ok of ['agg_t_1', 'ab', 'a0_b1']) {
    assert.equal(isSeedKey(reg, ok), true, ok);
    assert.equal(seedKeyOf(reg, ok), ok);
  }
  // 不合代号文法（§1.9 ^[a-z][a-z0-9_]{1,47}$）
  for (const bad of ['', 'a', 'Agg_1', 'agg-1', 'agg.1', 'agg 1', '1agg', `a${'b'.repeat(48)}`, 7, null, undefined]) {
    assert.equal(isSeedKey(reg, bad), false, String(bad));
    assert.throws(() => seedKeyOf(reg, bad), codeIs('E-PATH-KEYKINDS'), String(bad));
  }
  // 词表代号冒充 seedKey（词表代号段须走命名 struct，02:55）；已载入的带 kind 实体 id 也不是 seedKey
  assert.equal(isSeedKey(reg, 'sink_t_eat'), false);
  assert.throws(() => seedKeyOf(reg, 'sink_t_eat'), codeIs('E-PATH-KEYKINDS'));
  assert.equal(isSeedKey(reg, 'npc_q'), false);
  assert.throws(() => seedKeyOf(reg, 'npc_q'), codeIs('E-PATH-KEYKINDS'));
});

// ---------- 运行期段整类核（李白 11-18 05:50 裁定第 2 条）：handle 段与 seedKey 段同在 storage 写入处按各自文法核 ----------

test('handle 段写入：合代号文法的句柄可写可读；不合文法 E-PATH-KEYKINDS 整笔不落', () => {
  const SCH = { node: 'test_node', file: 'kernel/scheduler.mjs' };
  const item = { dueMinute: 110, kind: 'due_recurrence', owner: 'npc_a', ref: 'ref_1', registeredMinute: 100 };
  const state = {};
  assert.deepEqual(runTransaction(state, SCH, (s) => { writePath(s, P.due('due_0'), item); }), { ok: true });
  assert.deepEqual(state, { due: { due_0: item } });
  const before = JSON.parse(JSON.stringify(state));
  quiet(() => {
    for (const bad of ['a', 'Due_0', 'due-0', 'due 0', '0due', `a${'b'.repeat(48)}`]) {
      assert.deepEqual(runTransaction(state, SCH, (s) => { writePath(s, P.due('due_1'), item); writePath(s, P.due(bad), item); }), { ok: false, code: 'E-PATH-KEYKINDS' }, JSON.stringify(bad));
    }
  });
  assert.deepEqual(state, before);
});

// ---------- aggregates.*.ledgerHolder 登记与往返 ----------

test('state-owners 登 aggregates.*.ledgerHolder：boolean、keyKinds [seedKey]、写者 aggregate.mjs；不是账本路径', () => {
  const decl = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8'));
  assert.equal(decl.pathTypes['aggregates.*.ledgerHolder'], 'boolean');
  assert.deepEqual(decl.keyKinds['aggregates.*.ledgerHolder'], ['seedKey']);
  assert.deepEqual(decl.stateKeys.aggregates, { readers: [], writers: { '*.ledgerHolder': 'aggregate.mjs' } });
  assert.equal(W.owners.ledgerPaths.includes('aggregates.*.ledgerHolder'), false);
  const types = readFileSync(join(ROOT, 'server-plugin/kernel/state-types.d.ts'), 'utf8');
  assert.ok(types.includes("readonly 'aggregates.*.ledgerHolder': boolean;"));
});

test('aggregates 路径往返：aggregate.mjs 经 P 写 true 读回 true；seedKey 段不合文法、词表代号段 E-PATH-KEYKINDS；别的文件写 E-VIEW-UNDECLARED-WRITE；非布尔 E-TEXT-UNGATED；被拒整笔不落', () => {
  const AGG = { node: 'test_node', file: 'aggregate.mjs' };
  const state = {};
  assert.deepEqual(runTransaction(state, AGG, (s) => { writePath(s, P.aggregates_ledgerHolder('agg_t_1'), true); writePath(s, P.aggregates_ledgerHolder('agg_t_2'), false); }), { ok: true });
  assert.equal(readPath(state, P.aggregates_ledgerHolder('agg_t_1')), true);
  assert.equal(readPath(state, P.aggregates_ledgerHolder('agg_t_2')), false);
  assert.equal(readPath(state, P.aggregates_ledgerHolder('agg_t_3')), undefined);
  assert.deepEqual(state, { aggregates: { agg_t_1: { ledgerHolder: true }, agg_t_2: { ledgerHolder: false } } });
  const before = JSON.parse(JSON.stringify(state));
  assert.ok(W.vocab.index.has('sink_consume'));
  quiet(() => {
    for (const bad of ['Agg_1', 'agg-1', 'a', 'sink_consume']) {
      assert.deepEqual(runTransaction(state, AGG, (s) => { writePath(s, P.aggregates_ledgerHolder('agg_t_9'), true); writePath(s, P.aggregates_ledgerHolder(bad), true); }), { ok: false, code: 'E-PATH-KEYKINDS' }, bad);
    }
    assert.deepEqual(runTransaction(state, { node: 'test_node', file: 'kernel/ledger.mjs' }, (s) => { writePath(s, P.aggregates_ledgerHolder('agg_t_9'), true); }), { ok: false, code: 'E-VIEW-UNDECLARED-WRITE' });
    assert.deepEqual(runTransaction(state, AGG, (s) => { writePath(s, P.aggregates_ledgerHolder('agg_t_9'), 1); }), { ok: false, code: 'E-TEXT-UNGATED' });
  });
  assert.deepEqual(state, before);
});
