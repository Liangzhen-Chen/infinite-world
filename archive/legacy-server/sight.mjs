// 视线 `losView`（卷五《地点地形与资源场》§3.1 :316、§4.2 规则 14、15；卷二十七 R27-5.9 视线缓存；格子迁移 G13 = 6-8）。规则层纯读入口，全书"两个位置之间看得见看不见"只经它。
//
// 已定（理由在后）：
// 1. 层的选择只由"两端在不在现场泡内"定（卷五 :604 末句；卷二十七 R27-1.4）：两端都在泡内走近景（细格），否则走远景（区格层）；泡只由状态算出（sim-tiers.mjs inBubble），所以复演同一时刻选到同一层。
//    不在同一格空间（w 不同）无法比较，clear 为 null（未知）、blockedAt 为 null，层照两端是否在泡内标；不拿别的量顶替（卷五 :316、A5-2.4）。
// 2. 近景（规则 14）：在细格索引空间做三维体素遍历。格是长方体（水平 cellM、竖向 storeyM），线段由两格中心连成，仿射缩放不改变线段穿过哪些格，所以索引空间里格是单位立方、中心在 (整数 + 1/2)，
//    全程整数、不开方、不用浮点：沿各轴的穿越参数是 (2k + 1) ÷ (2 × 轴向格数) 的精确分数，按交叉乘比较、分组；同一参数上几根轴同时穿越（恰穿棱或角）时取共棱共角的全部格（规则 14 括号）。
//    从 a 到 b 做一次、再从 b 到 a 做一次，两次经过的格（除两端格）里有一格不透光 clear 即假。
//    不透光读材料维度 opaque 按格的当时物态取栏（grid-base.mjs FLAG、卷三甲 §2.1），读不到为未知，不当真也不当假；任一次遍历遇到明确的不透光格，结果就是 false（即使别处有未知格）。
// 3. 楼板：顶面（楼板、屋面、桥面，gridView 的 ceiling）是格的上表面（卷五 :314），不是一格体积；"隔着楼板看不见"（规则 14、A5-2.2）靠它——遍历穿过一个竖向格面时，下面那一格的顶面若不透光就挡住；
//    两端格自己的顶面也在内（人站的格头顶有楼板，向上看被挡）；水平穿过一格时不碰它的顶面。这是卷文没写明的取法，按"墙、楼板、山体岩土都是不透光材料"一句推出（卷五 :603）。
// 4. blockedAt 与对称（李白 11-23 裁乙；卷五 :603、A5-2.2 勘误 1123k20）：blockedAt 是从 fromPos 一侧数第一个挡住的格（先看 from→to 遍历的第一处，没有则取 to→from 遍历的最后一处），
//    对换入参时 blockedAt 各取自己一侧、允许不同；clear、layer 对换入参逐位相同（clear 由两次遍历合并，不依赖谁是 a）。远景只给 clear，采样与结果按 (w, x, y, z) 规范序，故对称。
// 5. 远景（规则 15）：只看区格层。a、b 区格中心的连线上，沿区格增量较大的那根轴数 n（区格步数），每隔 farSightStepRegionCells 个区格取一个采样区格（第 step、2·step … 个，不含两端自己的区格），
//    采样数超过 farSightMaxSamples 即未知；视线高度在 a 的眼位海拔与 b 的目标海拔之间按水平距离线性插值（沿线等间距，所以按第 i 步 ÷ n 插值）；眼位、目标海拔同一口径 = 格的层号 × storeyM + storeyM ÷ 2
//    （卷文给了 a 的眼位"地面海拔加一层高的一半"，没给 b 的目标海拔，两端取同一口径，使 a、b 对称）。每个采样区格的遮挡高读 kernel/place.mjs 的 regionOcclusionM（地表高与建筑顶面海拔取大，不含林冠）；
//    所有采样处视线高度严格高于遮挡高才 clear；任一采样遮挡高未知则未知（有明确挡住的采样则仍为 false）。两端相邻或同区格没有采样，clear 为真。
// 6. 缓存（R27-5.9）：远景结果缓存在 kernel/place.mjs 的 sightCache（挂在足迹计划上，计划的键含当日有效输入版本与偏离行，输入变了旧缓存即不再被取到；不进状态、存档、摘要）；
//    缓存键含全部输入（格空间、两端区格、两端层号）。近景读差分，不缓存。开关缓存（place.mjs setSightCache）与中途清空结果逐位相同（卡内测试）。
// 未落：门、窗扇的此刻状态（卷五 :603 "门窗按此刻状态取对应材料"）——卷十九门窗扇状态未建，gridView 现把门窗洞读作空气（place-building.mjs leafOpen 恒按没装），所以门窗洞按空气处理；
//    gridView 水层未接时水体足迹地表以上格读未知（docs/问题.md G6 遗留 1），视线遇到它们按未知。

