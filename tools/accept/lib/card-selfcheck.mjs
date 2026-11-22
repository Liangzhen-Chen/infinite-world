// 卡头自查（卷十二 §2.12 E-ACC-CARD-SELFCHECK；李白 11-18 17:45）：派卡脚本派出的子代理（环境变量 DND_CARD_AGENT=1）
// 做的提交，暂存区必须带回报文件 docs/卡回报/<分支名，/ 换成 ->.md；回报第一张 markdown 表须是 docs/派活卡头规矩.md
// 第三节那张自查表（现九项）：恰有题面的各行，第三列"是"、第四列证据非空；题面里带 "__" 的那项（diff 行数）证据须已换成数字。
// 题目只有一处定义（docs/派活卡头规矩.md），本文件读它对照，不另抄一份题目。

export const CARD_AGENT_ENV = 'DND_CARD_AGENT';
export const CARD_SELFCHECK_CODE = 'E-ACC-CARD-SELFCHECK';
export const CARD_RULES_DOC = 'docs/派活卡头规矩.md';
export const CARD_REPORT_DIR = 'docs/卡回报';

// 题面带 "__" 那项的证据判据：须含"共 N 行"；"约/大约"紧贴数字前、或"行"后接"左右"，即近似。
const DIFF_LINES = /共\s*[0-9]+\s*行/;
const DIFF_APPROX = /(?:约|大约)\s*共?\s*[0-9]|共\s*[0-9]+\s*行\s*左右/;

// 回报文件路径：分支名里的 / 换成 -（分支 feature/x → docs/卡回报/feature-x.md）。
export function reportPathOf(branch) {
  return `${CARD_REPORT_DIR}/${branch.split('/').join('-')}.md`;
}

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

// 按题面逐行对照回报的第一张表；返回 { ok, reasons }，原因逐条写清楚（打印机读同一份）。
export function parseSelfcheck(reportText, questions) {
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
    if (row[2] !== '是') { reasons.push(`${label}填的是"${row[2] || '空'}"，须为"是"`); continue; }
    const evidence = row[3];
    if (!evidence) { reasons.push(`${label}证据为空`); continue; }
    const slot = q.includes('__');
    // 任一项证据里都不许留着 "__"（占位未填）。
    if (evidence.includes('__')) { reasons.push(slot ? `${label}的"__"未替换为数字` : `${label}证据含未填占位"__"`); continue; }
    // 题面带 "__" 的项（diff 行数）：证据须写"共 N 行"（N 整数），数字前后带近似词不算确定。
    if (slot && (!DIFF_LINES.test(evidence) || DIFF_APPROX.test(evidence))) reasons.push(`${label}未写确定 diff 行数（须含"共 N 行"，N 为整数，不许约、大约、左右）`);
  }
  return { ok: reasons.length === 0, reasons };
}
