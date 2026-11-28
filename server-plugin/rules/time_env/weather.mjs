// 天气单元的当日天气（卷二十 §4.3.3 第 2–4 条 :636–:642、§2.5 :276–:288、§2.7 comp_weather_cell；S2-T2 草案 §2）。
// 单元 c 第 d 日的天气是（世界种子, c, d, 单元值）的纯函数：不写 state、不进 saveDigest、不缓存、不发事件（卷二十 :462、:636、:652；主会话 Q10 甲）。
// 只读词表族 weather 各行字段、规则表 weather 与 climateProto、单元行维度；规则层不认任何天气行、单元、原型代号。读不到即 null 加缺口，不兜底。
// 相位只调 season.mjs#localPhase，季节曲线取值只调 kernel/dimensions.mjs#lookupCurve（插值在 det-math#fixedCurveAt），抽样只调 rules/gen/sample.mjs#drawByKey。
// 降水相态、气温、积雪、现象、干预、地点一级覆盖不在本卡（主会话 Q7）。

import { KernelError } from '../../kernel/errors.mjs';
import { dim, presentEntries, lookupCurve } from '../../kernel/dimensions.mjs';
import { readPath } from '../../kernel/storage.mjs';
import { evaluateRX } from '../../kernel/rx.mjs';
import { GRAMMAR_TOKENS } from '../../kernel/handles.mjs';
import { fixedUnits, fixedScale, fixedToNumber } from '../../kernel/det-math.mjs';
import { ruleValue, ruleRow } from '../load/registry.mjs';
import { drawByKey } from '../gen/sample.mjs';
import { rxScopeOf, compileRuleRX } from '../load/rx-compile.mjs';
import { minutesPerDay } from './calendar.mjs';
import { localPhase } from './season.mjs';

const FAMILY = 'weather';
const RULES = 'weather';
const PROTO_TABLE = 'climateProto';
const GRID = 'grid';
const FULL_TURN_DEG = 'fullTurnDeg';
// 天气单元行的维度（卷二十 §2.7 :359–:364；climateProto 李白 11-19 15:5x ⑤）。
const DIM = Object.freeze({ commonality: 'weatherCommonality', proto: 'climateProto', wind: 'prevailingWindDeg' });
// 天气行字段（卷二十 §2.5）与原型行字段。
const ROW = Object.freeze({ rx: 'weightRX', persistence: 'persistence', precip: 'precipMm', windSpeed: 'windMps', spread: 'windDirSpreadDeg' });
const SEASON_CURVE = 'seasonCurve';
// 规则表 weather 的键（卷二十 §2.9 :395）。
const RULE = Object.freeze({ anchorDays: 'anchorDays', weightScale: 'weightScale', persistBase: 'persistBase' });
// weightRX 的两个命名空间读数（state-owners rxNamespaces；卷二十 §2.5 :276）。
const NS = Object.freeze({ phase: 'env.solarPhase', curve: 'env.seasonCurve' });
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const REF_MISSING = 'E-DIM-REF-MISSING';
const GAP = Object.freeze({
  commonality: 'weather_commonality', proto: 'weather_climate_proto', weightRX: 'weather_weight_rx', zero: 'weather_weights_zero',
  precip: 'weather_precip', windSpeed: 'weather_wind_speed', windDir: 'weather_wind_dir', cloud: 'weather_cloud', humidity: 'weather_humidity',
});
// 当日量中直接取行字段的两项（卷二十 :642 humidity、§2.5 cloud）：输出键、行字段、缺口。
const ROW_FIELDS = Object.freeze([
  Object.freeze({ key: 'cloud', field: 'cloud', gap: GAP.cloud }),
  Object.freeze({ key: 'humidity', field: 'humidity', gap: GAP.humidity }),
]);

