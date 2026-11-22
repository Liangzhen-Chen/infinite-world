// 建筑蓝图（卷十九 §4.5 规则 7–9、§4.1 规则 2、3；卷五 §4.1 规则 11、§4.3 规则 10）：形制到蓝图的全书唯一算法 planBlueprint 与外包算法 planCellsOf。
// 纯函数、全整数（墙厚与体积用定点）、不读引擎与状态、不抽取：同一输入逐格相同；蓝图不存档，按（形制条目、planCells、storeys、墙厚、facing、cellM、storeyM）缓存，
// 缓存键只含这些输入。逐格铺开只给现场泡内用；泡外只用面积计数（规则 7 末"规模"：一张蓝图格数 W × D × (storeys + 1) 量级，民居 10²、大殿 10³–10⁴，
// 全世界不同组合数随形制条目数与面积档增长、不随建筑数增长；本文件没有任何装全世界格的容器）。
// 形制条目（bform 族，卷十九 §2.4 :203）由调用方按行上 `form` 代号从词表取来交入，本文件里没有形制代号、房间角色代号、料代号；规则里不对任何代号分支。
// 几何口径：局部 (u, v)，u 沿正面 0 到 W−1，v 由正面 0 往里到 D−1；转世界先取 (x, y) = (u, −v)，再按 k = facing ÷ 2 次 (x, y) → (y, −x)；层 ℓ 落在 anchor.z + 1 + storeyBase + ℓ（anchor.z 是锚点所在列的地表层号；偏移 0 的一层室内在地表层之上，封卷后勘误 1121k14）。
// 无量纲小整数（0、1、2）是格数与个数的算术，不是常数；cellM、storeyM、升换立方米都由调用方从规则表与单位表交入。

import { fixedUnits, fixedUnits8, fixedScale, fixedMultiply, fixedDivide, fixedToNumber, fixedSqrtInt, fixedCurveAt } from './det-math.mjs';
import { KernelError } from './errors.mjs';

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const larger = (a, b) => (a > b ? a : b);
const smaller = (a, b) => (a < b ? a : b);
const absInt = (a) => (a < 0 ? -a : a);
const ceilDiv = (a, b) => (a + b - 1n) / b; // a ≥ 0、b > 0

/** 格种类（卷十九 §4.5 规则 7 第 9 点）。 */
export const KIND = Object.freeze({ wall: 'wall', partition: 'partition', interior: 'interior', door: 'door', window: 'window', stairs: 'stairs' });
/** 顶面种类（规则 7 第 7 点）：楼板、屋面、桥面。 */
export const CEILING = Object.freeze({ floor: 'floor', roof: 'roof', deck: 'deck' });
/** 开口种类（规则 7 第 9 点 `openings`）：正门、内门、入口、窗；排序按这个次序。 */
export const OPENING = Object.freeze({ mainDoor: 'mainDoor', innerDoor: 'innerDoor', entrance: 'entrance', window: 'window' });
const OPENING_ORDER = Object.freeze([OPENING.mainDoor, OPENING.innerDoor, OPENING.entrance, OPENING.window]);
/** 结构元种类（规则 8）：体元（外墙、隔墙、楼梯格）与顶元。 */
export const ELEMENT = Object.freeze({ wall: 'wall', partition: 'partition', stairs: 'stairs', ceiling: 'ceiling' });
/** 外壳处的种类：地上外墙一处、屋面一元（places 里的 type）。 */
export const PLACE_TYPE = Object.freeze({ wall: 'wall', roof: 'roof' });
/** 形制默认用料 defaultMaterials 的三项角色（卷十九 §2.4，封卷后勘误 1123k60）。 */
export const MATERIAL_ROLES = Object.freeze(['wall', 'frame', 'roof']);
/** 不可行的原因代号（规则 7 第 3、4、7 点）。 */
export const REASON = Object.freeze({
  planTooSmall: 'bp_plan_too_small', roomsInfeasible: 'bp_rooms_infeasible', entranceNotAdjacent: 'bp_entrance_not_adjacent', floorOverOpenRoom: 'bp_floor_over_open_room',
});

// 形制条目与输入的字段名（卷十九 §2.4 :203；§3.2 planBlueprint 签名）。
const FORM = Object.freeze({
  walled: 'walled', aspect: 'aspect', storeyBase: 'storeyBase', roofed: 'roofed', deck: 'deck', windowEvery: 'windowEvery', rooms: 'rooms', planSideMax: 'planSideMaxCells',
  thicknessDefault: 'wallThicknessDefaultM', thicknessMin: 'wallThicknessMinM',
});
const ROOM = Object.freeze({ role: 'role', share: 'share', level: 'level', open: 'open' });
const INPUT_KEYS = Object.freeze({ form: true, planCells: true, storeys: true, wallThicknessM: true, facing: true });
const CELLS_INPUT_KEYS = Object.freeze({ form: true, areaM2: true, wallThicknessM: true });
/** 词表族名（卷十九 §2.4）：形制族、房间角色族。 */
const FAMILY = Object.freeze({ form: 'bform', role: 'roomrole' });

const bad = (code, detail) => new KernelError(code, {}, detail);
const isInt = (v) => Number.isInteger(v);
const hasOnly = (obj, allowed) => Object.keys(obj).every((k) => Object.hasOwn(allowed, k));

// 规则表与单位表交入的常数（调用方：place-building.mjs 与测试）：
// {cellM, storeyM（rules.grid 的米数）, facingDirections（rules.grid，八向的档数）, m3PerL（单位表 L 的 si）, limits（rules.facility.blueprint：卷十九给定的取值域上下限）}。
// facing 每档的四分之一圈数 = 每圈档数 ÷ 4（两次折半）：卷十九"k = facing ÷ 2"在八向下的写法，档数登记在规则表，代码里不落。
function consts(rules) {
  if (!isObj(rules) || !isObj(rules.limits)) throw bad('E-DET-DOMAIN', 'blueprint: rules {cellM, storeyM, facingDirections, m3PerL, limits} missing');
  const out = {
    cell: fixedUnits(rules.cellM), storey: fixedUnits(rules.storeyM), si: fixedUnits(rules.m3PerL), limits: rules.limits,
    quarter: isInt(rules.facingDirections) ? (rules.facingDirections >> 1) >> 1 : 0,
  };
  if (out.cell <= 0n || out.storey <= 0n || out.si <= 0n || out.quarter <= 0) throw bad('E-DET-DOMAIN', 'blueprint: cellM, storeyM, m3PerL, facingDirections must be positive');
  out.directions = rules.facingDirections;
  return out;
}

// 形制条目的平面字段校验（加载期另有 checkBlueprintForms；纯函数入口也不信任调用方）。
function formFields(form, limits) {
  if (!isObj(form)) throw bad('E-DET-DOMAIN', 'blueprint: form entry missing');
  if (typeof form[FORM.walled] !== 'boolean' || typeof form[FORM.roofed] !== 'boolean' || typeof form[FORM.deck] !== 'boolean') throw bad('E-DIM-DOMAIN-RANGE', 'blueprint form: walled, roofed, deck are booleans');
  if (!isInt(form[FORM.storeyBase]) || form[FORM.storeyBase] < limits.storeyBaseMin || form[FORM.storeyBase] > limits.storeyBaseMax) throw bad('E-DIM-DOMAIN-RANGE', 'blueprint form: storeyBase out of rules.facility.blueprint [storeyBaseMin, storeyBaseMax]');
  if (!isInt(form[FORM.windowEvery]) || form[FORM.windowEvery] < 0 || form[FORM.windowEvery] > limits.windowEveryMax) throw bad('E-DIM-DOMAIN-RANGE', 'blueprint form: windowEvery out of [0, windowEveryMax]');
  if (!Array.isArray(form[FORM.rooms])) throw bad('E-DIM-DOMAIN-RANGE', 'blueprint form: rooms is a list (may be empty)');
  // 形制登记的外包边长上限（卷十九 §2.4，封卷后勘误 1121k21）：每种形制都必须自己登记，没有全局数、没有默认放大。
  if (!isInt(form[FORM.planSideMax])) throw bad('E-DIM-REQUIRED-MISSING', 'blueprint form: planSideMaxCells is a required integer (the form registers its own plan size cap)');
  if (form[FORM.planSideMax] < limits.planCellsMin) throw bad('E-DIM-DOMAIN-RANGE', 'blueprint form: planSideMaxCells below planCellsMin');
  return form;
}

