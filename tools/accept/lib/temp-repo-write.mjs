// 临时仓库夹具的写入口（卷十二 S12-2、§2.11；门禁封口子卡 C；gatefac `test-temp-repo-fixture`，inRepo 为假）。
// 测快照、门禁一类工具的测试要在仓库外的临时仓库里摆一份假的 §2.11 登记文件（如 tools/accept/baseline.json），本意就是写登记路径，
// 所以不能走 temp-root.mjs 的 writeUnderTempRoot（它拒 §2.11 受保护模式）。这类写只经本文件 writeTempRepoFile：
// 先由 assertTempRepoPath 断言目标根是系统临时目录下、仓库外的目录（复用 temp-root.mjs 的 assertTempRoot，同一判断只一处），
// 且相对路径解析后不越出该根；写入只用断言返回的完整路径。真实仓库里的登记文件仍只经登记器与执行器写。
import { dirname, relative, isAbsolute, resolve } from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';
import { assertTempRoot, assertRealUnder } from './temp-root.mjs';

// 断言函数（登记在 gatefac test-temp-repo-fixture 的 writerAsserts）：返回目标文件的完整路径（临时根真实路径下）。
export function assertTempRepoPath(root, rel) {
  const real = assertTempRoot(root);
  if (typeof rel !== 'string' || rel === '' || isAbsolute(rel) || /^[A-Za-z]:/.test(rel)) throw new Error(`temp repo write needs a relative path: ${rel}`);
  const full = resolve(real, rel);
  const r = relative(real, full);
  if (r === '' || r.startsWith('..') || isAbsolute(r)) throw new Error(`write must stay inside the temp repo: ${rel}`);
  assertRealUnder(real, full);
  return full;
}

// 临时仓库夹具的唯一写入口：先断言，再建父目录并写文件。返回写入的完整路径。
export function writeTempRepoFile(root, rel, data) {
  const full = assertTempRepoPath(root, rel);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, data);
  return full;
}
