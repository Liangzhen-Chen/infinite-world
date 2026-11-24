// 工作区整理验收测试（出题方：Claude Haiku 5.5，标识 haiku-api-test-cleanup）
// 运行：node --test tests/acceptance/chore-workspace-cleanup/cleanup.test.mjs
//
// 依据（docs/gemini/rewrite-guide-1124.md 行号）：
//   Step 3 归档：:232–:241（docs/ 顶层只剩 PLAN.md、产品原则.md、问题.md、派活卡头规矩.md，可有 状态快照.generated.md；
//                当前状态.md 与 卡回报 归档）
//   Step 4 删除：:249–:258（删除路径清单）；留底标签 pre-rewrite-1124 为亮圳【重写令1124】约定
//   CLAUDE.md：:379、:392–:425（唯一现行规矩，逐行同 4.1 拟替换全文，≤80 行，禁词）
//   AGENTS.md：:172（≤25 行，含 @CLAUDE.md）
//   现行有效裁定：:221（docs/审查/现行有效裁定.json）
//   旧验收目录归档：:132（12 个旧卡目录搬到 archive/legacy-tests/acceptance/）
//
// 第 1 条裁定（主会话，亮圳删除令下"有真实读取的不删"）：world/design 只保留
//   world/design/opening-polity-hw.json（被 tests/kernel/world-create-rules.test.mjs:25 等 4 处真实读取），
//   其余 world/design 文件删除；故 world/design 不再整目录检查不存在，改为 git ls-files 只列出该一个文件。
//
// 测什么：
//   1 删除路径不存在（world/design 例外，见上）；2 留底标签 pre-rewrite-1124 指向 ae71f231e839142703eba0cf631e1230646ce68e（对照用，修前修后都应绿）；
//   3 归档文件到位，docs/当前状态.md 与 docs/卡回报 不存在；4 docs/ 顶层文件只在允许清单内且四份必备都在；
//   5 CLAUDE.md 与指南 392–425 逐行相同、≤80 行、不含禁词；6 AGENTS.md ≤25 行且含 @CLAUDE.md；
//   7 docs/审查/现行有效裁定.json 可解析，rulings 非空数组，每条有 id、summary、source、status。
//
// 修前为何失败：1 删除路径仍在；3 归档文件未到、旧文件仍在；4 docs/ 顶层文件过多；5 CLAUDE.md 超长且含旧叠层；
//   6 AGENTS.md 仍 65 行；7 现行有效裁定 JSON 尚无。2 修前即存在，故绿。
//
// 指南自相矛盾（已按亮圳逐字替换令取 :399）：指南 :379 禁词表含"取代下条"等叠层字样，
//   而 :399 位于 :392–:425 内，含文字 docs/卡回报/（作禁止回写路径列举）。
//   第 5 条改为：docs/卡回报/ 只许出现在含"严禁往"的那一行（即只作禁止列举）；其余禁词照旧。
//   矛盾已报 Gemini 复审。
//
// 只用 node:test、node:assert、node:fs、node:path、node:child_process（execFileSync 调 git），
// 另用 node:url 的 fileURLToPath 把 import.meta.url 转成路径（仓库根 = 本文件目录往上三级）。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function p(rel) {
  return path.join(ROOT, ...rel.split('/'));
}

