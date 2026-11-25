// 宿主能力对象：RequestCap 与 ReplyCap（卷二 §2.9 第 0 条"宿主能力不经全局访问，只经能力对象"、回应通道"通路六环"第 1、5、5s、6 环；体检 K6-81 装配一侧）。
// 构造者是本文件（服务端唯一接触 SillyTavern 传进来的 router 的文件）；装配文件 index.mjs 调 createRouterCaps(router)，把两个能力对象以参数交给各挂接函数。
// - RequestCap.register(route, entry)：route 是封闭枚举 wire_route 之一（menu、input、save_export、save_import），每条路由只登记一次；
//   请求到达时本文件发 ReplyHandle（包着宿主响应对象），经回应通道 serveRequest 调 entry(body, handle)；entry 每条返回路径恰好回应一次，
//   没回应由 serveRequest 代投错误结果（E-WIRE-REPLY，卷二"违例"）。路由路径只有 "/" 加路由代号。
// - ReplyCap.send(handle, body, wireBody)：句柄一次一用（claimReplySend）；响应头 wire_body 取封闭枚举 wire_body（envelope、bytes），默认 envelope；
//   不读也不改 body。postReply 与 send 的调用者许可是静态登记（卷二表第 2、5 环文件），不在运行期按调用栈判。
// 不读墙钟、不用随机数；宿主响应对象只经 replyHandleHost 取回，不对外开放。

import { KernelError, reportError } from '../errors.mjs';
import { T } from '../handles/markers.mjs';
import { newReplyHandle, serveRequest, claimReplySend, replyHandleHost } from './reply-channel.mjs';

const ROUTES = T.code_enum.wire_route;
const WIRE_BODY = T.code_enum.wire_body;
const HEADER = 'wire_body';
const METHOD = 'post';
const PATH_PREFIX = '/';
const CODE_WIRE = 'E-WIRE-REPLY';
const CODE_DUP = 'E-WRITER-DUPLICATE';
const CODE_STRUCT = 'E-DIM-STRUCT-FIELD';

/**
 * kernelApi `createRouterCaps(router)`（只对 index.mjs 开放）。router 须有 post(path, handler)；宿主响应对象须有 setHeader 与 end。
 * @param {{post: (path: string, handler: (req: any, res: any) => unknown) => unknown}} router SillyTavern 以参数交给插件的 router
 * @returns {Readonly<{
 *  requestCap: Readonly<{register: (route: string, entry: (body: unknown, handle: object) => unknown) => void}>,
 *  replyCap: Readonly<{send: (handle: object, body: string | Uint8Array, wireBody?: string) => void}>
 * }>}
 */
export function createRouterCaps(router) {
  if (router === null || typeof router !== 'object' || typeof router[METHOD] !== 'function') throw new KernelError(CODE_STRUCT, {}, 'createRouterCaps: router needs post(path, handler)');
  const registered = new Set();

  const requestCap = Object.freeze({
    register(route, entry) {
      if (typeof route !== 'string' || !Object.values(ROUTES).includes(route)) throw new KernelError(CODE_STRUCT, {}, `RequestCap.register: route ${JSON.stringify(route)} is not in wire_route`);
      if (typeof entry !== 'function') throw new KernelError(CODE_STRUCT, {}, `RequestCap.register ${route}: entry must be a function`);
      if (registered.has(route)) throw new KernelError(CODE_DUP, {}, `RequestCap.register: route ${route} already registered`);
      registered.add(route);
      router[METHOD](PATH_PREFIX + route, async (req, res) => {
        const handle = newReplyHandle(res);
        try {
          await serveRequest(handle, (h) => entry(req.body, h));
        } catch (err) {
          // 没有登记错误码的异常：serveRequest 已代投错误结果后原样往上抛；这里只记下，不让异常逃出宿主的请求处理（宿主响应已由通道回应）。
          reportError(err);
        }
      });
    },
  });

  const replyCap = Object.freeze({
    send(handle, body, wireBody = WIRE_BODY.envelope) {
      if (typeof body !== 'string' && !(body instanceof Uint8Array)) throw new KernelError(CODE_WIRE, {}, 'ReplyCap.send: body must be a string or bytes');
      if (!Object.values(WIRE_BODY).includes(wireBody)) throw new KernelError(CODE_WIRE, {}, `ReplyCap.send: wire_body ${JSON.stringify(wireBody)} not in the closed enum`);
      claimReplySend(handle);
      const res = replyHandleHost(handle);
      if (res === null || typeof res !== 'object' || typeof res.setHeader !== 'function' || typeof res.end !== 'function') throw new KernelError(CODE_WIRE, {}, 'ReplyCap.send: host response has no setHeader and end');
      res.setHeader(HEADER, wireBody);
      res.end(body);
    },
  });

  return Object.freeze({ requestCap, replyCap });
}
