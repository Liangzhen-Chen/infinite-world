// 命名 struct 登记装入与 struct:pos 形状校验（卷二 §1.5 :252）：pos 的字段表从 world/ontology/named-structs.json
// 的 struct:pos 行派生，本文件不手抄字段名与类型（docs/问题.md G1 记账：跨卷共用定义只一处，跨卷勘误只改登记）。
// 类型串按登记表自己的文法只认本卡用到的两类：integer 开头按安全整数判、恰为 boolean 按布尔判；其他类型串一律拒收。
import { KernelError } from './errors.mjs';

const S = Object.freeze({
  posName: 'struct:pos',
  structKey: 'struct',
  rowsKey: 'rows',
  nameKey: 'name',
  typeKey: 'type',
  integerPrefix: 'integer',
  booleanType: 'boolean',
});

/** 已装入的 struct:pos 字段表（字段名 → 类型串，冻结）；未装入为 null。@type {Readonly<Record<string, string>> | null} */
let posFields = null;

/**
 * 装入选定的命名 struct 登记（加载器在全部校验通过后调一次）：只取 struct:pos 一行的 type.struct。
 * 行不存在或没有 struct 时置空，运行时由 posStructFields 拒收（不给缺省）。
 * @param {{rows?: any[]} | undefined} doc world/ontology/named-structs.json 的解析结果
 */
export function installNamedStructs(doc) {
  const rows = doc && Array.isArray(doc[S.rowsKey]) ? doc[S.rowsKey] : [];
  const row = rows.find((r) => r && r[S.nameKey] === S.posName);
  const type = row && row[S.typeKey] && typeof row[S.typeKey] === 'object' ? row[S.typeKey] : null;
  const struct = type && type[S.structKey] && typeof type[S.structKey] === 'object' ? type[S.structKey] : null;
  posFields = struct ? Object.freeze({ ...struct }) : null;
}

/**
 * 已装入的 struct:pos 字段表（冻结）；未装入即抛 E-DIM-STRUCT-FIELD，不给缺省。
 * @returns {Readonly<Record<string, string>>}
 */
export function posStructFields() {
  if (!posFields) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'named struct struct:pos not installed');
  return posFields;
}

/**
 * payload.pos 的形状核对：对象、键集与登记字段完全一致（不多不少），每个字段按登记的类型串判。
 * integer 开头的类型串要求安全整数，恰为 boolean 的要求布尔；遇到其他类型串抛 E-DIM-STRUCT-FIELD。
 * 不按字段名或场景开分支：字段名与类型都只从装入的登记读。
 * @param {unknown} v
 * @returns {boolean}
 */
export function isPosValue(v) {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return false;
  const fields = posStructFields();
  const want = Object.keys(fields);
  const got = Object.keys(v);
  if (got.length !== want.length) return false;
  for (const key of got) if (!Object.hasOwn(fields, key)) return false;
  for (const [key, spec] of Object.entries(fields)) {
    if (typeof spec !== 'string') throw new KernelError('E-DIM-STRUCT-FIELD', {}, `unsupported struct:pos field type ${String(spec)}`);
    if (spec.startsWith(S.integerPrefix)) {
      if (!Number.isSafeInteger(v[key])) return false;
    } else if (spec === S.booleanType) {
      if (typeof v[key] !== 'boolean') return false;
    } else {
      throw new KernelError('E-DIM-STRUCT-FIELD', {}, `unsupported struct:pos field type ${spec}`);
    }
  }
  return true;
}
