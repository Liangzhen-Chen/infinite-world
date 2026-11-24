// 验收测试（出题方：Claude Sonnet 5.5 中档；写修复的是另一个模型，审卡的是第三方）。
// 依据：卷二 :965（menu 路由载荷三种：动作、错误上报、界面命令，由 menu-entry.mjs 分流）、:999 第 2 环（错误上报载荷回 received，其余各路径恰回一次）、
//       :1001 第 1 条（存档读档是 menu 路由上的动作，由 menu-entry 分流）；偏离清查-1122 甲 1（03d #1）。
// 测什么：用生产装配文件 init(router)（不手工调 installMenuDispatch）挂好路由后，向 /menu 发各种形状的请求体：
//         (a) 每个请求恰一个响应；(b) 没有任何一个回 E-ACT-WRITER-NOT-READY（"处理函数未交入"这一码只许出现在装配不全时，生产装配后不得再出现）。
//         wire-up-menu-v1 的字段表尚未建（menu-entry.mjs:6），故本测试不规定字段名，只规定"生产装配后菜单处理函数已就位"这一行为；
//         对不认识的请求体回别的拒收码（如 E-DIM-STRUCT-FIELD、E-ACT-UNKNOWN）都算通过。
// 为什么修前失败：installMenuDispatch 在 server-plugin 生产代码里零调用（menu-entry.mjs:19、:27-31），init 之后 dispatch 仍为 null，
//         一切菜单请求回 rejected 加 E-ACT-WRITER-NOT-READY。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { init } from '../../../server-plugin/index.mjs';

function fakeRouter() {
  const routes = new Map();
  return { routes, post(path, handler) { routes.set(path, handler); } };
}
function fakeRes() {
  const res = { headers: {}, bodies: [], setHeader(k, v) { res.headers[k] = v; }, end(b) { res.bodies.push(b); } };
  return res;
}
async function request(router, path, body) {
  const res = fakeRes();
  await router.routes.get(path)({ body }, res);
  const json = res.bodies.length === 1 && typeof res.bodies[0] === 'string' ? JSON.parse(res.bodies[0]) : undefined;
  return { res, json };
}

const BODIES = {
  '动作载荷（动作代号加存档槽位编号，卷二 :965、:1001）': { action: 'act_save', slot: 0 },
  '动作载荷（动作代号加数值参数，卷二 :965）': { action: 'act_wait', params: { minutes: 10 } },
  '错误上报载荷（ErrorCode 加数值字段，卷二 :965、:999）': { kind: 'error_report', code: 'E-ACT-UNKNOWN', n: 1 },
  '界面命令载荷（卷二 :965）': { kind: 'ui_command', command: 'cmd_open_menu' },
  '空对象': {},
};

// init 只能装配一次（内核订阅重复登记即拒），两条测试共用同一次装配。
let routerPromise = null;
function assembled() {
  if (routerPromise === null) { const r = fakeRouter(); routerPromise = init(r).then(() => r); }
  return routerPromise;
}

test('生产装配 init(router) 之后，菜单请求不再因"处理函数未交入"被拒（E-ACT-WRITER-NOT-READY）', async () => {
  const router = await assembled();
  for (const [name, body] of Object.entries(BODIES)) {
    const { res, json } = await request(router, '/menu', body);
    assert.equal(res.bodies.length, 1, `${name}：恰一个响应`);
    assert.ok(json && typeof json.result === 'string', `${name}：响应可解出结果代号`);
    const rejects = Array.isArray(json.rejects) ? json.rejects : [];
    assert.ok(!rejects.includes('E-ACT-WRITER-NOT-READY'), `${name}：回了 E-ACT-WRITER-NOT-READY（菜单处理函数没有生产调用者）`);
  }
});

test('生产装配后，菜单请求体不是对象仍回 E-DIM-STRUCT-FIELD（入口收窄不因装配而丢）', async () => {
  const router = await assembled();
  for (const bad of [undefined, null, [], 'x', 7]) {
    const { json } = await request(router, '/menu', bad);
    assert.deepEqual([json.result, json.rejects], ['rejected', ['E-DIM-STRUCT-FIELD']]);
  }
});
