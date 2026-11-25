// 建筑与房间足迹（卷五 §4.1 规则 11、12；卷十九 §3.2 blueprintOf、§4.1 规则 3、§4.5 规则 7–10）：把建筑行的输入（形制、planCells、storeys、墙厚、anchor、facing、料、完好度、breaks）
// 交 blueprint.mjs 的 planBlueprint 铺成蓝图，转世界坐标，读出每格此刻的样子；房间行不存几何，足迹 = 蓝图里它那个房间的格。
// 本文件不读 state 之外的东西、不写状态；地点维度只经 place.mjs 交入的 val(id, key)（内核 dim() 的基值），材料量只经 materialAt(id, key, matterState)（materialView），所以与 placeView 同一套取值。蓝图不存档：只缓存在计划对象上，计划变了缓存即废。
// 规模：蓝图按建筑按需派生；区格 → 建筑的索引只装"建筑 id"（每栋按外包框覆盖的区格登记），不装格；逐格 Map 只在被读到的建筑上建（泡内量级，每栋 10²–10⁴ 格）。

import { fixedUnits, fixedScale, fixedToNumber } from './det-math.mjs';
import { KernelError } from './errors.mjs';
import { breachOrderKey } from './grid.mjs';
import { STATE } from './grid-base.mjs';
import { regionOfPos } from './footprint.mjs';
import { FOOTPRINT_KIND } from './footprint-kind.mjs';
import { planBlueprint, worldCellsOf, materialsOfElements, breachesOf, openingAreasOf, KIND, OPENING } from './blueprint.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const absInt = (a) => (a < 0 ? -a : a);
const EXIT = Object.freeze({ breach: 'breach' }); // 出口种类代号：破洞格（按完好度派生的破口、拆开的外墙元）；其余出口种类取 blueprint 的 OPENING
const FAMILY = Object.freeze({ form: 'bform' }); // 形制词表族（卷十九 §2.4）
const VOLUME_UNIT = 'L'; // 升换立方米取单位表 _units.json 里 L 的 si（卷二单位表；不借千分母）
const MATERIAL = 'material';
const DENSITY = 'density';
const BUILD = Object.freeze({ form: 'form', planCells: 'planCells', storeys: 'storeys', thickness: 'wallThicknessM', anchor: 'anchor', facing: 'facing', materialKg: 'materialKg', condition: 'condition', breaks: 'breaks', roomRole: 'roomRole' });

const cache = new WeakMap(); // rp → {buildings: Map, index, rooms, readings: Map}

/**
 * 蓝图要的规则常数：cellM、storeyM、facingDirections 取 rules.grid，取值域上下限取 rules.facility.blueprint，升换立方米取单位表（units：engine.units 与 mount 装配同一份）。
 * 缺任一项返回 null（调用方按各自场合报 E-RULES-UNREGISTERED）。
 * @param {any} rules @param {any} units
 */
export function blueprintRulesFrom(rules, units) {
  const grid = rules && rules.grid;
  const limits = rules && rules.facility && rules.facility.blueprint;
  const unit = units instanceof Map ? units.get(VOLUME_UNIT) : undefined;
  if (!isObj(grid) || !isObj(limits) || !unit || typeof unit.si !== 'number') return null;
  return { cellM: grid.cellM, storeyM: grid.storeyM, facingDirections: grid.facingDirections, m3PerL: unit.si, limits };
}

/** 同 blueprintRulesFrom，缺项抛 E-RULES-UNREGISTERED。@param {any} engine */
export function blueprintRulesOf(engine) {
  const out = blueprintRulesFrom(engine.rules, engine.units);
  if (out === null) throw new KernelError('E-RULES-UNREGISTERED', {}, 'blueprint: rules.grid, rules.facility.blueprint and the volume unit (engine.units) are needed');
  return out;
}

function slot(rp) {
  let s = cache.get(rp);
  if (!s) { s = { inputs: new Map(), index: null, rooms: null, readings: new Map(), cells: new Map() }; cache.set(rp, s); }
  return s;
}

/**
 * 一个建筑行的蓝图输入（形制条目、planCells、storeys、墙厚、anchor、facing）与此刻的料、完好度、breaks；不是建筑行、在离场子树内或任一必需量读不到（未知）为 null。
 * 蓝图不可行（卷十九 §4.5 规则 7 的原因代号）是数据错：加载期核过（checkBuildings），运行期遇到抛 E-DIM-DOMAIN-RANGE。
 * @param {{engine: any, state: any, rp: any, val: (id: string, key: string) => any, materialAt: (id: string, key: string, matterState: string) => any}} ctx @param {string} id
 */
