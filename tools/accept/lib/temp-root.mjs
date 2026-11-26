// 临时根设施（卷十二 §2.11 gatefac `test-temp-root`，inRepo 为假；李白 11-17 裁定三、四）。门禁工具（typed_pos 的 tsc 用例目录）与测试共用这一份实现，
// tests/accept/temp-root.mjs 原样 re-export。目录建在系统临时目录下，运行时断言它在仓库外（临时目录本身、符号链接解析后都不在仓库内）。
// 扫描 S12-2 只认从 testTempRoot（或 tests/accept/temp-repo.mjs 的 tempRepo）拿到的目录：对"临时根 + 常量相对路径"的写不计，其余一律计入；
// 临时根下的写与删只经本文件的登记写入口（assertedWriters），入口体内先调断言（writerAsserts），写删只用断言返回的路径。
import { join, dirname, basename, relative, isAbsolute, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync, realpathSync, readFileSync, mkdirSync, writeFileSync, rmSync, lstatSync } from 'node:fs';
import { matchGlobs } from '../read.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const inside = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

export function testTempRoot(prefix = 'test-') {
  const repo = realpathSync(ROOT);
  const base = realpathSync(tmpdir());
  if (inside(repo, base)) throw new Error(`temp root must be outside the repository: ${base}`);
  const dir = mkdtempSync(join(base, prefix));
  if (inside(repo, realpathSync(dir))) throw new Error(`temp root must be outside the repository: ${dir}`);
  return dir;
}

// 断言函数（登记在 gatefac test-temp-root 的 writerAsserts）：root 解析后在系统临时目录之下（不是临时目录本身）、在仓库外；返回解析后的真实路径，删除只许用这个返回值。
export function assertTempRoot(root) {
  const real = realpathSync(String(root));
  const base = realpathSync(tmpdir());
  if (inside(realpathSync(ROOT), real)) throw new Error(`temp root must be outside the repository: ${root}`);
  if (real === base || !inside(base, real)) throw new Error(`temp root must be a directory under the system temp directory: ${root}`);
  return real;
}

// §2.11 登记的受保护路径模式（scanclasses 里 registry_write 行的 guardedPaths，不手写）；临时根与 cli-out 两个设施的断言共用这一处读取。
export function guardedPaths() {
  const rows = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows;
  const guarded = (rows.find((c) => c.scanClass === 'registry_write') || {}).guardedPaths;
  if (!Array.isArray(guarded) || !guarded.length) throw new Error('registry_write guardedPaths not registered');
  return guarded;
}

// 临时根下的唯一写入口（李白 11-17 裁定四）：运行时断言 rel 规范化后不越出 root（非绝对、不含 ..），且不命中 §2.11 登记的受保护路径模式
// （模式取自 scanclasses 里 registry_write 行的 guardedPaths，不手写）；通过才建父目录并写文件。返回写入的完整路径。
// 断言函数（登记在 gatefac test-temp-root 的 writerAsserts）：root 在仓库外，rel 规范化后不越出 root 且不命中 §2.11 模式；返回规范化后的完整路径（root 拼规范化相对路径），写入只许用这个返回值（call_edge 按它判豁免，李白 11-17 裁定①）。
// 落点断言（审卡 chore/gate-seal-c 必须改 1；临时根与临时仓库夹具两个写入口共用这一处）：字面路径不解析目录链接，
// 根下的符号链接或 junction 能把写入带出根。取 full 已存在（按 lstat，悬空链接也算存在，其 realpath 抛错即拒）的最近祖先的真实路径（realpathSync.native），再拼回未存在的尾段，
// 结果须仍在 root 的真实路径之内（且不是根本身），否则抛错。返回解析后的真实落点。
export function assertRealUnder(root, full) {
  const base = realpathSync.native(String(root));
  const tail = []; let d = String(full);
  const present = (p) => { try { lstatSync(p); return true; } catch { return false; } };
  while (!present(d)) { const up = dirname(d); if (up === d) break; tail.unshift(basename(d)); d = up; }
  const real = join(realpathSync.native(d), ...tail);
  const r = relative(base, real);
  if (r === '' || r.startsWith('..') || isAbsolute(r)) throw new Error(`write must stay inside the temp root (links resolved): ${full}`);
  return real;
}

export function assertRelUnderTempRoot(root, rel) {
  if (inside(realpathSync(ROOT), realpathSync(root))) throw new Error(`temp root must be outside the repository: ${root}`);
  const n = normalize(String(rel)).split(sep).join('/');
  if (isAbsolute(String(rel)) || /^[A-Za-z]:/.test(n) || n.startsWith('/') || n === '..' || n.startsWith('../') || n === '.') {
    throw new Error(`write must stay inside the temp root: ${rel}`);
  }
  if (matchGlobs(n, guardedPaths(), [])) throw new Error(`write hits a registered path pattern (§2.11): ${rel}`);
  assertRealUnder(root, join(root, n));
  return join(root, n);
}

export function writeUnderTempRoot(root, rel, data) {
  const full = assertRelUnderTempRoot(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  return full;
}

// 清理整个临时根：先断言它是系统临时目录下、仓库外的目录，再递归删除。
export function removeTempRoot(root) {
  const dir = assertTempRoot(root);
  rmSync(dir, { recursive: true, force: true });
}

// 删临时根下的一个文件或子目录（篡改用例"删片"一类）：断言同写入口，再删。
export function removeUnderTempRoot(root, rel) {
  const full = assertRelUnderTempRoot(root, rel);
  rmSync(full, { recursive: true, force: true });
}