// 外包某边超过形制登记上限：拒收并带字段（需要多大、上限多少），供生成日志与调用方报告用；不截断、不缩房间。
function overFormCap(form, width, depth) {
  return new KernelError('E-DET-DOMAIN', { reason: 'plan_cells_over_form_cap', need_width_cells: Number(width), need_depth_cells: Number(depth), max_cells: form[FORM.planSideMax] }, 'blueprint: plan cells exceed the form planSideMaxCells');
}

// 墙厚 t（定点米）：行上的 wallThicknessM；为空取形制的 wallThicknessDefaultM（卷十九 §4.5 规则 7）。须大于 0 且不超过 wallThicknessMaxM。
function thicknessOf(form, wallThicknessM, limits) {
  const raw = wallThicknessM === null || wallThicknessM === undefined ? form[FORM.thicknessDefault] : wallThicknessM;
  if (typeof raw !== 'number' || !Number.isFinite(raw)) throw bad('E-DET-DOMAIN', 'blueprint: wall thickness (or form wallThicknessDefaultM) is not a number');
  const t = fixedUnits(raw);
  if (t <= 0n || t > fixedUnits(limits.wallThicknessMaxM)) throw bad('E-DET-DOMAIN', 'blueprint: wall thickness want (0, wallThicknessMaxM] m');
  return t;
}

const wallCellsOf = (form, t, cell) => (form[FORM.walled] ? Number(ceilDiv(t, cell)) : 0);

/**
 * `planCellsOf({form, areaM2, wallThicknessM})`（卷十九 §3.2、§4.5 规则 7 第 1 点）：意图面积折成外包宽深，建成时写进行上 planCells。
 * A = ceil(areaM2 ÷ cellM²)；w = ceil(t ÷ cellM)（walled 假时 0）；m = 2w + 1；D = max(m, fixedSqrtInt(floor(A × aspect)))；W = max(m, ceil(A ÷ D))。
 * 外包任一边须不超过形制登记的 planSideMaxCells，越界抛 E-DET-DOMAIN（带字段 reason、need_width_cells、need_depth_cells、max_cells；不截断，卷十九 §2.1、§2.4，封卷后勘误 1121k21）。
 * @param {{form: object, areaM2: number, wallThicknessM?: number | null}} input @param {{cellM: number, storeyM: number, m3PerL: number}} rules
 * @returns {{widthCells: number, depthCells: number}}
 */
export function planCellsOf(input, rules) {
  if (!isObj(input) || !hasOnly(input, CELLS_INPUT_KEYS)) throw bad('E-DET-DOMAIN', 'planCellsOf: input is {form, areaM2, wallThicknessM}');
  const { cell, limits } = consts(rules);
  const form = formFields(input.form, limits);
  if (typeof input.areaM2 !== 'number' || !Number.isFinite(input.areaM2)) throw bad('E-DET-DOMAIN', 'planCellsOf: areaM2 is not a number');
  const area = fixedUnits(input.areaM2);
  if (area <= 0n) throw bad('E-DET-DOMAIN', 'planCellsOf: areaM2 must be positive');
  const aspect = typeof form[FORM.aspect] === 'number' ? fixedUnits(form[FORM.aspect]) : 0n;
  if (aspect < fixedUnits(limits.aspectMin) || aspect > fixedUnits(limits.aspectMax)) throw bad('E-DIM-DOMAIN-RANGE', 'planCellsOf: form aspect out of [aspectMin, aspectMax]');
  const scale = fixedScale();
  const cells = ceilDiv(area * scale, cell * cell); // A = ceil(area ÷ cellM²)：area、cell 同为定点，cell² 多一个 SCALE
  const w = BigInt(wallCellsOf(form, thicknessOf(form, input.wallThicknessM, limits), cell));
  const m = w + w + 1n;
  const depth = larger(m, fixedSqrtInt((cells * aspect) / scale));
  const width = larger(m, ceilDiv(cells, depth));
  if (width > BigInt(form[FORM.planSideMax]) || depth > BigInt(form[FORM.planSideMax])) throw overFormCap(form, width, depth);
  return { widthCells: Number(width), depthCells: Number(depth) };
}

// ---------- planBlueprint ----------

const cache = new WeakMap(); // 形制条目对象 → Map(键 → 蓝图)；键只含 planCells、storeys、墙厚、facing、cellM、storeyM、m3PerL（规则 7 第 9 点）

/**
 * `planBlueprint({form, planCells, storeys, wallThicknessM, facing}, rules)`（卷十九 §3.2、§4.5 规则 7–9）：形制到蓝图的唯一算法。
 * 输入只有这五项（多一个键即 E-DET-DOMAIN：不收引擎、状态），form 是 bform 族条目（调用方按行上 form 代号取来）。facing 取 [0, 7] 的整数，奇数向下取偶（§4.4 规则 2 ④），结果里返回取偶后的值。
 * 不可行返回 {ok: false, reason}（原因代号 REASON）；输入越域抛错。
 * 成功 {ok: true, facing, storeyBase, width, depth, wallCells, levels: [{level, offset}], cells, elements, openings, rooms, bbox, design, areas, places}：
 * cells 按（层、v、u）升序，每格 {u, v, level, kind, ceiling, room, element}（kind 为 null 即桥面层的格：格本身保留基底，只加顶面；入口层、桥面层的 level 落在 0..storeys−1 之外）；
 * elements 每项 {id, kind, volumeL（定点升，BigInt）}，体元在前（层由低到高、同层按格序号）、顶元在后；openings 每项 {kind, level, cells}（cells 是格下标，按种类再按位置排）；
 * rooms 每项 {ordinal, role, level, open, rowFrom, rowTo}；bbox {dx0, dy0, dx1, dy1} 是转后水平外包（细格偏移）；design {skyExposure, aperture}（数，规则 9）；
 * areas {floorM2, envelopeM2, solidM2, designOpenM2, designVolumeL}（§4.1 规则 2；全由蓝图数出）；places 外壳的处（地上外墙每处一项、屋面每元一项，供破口与开口面积用）。
 * @param {{form: object, planCells: {widthCells: number, depthCells: number}, storeys: number, wallThicknessM?: number | null, facing: number}} input
 * @param {{cellM: number, storeyM: number, m3PerL: number}} rules
 */
export function planBlueprint(input, rules) {
  const { c, form, pc, facing, t } = readPlanInput(input, rules);
  const key = [pc.widthCells, pc.depthCells, input.storeys, t, facing, c.cell, c.storey, c.si].join(',');
  let byForm = cache.get(form);
  if (!byForm) { byForm = new Map(); cache.set(form, byForm); }
  if (!byForm.has(key)) byForm.set(key, build(form, pc.widthCells, pc.depthCells, input.storeys, t, facing, c));
  return byForm.get(key);
}

