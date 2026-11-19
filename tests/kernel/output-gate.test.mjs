// 块 6 第 6-17 张《outputGate 最小版》（含改一轮：gate/screen 真显示闸、textcore labels 与 ops）：回应通道（kernel/transport/reply-channel.mjs）、
// outputGate 组（display-load、select、templates、redact、reply-composer、envelope-exit、mount）、gate 组（load-blocklist、matcher、screen）、textcore（brand、ops、labels、release）。
// 依据卷二 §2.9 第 0 条回应通道与已筛信封、第 6 条屏蔽词算法、E-WIRE-REPLY、E-TEXT-EXIT；卷二十九 §3.1、R29-1.6、R29-2.2–R29-2.6、R29-7.4、R29-7.6；
// 对照表 docs/迁移体检/块6-规矩检查对照.md 第 40、41 行。期望值都是按卷文手算的字面量；sha256("abc") 取标准测试向量。只跑纯函数与临时目录，不推进世界。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { codepointTables } from '../../server-plugin/kernel/load/codepoint-tables.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { createReplyChannel, postReply, serveRequest, newReplyHandle, claimReplySend } from '../../server-plugin/kernel/transport/reply-channel.mjs';
import { displayData } from '../../server-plugin/output-gate/display-load.mjs';
import { selectRows } from '../../server-plugin/output-gate/select.mjs';
import { labelText, renderTpl } from '../../server-plugin/output-gate/templates.mjs';
import { createEnvelopeExit } from '../../server-plugin/output-gate/envelope-exit.mjs';
import { createRedactor } from '../../server-plugin/output-gate/redact.mjs';
import { createReplyComposer } from '../../server-plugin/output-gate/reply-composer.mjs';
import { mountOutput } from '../../server-plugin/output-gate/mount.mjs';
import * as ENUMS from '../../server-plugin/output-gate/enums.mjs';
import { brand } from '../../server-plugin/textcore/brand.mjs';
import { concatText, intDigits, sliceByCodePoints } from '../../server-plugin/textcore/ops.mjs';
import { labels as loadLabels } from '../../server-plugin/textcore/labels.mjs';
import { release } from '../../server-plugin/textcore/release.mjs';
import { textValue } from '../../server-plugin/textcore/text-types.mjs';
import { loadBlocklist } from '../../server-plugin/gate/load-blocklist.mjs';
import { matchBlocklist, installBlocklist, resetBlocklist } from '../../server-plugin/gate/matcher.mjs';
import { screen } from '../../server-plugin/gate/screen.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT); // 装 E 与定点常数
assert.ok(W.ok, W.text);
const codeIs = (code) => (e) => e.code === code;
const ABC_SHA256 = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const LANG = 'zz';
// 真实折叠表：world/i18n/casefold.json（unicode.org CaseFolding C+S），经 kernel 的 codepointTables 读入。
const CASEFOLD = codepointTables(ROOT).casefold;
const j = (v) => JSON.stringify(v);

/** 在临时根下写 world/i18n、world/display 文件，返回根。files: {相对路径: 值}。 */
function rootWith(files) {
  const root = testTempRoot('outgate-');
  for (const [rel, v] of Object.entries(files)) writeUnderTempRoot(root, rel, j(v));
  return root;
}
const blocklistDoc = (words) => ({ version: 1, lang: LANG, entries: words.map((w) => ({ word: w, category: 'bcat_name' })) });
function useBlocklist(words) {
  resetBlocklist();
  return loadBlocklist(rootWith({ [`world/i18n/blocklist.${LANG}.json`]: blocklistDoc(words) }), LANG, CASEFOLD);
}
const T = (s) => brand(s);
const str = (textLike) => textValue(textLike);

// ---------- 枚举与 markers 不分叉 ----------
test('segment_kind 取卷九 :147 的两个值（定义只在 markers.mjs）', () => {
  assert.deepEqual([ENUMS.SEGMENT.narration, ENUMS.SEGMENT.dialogue], ['narration', 'dialogue']);
  assert.equal(ENUMS.SEGMENT.is('narration'), true);
  assert.equal(ENUMS.SEGMENT.is('code_enum.segment_kind'), false);
  assert.equal(ENUMS.KIND.is('bogus'), false);
});

// ---------- 真实世界数据：labels 形态形状与旧屏蔽词表迁入 ----------
test('真实 labels.zh.json 是"代号 → 形态 → 文字"，labels 加载器读得进，每条有 label', () => {
  const lb = loadLabels(ROOT, 'zh');
  assert.equal(lb.names.size, 80);
  assert.equal(str(lb.names.get('bm_capped').get('label')), '限额通道');
  assert.equal(str(lb.names.get('resfam_coin').get('label')), '铸币');
});

test('真实屏蔽词表 world/i18n/blocklist.zh.json 经 load-blocklist 加载（真实折叠表）：72 条（names 53 与 realPeople 19 去重），一词被显示闸遮蔽', () => {
  resetBlocklist();
  assert.equal(loadBlocklist(ROOT, 'zh', CASEFOLD), 72);
  const redact = createRedactor(T('#'), 'zh');
  const out = (s) => { const r = redact(T(s)); return [release(r.screened), r.verdict]; };
  assert.deepEqual(out('他叫特朗普吗'), ['他叫#吗', 'replace']); // realPeople 档
  assert.deepEqual(out('去艾泽拉斯'), ['去#', 'replace']); // names 档
  assert.deepEqual(out('他叫李白，来自长安'), ['他叫#，来自长安', 'replace']);
  assert.deepEqual(out('普通的一句话'), ['普通的一句话', 'pass']);
  assert.equal(matchBlocklist(T('特朗普'), 'zh')[0].categories[0], 'bcat_real_person');
});

