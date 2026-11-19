// 行级检查（卷二 §4.1 L1 行结构、L2 引用与 precedence、L3 必填完整）。
// 取值走 §1.3 唯一算法：own（实体行展平后的值）→ 本维所属 precedence 组内、实体所属的展平类别行 → 派生 / 采样 → 未知。

import { checkValue, CODE_ENUMS, ROW_FIELDS, splitKey, markersOf, T } from './types.mjs';
import { GRAMMAR_TOKENS } from '../handles/markers.mjs';
import { gradeDecl } from './cell-grades.mjs';
import { rowReads, namedHolds } from './named-conditions.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
// required 策略（卷二 §1.2：always、byClass、ifPresent、byEnum、anyOf、byDigestible、byReader）与行来源值（§1.3）、map combine（§1.6）、空字串。
const REQUIRED_FORM = Object.freeze({ always: 'always', byClass: 'byClass', ifPresent: 'ifPresent', byEnum: 'byEnum', anyOf: 'anyOf', byDigestible: 'byDigestible', byReader: 'byReader' });
const SOURCE = Object.freeze({ instance: 'instance' });
const COMBINE = Object.freeze({ sum: 'sum' });
const SEG = Object.freeze({ empty: '' });
const SECTIONS = ['classes', 'rows', 'generated'];
// 节名句柄：成员由上面的节清单派生（三节即表文件的三个行区，§1.7）。
const SECTION = markersOf('section', SECTIONS);
// 族键由卷二点名：类别行键与 classes 字段取 class 族与 component 族（§1.3、§1.8），status 取 vstatus 族（§5.0）。
// 定义源在 kernel/handles/markers.mjs 的 VOCAB_FAMILIES（卷二 §1.9 :288），成员经 T.vocab_family 引用。
const CLASS_FAMILIES = [T.vocab_family.class, T.vocab_family.component];
const STATUS_FAMILY = T.vocab_family.vstatus;

