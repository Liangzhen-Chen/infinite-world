// 写命令（不调模型、不联网）：人工改写通路。把人工按骨架写的正文换进审核记录，留下可审计历史。
// 用法：node tools/manual-rewrite.mjs --profile <模块路径> [--kind <名>] --root <审核记录目录> --drafts <JSON：[{id, draft}]> --by <改写者> --reason <理由>
// 模块须导出 manualRewriteProfile(kind) → {entries, validateDraft, contextFor?}，即该流水线自己的 L1 校验与冻结骨架（如 tools/w3-journey.mjs）。
// 规则：只处理 status==='manual'，或在所属批次 l4.rejection.ids 里被点名退回的记录；任一条 L1 不过或不合格，整批拒绝且不写任何文件。
// 写入：旧 draft/review/status/attempts 原样进 record.manualRewrite[]；新 draft 置 status 'passed'，review 为 {kind:'manual-rewrite-no-l2'}（不是 L2 结果）。
// 所属批次文件与 summary.json 同步重算 fingerprint，l4 重置为未批准（旧 l4 进 l4History；退回名单里未被本次改写的条目仍保留在 l4.rejection），须由独立于改写者的审查者重做 L4 并逐条写阅读记录（note.by，由写 L4 的命令 --by 给出）。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pipelineL1, rowFingerprintShape, hashContent, requireFlagValue, MANUAL_REWRITE_REVIEW_KIND } from './content-pipeline.mjs';
import { applyDerivedDuration } from './content-numerals.mjs';
import { canonical } from '../server-plugin/storage.mjs';

