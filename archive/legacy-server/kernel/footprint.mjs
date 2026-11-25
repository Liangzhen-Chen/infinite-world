// 足迹划分、zoneAt 与几何读入口的纯函数（格子迁移 G3；卷五 §4.1 规则 2、3、5、9、10、12–14，§4.2 规则 12–13，§4.14 规则 2）。
// 只做区域足迹（区格集合，每格占整列）；建筑、房间、体积足迹归 G7/G8（足迹种类判得出，但本文件不给它们划格）。
// 全程整数（区格序号整数、米用 det-math 定点 BigInt，除法向零截断），不调 Math.*（S5-10），常数只来自规则表 rules.grid（S5-7）：
// cellM、regionCellM、storeyM、fullTurnDeg、facingDirections 都由调用方经 grid 参数交入，本文件不写 0、1、-1 以外的数字字面量。
// 结果与遍历容器次序无关：子行一律按 id 码点序处理，并列取区格序号 (x, y) 字典序小者。
// 本文件不读状态、不读引擎：入参是"行输入"与格空间表行，place.mjs 负责把世界数据整理成这个形状。
//
// 规模（卷五 §4.1.4 :522，主世界约 7,800 × 5,150 ≈ 4,020 万区格）：区格归属存成一个按区格下标的 Int32Array（4 字节每格，全规模约 160 MB，
// 不用 Map/Set——V8 的 Map/Set 单个上限约 1,677 万条）；各行不常驻格列表（只存格数与外包矩形；作者画了 boundary 的行例外，存表序列表），
// 格的集合由归属数组加外包矩形加祖先链现扫；父足迹成员判定同用归属数组加祖先链，不建父足迹的集合；生长的堆是打包整数键的类型化数组，
// "已排队"标记共用一个 Int32Array（划完即释放）。划分只在 place-plan.mjs 的内容键记忆里做一次（加载校验与运行期共用）。
// 面积与形心、相邻集、控制点、各行高度都按计划缓存（计划本身就是"生成输入与当日有效输入版本"的纯函数，place.mjs 按它缓存，
// 输入变了即重划、缓存随计划丢弃，卷五 §4.1 规则 16）。再往上的里块分块与按需派生随卷二十七 R27-6.9 性能门在腾讯云测。

import { fixedUnits, fixedToNumber, fixedSqrtInt, atan, fixedUnits8 } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { NEIGHBORS_4, dist2Fixed } from './grid-geom.mjs';
import { surfaceHeightAt, surfaceStorey, landOrderKey } from './grid.mjs';
import { FOOTPRINT_KIND } from './footprint-kind.mjs';
import { createWaterBeds } from './water-bed.mjs';

// 足迹种类的判据只在 footprint-kind.mjs（加载期、运行期共用一份）。
export { FOOTPRINT_KIND, footprintKindOf, isLayerRootClasses } from './footprint-kind.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 前后左右的相对方位代号（卷五 §4.2 规则 13：前、右前、右、右后、后、左后、左、左前，依次以 0、一档、…为中心；只定义在八向朝向上）。
export const RELATIVE = Object.freeze(['front', 'frontRight', 'right', 'backRight', 'back', 'backLeft', 'left', 'frontLeft']);

// ---------- 整数小工具 ----------

// 向下取整的整数除法（b > 0）；BigInt 的 / 向零截断，负数要修正。
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}
const ceilDiv = (a, b) => (a + b - 1n) / b; // a、b 皆正

// 区格下标与区格序号互换（路网寻路 route-edges.mjs 共用，不另写第二份）。
/** 区格序号 (x, y) 是否在外包框内。@param {{x0: number, y0: number, cellsX: number, cellsY: number}} box @param {number} x @param {number} y @returns {boolean} */
export const inBox = (box, x, y) => x >= box.x0 && x < box.x0 + box.cellsX && y >= box.y0 && y < box.y0 + box.cellsY;
/** 区格序号 → 区格下标。@param {{x0: number, y0: number, cellsX: number}} box @param {number} x @param {number} y @returns {number} */
export const keyOf = (box, x, y) => (y - box.y0) * box.cellsX + (x - box.x0);
/** 区格下标 → 区格序号 x。@param {{x0: number, cellsX: number}} box @param {number} k @returns {number} */
export const xOf = (box, k) => box.x0 + (k % box.cellsX);
/** 区格下标 → 区格序号 y。@param {{y0: number, x0: number, cellsX: number}} box @param {number} k @returns {number} */
export const yOf = (box, k) => box.y0 + (k - (k % box.cellsX)) / box.cellsX;
/** boundary 的矩形写法的一项：{x0, x1, y0, y1} 全是整数，左闭右开且非空。@param {any} r @returns {boolean} */
export const isRectEntry = (r) => r !== null && typeof r === 'object' && Number.isSafeInteger(r.x0) && Number.isSafeInteger(r.x1) && Number.isSafeInteger(r.y0) && Number.isSafeInteger(r.y1) && r.x0 < r.x1 && r.y0 < r.y1 && !('x' in r) && !('y' in r);
/** 矩形之并是否四邻连通：两个矩形相交或有一段公共边即相连。@param {{x0: number, x1: number, y0: number, y1: number}[]} rs @returns {boolean} */
export function rectsConnected(rs) {
  const parent = rs.map((_, i) => i);
  const find = (i) => { let r = i; while (parent[r] !== r) r = parent[r]; return r; };
  const touch = (a, b) => (a.x0 < b.x1 && b.x0 < a.x1 && a.y0 <= b.y1 && b.y0 <= a.y1 && (a.y0 === b.y1 || b.y0 === a.y1 || (a.y0 < b.y1 && b.y0 < a.y1)))
    || (a.y0 < b.y1 && b.y0 < a.y1 && a.x0 <= b.x1 && b.x0 <= a.x1);
  for (let i = 0; i < rs.length; i += 1) for (let j = i + 1; j < rs.length; j += 1) if (touch(rs[i], rs[j])) parent[find(i)] = find(j);
  return rs.every((_, i) => find(i) === find(0));
}
const cellLess = (a, b) => a.x < b.x || (a.x === b.x && a.y < b.y);
const isCellIndex = (c) => c !== null && typeof c === 'object' && Number.isSafeInteger(c.x) && Number.isSafeInteger(c.y) && !('x0' in c) && !('x1' in c) && !('y0' in c) && !('y1' in c);
/** boundary 的错误说明（划分与加载期逐项核对共用，同一句）。 */
export const BOUNDARY_ENTRY_DETAIL = 'boundary entries are all cells {x, y} or all rects {x0, x1, y0, y1} of integers (x0 < x1, y0 < y1)';
/** 一行 boundary 的各项是否合法：全是逐格 {x, y}，或全是矩形 {x0, x1, y0, y1}；混写、缺字段、空对象都不合。与该行是否参加划分无关。@param {any[]} entries @returns {boolean} */
export const boundaryEntriesValid = (entries) => entries.every(isRectEntry) || entries.every(isCellIndex);
const NONE = -1; // 归属数组里"没有行"的值

