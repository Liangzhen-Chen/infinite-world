// 卷十二 §2.3 检测器共用的源码读取：词法切分、常量折叠（R12-1.3、R12-4.2）、import 说明符、成员链、符号链（R12-8.2）。
// 只认结构，不认名字：本文件没有文件名、条目名、前缀的字面量。
// 局限（写进 P-1 汇报）：这是词法级读取，不是带类型的语法树；类型位置检测（typed_pos）要等块 2 引入类型检查。

const KEYWORD_BEFORE_EXPR = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw',
  'case', 'do', 'else', 'yield', 'await', 'export', 'default', 'extends']);
const PUNCTS = ['>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=', '=>', '==', '!=', '<=', '>=',
  '&&', '||', '??', '?.', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
  '{', '}', '(', ')', '[', ']', ';', ',', '<', '>', '+', '-', '*', '/', '%', '&', '|', '^', '!', '~', '?', ':', '=', '.', '@'];
const NUM_RE = /^(?:0[xX][0-9a-fA-F_]+n?|0[oO][0-7_]+n?|0[bB][01_]+n?|(?:\d[\d_]*\.?[\d_]*|\.\d[\d_]*)(?:[eE][+-]?\d[\d_]*)?n?)/;
const ID_RE = /^#?[A-Za-z_$\u0080-￿][\w$\u0080-￿]*/;

// 二元运算符优先级（ECMAScript 规范次序）；`**` 右结合。
const BIN_PREC = {
  '??': 1, '||': 2, '&&': 3, '|': 4, '^': 5, '&': 6, '==': 7, '!=': 7, '===': 7, '!==': 7,
  '<': 8, '>': 8, '<=': 8, '>=': 8, 'instanceof': 8, 'in': 8, '<<': 9, '>>': 9, '>>>': 9,
  '+': 10, '-': 10, '*': 11, '/': 11, '%': 11, '**': 12,
};
const UNARY_PREC = 13;
const UNARY_OPS = new Set(['-', '+', '~', '!']);

function exprAllowedAfter(prev) {
  if (!prev) return true;
  if (prev.t === 'p') return prev.v !== ')' && prev.v !== ']';
  if (prev.t === 'id') return KEYWORD_BEFORE_EXPR.has(prev.v);
  return false;
}

function readEscape(src, i) {
  const c = src[i];
  const simple = { n: '\n', t: '\t', r: '\r', b: '\b', f: '\f', v: '\v', 0: '\0' };
  if (c === 'x') return [String.fromCharCode(parseInt(src.slice(i + 1, i + 3), 16)), i + 3];
  if (c === 'u') {
    if (src[i + 1] === '{') {
      const end = src.indexOf('}', i);
      return [String.fromCodePoint(parseInt(src.slice(i + 2, end), 16)), end + 1];
    }
    return [String.fromCharCode(parseInt(src.slice(i + 1, i + 5), 16)), i + 5];
  }
  if (c === '\r' && src[i + 1] === '\n') return ['', i + 2];
  if (c === '\n' || c === '\r' || c === ' ' || c === ' ') return ['', i + 1];
  if (c in simple && !(c === '0' && /\d/.test(src[i + 1] || ''))) return [simple[c], i + 1];
  return [c, i + 1];
}

function numValue(raw) {
  const s = raw.replace(/_/g, '');
  if (s.endsWith('n')) return BigInt(s.slice(0, -1));
  return Number(s);
}

// 词法切分。返回 token 数组；模板字面量是一个 token，带 quasis 与 exprs（各自是 token 数组）。
export function tokenize(src) {
  const st = { src, i: 0, line: 1 };
  if (src.startsWith('#!')) { while (st.i < src.length && src[st.i] !== '\n') st.i++; }
  return lexUntil(st, false);
}

