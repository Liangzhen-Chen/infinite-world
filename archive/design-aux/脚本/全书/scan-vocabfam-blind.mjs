// 总审：盲区补扫（只读）——§5/§8 请求表反引号标识符 + 散文"登记/加/挂/新增"同句标识符，
// 在目标卷登记处（§2 与卷二所定的其他登记处，见下"登记处"段）与全书数据块里都查不到的列出
// 用法：node scan-vocabfam-blind.mjs > out.txt        （基础：只取与"字段/列"同分句的标识符）
//       node scan-vocabfam-blind.mjs ext > out.txt    （扩规则：再加"行/条目/登记/新增"同分句）
//       另可加 --sites（stderr 列出 §2 以外的登记处）、--dir=<卷文目录>（注入测试用副本目录）
// 扫描局限：
//  1. 只认反引号里的标识符；不带反引号的字段名、中文名字段查不到。
//  2. 只认同一分句（按 ，：|（）切）里的关键词；关键词与标识符跨分句、跨行就漏。
//  3. 函数名、入口名、视图名、规则键、事件名、运行态路径都会被当成候选，误报多，须人工判。
//  4. 同名词遮蔽：目标卷登记处（§2 与卷二 §1.5 所指定义处）、全书数据块或登记卷 §2 里只要出现同名词（哪怕含义不同、属于别的表）就算"有"，会漏报。
//  5. 点路径只比末段；`name: type` 只取 name。
//  6. 目标卷靠同句"卷X"或所在标题推断；卷零不扫，指向卷零的会被误识（如"卷零"被当成别卷）。
//  7. 只看"出现与否"，不核目标卷是否已改名落地、是否登记在正确的表。
// 判定规则（李白 11-14 21:20）：声明给卷二的键（系统声明表顶层键、状态键等），只有在 收尾待办.md 的卷二条目
//  或卷二 §8 请求表里已逐个写着该键名时，才能以"卷二收尾统一汇总"判误报；没写的一律判真缺失。
import fs from 'fs';
const D = (process.argv.find(a => a.startsWith('--dir='))?.slice(6) ?? 'F:/dnd/docs/统一底层设计') + '/'; // --dir=<卷文目录> 供注入测试用副本
const FILES = fs.readdirSync(D).filter(f => /^卷.*\.md$/.test(f) && !/^卷零/.test(f));
const short = f => f.replace(/-.*$/, '');
const DOC = {};
for (const f of FILES) {
  const ls = fs.readFileSync(D + f, 'utf8').split(/\r?\n/);
  const head = []; let h = ['', '', '', '', ''];
  const inCode = []; let code = false;
  ls.forEach((l, i) => {
    if (/^\s*```/.test(l)) { code = !code; inCode[i] = true; head[i] = h.filter(Boolean).join(' > '); return; }
    inCode[i] = code;
    const m = !code && l.match(/^(#{1,5}) (.*)$/);
    if (m) { const k = m[1].length; h = h.slice(0, k - 1).concat([m[2]]); while (h.length < 5) h.push(''); }
    head[i] = h.filter(Boolean).join(' > ');
  });
  DOC[f] = { ls, head, inCode };
}
const ticks = s => [...s.matchAll(/`([^`]+)`/g)].map(m => [m[1], m.index]);
const cut = (s, n = 60) => s.replace(/\s+/g, ' ').trim().slice(0, n);
// 卷名 → 文件
const VOLRE = /卷(零|[一二三四五六七八九十]+)(b|甲|乙)?/g;
function volFiles(name, suf) {
  if (name === '三' && !suf) return FILES.filter(f => /^卷三[甲乙]-/.test(f));
  const key = '卷' + name + (suf || '');
  return FILES.filter(f => f.startsWith(key + '-'));
}
const volsIn = s => { const r = new Set(); for (const m of s.matchAll(VOLRE)) volFiles(m[1], m[2]).forEach(f => r.add(f)); return [...r]; };
// 一级小节范围
function topRange(f, re) {
  const ls = DOC[f].ls; const out = [];
  ls.forEach((l, i) => {
    if (DOC[f].inCode[i] || !/^## /.test(l) || !re.test(l)) return;
    let e = i + 1; while (e < ls.length && !(/^## /.test(ls[e]) && !DOC[f].inCode[e])) e++;
    out.push([i, e]);
  });
  return out;
}
// 标识符规范化：`name: type` 取 name；点路径取末段；带括号（函数）、全大写、含空格的弃
const TYPEW = /^(ref|set|list|map|enum|struct|integer|number|boolean|string|rx|nullable|true|false|null|id|json|md)$/;
function norm(t) {
  t = t.trim();
  let m = t.match(/^([a-zA-Z_][a-zA-Z0-9_.]*)\s*[:?]/); if (m) t = m[1];
  if (/[()\s<>{}\[\]=+*'"#$\\]/.test(t)) return null;
  if (t.includes('/')) return null;
  const segs = t.split('.').filter(Boolean); if (!segs.length) return null;
  const x = segs[segs.length - 1];
  if (!/^[a-z][a-zA-Z0-9_]*$/.test(x) || x.length < 3 || TYPEW.test(x)) return null;
  if (/_$/.test(x)) return null; // 前缀
  return x;
}
// 目标卷登记处内出现的全部标识符（含表格、散文、代码块）：§2（卷二用"二""五"）加上面所列 §2 以外的登记处
const sec2Ids = {}; const allIds = {};
const idsOfLine = l => { const s = new Set(); for (const [t] of ticks(l)) { const parts = t.split(/[\s、,，/|]+/); for (const p of [t, ...parts]) { const x = norm(p); if (x) s.add(x); } } for (const m of l.matchAll(/"([a-z][a-zA-Z0-9_]*)"/g)) s.add(m[1]); for (const m of l.matchAll(/\b([a-z][a-zA-Z0-9_]*)\s*:/g)) s.add(m[1]); return s; };
// 登记处（2026-11-15 补全，按卷二对登记位的定义）：各卷 §2；卷二是“二”“五”两章，另加卷二自己的两张登记表——
// §1.5“命名 struct 登记”（首句“新增命名 struct 须在此登记并说明定义处”）与 §1.9 族名登记；
// §1.5 表“定义处”一栏所指的各节也是登记处：“卷X §n.n”取该卷该节，“卷X同段”沿用上一行该卷的节，
// “R<卷>-<号>”取该规则条，“§n.n EX-3”只取该节里的那一条，不带卷名的 §n.n 指卷二本卷。只带卷名、不带节号的（如“卷十八”）不扩。
const V2 = FILES.find(f => /^卷二-/.test(f));
function subRange(f, num) { // 任一级标题 §?num 起，到同级或更高级标题止
  const ls = DOC[f].ls; const rx = new RegExp('^(#{2,5})\\s+§?' + num.replace(/\./g, '\\.') + '(\\s|（|$)');
  const a = ls.findIndex((l, i) => !DOC[f].inCode[i] && rx.test(l)); if (a < 0) return null;
  const lv = ls[a].match(/^#+/)[0].length; let e = a + 1;
  while (e < ls.length && !(!DOC[f].inCode[e] && /^(#+)\s/.test(ls[e]) && ls[e].match(/^#+/)[0].length <= lv)) e++;
  return [a, e];
}
function ruleRange(f, rid, within) { // 条目：以 **<代号> 开头的列表项（R10-7.3、EX-3 等），到下一个列表项、标题或空行止；within 给出时只在该范围内找
  const ls = DOC[f].ls; const [w0, w1] = within || [0, ls.length];
  const a = ls.findIndex((l, i) => i >= w0 && i < w1 && new RegExp('^\\s*[-*]\\s+\\*\\*' + rid.replace(/[.-]/g, '\\$&') + '(?![\\d.])').test(l)); if (a < 0) return null;
  let e = a + 1; while (e < ls.length && ls[e].trim() && !/^\s*[-*]\s|^#/.test(ls[e])) e++;
  return [a, e];
}
const extraRanges = {}; const addR = (f, r) => { if (!r) return; (extraRanges[f] ||= []).push(r); };
const regSites = []; // 供 stderr 报告
// 卷二（李白 11-15 第 31 条：按"请卷二登记"语句全书机判，不按章节号）：卷二的登记处 = 卷二全卷去掉按标题内容认出的非登记区
// （读法、结论、迁移、验收断言、示例夹具、审查意见处置、自检输出、须对齐项、修订勘误、台账），不再按"二""五"、§1.5、§1.9 等章节号取。
const V2_NONREG = /读法|结论|迁移|验收|夹具|示例|审查意见|处置|输出|须对齐|修订|勘误|台账/;
const v2Zone = [];
if (V2) { const ls = DOC[V2].ls; let h2 = '', a = -1;
  ls.forEach((l, i) => { if (DOC[V2].inCode[i] || !/^## /.test(l)) return; if (a >= 0 && !V2_NONREG.test(h2)) v2Zone.push([a, i]); h2 = l; a = i; });
  if (a >= 0 && !V2_NONREG.test(h2)) v2Zone.push([a, ls.length]);
  regSites.push(`卷二 登记区 ${v2Zone.length} 段（按标题内容排除非登记区）`); }
if (V2) {
  // 命名 struct 登记表按内容认：表格行首格为 `struct:…`、表头有"定义处"一格的，取末格定义处
  const last = {};
  for (const [za, zb] of v2Zone) for (let i = za; i < zb; i++) {
    const l = DOC[V2].ls[i]; if (!/^\|\s*`struct:/.test(l)) continue;
    let h = i; while (h > 0 && DOC[V2].ls[h - 1].startsWith('|')) h--; if (!/\|\s*定义处\s*\|/.test(DOC[V2].ls[h])) continue;
    const cells = l.split('|').slice(1, -1); const cell = cells[cells.length - 1] || '';
    let cur = [V2]; const first = new Set(); // “同段”指上一行该卷的首个定义处；一格里后面的“变体见…”等附注不改它
    for (const m of cell.matchAll(/(卷(零|[一二三四五六七八九十]+)(b|甲|乙)?)?\s*(同段|§(\d+(?:\.\d+)*)(?:\s*([A-Z]{1,4}-\d+))?|R(\d+[a-z]?-\d+(?:\.\d+)*))/g)) {
      if (m[1]) cur = volFiles(m[2], m[3]);
      for (const f of cur) {
        let r = null, tag = ''; const isFirst = !first.has(f); first.add(f);
        if (m[4] === '同段') { r = last[f]; tag = '同段'; }
        else if (m[5]) { r = subRange(f, m[5]); tag = '§' + m[5]; if (r && m[6]) { r = ruleRange(f, m[6], r); tag += ' ' + m[6]; } if (r && isFirst) last[f] = r; } // “§4.7 EX-3”只取该条
        else if (m[7]) { r = ruleRange(f, 'R' + m[7]); tag = 'R' + m[7]; }
        if (r) { addR(f, r); regSites.push(`${short(f)} ${tag}(${short(V2)}:${i + 1})`); }
      }
    }
  }
}
for (const f of FILES) {
  const rs = (/^卷二-/.test(f) ? v2Zone : topRange(f, /^## §2 /)).concat(extraRanges[f] || []);
  const s = new Set(); for (const [a, b] of rs) for (let i = a; i < b; i++) idsOfLine(DOC[f].ls[i]).forEach(x => s.add(x));
  sec2Ids[f] = s;
  const s2 = new Set(); DOC[f].ls.forEach(l => idsOfLine(l).forEach(x => s2.add(x))); allIds[f] = s2;
}
// 全书数据块（代码块）里出现的标识符
const blockIds = new Set();
for (const f of FILES) DOC[f].ls.forEach((l, i) => { if (!DOC[f].inCode[i]) return; for (const m of l.matchAll(/[A-Za-z_][A-Za-z0-9_]*/g)) blockIds.add(m[0]); });

// ---------- 抽候选 ----------
const cand = []; const seen = new Set(); let noTarget = 0;
// 只取与"字段/列"同分句（，：|（）分隔）的标识符——中文叙述加字段的写法
const FIELDW = process.argv[2] === 'ext'
  ? /字段|(?<![并序队排])列(?![表出入为明举车])|行|条目|登记|新增/
  : /字段|(?<![并序队排])列(?![表出入为明举车])/;
function push(f, i, kind, sentence, ctxVols) {
  if (!FIELDW.test(sentence)) return;
  let tv = volsIn(sentence).filter(x => x !== f);
  if (!tv.length) tv = ctxVols.filter(x => x !== f);
  const ids = new Set();
  for (const cl of sentence.split(/[，,：:|（）()]/)) { if (!FIELDW.test(cl)) continue; for (const [t] of ticks(cl)) { const x = norm(t); if (x) ids.add(x); } }
  if (!ids.size) return;
  if (!tv.length) { noTarget += ids.size; return; }
  for (const id of ids) {
    const k = f + '|' + id + '|' + tv.join(); if (seen.has(k)) continue; seen.add(k);
    cand.push({ f, line: i + 1, kind, id, tv, raw: sentence });
  }
}
const ACT = /登记|新增|挂|加/;
for (const f of FILES) {
  if (/^卷(一|二)-/.test(f)) { /* 卷一§5/§8非请求表，卷二"五"是实体清单：只做散文规则 */ }
  const { ls, head, inCode } = DOC[f];
  const inReq = new Array(ls.length).fill(false);
  if (!/^卷(一|二)-/.test(f)) for (const [a, b] of topRange(f, /^## (§5|§8|附.*配合|附录.*配合)/)) for (let i = a; i < b; i++) inReq[i] = true;
  ls.forEach((l, i) => {
    if (inCode[i] || /^#/.test(l)) return;
    const hv = volsIn(head[i]);
    if (inReq[i]) { push(f, i, '§5/8', l, hv); return; }
    const sents = l.trim().startsWith('|') ? [l] : l.split(/[。；;]/);
    for (const s of sents) if (ACT.test(s) && volsIn(s).some(x => x !== f)) push(f, i, '散文', s, []);
  });
}
// ---------- 比对 ----------
const out = []; const P = (...a) => out.push(a.join('\t'));
P('### 盲区：候选标识符在目标卷登记处（§2 与卷二所定的其他登记处）与全书数据块都没有');
P('类别', '声明卷:行', '标识符', '目标卷', '目标卷他处有?', '声明卷他处有?', '上下文');
let hit = 0;
for (const c of cand) {
  if (c.tv.some(t => sec2Ids[t].has(c.id))) continue;
  if (blockIds.has(c.id)) continue;
  if (sec2Ids[c.f].has(c.id)) continue; // 登记卷自己 §2 已给行/列数据
  hit++;
  const tvElse = c.tv.filter(t => allIds[t].has(c.id)).map(short).join('/') || '无';
  // 声明卷除本行外是否出现
  const selfElse = DOC[c.f].ls.some((l, j) => j !== c.line - 1 && l.includes('`') && idsOfLine(l).has(c.id)) ? '有' : '无';
  P(c.kind, short(c.f) + ':' + c.line, c.id, c.tv.map(short).join('/'), tvElse, selfElse, cut(c.raw.replace(/^\|\s*/, ''), 90));
}
fs.writeFileSync(1, out.join('\n') + '\n');
console.error(JSON.stringify({ candidates: cand.length, hits: hit, noTargetIds: noTarget, extraRegSites: regSites.length }));
if (process.argv.includes('--sites')) console.error('§2 以外的登记处：' + regSites.join('；'));
