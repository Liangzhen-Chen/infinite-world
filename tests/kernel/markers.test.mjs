// B2-W4 第一步：协议标记句柄（卷二 §7 S13 (a) 上下文白名单、李白 11-18 08:18 B2-W2 kernel 组第 3 条）。
// 机制：由各族的定义源在加载期派生冻结族对象，成员值即定义源里的字串，带族名、is(值)、未定义成员抛 E-DIM-REF-MISSING。
// 期望值按卷文与定义源手写；不从被测函数反算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { T, TYPES, CODE_ENUMS, DOMAIN_OPTIONAL, ROW_FIELDS, markersOf } from '../../server-plugin/kernel/validate/types.mjs';

test('T.type：成员是卷二 §1.5 的 14 个类型名，值即标记本身', () => {
  const want = ['number', 'integer', 'boolean', 'string', 'enum', 'ref', 'union', 'set', 'map', 'list', 'struct', 'curve', 'distribution', 'rx'];
  assert.equal(T.type.family, 'type');
  for (const name of want) assert.equal(T.type[name], name);
  assert.equal(T.type.is('map'), true);
  assert.equal(T.type.is('nope'), false);
  assert.equal(T.type.is(1), false);
  assert.deepEqual([...TYPES], want);
});

test('T.code_enum：每个代码内封闭枚举一个族，成员即该枚举的取值', () => {
  assert.deepEqual(Object.keys(T.code_enum), Object.keys(CODE_ENUMS));
  assert.equal(T.code_enum.cell_grade.measured, 'measured');
  assert.equal(T.code_enum.cell_grade.referenced, 'referenced');
  assert.equal(T.code_enum.cell_grade.designed, 'designed');
  assert.deepEqual(['eq', 'ne', 'lt', 'le', 'gt', 'ge'].map((v) => T.code_enum.rx_cmp[v]), ['eq', 'ne', 'lt', 'le', 'gt', 'ge']);
  assert.equal(T.code_enum.rx_cmp.family, 'code_enum.rx_cmp');
});

test('T.domain_optional、T.row_field：成员由各自定义源派生', () => {
  for (const name of DOMAIN_OPTIONAL) assert.equal(T.domain_optional[name], name);
  for (const name of ROW_FIELDS) assert.equal(T.row_field[name], name);
  assert.equal(T.row_field.extends, 'extends');
  assert.equal(T.domain_optional.rx, 'rx');
});

test('冻结：族对象与根不可改，赋值抛 TypeError', () => {
  assert.ok(Object.isFrozen(T) && Object.isFrozen(T.type) && Object.isFrozen(T.code_enum) && Object.isFrozen(T.code_enum.rx_cmp));
  assert.throws(() => { T.type.number = 'string'; }, TypeError);
  assert.throws(() => { T.type.extra = 'extra'; }, TypeError);
});

test('未定义标记访问抛 E-DIM-REF-MISSING；语言协议键（then、toJSON）照常取 undefined', () => {
  assert.throws(() => T.type.nope, (e) => e.code === 'E-DIM-REF-MISSING');
  assert.throws(() => T.code_enum.rx_cmp.missing, (e) => e.code === 'E-DIM-REF-MISSING');
  assert.equal(T.type.then, undefined);
  assert.equal(T.type.toJSON, undefined);
});

test('markersOf：定义源里的每个值一个成员，重复与空值拒收，族名照给', () => {
  const fam = markersOf('demo_family', ['aa', 'bb']);
  assert.equal(fam.family, 'demo_family');
  assert.equal(fam.aa, 'aa');
  assert.equal(fam.bb, 'bb');
  assert.ok(Object.isFrozen(fam));
  assert.throws(() => markersOf('dup', ['aa', 'aa']));
  assert.throws(() => markersOf('empty', ['']));
});