export function buildingOf(ctx, id) {
  const s = slot(ctx.rp);
  if (s.inputs.has(id)) return s.inputs.get(id);
  let out = null;
  if (ctx.rp.kinds.get(id) === FOOTPRINT_KIND.building && !ctx.rp.offstage.has(id)) {
    const code = ctx.val(id, BUILD.form);
    const rec = typeof code === 'string' && ctx.engine.vocab && ctx.engine.vocab.index instanceof Map ? ctx.engine.vocab.index.get(code) : undefined;
    const planCells = ctx.val(id, BUILD.planCells);
    const storeys = ctx.val(id, BUILD.storeys);
    const anchor = ctx.val(id, BUILD.anchor);
    const facing = ctx.val(id, BUILD.facing);
    if (rec && rec.family === FAMILY.form && isObj(rec.entry) && isObj(planCells) && Number.isInteger(storeys) && isObj(anchor) && Number.isInteger(facing) && Number.isFinite(ctx.val(id, BUILD.condition))) { // 完好度读不到即蓝图未知，不当完好
      const thickness = ctx.val(id, BUILD.thickness);
      const bp = planBlueprint({ form: rec.entry, planCells, storeys, wallThicknessM: typeof thickness === 'number' ? thickness : null, facing }, blueprintRulesOf(ctx.engine));
      if (!bp.ok) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, `blueprint of ${id} is infeasible: ${bp.reason}`);
      out = { id, formCode: code, bp, anchor, facing: bp.facing };
    }
  }
  s.inputs.set(id, out);
  return out;
}

// 此刻各格的样子（卷十九 §3.2 blueprintOf 的读法）：每格 {x, y, z, u, v, level, kind, material, ceiling, ceilingKind, open, fixture, room（房间序号）, element}。
// material 为 null 即读作空气（由 gridView 取 gentemplate 的空气行）；kind 为 null 的格是桥面层的格（保留基底，只加顶面）。
function read(ctx, b) {
  const s = slot(ctx.rp);
  if (s.readings.has(b.id)) return s.readings.get(b.id);
  const { bp } = b;
  const materialKg = ctx.val(b.id, BUILD.materialKg);
  const mats = [];
  if (isObj(materialKg)) {
    for (const code of Object.keys(materialKg).sort(cmp)) {
      if (!(materialKg[code] > 0)) continue;
      // 围护的料是固态：密度取按物态分栏的 solid 栏（卷三甲分态量，千克每升；卷三甲 :268 经 materialView 读）。
      const d = ctx.materialAt(code, DENSITY, STATE.solid);
      if (typeof d !== 'number' || !(d > 0)) throw new KernelError('E-DIM-REQUIRED-MISSING', {}, `blueprint ${b.id}: material ${code} has no positive solid density`);
      mats.push({ code, massKg: materialKg[code], density: d });
    }
  }
  const elemMat = materialsOfElements(bp, mats);
  const rules = blueprintRulesOf(ctx.engine);
  const world = worldCellsOf(bp, b.anchor);
  const breaks = Array.isArray(ctx.val(b.id, BUILD.breaks)) ? ctx.val(b.id, BUILD.breaks) : [];
  const conditionRaw = ctx.val(b.id, BUILD.condition); // buildingOf 已核是数
  const wear =ctx.engine.rules && ctx.engine.rules.facility && isObj(ctx.engine.rules.facility.wear) ? ctx.engine.rules.facility.wear : null;
  const seed = ctx.engine.template && typeof ctx.engine.template.seed === 'string' ? ctx.engine.template.seed : '';
  const breach = breachesOf(bp, conditionRaw, breaks, wear, (code, idx) => breachOrderKey(seed, b.id, code, idx));
  // 开口与缺口落到格：破口那一处沿墙厚各格读作空气并算开口；屋面缺口的格顶面读作无；拆开的元（breaks）同样（楼梯拆开读作空气，不再是楼梯种类）。
  const openCells = new Set();
  const noCeiling = new Set();
  // 一元拆开即整处开：拆开的外墙处沿墙厚各格都开（卷十九 §4.1 规则 3、12）。
  for (const i of [...breach.breachPlaces, ...breach.breakWallPlaces]) for (const at of bp.places[i].cells) openCells.add(at);
  for (const i of breach.gapRoofs) noCeiling.add(bp.places[i].outer);
  // 劣化规则表缺失时依赖它的格按未知往下传（卷二 §1.12）：未知的候选墙处各格（material、open）与候选屋面元（ceiling）。
  const unknownWall = new Set();
  const unknownRoof = new Set();
  for (const i of breach.unknownWalls) for (const at of bp.places[i].cells) unknownWall.add(at);
  for (const i of breach.unknownRoofs) unknownRoof.add(bp.places[i].outer);
  const brokenKey = new Set(breaks.map((x) => `${x.level},${x.v},${x.u}`));
  const cells = bp.cells.map((c, at) => {
    const w = world[at];
    const isBroken = brokenKey.has(`${c.level},${c.v},${c.u}`) && c.element !== null;
    // 外墙、隔墙的体元读它派到的料；楼梯格交出"楼梯"格种类、读作空气（它派到的料只入实物账与结构元，不作格材料，卷十九 §4.5 规则 8）。
    const bodyMaterial = c.kind === KIND.wall || c.kind === KIND.partition ? elemMat[c.element] : null;
    const ceilingMaterial = c.element !== null && c.ceiling !== null && !noCeiling.has(at) && !(isBroken) ? elemMat[c.element] : null;
    const gone = isBroken && c.ceiling === null;
    const opening = c.kind === KIND.door || c.kind === KIND.window || openCells.has(at) || gone;
    return {
      x: w.x, y: w.y, z: w.z, u: c.u, v: c.v, level: c.level, kind: c.kind,
      material: unknownWall.has(at) || openCells.has(at) || gone ? null : bodyMaterial,
      ceiling: unknownRoof.has(at) ? null : ceilingMaterial, ceilingKind: c.ceiling !== null && !noCeiling.has(at) && !isBroken && !unknownRoof.has(at) ? c.ceiling : null,
      open: unknownWall.has(at) ? null : opening, fixture: null, room: c.room, element: c.element, stairs: c.kind === KIND.stairs && !gone,
      unknown: unknownWall.has(at) || unknownRoof.has(at),
    };
  });
  const out = { cells, breach, breaks, wear, rules };
  s.readings.set(b.id, out);
  return out;
}

