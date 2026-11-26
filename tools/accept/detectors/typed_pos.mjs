// 检测器 typed_pos（卷十二 §2.3）：某静态类型的表达式出现在许可节点位置之外。块 2 第 2-3 张起用（扫描类别 text_judge、escape_hatch；卷十二 §4.2）。
// 判据唯一定义在卷二 §2.8 第 2–4a 条与 §7 S13；本文件只按登记数据（扫描类别行 checkCodes、regexFiles、castFiles、throwExempt）实现，没有文件名与组名。
// params.groups：范围（模块组键，R12-2.3 按磁盘真实文件展开）；params.checks：本条目计哪几项——
//   regex        S13 ①：正则字面量、RegExp 构造，出现在类别行 regexFiles 之外（卷二 S13 (b) 的文件限定）
//   nonAscii     S13 ③：含非 ASCII 字符的字串或模板字面量；`throw new X(…)` 的文案实参不计（S13 (c)）
//   bareCompare  S13 ④：裸字串字面量参与 ===/!==/==/!=、case、数组字面量的 .includes、.get/.has 的键
//                （④ 原句只列 ===/!==/switch/Map 键/数组元素，`in` 不在此列，见卷二 :2412）；
//                上下文白名单 (d)：typeof 结果比较与 markers.mjs 的 GRAMMAR_TOKENS 文法记号定义源不计；
//                协议标记（TYPES、CODE_ENUMS 等）裸写照计（卷二 :2413）；
//                另含补洞写法（别名溯源、族前缀拼接、V 动态访问、字面量判断表，见 shapeHits）
//   exportParams §2.8 第 4 条末句：导出函数的形参没有 JSDoc 类型标注（E-VIEW-FAMILY-UNRESOLVED；块 2 体检 K2-46，从第一个文件起全量适用）
//   directive / anyType / assertCast  §2.8 第 4a 条：@ts-ignore 等指令注释、JSDoc 里的 any 与 *、`/** @type */ (…)` 强转与 `x is T` / asserts / @overload（只许类别行 castFiles）
// 每项报哪个码取类别行 checkCodes；类别行 groupCodes 给了该组该项的码时按组取（卷二 §2.8 各组表的违例码列）。
// 局限（未接 typescript-eslint）：S13 ②（对归因为 string 的值做闭集外操作：`x.startsWith`、`x.length`、`switch (text)`、
// `obj[text]`、展开迭代解构、`Number(text)`、`x < y`、`String(k)`）要类型感知规则，本检测器仍只做词法级；
// 静态类型本身由 tsc 一道（checks=["tsc"]）核，两条判据互补，不互相顶替。
// `tsc` 方式（L-09 ④；docs/gemini/kickoff-1125.md:480）：真仓库用已装的 typescript 跑 jsconfig.json（cls.configFile），
// 有用错即命中；用例上下文（ctx.repoFiles 存在，文件是虚拟的）把用例文件写到临时目录，用同一份配置的编译选项跑，跑完删除。

import { tokenize, isP, matchClose, symbolPaths, buildEnv } from '../lib/js-scan.mjs';
import { commentsOf, exportedFunctions, jsdocBefore, jsdocParamNames } from '../lib/js-state.mjs';
import { scopeFiles, matchGlobs, classify } from '../read.mjs';
import * as markers from '../../../server-plugin/kernel/handles.mjs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname as pdirname } from 'node:path';

const NON_ASCII = /[^\x00-\x7f]/;
const EQ_OPS = new Set(['===', '!==', '==', '!=']);

// S13 ④ 上下文白名单 (d) 的文法记号（卷二 :2413，封卷后勘误 1118k20）：不在此另写名单，
// 只取 kernel/handles/markers.mjs 的文法记号定义源 GRAMMAR_TOKENS（按导出名定位；TYPES 等协议标记不是文法记号，裸写照计）。
// 记号值在定义源处，本文件只收集其成员字串；协议标记裸写（`x === 'number'`、`state === 'ok'`）不在豁免内。
function collectGrammarTokens(m) {
  const out = new Set();
  const add = (v) => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) for (const x of v) add(x);
    else if (v && typeof v === 'object') for (const k of Object.keys(v)) add(v[k]);
  };
  add(m);
  return out;
}
const MARKER_TOKENS = collectGrammarTokens(markers.GRAMMAR_TOKENS);

