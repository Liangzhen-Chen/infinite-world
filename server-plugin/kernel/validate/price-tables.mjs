// 价格用途行（词表族 `puse`）的加载期跨字段校验（卷六《经济》§2.2 :144 条目字段、§4.21.1 :1191、§4.21.3 规则 2、10；块 6 第 6-9 张）。
// 每条用途行：role 是 prole 族条目、frame 是 puse_frame 族条目、basisRule 是 puse_basis 族条目、includesScarcity 是布尔、liquidationCurveKey 与 subjectCtx 是字串或 null；
// 各字段必写、不设缺省（卷六 §2.2）。急售折价曲线键所指的 market.liquidationCurve 表本卡不建（卷六 §4.2 登记，随 6-12），键只核形状，不核所指。
// 不认任何用途、角色代号：字段的取值族名与字段名是本文件读卷六 §2.2 的固定记号。

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 用途行字段与它指向的族（卷六 §2.2 :144）；族名取自该行的定义字面。
const FAMILY = Object.freeze({ puse: 'puse', role: 'prole', frame: 'puse_frame', basis: 'puse_basis' });
const FIELD = Object.freeze({ role: 'role', frame: 'frame', basisRule: 'basisRule', includesScarcity: 'includesScarcity', liquidationCurveKey: 'liquidationCurveKey', subjectCtx: 'subjectCtx' });
// 条目上允许另带的文档字段（各词表族条目都可写 basis 记出处）。
const DOC_FIELD = Object.freeze({ basis: 'basis' });

/**
 * @param {{vocab: any}} view 加载结果的词表（families、index）
 * @returns {string[]} "<码> <所在> <说明>" 文字行
 */
export function checkPriceTables(view) {
  const errors = [];
  const fams = view.vocab && view.vocab.families instanceof Map ? view.vocab.families : new Map();
  const puse = fams.get(FAMILY.puse);
  if (!puse) return errors;
  const entriesOf = (name) => (fams.get(name) ? new Set(Object.keys(fams.get(name).entries)) : new Set());
  const roles = entriesOf(FAMILY.role);
  const frames = entriesOf(FAMILY.frame);
  const bases = entriesOf(FAMILY.basis);
  for (const code of Object.keys(puse.entries).sort(cmp)) {
    const row = puse.entries[code];
    const at = `puse ${code}`;
    if (!isObj(row)) { errors.push(`E-DIM-STRUCT-FIELD ${at}: entry is an object`); continue; }
    for (const f of Object.values(FIELD)) if (!Object.hasOwn(row, f)) errors.push(`E-DIM-REQUIRED-MISSING ${at}: field ${f} is required (no default, vol6 s2.2)`);
    for (const f of Object.keys(row).sort(cmp)) if (!Object.values(FIELD).includes(f) && !Object.values(DOC_FIELD).includes(f)) errors.push(`E-DIM-STRUCT-FIELD ${at}: unknown field ${f}`);
    if (Object.hasOwn(row, FIELD.role) && !roles.has(row.role)) errors.push(`E-DIM-REF-MISSING ${at}: role ${String(row.role)} is not a ${FAMILY.role} entry`);
    if (Object.hasOwn(row, FIELD.frame) && !frames.has(row.frame)) errors.push(`E-DIM-REF-MISSING ${at}: frame ${String(row.frame)} is not a ${FAMILY.frame} entry`);
    if (Object.hasOwn(row, FIELD.basisRule) && !bases.has(row.basisRule)) errors.push(`E-DIM-REF-MISSING ${at}: basisRule ${String(row.basisRule)} is not a ${FAMILY.basis} entry`);
    if (Object.hasOwn(row, FIELD.includesScarcity) && typeof row.includesScarcity !== 'boolean') errors.push(`E-DIM-STRUCT-FIELD ${at}: includesScarcity is a boolean`);
    for (const f of [FIELD.liquidationCurveKey, FIELD.subjectCtx]) {
      if (Object.hasOwn(row, f) && row[f] !== null && typeof row[f] !== 'string') errors.push(`E-DIM-STRUCT-FIELD ${at}: ${f} is a string or null`);
    }
  }
  return errors;
}
