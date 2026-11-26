// S1-1 卡 B2（存档与重放）黑盒验收。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s1b2。
// 依据：卷二十七:534（清单字段）、:542（五部分，日志不在 state 里）、:544（指纹不符即拒载、不改文件）、
// :556–:558（分片、原子提交、片缺失回退 E-SAVE-TORN、空槽 E-SAVE-EMPTY）、:562（清单无时间戳；槽位 E-SAVE-SLOT-INVALID）、
// :740（复演逐条比对 E-REPLAY-DIVERGE）、:742（外来输入只有 command/advance，条目先单独提交）；卷二:545（被拒请求留在输入序列）。
// 不写死实体 kind、维度名、步长、槽位数：kind 与维度从 world/ontology/dimensions/*.json 读；步长与槽位数从 world/rules/tables/host.json 读。
// 存档文件名不写死：清单与片按内容识别（见 readManifests / shardFiles）；save-layout.json 的 files 行只断言其存在。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, basename, dirname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { init, saveSlot, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { testTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIM_DIR = join(ROOT, 'world/ontology/dimensions');
const MANIFEST_KEYS = ['clockMinute', 'dataPacksDigest', 'engineRulesDigest', 'logSegments', 'saveDigest', 'shardDigests', 'slot', 'snapshotIndex'];

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

const TABLES = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));

const HOST_ROWS = loadJson(join(ROOT, 'world/rules/tables/host.json')).rows;
function hostValue(key) {
  const row = HOST_ROWS.find((r) => r.key === key);
  assert.ok(row, `host.json 应有 ${key} 行`);
  return row.value;
}
const STEP = hostValue('heartbeatStepMinutes');
const SLOT_COUNT = hostValue('saveSlotCount');
assert.ok(Number.isInteger(STEP) && STEP >= 1, 'heartbeatStepMinutes 应为正整数');
assert.ok(Number.isInteger(SLOT_COUNT) && SLOT_COUNT >= 1, 'saveSlotCount 应为正整数');

function idPrefixOf(table) {
  const p = table.entity && table.entity.idPrefix;
  return Array.isArray(p) && p.length > 0 ? p[0] : null;
}

function firstRowId(table) {
  const id = Object.keys(table.rows ?? {})[0];
  assert.ok(id, `表 ${table.kind} 应至少有一条真实实体行`);
  return id;
}

// 第一个带 idPrefix 且含一条可写数值维度（非派生、modifiable 为 true、domain 有限）的表，用于 create + fact.set。
function writableNumberDim(table) {
  for (const [name, d] of Object.entries(table.dimensions ?? {})) {
    if (d.type !== 'number' || d.derived || d.modifiable !== true) continue;
    if (!Array.isArray(d.domain) || d.domain.length !== 2) continue;
    const [lo, hi] = d.domain;
    if (typeof lo !== 'number' || typeof hi !== 'number') continue;
    return { name, value: lo + (hi - lo) / 2 };
  }
  return null;
}
const WRITE_TABLE = TABLES.find((t) => idPrefixOf(t) !== null && writableNumberDim(t) !== null);
assert.ok(WRITE_TABLE, '维度表中应至少有一张带 idPrefix 且含可写数值维度的表');
const WRITE_DIM = writableNumberDim(WRITE_TABLE);

// ---- 目录与清单辅助（不写死文件名）----

function allFiles(root) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(root);
  return out.sort();
}

function snapshotDir(root) {
  return new Map(allFiles(root).map((p) => [p, readFileSync(p).toString('base64')]));
}

