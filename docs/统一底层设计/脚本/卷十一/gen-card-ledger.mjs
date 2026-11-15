// 乙-5：生成器出卡账 v0 与卡族读数（卷十一 §2.2 卡记录、R11-2.5、R11-3.1–3.5、R11-3.12、R11-3.14、R11-7.1、R11-7.2）。
// 输入（只读）：脚本/卷十一/migrows-input.json（乙-4 H1）、审查/脚本输出/乙4补-systems补全.json（systems 补全表）、
//   乙4-import图-边表.tsv、乙4-entryCallerFiles.json、卷二（表主、§2.1 读入口、§5 必填引用、§6.12 齐全率键）、卷零 §1、卷十二 §2.11、各卷正文的 `X.after = [..]` 与断言定义。
// 只读、确定性、不联网；不执行被读代码；不碰 F:/dnd/tools、server-plugin、extension（只读目录索引做锚点解析，与乙-4 同口径）。
// 卡全部由数据派生，不手写卡，不按行号或条目号写特判。推不出的字段在卡的 pending 里写明，不替它定值。
// 用法：node gen-card-ledger.mjs      输出：审查/脚本输出/卡账-v0.json、卡账-v0-摘要.md
import { readFileSync, readdirSync, writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PLACEHOLDER, receivingVolume } from './object-rules.mjs';
import { scanVolume, TOK as ID_TOK, SHORT_RE } from './id-defs.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url)).replace(/\\/g, '/').replace(/\/$/, '');
const CFG = JSON.parse(readFileSync(`${HERE}/gen-卷十一-inputs.json`, 'utf8'));
const OUT = `${HERE}/../../审查/脚本输出`.replace(/\\/g, '/');
const DIR = CFG.dir;
const REPO = 'F:/dnd';
const MAXFILES = 25; // rules.migration.maxFiles（卷十一 §2.5）
const BASELINE = 'd54c89a3';
const cells = l => l.split(/(?<!\\)\|/).slice(1, -1).map(x => x.trim());
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const uniq = a => [...new Set(a)];
const rd = f => readFileSync(f, 'utf8');
const VOL = new RegExp(CFG.volCode);

// ================= 输入 =================
const mig = JSON.parse(rd(`${HERE}/migrows-input.json`));
const rows = mig.rows.filter(r => !r.aliasOf);
const sysJ = JSON.parse(rd(`${OUT}/乙4补-systems补全.json`)).systems;
// 系统登记项六列的卷文转录（乙-6a）：还待补的列
const sixJ = JSON.parse(rd(`${OUT}/乙6a-系统登记六列.json`));
const sixPending = new Map(sixJ.systems.map(s => [s.system, Object.keys(s.cols).filter(c => s.cols[c].value === '待补')]));
const h2 = JSON.parse(rd(`${OUT}/乙4-entryCallerFiles.json`));
const edges = rd(`${OUT}/乙4-import图-边表.tsv`).split('\n').slice(1).filter(Boolean).map(l => l.split('\t'));
const importers = new Map();
for (const [a, b] of edges) (importers.get(b) ?? importers.set(b, new Set()).get(b)).add(a);
const volFiles = readdirSync(DIR).filter(f => new RegExp(CFG.volFile).test(f)).sort();
const volText = new Map(); // 卷代号 → 行数组（卷零、卷一等）
for (const f of volFiles) volText.set(f, rd(`${DIR}/${f}`).split(/\r?\n/));
const volOfFile = f => { const m = f.match(VOL); return m ? m[0] : null; };
const regText = rd(`${DIR}/${CFG.registry.file}`);
const reg = regText.split(/\r?\n/);

