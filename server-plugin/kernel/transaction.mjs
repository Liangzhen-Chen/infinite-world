// 事务与整笔拒写（卷二 §2.6"事务内拒写的处置"唯一定义 :499–503；"持有存续条件的提交前重算钩子" :505；§2.7 kernelApi :590 registerHoldWhileRecompute、:612 submitProposal）。
// 事务内任何一次写入被拒，不论来自哪个核对、哪个错误码，处置一律三件、次序固定：① 整笔回滚；② 事务结束后 report(code, fields)；③ 带回应句柄的请求，
// submitProposal 的返回值带拒绝与该错误码（没有句柄的只做 ①②）。不为任何单个错误码另定处置；不重试。
// 被拒的错误码直接上抛到本文件：凡带登记码的错误（KernelError、HandleError 及其他带登记 code 的错误，含日后 2-5 的非有限值拒写）都走同一处置；
// 没有登记码的错误（程序缺陷）同样整笔回滚后原样抛出，不吞。
// pendingPost.*（§2.7 :545，写者只有本文件）的逐条写下与执行完删去随内核信号表（§2.9 第 0 条）那张卡接入；本卡只登写者行与事务框架。

import { KernelError, codeOf } from './errors.mjs';
import { report } from './report.mjs';
import { invalidateMemo } from './memo.mjs';
import { appendLogEntry } from './save.mjs';

/**
 * @typedef {{node: string, file: string, request?: number | string | null, tick?: number, stage?: number}} TxContext
 * node：当前节点名（推进钩子或提案处理函数，§2.6 第 3 条）；file：该节点所在文件（相对 server-plugin/，与 stateKeys.writers 同写法）；
 * request：本次请求编号；tick、stage：推进中的刻 t 与 tick_stage 位次（推进中被拒时进日志）。
 * @typedef {{state: any, node: string, file: string, request: number | string | null, tick?: number, stage?: number, undo: {segs: string[], existed: boolean, prev: any}[], written: string[][], denied?: unknown}} Tx
 * denied：本事务内第一次被拒写入的错误（storage 的 writePath/writeSealed 拒写时记；有则整笔回滚，不论规则层是否 catch）。
 */

/** @type {Tx | null} */
let current = null;

/** 当前事务（kernel/storage.mjs 的写入核对用；kernel 组内用，不在 kernelApi）。没有事务时为 null。 */
export function currentTransaction() {
  return current;
}

// 撤销本事务的全部写入：按记录的倒序恢复原值或删去新加的键。
function rollback(tx) {
  for (let i = tx.undo.length - 1; i >= 0; i--) {
    const { segs, existed, prev } = tx.undo[i];
    let cur = tx.state;
    for (let k = 0; k < segs.length - 1 && cur && typeof cur === 'object'; k++) cur = cur[segs[k]];
    if (!cur || typeof cur !== 'object') continue;
    const last = segs[segs.length - 1];
    if (existed) cur[last] = prev; else delete cur[last];
  }
  tx.undo.length = 0;
  invalidateMemo(tx.state); // 回滚改了 state，缓存作废（kernel/memo.mjs）
}

/** @type {null | ((state: any, written: string[][]) => void)} */
let holdWhileRecompute = null;

/**
 * kernelApi `registerHoldWhileRecompute(handler)`（§2.6 :505）：持有写者在模块加载时交入重算函数；内核在每笔事务提交前调一次，
 * 由它判断本笔是否写到 holdWhile 非空的边并按卷十八 R18-1.12 重算。它抛出的带码错误按本文件同一处置整笔拒绝。只许交入一次（E-WRITER-DUPLICATE）。
 * @param {(state: any, written: string[][]) => void} handler
 * @returns {void}
 */
export function registerHoldWhileRecompute(handler) {
  if (typeof handler !== 'function') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'registerHoldWhileRecompute: handler must be a function');
  if (holdWhileRecompute) throw new KernelError('E-WRITER-DUPLICATE', {}, 'hold-while recompute handler already registered');
  holdWhileRecompute = handler;
}

/** 测试与重新挂接用：清掉已交入的重算函数（kernel 组内用）。 */
export function resetHoldWhileRecompute() {
  holdWhileRecompute = null;
}

