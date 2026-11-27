// 本机最小宿主（S1-4 草案 §3.1；npm start）：node:http 实现插件入口要的那几个宿主方法（router.post / router.get、res.set().send()、res.status()、
// 请求体读流），调 server-plugin/index.mjs#init，按挂载前缀分发。不依赖 express，不依赖 SillyTavern，只监听本机。它是宿主的替身，不算规则代码，没有导出。
// 参数取 tools/host/host.json；端口可由环境变量 PORT 覆盖（0 为系统分配），存档根可由环境变量 IF_SAVE_ROOT 覆盖（主会话补充约定）。
// 启动后在 stdout 打一行 JSON {"ready": "<前端页面地址>"}。
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { init } from '../../server-plugin/index.mjs';

const REPO = new URL('../../', import.meta.url);
const HOST = JSON.parse(readFileSync(new URL('tools/host/host.json', REPO), 'utf8'));
const CLIENT = JSON.parse(readFileSync(new URL('world/display/client-route.json', REPO), 'utf8'));
const NOT_FOUND = CLIENT.notFound;

/** @typedef {(req: any, res: any) => void} Handler */
/** @type {Map<string, Handler>} POST 路由：路径 → 处理函数 */
const posts = new Map();
/** @type {Array<{path: RegExp | string, fn: Handler}>} GET 路由 */
const gets = [];
const router = {
  /** @param {string} path @param {Handler} fn */
  post(path, fn) { posts.set(path, fn); },
  /** @param {RegExp | string} path @param {Handler} fn */
  get(path, fn) { gets.push({ path, fn }); },
};

/** 把 node 的响应包成插件要的形状（set 可链式，send 结束响应）。 @param {import('node:http').ServerResponse} raw */
function wrapRes(raw) {
  const res = {
    /** @param {number} code */
    status(code) { raw.statusCode = code; return res; },
    /** @param {string} name @param {string} value */
    set(name, value) { raw.setHeader(name, value); return res; },
    /** @param {string | Uint8Array} body */
    send(body) { raw.end(body); },
  };
  return res;
}

const saveRoot = process.env.IF_SAVE_ROOT ?? fileURLToPath(new URL(HOST.saveRoot, REPO));
await init(router, { saveRoot });

const server = createServer((req, raw) => {
  const url = String(req.url);
  if (!url.startsWith(`${HOST.mount}/`)) { raw.statusCode = NOT_FOUND; raw.end(); return; }
  const inner = url.slice(HOST.mount.length);
  const path = inner.split('?')[0];
  // 交给路由的请求：url 去掉挂载前缀（与 express Router 挂在前缀上时一致）；请求体不预解析，由插件读流。
  req.url = inner;
  const res = wrapRes(raw);
  const post = req.method === 'POST' ? posts.get(path) : undefined;
  const get = req.method === 'GET' ? gets.find((g) => (typeof g.path === 'string' ? g.path === path : g.path.test(path))) : undefined;
  const fn = post ?? get?.fn;
  if (fn === undefined) { raw.statusCode = NOT_FOUND; raw.end(); return; }
  fn(req, res);
});

const port = process.env.PORT === undefined ? HOST.port : Number(process.env.PORT);
server.listen(port, HOST.bind, () => {
  const addr = server.address();
  const bound = addr !== null && typeof addr === 'object' ? addr.port : port;
  process.stdout.write(`${JSON.stringify({ ready: `http://${HOST.bind}:${bound}${HOST.mount}/${CLIENT.mount}/` })}\n`);
});
