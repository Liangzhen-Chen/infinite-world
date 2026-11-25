// 检测器 archive_ref（docs/gemini/rewrite-guide-1124.md:207；Step 1 防回潮）：扫描范围内出现被禁路径/字样即报。
// 扫描根、排除前缀、被禁字样、豁免（路径＋理由）全部登记在扫描类别行（数据），本文件不列任何文件名或字样；
// 条目 params 只给违例码。豁免带 line 的只跳过含该字串的行，不带 line 的跳过整个文件。命中一行记一条。
// 扫描根或被禁字样为空、任一豁免缺理由（或空串）即报 E-ACC-ITEM-PARAM（登记缺失不静默放过，照 data_shape 的做法）。

import { LAYOUT, REGISTRY } from '../read.mjs';

export function detect(ctx, params = {}, cls = {}) {
  const scope = cls.scope || {};
  const roots = Array.isArray(scope.roots) ? scope.roots : [];
  const except = Array.isArray(scope.except) ? scope.except : [];
  const patterns = Array.isArray(cls.patterns) ? cls.patterns : [];
  const paramHit = () => [{ file: `${LAYOUT.accDir}/${REGISTRY.scanclasses.file}`, line: 0, nodeKind: 'param', symbolPath: cls.scanClass || '', code: 'E-ACC-ITEM-PARAM' }];
  if (!roots.length || !patterns.length) return paramHit();
  const exemptions = Array.isArray(cls.exemptions) ? cls.exemptions : [];
  for (const e of exemptions) {
    if (!e || typeof e.reason !== 'string' || !e.reason) return paramHit();
  }
  const skipFile = new Set();
  const skipLine = new Map();
  for (const e of exemptions) {
    if (typeof e.path !== 'string' || !e.path) continue;
    if (e.line) skipLine.set(e.path, [...(skipLine.get(e.path) || []), e.line]);
    else skipFile.add(e.path);
  }
  const hits = [];
  for (const file of ctx.files) {
    if (!roots.some((r) => (r.endsWith('/') ? file.startsWith(r) : file === r))) continue;
    if (except.some((x) => file === x || file.startsWith(x))) continue;
    if (skipFile.has(file)) continue;
    const text = ctx.read(file);
    if (typeof text !== 'string' || text.includes('\0')) continue;
    const skip = skipLine.get(file) || [];
    text.split(/\r?\n/).forEach((line, i) => {
      if (skip.some((s) => line.includes(s))) return;
      if (patterns.some((p) => line.includes(p))) hits.push({ file, line: i + 1, nodeKind: 'text', symbolPath: '', code: params.code });
    });
  }
  return hits;
}