// ---- 表代号（卷二各表节，登记次序）与表主 ----
const tableList = [];
for (const l of reg) if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) tableList.push(m[1]); }
const tables = new Set(tableList);
const cov = rd(`${DIR}/${CFG.coverage.file}`).split(/\r?\n/);
const seqVol = new Map();
{ const s = cov.findIndex(l => l.startsWith(CFG.coverage.addVol)); let e = cov.findIndex((l, i) => i > s && /^## /.test(l)); if (e < 0) e = cov.length;
  let head = null;
  for (let i = s + 1; i < e; i++) {
    const l = cov[i];
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c.map(x => x.replace(/`/g, '')); continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const qi = head.indexOf(CFG.fields.seq), vi = head.indexOf(CFG.fields.volCol);
    if (qi < 0 || vi < 0) continue;
    const m = (c[vi] ?? '').match(VOL);
    if (/^\d+$/.test(c[qi]) && m) seqVol.set(+c[qi], m[0]);
  } }
const tableOwner = new Map(); // 表 → 卷
{ let cur = null;
  for (const l of reg) {
    if (/^#+ /.test(l)) { cur = null; if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableOwner.set(cur, null); } } continue; }
    if (cur && l.startsWith('- `' + CFG.fields.owner + '`')) { const m = l.match(/\d+/); if (m) tableOwner.set(cur, seqVol.get(+m[0]) ?? null); }
  } }

// ---- 表的必填引用（卷二 §5 各表节的维度表：类型栏写 ref <表>，必填栏为 always）----
const tableRefs = new Map(); // 表 → Set(被引用表)
{ let cur = null;
  for (const l of reg) {
    if (/^#+ /.test(l)) { cur = null; if (l.startsWith(CFG.registry.tables)) { const m = l.match(/`([a-z_]+)`/); if (m) { cur = m[1]; tableRefs.set(cur, new Set()); } } continue; }
    if (!cur || !/^\|/.test(l)) continue;
    const c = cells(l);
    if (c.length < 3 || c[2] !== 'always') continue;
    for (const m of c[1].matchAll(/\bref ([a-z_]+)\b/g)) if (tables.has(m[1]) && m[1] !== cur) tableRefs.get(cur).add(m[1]);
  } }

// ---- 卷二 §2.1 入口清单：表 → 读入口名 ----
const viewOf = new Map();
{ const s = reg.findIndex(l => /^### 2\.1 /.test(l)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  for (let i = s; i < e; i++) {
    if (!/^\|/.test(reg[i])) continue;
    const c = cells(reg[i]);
    if (!/^\d+$/.test(c[0] ?? '')) continue;
    const k = (c[1] ?? '').match(/^([a-z_]+)/), en = (c[2] ?? '').match(/`([A-Za-z_]\w*)/);
    if (k && en && tables.has(k[1])) viewOf.set(k[1], en[1]);
  } }

// ---- 齐全率下限键（卷二 §6.12 键表）按表分配：键名以表代号的驼峰式开头 ----
const dimKeys = [...regText.matchAll(/^\| `(rules\.dimfill\.[A-Za-z0-9]+)` \|/gm)].map(m => m[1]);
const camel = t => t.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const dimKeysOf = t => dimKeys.filter(k => k.slice('rules.dimfill.'.length).toLowerCase().startsWith(camel(t).toLowerCase()));

// ---- 编号定义索引（乙-6b，李白 11-15 18:50 第 1 条）：通用识别规则在 id-defs.mjs（写法清单见 审查/脚本输出/乙6b-编号写法清单.md）----
// 定义位（表格首格、列表项开头含"X式："前缀、加粗段首）上的编号，按所在标题与表首列判性质；accept 只取"验收类"（断言号、扫描条代号、不变量号，卷十一 §2.2）。
const defsOf = new Map(); // 卷 → [定义]
for (const [f, ls] of volText) { const v = volOfFile(f); if (v) defsOf.set(v, scanVolume(ls, v).map(d => ({ ...d, file: f }))); }
const defined = new Map(); // 卷 → Set(验收类编号)
const assertText = new Map(); // 卷 → [验收类定义行]
for (const [v, ds] of defsOf) for (const d of ds) {
  if (d.nature !== '验收类') continue;
  (defined.get(v) ?? defined.set(v, new Set()).get(v)).add(d.tok);
  (assertText.get(v) ?? assertText.set(v, []).get(v)).push(d);
}
// 卷一 §9 "沿用 I1–I32（架构 02）"：区间写法定义区间内的不变量编号
for (const [f, ls] of volText) { const v = volOfFile(f); for (const l of ls) { const m = l.match(/沿用 I(\d+)[–-]I(\d+)/); if (m && v) for (let i = +m[1]; i <= +m[2]; i++) (defined.get(v) ?? defined.set(v, new Set()).get(v)).add('I' + i); } }
// 编号里没有卷序号的（A-1、T-1、I33）只在本卷有效，写成"卷名:编号"
const bareTok = t => !/^[A-Z][A-Za-z]{0,3}?[0-9]+[a-z]?-/.test(t);
const qual = (vol, t) => (bareTok(t) ? `${vol}:${t}` : t);
// 补验收判据（乙-6b）：卡的行落点没写编号时，取对象所在卷的验收类编号：定义行提到本卡对象代号、要接或上线的入口名、文件名的
function assertionsFor(vol, objCode, entryNames) {
  const keys = [objCode, ...entryNames].filter(Boolean);
  return uniq((assertText.get(vol) ?? []).filter(a => keys.some(k => a.text.includes('`' + k + '`') || a.text.includes('`' + k + '('))).map(a => qual(vol, a.tok))).sort();
}
const defIdx = new Map(); // 编号（没有卷序号的写"卷名:编号"）→ 它的全部定义（各种性质）
for (const [v, ds] of defsOf) for (const d of ds) { const k = qual(v, d.tok); (defIdx.get(k) ?? defIdx.set(k, []).get(k)).push(d); }
const dimKeySet = new Set(dimKeys);
const tokRe =new RegExp('(?<![A-Za-z0-9_])(' + ID_TOK + ')(?![0-9A-Za-z])', 'g');
const splitQ = tok => { const i = tok.indexOf(':'); return i < 0 ? [null, tok] : [tok.slice(0, i), tok.slice(i + 1)]; };
// 编号在所指卷里有定义：带卷序号的在任一卷有定义；不带卷序号的在所写卷名下有定义
function inIndex(idx, tok) {
  const [home, bare] = splitQ(tok);
  if (home) return idx.get(home)?.has(bare) ?? false;
  for (const s of idx.values()) if (s.has(bare)) return true;
  return false;
}
const acceptOk = tok => dimKeySet.has(tok) || inIndex(defined, tok);

// ---- 卷十一自己的扫描条（清扫卡的判据：全部扫描）----
const s11 = [...(defined.get('卷十一') ?? [])].filter(x => /^S11-/.test(x)).sort((a, b) => cmp(+a.slice(4), +b.slice(4)));
// ---- 卷十二的门禁自身条目（卷十二 line：S12-1 至 S12-16 随门禁卡 G-1 至 G-3 进必过集合）----
const s12 = [...(defined.get('卷十二') ?? [])].filter(x => /^S12-\d+$/.test(x)).sort((a, b) => cmp(+a.slice(4), +b.slice(4)));
// ---- 门禁设施登记（卷十二 §2.11 登记表，登记次序）----
const gateFacilities = []; const gateOwner = new Map();
{ const f = volFiles.find(x => x.startsWith('卷十二-')); const ls = volText.get(f);
  const s = ls.findIndex(l => /^### 2\.11 /.test(l)); let e = ls.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = ls.length;
  let head = null;
  for (let i = s; i < e; i++) {
    if (!/^\|/.test(ls[i])) { head = null; continue; }
    const c = cells(ls[i]);
    if (!head) { head = c; continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const m = c[0].match(/^`([a-z][a-z0-9-]*)`/);
    if (m && head[0].includes('facCode')) { gateFacilities.push(m[1]); gateOwner.set(m[1], (c[3] ?? '').match(VOL)?.[0] ?? null); }
  } }

// ================= 仓库文件索引（只读，锚点解析，与乙-4 同口径）=================
const ROOTS = ['server-plugin', 'extension', 'tools', 'tests', 'world'];
const all = [];
function walk(rel) {
  for (const name of readdirSync(`${REPO}/${rel}`).sort()) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(`${REPO}/${r}`).isDirectory()) walk(r);
    else if (/\.(?:mjs|js|json)$/.test(name)) all.push(r);
  }
}
ROOTS.forEach(walk);
const byBase = new Map();
for (const f of all) { const b = f.slice(f.lastIndexOf('/') + 1); (byBase.get(b) ?? byBase.set(b, []).get(b)).push(f); }
const exact = new Set(all);
function resolveFile(spec) {
  if (/\*/.test(spec)) return { unresolved: true };
  if (exact.has(spec)) return { path: spec };
  const suf = all.filter(f => f.endsWith('/' + spec));
  if (suf.length === 1) return { path: suf[0] };
  if (suf.length > 1) return { ambiguous: suf };
  if (!spec.includes('/')) {
    const c = byBase.get(spec) ?? [];
    if (c.length === 1) return { path: c[0] };
    if (c.length > 1) {
      const sp = c.filter(f => f.startsWith('server-plugin/') || f.startsWith('extension/'));
      if (sp.length === 1) return { path: sp[0] };
      return { ambiguous: c };
    }
  }
  return { unresolved: true };
}
// 模块组（卷二 §2.7 的目录登记；不在任何模块组的 server-plugin 文件属规则层）
function groupOf(p) {
  if (p.startsWith('server-plugin/input/')) return 'inputEdge';
  if (p.startsWith('server-plugin/gate/')) return 'gate';
  if (p.startsWith('server-plugin/output-gate/')) return 'outputGate';
  if (p.startsWith('server-plugin/ai-gate/')) return 'aiGate';
  if (p.startsWith('server-plugin/textcore/')) return 'textcore';
  if (p.startsWith('extension/host/')) return 'host';
  if (p.startsWith('extension/textcore/')) return 'clientTextcore';
  if (p.startsWith('extension/')) return 'display';
  if (p.startsWith('server-plugin/kernel/')) return 'kernel';
  if (p.startsWith('server-plugin/')) return 'rules层';
  return p.split('/')[0];
}
const MODGROUPS = new Set(['kernel', 'inputEdge', 'display', 'gate', 'outputGate', 'aiGate', 'host', 'content-scripts', 'textcore', 'clientTextcore']);
const GATEFAC = new Set(gateFacilities);
const isRuntime = p => /^(server-plugin|extension)\//.test(p);
for (const r of rows) {
  r.res = [];
  for (const a of r.anchors) {
    const x = resolveFile(a.file);
    if (x.path) r.res.push({ path: x.path, lines: a.lines });
    else if (x.ambiguous) r.res.push({ ambiguous: x.ambiguous, raw: a.file, lines: a.lines });
    else r.res.push({ raw: a.file, lines: a.lines, unresolved: true });
  }
  r.files = uniq(r.res.filter(x => x.path).map(x => x.path)).sort();
  r.obj0 = r.targetObject.replace(/`/g, '').trim();
}

// ================= 对象体系 =================
const sysByKey = new Map(sysJ.map(s => [s.system, s]));
const sysOfVol = new Map(sysJ.map(s => [s.volume, s]));
// 系统键 → 系统：sysJ（乙-4 补）加上乙-6a 转录里有、sysJ 没有的系统（卷二 §2.7 JSON 示例登记的系统，如 sys.capacity）；不在生成器里造对象。
// 这类系统的归属卷、入口取乙-6a 转录里的值：入口 = 它的 predicates 的函数名（卷二 §2.7 说 view 与 predicates 是系统的读入口）。
for (const x of sixJ.systems) if (!sysByKey.has(x.system)) {
  const pv = Array.isArray(x.cols.predicates.value) ? x.cols.predicates.value : [];
  sysByKey.set(x.system, { system: x.system, volume: x.volume, tables: [], entries: pv.map(p => p.slice(p.indexOf('#') + 1)), entryCallerFiles: {}, defFiles: [], callerUnion: [], pending: [], fromSix: true });
}
const sysOfTable = new Map(); // 表 → 系统（tables 含它）
for (const s of sysJ) for (const t of s.tables) sysOfTable.set(t, s);
const vocabSet = new Set([...regText.matchAll(/([a-z][a-z0-9_]*)→`[a-z]+_`/g)].map(m => m[1]));

// 卷二 §6.11 文件级迁移表（R11-7.5，李白 18:50 第 2 条）：搬迁卡的文件集合与行只取这张表里落点对象为该模块组的行。
const moveRows = new Map(); // 编号 → {obj, files, dir}
const fileMoves = new Map(); // 现有文件 → [{obj, dir}]（表内次序）
{
  const s = reg.findIndex(l => l.startsWith(CFG.registry.filemoves)); let e = reg.findIndex((l, i) => i > s && /^#{2,3} /.test(l)); if (e < 0) e = reg.length;
  let head = null;
  for (let i = s + 1; i < e; i++) {
    const l = reg[i];
    if (!/^\|/.test(l)) { head = null; continue; }
    const c = cells(l);
    if (!head) { head = c; continue; }
    if (/^:?-{3}/.test(c[0])) continue;
    const ki = head.indexOf('编号'), fi = head.indexOf('现有文件'), di = head.indexOf('落点'), oi = head.indexOf('落点对象');
    if (ki < 0 || fi < 0 || di < 0 || oi < 0) continue;
    const obj = (c[oi] ?? '').replace(/`/g, '').trim();
    const dest = [...(c[di] ?? '').matchAll(/`([^`]+)`/g)].map(m => m[1]).find(t => t.includes('/'));
    const dir = !dest ? null : dest.endsWith('/') ? dest.slice(0, -1) : dest.slice(0, dest.lastIndexOf('/'));
    const files = [];
    for (const m of (c[fi] ?? '').matchAll(/`([^`]+\.(?:mjs|js))`/g)) { const x = resolveFile(m[1]); if (x.path) files.push(x.path); }
    moveRows.set(c[ki], { obj, files: uniq(files).sort(), dir });
    if (dir) for (const f of files) (fileMoves.get(f) ?? fileMoves.set(f, []).get(f)).push({ obj, dir });
  }
}
const isMoveRow = (r, code) => moveRows.get(r.rowKey)?.obj === code;

// 一个对象 = {kind, code, volume, sys}；表对象的系统 = 含它的系统；系统对象 = 无 tables 的系统；账本系统另处理
function tableObj(t) { return { kind: 'table', code: t, volume: tableOwner.get(t) ?? sysOfTable.get(t)?.volume ?? null, sys: sysOfTable.get(t) ?? null }; }
function sysObj(s) { return s.tables.length ? tableObj(s.tables[0]) : { kind: 'system', code: s.system, volume: s.volume, sys: s }; }
const objKey = o => `${o.kind}:${o.code}`;
// 迁移行 → 对象（落点对象六类 → 卡的四种对象）
function objectOfRow(r) {
  const o = r.obj0;
  if (PLACEHOLDER.has(o)) return null;
  if (tables.has(o)) return tableObj(o);
  if (sysByKey.has(o)) return sysObj(sysByKey.get(o));
  // 落点是模块组、却不在卷二 §6.11 文件级迁移表里的行，是"改调该组入口"，不是搬迁：不进搬迁卡，按下面"其余"一条归接收卷的对象
  if (MODGROUPS.has(o) && isMoveRow(r, o)) return { kind: 'module_group', code: o, volume: null, sys: null };
  if (GATEFAC.has(o)) return { kind: 'gate_facility', code: o, volume: null, sys: null };
  // 词表族条目、规则表键、其余：归来源卷的对象（有主表取第一张表，无主表取系统键）
  const rv = receivingVolume(r.target, r.volume, CFG.volCode);
  const s = sysOfVol.get(rv.vol) ?? sysOfVol.get(r.volume);
  return s ? sysObj(s) : null;
}
for (const r of rows) r.obj = objectOfRow(r);

// ================= 位置组（R11-2.4，口径 A）与接收对象（R11-2.5 第一步）=================
const parent = rows.map((_, i) => i);
const find = i => (parent[i] === i ? i : (parent[i] = find(parent[i])));
const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); };
{ const perFile = new Map();
  rows.forEach((r, i) => {
    for (const x of r.res) {
      if (x.ambiguous) continue;
      const key = x.path ?? 'raw:' + x.raw;
      const whole = x.lines.length === 0;
      const rs = whole ? [[1, 1e9]] : x.lines;
      for (const [lo, hi] of rs) (perFile.get(key) ?? perFile.set(key, []).get(key)).push({ i, lo, hi, whole });
    }
  });
  for (const L of perFile.values()) {
    L.sort((a, b) => a.lo - b.lo || a.hi - b.hi || a.i - b.i);
    for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length && L[b].lo <= L[a].hi; b++) if (L[a].i !== L[b].i && L[a].whole === L[b].whole) union(L[a].i, L[b].i);
  } }
