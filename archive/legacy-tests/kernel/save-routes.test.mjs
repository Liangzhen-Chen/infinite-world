// 块 6 第 6-20 张《存档四路路由与 det_save_load》：卷二 §2.9 第 0 条"存档四路" :940–944（存读是 menu 动作、清单显示字段只有两样、导出、导入）、
// "通路六环"第 2c、2d、5s、6s 环、"违例"E-WIRE-REPLY（每条返回路径恰一次回应）；卷二十七 R27-4.1、R27-4.3、R27-4.5（恢复 = 快照 + 其后日志重跑）、
// R27-4.8、R27-7.2（replay_apply 在读档入口内部）、A27-4.4、A27-4.6。
// 测试先写，期望值按卷文手算成字面量，不抄被测函数读数。虚构顶层键（gauge、holdings、purse、narration、clock）与虚构分片表，不是世界内容；
// 只用小状态夹具与假宿主，不推进真实世界（刻末挂接那一条只跑三刻的 advance）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveAction, mountSaveRoutes, MANIFEST_FIELDS, createLogBook, docOfState, compileLayout } from '../../server-plugin/kernel/save.mjs';
import { loadAction, startGame } from '../../server-plugin/kernel/load/save.mjs';
import { installSaveEnv, resetSaveSession, currentGame } from '../../server-plugin/kernel/save-session.mjs';
import { submitProposal } from '../../server-plugin/kernel/transaction.mjs';
import { createRouterCaps } from '../../server-plugin/kernel/transport/router-caps.mjs';
import { onReply, replyHandleHost } from '../../server-plugin/kernel/transport/reply-channel.mjs';
import { advance, installTickEnd } from '../../server-plugin/kernel/scheduler.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { digestHex } from '../../server-plugin/textcore/digest.mjs';
import { testTempRoot } from '../accept/temp-root.mjs';
import { LAYOUT, RULES, encode, logs, resetDrift, lv, pu, ho, newGame, digestNow, step, startNew } from './save-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
const ENGINE = { vocab: W.vocab, rules: W.rules, units: W.env.units };

// ---------- 假宿主与回应通道 ----------

function fakeRouter() {
  const routes = new Map();
  return { routes, post(path, handler) { routes.set(path, handler); } };
}
function fakeRes() {
  const res = { headers: {}, bodies: [], setHeader(k, v) { res.headers[k] = v; }, end(b) { res.bodies.push(b); } };
  return res;
}
// 下游订阅者：按代号结构原样写回（不拼文字；真实的订阅者是 outputGate，6-17）。
onReply((handle, result) => {
  const res = replyHandleHost(handle);
  res.setHeader('wire_body', 'envelope');
  res.end(JSON.stringify(result));
});
const ROUTER = fakeRouter();
mountSaveRoutes(createRouterCaps(ROUTER));
async function request(path, body) {
  const res = fakeRes();
  await ROUTER.routes.get(path)({ body }, res);
  return { res, wire: res.headers.wire_body, text: res.bodies[0] };
}
const jsonOf = (r) => JSON.parse(r.text);
const rejectedWith = (code) => ({ resultCode: 'rejected', rejectCode: code });

function dirImage(dir) {
  const out = {};
  const walk = (d, rel) => {
    for (const name of readdirSync(d).sort()) {
      const full = join(d, name);
      const r = rel ? `${rel}/${name}` : name;
      if (statSync(full).isDirectory()) walk(full, r); else out[r] = readFileSync(full).toString('hex');
    }
  };
  if (existsSync(dir)) walk(dir, '');
  return out;
}
const slotDirOf = (root, n) => join(root, `slot-${n}`);

// ---------- 存档与读档（menu 动作） ----------

