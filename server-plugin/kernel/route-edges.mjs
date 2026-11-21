// 路网边的栅格化与位置到位置的区格寻路（格子迁移 G4；卷五 §4.1 规则 4、5、7，§4.10 规则 1、5）。place.mjs 的 routeView、pathView 与加载期校验共用本文件。
// 路网边只存"两个站点之间有路"的关系（from、to、waterway、portal）；路程、地形构成、爬升、路况都不存，这里把边栅格化到区格上派生（拍板第 12 条）：
//  接入格 = 一端足迹内离另一端形心直线最近的区格（并列取区格序号 (x, y) 字典序最小；accessCell）；
//  陆路边在两接入格之间做区格八邻寻路，一步代价 = 步长 × 终点区格 terrain.paceFactor × lookup(slopeCurve, |高差| ÷ 步长)；
//  水路边只走可航水体足迹区格（water.navigable 为真），一步代价 = 步长；找不到即不可栅格化（加载期报 E-GRID-WATERWAY-NO-CHANNEL）。
// 位置到位置（pathView）在同一张区格图上寻路：道路与航道区格的步进系数取 grid.roadPaceFactor、不乘坡度项的水体与航道格按 1 计（规则 5），
// 路网就在这张图上、是代价更低的格，不是唯一通道（离路穿越）。两位置在不同格空间时只经一道门（规则 5 末项、规则 7）。
// 结果只由生成输入决定，按（边，输入版本）缓存：环境对象由 place.mjs 按"地点表 + 规则 + 词表 + 偏离行"的足迹计划缓存，输入变了即新建、旧缓存随之丢弃。
// 全程整数；步长、代价式与图搜索见 route-grid.mjs；本文件不写 0、1、-1 以外的数字字面量，常数只来自规则表。
// 全规模：区格不装入任何全世界级 Map/Set——高度缓存与路网区格集按格空间分片，且高度缓存超过两倍展开上限即清空（缓存只影响速度，不影响结果）。

import { fixedUnits, fixedToNumber, fixedScale } from './det-math.mjs';
import { accessCell, regionGeometry, regionOfPos, regionCellHeight, ownerIdAt, inBox, keyOf, xOf, yOf } from './footprint.mjs';
import { regionPath, stepLengths, slopeTerm, pathMetrics } from './route-grid.mjs';

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const absDiff = (a, b) => (a > b ? a - b : b - a);
const FAMILY = Object.freeze({ terrain: 'terrain' });
const ROAD = Object.freeze({ none: 'none', land: 'land', water: 'water' });

/**
 * 建一个路网环境（只读计划，惰性派生并缓存）。入参：
 *  grid——rules.grid（regionCellM、roadPaceFactor、longCostCap 等）；modifiers——rules.terrainModifiers（slopeCurve）；
 *  vocabIndex——词表索引（terrain 条目的 paceFactor、water 条目的 navigable）；worldSeed——世界种子（高度场）；
 *  rp——place-plan.mjs buildPlan 的结果（plans、rows、offstage）；terrainOf——terrain 条目的起伏字段读法（同 footprint.mjs）；
 *  edges——路网边（已去掉离场行的边）。规则常数缺（roadPaceFactor、longCostCap、slopeCurve）时 ready 为 false，各读法一律为 null（未知，不给缺省）。
 * @param {{grid: any, modifiers: any, vocabIndex: Map<string, any> | undefined, worldSeed: string | undefined, rp: any, terrainOf: (code: string) => any, edges: any[]}} input
 */