const posGroups = new Map();
rows.forEach((r, i) => { const k = find(i); (posGroups.get(k) ?? posGroups.set(k, []).get(k)).push(r); });
const kindRank = { gate_facility: 0, module_group: 1, table: 2, system: 3 };
let nObjConflict = 0; const objConflicts = [];
const unassigned = [];
for (const [k, rs] of [...posGroups].sort((a, b) => a[0] - b[0])) {
  const cand = rs.filter(r => r.obj);
  const cs = uniq(cand.map(r => objKey(r.obj)));
  let pick = null;
  if (cs.length === 1) pick = cand[0].obj;
  else if (cs.length > 1) {
    // 第一步：同卷来源的行取其对象；仍不唯一时取首卡次序最前者（v0 以对象种类次序再代号升序近似，冲突单列）
    nObjConflict++;
    const cnt = new Map(); for (const r of cand) cnt.set(objKey(r.obj), (cnt.get(objKey(r.obj)) ?? 0) + 1);
    const sorted = [...new Map(cand.map(r => [objKey(r.obj), r.obj])).values()].sort((a, b) => cnt.get(objKey(b)) - cnt.get(objKey(a)) || kindRank[a.kind] - kindRank[b.kind] || cmp(a.code, b.code));
    pick = sorted[0];
    objConflicts.push({ rows: rs.map(r => r.rowKey), objs: cs, pick: objKey(pick) });
  }
  for (const r of rs) {
    r.posGroup = k;
    r.recvObj = pick;
    if (!pick) unassigned.push(r.rowKey);
  }
}

// ================= 账本系统（卷一 §6.5：母卡 LEDGER-1 与子卡）=================
// 账本所在的系统登记项：账本类迁移行的对象来源由卷六 §3.3 的系统登记表给出；本卷按数据取"卷六的系统登记项"（sys.economy）。
const ledgerSysKey = (() => { const s = sysOfVol.get('卷六'); return s ? s.system : null; })();

// ================= 消费者组（R11-3.4）=================
const objs = new Map(); // objKey → {obj, rows}
for (const r of rows) if (r.recvObj) (objs.get(objKey(r.recvObj)) ?? objs.set(objKey(r.recvObj), { obj: r.recvObj, rows: [] }).get(objKey(r.recvObj))).rows.push(r);
// 全部表与无主表系统也要有对象（没有迁移行的对象仍有首卡）
for (const t of tableList) { const o = tableObj(t); if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }
for (const s of sysByKey.values()) if (!s.tables.length) { const o = sysObj(s); if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }
// 门禁设施对象（登记表里每个设施）
for (const g of gateFacilities) { const o = { kind: 'gate_facility', code: g, volume: null, sys: null }; if (!objs.has(objKey(o))) objs.set(objKey(o), { obj: o, rows: [] }); }

function sliceFiles(files) {
  const byG = new Map();
  for (const f of uniq(files).sort()) { const g = groupOf(f); (byG.get(g) ?? byG.set(g, []).get(g)).push(f); }
  const groups = [];
  for (const g of [...byG.keys()].sort()) {
    const fs = byG.get(g);
    const mjs = fs.filter(f => f.endsWith('.mjs')), rest = fs.filter(f => !f.endsWith('.mjs'));
    const nSeg = Math.max(1, Math.ceil(mjs.length / MAXFILES));
    for (let s = 0; s < nSeg; s++) {
      const part = mjs.slice(s * MAXFILES, (s + 1) * MAXFILES);
      groups.push({ key: `${g}-${s + 1}`, mg: g, files: s === 0 ? [...part, ...rest].sort() : part });
    }
  }
  return groups.sort((a, b) => cmp(a.key, b.key));
}
function consumerFiles(entry) {
  const o = entry.obj;
  const c1 = uniq(entry.rows.flatMap(r => r.files.filter(isRuntime))).sort();
  const systems = o.kind === 'module_group' || o.kind === 'gate_facility' ? [] : o.kind === 'table' ? sysJ.filter(s => s.tables.includes(o.code)) : [o.sys];
  const c2 = uniq(systems.flatMap(s => s.callerUnion ?? [])).filter(isRuntime).sort();
  const c3 = uniq(systems.flatMap(s => (s.defFiles ?? []).flatMap(f => [...(importers.get(f) ?? [])]))).filter(isRuntime).sort();
  return { c1, c2, c3, all: uniq([...c1, ...c2, ...c3]).sort() };
}
for (const e of objs.values()) {
  e.cons = consumerFiles(e);
  if (e.obj.kind === 'module_group') e.groups = []; // 搬迁卡：下面按 R11-7.5 切段
  else if (e.obj.kind === 'gate_facility') e.groups = [];
  else e.groups = sliceFiles(e.cons.all);
}
// 搬迁卡切段（卷十一 R11-7.5，李白 11-15 18:22）：一组超过 rules.migration.maxFiles 个 .mjs 时拆成多张段卡，逐级细分，取第一个有数据的级别：
//   ① 消费者组（consumer_group）：文件现所在的模块组（卷二 §2.7 的模块组登记，R11-3.4 第一步）；
//   ② 目标子目录（target_subdir）：卷二 §6.11 文件级迁移表里该文件、落点对象为本组的行，其"落点"栏第一个路径所在目录；
//   ③ 路径升序（path_order）兜底：没有 ② 数据的文件，或同一子目录仍超上限，按路径升序每满上限切一段。
// 整类判：只看文件数与上述数据，不按组名或文件名特判。段号 segNo 按 ①键、②键（有子目录的在前、子目录名升序）、③段序升序编。
function relocateSegments(code, files) {
  const isM = f => f.endsWith('.mjs');
  const chunk = (fs, axis, tag, out) => { const m = fs.filter(isM), r = fs.filter(f => !isM(f)); const k = Math.max(1, Math.ceil(m.length / MAXFILES)); for (let s = 0; s < k; s++) out.push({ axis, tag: `${tag}#${s}`, files: [...m.slice(s * MAXFILES, (s + 1) * MAXFILES), ...(s === 0 ? r : [])] }); };
  if (uniq(files).filter(isM).length <= MAXFILES) return [{ key: `${code}-1`, mg: code, files: uniq(files).sort(), splitAxis: 'whole', segNo: 1 }]; // 不超上限：整组一张
  const segs = [];
  const byMG = new Map(); for (const f of uniq(files).sort()) { const g = groupOf(f); (byMG.get(g) ?? byMG.set(g, []).get(g)).push(f); }
  for (const g of [...byMG.keys()].sort()) {
    const fs = byMG.get(g);
    if (fs.filter(isM).length <= MAXFILES) { segs.push({ axis: 'consumer_group', tag: g, files: fs }); continue; }
    const bySub = new Map(), none = [];
    for (const f of fs) { const d = (fileMoves.get(f) ?? []).find(x => x.obj === code)?.dir; if (d) (bySub.get(d) ?? bySub.set(d, []).get(d)).push(f); else none.push(f); }
    for (const d of [...bySub.keys()].sort()) { const ds = bySub.get(d); if (ds.filter(isM).length <= MAXFILES) segs.push({ axis: 'target_subdir', tag: `${g}/${d}`, files: ds }); else chunk(ds, 'path_order', `${g}/${d}`, segs); }
    if (none.length) chunk(none, 'path_order', `${g}/~`, segs);
  }
  return segs.map((x, i) => ({ key: `${code}-${i + 1}`, mg: code, files: x.files.slice().sort(), splitAxis: x.axis, segNo: i + 1 }));
}
for (const e of objs.values()) if (e.obj.kind === 'module_group') e.groups = relocateSegments(e.obj.code, uniq([...moveRows.values()].filter(m => m.obj === e.obj.code).flatMap(m => m.files.filter(isRuntime))));

