// 检测器 lit_scope（卷十二 §2.3）：某类字面量经常量折叠与别名溯源后在某范围内出现的次数。
// 字面量类别（params.literal）：entityPrefix（带登记实体前缀的字串或单例 id，R12-1.2、R12-1.3）；
// number（白名单外数值，R12-4.2；白名单取扫描类别登记行 litAllow，出处卷一 R-6 第 1 条）。
// 范围：params.groups（模块组键，R12-11.5）。计数落在产生值的地方：定义处一次，引用处不重计；
// 从范围外文件 import 来的常量计在 import 处。

import { tokenize, foldAt, minPrecAt, canStartAt, buildEnv, importsOf, specifierIndexes, symbolPaths, constDecls } from '../lib/js-scan.mjs';
import { filesOfGroups, resolveRel } from '../read.mjs';

const JUDGES = {
  entityPrefix: (ctx) => (v) => {
    if (v.k !== 'str' && v.k !== 'strp') return false;
    if (ctx.prefixes.prefixes.some((p) => v.v.startsWith(p))) return true;
    return v.k === 'str' && ctx.prefixes.singletons.includes(v.v);
  },
  number: (ctx, cls) => {
    const allow = (cls.litAllow || []).map(Number);
    return (v) => v.k === 'num' && !allow.includes(Number(v.v));
  },
};

export function detect(ctx, params, cls) {
  const make = JUDGES[params.literal];
  if (!make) throw new Error(`E-ACC-ITEM-PARAM literal=${params.literal}`);
  const judge = make(ctx, cls || {});
  const scoped = filesOfGroups(ctx.files, ctx.model, params.groups || []);
  const inScope = new Set(scoped);
  const all = new Set(ctx.files);
  const parsed = new Map();
  const tokensOf = (f) => { if (!parsed.has(f)) parsed.set(f, tokenize(ctx.read(f))); return parsed.get(f); };

  // 别名溯源：一个文件导出的常量值（跨文件 import 一并折叠；成环即不折叠）。
  const exportCache = new Map();
  const visiting = new Set();
  function importedEnv(file) {
    const env = new Map();
    for (const imp of importsOf(tokensOf(file))) {
      if (!imp.spec || !imp.spec.startsWith('.')) continue;
      const target = resolveRel(file, imp.spec);
      if (!all.has(target)) continue;
      const ex = exportsOf(target);
      for (const n of imp.names) if (ex.has(n.imported)) env.set(n.local, ex.get(n.imported));
    }
    return env;
  }
  function exportsOf(file) {
    if (exportCache.has(file)) return exportCache.get(file);
    if (visiting.has(file)) return new Map();
    visiting.add(file);
    const toks = tokensOf(file);
    const env = buildEnv(toks, importedEnv(file));
    const out = new Map();
    for (const [name, local] of constDecls(toks).exported) if (env.has(local)) out.set(name, env.get(local));
    visiting.delete(file);
    exportCache.set(file, out);
    return out;
  }

  const exempt = exemptions(ctx, cls || {});
  const hits = [];
  for (const file of scoped) {
    const toks = tokensOf(file);
    const env = buildEnv(toks, importedEnv(file));
    const sym = symbolPaths(toks);
    const spec = specifierIndexes(toks);
    const emit = (nodeKind, line, symbolPath) => hits.push({ file, line, nodeKind, symbolPath, code: params.code || '' });
    const own = exempt.get(file);
    const judgeHere = own ? (v) => judge(v) && !own.has(Number(v.v)) : judge;
    walk(toks, env, judgeHere, spec, emit, (i) => sym[i]);
    for (const imp of importsOf(toks)) {
      if (!imp.spec || !imp.spec.startsWith('.')) continue;
      const target = resolveRel(file, imp.spec);
      if (inScope.has(target) || !all.has(target)) continue;
      const ex = exportsOf(target);
      for (const n of imp.names) {
        const v = ex.get(n.imported);
        if (v && judge(v)) emit('import', toks[n.at].line, sym[n.at]);
      }
    }
  }
  return hits;
}

// 登记豁免（卷二 S10、卷一 R-6 第 1 条白名单 ③）：扫描类别登记行 litExempt = {files, table}；
// files 是可豁免的文件，table 是常数登记表（{"rows": [{key, value, file}]}）。某文件里的数值只有在登记表里有同文件、同值的行才不计，
// 表外常数照报；登记表不在文件清单里（如绕法用例的虚拟上下文）即无豁免。
function exemptions(ctx, cls) {
  const out = new Map();
  const ex = cls.litExempt;
  if (!ex || !ctx.files.includes(ex.table)) return out;
  const rows = (JSON.parse(ctx.read(ex.table)).rows) || [];
  for (const r of rows) {
    if (!r.file || !(ex.files || []).includes(r.file)) continue;
    if (!out.has(r.file)) out.set(r.file, new Set());
    out.get(r.file).add(Number(r.value));
  }
  return out;
}

function walk(toks, env, judge, spec, emit, symAt) {
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!spec.has(i) && canStartAt(toks, i)) {
      const r = foldAt(toks, i, env, minPrecAt(toks, i));
      if (r && r.lit && judge(r.val)) {
        emit(r.end === i + 1 ? t.t : 'expr', t.line, symAt(i));
        i = r.end;
        continue;
      }
    }
    if (t.t === 'tpl') { const s = symAt(i); for (const e of t.exprs) walk(e, env, judge, new Set(), emit, () => s); }
    i++;
  }
}