// 二叉最小堆（类型化数组）：元素是一个打包整数 d2 × 区格数 + 次序号（次序号 = (x − x0) × cellsY + (y − y0)，即按 (x, y) 字典序的区格序），
// 按整数大小小者先出，等价于按 (d2, x, y) 字典序；打包值须落在 2⁵³ 内（planRegionFootprints 入口核对外包框，超限拒收，不静默降级）。
// 空堆 pop 得 -1。堆随生长者的边缘大小自动加倍，不建每格对象（全规模单层约 4,020 万次入堆，卷五 §4.1.4 :522）。
class PackedHeap {
  constructor() { this.a = new Float64Array(1); this.n = 0; }
  push(v) {
    let a = this.a;
    if (this.n === a.length) { const b = new Float64Array(a.length + a.length); b.set(a); this.a = b; a = b; }
    let i = this.n;
    this.n += 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p] <= v) break;
      a[i] = a[p];
      i = p;
    }
    a[i] = v;
  }
  pop() {
    if (this.n === 0) return -1;
    const a = this.a;
    const top = a[0];
    this.n -= 1;
    const n = this.n;
    if (n > 0) {
      const v = a[n];
      let i = 0;
      for (;;) {
        let c = i + i + 1;
        if (c >= n) break;
        if (c + 1 < n && a[c + 1] < a[c]) c += 1;
        if (a[c] >= v) break;
        a[i] = a[c];
        i = c;
      }
      a[i] = v;
    }
    return top;
  }
}

// 可增长的整型列表（一行足迹划出的区格下标；不用装箱数组，全规模单层合计约 4,020 万项）。
class IntList {
  constructor() { this.a = new Int32Array(1); this.n = 0; }
  push(v) {
    if (this.n === this.a.length) { const b = new Int32Array(this.a.length + this.a.length); b.set(this.a); this.a = b; }
    this.a[this.n] = v;
    this.n += 1;
  }
  get length() { return this.n; }
  /** 定长拷贝（足迹列表落进计划后不再增长）。@returns {Int32Array} */
  toInt32() { return this.a.slice(0, this.n); }
}

// ---------- 计划的读法（计划是 planRegionFootprints 的结果，下面这些是它唯一的读口） ----------

/** 一个区格下标归属的最深行 id；没有归属为 undefined。@param {any} plan @param {number} k @returns {string | undefined} */
export function ownerIdAt(plan, k) {
  const i = plan.owner[k];
  return i === NONE ? undefined : plan.ids[i];
}

/** 一行足迹的区格数（没划出足迹为 0）。@param {any} plan @param {string} id @returns {number} */
export function cellCountOf(plan, id) {
  return plan.sizes.has(id) ? plan.sizes.get(id) : 0;
}

// 区格 k 是否在行 id（下标 row）的足迹里：k 的最深归属行是它或它的后代（沿计划里的父下标链走，深度就是包含树深度）。
function inFootprint(plan, row, k) {
  for (let i = plan.owner[k]; i !== NONE; i = plan.parentIdx[i]) if (i === row) return true;
  return false;
}

/**
 * 逐格遍历一行足迹的区格下标。层根是整个外包框；作者画了 boundary 的行按它的表序；其余行按区格下标升序（归属数组在行的外包矩形里现扫，不常驻格列表）。
 * @param {any} plan @param {string} id @param {(k: number) => void} fn
 */
export function eachCell(plan, id, fn) {
  if (!plan.cells.has(id)) return;
  const list = plan.cells.get(id);
  if (list === null) { for (let k = 0; k < plan.total; k += 1) fn(k); return; }
  if (list !== undefined) { for (let i = 0; i < list.length; i += 1) fn(list[i]); return; }
  const r = plan.rect.get(id);
  const me = plan.idx.get(id);
  const { x0, y0, cellsX } = plan.box;
  for (let y = r.y0; y <= r.y1; y += 1) {
    const base = (y - y0) * cellsX - x0;
    for (let x = r.x0; x <= r.x1; x += 1) if (inFootprint(plan, me, base + x)) fn(base + x);
  }
}

/** 一行足迹的区格下标数组（顺序同 eachCell；全规模下大行会占数十 MB，只给要整行排序或索引的读者用，用完即弃）。@param {any} plan @param {string} id @returns {Int32Array} */
export function cellsOf(plan, id) {
  const stored = plan.cells.get(id);
  if (stored instanceof Int32Array) return stored;
  const out = new Int32Array(cellCountOf(plan, id));
  let n = 0;
  eachCell(plan, id, (k) => { out[n] = k; n += 1; });
  return out;
}

// ---------- 区域足迹划分（卷五 §4.1 规则 10） ----------

/**
 * 区域足迹划分：每个格空间一份计划。入参：
 *  grid——rules.grid（要 regionCellM）；
 *  spaces——格空间表行 [{w, box: {x0, y0, cellsX, cellsY}（区格序号，左下角与边长）, root: 根地点行 id}]；
 *  rows——Map<id, {parent, kind: footprint_kind, offstage, coord: {x, y}（米）|null, targetAreaM2: number|null, boundary: [{x, y}（区格序号）]|null}>。
 * 层根的足迹是它那个格空间外包框内的全部区格；每个父行的区域足迹确定后，在它的区格里为全部区域足迹子行划分：
 * 作者 boundary 非空者先占格；其余子行以 coord 所在区格为种子，目标格数 = ceil(targetAreaM2 ÷ regionCellM²)，没有 targetAreaM2 的平分
 * "父格数 − 覆盖格数 − 有目标者的目标格数之和"（非正或不足一格时各取 1 格）；多源同步生长：每一轮按子行 id 码点序，每个未达目标的子行从
 * 自己当前足迹的四邻里取一个尚未被占的父足迹区格（离自己种子直线最近者，并列取区格序号 (x, y) 字典序最小），直到全部达标或无格可取；
 * 剩下的区格归父行自己。离场行与它的后代、非区域足迹的行、自己开格空间的层根不参加划分。
 * 违规（种子/边界不在父足迹内、与兄弟相交、同父两个种子同区格、边界不连通、缺 coord）不抛，记进 errors，该子行及其后代不划格。
 * 计划形状：{w, box, root, total, ids（行 id 按划出次序）, idx, parentIdx, owner: Int32Array（区格下标 → ids 下标）,
 * cells: Map<id, null（层根）| Int32Array（作者 boundary 的表序列表）| undefined（只登记有足迹，格由 eachCell/cellsOf 现扫）>, rect: Map<id, 外包矩形>,
 * sizes, order, geometry, …缓存}。
 * @param {{regionCellM: number}} grid rules.grid
 * @param {{w: number, box: {x0: number, y0: number, cellsX: number, cellsY: number}, root: string}[]} spaces 格空间表行
 * @param {Map<string, any>} rows 行输入（见上）
 * @returns {{plans: Map<number, any>, errors: {code: string, id: string, detail: string}[]}}
 */
