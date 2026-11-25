// 落位（格子迁移 G11 第一提交：纯函数一半；卷十 §4.7.3 R10-7.11、R10-3.12、卷十九 §4.5 规则 7、11、§4.6 规则 1）。
// `layoutOf` 是分片种子与建筑锚点的唯一算法（卷十 :667；"之外计算分片种子或建筑锚点的实现为 0"，6-24 的转换工具与物化都调它）。
// 纯函数：不读状态、不读格差分、不抽取；全程整数（区格序号整数、米用 det-math 定点 BigInt），不调 Math.*；同一输入两次结果逐格相同，与输入列表的次序无关。
// 常数只来自规则表：cellM、regionCellM、facingDirections 取 rules.grid，gapCells 取 rules.gen.layout.gapCells（卷十 :182），由调用方交入；本文件不落这些数。
//
// 分片划分不另写算法：站点足迹（区格集合 S）当作一个局部格空间交给 footprint.mjs 的 planRegionFootprints（卷五 §4.1 规则 10 的唯一实现），
// S 之外的外包框格按 S 的补集连通块作为"作者边界"行占住，所以分片只在 S 里长；分片行 id 由调用方交入（划分里同父兄弟按 id 码点序轮流生长，
// 物化时分片行的 id 是 instanceIdOf 的结果，试排与物化须用同一批 id 才逐格相同）。
//
// 坐标约定（卷十九 §4.5 规则 7 第 2 点）：x 向东、y 向北；蓝图转后水平外包 bbox = {dx0, dy0, dx1, dy1}（相对锚点的细格偏移，闭区间，来自 planBlueprint 的 bbox）；
// 一栋选定矩形 [x0..x1]×[y0..y1]（宽 a = dx1−dx0+1，深 d = dy1−dy0+1）对应的锚点 = (x0 − dx0, y0 − dy0)，即"使旋转后外包恰落在所选矩形上的蓝图原点所在的细格"。
// 锚点 z（所在列此刻的地表层号，卷十 R10-7.11 第 5 点）读格高度，不属本函数的纯整数几何：调用方交入 surfaceStoreyAt 时随结果带回，没交则不带 z。

import { fixedUnits, fixedToNumber, fixedScale } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { NEIGHBORS_4, dist2Fixed, regionCellsTouch } from './grid-geom.mjs';
import { planRegionFootprints, cellList, FOOTPRINT_KIND, regionCenterFixed, regionCenterM, regionSideCells } from './footprint.mjs';

/** 排不下的原因代号（卷十 R10-7.5：站点面积阶段把 N 加一重排；至多加到存量单元足迹的区格数，仍排不下即 E-GEN-ROW-INVALID，由生成阶段判）。 */
export const REASON = Object.freeze({
  siteTooSmall: 'layout_site_too_small', zoneTooSmall: 'layout_zone_too_small', notAdjacent: 'layout_not_adjacent', noFit: 'layout_no_fit', partition: 'layout_partition_error',
});

