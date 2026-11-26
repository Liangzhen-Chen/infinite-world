// 合并门禁（第三层，亮圳 11-22「多层门禁1122」；规矩第五节）：.githooks/pre-push 调本文件。
// 推往规矩里写的推送目标（master）时，对本次要推的每个新提交：重跑卡档案与自我反思检查（含三方分离、角色标记），
// 再重跑 pre_commit。拦住提交时用了 --no-verify 的提交。
// 用法：node tools/accept/pre-push.mjs [--root 目录]，stdin 是 git 给 pre-push 的行：<本地ref> <本地sha> <远端ref> <远端sha>。

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { gitOut, gitOk, gitRepo, preCommitGate } from './commit-hook.mjs';
import { CARD_ARCHIVE_CODE, CARD_RULES_DOC, loadRules, judgeCommit } from './lib/card-archive.mjs';

const ZERO = /^0+$/;

// 规矩取远端当前版本（防止提交自己改弱规矩来过关）；远端还没有第五节（本机制刚上线）时用本地版本。
function rulesFor(root, remoteSha) {
  if (remoteSha && !ZERO.test(remoteSha)) {
    try {
      const remote = loadRules(gitOut(root, ['show', `${remoteSha}:${CARD_RULES_DOC}`]));
      if (!remote.error) return remote;
    } catch { /* 远端没有该文件，用本地 */ }
  }
  return loadRules(readFileSync(join(root, CARD_RULES_DOC), 'utf8'));
}

// 返回 { ok, reasons }；runGate 默认真跑 pre_commit（测试可传替身，拒推用例不依赖它）。
/**
 * @param {string} root
 * @param {string} stdinText
 * @param {{runGate?: (root: string) => Promise<{verdict: string, items?: {failed: {itemKey: string, codes: string[]}[]}}>, headBranch?: string}} [options]
 */
export async function prePush(root, stdinText, { runGate = preCommitGate, headBranch } = {}) {
  root = root || join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const reasons = [];
  let touched = false;
  for (const line of stdinText.split(/\r?\n/).filter(Boolean)) {
    const [, localSha, remoteRef, remoteSha] = line.trim().split(/\s+/);
    if (!localSha || ZERO.test(localSha)) continue; // 删除分支
    let loaded;
    try { loaded = rulesFor(root, remoteSha); } catch { return { ok: false, reasons: [`${CARD_ARCHIVE_CODE} 读不到 ${CARD_RULES_DOC}`] }; }
    if (loaded.error) return { ok: false, reasons: [`${CARD_ARCHIVE_CODE} ${loaded.error}`] };
    const { rules } = loaded;
    if (remoteRef !== rules.pushTarget) continue;
    touched = true;
    const range = ZERO.test(remoteSha || '0') ? [localSha, '--not', '--remotes'] : [`${remoteSha}..${localSha}`];
    let shas;
    try { shas = gitOut(root, ['rev-list', '--reverse', ...range]).split('\n').filter(Boolean); } catch { return { ok: false, reasons: [`${CARD_ARCHIVE_CODE} 取待推提交失败（git rev-list ${range.join(' ')}）`] }; }
    // 门禁生效线：规矩里登记的「门禁生效提交」及其祖先不查（门禁立起来之前就写好的提交，不改写历史）；解析不出该提交时不跳过任何提交。
    let effective = null;
    if (rules.effectiveCommit) { try { effective = gitOut(root, ['rev-parse', '--verify', '-q', `${rules.effectiveCommit}^{commit}`]).trim() || null; } catch { effective = null; } }
    // 每个提交的改动文件集：合并提交对第一父提交求差（这次合并给目标分支带进来什么；不用 -m，免得把目标分支那一侧也算进来），其余照常。
    const commits = shas.map((sha) => {
      const parents = gitOut(root, ['rev-list', '--parents', '-n', '1', sha]).trim().split(/\s+/).length - 1;
      const diff = parents > 1 ? ['diff-tree', '--no-commit-id', '--name-only', '-r', '-z', `${sha}^1`, sha] : ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', '-z', sha];
      return { sha, parents, files: gitOut(root, diff).split('\0').filter(Boolean) };
    });
    // 本次推送范围的改动文件（借档核对）与推送头的提交历史（orca 凭证核对）。
    const rangeFiles = [...new Set(commits.flatMap((c) => c.files))];
    const history = {
      reachable: (s) => gitOk(root, ['merge-base', '--is-ancestor', s, localSha]),
      message: (s) => { try { return gitOut(root, ['log', '-1', '--format=%B', s]); } catch { return null; } },
    };
    for (const { sha, parents, files } of commits) {
      if (effective && gitOk(root, ['merge-base', '--is-ancestor', sha, effective])) continue;
      const message = gitOut(root, ['log', '-1', '--format=%B', sha]);
      const r = judgeCommit(rules, {
        files,
        branch: null,
        message,
        isMerge: parents > 1,
        stage: '推送',
        rangeFiles,
        headBranch: headBranch || undefined,
        history,
        repo: gitRepo(root, localSha),
        // 档案读本次推送的最新版（卡常分多次提交，审查、出题晚到）：每个触发提交都要对得上推送后的档案。
        readFile: (dir, f) => { try { return gitOut(root, ['show', `${localSha}:${dir}${f}`]); } catch { return null; } },
      });
      for (const x of r) reasons.push(`${CARD_ARCHIVE_CODE} ${sha.slice(0, 9)} ${x}`);
    }
  }
  if (reasons.length) return { ok: false, reasons };
  if (touched) {
    const report = await runGate(root);
    if (report.verdict !== 'pass') {
      return { ok: false, reasons: ['pre_commit 重跑未通过：' + (report.items ? report.items.failed.map((f) => `${f.itemKey} ${f.codes.join(' ')}`).join('；') : report.verdict)] };
    }
  }
  return { ok: true, reasons: [] };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const ri = args.indexOf('--root');
  let stdin = '';
  try { stdin = readFileSync(0, 'utf8'); } catch { /* 无输入 */ }
  // CI 传入 PR 头分支（直推卡分支时为分支名；推往 master 时不传），用于借档核对。
  const r = await prePush(ri >= 0 ? args[ri + 1] : undefined, stdin, { headBranch: process.env.CARD_HEAD_BRANCH || undefined });
  if (!r.ok) {
    for (const x of r.reasons) process.stderr.write(`${x}\n`);
    process.stderr.write('pre_push rejected\n');
    process.exit(1);
  }
  process.stdout.write('pre_push pass\n');
}
