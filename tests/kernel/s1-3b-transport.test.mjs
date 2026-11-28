// S1-3b 单测：路由、菜单入口与存档四路（写码方自补，不作验收依据；S1-3 接口草案 §6 第 7–11 条中不经动作执行器的部分）。
// 全程经真宿主路由：express app + Router 交 init(router, opts)，listen(0) 后用 fetch 发真请求，只读产品输出（ReplyResult 与导出字节），不 mock。
// 动作载荷经执行器的部分（第 2–6、12 条）等 S1-3a 合入后由端到端烟测覆盖。期望值按卷文或在测试里先造前提，不抄仓库基线计数。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { express } from '../support/express.mjs';
import { testTempRoot } from '../accept/temp-root.mjs';
import { init } from '../../server-plugin/index.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners, shardDirOf } from '../../server-plugin/rules/load/registry-shards.mjs';
import { createRouterCaps } from '../../server-plugin/rules/transport/router-caps.mjs';
import { mountSaveRoutes } from '../../server-plugin/kernel/save.mjs';
import { canonical } from '../../server-plugin/kernel/storage.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { T } from '../../server-plugin/kernel/handles.mjs';
import { KernelError } from '../../server-plugin/kernel/errors.mjs';

const R = T.code_enum.reply_result;
const BODY = T.code_enum.wire_body;
const wire = JSON.parse(readFileSync(new URL('../../world/schema/wire-v1.json', import.meta.url), 'utf8'));
const [kAct, kReport, kUi] = wire.enums.menu_payload;
const [opSave, opLoad] = wire.enums.save_op;
const [cmdView] = wire.enums.ui_command;

/** 起一个真宿主：express app 上挂 router，交给 mount(router)；返回发请求的函数与关停。 @param {(router: any) => Promise<any> | any} mount */
async function host(mount) {
  const app = express();
  const router = express.Router();
  const mounted = await mount(router);
  app.use(router);
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const base = `http://127.0.0.1:${/** @type {any} */ (server).address().port}`;
  /** @param {string} route @param {string} text 请求体原文 */
  const post = async (route, text) => {
    const res = await fetch(`${base}/${route}`, { method: 'POST', body: text });
    return { wireBody: res.headers.get('wire_body'), responseId: res.headers.get('responseId'), text: await res.text() };
  };
  /** @param {string} route @param {unknown} body */
  const call = async (route, body) => {
    const r = await post(route, JSON.stringify(body));
    assert.equal(r.wireBody, BODY.envelope, `${route} 回应应走 envelope`);
    return JSON.parse(r.text);
  };
  return { mounted, post, call, close: () => new Promise((r) => server.close(r)) };
}

const play = (/** @type {string} */ name) => host((router) => init(router, { saveRoot: testTempRoot(name) }));

test('界面命令 view 纯读：回 ok，不进日志、不改 saveDigest；给 subject（可见集为空）对存在与不存在的 id 同回 E-DISPLAY-SUBJECT', async () => {
  const h = await play('s13b-view');
  try {
    const before = await h.call('menu', { payload: kAct, save: opSave, saveSlot: 0 });
    const v = await h.call('menu', { payload: kUi, command: cmdView });
    assert.equal(v.result, R.ok);
    const after = await h.call('menu', { payload: kAct, save: opSave, saveSlot: 1 });
    assert.equal(after.save.clockMinute, before.save.clockMinute);
    const a = await h.post('save_export', JSON.stringify({ slot: 0 }));
    const b = await h.post('save_export', JSON.stringify({ slot: 1 }));
    assert.equal(JSON.parse(a.text).manifest.saveDigest, JSON.parse(b.text).manifest.saveDigest, 'view 前后存档摘要相同');
    assert.equal(JSON.parse(b.text).manifest.snapshotIndex.length, JSON.parse(a.text).manifest.snapshotIndex.length);
    const placeId = h.mounted.engine.bake.placeTree.byLevel[0];
    const seen = await h.call('menu', { payload: kUi, command: cmdView, subject: placeId });
    const unseen = await h.call('menu', { payload: kUi, command: cmdView, subject: 'zz_no_such_entity' });
    assert.deepEqual(seen, { result: R.rejected, code: 'E-DISPLAY-SUBJECT' });
    assert.deepEqual(unseen, seen, '存在与不存在的 id 回应同形');
  } finally { await h.close(); }
});

