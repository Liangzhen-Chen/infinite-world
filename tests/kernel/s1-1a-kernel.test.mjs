// S1-1 卡 A 的内核行为单测（写码方自补，放 tests/kernel；不作验收依据，验收由独立出题方另出）。
// 测的是行为：kindOfEntity 认加载期实体 / 运行期新建实体 / 认不出即抛；createEntity 的三种拒收；
// stateMemo 按顶层键切片失活；writePath 按维度声明判 ref（枚举值不误判）、未登记顶层键拒写；
// 写入全经 writeScope（整笔撤销、作用域外拒写）；dim / modified 返回 Fact。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../../server-plugin/rules/load/registry.mjs';
import { kindOfEntity, readPath, writePath, createEntity } from '../../server-plugin/kernel/storage.mjs';
import { stateMemo, invalidateTop } from '../../server-plugin/kernel/memo.mjs';
import { writeScope } from '../../server-plugin/kernel/transaction.mjs';
import { dim, modified } from '../../server-plugin/kernel/dimensions.mjs';

// 维度表文档的最小形状：kind + entity.idPrefix/singletonIds + rows（rows 键带本表前缀）。
const DOCS = [
  {
    kind: 'item',
    entity: { idPrefix: ['item_'], singletonIds: [] },
    rows: { item_a: { mass: 1 } },
    dimensions: { mass: { type: 'number' }, origin: { type: 'ref', kind: 'place' }, color: { type: 'enum', vocab: 'color' }, hue: { type: 'number', default: 7 } },
  },
  { kind: 'place', entity: { idPrefix: ['place_'], singletonIds: [] }, rows: { place_a: {} }, dimensions: {} },
  { kind: 'person', entity: { idPrefix: ['npc_'], singletonIds: ['player'] }, rows: {}, dimensions: {} },
];

function fixture() {
  const registry = buildRegistry(DOCS);
  const engine = Object.freeze({ registry, structs: Object.freeze({}), modifierSources: Object.freeze([]), stateKeys: Object.freeze({ created: {} }) });
  const state = { created: {} };
  return { engine, state };
}

// 每次写都包进一个写入作用域。
const create = (engine, state, id, kind, props) => writeScope(state, (tx) => createEntity(engine, state, tx, id, kind, props));
const write = (engine, state, path, value) => writeScope(state, (tx) => writePath(engine, state, tx, path, value));
const code = (c) => (e) => /** @type {any} */ (e).code === c;

test('kindOfEntity：加载期实体、运行期新建实体、认不出即 E-DIM-REF-MISSING', () => {
  const { engine, state } = fixture();
  assert.equal(kindOfEntity(engine, state, 'item_a'), 'item');
  create(engine, state, 'item_b', 'item', { mass: 2 });
  assert.equal(kindOfEntity(engine, state, 'item_b'), 'item');
  create(engine, state, 'player', 'person', {});
  assert.equal(kindOfEntity(engine, state, 'player'), 'person');
  assert.throws(() => kindOfEntity(engine, state, 'nope_1'), code('E-DIM-REF-MISSING'));
  assert.throws(() => kindOfEntity(engine, state, ''), code('E-DIM-ID-FORMAT'));
  assert.throws(() => kindOfEntity(engine, null, 'item_a'));
});

