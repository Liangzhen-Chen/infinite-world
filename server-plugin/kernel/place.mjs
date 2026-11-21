// 地点表的读入口与包含树（卷五《地点地形与资源场》§3.1 :285、§4.1 :385–:452；卷二 §2.1 第 7 行、§5.6 :1753；块 6 第 6-7 张）。
// placeView(engine, state, placeId)：dims（表头全部维度的 Fact）与 tree（ancestors、children、depth）；
// routeView(engine, state, from, to)：edge（两地之间直接的边，每种通路类型一项，陆路在前）与 path（几何最短路，§4.1.3 规则 5）。
// 三个关系的实现函数 relContains、relWithin、relResidents（§4.1.2 表），以及加载期的树、足迹与边校验 checkPlaceTable（§4.1.3 规则 1、3、4、10；A5-1.2）。
// 格子世界（G3）：zoneAt（规则 12）、regionCell、landCell（规则 14）、planFootprints（§3.1）、placeView 的 footprint 与 exits（规则 9）、placeNeighbors（§4.14 规则 2）；
// 足迹划分与几何的纯函数在 kernel/footprint.mjs，地点行到划分输入的整理在 kernel/place-plan.mjs。纬度由派生形心 centroid 求（M5-36）。
// 两个读入口是纯读：不开户、不入账、不写任何状态（§3.1 末段）。只读表头登记与行数据，不按地点 id、名字、层级代号开分支（§4.1.3 规则 2）。
// 路网（G4）：routeView 的 edge 各量与 path 都由栅格化路段派生、不存储（卷五 §4.1 规则 4、5；§4.10 规则 1），pathView 在区格图上求位置到位置的路程；
// 栅格化与区格寻路在 kernel/route-edges.mjs（边与缓存）与 kernel/route-grid.mjs（图搜索与路段派生量）。
// 照卷文按未知带出的（读不到的派生字段按未知 Fact 带出；体检 K6-45）：requirement（struct:requirementBlock 未建）、体积足迹端点的边（取顶层区格归 G8）；
// 视图派生字段 zones、stocks 等其余各组（§2.1 视图派生字段表）随各自的卡建，本文件不给半截值。

import { KernelError, codeOf } from './errors.mjs';
import { dim, dependsOnUnbuilt, rowClassesOf } from './dimensions.mjs';
import { reverseLookup } from './reverse-index.mjs';
import { fixedUnits, fixedToNumber, fixedAdd, fixedDivide } from './det-math.mjs';
import { checkDef, checkValue } from './validate/types.mjs';
import { T } from './handles/markers.mjs';
import { buildE } from './handles/generated.mjs';
import { FOOTPRINT_KIND } from './footprint-kind.mjs';
import {
  zoneOfPos, cellList, regionGeometry, regionHeights, regionCellPos, landRegionCell, accessCell, openBoundaryCells,
  straightM as straightMCore, bearingView as bearingViewCore,
} from './footprint.mjs';
import { buildPlan, expandClasses, waterAccessOf, footprintAdjacency, edgeAdjacency } from './place-plan.mjs';
import { createRouteEnv, edgeNumbers } from './route-edges.mjs';
import { report } from './report.mjs';
import { isPosValue } from './named-structs.mjs';
import { cellClassOf } from './grid.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 本卷的表与维度、边节字段（卷五 §2.1、§4.1.1；表头里登记的名字，本文件只读它们，不另定义含义）。
const PLACE = 'place';
const DIM = Object.freeze({
  parent: 'parent', areaM2: 'areaM2', underground: 'underground', elevationM: 'elevationM', coord: 'coord',
  centroid: 'centroid', zRange: 'zRange', anchor: 'anchor', facing: 'facing', waterKind: 'waterKind',
});
const COORD = Object.freeze({ x: 'x', y: 'y' });
const EDGE = Object.freeze({ from: 'from', to: 'to', waterway: 'waterway', portal: 'portal' });
// 路网环境读的规则表与词表族名（route-edges.mjs 的输入）：规则表代号取登记表（world/rules/registry.json），不另起名。
const RULES = Object.freeze({ grid: 'grid', modifiers: 'terrainModifiers' });
// 表文件里的边节与边节字段定义（卷二 §5.6"表内 edges 节"；字段定义放表头 edgeStruct，本卡自定）。
const SECTION = Object.freeze({ edges: 'edges', edgeStruct: 'edgeStruct', gridSpaces: 'gridSpaces', gridSpaceStruct: 'gridSpaceStruct' });
// 格空间表（卷五 §4.1.1 :422）行的字段；外包框取左下角区格序号与边长（区格数）。
const GRID_SPACE = Object.freeze({ w: 'w', box: 'box', root: 'root' });
// 一地出口的种类代号（卷五 §4.1 规则 9：路、门、开阔；排序按这个次序）。
export const EXIT_KIND = Object.freeze({ road: 'road', door: 'door', open: 'open' });
const EXIT_ORDER = Object.freeze([EXIT_KIND.road, EXIT_KIND.door, EXIT_KIND.open]);
// 各足迹输入列允许哪些足迹种类写（卷五 §2.1 各列"必填"栏与含义栏；§4.1 规则 2 末句"加载器按足迹种类校验必填与禁填"）。
// 必填由表头的 byFootprint 条件判（validate/rows.mjs）；写在不允许的种类的行上即禁填违规。
const FOOTPRINT_COLUMNS = Object.freeze({
  coord: [FOOTPRINT_KIND.region],
  targetAreaM2: [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume], // 区域足迹可选，体积足迹必填
  boundary: [FOOTPRINT_KIND.region],
  anchor: [FOOTPRINT_KIND.building],
  facing: [FOOTPRINT_KIND.building],
  spanZ: [FOOTPRINT_KIND.volume],
  anchorElevationM: [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume],
  terrain: [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume],
});
// 离场子树内按未知返回的位置量与依赖足迹的派生量（卷五 §4.1 规则 8 第三条：anchor、facing、footprint 与 centroid、areaM2、elevationM 等）。
const OFFSTAGE_UNKNOWN = Object.freeze([DIM.anchor, DIM.facing, DIM.centroid, DIM.areaM2, DIM.elevationM, DIM.zRange]);
// 关系行代号（卷五 §4.1.2 表；本文件是这三行的实现方）。
const REL = Object.freeze({ residents: 'rel_residents' });
// 持有边的字段（卷二 §1.5 struct:holding；卷十八 §4.1.1 terms 公共键 until）与种类行的 domicile 列（R18-1.10）。
const HOLDING = Object.freeze({ kind: 'kind', subject: 'subject', terms: 'terms', until: 'until' });
const DOMICILE = 'domicile';
// 行政层级族的条目字段（卷五 §4.14.1：rank: integer）；族名比较取 T.vocab_family.juris。
const JURIS_RANK = 'rank';

// 错误码句柄（handles/generated.mjs；同 ledger.mjs 写法 codeOf(e) === E.<码>）。
const E = buildE();

const KNOWN = (value) => Object.freeze({ known: true, applicable: true, value });
const UNKNOWN = Object.freeze({ known: false, applicable: true });

function placeTable(engine) {
  const t = engine && engine.tables instanceof Map ? engine.tables.get(PLACE) : undefined;
  if (!t) throw new KernelError('E-DIM-REF-MISSING', {}, 'place: no place dimension table loaded');
  return t;
}

// 全部地点 id：表内行（含 generated 节）与 state.created 里带本表 idPrefix 的偏离行（卷二 :287 实体前缀归表）。按代号序。
function placeIds(engine, state) {
  const t = placeTable(engine);
  const ids = new Set(t.flat && t.flat.rows instanceof Map ? t.flat.rows.keys() : []);
  const prefixes = isObj(t.doc.entity) && Array.isArray(t.doc.entity.idPrefix) ? t.doc.entity.idPrefix : [];
  const created = isObj(state) && isObj(state.created) ? state.created : {};
  for (const id of Object.keys(created)) if (prefixes.some((p) => id.startsWith(p))) ids.add(id);
  return [...ids].sort(cmp);
}

// 父地点：经内核 dim() 读基值（偏离行覆盖表内行，卷二 §1.3）；根为 null。不是地点即 dim() 抛 E-DIM-REF-MISSING。
function parentOf(engine, state, id) {
  const f = dim(engine, state, PLACE, id, DIM.parent);
  return f.known && typeof f.value === 'string' ? f.value : null;
}

function ancestorsOf(engine, state, id) {
  const out = [];
  const seen = new Set([id]);
  for (let p = parentOf(engine, state, id); p !== null; p = parentOf(engine, state, p)) {
    if (seen.has(p)) throw new KernelError('E-DIM-CYCLE', {}, `place ${id}: parent chain revisits ${p}`);
    seen.add(p);
    out.push(p);
  }
  return out;
}

function childIndex(engine, state) {
  const out = new Map();
  for (const id of placeIds(engine, state)) {
    const p = parentOf(engine, state, id);
    if (p === null) continue;
    if (!out.has(p)) out.set(p, []);
    out.get(p).push(id);
  }
  return out;
}