export function planRegionFootprints(grid, spaces, rows) {
  const errors = [];
  const plans = new Map();
  const regionCellMf = regionSideFixed(grid);
  const cellAreaF = fixedUnits(grid.regionCellM * grid.regionCellM);
  const roots = new Set(spaces.map((s) => s.root));
  const kids = new Map();
  for (const id of [...rows.keys()].sort(cmp)) {
    const r = rows.get(id);
    if (r.offstage || r.parent === null || r.parent === undefined) continue;
    if (!kids.has(r.parent)) kids.set(r.parent, []);
    kids.get(r.parent).push(id);
  }
  const err = (code, id, detail) => errors.push({ code, id, detail });
  let serial = 0; // 生长者序号：已排队标记按它盖章，不必逐次清空

  // 在 plan 里登记一行，返回它的下标。
  const register = (plan, id, parentIndex) => {
    const i = plan.ids.length;
    plan.ids.push(id);
    plan.idx.set(id, i);
    plan.parentIdx.push(parentIndex);
    plan.order.push(id);
    return i;
  };

  // 给父行 parentIndex 的区域足迹子行划格；owner 立即盖章（父足迹成员 ⇔ owner 仍是父行）。返回 Map<子行 id, 区格下标数组>。
  function partition(plan, parentId, parentIndex, parentSize, children) {
    const box = plan.box;
    const out = new Map(children.map((c) => [c, new IntList()]));
    const childIndex = new Map();
    for (const c of children) childIndex.set(c, register(plan, c, parentIndex));
    const bounded = children.filter((c) => Array.isArray(rows.get(c).boundary) && rows.get(c).boundary.length > 0);
    const derived = children.filter((c) => !bounded.includes(c));
    const boundedIdx = new Set(bounded.map((c) => childIndex.get(c)));
    let coverCount = 0;
    // 作者覆盖：须在父足迹内、与兄弟不相交、四邻连通。
    for (const id of bounded) {
      const list = out.get(id);
      const entries = rows.get(id).boundary;
      // boundary 两种写法（卷五 :98 封卷后勘误：区格集合的简写）：逐格 [{x, y}…]，或矩形之并 [{x0, x1, y0, y1}…]（区格序号，左闭右开）；一行只许用一种；流水水体只许逐格（表序即流向序）。
      const rectMode = entries.every(isRectEntry);
      if (!boundaryEntriesValid(entries)) { err('E-DIM-STRUCT-FIELD', id, BOUNDARY_ENTRY_DETAIL); continue; }
      if (rectMode && rows.get(id).flowing === true) { err('E-DIM-STRUCT-FIELD', id, 'a flowing water body writes boundary as cells in flow order, never as rects'); continue; }
      const mine = new Set(); // 逐格写法：作者画的边界很小，连通判定用集合
      const claim = (x, y) => {
        const k = inBox(box, x, y) ? keyOf(box, x, y) : NONE;
        const o = k === NONE ? NONE : plan.owner[k];
        if (k === NONE || (o !== parentIndex && !boundedIdx.has(o))) { err('E-GRID-FOOTPRINT-OUTSIDE-PARENT', id, `boundary cell (${x},${y}) is outside parent ${parentId}`); return false; }
        if (o === childIndex.get(id) && rectMode) return true; // 矩形之并里几个矩形盖到同一格：同一集合，不算相交
        if (o !== parentIndex) { err('E-GRID-SIBLING-OVERLAP', id, `boundary cell (${x},${y}) overlaps a sibling boundary`); return false; }
        plan.owner[k] = childIndex.get(id);
        list.push(k);
        if (!rectMode) mine.add(k);
        coverCount += 1;
        return true;
      };
      if (rectMode) {
        let bad = false;
        for (const r of entries) for (let y = r.y0; y < r.y1 && !bad; y += 1) for (let x = r.x0; x < r.x1; x += 1) if (!claim(x, y)) { bad = true; break; }
        if (!bad && !rectsConnected(entries)) err('E-DIM-DOMAIN-RANGE', id, 'boundary rects are not 4-connected');
      } else {
        for (const c of entries) claim(c.x, c.y);
        if (mine.size > 0 && !connected(box, mine)) err('E-DIM-DOMAIN-RANGE', id, 'boundary cells are not 4-connected');
      }
      // 流水水体的 boundary 表序即流向序（规则 10 "流水水体的足迹"，封卷后勘误 1121k17 修改轮 M1）：首格之外每格都与表序里排在它前面的某一格四邻相接（前缀连通）；按 flowing 判，不按 id 或水体类代号。
      if (rows.get(id).flowing === true) {
        const seen = new Set();
        for (let i = 0; i < list.length; i += 1) {
          const x = xOf(box, list.a[i]);
          const y = yOf(box, list.a[i]);
          if (i > 0 && !NEIGHBORS_4.some(([dx, dy]) => inBox(box, x + dx, y + dy) && seen.has(keyOf(box, x + dx, y + dy)))) { err('E-GRID-WATER-BAND', id, `boundary cell (${x},${y}) at table order ${i} touches none of the cells before it`); break; }
          seen.add(list.a[i]);
        }
      }
    }
    // 种子：coord 所在区格。
    const seedOf = new Map();
    for (const id of derived) {
      const c = rows.get(id).coord;
      if (c === null || c === undefined || typeof c.x !== 'number' || typeof c.y !== 'number') { err('E-DIM-REQUIRED-MISSING', id, 'region footprint row needs coord (seed point)'); continue; }
      const sx = Number(floorDiv(fixedUnits(c.x), regionCellMf));
      const sy = Number(floorDiv(fixedUnits(c.y), regionCellMf));
      const k = inBox(box, sx, sy) ? keyOf(box, sx, sy) : NONE;
      const o = k === NONE ? NONE : plan.owner[k];
      const sibling = o !== NONE && o !== parentIndex && childIndex.get(plan.ids[o]) === o;
      if (k === NONE || (o !== parentIndex && !sibling)) { err('E-GRID-FOOTPRINT-OUTSIDE-PARENT', id, `seed cell (${sx},${sy}) is outside parent ${parentId}`); continue; }
      if (boundedIdx.has(o)) { err('E-GRID-SIBLING-OVERLAP', id, `seed cell (${sx},${sy}) lies in a sibling boundary`); continue; }
      if (sibling) { err('E-GRID-SEED-SAME-CELL', id, `seed cell (${sx},${sy}) is also the seed of ${plan.ids[o]}`); continue; }
      plan.owner[k] = childIndex.get(id);
      out.get(id).push(k);
      seedOf.set(id, { x: sx, y: sy });
    }
    // 目标格数。
    const withTarget = derived.filter((id) => typeof rows.get(id).targetAreaM2 === 'number');
    const noTarget = derived.filter((id) => typeof rows.get(id).targetAreaM2 !== 'number');
    const targets = new Map();
    let targetSum = 0n;
    for (const id of withTarget) {
      const t = ceilDiv(fixedUnits(rows.get(id).targetAreaM2), cellAreaF);
      targets.set(id, t > 0n ? t : 1n);
      targetSum += targets.get(id);
    }
    const remaining = BigInt(parentSize) - BigInt(coverCount) - targetSum;
    for (const id of noTarget) {
      const share = remaining > 0n ? remaining / BigInt(noTarget.length) : 1n;
      targets.set(id, share > 0n ? share : 1n);
    }
    // 多源同步生长（打包整数键的类型化堆；目标格数比较用 Number，目标由 BigInt 算出，入口已核外包框不超 2⁵³ 故不丢精度）。
    if (!plan.queued) plan.queued = new Int32Array(plan.total);
    const { x0, y0, cellsX, cellsY } = box;
    const total = plan.total;
    const growers = [];
    for (const id of derived) {
      const s = seedOf.get(id);
      if (!s) continue;
      serial += 1;
      growers.push({ id, sx: s.x, sy: s.y, me: childIndex.get(id), heap: new PackedHeap(), stamp: serial, target: targets.get(id), list: out.get(id) });
    }
    const queueNeighbors = (g, x, y) => {
      for (let d = 0; d < NEIGHBORS_4.length; d += 1) {
        const nx = x + NEIGHBORS_4[d][0];
        const ny = y + NEIGHBORS_4[d][1];
        if (nx < x0 || nx >= x0 + cellsX || ny < y0 || ny >= y0 + cellsY) continue;
        const nk = (ny - y0) * cellsX + (nx - x0);
        if (plan.owner[nk] !== parentIndex || plan.queued[nk] === g.stamp) continue;
        plan.queued[nk] = g.stamp;
        g.heap.push(((nx - g.sx) * (nx - g.sx) + (ny - g.sy) * (ny - g.sy)) * total + (nx - x0) * cellsY + (ny - y0));
      }
    };
    for (const g of growers) queueNeighbors(g, g.sx, g.sy);
    for (let moved = true; moved;) {
      moved = false;
      for (const g of growers) {
        if (BigInt(g.list.n) >= g.target) continue;
        let top = g.heap.pop();
        let k = -1;
        let x = 0;
        let y = 0;
        while (top >= 0) {
          const m = top % total;
          x = x0 + (m - (m % cellsY)) / cellsY;
          y = y0 + (m % cellsY);
          k = (y - y0) * cellsX + (x - x0);
          if (plan.owner[k] === parentIndex) break;
          top = g.heap.pop();
          k = -1;
        }
        if (k < 0) continue;
        plan.owner[k] = g.me;
        g.list.push(k);
        queueNeighbors(g, x, y);
        moved = true;
      }
    }
    return out;
  }

  function connected(box, set) {
    const start = set.values().next().value;
    const seen = new Set([start]);
    const stack = [start];
    while (stack.length) {
      const k = stack.pop();
      for (const [dx, dy] of NEIGHBORS_4) {
        const nx = xOf(box, k) + dx;
        const ny = yOf(box, k) + dy;
        if (!inBox(box, nx, ny)) continue;
        const nk = keyOf(box, nx, ny);
        if (set.has(nk) && !seen.has(nk)) { seen.add(nk); stack.push(nk); }
      }
    }
    return seen.size === set.size;
  }

  // 一行的足迹已定（它的格在 owner 里已盖成它），登记结果，再给它的区域足迹子行划格。
  function settle(plan, id, parentIndex, list, size) {
    // 足迹登记：层根为 null（整个外包框）；作者画了 boundary 的行存下表序列表（表序有意义，流水水体的流向序）；其余行不存格列表——
    // 格的集合由归属数组加外包矩形加祖先链现扫（eachCell/cellsOf），全规模单层合计约 4,020 万格，三层列表常驻要 480 MB 以上（卷五 §4.1.4 :522）。
    const { cellsX, cellsY, x0, y0 } = plan.box;
    let bx0 = x0 + cellsX;
    let bx1 = x0 - 1;
    let by0 = y0 + cellsY;
    let by1 = y0 - 1;
    if (list === null) { bx0 = x0; bx1 = x0 + cellsX - 1; by0 = y0; by1 = y0 + cellsY - 1; } else {
      for (let i = 0; i < list.n; i += 1) {
        const k = list.a[i];
        const cx = k % cellsX;
        const cy = (k - cx) / cellsX;
        if (cx + x0 < bx0) bx0 = cx + x0;
        if (cx + x0 > bx1) bx1 = cx + x0;
        if (cy + y0 < by0) by0 = cy + y0;
        if (cy + y0 > by1) by1 = cy + y0;
      }
    }
    const ordered = list !== null && Array.isArray(rows.get(id).boundary) && rows.get(id).boundary.length > 0 && !rows.get(id).boundary.every(isRectEntry); // 矩形之并没有表序，不存列表
    plan.cells.set(id, list === null ? null : ordered ? list.toInt32() : undefined);
    plan.rect.set(id, { x0: bx0, x1: bx1, y0: by0, y1: by1 });
    plan.sizes.set(id, size);
    const children = (kids.get(id) || []).filter((c) => rows.get(c).kind === FOOTPRINT_KIND.region && !roots.has(c));
    if (children.length === 0) return;
    const me = plan.idx.get(id);
    const sub = partition(plan, id, me, size, children);
    for (const c of children) if (sub.get(c).length > 0) settle(plan, c, me, sub.get(c), sub.get(c).length);
    // 没划出足迹的子行（出错）已被登记；它们不进 cells，后代不划格。
  }

  for (const sp of [...spaces].sort((a, b) => a.w - b.w)) {
    const box = sp.box;
    const rootRow = rows.get(sp.root);
    if (!rootRow || rootRow.kind !== FOOTPRINT_KIND.region || rootRow.offstage) { err(rootRow ? 'E-DIM-DOMAIN-RANGE' : 'E-DIM-REF-MISSING', sp.root, `grid space ${sp.w} root is not a region-footprint row`); continue; }
    const total = box.cellsX * box.cellsY;
    // 生长堆的打包键 = 到种子的距离平方 × 区格数 + 次序号，须是安全整数；外包框大到装不下即拒收（不降级到别的算法、不静默放过）。
    const maxD2 = (box.cellsX - 1) * (box.cellsX - 1) + (box.cellsY - 1) * (box.cellsY - 1);
    if (!Number.isSafeInteger(total) || !Number.isSafeInteger((maxD2 + 1) * total)) { err('E-DIM-DOMAIN-RANGE', sp.root, `grid space ${sp.w} box ${box.cellsX} x ${box.cellsY} is too large for the partition heap keys (squared distance x cell count must fit 2^53)`); continue; }
    const plan = { w: sp.w, box, root: sp.root, total, ids: [], idx: new Map(), parentIdx: [], owner: new Int32Array(total), cells: new Map(), rect: new Map(), sizes: new Map(), order: [], geometry: new Map(), queued: null, heights: new Map(), adjacency: null, controlPoints: null };
    const rootIndex = register(plan, sp.root, NONE);
    plan.owner.fill(rootIndex);
    plans.set(sp.w, plan);
    settle(plan, sp.root, NONE, null, total);
    plan.queued = null; // 生长用的排队标记只在划分时用，划完即释放（不常驻）
  }
  return { plans, errors };
}