/**
 * 不铺格的可行性预判（卷十 R10-7.12 "补出的房子必须能展开"的原语层支撑）：输入同 planBlueprint，返回与 planBlueprint 的 ok 与 reason 逐项相同的 {ok, reason}，
 * 但不铺格、不建结构元，代价 O(层数 × 进深)，与平面面积 W × D 无关（大平面反复加倍重试时不白铺越来越大的蓝图）。
 * 判的是 build 里全部会返回 ok 为假的四处：平面小于墙围、纯地下蓝图的入口不相邻、各层房间分不下、楼面压在开敞房间上；
 * 最后一处按列类等价归并：除楼梯格 (w, D − w − 1) 外，室内的各列在同一行上行为相同，所以每行只判"楼梯列"与"普通列"两类。
 * @param {{form: object, planCells: {widthCells: number, depthCells: number}, storeys: number, wallThicknessM?: number | null, facing: number}} input
 * @param {{cellM: number, storeyM: number, m3PerL: number}} rules
 * @returns {{ok: boolean, reason?: string}}
 */
export function planFeasible(input, rules) {
  const { c, form, pc, t } = readPlanInput(input, rules);
  return feasibleOf(form, pc.widthCells, pc.depthCells, input.storeys, wallCellsOf(form, t, c.cell));
}

function readPlanInput(input, rules) {
  if (!isObj(input) || !hasOnly(input, INPUT_KEYS)) throw bad('E-DET-DOMAIN', 'planBlueprint: input is {form, planCells, storeys, wallThicknessM, facing} only');
  const c = consts(rules);
  const lim = c.limits;
  const form = formFields(input.form, lim);
  const pc = input.planCells;
  if (!isObj(pc) || !isInt(pc.widthCells) || !isInt(pc.depthCells) || pc.widthCells < lim.planCellsMin || pc.depthCells < lim.planCellsMin) throw bad('E-DET-DOMAIN', 'planBlueprint: planCells want integers >= planCellsMin');
  if (pc.widthCells > form[FORM.planSideMax] || pc.depthCells > form[FORM.planSideMax]) throw overFormCap(form, pc.widthCells, pc.depthCells);
  if (!isInt(input.storeys) || input.storeys < lim.storeysMin || input.storeys > lim.storeysMax) throw bad('E-DET-DOMAIN', 'planBlueprint: storeys want an integer in [storeysMin, storeysMax]');
  if (!isInt(input.facing) || input.facing < 0 || input.facing >= c.directions) throw bad('E-DET-DOMAIN', 'planBlueprint: facing want an integer in [0, facingDirections)');
  // 奇数向下取偶（§4.4 规则 2 ④）：取成每个四分之一圈所含档数的整数倍；转 turns 个四分之一圈。
  const facing = input.facing - (input.facing % c.quarter);
  const t = thicknessOf(form, input.wallThicknessM, lim);
  return { c, form, pc, facing, t };
}

// 一层的房间行分法：defs 非空时返回每间的 {def, rowFrom, rowTo}（隔墙行 = 除末间外各间的 rowTo + 1），分不下返回 null（规则 7 第 3 点；build 与 feasibleOf 共用这一处）。
function roomRowsOf(defs, D, w) {
  const d = D - (w + w);
  const r = defs.length;
  const spare = d - (r - 1);
  if (spare < r) return null;
  const parts = splitRows(spare, defs.map((x) => x[ROOM.share]));
  if (parts.some((q) => q <= 0)) return null;
  const out = [];
  let row = w;
  for (let k = 0; k < r; k += 1) {
    out.push({ def: defs[k], rowFrom: row, rowTo: row + parts[k] - 1 });
    row += parts[k] + 1;
  }
  return out;
}

function feasibleOf(form, W, D, storeys, w) {
  const m = w + w + 1;
  if (W < m || D < m) return Object.freeze({ ok: false, reason: REASON.planTooSmall });
  const base = form[FORM.storeyBase];
  const top = storeys - 1;
  const hasZero = base <= 0 && base + top >= 0;
  const undergroundOnly = !hasZero;
  if (undergroundOnly && base + storeys !== 0) return Object.freeze({ ok: false, reason: REASON.entranceNotAdjacent });
  const levels = [];
  for (let l = 0; l < storeys; l += 1) {
    const defs = roomsOfLevel(form[FORM.rooms], l);
    const rows = defs.length > 0 ? roomRowsOf(defs, D, w) : [];
    if (rows === null) return Object.freeze({ ok: false, reason: REASON.roomsInfeasible });
    levels.push(rows);
  }
  const stairV = D - w - 1;
  const hasGeneric = W - (w + w) > 1; // 室内除楼梯列外还有别的列
  // 某层某行（室内）的格：隔墙行不是室内；楼梯列在设楼梯的层是楼梯（不算室内但算"室内或楼梯"）；返回 {interior, stairs, room}，room 为房间序（层内）或 null。
  const cellOf = (l, v, stairCol) => {
    const rows = levels[l];
    let room = null;
    let onRoomRow = rows.length === 0;
    for (let k = 0; k < rows.length; k += 1) if (v >= rows[k].rowFrom && v <= rows[k].rowTo) { room = k; onRoomRow = true; }
    if (!onRoomRow) return { interior: false, stairs: false, room: null }; // 隔墙行
    const stairs = stairCol && v === stairV && (l < top || undergroundOnly);
    return { interior: !stairs, stairs, room };
  };
  for (let l = 0; l < top; l += 1) {
    for (let v = w; v < D - w; v += 1) {
      for (const stairCol of hasGeneric ? [false, true] : [true]) {
        const here = cellOf(l, v, stairCol);
        if (!here.interior || here.room === null || levels[l][here.room].def[ROOM.open] !== true) continue;
        const above = cellOf(l + 1, v, stairCol);
        if (!above.interior && !above.stairs) continue;
        if (above.room === null || levels[l + 1][above.room].def[ROOM.open] !== true) return Object.freeze({ ok: false, reason: REASON.floorOverOpenRoom });
      }
    }
  }
  return Object.freeze({ ok: true });
}

// 一层的房间分法（规则 7 第 3 点）：rooms 里 level 等于 ℓ 的各项；没有而 ℓ 大于列表里最大的 level 时照搬最大那一层；都没有即不分。
function roomsOfLevel(list, level) {
  const here = list.filter((r) => r[ROOM.level] === level);
  if (here.length > 0) return here;
  let max = null;
  for (const r of list) if (max === null || r[ROOM.level] > max) max = r[ROOM.level];
  return max !== null && level > max ? list.filter((r) => r[ROOM.level] === max) : [];
}

// 把 R 行按 share 分成 r 份：前 r−1 份各 floor(R × share)，末份取差（卷二 §3.3 第 3 条"拆分末份取差"）。
function splitRows(rows, shares) {
  const scale = fixedScale();
  const out = [];
  let used = 0n;
  for (let i = 0; i < shares.length - 1; i += 1) {
    const q = (BigInt(rows) * fixedUnits(shares[i])) / scale;
    out.push(Number(q));
    used += q;
  }
  out.push(Number(BigInt(rows) - used));
  return out;
}

/**
 * 局部 (u, v) → 转后水平偏移（规则 7 第 2 点）：(x, y) = (u, −v)，再顺时针转 turns 个四分之一圈（turns = facing ÷ 每个四分之一圈的档数），每转一次 (x, y) → (y, −x)。
 * @param {number} u @param {number} v @param {number} turns
 */
export function rotateOffset(u, v, turns) {
  let x = u;
  let y = 0 - v; // 0 − v 而不写 −v：v 为 0 时不产生 −0
  for (let i = 0; i < turns; i += 1) { const nx = y; y = 0 - x; x = nx; }
  return { x, y };
}