// ================= 行 → 卡（R11-2.5 第二步）=================
function groupIndexOf(e, row) { // 位置组的锚点文件落在哪个消费者组：取位置组内最小文件所在的组
  const fs = uniq(posGroups.get(row.posGroup).flatMap(r => [...r.files, ...(e.obj.kind === 'module_group' ? moveRows.get(r.rowKey)?.files ?? [] : [])].filter(isRuntime))).sort(); // 搬迁卡：§6.11 的行以"现有文件"栏为锚点
  if (!fs.length || !e.groups.length) return { idx: 0, straddle: false };
  const ids = uniq(fs.map(f => e.groups.findIndex(g => g.files.includes(f))).filter(i => i >= 0)).sort((a, b) => a - b);
  if (!ids.length) return { idx: 0, straddle: false };
  return { idx: ids[0], straddle: ids.length > 1 };
}
let nStraddle = 0;
for (const e of objs.values()) {
  e.byGroup = new Map();
  const seenPos = new Set();
  for (const r of e.rows) {
    const { idx, straddle } = groupIndexOf(e, r);
    if (straddle && !seenPos.has(r.posGroup)) { nStraddle++; }
    seenPos.add(r.posGroup);
    (e.byGroup.get(idx) ?? e.byGroup.set(idx, []).get(idx)).push(r);
  }
}

// ================= 读入口与上线 =================
const entryKey = (vol, name) => `${vol}:${name}`;
const entryRows = h2.entries.map(e => ({ vol: e.volume, sec: '§3.1', name: e.entry, callers: e.callerFiles ?? [] }));
// 每个系统的读入口；表的视图入口（卷二 §2.1）
const launchOwner = new Map(); // entryKey → 上线卡所属对象键
const leadObjOfSys = new Map(); // 系统键 → 领头对象（有表取 tables[0]，无表取系统本身）
for (const s of sysByKey.values()) leadObjOfSys.set(s.system, objKey(sysObj(s)));
const viewEntries = new Map(); // 表 → 入口记录
for (const t of tableList) {
  const name = viewOf.get(t); if (!name) continue;
  const own = tableOwner.get(t) ?? sysOfTable.get(t)?.volume;
  const hit = entryRows.find(e => e.name === name && e.vol === own) ?? entryRows.find(e => e.name === name);
  viewEntries.set(t, hit ?? { vol: own, sec: '§3.1', name, callers: [] });
}
const launchedBy = new Map(); // entryKey → 对象键
for (const [t, ent] of viewEntries) launchedBy.set(entryKey(ent.vol, ent.name), objKey(tableObj(t)));
for (const s of sysByKey.values()) for (const name of s.entries ?? []) {
  const k = entryKey(s.volume, name);
  if (!launchedBy.has(k)) launchedBy.set(k, leadObjOfSys.get(s.system));
}
const entryByKey = new Map(entryRows.map(e => [entryKey(e.vol, e.name), e]));
for (const sy of sysByKey.values()) for (const name of sy.entries ?? []) if (!entryByKey.has(entryKey(sy.volume, name))) entryByKey.set(entryKey(sy.volume, name), { vol: sy.volume, sec: sy.fromSix ? '§2.7' : '§3.1', name, callers: [] });
for (const ent of viewEntries.values()) if (!entryByKey.has(entryKey(ent.vol, ent.name))) entryByKey.set(entryKey(ent.vol, ent.name), ent);
const launchesOfObj = new Map();
for (const [k, ok] of launchedBy) (launchesOfObj.get(ok) ?? launchesOfObj.set(ok, []).get(ok)).push(k);

// ================= 卡 =================
const cards = [];
const FIRST_SEGS = ['seg_rows', 'seg_data', 'seg_readers', 'seg_delete'], FOLLOW_SEGS = ['seg_readers', 'seg_delete'];
const volName = v => v ?? null;
const isLedgerObj = e => e.obj.kind === 'system' && e.obj.code === ledgerSysKey || (e.obj.kind === 'table' && e.obj.sys && e.obj.sys.system === ledgerSysKey);
const entityKeyList = es => uniq(es).sort();

function newCard(base) {
  return Object.assign({
    cardId: '', cardKind: '', objectKind: null, objectCode: null, volume: null, phaseNo: null, groupKey: null, splitAxis: null, segNo: null,
    zeroRows: [], rowKeys: [], files: [], dataFiles: [], segs: [], entries: [], launches: [], retire: {}, accept: [],
    dependsOn: [], census: {}, testClass: {}, derivations: [], sortKeys: {}, state: 'drafted', approvals: [], mergeRef: '', fails: 0,
    pending: [],
  }, base);
}
const splitCode = fs => ({ code: fs.filter(f => f.endsWith('.mjs') || f.endsWith('.js')), data: fs.filter(f => f.endsWith('.json')) });
function entriesOfCard(e, files) {
  const set = new Map();
  const fset = new Set(files);
  // 卡只接本对象的入口：表接自己的读入口；系统级入口归领头对象（系统登记项的 tables[0]，无表的系统取它自己）的卡
  const own = e.obj.kind === 'table' ? sysJ.filter(s => s.tables[0] === e.obj.code) : e.obj.sys ? [e.obj.sys] : [];
  for (const s of own) for (const name of s.entries ?? []) { const k = entryKey(s.volume, name), ent = entryByKey.get(k); if (ent && launchedBy.get(k) === objKey(e.obj) && (ent.callers ?? []).some(f => fset.has(f))) set.set(k, ent); }
  if (e.obj.kind === 'table') { const v = viewEntries.get(e.obj.code); if (v) set.set(entryKey(v.vol, v.name), v); }
  return [...set].sort((a, b) => cmp(a[0], b[0])).map(([, v]) => ({ vol: v.vol, sec: v.sec, name: v.name }));
}
function acceptOfRows(rs, isFirstTable, tableCode) {
  const acc = [];
  if (isFirstTable) acc.push(...dimKeysOf(tableCode));
  for (const r of rs) for (const m of (r.target ?? '').matchAll(tokRe)) {
    if ((r.target ?? '').slice(Math.max(0, m.index - 3), m.index).includes('台账')) continue; // "台账 S-24"是素材台账条目，不是本卷或别卷的扫描号
    // 没有卷序号的编号：紧前写了卷名的（"卷三乙 R-4"）归那一卷，否则归行的来源卷
    const before = (r.target ?? '').slice(0, m.index);
    const vm = before.match(new RegExp('(' + CFG.volCode + ')\\s*$'));
    const tok = qual(vm ? vm[1] : r.volume, m[1]);
    // 落点里写的编号：按定义的性质取——只取验收类；规则、记录、其他类（R、C、M 一类）是引用，不取。
    // 同一卷里同一个编号既是验收类又是别类（卷四 P-3 既是 §3.5 扫描条又是 §4.10 规则）的，紧前写了"§n"的按该节定，没写的分不清，不取。
    // 哪类都查不到的照取（短写法除外），由形式核对报 E-MIG-ACCEPT-FORM
    const ds = defIdx.get(tok) ?? [];
    if (!ds.length) { if (!SHORT_RE.test(m[1]) || acceptOk(tok)) acc.push(tok); continue; }
    let pick = ds;
    if (new Set(ds.map(d => d.nature)).size > 1) { const sm = before.match(/§\s*([0-9]+(?:\.[0-9]+)*)\s*$/); pick = sm ? ds.filter(d => d.head.split(' / ').some(h => h.replace(/^§/, '').startsWith(sm[1] + ' '))) : []; }
    if (pick.length && pick.every(d => d.nature === '验收类')) acc.push(tok);
  }
  return uniq(acc).sort();
}
function pendingOfRows(rs) {
  const p = [];
  for (const r of rs) if (/^(待补|待定)/.test(r.disp) || /待补/.test(r.target ?? '')) p.push(`row:${r.rowKey}`);
  return p;
}
const ledgerGroups = []; // 账本子卡的消费者组

// ---- 每个对象的卡 ----
const objList = [...objs.values()].sort((a, b) => kindRank[a.obj.kind] - kindRank[b.obj.kind] || cmp(a.obj.code, b.obj.code));
for (const e of objList) {
  const o = e.obj;
  if (o.kind === 'gate_facility') continue; // 门禁卡单独生成
  const ledger = isLedgerObj(e); e.ledger = ledger;
  const groups = e.groups.length ? e.groups : [{ key: '无文件-1', mg: null, files: [], empty: true }];
  groups.forEach((g, gi) => {
    const gRows = (e.byGroup.get(gi) ?? []).slice().sort((a, b) => cmp(a.rowKey, b.rowKey));
    const { code, data } = splitCode(g.files);
    const isFirst = gi === 0;
    const kind = o.kind === 'module_group' ? 'relocate' : ledger ? 'ledger_child' : isFirst ? 'first' : 'follow';
    const vol = o.kind === 'module_group'
      ? (() => { const m = new Map(); for (const r of e.rows) m.set(r.volume, (m.get(r.volume) ?? 0) + 1); return [...m].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0]?.[0] ?? null; })()
      : o.volume;
    const c = newCard({
      cardKind: kind, objectKind: o.kind, objectCode: o.code, volume: vol,
      groupKey: kind === 'relocate' ? null : g.key, rowKeys: gRows.map(r => r.rowKey),
      files: code, dataFiles: data,
      segs: kind === 'relocate' ? [] : isFirst && !ledger ? FIRST_SEGS.slice() : (ledger ? FOLLOW_SEGS.slice() : FOLLOW_SEGS.slice()),
      _g: g, _ord: gi + 1, _e: e,
    });
    if (kind === 'ledger_child') c.segs = FOLLOW_SEGS.slice();
    if (kind === 'relocate') { c.groupKey = null; c.splitAxis = g.splitAxis; c.segNo = g.segNo; }
    // 入口、上线
    if (kind !== 'relocate') {
      c.entries = entriesOfCard(e, g.files);
      if (isFirst) c.launches = (launchesOfObj.get(objKey(o)) ?? []).map(k => { const x = entryByKey.get(k); return { vol: x.vol, sec: x.sec, name: x.name }; }).sort((a, b) => cmp(a.vol + a.name, b.vol + b.name));
    }
    // 验收判据
    c.accept = acceptOfRows(gRows, isFirst && o.kind === 'table', o.code);
    if (!c.accept.length && vol) c.accept = assertionsFor(vol, o.code, [...c.entries.map(en => en.name), ...c.launches.map(en => en.name), ...c.files.map(f => f.slice(f.lastIndexOf('/') + 1))]);
    c.pending.push(...pendingOfRows(gRows));
    c.cardId = `C-${vol ?? '无卷'}-${o.code}-${gi + 1}`;
    cards.push(c);
  });
}

