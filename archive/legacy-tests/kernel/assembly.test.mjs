// 块 6 第 6-19 张《装配文件与到期订阅分发》：卷二 §2.9 第 0 条"装配文件"与封闭清单 :974（`assembly.calls`）、回应通道六环（第 1、2a、3、5、6 环）、
// "各环的规矩"第 2 环与违例 E-WIRE-REPLY；卷二十 §4.1.3 第 5 条 :507 到期订阅分发；块 5 遗留 1（checkPrimitiveCatalog）、2（installHoldingEngine）、3（expireReviveWindow）。
// 测试先写，期望值按卷文手算成字面量：路由只有 menu、save_export、save_import 三条（块 6 不调 mountInput，没有 input）；每个请求恰好一个响应；
// 没有处理函数时一律回 rejected 加 E-ACT-WRITER-NOT-READY（不静默吞、不假装成功）；响应头 wire_body 取封闭枚举。
// 用真实世界装配（loadWorld、zh 语言包、屏蔽词表），宿主 router 与响应对象是测试里造的假对象。只跑不推进世界存档的小检查。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mountKernel } from '../../server-plugin/kernel/mount.mjs';
import { createWallTimer, schedule, advance, dueSource } from '../../server-plugin/kernel/scheduler.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { registerSubscriber, subscriptions, resetSubscribers } from '../../server-plugin/kernel/subscribers.mjs';
import { openHolding, resetHoldingEngine } from '../../server-plugin/kernel/holdings.mjs';
import { runTransaction } from '../../server-plugin/kernel/transaction.mjs';
import { installEventLog, deriveEventId } from '../../server-plugin/kernel/events.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { registerSystems } from '../../server-plugin/systems.mjs';
import { createRouterCaps } from '../../server-plugin/kernel/transport/router-caps.mjs';
import { installMenuDispatch, resetMenuDispatch } from '../../server-plugin/kernel/transport/menu-entry.mjs';
import { KernelError } from '../../server-plugin/kernel/errors.mjs';
import { init, info } from '../../server-plugin/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const codeIs = (code) => (e) => e.code === code;
const reports = [];
useReportSink((r) => reports.push(r));

// ---------- 宿主假对象 ----------

function fakeRouter() {
  const routes = new Map();
  return { routes, post(path, handler) { routes.set(path, handler); } };
}
function fakeRes() {
  const res = { headers: {}, bodies: [], setHeader(k, v) { res.headers[k] = v; }, end(b) { res.bodies.push(b); } };
  return res;
}
/** 向路由发一个请求，等处理函数跑完，返回 {res, json}（响应体是 JSON 字串时解出）。 */
async function request(router, path, body) {
  const res = fakeRes();
  await router.routes.get(path)({ body }, res);
  return { res, json: res.bodies.length === 1 && typeof res.bodies[0] === 'string' ? JSON.parse(res.bodies[0]) : undefined };
}

// ---------- mountKernel ----------

test('mountKernel 缺 digestCap 或 wallTimer 即拒（E-DIM-STRUCT-FIELD），不带伤上路', () => {
  const caps = { digestCap: createDigestCap(), wallTimer: createWallTimer() };
  for (const bad of [undefined, null, {}, { ...caps, digestCap: {} }, { ...caps, wallTimer: {} }, { ...caps, wallTimer: undefined }]) {
    assert.throws(() => mountKernel(bad), codeIs('E-DIM-STRUCT-FIELD'));
  }
});

