// 盲区扫描扩规则命中自动分类（只读；李白 11-15 04:00 ③）。不做"真缺登记"判定，只机械分档。
// 用法：node classify-blind-ext.mjs <scan-vocabfam-blind.mjs ext 的输出文件>
// 输入：同目录 scan-vocabfam-blind.mjs（拷自 F:/dnd-tmp/book/scan-vocabfam-blind.mjs，未改动）以 ext 模式产出的 TSV。
// 读卷：直接读 F:/dnd/docs/统一底层设计/卷*.md（与扫描脚本同口径，未用 lib.mjs）。
//
// 一、"出现"：标识符出现在某行的反引号片段里（修订二起也认不带反引号的整词；函数签名取括号前名）（片段整体或按空白、顿号、逗号、斜杠、竖线切开的各段，
//    经与扫描脚本相同的 norm：取 `name: type` 的 name、点路径取末段）。代码块行不计（扫描已排除数据块命中）。
// 二、"登记/定义出现"（统一判据，对所有条目一样，无逐条特判）。一次出现满足以下任一，且所在行不在"提及区"：
//    R1 表行首列：该行是 markdown 表格行（以 | 开头、非分隔行），标识符在第一格；或第一格不含反引号代号
//       （序号、中文显示名）时在第二格。
//    R2 列表/定义行首：行（去掉 - * 数字. ** 引用符等前缀后）以 `标识符` 开头，紧跟 ：/:/——/（/(/ 或 " 行"。
//    R3 登记句：非表格行，同一分句（按 。；，,：|切）里含该反引号标识符，且含登记动词
//       登记|新增|定义|声明|收录|增设|加入|加一行|加行，或标识符后紧跟 行/条目/字段/列/一行。
//    提及区（其中出现一律不算登记/定义）：所在一级标题（## ）匹配
//       §5|§7|§8|接口|迁移|开放问题|修订|勘误|记账|影响面|自检|输出|待补|审查意见|对齐的项|配合
//    即请求表、迁移清单、开放问题、修订记录、勘误、记账栏、自检输出、待补清单——这些是对别处的请求或改动记录，不是登记本身。
// 三、分档（按顺序取第一个成立的）：
//    A 声明卷他处有：声明卷内除命中行以外有登记/定义出现。
//    B 目标卷他处有：任一目标卷内有登记/定义出现。
//    C 仅散文提及：全书（卷*.md，含卷零）无登记/定义出现，且该标识符除提及区以外从不出现在表格行里。
//    D 其余：D1 第三卷（非声明卷、非目标卷）有登记/定义；D2 出现在非提及区表格行的非首列（仅作描述/读者提及）；
//       D0 全书无任何出现（扫描抽取与本脚本切分不一致）。
import fs from 'fs';
const D = 'F:/dnd/docs/统一底层设计/';
const FILES = fs.readdirSync(D).filter(f => /^卷.*\.md$/.test(f));
const short = f => f.replace(/-.*$/, '');
const BY = {}; for (const f of FILES) BY[short(f)] = f;
const MENTION = /§5|§7|§8|接口|迁移|开放问题|修订|勘误|记账|影响面|自检|输出|待补|审查意见|对齐的项|配合/;
const TYPEW = /^(ref|set|list|map|enum|struct|integer|number|boolean|string|rx|nullable|true|false|null|id|json|md)$/;
function norm(t) { // 与 scan-vocabfam-blind.mjs 的 norm 相同
  t = t.trim();
  let m = t.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*[:?]/); if (m) t = m[1];
  if (/[()\s<>{}\[\]=+*'"#$\\]/.test(t)) return null;
  if (t.includes('/')) return null;
  const segs = t.split('.').filter(Boolean); if (!segs.length) return null;
  const x = segs[segs.length - 1];
  if (!/^[a-z][a-zA-Z0-9_]*$/.test(x) || x.length < 3 || TYPEW.test(x)) return null;
  if (/_$/.test(x)) return null;
  return x;
}
// 修订一（自检后）：函数签名式 `name(a, b)` 取 ( 前的 name，否则入口表首列的函数一律认不出。
const tickIds = s => { const r = new Set(); for (const m of s.matchAll(/`([^`]+)`/g)) { const call = m[1].match(/^\s*([A-Za-z_][A-Za-z0-9_.]*)\s*\(/); for (const p of [m[1], ...(call ? [call[1]] : []), ...m[1].split(/[\s、,，/|]+/)]) { const x = norm(p); if (x) r.add(x); } } return r; };
// 读卷：每行带一级标题、是否代码块
const DOC = {};
for (const f of FILES) {
  const ls = fs.readFileSync(D + f, 'utf8').split(/\r?\n/);
  let code = false, top = ''; const meta = [];
  ls.forEach(l => {
    if (/^\s*```/.test(l)) { code = !code; meta.push({ code: true, top }); return; }
    if (!code && /^## /.test(l)) top = l;
    meta.push({ code, top });
  });
  DOC[f] = { ls, meta };
}
const isRow = l => /^\s*\|/.test(l) && !/^\s*\|[\s:|-]+\|?\s*$/.test(l);
const cells = l => l.replace(/`[^`]*`/g, s => s.replace(/\|/g, '\u0001')).trim().replace(/^\|/, '').split('|').map(c => c.replace(/\u0001/g, '|'));
const VERB = /登记|新增|定义|声明|收录|增设|加入|加一行|加行/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// 返回该行对 id 的出现类型：null 不出现；'reg' 登记/定义；'row' 表行非首列；'prose' 散文
// 修订二（自检后）：①不带反引号的代号也算出现（ASCII 词边界整词匹配），否则类型列里的 `enum cal_source` 之类看不见；
//   ②首列/第二列判据加"该格不超过 80 字"，长规则文本格（如"P-10 | `recipe` 表与……"）不算名称格。
const bare = (s, id) => new RegExp('(?<![A-Za-z0-9_])' + esc(id) + '(?![A-Za-z0-9_])').test(s);
const has = (s, id) => tickIds(s).has(id) || bare(s, id);
const nameCell = (c, id) => c.length <= 80 && has(c, id);
function occ(f, i, id) {
  const l = DOC[f].ls[i], m = DOC[f].meta[i];
  if (m.code || !has(l, id)) return null;
  const mention = MENTION.test(m.top);
  if (isRow(l)) {
    const c = cells(l);
    const first = nameCell(c[0] || '', id);
    const second = !/[`A-Za-z_]/.test(c[0] || '') && nameCell(c[1] || '', id);
    if ((first || second) && !mention) return 'reg';
    return mention ? 'prose' : 'row';
  }
  if (mention) return 'prose';
  const body = l.replace(/^\s*(>\s*)*([-*+]\s+|\d+[.)、]\s*)?(\*\*)?/, '');
  const tk = '(`[^`]*\\b' + esc(id) + '\\b[^`]*`|\\b' + esc(id) + '\\b)';
  if (new RegExp('^' + tk + '(\\*\\*)?\\s*(：|:|——|（|\\(|行)').test(body)) return 'reg';
  for (const cl of l.split(/[。；;，,：:|]/)) {
    if (!has(cl, id)) continue;
    if (VERB.test(cl)) return 'reg';
    if (new RegExp(tk + '\\s*(行|条目|字段|列|一行)').test(cl)) return 'reg';
  }
  return 'prose';
}
function scanVol(f, id, skip) {
  const r = { reg: [], row: [], prose: [] };
  DOC[f].ls.forEach((_, i) => { if (i === skip) return; const o = occ(f, i, id); if (o) r[o].push(i + 1); });
  return r;
}
// ---------- 读命中 ----------
const src = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
const hits = src.filter(l => /^(散文|§5\/8)\t/.test(l)).map(l => { const c = l.split('\t'); const [v, ln] = c[1].split(':'); return { kind: c[0], v, line: +ln, id: c[2], tv: c[3].split('/'), raw: l }; });
const out = []; const P = (...a) => out.push(a.join('\t'));
P('档', '子因', '类别', '声明卷:行', '标识符', '目标卷', '依据位置（卷:行，最多 3 处）');
const cnt = { A: 0, B: 0, C: 0, D: 0 }; const byTv = {}; const sub = {};
for (const h of hits) {
  const fd = BY[h.v]; let grade, why = '', where = [];
  const self = scanVol(fd, h.id, h.line - 1);
  if (self.reg.length) { grade = 'A'; where = self.reg.map(n => h.v + ':' + n); }
  if (!grade) for (const t of h.tv) { const ft = BY[t]; if (!ft) continue; const r = scanVol(ft, h.id, -1); if (r.reg.length) { grade = 'B'; where.push(...r.reg.map(n => t + ':' + n)); } }
  if (!grade) {
    const all = {}; let reg = [], row = [], any = 0;
    for (const f of FILES) { const r = scanVol(f, h.id, f === fd ? h.line - 1 : -1); reg.push(...r.reg.map(n => short(f) + ':' + n)); row.push(...r.row.map(n => short(f) + ':' + n)); any += r.reg.length + r.row.length + r.prose.length; }
    // 修订一：命中行本身计入 C 的检查（它是声明句本身，即便含登记动词也只算提及；非提及区表行的非首列算表行）
    const hs = occ(fd, h.line - 1, h.id); if (hs === 'row') row.push(h.v + ':' + h.line); else if (hs) any++;
    if (!reg.length && !row.length && any) { grade = 'C'; }
    else { grade = 'D'; if (reg.length) { why = 'D1'; where = reg; } else if (row.length) { why = 'D2'; where = row; } else why = 'D0'; }
  }
  cnt[grade]++; if (why) sub[why] = (sub[why] || 0) + 1;
  for (const t of h.tv) { byTv[t] = byTv[t] || { A: 0, B: 0, C: 0, D: 0 }; byTv[t][grade]++; }
  P(grade, why || '-', h.kind, h.v + ':' + h.line, h.id, h.tv.join('/'), where.slice(0, 3).join(' ') || '-');
}
out.push('');
out.push('== 汇总 ' + JSON.stringify({ total: hits.length, ...cnt, sum: cnt.A + cnt.B + cnt.C + cnt.D, D_sub: sub }));
out.push('== 按目标卷（多目标的命中在每个目标卷各计一次）');
for (const t of Object.keys(byTv).sort((a, b) => (byTv[b].A + byTv[b].B + byTv[b].C + byTv[b].D) - (byTv[a].A + byTv[a].B + byTv[a].C + byTv[a].D))) out.push([t, 'A=' + byTv[t].A, 'B=' + byTv[t].B, 'C=' + byTv[t].C, 'D=' + byTv[t].D].join('\t'));
fs.writeFileSync(1, out.join('\n') + '\n');
