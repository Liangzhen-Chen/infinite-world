// S2-0a（终止协议骨架）黑盒验收，本文件覆盖卡文第 7b、7c、7d、8、10 条（去留表的 hold 与 clear 删除、keep 保留；加载期覆盖核对；未建数据门）。
// 出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s20a。
// 依据：卷二:562（去留表与 E-TERM-RECORD-UNLISTED 覆盖核对）、卷二:563（窗口期满：reviveWindowDays 为 0 时 hold 与 clear 同样在第 1 步删除）、卷二:553（termination 的 successorRX 与 reviveWindowDays 取值）、卷二:558（不变量）。
// 加载期夹具只在内存副本上改（镜像 index.mjs#readWorld 的 raw 形状，与 tests/acceptance/feat-s1-2b 同款），不写盘、不改 world/。
// 每个带夹具的用例前先跑一次未改的副本作对照，证明被测的拒绝或删除是夹具造成的，而不是副本本身装不起来。
// 主会话裁定（11-26）：正例实体用 org 表实体；10b 的 successorRX 在数据里找不到非空的类别行，因此在内存副本上把 org 类别行的 successorRX 改为现有数据里的 RX 文本 "1 == 1"（org 各行的 charter 原文）。
// 不写死表名、id、数值：类别行按 person 与 org 表的 classes 遍历，记录类按 world/rules/registry.json 登记的规则表找 terminate 表。

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { mountKernel } from '../../../server-plugin/rules/load/mount.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { writePath } from '../../../server-plugin/kernel/storage.mjs';
import { testTempRoot, removeTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const ONTOLOGY = join(WORLD, 'ontology');
const DIM_DIR = join(ONTOLOGY, 'dimensions');
const loadJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

const DIM_DOCS = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));
const ORG_DOC = DIM_DOCS.find((d) => d.kind === 'org');
const ORG_ROW = Object.entries(ORG_DOC.rows).find(([, v]) => ORG_DOC.classes[v.extends]?.termination)[0];
const REGISTRY_ROWS = loadJson(join(WORLD, 'rules/registry.json')).rows;
const TERMINATE_CODE = REGISTRY_ROWS.find((r) => r.file.endsWith('terminate.json')).code;
const PROBE_PATH = 'created.*.probe';
// 现有数据里的 RX 文本（org 各行 charter 的原文）：用作 10b 夹具的 successorRX 值。
const EXISTING_RX_TEXT = '1 == 1';

const ROOTS = [];
const newRoot = (prefix) => {
  const r = testTempRoot(prefix);
  ROOTS.push(r);
  return r;
};
after(() => {
  for (const r of ROOTS.splice(0)) removeTempRoot(r);
});

// ---------- 原始世界数据（镜像 index.mjs#readWorld；每个用例深拷贝后改）----------

let BASE_RAW = null;
function readRaw() {
  const json = (f) => loadJson(join(ONTOLOGY, f));
  const tableDocs = Object.fromEntries(REGISTRY_ROWS.map((r) => [r.code, loadJson(join(WORLD, 'rules', r.file))]));
  return {
    dimensionDocs: DIM_DOCS,
    namedStructsDoc: json('named-structs.json'),
    owners: json('state-owners.json'),
    registryRows: REGISTRY_ROWS,
    tableDocs,
    digestExclude: loadJson(join(WORLD, 'rules/tables/digest-exclude.json')).paths,
    primitivesDoc: json('primitives.json'),
    vocabDoc: json('dimensions/_vocab.json'),
    unitsDoc: json('dimensions/_units.json'),
  };
}
const rawCopy = () => structuredClone((BASE_RAW ??= readRaw()));

// 装配层的源码清单（engineRulesDigest 用）：kernel/files.json 登记的文件 ∪ server-plugin/rules 下全部 .mjs。
function readSources() {
  const kernel = loadJson(join(ROOT, 'server-plugin/kernel/files.json'));
  const rules = readdirSync(join(ROOT, 'server-plugin/rules'), { recursive: true })
    .filter((f) => String(f).endsWith('.mjs'))
    .map((f) => `server-plugin/rules/${String(f).split('\\').join('/')}`);
  return [...kernel, ...rules].sort().map((path) => ({ path, text: readFileSync(join(ROOT, path), 'utf8') }));
}
let SOURCES = null;

// 在内存副本上装配（与 init 同一装配函数，只换输入）。
function mountRaw(raw) {
  const root = newRoot('s2a-rec-');
  const href = pathToFileURL(root).href;
  SOURCES ??= readSources();
  return mountKernel(raw, {
    digestCap: createDigestCap(),
    saveRoot: new URL(href.endsWith('/') ? href : `${href}/`),
    sources: SOURCES,
    modifierSources: Object.freeze([]),
  });
}

// 以 org 行为模板 create 一个实体（正例：类别行带 termination，可终止）。
function createOrg(env) {
  const before = new Set(Object.keys(env.state.created ?? {}));
  const r = env.submitProposal({ effects: [{ op: 'create', kind: ORG_DOC.kind, template: ORG_ROW, facts: {} }] });
  assert.equal(r.ok, true, `create 应成功：${JSON.stringify(r)}`);
  const added = Object.keys(env.state.created ?? {}).filter((id) => !before.has(id));
  assert.equal(added.length, 1, 'create 应恰好新增一个实体');
  return added[0];
}

// 在一笔写入事务里调协议原语 terminate（末尾的 tx 由事务给出）。
async function terminateIn(env, id) {
  const { terminate } = await import('../../../server-plugin/rules/lifecycle/terminate.mjs');
  return runTransaction(env.engine, env.state, (tx) => terminate(env.state, id, 'verb_death_event', null, tx));
}

