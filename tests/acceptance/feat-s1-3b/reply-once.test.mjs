// S1-3b 回应通道黑盒验收（卷二:993 ReplyHandle 每请求一个、一次一用；卷二:1010 入口每条返回路径恰调一次 postReply；卷二:1114 收窄失败走 E-WIRE-ENVELOPE）。
// 出题方：Claude Haiku 5.5（haiku-orca-test-s13b）。draft-s1-3 §6 第 7 条。
// 四条路径：正常（ok）、拒收（rejected）、处理抛错（宿主替请求回一条，恰一次）、错误上报（menu 载荷 payload:report → received）。
// 「二次用同句柄」需要拿到句柄本身，故用真 express.Router + rules/transport/router-caps.mjs 的 createRouterCaps / postReply 直接组装，
// 不 mock 任何东西；探针路由只挂在该临时 Router 上。模块与导出名见 draft-s1-3 §1 第 6、15 行（postReply 与 createRouterCaps 同文件）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { express } from '../../support/express.mjs';
import { once } from 'node:events';
import { startHost, menu } from '../../support/wire-host.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROUTER_CAPS = new URL('../../../server-plugin/rules/transport/router-caps.mjs', import.meta.url);

// 起一个只含探针 menu 路由的真 Router，handler 由各用例给出。返回 {base, close}。
async function probeHost(handler) {
  const { createRouterCaps } = await import(ROUTER_CAPS.href);
  const router = express.Router();
  const caps = createRouterCaps(router);
  caps.requestCap.on('menu', (body, handle) => handler(body, handle, caps.replyCap));
  const app = express();
  app.use(express.json());
  app.use('/probe', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/probe`;
  return { base, close: () => new Promise((resolve) => { server.closeAllConnections?.(); server.close(() => resolve(undefined)); }) };
}

async function postMenu(base, body) {
  const res = await fetch(`${base}/menu`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
}

test('正常路径：处理函数经 postReply 恰回应一次，响应为 ok', async (t) => {
  let calls = 0;
  const h = await probeHost((_body, handle, replyCap) => {
    calls += 1;
    replyCap.postReply(handle, { result: 'ok' });
  });
  t.after(() => h.close());
  const r = await postMenu(h.base, { payload: 'ui', command: 'view' });
  assert.equal(r.status, 200, '正常回应应 200');
  assert.equal(r.json?.result, 'ok', '正常路径的响应应为 ok');
  assert.equal(calls, 1, '处理函数应只运行一次');
});

test('拒收路径：处理函数经 postReply 恰回应一次一个 rejected（带代号）', async (t) => {
  const h = await probeHost((_body, handle, replyCap) => {
    replyCap.postReply(handle, { result: 'rejected', code: 'E-ACT-SLOT' });
  });
  t.after(() => h.close());
  const r = await postMenu(h.base, { payload: 'ui', command: 'view' });
  assert.equal(r.json?.result, 'rejected', '拒收路径的响应应为 rejected');
  assert.equal(r.json?.code, 'E-ACT-SLOT', '拒收代号应原样带出');
});

test('处理抛错路径：处理函数抛错时宿主替它恰回应一次（不挂起，响应带错误结果）', async (t) => {
  const h = await probeHost(() => {
    throw new Error('probe-throws');
  });
  t.after(() => h.close());
  // 探针处理函数从未调用 postReply；能拿到一个 HTTP 响应即说明宿主补了唯一一次回应（卷二:1010 末条）。
  const r = await postMenu(h.base, { payload: 'ui', command: 'view' });
  assert.ok(r.text.length > 0, '抛错后应有且仅有一个带内容的 HTTP 响应');
  assert.ok(r.json !== null, '抛错后的响应应为 JSON（ReplyResult 形状）');
  // 出错路径：宿主替处理函数回 reply_result 的 error 并带错误代号（卷二:1010 末条；reply_result 闭集含 error）。
  assert.equal(r.json.result, 'error', '抛错后宿主补的回应应为 error（卷二:1010 出错路径）');
  assert.equal(typeof r.json.code, 'string', '抛错后的回应应带错误代号，实际正文：' + r.text);
});

test('错误上报路径：menu 载荷 payload:report 回 received', async (t) => {
  const root = testTempRoot('s13b-reply-report-');
  const h = await startHost({ saveRoot: root });
  t.after(async () => { await h.close(); removeTempRoot(root); });
  const r = await menu(h.base, { payload: 'report', code: 'E-ACT-SLOT', fields: {} });
  assert.equal(r.json?.result, 'received', '错误上报的回应应为 received');
});

test('同一句柄二次回应：第二次 postReply 报 E-WIRE-REPLY', async (t) => {
  let secondError = null;
  const h = await probeHost((_body, handle, replyCap) => {
    replyCap.postReply(handle, { result: 'ok' });
    try {
      replyCap.postReply(handle, { result: 'ok' });
    } catch (e) {
      secondError = e;
    }
  });
  t.after(() => h.close());
  const r = await postMenu(h.base, { payload: 'ui', command: 'view' });
  assert.equal(r.json?.result, 'ok', '第一次回应应照常送达');
  assert.ok(secondError, '同句柄二次 postReply 应抛错');
  assert.ok(
    secondError.code === 'E-WIRE-REPLY' || String(secondError.message).includes('E-WIRE-REPLY'),
    `二次回应应报 E-WIRE-REPLY，实际：${secondError && (secondError.code || secondError.message)}`,
  );
});