test('真实折叠表（CaseFolding C+S）：大写英文与大小写变体不再整段遮蔽；ς 折 σ、ſ 折 s；汉字不变；屏蔽词的大小写变体被遮', () => {
  // 取表：大写 A (65) → a (97)；ς (962) → σ (963)；ſ (383) → s (115)；汉字「中」(20013) 不在表里。
  assert.deepEqual(CASEFOLD.get(65), [97]);
  assert.deepEqual(CASEFOLD.get(962), [963]);
  assert.deepEqual(CASEFOLD.get(383), [115]);
  assert.equal(CASEFOLD.has(20013), false);
  resetBlocklist();
  assert.equal(useBlocklist(['trump', 'σασ', 'sun', '特朗普']), 4);
  const redact = createRedactor(T('#'), LANG);
  const out = (s) => { const r = redact(T(s)); return [release(r.screened), r.verdict]; };
  // 无屏蔽词的大写英文与汉字混排：原样放行，不整段遮蔽。
  assert.deepEqual(out('Hello WORLD 世界'), ['Hello WORLD 世界', 'pass']);
  assert.deepEqual(matchBlocklist(T('ABC'), LANG), []);
  // 屏蔽词大小写变体：命中段按原文坐标换记号。
  assert.deepEqual(out('he said TRUMP loudly'), ['he said # loudly', 'replace']);
  assert.deepEqual(out('Trump'), ['#', 'replace']);
  assert.deepEqual(matchBlocklist(T('xTRUMPx'), LANG), [{ start: 1, end: 6, origStart: 1, origEnd: 6, categories: ['bcat_name'] }]);
  // ς 与 σ：词尾 ς 折成 σ，ΣΑς 折成 σασ 命中；ſ 折成 s，ſUN 折成 sun 命中。
  assert.deepEqual(matchBlocklist(T('ΣΑς'), LANG), [{ start: 0, end: 3, origStart: 0, origEnd: 3, categories: ['bcat_name'] }]);
  assert.deepEqual(matchBlocklist(T('ſUN'), LANG), [{ start: 0, end: 3, origStart: 0, origEnd: 3, categories: ['bcat_name'] }]);
  assert.deepEqual(matchBlocklist(T('他叫特朗普'), LANG), [{ start: 2, end: 5, origStart: 2, origEnd: 5, categories: ['bcat_name'] }]);
});

test('casefold.json 的出处与校验值：版本、来源 sha256 照主会话下载记录；map 的 sha256 与文件登记的 tableSha256 相符；只含一对一映射', () => {
  const real = JSON.parse(readFileSync(join(ROOT, 'world/i18n/casefold.json'), 'utf8'));
  assert.equal(real.status, 'C+S');
  assert.equal(real.unicodeVersion, '18.0.0');
  assert.equal(real.sourceSha256, 'a004797658a457bec4dc11683e39f69249ea3b595b752dbea6721c4c9f587b0d');
  assert.equal(createHash('sha256').update(JSON.stringify(real.map)).digest('hex'), real.tableSha256);
  assert.ok(real.map.every((p) => p.length === 2));
});

test('折叠表必给：不传（null）或空表即拒，没有"未建则整段遮蔽"的退路；码点表文件缺失或条目不合加载即拒', () => {
  resetBlocklist();
  assert.throws(() => loadBlocklist(ROOT, 'zh', null), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => loadBlocklist(ROOT, 'zh', new Map()), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => installBlocklist('zh', [{ word: T('Bad'), category: 'bcat_name' }], undefined), codeIs('E-I18N-BLOCKLIST'));
  const withMap = (map) => rootWith({ 'world/i18n/casefold.json': { version: 1, map } });
  assert.equal(codepointTables(withMap([[65, 97]])).casefold.get(65)[0], 97);
  for (const bad of [[], [[65]], [[65, 97, 98]], [[65, 97], [65, 98]], [[65, -1]], [[65, 1114112]], [[65.5, 97]], [['A', 97]]]) {
    assert.throws(() => codepointTables(withMap(bad)), codeIs('E-I18N-BLOCKLIST'), JSON.stringify(bad));
  }
  assert.throws(() => codepointTables(testTempRoot('outgate-nocf-')), codeIs('E-I18N-BLOCKLIST'));
});

// ---------- textcore ----------
test('ops：concatText 拼接、intDigits 按位成数字并补零、sliceByCodePoints 按码点取段（含代理对）', () => {
  assert.equal(str(concatText(T('ab'), T('cd'), T(''))), 'abcd');
  assert.equal(str(intDigits(0, 0)), '0');
  assert.equal(str(intDigits(1005, 0)), '1005');
  assert.equal(str(intDigits(5, 3)), '005');
  assert.equal(str(sliceByCodePoints(T('a\u{1F600}bc'), 1, 3)), '\u{1F600}b');
  assert.equal(str(sliceByCodePoints(T('abc'), 2)), 'c');
  assert.equal(str(sliceByCodePoints(T('abc'), 3)), '');
  assert.throws(() => intDigits(-1, 0), codeIs('E-TPL-KEY'));
  assert.throws(() => intDigits(1.5, 0), codeIs('E-TPL-KEY'));
  assert.throws(() => sliceByCodePoints(T('abc'), 2, 1), TypeError);
  assert.throws(() => concatText('raw'), TypeError);
  assert.throws(() => brand(42), TypeError);
});

