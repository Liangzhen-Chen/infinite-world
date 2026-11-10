// 写命令（不调模型、不联网）：通用 L4 阅读记录写入与批准。以前 w3 等批次的 L4 靠手改 batch-N.json。
// 用法：node tools/l4-approve.mjs --root <审核记录目录> --batch <index> --notes <JSON：[{id,note}]> --by <审查者> [--approve]
// 写入 batch-N.json 的 l4：{approved, reviewer, by, reviewedAt, notes:[{id,note,by}]}（reviewer/reviewedAt 与现有批次格式一致；退回意见 rejection 仅在未批准时保留）。
// 规则：by 必填；每条 note 记上 by；人工改写条目的 by 不能等于任何改写者（stampL4Notes/assertL4Reviewer）；只能写本批 ids 里的条目。
// --approve：sample、flagged 里每条、以及每个人工改写条目都必须已有阅读记录（本次或此前写入的），否则整体拒绝、零写盘。
// summary.json 里该批的副本同步更新（若存在）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stampL4Notes, MANUAL_REWRITE_REVIEW_KIND } from './content-pipeline.mjs';

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
    const manual = rows.filter(row => row.review?.kind === MANUAL_REWRITE_REVIEW_KIND || row.manualRewrite !== undefined).map(row => row.id);
    const missing = [...new Set([...(batch.sample ?? []), ...(batch.flagged ?? []), ...manual])].filter(id => !merged.some(n => n.id === id && typeof n.note === 'string' && n.note.trim()));
    if (missing.length) throw new Error(`批准前缺少阅读记录：${missing.join(',')}`);
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
  const args = process.argv.slice(2), opt = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--approve') opt.approve = true;
    else if (['--root', '--batch', '--notes', '--by'].includes(args[i])) opt[args[i].slice(2)] = args[++i];
    else throw new Error(`未知参数 ${args[i]}`);
  }
  if (!opt.notes) throw new Error('需要 --notes');
  const l4 = approveL4({ root: opt.root, batch: Number(opt.batch), notes: read(opt.notes), by: opt.by, approve: !!opt.approve });
  console.log(JSON.stringify({ approved: l4.approved, notes: l4.notes.length }));
}
