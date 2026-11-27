// 检测器 path_access（卷十二 §2.3）：对某状态路径模式的读点或写点不在登记的读者、写者内。
// params.groups：范围（模块组键）；params.code：命中所报的错误码（read、branch 两种）；params.codes：本条目计哪些码（write、display 两种）。
// params.access：
//   read    凡读 params.paths 所列模式即计；params.readers：登记的读者组键（缺省为空）
//   branch  读到并据此分支才计（卷一 R-8 判定）
//   write   写入归属（卷十二 R12-3.2 越系统写；卷二 §2.6 第 3 条静态一道，块 2 第 2-3 张）：路径、写者、通道全部取自声明表，不列字段名单——
//           ① 调登记写入口（扫描类别行 writeEntries 列的 kernelApi 导出名）时，路径实参是 P 句柄成员，按声明表派生出模式，
//              所在文件不是该模式最具体的登记改写写者（也不是建行写者）即 E-VIEW-UNDECLARED-WRITE；路径实参不是 P 成员，同码（写入点归不到路径上，R12-3.4）；
//           ② 直接改 state（赋值、自增减、delete 的目标是 state 成员链）不经三条写通道即 E-VIEW-BYPASS。
//           每行带分量 c_write_<声明项键>（R12-3.3 按声明项派生；归不到声明项的不带）。
//   stateRead 读以 state 为根的路径（卷二 §2.5 :495；迁移体检 K5-24）：params.paths 是 state 之下的路径（如 terminated），范围内凡 state 根的成员链（读，非写入目标）以它开头即计；
//           根按状态根认（lib/js-state.mjs stateChains），P.terminated 一类经句柄、谓词的读根不是 state，不计；计算属性段不当作命中（动态读归 E-VIEW-DYNAMIC-STATE）；kernel 目录靠范围（params.groups 不含 kernel）豁免，不点名文件。
//   display 读显示路径（卷十二 R12-2.10：显示集合只取声明表 stateKeys.<键>.display 与 textPaths）：state 成员链落在显示路径上即 E-VIEW-DISPLAY-READ。
// 局限（P-1 与 2-3 汇报）：按成员链读路径，解构取出后的分支追不到；state 的根按名字认（lib/js-state.mjs），类型归因要等 tsc。

import { tokenize, memberChains, conditionSpans, symbolPaths, BRANCH_OPS, importsOf, isP, buildEnv, matchClose } from '../lib/js-scan.mjs';
import { stateChains, declPaths, writerOf, segsMatch, serverRel, callsOf } from '../lib/js-state.mjs';
import { filesOfGroups, globToRe } from '../read.mjs';
import { readOwnersFiles, hasOwnersFiles } from '../lib/registry-files.mjs';
import { projectOf, fileOf, walkAll, fold, originsOf, where, propName } from '../lib/ast.mjs';

// 按语法树读状态顶层键（params.ast = on，C0；亮圳规定检查代码不许靠认字面文字判）：params.paths 的每一项是一个单段键名。
// 计：成员访问（属性名，或下标折叠得出的字串）、对象解构的键、下标折叠不出常量且对象来源根名在类别行 dynamicRoots 里的（nodeKind review:dynamic，待人审）。
// 读者文件（readers）不计。别名（const s = state; s.accounts）按属性名照样命中；经形参传来的对象同样命中（只看被取的键名，不看对象叫什么）。
function astReadHits(ctx, params, cls, readers) {
  const names = new Set(params.paths || []);
  const roots = new Set(cls.dynamicRoots || []);
  const code = params.code || '';
  const hits = [];
  const project = projectOf(ctx);
  for (const file of scopeOf(ctx, params)) {
    if (readers.has(file)) continue;
    const rec = fileOf(project, file);
    if (!rec || rec.error) { hits.push({ file, line: 0, nodeKind: 'parseError', symbolPath: rec ? rec.error.slice(0, 60) : 'missing', code: 'E-ACC-ITEM-PARAM' }); continue; }
    walkAll(rec.ast, (n) => {
      if (n.type === 'MemberExpression') {
        let key = propName(n);
        if (n.computed) { const f = fold(n.property, rec); key = f ? String(f.v) : null; }
        if (key !== null && names.has(key)) hits.push({ file, ...where(n), nodeKind: 'member', code });
        else if (key === null && roots.size && originsOf(n.object, rec).some((o) => o.path && !o.dynamic && o.path.length === 1 && roots.has(o.path[0]))) hits.push({ file, ...where(n), nodeKind: 'review:dynamic', code });
      } else if (n.type === 'Property' && n.__parent && n.__parent.type === 'ObjectPattern') {
        let key = n.computed ? null : (n.key.name ?? String(n.key.value));
        if (n.computed) { const f = fold(n.key, rec); key = f ? String(f.v) : null; }
        if (key !== null && names.has(key)) hits.push({ file, ...where(n), nodeKind: 'destructure', code });
      }
    });
  }
  return hits;
}

