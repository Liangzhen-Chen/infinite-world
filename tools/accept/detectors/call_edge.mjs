// 检测器 call_edge（卷十二 §2.3）：某函数的调用者不在登记集合内。
// params.groups / facs / modules：范围（read.mjs scopeFiles）；params.callers：登记的调用者（门禁设施代号，只取设施文件本身）；
// params.callees：被调函数表所在的扫描类别代号，函数表取各类别登记行的 callees：{模块说明符: {调用链: [路径实参位置]}}，
// 模块说明符为空串的是全局名；调用链以 `()` 结尾的只在零实参时算（`new Date()`、`Date()`）。
// 路径实参位置非空的（卷十二 S12-2 判法后半，`lit_scope` 一侧）：各位置的实参经常量折叠得出相对路径、且不落在本条目类别登记行
// guardedPaths 的模式内，才不计；算不出常量（拼接、变量、调用）、绝对路径或越出仓库的 `..` 都计入。
// 测试临时根（params.roots：gatefac 代号，inRepo 为假）：路径实参是临时根变量本身，或 join/resolve(临时根, 常量相对路径) 的，也不计
// （李白 11-17 裁定三）；临时根变量只认 `const 名 = 登记函数(…)`，其余（拼接、变量路径、别的来源）一律计入。
// 局限：按词法读，`const w = fs.writeFileSync` 这类别名、require 解构、动态 import 取到的函数追不到（待块 2 类型检查）。

import { tokenize, foldAt, buildEnv, importsOf, symbolPaths, isP, matchClose } from '../lib/js-scan.mjs';
import { scopeFiles, facilityFiles, matchGlobs } from '../read.mjs';
import { posix } from 'node:path';

export function detect(ctx, params, cls) {
  const table = {};
  const rows = new Map((ctx.regs.scanclasses || []).map((c) => [c.scanClass, c]));
  for (const c of params.callees || []) {
    for (const [mod, entries] of Object.entries((rows.get(c) || {}).callees || {})) table[mod] = { ...(table[mod] || {}), ...entries };
  }
  const guarded = (cls || {}).guardedPaths || [];
  const joins = (cls || {}).joinFns || {};
  const allowed = facilityFiles(ctx, params.callers);
  const roots = rootFacilities(ctx, params.roots);
  const hits = [];
  for (const file of scopeFiles(ctx, params)) {
    if (allowed.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const env = buildEnv(toks);
    const sym = symbolPaths(toks);
    const bind = bindings(toks, table);
    const rootNames = rootBindings(toks, file, roots);
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
      const segs = []; let k = i + 1;
      while ((isP(toks[k], '.') || isP(toks[k], '?.')) && toks[k + 1] && toks[k + 1].t === 'id') { segs.push(toks[k + 1].v); k += 2; }
      if (!isP(toks[k], '(')) continue;
      const b = bind.get(t.v);
      const mod = b ? b.mod : '';
      const chain = (b ? b.prefix : [t.v]).concat(segs).join('.');
      const entries = Object.hasOwn(table, mod) ? table[mod] : {};
      const close = matchClose(toks, k);
      const own = (key) => (Object.hasOwn(entries, key) ? entries[key] : undefined);
      const positions = own(chain) || (close === k + 1 ? own(`${chain}()`) : undefined);
      if (!Array.isArray(positions)) continue;
      const args = splitArgs(toks, k, close);
      const provable = positions.length > 0 && positions.every((p) => {
        const a = args[p];
        if (!a) return false;
        const r = foldAt(toks, a[0], env);
        if (r && r.end === a[1] && r.val.k === 'str' && outside(r.val.v, guarded)) return true;
        return underRoot(toks, a, env, rootNames, joins);
      });
      if (!provable) hits.push({ file, line: t.line, nodeKind: 'call', symbolPath: sym[i], code: params.code || '' });
    }
  }
  return hits;
}

// 本文件从函数表所列模块 import 进来的名字：具名导入 → 该成员；默认与命名空间导入 → 模块本身。
function bindings(toks, table) {
  const out = new Map();
  for (const imp of importsOf(toks)) {
    if (imp.kind !== 'static' || !imp.spec || !Object.hasOwn(table, imp.spec)) continue;
    for (const n of imp.names) out.set(n.local, { mod: imp.spec, prefix: [n.imported] });
    const a = toks[imp.at + 1];
    if (a && a.t === 'id' && a.v !== 'from') out.set(a.v, { mod: imp.spec, prefix: [] });
    if (isP(a, '*') && toks[imp.at + 2] && toks[imp.at + 2].v === 'as' && toks[imp.at + 3]) out.set(toks[imp.at + 3].v, { mod: imp.spec, prefix: [] });
  }
  return out;
}

// 测试临时根（卷十二 §2.11 gatefac，inRepo 为假）：params.roots 是门禁设施代号；该行 paths 是生成临时根的辅助文件，entries 是函数名。
function rootFacilities(ctx, codes) {
  const facs = new Map((ctx.regs.gatefacs || []).map((g) => [g.facCode, g]));
  const out = new Map();
  for (const c of codes || []) {
    const g = facs.get(c);
    if (!g || g.inRepo !== false || !Array.isArray(g.paths) || !Array.isArray(g.entries)) continue;
    for (const p of g.paths) out.set(p, new Set([...(out.get(p) || []), ...g.entries]));
  }
  return out;
}

