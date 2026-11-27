// 日历模块（卷二十 §3.1 :426–:446 日历入口、§4.2 历法、§4.4.3 第 1 条太阳相位；§3.4 T-3：年月日与日内切分的算术只在本文件）。
// S2-T1（草案 draft-s2-t §4、§8）：旧件 archive 的 kernel/calendar.mjs 按 6 闸取子集重写落 rules/（L0 已满，卷二十 :446 路径勘误，主会话 Q6 甲）。
// 入口：systemTimeView（全局系统时间：第几天、日内分钟）、calendarFrom（本人文化 → 文化行 calendar，读不到为 null 加缺口，不设默认历法，Q1 甲）、
// calendarDayIndex、calendarView（全程整数，只读历法行）、dayPartOf（历法行 dayParts 的日内分段序号，Q2 甲）、astroView（本卡只给 solarPhase）。
// 一日的分钟数取单位表：日单位是 rules.astro.yearDays 计数所用的单位（_units.json 里以该键定义年的那一行的 siFromRule.unit），时钟单位取时钟路径的登记类型；
// 不写单位代号，不认任何历法、月、文化或地点代号。纯函数，不写 state。

import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { parseNumberType } from '../../kernel/validate/types.mjs';
import { ruleValue, unitSi } from '../load/registry.mjs';

const FAMILY = 'calendar';
const ASTRO = 'astro';
const YEAR_DAYS = 'yearDays';
const PHASE_EPOCH = 'phaseEpochMinute';
// 单位表里以年长键定义年单位的那一行（_units.json siFromRule.key）。
const YEAR_RULE_KEY = 'rules.astro.yearDays';
const DAY_START_MIDNIGHT = 'midnight';
const MODE_MONTH = 'month';
// 本人文化维度与文化行的历法维度（卷二十 :588；卷四 §4.12 G-4 person.culture）。
const CULTURE_DIM = 'culture';
const CALENDAR_DIM = 'calendar';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';

const isObj = (/** @type {unknown} */ v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (/** @type {unknown} */ v) => Number.isSafeInteger(v);
const rangeError = (/** @type {string} */ detail) => new KernelError('E-DIM-DOMAIN-RANGE', {}, detail);

/** @typedef {{ordinal: number, days: number}} Month */
/** @typedef {{cycleYears: number, years: number[], mode: string, afterMonth: number, days: number}} Intercal */
/** @typedef {{epochMinute: number, months: Month[], intercalation?: Intercal[], weekDays: number, dayStart: string, dayParts?: {count: number, offsetMinutes: number}}} CalendarRow */
/** 本模块读的 engine 字段：世界数据副本、路径句柄 P、词表、登记表（种类识别与维度表）。 @typedef {{docData: Parameters<typeof ruleValue>[0], P: Readonly<Record<string, (...args: string[]) => import('../../kernel/types.d.ts').StatePath<string>>>, vocab: unknown} & Parameters<typeof kindOfEntity>[0] & {registry: {tables: Map<string, unknown>}}} CalendarEngine */
/** 世界状态（本文件只经 dim、kindOfEntity 读）。 @typedef {object} TimeState */

/**
 * 一日的分钟数：日单位 si ÷ 时钟单位 si（公共入口 unitSi），须为正整数，否则 E-DIM-UNIT-UNKNOWN。
 * @param {CalendarEngine} engine @returns {number}
 */
function minutesPerDay(engine) {
  const doc = Object(engine.docData);
  const units = Array.isArray(Object(doc.unitsDoc).units) ? doc.unitsDoc.units : [];
  const yearRow = Object(units.find((/** @type {unknown} */ u) => isObj(Object(u).siFromRule) && Object(u).siFromRule.key === YEAR_RULE_KEY && Object(u).siFromRule.invert !== true));
  const dayUnit = Object(yearRow.siFromRule).unit;
  const clock = parseNumberType(String(Object(Object(doc.owners).pathTypes)[engine.P.clock_minute().pattern]));
  if (typeof dayUnit !== 'string' || !clock || !clock.unit) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, `calendar: units table needs the row defined by ${YEAR_RULE_KEY} and the clock path a unit`);
  const [an, ad] = unitSi(doc, dayUnit);
  const [bn, bd] = unitSi(doc, clock.unit);
  const num = an * bd;
  const den = ad * bn;
  const per = den > 0n && num % den === 0n ? Number(num / den) : NaN;
  if (!isInt(per) || per < 1) throw new KernelError('E-DIM-UNIT-UNKNOWN', {}, 'calendar: day unit / clock unit must be a positive integer');
  return per;
}

/**
 * 历法行（词表族 calendar 的条目）；不是该族条目即 E-DIM-REF-MISSING。
 * @param {CalendarEngine} engine @param {string} calendarId @returns {CalendarRow}
 */
