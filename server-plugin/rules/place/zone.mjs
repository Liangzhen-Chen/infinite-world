// 格与地点的读法（卷五 §4.1 规则 12 zoneAt、规则 14 landCell，§4.2 规则 12 bearingView，§4.1.2 :444 包含树；S2-P 草案 §3 第 3–5、12 行）。
// 全书「一格属于哪个地点」「两位置的方位角」只经本文件（卷五 S5-10）；几何来自烘焙层 engine.bake.footprints（rules/place/footprint.mjs）与包含树 engine.bake.placeTree。
// 本阶段只认建筑足迹（主会话 Q3 甲）：格不在任何建筑里 zoneAt 给 null（如实未知）；landCell 遇非建筑或要细格（coarse 假）走未建数据门 E-ACT-WRITER-NOT-READY。
// 不写状态，同输入同结果；不认任何地点、组件类或形制 id。

import { KernelError } from '../../kernel/errors.mjs';
import { atan } from '../../kernel/det-math.mjs';
import { ruleValue } from '../load/registry.mjs';
import { keyedHex } from '../gen/sample.mjs';
import { cellKey } from './footprint.mjs';

// atan 查表所在规则表（rules.detNumeric.fnTables.atan，卷二十七 §2.2 :171）：取输入标度。
const DET = 'detNumeric';
const FN_TABLES = 'fnTables';
const ATAN = 'atan';
const GRID = 'grid';
const FULL_TURN_DEG = 'fullTurnDeg';
// 未建的足迹与精度去处（未建数据门：拒收并写明等哪张卡）。
const UNBUILT = Object.freeze({
  footprint: '卷五区域、房间、体积足迹卡（规则 10、11 房间与体积；S2-P 主会话 Q3 甲只做建筑足迹）',
  fine: '卷二十七现场泡卡（coarse 为假的可立足细格，卷五 §4.5 规则 5）',
});
const notReady = (/** @type {string} */ what, /** @type {string} */ card) => new KernelError('E-ACT-WRITER-NOT-READY', {}, `${what}: not built yet, wait for ${card}`);

/** @typedef {{w: number, x: number, y: number, z: number, coarse?: boolean}} Pos */
/** @typedef {{bake: {footprints: import('./footprint.mjs').Footprints, placeTree: {kind: string, ancestorsOf: (id: string) => readonly string[]}}, docData: Parameters<typeof ruleValue>[0], digestCap: {sha256Hex: (data: string, encoding: 'utf8') => string}}} ZoneEngine */

/**
 * zoneAt（卷五 §4.1 规则 12）：包含该格的足迹中在包含树上最深的一行；同深并列只可能是同父兄弟重叠，已由加载核对拒（checkFootprints），取码点序最小者。
 * 格不在任何建筑足迹里、或不是格为 null（区域足迹未建，如实未知；Q3 甲）。coarse 位置照样按所存格求。
 * @param {ZoneEngine} engine @param {object} state @param {unknown} pos @returns {string | null}
 */
export function zoneAt(engine, state, pos) {
  const { footprints, placeTree } = engine.bake;
  const hits = footprints.claimantsAt(pos);
  let best = null;
  let depth = -1;
  for (const id of hits) {
    const d = placeTree.ancestorsOf(id).length;
    if (d > depth) { best = id; depth = d; }
  }
  return best;
}

/**
 * placeChainOf（卷五 §4.1.2 :444 包含树）：[zoneAt(pos), …其祖先由近到远]；zoneAt 为 null 即空表。供菜单「我在哪」用，不另算几何。
 * @param {ZoneEngine} engine @param {object} state @param {unknown} pos @returns {readonly string[]}
 */
export function placeChainOf(engine, state, pos) {
  const here = zoneAt(engine, state, pos);
  return here === null ? Object.freeze([]) : Object.freeze([here, ...engine.bake.placeTree.ancestorsOf(here)]);
}