// 房间序号 → 房间行：同一角色按建房间行的先后（行 id 序）对应蓝图里该角色的第 k 间（卷十九 §4.5 规则 6 房间位次；房间行不存几何，只存 roomRole）。
function roomRowsOf(ctx, b) {
  const s = slot(ctx.rp);
  if (!s.rooms) {
    s.rooms = new Map();
    for (const [id, kind] of ctx.rp.kinds) {
      if (kind !== FOOTPRINT_KIND.room || ctx.rp.offstage.has(id)) continue;
      let p = ctx.rp.parentOf(id);
      while (p !== null && ctx.rp.kinds.get(p) !== FOOTPRINT_KIND.building) p = ctx.rp.parentOf(p);
      if (p === null) continue;
      if (!s.rooms.has(p)) s.rooms.set(p, []);
      s.rooms.get(p).push(id);
    }
  }
  const rows = (s.rooms.get(b.id) || []).sort(cmp);
  const byRole = new Map();
  for (const id of rows) {
    const role = ctx.val(id, BUILD.roomRole);
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(id);
  }
  const used = new Map();
  return b.bp.rooms.map((r) => {
    const k = used.get(r.role) || 0;
    used.set(r.role, k + 1);
    const list = byRole.get(r.role) || [];
    return { ordinal: r.ordinal, role: r.role, level: r.level, open: r.open, place: k < list.length ? list[k] : null };
  });
}

/**
 * kernelApi `blueprintOf(placeId)`（卷十九 §3.2）：蓝图转世界坐标，每格带此刻的 material、ceiling、open、所在固定装置；加 openingAreas；
 * 建筑行离场、不是建筑行或输入读不到时为 null（未知）。材料为 null 读作空气；ceiling 是顶面的料（无则 null），ceilingKind 是楼板、屋面、桥面；
 * 磨损破口与屋面缺口只在规则表 rules.facility.wear 登记后才派生（wearDerived 为假时只读 breaks）；固定装置与门窗扇（leafOpen）归卷十九建造卡，现在 fixture 恒为 null、扇按没装算。
 * @param {any} ctx @param {string} placeId
 * @returns {null | {place: string, anchor: object, facing: number, cells: object[], openings: object[], rooms: object[], bbox: object, design: object, areas: object, openingAreas: object, wearDerived: boolean}}
 */
