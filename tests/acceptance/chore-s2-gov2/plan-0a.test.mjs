// 规矩清尾（chore/s2-gov2）黑盒验收：docs/PLAN.md 阶段 0A 落地清单无未勾选的已完成项。
// 出题方 haiku-orca-test-gov2，依据卷十二:108（门禁是拦不是报：清单与现实不符即命中）与卷十二:163。
// 区段边界取自文件结构（「阶段 0A 落地清单」行 至 下一个「阶段 0B」顶层项），不抄行号。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from '../../accept/temp-root.mjs';

const PLAN = readFileSync(join(ROOT, 'docs/PLAN.md'), 'utf8').split(/\r?\n/);

function section0A() {
  const start = PLAN.findIndex((l) => l.includes('阶段 0A 落地清单'));
  assert.ok(start >= 0, 'PLAN.md 找不到「阶段 0A 落地清单」');
  let end = PLAN.findIndex((l, i) => i > start && (/^- 阶段 0B/.test(l) || /^## /.test(l)));
  if (end < 0) end = PLAN.length;
  return PLAN.slice(start, end).map((text, i) => ({ text, line: start + i + 1 }));
}

// 「已完成」类措辞：未勾选的条目若写了这些，即是「已完成却没勾」。
const DONE_WORDS = /已合入|已合并|已完成|已落地|已修|已建|已装|已删|已归档|已停|已接|已开|已冻结|已写入|已收编|已豁免/;

test('阶段 0A 落地清单中没有未勾选却写着已完成的条目（卷十二:108）', () => {
  const bad = section0A().filter(({ text }) => /^\s*- \[ \]/.test(text) && DONE_WORDS.test(text));
  assert.deepEqual(
    bad.map((b) => `PLAN.md:${b.line}`),
    [],
    '以下未勾选条目写着已完成措辞，应勾选并写一句结果，或改写为真实未完成项',
  );
});

test('阶段 0A 落地清单的已勾选项仍保留勾选记号（卷十二:163，勾选不能被误删）', () => {
  const checked = section0A().filter(({ text }) => /^\s*- \[x\]/.test(text));
  assert.ok(checked.length >= 1, '阶段 0A 清单里一个 [x] 都没有，勾选记号疑似被误删');
});
