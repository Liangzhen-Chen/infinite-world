// 生成器读的"作者行视图"（卷十 R10-1.3 :370：worldgen 相的生成器只读数据表、世界种子、先行阶段已写的行）：
// 一张表的有效行（展平行并上 generated 节偏离行，卷二 §1.3 覆盖顺序）加调用方给的作者输入，整理成 id → {parent, regionLevel, kind, classes, dims}。
// 足迹种类只按组件类判（kernel/footprint-kind.mjs，经 buildPlan），不看 id、不看显示名；作者输入里标明是建筑的行取建筑足迹种类
// （旧数据还没有组件类的行，G5b 转换前由 settlements 的建筑清单标）。本文件不碰状态、不读文件。

import { buildPlan, expandClasses, flowingOfIndex } from '../place-plan.mjs';
import { FOOTPRINT_KIND } from '../footprint-kind.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const broaderOf = (index) => (code) => {
  const rec = index instanceof Map ? index.get(code) : undefined;
  const b = rec && isObj(rec.entry) ? rec.entry.broader : undefined;
  return Array.isArray(b) ? b : b === undefined ? [] : [b];
};

/**
 * @typedef {{id: string, parent: string | null, regionLevel: string | null, kind: string, classes: Set<string>, flowing: boolean, dims: Record<string, any>}} GenRow
 *   flowing：水体类是流水（词表 water 条目的 flowing，卷五 §2.2；没有 waterKind 即假）
 */

/**
 * 作者行视图。
 * @param {Map<string, Record<string, any>>} effective 表的有效行（id → 维度键值，另可带 `classes`：行自己挂的组件类、类别代号数组）
 * @param {{index: Map<string, any>}} vocab 加载期词表（沿 broader 展开组件类）
 * @param {{authored?: Map<string, Record<string, any>>, buildingIds?: Iterable<string>}} [input]
 *   authored：作者输入里的维度值与行（id → 维度键值；表里有该行就补上它没写的维度，表里没有就是作者已有、转换后才进表的行，如水体行），表里已写的维度一律不改；
 *   buildingIds：作者输入里标明是建筑的行 id（足迹种类取建筑，不当区域足迹）
 * @returns {Map<string, GenRow>} 按 id 升序
 */
export function buildGenRows(effective, vocab, input = {}) {
  const authored = input.authored || new Map();
  const buildings = new Set(input.buildingIds || []);
  const merged = new Map();
  for (const [id, row] of effective) merged.set(id, { ...row });
  for (const [id, row] of authored) {
    const base = merged.get(id) || {};
    const next = { ...base };
    for (const [k, v] of Object.entries(row)) if (next[k] === undefined) next[k] = v;
    merged.set(id, next);
  }
  const ids = [...merged.keys()].sort(cmp);
  const rp = buildPlan({
    ids,
    get: (id, key) => (merged.get(id) || {})[key],
    classesOf: (id) => expandClasses(Array.isArray((merged.get(id) || {}).classes) ? merged.get(id).classes : [], broaderOf(vocab.index)),
    relocatable: () => false,
    grid: null,
    gridSpaces: [],
    flowingOf: flowingOfIndex(vocab.index),
  });
  const rows = new Map();
  for (const id of ids) {
    const dims = merged.get(id);
    const level = dims.regionLevel;
    rows.set(id, {
      id,
      parent: rp.rows.get(id).parent,
      regionLevel: typeof level === 'string' ? level : null,
      kind: buildings.has(id) ? FOOTPRINT_KIND.building : rp.kinds.get(id),
      classes: rp.classes.get(id),
      flowing: rp.rows.get(id).flowing,
      dims,
    });
  }
  return rows;
}

/** 行 id 的祖先链（自己起、到根止；有环即止）。@param {Map<string, GenRow>} rows @param {string} id @returns {string[]} */
export function chainOf(rows, id) {
  const out = [];
  const seen = new Set();
  for (let p = id; p !== null && rows.has(p) && !seen.has(p); p = rows.get(p).parent) { seen.add(p); out.push(p); }
  return out;
}