export function detect(ctx, params, cls) {
  if (params.access === 'write') return writeHits(ctx, params, cls || {});
  if (params.access === 'display') return displayHits(ctx, params);
  if (params.access === 'ref') return refHits(ctx, params, cls);
  if (params.access === 'stateRead') return stateReadHits(ctx, params);
  const pats = (params.paths || []).map((p) => p.split('.').map((seg) => globToRe(seg, [])));
  // readerSystems：登记的读者是具体文件（卷六 A6-1.1 的账本内核，调用图白名单 S6-13 同法），文件不抄名单，取自声明表该系统（systems.<系统>.writers）所涉状态键的写者登记。
  // readerPredicates：登记的读者是该系统谓词的提供文件（卷二 §2.5 :503 terminal 的读者只有提供 terminated 谓词的 action-capacity.mjs），取自声明表 systems.<系统>.predicates，不点名文件。
  // readerSet（C0，乙 5）：按文件豁免的读者集合，登记在本条目扫描类别行 fileSets：{集合代号: [{file, basis}]}，没有 basis（卷:行依据）的行不收。
  const setFiles = params.readerSet === undefined ? [] : (((cls || {}).fileSets || {})[params.readerSet] || []).filter((e) => e && e.file && e.basis).map((e) => e.file);
  const readers = new Set([...filesOfGroups(ctx.files, ctx.model, params.readers || []), ...ownerFiles(ctx, params.readerSystems), ...predicateFiles(ctx, params.readerPredicates), ...setFiles]);
  if (params.access === 'read' && params.ast === 'on') return astReadHits(ctx, params, cls || {}, readers);
  // 带 readerSystems 的读条目查的是资源种类行（卷六 A6-1.1）的字段：同名字段出自别的表的行（如卷十八 :337 持有种类行的 transferable）不是该行，按“这一行出自哪张表”认。
  const rowTable = params.readerSystems !== undefined ? resourceTableCode : null;
  // 解构取字段（`const { f } = x`、`({ f }) =>`、`for (const { f: g } of xs)`）：只有单段模式能按键名认，键名合模式即计（宁报勿漏，同 K5-24 stateRead 的解构口径）；
  // 读（read）才计，branch 只管成员链上的分支。带 readerSystems 的条目（rowTable 非空，卷六 A6-1.1）不计解构：
  // 它的字段按"这一行出自哪张表"认，解构追不到行的来历，计入会把别表同名字段（卷十八 :337）一并报出，改变该条目原口径。
  const singles = params.access === 'branch' || rowTable ? [] : pats.filter((pat) => pat.length === 1).map((pat) => pat[0]);
  const hits = [];
  for (const file of scopeOf(ctx, params)) {
    if (readers.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const cond = params.access === 'branch' ? conditionSpans(toks) : null;
    const sym = symbolPaths(toks);
    const env = rowTable ? buildEnv(toks) : null;
    for (const ch of memberChains(toks)) {
      if (!pats.some((pat) => windowMatch(ch.segs, pat))) continue;
      if (cond && !isBranch(toks, ch, cond)) continue;
      if (rowTable && isForeignRow(toks, env, ch, rowTable)) continue;
      hits.push({ file, line: toks[ch.start].line, nodeKind: 'member', symbolPath: sym[ch.start], code: params.code || '' });
    }
    if (!singles.length) continue;
    for (const k of destructuredKeys(toks)) {
      if (singles.some((re) => re.test(toks[k].v))) hits.push({ file, line: toks[k].line, nodeKind: 'destructure', symbolPath: sym[k], code: params.code || '' });
    }
  }
  return hits;
}

// 对象解构模式里的键位下标。认作解构模式的 `{…}`：收尾 `}` 后紧跟 `=`（声明、赋值、参数缺省）或 `of`/`in`；或是形参表里的一项
// （所在括号收尾后紧跟 `=>`，或括号前是 `function [名]`、`catch`）；或是另一解构模式里 `键:` 之后的值（嵌套）。
// 键位：模式第一层里紧跟 `{` 或 `,`、其后是 `,` `}` `:` `=` 的标识符或字串；`...rest` 不是键。
function destructuredKeys(toks) {
  const out = [];
  const seen = new Set();
  const keysOf = (open) => {
    if (seen.has(open)) return;
    seen.add(open);
    const close = matchClose(toks, open);
    for (let i = open + 1; i < close; i++) {
      if (isP(toks[i], '{') || isP(toks[i], '[') || isP(toks[i], '(')) { i = matchClose(toks, i); continue; }
      const t = toks[i];
      if ((t.t !== 'id' && t.t !== 'str') || !(isP(toks[i - 1], '{') || isP(toks[i - 1], ','))) continue;
      const nx = toks[i + 1];
      if (!(isP(nx, ',') || isP(nx, '}') || isP(nx, ':') || isP(nx, '='))) continue;
      out.push(i);
      if (isP(nx, ':') && isP(toks[i + 2], '{')) keysOf(i + 2);
    }
  };
  for (let o = 0; o < toks.length; o++) {
    if (!isP(toks[o], '{') || isP(toks[o - 1], ':')) continue;
    const c = matchClose(toks, o);
    const after = toks[c + 1];
    let pattern = isP(after, '=') || (after && after.t === 'id' && (after.v === 'of' || after.v === 'in'));
    if (!pattern && (isP(toks[o - 1], '(') || isP(toks[o - 1], ','))) {
      const p = enclosingParen(toks, o);
      if (p >= 0) {
        const pc = matchClose(toks, p);
        const before = toks[p - 1]; const before2 = toks[p - 2];
        pattern = isP(toks[pc + 1], '=>') || (before && before.t === 'id' && (before.v === 'function' || before.v === 'catch'))
          || (before && before.t === 'id' && before2 && before2.t === 'id' && before2.v === 'function');
      }
    }
    if (pattern) keysOf(o);
  }
  return out.sort((a, b) => a - b);
}

// toks[i] 所在的最内层未闭合 `(` 的下标；不在括号里为 -1。
function enclosingParen(toks, i) {
  let depth = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (isP(toks[k], ')') || isP(toks[k], ']') || isP(toks[k], '}')) depth++;
    else if (isP(toks[k], '(') || isP(toks[k], '[') || isP(toks[k], '{')) { if (depth === 0) return isP(toks[k], '(') ? k : -1; depth--; }
  }
  return -1;
}