test('错误上报回 received；未登记码与收窄失败（非 JSON、未知 payload、多余字段、动作与存读档字段混用）回 rejected + E-WIRE-ENVELOPE', async () => {
  const h = await play('s13b-report');
  try {
    assert.deepEqual(await h.call('menu', { payload: kReport, code: 'E-SAVE-EMPTY', fields: { slot: 1 } }), { result: R.received });
    const envelope = { result: R.rejected, code: 'E-WIRE-ENVELOPE' };
    assert.deepEqual(await h.call('menu', { payload: kReport, code: 'E-NOT-A-CODE' }), envelope);
    const raw = await h.post('menu', '{not json');
    assert.deepEqual(JSON.parse(raw.text), envelope);
    assert.deepEqual(await h.call('menu', { payload: 'zz' }), envelope);
    assert.deepEqual(await h.call('menu', { payload: kUi, command: cmdView, extra: 1 }), envelope);
    assert.deepEqual(await h.call('menu', { payload: kAct, act: 'x', save: opSave, saveSlot: 0 }), envelope);
    assert.deepEqual(await h.call('menu', { payload: kAct, save: opSave }), envelope);
  } finally { await h.close(); }
});

test('菜单存读档：槽位越界 E-SAVE-SLOT-INVALID、空槽读档 E-SAVE-EMPTY；读档后立即再存，saveDigest 与读档前那一份逐字节相同', async () => {
  const h = await play('s13b-saveload');
  try {
    const n = h.mounted.engine.host.saveSlotCount;
    assert.deepEqual(await h.call('menu', { payload: kAct, save: opSave, saveSlot: n }), { result: R.rejected, code: 'E-SAVE-SLOT-INVALID' });
    assert.deepEqual(await h.call('menu', { payload: kAct, save: opLoad, saveSlot: 0 }), { result: R.rejected, code: 'E-SAVE-EMPTY' });
    const saved = await h.call('menu', { payload: kAct, save: opSave, saveSlot: 0 });
    assert.equal(saved.result, R.ok);
    assert.deepEqual(Object.keys(saved.save).sort(), ['clockMinute', 'slot'], '存档清单显示字段只有槽位与世界时钟（卷二 :1014）');
    const loaded = await h.call('menu', { payload: kAct, save: opLoad, saveSlot: 0 });
    assert.deepEqual(loaded, saved);
    await h.call('menu', { payload: kAct, save: opSave, saveSlot: 2 });
    const d0 = JSON.parse((await h.post('save_export', JSON.stringify({ slot: 0 }))).text).manifest.saveDigest;
    const d2 = JSON.parse((await h.post('save_export', JSON.stringify({ slot: 2 }))).text).manifest.saveDigest;
    assert.equal(d2, d0);
  } finally { await h.close(); }
});

test('save_export：成功回 wire_body=bytes 的导出包（format 取 wire schema），各片摘要可重算；失败走 envelope 拒收代号', async () => {
  const h = await play('s13b-export');
  try {
    await h.call('menu', { payload: kAct, save: opSave, saveSlot: 0 });
    const r = await h.post('save_export', JSON.stringify({ slot: 0 }));
    assert.equal(r.wireBody, BODY.bytes);
    assert.equal(r.responseId, null, '导出成功不经 postReply');
    const pkg = JSON.parse(r.text);
    assert.equal(pkg.format, wire.exportFormat);
    const cap = createDigestCap();
    for (const [digest, text] of Object.entries(pkg.shards)) assert.equal(cap.sha256Hex(/** @type {string} */ (text), 'utf8'), digest);
    assert.deepEqual(await h.call('save_export', { slot: 1 }), { result: R.rejected, code: 'E-SAVE-EMPTY' });
    assert.deepEqual(await h.call('save_export', { slot: -1 }), { result: R.rejected, code: 'E-SAVE-SLOT-INVALID' });
    assert.deepEqual(await h.call('save_export', { slot: '0' }), { result: R.rejected, code: 'E-WIRE-ENVELOPE' });
  } finally { await h.close(); }
});