function build(form, W, D, storeys, t, facing, c) {
  const base = form[FORM.storeyBase];
  const w = wallCellsOf(form, t, c.cell);
  const m = w + w + 1;
  if (W < m || D < m) return Object.freeze({ ok: false, reason: REASON.planTooSmall });
  const offsetOf = (l) => base + l;
  const top = storeys - 1;
  const hasZero = base <= 0 && base + top >= 0;
  // 纯地下蓝图（没有绝对层偏移为 0 的层）：最高一层也设楼梯与入口，且最高一层须恰为 −1（规则 7 第 4 点）。
  const undergroundOnly = !hasZero;
  if (undergroundOnly && base + storeys !== 0) return Object.freeze({ ok: false, reason: REASON.entranceNotAdjacent });
  const doorU = W >> 1; // floor(W ÷ 2)
  const stairU = w;
  const stairV = D - w - 1;
  const rooms = [];
  const cellsByLevel = [];
  const index = (level, v, u) => (level + 1) * W * D + v * W + u; // 格下标：层由 −1（桥面层）起，局部（层、v、u）唯一
  // ---- 逐层：外墙、室内、隔墙、门、窗、楼梯 ----
  for (let l = 0; l < storeys; l += 1) {
    const kinds = new Array(W * D);
    const roomOf = new Array(W * D).fill(null);
    for (let v = 0; v < D; v += 1) {
      for (let u = 0; u < W; u += 1) {
        const ext = smaller(smaller(u, W - 1 - u), smaller(v, D - 1 - v));
        kinds[v * W + u] = ext < w ? KIND.wall : KIND.interior;
      }
    }
    const defs = roomsOfLevel(form[FORM.rooms], l);
    const marks = []; // 这一层的隔墙行
    if (defs.length > 0) {
      const placed = roomRowsOf(defs, D, w);
      if (placed === null) return Object.freeze({ ok: false, reason: REASON.roomsInfeasible });
      placed.forEach((p, k) => {
        const ordinal = rooms.length;
        rooms.push({ ordinal, role: p.def[ROOM.role], level: l, open: p.def[ROOM.open] === true, rowFrom: p.rowFrom, rowTo: p.rowTo });
        for (let v = p.rowFrom; v <= p.rowTo; v += 1) for (let u = w; u < W - w; u += 1) roomOf[v * W + u] = ordinal;
        if (k < placed.length - 1) marks.push(p.rowTo + 1);
      });
    }
    for (const v of marks) {
      for (let u = w; u < W - w; u += 1) kinds[v * W + u] = u === doorU ? KIND.door : KIND.partition;
    }
    cellsByLevel.push({ kinds, roomOf, marks });
  }
  const setOpening = (list, kind, level, cellsXY) => { list.push({ kind, level, cells: cellsXY }); };
  const opens = [];
  // 正门：绝对层偏移为 0 的层，walled 真，正面外墙 u = floor(W ÷ 2) 处沿墙厚的 w 格（第 4 点）。
  const zeroLevel = hasZero ? -base : null;
  if (form[FORM.walled] && zeroLevel !== null) {
    const cellsXY = [];
    for (let v = 0; v < w; v += 1) { cellsByLevel[zeroLevel].kinds[v * W + doorU] = KIND.door; cellsXY.push([doorU, v]); }
    setOpening(opens, OPENING.mainDoor, zeroLevel, cellsXY);
  }
  // 内门（隔墙上的门）：每一行隔墙 u = floor(W ÷ 2) 一格。
  for (let l = 0; l < storeys; l += 1) {
    for (const v of cellsByLevel[l].marks) setOpening(opens, OPENING.innerDoor, l, [[doorU, v]]);
  }
  // 窗：绝对层偏移不小于 0 的各层、walled 真且 windowEvery > 0；四面外墙去掉墙角后的墙段上，第 s 处（0 起，沿 u 增或 v 增的方向）满足 (s + 1) mod windowEvery = 0 且不是门的，沿墙厚的 w 格是窗（第 5 点）。
  const every = form[FORM.windowEvery];
  if (form[FORM.walled] && every > 0) {
    for (let l = 0; l < storeys; l += 1) {
      if (offsetOf(l) < 0) continue;
      const kinds = cellsByLevel[l].kinds;
      const wallRun = (len, at) => {
        for (let s = 0; s < len; s += 1) {
          if ((s + 1) % every !== 0) continue;
          const cellsXY = at(s);
          if (cellsXY.some(([u, v]) => kinds[v * W + u] !== KIND.wall)) continue; // 门所在处不开窗
          for (const [u, v] of cellsXY) kinds[v * W + u] = KIND.window;
          setOpening(opens, OPENING.window, l, cellsXY);
        }
      };
      const thick = Array.from({ length: w }, (_, j) => j);
      wallRun(W - (w + w), (s) => thick.map((j) => [w + s, j])); // 正面
      wallRun(W - (w + w), (s) => thick.map((j) => [w + s, D - 1 - j])); // 背面
      wallRun(D - (w + w), (s) => thick.map((j) => [j, w + s])); // u 小的一侧
      wallRun(D - (w + w), (s) => thick.map((j) => [W - 1 - j, w + s])); // u 大的一侧
    }
  }
  // 楼梯：storeys > 1 时除最高一层外每层 (w, D − w − 1)；纯地下蓝图最高一层也设，其正上方地表层那一格是入口（第 6、4 点）。
  const stairLevels = [];
  for (let l = 0; l < storeys; l += 1) if (l < top || undergroundOnly) stairLevels.push(l);
  for (const l of stairLevels) cellsByLevel[l].kinds[stairV * W + stairU] = KIND.stairs;
  // ---- 顶面（第 7 点） ----
  const ceilingAt = (l, kind, ord) => {
    if (kind !== KIND.interior && kind !== KIND.stairs) return null;
    if (kind === KIND.stairs) return null; // 楼梯井
    if (ord !== null && rooms[ord].open) return null; // 开敞房间
    if (l < top) return CEILING.floor;
    if (offsetOf(l) >= 0) return form[FORM.roofed] ? CEILING.roof : null;
    return CEILING.floor; // 地下最高层托住上面的地
  };
  // 开敞房间的格正上方一层同一格若是室内而不开敞，不可行（楼面不能悬在天井上）。
  for (let l = 0; l < top; l += 1) {
    for (let k = 0; k < W * D; k += 1) {
      const ord = cellsByLevel[l].roomOf[k];
      if (ord === null || !rooms[ord].open || cellsByLevel[l].kinds[k] !== KIND.interior) continue;
      const above = cellsByLevel[l + 1];
      const aboveKind = above.kinds[k];
      if (aboveKind !== KIND.interior && aboveKind !== KIND.stairs) continue;
      const ao = above.roomOf[k];
      if (ao === null || !rooms[ao].open) return Object.freeze({ ok: false, reason: REASON.floorOverOpenRoom });
    }
  }
  // ---- 装配格列表、结构元、设计体积 ----
  const cells = [];
  const elements = [];
  const bodyCells = []; // 体元所在的 cells 下标
  const ceilCells = [];
  const lowest = form[FORM.deck] ? -1 : 0;
  const highest = undergroundOnly ? storeys : top;
  const cellIndexOf = new Map(); // 格下标 → cells 里的位置（只在本次构建内用，随构建结束释放）
  const pushCell = (level, v, u, kind, ceiling, room) => {
    const at = cells.length;
    cells.push({ u, v, level, kind, ceiling, room, element: null });
    cellIndexOf.set(index(level, v, u), at);
    if (kind === KIND.wall || kind === KIND.partition || kind === KIND.stairs) bodyCells.push(at);
    if (ceiling !== null) ceilCells.push(at);
  };
  for (let l = lowest; l <= highest; l += 1) {
    for (let v = 0; v < D; v += 1) {
      for (let u = 0; u < W; u += 1) {
        if (l === -1) { pushCell(l, v, u, null, CEILING.deck, null); continue; }
        if (l === storeys) { if (u === stairU && v === stairV) pushCell(l, v, u, KIND.door, null, null); continue; }
        const kind = cellsByLevel[l].kinds[v * W + u];
        const ord = cellsByLevel[l].roomOf[v * W + u];
        pushCell(l, v, u, kind, ceilingAt(l, kind, ord), ord);
      }
    }
  }
  if (undergroundOnly) setOpening(opens, OPENING.entrance, storeys, [[stairU, stairV]]);
  const cellM = c.cell;
  const slab = fixedMultiply(fixedMultiply(c.cell, c.cell), smaller(t, cellM)); // cellM² × min(t, cellM)
  const column = fixedMultiply(c.cell, c.storey); // cellM × storeyM
  for (const at of bodyCells) {
    const cell = cells[at];
    let m3;
    if (cell.kind === KIND.wall) {
      const depth = smaller(smaller(cell.u, W - 1 - cell.u), smaller(cell.v, D - 1 - cell.v));
      m3 = fixedMultiply(column, smaller(cellM, t - BigInt(depth) * cellM));
    } else if (cell.kind === KIND.partition) m3 = fixedMultiply(column, smaller(t, cellM));
    else m3 = slab;
    cell.element = elements.length;
    elements.push({ id: elements.length, kind: cell.kind === KIND.wall ? ELEMENT.wall : cell.kind === KIND.partition ? ELEMENT.partition : ELEMENT.stairs, cell: at, volumeL: fixedDivide(m3, c.si) });
  }
  for (const at of ceilCells) {
    cells[at].element = elements.length;
    elements.push({ id: elements.length, kind: ELEMENT.ceiling, cell: at, volumeL: fixedDivide(slab, c.si) });
  }
  let sumL = 0n;
  for (const e of elements) sumL += e.volumeL;
  const designVolumeL = Number(ceilDiv(sumL, fixedScale()));
  // ---- 开口排序（种类、层、位置） ----
  const openingList = opens
    .map((o) => ({ kind: o.kind, level: o.level, cells: o.cells.map(([u, v]) => cellIndexOf.get(index(o.level, v, u))).sort(cmp) }))
    .sort((a, b) => cmp(OPENING_ORDER.indexOf(a.kind), OPENING_ORDER.indexOf(b.kind)) || cmp(a.level, b.level) || cmp(a.cells[0], b.cells[0]));
  // ---- 外壳的处与面积（规则 9、§4.1 规则 2） ----
  const places = [];
  if (form[FORM.walled]) {
    for (let l = 0; l < storeys; l += 1) {
      if (offsetOf(l) < 0) continue;
      const kinds = cellsByLevel[l].kinds;
      // 朝外格面数：墙段每处 1 面；墙角块（w × w，朝外的两条边各 w 格）共 2w 面（w = 1 时即卷文所说"墙角朝外两面"），总数恒为外包周长 2(W + D)。
      const place = (cellsXY, faces, corner) => {
        const idxs = cellsXY.map(([u, v]) => cellIndexOf.get(index(l, v, u)));
        const k = kinds[cellsXY[0][1] * W + cellsXY[0][0]];
        places.push({ type: PLACE_TYPE.wall, level: l, cells: idxs, outer: idxs[0], faces, corner, open: k === KIND.door || k === KIND.window });
      };
      const thick = Array.from({ length: w }, (_, j) => j);
      for (let s = 0; s < W - (w + w); s += 1) place(thick.map((j) => [w + s, j]), 1, false);
      for (let s = 0; s < W - (w + w); s += 1) place(thick.map((j) => [w + s, D - 1 - j]), 1, false);
      for (let s = 0; s < D - (w + w); s += 1) place(thick.map((j) => [j, w + s]), 1, false);
      for (let s = 0; s < D - (w + w); s += 1) place(thick.map((j) => [W - 1 - j, w + s]), 1, false);
      const block = (u0, v0) => { const out = []; for (let a = 0; a < w; a += 1) for (let b = 0; b < w; b += 1) out.push([u0 + a, v0 + b]); return out; };
      // 墙角处：外侧角格排首（"该处最外一格"），朝外 2w 面。
      for (const [ou, ov, u0, v0] of [[0, 0, 0, 0], [W - 1, 0, W - w, 0], [0, D - 1, 0, D - w], [W - 1, D - 1, W - w, D - w]]) {
        const cellsXY = block(u0, v0);
        const dist = (p) => absInt(p[0] - ou) + absInt(p[1] - ov);
        cellsXY.sort((p, q) => cmp(dist(p), dist(q)) || cmp(p[1], q[1]) || cmp(p[0], q[0]));
        place(cellsXY, (w + w), true);
      }
    }
  }
  const roofCells = cells.map((x, at) => (x.ceiling === CEILING.roof ? at : -1)).filter((at) => at >= 0);
  for (const at of roofCells) places.push({ type: PLACE_TYPE.roof, level: cells[at].level, cells: [at], outer: at, faces: 1, corner: false, open: false });
  let shellFaces = 0;
  let openFaces = 0;
  for (const p of places) if (p.type === PLACE_TYPE.wall) { shellFaces += p.faces; if (p.open) openFaces += p.faces; }
  const faceArea = fixedMultiply(c.cell, c.storey);
  const roofArea = fixedMultiply(c.cell, c.cell);
  const envelope = BigInt(shellFaces) * faceArea + BigInt(roofCells.length) * roofArea;
  const designOpen = BigInt(openFaces) * faceArea;
  let floorCells = 0;
  for (const x of cells) if (x.kind === KIND.interior || x.kind === KIND.stairs) floorCells += 1;
  // 设计露天比例：绝对层偏移为 0 那一层的室内格（含楼梯格）里，往上直到最高层都没有顶面者的比例；没有这一层取 0（第 9 点）。
  let skyNum = 0;
  let skyDen = 0;
  if (zeroLevel !== null) {
    for (let v = 0; v < D; v += 1) {
      for (let u = 0; u < W; u += 1) {
        const k0 = cellsByLevel[zeroLevel].kinds[v * W + u];
        if (k0 !== KIND.interior && k0 !== KIND.stairs) continue;
        skyDen += 1;
        let covered = false;
        for (let l = zeroLevel; l <= highest && !covered; l += 1) covered = cells[cellIndexOf.get(index(l, v, u))].ceiling !== null;
        if (!covered) skyNum += 1;
      }
    }
  }
  const ratio = (num, den) => (den === 0n ? 0 : fixedToNumber((num * fixedScale()) / den));
  // bbox：转后四角的最小、最大偏移。
  const turns = facing / c.quarter;
  const corners = [rotateOffset(0, 0, turns), rotateOffset(W - 1, 0, turns), rotateOffset(0, D - 1, turns), rotateOffset(W - 1, D - 1, turns)];
  const bbox = {
    dx0: corners.reduce((a, p) => smaller(a, p.x), corners[0].x), dy0: corners.reduce((a, p) => smaller(a, p.y), corners[0].y),
    dx1: corners.reduce((a, p) => larger(a, p.x), corners[0].x), dy1: corners.reduce((a, p) => larger(a, p.y), corners[0].y),
  };
  const levels = [];
  for (let l = 0; l < storeys; l += 1) levels.push({ level: l, offset: offsetOf(l) });
  const result = {
    ok: true, facing, turns, storeyBase: base, width: W, depth: D, wallCells: w, levels, cells, elements, openings: openingList, rooms, bbox,
    design: { skyExposure: ratio(BigInt(skyNum), BigInt(skyDen)), aperture: ratio(designOpen, envelope) },
    areas: {
      floorM2: fixedToNumber(BigInt(floorCells) * roofArea), envelopeM2: fixedToNumber(envelope), solidM2: fixedToNumber(envelope - designOpen),
      designOpenM2: fixedToNumber(designOpen), designVolumeL,
    },
    places,
  };
  return Object.freeze(result);
}

