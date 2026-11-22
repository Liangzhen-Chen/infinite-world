// 细格基底（卷五 §4.3 规则 8、10；§4.5 规则 1、5；§4.3.3 "水面"）：纯函数、不存档、不读引擎与状态。
// 输入是"一列细格"的描述（地表层号、区格模板、水体、模板格块），输出是格的内容与遮天／承托／可立足标志。
// 叠层次序（规则 10）：岩土（soilLayers 层 soilMaterial，再往下 rockMaterial〔或存量单元岩层〕）→ 地表层 surfaceMaterial → 空气 → 水体足迹内水面以下 liquid（顶部按冰画）
// → 模板格块；之后依次是体积凿空（G8）、建筑蓝图（G7）、存量形态（grid-stock.mjs 的位置，由调用方叠）、格差分（G9），这四层本文件只留叠入口（overlay 回调），不实现。
// 全整数（层号、定点米、千分数），不调 Math.*；常数只经 rules.grid 与 det-math，无量纲数字不落字面量（S5-7）。
// 空气是一行材料（主会话 11-21 已定：派生优先、不在代码里写死材料属性，空格也是一种材料，由数据给值）：地表以上的空格取 gentemplate.airMaterial 指的那一行、物态 gas，
// 它的不透光、遮天、能承托、不透气四个布尔和别的材料一样读材料行（卷三甲 :128–:131），代码里没有"空气恒为假"。

import { fixedUnits, fixedScale, fixedToNumber, FixedError } from './det-math.mjs';
import { surfaceHeightAt, surfaceStorey } from './grid.mjs';
import { blockAt } from './grid-template.mjs';

/** 材料的物态栏（卷三甲 :128 分态布尔的三栏）。 */
export const STATE = Object.freeze({ solid: 'solid', liquid: 'liquid', gas: 'gas' });
/** 格种类（卷五 §4.5 规则 5：楼梯、梯、坡；楼梯由建筑蓝图给，梯由洞穴生成器的洞口通路给〔卷十 R10-2.14 第 4 项，G8〕，坡暂无来源）。格种类不是材料：这三种格本格可立足、可通行。 */
export const CELL_KIND = Object.freeze({ stairs: 'stairs', ladder: 'ladder' });
// 本格可立足的格种类（卷五 §4.5 规则 5 末段："梯、坡"或楼梯格本身可立足）。
const STANDABLE_KINDS = Object.freeze([CELL_KIND.stairs, CELL_KIND.ladder]);
/** 坠落、挤出、落点结果的种类（place.mjs 的 settleCell、fallCell、extrudeCell 与本文件的 extrudeLanding 共用）。 */
export const SETTLE = Object.freeze({ stay: 'stay', fall: 'fall', extrude: 'extrude', land: 'land', buried: 'buried', unknown: 'unknown', none: 'none' });
/**
 * 一格该怎么结算（卷五 §4.5 规则 6 :761–:762；李白裁定 1117 末节表-3：人在液体格先按 :761 字面落格）：纯规则，place.mjs 的 settleCell 与测试共用这一处。
 * 可立足不动（stay）；不可立足而本格可穿行（气态）或是液体——液体格不可立足——为坠落（fall：落到正下方第一个可立足格）；本格是实体为挤出（extrude）；
 * 可立足未知或物态读不到为 unknown（未知照卷二 §1.12 往下传，不当成可立足）。
 * @param {boolean | null} standable @param {string | null} matterState STATE 之一
 * @returns {'stay' | 'fall' | 'extrude' | 'unknown'}
 */
export function settleKindOf(standable, matterState) {
  if (standable === null || standable === undefined) return SETTLE.unknown;
  if (standable) return SETTLE.stay;
  if (matterState === STATE.gas || matterState === STATE.liquid) return SETTLE.fall;
  if (matterState === STATE.solid) return SETTLE.extrude;
  return SETTLE.unknown;
}

