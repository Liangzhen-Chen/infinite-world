// 必填条件 bySubstance（卷二 §1.2 :105，勘误 1124k130；判据在卷三甲 §2.1 :167、M-17、M-20）：
// 本行 substance 是所列代号之一时必填（缺值按 onUnknown 记缺口或报错），否则不适用；不适用的行写了值即加载报错。
// 测试表是 fixture.mjs 的虚构表 gadget 加一个本源成分维度与一个只对植物质行必填的部位维度，不是世界内容。

import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, OPTIONS, sourcesOf } from './fixture.mjs';
import { validateDimensions } from '../../server-plugin/kernel/validate/dimensions-validate.mjs';

const common = { modifiable: false, source: 'test', owner: 'test' };

function world(rows, required = 'bySubstance:subst_plant,subst_wood') {
  const f = fixture();
  f.vocab.families.substance = { closed: false, prefix: 'subst_', entries: { subst_plant: {}, subst_wood: {}, subst_metal: {} } };
  f.gadget.dimensions.substance = { type: 'ref', vocab: 'substance', nullable: true, required: 'never', onUnknown: 'skip', ...common };
  f.gadget.dimensions.part = { type: 'ref', vocab: 'grade', nullable: true, required, onUnknown: 'gap', ...common };
  for (const [id, row] of Object.entries(rows)) f.gadget.rows[id] = { basis: 'b', status: 'vst_ok', mass: 1, ...row };
  return validateDimensions(sourcesOf(f), OPTIONS);
}
const on = (r, id, code) => r.errors.filter((e) => e.code === code && e.row === id && e.dim === 'part');

test('bySubstance：所列代号之一的行缺值按 onUnknown 记缺口（W-DIM-GAP），不阻加载', () => {
  const r = world({ gad_plant: { substance: 'subst_plant' }, gad_wood: { substance: 'subst_wood' } });
  assert.equal(on(r, 'gad_plant', 'W-DIM-GAP').length, 1);
  assert.equal(on(r, 'gad_wood', 'W-DIM-GAP').length, 1);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
});

test('bySubstance：所列代号的行填了值不报缺口', () => {
  const r = world({ gad_plant: { substance: 'subst_plant', part: 'grd_a' } });
  assert.deepEqual(on(r, 'gad_plant', 'W-DIM-GAP'), []);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
});

test('bySubstance：别的成分、成分为 null、没写成分的行不适用——不记缺口', () => {
  const r = world({ gad_metal: { substance: 'subst_metal' }, gad_null: { substance: null }, gad_none: {} });
  for (const id of ['gad_metal', 'gad_null', 'gad_none']) assert.deepEqual(on(r, id, 'W-DIM-GAP'), [], id);
  assert.deepEqual(r.errors.filter((e) => e.severity === 'error'), []);
});

test('bySubstance：不适用的行写了值（含显式 null）即加载报错；适用的行写 null 不报（卷三甲 M-17、M-20）', () => {
  const r = world({ gad_metal: { substance: 'subst_metal', part: 'grd_a' }, gad_none: { part: null }, gad_plant: { substance: 'subst_plant', part: null } });
  assert.equal(on(r, 'gad_metal', 'E-DIM-DOMAIN-RANGE').length, 1);
  assert.equal(on(r, 'gad_none', 'E-DIM-DOMAIN-RANGE').length, 1);
  assert.deepEqual(on(r, 'gad_plant', 'E-DIM-DOMAIN-RANGE'), []);
  assert.deepEqual(on(r, 'gad_plant', 'W-DIM-GAP'), []);
});

test('bySubstance 写法：缺代号、带空格、非小写代号拒收（E-DIM-STRUCT-FIELD）', () => {
  for (const bad of ['bySubstance', 'bySubstance:', 'bySubstance:subst_plant,', 'bySubstance:Subst_plant']) {
    const r = world({}, bad);
    assert.ok(r.errors.some((e) => e.code === 'E-DIM-STRUCT-FIELD' && e.dim === 'part'), bad);
  }
});
