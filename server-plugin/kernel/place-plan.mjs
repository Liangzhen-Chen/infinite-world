// 地点行 → 足迹划分输入的整理（格子迁移 G3；卷五 §4.1 规则 2、8、10、13）。
// 加载期校验（place.mjs checkPlaceTable，读展平行）与运行期读（place.mjs 的 zoneAt、placeView，读展平行加偏离行）共用这一份：
// 调用方交入取值函数（get）与组件类函数，本文件不碰引擎、不碰状态；足迹划分与几何在 footprint.mjs。
// 足迹种类只按组件类判（footprint-kind.mjs）；离场判据照卷二 §2.6"行改挂"第 3 点：自己的 parent 为 null、且挂了 relocatable 为真的组件类，
// 它与它的全部后代是离场子树（包含树的根不挂可改挂的组件类，两者不混淆）。

import { footprintKindOf, isLayerRootClasses, FOOTPRINT_KIND } from './footprint-kind.mjs';
import { planRegionFootprints, footprintAdjacency, ownerIdAt, eachCell } from './footprint.mjs';

const DIM = Object.freeze({ parent: 'parent', coord: 'coord', targetAreaM2: 'targetAreaM2', boundary: 'boundary', terrain: 'terrain', anchorElevationM: 'anchorElevationM', waterKind: 'waterKind', downstream: 'downstream' });

/**
 * 水体类是否流水（卷五 §2.2 water 族条目的 flowing）：只读词表条目，不认任何水体类代号。buildPlan 的 flowingOf 参数用它。
 * @param {Map<string, any> | undefined} index 加载期词表索引 @returns {(code: unknown) => boolean}
 */
export const flowingOfIndex = (index) => (code) => {
  const rec = index instanceof Map && typeof code === 'string' ? index.get(code) : undefined;
  return Boolean(rec && rec.entry !== null && typeof rec.entry === 'object' && rec.entry.flowing === true);
};

/**
 * 沿词表上位展开组件类。
 * @param {Iterable<string>} own @param {(code: string) => Iterable<string>} broader 一个代号的直接上位
 * @returns {Set<string>}
 */
export function expandClasses(own, broader) {
  const out = new Set();
  const stack = [...own];
  while (stack.length) {
    const c = stack.pop();
    if (typeof c !== 'string' || out.has(c)) continue;
    out.add(c);
    for (const b of broader(c)) stack.push(b);
  }
  return out;
}

/**
 * 把地点行整理成足迹划分的输入并划分。
 * @param {{
 *   ids: string[],
 *   get: (id: string, key: string) => any,
 *   classesOf: (id: string) => Set<string>,
 *   relocatable: (classes: Set<string>) => boolean,
 *   grid: any,
 *   gridSpaces: any[] | null,
 *   flowingOf?: (waterKind: string) => boolean,
 *   bed?: boolean,
 * }} ctx get 取一行一个维度的有效值（偏离行覆盖展平行；没有为 undefined）；classesOf 给已展开的组件类全集；relocatable 判组件类里有没有可改挂者；
 *   flowingOf 判水体类是否流水（flowingOfIndex(词表索引)；不交即全按静水）；bed 为假时区格代表地表高取未修正的 h₀、不求河床（卷十 R10-2.12 求值次序：生成水体行的下游链按 h₀ 派生），缺省为真
 * @returns {{rows: Map<string, any>, plans: Map<number, any>, errors: any[], kinds: Map<string, string>, classes: Map<string, Set<string>>, offstage: Set<string>, parentOf: (id: string) => string | null, layerRoots: string[]}}
 */