/**
 * 坠落逐格一步（place.mjs 的 fallCell 用；纯规则，按材料物态类判，不认水体 id）：读不到可立足为 unknown；可立足为 land（落在这一格）；
 * 起点在液体里（sinkOnSolid）且这一格是实体而不可立足，为 fall（液体柱到底：停在它之上那一格，不穿河床——李白 11-23 事件 412004ce，卷五 :761 勘误 1122k1）；否则 none（继续往下）。
 * @param {{known: boolean, standable: boolean | null, state: string}} c @param {boolean} sinkOnSolid
 * @returns {'land' | 'fall' | 'unknown' | 'none'}
 */
export function fallStep(c, sinkOnSolid) {
  if (!c.known || c.standable === null) return SETTLE.unknown;
  if (c.standable) return SETTLE.land;
  if (sinkOnSolid && c.state === STATE.solid) return SETTLE.fall;
  return SETTLE.none;
}

/** 材料的三个格侧布尔维度名（卷三甲 :128–:130）。 */
export const FLAG = Object.freeze({ opaque: 'opaque', blocksSky: 'blocksSky', bearsLoad: 'bearsLoad' });

// 向下取整的整数除法（b > 0）。
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}
const ceilDiv = (a, b) => (a + b - 1n) / b; // a ≥ 0、b > 0

// ---------- 列的地表（规则 8） ----------

/**
 * 细格列 (x, y) 的地表高与层号：采样点是该列左下角（x × cellM、y × cellM 米），与 regionCell 的中心列同口径。
 * @param {object} grid rules.grid @param {string} worldSeed @param {number} w
 * @param {{id: string, x: number, y: number, elevM: number | null}[]} controlPoints @param {{reliefM: number, reliefRough: number}} entry 该区格所属最深区域足迹的 terrain 条目
 * @param {number} x @param {number} y @param {Map<string, bigint>} [memo] 一次范围查询共用的格点噪声 Map
 * @returns {{h: bigint, z: number} | null} h 定点米；控制面未知为 null
 */
export function columnSurface(grid, worldSeed, w, controlPoints, entry, x, y, memo) {
  const cellM = fixedUnits(grid.cellM);
  const qx = fixedToNumber(BigInt(x) * cellM);
  const qy = fixedToNumber(BigInt(y) * cellM);
  const h = surfaceHeightAt(grid, worldSeed, w, controlPoints, entry.reliefM, entry.reliefRough, qx, qy, memo);
  return h === null ? null : { h, z: surfaceStorey(grid, h) };
}

/**
 * 一个区格内各列求控制面时只需看的控制点子集（精确，不近似）：设区格中心 c，到 c 第 K 近的距离为 D；区格内任一列 q 到 c 不超过 δ（< regionCellM），
 * 则 q 的第 K 近距离 ≤ D + δ，q 的最近 K 个控制点各自到 c 的距离 ≤ D + 2δ。取到 c 的距离平方不超过 2D² + 2(2δ)²（≥ (D + 2δ)²，(a + b)² ≤ 2a² + 2b²，无需开方）的点，
 * 就是超集；controlSurfaceAt 在子集上与在全集上对区格内任一列的结果逐位相同（并列取 id 序，子集保序且含全部并列者）。
 * 控制点不多于 K 个时原样返回。把每列 O(控制点数 × log) 的排序降到每区格一次。
 * @param {{heightCtrlK: number, regionCellM: number}} grid @param {{id: string, x: number, y: number, elevM: number | null}[]} controlPoints
 * @param {number} rx 区格序号 x @param {number} ry 区格序号 y @returns {{id: string, x: number, y: number, elevM: number | null}[]}
 */
export function nearControlPoints(grid, controlPoints, rx, ry) {
  const k = grid.heightCtrlK;
  if (controlPoints.length <= k) return controlPoints;
  const cell = fixedUnits(grid.regionCellM);
  const cx = BigInt(rx) * cell + (cell >> 1n);
  const cy = BigInt(ry) * cell + (cell >> 1n);
  const withD = controlPoints.map((p) => {
    const dx = fixedUnits(p.x) - cx;
    const dy = fixedUnits(p.y) - cy;
    return { p, d2: dx * dx + dy * dy };
  });
  const sorted = withD.map((e) => e.d2).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const dk2 = sorted[k - 1];
  const twoDelta = cell + cell;
  const bound2 = dk2 + dk2 + twoDelta * twoDelta + twoDelta * twoDelta;
  return withD.filter((e) => e.d2 <= bound2).map((e) => e.p);
}

