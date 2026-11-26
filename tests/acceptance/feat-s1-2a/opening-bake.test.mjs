// S1-2 子卡 a（真实开局 + 烘焙层雏形）黑盒验收。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-s2a。
// 依据与逐条对应见 docs/卡档案/feat-s1-2a/出题.md。
// 不写死表名、id、起始分钟：起始分钟从 world/rules/tables/worldgen.json 的 genesisMinute 行读；郡级从 _vocab.json 的 juris 词条按 rank 取最低者；
// 地点集合从 place.json 的 rows 读。期望 41 / 31 按卡文与产品原则一.2 写死（规模数字本身即验收内容）。
// 新模块（rules/gen/worldgen-writeback.mjs、rules/bake/place-tree.mjs）未建时只有用到它们的用例红，其余用例照常跑（动态 import）。
// raw 世界数据形状镜像 server-plugin/index.mjs 的 readWorld；sources 镜像 readSources（与 feat-s1-1c 测试同法）。
// 临时根用 tests/accept/temp-root.mjs#testTempRoot，不清理、不新增删除函数，本文件不写文件（只读 world/ 与内存副本）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { init, loadSlot, replay_apply } from '../../../server-plugin/index.mjs';
import { mountKernel } from '../../../server-plugin/rules/load/mount.mjs';
import { createDigestCap } from '../../../server-plugin/textcore/digest.mjs';
import { runTransaction } from '../../../server-plugin/kernel/transaction.mjs';
import { clone } from '../../../server-plugin/kernel/bytes.mjs';
import { docOf, writeSlot } from '../../../server-plugin/kernel/save.mjs';
import { canonical } from '../../../server-plugin/kernel/storage.mjs';
import { testTempRoot } from '../../accept/temp-root.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const WORLD = join(ROOT, 'world');
const ONTOLOGY = join(WORLD, 'ontology');
const DIM_DIR = join(ONTOLOGY, 'dimensions');

// 卷十 R10-11.4 / R10-12.7 / 卷二十七 R27-4.13 等新模块导出（动态加载，见文件头）。
const opening = () => import('../../../server-plugin/rules/gen/worldgen-writeback.mjs');
const placeTreeMod = () => import('../../../server-plugin/rules/bake/place-tree.mjs');

function loadJson(p) {
  return JSON.parse(readFileSync(p, 'utf8'));
}

