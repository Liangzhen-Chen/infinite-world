// 维度校验器（卷二 §4.1；门禁设施 dim-validate，卷十二 §2.11）：L0–L3，任一 error 即加载失败。
// 输入是各文件的原文；输出按 (table,row,dim) 排序、同 (code,table,row,dim) 只报一次，末行汇总（§4.2）。
// 只读表头、词表、单位表与调用方给的登记；规则里不含实体 id 字面量，前缀表来自表头。
// L5 齐全率报告见 coverageText（P-2b）。未做（P-2 汇报列出）：L4 不变量；distribution 参数；派生依赖图的实例级（带 recursive 的 relation 展开）；修正项、效果族、需求块；
// sources 推算与成员偏差；表头没声明判据的命名条件（现为 byReader，只记入 notCovered）。
// 表头声明的命名条件（namedConditions，如 byDigestible）与逐格来源级别（cellGrades，卷三甲 M-22）按声明通用处理。

import { parseJsonStrict } from '../load/json-text.mjs';
import { loadVocab, loadUnits, loadUnitConversions } from '../load/vocab-load.mjs';
import { flattenTable } from '../load/flatten.mjs';
import { checkDef, splitKey, isErrorCode, CODE_RE, KEY_RE, CODE_ENUMS, TYPES, DOMAIN_OPTIONAL, T, markersOf } from './types.mjs';
import { checkRows, checkPrecedence, checkComponents, checkRequired, requiredSyntaxOk, valueOf } from './rows.mjs';
import { prepareNamedConditions } from './named-conditions.mjs';
import { checkCellGrades } from './cell-grades.mjs';
import { checkEffects } from './effects-validate.mjs';
import { compileRXInScope, evaluateRX, rxChildren, splitDimKey, RxError } from '../rx.mjs';
import { REGISTERED_CODES } from '../error-codes.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// 错误值上的登记码（与 kernel/errors.mjs#codeOf 同口径：不是对象、没有 code、码不在登记表内都返回 null）；
// 本文件不 import errors.mjs，避免给检测器 import 闭包多带一个只在此处用的模块（临时仓库指纹须与仓库一致）。
const codeOf = (e) => {
  if (e === null || typeof e !== 'object' || !('code' in e)) return null;
  const c = e.code;
  return typeof c === 'string' && isErrorCode(c) && REGISTERED_CODES.has(c) ? c : null;
};
// required 策略（卷二 §1.2）与报错 severity（§4.1）：单一定义，比较处引用。
// 类别族名（§1.3）与伪类 effect（§1.5 :182）的定义源在 handles/markers.mjs 的 VOCAB_FAMILIES、ID_KINDS，这里引 T 句柄，不留第二份。
const REQUIRED = Object.freeze({ always: 'always', never: 'never' });
const SEVERITY = Object.freeze({ error: 'error' });
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 词表族键 kind（§1.9 "kind→kind_，22 类代号本身作枚举时用"）：表头 kind 须是该族条目去前缀后的名字。
const KIND_FAMILY = 'kind';
// 叠加方式（§1.2 `.stacking`）；过程主体槽的专用校验（kernel/load/rules.mjs，§3.7）同读此处。
export const STACKING = Object.freeze(['none', 'penalized']);
/** 叠加方式的族句柄：成员由上面的 STACKING 派生（过程主体槽与修正求值共用）。 */
export const STACKING_MARKERS = markersOf('stacking', STACKING);

