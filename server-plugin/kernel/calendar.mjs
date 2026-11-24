// 日历模块（卷二十《时间日历天气与环境》§3.1 :414–:439 日历入口七项、§4.2 历法数据、§4.4.3 第 1 条太阳相位；§3.4 T-3：年月日算术只在本文件）。
// 块 6 第 6-28 张《卷二十历法与温度前移》（李白 11-19 12:4x 丙7：前移 §4.2 历法，规则子集全量；非核心读数按"未知"传播并机读登记缺口，不写缺省）。
// 前移的入口：calendarDayIndex、calendarView、calendarMinuteOf、calendarSpan、calendarAdd、rateBasisView、astroView（纯函数，不读 state）。
// 未前移（登记在 rules.calendar.unbuilt、rules.astro.unbuilt，读到按未知返回 null 并 report W-DIM-GAP）：eraView 与其写者 calendar-era.mjs、
// recurrenceNext 与周期日规则（卷七 §4.18 才有规则行）、按日出日落起日（要 §4.4 日照公式）、lunarPhase（synodicDays 无出处）。
// 历法行读词表族 calendar（卷二十 §2.3，条目字段见该族）；天文年读 rules.astro。全程整数；时间轴单位换算只经 minutesPerDay（_units.json）。
// 本文件不认任何具体历法代号、月名、文化或地点；字串字面量只有 ASCII（§4.1.6 扫描式）。

import { KernelError } from './errors.mjs';
import { report } from './report.mjs';
import { minutesPerDay } from './scheduler.mjs';
import { fixedScale } from './det-math.mjs';

const SCHEMA = Object.freeze({
  family: 'calendar',
  astroTable: 'astro',
  dayStartMidnight: 'midnight',
  modeMonth: 'month',
  gapSide: 'calendar',
  gapField: 'day_start',
  gapAstroSide: 'astro',
  gapLunar: 'lunar_phase',
  gapAddMissing: 'add_month_end_clamp',
  gapFrom: 'calendar_from',
});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v) => Number.isSafeInteger(v);

function rangeError(detail) {
  return new KernelError('E-DIM-DOMAIN-RANGE', {}, detail);
}

/**
 * 历法行（词表族 calendar 的条目）；不是该族条目即 E-DIM-REF-MISSING。
 * @param {{vocab: {index: Map<string, {family: string, entry: any}>}}} engine
 * @param {string} calendarId
 */
export function calendarRow(engine, calendarId) {
  const rec = engine.vocab.index.get(calendarId);
  if (!rec || rec.family !== SCHEMA.family) throw new KernelError('E-DIM-REF-MISSING', {}, `calendar ${String(calendarId)} is not an entry of vocab family ${SCHEMA.family}`);
  return rec.entry;
}

// ---------- 年的结构：月段序列 ----------

const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const lcm = (a, b) => (a / gcd(a, b)) * b;

// 闰周期长度（年）：各置闰项 cycleYears 的最小公倍数；无置闰项取 1（每年同形）。
function cycleYearsOf(row) {
  let L = 1;
  for (const it of row.intercalation || []) L = lcm(L, it.cycleYears);
  return L;
}

// 第 year 年（从 1 起）的月段序列：每段 {month 序号, days, leap}。
// mode = month：闰月是 afterMonth 之后新插一段（leap 为真）。mode = days（闰日加进月里）：卷二十 :233 没写 leap 取值与闰日排位，
// 登记在 rules.calendar.unbuilt（intercalModeDays），加载校验拒收这种行，这里不处理。
function segmentsOfYear(row, year) {
  const out = [];
  const months = row.months;
  for (const m of months) {
    out.push({ month: m.ordinal, days: m.days, leap: false, offset: 0 });
    for (const it of row.intercalation || []) {
      const at = ((year - 1) % it.cycleYears) + 1;
      if (it.afterMonth !== m.ordinal || !it.years.includes(at)) continue;
      if (it.mode !== SCHEMA.modeMonth) throw new KernelError('E-DIM-DOMAIN-ENUM', {}, 'calendar intercalation mode days is not built (leap meaning unspecified in vol 20)');
      out.push({ month: m.ordinal, days: it.days, leap: true, offset: 0 });
    }
  }
  return out;
}

