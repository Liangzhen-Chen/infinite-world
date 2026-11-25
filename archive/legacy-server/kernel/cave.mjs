// 洞穴生成器（格子迁移 G8；卷十 R10-2.14，卷五 §4.1 规则 11、§4.5 规则 4）：体积足迹细格集合的唯一算法 caveCellsOf。
// 纯函数、全整数、不读引擎与状态、不读差分、不抽取（次序只来自 sample.mjs 的身份采样键 identitySeedKey 与 orderKeyAt）：同输入逐列逐层相同，与区格遍历次序、先派生谁无关。
// 调用方（place-volume.mjs）把"父足迹成员、兄弟占用、列地表"三个读口交进来，结果按（行、输入版本）缓存在计划对象上，本文件不缓存。
// 规模：一个洞最多 ceil(maxAreaM2 ÷ cellM²) 列（rules.gen.under.maxAreaM2，暂定 200000 m²、cellM 1 m 即 20 万列）× spanZ 层，与世界大小无关；
// 生长用最小堆取"四邻里次序键最小的可凿列"，每列至多入堆一次（已见集合只装 H 与 H 的四邻，至多 5 × 20 万项），代价 O(|H| log |H|) 次哈希与堆操作；
// 起点只扫父足迹的区格各一次哈希（O(父足迹区格数)），中心列的地表只对"次序键暂居最小"的候选区格求（期望 O(log) 次），不把全世界的区格或细格装进任何容器。

import { fixedUnits, fixedScale, fixedToNumber } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { NEIGHBORS_4 } from './grid-geom.mjs';
import { regionSideCells } from './footprint.mjs';
import { identitySeedKey, orderKeyAt } from './sample.mjs';

// 实体类代号：体积行是地点表（place）的行（卷十 R10-2.14 :431 身份采样键的第二成分）。
const ENTITY_PLACE = 'place';

const ceilDiv = (a, b) => (a + b - 1n) / b; // a ≥ 0、b > 0
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}
// 四邻方向表在最上一行的 grid-geom.mjs（NEIGHBORS_4；卷十 R10-2.14 第 3 项），本文件不另抄一份。
const colKey = (x, y) => `${x},${y}`;

/** 失败原因代号（caveCellsOf 返回 ok: false 时的 reason）。 */
export const CAVE_REASON = Object.freeze({
  badInput: 'badInput', // 输入越域（不是数、spanZ 不是不小于 1 的整数、目标面积不为正）：数据错
  overCap: 'overCap', // 目标面积超过 rules.gen.under.maxAreaM2（生成时已 min，手写行超了拒收）
  notBelowParent: 'notBelowParent', // 父行是体积，顶层号 t 不低于父体积的底层
  noParentColumn: 'noParentColumn', // 父足迹里没有同时满足①②的起点（父足迹太小，或全被更深的区域足迹、先于本行的兄弟占了）
  topExposed: 'topExposed', // 满足①②的起点有，但地表层都低于 t + 1（数据给的 depthM 太浅：顶面够不到地表以下一层）
  unknown: 'unknown', // 某个被看的列地表高未知（控制点海拔未知）：结果未知，往下传，不当可行也不当不可行
  badParent: 'badParent', // 父行既不是区域足迹也不是有细格的体积（place-volume.mjs 判，不是 caveCellsOf 自己返回）
});

// 二叉最小堆：元素 {key, x, y, z, h}，按 (key, x, y) 字典序小者先出（key 是 64 位十六进制串，串序即数值序）。
class MinHeap {
  constructor() { this.a = []; }
  static less(p, q) { return p.key < q.key || (p.key === q.key && (p.x < q.x || (p.x === q.x && p.y < q.y))); }
  get size() { return this.a.length; }
  push(e) {
    const a = this.a;
    a.push(e);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!MinHeap.less(a[i], a[p])) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i + i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && MinHeap.less(a[l], a[m])) m = l;
        if (r < a.length && MinHeap.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}

/**
 * 顶面层号 t = floor(anchorElevationM ÷ storeyM)（卷十 R10-2.14 第 1 项；卷五 §4.1 规则 11）。
 * @param {{storeyM: number}} grid @param {number} anchorElevationM @returns {number}
 */
export function topLayerOf(grid, anchorElevationM) {
  return Number(floorDiv(fixedUnits(anchorElevationM), fixedUnits(grid.storeyM)));
}