/**
 * 区格坡度（卷五 §4.3 规则 8）：本区格与四邻区格中心地表高差绝对值的最大者 ÷ regionCellM，截到 [0, 1]。外包框外的邻格不是区格，调用方不交；
 * 框内邻格高度未知（null）时最大者未知，按卷二 §1.12 往下传：已知部分已截到 1 则结果仍是 1（再大也截在 1），否则坡度为 null。没有邻格为 0。
 * @param {{regionCellM: number}} grid @param {bigint} selfH 本区格中心地表高（定点米） @param {(bigint | null)[]} neighborHs 框内四邻中心地表高（未知为 null）
 * @returns {number | null}
 */
export function regionSlope(grid, selfH, neighborHs) {
  let best = 0n;
  let unknown = false;
  for (const n of neighborHs) {
    if (n === null) { unknown = true; continue; }
    const d = n > selfH ? n - selfH : selfH - n;
    if (d > best) best = d;
  }
  const scale = fixedScale();
  const slope = (best * scale) / fixedUnits(grid.regionCellM);
  if (slope >= scale) return fixedToNumber(scale);
  return unknown ? null : fixedToNumber(slope);
}

// ---------- 水面（卷五 §4.3.3 规则 10 "水面"，勘误 1121k3；区域足迹水体） ----------

/**
 * 一个区格的水面层号与冰：水体 body = {liquidL, iceL, surfaceM2, flowing}（液体与冰账户余额升、水面面积平方米、流水标志）。
 * （水体存量单位 1123k53 起是立方米：调用方交入的余额按账户单位，m3PerL 参数名沿用旧称，实为"账户单位的立方米数"——存量按 m3 记时交 1；本函数不认具体单位，水层接上 gridView 时按账户单位交入。）
 * 余额合计为 0 或 surfaceM2 为 0 没有水（返回 null，不做除法）。平均水深 d = 合计 L × m3PerL ÷ surfaceM2（米，定点；m3PerL 是升换立方米，取自单位表 _units.json 里 L 的 si，由调用方交入，不借千分母）；
 * 静水全片一个水面：水面海拔 = footprintMinRepM + d；流水逐区格：水面海拔 = 本区格代表地表高 + d；
 * 水面层号 = max(floor(水面海拔 ÷ storeyM), 水底层号 + 1)，水底层号 = 本区格地表层号最低一列的地表层号（所以账户有水则每个区格最低一列至少一层水）。
 * 冰层数（每列水柱顶部）= ceil(该列水层数 × 冰余额 ÷ 余额合计)，见 iceLayersOf。
 * @param {{storeyM: number}} grid @param {{liquidL: number, iceL: number, surfaceM2: number, flowing: boolean}} body
 * @param {bigint} regionRepH 本区格代表地表高（定点米） @param {bigint} footprintMinRepH 水体足迹内各区格代表地表高的最低者（定点米） @param {number} bottomStorey 本区格最低一列的地表层号
 * @param {number} m3PerL 升换立方米（单位表 _units.json 里 L 的 si）
 * @returns {{levelZ: number, liquidL: bigint, iceL: bigint} | null}
 */
export function waterOfRegion(grid, body, regionRepH, footprintMinRepH, bottomStorey, m3PerL) {
  const liquid = fixedUnits(body.liquidL);
  const ice = fixedUnits(body.iceL);
  const total = liquid + ice;
  const area = fixedUnits(body.surfaceM2);
  const si = fixedUnits(m3PerL);
  if (si <= 0n) throw new FixedError('E-DET-DOMAIN', 'waterOfRegion: m3PerL must be positive');
  if (total <= 0n || area <= 0n) return null;
  // d（定点米）= 合计升 × m3PerL ÷ 面积平方米：三者同为定点（×SCALE），total × si ÷ area 的 SCALE 因子正好剩一个，即定点米。
  const d = (total * si) / area;
  const base = body.flowing ? regionRepH : footprintMinRepH;
  const byAltitude = Number(floorDiv(base + d, fixedUnits(grid.storeyM)));
  const levelZ = byAltitude > bottomStorey + 1 ? byAltitude : bottomStorey + 1;
  return { levelZ, liquidL: liquid, iceL: ice };
}

