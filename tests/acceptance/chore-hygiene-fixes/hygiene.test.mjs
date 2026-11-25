// 验收：卡 chore/hygiene-fixes（断链行号与被管文档缺失）。出题方：Claude Haiku 5.5（API），标识 haiku-api-test-hyg；未参与写码与审卡。
// 依据：docs/gemini/kickoff-1125.md:479（L-08 扩项：md 相对链接、CLAUDE.md 行数上限）；主会话设计约定 1（断链行号即原文件真实行号）、2（被管文档缺失报 E-ACC-ITEM-PARAM）。
// 测什么：
//   A1 断链行号：docs/ 下新建临时 .md，前 6 行是代码围栏块，第 9 行是指向不存在文件的相对链接（另在围栏内、行内代码内各放一个假链接，应不报）。
//     在真实工作区跑 pre_commit 关口，取命中明细，断言那条断链的 line 为 9。
//     CLI 标准输出只有失败条目的 (itemKey, codes)，不含行号；行号在 accRun 返回的 rows 里。本测试直接调 run.mjs 的 accRun（CLI 同一函数），不改基线（write 为假）。
//   A2 被管文档缺失：照 scanclasses.json 里 mode 为 docLimits 的类别行，追加一条不存在路径的 files 条目，
//     用仓库真实 ctx（read.mjs loadContext）直接调 hygiene.mjs 的 detect，断言结果含 E-ACC-ITEM-PARAM。
//     对照组：不加该条目时结果不含 E-ACC-ITEM-PARAM（真实登记不应被判为参数错）。
// 预期：实现前 A1 红（行号偏移，实得 9 以外的值）、A2 红（缺失路径被静默跳过）；对照组绿。
// 耗时：A1 一次 pre_commit 约 2 分钟；A2 只读文件，秒级。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { accRun } from '../../../tools/accept/run.mjs';
import { loadContext } from '../../../tools/accept/read.mjs';
import { detect } from '../../../tools/accept/detectors/hygiene.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CASE_TIMEOUT_MS = 900000; // 单条上限（含一次 pre_commit，约 2 分钟，留足余量）

const PROBE = 'docs/zz-hyg-probe.md';
const PROBE_TARGET = 'zz-hyg-missing-target.md';
const PROBE_LINK_LINE = 9;
// 第 1–6 行为围栏块（其中第 3 行含围栏内假链接）；第 8 行行内代码含假链接；第 9 行为真断链。
const PROBE_TEXT = [
  '```text',
  '围栏内第 2 行',
  '围栏内第 3 行 [围栏假链接](zz-hyg-fence-only.md)',
  '围栏内第 4 行',
  '围栏内第 5 行',
  '```',
  '',
  '行内代码 `[行内假链接](zz-hyg-span-only.md)` 不算断链。',
  `[探针断链](${PROBE_TARGET})`,
  '',
].join('\n');

// ---------- A1：断链行号 ----------

test('A1 断链行号：docs/ 下 .md 的断链经 md_links 报出的行号等于原文件真实行号（围栏块不偏移行号）', { timeout: CASE_TIMEOUT_MS }, async () => {
  const abs = join(ROOT, PROBE);
  assert.ok(!existsSync(abs), `注入位置已存在，拒绝覆盖：${PROBE}`);
  let rows;
  try {
    writeFileSync(abs, PROBE_TEXT, 'utf8');
    ({ rows } = await accRun('pre_commit', '', null, { root: ROOT, write: false, runRequired: true }));
  } finally {
    rmSync(abs, { force: true });
  }
  assert.ok(Array.isArray(rows), 'pre_commit 须返回命中明细 rows');
  const mine = rows.filter((r) => r.file === PROBE && r.symbolPath === PROBE_TARGET);
  assert.equal(mine.length, 1, `应恰有一条指向 ${PROBE_TARGET} 的断链命中，实得 ${JSON.stringify(mine)}`);
  assert.equal(mine[0].line, PROBE_LINK_LINE, `断链真实行号为 ${PROBE_LINK_LINE}，实得 ${mine[0].line}`);
});

// ---------- A2：被管文档缺失 ----------

const docLimitsClass = () => {
  const cls = JSON.parse(readFileSync(join(ROOT, 'tools/accept/scanclasses.json'), 'utf8')).rows.find((r) => r.mode === 'docLimits');
  assert.ok(cls, 'scanclasses.json 应含 mode 为 docLimits 的类别行');
  assert.ok(Array.isArray(cls.files) && cls.files.length > 0, 'docLimits 类别须登记 files');
  return cls;
};

test('A2 被管文档缺失：docLimits 登记的文件在仓库中不存在，须报 E-ACC-ITEM-PARAM，不静默放过', () => {
  const cls = docLimitsClass();
  const ctx = loadContext(ROOT);
  const ghost = { path: 'docs/zz-hyg-no-such-doc.md', maxLines: 100 };
  assert.ok(!existsSync(join(ROOT, ghost.path)), '夹具路径本不应存在');

  // 对照组：真实登记不报参数错
  const control = detect(ctx, { code: 'E-ACC-DOC-LIMIT' }, cls);
  assert.ok(!control.some((h) => h.code === 'E-ACC-ITEM-PARAM'), `对照组（真实登记）不应报 E-ACC-ITEM-PARAM，实得 ${JSON.stringify(control)}`);

  // 注入：加一条不存在的被管文档
  const withGhost = detect(ctx, { code: 'E-ACC-DOC-LIMIT' }, { ...cls, files: [...cls.files, ghost] });
  assert.ok(
    withGhost.some((h) => h.code === 'E-ACC-ITEM-PARAM'),
    `被管文档 ${ghost.path} 不存在，应报 E-ACC-ITEM-PARAM，实得 ${JSON.stringify(withGhost)}`,
  );
});
