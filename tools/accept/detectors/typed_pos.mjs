// 检测器 typed_pos（卷十二 §2.3）：某静态类型的表达式出现在许可节点位置之外。块 2 第 2-3 张起用（扫描类别 text_judge、escape_hatch；卷十二 §4.2）。
// 判据唯一定义在卷二 §2.8 第 2–4a 条与 §7 S13；本文件只按登记数据（扫描类别行 checkCodes、regexFiles、castFiles、throwExempt）实现，没有文件名与组名。
// params.groups：范围（模块组键，R12-2.3 按磁盘真实文件展开）；params.checks：本条目计哪几项——
//   regex        S13 ①：正则字面量、RegExp 构造，出现在类别行 regexFiles 之外（卷二 S13 (b) 的文件限定）
//   nonAscii     S13 ③：含非 ASCII 字符的字串或模板字面量；`throw new X(…)` 的文案实参不计（S13 (c)）
//   bareCompare  S13 ④：裸字串字面量参与 ===/!==/==/!=、case、`in`、数组字面量的 .includes、.get/.has 的键
//   exportParams §2.8 第 4 条末句：导出函数的形参没有 JSDoc 类型标注（E-VIEW-FAMILY-UNRESOLVED；块 2 体检 K2-46，从第一个文件起全量适用）
//   directive / anyType / assertCast  §2.8 第 4a 条：@ts-ignore 等指令注释、JSDoc 里的 any 与 *、`/** @type */ (…)` 强转与 `x is T` / asserts / @overload（只许类别行 castFiles）
// 每项报哪个码取类别行 checkCodes；类别行 groupCodes 给了该组该项的码时按组取（卷二 §2.8 各组表的违例码列）。
// 局限（写进 2-3 回报，等 tsc 与 typescript-eslint 进离线组）：S13 ②（对归因为 string 的值做闭集外操作）要静态类型，词法级做不了，本检测器不判；
// 无法归因的比较（E-VIEW-FAMILY-UNRESOLVED 第 ① 补洞）、句柄族不符（E-VIEW-FAMILY-MISMATCH）、隐式 any 同理不判。

import { tokenize, isP, matchClose, symbolPaths } from '../lib/js-scan.mjs';
import { commentsOf, exportedFunctions, jsdocBefore, jsdocParamNames } from '../lib/js-state.mjs';
import { scopeFiles, matchGlobs, classify } from '../read.mjs';

const NON_ASCII = /[^\x00-\x7f]/;
const EQ_OPS = new Set(['===', '!==', '==', '!=']);

function regexHits(toks) {
  const out = [];
  toks.forEach((t, i) => {
    if (t.t === 're') out.push(i);
    else if (t.t === 'id' && t.v === 'RegExp' && isP(toks[i + 1], '(') && !isP(toks[i - 1], '.')) out.push(i);
    if (t.t === 'tpl') for (const e of t.exprs) out.push(...regexHits(e).map(() => i));
  });
  return out;
}

// throw new X( 的第一个实参范围 [start, end)。
function throwMessageSpans(toks) {
  const spans = [];
  for (let i = 0; i + 3 < toks.length; i++) {
    if (toks[i].v === 'throw' && toks[i + 1].v === 'new' && toks[i + 2].t === 'id' && isP(toks[i + 3], '(')) {
      const close = matchClose(toks, i + 3);
      let k = i + 4; let d = 0;
      for (; k < close; k++) { if (isP(toks[k], '(') || isP(toks[k], '[') || isP(toks[k], '{')) d++; else if (isP(toks[k], ')') || isP(toks[k], ']') || isP(toks[k], '}')) d--; else if (d === 0 && isP(toks[k], ',')) break; }
      spans.push([i + 4, k]);
    }
  }
  return spans;
}

function nonAsciiHits(toks) {
  const spans = throwMessageSpans(toks);
  const out = [];
  toks.forEach((t, i) => {
    if (spans.some(([a, b]) => i >= a && i < b)) return;
    if (t.t === 'str' && NON_ASCII.test(t.v)) out.push(i);
    if (t.t === 'tpl') {
      if (t.quasis.some((q) => NON_ASCII.test(q))) out.push(i);
      for (const e of t.exprs) if (nonAsciiHits(e).length) out.push(i);
    }
  });
  return out;
}

// 字面量是不是数组字面量里的元素，且这个数组紧跟 .includes(
function inIncludesArray(toks, i) {
  let d = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (isP(toks[k], ']') || isP(toks[k], ')') || isP(toks[k], '}')) d++;
    else if (isP(toks[k], '(') || isP(toks[k], '{')) { if (d === 0) return false; d--; }
    else if (isP(toks[k], '[')) {
      if (d > 0) { d--; continue; }
      const close = matchClose(toks, k);
      return isP(toks[close + 1], '.') && toks[close + 2] && toks[close + 2].v === 'includes' && isP(toks[close + 3], '(');
    }
  }
  return false;
}