/**
 * 一列水柱顶部的冰层数：ceil(水层数 × 冰余额 ÷ 余额合计)；冰余额为 0 或水层数为 0 即 0。
 * @param {number} waterLayers 该列水层数（≥ 0） @param {{liquidL: bigint, iceL: bigint}} water waterOfRegion 的结果
 */
export function iceLayersOf(waterLayers, water) {
  if (waterLayers <= 0 || water.iceL <= 0n) return 0;
  return Number(ceilDiv(BigInt(waterLayers) * water.iceL, water.liquidL + water.iceL));
}

// ---------- 一列细格（规则 10 叠层） ----------

/**
 * 一列的描述（col）：{x, y, surfaceZ, tpl: {surfaceMaterial, soilLayers, soilMaterial, rockMaterial}, rockMaterial: 存量单元岩层材料或 null,
 *   water: {levelZ, liquidL, iceL, liquidMaterial} | null（该区格水体，列地表层号不低于水面层时该列没有水）, blocks: templateBlocksOf 的结果, overlay: 可选的后续叠层回调}。
 * tpl 另有 airMaterial（空气材料行的引用，gentemplate 的必填字段）：地表以上没有水、格块的格就是这一行（物态 gas）。
 * overlay(col, z, cell) → 新 cell 或 null（null 即不改）：留给体积凿空（G8）、建筑蓝图（G7）、存量形态、格差分（G9）按规则 10 的次序叠。
 * 格内容 cell = {material: 材料行代号, state, selfSupport}；material 一定有值（空气是 airMaterial 那一行）。
 * @param {any} col @param {number} z @returns {{material: string, state: string, selfSupport: boolean}}
 */
export function cellAt(col, z) {
  let cell = baseCell(col, z);
  const block = blockAt(col.blocks, col.x, col.y, z);
  if (block) cell = { material: block.material, state: STATE.solid, selfSupport: block.selfSupport };
  if (typeof col.overlay === 'function') {
    const over = col.overlay(col, z, cell);
    if (over) cell = over;
  }
  return cell;
}

function baseCell(col, z) {
  const { surfaceZ, tpl, water } = col;
  if (z > surfaceZ) {
    if (water !== null && water.levelZ > surfaceZ && z <= water.levelZ) {
      const layers = water.levelZ - surfaceZ;
      const ice = iceLayersOf(layers, water);
      return { material: water.liquidMaterial, state: z > water.levelZ - ice ? STATE.solid : STATE.liquid, selfSupport: false };
    }
    return { material: tpl.airMaterial, state: STATE.gas, selfSupport: false };
  }
  if (z === surfaceZ) return { material: tpl.surfaceMaterial, state: STATE.solid, selfSupport: false };
  if (z >= surfaceZ - tpl.soilLayers) return { material: tpl.soilMaterial, state: STATE.solid, selfSupport: false };
  return { material: col.rockMaterial !== null && col.rockMaterial !== undefined ? col.rockMaterial : tpl.rockMaterial, state: STATE.solid, selfSupport: false };
}

// 列里有内容的最高层：地表层、水面层、各格块顶，取最大（再往上全是空气）。
function columnTop(col) {
  let top = col.surfaceZ;
  if (col.water !== null && col.water.levelZ > top) top = col.water.levelZ;
  if (typeof col.overlayTop === 'number' && col.overlayTop > top) top = col.overlayTop; // overlay 叠层（建筑蓝图）所到的最高层
  for (const b of col.blocks) if (b.x0 <= col.x && col.x <= b.x1 && b.y0 <= col.y && col.y <= b.y1 && b.z1 > top) top = b.z1;
  return top;
}

/**
 * 一格某个布尔维度的取值：材料行按格的当时物态取栏（空气也是一行材料，由数据给值，不在这里写死）；读不到（调用方给的读口返回 null，真未知）原样往下传。
 * @param {(material: string, state: string, flag: string) => boolean | null} flagOf 读材料行分态布尔
 * @param {{material: string, state: string}} cell @param {string} flag
 */
