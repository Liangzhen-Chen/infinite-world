// 提交钩子（卷十二 §2.11 门禁设施 commit-hook；李白 11-17 四-4 定名）：调执行器 accRun 跑提交关口，任一必过条目不过即拒（§1.3 第 4 条）。
// 本文件只是脚本；怎样挂进 Git（.git/hooks 或 core.hooksPath）由李白定，P-1 不安装。
// 用法：node tools/accept/commit-hook.mjs [--root 目录]；退出码 0 放行，1 拒绝。

import { fileURLToPath } from 'node:url';
import { accRun } from './run.mjs';

export async function commitHook(root) {
  const { report } = await accRun('pre_commit', 'commit', null, { root, runRequired: true });
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const report = await commitHook(ri >= 0 ? args[ri + 1] : undefined);
  if (report.verdict !== 'pass') {
    process.stderr.write('pre_commit rejected\n');
    for (const f of report.items.failed) process.stderr.write(`  ${f.itemKey} ${f.codes.join(' ')}${f.cases ? ' ' + f.cases.join(' ') : ''}\n`);
    process.exit(1);
  }
  process.stdout.write(`pre_commit pass ${report.contentPrint}\n`);
}
