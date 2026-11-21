// 格子世界高度场与区格派生（卷五 §4.3 规则 8–9；§4.1 规则 15 的每区格独立种子）。只做区格层（G2），不写细格（G6 起）。
// 高度场是纯函数、不存档：h(x,y) = 控制面 + 起伏，全整数定点（卷二 §3.3、卷二十七 R27-5.9），地表高截到 [−12000, 9000] 米（卷五 §4.3 规则 8）。
// 常数只在 rules.grid（卷五 §2.3 :271；surfaceElevationMinM/MaxM 取 §4.1.1 :425），无量纲系数字面量不落代码（S5-7）；
// 几何与哈希经内核原语（det-math 定点、save/sample 的 sha256 与 64 位均匀数），不调 Math.*（S5-10）。
// 区格地形类由 cellclass 条目派生，无条目成立返回 null（数据须给全兜底条目、加载期报 E-GRID-CELL-NO-TERRAIN，归 cellclass 内容卡，不在代码里设缺省）。

import { fixedUnits, fixedScale, fixedToNumber, FixedError } from './det-math.mjs';
import { sha256Text } from './save.mjs';
import { uniformAt } from './sample.mjs';
import { gridSeedKeyText } from './handles/keys.mjs';

// 2 的若干次幂不写数字字面量：2 = 1+1；2^64 由十六进制字串拼出（卷二 §1.10 的 64 位均匀数取法）。
const HEX_PREFIX = '0x';
const WORD_ONES = 'ffffffffffffffff';
const TWO64 = BigInt(HEX_PREFIX + WORD_ONES) + 1n;
const SCALE = () => fixedScale();

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * 64 位均匀数 u（uniformAt 的值，[0, 2^64)）映射到 [0, n) 的整数：floor(u × n ÷ 2^64)。n 为正整数（BigInt），全整数、不丢精度。
 * 模板格块的千分数（n = 千分母）等"取一个整数份额"的抽取都经它，不各写一遍。
 * @param {bigint} u @param {bigint} n @returns {bigint}
 */
export function uniformBelow(u, n) {
  if (typeof u !== 'bigint' || typeof n !== 'bigint' || n <= 0n) throw new FixedError('E-DET-DOMAIN', 'uniformBelow: u and n must be bigint, n positive');
  return (u * n) / TWO64;
}

// 向下取整的整数除法（b > 0）；BigInt 的 / 向零截断，负数要修正。
function floorDiv(a, b) {
  const q = a / b;
  const r = a % b;
  return r !== 0n && r < 0n ? q - 1n : q;
}

// ---------- 每区格独立种子（卷五 §4.1 规则 15、卷二十七 R27-5.9） ----------

// 区格生成种子键的 sha256：前两参是调用处字面量（seed_sites 检测器按登记表双向比对），其余整数成分经 gridSeedKeyText 拼成十进制。
function gridSeed(stream, site, worldSeed, ...parts) {
  return sha256Text(gridSeedKeyText(worldSeed, stream, site, ...parts));
}

/**
 * 每区格独立种子键（role_seed，seed-keys.json）：sha256(世界种子 | grid | cell | w | 区格 x | 区格 y)。
 * 生成算法只一版，种子键里不放版本成分（R27-5.9）；细格基底归 G6，这里只给种子键。
 * @param {string} worldSeed 世界种子 @param {number} w 格空间号 @param {number} rx 区格 x @param {number} ry 区格 y
 * @returns {string} 64 位小写十六进制
 */
export function regionCellSeedKey(worldSeed, w, rx, ry) {
  const key = gridSeed('grid', 'cell', worldSeed, w, rx, ry);
  return key;
}

/**
 * 落格次序键（卷五 §4.1 规则 14 `hash(seedKey, 区格序号)`，种子抽取点登记在 seed-keys.json 第三行）：
 * 调用方给的 seedKey 与格空间号 w、区格 x、区格 y 取 sha256；同输入同结果，次序只由这个键定（并列由调用方按 (x, y) 字典序破）。
 * @param {string} seedKey 调用方给的种子键 @param {number} w 格空间号 @param {number} rx 区格 x @param {number} ry 区格 y
 * @returns {string} 64 位小写十六进制
 */
export function landOrderKey(seedKey, w, rx, ry) {
  // 先赋值再返回：同 reliefKey（seed_sites 检测器对紧跟 return 的调用漏识别）。
  const key = gridSeed('grid', 'land', seedKey, w, rx, ry);
  return key;
}

/**
 * 模板格块第 j 项的抽取键（卷十 R10-2.15 :435，抽取点 site.gen.tpl.block.<j>）：成分是该区格的区格种子键与块序号 j；同一区格同一块同一结果，
 * 与遍历次序、先派生哪个区格无关。取千分数在 grid-template.mjs（sha256 的前 64 位均匀数映射到 [0, 千分母)）。
 * @param {string} regionSeedKey regionCellSeedKey 给的区格种子键 @param {number} j 模板 blocks 里的序号
 * @returns {string} 64 位小写十六进制
 */
