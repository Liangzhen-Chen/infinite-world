// D12 卡 D：材料属性审批入口的 L1 与响应解析。数据本身的事实核对由 L2 完成，这里不重复期望数值。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {entriesFor, draftFor, validateDraft, l1, extractReview, checkReviewCap, maxReviewsPerEntry} from '../world/design/matprops-approval.mjs';

test('条目 = 每个类别行 + 每个物品覆盖行；候选与盘上数据逐字一致', async () => {
  const table = JSON.parse(await fs.readFile('world/meta/mechanics/material-props.json', 'utf8'));
  const overlay = JSON.parse(await fs.readFile('world/meta/mechanics/items.json', 'utf8'));
  const entries = await entriesFor();
  assert.equal(entries.length, Object.keys(table.classes).length + Object.values(overlay).filter(r => r.props).length);
  for (const e of entries) assert.deepEqual(await validateDraft(draftFor(e), e), [], e.id);
  assert.notDeepEqual(await validateDraft({id: entries[0].id, row: {...entries[0].row, moisture: 0.5}}, entries[0]), []);
});

test('L1：运行时世界的属性表通过校验，覆盖行不超过物品总数 15%', async () => {
  const r = await l1();
  assert.equal(r.L1, 'passed');
  assert.ok(r.overrides / r.items <= 0.15);
});

test('畸形的审查响应不算通过', () => {
  const response = content => ({choices: [{message: {content}}]});
  assert.deepEqual(extractReview(response('{"contradictions":[]}')), {contradictions: []});
  for (const content of ['{}', '{"contradictions":[{}]}', '{"contradictions":[{"quote":"a","field":"b","severity":"bad","reason":"c"}]}'])
    assert.throws(() => extractReview(response(content)), error => error.code === 'REVIEW_FORMAT');
});

test('同条审查上限 = 1 初审 + 2 修正：第 3 次放行，第 4 次在发请求前报 REVIEW_LIMIT（不发调用、不计费）', () => {
  const ledger = n => ({requests: Object.fromEntries(Array.from({length: n}, (_, i) => [`r${i}`, {label: `content-review-1-class_x-review${i}`, status: 'settled'}]))});
  assert.equal(maxReviewsPerEntry, 3);
  checkReviewCap(ledger(0), 'class_x'); checkReviewCap(ledger(2), 'class_x');
  assert.throws(() => checkReviewCap(ledger(3), 'class_x'), error => error.code === 'REVIEW_LIMIT');
  checkReviewCap(ledger(3), 'class_y');
  const cancelled = ledger(3); for (const r of Object.values(cancelled.requests)) r.status = 'cancelled-unissued';
  checkReviewCap(cancelled, 'class_x');
});