test('labels 加载器：没有文件即两张空表；形态映射与段列表读成 Text；缺 label、字串条目、非对象拒', () => {
  const none = loadLabels(testTempRoot('outgate-lbl0-'), LANG);
  assert.equal(none.names.size + none.templates.size, 0);
  const ok = loadLabels(rootWith({
    [`world/i18n/labels.${LANG}.json`]: { act_buy: { label: 'Buy', short: 'B' } },
    [`world/i18n/templates.${LANG}.json`]: { tpl_x: { vx: ['<', { s: 'act' }, '>'] } },
  }), LANG);
  assert.equal(str(ok.names.get('act_buy').get('short')), 'B');
  assert.equal(ok.names.get('act_buy').has('adj'), false);
  const segs = ok.templates.get('tpl_x').get('vx');
  assert.deepEqual([str(segs[0]), segs[1].s, segs[1].f, str(segs[2])], ['<', 'act', null, '>']);
  const bad = (labelsFile) => loadLabels(rootWith({ [`world/i18n/labels.${LANG}.json`]: labelsFile }), LANG);
  assert.throws(() => bad({ act_buy: { short: 'B' } }), codeIs('E-I18N-LABEL-MISSING'));
  assert.throws(() => bad({ act_buy: { label: '' } }), codeIs('E-I18N-LABEL-MISSING'));
  assert.throws(() => bad({ act_buy: 'Buy' }), codeIs('E-I18N-FORM')); // 旧的扁平形状（代号 → 字串）不是卷二十九 §2.4 的形态映射
  assert.throws(() => bad({ act_buy: { label: 5 } }), codeIs('E-I18N-FORM'));
  assert.throws(() => bad([]), codeIs('E-I18N-FORM'));
});

// ---------- 显示配置加载 ----------
const row = (over) => ({ id: 'tpl_a', kind: 'notice', key: null, slots: [], stable: true, variants: [{ vid: 'v1', when: null, priority: 0, rotate: false }], ...over });
const loadRows = (rows) => displayData(rootWith({ 'world/display/templates.json': rows }));

test('displayData：没有任何显示配置文件即空配置（V-30 一份都不留仍可玩）', () => {
  const d = displayData(testTempRoot('outgate-empty-'));
  assert.equal(d.templates.length + d.byKindKey.size + d.locales.length, 0);
});

test('displayData：模板行按 kind 与 key 入表，兜底行 key 为空', () => {
  const d = loadRows([row({ id: 'tpl_fb' }), row({ id: 'tpl_x', key: 'act_buy' })]);
  assert.equal(d.byKindKey.get('notice').get(null).id, 'tpl_fb');
  assert.equal(d.byKindKey.get('notice').get('act_buy').id, 'tpl_x');
});

test('displayData：缺兜底、兜底有必填槽位、同 kind 同 key 两条、重复 id、非法槽位 kind 都拒收', () => {
  assert.throws(() => loadRows([row({ id: 'tpl_x', key: 'act_buy' })]), codeIs('E-TPL-NO-FALLBACK'));
  const req = { name: 'slt', kind: 'ref', source: 'receipt.actionId', form: null, required: true };
  assert.throws(() => loadRows([row({ slots: [req] })]), codeIs('E-TPL-NO-FALLBACK'));
  assert.throws(() => loadRows([row({ id: 'tpl_b' }), row({ id: 'tpl_c' })]), codeIs('E-TPL-KEY'));
  assert.throws(() => loadRows([row({ id: 'tpl_b' }), row({ id: 'tpl_b', key: 'act_buy' })]), codeIs('E-TPL-KEY'));
  assert.throws(() => loadRows([row({ slots: [{ ...req, kind: 'bogus', required: false }] })]), codeIs('E-TPL-KEY'));
  assert.throws(() => loadRows([row({ variants: [] })]), codeIs('E-TPL-KEY'));
  assert.throws(() => loadRows({ not: 'an array' }), codeIs('E-TPL-KEY'));
});

test('displayData：变体带 when 时交显示档编译；显示档内核未建即加载失败，不当恒真放过', () => {
  assert.throws(() => loadRows([row({ variants: [{ vid: 'v1', when: 'x', priority: 0, rotate: false }] })]), codeIs('E-MOD-RX'));
});

test('displayData：只读白名单内的文件（panels.json 之类未建文件不读）', () => {
  const root = testTempRoot('outgate-wl-');
  writeUnderTempRoot(root, 'world/display/panels.json', 'NOT JSON');
  assert.equal(displayData(root).templates.length, 0);
});

// ---------- 显示选择器 ----------
const EQ = { op: 'cmp', cmpOp: 'eq', left: { op: 'num', value: 1 }, right: { op: 'num', value: 1 } };
const NE = { op: 'cmp', cmpOp: 'ne', left: { op: 'num', value: 1 }, right: { op: 'num', value: 1 } };

test('selectRows：when 为空恒真；为真的行里取 priority 最大的全部（并列都返回，保持输入序）', () => {
  const rows = [{ id: 'a', when: null, priority: 1 }, { id: 'b', when: EQ, priority: 3 }, { id: 'c', when: NE, priority: 9 }, { id: 'd', when: null, priority: 3 }];
  assert.deepEqual(selectRows(rows, {}).map((r) => r.id), ['b', 'd']);
});

test('selectRows：没有为真的行返回空；空表返回空；when 求值不是布尔拒收', () => {
  assert.deepEqual(selectRows([{ id: 'c', when: NE, priority: 9 }], {}), []);
  assert.deepEqual(selectRows([], {}), []);
  assert.throws(() => selectRows([{ id: 'n', when: { op: 'num', value: 1 }, priority: 0 }], {}), codeIs('E-TPL-RX'));
});

