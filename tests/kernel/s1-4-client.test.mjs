// S1-4 单测（写码方自补，不作验收依据）：mountClient 白名单与穿越拒收、menuOf 的 self 形状（有/无化身）、
// labels 覆盖（client/layout.json 与 ui_token 族用到的代号在 labels.zh 都有）。期望值取自数据文件与公共读入口，不抄仓库读数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mountClient } from '../../server-plugin/rules/transport/client-route.mjs';
import { init } from '../../server-plugin/index.mjs';
import { accountsOf } from '../../server-plugin/rules/economy/ledger.mjs';
import { holdingsOf } from '../../server-plugin/rules/social/holdings.mjs';
import { testTempRoot, removeTempRoot } from '../accept/temp-root.mjs';

const REPO = new URL('../../', import.meta.url);
const json = (/** @type {string} */ rel) => JSON.parse(readFileSync(new URL(rel, REPO), 'utf8'));
const ROUTE = json('world/display/client-route.json');

/** 挂上静态路由，返回「按请求路径取回应」的函数；读能力只记被要的路径，按给定表回字节。 @param {Record<string, string>} files */
function routeWith(files) {
  /** @type {Array<{path: RegExp, fn: Function}>} */
  const gets = [];
  /** @type {string[]} */
  const reads = [];
  mountClient({ get: (path, fn) => { gets.push({ path, fn }); } }, ROUTE, (rel) => { reads.push(rel); return Object.hasOwn(files, rel) ? Buffer.from(files[rel]) : null; });
  assert.equal(gets.length, 1, 'mountClient registers exactly one GET route');
  /** @param {string} url */
  const hit = (url) => {
    if (!gets[0].path.test(url)) return { status: 'unmatched', headers: {}, body: null };
    /** @type {{status: number, headers: Record<string, string>, body: unknown}} */
    const out = { status: 200, headers: {}, body: null };
    const res = { status(/** @type {number} */ c) { out.status = c; return res; }, set(/** @type {string} */ n, /** @type {string} */ v) { out.headers[n] = v; return res; }, send(/** @type {unknown} */ b) { out.body = b; } };
    gets[0].fn({ url }, res);
    return out;
  };
  return { hit, reads };
}

const base = `/${ROUTE.mount}/`;

test('mountClient：白名单内的文件按根映射、按扩展名给 MIME；目录请求取 index', () => {
  const lang = ROUTE.roots.find((/** @type {any} */ r) => Array.isArray(r.files) && r.files.some((/** @type {string} */ f) => f.endsWith('.json')));
  const langFile = lang.files[0];
  const dirRoot = ROUTE.roots.find((/** @type {any} */ r) => typeof r.dir === 'string');
  const files = { [`${dirRoot.dir}${ROUTE.index}`]: 'i', [`${dirRoot.dir}app.mjs`]: 'a', [langFile]: '{}' };
  const { hit } = routeWith(files);
  const idx = hit(`${base}${dirRoot.url}`);
  assert.equal(idx.status, 200);
  assert.equal(String(idx.body), 'i');
  assert.equal(idx.headers['content-type'], ROUTE.mime['.html']);
  const app = hit(`${base}${dirRoot.url}app.mjs?v=1`);
  assert.equal(String(app.body), 'a');
  assert.equal(app.headers['content-type'], ROUTE.mime['.mjs']);
  const l = hit(`${base}${lang.url}${langFile.slice(langFile.lastIndexOf('/') + 1)}`);
  assert.equal(l.status, 200);
  assert.equal(l.headers['content-type'], ROUTE.mime['.json']);
});

test('mountClient：穿越、编码绕过、反斜杠、绝对路径、白名单外、无 MIME、文件不存在一律 notFound，且不越界读', () => {
  const dirRoot = ROUTE.roots.find((/** @type {any} */ r) => typeof r.dir === 'string');
  const lang = ROUTE.roots.find((/** @type {any} */ r) => Array.isArray(r.files) && r.files.some((/** @type {string} */ f) => f.endsWith('.json')));
  const outside = 'world/ontology/state-owners.json';
  const { hit, reads } = routeWith({ [outside]: 'x', 'world/i18n/blocklist.zh.json': 'x' });
  const bad = [
    `${base}../world/ontology/state-owners.json`,
    `${base}${dirRoot.url}../world/ontology/state-owners.json`,
    `${base}%2e%2e/world/ontology/state-owners.json`,
    `${base}..%2fworld%2fontology%2fstate-owners.json`,
    `${base}${dirRoot.url}a\\..\\..\\world\\ontology\\state-owners.json`,
    `${base}/world/ontology/state-owners.json`,
    `${base}C:/world/ontology/state-owners.json`,
    `${base}${dirRoot.url}./app.mjs`,
    `${base}${lang.url}blocklist.zh.json`,
    `${base}${dirRoot.url}missing.mjs`,
    `${base}${dirRoot.url}app.exe`,
  ];
  for (const url of bad) assert.equal(hit(url).status, ROUTE.notFound, url);
  assert.ok(reads.every((r) => r.startsWith(dirRoot.dir)), `only in-root paths may reach the reader: ${reads.join(', ')}`);
  assert.equal(hit('/other/app.mjs').status, 'unmatched');
});

