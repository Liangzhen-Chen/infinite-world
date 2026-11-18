// kernelApi 对外入口 `vocab`、`kindOf`、`idIndex`（卷二 §2.7 kernelApi :604–606；§2.1 横切入口 :436；§1.9 :283"kind 只由加载期注册表给出"）。
// 不重写加载：词表索引来自 kernel/load/vocab-load.mjs 的 loadVocab，idIndex 与维度表头来自维度校验的加载结果；本文件只收下并冻结。
// 只按登记数据查，不解析 id 字串、不认任何具体族或 kind。

import { clone } from './clone.mjs';
import { handleOf, HandleError } from './handles/vocab-handle.mjs';
import { T } from './handles/markers.mjs';

/**
 * @typedef {{families: Map<string, {name: string, prefix: string, closed: boolean, entries: Record<string, any>}>, index: Map<string, {family: string, prefix: string, entry: any}>}} VocabIndex
 * loadVocab 的返回值（只用到 families 与 index）。
 */

/** @type {null | {vocab: VocabIndex, vocabIndex: VocabIndex['index'], idIndex: Map<string, string>, tableDims: Map<string, Record<string, any>>, kindIds: Map<string, {idPrefix: string[], singletonIds: string[]}>}} */
let installed = null;

const deepFreeze = (v) => {
  if (v && typeof v === T.js_type.object && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
};

/**
 * 加载期收下注册表（加载入口在维度校验通过后调一次）。参数是 validateDimensions / loadWorld 的返回值：
 * `vocab`（loadVocab 结果）、`idIndex`（实体 id → kind）、`tables`（kind → {doc}，取表头 dimensions 与 entity 的 idPrefix、singletonIds）。
 * @param {{vocab: VocabIndex, idIndex: Map<string, string>, tables: Map<string, {doc: any}>}} report
 */
export function installVocab(report) {
  const tableDims = new Map();
  const kindIds = new Map();
  for (const [kind, t] of [...report.tables].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const doc = t.doc || {};
    const entity = doc.entity && typeof doc.entity === T.js_type.object ? doc.entity : {};
    tableDims.set(kind, deepFreeze(clone(doc.dimensions || {})));
    kindIds.set(kind, deepFreeze({
      idPrefix: Array.isArray(entity.idPrefix) ? [...entity.idPrefix] : [],
      singletonIds: Array.isArray(entity.singletonIds) ? [...entity.singletonIds] : [],
    }));
  }
  installed = { vocab: report.vocab, vocabIndex: report.vocab.index, idIndex: new Map(report.idIndex), tableDims, kindIds };
}

/** kernel 组内取注册表（entity-id.mjs 用；整个对象也可直接作 keys.mjs 的 KeyRegistry）；加载入口未收下前调用即启动失败。 */
export function registry() {
  if (!installed) throw new Error('kernel/vocab.mjs: registry used before installVocab (load order)');
  return installed;
}

/**
 * 横切入口 `vocab(engine, family, id)`（§2.1 :436）：取词表条目的字段，返回冻结副本。
 * engine.vocab 是加载期 loadVocab 的结果。代号的核对与 V 句柄同一构造函数（vocab-handle.mjs）。
 * @param {{vocab: VocabIndex}} engine @param {string} family @param {string} id
 */
export function vocab(engine, family, id) {
  const h = handleOf(engine.vocab.index, family, id);
  return deepFreeze(clone(engine.vocab.index.get(h).entry || {}));
}

/**
 * `kindOf(id)`（§1.9 :283）：查加载期注册表 idIndex，不解析字串。未登记 E-DIM-REF-MISSING。
 * @param {string} id
 * @returns {string}
 */
export function kindOf(id) {
  const kind = registry().idIndex.get(id);
  if (kind === undefined) throw new HandleError('E-DIM-REF-MISSING', `id ${JSON.stringify(id)}: not in idIndex`);
  return kind;
}

/**
 * `idIndex()`：实体 id → kind 的副本（给 textcore、gate 等非规则组建代号登记表用；§2.9 第 6 条）。改副本不影响注册表。
 * @returns {Map<string, string>}
 */
export function idIndex() {
  return new Map(registry().idIndex);
}
