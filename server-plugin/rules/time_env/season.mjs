// 本地相位、季节、节气（卷二十 §2.7 :335、§4.4.3 :689–:691，S2-T1b 卷二十勘误：季节与节气按天气单元本地方案，不读纬度；S2-T1 草案 §4）。
// 季节与节气只读词表（族 season 按单元 seasonScheme 取行，族 solar_term 按单元 termScheme 取行）与规则表，规则层不认任何季节、节气、方案、地点代号。
// 天气单元 = 包含链上自地点起最近的、挂 rules.season.cellClass 所指组件类的地点（卷二十 :335）；本地相位 = 世界太阳相位 + 单元 phaseOffset 取小数（S2-T1b）。
// 加一个地区只加数据：单元行填 seasonScheme、termScheme、phaseOffset，需要时加方案行。
// 时刻的日起点取日历模块 systemTimeView（日内切分只在 calendar.mjs）。纯函数，不写 state；返回 Fact {known, value, gaps}，读不到即 known 假加缺口，不兜底。

import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { ruleValue } from '../load/registry.mjs';
import { astroView, systemTimeView } from './calendar.mjs';

const SEASON = 'season';
const CELL_CLASS = 'cellClass';
const SCHEME_DIM = 'seasonScheme';
const TERM_SCHEME_DIM = 'termScheme';
const OFFSET_DIM = 'phaseOffset';
const SEASON_FAMILY = 'season';
const TERM_FAMILY = 'solar_term';
// 季节行跨方案通用的三个数值维度（卷二十 §2.6 :301–:303、:693）。
const SEASON_DIMS = Object.freeze(['growth', 'wetness', 'warmth']);
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const GAP = Object.freeze({ cell: 'weather_cell', offset: 'phase_offset', scheme: 'season_scheme', termScheme: 'term_scheme', seasonRow: 'season_row', termRow: 'solar_term_row' });

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
/** 读数：known 假时 value 为 null、gaps 列缺口代号。 @template T @typedef {Readonly<{known: boolean, value: T | null, gaps: readonly string[]}>} Fact */
/** @typedef {{num: number, den: number}} Ratio */
/** @typedef {{season: string, growth: number, wetness: number, warmth: number}} SeasonValue */
/** 本模块读的 engine 字段：日历模块所读的、加上包含树。 @typedef {import('./calendar.mjs').CalendarEngine & import('../place/zone.mjs').ZoneEngine} SeasonEngine */
/** @typedef {import('./calendar.mjs').TimeState} TimeState */

/** @param {readonly string[]} gaps @returns {Fact<null>} */
const unknown = (gaps) => Object.freeze({ known: false, value: null, gaps: Object.freeze([...new Set(gaps)].sort()) });
/** @template T @param {T} value @returns {Fact<T>} */
const known = (value) => Object.freeze({ known: true, value, gaps: Object.freeze([]) });

const placeKind = (/** @type {SeasonEngine} */ engine) => engine.bake.placeTree.kind;

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

/** 单元行上的维度值；读不到（onUnknown gap）即未知带缺口 gap。 @param {SeasonEngine} engine @param {TimeState} state @param {string} cell @param {string} name @param {string} gap @returns {Fact<unknown>} */
function cellDim(engine, state, cell, name, gap) {
  try { return known(dim(engine, state, placeKind(engine), cell, name).value); } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return unknown([gap]);
    throw e;
  }
}

/**
 * localPhase（S2-T1b，卷二十 :690 勘误：半球归一改为单元偏移）：地点所在天气单元的本地太阳相位 =
 * frac(世界太阳相位 + 单元 phaseOffset)，有理数 {num, den}（已约分），全程 BigInt。单元或偏移读不到即未知，不兜底。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<Ratio>}
 */
export function localPhase(engine, state, placeId, minute) {
  const cell = cellOf(engine, placeId);
  if (cell === null) return unknown([GAP.cell]);
  const off = cellDim(engine, state, cell, OFFSET_DIM, GAP.offset);
  if (!off.known) return unknown(off.gaps);
  const o = Object(off.value);
  const p = astroView(engine).solarPhase(minute);
  const den = BigInt(p.den) * BigInt(o.den);
  const num = (BigInt(p.num) * BigInt(o.den) + BigInt(o.num) * BigInt(p.den)) % den;
  let x = num; let y = den;
  while (y !== 0n) [x, y] = [y, x % y];
  const r = { num: num / x, den: den / x };
  if (r.den > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(`localPhase: ${OFFSET_DIM} denominator too large for ${cell}`);
  return known(Object.freeze({ num: Number(r.num), den: Number(r.den) }));
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

/** 当日起始分钟的本地相位（env.season 按当日起始分钟取，卷二十 §2.7）。 @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute */
const dayPhase = (engine, state, placeId, minute) => localPhase(engine, state, placeId, minute - systemTimeView(engine, minute).minuteOfDay);

/**
 * seasonAt（卷二十 :691）：地点所在单元 seasonScheme 下，区间 [phaseFrom, phaseTo) 含当日起始分钟本地相位的季节行；
 * 值 {season, growth, wetness, warmth}（三个数值维度读该行）。单元、方案、偏移读不到或没有行覆盖即未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<SeasonValue>}
 */
export function seasonAt(engine, state, placeId, minute) {
  const cell = cellOf(engine, placeId);
  if (cell === null) return unknown([GAP.cell]);
  const scheme = cellDim(engine, state, cell, SCHEME_DIM, GAP.scheme);
  if (!scheme.known) return unknown(scheme.gaps);
  const phase = dayPhase(engine, state, placeId, minute);
  if (!phase.known || phase.value === null) return unknown(phase.gaps);
  const id = rowAt(engine, SEASON_FAMILY, phase.value, (e) => e.scheme === scheme.value);
  if (id === null) return unknown([GAP.seasonRow]);
  const row = Object(Object(Object(engine.vocab).families)[SEASON_FAMILY]).entries[id];
  const [growth, wetness, warmth] = SEASON_DIMS.map((d) => row[d]);
  if (![growth, wetness, warmth].every((v) => typeof v === 'number' && Number.isFinite(v))) return unknown([GAP.seasonRow]);
  return known(Object.freeze({ season: id, growth: Number(growth), wetness: Number(wetness), warmth: Number(warmth) }));
}

/**
 * solarTermAt（主会话 Q3 甲，卷二十勘误；S2-T1b）：地点所在单元 termScheme 下，词表族 solar_term 中区间 [phaseFrom, phaseTo) 含当日起始分钟本地相位的行代号
 * （与 seasonAt 同一写法按方案过滤）。单元、方案、偏移读不到或没有行覆盖即未知。
 * @param {SeasonEngine} engine @param {TimeState} state @param {string} placeId @param {number} minute @returns {Fact<string>}
 */
export function solarTermAt(engine, state, placeId, minute) {
  const cell = cellOf(engine, placeId);
  if (cell === null) return unknown([GAP.cell]);
  const scheme = cellDim(engine, state, cell, TERM_SCHEME_DIM, GAP.termScheme);
  if (!scheme.known) return unknown(scheme.gaps);
  const phase = dayPhase(engine, state, placeId, minute);
  if (!phase.known || phase.value === null) return unknown(phase.gaps);
  const id = rowAt(engine, TERM_FAMILY, phase.value, (e) => e.scheme === scheme.value);
  return id === null ? unknown([GAP.termRow]) : known(id);
}