export function createRouteEnv({ grid, modifiers, vocabIndex, worldSeed, rp, terrainOf, edges }) {
  const scale = fixedScale();
  const scale2 = scale * scale;
  const ready = Boolean(grid) && typeof grid.roadPaceFactor === 'number' && Number.isInteger(grid.longCostCap)
    && Boolean(modifiers) && Array.isArray(modifiers.slopeCurve) && Boolean(modifiers.slopeCurve.length);
  if (!ready) return Object.freeze({ ready, rasterEdge: () => null, roadsOf: () => null, regionRoute: () => null, lengthOf: () => null, pathBetween: () => null });
  const cap = grid.longCostCap;
  const lens = stepLengths(grid);
  const slopePoints = modifiers.slopeCurve.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]);
  const roadPace = fixedUnits(grid.roadPaceFactor);
  const paces = [];
  for (const [, rec] of vocabIndex instanceof Map ? vocabIndex : []) {
    if (rec && rec.family === FAMILY.terrain && rec.entry && typeof rec.entry.paceFactor === 'number') paces.push(fixedUnits(rec.entry.paceFactor));
  }
  const minOf = (list, init) => list.reduce((m, v) => (v < m ? v : m), init);
  const minPace = minOf(paces, roadPace); // 道路区格也走（规则 5），下界取二者小者
  const minSlope = minOf(slopePoints.map((p) => p[1]), scale); // 水体与航道格的坡度项按 1 计，下界取二者小者
  const lowerOf = (pace, slope) => ({ orth: Number((lens.orth * pace * slope) / scale2), diag: Number((lens.diag * pace * slope) / scale2) });
  const rowOf = (id) => rp.rows.get(id);

  // ---- 区格属性（按格空间分片缓存：每个格空间一份高度缓存，每个归属行一份地形与水体信息） ----
  const shards = new Map();
  const shardOf = (plan) => {
    if (shards.has(plan)) return shards.get(plan);
    const owners = new Map();
    const heights = new Map();
    const ownerInfo = (owner) => {
      if (owners.has(owner)) return owners.get(owner);
      const row = rowOf(owner);
      const rec = vocabIndex instanceof Map && typeof row.terrain === 'string' ? vocabIndex.get(row.terrain) : undefined;
      const pace = rec && rec.entry && typeof rec.entry.paceFactor === 'number' ? fixedUnits(rec.entry.paceFactor) : null;
      // 水体：本行或任一祖先挂 waterKind；可航：其中某个水体类的词表条目 navigable 为真。
      let water = false;
      let navigable = false;
      for (let id = owner; id !== null && id !== undefined; id = rowOf(id).parent) {
        const wk = rowOf(id).waterKind;
        if (typeof wk !== 'string') continue;
        water = true;
        const wr = vocabIndex instanceof Map ? vocabIndex.get(wk) : undefined;
        if (wr && wr.entry && wr.entry.navigable === true) navigable = true;
      }
      const info = Object.freeze({ terrain: typeof row.terrain === 'string' ? row.terrain : null, pace, water, navigable });
      owners.set(owner, info);
      return info;
    };
    const heightOf = (k) => {
      if (heights.has(k)) return heights.get(k);
      if (heights.size > cap + cap) heights.clear();
      const h = regionCellHeight(grid, worldSeed, plan, rp.rows, terrainOf, xOf(plan.box, k), yOf(plan.box, k));
      heights.set(k, h);
      return h;
    };
    const attrs = (k) => {
      const owner = ownerIdAt(plan, k); // 没有归属行为 undefined
      return owner === undefined ? null : { ...ownerInfo(owner), h: heightOf(k) };
    };
    const shard = { attrs, roads: null };
    shards.set(plan, shard);
    return shard;
  };

  const planOfRow = (id) => {
    for (const plan of rp.plans.values()) if (plan.cells.has(id)) return plan;
    return null;
  };

  // ---- 三种代价模型（卷五 §4.1 规则 4、规则 5；一步代价为定点单次整除截断，下界 lower 同式、取各系数的最小值，故可采纳） ----
  const landModel = (plan) => {
    const { attrs } = shardOf(plan);
    return {
      box: plan.box,
      lens,
      lower: lowerOf(minPace, minSlope),
      stepCost: (u, v, len) => {
        const a = attrs(u);
        const b = attrs(v);
        if (a === null || b === null || a.h === null || b.h === null || b.pace === null) return null;
        return (len * b.pace * slopeTerm(slopePoints, absDiff(a.h, b.h), len)) / scale2;
      },
    };
  };
  const waterModel = (plan, dst) => {
    const { attrs } = shardOf(plan);
    return {
      box: plan.box,
      lens,
      lower: { orth: Number(lens.orth), diag: Number(lens.diag) },
      stepCost: (u, v, len) => {
        const b = attrs(v);
        if (b === null || (v !== dst && !b.navigable)) return null;
        return len;
      },
    };
  };
  const freeModel = (plan, roads) => {
    const { attrs } = shardOf(plan);
    return {
      box: plan.box,
      lens,
      lower: lowerOf(minPace, minSlope),
      stepCost: (u, v, len) => {
        const a = attrs(u);
        const b = attrs(v);
        if (a === null || b === null) return null;
        const road = roads.water.has(v) ? ROAD.water : roads.land.has(v) ? ROAD.land : ROAD.none;
        const pace = road === ROAD.none ? b.pace : roadPace;
        if (pace === null) return null;
        // 水体格与航道格的步不乘坡度项、坡度项按 1 计（规则 5）；陆地步要两端有地表高。
        let slope = scale;
        if (!b.water && road !== ROAD.water) {
          if (a.h === null || b.h === null) return null;
          slope = slopeTerm(slopePoints, absDiff(a.h, b.h), len);
        }
        return (len * pace * slope) / scale2;
      },
    };
  };

  // ---- 路网边栅格化（规则 4）：结果按边缓存 ----
  const rastered = new Map();
  /**
   * 一条非门边的栅格化结果（存储方向 from → to）：{ok: true, w, keys: 区格下标串, cells: 区格序号串 [{x, y}], distance, ascent（定点，高度缺为 null）, mix: Map<地形, 定点份额> | null, speed（定点）, expanded}；
   * 不可栅格化（两端不在同一格空间的区域足迹里、两端足迹没划出、找不到路、超展开上限、规则常数缺）为 {ok: false, reason}。
   * @param {{from: string, to: string, waterway: boolean}} e
   */
  const rasterEdge = (e) => {
    const key = `${e.from}\u0000${e.to}\u0000${e.waterway}`;
    if (rastered.has(key)) return rastered.get(key);
    const out = rasterOnce(e);
    rastered.set(key, out);
    return out;
  };
  const rasterOnce = (e) => {
    const plan = planOfRow(e.from);
    if (plan === null || !plan.cells.has(e.to)) return { ok: false, reason: 'no-footprint' };
    const gf = regionGeometry(grid, plan, e.from);
    const gt = regionGeometry(grid, plan, e.to);
    const s = accessCell(grid, plan, e.from, fixedUnits(gt.centroid.x), fixedUnits(gt.centroid.y));
    const t = accessCell(grid, plan, e.to, fixedUnits(gf.centroid.x), fixedUnits(gf.centroid.y));
    const src = keyOf(plan.box, s.x, s.y);
    const dst = keyOf(plan.box, t.x, t.y);
    const r = regionPath(e.waterway ? waterModel(plan, dst) : landModel(plan), src, dst, cap);
    if (r.cells === null) return { ok: false, reason: r.capped ? 'capped' : 'unreachable', expanded: r.expanded };
    // 路段派生量（路程、爬升、地形构成、路况）：route-grid.mjs pathMetrics。
    const m = pathMetrics({ box: plan.box, lens, attrs: shardOf(plan).attrs, slopePoints, roadPace }, r.cells, e.waterway);
    return { ok: true, w: plan.w, keys: r.cells, cells: r.cells.map((k) => ({ x: xOf(plan.box, k), y: yOf(plan.box, k) })), ...m, expanded: r.expanded };
  };

  // 一条边的路程（定点）：门边 0；其余取栅格化的路程；算不出为 null（路网最短路只在能算出路程的边上求）。
  const lengthOf = (e) => {
    if (e.portal !== undefined && e.portal !== null) return 0n;
    const r = rasterEdge(e);
    return r.ok ? r.distance : null;
  };

  // ---- 路网区格集（规则 5：道路与航道区格）：本格空间内全部非门边的区格串之并，按格空间分片，惰性 ----
  const roadsOf = (plan) => {
    const shard = shardOf(plan);
    if (shard.roads !== null) return shard.roads;
    const land = new Set();
    const water = new Set();
    for (const e of edges) {
      if (e.portal !== undefined && e.portal !== null) continue;
      if (!plan.cells.has(e.from) || !plan.cells.has(e.to)) continue;
      const r = rasterEdge(e);
      if (!r.ok) continue;
      for (const k of r.keys) (e.waterway ? water : land).add(k);
    }
    shard.roads = { land, water };
    return shard.roads;
  };

  // ---- 位置到位置（规则 5）：同一格空间在区格图上寻路；方向取区格序号小的一端写起、再按调用方向倒写，去程回程同一条路径 ----
  const routeMemo = new Map();
  const regionRoute = (posA, posB) => {
    if (posA.w !== posB.w) return null;
    const plan = rp.plans.get(posA.w);
    if (!plan) return null;
    const ca = regionOfPos(grid, posA);
    const cb = regionOfPos(grid, posB);
    if (!inBox(plan.box, ca.x, ca.y) || !inBox(plan.box, cb.x, cb.y)) return null;
    const forward = ca.x < cb.x || (ca.x === cb.x && ca.y <= cb.y);
    const [first, second] = forward ? [ca, cb] : [cb, ca];
    // 按（两端、输入版本）缓存、不落盘：环境对象随输入重建，键里不再放版本（规则 5 末项）。
    const key = `${plan.w}\u0000${first.x}\u0000${first.y}\u0000${second.x}\u0000${second.y}`;
    if (!routeMemo.has(key)) {
      if (routeMemo.size > cap) routeMemo.clear();
      const r = regionPath(freeModel(plan, roadsOf(plan)), keyOf(plan.box, first.x, first.y), keyOf(plan.box, second.x, second.y), cap);
      let distance = 0n;
      if (r.cells !== null) {
        for (let i = 1; i < r.cells.length; i += 1) {
          const dx = xOf(plan.box, r.cells[i - 1]) !== xOf(plan.box, r.cells[i]);
          const dy = yOf(plan.box, r.cells[i - 1]) !== yOf(plan.box, r.cells[i]);
          distance += dx && dy ? lens.diag : lens.orth;
        }
      }
      routeMemo.set(key, r.cells === null ? null : { cells: r.cells.map((k) => ({ x: xOf(plan.box, k), y: yOf(plan.box, k) })), distance, expanded: r.expanded });
    }
    const hit = routeMemo.get(key);
    if (hit === null) return null;
    return { w: plan.w, cells: forward ? hit.cells : [...hit.cells].reverse(), distance: hit.distance, expanded: hit.expanded };
  };

  /**
   * pathView 的几何部分：{steps: [{w, x, y}]（区格序号串）, distance: 定点米, expanded} | null（未知）。
   * 同一格空间：区格寻路；不同格空间：经各道门（portal 边，两个方向都可走）"起点到门的这一格 + 门的那一格到终点"中路程最小者，门本身计 0、只经一道门，
   * 并列取边的两端 id 序小的（卷五 §4.1 规则 5 位置到位置末句、规则 7）。
   */
  const pathBetween = (posA, posB) => {
    if (posA.w === posB.w) {
      const r = regionRoute(posA, posB);
      return r === null ? null : { steps: r.cells.map((c) => ({ w: r.w, ...c })), distance: r.distance, expanded: r.expanded };
    }
    const doors = edges.filter((e) => e.portal !== undefined && e.portal !== null)
      .sort((p, q) => cmp(`${p.from}\u0000${p.to}\u0000${p.waterway}`, `${q.from}\u0000${q.to}\u0000${q.waterway}`));
    let best = null;
    for (const e of doors) {
      for (const [da, db] of [[e.portal.a, e.portal.b], [e.portal.b, e.portal.a]]) {
        if (da.w !== posA.w || db.w !== posB.w) continue;
        const first = regionRoute(posA, da);
        const second = regionRoute(db, posB);
        if (first === null || second === null) continue;
        const distance = first.distance + second.distance;
        if (best === null || distance < best.distance) {
          best = { steps: [...first.cells.map((c) => ({ w: first.w, ...c })), ...second.cells.map((c) => ({ w: second.w, ...c }))], distance, expanded: first.expanded + second.expanded };
        }
      }
    }
    return best;
  };

  return Object.freeze({ ready, rasterEdge, roadsOf, regionRoute, lengthOf, pathBetween });
}

/** 把栅格化的定点结果换成 routeView 用的数（米、比例）。@param {any} r rasterEdge 的成功结果 */
export function edgeNumbers(r) {
  const mix = r.mix === null ? null : Object.fromEntries([...r.mix].map(([code, share]) => [code, fixedToNumber(share)]));
  return { distanceM: fixedToNumber(r.distance), ascentM: r.ascent === null ? null : fixedToNumber(r.ascent), terrainMix: mix, speedFactor: r.speed === null ? null : fixedToNumber(r.speed) };
}
