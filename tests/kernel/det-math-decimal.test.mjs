// det-math 十进制文法（卷二 §3.3 定点算术；原 handles/patterns.mjs 的 DECIMAL_LITERAL）：期望值写成字面量，不用被测函数算。
// 原正则 /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i（8823dc54^:server-plugin/kernel/det-math.mjs:37）改为手写逐字符解析，行为逐条等价。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDecimalLiteral } from '../../server-plugin/kernel/det-math.mjs';

const groups = (x) => {
  const m = parseDecimalLiteral(x);
  return m ? [...m].slice(1) : null;
};

test('十进制文本：原正则接受的形式全部接受，分组同形', () => {
  assert.deepEqual(groups('12.5e-3'), ['', '12', '5', '-3']);
  assert.deepEqual(groups('-3'), ['-', '3', undefined, undefined]);
  assert.deepEqual(groups(0.1), ['', '0', '1', undefined]);
  assert.deepEqual(groups('0'), ['', '0', undefined, undefined]);
  assert.deepEqual(groups('007'), ['', '007', undefined, undefined]);
  assert.deepEqual(groups('1.0'), ['', '1', '0', undefined]);
  assert.deepEqual(groups('1E3'), ['', '1', undefined, '3']);
  assert.deepEqual(groups('1e+10'), ['', '1', undefined, '+10']);
  assert.deepEqual(groups('-0.5E-07'), ['-', '0', '5', '-07']);
  assert.deepEqual(groups('123456789012345678901234567890'), ['', '123456789012345678901234567890', undefined, undefined]);
});

test('十进制文本：指数的 e/E 不分大小写（原正则 i 标志），数字输入先转文本', () => {
  assert.deepEqual(groups('2e2'), ['', '2', undefined, '2']);
  assert.deepEqual(groups(1e21), ['', '1', undefined, '+21']);
  assert.deepEqual(groups(1e-7), ['', '1', undefined, '-7']);
});

test('十进制文本：原正则拒绝的形式全部拒绝', () => {
  for (const bad of ['', '-', '+', '+1', '-+1', '--1', '.', '.5', '-.5', '1.', '1..2', '1.2.3', '1e', '1E', '1e+', '1e-', 'e5', '1e5.0', '1e5e5', '1e+-5', '1 2', ' 1', '1 ', '1\t', '1\n', 'abc', '0x10', '1_000', '1,0', 'NaN', 'Infinity', '١٢', '１２']) {
    assert.equal(parseDecimalLiteral(bad), null, JSON.stringify(bad));
  }
});

test('十进制文本：超长整数位与小数位照收，不截断解析本身', () => {
  const whole = '9'.repeat(500);
  const m = parseDecimalLiteral(whole);
  assert.equal(m[0], whole);
  assert.equal(m[2], whole);
  const frac = `${whole}.${'3'.repeat(500)}e-500`;
  const f = parseDecimalLiteral(frac);
  assert.equal(f[3], '3'.repeat(500));
  assert.equal(f[4], '-500');
});
