// 提交钩子（卷十二 §2.11 门禁设施 commit-hook；李白 11-17 四-4 定名）：调执行器 accRun 跑提交关口，任一必过条目不过即拒（§1.3 第 4 条）。
// 本文件只是脚本；怎样挂进 Git（.git/hooks 或 core.hooksPath）由李白定，P-1 不安装。
// 用法：node tools/accept/commit-hook.mjs [--root 目录]；退出码 0 放行，1 拒绝。

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { accRun } from './run.mjs';
import { CARD_RULES_DOC } from './lib/card-selfcheck.mjs';
import { CARD_ARCHIVE_CODE, loadRules, judgeCommit } from './lib/card-archive.mjs';

// 卡档案与自我反思检查（卡头第二节第 11 条、第五节；亮圳 11-22「留档反思1122」）：并入原卡头自查（E-ACC-CARD-SELFCHECK 九项表现在是 反思.md 的开头）。
// 暂存区改了触发目录的文件，就要求卡档案目录（暂存版本）合格。pre-commit 阶段拿不到提交说明，所以这项检查挂在 commit-msg 钩子（git 把说明文件路径传进来）：
// 有说明时按说明里的「卡分支：」行找档案目录、「角色：合并」走合并口径、核角色标识与绕过标记；message 为 null（没有说明可读）时才退回当前分支名。
export function gitOut(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
}
export const gitOk = (root, args) => { try { gitOut(root, args); return true; } catch { return false; } };

// 查「该提交的树」的入口，供引用核实用：treeish 为 null 读暂存区，否则读该提交。read 读不到返回 null；list 返回目录下文件名。
export function gitRepo(root, treeish) {
  const base = (p) => p.split('/').pop();
  return {
    read: (p) => { try { return gitOut(root, ['show', `${treeish || ''}:${p}`]); } catch { return null; } },
    list: (dir) => {
      try {
        const out = treeish ? gitOut(root, ['ls-tree', '--name-only', '-z', treeish, '--', dir]) : gitOut(root, ['ls-files', '-z', '--', dir]);
        return out.split('\0').filter(Boolean).map(base);
      } catch { return []; }
    },
  };
}

export function cardArchiveCheck(root, message = null) {
  root = root || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const fail = (reasons) => ({ ok: false, code: CARD_ARCHIVE_CODE, reasons });
  if (!gitOk(root, ['rev-parse', '--is-inside-work-tree'])) return { ok: true, code: null, reasons: [] };
  let doc;
  try { doc = readFileSync(join(root, CARD_RULES_DOC), 'utf8'); } catch { return fail([`读不到 ${CARD_RULES_DOC}`]); }
  const loaded = loadRules(doc);
  if (loaded.error) return fail([loaded.error]);
  let staged;
  try { staged = gitOut(root, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean); } catch { return fail(['取暂存清单失败（git diff --cached）']); }
  let branch;
  try { branch = gitOut(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { return fail(['取分支名失败（git rev-parse --abbrev-ref HEAD）']); }
  const reasons = judgeCommit(loaded.rules, loaded.questions, {
    files: staged,
    branch,
    message,
    isMerge: gitOk(root, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']),
    stage: '提交',
    repo: gitRepo(root, null),
    readFile: (dir, f) => { try { return gitOut(root, ['show', `:${dir}${f}`]); } catch { return null; } },
  });
  return { ok: reasons.length === 0, code: reasons.length ? CARD_ARCHIVE_CODE : null, reasons };
}

export async function preCommitGate(root) {
  const { report } = await accRun('pre_commit', 'commit', null, { root, runRequired: true });
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const root = ri >= 0 ? args[ri + 1] : undefined;
  const mi = args.indexOf('--msg-file');
  if (mi >= 0) {
    // commit-msg 钩子：只做卡档案检查，读提交说明文件（git 传的第一个参数）。
    let message;
    try { message = readFileSync(args[mi + 1], 'utf8'); } catch { process.stderr.write(`${CARD_ARCHIVE_CODE} 读不到提交说明文件 ${args[mi + 1]}\n`); process.stderr.write('commit_msg rejected\n'); process.exit(1); }
    const card = cardArchiveCheck(root, message);
    if (!card.ok) {
      process.stderr.write(`${card.code} ${card.reasons.join('；')}\n`);
      process.stderr.write('commit_msg rejected\n');
      process.exit(1);
    }
    process.stdout.write('commit_msg pass\n');
    process.exit(0);
  }
  const report = await preCommitGate(root);
  if (report.verdict !== 'pass') {
    process.stderr.write('pre_commit rejected\n');
    for (const f of report.items.failed) process.stderr.write(`  ${f.itemKey} ${f.codes.join(' ')}${f.cases ? ' ' + f.cases.join(' ') : ''}\n`);
    process.exit(1);
  }
  process.stdout.write(`pre_commit pass ${report.contentPrint}\n`);
}
