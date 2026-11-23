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
import { FOOTPRINT_KIND, isSettlementClasses } from './footprint-kind.mjs';
import {
  zoneOfPos, cellList, regionGeometry, regionHeights, regionCellPos, landRegionCell, accessCell, openBoundaryCells,
  straightM as straightMCore, bearingView as bearingViewCore,
  regionOfPos, ownerIdAt, inBox, keyOf, controlPointsOf, regionCellHeight, regionBedDelta, footprintHas, footprintCells,
  boundaryEntriesValid, BOUNDARY_ENTRY_DETAIL, eachCell, xOf, yOf,
} from './footprint.mjs';
import { columnSurface, nearControlPoints, regionSlope, cellAt, cellFlags, extrudeLanding, extrudeLayerReach, settleKindOf, fallStep, SETTLE, STATE, CELL_KIND } from './grid-base.mjs';
import { datedValueAt, inputVersionAt } from './dated.mjs';
import { datedRecordsAll } from './storage.mjs';
import { createDiffReader } from './grid-diff-read.mjs';
import { checkBlueprintForms, KIND as BLUEPRINT_KIND } from './blueprint.mjs';
import { blueprintOf as blueprintCore, buildingCellAt, buildingColumn, buildingFootprint, buildingTopStoreyInRegion, checkBuildingRows, doorExitsOf } from './place-building.mjs';
import { checkGenTemplates, genTemplateOf, templateBlocksOf } from './grid-template.mjs';
import { checkLayoutTemplates } from './layout.mjs';
import { volumeColumn, volumeZoneAt, volumeFootprint, volumeCellsOf, volumeExitsOf, volumesUnderRegionCells, checkVolumes, checkVolumeRows } from './place-volume.mjs';
import { buildPlan, expandClasses, waterAccessOf, footprintAdjacency, edgeAdjacency, flowingOfIndex } from './place-plan.mjs';
import { createRouteEnv, edgeNumbers } from './route-edges.mjs';
import { report } from './report.mjs';
import { activeEdges } from './holdings.mjs';
import { isPosValue } from './named-structs.mjs';
import { matchStruct } from './named-struct-match.mjs';
import { cellClassOf, surfaceStorey as surfaceStoreyOf, landCellKey, landOrderKey } from './grid.mjs';

