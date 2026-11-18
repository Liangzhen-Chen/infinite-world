// 受限内核入口的调用者核对（卷六 S6-13 现文，封卷后勘误 1118k13、李白 11-18 06:18 第 1、3 条；卷二 §2.7 :574 kernelApi、:780 违例码 E-VIEW-INPUT-IMPORT）。
// 调用者许可只有一处出处：state-owners.json 的 kernelApi.exports 里对应入口的 `callers`（组键；`rules` = 规则层、`*` = 服务端各模块组、规则层与 textcore，
// 装配文件不在 `*` 之内）与 `callerFiles`（具体文件，服务端根相对）。本模块不带任何入口名或名单：params.entries 只列要核的 kernelApi 导出 id
// （条目参数，值必须在 kernelApi 登记里），许可全由登记派生；登记里没有的入口、调用者不在登记里，都计入，不放行。
// 判法：范围内每个文件（入口定义文件自己除外）若 import 了入口所在模块里的该名（具名导入计在导入处；命名空间或默认导入计在每处 `空间.名` 引用；
// `export … from` 重导出该模块一律计，因为名单取不全）而它所属的组、文件都不在许可内，计一次。
// 局限：按词法读相对静态 import；动态 import 归 E-GLOBAL-UNLISTED；经第三个模块转手再导出的（名字已不在入口模块内）要靠该转手文件自己受同一核对。

import { tokenize, importsOf, symbolPaths, isP } from './js-scan.mjs';
import { filesOfGroups, classify, resolveRel, LAYOUT } from '../read.mjs';
import { serverRel } from './js-state.mjs';

function permitted(row, own, rel, decl) {
  if (rel !== null && (row.callerFiles || []).includes(rel)) return true;
  const callers = row.callers || [];
  if (own.group && callers.includes(own.group)) return true;
  if (callers.includes('*')) return own.process === 'server' && !(own.group && decl[own.group] && Array.isArray(decl[own.group].files));
  return false;
}

export function apiCallerHits(ctx, params) {
  const code = params.code || '';
  const decl = ctx.decl || {};
  const api = (decl.kernelApi && decl.kernelApi.exports) || [];
  const serverRoot = ((ctx.model.processes || {}).server || {}).root || '';
  const hits = [];
  const entries = [];
  for (const id of params.entries || []) {
    const row = api.find((e) => e.export === id);
    if (!row) { hits.push({ file: LAYOUT.stateOwners, line: 0, nodeKind: 'entry', symbolPath: id, code }); continue; }
    const [mod, name] = id.split('#');
    entries.push({ name, target: serverRoot + mod, row });
  }
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    const own = classify(file, ctx.model);
    const rel = serverRel(file, ctx.model);
    const live = entries.filter((e) => e.target !== file && !permitted(e.row, own, rel, decl));
    if (!live.length) continue;
    const toks = tokenize(ctx.read(file));
    const sym = symbolPaths(toks);
    const imps = importsOf(toks).filter((imp) => imp.kind === 'static' && imp.spec && imp.spec.startsWith('.'));
    const reexported = new Set(); // 重导出取不到名字，一条语句只计一处，不按入口数重复
    for (const e of live) {
      const spaces = new Set();
      for (const imp of imps) {
        if (resolveRel(file, imp.spec) !== e.target) continue;
        if (toks[imp.at].v === 'export') {
          if (!reexported.has(imp.at)) { reexported.add(imp.at); hits.push({ file, line: imp.line, nodeKind: 'reexport', symbolPath: sym[imp.at], code }); }
          continue;
        }
        for (const n of imp.names) if (n.imported === e.name) hits.push({ file, line: toks[n.at].line, nodeKind: 'import', symbolPath: sym[n.at], code });
        const a = toks[imp.at + 1];
        if (a && a.t === 'id' && a.v !== 'from') spaces.add(a.v);
        if (isP(a, '*') && toks[imp.at + 2] && toks[imp.at + 2].v === 'as' && toks[imp.at + 3]) spaces.add(toks[imp.at + 3].v);
      }
      for (let i = 0; i + 2 < toks.length; i++) {
        if (toks[i].t === 'id' && spaces.has(toks[i].v) && !isP(toks[i - 1], '.') && !isP(toks[i - 1], '?.') && (isP(toks[i + 1], '.') || isP(toks[i + 1], '?.')) && toks[i + 2].t === 'id' && toks[i + 2].v === e.name) {
          hits.push({ file, line: toks[i].line, nodeKind: 'member', symbolPath: sym[i], code });
        }
      }
    }
  }
  return hits;
}