// ---- 账本母卡 ----
const ledgerChildren = cards.filter(c => c.cardKind === 'ledger_child').sort((a, b) => cmp(a.groupKey, b.groupKey));
const ledgerFiles = uniq(ledgerChildren.flatMap(c => c.files)).sort();
const ledgerSys = ledgerSysKey ? sysByKey.get(ledgerSysKey) : null;
if (ledgerSys) {
  const parentCard = newCard({
    cardId: 'LEDGER-1', cardKind: 'ledger_parent', objectKind: 'system', objectCode: ledgerSys.system, volume: ledgerSys.volume,
    entries: (ledgerSys.entries ?? []).map(n => ({ vol: ledgerSys.volume, sec: '§3.1', name: n })),
    launches: [], _fixedPhase: 1,
  });
  // 母卡与子卡沿用卷一编号：子卡 LEDGER-1a … 按组键升序
  ledgerChildren.forEach((c, i) => { c.cardId = `LEDGER-1${String.fromCharCode(97 + i)}`; c._fixedPhase = 1; });
  // 账本系统的"首卡"职责（维度表行补齐、数据补齐）与读入口上线归母卡
  const lead = ledgerChildren[0];
  parentCard.launches = lead ? lead.launches : [];
  if (lead) lead.launches = [];
  // 母卡认领账本系统下没有消费者组归属的行：数据行落在首个子卡
  parentCard.accept = [];
  cards.push(parentCard);
}

// ---- 门禁卡 G-1 … G-3：按卷十二 §2.11 登记次序配 gate_facility（卷一 §6.3、卷十二都没写 G-n 与设施的对应，待裁，见 pending）----
const gateRowsByFac = new Map(); // 门禁设施 → 位置组接收对象是它的行（R11-2.5）
for (const r of rows) if (r.recvObj?.kind === 'gate_facility') (gateRowsByFac.get(r.recvObj.code) ?? gateRowsByFac.set(r.recvObj.code, []).get(r.recvObj.code)).push(r);
gateFacilities.slice(0, 3).forEach((fac, i) => {
  const rs = (gateRowsByFac.get(fac) ?? []).slice().sort((a, b) => cmp(a.rowKey, b.rowKey));
  const c = newCard({
    cardId: `G-${i + 1}`, cardKind: 'gate', objectKind: 'gate_facility', objectCode: fac, volume: gateOwner.get(fac) ?? '卷十二',
    rowKeys: rs.map(r => r.rowKey), files: uniq(rs.flatMap(r => r.files.filter(f => f.endsWith('.mjs') || f.endsWith('.js')))).sort(),
    dataFiles: uniq(rs.flatMap(r => r.files.filter(f => f.endsWith('.json')))).sort(), accept: s12.slice(), _fixedPhase: 0,
  });
  c.pending.push('objectCode:G-n 与门禁设施代号的对应卷一 §6.3、卷十二 §2.11 均未写，按 §2.11 登记次序暂配');
  c.pending.push(...pendingOfRows(rs));
  cards.push(c);
});

// ================= 对象 → 表主、必填引用等的依赖 =================
const firstOfObj = new Map(); // objKey → 首卡
for (const c of cards) if (c.cardKind === 'first' || c.cardKind === 'relocate' && c._ord === 1) firstOfObj.set(`${c.objectKind}:${c.objectCode}`, c);
for (const c of cards) if (c.cardKind === 'ledger_parent') firstOfObj.set(`${c.objectKind}:${c.objectCode}`, c);
const cardByLaunch = new Map(); // entryKey → 卡
for (const c of cards) for (const l of c.launches) cardByLaunch.set(entryKey(l.vol, l.name), c);
const relocateCards = cards.filter(c => c.cardKind === 'relocate');
const fileToReloc = new Map();
for (const c of relocateCards) for (const f of c.files) fileToReloc.set(f, c);
const parentCard = cards.find(c => c.cardKind === 'ledger_parent');
const ledgerFileSet = new Set(ledgerFiles);

// 依赖与阶段：entriesOf(c) 给出卡要接的入口；主算用卡记录里的 entries（只含本对象的入口），灵敏度算再加上"文件里调用了别的对象读入口的旧调用方"
function derive(entriesOf) {
  const deps = new Map(); const refDeps = new Map(cards.map(c => [c.cardId, new Set()]));
  for (const c of cards) {
    const dep = new Set();
    // 来源 1：必填引用
    if (c.cardKind === 'first' && c.objectKind === 'table') for (const t of tableRefs.get(c.objectCode) ?? []) { const d = firstOfObj.get('table:' + t) ?? firstOfObj.get(objKey(tableObj(t))); if (d && d !== c) { dep.add(d.cardId); refDeps.get(c.cardId).add(d.cardId); } }
    // 来源 2：要接的入口由另一张卡上线
    for (const en of entriesOf(c)) { const d = cardByLaunch.get(entryKey(en.vol, en.name)); if (d && d !== c) dep.add(d.cardId); }
    // 来源 3：同对象的后续卡依赖首卡
    if (c.cardKind === 'follow') { const d = firstOfObj.get(`${c.objectKind}:${c.objectCode}`); if (d) dep.add(d.cardId); }
    // 来源 4：文件清单含某搬迁卡要搬的文件
    if (c.cardKind !== 'relocate' && c.cardKind !== 'sweep') for (const f of [...c.files, ...c.dataFiles]) { const d = fileToReloc.get(f); if (d && d !== c) dep.add(d.cardId); }
    // 来源 5：触及账本路径的卡依赖母卡（搬迁卡只搬文件、不改账本路径，不算）
    if (parentCard && c !== parentCard && c.cardKind !== 'gate' && c.cardKind !== 'sweep' && c.cardKind !== 'relocate' && c.files.some(f => ledgerFileSet.has(f))) dep.add(parentCard.cardId);
    deps.set(c.cardId, [...dep].sort(cmp));
  }
  // 母卡依赖其子卡文件所在的搬迁卡（R11-7.1 说明：内核组搬迁卡因母卡依赖它落在阶段 1）
  if (parentCard) { const s2 = new Set(deps.get(parentCard.cardId)); for (const f of ledgerFiles) { const d = fileToReloc.get(f); if (d) s2.add(d.cardId); } deps.set(parentCard.cardId, [...s2].sort(cmp)); }
  const phase = new Map(); let cycle = null;
  const state = new Map();
  const visit = (id, stack) => {
    if (state.get(id) === 2) return;
    if (state.get(id) === 1) { if (!cycle) cycle = [...stack.slice(stack.indexOf(id)), id]; return; }
    state.set(id, 1);
    const c = byId.get(id);
    if (c._fixedPhase !== undefined) { for (const d of deps.get(id)) visit(d, [...stack, id]); phase.set(id, c._fixedPhase); state.set(id, 2); return; }
    let L = 1;
    for (const d of deps.get(id)) {
      visit(d, [...stack, id]);
      const dc = byId.get(d), dp = phase.get(d) ?? 1;
      const uses = refDeps.get(id).has(d) || entriesOf(c).some(en => dc.launches.some(l => l.vol === en.vol && l.name === en.name));
      L = Math.max(L, uses && c.launches.length ? dp + 1 : dp);
    }
    phase.set(id, L); state.set(id, 2);
  };
  for (const c of cards.slice().sort((x, y) => cmp(x.cardId, y.cardId))) visit(c.cardId, []);
  const conflicts = [];
  for (const c of cards) if (c._fixedPhase !== undefined) for (const d of deps.get(c.cardId)) { const dp = phase.get(d); if (dp > c._fixedPhase) conflicts.push(`${c.cardId}(阶段${c._fixedPhase}) 依赖 ${d}(阶段${dp})`); }
  return { deps, phase, cycle, conflicts, n: Math.max(0, ...[...phase.values()]) };
}
const byId = new Map(cards.map(c => [c.cardId, c]));
const main = derive(c => c.entries);
const crossOf = c => { // 灵敏度：加上文件里有旧调用方的别对象读入口（只按名字对，噪声大；账本子卡不加）
  if (c.cardKind === 'ledger_child' || c.cardKind === 'gate' || c.cardKind === 'sweep' || c.cardKind === 'relocate') return c.entries;
  const fset = new Set([...c.files, ...c.dataFiles]); const out = new Map(c.entries.map(en => [entryKey(en.vol, en.name), en]));
  for (const [k, ent] of entryByKey) if (launchedBy.has(k) && (ent.callers ?? []).some(f => fset.has(f))) out.set(k, { vol: ent.vol, sec: ent.sec, name: ent.name });
  return [...out.values()];
};
const alt = derive(crossOf);
const phase = main.phase, phaseCycle = main.cycle, phaseConflicts = main.conflicts;
for (const c of cards) { c.dependsOn = main.deps.get(c.cardId); c.phaseNo = phase.get(c.cardId) ?? null; }
const n = main.n;
// 清扫卡：阶段 1 至 n 各一张
for (let k = 1; k <= n; k++) cards.push(newCard({ cardId: `SWEEP-${k}`, cardKind: 'sweep', phaseNo: k, accept: s11.slice() }));