/**
 * 洞穴生成器（卷十 R10-2.14；对照表 #37–#42）：体积足迹的细格集合。
 * 三条可凿：① 列在父足迹内且不在父行的更深区域足迹里（inParent）；② 不在 id 先于本行的兄弟体积足迹的列里（claimed）；③ 列地表层号 ≥ t + 1（surface）。
 * 起点：parentRegions（父足迹的区格序号，次序随意）按 caveRegionKey 升序（并列 (x, y) 字典序）取第一个中心列可凿者；没有即 ok: false。
 * 生长：H 从起点出发，每步在 H 的四邻里取可凿未入 H 的列中 caveColumnKey 最小者（并列 (x, y) 字典序），到 |H| = ceil(targetAreaM2 ÷ cellM²) 或无列可取；
 * 每列层 t − spanZ + 1 到 t 是体积足迹；一步取一列、全整数、没有重掷。
 * 洞口：mouth 为真时取 H 中 (地表层号 − t) 最小的列（并列取 caveColumnKey 最小，再 (x, y)），层 t + 1 到地表层是通路格（梯）的凿空，不属体积足迹；mouth 为假不开洞口。
 * @param {{
 *   grid: {cellM: number, storeyM: number, regionCellM: number},
 *   worldSeed: string, rowId: string,
 *   anchorElevationM: number, spanZ: number, targetAreaM2: number, mouth: boolean, maxAreaM2: number,
 *   parentRegions: {x: number, y: number}[],
 *   inParent: (x: number, y: number) => boolean,
 *   claimed: (x: number, y: number) => boolean,
 *   surface: (x: number, y: number) => {h: bigint, z: number} | null,
 *   parentBottomZ?: number | null,
 * }} spec
 * @returns {{ok: true, topZ: number, bottomZ: number, start: {x: number, y: number}, columns: {x: number, y: number, h: bigint, z: number}[], mouth: null | {x: number, y: number, fromZ: number, toZ: number}, cellCount: number}
 *   | {ok: false, reason: string, detail: string}}
 */
export function caveCellsOf(spec) {
  const { grid, worldSeed, rowId, anchorElevationM, spanZ, targetAreaM2, mouth, maxAreaM2, parentRegions, inParent, claimed, surface } = spec;
  const parentBottomZ = spec.parentBottomZ === undefined ? null : spec.parentBottomZ;
  const bad = (detail) => ({ ok: false, reason: CAVE_REASON.badInput, detail });
  if (typeof anchorElevationM !== 'number' || !Number.isFinite(anchorElevationM)) return bad('anchorElevationM is not a number');
  if (!Number.isInteger(spanZ) || spanZ < 1) return bad('spanZ is not an integer >= 1');
  if (typeof targetAreaM2 !== 'number' || !Number.isFinite(targetAreaM2) || !(targetAreaM2 > 0)) return bad('targetAreaM2 is not a positive finite number');
  if (typeof maxAreaM2 !== 'number' || !Number.isFinite(maxAreaM2) || !(maxAreaM2 >= 1)) return bad('rules.gen.under.maxAreaM2 is not a finite number >= 1');
  if (typeof mouth !== 'boolean') return bad('mouth is not a boolean');
  if (typeof worldSeed !== 'string' || typeof rowId !== 'string') throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'caveCellsOf: worldSeed and rowId must be strings');
  // 种子 = 身份采样键（卷二 §1.10 :326；卷十 R10-2.14 :431：模板种子、实体类、行 id、抽取点 site.gen.cave.grow），起点、生长、洞口并列共用这一个种子；次序键 hash(种子, 区格序号或列序号)。
  const seedKey = identitySeedKey('gen_cave', 'site_gen_cave_grow', worldSeed, ENTITY_PLACE, rowId);
  const S = fixedScale();
  const cellArea = (fixedUnits(grid.cellM) * fixedUnits(grid.cellM)) / S; // cellM²（定点 m²）
  const target = ceilDiv(fixedUnits(targetAreaM2), cellArea); // 列数 ceil(targetAreaM2 ÷ cellM²)
  const cap = ceilDiv(fixedUnits(maxAreaM2), cellArea); // 一个洞的列数上限 ceil(maxAreaM2 ÷ cellM²)（R10-2.14 第 5 项）
  if (target > cap) return { ok: false, reason: CAVE_REASON.overCap, detail: `target ${target} columns exceeds the cap ${cap} (rules.gen.under.maxAreaM2)` };
  const t = topLayerOf(grid, anchorElevationM);
  const bottomZ = t - spanZ + 1;
  if (parentBottomZ !== null && !(t < parentBottomZ)) return { ok: false, reason: CAVE_REASON.notBelowParent, detail: `top layer ${t} is not below the parent volume bottom layer ${parentBottomZ}` };
  let unknown = false;
  // 可凿列的读法：返回 {h, z} | null（不可凿）；地表未知置 unknown 标志（只在 ①② 已成立后才读地表，不为不在候选里的列读）。
  const diggable = (x, y) => {
    if (!inParent(x, y) || claimed(x, y)) return null;
    const s = surface(x, y);
    if (s === null) { unknown = true; return null; }
    return s.z >= t + 1 ? s : null;
  };
  const perCell = Number(regionSideCells(grid)); // 区格边长（细格列数）
  const half = perCell >> 1;
  // 起点：区格按次序键升序取第一个中心列可凿者。只在次序键暂居最小时才求中心列地表，所以不为全部区格求高度。
  let best = null;
  let sawOpenStart = false; // 有满足 ①② 的中心列（用来分清 noParentColumn 与 topExposed）
  for (const r of parentRegions) {
    const key = orderKeyAt(seedKey, r.x, r.y);
    if (best !== null && (key > best.key || (key === best.key && !(r.x < best.rx || (r.x === best.rx && r.y < best.ry))))) continue;
    const cx = r.x * perCell + half;
    const cy = r.y * perCell + half;
    if (inParent(cx, cy) && !claimed(cx, cy)) sawOpenStart = true;
    const s = diggable(cx, cy);
    if (s !== null) best = { key, rx: r.x, ry: r.y, x: cx, y: cy, s };
  }
  if (unknown) return { ok: false, reason: CAVE_REASON.unknown, detail: 'a column surface height is unknown' };
  if (best === null) {
    // sawOpenStart 只在"候选区格次序键暂居最小时"才置，可能漏记：失败时（best 一直为 null，每个区格都被评估过）它是完整的。
    return sawOpenStart
      ? { ok: false, reason: CAVE_REASON.topExposed, detail: `no parent column has surface layer >= ${t + 1} (top layer ${t}); the depth is too shallow` }
      : { ok: false, reason: CAVE_REASON.noParentColumn, detail: 'no parent region has a free centre column (parent footprint too small, or taken by deeper region rows / earlier sibling volumes)' };
  }
  // 生长：最小堆 + 已见集合；每列只评估一次可凿，不可凿的也记已见（可凿性不随生长变）。
  const seen = new Set();
  const heap = new MinHeap();
  const columns = [];
  const take = (x, y, s) => {
    columns.push({ x, y, h: s.h, z: s.z });
    for (const [dx, dy] of NEIGHBORS_4) {
      const nx = x + dx;
      const ny = y + dy;
      const k = colKey(nx, ny);
      if (seen.has(k)) continue;
      seen.add(k);
      const ns = diggable(nx, ny);
      if (ns !== null) heap.push({ key: orderKeyAt(seedKey, nx, ny), x: nx, y: ny, s: ns });
    }
  };
  seen.add(colKey(best.x, best.y));
  take(best.x, best.y, best.s);
  const targetN = Number(target);
  while (columns.length < targetN && heap.size > 0) {
    const e = heap.pop();
    take(e.x, e.y, e.s);
  }
  if (unknown) return { ok: false, reason: CAVE_REASON.unknown, detail: 'a column surface height is unknown' };
  let mouthAt = null;
  if (mouth) {
    let pick = null;
    for (const c of columns) {
      const gap = c.z - t;
      const key = orderKeyAt(seedKey, c.x, c.y);
      if (pick === null || gap < pick.gap || (gap === pick.gap && (key < pick.key || (key === pick.key && (c.x < pick.c.x || (c.x === pick.c.x && c.y < pick.c.y)))))) pick = { gap, key, c };
    }
    mouthAt = { x: pick.c.x, y: pick.c.y, fromZ: t + 1, toZ: pick.c.z };
  }
  return { ok: true, topZ: t, bottomZ, start: { x: best.x, y: best.y }, columns: columns.map((c) => ({ x: c.x, y: c.y, h: c.h, z: c.z })), mouth: mouthAt, cellCount: columns.length * spanZ };
}