/** 导出包 → save_import 请求体。 @param {number} slot @param {string} pkgText */
const importBody = (slot, pkgText) => JSON.stringify({ slot, bytes: Buffer.from(pkgText, 'utf8').toString('base64') });

test('save_import：合法字节导入后可读档、不改当前 state；改一片一字节 E-SAVE-SHARD-DIGEST；指纹不同 E-SAVE-RULES-MISMATCH；槽位越界 E-SAVE-SLOT-INVALID', async () => {
  const h = await play('s13b-import');
  try {
    const saved = await h.call('menu', { payload: kAct, save: opSave, saveSlot: 0 });
    const pkgText = (await h.post('save_export', JSON.stringify({ slot: 0 }))).text;
    const before = canonical({ state: h.mounted.state, log: h.mounted.logBook.entries });
    assert.deepEqual(JSON.parse((await h.post('save_import', importBody(3, pkgText))).text), { result: R.ok, save: { slot: 3, clockMinute: saved.save.clockMinute } });
    assert.equal(canonical({ state: h.mounted.state, log: h.mounted.logBook.entries }), before, '导入不改当前 state 与日志');
    assert.deepEqual(await h.call('menu', { payload: kAct, save: opLoad, saveSlot: 3 }), { result: R.ok, save: { slot: 3, clockMinute: saved.save.clockMinute } });

    const pkg = JSON.parse(pkgText);
    const logDigest = pkg.manifest.shardDigests.doc_log;
    const text = pkg.shards[logDigest];
    const tampered = canonical({ ...pkg, shards: { ...pkg.shards, [logDigest]: `${text.slice(0, -1)} ` } });
    assert.deepEqual(JSON.parse((await h.post('save_import', importBody(4, tampered))).text), { result: R.rejected, code: 'E-SAVE-SHARD-DIGEST' });
    const foreign = canonical({ ...pkg, manifest: { ...pkg.manifest, dataPacksDigest: `${pkg.manifest.dataPacksDigest.slice(1)}0` } });
    assert.deepEqual(JSON.parse((await h.post('save_import', importBody(4, foreign))).text), { result: R.rejected, code: 'E-SAVE-RULES-MISMATCH' });
    assert.deepEqual(JSON.parse((await h.post('save_import', importBody(h.mounted.engine.host.saveSlotCount, pkgText))).text), { result: R.rejected, code: 'E-SAVE-SLOT-INVALID' });
    assert.deepEqual(await h.call('menu', { payload: kAct, save: opLoad, saveSlot: 4 }), { result: R.rejected, code: 'E-SAVE-EMPTY' }, '被拒的导入不写盘');
  } finally { await h.close(); }
});

/**
 * state-owners 声明表 = 主文件与 state-owners.d/ 分片的合并（S2-TP1 主会话授权改夹具：开局一步写持有边与账本后须带分片登记）；
 * 合并只调生产入口 rules/load/registry-shards.mjs 的 shardDirOf、mergeOwners，测试只读文件。
 */
