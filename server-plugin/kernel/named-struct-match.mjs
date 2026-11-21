// 命名 struct 登记的读法与值校验（叶子文件，0 import；卷二 §1.5 :252）：加载期类型校验（validate/types.mjs、dimensions-validate.mjs）与运行期
// （named-structs.mjs 的 isPosValue、dimension-writers 的写入口核值）共用这一份，字段名与类型只在 world/ontology/named-structs.json，本文件不手抄。
// 类型串按登记表自己的文法只认本卡用到的两类：integer 开头按安全整数判、恰为 boolean 按布尔判；其他类型串不认，值一律不合。
// 放在叶子文件里是为了不把 errors.mjs 等一串模块拉进校验器 import 闭包（判据指纹与门禁临时仓库都按闭包算）。

const S = Object.freeze({ structKey: 'struct', rowsKey: 'rows', nameKey: 'name', typeKey: 'type', integerPrefix: 'integer', booleanType: 'boolean' });

/**
 * 命名 struct 登记表里一行的字段表（登记文档解析结果、struct 名）；没有该行或没有 struct 为 null。加载期校验在登记装入之前就要用，所以不经模块状态。
 * @param {{rows?: any[]} | undefined} doc @param {string} name 如 struct:pos @returns {Readonly<Record<string, string>> | null}
 */
export function namedStructFieldsOf(doc, name) {
  const rows = doc && Array.isArray(doc[S.rowsKey]) ? doc[S.rowsKey] : [];
  const row = rows.find((r) => r && r[S.nameKey] === name);
  const type = row && row[S.typeKey] && typeof row[S.typeKey] === 'object' ? row[S.typeKey] : null;
  const struct = type && type[S.structKey] && typeof type[S.structKey] === 'object' ? type[S.structKey] : null;
  return struct ? Object.freeze({ ...struct }) : null;
}

/**
 * 登记文档里全部带 struct 字段表的命名 struct（名 → 字段表）。加载期校验（env.namedStructs）与运行期装入共用。
 * @param {{rows?: any[]} | undefined} doc @returns {Map<string, Readonly<Record<string, string>>>}
 */
export function namedStructMapOf(doc) {
  const rows = doc && Array.isArray(doc[S.rowsKey]) ? doc[S.rowsKey] : [];
  const out = new Map();
  for (const r of rows) {
    if (!r || typeof r[S.nameKey] !== 'string') continue;
    const f = namedStructFieldsOf(doc, r[S.nameKey]);
    if (f !== null) out.set(r[S.nameKey], f);
  }
  return out;
}

/**
 * 值是否合一个命名 struct 的字段表：对象、键集与字段表完全一致（不多不少），每个字段按登记的类型串判；类型串不认则不合。
 * 不按字段名或场景开分支：字段名与类型都只从登记读。
 * @param {Readonly<Record<string, string>>} fields @param {unknown} v @returns {boolean}
 */
export function matchStruct(fields, v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const want = Object.keys(fields);
  const got = Object.keys(v);
  if (got.length !== want.length) return false;
  for (const key of got) if (!Object.hasOwn(fields, key)) return false;
  for (const [key, spec] of Object.entries(fields)) {
    if (typeof spec !== 'string') return false;
    if (spec.startsWith(S.integerPrefix)) {
      if (!Number.isSafeInteger(v[key])) return false;
    } else if (spec === S.booleanType) {
      if (typeof v[key] !== 'boolean') return false;
    } else {
      return false;
    }
  }
  return true;
}
