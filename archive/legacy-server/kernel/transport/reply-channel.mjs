// 回应通道（卷二 §2.9 第 0 条"回应通道（唯一定义）"、"三样东西"、"通路六环"第 2、3 环、"违例"E-WIRE-REPLY；体检 K6-81）。
// 只收代号结构的处理结果 ReplyResult（没有任何文字字段），经登记回调交给 outputGate；kernel 自己看不到 Text，也不 import outputGate。
// 本文件做四件事：① 发 ReplyHandle（一次一用的不透明句柄）并记每个句柄 postReply 与 send 各用过几次；
// ② postReply：核对结果形状、核对句柄没用过、发单调整数 responseId、调那一个订阅函数；③ onReply：只许登记一个订阅函数；
// ④ serve：带句柄的请求处理函数的收口——每条返回路径（成功、退回菜单、拒收、出错）恰好一次 postReply，处理结束仍无回应由本函数代投错误结果。
// 不读墙钟、不用随机数（responseId 只由本通道内计数）。router-caps（6-19）用 newReplyHandle 发句柄、用 claimSend 在 ReplyCap.send 里核对；
// postReply 的调用者与 ReplyCap.send 的调用者按卷二表只许四个与两个文件，那一侧的装配期核对随 6-19、6-20。

import { KernelError, codeOf, reportError } from '../errors.mjs';
import { CODE_RE } from '../handles/vocab-handle.mjs';
import { T } from '../handles/markers.mjs';
import { REGISTERED_CODES } from '../error-codes.mjs';

const RESULT = T.code_enum.reply_result;
const WIRE = 'E-WIRE-REPLY';
// 结果代号里要带拒收代号的两个（卷二"三样东西"：拒收代号是 ErrorCode；error 是"只含错误代号"的结果）。
const NEEDS_CODE = new Set([RESULT.rejected, RESULT.error]);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * 核对 ReplyResult 里没有文字：叶子只许 null、布尔、有限数、代号文法的串或登记错误码；不合即 E-WIRE-REPLY。
 * @param {unknown} v
 * @param {string} path
 */
function assertNoText(v, path) {
  if (v === null || typeof v === 'boolean') return;
  if (typeof v === 'number') { if (!Number.isFinite(v)) throw new KernelError(WIRE, {}, `${path}: non-finite`); return; }
  if (typeof v === 'string') { if (!CODE_RE.test(v) && !REGISTERED_CODES.has(v)) throw new KernelError(WIRE, {}, `${path}: text in ReplyResult`); return; }
  if (Array.isArray(v)) { v.forEach((x, i) => assertNoText(x, `${path}[${i}]`)); return; }
  if (isObj(v)) { for (const k of Object.keys(v)) assertNoText(v[k], `${path}.${k}`); return; }
  throw new KernelError(WIRE, {}, `${path}: unsupported value`);
}

/**
 * ReplyResult 的形状核对：resultCode 是封闭枚举 reply_result 的值；rejected、error 必带登记过的 rejectCode，其余结果代号不得带；
 * 其余字段只许代号、数值与 id（assertNoText）。
 * @param {unknown} r
 */
export function checkReplyResult(r) {
  if (!isObj(r)) throw new KernelError(WIRE, {}, 'ReplyResult must be an object');
  if (typeof r.resultCode !== 'string' || !Object.values(RESULT).includes(r.resultCode)) throw new KernelError(WIRE, {}, 'resultCode not in reply_result');
  const has = r.rejectCode !== undefined && r.rejectCode !== null;
  if (NEEDS_CODE.has(r.resultCode) !== has) throw new KernelError(WIRE, {}, 'rejectCode present iff resultCode is rejected or error');
  if (has && !REGISTERED_CODES.has(r.rejectCode)) throw new KernelError(WIRE, {}, 'rejectCode is not a registered ErrorCode');
  assertNoText(r, 'result');
}

/**
 * 造一条回应通道。装配文件用本模块默认的那一条（下面的 postReply、onReply 等）；测试各造自己的，互不影响。
 * @returns {{
 *  newReplyHandle: (host: unknown) => object, hostOf: (handle: object) => unknown, claimSend: (handle: object) => void,
 *  postReply: (handle: object, result: unknown) => unknown, onReply: (handler: (handle: object, result: object, responseId: number) => unknown) => void,
 *  serve: (handle: object, entry: (handle: object) => unknown) => Promise<void>, hasSubscriber: () => boolean
 * }}
 */
