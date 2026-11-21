// 命名 struct 登记装入与 struct:pos 形状校验（卷二 §1.5 :252）：pos 的字段表从 world/ontology/named-structs.json
// 的 struct:pos 行派生，本文件不手抄字段名与类型（docs/问题.md G1 记账：跨卷共用定义只一处，跨卷勘误只改登记）。
// 字段表读法与值校验在叶子文件 named-struct-match.mjs（加载期类型校验共用）；本文件管运行期装入的登记与 isPosValue。
import { KernelError } from './errors.mjs';
import { namedStructFieldsOf, namedStructMapOf, matchStruct } from './named-struct-match.mjs';

export { namedStructFieldsOf, namedStructMapOf, matchStruct };

const POS_NAME = 'struct:pos';

/** 已装入的 struct:pos 字段表（字段名 → 类型串，冻结）；未装入为 null。@type {Readonly<Record<string, string>> | null} */
let posFields = null;
/** 已装入的全部命名 struct（名 → 字段表）；运行期写入口核值用（表头 `named` 引用）。@type {Map<string, Readonly<Record<string, string>>>} */
let installed = new Map();

/**
 * 装入命名 struct 登记（加载器在全部校验通过后调一次）：struct:pos 一行单独留作 posStructFields，全部带字段表的行进 installedNamedStructs。
 * struct:pos 行不存在时置空，运行时由 posStructFields 拒收（不给缺省）。
 * @param {{rows?: any[]} | undefined} doc world/ontology/named-structs.json 的解析结果
 */
export function installNamedStructs(doc) {
  posFields = namedStructFieldsOf(doc, POS_NAME);
  installed = namedStructMapOf(doc);
}

/** @returns {Map<string, Readonly<Record<string, string>>>} 已装入登记的拷贝 */
export const installedNamedStructs = () => new Map(installed);

/**
 * 已装入的 struct:pos 字段表（冻结）；未装入即抛 E-DIM-STRUCT-FIELD，不给缺省。
 * @returns {Readonly<Record<string, string>>}
 */
export function posStructFields() {
  if (!posFields) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'named struct struct:pos not installed');
  return posFields;
}

/**
 * payload.pos 的形状核对：对象、键集与登记字段完全一致（不多不少），每个字段按登记的类型串判（integer 开头安全整数，boolean 布尔，其他类型串不合）。
 * @param {unknown} v
 * @returns {boolean}
 */
export function isPosValue(v) {
  return matchStruct(posStructFields(), v);
}