// 一张表的行结构（L1）与类别、组件、标签引用（L2）。
/** @param {Record<string, unknown>} t 一张表 @param {Record<string, unknown>} env @param {(...args: unknown[]) => void} err */
export function checkRows(t, env, err) {
  const { doc, kind, file } = t;
  const dims = doc.dimensions || {};
  // 表头声明的逐格级别文档字段（cell-grades.mjs）：不是维度，不参与继承，各行只取自己的。
  const gradeField = (gradeDecl(doc) || {}).field;
  for (const section of SECTIONS) {
    const rows = isObj(doc[section]) ? doc[section] : {};
    for (const id of Object.keys(rows).sort()) {
      const row = rows[id];
      const at = (dim, sub) => ({ table: kind, row: id, dim: dim || '', path: `${file}#/${section}/${id}${sub !== undefined ? '/' + sub : ''}` });
      if (!isObj(row)) { err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(), got: typeof row, want: 'row object' }); continue; }
      for (const key of Object.keys(row).sort()) {
        const { dim, op } = splitKey(key);
        if (ROW_FIELDS.includes(key) || key === gradeField) {
          if (key === T.row_field.abstract && section !== SECTION.classes) err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(key, key), got: key, want: 'abstract only on class rows' });
          continue;
        }
        if (!Object.hasOwn(dims, dim)) { err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(key, key), got: key, want: 'a declared dimension or row field' }); continue; }
        const def = dims[dim];
        if (def.derived !== undefined && def.allowExplicit !== true) err({ code: 'E-DIM-DERIVED-WRITTEN', level: 'L1', ...at(dim, key), got: key, want: 'derived dimensions are not written' });
        if (op && section === SECTION.generated) continue; // E-DIM-EXTEND-ON-OVERRIDE 已由展平报
        // 值检查落在写它的那一行：整值写法查原值，继承写法查展平后的结果。
        const flat = section === SECTION.classes ? t.flat.classes.get(id) : t.flat.rows.get(id);
        const v = op ? flat[dim] : row[key];
        if (v !== undefined) checkValue(def, v, env, at(dim, key), err);
      }
      for (const c of Array.isArray(row.classes) ? row.classes : []) {
        const rec = env.vocab.index.get(c);
        if (!rec || !CLASS_FAMILIES.includes(rec.family)) { err({ code: 'E-DIM-CLASS-UNKNOWN', level: 'L2', ...at('classes', 'classes'), got: c, want: 'entry of the class or component family' }); continue; }
        if (rec.family === CLASS_FAMILIES[1] && rec.entry.table !== kind) err({ code: 'E-DIM-COMPONENT-TABLE', level: 'L3', ...at('classes', 'classes'), got: c, want: `component whose table is ${kind}` });
      }
      if (row.classes !== undefined && !Array.isArray(row.classes)) err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at('classes', 'classes'), got: typeof row.classes, want: 'set of class/component codes' });
      const comps = (Array.isArray(row.classes) ? row.classes : []).filter((c) => (env.vocab.index.get(c) || {}).family === CLASS_FAMILIES[1]);
      for (const c of comps) for (const other of env.vocab.index.get(c).entry.conflicts || []) if (comps.includes(other)) err({ code: 'E-DIM-COMPONENT-CONFLICT', level: 'L3', ...at('classes', 'classes'), got: `${c} with ${other}`, want: 'no conflicting components' });
      for (const tag of Array.isArray(row.tags) ? row.tags : []) if (!env.vocab.index.has(tag)) err({ code: 'E-DIM-REF-MISSING', level: 'L2', ...at('tags', 'tags'), got: tag, want: 'vocab entry' });
      if (row.status !== undefined) {
        const rec = env.vocab.index.get(row.status);
        if (!rec || rec.family !== STATUS_FAMILY) err({ code: 'E-DIM-DOMAIN-ENUM', level: 'L1', ...at('status', 'status'), got: row.status, want: `entry of vocab family ${STATUS_FAMILY}` });
      }
      if (section === SECTION.generated) {
        const g = row.generated;
        if (!isObj(g) || !['by', 'seedKey', 'at'].every((k) => Object.hasOwn(g, k))) err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at('generated', 'generated'), got: isObj(g) ? Object.keys(g).sort().join(',') : g, want: 'generated {by, seedKey, at}' });
      }
    }
  }
}

// precedence（L2）：组内各行存在、不含 abstract、与 broader 深度一致（深者先）。
/** @param {Record<string, unknown>} t 一张表 @param {Record<string, unknown>} env @param {(...args: unknown[]) => void} err */
export function checkPrecedence(t, env, err) {
  const { doc, kind, file } = t;
  const groups = isObj(doc.precedenceGroups) ? doc.precedenceGroups : {};
  for (const g of Object.keys(groups).sort()) {
    const list = Array.isArray(groups[g]) ? groups[g] : [];
    const at = { table: kind, row: '', dim: `precedenceGroups.${g}`, path: `${file}#/precedenceGroups/${g}` };
    list.forEach((c, i) => {
      if (!t.flat.classes.has(c)) err({ code: 'E-DIM-PRECEDENCE-UNKNOWN', level: 'L2', ...at, row: c, got: c, want: 'class row of this table' });
      else if (t.flat.abstract.has(c)) err({ code: 'E-DIM-ABSTRACT-IN-PRECEDENCE', level: 'L2', ...at, row: c, got: c, want: 'non-abstract class row' });
      if (i > 0 && env.vocab.depth(c) > env.vocab.depth(list[i - 1])) err({ code: 'E-DIM-PRECEDENCE-BROADER', level: 'L2', ...at, row: c, got: `${list[i - 1]} before ${c}`, want: 'deeper broader chain first' });
    });
  }
}

