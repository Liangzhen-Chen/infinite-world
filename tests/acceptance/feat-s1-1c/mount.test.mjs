// S1-1 卡 C（挂载与启动强断言）黑盒验收。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s1c。
// 依据：卷二十七:553（分片表用 part_by_unit 才须 unitOfPath，缺即 E-SAVE-SHARD-UNCOVERED）、卷二:2476（inputsOf 同一冻结对象）、
// 卷二:512–513（dim:<kind> 依赖、加载期 uses 传递闭包、环 E-VIEW-DEPS-CYCLE）、卷二十七:543/:547（存档 doc_data 为世界数据副本）、
// 卷二十七:742（读档续玩走同一输入序列）；派卡 docs/卡档案/feat-s1-1c/派卡.md 的设计约定。
// 不写死数值、表名、文件名：kind 与维度从 world/ontology/dimensions/*.json 读；步长从 world/rules/tables/host.json 读；
// 登记表从 world/rules/registry.json 每行 file 读。files.json 长度 15 为卡文明确要求，照写。
// raw 世界数据的形状镜像 server-plugin/index.mjs 的 readWorld（master f53db9880）；mountKernel 的 raw 取该形状。
// 临时根用 tests/accept/temp-root.mjs#testTempRoot，不清理，写文件只用 writeUnderTempRoot（不用删除函数）。
import { express } from '../../support/express.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init, saveSlot, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { mountKernel } from '../../../server-plugin/rules/load/mount.mjs';
import { inputsOf, closeInputs } from '../../../server-plugin/kernel/memo.mjs';
import { modified, dim } from '../../../server-plugin/kernel/dimensions.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { testTempRoot, writeUnderTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const ONTOLOGY = join(WORLD, 'ontology');
const DIM_DIR = join(ONTOLOGY, 'dimensions');

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

// 实体表：维度表目录里除下划线开头的元表外都是实体表（与 index.mjs 同口径）。
const TABLES = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));

const REGISTRY_ROWS = loadJson(join(WORLD, 'rules/registry.json')).rows;
const HOST_ROWS = loadJson(join(WORLD, 'rules/tables/host.json')).rows;
function hostValue(key) {
  const row = HOST_ROWS.find((r) => r.key === key);
  assert.ok(row, `host.json 应有 ${key} 行`);
  return row.value;
}
const STEP = hostValue('heartbeatStepMinutes');
assert.ok(Number.isInteger(STEP) && STEP >= 1, 'heartbeatStepMinutes 应为正整数');

function idPrefixOf(table) {
  const p = table.entity && table.entity.idPrefix;
  return Array.isArray(p) && p.length > 0 ? p[0] : null;
}
function firstRowId(table) {
  const id = Object.keys(table.rows ?? {})[0];
  assert.ok(id, `表 ${table.kind} 应至少有一条真实实体行`);
  return id;
}
// 第一个带 idPrefix 且含一条可写数值维度（非派生、modifiable 为 true、domain 有限）的表。
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

// 镜像 index.mjs 的 readWorld（raw 形状）。
function readRaw() {
  const json = (f) => loadJson(join(ONTOLOGY, f));
  const tableDocs = Object.fromEntries(REGISTRY_ROWS.map((r) => [r.code, loadJson(join(WORLD, 'rules', r.file))]));
  return {
    dimensionDocs: TABLES,
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    registryRows: REGISTRY_ROWS,
    tableDocs,
    digestExclude: loadJson(join(WORLD, 'rules/tables/digest-exclude.json')).paths,
    primitivesDoc: json('primitives.json'),
    // 与 index.mjs#readWorld 同形（S1-2b 词表族、S2-0a 单位表）。
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
  };
}

// 键序规范化（存档落盘的 doc_data 键序已排序，比较前两边都按键名排序）。
function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (v !== null && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

// 镜像 index.mjs 的 readSources：kernel/files.json 登记的文件 ∪ server-plugin/rules 下全部 .mjs。
function mjsUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = join(dir, d.name);
    if (d.isDirectory()) return mjsUnder(p);
    return d.name.endsWith('.mjs') ? [p] : [];
  });
}
function readSources() {
  const kernel = loadJson(join(ROOT, 'server-plugin/kernel/files.json'));
  const rules = mjsUnder(join(ROOT, 'server-plugin/rules')).map((p) => relative(ROOT, p).split('\\').join('/'));
  return [...kernel, ...rules].sort().map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
}

// 合法 caps 基线（saveRoot 为临时根的 file: URL，以 / 结尾）。
function goodCaps(root) {
  return {
    digestCap: createDigestCap(),
    saveRoot: new URL(pathToFileURL(root).href.replace(/\/?$/, '/')),
    sources: readSources(),
    modifierSources: [],
  };
}

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