function calendarRow(engine, calendarId) {
  const entries = Object(Object(Object(engine.vocab).families)[FAMILY]).entries;
  if (!isObj(entries) || typeof calendarId !== 'string' || !Object.hasOwn(entries, calendarId)) throw new KernelError('E-DIM-REF-MISSING', {}, `calendar ${String(calendarId)} is not an entry of vocab family ${FAMILY}`);
  return entries[calendarId];
}

// ---------- 年的结构：月段序列（旧件 calendar.mjs 子集） ----------

const gcd = (/** @type {number} */ a, /** @type {number} */ b) => { let x = a; let y = b; while (y !== 0) [x, y] = [y, x % y]; return x; };

/** 闰周期长度（年）：各置闰项 cycleYears 的最小公倍数；无置闰项为 1。 @param {CalendarRow} row */
function cycleYearsOf(row) {
  let L = 1;
  for (const it of row.intercalation || []) L = (L / gcd(L, it.cycleYears)) * it.cycleYears;
  return L;
}

/**
 * 第 year 年（自 1 起）的月段：每段 {month, days, leap}。mode month 的闰月在 afterMonth 之后另插一段；mode days 卷文没写 leap 与排位，拒收。
 * @param {CalendarRow} row @param {number} year
 */
function segmentsOfYear(row, year) {
  const out = [];
  for (const m of row.months) {
    out.push({ month: m.ordinal, days: m.days, leap: false });
    for (const it of row.intercalation || []) {
      const at = ((year - 1) % it.cycleYears) + 1;
      if (it.afterMonth !== m.ordinal || !it.years.includes(at)) continue;
      if (it.mode !== MODE_MONTH) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, 'calendar intercalation mode days is not built (leap meaning unspecified in vol 20)');
      out.push({ month: m.ordinal, days: it.days, leap: true });
    }
  }
  return out;
}

const yearLength = (/** @type {CalendarRow} */ row, /** @type {number} */ year) => segmentsOfYear(row, year).reduce((s, seg) => s + seg.days, 0);

/** 日序 → 年与年内 0 起日序。 @param {CalendarRow} row @param {number} dayIndex */
function yearOfDayIndex(row, dayIndex) {
  const L = cycleYearsOf(row);
  let cycleDays = 0;
  for (let y = 1; y <= L; y += 1) cycleDays += yearLength(row, y);
  if (cycleDays < 1) throw rangeError('calendar: a leap cycle has no days');
  const cycles = Math.floor(dayIndex / cycleDays);
  let rest = dayIndex - cycles * cycleDays;
  for (let y = 1; y <= L; y += 1) {
    const len = yearLength(row, y);
    if (rest < len) return { year: cycles * L + y, inYear: rest };
    rest -= len;
  }
  throw rangeError('calendar cycle walk fell through');
}

// ---------- 入口 ----------

/**
 * 系统时间（亮圳 11-19 两套历法之第一套）：时钟轴的显示投影，全世界统一，不属于任何历法：{day 第几天（自 0 起）, minuteOfDay 日内分钟}。
 * @param {CalendarEngine} engine @param {number} minute 世界分钟（非负整数） @returns {Readonly<{day: number, minuteOfDay: number}>}
 */
export function systemTimeView(engine, minute) {
  if (!isInt(minute) || minute < 0) throw rangeError('systemTimeView: minute must be a non-negative integer');
  const perDay = minutesPerDay(engine);
  return Object.freeze({ day: Math.floor(minute / perDay), minuteOfDay: minute % perDay });
}

/**
 * calendarFrom（卷二十 :588 第 2 条）：主体用哪部历法 = 本人文化行的 calendar 维度（主会话 Q1 甲）。主体表没有文化维度、文化读不到、
 * 文化表未建、文化行没有 calendar 或所指不是词表族 calendar 的条目，一律 null（未知，缺口代号由调用方 nowOf 记进 gaps），不拿任何历法兜底。
 * @param {CalendarEngine} engine @param {TimeState} state @param {string} subjectId @returns {string | null}
 */
export function calendarFrom(engine, state, subjectId) {
  const kind = kindOfEntity(engine, state, subjectId);
  const header = Object(Object(Object(engine.registry.tables.get(kind)).dimensions)[CULTURE_DIM]);
  const cultureKind = header.kind;
  if (typeof cultureKind !== 'string' || !engine.registry.tables.has(cultureKind)) return null;
  let id;
  try {
    const culture = dim(engine, state, kind, subjectId, CULTURE_DIM).value;
    id = dim(engine, state, cultureKind, culture, CALENDAR_DIM).value;
  } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return null;
    throw e;
  }
  const entries = Object(Object(Object(engine.vocab).families)[FAMILY]).entries;
  return typeof id === 'string' && isObj(entries) && Object.hasOwn(entries, id) ? id : null;
}

