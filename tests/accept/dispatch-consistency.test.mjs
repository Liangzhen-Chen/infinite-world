// 派卡配置与 CLAUDE.md 的一致性（L-06/L-08；派卡红线第 3 节）：CLAUDE.md 说的模型与预算必须与真正派卡用的数据表一致，
// 防止文档与 dispatch-config.json / budget-check.mjs 各走一套。期望值取自 CLAUDE.md 原文，不抄仓库当前偶然读数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MODELS } from '../../tools/dispatch/dispatch.mjs';
import { MAX_BUDGET_USD } from '../../tools/dispatch/budget-check.mjs';

const CLAUDE = readFileSync(fileURLToPath(new URL('../../CLAUDE.md', import.meta.url)), 'utf8');
const CLAUDE_LINES = (() => {
  const lines = CLAUDE.replace(/\r\n/g, '\n').split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
})();

test('CLAUDE.md 第 3 节提到的四个模型都在 dispatch-config.json 的 models 里', () => {
  for (const name of ['deepseek-flash', 'claude-haiku', 'claude-sonnet', 'claude-opus']) {
    assert.ok(MODELS.some((m) => m.includes(name)), `models 里没有含「${name}」的模型：${MODELS.join('、')}`);
  }
});

test('models 里没有禁用模型 deepseek-v4-pro', () => {
  assert.ok(!MODELS.some((m) => /v4-pro/i.test(m)), `models 不该有 v4-pro：${MODELS.join('、')}`);
});

test('CLAUDE.md 写的 --max-budget-usd 与 budget-check.mjs 的唯一上限相等', () => {
  const m = /--max-budget-usd\s+([0-9]+(?:\.[0-9]+)?)/.exec(CLAUDE);
  assert.ok(m, 'CLAUDE.md 没写 --max-budget-usd');
  assert.equal(Number(m[1]), MAX_BUDGET_USD);
});

test('CLAUDE.md 不超过 80 行（规矩 <=80 行）', () => {
  assert.ok(CLAUDE_LINES.length <= 80, `CLAUDE.md 有 ${CLAUDE_LINES.length} 行`);
});

test('CLAUDE.md 不含叠层过时标记', () => {
  for (const word of ['已过期', '取代下条']) assert.ok(!CLAUDE.includes(word), `CLAUDE.md 不该含「${word}」`);
});
