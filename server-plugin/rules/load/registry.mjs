// 实体登记构造 buildRegistry（S1-1 卡 A；卷二 §1.9 :283"kind 只由加载期注册表给出"）。
// 收已读入的维度表文档（读文件在 index.mjs，不在 kernel），产出冻结的 {idIndex, kindIds, tables}：
//   idIndex: Map<id, kind>（实体行键 → kind）；kindIds: Map<kind, {idPrefix, singletonIds}>；tables: Map<kind, 维度表文档>。
// 构造时核：前缀/单例 id 各表互斥、rows 的键带本表 idPrefix（或在 singletonIds 里）；违者抛 KernelError。
// 只按表头登记数据判，不认任何具体 kind、前缀或 id。

import { KernelError } from '../../kernel/errors.mjs';

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
