// 维度校验器（卷二 §4.1；门禁设施 dim-validate，卷十二 §2.11）：L0–L3，任一 error 即加载失败。
// 输入是各文件的原文；输出按 (table,row,dim) 排序、同 (code,table,row,dim) 只报一次，末行汇总（§4.2）。
// 只读表头、词表、单位表与调用方给的登记；规则里不含实体 id 字面量，前缀表来自表头。
// L5 齐全率报告见 coverageText（P-2b）。未做（P-2 汇报列出）：L4 不变量；distribution 参数；derived 公式编译与派生依赖图；修正项、效果族、需求块；
// sources 推算与成员偏差；表头没声明判据的命名条件（现为 byReader，只记入 notCovered）。
// 表头声明的命名条件（namedConditions，如 byDigestible）与逐格来源级别（cellGrades，卷三甲 M-22）按声明通用处理。

import { parseJsonStrict } from '../load/json-text.mjs';
import { loadVocab, loadUnits } from '../load/vocab-load.mjs';
import { flattenTable } from '../load/flatten.mjs';
import { checkDef, CODE_RE, KEY_RE, CODE_ENUMS, TYPES, DOMAIN_OPTIONAL } from './types.mjs';
import { checkRows, checkPrecedence, checkComponents, checkRequired, requiredSyntaxOk } from './rows.mjs';
import { prepareNamedConditions } from './named-conditions.mjs';
import { checkCellGrades } from './cell-grades.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 词表族键 kind（§1.9 "kind→kind_，22 类代号本身作枚举时用"）：表头 kind 须是该族条目去前缀后的名字。
const KIND_FAMILY = 'kind';
// 叠加方式（§1.2 `.stacking`）；过程主体槽的专用校验（kernel/load/rules.mjs，§3.7）同读此处。
export const STACKING = Object.freeze(['none', 'penalized']);

// sources：{units: 文本, vocab: 文本, effects?: 文本, tables: [{file, text}]}（file 为文件名，如 "<kind>.json"）。
// options：{namespaces: [..], displaySet: [..], ns: [{ns, shape, type}], limits: {extendsMaxDepth, rxMaxDepth}}。
/**
 * @param {{units: string, vocab: string, effects?: string, tables: {file: string, text: string}[]}} sources
 * @param {{namespaces: string[], displaySet: string[], ns: {ns: string, shape: string, type: string}[], limits: {extendsMaxDepth: number, rxMaxDepth: number}}} options
 */
