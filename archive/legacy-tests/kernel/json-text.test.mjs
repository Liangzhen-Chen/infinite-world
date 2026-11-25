// JSON 文本的指针与标量文法（原 patterns.test.mjs 搬入；定义随 S13 (b) 落在 kernel/load/vocab-load.mjs，卷二 §2.8 表 kernel 行"JSON 文本解析只在 kernel/load/*"）。
// 期望值全写成字面量，不用被测函数算。
import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeJsonPointer, jsonScalarAt, keyPointerOf } from '../../server-plugin/kernel/load/vocab-load.mjs';

test('JSON 指针转义与键段定位', () => {
  assert.equal(escapeJsonPointer('a~/b'), 'a~0~1b');
  assert.equal(escapeJsonPointer('plain'), 'plain');
  assert.equal(keyPointerOf('#/rows/x/value'), '#/rows/x/key');
  assert.equal(keyPointerOf('#/rows/x/values'), '#/rows/x/values');
});

test('JSON 标量粘性匹配：从给定位起取数字、true/false/null', () => {
  assert.deepEqual(jsonScalarAt('{"a": 12.5x}', 6), { raw: '12.5', end: 10 });
  assert.deepEqual(jsonScalarAt('true false', 0), { raw: 'true', end: 4 });
  assert.deepEqual(jsonScalarAt('null', 0), { raw: 'null', end: 4 });
  assert.equal(jsonScalarAt('tru', 0), null);
  assert.equal(jsonScalarAt('x1', 0), null);
});
