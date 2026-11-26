// 实体登记构造 buildRegistry（S1-1 卡 A；卷二 §1.9 :283"kind 只由加载期注册表给出"）。
// 收已读入的维度表文档（读文件在 index.mjs，不在 kernel），产出冻结的 {idIndex, kindIds, tables}：
//   idIndex: Map<id, kind>（实体行键 → kind）；kindIds: Map<kind, {idPrefix, singletonIds}>；tables: Map<kind, 维度表文档>。
// 构造时核：前缀/单例 id 各表互斥、rows 的键带本表 idPrefix（或在 singletonIds 里）；违者抛 KernelError。
// 只按表头登记数据判，不认任何具体 kind、前缀或 id。
// 另有 loadWorld（S1-1 卡 C）：世界数据按 registry.json 登记组装与核对，kernel 消费的键表按登记声明取值。

import { KernelError } from '../../kernel/errors.mjs';
import { checkValue } from '../../kernel/validate/types.mjs';

/** @typedef {{kind?: unknown, entity?: {idPrefix?: unknown, singletonIds?: unknown}, rows?: unknown, dimensions?: unknown}} DimensionDoc */

/**
 * @param {Array<DimensionDoc>} dimensionDocs 已读入的维度表文档（跳过下划线开头的元表由调用方做）
 * @returns {Readonly<{idIndex: Map<string, string>, kindIds: Map<string, Readonly<{idPrefix: readonly string[], singletonIds: readonly string[]}>>, tables: Map<string, DimensionDoc>, kindOfLoaded: (id: string) => string | undefined, hasLoaded: (id: string) => boolean}>}
 */
export function buildRegistry(dimensionDocs) {
  if (!Array.isArray(dimensionDocs)) throw new KernelError('E-DIM-SCHEMA-KIND', {}, 'buildRegistry: dimension docs must be an array');
  /** @type {Map<string, string>} */
  const idIndex = new Map();
  /** @type {Map<string, Readonly<{idPrefix: readonly string[], singletonIds: readonly string[]}>>} */
  const kindIds = new Map();
  /** @type {Map<string, DimensionDoc>} */
  const tables = new Map();
  /** @type {Map<string, string>} */
  const prefixOwner = new Map();
  for (const doc of dimensionDocs) {
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new KernelError('E-DIM-SCHEMA-KIND', {}, 'buildRegistry: a dimension doc must be an object');
    const kind = doc.kind;
    if (typeof kind !== 'string' || kind === '') throw new KernelError('E-DIM-SCHEMA-KIND', {}, 'buildRegistry: dimension doc has no kind');
    if (kindIds.has(kind)) throw new KernelError('E-DIM-ID-DUPLICATE', { entity: kind }, `buildRegistry: kind ${kind} appears twice`);
    const entity = doc.entity !== null && typeof doc.entity === 'object' ? doc.entity : {};
    const idPrefix = Array.isArray(entity.idPrefix) ? [...entity.idPrefix] : [];
    const singletonIds = Array.isArray(entity.singletonIds) ? [...entity.singletonIds] : [];
    // 前缀与单例 id 各表互斥：同一个字串只能属于一个 kind（运行期 kindOfEntity 才能只按字串认表）。
    for (const p of [...idPrefix, ...singletonIds]) {
      if (prefixOwner.has(p)) throw new KernelError('E-DIM-ID-DUPLICATE', { entity: p }, `buildRegistry: ${p} belongs to both ${prefixOwner.get(p)} and ${kind}`);
      prefixOwner.set(p, kind);
    }
    kindIds.set(kind, Object.freeze({ idPrefix: Object.freeze(idPrefix), singletonIds: Object.freeze(singletonIds) }));
    tables.set(kind, doc);
    const rows = doc.rows !== null && typeof doc.rows === 'object' && !Array.isArray(doc.rows) ? doc.rows : {};
    for (const id of Object.keys(rows)) {
      if (!idPrefix.some((p) => id.startsWith(p)) && !singletonIds.includes(id)) {
        throw new KernelError('E-DIM-ID-FORMAT', { entity: id }, `buildRegistry: row key ${id} does not carry a prefix of kind ${kind}`);
      }
      if (idIndex.has(id)) throw new KernelError('E-DIM-ID-DUPLICATE', { entity: id }, `buildRegistry: row key ${id} appears in more than one table`);
      idIndex.set(id, kind);
    }
  }
  // id → kind 的取值只经这两个冻结函数交给调用方（加载器外禁直查 idIndex.get；docs/gemini/kickoff-1125.md:64）。
  const kindOfLoaded = Object.freeze((id) => idIndex.get(id));
  const hasLoaded = Object.freeze((id) => idIndex.has(id));
  return Object.freeze({ idIndex, kindIds, tables, kindOfLoaded, hasLoaded });
}

/** registry.json 的一行（只列本文件用到的字段）。 @typedef {{code: string, file: string, type?: Record<string, unknown>, domain?: Record<string, unknown>}} RegistryRow */
/** 键表的一行。 @typedef {{key: string, value?: unknown}} KeyRow */