test('没有存档环境或进行中的游戏：存档、读档都回 save_unavailable，不写盘、不假装成功', () => {
  resetSaveSession();
  assert.deepEqual(saveAction(0), { resultCode: 'save_unavailable' });
  assert.deepEqual(loadAction(0), { resultCode: 'save_unavailable' });
  // 只有环境、没有游戏：同样。
  const root = testTempRoot('saveroute-');
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 100 });
  assert.deepEqual(saveAction(0), { resultCode: 'save_unavailable' });
  assert.deepEqual(loadAction(0), { resultCode: 'save_unavailable' });
  assert.deepEqual(readdirSync(root), []);
});

test('存档槽位编号只收 [0, saveSlotCount) 的整数：越界、小数、字串、空值都拒 E-SAVE-SLOT-INVALID，不写盘', () => {
  const root = startNew();
  for (const bad of [-1, 3, 4, 1.5, '1', null, undefined, NaN, Infinity, [], {}]) {
    assert.deepEqual(saveAction(bad), rejectedWith('E-SAVE-SLOT-INVALID'), String(bad));
    assert.deepEqual(loadAction(bad), rejectedWith('E-SAVE-SLOT-INVALID'), String(bad));
  }
  assert.deepEqual(readdirSync(root), []);
});

test('清单显示字段只有 clockMinute 与槽位编号两样，没有墙钟：同一局存进两个槽位，除槽位编号外清单逐字节相同', () => {
  const root = startNew();
  step(lv(1, 1));
  assert.deepEqual(saveAction(0), { resultCode: 'ok' });
  assert.deepEqual(saveAction(2), { resultCode: 'ok' });
  const m0 = JSON.parse(readFileSync(join(slotDirOf(root, 0), 'manifest.json'), 'utf8'));
  const m2 = JSON.parse(readFileSync(join(slotDirOf(root, 2), 'manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(m0).sort(), [...MANIFEST_FIELDS]);
  assert.deepEqual([m0.slot, m2.slot], [0, 2]);
  assert.equal(m0.clockMinute, 0);
  assert.deepEqual({ ...m0, slot: 2 }, m2);
});

test('存了再读世界一模一样：快照之后的请求与记录由重跑恢复；状态、日志、存档摘要逐值相同；读档后继续玩与不存档相同', () => {
  const root = startNew();
  // 手算：每步一条请求条目；r2 另带一条非请求记录。条目数：r1→1，r2→3，r3→4，r4→5，r5→6。
  // 段 2、快照 4：r2 后封一段（3 条）；r3 后到 4 条做快照（atEvent 4）；r4 后又封一段（2 条）；存档时快照在 4、日志尾是 r4、r5 两条请求。
  step(lv(1, 1));
  step(pu(2, 7, true));
  step(lv(3, 2));
  step(lv(4, 3));
  step(ho(5, 4));
  const before = structuredClone(currentGame().state);
  const entriesBefore = structuredClone(currentGame().book.entries);
  const digestBefore = digestNow();
  assert.equal(currentGame().book.entries.length, 6);
  assert.deepEqual(saveAction(1), { resultCode: 'ok' });
  const mf = JSON.parse(readFileSync(join(slotDirOf(root, 1), 'manifest.json'), 'utf8'));
  assert.deepEqual(mf.snapshotIndex.map((s) => s.atEvent), [0, 4]);
  assert.equal(mf.saveDigest, digestBefore);

  // 存档之后接着玩（会被读档丢掉）。
  step(lv(6, 9));
  assert.notDeepEqual(currentGame().state, before);

  assert.deepEqual(loadAction(1), { resultCode: 'ok' });
  assert.deepEqual(currentGame().state, before);
  assert.deepEqual(currentGame().book.entries, entriesBefore);
  assert.equal(digestNow(), digestBefore);
  assert.equal(currentGame().clockMinute(currentGame().state), 0);
  // 读回的日志簿接着用：不存档的对照局走同样的第 6 步，摘要相同。
  step(lv(6, 9));
  const afterLoad = digestNow();
  startNew();
  step(lv(1, 1)); step(pu(2, 7, true)); step(lv(3, 2)); step(lv(4, 3)); step(ho(5, 4)); step(lv(6, 9));
  assert.equal(digestNow(), afterLoad);
});

test('读档拒收不换世界：空槽 E-SAVE-EMPTY、规则指纹不符 E-SAVE-RULES-MISMATCH；原状态对象与日志簿原样，存档文件不动', () => {
  const root = startNew();
  step(lv(1, 5));
  const g = currentGame();
  const snap = structuredClone(g.state);
  assert.deepEqual(loadAction(0), rejectedWith('E-SAVE-EMPTY'));
  assert.deepEqual(saveAction(0), { resultCode: 'ok' });
  const image = dirImage(root);
  // 换一个规则指纹（模拟改了源码或数据再读旧档）。
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: 'b'.repeat(64), saveImportMaxBytes: 100 });
  assert.deepEqual(loadAction(0), rejectedWith('E-SAVE-RULES-MISMATCH'));
  assert.equal(currentGame(), g);
  assert.deepEqual(currentGame().state, snap);
  assert.deepEqual(dirImage(root), image);
});

test('重跑与存档不一致（同版确定性被破坏）：回 error 加 E-REPLAY-DIVERGE、先 report；世界不换、挂接退回原来那一局、之后照常可玩', () => {
  const root = startNew();
  resetDrift();
  step({ request: 1, as: 'sys/gauge.mjs', kind: 'drift' });
  assert.equal(currentGame().state.gauge.gad_one.level, 1);
  assert.deepEqual(saveAction(0), { resultCode: 'ok' });
  const g = currentGame();
  const before = structuredClone(g.state);
  logs.length = 0;
  // 读档重跑时处理函数给出 2（不是存档时的 1）：状态摘要对不上。
  assert.deepEqual(loadAction(0), { resultCode: 'error', rejectCode: 'E-REPLAY-DIVERGE' });
  // 记录全相同、只有状态不同：分歧不在事件，事件序号与原语序号都是 null（R27-7.2 报第一处分歧的事件序号与原语序号）。
  assert.deepEqual(logs.map((r) => [r.code, r.fields.slot, r.fields.event, r.fields.primitive]), [['E-REPLAY-DIVERGE', 0, null, null]]);
  assert.equal(currentGame(), g);
  assert.deepEqual(g.state, before);
  assert.equal(g.book.entries.length, 1);
  // 挂接已退回：新请求落在原来那局上。
  assert.equal(step(lv(2, 7)).ok, true);
  assert.equal(g.state.gauge.gad_one.level, 7);
  assert.equal(g.book.entries.length, 2);
  assert.equal(existsSync(slotDirOf(root, 0)), true);
});

test('刻末挂接：startGame 装好后，调度器每刻处理完调封段与快照——两条请求条目后推进一刻，日志簿封出一段（段 2 条）', () => {
  startNew();
  submitProposal(lv(1, 1));
  submitProposal(lv(2, 2));
  const book = currentGame().book;
  assert.equal(book.segments.length, 0);
  assert.deepEqual(advance(ENGINE, currentGame().state, 3, []), { ok: true, minute: 3 });
  assert.deepEqual(book.segments.map((s) => s.count), [2]);
  assert.equal(book.snapshots.length, 1);
  installTickEnd(null);
});

// ---------- 导出（save_export） ----------

test('导出：成功时只经 ReplyCap.send 发存档字节（wire_body = bytes、一个响应）；字节是最近完好清单加它引用的全部分片', async () => {
  startNew();
  step(lv(1, 1)); step(pu(2, 7, true)); step(lv(3, 2));
  saveAction(1);
  const r = await request('/save_export', { slot: 1 });
  assert.equal(r.res.bodies.length, 1);
  assert.equal(r.wire, 'bytes');
  const file = jsonOf(r);
  assert.deepEqual(Object.keys(file).sort(), ['manifest', 'shards']);
  assert.deepEqual(Object.keys(file.shards).sort(), [...file.manifest.shardDigests].sort());
  for (const [d, text] of Object.entries(file.shards)) assert.equal(digestHex(text), d);
  assert.equal(file.manifest.slot, 1);
  // 头部显示字段（locale 等）不影响导出。
  const r2 = await request('/save_export', { slot: 1, locale: 'zh', frontend: 'st', wantText: true, channels: [] });
  assert.equal(r2.text, r.text);
});

test('导出失败：回 rejected 加拒收代号（经 postReply，wire_body = envelope），不发字节；每条路径恰一个响应', async () => {
  const root = startNew();
  const cases = [
    [{ slot: 0 }, 'E-SAVE-EMPTY'],
    [{ slot: -1 }, 'E-SAVE-SLOT-INVALID'],
    [{ slot: 3 }, 'E-SAVE-SLOT-INVALID'],
    [{ slot: '0' }, 'E-SAVE-SLOT-INVALID'],
    [{ slot: null }, 'E-SAVE-SLOT-INVALID'],
    [{}, 'E-DIM-STRUCT-FIELD'],
    [{ slots: 0 }, 'E-DIM-STRUCT-FIELD'],
    [null, 'E-DIM-STRUCT-FIELD'],
    [[], 'E-DIM-STRUCT-FIELD'],
    ['0', 'E-DIM-STRUCT-FIELD'],
  ];
  for (const [body, code] of cases) {
    const r = await request('/save_export', body);
    assert.equal(r.res.bodies.length, 1, JSON.stringify(body));
    assert.equal(r.wire, 'envelope', JSON.stringify(body));
    assert.deepEqual(jsonOf(r), rejectedWith(code), JSON.stringify(body));
  }
  assert.deepEqual(readdirSync(root), []);
});

test('导出残缺的槽位：当前清单坏了而上一个清单完好，导出上一个；两份都坏 E-SAVE-TORN', async () => {
  const root = startNew();
  step(lv(1, 1));
  saveAction(0);
  step(lv(2, 2));
  saveAction(0);
  const dir = slotDirOf(root, 0);
  const prev = JSON.parse(readFileSync(join(dir, 'manifest.prev.json'), 'utf8'));
  // 当前清单写坏。
  const { writeFileSync, rmSync } = await import('node:fs');
  writeFileSync(join(dir, 'manifest.json'), '{ not json');
  const r = await request('/save_export', { slot: 0 });
  assert.equal(r.wire, 'bytes');
  assert.equal(jsonOf(r).manifest.saveDigest, prev.saveDigest);
  rmSync(join(dir, 'manifest.prev.json'));
  const r2 = await request('/save_export', { slot: 0 });
  assert.deepEqual(jsonOf(r2), rejectedWith('E-SAVE-TORN'));
});

// ---------- 导入（save_import） ----------

async function exportedBundle(slot) {
  const r = await request('/save_export', { slot });
  assert.equal(r.wire, 'bytes');
  return r.text;
}
const importBody = (text, slot) => ({ slot, bytes: encode(text), locale: 'zh' });
const resultOf = async (body) => {
  const r = await request('/save_import', body);
  assert.equal(r.res.bodies.length, 1);
  assert.equal(r.wire, 'envelope');
  return jsonOf(r);
};

test('重跑分歧报第一处：记录不同取日志序号，两边都带原语列表时再取第一处不同的原语下标', () => {
  startNew();
  resetDrift();
  // 日志：0 号 lv 请求条目、1 号 drift 请求条目、2 号 drift 写的记录（原语列表第二项是计数器 1）。
  step(lv(1, 1));
  step({ request: 2, as: 'sys/gauge.mjs', kind: 'drift', driftMark: true });
  assert.equal(currentGame().book.entries.length, 3);
  assert.deepEqual(saveAction(0), { resultCode: 'ok' });
  logs.length = 0;
  // 重跑时计数器是 2：0、1 号相同，2 号记录的原语列表下标 1 的一项不同。
  assert.deepEqual(loadAction(0), { resultCode: 'error', rejectCode: 'E-REPLAY-DIVERGE' });
  assert.deepEqual(logs.map((r) => [r.code, r.fields.slot, r.fields.event, r.fields.primitive]), [['E-REPLAY-DIVERGE', 0, 2, 1]]);
});

test('读档换用存档里读回的世界数据副本 doc_data，不沿用当前局的（R27-4.2）；两局副本不同也读得进来', () => {
  startNew();
  step(lv(1, 3));
  assert.deepEqual(saveAction(1), { resultCode: 'ok' });
  const dataA = structuredClone(currentGame().data);
  // 另开一局，世界数据副本不同（追加段也不同），存档根目录相同。
  const other = newGame();
  other.data = { base: { tbl_a: { x: 99 } }, appends: [{ pack: 'p' }] };
  startGame({ ...other, book: createLogBook(LAYOUT, docOfState(compileLayout(LAYOUT), other.state, other.data)) });
  assert.deepEqual(loadAction(1), { resultCode: 'ok' });
  assert.deepEqual(currentGame().data, dataA);
  assert.equal(currentGame().state.gauge.gad_one.level, 3);
});

test('导入：导出的存档导入另一个槽位后，接同一条读档流程（卷二 :983）——导入的回应就是读档的结果，世界当场换成导出时那一刻；清单槽位编号改成目标槽位', async () => {
  const root = startNew();
  step(lv(1, 1)); step(pu(2, 7, true)); step(lv(3, 2)); step(lv(4, 3)); step(ho(5, 4));
  saveAction(1);
  const text = await exportedBundle(1);
  const before = structuredClone(currentGame().state);
  const digestBefore = digestNow();
  step(lv(6, 9));
  assert.notDeepEqual(currentGame().state, before);
  assert.deepEqual(await resultOf(importBody(text, 2)), { resultCode: 'ok' });
  assert.equal(JSON.parse(readFileSync(join(slotDirOf(root, 2), 'manifest.json'), 'utf8')).slot, 2);
  assert.deepEqual(currentGame().state, before);
  assert.equal(digestNow(), digestBefore);
});

test('导入拒收：超长、槽位越界、base64 或文件结构不对、分片被改、规则指纹不符；一律不写盘、不改已有槽位、恰一个响应', async () => {
  const root = startNew({ saveImportMaxBytes: 100000 });
  step(lv(1, 1)); step(pu(2, 7, true)); step(lv(3, 2));
  saveAction(1);
  const text = await exportedBundle(1);
  const image = dirImage(root);
  const file = JSON.parse(text);
  const [shardKey] = Object.keys(file.shards).sort();
  const tampered = (mut) => { const f = structuredClone(file); mut(f); return JSON.stringify(f); };
  const cases = [
    ['槽位 3 越界', importBody(text, 3), 'E-SAVE-SLOT-INVALID'],
    ['槽位 -1', importBody(text, -1), 'E-SAVE-SLOT-INVALID'],
    ['槽位 1.5', importBody(text, 1.5), 'E-SAVE-SLOT-INVALID'],
    ['槽位字串', importBody(text, '1'), 'E-SAVE-SLOT-INVALID'],
    ['槽位 null', importBody(text, null), 'E-SAVE-SLOT-INVALID'],
    ['空字节', { slot: 2, bytes: '' }, 'E-SAVE-TORN'],
    ['不是存档文件', importBody('hello', 2), 'E-SAVE-TORN'],
    ['JSON 但不是对象', importBody('[]', 2), 'E-SAVE-TORN'],
    ['缺 shards', importBody('{"manifest":{}}', 2), 'E-SAVE-TORN'],
    ['多一个键', importBody(tampered((f) => { f.extra = 1; }), 2), 'E-SAVE-TORN'],
    ['清单形状不对', importBody(tampered((f) => { delete f.manifest.clockMinute; }), 2), 'E-SAVE-TORN'],
    ['分片被改', importBody(tampered((f) => { f.shards[shardKey] += ' '; }), 2), 'E-SAVE-SHARD-DIGEST'],
    ['分片缺失', importBody(tampered((f) => { delete f.shards[shardKey]; }), 2), 'E-SAVE-SHARD-DIGEST'],
    ['规则指纹不符', importBody(tampered((f) => { f.manifest.rulesDigest = 'c'.repeat(64); }), 2), 'E-SAVE-RULES-MISMATCH'],
  ];
  for (const [name, body, code] of cases) assert.deepEqual(await resultOf(body), rejectedWith(code), name);
  // 缺 slot 或 bytes 不是字串：请求体形状不对。
  assert.deepEqual(await resultOf({ bytes: encode(text) }), rejectedWith('E-DIM-STRUCT-FIELD'));
  assert.deepEqual(await resultOf({ slot: 2 }), rejectedWith('E-DIM-STRUCT-FIELD'));
  assert.deepEqual(await resultOf({ slot: 2, bytes: 5 }), rejectedWith('E-DIM-STRUCT-FIELD'));
  assert.deepEqual(await resultOf('x'), rejectedWith('E-DIM-STRUCT-FIELD'));
  assert.deepEqual(dirImage(root), image);
  assert.equal(existsSync(slotDirOf(root, 2)), false);
});

test('导入拒收时目标槽位里已有的存档原样不动', async () => {
  const root = startNew();
  step(lv(1, 1));
  saveAction(1);
  saveAction(2);
  const text = await exportedBundle(1);
  const image = dirImage(slotDirOf(root, 2));
  const bad = JSON.stringify({ ...JSON.parse(text), shards: {} });
  assert.deepEqual(await resultOf(importBody(bad, 2)), rejectedWith('E-SAVE-SHARD-DIGEST'));
  assert.deepEqual(dirImage(slotDirOf(root, 2)), image);
});

test('导入长度上限 saveImportMaxBytes：请求体总长恰等于上限不算超，多 1 即 E-SAVE-IMPORT-SIZE；上限不能被 0、空值绕过（装配时拒收）', async () => {
  startNew();
  // 请求体 {"slot":0,"bytes":"aGk="} 序列化后 25 个字符（手数：{"slot":0, 10 个，"bytes":"aGk="} 15 个）。
  const body = { slot: 0, bytes: 'aGk=' };
  assert.equal(JSON.stringify(body).length, 25);
  const root = testTempRoot('saveroute-');
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 25 });
  // 恰等：过长度关，"hi" 不是存档文件 → 残缺。
  assert.deepEqual(await resultOf(body), rejectedWith('E-SAVE-TORN'));
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 24 });
  assert.deepEqual(await resultOf(body), rejectedWith('E-SAVE-IMPORT-SIZE'));
  for (const bad of [0, -1, 1.5, null, undefined, '100', NaN, Infinity]) {
    assert.throws(() => installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: bad }), (e) => e.code === 'E-DIM-STRUCT-FIELD', String(bad));
  }
  assert.throws(() => installSaveEnv({ root, layout: { ...LAYOUT, saveSlotCount: 0 }, rulesDigest: RULES, saveImportMaxBytes: 1 }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => installSaveEnv({ root, layout: LAYOUT, rulesDigest: 'xyz', saveImportMaxBytes: 1 }), (e) => e.code === 'E-DIM-STRUCT-FIELD');
  assert.deepEqual(readdirSync(root), []);
});

