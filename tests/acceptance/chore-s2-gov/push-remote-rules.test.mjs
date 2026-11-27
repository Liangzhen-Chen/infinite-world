// 验收：卡 chore/s2-gov：推送检查读远端规矩。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：CLAUDE.md:28（合并提交不免查，推送检查照远端规矩核，分支自改不得放宽）；CLAUDE.md:8（规矩 ②）。
// 黑盒：临时仓库（testTempRoot）只含旧规矩或新旧并存的 origin/master 引用，子进程跑 tools/accept/check-push-archive.mjs，只看退出码与标准输出。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '6413e8a47';
const OLD_RULES = execFileSync('git', ['show', `${BASE}:docs/派活卡头规矩.md`], { cwd: ROOT, encoding: 'utf8' });
const made = [];
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' });
const put = (root, rel, text) => writeTempRepoFile(root, rel, text);

after(() => { for (const r of made) removeTempRoot(r); });

// 造临时仓库：工具目录原样复制；origin/master 指向只含 rulesFiles 的提交。
function makeRepo(rulesFiles) {
  const tmpRoot = testTempRoot('gov-push-');
  made.push(tmpRoot);
  git(tmpRoot, ['init', '-q', '-b', 'master']);
  cpSync(join(ROOT, 'tools'), join(tmpRoot, 'tools'), { recursive: true });
  cpSync(join(ROOT, 'server-plugin'), join(tmpRoot, 'server-plugin'), { recursive: true });
  for (const [rel, text] of Object.entries(rulesFiles)) put(tmpRoot, rel, text);
  put(tmpRoot, 'README.txt', 'base\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-q', '-m', 'base']);
  git(tmpRoot, ['update-ref', 'refs/remotes/origin/master', 'HEAD']);
  return tmpRoot;
}

// 分支 name：加一个触发目录下的文件（无卡档案）；extra 为分支上对规矩文件的改动。
function branchWithProbe(root, name, extra = (_r) => {}) {
  git(root, ['checkout', '-q', '-b', name]);
  put(root, 'server-plugin/probe.mjs', 'export const probe = 1;\n');
  extra(root);
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', `probe\n\n卡分支：${name}\n`]);
}

function pushCheck(root, branch) {
  const r = spawnSync(process.execPath, ['tools/accept/check-push-archive.mjs', root, branch], { cwd: root, encoding: 'utf8' });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

// 依据：CLAUDE.md:28；测的是什么：origin/master 只有旧规矩文件时，触发目录下无档案的分支被拒（与旧版判定相同）；测试位置：tests/acceptance/chore-s2-gov/push-remote-rules.test.mjs:52
test('远端只有旧文件：无档案的触发改动被拒', () => {
  const root = makeRepo({ 'docs/派活卡头规矩.md': OLD_RULES });
  branchWithProbe(root, 'feat/probe');
  const r = pushCheck(root, 'feat/probe');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /rejected/);
});

// 依据：CLAUDE.md:8；测的是什么：对照组——只改非触发文件的分支照常通过，证明检查器确实在跑；测试位置：tests/acceptance/chore-s2-gov/push-remote-rules.test.mjs:61
test('对照：只改非触发文件的分支通过', () => {
  const root = makeRepo({ 'docs/派活卡头规矩.md': OLD_RULES });
  git(root, ['checkout', '-q', '-b', 'feat/none']);
  put(root, 'README.txt', 'changed\n');
  git(root, ['commit', '-q', '-am', 'readme\n\n卡分支：feat/none\n']);
  const r = pushCheck(root, 'feat/none');
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /pass/);
});

// 依据：CLAUDE.md:28；测的是什么：分支把旧规矩里的触发目录行删掉（改宽），推送检查仍按远端版拒绝；测试位置：tests/acceptance/chore-s2-gov/push-remote-rules.test.mjs:72
test('远端只有旧文件：分支自改规矩放宽，仍按远端版拒绝', () => {
  const root = makeRepo({ 'docs/派活卡头规矩.md': OLD_RULES });
  branchWithProbe(root, 'feat/loose', (r) => {
    put(r, 'docs/派活卡头规矩.md', OLD_RULES.split('\n').filter((l) => l.trim() !== '- 触发目录：server-plugin/').join('\n'));
  });
  const r = pushCheck(root, 'feat/loose');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /rejected/);
});

// 依据：CLAUDE.md:8；测的是什么：远端新旧两文件并存时，分支改宽新机读文件，推送检查仍拒（用远端新文件，不信分支自改）；测试位置：tests/acceptance/chore-s2-gov/push-remote-rules.test.mjs:83
test('远端新旧并存：分支改宽 tools/accept/card-rules.md，仍按远端版拒绝', () => {
  const root = makeRepo({ 'docs/派活卡头规矩.md': OLD_RULES, 'tools/accept/card-rules.md': OLD_RULES });
  branchWithProbe(root, 'feat/loose2', (r) => {
    put(r, 'tools/accept/card-rules.md', OLD_RULES.split('\n').filter((l) => l.trim() !== '- 触发目录：server-plugin/').join('\n'));
  });
  const r = pushCheck(root, 'feat/loose2');
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /rejected/);
});
