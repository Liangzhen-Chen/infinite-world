// 检测器 decl_guard（卷十二 §2.3 开放登记；格子迁移 G12–G16 开写前门禁）：守护对象由声明表（state-owners.json）里的登记派生，
// 守护对象所在文件现在还没落地时照样登记，现仓库计数为 0；落地卡把自己登进声明表，判据自动收紧，不点名文件、组名、id。
// params.access：
//   dimWrite    卷十七 S17-1/S17-4：个体 `pos`、`facing` 的写入点只有声明写者的文件。params.paths 是被守的维度代号（路径最后一段，如 pos、facing）；
//               params.entries 是通用维度写者的 kernelApi 导出 id（如 createItemInstance、writeItemDeviation、writePersonRow，登记在 kernelApi 里）。
//               范围内、本文件不是该维度的声明写者（声明表 stateKeys.*.writers 里最后一段恰为该代号的模式所登记的写者文件）的文件，
//               调用这些入口时实参里出现该代号（字串、键名、成员名、折成该字串的 const）即计。守的是写入点，不是 placeSubject 的调用方。
//   importName  卷二十 §4.7.6：场步进与 propagate 的实现不读卷五路网边。params.paths 是状态顶层键（如 fields、fieldCells），
//               实现文件取声明表里这些键的写者文件（现无声明、文件不在清单里时范围为空）；类别行 importNames 列被禁的导出名（具名导入、重导出、命名空间引用都计），
//               importModules 列被禁的模块文件名（去扩展名；任何形式的 import 都计）。同一文件里 routeView 与必须 import 的 zoneAt 同在一个模块，
//               所以按具名导入判，不按文件级 import。
//   nameUse     卷九 R9-2.10 perceiveEvent、卷二十 §4.7.6 foldBubbleFields 一类"登记之外不许调用"的入口。params.paths 是入口名；
//               名字已在 kernelApi 登记（带 callers/callerFiles）的，交 api-callers 按登记判；还没登记的，除定义该名的文件外，
//               任何文件具名导入、重导出或命名空间引用它即计——落地卡须登记 kernelApi 行并写明 callerFiles。
// 局限：按词法读相对静态 import；经第三个模块转手的、动态拼名字的追不到（靠转手模块自己受同一核对）。

import { tokenize, importsOf, symbolPaths, isP, matchClose, buildEnv } from '../lib/js-scan.mjs';
import { filesOfGroups, resolveRel } from '../read.mjs';
import { declPaths } from '../lib/js-state.mjs';
import { apiCallerHits } from '../lib/api-callers.mjs';

export function detect(ctx, params, cls) {
  if (params.access === 'dimWrite') return dimWriteHits(ctx, params);
  if (params.access === 'importName') return importNameHits(ctx, params, cls || {});
  if (params.access === 'nameUse') return nameUseHits(ctx, params);
  throw new Error(`E-ACC-ITEM-PARAM access=${String(params.access)}`);
}

const serverRootOf = (ctx) => ((ctx.model.processes || {}).server || {}).root || '';

// 声明表里满足 pred 的写者模式所登记的写者文件（改写写者与建行写者），转仓库路径；不要求文件已在仓库里。
function declaredFiles(ctx, pred) {
  const root = serverRootOf(ctx);
  const out = new Set();
  for (const w of declPaths(ctx.decl).writers) {
    if (!pred(w)) continue;
    for (const rel of [w.rewrite, ...(w.create || [])]) if (rel) out.add(root + rel);
  }
  return out;
}

// 本文件里从目标文件 import 来的入口的本地名与命名空间名：返回每处调用的左括号下标。
function boundCalls(toks, file, entries) {
  const locals = new Map();
  const spaces = new Map();
  for (const imp of importsOf(toks)) {
    if (imp.kind !== 'static' || !imp.spec || !imp.spec.startsWith('.') || toks[imp.at].v !== 'import') continue;
    const es = entries.filter((e) => e.target === resolveRel(file, imp.spec));
    if (!es.length) continue;
    for (const n of imp.names) if (es.some((e) => e.name === n.imported)) locals.set(n.local, n.imported);
    const a = toks[imp.at + 1];
    const names = es.map((e) => e.name);
    if (a && a.t === 'id' && a.v !== 'from') spaces.set(a.v, names);
    if (isP(a, '*') && toks[imp.at + 2] && toks[imp.at + 2].v === 'as' && toks[imp.at + 3]) spaces.set(toks[imp.at + 3].v, names);
  }
  const opens = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (t.t !== 'id' || isP(toks[i - 1], '.') || isP(toks[i - 1], '?.')) continue;
    if (locals.has(t.v) && isP(toks[i + 1], '(')) opens.push(i + 1);
    else if (spaces.has(t.v) && isP(toks[i + 1], '.') && toks[i + 2] && toks[i + 2].t === 'id' && spaces.get(t.v).includes(toks[i + 2].v) && isP(toks[i + 3], '(')) opens.push(i + 3);
  }
  return opens;
}