// 谓词提供文件：参数给系统代号，文件取声明表 systems.<系统>.predicates 各项（"<服务端根相对文件>#<导出名>"）的文件部分（卷二 §2.5、§2.7）。
// 系统不在声明表、没有谓词登记、派生出的文件不在文件清单里，一律 E-ACC-ITEM-PARAM，不静默跳过（同 ownerFiles）。
function predicateFiles(ctx, ids) {
  if (ids === undefined) return [];
  const decl = ctx.decl || {};
  const root = ((ctx.model.processes || {}).server || {}).root || '';
  const out = new Set();
  for (const id of ids) {
    const sys = (decl.systems || {})[id];
    if (!sys) throw new Error(`E-ACC-ITEM-PARAM system=${id}`);
    for (const p of sys.predicates || []) out.add(root + String(p).split('#')[0]);
  }
  if (!out.size) throw new Error(`E-ACC-ITEM-PARAM systems=${ids.join(',')} no predicate files`);
  const repo = ctx.repoFiles || ctx.files;
  for (const f of out) if (!repo.includes(f)) throw new Error(`E-ACC-ITEM-PARAM derived file missing ${f}`);
  return [...out].sort();
}

// 资源种类表的登记代号（world/rules/registry.json 的 economyResources 行，与 state_pattern 同一口径，R12-11.5）。
const resourceTableCode = 'economyResources';

