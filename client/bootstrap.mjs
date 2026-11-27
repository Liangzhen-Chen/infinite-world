// 客户端唯一引用宿主全局的文件（卷二:1035；S1-4 主会话裁定 Q6 乙，审卡核）：把 fetch、document、文件下载与选取包成能力对象交给 app.mjs。
// 上行路径是相对路径（layout.json 的 routes，如 ../menu），所以不写死挂载前缀。

import { mount } from './app.mjs';

const JSON_TYPE = 'application/json';
const WIRE_BODY = 'wire_body';
const utf8 = new TextDecoder();

const net = {
  /** @param {string} route @param {unknown} body */
  async post(route, body) {
    const r = await fetch(route, { method: 'POST', headers: { 'content-type': JSON_TYPE }, body: JSON.stringify(body) });
    return { wireBody: r.headers.get(WIRE_BODY), bytes: new Uint8Array(await r.arrayBuffer()) };
  },
  /** @param {string} path */
  async getJson(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
  /** @param {Uint8Array} bytes */
  decode(bytes) {
    return utf8.decode(bytes);
  },
};

const dom = {
  root: () => document.body,
  /** @param {string} tag */
  el: (tag) => document.createElement(tag),
  /** @param {string} text */
  setTitle(text) { document.title = text; },
};

const files = {
  /** @param {string} name @param {Uint8Array} bytes */
  download(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: JSON_TYPE }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  },
  /** 选一个文件，读成 base64（save_import 的 bytes 字段）；取消即 null。 @returns {Promise<string | null>} */
  pick() {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.addEventListener('change', async () => {
        const f = input.files?.[0];
        if (!f) { resolve(null); return; }
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = '';
        for (const b of buf) bin += String.fromCharCode(b);
        resolve(btoa(bin));
      });
      input.addEventListener('cancel', () => resolve(null));
      input.click();
    });
  },
};

mount({ net, dom, files });