// 组件类条目（L2/L3）：requires 维度在其归属表、enables ⊆ 归属表 behaviors。
/** @param {Map<string, Record<string, unknown>>} tablesByKind @param {Record<string, unknown>} env @param {(...args: unknown[]) => void} err */
export function checkComponents(tablesByKind, env, err) {
  for (const [id, rec] of [...env.vocab.index].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (rec.family !== CLASS_FAMILIES[1]) continue;
    const t = tablesByKind.get(rec.entry.table);
    if (!t) continue; // 归属表未载入时不核（卷二附录 A 说明同此）
    const at = { table: '_vocab', row: id, path: `_vocab.json#/families/${CLASS_FAMILIES[1]}/entries/${id}` };
    for (const d of rec.entry.requires || []) if (!Object.hasOwn(t.doc.dimensions || {}, d)) err({ code: 'E-DIM-COMPONENT-REQUIRES', level: 'L2', ...at, dim: 'requires', got: d, want: `dimension of ${t.kind}` });
    for (const b of rec.entry.enables || []) if (!(t.doc.behaviors || []).includes(b)) err({ code: 'E-DIM-COMPONENT-ENABLES', level: 'L2', ...at, dim: 'enables', got: b, want: `behavior of ${t.kind}` });
  }
}

// ---------- 取值与 L3 ----------

function memberOf(row, c, env) {
  for (const own of Array.isArray(row.classes) ? row.classes : []) {
    if (own === c || env.vocab.ancestors(own).includes(c)) return true;
  }
  return false;
}

// value(kind, id, dim) 去掉 applicable 判断的部分：{known, value, source}。加载期规则分类也读它（dimensions-validate buildRuleIndexes）。
/** @param {any} t 一张表 @param {string} id 行代号 @param {Record<string, any>} row 行原文 @param {string} dim 维度键 @returns {{known: boolean, value?: any, source?: string}} */
export function valueOf(t, id, row, dim) {
  const flat = t.flat.rows.get(id) || {};
  if (flat[dim] !== undefined) return { known: true, value: flat[dim], source: 'instance' };
  const def = (t.doc.dimensions || {})[dim] || {};
  const group = (t.doc.precedenceOf || {})[dim] || 'default';
  const chain = ((t.doc.precedenceGroups || {})[group] || []).filter((c) => t.flat.classes.has(c) && !t.flat.abstract.has(c) && memberOf(row, c, t.env));
  for (const c of chain) {
    const v = t.flat.classes.get(c)[dim];
    if (v !== undefined) return { known: true, value: v, source: c };
  }
  if (def.derived !== undefined || def.sample !== undefined) return { known: true, value: undefined, source: 'derived' };
  return { known: false };
}

const REQ_FORMS = /^(always|never|byClass:[a-z][a-z0-9_]*|ifPresent:[a-z][a-zA-Z0-9]*|byEnum:[a-z][a-zA-Z0-9]*=[a-z][a-z0-9_]*|anyOf:[a-zA-Z0-9.]+(,[a-zA-Z0-9.]+)+|byDigestible|byReader)$/;
// required 策略的多条件分隔符（卷二 §1.2 :104：一个维度可并列多个条件，以"；"分隔）。
// 原 kernel/handles/patterns.mjs 搬入（S13 (b) 允许 validate/* 用正则；patterns.mjs 只留从 rx.mjs 搬来的正则）。
const REQUIRED_TERM_SEPARATOR = /；/;
/** @param {unknown} s @returns {string[]} */
export const splitRequiredTerms = (s) => (typeof s === 'string' ? s.split(REQUIRED_TERM_SEPARATOR).map((x) => x.trim()) : []);
/** @param {unknown} s required 策略 @returns {string[]} */
export const requiredTerms = splitRequiredTerms;
/** @param {unknown} s required 策略 @returns {boolean} */
export const requiredSyntaxOk = (s) => requiredTerms(s).length > 0 && requiredTerms(s).every((x) => REQ_FORMS.test(x));

