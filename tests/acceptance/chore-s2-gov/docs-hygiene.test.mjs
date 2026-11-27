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
// 本卡最终内容（合入后历史中保留）：一次性对比（改前后比较、删除、新增条目行号）只看这一版，别的卡改动这些文件不影响本卡验收。
const PIN = 'e5cb05269';
const pinText = (rel) => execFileSync('git', ['show', `${PIN}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
const oldText = (rel) => execFileSync('git', ['show', `${BASE}:${rel}`], { cwd: ROOT, encoding: 'utf8' });
const nowText = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const splitLines = (t) => t.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');

// 依据：卷十二:545；补充：docs/PLAN.md:67；测的是什么：产品原则.md 与基线行数相同，且只有第 29 行改动，新第 29 行不再含「DeepSeek 写代码」；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:18
test('产品原则.md 只改第 29 行', () => {
  const a = splitLines(oldText('docs/产品原则.md'));
  const b = splitLines(pinText('docs/产品原则.md'));
  assert.equal(b.length, a.length, '行数变了');
  const diff = a.map((l, i) => (l === b[i] ? -1 : i)).filter((i) => i >= 0);
  assert.deepStrictEqual(diff, [28], `改动的行号（从 0 起）应只有 28，实际 ${JSON.stringify(diff)}`);
  assert.ok(!b[28].includes('DeepSeek 写代码'), '第 29 行仍含「DeepSeek 写代码」');
});

// 依据：卷十二:545；补充：docs/PLAN.md:67；测的是什么：PLAN.md 没有超过 600 字符的行；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:28
test('PLAN.md 没有超过 600 字的行', () => {
  const over = splitLines(nowText('docs/PLAN.md')).map((l, i) => [i + 1, [...l].length]).filter(([, n]) => n > 600);
  assert.deepStrictEqual(over, [], `超长行（行号, 字数）：${JSON.stringify(over)}`);
});

// 依据：卷十二:545；补充：docs/PLAN.md:67；测的是什么：PLAN.md 拆行、挪位只改版式，去掉空白、列表符（- *）后字符多重集与基线相同，只允许新增「（后续见待办登记）」指引句；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:34
test('PLAN.md 瘦身不丢字：字符多重集与基线相同（允许新增指引句）', () => {
  const norm = (t) => [...t.replace(/[\s\-*]/g, '')];
  const count = (chars) => chars.reduce((m, c) => m.set(c, (m.get(c) || 0) + 1), new Map());
  const before = count(norm(oldText('docs/PLAN.md')));
  // 设计稿 Q7 甲：问题.md 仍有效两条挪进 PLAN 待办；Q9 甲：规矩读取过渡退路登记待办。两者都是本卡规定的新增待办，不算丢字，只精确放行这两行。
  const NEW_PENDING_PREFIXES = ['- docs/问题.md 11-24 起停更', '- 规矩读取过渡退路', '- [x] S2-T1b 地区节律'];
  const kept = pinText('docs/PLAN.md').split('\n').filter((l) => !NEW_PENDING_PREFIXES.some((p) => l.startsWith(p))).join('\n');
  const after = count(norm(kept.split('（后续见待办登记）').join('')));
  for (const [c, n] of before) {
    assert.ok((after.get(c) || 0) === n, `字符「${c}」基线 ${n} 次，现 ${after.get(c) || 0} 次`);
  }
  for (const [c, n] of after) {
    assert.equal(n, before.get(c) || 0, `字符「${c}」现 ${n} 次`);
  }
});

// 依据：卷十二:545（E-ACC-CARD-ARCHIVE 档案与门禁总条）；补充：docs/PLAN.md:67；测的是什么：Q7 甲指引行存在，且含 docs/问题.md:4 与 docs/问题.md:25 两个指引；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:51
test('PLAN.md 待办含问题.md 两条指引（设计稿 Q7 甲）', () => {
  const line = pinText('docs/PLAN.md').split('\n').find((l) => l.startsWith('- docs/问题.md 11-24 起停更'));
  assert.ok(line, '缺 Q7 指引行');
  assert.ok(line.includes('docs/问题.md:4') && line.includes('docs/问题.md:25'), 'Q7 指引行缺两个 docs/问题.md 指引');
});

// 依据：卷十二:545（E-ACC-CARD-ARCHIVE 档案与门禁总条）；补充：docs/PLAN.md:67；测的是什么：Q9 甲指引行存在，且含 readRulesAt 与 S2-SW；测试位置：tests/acceptance/chore-s2-gov/docs-hygiene.test.mjs:58
test('PLAN.md 待办含规矩读取退路指引（设计稿 Q9 甲）', () => {
  const line = pinText('docs/PLAN.md').split('\n').find((l) => l.startsWith('- 规矩读取过渡退路'));
  assert.ok(line, '缺 Q9 指引行');
  assert.ok(line.includes('readRulesAt') && line.includes('S2-SW'), 'Q9 指引行缺 readRulesAt 或 S2-SW');
});