export function blueprintOf(ctx, placeId) {
  const b = buildingOf(ctx, placeId);
  if (b === null) return null;
  const r = read(ctx, b);
  const rooms = roomRowsOf(ctx, b);
  const { bp } = b;
  const world = (idxs) => idxs.map((at) => ({ x: r.cells[at].x, y: r.cells[at].y, z: r.cells[at].z }));
  return Object.freeze({
    place: placeId, anchor: b.anchor, facing: bp.facing, cells: r.cells.map((c) => Object.freeze({ ...c, zone: zoneOfCell(rooms, c, placeId) })),
    openings: bp.openings.map((o) => ({ kind: o.kind, level: o.level, cells: world(o.cells) })),
    rooms, bbox: bp.bbox, design: bp.design, areas: bp.areas, wearDerived: r.wear !== null,
    openingAreas: openingAreasOf(bp, r.breach, [], r.rules),
  });
}

// 一格所属的地点行：房间格是房间行（有对应行时），其余（外墙、隔墙、内门、门、窗、桥面、没有对应房间行的房间格）是建筑行；内门格不属任何房间（卷十九 §4.5 规则 7 第 8 点）。
function zoneOfCell(rooms, c, buildingId) {
  if (c.room === null) return buildingId;
  const row = rooms[c.room];
  return row && row.place !== null ? row.place : buildingId;
}

// ---------- 区格 → 建筑索引、逐格查找 ----------

// 每栋按外包框覆盖的区格登记建筑 id；索引在计划对象上缓存。
function indexOf(ctx, grid) {
  const s = slot(ctx.rp);
  if (s.index) return s.index;
  const index = new Map();
  const ids = [...ctx.rp.kinds].filter(([, k]) => k === FOOTPRINT_KIND.building).map(([id]) => id).sort(cmp);
  for (const id of ids) {
    const b = buildingOf(ctx, id);
    if (b === null) continue;
    const { bbox } = b.bp;
    const lo = regionOfPos(grid, { x: b.anchor.x + bbox.dx0, y: b.anchor.y + bbox.dy0 });
    const hi = regionOfPos(grid, { x: b.anchor.x + bbox.dx1, y: b.anchor.y + bbox.dy1 });
    for (let rx = lo.x; rx <= hi.x; rx += 1) {
      for (let ry = lo.y; ry <= hi.y; ry += 1) {
        const key = `${b.anchor.w},${rx},${ry}`;
        if (!index.has(key)) index.set(key, []);
        index.get(key).push(id);
      }
    }
  }
  s.index = index;
  return index;
}

// 一栋建筑逐格的查找表（x,y,z → 读数）与各列最高层；只给被读到的建筑建，缓存在计划上。
function cellMapOf(ctx, id) {
  const s = slot(ctx.rp);
  if (s.cells.has(id)) return s.cells.get(id);
  const b = buildingOf(ctx, id);
  const r = read(ctx, b);
  const rooms = roomRowsOf(ctx, b);
  const byCell = new Map();
  const top = new Map();
  for (const c of r.cells) {
    const key = `${c.x},${c.y},${c.z}`;
    byCell.set(key, Object.freeze({ ...c, zone: zoneOfCell(rooms, c, id) }));
    const col = `${c.x},${c.y}`;
    if (!top.has(col) || top.get(col) < c.z) top.set(col, c.z);
  }
  const out = { byCell, top, building: b };
  s.cells.set(id, out);
  return out;
}

/**
 * 一格上的建筑读数（没有为 null）：同一格至多一栋建筑（兄弟足迹不相交，加载与建造时校验）；多栋重叠时取代号序第一栋。
 * @param {any} ctx @param {any} grid @param {{w: number, x: number, y: number, z: number}} pos
 */
export function buildingCellAt(ctx, grid, pos) {
  const r = regionOfPos(grid, pos);
  const ids = indexOf(ctx, grid).get(`${pos.w},${r.x},${r.y}`);
  if (!ids) return null;
  for (const id of ids) {
    const c = cellMapOf(ctx, id).byCell.get(`${pos.x},${pos.y},${pos.z}`);
    if (c) return c;
  }
  return null;
}