function ownersOf(o, json) {
  const main = 'world/ontology/state-owners.json';
  const dir = new URL(`../../${shardDirOf(main)}/`, o);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `${shardDirOf(main)}/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  // 合并结果冻结；测试副本要可改，取一份深拷贝（同 s2-p-position.test.mjs 的 clone(owners())）。
  return JSON.parse(JSON.stringify(mergeOwners({ file: main, doc: json('state-owners.json') }, shards).doc));
}

/** 世界数据原文（与 index.mjs 同形），可改 host 表某键。 @param {string} key @param {number} value */
function rawWorldWithHost(key, value) {
  const o = new URL('../../world/ontology/', import.meta.url);
  const json = (/** @type {string} */ f) => JSON.parse(readFileSync(new URL(f, o), 'utf8'));
  const dir = new URL('dimensions/', o);
  const registryRows = json('../rules/registry.json').rows;
  const tableDocs = Object.fromEntries(registryRows.map((/** @type {any} */ r) => [r.code, json(`../rules/${r.file}`)]));
  const hostCode = registryRows.find((/** @type {any} */ r) => r.file === 'tables/host.json').code;
  tableDocs[hostCode] = { ...tableDocs[hostCode], rows: tableDocs[hostCode].rows.map((/** @type {any} */ r) => (r.key === key ? { ...r, value } : r)) };
  return {
    dimensionDocs: readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'))),
    namedStructsDoc: json('named-structs.json'), owners: ownersOf(o, json), registryRows, tableDocs,
    digestExclude: json('../rules/tables/digest-exclude.json').paths, primitivesDoc: json('primitives.json'),
    // S2-TP1（同类授权）：开局一步现经账本入账，账本按单位表算日序，夹具带上单位表（同 index.mjs 世界数据形状）。
    vocabDoc: json('dimensions/_vocab.json'), unitsDoc: json('dimensions/_units.json'), wire,
  };
}

test('save_import 请求体超过 rules.host.saveImportMaxBytes 即 E-SAVE-IMPORT-SIZE（上限在测试副本里改小，先造前提）', async () => {
  const limit = 64;
  const caps = { digestCap: createDigestCap(), saveRoot: pathToFileURL(`${testTempRoot('s13b-size')}/`), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) };
  const h = await host((router) => {
    const world = mountKernel(rawWorldWithHost('saveImportMaxBytes', limit), caps);
    const { requestCap, replyCap } = createRouterCaps(router);
    mountSaveRoutes(requestCap, replyCap, world);
    return world;
  });
  try {
    const body = JSON.stringify({ slot: 0, bytes: 'A'.repeat(limit) });
    assert.ok(Buffer.byteLength(body, 'utf8') > limit);
    assert.deepEqual(JSON.parse((await h.post('save_import', body)).text), { result: R.rejected, code: 'E-SAVE-IMPORT-SIZE' });
  } finally { await h.close(); }
});

test('每个带 ReplyHandle 的请求恰回应一次：二次用同句柄 E-WIRE-REPLY；处理完未回应补回 error + E-WIRE-REPLY；处理抛无登记码的错回 error + E-WIRE-REPLY、抛带码的错回 error + 该码（卷二:1017 只含错误代号）；responseId 单调', async () => {
  /** @type {unknown[]} */
  const second = [];
  const routes = T.code_enum.wire_route;
  const h = await host((router) => {
    const { requestCap, replyCap } = createRouterCaps(router);
    requestCap.on(routes.menu, (/** @type {unknown} */ _raw, /** @type {object} */ reply) => {
      replyCap.postReply(reply, { result: R.ok });
      try { replyCap.postReply(reply, { result: R.ok }); } catch (e) { second.push(/** @type {any} */ (e).code); }
    });
    requestCap.on(routes.input, () => {});
    requestCap.on(routes.save_export, () => { throw new Error('boom'); });
    requestCap.on(routes.save_import, () => { throw new KernelError('E-SAVE-EMPTY'); });
    assert.throws(() => requestCap.on('zz', () => {}), /E-WIRE-ENVELOPE/);
    return null;
  });
  try {
    const a = await h.post('menu', '{}');
    assert.deepEqual(JSON.parse(a.text), { result: R.ok });
    assert.deepEqual(second, ['E-WIRE-REPLY']);
    const b = await h.post('input', '{}');
    assert.deepEqual(JSON.parse(b.text), { result: R.error, code: 'E-WIRE-REPLY' });
    const c = await h.post('save_export', '{}');
    assert.deepEqual(JSON.parse(c.text), { result: R.error, code: 'E-WIRE-REPLY' });
    const d = await h.post('save_import', '{}');
    assert.deepEqual(JSON.parse(d.text), { result: R.error, code: 'E-SAVE-EMPTY' });
    assert.ok(Number(a.responseId) < Number(b.responseId) && Number(b.responseId) < Number(c.responseId) && Number(c.responseId) < Number(d.responseId));
  } finally { await h.close(); }
});

test('init 必须传宿主 router（卷二:1033；无路由模式已撤）：不传即拒，不静默只装配', async () => {
  await assert.rejects(() => init(undefined, { saveRoot: testTempRoot('s13b-no-router') }));
});
