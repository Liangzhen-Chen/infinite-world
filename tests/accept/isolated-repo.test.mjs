// tests/support/isolated-repo.mjs 的行为测试（chore/injection-isolate 写码卡）：
// 副本等于 HEAD、依赖经 node_modules 目录联接可达、探针只落在副本里、副本里能跑提交关口；
// fn 抛错时副本与 worktree 登记都被清掉，调用方工作区与依赖目录不受影响。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { ROOT, writeUnderTempRoot } from './temp-root.mjs';
import { withIsolatedRepo, runGate } from '../support/isolated-repo.mjs';

const norm = (p) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();

function worktrees() {
  const out = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: ROOT, encoding: 'utf8' });
  return out.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => norm(l.slice('worktree '.length)));
}

const head = () => execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
const revIn = (cwd) => execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();

test('withIsolatedRepo：副本停在 HEAD、依赖链接可达；探针只写进副本，结束后副本与调用方工作区都不留', async () => {
  let copyRoot;
  await withIsolatedRepo((root) => {
    copyRoot = root;
    assert.equal(revIn(root), head(), '副本应停在调用方当前 HEAD');
    assert.ok(lstatSync(join(root, '.git')).isFile(), '副本应是独立 worktree（.git 为指针文件），不是原地副本');
    assert.ok(existsSync(join(root, 'node_modules/typescript/package.json')), '依赖应经 node_modules 目录联接可达');
    assert.ok(existsSync(join(root, 'tools/accept/run.mjs')), '副本应含门禁执行器');
    const probe = writeUnderTempRoot(dirname(root), 'repo/隔离探针.txt', 'probe');
    assert.equal(probe, join(root, '隔离探针.txt'));
    assert.equal(readFileSync(probe, 'utf8'), 'probe');
  });
  assert.ok(!existsSync(copyRoot), '副本目录应已删除');
  assert.ok(!worktrees().includes(norm(copyRoot)), 'worktree 登记不应残留');
  const mine = [norm(copyRoot), norm(dirname(copyRoot))];
  const registered = worktrees().filter((w) => mine.some((p) => w === p || w.startsWith(`${p}/`)));
  assert.deepEqual(registered, [], 'worktree 清单里不应再有本测试的副本或临时根');
  assert.ok(!existsSync(dirname(copyRoot)), '本测试的临时根目录应已删除');
  assert.ok(!existsSync(join(ROOT, '隔离探针.txt')), '调用方工作区不该出现探针');
});

test('runGate：副本里跑 pre_commit，返回带 verdict 与退出码的报告', async () => {
  const report = await withIsolatedRepo((root) => runGate(root));
  assert.equal(report.gate, 'pre_commit');
  assert.equal(report.verdict, 'pass');
  assert.equal(report.exitCode, 0);
  assert.equal(typeof report.items.total, 'number');
  assert.ok(existsSync(join(ROOT, 'node_modules/typescript/package.json')), '跑完门禁后调用方依赖目录仍在');
});

test('fn 抛错时副本仍被清理，worktree 登记无残留，错误原样抛出', async () => {
  let copyRoot;
  await assert.rejects(
    withIsolatedRepo((root) => { copyRoot = root; throw new Error('boom'); }),
    /boom/,
  );
  assert.ok(!existsSync(copyRoot), '抛错后副本目录也应删除');
  assert.ok(!worktrees().includes(norm(copyRoot)), '抛错后 worktree 登记也应清掉');
});
