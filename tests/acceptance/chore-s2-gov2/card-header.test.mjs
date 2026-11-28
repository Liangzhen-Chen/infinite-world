// 规矩清尾（chore/s2-gov2）黑盒验收：卡头、CLAUDE.md 的文本一致性。
// 出题方 haiku-orca-test-gov2，依据卷十二:108（门禁是拦不是报，判据不放宽）与卷十二:163（提交关口 pre_commit）。
// 只读文件文本断言；不新装依赖；不抄当前行号与条数（上限取规矩本身的数字）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from '../../accept/temp-root.mjs';

const HEADER = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const CLAUDE = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
const lines = (text) => text.split(/\r?\n/);

// 含 check-push-archive.mjs 的行即自检命令行；断言再逐一看它带的参数。
const checkLines = (text) => lines(text).filter((l) => /check-push-archive\.mjs/.test(l));

test('卡头不超过 50 行（卷十二:163 提交关口；派活卡头规矩 <=50 行）', () => {
  assert.ok(lines(HEADER.replace(/\n$/, '')).length <= 50, `派活卡头规矩.md 行数超过 50`);
});

test('卡头自检命令是提交前核盘写法：写码自检带 --only 开发.md 或 反思.md（卷十二:163）', () => {
  const hit = checkLines(HEADER).some((l) => /--only\s+(开发|反思)\.md/.test(l) && /--stage\s+提交/.test(l));
  assert.ok(hit, '派活卡头规矩.md 里没有「--stage 提交 --only 开发.md|反思.md」的自检命令行');
});

test('卡头自检命令含出题 --only 出题.md（卷十二:163）', () => {
  const hit = checkLines(HEADER).some((l) => /--only\s+出题\.md/.test(l));
  assert.ok(hit, '派活卡头规矩.md 里没有「--only 出题.md」的自检命令行');
});

test('卡头审卡自检含 --stage 推送 --only 审查.md（卷十二:108 拦不是报）', () => {
  const hit = checkLines(HEADER).some((l) => /--stage\s+推送\s+--only\s+审查\.md/.test(l));
  assert.ok(hit, '派活卡头规矩.md 里没有「--stage 推送 --only 审查.md」的自检命令行');
});

test('CLAUDE.md 不超过 80 行（CLAUDE.md 标题写明 <=80 行）', () => {
  assert.ok(lines(CLAUDE.replace(/\n$/, '')).length <= 80, 'CLAUDE.md 行数超过 80');
});

test('CLAUDE.md 与卡头都写了登记分片目录 state-owners.d/ 与 entry-registry.d/（卷十二:108）', () => {
  for (const [name, text] of [['CLAUDE.md', CLAUDE], ['派活卡头规矩.md', HEADER]]) {
    assert.ok(text.includes('state-owners.d/'), `${name} 缺 state-owners.d/`);
    assert.ok(text.includes('entry-registry.d/'), `${name} 缺 entry-registry.d/`);
  }
});

test('CLAUDE.md 删文件闸门与 K1126-WTDEL 一致：提到已合卡工作树目录可删并引裁定号（卷十二:108）', () => {
  const gate = lines(CLAUDE).filter((l) => l.includes('删文件'));
  assert.equal(gate.length >= 1, true, 'CLAUDE.md 没有「删文件」闸门条');
  const row = gate.join('\n');
  assert.ok(row.includes('K1126-WTDEL'), '删文件闸门条没引 K1126-WTDEL');
  assert.ok(/工作树/.test(row), '删文件闸门条没提工作树目录');
  assert.ok(/合入|已合/.test(row), '删文件闸门条没写已合卡这一前提');
  assert.ok(/亮圳/.test(row), '删文件闸门条丢了其他删除须亮圳同意');
});