export function validateDimensions(sources, options) {
  const errors = [];
  const err = (e) => errors.push(e);
  const parse = (file, text) => {
    const r = parseJsonStrict(text);
    for (const e of r.errors) err({ code: e.code, level: 'L0', table: file.replace(/\.json$/, ''), row: '', dim: '', path: `${file}#${e.pointer}`, got: e.got, want: e.want });
    return r.value;
  };

  // ---------- L0 ----------
  const unitsDoc = parse('_units.json', sources.units);
  const vocabDoc = parse('_vocab.json', sources.vocab);
  const effectsDoc = sources.effects === undefined ? {} : parse('_effects.json', sources.effects);
  const tables = [];
  for (const { file, text } of [...sources.tables].sort((a, b) => cmp(a.file, b.file))) {
    const doc = parse(file, text);
    if (!isObj(doc)) continue;
    const kind = file.replace(/\.json$/, '');
    const at = (dim, got, want, code, level) => err({ code, level: level || 'L0', table: kind, row: '', dim, path: `${file}#/${dim}`, got, want });
    if (doc.kind !== kind) at('kind', doc.kind, `"${kind}" (file name)`, 'E-DIM-SCHEMA-KIND');
    if (!options.namespaces.includes(doc.namespace)) at('namespace', doc.namespace, options.namespaces.join('|'), 'E-DIM-SCHEMA-NAMESPACE', 'L1');
    // 表头版本"只认当前版"（§1.2，E-DIM-SCHEMA-VERSION）与卷一 V-17"内核按版本类字段分支 = 0"相抵，P-2 不做此项，记 docs/问题.md 待李白定。
    const e = doc.entity;
    if (!isObj(e) || !Array.isArray(e.idPrefix) || !e.idPrefix.length || !e.idPrefix.every((p) => typeof p === 'string' && CODE_RE.test(p + 'x'))) at('entity', isObj(e) ? e.idPrefix : e, 'entity.idPrefix: non-empty prefix list', 'E-DIM-ID-FORMAT');
    if (!Array.isArray(doc.behaviors) || !doc.behaviors.length) at('behaviors', doc.behaviors, 'non-empty behaviors list', 'E-DIM-BEHAVIOR-UNKNOWN');
    for (const s of ['dimensions', 'classes', 'rows', 'generated']) if (!isObj(doc[s])) at(s, typeof doc[s], `${s} object (may be empty)`, 'E-DIM-STRUCT-FIELD');
    tables.push({ file, kind, doc: { ...doc, dimensions: isObj(doc.dimensions) ? doc.dimensions : {} }, entity: isObj(e) ? e : {} });
  }
  const entityPrefixes = [...new Set(tables.flatMap((t) => (Array.isArray(t.entity.idPrefix) ? t.entity.idPrefix : [])))].sort();
  const vocab = loadVocab(vocabDoc, entityPrefixes, err);
  const units = loadUnits(unitsDoc, err);
  if (vocab.families.has(KIND_FAMILY)) {
    const fam = vocab.families.get(KIND_FAMILY);
    for (const t of tables) if (!Object.hasOwn(fam.entries, fam.prefix + t.kind)) err({ code: 'E-DIM-SCHEMA-KIND', level: 'L0', table: t.kind, row: '', dim: 'kind', path: `${t.file}#/kind`, got: t.kind, want: `registered in vocab family ${KIND_FAMILY}` });
  }

  // id 格式与前缀（L0）、全局唯一（L3）。
  const idIndex = new Map();
  const claim = (id, kind, at) => {
    if (idIndex.has(id) || vocab.index.has(id)) err({ code: 'E-DIM-ID-DUPLICATE', level: 'L3', ...at, got: id, want: `unique across tables (also ${idIndex.get(id) || 'vocab'})` });
    else idIndex.set(id, kind);
  };
  for (const id of Object.keys(isObj(effectsDoc) ? effectsDoc : {}).sort()) claim(id, 'effect', { table: '_effects', row: id, dim: '', path: `_effects.json#/${id}` });
  for (const t of tables) {
    const prefixes = Array.isArray(t.entity.idPrefix) ? t.entity.idPrefix : [];
    const singles = Array.isArray(t.entity.singletonIds) ? t.entity.singletonIds : [];
    for (const section of ['rows', 'generated']) {
      for (const id of Object.keys(isObj(t.doc[section]) ? t.doc[section] : {}).sort()) {
        const at = { table: t.kind, row: id, dim: '', path: `${t.file}#/${section}/${id}` };
        if (!CODE_RE.test(id) || !(prefixes.some((p) => id.startsWith(p)) || singles.includes(id))) err({ code: 'E-DIM-ID-FORMAT', level: 'L0', ...at, got: id, want: `^[a-z][a-z0-9_]{1,47}$ with prefix ${prefixes.join('|')}` });
        claim(id, t.kind, at);
      }
    }
    for (const id of Object.keys(isObj(t.doc.classes) ? t.doc.classes : {}).sort()) {
      const at = { table: t.kind, row: id, dim: '', path: `${t.file}#/classes/${id}` };
      if (!CODE_RE.test(id) || typeof t.entity.classPrefix !== 'string' || !id.startsWith(t.entity.classPrefix)) err({ code: 'E-DIM-ID-FORMAT', level: 'L0', ...at, got: id, want: `class id with prefix ${t.entity.classPrefix}` });
      else if (!vocab.index.has(id) || vocab.index.get(id).family !== 'class') err({ code: 'E-DIM-CLASS-UNKNOWN', level: 'L2', ...at, got: id, want: 'entry of vocab family class' });
    }
  }

  // ---------- L1 表头 ----------
  const kinds = new Set([...tables.map((t) => t.kind), 'effect']);
  const tableDims = new Map(tables.map((t) => [t.kind, t.doc.dimensions]));
  const env = { units, vocab, kinds, idIndex, tableDims, displaySet: new Set(options.displaySet), compiled: new Map() };
  for (const t of tables) checkHeader(t, env, err);

  // RX 编译用的维度表：全部表的维度键；同名维度在不同表类型不同即标为歧义（rx.mjs 编到它时报 E-MOD-RX）。
  const rxDims = new Map();
  for (const t of tables) for (const [k, d] of Object.entries(t.doc.dimensions)) {
    if (!rxDims.has(k)) rxDims.set(k, d);
    else if (JSON.stringify(rxDims.get(k)) !== JSON.stringify(d)) rxDims.set(k, { ambiguous: true });
  }
  env.rxScope = { dims: rxDims, vocabIndex: vocab.index, ns: options.ns, maxDepth: options.limits.rxMaxDepth };

  // ---------- 展平、行检查（L1/L2）、L3 ----------
  for (const t of tables) {
    const groups = isObj(t.doc.precedenceGroups) ? t.doc.precedenceGroups : {};
    const groupsOf = (c) => new Set(Object.keys(groups).filter((g) => Array.isArray(groups[g]) && groups[g].includes(c)));
    t.flat = flattenTable(t.doc, groupsOf, options.limits.extendsMaxDepth, (e) => err({ ...e, path: `${t.file}${e.path}` }));
    t.env = env;
  }
  const stats = { known: 0, applicable: 0, notCovered: new Set(), coverage: new Map() };
  for (const t of tables) { checkRows(t, env, err); checkPrecedence(t, env, err); }
  checkComponents(new Map(tables.map((t) => [t.kind, t])), env, err);
  for (const t of tables) { t.named = prepareNamedConditions(t, env, err); checkRequired(t, env, err, stats); checkCellGrades(t, err); }

  return report(errors, tables, stats, env);
}

