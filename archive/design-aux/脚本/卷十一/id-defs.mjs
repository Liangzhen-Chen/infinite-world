// 乙-6b（李白 11-15 18:50 第 1 条）：全书编号的定义位置与性质，一条通用识别规则，供 scan-id-forms.mjs（写法清单）与 gen-card-ledger.mjs（accept 取号）共用。
// 识别规则（整类，不按编号名、不按卷）：
//   ① 编号写法：大写字母 1–4 个（可带小写）＋可选卷序号数字＋可选小写分卷字母＋"-"＋数字串（可带小写尾字母、".数字"分级、末尾".大写字母"或"-大写字母"后缀，如 A26-9.S、VA-4.1-S），或没有连字符的"大写字母＋数字"短写法（卷一 I15、卷二 A1）。
//   ② 定义位置：编号出现在一行的"开头位"才算定义——表格行的首格开头、列表项开头（可带不超过 8 字的前缀，以"："或加粗收尾结束：扫描式：A17-1.3、**扫描式** VA-4.1-S）、段落开头须加粗。正文中间提到的都是引用。
//   ③ 性质按所在结构判：所在表格的首列列名含修订、影响面、勘误、意见、审查、裁定、跟改、记账、附录、问题、待补这类词的，是"记录类"（意见号、修订记录号），不是条目编号；
//      否则从定义行最近的一级标题往上，第一个命中的标题定性质：含上述记录类词的是"记录类"，含验收、断言、扫描、旁路、不变量的是"验收类"（断言号、扫描条代号、不变量号，
//      卷十一 §2.2 accept 的取值范围），含规则的是"规则类"；都没有是"其他类"。编号写了卷序号而不是本卷的，是引用别卷，不算本卷定义。
//   ④ 卷序号为空的编号（A-1、T-1）只在本卷有效，引用时带卷名（卷二十:T-1）。
// 只读、确定性。
export const TOK = '(?:[A-Z][A-Za-z]{0,3}[0-9]*[a-z]?-[0-9]+[a-z]?(?:\\.[0-9]+)*(?:[.-][A-Z](?![A-Za-z0-9]))?|[A-Z][0-9]+[a-z]?)';
// 只有"字母＋数字"、没有连字符的短写法（卷一 I15、卷二 A1、S3）：只在定义位认；正文引用里只取已有定义的，不当成待核的编号
export const SHORT_RE = /^[A-Z][0-9]+[a-z]?$/;
const TOK_AT = new RegExp('^(' + TOK + ')(?![0-9A-Za-z])');
export const RECORD_RE = /修订|修改记录|影响面|勘误|意见|审查|裁定|跟改|记账|附录|问题|待补/;
export const ACCEPT_RE = /验收|断言|扫描|旁路|不变量/;
export const RULE_RE = /规则/;
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const strip = s => s.replace(/^(?:\*\*|`|【[^】]*】|\s)+/, '');

// 一行的开头位编号：{tok, how, prefix}，没有则 null
export function leadOf(l, inTable) {
  if (inTable) { const c0 = cells(l)[0] ?? ''; const m = strip(c0).match(TOK_AT); return m ? { tok: m[1], how: '表格首格', prefix: '' } : null; }
  const li = l.match(/^\s*[-*+]\s+(.*)$/) ?? l.match(/^\s*\d+[.、]\s+(.*)$/);
  if (li) {
    let r = strip(li[1]); let prefix = '';
    // 前缀：不超过 8 字、以"："结束（扫描式：A17-1.3），或以加粗收尾结束（**扫描式** VA-4.1-S）
    const p = r.match(/^([^\s：:*`|（）()]{1,8})(?:[：:]|\*\*)\s*/); if (p && !TOK_AT.test(r)) { prefix = p[1]; r = strip(r.slice(p[0].length)); }
    const m = r.match(TOK_AT); return m ? { tok: m[1], how: prefix ? '列表项（前缀“' + prefix + '”）' : '列表项', prefix } : null;
  }
  if (/^#/.test(l)) return null;
  const m = strip(l).match(TOK_AT); return m && /^(?:\*\*|【)/.test(l) ? { tok: m[1], how: '段首（加粗）', prefix: '' } : null;
}
// heads：从卷标题以下的各级标题（浅到深）。所在表格首列列名是记录类词的即记录类；否则由最深一级标题起，第一个命中的标题定性质（记录、验收、规则依次判）
export function natureOf(heads, tableHead0) {
  if (tableHead0 && RECORD_RE.test(tableHead0)) return '记录类';
  for (const h of [...heads].reverse()) { if (RECORD_RE.test(h)) return '记录类'; if (ACCEPT_RE.test(h)) return '验收类'; if (RULE_RE.test(h)) return '规则类'; }
  return '其他类';
}
// 卷名 → 编号里的卷序号写法（卷二十九 → 29，卷八b → 8b，卷三乙 → 3b，卷三甲 → 3a）
const CN = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
export function volNo(vol) {
  const m = vol.match(/^卷([零一二三四五六七八九十]+)([b甲乙]?)$/); if (!m) return null;
  const s = m[1]; let n;
  if (s === '十') n = 10; else if (s.startsWith('十')) n = 10 + CN[s[1]]; else if (s.includes('十')) n = CN[s[0]] * 10 + (CN[s[2]] ?? 0); else n = CN[s];
  return { n: String(n), letter: { b: 'b', 甲: 'a', 乙: 'b', '': '' }[m[2]] };
}
// 编号里写了卷序号、且不是本卷的，是对别卷编号的引用，不是本卷的定义
export function ownsTok(vol, tok) {
  const m = tok.match(/^[A-Z][A-Za-z]{0,3}?([0-9]+)([a-z]?)-/); if (!m) return true;
  const v = volNo(vol); if (!v) return true;
  return m[1] === v.n && (!m[2] || m[2] === v.letter);
}
// 扫一卷：返回定义列表 [{tok, line(1 起), how, prefix, nature, head, tableHead, text}]；vol 给出时，写了别卷卷序号的编号不算定义
export function scanVolume(ls, vol) {
  const heads = []; const out = []; let tHead = null; let tStart = -1;
  ls.forEach((l, i) => {
    const h = l.match(/^(#{1,6})\s+(.*)$/);
    if (h) { heads.length = h[1].length; heads[h[1].length - 1] = h[2]; tHead = null; return; }
    const inTable = /^\|/.test(l);
    if (inTable && !tHead) { tHead = cells(l); tStart = i; return; }
    if (!inTable) tHead = null;
    if (inTable && i === tStart + 1 && /^\|\s*:?-{3}/.test(l)) return;
    const d = leadOf(l, inTable); if (!d) return;
    if (vol && !ownsTok(vol, d.tok)) return;
    const hs = heads.slice(1).filter(Boolean);
    const th0 = inTable ? (tHead?.[0] ?? '') : '';
    out.push({ ...d, line: i + 1, nature: natureOf(hs, th0), head: hs.join(' / '), tableHead: inTable ? tHead.join(' | ') : '', text: l });
  });
  return out;
}
// 编号的形状（写法种类）：字母前缀、有无卷序号、有无分卷字母、分级层数、后缀
export function shapeOf(tok) {
  if (SHORT_RE.test(tok)) return tok[0] + '+数字（无连字符）';
  const m = tok.match(/^([A-Z][A-Za-z]{0,3}?)([0-9]*)([a-z]?)-([0-9]+[a-z]?)((?:\.[0-9]+)*)((?:[.-][A-Z])?)$/); if (!m) return tok;
  return `${m[1]}${m[2] ? '卷号' : ''}${m[3] ? '分卷字母' : ''}-n${m[5] ? '.n'.repeat(m[5].split('.').length - 1) : ''}${m[6] ? m[6][0] + '大写后缀' : ''}${/[a-z]$/.test(m[4]) ? '+尾字母' : ''}`;
}
