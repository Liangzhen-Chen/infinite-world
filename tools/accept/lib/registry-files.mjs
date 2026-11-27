// 登记分片读者（S2-SH 草案 §2.3、§5.1）：门禁与工具读 state-owners、entry-registry 只经本文件；读目录与文件后交规则层纯函数
// server-plugin/rules/load/registry-shards.mjs 合并（合并规则只在那里）。分片目录由主文件路径派生（shardDirOf）。
// readOwnersFiles 既读真实仓库（root 字串），也读执行上下文的虚拟文件集（ctx.files / ctx.read），用例夹具照旧可带自己的声明表。

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { LAYOUT } from './world-layout.mjs';
import { mergeOwners, mergeEntries, shardDirOf } from '../../../server-plugin/rules/load/registry-shards.mjs';

export const ENTRY_REGISTRY_FILE = 'tools/accept/entry-registry.json';

const cmp = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 一份登记（主文件 + 分片目录下的直接子文件）的原文读取：root 字串读磁盘；带 files/read 的上下文读虚拟文件集。
 * 主文件缺时 doc 为 null；分片目录缺或为空时 shards 为空。
 * @param {string | {files: string[], read: (p: string) => string}} src @param {string} mainFile
 */
function readSet(src, mainFile) {
  const dir = shardDirOf(mainFile);
  if (typeof src === 'string') {
    const abs = join(src, mainFile);
    const doc = existsSync(abs) ? JSON.parse(readFileSync(abs, 'utf8')) : null;
    const absDir = join(src, dir);
    const names = existsSync(absDir) ? readdirSync(absDir).sort(cmp) : [];
    return { doc, shards: names.map((n) => ({ file: `${dir}/${n}`, doc: JSON.parse(readFileSync(join(absDir, n), 'utf8')) })) };
  }
  const doc = src.files.includes(mainFile) ? JSON.parse(src.read(mainFile)) : null;
  const shardFiles = src.files.filter((f) => f.startsWith(`${dir}/`) && !f.slice(dir.length + 1).includes('/')).sort(cmp);
  return { doc, shards: shardFiles.map((f) => ({ file: f, doc: JSON.parse(src.read(f)) })) };
}

/**
 * state-owners 合并结果 {doc, originOf}（主文件缺时按空对象合并，与旧 readDecl 同口径）。
 * @param {string | {files: string[], read: (p: string) => string}} src 仓库根或执行上下文
 * @returns {{doc: any, originOf: (path: ReadonlyArray<string | number>) => string}}
 */
export function readOwnersFiles(src) {
  const { doc, shards } = readSet(src, LAYOUT.stateOwners);
  return mergeOwners({ file: LAYOUT.stateOwners, doc: doc === null ? {} : doc }, shards);
}

/** 执行上下文的被查内容里有没有 state-owners 主文件或其分片。 @param {{files: string[]}} ctx */
export function hasOwnersFiles(ctx) {
  const dir = `${shardDirOf(LAYOUT.stateOwners)}/`;
  return ctx.files.some((f) => f === LAYOUT.stateOwners || f.startsWith(dir));
}

/**
 * entry-registry 合并结果 {registry, sourceOf}；主文件缺即抛（同改前直读的行为）。
 * @param {string} root 仓库根
 * @returns {{registry: any, sourceOf: (index: number) => string}}
 */
export function readEntryRegistry(root) {
  const { doc, shards } = readSet(root, ENTRY_REGISTRY_FILE);
  if (doc === null) throw new Error(`读不到总登记表 ${ENTRY_REGISTRY_FILE}`);
  return mergeEntries({ file: ENTRY_REGISTRY_FILE, doc }, shards);
}
