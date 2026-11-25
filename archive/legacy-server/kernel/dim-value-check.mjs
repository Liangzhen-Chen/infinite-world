// 用表头维度定义核一个值（原在 dimension-writers.mjs，抽出供 dated 写者追加记录时共用，不复制；卷二 §1.2 取值域、§2.7 dated "value" 同偏离行口径）。
// 第一条错即抛（码取校验器 checkValue 给的）。叶子文件：只依赖词表、校验器与命名 struct 登记。

import { KernelError } from './errors.mjs';
import { kindOfEntity, registry } from './vocab.mjs';
import { checkValue } from './validate/types.mjs';
import { installedNamedStructs } from './named-structs.mjs';

/**
 * @param {any} engine @param {any} state @param {any} def 维度定义 @param {any} value @param {string} key 维度名 @param {string | null} entity 实体 id @param {string} kind 实体类
 * @returns {void}
 */
export function checkField(engine, state, def, value, key, entity, kind) {
  const reg = registry();
  // 引用值指向的实体：加载期登记的，或本状态里已建行的运行期实体（如尸体的 ofPerson 指向运行期建的个体，kernelApi kindOfEntity 同一口径）。
  const idIndex = { get: (id) => { try { return kindOfEntity(state, id); } catch (e) { return undefined; } } };
  const env = { vocab: engine.vocab, idIndex, units: engine.units, tableDims: reg.tableDims, namedStructs: installedNamedStructs() };
  let first = null;
  checkValue(def, value, env, { table: kind, row: entity || '', dim: key, path: key }, (e) => { if (first === null) first = e; });
  if (first !== null) throw new KernelError(first.code, { entity }, `${key}: got ${JSON.stringify(first.got)}, want ${first.want}`);
}
