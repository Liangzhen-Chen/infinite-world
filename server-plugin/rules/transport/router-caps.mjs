// 宿主路由能力（卷二 :972–:983、:993、:1010、:1017、:1050；S1-3b）：RequestCap、ReplyCap 与 ReplyHandle，回应通道 postReply 并入本文件。
// 落位勘误（主会话裁定，S1-3 接口草案 §1 kernel 落位 A）：卷二 kernel/transport/router-caps.mjs、reply-channel.mjs → rules/transport/router-caps.mjs（kernel 15/15）。
// 阶段性缺环（裁定 Q4）：outputGate（第 3–5 环）未迁回，postReply 直接经本文件的 send 发 ReplyResult（无文字，不需筛查）；迁回时 postReply 改交 onReply 订阅者，入口文件不动。
// 句柄表与 responseId 计数都是 createRouterCaps 的闭包局部，不放模块顶层。

import { KernelError, reportError, codeOf } from '../../kernel/errors.mjs';
import { T } from '../../kernel/handles.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';
import { canonical } from '../../kernel/storage.mjs';

/** @typedef {Readonly<object>} ReplyHandle 每请求一个、一次一用的不透明句柄（卷二 :993） */
/** @typedef {{result: string} & Record<string, unknown>} ReplyResult 只含代号、数值与实体 id（schema:reply-result-v1） */
/** @typedef {(raw: unknown, reply: ReplyHandle) => unknown} EntryHandler 入口处理函数：收请求体原文（unknown）与句柄 */
/** @typedef {{body?: unknown, setEncoding: (enc: string) => void, on: (event: string, fn: (chunk?: unknown) => void) => void}} HostRequest 宿主请求（只用到的部分） */
/** @typedef {{set: (name: string, value: string) => HostResponse, send: (body: string) => void}} HostResponse 宿主响应（只用到的部分） */
/** @typedef {{post: (path: string, fn: (req: HostRequest, res: HostResponse) => void) => void}} HostRouter 宿主路由（只用到的部分） */
/** @typedef {{discriminator?: string, variants?: Record<string, Record<string, unknown>>} & Record<string, unknown>} WireSchema */
/** @typedef {{enums: Record<string, string[]>, exportFormat: string, schemas: Record<string, WireSchema>}} WireDoc world/schema/wire-v1.json */

/** 宿主请求体原文：宿主已解析过（req.body 已有）即按 JSON 还原，否则读流。 @param {HostRequest} req @returns {Promise<string>} */
function readBody(req) {
  if (req.body !== undefined) return Promise.resolve(JSON.stringify(req.body));
  return new Promise((resolve, reject) => {
    let text = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { text += String(chunk); });
    req.on('end', () => resolve(text));
    req.on('error', reject);
  });
}

/**
 * 按 world/schema/wire-v1.json 收窄请求体（卷二 :983 上下行 schema 只有一份数据源）：JSON 解析 → 有判别字段的取对应变体 → kernel/validate/types.mjs#checkValue 核字段。
 * 枚举族取 wire.enums（数据），卷二 §1.9 的代码内封闭枚举由 checkValue 自查 CODE_ENUMS。不合一律 E-WIRE-ENVELOPE。
 * 收窄后的形状由调用方按所用 schema 声明（B）。
 * @template {object} B
 * @param {WireDoc} wire 世界数据里的 wire 文档 @param {string} name schema 名 @param {unknown} raw 请求体原文 @returns {B}
 */
function narrow(wire, name, raw) {
  const fail = (/** @type {string} */ why) => new KernelError('E-WIRE-ENVELOPE', {}, `${name}: ${why}`);
  let body;
  try { body = JSON.parse(String(raw)); } catch { throw fail('body is not JSON'); }
  const schema = wire.schemas[name];
  const tag = schema.discriminator === undefined ? undefined : body !== null && typeof body === 'object' ? body[schema.discriminator] : undefined;
  const def = schema.discriminator === undefined ? schema : typeof tag === 'string' && Object.hasOwn(schema.variants, tag) ? schema.variants[tag] : null;
  if (def === null) throw fail('unknown payload variant');
  // checkValue 按「值 → 所属族」查枚举（同词表族的查法），故 wire.enums 各族的值须互不相同，重了是登记错。
  const index = new Map();
  for (const [family, values] of Object.entries(wire.enums)) {
    for (const v of values) {
      if (index.has(v)) throw new KernelError('E-DIM-ID-DUPLICATE', {}, `wire enum value ${v} appears in two families`);
      index.set(v, { family });
    }
  }
  const env = { vocab: { families: new Set(Object.keys(wire.enums)), index } };
  /** @type {unknown[]} */
  const errs = [];
  checkValue(def, body, env, { path: '' }, (/** @type {unknown} */ e) => errs.push(e));
  if (errs.length > 0) throw fail(JSON.stringify(errs[0]));
  return body;
}

