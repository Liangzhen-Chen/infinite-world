// 季节与温度（卷二十《时间日历天气与环境》§4.4 季节词表与联动、§4.5 温度量纲与热交换；§2.6 season、§2.7 env.* 键、§2.9 rules.climate）。
// 块 6 第 6-28 张《卷二十历法与温度前移》（李白 11-19 12:4x 丙6：前移 §4.5 温度规则子集，30 日食物要会坏；丙7：§4.2 历法与季节）。
// 前移的入口：seasonAt（env.season）、seasonDimension（clock.season.<维度>）、normalizedSolarPhase（env.solarPhase 半球归一）、climateTempC（env.climateTempC）、
// seasonSwingC（§4.5.3 第 1 条第二项）、outdoorTemp、groundTemp（第 2 条）、indoorTemp（第 3 条）、tempAt（分支规则 + 第 4 条"未知不兜底"）。
// 未前移（登记在 rules.climate.unbuilt、rules.season.unbuilt、rules.astro.unbuilt）：日照 daylightMinutes（返回未知）、feltTempC、天气 §4.3（云量与当日偏移由调用方交入，
// 没交即该项列入缺口并标 partial，不当 0）、地点热源功率的四条状态路径（由调用方交入合计值；没交即未知）、envAt 对地点表的读取（地点表归 6-7，入口收已解出的地点输入）。
// 读数是 Fact 形：{known, applicable, value（JS 数，由定点转出）, fixed（定点 BigInt，标度 SCALE）, unit, partial, gaps}；未知时 known 为假并带 gaps，同时按 W-DIM-GAP 报缺口。
// 全程定点整数（det-math）；三角只经 det-math 的 sinTurns/cosTurns；不认任何地点、季节或气候区的代号；字串字面量只有 ASCII。

import { KernelError } from './errors.mjs';
import { report } from './report.mjs';
import { minutesPerDay } from './scheduler.mjs';
import { astroView } from './calendar.mjs';
import { fixedUnits, fixedMultiply, fixedDivide, fixedToNumber, fixedScale, sinTurns, cosTurns, sinMeanTurns } from './det-math.mjs';
import { lookupCurve } from './dimensions.mjs';

