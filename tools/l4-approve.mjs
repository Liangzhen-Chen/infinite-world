// 写命令（不调模型、不联网）：通用 L4 阅读记录写入与批准。以前 w3 等批次的 L4 靠手改 batch-N.json。
// 用法：node tools/l4-approve.mjs --root <审核记录目录> --batch <index> --notes <JSON：[{id,note}]> --by <审查者> [--approve]
// 写入 batch-N.json 的 l4：{approved, reviewer, by, reviewedAt, notes:[{id,note,by}]}（reviewer/reviewedAt 与现有批次格式一致；退回意见 rejection 仅在未批准时保留）。
// 规则：by 必填；每条 note 记上 by；人工改写条目的 by 不能等于任何改写者（stampL4Notes/assertL4Reviewer）；只能写本批 ids 里的条目。
// --approve：sample、flagged 里每条、以及每个人工改写条目都必须已有阅读记录（本次或此前写入的），否则整体拒绝、零写盘。
// 抽读不过率（退回名单落在 sample 内的比例）超过 10%，或批次带 fullRead 标记：本批每一条都必须有阅读记录，只有抽样记录的批准拒绝。
// summary.json 里该批的副本同步更新（若存在）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampL4Notes, requireFlagValue, reviewIssues, hashContent, rowFingerprintShape, MANUAL_REWRITE_REVIEW_KIND, l4RequiresFullRead, l4SampleRejectionRate } from './content-pipeline.mjs';

const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`); fs.renameSync(tmp, file); };

export function approveL4({ root, batch: index, notes, by, approve = false, now = () => new Date().toISOString() }) {
  if (!root || !Number.isInteger(index) || index < 0) throw new Error('需要 --root 和整数 --batch');
  if (!Array.isArray(notes) || !notes.length) throw new Error('--notes 须为非空数组');
  const file = path.join(root, `batch-${index}.json`);
  if (!fs.existsSync(file)) throw new Error(`没有批次文件 ${file}`);
  const batch = read(file), ids = batch.ids ?? [];
  const bad = notes.filter(n => !ids.includes(n?.id) || typeof n.note !== 'string' || !n.note.trim());
  if (bad.length) throw new Error(`阅读记录的条目不在本批或缺 note：${bad.map(n => n?.id).join(',')}`);
  if (new Set(notes.map(n => n.id)).size !== notes.length) throw new Error('阅读记录里条目编号重复');
  const rows = ids.map(id => read(path.join(root, `${id}.json`)));
  const stamped = stampL4Notes(notes.map(({ id, note }) => ({ id, note })), by, rows);
  const merged = [...(batch.l4?.notes ?? []).filter(old => !stamped.some(n => n.id === old.id)), ...stamped];
  if (approve) {
    // 门槛与 npc-depth-l4 / w1-villages-l4 一致：退回名单清空、指纹一致、全部 passed、无 hard、无需系统性修复。
    if (batch.l4?.rejection?.ids?.length) throw new Error(`批次仍有被 L4 退回未处理的条目：${batch.l4.rejection.ids.join(',')}`);
    if (hashContent(rows.map(rowFingerprintShape)) !== batch.fingerprint) throw new Error('批次指纹与条目内容不一致');
    const summaryRow = fs.existsSync(path.join(root, 'summary.json')) ? read(path.join(root, 'summary.json')).batches?.find(b => b.index === index) : null;
    if (summaryRow && summaryRow.fingerprint !== batch.fingerprint) throw new Error('批次指纹与 summary.json 不一致');
    if (batch.needsSystemicRepair) throw new Error('批次需要系统性修复（人工队列超过 10%）');
    if ((batch.manual ?? []).length || (batch.pending ?? []).length) throw new Error('批次仍有 manual/pending 条目');
    const notPassed = rows.filter(row => row.status !== 'passed' || row.errors?.length || reviewIssues(row.review).some(issue => issue.severity === 'hard')).map(row => row.id);
    if (notPassed.length) throw new Error(`存在未通过或有 hard 矛盾的条目：${notPassed.join(',')}`);
    const manual = rows.filter(row => row.review?.kind === MANUAL_REWRITE_REVIEW_KIND || row.manualRewrite !== undefined).map(row => row.id);
    const missing = [...new Set([...(batch.sample ?? []), ...(batch.flagged ?? []), ...manual])].filter(id => !merged.some(n => n.id === id && typeof n.note === 'string' && n.note.trim()));
    if (missing.length) throw new Error(`批准前缺少阅读记录：${missing.join(',')}`);
    // 抽读不过率超过一成（或批次已标 fullRead）：本批每一条都要有阅读记录，只有抽样阅读记录的批准一律拒绝。
    if (l4RequiresFullRead(batch)) {
      const unread = ids.filter(id => !merged.some(n => n.id === id && typeof n.note === 'string' && n.note.trim()));
      if (unread.length) throw new Error(`抽读不过率${(l4SampleRejectionRate(batch) * 100).toFixed(0)}%（超过10%）或批次标记全读：本批须逐条全读，缺少阅读记录：${unread.join(',')}`);
    }
  }
  const next = { ...batch, l4: { ...(approve || !batch.l4?.rejection ? {} : { rejection: batch.l4.rejection }), approved: approve, reviewer: String(by).trim(), by: String(by).trim(), reviewedAt: now(), notes: merged } };
  const summaryFile = path.join(root, 'summary.json');
  const summary = fs.existsSync(summaryFile) ? read(summaryFile) : null;
  if (summary?.batches?.some(b => b.index === index)) summary.batches = summary.batches.map(b => b.index === index ? { ...b, l4: next.l4 } : b);
  write(file, next);
  if (summary) write(summaryFile, summary);
  return next.l4;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), valued = ['--root', '--batch', '--notes', '--by'];
  for (let i = 0; i < args.length; i++) {
    if (valued.includes(args[i])) { requireFlagValue(args, args[i]); i++; }
    else if (args[i] !== '--approve') throw new Error(`未知参数 ${args[i]}`);
  }
  const l4 = approveL4({ root: requireFlagValue(args, '--root'), batch: Number(requireFlagValue(args, '--batch')), notes: read(requireFlagValue(args, '--notes')), by: requireFlagValue(args, '--by'), approve: args.includes('--approve') });
  console.log(JSON.stringify({ approved: l4.approved, notes: l4.notes.length }));
}
