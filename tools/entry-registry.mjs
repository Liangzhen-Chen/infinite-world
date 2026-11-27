// 总登记表派生脚本（李白 11-22「总登记表1122」Q-12；总纲 docs/研究/总登记表总纲-1122.md；卷二 §2.7 勘误 1124k110）。
// 唯一出处是 tools/accept/entry-registry.json（只存 name、file、vol、sec、kind、needs、rules）；本脚本只读：
// 读登记表、卷文（docs/统一底层设计）、server-plugin、tests、tools、world/ontology/state-owners.json，派生
//   卷文锚点（按"卷 + 节 + 名"现找行号，勘误插行不失效）、提供方代码 文件:行、生产调用者与死调用点、接通状态、
//   代码依赖（对照 needs）、依赖次序与环、同名另定义（绕开 b）、签名参数个数是否与卷文一致（只报告）。
// 接通判据（总纲必须改 ②③）：调用点所在的函数本身已接通，或在可达模块的顶层；经 register* 交给内核的实参也算调用点。
//   从 server-plugin/index.mjs 起（模块顶层与它的导出 init），沿"使用处所在节点 → 被使用的函数"逐层推出活节点。
// 局限：词法级读取，不是类型检查；不处理同名局部变量遮蔽；经对象属性、字符串名间接调用的看不见。
// 确定、只读：不写时间、不读网络，所有遍历先排序。用法：node tools/entry-registry.mjs [--check] [--out 路径.json]
//   默认只把摘要印到标准输出；--out 把完整派生结果写成 JSON（供 cmp 核对重跑一致）；--check 在硬性问题非 0 时以 1 退出。

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { writeCliOut } from './accept/lib/cli-out.mjs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, importsOf, isP, matchClose } from './accept/lib/js-scan.mjs';
import { ENTRY_REGISTRY_FILE, readEntryRegistry, readOwnersFiles } from './accept/lib/registry-files.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..').replace(/\\/g, '/');
export const REGISTRY_FILE = ENTRY_REGISTRY_FILE;
const DESIGN = 'docs/统一底层设计';
export const ENTRY_POINT = 'server-plugin/index.mjs';
const PROD = 'server-plugin';
const SELF = 'tools/entry-registry.mjs';
const REGISTER_CALLEE = /^register[A-Z]\w*$/; // 经 register* 交给内核的实参算调用点（卷四 :430 的唯一接法）
const KEY_RE = /^([\w./-]*)#([A-Za-z_]\w*)$/;
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (n) => new RegExp(`(?<![A-Za-z0-9_])${esc(n)}(?![A-Za-z0-9_])`);

// ---------- 词法与模块解析 ----------
function flatten(toks, out) {
  for (const t of toks) { if (t.t === 'tpl') { out.push(t); for (const ex of t.exprs) flatten(ex, out); } else out.push(t); }
  return out;
}
const DECL_START = new Set(['export', 'const', 'let', 'var', 'function', 'class', 'async', 'import']);

function makeResolver(fileSet) {
  return (fromRel, spec) => {
    if (!spec || !spec.startsWith('.')) return null;
    const p = posix.normalize(posix.join(posix.dirname(fromRel), spec));
    for (const c of [p, `${p}.mjs`, `${p}.js`, `${p}/index.mjs`]) if (fileSet.has(c)) return c;
    return null;
  };
}

function isCallableInit(ft, q) { // ft[q] 是 '='
  const a = ft[q + 1]; if (!a) return false;
  if (a.t === 'id' && a.v === 'function') return true;
  let k = q + 1;
  if (a.t === 'id' && a.v === 'async') { k++; if (ft[k] && ft[k].t === 'id' && ft[k].v === 'function') return true; }
  if (isP(ft[k], '(')) { const c = matchClose(ft, k); return isP(ft[c + 1], '=>'); }
  return !!(ft[k] && ft[k].t === 'id' && isP(ft[k + 1], '=>'));
}