// ---------- 足迹计划（卷五 §4.1 规则 2、8、10、12、13；G3） ----------

// 偏离行（state.created[id].props）覆盖展平行的值（卷二 §1.3 覆盖顺序）；place 表没有类别行默认值，取不到即 undefined。
function effectiveValue(t, state, id, key) {
  const created = isObj(state) && isObj(state.created) && Object.hasOwn(state.created, id) ? state.created[id] : undefined;
  if (isObj(created) && isObj(created.props) && Object.hasOwn(created.props, key)) return created.props[key];
  const row = t.flat && t.flat.rows instanceof Map ? t.flat.rows.get(id) : undefined;
  return row && Object.hasOwn(row, key) ? row[key] : undefined;
}

const broaderOf = (index) => (code) => {
  const rec = index instanceof Map ? index.get(code) : undefined;
  const b = rec && isObj(rec.entry) ? rec.entry.broader : undefined;
  return Array.isArray(b) ? b : b === undefined ? [] : [b];
};
const relocatableIn = (index) => (classes) => [...classes].some((c) => {
  const rec = index instanceof Map ? index.get(c) : undefined;
  return Boolean(rec) && isObj(rec.entry) && rec.entry.relocatable === true;
});

// 一次划分的缓存：同一张表、同一份规则与词表、同样的偏离行不重划（输入全在这三样里，纯函数）。
const plans = new WeakMap();

// 运行期的足迹计划：没有格空间表（世界还没转成格世界）时 plans 为空，kinds、离场判据照样有。偏离行里的地点行一并算入。
function planOf(engine, state) {
  const t = placeTable(engine);
  const grid = engine.rules && engine.rules.grid;
  const spaces = Array.isArray(t.doc[SECTION.gridSpaces]) ? t.doc[SECTION.gridSpaces] : null;
  const ids = placeIds(engine, state);
  const created = isObj(state) && isObj(state.created) ? state.created : {};
  const sig = JSON.stringify(ids.filter((id) => Object.hasOwn(created, id)).map((id) => [id, created[id]]));
  const hit = plans.get(t);
  if (hit && hit.rules === engine.rules && hit.vocab === engine.vocab && hit.sig === sig) return hit.value;
  if (spaces !== null && spaces.length > 0 && !isObj(grid)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'place: gridSpaces present but rules.grid is not registered');
  const index = engine.vocab && engine.vocab.index;
  const value = buildPlan({
    ids,
    get: (id, key) => effectiveValue(t, state, id, key),
    classesOf: (id) => expandClasses(rowClassesOf(engine, state, t, id), broaderOf(index)),
    relocatable: relocatableIn(index),
    grid,
    gridSpaces: spaces,
  });
  plans.set(t, { rules: engine.rules, vocab: engine.vocab, sig, value });
  return value;
}

// 一行在哪个格空间的计划里（只有划出了足迹的区域足迹行有）。
function planOfRow(rp, id) {
  for (const plan of rp.plans.values()) if (plan.cells.has(id)) return plan;
  return null;
}

const terrainEntryOf = (engine) => (code) => {
  const rec = engine.vocab && engine.vocab.index instanceof Map && typeof code === 'string' ? engine.vocab.index.get(code) : undefined;
  const e = rec && isObj(rec.entry) ? rec.entry : null;
  return e && typeof e.reliefM === 'number' && typeof e.reliefRough === 'number' ? e : null;
};
const worldSeedOf = (engine) => (engine && isObj(engine.template) && typeof engine.template.seed === 'string' ? engine.template.seed : undefined);

/**
 * 一行的足迹与由足迹派生的量（卷五 §4.1 规则 13，区域足迹在区格粒度上算）：
 * {kind, w, regionCells（区格序号，(x, y) 字典序）, cellCount, areaM2, centroid, elevationM, zRange, waterAccess}。
 * 没有格空间表、离场行、划不出足迹的行与非区域足迹（建筑、房间、体积归 G7/G8）返回 null；elevationM、zRange 要世界种子与控制点，缺即为 null（未知）。
 * @param {any} engine @param {any} state @param {string} placeId
 */
export function placeFootprint(engine, state, placeId) {
  const rp = planOf(engine, state);
  const plan = planOfRow(rp, placeId);
  if (!plan) return null;
  const grid = engine.rules.grid;
  const geo = regionGeometry(grid, plan, placeId);
  if (!geo) return null;
  const heights = regionHeights(grid, worldSeedOf(engine), plan, rp.rows, terrainEntryOf(engine), placeId);
  return Object.freeze({
    kind: rp.kinds.get(placeId),
    w: plan.w,
    regionCells: Object.freeze(cellList(plan, placeId)),
    cellCount: geo.cellCount,
    areaM2: geo.areaM2,
    centroid: Object.freeze({ ...geo.centroid }),
    elevationM: heights ? heights.elevationM : null,
    zRange: heights ? Object.freeze({ ...heights.zRange }) : null,
    waterAccess: Object.freeze(waterAccessOf(plan, rp.rows, placeId)),
  });
}

/**
 * kernelApi `zoneAt(engine, state, pos)`（卷五 §3.1、§4.1 规则 12）：位置所在的地点 = 包含该位置的足迹中在包含树上最深的那一行；
 * 位置在格空间外包框之外、格空间不存在、世界没登记格空间表为 null（未知）。coarse 位置照存的格求。离场行不被返回。
 * 本卡只给区域足迹（建筑、房间、体积的最深足迹归 G7/G8）。纯读。pos 须合 struct:pos（命名 struct 登记），否则 E-DIM-STRUCT-FIELD。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number, coarse: boolean}} pos @returns {string | null}
 */
export function zoneAt(engine, state, pos) {
  if (!isPosValue(pos)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'zoneAt: pos is not a struct:pos');
  const rp = planOf(engine, state);
  if (rp.plans.size === 0) return null;
  return zoneOfPos(engine.rules.grid, rp.plans, pos);
}

// 位置须合命名 struct 登记的 struct:pos（卷二 §1.5 :252），否则 E-DIM-STRUCT-FIELD；两个几何入口共用。
function requirePos(pos, what) {
  if (!isPosValue(pos)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `${what}: not a struct:pos`);
}

/**
 * kernelApi `straightM(engine, posA, posB)`（卷五 §4.1 规则 5；全书两点直线距离唯一出处）：同一格空间时 fixedSqrtInt(dx² + dy² + dz²)，
 * 定点米（SCALE 标度，BigInt）；不在同一格空间为 null（未知）。纯函数，不读状态，引擎只用来取 rules.grid 的格尺度。
 * @param {any} engine @param {{w: number, x: number, y: number, z: number, coarse: boolean}} posA @param {{w: number, x: number, y: number, z: number, coarse: boolean}} posB
 * @returns {bigint | null}
 */
export function straightM(engine, posA, posB) {
  requirePos(posA, 'straightM posA');
  requirePos(posB, 'straightM posB');
  return straightMCore(engine.rules.grid, posA, posB);
}

/**
 * kernelApi `bearingView(engine, state, fromPos, toPos, facing)`（卷五 §3.1、§4.2 规则 12–13；全书方位角唯一算法）：
 * {bearingDeg, relative, vertical}；平面重合或不在同一格空间为 null。facing 是八向序号或 null。纯读。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number, coarse: boolean}} fromPos @param {{w: number, x: number, y: number, z: number, coarse: boolean}} toPos
 * @param {number | null} [facing] 朝向（八向序号）
 * @returns {{bearingDeg: number, relative: string | null, vertical: string} | null}
 */
export function bearingView(engine, state, fromPos, toPos, facing = null) {
  requirePos(fromPos, 'bearingView fromPos');
  requirePos(toPos, 'bearingView toPos');
  return bearingViewCore(engine.rules.grid, fromPos, toPos, facing);
}

/**
 * `located` 作用域的个体一侧起点（卷二 §1.12"个体所在地点"、§3.5 located、卷五 §4.1.4）：个体所在地点取 zoneAt(pos)，
 * 沿包含树取它与全部祖先（含子地点者"位于"这些地点）；zoneAt 为未知时为 null，由调用方按未知传播。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number, coarse: boolean}} pos @returns {readonly string[] | null}
 */
export function locatedChainOf(engine, state, pos) {
  const here = zoneAt(engine, state, pos);
  return here === null ? null : relWithin(engine, state, here);
}

/**
 * kernelApi `regionCell(engine, state, {w, region: {x, y}})`（卷五 §3.1）：区格中心列地表层那一格（coarse 为真）；只用高度场，不生成细格。
 * 格空间不存在、区格在外包框外、高度算不出（无世界种子或控制点）为 null。
 * @param {any} engine @param {any} state @param {{w: number, region: {x: number, y: number}}} spec 格空间号与区格序号
 * @returns {{w: number, x: number, y: number, z: number, coarse: boolean} | null}
 */
export function regionCell(engine, state, { w, region }) {
  const rp = planOf(engine, state);
  const plan = rp.plans.get(w);
  if (!plan) return null;
  return regionCellPos(engine.rules.grid, worldSeedOf(engine), plan, rp.rows, terrainEntryOf(engine), region.x, region.y);
}