const CONDITIONAL_FORMS = ['byClass', 'ifPresent', 'byEnum'];
// 一个实体行对一个维度的必填判定：{applicable（必填）, anyOf?, named?, conditional}。
function requirement(t, id, row, dim) {
  const terms = requiredTerms((t.doc.dimensions[dim] || {}).required);
  // conditional：策略里有 byClass/ifPresent/byEnum 条件项（§1.3 取值算法 :152，条件都不满足即"不适用"，RA-N5）。
  const out = { applicable: false, anyOf: null, named: [], conditional: false };
  for (const term of terms) {
    const [form, arg] = [term.slice(0, term.indexOf(':') < 0 ? term.length : term.indexOf(':')), term.slice(term.indexOf(':') + 1)];
    if (CONDITIONAL_FORMS.includes(form)) out.conditional = true;
    if (form === REQUIRED_FORM.always) out.applicable = true;
    else if (form === REQUIRED_FORM.byClass) { if (memberOf(row, arg, t.env)) out.applicable = true; }
    else if (form === REQUIRED_FORM.ifPresent) { if (valueOf(t, id, row, arg).known) out.applicable = true; }
    else if (form === REQUIRED_FORM.byEnum) { const [d, v] = arg.split('='); if (valueOf(t, id, row, d).value === v) out.applicable = true; }
    else if (form === REQUIRED_FORM.anyOf) { out.applicable = true; out.anyOf = arg.split(','); }
    else if (form === REQUIRED_FORM.byDigestible || form === REQUIRED_FORM.byReader) {
      // 表头声明了判据的命名条件按声明求值（named-conditions.mjs），属条件项；没声明的只记 notCovered。
      const cond = t.named && t.named.get(form);
      if (!cond) { out.named.push(form); continue; }
      out.conditional = true;
      if (namedOf(t, id, row, form, cond)) out.applicable = true;
    }
  }
  return out;
}

// 一行对一个命名条件只求值一次（卷三甲 §2.1"每行材料各求值一次"）。
function namedOf(t, id, row, form, cond) {
  const memo = (t.namedMemo ||= new Map());
  const k = `${id}\u0000${form}`;
  if (!memo.has(k)) {
    const known = [];
    for (const d of Object.keys(t.doc.dimensions || {}).sort()) { const r = valueOf(t, id, row, d); if (r.known && r.value !== undefined) known.push([d, r.value]); }
    const own = Array.isArray(row.classes) ? row.classes : [];
    const classes = [...new Set(own.flatMap((c) => [c, ...t.env.vocab.ancestors(c)]))].sort();
    memo.set(k, namedHolds(cond, rowReads(cond.rowNs, known, classes)));
  }
  return memo.get(k);
}

const knownPart = (t, id, row, item) => {
  const [d, col] = item.split(GRAMMAR_TOKENS.pathSep);
  const r = valueOf(t, id, row, d);
  if (!r.known) return false;
  if (col === undefined) return true;
  return isObj(r.value) && r.value[col] !== undefined && r.value[col] !== null;
};

// L3：required 策略、实体行 basis、映射键集（§1.6 第 4 项）；同时累计 known / applicable，
// 并按表按维累计 L5 齐全率五列（§4.1 L5 :1493）：不适用 = 条件项都不满足（§1.3 :152）；
// explicitFill = 带 allowExplicit 的派生维度在实体行上显式写了值（FA-N5）。派生、采样维度 P-2 未求值，按取值算法记为已知。
/**
 * @param {Record<string, unknown>} t 一张表 @param {Record<string, unknown>} env @param {(...args: unknown[]) => void} err
 * @param {Record<string, unknown>} stats 齐全率累计
 */