/** env.seasonCurve 的读数键（命名空间与天气行以路径分隔符相连，同 rx.mjs 读数键写法）。 @param {string} row */
const curveKey = (row) => [NS.curve, row].join(GRAMMAR_TOKENS.pathSep);
const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNum = (/** @type {unknown} */ v) => typeof v === 'number' && Number.isFinite(v);
/** @template T @typedef {import('./season.mjs').Fact<T>} Fact */
/** @typedef {import('./calendar.mjs').TimeState} TimeState */
/** @typedef {Readonly<{trees: Readonly<Record<string, unknown>>}>} CompiledWeather */
/** 本模块读的 engine 字段：季节模块所读的、种子路径句柄、编好的 weightRX（engine.weather）、摘要能力。 @typedef {import('./season.mjs').SeasonEngine & import('../gen/sample.mjs').SampleEngine & {P: Readonly<Record<string, Function>>, weather: CompiledWeather | null}} WeatherEngine */
/** @typedef {{state: string, precipMm: number | null, windMps: number | null, windDirDeg: number | null, cloud: number | null, humidity: number | null, gaps: readonly string[]}} WeatherDay */

/** @param {readonly string[]} gaps @returns {Fact<null>} */
const unknown = (gaps) => Object.freeze({ known: false, value: null, gaps: Object.freeze([...new Set(gaps)].sort()) });

/** 词表族 weather 的条目（代号 → 行）。 @param {{vocab?: unknown}} engine @returns {Record<string, Record<string, unknown>>} */
const rowsOf = (engine) => {
  const entries = Object(Object(Object(engine.vocab).families)[FAMILY]).entries;
  return isObj(entries) ? entries : {};
};

/**
 * compileWeather（装配期，主会话 Q1 甲；卷二 §2.9 第 4 条数据档 RX 在加载处编）：词表族 weather 各行 weightRX 经公共部件 checkValue 的 rx 类型编译，
 * 变量域为天气单元所在地点表的维度与已登记命名空间（卷二十 :276）。编不过即 E-MOD-RX；行上没写 weightRX 的不编，求当日天气时按缺口处置。
 * @param {{registry: {tables: Map<string, unknown>}, docData: Parameters<typeof ruleValue>[0] & {owners?: unknown}, vocab: unknown, bake: {placeTree: {kind: string}}}} world @returns {CompiledWeather}
 */
export function compileWeather(world) {
  const { registry, docData, vocab, bake } = world;
  const scope = rxScopeOf({ vocab, docData });
  const dims = new Map(Object.entries(Object(Object(registry.tables.get(bake.placeTree.kind)).dimensions)));
  /** @type {Record<string, unknown>} */
  const trees = {};
  for (const [id, row] of Object.entries(rowsOf({ vocab }))) {
    if (!isObj(row) || row[ROW.rx] === undefined || row[ROW.rx] === null) continue;
    trees[id] = compileRuleRX(scope, row[ROW.rx], dims, `${FAMILY}.${id}.${ROW.rx}`, 'E-MOD-RX');
  }
  return Object.freeze({ trees: Object.freeze(trees) });
}

/** 单元行上的维度值；读不到（onUnknown gap）为 undefined。 @param {WeatherEngine} engine @param {TimeState} state @param {string} cell @param {string} name */
function cellDim(engine, state, cell, name) {
  try { return dim(engine, state, engine.bake.placeTree.kind, cell, name).value; } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return undefined;
    throw e;
  }
}

/** 单元所引气候原型的季节曲线（天气行 → 曲线）；没引或原型未建为 null。 @param {WeatherEngine} engine @param {TimeState} state @param {string} cell */
function seasonCurvesOf(engine, state, cell) {
  const proto = cellDim(engine, state, cell, DIM.proto);
  if (typeof proto !== 'string') return null;
  let row;
  try { row = ruleRow(engine.docData, PROTO_TABLE, proto); } catch (e) {
    if (e instanceof KernelError && e.code === REF_MISSING) return null;
    throw e;
  }
  const curves = Object(row)[SEASON_CURVE];
  return isObj(curves) ? curves : null;
}

/**
 * 某日各天气行的权重（卷二十 §4.3.3 第 3 条 :641）：w_s = commonality[s] × weightRX_s 的定点值 × weightScale ÷ 定点标度，整数。
 * weightRX 的读数：env.solarPhase = 该日起始分钟的单元本地相位；env.seasonCurve.<行> = 原型该行季节曲线在该相位的值。
 * @returns {{weights: Record<string, bigint>} | {gaps: string[]}}
 */
