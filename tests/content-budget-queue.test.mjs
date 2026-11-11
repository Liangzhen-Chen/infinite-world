import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpRoot } from '../tools/tmp-root.mjs';
import { openContentBudget } from '../tools/content-budget.mjs';

// 每次请求预留 reserve 元，实际花费 cost 元；gate 解除前 generate 不返回（模拟在途请求）。
async function setup(t, { limit, reserve, cost }) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'budget-queue-'));
  const calls = [];
  let open; const gate = new Promise(resolve => { open = resolve; });
  const client = {
    spent: 0, budgetYuan: limit, estimateCostYuan: () => reserve,
    async generate(body, label) { calls.push(label); await gate; return { choices: [], measurement: { costUpperYuan: cost } }; },
  };
  const budget = await openContentBudget({ file: path.join(root, 'budget.json'), client });
  t.after(async () => { open(); await budget.close().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  return { budget, client, calls, open };
}
const tick = () => new Promise(resolve => setTimeout(resolve, 30));
const withTimeout = (promise, ms = 2000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('挂起')), ms))]);

test('并发 3 条、额度只够 2 条在途：第 3 条等前面结算后再预留，总花费不超上限', async t => {
  // 与流水线一致：各条先并发预留，再逐条发送（发送在串行队列里）。
  const { budget, calls, open } = await setup(t, { limit: 0.25, reserve: 0.1, cost: 0.01 });
  open();
  const got = {};
  const reserved = ['a', 'b', 'c'].map(name => budget.reserveRound([{ body: { name }, label: 'req-' + name }]).then(ids => { got[name] = ids[0]; }));
  await tick();
  assert.deepEqual(Object.keys(got).sort(), ['a', 'b']); // c 只因 a、b 的在途预留占额度而排队，没有被 stop
  await budget.request({ name: 'a' }, 'req-a', { reservationId: got.a }); // a 结算，唤醒 c
  await withTimeout(Promise.all(reserved));
  assert.ok(got.c);
  await budget.request({ name: 'b' }, 'req-b', { reservationId: got.b });
  await budget.request({ name: 'c' }, 'req-c', { reservationId: got.c });
  assert.equal(calls.length, 3);
  const ledger = budget.ledger;
  assert.ok(ledger.spentYuan <= 0.25 + 1e-12);
  assert.ok(Math.abs(ledger.spentYuan - 0.03) < 1e-9);
  assert.ok(ledger.reservedYuan < 1e-9);
});

test('单条本身超过上限：立即 stop', async t => {
  const { budget } = await setup(t, { limit: 0.25, reserve: 0.3, cost: 0.01 });
  await assert.rejects(budget.request({ name: 'x' }, 'req-x'), { code: 'CONTENT_BUDGET_STOP' });
});

test('在途预留被释放（cancelled-unissued）后，等待者被唤醒并拿到预留', async t => {
  const { budget } = await setup(t, { limit: 0.25, reserve: 0.1, cost: 0.01 });
  const first = await budget.reserveRound([{ body: { n: 1 }, label: 'l1' }, { body: { n: 2 }, label: 'l2' }]);
  let got = null;
  const waiter = budget.reserveRound([{ body: { n: 3 }, label: 'l3' }]).then(ids => { got = ids; });
  await tick();
  assert.equal(got, null); // 0.2 在途，放不下 0.1，等待
  await budget.releaseRound(first);
  await withTimeout(waiter);
  assert.equal(got.length, 1);
  assert.equal(budget.ledger.requests[first[0]].status, 'cancelled-unissued');
});

test('不死锁：在途预留全部结算后仍放不下的等待者得到 stop，而不是永远挂起', async t => {
  const { budget, open } = await setup(t, { limit: 0.25, reserve: 0.2, cost: 0.2 });
  open();
  const [held] = await budget.reserveRound([{ body: { n: 1 }, label: 'l1' }]);
  // 0.2 在途 + 0.2 > 0.25，但已花 0 + 0.2 ≤ 0.25：先排队
  const outcome = budget.reserveRound([{ body: { n: 2 }, label: 'l2' }]).then(() => 'reserved', error => error.code);
  await tick();
  await budget.request({ n: 1 }, 'l1', { reservationId: held }); // 结算后已花 0.2，在途为 0，再放 0.2 超限
  assert.equal(await withTimeout(outcome), 'CONTENT_BUDGET_STOP');
});

test('次数上限仍立即判断，不排队', async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'budget-queue-'));
  const client = { spent: 0, budgetYuan: 20, estimateCostYuan: () => 0.01, async generate() { return { measurement: { costUpperYuan: 0.01 } }; } };
  // 带 cardId 必须已有共享历史账（登记的历史花费与预留为 0）；先写入合法的共享账再打开。
  const file = path.join(root, 'budget.json');
  await fs.writeFile(file, JSON.stringify({ spentYuan: 0, reservedYuan: 0, limitYuan: 20, waveLimitYuan: 20, requests: {} }));
  const budget = await openContentBudget({ file, client, cardId: 'Q1', allocation: { cardId: 'Q1', incrementLimitYuan: 1, waveLimitYuan: 20, maxRequests: 1, startingSpentYuan: 0, startingReservedYuan: 0 } });
  t.after(async () => { await budget.close().catch(() => {}); await fs.rm(root, { recursive: true, force: true }); });
  const first = await budget.reserveRound([{ body: { n: 1 }, label: 'l1' }]);
  assert.equal(first.length, 1);
  await assert.rejects(withTimeout(budget.reserveRound([{ body: { n: 2 }, label: 'l2' }])), /单卡调用次数上限/);
});
