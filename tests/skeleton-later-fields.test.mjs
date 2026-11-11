// SKELFACT：后加骨架字段（physical）的历史投影。旧记录（无 skeletonFields 标记）核对指纹时先投影掉登记字段；
// 其他任何变化照样判失效；新写入的记录按含 physical 的完整 entry 记指纹。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {hashContent, readApprovedContent, rowFingerprintShape, runContentPipeline, LATER_ENTRY_FIELDS, projectEntryForRecord, recordFingerprint} from '../tools/content-pipeline.mjs';

const old = {id: 'item_x', name: '甲', weight: 1};
const next = {...old, physical: {formFacts: ['削出浅匙腹']}};
const writeJson = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);

async function fixture(t, record) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'later-fields-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const row = {id: 'item_x', status: 'passed', attempts: 1, draft: {id: 'item_x', description: '正文正文'}, review: {contradictions: []}, errors: [], warnings: [], ...record};
  await writeJson(path.join(root, 'item_x.json'), row);
  const batch = {index: 0, fingerprint: hashContent([row].map(rowFingerprintShape)), count: 1, passed: 1, ids: ['item_x'], manual: [], pending: [], flagged: [], sample: ['item_x'], l4: {approved: true, notes: [{id: 'item_x', note: '已读'}]}};
  await writeJson(path.join(root, 'batch-0.json'), batch);
  await writeJson(path.join(root, 'summary.json'), {total: 1, passed: 1, manual: 0, pending: 0, batches: [batch]});
  return root;
}
const legacyRecord = {fingerprint: hashContent({entry: old, context: null, revision: 'v2'})};

test('登记表：physical 是后加字段，写明生效标记', () => {
  assert.deepEqual(LATER_ENTRY_FIELDS.map(row => row.field), ['physical']);
  assert.equal(typeof LATER_ENTRY_FIELDS[0].since, 'string');
});

test('projectEntryForRecord：旧记录投影掉登记字段，已标记的记录保留，没有登记字段的 entry 原样返回', () => {
  assert.deepEqual(projectEntryForRecord(next, {}), old);
  assert.deepEqual(projectEntryForRecord(next, {skeletonFields: ['physical']}), next);
  assert.equal(projectEntryForRecord(old, {}), old);
  const other = {...next, weight: 2};
  assert.deepEqual(projectEntryForRecord(other, {}), {...old, weight: 2}, '只剥登记字段，其他字段保留');
});

test('旧记录：entry 加了 physical 后仍能按已批准读取', async t => {
  const root = await fixture(t, legacyRecord);
  assert.equal((await readApprovedContent(root, [next], {revision: 'v2'})).length, 1);
  assert.equal((await readApprovedContent(root, [old], {revision: 'v2'})).length, 1);
});

test('旧记录：physical 之外的骨架变化、引用事实变化、revision 变化照样失效', async t => {
  const root = await fixture(t, legacyRecord);
  await assert.rejects(readApprovedContent(root, [{...next, weight: 2}], {revision: 'v2'}), /发布骨架或引用事实已改变/);
  await assert.rejects(readApprovedContent(root, [{...next, name: '乙'}], {revision: 'v2'}), /发布骨架或引用事实已改变/);
  await assert.rejects(readApprovedContent(root, [next], {revision: 'v2', contextFor: () => ({facts: 1})}), /发布骨架或引用事实已改变/);
  await assert.rejects(readApprovedContent(root, [next], {revision: 'v3'}), /发布骨架或引用事实已改变/);
});

test('新记录（带 skeletonFields）按含 physical 的 entry 记指纹：physical 变化即失效', async t => {
  const record = {skeletonFields: ['physical'], fingerprint: hashContent({entry: next, context: null, revision: 'v2'})};
  const root = await fixture(t, record);
  assert.equal((await readApprovedContent(root, [next], {revision: 'v2'})).length, 1);
  await assert.rejects(readApprovedContent(root, [{...next, physical: {formFacts: ['别的']}}], {revision: 'v2'}), /发布骨架或引用事实已改变/);
  await assert.rejects(readApprovedContent(root, [old], {revision: 'v2'}), /发布骨架或引用事实已改变/);
  assert.equal(recordFingerprint(record, next, null, 'v2'), record.fingerprint);
});

test('流水线：旧记录不因 entry 加了 physical 而重写；新条目的记录带 skeletonFields 标记', async t => {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'later-fields-run-'));
  t.after(() => fs.rm(root, {recursive: true, force: true}));
  const calls = [], client = {spent: 0, budgetYuan: 20, estimateCostYuan: () => .01, async generate(body, label) {
    calls.push(label); this.spent += 0.01;
    const out = label.includes('-review') ? {contradictions: []} : {id: body.id, description: body.id};
    return {choices: [{message: {content: JSON.stringify(out)}}], usage: {completion_tokens: 11}, measurement: {costUpperYuan: .01}};
  }};
  const options = entries => ({root, client, entries, buildDraftRequest: entry => ({id: entry.id}), reviewDraftFor: entry => ({id: entry.id, description: entry.id}), validateDraft: () => [], concurrency: 1, revision: 'v2'});
  await runContentPipeline(options([old]));
  const before = JSON.parse(await fs.readFile(path.join(root, 'item_x.json'), 'utf8')), n = calls.length;
  assert.equal(before.skeletonFields, undefined, '没有后加字段的 entry 不加标记');
  await runContentPipeline(options([next]));
  const after = JSON.parse(await fs.readFile(path.join(root, 'item_x.json'), 'utf8'));
  assert.equal(calls.length, n, '旧记录沿用，不重新起草');
  assert.equal(after.fingerprint, before.fingerprint);
  const fresh = {id: 'item_y', name: '丙', physical: {formFacts: ['卷成握环']}};
  await runContentPipeline(options([next, fresh]));
  const made = JSON.parse(await fs.readFile(path.join(root, 'item_y.json'), 'utf8'));
  assert.deepEqual(made.skeletonFields, ['physical']);
  assert.equal(made.fingerprint, hashContent({entry: fresh, context: null, revision: 'v2'}));
  assert.equal(JSON.parse(await fs.readFile(path.join(root, 'item_x.json'), 'utf8')).skeletonFields, undefined);
});