function readText(rel) {
  return fs.readFileSync(p(rel), 'utf8').replace(/\r\n/g, '\n');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function tagCommit(tag) {
  try {
    return git(['rev-parse', '--verify', '--quiet', `refs/tags/${tag}^{commit}`]);
  } catch {
    return null;
  }
}

test('1 删除路径已不存在（指南 :249–:258）', () => {
  const deleted = [
    'docs/统一底层设计/版本快照',
    'world/drafts',
    'docs/probes',
    'logs',
    'docs/actions.json',
    'docs/system-map.json',
    'world/ontology/verbs.json',
    'world/ontology/holdings.json',
  ];
  const still = deleted.filter((rel) => fs.existsSync(p(rel)));
  assert.deepEqual(still, [], `仍存在的待删路径：${still.join(', ')}`);

  // world/design：只许剩 opening-polity-hw.json 这一个被真实读取的文件（主会话裁定）
  const designTracked = git(['ls-files', 'world/design']).split('\n').filter(Boolean);
  assert.deepEqual(
    designTracked,
    ['world/design/opening-polity-hw.json'],
    `world/design 应只剩 opening-polity-hw.json，实际：${designTracked.join(', ')}`,
  );
});

test('2 留底标签 pre-rewrite-1124 指向 ae71f231e839142703eba0cf631e1230646ce68e（对照，修前修后都应绿）', () => {
  const sha = tagCommit('pre-rewrite-1124');
  assert.equal(sha, 'ae71f231e839142703eba0cf631e1230646ce68e');
});

test('3 归档到位，docs/当前状态.md 与 docs/卡回报 不存在（指南 :232–:241）', () => {
  const archived = [
    'archive/docs-reviews/李白裁定-1117.md',
    'archive/docs-status/当前状态-至1124.md',
    'archive/legacy-ontology/迁移对照.md',
  ];
  const missing = archived.filter((rel) => !fs.existsSync(p(rel)));
  assert.deepEqual(missing, [], `归档缺失：${missing.join(', ')}`);
  assert.equal(fs.existsSync(p('docs/当前状态.md')), false, 'docs/当前状态.md 仍存在');
  assert.equal(fs.existsSync(p('docs/卡回报')), false, 'docs/卡回报 仍存在');
});

test('4 docs/ 顶层文件只剩允许清单（指南 :240–:241）', () => {
  const allowed = new Set([
    'PLAN.md',
    '产品原则.md',
    '问题.md',
    '派活卡头规矩.md',
    '状态快照.generated.md',
  ]);
  const required = ['PLAN.md', '产品原则.md', '问题.md', '派活卡头规矩.md'];
  const topFiles = fs
    .readdirSync(p('docs'), { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
  const extra = topFiles.filter((name) => !allowed.has(name));
  assert.deepEqual(extra, [], `docs/ 顶层多出的文件：${extra.join(', ')}`);
  const missing = required.filter((name) => !topFiles.includes(name));
  assert.deepEqual(missing, [], `docs/ 顶层缺失的必备文件：${missing.join(', ')}`);
});

test('5 CLAUDE.md 与指南 :392–:425 逐行相同、≤80 行、不含禁词（指南 :379、:394）', () => {
  const guideLines = readText('docs/gemini/rewrite-guide-1124.md').split('\n');
  const block = guideLines.slice(391, 425).join('\n');
  assert.equal(guideLines[391], '@AGENTS.md', '指南行号漂移：:392 应为 @AGENTS.md');
  assert.equal(guideLines[424].startsWith('- **通知'), true, '指南行号漂移：:425 应为通知条');

  const claude = readText('CLAUDE.md').replace(/\n+$/, '');
  assert.equal(claude, block, 'CLAUDE.md 与指南 :392–:425 不逐行相同');

  const lineCount = claude.split('\n').length;
  assert.ok(lineCount <= 80, `CLAUDE.md 共 ${lineCount} 行，超过 80`);

  const forbidden = ['已过期', '取代下条', 'E-ACC-CARD-SELFCHECK', 'F:/dnd-'];
  const hits = forbidden.filter((word) => claude.includes(word));
  assert.deepEqual(hits, [], `CLAUDE.md 含禁词：${hits.join(', ')}`);

  // docs/卡回报/ 只许作禁止列举：出现的每一行都须含"严禁往"
  const archiveHits = claude
    .split('\n')
    .filter((line) => line.includes('docs/卡回报/') && !line.includes('严禁往'));
  assert.deepEqual(archiveHits, [], `docs/卡回报/ 出现在非禁止列举的行：${archiveHits.join(' | ')}`);
});

test('6 AGENTS.md ≤25 行且含 @CLAUDE.md（指南 :172）', () => {
  const agents = readText('AGENTS.md').replace(/\n+$/, '');
  const lineCount = agents.split('\n').length;
  assert.ok(lineCount <= 25, `AGENTS.md 共 ${lineCount} 行，超过 25`);
  assert.ok(agents.includes('@CLAUDE.md'), 'AGENTS.md 不含 @CLAUDE.md');
});

test('7 现行有效裁定 JSON 可解析、rulings 非空、每条有 id/summary/source/status（指南 :221）', () => {
  const data = JSON.parse(readText('docs/审查/现行有效裁定.json'));
  assert.ok(Array.isArray(data.rulings), 'rulings 不是数组');
  assert.ok(data.rulings.length > 0, 'rulings 为空');
  const keys = ['id', 'summary', 'source', 'status'];
  data.rulings.forEach((r, i) => {
    for (const k of keys) {
      assert.ok(r[k] !== undefined && r[k] !== null && r[k] !== '', `rulings[${i}] 缺 ${k}`);
    }
  });
});