// 链根变量是否证明是别的表的行：根变量的绑定 `const X = F(...)`，F 是本文件声明的函数，函数体读词表记录（`.family` 与 `.entry` 成员，
// 卷二词表索引记录的形状：行是 family 对应词表的条目，不是资源种类表的行）且全程不碰资源种类表代号。
// 追不到绑定（参数、解构、跨文件传入）一律不豁免，仍计——证明不了别的表就按资源种类行处理，不放过。
function isForeignRow(toks, env, ch, tableCode) {
  const root = toks[ch.start];
  let at = -1;
  for (let k = ch.start - 1; k >= 2; k--) {
    if (isP(toks[k], '=') && toks[k - 1].t === 'id' && toks[k - 1].v === root.v && ['const', 'let', 'var'].includes(toks[k - 2].v)) { at = k + 1; break; }
  }
  if (at < 0) return false;
  if (toks[at].t === 'id' && toks[at].v === 'await') at++;
  const f = toks[at];
  if (!f || f.t !== 'id' || !isP(toks[at + 1], '(')) return false;
  const stmtEnd = matchClose(toks, at + 1) + 1;
  if (toks[stmtEnd] && !isP(toks[stmtEnd], ';') && !toks[stmtEnd].nl) return false;
  const body = functionBody(toks, f.v);
  if (!body) return false;
  const mentions = (lo, hi, pred) => { for (let k = lo; k < hi; k++) if (pred(toks[k], k)) return true; return false; };
  const code = (t) => (t.t === 'str' && t.v === tableCode) || (t.t === 'id' && (t.v === tableCode || env.get(t.v) === tableCode));
  const member = (name) => (t, k) => t.t === 'id' && t.v === name && isP(toks[k - 1], '.');
  if (mentions(at, stmtEnd, code) || mentions(body[0], body[1], code)) return false;
  return mentions(body[0], body[1], member('family')) && mentions(body[0], body[1], member('entry'));
}

// 本文件声明的函数 name 的函数体 [`{` 下标, `}` 下标 + 1)；`function name(` 与 `const name = (…) => {` 两种写法，其余认不出（返回 null）。
function functionBody(toks, name) {
  for (let i = 0; i < toks.length; i++) {
    let open = -1;
    if (toks[i].t === 'id' && toks[i].v === 'function' && toks[i + 1] && toks[i + 1].v === name && isP(toks[i + 2], '(')) {
      const close = matchClose(toks, i + 2);
      if (isP(toks[close + 1], '{')) open = close + 1;
    } else if (toks[i].t === 'id' && toks[i].v === name && toks[i - 1] && toks[i - 1].v === 'const' && isP(toks[i + 1], '=')) {
      let k = i + 2;
      if (toks[k] && toks[k].t === 'id' && toks[k].v === 'async') k++;
      if (isP(toks[k], '(')) { const close = matchClose(toks, k); if (isP(toks[close + 1], '=>') && isP(toks[close + 2], '{')) open = close + 2; }
    }
    if (open >= 0) return [open, matchClose(toks, open) + 1];
  }
  return null;
}

// 登记派生的文件：参数给系统代号（声明表 systems 的键），文件取该系统 writers 所涉状态键在 stateKeys.<键>.writers 里登记的写者文件（rewrite、create），
// 服务端根相对转仓库路径（卷二 §2.7）。不另抄文件名单（R12-11.5）；系统不在声明表、派生不出文件、派生出的文件不在文件清单里，一律 E-ACC-ITEM-PARAM，不静默跳过。
function ownerFiles(ctx, ids) {
  if (ids === undefined) return [];
  const decl = ctx.decl || {};
  const root = ((ctx.model.processes || {}).server || {}).root || '';
  const out = new Set();
  for (const id of ids) {
    const sys = (decl.systems || {})[id];
    if (!sys) throw new Error(`E-ACC-ITEM-PARAM system=${id}`);
    for (const w of sys.writers || []) {
      const row = (decl.stateKeys || {})[w.split('.')[0]];
      for (const v of Object.values((row && row.writers) || {})) {
        const rels = typeof v === 'string' ? [v] : [v && v.rewrite, ...((v && v.create) || [])];
        for (const rel of rels) if (rel) out.add(root + rel);
      }
    }
  }
  if (!out.size) throw new Error(`E-ACC-ITEM-PARAM systems=${ids.join(',')} no writer files`);
  // 存在性对照真实仓库清单：真实执行里就是 ctx.files；用例夹具是虚拟文件集，执行器带 repoFiles（真实清单）来核，夹具里没有的派生文件只是不进本次扫描。
  const repo = ctx.repoFiles || ctx.files;
  for (const f of out) if (!repo.includes(f)) throw new Error(`E-ACC-ITEM-PARAM derived file missing ${f}`);
  return [...out].sort();
}

