// 块 2 第 2-5 张：写入两道判定，接在 2-3 的"任何写入被拒一律上抛 transaction 走同一处置"通路上（卷二 §2.6 :499）。
// ① 卷二十七 R27-5.1 :567：非有限值、负零不得进入状态（E-DET-NONFINITE），被拒即整笔回滚；
// ② 卷二 §2.7 :804 pathTypes 文法 dimension 行：string 维度被排除在 dimension 路径之外，加载期展开即 E-TEXT-UNGATED，运行期写同码。
// 声明表与表头是本文件造的虚构值（顶层键 gauge、表 gadget），不是世界内容。

import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeStateOwners } from '../../server-plugin/kernel/load/state-owners.mjs';
import { buildP } from '../../server-plugin/kernel/handles/generated.mjs';
import { installVocab } from '../../server-plugin/kernel/vocab.mjs';
import { installStorage, writePath } from '../../server-plugin/kernel/storage.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';

const DECL = {
  stateKeys: { gauge: { readers: [], writers: { '*.level': 'sys/gauge.mjs', '*.dims.*': 'sys/gauge.mjs', '*.rate': 'sys/gauge.mjs' } } },
  systems: {},
  textPaths: [],
  textWriters: {},
  pathTypes: { 'gauge.*.level': 'integer:count', 'gauge.*.rate': 'number:count', 'gauge.*.dims.*': 'dimension' },
  keyKinds: { 'gauge.*.level': ['gadget'], 'gauge.*.rate': ['gadget'], 'gauge.*.dims.*': ['gadget', 'dimKey'] },
  phases: [],
};
const DIMS = { mass: { type: 'number' }, label: { type: 'string' } };

const merged = mergeStateOwners(DECL, { units: new Set(['count']), kinds: new Set(['gadget']) });
const P = buildP(DECL);
installVocab({ vocab: { families: new Map(), index: new Map() }, idIndex: new Map([['gad_one', 'gadget']]), tables: new Map([['gadget', { doc: { dimensions: DIMS } }]]) });
installStorage(merged.merged);
const logs = [];
useReportSink((rec) => logs.push(rec));
const GAUGE = { node: 'view:gauge', file: 'sys/gauge.mjs', request: 7 };

test('前提：声明表合并通过（不带表头时不展开 dimension 路径）', () => {
  assert.deepEqual(merged.errors, []);
});

test('非有限值与负零拒写：整笔回滚，事务后 report E-DET-NONFINITE', () => {
  for (const bad of [NaN, Infinity, -Infinity, -0]) {
    const st = { gauge: { gad_one: { level: 1, rate: 0.5 } } };
    logs.length = 0;
    const r = runTransaction(st, GAUGE, (s) => {
      writePath(s, P.gauge_level('gad_one'), 2);
      writePath(s, P.gauge_rate('gad_one'), bad);
    });
    assert.deepEqual(r, { ok: false, code: 'E-DET-NONFINITE' });
    assert.deepEqual(st, { gauge: { gad_one: { level: 1, rate: 0.5 } } });
    assert.deepEqual(logs.map((l) => [l.code, l.fields.entity, l.fields.request]), [['E-DET-NONFINITE', 'gad_one', 7]]);
  }
});

test('嵌在 dimension 值里的非有限数同样拒写；规则层 catch 住也整笔回滚', () => {
  const st = { gauge: { gad_one: { level: 1 } } };
  const r = runTransaction(st, GAUGE, (s) => {
    writePath(s, P.gauge_level('gad_one'), 3);
    try { writePath(s, P.gauge_dims('gad_one', 'mass'), [1, NaN]); } catch { /* 规则层吞掉也不改处置 */ }
  });
  assert.deepEqual(r, { ok: false, code: 'E-DET-NONFINITE' });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
});

test('有限数照常写入（含 0 与负数）', () => {
  const st = { gauge: { gad_one: { level: 1 } } };
  const r = runTransaction(st, GAUGE, (s) => { writePath(s, P.gauge_rate('gad_one'), 0); writePath(s, P.gauge_dims('gad_one', 'mass'), -2.5); });
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1, rate: 0, dims: { mass: -2.5 } } } });
});

test('运行期写 string 维度的 dimension 路径即 E-TEXT-UNGATED，整笔回滚', () => {
  const st = { gauge: { gad_one: { level: 1 } } };
  const r = runTransaction(st, GAUGE, (s) => { writePath(s, P.gauge_dims('gad_one', 'label'), 'grd_a'); });
  assert.deepEqual(r, { ok: false, code: 'E-TEXT-UNGATED' });
  assert.deepEqual(st, { gauge: { gad_one: { level: 1 } } });
});

test('加载期展开 dimension 路径遇 string 维度即 E-TEXT-UNGATED；只有数值维度时通过', () => {
  const withString = mergeStateOwners(DECL, { units: new Set(['count']), kinds: new Set(['gadget']), tableDims: new Map([['gadget', DIMS]]) });
  assert.deepEqual(withString.errors.map((e) => [e.code, e.row, e.got]), [['E-TEXT-UNGATED', 'gauge.*.dims.*', 'gadget.label']]);
  const clean = mergeStateOwners(DECL, { units: new Set(['count']), kinds: new Set(['gadget']), tableDims: new Map([['gadget', { mass: { type: 'number' } }]]) });
  assert.deepEqual(clean.errors, []);
});
