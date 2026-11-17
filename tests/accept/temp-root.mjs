// 测试临时根（卷十二 §2.11 gatefac `test-temp-root`，inRepo 为假；李白 11-17 裁定三）。
// tests/accept 里生成测试临时目录的唯一函数：目录建在系统临时目录下，运行时断言它在仓库外（临时目录本身、符号链接解析后都不在仓库内）。
// 扫描 S12-2 只认从本函数（或 temp-repo.mjs 的 tempRepo，它是本函数加门禁副本的包装）拿到的目录：对"临时根 + 常量相对路径"的写不计，其余一律计入。
import { join, dirname, relative, isAbsolute, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync, realpathSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { matchGlobs } from '../../tools/accept/read.mjs';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

const inside = (parent, child) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

export function testTempRoot(prefix = 'test-') {
  const repo = realpathSync(ROOT);
  const base = realpathSync(tmpdir());
  if (inside(repo, base)) throw new Error(`temp root must be outside the repository: ${base}`);
  const dir = mkdtempSync(join(base, prefix));
  if (inside(repo, realpathSync(dir))) throw new Error(`temp root must be outside the repository: ${dir}`);
  return dir;
}

// 临时根下的唯一写入口（李白 11-17 裁定四）：运行时断言 rel 规范化后不越出 root（非绝对、不含 ..），且不命中 §2.11 登记的受保护路径模式
// （模式取自 scanclasses 里 registry_write 行的 guardedPaths，不手写）；通过才建父目录并写文件。返回写入的完整路径。
// 断言函数（登记在 gatefac test-temp-root 的 writerAsserts）：root 在仓库外，rel 规范化后不越出 root 且不命中 §2.11 模式；返回规范化后的完整路径（root 拼规范化相对路径），写入只许用这个返回值（call_edge 按它判豁免，李白 11-17 裁定①）。
export function assertRelUnderTempRoot(root, rel) {
  if (inside(realpathSync(ROOT), realpathSync(root))) throw new Error(`temp root must be outside the repository: ${root}`);
  const n = normalize(String(rel)).split(sep).join('/');
  if (isAbsolute(String(rel)) || /^[A-Za-z]:/.test(n) || n.startsWith('/') || n === '..' || n.startsWith('../') || n === '.') {
    throw new Error(`write must stay inside the temp root: ${rel}`);
  }
  const rows = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows;
  const guarded = (rows.find((c) => c.scanClass === 'registry_write') || {}).guardedPaths;
  if (!Array.isArray(guarded) || !guarded.length) throw new Error('registry_write guardedPaths not registered');
  if (matchGlobs(n, guarded, [])) throw new Error(`write hits a registered path pattern (§2.11): ${rel}`);
  return join(root, n);
}

export function writeUnderTempRoot(root, rel, data) {
  const full = assertRelUnderTempRoot(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  return full;
}
