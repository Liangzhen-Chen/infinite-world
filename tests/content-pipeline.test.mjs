import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runContentPipeline } from '../tools/content-pipeline.mjs';

test('逐条审查、最多两次重写、失败不拒绝同批、通过条目断点续跑', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const calls = [], client = { spent: 0, budgetYuan: 20, async generate(body, label) {
    calls.push(label); this.spent += 0.01;
    const review = label.includes('-review');
    const out = review ? { contradictions: label.includes('item_bad') ? [{ quote: '错误能力', field: 'use', severity: 'hard', reason: '骨架无此能力' }] : [] } : { id: body.id, description: body.id };
    return { choices: [{ message: { content: JSON.stringify(out) } }] };
  } };
  const options = { root, client, entries: [{ id: 'item_good' }, { id: 'item_bad' }], buildDraftRequest: entry => ({ id: entry.id }), validateDraft: () => [], concurrency: 2 };
  const first = await runContentPipeline(options);
  assert.equal(first.summary.passed, 1); assert.equal(first.summary.manual, 1);
  assert.equal(first.results[1].attempts, 3); assert.equal(calls.length, 8);
  const second = await runContentPipeline(options);
  assert.equal(calls.length, 8); assert.equal(second.summary.passed, 1);
  assert.equal(second.summary.batches[0].needsSystemicRepair, true);
});

test('累计预算续跑且骨架改变使旧通过结果失效', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'content-pipeline-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  let calls = 0;
  const client = { spent: 0, budgetYuan: 20, async generate(body, label) {
    calls++; this.spent += 1;
    return { choices: [{ message: { content: JSON.stringify(label.includes('-review') ? { contradictions: [] } : { id: 'item_one' }) } }] };
  } };
  const options = { root, client, entries: [{ id: 'item_one', weight: 1 }], buildDraftRequest: () => ({}), validateDraft: () => [] };
  await runContentPipeline(options); client.spent = 0;
  await runContentPipeline({ ...options, entries: [{ id: 'item_one', weight: 2 }] });
  assert.equal(calls, 4); assert.equal(client.spent, 4);
});
