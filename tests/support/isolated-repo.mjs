// 注入类验收题共用的隔离副本工具（chore/injection-isolate）：探针文件只写进临时副本，不碰调用方工作区。
// 副本由 `git worktree add --detach <临时根>/repo HEAD` 生成，只等于 HEAD（调用方已暂存/未提交的改动不带过去）；
// 依赖不复制、不 npm ci，把仓库根的 node_modules 以目录联接（Windows junction，其余平台 dir）链进副本根。
// 临时根取公共设施 testTempRoot（tests/accept/temp-root.mjs，§2.11 gatefac test-temp-root），不在本文件另造一份。
// 泄漏防线（S2-GOV 设计稿 §7）：临时根写 owner.json（pid、repoRoot）；每次调用先清本仓库名下、属主进程已死的残留副本；
// 进程正常退出（含 node --test 超时后退出）时同步清掉还没收尾的副本；没有 owner.json 的目录一律不碰。
// 副本跑门禁用 runGate：在副本里以 cwd 调执行器 `node tools/accept/run.mjs pre_commit`，取标准输出里的 JSON 报告与退出码。
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, realpathSync, rmSync, rmdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot } from '../../tools/path-segment.mjs';
import { testTempRoot, writeUnderTempRoot, removeTempRoot, removeUnderTempRoot } from '../accept/temp-root.mjs';

const git = (args) => execFileSync('git', args, { cwd: repoRoot(), stdio: 'ignore' });
const PREFIX = 'iso-repo-';
const OWNER_FILE = 'owner.json';
const RM = { recursive: true, force: true, maxRetries: 5, retryDelay: 100 };
const norm = (p) => p.split('\\').join('/').replace(/\/+$/, '').toLowerCase();
const self = () => norm(realpathSync(repoRoot()));
/** @type {Set<string>} 本进程还没收尾的临时根 */
const live = new Set();

// 死目录与退出钩子的收尾（主会话 S2-GOV 裁定乙）：临时根不是本函数里 testTempRoot 得来的，fs 删除只能走登记写入口（S12-2）。
// 先删 repo 子目录（removeUnderTempRoot 递归删时把 node_modules 联接当链接删、不跟进，tests/accept/isolated-repo.test.mjs 杀进程用例实测宿主文件仍在），
// 再 prune 清 worktree 登记，owner.json 随临时根最后删：中途失败时 owner.json 还在，下次调用仍认得出、接着清，不会留下认不出的半截目录。
// 刚被杀的进程在 Windows 上句柄可能还没放完（EBUSY/EPERM），每步按 REMOVE_RETRY 重试，重试用尽照抛原错，不吞。
const REMOVE_RETRY = { tries: 6, delayMs: 100 };
function retrying(step) {
  for (let i = 1; ; i++) {
    try { return step(); } catch (e) {
      if (i >= REMOVE_RETRY.tries) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, REMOVE_RETRY.delayMs * i);
    }
  }
}
function dropRoot(stale) {
  retrying(() => removeUnderTempRoot(stale, 'repo'));
  git(['worktree', 'prune']);
  retrying(() => removeTempRoot(stale));
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return /** @type {any} */ (e).code === 'EPERM'; }
}

// 清本仓库名下、属主进程已死的残留副本；读不到 owner.json 或字段不全的目录不碰。
function sweepDead() {
  const base = realpathSync(tmpdir());
  const mine = self();
  for (const name of readdirSync(base)) {
    if (!name.startsWith(PREFIX)) continue;
    const stale = join(base, name);
    let owner;
    try { owner = JSON.parse(readFileSync(join(stale, OWNER_FILE), 'utf8')); } catch { continue; }
    if (!owner || !Number.isInteger(owner.pid) || typeof owner.repoRoot !== 'string') continue;
    if (norm(owner.repoRoot) !== mine || live.has(stale) || alive(owner.pid)) continue;
    dropRoot(stale);
  }
}

let exitHooked = false;
function hookExit() {
  if (exitHooked) return;
  exitHooked = true;
  process.once('exit', () => {
    for (const stale of live) { try { dropRoot(stale); } catch { /* 退出时尽力清 */ } }
  });
}

/**
 * 在 HEAD 的干净副本里跑 fn(copyRoot)，结束后无论成败都删副本、摘 worktree。
 * @template T
 * @param {(copyRoot: string) => T | Promise<T>} fn
 * @returns {Promise<T>}
 */
export async function withIsolatedRepo(fn) {
  sweepDead();
  hookExit();
  const root = testTempRoot(PREFIX);
  const state = { linked: false, worktree: false };
  live.add(root);
  let result; let failure = null;
  try {
    writeUnderTempRoot(root, OWNER_FILE, JSON.stringify({ pid: process.pid, repoRoot: realpathSync(repoRoot()) }));
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
        rmSync(join(root, 'repo'), RM);
        try { git(['worktree', 'prune']); } catch { /* 清登记失败不掩盖原错 */ }
      }
    }
    rmSync(root, RM);
  } catch (e) {
    if (!failure) failure = e;
  }
  live.delete(root);
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
