// 格子几何的唯一出处之一（公共部件修理 C4；卷五 :491 四邻划分、:465 区格八邻、:1216 足迹相邻用四邻接区格）。
// 四邻与八邻方向表、两点距离平方、两组区格是否四邻相接，全书只在这里；别处只引用，不各写一份。
// 区格边长与中心的换算（卷五 :433、:499）在 footprint.mjs 的共用函数（regionSideCells、regionCenterFixed 等；门禁 pp_region_cell 的例外文件就是它）。
// 纯函数，不读引擎与状态，不 import 别的模块（footprint.mjs、cave.mjs、route-grid.mjs 等都要 import 它，避开环）。

/** 四邻接方向（东、西、北、南，次序固定；各处遍历次序与确定性相关，不得各自重排）。 */
export const NEIGHBORS_4 = Object.freeze([Object.freeze([1, 0]), Object.freeze([-1, 0]), Object.freeze([0, 1]), Object.freeze([0, -1])]);
/** 八邻方向：先四邻（同 NEIGHBORS_4 的次序），再四个斜向。 */
export const NEIGHBORS_8 = Object.freeze([...NEIGHBORS_4, Object.freeze([1, 1]), Object.freeze([1, -1]), Object.freeze([-1, 1]), Object.freeze([-1, -1])]);

/**
 * 两点之间的距离平方（定点米的平方，BigInt）：全书"离某点最近"的比较（接入格、控制点子集、控制面、落位站点区格）都用它，不各写一遍 dx² + dy²。
 * @param {bigint} ax @param {bigint} ay @param {bigint} bx @param {bigint} by @returns {bigint}
 */
export function dist2Fixed(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

/**
 * 两组区格里有没有一对四邻接（卷五 :1216）。
 * @param {readonly {x: number, y: number}[]} a @param {readonly {x: number, y: number}[]} b @returns {boolean}
 */
export function regionCellsTouch(a, b) {
  const rows = new Map(); // x → 该列的 y 集合
  for (const r of b) {
    const ys = rows.get(r.x);
    if (ys === undefined) rows.set(r.x, new Set([r.y]));
    else ys.add(r.y);
  }
  return a.some((c) => NEIGHBORS_4.some(([dx, dy]) => {
    const ys = rows.get(c.x + dx);
    return ys !== undefined && ys.has(c.y + dy);
  }));
}