/**
 * kernelApi `landCell(engine, state, {place, kind, seedKey, coarse})`（卷五 §3.1、§4.1 规则 14）：在地点足迹内落一格。
 * coarse 为真（泡外代表格）：区域足迹按 hash(seedKey, 区格序号) 取第一个 zoneAt 恰为 place 的区格的中心列地表层格；没有可落格为 null（不落到别处）。
 * coarse 为假要可立足细格，细格基底归 G6，本卡不落：抛 E-DET-DOMAIN，不给近似。建筑、房间、体积的落格归 G7/G8（非区域足迹同样为 null 以外不处理，抛同码）。纯读。
 * @param {any} engine @param {any} state @param {{place: string, kind: string, seedKey: string, coarse: boolean}} spec
 * @returns {{w: number, x: number, y: number, z: number, coarse: boolean} | null}
 */
export function landCell(engine, state, { place, seedKey, coarse }) {
  if (coarse !== true) throw new KernelError('E-DET-DOMAIN', {}, 'landCell: standable fine cells (coarse false) need the fine-cell base, not built yet');
  const rp = planOf(engine, state);
  const plan = planOfRow(rp, place);
  if (!plan) {
    if (rp.kinds.has(place) && rp.kinds.get(place) !== FOOTPRINT_KIND.region) throw new KernelError('E-DET-DOMAIN', {}, `landCell: ${rp.kinds.get(place)} footprints are not built yet`);
    return null;
  }
  return landRegionCell(engine.rules.grid, worldSeedOf(engine), plan, rp.rows, terrainEntryOf(engine), place, seedKey);
}

/**
 * kernelApi `planFootprints(engine, {base, proposals, assumptions})`（卷五 §3.1，卷十 C10-27）：按给定行集合与生成输入求足迹与派生量，
 * 与 placeView、zoneAt 同一套算法；纯函数、不写状态。base = 世界数据里的地点行（缺省取当前世界表）；proposals = 写回器暂存的行提案（覆盖或新增）；
 * assumptions = 可选假设覆盖 {行 id: {维度: 值}}（只供试排、不进状态）。行都是 place.json 行的形状（维度键与 classes）。
 * 返回 {footprints: {id: placeFootprint 的形状}, errors: [{code, id, detail}], adjacency: {id: [相邻 id]}}（相邻只含足迹相邻，路网边由 placeNeighbors 并入）。
 * @param {any} engine @param {{base?: Record<string, any>, proposals?: Record<string, any>, assumptions?: Record<string, Record<string, any>>}} [input]
 */
export function planFootprints(engine, { base, proposals = {}, assumptions = {} } = {}) {
  const t = placeTable(engine);
  const grid = engine.rules && engine.rules.grid;
  const spaces = Array.isArray(t.doc[SECTION.gridSpaces]) ? t.doc[SECTION.gridSpaces] : null;
  if (spaces !== null && spaces.length > 0 && !isObj(grid)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'planFootprints: rules.grid is not registered');
  const baseRows = base !== undefined ? base : Object.fromEntries(t.flat && t.flat.rows instanceof Map ? t.flat.rows : []);
  const merged = new Map();
  for (const [id, row] of Object.entries(baseRows)) merged.set(id, { ...row });
  for (const [id, row] of Object.entries(proposals)) merged.set(id, { ...(merged.get(id) || {}), ...row });
  for (const [id, over] of Object.entries(assumptions)) if (merged.has(id)) merged.set(id, { ...merged.get(id), ...over });
  const index = engine.vocab && engine.vocab.index;
  const rp = buildPlan({
    ids: [...merged.keys()],
    get: (id, key) => (merged.get(id) || {})[key],
    classesOf: (id) => expandClasses(Array.isArray((merged.get(id) || {}).classes) ? merged.get(id).classes : [], broaderOf(index)),
    relocatable: relocatableIn(index),
    grid,
    gridSpaces: spaces,
  });
  const footprints = {};
  const seed = worldSeedOf(engine);
  for (const plan of rp.plans.values()) {
    for (const id of plan.order) {
      const geo = regionGeometry(grid, plan, id);
      if (!geo) continue;
      const h = regionHeights(grid, seed, plan, rp.rows, terrainEntryOf(engine), id);
      footprints[id] = { kind: rp.kinds.get(id), w: plan.w, regionCells: cellList(plan, id), cellCount: geo.cellCount, areaM2: geo.areaM2, centroid: geo.centroid, elevationM: h ? h.elevationM : null, zRange: h ? h.zRange : null, waterAccess: waterAccessOf(plan, rp.rows, id) };
    }
  }
  const adjacency = {};
  for (const plan of rp.plans.values()) for (const [id, set] of footprintAdjacency(plan)) adjacency[id] = [...set].sort(cmp);
  return { footprints, errors: rp.errors, adjacency };
}

/**
 * 地点相邻（卷五 §4.14 规则 2，全书地点相邻的单一判据）：两个地点相邻当且仅当二者互不为祖先后代，且足迹在同一格空间里有一对四邻接的区格，
 * 或有一条路网边（含门边）两端分别在二者的包含子树内。离场行不参加。不手填邻居。返回相邻地点 id（代号序）。
 * @param {any} engine @param {any} state @param {string} placeId @returns {string[]}
 */
export function placeNeighbors(engine, state, placeId) {
  const rp = planOf(engine, state);
  const out = new Set();
  if (!rp.offstage.has(placeId)) {
    for (const plan of rp.plans.values()) {
      const adj = footprintAdjacency(plan).get(placeId); // 整个格空间只算一次，缓存在计划上
      if (adj) for (const b of adj) out.add(b);
    }
    const live = edgesOf(engine).filter((e) => !rp.offstage.has(e[EDGE.from]) && !rp.offstage.has(e[EDGE.to]));
    const viaEdges = edgeAdjacency(live.map((e) => ({ from: e[EDGE.from], to: e[EDGE.to] })), rp.parentOf).get(placeId);
    if (viaEdges) for (const b of viaEdges) out.add(b);
  }
  return [...out].sort(cmp);
}

