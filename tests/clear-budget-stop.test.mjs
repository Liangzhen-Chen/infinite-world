import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpRoot } from '../tools/tmp-root.mjs';
import { clearBudgetStop } from '../tools/clear-budget-stop.mjs';

const stop = { code: 'CONTENT_BUDGET_STOP', message: '请求不符本轮预留，已停止', at: '2026-11-10T00:00:00.000Z' };
const text = value => `${JSON.stringify(value, null, 2)}\n`;
async function fixture(t, records) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'clear-stop-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [name, value] of Object.entries(records)) await fs.writeFile(path.join(root, `${name}.json`), text(value));
  return root;
}

test('清除后旧停止信息保留在 budgetStopHistory，其他字段逐字节不变', async t => {
  const rest = { id: 'item_a', fingerprint: 'f', status: 'pending', attempts: 1, draft: { id: 'item_a', description: '说明' }, review: null, errors: [], warnings: [] };
  const root = await fixture(t, { item_a: { ...rest, budgetStop: stop }, item_b: { id: 'item_b', status: 'pending' }, 'batch-0': { index: 0, ids: ['item_a'] } });
  const cleared = clearBudgetStop({ root, ids: ['item_a'], reason: '修复哈希预留缺陷', headCommit: 'abc1234', now: () => '2026-11-10T01:00:00.000Z' });
  assert.deepEqual(cleared, ['item_a']);
  const after = JSON.parse(await fs.readFile(path.join(root, 'item_a.json'), 'utf8'));
  assert.equal(after.budgetStop, undefined);
  assert.deepEqual(after.budgetStopHistory, [{ ...stop, clearedAt: '2026-11-10T01:00:00.000Z', reason: '修复哈希预留缺陷', headCommit: 'abc1234' }]);
  const { budgetStopHistory, ...others } = after;
  assert.equal(text(others), text(rest)); // 除 budgetStop / budgetStopHistory 外逐字节相同
  assert.equal(await fs.readFile(path.join(root, 'item_b.json'), 'utf8'), text({ id: 'item_b', status: 'pending' }));
  assert.equal(await fs.readFile(path.join(root, 'batch-0.json'), 'utf8'), text({ index: 0, ids: ['item_a'] }));
});

test('记录不带 budgetStop 或原因为空时报错，且不改任何文件', async t => {
  const root = await fixture(t, { item_a: { id: 'item_a', budgetStop: stop }, item_b: { id: 'item_b', status: 'pending' } });
  const before = await fs.readFile(path.join(root, 'item_a.json'), 'utf8');
  assert.throws(() => clearBudgetStop({ root, ids: ['item_a', 'item_b'], reason: '原因', headCommit: 'abc1234' }), /不带 budgetStop/);
  assert.throws(() => clearBudgetStop({ root, ids: ['item_a'], reason: '  ', headCommit: 'abc1234' }), /--reason/);
  assert.equal(await fs.readFile(path.join(root, 'item_a.json'), 'utf8'), before);
});

test('summary 与批次文件里若也有 budgetStop，同样处理并列出', async t => {
  const root = await fixture(t, { item_a: { id: 'item_a', budgetStop: stop }, summary: { total: 1, budgetStop: stop }, 'batch-0': { index: 0 } });
  assert.deepEqual(clearBudgetStop({ root, ids: ['item_a'], reason: '原因', headCommit: 'abc1234' }), ['item_a', 'summary.json']);
  const summary = JSON.parse(await fs.readFile(path.join(root, 'summary.json'), 'utf8'));
  assert.equal(summary.budgetStop, undefined);assert.equal(summary.budgetStopHistory[0].message, stop.message);
});
