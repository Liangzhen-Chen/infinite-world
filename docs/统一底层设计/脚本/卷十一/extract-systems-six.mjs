// 乙-6a：系统登记六列（predicates、writers、sources、sinks、entryJudges、view）从各卷卷文转录（李白 11-15 16:05 第 2 条、18:05 第 2 条②）。
// 这是转录，不是推断：只抄各卷 §3.1、§3.2、§3.3 的表格与条目、卷六 §4.22.1 的源汇代号登记行、卷十九与卷五写明的 entryJudges；
// 每格带出处节号；卷文没写成条目的格写"待补"，不猜。phase 列不手填（按 R11-3.14 派生）。
// 输入：审查/脚本输出/乙4补-systems补全.json（系统与归属卷、tables）、各卷正文、卷二 §2.1 与 §2.7（sys.status、sys.capacity 的 JSON 示例）。
// 只读、确定性、不联网。用法：node extract-systems-six.mjs
// 输出：审查/脚本输出/乙6a-系统登记六列.json、乙6a-系统登记六列.md（贴进卷二 §2.7 的转录表）
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const uniq = a => [...new Set(a)];
const sysJ = JSON.parse(readFileSync(`${OUT}/乙4补-systems补全.json`, 'utf8')).systems;
const files = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const fileOfVol = v => files.find(f => f.startsWith(v + '-'));
const lines = new Map();
const lin = v => { if (!lines.has(v)) lines.set(v, readFileSync(`${DIR}/${fileOfVol(v)}`, 'utf8').split(/\r?\n/)); return lines.get(v); };