const yearLength = (row, year) => segmentsOfYear(row, year).reduce((s, seg) => s + seg.days, 0);

// 一个完整闰周期的日数（周期内年长之和）。
function cycleDaysOf(row) {
  const L = cycleYearsOf(row);
  let sum = 0;
  for (let y = 1; y <= L; y += 1) sum += yearLength(row, y);
  return sum;
}

// 第 year 年之前（不含）的总日数。
function daysBeforeYear(row, year) {
  const L = cycleYearsOf(row);
  const done = year - 1;
  const cycles = Math.floor(done / L);
  let sum = cycles * cycleDaysOf(row);
  for (let y = 1; y <= done - cycles * L; y += 1) sum += yearLength(row, y);
  return sum;
}

// 一个整数日序所在年与年内 0 起日序。
function yearOfDayIndex(row, dayIndex) {
  const L = cycleYearsOf(row);
  const cycleDays = cycleDaysOf(row);
  const cycles = Math.floor(dayIndex / cycleDays);
  let rest = dayIndex - cycles * cycleDays;
  for (let y = 1; y <= L; y += 1) {
    const len = yearLength(row, y);
    if (rest < len) return { year: cycles * L + y, inYear: rest };
    rest -= len;
  }
  throw rangeError('calendar cycle walk fell through');
}

// ---------- 入口：日序、投影、反算 ----------

/**
 * kernelApi `calendarDayIndex(engine, calendarId, minute, placeId)`（§3.1 :418）：该历法的日序（整数，自历法 epochMinute 起的第几日，0 起）。
 * dayStart 为 midnight 时与地点无关；取日出、日落要该地的日照（§4.4 日照公式未前移，登记在 rules.calendar.unbuilt）：返回 null（未知）并报 W-DIM-GAP。
 * minute 早于 epochMinute 即 E-DIM-DOMAIN-RANGE。
 * @param {any} engine @param {string} calendarId @param {number} minute @param {string | null} [placeId]
 * @returns {number | null}
 */
export function calendarDayIndex(engine, calendarId, minute, placeId = null) {
  const row = calendarRow(engine, calendarId);
  if (!isInt(minute)) throw rangeError('calendarDayIndex: minute must be an integer');
  if (row.dayStart !== SCHEMA.dayStartMidnight) {
    report('W-DIM-GAP', { side: SCHEMA.gapSide, field: SCHEMA.gapField });
    return null;
  }
  const since = minute - row.epochMinute;
  if (since < 0) throw rangeError('calendarDayIndex: minute is before the calendar epoch');
  void placeId;
  return Math.floor(since / minutesPerDay(engine));
}

/**
 * kernelApi `calendarView(engine, calendarId, dayIndex)`（§3.1 :419；§4.2.3 第 1 条）：{year, month, day, leap, weekOfMonth}，全整数与布尔，纯函数。
 * year、month、day 自 1 起；leap 为真表示该日在闰月里；weekOfMonth = floor((day − 1) ÷ weekDays) + 1（卷文 §4.2.3 第 1 条）。
 * 卷文 :422 还列了 weekDay、dayOfYear，但没写取值域与起点：不自补，登记在 rules.calendar.unbuilt（weekDay、dayOfYear），不返回。
 * @param {any} engine @param {string} calendarId @param {number} dayIndex
 */
export function calendarView(engine, calendarId, dayIndex) {
  const row = calendarRow(engine, calendarId);
  const p = projectDay(row, dayIndex);
  return Object.freeze({
    year: p.year, month: p.month, day: p.day, leap: p.leap,
    weekOfMonth: Math.floor((p.day - 1) / row.weekDays) + 1,
  });
}