// ---------- 区格边长与中心的共用函数（卷五 §4.1.1 :433 区格序号、:499 区格中心；全书只在这里换算，别处调用，不各抄一份；门禁 pp_region_cell 的例外文件） ----------

/** 区格边长（定点米，BigInt）。@param {{regionCellM: number}} grid rules.grid @returns {bigint} */
export const regionSideFixed = (grid) => fixedUnits(grid.regionCellM);

/** 区格边长的一半（定点米，BigInt；区格中心 = 序号 × 边长 + 半边）。@param {{regionCellM: number}} grid @returns {bigint} */
export const regionHalfFixed = (grid) => fixedUnits(grid.regionCellM) >> 1n;

/**
 * 区格边长的细格数 = regionCellM ÷ cellM（须整除，否则 E-DET-DOMAIN；全书只在这里核整除）。
 * @param {{cellM: number, regionCellM: number}} grid rules.grid @returns {bigint}
 */
export function regionSideCells(grid) {
  const side = regionSideFixed(grid);
  const cell = fixedUnits(grid.cellM);
  if (cell <= 0n || side <= 0n || side % cell !== 0n) throw new KernelError('E-DET-DOMAIN', {}, 'regionSideCells: regionCellM must be a whole multiple of cellM');
  return side / cell;
}

