// 状态快照生成器单测（docs/gemini/kickoff-1125.md:485）：纯函数五段、行数上限、缺件标记、卡排序与 _template 跳过、--check 只比受检段。
// 期望值都在用例里造好前提后按设计手算，不抄仓库当前计数。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { testTempRoot, writeUnderTempRoot, removeTempRoot } from './temp-root.mjs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderSnapshot, readMergedCards } from '../../tools/gen-status-snapshot.mjs';

const SCRIPT = fileURLToPath(new URL('../../tools/gen-status-snapshot.mjs', import.meta.url));
const SNAPSHOT_REL = join('docs', '状态快照.generated.md');

function lineCount(text) {
  const lines = text.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

function sectionOf(text, heading) {
  const lines = text.split('\n');
  const start = lines.indexOf(heading);
  assert.notEqual(start, -1, `缺少段 ${heading}`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith('## ')) end += 1;
  return lines.slice(start + 1, end).filter((line) => line !== '');
}

function card(cardName, phase, failCount, nextAction) {
  return { card: cardName, phase, failCount, nextAction };
}

function makeRepo() {
  const dir = testTempRoot('snapshot-test-');
  mkdirSync(join(dir, 'tools', 'accept'), { recursive: true });
  mkdirSync(join(dir, 'docs', '卡档案', 'two'), { recursive: true });
  mkdirSync(join(dir, 'docs', '卡档案', '_template'), { recursive: true });
  writeFileSync(join(dir, 'tools', 'accept', 'entry-registry.json'), JSON.stringify({
    version: 1,
    entries: [{ name: 'a', file: null }, { name: 'b', file: 'kernel/x.mjs' }],
  }));
  writeFileSync(join(dir, 'tools', 'accept', 'baseline.json'), JSON.stringify({
    rows: [{ current: 3, locked: false }, { current: 4, locked: true }],
  }));
  writeFileSync(join(dir, 'docs', '卡档案', 'two', 'state.json'), JSON.stringify(card('two', 'review_r1', 1, '等审卡')));
  writeFileSync(join(dir, 'docs', '卡档案', '_template', 'state.json'), JSON.stringify(card('模板卡', 'dispatched', 0, '不该出现')));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  execFileSync('git', ['add', '-A'], { cwd: dir });
  execFileSync('git', [
    '-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false',
    'commit', '-q', '-m', 'init',
  ], {
    cwd: dir,
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-25T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-25T00:00:00Z' },
  });
  return dir;
}

function run(root, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { cwd: root, encoding: 'utf8' });
}

test('renderSnapshot 五段齐全、顺序固定、≤80 行，数字按输入手算', () => {
  const text = renderSnapshot({
    head: { sha: 'abc1234', time: '2026-11-25T00:00:00Z' },
    commits: [
      { sha: '1', subject: '第一条' },
      { sha: '2', subject: '字'.repeat(70) },
    ],
    registry: { entries: [{ name: 'a', file: 'x.mjs' }, { name: 'b', file: null }, { name: 'c', file: '' }, { name: 'd', file: 'y.mjs' }] },
    baseline: { rows: [{ current: 2, locked: true }, { current: 3, locked: false }, { current: 4 }] },
    cards: [],
  });
  assert.equal(text.split('\n')[0], '# 状态快照（机器生成，禁止手改）');
  const headings = ['## 生成基准', '## 最近提交', '## 入口接通', '## 门禁基线', '## 在途卡'];
  const positions = headings.map((heading) => text.indexOf(heading));
  assert.ok(positions.every((position) => position >= 0), '五段必须齐全');
  assert.deepEqual(positions.slice().sort((a, b) => a - b), positions, '段顺序必须固定');
  assert.deepEqual(sectionOf(text, '## 生成基准'), ['生成时 HEAD=abc1234（2026-11-25T00:00:00Z）']);
  assert.deepEqual(sectionOf(text, '## 最近提交'), ['1 第一条', `2 ${'字'.repeat(60)}`], '主题截到 60 字');
  assert.deepEqual(sectionOf(text, '## 入口接通'), ['- 条目总数 4；file 非空 2；接通率 50%']);
  assert.deepEqual(sectionOf(text, '## 门禁基线'), ['- 分量总数 3；current 之和 9；未锁定 2']);
  assert.deepEqual(sectionOf(text, '## 在途卡'), ['（无）', '（缺：完整历史）']);
  assert.ok(lineCount(text) <= 80);
});

test('接通率向下取整：6 条中 1 条接通 → 16%', () => {
  const entries = [{ name: 'a', file: 'x.mjs' }];
  for (let index = 1; index < 6; index += 1) entries.push({ name: `n${index}`, file: null });
  const text = renderSnapshot({ registry: { entries } });
  assert.deepEqual(sectionOf(text, '## 入口接通'), ['- 条目总数 6；file 非空 1；接通率 16%']);
});

