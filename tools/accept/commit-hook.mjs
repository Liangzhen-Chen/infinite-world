// 提交钩子（卷十二 §2.11 门禁设施 commit-hook；李白 11-17 四-4 定名）：调执行器 accRun 跑提交关口，任一必过条目不过即拒（§1.3 第 4 条）。
// 本文件只是脚本；怎样挂进 Git（.git/hooks 或 core.hooksPath）由李白定，P-1 不安装。
// 用法：node tools/accept/commit-hook.mjs [--root 目录]；退出码 0 放行，1 拒绝。

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { accRun } from './run.mjs';
import { CARD_AGENT_ENV, CARD_SELFCHECK_CODE, CARD_RULES_DOC, reportPathOf, selfcheckQuestions, parseSelfcheck } from './lib/card-selfcheck.mjs';

// 卡头自查（卷十二 §2.12 E-ACC-CARD-SELFCHECK；李白 11-18 17:45）：派卡子代理（环境变量 DND_CARD_AGENT=1）的提交，
// 暂存区须带回报文件，回报第一张表按 docs/派活卡头规矩.md 第三节的八项自查表对照。主会话（无该环境变量）不查。
function gitOut(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] });
}

export function cardSelfcheck(root, env = process.env) {
  if (env[CARD_AGENT_ENV] !== '1') return { ok: true, code: null, reasons: [] };
  const fail = (reasons) => ({ ok: false, code: CARD_SELFCHECK_CODE, reasons });
  root = root || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  let branch;
  try { branch = gitOut(root, ['rev-parse', '--abbrev-ref', 'HEAD']).trim(); } catch { return fail(['取分支名失败（git rev-parse --abbrev-ref HEAD）']); }
  const rel = reportPathOf(branch);
  let staged;
  try { staged = gitOut(root, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean); } catch { return fail(['取暂存清单失败（git diff --cached）']); }
  if (!staged.includes(rel)) return fail([`暂存区没有回报文件 ${rel}`]);
  let content;
  try { content = gitOut(root, ['show', `:${rel}`]); } catch { return fail([`读暂存版本的回报失败（${rel}）`]); }
  let doc;
  try { doc = readFileSync(join(root, CARD_RULES_DOC), 'utf8'); } catch { return fail([`读不到 ${CARD_RULES_DOC}`]); }
  const questions = selfcheckQuestions(doc);
  if (!questions) return fail([`${CARD_RULES_DOC} 第三节的八项自查表解析不出`]);
  const parsed = parseSelfcheck(content, questions);
  return { ok: parsed.ok, code: parsed.ok ? null : CARD_SELFCHECK_CODE, reasons: parsed.reasons };
}

export async function commitHook(root, env = process.env) {
  const card = cardSelfcheck(root, env);
  if (!card.ok) return { verdict: 'fail', cardSelfcheck: card };
  const { report } = await accRun('pre_commit', 'commit', null, { root, runRequired: true });
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  const report = await commitHook(ri >= 0 ? args[ri + 1] : undefined);
  if (report.cardSelfcheck) {
    process.stderr.write(`${report.cardSelfcheck.code} ${report.cardSelfcheck.reasons.join('；')}\n`);
    process.stderr.write('pre_commit rejected\n');
    process.exit(1);
  }
  if (report.verdict !== 'pass') {
    process.stderr.write('pre_commit rejected\n');
    for (const f of report.items.failed) process.stderr.write(`  ${f.itemKey} ${f.codes.join(' ')}${f.cases ? ' ' + f.cases.join(' ') : ''}\n`);
    process.exit(1);
  }
  process.stdout.write(`pre_commit pass ${report.contentPrint}\n`);
}