// 范围：params.groups 展开的文件，并上 params.scopeSystems 由登记派生的具体文件。
function scopeOf(ctx, params) {
  const scope = new Set([...filesOfGroups(ctx.files, ctx.model, params.groups || []), ...ownerFiles(ctx, params.scopeSystems).filter((f) => ctx.files.includes(f))]);
  return [...scope].sort();
}

// ref（卷六 A6-1.1 后半"账本内核对 priceFor、valuation 的引用为 0"）：params.paths 是单段名字；范围内（读者除外）出现
// ① 同名标识符（不在 `.` 之后；import 列表里的名字、调用、赋值、传参都算引用），或 ② 相对静态 import 的模块文件名（去扩展名）同名，各计一处。
// 局限：按名字认，`import x from './valuation.mjs'` 靠 ② 抓到；经第三方模块转手而不出现该名的，要靠转手模块自己的范围。
function refHits(ctx, params, cls) {
  const names = new Set(params.paths || []);
  const readers = new Set([...filesOfGroups(ctx.files, ctx.model, params.readers || []), ...ownerFiles(ctx, params.readerSystems)]);
  const hits = [];
  for (const file of scopeOf(ctx, params)) {
    if (readers.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    const push = (i, nodeKind) => hits.push({ file, line: toks[i].line, nodeKind, symbolPath: sym[i], code: params.code || '' });
    toks.forEach((t, i) => { if (t.t === 'id' && names.has(t.v) && !isP(toks[i - 1], '.') && !isP(toks[i - 1], '?.')) push(i, 'ref'); });
    for (const imp of importsOf(toks)) {
      if (imp.kind !== 'static' || !imp.spec || !imp.spec.startsWith('.')) continue;
      const stem = imp.spec.slice(imp.spec.lastIndexOf('/') + 1).replace(/\.[A-Za-z]+$/, '');
      if (names.has(stem)) push(imp.at, 'import_module');
    }
  }
  return hits;
}

/** 本条目派生的分量（R12-3.3）：write 方式下声明表每个写者声明项（状态顶层键）一个 c_write_<键>；其余方式没有。 */
export function components(ctx, params) {
  return params.access === 'write' ? declPaths(ctx.decl).keys.map((k) => `c_write_${k}`) : [];
}

// 声明表若在被查内容里（真仓库、或用例把 state-owners.json 或其分片当夹具放进虚拟文件集），按被查内容合并读；否则用载入上下文时读到的。
// 这样 dated 写者等声明数据能随用例一起给出，检测器本身仍不列任何路径或写者名单。
function declOf(ctx) {
  if (hasOwnersFiles(ctx)) {
    try {
      const doc = readOwnersFiles(ctx).doc;
      return doc && typeof doc === 'object' ? doc : ctx.decl;
    } catch {
      return ctx.decl;
    }
  }
  return ctx.decl;
}

// 按日生效改写（卷二 §2.7 `dated` 条）的写者模式集合：写者对象上 dated 为真。记录只经 writeDated 追加，
// 任何 writePath 直接写到这些模式上都是拒写（L-09 ⑥）。模式取自声明数据，本文件不列字段名以外的路径。
function datedPatterns(decl) {
  const out = new Set();
  for (const [key, row] of Object.entries((decl && decl.stateKeys) || {})) {
    if (!row || typeof row !== 'object') continue;
    for (const [rel, w] of Object.entries(row.writers || {})) if (w && typeof w === 'object' && w.dated === true) out.add(`${key}.${rel}`);
  }
  return out;
}

function writeHits(ctx, params, cls) {
  const want = new Set(params.codes || []);
  const decl = declOf(ctx);
  const dp = declPaths(decl);
  const dated = datedPatterns(decl);
  const entries = new Set((cls.writeEntries || []).map((e) => e.slice(e.indexOf('#') + 1)));
  const comp = (key) => (key ? `c_write_${key}` : undefined);
  const hits = [];
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    const rel = serverRel(file, ctx.model);
    const push = (i, nodeKind, code, key) => { if (want.has(code)) hits.push({ file, line: toks[i].line, nodeKind, symbolPath: sym[i], code, comp: comp(key) }); };
    for (const call of callsOf(toks, entries)) {
      const a = call.args[1];
      const member = a && toks[a[0]].t === 'id' && toks[a[0] + 1] && toks[a[0] + 1].v === '.' && toks[a[0] + 2] && toks[a[0] + 2].t === 'id' && toks[a[0] + 3] && toks[a[0] + 3].v === '(' ? toks[a[0] + 2].v : null;
      const pattern = member === null ? null : dp.members.get(member);
      if (!pattern) { push(call.idx, 'write_call', 'E-VIEW-UNDECLARED-WRITE', null); continue; }
      const w = writerOf(dp.writers, pattern.split('.'));
      // dated 模式只许 writeDated 追加记录，writePath 直接写即拒（见 datedPatterns 头注）。
      const ok = w && rel !== null && !(w && dated.has(w.pattern)) && (w.rewrite === rel ? !w.viaRelocate : (w.create || []).includes(rel));
      if (!ok) push(call.idx, 'write_call', 'E-VIEW-UNDECLARED-WRITE', w ? w.key : pattern.split('.')[0]);
    }
    for (const ch of stateChains(toks)) {
      if (!ch.write) continue;
      const key = ch.segs.length && dp.keys.includes(ch.segs[0]) ? ch.segs[0] : null;
      push(ch.start, 'state_write', 'E-VIEW-BYPASS', key);
    }
  }
  return hits;
}

