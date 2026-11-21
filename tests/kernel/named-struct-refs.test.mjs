// 格子迁移 G5a 修改轮（Opus 只核必须改 1）：place.anchor、edges.portal.a/b、person.pos 三处位置量一律引用命名 struct:pos 的登记
// （卷二 §1.5 :252；world/ontology/named-structs.json），表头不再各抄一份字段表；类型校验按登记核缺字段、多字段、类型错。
// 登记的字段是 w、x、y、z（integer:count）与 coarse（boolean）；期望按登记手写成字面量。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkValue } from '../../server-plugin/kernel/validate/types.mjs';
import { namedStructMapOf } from '../../server-plugin/kernel/named-structs.mjs';
import { buildPersonWorld, personRow } from './person-world.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const PLACE = readJson('world/ontology/dimensions/place.json');
const PERSON = readJson('world/ontology/dimensions/person.json');
const REG = readJson('world/ontology/named-structs.json');
const ENV = { namedStructs: namedStructMapOf(REG) };
const GOOD = { w: 0, x: 10, y: -20, z: 3, coarse: false };
const DEFS = { 'place.anchor': PLACE.dimensions.anchor, 'edges.portal.a': PLACE.edgeStruct.fields.portal.fields.a, 'edges.portal.b': PLACE.edgeStruct.fields.portal.fields.b, 'person.pos': PERSON.dimensions.pos };

const check = (def, v) => { const out = []; checkValue(def, v, ENV, { table: 't', row: 'r', dim: 'd', path: 'd' }, (e) => out.push(e.code)); return out; };

test('三处位置量的表头只引用 struct:pos，不抄字段表', () => {
  for (const [name, def] of Object.entries(DEFS)) {
    assert.equal(def.type, 'struct', name);
    assert.equal(def.named, 'struct:pos', name);
    assert.equal(Object.hasOwn(def, 'fields'), false, `${name} must not carry its own field table`);
  }
});

test('合登记的位置放行；缺字段、多字段、整数字段给小数或字串、coarse 给非布尔、非对象都拒 E-DIM-STRUCT-FIELD', () => {
  const bad = [
    { w: 0, x: 10, y: -20, z: 3 }, // 缺 coarse
    { x: 10, y: -20, z: 3, coarse: false }, // 缺 w
    {}, // 全缺
    { ...GOOD, extra: 1 }, // 多字段
    { ...GOOD, x: 1.5 }, // 整数字段给小数
    { ...GOOD, y: '5' }, // 整数字段给字串
    { ...GOOD, coarse: 0 }, // coarse 非布尔
    [], 7, 'loc_a', // 非对象
  ];
  for (const [name, def] of Object.entries(DEFS)) {
    assert.deepEqual(check(def, GOOD), [], name);
    for (const v of bad) assert.deepEqual(check(def, v), ['E-DIM-STRUCT-FIELD'], `${name} ${JSON.stringify(v)}`);
  }
});

test('引用的登记不存在：表头校验之外，取值也拒（不当通过）；登记里没有的名字 E-DIM-REF-MISSING', () => {
  const out = [];
  checkValue({ type: 'struct', named: 'struct:nope' }, GOOD, ENV, { table: 't', row: 'r', dim: 'd', path: 'd' }, (e) => out.push(e.code));
  assert.deepEqual(out, ['E-DIM-REF-MISSING']);
});

test('person 行的 pos 缺字段、多字段、类型错经世界加载被拒（真实表头 + 夹具），合格的通过', () => {
  const load = (pos) => buildPersonWorld((f) => { f.personRows.npc_a = personRow({ heir: 'npc_b', pos }); });
  assert.doesNotThrow(() => load({ w: 0, x: 20050, y: 5050, z: 0, coarse: false }));
  for (const pos of [{ w: 0, x: 20050, y: 5050, z: 0 }, { w: 0, x: 20050, y: 5050, z: 0, coarse: false, extra: 1 }, { w: 0, x: 1.5, y: 5050, z: 0, coarse: false }, { w: 0, x: 20050, y: 5050, z: 0, coarse: 'no' }]) {
    assert.throws(() => load(pos), /E-DIM-STRUCT-FIELD","person","npc_a","pos"/, JSON.stringify(pos));
  }
});