/**
 * 一列（x, y）上的建筑叠层：{top: 最高层号, at: z → 读数 | null}；没有建筑为 null。
 * @param {any} ctx @param {any} grid @param {number} w @param {number} x @param {number} y
 */
export function buildingColumn(ctx, grid, w, x, y) {
  const r = regionOfPos(grid, { x, y });
  const ids = indexOf(ctx, grid).get(`${w},${r.x},${r.y}`);
  if (!ids) return null;
  const maps = ids.map((id) => cellMapOf(ctx, id)).filter((m) => m.top.has(`${x},${y}`));
  if (maps.length === 0) return null;
  let top = null;
  for (const m of maps) { const t = m.top.get(`${x},${y}`); if (top === null || t > top) top = t; }
  return { top, at: (z) => { for (const m of maps) { const c = m.byCell.get(`${x},${y},${z}`); if (c) return c; } return null; } };
}

/**
 * 一个区格上各建筑最高一层的层号 zMax（只算落在这个区格里的列；这个区格没有建筑为 null）。远景视线的遮挡高读它（卷五 §4.2 规则 15：区格上各建筑足迹最高一层顶面海拔 = (zMax + 1) × storeyM）。
 * @param {any} ctx @param {any} grid @param {number} w @param {number} rx 区格序号 x @param {number} ry 区格序号 y
 * @returns {number | null}
 */
export function buildingTopStoreyInRegion(ctx, grid, w, rx, ry) {
  const ids = indexOf(ctx, grid).get(`${w},${rx},${ry}`);
  if (!ids) return null;
  let best = null;
  for (const id of ids) {
    for (const [col, z] of cellMapOf(ctx, id).top) {
      const at = col.indexOf(',');
      const r = regionOfPos(grid, { x: Number(col.slice(0, at)), y: Number(col.slice(at + 1)) });
      if (r.x === rx && r.y === ry && (best === null || z > best)) best = z;
    }
  }
  return best;
}

/**
 * 建筑足迹与房间足迹的派生几何（卷五 §4.1 规则 13）：areaM2 = 最低一层细格数 × cellM²，zRange = 足迹占的层号范围，elevationM = zRange.zMin × storeyM，
 * centroid = 足迹内细格中心坐标的平均（定点米，整数除法向零截断）；cellCount 是足迹的全部细格数。不是建筑或房间、离场、读不到为 null。
 * 房间足迹 = 蓝图里该房间的格（房间行不存几何）；没有对应房间格的房间行（蓝图里没有这间房）为 null。
 * @param {any} ctx @param {any} grid @param {string} placeId
 * @returns {null | {kind: string, w: number, cellCount: number, areaM2: number, centroid: {x: number, y: number}, elevationM: number, zRange: {zMin: number, zMax: number}, cells: {x: number, y: number, z: number}[]}}
 */
export function buildingFootprint(ctx, grid, placeId) {
  const kind = ctx.rp.kinds.get(placeId);
  if ((kind !== FOOTPRINT_KIND.building && kind !== FOOTPRINT_KIND.room) || ctx.rp.offstage.has(placeId)) return null;
  let owner = placeId;
  while (owner !== null && ctx.rp.kinds.get(owner) !== FOOTPRINT_KIND.building) owner = ctx.rp.parentOf(owner);
  if (owner === null) return null;
  const b = buildingOf(ctx, owner);
  if (b === null) return null;
  const r = read(ctx, b);
  let picked = r.cells;
  if (kind === FOOTPRINT_KIND.room) {
    const mine = roomRowsOf(ctx, b).filter((x) => x.place === placeId).map((x) => x.ordinal);
    picked = r.cells.filter((c) => c.room !== null && mine.includes(c.room));
  }
  if (picked.length === 0) return null;
  let lowest = picked[0].z;
  let highest = picked[0].z;
  for (const c of picked) { if (c.z < lowest) lowest = c.z; if (c.z > highest) highest = c.z; }
  const cellF = fixedUnits(grid.cellM);
  const bottom = picked.filter((c) => c.z === lowest).length;
  let sx = 0n;
  let sy = 0n;
  const half = cellF >> 1n; // 格中心：cellM ÷ 2
  for (const c of picked) { sx += BigInt(c.x) * cellF + half; sy += BigInt(c.y) * cellF + half; }
  const n = BigInt(picked.length);
  return {
    kind, w: b.anchor.w, cellCount: picked.length, areaM2: fixedToNumber(BigInt(bottom) * ((cellF * cellF) / fixedScale())),
    centroid: { x: fixedToNumber(sx / n), y: fixedToNumber(sy / n) },
    elevationM: fixedToNumber(BigInt(lowest) * fixedUnits(grid.storeyM)), zRange: { zMin: lowest, zMax: highest },
    cells: picked.map((c) => ({ x: c.x, y: c.y, z: c.z, kind: c.kind, zone: zoneOfCell(roomRowsOf(ctx, b), c, owner) })),
  };
}

