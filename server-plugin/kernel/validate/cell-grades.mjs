// 行上逐格来源级别（卷三甲 §2.1"物性格的来源级别"、M-22；定义卷是卷三甲，卷二 §1.7 并列收录）。
// 表头 cellGrades = {field, refDim} 的表：每一行（类别行、实体行、生成行）上必写文档字段 field，
// 类型 map<格键, {grade: cell_grade, citation: string|null, basis: string|null}>，键集合等于本行填了值的格集合。
// 格的划分只按维度类型：数值、整数、布尔各一格（键 = 维度键）；struct 逐字段一格、map 逐键一格（键 = 维度键.子键），
// 子值为数值或布尔才算；引用代号、集合、写 null 的格不带级别；派生维度不在行上。规则层与校验都不读 citation、basis 的文字。
// 只按表头声明通用处理，不认表名。

import { CODE_ENUMS, T } from './types.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const scalar = (v) => typeof v === 'number' || typeof v === 'boolean';
// 卷三甲 §2.1 物性格单元格声明的两个字段名与表文件节名（§1.7）：单一定义，比较处引用。
const GRADE_FIELD = Object.freeze({ field: 'field', refDim: 'refDim' });
const SEG = Object.freeze({ empty: '' });
const SECTION = Object.freeze({ classes: 'classes' });
const GRADE_KEYS = ['basis', 'citation', 'grade'];
// 表里写物性格的各节：类别行（卷二 §6.2，类别的物性格同样带级别）、手写实体行、生成行。
const SECTIONS = ['classes', 'rows', 'generated'];

/** @param {Record<string, unknown>} doc 维度表文件 */
export const gradeDecl = (doc) => {
  const d = isObj(doc.cellGrades) ? doc.cellGrades : null;
  return d && typeof d.field === 'string' ? d : null;
};

// 一行（展平后）填了值的格：Map<格键, 值>。
/** @param {Record<string, unknown>} dims 表头维度 @param {Record<string, unknown>} flatRow 展平后的行 */
export function gradedCells(dims, flatRow) {
  const out = new Map();
  for (const dim of Object.keys(dims).sort()) {
    const def = dims[dim];
    const v = flatRow[dim];
    if (v === undefined || v === null || def.derived !== undefined) continue;
    if (def.type === T.type.number || def.type === T.type.integer || def.type === T.type.boolean) { if (scalar(v)) out.set(dim, v); continue; }
    if ((def.type === T.type.struct || def.type === T.type.map) && isObj(v)) for (const k of Object.keys(v).sort()) if (scalar(v[k])) out.set(`${dim}.${k}`, v[k]);
  }
  return out;
}

// 表头写了 cellGrades 却不是 {field: string, refDim?: string}（多余键也算）：声明本身错，报 E-DIM-STRUCT-FIELD，不静默当作没声明。
function declShapeOk(d) {
  return isObj(d) && typeof d.field === 'string' && d.field !== SEG.empty && (d.refDim === undefined || typeof d.refDim === 'string') && Object.keys(d).every((k) => k === GRADE_FIELD.field || k === GRADE_FIELD.refDim);
}

