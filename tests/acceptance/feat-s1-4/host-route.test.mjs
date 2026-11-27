// S1-4 黑盒验收：卡文第 1 条（npm start 十秒内可玩）与第 4 条（静态路由不越界）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s14。
// 依据与每条测什么，见 docs/卡档案/feat-s1-4/出题.md。
// 口径：只起真实宿主子进程（node tools/host/serve.mjs，环境变量 PORT=0），经 HTTP 发真请求；不 mock，不调内部函数。
// 静态路由的越界请求用 node:http 原样发出：fetch 会先规范化 `..`，那样测不到路由本身。
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const MOUNT = '/api/plugins/if';
const READY_LIMIT_MS = 10000;
const CHILD_ENV = (() => {
  const e = { ...process.env };
  delete e.NODE_TEST_CONTEXT; // 否则子进程按父子协议跑，退出码恒 0（见 tools/accept/e2e-wire-cut.mjs 同款处理）。
  return e;
})();

const children = [];
const roots = [];
after(async () => {
  for (const c of children.splice(0)) await stopChild(c);
  for (const r of roots.splice(0)) removeTempRoot(r);
});

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => { child.once('exit', () => resolve(undefined)); child.kill(); });
}

/**
 * 起宿主：PORT=0，等 stdout 出现 {"ready": ...} 行。超时或提前退出都按失败处理（reject）。
 * 存档目录经环境变量 IF_SAVE_ROOT 传入（卡文未定名，见出题.md 说明）。
 */
/** @param {{cwd?: string, saveRoot?: string}} [opts] */
function startHost({ cwd = REPO, saveRoot } = {}) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    /** @type {Record<string, string>} */
    const env = { ...CHILD_ENV, PORT: '0' };
    if (saveRoot) env.IF_SAVE_ROOT = saveRoot;
    const child = spawn(process.execPath, ['tools/host/serve.mjs'], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child);
    let out = '';
    let err = '';
    let settled = false;
    const done = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => done(reject, new Error(`${READY_LIMIT_MS} ms 内未打出 ready 行；stderr 末段：${err.slice(-400)}`)), READY_LIMIT_MS);
    child.stdout.on('data', (d) => {
      out += d;
      const line = out.split(/\r?\n/).find((l) => l.trim().startsWith('{'));
      if (!line) return;
      let obj = null;
      try { obj = JSON.parse(line); } catch { return; }
      if (typeof obj?.ready === 'string') done(resolve, { child, ready: obj.ready, line, t0 });
    });
    child.stderr.on('data', (d) => { err += d; });
    child.on('exit', (code) => done(reject, new Error(`宿主提前退出，退出码 ${code}；stderr 末段：${err.slice(-400)}`)));
  });
}

/** 原样发 HTTP 请求（路径不经 URL 规范化）。 */
function rawGet(origin, path) {
  const u = new URL(origin);
  return new Promise((resolve, reject) => {
    const req = http.request({ host: u.hostname, port: u.port, path, method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    req.end();
  });
}

const VIEW = { payload: 'ui', command: 'view' };
async function postView(ready) {
  const res = await fetch(new URL('../menu', ready), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(VIEW),
  });
  return { status: res.status, json: await res.json() };
}

// 共用一个宿主供第 4 条各用例使用（只读请求，不改状态）。
let shared = null;
async function sharedHost() {
  if (shared) return shared;
  const root = testTempRoot('s14-route-');
  roots.push(root);
  shared = await startHost({ saveRoot: root });
  return shared;
}

// ---------- 第 1 条 ----------

test('1. npm start 的宿主：10 秒内打出只含 ready 的 JSON 行（端口非 0），GET client/ 为 200，POST menu 的 view 结果为 ok，总耗时不超过 10 秒', async () => {
  const root = testTempRoot('s14-start-');
  roots.push(root);
  const { child, ready, line, t0 } = await startHost({ saveRoot: root });
  children.push(child);

  const parsed = JSON.parse(line);
  assert.deepEqual(Object.keys(parsed), ['ready'], 'ready 行只允许含 ready 一个键');
  const u = new URL(ready);
  assert.ok(u.port !== '' && u.port !== '0', 'PORT=0 时应由系统分配一个真实端口');
  assert.ok(ready.endsWith(`${MOUNT}/client/`), `ready 应指向 ${MOUNT}/client/，实得 ${ready}`);

  const page = await fetch(ready);
  assert.equal(page.status, 200, 'GET client/ 应为 200');
  const v = await postView(ready);
  assert.equal(v.status, 200, 'POST menu 应为 200');
  assert.equal(v.json.result, 'ok', `view 结果应为 ok：${JSON.stringify(v.json).slice(0, 300)}`);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed <= READY_LIMIT_MS, `从起进程到可玩应在 ${READY_LIMIT_MS} ms 内，实际 ${elapsed} ms`);
});

// ---------- 第 4 条 ----------

test('4a. 静态路由拒绝越界：`..`、%2e%2e 编码、编码斜杠、双斜杠与编码绝对路径、反斜杠，一律 404（不是 500，不是 200）', async () => {
  const { ready } = await sharedHost();
  const origin = new URL(ready).origin;
  const cases = [
    ['原样 ..', `${MOUNT}/client/../world/ontology/state-owners.json`],
    ['%2e%2e 编码', `${MOUNT}/client/%2e%2e/world/ontology/state-owners.json`],
    ['编码斜杠的 ..', `${MOUNT}/client/%2e%2e%2fworld%2fontology%2fstate-owners.json`],
    ['双斜杠绝对路径', `${MOUNT}/client//world/ontology/state-owners.json`],
    ['编码绝对路径', `${MOUNT}/client/%2Fworld%2Fontology%2Fstate-owners.json`],
    ['反斜杠越界', `${MOUNT}/client/..%5Cworld%5Contology%5Cstate-owners.json`],
    ['越出到 server-plugin 源码', `${MOUNT}/client/../server-plugin/index.mjs`],
  ];
  for (const [why, path] of cases) {
    const r = await rawGet(origin, path);
    assert.equal(r.status, 404, `${why}：应回 404，实得 ${r.status}`);
  }
});

test('4b. 白名单外的文件一律 404：world/i18n/blocklist.zh.json 不论经哪条路径取到都是 404；白名单内的 client/ 首页为 200', async () => {
  const { ready } = await sharedHost();
  const origin = new URL(ready).origin;
  const blocked = [
    `${MOUNT}/client/world/i18n/blocklist.zh.json`,
    `${MOUNT}/client/i18n/blocklist.zh.json`,
    `${MOUNT}/client/../world/i18n/blocklist.zh.json`,
  ];
  for (const path of blocked) {
    const r = await rawGet(origin, path);
    assert.equal(r.status, 404, `${path} 应为 404，实得 ${r.status}`);
  }
  const home = await rawGet(origin, `${MOUNT}/client/`);
  assert.equal(home.status, 200, '白名单内的 client/ 首页应为 200');
});

test('4c. 越界请求不得改变宿主可玩性：拒绝之后 view 仍为 ok', async () => {
  const { ready } = await sharedHost();
  await rawGet(new URL(ready).origin, `${MOUNT}/client/%2e%2e/world/ontology/state-owners.json`);
  const v = await postView(ready);
  assert.equal(v.json.result, 'ok', '越界请求之后 view 仍应为 ok');
});
