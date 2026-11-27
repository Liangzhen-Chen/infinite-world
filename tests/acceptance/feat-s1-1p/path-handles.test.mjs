// S1-1 卡 1p（路径句柄 P）黑盒验收。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-s1p。
// 依据：卷二:535（readPath/writePath 唯一定义在 kernel/storage.mjs）、卷二:536（路径实参不是字串；P 只来自加载期
// pathTypes 生成的句柄；成员名由模式机械派生：点换下划线，* 段不进名字；两条模式派生撞名报 E-PATH-NAME-CLASH；
// 实参个数不对或为空即拒）、卷二:541–542（事务内拒写整笔撤回）、卷二:721（pathTypes 的 created.*.props.* 与 keyKinds 写法）。
// 不写死实体 id、维度名、kind：全部从 world/ontology/dimensions 与 world/ontology/state-owners.json 读取。
import { express } from '../../support/express.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { init } from '../../../server-plugin/index.mjs';
import { mergeOwners } from '../../../server-plugin/rules/load/registry-shards.mjs';
import { readPath, writePath, createEntity } from '../../../server-plugin/kernel/storage.mjs';
import { writeScope } from '../../../server-plugin/kernel/transaction.mjs';
import { makePathHandles } from '../../../server-plugin/kernel/handles.mjs';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const DIM_DIR = join(ROOT, 'world/ontology/dimensions');
// 登记口径（S2-L 合入后改）：主文件 + 分片（state-owners.d/，按文件名次序）的合并结果（registry-shards.mjs mergeOwners）；
// 仓库已有首张真分片 economy.json，只读主文件会漏掉分片登记的 pathTypes（accounts、ledgerTotals 等）。
const OWNERS = JSON.parse(JSON.stringify(mergeOwners(
  { file: 'state-owners.json', doc: JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.json'), 'utf8')) },
  readdirSync(join(ROOT, 'world/ontology/state-owners.d')).filter((f) => f.endsWith('.json')).sort()
    .map((f) => ({ file: f, doc: JSON.parse(readFileSync(join(ROOT, 'world/ontology/state-owners.d', f), 'utf8')) })),
).doc)); // 深拷贝成普通对象（mergeOwners 返回冻结的 unknown 类型）

function loadTables() {
  return readdirSync(DIM_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => JSON.parse(readFileSync(join(DIM_DIR, f), 'utf8')));
}

async function boot() {
  const booted = await init(express.Router());
  assert.ok(booted && booted.engine && booted.state, 'init(express.Router()) 应返回 {engine, state}');
  return booted;
}

// 按卷二:536 派生：去掉 textPaths 之后，模式里的点换下划线，* 段不进名字
function expectedMembers() {
  const textSet = new Set(OWNERS.textPaths ?? []);
  const patterns = Object.keys(OWNERS.pathTypes ?? {}).filter((p) => !textSet.has(p));
  return patterns.map((p) => p.split('.').filter((s) => s !== '*').join('_'));
}

function finiteDomain(d) {
  return Array.isArray(d.domain) && d.domain.length === 2
    && typeof d.domain[0] === 'number' && typeof d.domain[1] === 'number';
}

function midOf(def) {
  const [lo, hi] = def.domain;
  return lo + (hi - lo) / 2;
}

// 选一张表：有真实实体行，且某行覆盖该表全部必填（required: always，非派生）维度，
// 必填维度用该真实行的值做种子；再选一个非必填、非派生、有限定义域的数值维度作为被写的偏离维度。
function pickSeed(tables) {
  for (const table of tables) {
    const dims = table.dimensions ?? {};
    const required = Object.entries(dims)
      .filter(([, d]) => d.required === 'always' && !d.derived)
      .map(([name]) => name);
    const target = Object.entries(dims).find(
      ([name, d]) => d.type === 'number' && !d.derived && !required.includes(name) && finiteDomain(d),
    );
    if (!target) continue;
    const rows = table.rows ?? {};
    const rowId = Object.keys(rows).find((id) =>
      required.every((name) => Object.prototype.hasOwnProperty.call(rows[id], name)),
    );
    if (!rowId) continue;
    const seed = Object.fromEntries(required.map((name) => [name, rows[rowId][name]]));
    return { table, dimName: target[0], dimDef: target[1], seed };
  }
  throw new Error('真实维度表里找不到满足前提的表（需有真实行覆盖全部必填维度，并有非必填有限域数值维度）');
}

function entityId(table, tag) {
  const prefix = table.entity && table.entity.idPrefix && table.entity.idPrefix[0];
  assert.equal(typeof prefix, 'string', `表 ${table.kind} 缺 entity.idPrefix`);
  return `${prefix}s1p_${tag}`;
}

// ---- 1 ----
test('P 的成员集合 = pathTypes 模式（去掉 textPaths）按卷二:536 派生的名字集合，且 P 冻结', async () => {
  const { engine } = await boot();
  const expected = expectedMembers();
  assert.ok(expected.length > 0, 'state-owners.json 的 pathTypes 为空，无模式可派生');
  assert.equal(new Set(expected).size, expected.length, '派生出的成员名不应撞名');
  assert.ok(expected.includes('created_props'), 'pathTypes 应登记 created.*.props.*（卷二:721），派生名为 created_props');
  assert.equal(Object.isFrozen(engine.P), true, 'engine.P 应为冻结对象');
  assert.deepEqual([...Object.keys(engine.P)].sort(), [...expected].sort());
  assert.equal(typeof engine.P.issued, 'function', 'issued 应为 P 上的来路核验函数');
  assert.ok(!Object.keys(engine.P).includes('issued'), 'issued 约定不可枚举，不应计入 P 的成员集合');
});

// ---- 2 ----
test('经 P.created_props 写后用 readPath 读回相同（先 createEntity，必填维度用真实实体行的值做种子）', async () => {
  const { engine, state } = await boot();
  const { P } = engine;
  const { table, dimName, dimDef, seed } = pickSeed(loadTables());
  const id = entityId(table, 'readback');
  const value = midOf(dimDef);

  writeScope(engine, state, (tx) => {
    createEntity(state, id, table.kind, seed, tx);
  });
  writeScope(engine, state, (tx) => {
    writePath(state, P.created_props(id, dimName), value, tx);
  });
  assert.equal(readPath(state, P.created_props(id, dimName)), value);
});

// ---- 3 ----
test('裸数组路径传 writePath 抛，状态不变', async () => {
  const { engine, state } = await boot();
  const { table, dimName, dimDef, seed } = pickSeed(loadTables());
  const id = entityId(table, 'bare');
  writeScope(engine, state, (tx) => {
    createEntity(state, id, table.kind, seed, tx);
  });
  const before = JSON.stringify(state.created);
  assert.throws(() => writeScope(engine, state, (tx) => {
    writePath(state, /** @type {any} */ (/** @type {unknown} */ (['created', id, 'props', dimName])), midOf(dimDef), tx);
  }));
  assert.equal(JSON.stringify(state.created), before);
});

// ---- 4 ----
test('手搓冻结对象 {pattern, segs} 传 writePath 抛，状态不变', async () => {
  const { engine, state } = await boot();
  const { table, dimName, dimDef, seed } = pickSeed(loadTables());
  const id = entityId(table, 'handmade');
  writeScope(engine, state, (tx) => {
    createEntity(state, id, table.kind, seed, tx);
  });
  const before = JSON.stringify(state.created);
  const forged = Object.freeze({
    pattern: 'created.*.props.*',
    segs: Object.freeze(['created', id, 'props', dimName]),
  });
  assert.throws(() => writeScope(engine, state, (tx) => {
    writePath(state, /** @type {any} */ (/** @type {unknown} */ (forged)), midOf(dimDef), tx);
  }));
  assert.equal(JSON.stringify(state.created), before);
});

// ---- 5 ----
test('第二次 makePathHandles 得到的另一个 P 发出的路径写本 engine 的 state 抛（同场景本 P 写入成功作对照）', async () => {
  const { engine, state } = await boot();
  const { P } = engine;
  const { table, dimName, dimDef, seed } = pickSeed(loadTables());
  const id = entityId(table, 'foreign');
  writeScope(engine, state, (tx) => {
    createEntity(state, id, table.kind, seed, tx);
  });

  const other = makePathHandles(OWNERS.pathTypes, OWNERS.keyKinds, OWNERS.textPaths);
  assert.equal(typeof other.created_props, 'function', '另一个 P 应有 created_props 成员，否则抛错不能说明问题');
  const before = JSON.stringify(state.created);
  assert.throws(() => writeScope(engine, state, (tx) => {
    writePath(state, other.created_props(id, dimName), midOf(dimDef), tx);
  }));
  assert.equal(JSON.stringify(state.created), before);

  // 对照：本 engine 的 P 在同一场景下写入成功
  writeScope(engine, state, (tx) => {
    writePath(state, P.created_props(id, dimName), midOf(dimDef), tx);
  });
  assert.equal(readPath(state, P.created_props(id, dimName)), midOf(dimDef));
});

// ---- 6 ----
test('P.created_props 少一个实参、零实参或传空串即抛', async () => {
  const { engine } = await boot();
  const { P } = engine;
  const { table, dimName } = pickSeed(loadTables());
  const id = entityId(table, 'arity');
  assert.throws(() => P.created_props());
  assert.throws(() => P.created_props(id));
  assert.throws(() => P.created_props(id, ''));
  assert.throws(() => P.created_props('', dimName));
});

// ---- 7 ----
test('makePathHandles 喂撞名模式 a_b.c 与 a.b_c 抛 E-PATH-NAME-CLASH；不撞名的同形输入不抛（对照）', () => {
  assert.doesNotThrow(() => makePathHandles({ 'a_b.c': 'dimension', 'a.d': 'dimension' }, {}, []));
  assert.throws(
    () => makePathHandles({ 'a_b.c': 'dimension', 'a.b_c': 'dimension' }, {}, []),
    (err) => Boolean(err) && /** @type {{code?: string}} */ (err).code === 'E-PATH-NAME-CLASH',
  );
});
