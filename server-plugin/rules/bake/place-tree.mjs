// 烘焙层：地点包含树索引（S1-2a；卷二十七 R27-4.13 :570 派生缓存不进存档与存档摘要、R27-5.9 :638 缓存是投影；卷五 §2.1 :95 parent 即包含树父节点）。
// bakePlaceTree 是已登记维度表的纯函数：同一份 doc_data 建出的树逐位相同，读档后从空重建；结果挂 engine.bake，不进 state、不进 doc_*。
// placeTreeDigest 只供核对两次构建一致（规范序列化 canonical + 装配层注入的摘要能力）。只按表头与行数据判，不认任何具体地点 id 或名字。

import { KernelError } from '../../kernel/errors.mjs';
import { canonical } from '../../kernel/storage.mjs';

// 包含树所在的表与父节点维度（卷五 §2.1 :95：place 表的 parent，ref place nullable，只有根为 null，无环）。
const TREE_KIND = 'place';
const PARENT_DIM = 'parent';

const byCodePoint = (/** @type {string} */ a, /** @type {string} */ b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 由加载期登记建包含树（卷五 §4.1 规则 1、3）。parent 不是串也不是 null、悬空或成环即 E-DIM-REF-MISSING。
 * byLevel：全部地点按深度（根为 0）再按 id 码点序排列，开局一步按它遍历。
 * @param {{tables: Map<string, {rows?: unknown}>}} registry rules/load/registry.mjs#buildRegistry 的结果
 * @returns {Readonly<{kind: string, parentOf: ReadonlyMap<string, string | null>, childrenOf: ReadonlyMap<string, readonly string[]>, ancestorsOf: (id: string) => readonly string[], byLevel: readonly string[]}>}
 */
export function bakePlaceTree(registry) {
  const doc = registry.tables.get(TREE_KIND);
  if (!doc) throw new KernelError('E-DIM-REF-MISSING', {}, `bakePlaceTree: no ${TREE_KIND} table`);
  const rows = new Map(Object.entries(doc.rows !== null && typeof doc.rows === 'object' ? doc.rows : {}));
  const ids = [...rows.keys()].sort(byCodePoint);
  /** @type {Map<string, string | null>} */
  const parentOf = new Map();
  /** @type {Map<string, string[]>} */
  const children = new Map(ids.map((id) => [id, []]));
  for (const id of ids) {
    const row = Object(rows.get(id));
    const p = Object.hasOwn(row, PARENT_DIM) ? row[PARENT_DIM] : null;
    const siblings = typeof p === 'string' ? children.get(p) : undefined;
    if (p !== null && siblings === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `bakePlaceTree: ${id}.${PARENT_DIM} -> ${String(p)} is not a row`);
    parentOf.set(id, p);
    if (siblings !== undefined) siblings.push(id);
  }
  /** @type {Map<string, readonly string[]>} */
  const ancestors = new Map();
  for (const id of ids) {
    const chain = [];
    for (let at = parentOf.get(id); at !== null && at !== undefined; at = parentOf.get(at)) {
      if (at === id || chain.length >= ids.length) throw new KernelError('E-DIM-REF-MISSING', {}, `bakePlaceTree: ${id} is on a ${PARENT_DIM} cycle`);
      chain.push(at);
    }
    ancestors.set(id, Object.freeze(chain));
  }
  const depth = (/** @type {string} */ id) => (ancestors.get(id) || []).length;
  const byLevel = Object.freeze([...ids].sort((a, b) => depth(a) - depth(b) || byCodePoint(a, b)));
  const childrenOf = new Map([...children].map(([id, c]) => [id, Object.freeze(c)]));
  const ancestorsOf = (/** @type {string} */ id) => {
    const got = ancestors.get(id);
    if (got === undefined) throw new KernelError('E-DIM-REF-MISSING', {}, `ancestorsOf: ${JSON.stringify(id)} is not a ${TREE_KIND} row`);
    return got;
  };
  return Object.freeze({ kind: TREE_KIND, parentOf, childrenOf, ancestorsOf, byLevel });
}

/**
 * 树的摘要（只供核对）：byLevel 与每个地点的父节点、子节点表，规范序列化后交 engine.digestCap。
 * @param {{digestCap: {sha256Hex: (data: string, encoding: 'utf8') => string}}} engine @param {ReturnType<typeof bakePlaceTree>} tree
 * @returns {string}
 */
export function placeTreeDigest(engine, tree) {
  const nodes = tree.byLevel.map((id) => [id, tree.parentOf.get(id), [...(tree.childrenOf.get(id) || [])]]);
  return engine.digestCap.sha256Hex(canonical({ kind: tree.kind, nodes }), 'utf8');
}
