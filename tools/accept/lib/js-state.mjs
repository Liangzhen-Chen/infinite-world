// 卷十二 §4.2、§4.3 检测器共用（块 2 第 2-3 张）：注释与 JSDoc 块、函数形参、state 成员链、声明表派生的路径与写者。
// 只认结构与登记数据（卷二 §2.7 声明表、kernelApi），没有顶层键、系统、文件、条目名的字面量（S12-5）。
// 局限（写进 2-3 回报）：这是词法级读取，不是 tsc 类型；state 的根按形参名与 `<x>.state` 认（类型归因要等 tsc 进离线组），
// 计算属性 `[expr]` 记作通配段。

import { tokenize, isP, matchClose } from './js-scan.mjs';

// ---------- 注释 ----------

/**
 * 源码里的注释（行注释与块注释），带首尾行号与是不是 JSDoc（`/**` 开头）。跳过字串、模板与正则字面量里的同形字符。
 * @param {string} src
 * @returns {{text: string, line: number, endLine: number, doc: boolean}[]}
 */
export function commentsOf(src) {
  const out = [];
  let line = 1; let i = 0;
  let prevSig = '';
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i); const stop = end < 0 ? src.length : end;
      out.push({ text: src.slice(i, stop), line, endLine: line, doc: false }); i = stop; continue;
    }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2); const stop = end < 0 ? src.length : end + 2;
      const text = src.slice(i, stop); const start = line;
      for (const ch of text) if (ch === '\n') line++;
      out.push({ text, line: start, endLine: line, doc: text.startsWith('/**') && text !== '/**/' }); i = stop; continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') j++; if (src[j] === '\n') line++; j++; }
      i = j + 1; prevSig = 'x'; continue;
    }
    if (c === '/' && (prevSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prevSig))) {
      let j = i + 1; let inClass = false;
      while (j < src.length && src[j] !== '\n') { const d = src[j]; if (d === '\\') { j += 2; continue; } if (d === '[') inClass = true; else if (d === ']') inClass = false; else if (d === '/' && !inClass) break; j++; }
      i = j + 1; prevSig = 'x'; continue;
    }
    if (c !== ' ' && c !== '\t' && c !== '\r') prevSig = /[A-Za-z0-9_$)\]]/.test(c) ? 'x' : c;
    i++;
  }
  return out;
}

// ---------- 导出函数与形参 ----------

/**
 * 顶层导出的函数：`export [async] function f(…)` 与 `export const f = [async] (…) =>` / `= function (…)`。
 * 返回 {name, line, params: [{name|null, destructured}]}；形参名取首个标识符（`...rest` 取 rest；解构为 null）。
 * @param {any[]} toks
 */
export function exportedFunctions(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (!(toks[i].t === 'id' && toks[i].v === 'export')) continue;
    let k = i + 1;
    if (toks[k] && toks[k].v === 'default') k++;
    if (toks[k] && toks[k].v === 'async') k++;
    let name = null; let open = -1;
    if (toks[k] && toks[k].v === 'function') {
      k++; if (isP(toks[k], '*')) k++;
      if (toks[k] && toks[k].t === 'id') { name = toks[k].v; k++; }
      if (isP(toks[k], '(')) open = k;
    } else if (toks[k] && (toks[k].v === 'const' || toks[k].v === 'let') && toks[k + 1] && toks[k + 1].t === 'id' && isP(toks[k + 2], '=')) {
      name = toks[k + 1].v; k += 3;
      if (toks[k] && toks[k].v === 'async') k++;
      if (toks[k] && toks[k].v === 'function') { k++; if (toks[k] && toks[k].t === 'id') k++; }
      if (isP(toks[k], '(')) { const close = matchClose(toks, k); if (isP(toks[close + 1], '=>') || toks[k - 1].v === 'function' || toks[k - 2] && toks[k - 2].v === 'function') open = k; }
      else if (toks[k] && toks[k].t === 'id' && isP(toks[k + 1], '=>')) { out.push({ name, line: toks[i].line, params: [{ name: toks[k].v, destructured: false }] }); continue; }
    }
    if (open < 0) continue;
    out.push({ name, line: toks[i].line, params: paramsAt(toks, open) });
  }
  return out;
}

function paramsAt(toks, open) {
  const close = matchClose(toks, open);
  const params = []; let k = open + 1;
  while (k < close) {
    let d = 0; const start = k;
    while (k < close && !(d === 0 && isP(toks[k], ','))) { if (isP(toks[k], '(') || isP(toks[k], '[') || isP(toks[k], '{')) d++; if (isP(toks[k], ')') || isP(toks[k], ']') || isP(toks[k], '}')) d--; k++; }
    let s = start; if (isP(toks[s], '...')) s++;
    if (s < k) params.push(toks[s].t === 'id' ? { name: toks[s].v, destructured: false } : { name: null, destructured: true });
    k++;
  }
  return params;
}

