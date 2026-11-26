// S1-1p 路径句柄 P 的行为单测（写码方自补；不作验收依据）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRegistry } from '../../server-plugin/rules/load/registry.mjs';
import { makePathHandles } from '../../server-plugin/kernel/handles.mjs';
import { readPath, writePath } from '../../server-plugin/kernel/storage.mjs';
import { writeScope } from '../../server-plugin/kernel/transaction.mjs';

const TYPES = { 'created.*.props.*': 'dimension', 'lot.*.spoilage': 'number', 'cells.*.*.*': 'number', 'narration.*': 'string' };
const KINDS = { 'created.*.props.*': [['item'], 'dimKey'], 'lot.*.spoilage': ['item'], 'cells.*.*.*': ['gridKey', 'gridKey', 'gridKey'] };
const TEXT = ['narration.*'];
const code = (c) => (e) => /** @type {any} */ (e).code === c;

function setup() {
  const registry = buildRegistry([{ kind: 'item', entity: { idPrefix: ['item_'], singletonIds: [] }, rows: {}, dimensions: { mass: { type: 'number' } } }]);
  const P = makePathHandles(TYPES, KINDS, TEXT);
  const engine = Object.freeze({ registry, structs: Object.freeze({}), modifierSources: Object.freeze([]), stateKeys: Object.freeze({ created: {}, lot: {} }), P });
  return { engine, P, state: { created: {}, lot: {} } };
}

test('成员集合 = pathTypes − textPaths；命名规则：点换下划线、* 段不进名字', () => {
  const P = makePathHandles(TYPES, KINDS, TEXT);
  assert.deepEqual(Object.keys(P).sort(), ['cells', 'created_props', 'lot_spoilage']);
  assert.deepEqual([...P.lot_spoilage('item_a').segs], ['lot', 'item_a', 'spoilage']);
  assert.deepEqual([...P.cells('a', 'b', 'c').segs], ['cells', 'a', 'b', 'c']);
  assert.ok(Object.isFrozen(P) && Object.isFrozen(P.lot_spoilage('x')) && Object.isFrozen(P.lot_spoilage('x').segs));
  assert.equal(Object.keys(P).includes('issued'), false);
});

test('撞名抛 E-PATH-NAME-CLASH；有 * 段却无 keyKinds 抛 E-PATH-KEYKINDS', () => {
  assert.throws(() => makePathHandles({ 'a_b.c': 'number', 'a.b_c': 'number' }, {}, []), code('E-PATH-NAME-CLASH'));
  assert.throws(() => makePathHandles({ 'x.*': 'number' }, {}, []), code('E-PATH-KEYKINDS'));
});

test('实参个数不对或空串、非字串即拒', () => {
  const { P } = setup();
  assert.throws(() => P.lot_spoilage(), code('E-DIM-ID-FORMAT'));
  assert.throws(() => P.lot_spoilage('a', 'b'), code('E-DIM-ID-FORMAT'));
  assert.throws(() => P.lot_spoilage(''), code('E-DIM-ID-FORMAT'));
  assert.throws(() => P.lot_spoilage(7), code('E-DIM-ID-FORMAT'));
});

test('writePath：裸数组、手搓对象、别的 engine 发的路径都拒；本 engine 发的可写可读', () => {
  const { engine, P, state } = setup();
  const other = setup();
  const w = (path) => writeScope(engine, state, (tx) => writePath(state, path, 1, tx));
  assert.throws(() => w(['lot', 'item_a', 'spoilage']), code('E-DIM-STRUCT-FIELD'));
  assert.throws(() => w(Object.freeze({ pattern: 'lot.*.spoilage', segs: Object.freeze(['lot', 'item_a', 'spoilage']) })), code('E-PATH-UNDECLARED'));
  assert.throws(() => w(other.P.lot_spoilage('item_a')), code('E-PATH-UNDECLARED'));
  assert.deepEqual(state.lot, {});
  w(P.lot_spoilage('item_a'));
  assert.equal(readPath(state, P.lot_spoilage('item_a')), 1);
  assert.throws(() => readPath(state, /** @type {any} */ (['lot', 'item_a', 'spoilage'])), code('E-DIM-STRUCT-FIELD'));
});