function parseModule(rel, src, resolveSpec) {
  const toks = tokenize(src);
  const ft = flatten(toks, []);
  const imps = importsOf(toks);
  const topIdx = new Map();
  { let k = 0; for (let i = 0; i < toks.length; i++) { while (ft[k] !== toks[i]) k++; topIdx.set(i, k); } }
  const importStmt = new Set();
  const bindings = []; const starFrom = []; const exportsLocal = new Map(); const reexports = new Map();
  for (const imp of imps) {
    if (imp.kind !== 'static') continue;
    const s = topIdx.get(imp.at);
    let e = s; while (e < ft.length && !(ft[e].t === 'str' && ft[e].v === imp.spec)) e++;
    for (let k = s; k <= e && k < ft.length; k++) importStmt.add(k);
    const target = resolveSpec(rel, imp.spec);
    const head = toks[imp.at];
    if (head.v === 'import') {
      for (const n of imp.names) bindings.push({ local: n.local, imported: n.imported, target });
      const a = toks[imp.at + 1];
      if (a && a.t === 'id' && a.v !== 'from') bindings.push({ local: a.v, imported: 'default', target });
      if (isP(a, '*') && toks[imp.at + 2] && toks[imp.at + 2].v === 'as' && toks[imp.at + 3]) bindings.push({ local: toks[imp.at + 3].v, imported: '*', target });
    } else if (isP(toks[imp.at + 1], '*')) {
      if (toks[imp.at + 2] && toks[imp.at + 2].v === 'as') reexports.set(toks[imp.at + 3].v, { imported: '*', target }); else starFrom.push(target);
    } else if (isP(toks[imp.at + 1], '{')) {
      const close = matchClose(toks, imp.at + 1);
      for (let m = imp.at + 2; m < close; m++) {
        if (toks[m].t !== 'id') continue;
        if (toks[m + 1] && toks[m + 1].v === 'as') { reexports.set(toks[m + 2].v, { imported: toks[m].v, target }); m += 2; } else reexports.set(toks[m].v, { imported: toks[m].v, target });
      }
    }
  }
  const decls = new Map();
  let depth = 0;
  for (let i = 0; i < ft.length; i++) {
    const t = ft[i];
    if (t.t === 'p') { if (t.v === '{' || t.v === '(' || t.v === '[') depth++; else if (t.v === '}' || t.v === ')' || t.v === ']') depth--; continue; }
    if (depth !== 0 || t.t !== 'id' || importStmt.has(i)) continue;
    if (i > 0 && ft[i - 1].t === 'id' && (ft[i - 1].v === 'export' || ft[i - 1].v === 'async')) continue;
    let j = i; let exported = false;
    if (t.v === 'export') {
      exported = true; j = i + 1;
      if (ft[j] && ft[j].v === 'default') continue;
      if (isP(ft[j], '{')) {
        const close = matchClose(ft, j);
        if (!(ft[close + 1] && ft[close + 1].v === 'from')) for (let m = j + 1; m < close; m++) {
          if (ft[m].t !== 'id') continue;
          if (ft[m + 1] && ft[m + 1].v === 'as') { exportsLocal.set(ft[m + 2].v, { local: ft[m].v, line: ft[m].line }); m += 2; } else exportsLocal.set(ft[m].v, { local: ft[m].v, line: ft[m].line });
        }
        continue;
      }
    }
    let k = j;
    if (ft[k] && ft[k].v === 'async' && ft[k + 1] && ft[k + 1].v === 'function') k++;
    if (!ft[k] || ft[k].t !== 'id') continue;
    if (ft[k].v === 'function') {
      let n = k + 1; if (isP(ft[n], '*')) n++;
      if (!ft[n] || ft[n].t !== 'id') continue;
      let p = n + 1; while (p < ft.length && !isP(ft[p], '(')) p++;
      const pc = matchClose(ft, p); let b = pc + 1; while (b < ft.length && !isP(ft[b], '{')) b++;
      decls.set(ft[n].v, { line: ft[n].line, start: n, params: [p, pc], end: b < ft.length ? matchClose(ft, b) : n, exported, callable: true });
    } else if (ft[k].v === 'const' || ft[k].v === 'let' || ft[k].v === 'var') {
      const n = k + 1;
      if (!ft[n] || ft[n].t !== 'id') continue;
      let q = n + 1; while (q < ft.length && !isP(ft[q], '=') && !isP(ft[q], ';')) q++;
      let e = q; let d = 0;
      for (; e < ft.length; e++) {
        const x = ft[e];
        if (x.t === 'p') { if (x.v === '{' || x.v === '(' || x.v === '[') d++; else if (x.v === '}' || x.v === ')' || x.v === ']') d--; else if (x.v === ';' && d === 0) break; }
        if (d === 0 && e > q + 1 && x.nl && x.t === 'id' && DECL_START.has(x.v)) { e--; break; }
        if (d < 0) { e--; break; }
      }
      const callable = isP(ft[q], '=') && isCallableInit(ft, q);
      let params = null;
      if (callable) { let a = q + 1; if (ft[a].v === 'async') a++; if (isP(ft[a], '(')) params = [a, matchClose(ft, a)]; }
      decls.set(ft[n].v, { line: ft[n].line, start: n, params, end: Math.min(e, ft.length - 1), exported, callable });
    } else if (ft[k].v === 'class') {
      const n = k + 1; if (!ft[n] || ft[n].t !== 'id') continue;
      let b = n; while (b < ft.length && !isP(ft[b], '{')) b++;
      decls.set(ft[n].v, { line: ft[n].line, start: n, params: null, end: b < ft.length ? matchClose(ft, b) : n, exported, callable: true });
    }
  }
  for (const [name, d] of decls) if (d.exported) exportsLocal.set(name, { local: name, line: d.line });
  for (const [name, ex] of [...exportsLocal]) {
    if (decls.has(ex.local)) continue;
    const b = bindings.find((x) => x.local === ex.local);
    if (b) { exportsLocal.delete(name); reexports.set(name, { imported: b.imported, target: b.target }); }
  }
  // 每个记号所在的"节点"：可调用的顶层声明名；其余（模块顶层语句、非函数常量的初始化）算 ''（模块加载时执行）
  const nodeAt = new Array(ft.length).fill('');
  for (const [name, d] of [...decls].sort((a, b) => a[1].start - b[1].start)) if (d.callable) for (let i = d.start; i <= d.end; i++) nodeAt[i] = name;
  return { rel, ft, bindings, starFrom, exportsLocal, reexports, decls, importStmt, imps, nodeAt };
}

