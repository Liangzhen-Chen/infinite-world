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
  // ⑤ §3.1 里以"谓词："开头的一行列出的函数（卷二十三 `isWork(itemRef)` …）；⑥ 标题含"谓词"的 §3.1 表：格里写"`f(…)` 谓词"的取 f，说明格以"谓词"结尾（"钉住的唯一谓词"）的取该行首格的函数；文件取该行写明的 .mjs
  const got = [];
  if (pl) for (const t of bt(pl)) if (t.includes('(')) { const n = fnName(t); if (n) got.push(n); }
  if (!got.length && s1 && s1.title.includes('谓词')) for (const tb of tablesOf(s1.body)) for (const r of tb.rows) {
    const mod = r.map(modOf).find(x => x.length)?.[0] ?? null;
    let n = null;
    for (const c of r.slice(1)) { const m = c.match(/`([A-Za-z_]\w*)\([^`]*\)`\s*谓词/); if (m) { n = m[1]; break; } }
    if (!n && r.slice(1).some(c => /谓词$/.test(c.replace(/[。*\s]/g, '')))) n = fnName(bt(r[0])[0] ?? '');
    if (n) got.push(mod ? `${mod}#${n}` : n);
  }
  if (got.length) return { value: uniq(got), src: `${sys.volume} §3.1` };
  return null;
}
// ---- writers 的整类取法（李白 11-15 18:50 第 1 条：只收"本系统写"的路径，用路径不用函数名；不按系统名、行号、卷特判）----
// 取自各卷 §3.2、§3.3 里标题含"写"的节：① 节里第一张表之前的列表与段落（卷二十七的列表写法、卷十六"只持有 `state.bestiary.named` 的写权（bestiary.mjs …）"）；② 写者表。
// 写者认定（逐个写者栏，表头有多个写者栏的逐栏找）：栏里按顶层"；""。"分句，取第一个满足下列各条的模块——
//   a. 同一分句里模块之前没有写别卷卷名（"卷十的写回器 `worldgen-writeback.mjs`""卷十九 `construction.mjs`"是别卷的），模块紧后的括注也不写"卷X声明/登记的"；
//   b. 模块前面不是"经"（"原语执行器经 `kernel/dimension-writers.mjs`"是通道，写者是执行器）；
//   c. 分句（去掉括注）不含明写不写或只提交的话：只提交、只产、只交、只出、只发、只登记、只经…提交、不自己写、不直接写、本卷不写、不写状态、是唯一提交者、经卷X、经账本；括注写"本卷不写"的也算；
//   d. 全书别处没有把它写成别卷的模块（"卷十九的 `facilities.mjs`"），即全书"卷X(登记|声明)?的 `m`""卷X `m`"写法登记的归属卷里没有本卷时不收。
//   栏里没有这样的模块、但第一分句是"本卷的…写者"（卷二十四"本卷的实例写者（唯一）"）的，记为本卷写者、文件未写。
// 路径认定：只取路径栏第一句（顶层"。"之前）；按顶层"；"分句，含"调""不直接写""不写""只向""不是"的分句不取（那是调用或明写不写）；
//   取分句里括注以外的反引号路径，整句括注外一条都没有时才取括注里的（卷十九建行一行的维度名单在括注里）；
//   路径须以字母开头，不含"("（函数），不是 .mjs 文件，不是小写下划线代号（comp_portable 一类），后面不紧跟"种类、族、组件、材料、代号、动词、条目、句柄"；带类型的写法只取类型前的路径（`stationFold.<建筑>.{daily: …}` 取 `stationFold.<建筑>`，`{culture: …}`、`lieId: EventId` 不取）。
//   路径紧后同一分句里写了模块的（卷十四"`growth.<person>` 的经验（growth.mjs）"），归那个模块，该模块也须过 a–d；否则归该行写者。
// 路径栏没有路径的行（只有文字：迁移行文件、从业边的建立与解除）不转。整节没有一条，而节里写明没有写者（"没有任何写者""不拥有任何状态键""无运行期写者"或节首"无。"）的转为 0 项；其余待补。
const VOLSRC = CFG.volCode.replace(/^\^|\$$/g, '');
const MODOWN = new Map(); // 模块 → Set(全书写明的归属卷)
{ const re = new RegExp('(' + VOLSRC + ')(?:登记的|声明的|的)?\\s*`?([A-Za-z0-9_./-]+\\.mjs)', 'g');
  for (const f of files) for (const l of lin(f.match(new RegExp(CFG.volCode))[0])) for (const m of l.matchAll(re)) for (const k of [m[2], m[2].slice(m[2].lastIndexOf('/') + 1)]) (MODOWN.get(k) ?? MODOWN.set(k, new Set()).get(k)).add(m[1]); }
