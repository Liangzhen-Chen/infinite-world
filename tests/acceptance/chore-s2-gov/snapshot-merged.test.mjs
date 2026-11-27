// 验收：卡 chore/s2-gov：状态快照把已合卡派生为 merged，且确定。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：CLAUDE.md:8（④ 进度 docs/状态快照.generated.md 由 CI 生成、不手写）；docs/PLAN.md:67（S2-GOV：gen-status-snapshot 自动把已合卡归 merged）；CLAUDE.md:28（合并提交不免查，合入以真合并为准）。
// 黑盒：临时仓库（testTempRoot）里用 git 造卡分支、真合并、空提交，子进程跑 tools/gen-status-snapshot.mjs，只读生成的快照文件。不 import 实现模块。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeTempRepoFile } from '../../../tools/accept/lib/temp-repo-write.mjs';
import { testTempRoot, removeTempRoot, writeUnderTempRoot, removeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
const git = (cwd, args) => execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], { cwd, env, encoding: 'utf8' });
const put = (root, rel, text) => writeTempRepoFile(root, rel, text);
const SNAP = 'docs/状态快照.generated.md';
const made = [];
after(() => { for (const r of made) removeTempRoot(r); });

function makeRepo() {
  const tmpRoot = testTempRoot('gov-snap-');
  made.push(tmpRoot);
  git(tmpRoot, ['init', '-q', '-b', 'master']);
  cpSync(join(ROOT, 'tools'), join(tmpRoot, 'tools'), { recursive: true });
  cpSync(join(ROOT, 'server-plugin'), join(tmpRoot, 'server-plugin'), { recursive: true });
  put(tmpRoot, 'README.txt', 'base\n');
  git(tmpRoot, ['add', '-A']);
  git(tmpRoot, ['commit', '-q', '-m', 'base']);
  return tmpRoot;
}

function card(root, name, phase, msg) {
  put(root, `docs/卡档案/${name}/state.json`, JSON.stringify({ card: name, phase, failCount: 0, nextAction: '测试桩', blocker: null }, null, 2) + '\n');
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', msg]);
}

function gen(root) {
  const r = spawnSync(process.execPath, ['tools/gen-status-snapshot.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, `生成失败：${r.stderr}`);
  return readFileSync(join(root, SNAP), 'utf8');
}
const inFlight = (text, name) => (text.split('## 在途卡')[1] || '').includes(name);
const merged = (text, name) => (/已合 \d+ 张：[^\n]*/.exec(text)?.[0] || '').includes(name);

// 依据：卷十二:545；补充：CLAUDE.md:8；测的是什么：卡分支上还没真合并时判在途；测试位置：tests/acceptance/chore-s2-gov/snapshot-merged.test.mjs:48
test('卡分支未合入：判在途', () => {
  const root = makeRepo();
  git(root, ['checkout', '-q', '-b', 'feat/x']);
  card(root, 'chore-x', 'dev', 'x: dev');
  const t1 = gen(root);
  assert.ok(inFlight(t1, 'chore-x') && !merged(t1, 'chore-x'), '第一次应在途');
  card(root, 'chore-x', 'ci', 'x: ci');
  const t2 = gen(root);
  assert.ok(inFlight(t2, 'chore-x') && !merged(t2, 'chore-x'), '第二次应在途');
});

// 依据：卷十二:545；补充：CLAUDE.md:8；测的是什么：真合并（说明行「角色：合并」）后，HEAD 为真合并提交时即判已合（生成基准取 HEAD，11-27 裁定），再加一个提交后仍判已合；「角色：写码」的同步合并不算合入（判在途）；测试位置：tests/acceptance/chore-s2-gov/snapshot-merged.test.mjs:60
test('真合并后判 merged；角色写码的同步合并不算合入', () => {
  const root = makeRepo();
  git(root, ['checkout', '-q', '-b', 'feat/x']);
  card(root, 'chore-x', 'ci', 'x: ci');
  git(root, ['checkout', '-q', 'master']);
  git(root, ['checkout', '-q', '-b', 'feat/y']);
  card(root, 'chore-y', 'ci', 'y: ci');
  git(root, ['checkout', '-q', 'master']);
  git(root, ['merge', '-q', '--no-ff', 'feat/x', '-m', '卡分支：feat/x\n角色：合并\n标识：t\n']);
  git(root, ['merge', '-q', '--no-ff', 'feat/y', '-m', '卡分支：feat/y\n角色：写码\n标识：t\n']);
  const atMerge = gen(root);
  // 生成基准取 HEAD 本身（主会话 11-27 裁定，提交 cbce97973）：HEAD 即真合并提交时已判合。
  assert.ok(merged(atMerge, 'chore-x'), 'HEAD 为真合并提交时应已合');
  assert.ok(inFlight(atMerge, 'chore-y') && !merged(atMerge, 'chore-y'), '角色写码的同步合并不应判合');
  git(root, ['commit', '-q', '--allow-empty', '-m', 'after']);
  const after1 = gen(root);
  assert.ok(merged(after1, 'chore-x'), '真合并后应 merged');
  assert.ok(inFlight(after1, 'chore-y') && !merged(after1, 'chore-y'), '角色写码的同步合并不应判 merged');
});

// 依据：卷十二:545；补充：CLAUDE.md:8；测的是什么：同一 HEAD 两次生成逐字节相同，且 --check 通过；测试位置：tests/acceptance/chore-s2-gov/snapshot-merged.test.mjs:81
test('同一 HEAD 两次生成逐字节相同，--check 通过', () => {
  const root = makeRepo();
  git(root, ['checkout', '-q', '-b', 'feat/x']);
  card(root, 'chore-x', 'ci', 'x: ci');
  git(root, ['checkout', '-q', 'master']);
  git(root, ['merge', '-q', '--no-ff', 'feat/x', '-m', '卡分支：feat/x\n角色：合并\n标识：t\n']);
  git(root, ['commit', '-q', '--allow-empty', '-m', 'after']);
  const a = gen(root);
  const b = gen(root);
  assert.equal(a, b);
  const c = spawnSync(process.execPath, ['tools/gen-status-snapshot.mjs', '--check'], { cwd: root, encoding: 'utf8' });
  assert.equal(c.status, 0, c.stdout + c.stderr);
});

// 依据：卷十二:545；补充：CLAUDE.md:8；测的是什么：浅克隆时快照标「缺：完整历史」而不是静默误判；测试位置：tests/acceptance/chore-s2-gov/snapshot-merged.test.mjs:96
test('浅克隆时快照标出「缺：完整历史」', () => {
  const root = makeRepo();
  git(root, ['checkout', '-q', '-b', 'feat/x']);
  card(root, 'chore-x', 'ci', 'x: ci');
  git(root, ['checkout', '-q', 'master']);
  git(root, ['merge', '-q', '--no-ff', 'feat/x', '-m', '卡分支：feat/x\n角色：合并\n标识：t\n']);
  const shallow = testTempRoot('gov-shallow-');
  made.push(shallow);
  const dest = join(shallow, 'clone');
  execFileSync('git', ['clone', '-q', '--depth', '1', pathToFileURL(root).href, dest], { env, encoding: 'utf8' });
  const text = gen(dest);
  assert.ok(text.includes('缺：完整历史'), '浅克隆快照应含「缺：完整历史」');
  removeUnderTempRoot(shallow, 'clone');
});
