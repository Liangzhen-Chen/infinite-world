// S1-3b 宿主路由支撑（出题方 haiku-orca-test-s13b）。
// 只做两件事：起真 express 宿主（express.Router 交给 init(router, opts)，listen(0) 后经 fetch 发真请求）；
// 把产品输出（ReplyResult 的 JSON、save_export 的字节）解成可读形状。不 mock 任何内核、规则或入口。
// 约定来源：卷二 wire_route 四值（menu / input / save_export / save_import，卷二:972）；
// 挂载前缀与路由名按 draft-s1-3 §3.2 示例（app.use('/api/plugins/if', r)，POST menu / save_export / save_import）；
// 存档字节 = canonical({format:'if-save-v1', manifest, shards:{<摘要>: <片文本>}}) 的 UTF-8（rulings-s1-3-s2-0.md Q5 已采纳）；
// 存档动作载荷 = {payload:'act', save:'save'|'load', saveSlot}（rulings Q3 已采纳，存读档不进 act_ 目录）。
import { express } from './express.mjs';
import { cpSync } from 'node:fs';
import { once } from 'node:events';
import { testTempRoot } from '../accept/temp-root.mjs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO = fileURLToPath(new URL('../../', import.meta.url));
export const MOUNT = '/api/plugins/if';

/**
 * 把仓库的 server-plugin 与 world 复制到本函数新建的临时根下的 repo/（数据改动类用例只改副本，不改仓库）。
 * S12-2：临时根与复制目标在同一函数内建立，写入只落在临时根与常量相对路径。返回 {root, repo}，清理用 removeTempRoot(root)。
 */
export function copyRepo() {
  const root = testTempRoot('s13b-repo-');
  cpSync(join(REPO, 'server-plugin'), join(root, 'repo', 'server-plugin'), { recursive: true });
  cpSync(join(REPO, 'world'), join(root, 'repo', 'world'), { recursive: true });
  return { root, repo: join(root, 'repo') };
}

/**
 * 起宿主：express.Router 交给 init(router, {saveRoot})，挂到 MOUNT，listen(0)。
 * repoDir 缺省为本仓库；数据改动类用例传入临时副本目录。
 */
/** @param {{repoDir?: string, saveRoot?: string, plugin?: {init: Function}}} [opts] plugin 缺省按 repoDir 加载其 server-plugin/index.mjs。 */
export async function startHost(opts = {}) {
  const { repoDir = REPO, saveRoot } = opts;
  const url = pathToFileURL(join(repoDir, 'server-plugin', 'index.mjs')).href;
  const plugin = opts.plugin ?? (await import(url));
  const router = express.Router();
  const world = await plugin.init(router, { saveRoot });
  const app = express();
  app.use(express.json({ limit: '256mb' }));
  app.use(MOUNT, router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}${MOUNT}`;
  const close = () => new Promise((resolve) => {
    server.closeAllConnections?.();
    server.close(() => resolve(undefined));
  });
  return { base, world, close };
}

/** 发一条 POST 并把响应整理成 {status, wireBody, buf, text, json}。 */
export async function post(base, route, body) {
  const res = await fetch(`${base}/${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const text = buf.toString('utf8');
  let json = null;
  try { json = JSON.parse(text); } catch { json = null; }
  return { status: res.status, wireBody: res.headers.get('wire_body'), buf, text, json };
}

export const menu = (base, body) => post(base, 'menu', body);
/** 界面命令 view：纯读，panel 与 subject 可为 null。 */
// 线上 ui 变体字段 panel、subject 为可选字串（wire-v1.json），不发 null；schema 未声明 args，不发。
export const view = (base, subject = null) => menu(base, { payload: 'ui', command: 'view', ...(subject === null ? {} : { subject }) });
/** 动作载荷：act 为动作代号，slots 为候选编号，numbers 为整数参数。 */
export const act = (base, actId, slots = {}, numbers = {}) => menu(base, { payload: 'act', act: actId, slots, numbers });
export const saveAt = (base, slot) => menu(base, { payload: 'act', save: 'save', saveSlot: slot });
export const loadAt = (base, slot) => menu(base, { payload: 'act', save: 'load', saveSlot: slot });
export const exportAt = (base, slot) => post(base, 'save_export', { slot });
export const importAt = (base, slot, buf) => post(base, 'save_import', { slot, bytes: Buffer.from(buf).toString('base64') });

/** 解存档字节为 {format, manifest, shards}。 */
export function unpack(buf) {
  return JSON.parse(Buffer.from(buf).toString('utf8'));
}

/** 在存档各片（片文本按 JSON 解析）里找满足 pred 的对象；解析失败的片跳过。 */
export function findInShards(pkg, pred) {
  const found = [];
  const walk = (node) => {
    if (node && typeof node === 'object') {
      if (pred(node)) found.push(node);
      for (const v of Object.values(node)) walk(v);
    }
  };
  for (const text of Object.values(pkg.shards)) {
    try { walk(JSON.parse(text)); } catch { /* 非 JSON 片忽略 */ }
  }
  return found;
}

/** 存档字节里改一片的一个字符（产生摘要不符的导入包）。 */
export function tamperShardBytes(buf) {
  const pkg = unpack(buf);
  const key = Object.keys(pkg.shards)[0];
  const text = pkg.shards[key];
  const i = text.search(/[0-9a-zA-Z]/);
  const c = text[i];
  pkg.shards[key] = text.slice(0, i) + (c === '0' ? '1' : c === 'x' ? 'y' : 'x') + text.slice(i + 1);
  return Buffer.from(JSON.stringify(pkg), 'utf8');
}
