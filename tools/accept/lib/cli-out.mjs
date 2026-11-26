// 命令行输出路径的写入口（卷十二 S12-2、§2.11；门禁封口卡 B，主会话裁定 Q4 ②；gatefac `offline-cli-out`，inRepo 为真）。
// 离线工具把结果写到命令行指定的路径、或以运行目录为根的固定产物时，路径算不出常量，只经本文件 writeCliOut 写：
// 先由 assertCliOut 解析真实路径（realpathSync.native，不存在的尾段对最深已存在上级解析后再拼），
// 落在该次写入所针对的仓库根（root）或本工具所在仓库根（temp-root.mjs 的 ROOT）之内、且命中 §2.11 受保护模式即抛错；
// 仓库外与仓库内非登记路径放行。受保护模式与临时根设施共用 temp-root.mjs 的 guardedPaths 一处读取。
import { join, dirname, basename, relative, isAbsolute, resolve, sep } from 'node:path';
import { existsSync, realpathSync, writeFileSync } from 'node:fs';
import { matchGlobs } from '../read.mjs';
import { ROOT, guardedPaths } from './temp-root.mjs';

// 路径段在 Windows 上的别名写法：段尾的 `.`、空格会被系统去掉，`:` 引出备用数据流（`::$DATA` 即原文件）；这类段一律拒收（盘符根除外）。
function assertPlainSegments(abs, path) {
  abs.split(/[\\/]/).forEach((s, idx) => {
    if (s === '' || (idx === 0 && /^[A-Za-z]:$/.test(s))) return;
    if (/[. ]$/.test(s) || s.includes(':')) throw new Error(`cli output path has an aliasing segment: ${path}`);
  });
}

function realPathOf(p) {
  const tail = []; let d = p;
  while (!existsSync(d)) { const up = dirname(d); if (up === d) break; tail.unshift(basename(d)); d = up; }
  return join(realpathSync.native(d), ...tail);
}

// 大小写归一（只此一处）：win32 文件系统不分大小写，比对前把路径与模式都转小写，再照调 read.mjs#matchGlobs 原函数；
// 不扩 matchGlobs 本身，因为 read.mjs 在几乎全部判据的 import 闭包内，改它会致 76 类判据指纹漂移（主会话裁定 msg_4ab903d3035c）。
// 以后别处要不分大小写比路径，须走这个函数。
export function foldPathCase(s) {
  return process.platform === 'win32' ? String(s).toLowerCase() : String(s);
}

function hitsGuarded(base, full) {
  const rel = relative(realPathOf(resolve(String(base))), full);
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return false;
  return matchGlobs(foldPathCase(rel.split(sep).join('/')), guardedPaths().map(foldPathCase), []);
}

// 断言函数（登记在 gatefac offline-cli-out 的 writerAsserts）：返回解析后的完整路径，写入只许用这个返回值。
export function assertCliOut(root, path) {
  const abs = resolve(String(root), String(path));
  assertPlainSegments(abs, path);
  const full = realPathOf(abs);
  if (full === realPathOf(resolve(String(root)))) throw new Error(`cli output must be a file, not the repository root: ${path}`);
  if (hitsGuarded(root, full) || hitsGuarded(ROOT, full)) throw new Error(`cli output hits a registered path pattern (§2.11): ${path}`);
  return full;
}

// 命令行输出的唯一写入口：先断言再写。返回写入的完整路径。
export function writeCliOut(root, path, data) {
  const full = assertCliOut(root, path);
  writeFileSync(full, data);
  return full;
}
