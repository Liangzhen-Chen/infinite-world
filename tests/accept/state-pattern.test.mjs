// 卷六 §3.5 S6-14 :337 状态模式检查（工具 tools/accept/detectors/state_pattern.mjs）。
// 判"数量字段"只读字段单位与资源种类表 unit，不按字段名、不按单个路径；豁免只有账本三路径与合同、义务记录里的应付数额。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadContext } from '../../tools/accept/read.mjs';
import { detect } from '../../tools/accept/detectors/state_pattern.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PARAMS = { checks: ['stateQuantity'], code: 'E-DIM-STRUCT-FIELD' };
const RES = (unit) => JSON.stringify({ rows: [{ key: 'res_test', value: { unit } }] });
const STATE = (pathTypes) => JSON.stringify({ pathTypes });
const DECL = (pathTypes, keyKinds) => JSON.stringify({ pathTypes, keyKinds });
const STRUCTS = (rows) => JSON.stringify({ version: 1, rows });
const DIM = (kind, dimensions, rows) => JSON.stringify({ kind, dimensions, rows });

function ctxOf(map) {
  const files = new Map(Object.entries(map));
  return loadContext(ROOT, { files: [...files.keys()].sort(), read: (p) => files.get(p) });
}

test('真实状态登记表与维度表上计数为 0（账本三路径的余额结构按 S6-14 豁免）', () => {
  assert.deepEqual(detect(loadContext(ROOT), PARAMS), []);
});

test('状态键上的资源数量字段报 E-DIM-STRUCT-FIELD', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'npcs.*.coins': 'integer:copper' }),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /npcs\.\*\.coins/);
});

test('维度表实体行上的资源数量字段报（卷六 S6-14 :337「实体行」、规则 11 :382）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({}),
    'world/ontology/named-structs.json': STRUCTS([]),
    'world/ontology/dimensions/item.json': DIM('item', {
      mass: { type: 'number', unit: 'copper' },
      note: { type: 'ref', vocab: 'x' },
    }, {
      itm_x: { mass: 2, note: 'a' },
      itm_y: { note: 'b' },
    }),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.equal(hits[0].file, 'world/ontology/dimensions/item.json');
  assert.match(hits[0].symbolPath, /itm_x\.mass/);
});

test('偏离行（created.*.props.* 的 dimension）按维度表表头展开（卷二 §2.7 :811）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': DECL(
      { 'created.*.props.*': 'dimension' },
      { 'created.*.props.*': [['item'], 'dimKey'] },
    ),
    'world/ontology/named-structs.json': STRUCTS([]),
    'world/ontology/dimensions/item.json': DIM('item', {
      mass: { type: 'number', unit: 'copper' },
      age: { type: 'integer', unit: 'day' },
    }, {}),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /created\.\*\.props\.\*/);
  assert.match(hits[0].symbolPath, /item\.mass/);
});

test('偏离行的维度表尚未建：按加载器同口径跳过（kernel/load/state-owners.mjs:259-260）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': DECL(
      { 'created.*.props.*': 'dimension' },
      { 'created.*.props.*': [['item', 'person', 'place'], 'dimKey'] },
    ),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.deepEqual(hits, []);
});

test('list<…> 简写展开到命名 struct 的数值字段（卷二 §2.7 :675、:811）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'pendingPost.*': 'list<struct:pendingPost>' }),
    'world/ontology/named-structs.json': STRUCTS([
      { name: 'struct:pendingPost', source: 'fixture', type: { struct: { entrySeq: 'integer:count', qty: 'integer:copper' } } },
    ]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /qty/);
});

test('嵌套 list<…> 同样展开', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'queue.*': 'list<list<integer:copper>>' }),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
});

test('命名 struct 里的资源数量字段同样报（按单位，不按字段名）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'npcs.*.holding': 'struct:holding' }),
    'world/ontology/named-structs.json': STRUCTS([{ name: 'struct:holding', source: 'fixture', type: { struct: { shares: 'integer:copper' } } }]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /shares/);
});