// ================= 推进钩子（R11-3.14）：`X.after = [..]` 机读写法 =================
const hookAfter = new Map(); const hookSrc = new Map(); const hookConflict = [];
for (const [f, ls] of volText) {
  const v = volOfFile(f); if (!v || v === '卷十一') continue; // 卷十一只是引用卷十九的登记
  for (const l of ls) for (const m of l.matchAll(/`([A-Za-z][A-Za-z0-9]*)\.after\s*=\s*\[([^\]]*)\]`/g)) {
    const lst = m[2].split(',').map(x => x.trim()).filter(Boolean).sort();
    const key = m[1];
    if (hookAfter.has(key) && JSON.stringify(hookAfter.get(key)) !== JSON.stringify(lst)) hookConflict.push(key);
    hookAfter.set(key, lst); if (!hookSrc.has(key)) hookSrc.set(key, v);
  }
}
// 钩子存在：某卷的表格里以它为首格登记过
const hookRegistered = new Map();
for (const [f, ls] of volText) { const v = volOfFile(f); for (const l of ls) { const m = l.match(/^\| `([A-Za-z][A-Za-z0-9]*)` \|/); if (m && !hookRegistered.has(m[1])) hookRegistered.set(m[1], v); } }
const hookNodes = uniq([...hookAfter.keys(), ...[...hookAfter.values()].flat()]).sort();
const hookMissing = hookNodes.filter(h => !hookRegistered.has(h));
const indeg = new Map(hookNodes.map(h => [h, 0])); const outs = new Map(hookNodes.map(h => [h, []]));
for (const [h, as] of hookAfter) for (const a of as) { if (!indeg.has(a)) continue; indeg.set(h, indeg.get(h) + 1); outs.get(a).push(h); }
const sortKeyOf = new Map(); let hookOrder = []; { let ready = hookNodes.filter(h => indeg.get(h) === 0).sort(); let k = 1;
  while (ready.length) { const h = ready.shift(); sortKeyOf.set(h, k++); hookOrder.push(h); for (const x of outs.get(h)) { indeg.set(x, indeg.get(x) - 1); if (indeg.get(x) === 0) { ready.push(x); ready.sort(); } } } }
const hookCycle = hookNodes.filter(h => !sortKeyOf.has(h));
// 排序键落在登记该钩子的卷的领头卡上（该卷系统的首卡；账本系统的卷落在母卡）
for (const h of hookNodes) {
  const v = hookRegistered.get(h) ?? hookSrc.get(h); const s = v ? sysOfVol.get(v) : null; if (!s || !sortKeyOf.has(h)) continue;
  const lead = firstOfObj.get(leadObjOfSys.get(s.system));
  if (lead) lead.sortKeys[h] = sortKeyOf.get(h);
}

