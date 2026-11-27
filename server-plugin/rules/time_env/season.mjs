// 纬度、半球归一相位、季节、节气（卷二十 §2.7 :334–:340、§4.4.3 第 1–3 条 :689–:691；S2-T1 草案 §4）。
// 季节与节气只读词表（族 season 按单元 seasonScheme 取行，族 solar_term 主会话 Q3 甲、卷二十勘误）与规则表，规则层不认任何季节、节气、方案、地点代号。
// 天气单元 = 包含链上自地点起最近的、挂 rules.season.cellClass 所指组件类的地点（卷二十 :335）。纬度本阶段只对有建筑足迹的地点可求（形心 y，卷二十 :334；区域足迹未建，Q5 归 T2）。
// 时刻的日起点取日历模块 systemTimeView（日内切分只在 calendar.mjs）。纯函数，不写 state；返回 Fact {known, value, gaps}，读不到即 known 假加缺口，不兜底。

import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { fixedUnits, fixedDivide, fixedToNumber } from '../../kernel/det-math.mjs';
import { ruleValue } from '../load/registry.mjs';
import { astroView, systemTimeView } from './calendar.mjs';

const ASTRO = 'astro';
const ORIGIN_DEG = 'latitudeOriginDeg';
const METERS_PER_DEG = 'metersPerDegreeNorth';
const GRID = 'grid';
const CELL_M = 'cellM';
const SEASON = 'season';
const CELL_CLASS = 'cellClass';
const SCHEME_DIM = 'seasonScheme';
const SEASON_FAMILY = 'season';
const TERM_FAMILY = 'solar_term';
// 季节行跨方案通用的三个数值维度（卷二十 §2.6 :301–:303、:693）。
const SEASON_DIMS = Object.freeze(['growth', 'wetness', 'warmth']);
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const GAP = Object.freeze({ latitude: 'latitude_deg', cell: 'weather_cell', scheme: 'season_scheme', seasonRow: 'season_row', termRow: 'solar_term_row' });

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** 读数：known 假时 value 为 null、gaps 列缺口代号。 @template T @typedef {Readonly<{known: boolean, value: T | null, gaps: readonly string[]}>} Fact */
/** @typedef {{num: number, den: number}} Ratio */
/** @typedef {{season: string, growth: number, wetness: number, warmth: number}} SeasonValue */
/** 本模块读的 engine 字段：日历模块所读的、加上烘焙层足迹与包含树。 @typedef {import('./calendar.mjs').CalendarEngine & import('../place/zone.mjs').ZoneEngine} SeasonEngine */
/** @typedef {import('./calendar.mjs').TimeState} TimeState */

/** @param {readonly string[]} gaps @returns {Fact<null>} */
const unknown = (gaps) => Object.freeze({ known: false, value: null, gaps: Object.freeze([...new Set(gaps)].sort()) });
/** @template T @param {T} value @returns {Fact<T>} */
const known = (value) => Object.freeze({ known: true, value, gaps: Object.freeze([]) });

const placeKind = (/** @type {SeasonEngine} */ engine) => engine.bake.placeTree.kind;

/**
 * latitudeOf（卷二十 :334 latitudeDeg = 形心；§2.2 换算）：建筑地点取足迹各格中心 y 的平均（米，格边长 rules.grid.cellM），
 * 纬度 = rules.astro.latitudeOriginDeg + y ÷ rules.astro.metersPerDegreeNorth，定点运算。没有足迹的地点（区域足迹未建）未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @returns {Fact<number>}
 */
export function latitudeOf(engine, state, placeId) {
  void state;
  const cells = engine.bake.footprints.cellsOf(placeId);
  if (cells.length === 0) return unknown([GAP.latitude]);
  const n = BigInt(cells.length);
  const sumY = cells.reduce((/** @type {bigint} */ s, /** @type {{y: number}} */ c) => s + BigInt(c.y), 0n);
  // 格中心 = (y + ½) × cellM，平均 = (Σy + Σy + n) × cellM ÷ (n + n)。
  const centroidM = (fixedUnits(sumY + sumY + n) * fixedUnits(Number(ruleValue(engine.docData, GRID, CELL_M)))) / fixedUnits(n + n);
  const deg = fixedUnits(Number(ruleValue(engine.docData, ASTRO, ORIGIN_DEG))) + fixedDivide(centroidM, fixedUnits(Number(ruleValue(engine.docData, ASTRO, METERS_PER_DEG))));
  return known(fixedToNumber(deg));
}

/**
 * 天气单元（卷二十 :335 nearest(rel_contains, 挂单元组件类)）：[地点, …祖先] 中第一个挂 rules.season.cellClass 所指组件类的；没有即 null。
 * @param {SeasonEngine} engine @param {string} placeId @returns {string | null}
 */
