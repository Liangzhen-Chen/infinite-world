// 实体 id 构造函数（卷二 §2.7 kernelApi :603；§2.9 第 2 条强转豁免文件表 entity-id.mjs 行：
// string → EntityId<K>，强转前"按代号正则校验，前缀属该 kind"）。kind 的前缀取维度表表头 entity.idPrefix 与 singletonIds，不认任何具体 kind。
// 按种子键生成新 id（§2.9 第 3 条 noteId、卷十）依赖 §1.10 派生函数与种子键登记，不在本张卡。

import { CODE_RE, HandleError } from './vocab-handle.mjs';
import { registry } from '../vocab.mjs';
import { T } from './markers.mjs';

/**
 * @template {string} K
 * @param {Map<string, {idPrefix: string[], singletonIds: string[]}>} kindIds kind → 表头登记的前缀与单例 id
 * @param {K} kind @param {string} id
 * @returns {import('../types.d.ts').EntityId<K>}
 * 不合代号文法或前缀不属该 kind E-DIM-ID-FORMAT（与加载器 L0 同码）；kind 没有登记 E-DIM-REF-MISSING。
 */
export function entityIdOf(kindIds, kind, id) {
  const reg = kindIds.get(kind);
  if (!reg) throw new HandleError('E-DIM-REF-MISSING', `kind ${JSON.stringify(kind)}: no dimension table registers it`);
  if (typeof id !== T.js_type.string || !CODE_RE.test(id)) throw new HandleError('E-DIM-ID-FORMAT', `id ${JSON.stringify(id)}: want ^[a-z][a-z0-9_]{1,47}$`);
  if (!reg.idPrefix.some((p) => id.startsWith(p)) && !reg.singletonIds.includes(id)) throw new HandleError('E-DIM-ID-FORMAT', `id ${id}: prefix not one of ${kind} idPrefix ${reg.idPrefix.join('|')}`);
  return /** @type {import('../types.d.ts').EntityId<K>} */ (id);
}

/**
 * kernelApi `entityId(kind, id)`：按加载期注册表核对后给出 EntityId<K>。
 * @template {string} K
 * @param {K} kind @param {string} id
 */
export function entityId(kind, id) {
  return entityIdOf(registry().kindIds, kind, id);
}