/**
 * 体积足迹的派生量（卷五 §4.1 规则 13、§4.5 规则 3；对照表 #45）：areaM2 = 最低一层细格数 × cellM²（最低一层是 bottomZ 层，格数 = 列数 |H|，洞口通路格不属体积足迹）；
 * zRange = {zMin: bottomZ, zMax: topZ}；elevationM = zMin × storeyM；centroid = 各列中心的平均（定点米，除法向零截断）；
 * surfaceRefElevationM = 所占各细格列地表高的平均；depthM = max(0, surfaceRefElevationM − (zMax + 1) × storeyM)；underground = (depthM > 0)。
 * 洞穴不挂 comp_enclosure，enclosed 为假由调用方的组件类给出，不在这里。
 * @param {{cellM: number, storeyM: number}} grid @param {{topZ: number, bottomZ: number, columns: {x: number, y: number, h: bigint}[]}} cave caveCellsOf 的成功结果
 */
export function volumeDerived(grid, cave) {
  const cellF = fixedUnits(grid.cellM);
  const storeyF = fixedUnits(grid.storeyM);
  const n = BigInt(cave.columns.length);
  const half = cellF >> 1n; // 列中心：cellM ÷ 2
  let sx = 0n;
  let sy = 0n;
  let sh = 0n;
  for (const c of cave.columns) { sx += BigInt(c.x) * cellF + half; sy += BigInt(c.y) * cellF + half; sh += c.h; }
  const surfaceRef = sh / n;
  const raw = surfaceRef - BigInt(cave.topZ + 1) * storeyF;
  const depth = raw > 0n ? raw : 0n;
  return {
    areaM2: fixedToNumber(n * ((cellF * cellF) / fixedScale())),
    zRange: { zMin: cave.bottomZ, zMax: cave.topZ },
    elevationM: fixedToNumber(BigInt(cave.bottomZ) * storeyF),
    centroid: { x: fixedToNumber(sx / n), y: fixedToNumber(sy / n) },
    surfaceRefElevationM: fixedToNumber(surfaceRef),
    depthM: fixedToNumber(depth),
    underground: depth > 0n,
  };
}