const POS_STRUCT = 'struct:pos'; // 命名 struct 登记里位置那一行的名（卷二 §1.5 :252；与 named-structs.mjs 同名）

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// 本卷的表与维度、边节字段（卷五 §2.1、§4.1.1；表头里登记的名字，本文件只读它们，不另定义含义）。
const PLACE = 'place';
const MATERIAL = 'material';
const FACILITY_TYPE = 'facility_type'; // 设施类型表的 kind（卷十九 §2.2，维度表，不是词表族）
const DIM = Object.freeze({
  parent: 'parent', areaM2: 'areaM2', underground: 'underground', elevationM: 'elevationM', coord: 'coord',
  centroid: 'centroid', zRange: 'zRange', anchor: 'anchor', facing: 'facing', waterKind: 'waterKind',
  surfaceRefElevationM: 'surfaceRefElevationM', depthM: 'depthM',
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
  mouth: [FOOTPRINT_KIND.volume],
  anchorElevationM: [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume],
  terrain: [FOOTPRINT_KIND.region, FOOTPRINT_KIND.volume],
});
// 离场子树内按未知返回的位置量与依赖足迹的派生量（卷五 §4.1 规则 8 第三条：anchor、facing、footprint 与 centroid、areaM2、elevationM 等）。
const OFFSTAGE_UNKNOWN = Object.freeze([DIM.anchor, DIM.facing, DIM.centroid, DIM.areaM2, DIM.elevationM, DIM.zRange]);
// 关系行代号（卷五 §4.1.2 表；本文件是这三行的实现方）。
const REL = Object.freeze({ residents: 'rel_residents' });
// 持有边的字段（卷二 §1.5 struct:holding；卷十八 §4.1.1 terms 公共键 until）与种类行的 domicile 列（R18-1.10）。
const HOLDING = Object.freeze({ kind: 'kind', subject: 'subject', terms: 'terms' });
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
// 按日生效的改写记录（卷二 §1.3 最上一级、§2.7 dated；卷五 §4.1 规则 16）盖过偏离行与建行值：dated 是 datedValueAt 的读口，没有该行该维度的有效记录时不返回 found。
function effectiveValue(t, state, id, key, dated) {
  const over = dated ? dated(id, key) : { found: false };
  if (over.found) return over.value;
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
  // 缓存键含"当日有效输入版本"（卷五 §4.1 规则 16、卷二 inputVersionAt）：某输入在某日生效，缓存在那一日失效；没有任何改写记录时版本为 null（不取时钟、不取摘要）。
  const inputVersion = datedRecordsAll(state).length === 0 ? null : inputVersionAt(engine, state);
  const sig = JSON.stringify([inputVersion, ids.filter((id) => Object.hasOwn(created, id)).map((id) => [id, created[id]])]);
  const hit = plans.get(t);
  if (hit && hit.rules === engine.rules && hit.vocab === engine.vocab && hit.sig === sig) return hit.value;
  if (spaces !== null && spaces.length > 0 && !isObj(grid)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'place: gridSpaces present but rules.grid is not registered');
  const index = engine.vocab && engine.vocab.index;
  const value = buildPlan({
    ids,
    get: (id, key) => effectiveValue(t, state, id, key, inputVersion === null ? null : (rid, rkey) => datedValueAt(engine, state, PLACE, rid, rkey)),
    classesOf: (id) => expandClasses(rowClassesOf(engine, state, t, id), broaderOf(index)),
    relocatable: relocatableIn(index),
    grid,
    gridSpaces: spaces,
    flowingOf: flowingOfIndex(index),
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
// 一列的地表 {h, z}（卷五 §4.3 规则 8）：columnSurface 减去所在区格的河床修正 δ（非水体区格 δ 为 0）。gridView 的细格读法与 planFootprints probe 的 surfaceStoreyAt 共用这一处。
// terrain 条目、控制面或 δ 任一未知为 null。
function bedCorrectedColumn(grid, worldSeed, plan, entry, cps, delta, x, y, memo) {
  const raw = entry === null ? null : columnSurface(grid, worldSeed, plan.w, cps, entry, x, y, memo);
  if (raw === null || delta === null) return null;
  return delta === 0n ? raw : { h: raw.h - delta, z: surfaceStoreyOf(grid, raw.h - delta) };
}
const worldSeedOf = (engine) => (engine && isObj(engine.template) && typeof engine.template.seed === 'string' ? engine.template.seed : undefined);

// 建筑蓝图读取的上下文（place-building.mjs）：维度只经内核 dim() 的基值读（与 placeView 同一套取值）；缓存挂在计划对象 rp 上。
function buildingCtx(engine, state, rp) {
  const read = (table) => (id, key) => { const f = dim(engine, state, table, id, key); return f.known ? f.value : undefined; };
  return { engine, state, rp, val: read(PLACE), materialVal: read(MATERIAL) };
}

// 体积足迹（洞穴）读取的上下文（place-volume.mjs）：同建筑蓝图，维度只经 dim() 的基值读；缓存挂在（计划、世界种子）上。世界种子随新开局或读档才有，没有时体积一律读作未知（卷二 §1.12）。
function volumeCtx(engine, state, rp) {
  return { ...buildingCtx(engine, state, rp), seed: worldSeedOf(engine) };
}

/**
 * 世界种子已知后核全部体积行（卷十 R10-2.10、R10-2.14 第 5 项："加载校验把全部体积足迹各派生一遍"）：种子不在世界文件里，随新开局或读档才有，所以不在 checkPlaceTable 里，由持有引擎与状态的一方在种子绑定后调。
 * 返回错误文字行（码在开头：E-GRID-VOLUME-TOP-EXPOSED、E-GEN-ROW-INVALID、E-GRID-FOOTPRINT-OUTSIDE-PARENT）；没有体积行或读不到的为空。
 * @param {any} engine @param {any} state @returns {string[]}
 */
export function checkVolumeCells(engine, state) {
  const rp = planOf(engine, state);
  return checkVolumes(volumeCtx(engine, state, rp));
}

/**
 * 运行期新建区域足迹子行是否压了已凿空的体积列（卷五 §4.1 规则 3 末句、卷十 R10-2.14 第 1 项末句、§5.3 C10-22 ⑦：由新建行的写者核）：
 * 返回区格里有体积列的体积行 id（代号序）；空数组即不压。写者（泡外新建、物化新区域行）建行前调它，非空即拒。
 * @param {any} engine @param {any} state @param {{w: number, regionCells: {x: number, y: number}[]}} spec 新子行占的区格序号
 * @returns {string[]}
 */
export function volumesUnderRegionRows(engine, state, { w, regionCells }) {
  const rp = planOf(engine, state);
  return volumesUnderRegionCells(volumeCtx(engine, state, rp), engine.rules.grid, w, regionCells);
}

/**
 * kernelApi `blueprintOf(engine, state, placeId)`（卷十九 §3.2、§4.1 规则 3、§4.5 规则 8、10）：蓝图转世界坐标（加 anchor、按 facing 转），每格带此刻的材料、顶面、是否开口、所在固定装置，加 openingAreas；
 * 建筑行离场、不是建筑行或输入读不到时为 null（未知）。纯读。细节与未接数据源见 place-building.mjs 的 blueprintOf。
 * @param {any} engine @param {any} state @param {string} placeId
 */
export function blueprintOf(engine, state, placeId) {
  const rp = planOf(engine, state);
  return blueprintCore(buildingCtx(engine, state, rp), placeId);
}

/**
 * 一行的足迹与由足迹派生的量（卷五 §4.1 规则 13，区域足迹在区格粒度上算）：
 * {kind, w, regionCells（区格序号，(x, y) 字典序）, cellCount, areaM2, centroid, elevationM, zRange, waterAccess}。
 * 没有格空间表、离场行、划不出足迹的行返回 null；体积足迹（G8）由洞穴生成器的细格集合派生（place-volume.mjs volumeFootprint，另带 surfaceRefElevationM、depthM、underground），没有世界种子、输入读不到、派生失败（数据错，由 checkVolumeCells 报）为 null；elevationM、zRange 要世界种子与控制点，缺即为 null（未知）。
 * 区域足迹的 regionCells、elevationM、zRange、waterAccess 是读到才求值的只读属性（值与立即求值逐位相同；高度场结果按（世界种子，行）缓存在计划上，计划随生成输入重划；rules.grid 配错时在读这些属性时才报错，不在取足迹时）。
 * 建筑、房间足迹（G7）：足迹是蓝图的格（房间取它那个房间的格），regionCells 为空，areaM2 = 最低一层细格数 × cellM²，zRange 是占的层号范围，elevationM = zMin × storeyM（卷五 §4.1 规则 13）。
 * @param {any} engine @param {any} state @param {string} placeId
 */
export function placeFootprint(engine, state, placeId) {
  const rp = planOf(engine, state);
  const kind = rp.kinds.get(placeId);
  if (kind === FOOTPRINT_KIND.building || kind === FOOTPRINT_KIND.room) {
    if (rp.plans.size === 0) return null;
    const f = buildingFootprint(buildingCtx(engine, state, rp), engine.rules.grid, placeId);
    if (f === null) return null;
    return Object.freeze({ kind: f.kind, w: f.w, regionCells: Object.freeze([]), cellCount: f.cellCount, areaM2: f.areaM2, centroid: Object.freeze(f.centroid), elevationM: f.elevationM, zRange: Object.freeze(f.zRange), waterAccess: Object.freeze([]) });
  }
  if (kind === FOOTPRINT_KIND.volume) {
    // 体积足迹（G8）：派生几何由洞穴生成器的细格集合求（卷五 §4.1 规则 13、§4.5 规则 3）；regionCells 为空，没有世界种子、输入读不到、数据错为 null。
    if (rp.plans.size === 0) return null;
    const f = volumeFootprint(volumeCtx(engine, state, rp), placeId);
    if (f === null) return null;
    return Object.freeze({ ...f, regionCells: Object.freeze([]), centroid: Object.freeze(f.centroid), zRange: Object.freeze(f.zRange), waterAccess: Object.freeze([]) });
  }
  const plan = planOfRow(rp, placeId);
  if (!plan) return null;
  const grid = engine.rules.grid;
  const geo = regionGeometry(grid, plan, placeId);
  if (!geo) return null;
  // elevationM、zRange 要整个足迹的区格代表地表高（卷五 §4.1.3 规则 13），读到才求值（定义在对象上的惰性只读属性，值与立即求值逐位相同）；
  // 求值结果由 regionHeights 按（世界种子，行）缓存在计划上（计划已含全部生成输入，输入变了计划重划，缓存随之丢弃）。
  const seed = worldSeedOf(engine);
  const terrainOf = terrainEntryOf(engine);
  // 区格列表、可及水体类同样读到才求（全规模的父足迹列表装不下，卷五 §4.1.4）。
  const fp = {
    kind: rp.kinds.get(placeId),
    w: plan.w,
    cellCount: geo.cellCount,
    areaM2: geo.areaM2,
    centroid: Object.freeze({ ...geo.centroid }),
  };
  const lazy = (key, compute) => {
    let v;
    let done = false;
    Object.defineProperty(fp, key, { enumerable: true, get: () => { if (!done) { v = compute(); done = true; } return v; } });
  };
  let heights;
  const heightsOf = () => (heights === undefined ? (heights = regionHeights(grid, seed, plan, rp.rows, terrainOf, placeId)) : heights);
  lazy('regionCells', () => Object.freeze(cellList(plan, placeId)));
  lazy('elevationM', () => { const h = heightsOf(); return h ? h.elevationM : null; });
  lazy('zRange', () => { const h = heightsOf(); return h ? Object.freeze({ ...h.zRange }) : null; });
  lazy('waterAccess', () => Object.freeze(waterAccessOf(plan, rp.rows, placeId)));
  return Object.freeze(fp);
}

/**
 * kernelApi `zoneAt(engine, state, pos)`（卷五 §3.1、§4.1 规则 12）：位置所在的地点 = 包含该位置的足迹中在包含树上最深的那一行；
 * 位置在格空间外包框之外、格空间不存在、世界没登记格空间表为 null（未知）。coarse 位置照存的格求。离场行不被返回。
 * 区域足迹之上叠建筑与房间足迹（G7，卷五 §4.1 规则 11、12）：位置落在某建筑蓝图的格上，房间格是房间行、其余（外墙、隔墙、内门、门、窗、桥面）是建筑行，所以内门格返回建筑行；
 * 体积足迹（G8）：位置的格在某体积足迹的细格里（洞穴凿空的格）时最深足迹是体积行；洞口通路格不属体积、归所在区域足迹；建筑与体积同占一格时取建筑（蓝图叠在体积凿空之后）。纯读。pos 须合 struct:pos（命名 struct 登记），否则 E-DIM-STRUCT-FIELD。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number, coarse: boolean}} pos @returns {string | null}
 */
export function zoneAt(engine, state, pos) {
  if (!isPosValue(pos)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'zoneAt: pos is not a struct:pos');
  const rp = planOf(engine, state);
  if (rp.plans.size === 0) return null;
  const region = zoneOfPos(engine.rules.grid, rp.plans, pos);
  if (region === null) return null;
  const inside = buildingCellAt(buildingCtx(engine, state, rp), engine.rules.grid, pos);
  if (inside !== null) return inside.zone; // 建筑蓝图叠在体积凿空之后（卷五 §4.3 规则 10），同一格两者都有时取建筑
  const cave = volumeZoneAt(volumeCtx(engine, state, rp), engine.rules.grid, pos); // 体积足迹的格（洞穴）：最深足迹是体积行；洞口通路格属所在区域足迹
  if (cave === undefined) return null; // 这一列的体积读不到（无世界种子、控制点海拔未知、输入缺）：不知道有没有洞，按未知传播（卷二 :387、:389），不返回区域行顶替
  return cave === null ? region : cave;
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
 * kernelApi `regionOf(engine, pos)`（卷五 §4.1.1：区格序号 = floor(x × cellM ÷ regionCellM)，派生不存；全书"位置所在区格"唯一出处）：
 * 返回 {x, y}。纯函数，不读状态，引擎只用来取 rules.grid 的格尺度；pos 须合 struct:pos，否则 E-DIM-STRUCT-FIELD。
 * @param {any} engine @param {{w: number, x: number, y: number, z: number, coarse: boolean}} pos @returns {{x: number, y: number}}
 */
export function regionOf(engine, pos) {
  requirePos(pos, 'regionOf pos');
  return regionOfPos(engine.rules.grid, pos);
}

/**
 * kernelApi `gridSpaceBox(engine, state, w)`（卷五 §4.1.1：格空间表的外包框，区格序号范围）：返回冻结的 {x0, y0, cellsX, cellsY}；
 * 格空间号不存在（含世界没登记格空间表）为 null。纯读。区格 (x, y) 在框内 ⇔ x0 ≤ x < x0 + cellsX 且 y0 ≤ y < y0 + cellsY。
 * @param {any} engine @param {any} state @param {number} w @returns {{x0: number, y0: number, cellsX: number, cellsY: number} | null}
 */
export function gridSpaceBox(engine, state, w) {
  const plan = planOf(engine, state).plans.get(w);
  return plan ? Object.freeze({ x0: plan.box.x0, y0: plan.box.y0, cellsX: plan.box.cellsX, cellsY: plan.box.cellsY }) : null;
}

/**
 * kernelApi `landCell(engine, state, {place, kind, seedKey, coarse})`（卷五 §3.1、§4.1 规则 14）：在地点足迹内落一格。
 * coarse 为真（泡外代表格）：区域足迹按 hash(seedKey, 区格序号) 取第一个 zoneAt 恰为 place 的区格的中心列地表层格；没有可落格为 null（不落到别处）。
 * coarse 为假（泡内，可立足细格；卷五 §4.1 规则 14 :502，G12 起由 placeSubject 调）：见 landFineCell。体积（G8）coarse 为真时在体积足迹的格里按 landCellKey 取最小者（同建筑、房间的取法）。纯读。
 * 建筑、房间（G7，规则 14 :501）：coarse 为真时在"zoneAt 恰为 place"的足迹格里按 landCellKey(seedKey, w, x, y, z)（格序号含层，取格的整数坐标）取最小者，并列按 (x, y, z) 字典序；
 * 建筑取墙、隔墙、门、窗、内门与无对应房间行的室内格，房间取它那个房间的格；coarse 是代表格，不要求可立足；没有可落格为 null。
 * @param {any} engine @param {any} state @param {{place: string, kind: string, seedKey: string, coarse: boolean}} spec
 * @returns {{w: number, x: number, y: number, z: number, coarse: boolean} | null}
 */
export function landCell(engine, state, { place, seedKey, coarse }) {
  if (coarse !== true && coarse !== false) throw new KernelError('E-DET-DOMAIN', {}, 'landCell: coarse is true or false');
  if (coarse === false) return landFineCell(engine, state, place, seedKey);
  const rp = planOf(engine, state);
  const kindOfPlace = rp.kinds.get(place);
  if (kindOfPlace === FOOTPRINT_KIND.building || kindOfPlace === FOOTPRINT_KIND.room) {
    if (rp.plans.size === 0) return null;
    const f = buildingFootprint(buildingCtx(engine, state, rp), engine.rules.grid, place);
    if (f === null) return null;
    // 候选格：足迹内且 zoneAt 恰为 place 的格（卷五 §4.1 规则 14 :501；建筑即墙、隔墙、门、窗、内门与无对应房间行的室内格，房间即它那个房间的格）；coarse 是代表格，不要求可立足。
    const mine = f.cells.filter((c) => c.zone === place);
    if (mine.length === 0) return null;
    const keyed = mine.map((c) => ({ c, k: landCellKey(seedKey, f.w, c.x, c.y, c.z) }));
    keyed.sort((a, b) => cmp(a.k, b.k) || cmp(a.c.x, b.c.x) || cmp(a.c.y, b.c.y) || cmp(a.c.z, b.c.z));
    return { w: f.w, x: keyed[0].c.x, y: keyed[0].c.y, z: keyed[0].c.z, coarse: true };
  }
  if (kindOfPlace === FOOTPRINT_KIND.volume) {
    // 体积（G8，卷五 §4.1 规则 14）：在 zoneAt 恰为 place 的体积格里按 landCellKey(seedKey, w, x, y, z) 取最小者，并列 (x, y, z) 字典序；coarse 是代表格，不要求可立足；没有可落格为 null。
    if (rp.plans.size === 0) return null;
    const ctx = volumeCtx(engine, state, rp);
    const f = volumeFootprint(ctx, place);
    if (f === null) return null;
    const keyed = volumeCellsOf(ctx, place).map((c) => ({ c, k: landCellKey(seedKey, f.w, c.x, c.y, c.z) }));
    if (keyed.length === 0) return null;
    keyed.sort((a, b) => cmp(a.k, b.k) || cmp(a.c.x, b.c.x) || cmp(a.c.y, b.c.y) || cmp(a.c.z, b.c.z));
    return { w: f.w, x: keyed[0].c.x, y: keyed[0].c.y, z: keyed[0].c.z, coarse: true };
  }
  const plan = planOfRow(rp, place);
  if (!plan) {
    if (rp.kinds.has(place) && rp.kinds.get(place) !== FOOTPRINT_KIND.region) throw new KernelError('E-DET-DOMAIN', {}, `landCell: ${rp.kinds.get(place)} footprints are not built yet`);
    return null;
  }
  return landRegionCell(engine.rules.grid, worldSeedOf(engine), plan, rp.rows, terrainEntryOf(engine), place, seedKey, (pos) => zoneAt(engine, state, pos) === place);
}

/**
 * 给地点、泡内一支（卷五 §4.1 规则 14 :502 "coarse 为假"；卷十七 §3.3 :302；G12 由 placeSubject 调）：只在 zoneAt 恰为 place 的格里取可立足细格，
 * 同 coarse 为真的次序——区域足迹按 landOrderKey(seedKey, 区格序号) 升序（并列 (x, y) 字典序）逐个区格看，取该区格内（代表格即区格中心列地表层那一格，
 * 竖向与水平各 landSearchRadiusCells 的范围，竖向同挤出的 extrudeLayerReach）可立足的格，第一个有可立足格的区格胜出，格取 landCellKey(seedKey, w, x, y, z) 最小者（并列 (x, y, z) 字典序）；
 * 建筑、房间、体积足迹的候选就是足迹里 zoneAt 恰为 place 的全部格，取可立足者里 landCellKey 最小者。都没有、区格代表格高度读不到、地点不存在或离场返回 null（未知，调用方不放进岩里、不落到别的地点）。
 * 可立足标志取 gridView（基底 ⊕ 差分，同一套），读不到可立足的格不当可立足。`kind` 为物时另要求承面（卷五 :502）不在本函数：物经批次写者落格，未落。纯读，同输入同结果。
 */
function landFineCell(engine, state, place, seedKey) {
  const grid = engine.rules && engine.rules[RULES.grid];
  const radius = isObj(grid) ? grid.landSearchRadiusCells : undefined;
  if (!Number.isSafeInteger(radius) || radius < 1) throw new KernelError('E-RULES-UNREGISTERED', {}, 'landCell: rules.grid.landSearchRadiusCells is not registered (positive integer, cells)');
  const rp = planOf(engine, state);
  if (rp.plans.size === 0 || !rp.kinds.has(place)) return null;
  const kind = rp.kinds.get(place);
  // 一批候选格：同批内取 landCellKey 最小者；批与批按序看，第一个有可立足格的批胜出。zoneCheck 为真时逐个核 zoneAt 恰为 place（区域足迹的窗口里可能压着更深的后代足迹）。
  const standableOf = (w, cells) => {
    let x0 = Infinity; let y0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let y1 = -Infinity; let z1 = -Infinity;
    for (const c of cells) { x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); z0 = Math.min(z0, c.z); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); z1 = Math.max(z1, c.z); }
    const view = gridView(engine, state, { w, cells: { x0, y0, z0, x1, y1, z1 } });
    if (view === null) return new Map();
    return new Map(view.cells.map((c) => [`${c.x},${c.y},${c.z}`, c.known && c.standable === true]));
  };
  const pick = (w, cells, zoneCheck) => {
    if (cells.length === 0) return null;
    const stand = standableOf(w, cells);
    const keyed = cells.filter((c) => stand.get(`${c.x},${c.y},${c.z}`) === true).map((c) => ({ c, k: landCellKey(seedKey, w, c.x, c.y, c.z) }));
    keyed.sort((a, b) => cmp(a.k, b.k) || cmp(a.c.x, b.c.x) || cmp(a.c.y, b.c.y) || cmp(a.c.z, b.c.z));
    for (const { c } of keyed) {
      const cell = { w, x: c.x, y: c.y, z: c.z, coarse: false };
      if (!zoneCheck || zoneAt(engine, state, cell) === place) return cell;
    }
    return null;
  };
  if (kind === FOOTPRINT_KIND.building || kind === FOOTPRINT_KIND.room) {
    const f = buildingFootprint(buildingCtx(engine, state, rp), grid, place);
    return f === null ? null : pick(f.w, f.cells.filter((c) => c.zone === place).map((c) => ({ x: c.x, y: c.y, z: c.z })), false);
  }
  if (kind === FOOTPRINT_KIND.volume) {
    const ctx = volumeCtx(engine, state, rp);
    const f = volumeFootprint(ctx, place);
    return f === null ? null : pick(f.w, volumeCellsOf(ctx, place).map((c) => ({ x: c.x, y: c.y, z: c.z })), false);
  }
  const plan = planOfRow(rp, place);
  if (!plan) return null;
  const reach = extrudeLayerReach(grid, radius);
  // 流式取"下一个最小者"：不物化区格列表、不整表排序（全规模区格列表不得物化，G5b）。每轮 eachCell 扫一遍，只留 (landOrderKey, x, y) 严格大于上一个的最小者，
  // 区格在序里依次出现，第一个有可立足格的区格即返回；结果与"整表排序后逐个看"逐格一致（同键并列按 (x, y) 字典序）。
  const before = (a, b) => cmp(a.k, b.k) < 0 || (cmp(a.k, b.k) === 0 && (a.x < b.x || (a.x === b.x && a.y < b.y)));
  let last = null;
  for (;;) {
    let next = null;
    eachCell(plan, place, (idx) => {
      if (ownerIdAt(plan, idx) !== place) return;
      const cand = { x: xOf(plan.box, idx), y: yOf(plan.box, idx), k: '' };
      cand.k = landOrderKey(seedKey, plan.w, cand.x, cand.y);
      if (last !== null && !before(last, cand)) return;
      if (next === null || before(cand, next)) next = cand;
    });
    if (next === null) break;
    last = next;
    const r = { x: next.x, y: next.y };
    const c0 = regionCell(engine, state, { w: plan.w, region: r });
    if (c0 === null) return null; // 区格中心列高度读不到：未知，不跳过它往下一个区格找
    const window = [];
    for (let x = c0.x - radius; x <= c0.x + radius; x += 1) for (let y = c0.y - radius; y <= c0.y + radius; y += 1) for (let z = c0.z - reach; z <= c0.z + reach; z += 1) window.push({ x, y, z });
    const hit = pick(plan.w, window, true);
    if (hit !== null) return hit;
  }
  return null;
}

// ---------- gridView（卷五 §3.1、§4.3 规则 8–11、§4.5；格子迁移 G6） ----------

// 材料行的分态布尔（卷三甲 :128–:131 always 必填，加载期已核每行三栏都有值）：读 dim()，取格的当时物态那一栏。
// 读不到（行不是材料、栏不是布尔）说明加载保证被破坏，当内核错误抛出，不当未知也不当假。
function materialFlagReader(engine, state) {
  return (material, matterState, flag) => {
    const f = dim(engine, state, MATERIAL, material, flag);
    if (!f.known || !isObj(f.value) || typeof f.value[matterState] !== 'boolean') throw new KernelError('E-DIM-REQUIRED-MISSING', {}, `gridView: material ${material} has no ${flag}.${matterState} (required always)`);
    return f.value[matterState];
  };
}

// 一个区格的区格层事实（规则 8、9）：所属最深区域足迹、地形类、中心列地表、坡度、水体类、是否聚落、是否道路或航道。一次 gridView 调用内按区格缓存（不跨调用）。
function regionFacts(engine, state, rp, plan, rx, ry, entries) {
  const grid = engine.rules[RULES.grid];
  const k = keyOf(plan.box, rx, ry);
  const owner = ownerIdAt(plan, k);
  if (owner === undefined) return null;
  const row = rp.rows.get(owner);
  const worldSeed = worldSeedOf(engine);
  const terrainOf = terrainEntryOf(engine);
  const centerH = regionCellHeight(grid, worldSeed, plan, rp.rows, terrainOf, rx, ry);
  let slope = null;
  if (centerH !== null) {
    // 外包框外没有区格，不参加；框内邻格高度未知则坡度未知（regionSlope 往下传，卷二 §1.12），不跳过。
    const nbrs = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => inBox(plan.box, rx + dx, ry + dy)).map(([dx, dy]) => regionCellHeight(grid, worldSeed, plan, rp.rows, terrainOf, rx + dx, ry + dy));
    slope = regionSlope(grid, centerH, nbrs);
  }
  // 水体类、聚落：只沿最深归属行的祖先链看（同 waterAccessOf 的口径，不为每格建集合）。
  let waterKind = null;
  let inSettlement = false;
  for (let c = owner; c !== null && c !== undefined; c = rp.rows.get(c).parent) {
    const wk = rp.rows.get(c).waterKind;
    if (waterKind === null && typeof wk === 'string') waterKind = wk;
    if (isSettlementClasses(rp.classes.get(c))) inSettlement = true;
  }
  const { env } = routeEnvOf(engine, state);
  const roads = env.roadsOf(plan);
  const onRoad = roads !== null && (roads.land.has(k) || roads.water.has(k));
  const cellClass = slope === null ? null : cellClassOf(entries, { terrain: row.terrain, waterKind, slope, onRoad, inSettlement });
  return { owner, row, centerH, slope, waterKind, inSettlement, onRoad, cellClass };
}

// 建筑蓝图一层的叠入口（grid-base 的 overlay 回调）：墙与隔墙读派到的料（固态）、室内与门窗洞读空气、楼梯格给"楼梯"格种类（读作空气、不是实心料）、桥面层的格保留基底只加顶面；
// 顶面是顶元派到的料（没有料即读作无）。材料为 null 的格取该列模板的空气行（gentemplate.airMaterial）。
function buildingOverlay(building) {
  return (col, z, base) => {
    const r = building.at(z);
    if (r === null) return null;
    if (r.unknown) return { material: null, state: null, selfSupport: null, unknown: true, zone: r.zone }; // 依赖未登记的劣化规则表：未知，往下传
    if (r.kind === null) return { ...base, ceiling: r.ceiling, zone: r.zone };
    const solid = r.material !== null;
    return { material: solid ? r.material : col.tpl.airMaterial, state: solid ? STATE.solid : STATE.gas, selfSupport: false, kind: r.stairs ? CELL_KIND.stairs : null, ceiling: r.ceiling, zone: r.zone };
  };
}

// 体积凿空一层的叠入口（G8）：体积足迹的格与洞口通路格读空气行（气态）；洞口通路格带格种类"梯"（可立足、可通行），体积足迹的格 zone 是体积行，通路格 zone 为空（按所在区域足迹）。
function volumeOverlay(vol) {
  return (col, z) => {
    const r = vol.at(z);
    if (r === null) return null;
    if (r.unknown) return { material: null, state: null, selfSupport: null, unknown: true, zone: r.zone }; // 含水层的格：水自体积底层向上填、水量读水体账户，账户读数未接，不画成干空气（卷五 §4.3 规则 10 :661）
    return { material: col.tpl.airMaterial, state: STATE.gas, selfSupport: false, kind: r.kind, zone: r.zone };
  };
}

// 格差分一层的叠入口（G9；卷五 §4.3 规则 10 的最后一层、§4.1 规则 15 "任一细格的内容 = 基底 ⊕ 差分"）：这一格有有效差分才返回新格（没有返回 null）。
// 差分的 material 非空即把格改成那一行材料（物态：是该模板的空气行读气态，其余读固态——材料行没有基础物态维度，液体差分待卷三甲给读法，见 docs/问题.md "G9 遗留"），
// 同时丢掉下层的格种类与自承托（材料换了，原来的梯、坡、格块自承托不再成立）；material 为空则保留下层的格，只叠 fixture、mark。顶面与所属地点沿用下层。
function diffOverlay(reader, w, x, y) {
  return (col, z, base) => {
    const d = reader.cellAt(w, x, y, z);
    if (d === null) return null;
    if (d.material === null) return { ...base, fixture: d.fixture, mark: d.mark };
    return { ...base, fixture: d.fixture, mark: d.mark, material: d.material, state: d.material === col.tpl.airMaterial ? STATE.gas : STATE.solid, selfSupport: false, kind: null, unknown: false };
  };
}

// 体积凿空、建筑蓝图、格差分依次叠（卷五 §4.3 规则 10）：每一层读到的"基底"是前面各层叠完之后的格；返回 null 即这一格没有任何一层改动。
function stackOverlays(...layers) {
  const live = layers.filter((l) => l !== null);
  if (live.length === 0) return null;
  if (live.length === 1) return live[0];
  return (col, z, base) => {
    let cur = base;
    let changed = null;
    for (const layer of live) {
      const next = layer(col, z, cur);
      if (next) { cur = next; changed = next; }
    }
    return changed;
  };
}

/**
 * kernelApi `gridView(engine, state, {w, region: {x, y}} | {w, cells: {x0, y0, z0, x1, y1, z1}})`（卷五 §3.1 :313）：纯读，结果只由生成输入与（当日有效输入版本）决定，
 * 与该区格此刻在不在现场泡里无关（§4.1 规则 17）；不缓存、不写状态。
 * - 区格：{w, region, owner（所属最深区域足迹）, cellClass, genTemplate, surfaceStorey, surfaceHeightM（中心列）, slope, onRoad, inSettlement}；格空间不存在或区格在外包框外为 null；
 *   中心列高度未知（控制点海拔未知）时 surfaceStorey、surfaceHeightM、slope、cellClass 为 null。
 * - 细格范围（闭区间，x、y、z 为细格整数坐标）：返回 {w, cells: [...]}，只含外包框内的列，按 (x, y, z) 字典序；每格 {x, y, z, known, material（空气是 gentemplate.airMaterial 那一行、物态 gas）, state, selfSupport, kind, fixture, mark, ceiling,
 *   blocksSky, bearsLoad, standable, zone}。列高度或区格坡度未知则该列各格 known 为 false、其余字段 null。kind、fixture、ceiling 来自 G7 建筑蓝图；格差分 cells.* 是最后一层（G9，卷五 §4.1 规则 15、16）：
 *   差分的 material 非空顶替下层材料，只有 fixture、mark 时保留下层的格，永久、当场生效；体积凿空（G8，洞穴生成器）叠在模板格块之后、蓝图之前：体积足迹的格与洞口通路格读空气（洞口通路格的 kind 是 ladder，zone 为所在区域足迹，体积格的 zone 是体积行）。水体足迹里的区格（waterKind 非空）地表以上的格 known 为 false：水体账户的读数（卷二十 §4.6.1）与存量单元行（卷五 §2.1 水体字段、stocks）
 *   代码里尚未建，水层读不到即未知，不报成干地（接上后改调 grid-base.mjs 的 waterOfRegion，去掉这一支；docs/问题.md "G6 遗留"）；有形存量的位置层同理还没叠。返回结构里没有余额、件数、千克数（S5-8）。
 * @param {any} engine @param {any} state
 * @param {{w: number, region?: {x: number, y: number}, cells?: {x0: number, y0: number, z0: number, x1: number, y1: number, z1: number}}} spec
 */
export function gridView(engine, state, spec) {
  const rp = planOf(engine, state);
  const plan = rp.plans.get(spec.w);
  if (!plan) return null;
  const grid = engine.rules[RULES.grid];
  const index = engine.vocab && engine.vocab.index instanceof Map ? engine.vocab.index : new Map();
  const entries = [...index].filter(([, rec]) => rec && rec.family === FAMILY.cellclass).map(([code, rec]) => [code, rec.entry]);
  if (isObj(spec.region)) {
    const { x: rx, y: ry } = spec.region;
    if (!inBox(plan.box, rx, ry)) return null;
    const f = regionFacts(engine, state, rp, plan, rx, ry, entries);
    if (f === null) return null;
    const tpl = f.cellClass === null ? null : genTemplateOf(index, f.cellClass);
    return Object.freeze({
      w: plan.w, region: Object.freeze({ x: rx, y: ry }), owner: f.owner, cellClass: f.cellClass, genTemplate: tpl === null ? null : tpl.code,
      surfaceStorey: f.centerH === null ? null : surfaceStoreyOf(grid, f.centerH), surfaceHeightM: f.centerH === null ? null : fixedToNumber(f.centerH),
      slope: f.slope, onRoad: f.onRoad, inSettlement: f.inSettlement,
    });
  }
  if (!isObj(spec.cells)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'gridView: spec needs region or cells');
  const { x0, y0, z0, x1, y1, z1 } = spec.cells;
  const worldSeed = worldSeedOf(engine);
  const terrainOf = terrainEntryOf(engine);
  const cps = controlPointsOf(grid, plan, rp.rows);
  const flagOf = materialFlagReader(engine, state);
  const bctx = buildingCtx(engine, state, rp);
  const vctx = volumeCtx(engine, state, rp);
  const diffs = createDiffReader(state, grid); // 格差分（G9，cells.*，最后一层）：本次调用内按里块建索引，不跨调用
  const memo = new Map(); // 本次调用内相邻列共用的格点噪声（只省哈希）
  const regions = new Map(); // 本次调用内的区格事实与模板、格块
  const out = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      const r = regionOfPos(grid, { x, y });
      if (!inBox(plan.box, r.x, r.y)) continue;
      const rk = keyOf(plan.box, r.x, r.y);
      let reg = regions.get(rk);
      if (reg === undefined) {
        const f = regionFacts(engine, state, rp, plan, r.x, r.y, entries);
        if (f === null) { reg = null; } else if (f.centerH === null || f.slope === null) {
          reg = { unknown: true, f }; // 中心列高度或某个框内邻格高度未知（控制点海拔未知）：坡度、地形类、各列都未知，不借别的值、不抛码
        } else {
          if (f.cellClass === null) throw new KernelError('E-GRID-CELL-NO-TERRAIN', {}, `gridView: no cellclass entry for region ${r.x},${r.y}`);
          const tpl = genTemplateOf(index, f.cellClass);
          const centerZ = f.centerH === null ? null : surfaceStoreyOf(grid, f.centerH);
          const blocks = centerZ === null ? [] : templateBlocksOf(grid, worldSeed, plan.w, r, Array.isArray(tpl.blocks) ? tpl.blocks : [], centerZ);
          // 水体足迹的区格：区格内每一列的 h 都减去同一个河床修正量 δ（卷五 §4.3 规则 8 "河床"末条）；非水体区格 δ 为 0。
          reg = { f, tpl, blocks, entry: terrainOf(f.row.terrain), cps: nearControlPoints(grid, cps, r.x, r.y), delta: regionBedDelta(grid, worldSeed, plan, rp.rows, terrainOf, r.x, r.y) };
        }
        regions.set(rk, reg);
      }
      if (reg === null) continue;
      const surf = reg.unknown ? null : bedCorrectedColumn(grid, worldSeed, plan, reg.entry, reg.cps, reg.delta, x, y, memo);
      const vol = volumeColumn(vctx, grid, plan.w, x, y); // 体积凿空一层（G8；叠在模板格块之后、建筑蓝图之前，卷五 §4.3 规则 10）
      const building = buildingColumn(bctx, grid, plan.w, x, y); // 建筑蓝图一层（叠在体积凿空之后、存量形态与差分之前，卷五 §4.3 规则 10）
      const volUnknown = vol !== null && vol.at === undefined; // 这一列的体积读不到：不知道有没有洞，整列各格未知（卷二 :387、:389）
      const diffTop = diffs.columnTop(plan.w, x, y); // 这一列有差分的最高层（没有为 null）：差分叠在地表以上时，遮天等标志要算到这一层
      const stacked = stackOverlays(vol === null ? null : volumeOverlay(vol), building === null ? null : buildingOverlay(building), diffTop === null ? null : diffOverlay(diffs, plan.w, x, y));
      const overlayTop = diffTop === null ? (building === null ? undefined : building.top) : (building === null || diffTop > building.top ? diffTop : building.top);
      for (let z = z0; z <= z1; z += 1) {
        if (surf === null || volUnknown) { out.push(Object.freeze({ x, y, z, known: false, material: null, state: null, selfSupport: null, kind: null, fixture: null, mark: null, ceiling: null, blocksSky: null, bearsLoad: null, standable: null, zone: reg.f.owner })); continue; }
        // 水体足迹里的区格：地表以上画水，要读水体账户（卷二十 §4.6.1），代码里还没有账户读数——读不到就是未知，不能报成干地（卷五 :660 水只画在地表之上）。
        const inWater = reg.f.waterKind !== null;
        if (inWater && z > surf.z) { out.push(Object.freeze({ x, y, z, known: false, material: null, state: null, selfSupport: null, kind: null, fixture: null, mark: null, ceiling: null, blocksSky: null, bearsLoad: null, standable: null, zone: reg.f.owner })); continue; }
        const col = { x, y, surfaceZ: surf.z, tpl: reg.tpl, rockMaterial: null, water: null, blocks: reg.blocks, overlay: stacked, overlayTop };
        const c = cellAt(col, z);
        if (c.unknown) { out.push(Object.freeze({ x, y, z, known: false, material: null, state: null, selfSupport: null, kind: null, fixture: null, mark: null, ceiling: null, blocksSky: null, bearsLoad: null, standable: null, zone: c.zone || reg.f.owner })); continue; }
        const fl = cellFlags(col, z, flagOf);
        // 水体足迹里地表层及以下的格：头顶有没有冰（遮天）也是未读的水层，已确定遮天为真的不变，否则未知。
        if (inWater && fl.blocksSky !== true) fl.blocksSky = null;
        const here = building === null ? null : building.at(z);
        out.push(Object.freeze({ x, y, z, known: true, material: c.material, state: c.state, selfSupport: c.selfSupport, kind: c.kind || null, fixture: c.fixture ?? (here === null ? null : here.fixture), mark: c.mark ?? null, ceiling: c.ceiling || null, blocksSky: fl.blocksSky, bearsLoad: fl.bearsLoad, standable: fl.standable, zone: c.zone || reg.f.owner }));
      }
    }
  }
  return Object.freeze({ w: plan.w, cells: Object.freeze(out) });
}