function flagOfCell(flagOf, cell, flag) {
  if (cell.unknown) return null; // overlay 标未知的格：材料读不到，标志未知
  return flagOf(cell.material, cell.state, flag);
}

/**
 * 一格的三个标志（卷五 §4.5.1、§4.5.3 规则 1、5）：
 * - blocksSky（遮天）：这一格以上同一列到列顶有遮天材料格；有一格取假之外还有未知时为 null；
 * - bearsLoad（承托）：这一格的材料在当时物态下能托住上面一格；
 * - standable（可立足）：本格材料可穿行（空气类，state 为 gas）且下一格能承托；楼梯、梯、坡、承托顶面与承面家具随 G7/G9 经 overlay 的格种类给，本文件不处理。
 * 未知按卷二 §1.12 往下传，不当成假。
 * @param {any} col @param {number} z @param {(m: string, s: string, f: string) => boolean | null} flagOf
 * @returns {{blocksSky: boolean | null, bearsLoad: boolean | null, standable: boolean | null}}
 */
export function cellFlags(col, z, flagOf) {
  const here = cellAt(col, z);
  const below = cellAt(col, z - 1);
  let sky = false;
  let unknownAbove = false;
  const top = columnTop(col);
  // 顶面（楼板、屋面、桥面，只来自蓝图层，卷五 §4.5 规则 1）是该格的上表面：遮住它以下各格的天，所以本格自己的顶面也算；顶面的料按固态读分态布尔。
  for (let k = z; k <= top; k += 1) {
    const cell = cellAt(col, k);
    if (cell.unknown) { unknownAbove = true; continue; } // 依赖未登记规则表的格（劣化表缺失）：材料与顶面都未知，往下传
    if (cell.ceiling) {
      const v = flagOf(cell.ceiling, STATE.solid, FLAG.blocksSky);
      if (v === true) { sky = true; break; }
      if (v === null) unknownAbove = true;
    }
    if (k === z) continue;
    const v = flagOfCell(flagOf, cell, FLAG.blocksSky);
    if (v === true) { sky = true; break; }
    if (v === null) unknownAbove = true;
  }
  const blocksSky = sky ? true : unknownAbove ? null : false;
  const bearsLoad = flagOfCell(flagOf, here, FLAG.bearsLoad);
  const passable = here.state === STATE.gas;
  // 下一格能承托：材料能承托，或下一格有能承托的顶面（楼板托住正上方一格，卷五 §4.5 规则 1、5）；楼梯格（格种类，不是材料）本格可立足。
  let underfoot = flagOfCell(flagOf, below, FLAG.bearsLoad);
  if (underfoot !== true && below.unknown) underfoot = null;
  else if (underfoot !== true && below.ceiling) {
    const c = flagOf(below.ceiling, STATE.solid, FLAG.bearsLoad);
    if (c === true) underfoot = true;
    else if (c === null && underfoot === false) underfoot = null;
  }
  const standable = !passable ? false : STANDABLE_KINDS.includes(here.kind) ? true : underfoot;
  return { blocksSky, bearsLoad, standable };
}

/**
 * 挤出搜索在竖向能到几层：floor(半径 × cellM ÷ storeyM)（半径内同一水平位置上下各这么多层，距离 ≤ 半径 × cellM）。入参须是正整数，否则 E-DET-DOMAIN。
 * @param {{cellM: number, storeyM: number}} grid @param {number} radiusCells @returns {number}
 */
export function extrudeLayerReach(grid, radiusCells) {
  if (!Number.isSafeInteger(radiusCells) || radiusCells < 1) throw new FixedError('E-DET-DOMAIN', 'extrudeLanding: radius must be a positive integer (cells)');
  if (!Number.isSafeInteger(grid.cellM) || grid.cellM < 1 || !Number.isSafeInteger(grid.storeyM) || grid.storeyM < 1) throw new FixedError('E-DET-DOMAIN', 'extrudeLanding: cellM and storeyM must be positive integers');
  const reach = radiusCells * grid.cellM;
  return (reach - (reach % grid.storeyM)) / grid.storeyM; // 正整数的整除，不用 Math.*
}