/** @param {Record<string, unknown>} t 一张表 @param {(...args: unknown[]) => void} err */
export function checkCellGrades(t, err) {
  const raw = t.doc.cellGrades;
  if (raw !== undefined && !declShapeOk(raw)) {
    err({ code: 'E-DIM-STRUCT-FIELD', level: 'L1', table: t.kind, row: '', dim: 'cellGrades', path: `${t.file}#/cellGrades`, got: isObj(raw) ? Object.keys(raw).sort().join(',') : raw, want: '{field, refDim?}' });
    return;
  }
  const decl = gradeDecl(t.doc);
  if (!decl) return;
  const { doc, kind, file } = t;
  const dims = doc.dimensions || {};
  const gradesOf = new Map();
  for (const section of SECTIONS) for (const id of Object.keys(isObj(doc[section]) ? doc[section] : {})) gradesOf.set(id, { section, g: (doc[section][id] || {})[decl.field] });
  const flatOf = (id) => (gradesOf.has(id) && gradesOf.get(id).section === SECTION.classes ? t.flat.classes.get(id) : t.flat.rows.get(id)) || {};
  for (const [id, { section, g }] of [...gradesOf].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const at = (cell) => ({ table: kind, row: id, dim: cell ? `${decl.field}.${cell}` : decl.field, path: `${file}#/${section}/${id}/${decl.field}${cell ? '/' + cell : ''}` });
    const flat = flatOf(id);
    const cells = gradedCells(dims, flat);
    if (!isObj(g)) { err({ code: 'E-MAT-GRADE-KEYS', level: 'L3', ...at(), got: g === undefined ? 'missing' : typeof g, want: `${decl.field} map over the row's filled cells` }); continue; }
    const extra = Object.keys(g).filter((k) => !cells.has(k)).sort();
    const missing = [...cells.keys()].filter((k) => !Object.hasOwn(g, k));
    if (extra.length || missing.length) err({ code: 'E-MAT-GRADE-KEYS', level: 'L3', ...at(), got: `missing ${missing.join(',') || '-'}; extra ${extra.join(',') || '-'}`, want: 'keys equal to the filled cells' });
    let referenced = 0;
    for (const k of Object.keys(g).sort()) {
      const e = g[k];
      const bad = (got, want) => err({ code: 'E-MAT-GRADE-FIELD', level: 'L3', ...at(k), got, want });
      if (!isObj(e) || Object.keys(e).sort().join(',') !== GRADE_KEYS.join(',')) { bad(isObj(e) ? Object.keys(e).sort().join(',') : e, GRADE_KEYS.join(',')); continue; }
      if (!CODE_ENUMS.cell_grade.includes(e.grade)) { bad(e.grade, CODE_ENUMS.cell_grade.join('|')); continue; }
      if (![e.citation, e.basis].every((x) => x === null || typeof x === 'string')) { bad('non-string text', 'citation, basis string or null'); continue; }
      if (e.grade === T.code_enum.cell_grade.measured && !e.citation) bad('measured without citation', 'citation');
      if (e.grade === T.code_enum.cell_grade.designed && !e.basis) bad('designed without basis', 'basis');
      if (e.grade !== T.code_enum.cell_grade.referenced || !cells.has(k)) continue;
      referenced++;
      const ref = decl.refDim === undefined ? null : flat[decl.refDim];
      const target = typeof ref === 'string' && gradesOf.has(ref) ? gradesOf.get(ref).g : undefined;
      const tg = isObj(target) ? target[k] : undefined;
      const tv = gradedCells(dims, flatOf(ref)).get(k);
      if (typeof ref !== 'string') err({ code: 'E-MAT-GRADE-REF', level: 'L3', ...at(k), got: ref === undefined ? 'missing' : ref, want: `${decl.refDim} naming the reference row` });
      else if (!gradesOf.has(ref)) err({ code: 'E-MAT-GRADE-REF', level: 'L3', ...at(k), got: ref, want: 'existing reference row' });
      else if (!isObj(tg) || tg.grade !== T.code_enum.cell_grade.measured) err({ code: 'E-MAT-GRADE-REF', level: 'L3', ...at(k), got: isObj(tg) ? tg.grade : 'ungraded', want: `measured cell on ${ref}` });
      else if (tv !== cells.get(k)) err({ code: 'E-MAT-GRADE-REF', level: 'L3', ...at(k), got: `${cells.get(k)} vs ${tv}`, want: `value equal to ${ref}` });
    }
    if (decl.refDim !== undefined && typeof flat[decl.refDim] === 'string' && referenced === 0) err({ code: 'W-MAT-REF-UNUSED', level: 'L3', ...at(), got: flat[decl.refDim], want: `a referenced cell when ${decl.refDim} is set` });
  }
}