// 日序 → 年、月、月内日、闰标记、年内 0 起日序（calendarView 与 calendarAdd 共用）。
function projectDay(row, dayIndex) {
  if (!isInt(dayIndex) || dayIndex < 0) throw rangeError('calendarView: dayIndex must be a non-negative integer');
  const { year, inYear } = yearOfDayIndex(row, dayIndex);
  let rest = inYear;
  for (const seg of segmentsOfYear(row, year)) {
    if (rest >= seg.days) { rest -= seg.days; continue; }
    return { year, month: seg.month, day: seg.offset + rest + 1, leap: seg.leap, inYear };
  }
  throw rangeError('calendarView: day fell outside the year');
}

// 日期 → 日序；日期不存在即 E-DIM-DOMAIN-RANGE。
function dayIndexOfDate(row, date) {
  const { year, month, day, leap } = date;
  if (![year, month, day].every(isInt) || year < 1 || day < 1 || typeof leap !== 'boolean') throw rangeError('calendar date: year, month, day must be integers (year, day >= 1) and leap a boolean');
  let sum = daysBeforeYear(row, year);
  for (const seg of segmentsOfYear(row, year)) {
    const inThisSeg = seg.month === month && day > seg.offset && day <= seg.offset + seg.days;
    if (inThisSeg && seg.leap === leap) return sum + (day - seg.offset - 1);
    sum += seg.days;
  }
  throw rangeError('calendar date does not exist in that year');
}

/**
 * kernelApi `calendarMinuteOf(engine, calendarId, {year, month, day, leap}, placeId)`（§3.1 :420）：该日起始分钟；与 calendarDayIndex、calendarView 互为往返。
 * 只支持 midnight 起日（日出日落同 calendarDayIndex，返回 null 并报缺口）。日期不存在即 E-DIM-DOMAIN-RANGE。
 * @param {any} engine @param {string} calendarId @param {{year: number, month: number, day: number, leap: boolean}} date @param {string | null} [placeId]
 * @returns {number | null}
 */
export function calendarMinuteOf(engine, calendarId, date, placeId = null) {
  const row = calendarRow(engine, calendarId);
  if (row.dayStart !== SCHEMA.dayStartMidnight) {
    report('W-DIM-GAP', { side: SCHEMA.gapSide, field: SCHEMA.gapField });
    return null;
  }
  void placeId;
  return row.epochMinute + dayIndexOfDate(row, date) * minutesPerDay(engine);
}

// ---------- 两套历法（亮圳 11-19 13:49 设计决定，李白 13:50 转） ----------

/**
 * 系统时间（第一套）：时钟轴的显示投影，全世界统一，不属于任何历法、不分地点：{day 世界日序（第几天，自 0 起）, minuteOfDay 日内分钟}。
 * 日起点就是世界分钟轴的整日界（_units.json 的 day ÷ minute），与历法行的 dayStart、epochMinute 无关；几时几分的显示由客户端按 minuteOfDay 做。
 * @param {{units: Map<string, {si: number}>}} engine @param {number} minute 世界分钟（非负整数）
 * @returns {{day: number, minuteOfDay: number}}
 */
export function systemTimeView(engine, minute) {
  if (!isInt(minute) || minute < 0) throw rangeError('systemTimeView: minute must be a non-negative integer');
  const perDay = minutesPerDay(engine);
  return Object.freeze({ day: Math.floor(minute / perDay), minuteOfDay: minute % perDay });
}

/**
 * calendarFrom（第二套，卷二十 §4.2.3 第 2 条）：当地历法按文化维度解析，不存在"全世界当前历法"：source = {cultureCalendar}，是调用方按
 * "地点取文化槽解析到的文化行（卷五 §4.12）、人物取本人文化"读到的该文化行的 calendar 维度值（历法代号）。读到的值不是词表族 calendar 的条目、
 * 或没读到（文化槽、文化行或其 calendar 维度未建、没填），一律返回 null（未知）并报 W-DIM-GAP（calendar_from），不拿某一部历法兜底。
 * @param {any} engine @param {{cultureCalendar?: string | null}} source
 * @returns {string | null} 历法代号或 null
 */
