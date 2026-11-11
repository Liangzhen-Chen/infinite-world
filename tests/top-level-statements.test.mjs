// tools/top-level-statements.mjs（顶层语句切分器）的单元测试：模板嵌套、注释里的花括号、正则字面量，
// 以及 =>、return、typeof 等之后出现的正则（里面带引号或不配平括号时，不能把后面的语句吞掉）。
import test from 'node:test';
import assert from 'node:assert/strict';
import {topLevelStatements} from '../tools/top-level-statements.mjs';

const split = src => topLevelStatements(src).map(s => s.text.trim());

test('普通多条顶层语句，函数体内的花括号不拆分', () => {
  const r = split('const a = 1;\nfunction f() {\n  if (x) { y(); }\n}\nconst b = 2;\n');
  assert.equal(r.length, 3);
  assert.match(r[1], /^function f/);
});

test('注释里的花括号和引号不影响深度，注释文本不进语句', () => {
  const r = split('// } 不配平 {\nconst a = 1; /* { ( [ " */\n/* } */\nconst b = {\n  k: 1, // }\n};\nconst c = 3;\n');
  assert.equal(r.length, 3);
  assert.ok(!r.some(t => t.includes('不配平')));
  assert.match(r[1], /k: 1/);
});

test('模板字符串：嵌套模板与 ${} 里的花括号', () => {
  const r = split("const a = `x ${ok ? `y ${z}` : ''} }`;\nconst b = `{${1}`;\nconst c = 3;\n");
  assert.equal(r.length, 3);
  assert.match(r[2], /^const c/);
});

test('字符串里的 // 和花括号不当注释、不计深度', () => {
  const r = split("const u = 'http://x/{';\nconst v = \"}\";\nconst w = 1;\n");
  assert.equal(r.length, 3);
});

test('正则字面量：含引号、括号、花括号，也含字符类里的斜杠', () => {
  const r = split("const a = /['\"]/.test(s);\nconst b = /\{/g;\nconst c = /[/}]/;\nconst d = 4;\n");
  assert.equal(r.length, 4);
  assert.match(r[3], /^const d/);
});

test('=> 之后的正则（带引号与不配平括号）', () => {
  const r = split("const f = s => /['\"]/.test(s);\nconst g = s => /\(/.test(s);\nconst h = s => /\{/.test(s);\nconst k = 5;\n");
  assert.equal(r.length, 4);
  assert.match(r[3], /^const k/);
});

test('return、typeof、case、in、of 等关键字之后的正则', () => {
  for (const kw of ['return', 'typeof', 'case', 'yield', 'void', 'throw', 'delete', 'else']) {
    const r = split(`function f(s) {\n  ${kw} /['"{(]/;\n}\nconst after = 1;\n`);
    assert.equal(r.length, 2, `${kw} 之后的正则被当成除号`);
    assert.match(r[1], /^const after/, kw);
  }
});

test('除号不当正则：标识符、右括号、数字之后的 /', () => {
  const r = split("const a = (x + 1) / 2 / 3;\nconst b = x / y; const c = '}';\nconst d = 4;\n");
  assert.equal(r.length, 3);
  assert.match(r[2], /^const d/);
});

test('if 头与 else 的下一行并入同一条；缩进行不开新语句', () => {
  const r = split("if (a)\n  run();\nelse\n  stop();\nconst z = 1;\n");
  assert.equal(r.length, 2);
  assert.match(r[0], /stop/);
});

test('起始行号从 1 起', () => {
  const r = topLevelStatements('\n\nconst a = 1;\n// c\nconst b = 2;\n');
  assert.deepEqual(r.map(s => s.line), [3, 5]);
});