function lexUntil(st, stopAtBrace) {
  const { src } = st;
  const out = [];
  let depth = 0;
  let nl = false;
  const prevSig = () => out[out.length - 1];
  while (st.i < src.length) {
    const c = src[st.i];
    if (c === '\n') { st.line++; st.i++; nl = true; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v' || c === ' ' || c === '﻿' || c === ' ' || c === ' ') { st.i++; continue; }
    if (c === '/' && src[st.i + 1] === '/') { while (st.i < src.length && src[st.i] !== '\n') st.i++; continue; }
    if (c === '/' && src[st.i + 1] === '*') {
      const end = src.indexOf('*/', st.i + 2);
      const stop = end < 0 ? src.length : end + 2;
      for (let k = st.i; k < stop; k++) if (src[k] === '\n') { st.line++; nl = true; }
      st.i = stop; continue;
    }
    const line = st.line;
    const push = (tok) => { tok.line = line; tok.nl = nl; nl = false; out.push(tok); };
    if (c === '"' || c === "'") {
      let j = st.i + 1; let v = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\') { const [s, k] = readEscape(src, j + 1); v += s; j = k; } else { if (src[j] === '\n') st.line++; v += src[j]; j++; }
      }
      st.i = j + 1; push({ t: 'str', v }); continue;
    }
    if (c === '`') {
      st.i++;
      const quasis = []; const exprs = []; let cur = '';
      while (st.i < src.length && src[st.i] !== '`') {
        if (src[st.i] === '\\') { const [s, k] = readEscape(src, st.i + 1); cur += s; st.i = k; continue; }
        if (src[st.i] === '$' && src[st.i + 1] === '{') {
          quasis.push(cur); cur = ''; st.i += 2;
          exprs.push(lexUntil(st, true));
          continue;
        }
        if (src[st.i] === '\n') st.line++;
        cur += src[st.i]; st.i++;
      }
      quasis.push(cur); st.i++;
      push({ t: 'tpl', quasis, exprs }); continue;
    }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[st.i + 1] || ''))) {
      const m = NUM_RE.exec(src.slice(st.i, st.i + 80));
      st.i += m[0].length; push({ t: 'num', v: numValue(m[0]) }); continue;
    }
    const idm = ID_RE.exec(src.slice(st.i, st.i + 256));
    if (idm) { st.i += idm[0].length; push({ t: 'id', v: idm[0] }); continue; }
    if (c === '/' && exprAllowedAfter(prevSig())) {
      let j = st.i + 1; let inClass = false;
      while (j < src.length) {
        const d = src[j];
        if (d === '\\') { j += 2; continue; }
        if (d === '[') inClass = true; else if (d === ']') inClass = false;
        else if (d === '/' && !inClass) break;
        else if (d === '\n') break;
        j++;
      }
      j++;
      while (j < src.length && /[A-Za-z]/.test(src[j])) j++;
      push({ t: 're', v: src.slice(st.i, j) }); st.i = j; continue;
    }
    const p = PUNCTS.find((x) => src.startsWith(x, st.i));
    if (!p) { st.i++; continue; }
    if (stopAtBrace) {
      if (p === '{') depth++;
      if (p === '}') { if (depth === 0) { st.i++; return out; } depth--; }
    }
    st.i += p.length; push({ t: 'p', v: p });
  }
  return out;
}

// ---------- 常量折叠 ----------
// 折叠值：{k:'num', v} | {k:'str', v} | {k:'strp', v（已知开头）} | {k:'arr', v:[折叠值]} | {k:'bool', v}；
// lit：表达式里有没有字面量或构造（纯标识符引用为假，计数只落在产生值的地方）。

const isP = (tok, v) => tok && tok.t === 'p' && tok.v === v;

function matchClose(toks, i) {
  const open = toks[i].v; const close = open === '(' ? ')' : open === '[' ? ']' : '}';
  let d = 0;
  for (let k = i; k < toks.length; k++) {
    if (isP(toks[k], open)) d++;
    else if (isP(toks[k], close)) { d--; if (d === 0) return k; }
  }
  return toks.length - 1;
}

function strOf(v) {
  if (v.k === 'str') return v.v;
  if (v.k === 'num') return String(v.v);
  if (v.k === 'bool') return String(v.v);
  if (v.k === 'arr') { const parts = v.v.map(strOf); return parts.includes(null) ? null : parts.join(','); }
  return null;
}

