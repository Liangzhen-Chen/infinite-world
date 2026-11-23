// 卡头自查表解析（卷十二 §2.12 E-ACC-CARD-SELFCHECK；李白 11-18 17:45）：缺表、缺项、填"否"、证据空、
// 第 6 项 diff 行数未换成数字都拒；九项齐全填"是"、证据非空放行。表现放在卡档案目录的 反思.md 开头，
// 提交与推送时由 lib/card-archive.mjs 调本解析，那部分测试见 card-archive.test.mjs。
// 题面一律从 docs/派活卡头规矩.md 读，测试里不另抄一份。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { selfcheckQuestions, parseSelfcheck } from '../../tools/accept/lib/card-selfcheck.mjs';
import { ROOT } from './temp-repo.mjs';

const DOC = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const QUESTIONS = selfcheckQuestions(DOC);

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

test('题面取自 docs/派活卡头规矩.md：九项（第 9 项前置数据行，李白 11-22 15:21）、编号 1–9、其中一项题面带 diff 行数占位', () => {
  assert.equal(QUESTIONS.length, 9);
  assert.deepEqual(QUESTIONS.map((q) => q.n), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(QUESTIONS.filter((q) => q.q.includes('__')).length, 1);
});

test('九项齐全填"是"、证据非空：放行', () => {
  assert.deepEqual(parse(tableText()), { ok: true, reasons: [] });
});

test('回报开头没有表：拒', () => {
  const r = parse('本卡做了什么。\n\n没有表。');
  assert.equal(r.ok, false);
  assert.ok(r.reasons.includes('回报开头没有 markdown 表'));
});

test('缺一项：拒', () => {
  const r = parse(tableText({ drop: ['9'] }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 9 项缺行')));
});

test('多一行：拒', () => {
  const r = parse(tableText({ extra: ['| 10 | 多出来的一项 | 是 | 证据 10 |'] }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('恰有 9 行，实为 10 行')));
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

// 可填否项（李白 Z-6）：登记值由调用方传入，这里自设，不依赖真实规矩当前值。
const NO = { noItems: ['5'], noPrefix: '缘由：', rules: { allowShort: [], bare: new Set(['done', 'ok', '略']), minChars: 4 } };
const parseNo = (text) => parseSelfcheck(text, QUESTIONS, { ...NO, evidenceRes: ['`[^`\\n]*\\bnode\\b[^`\\n]*`[^\\n]*末行'] });
const noRow = (ev) => tableText({ verdicts: { 5: '否' }, evidences: { 5: ev } });

test('可填否项填"否"：带前缀、够字数的原因，证据仍有实据：放行', () => {
  assert.deepEqual(parseNo(noRow('缘由：写者不跑全量，由主会话合入前跑；`node --test x` 末行：# pass 3')), { ok: true, reasons: [] });
});

test('可填否项填"否"缺前缀：拒', () => {
  const r = parseNo(noRow('写者不跑全量，由主会话合入前跑；`node --test x` 末行：# pass 3'));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 5 项') && x.includes('缘由：')));
});

test('可填否项填"否"前缀后原因太短：拒', () => {
  const r = parseNo(noRow('缘由：没跑'));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 5 项') && x.includes('不足 4 字')));
});

test('可填否项填"否"只有前缀加实据、没有自身够字数的原因：拒；前缀加足够原因加实据：放行（实据不计字数）', () => {
  const r = parseNo(noRow('缘由：`node --test x` 末行：# pass 3'));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 5 项') && x.includes('不足 4 字')));
  assert.equal(parseNo(noRow('缘由：没；`node --test x` 末行：# pass 3')).ok, false);
  assert.equal(parseNo(noRow('缘由：不跑全量，主会话跑 `node --test x` 末行：# pass 3')).ok, true);
});

test('可填否项填"否"前缀加空话词（够 4 字）加实据：拒', () => {
  const r = parseNo(noRow('缘由：done；`node --test x` 末行：# pass 3'));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 5 项') && x.includes('空话')));
});

test('可填否项填"否"前缀与原因都有但无实据：解析放行，证据种类由 card-archive 拒（见 card-archive.test.mjs）', () => {
  assert.equal(parseNo(noRow('缘由：写者不跑全量，由主会话合入前跑')).ok, true);
});

test('未登记的项填"否"、或"是""否"以外的值：拒', () => {
  const a = parseNo(tableText({ verdicts: { 3: '否' }, evidences: { 3: '缘由：写者不跑全量，由主会话跑' } }));
  assert.equal(a.ok, false);
  assert.ok(a.reasons.some((x) => x.includes('第 3 项') && x.includes('须为"是"')));
  const b = parseNo(tableText({ verdicts: { 5: '部分' }, evidences: { 5: '缘由：写者不跑全量，由主会话跑' } }));
  assert.equal(b.ok, false);
  assert.ok(b.reasons.some((x) => x.includes('第 5 项') && x.includes('填的是"部分"')));
});

test('没传登记（默认）：任何项填"否"都拒', () => {
  assert.equal(parse(tableText({ verdicts: { 5: '否' }, evidences: { 5: '缘由：写者不跑全量，由主会话跑' } })).ok, false);
});

test('题目与规矩文件不一致：拒', () => {
  const text = tableText().replace('没有按 id/名字/场景写特例', '没有写特例');
  const r = parse(text);
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 2 项题目与')));
});

