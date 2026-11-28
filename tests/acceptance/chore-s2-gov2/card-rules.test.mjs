// 规矩清尾（chore/s2-gov2）黑盒验收：tools/accept/card-rules.md 仍可被门禁正常读出，判据不放宽。
// 出题方 haiku-orca-test-gov2，依据卷十二:108（判据通用、门禁是拦）与卷十二:163（提交关口）。
// 对比基准钉在提交 4d56bfab4（git show 4d56bfab4:tools/accept/card-rules.md），不读会移动的 origin/master。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../../accept/temp-root.mjs';
import { loadRules } from '../../../tools/accept/lib/card-archive.mjs';

const CURRENT = readFileSync(join(ROOT, 'tools/accept/card-rules.md'), 'utf8');
const PINNED = execFileSync('git', ['show', '4d56bfab4:tools/accept/card-rules.md'], { cwd: ROOT, encoding: 'utf8' });

// 判据键值行：只数「### 五.2」节内的列表项「- 键：值」（卡档案规矩的判据键值行即该节，见节标题「键值行，每行一条」）。
const kvLines = (text) => {
  const lines = text.split(/\r?\n/);
  const s = lines.findIndex((l) => l.startsWith('### 五.2'));
  if (s < 0) return -1;
  let e = lines.findIndex((l, i) => i > s && l.startsWith('### '));
  if (e < 0) e = lines.length;
  return lines.slice(s + 1, e).filter((l) => /^- [^ ].*[：:]/.test(l)).length;
};

const cur = loadRules(CURRENT);
const old = loadRules(PINNED);

test('card-rules.md 仍被 loadRules 正常读出，无错误（卷十二:163 门禁可解析）', () => {
  assert.equal(cur.error, undefined, `loadRules 报错：${cur.error}`);
  assert.ok(cur.rules && Array.isArray(cur.rules.triggers), '读出的 rules 缺 triggers');
});

test('触发目录条数不少于 4d56bfab4 版（卷十二:108 判据不放宽）', () => {
  assert.ok(old.rules, '4d56bfab4 版读不出，基准无效');
  assert.ok(cur.rules.triggers.length >= old.rules.triggers.length,
    `触发目录 ${cur.rules.triggers.length} < 基准 ${old.rules.triggers.length}`);
});

test('判据键值行数不少于 4d56bfab4 版（卷十二:108 判据不放宽）', () => {
  assert.ok(kvLines(CURRENT) >= kvLines(PINNED),
    `判据键值行 ${kvLines(CURRENT)} < 基准 ${kvLines(PINNED)}`);
});

test('小节表行、证据种类数不少于 4d56bfab4 版（卷十二:163 门禁核查项不减）', () => {
  assert.ok(cur.rules.rows.length >= old.rules.rows.length,
    `小节表行 ${cur.rules.rows.length} < 基准 ${old.rules.rows.length}`);
  assert.ok(Object.keys(cur.rules.kinds).length >= Object.keys(old.rules.kinds).length,
    '证据种类数少于基准');
});