// S13 (d)：`typeof x === '<字面量>'` 及反向、`switch (typeof x)` 的 case 不计第 ④ 类。
// 只认比较操作数本身就是 typeof 表达式（可带外层括号）；操作数里别处出现 typeof（`a[typeof b] === 'z'`、
// `if (typeof x) y === 'z'`）不算——那不是 typeof 结果的比较。
const OPERAND_STOP_IDS = new Set(['return', 'case', 'if', 'while', 'for', 'switch', 'throw', 'new', 'delete', 'void', 'in', 'instanceof', 'of', 'const', 'let', 'var', 'else', 'do', 'yield', 'await', 'function']);
// 从字面量一侧沿运算符取操作数的记号范围 [lo, hi]（含两端），遇运算符、语句关键字或不成组的括号停。
function operandRange(toks, start, dir) {
  let j = start; let depth = 0; let lo = start; let hi = start;
  while (j >= 0 && j < toks.length) {
    const t = toks[j];
    if (t.t === 'p') {
      if (t.v === '.' || t.v === '?.' || t.v === '!') { j += dir; continue; }
      if (dir < 0) {
        if (t.v === ')' || t.v === ']') { depth++; lo = j; j--; continue; }
        if (t.v === '(' || t.v === '[') {
          if (depth === 0) { if (matchClose(toks, j) === start) lo = j; break; } // 只有整操作数的外层括号算进范围
          depth--; lo = j; j--; continue;
        }
        break;
      }
      if (t.v === '(' || t.v === '[') { depth++; hi = j; j++; continue; }
      if (t.v === ')' || t.v === ']') { if (depth === 0) break; depth--; hi = j; j++; continue; }
      break;
    }
    if (t.t === 'id') {
      if (OPERAND_STOP_IDS.has(t.v)) break;
      if (dir < 0) lo = j; else hi = j;
      j += dir; continue;
    }
    if (t.t === 'str' || t.t === 'num' || t.t === 'tpl') { if (dir < 0) lo = j; else hi = j; j += dir; continue; }
    break;
  }
  return [lo, hi];
}
// 范围内是不是一个 typeof 表达式：整体即 `typeof <操作数>`，或外面套了只包住它的括号。
function isTypeofExpr(toks, lo, hi) {
  while (lo <= hi && isP(toks[lo], '(') && matchClose(toks, lo) === hi) { lo++; hi--; }
  if (lo > hi || !(toks[lo].t === 'id' && toks[lo].v === 'typeof')) return false;
  if (lo === hi) return false;
  const [, end] = operandRange(toks, lo + 1, 1);
  return end === hi;
}
function operandIsTypeof(toks, start, dir) {
  const [lo, hi] = operandRange(toks, start, dir);
  return lo <= hi && isTypeofExpr(toks, lo, hi);
}
// case 的字面量：向前找到同一 switch 的判别式，判别式本身是 typeof 表达式即不计。
function caseOfTypeofSwitch(toks, i) {
  let depth = 0;
  for (let j = i - 1; j >= 0; j--) {
    const t = toks[j];
    if (isP(t, '}')) { depth++; continue; }
    if (isP(t, '{')) { if (depth > 0) depth--; continue; }
    if (depth === 0 && t.t === 'id' && t.v === 'switch' && isP(toks[j + 1], '(')) {
      const close = matchClose(toks, j + 1);
      if (close < 0 || close <= j + 2) return false;
      return isTypeofExpr(toks, j + 2, close - 1);
    }
  }
  return false;
}

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
    if (MARKER_TOKENS.has(t.v)) return; // S13 (d) 文法记号不计（记号集合取自 markers.mjs）
    const prev = toks[i - 1]; const next = toks[i + 1];
    const op = (x) => x && x.t === 'p' && EQ_OPS.has(x.v);
    if (op(prev) || op(next)) {
      if ((op(prev) && operandIsTypeof(toks, i - 2, -1)) || (op(next) && operandIsTypeof(toks, i + 2, 1))) return; // S13 (d) typeof 结果比较
      return out.push(i);
    }
    if (prev && prev.t === 'id' && prev.v === 'case') { if (!caseOfTypeofSwitch(toks, i)) out.push(i); return; }
    // `'x' in obj` 不计第 ④ 类：卷卷二 :2412 ④ 只列 ===/!==/switch/Map 键/数组元素，`in` 属 ② 对 string 值的操作。
    if (isP(prev, '(') && isP(next, ')') && toks[i - 2] && (toks[i - 2].v === 'get' || toks[i - 2].v === 'has') && isP(toks[i - 3], '.')) return out.push(i);
    if (inIncludesArray(toks, i)) out.push(i);
  });
  return out;
}

