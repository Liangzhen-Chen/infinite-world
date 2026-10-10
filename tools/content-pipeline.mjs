import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomInt } from 'node:crypto';

export const hashContent = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function parseModelJSON(response) {
  const message = response.choices?.[0]?.message;
  const raw = message?.tool_calls?.[0]?.function?.arguments ?? message?.content;
  if (typeof raw !== 'string') throw new Error('模型没有返回 JSON 正文');
  return JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, ''));
}
export function defaultReviewRequest(entry, draft, context) {
  return {
    thinking: { type: 'disabled' }, temperature: 0, max_tokens: 1800,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: '你是游戏内容事实审查员。逐句核对说明与骨架及引用事实，只返回 JSON {"contradictions":[{"quote":"说明原句","field":"骨架字段路径","severity":"hard|soft|style","reason":"具体原因"}]}。hard 表示数值、材料、用途、能力、食性、归属、时间、取得途径等与骨架相反或新增没有依据的功能。正常且相容的感官细节不是新增功能。不推测骨架没有声明的规则。不因没有重述全部骨架字段报错。无矛盾则空数组。' },
      { role: 'user', content: JSON.stringify({ skeleton: entry, publishedFacts: context ?? null, draft }) },
    ],
  };
}
function reviewIssues(review) {
  if (!review || !Array.isArray(review.contradictions)) throw new Error('事实审查缺少 contradictions 数组');
  for (const row of review.contradictions) {
    if (!['hard', 'soft', 'style'].includes(row.severity) || !['quote', 'field', 'reason'].every(key => typeof row[key] === 'string' && row[key].trim())) {
      throw new Error('事实审查的原句、字段、严重度或原因无效');
    }
  }
  return review.contradictions;
}
async function readJSON(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function writeJSON(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, `${JSON.stringify(data, null, 2)}\n`);
  await fs.rename(temp, file);
}
function randomSample(rows, count) {
  const pool = [...rows];
  for (let i = pool.length - 1; i > 0; i--) { const j = randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, count);
}

// Entries contain hand-authored mechanics. Request builders supply category
// prompts; this runner owns bounded rewrites, factual review, costs and resume.
// status "passed" means L1+L2 only. Publication must additionally approve L4.
export async function runContentPipeline({
  entries, root, client, buildDraftRequest, extractDraft = parseModelJSON,
  validateDraft, contextFor = () => null, buildReviewRequest = defaultReviewRequest,
  extractReview = parseModelJSON, concurrency = 8, batchSize = 40,
  revision = 'v2', retryManual = false, onBatch = null,
}) {
  if (!Array.isArray(entries) || new Set(entries.map(row => row.id)).size !== entries.length) throw new Error('条目编号重复或缺失');
  if (entries.some(row => !/^[a-z][a-z0-9_-]+$/i.test(row.id ?? ''))) throw new Error('条目编号不安全');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) throw new Error('并发必须为 1–16；正式波次使用 8–16');
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) throw new Error('批次必须为 1–50；正式波次使用 25–50');
  if (typeof validateDraft !== 'function' || typeof buildDraftRequest !== 'function') throw new Error('缺少起草或 L1 校验接口');
  await fs.mkdir(root, { recursive: true });
  const ledgerPath = path.join(root, 'budget.json');
  const ledger = await readJSON(ledgerPath) ?? { spentYuan: 0 };
  client.spent = Math.max(client.spent ?? 0, ledger.spentYuan);
  const results = [], batches = [];
  let budgetWrites = Promise.resolve();
  const saveBudget = () => {
    budgetWrites = budgetWrites.then(() => writeJSON(ledgerPath, { spentYuan: client.spent, limitYuan: client.budgetYuan }));
    return budgetWrites;
  };
  async function request(body, label) {
    try { return await client.generate(body, label); } finally { await saveBudget(); }
  }
  async function one(entry) {
    const context = await contextFor(entry);
    const fingerprint = hashContent({ entry, context, revision });
    const file = path.join(root, `${entry.id}.json`);
    let record = await readJSON(file);
    if (record?.fingerprint === fingerprint && (record.status === 'passed' || record.status === 'manual' && !retryManual)) return record;
    let feedback = record?.fingerprint === fingerprint ? record.feedback : null;
    const priorAttempts = record?.fingerprint === fingerprint ? record.attempts ?? 0 : 0;
    record = { id: entry.id, fingerprint, status: 'pending', attempts: priorAttempts, draft: null, review: null, errors: [], warnings: [], feedback };
    for (let attempt = priorAttempts; attempt < 3; attempt++) {
      record.attempts = attempt + 1;
      try {
        const response = await request(await buildDraftRequest(entry, feedback, context), `content-${path.basename(root)}-${entry.id}-draft${attempt}`);
        record.draft = await extractDraft(response, entry);
        const validation = await validateDraft(record.draft, entry, context);
        record.errors = Array.isArray(validation) ? validation : validation.errors ?? [];
        record.warnings = Array.isArray(validation) ? [] : validation.warnings ?? [];
        // L2 covers every syntactically usable draft, even if L1 found errors.
        const reviewResponse = await request(await buildReviewRequest(entry, record.draft, context), `content-${path.basename(root)}-${entry.id}-review${attempt}`);
        record.review = await extractReview(reviewResponse, entry);
        const issues = reviewIssues(record.review);
        record.errors.push(...issues.filter(row => row.severity === 'hard'));
        record.warnings.push(...issues.filter(row => row.severity !== 'hard'));
        if (!record.errors.length) { record.status = 'passed'; record.feedback = null; break; }
        feedback = record.errors;
      } catch (error) {
        feedback = [String(error.message)]; record.errors = feedback;
        // Transport and budget failures are resumable, not a consumed rewrite.
        if (/费用上限|环境变量|fetch failed|timeout|timed out|HTTP (429|5\d\d)/i.test(error.message)) {
          record.attempts = attempt; record.status = 'pending'; record.feedback = feedback;
          await writeJSON(file, record); return record;
        }
      }
      record.feedback = feedback;
      await writeJSON(file, record);
    }
    if (record.status !== 'passed') record.status = 'manual';
    await writeJSON(file, record);
    return record;
  }
  for (let start = 0; start < entries.length; start += batchSize) {
    const slice = entries.slice(start, start + batchSize), rows = new Array(slice.length);
    let cursor = 0;
    await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, async () => {
      for (;;) { const index = cursor++; if (index >= slice.length) return; rows[index] = await one(slice[index]); }
    }));
    results.push(...rows);
    const index = batches.length, file = path.join(root, `batch-${index}.json`);
    const prior = await readJSON(file), fingerprint = hashContent(rows.map(row => ({ id: row.id, draft: row.draft, review: row.review, status: row.status })));
    const passed = rows.filter(row => row.status === 'passed');
    const batch = {
      index, fingerprint, count: rows.length, passed: passed.length,
      ids: rows.map(row => row.id),
      rewritten: rows.filter(row => row.attempts > 1).length,
      manual: rows.filter(row => row.status === 'manual').map(row => row.id),
      pending: rows.filter(row => row.status === 'pending').map(row => row.id),
      flagged: rows.filter(row => row.warnings.length).map(row => row.id),
      sample: prior?.fingerprint === fingerprint ? prior.sample : randomSample(passed, 5).map(row => row.id),
      l4: prior?.fingerprint === fingerprint ? prior.l4 : { approved: false, notes: [] },
      costUpperYuan: client.spent,
    };
    batch.manualRatio = batch.manual.length / batch.count;
    batch.needsSystemicRepair = batch.manualRatio > 0.1;
    batches.push(batch); await writeJSON(file, batch);
    if (onBatch) await onBatch(batch, rows);
  }
  const summary = { total: entries.length, passed: results.filter(row => row.status === 'passed').length, manual: results.filter(row => row.status === 'manual').length, pending: results.filter(row => row.status === 'pending').length, costUpperYuan: client.spent, batches, scope: 'L1/L2 审核结果；尚须 L4 抽读与发布校验' };
  await writeJSON(path.join(root, 'summary.json'), summary);
  return { results, summary };
}

