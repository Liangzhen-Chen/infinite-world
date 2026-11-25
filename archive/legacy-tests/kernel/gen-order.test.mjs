// 卷十 R10-2.18 高低次序投影：projectOrder 纯函数按 lo/bound 投影生成值、作者值原样、未知不赋值、作者冲突报 E-GEN-ORDER-CONFLICT；
// genOrder 从作者行视图收集 downstream 约束与作者次序链，交出提案与 W-GEN-DOWNHILL-PROJECTED 日志。期望值按卷十 :439–:445 手算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { projectOrder, genOrder } from '../../server-plugin/kernel/gen/order.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';

const EL = 'anchorElevationM';
const WET = ['comp_tract', 'comp_waterbody'];
const CHAIN = [['a', 'b'], ['b', 'c']];
const val = (v, fixed) => ({ value: v, fixed });
const conflictCode = (code) => (e) => e && e.code === code;
const capture = (fn) => { const logs = []; const prev = useReportSink((r) => logs.push(r)); try { return { out: fn(), logs }; } finally { useReportSink(prev); } };

test('A. 三个生成值的链 a→b→c：b 被上游压到 5，日志记 cap', () => {
  const out = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(5, false)], ['b', val(9, false)], ['c', val(1, false)]]),
  });
  assert.deepEqual(out.final, new Map([['a', 5], ['b', 5], ['c', 1]]));
  assert.deepEqual(out.projections, [{ row: 'b', from: 9, to: 5, end: 'cap', by: 'a' }]);
  assert.equal(out.changed, 1);
});

test('B. 下游作者值 7 抬高上游、上游再压下游：a 记 floor、b 记 cap', () => {
  const out = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(5, false)], ['b', val(9, false)], ['c', val(7, true)]]),
  });
  assert.deepEqual(out.final, new Map([['a', 7], ['b', 7], ['c', 7]]));
  assert.deepEqual(out.projections, [
    { row: 'a', from: 5, to: 7, end: 'floor', by: 'c' },
    { row: 'b', from: 9, to: 7, end: 'cap', by: 'a' },
  ]);
  assert.equal(out.changed, 2);
});

test('C. 作者固定值次序反了（a=3、c=8，b 未知）：报 E-GEN-ORDER-CONFLICT，不改任何值', () => {
  const values = new Map([['a', val(3, true)], ['c', val(8, true)]]);
  assert.throws(() => projectOrder({ constraints: CHAIN, values }), conflictCode('E-GEN-ORDER-CONFLICT'));
  assert.deepEqual(values, new Map([['a', val(3, true)], ['c', val(8, true)]]));
});

test('D. 约束成环（二元环与自环）：都报 E-GEN-ORDER-CONFLICT', () => {
  const values = new Map([['a', val(1, false)], ['b', val(2, false)]]);
  assert.throws(() => projectOrder({ constraints: [['a', 'b'], ['b', 'a']], values }), conflictCode('E-GEN-ORDER-CONFLICT'));
  assert.throws(() => projectOrder({ constraints: [['a', 'a']], values }), conflictCode('E-GEN-ORDER-CONFLICT'));
});

test('E. 约束透过未知节点 u 传递：c 被压到 10，final 里没有 u', () => {
  const out = projectOrder({
    constraints: [['a', 'u'], ['u', 'c']],
    values: new Map([['a', val(10, true)], ['c', val(20, false)]]),
  });
  assert.equal(out.final.get('c'), 10);
  assert.equal(out.final.has('u'), false);
  assert.deepEqual(out.projections, [{ row: 'c', from: 20, to: 10, end: 'cap', by: 'u' }]);
});

test('F. 不在任何约束里的节点原样：z 生成 4 不被投影', () => {
  const out = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(5, false)], ['b', val(9, false)], ['c', val(1, false)], ['z', val(4, false)]]),
  });
  assert.equal(out.final.get('z'), 4);
  assert.deepEqual(out.projections.filter((p) => p.row === 'z'), []);
});

test('G. 与约束给出次序、values 插入次序无关：与 B 逐项相等', () => {
  const b = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(5, false)], ['b', val(9, false)], ['c', val(7, true)]]),
  });
  const g = projectOrder({
    constraints: [['b', 'c'], ['a', 'b']],
    values: new Map([['c', val(7, true)], ['b', val(9, false)], ['a', val(5, false)]]),
  });
  assert.deepEqual(g.final, b.final);
  assert.deepEqual(g.projections, b.projections);
});

test('H. 固定值一个都不动：B 里 c 仍为 7；已满足次序的 a20→b9→c7 无投影', () => {
  const b = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(5, false)], ['b', val(9, false)], ['c', val(7, true)]]),
  });
  assert.equal(b.final.get('c'), 7);
  const ok = projectOrder({
    constraints: CHAIN,
    values: new Map([['a', val(20, true)], ['b', val(9, false)], ['c', val(7, true)]]),
  });
  assert.deepEqual(ok.final, new Map([['a', 20], ['b', 9], ['c', 7]]));
  assert.deepEqual(ok.projections, []);
});