/** 区格中心的定点米坐标（BigInt）：序号 × regionCellM + regionCellM ÷ 2。@param {{regionCellM: number}} grid @param {{x: number, y: number}} r 区格序号 @returns {{x: bigint, y: bigint}} */
export function regionCenterFixed(grid, r) {
  const side = regionSideFixed(grid);
  const half = regionHalfFixed(grid);
  return { x: BigInt(r.x) * side + half, y: BigInt(r.y) * side + half };
}

/** 区格中心的米数（number）。@param {{regionCellM: number}} grid @param {{x: number, y: number}} r @returns {{x: number, y: number}} */
export function regionCenterM(grid, r) {
  const c = regionCenterFixed(grid, r);
  return { x: fixedToNumber(c.x), y: fixedToNumber(c.y) };
}

/** 区格中心那一列的细格列号（序号 × 边长细格数 + 半边）。@param {{cellM: number, regionCellM: number}} grid @param {{x: number, y: number}} r @returns {{x: number, y: number}} */
export function regionCenterColumn(grid, r) {
  const per = regionSideCells(grid);
  const half = per >> 1n;
  return { x: Number(BigInt(r.x) * per + half), y: Number(BigInt(r.y) * per + half) };
}

// ---------- 格与位置（卷五 §4.1.1 位置、规则 12） ----------

/**
 * 区格序号 = floor(x × cellM ÷ regionCellM)（卷五 §4.1.1，派生，不存）。
 * @param {{cellM: number, regionCellM: number}} grid @param {{x: number, y: number}} pos @returns {{x: number, y: number}}
 */
export function regionOfPos(grid, pos) {
  const cellMf = fixedUnits(grid.cellM);
  const regionCellMf = regionSideFixed(grid);
  return { x: Number(floorDiv(BigInt(pos.x) * cellMf, regionCellMf)), y: Number(floorDiv(BigInt(pos.y) * cellMf, regionCellMf)) };
}

/**
 * zoneAt 的几何部分（卷五 §4.1 规则 12）：位置所在区格归属的最深区域足迹行；格空间不存在或位置在外包框之外为 null（未知）。
 * coarse 位置照样按它存的格求（规则 14 保证该格在目标地点足迹内）。建筑、房间、体积的最深足迹归 G7/G8。
 * @param {any} grid @param {Map<number, any>} plans planRegionFootprints 的计划 @param {{w: number, x: number, y: number}} pos
 * @returns {string | null}
 */
export function zoneOfPos(grid, plans, pos) {
  const plan = plans.get(pos.w);
  if (!plan) return null;
  const c = regionOfPos(grid, pos);
  if (!inBox(plan.box, c.x, c.y)) return null;
  const id = ownerIdAt(plan, keyOf(plan.box, c.x, c.y));
  return id === undefined ? null : id;
}

/** 一行足迹的区格序号列表，按 (x, y) 字典序。@param {any} plan @param {string} id @returns {{x: number, y: number}[]} */
export function cellList(plan, id) {
  const out = [];
  eachCell(plan, id, (k) => out.push({ x: xOf(plan.box, k), y: yOf(plan.box, k) }));
  return out.sort((a, b) => (cellLess(a, b) ? -1 : cellLess(b, a) ? 1 : 0));
}

/**
 * 区格 (x, y) 是否在行 id 的足迹里（含它的后代足迹的格；卷五 §4.1 规则 2、3 的"父足迹成员"）。行没划出足迹或区格在外包框外为假。
 * @param {any} plan @param {string} id @param {number} x @param {number} y @returns {boolean}
 */
export function footprintHas(plan, id, x, y) {
  if (!plan.cells.has(id) || !inBox(plan.box, x, y)) return false;
  return inFootprint(plan, plan.idx.get(id), keyOf(plan.box, x, y));
}

/**
 * 行 id 的足迹区格按 (x, y) 字典序惰性遍历，不物化列表（父行可能是整个世界：卷五 §4.1.4 全规模约 4,020 万区格，不得装进单个 Map、Set 或数组）。
 * 先取行的外包矩形（层根取整个外包框），只扫矩形里的格。
 * @param {any} plan @param {string} id @returns {Generator<{x: number, y: number}>}
 */
export function* footprintCells(plan, id) {
  if (!plan.cells.has(id)) return;
  if (cellCountOf(plan, id) === 0) return;
  // 行的足迹含后代的格，后代的格都在行自己的格之内（子足迹在父足迹内），所以划分时记下的外包矩形即可涵盖。
  const { x0, x1, y0, y1 } = plan.rect.get(id);
  const me = plan.idx.get(id);
  for (let x = x0; x <= x1; x += 1) for (let y = y0; y <= y1; y += 1) if (inFootprint(plan, me, keyOf(plan.box, x, y))) yield { x, y };
}

// ---------- 由足迹派生的几何量（卷五 §4.1 规则 13；区域足迹在区格粒度上算） ----------

/**
 * 区域足迹的面积与形心：areaM2 = 区格数 × regionCellM²；centroid = 各区格中心坐标的平均（定点，除法向零截断）。
 * 区格序号之和用 JS 数累加（精确到 2⁵³，全规模 4,020 万格 × 7,800 约 3×10¹¹），最后一次换成定点；结果与逐格定点累加逐位相同。
 * @param {any} grid @param {any} plan @param {string} id @returns {{cellCount: number, areaM2: number, centroid: {x: number, y: number}} | null}
 */
export function regionGeometry(grid, plan, id) {
  const count = cellCountOf(plan, id);
  if (count === 0) return null;
  // 面积与形心只由足迹与 regionCellM 决定（与种子、地形无关），按计划缓存。
  if (plan.geometry.has(id)) return plan.geometry.get(id);
  const regionCellMf = regionSideFixed(grid);
  const half = regionHalfFixed(grid);
  let sumX = 0;
  let sumY = 0;
  eachCell(plan, id, (k) => { sumX += xOf(plan.box, k); sumY += yOf(plan.box, k); });
  const n = BigInt(count);
  const out = {
    cellCount: count,
    areaM2: fixedToNumber(n * fixedUnits(grid.regionCellM * grid.regionCellM)),
    centroid: { x: fixedToNumber((BigInt(sumX) * regionCellMf + n * half) / n), y: fixedToNumber((BigInt(sumY) * regionCellMf + n * half) / n) },
  };
  plan.geometry.set(id, out);
  return out;
}

/**
 * 控制点：格空间里全部划出了足迹的区域足迹行（层根除外），位置取它的形心（卷五 §4.3 规则 8 :656 控制面）。按计划缓存。
 * 行的 anchorElevationM 未写（或不是数）时 elevM 为 null：该行仍是控制点，最近的控制点里有它时那一列的高度为未知（grid.mjs controlSurfaceAt），不跳过。
 * @param {any} grid @param {any} plan @param {Map<string, any>} rows @returns {{id: string, x: number, y: number, elevM: number | null}[]}
 */