function weightsOn(/** @type {WeatherEngine} */ engine, /** @type {TimeState} */ state, /** @type {string} */ cell, /** @type {Record<string, unknown>} */ common, /** @type {Record<string, unknown>} */ curves, /** @type {number} */ dayStart) {
  const phase = localPhase(engine, state, cell, dayStart);
  if (!phase.known || phase.value === null) return { gaps: [...phase.gaps] };
  const x = (BigInt(phase.value.num) * fixedScale()) / BigInt(phase.value.den);
  /** @type {Record<string, number>} */
  const reads = { [NS.phase]: fixedToNumber(x) };
  for (const [row, curve] of Object.entries(curves)) reads[curveKey(row)] = fixedToNumber(lookupCurve(curve, x));
  const scale = BigInt(Number(ruleValue(engine.docData, RULES, RULE.weightScale)));
  // 缺读数：缺的是原型季节曲线即 weather_climate_proto（place.json climateProto 的 onUnknown 说明），其余读数缺记 weather_weight_rx。
  const readGap = (/** @type {string} */ key) => (key.startsWith(curveKey('')) ? GAP.proto : GAP.weightRX);
  const trees = Object(Object(engine.weather).trees);
  /** @type {Record<string, bigint>} */
  const weights = {};
  let total = 0n;
  for (const id of Object.keys(rowsOf(engine)).sort()) {
    const c = common[id];
    if (!Number.isSafeInteger(c) || c === 0) { weights[id] = 0n; continue; }
    if (!Object.hasOwn(trees, id)) return { gaps: [GAP.weightRX] };
    let v;
    try { v = evaluateRX(trees[id], {}, reads); } catch (e) {
      if (e !== null && typeof e === 'object' && typeof Object(e).key === 'string') return { gaps: [readGap(String(Object(e).key))] };
      throw e;
    }
    if (!isNum(v) || v < 0) throw new KernelError('E-WX-WEIGHT', {}, `${FAMILY}.${id}.${ROW.rx}: result must be a number >= 0`);
    weights[id] = (BigInt(Number(c)) * fixedUnits(v) * scale) / fixedScale();
    total += weights[id];
  }
  return total > 0n ? { weights } : { gaps: [GAP.zero] };
}

/** 权重表转成 categorical 分布（卷二 :334：非负整数映射）。 @param {Record<string, bigint>} w */
function categorical(w) {
  /** @type {Record<string, number>} */
  const weights = {};
  for (const [k, v] of Object.entries(w)) {
    if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new KernelError('E-WX-WEIGHT', {}, `${FAMILY}.${k}: weight exceeds the safe integer range`);
    weights[k] = Number(v);
  }
  return { dist: 'categorical', weights };
}

/** 状态行字段上的分布抽一个值；字段缺即 null。 @returns {number | null} */
function drawQty(/** @type {unknown} */ d, /** @type {() => number | string} */ draw) {
  if (!isObj(d)) return null;
  const v = draw();
  return typeof v === 'number' ? v : null;
}

/**
 * weatherAt（卷二十 §4.3.3 第 2–4 条）：天气单元 cellId 第 day 日（systemTimeView 的世界日序）的天气。
 * 递推：段首 = day − day mod anchorDays，段首日按权重抽；段内第 k 日与前一日相同的状态权重乘该行 persistence、其余乘 persistBase（:637）；
 * 每步一次 drawByKey（对象段为单元、时刻为该日起始分钟）。当日量：降水量、风速按该行分布各自抽取，风向 = 单元 prevailingWindDeg + [−spread, +spread] 内均匀偏角
 * 取模一整周（spread 为 0 时偏角为 0、不抽，主会话 Q6 甲），cloud、humidity 取行字段。某量读不到即 null、缺口进 value.gaps。
 * @param {WeatherEngine} engine @param {TimeState} state @param {string} cellId @param {number} day @returns {Fact<WeatherDay>}
 */
