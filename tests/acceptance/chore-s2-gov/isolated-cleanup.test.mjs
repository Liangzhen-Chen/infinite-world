// 验收：卡 chore/s2-gov：隔离副本不再泄漏临时仓库。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：docs/PLAN.md:67（S2-GOV：tests/support/isolated-repo.mjs 修临时仓库泄漏）；CLAUDE.md:8（④ 进度与工作区干净，测试不留垃圾）。
// 黑盒：只调 tests/support/isolated-repo.mjs 的 withIsolatedRepo（公开接口）；杀进程用例用子进程；所有临时目录在 after 里清掉。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { testTempRoot, removeTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';
import { withIsolatedRepo } from '../../support/isolated-repo.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
const worktrees = () => execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  .split('\n').filter((l) => l.startsWith('worktree ')).map((l) => norm(l.slice('worktree '.length)));
const made = [];
after(() => { for (const r of made) removeTempRoot(r); });

// 依据：docs/PLAN.md:67；测的是什么：正常返回后，本次副本目录与 worktree 登记都已清掉，宿主 node_modules 仍在；测试位置：tests/acceptance/chore-s2-gov/isolated-cleanup.test.mjs:21
test('正常返回：副本目录与 worktree 登记清掉，宿主依赖保留', async () => {
  let copy = null;
  await withIsolatedRepo(async (c) => { copy = c; assert.ok(existsSync(c)); });
  assert.ok(copy);
  assert.ok(!existsSync(dirname(copy)), '副本的临时根仍在');
  assert.ok(!worktrees().includes(norm(copy)), 'worktree 登记未摘');
  assert.ok(existsSync(join(ROOT, 'node_modules')), '宿主 node_modules 被误删');
});

// 依据：docs/PLAN.md:67；测的是什么：fn 抛错时副本与登记同样被清掉，错误原样抛出；测试位置：tests/acceptance/chore-s2-gov/isolated-cleanup.test.mjs:31
test('fn 抛错：仍清掉副本，错误原样抛出', async () => {
  let copy = null;
  await assert.rejects(withIsolatedRepo(async (c) => { copy = c; throw new Error('probe-boom'); }), /probe-boom/);
  assert.ok(!existsSync(dirname(copy)));
  assert.ok(!worktrees().includes(norm(copy)));
});

// 子进程跑 withIsolatedRepo：fn 打印副本路径后挂起（exit 用例则让事件循环排空、进程自然退出）。
// 返回 { child, exited（退出 Promise）, copy（副本路径 Promise，子进程提前退出或 60 秒无输出则拒绝） }。
function childRun() {
  const url = pathToFileURL(join(ROOT, 'tests/support/isolated-repo.mjs')).href;
  const code = [
    `import(${JSON.stringify(url)}).then((m) => m.withIsolatedRepo(async (c) => {`,
    `  process.stdout.write('COPY ' + c + '\\n');`,
    `  await new Promise(() => {});`,
    `}));`,
  ].join('\n');
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const exited = new Promise((resolve) => child.on('exit', resolve));
  const copy = new Promise((resolve, reject) => {
    let buf = '';
    const timer = setTimeout(() => reject(new Error('子进程未打印副本路径：' + err.slice(-800))), 60000);
    child.on('exit', () => { clearTimeout(timer); reject(new Error('子进程提前退出：' + err.slice(-800))); });
    child.stdout.on('data', (d) => {
      buf += d;
      const m = /COPY (.+)\r?\n/.exec(buf);
      if (m) { clearTimeout(timer); resolve(m[1].trim()); }
    });
  });
  return { child, exited, copy };
}

// 依据：docs/PLAN.md:67；测的是什么：进程被杀（无清理机会）后，下一次 withIsolatedRepo 开头清掉它留下的副本与登记；测试位置：tests/acceptance/chore-s2-gov/isolated-cleanup.test.mjs:66
test('子进程被杀后，下一次调用清掉残留副本与登记', async () => {
  const r = childRun();
  const copy = await r.copy;
  assert.ok(existsSync(copy), '子进程副本未生成');
  r.child.kill();
  await r.exited;
  assert.ok(existsSync(copy), '杀进程后副本应仍在（残留）');
  await withIsolatedRepo(async () => {});
  assert.ok(!existsSync(dirname(copy)), '残留临时根未被清掉');
  assert.ok(!worktrees().includes(norm(copy)), '残留 worktree 登记未被清掉');
  assert.ok(existsSync(join(ROOT, 'node_modules')), '宿主 node_modules 被误删');
});

// 依据：docs/PLAN.md:67；测的是什么：子进程 fn 未返回但进程自然退出（node --test 超时后的退出路径）时，退出前已清掉副本与登记；测试位置：tests/acceptance/chore-s2-gov/isolated-cleanup.test.mjs:80
test('子进程自然退出：退出时清掉副本与登记', async () => {
  const r = childRun();
  const copy = await r.copy;
  await r.exited;
  assert.ok(!existsSync(dirname(copy)), '自然退出后临时根仍在');
  assert.ok(!worktrees().includes(norm(copy)), '自然退出后 worktree 登记仍在');
});

// 依据：docs/PLAN.md:67；测的是什么：没有 owner.json、pid 不明的旧目录一律保留（不误删他人目录）；测试位置：tests/acceptance/chore-s2-gov/isolated-cleanup.test.mjs:89
test('无 owner.json 的 iso-repo 目录保留不动', async () => {
  const stale = testTempRoot('iso-repo-');
  made.push(stale);
  writeUnderTempRoot(stale, 'keep.txt', 'x');
  await withIsolatedRepo(async () => {});
  assert.ok(existsSync(join(stale, 'keep.txt')), '无 owner.json 的目录被误删');
});