// ---------- 转世界坐标 ----------

/**
 * 蓝图格转世界坐标（卷十九 §3.2 blueprintOf 的几何半）：每格加上 anchor、按 facing 转（规则 7 第 2 点），层号 = anchor.z + 1 + storeyBase + level（anchor.z 是地表层号，勘误 1121k14）。
 * 返回与 cells 同序的 [{x, y, z, u, v, level}]。anchor 是 {x, y, z}（struct:pos 的位置分量）。
 * @param {ReturnType<typeof planBlueprint> & {ok: true}} bp @param {{x: number, y: number, z: number}} anchor
 */
export function worldCellsOf(bp, anchor) {
  return bp.cells.map((c) => {
    const o = rotateOffset(c.u, c.v, bp.turns);
    return { x: anchor.x + o.x, y: anchor.y + o.y, z: anchor.z + 1 + bp.storeyBase + c.level, u: c.u, v: c.v, level: c.level };
  });
}

// ---------- 结构元的料（规则 8 末点） ----------

/**
 * 各结构元派到的料（"重料在下、轻料在上"，只由材料的维度定，不点名任何材料）：materials = [{code, massKg, density}]（质量大于 0 的料；density 是有效值，千克每升）。
 * 体积份额 u_k = (massKg ÷ density) ÷ Σ，按材料代号序前几项各自整除、末项取"1 减前几项之和"（卷十九 §4.1 规则 7）；料按 density 由大到小排（并列按代号），
 * 结构元列（体元在前、顶元在后）沿设计体积累加，一元的累加起点落在哪种料的份额区间就派它。料为空返回全 null（读作没有料）。
 * 比较一律整数交叉相乘，不做除法；返回与 elements 同序的料代号数组。
 * @param {{elements: {volumeL: bigint}[]}} bp @param {{code: string, massKg: number, density: number}[]} materials
 * @returns {(string | null)[]}
 */
