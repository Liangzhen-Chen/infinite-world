// 环境读入口 envAt 与菜单读数「此刻」nowOf（卷二十 §2.7、§3.1 :439「本卷唯一的环境读入口」；S2-T1 草案 §4、§5）。
// 季节与天气模型只由本文件 import（门禁 pp_envat_import）。envAt 给 env.solarPhase、env.season 与天气六键 env.weather、env.precipMm、env.windMps、env.windDirDeg、env.cloud、env.humidity（S2-T2，卷二十 §4.3.1）：
// 天气按地点所在天气单元、该时刻的世界日序求（weather.mjs#weatherAt）；某量读不到即该键未知带缺口。
// at 是地点 id 或位置 struct:pos；位置一律按 zoneAt(pos) 的地点层求（泡内按格求未建），zoneAt 为 null 整组未知。
// 全部是种子 + 时间 + 数据的纯派生，不落状态、不进 saveDigest（卷二十 :462），不缓存（主会话 Q10 甲）。

import { KernelError } from '../../kernel/errors.mjs';
import { dim } from '../../kernel/dimensions.mjs';
import { kindOfEntity } from '../../kernel/storage.mjs';
import { clockMinute } from '../../kernel/scheduler.mjs';
import { zoneAt } from '../place/zone.mjs';
import { systemTimeView, calendarFrom, calendarDayIndex, calendarView, dayPartOf } from './calendar.mjs';
import { localPhase, seasonAt, solarTermAt, cellOf } from './season.mjs';
import { weatherAt } from './weather.mjs';

// 天气权重式的装配期编译经本文件转出给 rules/load/mount.mjs（季节与天气模型只由本文件 import，门禁 pp_envat_import；S2-T2 修改轮一）。
export { compileWeather } from './weather.mjs';

// env 键（卷二十 §2.7）。
const KEY = Object.freeze({ solarPhase: 'env.solarPhase', season: 'env.season', weather: 'env.weather' });
// 天气当日量：env 键 → 当日天气值上的字段（卷二十 §2.7、§4.3.1；字段同 weather.mjs#weatherAt 的 WeatherDay，缺口代号只在 weather.mjs）。
/** @type {ReadonlyArray<Readonly<{key: string, field: 'precipMm' | 'windMps' | 'windDirDeg' | 'cloud' | 'humidity'}>>} */
const WEATHER_QTY = Object.freeze([
  Object.freeze({ key: 'env.precipMm', field: 'precipMm' }),
  Object.freeze({ key: 'env.windMps', field: 'windMps' }),
  Object.freeze({ key: 'env.windDirDeg', field: 'windDirDeg' }),
  Object.freeze({ key: 'env.cloud', field: 'cloud' }),
  Object.freeze({ key: 'env.humidity', field: 'humidity' }),
]);
const POS_DIM = 'pos';
const UNKNOWN_READ = 'E-DIM-UNKNOWN-READ';
const GAP = Object.freeze({ place: 'zone_unknown', cell: 'weather_cell', subject: 'no_subject', calendar: 'calendar_from', dayStart: 'day_start', dayParts: 'day_parts' });

/** @template T @typedef {import('./season.mjs').Fact<T>} Fact */
/** @typedef {import('./weather.mjs').WeatherEngine} EnvEngine */
/** @typedef {import('./calendar.mjs').TimeState} TimeState */
/** @param {readonly string[]} gaps @returns {Fact<null>} */
const unknown = (gaps) => Object.freeze({ known: false, value: null, gaps: Object.freeze([...gaps]) });
/** @template T @param {T} value @returns {Fact<T>} */
const known = (value) => Object.freeze({ known: true, value, gaps: Object.freeze([]) });

/**
 * 天气六键（卷二十 §4.3.1）：地点所在单元、该时刻世界日序的当日天气；状态未知则六键同未知，状态已知而某量为 null 则该键未知、缺口取当日天气值上的缺口。
 * @param {EnvEngine} engine @param {TimeState} state @param {string} place @param {number} minute @returns {Record<string, Fact<unknown>>}
 */
