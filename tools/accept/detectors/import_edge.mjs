// 检测器 import_edge（卷十二 §2.3）：一个文件 import 了它不许 import 的文件。
// 判据数据全部取自声明表的模块组与 import 矩阵（卷二 §2.7 两张矩阵、说明符闭集）；本文件没有组名、文件名。
// params.groups：要查的调用方组键；params.codes：本条目计哪些违例码（同一张矩阵分给不同条目）。
// 未覆盖（写进 P-1 汇报）：矩阵格里"只经 kernelApi / groupApi 的某些导出"的细目，要等声明表登记 kernelApi、groupApi。

import { tokenize, importsOf } from '../lib/js-scan.mjs';
import { filesOfGroups, classify, matchGlobs, resolveRel } from '../read.mjs';

export function detect(ctx, params) {
  const { model } = ctx;
  const m = model.matrix;
  const want = new Set(params.codes || []);
  const hits = [];
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