/**
 * 跑一笔事务（kernel 调度推进钩子与提案处理函数时用；kernel 组内用，不在 kernelApi）。
 * body 里经 writePath / writeSealed 写 state；全部通过且提交前重算通过即提交。任何带登记码的错误：整笔回滚，事务结束后 report，返回 {ok: false, code}。
 * 字段：entity（被拒写那一行的实体 id，取不到为 null）、request（请求编号，没有为 null）；推进中（ctx 带 tick）另带 tick 与 stage。
 * @param {any} state
 * @param {TxContext} ctx
 * @param {(state: any) => void} body
 * @returns {{ok: true} | {ok: false, code: import('./types.d.ts').ErrorCode}}
 */
export function runTransaction(state, ctx, body) {
  if (current) throw new KernelError('E-VIEW-UNDECLARED-WRITE', {}, 'nested transaction');
  /** @type {Tx} */
  const tx = { state, node: ctx.node, file: ctx.file, request: ctx.request === undefined ? null : ctx.request, tick: ctx.tick, stage: ctx.stage, undo: [], written: [] };
  current = tx;
  let failure = null;
  try {
    body(state);
    if (holdWhileRecompute) holdWhileRecompute(state, tx.written.map((s) => [...s]));
  } catch (e) {
    failure = e;
  }
  // 写入被拒时 storage 已在本事务上记了标记（卷二 :499）：规则层 catch 住也照样整笔回滚；以第一次被拒的错误为准。
  if (tx.denied !== undefined) failure = tx.denied;
  if (failure === null) {
    current = null;
    return { ok: true };
  }
  rollback(tx);
  current = null;
  const code = codeOf(failure);
  if (code === null) throw failure;
  const own = failure && typeof failure === 'object' && failure.fields && typeof failure.fields === 'object' ? failure.fields : {};
  const fields = { entity: Object.hasOwn(own, 'entity') ? own.entity : null, request: tx.request };
  if (tx.tick !== undefined) Object.assign(fields, { tick: tx.tick, stage: tx.stage === undefined ? null : tx.stage });
  report(code, fields);
  return { ok: false, code };
}

/**
 * @typedef {{node: string, file: string, handler: (state: any, proposal: any) => void}} ProposalRoute
 * @typedef {{state: any, resolve: (proposal: any) => ProposalRoute, book: import('./save.mjs').LogBook}} ProposalSession
 * book：当前存档的事件日志簿（kernel/save.mjs createLogBook），请求条目记进它的 doc_log。
 */

/** @type {ProposalSession | null} */
let session = null;

/**
 * 挂接时交入当前存档的 state 与"提案 → 处理节点"的查找（kernel/mount.mjs 那张卡接；kernel 组内用，不在 kernelApi）。
 * @param {ProposalSession | null} s
 */
export function installProposalSession(s) {
  session = s;
}

/**
 * kernelApi `submitProposal(proposal)`（§2.7 :612，仅 inputEdge；§2.6 处置第 3 件 :502）：不收 state。按挂接时交入的查找取处理节点，跑一笔事务。
 * 返回 {ok: true}；被拒时带回应句柄（proposal.reply）的返回 {ok: false, code}（入口函数据此写 ReplyResult 的 rejected 与拒收代号），
 * 没有句柄的（心跳推进请求）只回 {ok: false}。
 * @param {{request: number | string, reply?: unknown}} proposal
 * @returns {{ok: true} | {ok: false, code?: import('./types.d.ts').ErrorCode}}
 */
export function submitProposal(proposal) {
  if (!session) throw new Error('kernel/transaction.mjs: submitProposal before the kernel is mounted');
  const route = session.resolve(proposal);
  // 请求受理时先单独提交一笔，把这条请求条目记入 doc_log，再开始处理（卷二 §2.6 :503、卷二十七 R27-7.3 :668；块 2 第 2-4 张接入）。
  // 这一笔记在日志簿上、不在 state 里，下面这笔处理事务整笔回滚也不抹它：被拒的请求按请求编号留在输入序列里。
  const { reply: _reply, ...entry } = proposal;
  appendLogEntry(session.book, entry);
  const r = runTransaction(session.state, { node: route.node, file: route.file, request: proposal.request }, (st) => route.handler(st, proposal));
  if (r.ok) return r;
  return proposal.reply === undefined || proposal.reply === null ? { ok: false } : { ok: false, code: r.code };
}