function weatherKeys(engine, state, place, minute) {
  const cell = cellOf(engine, place);
  const w = cell === null ? unknown([GAP.cell]) : weatherAt(engine, state, cell, systemTimeView(engine, minute).day);
  const day = w.known ? w.value : null;
  /** @type {Record<string, Fact<unknown>>} */
  const out = { [KEY.weather]: day !== null ? known(day.state) : unknown(w.gaps) };
  for (const q of WEATHER_QTY) {
    const v = day !== null ? day[q.field] : null;
    out[q.key] = v !== null ? known(v) : unknown(day !== null ? day.gaps : w.gaps);
  }
  return out;
}
/** 地点未知时的天气六键。 @param {readonly string[]} gaps */
const unknownWeather = (gaps) => Object.fromEntries([KEY.weather, ...WEATHER_QTY.map((q) => q.key)].map((k) => [k, unknown(gaps)]));

/**
 * envAt（卷二十 :439）：{<env 键>: Fact}。at 为位置时取 zoneAt(pos) 的地点层；地点未知时各键未知（zone_unknown）。
 * @param {EnvEngine} engine @param {TimeState} state @param {string | object} at @param {number} minute
 * @returns {Readonly<Record<string, Fact<unknown>>>}
 */
export function envAt(engine, state, at, minute) {
  const place = typeof at === 'string' ? at : zoneAt(engine, state, at);
  if (place === null) return Object.freeze({ [KEY.solarPhase]: unknown([GAP.place]), [KEY.season]: unknown([GAP.place]), ...unknownWeather([GAP.place]) });
  return Object.freeze({
    [KEY.solarPhase]: localPhase(engine, state, place, minute),
    [KEY.season]: seasonAt(engine, state, place, minute),
    ...weatherKeys(engine, state, place, minute),
  });
}

/**
 * 主体此刻的位置（pos 维度）；读不到为 null。
 * @param {EnvEngine} engine @param {TimeState} state @param {string} subject
 */
function posOf(engine, state, subject) {
  try { return dim(engine, state, kindOfEntity(engine, state, subject), subject, POS_DIM).value; } catch (e) {
    if (e instanceof KernelError && e.code === UNKNOWN_READ) return null;
    throw e;
  }
}

/**
 * nowOf（菜单「此刻」，产品原则 一.5、B38；草案 §4 Now 形状）：
 * {minute, day, minuteOfDay, calendar: {id, year, month, day, leap, weekOfMonth} | null, dayPart, season: {id, growth, wetness, warmth} | null, solarTerm, weather, gaps}。
 * 只给数与代号，显示名交显示层。读不到的项为 null、原因代号进 gaps，不给缺省值。主体为 null（尚无化身）只给系统时间。
 * @param {EnvEngine} engine @param {TimeState} state @param {string | null} subjectId
 */
export function nowOf(engine, state, subjectId) {
  const minute = clockMinute(engine, state);
  const sys = systemTimeView(engine, minute);
  /** @type {string[]} */
  const gaps = [];
  let calendar = null;
  let dayPart = null;
  let season = null;
  let solarTerm = null;
  /** @type {Readonly<Record<string, unknown>> | null} */
  let weather = null;
  if (subjectId === null) gaps.push(GAP.subject);
  else {
    const calId = calendarFrom(engine, state, subjectId);
    if (calId === null) gaps.push(GAP.calendar);
    else {
      const dayIndex = calendarDayIndex(engine, calId, minute);
      if (dayIndex === null) gaps.push(GAP.dayStart);
      else {
        calendar = Object.freeze({ id: calId, ...calendarView(engine, calId, dayIndex) });
        dayPart = dayPartOf(engine, calId, minute);
        if (dayPart === null) gaps.push(GAP.dayParts);
      }
    }
    const pos = posOf(engine, state, subjectId);
    const place = pos === null ? null : zoneAt(engine, state, pos);
    if (place === null) gaps.push(GAP.place);
    else {
      const env = envAt(engine, state, place, minute);
      const s = env[KEY.season];
      const v = Object(s.value);
      if (s.known) season = Object.freeze({ id: v.season, growth: v.growth, wetness: v.wetness, warmth: v.warmth });
      else gaps.push(...s.gaps);
      const t = solarTermAt(engine, state, place, minute);
      if (t.known) solarTerm = t.value;
      else gaps.push(...t.gaps);
      const w = env[KEY.weather];
      if (w.known) {
        weather = Object.freeze({ state: w.value, ...Object.fromEntries(WEATHER_QTY.map((q) => [q.field, env[q.key].value])) });
        for (const q of WEATHER_QTY) gaps.push(...env[q.key].gaps);
      } else gaps.push(...w.gaps);
    }
  }
  return Object.freeze({
    minute, day: sys.day, minuteOfDay: sys.minuteOfDay, calendar, dayPart, season, solarTerm, weather,
    gaps: Object.freeze([...new Set(gaps)].sort()),
  });
}