const trimDeep = value => typeof value === 'string' ? value.trim() : Array.isArray(value) ? value.map(trimDeep) : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).map(([key, item]) => [key, trimDeep(item)])) : value;
export const sameContent = (a, b) => canonical(trimDeep(a)) === canonical(trimDeep(b));

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`); fs.renameSync(tmp, file); };

export async function manualRewrite({ root, drafts, by, reason, headCommit, entries, validateDraft, contextFor = () => null, now = () => new Date().toISOString() }) {
  if (typeof by !== 'string' || !by.trim()) throw new Error('--by 不能为空');
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('--reason 不能为空');
  if (!root || !Array.isArray(drafts) || !drafts.length) throw new Error('需要 --root 和非空的 drafts');
  if (!/^[0-9a-f]{7,64}$/.test(headCommit ?? '')) throw new Error('无法取得 headCommit');
  if (typeof validateDraft !== 'function' || !Array.isArray(entries)) throw new Error('缺少 L1 校验接口或冻结条目');
  const ids = drafts.map(row => row?.id);
  if (new Set(ids).size !== ids.length) throw new Error('drafts 里条目编号重复');
  const l1 = pipelineL1(validateDraft), at = now();
  const batchOf = new Map();
  for (const name of fs.readdirSync(root)) {
    if (!/^batch-\d+\.json$/.test(name)) continue;
    const file = path.join(root, name), batch = read(file);
    for (const id of batch.ids ?? []) batchOf.set(id, { file, batch, name });
  }
  const plans = [], failures = [];
  for (const { id, draft: rawDraft } of drafts) {
    if (!/^[a-z][a-z0-9_-]+$/i.test(id ?? '')) throw new Error(`条目编号不安全 ${id}`);
    const file = path.join(root, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`没有记录 ${file}`);
    const record = read(file), owner = batchOf.get(id);
    if (!owner) throw new Error(`条目不在任何批次 ${id}`);
    const rejected = owner.batch.l4?.rejection?.ids?.includes(id);
    if (record.status !== 'manual' && !rejected) throw new Error(`记录 ${id} 状态为 ${record.status}，既非 manual 也未被 L4 退回，拒绝改写`);
    const entry = entries.find(row => row.id === id);
    if (!entry) throw new Error(`条目 ${id} 不在冻结骨架中`);
    if (!rawDraft || typeof rawDraft !== 'object' || (rawDraft.id !== undefined && rawDraft.id !== id)) throw new Error(`人工稿 ${id} 不是对象或 id 不符`);
    // 写入的 draft.id 必须等于条目 id：缺 id 时补上，不一致的上一行已拒绝。
    const draft = applyDerivedDuration({ id, ...structuredClone(rawDraft) }, entry);
    // 人工稿不得与旧稿相同（含套上派生时长之后）：否则原样提交旧稿也能清掉退回名单并换到免 L2 标记。
    // 比较与键序、字符串首尾空白无关：用 server-plugin/storage.mjs 的 canonical（键排序序列化）加递归 trim。
    if (record.draft && [rawDraft, draft].some(candidate => sameContent({ id, ...candidate }, record.draft) || sameContent(candidate, record.draft))) throw new Error(`人工稿 ${id} 与旧稿相同，拒绝改写`);
    const result = await l1(draft, entry, await contextFor(entry));
    const errors = Array.isArray(result) ? result : result?.errors ?? [];
    if (errors.length) failures.push(`${id}: ${errors.join('；')}`);
    plans.push({ id, file, record, draft, warnings: Array.isArray(result) ? [] : result?.warnings ?? [], owner });
  }
  if (failures.length) throw new Error(`L1 未通过，整批拒绝：\n${failures.join('\n')}`);

  const byBatch = new Map();
  for (const plan of plans) {
    const { record } = plan;
    const history = Array.isArray(record.manualRewrite) ? record.manualRewrite : [];
    plan.next = {
      ...record,
      manualRewrite: [...history, { by, at, reason, headCommit, priorStatus: record.status, priorDraft: record.draft, priorReview: record.review, priorAttempts: record.attempts }],
      draft: plan.draft,
      review: { kind: MANUAL_REWRITE_REVIEW_KIND, l2: 'not-run', by, at },
      status: 'passed', errors: [], warnings: plan.warnings, feedback: null,
    };
    delete plan.next.budgetStop;
    if (!byBatch.has(plan.owner.file)) byBatch.set(plan.owner.file, { owner: plan.owner, plans: [] });
    byBatch.get(plan.owner.file).plans.push(plan);
  }
  const writes = [], newBatches = [];
  for (const { owner, plans: group } of byBatch.values()) {
    const next = new Map(group.map(plan => [plan.id, plan.next]));
    const rows = owner.batch.ids.map(id => next.get(id) ?? read(path.join(root, `${id}.json`)));
    const batch = { ...owner.batch };
    batch.fingerprint = hashContent(rows.map(rowFingerprintShape));
    batch.passed = rows.filter(row => row.status === 'passed').length;
    batch.manual = rows.filter(row => row.status === 'manual').map(row => row.id);
    batch.pending = rows.filter(row => row.status === 'pending').map(row => row.id);
    batch.flagged = rows.filter(row => row.warnings?.length).map(row => row.id);
    batch.sample = (owner.batch.sample ?? []).filter(id => rows.find(row => row.id === id)?.status === 'passed');
    batch.manualRatio = batch.manual.length / batch.count;
    batch.needsSystemicRepair = batch.manualRatio > 0.1;
    batch.l4History = [...(owner.batch.l4History ?? []), ...(owner.batch.l4 ? [owner.batch.l4] : [])];
    // 重置 l4 时保留未被本次改写覆盖的退回名单（reason 等原样）：被退回而没改写的条目仍是待处理，不能因此被批准。
    const rejection = owner.batch.l4?.rejection, rewritten = new Set(group.map(plan => plan.id));
    const stillRejected = Array.isArray(rejection?.ids) ? rejection.ids.filter(id => !rewritten.has(id)) : [];
    batch.l4 = { approved: false, notes: [], ...(stillRejected.length ? { rejection: { ...rejection, ids: stillRejected } } : {}) };
    newBatches.push(batch);
    writes.push({ file: owner.file, data: batch });
  }
  const summaryFile = path.join(root, 'summary.json');
  if (fs.existsSync(summaryFile)) {
    const summary = read(summaryFile);
    summary.batches = (summary.batches ?? []).map(old => newBatches.find(batch => batch.index === old.index) ?? old);
    summary.passed = summary.batches.reduce((n, batch) => n + batch.passed, 0);
    summary.manual = summary.batches.reduce((n, batch) => n + batch.manual.length, 0);
    summary.pending = summary.batches.reduce((n, batch) => n + batch.pending.length, 0);
    writes.push({ file: summaryFile, data: summary });
  }
  for (const plan of plans) writes.push({ file: plan.file, data: plan.next });
  for (const item of writes) write(item.file, item.data);
  return plans.map(plan => plan.id);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let root, draftsFile, by, reason, profile, kind;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') root = args[++i];
    else if (args[i] === '--drafts') draftsFile = args[++i];
    else if (args[i] === '--by') { by = requireFlagValue(args, '--by'); i++; }
    else if (args[i] === '--reason') reason = args[++i];
    else if (args[i] === '--profile') profile = args[++i];
    else if (args[i] === '--kind') kind = args[++i];
    else throw new Error(`未知参数 ${args[i]}`);
  }
  if (!profile || !draftsFile) throw new Error('需要 --profile 和 --drafts');
  const mod = await import(pathToFileURL(path.resolve(profile)).href);
  if (typeof mod.manualRewriteProfile !== 'function') throw new Error(`${profile} 未导出 manualRewriteProfile`);
  const config = await mod.manualRewriteProfile(kind);
  const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.dirname(fileURLToPath(import.meta.url)), encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ rewritten: await manualRewrite({ root, drafts: read(draftsFile), by, reason, headCommit, ...config }) }));
}