const ownedElsewhere = (vol, m) => { const s = new Set([...(MODOWN.get(m) ?? []), ...(MODOWN.get(m.slice(m.lastIndexOf('/') + 1)) ?? [])]); return s.size > 0 && !s.has(vol); };
// 顶层切分与去括注（括号、反引号内不切）
function splitTop(s, seps) {
  const out = []; let d = 0, tick = false, cur = '';
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (!tick) { if (ch === '（' || ch === '(') d++; else if ((ch === '）' || ch === ')') && d > 0) d--; }
    if (!tick && !d && seps.includes(ch)) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur); return out.filter(x => x.trim());
}
function parenParts(s) { // [{outer: 去括注文本, inner: [括注内容…]}]
  let d = 0, tick = false, outer = '', inner = [], cur = '';
  for (const ch of s) {
    if (ch === '`') tick = !tick;
    if (!tick && (ch === '（' || ch === '(')) { if (d === 0) { cur = ''; outer += '\u0001'; d++; continue; } d++; }
    else if (!tick && (ch === '）' || ch === ')') && d > 0) { d--; if (d === 0) { inner.push(cur); continue; } }
    if (d) cur += ch; else outer += ch;
  }
  return { outer: outer.replace(/\u0001/g, ''), marked: outer, inner };
}
const WNEG = new RegExp('只(?:提交|产|交|出|发|登记)|只经[^，；。]*提交|不自己写|不直接写|本卷不写|不写状态|是唯一提交者|经(?:' + VOLSRC + '|账本)');
const VOL_ANY = new RegExp(VOLSRC, 'g');
const otherVolIn = (s, vol) => [...s.matchAll(VOL_ANY)].some(m => m[0] !== vol);
function ownModuleIn(ctx, vol, trailing) { // ctx：一个分句（去括注）；trailing：模块 → 紧后括注
  for (const m of modOf(ctx)) {
    const before = ctx.slice(0, ctx.indexOf(m));
    if (otherVolIn(before, vol) || /经\s*`?$/.test(before) || WNEG.test(ctx) || ownedElsewhere(vol, m)) continue;
    const t = trailing.get(m) ?? ''; if (/本卷不写|不自己写|只(?:提交|产)/.test(t) || new RegExp('(' + VOLSRC + ')(?:声明|登记)的').test(t) && otherVolIn(t, vol)) continue;
    return m;
  }
  return null;
}
function trailingParens(s) { const map = new Map(); for (const m of s.matchAll(/([A-Za-z0-9_./-]+\.mjs)`?\s*[（(]([^）)]*)/g)) if (!map.has(m[1])) map.set(m[1], m[2]); return map; }
function writerOf(cell, vol) {
  const cls = splitTop(cell, '；。'); const tr = trailingParens(cell);
  for (const cl of cls) {
    const pp = parenParts(cl);
    const m = ownModuleIn(pp.outer, vol, tr); if (m) return m;
    if (!modOf(pp.outer).length) for (const inn of pp.inner) for (const sub of splitTop(inn, '；，')) { const x = ownModuleIn(sub, vol, tr); if (x) return x; }
  }
  const c0 = parenParts(cls[0] ?? '').outer.trim();
  return /^本卷的[^，；。]*写者/.test(c0) && !WNEG.test(c0) ? 'SELF' : null;
}
const CODE_AFTER = /^\s*(?:种类|族|组件|材料|代号|动词|条目|句柄)/;
function pathTok(t, after) {
  let p = t.trim();
  if (p.includes(':')) { p = p.slice(0, p.indexOf('{')).replace(/\.$/, ''); if (!p || p.includes(':')) return null; }
  if (!/^[A-Za-z_$]/.test(p) || p.includes('(') || /\.mjs$/.test(p) || /^[a-z][a-z0-9]*_[a-z0-9_]+$/.test(p) || CODE_AFTER.test(after)) return null;
  return p;
}
const PNEG = /调|不直接写|不写|只向|不是/;
// 一段文字（路径栏第一句，或节首的一句话）里的路径，配上紧后的模块；fallback 是该行写者
function pathsIn(text, vol, fallback) {
  const out = []; const sent = splitTop(text, '。')[0] ?? '';
  const cls = splitTop(sent, '；').filter(cl => !PNEG.test(parenParts(cl).outer));
  const take = inParen => {
    for (const cl of cls) {
      const pp = parenParts(cl); const src = inParen ? pp.inner.join('；') : pp.outer;
      for (const m of src.matchAll(/`([^`]+)`/g)) {
        const p = pathTok(m[1], src.slice(m.index + m[0].length)); if (!p) continue;
        const rest = cl.slice(cl.indexOf('`' + m[1] + '`') + m[1].length + 2); const nm = modOf(rest)[0];
        let mod = fallback;
        if (nm) { const ok = ownModuleIn(nm, vol, new Map()); if (!ok) continue; mod = ok; }
        if (mod === null || mod === undefined) continue;
        out.push({ p, mod: mod === 'SELF' ? null : mod });
      }
    }
  };
  take(false); if (!out.length) take(true);
  return out;
}
const W_NONE = /没有任何写者|不拥有任何状态键|无运行期写者/;
function colWriters(sys) {
  const out = []; const srcs = []; const seen = new Set();
  // 一行（或节首一句）一条条目：同一行里按所归模块分条
  const push = (rows, no) => { let used = false; const by = new Map();
    for (const r of rows) { const k = r.mod ?? ''; (by.get(k) ?? by.set(k, []).get(k)).push(r.p); }
    for (const [mod, ps] of by) { const item = uniq(ps).join('、'); const key = item + '→' + mod; if (seen.has(key)) continue; seen.add(key); out.push({ item, module: mod || null, kind: 'path' }); used = true; }
    if (used) srcs.push(`${sys.volume} §${no}`); };
  for (const no of ['3.2', '3.3']) {
    const sec = section(sys.volume, no); if (!sec || !sec.title.includes('写')) continue;
    // ① 第一张表之前的列表与段落
    const t0 = sec.body.findIndex(l => /^\|/.test(l));
    for (const l of sec.body.slice(0, t0 < 0 ? sec.body.length : t0)) {
      if (!l.trim() || /^#/.test(l)) continue;
      for (const s of splitTop(l.replace(/^\s*[-*]\s+/, ''), '。；')) if (!WNEG.test(parenParts(s).outer)) push(pathsIn(s, sys.volume, undefined), no);
    }
    // ② 写者表
    for (const tb of tablesOf(sec.body)) {
      const head = tb.head.map(h => h.replace(/`/g, ''));
      if (head.some(h => h.includes('怎样请求'))) continue;
      let wis = head.map((h, i) => (/写者|所在模块|模块（系统）/.test(h) ? i : -1)).filter(i => i >= 0); if (!wis.length && head[0] === '文件') wis = [0];
      const pi = head.findIndex(h => /^(状态路径|状态|路径|写什么|被写的东西|做什么)/.test(h));
      if (!wis.length || pi < 0) continue;
      for (const r of tb.rows) {
        let w = null; for (const wi of wis) { w = writerOf(r[wi] ?? '', sys.volume); if (w) break; }
        if (w) push(pathsIn(r[pi] ?? '', sys.volume, w), no);
      }
    }
  }
  if (out.length) return { value: out, src: uniq(srcs).join('、') };
  for (const no of ['3.2', '3.3']) {
    const sec = section(sys.volume, no); if (!sec || !sec.title.includes('写')) continue;
    const r = noneIn(sec, sys.volume, no); if (r) return r;
    if (sec.body.some(l => W_NONE.test(l.replace(/[*\s]/g, '')))) return { value: [], src: `${sys.volume} §${no}（本卷写明无）` };
  }
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