/**
 * kernelApi `isStructureCell(engine, state, pos)`（卷五 §4.1 规则 15 建筑结构元格拒写的判据；卷十九 §4.5 规则 8）：这一格是不是某座建筑的体元所在格
 * ——外墙、隔墙、楼梯格（蓝图格种类 wall、partition、stairs；门、窗、室内、桥面层格不是体元）。顶元（楼板、屋面、桥面）不在其内（它们不经 alterCells）。
 * 纯读；离场建筑（蓝图读不到）与没有建筑的格为 false。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number}} pos @returns {boolean}
 */
export function isStructureCell(engine, state, pos) {
  const rp = planOf(engine, state);
  const c = buildingCellAt(buildingCtx(engine, state, rp), engine.rules[RULES.grid], pos);
  return c !== null && (c.kind === BLUEPRINT_KIND.wall || c.kind === BLUEPRINT_KIND.partition || c.kind === BLUEPRINT_KIND.stairs);
}

/**
 * kernelApi `extrudeCell(engine, state, pos)`（卷五 §4.5 规则 6 :762 挤出；对照表待定 11 已定求法归本模块）：位置 pos 所在格不可立足时，求被挤到的落点。
 * 候选格的"可立足"标志取 gridView（基底 ⊕ 差分，同一套），范围与次序见 grid-base.mjs#extrudeLanding；搜索半径只取规则表 rules.grid.landSearchRadiusCells（细格数，卷五 §2.3 :272），
 * 未登记即 E-RULES-UNREGISTERED（卷文没有给数值，不设缺省）。落点格读不到（列高度未知）返回 unknown，范围内没有可立足格返回 buried（"被埋"，卷十三、卷四处理）。
 * 不写位置：写位置是卷十七 placeSubject、物经批次写者执行（卷五 §4.5 规则 6），本函数只求落点。纯读。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number}} pos
 * @returns {{kind: 'land', cell: {w: number, x: number, y: number, z: number, coarse: boolean}} | {kind: 'buried'} | {kind: 'unknown'}}
 */