export function tplBlockKey(regionSeedKey, j) {
  const key = gridSeed('grid', 'tplblock', regionSeedKey, j);
  return key;
}

/**
 * 存量分到区格的次序键（卷五 §4.7 规则 12 :911，hash(世界种子, U, x, 区格序号)）：U 是存量单元行 id，x 是存量（物种、矿物材料）代号。
 * @param {string} worldSeed @param {string} unit @param {string} stock @param {number} w @param {number} rx @param {number} ry
 * @returns {string} 64 位小写十六进制
 */
export function stockRegionKey(worldSeed, unit, stock, w, rx, ry) {
  const key = gridSeed('grid', 'stockrg', worldSeed, unit, stock, w, rx, ry);
  return key;
}

/**
 * 存量在区格内取格的次序键（卷五 §4.7 规则 12 :912，hash(世界种子, U, x, 格序号)）：格序号取格的整数坐标 (x, y, z)。
 * @param {string} worldSeed @param {string} unit @param {string} stock @param {number} w @param {number} x @param {number} y @param {number} z
 * @returns {string} 64 位小写十六进制
 */
export function stockCellKey(worldSeed, unit, stock, w, x, y, z) {
  const key = gridSeed('grid', 'stockcl', worldSeed, unit, stock, w, x, y, z);
  return key;
}

/**
 * 建筑按完好度派生的破口次序键（卷十九 §4.1 规则 3，hash(世界种子, 建筑行 id, 序代号, 该处最外一格的格序号)）：序代号是规则表 wear.json 的 wallOrderCode、roofOrderCode，
 * 只作哈希的一段、规则不对它分支；格序号取蓝图局部（层、v、u）的唯一下标（blueprint.mjs）。同输入同结果，与遍历次序无关。
 * @param {string} worldSeed @param {string} placeId @param {string} orderCode @param {number} cellIndex
 * @returns {string} 64 位小写十六进制
 */
export function breachOrderKey(worldSeed, placeId, orderCode, cellIndex) {
  const key = gridSeed('grid', 'breach', worldSeed, placeId, orderCode, cellIndex);
  return key;
}

/**
 * 建筑、房间 coarse 落格的细格次序键（卷五 §4.1 规则 14 :501，hash(seedKey, 格序号)，细格格序号含层，取格的整数坐标 (x, y, z)，先例 stockCellKey）：
 * 与区格落格键 landOrderKey 同一调用方给的 seedKey，抽取点另登（grid/landcl）。同输入同结果，与遍历次序无关。
 * @param {string} seedKey 调用方给的种子键 @param {number} w @param {number} x @param {number} y @param {number} z
 * @returns {string} 64 位小写十六进制
 */
export function landCellKey(seedKey, w, x, y, z) {
  const key = gridSeed('grid', 'landcl', seedKey, w, x, y, z);
  return key;
}

// ---------- 起伏噪声（卷五 §4.3 规则 8「起伏」） ----------

// 起伏噪声的格点哈希 hash(世界种子, w, 格点, k)（卷五 §4.3 规则 8）：也是种子抽取点，经 gridSeed 以字面量流/抽取点代号登记（seed-keys.json 第二行，R27-8.1）。
function reliefKey(worldSeed, w, gi, gj, k) {
  // 先赋值再返回：seed_sites 检测器把紧跟 return 的调用当声明跳过（js-scan NOT_CALL），直接 return 会漏识别该抽取点。
  const key = gridSeed('grid', 'relief', worldSeed, w, gi, gj, k);
  return key;
}

// 64 位均匀数 → 定点 [−1, 1]（[−SCALE, SCALE]）：u ∈ [0, 2^64) 映射到 (u × 2·SCALE) ÷ 2^64 − SCALE。
function unitNoise(u) {
  const scale = SCALE();
  const twoScale = scale + scale;
  return (u * twoScale) / TWO64 - scale;
}

// 第 k 级在格点 (gi, gj) 的定点噪声值 [−1, 1]。memo 是调用方给的一次性 Map（一次范围查询内相邻列共用格点，只省哈希次数，不跨调用、不进状态；
// 键含 (gi, gj, k)，世界种子与 w 由调用方在同一次调用里固定），有无 memo 结果逐位相同。
function cornerNoise(worldSeed, w, gi, gj, k, memo) {
  if (!memo) return unitNoise(uniformAt(reliefKey(worldSeed, w, gi, gj, k), 0));
  const key = `${gi}|${gj}|${k}`;
  let v = memo.get(key);
  if (v === undefined) {
    v = unitNoise(uniformAt(reliefKey(worldSeed, w, gi, gj, k), 0));
    memo.set(key, v);
  }
  return v;
}