export async function readApprovedContent(root, entries, { contextFor = () => null, revision = 'v2' } = {}) {
  const summary = await readJSON(path.join(root, 'summary.json'));
  if (!summary) throw new Error('缺少流水线摘要');
  const allowed = new Set();
  for (const batch of summary.batches) {
    const current = await readJSON(path.join(root, `batch-${batch.index}.json`));
    if (!current?.l4?.approved || current.fingerprint !== batch.fingerprint || current.needsSystemicRepair) throw new Error(`批 ${batch.index} 尚未完成 L4 或人工队列超过 10%`);
    if (!Array.isArray(current.ids)) throw new Error('批次缺少条目清单');
    const rows = await Promise.all(current.ids.map(id => readJSON(path.join(root, `${id}.json`))));
    if (rows.some(row => !row) || hashContent(rows.map(row => ({ id: row.id, draft: row.draft, review: row.review, status: row.status }))) !== current.fingerprint) throw new Error(`批 ${batch.index} 审查后内容已改变`);
    for (const id of [...current.sample, ...current.flagged]) {
      if (!current.l4.notes?.some(row => row.id === id && typeof row.note === 'string' && row.note.trim())) throw new Error(`缺少 L4 阅读记录 ${id}`);
    }
  }
  const out = [];
  for (const entry of entries) {
    const record = await readJSON(path.join(root, `${entry.id}.json`));
    if (record?.status === 'passed') {
      if (record.fingerprint !== hashContent({ entry, context: await contextFor(entry), revision })) throw new Error(`发布骨架或引用事实已改变 ${entry.id}`);
      if (record.errors.length || reviewIssues(record.review).some(row => row.severity === 'hard')) throw new Error(`条目事实审查未通过 ${entry.id}`);
      if (!summary.batches.some(batch => batch.ids?.includes(entry.id))) throw new Error(`条目不在已审查批次 ${entry.id}`);
      if (allowed.has(entry.id)) throw new Error('发布编号重复'); allowed.add(entry.id); out.push(record.draft);
    }
  }
  return out;
}
