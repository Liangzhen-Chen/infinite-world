import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpRoot } from '../tools/tmp-root.mjs';
import { hashContent, readApprovedContent, rowFingerprintShape } from '../tools/content-pipeline.mjs';
import { manualRewrite } from '../tools/manual-rewrite.mjs';

const entries = [{ id: 'a_ok', k: 1 }, { id: 'b_man', k: 2 }, { id: 'c_rej', k: 3 }];
const validateDraft = draft => (typeof draft.description === 'string' && draft.description.length >= 5 && !draft.description.includes('BAD') ? { errors: [] } : { errors: ['说明不合格'] });
const writeJson = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'manual-rewrite-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const clean = { contradictions: [] };
  const rec = (entry, status, description) => ({ id: entry.id, fingerprint: hashContent({ entry, context: null, revision: 'v2' }), status, attempts: 3, draft: { id: entry.id, description }, review: status === 'passed' ? clean : { contradictions: [{ quote: 'q', field: 'f', severity: 'hard', reason: 'r' }] }, errors: status === 'passed' ? [] : [{ severity: 'hard' }], warnings: [] });
  const rows = [rec(entries[0], 'passed', '原稿甲甲甲甲'), rec(entries[1], 'manual', '原稿乙乙乙乙'), rec(entries[2], 'passed', '原稿丙丙丙丙')];
  for (const row of rows) await writeJson(path.join(root, `${row.id}.json`), row);
  const batch = { index: 0, fingerprint: hashContent(rows.map(rowFingerprintShape)), count: 3, passed: 2, ids: rows.map(r => r.id), manual: ['b_man'], pending: [], flagged: [], sample: [], l4: { approved: false, notes: [], rejection: { by: '审查员', at: 't', reason: '不通顺', ids: ['c_rej'] } } };
  await writeJson(path.join(root, 'batch-0.json'), batch);
  await writeJson(path.join(root, 'summary.json'), { total: 3, passed: 2, manual: 1, pending: 0, batches: [batch] });
  return root;
}
const snapshot = async root => Object.fromEntries(await Promise.all((await fs.readdir(root)).sort().map(async name => [name, await fs.readFile(path.join(root, name), 'utf8')])));
const run = (root, drafts, by = '改写者甲') => manualRewrite({ root, drafts, by, reason: '按骨架人工改写', headCommit: 'abcdef1', entries, validateDraft, now: () => '2026-11-10T00:00:00.000Z' });
const good = (id, text = '新稿正文足够长') => ({ id, draft: { id, description: text } });
async function approve(root, notes) {
  const file = path.join(root, 'batch-0.json'), batch = await readJson(file);
  batch.l4 = { approved: true, notes };
  await writeJson(file, batch);
}
const note = (id, by) => ({ id, note: '已逐字阅读，与骨架一致', by });
const publish = root => readApprovedContent(root, entries);

test('任一条 L1 不过：整批拒绝，零写盘', async t => {
  const root = await fixture(t), before = await snapshot(root);
  await assert.rejects(run(root, [good('b_man'), { id: 'c_rej', draft: { id: 'c_rej', description: 'BAD 内容内容' } }]), /L1 未通过/);
  assert.deepEqual(await snapshot(root), before);
});

test('非 manual 且未被 L4 退回的条目拒绝，零写盘', async t => {
  const root = await fixture(t), before = await snapshot(root);
  await assert.rejects(run(root, [good('b_man'), good('a_ok')]), /既非 manual 也未被 L4 退回/);
  assert.deepEqual(await snapshot(root), before);
});