function binop(op, a, b) {
  if (op === '+') {
    if (a.k === 'str' || b.k === 'str' || a.k === 'strp' || a.k === 'arr' || b.k === 'arr') {
      if (a.k === 'strp') return { k: 'strp', v: a.v };
      const sa = strOf(a); if (sa === null) return null;
      if (b.k === 'strp') return { k: 'strp', v: sa + b.v };
      const sb = strOf(b); if (sb === null) return null;
      return { k: 'str', v: sa + sb };
    }
  }
  if (a.k !== 'num' || b.k !== 'num') return null;
  const x = a.v; const y = b.v;
  if (typeof x !== typeof y) return null;
  const fns = {
    '+': () => x + y, '-': () => x - y, '*': () => x * y, '/': () => x / y, '%': () => x % y, '**': () => x ** y,
    '<<': () => x << y, '>>': () => x >> y, '>>>': () => x >>> y, '&': () => x & y, '|': () => x | y, '^': () => x ^ y,
  };
  if (!fns[op]) return null;
  try { return { k: 'num', v: fns[op]() }; } catch { return null; }
}

// 从 toks[i] 起读一个常量表达式；minPrec 限定可吞的二元运算符（左侧邻接运算符时用）。
// 返回 {val, end（不含）, lit} 或 null。env：名字 → 折叠值（本文件 const 与 import 来的常量）。
export function foldAt(toks, i, env, minPrec = 0) {
  let left = foldUnary(toks, i, env);
  if (!left) return null;
  for (;;) {
    const op = toks[left.end];
    if (!op || !(op.t === 'p' || op.t === 'id') || !(op.v in BIN_PREC)) break;
    const prec = BIN_PREC[op.v];
    if (prec < minPrec || prec < 9 /* 比较与逻辑运算不产出新值，不吞 */) break;
    const right = foldAt(toks, left.end + 1, env, op.v === '**' ? prec : prec + 1);
    if (!right) break;
    const val = binop(op.v, left.val, right.val);
    if (!val) break;
    left = { val, end: right.end, lit: true };
  }
  return left;
}

function foldUnary(toks, i, env) {
  const t = toks[i];
  if (!t) return null;
  if (t.t === 'p' && UNARY_OPS.has(t.v)) {
    const r = foldUnary(toks, i + 1, env);
    if (!r) return null;
    const v = r.val;
    let out = null;
    if (t.v === '!') out = { k: 'bool', v: !truthy(v) };
    else if (v.k === 'num') out = { k: 'num', v: t.v === '-' ? -v.v : t.v === '+' ? (typeof v.v === 'bigint' ? null : +v.v) : ~v.v };
    if (!out || out.v === null) return null;
    return { val: out, end: r.end, lit: r.lit };
  }
  return foldPostfix(toks, i, env);
}

function truthy(v) { return v.k === 'arr' || v.k === 'strp' ? true : Boolean(v.v); }

function foldPostfix(toks, i, env) {
  let base = foldPrimary(toks, i, env);
  if (!base) return null;
  for (;;) {
    const t = toks[base.end];
    if (!isP(t, '.')) break;
    const name = toks[base.end + 1];
    if (!name || name.t !== 'id') break;
    const v = base.val;
    if (name.v === 'length' && (v.k === 'str' || v.k === 'arr')) {
      base = { val: { k: 'num', v: v.k === 'str' ? v.v.length : v.v.length }, end: base.end + 2, lit: true };
      continue;
    }
    if ((name.v === 'join' || name.v === 'concat') && isP(toks[base.end + 2], '(')) {
      const args = foldArgs(toks, base.end + 2, env);
      if (!args) break;
      if (name.v === 'join' && v.k === 'arr') {
        const sep = args.vals.length ? strOf(args.vals[0]) : ',';
        const parts = v.v.map(strOf);
        if (sep === null || parts.includes(null)) break;
        base = { val: { k: 'str', v: parts.join(sep) }, end: args.end, lit: true }; continue;
      }
      if (name.v === 'concat' && v.k === 'str') {
        const parts = args.vals.map(strOf);
        if (parts.includes(null)) break;
        base = { val: { k: 'str', v: v.v + parts.join('') }, end: args.end, lit: true }; continue;
      }
    }
    break;
  }
  return base;
}

