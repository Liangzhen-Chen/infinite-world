// 存档会话持有（卷二 §2.9 第 0 条"存档四路" :940–944、"通路六环"第 2c、2d 环；卷二十七 R27-4.3、R27-4.5、R27-7.2；体检 K6-84）。
// 只是一个叶子文件：存读导出导入四路的入口都要知道"存到哪、按什么布局、拿什么规则指纹比、当前世界是哪一份"，这些由开局（6-16）与装配交入，
// 本文件只收下并核对形状，不读盘、不算摘要、只 import 错误类与代号文法叶子（不 import 别的 kernel 文件，避免 save.mjs、load/save.mjs、transaction.mjs 之间再多一条环）。
// 两部分：
// - 环境 env（读盘与导入导出都要，没有进行中的游戏也要）：root 存档根目录、layout 存档布局（kernel/save.mjs SaveLayout，含 saveSlotCount）、
//   rulesDigest 本版规则指纹、saveImportMaxBytes（rules.host.saveImportMaxBytes）。
// - 进行中的游戏 game：state 当前世界状态、book 当前日志簿、data 世界数据副本 {base, appends}、resolve 提案到处理节点的查找
//   （与 transaction.mjs ProposalSession 同形）。没有 game 时存档与读档回 save_unavailable，不假装成功。
// 不读墙钟、不用随机数；本文件没有任何具体路径名、动作名。

import { KernelError } from './errors.mjs';
import { isHex64 } from './handles/keys.mjs';

const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** @type {null | {root: string, layout: any, rulesDigest: string, saveImportMaxBytes: number}} */
let env = null;
/** @type {null | {state: any, book: any, data: {base: any, appends: any[]}, resolve: (proposal: any) => any, clockMinute: (state: any) => number}} */
let game = null;

/**
 * 交入存档环境（装配与开局时调一次；kernel 组内用，不在 kernelApi）。
 * @param {{root: string, layout: any, rulesDigest: string, saveImportMaxBytes: number}} e
 * @returns {void}
 */
export function installSaveEnv(e) {
  if (!isObj(e) || typeof e.root !== 'string' || e.root.length < 1) throw new KernelError(CODE_STRUCT, {}, 'installSaveEnv: root must be a non-empty string');
  if (!isObj(e.layout) || !Number.isInteger(e.layout.saveSlotCount) || e.layout.saveSlotCount < 1) throw new KernelError(CODE_STRUCT, {}, 'installSaveEnv: layout.saveSlotCount must be an integer >= 1');
  if (!isHex64(e.rulesDigest)) throw new KernelError(CODE_STRUCT, {}, 'installSaveEnv: rulesDigest must be a 64-hex digest');
  if (!Number.isInteger(e.saveImportMaxBytes) || e.saveImportMaxBytes < 1) throw new KernelError(CODE_STRUCT, {}, 'installSaveEnv: saveImportMaxBytes must be an integer >= 1');
  env = Object.freeze({ root: e.root, layout: e.layout, rulesDigest: e.rulesDigest, saveImportMaxBytes: e.saveImportMaxBytes });
}

/** @returns {typeof env} 没交入返回 null。 */
export function saveEnv() {
  return env;
}

/**
 * 记下进行中的游戏（读档换世界时由 load/save.mjs 重新交入；kernel 组内用）。
 * clockMinute(state)：该状态的世界时钟分钟（调度器 clockView 的 minute；由开局交入，本文件不读状态路径）。
 * @param {{state: any, book: any, data: {base: any, appends: any[]}, resolve: (proposal: any) => any, clockMinute: (state: any) => number}} g
 * @returns {void}
 */
export function setGame(g) {
  if (!isObj(g) || !isObj(g.state) || !isObj(g.book) || !Array.isArray(g.book.entries) || !isObj(g.data) || !isObj(g.data.base) || !Array.isArray(g.data.appends) || typeof g.resolve !== 'function' || typeof g.clockMinute !== 'function') {
    throw new KernelError(CODE_STRUCT, {}, 'setGame: needs {state, book, data: {base, appends}, resolve, clockMinute}');
  }
  game = g;
}

/** @returns {typeof game} 没有进行中的游戏返回 null。 */
export function currentGame() {
  return game;
}

/** 测试与重新挂接用：清掉环境与游戏。 */
export function resetSaveSession() {
  env = null;
  game = null;
}
