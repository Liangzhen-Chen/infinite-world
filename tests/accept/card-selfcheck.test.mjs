// 卡头自查（卷十二 §2.12 E-ACC-CARD-SELFCHECK；李白 11-18 17:45）：派卡子代理的提交缺回报、缺表、缺项、填"否"、证据空、
// 第 6 项 diff 行数未换成数字都拒；八项齐全填"是"、证据非空放行；主会话（无 DND_CARD_AGENT=1）不查。期望码为字面量。
// 题面一律从 docs/派活卡头规矩.md 读，测试里不另抄一份。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { cardSelfcheck } from '../../tools/accept/commit-hook.mjs';
import { reportPathOf, selfcheckQuestions, parseSelfcheck } from '../../tools/accept/lib/card-selfcheck.mjs';
import { ROOT } from './temp-repo.mjs';
import { testTempRoot, writeUnderTempRoot } from './temp-root.mjs';

const DOC = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const QUESTIONS = selfcheckQuestions(DOC);
const AGENT = { DND_CARD_AGENT: '1' };

// 回报正文：按题面逐行填；verdicts/evidences 可改某行的第三、四列，drop 删某行，extra 追加一行。
function tableText({ verdicts = {}, evidences = {}, drop = [], extra = [] } = {}) {
  const rows = QUESTIONS.filter((q) => !drop.includes(q.n)).map((q) => {
    const verdict = verdicts[q.n] || '是';
    const evidence = q.n in evidences ? evidences[q.n] : `证据 ${q.n}${q.q.includes('__') ? ' diff 共 12 行' : ''}`;
    return `| ${q.n} | ${q.q} | ${verdict} | ${evidence} |`;
  });
  return ['| # | 问题 | 是/否 | 证据 |', '|---|---|---|---|', ...rows, ...extra].join('\n');
}

const parse = (text) => parseSelfcheck(text, QUESTIONS);

test('题面取自 docs/派活卡头规矩.md：八项、编号 1–8、其中一项题面带 diff 行数占位', () => {
  assert.equal(QUESTIONS.length, 8);
  assert.deepEqual(QUESTIONS.map((q) => q.n), ['1', '2', '3', '4', '5', '6', '7', '8']);
  assert.equal(QUESTIONS.filter((q) => q.q.includes('__')).length, 1);
});

test('回报路径：分支名的 / 换成 -', () => {
  assert.equal(reportPathOf('ds/selfchk'), 'docs/卡回报/ds-selfchk.md');
  assert.equal(reportPathOf('master'), 'docs/卡回报/master.md');
});

test('八项齐全填"是"、证据非空：放行', () => {
  assert.deepEqual(parse(tableText()), { ok: true, reasons: [] });
});

test('回报开头没有表：拒', () => {
  const r = parse('本卡做了什么。\n\n没有表。');
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('回报开头没有 markdown 表'));
});

test('缺一项：拒', () => {
  const r = parse(tableText({ drop: ['8'] }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 8 项缺行')));
});

test('多一行：拒', () => {
  const r = parse(tableText({ extra: ['| 9 | 多出来的一项 | 是 | 证据 9 |'] }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('恰有 8 行，实为 9 行')));
});

test('某一项填"否"：拒', () => {
  const r = parse(tableText({ verdicts: { 4: '否' } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 4 项') && x.includes('须为"是"')));
});

test('证据为空：拒', () => {
  const r = parse(tableText({ evidences: { 3: '' } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 3 项证据为空')));
});

test('第 6 项 diff 行数的 "__" 未换成数字：拒', () => {
  const r = parse(tableText({ evidences: { 6: 'diff 共 __ 行' } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 6 项') && x.includes('未替换为数字')));
});

test('第 6 项只写增删分量或近似行数：拒', () => {
  for (const ev of ['约 +175 −20', 'diff 约 300 行', 'diff 共约 300 行', 'diff 共 300 行左右', '+175 −20']) {
    const r = parse(tableText({ evidences: { 6: ev } }));
    assert.equal(r.ok, false, ev);
    assert.ok(r.reasons.some((x) => x.includes('第 6 项未写确定 diff 行数')), ev);
  }
});

test('第 6 项写确定行数：放行', () => {
  assert.deepEqual(parse(tableText({ evidences: { 6: 'diff 共 2264 行（+2200 −64）' } })), { ok: true, reasons: [] });
  assert.deepEqual(parse(tableText({ evidences: { 6: '只改卡文列出的文件；diff 共  175 行' } })), { ok: true, reasons: [] });
});

test('任一项证据含 "__"：拒', () => {
  const r = parse(tableText({ evidences: { 2: '见 __ 处' } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 2 项证据含未填占位')));
});

test('题目与规矩文件不一致：拒', () => {
  const text = tableText().replace('没有按 id/名字/场景写特例', '没有写特例');
  const r = parse(text);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 2 项题目与')));
});

// 临时 git 仓库：分支名 ds/selfchk；先做一笔空提交让 HEAD 落实（rev-parse --abbrev-ref HEAD 要它），
// 之后只在暂存区放文件，不做新提交（关口只看索引）。目录由各测试自己从 testTempRoot 取，路径口子才认得出。
function initGitBranch(repo) {
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['symbolic-ref', 'HEAD', 'refs/heads/ds/selfchk'], { cwd: repo });
  execFileSync('git', ['-c', 'user.name=test', '-c', 'user.email=test@example.invalid', '-c', 'core.hooksPath=', 'commit', '-q', '--allow-empty', '-m', 'init'], { cwd: repo });
}

test('无 DND_CARD_AGENT=1（主会话）：不查，不要回报也不拒', () => {
  const dir = testTempRoot('card-selfcheck-');
  try {
    assert.deepEqual(cardSelfcheck(dir, {}), { ok: true, code: null, reasons: [] });
    assert.deepEqual(cardSelfcheck(dir, { DND_CARD_AGENT: '0' }), { ok: true, code: null, reasons: [] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('子代理提交：暂存区没有回报文件即拒，码 E-ACC-CARD-SELFCHECK', () => {
  const dir = testTempRoot('card-selfcheck-');
  try {
    initGitBranch(dir);
    writeUnderTempRoot(dir, 'docs/派活卡头规矩.md', DOC);
    const r = cardSelfcheck(dir, AGENT);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'E-ACC-CARD-SELFCHECK');
    assert.ok(r.reasons.some((x) => x.includes('暂存区没有回报文件 docs/卡回报/ds-selfchk.md')));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('子代理提交：回报在盘上但没进暂存区，同样拒', () => {
  const dir = testTempRoot('card-selfcheck-');
  try {
    initGitBranch(dir);
    writeUnderTempRoot(dir, 'docs/派活卡头规矩.md', DOC);
    writeUnderTempRoot(dir, 'docs/卡回报/ds-selfchk.md', tableText());
    const r = cardSelfcheck(dir, AGENT);
    assert.equal(r.ok, false);
    assert.equal(r.code, 'E-ACC-CARD-SELFCHECK');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('子代理提交：八项齐全的回报随提交进暂存区，放行', () => {
  const dir = testTempRoot('card-selfcheck-');
  try {
    initGitBranch(dir);
    writeUnderTempRoot(dir, 'docs/派活卡头规矩.md', DOC);
    writeUnderTempRoot(dir, 'docs/卡回报/ds-selfchk.md', tableText());
    execFileSync('git', ['add', '--', 'docs/卡回报/ds-selfchk.md'], { cwd: dir });
    assert.deepEqual(cardSelfcheck(dir, AGENT), { ok: true, code: null, reasons: [] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