// 调用实参 (open, close) 里出现维度代号 d 的下标：字串 d；成员名 `.d`；对象字面量的键 `d:` 或简写 `{ d }`；折成字串 d 的 const。
// 裸变量名 `pos` 作实参不计（变量名不决定写哪个维度）。
function mentions(toks, open, close, d, env) {
  const out = [];
  const stack = [];
  for (let k = open + 1; k < close; k++) {
    const t = toks[k];
    if (isP(t, '{') || isP(t, '(') || isP(t, '[')) { stack.push(t.v); continue; }
    if (isP(t, '}') || isP(t, ')') || isP(t, ']')) { stack.pop(); continue; }
    if (t.t === 'str' && t.v === d) { out.push(k); continue; }
    if (t.t !== 'id') continue;
    const prev = toks[k - 1];
    const next = toks[k + 1];
    const member = isP(prev, '.') || isP(prev, '?.');
    if (t.v === d) {
      const inObj = stack[stack.length - 1] === '{';
      if (member || (inObj && (isP(next, ':') || ((isP(prev, '{') || isP(prev, ',')) && (isP(next, ',') || isP(next, '}')))))) out.push(k);
    } else if (!member && !isP(next, ':')) {
      const v = env.get(t.v);
      if (v && v.k === 'str' && v.v === d) out.push(k);
    }
  }
  return out;
}

function dimWriteHits(ctx, params) {
  const code = params.code || '';
  const root = serverRootOf(ctx);
  const dims = params.paths || [];
  const allowed = new Map(dims.map((d) => [d, declaredFiles(ctx, (w) => w.pattern.split('.').pop() === d)]));
  const entries = (params.entries || []).map((id) => ({ name: id.slice(id.indexOf('#') + 1), target: root + id.slice(0, id.indexOf('#')) }));
  const hits = [];
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const live = entries.filter((e) => e.target !== file);
    if (!live.length) continue;
    const toks = tokenize(ctx.read(file));
    const opens = boundCalls(toks, file, live);
    if (!opens.length) continue;
    const env = buildEnv(toks);
    const sym = symbolPaths(toks);
    for (const open of opens) {
      const close = matchClose(toks, open);
      for (const d of dims) {
        if (allowed.get(d).has(file)) continue;
        for (const i of mentions(toks, open, close, d, env)) hits.push({ file, line: toks[i].line, nodeKind: 'dim_write', symbolPath: sym[i], code });
      }
    }
  }
  return hits;
}

function importNameHits(ctx, params, cls) {
  const names = new Set(cls.importNames || []);
  const stems = new Set(cls.importModules || []);
  const roots = new Set(params.paths || []);
  const scope = [...declaredFiles(ctx, (w) => roots.has(w.key))].filter((f) => ctx.files.includes(f)).sort();
  const hits = [];
  for (const file of scope) {
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    const push = (i, nodeKind) => hits.push({ file, line: toks[i].line, nodeKind, symbolPath: sym[i], code: params.code || '' });
    const spaces = new Set();
    for (const imp of importsOf(toks)) {
      if (!imp.spec) continue;
      const stem = imp.spec.slice(imp.spec.lastIndexOf('/') + 1).replace(/\.[A-Za-z]+$/, '');
      if (stems.has(stem)) { push(imp.at, 'import_module'); continue; }
      if (imp.kind !== 'static') continue;
      for (let k = imp.at + 1; k < toks.length && toks[k].t !== 'str'; k++) if (toks[k].t === 'id' && names.has(toks[k].v)) push(k, 'import');
      collectSpaces(toks, imp, spaces);
    }
    memberRefs(toks, spaces, names, (i) => push(i, 'member'));
  }
  return hits;
}

function collectSpaces(toks, imp, spaces) {
  const a = toks[imp.at + 1];
  if (toks[imp.at].v !== 'import') return;
  if (a && a.t === 'id' && a.v !== 'from') spaces.add(a.v);
  if (isP(a, '*') && toks[imp.at + 2] && toks[imp.at + 2].v === 'as' && toks[imp.at + 3]) spaces.add(toks[imp.at + 3].v);
}

function memberRefs(toks, spaces, names, emit) {
  if (!spaces.size) return;
  for (let i = 0; i + 2 < toks.length; i++) {
    if (toks[i].t === 'id' && spaces.has(toks[i].v) && !isP(toks[i - 1], '.') && !isP(toks[i - 1], '?.') && (isP(toks[i + 1], '.') || isP(toks[i + 1], '?.')) && toks[i + 2].t === 'id' && names.has(toks[i + 2].v)) emit(i);
  }
}

// 文件里声明了名字 name：function、const、let、var、class。
function declares(toks, name) {
  return toks.some((t, i) => t.t === 'id' && t.v === name && toks[i - 1] && toks[i - 1].t === 'id' && ['function', 'const', 'let', 'var', 'class'].includes(toks[i - 1].v));
}

function nameUseHits(ctx, params) {
  const code = params.code || '';
  const api = (ctx.decl && ctx.decl.kernelApi && ctx.decl.kernelApi.exports) || [];
  const files = filesOfGroups(ctx.files, ctx.model, params.groups || []);
  const hits = [];
  for (const name of params.paths || []) {
    const rows = api.filter((r) => r.export.slice(r.export.indexOf('#') + 1) === name);
    if (rows.length) { hits.push(...apiCallerHits(ctx, { entries: rows.map((r) => r.export), groups: params.groups, code })); continue; }
    const one = new Set([name]);
    for (const file of files) {
      const toks = tokenize(ctx.read(file));
      if (declares(toks, name)) continue;
      const sym = symbolPaths(toks);
      const push = (i, nodeKind) => hits.push({ file, line: toks[i].line, nodeKind, symbolPath: sym[i], code });
      const spaces = new Set();
      for (const imp of importsOf(toks)) {
        if (imp.kind !== 'static' || !imp.spec) continue;
        for (let k = imp.at + 1; k < toks.length && toks[k].t !== 'str'; k++) if (toks[k].t === 'id' && toks[k].v === name) push(k, toks[imp.at].v === 'export' ? 'reexport' : 'import');
        collectSpaces(toks, imp, spaces);
      }
      memberRefs(toks, spaces, one, (i) => push(i, 'member'));
    }
  }
  return hits;
}