/**
 * 取键表（structure "keys"）一键的值并按登记声明核（卷二十七 :190：缺行或不合取值域即加载失败）。声明来自 registry.json 的该表登记行
 * （type[key] 给类型与单位，domain[key] 给取值域）；判定交公共部件 validate/types.mjs#checkValue，不另写一份。
 * @param {KeyRow[] | undefined} rows @param {RegistryRow} spec registry.json 的该表登记行 @param {string} key @returns {unknown}
 */
function tableValue(rows, spec, key) {
  const fail = (/** @type {string} */ why) => new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${spec.code}.${key}: ${why}`);
  const decl = spec.type ? spec.type[key] : undefined;
  if (decl === undefined) throw fail('no registry declaration');
  const row = Array.isArray(rows) ? rows.find((r) => r.key === key) : undefined;
  if (!row || !Object.hasOwn(row, 'value')) throw fail('row missing');
  const def = { ...(typeof decl === 'string' ? { type: decl } : Object(decl)), nullable: false, domain: spec.domain ? spec.domain[key] : undefined };
  /** @type {unknown[]} */
  const bad = [];
  checkValue(def, row.value, {}, {}, (e) => { bad.push(e); });
  if (bad.length > 0) throw fail(`${JSON.stringify(row.value)} violates ${Object(bad[0]).want}`);
  return row.value;
}

/**
 * 键表按登记的全部键取值（键集合来自登记行 type，不在代码里列）；该代号没有登记行或登记行无 type 即 E-DIM-DOMAIN-RANGE（不当成零个键）。
 * @param {string} code @param {KeyRow[] | undefined} rows @param {RegistryRow | undefined} spec @returns {Readonly<Record<string, unknown>>}
 */
function tableValues(code, rows, spec) {
  if (!spec || spec.type === null || typeof spec.type !== 'object') throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${code}: no registry declaration`);
  return Object.freeze(Object.fromEntries(Object.keys(spec.type).map((k) => [k, tableValue(rows, spec, k)])));
}

/**
 * 规则表单键取值（S1-2a 起）：从世界数据副本 raw（= doc_data）取登记代号 code 那张键表的 key 一键，按登记声明核（同 tableValue，不另写一份）。
 * 给只读整表中个别键的规则模块用（整表含 ref 等要词表环境的键时不能整表核）；代号未登记即 E-DIM-DOMAIN-RANGE。
 * @param {{registryRows: RegistryRow[], tableDocs: Record<string, {rows?: KeyRow[]}>}} raw @param {string} code @param {string} key @returns {unknown}
 */
export function ruleValue(raw, code, key) {
  const spec = raw.registryRows.find((r) => r.code === code);
  if (!spec) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `rules.${code}: no registry declaration`);
  return tableValue(Object.hasOwn(raw.tableDocs, code) ? raw.tableDocs[code].rows : undefined, spec, key);
}

// kernel 实际消费的规则表代号（卷文名 rules.host.*、rules.saveLayout.*；S1-1c 派卡「主会话已定」第 5 条；S1-2b 加 rules.kernelConstants：定点常数由装配层装入 det-math）：
// 只对这几张整表取值并按登记声明核；规则层按键读的经 ruleValue 逐键核；其余登记表原样进 doc_data 副本，不核、不报。
const KERNEL_TABLES = Object.freeze(['host', 'saveLayout', 'kernelConstants']);

/**
 * 世界数据按登记组装与核对（S1-1 卡 C；卷二十七 :547 开局冻结规则表副本）。收装配层已读入、已解析的原文 raw（整份即 doc_data），不读盘：
 *   raw = {dimensionDocs, namedStructsDoc, owners, registryRows, tableDocs: {<登记 code>: 表原文}, digestExclude, primitivesDoc}
 * 核：tableDocs 的代号集合须与 registryRows 的 code 集合恰好相等（登记的每张表都进副本、副本里没有未登记的表），不合 E-DIM-STRUCT-FIELD；
 * 维度表交 buildRegistry；kernel 消费的键表按登记逐键核。返回 {registry, rules}（rules: 代号 → 已核键值；规则层按键读经导出的 ruleValue），其余字段调用方从 raw 原样取。
 * @param {{dimensionDocs: DimensionDoc[], registryRows: RegistryRow[], tableDocs: Record<string, {rows?: KeyRow[]}>}} raw 形状仍逐项在运行期核（来自盘上数据）
 */
export function loadWorld(raw) {
  if (raw === null || typeof raw !== 'object') throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'loadWorld: world data must be an object');
  const { dimensionDocs, registryRows: rows, tableDocs: docs } = raw;
  if (!Array.isArray(rows) || docs === null || typeof docs !== 'object') {
    throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'loadWorld: registryRows must be an array and tableDocs an object');
  }
  const codes = rows.map((r) => (r !== null && typeof r === 'object' ? r.code : undefined));
  const same = codes.length === Object.keys(docs).length && codes.every((c) => typeof c === 'string' && Object.hasOwn(docs, c)) && new Set(codes).size === codes.length;
  if (!same) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'loadWorld: tableDocs must hold exactly one table per registry row code');
  const rules = Object.freeze(Object.fromEntries(KERNEL_TABLES.map((code) => [code, tableValues(code, Object.hasOwn(docs, code) ? docs[code].rows : undefined, rows.find((r) => r.code === code))])));
  return Object.freeze({ registry: buildRegistry(dimensionDocs), rules });
}
