// 注入类验收题共用的隔离副本工具（chore/injection-isolate）：探针文件只写进临时副本，不碰调用方工作区。
// 副本由 `git worktree add --detach <临时根>/repo HEAD` 生成，只等于 HEAD（调用方已暂存/未提交的改动不带过去）；
// 依赖不复制、不 npm ci，把仓库根的 node_modules 以目录联接（Windows junction，其余平台 dir）链进副本根。
// 临时根取公共设施 testTempRoot（tests/accept/temp-root.mjs，§2.11 gatefac test-temp-root），不在本文件另造一份。
// 副本跑门禁用 runGate：在副本里以 cwd 调执行器 `node tools/accept/run.mjs pre_commit`，取标准输出里的 JSON 报告与退出码。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from '../../tools/path-segment.mjs';
import { testTempRoot } from '../accept/temp-root.mjs';

const git = (args) => execFileSync('git', args, { cwd: repoRoot(), stdio: 'ignore' });

/**
 * 在 HEAD 的干净副本里跑 fn(copyRoot)，结束后无论成败都删副本、摘 worktree。
 * @template T
 * @param {(copyRoot: string) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withIsolatedRepo(fn) {
  const root = testTempRoot('iso-repo-');
  const state = { linked: false, worktree: false };
  let result; let failure = null;
  try {
    git(['worktree', 'add', '--detach', join(root, 'repo'), 'HEAD']);
    state.worktree = true;
    const modules = join(repoRoot(), 'node_modules');
    if (!existsSync(modules)) throw new Error(`隔离副本需要仓库根的 node_modules：${modules}（先 npm ci）`);
    symlinkSync(modules, join(root, 'repo/node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
    state.linked = true;
    result = await fn(join(root, 'repo'));
  } catch (e) {
    failure = e;
  }
  try {
    // 先断开 node_modules 目录联接：只删链接本身，绝不跟进去删调用方的依赖。
    if (state.linked) {
      try { unlinkSync(join(root, 'repo/node_modules')); } catch { try { rmdirSync(join(root, 'repo/node_modules')); } catch { /* 链接已不在 */ } }
    }
    if (state.worktree) {
      try {
        git(['worktree', 'remove', '--force', join(root, 'repo')]);
      } catch {
        rmSync(join(root, 'repo'), { recursive: true, force: true });
        try { git(['worktree', 'prune']); } catch { /* 清登记失败不掩盖原错 */ }
      }
    }
    rmSync(root, { recursive: true, force: true });
  } catch (e) {
    if (!failure) failure = e;
  }
  if (failure) throw failure;
  return result;
}

/**
 * 在副本里跑提交关口，返回解析好的报告（标准输出里第一个 `{` 起的 JSON）并附退出码。
 * @param {string} copyRoot
 * @returns {Record<string, any>}
 */
export function runGate(copyRoot) {
  const r = spawnSync(process.execPath, ['tools/accept/run.mjs', 'pre_commit'], {
    cwd: copyRoot, encoding: 'utf8', maxBuffer: 1 << 28,
  });
  if (r.error) throw r.error;
  const out = String(r.stdout || '');
  const start = out.indexOf('{');
  const end = out.lastIndexOf('}');
  if (start < 0 || end < start) throw new Error(`runGate：门禁标准输出里没有 JSON（stderr 末段：${String(r.stderr || '').slice(-500)}）`);
  return { ...JSON.parse(out.slice(start, end + 1)), exitCode: r.status };
}
