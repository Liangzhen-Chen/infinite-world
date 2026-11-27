// 浏览器菜单前端的静态路由（S1-4；草案 §3.1；卷二十九 R29-7.1 前端只做投影）：在宿主 router 上挂 GET /<mount>/...，把请求路径按白名单数据表
// world/display/client-route.json 映射成仓库相对路径，交装配层给的读能力取字节。只读，不写文件，不进 doc_data、state 与 saveDigest。
// 白名单外、路径不安全、文件不存在一律回 404，不报内核错误码（静态文件不是世界数据，不进 report）。
// 读盘不在本文件（rules 组不许 import node:fs，state-owners.json importMatrix.rows.rules；主会话 S1-4 补问甲）：读能力由 index.mjs 装配层交入。
// 过渡（主会话 Q1 甲）：白名单里的 i18n 两个文件让客户端查显示名，违背卷二十九:225，S2-U1 建信封后删这两行。

/** @typedef {{url: string, dir?: string, files?: string[]}} RouteRoot 一条白名单根：url 前缀 → 仓库目录 dir，或逐个列出的文件 files（按文件名对上） */
/** @typedef {{mount: string, index: string, notFound: number, roots: RouteRoot[], mime: Record<string, string>}} RouteDoc world/display/client-route.json（notFound 是不回文件时的 HTTP 状态码） */
/** @typedef {(relPath: string) => Uint8Array | null} ReadRepoFile 装配层交入的读能力：仓库相对路径 → 字节，不存在回 null */
/** @typedef {{url: string}} GetRequest */
/** @typedef {{status: (code: number) => GetResponse, set: (name: string, value: string) => GetResponse, send: (body: Uint8Array | string) => void}} GetResponse */
/** @typedef {{get: (path: RegExp, fn: (req: GetRequest, res: GetResponse) => void) => void}} GetRouter */

const SEP = '/';

/** 正则元字符转义（挂载名来自数据，拼进路由正则前转义）。 @param {string} s */
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 请求路径的安全核对（只做纯字符串判断）：拒反斜杠、百分号编码（白名单文件名都是不需编码的字符，有编码即视为绕过）、
 * 冒号（盘符）、以 / 起头（绝对路径）、空段与 . / .. 段。
 * @param {string} rest 挂载前缀之后的部分（不含查询串）
 */
function safeRest(rest) {
  if (/[\\%:\0]/.test(rest) || rest.startsWith(SEP)) return false;
  if (rest === '') return true;
  const segs = rest.split(SEP);
  return segs.every((s, i) => s !== '.' && s !== '..' && (s !== '' || i === segs.length - 1));
}

/**
 * 请求路径 → 仓库相对路径（白名单映射；映射后再核目标在该根的允许范围内）；不在白名单回 null。
 * @param {RouteDoc} doc @param {string} rest
 * @returns {string | null}
 */
function mapPath(doc, rest) {
  const want = rest === '' || rest.endsWith(SEP) ? rest + doc.index : rest;
  const roots = [...doc.roots].sort((a, b) => b.url.length - a.url.length);
  const root = roots.find((r) => want.startsWith(r.url));
  if (root === undefined) return null;
  const tail = want.slice(root.url.length);
  if (root.dir !== undefined) {
    const rel = root.dir + tail;
    return rel.startsWith(root.dir) && !rel.split(SEP).includes('..') ? rel : null;
  }
  const hit = (root.files ?? []).find((f) => f.slice(f.lastIndexOf(SEP) + 1) === tail);
  return hit ?? null;
}

/**
 * mountClient（S1-4；主会话裁定 Q4 进 assembly.calls）：在宿主 router 上挂 GET /<mount>/...，按白名单表回静态文件。
 * @param {GetRouter} router 宿主路由（与 createRouterCaps 收到的是同一个）
 * @param {RouteDoc} routeDoc world/display/client-route.json
 * @param {ReadRepoFile} readRepoFile 装配层的读能力（只收经白名单映射后的仓库相对路径）
 */
export function mountClient(router, routeDoc, readRepoFile) {
  const pattern = new RegExp(`^${SEP}${escapeRe(routeDoc.mount)}${SEP}`);
  router.get(pattern, (req, res) => {
    const raw = String(req.url);
    const cut = raw.search(/[?#]/);
    const path = cut < 0 ? raw : raw.slice(0, cut);
    const rest = path.replace(pattern, '');
    const rel = safeRest(rest) ? mapPath(routeDoc, rest) : null;
    const dot = rel === null ? -1 : rel.lastIndexOf('.');
    const mime = rel === null || dot < 0 || !Object.hasOwn(routeDoc.mime, rel.slice(dot)) ? null : routeDoc.mime[rel.slice(dot)];
    const bytes = rel === null || mime === null ? null : readRepoFile(rel);
    if (bytes === null) {
      res.status(routeDoc.notFound).send('');
      return;
    }
    res.set('content-type', String(mime)).send(bytes);
  });
}