/**
 * createRouterCaps(router)（卷二 :1050；装配文件把宿主 router 原样交入）：返回 {requestCap, replyCap}。
 * requestCap.on(route, handler) 在 POST /<route> 上挂入口（route 只收 wire_route 枚举值）；requestCap.narrow 按 wire schema 收窄。
 * replyCap.send(reply, body, wireBody) 发一次响应（响应头 wire_body）；replyCap.postReply(reply, result) 发 ReplyResult（wire_body=envelope，发 responseId）。
 * 每个句柄恰用一次，二次即 E-WIRE-REPLY；入口处理完仍未回应，本层报 E-WIRE-REPLY 并补回一条 error（卷二 :1017）。
 * @param {HostRouter} router 宿主（SillyTavern）交入的 express Router
 */
export function createRouterCaps(router) {
  /** @type {Map<ReplyHandle, HostResponse>} 未回应的句柄 → 宿主响应对象 */
  const pending = new Map();
  let responseId = 0;
  const R = T.code_enum.reply_result;
  const BODY = T.code_enum.wire_body;

  /** @param {ReplyHandle} reply */
  const take = (reply) => {
    const res = pending.get(reply);
    if (res === undefined) throw new KernelError('E-WIRE-REPLY', {}, 'ReplyHandle already used or unknown');
    pending.delete(reply);
    return res;
  };
  /** @param {ReplyHandle} reply @param {string} body @param {string} wireBody */
  const send = (reply, body, wireBody) => {
    if (!BODY.is(wireBody)) throw new KernelError('E-WIRE-ENVELOPE', {}, 'wire_body must be a wire_body code');
    take(reply).set('wire_body', wireBody).send(body);
  };
  /** @param {ReplyHandle} reply @param {ReplyResult} result */
  const postReply = (reply, result) => {
    if (result === null || typeof result !== 'object' || !R.is(result.result)) throw new KernelError('E-WIRE-ENVELOPE', {}, 'ReplyResult.result must be a reply_result code');
    const res = take(reply);
    responseId += 1;
    res.set('wire_body', BODY.envelope).set('responseId', String(responseId)).send(canonical(result));
  };
  /**
   * 入口抛出的错误（卷二:1017 回应必只含错误代号）：带登记码的报 report 并回 error + 该码；不带登记码的按「处理结束时还没有回应」同一情形，
   * 报并回 error + E-WIRE-REPLY（与下面未回应补回同码，不自造码）。
   * @param {unknown} e @returns {ReplyResult}
   */
  const failed = (e) => ({ result: R.error, code: reportError(codeOf(e) === null ? new KernelError('E-WIRE-REPLY', {}, 'entry handler threw without a registered code') : e) });

  /** @param {EntryHandler} handler @param {HostRequest} req @param {HostResponse} res */
  const run = async (handler, req, res) => {
    const reply = Object.freeze({});
    pending.set(reply, res);
    try {
      await handler(await readBody(req), reply);
    } catch (e) {
      if (pending.has(reply)) postReply(reply, failed(e));
      else if (codeOf(e) !== null) reportError(e);
    }
    if (pending.has(reply)) {
      postReply(reply, { result: R.error, code: reportError(new KernelError('E-WIRE-REPLY', {}, 'entry handler ended without a reply')) });
    }
  };

  const requestCap = Object.freeze({
    /** @param {string} route @param {EntryHandler} handler */
    on(route, handler) {
      if (!T.code_enum.wire_route.is(route)) throw new KernelError('E-WIRE-ENVELOPE', {}, 'route must be a wire_route code');
      router.post(`/${route}`, (req, res) => { run(handler, req, res); });
    },
    narrow,
  });
  const replyCap = Object.freeze({ send, postReply });
  return { requestCap, replyCap };
}
