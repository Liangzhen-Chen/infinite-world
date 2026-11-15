// 总审：盲区补扫（只读）——§5/§8 请求表反引号标识符 + 散文"登记/加/挂/新增"同句标识符，
// 在目标卷 §2 列名与全书数据块里都查不到的列出
// 用法：node scan-vocabfam-blind.mjs > out.txt        （基础：只取与"字段/列"同分句的标识符）
//       node scan-vocabfam-blind.mjs ext > out.txt    （扩规则：再加"行/条目/登记/新增"同分句）
// 扫描局限：
//  1. 只认反引号里的标识符；不带反引号的字段名、中文名字段查不到。
//  2. 只认同一分句（按 ，：|（）切）里的关键词；关键词与标识符跨分句、跨行就漏。
//  3. 函数名、入口名、视图名、规则键、事件名、运行态路径都会被当成候选，误报多，须人工判。
//  4. 同名词遮蔽：目标卷 §2、全书数据块或登记卷 §2 里只要出现同名词（哪怕含义不同、属于别的表）就算"有"，会漏报。
//  5. 点路径只比末段；`name: type` 只取 name。
//  6. 目标卷靠同句"卷X"或所在标题推断；卷零不扫，指向卷零的会被误识（如"卷零"被当成别卷）。
//  7. 只看"出现与否"，不核目标卷是否已改名落地、是否登记在正确的表。
// 判定规则（李白 11-14 21:20）：声明给卷二的键（系统声明表顶层键、状态键等），只有在 收尾待办.md 的卷二条目
//  或卷二 §8 请求表里已逐个写着该键名时，才能以"卷二收尾统一汇总"判误报；没写的一律判真缺失。
import fs from 'fs';
const D = 'F:/dnd/docs/统一底层设计/';
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
// 目标卷 §2 内出现的全部标识符（含表格、散文、代码块）；卷二用"二""五"
const sec2Ids = {}; const allIds = {};
const idsOfLine = l => { const s = new Set(); for (const [t] of ticks(l)) { const parts = t.split(/[\s、,，/|]+/); for (const p of [t, ...parts]) { const x = norm(p); if (x) s.add(x); } } for (const m of l.matchAll(/"([a-z][a-zA-Z0-9_]*)"/g)) s.add(m[1]); for (const m of l.matchAll(/\b([a-z][a-zA-Z0-9_]*)\s*:/g)) s.add(m[1]); return s; };
for (const f of FILES) {
  const rs = /^卷二-/.test(f) ? topRange(f, /^## (二|五) /) : topRange(f, /^## §2 /);
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
P('### 盲区：候选标识符在目标卷 §2 与全书数据块都没有');
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
console.error(JSON.stringify({ candidates: cand.length, hits: hit, noTargetIds: noTarget }));