/**
 * 加载期校验建筑行（卷五 §4.1 规则 11；卷十九 §4.5 规则 7）：对每个有齐形制、planCells、storeys、anchor、facing 的建筑足迹行（不含离场子树）：
 * ① 蓝图须可行（原因代号写进报错，E-DIM-DOMAIN-RANGE；输入越域同码）；② 锚点须落在父行的区域足迹里（E-GRID-FOOTPRINT-OUTSIDE-PARENT）：
 * 锚点所在区格的最深归属行是父行或父行的后代；③ 与同父的兄弟建筑足迹不相交（E-GRID-SIBLING-OVERLAP），先比外包框、框相交才逐格比。
 * 房间行不存几何，不在这里核。返回错误文字行。
 * @param {{rows: Map<string, any>, rp: any, idx: Map<string, any>, rules: any, units: Map<string, any> | undefined, zoneOfRegion: ((pos: any) => string | null) | null}} view
 */
export function checkBuildingRows(view) {
  const errors = [];
  const { rows, rp, idx } = view;
  if (!(idx instanceof Map)) return errors;
  const rules = blueprintRulesFrom(view.rules, view.units);
  const live = [];
  for (const id of [...rows.keys()].sort(cmp)) {
    if (rp.kinds.get(id) !== FOOTPRINT_KIND.building || rp.offstage.has(id)) continue;
    const row = rows.get(id);
    const rec = idx.get(row[BUILD.form]);
    if (!rec || rec.family !== FAMILY.form || !isObj(row[BUILD.planCells]) || !Number.isInteger(row[BUILD.storeys]) || !isObj(row[BUILD.anchor]) || !Number.isInteger(row[BUILD.facing])) continue;
    if (rules === null) { errors.push('E-RULES-UNREGISTERED place: rules.grid, rules.facility.blueprint and the volume unit are needed to check building blueprints'); return errors; }
    let bp;
    try {
      const t = row[BUILD.thickness];
      bp = planBlueprint({ form: rec.entry, planCells: row[BUILD.planCells], storeys: row[BUILD.storeys], wallThicknessM: typeof t === 'number' ? t : null, facing: row[BUILD.facing] }, rules);
    } catch (e) {
      errors.push(`E-DIM-DOMAIN-RANGE place/${id}: blueprint input out of domain (${e && e.message ? e.message : e})`);
      continue;
    }
    if (!bp.ok) { errors.push(`E-DIM-DOMAIN-RANGE place/${id}: blueprint infeasible (${bp.reason})`); continue; }
    const a = row[BUILD.anchor];
    live.push({ id, bp, a, parent: rp.parentOf(id) });
    if (view.zoneOfRegion) {
      const owner = view.zoneOfRegion(a);
      const parent = rp.parentOf(id);
      let inside = false;
      for (let p = owner; p !== null && parent !== null; p = rp.parentOf(p)) if (p === parent) { inside = true; break; }
      if (!inside) errors.push(`E-GRID-FOOTPRINT-OUTSIDE-PARENT place/${id}: anchor ${a.w},${a.x},${a.y} is not inside the footprint of the parent ${parent}`);
    }
  }
  const byParent = new Map();
  for (const e of live) { if (!byParent.has(e.parent)) byParent.set(e.parent, []); byParent.get(e.parent).push(e); }
  const box = (e) => ({ x0: e.a.x + e.bp.bbox.dx0, x1: e.a.x + e.bp.bbox.dx1, y0: e.a.y + e.bp.bbox.dy0, y1: e.a.y + e.bp.bbox.dy1 });
  for (const group of byParent.values()) {
    for (let i = 0; i < group.length; i += 1) {
      for (let j = i + 1; j < group.length; j += 1) {
        const p = group[i];
        const q = group[j];
        if (p.a.w !== q.a.w) continue;
        const bp0 = box(p);
        const bq = box(q);
        if (bp0.x1 < bq.x0 || bq.x1 < bp0.x0 || bp0.y1 < bq.y0 || bq.y1 < bp0.y0) continue;
        const mine = new Set(worldCellsOf(p.bp, p.a).map((c) => `${c.x},${c.y},${c.z}`));
        if (worldCellsOf(q.bp, q.a).some((c) => mine.has(`${c.x},${c.y},${c.z}`))) errors.push(`E-GRID-SIBLING-OVERLAP place/${q.id}: footprint overlaps the sibling ${p.id}`);
      }
    }
  }
  return errors;
}