export function materialsOfElements(bp, materials) {
  const live = materials.filter((x) => fixedUnits(x.massKg) > 0n);
  if (live.length === 0) return bp.elements.map(() => null);
  for (const x of live) if (fixedUnits(x.density) <= 0n) throw bad('E-DET-DOMAIN', 'materialsOfElements: density must be positive');
  const scale = fixedScale();
  const byCode = [...live].sort((a, b) => cmp(a.code, b.code));
  const litres = byCode.map((x) => fixedDivide(fixedUnits(x.massKg), fixedUnits(x.density))); // 体积（定点升）
  let total = 0n;
  for (const l of litres) total += l;
  const share = new Map();
  let used = 0n;
  byCode.forEach((x, i) => {
    const s = i === byCode.length - 1 ? scale - used : (litres[i] * scale) / total;
    share.set(x.code, s);
    used += s;
  });
  const order = [...live].sort((a, b) => cmp(fixedUnits(b.density), fixedUnits(a.density)) || cmp(a.code, b.code));
  let design = 0n;
  for (const e of bp.elements) design += e.volumeL;
  // 料 k 的累加区间 [lo_k, hi_k)（份额，SCALE 标度）；一元起点 s（定点升）折份额 s × SCALE ÷ design，用 s × SCALE 与 hi_k × design 交叉相乘比较。
  const bounds = [];
  let lo = 0n;
  for (const x of order) { const hi = lo + share.get(x.code); bounds.push({ code: x.code, hi }); lo = hi; }
  const out = [];
  let start = 0n;
  for (const e of bp.elements) {
    let pick = bounds[bounds.length - 1].code;
    for (const b of bounds) if (start * scale < b.hi * design) { pick = b.code; break; }
    out.push(pick);
    start += e.volumeL;
  }
  return out;
}

/**
 * 围护用料须齐全的物性里这一行缺哪几项（卷十九 §4.1 规则 10）：固态密度为正、固态热导、隔声、腐蚀率、强度（至少一个应力键；toughness 由 strength 合成，不另存）。行为 undefined 时全缺。
 * @param {any} row @returns {string[]}
 */
export function envelopeMaterialMissing(row) {
  const r = isObj(row) ? row : {};
  const out = [];
  if (!(isObj(r.density) && typeof r.density.solid === 'number' && r.density.solid > 0)) out.push('density');
  if (!(isObj(r.thermalConductivity) && typeof r.thermalConductivity.solid === 'number')) out.push('thermalConductivity');
  if (typeof r.soundAttenuation !== 'number') out.push('soundAttenuation');
  if (typeof r.corrosionRate !== 'number') out.push('corrosionRate');
  if (!(isObj(r.strength) && Object.keys(r.strength).length > 0)) out.push('strength');
  return out;
}

/**
 * 围护设计体积按用料角色分（卷十九 §4.4 规则 1 的体积 V；角色是形制默认用料 defaultMaterials 的三项，封卷后勘误 1123k60）：
 * 墙 = 外墙与隔墙结构元，梁架 = 楼梯与楼板、桥面（承托的构件），屋顶 = 屋面。各角色体积是该角色全部结构元设计体积之和（定点升，不截断，和等于全部结构元之和）。
 * @param {{elements: {kind: string, cell: number, volumeL: bigint}[], cells: {ceiling: string | null}[]}} bp @returns {{wall: bigint, frame: bigint, roof: bigint}}
 */
export function volumeByMaterialRole(bp) {
  const out = { wall: 0n, frame: 0n, roof: 0n };
  for (const e of bp.elements) {
    const role = e.kind === ELEMENT.wall || e.kind === ELEMENT.partition ? 'wall' : e.kind === ELEMENT.stairs ? 'frame' : bp.cells[e.cell].ceiling === CEILING.roof ? 'roof' : 'frame';
    out[role] += e.volumeL;
  }
  return out;
}

// ---------- 按完好度派生的破口与缺口（§4.1 规则 3） ----------

/**
 * 按完好度与 breaks 派生此刻的破口（数量取账、位置取序，同卷五 §4.7 规则 12）：
 * 候选墙处 = 外壳（地上）外墙处里既不是设计开口、也不是墙角、也不在 breaks 里的；候选屋面元 = 不在 breaks 里的屋面元。
 * K_w = floor(n_墙 × (1 − condition) × breachShare)，K_r = floor(n_顶 × (1 − lookup(roofCurve, condition)))；
 * 候选按 orderKey(orderCode, 该处最外一格的格下标) 升序（并列按格下标）取前 K。orderKey 由调用方交入（种子键登记在 grid.mjs）。
 * condition 是 [0, 1] 的数（至多 8 位小数）；wear = {breachShare, roofCurve: [[x, y]…], wallOrderCode, roofOrderCode}。
 * breaks = [{u, v, level, remainL}]：只认能对上蓝图结构元的项。
 * 返回 {breachPlaces, gapRoofs（places 里的下标集合）, kw, kr, breakWallPlaces, breakRoofs, unknownWalls, unknownRoofs}；wear 为 null 时见下。
 * @param {ReturnType<typeof planBlueprint> & {ok: true}} bp @param {number} condition @param {{u: number, v: number, level: number}[]} breaks
 * @param {{breachShare: number, roofCurve: [number, number][], wallOrderCode: string, roofOrderCode: string}} wear @param {(orderCode: string, cellIndex: number) => string} orderKey
 */
