// 写命令（不调模型、不联网）：清除审核记录上的 budgetStop，使重跑时该条目不再直接返回。
// 用法：node tools/clear-budget-stop.mjs --root <审核记录目录> --id <条目id> [--id ...] --reason <原因文字>
// 只处理带 budgetStop 的记录：原 budgetStop 原样移入 record.budgetStopHistory[]，追加 {clearedAt, reason, headCommit}，再删除 budgetStop；其他字段不动。
// 该目录的 summary.json、batch-*.json 顶层若也存有 budgetStop，同样处理并在输出里列出；没有就不动它们。
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function moveStop(obj, reason, headCommit, clearedAt) {
  const { budgetStop } = obj;
  const history = Array.isArray(obj.budgetStopHistory) ? obj.budgetStopHistory : [];
  delete obj.budgetStop;
  obj.budgetStopHistory = [...history, { ...budgetStop, clearedAt, reason, headCommit }];
}
const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const write = (file, data) => { const tmp = `${file}.${process.pid}.tmp`; fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`); fs.renameSync(tmp, file); };

export function clearBudgetStop({ root, ids, reason, headCommit, now = () => new Date().toISOString() }) {
  if (typeof reason !== 'string' || !reason.trim()) throw new Error('--reason 不能为空');
  if (!root || !Array.isArray(ids) || !ids.length) throw new Error('需要 --root 和至少一个 --id');
  if (!/^[0-9a-f]{7,64}$/.test(headCommit ?? '')) throw new Error('无法取得 headCommit');
  const clearedAt = now(), plan = [];
  for (const id of ids) {
    if (!/^[a-z][a-z0-9_-]+$/i.test(id)) throw new Error(`条目编号不安全 ${id}`);
    const file = path.join(root, `${id}.json`);
    if (!fs.existsSync(file)) throw new Error(`没有记录 ${file}`);
    const record = read(file);
    if (!record.budgetStop) throw new Error(`记录 ${id} 不带 budgetStop，拒绝处理`);
    plan.push({ file, data: record, what: id });
  }
  for (const name of fs.readdirSync(root)) {
    if (name !== 'summary.json' && !/^batch-\d+\.json$/.test(name)) continue;
    const file = path.join(root, name), data = read(file);
    if (data && typeof data === 'object' && data.budgetStop) plan.push({ file, data, what: name });
  }
  for (const item of plan) moveStop(item.data, reason, headCommit, clearedAt);
  for (const item of plan) write(item.file, item.data);
  return plan.map(item => item.what);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), ids = [];
  let root, reason;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--root') root = args[++i];
    else if (args[i] === '--id') ids.push(args[++i]);
    else if (args[i] === '--reason') reason = args[++i];
    else throw new Error(`未知参数 ${args[i]}`);
  }
  const headCommit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: path.dirname(fileURLToPath(import.meta.url)), encoding: 'utf8' }).trim();
  console.log(JSON.stringify({ cleared: clearBudgetStop({ root, ids, reason, headCommit }) }));
}
