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
//   display 读显示路径（卷十二 R12-2.10：显示集合只取声明表 stateKeys.<键>.display 与 textPaths）：state 成员链落在显示路径上即 E-VIEW-DISPLAY-READ。
// 局限（P-1 与 2-3 汇报）：按成员链读路径，解构取出后的分支追不到；state 的根按名字认（lib/js-state.mjs），类型归因要等 tsc。

import { tokenize, memberChains, conditionSpans, symbolPaths, BRANCH_OPS, importsOf, isP } from '../lib/js-scan.mjs';
import { stateChains, declPaths, writerOf, segsMatch, serverRel, callsOf } from '../lib/js-state.mjs';
import { filesOfGroups, globToRe } from '../read.mjs';

export function detect(ctx, params, cls) {
  if (params.access === 'write') return writeHits(ctx, params, cls || {});
  if (params.access === 'display') return displayHits(ctx, params);
  if (params.access === 'ref') return refHits(ctx, params, cls);
  const pats = (params.paths || []).map((p) => p.split('.').map((seg) => globToRe(seg, [])));
  // readerSet：登记的读者是具体文件（卷六 A6-1.1 的 `kernel/ledger.mjs`，调用图白名单 S6-13 同法），文件集登记在所属扫描类别行 fileSets，条目只引用集合代号。
  const readers = new Set([...filesOfGroups(ctx.files, ctx.model, params.readers || []), ...fileSet(cls, params.readerSet)]);
  const hits = [];
  for (const file of scopeOf(ctx, params, cls)) {
    if (readers.has(file)) continue;
    const toks = tokenize(ctx.read(file));
    const cond = params.access === 'branch' ? conditionSpans(toks) : null;
    const sym = symbolPaths(toks);
    for (const ch of memberChains(toks)) {
      if (!pats.some((pat) => windowMatch(ch.segs, pat))) continue;
      if (cond && !isBranch(toks, ch, cond)) continue;
      hits.push({ file, line: toks[ch.start].line, nodeKind: 'member', symbolPath: sym[ch.start], code: params.code || '' });
    }
  }
  return hits;
}

// 文件集：扫描类别行 fileSets.<代号>（文件名单只在登记行，参数里只引用代号，R12-11.5）；没给代号为空，给了而类别行里没有即报错，不静默放过。
function fileSet(cls, name) {
  if (name === undefined) return [];
  const set = ((cls || {}).fileSets || {})[name];
  if (!Array.isArray(set)) throw new Error(`E-ACC-ITEM-PARAM fileSet=${name}`);
  return set;
}

// 范围：params.groups 展开的文件，并上 params.scopeSet 文件集里（须在文件清单里的）具体文件。
function scopeOf(ctx, params, cls) {
  const scope = new Set(filesOfGroups(ctx.files, ctx.model, params.groups || []));
  for (const f of fileSet(cls, params.scopeSet)) if (ctx.files.includes(f)) scope.add(f);
  return [...scope].sort();
}

// ref（卷六 A6-1.1 后半"账本内核对 priceFor、valuation 的引用为 0"）：params.paths 是单段名字；范围内（读者除外）出现
// ① 同名标识符（不在 `.` 之后；import 列表里的名字、调用、赋值、传参都算引用），或 ② 相对静态 import 的模块文件名（去扩展名）同名，各计一处。
// 局限：按名字认，`import x from './valuation.mjs'` 靠 ② 抓到；经第三方模块转手而不出现该名的，要靠转手模块自己的范围。
function refHits(ctx, params, cls) {
  const names = new Set(params.paths || []);
  const readers = new Set([...filesOfGroups(ctx.files, ctx.model, params.readers || []), ...fileSet(cls, params.readerSet)]);
  const hits = [];
  for (const file of scopeOf(ctx, params, cls)) {
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

function writeHits(ctx, params, cls) {
  const want = new Set(params.codes || []);
  const dp = declPaths(ctx.decl);
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
      const ok = w && rel !== null && (w.rewrite === rel ? !w.viaRelocate : (w.create || []).includes(rel));
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