/**
 * calendarDayIndex（卷二十 :428、:584）：该历法的日序（自 epochMinute 起第几日，0 起）。dayStart 为 midnight 时与地点无关；
 * 日出、日落起日要日照（未建）：返回 null（未知）。minute 早于 epochMinute 即 E-DIM-DOMAIN-RANGE。
 * @param {CalendarEngine} engine @param {string} calendarId @param {number} minute @param {string | null} [placeId] @returns {number | null}
 */
export function calendarDayIndex(engine, calendarId, minute, placeId = null) {
  const row = calendarRow(engine, calendarId);
  if (!isInt(minute)) throw rangeError('calendarDayIndex: minute must be an integer');
  if (row.dayStart !== DAY_START_MIDNIGHT) return null;
  const since = minute - row.epochMinute;
  if (since < 0) throw rangeError('calendarDayIndex: minute is before the calendar epoch');
  void placeId;
  return Math.floor(since / minutesPerDay(engine));
}

/**
 * calendarView（卷二十 :429、:585）：{year, month, day, leap, weekOfMonth}，year、month、day 自 1 起，leap 为真表示在闰月里；
 * weekOfMonth = floor((day − 1) ÷ weekDays) + 1。weekDay、dayOfYear 卷文无起点与取值域，不返回（rules.calendar.unbuilt）。
 * @param {CalendarEngine} engine @param {string} calendarId @param {number} dayIndex
 */
export function calendarView(engine, calendarId, dayIndex) {
  const row = calendarRow(engine, calendarId);
  if (!isInt(dayIndex) || dayIndex < 0) throw rangeError('calendarView: dayIndex must be a non-negative integer');
  const { year, inYear } = yearOfDayIndex(row, dayIndex);
  let rest = inYear;
  for (const seg of segmentsOfYear(row, year)) {
    if (rest >= seg.days) { rest -= seg.days; continue; }
    const day = rest + 1;
    return Object.freeze({ year, month: seg.month, day, leap: seg.leap, weekOfMonth: Math.floor((day - 1) / row.weekDays) + 1 });
  }
  throw rangeError('calendarView: day fell outside the year');
}

/**
 * dayPartOf（主会话 Q2 甲，卷二十勘误）：历法行 dayParts {count, offsetMinutes} 把该历法的一日切成 count 段，第 0 段自日起点后 offsetMinutes 分钟起；
 * 返回段序号 floor(((日内分钟 − offsetMinutes) mod 一日分钟) × count ÷ 一日分钟)。段名交语言包。起日要日照或行上没有 dayParts 即 null（未知）。
 * @param {CalendarEngine} engine @param {string} calendarId @param {number} minute @returns {number | null}
 */
export function dayPartOf(engine, calendarId, minute) {
  const row = calendarRow(engine, calendarId);
  const dayIndex = calendarDayIndex(engine, calendarId, minute);
  if (dayIndex === null) return null;
  const parts = row.dayParts;
  if (!isObj(parts) || !isInt(parts.count) || parts.count < 1 || !isInt(parts.offsetMinutes)) return null;
  const perDay = minutesPerDay(engine);
  const inDay = minute - row.epochMinute - dayIndex * perDay;
  const shifted = (((inDay - parts.offsetMinutes) % perDay) + perDay) % perDay;
  return Math.floor((shifted * parts.count) / perDay);
}

/**
 * astroView（卷二十 :432、:689）：rules.astro 年长与历元键的唯一读者。本卡只给 solarPhase(minute)：
 * frac((minute − phaseEpochMinute) ÷ 年长分钟)，年长分钟 = yearDays × 一日分钟，有理数 {num, den}（0 ≤ num < den，已约分），全程 BigInt 整数；相位 0 是北半球春分。
 * @param {CalendarEngine} engine
 */
export function astroView(engine) {
  const year = Object(ruleValue(engine.docData, ASTRO, YEAR_DAYS));
  const epoch = Number(ruleValue(engine.docData, ASTRO, PHASE_EPOCH));
  if (!isInt(year.num) || !isInt(year.den) || year.num < 1 || year.den < 1 || !isInt(epoch)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${ASTRO}: ${YEAR_DAYS} {num, den} and integer ${PHASE_EPOCH} required`);
  const perDay = BigInt(minutesPerDay(engine));
  const yearNum = BigInt(year.num) * perDay;
  const yearDen = BigInt(year.den);
  return Object.freeze({
    /** @param {number} minute */
    solarPhase: (minute) => {
      if (!isInt(minute)) throw rangeError('solarPhase: minute must be an integer');
      let n = ((BigInt(minute) - BigInt(epoch)) * yearDen) % yearNum;
      if (n < 0n) n += yearNum;
      let a = n; let b = yearNum;
      while (b !== 0n) [a, b] = [b, a % b];
      return Object.freeze({ num: Number(n / a), den: Number(yearNum / a) });
    },
  });
}