const bad = (detail) => new KernelError('E-DET-DOMAIN', {}, `layoutOf: ${detail}`);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isSafeInteger(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const keyOf = (x, y) => `${x},${y}`;
// 向下取整除（b > 0），负数也对。
const floorDiv = (a, b) => (a - (((a % b) + b) % b)) / b;

// ---------- 朝向（卷十九 §4.5 规则 11；手写建筑缺 facing 时由站点面积阶段按同一规则补写，R10-3.12） ----------

/**
 * 建筑朝向：意图已给取意图的；否则取建造者文化偏好给的（卷七 §4.28，文化没给为 null）；再否则面向赤道：站点纬度不小于 0 取"每圈档数的一半"（正面朝南），否则取 0（朝北）。
 * 三者都按卷十九 §4.4 规则 2 ④ 取偶数（向下取成每个四分之一圈所含档数的整数倍）。纯数据、不分地区与文化。
 * @param {{facingDirections: number}} grid rules.grid
 * @param {{intentFacing: number|null, culturePref: number|null, latitudeDeg: number}} input
 * @returns {number}
 */
export function defaultFacing(grid, input) {
  const n = grid && grid.facingDirections;
  // 档数折半再折半得每个四分之一圈的档数（与 blueprint.mjs 同写法，代码里不落 2、4）；档数须恰是它的四倍。
  const half = isInt(n) ? n >> 1 : 0;
  const quarter = half >> 1;
  if (quarter < 1 || (quarter << 1 << 1) !== n) throw bad('grid.facingDirections must be a positive multiple of four');
  if (!isObj(input) || typeof input.latitudeDeg !== 'number' || !Number.isFinite(input.latitudeDeg)) throw bad('defaultFacing input needs a numeric latitudeDeg');
  const pick = (v) => v !== null && v !== undefined;
  for (const v of [input.intentFacing, input.culturePref]) if (pick(v) && !(isInt(v) && v >= 0 && v < n)) throw bad('facing want an integer in [0, facingDirections)');
  const raw = pick(input.intentFacing) ? input.intentFacing : pick(input.culturePref) ? input.culturePref : input.latitudeDeg >= 0 ? half : 0;
  return raw - (raw % quarter);
}

// ---------- 输入核对 ----------

function checkInput(grid, input) {
  if (!isObj(grid) || !(grid.regionCellM > 0) || !(grid.cellM > 0)) throw bad('grid {cellM, regionCellM} want positive numbers');
  const perCell = Number(regionSideCells(grid));
  if (!isObj(input)) throw bad('input is an object');
  if (typeof input.siteId !== 'string' || input.siteId.length === 0) throw bad('siteId is a non-empty string');
  const c = input.coord;
  if (!isObj(c) || typeof c.x !== 'number' || typeof c.y !== 'number' || !Number.isFinite(c.x) || !Number.isFinite(c.y)) throw bad('coord is {x, y} in metres');
  if (!isInt(input.cellCount) || input.cellCount < 1) throw bad('cellCount (N) want an integer >= 1');
  if (!isInt(input.gapCells) || input.gapCells < 1) throw bad('gapCells want an integer >= 1 (rules.gen.layout.gapCells)');
  if (!Array.isArray(input.regionCells)) throw bad('regionCells is a list of region cells {x, y}');
  const seen = new Set();
  for (const r of input.regionCells) {
    if (!isObj(r) || !isInt(r.x) || !isInt(r.y)) throw bad('regionCells entries are integer {x, y}');
    if (seen.has(keyOf(r.x, r.y))) throw bad(`duplicate region cell (${r.x},${r.y})`);
    seen.add(keyOf(r.x, r.y));
  }
  if (!Array.isArray(input.zones)) throw bad('zones is a list (empty: the site is not partitioned)');
  const roles = new Set();
  const ids = new Set([input.siteId]);
  for (const z of input.zones) {
    if (!isObj(z) || typeof z.id !== 'string' || z.id.length === 0 || typeof z.role !== 'string' || z.role.length === 0) throw bad('zones entries need string id and role');
    if (roles.has(z.role) || ids.has(z.id)) throw bad(`zone role or id repeated: ${z.role}`);
    roles.add(z.role);
    ids.add(z.id);
    if (!isInt(z.needCells) || z.needCells < 1 || !isInt(z.targetCells) || z.targetCells < z.needCells) throw bad(`zone ${z.role}: needCells >= 1 and targetCells >= needCells (integers, R10-7.5)`);
    if (!Array.isArray(z.adjacent) || !z.adjacent.every((r) => typeof r === 'string')) throw bad(`zone ${z.role}: adjacent is a list of roles`);
  }
  for (const z of input.zones) for (const r of z.adjacent) if (!roles.has(r)) throw bad(`zone ${z.role}: adjacent role ${r} is not in this template`);
  if (input.zones.length > 0) {
    let sum = 0;
    for (const z of input.zones) sum += z.targetCells;
    if (sum !== input.cellCount) throw bad('zone targetCells must sum to cellCount (N, R10-7.5)');
  }
  if (!Array.isArray(input.buildings)) throw bad('buildings is a list');
  const keys = new Set();
  for (const b of input.buildings) {
    if (!isObj(b) || typeof b.key !== 'string' || b.key.length === 0 || keys.has(b.key)) throw bad('buildings entries need a unique string key');
    keys.add(b.key);
    if (!isInt(b.ordinal) || b.ordinal < 0) throw bad(`building ${b.key}: ordinal want an integer >= 0`);
    if (typeof b.handWritten !== 'boolean') throw bad(`building ${b.key}: handWritten is a boolean`);
    if (!isInt(b.facing)) throw bad(`building ${b.key}: facing is an integer`);
    const k = b.bbox;
    if (!isObj(k) || !isInt(k.dx0) || !isInt(k.dy0) || !isInt(k.dx1) || !isInt(k.dy1) || k.dx1 < k.dx0 || k.dy1 < k.dy0) throw bad(`building ${b.key}: bbox is {dx0, dy0, dx1, dy1} with dx1 >= dx0, dy1 >= dy0`);
    if (b.anchor !== null && b.anchor !== undefined && !(isObj(b.anchor) && isInt(b.anchor.x) && isInt(b.anchor.y))) throw bad(`building ${b.key}: anchor is null or integer {x, y}`);
    if (input.zones.length > 0 && !roles.has(b.role) && !(b.anchor !== null && b.anchor !== undefined)) throw bad(`building ${b.key}: role ${b.role} is not in this template`);
  }
  return perCell;
}

// ---------- 站点区格与分片种子（R10-7.11 第 1、2 点） ----------

// S 按（区格中心到站点 coord 的平方距离，区格序号字典序）排成一列；距离全整数定点（regionCellM 的定点数恒为偶数，单标度不丢位）。
function orderedSiteCells(grid, input) {
  const cx = fixedUnits(input.coord.x);
  const cy = fixedUnits(input.coord.y);
  const withD = input.regionCells.map((r) => {
    const c = regionCenterFixed(grid, r);
    return { x: r.x, y: r.y, d2: dist2Fixed(c.x, c.y, cx, cy) };
  });
  return withD.sort((a, b) => (a.d2 < b.d2 ? -1 : a.d2 > b.d2 ? 1 : a.x !== b.x ? cmp(a.x, b.x) : cmp(a.y, b.y)));
}

// 外包框内 S 的补集按四邻连通块切开，每块一行"作者边界"，让 planRegionFootprints 只在 S 里划分。
function holeRows(S, box) {
  const inS = new Set(S.map((r) => keyOf(r.x, r.y)));
  const seen = new Set();
  const rows = [];
  for (let y = box.y0; y < box.y0 + box.cellsY; y += 1) {
    for (let x = box.x0; x < box.x0 + box.cellsX; x += 1) {
      const k = keyOf(x, y);
      if (inS.has(k) || seen.has(k)) continue;
      const comp = [];
      const stack = [{ x, y }];
      seen.add(k);
      while (stack.length > 0) {
        const c = stack.pop();
        comp.push({ x: c.x, y: c.y });
        for (const [dx, dy] of NEIGHBORS_4) {
          const nx = c.x + dx;
          const ny = c.y + dy;
          const nk = keyOf(nx, ny);
          if (nx < box.x0 || nx >= box.x0 + box.cellsX || ny < box.y0 || ny >= box.y0 + box.cellsY) continue;
          if (inS.has(nk) || seen.has(nk)) continue;
          seen.add(nk);
          stack.push({ x: nx, y: ny });
        }
      }
      rows.push(comp);
    }
  }
  return rows;
}

// 分片足迹：局部格空间 = S 的外包框，根行 = 站点，子行 = 补集块（占位）与各分片。返回 {cells: Map<角色序号, 区格[]>, errors}。
function partitionZones(grid, input, S, seeds) {
  let x0 = S[0].x; let x1 = S[0].x; let y0 = S[0].y; let y1 = S[0].y;
  for (const r of S) { x0 = r.x < x0 ? r.x : x0; x1 = r.x > x1 ? r.x : x1; y0 = r.y < y0 ? r.y : y0; y1 = r.y > y1 ? r.y : y1; }
  const box = { x0, y0, cellsX: x1 - x0 + 1, cellsY: y1 - y0 + 1 };
  const base = { kind: FOOTPRINT_KIND.region, offstage: false, coord: null, targetAreaM2: null, boundary: null };
  const rows = new Map();
  rows.set(input.siteId, { ...base, parent: null });
  const area = grid.regionCellM * grid.regionCellM;
  input.zones.forEach((z, i) => rows.set(z.id, { ...base, parent: input.siteId, coord: seeds[i].coord, targetAreaM2: z.targetCells * area }));
  holeRows(S, box).forEach((comp, k) => rows.set(`${input.siteId}\u0000hole${k}`, { ...base, parent: input.siteId, boundary: comp }));
  const r = planRegionFootprints(grid, [{ w: 0, box, root: input.siteId }], rows);
  const plan = r.plans.get(0);
  const cells = new Map();
  input.zones.forEach((z, i) => cells.set(i, plan.cells.has(z.id) ? cellList(plan, z.id) : []));
  return { cells, errors: r.errors };
}

// ---------- 行架（R10-7.11 第 4 点） ----------

// 一个分片的扫描状态：细格外包 [X0..X1]×[Y0..Y1]（分片区格外包的西南角起）、游标（x, y）与本行已放各栋深的最大值。
function newZone(cells, perCell) {
  let rx0 = cells[0].x; let rx1 = cells[0].x; let ry0 = cells[0].y; let ry1 = cells[0].y;
  for (const r of cells) { rx0 = r.x < rx0 ? r.x : rx0; rx1 = r.x > rx1 ? r.x : rx1; ry0 = r.y < ry0 ? r.y : ry0; ry1 = r.y > ry1 ? r.y : ry1; }
  const X0 = rx0 * perCell;
  const Y0 = ry0 * perCell;
  return { has: new Set(cells.map((r) => keyOf(r.x, r.y))), X0, X1: (rx1 + 1) * perCell - 1, Y0, Y1: (ry1 + 1) * perCell - 1, cur: { x: X0, y: Y0, rowDepth: 0 } };
}

// 外扩后的矩形是否整个落在分片足迹内（区域足迹按整列算：矩形盖到的每个区格都得是分片的）。
function insideZone(zone, perCell, x0, y0, x1, y1) {
  for (let ry = floorDiv(y0, perCell); ry <= floorDiv(y1, perCell); ry += 1) {
    for (let rx = floorDiv(x0, perCell); rx <= floorDiv(x1, perCell); rx += 1) if (!zone.has.has(keyOf(rx, ry))) return false;
  }
  return true;
}

// 候选矩形与已放的任一栋外包外扩 gap 格不相交（即相隔至少 gap 格）。
const clearOf = (placed, gap, x0, y0, x1, y1) => placed.every((p) => x1 < p.x0 - gap || x0 > p.x1 + gap || y1 < p.y0 - gap || y0 > p.y1 + gap);

// 在一个分片里扫一栋：成功返回矩形并提交游标，放不下返回 null（游标不动，后面更小的建筑仍可用余下的位置）。
function scanZone(zone, perCell, gap, placed, a, d) {
  let { x: cx, y: cy, rowDepth } = zone.cur;
  for (;;) {
    if (cy + d - 1 + gap > zone.Y1) return null;
    if (cx + a - 1 + gap > zone.X1) {
      cy += rowDepth + gap; // 行距：本行已放各栋 b 的最大值加 gapCells（gap >= 1，所以恒前进）
      cx = zone.X0;
      rowDepth = 0;
      continue;
    }
    const x1 = cx + a - 1;
    const y1 = cy + d - 1;
    if (insideZone(zone, perCell, cx - gap, cy - gap, x1 + gap, y1 + gap) && clearOf(placed, gap, cx, cy, x1, y1)) {
      zone.cur = { x: cx + a + gap, y: cy, rowDepth: d > rowDepth ? d : rowDepth }; // 成功后挪过 a + gapCells 格
      return { x0: cx, y0: cy, x1, y1 };
    }
    cx += 1; // 失败向东挪一格
  }
}

/**
 * 落位（卷十 R10-7.11）：站点区格 → 分片种子与分片足迹 → 建筑锚点。
 * @param {{cellM: number, regionCellM: number}} grid rules.grid
 * @param {{
 *   siteId: string, coord: {x: number, y: number}, cellCount: number, gapCells: number,
 *   regionCells: {x: number, y: number}[],
 *   zones: {id: string, role: string, adjacent: string[], needCells: number, targetCells: number}[],
 *   buildings: {key: string, ordinal: number, role: string, handWritten: boolean, facing: number, bbox: {dx0: number, dy0: number, dx1: number, dy1: number}, anchor?: {x: number, y: number} | null}[],
 *   surfaceStoreyAt?: (x: number, y: number) => number | null,
 * }} input
 *  siteId、coord（米）：站点行；cellCount = N、zones 的 needCells/targetCells：站点面积阶段（R10-7.5）给的；regionCells = S：站点足迹的区格（卷五划分结果）；
 *  zones 按模板次序，id 是将来分片行的 id；空表即不分片（整个站点足迹当一个分片）。buildings：待排与作障碍的建筑，key 唯一；有 anchor 者只作障碍（手写已定位），
 *  其余按两遍排（先缺锚点的手写行，再其余清单行），遍内按（所归角色的模板次序，ordinal）升序；role 是所归分片角色（zrole 代号）。
 * @returns {{ok: true, zones: {index: number, id: string, role: string, seed: {x: number, y: number}, coord: {x: number, y: number}, targetCells: number, cells: {x: number, y: number}[]}[],
 *   buildings: {key: string, zone: number | null, anchor: {x: number, y: number, z?: number | null}, facing: number, rect: {x0: number, y0: number, x1: number, y1: number}}[]}
 *   | {ok: false, reason: string, detail: string}} buildings 按排的先后；障碍不在其内
 */
export function layoutOf(grid, input) {
  const perCell = checkInput(grid, input);
  const fail = (reason, detail) => ({ ok: false, reason, detail });
  const Z = input.zones.length;
  // 1 站点区格：|S| 少于 N 即排不下（另：每个角色一个种子区格，|S| < Z 时种子必同格）。
  if (input.regionCells.length < input.cellCount || input.regionCells.length < Z) return fail(REASON.siteTooSmall, `site footprint has ${input.regionCells.length} region cells, want N = ${input.cellCount}`);
  const S = orderedSiteCells(grid, input);
  // 2 分片种子：第 i 个角色取排好的 S 的第 floor(i × |S| ÷ Z) 项。
  const seeds = input.zones.map((z, i) => {
    const cell = S[Number((BigInt(i) * BigInt(S.length)) / BigInt(Z))];
    return { cell: { x: cell.x, y: cell.y }, coord: regionCenterM(grid, cell) };
  });
  let zoneCells;
  if (Z === 0) {
    zoneCells = new Map([[0, S.map((r) => ({ x: r.x, y: r.y }))]]);
  } else {
    const part = partitionZones(grid, input, S, seeds);
    if (part.errors.length > 0) return fail(REASON.partition, part.errors.map((e) => `${e.code} ${e.id}`).join('; '));
    zoneCells = part.cells;
    // 卷五划分后，某分片的区格数小于 need_z，或模板 adjacent 要求的两个角色没有一对四邻接区格，即排不下。
    for (let i = 0; i < Z; i += 1) if (zoneCells.get(i).length < input.zones[i].needCells) return fail(REASON.zoneTooSmall, `zone ${input.zones[i].role} got ${zoneCells.get(i).length} region cells, need ${input.zones[i].needCells}`);
    for (let i = 0; i < Z; i += 1) {
      for (const role of input.zones[i].adjacent) {
        const j = input.zones.findIndex((z) => z.role === role);
        if (!regionCellsTouch(zoneCells.get(i), zoneCells.get(j))) return fail(REASON.notAdjacent, `zone ${input.zones[i].role} needs to touch ${role}`);
      }
    }
  }
  const nZones = Z === 0 ? 1 : Z;
  const zones = [];
  for (let i = 0; i < nZones; i += 1) zones.push(newZone(zoneCells.get(i), perCell));
  const roleIndex = new Map(input.zones.map((z, i) => [z.role, i]));
  // 3 障碍：已写成行且带 anchor 的手写建筑的足迹。
  const rectOf = (b, anchor) => ({ x0: anchor.x + b.bbox.dx0, y0: anchor.y + b.bbox.dy0, x1: anchor.x + b.bbox.dx1, y1: anchor.y + b.bbox.dy1 });
  const placed = input.buildings.filter((b) => b.anchor !== null && b.anchor !== undefined).map((b) => rectOf(b, b.anchor));
  // 两遍：第一遍缺锚点的手写行，第二遍其余清单行；遍内按（所归角色的模板次序，ordinal，key）升序。
  const todo = input.buildings.filter((b) => b.anchor === null || b.anchor === undefined);
  const zoneOrder = (b) => (Z === 0 ? 0 : roleIndex.get(b.role));
  const order = (p, q) => (zoneOrder(p) !== zoneOrder(q) ? cmp(zoneOrder(p), zoneOrder(q)) : p.ordinal !== q.ordinal ? cmp(p.ordinal, q.ordinal) : cmp(p.key, q.key));
  const passes = [todo.filter((b) => b.handWritten).sort(order), todo.filter((b) => !b.handWritten).sort(order)];
  const out = [];
  for (const queue of passes) {
    // 遍间游标回到各分片的西南角（已定：卷十 R10-7.11 第 3 点要"物化时重算第二遍得到与试排相同的结果"：物化时第一遍的手写行已带补写的锚点、是障碍，
    // 第二遍从西南角起扫；试排的第二遍同样从西南角起扫、前一遍放的矩形同样是障碍，两者逐格相同。游标若跨遍延续，多行时行距会把手写行的深也算进去，与物化不同）。
    for (const z of zones) z.cur = { x: z.X0, y: z.Y0, rowDepth: 0 };
    for (const b of queue) {
      const a = b.bbox.dx1 - b.bbox.dx0 + 1;
      const d = b.bbox.dy1 - b.bbox.dy0 + 1;
      // 4 一栋怎样落：先所归分片，放不下按模板次序依次试其余分片。
      const home = zoneOrder(b);
      const tries = [home, ...zones.map((_, i) => i).filter((i) => i !== home)];
      let rect = null;
      let at = null;
      for (const i of tries) {
        rect = scanZone(zones[i], perCell, input.gapCells, placed, a, d);
        if (rect !== null) { at = i; break; }
      }
      if (rect === null) return fail(REASON.noFit, `building ${b.key} does not fit in any zone`);
      placed.push(rect);
      // 5 锚点：使旋转后外包恰落在所选矩形上的蓝图原点所在的细格；z 取该格所在列此刻的地表层号（调用方交入读法时）。
      const anchor = { x: rect.x0 - b.bbox.dx0, y: rect.y0 - b.bbox.dy0 };
      if (typeof input.surfaceStoreyAt === 'function') anchor.z = input.surfaceStoreyAt(anchor.x, anchor.y);
      out.push({ key: b.key, zone: Z === 0 ? null : at, anchor, facing: b.facing, rect });
    }
  }
  return {
    ok: true,
    zones: input.zones.map((z, i) => ({ index: i, id: z.id, role: z.role, seed: seeds[i].cell, coord: seeds[i].coord, targetCells: z.targetCells, cells: zoneCells.get(i) })),
    buildings: out,
  };
}

// ---------- 加载期校验：布局模板族与分片角色族（卷十九 §2.4、§4.6 规则 1、3、4；A19-6.1–6.3） ----------

// 词表族名与条目字段名（卷十九 §2.4）。键集封闭：模板与分片项里没有设施数量（规则 3），多出任何键都拒；basis 是各词表条目通用的出处说明。
const FAMILY = Object.freeze({ layout: 'layout', zrole: 'zrole' });
const LAYOUT_KEYS = Object.freeze({ zones: 'zones', applies: 'applies', basis: 'basis' });
const ZONE_KEYS = Object.freeze({ role: 'role', share: 'share', adjacent: 'adjacent' });
const ZROLE_KEYS = Object.freeze({ typeAffinity: 'typeAffinity', basis: 'basis' });

/**
 * 加载期校验 `layout`、`zrole` 族条目：返回错误文本数组（空为通过），码在文本开头。遍历族内全部条目，不点名代号（新增条目只加数据即被核，A19-6.3）。
 * layout：zones 非空列表、applies 非空字符串（RX 文本，由卷十读站点行基值维度求值，本函数不编译）；每个分片项 {role, share, adjacent}：role 是 zrole 族条目且本模板内不重复，
 * share 是 [0, 1] 的数、本模板各项之和恰为 1（定点），adjacent 是本模板内其他角色的列表。
 * zrole：typeAffinity 必写（可为空表）；键须是 facility_type 族条目（设施类型表未建时任何键都报 E-DIM-REF-MISSING，不放过），值是 [0, 1] 的数。
 * 设施类型是维度表（卷十九 §2.2，kind facility_type），不是词表族：typeAffinity 的键经表的行 id 集核（李白 11-23 事件 b41e0801 P10-2）；没交（undefined）按空集，任何键都报缺。
 * @param {Map<string, {family: string, entry: any}>} vocabIndex 词表索引 @param {Set<string>} [facilityTypeIds] 设施类型表的行 id
 * @returns {string[]}
 */
export function checkLayoutTemplates(vocabIndex, facilityTypeIds = new Set()) {
  const errors = [];
  const scale = fixedScale();
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  const inUnit = (v) => num(v) && fixedUnits(v) >= 0n && fixedUnits(v) <= scale;
  const extraKeys = (obj, allowed) => Object.keys(obj).filter((k) => !Object.hasOwn(allowed, k));
  for (const [code, rec] of [...vocabIndex].sort(([a], [b]) => cmp(a, b))) {
    if (!rec) continue;
    const e = isObj(rec.entry) ? rec.entry : {};
    if (rec.family === FAMILY.layout) {
      const at = `${FAMILY.layout}/${code}`;
      for (const k of extraKeys(e, LAYOUT_KEYS)) errors.push(`E-DIM-STRUCT-FIELD ${at}: field ${k} is not a layout field (a template never carries facility counts, A19-6.1)`);
      if (typeof e[LAYOUT_KEYS.applies] !== 'string' || e[LAYOUT_KEYS.applies].trim().length === 0) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${LAYOUT_KEYS.applies} is a required non-empty rx text`);
      const zones = e[LAYOUT_KEYS.zones];
      if (!Array.isArray(zones) || zones.length === 0) { errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${LAYOUT_KEYS.zones} is a required non-empty list`); continue; }
      const roles = new Set();
      let sum = 0n;
      zones.forEach((z, i) => {
        const where = `${at}/${LAYOUT_KEYS.zones}/${i}`;
        if (!isObj(z)) { errors.push(`E-DIM-STRUCT-FIELD ${where}: zone item is an object`); return; }
        for (const k of extraKeys(z, ZONE_KEYS)) errors.push(`E-DIM-STRUCT-FIELD ${where}: field ${k} is not a zone field (a template never carries facility counts, A19-6.1)`);
        const role = vocabIndex.get(z[ZONE_KEYS.role]);
        if (typeof z[ZONE_KEYS.role] !== 'string' || !role || role.family !== FAMILY.zrole) errors.push(`E-DIM-REF-MISSING ${where}: ${ZONE_KEYS.role} ${JSON.stringify(z[ZONE_KEYS.role])} is not a zrole entry`);
        else if (roles.has(z[ZONE_KEYS.role])) errors.push(`E-DIM-DUPLICATE-KEY ${where}: role ${z[ZONE_KEYS.role]} appears twice in one template`);
        else roles.add(z[ZONE_KEYS.role]);
        if (!inUnit(z[ZONE_KEYS.share])) errors.push(`E-DIM-DOMAIN-RANGE ${where}: ${ZONE_KEYS.share} ${JSON.stringify(z[ZONE_KEYS.share])} want a number in [0, 1]`);
        else sum += fixedUnits(z[ZONE_KEYS.share]);
        if (!Array.isArray(z[ZONE_KEYS.adjacent]) || !z[ZONE_KEYS.adjacent].every((r) => typeof r === 'string')) errors.push(`E-DIM-STRUCT-FIELD ${where}: ${ZONE_KEYS.adjacent} is a list of roles`);
      });
      if (sum !== scale) errors.push(`E-DIM-DOMAIN-RANGE ${at}/${LAYOUT_KEYS.zones}: shares sum to ${fixedToNumber(sum)}, want 1 (vol19 4.6 rule 4)`);
      zones.forEach((z, i) => {
        if (!isObj(z) || !Array.isArray(z[ZONE_KEYS.adjacent])) return;
        for (const r of z[ZONE_KEYS.adjacent]) {
          if (typeof r !== 'string') continue;
          if (r === z[ZONE_KEYS.role]) errors.push(`E-DIM-DOMAIN-RANGE ${at}/${LAYOUT_KEYS.zones}/${i}: role ${r} cannot be adjacent to itself`);
          else if (!roles.has(r)) errors.push(`E-DIM-REF-MISSING ${at}/${LAYOUT_KEYS.zones}/${i}: ${ZONE_KEYS.adjacent} role ${r} is not in this template (vol19 4.6 rule 4)`);
        }
      });
    } else if (rec.family === FAMILY.zrole) {
      const at = `${FAMILY.zrole}/${code}`;
      for (const k of extraKeys(e, ZROLE_KEYS)) errors.push(`E-DIM-STRUCT-FIELD ${at}: field ${k} is not a zrole field`);
      const aff = e[ZROLE_KEYS.typeAffinity];
      if (!isObj(aff)) { errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${ZROLE_KEYS.typeAffinity} is a required map (may be empty)`); continue; }
      for (const type of Object.keys(aff).sort(cmp)) {
        if (!facilityTypeIds.has(type)) errors.push(`E-DIM-REF-MISSING ${at}: ${ZROLE_KEYS.typeAffinity} key ${type} is not a facility_type entry`);
        if (!inUnit(aff[type])) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${ZROLE_KEYS.typeAffinity}.${type} ${JSON.stringify(aff[type])} want a number in [0, 1]`);
      }
    }
  }
  return errors;
}
