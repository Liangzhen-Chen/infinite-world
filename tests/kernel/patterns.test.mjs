// S13 正则叶子的单项测试（卷二 §2.8 表 kernel 行、封卷后勘误 1118k17）：每个函数的期望值都写成字面量，不用被测函数算。
// 叶子只放从 rx.mjs 搬来的正则（十进制文法改在 det-math.mjs 手写逐字符解析，测试见 det-math-decimal.test.mjs）；其余格式文法的测试跟到新位置：
// handles/keys.mjs → keys-format.test.mjs；validate/types.mjs、validate/rows.mjs → 各自测试；load/vocab-load.mjs → json-text.test.mjs。
import test from 'node:test';
import assert from 'node:assert/strict';
import { rxTokenAt, shapeArgCount, setFieldNames } from '../../server-plugin/kernel/handles/patterns.mjs';

test('RX 词法：粘性匹配数字、点分名字、运算符', () => {
  assert.deepEqual(rxTokenAt('mass > 2', 0), { groups: [undefined, 'mass', undefined], end: 4 });
  assert.deepEqual(rxTokenAt('mass > 2', 5), { groups: [undefined, undefined, '>'], end: 6 });
  assert.deepEqual(rxTokenAt('mass > 2', 7), { groups: ['2', undefined, undefined], end: 8 });
  assert.deepEqual(rxTokenAt('lot.spoilage <= 0.3', 13), { groups: [undefined, undefined, '<='], end: 15 });
  assert.equal(rxTokenAt('mass', 0).end, 4);
});

test('返回形状：arg 占位计数与 set 字段名', () => {
  assert.equal(shapeArgCount('<字段>.<句柄>'), 2);
  assert.equal(shapeArgCount('<维度键>，另有 classes（set，只作 member 的 set）'), 1);
  assert.equal(shapeArgCount('fraction'), 0);
  assert.deepEqual(setFieldNames('<维度键>，另有 classes（set，只作 member 的 set）'), ['classes']);
  assert.deepEqual(setFieldNames('<a>，另有 parts（set，只作 member 的 set）、cells（set，只作 member 的 set）'), ['parts', 'cells']);
  assert.deepEqual(setFieldNames('fraction'), []);
});
