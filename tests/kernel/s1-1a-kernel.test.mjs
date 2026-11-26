// S1-1 卡 A 的内核行为单测（写码方自补，放 tests/kernel；不作验收依据，验收由独立出题方另出）。
// 签名已按卷二 :535 对齐（S1-1p）：路径经 engine.P 构造，writeScope(engine, state, fn)，writePath(state, path, value, tx)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../../server-plugin/rules/load/registry.mjs';
import { kindOfEntity, readPath, writePath, createEntity } from '../../server-plugin/kernel/storage.mjs';
import { stateMemo, invalidateTop } from '../../server-plugin/kernel/memo.mjs';
import { writeScope } from '../../server-plugin/kernel/transaction.mjs';
import { dim, modified } from '../../server-plugin/kernel/dimensions.mjs';
import { makePathHandles } from '../../server-plugin/kernel/handles.mjs';

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

export const PATH_TYPES = { 'created.*': 'struct', 'created.*.props.*': 'dimension', 'links.*': 'EventId' };
export const KEY_KINDS = { 'created.*': [['item', 'person', 'place']], 'created.*.props.*': [['item', 'person', 'place'], 'dimKey'], 'links.*': ['event'] };

function fixture() {
  const registry = buildRegistry(DOCS);
  const P = makePathHandles(PATH_TYPES, KEY_KINDS, []);
  const engine = Object.freeze({ registry, structs: Object.freeze({}), modifierSources: Object.freeze([]), stateKeys: Object.freeze({ created: {} }), P });
  const state = { created: {} };
  return { engine, state };
}

// 每次写都包进一个写入作用域。
const create = (engine, state, id, kind, props) => writeScope(engine, state, (tx) => createEntity(state, id, kind, props, tx));
const write = (engine, state, path, value) => writeScope(engine, state, (tx) => writePath(state, path, value, tx));
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
  const readX = () => stateMemo(state, engine, ['x'], () => ++buildX, [['xx']]);
  const readY = () => stateMemo(state, engine, ['y'], () => ++buildY, [['yy']]);
  assert.equal(readX(), 1);
  assert.equal(readY(), 1);
  assert.equal(readX(), 1);
  invalidateTop(state, 'xx');
  assert.equal(readX(), 2);
  assert.equal(readY(), 1);
  invalidateTop(state, 'yy');
  assert.equal(readY(), 2);
  assert.equal(readX(), 2);
  assert.throws(() => stateMemo(state, engine, ['z'], () => 1, []));
  assert.throws(() => stateMemo(state, engine, ['z'], () => 1, /** @type {any} */ (null)));
  assert.throws(() => stateMemo(state, engine, /** @type {any} */ ('z'), () => 1, [['xx']]));
  assert.throws(() => stateMemo(state, engine, [], () => 1, [['xx']]));
});

test("stateMemo：['a,b'] 与 ['a','b'] 不撞键", () => {
  const { engine, state } = fixture();
  const one = stateMemo(state, engine, ['a,b'], () => 'one', [['xx']]);
  const two = stateMemo(state, engine, ['a', 'b'], () => 'two', [['xx']]);
  assert.equal(one, 'one');
  assert.equal(two, 'two');
});

test('createEntity / kindOfEntity：registry 缺 hasLoaded / kindOfLoaded 即抛，不跳过核对', () => {
  const { engine, state } = fixture();
  const reg = engine.registry;
  const noHas = { ...engine, registry: { kindIds: reg.kindIds, kindOfLoaded: reg.kindOfLoaded } };
  const noKind = { ...engine, registry: { kindIds: reg.kindIds, hasLoaded: reg.hasLoaded } };
  assert.throws(() => kindOfEntity(noKind, state, 'item_a'), code('E-DIM-REF-MISSING'));
  assert.throws(() => writeScope(noHas, state, (tx) => createEntity(state, 'item_zz', 'item', {}, tx)));
});

test('writePath：按维度声明判 ref；枚举值与普通值不按 ref 拒；未登记顶层键拒写', () => {
  const { engine, state } = fixture();
  const { P } = engine;
  create(engine, state, 'item_b', 'item', { mass: 2 });
  write(engine, state, P.created_props('item_b', 'mass'), 3);
  assert.equal(readPath(state, P.created_props('item_b', 'mass')), 3);
  write(engine, state, P.created_props('item_b', 'origin'), 'place_a');
  assert.equal(readPath(state, P.created_props('item_b', 'origin')), 'place_a');
  assert.throws(() => write(engine, state, P.created_props('item_b', 'origin'), 'nope_1'), code('E-DIM-REF-MISSING'));
  assert.throws(() => write(engine, state, P.created_props('item_b', 'origin'), null), code('E-DIM-REF-MISSING'));
  assert.throws(() => write(engine, state, P.created_props('item_b', 'origin'), ''), code('E-DIM-REF-MISSING'));
  write(engine, state, P.created_props('item_b', 'color'), 'color_red');
  assert.equal(readPath(state, P.created_props('item_b', 'color')), 'color_red');
  assert.throws(() => write(engine, state, P.created_props('item_b', 'nosuchdim'), 1), code('E-DIM-UNKNOWN-READ'));
  assert.throws(() => write(engine, state, P.links('to'), 'item_b'), code('E-PATH-UNDECLARED'));
});

test('writeScope：作用域内写两笔后抛错，两笔都撤回；作用域外写入拒绝', () => {
  const { engine, state } = fixture();
  const { P } = engine;
  create(engine, state, 'item_b', 'item', { mass: 2 });
  const boom = new Error('boom');
  assert.throws(() => writeScope(engine, state, (tx) => {
    createEntity(state, 'item_c', 'item', { mass: 5 }, tx);
    writePath(state, P.created_props('item_b', 'mass'), 9, tx);
    throw boom;
  }), (e) => e === boom);
  assert.equal(readPath(state, P.created('item_c')), undefined);
  assert.equal(readPath(state, P.created_props('item_b', 'mass')), 2);
  assert.equal(dim(engine, state, 'item', 'item_b', 'mass').value, 2);
  assert.throws(() => writePath(state, P.created_props('item_b', 'mass'), 4, undefined));
  /** @type {any} */
  let leaked;
  writeScope(engine, state, (tx) => { leaked = tx; });
  assert.throws(() => writePath(state, P.created_props('item_b', 'mass'), 4, leaked));
  assert.throws(() => writeScope(engine, { created: {} }, (tx) => writePath(state, P.created_props('item_b', 'mass'), 4, tx)));
  assert.equal(readPath(state, P.created_props('item_b', 'mass')), 2);
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