export function breachesOf(bp, condition, breaks, wear, orderKey) {
  if (wear !== null && (typeof condition !== 'number' || !(condition >= 0 && condition <= 1))) throw bad('E-DET-DOMAIN', 'breachesOf: condition want [0, 1]');
  const scale = fixedScale();
  const broken = new Set();
  for (const b of breaks) broken.add(`${b.level},${b.v},${b.u}`);
  const keyOfCell = (at) => `${bp.cells[at].level},${bp.cells[at].v},${bp.cells[at].u}`;
  const isBroken = (at) => broken.has(keyOfCell(at));
  const hasElement = (at) => bp.cells[at].element !== null;
  const wallPlaces = bp.places.map((p, i) => ({ p, i })).filter(({ p }) => p.type === PLACE_TYPE.wall);
  const roofPlaces = bp.places.map((p, i) => ({ p, i })).filter(({ p }) => p.type === PLACE_TYPE.roof);
  // 一元拆开即整处开（卷十九 §4.1 规则 3 末"拆开的元"、规则 12）：外墙处里任一元在 breaks 里，该处沿墙厚各格都读作空气、算开口；
  const touched = (p) => p.cells.some((at) => hasElement(at) && isBroken(at));
  const breakWall = wallPlaces.filter(({ p }) => !p.open && touched(p));
  const candWall = wallPlaces.filter(({ p }) => !p.open && !p.corner && !touched(p));
  const breakRoof = roofPlaces.filter(({ p }) => isBroken(p.outer));
  const candRoof = roofPlaces.filter(({ p }) => !isBroken(p.outer));
  // wear 为 null：劣化规则表（wear.json）未登记，依赖它的量按未知往下传（卷二 §1.12），不报完好：
  // 墙破口数 K_w = floor(n × (1 − condition) × breachShare)：condition 恰为 1 时恒为 0，可推出；否则候选墙处各处未知（unknownWalls）。
  // 屋面缺口数 K_r 要读 roofCurve(condition)，没有表即未知：全部候选屋面元未知（unknownRoofs），kr 为 null。
  if (wear === null) {
    const full = typeof condition === 'number' && fixedUnits8(condition) === scale * scale;
    return {
      kw: full ? 0 : null, kr: null, breachPlaces: [], gapRoofs: [], unknownWalls: full ? [] : candWall.map(({ i }) => i), unknownRoofs: candRoof.map(({ i }) => i),
      breakWallPlaces: breakWall.map(({ i }) => i), breakRoofs: breakRoof.map(({ i }) => i),
    };
  }
  // 完好度按 10⁻⁸ 精度取（卷二 §3.3 第 6 条扩展标度）：定点 SCALE² 的分母。
  const full8 = scale * scale;
  const c8 = fixedUnits8(condition); // 完好度存的是 10⁻⁸ 精度的数（precision 8，extScale）
  const lack8 = full8 - c8;
  const kw = Number((BigInt(candWall.length) * lack8 * fixedUnits(wear.breachShare)) / (full8 * scale));
  const curve = wear.roofCurve.map(([x, y]) => [fixedUnits(x), fixedUnits(y)]);
  const atCondition = fixedCurveAt(curve, (c8 / scale));
  const kr = Number((BigInt(candRoof.length) * (scale - atCondition)) / scale);
  const ordered = (list, code) => [...list].sort((a, b) => cmp(orderKey(code, a.p.outer), orderKey(code, b.p.outer)) || cmp(a.p.outer, b.p.outer));
  return {
    kw, kr, unknownWalls: [], unknownRoofs: [],
    breachPlaces: ordered(candWall, wear.wallOrderCode).slice(0, kw).map(({ i }) => i),
    gapRoofs: ordered(candRoof, wear.roofOrderCode).slice(0, kr).map(({ i }) => i),
    breakWallPlaces: breakWall.map(({ i }) => i),
    breakRoofs: breakRoof.map(({ i }) => i),
  };
}

/**
 * 泡外的开口面积计数（卷十九 §2.1 `openingAreas`、§4.1 规则 3 末段）：aperture = (designOpenM2 − leafClosedM2 + wearBreachM2 + roofGapM2 + breakM2) ÷ shellM2，
 * 各项落在两两不相交的外壳处上。leafClosedM2 = 关着的扇所封各处的面积和（closedPlaces：places 的下标集合，调用方由装置读 leafOpen 给，扇只在设计开口上）；
 * wearBreachM2 = K_w × cellM × storeyM；roofGapM2 = K_r × cellM²；breakM2 = breaks 里外壳处的面积和（墙处按朝外面数，屋面元 cellM²）。
 * @param {ReturnType<typeof planBlueprint> & {ok: true}} bp @param {ReturnType<typeof breachesOf>} breach @param {number[]} closedPlaces
 * @param {{cellM: number, storeyM: number}} rules
 */
export function openingAreasOf(bp, breach, closedPlaces, rules) {
  const face = fixedMultiply(fixedUnits(rules.cellM), fixedUnits(rules.storeyM));
  const roof = fixedMultiply(fixedUnits(rules.cellM), fixedUnits(rules.cellM));
  const faces = (list) => list.reduce((s, i) => s + BigInt(bp.places[i].faces), 0n);
  const closed = faces(closedPlaces) * face;
  const breakWall = faces(breach.breakWallPlaces) * face;
  const breakRoof = BigInt(breach.breakRoofs.length) * roof;
  return {
    shellM2: bp.areas.envelopeM2,
    designOpenM2: bp.areas.designOpenM2,
    leafClosedM2: fixedToNumber(closed),
    // 依赖劣化规则表的两项：表缺失时 K_w（condition 不为 1）、K_r 为 null，面积项报未知（null），不报 0。
    wearBreachM2: breach.kw === null ? null : fixedToNumber(BigInt(breach.kw) * face),
    roofGapM2: breach.kr === null ? null : fixedToNumber(BigInt(breach.kr) * roof),
    breakM2: fixedToNumber(breakWall + breakRoof),
  };
}

// ---------- 加载期校验：bform 族条目（卷十九 §2.4 :203；A19-5.3） ----------

/**
 * 加载期校验 `bform` 族条目的平面字段与取值域（卷十九 §2.4 :203；规则表 build.json 另有常数，不在此）：返回错误文本数组（空为通过），码在文本开头。
 * 只核平面字段（walled、aspect、storeyBase、roofed、deck、windowEvery、wallThicknessDefaultM、wallThicknessMinM、rooms、planSideMaxCells——后者每种形制必填，没登记即装载报错，封卷后勘误 1121k21）；envelopeReq、技能等字段归建造卡。
 * 新增一个形制条目只加数据：本函数遍历族内全部条目，不点名代号。rooms 各项的 role 须是 roomrole 族条目，同一 level 的 share 之和恰为 1（定点），level 为非负整数。
 * limits 是规则表 rules.facility.blueprint（取值域上下限）；世界里有形制条目而它缺失，报 E-RULES-UNREGISTERED，不当作没有上下限放过。
 * facilityTypes（适用设施类型，卷十九 §2.4，封卷后勘误 1123k52）：交入设施类型表的行 id 集 facilityTypeIds 时核——必填列表（可空）、每项须是类型表的行、不重复；不交（undefined）即不核这一栏（只测平面字段的调用方）。
 * defaultMaterials（默认用料，卷十九 §2.4，封卷后勘误 1123k60）：交入 hasMaterial（材料代号是否材料表的行）时核——必填，墙、梁架、屋顶三项各指一行材料；不交（undefined）即不核这一栏。
 * @param {Map<string, {family: string, entry: any}>} vocabIndex 词表索引 @param {any} limits @param {Set<string>} [facilityTypeIds] 设施类型表（kind facility_type）的行 id
 * 默认料物性（卷十九 §4.1 规则 10，李白 11-24 裁）：另交 materialRowOf（材料代号 → 材料表行，没有为 undefined）时，核每种默认料的 density、thermalConductivity、soundAttenuation、corrosionRate、strength（toughness 由它合成）都已知。
 * @param {(code: string) => boolean} [hasMaterial] @param {(code: string) => any} [materialRowOf]
 * @returns {string[]}
 */