export function weatherAt(engine, state, cellId, day) {
  if (!Number.isSafeInteger(day) || day < 0) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'weatherAt: day must be a non-negative integer');
  const common = cellDim(engine, state, cellId, DIM.commonality);
  if (!isObj(common)) return unknown([GAP.commonality]);
  const curves = seasonCurvesOf(engine, state, cellId);
  if (curves === null) return unknown([GAP.proto]);
  const anchor = Number(ruleValue(engine.docData, RULES, RULE.anchorDays));
  const persistBase = BigInt(Number(ruleValue(engine.docData, RULES, RULE.persistBase)));
  const perDay = minutesPerDay(engine);
  const seed = Number(readPath(state, engine.P.genesis_worldSeed()));
  const rows = rowsOf(engine);
  /** @type {Record<string, unknown>} */
  const commonMap = Object.fromEntries(presentEntries(common));
  let prev = '';
  for (let k = day - (day % anchor); k <= day; k += 1) {
    const w = weightsOn(engine, state, cellId, commonMap, curves, k * perDay);
    if (!('weights' in w)) return unknown(w.gaps);
    if (k > day - (day % anchor)) {
      for (const id of Object.keys(w.weights)) {
        const p = id === prev ? BigInt(Number(rows[id][ROW.persistence])) : persistBase;
        w.weights[id] *= p;
      }
    }
    prev = String(drawByKey('weather', 'weather_state', engine, seed, cellId, k * perDay, categorical(w.weights)));
  }
  const s = prev;
  const row = rows[s];
  const t = day * perDay;
  /** @type {string[]} */
  const gaps = [];
  const precipMm = drawQty(row[ROW.precip], () => drawByKey('weather', 'weather_precip', engine, seed, cellId, t, row[ROW.precip]));
  if (precipMm === null) gaps.push(GAP.precip);
  const windMps = drawQty(row[ROW.windSpeed], () => drawByKey('weather', 'weather_windSpeed', engine, seed, cellId, t, row[ROW.windSpeed]));
  if (windMps === null) gaps.push(GAP.windSpeed);
  const windDirDeg = windDirOf(engine, state, cellId, row, seed, t);
  if (windDirDeg === null) gaps.push(GAP.windDir);
  /** @type {Record<string, number | null>} */
  const fields = {};
  for (const f of ROW_FIELDS) {
    fields[f.key] = isNum(row[f.field]) ? Number(row[f.field]) : null;
    if (fields[f.key] === null) gaps.push(f.gap);
  }
  return Object.freeze({
    known: true,
    value: Object.freeze({ state: s, precipMm, windMps, windDirDeg, cloud: fields.cloud, humidity: fields.humidity, gaps: Object.freeze(gaps.sort()) }),
    gaps: Object.freeze([]),
  });
}

/**
 * 当日风向（卷二十 :287）：(单元 prevailingWindDeg + 偏角) 取模一整周（rules.grid.fullTurnDeg），偏角在 [−spread, +spread] 内均匀抽；spread 为 0 区间退化为一点、偏角 0。
 * 盛行风或 spread 读不到即 null。定点运算，结果折回数。
 * @returns {number | null}
 */
function windDirOf(/** @type {WeatherEngine} */ engine, /** @type {TimeState} */ state, /** @type {string} */ cell, /** @type {Record<string, unknown>} */ row, /** @type {number} */ seed, /** @type {number} */ t) {
  const base = cellDim(engine, state, cell, DIM.wind);
  const spread = row[ROW.spread];
  if (!isNum(base) || !isNum(spread)) return null;
  const offset = spread === 0 ? 0 : Number(drawByKey('weather', 'weather_windDir', engine, seed, cell, t, { dist: 'uniform', min: -spread, max: spread }));
  const turn = fixedUnits(Number(ruleValue(engine.docData, GRID, FULL_TURN_DEG)));
  const v = (((fixedUnits(base) + fixedUnits(offset)) % turn) + turn) % turn;
  return fixedToNumber(v);
}