function foldArgs(toks, openIdx, env) {
  const close = matchClose(toks, openIdx);
  const vals = [];
  let k = openIdx + 1;
  while (k < close) {
    const r = foldAt(toks, k, env, 0);
    if (!r) return null;
    vals.push(r.val);
    k = r.end;
    if (isP(toks[k], ',')) k++;
    else if (k !== close) return null;
  }
  return { vals, end: close + 1 };
}

function foldPrimary(toks, i, env) {
  const t = toks[i];
  if (!t) return null;
  if (t.t === 'num') return { val: { k: 'num', v: t.v }, end: i + 1, lit: true };
  if (t.t === 'str') return { val: { k: 'str', v: t.v }, end: i + 1, lit: true };
  if (t.t === 'tpl') {
    let v = t.quasis[0]; let exact = true;
    for (let k = 0; k < t.exprs.length; k++) {
      const e = t.exprs[k];
      const r = e.length ? foldAt(e, 0, env, 0) : null;
      const s = r && r.end === e.length ? strOf(r.val) : null;
      if (s === null) { exact = false; break; }
      v += s + t.quasis[k + 1];
    }
    return { val: exact ? { k: 'str', v } : { k: 'strp', v }, end: i + 1, lit: true };
  }
  if (isP(t, '(')) {
    const close = matchClose(toks, i);
    const r = foldAt(toks, i + 1, env, 0);
    if (!r || r.end !== close) return null;
    return { val: r.val, end: close + 1, lit: r.lit };
  }
  if (isP(t, '[')) {
    const args = foldArgs(toks, i, env);
    if (!args) return null;
    return { val: { k: 'arr', v: args.vals }, end: args.end, lit: true };
  }
  if (t.t === 'id') {
    // String.fromCharCode(...)、String(...)：按值构造字串
    if (t.v === 'String' && isP(toks[i + 1], '.') && toks[i + 2] && toks[i + 2].v === 'fromCharCode' && isP(toks[i + 3], '(')) {
      const args = foldArgs(toks, i + 3, env);
      if (!args || args.vals.some((a) => a.k !== 'num')) return null;
      return { val: { k: 'str', v: String.fromCharCode(...args.vals.map((a) => Number(a.v))) }, end: args.end, lit: true };
    }
    if (t.v === 'String' && isP(toks[i + 1], '(')) {
      const args = foldArgs(toks, i + 1, env);
      if (!args || args.vals.length !== 1) return null;
      const s = strOf(args.vals[0]);
      return s === null ? null : { val: { k: 'str', v: s }, end: args.end, lit: true };
    }
    if (env && env.has(t.v) && !isP(toks[i - 1], '.') && !isP(toks[i - 1], '?.')) {
      const v = env.get(t.v);
      if (v) return { val: v, end: i + 1, lit: false };
    }
  }
  return null;
}

// 左侧邻接运算符决定本处能吞多高的运算（左结合）：`x*60*24` 里 60 与 24 各算一处。
export function minPrecAt(toks, i) {
  const prev = toks[i - 1];
  if (!prev) return 0;
  if ((prev.t === 'p' || prev.t === 'id') && prev.v in BIN_PREC) {
    const unaryCtx = prev.t === 'p' && UNARY_OPS.has(prev.v) && exprAllowedAfter(toks[i - 2]);
    if (unaryCtx) return UNARY_PREC;
    return prev.v === '**' ? BIN_PREC[prev.v] : BIN_PREC[prev.v] + 1;
  }
  if (prev.t === 'p' && UNARY_OPS.has(prev.v)) return UNARY_PREC;
  return 0;
}

// ---------- 模块结构 ----------