function checkHeader(t, env, err) {
  const { doc, kind, file } = t;
  const dims = doc.dimensions;
  const at = (dim, sub) => ({ table: kind, row: '', dim, path: `${file}#/dimensions/${dim}${sub ? '/' + sub : ''}` });
  for (const key of Object.keys(dims).sort()) {
    const def = dims[key];
    const bad = (code, sub, got, want, level) => err({ code, level: level || 'L1', ...at(key, sub), got, want });
    if (!KEY_RE.test(key)) bad('E-DIM-ID-FORMAT', '', key, 'lowerCamel dimension key');
    checkDef(def, env, at(key), err, true);
    if (!isObj(def)) continue;
    if (!requiredSyntaxOk(def.required)) bad('E-DIM-STRUCT-FIELD', 'required', def.required, 'always|never|byClass:<c>|ifPresent:<d>|byEnum:<d>=<v>|anyOf:<a>,<b>|byDigestible|byReader, joined by ；');
    if (def.required !== 'always' && def.onUnknown === undefined) bad('E-DIM-ONUNKNOWN-MISSING', 'onUnknown', 'missing', CODE_ENUMS.onUnknown.join('|'));
    else if (def.onUnknown !== undefined && !CODE_ENUMS.onUnknown.includes(def.onUnknown)) bad('E-DIM-DOMAIN-ENUM', 'onUnknown', def.onUnknown, CODE_ENUMS.onUnknown.join('|'));
    if (typeof def.modifiable !== 'boolean') bad('E-DIM-MODIFIABLE-TYPE', 'modifiable', def.modifiable, 'true|false');
    else if (def.modifiable) {
      const numeric = (d) => isObj(d) && (d.type === 'number' || d.type === 'integer');
      if (!(numeric(def) || (def.type === 'map' && numeric(def.value))) || def.type === 'string') bad('E-DIM-MODIFIABLE-TYPE', 'modifiable', def.type, 'number, integer or map<…, number>');
      if (!STACKING.includes(def.stacking)) bad('E-MOD-STACKING', 'stacking', def.stacking, STACKING.join('|'), 'L2');
      const [lo, hi, ...rest] = Array.isArray(def.bounds) ? def.bounds : [];
      if (typeof lo !== 'number' || typeof hi !== 'number' || rest.length || lo > hi) bad('E-MOD-BOUNDS', 'bounds', def.bounds, '[lo,hi]', 'L2');
    }
    if (def.sample !== undefined && def.derived !== undefined) bad('E-DIM-SAMPLE-DERIVED', 'sample', 'sample with derived', 'one of sample or derived');
    if (def.domain === undefined && TYPES.includes(def.type) && !DOMAIN_OPTIONAL.includes(def.type)) bad('E-DIM-DOMAIN-RANGE', 'domain', 'missing', 'domain');
    const sm = def.stockMode;
    if (sm !== undefined && !CODE_ENUMS.stock_mode.includes(sm)) bad('E-DIM-DOMAIN-ENUM', 'stockMode', sm, CODE_ENUMS.stock_mode.join('|'));
    if ((sm === 'remainder') !== (def.remDenominator !== undefined)) bad('E-DIM-STRUCT-FIELD', 'remDenominator', def.remDenominator, 'remDenominator exactly when stockMode is remainder');
    if (def.source === undefined || def.owner === undefined) bad('W-DIM-SOURCE', 'source', [def.source, def.owner].map(String).join(','), 'source and owner');
  }
  const groups = doc.precedenceGroups;
  const hasClasses = isObj(doc.classes) && Object.keys(doc.classes).length > 0;
  if (hasClasses && !(isObj(groups) && Array.isArray(groups.default))) err({ code: 'E-DIM-PRECEDENCE-GROUP', level: 'L2', table: kind, row: '', dim: 'precedenceGroups', path: `${file}#/precedenceGroups`, got: isObj(groups) ? Object.keys(groups).sort().join(',') : groups, want: 'precedenceGroups.default when class rows exist' });
  for (const [d, g] of Object.entries(isObj(doc.precedenceOf) ? doc.precedenceOf : {}).sort()) {
    if (!Object.hasOwn(dims, d) || !(isObj(groups) && Array.isArray(groups[g]))) err({ code: 'E-DIM-PRECEDENCE-GROUP', level: 'L2', table: kind, row: '', dim: `precedenceOf.${d}`, path: `${file}#/precedenceOf/${d}`, got: `${d}->${g}`, want: 'declared dimension mapped to a declared group' });
  }
}

