// S13 正则叶子的单项测试（卷二 §2.8 表 kernel 行、封卷后勘误 1118k17）：每个函数的期望值都写成字面量，不用被测函数算。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isModuleFile, isRuleTableFile, isLowerCamelCode, isErrorCode,
  isDeclarableNode, isGeneratedNode, isAnyNode, isPathPattern,
  parseDecimalLiteral, escapeJsonPointer, jsonScalarAt, keyPointerOf, isHex64,
  listItemType, parseNumberType, isClosedType, mentionsSealed, splitRequiredTerms,
  rxTokenAt, shapeArgCount, setFieldNames, snakeCaseKey,
} from '../../server-plugin/kernel/handles/patterns.mjs';

test('模块路径与规则表路径', () => {
  assert.equal(isModuleFile('router/menu-entry.mjs'), true);
  assert.equal(isModuleFile('index.mjs'), true);
  assert.equal(isModuleFile('a.js'), false);
  assert.equal(isModuleFile('/abs/x.mjs'), false);
  assert.equal(isModuleFile('A/x.mjs'), false);
  assert.equal(isModuleFile(7), false);
  assert.equal(isRuleTableFile('tables/kernel-constants.json'), true);
  assert.equal(isRuleTableFile('registry.json'), true);
  assert.equal(isRuleTableFile('tables/x.mjs'), false);
  assert.equal(isRuleTableFile('tables/A.json'), false);
});

test('小驼峰代号：首字母小写，其余字母数字下划线，总长 1–48', () => {
  assert.equal(isLowerCamelCode('buildProjectView'), true);
  assert.equal(isLowerCamelCode('a'), true);
  assert.equal(isLowerCamelCode('a' + 'b'.repeat(47)), true);
  assert.equal(isLowerCamelCode('a' + 'b'.repeat(48)), false);
  assert.equal(isLowerCamelCode('Build'), false);
  assert.equal(isLowerCamelCode('a-b'), false);
});

test('错误码文法 E-/W- 两段及以上', () => {
  assert.equal(isErrorCode('E-DIM-ID-FORMAT'), true);
  assert.equal(isErrorCode('W-DIM-GAP'), true);
  assert.equal(isErrorCode('E-X'), false);
  assert.equal(isErrorCode('e-x-y'), false);
  assert.equal(isErrorCode('E-a-b'), false);
});

test('依赖声明的节点名：可声明三类、机器生成两类、并集', () => {
  assert.equal(isDeclarableNode('view:statusView'), true);
  assert.equal(isDeclarableNode('relation:rel_part'), true);
  assert.equal(isDeclarableNode('scope:sc_main'), true);
  assert.equal(isDeclarableNode('dim:item'), false);
  assert.equal(isDeclarableNode('foo:x'), false);
  assert.equal(isGeneratedNode('dim:item'), true);
  assert.equal(isGeneratedNode('modified:person'), true);
  assert.equal(isGeneratedNode('dim:Item'), false);
  assert.equal(isAnyNode('modified:person'), true);
  assert.equal(isAnyNode('view:v'), true);
  assert.equal(isAnyNode('event:e'), false);
});

test('路径模式：点分小驼峰段', () => {
  assert.equal(isPathPattern('created.item.props.basis'), true);
  assert.equal(isPathPattern('due'), true);
  assert.equal(isPathPattern('Created.item'), false);
  assert.equal(isPathPattern('a..b'), false);
  assert.equal(isPathPattern(''), false);
});

test('十进制文本：符号、整数、小数、指数', () => {
  assert.deepEqual([...parseDecimalLiteral('12.5e-3')].slice(1), ['', '12', '5', '-3']);
  assert.deepEqual([...parseDecimalLiteral('-3')].slice(1), ['-', '3', undefined, undefined]);
  assert.deepEqual([...parseDecimalLiteral(0.1)].slice(1), ['', '0', '1', undefined]);
  assert.equal(parseDecimalLiteral('abc'), null);
  assert.equal(parseDecimalLiteral('1.2.3'), null);
});

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

test('64 位小写十六进制摘要', () => {
  assert.equal(isHex64('a'.repeat(64)), true);
  assert.equal(isHex64('a'.repeat(63)), false);
  assert.equal(isHex64('A'.repeat(64)), false);
  assert.equal(isHex64(42), false);
});

test('pathTypes 值文法：list / number / 封闭写法 / sealed', () => {
  assert.equal(listItemType('list<number>'), 'number');
  assert.equal(listItemType('list<struct:byState<number>>'), 'struct:byState<number>');
  assert.equal(listItemType('number'), null);
  assert.deepEqual(parseNumberType('number:kg'), { base: 'number', unit: 'kg' });
  assert.deepEqual(parseNumberType('integer'), { base: 'integer', unit: undefined });
  assert.equal(parseNumberType('ref:x'), null);
  assert.equal(isClosedType('ref:item'), true);
  assert.equal(isClosedType('enum:status_family'), true);
  assert.equal(isClosedType('struct:byState<number>'), true);
  assert.equal(isClosedType('struct:any-thing'), false);
  assert.equal(isClosedType('string'), false);
  assert.equal(mentionsSealed('sealed'), true);
  assert.equal(mentionsSealed('list<sealed>'), true);
  assert.equal(mentionsSealed('ref:sealed'), false);
  assert.equal(mentionsSealed('struct:a>sealed'), false);
  assert.equal(mentionsSealed('list<sealed>'), true);
  assert.equal(mentionsSealed('number'), false);
});

test('required 策略分隔：全角分号分隔多个条件', () => {
  assert.deepEqual(splitRequiredTerms('byDigestible；byClass:comp_edible； anyOf:a,b'), ['byDigestible', 'byClass:comp_edible', 'anyOf:a,b']);
  assert.deepEqual(splitRequiredTerms('always'), ['always']);
  assert.deepEqual(splitRequiredTerms(3), []);
});

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

test('日志键代号形：驼峰转下划线小写', () => {
  assert.equal(snakeCaseKey('reactionDepthMax'), 'reaction_depth_max');
  assert.equal(snakeCaseKey('cadence'), 'cadence');
});
