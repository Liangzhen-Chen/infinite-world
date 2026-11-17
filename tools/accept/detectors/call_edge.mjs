// 检测器 call_edge（卷十二 §2.3）：某函数的调用者不在登记集合内。
// params.groups / facs / modules：范围（read.mjs scopeFiles）；params.callers：登记的调用者（门禁设施代号，只取设施文件本身）；
// params.callees：被调函数表所在的扫描类别代号，函数表取各类别登记行的 callees：{模块说明符: {调用链: [路径实参位置]}}，
// 模块说明符为空串的是全局名；调用链以 `()` 结尾的只在零实参时算（`new Date()`、`Date()`）。
// 路径实参位置非空的（卷十二 S12-2 判法后半，`lit_scope` 一侧）：各位置的实参经常量折叠得出相对路径、且不落在本条目类别登记行
// guardedPaths 的模式内，才不计；算不出常量（拼接、变量、调用）、绝对路径或越出仓库的 `..` 都计入。
// 测试临时根（params.roots：gatefac 代号，inRepo 为假）：路径实参是临时根变量本身，或 join/resolve(临时根, 常量相对路径) 的，也不计
// （李白 11-17 裁定三）；登记写入口（gatefac 的 assertedWriters）的函数体，在先调用断言（writerAsserts）之后的部分不计（裁定四收窄）；临时根变量只认 `const 名 = 登记函数(…)`，其余（拼接、变量路径、别的来源）一律计入。
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
    const exempt = assertedBodies(toks, roots.get(file));
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i];
      if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
      const ex = exempt.find(([a, b]) => i > a && i < b);
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
      // 写函数豁免：断言返回值绑定的变量须出现在每个路径实参里；字面量路径、别的变量照计。
      if (ex && positions.length > 0 && positions.every((p) => args[p] && usesName(toks, args[p], ex[2]))) continue;
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
  return hits.concat(requiredTestHits(ctx, roots, params));
}

// 必跑测试（李白 11-17 裁定②）：写函数豁免靠断言函数"应抛错"的测试守着，所以豁免用得上时（登记辅助文件在、且里面声明了 assertedWriters 的函数），
// 该 gatefac 行 requiredTests（[{file, names}]）所列测试必须存在、每次门禁必跑：文件在、文件匹配 testGlobs（门禁运行的测试集合，登记数据）、
// 名字（标题前缀）在 node:test 导入名的顶层语句里有一条、且不是 skip/todo/only（含选项对象与体内的 skip、todo 标识）、文件内没有 only。缺失或被跳过各计一行。
function requiredTestHits(ctx, roots, params) {
  const hits = [];
  const add = (file, sym) => hits.push({ file, line: 0, nodeKind: 'test', symbolPath: sym, code: params.code || '' });
  const files = new Set(ctx.files);
  for (const [helper, fac] of roots) {
    if (!files.has(helper) || !fac.writers.size || !fac.required.length) continue;
    const htoks = tokenize(ctx.read(helper));
    const used = [...fac.writers].some((w) => htoks.some((t, i) => t.t === 'id' && t.v === 'function' && htoks[i + 1] && htoks[i + 1].v === w));
    if (!used) continue;
    for (const req of fac.required) {
      if (!files.has(req.file) || !matchGlobs(req.file, fac.testGlobs, [])) { add(req.file, '*'); continue; }
      const found = topLevelTests(tokenize(ctx.read(req.file)));
      for (const name of req.names || []) {
        const ok = !found.only && found.tests.some((t) => t.title.startsWith(name) && !t.skipped);
        if (!ok) add(req.file, name);
      }
    }
  }
  return hits;
}

// 文件里经 node:test 导入的 test/it（含默认导入、别名）的顶层语句调用：标题（首实参字符串）与是否 skip/todo。
function topLevelTests(toks) {
  const names = new Set();
  for (const imp of importsOf(toks)) {
    if (imp.kind !== 'static' || imp.spec !== 'node:test') continue;
    for (const n of imp.names) if (n.imported === 'test' || n.imported === 'it') names.add(n.local);
    const a = toks[imp.at + 1];
    if (a && a.t === 'id' && a.v !== 'from') names.add(a.v);
  }
  const tests = []; let only = false; let depth = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isP(t, '{') || isP(t, '(') || isP(t, '[')) depth++;
    else if (isP(t, '}') || isP(t, ')') || isP(t, ']')) depth--;
    if (t.t !== 'id' || !names.has(t.v) || depth !== 0 || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
    if (i > 0 && !(isP(toks[i - 1], ';') || isP(toks[i - 1], '}'))) continue;
    let k = i + 1; let flagged = false;
    while (isP(toks[k], '.') && toks[k + 1] && toks[k + 1].t === 'id') { if (toks[k + 1].v === 'only') only = true; else flagged = true; k += 2; }
    if (!isP(toks[k], '(')) continue;
    const close = matchClose(toks, k);
    const first = toks[k + 1];
    if (!first || first.t !== 'str') continue;
    for (let m = k + 1; m < close; m++) if (toks[m].t === 'id' && ['skip', 'todo'].includes(toks[m].v)) flagged = true;
    tests.push({ title: first.v, skipped: flagged });
  }
  return { tests, only };
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
    for (const p of g.paths) {
      const cur = out.get(p) || { entries: new Set(), writers: new Set(), asserts: new Set() };
      for (const e of g.entries) cur.entries.add(e);
      // 没有 requiredTests 就不给写函数豁免（删掉必跑测试登记不能绕过守卫）。
      if (Array.isArray(g.requiredTests) && g.requiredTests.length) for (const w of Array.isArray(g.assertedWriters) ? g.assertedWriters : []) cur.writers.add(w);
      for (const a of Array.isArray(g.writerAsserts) ? g.writerAsserts : []) cur.asserts.add(a);
      cur.required = (Array.isArray(g.requiredTests) ? g.requiredTests : []).concat(cur.required || []);
      cur.testGlobs = (Array.isArray(g.testGlobs) ? g.testGlobs : []).concat(cur.testGlobs || []);
      out.set(p, cur);
    }
  }
  return out;
}