// ---------- labelText 与 renderTpl ----------
const LABELS_FILE = { act_buy: { label: 'Buy', short: 'B' }, act_sell: { label: 'Sell' }, 'E-ACT-BUSY': { label: 'Busy' } };
const numSlot = { name: 'num', kind: 'num', source: 'receipt.minutesAdvanced', form: null, required: false };
const actSlot = (form, required) => ({ name: 'act', kind: 'ref', source: 'receipt.actionId', form, required });
const TPL_ROWS = [
  row({ id: 'tpl_fb', slots: [actSlot(null, false)] }),
  row({ id: 'tpl_buy', key: 'act_buy', slots: [actSlot('short', true), numSlot], variants: [{ vid: 'va', when: null, priority: 1, rotate: false }, { vid: 'vb', when: null, priority: 1, rotate: false }] }),
  row({ id: 'tpl_sell', key: 'act_sell', slots: [actSlot(null, true), { name: 'qty', kind: 'qty', source: 'receipt.costs', form: null, required: false }], variants: [{ vid: 'va', when: null, priority: 5, rotate: false }, { vid: 'vz', when: null, priority: 1, rotate: false }] }),
  row({ id: 'tpl_rot', key: 'act_rot', slots: [actSlot(null, false)], variants: [{ vid: 'vp', when: null, priority: 1, rotate: true }, { vid: 'vq', when: null, priority: 1, rotate: true }] }),
];
const TEXT_FILE = {
  tpl_fb: { v1: [{ s: 'act' }] },
  tpl_buy: { va: ['<', { s: 'act' }, ':', { s: 'num' }, '>'], vb: ['never'] },
  tpl_sell: { va: [{ s: 'act' }, '/', { s: 'qty' }], vz: [{ s: 'act' }, '!'] },
  tpl_rot: { vp: ['P'], vq: ['Q'] },
};
const FULL_ROOT = rootWith({
  'world/display/templates.json': TPL_ROWS,
  [`world/i18n/labels.${LANG}.json`]: LABELS_FILE,
  [`world/i18n/templates.${LANG}.json`]: TEXT_FILE,
});
const DISPLAY = displayData(FULL_ROOT);
const LB = loadLabels(FULL_ROOT, LANG);
const mk = (seq = 0) => ({ display: DISPLAY, labels: LB.names, templates: LB.templates, seq });
const rt = (kind, key, input, seq) => { const r = renderTpl(kind, key, input, mk(seq)); return r === null ? null : { ...r, text: str(r.text) }; };

test('labelText：有形态用形态；没有用 label；条目也没有以代号本身显示并标未译；原型链上的名字不算条目', () => {
  const c = mk();
  const out = (code, form) => { const r = labelText(code, form, c); return [str(r.text), r.untranslated]; };
  assert.deepEqual(out('act_buy', 'short'), ['B', false]);
  assert.deepEqual(out('act_sell', 'short'), ['Sell', false]);
  assert.deepEqual(out('act_walk', 'label'), ['act_walk', true]);
  assert.deepEqual(out('constructor', 'label'), ['constructor', true]);
});

test('renderTpl：按回执代号选模板、按槽位 form 取显示名、num 槽位取十进制；并列取 vid 代号序第一个', () => {
  assert.deepEqual(rt('notice', 'act_buy', { receipt: { actionId: 'act_buy', minutesAdvanced: 30 } }), { text: '<B:30>', templateId: 'tpl_buy', vid: 'va', untranslated: false });
});

test('renderTpl：引用了填不了的槽位的变体作废，落到下一个变体，再落到兜底（不出现空槽）；负数与小数不做 num', () => {
  const r = rt('notice', 'act_buy', { receipt: { actionId: 'act_buy' } });
  assert.deepEqual([r.text, r.vid], ['never', 'vb']);
  assert.equal(rt('notice', 'act_sell', { receipt: {} }), null);
  assert.equal(rt('notice', 'act_buy', { receipt: { actionId: 'act_buy', minutesAdvanced: -3 } }).vid, 'vb');
  assert.equal(rt('notice', 'act_buy', { receipt: { actionId: 'act_buy', minutesAdvanced: 2.5 } }).vid, 'vb');
});

test('renderTpl：用到未建 fill_kind（qty）的变体作废，priority 高的变体作废后低的顶上', () => {
  const r = rt('notice', 'act_sell', { receipt: { actionId: 'act_sell', costs: [1] } });
  assert.deepEqual([r.text, r.vid], ['Sell!', 'vz']);
});

test('renderTpl：未知代号走该 kind 兜底并标未译；kind 没有任何模板返回 null', () => {
  const r = rt('notice', 'act_walk', { receipt: { actionId: 'act_walk' } });
  assert.deepEqual([r.text, r.untranslated], ['act_walk', true]);
  assert.equal(rt('dialogue', 'card_x', {}), null);
  assert.equal(rt('notice', null, { receipt: { actionId: 'act_buy' } }).templateId, 'tpl_fb');
});

test('renderTpl：并列且都标 rotate，按 seq 对条数取模挑；负数 seq 也落在范围内', () => {
  const at = (seq) => rt('notice', 'act_rot', { receipt: { actionId: 'act_rot' } }, seq).text;
  assert.deepEqual([at(0), at(1), at(2), at(3), at(-1)], ['P', 'Q', 'P', 'Q', 'Q']);
});

// ---------- 屏蔽词匹配（matchBlocklist）与 screen ----------
test('matchBlocklist：命中返回规范化坐标与原文坐标，按 start 升序；零命中返回空', () => {
  useBlocklist(['bad']);
  assert.deepEqual(matchBlocklist(T('a bad b'), LANG), [{ start: 2, end: 5, origStart: 2, origEnd: 5, categories: ['bcat_name'] }]);
  assert.deepEqual(matchBlocklist(T('fine'), LANG), []);
  assert.equal(matchBlocklist(T(''), LANG).length, 0);
  assert.deepEqual(matchBlocklist(T('xbadybad'), LANG).map((h) => [h.start, h.end]), [[1, 4], [5, 8]]);
});

test('matchBlocklist：大小写折叠（needle 与文本同处理）；分解形式的组合字符先 NFC，原文坐标取整个字素簇', () => {
  useBlocklist(['bad']);
  assert.deepEqual(matchBlocklist(T('a BaD b'), LANG).map((h) => [h.start, h.end]), [[2, 5]]);
  // "x" + "e" + U+0301（NFC 后成 é 一个码点）+ "bad"：规范化 x é b a d，命中 [2,5)；原文 x(0) 簇 e+◌́(1–2) b(3) a(4) d(5)，原文区间 [3,6)
  const h = matchBlocklist(T('xébad'), LANG);
  assert.deepEqual(h.map((m) => [m.start, m.end, m.origStart, m.origEnd]), [[2, 5, 3, 6]]);
  // needle 含组合字符：词条用分解形式写，加载时同样 NFC，文本用合成形式也命中
  useBlocklist(['xé']);
  assert.deepEqual(matchBlocklist(T('xé'), LANG).map((m) => [m.start, m.end, m.origStart, m.origEnd]), [[0, 2, 0, 2]]);
});