// ---------- 报告（§4.2） ----------
function report(errors, tables, stats, env) {
  const norm = errors.map((e) => ({
    code: e.code, severity: e.code.startsWith('W-') ? 'warning' : 'error', level: e.level || '',
    table: e.table || '', row: e.row || '', dim: e.dim || '', path: e.path || '',
    got: e.got === undefined ? null : e.got, want: e.want === undefined ? '' : String(e.want),
  }));
  norm.sort((a, b) => cmp(a.table, b.table) || cmp(a.row, b.row) || cmp(a.dim, b.dim) || cmp(a.code, b.code) || cmp(a.path, b.path));
  const seen = new Set();
  const out = norm.filter((e) => { const k = [e.code, e.table, e.row, e.dim].join('\u0000'); if (seen.has(k)) return false; seen.add(k); return true; });
  const nErr = out.filter((e) => e.severity === 'error').length;
  const rows = tables.reduce((n, t) => n + Object.keys(isObj(t.doc.rows) ? t.doc.rows : {}).length + Object.keys(isObj(t.doc.generated) ? t.doc.generated : {}).length, 0);
  const lines = out.map((e) => `${e.code}  ${e.table}/${e.row}.${e.dim}  got ${JSON.stringify(e.got)}  want ${e.want}  — ${e.path}`);
  lines.push(`errors=${nErr} warnings=${out.length - nErr} tables=${tables.length} rows=${rows} known=${stats.known} applicable=${stats.applicable}`);
  return {
    ok: nErr === 0,
    errors: out,
    notCovered: [...stats.notCovered].sort(),
    text: lines.join('\n') + '\n',
    coverage: coverageText(stats.coverage),
    rx: env.compiled,
    tables: new Map(tables.map((t) => [t.kind, { doc: t.doc, flat: t.flat }])),
    vocab: env.vocab,
    idIndex: env.idIndex,
    env,
  };
}

// L5 齐全率报告（§4.1 L5 :1493，不阻断）：每表每维一行五列，按 (table,dim) 排序；同一输入两次输出字节相同（A7）。
// 写到 logs/dimensions-coverage.<date>.txt 由调用方做（kernel 不读墙钟）。
function coverageText(coverage) {
  const lines = ['table\tdim\tknown\tapplicable\tnotApplicable\tunknown\texplicitFill'];
  for (const kind of [...coverage.keys()].sort()) {
    const cov = coverage.get(kind);
    for (const dim of Object.keys(cov).sort()) {
      const c = cov[dim];
      lines.push([kind, dim, c.known, c.applicable, c.notApplicable, c.unknown, c.explicitFill].join('\t'));
    }
  }
  return lines.join('\n') + '\n';
}