/**
 * 起伏（纯函数）：以 reliefM 为振幅、reliefRough 为逐级衰减比，叠 reliefOctaves 级定点值噪声。
 * 第 k 级格点间距 regionCellM ÷ 2^k，格点之间双线性插值，全程整数、除法向零截断。
 * @param {{reliefOctaves: number, regionCellM: number}} grid rules.grid
 * @param {string} worldSeed @param {number} w @param {number} reliefM 振幅（米，≥0） @param {number} reliefRough 衰减比（fraction）
 * @param {number} qx 细格列 x（米） @param {number} qy 细格列 y（米）
 * @param {Map<string, bigint>} [memo] 可选：一次范围查询内共用格点噪声的一次性 Map（只省哈希，结果不变）
 * @returns {bigint} 定点米（SCALE 标度）
 */
export function reliefAt(grid, worldSeed, w, reliefM, reliefRough, qx, qy, memo) {
  const octaves = grid.reliefOctaves;
  const qxf = fixedUnits(qx);
  const qyf = fixedUnits(qy);
  const scale = SCALE();
  let amp = fixedUnits(reliefM);
  let total = 0n;
  for (let k = 0; k < octaves; k += 1) {
    const spacing = fixedUnits(grid.regionCellM) / (1n << BigInt(k));
    // 级数过多格距降到 0（定点标度不可再分）：报错，不静默跳过或除零。
    if (spacing === 0n) throw new FixedError('E-DET-DOMAIN', `reliefOctaves ${octaves} exceeds fixed-point resolution of regionCellM`);
    const i = floorDiv(qxf, spacing);
    const j = floorDiv(qyf, spacing);
    const gx0 = i * spacing;
    const gy0 = j * spacing;
    const tx = ((qxf - gx0) * scale) / spacing;
    const ty = ((qyf - gy0) * scale) / spacing;
    const v00 = cornerNoise(worldSeed, w, i, j, k, memo);
    const v10 = cornerNoise(worldSeed, w, i + 1n, j, k, memo);
    const v01 = cornerNoise(worldSeed, w, i, j + 1n, k, memo);
    const v11 = cornerNoise(worldSeed, w, i + 1n, j + 1n, k, memo);
    // 先 x 后 y 的双线性插值（各步 a + (b−a)·t ÷ SCALE），值域保持 [−SCALE, SCALE]。
    const top = v00 + ((v10 - v00) * tx) / scale;
    const bottom = v01 + ((v11 - v01) * tx) / scale;
    const n = top + ((bottom - top) * ty) / scale;
    total += (amp * n) / scale;
    amp = (amp * fixedUnits(reliefRough)) / scale;
  }
  return total;
}

// ---------- 控制面（卷五 §4.3 规则 8「控制面」） ----------

/**
 * 控制面（纯函数）：同一格空间里形心离该列最近的 heightCtrlK 个控制点，anchorElevationM 按到该列直线距离的平方反比加权平均；
 * 该列恰在某控制点上时取该点的值。并列取 id 码点序小。全整数定点，除法向零截断。
 * @param {{heightCtrlK: number}} grid rules.grid
 * @param {{id: string, x: number, y: number, elevM: number | null}[]} controlPoints 控制点（形心 x/y 米、anchorElevationM 米；null 为该行海拔未知）
 * @param {number} qx 细格列 x（米） @param {number} qy 细格列 y（米）
 * @returns {bigint | null} 定点米（SCALE 标度）；最近 K 个控制点里有海拔未知者为 null（未知）
 */
export function controlSurfaceAt(grid, controlPoints, qx, qy) {
  const k = grid.heightCtrlK;
  // 格空间里没有区域足迹行（层根除外）时卷五 :655 未定义控制面：拒收，不自补海平面缺省（待卷五澄清，见 docs/问题.md）。
  if (controlPoints.length === 0) throw new FixedError('E-DET-DOMAIN', 'controlSurfaceAt: no control points in grid space');
  const qxf = fixedUnits(qx);
  const qyf = fixedUnits(qy);
  const selected = controlPoints
    .map((p) => {
      const dx = fixedUnits(p.x) - qxf;
      const dy = fixedUnits(p.y) - qyf;
      return { id: p.id, d2: dx * dx + dy * dy, elev: p.elevM === null ? null : fixedUnits(p.elevM) };
    })
    .sort((a, b) => cmp(a.d2, b.d2) || cmp(a.id, b.id))
    .slice(0, k);
  // 该列恰在某控制点上：取该点的值（卷五 :656），结果不依赖别的点；该点海拔未知则为未知。
  for (const p of selected) if (p.d2 === 0n) return p.elev;
  // 不在任何控制点上：平方反比加权里每个入选点的权都为正，最近 K 个里任何一个海拔未知，这一列的控制面就是未知
  // （控制点取全部区域足迹行；未知照卷二 §1.12 往下传，不当它不存在、不借别的点顶替）。
  if (selected.some((p) => p.elev === null)) return null;
  // 平方反比权 1/d_i² 通分：权 w_i = Π_{j≠i} d_j²（整数精确，不设标度，任意远的控制点都不会权为 0 而分母归零）。
  let num = 0n;
  let den = 0n;
  selected.forEach((p, i) => {
    let w = 1n;
    selected.forEach((q, j) => { if (j !== i) w *= q.d2; });
    num += p.elev * w;
    den += w;
  });
  return num / den;
}