// sources：{units: 文本, vocab: 文本, effects?: 文本, unbuilt?: 文本, tables: [{file, text}]}（file 为文件名，如 "<kind>.json"）。
// options：{namespaces: [..], displaySet: [..], ns: [{ns, shape, type}], limits: {extendsMaxDepth, rxMaxDepth}, primitives?: 原语目录行}（只给效果族校验，缺即原语输出一律拒）。
/**
 * @param {{units: string, vocab: string, effects?: string, tables: {file: string, text: string}[]}} sources
 * @param {{namespaces: string[], displaySet: string[], ns: {ns: string, shape: string, type: string}[], limits: {extendsMaxDepth: number, rxMaxDepth: number}, primitives?: any[]}} options
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
  const unbuiltDoc = sources.unbuilt === undefined ? { entries: [] } : parse('_unbuilt-derived.json', sources.unbuilt);
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
  const unitConversions = loadUnitConversions(unitsDoc, units, err);
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
  for (const id of Object.keys(isObj(effectsDoc) ? effectsDoc : {}).sort()) claim(id, T.id_kind.effect,{ table: '_effects', row: id, dim: '', path: `_effects.json#/${id}` });
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
      else if (!vocab.index.has(id) || vocab.index.get(id).family !== T.vocab_family.class) err({ code: 'E-DIM-CLASS-UNKNOWN', level: 'L2', ...at, got: id, want: 'entry of vocab family class' });
    }
  }

  // ---------- L1 表头 ----------
  const kinds = new Set([...tables.map((t) => t.kind), T.id_kind.effect]);
  const tableDims = new Map(tables.map((t) => [t.kind, t.doc.dimensions]));
  const env = { units, unitConversions, vocab, kinds, idIndex, tableDims, displaySet: new Set(options.displaySet), compiled: new Map() };
  for (const t of tables) checkHeader(t, env, err);

  // RX 编译用的维度表：全部表的维度键；同名维度在不同表类型不同即标为歧义（rx.mjs 编到它时报 E-MOD-RX）。
  const rxDims = new Map();
  for (const t of tables) for (const [k, d] of Object.entries(t.doc.dimensions)) {
    if (!rxDims.has(k)) rxDims.set(k, d);
    else if (JSON.stringify(rxDims.get(k)) !== JSON.stringify(d)) rxDims.set(k, { ambiguous: true });
  }
  env.rxScope = { dims: rxDims, vocabIndex: vocab.index, ns: options.ns, maxDepth: options.limits.rxMaxDepth, rules: options.rules };
  env.rxDims = rxDims;

  // ---------- L1 未建派生登记（卷二 §1.12 封卷后勘误 1118k23）：登记所指必须是本表 derived 维度 ----------
  const unbuiltByTable = readUnbuiltRegistry(unbuiltDoc, tables, err);
  const unbuiltNames = readUnbuiltNames(unbuiltDoc, vocab, err);
  // 未建维度／未建列登记（同文件 columns，§1.12 封卷后勘误 1119k3 ②）：行上缺值放行，checkRequired 读 t.unbuiltColumns。
  const unbuiltColumns = readUnbuiltColumns(unbuiltDoc, tables, err);
  for (const t of tables) t.unbuiltColumns = unbuiltColumns.get(t.kind) || new Set();

  // ---------- L1 派生式：按本表维度在加载期编译，维度级环（§2.9 第 4 条 :1182–:1183、§4.1 L1 :1500、§1.12 RA-N3 :380） ----------
  for (const t of tables) {
    const compiled = compileDerived(t, env, options, err, unbuiltByTable.get(t.kind));
    t.derived = compiled.trees;
    t.unbuilt = compiled.unbuilt;
    checkDerivedGraph(t, t.derived, err);
  }

  // ---------- 展平、行检查（L1/L2）、L3 ----------
  for (const t of tables) {
    const groups = isObj(t.doc.precedenceGroups) ? t.doc.precedenceGroups : {};
    const groupsOf = (c) => new Set(Object.keys(groups).filter((g) => Array.isArray(groups[g]) && groups[g].includes(c)));
    t.flat = flattenTable(t.doc, groupsOf, options.limits.extendsMaxDepth, (e) => err({ ...e, path: `${t.file}${e.path}` }));
    t.env = env;
  }
  const stats = { known: 0, applicable: 0, notCovered: new Set(), coverage: new Map() };
  for (const t of tables) { checkRows(t, env, err); checkPrecedence(t, env, err); }
  // 加载期反查索引（卷二 §1.12 封卷后勘误 1118k23；卷三乙 :627）：展平与自检之后遍历一次全表建成只读索引。
  for (const t of tables) buildReverseIndexes(t, err);
  // 加载期规则分类（§1.12 封卷后勘误 1118k31；卷三乙 :618 派生大类）：反查索引之后、按规则表条件逐行求一次。
  for (const t of tables) buildRuleIndexes(t, env, { ...options, unbuiltNames }, err);
  checkComponents(new Map(tables.map((t) => [t.kind, t])), env, err);
  for (const t of tables) { t.named = prepareNamedConditions(t, env, err); checkRequired(t, env, err, stats); checkCellGrades(t, err); }

  // 效果族表（§3.9、§4.1 L2）：族行、RX、原语与动词的引用闭合；通过的族行与编好的 RX 树随加载结果交出，供 kernel/effects.mjs 求值。
  const effects = checkEffects(effectsDoc, env, options, err);

  // 规则表的 RX 值在本函数之后按 env.rxScope 编（kernel/load/world.mjs checkRules）：只有规则表条件可写已登记的未建名（勘误 1118k31）；
  // 派生式、行上 RX、修正项、效果族都在上面编完，用的作用域不含未建名。
  env.rxScope = { ...env.rxScope, unbuiltNames };
  return report(errors, tables, stats, env, effects);
}

// ---------- L1 派生式编译与维度级环 ----------

// RX 变体没有产出 map/set/list/struct 的（§2.9 第 4 条 :1163–:1182）；聚合/集合原语建成前，这些类型的派生维度按 E-MOD-RX 拒收。
const DERIVED_RESULT_TYPES = new Set([T.type.map, T.type.set, T.type.list, T.type.struct]);
// 未建派生登记的字段与封闭枚举（卷二 §1.12 封卷后勘误 1118k23）：missing 取 primitive/data/constant，
// card 写卡号或固定代号 pre_first_reader_card（首个读者玩法卡前，待排）。
const UNBUILT_MISSING = Object.freeze(['constant', 'data', 'primitive']);
const CARD_CODE_RE = /^[a-z0-9][a-z0-9_-]{0,47}$/;

// 登记所指必须是本表声明了 derived 的维度；形状不合、重复、已能编译都按已登记码报错（登记不得变成后门）。
function readUnbuiltRegistry(doc, tables, err) {
  const out = new Map();
  const entries = isObj(doc) && Array.isArray(doc.entries) ? doc.entries : undefined;
  if (!entries) {
    err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', table: '_unbuilt-derived', row: '', dim: '', path: '_unbuilt-derived.json#/entries', got: isObj(doc) ? doc.entries : doc, want: 'entries array' });
    return out;
  }
  const byKind = new Map(tables.map((t) => [t.kind, t]));
  entries.forEach((entry, i) => {
    const at = {
      table: isObj(entry) && typeof entry.table === 'string' ? entry.table : '',
      row: '',
      dim: isObj(entry) && typeof entry.dimension === 'string' ? entry.dimension : '',
      path: `_unbuilt-derived.json#/entries/${i}`,
    };
    const bad = (code, got, want) => err({ code, level: 'L1', ...at, got, want });
    if (!isObj(entry)) { bad('E-DIM-STRUCT-FIELD', entry, '{table, dimension, missing, card}'); return; }
    if (typeof entry.table !== 'string' || !CODE_RE.test(entry.table)) bad('E-DIM-ID-FORMAT', entry.table, 'loaded table kind');
    if (typeof entry.dimension !== 'string' || !KEY_RE.test(entry.dimension)) bad('E-DIM-ID-FORMAT', entry.dimension, 'lowerCamel dimension key');
    const missing = entry.missing;
    if (!Array.isArray(missing) || !missing.length || missing.some((m) => !UNBUILT_MISSING.includes(m))
      || new Set(missing).size !== missing.length || missing.some((m, j) => j > 0 && cmp(missing[j - 1], m) >= 0)) bad('E-DIM-DOMAIN-ENUM', missing, UNBUILT_MISSING.join('|') + ' (non-empty, unique, sorted)');
    if (typeof entry.card !== 'string' || !CARD_CODE_RE.test(entry.card)) bad('E-DIM-STRUCT-FIELD', entry.card, 'card id or pre_first_reader_card');
    const t = typeof entry.table === 'string' ? byKind.get(entry.table) : undefined;
    if (!t) { bad('E-DIM-REF-MISSING', entry.table, 'loaded table kind'); return; }
    const def = typeof entry.dimension === 'string' ? t.doc.dimensions[entry.dimension] : undefined;
    if (!isObj(def) || def.derived === undefined) { bad('E-DIM-REF-MISSING', entry.dimension, 'derived dimension of this table'); return; }
    const m = out.get(t.kind) || new Map();
    if (m.has(entry.dimension)) { bad('E-DIM-DUPLICATE-KEY', entry.dimension, 'one registry entry per (table, dimension)'); return; }
    m.set(entry.dimension, entry);
    out.set(t.kind, m);
  });
  return out;
}

// 未建名登记（同文件 names，勘误 1118k31，李白 11-19 13:2x ②）：[{name, family, volume, card}]，登记一个别卷未建的词表条目名；
// 只许写在规则表条件里，求值按未命中。名字须合代号文法、族已登记且前缀相符、族里还没有该条目（已登记就得删掉这条）。
function readUnbuiltNames(doc, vocab, err) {
  const out = new Set();
  const list = isObj(doc) && doc.names !== undefined ? doc.names : [];
  const bad = (i, code, got, want) => err({ code, level: 'L1', table: '_unbuilt-derived', row: '', dim: '', path: `_unbuilt-derived.json#/names/${i}`, got, want });
  if (!Array.isArray(list)) { bad('', 'E-DIM-STRUCT-FIELD', list, 'names array'); return out; }
  list.forEach((e, i) => {
    if (!isObj(e) || typeof e.name !== 'string' || !CODE_RE.test(e.name) || typeof e.volume !== 'string' || !e.volume || typeof e.card !== 'string' || !CARD_CODE_RE.test(e.card)) { bad(i, 'E-DIM-STRUCT-FIELD', e, '{name, family, volume, card}'); return; }
    const fam = vocab.families.get(e.family);
    if (!fam || !e.name.startsWith(fam.prefix)) { bad(i, 'E-DIM-REF-MISSING', e.family, 'registered vocab family whose prefix the name carries'); return; }
    if (vocab.index.has(e.name)) { bad(i, 'E-DIM-STRUCT-FIELD', e.name, 'already registered: remove it from names'); return; }
    if (out.has(e.name)) { bad(i, 'E-DIM-DUPLICATE-KEY', e.name, 'one entry per name'); return; }
    out.add(e.name);
  });
  return out;
}

// 未建维度／未建列登记（同文件 columns，§1.12 封卷后勘误 1119k3 ②；李白 11-19 12:4x 丙9、丙10）：[{table, dimension, missing, card}]，
// 字段文法同 entries。所指须是本表表头已声明、按行填写（非 derived、reverseIndex、ruleIndex、sample）、required 不是 never 的维度；
// 登记只放行该（表，维度）行上的缺值，行上有值照常校验；形状不合、所指不合、重复的条目报已登记码且不放行（登记不得变成后门）。
function readUnbuiltColumns(doc, tables, err) {
  const out = new Map();
  const list = isObj(doc) && doc.columns !== undefined ? doc.columns : [];
  if (!Array.isArray(list)) {
    err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', table: '_unbuilt-derived', row: '', dim: '', path: '_unbuilt-derived.json#/columns', got: list, want: 'columns array' });
    return out;
  }
  const byKind = new Map(tables.map((t) => [t.kind, t]));
  list.forEach((entry, i) => {
    const at = {
      table: isObj(entry) && typeof entry.table === 'string' ? entry.table : '',
      row: '',
      dim: isObj(entry) && typeof entry.dimension === 'string' ? entry.dimension : '',
      path: `_unbuilt-derived.json#/columns/${i}`,
    };
    const bad = (code, got, want) => err({ code, level: 'L1', ...at, got, want });
    if (!isObj(entry)) { bad('E-DIM-STRUCT-FIELD', entry, '{table, dimension, missing, card}'); return; }
    let ok = true;
    if (typeof entry.table !== 'string' || !CODE_RE.test(entry.table)) { bad('E-DIM-ID-FORMAT', entry.table, 'loaded table kind'); ok = false; }
    if (typeof entry.dimension !== 'string' || !KEY_RE.test(entry.dimension)) { bad('E-DIM-ID-FORMAT', entry.dimension, 'lowerCamel dimension key'); ok = false; }
    const missing = entry.missing;
    if (!Array.isArray(missing) || !missing.length || missing.some((m) => !UNBUILT_MISSING.includes(m))
      || new Set(missing).size !== missing.length || missing.some((m, j) => j > 0 && cmp(missing[j - 1], m) >= 0)) { bad('E-DIM-DOMAIN-ENUM', missing, UNBUILT_MISSING.join('|') + ' (non-empty, unique, sorted)'); ok = false; }
    if (typeof entry.card !== 'string' || !CARD_CODE_RE.test(entry.card)) { bad('E-DIM-STRUCT-FIELD', entry.card, 'card id or pre_first_reader_card'); ok = false; }
    const t = typeof entry.table === 'string' ? byKind.get(entry.table) : undefined;
    if (!t) { bad('E-DIM-REF-MISSING', entry.table, 'loaded table kind'); return; }
    const def = typeof entry.dimension === 'string' && Object.hasOwn(t.doc.dimensions, entry.dimension) ? t.doc.dimensions[entry.dimension] : undefined;
    if (!isObj(def)) { bad('E-DIM-REF-MISSING', entry.dimension, 'dimension declared in this table header'); return; }
    if (def.derived !== undefined || def.reverseIndex !== undefined || def.ruleIndex !== undefined || def.sample !== undefined) { bad('E-DIM-STRUCT-FIELD', entry.dimension, 'row-filled dimension (derived ones go to entries)'); return; }
    if (typeof def.required !== 'string' || def.required === REQUIRED.never) { bad('E-DIM-STRUCT-FIELD', def.required, 'required dimension (not never): nothing to release'); return; }
    const m = out.get(t.kind) || new Set();
    if (m.has(entry.dimension)) { bad('E-DIM-DUPLICATE-KEY', entry.dimension, 'one columns entry per (table, dimension)'); return; }
    if (!ok) return;
    m.add(entry.dimension);
    out.set(t.kind, m);
  });
  return out;
}

// 派生式里引用的维度键（§2.9 第 4 条 `dim` 变体）；只走子树字段，`agg` 的 dim 是关系对象上的维度名，不是本表变量。
function treeDimKeys(tree) {
  const keys = new Set();
  for (const k of treeDimRefs(tree)) keys.add(splitDimKey(k).dim);
  return [...keys].sort();
}

// 式里读到的维度键原样（带下标的保留下标）。
function treeDimRefs(tree) {
  const keys = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (n.op === T.rx_op.dim && typeof n.key === 'string') keys.add(n.key);
    rxChildren(n).forEach(walk);
  };
  walk(tree);
  return [...keys].sort();
}

// 编译作用域：本表维度（§1.3 :157 读同主体）优先；别的表的维度键只用于把"变量不在本表"与语法错误分开报（E-DIM-DERIVED-VAR / E-MOD-RX）。
function derivedScope(dims, env, options) {
  const scopeDims = new Map(Object.entries(dims));
  for (const [k, d] of env.rxDims) if (!scopeDims.has(k)) scopeDims.set(k, d);
  return { dims: scopeDims, vocabIndex: env.vocab.index, ns: options.ns, maxDepth: options.limits.rxMaxDepth, rules: options.rules };
}

// 维度的单位（map 维度取值类型的单位；带下标的维度键读 map 的值）。
function unitOfKey(dims, key) {
  const { dim, sub } = splitDimKey(key);
  const def = dims[dim];
  if (!isObj(def)) return undefined;
  const d = def.type === T.type.map || sub !== undefined ? def.value : def;
  return isObj(d) && typeof d.unit === 'string' ? d.unit : undefined;
}

// 单位换算（§1.4 conversions，勘误 1118k31）：派生式整式只读一个维度、单位与派生维度不同时，按登记的换算除以 divideBy；
// 没登记换算即编译失败（E-MOD-RX），不按同值交回。其余式子的单位不在此核。
function convertUnit(tree, def, dims, env) {
  if (tree.op !== T.rx_op.dim) return { tree };
  const from = unitOfKey(dims, tree.key);
  const to = typeof def.unit === 'string' ? def.unit : undefined;
  if (from === undefined || to === undefined || from === to) return { tree };
  const row = env.unitConversions && env.unitConversions.get(from) ? env.unitConversions.get(from).get(to) : undefined;
  if (!row) return { error: { code: 'E-MOD-RX', got: `${from} -> ${to}`, want: 'unit conversion registered in _units.json conversions' } };
  return { tree: Object.freeze({ op: T.rx_op.div, left: tree, right: Object.freeze({ op: T.rx_op.num, value: row.divideBy }) }) };
}

// 单条派生式的可编译性：返回 {tree} 或 {error}。只收带登记码的 RX 编译错误（§2.9 第 4 条 :1183、:1234）；
// 没有登记码的是程序缺陷，原样抛回（§4.3 勘误 1118b25）。
function compileOne(def, dims, env, options) {
  if (DERIVED_RESULT_TYPES.has(def.type)) {
    return { error: { code: 'E-MOD-RX', got: def.type, want: 'derived result type number/integer/boolean/ref (map/set/list/struct need aggregate or set primitives)' } };
  }
  let compiled;
  try { compiled = compileRXInScope(def.derived, 'data', derivedScope(dims, env, options)); }
  catch (e) {
    const code = codeOf(e);
    if (code === null) throw e;
    return { error: { code, got: e.message, want: 'compilable data-profile RX' } };
  }
  const foreign = treeDimKeys(compiled.tree).filter((k) => !Object.hasOwn(dims, k));
  if (foreign.length) return { error: { code: 'E-DIM-DERIVED-VAR', got: foreign.join(','), want: 'variable declared in this table (base-value dimension of the subject)' } };
  return convertUnit(compiled.tree, def, dims, env);
}

// 登记里的维度跳过编译；但登记了却已能写成 RX 的派生式必须从登记删除（E-DIM-STRUCT-FIELD），防止登记变成后门。
function compileDerived(t, env, options, err, registered) {
  const trees = new Map();
  const unbuilt = new Set();
  const dims = t.doc.dimensions;
  for (const dim of Object.keys(dims).sort()) {
    const def = dims[dim];
    if (!isObj(def) || def.derived === undefined) continue;
    const at = { table: t.kind, row: '', dim, path: `${t.file}#/dimensions/${dim}/derived` };
    const one = compileOne(def, dims, env, options);
    if (registered && registered.has(dim)) {
      if (one.tree !== undefined) err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at, got: 'registered but compilable', want: 'remove this entry from _unbuilt-derived.json' });
      else unbuilt.add(dim);
      continue;
    }
    if (one.error) { err({ code: one.error.code, level: 'L1', ...at, got: one.error.got, want: one.error.want }); continue; }
    trees.set(dim, one.tree);
  }
  return { trees, unbuilt };
}

// 维度级环（RA-N3）：节点 (kind.dim)，边是公式引用；自引用要带 recursive 才合法，非自环环一律报错。
function checkDerivedGraph(t, trees, err) {
  const visiting = new Set();
  const done = new Set();
  const cycle = (dim, got) => err({ code: 'E-DIM-DERIVED-CYCLE', level: 'L1', table: t.kind, row: '', dim, path: `${t.file}#/dimensions/${dim}/derived`, got, want: 'acyclic derived references (self-reference needs recursive)' });
  const visit = (dim) => {
    if (done.has(dim)) return;
    if (visiting.has(dim)) { cycle(dim, dim); return; }
    visiting.add(dim);
    const recursive = isObj(t.doc.dimensions[dim].recursive) && typeof t.doc.dimensions[dim].recursive.relation === 'string';
    for (const target of treeDimKeys(trees.get(dim))) {
      if (!trees.has(target)) continue;
      if (target === dim) { if (!recursive) cycle(dim, `${dim} -> ${dim}`); continue; }
      if (visiting.has(target)) { cycle(target, `${dim} -> ${target}`); continue; }
      visit(target);
    }
    visiting.delete(dim);
    done.add(dim);
  };
  for (const dim of [...trees.keys()].sort()) visit(dim);
}

// 加载期反查索引（卷二 §1.12 封卷后勘误 1118k23；卷三乙 :627 的整类写法）：维度头 .reverseIndex 指本表一个 map<ref K, ref 本表> 源维度，
// 本维度是 set<ref K>；展平与自检之后遍历一次全表，凡某行源维度的键 k 指向本行就把 k 记入本行。驻留只读索引，读时按行查。
function sameRef(a, b) {
  return isObj(a) && isObj(b) && a.type === b.type && a.kind === b.kind && a.vocab === b.vocab && a.dim === b.dim
    && JSON.stringify(Array.isArray(a.kinds) ? a.kinds : null) === JSON.stringify(Array.isArray(b.kinds) ? b.kinds : null);
}

function buildReverseIndexes(t, err) {
  const dims = t.doc.dimensions;
  const out = new Map();
  for (const [dim, def] of Object.entries(dims).sort(([a], [b]) => cmp(a, b))) {
    if (!isObj(def) || def.reverseIndex === undefined) continue;
    const at = { table: t.kind, row: '', dim, path: `${t.file}#/dimensions/${dim}/reverseIndex` };
    const bad = (code, got, want) => err({ code, level: 'L1', ...at, got, want });
    const srcName = def.reverseIndex;
    const src = typeof srcName === 'string' ? dims[srcName] : undefined;
    if (!isObj(src)) { bad('E-DIM-REF-MISSING', srcName, 'declared dimension of this table'); continue; }
    if (src.type !== T.type.map || !isObj(src.key) || !isObj(src.value)) { bad('E-DIM-STRUCT-FIELD', `${srcName}: ${src.type}`, 'map<ref K, ref this table>'); continue; }
    if (src.derived !== undefined || src.sample !== undefined) { bad('E-DIM-STRUCT-FIELD', `${srcName} is derived/sample`, 'stored map dimension'); continue; }
    if (def.type !== T.type.set || !isObj(def.of)) { bad('E-DIM-STRUCT-FIELD', def.type, 'set<ref K>'); continue; }
    if (def.derived !== undefined || def.sample !== undefined) { bad('E-DIM-STRUCT-FIELD', 'reverseIndex with derived/sample', 'one of reverseIndex, derived, sample'); continue; }
    if (!sameRef(src.key, def.of)) { bad('E-DIM-STRUCT-FIELD', JSON.stringify(def.of), `same key type as ${srcName}`); continue; }
    const pointsHere = src.value.type === T.type.ref && (src.value.kind === t.kind || (Array.isArray(src.value.kinds) && src.value.kinds.includes(t.kind)));
    if (!pointsHere) { bad('E-DIM-STRUCT-FIELD', JSON.stringify(src.value), `ref to ${t.kind}`); continue; }
    // 反查索引是加载期推出的值，行上不得手填（与 derived 同口径，已登记码 E-DIM-DERIVED-WRITTEN）。
    for (const section of ['classes', 'rows', 'generated']) {
      const rows = isObj(t.doc[section]) ? t.doc[section] : {};
      for (const [rowId, row] of Object.entries(rows)) {
        if (!isObj(row)) continue;
        for (const key of Object.keys(row).sort()) {
          if (splitKey(key).dim !== dim) continue;
          err({ code: 'E-DIM-DERIVED-WRITTEN', level: 'L1', table: t.kind, row: rowId, dim, path: `${t.file}#/${section}/${rowId}/${key}`, got: key, want: 'loader-index dimensions are not written' });
        }
      }
    }
    const index = new Map();
    for (const [rowId, row] of t.flat.rows) {
      const m = isObj(row) && isObj(row[srcName]) ? row[srcName] : undefined;
      if (!m) continue;
      for (const k of Object.keys(m)) {
        const target = m[k];
        if (typeof target !== 'string') continue;
        if (!index.has(target)) index.set(target, []);
        index.get(target).push(k);
      }
    }
    for (const [id, list] of index) index.set(id, Object.freeze([...new Set(list)].sort(cmp)));
    out.set(dim, index);
  }
  t.reverse = out;
}

// 加载期规则分类（卷二 §1.12 封卷后勘误 1118k31；卷三乙 :618、M-9 派生大类的整类写法）：维度头 .ruleIndex = {table, key, requiredUnless?}
// 指规则表 rules.<table>.<key> 的条件列表 [{when, value}]；本维度是 set<ref vocab F>，不写 derived、不进 RX 读数、行上不得手填。
// 每条 when 按本表维度编译（另可读 classes：本行组件类连 broader 上位，只作 member 的 set），逐行求一次，命中的 value 全部记入；
// when 里读到未知的按未命中（§1.12 未知传播总则）。族 F 的每个条目都须有条件（缺即 E-DIM-REF-MISSING）；
// requiredUnless 指一个维度：本行该维度未知或为 null 且分类结果为空集即 E-DIM-REQUIRED-MISSING。
function buildRuleIndexes(t, env, options, err) {
  const dims = t.doc.dimensions;
  const out = new Map();
  for (const [dim, def] of Object.entries(dims).sort(([a], [b]) => cmp(a, b))) {
    if (!isObj(def) || def.ruleIndex === undefined) continue;
    const at = { table: t.kind, row: '', dim, path: `${t.file}#/dimensions/${dim}/ruleIndex` };
    const bad = (code, got, want, row = '') => err({ code, level: 'L1', ...at, row, got, want });
    const ri = def.ruleIndex;
    const fam = isObj(def.of) && def.of.type === T.type.ref ? def.of.vocab : undefined;
    if (def.type !== T.type.set || typeof fam !== 'string' || !env.vocab.families.has(fam)) { bad('E-DIM-STRUCT-FIELD', def.type, 'set<ref vocab F>'); continue; }
    if (def.derived !== undefined || def.sample !== undefined || def.reverseIndex !== undefined) { bad('E-DIM-STRUCT-FIELD', 'ruleIndex with derived/sample/reverseIndex', 'one of ruleIndex, reverseIndex, derived, sample'); continue; }
    if (!isObj(ri) || typeof ri.table !== 'string' || typeof ri.key !== 'string' || (ri.requiredUnless !== undefined && !Object.hasOwn(dims, ri.requiredUnless))) { bad('E-DIM-STRUCT-FIELD', ri, '{table, key, requiredUnless?: dimension of this table}'); continue; }
    const tableRules = isObj(options.rules) && isObj(options.rules[ri.table]) ? options.rules[ri.table] : undefined;
    const list = tableRules && Object.hasOwn(tableRules, ri.key) ? tableRules[ri.key] : undefined;
    if (!Array.isArray(list)) { bad('E-DIM-REF-MISSING', `${ri.table}.${ri.key}`, 'registered rules list [{when, value}]'); continue; }
    // 行上手填即报（同 derived、reverseIndex 口径）。
    for (const section of ['classes', 'rows', 'generated']) {
      for (const [rowId, row] of Object.entries(isObj(t.doc[section]) ? t.doc[section] : {})) {
        if (!isObj(row)) continue;
        for (const key of Object.keys(row).sort()) if (splitKey(key).dim === dim) err({ code: 'E-DIM-DERIVED-WRITTEN', level: 'L1', table: t.kind, row: rowId, dim, path: `${t.file}#/${section}/${rowId}/${key}`, got: key, want: 'loader-index dimensions are not written' });
      }
    }
    const scopeDims = new Map(Object.entries(dims).filter(([, d]) => isObj(d) && d.derived === undefined && d.sample === undefined && d.ruleIndex === undefined));
    // 命名空间只收代号等于本表 kind 的登记行（读"被求值的那一份"本表行，如卷四登记的 material.classes）。
    const ownNs = (options.ns || []).filter((r) => r.ns === t.kind);
    const scope = { dims: scopeDims, vocabIndex: env.vocab.index, ns: ownNs, maxDepth: options.limits.rxMaxDepth, rules: options.rules, unbuiltNames: options.unbuiltNames };
    const compiled = [];
    list.forEach((entry, i) => {
      const where = `rules.${ri.table}.${ri.key}[${i}]`;
      if (!isObj(entry) || typeof entry.when !== 'string') { bad('E-DIM-STRUCT-FIELD', entry, '{when: rx, value}', where); return; }
      const rec = env.vocab.index.get(entry.value);
      if (!rec || rec.family !== fam) { bad('E-DIM-REF-MISSING', entry.value, `entry of vocab family ${fam}`, where); return; }
      let c;
      try { c = compileRXInScope(entry.when, 'data', scope); } catch (e) {
        if (codeOf(e) === null) throw e;
        bad(codeOf(e), e.message, 'compilable boolean data-profile RX', where); return;
      }
      // 引用已登记未建名的条件照登、求值按未命中（李白 11-19 13:2x ②）。
      compiled.push({ when: c.tree, value: entry.value, nsRefs: c.nsRefs, unbuilt: c.unbuiltRefs.length > 0 });
    });
    const covered = new Set(compiled.map((c) => c.value));
    for (const code of Object.keys(env.vocab.families.get(fam).entries).sort()) if (!covered.has(code)) bad('E-DIM-REF-MISSING', code, `a condition in rules.${ri.table}.${ri.key}`);
    const index = new Map();
    for (const [rowId] of t.flat.rows) {
      const raw = isObj(t.doc.rows) && isObj(t.doc.rows[rowId]) ? t.doc.rows[rowId] : isObj(t.doc.generated) && isObj(t.doc.generated[rowId]) ? t.doc.generated[rowId] : {};
      const read = (key) => {
        const { dim: k, sub } = splitDimKey(key);
        if (sub !== undefined) { const m = read(k); return m.known && isObj(m.value) && Object.hasOwn(m.value, sub) ? { known: true, value: m.value[sub] } : { known: false }; }
        if (k === T.row_field.classes) return { known: true, value: [...new Set((Array.isArray(raw.classes) ? raw.classes : []).flatMap((c) => [c, ...env.vocab.ancestors(c)]))].sort(cmp) };
        if (isObj(dims[k]) && dims[k].reverseIndex !== undefined) {
          const ix = t.reverse instanceof Map ? t.reverse.get(k) : undefined;
          return { known: true, value: ix instanceof Map && ix.has(rowId) ? ix.get(rowId) : [] };
        }
        return valueOf(t, rowId, raw, k);
      };
      const hits = new Set();
      for (const c of compiled) {
        if (c.unbuilt) continue;
        const bound = {};
        for (const k of treeDimRefs(c.when)) { const v = read(k); if (v.known && v.value !== undefined && v.value !== null) bound[k] = v.value; }
        const nsReads = {};
        for (const ref of c.nsRefs) { const v = read(ref.slice(t.kind.length + 1)); if (v.known && v.value !== undefined && v.value !== null) nsReads[ref] = v.value; }
        let hit = false;
        try { hit = evaluateRX(c.when, { dim: bound, clock: {} }, nsReads) === true; } catch (e) {
          if (!(e instanceof RxError && e.key !== undefined)) throw e; // 缺读数 = 未知，按未命中
        }
        if (hit) hits.add(c.value);
      }
      const value = Object.freeze([...hits].sort(cmp));
      index.set(rowId, value);
      if (ri.requiredUnless !== undefined && !value.length) {
        const v = read(ri.requiredUnless);
        if (!v.known || v.value === null || v.value === undefined) err({ code: 'E-DIM-REQUIRED-MISSING', level: 'L3', table: t.kind, row: rowId, dim, path: `${t.file}#/rows/${rowId}`, got: 'empty', want: `${dim} non-empty when ${ri.requiredUnless} is empty` });
      }
    }
    out.set(dim, index);
  }
  t.ruleIndexes = out;
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
    if (!requiredSyntaxOk(def.required)) bad('E-DIM-STRUCT-FIELD', 'required', def.required, 'always|never|byClass:<c>|ifPresent:<d>|byEnum:<d>=<v>|anyOf:<a>,<b>|byDigestible|byReader, joined by ;');
    if (def.required !== REQUIRED.always && def.onUnknown === undefined) bad('E-DIM-ONUNKNOWN-MISSING', 'onUnknown', 'missing', CODE_ENUMS.onUnknown.join('|'));
    else if (def.onUnknown !== undefined && !CODE_ENUMS.onUnknown.includes(def.onUnknown)) bad('E-DIM-DOMAIN-ENUM', 'onUnknown', def.onUnknown, CODE_ENUMS.onUnknown.join('|'));
    if (typeof def.modifiable !== 'boolean') bad('E-DIM-MODIFIABLE-TYPE', 'modifiable', def.modifiable, 'true|false');
    else if (def.modifiable) {
      const numeric = (d) => isObj(d) && (d.type === T.type.number || d.type === T.type.integer);
      if (!(numeric(def) || (def.type === T.type.map && numeric(def.value))) || def.type === T.type.string) bad('E-DIM-MODIFIABLE-TYPE', 'modifiable', def.type, 'number, integer or map<..., number>');
      if (!STACKING.includes(def.stacking)) bad('E-MOD-STACKING', 'stacking', def.stacking, STACKING.join('|'), 'L2');
      const [lo, hi, ...rest] = Array.isArray(def.bounds) ? def.bounds : [];
      if (typeof lo !== 'number' || typeof hi !== 'number' || rest.length || lo > hi) bad('E-MOD-BOUNDS', 'bounds', def.bounds, '[lo,hi]', 'L2');
    }
    if (def.sample !== undefined && def.derived !== undefined) bad('E-DIM-SAMPLE-DERIVED', 'sample', 'sample with derived', 'one of sample or derived');
    if (def.domain === undefined && TYPES.includes(def.type) && !DOMAIN_OPTIONAL.includes(def.type)) bad('E-DIM-DOMAIN-RANGE', 'domain', 'missing', 'domain');
    const sm = def.stockMode;
    if (sm !== undefined && !CODE_ENUMS.stock_mode.includes(sm)) bad('E-DIM-DOMAIN-ENUM', 'stockMode', sm, CODE_ENUMS.stock_mode.join('|'));
    if ((sm === T.code_enum.stock_mode.remainder) !== (def.remDenominator !== undefined)) bad('E-DIM-STRUCT-FIELD', 'remDenominator', def.remDenominator, 'remDenominator exactly when stockMode is remainder');
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
function report(errors, tables, stats, env, effects) {
  const norm = errors.map((e) => ({
    code: e.code, severity: e.code.startsWith('W-') ? 'warning' : 'error', level: e.level || '',
    table: e.table || '', row: e.row || '', dim: e.dim || '', path: e.path || '',
    got: e.got === undefined ? null : e.got, want: e.want === undefined ? '' : String(e.want),
  }));
  norm.sort((a, b) => cmp(a.table, b.table) || cmp(a.row, b.row) || cmp(a.dim, b.dim) || cmp(a.code, b.code) || cmp(a.path, b.path));
  const seen = new Set();
  const out = norm.filter((e) => { const k = [e.code, e.table, e.row, e.dim].join('\u0000'); if (seen.has(k)) return false; seen.add(k); return true; });
  const nErr = out.filter((e) => e.severity === SEVERITY.error).length;
  const rows = tables.reduce((n, t) => n + Object.keys(isObj(t.doc.rows) ? t.doc.rows : {}).length + Object.keys(isObj(t.doc.generated) ? t.doc.generated : {}).length, 0);
  const lines = out.map((e) => `${e.code}  ${e.table}/${e.row}.${e.dim}  got ${JSON.stringify(e.got)}  want ${e.want}  - ${e.path}`);
  lines.push(`errors=${nErr} warnings=${out.length - nErr} tables=${tables.length} rows=${rows} known=${stats.known} applicable=${stats.applicable}`);
  return {
    ok: nErr === 0,
    errors: out,
    notCovered: [...stats.notCovered].sort(),
    text: lines.join('\n') + '\n',
    coverage: coverageText(stats.coverage),
    rx: env.compiled,
    effects,
    tables: new Map(tables.map((t) => [t.kind, { doc: t.doc, flat: t.flat, derived: t.derived || new Map(), unbuilt: t.unbuilt || new Set(), unbuiltColumns: t.unbuiltColumns || new Set(), reverse: t.reverse || new Map(), ruleIndexes: t.ruleIndexes || new Map() }])),
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