export function checkBlueprintForms(vocabIndex, limits, facilityTypeIds, hasMaterial, materialRowOf) {
  const errors = [];
  const scale = fixedScale();
  const num = (v) => typeof v === 'number' && Number.isFinite(v);
  for (const [code, rec] of [...vocabIndex].sort(([a], [b]) => cmp(a, b))) {
    if (!rec || rec.family !== FAMILY.form) continue;
    if (!isObj(limits)) { errors.push('E-RULES-UNREGISTERED place: rules.facility.blueprint is needed to check bform entries'); return errors; }
    const e = isObj(rec.entry) ? rec.entry : {};
    const at = `${FAMILY.form}/${code}`;
    for (const k of [FORM.walled, FORM.roofed, FORM.deck]) if (typeof e[k] !== 'boolean') errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${k} is a required boolean`);
    if (!num(e[FORM.aspect])) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${FORM.aspect} is a required number`);
    else if (fixedUnits(e[FORM.aspect]) < fixedUnits(limits.aspectMin) || fixedUnits(e[FORM.aspect]) > fixedUnits(limits.aspectMax)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FORM.aspect} ${e[FORM.aspect]} want [${limits.aspectMin}, ${limits.aspectMax}]`);
    if (!isInt(e[FORM.storeyBase])) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${FORM.storeyBase} is a required integer`);
    else if (e[FORM.storeyBase] < limits.storeyBaseMin || e[FORM.storeyBase] > limits.storeyBaseMax) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FORM.storeyBase} ${e[FORM.storeyBase]} want [${limits.storeyBaseMin}, ${limits.storeyBaseMax}]`);
    if (!isInt(e[FORM.windowEvery])) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${FORM.windowEvery} is a required integer`);
    else if (e[FORM.windowEvery] < 0 || e[FORM.windowEvery] > limits.windowEveryMax) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FORM.windowEvery} ${e[FORM.windowEvery]} want [0, ${limits.windowEveryMax}]`);
    if (!isInt(e[FORM.planSideMax])) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${FORM.planSideMax} is a required integer (the form's own plan size cap, no default)`);
    else if (e[FORM.planSideMax] < limits.planCellsMin) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FORM.planSideMax} ${e[FORM.planSideMax]} want >= ${limits.planCellsMin}`);
    for (const k of [FORM.thicknessDefault, FORM.thicknessMin]) {
      if (!num(e[k])) errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${k} is a required number`);
      else if (fixedUnits(e[k]) <= 0n || fixedUnits(e[k]) > fixedUnits(limits.wallThicknessMaxM)) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${k} ${e[k]} want (0, ${limits.wallThicknessMaxM}]`);
    }
    if (num(e[FORM.thicknessDefault]) && num(e[FORM.thicknessMin]) && fixedUnits(e[FORM.thicknessDefault]) > 0n && fixedUnits(e[FORM.thicknessMin]) > fixedUnits(e[FORM.thicknessDefault])) errors.push(`E-DIM-DOMAIN-RANGE ${at}: ${FORM.thicknessMin} exceeds ${FORM.thicknessDefault}`);
    if (facilityTypeIds instanceof Set) {
      const types = e.facilityTypes;
      if (!Array.isArray(types)) errors.push(`E-DIM-REQUIRED-MISSING ${at}: facilityTypes is a required list of facility_type rows (may be empty)`);
      else {
        const seen = new Set();
        types.forEach((t, i) => {
          if (typeof t !== 'string' || !facilityTypeIds.has(t)) errors.push(`E-DIM-REF-MISSING ${at}/facilityTypes/${i}: ${JSON.stringify(t)} is not a row of the facility_type table`);
          else if (seen.has(t)) errors.push(`E-DIM-DUPLICATE-KEY ${at}/facilityTypes/${i}: ${t} listed twice`);
          else seen.add(t);
        });
      }
    }
    // 默认用料（卷十九 §2.4，封卷后勘误 1123k60）：交入材料存在判定 hasMaterial 时核——必填，墙、梁架、屋顶三项各是材料表的一行；不交即不核这一栏。
    if (typeof hasMaterial === 'function') {
      const dm = e.defaultMaterials;
      if (!isObj(dm)) errors.push(`E-DIM-REQUIRED-MISSING ${at}: defaultMaterials is a required struct {${MATERIAL_ROLES.join(', ')}}`);
      else {
        for (const role of MATERIAL_ROLES) {
          if (typeof dm[role] !== 'string' || !hasMaterial(dm[role])) { errors.push(`E-DIM-REF-MISSING ${at}/defaultMaterials/${role}: ${JSON.stringify(dm[role])} is not a row of the material table`); continue; }
          // 卷十九 :408 规则 10（李白 11-24 裁第⑤条）：进入围护的料物性须齐全；交入 materialRowOf 时核。
          if (typeof materialRowOf === 'function') {
            const lacking = envelopeMaterialMissing(materialRowOf(dm[role]));
            if (lacking.length > 0) errors.push(`E-DIM-REQUIRED-MISSING ${at}/defaultMaterials/${role}: material ${dm[role]} lacks ${lacking.join(', ')} (vol19 section 4.1 rule 10)`);
          }
        }
      }
    }
    if (!Array.isArray(e[FORM.rooms])) { errors.push(`E-DIM-REQUIRED-MISSING ${at}: ${FORM.rooms} is a required list (may be empty)`); continue; }
    const sums = new Map();
    e[FORM.rooms].forEach((r, i) => {
      const where = `${at}/${FORM.rooms}/${i}`;
      if (!isObj(r)) { errors.push(`E-DIM-STRUCT-FIELD ${where}: room item is an object`); return; }
      const role = vocabIndex.get(r[ROOM.role]);
      if (typeof r[ROOM.role] !== 'string' || !role || role.family !== FAMILY.role) errors.push(`E-DIM-REF-MISSING ${where}: ${ROOM.role} ${JSON.stringify(r[ROOM.role])} is not a roomrole entry`);
      if (!num(r[ROOM.share]) || fixedUnits(r[ROOM.share]) <= 0n || fixedUnits(r[ROOM.share]) > scale) errors.push(`E-DIM-DOMAIN-RANGE ${where}: ${ROOM.share} want a fraction in (0, 1]`);
      if (!isInt(r[ROOM.level]) || r[ROOM.level] < 0) errors.push(`E-DIM-DOMAIN-RANGE ${where}: ${ROOM.level} want an integer >= 0`);
      if (typeof r[ROOM.open] !== 'boolean') errors.push(`E-DIM-DOMAIN-RANGE ${where}: ${ROOM.open} is a boolean`);
      if (isInt(r[ROOM.level]) && num(r[ROOM.share])) sums.set(r[ROOM.level], (sums.get(r[ROOM.level]) || 0n) + fixedUnits(r[ROOM.share]));
    });
    for (const [level, sum] of [...sums].sort(([a], [b]) => cmp(a, b))) if (sum !== scale) errors.push(`E-DIM-DOMAIN-RANGE ${at}/${FORM.rooms}: level ${level} shares sum to ${fixedToNumber(sum)}, want 1`);
  }
  return errors;
}