test('真实 init 装配的读能力：请求路径中段是文件（Linux 上读盘 ENOTDIR）回 notFound，宿主不崩，之后 view 仍 ok', async () => {
  const root = testTempRoot('s14-enotdir-');
  try {
    /** @type {Array<{path: RegExp, fn: Function}>} */
    const gets = [];
    /** @type {Map<string, Function>} */
    const posts = new Map();
    await init({ get: (/** @type {RegExp} */ path, /** @type {Function} */ fn) => { gets.push({ path, fn }); }, post: (/** @type {string} */ path, /** @type {Function} */ fn) => { posts.set(path, fn); } }, { saveRoot: root });
    /** @param {string} url */
    const get = (url) => {
      const out = { status: 200, body: /** @type {unknown} */ (null) };
      const res = { status(/** @type {number} */ c) { out.status = c; return res; }, set() { return res; }, send(/** @type {unknown} */ b) { out.body = b; } };
      const g = gets.find((x) => x.path.test(url));
      assert.ok(g, url);
      g.fn({ url }, res);
      return out;
    };
    const dirRoot = ROUTE.roots.find((/** @type {any} */ r) => typeof r.dir === 'string');
    const file = `${base}${dirRoot.url}app.mjs`;
    assert.equal(get(file).status, 200, 'the real file is served');
    assert.equal(get(`${file}/x.mjs`).status, ROUTE.notFound);
    const viewed = await new Promise((resolve) => {
      const res = { set() { return res; }, send(/** @type {string} */ b) { resolve(JSON.parse(b)); } };
      const menu = [...posts.entries()].find(([p]) => p.endsWith('/menu'));
      assert.ok(menu, 'menu route mounted');
      menu[1]({ body: { payload: 'ui', command: 'view' } }, res);
    });
    assert.equal(/** @type {any} */ (viewed).result, 'ok');
  } finally {
    removeTempRoot(root);
  }
});

test('menuOf 的 self：无化身为 null；有化身时账户与持有取自公共读入口，template 一律 null', async () => {
  const root = testTempRoot('s14-self-');
  try {
    const w = await init({ post() {}, get() {} }, { saveRoot: root });
    assert.equal(w.menu(null).self, null);
    const opening = w.menu(null).affordances[0];
    const slots = Object.fromEntries(Object.keys(opening.slots).map((k) => [k, 0]));
    assert.equal(w.act({ act: opening.act, slots, numbers: {} }).ok, true);
    const self = w.menu(null).self;
    assert.ok(self !== null && typeof self.subject === 'string');
    const want = accountsOf(w.engine, w.state, self.subject).map((a) => ({ resource: a.resource, purpose: a.purpose, balance: a.balance }));
    assert.deepEqual(self.accounts.map((/** @type {any} */ a) => ({ ...a })), want);
    assert.ok(want.length > 0, 'endowment should open at least one account');
    const edges = holdingsOf(w.engine, w.state, self.subject).map((e) => ({ kind: e.kind, subject: e.subject, template: null }));
    assert.deepEqual(self.holdings.map((/** @type {any} */ h) => ({ ...h })), edges);
    for (const a of self.accounts) assert.deepEqual(Object.keys(a).sort(), ['balance', 'purpose', 'resource']);
  } finally {
    removeTempRoot(root);
  }
});

test('labels 覆盖：layout.json 用到的 ui_token 代号与 ui_token 族全部条目在 labels.zh 都有，且两者一致', () => {
  const layout = json('client/layout.json');
  const vocab = json('world/ontology/dimensions/_vocab.json').families.ui_token;
  const labels = json('world/i18n/labels.zh.json');
  /** @type {Set<string>} */
  const used = new Set();
  const walk = (/** @type {unknown} */ v) => {
    if (typeof v === 'string' && v.startsWith(vocab.prefix)) used.add(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v !== null && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(layout);
  assert.ok(used.size > 0);
  for (const c of used) assert.ok(Object.hasOwn(vocab.entries, c), `${c} not in ui_token family`);
  for (const c of Object.keys(vocab.entries)) {
    assert.equal(typeof labels[c]?.label, 'string', `${c} has no label`);
  }
  // 封闭枚举值的显示名键（枚举名.值，卷二十九:244）：layout.enumKeys 指的两个枚举在 wire/handles 里的值都要有名。
  const wire = json('world/schema/wire-v1.json');
  for (const v of wire.enums[layout.enumKeys.save]) assert.equal(typeof labels[`${layout.enumKeys.save}.${v}`]?.label, 'string', v);
});
