// 验收：卡 chore/s2-gov：产品原则只改第 29 行；PLAN.md 瘦身（无超 600 字的行、字符多重集不变）。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：docs/PLAN.md:67（S2-GOV 范围：产品原则第三节第 6 条删除、PLAN 瘦身）；CLAUDE.md:8（北极星是唯一真相源，改动须只限定点）。
// 黑盒：比对基线提交 6413e8a47 的旧文件（git show）与工作区当前文件，不 import 实现模块。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '6413e8a47';
const oldText = (rel) => execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
const nowText = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const splitLines = (t) => t.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

// 依据：docs/PLAN.md:67；测的是什么：产品原则.md 与基线行数相同，且只有第 29 行改动，新第 29 行不再含「DeepSeek 写代码」；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:18
test('产品原则.md 只改第 29 行', () => {
  const a = splitLines(oldText('docs/产品原则.md'));
  const b = splitLines(nowText('docs/产品原则.md'));
  assert.equal(b.length, a.length, '行数变了');
  const diff = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assert.deepStrictEqual(diff, [28], `改动的行号（从 0 起）应只有 28，实际 ${JSON.stringify(diff)}`);
  assert.ok(!b[28].includes('DeepSeek 写代码'), '第 29 行仍含「DeepSeek 写代码」');
});

// 依据：docs/PLAN.md:67；测的是什么：PLAN.md 没有超过 600 字符的行；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:28
test('PLAN.md 没有超过 600 字的行', () => {
  const over = splitLines(nowText('docs/PLAN.md')).map((l, i) => [i + 1, [...l].length]).filter(([, n]) => n > 600);
  assert.deepStrictEqual(over, [], `超长行（行号, 字数）：${JSON.stringify(over)}`);
});

// 依据：docs/PLAN.md:67；测的是什么：PLAN.md 拆行、挪位只改版式，去掉空白、列表符（- *）后字符多重集与基线相同，只允许新增「（后续见待办登记）」指引句；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:34
test('PLAN.md 瘦身不丢字：字符多重集与基线相同（允许新增指引句）', () => {
  const norm = (t) => [...t.replace(/[\s\-*]/g, '')];
  const count = (chars) => chars.reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map());
  const before = count(norm(oldText('docs/PLAN.md')));
  const after = count(norm(nowText('docs/PLAN.md').split('（后续见待办登记）').join('')));
  for (const [c, n] of before) {
    assert.ok((after.get(c) || 0) === n, `字符「${c}」基线 ${n} 次，现 ${after.get(c) || 0} 次`);
  }
  for (const [c, n] of after) {
    assert.equal(n, before.get(c) || 0, `字符「${c}」现 ${n} 次`);
  }
});