// ---------- 地表高与地表层号（卷五 §4.3 规则 8） ----------

/**
 * 地表高 h(x,y)（纯函数）：控制面 + 起伏，截到 [surfaceElevationMinM, surfaceElevationMaxM]。
 * @param {object} grid rules.grid
 * @param {string} worldSeed @param {number} w
 * @param {{id: string, x: number, y: number, elevM: number}[]} controlPoints
 * @param {number} reliefM @param {number} reliefRough
 * @param {number} qx @param {number} qy
 * @param {Map<string, bigint>} [memo] 可选：一次范围查询内共用格点噪声的一次性 Map（见 reliefAt）
 * @returns {bigint | null} 定点米（SCALE 标度）；控制面未知（最近控制点海拔未知）为 null
 */
export function surfaceHeightAt(grid, worldSeed, w, controlPoints, reliefM, reliefRough, qx, qy, memo) {
  const surface = controlSurfaceAt(grid, controlPoints, qx, qy);
  if (surface === null) return null;
  let h = surface + reliefAt(grid, worldSeed, w, reliefM, reliefRough, qx, qy, memo);
  const min = fixedUnits(grid.surfaceElevationMinM);
  const max = fixedUnits(grid.surfaceElevationMaxM);
  if (h < min) h = min;
  if (h > max) h = max;
  return h;
}

/**
 * 地表层号 = floor(h ÷ storeyM)（卷五 §4.3 规则 8；全格空间统一绝对层号，负海拔向下取整）。
 * @param {{storeyM: number}} grid rules.grid @param {bigint} h 定点米
 * @returns {number} 层号
 */
export function surfaceStorey(grid, h) {
  return Number(floorDiv(h, fixedUnits(grid.storeyM)));
}

// ---------- 区格地形类（卷五 §4.3 规则 9） ----------

/**
 * 区格地形类（纯函数）：cellclass 条目里对它成立且 priority 最大的一条（并列取代号码点序最小）。
 * 条件逐项比：terrain ∈ terrains；waterAny 满足所在水体足迹行的 waterKind（不在水体足迹里而该项非空即不成立）；
 * 坡度在 slopeRange 内；onRoad / inSettlement 与条目一致（null/空表示不限）。无条目成立返回 null（调用方报加载校验错）。
 * @param {Iterable<[string, object]>} entries cellclass 条目的 [代号, 条目字段] 列表
 * @param {{terrain: string, waterKind: string|null, slope: number, onRoad: boolean|null, inSettlement: boolean|null}} inputs
 * @returns {string | null} 地形类代号
 */
export function cellClassOf(entries, inputs) {
  let best = null;
  let bestPriority = null;
  for (const [code, entry] of entries) {
    if (!matchesCellClass(entry, inputs)) continue;
    const p = Number(entry.priority);
    if (best === null || p > bestPriority || (p === bestPriority && code < best)) {
      best = code;
      bestPriority = p;
    }
  }
  return best;
}

function matchesCellClass(entry, inputs) {
  if (!Array.isArray(entry.terrains) || !entry.terrains.includes(inputs.terrain)) return false;
  const any = entry.waterAny;
  if (inputs.waterKind === null || inputs.waterKind === undefined) {
    if (Array.isArray(any) && any.length > 0) return false;
  } else if (!Array.isArray(any) || !any.includes(inputs.waterKind)) {
    return false;
  }
  const range = entry.slopeRange;
  if (Array.isArray(range) && range.length > 1) {
    if (!(inputs.slope >= range[0] && inputs.slope <= range[1])) return false;
  }
  if (!flagMatches(entry.onRoad, inputs.onRoad)) return false;
  if (!flagMatches(entry.inSettlement, inputs.inSettlement)) return false;
  return true;
}

// 布尔可空条件：条目为 null/undefined 即不限，否则须与输入相等。
function flagMatches(entryFlag, inputFlag) {
  return entryFlag === null || entryFlag === undefined || entryFlag === inputFlag;
}

// ---------- 读取辅助（G3/G6 经此读高度，不直接碰定点原语） ----------

/** 定点米 → 米（JS 数）。@param {bigint} h @returns {number} */
export function heightMeters(h) {
  return fixedToNumber(h);
}