test('matchBlocklist：重叠与相邻的命中合并为一段，类别取并集；没装词表的语言拒（fail closed）', () => {
  resetBlocklist();
  installBlocklist(LANG, [{ word: T('ab'), category: 'bcat_a' }, { word: T('cd'), category: 'bcat_b' }, { word: T('bcd'), category: 'bcat_c' }], CASEFOLD);
  assert.deepEqual(matchBlocklist(T('abcd'), LANG), [{ start: 0, end: 4, origStart: 0, origEnd: 4, categories: ['bcat_a', 'bcat_b', 'bcat_c'] }]);
  assert.deepEqual(matchBlocklist(T('ab cd'), LANG).map((h) => [h.start, h.end]), [[0, 2], [3, 5]]);
  assert.throws(() => matchBlocklist(T('ab'), 'qq'), codeIs('E-I18N-LOCALE'));
  assert.throws(() => installBlocklist(LANG, [], CASEFOLD), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => matchBlocklist('raw', LANG), TypeError);
});

test('load-blocklist：没有文件即空词表（全部通过）；形状不对拒；词条登记时按 NFC 与折叠处理', () => {
  resetBlocklist();
  assert.equal(loadBlocklist(testTempRoot('outgate-bl0-'), LANG, CASEFOLD), 0);
  assert.deepEqual(matchBlocklist(T('anything'), LANG), []);
  const bad = (doc) => { resetBlocklist(); return loadBlocklist(rootWith({ [`world/i18n/blocklist.${LANG}.json`]: doc }), LANG, CASEFOLD); };
  assert.throws(() => bad({ version: 2, lang: LANG, entries: [] }), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => bad({ version: 1, lang: 'other', entries: [] }), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => bad({ version: 1, lang: LANG, entries: [{ word: '', category: 'bcat_name' }] }), codeIs('E-I18N-BLOCKLIST'));
  assert.throws(() => bad({ version: 1, lang: LANG, entries: [{ word: 'a' }] }), codeIs('E-I18N-BLOCKLIST'));
  assert.equal(bad(blocklistDoc(['BAD'])), 1);
  assert.equal(matchBlocklist(T('a bad'), LANG).length, 1);
});

test('screen：零命中产出 Screened（release 取回原字串）；有命中返回命中列表且不产出 Screened；只有 screen 能造 Screened', () => {
  useBlocklist(['bad']);
  const ok = screen(T('fine'), LANG);
  assert.equal(release(ok.screened), 'fine');
  assert.equal(ok.hits, undefined);
  const hit = screen(T('a bad'), LANG);
  assert.equal(hit.screened, undefined);
  assert.equal(hit.hits.length, 1);
  for (const forged of ['fine', T('fine'), {}, { text: 'fine' }, null, undefined]) assert.throws(() => release(forged), codeIs('E-TEXT-EXIT'));
});

// ---------- 显示闸替换裁决 ----------
test('createRedactor：零命中 pass；命中段（原文坐标）换成替换记号并复核通过为 replace；复核仍命中整个字段只输出记号（block）', () => {
  useBlocklist(['bad', 'x#']);
  const redact = createRedactor(T('#'), LANG);
  const out = (s) => { const r = redact(T(s)); return [release(r.screened), r.verdict]; };
  assert.deepEqual(out('hello'), ['hello', 'pass']);
  assert.deepEqual(out('a bad b'), ['a # b', 'replace']);
  assert.deepEqual(out('bad and bad'), ['# and #', 'replace']);
  assert.deepEqual(out('xbad'), ['#', 'block']); // 替换后成 x#，又命中 x#
  assert.deepEqual(out('BAD'), ['#', 'replace']); // 折叠后命中，原文区间整个换掉
  // 组合字符：原文 x、e+◌́、bad，命中 bad 的原文区间 [3,6)
  assert.deepEqual(out('xébad'), ['xé#', 'replace']);
});

test('createRedactor：替换记号自己命中屏蔽词即加载失败', () => {
  useBlocklist(['bad']);
  assert.throws(() => createRedactor(T('a bad mark'), LANG), codeIs('E-I18N-REDACT-HIT'));
});

// ---------- 出口 ----------
function exitRig() {
  const sent = [];
  const channel = createReplyChannel();
  const cap = { send(handle, body) { channel.claimSend(handle); sent.push(JSON.parse(body)); } };
  useBlocklist(['bad']);
  return { channel, sent, exit: createEnvelopeExit(cap), redact: createRedactor(T('###'), LANG) };
}
const L = (text, extra = {}) => ({ seq: 0, tpl: null, speaker: null, seg: 'narration', stored: false, untranslated: false, gate: 'pass', text, ...extra });

test('respond：Screened 文字成信封 {screenId, text, digest}；序号从 0 起；digest 是 UTF-8 的 sha256；行里的文字换成信封序号，pass 的 gate 为空', () => {
  const { channel, sent, exit, redact } = exitRig();
  const r1 = redact(T('abc'));
  const r2 = redact(T('a bad'));
  exit.respond(channel.newReplyHandle({}), { responseId: 7, result: 'ok', rejects: [], lines: [L(r1.screened, { gate: r1.verdict }), L(r2.screened, { seq: 1, gate: r2.verdict })] });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].envelopeCount, 2);
  assert.deepEqual(sent[0].envelopes[0], { screenId: '7:0', text: 'abc', digest: ABC_SHA256 });
  assert.deepEqual([sent[0].envelopes[1].screenId, sent[0].envelopes[1].text], ['7:1', 'a ###']);
  assert.deepEqual([sent[0].lines[0].env, sent[0].lines[0].gate, sent[0].lines[1].env, sent[0].lines[1].gate], [0, null, 1, 'replace']);
  assert.equal('text' in sent[0].lines[0], false);
});