/**
 * 挤出落点（卷五 §4.5 规则 6 :762；对照表待定 11 已定：求法与"可立足"标志同模块，G9）：人或物所在格被新基底（按日重派生）或差分变成实体材料时，
 * 移到 landSearchRadiusCells 内最近（直线距离）的可立足格，并列取格序号字典序（x, y, z）最小；范围内没有可立足格即"被埋"（卷十三、卷四处理，本函数不管伤害）。
 * 距离的平方全整数比较：水平一格 cellM 米、一层 storeyM 米，d² = (dx·cellM)² + (dy·cellM)² + (dz·storeyM)²，范围 d² ≤ (半径·cellM)²，不开方。
 * 按（d²，x，y，z）升序逐个看格：第一个可立足格即落点；若升序里在找到可立足格之前先遇到"未知"（standableAt 返回 null，列高度读不到），落点无从判定，
 * 返回 unknown（往下传，不跳过它去取更远的格）。纯函数，同输入同结果，与调用方给的格读取次序无关。
 * @param {{cellM: number, storeyM: number}} grid rules.grid
 * @param {number} radiusCells rules.grid.landSearchRadiusCells（细格数，正整数）
 * @param {{x: number, y: number, z: number}} from 被挤出的人或物所在格
 * @param {(x: number, y: number, z: number) => boolean | null} standableAt 该格可立足（真）、不可立足（假）、读不到（null）
 * @returns {{kind: 'land', cell: {x: number, y: number, z: number}} | {kind: 'buried'} | {kind: 'unknown'}}
 */
export function extrudeLanding(grid, radiusCells, from, standableAt) {
  const maxDz = extrudeLayerReach(grid, radiusCells);
  const sq = (n) => n * n;
  const reach2 = sq(radiusCells * grid.cellM);
  const candidates = [];
  for (let dx = -radiusCells; dx <= radiusCells; dx += 1) {
    for (let dy = -radiusCells; dy <= radiusCells; dy += 1) {
      for (let dz = -maxDz; dz <= maxDz; dz += 1) {
        const d2 = sq(dx * grid.cellM) + sq(dy * grid.cellM) + sq(dz * grid.storeyM);
        if (d2 <= reach2) candidates.push({ d2, x: from.x + dx, y: from.y + dy, z: from.z + dz });
      }
    }
  }
  candidates.sort((a, b) => a.d2 - b.d2 || a.x - b.x || a.y - b.y || a.z - b.z);
  for (const c of candidates) {
    const ok = standableAt(c.x, c.y, c.z);
    if (ok === true) return { kind: SETTLE.land, cell: { x: c.x, y: c.y, z: c.z } };
    if (ok === null) return { kind: SETTLE.unknown };
  }
  return { kind: SETTLE.buried };
}

/**
 * 自然坡的通行判据（卷五 §4.5.3 规则 5 "自然坡"，勘误 1121k3）：两个相邻列（八邻）都是自然地表列、且可立足格层号恰差一层时，一步可走到对方，不需要坡格；
 * 差两层及以上是崖。自然地表列：该列地表层与其上一层没有被模板格块、体积凿空、建筑蓝图、存量形态或差分改动（本文件只认得模板格块与 overlay 回调的改动）。
 * @param {any} col @returns {boolean}
 */
export function isNaturalColumn(col) {
  for (const z of [col.surfaceZ, col.surfaceZ + 1]) {
    if (blockAt(col.blocks, col.x, col.y, z)) return false;
    if (typeof col.overlay === 'function') {
      const over = col.overlay(col, z, baseCell(col, z));
      if (over) return false;
    }
  }
  return true;
}

/**
 * 两列自然坡可否一步走通：都是自然列且站立层（地表层上一层）号恰差一层。
 * @param {any} a @param {any} b @returns {boolean}
 */
export function naturalStepOk(a, b) {
  if (!isNaturalColumn(a) || !isNaturalColumn(b)) return false;
  const d = a.surfaceZ - b.surfaceZ;
  return d === 1 || d === -1;
}