// ================= 必填矩阵（卷十一 §2.2）=================
const MATRIX = {
  gate: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '—', entries: '—', retire: '—', accept: '必' },
  ledger_parent: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '列', segs: '—', entries: '必', retire: '列', accept: '必' },
  ledger_child: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '必', retire: '必', accept: '必' },
  relocate: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '—', splitAxis: '必', segNo: '必', zeroRows: '列', rowKeys: '列', files: '必', segs: '—', entries: '—', retire: '列', accept: '必' },
  first: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '列', retire: '必', accept: '必' },
  follow: { volume: '必', objectKind: '必', objectCode: '必', groupKey: '必', splitAxis: '—', segNo: '—', zeroRows: '列', rowKeys: '列', files: '必', segs: '必', entries: '必', retire: '必', accept: '必' },
  sweep: { volume: '—', objectKind: '—', objectCode: '—', groupKey: '—', splitAxis: '—', segNo: '—', zeroRows: '—', rowKeys: '—', files: '—', segs: '—', entries: '—', retire: '—', accept: '必' },
};
const isEmpty = v => v === null || v === undefined || v === '' || (Array.isArray(v) ? v.length === 0 : typeof v === 'object' ? Object.keys(v).length === 0 : false);
const matrixCheck = c => {
  const m = MATRIX[c.cardKind], miss = [], extra = [];
  for (const [f, rule] of Object.entries(m)) {
    const v = c[f];
    if (rule === '必' && isEmpty(v)) miss.push(f);
    if (rule === '—' && !isEmpty(v)) extra.push(f);
  }
  return { miss, extra };
};
// 推不出的必填项：按数据原因登记（K7）
for (const c of cards) {
  const e = c._e;
  const { miss } = matrixCheck(c);
  for (const f of miss) {
    if (f === 'retire') c.pending.push('retire:登记退役数要逐行清单的行数，逐行清单待 G-3');
    else if (f === 'files') c.pending.push(e && !e.cons?.all.length ? 'files:该对象在旧代码里没有消费者文件（新对象或纯数据对象）' : 'files:门禁卡的封闭文件清单待开工时登记');
    else if (f === 'accept') c.pending.push('accept:卡的行落点没有写验收编号，断言归属待各卷分配');
    else if (f === 'entries') c.pending.push('entries:该组文件在旧代码里没有调用本系统读入口，要接哪些入口待设计');
    else if (f === 'groupKey') c.pending.push('groupKey:该对象没有消费者文件，首卡无消费者组');
    else if (f === 'volume') c.pending.push('volume:对象没有登记的归属卷');
    else c.pending.push(`${f}:推不出`);
  }
  // 系统登记项的待补字段（systems 补全表）
  const s = c.objectKind === 'system' ? sysByKey.get(c.objectCode) : c.objectKind === 'table' ? sysOfTable.get(c.objectCode) : null;
  const remain = s ? sixPending.get(s.system) ?? s.pending ?? [] : [];
  if (s && (c.cardKind === 'first' || c.cardKind === 'ledger_parent') && remain.length) c.pending.push(`system:${s.system} 登记项待补 ${remain.join('、')}`);
  if (c.cardKind === 'first' && c.objectKind === 'table' && dimKeysOf(c.objectCode).length === 0) c.pending.push('accept:卷二 §6.12 没有该表的齐全率下限键');
  c.pending = uniq(c.pending).sort();
}
// 验收判据形式（K4）：编号都得有定义
let acceptBad = [];
for (const c of cards) {
  const ok = [], bad = [];
  for (const t of c.accept) (acceptOk(t, c.volume) ? ok : bad).push(t);
  if (bad.length) { acceptBad.push({ cardId: c.cardId, bad }); c.accept = ok; c.pending.push(`accept:未找到定义的编号 ${bad.join('、')} 已摘出`); }
  if (c.cardKind !== 'sweep' && c.cardKind !== 'gate' && !c.accept.length && !c.pending.some(p => p.startsWith('accept:卡的行落点'))) c.pending.push('accept:卡的行落点没有写验收编号，断言归属待各卷分配');
  if (c.accept.length) c.pending = c.pending.filter(p => !p.startsWith('accept:卡的行落点'));
  c.pending = uniq(c.pending).sort();
}
// 母卡验收：卷一 §6.5 的退出条件 ⑤ 写 I1、I2、I15 在 CORE
if (parentCard) { const f = volFiles.find(x => x.startsWith('卷一-')); const l = volText.get(f).find(x => x.includes('**母卡** `LEDGER-1`')) ?? ''; const sec = l.slice(l.indexOf('⑤')); const toks = uniq([...sec.matchAll(/(?<![A-Za-z0-9])(I[0-9]+)(?![0-9A-Za-z])/g)].map(m => m[1])); parentCard.accept = toks.map(t => '卷一:' + t).filter(t => acceptOk(t, '卷一')).sort(); if (!parentCard.accept.length) parentCard.pending.push('accept:卷一 §6.5 退出条件 ⑤ 的不变量编号在卷一里查不到定义'); }
// 疑点名单（accept 仍为空的卡）：原因只写有原文出处的——卷里有验收节、但定义位上没有一个验收类编号的，引该节标题行（文件:行）；
// 卷里有验收类编号、只是没有一条提到本卡的，写不出原文证据，标"待查"并记脚本查过的范围
// 验收断言节：标题含"验收断言"的节（各卷 §4.x.6"验收断言"、卷二"七 本卷的验收断言"一类）；节里定义位上一个编号都没有的，即"断言不带编号"
const verdictOf = new Map(); // 卷 → {heads: [文件:行], numbered: 节内定义位编号数}
for (const [f, ls] of volText) {
  const v = volOfFile(f); if (!v) continue; const r = { heads: [], numbered: 0 };
  ls.forEach((l, i) => { if (/^#{2,6} /.test(l) && /验收断言/.test(l)) r.heads.push(`${f}:${i + 1}`); });
  r.numbered = (defsOf.get(v) ?? []).filter(d => d.nature === '验收类' && /验收断言/.test(d.head.split(' / ').pop() ?? '')).length;
  verdictOf.set(v, r);
}
const suspects = cards.filter(c => !c.accept.length).map(c => {
  const n = (assertText.get(c.volume) ?? []).length; const vd = verdictOf.get(c.volume);
  let reason;
  if (!c.volume) reason = '待查（卡没有归属卷）';
  else if (vd?.heads.length && !vd.numbered) reason = `卷内验收断言不带编号：${vd.heads[0]}${vd.heads.length > 1 ? ` 等 ${vd.heads.length} 个验收节` : ''}，定义位上没有编号` + (n ? `；卷里另有 ${n} 条扫描或不变量编号，没有一条提到本卡（待查）` : '');
  else if (n) reason = `待查（${c.volume} 的 ${n} 条验收类编号定义行里，没有一条提到本卡的对象代号、入口、上线入口或文件名）`;
  else reason = `待查（${c.volume} 没有标题含"验收断言"的节，也没有验收类编号）`;
  return { cardId: c.cardId, volume: c.volume, reason };
});

// ================= 行 → 卡的认领核对（R11-2.6 的纸面版）=================
const claim = new Map();
for (const c of cards) for (const k of c.rowKeys) (claim.get(k) ?? claim.set(k, []).get(k)).push(c.cardId);
const orphanRows = rows.filter(r => !claim.has(r.rowKey)).map(r => r.rowKey);
const multiRows = [...claim].filter(([, v]) => v.length > 1).map(([k]) => k);

// ================= migReady（卷十一 :303、R11-3.12 的判据，只读计算）=================
for (const c of cards) {
  const items = [];
  const { miss, extra } = matrixCheck(c);
  const pendMiss = miss.filter(f => c.pending.some(p => p.startsWith(f + ':')));
  const realMiss = miss.filter(f => !pendMiss.includes(f));
  if (miss.length || extra.length) items.push('E-MIG-CARD-INCOMPLETE(' + [...miss, ...extra.map(x => x + '应为空')].join('、') + (realMiss.length ? '，无待补原因：' + realMiss.join('、') : '') + ')');
  if (c.pending.some(p => p.startsWith('row:'))) items.push('待补:迁移行处置');
  if (c.pending.some(p => p.startsWith('accept:未找到'))) items.push('E-MIG-ACCEPT-FORM');
  if (c.pending.some(p => p.startsWith('objectCode:') || p.startsWith('system:'))) items.push('待补:登记项字段');
  const nmjs = c.files.filter(f => f.endsWith('.mjs')).length;
  if (nmjs > MAXFILES) items.push('E-MIG-CARD-SCOPE');
  c._ready = { defects: items.sort(), stateItems: ['依赖卡已 merged', '所在阶段已开', '不在冻结中'] };
}

// ================= 输出 =================
const clean = c => { const o = {}; for (const k of Object.keys(c)) if (!k.startsWith('_')) o[k] = c[k]; o.migReady = c._ready; return o; };
const kindOrder = ['gate', 'ledger_parent', 'ledger_child', 'relocate', 'first', 'follow', 'sweep'];
cards.sort((a, b) => a.phaseNo - b.phaseNo || kindOrder.indexOf(a.cardKind) - kindOrder.indexOf(b.cardKind) || cmp(a.cardId, b.cardId));
const stat = (arr, f) => { const m = new Map(); for (const x of arr) m.set(f(x), (m.get(f(x)) ?? 0) + 1); return Object.fromEntries([...m].sort((a, b) => cmp(String(a[0]), String(b[0])))); };
const nonSweep = cards.filter(c => c.cardKind !== 'sweep');
const byKind = stat(cards, c => c.cardKind), byPhase = stat(cards, c => c.phaseNo);
const matrixBad = cards.filter(c => matrixCheck(c).extra.length || matrixCheck(c).miss.length).map(c => c.cardId);
const matrixBadNoReason = cards.filter(c => matrixCheck(c).extra.length || matrixCheck(c).miss.some(f => !c.pending.some(p => p.startsWith(f + ':')))).map(c => c.cardId);
const pendMissCards = cards.filter(c => matrixCheck(c).miss.some(f => c.pending.some(p => p.startsWith(f + ':'))));
const nPend = cards.filter(c => c.pending.length).length;
const pendKinds = {}; for (const c of cards) for (const p of c.pending) { const k = p.split(':')[0]; pendKinds[k] = (pendKinds[k] ?? 0) + 1; }
const nImpl = cards.filter(c => ['first', 'follow', 'relocate', 'ledger_child', 'ledger_parent'].includes(c.cardKind)).length;
const nDomain = cards.filter(c => ['first', 'follow'].includes(c.cardKind)).length;
// launches 恰一次
const launchCount = new Map(); for (const c of cards) for (const l of c.launches) { const k = entryKey(l.vol, l.name); launchCount.set(k, (launchCount.get(k) ?? 0) + 1); }
const launchDup = [...launchCount].filter(([, v]) => v > 1).map(([k]) => k);
const notLaunched = [...entryByKey.keys()].filter(k => !launchCount.has(k));
// dependsOn 无环由阶段算法已查；再核对 dependsOn 里的卡存在
const depMissing = cards.flatMap(c => c.dependsOn.filter(d => !byId.has(d)).map(d => `${c.cardId}→${d}`));
const ledgerChildLimit = ledgerChildren.length > 8;

const result = {
  _说明: '乙-5：卡账 v0（设计侧派生物，不是 tools/migrate 的卡账）；脚本 脚本/卷十一/gen-card-ledger.mjs 生成，勿手改。pending 列出推不出、不替它定值的字段；migReady.defects 是不含状态项的缺陷，stateItems 是 drafted 阶段本来就不满足的三项。',
  baseline: BASELINE, maxFiles: MAXFILES, n,
  counts: { cards: cards.length, byKind, byPhase, nonSweep: nonSweep.length },
  cards: cards.map(clean),
  hooks: { order: hookOrder, sortKeys: Object.fromEntries(hookOrder.map(h => [h, sortKeyOf.get(h)])), after: Object.fromEntries([...hookAfter].sort((a, b) => cmp(a[0], b[0]))), missing: hookMissing, cycle: hookCycle, conflict: uniq(hookConflict) },
};
writeFileSync(`${OUT}/卡账-v0.json`, JSON.stringify(result, null, 1) + '\n');

// ---- 摘要 ----
const kindName = { gate: '门禁卡', ledger_parent: '账本母卡', ledger_child: '账本子卡', relocate: '搬迁卡', first: '首卡', follow: '后续卡', sweep: '清扫卡' };
const objCount = new Map(); for (const c of cards) if (c.objectKind) objCount.set(c.objectKind, new Set([...(objCount.get(c.objectKind) ?? []), c.objectCode]));
const phaseTable = []; for (let k = 0; k <= n; k++) { const row = [k]; for (const kd of kindOrder) row.push(cards.filter(c => c.phaseNo === k && c.cardKind === kd).length); row.push(cards.filter(c => c.phaseNo === k).length); phaseTable.push(row); }
const firstCards = cards.filter(c => c.cardKind === 'first');
const md = [
  '# 乙-5 卡账 v0 与卡族读数（脚本生成，勿手改）',
  '',
  `- 生成脚本：脚本/卷十一/gen-card-ledger.mjs；产出：审查/脚本输出/卡账-v0.json。输入：脚本/卷十一/migrows-input.json（${rows.length} 行非别名迁移行）、乙4补-systems补全.json（${sysJ.length} 个系统）、乙4-import图-边表.tsv、乙4-entryCallerFiles.json、卷二（表主、§2.1、§5、§6.12）、卷十二 §2.11、各卷断言定义。只读、确定性、不联网；同一提交重跑逐字一致。`,
  '- 这是设计侧派生物，不是 `tools/migrate/` 的卡账；`tools/`、`server-plugin/`、`extension/` 未碰。',
  '',
  '## 一 卡总数与分布',
  '',
  `卡共 ${cards.length} 张（非清扫卡 ${nonSweep.length} 张，清扫卡 ${cards.length - nonSweep.length} 张）；阶段数 n = ${n}（R11-5.2：非清扫卡的最大阶段号）。`,
  '',
  '| cardKind | ' + kindOrder.map(k => kindName[k]).join(' | ') + ' | 合计 |', '|---|' + kindOrder.map(() => '---:').join('|') + '|---:|',
  '| 按卡种 | ' + kindOrder.map(k => byKind[k] ?? 0).join(' | ') + ' | ' + cards.length + ' |', '',
  '| 阶段 | ' + kindOrder.map(k => kindName[k]).join(' | ') + ' | 合计 |', '|---|' + kindOrder.map(() => '---:').join('|') + '|---:|',
  ...phaseTable.map(r => '| ' + r.join(' | ') + ' |'), '',
  `对象：表 ${objCount.get('table')?.size ?? 0} 个、系统 ${objCount.get('system')?.size ?? 0} 个、模块组 ${objCount.get('module_group')?.size ?? 0} 个、门禁设施 ${objCount.get('gate_facility')?.size ?? 0} 个；首卡 ${firstCards.length} 张（账本系统的首卡职责由母卡承担，不另出首卡）；后续卡 ${byKind.follow ?? 0} 张 = 各对象消费者组数减一之和。`,
  '',
  `搬迁卡切段（R11-7.5，李白 11-15 18:22；splitAxis：consumer_group 消费者组、target_subdir 卷二 §6.11 目标子目录、path_order 路径升序兜底）：${uniq(cards.filter(c => c.cardKind === 'relocate').map(c => c.objectCode)).sort().map(o => { const cs = cards.filter(c => c.cardKind === 'relocate' && c.objectCode === o).sort((a, b) => a.segNo - b.segNo); return `${o} ${cs.length} 张（${cs.map(c => `${c.cardId} 段 ${c.segNo} ${c.splitAxis} ${c.files.filter(f => f.endsWith('.mjs')).length} 个 .mjs`).join('；')}）`; }).join('；')}。`,
  '',
  '## 二 三个错误码与核对',
  '',
  `- E-MIG-CARD-INCOMPLETE：${matrixBad.length} 张（按卷十一 §2.2 必填矩阵原定义：缺"必"或"列"字段、"—"字段有值，即计；有无待补原因不改数）。其中没有待补原因的 ${matrixBadNoReason.length} 张；其余 ${matrixBad.length - matrixBadNoReason.length} 张的空位都因推不出、已在 pending 里写明原因（不替它定值，见第三节）。这 ${matrixBad.length} 张不得转 \`ready\`。`,
  `- E-MIG-ACCEPT-FORM：${acceptBad.reduce((s, x) => s + x.bad.length, 0)} 个编号（${acceptBad.length} 张卡）在所指卷里查不到定义${acceptBad.length ? '：' + acceptBad.slice(0, 8).map(x => x.cardId + ' ' + x.bad.join('、')).join('；') : ''}；这些编号已从判据摘出并登记在该卡 pending。判据里只有编号（齐全率下限键 ${dimKeys.length} 个、各卷断言与扫描条、卷十一 ${s11.length} 条扫描条、卷十二 ${s12.length} 条）。`,
  `- E-MIG-SORTKEY-ORDER：钩子 ${hookNodes.length} 个（${hookNodes.join('、')}）；成环 ${hookCycle.length} 个；指向不存在（卷里没有登记行）的 ${hookMissing.length} 个${hookMissing.length ? '：' + hookMissing.join('、') : ''}；同一钩子两处写法不同 ${uniq(hookConflict).length} 个。机读 after 来源是各卷正文的 \`X.after = [..]\` 写法；排序键按拓扑加代号升序从 1 连续编号，v0 不分推进相位（卷二 §2.7 没有按钩子登记相位的机读列），落在登记该钩子的卷的领头卡的 sortKeys 上。`,
  `- dependsOn：无环${phaseCycle ? '（失败：' + phaseCycle.join('→') + '）' : ''}；指向不存在的卡 ${depMissing.length} 处；固定卡阶段冲突（E-MIG-PHASE-CONFLICT）${phaseConflicts.length} 处${phaseConflicts.length ? '：' + phaseConflicts.join('；') : ''}。`,
  `- launches：每个入口恰一张卡上线——重复上线 ${launchDup.length} 个${launchDup.length ? '：' + launchDup.slice(0, 5).join('、') : ''}；没有卡上线的入口 ${notLaunched.length} 个${notLaunched.length ? '（' + notLaunched.slice(0, 5).join('、') + '…）' : ''}。`,
  `- 迁移行认领：没有接收卡 ${orphanRows.length} 行${orphanRows.length ? '（' + orphanRows.slice(0, 12).join('、') + (orphanRows.length > 12 ? '…' : '') + '）' : ''}；多于一张 ${multiRows.length} 行。位置组 ${posGroups.size} 个，其中锚点跨两个以上消费者组的位置组行 ${nStraddle} 行（取最小组，待裁）；位置组内对象不一致 ${nObjConflict} 组（取行数最多的对象，同数按对象种类次序再代号升序，列在下面）。`,
  `- 账本子卡 ${ledgerChildren.length} 张${ledgerChildLimit ? '，超过卷一 §6.5 的 ≤ 8 上限，报李白' : '（≤ 8）'}。`,
  '',
  '## 三 待补（K7）与 migReady',
  '',
  `${nPend} 张卡带 pending（共 ${Object.values(pendKinds).reduce((a, b) => a + b, 0)} 条）；按类：${Object.entries(pendKinds).sort((a, b) => cmp(a[0], b[0])).map(([k, v]) => k + ' ' + v).join('、')}。`,
  '',
  `- accept（乙-6b，李白 11-15 18:50 第 1 条）：编号按通用识别规则认（脚本/卷十一/id-defs.mjs；写法清单 审查/脚本输出/乙6b-编号写法清单.md），只取“验收类”（定义行最近的命中标题是验收、断言、扫描、旁路、不变量一类；影响面表、修订记录、记账栏等记录类的意见号与规则号不取）。卡的行落点没写编号时，取对象所在卷里验收类定义行提到本卡对象代号、要接或上线的入口名、文件名的编号（只写编号，带后缀的写全称，没有卷序号的写“卷名:编号”；"台账 S-n"是素材台账条目，不当扫描号）。取完 accept 仍为空的 ${suspects.length} 张卡列为疑点，不新造编号；原因有原文出处的写出处，写不出的标“待查”（${suspects.filter(x => x.reason.startsWith('待查')).length} 张）：`,
  '',
  '| 卡 | 卷 | 原因 |', '|---|---|---|',
  ...suspects.map(x => `| ${x.cardId} | ${x.volume ?? '—'} | ${x.reason} |`),
  '',
  `  - 另：卷二 §6.12 没有齐全率下限键的表首卡（accept 里无下限键，不一定为空）：${cards.filter(c => c.pending.some(p => p.startsWith('accept:卷二 §6.12'))).map(c => c.cardId).join('、') || '无'}。`,
  '- retire：登记退役数要逐行清单的行数，逐行清单待 G-3，全部"必"卡的 retire 为空并已登记。',
  '- zeroRows：迁移行没有 zeroRow 列（待补清单第 6 项已记），zeroRows 全部为空表（该字段矩阵里是"列"，可为空）。',
  '- census、testClass、derivations、approvals、mergeRef、fails 是做卡时才填的字段，v0 为空。',
  `- 系统登记项的 predicates、writers、sources、sinks、entryJudges、view 六列已由卷文转录（乙-6a，卷二 §2.7 六列转录表）；仍待补的列逐张标在首卡与母卡的 pending 里（${[...sixPending.values()].reduce((a, b) => a + b.length, 0)} 格）。`,
  '',
  'migReady 逐卡计算（卷十一 :303）：缺陷项与状态项分开记。状态项是 drafted 阶段本来就不满足的——依赖卡已 merged、所在阶段已开、不在冻结中（要求写的是后两项；"依赖卡已 merged"是 R11-3.12 的第三个状态条件，一并列出）。缺陷项（除状态项外的不满足）：',
  '',
  ...Object.entries(stat(cards.filter(c => c._ready.defects.length), c => c._ready.defects.join('；'))).sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => `- ${v} 张：${k}`),
  `- 无缺陷项（只差状态项）：${cards.filter(c => !c._ready.defects.length).length} 张。`,
  '',
  '## 四 与排期 v1 的对照（开工排期-v1定稿 §1）',
  '',
  `- 阶段数 n：排期 ≈ 5–7；本表 ${n}。差异的原因：R11-7.2 来源 2（要接的入口由另一张卡上线）在 v0 只能用"本对象自己的入口"，因为别对象入口的使用没有机读来源——各卷"本卷使用的别卷接口"是按节号写的文字，没有入口名栏；旧代码里的调用方采集（H2）只按名字对、噪声大。所以 v0 的跨对象入口依赖没有算进去；表间必填引用（来源 1）按卷十一 §4.7.5 算（引用方首卡比被引用表首卡晚一个阶段：信仰晚于神祇、物种晚于身体图、人物晚于物种，等等），来源 4、5 同阶段。n 因此是下界（再加别对象入口依赖只会更大）。灵敏度：把 H2 的旧调用方按名字对到别对象读入口后，n = ${alt.n}${alt.cycle ? '，依赖成环（' + alt.cycle.join('→') + '）' : '，无环'}，固定卡阶段冲突 ${alt.conflicts.length} 处——说明在那份噪声输入上算不出可用的阶段，待各卷迁移节写出按入口名的"要接的入口"栏后重算。`,
  `- 实现卡（首卡、后续卡、搬迁卡、账本母卡与子卡）：排期 60–120；本表 ${nImpl}（其中首卡加后续卡 ${nDomain}），在区间内。`,
  `- 门禁卡 ${byKind.gate ?? 0}、清扫卡 ${byKind.sweep ?? 0}：与卷一 §6.3、R11-7.8 一致。`,
  '',
  '## 五 位置组内对象不一致的组',
  '',
  ...(objConflicts.length ? ['| 行 | 候选对象 | 取 |', '|---|---|---|', ...objConflicts.slice(0, 40).map(x => `| ${x.rows.slice(0, 6).join('、')}${x.rows.length > 6 ? '…' : ''} | ${x.objs.join('、')} | ${x.pick} |`), ''] : ['无。', '']),
  '## 六 每个首卡的概览',
  '',
  '| 首卡 | 卷 | 对象 | 阶段 | 行数 | 文件数 | 后续卡数 | pending |', '|---|---|---|---:|---:|---:|---:|---:|',
  ...firstCards.map(c => `| ${c.cardId} | ${c.volume ?? '—'} | ${c.objectCode} | ${c.phaseNo} | ${c.rowKeys.length} | ${c.files.length} | ${cards.filter(x => x.cardKind === 'follow' && x.objectCode === c.objectCode && x.objectKind === c.objectKind).length} | ${c.pending.length} |`),
  '',
].join('\n');
writeFileSync(`${OUT}/卡账-v0-摘要.md`, md);
console.log(`cards ${cards.length}; kinds ${JSON.stringify(byKind)}; n=${n}; phases ${JSON.stringify(byPhase)}`);
console.log(`matrixBad ${matrixBad.length}; pendMiss ${pendMissCards.length}; acceptBad ${acceptBad.length}; hooks ${hookNodes.length} cycle ${hookCycle.length} missing ${hookMissing.length}; phaseCycle ${phaseCycle ? 'YES' : 'no'}; phaseConflicts ${phaseConflicts.length}`);
console.log(`orphan ${orphanRows.length}; multi ${multiRows.length}; unassigned ${unassigned.length}; objConflict ${nObjConflict}; straddle ${nStraddle}; launchDup ${launchDup.length}; notLaunched ${notLaunched.length}; ledgerChildren ${ledgerChildren.length}; impl ${nImpl}`);