// 断言抛出指定 code 的错误（同步或异步皆可）；返回错误对象供进一步断言。
async function expectCode(fn, code, label = '') {
  let err = null;
  try {
    await fn();
  } catch (e) {
    err = e;
  }
  assert.ok(err, `${label} 应抛出 ${code}，实际没有抛错`);
  assert.equal(err.code, code, `错误码应为 ${code}，实为 ${err.code}：${err.message}`);
  return err;
}

// 开局后的一组提案：create 一实体、写其可写数值维度、推进一步；同一序列两个世界里跑，输入相同。
async function createOne(env, kind, template, facts = {}) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = await env.submitProposal({ effects: [{ op: 'create', kind, template, facts }] });
  assert.equal(r.ok, true, `create ${kind} 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}
async function playScript(env) {
  const id = await createOne(env, WRITE_TABLE.kind, firstRowId(WRITE_TABLE));
  let r = await env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: WRITE_DIM.name, value: WRITE_DIM.value }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  r = await env.submitProposal({ effects: [{ op: 'time', minutes: STEP }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  return id;
}

// closeInputs 的返回形状未在卡文定死：按 Map 或普通对象取某节点的闭包，再看闭包（JSON 文本）里是否含某项。
function closureOf(out, node) {
  return out instanceof Map ? out.get(node) : out[node];
}

// ---- 验收 ----

test('①init 成功并返回六项：engine、state、logBook、submitProposal、advance、save', () => {
  const root = testTempRoot('mount-s1c-');
  return init(express.Router(), { saveRoot: root }).then((env) => {
    for (const k of ['engine', 'state', 'logBook', 'submitProposal', 'advance', 'save']) {
      assert.ok(k in env, `返回值应含 ${k}`);
    }
  });
});

test('②caps 缺任一字段（saveRoot、digestCap、sources、modifierSources）→ mount 抛 E-DIM-STRUCT-FIELD，消息含字段名，且抛出前临时根下无文件', async () => {
  for (const field of ['saveRoot', 'digestCap', 'sources', 'modifierSources']) {
    const root = testTempRoot('mount-s1c-');
    const caps = goodCaps(root);
    delete caps[field];
    const before = allFiles(root);
    const err = await expectCode(() => mountKernel(readRaw(), caps), 'E-DIM-STRUCT-FIELD');
    assert.match(err.message, new RegExp(field), `错误消息应含字段名 ${field}`);
    assert.deepEqual(allFiles(root), before, `缺 ${field} 时抛错前临时根下不得有文件`);
  }
});

test('③caps 值不合即在 mount 时抛 E-DIM-STRUCT-FIELD：saveRoot 不以 / 结尾的 file: URL、http: URL；sources 为 []；modifierSources 为 [1]；unitOfPath 为字串', async () => {
  const root = testTempRoot('mount-s1c-');
  const bad = [
    { name: 'saveRoot 无尾斜杠', make: (c) => ({ ...c, saveRoot: new URL(pathToFileURL(root).href) }) },
    { name: 'saveRoot 为 http: URL', make: (c) => ({ ...c, saveRoot: new URL('http://example.invalid/saves/') }) },
    { name: 'sources 为空数组', make: (c) => ({ ...c, sources: [] }) },
    { name: 'modifierSources 含非函数', make: (c) => ({ ...c, modifierSources: [1] }) },
    { name: 'unitOfPath 为字串', make: (c) => ({ ...c, unitOfPath: 'not-a-function' }) },
  ];
  for (const { name, make } of bad) {
    await expectCode(() => mountKernel(readRaw(), make(goodCaps(root))), 'E-DIM-STRUCT-FIELD', name);
  }
});

test('④不给 unitOfPath、数据现状 → 启动成功；raw 副本里某分片改为 part_by_unit → 抛 E-SAVE-SHARD-UNCOVERED（只改内存副本）', async () => {
  const root = testTempRoot('mount-s1c-');
  const caps = goodCaps(root);
  assert.equal('unitOfPath' in caps, false, '基线 caps 不给 unitOfPath');
  const ok = mountKernel(readRaw(), caps);
  for (const k of ['engine', 'state', 'logBook', 'submitProposal', 'advance', 'save']) assert.ok(k in ok, `返回值应含 ${k}`);

  const raw = readRaw();
  const shards = raw.tableDocs.saveLayout.rows.find((r) => r.key === 'shards');
  assert.ok(shards && shards.value && typeof shards.value === 'object', 'save-layout.json 应有 shards 行');
  const part = Object.keys(shards.value)[0];
  assert.ok(part, 'shards 行应至少覆盖一个分片部分');
  shards.value[part] = 'part_by_unit';
  await expectCode(() => mountKernel(raw, goodCaps(root)), 'E-SAVE-SHARD-UNCOVERED');
});

test('⑤modifierSources 被去掉的 engine 调 modified → E-DIM-STRUCT-FIELD；modifierSources 为空数组时 modified.value === dim.value', async () => {
  const root = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: root });
  const id = await createOne(env, WRITE_TABLE.kind, firstRowId(WRITE_TABLE));
  const seeded = await env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: WRITE_DIM.name, value: WRITE_DIM.value }] });
  assert.equal(seeded.ok, true, JSON.stringify(seeded));
  const bare = { ...env.engine };
  delete bare.modifierSources;
  await expectCode(() => modified(bare, env.state, WRITE_TABLE.kind, id, WRITE_DIM.name), 'E-DIM-STRUCT-FIELD');

  assert.deepEqual([...env.engine.modifierSources], [], '基线 modifierSources 为空数组');
  const base = dim(env.engine, env.state, WRITE_TABLE.kind, id, WRITE_DIM.name);
  const mod = modified(env.engine, env.state, WRITE_TABLE.kind, id, WRITE_DIM.name);
  assert.equal(mod.value, base.value, '空修正来源时 modified.value 应等于 dim.value');
});

test('⑥inputsOf(engine, node) 同一节点两次调用返回同一对象（===），且已冻结', async () => {
  const root = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: root });
  const node = `dim:${WRITE_TABLE.kind}`;
  const a = inputsOf(env.engine, node);
  const b = inputsOf(env.engine, node);
  assert.equal(a, b, '同一节点两次调用应返回同一对象');
  assert.equal(Object.isFrozen(a), true, '返回对象应冻结（卷二:2476）');
});

test('⑦未声明节点 → inputsOf 抛 E-VIEW-UNDECLARED-READ', async () => {
  const root = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: root });
  await expectCode(() => inputsOf(env.engine, 'undeclared:s1c-probe-node'), 'E-VIEW-UNDECLARED-READ');
});

test('⑧closeInputs：a uses b、b own X → a 的闭包含 X（传递）；a、b 互相 uses → E-VIEW-DEPS-CYCLE', async () => {
  const chain = closeInputs([
    { node: 'a', own: [], uses: ['b'] },
    { node: 'b', own: [['X-s1c-probe']], uses: [] },
  ]);
  assert.ok(JSON.stringify(closureOf(chain, 'a')).includes('X-s1c-probe'), 'a 的闭包应含经 b 传递来的 X');

  await expectCode(
    () =>
      closeInputs([
        { node: 'a', own: [], uses: ['b'] },
        { node: 'b', own: [], uses: ['a'] },
      ]),
    'E-VIEW-DEPS-CYCLE',
  );
});

test('⑨经 submitProposal 的 create 与 fact.set 写 created.<id>.props.<维度> 后，dim 取到新值', async () => {
  const root = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: root });
  const id = await createOne(env, WRITE_TABLE.kind, firstRowId(WRITE_TABLE));
  const r = await env.submitProposal({ effects: [{ op: 'fact.set', entity: id, field: WRITE_DIM.name, value: WRITE_DIM.value }] });
  assert.equal(r.ok, true, JSON.stringify(r));
  const got = dim(env.engine, env.state, WRITE_TABLE.kind, id, WRITE_DIM.name);
  assert.equal(got.value, WRITE_DIM.value, 'dim 应取到刚写入的新值');
});

test('⑩读档后继续玩：提交→存→读→复演→advance 后时钟增步长；再存读复演的 saveDigest 等于同输入一口气跑完的世界', async () => {
  const rootA = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: rootA });
  await playScript(env);
  const m = await saveSlot(env, 0);
  const r = await replay_apply(await loadSlot(m, { saveRoot: rootA }));
  const start = r.state.clock.minute;
  await r.advance(STEP);
  assert.equal(r.state.clock.minute - start, STEP, '复演后 advance(步长) 时钟应增一个步长');
  const m2 = await r.save(0);
  const r2 = await replay_apply(await loadSlot(m2, { saveRoot: rootA }));

  const rootB = testTempRoot('mount-s1c-');
  const once = await init(express.Router(), { saveRoot: rootB });
  await playScript(once);
  await once.advance(STEP);
  const mOnce = await once.save(0);
  assert.equal(r2.saveDigest, mOnce.saveDigest, '读档续玩的 saveDigest 应等于同输入一口气跑完的 saveDigest');
});

test('⑪存档的 doc_data 含 registry.json 每行 code 对应的表（逐一核在，不写死表名）', async () => {
  const root = testTempRoot('mount-s1c-');
  const env = await init(express.Router(), { saveRoot: root });
  await playScript(env);
  const m = await saveSlot(env, 0);
  const loaded = await loadSlot(m, { saveRoot: root });
  const docText = canon(loaded.docData);
  assert.ok(REGISTRY_ROWS.length > 0, 'registry.json 应有登记行');
  for (const row of REGISTRY_ROWS) {
    const table = loadJson(join(WORLD, 'rules', row.file));
    assert.ok(docText.includes(canon(table)), `doc_data 应含登记表 ${row.code}（${row.file}）`);
  }
});

test('⑫server-plugin/kernel/files.json 长度为 15', () => {
  assert.equal(loadJson(join(ROOT, 'server-plugin/kernel/files.json')).length, 15);
});