import { materialView } from './kernel/item.mjs';
import { fixedUnits } from './kernel/det-math.mjs';
import { E } from './kernel/handles/generated.mjs';
import { regionOf, gridView, regionOcclusionM, sightCache } from './kernel/place.mjs';
import { isPosValue } from './kernel/named-structs.mjs';
import { inBubble } from './sim-tiers.mjs';

// 本文件定名（单一定义）。
export const LAYER = Object.freeze({ near: 'near', far: 'far' });
const S = Object.freeze({
  opaque: 'opaque', solid: 'solid', grid: 'grid', storeyM: 'storeyM',
  stepKey: 'farSightStepRegionCells', maxKey: 'farSightMaxSamples',
  cell: 'cell', slab: 'slab',
});

// 遍历的三根轴（键名即位置字段名）。
const AXES = Object.freeze(['x', 'y', 'z']);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isSafeInteger(v);
const abs = (n) => (n < 0 ? -n : n);

function deny(code, detail) {
  const e = new Error(`${code} ${detail}`);
  e.code = code;
  e.fields = {};
  return e;
}

const result = (clear, layer, blockedAt) => Object.freeze({ clear, layer, blockedAt });

// 位置的规范序：(w, x, y, z)。
const posCmp = (a, b) => (a.w - b.w) || (a.x - b.x) || (a.y - b.y) || (a.z - b.z);

// ---------- 近景：体素遍历 ----------

// 一次遍历（f → t）：返回按经过先后排好的步骤 [{kind: 'cell'|'slab', x, y, z}]。第一步是 f 所在格；cell 是经过（含恰擦棱擦角）的格，
// slab 是穿过竖向格面时下面那一格（其顶面是楼板）。同一参数上同时穿越几根轴时，共棱共角的全部格都算经过（卷五 规则 14）。
function traverse(f, t) {
  const a = { x: f.x, y: f.y, z: f.z };
  const b = { x: t.x, y: t.y, z: t.z };
  const events = [];
  for (const axis of AXES) {
    const delta = b[axis] - a[axis];
    if (delta === 0) continue;
    const len = abs(delta);
    const sign = delta > 0 ? 1 : -1;
    // 第 k 次穿越（k 从 0 起）发生在线段参数 (2k + 1) ÷ (2 × 轴向格数)：格中心在半格处，穿越点在整格边上，所以分子是奇数、分母是两倍轴向格数（写成加法，不写字面量 2）。
    for (let k = 0; k < len; k += 1) events.push({ n: k + k + 1, d: len + len, axis, sign });
  }
  events.sort((p, q) => (p.n * q.d) - (q.n * p.d) || cmp(p.axis, q.axis));
  const steps = [{ kind: S.cell, x: a.x, y: a.y, z: a.z }];
  const seen = new Set([`${a.x},${a.y},${a.z}`]);
  const cur = { ...a };
  let i = 0;
  while (i < events.length) {
    let j = i;
    while (j < events.length && events[j].n * events[i].d === events[i].n * events[j].d) j += 1;
    const group = events.slice(i, j);
    const next = { ...cur };
    for (const ev of group) next[ev.axis] += ev.sign;
    const crossing = (axis) => group.some((ev) => ev.axis === axis);
    // 每根穿越的轴取"穿前、穿后"两个坐标，没穿越的轴只取当前坐标：共棱共角的全部格。
    const choices = (axis) => (crossing(axis) ? [cur[axis], next[axis]] : [cur[axis]]);
    const combos = [];
    for (const x of choices('x')) for (const y of choices('y')) for (const z of choices('z')) combos.push({ x, y, z });
    combos.sort((p, q) => (p.x - q.x) || (p.y - q.y) || (p.z - q.z));
    if (crossing('z')) {
      const low = cur.z < next.z ? cur.z : next.z;
      for (const x of choices('x')) for (const y of choices('y')) steps.push({ kind: S.slab, x, y, z: low });
    }
    for (const { x, y, z } of combos) {
      const key = `${x},${y},${z}`;
      if (!seen.has(key)) { seen.add(key); steps.push({ kind: S.cell, x, y, z }); }
    }
    cur.x = next.x; cur.y = next.y; cur.z = next.z;
    i = j;
  }
  return steps;
}

