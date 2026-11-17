// 行级检查（卷二 §4.1 L1 行结构、L2 引用与 precedence、L3 必填完整）。
// 取值走 §1.3 唯一算法：own（实体行展平后的值）→ 本维所属 precedence 组内、实体所属的展平类别行 → 派生 / 采样 → 未知。

import { ROW_FIELDS, splitKey } from '../load/flatten.mjs';
import { checkValue, CODE_RE } from './types.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const SECTIONS = ['classes', 'rows', 'generated'];
// 族键由卷二点名：类别行键与 classes 字段取 class 族与 component 族（§1.3、§1.8），status 取 vstatus 族（§5.0）。
const CLASS_FAMILIES = ['class', 'component'];
const STATUS_FAMILY = 'vstatus';

// 一张表的行结构（L1）与类别、组件、标签引用（L2）。
export function checkRows(t, env, err) {
  const { doc, kind, file } = t;
  const dims = doc.dimensions || {};
  for (const section of SECTIONS) {
    const rows = isObj(doc[section]) ? doc[section] : {};
    for (const id of Object.keys(rows).sort()) {
      const row = rows[id];
      const at = (dim, sub) => ({ table: kind, row: id, dim: dim || '', path: `${file}#/${section}/${id}${sub !== undefined ? '/' + sub : ''}` });
      if (!isObj(row)) { err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(), got: typeof row, want: 'row object' }); continue; }
      for (const key of Object.keys(row).sort()) {
        const { dim, op } = splitKey(key);
        if (ROW_FIELDS.includes(key)) {
          if (key === 'abstract' && section !== 'classes') err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(key, key), got: key, want: 'abstract only on class rows' });
          continue;
        }
        if (!Object.hasOwn(dims, dim)) { err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at(key, key), got: key, want: 'a declared dimension or row field' }); continue; }
        const def = dims[dim];
        if (def.derived !== undefined && def.allowExplicit !== true) err({ code: 'E-DIM-DERIVED-WRITTEN', level: 'L1', ...at(dim, key), got: key, want: 'derived dimensions are not written' });
        if (op && section === 'generated') continue; // E-DIM-EXTEND-ON-OVERRIDE 已由展平报
        // 值检查落在写它的那一行：整值写法查原值，继承写法查展平后的结果。
        const flat = section === 'classes' ? t.flat.classes.get(id) : t.flat.rows.get(id);
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
      if (section === 'generated') {
        const g = row.generated;
        if (!isObj(g) || !['by', 'seedKey', 'at'].every((k) => Object.hasOwn(g, k))) err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', ...at('generated', 'generated'), got: isObj(g) ? Object.keys(g).sort().join(',') : g, want: 'generated {by, seedKey, at}' });
      }
    }
  }
}

// precedence（L2）：组内各行存在、不含 abstract、与 broader 深度一致（深者先）。
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

// value(kind, id, dim) 去掉 applicable 判断的部分：{known, value, source}。
function valueOf(t, id, row, dim) {
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
export const requiredTerms = (s) => (typeof s === 'string' ? s.split('；').map((x) => x.trim()) : []);
export const requiredSyntaxOk = (s) => requiredTerms(s).length > 0 && requiredTerms(s).every((x) => REQ_FORMS.test(x));

// 一个实体行对一个维度的必填判定：{applicable, anyOf?, named?}。
function requirement(t, id, row, dim) {
  const terms = requiredTerms((t.doc.dimensions[dim] || {}).required);
  const out = { applicable: false, anyOf: null, named: [] };
  for (const term of terms) {
    const [form, arg] = [term.slice(0, term.indexOf(':') < 0 ? term.length : term.indexOf(':')), term.slice(term.indexOf(':') + 1)];
    if (form === 'always') out.applicable = true;
    else if (form === 'byClass') { if (memberOf(row, arg, t.env)) out.applicable = true; }
    else if (form === 'ifPresent') { if (valueOf(t, id, row, arg).known) out.applicable = true; }
    else if (form === 'byEnum') { const [d, v] = arg.split('='); if (valueOf(t, id, row, d).value === v) out.applicable = true; }
    else if (form === 'anyOf') { out.applicable = true; out.anyOf = arg.split(','); }
    else if (form === 'byDigestible' || form === 'byReader') out.named.push(form);
  }
  return out;
}

const knownPart = (t, id, row, item) => {
  const [d, col] = item.split('.');
  const r = valueOf(t, id, row, d);
  if (!r.known) return false;
  if (col === undefined) return true;
  return isObj(r.value) && r.value[col] !== undefined && r.value[col] !== null;
};

// L3：required 策略、实体行 basis、映射键集（§1.6 第 4 项）；同时累计 known / applicable。
export function checkRequired(t, env, err, stats) {
  const { doc, kind, file } = t;
  const dims = doc.dimensions || {};
  for (const section of ['rows', 'generated']) {
    const rows = isObj(doc[section]) ? doc[section] : {};
    for (const id of Object.keys(rows).sort()) {
      const row = rows[id] || {};
      const at = (dim) => ({ table: kind, row: id, dim, path: `${file}#/${section}/${id}/${dim}` });
      if (section === 'rows' && (typeof row.basis !== 'string' || row.basis === '')) err({ code: 'E-DIM-INSTANCE-BASIS', level: 'L3', ...at('basis'), got: row.basis === undefined ? 'missing' : row.basis, want: 'basis on entity rows' });
      for (const dim of Object.keys(dims).sort()) {
        const req = requirement(t, id, row, dim);
        for (const n of req.named) stats.notCovered.add(`${kind}.${dim}:${n}`);
        const r = valueOf(t, id, row, dim);
        if (r.known && r.value !== undefined) checkMapKeys(dims[dim], r.value, env, at(dim), err);
        if (!req.applicable) continue;
        stats.applicable++;
        if (r.known) stats.known++;
        if (req.anyOf) {
          if (!req.anyOf.some((item) => knownPart(t, id, row, item))) for (const item of req.anyOf) err({ code: 'E-DIM-REQUIRED-MISSING', level: 'L3', ...at(item.split('.')[0]), got: 'unknown', want: `at least one of ${req.anyOf.join(',')}` });
        } else if (!r.known) err({ code: 'E-DIM-REQUIRED-MISSING', level: 'L3', ...at(dim), got: 'unknown', want: `required ${dims[dim].required}` });
      }
    }
  }
}

// 未标 combine: sum 的映射展平后须覆盖键类型的全族；onUnknown 为 error 时缺键即加载失败（§1.6 第 4 项）。
function checkMapKeys(def, v, env, at, err) {
  if (def.type !== 'map' || def.combine === 'sum' || def.onUnknown !== 'error' || !isObj(v) || !isObj(def.key)) return;
  const k = def.key;
  const fam = k.vocab !== undefined ? k.vocab : undefined;
  let all = [];
  if (typeof fam === 'string' && env.vocab.families.has(fam)) all = Object.keys(env.vocab.families.get(fam).entries);
  else if (k.kind !== undefined) all = [...env.idIndex].filter(([, kd]) => kd === k.kind).map(([id]) => id);
  const missing = all.filter((x) => !Object.hasOwn(v, x) && CODE_RE.test(x)).sort();
  if (missing.length) err({ code: 'E-DIM-MAP-SPARSE-NONSUM', level: 'L3', ...at, got: `missing ${missing.join(',')}`, want: 'every key of the family (write null for none)' });
}
