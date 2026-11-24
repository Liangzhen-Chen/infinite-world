// 卡头自查表「可填否」独立验收（出题方 haiku-test-scno，未参与写码与审卡）。
// 依据：docs/派活卡头规矩.md:41（第 7 项「否」写法，李白 Z-6）；卷十二:545（E-ACC-CARD-ARCHIVE 验收关口）；
//       docs/派活卡头规矩.md:41 的「原因：」前缀与「自查表证据种类」里的命令末行实据。
// 测什么：第 7 项「否＋原因：＋实据」的放行与拒绝。放行与前缀、字数、题号类拒绝走 parseSelfcheck；
//         无实据的拒绝走真实门禁 checkArchive（card-archive.mjs，它在 parseSelfcheck 之外另核证据格）。
//         规矩第五节的两个键（自查表可填否项、否项原因前缀）原样取自真实规矩；无登记用例把键值设为空。
// 为什么修前红：当前 parseSelfcheck 只认"是"，把第 7 项的"否"一律拒，所以必过用例失败；必拒用例修前也拒（对照）。
// 公开入口：tools/accept/lib/card-selfcheck.mjs 的 parseSelfcheck、selfcheckQuestions；
//           tools/accept/lib/card-archive.mjs 的 loadRules、checkArchive（调用方式照 tests/accept/card-archive.test.mjs）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { selfcheckQuestions, parseSelfcheck } from '../../../tools/accept/lib/card-selfcheck.mjs';
import { loadRules, checkArchive } from '../../../tools/accept/lib/card-archive.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const REAL = readFileSync(join(ROOT, 'docs/派活卡头规矩.md'), 'utf8');
const ANCHOR = '- 开头自查表文件：反思.md';
if (!REAL.includes(ANCHOR)) throw new Error('规矩文件第五节找不到锚行，测试无法加键');
// 在真实规矩第五节加两个键，键名与值照真实规矩原样：自查表可填否项 = 7，否项原因前缀 = 「原因：」。
const WITH_KEYS = REAL.replace(ANCHOR, `${ANCHOR}\n- 自查表可填否项：7\n- 否项原因前缀：原因：`);
// 无登记：真实规矩文本上把「自查表可填否项」的值设为空。
const NOKEY = WITH_KEYS.replace('- 自查表可填否项：7', '- 自查表可填否项：');
if (NOKEY === WITH_KEYS) throw new Error('无登记用例没能清空键值');

const QUESTIONS = selfcheckQuestions(WITH_KEYS);
const RULES = loadRules(WITH_KEYS).rules;

// 与真实门禁 card-archive.mjs 同样传参：rules 取自 loadRules(规矩文本).rules。
const opts = (rules) => ({ noItems: rules.noItems, noPrefix: rules.noPrefix, rules, evidenceRes: rules.selfKinds.map((k) => rules.kinds[k]) });
const parse = (text) => parseSelfcheck(text, QUESTIONS, opts(RULES));

const EV = '`node --test tests/accept/card-archive.test.mjs` 末行：# pass 20';
const REASON = '原因：写者不跑全量，由主会话合入前跑';
const DEF_E = (q) => (q.q.includes('__') ? 'diff 共 12 行' : `卷十二:545 原句已摘（第 ${q.n} 项）`);

// 按题面逐行造回报表；默认第 7 项为「否＋原因＋命令末行实据」，其余八项为「是＋实据」；over 可覆盖某一项的第三、四列。
function report(qs, over = {}) {
  const rows = qs.map((q) => {
    const dflt = q.n === '7' ? { v: '否', e: `${REASON}；${EV}` } : { v: '是', e: DEF_E(q) };
    const { v, e } = { ...dflt, ...(over[q.n] || {}) };
    return `| ${q.n} | ${q.q} | ${v} | ${e} |`;
  });
  return ['| # | 问题 | 是/否 | 证据 |', '|---|---|---|---|', ...rows].join('\n');
}

// checkArchive 用的内存仓库：只需卷十二文件（卷:行 引用要在范围内，545 行）。
const fakeText = (n) => Array.from({ length: n }, (_, i) => `行 ${i + 1}`).join('\n');
const FILES = { 'docs/统一底层设计/卷十二-验收与自动扫描.md': fakeText(600) };
const MEM = {
  read: (p) => (p in FILES ? FILES[p] : null),
  list: (dir) => Object.keys(FILES).filter((k) => k.startsWith(dir)).map((k) => k.slice(dir.length)),
};

test('前提：题面九项编号 1–9；加键后、清空键值后的规矩都能解析', () => {
  assert.equal(QUESTIONS.length, 9);
  assert.deepEqual(QUESTIONS.map((q) => q.n), ['1', '2', '3', '4', '5', '6', '7', '8', '9']);
  assert.equal(QUESTIONS[6].q, '全量测试已跑：命令＋pass/fail 数');
  assert.equal(loadRules(WITH_KEYS).error, undefined);
});

test('必过：第 7 项「否」＋「原因：」＋足够长原因＋命令末行实据；其余八项「是」＋实据：放行', () => {
  assert.deepEqual(parse(report(QUESTIONS)), { ok: true, reasons: [] });
});

test('必拒：第 7 项「否」缺「原因：」前缀：拒', () => {
  const r = parse(report(QUESTIONS, { 7: { v: '否', e: `写者不跑全量，由主会话合入前跑；${EV}` } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 7 项')));
});

test('必拒：第 7 项「否」前缀后原因不足最少字数（4 字）：拒', () => {
  const r = parse(report(QUESTIONS, { 7: { v: '否', e: '原因：忙' } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 7 项')));
});

test('必拒：第 7 项「否」无任何实据（只有原因，无卷:行、文件:行、命令末行）：经真实门禁 checkArchive 拒', () => {
  const reflect = report(QUESTIONS, { 7: { v: '否', e: REASON } });
  const reasons = checkArchive(RULES, QUESTIONS, (f) => (f === '反思.md' ? reflect : null), null, '推送', MEM);
  assert.ok(reasons.some((x) => x.includes('反思.md') && x.includes('第 7 项') && x.includes('实据')), JSON.stringify(reasons));
});

test('必拒：第 3 项填「否」（不在可填否项里）：拒', () => {
  const r = parse(report(QUESTIONS, { 3: { v: '否', e: `${REASON}；${EV}` } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 3 项')));
});

test('必拒：第 7 项填「不适用」一类非是非否：拒', () => {
  const r = parse(report(QUESTIONS, { 7: { v: '不适用', e: `${REASON}；${EV}` } }));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 7 项')));
});

test('必拒：规矩里「自查表可填否项」值为空（无登记）时，第 7 项填「否」即使前缀与实据齐全也拒：loadRules 报错，或解析拒', () => {
  const L = loadRules(NOKEY);
  if (L.error) {
    assert.ok(L.error);
    return;
  }
  const qs = selfcheckQuestions(NOKEY);
  const r = parseSelfcheck(report(qs), qs, opts(L.rules));
  assert.equal(r.ok, false);
  assert.ok(r.reasons.some((x) => x.includes('第 7 项')));
});