// 本文件 const 绑定（同名多处声明的不折叠）与 export 名单。
export function constDecls(toks) {
  const decls = new Map(); const dup = new Set(); const exported = new Map();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'id' && t.v === 'const' && toks[i + 1] && toks[i + 1].t === 'id' && isP(toks[i + 2], '=')) {
      const name = toks[i + 1].v;
      if (decls.has(name)) dup.add(name);
      decls.set(name, i + 3);
      if (toks[i - 1] && toks[i - 1].t === 'id' && toks[i - 1].v === 'export') exported.set(name, name);
    }
    if (t.t === 'id' && t.v === 'export' && isP(toks[i + 1], '{')) {
      const close = matchClose(toks, i + 1);
      if (toks[close + 1] && toks[close + 1].v === 'from') continue;
      for (let k = i + 2; k < close; k++) {
        if (toks[k].t !== 'id') continue;
        if (toks[k + 1] && toks[k + 1].v === 'as' && toks[k + 2]) { exported.set(toks[k + 2].v, toks[k].v); k += 2; }
        else exported.set(toks[k].v, toks[k].v);
      }
    }
  }
  for (const d of dup) decls.delete(d);
  return { decls, exported };
}

// 折叠本文件的 const（固定点迭代，常量可以引用别的常量）；imported：名字 → 折叠值。
export function buildEnv(toks, imported = new Map()) {
  const { decls } = constDecls(toks);
  const env = new Map(imported);
  for (let round = 0; round < 8; round++) {
    let changed = false;
    for (const [name, at] of decls) {
      if (env.has(name) && !imported.has(name)) continue;
      const r = foldAt(toks, at, env, 0);
      if (r && endsStatement(toks, r.end)) { env.set(name, r.val); changed = true; }
    }
    if (!changed) break;
  }
  return env;
}

function endsStatement(toks, k) {
  const t = toks[k];
  return !t || isP(t, ';') || isP(t, ',') || isP(t, '}') || t.nl;
}

// import / export-from / 动态 import 的说明符。kind：static | dynamic；json：带 `with {type:'json'}`。
export function importsOf(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
    if (t.v === 'import' && isP(toks[i + 1], '(')) {
      const a = toks[i + 2];
      const literal = a && a.t === 'str' && isP(toks[i + 3], ')') ? a.v : null;
      out.push({ spec: literal, line: t.line, kind: 'dynamic', at: i, json: false, names: [] });
      continue;
    }
    if (t.v === 'import' && isP(toks[i + 1], '.')) continue;
    if (t.v === 'import' || (t.v === 'export' && (isP(toks[i + 1], '{') || isP(toks[i + 1], '*')))) {
      let k = i + 1; const names = [];
      if (toks[k] && toks[k].t === 'str') { out.push({ spec: toks[k].v, line: t.line, kind: 'static', at: i, json: jsonAttr(toks, k + 1), names }); continue; }
      let found = -1;
      for (; k < toks.length && k < i + 400; k++) {
        if (isP(toks[k], ';')) break;
        if (toks[k].t === 'id' && toks[k].v === 'from' && toks[k + 1] && toks[k + 1].t === 'str') { found = k + 1; break; }
      }
      if (found < 0) continue;
      if (t.v === 'import') {
        const open = toks.slice(i + 1, found).findIndex((x) => isP(x, '{'));
        if (open >= 0) {
          const s = i + 1 + open; const e = matchClose(toks, s);
          for (let m = s + 1; m < e; m++) {
            if (toks[m].t !== 'id') continue;
            if (toks[m + 1] && toks[m + 1].v === 'as') { names.push({ imported: toks[m].v, local: toks[m + 2].v, at: m }); m += 2; }
            else names.push({ imported: toks[m].v, local: toks[m].v, at: m });
          }
        }
      }
      out.push({ spec: toks[found].v, line: t.line, kind: 'static', at: i, json: jsonAttr(toks, found + 1), names });
    }
  }
  return out;
}

function jsonAttr(toks, k) {
  const w = toks[k];
  if (!w || w.t !== 'id' || (w.v !== 'with' && w.v !== 'assert') || !isP(toks[k + 1], '{')) return false;
  const e = matchClose(toks, k + 1);
  return toks.slice(k + 2, e).some((x) => x.t === 'str' && x.v === 'json');
}