export function buildPlan(ctx) {
  const ids = [...ctx.ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const idSet = new Set(ids);
  const classes = new Map(ids.map((id) => [id, ctx.classesOf(id)]));
  const parentOf = (id) => {
    const p = ctx.get(id, DIM.parent);
    return typeof p === 'string' && idSet.has(p) ? p : null;
  };
  // 各行足迹种类：本行与祖先的组件类交给 footprint-kind.mjs。
  const ancestorsOf = (id) => {
    const out = [];
    const seen = new Set([id]);
    for (let p = parentOf(id); p !== null && !seen.has(p); p = parentOf(p)) { seen.add(p); out.push(p); }
    return out;
  };
  const kinds = new Map(ids.map((id) => [id, footprintKindOf(classes.get(id), ancestorsOf(id).map((a) => classes.get(a)))]));
  // 离场子树：沿 parent 走到顶（有环即不算离场），顶行 parent 为 null 且挂可改挂的组件类。
  const offstage = new Set();
  for (const id of ids) {
    const chain = [id, ...ancestorsOf(id)];
    const top = chain[chain.length - 1];
    if (ctx.get(top, DIM.parent) === null && ctx.relocatable(classes.get(top))) offstage.add(id);
  }
  const numberOrNull = (v) => (Number.isFinite(v) ? v : null);
  const rows = new Map();
  const isFlowing = typeof ctx.flowingOf === 'function' ? ctx.flowingOf : () => false;
  for (const id of ids) {
    const boundary = ctx.get(id, DIM.boundary);
    const waterKind = ctx.get(id, DIM.waterKind);
    const downstream = ctx.get(id, DIM.downstream);
    rows.set(id, {
      parent: parentOf(id),
      kind: kinds.get(id),
      offstage: offstage.has(id),
      coord: ctx.get(id, DIM.coord) ?? null,
      targetAreaM2: numberOrNull(ctx.get(id, DIM.targetAreaM2)),
      boundary: Array.isArray(boundary) ? boundary : null,
      terrain: ctx.get(id, DIM.terrain),
      anchorElevationM: numberOrNull(ctx.get(id, DIM.anchorElevationM)),
      waterKind,
      // 河床（卷五 §4.3 规则 8）与流水足迹校验（规则 10）读：本行的下游水体行与是否流水（只读词表条目的 flowing；调用方不交 flowingOf 即按静水）。
      downstream: typeof downstream === 'string' ? downstream : null,
      flowing: typeof waterKind === 'string' && isFlowing(waterKind),
    });
  }
  const spaces = (ctx.gridSpaces || []).map((s) => ({ w: s.w, box: { x0: s.box.x0, y0: s.box.y0, cellsX: s.box.cellsX, cellsY: s.box.cellsY }, root: s.root }));
  const { plans, errors } = spaces.length > 0 ? planRegionFootprints(ctx.grid, spaces, rows) : { plans: new Map(), errors: [] };
  if (ctx.bed === false) for (const plan of plans.values()) plan.bedOff = true;
  const layerRoots = ids.filter((id) => isLayerRootClasses(classes.get(id)) && !offstage.has(id));
  return { rows, plans, errors, kinds, classes, offstage, parentOf, layerRoots };
}

/**
 * 可及水体类（卷五 §4.3 规则 9 waterAccess）：本行足迹与其四邻区格内，各水体行足迹的 waterKind 之并；没有即空。
 * 区格 c 属于哪些水体行：c 的最深归属行与它的全部祖先里挂了 waterKind 的行。
 * @param {any} plan 一个格空间的划分计划 @param {Map<string, any>} rows plan 行输入 @param {string} id @returns {string[]} 代号序
 */
export function waterAccessOf(plan, rows, id) {
  if (!plan.cells.has(id)) return [];
  const { x0, y0, cellsX, cellsY } = plan.box;
  const kinds = new Set();
  // 水体类只由区格的归属行决定：每个不同的归属行只沿祖先链看一次（不为每格建集合，全规模下格数远多于行数）。
  const seenOwner = new Set();
  const visit = (k) => {
    const o = plan.owner[k];
    if (seenOwner.has(o)) return;
    seenOwner.add(o);
    for (let c = ownerIdAt(plan, k); c !== undefined && c !== null; c = rows.get(c).parent) {
      const wk = rows.get(c).waterKind;
      if (typeof wk === 'string') kinds.add(wk);
    }
  };
  eachCell(plan, id, (k) => {
    visit(k);
    const x = x0 + (k % cellsX);
    const y = y0 + (k - (k % cellsX)) / cellsX;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= x0 && nx < x0 + cellsX && ny >= y0 && ny < y0 + cellsY) visit((ny - y0) * cellsX + (nx - x0));
    }
  });
  return [...kinds].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * 路网边带来的相邻（卷五 §4.14 规则 2 后半）：一条边（含门边）两端分别在二者的包含子树内。
 * 边的两端沿 parent 各向上取自身与全部祖先，两侧互不为祖先后代的配对即相邻。
 * @param {{from: string, to: string}[]} edges @param {(id: string) => string | null} parentOf @returns {Map<string, Set<string>>}
 */
export function edgeAdjacency(edges, parentOf) {
  const chain = (id) => {
    const out = [];
    const seen = new Set();
    for (let c = id; c !== null && c !== undefined && !seen.has(c); c = parentOf(c)) { seen.add(c); out.push(c); }
    return out;
  };
  const out = new Map();
  const add = (a, b) => { if (!out.has(a)) out.set(a, new Set()); out.get(a).add(b); };
  for (const e of edges) {
    const ca = chain(e.from);
    const cb = chain(e.to);
    const sa = new Set(ca);
    const sb = new Set(cb);
    for (const a of ca) {
      if (sb.has(a)) continue; // a 同时是 to 的祖先：包含关系，不算相邻
      for (const b of cb) {
        if (sa.has(b)) continue;
        add(a, b);
        add(b, a);
      }
    }
  }
  return out;
}

export { footprintAdjacency, FOOTPRINT_KIND };