export function controlPointsOf(grid, plan, rows) {
  if (plan.controlPoints) return plan.controlPoints;
  const out = [];
  for (const id of [...plan.cells.keys()].sort(cmp)) {
    if (plan.cells.get(id) === null) continue; // 层根（足迹恒为整个外包框，cells 为 null）不是控制点
    const a = rows.get(id).anchorElevationM;
    const g = regionGeometry(grid, plan, id);
    if (g) out.push({ id, x: g.centroid.x, y: g.centroid.y, elevM: typeof a === 'number' ? a : null });
  }
  // 冻结：grid.mjs 按数组缓存控制点的定点形式，"构造后不再改"由语言保证。
  for (const p of out) Object.freeze(p);
  plan.controlPoints = Object.freeze(out);
  return plan.controlPoints;
}

// 区格中心那一列的未修正地表高 h₀（定点米）：控制面 + 起伏，起伏幅度取该区格所属最深行的 terrain 条目。无控制点、无 terrain 条目即 null。
function cellH0(grid, worldSeed, plan, rows, terrainOf, controlPoints, k) {
  const owner = ownerIdAt(plan, k);
  const entry = owner === undefined ? null : terrainOf(rows.get(owner).terrain);
  let h = null;
  if (entry && controlPoints.length > 0 && typeof worldSeed === 'string') {
    const c = regionCenterM(grid, { x: xOf(plan.box, k), y: yOf(plan.box, k) });
    h = surfaceHeightAt(grid, worldSeed, plan.w, controlPoints, entry.reliefM, entry.reliefRough, c.x, c.y);
  }
  return h;
}

// 水体行（挂了 waterKind 的区域足迹行）的河床（卷五 §4.3 规则 8 "河床"，纯函数 kernel/water-bed.mjs）：按计划与世界种子缓存。
// 一行的 bed 按行整体求（前缀最小、上游出口值都是整行的量），取到哪一格都先求完整行；区格下标到行内位置的索引用排序后的下标列（不建 Map：海可能有上千万格）。
function waterBedsOf(grid, worldSeed, plan, rows, terrainOf) {
  if (plan.waterBeds && plan.waterBeds.seed === worldSeed) return plan.waterBeds;
  const cps = controlPointsOf(grid, plan, rows);
  const upstream = new Map();
  for (const id of [...plan.cells.keys()].sort(cmp)) {
    const r = rows.get(id);
    if (plan.cells.get(id) === null || typeof r.waterKind !== 'string' || typeof r.downstream !== 'string') continue;
    if (!upstream.has(r.downstream)) upstream.set(r.downstream, []);
    upstream.get(r.downstream).push(id);
  }
  const infos = new Map();
  const infoOf = (id) => {
    if (infos.has(id)) return infos.get(id);
    const list = cellsOf(plan, id);
    const xs = new Int32Array(list.length);
    const ys = new Int32Array(list.length);
    const h0 = new BigInt64Array(list.length);
    let unknown = false;
    for (let i = 0; i < list.length; i += 1) {
      xs[i] = xOf(plan.box, list[i]);
      ys[i] = yOf(plan.box, list[i]);
      if (!unknown) {
        const h = cellH0(grid, worldSeed, plan, rows, terrainOf, cps, list[i]);
        if (h === null) unknown = true; else h0[i] = h;
      }
    }
    const r = rows.get(id);
    const info = { ordered: r.flowing === true && Array.isArray(r.boundary) && r.boundary.length > 0, cells: { xs, ys }, h0: unknown ? null : h0 };
    infos.set(id, info);
    return info;
  };
  const api = createWaterBeds({ upstreamsOf: (id) => upstream.get(id) || [], infoOf });
  plan.waterBeds = { seed: worldSeed, api, index: new Map() };
  return plan.waterBeds;
}

// 一行里区格下标 k 的位置：行的区格下标列排成升序（打包 key×n+位置 成一个不超过 2⁵³ 的整数，用原生数值排序，不用比较函数），再二分。
function bedPositionOf(plan, wb, id, k) {
  let idx = wb.index.get(id);
  if (!idx) {
    const list = cellsOf(plan, id);
    const n = list.length;
    const packed = new Float64Array(n);
    for (let i = 0; i < n; i += 1) packed[i] = list[i] * n + i;
    packed.sort();
    const keys = new Int32Array(n);
    const pos = new Int32Array(n);
    for (let i = 0; i < n; i += 1) { const at = packed[i] % n; pos[i] = at; keys[i] = (packed[i] - at) / n; }
    idx = { keys, pos };
    wb.index.set(id, idx);
  }
  let lo = 0;
  let hi = idx.keys.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (idx.keys[mid] === k) return idx.pos[mid];
    if (idx.keys[mid] < k) lo = mid + 1; else hi = mid - 1;
  }
  return -1;
}

// 区格中心那一列的地表高 h（卷五 §4.3 规则 8）：水体足迹的区格取河床高 bed（湖、海取水底高；规则 13 代表地表高与规则 10 水面口径一律取 bed），其余区格取 h₀；
// 计划标了 bedOff（卷十 R10-2.12 求值次序：生成水体行的下游链先按未修正 h₀ 派生）时一律取 h₀。bed 未知（任一需要的 h₀ 为 null）即未知，不借 h₀ 顶替。
function cellHeight(grid, worldSeed, plan, rows, terrainOf, controlPoints, k) {
  const h0 = cellH0(grid, worldSeed, plan, rows, terrainOf, controlPoints, k);
  if (h0 === null || plan.bedOff === true) return h0;
  const owner = ownerIdAt(plan, k);
  if (owner === undefined || typeof rows.get(owner).waterKind !== 'string' || plan.cells.get(owner) === null) return h0;
  const wb = waterBedsOf(grid, worldSeed, plan, rows, terrainOf);
  const bed = wb.api.bedOf(owner);
  if (bed === null) return null;
  const at = bedPositionOf(plan, wb, owner, k);
  return at < 0 ? h0 : bed[at];
}

/**
 * 区格的河床修正量 δ(c) = h₀(c) − bed(c)（定点米，不小于 0；卷五 §4.3 规则 8 末条：该区格内每一列的 h 都减去同一个修正量）。
 * 不在水体足迹里、计划标了 bedOff、h₀ 或 bed 未知时为 null（未知时调用方不修正；非水体区格为 0n）。
 * @param {any} grid @param {string | undefined} worldSeed @param {any} plan @param {Map<string, any>} rows
 * @param {(code: string) => {reliefM: number, reliefRough: number} | null} terrainOf @param {number} rx @param {number} ry @returns {bigint | null}
 */
export function regionBedDelta(grid, worldSeed, plan, rows, terrainOf, rx, ry) {
  if (!inBox(plan.box, rx, ry)) return null;
  const k = keyOf(plan.box, rx, ry);
  const cps = controlPointsOf(grid, plan, rows);
  const h0 = cellH0(grid, worldSeed, plan, rows, terrainOf, cps, k);
  const h = cellHeight(grid, worldSeed, plan, rows, terrainOf, cps, k);
  return h0 === null || h === null ? null : h0 - h;
}

/**
 * 区域足迹的代表海拔与层号范围：每个区格取中心那一列的 h，elevationM = 平均（定点，除法向零截断），zRange = 各区格地表层号的最小与最大。
 * 世界种子或 terrain 条目缺失、格空间没有控制点即返回 null（未知，不借别的量）。结果按（世界种子，行）缓存在计划上
 * （计划已含全部生成输入，输入变了计划重划，缓存随之丢弃）。
 * @param {any} grid @param {string | undefined} worldSeed @param {any} plan @param {Map<string, any>} rows
 * @param {(code: string) => {reliefM: number, reliefRough: number} | null} terrainOf @param {string} id
 * @returns {{elevationM: number, zRange: {zMin: number, zMax: number}} | null}
 */