// ---- 卷内一个 "### n.m" 节：{no, title, body[]}；n 取 3（§3.1–§3.3）----
function section(v, no) {
  const ls = lin(v);
  const s = ls.findIndex(l => l.startsWith(`### ${no} `) || l === `### ${no}`);
  if (s < 0) return null;
  let e = ls.findIndex((l, i) => i > s && /^#{1,3} /.test(l)); if (e < 0) e = ls.length;
  return { no, title: ls[s].replace(/^### \S+\s*/, ''), body: ls.slice(s + 1, e) };
}
// 表格：返回 {head, rows[]}（连续的 | 行；第一行表头，跳过分隔行）
function tablesOf(body) {
  const out = []; let cur = null;
  for (const l of body) {
    if (!/^\|/.test(l)) { cur = null; continue; }
    const c = cells(l);
    if (!cur) { cur = { head: c, rows: [] }; out.push(cur); continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    cur.rows.push(c);
  }
  return out;
}
const bt = s => [...s.matchAll(/`([^`]+)`/g)].map(m => m[1]);
const modOf = s => (s.match(/[A-Za-z0-9_./-]+\.mjs/g) ?? []);
const fnName = s => (s.match(/^([A-Za-z_][A-Za-z0-9_.]*)/) ?? [])[1] ?? null;

// 本卷在该节明写"无"（节的第一行以"无"开头，或写"不导出任何""不定义任何""无运行期写者"）：转录为空表，不当作待补
function noneIn(sec, vol, no) {
  const first = sec.body.find(l => l.trim());
  if (first && (/^无[。，：\s]/.test(first.trim()) || /不导出任何|不定义任何|无运行期写者/.test(first))) return { value: [], src: `${vol} §${no}（本卷写明无）` };
  return null;
}
// ---- 各列的转录 ----
// view：本系统领头表的读入口（卷二 §2.1）在本卷 §3.1 表里的"所在文件"栏
const reg = readFileSync(`${DIR}/${CFG.registry.file}`, 'utf8').split(/\r?\n/);
const viewOf = new Map();
{ const s = reg.findIndex(l => /^### 2\.1 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  for (let i = s; i < e; i++) { if (!/^\|/.test(reg[i])) continue; const c = cells(reg[i]); if (!/^\d+$/.test(c[0] ?? '')) continue;
    const k = (c[1] ?? '').match(/^([a-z_]+)/), en = (c[2] ?? '').match(/`([A-Za-z_]\w*)/); if (k && en) viewOf.set(k[1], en[1]); } }
function colView(sys) {
  const t = sys.tables[0]; if (!t) return null;
  const name = viewOf.get(t); if (!name) return null;
  const sec = section(sys.volume, '3.1'); if (!sec) return null;
  for (const tb of tablesOf(sec.body)) for (const r of tb.rows) {
    if (fnName(bt(r[0])[0] ?? '') !== name) continue;
    const m = r.slice(1).map(modOf).find(x => x.length);
    if (m) return { value: `${m[0]}#${name}`, src: `${sys.volume} §3.1` };
  }
  return null;
}
// predicates：§3.2 标题含"谓词"的节里的条目（列表行 "- `名(" 或表格首格）；文件取节内唯一出现的 .mjs 或表内同行的 .mjs
function colPredicates(sys) {
  const sec = section(sys.volume, '3.2'); if (!sec || !sec.title.includes('谓词')) return null;
  const names = [];
  const mods = uniq(modOf(sec.body.join('\n')));
  for (const l of sec.body) { const m = l.match(/^- `([A-Za-z_][A-Za-z0-9_]*)\(/); if (m) names.push({ name: m[1], file: mods.length === 1 ? mods[0] : null }); }
  for (const tb of tablesOf(sec.body)) for (const r of tb.rows) { const n = fnName(bt(r[0])[0] ?? ''); if (n) { const mm = r.slice(1).map(modOf).find(x => x.length); names.push({ name: n, file: mm?.[0] ?? (mods.length === 1 ? mods[0] : null) }); } }
  if (!names.length) return noneIn(sec, sys.volume, '3.2');
  return { value: names.map(x => (x.file ? `${x.file}#${x.name}` : x.name)), src: `${sys.volume} §3.2`, fileUnknown: names.filter(x => !x.file).length };
}
// writers：§3.2 或 §3.3 里标题含"写者"的节的表格；每行首格（状态路径或写入口）与同行的 .mjs 写者模块
function colWriters(sys) {
  const out = []; const srcs = [];
  for (const no of ['3.2', '3.3']) {
    const sec = section(sys.volume, no); if (!sec || !sec.title.includes('写者')) continue;
    for (const tb of tablesOf(sec.body)) for (const r of tb.rows) {
      let items = bt(r[0]); let m = r.slice(1).map(modOf).find(x => x.length);
      if (!items.length && modOf(r[0]).length) { m = modOf(r[0]); items = bt(r[1] ?? '').map(x => fnName(x)).filter(Boolean); } // 首格是写者文件、第二格是入口
      if (!items.length || !m) continue;
      out.push({ item: items.join('、'), module: m[0] });
    }
    srcs.push(`${sys.volume} §${no}`);
  }
  if (out.length) return { value: out, src: uniq(srcs).join('、') };
  for (const no of ['3.2', '3.3']) { const sec = section(sys.volume, no); if (sec && sec.title.includes('写者')) { const r = noneIn(sec, sys.volume, no); if (r) return r; } }
  return null;
}
// sources、sinks：卷六 §4.22.1 登记的源汇代号（首格 `src_…`、`sink_…`）；系统是该卷对应的系统
function colSrcSink(sys, prefix) {
  const ls = lin(sys.volume); const out = []; let head = null;
  ls.forEach((l, i) => {
    if (/^#{3,4} /.test(l)) head = l.match(/^#+ (\S+)/)[1];
    const m = l.match(/^\| `(src|sink)_([A-Za-z0-9_]+)` \|/);
    if (m && m[1] === prefix) out.push({ code: `${m[1]}_${m[2]}`, sec: head });
  });
  return out.length ? { value: out.map(x => x.code), src: `${sys.volume} §${uniq(out.map(x => x.sec))[0]}` } : null;
}
// entryJudges：本卷正文里"entryJudges"一句列出的 文件#函数
function colJudges(sys) {
  const ls = lin(sys.volume); let head = null; const out = []; let sec = null;
  ls.forEach(l => {
    if (/^#{2,4} /.test(l)) head = l.match(/^#+ (\S+)/)[1];
    if (l.includes('`entryJudges`') && l.includes('列出')) { const x = [...l.matchAll(/`([A-Za-z0-9_./-]+\.mjs#[A-Za-z0-9_]+)`/g)].map(m => m[1]); if (x.length) { out.push(...x); sec ??= head; } }
  });
  return out.length ? { value: uniq(out), src: `${sys.volume} §${sec}` } : null;
}

// 出处带节标题（卷间引用要带标题）：把 "卷X §n" 补成 "卷X §n（标题）"，标题取该卷该节的标题去掉末尾的括注
function titled(src) {
  if (!src) return src;
  return src.replace(/(卷[零一二三四五六七八九十]+[b甲乙]?) §([0-9]+(?:\.[0-9]+)*)(?!（)/g, (m, v, no) => {
    const fl = fileOfVol(v); if (!fl) return m;
    const h = lin(v).find(l => new RegExp('^#{2,4} ' + no.replace(/\./g, '\\.') + '(?:\\s|$)').test(l));
    if (!h) return m;
    const t = h.replace(/^#+\s*\S+\s*/, '').replace(/（.*$/, '').trim();
    return t ? m + '（' + t + '）' : m;
  });
}
// ---- 汇总 ----
const COLS = ['predicates', 'writers', 'sources', 'sinks', 'entryJudges', 'view'];
const systems = [];
for (const s of sysJ) {
  const r = { system: s.system, volume: s.volume, cols: {} };
  const got = { predicates: colPredicates(s), writers: colWriters(s), sources: colSrcSink(s, 'src'), sinks: colSrcSink(s, 'sink'), entryJudges: colJudges(s), view: colView(s) };
  for (const c of COLS) r.cols[c] = got[c] ? { ...got[c] } : { value: '待补' };
  systems.push(r);
}
// 卷二 §2.7 的 JSON 示例已给出的系统（sys.status、sys.capacity）：解析示例里的对象，照字段转录；示例没写的字段待补
function jsonExample(key) {
  const txt = reg.join('\n'); const i = txt.indexOf('"' + key + '": {'); if (i < 0) return null;
  let j = txt.indexOf('{', i), d = 0, k = j;
  for (; k < txt.length; k++) { if (txt[k] === '{') d++; else if (txt[k] === '}') { d--; if (!d) break; } }
  const raw = txt.slice(j, k + 1).split('\n').map(l => l.replace(/\s\/\/.*$/, '')).join('\n');
  try { return JSON.parse(raw); } catch { return null; }
}
const SRC = '卷二 §2.7 JSON 示例';
function fromExample(sysKey, volume) {
  const ex = jsonExample(sysKey); if (!ex) return null;
  const r = { system: sysKey, volume, cols: {} };
  const norm = (c, v) => {
    if (!(c in ex)) return { value: '待补' };
    if (c === 'writers') return { value: ex.writers.map(w => ({ item: w, module: null })), src: SRC };
    return { value: ex[c], src: SRC };
  };
  for (const c of COLS) r.cols[c] = norm(c, ex[c]);
  return r;
}
{ const st = fromExample('sys.status', '卷二十一'); const i = systems.findIndex(x => x.system === 'sys.status'); if (st && i >= 0) systems[i] = st;
  const cap = fromExample('sys.capacity', '卷二'); if (cap) systems.push(cap); }
for (const s of systems) for (const c of COLS) if (s.cols[c].src) s.cols[c].src = titled(s.cols[c].src);
systems.sort((a, b) => (a.system < b.system ? -1 : 1));

const cnt = { filled: 0, pending: 0 }; const byCol = Object.fromEntries(COLS.map(c => [c, { filled: 0, pending: 0 }]));
for (const s of systems) for (const c of COLS) { const p = s.cols[c].value === '待补'; (p ? cnt.pending++ : cnt.filled++); byCol[c][p ? 'pending' : 'filled']++; }
writeFileSync(`${OUT}/乙6a-系统登记六列.json`, JSON.stringify({ _说明: '乙-6a：系统登记六列由各卷 §3.1–§3.3 等卷文转录；脚本 脚本/卷十一/extract-systems-six.mjs 生成，勿手改。每格带 src（出处节号）；value 为"待补"表示卷文没有写成条目，不猜。', counts: { total: systems.length * COLS.length, ...cnt, byCol }, systems }, null, 1) + '\n');

const cell = x => {
  if (x.value === '待补') return '待补';
  const v = x.value; const n = typeof v === 'string' ? 1 : Array.isArray(v) ? v.length : Object.keys(v).length;
  const brief = typeof v === 'string' ? v : Array.isArray(v) ? v.slice(0, 3).map(i => (typeof i === 'string' ? i : i.module ? `${i.item}→${i.module}` : i.item)).join('；') + (n > 3 ? '…' : '') : '';
  return `${n} 项（${x.src}）${brief ? '：' + brief.replace(/\|/g, '/') : ''}`;
};
const md = [
  '| 系统键 | predicates | writers | sources | sinks | entryJudges | view（卷文转录） |', '|---|---|---|---|---|---|---|',
  ...systems.map(s => `| ${s.system} | ${COLS.map(c => cell(s.cols[c])).join(' | ')} |`), '',
];
writeFileSync(`${OUT}/乙6a-系统登记六列.md`, md.join('\n'));
console.log(`系统 ${systems.length} 个，六列共 ${systems.length * COLS.length} 格：转录 ${cnt.filled}、待补 ${cnt.pending}`);
console.log(COLS.map(c => `${c} 转录 ${byCol[c].filled}/待补 ${byCol[c].pending}`).join('；'));