test('respond：空 lines、缺 lines、文字为空的行都是 0 个信封', () => {
  const { channel, sent, exit } = exitRig();
  exit.respond(channel.newReplyHandle({}), { responseId: 1, result: 'received', rejects: [], lines: [] });
  exit.respond(channel.newReplyHandle({}), { responseId: 2, result: 'received', rejects: [] });
  exit.respond(channel.newReplyHandle({}), { responseId: 3, result: 'ok', rejects: [], lines: [L(null)] });
  assert.deepEqual(sent.map((b) => b.envelopeCount), [0, 0, 0]);
  assert.equal(sent[2].lines[0].env, null);
});

test('respond：没筛过的文字（裸字串、未筛的 Text、伪造对象）与白名单外的字段都是 E-TEXT-EXIT，且一个字节都没发出', () => {
  const { channel, sent, exit, redact } = exitRig();
  const h = channel.newReplyHandle({});
  const base = { responseId: 1, result: 'ok', rejects: [] };
  assert.throws(() => exit.respond(h, { ...base, lines: [L('raw text')] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { ...base, lines: [L(T('unscreened'))] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { ...base, lines: [L({ text: 'forged', verdict: 'pass' })] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { ...base, lines: [L(null, { note: 'Hello there' })] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { ...base, banner: 'Hello there', lines: [] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { ...base, banner: redact(T('abc')).screened, lines: [] }), codeIs('E-TEXT-EXIT'));
  // 一行好一行坏：整个响应都不发
  assert.throws(() => exit.respond(h, { ...base, lines: [L(redact(T('ok')).screened), L('raw')] }), codeIs('E-TEXT-EXIT'));
  assert.throws(() => exit.respond(h, { responseId: 0, result: 'ok', rejects: [], lines: [] }), codeIs('E-WIRE-REPLY'));
  assert.equal(sent.length, 0);
});

test('respond：同一句柄第二次 send 被 ReplyCap 的一次一用核对拒（E-WIRE-REPLY）；没有 ReplyCap.send 即失败', () => {
  const { channel, sent, exit } = exitRig();
  const h = channel.newReplyHandle({});
  exit.respond(h, { responseId: 1, result: 'received', rejects: [], lines: [] });
  assert.throws(() => exit.respond(h, { responseId: 2, result: 'received', rejects: [], lines: [] }), codeIs('E-WIRE-REPLY'));
  assert.equal(sent.length, 1);
  assert.throws(() => createEnvelopeExit({}), codeIs('E-TEXT-EXIT'));
  assert.throws(() => createEnvelopeExit(undefined), codeIs('E-TEXT-EXIT'));
});

// ---------- 回应通道：每条返回路径恰一次 ----------
function channelRig({ display = DISPLAY, lb = LB, words = ['bad'], mark = '###' } = {}) {
  const channel = createReplyChannel();
  const sent = [];
  let posts = 0;
  const cap = { send(handle, body) { channel.claimSend(handle); sent.push(JSON.parse(body)); } };
  useBlocklist(words);
  const composer = createReplyComposer({ envelopeExit: createEnvelopeExit(cap), redact: createRedactor(T(mark), LANG), display, labels: lb.names, templates: lb.templates });
  channel.onReply((handle, result, responseId) => { posts += 1; return composer(handle, result, responseId); });
  return { channel, sent, cap, posts: () => posts };
}
const quiet = async (fn) => { const logged = []; const prev = useReportSink((r) => logged.push(r.code)); try { await fn(); } finally { useReportSink(prev); } return logged; };
const coded = (code) => { const e = new Error('x'); Object.assign(e, { code, fields: {} }); return e; };

test('成功路径：入口 postReply 一次，响应在 postReply 之后才发出（结算后才输出），回执按代号渲染', async () => {
  const { channel, sent, posts } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => {
    assert.equal(sent.length, 0); // 入口结算中，还没有任何输出
    channel.postReply(handle, { resultCode: 'ok', receipts: [{ actionId: 'act_buy', minutesAdvanced: 30, code: null, stage: null }] });
  });
  assert.equal(posts(), 1);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].responseId, 1);
  assert.equal(sent[0].result, 'ok');
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['<B:30>']);
  assert.deepEqual(sent[0].lines.map((l) => [l.seq, l.tpl, l.seg, l.env, l.untranslated, l.gate]), [[0, 'tpl_buy', 'narration', 0, false, null]]);
});

test('失败回执只讲拒因，不讲没发生的动作；拒因取显示名，没有条目回落代号并标未译', async () => {
  const { channel, sent } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, {
    resultCode: 'ok',
    receipts: [{ actionId: 'act_sell', code: 'E-ACT-BUSY', stage: 'validate' }, { actionId: 'act_buy', code: 'E-ACT-WRITER-NOT-READY', stage: 'validate' }],
  }));
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['Busy', 'E-ACT-WRITER-NOT-READY']);
  assert.deepEqual(sent[0].lines.map((l) => l.untranslated), [false, true]);
});

test('R29-1.6 未译标记：兜底模板引用缺译显示名的行带 untranslated，没引用缺译名的不带', async () => {
  const { channel, sent } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', receipts: [{ actionId: 'act_buy', code: null }, { actionId: 'act_walk', code: null }] }));
  // act_buy：tpl_buy 的 va 需要 num 槽位（缺）作废，vb 无槽位，文字 never，不引用显示名；act_walk：兜底模板引用缺译显示名
  assert.deepEqual(sent[0].lines.map((l) => [l.tpl, l.untranslated]), [['tpl_buy', false], ['tpl_fb', true]]);
});