/**
 * 建筑、房间的出入由蓝图门格派生（卷五 §4.1 规则 9）：P 是建筑行或房间行；"门"类 = 蓝图外壳上的门格（正门、入口）与此刻开口的窗格、破洞格。
 * 建筑 P：外壳上的开口（正门、入口、窗，内门不是建筑与外面之间的出入）与破洞（按完好度派生的破口、拆开的外墙元）；
 * 房间 P：与本房间的格四邻相接（同层）的开口格——内门、正门、窗、破洞；内门格归建筑行，所以房间的出入就是它旁边的内门。
 * 离场子树内为空由调用方保证（离场行的建筑读不到蓝图输入，返回空）。
 * 返回 [{kind: 开口种类（blueprint OPENING 代号，破洞为 'breach'）, level, cells: [{x, y, z}]}]，按（种类序、层、首格）排。
 * @param {any} ctx @param {string} placeId
 */
export function doorExitsOf(ctx, placeId) {
  const kind = ctx.rp.kinds.get(placeId);
  let owner = placeId;
  if (kind === FOOTPRINT_KIND.room) while (owner !== null && ctx.rp.kinds.get(owner) !== FOOTPRINT_KIND.building) owner = ctx.rp.parentOf(owner);
  else if (kind !== FOOTPRINT_KIND.building) return [];
  if (owner === null) return [];
  const b = buildingOf(ctx, owner);
  if (b === null) return [];
  const r = read(ctx, b);
  const { bp } = b;
  let near = () => true;
  if (kind === FOOTPRINT_KIND.room) {
    const mine = roomRowsOf(ctx, b).filter((x) => x.place === placeId).map((x) => x.ordinal);
    if (mine.length === 0) return [];
    const own = bp.cells.filter((c) => c.room !== null && mine.includes(c.room));
    near = (c) => own.some((o) => o.level === c.level && absInt(o.u - c.u) + absInt(o.v - c.v) === 1);
  }
  const out = [];
  for (const o of bp.openings) {
    if (kind === FOOTPRINT_KIND.building && o.kind === OPENING.innerDoor) continue;
    const cellsAt = o.cells.map((at) => r.cells[at]);
    if (!cellsAt.every((c) => c.open)) continue; // 此刻关着（扇关、读作料）即不是出口
    if (!o.cells.some((at) => near(bp.cells[at]))) continue;
    out.push({ kind: o.kind, level: o.level, w: b.anchor.w, cells: cellsAt.map((c) => ({ x: c.x, y: c.y, z: c.z })) });
  }
  const holes = [...r.breach.breachPlaces, ...r.breach.breakWallPlaces].sort((p, q) => p - q);
  for (const i of holes) {
    const place = bp.places[i];
    if (!place.cells.some((at) => near(bp.cells[at]))) continue;
    out.push({ kind: EXIT.breach, level: place.level, w: b.anchor.w, cells: place.cells.map((at) => ({ x: r.cells[at].x, y: r.cells[at].y, z: r.cells[at].z })) });
  }
  const order = [OPENING.mainDoor, OPENING.innerDoor, OPENING.entrance, OPENING.window, EXIT.breach];
  out.sort((p, q) => cmp(order.indexOf(p.kind), order.indexOf(q.kind)) || cmp(p.level, q.level) || cmp(p.cells[0].x, q.cells[0].x) || cmp(p.cells[0].y, q.cells[0].y));
  return out;
}