let KERNEL;
test('mountKernel：读真实世界；交入持有写者的 engine（装配前持有写入拒 E-ACT-WRITER-NOT-READY，装配后不再拒这一码）；内核订阅登记了到期事件', () => {
  const state = { clock: { minute: 0, seq: 0 } };
  const open = () => runTransaction(state, { node: 'test_mount', file: 'tests/kernel/assembly.test.mjs' }, (s) => { openHolding({}, s, { holdingKind: 'hk_resides', holder: 'npc_a', subject: 'place_x', cause: 'verb_entity_terminated' }); });
  resetHoldingEngine();
  assert.deepEqual(open(), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  KERNEL = mountKernel({ digestCap: createDigestCap(), wallTimer: createWallTimer() });
  assert.notDeepEqual(open(), { ok: false, code: 'E-ACT-WRITER-NOT-READY' });
  assert.equal(KERNEL.root, ROOT);
  assert.deepEqual(subscriptions(), [{ verb: 'verb_due_elapsed', file: 'kernel/terminate.mjs' }]);
  assert.ok(KERNEL.engine.vocab && KERNEL.engine.rules && KERNEL.engine.units instanceof Map && KERNEL.engine.tables instanceof Map);
});

test('mountKernel 返回的原语目录就是世界文件的解析结果；registerSystems 收下它，目录缺失或被改坏即拒（块 5 遗留 1）', () => {
  const doc = JSON.parse(readFileSync(join(ROOT, 'world/ontology/primitives.json'), 'utf8'));
  assert.deepEqual(KERNEL.primitives, doc);
  assert.equal(registerSystems({ primitives: KERNEL.primitives }), undefined);
  assert.throws(() => registerSystems({ primitives: undefined }), /primitive catalog/);
  assert.throws(() => registerSystems({ primitives: { ...doc, primitives: [...doc.primitives].reverse() } }), /primitive catalog/);
});

test('战役种子：装配时为空（事件 id 取不出，E-SEED-COMPONENT 拒，不静默用缺省）；bindCampaignSeed 只收 ^[A-Za-z0-9_-]{1,64}$，设入后可换', () => {
  assert.equal(KERNEL.engine.template.seed, undefined);
  for (const bad of ['', 'has space', '带中文', 'a'.repeat(65), undefined, null, 7]) assert.throws(() => KERNEL.bindCampaignSeed(bad), codeIs('E-SEED-COMPONENT'));
  assert.equal(KERNEL.engine.template.seed, undefined);
  KERNEL.bindCampaignSeed('seed_one');
  assert.equal(KERNEL.engine.template.seed, 'seed_one');
  KERNEL.bindCampaignSeed('seed_two-2');
  assert.equal(KERNEL.engine.template.seed, 'seed_two-2');
});

test('到期订阅分发（卷二十 §4.1.3 第 5 条）：到期那一刻 due 段写下一条 verb_due_elapsed（载荷 {kind, owner}，actor 空），规则层订阅者收到它；到期前不发；每个到期项恰一条', () => {
  const book = { entries: [] };
  installEventLog(book);
  const state = { clock: { minute: 100, seq: 0 } };
  const heard = [];
  registerSubscriber('verb_due_elapsed', 'rules/test-owner.mjs', (eng, st, ev) => heard.push([st.clock.minute, ev.payload.kind, ev.payload.owner, ev.actor, ev.targets]));
  const rule = { node: 'test_due', file: 'tests/kernel/assembly.test.mjs' };
  assert.deepEqual(runTransaction(state, rule, () => { schedule('npc_a', 'due_recurrence', 10, 'ref_1'); schedule('npc_b', 'due_recurrence', 10, 'ref_2'); }), { ok: true });
  const source = dueSource(KERNEL.engine, { layerRankOf: () => 0 });
  assert.deepEqual(advance(KERNEL.engine, state, 9, [source]), { ok: true, minute: 109 });
  assert.deepEqual(heard, []);
  assert.equal(book.entries.length, 0);
  assert.deepEqual(advance(KERNEL.engine, state, 1, [source]), { ok: true, minute: 110 });
  // 同刻两项按到期项全序（(owner, ref, registeredMinute) 升序）：npc_a 先、npc_b 后。
  assert.deepEqual(heard, [[110, 'due_recurrence', 'npc_a', null, []], [110, 'due_recurrence', 'npc_b', null, []]]);
  assert.deepEqual(book.entries.map((e) => [e.verb, e.minute, e.payload.kind, e.payload.owner]), [['verb_due_elapsed', 110, 'due_recurrence', 'npc_a'], ['verb_due_elapsed', 110, 'due_recurrence', 'npc_b']]);
  // 事件 id 五成分取卷九 :440：规则段到期项种类、主体段拥有者、位次 pos.only（pos.kernel 是协议事件专用，:442）。
  assert.equal(book.entries[0].id, deriveEventId(KERNEL.engine, { rule: 'due_recurrence', subject: 'npc_a', minute: 110, position: 'pos.only' }));
  assert.notEqual(book.entries[0].id, deriveEventId(KERNEL.engine, { rule: 'due_recurrence', subject: 'npc_a', minute: 110, position: 'pos.kernel' }));
  // 到期项已出堆：再推进不再发。
  assert.deepEqual(advance(KERNEL.engine, state, 50, [source]), { ok: true, minute: 160 });
  assert.equal(book.entries.length, 2);
  resetSubscribers();
});

// ---------- router-caps ----------

test('createRouterCaps：router 须有 post；路由只收 wire_route 的四个值，同一路由只登记一次；入口须是函数', () => {
  assert.throws(() => createRouterCaps(undefined), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => createRouterCaps({}), codeIs('E-DIM-STRUCT-FIELD'));
  const router = fakeRouter();
  const { requestCap } = createRouterCaps(router);
  assert.throws(() => requestCap.register('bogus', () => {}), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => requestCap.register('', () => {}), codeIs('E-DIM-STRUCT-FIELD'));
  assert.throws(() => requestCap.register('menu', null), codeIs('E-DIM-STRUCT-FIELD'));
  requestCap.register('menu', () => {});
  assert.throws(() => requestCap.register('menu', () => {}), codeIs('E-WRITER-DUPLICATE'));
  assert.deepEqual([...router.routes.keys()], ['/menu']);
});

// ---------- 装配文件 index.mjs ----------

test('装配文件 index.mjs 合卷二 :996 扫描规则：只有 import、导出的 init(router)、函数体内对清单内函数的调用；无字符串/数值字面量（import 说明符除外）、条件、属性读取；实参只是 router、前面调用的返回值或由它们组成的对象字面量', () => {
  const src = readFileSync(join(ROOT, 'server-plugin/index.mjs'), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  const lines = code.split('\n').map((l) => l.trim()).filter((l) => l !== '');
  const calls = JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8')).assembly.calls;
  const names = [];
  let inInit = false;
  for (const l of lines) {
    if (l.startsWith('import ')) continue;
    if (l.startsWith('export const info =')) continue; // 宿主要求的 info 与 :996 冲突，等李白裁定（C1）
    if (l === 'export async function init(router) {') { inInit = true; continue; }
    if (l === '}') { inInit = false; continue; }
    assert.ok(inInit, `outside init: ${l}`);
    const m = /^(?:const (\w+) = )?(\w+)\((.*)\);$/.exec(l);
    assert.ok(m, `not a call statement: ${l}`);
    assert.ok(calls.includes(m[2]), `${m[2]} is not in assembly.calls`);
    names.push(m[2]);
    assert.ok(!/['"`\d.?[]/.test(m[3].replace(/\{|\}/g, '')), `literal, member read or condition in args: ${l}`);
    const allowed = new Set(['router', ...lines.filter((x) => /^const \w+ = /.test(x)).map((x) => /^const (\w+)/.exec(x)[1])]);
    for (const id of m[3].match(/\w+/g) || []) assert.ok(allowed.has(id), `argument ${id} is neither router nor an earlier return value: ${l}`);
  }
  assert.deepEqual(names, ['createRouterCaps', 'createDigestCap', 'createWallTimer', 'mountKernel', 'registerSystems', 'mountOutput', 'mountMenuEntry', 'mountSaveRoutes']);
  assert.ok(!/\b(if|for|while|try|switch|new|import\.meta|Object|globalThis)\b/.test(lines.filter((x) => !x.startsWith('import ') && !x.startsWith('export const info')).join('\n')));
});

test('装配文件 init(router)：恰挂 menu、save_export、save_import 三条路由（块 6 没有 input 路由）；info 带插件 id', async () => {
  resetSubscribers();
  const router = fakeRouter();
  await init(router);
  assert.deepEqual([...router.routes.keys()].sort(), ['/menu', '/save_export', '/save_import']);
  assert.equal(typeof info.id, 'string');
  // 回应通道恰一个订阅者：再装配一次，内核订阅重复登记即拒，不会出现第二个订阅者。
  await assert.rejects(init(fakeRouter()), codeIs('E-WRITER-DUPLICATE'));
  ROUTER = router;
});
let ROUTER;

test('菜单请求没有处理函数：回 rejected 加 E-ACT-WRITER-NOT-READY；恰一个响应，响应头 wire_body = envelope，经显示闸出信封，没有文字之外的路径', async () => {
  resetMenuDispatch();
  const { res, json } = await request(ROUTER, '/menu', { action: 'act_wait' });
  assert.equal(res.bodies.length, 1);
  assert.equal(res.headers.wire_body, 'envelope');
  assert.equal(json.result, 'rejected');
  assert.deepEqual(json.rejects, ['E-ACT-WRITER-NOT-READY']);
  assert.equal(json.envelopeCount, json.envelopes.length);
  assert.ok(json.envelopeCount >= 1);
  assert.deepEqual(json.envelopes.map((e) => e.screenId), json.envelopes.map((_, i) => `${json.responseId}:${i}`));
});

test('菜单请求体不是对象（空、数组、串、数）一律 rejected 加 E-DIM-STRUCT-FIELD，不进处理函数', async () => {
  let called = 0;
  installMenuDispatch(() => { called += 1; return { resultCode: 'ok' }; });
  for (const bad of [undefined, null, [], 'x', 7]) {
    const { json } = await request(ROUTER, '/menu', bad);
    assert.deepEqual([json.result, json.rejects], ['rejected', ['E-DIM-STRUCT-FIELD']]);
  }
  assert.equal(called, 0);
  resetMenuDispatch();
});

test('菜单处理函数：返回的 ReplyResult 由入口 postReply 恰一次；responseId 单调递增；处理函数只许交入一次', async () => {
  const seen = [];
  installMenuDispatch((body, handle) => { seen.push([body, typeof handle]); return { resultCode: 'ok' }; });
  assert.throws(() => installMenuDispatch(() => ({ resultCode: 'ok' })), codeIs('E-WRITER-DUPLICATE'));
  assert.throws(() => installMenuDispatch('not a function'), codeIs('E-DIM-STRUCT-FIELD'));
  const a = await request(ROUTER, '/menu', { action: 'act_wait', n: 1 });
  const b = await request(ROUTER, '/menu', { action: 'act_wait', n: 2 });
  assert.deepEqual([a.json.result, b.json.result], ['ok', 'ok']);
  assert.equal(b.json.responseId, a.json.responseId + 1);
  assert.deepEqual(seen, [[{ action: 'act_wait', n: 1 }, 'object'], [{ action: 'act_wait', n: 2 }, 'object']]);
  resetMenuDispatch();
});

test('处理函数出错或返回不合形状：每个请求仍恰一个响应（error 加错误码），E-WIRE-REPLY 路径不漏回', async () => {
  // 带登记码的错：响应里是那个码。
  installMenuDispatch(() => { throw new KernelError('E-ACT-UNKNOWN', {}, 'no such action'); });
  let r = await request(ROUTER, '/menu', { action: 'act_nope' });
  assert.equal(r.res.bodies.length, 1);
  assert.deepEqual([r.json.result, r.json.rejects], ['error', ['E-ACT-UNKNOWN']]);
  resetMenuDispatch();
  // 返回里带文字（代号文法之外的串）：ReplyResult 里没有文字，核对不过，回 error 加 E-WIRE-REPLY。
  installMenuDispatch(() => ({ resultCode: 'ok', note: 'plain text with spaces' }));
  r = await request(ROUTER, '/menu', { action: 'act_x' });
  assert.equal(r.res.bodies.length, 1);
  assert.deepEqual([r.json.result, r.json.rejects], ['error', ['E-WIRE-REPLY']]);
  resetMenuDispatch();
  // 返回 undefined（没有结果）：同样不漏回。
  installMenuDispatch(() => undefined);
  r = await request(ROUTER, '/menu', { action: 'act_x' });
  assert.equal(r.res.bodies.length, 1);
  assert.deepEqual([r.json.result, r.json.rejects], ['error', ['E-WIRE-REPLY']]);
  resetMenuDispatch();
});

test('存档两条路由（save_export、save_import）：没有存档环境（开局前）一律 save_unavailable，恰一个响应，不写盘（真实流程见 save-routes.test.mjs）', async () => {
  for (const path of ['/save_export', '/save_import']) {
    const { res, json } = await request(ROUTER, path, { slot: 0, bytes: '' });
    assert.equal(res.bodies.length, 1, path);
    assert.deepEqual([json.result, json.rejects], ['save_unavailable', []], path);
  }
});

test('ReplyCap.send：wire_body 只收 envelope 与 bytes，其余拒；句柄一次一用', async () => {
  const router = fakeRouter();
  const { requestCap, replyCap } = createRouterCaps(router);
  const sendTwice = [];
  requestCap.register('save_export', async (body, handle) => {
    sendTwice.push(() => replyCap.send(handle, 'x', 'bogus'));
    replyCap.send(handle, new Uint8Array([1, 2]), 'bytes');
    sendTwice.push(() => replyCap.send(handle, 'again', 'bytes'));
  });
  const res = fakeRes();
  await router.routes.get('/save_export')({ body: {} }, res);
  assert.deepEqual([res.headers.wire_body, res.bodies.length], ['bytes', 1]);
  assert.ok(res.bodies[0] instanceof Uint8Array);
  assert.throws(sendTwice[0], codeIs('E-WIRE-REPLY'));
  assert.throws(sendTwice[1], codeIs('E-WIRE-REPLY'));
});