test('缺文件或缺字段写（缺：…），不抛错', () => {
  const text = renderSnapshot({ head: null, commits: null, registry: null, baseline: null, cards: null });
  assert.deepEqual(sectionOf(text, '## 生成基准'), ['（缺：head）']);
  assert.deepEqual(sectionOf(text, '## 最近提交'), ['（缺：commits）']);
  assert.deepEqual(sectionOf(text, '## 入口接通'), ['（缺：tools/accept/entry-registry.json）']);
  assert.deepEqual(sectionOf(text, '## 门禁基线'), ['（缺：tools/accept/baseline.json）']);
  assert.deepEqual(sectionOf(text, '## 在途卡'), ['（缺：cards）', '（缺：完整历史）']);

  const partial = renderSnapshot({
    registry: {}, baseline: {}, cards: [{ card: 'c1', phase: 'x' }],
  });
  assert.deepEqual(sectionOf(partial, '## 入口接通'), ['（缺：entries）']);
  assert.deepEqual(sectionOf(partial, '## 门禁基线'), ['（缺：rows）']);
  assert.deepEqual(sectionOf(partial, '## 在途卡'), ['（缺：failCount、nextAction）', '（缺：完整历史）']);
});

test('在途卡按 card 名排序，_template 由调用方跳过', () => {
  const text = renderSnapshot({
    cards: [
      card('zeta', 'review_r1', 0, '合并'),
      card('alpha', 'writing', 2, '继续写'),
      card('mid', 'dispatched', 0, '等出题'),
    ],
  });
  assert.deepEqual(sectionOf(text, '## 在途卡'), [
    'alpha | writing | 失败 2 | 下一步 继续写',
    'mid | dispatched | 失败 0 | 下一步 等出题',
    'zeta | review_r1 | 失败 0 | 下一步 合并',
    '（缺：完整历史）',
  ]);
});

test('卡多到超过行数上限时截断并写明省略张数', () => {
  const cards = Array.from({ length: 200 }, (_, index) => card(`card-${String(index).padStart(3, '0')}`, 'writing', 0, '继续'));
  const text = renderSnapshot({ cards });
  assert.ok(lineCount(text) <= 80);
  const cardLines = sectionOf(text, '## 在途卡');
  assert.ok(cardLines.some((line) => /^（另有 \d+ 张卡未列出）$/.test(line)));
});

test('CLI：生成、跳过 _template、--check 只比受检段', (t) => {
  const root = makeRepo();
  t.after(() => removeTempRoot(root));

  const gen = run(root, []);
  assert.equal(gen.status, 0, gen.stderr);
  const snapshotPath = join(root, SNAPSHOT_REL);
  const text = readFileSync(snapshotPath, 'utf8');
  assert.match(text, /^# 状态快照（机器生成，禁止手改）/);
  assert.deepEqual(sectionOf(text, '## 在途卡'), ['two | review_r1 | 失败 1 | 下一步 等审卡', '已合 0 张：（无）（git 派生）']);
  assert.doesNotMatch(text, /模板卡/, '_template 不是卡');
  assert.deepEqual(sectionOf(text, '## 入口接通'), ['- 条目总数 2；file 非空 1；接通率 50%']);
  assert.deepEqual(sectionOf(text, '## 门禁基线'), ['- 分量总数 2；current 之和 7；未锁定 1']);

  const clean = run(root, ['--check']);
  assert.equal(clean.status, 0, clean.stdout + clean.stderr);

  writeUnderTempRoot(root, SNAPSHOT_REL, text.replace('接通率 50%', '接通率 99%'));
  const tamperedChecked = run(root, ['--check']);
  assert.equal(tamperedChecked.status, 1);
  assert.match(tamperedChecked.stdout, /第一处差异/);

  assert.equal(run(root, []).status, 0);
  const regenerated = readFileSync(snapshotPath, 'utf8');
  const tamperedUnchecked = regenerated.replace(/^生成时 HEAD=.*$/m, '生成时 HEAD=deadbee（2000-01-01T00:00:00Z）');
  assert.notEqual(tamperedUnchecked, regenerated);
  writeUnderTempRoot(root, SNAPSHOT_REL, tamperedUnchecked);
  const uncheckedOnly = run(root, ['--check']);
  assert.equal(uncheckedOnly.status, 0, uncheckedOnly.stdout + uncheckedOnly.stderr);
});

test('CLI：--out 写到指定路径，--check 也认该路径', (t) => {
  const root = makeRepo();
  t.after(() => removeTempRoot(root));

  const outPath = 'tmp-snapshot.md';
  const gen = run(root, ['--out', outPath]);
  assert.equal(gen.status, 0, gen.stderr);
  assert.ok(existsSync(join(root, outPath)));
  assert.ok(!existsSync(join(root, SNAPSHOT_REL)), '--out 不应写默认路径');
  assert.equal(run(root, ['--check', '--out', outPath]).status, 0);
});

// S2-GOV Q3：已合判据只读 HEAD 历史——state.json 现版本随说明含整行「角色：合并」的真合并进了 HEAD 某父提交的历史（不含 HEAD 自己）。
function gitIn(cwd, args) {
  return execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=', ...args], {
    cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_AUTHOR_DATE: '2026-11-27T00:00:00Z', GIT_COMMITTER_DATE: '2026-11-27T00:00:00Z' },
  });
}
const mergedNow = (repoDir) => readMergedCards(repoDir, [{ dir: 'x-card', state: card('x-card', 'pr', 0, '合') }, { dir: 'y-card', state: card('y-card', 'pr', 0, '合') }]);

