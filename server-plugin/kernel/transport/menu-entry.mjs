// 菜单请求的 kernel 入口（卷二 §2.9 第 0 条通道表 `menu` 行、"通路六环"第 1、2a 环、"各环的规矩"第 2 环、:1077 入口表 menu-entry 行；体检 K6-81 装配一侧）。
// 本文件做三件事：① mountMenuEntry(requestCap)：向 RequestCap 登记 `menu` 路由的入口函数（第 1 环；kernel 不 import inputEdge）；
// ② 入口函数的每一条返回路径恰好调一次 postReply（第 2a 环，成功、拒收、出错都算；漏回由 serveRequest 代投错误结果）；
// ③ 请求体当 unknown，只收对象；对象的分流（动作、错误上报、界面命令三种载荷）由处理函数做，处理函数由规则层与各卡经 installMenuDispatch 交入一次。
// 没有交入处理函数时，每个菜单请求都回 `rejected` 加 E-ACT-WRITER-NOT-READY（与块 5 写者未就绪同一做法），不静默吞、不假装成功。
// `schema:wire-up-menu-v1` 的字段表与 narrow 尚未建（world/schema/wire-v1.json 随 6-20、6-21），本文件不自造字段，只核"请求体是对象"。

import { KernelError } from '../errors.mjs';
import { T } from '../handles/markers.mjs';
import { postReply } from './reply-channel.mjs';

const ROUTE = T.code_enum.wire_route.menu;
const RESULT = T.code_enum.reply_result;
const CODE_NOT_READY = 'E-ACT-WRITER-NOT-READY';
const CODE_DUP = 'E-WRITER-DUPLICATE';
const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';

/** @type {null | ((body: Record<string, unknown>, handle: object) => unknown)} */
let dispatch = null;

/**
 * 交入菜单请求的处理函数（kernel 组内用，不在 kernelApi；与 installEventLog、installProposalSession 同一 install* 模式）。
 * 函数收收窄前的请求对象与 ReplyHandle，返回 ReplyResult（代号结构）；入口负责把它交给 postReply。只许交入一次。
 * @param {(body: Record<string, unknown>, handle: object) => unknown} fn
 * @returns {void}
 */
export function installMenuDispatch(fn) {
  if (typeof fn !== 'function') throw new KernelError(CODE_STRUCT, {}, 'installMenuDispatch: dispatcher must be a function');
  if (dispatch !== null) throw new KernelError(CODE_DUP, {}, 'installMenuDispatch: dispatcher already installed');
  dispatch = fn;
}

/** 测试与重新挂接用：清掉处理函数。 */
export function resetMenuDispatch() {
  dispatch = null;
}

/**
 * 菜单入口函数（第 1 环交给 RequestCap 的回调）。
 * @param {unknown} body 请求体（unknown） @param {object} handle ReplyHandle
 * @returns {Promise<void>}
 */
export async function menuEntry(body, handle) {
  const rejected = (code) => postReply(handle, { resultCode: RESULT.rejected, rejectCode: code });
  if (body === null || typeof body !== 'object' || Array.isArray(body)) { rejected(CODE_STRUCT); return; }
  if (dispatch === null) { rejected(CODE_NOT_READY); return; }
  postReply(handle, await dispatch(body, handle));
}

/**
 * kernelApi `mountMenuEntry(caps)`（只对 index.mjs 开放）：登记 `menu` 路由。
 * @param {{requestCap: {register: (route: string, entry: (body: unknown, handle: object) => unknown) => void}}} caps createRouterCaps 的返回值
 * @returns {void}
 */
export function mountMenuEntry(caps) {
  caps.requestCap.register(ROUTE, menuEntry);
}