export function createReplyChannel() {
  /** @type {WeakMap<object, {host: unknown, posted: boolean, sent: boolean}>} */
  const handles = new WeakMap();
  /** @type {null | ((handle: object, result: object, responseId: number) => unknown)} */
  let subscriber = null;
  let lastResponseId = 0;

  const entryOf = (handle) => {
    const e = isObj(handle) ? handles.get(handle) : undefined;
    if (e === undefined) throw new KernelError(WIRE, {}, 'not a ReplyHandle');
    return e;
  };

  function newReplyHandle(host) {
    const handle = Object.freeze({});
    handles.set(handle, { host, posted: false, sent: false });
    return handle;
  }

  /** 装配边的 router-caps 取回包着的宿主响应对象（不开放给别处；一次一用的核对在 postReply 与 claimSend）。 */
  const hostOf = (handle) => entryOf(handle).host;

  /** ReplyCap.send 的一次一用核对：同一句柄 send 第二次即 E-WIRE-REPLY。 */
  function claimSend(handle) {
    const e = entryOf(handle);
    if (e.sent) throw new KernelError(WIRE, {}, 'ReplyHandle already sent');
    e.sent = true;
  }

  function onReply(handler) {
    if (typeof handler !== 'function') throw new KernelError(WIRE, {}, 'onReply needs a function');
    if (subscriber !== null) throw new KernelError(WIRE, {}, 'onReply registered twice');
    subscriber = handler;
  }

  function postReply(handle, result) {
    const e = entryOf(handle);
    if (subscriber === null) throw new KernelError(WIRE, {}, 'no onReply subscriber');
    if (e.posted) throw new KernelError(WIRE, {}, 'ReplyHandle already posted');
    // save_export 一路成功时只 send、不调 postReply（卷二 :967）；"一路两样各一次"是违例（:969），所以已 send 过的句柄不许再 postReply。
    if (e.sent) throw new KernelError(WIRE, {}, 'ReplyHandle already sent; save_export answers with send or postReply, not both');
    checkReplyResult(result);
    e.posted = true;
    lastResponseId += 1;
    return subscriber(handle, Object.freeze(structuredClone(result)), lastResponseId);
  }

  async function serve(handle, entry) {
    const e = entryOf(handle);
    let failure = null;
    try { await entry(handle); } catch (err) { failure = err; }
    if (failure !== null) {
      // 入口自己抛的错（含它第二次 postReply 被拒）：错误码照 report 记下；没有登记码的错误原样往上抛，不吞。
      const code = codeOf(failure);
      if (code === null) { if (!e.posted && !e.sent) await postError(handle, WIRE); throw failure; }
      reportError(failure);
      if (!e.posted && !e.sent) await postError(handle, code);
      return;
    }
    // 已回应 = postReply 过或 ReplyCap.send 过（save_export 成功一路只 send，卷二 :967）。
    if (!e.posted && !e.sent) {
      reportError(new KernelError(WIRE, {}, 'request finished without a reply'));
      await postError(handle, WIRE);
    }
  }

  const postError = async (handle, code) => postReply(handle, { resultCode: RESULT.error, rejectCode: code });

  return { newReplyHandle, hostOf, claimSend, postReply, onReply, serve, hasSubscriber: () => subscriber !== null };
}

const DEFAULT = createReplyChannel();

/** kernelApi `postReply(reply, result)`（卷二 :571 一带；只对 input/http-entry.mjs 开放，kernel 组内的入口文件直接 import 本函数）。 */
export const postReply = DEFAULT.postReply;
/** kernelApi `onReply(handler)`（只对 output-gate/reply-composer.mjs 开放；装配时恰登记一次）。 */
export const onReply = DEFAULT.onReply;
/** 句柄由 router-caps 在请求到达时发（kernel 组内）。 */
export const newReplyHandle = DEFAULT.newReplyHandle;
export const serveRequest = DEFAULT.serve;
export const claimReplySend = DEFAULT.claimSend;
export const replyHandleHost = DEFAULT.hostOf;