// 一地的出口（卷五 §4.1 规则 9）：路（一端在 P 的包含子树内、另一端在外的路网边，含门边）与开阔边界（足迹边界上与外侧相邻的区格）；
// 门（建筑、房间蓝图外壳上的门格与开口窗格）归 G7，本卡不出。P 在离场子树内为空。排序按 (种类、区格序号 (x, y)、边的两端)。
function exitsOf(engine, kids, rp, placeId) {
  if (rp.offstage.has(placeId)) return [];
  const grid = engine.rules && engine.rules.grid;
  const seed = worldSeedOf(engine);
  const terrainOf = terrainEntryOf(engine);
  const out = [];
  const posOf = (plan, c) => (plan ? regionCellPos(grid, seed, plan, rp.rows, terrainOf, c.x, c.y) : null);
  // 路：子树成员 = 自身与全部后代（kids 是 childIndex 的结果，placeView 与 tree.children 共用一份）。
  const subtree = new Set();
  const stack = [placeId];
  while (stack.length) {
    const p = stack.pop();
    subtree.add(p);
    for (const c of kids.get(p) || []) stack.push(c);
  }
  for (const e of edgesOf(engine)) {
    const a = e[EDGE.from];
    const b = e[EDGE.to];
    if (rp.offstage.has(a) || rp.offstage.has(b) || subtree.has(a) === subtree.has(b)) continue;
    const [inner, other] = subtree.has(a) ? [a, b] : [b, a];
    const plan = planOfRow(rp, inner);
    const otherGeo = plan && plan.cells.has(other) ? regionGeometry(grid, plan, other) : null;
    const c = otherGeo ? accessCell(grid, plan, inner, fixedUnits(otherGeo.centroid.x), fixedUnits(otherGeo.centroid.y)) : null;
    out.push({ inner, kind: EXIT_KIND.road, via: Object.freeze({ from: a, to: b, waterway: e[EDGE.waterway] }), regionCell: c, cell: c ? posOf(plan, c) : null });
  }
  // 开阔边界：区域足迹。
  const plan = planOfRow(rp, placeId);
  if (plan) for (const c of openBoundaryCells(plan, placeId)) out.push({ inner: placeId, kind: EXIT_KIND.open, via: null, regionCell: c, cell: posOf(plan, c) });
  const key = (x) => (x.regionCell ? [x.regionCell.x, x.regionCell.y] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  out.sort((p, q) => {
    if (p.kind !== q.kind) return EXIT_ORDER.indexOf(p.kind) - EXIT_ORDER.indexOf(q.kind);
    const kp = key(p);
    const kq = key(q);
    if (kp[0] !== kq[0]) return kp[0] - kq[0];
    if (kp[1] !== kq[1]) return kp[1] - kq[1];
    return cmp(p.via ? `${p.via.from}|${p.via.to}|${p.via.waterway}` : '', q.via ? `${q.via.from}|${q.via.to}|${q.via.waterway}` : '');
  });
  return out.map((x) => Object.freeze(x));
}

// 一个派生维度是否读到登记在案的未建派生：判定只在 kernel/dimensions.mjs#dependsOnUnbuilt 一处（speciesView 共用）。

/**
 * kernelApi `placeView(engine, state, placeId)`（卷五 §3.1；卷二 §2.1 第 7 行）。纯读。
 * dims：表头登记的每个维度一个 Fact（dim() 的基值；读到未建派生的按未知带出，不抛、不给值）；
 * tree：{ancestors: 自父到根, children: 代号序, depth: ancestors 的个数}。
 * @param {any} engine @param {any} state @param {string} placeId
 */
export function placeView(engine, state, placeId) {
  const t = placeTable(engine);
  parentOf(engine, state, placeId); // 须是地点（dim() 对非地点抛 E-DIM-REF-MISSING）
  const rp = planOf(engine, state);
  const footprint = placeFootprint(engine, state, placeId);
  const off = rp.offstage.has(placeId);
  const dims = {};
  for (const key of Object.keys(t.doc.dimensions).sort(cmp)) {
    // 离场子树内的位置量与依赖足迹的派生量按未知返回，不返回留在存储里的旧值（卷五 §4.1 规则 8 第三条）。
    if (off && OFFSTAGE_UNKNOWN.includes(key)) { dims[key] = UNKNOWN; continue; }
    try {
      dims[key] = dim(engine, state, PLACE, placeId, key);
    } catch (e) {
      // 读到登记在案的未建派生时 dim() 抛 E-MOD-RX（kernel/dimensions.mjs readBase，卷二 §1.12 封卷后勘误 1118k23）。
      if (!(codeOf(e) === E.E_MOD_RX && dependsOnUnbuilt(t, key))) throw e;
      dims[key] = UNKNOWN;
    }
    // 表头里声明为派生的足迹量由足迹给值（centroid、zRange；areaM2、elevationM 待表头转成派生后同样走这里）；存储列照读存储值。
    if (footprint !== null && t.doc.dimensions[key] && t.doc.dimensions[key].derived !== undefined) {
      const v = FOOTPRINT_DERIVED[key] ? FOOTPRINT_DERIVED[key](footprint) : null;
      if (v !== null) dims[key] = KNOWN(v);
    }
  }
  const ancestors = ancestorsOf(engine, state, placeId);
  const kids = childIndex(engine, state);
  const children = kids.get(placeId) || [];
  return Object.freeze({
    id: placeId,
    dims: Object.freeze(dims),
    tree: Object.freeze({ ancestors: Object.freeze(ancestors), children: Object.freeze([...children]), depth: ancestors.length }),
    footprint,
    exits: Object.freeze(exitsOf(engine, kids, rp, placeId)),
  });
}

// 表头声明为派生的足迹量（卷五 §2.1）：由 placeFootprint 取值；取不到（未知）返回 null，维持未建派生的"未知"。
const FOOTPRINT_DERIVED = Object.freeze({
  [DIM.centroid]: (f) => Object.freeze({ ...f.centroid }),
  [DIM.areaM2]: (f) => f.areaM2,
  [DIM.elevationM]: (f) => f.elevationM,
  [DIM.zRange]: (f) => (f.zRange === null ? null : Object.freeze({ ...f.zRange })),
});

// ---------- 边与几何最短路（§4.1.3 规则 4、5） ----------

function edgesOf(engine) {
  const t = placeTable(engine);
  return Array.isArray(t.doc[SECTION.edges]) ? t.doc[SECTION.edges] : [];
}

// 边图的邻接表：边无向、只存一次（规则 4），两个方向都挂上。按边数组本身记（边只有建行写者，§3.3）。
const graphs = new WeakMap();
function graphOf(edges) {
  if (graphs.has(edges)) return graphs.get(edges);
  const g = new Map();
  const link = (a, b, e) => { if (!g.has(a)) g.set(a, []); g.get(a).push({ other: b, edge: e }); };
  for (const e of edges) { link(e[EDGE.from], e[EDGE.to], e); link(e[EDGE.to], e[EDGE.from], e); }
  graphs.set(edges, g);
  return g;
}

const NOT_APPLICABLE = Object.freeze({ known: false, applicable: false });
const isDoor = (e) => e[EDGE.portal] !== undefined && e[EDGE.portal] !== null;

// 路网环境（边的栅格化、区格寻路与缓存，route-edges.mjs）：按足迹计划缓存——计划本身是"生成输入与偏离行"的纯函数，输入变了计划重划、环境随之重建，
// 栅格化结果于是按（边，输入版本）缓存（卷五 §4.1 规则 4 末句、规则 5 末项）。离场行的边不在路网图上（规则 8、规则 4 末项）。
const routeEnvs = new WeakMap();
function routeEnvOf(engine, state) {
  const rp = planOf(engine, state);
  if (routeEnvs.has(rp)) return { rp, env: routeEnvs.get(rp) };
  const rules = engine.rules || {};
  const env = createRouteEnv({
    grid: rules[RULES.grid],
    modifiers: rules[RULES.modifiers],
    vocabIndex: engine.vocab && engine.vocab.index,
    worldSeed: worldSeedOf(engine),
    rp,
    terrainOf: terrainEntryOf(engine),
    edges: edgesOf(engine).filter((e) => !rp.offstage.has(e[EDGE.from]) && !rp.offstage.has(e[EDGE.to])),
  });
  routeEnvs.set(rp, env);
  return { rp, env };
}

// 路段方位角（§4.2 规则 12："路段取两端形心"）：从 a 端形心指向 b 端形心；两端不在同一格空间的足迹里、形心取不到、平面重合为未知。
// 位置用定点米（SCALE 标度整数）作坐标：方位角只依赖平面差的比例，不依赖单位。
function edgeBearing(engine, rp, a, b) {
  const grid = engine.rules && engine.rules[RULES.grid];
  const pa = planOfRow(rp, a);
  const pb = planOfRow(rp, b);
  if (!pa || pa !== pb) return UNKNOWN;
  const ca = regionGeometry(grid, pa, a).centroid;
  const cb = regionGeometry(grid, pa, b).centroid;
  const at = (c) => ({ w: pa.w, x: Number(fixedUnits(c.x)), y: Number(fixedUnits(c.y)), z: 0 });
  const v = bearingViewCore(grid, at(ca), at(cb));
  return v === null ? UNKNOWN : KNOWN(v.bearingDeg);
}

// 边的属性组（§3.1 routeView().edge 的一项）：从调用的 a 端看向 b 端。每项一个 Fact。除 waterway、requirement、portal 外全是栅格化路段派生的量（§4.1 规则 4），
// 算不出（世界种子或地形步进系数缺、足迹没划出、找不到路）按未知带出，不借别的量顶替；requirement（struct:requirementBlock）未建，按未知带出。
// 门边（portal 非空）路程计 0（规则 7），不栅格化，没有地形构成、爬升、路况（§4.10 规则 1）。cells 是路段区格序号串，随调用方向（a 在前）。
function edgeItem(engine, rp, env, e, a, b) {
  const door = isDoor(e);
  const base = { waterway: KNOWN(e[EDGE.waterway]), requirement: UNKNOWN, portal: KNOWN(door ? e[EDGE.portal] : null), bearingDeg: edgeBearing(engine, rp, a, b) };
  if (door) return Object.freeze({ ...base, distanceM: KNOWN(fixedToNumber(0n)), terrainMix: NOT_APPLICABLE, ascentM: NOT_APPLICABLE, speedFactor: NOT_APPLICABLE, cells: NOT_APPLICABLE });
  const r = env.rasterEdge(e);
  if (!r.ok) return Object.freeze({ ...base, distanceM: UNKNOWN, terrainMix: UNKNOWN, ascentM: UNKNOWN, speedFactor: UNKNOWN, cells: UNKNOWN });
  const n = edgeNumbers(r);
  const known = (v) => (v === null ? UNKNOWN : KNOWN(Object.freeze(v)));
  const cells = a === e[EDGE.from] ? r.cells : [...r.cells].reverse();
  return Object.freeze({
    ...base,
    distanceM: KNOWN(n.distanceM),
    terrainMix: known(n.terrainMix),
    ascentM: n.ascentM === null ? UNKNOWN : KNOWN(n.ascentM),
    speedFactor: n.speedFactor === null ? UNKNOWN : KNOWN(n.speedFactor),
    cells: KNOWN(Object.freeze(cells.map((c) => Object.freeze({ ...c })))),
  });
}

// 路径标签的全序（规则 5 并列取法）：路程（定点）→ 边数 → 途经地点 id 序列字典序 → 通路类型序列（陆路在前）。
// 同一边数的两条路径地点序列等长，所以逐项比即字典序；标签沿边延伸严格增大且保序，非负权最短路按此序取到唯一结果。
function lessLabel(x, y) {
  if (x.d !== y.d) return x.d < y.d;
  if (x.places.length !== y.places.length) return x.places.length < y.places.length;
  for (let i = 0; i < x.places.length; i++) if (x.places[i] !== y.places[i]) return x.places[i] < y.places[i];
  for (let i = 0; i < x.ways.length; i++) if (x.ways[i] !== y.ways[i]) return y.ways[i];
  return false;
}

/**
 * 路网图最短路（卷五 §4.1 规则 5 地点到地点，并列取法固定：路程，边数，途经地点 id 序列字典序，通路类型序列陆路先于水路）。
 * lengthOf 给一条边的路程（定点）；算不出为 null，这样的边不在最短路的图上（路网最短路只在能算出路程的边上求，不拿别的量顶替）。
 * 返回 {d: 路程（定点）, places, ways, edges} | null（不连通）。方向取 s 写起：并列时途经地点序列从 s 起比（routeView 按调用的实际出发方向求，不倒写，卷五 :470 勘误 1121k12）。
 * @param {any[]} edges 路网边 @param {string} s 起点地点 @param {string} t 终点地点 @param {(edge: any) => bigint | null} lengthOf 边长
 * @returns {{d: bigint, places: string[], ways: boolean[], edges: any[]} | null}
 */
export function shortestPath(edges, s, t, lengthOf) {
  const g = graphOf(edges);
  const best = new Map([[s, { d: 0n, places: [s], ways: [], edges: [] }]]);
  const done = new Set();
  for (;;) {
    let u = null;
    for (const [id, lab] of best) if (!done.has(id) && (u === null || lessLabel(lab, best.get(u)))) u = id;
    if (u === null) return null;
    if (u === t) return best.get(u);
    done.add(u);
    const lu = best.get(u);
    for (const { other, edge } of g.get(u) || []) {
      if (done.has(other)) continue;
      const len = lengthOf(edge);
      if (len === null) continue;
      const cand = { d: lu.d + len, places: [...lu.places, other], ways: [...lu.ways, edge[EDGE.waterway]], edges: [...lu.edges, edge] };
      if (!best.has(other) || lessLabel(cand, best.get(other))) best.set(other, cand);
    }
  }
}

/**
 * kernelApi `routeView(engine, state, from, to)`（卷五 §3.1；§4.1.3 规则 4、5）。纯读。
 * edge：两地之间直接的边，每种通路类型一项，陆路在前；没有即 []。每项 {waterway, requirement, portal, distanceM, terrainMix, ascentM, speedFactor, bearingDeg, cells}，
 * 各量都是栅格化路段的派生值（不存储，卷五 §4.1 规则 4）。
 * path：路网图最短路 {places, edges, distanceM}（节点是边端点，边长是路段 distanceM，门边 0；并列取法固定）；两地相同为没有边、distanceM 为 0 的路径；不连通为 null（两地距离未知）。
 * 按调用的实际出发方向求最小路程路径，不把反方向的结果倒过来写；正反两次调用的路径与路程允许不同（并列时途经地点序列从出发端起比）。
 * overCap：路网边的栅格化因展开数超 longCostCap 而算不出路程时为 true（此时 path 为 null、不是"路网不连通"，并经 report 记 E-GRID-PATH-OVER-CAP）；否则 false。
 * @param {any} engine @param {any} state @param {string} from @param {string} to
 */
export function routeView(engine, state, from, to) {
  parentOf(engine, state, from); // 两端须是地点（dim() 对非地点抛 E-DIM-REF-MISSING）
  parentOf(engine, state, to);
  // 离场子树不在路网图上：任一端是离场行时 edge 与 path 都为空（卷五 §4.1 规则 8、规则 4 末项）；图上也不含离场行的边。
  const { rp, env } = routeEnvOf(engine, state);
  const off = rp.offstage;
  if (off.has(from) || off.has(to)) return Object.freeze({ edge: Object.freeze([]), path: null, overCap: false });
  const edges = off.size === 0 ? edgesOf(engine) : edgesOf(engine).filter((e) => !off.has(e[EDGE.from]) && !off.has(e[EDGE.to]));
  const direct = edges
    .filter((e) => (e[EDGE.from] === from && e[EDGE.to] === to) || (e[EDGE.from] === to && e[EDGE.to] === from))
    .sort((x, y) => Number(x[EDGE.waterway]) - Number(y[EDGE.waterway]))
    .map((e) => edgeItem(engine, rp, env, e, from, to));
  let path = null;
  let overCap = false;
  if (from === to) path = Object.freeze({ places: Object.freeze([from]), edges: Object.freeze([]), distanceM: fixedToNumber(0n) });
  else {
    // 搜索里碰到的、因超 longCostCap 算不出路程的边：结果不可信（那条边可能在更短的路上），整体按超限处理，不当无路、也不给一条可能不是最小的路。
    let cappedEdge = null;
    const lengthOf = (e) => {
      const d = env.lengthOf(e);
      if (d === null && cappedEdge === null && env.edgeOverCap(e)) cappedEdge = e;
      return d;
    };
    const lab = shortestPath(edges, from, to, lengthOf);
    if (cappedEdge !== null) {
      overCap = true;
      reportOverCap(engine, env.rasterEdge(cappedEdge).expanded);
    } else if (lab !== null) {
      const items = lab.edges.map((e, i) => edgeItem(engine, rp, env, e, lab.places[i], lab.places[i + 1]));
      path = Object.freeze({ places: Object.freeze(lab.places), edges: Object.freeze(items), distanceM: fixedToNumber(lab.d) });
    }
  }
  return Object.freeze({ edge: Object.freeze(direct), path, overCap });
}

// 寻路展开数超 longCostCap：经内核报告出口记一条 E-GRID-PATH-OVER-CAP（告警级，不改状态；字段只含数值：上限与展开数）。
function reportOverCap(engine, expanded) {
  const grid = engine.rules && engine.rules[RULES.grid];
  report('E-GRID-PATH-OVER-CAP', { cap: grid.longCostCap, expanded });
}

/**
 * kernelApi `pathView(engine, state, fromPos, toPos)`（卷五 §3.1、§4.1 规则 5 位置到位置）：两位置之间的格上路程，含路外穿越。
 * 本卡建区格层（泡外与长途）：同一格空间在区格图上寻路，一步代价 = 步长 × 终点区格步进系数（道路与航道区格取 roadPaceFactor）× 坡度项，路网只是代价更低的格；
 * 不同格空间只经一道门（门计 0）。按调用的实际出发方向求代价最小路径，不倒写（卷五 §4.1 规则 5，勘误 1121k12）：正反两次调用的格子可同、花费与路程允许不同。
 * 返回 {steps: [{w, x, y}]（区格序号串，含两端）, distanceM}；两位置间真没有路、位置在外包框外或任一量算不出为 null（未知）；
 * 展开数超 longCostCap 时返回 {overCap: true, steps: null, distanceM: null}（读路程仍得未知，但与"没有路"可区分），并经 report 记 E-GRID-PATH-OVER-CAP（告警级）。
 * 现场泡内两位置的细格寻路（bubbleCostCap）归细格底子（G6 起）与卷十七 G15，本函数不给近似（一律按区格求）。纯读。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number, coarse: boolean}} fromPos @param {{w: number, x: number, y: number, z: number, coarse: boolean}} toPos
 * @returns {{steps: readonly {w: number, x: number, y: number}[], distanceM: number} | {overCap: true, steps: null, distanceM: null} | null}
 */
export function pathView(engine, state, fromPos, toPos) {
  requirePos(fromPos, 'pathView fromPos');
  requirePos(toPos, 'pathView toPos');
  const r = routeEnvOf(engine, state).env.pathBetween(fromPos, toPos);
  if (r === null) return null;
  if (r.overCap === true) {
    reportOverCap(engine, r.expanded);
    return Object.freeze({ overCap: true, steps: null, distanceM: null });
  }
  return Object.freeze({ steps: Object.freeze(r.steps.map((c) => Object.freeze({ ...c }))), distanceM: fixedToNumber(r.distance) });
}

// ---------- 三个关系的实现函数（§4.1.2 表；relation:<rel_id> 节点的实现方是本卷） ----------

/** relation:rel_contains：本行的父地点（根行为空）。 @param {any} engine @param {any} state @param {string} id @returns {readonly string[]} */
export function relContains(engine, state, id) {
  const p = parentOf(engine, state, id);
  return Object.freeze(p === null ? [] : [p]);
}

/** relation:rel_within：本行及其全部祖先。 @param {any} engine @param {any} state @param {string} id @returns {readonly string[]} */
export function relWithin(engine, state, id) {
  return Object.freeze([id, ...ancestorsOf(engine, state, id)]);
}

/**
 * relation:rel_residents（§4.1.2 表四步）：① 本行及其全部后代（沿 tree 展开）；② 对每个地点经 reverseLookup 取以它为标的的持有者；
 * ③ 只留在该地点上至少有一条种类行 domicile 为真、且未关闭（terms.until 为 null）的边的持有者（R18-1.10）；④ 按代号序去重合并。
 * @param {any} engine @param {any} state @param {string} id @returns {readonly string[]}
 */
export function relResidents(engine, state, id) {
  const children = childIndex(engine, state);
  const places = [];
  const stack = [id];
  while (stack.length) {
    const p = stack.pop();
    places.push(p);
    for (const c of children.get(p) || []) stack.push(c);
  }
  const holdings = isObj(state) && isObj(state.holdings) ? state.holdings : {};
  const index = engine.vocab.index;
  const out = new Set();
  for (const place of places) {
    for (const holder of reverseLookup(state, REL.residents, place)) {
      const edges = isObj(holdings[holder]) ? Object.values(holdings[holder]) : [];
      const lives = edges.some((r) => {
        if (!isObj(r) || r[HOLDING.subject] !== place) return false;
        const row = index.get(r[HOLDING.kind]);
        const open = isObj(r[HOLDING.terms]) && r[HOLDING.terms][HOLDING.until] === null;
        return Boolean(row) && isObj(row.entry) && row.entry[DOMICILE] === true && open;
      });
      if (lives) out.add(holder);
    }
  }
  return Object.freeze([...out].sort(cmp));
}

// ---------- 地点的气候输入（卷二十 :311、:327–:328 `latitudeDeg`、`weatherCell`：卷二十定义、place 派生；全书唯一一处） ----------

// 天气单元的维度（挂 comp_weather_cell 的行才适用，卷二十 §2.7 :359）；气候输入里 cell 字段取这些。
const CELL_DIMS = Object.freeze(['annualMeanTempC', 'tempAmpC', 'diurnalAmpC', 'seasonScheme']);
const CELL_MARK = 'annualMeanTempC';
const ASTRO = Object.freeze({ table: 'astro', origin: 'latitudeOriginDeg', perDegree: 'metersPerDegreeNorth' });
const SITE = Object.freeze({ enclosed: 'enclosed', underground: 'underground', elevation: 'elevationM' });
const envMemo = new WeakMap();

/**
 * 地点的纬度（卷二十 §2.7 :327 `latitudeDeg`，derived，来源 `coord`）：latitudeOriginDeg + coord.y ÷ metersPerDegreeNorth（rules.astro；定点）。
 * 缺 coord 或任一参数即 null（按未知，不借常数）。本卡不动这条读法：卷五 §7 M5-36"纬度改由形心 centroid 派生"与"世界必有格空间表"同属 G5
 * （6-24 转换把真实世界转成格世界时同卡落地，并按卷二十 §2.7 公式重算依赖纬度的真实数据测试期望值），G3 只提供形心（placeView 的 dims.centroid）。
 * @param {any} engine @param {any} view placeView 的结果
 * @returns {number | null}
 */
export function placeLatitude(engine, view) {
  const c = view.dims[DIM.coord];
  const t = engine.rules && engine.rules[ASTRO.table];
  const origin = t ? t[ASTRO.origin] : undefined;
  const per = t ? t[ASTRO.perDegree] : undefined;
  if (!c.known || !isObj(c.value) || typeof c.value[COORD.y] !== 'number' || typeof origin !== 'number' || typeof per !== 'number') return null;
  return fixedToNumber(fixedAdd(fixedUnits(origin), fixedDivide(fixedUnits(c.value[COORD.y]), fixedUnits(per))));
}

/**
 * 地点的气候输入（卷二十 §4.3.3 第 1 条天气单元解析 `nearest(rel_contains, 挂 comp_weather_cell)`、§4.5 `tempAt`/`dailyMeanTemp` 的 input）：
 * 沿包含树从地点自身起取最近的挂 comp_weather_cell 的节点（按组件类认：单元维度对该行"适用"），单元值取该节点的维度；纬度见 placeLatitude。
 * 没有单元、没有纬度即 null。结果按（引擎，地点）记忆（静态维度不随时刻变，卷二十 :327 "静态"），返回同一对象，下游逐日记忆才能命中。
 * 天气上下文（湿度，要世界种子流代号与单元静态维度，种子流登记 rules.seedKeys 未建）这里不给。
 * @param {any} engine @param {any} state @param {string} placeId
 * @returns {{input: any} | null}
 */
export function placeClimateInput(engine, state, placeId) {
  let byPlace = envMemo.get(engine);
  if (!byPlace) { byPlace = new Map(); envMemo.set(engine, byPlace); }
  if (byPlace.has(placeId)) return byPlace.get(placeId);
  const own = placeView(engine, state, placeId);
  const chain = [own, ...own.tree.ancestors.map((a) => placeView(engine, state, a))];
  const cellNode = chain.find((n) => n.dims[CELL_MARK].applicable === true);
  const latitudeDeg = placeLatitude(engine, own);
  const val = (v, k) => (v.dims[k] && v.dims[k].known ? v.dims[k].value : undefined);
  let out = null;
  if (cellNode && latitudeDeg !== null) {
    const cell = Object.fromEntries(CELL_DIMS.filter((k) => val(cellNode, k) !== undefined).map((k) => [k, val(cellNode, k)]));
    const cellElevationM = val(cellNode, SITE.elevation);
    const here = val(own, SITE.elevation);
    out = { input: { latitudeDeg, cell, cellElevationM, surfaceRefElevationM: here === undefined ? cellElevationM : here, enclosed: val(own, SITE.enclosed), underground: val(own, SITE.underground), weather: {} } };
  }
  byPlace.set(placeId, out);
  return out;
}

// ---------- 加载期校验（§4.1.3 规则 1、2、3、4、10；A5-1.2；格子 G3） ----------

// 词表族名（cellclass 与 terrain、water 族的条目读自 vocab.index；族名是固定键名）。
const FAMILY = Object.freeze({ terrain: 'terrain', water: 'water', cellclass: 'cellclass' });
// 一个值是否真写在行上（键在且不是 undefined）。
const written = (row, key) => Object.hasOwn(row, key) && row[key] !== undefined;

// 格空间表（表内 gridSpaces 节，卷五 §4.1.1 :422）：逐行照 gridSpaceStruct 校验；格空间号唯一，根地点各不相同。返回是否可用来划分。
function checkGridSpaces(t, view, errors, list) {
  if (list.length === 0) return true; // 没有行，没有可校验的
  const def = t.doc[SECTION.gridSpaceStruct];
  if (!isObj(def) || def.type !== T.type.struct) { errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.gridSpaceStruct} is a struct definition of the ${SECTION.gridSpaces} section`); return false; }
  const before = errors.length;
  const sink = (e) => errors.push(`${e.code} place/${e.path}: got ${JSON.stringify(e.got)} want ${e.want}`);
  checkDef(def, view.env, { table: PLACE, row: '', dim: SECTION.gridSpaceStruct, path: SECTION.gridSpaceStruct }, sink, false);
  const ws = new Set();
  const roots = new Set();
  list.forEach((s, i) => {
    const at = { table: PLACE, row: '', dim: SECTION.gridSpaces, path: `${SECTION.gridSpaces}/${i}` };
    if (!isObj(s)) { sink({ ...at, code: 'E-DIM-STRUCT-FIELD', got: s, want: 'grid space object' }); return; }
    checkValue(def, s, view.env, at, sink);
    if (ws.has(s[GRID_SPACE.w])) sink({ ...at, code: 'E-DIM-DUPLICATE-KEY', got: s[GRID_SPACE.w], want: 'one grid space per w' });
    if (roots.has(s[GRID_SPACE.root])) sink({ ...at, code: 'E-DIM-DUPLICATE-KEY', got: s[GRID_SPACE.root], want: 'one grid space per root place' });
    ws.add(s[GRID_SPACE.w]);
    roots.add(s[GRID_SPACE.root]);
  });
  return errors.length === before;
}

// 每个区格有 cellclass 条目成立（卷五 §4.3 规则 9；数据给全兜底条目，代码不设缺省）：区格划出后，对本世界用到的（地形 × 水体类或无 × 道路否是 × 聚落否是 ×
// 坡度探针）逐一试 cellClassOf，有一种组合无条目成立即 E-GRID-CELL-NO-TERRAIN。坡度探针取 0、1 与全部条目 slopeRange 的端点及相邻端点的中点（见下，端点之间的空档也覆盖）。只报第一处。
function checkCellClasses(view, rp, errors) {
  const idx = view.vocab && view.vocab.index instanceof Map ? view.vocab.index : new Map();
  const entries = [...idx].filter(([, rec]) => rec && rec.family === FAMILY.cellclass).map(([code, rec]) => [code, rec.entry]);
  const used = (key) => [...new Set([...rp.rows.values()].filter((r) => !r.offstage && r.kind === FOOTPRINT_KIND.region).map((r) => r[key]).filter((v) => typeof v === 'string'))].sort(cmp);
  const terrains = used('terrain');
  const waters = [null, ...used('waterKind')];
  // 坡度探针：0、1（坡度取值域 [0,1]）与全部条目 slopeRange 的端点，再加相邻端点之间的中点（定点移位取中，不写数字 2）。
  // 条目区间是闭区间，成立与否只在端点与端点之间的开段上变化，每个开段取一个中点，端点之间的空档就不会漏。
  const ends = [...new Set([0, 1, ...entries.flatMap(([, e]) => (Array.isArray(e.slopeRange) ? e.slopeRange.filter((v) => typeof v === 'number' && v >= 0 && v <= 1) : []))])].sort((a, b) => a - b);
  const slopes = [...ends];
  for (let i = 1; i < ends.length; i += 1) slopes.push(fixedToNumber((fixedUnits(ends[i - 1]) + fixedUnits(ends[i])) >> 1n));
  for (const terrain of terrains) for (const waterKind of waters) for (const onRoad of [false, true]) for (const inSettlement of [false, true]) for (const slope of slopes) {
    if (cellClassOf(entries, { terrain, waterKind, slope, onRoad, inSettlement }) === null) {
      errors.push(`E-GRID-CELL-NO-TERRAIN cellclass: no entry matches terrain ${terrain}, waterKind ${waterKind}, onRoad ${onRoad}, inSettlement ${inSettlement}, slope ${slope} (data must give a fallback entry)`);
      return;
    }
  }
}

// 一行是否在 id 的包含子树里（自身或祖先链上有 id）；沿计划里的 parent 走，有限步（树无环由规则 1 校验）。
function inSubtree(rp, row, id) {
  const seen = new Set();
  for (let c = row; typeof c === 'string' && !seen.has(c); c = rp.parentOf(c)) { if (c === id) return true; seen.add(c); }
  return false;
}

// 路网边两端（卷五 §4.1 规则 4、7；对照表 33、39 行）：两端只许是区域或体积足迹的行（建筑、房间的出入由蓝图门格派生，不建边）；
// 非门边两端若都划出了区域足迹须在同一格空间（跨格空间只经门）；门边 portal 的 a 在 from 足迹内、b 在 to 足迹内，a、b 须合 struct:pos，门边不是水路。
function checkEdgeEnds(rp, grid, e, at, sink) {
  const ENDS = [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume];
  for (const end of [e[EDGE.from], e[EDGE.to]]) {
    const kind = rp.kinds.get(end);
    if (kind !== undefined && !ENDS.includes(kind)) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: [end, kind], want: `edge ends are region or volume footprint rows (${ENDS.join(', ')}); building and room entrances come from blueprint door cells, no edge` });
  }
  if (!isDoor(e)) {
    const pa = planOfRow(rp, e[EDGE.from]);
    const pb = planOfRow(rp, e[EDGE.to]);
    if (pa && pb && pa !== pb) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: [e[EDGE.from], e[EDGE.to]], want: 'a non-portal edge joins two places of one grid space (grid spaces connect only through portal edges)' });
    return;
  }
  const door = e[EDGE.portal];
  if (e[EDGE.waterway] === true) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: 'portal with waterway true', want: 'a portal edge is a door, not a water route' });
  if (!isObj(door) || !isPosValue(door.a) || !isPosValue(door.b)) { sink({ ...at, code: 'E-DIM-STRUCT-FIELD', got: door, want: 'portal {a: struct:pos, b: struct:pos}' }); return; }
  if (rp.plans.size === 0) return;
  for (const [side, pos, end] of [['a', door.a, e[EDGE.from]], ['b', door.b, e[EDGE.to]]]) {
    const zone = zoneOfPos(grid, rp.plans, pos);
    if (zone === null || !inSubtree(rp, zone, end)) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: [side, pos], want: `portal ${side} lies inside the footprint of ${end}` });
  }
}

/**
 * 水路边栅格化的加载期校验（卷五 §4.1 规则 4：水路边只走可航水体足迹区格，两端之间没有通航水域即加载报错 E-GRID-WATERWAY-NO-CHANNEL；对照表 34 行）。
 * 水路只读水体足迹与词表（不要地表高），所以加载期就能判；陆路边要地表高（世界种子），由运行期 routeView 栅格化，不在这里判。
 * 步长要 det-math 的定点开方表，表在规则表校验通过后才装入（load/rules.mjs checkRules），所以本校验排在 checkRules 之后、由加载器单独调，
 * 与 checkPlaceTable 分开（后者排在装表之前）。没有格空间、结构已被 checkPlaceTable 报错的表在这里不再重报。
 * @param {{vocab: any, rules?: any, tables: Map<string, any>, env: any}} view @returns {{ok: boolean, errors: string[]}}
 */
export function checkPlaceRasters(view) {
  const errors = [];
  const t = view && view.tables instanceof Map ? view.tables.get(PLACE) : undefined;
  const grid = view && view.rules && view.rules[RULES.grid];
  const spaces = t && Array.isArray(t.doc[SECTION.gridSpaces]) ? t.doc[SECTION.gridSpaces] : [];
  const edges = t && Array.isArray(t.doc[SECTION.edges]) ? t.doc[SECTION.edges].filter(isObj) : [];
  if (spaces.length === 0 || !isObj(grid) || !edges.some((e) => e[EDGE.waterway] === true)) return { ok: true, errors };
  const rows = t.flat && t.flat.rows instanceof Map ? t.flat.rows : new Map();
  const idx = view.vocab ? view.vocab.index : undefined;
  if (!checkGridSpaces(t, view, [], spaces)) return { ok: true, errors };
  const rp = buildPlan({
    ids: [...rows.keys()].sort(cmp),
    get: (id, key) => rows.get(id)[key],
    classesOf: (id) => expandClasses(rowClassesOf({}, null, t, id), broaderOf(idx)),
    relocatable: relocatableIn(idx),
    grid,
    gridSpaces: spaces,
  });
  const env = createRouteEnv({ grid, modifiers: view.rules[RULES.modifiers], vocabIndex: idx, worldSeed: undefined, rp, terrainOf: () => null, edges: [] });
  const water = edges.filter((e) => e[EDGE.waterway] === true && !isDoor(e) && planOfRow(rp, e[EDGE.from]) !== null && planOfRow(rp, e[EDGE.from]) === planOfRow(rp, e[EDGE.to])
    && !rp.offstage.has(e[EDGE.from]) && !rp.offstage.has(e[EDGE.to]));
  if (water.length === 0) return { ok: true, errors };
  if (!env.ready) { errors.push('E-RULES-UNREGISTERED place: rules.grid.roadPaceFactor, rules.grid.longCostCap and rules.terrainModifiers.slopeCurve are needed to rasterize edges'); return { ok: false, errors }; }
  for (const e of water) {
    const r = env.rasterEdge(e);
    if (!r.ok) errors.push(`E-GRID-WATERWAY-NO-CHANNEL place/${SECTION.edges}: no navigable water-body cell chain between ${e[EDGE.from]} and ${e[EDGE.to]} (${r.reason})`);
  }
  return { ok: errors.length === 0, errors };
}

// 地形步进系数与路况系数的取值域（卷五 §4.10.1：paceFactor 与 slopeCurve 严格大于 0；§4.1 规则 5：roadPaceFactor 不大于全部地形的 paceFactor；对照表 38 行）。
// 本表有格空间时寻路读这些量，所以 terrain 族条目缺 paceFactor 即缺必填。
function checkPaceTables(view, errors) {
  const idx = view.vocab && view.vocab.index instanceof Map ? view.vocab.index : new Map();
  const rules = view.rules || {};
  const paces = [];
  for (const [code, rec] of [...idx].sort(([a], [b]) => cmp(a, b))) {
    if (!rec || rec.family !== FAMILY.terrain) continue;
    const p = isObj(rec.entry) ? rec.entry.paceFactor : undefined;
    if (p === undefined) { errors.push(`E-DIM-REQUIRED-MISSING ${code}: terrain entry needs paceFactor`); continue; }
    if (typeof p !== 'number' || !(p > 0)) { errors.push(`E-DIM-DOMAIN-RANGE ${code}: paceFactor ${JSON.stringify(p)} must be a number > 0`); continue; }
    paces.push([code, p]);
  }
  const road = isObj(rules[RULES.grid]) ? rules[RULES.grid].roadPaceFactor : undefined;
  if (road !== undefined) {
    if (typeof road !== 'number' || !(road > 0)) errors.push(`E-DIM-DOMAIN-RANGE rules.grid.roadPaceFactor: ${JSON.stringify(road)} must be a number > 0`);
    else for (const [code, p] of paces) if (road > p) errors.push(`E-DIM-DOMAIN-RANGE rules.grid.roadPaceFactor: ${road} exceeds the paceFactor ${p} of ${code} (a road is never slower than any terrain)`);
  }
  const curve = isObj(rules[RULES.modifiers]) ? rules[RULES.modifiers].slopeCurve : undefined;
  if (Array.isArray(curve)) for (const [x, y] of curve) if (!(y > 0)) errors.push(`E-DIM-DOMAIN-RANGE rules.terrainModifiers.slopeCurve: value ${JSON.stringify(y)} at ${JSON.stringify(x)} must be > 0`);
}

/**
 * 地点表的树、足迹与边校验（kernel 组内用，加载器在维度校验通过后调；没载入 place 表即无事可核）。
 * 单根树（不计离场行）、每行有限步到根（E-DIM-CYCLE；多根 E-DIM-DOMAIN-RANGE）；足迹种类只按组件类判，各足迹输入列只许对应种类的行写
 * （禁填，E-DIM-DOMAIN-RANGE；必填由表头 byFootprint 条件判，E-DIM-REQUIRED-MISSING）；coord 缺 x、y、anchor 不合 struct:pos 即 E-DIM-STRUCT-FIELD；
 * 表里登记了格空间表（gridSpaces 节）时，按卷五 §4.1 规则 3、10 划分区域足迹并核包含：子足迹不在父足迹内 E-GRID-FOOTPRINT-OUTSIDE-PARENT、
 * 兄弟足迹相交 E-GRID-SIBLING-OVERLAP、同父两个种子同区格 E-GRID-SEED-SAME-CELL、boundary 不连通 E-DIM-DOMAIN-RANGE、缺 coord 的派生子行 E-DIM-REQUIRED-MISSING；
 * 层根须有格空间、格空间的根须是层根（E-DIM-REF-MISSING、E-DIM-DOMAIN-RANGE）；每个区格有 cellclass 条目成立（E-GRID-CELL-NO-TERRAIN）。
 * 足迹与区格校验是格空间表的校验：对表里的行生效，没有行就没有格可划；"世界必有格空间表、主世界根必挂层根并有格空间行"归 G5（真实世界的格空间表随 6-24 转换引入）。离场子树不参加这些校验（规则 3 末句）。
 * 边节逐条照 edgeStruct 校验（两端须是地点 E-DIM-REF-MISSING，字段与取值域照登记），`from` 小于 `to`（E-DIM-DOMAIN-RANGE），
 * 两端加通路类型唯一（E-DIM-DUPLICATE-KEY）；juris 族条目带整数 rank（E-DIM-STRUCT-FIELD）。表里没有行时没有树可核。
 * 返回 "<登记码> <所在> <说明>" 文字行。
 * @param {{vocab: any, rules?: any, tables: Map<string, any>, env: any}} view
 * @returns {{ok: boolean, errors: string[]}}
 */
export function checkPlaceTable(view) {
  const errors = [];
  const idx = view && view.vocab ? view.vocab.index : undefined;
  if (idx instanceof Map) {
    for (const [code, rec] of [...idx].sort(([a], [b]) => cmp(a, b))) {
      if (rec && rec.family === T.vocab_family.juris && !(isObj(rec.entry) && Number.isInteger(rec.entry[JURIS_RANK]))) errors.push(`E-DIM-STRUCT-FIELD ${code}: juris entry needs an integer ${JURIS_RANK}`);
    }
  }
  const t = view && view.tables instanceof Map ? view.tables.get(PLACE) : undefined;
  if (!t) return { ok: errors.length === 0, errors };
  const rows = t.flat && t.flat.rows instanceof Map ? t.flat.rows : new Map();
  const ids = [...rows.keys()].sort(cmp);
  const parent = (id) => { const v = rows.get(id)[DIM.parent]; return typeof v === 'string' && rows.has(v) ? v : null; };
  // 足迹计划：与运行期同一份整理与划分（place-plan.mjs、footprint.mjs）；足迹种类与离场子树都由它判。
  const grid = view.rules && view.rules.grid;
  // 格空间表是 place 表的 gridSpaces 节，与 edges 节同体例；节里没有行就是没有格空间（没有格可划，划分自然为空），不是另一条校验路径。
  // 节写了但不是列表（null、对象）拒收，不当作没有放过。
  const listed = t.doc[SECTION.gridSpaces];
  if (Object.hasOwn(t.doc, SECTION.gridSpaces) && !Array.isArray(listed)) errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.gridSpaces} is a list`);
  const spaces = Array.isArray(listed) ? listed : [];
  const spacesOk = checkGridSpaces(t, view, errors, spaces);
  if (spaces.length > 0 && !isObj(grid)) errors.push('E-RULES-UNREGISTERED place: gridSpaces present but rules.grid is not registered');
  const gridOk = spacesOk && (spaces.length === 0 || isObj(grid));
  const rp = buildPlan({
    ids,
    get: (id, key) => rows.get(id)[key],
    classesOf: (id) => expandClasses(rowClassesOf({}, null, t, id), broaderOf(idx)),
    relocatable: relocatableIn(idx),
    grid,
    gridSpaces: gridOk ? spaces : [],
  });
  // 规则 1：单根（不计离场行）、有限步到根。
  const roots = ids.filter((id) => rows.get(id)[DIM.parent] === null && !rp.offstage.has(id));
  if (roots.length > 1) errors.push(`E-DIM-DOMAIN-RANGE place: ${roots.length} rows have a null parent (${roots.join(',')}); exactly one root`);
  for (const id of ids) {
    const seen = new Set([id]);
    for (let p = parent(id); p !== null; p = parent(p)) {
      if (seen.has(p)) { errors.push(`E-DIM-CYCLE place/${id}: parent chain never reaches the root (revisits ${p})`); break; }
      seen.add(p);
    }
  }
  // 规则 2：各足迹输入列只许对应足迹种类的行写（禁填）；coord 缺 x 或 y、anchor 不合 struct:pos 即结构错（不按 0 顶替）。
  for (const id of ids) {
    const row = rows.get(id);
    const kind = rp.kinds.get(id);
    for (const [key, allowed] of Object.entries(FOOTPRINT_COLUMNS)) {
      if (written(row, key) && !allowed.includes(kind)) errors.push(`E-DIM-DOMAIN-RANGE place/${id}: ${key} is not written on a ${kind} footprint row (only ${allowed.join(',')})`);
    }
    const c = row[DIM.coord];
    if (isObj(c) && (typeof c[COORD.x] !== 'number' || typeof c[COORD.y] !== 'number')) errors.push(`E-DIM-STRUCT-FIELD place/${id}: coord needs numeric x and y`);
    if (written(row, DIM.anchor) && !isPosValue(row[DIM.anchor])) errors.push(`E-DIM-STRUCT-FIELD place/${id}: anchor is not a struct:pos`);
  }
  // 规则 3、10 与格空间表：划分结果里的违规，层根与格空间的对应，每个区格有地形类。
  // "世界必有格空间表、主世界根必须挂层根并有格空间行"归 G5（6-24 转换引入真实世界的格空间表时同卡落地、测试先行）；G3 的校验对表里的行生效。
  {
    for (const e of rp.errors) errors.push(`${e.code} place/${e.id}: ${e.detail}`);
    // 非对象的格空间行已由 checkGridSpaces 报结构错（E-DIM-STRUCT-FIELD），这里只看对象行，不抛 TypeError。
    const objectRows = spaces.filter(isObj);
    const spaceRoots = new Set(objectRows.map((s) => s[GRID_SPACE.root]));
    for (const s of objectRows) {
      const r = s[GRID_SPACE.root];
      if (rows.has(r) && !rp.layerRoots.includes(r)) errors.push(`E-DIM-DOMAIN-RANGE place/${r}: grid space ${s[GRID_SPACE.w]} root must be a layer-root row`);
    }
    for (const r of rp.layerRoots) if (!spaceRoots.has(r)) errors.push(`E-DIM-REF-MISSING place/${r}: layer-root row has no grid space (${SECTION.gridSpaces})`);
    if (rp.plans.size > 0) checkCellClasses(view, rp, errors);
  }
  // 规则 4：边节。
  const def = t.doc[SECTION.edgeStruct];
  const edges = t.doc[SECTION.edges];
  if (!isObj(def) || def.type !== T.type.struct) { errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.edgeStruct} is a struct definition of the edges section`); return { ok: false, errors }; }
  if (!Array.isArray(edges)) { errors.push(`E-DIM-STRUCT-FIELD place: ${SECTION.edges} is a list`); return { ok: false, errors }; }
  const sink = (e) => errors.push(`${e.code} place/${e.path}: got ${JSON.stringify(e.got)} want ${e.want}`);
  checkDef(def, view.env, { table: PLACE, row: '', dim: SECTION.edgeStruct, path: SECTION.edgeStruct }, sink, false);
  const keys = new Set();
  edges.forEach((e, i) => {
    const at = { table: PLACE, row: '', dim: SECTION.edges, path: `${SECTION.edges}/${i}` };
    if (!isObj(e)) { sink({ ...at, code: 'E-DIM-STRUCT-FIELD', got: e, want: 'edge object' }); return; }
    checkValue(def, e, view.env, at, sink);
    const a = e[EDGE.from];
    const b = e[EDGE.to];
    if (typeof a === 'string' && typeof b === 'string' && !(a < b)) sink({ ...at, code: 'E-DIM-DOMAIN-RANGE', got: [a, b], want: 'from sorts before to (edge stored once)' });
    const key = JSON.stringify([a, b, e[EDGE.waterway]]);
    if (keys.has(key)) sink({ ...at, code: 'E-DIM-DUPLICATE-KEY', got: [a, b, e[EDGE.waterway]], want: 'one edge per (from, to, waterway)' });
    keys.add(key);
    checkEdgeEnds(rp, grid, e, at, sink);
  });
  checkPaceTables(view, errors);
  return { ok: errors.length === 0, errors };
}
