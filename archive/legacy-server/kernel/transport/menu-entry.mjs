// 菜单请求的 kernel 入口（卷二 §2.9 第 0 条通道表 `menu` 行、"通路六环"第 1、2a 环、"各环的规矩"第 2 环、:1077 入口表 menu-entry 行；体检 K6-81 装配一侧）。
// 本文件做三件事：① mountMenuEntry(requestCap)：向 RequestCap 登记 `menu` 路由的入口函数（第 1 环；kernel 不 import inputEdge）；
// ② 入口函数的每一条返回路径恰好调一次 postReply（第 2a 环，成功、拒收、出错都算；漏回由 serveRequest 代投错误结果）；
// ③ 请求体当 unknown，只收对象；对象的分流（动作、错误上报、界面命令三种载荷）由处理函数做，处理函数由规则层与各卡经 installMenuDispatch 交入一次。
// 生产装配里 mountMenuEntry 交入 routeMenu（下面）；只有没交入处理函数时（如测试里 resetMenuDispatch 之后），每个菜单请求才回 `rejected` 加 E-ACT-WRITER-NOT-READY（与块 5 写者未就绪同一做法），不静默吞、不假装成功。
// `schema:wire-up-menu-v1` 的字段表与 narrow 尚未建（world/schema/wire-v1.json 随 6-20、6-21），本文件不自造字段，只核"请求体是对象"。

import { KernelError } from '../errors.mjs';
import { T } from '../handles/markers.mjs';
import { postReply } from './reply-channel.mjs';
import { report } from '../report.mjs';
import { HandleError, CODE_RE } from '../handles/vocab-handle.mjs';

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

// ---------- 生产处理函数：三种载荷的分流（卷二 :965 通道表 menu 行；:999 各环的规矩第 2 环；:1001 第 1 条） ----------
// 载荷判别键：`schema:wire-up-menu-v1` 字段表（world/schema/wire-v1.json，卷二 :972）未建，卷文只点名了界面命令的 `command`（卷二十九 :319）；
// 错误上报与动作的判别键卷文没写字段名，这里按卷文载荷名取 `errorCode`、`action`，建 wire-v1.json 时以它为准（见反思）。
const PAYLOAD = Object.freeze({ errorReport: 'errorCode', uiCommand: 'command', action: 'action' });
const CODE_UNKNOWN = 'E-ACT-UNKNOWN';

// 错误上报（卷二 :999）：把错误码与数值字段交 report，回只含"已收到"的结果；码不登记或字段不合代号文法即拒收。
function errorReport(body) {
  try {
    report(body[PAYLOAD.errorReport], body.fields === undefined ? {} : body.fields);
  } catch (e) {
    if (e instanceof HandleError) return { resultCode: RESULT.rejected, rejectCode: CODE_STRUCT };
    throw e;
  }
  return { resultCode: RESULT.received };
}

// 界面命令（卷二十九 §2.7）：命令枚举 ui_command 与面板投影（卷二十九 §2.1、§2.7）未建，没有任何命令可认，一律 E-ACT-UNKNOWN 拒收，不假装受理。
const uiCommand = () => ({ resultCode: RESULT.rejected, rejectCode: CODE_UNKNOWN });

// 动作：动作处理（意图管线、存档读档动作行 world/actions，随 6-14、6-16、6-21）未建，没有任何动作可认，同样 E-ACT-UNKNOWN 拒收。
// 数值参数 `slots` 是 map<槽位代号, 整数>（卷二 :965）：形状不符走 E-ACT-SLOT（李白裁定 5e01c00d），不与"动作代号不在目录"的 E-ACT-UNKNOWN 混用。
// 只按动作代号与槽位种类分发（卷九 R9-6.1），不读 errorCode、fields；载荷判别次序动作在先，带动作代号的对象不会因多带 errorCode 被当成错误上报。
const CODE_SLOT = 'E-ACT-SLOT';
const slotsOk = (s) => s === undefined || (s !== null && typeof s === 'object' && !Array.isArray(s)
  && Object.entries(s).every(([k, v]) => CODE_RE.test(k) && Number.isInteger(v)));
const action = (body) => ({ resultCode: RESULT.rejected, rejectCode: slotsOk(body.slots) ? CODE_UNKNOWN : CODE_SLOT });

// 载荷种类 → 处理函数：新增一种载荷或接入真实处理只改这张表。
const HANDLERS = Object.freeze([
  [PAYLOAD.action, action],
  [PAYLOAD.uiCommand, uiCommand],
  [PAYLOAD.errorReport, errorReport],
]);

/**
 * 菜单处理函数：按判别键分流三种载荷；不属于任何一种的对象（含空对象）拒收 E-DIM-STRUCT-FIELD。
 * @param {Record<string, unknown>} body
 * @returns {{resultCode: string, rejectCode?: string}}
 */
export function routeMenu(body) {
  for (const [key, handle] of HANDLERS) if (Object.hasOwn(body, key)) return handle(body);
  return { resultCode: RESULT.rejected, rejectCode: CODE_STRUCT };
}

/**
 * kernelApi `mountMenuEntry(caps)`（只对 index.mjs 开放）：登记 `menu` 路由，并交入生产处理函数 routeMenu（装配入口；没有处理函数时才回 E-ACT-WRITER-NOT-READY）。
 * @param {{requestCap: {register: (route: string, entry: (body: unknown, handle: object) => unknown) => void}}} caps createRouterCaps 的返回值
 * @returns {void}
 */
export function mountMenuEntry(caps) {
  caps.requestCap.register(ROUTE, menuEntry);
  installMenuDispatch(routeMenu);
}