// 说明符字串所在的 token 下标（不算作代码里的字串值）。
export function specifierIndexes(toks) {
  const s = new Set();
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'str') continue;
    const p = toks[i - 1];
    if (p && p.t === 'id' && (p.v === 'from' || p.v === 'import')) s.add(i);
    if (isP(p, '(') && toks[i - 2] && toks[i - 2].v === 'import') s.add(i);
  }
  return s;
}

// 每个 token 所在的具名函数链（R12-8.2 的 symbolPath）。
export function symbolPaths(toks) {
  const res = new Array(toks.length);
  const stack = [];
  const KW = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function']);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isP(t, '{')) stack.push({ name: blockName(toks, i, KW) });
    res[i] = stack.map((s) => s.name).filter(Boolean).join('.');
    if (isP(t, '}')) stack.pop();
  }
  return res;
}

function openOf(toks, closeIdx) {
  const close = toks[closeIdx].v; const open = close === ')' ? '(' : '[';
  let d = 0;
  for (let k = closeIdx; k >= 0; k--) {
    if (isP(toks[k], close)) d++;
    else if (isP(toks[k], open)) { d--; if (d === 0) return k; }
  }
  return 0;
}

function nameBeforeAssign(toks, k) {
  while (toks[k] && toks[k].t === 'id' && (toks[k].v === 'async' || toks[k].v === 'function')) k--;
  if (isP(toks[k], '=') || isP(toks[k], ':')) {
    const n = toks[k - 1];
    if (n && (n.t === 'id' || n.t === 'str')) return n.v;
  }
  return null;
}

function blockName(toks, i, KW) {
  const prev = toks[i - 1];
  if (isP(prev, ')')) {
    const open = openOf(toks, i - 1);
    const before = toks[open - 1];
    if (before && before.t === 'id' && !KW.has(before.v)) return before.v;
    if (before && before.t === 'id' && before.v === 'function') return nameBeforeAssign(toks, open - 2);
    return null;
  }
  if (isP(prev, '=>')) {
    let k = i - 2;
    if (isP(toks[k], ')')) k = openOf(toks, k) - 1; else k -= 1;
    return nameBeforeAssign(toks, k);
  }
  return null;
}

// 成员链：从根标识符起的 `.名`、`?.名`、`['名']` 段（不含根）。返回 {segs, start, end}。
export function memberChains(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
    const segs = []; let k = i + 1;
    for (;;) {
      if ((isP(toks[k], '.') || isP(toks[k], '?.')) && toks[k + 1] && toks[k + 1].t === 'id') { segs.push(toks[k + 1].v); k += 2; continue; }
      if (isP(toks[k], '[') && toks[k + 1] && toks[k + 1].t === 'str' && isP(toks[k + 2], ']')) { segs.push(toks[k + 1].v); k += 3; continue; }
      if (isP(toks[k], '?.') && isP(toks[k + 1], '[') && toks[k + 2] && toks[k + 2].t === 'str' && isP(toks[k + 3], ']')) { segs.push(toks[k + 2].v); k += 4; continue; }
      break;
    }
    if (segs.length) out.push({ segs, start: i, end: k });
  }
  return out;
}

// 下标落在 if/while/for/switch 的条件括号里的集合。
export function conditionSpans(toks) {
  const inCond = new Uint8Array(toks.length);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t === 'id' && (t.v === 'if' || t.v === 'while' || t.v === 'for' || t.v === 'switch') && isP(toks[i + 1], '(')) {
      const e = matchClose(toks, i + 1);
      for (let k = i + 1; k <= e; k++) inCond[k] = 1;
    }
  }
  return inCond;
}

// 一个常量表达式能否从 toks[i] 起：一元运算符只在表达式位置上算一元。
export function canStartAt(toks, i) {
  const t = toks[i];
  if (t.t === 'num' || t.t === 'str' || t.t === 'tpl' || t.t === 'id') return true;
  if (t.t === 'p' && (t.v === '(' || t.v === '[')) return true;
  if (t.t === 'p' && UNARY_OPS.has(t.v)) return exprAllowedAfter(toks[i - 1]);
  return false;
}

export const BRANCH_OPS = new Set(['===', '!==', '==', '!=', '<', '>', '<=', '>=', '&&', '||', '??', '?', '!']);
export { isP, matchClose };
