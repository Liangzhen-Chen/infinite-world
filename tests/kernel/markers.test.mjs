// B2-W4 第一步：协议标记句柄（卷二 §7 S13 (a) 上下文白名单、李白 11-18 08:18 B2-W2 kernel 组第 3 条）。
// B2-W4 第二步（李白 11-18 13:05 裁定第 1 条）：定义源与 T 派生搬到 kernel/handles/markers.mjs，本叶子 0 import；types.mjs 只引用并转出。
// 机制：由各族的定义源在加载期派生冻结族对象，成员值即定义源里的字串，带族名、is(值)、未定义成员抛 E-DIM-REF-MISSING。
// 期望值按卷文与定义源手写；不从被测函数反算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T, TYPES, CODE_ENUMS, DOMAIN_OPTIONAL, ROW_FIELDS, RX_OPS, RX_KINDS, PATH_TYPE_EXTRAS, NS_ROW_TYPES, markersOf } from '../../server-plugin/kernel/handles/markers.mjs';
import { T as T_REEXPORTED } from '../../server-plugin/kernel/validate/types.mjs';

test('handles/markers.mjs 是 0 import 叶子：源码没有任何 import 语句', () => {
  const src = readFileSync(new URL('../../server-plugin/kernel/handles/markers.mjs', import.meta.url), 'utf8');
  assert.equal(/^\s*import\b/m.test(src), false);
});

test('定义源只有一份：validate/types.mjs 转出的就是 handles/markers.mjs 的同一个 T', () => {
  assert.equal(T_REEXPORTED, T);
});

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

test('T.rx_op：rxTree 的 op 字面值（卷二 §2.9 第 4 条变体表）与调用名，成员即标记本身', () => {
  const want = ['num', 'dim', 'handle', 'add', 'sub', 'mul', 'div', 'cmp', 'and', 'or', 'not', 'agg', 'clock', 'slot', 'mod', 'broader', 'ns', 'member'];
  assert.deepEqual([...RX_OPS], want);
  for (const name of want) assert.equal(T.rx_op[name], name);
  assert.equal(T.rx_op.family, 'rx_op');
});

test('T.rx_kind：RX 读法类型标记，含 rx_type 四值与"代号或句柄"、set、代码内 runtime 占位', () => {
  assert.deepEqual([...RX_KINDS], ['number', 'boolean', 'code', 'handle', 'codeOrHandle', 'set', 'runtime']);
  assert.equal(T.rx_kind.codeOrHandle, 'codeOrHandle');
  assert.equal(T.rx_kind.runtime, 'runtime');
  assert.equal(T.rx_kind.family, 'rx_kind');
});

test('T.path_type_extra、T.ns_row_type：pathTypes 三记号（卷二 §2.7 :811）与 rxNamespaces 的"随字段"（:1195）各一份', () => {
  assert.deepEqual([...PATH_TYPE_EXTRAS], ['EventId', 'dimension', 'sealed']);
  for (const name of PATH_TYPE_EXTRAS) assert.equal(T.path_type_extra[name], name);
  assert.deepEqual([...NS_ROW_TYPES], ['field']);
  assert.equal(T.ns_row_type.field, 'field');
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