export function extrudeCell(engine, state, pos) {
  const grid = engine.rules && engine.rules[RULES.grid];
  const radius = isObj(grid) ? grid.landSearchRadiusCells : undefined;
  if (!Number.isSafeInteger(radius) || radius < 1) throw new KernelError('E-RULES-UNREGISTERED', {}, 'extrudeCell: rules.grid.landSearchRadiusCells is not registered (positive integer, cells)');
  const maxDz = extrudeLayerReach(grid, radius);
  const view = gridView(engine, state, { w: pos.w, cells: { x0: pos.x - radius, y0: pos.y - radius, z0: pos.z - maxDz, x1: pos.x + radius, y1: pos.y + radius, z1: pos.z + maxDz } });
  if (view === null) return Object.freeze({ kind: SETTLE.buried });
  const standable = new Map(view.cells.map((c) => [`${c.x},${c.y},${c.z}`, c.known ? c.standable : null]));
  const found = extrudeLanding(grid, radius, pos, (x, y, z) => { const v = standable.get(`${x},${y},${z}`); return v === undefined ? false : v; });
  return Object.freeze(found.kind === SETTLE.land ? { kind: SETTLE.land, cell: Object.freeze({ w: pos.w, x: found.cell.x, y: found.cell.y, z: found.cell.z, coarse: false }) } : { kind: found.kind });
}