// 实体表：维度表目录里除下划线开头的元表外都是实体表（与 index.mjs 同口径）。
const TABLES = readdirSync(DIM_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort()
  .map((f) => loadJson(join(DIM_DIR, f)));

const REGISTRY_ROWS = loadJson(join(WORLD, 'rules/registry.json')).rows;
const WORLDGEN_ROW = REGISTRY_ROWS.find((r) => r.file === 'tables/worldgen.json');
assert.ok(WORLDGEN_ROW, 'registry.json 应登记 tables/worldgen.json');

const PLACE = loadJson(join(DIM_DIR, 'place.json'));
const PLACE_ROWS = PLACE.rows;
const PLACE_IDS = Object.keys(PLACE_ROWS);
const VOCAB = loadJson(join(DIM_DIR, '_vocab.json'));

// 卷五 :1060：郡级 rank 最低（郡<省<王国<世界）；取 juris 词条里 rank 最小者，不写死 id。
const COUNTY_LEVEL = Object.entries(VOCAB.families.juris.entries)
  .sort((a, b) => a[1].rank - b[1].rank)[0][0];

const isInput = (e) => e.kind === 'command' || e.kind === 'advance';
const isRegion = (id) => (PLACE_ROWS[id].classes ?? []).includes('comp_region');

function firstRowId(table) {
  const id = Object.keys(table.rows ?? {})[0];
  assert.ok(id, `表 ${table.kind} 应至少有一条实体行`);
  return id;
}
const FIRST_KIND_TABLE = TABLES.find((t) => t.entity && Array.isArray(t.entity.idPrefix) && t.entity.idPrefix.length > 0);
assert.ok(FIRST_KIND_TABLE, '维度表中应至少有一张带 entity.idPrefix 的表');

// 读 worldgen.json 的起始分钟行（卡文新增键 genesisMinute；行形如 {key, value}）。
function genesisMinuteOf(doc) {
  const row = doc.rows.find((r) => r.key === 'genesisMinute');
  assert.ok(row, 'world/rules/tables/worldgen.json 应有 genesisMinute 行（卷十 R10-1.2、卡文新增键）');
  assert.ok(Number.isInteger(row.value) && row.value >= 0, 'genesisMinute 应为非负整数分钟');
  return row.value;
}

// 镜像 index.mjs 的 readWorld（raw 形状）；每次现读，调用方可任意改副本。
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
function goodCaps(root) {
  return {
    digestCap: createDigestCap(),
    saveRoot: new URL(pathToFileURL(root).href.replace(/\/?$/, '/')),
    sources: readSources(),
    modifierSources: [],
  };
}

// 把 worldgen 副本里某键的值改掉（只改内存副本，world/ 不动）。
function setWorldgenValue(raw, key, value) {
  const doc = raw.tableDocs[WORLDGEN_ROW.code];
  const row = doc.rows.find((r) => r.key === key);
  assert.ok(row, `worldgen 副本应有 ${key} 行`);
  row.value = value;
}

// 逐条开局后的 state 读取：偏离行 created.<id>.props.genOpen。
const genOpenLine = (state, id) => (state.created ?? {})[id]?.props?.genOpen;

// 提交一条 create 提案（开局后 + 时间推进）所需的只读辅助。
function idsOf(state) {
  return Object.keys(state.created ?? {});
}

test('1. init 在 3000 ms 内返回，返回值含 engine、state、logBook、submitProposal、advance、save', async () => {
  const root = testTempRoot('s2a-init-');
  const t0 = performance.now();
  const env = await init({ saveRoot: root });
  const ms = performance.now() - t0;
  assert.ok(ms < 3000, `init 耗时 ${ms.toFixed(0)} ms，应在 3000 ms 内（PLAN:48；卷文无此数，卡文指定）`);
  for (const k of ['engine', 'state', 'logBook', 'submitProposal', 'advance', 'save']) {
    assert.ok(env[k] !== undefined && env[k] !== null, `返回值应含 ${k}`);
  }
  assert.equal(typeof env.submitProposal, 'function');
  assert.equal(typeof env.advance, 'function');
  assert.equal(typeof env.save, 'function');
});

test('2. 开局后 openingOf 的 genesisMinute === openingMinute === 数据起始分钟 === clock.minute；改副本起始分钟则开局时钟随之改', async () => {
  const root = testTempRoot('s2a-genesis-');
  const env = await init({ saveRoot: root });
  const { openingOf } = await opening();
  const got = openingOf(env.engine, env.state);
  const start = genesisMinuteOf(loadJson(join(WORLD, 'rules', WORLDGEN_ROW.file)));
  assert.equal(got.genesisMinute, got.openingMinute, '年数为 0 时 openingMinute 等于 genesisMinute（卷十 R10-11.4）');
  assert.equal(got.genesisMinute, start, 'genesisMinute 应等于世界数据起始分钟（卷十 R10-1.2）');
  assert.equal(env.state.clock.minute, start, '开局时钟应等于世界数据起始分钟');

  // 反 E-GEN-DEFAULT（卷十:252）：副本改起始分钟，开局时钟与 openingOf 随之改。
  const other = start + 60;
  const raw = readRaw();
  setWorldgenValue(raw, 'genesisMinute', other);
  const env2 = mountKernel(raw, goodCaps(testTempRoot('s2a-genesis2-')));
  assert.equal(env2.state.clock.minute, other, '副本起始分钟改后开局时钟应随之改');
  assert.equal(openingOf(env2.engine, env2.state).genesisMinute, other);
  assert.equal(openingOf(env2.engine, env2.state).openingMinute, other);
});

test('3. place 表 comp_region 行数为 41，其中郡级为 31', () => {
  const regions = PLACE_IDS.filter(isRegion);
  assert.equal(regions.length, 41, 'comp_region 行数应为 41（一省九省一世界根加 31 郡，产品原则一.2、卷五:1207）');
  const counties = regions.filter((id) => PLACE_ROWS[id].regionLevel === COUNTY_LEVEL);
  assert.equal(counties.length, 31, '郡级 comp_region 应为 31（CLAUDE.md「九省 31 郡」）');
});

test('4. 作者已给 genOpen 的地点开局后不变；其余地点恰有一条偏离行或一条 gap，二者覆盖全部地点且不重不漏', async () => {
  const root = testTempRoot('s2a-open-');
  const env = await init({ saveRoot: root });
  const { runOpening } = await opening();
  const authored = new Set(PLACE_IDS.filter((id) => Object.hasOwn(PLACE_ROWS[id], 'genOpen')));
  assert.ok(authored.size >= 1, '数据中应至少有一处作者给定的 genOpen（试玩出生地）');

  for (const id of authored) {
    const eff = genOpenLine(env.state, id) ?? PLACE_ROWS[id].genOpen;
    assert.equal(eff, PLACE_ROWS[id].genOpen, `${id} 作者已给 genOpen，开局后不得改（卷十 R10-12.7）`);
  }

  // gaps 取 runOpening 的返回值：在孪生 state 上跑一次写入器（不动 env.state）。
  const twin = clone(env.state);
  const r = runTransaction(env.engine, twin, (tx) => runOpening(env.engine, twin, tx));
  assert.equal(r.ok, true, `runOpening 应可在事务内跑通：${JSON.stringify(r.code ?? '')}`);
  const gapText = JSON.stringify(r.value.gaps);
  const inGap = (id) => new RegExp(`(^|[^A-Za-z0-9_])${id}($|[^A-Za-z0-9_])`).test(gapText);

  for (const id of PLACE_IDS) {
    if (authored.has(id)) continue;
    const hasLine = typeof genOpenLine(env.state, id) === 'boolean';
    const gap = inGap(id);
    assert.ok(hasLine !== gap, `${id}：应恰有一条 created.${id}.props.genOpen 偏离行或出现在 gaps 中（偏离行=${hasLine}，gap=${gap}）`);
  }
});

test('5. 开局后日志簿输入条目为 0；0 号快照已含 genesis 与全部 genOpen 偏离行', async () => {
  const root = testTempRoot('s2a-log-');
  const env = await init({ saveRoot: root });
  assert.equal(env.logBook.entries.filter(isInput).length, 0, '开局不是外来输入（卷二十七 R27-7.3）：输入条目应为 0');
  const snap0 = env.logBook.snapshots[0];
  assert.ok(snap0 && snap0.state, '开局后应有 0 号快照');
  assert.ok(env.state.genesis && typeof env.state.genesis === 'object', 'state 应有 genesis 键（卷十:221）');
  assert.deepEqual(snap0.state.genesis, env.state.genesis, '0 号快照应含 genesis（卷十 R10-12.7）');
  // 偏离行的条数由规则键决定（缺规则键时地点记 gap、不写行），这里不设下限，只核快照与当前 state 逐条一致。
  for (const id of PLACE_IDS) {
    const line = genOpenLine(env.state, id);
    if (line === undefined) continue;
    assert.equal(snap0.state.created?.[id]?.props?.genOpen, line, `0 号快照应含 ${id} 的 genOpen 偏离行`);
  }
});

test('6. 烘焙层不进摘要：清空烘焙层后重存，saveDigest 不变；doc_state 不含烘焙层任何键', async () => {
  const root = testTempRoot('s2a-bake-');
  const env = await init({ saveRoot: root });
  const { engine, state, logBook } = env;
  assert.ok(engine.bake && typeof engine.bake === 'object', 'engine.bake 应为烘焙层对象（卷二十七 R27-4.13）');
  const m1 = env.save(0);

  // engine 已冻结，不能改写 bake；改用同一 state、只换掉 bake 键的 engine 副本存档。
  const cleared = { ...engine, bake: undefined };
  const m2 = writeSlot(cleared, { state, logBook }, 0);
  assert.equal(m2.saveDigest, m1.saveDigest, '烘焙层清空后存档摘要不变');

  // 重建：用 bakePlaceTree 从同一 doc_data 重建烘焙树，换入副本再存。
  const { bakePlaceTree } = await placeTreeMod();
  const tree = bakePlaceTree(engine.registry);
  const rebuilt = { ...engine, bake: Object.freeze({ placeTree: tree }) };
  const m3 = writeSlot(rebuilt, { state, logBook }, 0);
  assert.equal(m3.saveDigest, m1.saveDigest, '重建烘焙层后存档摘要不变');

  // doc_state 序列化不含烘焙层任何键（键名取自 engine.bake 与烘焙树本身，不写死）。
  const docState = canonical(docOf(engine, state, logBook).doc_state);
  const bakeKeys = [...Object.keys(engine.bake), ...Object.keys(tree)];
  for (const k of bakeKeys) {
    assert.ok(!docState.includes(`"${k}":`), `doc_state 不得含烘焙层键 ${k}（卷二十七 R27-4.13）`);
  }
});

test('7. 烘焙层可重建且一致：同一 doc_data 两次建树摘要相等；存读复演后重建的树摘要与开局时相等', async () => {
  const root = testTempRoot('s2a-rebuild-');
  const env = await init({ saveRoot: root });
  const { bakePlaceTree, placeTreeDigest } = await placeTreeMod();
  const t1 = bakePlaceTree(env.engine.registry);
  const t2 = bakePlaceTree(env.engine.registry);
  const d1 = placeTreeDigest(env.engine, t1);
  const d2 = placeTreeDigest(env.engine, t2);
  assert.equal(d1, d2, '同一 doc_data 两次建树摘要应相等（卷二十七 R27-5.9）');

  env.save(0);
  const loaded = loadSlot({ slot: 0 }, { saveRoot: root });
  const replayed = replay_apply(loaded);
  const dStored = placeTreeDigest(replayed.engine, bakePlaceTree(replayed.engine.registry));
  assert.equal(dStored, d1, '从存档 doc_data 读档复演后重建的树，摘要应与开局时相等');
  const dReplayed = placeTreeDigest(replayed.engine, bakePlaceTree(replayed.engine.registry));
  assert.equal(dReplayed, d1);
});

test('8. 真实开局后的闭环：create 一个实体并 time 30 提交成功；新实体可读；输入条目 +1 且结果事件 ok；时钟 +30；存读复演 saveDigest 相等', async () => {
  const root = testTempRoot('s2a-loop-');
  const env = await init({ saveRoot: root });
  const before = { minute: env.state.clock.minute, ids: idsOf(env.state), logLen: env.logBook.entries.length };

  const r = await env.submitProposal({
    effects: [
      { op: 'create', kind: FIRST_KIND_TABLE.kind, template: firstRowId(FIRST_KIND_TABLE), facts: {} },
      { op: 'time', minutes: 30 },
    ],
  });
  assert.equal(r.ok, true, JSON.stringify(r));

  const added = idsOf(env.state).filter((id) => !before.ids.includes(id));
  assert.equal(added.length, 1, '提案应新增恰一个实体');
  assert.ok(env.state.created[added[0]] && typeof env.state.created[added[0]].props === 'object', '新实体应可读');

  assert.equal(env.state.clock.minute, before.minute + 30, '时钟应为开局时钟加 30');

  const newEntries = env.logBook.entries.slice(before.logLen);
  const inputs = newEntries.filter(isInput);
  assert.equal(inputs.length, 1, '日志簿输入条目应 +1');
  const results = newEntries.filter((e) => e.kind === 'event' && e.seq === inputs[0].seq);
  assert.ok(results.some((e) => e.ok === true), '结果事件应为 ok');

  const m = env.save(0);
  const loaded = loadSlot({ slot: 0 }, { saveRoot: root });
  const replayed = replay_apply(loaded);
  assert.equal(replayed.saveDigest, m.saveDigest, 'save → loadSlot → replay_apply 的 saveDigest 应与存档时相等');
});
