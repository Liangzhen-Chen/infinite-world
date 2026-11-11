import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { tmpRoot } from '../tools/tmp-root.mjs';
import { hashContent, readApprovedContent, rowFingerprintShape } from '../tools/content-pipeline.mjs';
import { manualRewrite } from '../tools/manual-rewrite.mjs';
import { approveL4 } from '../tools/l4-approve.mjs';
import { requireFlagValue } from '../tools/content-pipeline.mjs';

const entries = [{ id: 'a_ok', k: 1 }, { id: 'b_man', k: 2 }, { id: 'c_flag', k: 3 }];
const validateDraft = () => ({ errors: [] });
const writeJson = (file, data) => fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`);
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
async function fixture(t, rejection) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'l4-approve-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const rec = (entry, status) => ({ id: entry.id, fingerprint: hashContent({ entry, context: null, revision: 'v2' }), status, attempts: 1, draft: { id: entry.id, description: '原稿正文正文' }, review: { contradictions: [] }, errors: [], warnings: entry.id === 'c_flag' ? ['进 L4 抽读的警告'] : [] });
  // c_flag 带警告：manualRewrite 重算批次时按“有警告即 flagged”得到 flagged=['c_flag']（与流水线同一规则），不靠手写。
  const rows = [rec(entries[0], 'passed'), rec(entries[1], 'manual'), rec(entries[2], 'passed')];
  for (const row of rows) await writeJson(path.join(root, `${row.id}.json`), row);
  const batch = { index: 0, fingerprint: hashContent(rows.map(rowFingerprintShape)), count: 3, passed: 2, ids: rows.map(r => r.id), manual: ['b_man'], pending: [], flagged: ['c_flag'], sample: ['a_ok'], l4: { approved: false, notes: [] } };
  await writeJson(path.join(root, 'batch-0.json'), batch);
  await writeJson(path.join(root, 'summary.json'), { total: 3, passed: 2, manual: 1, pending: 0, batches: [batch] });
  if (rejection) { const f = path.join(root, 'batch-0.json'), b = await readJson(f); b.l4.rejection = rejection; await writeJson(f, b); }
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

async function refresh(root) { // 改了条目后同步批次与 summary 的指纹，用来单独触发指纹之外的门槛
  const f = path.join(root, 'batch-0.json'), b = await readJson(f);
  b.fingerprint = hashContent(await Promise.all(b.ids.map(id => readJson(path.join(root, `${id}.json`)))).then(rows => rows.map(rowFingerprintShape)));
  await writeJson(f, b);
  const sf = path.join(root, 'summary.json'), s = await readJson(sf); s.batches = [b]; await writeJson(sf, s);
}
const all = [n('a_ok'), n('b_man'), n('c_flag')];

test('部分人工改写保留未覆盖的退回名单，l4-approve 在名单未清时一律拒绝', async t => {
  const rejection = { by: '审查员', at: 't', reason: '不通顺', ids: ['b_man', 'c_flag'] };
  const root = await fixture(t, rejection);
  const batch = await readJson(path.join(root, 'batch-0.json'));
  assert.deepEqual(batch.l4.rejection, { ...rejection, ids: ['c_flag'] }, 'b_man 已改写，c_flag 仍待处理，reason 等原样保留');
  assert.equal(batch.l4.approved, false);
  assert.deepEqual(batch.l4History.at(-1).rejection, rejection);
  const before = await snapshot(root);
  assert.throws(() => approveL4({ root, batch: 0, notes: all, by: 'Bob', approve: true, now: at }), /仍有被 L4 退回未处理的条目：c_flag/);
  assert.deepEqual(await snapshot(root), before);
});

test('--approve 门槛：指纹、manual/pending、hard 矛盾、needsSystemicRepair 任一不满足即拒绝零写盘', async t => {
  const tryApprove = root => () => approveL4({ root, batch: 0, notes: all, by: 'Bob', approve: true, now: at });
  // 指纹
  let root = await fixture(t), file = path.join(root, 'a_ok.json'), rec = await readJson(file);
  rec.draft.description = '偷改后的正文正文'; await writeJson(file, rec);
  let before = await snapshot(root);
  assert.throws(tryApprove(root), /批次指纹与条目内容不一致/); assert.deepEqual(await snapshot(root), before);
  // hard 矛盾
  root = await fixture(t); file = path.join(root, 'a_ok.json'); rec = await readJson(file);
  rec.review = { contradictions: [{ quote: 'q', field: 'f', severity: 'hard', reason: 'r' }] }; await writeJson(file, rec); await refresh(root);
  before = await snapshot(root);
  assert.throws(tryApprove(root), /未通过或有 hard 矛盾的条目：a_ok/); assert.deepEqual(await snapshot(root), before);
  // 条目非 passed
  root = await fixture(t); file = path.join(root, 'c_flag.json'); rec = await readJson(file);
  rec.status = 'manual'; await writeJson(file, rec); await refresh(root);
  assert.throws(tryApprove(root), /未通过或有 hard 矛盾的条目：c_flag/);
  // 批次登记仍有 manual / pending
  root = await fixture(t); let bf = path.join(root, 'batch-0.json'), b = await readJson(bf);
  b.pending = ['c_flag']; await writeJson(bf, b); await refresh(root);
  assert.throws(tryApprove(root), /仍有 manual\/pending/);
  // needsSystemicRepair
  root = await fixture(t); bf = path.join(root, 'batch-0.json'); b = await readJson(bf);
  b.needsSystemicRepair = true; await writeJson(bf, b); await refresh(root);
  before = await snapshot(root);
  assert.throws(tryApprove(root), /系统性修复/); assert.deepEqual(await snapshot(root), before);
});

test('requireFlagValue：开关缺失、没有下一个参数、下一个以 -- 开头都报错；中文名可取', () => {
  assert.equal(requireFlagValue(['--by', '审查员乙'], '--by'), '审查员乙');
  assert.throws(() => requireFlagValue(['--root', 'x'], '--by'), /--by 缺值/);
  assert.throws(() => requireFlagValue(['--by'], '--by'), /--by 缺值/);
  assert.throws(() => requireFlagValue(['--by', '--approve'], '--by'), /--by 缺值/);
  assert.throws(() => requireFlagValue(['--by', ' '], '--by'), /--by 缺值/);
});

// ── 按比例抽读与全读门槛（RCFIX）──
import { l4SampleSize, l4SampleRejectionRate, l4RequiresFullRead } from '../tools/content-pipeline.mjs';

test('L4 抽读条数：不少于 25%（向上取整）且不少于 5，不超过本批通过数', () => {
  assert.equal(l4SampleSize(40), 10);
  assert.equal(l4SampleSize(37), 10, '37 的 25% = 9.25，向上取整 10');
  assert.equal(l4SampleSize(34), 9, '34 的 25% = 8.5，向上取整 9');
  assert.equal(l4SampleSize(20), 5);
  assert.equal(l4SampleSize(21), 6, '21 的 25% = 5.25，向上取整 6');
  assert.equal(l4SampleSize(12), 5, '不足时取下限 5');
  assert.equal(l4SampleSize(3), 3, '不超过通过数');
  assert.equal(l4SampleSize(0), 0);
});

test('抽读不过率：退回名单（历次加当前）落在 sample 内的比例，严格大于 10% 才要求全读', () => {
  const sample = Array.from({ length: 10 }, (_, i) => `s${i}`);
  const rej = ids => ({ approved: false, rejection: { by: 'x', at: 't', reason: 'r', ids }, notes: [] });
  assert.equal(l4SampleRejectionRate({ sample, l4: { approved: false, notes: [] } }), 0);
  assert.equal(l4SampleRejectionRate({ sample, l4History: [rej(['s0'])], l4: { approved: false, notes: [] } }), 0.1);
  assert.equal(l4RequiresFullRead({ sample, l4History: [rej(['s0'])], l4: { approved: false, notes: [] } }), false, '10% 整不算超过');
  assert.equal(l4RequiresFullRead({ sample, l4History: [rej(['s0'])], l4: rej(['s1']) }), true, '历次与当前合计 20%');
  assert.equal(l4RequiresFullRead({ sample, l4: rej(['zz', 'yy', 'xx']) }), false, '退回的是 sample 之外的条目，不算抽读不过');
  assert.equal(l4RequiresFullRead({ sample, fullRead: true, l4: { approved: false, notes: [] } }), true, '批次已标全读');
  assert.equal(l4RequiresFullRead({ sample: [], l4: rej(['a']) }), false, 'sample 为空不除零');
});

async function plainBatch(t, { sample, l4History, fullRead }) {
  const root = await fs.mkdtemp(path.join(tmpRoot(), 'l4-full-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const ids = ['p1', 'p2', 'p3', 'p4'];
  const rows = ids.map(id => ({ id, fingerprint: hashContent({ entry: { id }, context: null, revision: 'v2' }), status: 'passed', attempts: 1, draft: { id, description: '正文' }, review: { contradictions: [] }, errors: [], warnings: [] }));
  for (const row of rows) await writeJson(path.join(root, `${row.id}.json`), row);
  const batch = { index: 0, fingerprint: hashContent(rows.map(rowFingerprintShape)), count: 4, passed: 4, ids, manual: [], pending: [], flagged: [], sample, ...(fullRead ? { fullRead: true } : {}), l4: { approved: false, notes: [] }, ...(l4History ? { l4History } : {}) };
  await writeJson(path.join(root, 'batch-0.json'), batch);
  await writeJson(path.join(root, 'summary.json'), { total: 4, passed: 4, manual: 0, pending: 0, batches: [batch] });
  return root;
}
const rejected = ids => [{ approved: false, rejection: { by: '审查员', at: 't', reason: '不通顺', ids }, notes: [] }];

test('抽读不过率超过一成：只有抽样阅读记录的批准被拒绝（零写盘），全读后可批准', async t => {
  const root = await plainBatch(t, { sample: ['p1', 'p2'], l4History: rejected(['p1']) }), before = await snapshot(root);
  assert.throws(() => approveL4({ root, batch: 0, notes: [n('p1'), n('p2')], by: 'Bob', approve: true, now: at }), /抽读不过率50%.*全读.*p3,p4/);
  assert.deepEqual(await snapshot(root), before);
  const l4 = approveL4({ root, batch: 0, notes: [n('p1'), n('p2'), n('p3'), n('p4')], by: 'Bob', approve: true, now: at });
  assert.equal(l4.approved, true);
});

test('批次带 fullRead 标记同样要求全读；退回落在 sample 之外、没有标记时，抽样记录即可批准', async t => {
  const marked = await plainBatch(t, { sample: ['p1'], fullRead: true });
  assert.throws(() => approveL4({ root: marked, batch: 0, notes: [n('p1')], by: 'Bob', approve: true, now: at }), /须逐条全读.*p2,p3,p4/);
  const outside = await plainBatch(t, { sample: ['p1', 'p2'], l4History: rejected(['p4']) });
  assert.equal(approveL4({ root: outside, batch: 0, notes: [n('p1'), n('p2')], by: 'Bob', approve: true, now: at }).approved, true);
});