export function calendarFrom(engine, source) {
  const id = source && source.cultureCalendar;
  const rec = typeof id === 'string' ? engine.vocab.index.get(id) : undefined;
  if (!rec || rec.family !== SCHEMA.family) {
    report('W-DIM-GAP', { side: SCHEMA.gapSide, field: SCHEMA.gapFrom });
    return null;
  }
  return id;
}

/**
 * 按地点或人物的文化解析历法后投影日序（calendarFrom + calendarView）：解析不到即 null（未知），不用任何默认历法。
 * @param {any} engine @param {{cultureCalendar?: string | null}} source @param {number} dayIndex
 */
export function calendarViewFrom(engine, source, dayIndex) {
  const id = calendarFrom(engine, source);
  return id === null ? null : calendarView(engine, id, dayIndex);
}

// ---------- 间隔与加法 ----------

// 一年里的"月单元"：基础月与闰月各自成一个单元。
const monthUnits = (row, year) => segmentsOfYear(row, year);

// 加年、月后的日期要原样存在：目标年没有那个闰月、或日数超过该月长，卷文没给截断口径（月末截断是自补，已删），
// 所以按未知处理（rules.calendar.unbuilt 的 addMonthEndClamp），返回 null。
function exists(row, year, month, leap, day) {
  const unit = monthUnits(row, year).find((u) => u.month === month && u.leap === leap);
  return unit !== undefined && day >= 1 && day <= unit.days;
}

function addToDate(row, date, add) {
  let { year, month, leap, day } = date;
  const { years = 0, months = 0 } = add;
  if (!isInt(years) || !isInt(months)) throw rangeError('calendarAdd: years, months must be integers');
  if (years !== 0) {
    year += years;
    if (year < 1) throw rangeError('calendarAdd: year before the calendar epoch');
    if (!exists(row, year, month, leap, day)) return null;
  }
  if (months !== 0) {
    const step = months > 0 ? 1 : -1;
    let units = monthUnits(row, year);
    let pos = units.findIndex((u) => u.month === month && u.leap === leap);
    if (pos < 0) pos = units.findIndex((u) => u.month === month);
    for (let n = Math.abs(months); n > 0; n -= 1) {
      pos += step;
      if (pos >= units.length) { year += 1; units = monthUnits(row, year); pos = 0; }
      if (pos < 0) {
        year -= 1;
        if (year < 1) throw rangeError('calendarAdd: month before the calendar epoch');
        units = monthUnits(row, year);
        pos = units.length - 1;
      }
    }
    const unit = units[pos];
    month = unit.month; leap = unit.leap;
    if (day > unit.days) return null;
  }
  return { year, month, leap, day };
}

/**
 * kernelApi `calendarAdd(engine, calendarId, minute, {years, months, days}, placeId)`（§3.1 :421）：加年、月、日后的分钟；时刻内的分钟数不变。
 * 先加年再加月（月沿月单元序走，闰月自成一格），最后加日。落不到原日期（目标年没有该闰月、日数超月长）时卷文没给口径，返回 null 并报缺口，不截断；
 * midnight 起日以外同样返回 null。
 * @param {any} engine @param {string} calendarId @param {number} minute @param {{years?: number, months?: number, days?: number}} add @param {string | null} [placeId]
 * @returns {number | null}
 */