// 夹具：给 created.*.probe 登记去留类 recordClass，并让它在覆盖表里有登记（卷二:562 登记形状）。探针挂在 org 实体上。
function addProbe(raw, recordClass) {
  raw.owners.pathTypes[PROBE_PATH] = 'integer';
  raw.owners.keyKinds[PROBE_PATH] = [['org']];
  raw.owners.stateKeys.created.writers['*.probe'] = { create: ['kernel/storage.mjs'], rewrite: null, viaRelocate: false };
  raw.owners.stateKeys.created.subjectRecords = { [PROBE_PATH]: { recordClass, subjectSegments: [1] } };
}

// 去留表 records 行的值（卷二:562 与 terminate.json）。
const recordsOf = (raw) => raw.tableDocs[TERMINATE_CODE].rows.find((r) => r.key === 'records').value;

// 在实体名下写一个探针记录（经 P 发出的路径，与规则层写法相同）。
function writeProbe(env, id) {
  const r = runTransaction(env.engine, env.state, (tx) => writePath(env.state, env.engine.P.created_probe(id), 5, tx));
  assert.equal(r.ok, true, `前提：写探针记录应成功：${JSON.stringify(r)}`);
}

// ---------- 用例 ----------

test('7b. 去留：reviveWindowDays 为 0 时，hold 的记录终止后同样删除', async () => {
  const raw = rawCopy();
  addProbe(raw, 'rcls_revival_cooldown'); // 去留表里 atTerminate 为 hold 的行（terminate.json records）
  assert.equal(recordsOf(raw).rcls_revival_cooldown.atTerminate, 'hold', '夹具前提：该类应为 hold');

  const env = mountRaw(raw);
  const id = createOrg(env);
  writeProbe(env, id);
  assert.equal(env.state.created[id].probe, 5, '前提：探针记录应已写入');

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);
  assert.equal(Object.hasOwn(env.state.created[id], 'probe'), false, 'reviveWindowDays 为 0 时 hold 的记录应删除');
});

test('7c. 去留：atTerminate 为 clear 的记录终止后全部删除（夹具把 keep 行改为 clear）', async () => {
  const raw = rawCopy();
  recordsOf(raw).rcls_deviation_row.atTerminate = 'clear'; // 内存副本上把一行改为 clear
  addProbe(raw, 'rcls_deviation_row');

  const env = mountRaw(raw);
  const id = createOrg(env);
  writeProbe(env, id);
  assert.equal(env.state.created[id].probe, 5, '前提：探针记录应已写入');

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);
  assert.equal(Object.hasOwn(env.state.created[id], 'probe'), false, 'clear 的记录应删除');
});

test('7d. 去留：atTerminate 为 keep 的记录终止后原样保留（夹具登记 rcls_deviation_row，其 keep 行不改）', async () => {
  const raw = rawCopy();
  assert.equal(recordsOf(raw).rcls_deviation_row.atTerminate, 'keep', '夹具前提：该类应为 keep');
  addProbe(raw, 'rcls_deviation_row');

  const env = mountRaw(raw);
  const id = createOrg(env);
  writeProbe(env, id);

  const t = await terminateIn(env, id);
  assert.equal(t.ok, true, `terminate 应成功：${JSON.stringify(t)}`);
  assert.equal(env.state.created[id].probe, 5, 'keep 的记录终止后应原样保留');
});

test('8. 覆盖核对：pathTypes 加一条含 person 段、又未登记去留的模式，加载期报 E-TERM-RECORD-UNLISTED', () => {
  // 对照：未改的副本可以装配，不报 E-TERM-RECORD-UNLISTED。
  assert.doesNotThrow(() => mountRaw(rawCopy()), '对照副本应能装配');

  const raw = rawCopy();
  const stray = 'created.*.stray';
  raw.owners.pathTypes[stray] = 'integer';
  raw.owners.keyKinds[stray] = [['person']];
  raw.owners.stateKeys.created.writers['*.stray'] = { create: ['kernel/storage.mjs'], rewrite: null, viaRelocate: false };
  assert.throws(() => mountRaw(raw), (/** @type {any} */ e) => e.code === 'E-TERM-RECORD-UNLISTED', 'pathTypes 含 person 段且无去留登记应报 E-TERM-RECORD-UNLISTED');
});

test('10a. 未建数据门：类别行 reviveWindowDays 大于 0 时加载期即拒，错误信息写明要等 S2-0c', () => {
  assert.doesNotThrow(() => mountRaw(rawCopy()), '对照副本应能装配');

  const raw = rawCopy();
  const person = raw.dimensionDocs.find((d) => d.kind === 'person');
  for (const cls of Object.values(person.classes)) cls.termination.reviveWindowDays = 1;
  assert.throws(() => mountRaw(raw), (/** @type {any} */ e) => /S2-0c/.test(String(e.message)), '错误信息应写明要等 S2-0c（R7）');
});

test('10b. 未建数据门：类别行 successorRX 非 null 时加载期即拒，错误信息写明要等 S2-0c（夹具取现有 RX 文本）', () => {
  // 数据里没有非空 successorRX 的类别行，故在内存副本上把 org 类别行的 successorRX 改为现有 RX 文本。
  const raw = rawCopy();
  const org = raw.dimensionDocs.find((d) => d.kind === 'org');
  let changed = 0;
  for (const cls of Object.values(org.classes)) {
    if (cls.termination) {
      cls.termination.successorRX = EXISTING_RX_TEXT;
      changed += 1;
    }
  }
  assert.ok(changed > 0, '夹具前提：org 应有带 termination 的类别行');
  assert.throws(() => mountRaw(raw), (/** @type {any} */ e) => /S2-0c/.test(String(e.message)), '错误信息应写明要等 S2-0c（R7）');
});
