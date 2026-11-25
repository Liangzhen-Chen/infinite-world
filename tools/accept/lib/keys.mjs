// 维度键、修正键的解析与核对（卷二 §2.8、§3.1），以及规则表文件路径文法（卷二 §4.1）。
// 收编自 server-plugin/kernel/handles/keys.mjs（L-15）：门禁只搬它真用到的函数
// （parseDimKey、modKeyOf、isRuleTableFile）及其内部判据，其余内核键工具留在归档里。

import { HandleError } from '../../../server-plugin/kernel/handles.mjs';
import { T, CODE_RE, KEY_RE, CODE_BODY, KEY_BODY } from '../../../server-plugin/kernel/validate/types.mjs';

/**
 * @typedef {{tableDims: Map<string, Record<string, any>>, idIndex: Map<string, string>, vocabIndex: Map<string, {family: string}>}} KeyRegistry
 */

// 维度键文法（§2.8 第 1 条 DimKey；§5.0 下标键语法 :1586）：kind、dimension 嵌入代号文法与键文法的正则体。
const DIM_KEY_RE = new RegExp(`^(${CODE_BODY})\\.(${KEY_BODY})(?:\\[([^[\\]]+)\\])?$`);
const DECIMAL_RE = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/;

// 下标是否合该 map 维度的键定义：数值键收有限数；代号键按键定义的族或 kind 查注册表，没写族与 kind 的查 idIndex 或词表。
function subKeyOk(reg, keyDef, key) {
  const kd = keyDef && typeof keyDef === 'object' ? keyDef : {};
  if (typeof key === 'number') return Number.isFinite(key) && (kd.type === T.type.number || kd.type === T.type.integer);
  if (typeof key !== 'string' || !CODE_RE.test(key)) return false;
  const fam = kd.vocab !== undefined ? kd.vocab : (kd.domain && typeof kd.domain === 'object' ? kd.domain.vocab : undefined);
  if (fam !== undefined) return reg.vocabIndex.has(key) && reg.vocabIndex.get(key).family === fam;
  if (kd.kind !== undefined) return reg.idIndex.get(key) === kd.kind;
  if (Array.isArray(kd.kinds)) return kd.kinds.includes(reg.idIndex.get(key));
  return reg.idIndex.has(key) || reg.vocabIndex.has(key);
}

// 共用：查表头，返回维度定义；未登记交调用方按各自的码报。
function dimDef(reg, kind, dimension) {
  if (typeof kind !== 'string' || !CODE_RE.test(kind)) throw new HandleError('E-DIM-ID-FORMAT', `kind ${JSON.stringify(kind)}: want ${CODE_RE.source}`);
  if (typeof dimension !== 'string' || !KEY_RE.test(dimension)) throw new HandleError('E-DIM-ID-FORMAT', `dimension ${JSON.stringify(dimension)}: want ${KEY_RE.source}`);
  const dims = reg.tableDims.get(kind);
  return dims && Object.hasOwn(dims, dimension) ? dims[dimension] : undefined;
}

function join(kind, dimension, key) {
  return key === undefined ? `${kind}.${dimension}` : `${kind}.${dimension}[${key}]`;
}

/**
 * 拼 DimKey（§5.0 :1586）：kind 有维度表、dimension 在其表头；带下标时该维必须是 map，下标合其键定义。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 */
export function dimKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  if (!def) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension)}: dimension not registered`);
  if (key !== undefined && (def.type !== T.type.map || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of a map dimension`);
  return join(kind, dimension, key);
}

/**
 * 拼 ModKey（§3.1）：`modifiable:true` 的 number/integer/map<…,number> 维度即修正键。
 * @param {KeyRegistry} reg @param {string} kind @param {string} dimension @param {string|number} [key]
 */
export function modKeyOf(reg, kind, dimension, key) {
  const def = dimDef(reg, kind, dimension);
  const valueType = def && def.type === T.type.map ? (def.value || {}).type : def && def.type;
  if (!def || def.modifiable !== true || !(valueType === T.type.number || valueType === T.type.integer)) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension, key)}: not a modifiable number/integer/map<...,number> dimension`);
  if (def.type === T.type.map && key === undefined) throw new HandleError('E-MOD-KEY-UNREGISTERED', `${join(kind, dimension)}: map dimension needs a subscript`);
  if (key !== undefined && (def.type !== T.type.map || !subKeyOk(reg, def.key, key))) throw new HandleError('E-DIM-REF-MISSING', `${join(kind, dimension, key)}: subscript not a key of the map dimension`);
  return join(kind, dimension, key);
}

/**
 * 解析 DimKey 字串（§5.0 :1586），拆完按 dimKeyOf 同一套核对。
 * @param {KeyRegistry} reg @param {string} text
 */
export function parseDimKey(reg, text) {
  const m = typeof text === 'string' ? DIM_KEY_RE.exec(text) : null;
  if (!m) throw new HandleError('E-DIM-ID-FORMAT', `dim key ${JSON.stringify(text)}: want <kind>.<dimension>[<key>]`);
  const [, kind, dimension, raw] = m;
  const def = dimDef(reg, kind, dimension);
  const keyType = def && def.type === T.type.map ? (def.key || {}).type : undefined;
  const numericKey = keyType === T.type.number || keyType === T.type.integer;
  const sub = raw === undefined ? undefined : (numericKey && DECIMAL_RE.test(raw) ? Number(raw) : raw);
  return { key: dimKeyOf(reg, kind, dimension, sub), kind, dimension, sub };
}

// 相对 world/rules/ 的规则表文件路径（一段或多段目录 + .json）。
const RULE_TABLE_FILE = /^(?:[a-z0-9][a-z0-9_-]*\/)*[a-z0-9][a-z0-9_-]*\.json$/;
/** @param {unknown} s @returns {boolean} */
export const isRuleTableFile = (s) => typeof s === 'string' &&RULE_TABLE_FILE.test(s);