function parseJsonOrNull(p) {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

// 清单 = 目录里能解析成对象、且带 saveDigest 键的 JSON 文件（当前与上一份都算）。
function manifestFiles(root) {
  return allFiles(root).filter((p) => {
    const o = parseJsonOrNull(p);
    return o !== null && typeof o === 'object' && !Array.isArray(o) && 'saveDigest' in o;
  });
}

function shardFiles(root) {
  const ms = new Set(manifestFiles(root));
  return allFiles(root).filter((p) => !ms.has(p));
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function findNode(node, pred) {
  if (node && typeof node === 'object') {
    if (!Array.isArray(node) && pred(node)) return node;
    for (const v of Object.values(node)) {
      const hit = findNode(v, pred);
      if (hit) return hit;
    }
  }
  return null;
}

// 改结果事件的一个数值或布尔字段（不动 seq 与 kind），返回改了哪个键。
function perturbEvent(ev) {
  for (const k of Object.keys(ev)) {
    if (k === 'seq' || k === 'kind') continue;
    const v = ev[k];
    if (typeof v === 'number') {
      ev[k] = v + 1;
      return k;
    }
    if (typeof v === 'boolean') {
      ev[k] = !v;
      return k;
    }
  }
  return null;
}

// 断言抛出指定 code 的错误（同步或异步皆可）。
async function expectCode(fn, code) {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `应抛出 ${code}，实际没有抛错`);
  assert.equal(err.code, code, `错误码应为 ${code}，实为 ${err.code}：${err.message}`);
}

// 写入测试临时根下的文件，只经 tests/accept/temp-root.mjs 的唯一写入口（卷十二 S12-2）。
function putFile(root, p, data) {
  writeUnderTempRoot(root, relative(root, p), data);
}

async function withRoot(fn) {
  const root = testTempRoot('save-replay-s1b2-');
  // 临时根不删（建在 OS 临时目录，testTempRoot 保证在仓库外；S12-2 只认登记写入口，删除助手交门禁封口卡）。
  return fn(root);
}

async function createOne(env, kind, template, facts = {}) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = await env.submitProposal({ effects: [{ op: 'create', kind, template, facts }] });
  assert.equal(r.ok, true, `create ${kind} 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

// 开局后的一笔 fact.set 提案（先 create 再写可写数值维度）。
async function seedWorld(env) {
  const id = await createOne(env, WRITE_TABLE.kind, firstRowId(WRITE_TABLE));
  const r = await env.submitProposal({
    effects: [{ op: 'fact.set', entity: id, field: WRITE_DIM.name, value: WRITE_DIM.value }],
  });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}

async function roundTrip(env, root, slot = 0) {
  const manifest = await saveSlot(env, slot);
  const loaded = await loadSlot(manifest, { saveRoot: root });
  const replayed = await replay_apply(loaded);
  return { manifest, replayed };
}

// ---- 验收 ----

test('0. save-layout.json 登有 files 行（存档目录布局名不写死在测试里）', () => {
  const rows = loadJson(join(ROOT, 'world/rules/tables/save-layout.json')).rows;
  assert.ok(
    rows.some((r) => r.key === 'files'),
    'save-layout.json 应有 files 行，给出槽目录、清单、片目录等布局名',
  );
});

test('①存读恒等：fact.set 与 time 提案后 saveSlot→loadSlot→replay_apply，saveDigest 与 clock.minute 相等', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    await seedWorld(env);
    const r = await env.submitProposal({ effects: [{ op: 'time', minutes: STEP }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    const { manifest, replayed } = await roundTrip(env, root);
    assert.equal(replayed.saveDigest, manifest.saveDigest, '复演的 saveDigest 应与存盘时逐字相等');
    assert.equal(replayed.state.clock.minute, env.state.clock.minute, '复演的 clock.minute 应相等');
  }));

test('②日志不在 state：init 后 state 无 log 键；提交后 logBook.entries 增加，state 顶层键集合不变', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    assert.ok(!('log' in env.state), 'state 顶层不应有 log 键（卷二十七:542）');
    const keysBefore = Object.keys(env.state).sort();
    const entriesBefore = env.logBook.entries.length;
    const r = await env.submitProposal({ effects: [{ op: 'time', minutes: STEP }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.ok(env.logBook.entries.length > entriesBefore, '提交后日志簿应增加条目');
    assert.deepEqual(Object.keys(env.state).sort(), keysBefore, 'state 顶层键集合提交前后不变');
    assert.ok(!('log' in env.state), 'state 仍无 log 键');
  }));

test('③心跳重放：连续 3 次 advance(步长) 后存读复演，时钟 = 起点 + 3×步长，saveDigest 相等', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    const start = env.state.clock.minute;
    for (let i = 0; i < 3; i++) await env.advance(STEP);
    assert.equal(env.state.clock.minute, start + 3 * STEP, '推进后时钟应为起点加 3 倍步长');
    const { manifest, replayed } = await roundTrip(env, root);
    assert.equal(replayed.state.clock.minute, start + 3 * STEP, '复演时钟应为起点加 3 倍步长');
    assert.equal(replayed.saveDigest, manifest.saveDigest);
  }));

test('④提交后推进不重复记账：time 25 提案的新增条目里 advance 为 0、command 为 1；复演时钟只增 25', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    const start = env.state.clock.minute;
    const before = env.logBook.entries.length;
    const r = await env.submitProposal({ effects: [{ op: 'time', minutes: 25 }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(env.state.clock.minute - start, 25, '提交后时钟应增 25');
    const added = env.logBook.entries.slice(before);
    assert.equal(added.filter((e) => e.kind === 'advance').length, 0, '提交后由 time 引起的推进不记 advance 条目（卷二十七:742）');
    assert.equal(added.filter((e) => e.kind === 'command').length, 1, '本次提案应记一条 command 条目');
    const { replayed } = await roundTrip(env, root);
    assert.equal(replayed.state.clock.minute - start, 25, '复演后时钟应只增 25，不得是 50（重复记账）');
  }));

test('⑤被拒请求留在序列：先必被拒的提案再合法提案 → 两条 command；存读复演 saveDigest 相等', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    const before = env.logBook.entries.length;
    const bad = await env.submitProposal({ effects: [{ op: 'time', minutes: -5 }] });
    assert.equal(bad.ok, false, '负分钟 time 提案应被拒');
    const good = await env.submitProposal({ effects: [{ op: 'time', minutes: STEP }] });
    assert.equal(good.ok, true, JSON.stringify(good));
    const commands = (entries) => entries.filter((e) => e.kind === 'command').length;
    assert.equal(commands(env.logBook.entries.slice(before)), 2, '被拒与合法两次提案各应留一条 command 条目');
    const { manifest, replayed } = await roundTrip(env, root);
    assert.equal(replayed.saveDigest, manifest.saveDigest, '复演 saveDigest 应相等');
    assert.equal(commands(replayed.logBook.entries), commands(env.logBook.entries), '复演后输入序列的 command 数应与存盘时相同');
  }));

test('⑥篡改结果事件：改日志片内容并让片摘要自洽后，replay_apply 或 loadSlot 抛 E-REPLAY-DIVERGE', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    await seedWorld(env);
    const r = await env.submitProposal({ effects: [{ op: 'time', minutes: STEP }] });
    assert.equal(r.ok, true, JSON.stringify(r));
    await saveSlot(env, 0);

    // 找到含 kind 为 event 的结果事件的片（日志片）。
    const target = shardFiles(root).find((p) => {
      const o = parseJsonOrNull(p);
      return o !== null && findNode(o, (n) => n.kind === 'event') !== null;
    });
    assert.ok(target, '应有一片含 kind 为 event 的结果事件');
    const original = readFileSync(target);
    const oldDigest = sha256(original);
    assert.ok(basename(target).includes(oldDigest), '片文件名应为其内容的 sha256（按 save-layout files 行的规则）');

    const data = JSON.parse(original.toString('utf8'));
    const ev = findNode(data, (n) => n.kind === 'event');
    const key = perturbEvent(ev);
    assert.ok(key, '结果事件应有可改的数值或布尔字段');
    const newBytes = Buffer.from(JSON.stringify(data), 'utf8');
    const newDigest = sha256(newBytes);
    putFile(root, join(dirname(target), basename(target).split(oldDigest).join(newDigest)), newBytes);
    for (const m of manifestFiles(root)) {
      putFile(root, m, readFileSync(m, 'utf8').split(oldDigest).join(newDigest));
    }

    const current = readManifestCurrent(root);
    await expectCode(async () => replay_apply(await loadSlot(current, { saveRoot: root })), 'E-REPLAY-DIVERGE');
  }));

test('⑦a片损坏回退：存两次，覆写当前清单独有的片使摘要不符 → loadSlot 回退上一清单，复演得前一次存档的 saveDigest', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    await seedWorld(env);
    const first = await saveSlot(env, 0);
    await env.advance(STEP);
    const second = await saveSlot(env, 0);
    assert.notEqual(second.saveDigest, first.saveDigest, '两次存档之间世界应有变化');

    const curText = JSON.stringify(second);
    const prevText = JSON.stringify(first);
    const target = shardFiles(root).find((p) => {
      const name = basename(p).replace(/\.[^.]*$/, '');
      return curText.includes(name) && !prevText.includes(name);
    });
    assert.ok(target, '当前清单应引用一片上一清单未引用的片');
    // 覆写为摘要不符的内容（卷二十七:558「引用的片缺失或摘要不符」同一处置）。
    putFile(root, target, Buffer.from('corrupted-shard-s1b2', 'utf8'));

    const loaded = await loadSlot(second, { saveRoot: root });
    const replayed = await replay_apply(loaded);
    assert.equal(replayed.saveDigest, first.saveDigest, '回退后复演应得前一次存档的 saveDigest');
  }));

test('⑦b空槽：从未存过的合法槽位 loadSlot → E-SAVE-EMPTY', () =>
  withRoot(async (root) => {
    await init({ saveRoot: root });
    await expectCode(() => loadSlot({ slot: 0 }, { saveRoot: root }), 'E-SAVE-EMPTY');
  }));

test('⑧规则指纹不符：改清单 engineRulesDigest 或 dataPacksDigest → loadSlot 抛 E-SAVE-RULES-MISMATCH，目录字节不变', async () => {
  for (const field of ['engineRulesDigest', 'dataPacksDigest']) {
    await withRoot(async (root) => {
      const env = await init({ saveRoot: root });
      await seedWorld(env);
      await saveSlot(env, 0);
      for (const m of manifestFiles(root)) {
        const obj = JSON.parse(readFileSync(m, 'utf8'));
        assert.ok(field in obj, `清单应有 ${field} 字段`);
        obj[field] = obj[field] === '0'.repeat(64) ? 'f'.repeat(64) : '0'.repeat(64);
        putFile(root, m, JSON.stringify(obj));
      }
      const tampered = readManifestCurrent(root);
      const before = snapshotDir(root);
      await expectCode(() => loadSlot(tampered, { saveRoot: root }), 'E-SAVE-RULES-MISMATCH');
      assert.deepEqual(snapshotDir(root), before, `${field} 不符拒载时存档目录文件字节不得改变`);
    });
  }
});

test('⑨槽位越界：saveSlotCount、-1、1.5 → E-SAVE-SLOT-INVALID，目录无新文件', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    const before = allFiles(root);
    for (const slot of [SLOT_COUNT, -1, 1.5]) {
      await expectCode(() => saveSlot(env, slot), 'E-SAVE-SLOT-INVALID');
    }
    assert.deepEqual(allFiles(root), before, '非法槽位不得写任何文件');
  }));

test('⑩清单键集合恰为八个且无时间戳；同一世界存两次，清单逐字节相同', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    await seedWorld(env);
    const manifest = await saveSlot(env, 0);
    assert.deepEqual(Object.keys(manifest).sort(), MANIFEST_KEYS, '清单键集合应恰为卷二十七:534 所列八个');
    for (const m of manifestFiles(root)) {
      assert.deepEqual(Object.keys(JSON.parse(readFileSync(m, 'utf8'))).sort(), MANIFEST_KEYS, '落盘清单键集合同上');
    }
    const firstBytes = readFileSync(manifestFiles(root)[0]);
    await saveSlot(env, 0);
    for (const m of manifestFiles(root)) {
      assert.deepEqual(readFileSync(m), firstBytes, '同一世界两次存盘，清单文件应逐字节相同');
    }
  }));

test('⑪同一世界连存两次，片文件数不变（写时复制，不新增片）', () =>
  withRoot(async (root) => {
    const env = await init({ saveRoot: root });
    await seedWorld(env);
    await saveSlot(env, 0);
    const n1 = shardFiles(root).length;
    await saveSlot(env, 0);
    const n2 = shardFiles(root).length;
    assert.equal(n2, n1, '同一世界再存一次不应新增片文件');
  }));

// 当前清单 = 落盘清单里 clockMinute 最大者（⑦ 之后上一份清单的时钟更小）。
function readManifestCurrent(root) {
  const all = manifestFiles(root).map((p) => JSON.parse(readFileSync(p, 'utf8')));
  assert.ok(all.length >= 1, '应至少有一份落盘清单');
  return all.reduce((a, b) => (b.clockMinute > a.clockMinute ? b : a));
}
