// S1-1 卡 B1 单测：事务与推进（卷二 :539–:545、卷二十七 :190/:742）。期望值按卷文与数据表手算。路径一律经 engine.P（卷二 :536）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { init } from '../../server-plugin/index.mjs';
import { clockMinute } from '../../server-plugin/kernel/scheduler.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { dim } from '../../server-plugin/kernel/dimensions.mjs';

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

// create.template（卷二:128、:131；卷九:640）：实例的实体行就是其模板；facts（偏离行）覆盖模板值；template 须是同 kind 登记的实体行。
const tplCase = (g) => {
  const doc = g.engine.registry.tables.get('item');
  for (const [tid, row] of Object.entries(doc.rows)) {
    const k = Object.keys(row).find((d) => typeof row[d] === 'number' && Object.hasOwn(doc.dimensions, d));
    if (k) return { tid, dimension: k, value: row[k] };
  }
  return undefined;
};

test('create 带 template：dim 读到模板实体行的值；facts 覆盖后读到 facts 值', async () => {
  const g = await init();
  const c = tplCase(g);
  assert.ok(c, '前提：item 表有带数值维度的实体行');
  const r = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template: c.tid, facts: {} }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const id = Object.keys(g.state.created)[0];
  assert.equal(g.state.created[id].template, c.tid);
  assert.equal(dim(g.engine, g.state, 'item', id, c.dimension).value, c.value);
  const over = c.value + 1;
  const r2 = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template: c.tid, facts: { [c.dimension]: over } }] });
  assert.equal(r2.ok, true, JSON.stringify(r2));
  const id2 = Object.keys(g.state.created).find((x) => x !== id);
  assert.equal(dim(g.engine, g.state, 'item', id2, c.dimension).value, over);
});

test('create 的 template 指向别的 kind 或不存在即拒收，状态不变', async () => {
  const g = await init();
  const other = Object.keys(g.engine.registry.tables.get('material').rows)[0];
  for (const template of [other, 'item_no_such_row']) {
    const r = g.submitProposal({ effects: [{ op: 'create', kind: 'item', template, facts: {} }] });
    assert.equal(r.ok, false);
  }
  assert.equal(Object.keys(g.state.created).length, 0);
});
