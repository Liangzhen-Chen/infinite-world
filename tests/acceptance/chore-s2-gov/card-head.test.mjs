// 验收：卡 chore/s2-gov（S2-GOV 规矩一致性清理）：派活卡头压回 ≤50 行、第四节派卡须知、合并提交不免查。出题方：Claude Haiku 5.5（Orca 会员会话），标识 haiku-orca-test-gov；未参与写码与审卡。
// 依据：CLAUDE.md:8（规矩只两处，派活卡头规矩 ≤50 行）；CLAUDE.md:28（取消合并提交免查）；CLAUDE.md:17（模型分工与选档，§3）；docs/PLAN.md:67（S2-GOV 范围）。
// 黑盒：只读工作区磁盘文件与基线提交 6413e8a47（git show），不 import 实现模块。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BASE = '6413e8a47';
const HEAD_DOC = 'docs/派活卡头规矩.md';
const RULES_DOC = 'tools/accept/card-rules.md';
const lines = (text) => text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const sectionFour = (text) => {
  const all = lines(text);
  const start = all.findIndex((l) => l.startsWith('## 四、'));
  assert.ok(start >= 0, '派活卡头规矩.md 缺「## 四、」节');
  const next = all.findIndex((l, i) => i > start && l.startsWith('## '));
  return all.slice(start, next < 0 ? all.length : next).join('\n');
};

// 依据：CLAUDE.md:8；测的是什么：派活卡头规矩.md 不超过 50 行、首行标题字样不变、不再含第五节、含一至四节；测试位置：tests/acceptance/chore-s2-gov/card-head.test.mjs:26
test('派活卡头规矩压回 ≤50 行，首行标题不变，不含第五节，含一至四节', () => {
  const text = read(HEAD_DOC);
  assert.ok(lines(text).length <= 50, `行数 ${lines(text).length} 超过 50`);
  assert.ok(lines(text)[0].startsWith('# 派活卡头硬规矩（'), '首行标题字样变了');
  assert.ok(!text.includes('## 五、'), '派活卡头规矩.md 仍含「## 五、」');
  for (const h of ['## 一、', '## 二、', '## 三、', '## 四、']) assert.ok(text.includes(h), `缺 ${h}`);
});

// 依据：CLAUDE.md:8；测的是什么：第四节「派卡须知」五条都在文件里（自验脚本、merge-base 前置核对、node 等价、deepseek-flash、分片登记）；测试位置：tests/acceptance/chore-s2-gov/card-head.test.mjs:35
test('第四节派卡须知五条齐全', () => {
  const four = sectionFour(read(HEAD_DOC));
  for (const k of ['check-push-archive.mjs', 'merge-base --is-ancestor', '等价', 'deepseek-flash', '分片']) {
    assert.ok(four.includes(k), `第四节缺「${k}」`);
  }
});

// 依据：CLAUDE.md:28；测的是什么：两份规矩文件都不再说合并提交免查为「是」或 MERGE_HEAD 免查，机读键为「否」；测试位置：tests/acceptance/chore-s2-gov/card-head.test.mjs:43
test('合并提交不免查：两份规矩文件无免查说法，机读值为否', () => {
  for (const rel of [HEAD_DOC, RULES_DOC]) {
    const text = read(rel);
    for (const l of lines(text)) {
      assert.ok(!/合并提交免查\s*[：:]\s*是/.test(l), `${rel} 仍写「合并提交免查：是」：${l}`);
      assert.ok(!/MERGE_HEAD\s*免查/.test(l), `${rel} 仍写 MERGE_HEAD 免查：${l}`);
    }
  }
  assert.ok(lines(read(RULES_DOC)).some((l) => l.trim() === '- 合并提交免查：否'), `${RULES_DOC} 缺机读行「- 合并提交免查：否」`);
});

// 依据：CLAUDE.md:28；测的是什么：基线提交里的旧规矩也确有「合并提交免查：否」机读行（说明未被偷换）；测试位置：tests/acceptance/chore-s2-gov/card-head.test.mjs:55
test('基线提交的机读键同为「否」（比对前提）', () => {
  const old = execFileSync('git', ['show', `${BASE}:${HEAD_DOC}`], { cwd: ROOT, encoding: 'utf8' });
  assert.ok(lines(old).some((l) => l.trim() === '- 合并提交免查：否'));
});