// 写函数豁免（李白 11-17 裁定四之收窄）：登记辅助文件里，名字在该 gatefac 行 assertedWriters 内的函数声明，
// 函数体内、首个"断言调用"之后的部分算登记写入口自己的实现不计；断言调用指函数体顶层、以语句开头（或 const 名 = 断言(…)）的对 writerAsserts 所列、
// 且本文件里有函数声明的名字的调用。找不到断言调用（缺断言、断言只在分支内或无括号 if、&&、箭头函数里、名字未声明）则整个函数体照计；断言之前的写入照计。
// 判据只读登记数据，不写具体函数名；tempRepo、testTempRoot 这类只在 entries 里的函数体照常扫。返回豁免区间 [起, 止] 的记号下标。
function assertedBodies(toks, fac) {
  const out = [];
  if (!fac || !fac.writers.size) return out;
  const declared = new Set();
  for (let i = 0; i + 1 < toks.length; i++) if (toks[i].t === 'id' && toks[i].v === 'function' && toks[i + 1].t === 'id') declared.add(toks[i + 1].v);
  for (let i = 0; i + 2 < toks.length; i++) {
    if (toks[i].t !== 'id' || toks[i].v !== 'function' || toks[i + 1].t !== 'id' || !fac.writers.has(toks[i + 1].v) || !isP(toks[i + 2], '(')) continue;
    const pc = matchClose(toks, i + 2);
    if (!isP(toks[pc + 1], '{')) continue;
    const end = matchClose(toks, pc + 1);
    let depth = 0; let paren = 0;
    for (let k = pc + 2; k < end; k++) {
      if (isP(toks[k], '{')) depth++;
      else if (isP(toks[k], '}')) depth--;
      else if (isP(toks[k], '(') || isP(toks[k], '[')) paren++;
      else if (isP(toks[k], ')') || isP(toks[k], ']')) paren--;
      else if (depth === 0 && paren === 0 && toks[k].t === 'id' && fac.asserts.has(toks[k].v) && declared.has(toks[k].v) && isP(toks[k + 1], '(')) {
        const name = boundName(toks, k, pc + 1);
        if (!name) continue;
        const from = matchClose(toks, k + 1);
        let reassigned = false;
        for (let m = from + 1; m < end; m++) {
          if (toks[m].t === 'id' && toks[m].v === name && !isP(toks[m - 1], '.') && (ASSIGN.some((o) => isP(toks[m + 1], o)) || isP(toks[m - 1], '++') || isP(toks[m - 1], '--'))) reassigned = true;
        }
        if (!reassigned) out.push([from, end, name]);
        break;
      }
    }
  }
  return out;
}

// 断言调用须写成顶层语句 `const|let|var 名 = 断言(…)`（李白 11-17 裁定①：断言返回规范化后的完整路径，写入只认这个绑定变量），
// 语句前一记号是函数体 `{`、`;` 或收尾的 `}`；返回绑定的变量名，不是这种写法返回 null。
// `if (c) 断言(…);`、`c && 断言(…)`、`() => 断言(…)`、`return 断言(…)`、不绑返回值的裸调用，都不算已断言。
function boundName(toks, k, bodyOpen) {
  const eq = k - 1; const id = k - 2; const decl = k - 3; const before = k - 4;
  if (!isP(toks[eq], '=') || !toks[id] || toks[id].t !== 'id' || !toks[decl] || toks[decl].t !== 'id' || !['const', 'let', 'var'].includes(toks[decl].v)) return null;
  if (before === bodyOpen || isP(toks[before], ';') || isP(toks[before], '}')) return toks[id].v;
  return null;
}

// 路径实参表达式里出现了绑定变量（不是别的对象的同名成员）。
function usesName(toks, [s, e], name) {
  for (let k = s; k < e; k++) if (toks[k].t === 'id' && toks[k].v === name && !isP(toks[k - 1], '.') && !isP(toks[k - 1], '?.')) return true;
  return false;
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
      const fac = roots.get(posix.join(posix.dirname(file), imp.spec));
      if (fac) for (const n of imp.names) if (fac.entries.has(n.imported)) fns.add(n.local);
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