export function checkRequired(t, env, err, stats) {
  const { doc, kind, file } = t;
  const dims = doc.dimensions || {};
  const cov = Object.create(null);
  for (const dim of Object.keys(dims).sort()) cov[dim] = { known: 0, applicable: 0, notApplicable: 0, unknown: 0, explicitFill: 0 };
  stats.coverage.set(kind, cov);
  for (const section of ['rows', 'generated']) {
    const rows = isObj(doc[section]) ? doc[section] : {};
    for (const id of Object.keys(rows).sort()) {
      const row = rows[id] || {};
      const at = (dim) => ({ table: kind, row: id, dim, path: `${file}#/${section}/${id}/${dim}` });
      if (section === SECTION.rows && (typeof row.basis !== 'string' || row.basis === SEG.empty)) err({ code: 'E-DIM-INSTANCE-BASIS', level: 'L3', ...at('basis'), got: row.basis === undefined ? 'missing' : row.basis, want: 'basis on entity rows' });
      for (const dim of Object.keys(dims).sort()) {
        const req = requirement(t, id, row, dim);
        for (const n of req.named) stats.notCovered.add(`${kind}.${dim}:${n}`);
        const r = valueOf(t, id, row, dim);
        if (r.known && r.value !== undefined) checkMapKeys(dims[dim], r.value, env, at(dim), err);
        const c = cov[dim];
        if (req.applicable || !req.conditional) {
          c.applicable++;
          if (r.known) c.known++; else c.unknown++;
          if (dims[dim].allowExplicit === true && dims[dim].derived !== undefined && r.source === SOURCE.instance) c.explicitFill++;
        } else c.notApplicable++;
        if (!req.applicable) continue;
        stats.applicable++;
        if (r.known) stats.known++;
        if (req.anyOf) {
          if (!req.anyOf.some((item) => knownPart(t, id, row, item))) for (const item of req.anyOf) err({ code: 'E-DIM-REQUIRED-MISSING', level: 'L3', ...at(item.split(GRAMMAR_TOKENS.pathSep)[0]), got: 'unknown', want: `at least one of ${req.anyOf.join(',')}` });
        } else if (!r.known) {
          // 登记在案的未建维度／未建列（卷二 §1.12 封卷后勘误 1119k3 ②）：本（表，维度）行上缺值放行，运行期读到按未知；未登记的照下面报。
          if (t.unbuiltColumns instanceof Set && t.unbuiltColumns.has(dim)) continue;
          // onUnknown: gap 的维度缺值只记缺口、进加载警告，不让加载失败（卷三甲 §2.1、§6 EA-6；卷二 §5 开头"两处不一致以定义卷为准"，李白 11-17）。
          // anyOf 组合条件不在此列：它表达的是"至少填一项"的硬约束（如卷三甲 M-11 ①），照旧 E。
          const code = dims[dim].onUnknown === T.code_enum.onUnknown.gap ? 'W-DIM-GAP' : 'E-DIM-REQUIRED-MISSING';
          err({ code, level: 'L3', ...at(dim), got: 'unknown', want: `required ${dims[dim].required}` });
        }
      }
    }
  }
}

// 未标 combine: sum 的映射展平后须覆盖键类型的全族；onUnknown 为 error 时缺键即加载失败（§1.6 第 4 项）。
function checkMapKeys(def, v, env, at, err) {
  if (def.type !== T.type.map || def.combine === COMBINE.sum || def.onUnknown !== T.code_enum.onUnknown.error || !isObj(v) || !isObj(def.key)) return;
  const k = def.key;
  const fam = k.vocab !== undefined ? k.vocab : undefined;
  let all = [];
  if (typeof fam === 'string' && env.vocab.families.has(fam)) all = Object.keys(env.vocab.families.get(fam).entries);
  else if (k.type === T.type.enum && Object.hasOwn(CODE_ENUMS, fam)) all = [...CODE_ENUMS[fam]]; // 代码内封闭枚举的全部取值（§1.6 第 4 项"enum 族的全部条目"）
  else if (k.kind !== undefined) all = [...env.idIndex].filter(([, kd]) => kd === k.kind).map(([id]) => id);
  const missing = all.filter((x) => !Object.hasOwn(v, x)).sort();
  if (missing.length) err({ code: 'E-DIM-MAP-SPARSE-NONSUM', level: 'L3', ...at, got: `missing ${missing.join(',')}`, want: 'every key of the family (write null for none)' });
}