// S13 ④ 的补洞写法（卷二 S13 上下文白名单"三条补洞"②③、§2.8 代表性正反例；整类规则，不认具体字串）：
//   别名溯源   本文件常量折叠后为字串的名字参与 ===/!==/==/!=、case（`const S='sleep'; x===S`）
//   族前缀拼接 以 `_` 结尾的代号前缀字串与表达式相拼：`'sfam_'+k`、`` `sfam_${k}` ``、String.fromCharCode
//   动态取句柄 句柄根（类别行 handleRoots）的计算属性访问 `V[fam]`、`V[`…`]`；模板串作下标 `o[`…${k}`]`
//   字面量判断表 对象或数组字面量立即被下标或取成员 `{sleep:1}[x]`、`['sleep'][0]`、`{a:'s'}.a`；
//               `new Map([['sleep',1]])` 的字串键、`new Set(['a'])` 的字串元素
const ID_PREFIX = /^[a-z][a-z0-9]*_$/;
const EXPR_START = new Set(['(', '=', ',', '?', ':', '||', '&&', '??', '===', '!==', '==', '!=', '[', '!', '+', '-']);

function isExprStart(toks, i) {
  const prev = toks[i - 1];
  return !!prev && ((prev.t === 'p' && EXPR_START.has(prev.v)) || (prev.t === 'id' && (prev.v === 'return' || prev.v === 'case')));
}

// 容器字面量 toks[open..close] 里深度 1 的字串元素（Map 取内层数组的第一个元素）
function containerStrs(toks, open, close, mapEntries) {
  const out = []; let d = 0;
  for (let k = open; k <= close; k++) {
    const t = toks[k];
    if (isP(t, '[') || isP(t, '(') || isP(t, '{')) { d++; if (mapEntries && d === 2 && isP(t, '[')) { const n = toks[k + 1]; if (n && (n.t === 'str' || (n.t === 'tpl' && n.exprs.length === 0))) out.push(k + 1); } continue; }
    if (isP(t, ']') || isP(t, ')') || isP(t, '}')) { d--; continue; }
    if (!mapEntries && d === 1 && (t.t === 'str' || (t.t === 'tpl' && t.exprs.length === 0)) && (isP(toks[k - 1], '[') || isP(toks[k - 1], ','))) out.push(k);
  }
  return out;
}