/**
 * landCell（卷五 §4.1 规则 14 落格）：只在 place 的足迹里、且 zoneAt 恰为 place 的格中取；coarse 为真时按 hash(seedKey, 格序号) 取最小者，返回 coarse 为真的位置。
 * hash 经 rules/gen/sample.mjs#keyedHex（种子键下一项的 sha256，与骰值键同一取法）。place 不是建筑（区域、房间、体积未建）或 coarse 不为真即未建数据门；
 * place 的足迹里没有一格归它自己（全被更深的后代占了）即 E-GRID-LAND-UNKNOWN。kind 本阶段只收不判（物的承面要求随批次写者卡）。
 * @param {ZoneEngine} engine @param {object} state @param {{place: string, kind: string, seedKey: string, coarse: boolean}} arg @returns {Pos}
 */
export function landCell(engine, state, arg) {
  const { place, seedKey, coarse } = Object(arg);
  if (coarse !== true) throw notReady(`landCell ${String(place)} coarse ${String(coarse)}`, UNBUILT.fine);
  if (typeof seedKey !== 'string' || seedKey === '') throw new KernelError('E-EFF-PARAM', {}, 'landCell: seedKey must be a non-empty string');
  const cells = engine.bake.footprints.cellsOf(String(place));
  if (cells.length === 0) throw notReady(`landCell ${String(place)}: not a building footprint`, UNBUILT.footprint);
  let best = null;
  let bestHash = '';
  for (const c of cells) {
    if (zoneAt(engine, state, c) !== place) continue;
    const h = keyedHex(engine, seedKey, String(cellKey(c)));
    if (best === null || h < bestHash) { best = c; bestHash = h; }
  }
  if (best === null) throw new KernelError('E-GRID-LAND-UNKNOWN', {}, `landCell ${String(place)}: no cell of its footprint resolves to it`);
  return Object.freeze({ w: best.w, x: best.x, y: best.y, z: best.z, coarse: true });
}

/**
 * bearingView（卷五 §4.2 规则 12）：a 到 b 的方位角，正北（+y）为 0、顺时针（+x 为东），取值 [0, fullTurnDeg)。
 * 经 det-math atan 查表（卷二十七 R27-5.2）全程整数：turn = {num, den} 是方位角占整圈的比（den 为整圈的定点弧度，由 atan(1) 连翻三倍得出，不写 π 常数）；
 * bearingDeg = num × fullTurnDeg ÷ den（atan 表输出标度截断后折成数）。两位置不在同一格空间、或平面重合即未知：bearingDeg 与 turn 为 null。
 * dx、dy 换米同乘 cellM，比值不变，故直接用细格序号差。relative（相对 facing 的前后左右档）待卷五规则 13 的数据，本卡给 null。
 * @param {ZoneEngine} engine @param {object} state @param {Pos} a @param {Pos} b @param {number | null} facing
 * @returns {{bearingDeg: number | null, turn: {num: bigint, den: bigint} | null, relative: null}}
 */
export function bearingView(engine, state, a, b, facing) {
  const unknown = { bearingDeg: null, turn: null, relative: null };
  if (cellKey(a) === null || cellKey(b) === null || a.w !== b.w) return unknown;
  const dx = BigInt(b.x - a.x);
  const dy = BigInt(b.y - a.y);
  if (dx === 0n && dy === 0n) return unknown;
  const row = Object(Object(ruleValue(engine.docData, DET, FN_TABLES))[ATAN]);
  const inScale = BigInt(row.inScale);
  const outScale = BigInt(row.outScale);
  const quarterPi = atan(inScale);
  const halfPi = quarterPi + quarterPi;
  const pi = halfPi + halfPi;
  const full = pi + pi;
  let theta;
  if (dy === 0n) theta = dx > 0n ? halfPi : pi + halfPi;
  else {
    const t = atan((dx * inScale) / dy);
    theta = dy > 0n ? (t < 0n ? t + full : t) : pi + t;
  }
  const deg = (theta * BigInt(Number(ruleValue(engine.docData, GRID, FULL_TURN_DEG))) * outScale) / full;
  return { bearingDeg: Number(deg) / Number(outScale), turn: { num: theta, den: full }, relative: null };
}