function stateReadHits(ctx, params) {
  const pats = (params.paths || []).map((p) => p.split('.'));
  const hits = [];
  for (const file of scopeOf(ctx, params)) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    const push = (ch, nodeKind) => hits.push({ file, line: toks[ch.start].line, nodeKind, symbolPath: sym[ch.start], code: params.code || '' });
    for (const ch of stateChains(toks)) {
      if (ch.write) continue;
      // 宁报勿漏（卡头第二节第 3 条）：① 计算属性做第一段（state[k]，键未知可能就是目标）；② state 被绑定为值（`= state`，含解构 `{…} = state`、别名 `const s = state`），之后换名读追不到。
      // 作为函数实参传入（terminated(engine, state, id)、readPath(state, …)）不计。
      if (ch.segs[0] === '*') { push(ch, 'computed'); continue; }
      if (!ch.segs.length && boundAsValue(toks, ch)) { push(ch, 'alias'); continue; }
      if (pats.some((pat) => ch.segs.length >= pat.length && pat.every((seg, k) => ch.segs[k] === seg))) push(ch, 'member');
    }
  }
  return hits;
}

// 裸 `state`（链无后续成员）是否被绑定为值：根前（跳过 `x.` 前缀，如 engine.state）紧挨赋值号 `=`。
function boundAsValue(toks, ch) {
  let k = ch.start - 1;
  while (k >= 1 && isP(toks[k], '.') && toks[k - 1].t === 'id') k -= 2;
  return k >= 0 && isP(toks[k], '=');
}

function displayHits(ctx, params) {
  const want = new Set(params.codes || []);
  const dp = declPaths(ctx.decl);
  const pats = dp.display.map((p) => p.split('.'));
  const hits = [];
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    for (const ch of stateChains(toks)) {
      if (ch.write || !pats.some((pat) => segsMatch(pat, ch.segs.slice(0, pat.length)) && ch.segs.length >= pat.length)) continue;
      if (want.has('E-VIEW-DISPLAY-READ')) hits.push({ file, line: toks[ch.start].line, nodeKind: 'member', symbolPath: sym[ch.start], code: 'E-VIEW-DISPLAY-READ' });
    }
  }
  return hits;
}

function windowMatch(segs, pat) {
  for (let s = 0; s + pat.length <= segs.length; s++) if (pat.every((re, k) => re.test(segs[s + k]))) return true;
  return false;
}

function isBranch(toks, ch, cond) {
  for (let k = ch.start; k < ch.end; k++) if (cond[k]) return true;
  const after = toks[ch.end]; const before = toks[ch.start - 1];
  const op = (t) => t && (t.t === 'p' || t.t === 'id') && (BRANCH_OPS.has(t.v) || t.v === 'case');
  return op(after) || op(before);
}