// 整数向下取整除法（b > 0，a 可负）。
const floorDivInt = (a, b) => (a - (((a % b) + b) % b)) / b;

/**
 * kernelApi `fallCell(engine, state, pos)`（卷五 §4.5 规则 6 :745–:746 坠落；A5-5.2 "桌所在格被差分清空后碗落到下方第一个可立足格"）：位置 pos 所在格不可立足而本格可穿行（气态）时，
 * 落到同一列正下方第一个可立足格，落差 = 层数差 × storeyM（米，整数）。可立足标志取 gridView（基底 ⊕ 差分，同一套）。下方一路读不到可立足格直到世界最低地表层
 * （rules.grid.surfaceElevationMinM ÷ storeyM 向下取整，卷五 §4.3 规则 8 的截断下界）返回 none；沿途遇到读不到的格（known 为假或可立足未知）返回 unknown，不跳过它往下找。
 * 分窗读 gridView（窗宽从一层起逐窗加倍，不设层数常数）；同输入同结果。不写位置：写位置是 placeSubject、批次写者（卷五 §4.5 规则 6）。纯读。
 * sinkOnSolid 为真（起点在液体格）：液体柱到底遇到第一个实体格即停在它之上那一格，不穿河床（卷五 :761 勘误 1122k1）。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number}} pos @param {boolean} [sinkOnSolid]
 * @returns {{kind: 'land', cell: {w: number, x: number, y: number, z: number, coarse: boolean}, dropM: number} | {kind: 'unknown'} | {kind: 'none'}}
 */
