// 检测器 import_edge（卷十二 §2.3）：一个文件 import 了它不许 import 的文件。
// 判据数据全部取自声明表的模块组与 import 矩阵（卷二 §2.7 两张矩阵、说明符闭集）；本文件没有组名、文件名。
// params.groups：要查的调用方组键；params.codes：本条目计哪些违例码（同一张矩阵分给不同条目）。
// params.code：导出级默认拒绝（L-09 ①；docs/gemini/diagnosis-1124.md:36）——非内核文件从内核目录 import 具名导出，
//   该名不在声明表 kernelApi/groupApi 的登记里即报此码；默认导入与 `import *` 同报。内核目录、服务端根、要核的两张
//   登记表都在扫描类别行（cls.kernelDir、cls.serverRoot、cls.apiTables），本文件不列路径。

import { tokenize, importsOf, isP } from '../lib/js-scan.mjs';
import { filesOfGroups, classify, matchGlobs, resolveRel } from '../read.mjs';

// 导出级默认拒绝（见头注）：登记表按 "<服务端根相对文件>#<导出名>" 收（state-owners.json#kernelApi/groupApi）。
// 具名导入逐个核；默认导入、`import * as`（names 为空且不是纯副作用导入）按未登记报。
function exportGuardHits(ctx, params, cls) {
  const code = params.code;
  const kernelDir = cls.kernelDir;
  const serverRoot = cls.serverRoot;
  const apiTables = cls.apiTables || [];
  if (typeof kernelDir !== 'string' || !kernelDir) throw new Error('E-ACC-ITEM-PARAM export guard needs kernelDir');
  if (typeof serverRoot !== 'string' || !serverRoot) throw new Error('E-ACC-ITEM-PARAM export guard needs serverRoot');
  const registered = new Set();
  for (const t of apiTables) for (const e of ((ctx.decl || {})[t] || {}).exports || []) if (e && typeof e.export === 'string') registered.add(e.export);
  const hits = [];
  for (const file of filesOfGroups(ctx.files, ctx.model, params.groups || [])) {
    if (file.startsWith(kernelDir)) continue; // 内核内部互 import 不是对外出口
    const toks = tokenize(ctx.read(file));
    for (const imp of importsOf(toks)) {
      if (imp.kind !== 'static' || typeof imp.spec !== 'string' || !(imp.spec.startsWith('./') || imp.spec.startsWith('../'))) continue;
      const target = resolveRel(file, imp.spec);
      if (!target.startsWith(kernelDir)) continue;
      const rel = target.slice(serverRoot.length);
      // 纯副作用导入（`import './x.mjs'`）没有取符号，不算。
      const next = toks[imp.at + 1];
      if (next && next.t === 'str') continue;
      if (!isP(next, '{')) { hits.push({ file, line: imp.line, nodeKind: 'import', symbolPath: '', code }); continue; }
      for (const nm of imp.names) if (!registered.has(`${rel}#${nm.imported}`)) hits.push({ file, line: toks[nm.at].line, nodeKind: 'import', symbolPath: nm.imported, code });
    }
  }
  return hits;
}

export function detect(ctx, params, cls = {}) {
  const { model } = ctx;
  const m = model.matrix;
  const want = new Set(params.codes || []);
  const hits = [];
  if (params.code) hits.push(...exportGuardHits(ctx, params, cls));
  // 成员闭集（卷二 §2.8 第 2 条 ①、§2.7 `filesList`）：组声明了成员清单的，按 modules 展开出的代码文件不在清单里即违例。
  // 清单是一个 JSON 数组（仓库根相对路径，排序，只列 .mjs；李白 11-17 第 5 条）；清单文件不在文件全集里时组内文件全数计入。
  if (m.unassignedCode && want.has(m.unassignedCode)) {
    for (const g of params.groups || []) {
      const listPath = (ctx.decl[g] || {}).filesList;
      if (!listPath) continue;
      const listed = new Set(ctx.files.includes(listPath) ? JSON.parse(ctx.read(listPath)) : []);
      for (const file of filesOfGroups(ctx.files, model, [g])) {
        if (!listed.has(file)) hits.push({ file, line: 0, nodeKind: 'file', symbolPath: '', code: m.unassignedCode });
      }
    }
  }
  for (const file of filesOfGroups(ctx.files, model, params.groups || [])) {
    const own = classify(file, model);
    const row = (m.rows || {})[own.group] || {};
    const allowedFor = (table, name) => Boolean(table && table[name] && matchGlobs(file, table[name], model.codeExts));
    for (const imp of importsOf(tokenize(ctx.read(file)))) {
      const code = judge(imp);
      if (code && want.has(code)) hits.push({ file, line: imp.line, nodeKind: imp.kind === 'dynamic' ? 'import_dynamic' : 'import', symbolPath: '', code });
    }
    function judge(imp) {
      const spec = imp.spec;
      // 动态 import() 不在全局闭集内，不论说明符是不是字面量、目标在不在矩阵内（卷二 §2.9 第 1 条）。
      if (imp.kind === 'dynamic') return m.globalCode;
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = resolveRel(file, spec);
        if (target.startsWith('../')) return allowedFor(row.external, spec) ? null : m.globalCode;
        const tc = classify(target, model);
        if (tc.retired || tc.offline) return m.procCode;
        if (tc.group) {
          if (tc.process !== own.process) return m.procCode;
          if ((row.groups || []).includes(tc.group)) return null;
          return row.code || ((m.cols || {})[tc.group] || {}).code || m.defaultCode;
        }
        if (imp.json) return matchGlobs(file, m.dataLoaders || [], model.codeExts) ? null : m.dataCode;
        if (tc.code) return m.globalCode;
        if (tc.process && tc.process !== own.process) return m.procCode;
        return m.dataCode;
      }
      if (spec.startsWith('/') || /^[A-Za-z]:/.test(spec)) return m.globalCode;
      if (spec.startsWith('node:')) return allowedFor(row.builtins, spec) ? null : m.globalCode;
      const pkg = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      return allowedFor(row.packages, pkg) ? null : m.globalCode;
    }
  }
  return hits;
}