export function cellOf(engine, placeId) {
  const cls = ruleValue(engine.docData, SEASON, CELL_CLASS);
  const rows = Object(Object(engine.registry.tables.get(placeKind(engine))).rows);
  for (const id of [placeId, ...engine.bake.placeTree.ancestorsOf(placeId)]) {
    const classes = Object(rows[id]).classes;
    if (Array.isArray(classes) && classes.includes(cls)) return id;
  }
  return null;
}

/**
 * normalizedPhase（卷二十 :690 半球归一）：太阳相位，纬度为负加二分之一后取小数部分；有理数 {num, den}。纬度未知即未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<Ratio>}
 */
export function normalizedPhase(engine, state, placeId, minute) {
  const lat = latitudeOf(engine, state, placeId);
  if (!lat.known) return unknown(lat.gaps);
  const p = astroView(engine).solarPhase(minute);
  if (!(Number(lat.value) < 0)) return known(p);
  const den = p.den + p.den;
  return known(Object.freeze({ num: (p.num + p.num + p.den) % den, den }));
}

/** 相位 a 落在 [from, to) 内（交叉乘，BigInt）。 @param {Ratio} a @param {Ratio} from @param {Ratio} to */
function within(a, from, to) {
  const lt = (/** @type {Ratio} */ x, /** @type {Ratio} */ y) => BigInt(x.num) * BigInt(y.den) < BigInt(y.num) * BigInt(x.den);
  return !lt(a, from) && lt(a, to);
}

/** 词表族里区间含相位的条目（只看过滤后的行；按代号序第一个）。 @param {SeasonEngine} engine @param {string} family @param {Ratio} phase @param {(e: Record<string, unknown>) => boolean} keep */
function rowAt(engine, family, phase, keep) {
  const entries = Object(Object(Object(engine.vocab).families)[family]).entries;
  if (!isObj(entries)) return null;
  for (const id of Object.keys(entries).sort()) {
    const e = entries[id];
    if (isObj(e) && keep(e) && isObj(e.phaseFrom) && isObj(e.phaseTo) && within(phase, Object(e.phaseFrom), Object(e.phaseTo))) return id;
  }
  return null;
}

/** 当日起始分钟的归一相位（env.season 按当日起始分钟取，卷二十 §2.7）。 @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute */
const dayPhase = (engine, state, placeId, minute) => normalizedPhase(engine, state, placeId, minute - systemTimeView(engine, minute).minuteOfDay);

/**
 * seasonAt（卷二十 :691）：地点所在单元 seasonScheme 下，区间 [phaseFrom, phaseTo) 含当日起始分钟归一相位的季节行；
 * 值 {season, growth, wetness, warmth}（三个数值维度读该行）。单元、方案、纬度读不到或没有行覆盖即未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<SeasonValue>}
 */
export function seasonAt(engine, state, placeId, minute) {
  const cell = cellOf(engine, placeId);
  if (cell === null) return unknown([GAP.cell]);
  let scheme;
  try { scheme = dim(engine, state, placeKind(engine), cell, SCHEME_DIM).value; } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return unknown([GAP.scheme]);
    throw e;
  }
  const phase = dayPhase(engine, state, placeId, minute);
  if (!phase.known || phase.value === null) return unknown(phase.gaps);
  const id = rowAt(engine, SEASON_FAMILY, phase.value, (e) => e.scheme === scheme);
  if (id === null) return unknown([GAP.seasonRow]);
  const row = Object(Object(Object(engine.vocab).families)[SEASON_FAMILY]).entries[id];
  const [growth, wetness, warmth] = SEASON_DIMS.map((d) => row[d]);
  if (![growth, wetness, warmth].every((v) => typeof v === 'number' && Number.isFinite(v))) return unknown([GAP.seasonRow]);
  return known(Object.freeze({ season: id, growth: Number(growth), wetness: Number(wetness), warmth: Number(warmth) }));
}

/**
 * solarTermAt（主会话 Q3 甲，卷二十勘误）：词表族 solar_term 中区间 [phaseFrom, phaseTo) 含当日起始分钟归一相位的行代号；
 * 半球归一后南半球的冬至行随本地冬至走。纬度读不到或没有行覆盖即未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<string>}
 */
export function solarTermAt(engine, state, placeId, minute) {
  const phase = dayPhase(engine, state, placeId, minute);
  if (!phase.known || phase.value === null) return unknown(phase.gaps);
  const id = rowAt(engine, TERM_FAMILY, phase.value, () => true);
  return id === null ? unknown([GAP.termRow]) : known(id);
}