test('Sealed 重算：文件里叙述的 bytes 与 digest 不符（分片摘要与清单已跟着改成自洽）即 E-SEAL-DIGEST 拒收，不写盘', async () => {
  const root = startNew();
  step(lv(1, 1));
  saveAction(1);
  const file = JSON.parse(await exportedBundle(1));
  const oldKey = Object.keys(file.shards).find((d) => file.shards[d].includes('"$sealed"'));
  assert.ok(oldKey, 'fixture has a shard holding the Sealed value');
  const newText = file.shards[oldKey].replace('"bytes":"aGk="', '"bytes":"aGo="');
  assert.notEqual(newText, file.shards[oldKey]);
  const newKey = digestHex(newText);
  delete file.shards[oldKey];
  file.shards[newKey] = newText;
  const forged = JSON.stringify(file).replaceAll(oldKey, newKey);
  const image = dirImage(root);
  assert.deepEqual(await resultOf(importBody(forged, 2)), rejectedWith('E-SEAL-DIGEST'));
  assert.deepEqual(dirImage(root), image);
});

test('没有进行中的游戏（读档无处换）：导入回 save_unavailable，不写盘', async () => {
  const root = testTempRoot('saveroute-');
  resetSaveSession();
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 1000 });
  assert.deepEqual(await resultOf({ slot: 0, bytes: 'aGk=' }), { resultCode: 'save_unavailable' });
  assert.deepEqual(readdirSync(root), []);
});

