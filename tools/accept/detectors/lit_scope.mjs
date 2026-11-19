// 检测器 lit_scope（卷十二 §2.3）：某类字面量经常量折叠与别名溯源后在某范围内出现的次数。
// 字面量类别（params.literal）：entityPrefix（带登记实体前缀的字串或单例 id，R12-1.2、R12-1.3）；
// number（白名单外数值，R12-4.2；白名单取扫描类别登记行 litAllow，出处卷一 R-6 第 1 条）。
// selfName（S12-5，E-ACC-SCAN-SELFNAME）：卷代号、条目键与条目原编号（条目登记）、表代号（维度表文件名）、模块文件名（文件清单里
// 代码文件的文件名）、检测器代号（模块名）的字串，或带登记实体前缀的字串。
// modifierKey（卷二 §7 S8：修正键字面量；修正键的定义与键形见卷二 §3.1 :1290）：键形是 `<kind>.<dimension>[<key>]`，
// 只算 `modifiable:true` 的 number/integer/map<…,number> 维度；另有 `body.<capability>`（卷二 §3.6）、`process.<slot>`
// （卷二 §3.7）与 `stock.*`（卷二 :1290 收卷五 §2.3 的 stock.growthFactor、stock.lossPerDay）三个命名空间。
// 键集从被查内容里的登记数据读（R12-1.7、R12-1.2 同法）：维度表 kind 的 dimensions、表头 capabilities、
// derived-process.json 的 slots；代码里不列键。
// 键形与类型核直接调 kernel/handles/keys.mjs：文法是其 :18 的 DIM_KEY_RE（经 :80 的 parseDimKey 拆键），
// 判定是其 :66 的 modKeyOf（modifiable + 数值类型 + map 须带下标）；本文件不自备键形正则与判定。
// map 下标为代号时按卷二 :1290（map<…,number> 的 `<key>` 须是登记词表代号）核：vocabIndex 从被查内容里的
// _vocab.json 用 kernel/load/vocab-load.mjs 的 loadVocab 读（与读维度表同一种离线方式），本文件不列词表或代号。
// 未覆盖：stock.* 的键集登记在卷五 §2.3，被查内容里没有对应的数据登记（未找到）；S8 保持 registered（不虚报）。
// 范围：params.groups（模块组键，R12-11.5）、params.facs、params.modules（read.mjs scopeFiles）。计数落在产生值的地方：定义处一次，
// 引用处不重计；从范围外文件 import 来的常量计在 import 处。
// params.access = branch：只计落在分支位置的（if/while/for/switch 条件里，或紧邻比较、逻辑运算、`?`、`case`）。

import { tokenize, foldAt, minPrecAt, canStartAt, buildEnv, importsOf, specifierIndexes, symbolPaths, constDecls, conditionSpans, BRANCH_OPS } from '../lib/js-scan.mjs';
import { scopeFiles, resolveRel, isCode, LAYOUT, REGISTRY } from '../read.mjs';
import { parseDimKey, modKeyOf } from '../../../server-plugin/kernel/handles/keys.mjs';
import { loadVocab } from '../../../server-plugin/kernel/load/vocab-load.mjs';

// 已登记维度表的 kind：维度表文件名即 kind（加载器按 E-DIM-SCHEMA-KIND 核 kind 与文件名一致），取自文件清单，不在本文件列名字。
// 前缀与 kind 同源：真实执行取 world/ontology/dimensions；用例回归时（带 repoFiles）执行器另把绕法用例维度目录的前缀并入，kind 也同样并入。
function tableKinds(ctx) {
  const dirs = [LAYOUT.dimensionsDir + '/', ...(ctx.repoFiles ? [LAYOUT.bypassDimsDir + '/'] : [])];
  const out = new Set();
  for (const f of ctx.repoFiles || ctx.files) {
    for (const d of dirs) {
      if (!f.startsWith(d) || !f.endsWith('.json')) continue;
      const base = f.slice(d.length, -'.json'.length);
      if (!base.includes('/') && !base.startsWith('_')) out.add(base);
    }
  }
  return out;
}

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
  entityPrefix: (ctx) => {
    // 字串恰等于一个已登记维度表的 kind（表类名，如 body_plan，卷二 :41）是类名、不是实例 id，不计；前缀匹配照旧（同前缀的真实例 id 如 body_quadruped 照计）。
    const kinds = tableKinds(ctx);
    return (v) => {
      if (v.k !== 'str' && v.k !== 'strp') return false;
      if (v.k === 'str' && kinds.has(v.v)) return false;
      if (ctx.prefixes.prefixes.some((p) => v.v.startsWith(p))) return true;
      return v.k === 'str' && ctx.prefixes.singletons.includes(v.v);
    };
  },
  number: (ctx, cls) => {
    const allow = (cls.litAllow || []).map(Number);
    return (v) => v.k === 'num' && !allow.includes(Number(v.v));
  },
  modifierKey: (ctx) => {
    const reg = modifierRegistry(ctx);
    const memo = new Map();
    return (v) => {
      if (v.k !== 'str') return false;
      if (!memo.has(v.v)) memo.set(v.v, isModifierKey(reg, v.v));
      return memo.get(v.v);
    };
  },
};