test('已合派生：卡分支改 state.json → 在途；「角色：合并」真合并本身 → 在途；其后再一次提交 → merged；「角色：写码」同步合并不算', (t) => {
  const root = testTempRoot('snapshot-merged-');
  t.after(() => removeTempRoot(root));
  gitIn(root, ['init', '-q', '-b', 'master']);
  writeUnderTempRoot(root, 'base.txt', 'base\n');
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'base']);

  gitIn(root, ['checkout', '-q', '-b', 'card/x']);
  writeUnderTempRoot(root, 'docs/卡档案/x-card/state.json', JSON.stringify(card('x-card', 'pr', 0, '合')));
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'x state']);
  assert.deepEqual(mergedNow(root), [], '第一步：卡分支上改 state.json，在途');

  gitIn(root, ['checkout', '-q', 'master']);
  gitIn(root, ['merge', '-q', '--no-ff', 'card/x', '-m', '合入 x', '-m', '卡分支：card/x\n角色：合并\n标识：main-test']);
  assert.deepEqual(mergedNow(root), [], '第二步：HEAD 就是合并提交，不算自己，在途');

  writeUnderTempRoot(root, 'after.txt', 'after\n');
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'after']);
  assert.deepEqual(mergedNow(root), ['x-card'], '第三步：合并提交进了父提交历史，merged');

  // 「角色：写码」的同步合并（卡分支合主线）不是合入。
  gitIn(root, ['checkout', '-q', '-b', 'card/y', 'master~1']);
  writeUnderTempRoot(root, 'docs/卡档案/y-card/state.json', JSON.stringify(card('y-card', 'pr', 0, '合')));
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'y state']);
  gitIn(root, ['merge', '-q', '--no-ff', 'master', '-m', '同步主线', '-m', '卡分支：card/y\n角色：写码\n标识：w']);
  writeUnderTempRoot(root, 'y-more.txt', 'more\n');
  gitIn(root, ['add', '-A']);
  gitIn(root, ['commit', '-q', '-m', 'y more']);
  assert.deepEqual(mergedNow(root), ['x-card'], '同步合并写「角色：写码」，y-card 仍在途');

  // 同一 HEAD 生成两次逐字节相同。
  writeUnderTempRoot(root, 'tools/accept/entry-registry.json', JSON.stringify({ version: 1, entries: [] }));
  const first = run(root, ['--out', 'a.md']);
  const second = run(root, ['--out', 'b.md']);
  assert.equal(first.status, 0, first.stderr);
  assert.equal(second.status, 0, second.stderr);
  const a = readFileSync(join(root, 'a.md'), 'utf8');
  assert.equal(a, readFileSync(join(root, 'b.md'), 'utf8'));
  // 已合的 x-card 只出现在末行名单里，不在在途列表。
  assert.deepEqual(sectionOf(a, '## 在途卡'), ['y-card | pr | 失败 0 | 下一步 合', '已合 1 张：x-card（git 派生）']);
});

test('已合派生：浅克隆写（缺：完整历史），不静默判定', (t) => {
  const src = testTempRoot('snapshot-shallow-src-');
  const dst = testTempRoot('snapshot-shallow-dst-');
  t.after(() => { removeTempRoot(src); removeTempRoot(dst); });
  gitIn(src, ['init', '-q', '-b', 'master']);
  for (const n of ['1', '2']) {
    writeUnderTempRoot(src, `f${n}.txt`, n);
    gitIn(src, ['add', '-A']);
    gitIn(src, ['commit', '-q', '-m', n]);
  }
  gitIn(dst, ['clone', '-q', '--depth', '1', `file://${src.split('\\').join('/')}`, 'c']);
  assert.equal(readMergedCards(join(dst, 'c'), []), null);
  assert.deepEqual(sectionOf(renderSnapshot({ cards: [], merged: null }), '## 在途卡'), ['（无）', '（缺：完整历史）']);
  // 纯渲染正例：已合名单里的卡不进在途列表。
  const both = renderSnapshot({ cards: [card('a-card', 'pr', 0, '合'), card('b-card', 'pr', 0, '等')], merged: ['a-card'] });
  assert.deepEqual(sectionOf(both, '## 在途卡'), ['b-card | pr | 失败 0 | 下一步 等', '已合 1 张：a-card（git 派生）']);
});
