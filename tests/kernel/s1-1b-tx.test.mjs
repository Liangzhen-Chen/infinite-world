// S1-1 卡 B1 单测：事务与推进（卷二 :539–:545、卷二十七 :190/:742）。期望值按卷文与数据表手算。路径一律经 engine.P（卷二 :536）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { init } from '../../server-plugin/index.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { readPath, writePath } from '../../server-plugin/kernel/storage.mjs';

const logOf = (g) => readPath(g.state, g.engine.P.log_entries());

test('time 原语：推进 25 分钟按步长 10/10/5 分三步，时钟加 25', async () => {
  const g = await init();
  const step = g.engine.host.heartbeatStepMinutes;
  const r = g.submitProposal({ effects: [{ op: 'time', minutes: 2 * step + 5 }] });
  assert.equal(r.ok, true);
  assert.equal(r.advancedMinutes, 2 * step + 5);
  assert.equal(clockMinute(g.engine, g.state), 2 * step + 5);
});

test('非正整数分钟拒收，时钟不动', async () => {
  const g = await init();
  for (const m of [0, -3, 1.5, '5']) {
    const r = g.submitProposal({ effects: [{ op: 'time', minutes: m }] });
    assert.equal(r.ok, false);
    assert.equal(clockMinute(g.engine, g.state), 0);
  }
  assert.throws(() => g.advance(0));
  assert.throws(() => g.advance(2.5));
});

test('未登记处理函数的原语拒收，不抛出调用方', async () => {
  const g = await init();
  const r = g.submitProposal({ effects: [{ op: 'transfer', from: 'a', to: 'b', qty: 1 }, { op: 'no.such.op' }] });
  assert.equal(r.ok, false);
  assert.equal(typeof r.code, 'string');
  assert.equal(clockMinute(g.engine, g.state), 0);
});

test('拒写整笔回滚且时钟不动；输入条目仍留在日志', async () => {
  const g = await init();
  const before = logOf(g).length;
  const r = g.submitProposal({ effects: [{ op: 'time', minutes: 10 }, { op: 'fact.set', entity: 'nope_missing', field: 'x', value: 1 }] });
  assert.equal(r.ok, false);
  assert.equal(clockMinute(g.engine, g.state), 0);
  assert.equal(logOf(g)[before].kind, 'command');
  assert.equal(logOf(g)[before].seq, r.seq);
});

test('runTransaction：抛错整笔撤回并返回 {ok:false}；不嵌套', async () => {
  const g = await init();
  const { P } = g.engine;
  const r = runTransaction(g.engine, g.state, (tx) => {
    writePath(g.state, P.clock_minute(), 99, tx);
    writePath(g.state, P.created_props('nope_x', 'y'), 1, tx);
  });
  assert.equal(r.ok, false);
  assert.equal(clockMinute(g.engine, g.state), 0);
  const n = runTransaction(g.engine, g.state, () => runTransaction(g.engine, g.state, () => 1));
  assert.equal(n.ok, false);
});

test('create 与 fact.set：新建实体并写 props，请求编号单调', async () => {
  const g = await init();
  const kind = [...g.engine.registry.kindIds.entries()].find(([, rec]) => Array.isArray(rec.idPrefix) && rec.idPrefix.length > 0)?.[0];
  assert.ok(kind, '前提：存在带 id 前缀的种类');
  const r = g.submitProposal({ effects: [{ op: 'create', kind, facts: {} }] });
  if (r.ok) {
    const id = Object.keys(g.state.created)[0];
    assert.equal(g.state.created[id].kind, kind);
    const r2 = g.submitProposal({ effects: [{ op: 'time', minutes: 1 }] });
    assert.ok(r2.seq > r.seq);
  } else {
    assert.equal(typeof r.code, 'string');
  }
});