/**
 * 紧贴在第 line 行之前的 JSDoc 块（块结束行是 line 或 line-1，且中间没有别的代码行）。
 * @param {{text: string, endLine: number, doc: boolean}[]} comments @param {number} line
 */
export function jsdocBefore(comments, line) {
  const c = comments.filter((x) => x.doc && (x.endLine === line || x.endLine === line - 1)).pop();
  return c ? c.text : null;
}

/** JSDoc 里 `@param {类型} 名` 的名字（`[名]`、`[名=默认]`、`名.字段` 取首段），只收带类型的。 */
export function jsdocParamNames(doc) {
  const names = new Set();
  const tag = '@param';
  for (let at = doc.indexOf(tag); at >= 0; at = doc.indexOf(tag, at + tag.length)) {
    let k = at + tag.length;
    while (doc[k] === ' ' || doc[k] === '\t') k++;
    if (doc[k] !== '{') continue;
    let d = 0;
    for (; k < doc.length; k++) { if (doc[k] === '{') d++; else if (doc[k] === '}' && --d === 0) break; }
    const m = /^\s+\[?([A-Za-z_$][\w$]*)/.exec(doc.slice(k + 1));
    if (m) names.add(m[1]);
  }
  return names;
}

// ---------- state 成员链 ----------

/** 赋值运算符（写入）。 */
export const ASSIGN_OPS = new Set(['=', '+=', '-=', '*=', '/=', '%=', '**=', '<<=', '>>=', '>>>=', '&=', '|=', '^=', '&&=', '||=', '??=']);

const DECL_WORDS = new Set(['const', 'let', 'var']);
const NOT_PARAM_LIST = new Set(['if', 'while', 'for', 'switch', 'with', 'catch', 'return', 'typeof', 'void', 'await', 'yield']);

/**
 * 第 i 个记号（裸标识符，不跟在 `.` 后）是不是绑定位置（声明，不是写入）：前一记号是 const/let/var；
 * 或前一记号是 `,`、同一括号深度往回找到的语句或括号开头是 const/let/var（`let a = 1, state = 2`、`for (let a, state …)`）；
 * 或它落在函数形参表里（开头括号前是 `function`/函数名、收尾括号后是 `=>` 或函数体 `{`；`if (…) {` 一类关键字括号不算）。
 * @param {any[]} toks @param {number} i
 */
export function isBindingSite(toks, i) {
  const prev = toks[i - 1];
  if (!prev || isP(prev, '.') || isP(prev, '?.')) return false;
  if (prev.t === 'id' && DECL_WORDS.has(prev.v)) return true;
  if (!isP(prev, ',') && !isP(prev, '(')) return false;
  let k = i - 1; let d = 0;
  for (; k >= 0; k--) {
    const t = toks[k];
    if (isP(t, ')') || isP(t, ']') || isP(t, '}')) d++;
    else if (isP(t, '(') || isP(t, '[') || isP(t, '{')) { if (d === 0) break; d--; }
    else if (d === 0 && isP(t, ';')) break;
  }
  const head = toks[k + 1];
  if (head && head.t === 'id' && DECL_WORDS.has(head.v)) return true;
  if (k < 0 || !isP(toks[k], '(')) return false;
  const close = matchClose(toks, k);
  if (isP(toks[close + 1], '=>')) return true;
  const callee = toks[k - 1];
  return Boolean(isP(toks[close + 1], '{') && callee && callee.t === 'id' && !NOT_PARAM_LIST.has(callee.v));
}

/**
 * 以 state 为根的成员链：根是标识符 `state`（不跟在 `.` 后）或 `<x>.state`。段：`.名`、`?.名`、`['字面量']` 取名，其余计算属性 `[…]` 记 `*`。
 * 返回 {segs, start, end, write}：write 为真即链是写入目标（后跟赋值运算或 `++`/`--`，或前有 `delete`、`++`/`--`）。
 * @param {any[]} toks
 */
export function stateChains(toks) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (!(t.t === 'id' && t.v === 'state')) continue;
    const prev = toks[i - 1];
    if (isP(prev, '?.')) continue;
    // `x.state` 也算根（engine.state 一类）；但 `x.state.y` 的 x 不是 state 链。属性名位置（对象字面量键 `state:`）不算。
    if (isP(toks[i + 1], ':') && !isP(prev, '?')) continue;
    const segs = []; let k = i + 1;
    for (;;) {
      if ((isP(toks[k], '.') || isP(toks[k], '?.')) && toks[k + 1] && toks[k + 1].t === 'id') { segs.push(toks[k + 1].v); k += 2; continue; }
      const br = isP(toks[k], '[') ? k : isP(toks[k], '?.') && isP(toks[k + 1], '[') ? k + 1 : -1;
      if (br >= 0) {
        const close = matchClose(toks, br);
        segs.push(close === br + 2 && toks[br + 1].t === 'str' ? toks[br + 1].v : '*');
        k = close + 1; continue;
      }
      break;
    }
    const after = toks[k]; const before = toks[i - (isP(prev, '.') ? 2 : 0) - 1];
    const write = !isBindingSite(toks, i) && Boolean((after && after.t === 'p' && (ASSIGN_OPS.has(after.v) || after.v === '++' || after.v === '--'))
      || (before && ((before.t === 'id' && before.v === 'delete') || isP(before, '++') || isP(before, '--'))));
    out.push({ segs, start: i, end: k, write, computed: segs.includes('*') });
  }
  return out;
}

