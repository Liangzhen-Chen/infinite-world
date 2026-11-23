// 卡头自查（卷十二 §2.12 E-ACC-CARD-SELFCHECK；李白 11-18 17:45）：自查表（docs/派活卡头规矩.md 第三节，现九项）解析。
// 现在表放在卡档案目录的 反思.md 开头，由 lib/card-archive.mjs 调本文件解析并核对：恰有题面的各行，第三列"是"、
// 第四列证据非空；题面里带 "__" 的那项（diff 行数）证据须已换成数字。
// 题目只有一处定义（docs/派活卡头规矩.md），本文件读它对照，不另抄一份题目。

export const CARD_SELFCHECK_CODE = 'E-ACC-CARD-SELFCHECK';
export const CARD_RULES_DOC = 'docs/派活卡头规矩.md';

// 题面带 "__" 那项的证据判据：须含"共 N 行"；"约/大约"紧贴数字前、或"行"后接"左右"，即近似。
const DIFF_LINES = /共\s*[0-9]+\s*行/;
const DIFF_APPROX = /(?:约|大约)\s*共?\s*[0-9]|共\s*[0-9]+\s*行\s*左右/;

// markdown 表格行拆格：首尾的管道不算格；没有首管道的不算表格行。
function cellsOf(line) {
  const t = line.trim();
  if (!t.startsWith('|')) return null;
  const body = t.endsWith('|') ? t.slice(1, -1) : t.slice(1);
  return body.split('|').map((c) => c.trim());
}

const SEPARATOR = /^:?-+:?$/;

// 第一张表：第一行带首管道的连续行块；第二行是全部分隔格时按表头 + 分隔行 + 数据行解析，否则只当首行是表头。
export function firstTable(text) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim().startsWith('|'));
  if (start < 0) return null;
  const raw = [];
  for (let i = start; i < lines.length; i++) {
    const cells = cellsOf(lines[i]);
    if (!cells) break;
    raw.push(cells);
  }
  const header = raw[0];
  if (raw.length >= 2 && raw[1].length > 0 && raw[1].every((c) => SEPARATOR.test(c))) return { header, rows: raw.slice(2) };
  return { header, rows: raw.slice(1) };
}

// 题面（第几项、题目）取自规矩文件的表；编号须从 1 起连续，题目不许为空，否则返回 null（规矩文件本身坏了，关口拒）。
export function selfcheckQuestions(docText) {
  const t = firstTable(docText);
  if (!t) return null;
  const q = t.rows.map((r) => ({ n: r[0], q: r[1] || '' }));
  if (!q.length || q.some((x, i) => x.n !== String(i + 1) || !x.q)) return null;
  return q;
}

// 值合格的唯一判法（card-archive 与本文件共用）：去掉标点符号后不空、不是空话词、够字数（允许短值除外）。
export const strip = (s) => s.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase();
export function validValue(rules, v) {
  const t = v.trim().replace(/[；;，,。.\s]+$/, '');
  if (rules.allowShort.includes(t)) return true;
  const s = strip(t);
  if (!s || rules.bare.has(s)) return false;
  return [...t].length >= rules.minChars;
}

// 按题面逐行对照回报的第一张表；返回 { ok, reasons }，原因逐条写清楚（打印机读同一份）。
// opts（规矩第五节登记，调用方传入，本文件不写死）：noItems 可填"否"的项号数组、noPrefix 填"否"时证据须有的原因前缀、
// rules（{ allowShort, bare, minChars }，同 archiveRules 读出的值）供 validValue 判前缀后、实据之前的原因，evidenceRes 自查表证据种类的正则源数组（李白 Z-6）。没登记的项只认"是"。"否"项的实据（卷:行等）由 card-archive 按自查表证据种类照常核。
export function parseSelfcheck(reportText, questions, opts = {}) {
  const noItems = new Set((opts.noItems || []).map(String));
  const noPrefix = opts.noPrefix || '';
  const t = firstTable(reportText);
  if (!t) return { ok: false, reasons: ['回报开头没有 markdown 表'] };
  const reasons = [];
  if (t.rows.length !== questions.length) reasons.push(`自查表须恰有 ${questions.length} 行，实为 ${t.rows.length} 行`);
  for (let i = 0; i < questions.length; i++) {
    const { n, q } = questions[i];
    const label = `第 ${n} 项`;
    const row = t.rows[i];
    if (!row) { reasons.push(`${label}缺行`); continue; }
    if (row[0] !== n) { reasons.push(`${label}编号不对（实为 ${row[0] || '空'}）`); continue; }
    if (row.length !== 4) { reasons.push(`${label}须为 4 列，实为 ${row.length} 列`); continue; }
    if (row[1] !== q) { reasons.push(`${label}题目与 ${CARD_RULES_DOC} 不一致`); continue; }
    const canNo = noItems.has(n) && Boolean(noPrefix) && Boolean(opts.rules);
    if (row[2] !== '是' && !(canNo && row[2] === '否')) { reasons.push(`${label}填的是"${row[2] || '空'}"，须为"${canNo ? '是"或"否' : '是'}"`); continue; }
    const evidence = row[3];
    if (!evidence) { reasons.push(`${label}证据为空`); continue; }
    if (row[2] === '否') {
      // 填"否"：证据须以登记的原因前缀开头，前缀后的原因不少于最少字数。
      if (!evidence.startsWith(noPrefix)) { reasons.push(`${label}填"否"时证据须以"${noPrefix}"开头写原因`); continue; }
      // 原因 = 前缀后、第一处实据（evidenceRes：自查表证据种类的正则源）之前的那段文字；实据部分不计字数。
      let body = evidence.slice(noPrefix.length);
      for (const src of opts.evidenceRes || []) { const m = new RegExp(src).exec(body); if (m) body = body.slice(0, Math.min(body.length, m.index)); }
      if (!validValue(opts.rules, body)) { reasons.push(`${label}填"否"时"${noPrefix}"后、实据之前的原因为空、是空话或不足 ${opts.rules.minChars} 字`); continue; }
    }
    const slot = q.includes('__');
    // 任一项证据里都不许留着 "__"（占位未填）。
    if (evidence.includes('__')) { reasons.push(slot ? `${label}的"__"未替换为数字` : `${label}证据含未填占位"__"`); continue; }
    // 题面带 "__" 的项（diff 行数）：证据须写"共 N 行"（N 整数），数字前后带近似词不算确定。
    if (slot && (!DIFF_LINES.test(evidence) || DIFF_APPROX.test(evidence))) reasons.push(`${label}未写确定 diff 行数（须含"共 N 行"，N 为整数，不许约、大约、左右）`);
  }
  return { ok: reasons.length === 0, reasons };
}