export function calendarAdd(engine, calendarId, minute, add, placeId = null) {
  const row = calendarRow(engine, calendarId);
  const day0 = calendarDayIndex(engine, calendarId, minute, placeId);
  if (day0 === null) return null;
  const perDay = minutesPerDay(engine);
  const inDay = minute - row.epochMinute - day0 * perDay;
  const { days = 0 } = add;
  if (!isInt(days)) throw rangeError('calendarAdd: days must be an integer');
  const p = projectDay(row, day0);
  const moved = addToDate(row, { year: p.year, month: p.month, day: p.day, leap: p.leap }, add);
  if (moved === null) {
    report('W-DIM-GAP', { side: SCHEMA.gapSide, field: SCHEMA.gapAddMissing });
    return null;
  }
  const dayIndex = dayIndexOfDate(row, moved) + days;
  if (dayIndex < 0) throw rangeError('calendarAdd: result before the calendar epoch');
  return row.epochMinute + dayIndex * perDay + inDay;
}

/**
 * kernelApi `calendarSpan(engine, calendarId, fromMinute, toMinute, placeId)`（§3.1 :421）：{years, months, days}，年龄、周年、"满若干年"的期限只能用这个入口。
 * 年取最大的满年数，再取最大的满月数（calendarAdd 的同一走法），余下按整日取；toMinute 早于 fromMinute 即 E-DIM-DOMAIN-RANGE。
 * @param {any} engine @param {string} calendarId @param {number} fromMinute @param {number} toMinute @param {string | null} [placeId]
 * @returns {{years: number, months: number, days: number} | null}
 */
export function calendarSpan(engine, calendarId, fromMinute, toMinute, placeId = null) {
  if (toMinute < fromMinute) throw rangeError('calendarSpan: toMinute is before fromMinute');
  const fromDay = calendarDayIndex(engine, calendarId, fromMinute, placeId);
  const toDay = calendarDayIndex(engine, calendarId, toMinute, placeId);
  if (fromDay === null || toDay === null) return null;
  // 只向前加（年、月都非负）。加法落不到原日期时（null，卷文无截断口径）视为"没到"，不算满这一年或这一月。
  const reached = (minute) => minute !== null && minute <= toMinute;
  let years = calendarView(engine, calendarId, toDay).year - calendarView(engine, calendarId, fromDay).year;
  while (years > 0 && !reached(calendarAdd(engine, calendarId, fromMinute, { years }, placeId))) years -= 1;
  const afterYears = years === 0 ? fromMinute : calendarAdd(engine, calendarId, fromMinute, { years }, placeId);
  let months = 0;
  while (reached(calendarAdd(engine, calendarId, afterYears, { months: months + 1 }, placeId))) months += 1;
  const afterMonths = months === 0 ? afterYears : calendarAdd(engine, calendarId, afterYears, { months }, placeId);
  const days = Math.floor((toMinute - afterMonths) / minutesPerDay(engine));
  return { years, months, days };
}

/**
 * kernelApi `rateBasisView(engine, calendarId)`（§3.1 :426）：{monthDays, yearDays}，只供卷六合同计息。
 * @param {any} engine @param {string} calendarId
 */
export function rateBasisView(engine, calendarId) {
  const rb = calendarRow(engine, calendarId).rateBasis;
  if (!isObj(rb) || !isInt(rb.monthDays) || !isInt(rb.yearDays)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `calendar ${calendarId}: rateBasis {monthDays, yearDays} missing`);
  return Object.freeze({ monthDays: rb.monthDays, yearDays: rb.yearDays });
}

// ---------- 天文年（§3.1 :423；§4.4.3 第 1 条） ----------

function astroTable(engine) {
  const t = engine.rules && engine.rules[SCHEMA.astroTable];
  if (!isObj(t)) throw new KernelError('E-RULES-UNREGISTERED', {}, `rules.${SCHEMA.astroTable} is not registered`);
  return t;
}

