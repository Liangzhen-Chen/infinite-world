// 命令行输出路径的写入口（卷十二 S12-2、§2.11；门禁封口卡 B，主会话裁定 Q4 ②；gatefac `offline-cli-out`，inRepo 为真）。
// 离线工具把结果写到命令行指定的路径、或以运行目录为根的固定产物时，路径算不出常量，只经本文件 writeCliOut 写：
// 先由 assertCliOut 解析真实路径（符号链接按最深的已存在上级解析），落在该次写入所针对的仓库根（root）之内且命中 §2.11 受保护模式即抛错；
// 仓库外与仓库内非登记路径放行。受保护模式与临时根设施共用 temp-root.mjs 的 guardedPaths 一处读取。
import { join, dirname, basename, relative, isAbsolute, resolve, sep } from 'node:path';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { matchGlobs } from '../read.mjs';
import { guardedPaths } from './temp-root.mjs';

function realPathOf(p) {
  const tail = []; let d = p;
  while (!existsSync(d)) { const up = dirname(d); if (up === d) break; tail.unshift(basename(d)); d = up; }
  return join(realpathSync(d), ...tail);
}

// 断言函数（登记在 gatefac offline-cli-out 的 writerAsserts）：返回解析后的完整路径，写入只许用这个返回值。
export function assertCliOut(root, path) {
  const full = realPathOf(resolve(String(root), String(path)));
  const rel = relative(realPathOf(resolve(String(root))), full);
  const inRepo = rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
  if (inRepo && matchGlobs(rel.split(sep).join('/'), guardedPaths(), [])) throw new Error(`cli output hits a registered path pattern (§2.11): ${path}`);
  if (rel === '') throw new Error(`cli output must be a file, not the repository root: ${path}`);
  return full;
}

// 命令行输出的唯一写入口：先断言再写。返回写入的完整路径。
export function writeCliOut(root, path, data) {
  const full = assertCliOut(root, path);
  writeFileSync(full, data);
  return full;
}