// 一条字串是不是修正键：交给 keys.mjs 的同两个函数判——parseDimKey 按文法拆键并查维度登记与 map 下标，
// modKeyOf 再判 modifiable、数值类型与 map 须带下标；任一抛 HandleError 即不是修正键。
function isModifierKey(reg, text) {
  let key;
  try { key = parseDimKey(reg, text); } catch { return false; }
  try { modKeyOf(reg, key.kind, key.dimension, key.sub); return true; } catch { return false; }
}

// 修正键的登记表（keys.mjs 的 KeyRegistry 形态）：kind → 该维度表表头的 dimensions；表头 capabilities 段按卷二 §3.6
// 注册为 body.<capability>；derived-process.json 的 slots 按卷二 §3.7 注册为 process.<slot>（槽是数值修正键）。
// idIndex（行键即实例 id）与 vocabIndex（词表代号 → {family}）由 keys.mjs 的 subKeyOk 用来核对代号下标。
// vocabIndex 从同一个维度表目录的 _vocab.json 读（skip 掉的前缀 `_` 文件就是它）；读法与读维度表同一种离线方式，
// 走 kernel/load/vocab-load.mjs 的 loadVocab，不另写词表解析，也不列具体族或代号。
function modifierRegistry(ctx) {
  const tableDims = new Map();
  const idIndex = new Map();
  const vocabIndex = new Map();
  const entityPrefixes = [];
  for (const f of ctx.files) {
    if (!f.startsWith(LAYOUT.dimensionsDir + '/') || !f.endsWith('.json')) continue;
    const base = f.slice(f.lastIndexOf('/') + 1);
    if (base.startsWith('_')) continue;
    let table; try { table = JSON.parse(ctx.read(f)); } catch { continue; }
    const kind = table && typeof table.kind === 'string' && table.kind ? table.kind : base.slice(0, -5);
    tableDims.set(kind, (table && table.dimensions) || {});
    const rows = table && table.rows;
    if (rows && typeof rows === 'object' && !Array.isArray(rows)) for (const id of Object.keys(rows)) idIndex.set(id, kind);
    const caps = (table && table.capabilities) || {};
    if (caps && typeof caps === 'object' && Object.keys(caps).length) tableDims.set('body', caps);
    const entity = (table && table.entity) || {};
    for (const p of Array.isArray(entity.idPrefix) ? entity.idPrefix : []) entityPrefixes.push(p);
  }
  const vocabPath = `${LAYOUT.dimensionsDir}/_vocab.json`;
  if (ctx.files.includes(vocabPath)) {
    let doc; try { doc = JSON.parse(ctx.read(vocabPath)); } catch { doc = null; }
    const loaded = loadVocab(doc, entityPrefixes, () => {});
    for (const [code, rec] of loaded.index) vocabIndex.set(code, { family: rec.family });
  }
  const proc = 'world/rules/tables/derived-process.json';
  if (ctx.files.includes(proc)) {
    let data; try { data = JSON.parse(ctx.read(proc)); } catch { data = null; }
    const slots = {};
    for (const name of Object.keys((data && data.slots) || {})) slots[name] = { modifiable: true, type: 'number' };
    if (Object.keys(slots).length) tableDims.set('process', slots);
  }
  return { tableDims, idIndex, vocabIndex };
}

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
