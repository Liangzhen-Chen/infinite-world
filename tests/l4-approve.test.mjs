import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpRoot } from '../tools/tmp-root.mjs';
import { hashContent, readApprovedContent, rowFingerprintShape } from '../tools/content-pipeline.mjs';
import { manualRewrite } from '../tools/manual-rewrite.mjs';
import { approveL4 } from '../tools/l4-approve.mjs';

const entries = [{ id: 'a_ok', k: 1 }, { id: 'b_man', k: 2 }, { id: 'c_flag', k: 3 }];
const validateDraft = () => ({ errors: [] });
const writeJson = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'l4-approve-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rec = (entry, status) => ({ id: entry.id, fingerprint: hashContent({ entry, context: null, revision: 'v2' }), status, attempts: 1, draft: { id: entry.id, description: '原稿正文正文' }, review: { contradictions: [] }, errors: [], warnings: [] });
  const rows = [rec(entries[0], 'passed'), rec(entries[1], 'manual'), rec(entries[2], 'passed')];
  for (const row of rows) await writeJson(path.join(root, `${row.id}.json`), row);
  const batch = { index: 0, fingerprint: hashContent(rows.map(rowFingerprintShape)), count: 3, passed: 2, ids: rows.map(r => r.id), manual: ['b_man'], pending: [], flagged: ['c_flag'], sample: ['a_ok'], l4: { approved: false, notes: [] } };
  await writeJson(path.join(root, 'batch-0.json'), batch);
  await writeJson(path.join(root, 'summary.json'), { total: 3, passed: 2, manual: 1, pending: 0, batches: [batch] });
  await manualRewrite({ root, drafts: [{ id: 'b_man', draft: { id: 'b_man', description: '人工新稿正文' } }], by: 'Alice', reason: 'r', headCommit: 'abcdef1', entries, validateDraft });
  return root;
}
const snapshot = async root => Object.fromEntries(await Promise.all((await fs.readdir(root)).sort().map(async n => [n, await fs.readFile(path.join(root, n), 'utf8')])));
const n = id => ({ id, note: '已逐字阅读' });
const at = () => '2026-11-10T00:00:00.000Z';

test('by 必填；人工改写条目的 by 等于改写者拒绝；批外 id 拒绝；都零写盘', async t => {
  const root = await fixture(t), before = await snapshot(root);
  const call = (notes, by) => () => approveL4({ root, batch: 0, notes, by, now: at });
  assert.throws(call([n('a_ok')], ''), /--by 不能为空/);
  assert.throws(call([n('b_man')], ' alice '), /审查者与人工改写者相同 b_man/);
  assert.throws(call([n('zzz')], 'Bob'), /不在本批/);
  assert.throws(call([{ id: 'a_ok', note: ' ' }], 'Bob'), /缺 note/);
  assert.deepEqual(await snapshot(root), before);
});

test('--approve 缺 sample、flagged 或人工改写条目的阅读记录：拒绝零写盘；齐全后写入 l4 形状并可发布', async t => {
  const root = await fixture(t), before = await snapshot(root);
  assert.throws(() => approveL4({ root, batch: 0, notes: [n('a_ok'), n('c_flag')], by: 'Bob', approve: true, now: at }), /批准前缺少阅读记录：b_man/);
  assert.throws(() => approveL4({ root, batch: 0, notes: [n('b_man')], by: 'Bob', approve: true, now: at }), /缺少阅读记录：a_ok,c_flag/);
  assert.deepEqual(await snapshot(root), before);
  // 先只记录、不批准；再分次补齐后批准
  const part = approveL4({ root, batch: 0, notes: [n('a_ok')], by: 'Bob', now: at });
  assert.equal(part.approved, false);
  const l4 = approveL4({ root, batch: 0, notes: [n('b_man'), n('c_flag')], by: 'Bob', approve: true, now: at });
  assert.deepEqual(l4, { approved: true, reviewer: 'Bob', by: 'Bob', reviewedAt: at(), notes: [{ id: 'a_ok', note: '已逐字阅读', by: 'Bob' }, { id: 'b_man', note: '已逐字阅读', by: 'Bob' }, { id: 'c_flag', note: '已逐字阅读', by: 'Bob' }] });
  assert.deepEqual((await readJson(path.join(root, 'summary.json'))).batches[0].l4, l4);
  assert.equal((await readApprovedContent(root, entries)).length, 3);
});