function paramCount(ft, params) {
  if (!params) return null;
  const [a, b] = params; let d = 0; let n = 0; let any = false;
  for (let i = a + 1; i < b; i++) {
    const t = ft[i]; any = true;
    if (t.t === 'p') { if (t.v === '(' || t.v === '[' || t.v === '{') d++; else if (t.v === ')' || t.v === ']' || t.v === '}') d--; else if (t.v === ',' && d === 0) n++; }
  }
  return any ? n + 1 - (isP(ft[b - 1], ',') ? 1 : 0) : 0;
}

// ---------- 卷文锚点 ----------
function headingLevel(l) { const m = /^(#{1,6})\s/.exec(l); return m ? m[1].length : 0; }
export function sectionRange(L, sec) {
  if (!sec) return null;
  const num = sec.replace(/^§/, '');
  const isNum = /^[0-9A-Z][0-9.A-Z]*$/.test(num) && sec.startsWith('§');
  const re = isNum ? new RegExp(`^#{1,6}\\s+${esc(num)}(?![0-9]|\\.[0-9])`) : null;
  const s = L.findIndex((l) => (re ? re.test(l) : headingLevel(l) > 0 && l.replace(/^#+\s+/, '').startsWith(sec)));
  if (s < 0) return null;
  const lv = headingLevel(L[s]);
  let e = L.length;
  for (let i = s + 1; i < L.length; i++) { const h = headingLevel(L[i]); if (h > 0 && h <= lv) { e = i; break; } }
  return [s, e];
}
function anchorOf(volumes, row) {
  const v = volumes.get(row.vol);
  if (!v) return { ok: false, why: `没有卷 ${row.vol}` };
  const r = sectionRange(v, row.sec);
  if (!r) return { ok: false, why: `${row.vol} 找不到节 ${row.sec}` };
  const re = wordRe(row.name);
  for (let i = r[0]; i < r[1]; i++) if (re.test(v[i])) return { ok: true, line: i + 1, text: v[i] };
  return { ok: false, why: `${row.vol} ${row.sec} 里没有名字 ${row.name}` };
}
const cells = (l) => l.split(/(?<!\\)\|/).slice(1, -1).map((x) => x.trim());
function docParamCount(line, name) { // 卷文表格首格 `name(a, b)` 的参数个数；写不成这个形状就 null
  if (!/^\|/.test(line)) return null;
  const first = cells(line)[0] || '';
  const m = new RegExp(`\`${esc(name)}\\(([^\`]*)\\)\``).exec(first);
  if (!m) return null;
  const inner = m[1].trim(); if (!inner) return 0;
  let d = 0; let n = 1;
  for (const c of inner) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c)) d--; else if (c === ',' && d === 0) n++; }
  return n;
}

// ---------- 主体：纯函数，输入全部由调用者给 ----------
// input: {files: Map<相对路径, 源码>, registry: {entries}, volumes: Map<卷, 行[]>, stateOwners: 对象|null}
export function deriveRegistry(input) {
  const { files, registry, volumes } = input;
  const entryPoint = input.entryPoint || ENTRY_POINT;
  const jsFiles = [...files.keys()].filter((f) => /\.(?:mjs|js)$/.test(f) && f !== SELF).sort(cmp);
  const fileSet = new Set(jsFiles);
  const resolveSpec = makeResolver(fileSet);
  const MOD = new Map();
  for (const f of jsFiles) MOD.set(f, parseModule(f, files.get(f), resolveSpec));
  const groupOf = (f) => (f.startsWith(`${PROD}/`) ? 'prod' : f.startsWith('tests/') ? 'tests' : 'tools');
  const serverRel = (f) => (f.startsWith(`${PROD}/`) ? f.slice(PROD.length + 1) : null);

  function originOf(file, name, seen = new Set()) {
    const key = `${file}\0${name}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const m = MOD.get(file);
    if (!m) return null;
    if (m.exportsLocal.has(name)) return { file, name: m.exportsLocal.get(name).local, line: m.exportsLocal.get(name).line };
    if (m.reexports.has(name)) { const r = m.reexports.get(name); return r.target ? originOf(r.target, r.imported, seen) : null; }
    for (const t of m.starFrom) { if (!t) continue; const o = originOf(t, name, seen); if (o) return o; }
    return null;
  }

  // 可达模块：从入口沿静态与字面量动态 import
  const reach = new Set();
  { const q = [entryPoint]; while (q.length) { const f = q.shift(); if (reach.has(f) || !MOD.has(f)) continue; reach.add(f); for (const imp of MOD.get(f).imps) { const t = resolveSpec(f, imp.spec); if (t) q.push(t); } } }

  // 使用处：目标声明（文件\0名）→ [{file, node, line, kind}]；kind = 调用 | 交入（register* 的实参）
  const sites = new Map();
  for (const f of jsFiles) {
    const m = MOD.get(f); const ft = m.ft;
    const stack = [];
    for (let i = 0; i < ft.length; i++) {
      const t = ft[i];
      if (t.t === 'p') {
        if (t.v === '(') stack.push(ft[i - 1] && ft[i - 1].t === 'id' ? ft[i - 1].v : '');
        else if (t.v === ')') stack.pop();
        continue;
      }
      if (t.t !== 'id' || m.importStmt.has(i)) continue;
      const prev = ft[i - 1];
      if (prev && (isP(prev, '.') || isP(prev, '?.'))) continue;
      let target = null; let nxt = i + 1;
      const b = m.bindings.find((x) => x.local === t.v);
      if (b && b.target) {
        if (b.imported === '*') { if ((isP(ft[i + 1], '.') || isP(ft[i + 1], '?.')) && ft[i + 2] && ft[i + 2].t === 'id') { target = originOf(b.target, ft[i + 2].v); nxt = i + 3; } }
        else target = originOf(b.target, b.imported);
      } else if (m.decls.has(t.v)) target = { file: f, name: t.v };
      if (!target) continue;
      if (m.decls.has(t.v) && !b && i === m.decls.get(t.v).start) continue; // 声明处自己
      const isCall = isP(ft[nxt], '(');
      const inRegister = stack.some((c) => REGISTER_CALLEE.test(c));
      if (!isCall && !inRegister) continue;
      const key = `${target.file}\0${target.name}`;
      const a = sites.get(key) || []; a.push({ file: f, node: m.nodeAt[i], line: t.line, kind: isCall ? '调用' : '交入' });
      sites.set(key, a);
    }
  }
  // 活节点：可达模块的顶层、入口文件的导出（init 由宿主调用）；沿使用处传播
  const live = new Set();
  const edgesFrom = new Map(); // 节点 → [目标节点]
  for (const [key, list] of sites) for (const s of list) { const from = `${s.file}\0${s.node}`; if (!edgesFrom.has(from)) edgesFrom.set(from, []); edgesFrom.get(from).push(key); }
  { const q = [];
    for (const f of reach) q.push(`${f}\0`);
    const em = MOD.get(entryPoint); if (em) for (const [n, ex] of em.exportsLocal) q.push(`${entryPoint}\0${ex.local}`);
    while (q.length) { const n = q.shift(); if (live.has(n)) continue; live.add(n); for (const t of edgesFrom.get(n) || []) q.push(t); } }

  // 提供方代码
  function providerOf(row) {
    if (!row.file) return null;
    const f = `${PROD}/${row.file}`;
    const m = MOD.get(f); if (!m) return null;
    const ex = m.exportsLocal.get(row.name);
    if (ex) { const d = m.decls.get(ex.local) || null; return { file: f, name: ex.local, line: ex.line, decl: d, exported: true }; }
    const re = m.reexports.get(row.name);
    if (re && re.target) { const o = originOf(re.target, re.imported); if (o) { const d = MOD.get(o.file).decls.get(o.name) || null; return { file: o.file, name: o.name, line: o.line, decl: d, exported: true }; } }
    if (m.decls.has(row.name)) { const d = m.decls.get(row.name); return { file: f, name: row.name, line: d.line, decl: d, exported: false }; }
    return null;
  }

  const rowsIn = registry.entries || [];
  const keyOf = (r) => `${r.file || ''}#${r.name}`;
  const byKey = new Map();
  const problems = { 重复行键: [], 锚点缺失: [], needs指向不存在: [], needs环: [], 代码已导出但file为空或不符: [], 状态文件中的文件函数不在表里: [], 卷文首格不在表里: [], 代码依赖不在needs里: [], 签名参数个数不同: [], 同名另定义: [], kind不合法: [] };
  for (const r of rowsIn) { const k = keyOf(r); if (byKey.has(k)) problems.重复行键.push(k); else byKey.set(k, r); }
  const kinds = new Set(registry.kinds || []);
  const byName = new Map();
  for (const r of rowsIn) { if (!byName.has(r.name)) byName.set(r.name, []); byName.get(r.name).push(r); }
  const resolveNeed = (n) => {
    if (byKey.has(n)) return keyOf(byKey.get(n));
    const bare = n.replace(/^.*#/, '');
    const c = byName.get(bare) || [];
    return c.length === 1 && !n.includes('#') ? keyOf(c[0]) : null;
  };

  const out = [];
  for (const r of rowsIn) {
    if (kinds.size && !kinds.has(r.kind)) problems.kind不合法.push(`${keyOf(r)}:${r.kind}`);
    const row = { 行键: keyOf(r), name: r.name, file: r.file, vol: r.vol, sec: r.sec, kind: r.kind };
    // 卷文锚点
    if (r.vol) {
      const a = anchorOf(volumes, r);
      if (a.ok) row.卷文行 = `${r.vol}:${a.line}`; else { row.卷文行 = null; problems.锚点缺失.push(`${keyOf(r)}：${a.why}`); }
      row._doc = a.ok ? a.text : null;
    } else row.卷文行 = null;
    // 提供方
    const p = providerOf(r);
    let state = '未建'; let why = '没有同名定义';
    row.提供方代码 = '未建'; row.生产调用 = []; row.死调用点 = []; row.测试调用 = []; row.工具调用 = []; row.代码依赖 = [];
    if (p) {
      row.提供方代码 = `${p.file}:${p.line}${p.exported ? '' : '（未导出，仅文件内部）'}`;
      const key = `${p.file}\0${p.name}`;
      const list = (sites.get(key) || []).filter((s) => !(s.file === p.file && s.node === p.name));
      for (const s of list) {
        const g = groupOf(s.file); const txt = `${s.file}:${s.line}（${s.kind}）`;
        if (g === 'tests') row.测试调用.push(txt);
        else if (g === 'tools') row.工具调用.push(txt);
        else if (live.has(`${s.file}\0${s.node}`)) row.生产调用.push(txt);
        else row.死调用点.push(`${txt}（所在${s.node ? `函数 ${s.node}` : '模块'}未接通）`);
      }
      if (!p.exported) { state = '有代码无生产调用'; why = '只有文件内部的同名函数，没有导出'; }
      else if (row.生产调用.length) { state = '已接通'; why = `活的生产调用点 ${row.生产调用.length} 处`; }
      else { state = '有代码无生产调用'; why = row.死调用点.length ? '调用点都在未接通的函数里（死调用点）' : row.测试调用.length ? '仅测试调用' : row.工具调用.length ? '仅工具调用' : '没有任何调用点'; }
      // 代码依赖：提供方函数体里调用的其他登记行
      if (p.decl) {
        const deps = new Set();
        for (const [k2, list2] of sites) for (const s of list2) if (s.file === p.file && s.node === p.name && s.kind === '调用') { const [tf, tn] = k2.split('\0'); const tr = serverRel(tf); const tk = `${tr}#${tn}`; if (tk !== row.行键 && byKey.has(tk)) deps.add(tk); }
        row.代码依赖 = [...deps].sort(cmp);
      }
      const sc = serverRel(p.file);
      if (sc !== r.file) problems.代码已导出但file为空或不符.push(`${row.行键}：代码在 ${sc}`);
      if (p.decl && row._doc) { const dn = docParamCount(row._doc, r.name); const cn = paramCount(MOD.get(p.file).ft, p.decl.params); if (dn !== null && cn !== null && dn !== cn) problems.签名参数个数不同.push(`${row.行键}：卷文 ${dn} 个，代码 ${cn} 个`); }
      // 绕开 b：别处自有同名顶层定义、不经提供方
      for (const [f, m] of MOD) { if (groupOf(f) !== 'prod' || f === p.file) continue; if (m.decls.has(r.name) && !m.bindings.some((b) => b.local === r.name)) row.同名另定义 = [...(row.同名另定义 || []), `${f}:${m.decls.get(r.name).line}`]; }
      if (row.同名另定义) problems.同名另定义.push(`${row.行键}：${row.同名另定义.join('、')}`);
    } else if (r.file === null || r.file === '') {
      for (const [f, m] of MOD) if (groupOf(f) === 'prod' && m.exportsLocal.has(r.name)) problems.代码已导出但file为空或不符.push(`${row.行键}：代码已在 ${serverRel(f)} 导出`);
    }
    row.接通状态 = state; row.接通说明 = why;
    const needs = [];
    for (const n of r.needs || []) { const k = resolveNeed(n); if (k) needs.push(k); else problems.needs指向不存在.push(`${row.行键} → ${n}`); }
    row.needs = [...new Set(needs)].sort(cmp);
    // 没有卷文出处的行（kernel、part）没有卷文调用句可填 needs，代码依赖只在有卷文锚点的行上对照
    if (r.vol) for (const d of row.代码依赖) if (!row.needs.includes(d)) problems.代码依赖不在needs里.push(`${row.行键} → ${d}`);
    row.rules = r.rules || [];
    out.push(row);
  }
  for (const row of out) delete row._doc;
  out.sort((a, b) => cmp(a.行键, b.行键));

  // 依赖次序：needs 边，被依赖的在前；环单独列
  const adj = new Map(out.map((r) => [r.行键, new Set(r.needs)]));
  let idx = 0; const stack = []; const on = new Set(); const index = new Map(); const low = new Map(); const sccs = [];
  const visit = (v) => {
    index.set(v, idx); low.set(v, idx); idx++; stack.push(v); on.add(v);
    for (const w of [...adj.get(v)].sort(cmp)) { if (!adj.has(w)) continue; if (!index.has(w)) { visit(w); low.set(v, Math.min(low.get(v), low.get(w))); } else if (on.has(w)) low.set(v, Math.min(low.get(v), index.get(w))); }
    if (low.get(v) === index.get(v)) { const c = []; let w; do { w = stack.pop(); on.delete(w); c.push(w); } while (w !== v); sccs.push(c.sort(cmp)); }
  };
  for (const v of [...adj.keys()].sort(cmp)) if (!index.has(v)) visit(v);
  problems.needs环 = sccs.filter((c) => c.length > 1 || adj.get(c[0]).has(c[0]));
  const comp = new Map(); sccs.forEach((c, i) => c.forEach((n) => comp.set(n, i)));
  const lvl = new Map();
  const levelOf = (ci) => { if (lvl.has(ci)) return lvl.get(ci); lvl.set(ci, 0); let lv = 0; for (const n of sccs[ci]) for (const d of adj.get(n)) { if (!comp.has(d)) continue; const cj = comp.get(d); if (cj !== ci) lv = Math.max(lv, levelOf(cj) + 1); } lvl.set(ci, lv); return lv; };
  const order = out.map((r) => ({ 行键: r.行键, 层: levelOf(comp.get(r.行键)) })).sort((a, b) => a.层 - b.层 || cmp(a.行键, b.行键));
  const level = new Map(order.map((o) => [o.行键, o.层]));
  for (const r of out) r.层 = level.get(r.行键);
  // 设计上的调用方：其他行 needs 的反查
  const callersDesign = new Map();
  for (const r of out) for (const d of r.needs) { if (!callersDesign.has(d)) callersDesign.set(d, []); callersDesign.get(d).push(r.行键); }
  for (const r of out) r.设计上的调用方 = (callersDesign.get(r.行键) || []).sort(cmp);

  // 状态文件里的 文件#函数 必须在表里
  if (input.stateOwners) {
    const seen = new Set();
    const walkJson = (v) => { if (typeof v === 'string') { if (KEY_RE.test(v) && v.includes('.mjs#')) seen.add(v); } else if (Array.isArray(v)) v.forEach(walkJson); else if (v && typeof v === 'object') Object.values(v).forEach(walkJson); };
    walkJson(input.stateOwners);
    for (const k of [...seen].sort(cmp)) if (!byKey.has(k)) problems.状态文件中的文件函数不在表里.push(k);
  }
  // 卷文每个 §3.1 首格 `名(…)` 必须在表里（名字在表里任一行）
  for (const [vol, L] of [...volumes].sort((a, b) => cmp(a[0], b[0]))) {
    const rg = sectionRange(L, '§3.1'); if (!rg) continue;
    if (!/读入口|入口/.test(L[rg[0]])) continue;
    let fence = false;
    for (let i = rg[0] + 1; i < rg[1]; i++) {
      const l = L[i];
      if (/^```/.test(l)) { fence = !fence; continue; }
      if (fence || !/^\|/.test(l) || /^\|\s*:?-{3}/.test(l)) continue;
      for (const m of (cells(l)[0] || '').matchAll(/`([a-z][A-Za-z0-9_]{2,})\(/g)) if (!byName.has(m[1])) problems.卷文首格不在表里.push(`${vol}:${i + 1} ${m[1]}`);
    }
  }
  const count = (s) => out.filter((r) => r.接通状态 === s).length;
  const summary = { 行数: out.length, 已接通: count('已接通'), 有代码无生产调用: count('有代码无生产调用'), 未建: count('未建'), 无卷文锚点的行: out.filter((r) => !r.vol).length, 最大层: order.length ? order[order.length - 1].层 : 0 };
  const hard = ['重复行键', '锚点缺失', 'needs指向不存在', 'needs环', '代码已导出但file为空或不符', '状态文件中的文件函数不在表里', '卷文首格不在表里', 'kind不合法'];
  return { summary, problems, hardProblems: hard.reduce((s, k) => s + problems[k].length, 0), rows: out, order };
}

// ---------- 读盘 ----------
function walk(root, rel, acc) {
  const abs = join(root, rel);
  if (!existsSync(abs)) return acc;
  for (const name of readdirSync(abs).sort(cmp)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const r = `${rel}/${name}`;
    if (statSync(join(root, r)).isDirectory()) walk(root, r, acc); else if (/\.(?:mjs|js)$/.test(name)) acc.push(r);
  }
  return acc;
}
export function loadInput(root = ROOT) {
  const files = new Map();
  for (const base of [PROD, 'tests', 'tools']) for (const f of walk(root, base, [])) files.set(f, readFileSync(join(root, f), 'utf8'));
  const volumes = new Map();
  for (const f of readdirSync(join(root, DESIGN)).filter((x) => /^卷.*\.md$/.test(x)).sort(cmp)) volumes.set(f.split('-')[0], readFileSync(join(root, DESIGN, f), 'utf8').split(/\r?\n/));
  // 登记表与 state-owners 都按主文件与分片的合并结果读（S2-SH）。
  const { registry } = readEntryRegistry(root);
  return { files, volumes, registry, stateOwners: readOwnersFiles(root).doc };
}

function main(argv) {
  const check = argv.includes('--check');
  const oi = argv.indexOf('--out');
  const res = deriveRegistry(loadInput());
  if (oi >= 0 && argv[oi + 1]) writeCliOut(ROOT, resolve(argv[oi + 1]), `${JSON.stringify(res, null, 1)}\n`);
  const s = res.summary;
  const lines = [`总登记表 ${s.行数} 行：已接通 ${s.已接通}，有代码无生产调用 ${s.有代码无生产调用}，未建 ${s.未建}；无卷文锚点的行 ${s.无卷文锚点的行}（kind 为 kernel/part，出处在状态文件或代码）；依赖最大层 ${s.最大层}`];
  for (const [k, v] of Object.entries(res.problems)) lines.push(`${k}：${v.length}${v.length && !argv.includes('--quiet') ? `（前 5：${v.slice(0, 5).map((x) => (Array.isArray(x) ? x.join('→') : x)).join('；')}）` : ''}`);
  console.log(lines.join('\n'));
  if (check && res.hardProblems) process.exit(1);
}
if (process.argv[1] && resolve(process.argv[1]).replace(/\\/g, '/') === resolve(fileURLToPath(import.meta.url)).replace(/\\/g, '/')) main(process.argv.slice(2));
