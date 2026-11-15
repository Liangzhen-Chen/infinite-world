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

// 本卷在该节明写"无"（节的第一行写"无。""不新增""本卷不定义任何…""本卷不导出任何…""无运行期写者"）：转录为空表，不当作待补
const NONE_RE = /^(?:无[。，：]|不新增|本卷不(?:导出|定义)任何|无运行期写者)/;
const isNoneLine = l => NONE_RE.test(l.replace(/[*\s]/g, ''));
function noneIn(sec, vol, no) {
  const first = sec.body.find(l => l.trim());
  return first && isNoneLine(first) ? { value: [], src: `${vol} §${no}（本卷写明无）` } : null;
}
// ---- 各列的转录 ----
const reg = readFileSync(`${DIR}/${CFG.registry.file}`, 'utf8').split(/\r?\n/);
const regVol = CFG.registry.file.match(new RegExp(CFG.volCode))[0];
const viewOf = new Map();
{ const s = reg.findIndex(l => /^### 2\.1 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  for (let i = s; i < e; i++) { if (!/^\|/.test(reg[i])) continue; const c = cells(reg[i]); if (!/^\d+$/.test(c[0] ?? '')) continue;
    const k = (c[1] ?? '').match(/^([a-z_]+)/), en = (c[2] ?? '').match(/`([A-Za-z_]\w*)/); if (k && en) viewOf.set(k[1], en[1]); } }
// view：只有一张表的系统，取该表的读入口（卷二 §2.1）在本卷 §3.1 表里的"所在文件"栏；多表系统卷文没写系统的 view 是哪一个，不推断
function colView(sys) {
  if (sys.tables.length !== 1) return null;
  const name = viewOf.get(sys.tables[0]); if (!name) return null;
  const sec = section(sys.volume, '3.1'); if (!sec) return null;
  for (const tb of tablesOf(sec.body)) for (const r of tb.rows) {
    if (fnName(bt(r[0])[0] ?? '') !== name) continue;
    const m = r.slice(1).map(modOf).find(x => x.length);
    if (m) return { value: `${m[0]}#${name}`, src: `${sys.volume} §3.1` };
  }
  return null;
}
// 卷二 §2.7 JSON 示例登记的系统：解析示例里的对象
function jsonExample(key) {
  const txt = reg.join('\n'); const i = txt.indexOf('"' + key + '": {'); if (i < 0) return null;
  let j = txt.indexOf('{', i), d = 0, k = j;
  for (; k < txt.length; k++) { if (txt[k] === '{') d++; else if (txt[k] === '}') { d--; if (!d) break; } }
  const raw = txt.slice(j, k + 1).split('\n').map(l => l.replace(/\s\/\/.*$/, '')).join('\n');
  try { return JSON.parse(raw); } catch { return null; }
}
const jsonKeys = uniq(reg.map(l => (l.match(/^\s{1,2}"(sys\.[a-z0-9_]+)": \{/) ?? [])[1]).filter(Boolean));
const jsonEx = new Map(jsonKeys.map(k => [k, jsonExample(k)]).filter(([, v]) => v));
// 别的系统已登记的谓词（卷二 §2.5 等）：别卷 import 它们，不算本卷导出
const importedPreds = new Set([...jsonEx.values()].flatMap(ex => (ex.predicates ?? []).map(p => p.slice(p.indexOf('#') + 1))));
// predicates：① §3.2 标题含"谓词"的节：列表行与表格首格；② 没有条目时取第一段第一句里的反引号标识符（去掉别的系统已登记的）；③ 明写"无"的为空表；④ §3.1 里以"谓词："开头的一行明写"无"的为空表
function colPredicates(sys) {
  const sec = section(sys.volume, '3.2');
  if (sec && sec.title.includes('谓词')) {
    const mods = uniq(modOf(sec.body.join('\n')));
    const names = [];
    for (const l of sec.body) { const m = l.match(/^- `([A-Za-z_][A-Za-z0-9_]*)\(/); if (m) names.push({ name: m[1], file: mods.length === 1 ? mods[0] : null }); }
    for (const tb of tablesOf(sec.body)) for (const r of tb.rows) { const n = fnName(bt(r[0])[0] ?? ''); if (n) { const mm = r.slice(1).map(modOf).find(x => x.length); names.push({ name: n, file: mm?.[0] ?? (mods.length === 1 ? mods[0] : null) }); } }
    if (!names.length) {
      const para = sec.body.find(l => l.trim() && !/^[-|]/.test(l.trim()));
      if (para && !isNoneLine(para)) {
        const sentence = para.slice(0, para.indexOf('。') >= 0 ? para.indexOf('。') : para.length);
        for (const t of bt(sentence)) { const n = fnName(t.replace(/\(.*$/, '')); if (n && /^[A-Za-z_]\w*$/.test(n) && !importedPreds.has(n)) names.push({ name: n, file: mods.length === 1 ? mods[0] : null }); }
      }
    }
    if (names.length) return { value: uniq(names.map(x => (x.file ? `${x.file}#${x.name}` : x.name))), src: `${sys.volume} §3.2`, fileUnknown: names.filter(x => !x.file).length };
    const none = noneIn(sec, sys.volume, '3.2'); if (none) return none;
  }
  const s1 = section(sys.volume, '3.1');
  const pl = s1?.body.find(l => /^谓词[：:]/.test(l.trim()));
  if (pl && isNoneLine(pl.trim().replace(/^谓词[：:]/, ''))) return { value: [], src: `${sys.volume} §3.1（本卷写明无）` };
  return null;
}
// writers：§3.2 或 §3.3 里标题含"写"的节的写者表（表头有"写者""所在模块"或"文件"栏、有"状态/路径/写什么"栏；表头有"怎样请求"的表是别系统的写者，主体段、记录类的表是去留登记，都不收）。
// 只收本卷的写者：写者栏写"卷X的…"（X 不是本卷）或"本卷不写"的行不收；没有 .mjs 的行只收写"本卷…"的。
// 条目取路径栏里的反引号路径（去掉括注、函数签名与结构类型）；首格是函数的表取"写什么"栏里带点或方括号的路径，没有路径的写文字。
function colWriters(sys) {
  const out = []; const srcs = []; const seen = new Set();
  const VOLRE = new RegExp('(' + CFG.volCode.replace(/^\^|\$$/g, '') + ')的');
  for (const no of ['3.2', '3.3']) {
    const sec = section(sys.volume, no); if (!sec || !sec.title.includes('写')) continue;
    for (const tb of tablesOf(sec.body)) {
      const head = tb.head.map(h => h.replace(/`/g, ''));
      if (head.some(h => h.includes('怎样请求')) || head.some(h => h.includes('主体段') || h.includes('记录类'))) continue;
      let wi = head.findIndex(h => /写者|所在模块|模块（系统）/.test(h)); if (wi < 0 && head[0] === '文件') wi = 0;
      const pi = head.findIndex(h => /^(状态路径|状态|路径|写什么)/.test(h));
      if (wi < 0 || pi < 0) continue;
      const pathFirst = pi === 0;
      let used = false;
      for (const r of tb.rows) {
        const wc = r[wi] ?? '';
        const other = wc.match(VOLRE); if ((other && other[1] !== sys.volume) || wc.includes('本卷不写')) continue;
        const mods = modOf(wc);
        if (!mods.length && !wc.startsWith('本卷')) continue;
        const pc = (r[pi] ?? '').replace(/（[^）]*）/g, '');
        let toks = bt(pc).filter(t => /^[A-Za-z_]/.test(t) && !/^[A-Za-z_]\w*\s*:/.test(t) && !t.includes('('));
        if (!pathFirst) toks = toks.filter(t => /[.\[]/.test(t));
        let item, kind = 'path';
        if (toks.length) item = uniq(toks).join('、');
        else if (!pathFirst && mods.length && pc.replace(/`/g, '').trim()) { item = pc.replace(/`/g, '').trim(); kind = 'text'; }
        else continue;
        const key = item + '→' + (mods[0] ?? ''); if (seen.has(key)) continue; seen.add(key);
        out.push({ item, module: mods[0] ?? null, kind }); used = true;
      }
      if (used) srcs.push(`${sys.volume} §${no}`);
    }
  }
  if (out.length) return { value: out, src: uniq(srcs).join('、') };
  for (const no of ['3.2', '3.3']) { const sec = section(sys.volume, no); if (sec && sec.title.includes('写')) { const r = noneIn(sec, sys.volume, no); if (r) return r; } }
  return null;
}
// sources、sinks：登记表里首格的 `src_…`、`sink_…`（一格里并列的多个代号都收）；系统是该卷对应的系统
function colSrcSink(sys, prefix) {
  const ls = lin(sys.volume); const out = []; let head = null;
  ls.forEach(l => {
    if (/^#{3,4} /.test(l)) head = l.match(/^#+ (\S+)/)[1];
    if (!/^\| `(?:src|sink)_/.test(l)) return;
    for (const m of cells(l)[0].matchAll(/`(src|sink)_([A-Za-z0-9_]+)`/g)) if (m[1] === prefix) out.push({ code: `${m[1]}_${m[2]}`, sec: head });
  });
  return out.length ? { value: uniq(out.map(x => x.code)), src: `${sys.volume} §${uniq(out.map(x => x.sec))[0]}` } : null;
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
// 卷二 §2.7 JSON 示例登记的全部系统，一律同一判法：示例里写了的字段取示例（数据登记优先），示例没写的字段保持卷文转录或待补；
// 示例里的系统不在 sysJ 时，归属卷取登记卷（JSON 所在的卷）
const SRC = '卷二 §2.7 JSON 示例';
for (const [key, ex] of jsonEx) {
  let r = systems.find(x => x.system === key);
  if (!r) { r = { system: key, volume: regVol, cols: Object.fromEntries(COLS.map(c => [c, { value: '待补' }])) }; systems.push(r); }
  for (const c of COLS) {
    if (!(c in ex)) continue;
    if (c === 'writers') r.cols.writers = { value: ex.writers.map(w => ({ item: w, module: null, kind: 'path' })), src: SRC };
    else r.cols[c] = { value: ex[c], src: SRC };
  }
}
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