function bareCompareHits(toks) {
  const out = [];
  toks.forEach((t, i) => {
    if (t.t === 'tpl' && t.exprs.length === 0) t = { t: 'str', v: t.quasis[0] };
    if (t.t !== 'str') return;
    const prev = toks[i - 1]; const next = toks[i + 1];
    const op = (x) => x && x.t === 'p' && EQ_OPS.has(x.v);
    if (op(prev) || op(next)) return out.push(i);
    if (prev && prev.t === 'id' && prev.v === 'case') return out.push(i);
    if (next && next.t === 'id' && next.v === 'in') return out.push(i);
    if (isP(prev, '(') && isP(next, ')') && toks[i - 2] && (toks[i - 2].v === 'get' || toks[i - 2].v === 'has') && isP(toks[i - 3], '.')) return out.push(i);
    if (inIncludesArray(toks, i)) out.push(i);
  });
  return out;
}

function exportParamHits(toks, comments) {
  const out = [];
  for (const fn of exportedFunctions(toks)) {
    if (!fn.params.length) continue;
    const doc = jsdocBefore(comments, fn.line);
    if (doc && /@type\s+\{/.test(doc)) continue; // 整个函数以 @type 标注
    const named = doc ? jsdocParamNames(doc) : new Set();
    const tagged = named.size;
    const missing = fn.params.some((p) => (p.destructured ? tagged < fn.params.length : !named.has(p.name)));
    if (missing) out.push({ line: fn.line, symbolPath: fn.name || '' });
  }
  return out;
}

const DIRECTIVE = /@ts-ignore|@ts-expect-error|@ts-nocheck|eslint-disable/;
// JSDoc 类型里的 any 或 `*`（`{*}`、`Array<*>`、`{a: *}`）；类型表达式按花括号取，不看描述文字。
const ANY_TYPE = /\{[^}]*(?:\bany\b|(?:^|[^\w])\*(?:[^\w/]|$))[^}]*\}|\{\s*\*\s*\}/;
const CAST = /^\/\*\*\s*@type\s*\{/;
const ASSERT_FORMS = /@overload|\{\s*asserts\s|\{\s*[A-Za-z_$][\w$]*\s+is\s/;

function commentHits(src, toks, comments, check) {
  const out = [];
  for (const c of comments) {
    if (check === 'directive' && DIRECTIVE.test(c.text)) out.push({ line: c.line, symbolPath: '' });
    if (check === 'anyType' && c.doc && ANY_TYPE.test(c.text)) out.push({ line: c.line, symbolPath: '' });
    if (check === 'assertCast' && c.doc && ASSERT_FORMS.test(c.text)) out.push({ line: c.line, symbolPath: '' });
  }
  if (check === 'assertCast') {
    // `/** @type {T} */ (expr)`：类型注释之后紧跟左括号即强转；声明前的 @type（后跟 let/const/export 等）不算。
    const lines = src.split('\n');
    for (const c of comments) {
      if (!CAST.test(c.text)) continue;
      const tail = lines[c.endLine - 1] || '';
      const pos = tail.lastIndexOf('*/');
      if (pos >= 0 && /^\s*\(/.test(tail.slice(pos + 2))) out.push({ line: c.endLine, symbolPath: '' });
    }
  }
  return out.sort((a, b) => a.line - b.line);
}

export function detect(ctx, params, cls) {
  const checks = params.checks || [];
  const codes = (cls && cls.checkCodes) || {};
  const regexFiles = (cls && cls.regexFiles) || [];
  const castFiles = (cls && cls.castFiles) || [];
  const hits = [];
  for (const file of scopeFiles(ctx, params)) {
    const src = ctx.read(file);
    const toks = tokenize(src);
    const comments = checks.some((c) => ['exportParams', 'directive', 'anyType', 'assertCast'].includes(c)) ? commentsOf(src) : [];
    const paths = symbolPaths(toks);
    const sym = (idx) => paths[idx] || '';
    const group = classify(file, ctx.model).group;
    for (const check of checks) {
      // 组有自己的违例码的（卷二 §2.8 各模块组表"违例码"列，登记在类别行 groupCodes）按组取，否则取 checkCodes。
      const own = ((cls && cls.groupCodes) || {})[group];
      const code = own && own[check] ? own[check] : codes[check];
      if (!code) throw new Error(`E-ACC-ITEM-PARAM check=${check} has no registered code`);
      const push = (line, symbolPath, nodeKind) => hits.push({ file, line, nodeKind, symbolPath, code });
      if (check === 'regex') { if (!matchGlobs(file, regexFiles, ctx.model.codeExts)) for (const i of regexHits(toks)) push(toks[i].line, sym(i), 'regex'); }
      else if (check === 'nonAscii') for (const i of nonAsciiHits(toks)) push(toks[i].line, sym(i), 'literal_non_ascii');
      else if (check === 'bareCompare') for (const i of bareCompareHits(toks)) push(toks[i].line, sym(i), 'literal_compare');
      else if (check === 'exportParams') for (const h of exportParamHits(toks, comments)) push(h.line, h.symbolPath, 'export_param');
      else if (check === 'assertCast') { if (!matchGlobs(file, castFiles, ctx.model.codeExts)) for (const h of commentHits(src, toks, comments, check)) push(h.line, h.symbolPath, check); }
      else if (check === 'directive' || check === 'anyType') for (const h of commentHits(src, toks, comments, check)) push(h.line, h.symbolPath, check);
      else throw new Error(`E-ACC-ITEM-PARAM check=${check}`);
    }
  }
  return hits;
}