function shapeHits(toks, roots) {
  const out = [];
  const env = buildEnv(toks);
  const aliases = new Set([...env].filter(([, v]) => v.k === 'str').map(([n]) => n));
  toks.forEach((t, i) => {
    const prev = toks[i - 1]; const next = toks[i + 1];
    const dotted = isP(prev, '.') || isP(prev, '?.');
    if (t.t === 'id' && aliases.has(t.v) && !dotted) {
      const eq = (x) => x && x.t === 'p' && EQ_OPS.has(x.v);
      if ((eq(prev) || eq(next)) || (prev && prev.t === 'id' && prev.v === 'case')) out.push(i);
    }
    if (t.t === 'str' && ID_PREFIX.test(t.v) && (isP(prev, '+') || isP(next, '+'))) out.push(i);
    if (t.t === 'tpl' && t.exprs.length && t.quasis.some((q, j) => j < t.exprs.length && ID_PREFIX.test(q))) out.push(i);
    if (t.t === 'id' && t.v === 'String' && isP(next, '.') && toks[i + 2] && toks[i + 2].v === 'fromCharCode') out.push(i);
    if (t.t === 'id' && roots.includes(t.v) && !dotted && isP(next, '[')) out.push(i);
    if (t.t === 'tpl' && t.exprs.length && isP(prev, '[') && isP(next, ']') && toks[i - 2] && (toks[i - 2].t === 'id' || isP(toks[i - 2], ')') || isP(toks[i - 2], ']'))) out.push(i);
    if (t.t === 'p' && (t.v === '{' || t.v === '[') && isExprStart(toks, i)) {
      let close = matchClose(toks, i);
      const callee = toks[i - 2];
      const grouping = !callee || !((callee.t === 'id' && !['return', 'case', 'typeof', 'in', 'of'].includes(callee.v)) || isP(callee, ')') || isP(callee, ']'));
      if (isP(prev, '(') && grouping && isP(toks[close + 1], ')')) close++; // `({…}).a`、`(['x'])[0]`（括号是分组不是调用）
      const after = toks[close + 1];
      const indexed = isP(after, '[') || (t.v === '{' && isP(after, '.') && toks[close + 2] && toks[close + 2].t === 'id' && !isP(toks[close + 3], '('));
      if (indexed) out.push(i);
    }
    if (t.t === 'id' && t.v === 'new' && next && (next.v === 'Map' || next.v === 'Set') && isP(toks[i + 2], '(') && isP(toks[i + 3], '[')) {
      out.push(...containerStrs(toks, i + 3, matchClose(toks, i + 3), next.v === 'Map'));
    }
  });
  return [...new Set(out)];
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

// tsc 一道（见头注）：真仓库直接跑 jsconfig.json；用例上下文写临时目录后用同一份编译选项跑，只核用例文件。
// 诊断行按 `<文件>(<行>,<列>): error TS<号>: <文字>` 取；命中按文件、行、TS 号记，信息确定。
function tscRun(bin, args, cwd) {
  try {
    return { status: 0, out: String(execFileSync(process.execPath, [bin, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28 })) };
  } catch (e) {
    return { status: typeof e.status === 'number' ? e.status : 1, out: `${e.stdout || ''}${e.stderr || ''}` };
  }
}

function tscDiagnostics(out, code) {
  const hits = [];
  for (const line of String(out).split(/\r?\n/)) {
    const m = /^(.*?)\((\d+),(\d+)\):\s+error\s+TS(\d+):/.exec(line);
    if (!m) continue;
    hits.push({ file: m[1].replace(/\\/g, '/'), line: Number(m[2]), nodeKind: 'tsc', symbolPath: `TS${m[4]}`, code });
  }
  return hits;
}

function compilerOptionsOf(ctx, configFile) {
  const p = join(ctx.root, configFile);
  if (!existsSync(p)) return {};
  try {
    const cfg = JSON.parse(readFileSync(p, 'utf8'));
    return (cfg && cfg.compilerOptions) || {};
  } catch {
    return {};
  }
}

function tscHits(ctx, params, cls) {
  const code = params.code;
  if (!code) throw new Error('E-ACC-ITEM-PARAM tsc check has no code');
  const configFile = cls.configFile || 'jsconfig.json';
  const bin = join(ctx.root, 'node_modules', 'typescript', 'bin', 'tsc');
  if (!ctx.repoFiles) {
    const root = String(ctx.root).replace(/\\/g, '/').replace(/\/$/, '');
    return tscDiagnostics(tscRun(bin, ['-p', configFile], ctx.root).out, code)
      .map((h) => ({ ...h, file: h.file.startsWith(`${root}/`) ? h.file.slice(root.length + 1) : h.file }))
      .filter((h) => h.file !== '');
  }
  const files = ctx.files.filter((f) => /\.(?:mjs|js|cjs)$/.test(f));
  if (!files.length) return [];
  const dir = mkdtempSync(join(tmpdir(), 'acc-tsc-'));
  try {
    for (const f of files) {
      const p = join(dir, f);
      mkdirSync(pdirname(p), { recursive: true });
      writeFileSync(p, ctx.read(f));
    }
    const opts = { ...compilerOptionsOf(ctx, configFile), allowJs: true, checkJs: true, noEmit: true, types: [], typeRoots: [] };
    writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ compilerOptions: opts, include: ['**/*.mjs', '**/*.js', '**/*.cjs'] }));
    const out = tscRun(bin, ['-p', 'tsconfig.json'], dir).out;
    return tscDiagnostics(out, code).map((h) => ({ ...h, file: h.file.startsWith(dir.replace(/\\/g, '/')) ? h.file.slice(dir.replace(/\\/g, '/').length).replace(/^\//, '') : h.file }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function detect(ctx, params, cls) {
  const checks = params.checks || [];
  const codes = (cls && cls.checkCodes) || {};
  const regexFiles = (cls && cls.regexFiles) || [];
  const castFiles = (cls && cls.castFiles) || [];
  const handleRoots = (cls && cls.handleRoots) || [];
  const hits = [];
  if (checks.includes('tsc')) hits.push(...tscHits(ctx, params, cls || {}));
  for (const file of scopeFiles(ctx, params)) {
    const src = ctx.read(file);
    const toks = tokenize(src);
    const comments = checks.some((c) => ['exportParams', 'directive', 'anyType', 'assertCast'].includes(c)) ? commentsOf(src) : [];
    const paths = symbolPaths(toks);
    const sym = (idx) => paths[idx] || '';
    const group = classify(file, ctx.model).group;
    for (const check of checks) {
      if (check === 'tsc') continue; // 整仓一次，见 tscHits
      // 组有自己的违例码的（卷二 §2.8 各模块组表"违例码"列，登记在类别行 groupCodes）按组取，否则取 checkCodes。
      const own = ((cls && cls.groupCodes) || {})[group];
      const code = own && own[check] ? own[check] : codes[check];
      if (!code) throw new Error(`E-ACC-ITEM-PARAM check=${check} has no registered code`);
      const push = (line, symbolPath, nodeKind) => hits.push({ file, line, nodeKind, symbolPath, code });
      if (check === 'regex') { if (!matchGlobs(file, regexFiles, ctx.model.codeExts)) for (const i of regexHits(toks)) push(toks[i].line, sym(i), 'regex'); }
      else if (check === 'nonAscii') for (const i of nonAsciiHits(toks)) push(toks[i].line, sym(i), 'literal_non_ascii');
      else if (check === 'bareCompare') for (const i of [...bareCompareHits(toks), ...shapeHits(toks, handleRoots)].sort((a, b) => a - b)) push(toks[i].line, sym(i), 'literal_compare');
      else if (check === 'exportParams') for (const h of exportParamHits(toks, comments)) push(h.line, h.symbolPath, 'export_param');
      else if (check === 'assertCast') { if (!matchGlobs(file, castFiles, ctx.model.codeExts)) for (const h of commentHits(src, toks, comments, check)) push(h.line, h.symbolPath, check); }
      else if (check === 'directive' || check === 'anyType') for (const h of commentHits(src, toks, comments, check)) push(h.line, h.symbolPath, check);
      else throw new Error(`E-ACC-ITEM-PARAM check=${check}`);
    }
  }
  return hits;
}
