// 派卡拼接（李白 11-18 19:08）：规矩全文在最前、卡文居中；不再附卡尾（CLAUDE.md 第 1 节严禁回写 docs/卡回报/）。卡文自带不同卡头即拒，自带相同卡头不重复拼两份。
// 题面与期望都从 docs/派活卡头规矩.md 与测试内构造的输入推出，不读仓库当前偶然数字。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { composeCard } from '../../tools/dispatch/compose-card.mjs';
import { ROOT } from './temp-root.mjs';

const DOC = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const HEAD = DOC.replace(/\n+$/, '');
const DELIM = '===== 以下为本卡卡文 =====';
const CARD = '## 目标\n把派卡程序挪进仓库。\n';

test('卡文第一段与规矩文件逐字相同', () => {
  const out = composeCard(DOC, CARD, 'ds/dispatch');
  assert.ok(out.startsWith(DOC));
  assert.equal(out.split(`\n\n${DELIM}\n\n`)[0], HEAD);
  assert.ok(out.includes(CARD.trimEnd()));
});

test('卡文自带不同卡头：拒派', () => {
  const altered = DOC.replace('照卷文写，不自补', '照感觉写，可以自补');
  assert.notEqual(altered, DOC);
  assert.throws(() => composeCard(DOC, altered, 'ds/dispatch'), /卡头与 docs\/派活卡头规矩\.md 不一致，拒派/);
});

test('卡文自带相同卡头：放行，且不重复拼两份', () => {
  const selfContained = `${HEAD}\n\n## 目标\n本卡自带卡头。\n`;
  const out = composeCard(DOC, selfContained, 'ds/dispatch');
  assert.ok(out.startsWith(HEAD));
  assert.equal(out.split('# 派活卡头硬规矩').length - 1, 1);
  assert.ok(out.includes('## 目标\n本卡自带卡头。'));
});

test('规矩为空：拒派', () => {
  assert.throws(() => composeCard('', CARD, 'ds/dispatch'), /规矩为空，拒派/);
  assert.throws(() => composeCard('\n\n', CARD, 'ds/dispatch'), /规矩为空，拒派/);
});

test('不再附卡尾：卡文段不含 docs/卡回报/ 与 E-ACC-CARD-SELFCHECK', () => {
  const out = composeCard(DOC, CARD, 'ds/dispatch');
  const cardBody = out.slice(out.indexOf(DELIM) + DELIM.length);
  assert.ok(!out.includes('===== 卡尾'));
  assert.ok(!out.includes('E-ACC-CARD-SELFCHECK'));
  assert.ok(!cardBody.includes('docs/卡回报/'));
  assert.ok(out.endsWith(CARD.trimEnd()));
});
