// S1-1 卡 A 的内核行为单测（写码方自补，放 tests/kernel；不作验收依据，验收由独立出题方另出）。
// 测的是行为：kindOfEntity 认加载期实体 / 运行期新建实体 / 认不出即抛；createEntity 的三种拒收；
// stateMemo 按顶层键切片失活；writePath 写 ref 到运行期新建实体可读回。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../../server-plugin/rules/load/registry.mjs';
import { kindOfEntity, readPath, writePath, createEntity } from '../../server-plugin/kernel/storage.mjs';
import { stateMemo, invalidateTop } from '../../server-plugin/kernel/memo.mjs';

// 维度表文档的最小形状：kind + entity.idPrefix/singletonIds + rows（rows 键带本表前缀）。
const DOCS = [
  { kind: 'item', entity: { idPrefix: ['item_'], singletonIds: [] }, rows: { item_a: { mass: 1 } }, dimensions: { mass: { type: 'number' } } },
  { kind: 'person', entity: { idPrefix: ['npc_'], singletonIds: ['player'] }, rows: {}, dimensions: {} },
];

function fixture() {
  const registry = buildRegistry(DOCS);
  const engine = Object.freeze({ registry, structs: Object.freeze({}), modifierSources: Object.freeze([]) });
  const state = { created: {} };
  return { engine, state };
}

test('kindOfEntity：加载期实体、运行期新建实体、认不出即 E-DIM-REF-MISSING', () => {
  const { engine, state } = fixture();
  assert.equal(kindOfEntity(engine, state, 'item_a'), 'item');
  createEntity(engine, state, 'item_b', 'item', { mass: 2 });
  assert.equal(kindOfEntity(engine, state, 'item_b'), 'item');
  createEntity(engine, state, 'player', 'person', {});
  assert.equal(kindOfEntity(engine, state, 'player'), 'person');
  assert.throws(() => kindOfEntity(engine, state, 'nope_1'), (e) => /** @type {any} */ (e).code === 'E-DIM-REF-MISSING');
  assert.throws(() => kindOfEntity(engine, state, ''), (e) => /** @type {any} */ (e).code === 'E-DIM-ID-FORMAT');
  assert.throws(() => kindOfEntity(engine, null, 'item_a'));
});

test('createEntity：kind 未登记、id 不带该 kind 前缀、id 已被占用三种拒收', () => {
  const { engine, state } = fixture();
  assert.throws(() => createEntity(engine, state, 'item_x', 'nosuchkind', {}), (e) => /** @type {any} */ (e).code === 'E-DIM-REF-MISSING');
  assert.throws(() => createEntity(engine, state, 'npc_x', 'item', {}), (e) => /** @type {any} */ (e).code === 'E-DIM-ID-FORMAT');
  assert.throws(() => createEntity(engine, state, 'item_a', 'item', {}), (e) => /** @type {any} */ (e).code === 'E-DIM-ID-DUPLICATE');
  createEntity(engine, state, 'item_b', 'item', { mass: 2 });
  assert.throws(() => createEntity(engine, state, 'item_b', 'item', {}), (e) => /** @type {any} */ (e).code === 'E-DIM-ID-DUPLICATE');
  assert.deepEqual(/** @type {any} */ (state.created).item_b, { kind: 'item', props: { mass: 2 } });
});

test('stateMemo：作废顶层键 X 只重算依赖 X 的格，依赖 Y 的格照旧命中', () => {
  const { engine, state } = fixture();
  let buildX = 0;
  let buildY = 0;
  const readX = () => stateMemo(state, engine, 'x', () => ++buildX, [['xx']]);
  const readY = () => stateMemo(state, engine, 'y', () => ++buildY, [['yy']]);
  assert.equal(readX(), 1);
  assert.equal(readY(), 1);
  assert.equal(readX(), 1);
  invalidateTop(state, 'xx');
  assert.equal(readX(), 2);
  assert.equal(readY(), 1);
  invalidateTop(state, 'yy');
  assert.equal(readY(), 2);
  assert.equal(readX(), 2);
  // inputs 空或非数组一律抛，不当成"无依赖"放行。
  assert.throws(() => stateMemo(state, engine, 'z', () => 1, []));
  assert.throws(() => stateMemo(state, engine, 'z', () => 1, /** @type {any} */ (null)));
});

test('writePath：写 ref 到运行期新建实体可读回；指向不存在的实体或 null/空串拒写', () => {
  const { engine, state } = fixture();
  createEntity(engine, state, 'item_b', 'item', { mass: 2 });
  writePath(engine, state, ['links', 'to'], 'item_b');
  assert.equal(readPath(engine, state, ['links', 'to']), 'item_b');
  writePath(engine, state, ['created', 'item_b', 'props', 'mass'], 3);
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'mass']), 3);
  assert.throws(() => writePath(engine, state, ['links', 'to'], 'nope_1'), (e) => /** @type {any} */ (e).code === 'E-DIM-REF-MISSING');
  assert.throws(() => writePath(engine, state, ['links', 'to'], null), (e) => /** @type {any} */ (e).code === 'E-DIM-REF-MISSING');
  assert.throws(() => writePath(engine, state, ['links', 'to'], ''), (e) => /** @type {any} */ (e).code === 'E-DIM-REF-MISSING');
});