test('旧稿、旧审查、旧状态进历史；退回条目与 manual 条目都可改写；批次指纹同步、L4 重置', async t => {
  const root = await fixture(t), oldBatch = await readJson(path.join(root, 'batch-0.json')), oldB = await readJson(path.join(root, 'b_man.json')), oldC = await readJson(path.join(root, 'c_rej.json'));
  assert.deepEqual(await run(root, [good('b_man'), good('c_rej')]), ['b_man', 'c_rej']);
  const b = await readJson(path.join(root, 'b_man.json')), c = await readJson(path.join(root, 'c_rej.json'));
  assert.equal(b.manualRewrite.length, 1);
  assert.deepEqual(b.manualRewrite[0], { by: '改写者甲', at: '2026-11-10T00:00:00.000Z', reason: '按骨架人工改写', headCommit: 'abcdef1', priorStatus: 'manual', priorDraft: oldB.draft, priorReview: oldB.review, priorAttempts: 3 });
  assert.deepEqual(c.manualRewrite[0].priorDraft, oldC.draft);
  assert.equal(c.manualRewrite[0].priorStatus, 'passed');
  assert.equal(b.status, 'passed');
  assert.equal(b.review.kind, 'manual-rewrite-no-l2');
  assert.equal(b.review.contradictions, undefined);
  const batch = await readJson(path.join(root, 'batch-0.json')), summary = await readJson(path.join(root, 'summary.json'));
  assert.notEqual(batch.fingerprint, oldBatch.fingerprint);
  assert.equal(batch.l4.approved, false);
  assert.deepEqual(batch.l4History, [oldBatch.l4]);
  assert.deepEqual(batch.manual, []);
  assert.equal(summary.batches[0].fingerprint, batch.fingerprint);
  assert.equal(summary.passed, 3); assert.equal(summary.manual, 0);
});

test('缺本条 L4 阅读记录：拒绝发布；补全独立审查者记录后通过', async t => {
  const root = await fixture(t);
  await run(root, [good('b_man'), good('c_rej')]);
  await approve(root, [note('b_man', '审查者乙')]);
  await assert.rejects(publish(root), /人工改写条目缺少 L4 阅读记录 c_rej/);
  await approve(root, [note('b_man', '审查者乙'), note('c_rej', '审查者乙')]);
  const out = await publish(root);
  assert.deepEqual(out.map(d => d.id).sort(), ['a_ok', 'b_man', 'c_rej']);
});

test('审查者与改写者相同（含大小写、空白差异）：拒绝发布', async t => {
  const root = await fixture(t);
  await run(root, [good('b_man')], 'Alice');
  await approve(root, [note('b_man', ' alice ')]);
  await assert.rejects(publish(root), /审查者与改写者相同 b_man/);
  await approve(root, [{ id: 'b_man', note: '已读' }]);
  await assert.rejects(publish(root), /缺少审查者 b_man/);
  await approve(root, [note('b_man', 'Bob')]);
  assert.equal((await publish(root)).length, 3);
});

test('改写并批准后再改 draft：批次指纹拦下', async t => {
  const root = await fixture(t);
  await run(root, [good('b_man')]);
  await approve(root, [note('b_man', '审查者乙')]);
  assert.equal((await publish(root)).length, 3);
  const file = path.join(root, 'b_man.json'), record = await readJson(file);
  record.draft.description = '事后偷改的正文';
  await writeJson(file, record);
  await assert.rejects(publish(root), /审查后内容已改变/);
});

test('改写后改历史里的 by 同样被指纹拦下；带人工标记但无改写历史的记录拒绝', async t => {
  const root = await fixture(t);
  await run(root, [good('b_man')], 'Alice');
  await approve(root, [note('b_man', 'Alice2')]);
  const file = path.join(root, 'b_man.json'), record = await readJson(file);
  record.manualRewrite[0].by = 'Alice2';
  await writeJson(file, record);
  await assert.rejects(publish(root), /审查后内容已改变/);
  // 机器条目伪造人工标记：连同批次指纹一起改写也必须拒绝
  const root2 = await fixture(t), f2 = path.join(root2, 'a_ok.json'), forged = await readJson(f2);
  forged.review = { kind: 'manual-rewrite-no-l2', l2: 'not-run', by: 'x', at: 't' };
  await writeJson(f2, forged);
  const bf = path.join(root2, 'batch-0.json'), batch = await readJson(bf), rows = await Promise.all(batch.ids.map(id => readJson(path.join(root2, `${id}.json`))));
  batch.fingerprint = hashContent(rows.map(rowFingerprintShape)); batch.manual = []; batch.l4 = { approved: true, notes: [] };
  await writeJson(bf, batch);
  const sf = path.join(root2, 'summary.json'), summary = await readJson(sf); summary.batches = [batch]; await writeJson(sf, summary);
  await assert.rejects(publish(root2), /人工改写记录不完整 a_ok/);
});