// 赋值与自增自减记号：变量被重新赋值（含复合赋值）就不再是临时根（李白 11-17 裁定三）。
const ASSIGN = ['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=', '++', '--'];

// 本文件里的临时根变量：名字的每一处声明都是 `const|let|var 名 = 临时根函数(…)`（函数是从登记的辅助文件 import 来的），
// 且没有被别处赋值、没有同名的函数参数；任何一条不满足就不认。
function rootBindings(toks, file, roots) {
  const fns = new Set();
  if (roots.size) {
    for (const imp of importsOf(toks)) {
      if (imp.kind !== 'static' || !imp.spec || !imp.spec.startsWith('.')) continue;
      const entries = roots.get(posix.join(posix.dirname(file), imp.spec));
      if (entries) for (const n of imp.names) if (entries.has(n.imported)) fns.add(n.local);
    }
  }
  if (!fns.size) return new Set();
  const good = new Set(); const bad = new Set();
  const params = paramNames(toks);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
    const decl = i > 0 && toks[i - 1].t === 'id' && ['const', 'let', 'var'].includes(toks[i - 1].v);
    const rooted = decl && isP(toks[i + 1], '=') && toks[i + 2] && fns.has(toks[i + 2].v) && isP(toks[i + 3], '(');
    if (params.has(t.v)) bad.add(t.v);
    else if (rooted) good.add(t.v);
    else if (decl || ASSIGN.some((o) => isP(toks[i + 1], o)) || isP(toks[i - 1], '++') || isP(toks[i - 1], '--')) bad.add(t.v);
  }
  return new Set([...good].filter((n) => !bad.has(n)));
}

// 全部函数参数名（箭头函数、function）：多收不漏。
function paramNames(toks) {
  const out = new Set();
  const take = (a, b) => { for (let k = a; k < b; k++) if (toks[k].t === 'id') out.add(toks[k].v); };
  for (let i = 0; i < toks.length; i++) {
    if (isP(toks[i], '=>')) {
      if (isP(toks[i - 1], ')')) { let d = 0; for (let k = i - 1; k >= 0; k--) { if (isP(toks[k], ')')) d++; else if (isP(toks[k], '(') && --d === 0) { take(k + 1, i - 1); break; } } }
      else if (toks[i - 1] && toks[i - 1].t === 'id') out.add(toks[i - 1].v);
    } else if (toks[i].t === 'id' && toks[i].v === 'function') {
      const k = toks.findIndex((x, j) => j > i && isP(x, '('));
      if (k > 0) take(k + 1, matchClose(toks, k));
    }
  }
  return out;
}

// 路径实参是"临时根"本身，或 join/resolve(临时根, 常量相对路径…)（函数取自本类别登记行 joinFns：{模块: [函数名]}，须是 import 来的）。
function underRoot(toks, [s, e], env, rootNames, joins) {
  if (!rootNames.size) return false;
  if (e - s === 1) return toks[s].t === 'id' && rootNames.has(toks[s].v);
  if (toks[s].t !== 'id' || !isP(toks[s + 1], '(') || matchClose(toks, s + 1) !== e - 1) return false;
  const ok = importsOf(toks).some((imp) => imp.kind === 'static' && Object.hasOwn(joins, imp.spec) && imp.names.some((n) => n.local === toks[s].v && joins[imp.spec].includes(n.imported)));
  if (!ok) return false;
  const parts = splitArgs(toks, s + 1, e - 1);
  if (parts.length < 1 || parts[0][1] - parts[0][0] !== 1 || !rootNames.has(toks[parts[0][0]].v)) return false;
  const rel = [];
  for (const p of parts.slice(1)) {
    const r = foldAt(toks, p[0], env);
    if (!r || r.end !== p[1] || r.val.k !== 'str') return false;
    rel.push(r.val.v);
  }
  const n = posix.normalize(rel.join('/').replace(/\\/g, '/') || '.');
  return !(n.startsWith('/') || /^[A-Za-z]:/.test(n) || n === '..' || n.startsWith('../'));
}

// 调用括号内按顶层逗号切出各实参的 [起, 止)。
function splitArgs(toks, open, close) {
  const out = []; let start = open + 1; let depth = 0;
  for (let k = open + 1; k < close; k++) {
    const t = toks[k];
    if (t.t === 'p' && (t.v === '(' || t.v === '[' || t.v === '{')) depth++;
    else if (t.t === 'p' && (t.v === ')' || t.v === ']' || t.v === '}')) depth--;
    else if (depth === 0 && isP(t, ',')) { out.push([start, k]); start = k + 1; }
  }
  if (start < close) out.push([start, close]);
  return out;
}

function outside(path, guarded) {
  const p = posix.normalize(path.replace(/\\/g, '/'));
  if (p.startsWith('/') || /^[A-Za-z]:/.test(p) || p === '..' || p.startsWith('../')) return false;
  return !matchGlobs(p, guarded, []);
}