export function fallCell(engine, state, pos, sinkOnSolid = false) {
  const grid = engine.rules && engine.rules[RULES.grid];
  if (!isObj(grid)) throw new KernelError('E-RULES-UNREGISTERED', {}, 'fallCell: rules.grid is not registered');
  const floorZ = floorDivInt(grid.surfaceElevationMinM, grid.storeyM);
  let hi = pos.z - 1;
  let width = 1;
  let inLiquid = false;
  while (hi >= floorZ) {
    const lo = hi - width + 1 > floorZ ? hi - width + 1 : floorZ;
    const view = gridView(engine, state, { w: pos.w, cells: { x0: pos.x, y0: pos.y, z0: lo, x1: pos.x, y1: pos.y, z1: hi } });
    if (view === null || view.cells.length === 0) return Object.freeze({ kind: SETTLE.none });
    for (let z = hi; z >= lo; z -= 1) {
      const step = fallStep(view.cells[z - lo], sinkOnSolid || inLiquid);
      if (view.cells[z - lo].state === STATE.liquid) inLiquid = true; // 路径上一进入液体柱，同"起点在液体里"一个口径：停在柱底第一个实体格之上
      if (step === SETTLE.unknown) return Object.freeze({ kind: SETTLE.unknown });
      // land：这一格可立足；sink：液体柱底遇到第一个实体格，停在它之上那一格（不穿河床，李白 11-23 事件 412004ce）。
      const at = step === SETTLE.land ? z : step === SETTLE.fall ? z + 1 : null;
      if (at !== null) return Object.freeze({ kind: SETTLE.land, cell: Object.freeze({ w: pos.w, x: pos.x, y: pos.y, z: at, coarse: false }), dropM: (pos.z - at) * grid.storeyM });
    }
    hi = lo - 1;
    width += width;
  }
  return Object.freeze({ kind: SETTLE.none });
}

/**
 * kernelApi `settleCell(engine, state, pos)`（卷五 §4.5 规则 6：现场泡内任一时刻没有人或物处在不可立足格上；坠落与挤出统一在这一处判）：核一次 pos 所在格——
 * 可立足 → stay；本格可穿行（气态）或是液体而不可立足 → fall（见 fallCell；液体格不可立足，沉到正下方第一个可立足格，卷五 §4.5 规则 6 :761 字面，李白裁定 1117 末节表-3；不写游泳、涉水，那是另一张规则卡）；
 * 本格是实体 → extrude（见 extrudeCell）；本格读不到 → unknown。同一输入落点唯一。
 * 返回 {kind: 'stay'} | {kind: 'fall', cell, dropM} | {kind: 'extrude', cell} | {kind: 'buried'} | {kind: 'unknown'} | {kind: 'none'}（none：下方没有可立足格，见 fallCell）。不写位置。纯读。
 * @param {any} engine @param {any} state @param {{w: number, x: number, y: number, z: number}} pos
 */
export function settleCell(engine, state, pos) {
  const here = gridView(engine, state, { w: pos.w, cells: { x0: pos.x, y0: pos.y, z0: pos.z, x1: pos.x, y1: pos.y, z1: pos.z } });
  const c = here === null || here.cells.length === 0 ? null : here.cells[0];
  if (c === null || !c.known) return Object.freeze({ kind: SETTLE.unknown });
  const decision = settleKindOf(c.standable, c.state);
  if (decision === SETTLE.stay || decision === SETTLE.unknown) return Object.freeze({ kind: decision });
  if (decision === SETTLE.fall) {
    // 人在液体格：沉到液体柱底、停在第一个实体格之上（按材料物态类判，不认水体 id）；已在柱底则就是站稳。
    const f = fallCell(engine, state, pos, c.state === STATE.liquid);
    if (f.kind === SETTLE.land && f.cell.z === pos.z) return Object.freeze({ kind: SETTLE.stay });
    return Object.freeze(f.kind === SETTLE.land ? { kind: SETTLE.fall, cell: f.cell, dropM: f.dropM } : { kind: f.kind });
  }
  const e = extrudeCell(engine, state, pos);
  return Object.freeze(e.kind === SETTLE.land ? { kind: SETTLE.extrude, cell: e.cell } : { kind: e.kind });
}

// ---------- 视线读数（卷五 §4.2 规则 14、15；G13，视线本体在 server-plugin/sight.mjs，这里只给它读区格层事实与缓存槽） ----------

/**
 * kernelApi `regionOcclusionM(engine, state, {w, region: {x, y}})`（卷五 §4.2 规则 15 远景视线的遮挡高）：该区格的遮挡高（米）= 区格地表高与该区格上各建筑足迹最高一层顶面海拔 `(zMax + 1) × storeyM` 中的大者
 * （地表高取 gridView 区格项的中心列地表高；建筑只算落在这个区格里的列；不含林冠，卷五 :604 现文）。格空间不存在、区格在外包框外、地表高未知（控制点海拔未知）为 null（未知，不拿别的量顶替）。纯读。
 * @param {any} engine @param {any} state @param {{w: number, region: {x: number, y: number}}} spec
 * @returns {number | null}
 */
export function regionOcclusionM(engine, state, spec) {
  const rp = planOf(engine, state);
  const plan = rp.plans.get(spec.w);
  if (!plan || !inBox(plan.box, spec.region.x, spec.region.y)) return null;
  const view = gridView(engine, state, { w: spec.w, region: spec.region });
  if (view === null || view.surfaceHeightM === null) return null;
  const grid = engine.rules[RULES.grid];
  const top = buildingTopStoreyInRegion(buildingCtx(engine, state, rp), grid, spec.w, spec.region.x, spec.region.y);
  if (top === null) return view.surfaceHeightM;
  const roof = (top + 1) * grid.storeyM;
  return roof > view.surfaceHeightM ? roof : view.surfaceHeightM;
}

// 视线缓存（投影，卷二十七 R27-5.9、R27-4.13、A27-1.13）：挂在"足迹计划"上——计划的缓存键已含当日有效输入版本与偏离行（planOf 的 sig），输入一变换新计划、旧缓存随之作废；
// 不进状态、不进存档、不进存档摘要，读档后从空重建。开关只供测试（"开关缓存、中途清空结果逐位相同"）。
let sightSlots = new WeakMap();
let sightCacheOn = true;

/**
 * kernelApi `sightCache(engine, state)`：当前足迹计划上的远景视线缓存表（Map）；缓存关着时为 null。键由 sight.mjs 定（含全部输入），本模块只管作废：输入版本或地点行变了，旧表就不再被取到。
 * @param {any} engine @param {any} state @returns {Map<string, any> | null}
 */
export function sightCache(engine, state) {
  if (!sightCacheOn) return null;
  const rp = planOf(engine, state);
  let m = sightSlots.get(rp);
  if (!m) { m = new Map(); sightSlots.set(rp, m); }
  return m;
}

/**
 * kernelApi `setSightCache(on)`：开关视线缓存并清空已有的（只供测试）；关闭时 sightCache 返回 null。
 * @param {boolean} on
 */
export function setSightCache(on) {
  sightCacheOn = on === true;
  sightSlots = new WeakMap();
}

/**
 * kernelApi `planFootprints(engine, {base, proposals, assumptions})`（卷五 §3.1，卷十 C10-27）：按给定行集合与生成输入求足迹与派生量，
 * 与 placeView、zoneAt 同一套算法；纯函数、不写状态。base = 世界数据里的地点行（缺省取当前世界表）；proposals = 写回器暂存的行提案（覆盖或新增）；
 * assumptions = 可选假设覆盖 {行 id: {维度: 值}}（只供试排、不进状态）。withCells 为假时不物化各行的区格列表（regionCells 为 null）：
 * 列表每格一个对象，根行即全世界约 4,020 万区格、各级合计约 1.6 亿对象，全规模装不下；世界创建里只要面积、海拔、相邻集的调用（卷十水体阶段）一律传假。行都是 place.json 行的形状（维度键与 classes）。
 * bed 为假时区格代表地表高取未修正的 h₀、不求河床（卷十 R10-2.12 求值次序：生成水体行的下游链按未修正 h₀ 派生，链定后再求 bed）；heights 为假时不求高度（elevationM、zRange 为 null，
 * 只要足迹面积与相邻的调用——水体足迹补缺阶段——不必逐区格算全世界的高度场；heights 也可给函数 (id) => 布尔，只对点名的行求高度）。
 * 返回 {footprints: {id: placeFootprint 的形状}, errors: [{code, id, detail}], adjacency: {id: [相邻 id]}, probe}（相邻只含足迹相邻，路网边由 placeNeighbors 并入）。
 * probe = {has(id, x, y), cells(id), surfaceStoreyAt(id, x, y)}：区格是否在某行足迹内、某行足迹区格按 (x, y) 字典序惰性遍历（不物化列表；水体足迹补缺阶段在世界根这样的巨大父足迹里取种子区格用）、
 * 某行所在格空间里细格列的地表层号（落位给建筑锚点 z，卷十 R10-7.11 第 5 点；读不到为 null）。
 * @param {any} engine @param {{base?: Record<string, any>, proposals?: Record<string, any>, assumptions?: Record<string, Record<string, any>>, withCells?: boolean, bed?: boolean, heights?: boolean}} [input]
 */