function astroKey(t, key) {
  if (!Object.hasOwn(t, key)) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SCHEMA.astroTable}.${key} missing (listed in unbuilt: no source, not defaulted)`);
  return t[key];
}

function ratioOf(v, name) {
  if (!isObj(v) || !isInt(v.num) || !isInt(v.den) || v.den < 1) throw new KernelError('E-DIM-STRUCT-FIELD', {}, `rules.${SCHEMA.astroTable}.${name} must be {num, den}`);
  return v;
}

/**
 * kernelApi `astroView(engine)`（§3.1 :423）：纯函数，rules.astro 年长与历元键的唯一读者。
 * 太阳相位 solarPhase(minute) 返回有理数 {num, den}（0 <= num < den；相位 0 = 北半球春分，§4.4.3 第 1 条）；yearIndex(minute) 是天文年序（自 phaseEpochMinute 起整除，向下取整）；
 * perYearToPerStep(rate, stepMinutes)：按年计的率（定点整数）折成每步的率 = rate × stepMinutes ÷ 年长分钟，BigInt 整除向零截断；
 * yearsFixedOfElapsedMinute(elapsedMinutes)：已过分钟 → 天文年数（定点标度 BigInt，向零截断），年龄、寿命、成年所按的换算只走这一处（卷四 :214、李白 Q-7）；
 * minuteOfYearsFixed(yearsFixed)：天文年数（定点标度）→ 分钟（安全整数），向零截断，是上一项的逆；
 * lunarPhase：synodicDays 无出处（rules.astro.unbuilt），返回 null 并报 W-DIM-GAP。
 * @param {any} engine
 */
export function astroView(engine) {
  const t = astroTable(engine);
  const year = ratioOf(astroKey(t, 'yearDays'), 'yearDays');
  const epoch = astroKey(t, 'phaseEpochMinute');
  const perDay = minutesPerDay(engine);
  const yearMinutes = Object.freeze({ num: year.num * perDay, den: year.den });
  const phaseDen = BigInt(yearMinutes.num);
  const since = (minute) => BigInt(minute - epoch) * BigInt(yearMinutes.den);
  return Object.freeze({
    yearMinutes,
    yearsFixedOfElapsedMinute: (elapsedMinutes) => (BigInt(elapsedMinutes) * BigInt(yearMinutes.den) * fixedScale()) / phaseDen,
    minuteOfYearsFixed: (yearsFixed) => Number((BigInt(yearsFixed) * phaseDen) / (fixedScale() * BigInt(yearMinutes.den))),
    solarPhase: (minute) => {
      let n = since(minute) % phaseDen;
      if (n < 0n) n += phaseDen;
      return Object.freeze({ num: Number(n), den: yearMinutes.num });
    },
    lunarPhase: () => {
      report('W-DIM-GAP', { side: SCHEMA.gapAstroSide, field: SCHEMA.gapLunar });
      return null;
    },
    yearIndex: (minute) => {
      const q = since(minute) / phaseDen;
      return Number(since(minute) < 0n && since(minute) % phaseDen !== 0n ? q - 1n : q);
    },
    perYearToPerStep: (rate, stepMinutes) => (BigInt(rate) * BigInt(stepMinutes) * BigInt(yearMinutes.den)) / phaseDen,
  });
}

// ---------- 加载校验（卷二十 §2.3 :222–:233、§2.6 :294–:306、§2.2 :218） ----------

const CHECK = Object.freeze({
  seasonFamily: 'season',
  schemeFamily: 'season_scheme',
  dayStarts: Object.freeze(['midnight', 'sunrise', 'sunset']),
  intercalModes: Object.freeze(['month']),
  constantsTable: 'kernelConstants',
  lagMaxNum: 'thermalLagMaxNum',
  lagMaxDen: 'thermalLagMaxDen',
  eraModes: Object.freeze(['continuous', 'regnal', 'cyclic']),
});

/**
 * 词表族 calendar 与 season 的条目、rules.astro 的跨字段加载校验（卷二十 §2.3、§2.6、§2.2）：
 * months 的 ordinal 自 1 连续、days >= 1（E-CAL-MONTHS）；intercalation 的 years 属 [1, cycleYears]、mode 属 intercal_mode（month、days）、afterMonth 是已有月序号；
 * weekDays >= 1、dayStart 属 day_start、era.mode 属 era_mode（regnal 须有 resetOn）、rateBasis 两项 >= 1；season 条目的 scheme 是 season_scheme 族条目，同方案 order 自 0 连续、
 * 区间 [phaseFrom, phaseTo) 首尾相接并恰好铺满 [0, 1]（E-SEASON-COVER）；rules.astro.thermalLagPhase 小于登记的上界 1/4（kernelConstants.thermalLagMaxNum/Den，交叉乘）。mode days 的闰日卷文没写 leap 与排位，加载拒收（E-DIM-DOMAIN-ENUM）。
 * 族或表没登记就不核（校验器夹具目录）。返回错误行（形状同 checkClockTables）。
 * @param {Record<string, any>} rules engine.rules @param {{vocab: any}} env 维度加载的 env
 */
export function checkCalendarClimateTables(rules, env) {
  const errors = [];
  const push = (code, table, row, dim, got, want) => errors.push({ code, level: 'L2', table, row, dim, path: `${table}#/${row}${dim ? '/' + dim : ''}`, got, want });
  const entriesOf = (fam) => {
    const f = env.vocab.families.get(fam);
    return f && isObj(f.entries) ? Object.keys(f.entries).sort().map((id) => [id, isObj(f.entries[id]) ? f.entries[id] : {}]) : [];
  };
  const calTable = `_vocab.${SCHEMA.family}`;
  for (const [id, e] of entriesOf(SCHEMA.family)) {
    const months = Array.isArray(e.months) ? e.months : [];
    months.forEach((m, i) => {
      if (!isObj(m) || m.ordinal !== i + 1) push('E-CAL-MONTHS', calTable, id, 'months', isObj(m) ? m.ordinal : m, 'ordinal consecutive from 1');
      if (!isObj(m) || !isInt(m.days) || m.days < 1) push('E-CAL-MONTHS', calTable, id, 'months', isObj(m) ? m.days : m, 'days >= 1');
    });
    if (months.length === 0) push('E-CAL-MONTHS', calTable, id, 'months', 'missing', 'at least one month');
    if (!isInt(e.epochMinute)) push('E-DIM-STRUCT-FIELD', calTable, id, 'epochMinute', e.epochMinute, 'integer');
    if (!isInt(e.weekDays) || e.weekDays < 1) push('E-DIM-DOMAIN-RANGE', calTable, id, 'weekDays', e.weekDays, 'integer >= 1');
    if (!CHECK.dayStarts.includes(e.dayStart)) push('E-DIM-DOMAIN-ENUM', calTable, id, 'dayStart', e.dayStart, CHECK.dayStarts.join('|'));
    if (!isObj(e.rateBasis) || !isInt(e.rateBasis.monthDays) || e.rateBasis.monthDays < 1 || !isInt(e.rateBasis.yearDays) || e.rateBasis.yearDays < 1) push('E-DIM-DOMAIN-RANGE', calTable, id, 'rateBasis', e.rateBasis, '{monthDays, yearDays} integers >= 1');
    if (!isObj(e.era) || !CHECK.eraModes.includes(e.era.mode)) push('E-DIM-DOMAIN-ENUM', calTable, id, 'era', isObj(e.era) ? e.era.mode : e.era, CHECK.eraModes.join('|'));
    else if (e.era.mode === CHECK.eraModes[1] && !(Array.isArray(e.era.resetOn) && e.era.resetOn.length > 0)) push('E-DIM-STRUCT-FIELD', calTable, id, 'era', 'resetOn empty', 'regnal needs resetOn');
    const inter = Array.isArray(e.intercalation) ? e.intercalation : [];
    for (const it of inter) {
      if (!isObj(it) || !isInt(it.cycleYears) || it.cycleYears < 1) { push('E-DIM-DOMAIN-RANGE', calTable, id, 'intercalation', isObj(it) ? it.cycleYears : it, 'cycleYears integer >= 1'); continue; }
      if (!Array.isArray(it.years) || !it.years.every((y) => isInt(y) && y >= 1 && y <= it.cycleYears)) push('E-DIM-DOMAIN-RANGE', calTable, id, 'intercalation', it.years, 'years within [1, cycleYears]');
      if (!CHECK.intercalModes.includes(it.mode)) push('E-DIM-DOMAIN-ENUM', calTable, id, 'intercalation', it.mode, CHECK.intercalModes.join('|'));
      if (!months.some((m) => isObj(m) && m.ordinal === it.afterMonth)) push('E-DIM-REF-MISSING', calTable, id, 'intercalation', it.afterMonth, 'afterMonth is an existing month ordinal');
      if (!isInt(it.days) || it.days < 1) push('E-DIM-DOMAIN-RANGE', calTable, id, 'intercalation', it.days, 'days >= 1');
    }
  }
  const seaTable = `_vocab.${CHECK.seasonFamily}`;
  const schemes = new Set(entriesOf(CHECK.schemeFamily).map(([id]) => id));
  const byScheme = new Map();
  for (const [id, e] of entriesOf(CHECK.seasonFamily)) {
    if (!schemes.has(e.scheme)) { push('E-DIM-REF-MISSING', seaTable, id, 'scheme', e.scheme, `entry of ${CHECK.schemeFamily}`); continue; }
    if (!byScheme.has(e.scheme)) byScheme.set(e.scheme, []);
    byScheme.get(e.scheme).push([id, e]);
  }
  const ratio = (v) => isObj(v) && isInt(v.num) && isInt(v.den) && v.den >= 1;
  for (const [scheme, rows] of [...byScheme].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    rows.sort(([, a], [, b]) => a.order - b.order);
    let prev = { num: 0, den: 1 };
    rows.forEach(([id, e], i) => {
      if (e.order !== i) push('E-DIM-DOMAIN-RANGE', seaTable, id, 'order', e.order, 'consecutive from 0 within the scheme');
      if (!ratio(e.phaseFrom) || !ratio(e.phaseTo)) { push('E-SEASON-COVER', seaTable, id, 'phaseFrom', scheme, 'phaseFrom, phaseTo are {num, den}'); return; }
      if (e.phaseFrom.num * prev.den !== prev.num * e.phaseFrom.den) push('E-SEASON-COVER', seaTable, id, 'phaseFrom', scheme, 'starts where the previous interval ends (first at 0)');
      prev = e.phaseTo;
    });
    if (prev.num !== prev.den) push('E-SEASON-COVER', seaTable, rows[rows.length - 1][0], 'phaseTo', scheme, 'last interval ends at 1');
  }
  const astro = rules && rules[SCHEMA.astroTable];
  if (isObj(astro) && isObj(astro.thermalLagPhase)) {
    const lag = astro.thermalLagPhase;
    const kc = rules && rules[CHECK.constantsTable];
    const up = isObj(kc) ? { num: kc[CHECK.lagMaxNum], den: kc[CHECK.lagMaxDen] } : {};
    const at = `rules.${SCHEMA.astroTable}`;
    // 卷二十 :218 取值域 [0, 1/4)：上界登记在 kernelConstants（thermalLagMaxNum、thermalLagMaxDen），交叉乘比较；上界没登记即报，不放行。
    if (!isInt(up.num) || !isInt(up.den) || up.den < 1) push('E-DIM-STRUCT-FIELD', at, 'thermalLagPhase', '', up, `rules.${CHECK.constantsTable}.${CHECK.lagMaxNum}/${CHECK.lagMaxDen} registered`);
    else if (!(lag.num * up.den < up.num * lag.den)) push('E-DIM-DOMAIN-RANGE', at, 'thermalLagPhase', '', lag, 'below the registered upper bound (vol 20 :218, [0, 1/4))');
  }
  return errors;
}
