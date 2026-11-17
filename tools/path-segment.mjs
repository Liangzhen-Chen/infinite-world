// 离线写路径的共用设施（卷十二 S12-2 补一种可证明法；李白 11-17 21:2x 裁定；gatefac `offline-path-segment`）。
// 离线工具写文件时，路径写成 join(repoRoot(), 常量前导段…, safeSegment(尾段)…)：仓库根由 repoRoot 给出，
// 尾段只能是单个路径段，由 safeSegment 在运行时保证它逃不出前导目录（拒空串、分隔符、`..`、绝对路径、盘符）。
// 检测器经登记数据识别这两个函数（gatefacs.json 的 rootFns、segmentFns），不在源码里写文件名；
// 常量前导段不命中 §2.11 路径模式的由检测器读 scanclasses 的 registry_write.guardedPaths 判定。

import { resolve, dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

// 仓库根（本文件在 tools/ 下，上一级）。
export function repoRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..');
}

// 校验并返回一个路径段；不合规直接抛错。
export function safeSegment(segment) {
  const s = String(segment);
  if (s === '' || s === '.' || s === '..') throw new Error(`unsafe path segment: ${JSON.stringify(s)}`);
  if (/[\\/]/.test(s) || s.includes('..') || s.includes('\0') || isAbsolute(s) || /^[A-Za-z]:/.test(s)) {
    throw new Error(`unsafe path segment: ${JSON.stringify(s)}`);
  }
  return s;
}