export function planFootprints(engine, { base, proposals = {}, assumptions = {}, withCells = true, bed = true, heights = true } = {}) {
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
    flowingOf: flowingOfIndex(index),
    bed: bed !== false,
  });
  const footprints = {};
  const seed = worldSeedOf(engine);
  // heights 可以是函数 (id) => 布尔：只对点名的行求高度（全规模下逐区格高度场对全部行是上亿次噪声求值，水体阶段只读水体与存量单元行的海拔）。
  const wantHeights = typeof heights === 'function' ? heights : () => heights;
  for (const plan of rp.plans.values()) {
    for (const id of plan.order) {
      const geo = regionGeometry(grid, plan, id);
      if (!geo) continue;
      const h = wantHeights(id) ? regionHeights(grid, seed, plan, rp.rows, terrainEntryOf(engine), id) : null;
      footprints[id] = { kind: rp.kinds.get(id), w: plan.w, regionCells: withCells ? cellList(plan, id) : null, cellCount: geo.cellCount, areaM2: geo.areaM2, centroid: geo.centroid, elevationM: h ? h.elevationM : null, zRange: h ? h.zRange : null, waterAccess: waterAccessOf(plan, rp.rows, id) };
    }
  }
  const adjacency = {};
  for (const plan of rp.plans.values()) for (const [id, set] of footprintAdjacency(plan)) adjacency[id] = [...set].sort(cmp);
  const holder = (id) => { for (const plan of rp.plans.values()) if (plan.cells.has(id)) return plan; return null; };
  const probe = {
    has: (id, x, y) => { const plan = holder(id); return plan !== null && footprintHas(plan, id, x, y); },
    cells: function* cells(id) { const plan = holder(id); if (plan !== null) yield* footprintCells(plan, id); },
    // 行 id 所在格空间里细格列 (x, y) 的地表层号（卷五 §4.3 规则 8：落位给建筑锚点 z，卷十 R10-7.11 第 5 点）：与 gridView 的细格读法同一个函数 bedCorrectedColumn（带河床修正）。
    // 读不到（行没划出足迹、列在外包框外、无世界种子、无 terrain 条目、控制面或河床修正未知）为 null，不借别的值。
    surfaceStoreyAt: (id, x, y) => {
      const plan = holder(id);
      if (plan === null || !isObj(grid) || typeof seed !== 'string') return null;
      const r = regionOfPos(grid, { x, y });
      if (!inBox(plan.box, r.x, r.y)) return null;
      const owner = ownerIdAt(plan, keyOf(plan.box, r.x, r.y));
      const terrainOf = terrainEntryOf(engine);
      const entry = owner === undefined ? null : terrainOf(rp.rows.get(owner).terrain);
      const cps = nearControlPoints(grid, controlPointsOf(grid, plan, rp.rows), r.x, r.y);
      const column = bedCorrectedColumn(grid, seed, plan, entry, cps, regionBedDelta(grid, seed, plan, rp.rows, terrainOf, r.x, r.y), x, y);
      return column === null ? null : column.z;
    },
  };
  return { footprints, errors: rp.errors, adjacency, probe };
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
// 门（G7）：建筑、房间由蓝图门格派生（正门、入口、此刻开口的窗格、破洞格；房间取与自己四邻相接的开口，内门归建筑行），一处开口一项，cell 取开口的首格，不建路网边。
// P 在离场子树内为空。排序按 (种类、区格序号 (x, y)、边的两端、格坐标)。
function exitsOf(engine, state, kids, rp, placeId) {
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
  // 洞口：体积足迹的"开阔边界"泡外不派生基底细格，由洞穴生成器的洞口通路格给出（卷五 §4.1 规则 9）。
  if (rp.plans.size > 0 && rp.kinds.get(placeId) === FOOTPRINT_KIND.volume) {
    const mouths = volumeExitsOf(volumeCtx(engine, state, rp), placeId);
    if (mouths === null) return null; // 体积行读不到：出口未知，不当封闭的洞
    for (const m of mouths) out.push({ inner: placeId, kind: EXIT_KIND.open, via: null, regionCell: regionOfPos(grid, m), cell: Object.freeze({ w: m.w, x: m.x, y: m.y, z: m.z, coarse: false }) });
  }
  // 门：建筑、房间足迹（蓝图门格）。
  if (rp.plans.size > 0) {
    for (const d of doorExitsOf(buildingCtx(engine, state, rp), placeId)) {
      const first = d.cells[0];
      out.push({ inner: placeId, kind: EXIT_KIND.door, via: null, regionCell: regionOfPos(grid, first), cell: Object.freeze({ w: d.w, x: first.x, y: first.y, z: first.z, coarse: false }) });
    }
  }
  const key = (x) => (x.regionCell ? [x.regionCell.x, x.regionCell.y] : [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]);
  out.sort((p, q) => {
    if (p.kind !== q.kind) return EXIT_ORDER.indexOf(p.kind) - EXIT_ORDER.indexOf(q.kind);
    const kp = key(p);
    const kq = key(q);
    if (kp[0] !== kq[0]) return kp[0] - kq[0];
    if (kp[1] !== kq[1]) return kp[1] - kq[1];
    const byVia = cmp(p.via ? `${p.via.from}|${p.via.to}|${p.via.waterway}` : '', q.via ? `${q.via.from}|${q.via.to}|${q.via.waterway}` : '');
    if (byVia !== 0 || !p.cell || !q.cell) return byVia;
    return cmp(p.cell.x, q.cell.x) || cmp(p.cell.y, q.cell.y) || cmp(p.cell.z, q.cell.z);
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
    if (off && OFFSTAGE_UNKNOWN.includes(key)) { dims[key] = UNKNOWN; continue; }
    const base = placeDimBase(engine, state, t, placeId, key);
    if (footprint !== null && FOOTPRINT_HEIGHT_DIMS.includes(key) && footprintDerived(t, key)) {
      // 依赖高度场的足迹量（elevationM、zRange）读到才求值：基值此刻读定，足迹量取自此刻的足迹对象（其上的高度场属性惰性求值）。
      let fact;
      Object.defineProperty(dims, key, { enumerable: true, get: () => (fact === undefined ? (fact = footprintFact(t, key, footprint, base)) : fact) });
    } else {
      dims[key] = footprintFact(t, key, footprint, base);
    }
  }
  const ancestors = ancestorsOf(engine, state, placeId);
  const kids = childIndex(engine, state);
  const children = kids.get(placeId) || [];
  const exits = exitsOf(engine, state, kids, rp, placeId); // 体积行读不到时为 null（未知），其余为数组
  return Object.freeze({
    id: placeId,
    dims: Object.freeze(dims),
    tree: Object.freeze({ ancestors: Object.freeze(ancestors), children: Object.freeze([...children]), depth: ancestors.length }),
    footprint,
    exits: exits === null ? null : Object.freeze(exits),
  });
}

/**
 * kernelApi `isOffstage(engine, state, placeId)`（卷五 §4.1 规则 8 第三条离场子树；卷十七 §3.4 :262 "离场行返回空"的判据）：地点行是否在离场子树内。placeId 须是地点行（否则 E-DIM-REF-MISSING）。纯读。
 * @param {any} engine @param {any} state @param {string} placeId @returns {boolean}
 */
export function isOffstage(engine, state, placeId) {
  parentOf(engine, state, placeId); // 须是地点（dim() 对非地点抛 E-DIM-REF-MISSING）
  return planOf(engine, state).offstage.has(placeId);
}

// 一个维度的基值（placeView 与 placeClimateInput 共用）：经内核 dim() 读；
// 离场子树内的位置量与依赖足迹的派生量由调用方先按未知返回，不返回留在存储里的旧值（卷五 §4.1 规则 8 第三条）。
function placeDimBase(engine, state, t, placeId, key) {
  try {
    return dim(engine, state, PLACE, placeId, key);
  } catch (e) {
    // 读到登记在案的未建派生时 dim() 抛 E-MOD-RX（kernel/dimensions.mjs readBase，卷二 §1.12 封卷后勘误 1118k23）。
    if (!(codeOf(e) === E.E_MOD_RX && dependsOnUnbuilt(t, key))) throw e;
    return UNKNOWN;
  }
}

const footprintDerived = (t, key) => Boolean(t.doc.dimensions[key]) && t.doc.dimensions[key].derived !== undefined;

// 表头里声明为派生的足迹量由足迹给值（centroid、zRange、areaM2、elevationM 等）；存储列照读存储值（base）。
function footprintFact(t, key, footprint, base) {
  if (footprint !== null && footprintDerived(t, key)) {
    const v = FOOTPRINT_DERIVED[key] ? FOOTPRINT_DERIVED[key](footprint) : null;
    if (v !== null) return KNOWN(v);
  }
  return base;
}

// 单个地点的单维度读口（placeClimateInput 用）：与 placeView 的 dims[key] 同一读法（离场未知、基值、足迹量覆盖），但只算被问到的维度；
// 足迹对象最多取一次，且只在读到表头声明为派生的维度时才取。表里没有的维度为 undefined。
function placeDimReader(engine, state, placeId) {
  const t = placeTable(engine);
  const off = planOf(engine, state).offstage.has(placeId);
  let footprint;
  return (key) => {
    if (!Object.hasOwn(t.doc.dimensions, key)) return undefined;
    if (off && OFFSTAGE_UNKNOWN.includes(key)) return UNKNOWN;
    const base = placeDimBase(engine, state, t, placeId, key);
    if (!footprintDerived(t, key)) return base;
    if (footprint === undefined) footprint = placeFootprint(engine, state, placeId);
    return footprintFact(t, key, footprint, base);
  };
}

// 取值要整个区域足迹的高度场的足迹量（卷五 §4.1.3 规则 13：区格代表地表高）：placeFootprint 里按需求值。
const FOOTPRINT_HEIGHT_DIMS = Object.freeze([DIM.elevationM, DIM.zRange]);

// 表头声明为派生的足迹量（卷五 §2.1）：由 placeFootprint 取值；取不到（未知）返回 null，维持未建派生的"未知"。
const FOOTPRINT_DERIVED = Object.freeze({
  [DIM.centroid]: (f) => Object.freeze({ ...f.centroid }),
  [DIM.areaM2]: (f) => f.areaM2,
  [DIM.elevationM]: (f) => f.elevationM,
  [DIM.zRange]: (f) => (f.zRange === null ? null : Object.freeze({ ...f.zRange })),
  // 体积足迹的地下三量（卷五 §4.5 规则 3）：只有体积足迹的派生结果带这三项，其余足迹种类取不到、维持未建派生的未知。
  [DIM.surfaceRefElevationM]: (f) => (f.surfaceRefElevationM === undefined ? null : f.surfaceRefElevationM),
  [DIM.depthM]: (f) => (f.depthM === undefined ? null : f.depthM),
  [DIM.underground]: (f) => (f.underground === undefined ? null : f.underground),
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
 * ③ 只留在该地点上至少有一条种类行 domicile 为真、且现役（holdings.mjs 的 edgeIsActive）的边的持有者（R18-1.10）；④ 按代号序去重合并。
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
  const index = engine.vocab.index;
  // 持有边只经 holdings.mjs 的读入口取（现役判定与遍历都在那里）；一遍扫出"种类行 domicile 为真"的边，按标的归集持有者。
  const domiciled = new Map();
  for (const e of activeEdges(state, (x) => {
    const row = index.get(x.record[HOLDING.kind]);
    return Boolean(row) && isObj(row.entry) && row.entry[DOMICILE] === true;
  })) {
    const subject = e.record[HOLDING.subject];
    if (!domiciled.has(subject)) domiciled.set(subject, new Set());
    domiciled.get(subject).add(e.holder);
  }
  const out = new Set();
  for (const place of places) {
    const lives = domiciled.get(place);
    if (!lives) continue;
    for (const holder of reverseLookup(state, REL.residents, place)) if (lives.has(holder)) out.add(holder);
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
 * 地点的纬度（卷二十 §2.7 :334 `latitudeDeg`，derived，来源形心 `centroid`，第十一版起不读 `coord`；卷五 §2.1 :117、§7 M5-36）：latitudeOriginDeg + centroid.y ÷ metersPerDegreeNorth（rules.astro；定点）。
 * 形心未知（离场行、没有足迹）或缺任一参数即 null（按未知，不借常数、不回落 coord）。
 * @param {any} engine @param {any} view placeView 的结果
 * @returns {number | null}
 */
export function placeLatitude(engine, view) {
  const c = view.dims[DIM.centroid];
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
  // 沿包含树惰性上行（卷二十 §2.7 :335 weatherCell = nearest(rel_contains, 挂 comp_weather_cell)）：只读各节点"单元维度适用"这一个维度，遇到第一个挂单元的节点即停；
  // 之后只取单元维度、两处海拔与自身的形心、围护、地下三类，不求任何一级的完整 placeView（出口、子集、足迹区格列表、高度场都不碰；足迹量由 placeDimReader 按需求值，卷五 §4.1.3 规则 13）。
  parentOf(engine, state, placeId); // 须是地点（dim() 对非地点抛 E-DIM-REF-MISSING）
  const readers = new Map();
  const reader = (id) => { if (!readers.has(id)) readers.set(id, placeDimReader(engine, state, id)); return readers.get(id); };
  const cellId = [placeId, ...ancestorsOf(engine, state, placeId)].find((id) => reader(id)(CELL_MARK).applicable === true);
  const own = reader(placeId);
  const latitudeDeg = cellId === undefined ? null : placeLatitude(engine, { dims: { [DIM.centroid]: own(DIM.centroid) } });
  const val = (read, k) => { const v = read(k); return v && v.known ? v.value : undefined; };
  let out = null;
  if (cellId !== undefined && latitudeDeg !== null) {
    const cellNode = reader(cellId);
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
function checkEdgeEnds(rp, grid, e, at, sink, isPos) {
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
  if (!isObj(door) || !isPos(door.a) || !isPos(door.b)) { sink({ ...at, code: 'E-DIM-STRUCT-FIELD', got: door, want: 'portal {a: struct:pos, b: struct:pos}' }); return; }
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
    flowingOf: flowingOfIndex(idx),
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
 * 世界必有格空间表（卷五 §4.1.1 :425、:431）：有地点行时唯一的根必须挂 comp_layer_root 并有格空间行（E-DIM-DOMAIN-RANGE、E-DIM-REF-MISSING）。离场子树不参加这些校验（规则 3 末句）。
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
  // struct:pos 的字段表：加载器的类型登记（view.env.namedStructs）先于运行期装入（装入要等全部校验通过），所以加载期核值读它；
  // 不放宽：登记里没有 struct:pos 行（或校验环境没带登记）则一律不合，不回落到运行期装入的全局登记。
  const posFields = view.env && view.env.namedStructs instanceof Map ? view.env.namedStructs.get(POS_STRUCT) : undefined;
  const isPos = (v) => posFields !== undefined && matchStruct(posFields, v);
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
    flowingOf: flowingOfIndex(idx),
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
    if (written(row, DIM.anchor) && !isPos(row[DIM.anchor])) errors.push(`E-DIM-STRUCT-FIELD place/${id}: anchor is not a struct:pos`);
  }
  // 规则 3、10 与格空间表：划分结果里的违规，层根与格空间的对应，每个区格有地形类。
  {
    // boundary 每项加载期逐项核（卷五 :98 封卷后勘误 1121k22）：全是 {x, y} 或全是 {x0, x1, y0, y1}；不依赖这一行参不参加划分（没有格空间表的世界也报）。
    for (const id of ids) {
      const b = rows.get(id).boundary;
      if (Array.isArray(b) && b.length > 0 && !boundaryEntriesValid(b)) errors.push(`E-DIM-STRUCT-FIELD place/${id}: ${BOUNDARY_ENTRY_DETAIL}`);
    }
    for (const e of rp.errors) {
      const line = `${e.code} place/${e.id}: ${e.detail}`;
      if (!errors.includes(line)) errors.push(line); // 划分里同一句不重报
    }
    // 非对象的格空间行已由 checkGridSpaces 报结构错（E-DIM-STRUCT-FIELD），这里只看对象行，不抛 TypeError。
    const objectRows = spaces.filter(isObj);
    const spaceRoots = new Set(objectRows.map((s) => s[GRID_SPACE.root]));
    for (const s of objectRows) {
      const r = s[GRID_SPACE.root];
      if (rows.has(r) && !rp.layerRoots.includes(r)) errors.push(`E-DIM-DOMAIN-RANGE place/${r}: grid space ${s[GRID_SPACE.w]} root must be a layer-root row`);
    }
    for (const r of rp.layerRoots) if (!spaceRoots.has(r)) errors.push(`E-DIM-REF-MISSING place/${r}: layer-root row has no grid space (${SECTION.gridSpaces})`);
    // 世界必有格空间表（卷五 §4.1.1 :425 主世界一个格空间；:431 主世界根也挂 comp_layer_root，格空间表主世界那一行的根地点填它）：
    // 有地点行的世界，那唯一的根必须是层根（它有格空间行由上一句核）。没有格空间表的世界没有任何层根，在这里拒收，不再当"没有格可划"放过。
    if (ids.length > 0 && roots.length === 0) errors.push('E-DIM-DOMAIN-RANGE place: the table has rows but no world root (no non-offstage row with a null parent); exactly one root carrying comp_layer_root is required');
    if (roots.length === 1 && !rp.layerRoots.includes(roots[0])) errors.push(`E-DIM-DOMAIN-RANGE place/${roots[0]}: the world root must carry comp_layer_root and own a grid space row (${SECTION.gridSpaces}); a world without a grid space table is rejected`);
    if (rp.plans.size > 0) checkCellClasses(view, rp, errors);
    // 细格生成模板（卷十 :118）：族条目字段与材料引用常查；cellclass.genTemplate 的引用在世界划出了区格时核（与 cellclass 兜底同口径）。
    const mt = view.tables instanceof Map ? view.tables.get(MATERIAL) : undefined;
    const hasMaterial = (code) => Boolean(mt && mt.flat && mt.flat.rows instanceof Map && mt.flat.rows.has(code));
    if (idx instanceof Map) errors.push(...checkGenTemplates(idx, hasMaterial, true));
    // 建筑形制族（卷十九 §2.4 :203，A19-5.3）：平面字段与取值域；建筑行的蓝图可行、锚点在父足迹内、兄弟足迹不相交（卷五 §4.1 规则 11，E-GRID-FOOTPRINT-OUTSIDE-PARENT、E-GRID-SIBLING-OVERLAP）。
    // 设施类型表（kind facility_type，卷十九 §2.2）的行 id：形制 facilityTypes 与分片角色 typeAffinity 的键都经表核，不经词表索引；世界没有这张表即空集（任何引用都报缺）。
    const ftTable = view.tables instanceof Map ? view.tables.get(FACILITY_TYPE) : undefined;
    const facilityTypeIds = new Set(ftTable && ftTable.flat && ftTable.flat.rows instanceof Map ? ftTable.flat.rows.keys() : []);
    if (idx instanceof Map) errors.push(...checkBlueprintForms(idx, view.rules && view.rules.facility ? view.rules.facility.blueprint : undefined, facilityTypeIds, hasMaterial, (code) => (hasMaterial(code) ? mt.flat.rows.get(code) : undefined)));
    // 布局模板与分片角色族（卷十九 §4.6 规则 1、3、4）：份额和为 1、adjacent 引用在本模板内、模板不写设施数量；族条目常查。
    if (idx instanceof Map) errors.push(...checkLayoutTemplates(idx, facilityTypeIds));
    // 体积足迹（卷五 §4.1 规则 3、11；卷十 R10-2.14）：不依赖世界种子的部分（父行种类、目标面积上限、嵌套顶层号）；要世界种子的派生核对见 checkVolumeCells。
    errors.push(...checkVolumeRows({ rows, rp, rules: view.rules }));
    errors.push(...checkBuildingRows({ rows, rp, idx, rules: view.rules, units: view.env ? view.env.units : undefined, zoneOfRegion: rp.plans.size > 0 ? (pos) => zoneOfPos(grid, rp.plans, pos) : null }));
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
    checkEdgeEnds(rp, grid, e, at, sink, isPos);
  });
  checkPaceTables(view, errors);
  return { ok: errors.length === 0, errors };
}
