// 测试临时根（卷十二 §2.11 gatefac `test-temp-root`，inRepo 为假；李白 11-17 裁定三）。
// tests/accept 里生成测试临时目录的唯一函数：目录建在系统临时目录下，运行时断言它在仓库外（临时目录本身、符号链接解析后都不在仓库内）。
// 扫描 S12-2 只认从本函数（或 temp-repo.mjs 的 tempRepo，它是本函数加门禁副本的包装）拿到的目录：对"临时根 + 常量相对路径"的写不计，其余一律计入。
import { join, dirname, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { mkdtempSync, realpathSync } from 'node:fs';

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