const SCHEMA = Object.freeze({
  seasonFamily: 'season',
  climateTable: 'climate',
  astroTable: 'astro',
  unitCelsius: 'celsius',
  unitWattPerK: 'W_per_K',
  unitWatt: 'W',
  facilityTable: 'facility',
  heatParts: Object.freeze(['fields', 'burning', 'facilities', 'occupants']),
  gapSide: 'env',
  dims: Object.freeze(['growth', 'wetness', 'warmth']),
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const present = (v) => v !== undefined && v !== null;

// 缺口代号（report 字段值与 Fact.gaps 同用，均为小写下划线代号）。
const GAP = Object.freeze({
  latitude: 'latitude_deg',
  scheme: 'season_scheme',
  seasonRow: 'season_row',
  cellMean: 'cell_annual_mean_temp',
  cellAmp: 'cell_temp_amp',
  cellDiurnal: 'cell_diurnal_amp',
  elevation: 'elevation_inputs',
  gradient: 'elevation_temp_gradient',
  geothermal: 'geothermal_gradient',
  dampCurve: 'ground_damp_curve',
  depth: 'depth_m',
  lag: 'thermal_lag_phase',
  flags: 'enclosed_underground_flags',
  ua: 'envelope_ua',
  heat: 'heat_power',
  diurnal: 'diurnal_term',
  weatherOffset: 'weather_temp_offset',
  daylight: 'daylight_minutes',
  uaArea: 'envelope_area_m2',
  uaAperture: 'envelope_aperture',
  uaConductivity: 'envelope_conductivity_sum',
  uaThickness: 'wall_thickness_m',
  uaOpening: 'opening_w_per_m2k',
});

const unknownFact = (gaps) => {
  const list = [...new Set(gaps)].sort();
  for (const g of list) report('W-DIM-GAP', { side: SCHEMA.gapSide, field: g });
  return Object.freeze({ known: false, applicable: true, gaps: Object.freeze(list) });
};
const knownFact = (fixed, gaps = [], unit = SCHEMA.unitCelsius) => Object.freeze({
  known: true, applicable: true, value: fixedToNumber(fixed), fixed, unit,
  partial: gaps.length > 0, gaps: Object.freeze([...gaps].sort()),
});

const scale8 = () => fixedScale() * fixedScale();
// 定点值 × 10⁸ 标度的三角值 → 定点（向零截断）。
const timesTrig = (fixed, trig8) => (fixed * trig8) / scale8();

function table(engine, name) {
  const t = engine.rules && engine.rules[name];
  if (!isObj(t)) throw new KernelError('E-RULES-UNREGISTERED', {}, `rules.${name} is not registered`);
  return t;
}

// ---------- 太阳相位与季节（§4.4.3） ----------

/**
 * `env.solarPhase`（§2.7、§4.4.3 第 1、2 条）：半球归一后的太阳相位，有理数 {num, den}（0 <= num < den）。纬度为负的地点加二分之一后取小数部分。
 * 纬度未知即未知。
 * @param {any} engine @param {{latitudeDeg?: number | null}} input @param {number} minute
 */
export function normalizedSolarPhase(engine, input, minute) {
  if (!present(input.latitudeDeg)) return unknownFact([GAP.latitude]);
  const phase = astroView(engine).solarPhase(minute);
  if (!(input.latitudeDeg < 0)) return Object.freeze({ known: true, applicable: true, num: phase.num, den: phase.den });
  // 加二分之一：(num ÷ den + 1 ÷ 2) = (2·num + den) ÷ 2·den，再对 1 取小数部分。
  const den = phase.den + phase.den;
  const num = (phase.num + phase.num + phase.den) % den;
  return Object.freeze({ known: true, applicable: true, num, den });
}

const crossLess = (a, b) => a.num * b.den < b.num * a.den;

/**
 * `env.season`（§4.4.3 第 3 条）：地点单元 seasonScheme 下，区间 [phaseFrom, phaseTo) 含当日起始分钟的归一相位的那一行（词表族 season）。
 * 方案缺（schemeRules 无数据，单元须显式指定）或没有行覆盖即未知。
 * @param {any} engine @param {{latitudeDeg?: number | null, cell?: {seasonScheme?: string | null}}} input @param {number} minute
 */
export function seasonAt(engine, input, minute) {
  const scheme = isObj(input.cell) ? input.cell.seasonScheme : undefined;
  if (!present(scheme)) return unknownFact([GAP.scheme]);
  const dayStart = Math.floor(minute / minutesPerDay(engine)) * minutesPerDay(engine);
  const phase = normalizedSolarPhase(engine, input, dayStart);
  if (!phase.known) return phase;
  for (const [id, rec] of engine.vocab.index) {
    if (rec.family !== SCHEMA.seasonFamily || rec.entry.scheme !== scheme) continue;
    const e = rec.entry;
    if (!crossLess(phase, e.phaseTo)) continue;
    if (crossLess(phase, e.phaseFrom)) continue;
    return Object.freeze({ known: true, applicable: true, value: id });
  }
  return unknownFact([GAP.seasonRow]);
}

/**
 * 季节行的数值维度（growth、wetness、warmth；§2.6、§4.4.3 第 6 条）：对外只给数值维度。行上没写（无出处，登记在 rules.season.unbuilt）即未知。
 * @param {any} engine @param {string} seasonId @param {string} dimension
 */
export function seasonDimension(engine, seasonId, dimension) {
  const rec = engine.vocab.index.get(seasonId);
  if (!rec || rec.family !== SCHEMA.seasonFamily) throw new KernelError('E-DIM-REF-MISSING', {}, `${String(seasonId)} is not a season entry`);
  if (!SCHEMA.dims.includes(dimension)) throw new KernelError('E-DIM-REF-MISSING', {}, `season dimension ${String(dimension)} is not one of ${SCHEMA.dims.join(', ')}`);
  const v = rec.entry[dimension];
  if (!present(v)) return unknownFact([`${dimension}_${seasonId}`]);
  return Object.freeze({ known: true, applicable: true, value: v, fixed: fixedUnits(v) });
}

/** `env.daylightMinutes`（§4.4.3 第 4 条）：日照公式（赤纬、纬度上限 polarLatitudeCapDeg）无出处、未前移，一律未知（登记在 rules.astro.unbuilt）。 */
export function daylightMinutes() {
  return unknownFact([GAP.daylight]);
}

// ---------- 温度（§4.5.3） ----------

/**
 * `env.climateTempC`（§2.7）：单元 annualMeanTempC + rules.climate.elevationTempGradient ×（地点 surfaceRefElevationM − 单元所在地点 elevationM）。
 * 海拔修正全书只在这里做一次（§4.5.3 第 1 条第一项）。任一输入缺即未知。
 * @param {any} engine @param {{surfaceRefElevationM?: number | null, cellElevationM?: number | null, cell?: {annualMeanTempC?: number | null}}} input
 */
export function climateTempC(engine, input) {
  const gaps = [];
  const cell = isObj(input.cell) ? input.cell : {};
  if (!present(cell.annualMeanTempC)) gaps.push(GAP.cellMean);
  if (!present(input.surfaceRefElevationM) || !present(input.cellElevationM)) gaps.push(GAP.elevation);
  const t = table(engine, SCHEMA.climateTable);
  if (!present(t.elevationTempGradient)) gaps.push(GAP.gradient);
  if (gaps.length > 0) return unknownFact(gaps);
  const rise = fixedUnits(input.surfaceRefElevationM) - fixedUnits(input.cellElevationM);
  return knownFact(fixedUnits(cell.annualMeanTempC) + fixedMultiply(fixedUnits(t.elevationTempGradient), rise));
}

// 季节摆动项（§4.5.3 第 1 条）：tempAmpC × sin(2π ×（归一相位 − thermalLagPhase))；返回 { fixed } 或未知 Fact。
function swingFixed(engine, input, minute) {
  const cell = isObj(input.cell) ? input.cell : {};
  if (!present(cell.tempAmpC)) return unknownFact([GAP.cellAmp]);
  const a = table(engine, SCHEMA.astroTable);
  if (!isObj(a.thermalLagPhase)) return unknownFact([GAP.lag]);
  const phase = normalizedSolarPhase(engine, input, minute);
  if (!phase.known) return phase;
  const lag = a.thermalLagPhase;
  const trig = sinTurns(phase.num * lag.den - lag.num * phase.den, phase.den * lag.den);
  return { fixed: timesTrig(fixedUnits(cell.tempAmpC), trig) };
}

/**
 * 季节摆动项（§4.5.3 第 1 条第二项）：北半球在归一相位 3/4 + thermalLagPhase 取最小 −tempAmpC，1/4 + thermalLagPhase 取最大 +tempAmpC。
 * @param {any} engine @param {any} input @param {number} minute
 */
export function seasonSwingC(engine, input, minute) {
  const s = swingFixed(engine, input, minute);
  return s.known === false ? s : knownFact(s.fixed);
}

/**
 * 室外一支（§4.5.3 第 1 条）：四项相加：常年气温 + 季节摆动 + 昼夜摆动 + 当日天气偏移。
 * 昼夜项 diurnalAmpC × (1 − cloud × cloudDamp) × cos(2π × (地方时 − diurnalPeakMinute) ÷ 一日分钟)：要 input.weather.cloud 与 rules.climate 的 cloudDamp、diurnalPeakMinute；
 * 当日天气偏移要 input.weather.tempOffsetC。当日天气量由 kernel/weather.mjs 的 weatherAt 给（交入 input.weather）；缺哪项（天气未知、cloudDamp 无出处）就把哪项列入缺口、结果标 partial（不当 0、不拿别项顶替）；常年气温或季节摆动缺则整体未知。
 * 地方时取世界分钟对一日取余（minutesPerMeterEast 首版为 0，卷二十 §2.2 :217）。
 * @param {any} engine @param {any} input @param {number} minute
 */
export function outdoorTemp(engine, input, minute) {
  const base = climateTempC(engine, input);
  if (!base.known) return base;
  const swing = swingFixed(engine, input, minute);
  if (swing.known === false) return swing;
  let sum = base.fixed + swing.fixed;
  const gaps = [];
  checkEast(engine);
  const t = table(engine, SCHEMA.climateTable);
  const cell = isObj(input.cell) ? input.cell : {};
  const wx = isObj(input.weather) ? input.weather : {};
  const canDiurnal = present(cell.diurnalAmpC) && present(wx.cloud) && present(t.cloudDamp) && present(t.diurnalPeakMinute);
  if (canDiurnal) {
    const calm = fixedUnits(1) - fixedMultiply(fixedUnits(wx.cloud), fixedUnits(t.cloudDamp));
    const amp = fixedMultiply(fixedUnits(cell.diurnalAmpC), calm);
    const perDay = minutesPerDay(engine);
    sum += timesTrig(amp, cosTurns(minute - t.diurnalPeakMinute, perDay));
  } else gaps.push(GAP.diurnal);
  if (present(wx.tempOffsetC)) sum += fixedUnits(wx.tempOffsetC);
  else gaps.push(GAP.weatherOffset);
  return knownFact(sum, gaps);
}

/**
 * 地下一支（§4.5.3 第 2 条）：地下基准 = env.climateTempC + 季节摆动项 × groundDampCurve(depthM) + geothermalGradient × depthM。昼夜与当日天气传不到地下，不计。
 * groundDampCurve（无出处，登记在 rules.climate.unbuilt）、geothermalGradient、depthM 任一缺即未知。
 * @param {any} engine @param {any} input @param {number} minute
 */
export function groundTemp(engine, input, minute) {
  const base = climateTempC(engine, input);
  if (!base.known) return base;
  const t = table(engine, SCHEMA.climateTable);
  const gaps = [];
  if (!present(input.depthM)) gaps.push(GAP.depth);
  if (!Array.isArray(t.groundDampCurve)) gaps.push(GAP.dampCurve);
  if (!present(t.geothermalGradient)) gaps.push(GAP.geothermal);
  if (gaps.length > 0) return unknownFact(gaps);
  const swing = swingFixed(engine, input, minute);
  if (swing.known === false) return swing;
  const depth = fixedUnits(input.depthM);
  const damp = lookupCurve({ points: t.groundDampCurve }, depth);
  return knownFact(base.fixed + fixedMultiply(swing.fixed, damp) + fixedMultiply(fixedUnits(t.geothermalGradient), depth));
}

/**
 * 围护一支（§4.5.3 第 3 条）：室内 = 外侧基准 + 地点热源功率 ÷ envelopeUaWPerK；外侧基准 underground 为真取地下基准，否则取室外温度。
 * 散热能力未知 → 未知，不拿外侧基准代替（第 4 条）；热源功率没交入（四条状态路径的合计在调用方）也未知。
 * @param {any} engine @param {any} input @param {number} minute
 */
export function indoorTemp(engine, input, minute) {
  // 散热能力：调用方交入现成的 envelopeUaWPerK，或交入 envelope 结构由 envelopeUaWPerK 按卷十九 §4.1 规则 4 算；热源功率同样，heatPowerW 或 heatSources。
  let ua;
  if (present(input.envelopeUaWPerK)) ua = knownFact(fixedUnits(input.envelopeUaWPerK), [], SCHEMA.unitWattPerK);
  else ua = isObj(input.envelope) ? envelopeUaWPerK(engine, input.envelope) : unknownFact([GAP.ua]);
  let heat;
  if (present(input.heatPowerW)) heat = knownFact(fixedUnits(input.heatPowerW), [], SCHEMA.unitWatt);
  else heat = isObj(input.heatSources) ? heatPowerW(input.heatSources) : unknownFact([GAP.heat]);
  const gaps = [...(ua.known ? [] : ua.gaps), ...(heat.known ? [] : heat.gaps)];
  if (gaps.length > 0) return unknownFact(gaps);
  const outside = input.underground === true ? groundTemp(engine, input, minute) : outdoorTemp(engine, input, minute);
  if (!outside.known) return outside;
  return knownFact(outside.fixed + fixedDivide(heat.fixed, ua.fixed), outside.gaps);
}

/**
 * 散热能力（卷十九 §4.1 规则 4 :326，李白 11-19 13:3x ②）：envelopeUaWPerK = envelopeAreaM2 ×
 * [(1 − aperture) × 材料导热和 ÷ wallThicknessM + aperture × rules.facility.thermal.openingWPerM2K]，再经品质档修正键 facility.envelopeUa。
 * envelope = {envelopeAreaM2, aperture, thermalConductivitySum（wsum(material, thermalConductivity) 的有效值，W/m/K）, wallThicknessM, modifyUa（可选，修正键管线：定点 → 定点；缺即无修正项）}；
 * 房间取所在建筑的值（卷十九 Q12/Q14）由调用方在解 envelope 时做。任一输入缺、或 openingWPerM2K 无出处（rules.facility，登记在 unbuilt）即未知并带缺口；墙厚非正报 E-DIM-DOMAIN-RANGE。
 * 材料导热有效值、形制条目几何量来自卷三、卷十九的 facilityView，那两处块 6 未建，输入由其读者交入。
 * @param {any} engine @param {any} envelope
 */
export function envelopeUaWPerK(engine, envelope) {
  const gaps = [];
  for (const [key, gap] of [['envelopeAreaM2', GAP.uaArea], ['aperture', GAP.uaAperture], ['thermalConductivitySum', GAP.uaConductivity], ['wallThicknessM', GAP.uaThickness]]) {
    if (!present(envelope[key])) gaps.push(gap);
  }
  const f = engine.rules[SCHEMA.facilityTable];
  const opening = isObj(f) && isObj(f.thermal) ? f.thermal.openingWPerM2K : undefined;
  if (!present(opening)) gaps.push(GAP.uaOpening);
  if (gaps.length > 0) return unknownFact(gaps);
  const thickness = fixedUnits(envelope.wallThicknessM);
  if (thickness <= 0n) throw new KernelError('E-DIM-DOMAIN-RANGE', {}, 'wallThicknessM must be positive');
  const open = fixedUnits(envelope.aperture);
  const solid = fixedUnits(1) - open;
  const perArea = fixedMultiply(solid, fixedDivide(fixedUnits(envelope.thermalConductivitySum), thickness)) + fixedMultiply(open, fixedUnits(opening));
  let ua = fixedMultiply(fixedUnits(envelope.envelopeAreaM2), perArea);
  if (typeof envelope.modifyUa === 'function') ua = envelope.modifyUa(ua);
  return knownFact(ua, [], SCHEMA.unitWattPerK);
}

/**
 * 地点热源功率（§4.5.3 第 3 条，单位瓦）：四项合计——combustionFed 为假的各场的 强度 × heatWPerScore、该地点燃烧中物品的放热功率、运行中设施的产热、在场主体的代谢产热。
 * sources = {fields: [{intensity, heatWPerScore}], burning: [瓦], facilities: [瓦], occupants: [瓦]}：某一项是数组（含确实为空的数组）就按元素合计，空集合计为 0 是算出来的；
 * 某一项没交（undefined 或 null）表示那项的读入口未建、不知道有没有东西，整项未知，热源功率与室温都未知，不当 0。
 * @param {{fields?: any[] | null, burning?: any[] | null, facilities?: any[] | null, occupants?: any[] | null}} sources
 */
export function heatPowerW(sources) {
  const missing = [];
  let sum = 0n;
  for (const part of SCHEMA.heatParts) {
    const list = sources[part];
    if (!Array.isArray(list)) { missing.push(`${GAP.heat}_${part}`); continue; }
    for (const item of list) sum += part === SCHEMA.heatParts[0] ? fixedMultiply(fixedUnits(item.intensity), fixedUnits(item.heatWPerScore)) : fixedUnits(item);
  }
  if (missing.length > 0) return unknownFact(missing);
  return knownFact(sum, [], SCHEMA.unitWatt);
}

/**
 * 室外日均温（卷二十 §4.11.3 第 2 条，封卷后勘误 1119k1 改：日均温按解析式直接算，不含昼夜项）：
 * 日均温 = 常年气温 env.climateTempC + 季节摆动项在该日 [起始分钟, 起始分钟 + 一日) 上的平均 + 当日天气偏移。
 * 季节摆动项 tempAmpC × sin(2π ×（归一相位 − thermalLagPhase)) 的日均值取解析式 (cos θ0 − cos θ1) ÷ (θ1 − θ0)（det-math sinMeanTurns）；
 * 昼夜摆动是一日内的余弦，整日平均为 0，不进日均温，所以与 cloudDamp、diurnalPeakMinute 无关，也没有取样点参数。
 * 当日天气偏移取 input.weather.tempOffsetC（weatherAt 的当日量），没有则列入缺口 weather_temp_offset、标 partial；常年气温或季节摆动缺则整体未知。
 * @param {any} engine @param {any} input @param {number} day 世界日序
 */
export function dailyMeanTemp(engine, input, day) {
  const base = climateTempC(engine, input);
  if (!base.known) return base;
  checkEast(engine);
  const cell = isObj(input.cell) ? input.cell : {};
  if (!present(cell.tempAmpC)) return unknownFact([GAP.cellAmp]);
  const lag = table(engine, SCHEMA.astroTable).thermalLagPhase;
  if (!isObj(lag)) return unknownFact([GAP.lag]);
  const perDay = minutesPerDay(engine);
  const phase = normalizedSolarPhase(engine, input, day * perDay);
  if (!phase.known) return phase;
  const year = astroView(engine).yearMinutes;
  // 一日占一年的份额 = perDay × year.den ÷ year.num；与相位同分母（南半球相位分母是 year.num 的整数倍）后再并入滞后相位的分母。
  const daySpan = perDay * year.den * (phase.den / year.num);
  const mean8 = sinMeanTurns(phase.num * lag.den - lag.num * phase.den, daySpan * lag.den, phase.den * lag.den);
  let mean = base.fixed + timesTrig(fixedUnits(cell.tempAmpC), mean8);
  const gaps = [];
  const wx = isObj(input.weather) ? input.weather : {};
  if (present(wx.tempOffsetC)) mean += fixedUnits(wx.tempOffsetC);
  else gaps.push(GAP.weatherOffset);
  return knownFact(mean, gaps);
}

function checkEast(engine) {
  const east = table(engine, SCHEMA.astroTable).minutesPerMeterEast;
  if (present(east) && east !== 0) throw new KernelError('E-DIM-STRUCT-FIELD', {}, 'rules.astro.minutesPerMeterEast is not 0: local time offset is not built (first version is 0)');
}

/**
 * `env.tempC` 的基值（§4.5.3 分支规则）：只读 enclosed、underground 两个布尔与 depthM，不看地点是哪一类、叫什么：
 * 不围合不地下 → 室外；不围合地下 → 地下基准；围合 → 室内（外侧基准按 underground 取）。两个布尔缺即未知。
 * input 是已解出的地点输入（地点表归 6-7）：{latitudeDeg, cell: {annualMeanTempC, tempAmpC, diurnalAmpC, seasonScheme}, cellElevationM, surfaceRefElevationM,
 * enclosed, underground, depthM, envelopeUaWPerK, heatPowerW, weather: {cloud, tempOffsetC}}，每项缺即未知。
 * @param {any} engine @param {any} input @param {number} minute
 */
export function tempAt(engine, input, minute) {
  if (typeof input.enclosed !== 'boolean' || typeof input.underground !== 'boolean') return unknownFact([GAP.flags]);
  if (input.enclosed) return indoorTemp(engine, input, minute);
  return input.underground ? groundTemp(engine, input, minute) : outdoorTemp(engine, input, minute);
}
