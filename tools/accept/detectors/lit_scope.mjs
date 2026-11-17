// 检测器 lit_scope（卷十二 §2.3）：某类字面量经常量折叠与别名溯源后在某范围内出现的次数。
// 字面量类别（params.literal）：entityPrefix（带登记实体前缀的字串或单例 id，R12-1.2、R12-1.3）；
// number（白名单外数值，R12-4.2；白名单取扫描类别登记行 litAllow，出处卷一 R-6 第 1 条）。
// selfName（S12-5，E-ACC-SCAN-SELFNAME）：卷代号、条目键与条目原编号（条目登记）、表代号（维度表文件名）、模块文件名（文件清单里
// 代码文件的文件名）、检测器代号（模块名）的字串，或带登记实体前缀的字串。
// 范围：params.groups（模块组键，R12-11.5）、params.facs、params.modules（read.mjs scopeFiles）。计数落在产生值的地方：定义处一次，
// 引用处不重计；从范围外文件 import 来的常量计在 import 处。
// params.access = branch：只计落在分支位置的（if/while/for/switch 条件里，或紧邻比较、逻辑运算、`?`、`case`）。

import { tokenize, foldAt, minPrecAt, canStartAt, buildEnv, importsOf, specifierIndexes, symbolPaths, constDecls, conditionSpans, BRANCH_OPS } from '../lib/js-scan.mjs';
import { scopeFiles, resolveRel, isCode, LAYOUT, REGISTRY } from '../read.mjs';

const JUDGES = {
  selfName: (ctx) => {
    const names = new Set();
    for (const it of ctx.regs.items || []) for (const v of [it.volume, it.itemKey, it.localNo]) if (v) names.add(v);
    for (const d of ctx.regs.detectors || []) names.add(d[REGISTRY.detectors.key]);
    for (const f of ctx.files) {
      const base = f.slice(f.lastIndexOf('/') + 1);
      if (isCode(f, ctx.model)) names.add(base);
      if (f.startsWith(LAYOUT.dimensionsDir + '/') && base.endsWith('.json') && !base.startsWith('_')) names.add(base.slice(0, -5));
    }
    const prefixed = (s) => ctx.prefixes.prefixes.some((p) => s.startsWith(p));
    return (v) => (v.k === 'str' && (names.has(v.v) || prefixed(v.v) || ctx.prefixes.singletons.includes(v.v))) || (v.k === 'strp' && prefixed(v.v));
  },
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
  const scoped = scopeFiles(ctx, params);
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
    const where = params.access === 'branch' ? branchAt(toks) : null;
    walk(toks, env, judgeHere, spec, emit, (i) => sym[i], where);
    for (const imp of importsOf(toks)) {
      if (where || !imp.spec || !imp.spec.startsWith('.')) continue;
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

// 分支位置：where(起, 止) 为真即计。条件括号里，或前后紧邻分支运算符、`case`。
function branchAt(toks) {
  const cond = conditionSpans(toks);
  const op = (t) => t && (t.t === 'p' || t.t === 'id') && (BRANCH_OPS.has(t.v) || t.v === 'case');
  return (s, e) => Boolean(cond[s]) || op(toks[s - 1]) || op(toks[e]);
}

function walk(toks, env, judge, spec, emit, symAt, where) {
  let i = 0;
  while (i < toks.length) {
    const t = toks[i];
    if (!spec.has(i) && canStartAt(toks, i)) {
      const r = foldAt(toks, i, env, minPrecAt(toks, i));
      // 分支计法按用处计：经常量别名到达分支位置的名字也算（定义处不在分支位置，不重计）。
      if (r && (r.lit || where) && judge(r.val)) {
        if (!where || where(i, r.end)) emit(r.end === i + 1 ? t.t : 'expr', t.line, symAt(i));
        i = r.end;
        continue;
      }
    }
    // 模板里的表达式各自独立判分支位置（where 只对外层 token 下标成立）。
    if (t.t === 'tpl') { const s = symAt(i); for (const e of t.exprs) walk(e, env, judge, new Set(), emit, () => s, where ? branchAt(e) : null); }
    i++;
  }
}