const fixture = () => buildGenRows(new Map([
  ['loc_w', { parent: null, classes: [] }],
  ['loc_r1', { parent: 'loc_w', classes: WET, downstream: 'loc_r2', anchorElevationM: 5 }],
  ['loc_r2', { parent: 'loc_w', classes: WET, downstream: 'loc_r3', anchorElevationM: 9 }],
  ['loc_r3', { parent: 'loc_w', classes: WET, downstream: null, anchorElevationM: 7 }],
]), { index: new Map() });
const ctxOf = (rows, isAuthored, downhill = []) => ({
  table: 'place', stage: 'gstage_order', rows, elevationDim: EL, roleWaterbody: 'comp_waterbody', downhill, isAuthored,
});
const authoredDownstreamAndR3 = (id, dim) => dim === 'downstream' || (id === 'loc_r3' && dim === EL);

test('I1. genOrder：r1、r2 生成海拔被投影到 7，两条提案按 id 升序，日志逐行', () => {
  const { out } = capture(() => genOrder(ctxOf(fixture(), authoredDownstreamAndR3)));
  assert.deepEqual(out.proposals, [
    { table: 'place', id: 'loc_r1', dims: { [EL]: 7 }, by: 'gstage_order', seedKey: '', revise: true },
    { table: 'place', id: 'loc_r2', dims: { [EL]: 7 }, by: 'gstage_order', seedKey: '', revise: true },
  ]);
  assert.equal(out.report.changed, 2);
  assert.deepEqual(out.report.projections, [
    { row: 'loc_r1', dim: EL, from: 5, to: 7, end: 'floor', by: 'loc_r3' },
    { row: 'loc_r2', dim: EL, from: 9, to: 7, end: 'cap', by: 'loc_r1' },
  ]);
  assert.deepEqual(out.deferred, []);
});

test('I2. genOrder：downstream 不是作者写的就不进约束图，无提案', () => {
  const { out } = capture(() => genOrder(ctxOf(fixture(), (id, dim) => id === 'loc_r3' && dim === EL)));
  assert.deepEqual(out.proposals, []);
});

test('I3. genOrder：两处作者海拔次序反了（r1=3、r3=8）：报 E-GEN-ORDER-CONFLICT', () => {
  const rows = buildGenRows(new Map([
    ['loc_w', { parent: null, classes: [] }],
    ['loc_r1', { parent: 'loc_w', classes: WET, downstream: 'loc_r2', anchorElevationM: 3 }],
    ['loc_r2', { parent: 'loc_w', classes: WET, downstream: 'loc_r3', anchorElevationM: 9 }],
    ['loc_r3', { parent: 'loc_w', classes: WET, downstream: null, anchorElevationM: 8 }],
  ]), { index: new Map() });
  const isAuthored = (id, dim) => dim === 'downstream' || dim === EL;
  assert.throws(() => genOrder(ctxOf(rows, isAuthored)), conflictCode('E-GEN-ORDER-CONFLICT'));
});

test('I4. genOrder：作者次序链把 loc_b 压到 loc_a，别的维度的链不起作用', () => {
  const rows = () => buildGenRows(new Map([
    ['loc_a', { parent: null, classes: [], [EL]: 100 }],
    ['loc_b', { parent: null, classes: [], [EL]: 200 }],
  ]), { index: new Map() });
  const isAuthored = (id, dim) => id === 'loc_a' && dim === EL;
  const { out } = capture(() => genOrder(ctxOf(rows(), isAuthored, [{ chain: ['loc_a', 'loc_b'], dim: EL }])));
  assert.deepEqual(out.proposals, [
    { table: 'place', id: 'loc_b', dims: { [EL]: 100 }, by: 'gstage_order', seedKey: '', revise: true },
  ]);
  assert.deepEqual(out.report.projections, [{ row: 'loc_b', dim: EL, from: 200, to: 100, end: 'cap', by: 'loc_a' }]);
  const { out: other } = capture(() => genOrder(ctxOf(rows(), isAuthored, [{ chain: ['loc_a', 'loc_b'], dim: 'forestCover' }])));
  assert.deepEqual(other.proposals, []);
});

test('I5. genOrder：elevationDim 不是字符串时什么都不做', () => {
  const { out, logs } = capture(() => genOrder({ ...ctxOf(fixture(), authoredDownstreamAndR3), elevationDim: undefined }));
  assert.deepEqual(out.proposals, []);
  assert.deepEqual(out.report.projections, []);
  assert.equal(out.report.changed, 0);
  assert.deepEqual(logs, []);
});

test('I6. genOrder：调用两次结果深度相等，日志条数等于 changed 且逐行可对', () => {
  const ctx = () => ctxOf(fixture(), authoredDownstreamAndR3);
  const first = capture(() => genOrder(ctx()));
  const second = capture(() => genOrder(ctx()));
  assert.deepEqual(first.out, second.out);
  assert.equal(first.logs.length, first.out.report.changed);
  const changedRows = first.out.report.projections.map((p) => p.row);
  for (const l of first.logs) {
    assert.equal(l.code, 'W-GEN-DOWNHILL-PROJECTED');
    assert.equal(changedRows.includes(l.fields.row), true);
  }
});