test('退回菜单路径：received（错误上报已收到）恰一次 postReply，没有文字行', async () => {
  const { channel, sent, posts } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'received' }));
  assert.equal(posts(), 1);
  assert.deepEqual([sent[0].result, sent[0].envelopeCount, sent[0].lines.length], ['received', 0, 0]);
});

test('拒收路径恰一次 postReply：拒收代号进 rejects，并以拒因显示名成句', async () => {
  const { channel, sent, posts } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'rejected', rejectCode: 'E-ACT-BUSY' }));
  assert.equal(posts(), 1);
  assert.deepEqual([sent[0].result, sent[0].rejects, sent[0].envelopes[0].text], ['rejected', ['E-ACT-BUSY'], 'Busy']);
});

test('出错路径：入口抛带登记码的错，通道代投恰一条 error 结果；入口已回应后再抛不重复投；错误码进 report', async () => {
  const { channel, sent, posts } = channelRig();
  const logged = await quiet(async () => {
    await channel.serve(channel.newReplyHandle({}), () => { throw coded('E-ACT-BUSY'); });
    assert.equal(posts(), 1);
    assert.deepEqual([sent[0].result, sent[0].rejects], ['error', ['E-ACT-BUSY']]);
    await channel.serve(channel.newReplyHandle({}), (handle) => { channel.postReply(handle, { resultCode: 'ok' }); throw coded('E-ACT-BUSY'); });
  });
  assert.equal(posts(), 2);
  assert.equal(sent.length, 2);
  assert.deepEqual(logged, ['E-ACT-BUSY', 'E-ACT-BUSY']);
});

test('出错路径：没有登记码的错误原样往上抛，不吞；句柄仍收到一条 error 回应', async () => {
  const { channel, sent, posts } = channelRig();
  await assert.rejects(channel.serve(channel.newReplyHandle({}), () => { throw new TypeError('boom'); }), TypeError);
  assert.equal(posts(), 1);
  assert.deepEqual([sent[0].result, sent[0].rejects], ['error', ['E-WIRE-REPLY']]);
});

test('入口处理结束仍没有回应：通道代投一条只含错误代号的 error 结果（E-WIRE-REPLY）', async () => {
  const { channel, sent, posts } = channelRig();
  const logged = await quiet(() => channel.serve(channel.newReplyHandle({}), () => {}));
  assert.equal(posts(), 1);
  assert.deepEqual([sent[0].result, sent[0].rejects], ['error', ['E-WIRE-REPLY']]);
  assert.deepEqual(logged, ['E-WIRE-REPLY']);
});

test('save_export 成功一路：只 send、不调 postReply，serve 不代投 error；之后再 postReply 或再 send 都是 E-WIRE-REPLY', async () => {
  const { channel, sent, cap, posts } = channelRig();
  const h = channel.newReplyHandle({});
  const logged = await quiet(() => channel.serve(h, (handle) => { cap.send(handle, '{"bytes":true}'); }));
  assert.equal(posts(), 0); // 没有 postReply，也没有代投
  assert.equal(sent.length, 1);
  assert.deepEqual(logged, []);
  assert.throws(() => channel.postReply(h, { resultCode: 'ok' }), codeIs('E-WIRE-REPLY'));
  assert.throws(() => cap.send(h, 'again'), codeIs('E-WIRE-REPLY'));
  assert.equal(sent.length, 1);
});

test('save_export 失败一路：入口 postReply 拒收代号（其后同第 3–6 环）恰一次；send 之后入口抛错也不再投', async () => {
  const { channel, sent, posts } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'rejected', rejectCode: 'E-SAVE-WRITE-FAIL' }));
  assert.equal(posts(), 1);
  assert.deepEqual([sent[0].result, sent[0].rejects], ['rejected', ['E-SAVE-WRITE-FAIL']]);
  const rig = channelRig();
  await quiet(() => rig.channel.serve(rig.channel.newReplyHandle({}), (handle) => { rig.cap.send(handle, '{}'); throw coded('E-SAVE-WRITE-FAIL'); }));
  assert.equal(rig.posts(), 0);
  assert.equal(rig.sent.length, 1);
});

test('同句柄二次使用拒：第二次 postReply 是 E-WIRE-REPLY，只发出过一个响应', async () => {
  const { channel, sent, posts } = channelRig();
  const h = channel.newReplyHandle({});
  await channel.serve(h, (handle) => {
    channel.postReply(handle, { resultCode: 'ok' });
    assert.throws(() => channel.postReply(handle, { resultCode: 'ok' }), codeIs('E-WIRE-REPLY'));
  });
  assert.equal(posts(), 1);
  assert.equal(sent.length, 1);
  assert.throws(() => channel.postReply(h, { resultCode: 'ok' }), codeIs('E-WIRE-REPLY'));
});

test('不是 ReplyHandle 的东西（空、字串、普通对象、别的通道发的句柄）一律拒', () => {
  const a = channelRig().channel;
  const other = createReplyChannel().newReplyHandle({});
  for (const bad of [undefined, null, 'h', {}, other]) assert.throws(() => a.postReply(bad, { resultCode: 'ok' }), codeIs('E-WIRE-REPLY'));
});

test('responseId 是通道内单调整数，两个请求依次得 1、2', async () => {
  const { channel, sent } = channelRig();
  for (let i = 0; i < 2; i += 1) await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'received' }));
  assert.deepEqual(sent.map((b) => b.responseId), [1, 2]);
});

test('onReply 恰登记一次：没有订阅者时 postReply 拒；二次登记拒；非函数拒', () => {
  const c = createReplyChannel();
  assert.throws(() => c.postReply(c.newReplyHandle({}), { resultCode: 'ok' }), codeIs('E-WIRE-REPLY'));
  assert.throws(() => c.onReply('x'), codeIs('E-WIRE-REPLY'));
  assert.equal(c.hasSubscriber(), false);
  c.onReply(() => {});
  assert.equal(c.hasSubscriber(), true);
  assert.throws(() => c.onReply(() => {}), codeIs('E-WIRE-REPLY'));
});