// 一次遍历涉及的全部格的内容，按列各读一次 gridView（只读，不跨调用缓存）：key "x,y,z" → 格。读不到的格不在表里。
function readCells(engine, state, w, steps) {
  const columns = new Map();
  for (const s of steps) {
    const ck = `${s.x},${s.y}`;
    const c = columns.get(ck);
    if (!c) columns.set(ck, { x: s.x, y: s.y, lo: s.z, hi: s.z });
    else { if (s.z < c.lo) c.lo = s.z; if (s.z > c.hi) c.hi = s.z; }
  }
  const out = new Map();
  for (const c of columns.values()) {
    const v = gridView(engine, state, { w, cells: { x0: c.x, y0: c.y, z0: c.lo, x1: c.x, y1: c.y, z1: c.hi } });
    if (v === null) continue;
    for (const cell of v.cells) out.set(`${cell.x},${cell.y},${cell.z}`, cell);
  }
  return out;
}

// 材料 m 在物态 st 下是否不透光：经 materialView 读 opaque 的分态栏（卷三乙 :541；卷三甲 :268）；读不到返回 null（未知）。同一次调用内按 (材料, 物态) 记忆。
function opaqueReader(engine, state) {
  const memo = new Map();
  return (material, matterState) => {
    const key = `${material}\u0000${matterState}`;
    if (memo.has(key)) return memo.get(key);
    const f = materialView(engine, state, material, { dimensions: [S.opaque], matterState }).dims[S.opaque];
    const v = f.known && typeof f.value === 'boolean' ? f.value : null;
    memo.set(key, v);
    return v;
  };
}

// 一次遍历的判决：{blocked: 第一处明确挡住的格 | null, lastBlocked: 最后一处, unknown: 是否遇到读不到的格}。端点格自己的材料不判（除两端格），端点格的顶面算。
function judge(steps, cells, endpoints, opaqueOf) {
  let first = null;
  let last = null;
  let unknown = false;
  const hit = (s) => { const at = Object.freeze({ x: s.x, y: s.y, z: s.z }); if (first === null) first = at; last = at; };
  for (const s of steps) {
    const cell = cells.get(`${s.x},${s.y},${s.z}`);
    if (cell === undefined || !cell.known) { if (s.kind === S.slab || !endpoints.has(`${s.x},${s.y},${s.z}`)) unknown = true; continue; }
    if (s.kind === S.slab) {
      if (cell.ceiling === null || cell.ceiling === undefined) continue;
      const v = opaqueOf(cell.ceiling, S.solid);
      if (v === true) hit(s); else if (v === null) unknown = true;
      continue;
    }
    if (endpoints.has(`${s.x},${s.y},${s.z}`)) continue;
    const v = opaqueOf(cell.material, cell.state);
    if (v === true) hit(s); else if (v === null) unknown = true;
  }
  return { first, last, unknown };
}

function nearSight(engine, state, from, to) {
  const w = from.w;
  const there = traverse(from, to);
  const back = traverse(to, from);
  const cells = readCells(engine, state, w, [...there, ...back]);
  const opaqueOf = opaqueReader(engine, state);
  const ends = new Set([`${from.x},${from.y},${from.z}`, `${to.x},${to.y},${to.z}`]);
  const one = judge(there, cells, ends, opaqueOf);
  const two = judge(back, cells, ends, opaqueOf);
  const blocker = one.first !== null ? one.first : two.last;
  if (blocker !== null) return { clear: false, blockedAt: Object.freeze({ w, x: blocker.x, y: blocker.y, z: blocker.z, coarse: false }) };
  return { clear: one.unknown || two.unknown ? null : true, blockedAt: null };
}

// ---------- 远景：区格采样 ----------

const grid = (engine) => (isObj(engine.rules) && isObj(engine.rules[S.grid]) ? engine.rules[S.grid] : {});

function farConstants(engine) {
  const g = grid(engine);
  for (const key of [S.stepKey, S.maxKey, S.storeyM]) {
    if (!isInt(g[key]) || g[key] < 1) throw deny(E.E_RULES_UNREGISTERED, `rules.${S.grid}.${key} must be a registered positive integer`);
  }
  return { step: g[S.stepKey], max: g[S.maxKey], storeyM: g[S.storeyM] };
}