export function regionHeights(grid, worldSeed, plan, rows, terrainOf, id) {
  const count = cellCountOf(plan, id);
  if (count === 0) return null;
  const key = typeof worldSeed === 'string' ? `${worldSeed}|${id}` : null;
  if (key !== null && plan.heights.has(key)) return plan.heights.get(key);
  const cps = controlPointsOf(grid, plan, rows);
  let sum = 0n;
  let zMin = null;
  let zMax = null;
  let unknown = false;
  eachCell(plan, id, (k) => {
    if (unknown) return;
    const h = cellHeight(grid, worldSeed, plan, rows, terrainOf, cps, k);
    if (h === null) { unknown = true; return; }
    sum += h;
    const z = surfaceStorey(grid, h);
    if (zMin === null || z < zMin) zMin = z;
    if (zMax === null || z > zMax) zMax = z;
  });
  const out = unknown ? null : { elevationM: fixedToNumber(sum / BigInt(count)), zRange: { zMin, zMax } };
  if (key !== null) plan.heights.set(key, out);
  return out;
}

/**
 * 区格的代表格（卷五 §3.1 regionCell、§4.1.1）：该区格中心列地表层那一格，coarse 为真；只用高度场，不生成细格。
 * 区格在外包框之外或高度算不出为 null。
 * @param {any} grid rules.grid @param {string | undefined} worldSeed 世界种子 @param {any} plan 一个格空间的划分计划 @param {Map<string, any>} rows 行输入
 * @param {(code: string) => {reliefM: number, reliefRough: number} | null} terrainOf terrain 条目 @param {number} rx 区格 x @param {number} ry 区格 y
 * @returns {{w: number, x: number, y: number, z: number, coarse: boolean} | null}
 */
export function regionCellPos(grid, worldSeed, plan, rows, terrainOf, rx, ry) {
  if (!inBox(plan.box, rx, ry)) return null;
  const h = cellHeight(grid, worldSeed, plan, rows, terrainOf, controlPointsOf(grid, plan, rows), keyOf(plan.box, rx, ry));
  if (h === null) return null;
  const col = regionCenterColumn(grid, { x: rx, y: ry });
  return { w: plan.w, x: col.x, y: col.y, z: surfaceStorey(grid, h), coarse: true };
}

/**
 * 区格中心那一列的地表高（定点米；卷五 §4.3 规则 8），路网栅格化与区格寻路读它算坡度。区格在外包框外、世界种子或 terrain 条目或控制点缺失为 null（未知）。
 * @param {any} grid rules.grid @param {string | undefined} worldSeed @param {any} plan @param {Map<string, any>} rows
 * @param {(code: string) => {reliefM: number, reliefRough: number} | null} terrainOf @param {number} rx @param {number} ry @returns {bigint | null}
 */
export function regionCellHeight(grid, worldSeed, plan, rows, terrainOf, rx, ry) {
  if (!inBox(plan.box, rx, ry)) return null;
  return cellHeight(grid, worldSeed, plan, rows, terrainOf, controlPointsOf(grid, plan, rows), keyOf(plan.box, rx, ry));
}

/**
 * 落格（卷五 §4.1 规则 14，区域足迹、coarse 为真的代表格）：只在 zoneAt 恰为 place 的区格里取（落在更深后代足迹里的不算），
 * 按 landOrderKey(seedKey, w, x, y) 升序（并列 (x, y) 字典序）取第一个的中心列地表层那一格；没有可落的区格或高度算不出为 null。纯函数。
 * @param {any} grid rules.grid @param {string | undefined} worldSeed 世界种子 @param {any} plan 一个格空间的划分计划 @param {Map<string, any>} rows 行输入
 * @param {(code: string) => {reliefM: number, reliefRough: number} | null} terrainOf terrain 条目 @param {string} id 地点行 @param {string} seedKey 调用方给的种子键 @param {((pos: {w: number, x: number, y: number, z: number, coarse: boolean}) => boolean)} accept 必填：代表格是否可落（zoneAt 恰为本地点；不传即抛错，不得跳过核对）
 * @returns {{w: number, x: number, y: number, z: number, coarse: boolean} | null}
 */
export function landRegionCell(grid, worldSeed, plan, rows, terrainOf, id, seedKey, accept) {
  if (typeof accept !== 'function') throw new TypeError('landRegionCell: accept (zoneAt 恰为本地点的判定) is required');
  if (!plan.cells.has(id)) return null;
  const me = plan.idx.get(id);
  // 流式取"下一个最小者"（不物化区格列表）：每轮只留 (landOrderKey, x, y) 严格大于上一个的最小者；
  // accept（必填）核代表格的 zoneAt 恰为本地点（卷五 :504），不合格就看序里下一个区格。
  let last = null;
  for (;;) {
    let best = null;
    eachCell(plan, id, (k) => {
      if (plan.owner[k] !== me) return;
      const c = { x: xOf(plan.box, k), y: yOf(plan.box, k) };
      const order = landOrderKey(seedKey, plan.w, c.x, c.y);
      if (last !== null && !(order > last.order || (order === last.order && cellLess(last.c, c)))) return;
      if (best === null || order < best.order || (order === best.order && cellLess(c, best.c))) best = { order, c };
    });
    if (best === null) return null;
    last = best;
    const pos = regionCellPos(grid, worldSeed, plan, rows, terrainOf, best.c.x, best.c.y);
    if (pos === null) return null; // 高度读不到：未知，不跳过往下找
    if (accept(pos)) return pos;
  }
}

/**
 * 接入格（卷五 §4.1 规则 4）：一行足迹内离目标点（定点米）直线最近的区格，并列取区格序号 (x, y) 字典序最小。
 * @param {any} grid @param {any} plan @param {string} id @param {bigint} tx @param {bigint} ty @returns {{x: number, y: number} | null}
 */
export function accessCell(grid, plan, id, tx, ty) {
  if (cellCountOf(plan, id) === 0) return null;
  let best = null;
  eachCell(plan, id, (k) => {
    const c = { x: xOf(plan.box, k), y: yOf(plan.box, k) };
    const m = regionCenterFixed(grid, c);
    const d2 = dist2Fixed(m.x, m.y, tx, ty);
    if (best === null || d2 < best.d2 || (d2 === best.d2 && cellLess(c, best.c))) best = { d2, c };
  });
  return best.c;
}

/**
 * 足迹的开阔边界（卷五 §4.1 规则 9 第三种出口）：足迹里与外侧相邻的区格（四邻中有一格在外包框内、且不属本行足迹），
 * 一格一项，按 (x, y) 字典序。区格层没有"不可通行"的格（区格寻路对任何地形都有步进代价，规则 5），所以外侧只要在外包框内即算可通行。
 * @param {any} plan @param {string} id @returns {{x: number, y: number}[]}
 */
export function openBoundaryCells(plan, id) {
  if (!plan.cells.has(id)) return [];
  const me = plan.idx.get(id);
  const out = [];
  eachCell(plan, id, (k) => {
    const x = xOf(plan.box, k);
    const y = yOf(plan.box, k);
    const open = NEIGHBORS_4.some(([dx, dy]) => inBox(plan.box, x + dx, y + dy) && !inFootprint(plan, me, keyOf(plan.box, x + dx, y + dy)));
    if (open) out.push({ x, y });
  });
  return out.sort((a, b) => (cellLess(a, b) ? -1 : cellLess(b, a) ? 1 : 0));
}