test('导入的 base64 与 UTF-8 严格：非法 base64、填充不对、坏 UTF-8（过长编码）都 E-SAVE-TORN，不写盘；不需要注入任何解码能力', async () => {
  const root = startNew();
  const image = dirImage(root);
  for (const bytes of ['@@@@', 'aGk', 'aGk==', 'wIA=', '/w==', '']) assert.deepEqual(await resultOf({ slot: 1, bytes }), rejectedWith('E-SAVE-TORN'), bytes);
  assert.deepEqual(dirImage(root), image);
});

test('导入长度按 UTF-8 字节数计、先于形状与槽位核对：非 ASCII 的附带字段不能少算，超长即使形状也不对仍报 E-SAVE-IMPORT-SIZE', async () => {
  startNew();
  // {"slot":0,"bytes":"aGk=","note":"中中中"} 共 38 个 UTF-16 码元（手数：10 + 15 + 13），UTF-8 是 38 + 3 × 2 = 44 字节。
  const body = { slot: 0, bytes: 'aGk=', note: '中中中' };
  assert.equal(JSON.stringify(body).length, 38);
  const root = testTempRoot('saveroute-');
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 43 });
  assert.deepEqual(await resultOf(body), rejectedWith('E-SAVE-IMPORT-SIZE'));
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 44 });
  assert.deepEqual(await resultOf(body), rejectedWith('E-SAVE-TORN'));
  // 先长度后形状、后槽位：bytes 不是字串、槽位越界、体不是对象，超长时一律先报超长。
  installSaveEnv({ root, layout: LAYOUT, rulesDigest: RULES, saveImportMaxBytes: 30 });
  assert.deepEqual(await resultOf({ slot: 9, bytes: 5, note: '中'.repeat(20) }), rejectedWith('E-SAVE-IMPORT-SIZE'));
  assert.deepEqual(await resultOf('中'.repeat(20)), rejectedWith('E-SAVE-IMPORT-SIZE'));
  assert.deepEqual(readdirSync(root), []);
});

test('没有存档环境时导出、导入都回 save_unavailable，各恰一个响应', async () => {
  resetSaveSession();
  assert.deepEqual(jsonOf(await request('/save_export', { slot: 0 })), { resultCode: 'save_unavailable' });
  assert.deepEqual(await resultOf({ slot: 0, bytes: 'aGk=' }), { resultCode: 'save_unavailable' });
});

test('规则表 rules.host（卷二十七 §2.2 :191–192）：saveSlotCount、saveImportMaxBytes 是 ≥1 的整数，可直接装成存档环境；byte 是登记单位（卷二 :174）', () => {
  const h = W.rules.host;
  for (const k of ['saveSlotCount', 'saveImportMaxBytes']) assert.ok(Number.isInteger(h[k]) && h[k] >= 1, k);
  resetSaveSession();
  installSaveEnv({ root: testTempRoot('saveroute-'), layout: { ...LAYOUT, saveSlotCount: h.saveSlotCount }, rulesDigest: RULES, saveImportMaxBytes: h.saveImportMaxBytes });
  assert.ok(W.env.units.has('byte'));
});