// 整数向下取整除法（q > 0，p 可负）。
const floorDiv = (p, q) => { const r = p % q; return (p - (r < 0 ? r + q : r)) / q; };

// 眼位、目标海拔（定点米）：格的层号 × storeyM + storeyM ÷ 2（见文件头已定 5）。
const eyeOf = (pos, storeyM) => fixedUnits(pos.z * storeyM) + (fixedUnits(storeyM) >> 1n);

function farSight(engine, state, lo, hi) {
  const k = farConstants(engine);
  const ra = regionOf(engine, lo);
  const rb = regionOf(engine, hi);
  const key = `${lo.w}|${ra.x},${ra.y}|${rb.x},${rb.y}|${lo.z}|${hi.z}`;
  const cache = sightCache(engine, state);
  if (cache !== null && cache.has(key)) return cache.get(key);
  const dx = rb.x - ra.x;
  const dy = rb.y - ra.y;
  const n = abs(dx) > abs(dy) ? abs(dx) : abs(dy);
  const count = n > 0 ? floorDiv(n - 1, k.step) : 0;
  let out;
  if (count > k.max) {
    out = { clear: null, blockedAt: null };
  } else {
    const eyeA = eyeOf(lo, k.storeyM);
    const eyeB = eyeOf(hi, k.storeyM);
    let blocked = false;
    let unknown = false;
    for (let i = k.step; i < n; i += k.step) {
      // 第 i 步的采样区格 = 起点 + 四舍五入(增量 × i ÷ n)：floor((增量 × i + n ÷ 2) ÷ n) 写成 floor((增量 × i × 2 + n) ÷ (n × 2))，这里 × 2 用加法。
      const region = { x: ra.x + floorDiv(dx * i + dx * i + n, n + n), y: ra.y + floorDiv(dy * i + dy * i + n, n + n) };
      const occ = regionOcclusionM(engine, state, { w: lo.w, region });
      if (occ === null) { unknown = true; continue; }
      const sight = eyeA + ((eyeB - eyeA) * BigInt(i)) / BigInt(n);
      if (!(sight > fixedUnits(occ))) blocked = true;
    }
    out = { clear: blocked ? false : unknown ? null : true, blockedAt: null };
  }
  if (cache !== null) cache.set(key, out);
  return out;
}

/**
 * kernelApi `losView(engine, state, fromPos, toPos)`（卷五 §3.1 :316；规则 14、15）→ `{clear: boolean | null, layer: 'near' | 'far', blockedAt: struct:pos | null}`。
 * 两端都在现场泡内走近景（细格体素遍历），否则走远景（区格采样），层的选择只由状态算出；不在同一格空间、采样超上限、材料或遮挡高读不到时 clear 为 null（未知，不拿别的量顶替）。
 * 纯读：不写状态；对换两端 clear、layer 逐位相同，blockedAt 各取 fromPos 一侧（见文件头已定 4）。
 * @param {object} engine @param {object} state
 * @param {{w: number, x: number, y: number, z: number, coarse: boolean}} fromPos @param {{w: number, x: number, y: number, z: number, coarse: boolean}} toPos
 * @returns {{clear: boolean | null, layer: string, blockedAt: {w: number, x: number, y: number, z: number, coarse: boolean} | null}}
 */
export function losView(engine, state, fromPos, toPos) {
  if (!isPosValue(fromPos) || !isPosValue(toPos)) throw deny(E.E_DIM_STRUCT_FIELD, 'losView: both positions are struct:pos {w, x, y, z, coarse}');
  const here = (p) => inBubble(engine, state, p.w, regionOf(engine, p));
  const layer = here(fromPos) && here(toPos) ? LAYER.near : LAYER.far;
  if (fromPos.w !== toPos.w) return result(null, layer, null);
  // 近景从 fromPos 一侧数挡点（两次遍历都做，clear 对称）；远景只给 clear，采样按规范序，对换入参逐位相同。
  const [lo, hi] = posCmp(fromPos, toPos) <= 0 ? [fromPos, toPos] : [toPos, fromPos];
  const r = layer === LAYER.near ? nearSight(engine, state, fromPos, toPos) : farSight(engine, state, lo, hi);
  return result(r.clear, layer, r.blockedAt);
}
