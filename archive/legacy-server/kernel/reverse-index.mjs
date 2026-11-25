// 关系族的反查索引（卷二 §1.12"关系族的行与反查索引"第 2–4 点，唯一定义在卷二；块 6 第 6-7 张，卷五 §4.1.2 :397 起 rel_residents）。
// 关系行的 via 写成 {index: <状态路径模式>, field: <被反查的字段>} 即反查关系：索引以该字段的值为键、以持有该字段的实体 id
// （路径模式的第一个 `*` 段）为值。索引是投影（第 3 点）：不落盘、不进存档与哈希；本文件每次读时由状态全量重建，所以与状态恒一致，
// 与增量维护的结果相同。只按关系行的数据处理，不认任何具体关系、路径或字段名。

import { KernelError } from './errors.mjs';
import { registry } from './vocab.mjs';
import { T, GRAMMAR_TOKENS } from './handles/markers.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// 关系族名、路径通配段都取 markers.mjs 定义源：T.vocab_family（卷二 §1.9 :288）、GRAMMAR_TOKENS.wildcard（§2.7 :814）。

/** 关系行的 via 是不是反查索引的写法（{index, field}）。 @param {unknown} via @returns {boolean} */
const isIndexVia = (via) => isObj(via) && typeof via.index === 'string' && typeof via.field === 'string';

/**
 * kernelApi `reverseLookup(state, rel, key)`（卷二 §1.12 第 4 点）：返回指向该键的实体 id，按代号序排列、去重；没有即 `[]`（确知为空）。
 * rel 是 relation 族里 via 写成反查索引的行；不是关系行、不是反查行即 E-DIM-REF-MISSING，不放行。
 * @param {any} state @param {string} rel @param {string} key
 * @returns {readonly string[]}
 */
export function reverseLookup(state, rel, key) {
  const rec = registry().vocabIndex.get(rel);
  if (!rec || rec.family !== T.vocab_family.relation) throw new KernelError('E-DIM-REF-MISSING', {}, `reverseLookup: ${JSON.stringify(rel)} is not a relation row`);
  const via = rec.entry && rec.entry.via;
  if (!isIndexVia(via)) throw new KernelError('E-DIM-REF-MISSING', {}, `reverseLookup: relation ${rel} has no reverse index (via is not {index, field})`);
  const segs = via.index.split(GRAMMAR_TOKENS.pathSep);
  if (!segs.includes(GRAMMAR_TOKENS.wildcard)) throw new KernelError('E-DIM-REF-MISSING', {}, `reverseLookup: relation ${rel} index path has no entity segment`);
  const out = new Set();
  // 沿路径模式走状态：`*` 段遍历该层全部键，第一个 `*` 段取到的键就是持有该字段的实体 id。
  const walk = (node, at, owner) => {
    if (!isObj(node)) return;
    if (at === segs.length) {
      if (node[via.field] === key) out.add(owner);
      return;
    }
    const seg = segs[at];
    if (seg !== GRAMMAR_TOKENS.wildcard) { if (Object.hasOwn(node, seg)) walk(node[seg], at + 1, owner); return; }
    for (const k of Object.keys(node)) walk(node[k], at + 1, owner === null ? k : owner);
  };
  walk(state, 0, null);
  return Object.freeze([...out].sort(cmp));
}