test('createEntity：kind 未登记、id 不带该 kind 前缀、id 已被占用三种拒收', () => {
  const { engine, state } = fixture();
  assert.throws(() => create(engine, state, 'item_x', 'nosuchkind', {}), code('E-DIM-REF-MISSING'));
  assert.throws(() => create(engine, state, 'npc_x', 'item', {}), code('E-DIM-ID-FORMAT'));
  assert.throws(() => create(engine, state, 'item_a', 'item', {}), code('E-DIM-ID-DUPLICATE'));
  create(engine, state, 'item_b', 'item', { mass: 2 });
  assert.throws(() => create(engine, state, 'item_b', 'item', {}), code('E-DIM-ID-DUPLICATE'));
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

test('writePath：按维度声明判 ref；枚举值与普通值不按 ref 拒；未登记顶层键拒写', () => {
  const { engine, state } = fixture();
  create(engine, state, 'item_b', 'item', { mass: 2 });
  write(engine, state, ['created', 'item_b', 'props', 'mass'], 3);
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'mass']), 3);
  // 声明为 ref 的维度：指向存在的实体可写，不存在的拒。
  write(engine, state, ['created', 'item_b', 'props', 'origin'], 'place_a');
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'origin']), 'place_a');
  assert.throws(() => write(engine, state, ['created', 'item_b', 'props', 'origin'], 'nope_1'), code('E-DIM-REF-MISSING'));
  assert.throws(() => write(engine, state, ['created', 'item_b', 'props', 'origin'], null), code('E-DIM-REF-MISSING'));
  assert.throws(() => write(engine, state, ['created', 'item_b', 'props', 'origin'], ''), code('E-DIM-REF-MISSING'));
  // 声明为 enum 的维度：代号形态的字串是枚举值，不再当 ref 去核。
  write(engine, state, ['created', 'item_b', 'props', 'color'], 'color_red');
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'color']), 'color_red');
  // 维度未定义即抛。
  assert.throws(() => write(engine, state, ['created', 'item_b', 'props', 'nosuchdim'], 1), code('E-DIM-UNKNOWN-READ'));
  // 未在 stateKeys 登记的顶层键拒写。
  assert.throws(() => write(engine, state, ['links', 'to'], 'item_b'), code('E-PATH-UNDECLARED'));
});

test('writeScope：作用域内写两笔后抛错，两笔都撤回；作用域外写入拒绝', () => {
  const { engine, state } = fixture();
  create(engine, state, 'item_b', 'item', { mass: 2 });
  const boom = new Error('boom');
  assert.throws(() => writeScope(state, (tx) => {
    createEntity(engine, state, tx, 'item_c', 'item', { mass: 5 });
    writePath(engine, state, tx, ['created', 'item_b', 'props', 'mass'], 9);
    throw boom;
  }), (e) => e === boom);
  assert.equal(readPath(engine, state, ['created', 'item_c']), undefined);
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'mass']), 2);
  // 撤回后缓存也失活：dim 读到的是撤回后的值。
  assert.equal(dim(engine, state, 'item', 'item_b', 'mass').value, 2);
  // 作用域外：没有 tx、tx 属于别的 state、tx 已失效，一律抛。
  assert.throws(() => writePath(engine, state, undefined, ['created', 'item_b', 'props', 'mass'], 4));
  /** @type {any} */
  let leaked;
  writeScope(state, (tx) => { leaked = tx; });
  assert.throws(() => writePath(engine, state, leaked, ['created', 'item_b', 'props', 'mass'], 4));
  assert.throws(() => writeScope({ created: {} }, (tx) => writePath(engine, state, tx, ['created', 'item_b', 'props', 'mass'], 4)));
  assert.equal(readPath(engine, state, ['created', 'item_b', 'props', 'mass']), 2);
});

test('dim / modified：返回 Fact，value 与 source 取自对应一级，modified 另带 base', () => {
  const { engine, state } = fixture();
  const row = dim(engine, state, 'item', 'item_a', 'mass');
  assert.deepEqual({ ...row }, { known: true, applicable: true, value: 1, source: 'entity_row', current: true });
  create(engine, state, 'item_b', 'item', { mass: 2 });
  assert.equal(dim(engine, state, 'item', 'item_b', 'mass').source, 'created_row');
  assert.equal(dim(engine, state, 'item', 'item_b', 'mass').value, 2);
  const def = dim(engine, state, 'item', 'item_b', 'hue');
  assert.equal(def.value, 7);
  assert.equal(def.source, 'table_default');
  const withBonus = Object.freeze({ ...engine, modifierSources: Object.freeze([(v) => v + 10]) });
  const m = modified(withBonus, state, 'item', 'item_b', 'mass');
  assert.equal(m.value, 12);
  assert.equal(m.base, 2);
  assert.equal(m.source, 'created_row');
  assert.throws(() => dim(engine, state, 'item', 'item_b', 'color'), code('E-DIM-UNKNOWN-READ'));
});
