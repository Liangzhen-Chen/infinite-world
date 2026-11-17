// 检测器 call_edge（卷十二 §2.3）：某函数的调用者不在登记集合内。
// params.groups / facs / modules：范围（read.mjs scopeFiles）；params.callers：登记的调用者（门禁设施代号，只取设施文件本身）；
// params.callees：被调函数表所在的扫描类别代号，函数表取各类别登记行的 callees：{模块说明符: {调用链: [路径实参位置]}}，
// 模块说明符为空串的是全局名；调用链以 `()` 结尾的只在零实参时算（`new Date()`、`Date()`）。
// 路径实参位置非空的（卷十二 S12-2 判法后半，`lit_scope` 一侧）：各位置的实参经常量折叠得出相对路径、且不落在本条目类别登记行
// guardedPaths 的模式内，才不计；算不出常量（拼接、变量、调用）、绝对路径或越出仓库的 `..` 都计入。
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
  const allowed = facilityFiles(ctx, params.callers);
  const hits = [];
  for (const file of scopeFiles(ctx, params)) {
    if (allowed.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const env = buildEnv(toks);
    const sym = symbolPaths(toks);
    const bind = bindings(toks, table);
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
        return Boolean(r && r.end === a[1] && r.val.k === 'str' && outside(r.val.v, guarded));
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