test('ReplyResult 不收文字与畸形形状', () => {
  const { channel } = channelRig();
  const bad = [
    undefined, null, [], {}, { resultCode: 'nope' }, { resultCode: 'rejected' }, { resultCode: 'error', rejectCode: null },
    { resultCode: 'ok', rejectCode: 'E-ACT-BUSY' }, { resultCode: 'rejected', rejectCode: 'E-NOT-REGISTERED' },
    { resultCode: 'ok', receipts: [{ note: 'Hello world' }] }, { resultCode: 'ok', receipts: [{ n: Infinity }] }, { resultCode: 'ok', receipts: [{ f: () => 1 }] },
    { resultCode: 'ok', receipts: [{ s: '' }] },
  ];
  for (const r of bad) assert.throws(() => channel.postReply(channel.newReplyHandle({}), r), codeIs('E-WIRE-REPLY'));
});

// ---------- 渲染：事件序号轮换、空配置、显示闸 ----------
test('轮换序号取行序号（R29-2.3 "没有事件的取本次响应的行序号"）：并列且都标 rotate 的变体按行序号 0、1、2、3 轮换', async () => {
  const { channel, sent } = channelRig();
  const rec = { actionId: 'act_rot', code: null };
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', receipts: [rec, rec, rec, rec] }));
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['P', 'Q', 'P', 'Q']);
});

test('空语言包、空显示配置：每个回执仍有一行，文字是代号并标未译（A29-1.2：一份都不留仍可玩）', async () => {
  const empty = testTempRoot('outgate-none-');
  const { channel, sent } = channelRig({ display: displayData(empty), lb: loadLabels(empty, LANG) });
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', receipts: [{ actionId: 'act_buy', code: null }, { actionId: 'act_walk', code: null }] }));
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['act_buy', 'act_walk']);
  assert.deepEqual(sent[0].lines.map((l) => [l.tpl, l.untranslated]), [[null, true], [null, true]]);
});

test('空回执列表与无 receipts 字段：ok 结果只出 0 行，不编文字', async () => {
  const { channel, sent } = channelRig();
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', receipts: [] }));
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok' }));
  assert.deepEqual(sent.map((b) => [b.envelopeCount, b.lines.length]), [[0, 0], [0, 0]]);
});

test('决定卡台词：按决定卡代号走 dialogue 模板，没有模板回落显示名；说话人与分段代号随行', async () => {
  const lb = loadLabels(rootWith({ [`world/i18n/labels.${LANG}.json`]: { card_greet: { label: 'Hello' } } }), LANG);
  const { channel, sent } = channelRig({ lb });
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', cards: [{ card: 'card_greet', speaker: 'npc_a', slots: {} }] }));
  assert.deepEqual([sent[0].lines[0].speaker, sent[0].lines[0].seg, sent[0].envelopes[0].text], ['npc_a', 'dialogue', 'Hello']);
});

test('显示闸真遮蔽：命中段由 screen 的命中列表裁决、换成替换记号，行带 replace；复核仍命中整段改记号带 block；未命中的行原样', async () => {
  const lb = loadLabels(rootWith({ [`world/i18n/labels.${LANG}.json`]: { act_buy: { label: 'a bad deal' }, act_sell: { label: 'xbad' }, act_walk: { label: 'fine' } } }), LANG);
  const empty = displayData(testTempRoot('outgate-none2-'));
  const { channel, sent } = channelRig({ lb, display: empty, words: ['bad', 'x#'], mark: '#' });
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'ok', receipts: [{ actionId: 'act_buy', code: null }, { actionId: 'act_sell', code: null }, { actionId: 'act_walk', code: null }] }));
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['a # deal', '#', 'fine']);
  assert.deepEqual(sent[0].lines.map((l) => l.gate), ['replace', 'block', null]);
});

test('存档不可用状态：没有别的行时以枚举值显示名（枚举名.值）交代，缺条目回落代号标未译', async () => {
  const empty = testTempRoot('outgate-none3-');
  const { channel, sent } = channelRig({ lb: loadLabels(empty, LANG), display: displayData(empty) });
  await channel.serve(channel.newReplyHandle({}), (handle) => channel.postReply(handle, { resultCode: 'save_unavailable' }));
  assert.deepEqual([sent[0].envelopes[0].text, sent[0].lines[0].untranslated], ['reply_result.save_unavailable', true]);
});

test('createReplyComposer：缺 envelopeExit 或 redact 即失败（没有显示闸就不出文字）', () => {
  assert.throws(() => createReplyComposer({ envelopeExit: null, redact: () => {}, display: DISPLAY, labels: LB.names, templates: LB.templates }), TypeError);
  assert.throws(() => createReplyComposer({ envelopeExit: { respond() {} }, redact: undefined, display: DISPLAY, labels: LB.names, templates: LB.templates }), TypeError);
});

test('mountOutput（output-gate/mount.mjs）：向默认回应通道恰登记一次，之后默认通道的请求经它出响应；二次装配 E-WIRE-REPLY', async () => {
  useBlocklist(['bad']);
  const sent = [];
  const cap = { send(handle, body) { claimReplySend(handle); sent.push(JSON.parse(body)); } };
  const deps = { envelopeExit: createEnvelopeExit(cap), redact: createRedactor(T('###'), LANG), display: DISPLAY, labels: LB.names, templates: LB.templates };
  mountOutput(deps);
  await serveRequest(newReplyHandle({}), (handle) => postReply(handle, { resultCode: 'ok', receipts: [{ actionId: 'act_buy', minutesAdvanced: 5, code: null }] }));
  assert.deepEqual(sent[0].envelopes.map((e) => e.text), ['<B:5>']);
  assert.throws(() => mountOutput(deps), codeIs('E-WIRE-REPLY'));
});