test('账本三路径与义务记录里的应付数额不报（应付数额按登记里的角色标记豁免）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({
      'accounts.*': 'struct:holderAccounts',
      'ledgerTotals': 'struct:resourceTotals',
      'outflowTotals.*': 'struct:holderOutflow',
      'obligations.*': 'struct:obligation',
    }),
    'world/ontology/named-structs.json': STRUCTS([
      { name: 'struct:holderAccounts', source: 'fixture', type: { map: { key: 'ref vocab purpose', value: 'integer:copper' } } },
      { name: 'struct:resourceTotals', source: 'fixture', type: { struct: { cumulative: 'integer:copper' } } },
      { name: 'struct:holderOutflow', source: 'fixture', type: { struct: { cumulative: 'integer:copper' } } },
      {
        name: 'struct:obligation', source: 'fixture',
        type: { struct: { qty: 'integer:copper' } },
        fieldRoles: { qty: { role: 'payable', source: '卷六 §2.4 :200' } },
      },
    ]),
  }), PARAMS);
  assert.deepEqual(hits, []);
});

test('义务记录里未标应付数额的数值字段（已给付 done）照报，不按整键豁免', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'obligations.*': 'struct:obligation' }),
    'world/ontology/named-structs.json': STRUCTS([
      {
        name: 'struct:obligation', source: 'fixture',
        type: { struct: { qty: 'integer:copper', done: 'integer:copper' } },
        fieldRoles: { qty: { role: 'payable', source: '卷六 §2.4 :200' } },
      },
    ]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /done/);
});

test('合同记录里未标应付数额的数值字段照报（条款里的数额不一定是应付数额）', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'contracts.*': 'struct:contract' }),
    'world/ontology/named-structs.json': STRUCTS([
      { name: 'struct:contract', source: 'fixture', type: { struct: { terms: { map: { key: 'ref vocab cterm', value: 'integer:copper' } } } } },
    ]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /terms/);
});

test('应付数额角色标记只豁免合同、义务记录里的字段，其他状态键照报', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'npcs.*.owe': 'struct:obligation' }),
    'world/ontology/named-structs.json': STRUCTS([
      {
        name: 'struct:obligation', source: 'fixture',
        type: { struct: { qty: 'integer:copper' } },
        fieldRoles: { qty: { role: 'payable', source: '卷六 §2.4 :200' } },
      },
    ]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-DIM-STRUCT-FIELD');
  assert.match(hits[0].symbolPath, /npcs\.\*\.owe/);
});

test('单位不在资源种类表、或数值字段没有单位时不报', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({
      'npcs.*.age': 'integer:day',
      'npcs.*.score': 'number:score',
      'npcs.*.value': 'number nullable',
    }),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.deepEqual(hits, []);
});

test('引用了未登记的命名 struct：报 E-ACC-ITEM-PARAM，不静默放过', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': RES('copper'),
    'world/ontology/state-owners.json': STATE({ 'npcs.*.x': 'struct:missing' }),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-ACC-ITEM-PARAM');
});

test('资源种类表缺失：报 E-ACC-ITEM-PARAM，不当作零', () => {
  const hits = detect(ctxOf({
    'world/rules/registry.json': JSON.stringify({ rows: [{ code: 'economyResources', file: 'tables/economy/missing.json' }] }),
    'world/ontology/state-owners.json': STATE({}),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-ACC-ITEM-PARAM');
});

test('资源种类表为空：报 E-ACC-ITEM-PARAM，不当作零', () => {
  const hits = detect(ctxOf({
    'world/rules/tables/economy/resources.json': JSON.stringify({ rows: [] }),
    'world/ontology/state-owners.json': STATE({}),
    'world/ontology/named-structs.json': STRUCTS([]),
  }), PARAMS);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].code, 'E-ACC-ITEM-PARAM');
});