// ---------- 声明表派生（卷二 §2.6、§2.7） ----------

const segsOf = (p) => p.split('.');
/** 模式段与链段是否相配：任一方是 `*` 即配（链里的 `*` 是计算属性，值未知）。长度须相等。 */
export function segsMatch(pat, segs) {
  return pat.length === segs.length && pat.every((s, i) => s === '*' || segs[i] === '*' || s === segs[i]);
}

/** 具体程度（与 kernel/load/state-owners.mjs compareSpecificity 同口径）：字面段多者更具体，同数则 `*` 更靠后者更具体。 */
function specificity(a, b) {
  const sa = segsOf(a); const sb = segsOf(b);
  const la = sa.filter((s) => s !== '*').length; const lb = sb.filter((s) => s !== '*').length;
  if (la !== lb) return la - lb;
  const pa = sa.map((s, i) => (s === '*' ? i : -1)).filter((i) => i >= 0);
  const pb = sb.map((s, i) => (s === '*' ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/**
 * 从声明表派生：写者（stateKeys.<键>.writers 相对模式转绝对、textWriters）、P 成员名 → 模式（与 kernel buildP 同一派生：点换下划线、`*` 不进名）、
 * 显示路径（stateKeys.<键>.display 转绝对 ∪ textPaths）。
 * @param {any} decl
 */
export function declPaths(decl) {
  const d = decl && typeof decl === 'object' ? decl : {};
  const pathTypes = d.pathTypes && typeof d.pathTypes === 'object' ? d.pathTypes : {};
  const textPaths = Array.isArray(d.textPaths) ? d.textPaths : [];
  const writers = [];
  const display = new Set(textPaths);
  for (const [key, row] of Object.entries(d.stateKeys || {})) {
    if (!row || typeof row !== 'object') continue;
    for (const [rel, w] of Object.entries(row.writers || {})) {
      const rec = typeof w === 'string' ? { rewrite: w, create: [], viaRelocate: false } : { rewrite: w && w.rewrite, create: (w && w.create) || [], viaRelocate: Boolean(w && w.viaRelocate) };
      writers.push({ pattern: `${key}.${rel}`, key, ...rec });
    }
    for (const rel of row.display || []) display.add(`${key}.${rel}`);
  }
  for (const [tp, f] of Object.entries(d.textWriters || {})) if (!writers.some((w) => w.pattern === tp)) writers.push({ pattern: tp, key: segsOf(tp)[0], rewrite: f, create: [], viaRelocate: false });
  const text = new Set(textPaths);
  const members = new Map();
  for (const p of Object.keys(pathTypes)) if (!text.has(p)) members.set(segsOf(p).filter((s) => s !== '*').join('_'), p);
  return { writers, members, display: [...display].sort(), keys: Object.keys(d.stateKeys || {}).sort() };
}

/** 覆盖该模式（或链段）的最具体写者；没有为 null。 */
export function writerOf(writers, segs) {
  const hit = writers.filter((w) => segsMatch(segsOf(w.pattern), segs));
  if (!hit.length) return null;
  return hit.sort((a, b) => specificity(b.pattern, a.pattern))[0];
}

/** 文件相对服务端根的写法（与 stateKeys.writers 同写法，卷二 §2.7）；不在服务端根下返回 null。 */
export function serverRel(file, model) {
  const root = ((model.processes || {}).server || {}).root;
  return root && file.startsWith(root) ? file.slice(root.length) : null;
}

/**
 * 调用某个登记入口的位置：`名(` 或 `x.名(`，名取自 kernelApi 登记的 "<文件>#<名>"。返回 {idx, args: [[start, end)…]}。
 * @param {any[]} toks @param {Set<string>} names
 */
export function callsOf(toks, names) {
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    if (!(toks[i].t === 'id' && names.has(toks[i].v) && isP(toks[i + 1], '('))) continue;
    const prev = toks[i - 1];
    if (prev && prev.t === 'id' && (prev.v === 'function' || prev.v === 'async')) continue;
    const close = matchClose(toks, i + 1);
    const args = []; let k = i + 2; let start = k; let d = 0;
    for (; k < close; k++) {
      if (isP(toks[k], '(') || isP(toks[k], '[') || isP(toks[k], '{')) d++;
      else if (isP(toks[k], ')') || isP(toks[k], ']') || isP(toks[k], '}')) d--;
      else if (d === 0 && isP(toks[k], ',')) { args.push([start, k]); start = k + 1; }
    }
    if (start < close) args.push([start, close]);
    out.push({ idx: i, args });
  }
  return out;
}

export { tokenize };