/**
 * 足迹相邻（卷五 §4.14 规则 2）：两个地点相邻当且仅当二者互不为祖先后代、且足迹里有一对四邻接的区格。
 * 返回 Map<id, Set<id>>（对称）。祖先关系取计划里的父链。整个格空间只算一次、缓存在计划上。
 * @param {any} plan @returns {Map<string, Set<string>>}
 */
export function footprintAdjacency(plan) {
  if (plan.adjacency) return plan.adjacency;
  const chains = [];
  const chainOf = (i) => {
    if (chains[i]) return chains[i];
    const list = [];
    for (let c = i; c !== NONE; c = plan.parentIdx[c]) list.push(c);
    chains[i] = { list, set: new Set(list) };
    return chains[i];
  };
  const out = new Map();
  const add = (a, b) => {
    const ia = plan.ids[a];
    if (!out.has(ia)) out.set(ia, new Set());
    out.get(ia).add(plan.ids[b]);
  };
  const pair = (oa, ob) => {
    if (ob === NONE || ob === oa) return;
    const ca = chainOf(oa);
    const cb = chainOf(ob);
    // 只配对两条祖先链各自独有的行：独有的行之间互不为祖先后代（祖先必在对方链内）。
    for (const a of ca.list) {
      if (cb.set.has(a)) continue;
      for (const b of cb.list) {
        if (ca.set.has(b)) continue;
        add(a, b);
        add(b, a);
      }
    }
  };
  const { cellsX, cellsY } = plan.box;
  // 每对四邻只看右邻与上邻一次（关系对称，上面 pair 两个方向都登）。
  for (let k = 0; k < plan.total; k += 1) {
    const oa = plan.owner[k];
    if (oa === NONE) continue;
    if (k % cellsX < cellsX - 1) pair(oa, plan.owner[k + 1]);
    if (k + cellsX < cellsX * cellsY) pair(oa, plan.owner[k + cellsX]);
  }
  plan.adjacency = out;
  return out;
}

// ---------- 两种几何读法：直线距离与方位角（卷五 §4.1 规则 5、§4.2 规则 12–13） ----------

/**
 * 直线距离的核心算法（kernelApi `straightM` 在 place.mjs，包本函数；本函数改名 straightFixed，避免与入口同名，公共部件修理 C4，乙 15）：同一格空间时 = fixedSqrtInt(dx² + dy² + dz²)，dx、dy 是细格中心的米差（细格序号差 × cellM），
 * dz 是层号差 × storeyM；全程整数定点，开方截断，对称。两位置不在同一格空间为 null（未知）。
 * @param {{cellM: number, storeyM: number}} grid @param {{w: number, x: number, y: number, z: number}} a @param {{w: number, x: number, y: number, z: number}} b
 * @returns {bigint | null} 定点米（SCALE 标度）
 */
export function straightFixed(grid, a, b) {
  if (a.w !== b.w) return null;
  const cellMf = fixedUnits(grid.cellM);
  const storeyMf = fixedUnits(grid.storeyM);
  const dx = (BigInt(a.x) - BigInt(b.x)) * cellMf;
  const dy = (BigInt(a.y) - BigInt(b.y)) * cellMf;
  const dz = (BigInt(a.z) - BigInt(b.z)) * storeyMf;
  return fixedSqrtInt(dx * dx + dy * dy + dz * dz);
}

/**
 * 方位角与前后左右（卷五 §4.2 规则 12、13；全书唯一算法）：平面差（dx 向东、dy 向北）经定点 atan 求角，正北 0、顺时针，[0, 整圈)；
 * 平面上重合或不在同一格空间为 null。方位角只依赖整圈度数 fullTurnDeg（四分之一圈、半圈都是整圈的移位），不依赖朝向档数。
 * 给了 facing（朝向档序号，[0, facingDirections)）时给相对方位代号：相对角 = (方位角 − 朝向 × 每档度数) 取模整圈，
 * 以 0、每档度数、… 为中心、各宽一档的扇区（边界上的角归顺时针方向的下一扇区）；朝向只有卷文定的八向（facingDirections 加载期只许八）；上下另看层号差。
 * @param {{fullTurnDeg: number, facingDirections: number, cellM: number}} grid
 * @param {{w: number, x: number, y: number, z: number}} a @param {{w: number, x: number, y: number, z: number}} b @param {number | null} [facing]
 * @returns {{bearingDeg: number, relative: string | null, vertical: 'up' | 'down' | 'level'} | null}
 */
export function bearingView(grid, a, b, facing = null) {
  if (a.w !== b.w) return null;
  if (facing !== null && !(Number.isInteger(facing) && facing >= 0 && facing < grid.facingDirections)) {
    throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `facing ${facing}: want integer in [0, ${grid.facingDirections - 1}]`);
  }
  const dx = BigInt(b.x) - BigInt(a.x);
  const dy = BigInt(b.y) - BigInt(a.y);
  if (dx === 0n && dy === 0n) return null;
  const turn = fixedUnits(grid.fullTurnDeg);
  const halfTurn = turn >> 1n;
  const quarterTurn = halfTurn >> 1n;
  const eighthTurn = quarterTurn >> 1n; // atan(1) = π/4 对应八分之一圈（圆周分数，与朝向档数无关）
  const ax = dx < 0n ? -dx : dx;
  const ay = dy < 0n ? -dy : dy;
  // 与正北轴的夹角 θ ∈ [0, 四分之一圈]：θ = 八分之一圈 × atan(小/大) ÷ atan(1)。
  const one8 = fixedUnits8(1);
  const eighth = atan(one8); // π/4，同 det-math 表取法，不另写常数
  let theta;
  if (ax === 0n) theta = 0n;
  else if (ay === 0n) theta = quarterTurn;
  else if (ax <= ay) theta = (atan((ax * one8) / ay) * eighthTurn) / eighth;
  else theta = quarterTurn - (atan((ay * one8) / ax) * eighthTurn) / eighth;
  let bearing;
  if (dx >= 0n && dy >= 0n) bearing = theta;
  else if (dx >= 0n) bearing = halfTurn - theta;
  else if (dy < 0n) bearing = halfTurn + theta;
  else bearing = turn - theta;
  if (bearing === turn) bearing = 0n;
  let relative = null;
  if (facing !== null) { // 朝向档数只能是卷文定的八向（规则表 facingDirections 的取值域在加载期钉死为八）
    const step = turn / BigInt(grid.facingDirections); // 每档度数（定点）
    let rel = (bearing - BigInt(facing) * step) % turn;
    if (rel < 0n) rel += turn;
    // 扇区以每档度数的倍数为中心、宽一档：下标 = floor((相对角 + 半档) ÷ 档)，对档数取模；边界上的角（恰差半档）归下一扇区。
    const index = Number((((rel + (step >> 1n)) / step) % BigInt(grid.facingDirections)));
    relative = RELATIVE[index];
  }
  const vertical = b.z > a.z ? 'up' : b.z < a.z ? 'down' : 'level';
  return { bearingDeg: fixedToNumber(bearing), relative, vertical };
}
