// 块 6 第 6-28 张《卷二十历法与温度前移》：日历入口七项、天文年、季节、温度分支（卷二十 §3.1 :414–:439、§4.2、§4.4、§4.5.3）。
// 依据：卷二十 §4.2.5 :600–:605（历法示意行：6929 日一个闰周期）、§4.4.3 :671–:680、§4.4.6 :693–:697 不变量、§4.5.3 :709–:743 与 §4.5.5 :748–:752 手算示例。
// 期望值一律按卷文公式手算成字面量，不用被测函数算；三角项按 det-math 的 10⁸ 标度表查值，容差 2 个定点单位（SCALE 10⁴ 下 0.0002 度）。
// 只跑不推进世界的小检查。
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import {
  calendarFrom, calendarViewFrom, systemTimeView, calendarDayIndex, calendarView, calendarMinuteOf, calendarSpan, calendarAdd, rateBasisView, astroView, checkCalendarClimateTables,
} from '../../server-plugin/kernel/calendar.mjs';
import {
  normalizedSolarPhase, seasonAt, seasonDimension, climateTempC, seasonSwingC, outdoorTemp, groundTemp, indoorTemp, tempAt, daylightMinutes,
  dailyMeanTemp, envelopeUaWPerK, heatPowerW,
} from '../../server-plugin/kernel/climate.mjs';
import { weatherAt, weatherCellOf } from '../../server-plugin/kernel/weather.mjs';

// 内核摘要能力由装配文件注入（卷二 §2.9 :984）；测试里用 node:crypto 装一个，天气抽取键的 sha256 要它。
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const W = loadWorld(ROOT);
assert.ok(W.ok, W.text);
// 卷二十 §4.4、§4.5 的手算示例按 360 日一年写（第 90 日 = 1/4 年，§4.5.3 :716 的 5/6、1/3 年落在第 300、120 日）。真实世界年长取回归年
// 365.24219 日（rules.astro.yearDays，李白 11-19 15:5x ③）；本文件按卷文示例手算的测试用只把 yearDays 换成 360 的引擎，公式与其余规则同真实世界，
// 真实年长下的相位另由「astroView：真实世界年长」一条按 365.24219 手算。
const REAL = { vocab: W.vocab, rules: W.rules, units: W.env.units };
const ENGINE = { ...REAL, rules: { ...W.rules, astro: { ...W.rules.astro, yearDays: { num: 360, den: 1 } } } };
const codeIs = (code) => (e) => e.code === code;
const DAY = 1440;
const near = (got, want, tol = 2) => assert.ok(Math.abs(Number(got) - Number(want)) <= tol, `got ${got}, want ${want} ± ${tol}`);

// 捕获 W-DIM-GAP 一类报告，不让它们打到 stderr。
const reports = [];
useReportSink((rec) => { reports.push(rec); });
const drain = () => reports.splice(0, reports.length);

// 合成历法行的引擎：同一世界的规则与单位，词表里只有这些行（卷二十 §2.3 字段）。
const synth = (rows, extraRules = {}) => ({
  vocab: { index: new Map(Object.entries(rows).map(([id, entry]) => [id, { family: 'calendar', entry }])) },
  rules: { ...W.rules, ...extraRules },
  units: W.env.units,
});
const base = { epochMinute: 0, weekDays: 2, dayStart: 'midnight', era: { mode: 'continuous', resetOn: [], cycleYears: null }, rateBasis: { monthDays: 3, yearDays: 6 } };

// ---------- 历法投影（旧数据两行，§4.2.5） ----------

test('cal_legacy_30：360 日一年、12 月各 30 日；第 0、29、30、359、360 日手算', () => {
  const id = 'cal_legacy_30';
  assert.equal(calendarDayIndex(ENGINE, id, 0), 0);
  assert.equal(calendarDayIndex(ENGINE, id, 43199), 29);
  assert.equal(calendarDayIndex(ENGINE, id, 43200), 30);
  assert.deepEqual({ ...calendarView(ENGINE, id, 0) }, { year: 1, month: 1, day: 1, leap: false, weekOfMonth: 1 });
  // 第 29 日：月内第 30 日，旬内第 10 日，第 3 旬（floor(29 ÷ 10) + 1）。
  assert.deepEqual({ ...calendarView(ENGINE, id, 29) }, { year: 1, month: 1, day: 30, leap: false, weekOfMonth: 3 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 30) }, { year: 1, month: 2, day: 1, leap: false, weekOfMonth: 1 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 359) }, { year: 1, month: 12, day: 30, leap: false, weekOfMonth: 3 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 360) }, { year: 2, month: 1, day: 1, leap: false, weekOfMonth: 1 });
  assert.deepEqual({ ...rateBasisView(ENGINE, id) }, { monthDays: 30, yearDays: 360 });
});

test('cal_default：19 年 7 闰，一个闰周期 6929 日（19 × 354 + 7 × 29，卷二十 §4.2.5 :602）；第 3 年闰六月', () => {
  const id = 'cal_default';
  // 第 1、2 年各 354 日；第 3 年有闰月：前六月 30+29+30+29+30+29 = 177 日，闰月 29 日，全年 383 日。
  assert.deepEqual({ ...calendarView(ENGINE, id, 707) }, { year: 2, month: 12, day: 29, leap: false, weekOfMonth: 3 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 708) }, { year: 3, month: 1, day: 1, leap: false, weekOfMonth: 1 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 884) }, { year: 3, month: 6, day: 29, leap: false, weekOfMonth: 3 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 885) }, { year: 3, month: 6, day: 1, leap: true, weekOfMonth: 1 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 914) }, { year: 3, month: 7, day: 1, leap: false, weekOfMonth: 1 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 1090) }, { year: 3, month: 12, day: 29, leap: false, weekOfMonth: 3 });
  assert.equal(calendarView(ENGINE, id, 1091).year, 4);
  // 第 19 年（闰年）末日 = 日序 6928，日序 6929 是下一周期的第 20 年第 1 日。
  assert.deepEqual({ ...calendarView(ENGINE, id, 6928) }, { year: 19, month: 12, day: 29, leap: false, weekOfMonth: 3 });
  assert.deepEqual({ ...calendarView(ENGINE, id, 6929) }, { year: 20, month: 1, day: 1, leap: false, weekOfMonth: 1 });
});

test('往返：calendarMinuteOf 反算与 calendarDayIndex、calendarView 互为往返（§4.2.6 不变量 ②）；不存在的日期 E-DIM-DOMAIN-RANGE', () => {
  const id = 'cal_default';
  assert.equal(calendarMinuteOf(ENGINE, id, { year: 3, month: 6, day: 1, leap: true }), 885 * DAY);
  assert.equal(calendarMinuteOf(ENGINE, id, { year: 20, month: 1, day: 1, leap: false }), 6929 * DAY);
  for (const d of [0, 1, 353, 354, 708, 885, 913, 914, 1090, 1091, 6928, 6929, 20000]) {
    const v = calendarView(ENGINE, id, d);
    const minute = calendarMinuteOf(ENGINE, id, { year: v.year, month: v.month, day: v.day, leap: v.leap });
    assert.equal(minute, d * DAY);
    assert.equal(calendarDayIndex(ENGINE, id, minute), d);
  }
  assert.throws(() => calendarMinuteOf(ENGINE, id, { year: 1, month: 6, day: 1, leap: true }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => calendarMinuteOf(ENGINE, id, { year: 1, month: 2, day: 30, leap: false }), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => calendarDayIndex(ENGINE, id, -1), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => calendarView(ENGINE, id, -1), codeIs('E-DIM-DOMAIN-RANGE'));
  assert.throws(() => calendarView(ENGINE, 'cal_nope', 0), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => calendarView(ENGINE, 'sea_four_spring', 0), codeIs('E-DIM-REF-MISSING'));
});

test('日序对分钟单调不减、日期对日序字典序严格递增（§4.2.6 不变量 ①）', () => {
  const id = 'cal_default';
  let prev = -1;
  let prevKey = '';
  for (let m = 0; m < 2000 * DAY; m += 777) {
    const d = calendarDayIndex(ENGINE, id, m);
    assert.ok(d >= prev);
    prev = d;
  }
  for (let d = 0; d < 7000; d += 1) {
    const v = calendarView(ENGINE, id, d);
    // 闰月排在 afterMonth 之后：月位 = 月序号 × 2 + （闰月 1 否则 0），按（年，月位，日）补零后字典序比较。
    const key = `${String(v.year).padStart(6, '0')}-${String(v.month * 2 + (v.leap ? 1 : 0)).padStart(3, '0')}-${String(v.day).padStart(3, '0')}`;
    assert.ok(key > prevKey);
    prevKey = key;
  }
});

test('闰日并进月（mode days）卷文没写 leap 含义与排位：运行期报 E-DIM-DOMAIN-ENUM，加载校验拒收，不自补口径', () => {
  const row = { ...base, months: [{ ordinal: 1, days: 3 }, { ordinal: 2, days: 3 }], intercalation: [{ cycleYears: 2, years: [2], mode: 'days', afterMonth: 1, days: 2, obligationAnchor: true }] };
  const E = synth({ cal_x: row });
  assert.throws(() => calendarView(E, 'cal_x', 0), codeIs('E-DIM-DOMAIN-ENUM'));
  assert.deepEqual(checkCalendarClimateTables({ ...W.rules }, envOf({ cal_x: row }, {}, {})).map((x) => x.code), ['E-DIM-DOMAIN-ENUM']);
});

test('epochMinute 不为 0：日序自 epochMinute 起算，早于它 E-DIM-DOMAIN-RANGE', () => {
  const E = synth({ cal_x: { ...base, epochMinute: 5 * DAY, months: [{ ordinal: 1, days: 3 }], intercalation: [] } });
  assert.equal(calendarDayIndex(E, 'cal_x', 5 * DAY), 0);
  assert.equal(calendarDayIndex(E, 'cal_x', 5 * DAY + 3 * DAY), 3);
  assert.equal(calendarMinuteOf(E, 'cal_x', { year: 2, month: 1, day: 1, leap: false }), 8 * DAY);
  assert.throws(() => calendarDayIndex(E, 'cal_x', 5 * DAY - 1), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('dayStart 取日出日落未前移：calendarDayIndex 返回 null（未知）并报 W-DIM-GAP，不当午夜', () => {
  const E = synth({ cal_x: { ...base, months: [{ ordinal: 1, days: 3 }], intercalation: [], dayStart: 'sunrise' } });
  drain();
  assert.equal(calendarDayIndex(E, 'cal_x', 1000, 'plc_x'), null);
  assert.equal(calendarMinuteOf(E, 'cal_x', { year: 1, month: 1, day: 1, leap: false }), null);
  assert.equal(calendarAdd(E, 'cal_x', 1000, { days: 1 }), null);
  assert.equal(calendarSpan(E, 'cal_x', 0, 1000), null);
  const gaps = drain().filter((r) => r.code === 'W-DIM-GAP');
  // calendarSpan 取起止两个日序，各报一次，所以四次调用共五条。
  assert.equal(gaps.length, 5);
  for (const g of gaps) assert.deepEqual({ ...g.fields }, { field: 'day_start', side: 'calendar' });
});

// ---------- 间隔与加法 ----------

test('calendarAdd / calendarSpan：cal_legacy_30 手算；加后再求间隔得原值（不变量 ⑤）', () => {
  const id = 'cal_legacy_30';
  assert.equal(calendarAdd(ENGINE, id, 0, { years: 1 }), 360 * DAY);
  assert.equal(calendarAdd(ENGINE, id, 0, { months: 2 }), 60 * DAY);
  assert.equal(calendarAdd(ENGINE, id, 0, { days: 31 }), 31 * DAY);
  assert.equal(calendarAdd(ENGINE, id, 0, { years: 1, months: 2, days: 4 }), 424 * DAY);
  // 保留时刻内分钟：第 5 日 13:30 加一个月。
  assert.equal(calendarAdd(ENGINE, id, 5 * DAY + 810, { months: 1 }), 35 * DAY + 810);
  assert.deepEqual(calendarSpan(ENGINE, id, 0, 424 * DAY), { years: 1, months: 2, days: 4 });
  assert.deepEqual(calendarSpan(ENGINE, id, 0, 0), { years: 0, months: 0, days: 0 });
  assert.deepEqual(calendarSpan(ENGINE, id, 0, 29 * DAY + 1439), { years: 0, months: 0, days: 29 });
  assert.throws(() => calendarSpan(ENGINE, id, 10, 9), codeIs('E-DIM-DOMAIN-RANGE'));
  for (const add of [{ years: 2, months: 3, days: 5 }, { years: 0, months: 11, days: 29 }, { years: 5, months: 0, days: 0 }]) {
    assert.deepEqual(calendarSpan(ENGINE, id, 100 * DAY, calendarAdd(ENGINE, id, 100 * DAY, add)), add);
  }
});

test('calendarAdd 过闰月：加月沿月单元序走、闰月自成一格；日期落不到原日期（无该闰月、日数超月长）卷文没给口径，返回 null 并报缺口，不截断', () => {
  const id = 'cal_default';
  // 第 3 年闰六月 1 日（日序 885）加一年：第 4 年没有闰六月，原日期不存在，返回 null 并报 add_month_end_clamp 缺口，不退到非闰月。
  drain();
  assert.equal(calendarAdd(ENGINE, id, 885 * DAY, { years: 1 }), null);
  assert.deepEqual(drain().map((r) => ({ ...r.fields })), [{ field: 'add_month_end_clamp', side: 'calendar' }]);
  // 第 3 年闰六月 1 日加 19 年（一个闰周期）：第 22 年同样有闰六月，日期存在。
  assert.equal(calendarAdd(ENGINE, id, 885 * DAY, { years: 19 }), (885 + 6929) * DAY);
  // 第 3 年六月 1 日（日序 708 + 148 = 856）加一个月 = 闰六月 1 日（日序 885）；再加一个月 = 七月 1 日（日序 914）。
  assert.equal(calendarAdd(ENGINE, id, 856 * DAY, { months: 1 }), 885 * DAY);
  assert.equal(calendarAdd(ENGINE, id, 856 * DAY, { months: 2 }), 914 * DAY);
  // 第 3 年 12 月 29 日（日序 1090）加一个月 = 第 4 年一月 29 日（日序 1091 + 28），日期存在。
  assert.equal(calendarAdd(ENGINE, id, 1090 * DAY, { months: 1 }), (1091 + 28) * DAY);
  // 第 1 年一月 30 日（日序 29）加一个月：二月只有 29 日，原日期不存在，不截断，返回 null 并报缺口。
  drain();
  assert.equal(calendarAdd(ENGINE, id, 29 * DAY, { months: 1 }), null);
  assert.equal(drain().length, 1);
  // calendarSpan 把落不到的加法视为"没到"：一月 30 日到三月 1 日（日序 29 → 60）按整月只数得到 0 个月、31 日。
  assert.deepEqual(calendarSpan(ENGINE, id, 29 * DAY, 60 * DAY), { years: 0, months: 0, days: 31 });
  assert.throws(() => calendarAdd(ENGINE, id, 0, { months: -1 }), codeIs('E-DIM-DOMAIN-RANGE'));
});

// ---------- 天文年 ----------

test('astroView：太阳相位 = frac((minute − phaseEpochMinute) ÷ 年长分钟)，年长 360 日 = 518400 分钟；yearIndex；perYearToPerStep', () => {
  const a = astroView(ENGINE);
  assert.deepEqual({ ...a.yearMinutes }, { num: 518400, den: 1 });
  assert.deepEqual({ ...a.solarPhase(0) }, { num: 0, den: 518400 });
  // 90 日 = 1/4 年。
  assert.deepEqual({ ...a.solarPhase(90 * DAY) }, { num: 129600, den: 518400 });
  assert.deepEqual({ ...a.solarPhase(518400) }, { num: 0, den: 518400 });
  assert.deepEqual({ ...a.solarPhase(518400 + 1440) }, { num: 1440, den: 518400 });
  assert.equal(a.yearIndex(518399), 0);
  assert.equal(a.yearIndex(518400), 1);
  assert.equal(a.yearIndex(3 * 518400 + 5), 3);
  // 每年 3600 份折成 1440 分钟一步：3600 × 1440 ÷ 518400 = 10。
  assert.equal(a.perYearToPerStep(3600, 1440), 10n);
  drain();
  assert.equal(a.lunarPhase(0), null);
  assert.equal(drain().filter((r) => r.code === 'W-DIM-GAP').length, 1);
});

test('astroView：真实世界年长 = 回归年 365.24219 日（李白 11-19 15:5x ③）；第 365 日相位 = 365 ÷ 365.24219，第 366 日跨入下一年', () => {
  const a = astroView(REAL);
  // 年长分钟 = 36524219 × 1440 ÷ 100000。
  assert.deepEqual({ ...a.yearMinutes }, { num: 52594875360, den: 100000 });
  // 第 365 日起始分钟 525600：相位分子 = 525600 × 100000 = 52560000000（< 52594875360，仍在第 0 年）。
  assert.deepEqual({ ...a.solarPhase(365 * DAY) }, { num: 52560000000, den: 52594875360 });
  assert.equal(a.yearIndex(365 * DAY), 0);
  // 第 366 日：527040 × 100000 − 52594875360 = 109124640。
  assert.deepEqual({ ...a.solarPhase(366 * DAY) }, { num: 109124640, den: 52594875360 });
  assert.equal(a.yearIndex(366 * DAY), 1);
});

test('astroView：缺 yearDays 报 E-DIM-STRUCT-FIELD、整表没登记报 E-RULES-UNREGISTERED，不给缺省', () => {
  const { yearDays, ...rest } = W.rules.astro;
  void yearDays;
  assert.throws(() => astroView({ ...ENGINE, rules: { ...ENGINE.rules,astro: rest } }), codeIs('E-DIM-STRUCT-FIELD'));
  const { astro, ...noAstro } = W.rules;
  void astro;
  assert.throws(() => astroView({ ...ENGINE, rules: noAstro }), codeIs('E-RULES-UNREGISTERED'));
});

// ---------- 季节 ----------

const NORTH = { latitudeDeg: 38, cell: { seasonScheme: 'ssch_four' } };
const SOUTH = { latitudeDeg: -30, cell: { seasonScheme: 'ssch_four' } };

test('seasonAt：四季方案区间 [0,1/4) [1/4,1/2) [1/2,3/4) [3/4,1)，北半球 0 相位为春；南半球相位加 1/2', () => {
  const at = (input, day) => seasonAt(ENGINE, input, day * DAY).value;
  assert.equal(at(NORTH, 0), 'sea_four_spring');
  assert.equal(at(NORTH, 89), 'sea_four_spring');
  assert.equal(at(NORTH, 90), 'sea_four_summer');
  assert.equal(at(NORTH, 179), 'sea_four_summer');
  assert.equal(at(NORTH, 180), 'sea_four_autumn');
  assert.equal(at(NORTH, 270), 'sea_four_winter');
  assert.equal(at(NORTH, 359), 'sea_four_winter');
  assert.equal(at(NORTH, 360), 'sea_four_spring');
  // 南半球：第 0 日归一相位 1/2 = 秋；第 90 日 3/4 = 冬；第 180 日 0 = 春；第 270 日 1/4 = 夏。
  assert.equal(at(SOUTH, 0), 'sea_four_autumn');
  assert.equal(at(SOUTH, 90), 'sea_four_winter');
  assert.equal(at(SOUTH, 180), 'sea_four_spring');
  assert.equal(at(SOUTH, 270), 'sea_four_summer');
  // 同一日内季节不变（取当日起始分钟的相位）。
  assert.equal(seasonAt(ENGINE, NORTH, 90 * DAY - 1).value, 'sea_four_spring');
  assert.equal(seasonAt(ENGINE, NORTH, 90 * DAY + 1439).value, 'sea_four_summer');
});

test('normalizedSolarPhase：纬度互为相反数的两地相差 1/2（§4.4.6 不变量 ②）；更换历法不改季节（④）', () => {
  const n = normalizedSolarPhase(ENGINE, { latitudeDeg: 30 }, 0);
  const s = normalizedSolarPhase(ENGINE, { latitudeDeg: -30 }, 0);
  assert.deepEqual([n.num, n.den], [0, 518400]);
  assert.deepEqual([s.num, s.den], [518400, 1036800]);
  const m = 40 * DAY;
  const n2 = normalizedSolarPhase(ENGINE, { latitudeDeg: 30 }, m);
  const s2 = normalizedSolarPhase(ENGINE, { latitudeDeg: -30 }, m);
  // 40 日 = 40/360 = 1/9；南 = 1/9 + 1/2 = 11/18。分数相等用交叉乘。
  assert.equal(n2.num * 9, n2.den);
  assert.equal(s2.num * 18, s2.den * 11);
  // 历法只管年月日，季节只读太阳相位：两部历法下同一分钟同一地点同一季节。
  const a = seasonAt(ENGINE, NORTH, 200 * DAY).value;
  assert.equal(a, 'sea_four_autumn');
  void calendarView(ENGINE, 'cal_default', 200);
  void calendarView(ENGINE, 'cal_legacy_30', 200);
  assert.equal(seasonAt(ENGINE, NORTH, 200 * DAY).value, a);
});

test('seasonDimension：真实世界四季行三个数值维度已按太原实测入表（数值见 taiyuan-climate.test.mjs 手算）；行上没有的维度未知并带缺口，不当 0；行上有值才读得到', () => {
  drain();
  for (const id of ['sea_four_spring', 'sea_four_summer', 'sea_four_autumn', 'sea_four_winter']) {
    for (const dim of ['growth', 'wetness', 'warmth']) {
      const u = seasonDimension(ENGINE, id, dim);
      assert.equal(u.known, true);
      assert.ok(u.value >= 0 && u.value <= 1);
    }
  }
  assert.equal(drain().filter((r) => r.code === 'W-DIM-GAP').length, 0);
  // 夹具：一行带 growth 0.7 的季节行（假设数据，只验读法）。
  const E = { vocab: { index: new Map([['sea_x', { family: 'season', entry: { growth: 0.7 } }]]) } };
  assert.equal(seasonDimension(E, 'sea_x', 'growth').value, 0.7);
  assert.equal(seasonDimension(E, 'sea_x', 'growth').fixed, 7000n);
  assert.equal(seasonDimension(E, 'sea_x', 'warmth').known, false);
  assert.throws(() => seasonDimension(ENGINE, 'sea_four_summer', 'price'), codeIs('E-DIM-REF-MISSING'));
  assert.throws(() => seasonDimension(ENGINE, 'cal_default', 'growth'), codeIs('E-DIM-REF-MISSING'));
});

test('seasonAt：缺方案或缺纬度即未知并带缺口（不默认四季、不默认北半球）；日照公式未前移一律未知', () => {
  drain();
  const a = seasonAt(ENGINE, { latitudeDeg: 38, cell: {} }, 0);
  assert.deepEqual([a.known, ...a.gaps], [false, 'season_scheme']);
  const b = seasonAt(ENGINE, { cell: { seasonScheme: 'ssch_four' } }, 0);
  assert.deepEqual([b.known, ...b.gaps], [false, 'latitude_deg']);
  const c = seasonAt(ENGINE, { latitudeDeg: 38, cell: { seasonScheme: 'ssch_nope' } }, 0);
  assert.deepEqual([c.known, ...c.gaps], [false, 'season_row']);
  assert.deepEqual([daylightMinutes().known, ...daylightMinutes().gaps], [false, 'daylight_minutes']);
  assert.ok(drain().length >= 4);
});

// ---------- 温度（§4.5.3，§4.5.5 手算示例） ----------

// 高山隘口（§4.5.5 :751）：单元年均温 12，单元所在地点海拔 400，隘口海拔 2400，tempAmpC 10。
const PASS = { latitudeDeg: 38, cellElevationM: 400, surfaceRefElevationM: 2400, enclosed: false, underground: false, cell: { annualMeanTempC: 12, tempAmpC: 10, seasonScheme: 'ssch_four' } };

test('climateTempC：12 + (−0.0065) × (2400 − 400) = −1 度（§4.5.5 :751）；同单元两地之差 = 梯度 × 海拔差（§4.5.6 ⑥）', () => {
  const c = climateTempC(ENGINE, PASS);
  assert.equal(c.fixed, -10000n);
  assert.equal(c.value, -1);
  assert.equal(c.unit, 'celsius');
  const lower = climateTempC(ENGINE, { ...PASS, surfaceRefElevationM: 1400 });
  // 1400：12 − 0.0065 × 1000 = 5.5；两地之差 −1 − 5.5 = −6.5 = −0.0065 × 1000。
  assert.equal(lower.fixed, 55000n);
  assert.equal(c.fixed - lower.fixed, -65000n);
  // 缺任一输入即未知，列出缺项；不拿 0 海拔顶。
  const u = climateTempC(ENGINE, { ...PASS, surfaceRefElevationM: undefined, cell: {} });
  assert.deepEqual([u.known, ...u.gaps], [false, 'cell_annual_mean_temp', 'elevation_inputs']);
});

test('seasonSwingC：thermalLagPhase 1/12；春分 −0.5×振幅、秋分 +0.5×振幅、冬至 −0.866×振幅、相位 5/6 取最小 −振幅、1/3 取最大 +振幅（§4.5.3 手算校核 :716）', () => {
  const swing = (minute, input = PASS) => seasonSwingC(ENGINE, input, minute).fixed;
  near(swing(0), -50000n);
  near(swing(259200), 50000n);
  near(swing(388800), -86602n);
  near(swing(432000), -100000n);
  near(swing(172800), 100000n);
  // 南半球同一时刻符号相反（§4.5.6 ③）：北半球取最大的 172800，南半球（相位 + 1/2 = 5/6）取最小。
  near(swing(172800, { ...PASS, latitudeDeg: -35 }), -100000n);
  near(swing(432000, { ...PASS, latitudeDeg: -35 }), 100000n);
});

test('全年季节摆动的最小、最大落在 5/6 与 1/3 年处（日序 300、120）；30 日序列同输入同值（确定）', () => {
  let min = { d: -1, v: 0n }; let max = { d: -1, v: 0n };
  for (let d = 0; d < 360; d += 1) {
    const v = seasonSwingC(ENGINE, PASS, d * DAY).fixed;
    if (d === 0 || v < min.v) min = { d, v };
    if (d === 0 || v > max.v) max = { d, v };
  }
  assert.equal(min.d, 300);
  assert.equal(max.d, 120);
  // 两次独立装载（各自 loadWorld）同输入逐日比对 30 日；并与按卷文公式手算的第 0、1、29 日（−1 + 10 × sin(2π × (相位 − 1/12))，相位按当日 10:00）比对。
  const W2 = loadWorld(ROOT);
  assert.ok(W2.ok, W2.text);
  const ENGINE2 = { vocab: W2.vocab, rules: { ...W2.rules, astro: { ...W2.rules.astro, yearDays: { num: 360, den: 1 } } }, units: W2.env.units };
  for (let d = 0; d < 30; d += 1) assert.equal(outdoorTemp(ENGINE2, PASS, d * DAY + 600).fixed, outdoorTemp(ENGINE, PASS, d * DAY + 600).fixed);
  near(outdoorTemp(ENGINE, PASS, 600).fixed, -59369n, 3);
  near(outdoorTemp(ENGINE, PASS, DAY + 600).fixed, -57844n, 3);
  near(outdoorTemp(ENGINE, PASS, 29 * DAY + 600).fixed, -11018n, 3);
  // 春分后到夏季气温上行：第 30 日（相位 1/12，自变量 0）摆动 = 0，高于第 0 日（−5），低于第 120 日。
  const t = (d) => outdoorTemp(ENGINE, PASS, d * DAY).fixed;
  assert.ok(t(30) > t(0));
  assert.ok(t(120) > t(30));
});

test('outdoorTemp：冬至当日 −1 − 8.66 = −9.66 度（§4.5.5 :751）；没有天气时昼夜项与天气偏移列入缺口、结果标 partial，不当 0', () => {
  const r = outdoorTemp(ENGINE, PASS, 270 * DAY);
  near(r.fixed, -96602n);
  assert.equal(r.partial, true);
  assert.deepEqual([...r.gaps], ['diurnal_term', 'weather_temp_offset']);
});

test('outdoorTemp：交入当日天气偏移则只剩昼夜项缺口；规则表给了 cloudDamp、diurnalPeakMinute 且交入云量，昼夜项按公式加入', () => {
  const withOffset = outdoorTemp(ENGINE, { ...PASS, weather: { tempOffsetC: 2 } }, 270 * DAY);
  near(withOffset.fixed, -96602n + 20000n);
  assert.deepEqual([...withOffset.gaps], ['diurnal_term']);
  const rules = { climate: { ...W.rules.climate, cloudDamp: 0.5, diurnalPeakMinute: 840 } };
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,...rules } };
  const input = { ...PASS, cell: { ...PASS.cell, diurnalAmpC: 6 }, weather: { cloud: 0.5, tempOffsetC: 0 } };
  // 昼夜振幅 6 ×（1 − 0.5 × 0.5）= 4.5；地方时 840 取峰值 +4.5，地方时 1560（差 720 分钟 = 半日）取 −4.5。
  const without = (m) => outdoorTemp(ENGINE, PASS, m).fixed;
  const withD = (m) => outdoorTemp(E2, input, m);
  near(withD(840).fixed - without(840), 45000n);
  near(withD(1560).fixed - without(1560), -45000n);
  assert.equal(withD(840).partial, false);
  assert.deepEqual([...withD(840).gaps], []);
  // 峰值之后一整日同一地方时同值。
  near(withD(840 + 5 * DAY).fixed - without(840 + 5 * DAY), 45000n);
});

test('groundTemp：洞穴 8 度、深 30 米、damp(30) = 0、梯度 0.03 → 8.9 度，冬夏不变（§4.5.5 :752）；曲线没给即整支未知', () => {
  const cave = { latitudeDeg: 38, cellElevationM: 0, surfaceRefElevationM: 0, enclosed: false, underground: true, depthM: 30, cell: { annualMeanTempC: 8, tempAmpC: 10 } };
  const u = groundTemp(ENGINE, cave, 0);
  assert.deepEqual([u.known, ...u.gaps], [false, 'geothermal_gradient', 'ground_damp_curve']);
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,climate: { ...W.rules.climate, groundDampCurve: [[0, 1], [30, 0]], geothermalGradient: 0.03 } } };
  assert.equal(groundTemp(E2, cave, 0).fixed, 89000n);
  assert.equal(groundTemp(E2, cave, 270 * DAY).fixed, 89000n);
  // 深度 0：季节摆动全传到 → 等于常年气温 + 摆动；深度 15：damp = 0.5 → 摆动减半。
  const shallow = groundTemp(E2, { ...cave, depthM: 0 }, 432000);
  near(shallow.fixed, 80000n - 100000n);
  const half = groundTemp(E2, { ...cave, depthM: 15 }, 432000);
  // 8 + (−10 × 0.5) + 0.03 × 15 = 3.45。
  near(half.fixed, 34500n);
  assert.deepEqual([...half.gaps], []);
  // 缺深度即未知。
  const nd = groundTemp(E2, { ...cave, depthM: undefined }, 0);
  assert.deepEqual([nd.known, ...nd.gaps], [false, 'depth_m']);
});

test('indoorTemp：室内 = 外侧基准 + 热源功率 ÷ 散热能力；热源 0 时等于外侧基准；散热能力未知则未知，不拿外侧基准代替（第 4 条）', () => {
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,climate: { ...W.rules.climate, groundDampCurve: [[0, 1], [30, 0]], geothermalGradient: 0.03 } } };
  const cellar = { latitudeDeg: 38, cellElevationM: 0, surfaceRefElevationM: 0, enclosed: true, underground: true, depthM: 30, cell: { annualMeanTempC: 8, tempAmpC: 10 } };
  // 外侧 = 地下基准 8.9；3000 ÷ 150 = 20 → 28.9。
  assert.equal(indoorTemp(E2, { ...cellar, heatPowerW: 3000, envelopeUaWPerK: 150 }, 0).fixed, 289000n);
  assert.equal(indoorTemp(E2, { ...cellar, heatPowerW: 0, envelopeUaWPerK: 150 }, 0).fixed, 89000n);
  // 地面上的围护：外侧基准取室外温度（§4.5.6 ① 地面围护是室外温度）；热源 0 时与室外一支同值，且继承室外项的缺口。
  const room = { ...PASS, enclosed: true, heatPowerW: 0, envelopeUaWPerK: 150 };
  const out = outdoorTemp(ENGINE, PASS, 270 * DAY);
  const inn = indoorTemp(ENGINE, room, 270 * DAY);
  assert.equal(inn.fixed, out.fixed);
  assert.deepEqual([...inn.gaps], [...out.gaps]);
  // 热源增大，室温不减。
  assert.ok(indoorTemp(ENGINE, { ...room, heatPowerW: 300 }, 270 * DAY).fixed > inn.fixed);
  const noUa = indoorTemp(ENGINE, { ...room, envelopeUaWPerK: undefined }, 270 * DAY);
  assert.deepEqual([noUa.known, ...noUa.gaps], [false, 'envelope_ua']);
  const noHeat = indoorTemp(ENGINE, { ...room, heatPowerW: undefined }, 270 * DAY);
  assert.deepEqual([noHeat.known, ...noHeat.gaps], [false, 'heat_power']);
});

test('tempAt：四种 (enclosed, underground) 组合各恰好命中分支规则一行（§4.5.6 ⑨）；两个布尔缺即未知', () => {
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,climate: { ...W.rules.climate, groundDampCurve: [[0, 1], [30, 0]], geothermalGradient: 0.03 } } };
  const p = { ...PASS, depthM: 30, heatPowerW: 3000, envelopeUaWPerK: 150 };
  const m = 100 * DAY;
  const f = (enclosed, underground) => tempAt(E2, { ...p, enclosed, underground }, m);
  assert.equal(f(false, false).fixed, outdoorTemp(E2, p, m).fixed);
  assert.equal(f(false, true).fixed, groundTemp(E2, p, m).fixed);
  assert.equal(f(true, false).fixed, indoorTemp(E2, { ...p, underground: false }, m).fixed);
  assert.equal(f(true, true).fixed, indoorTemp(E2, { ...p, underground: true }, m).fixed);
  // 围护在地下与不在地下，外侧基准不同：地下的不读昼夜与天气，所以不带这两项缺口（§4.5.6 ⑦）。
  assert.deepEqual([...f(true, true).gaps], []);
  assert.deepEqual([...f(true, false).gaps], ['diurnal_term', 'weather_temp_offset']);
  const u = tempAt(E2, { ...p, enclosed: undefined }, m);
  assert.deepEqual([u.known, ...u.gaps], [false, 'enclosed_underground_flags']);
});

test('minutesPerMeterEast 非 0 时不静默忽略：outdoorTemp 报 E-DIM-STRUCT-FIELD', () => {
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,astro: { ...W.rules.astro, minutesPerMeterEast: 1 } } };
  assert.throws(() => outdoorTemp(E2, PASS, 0), codeIs('E-DIM-STRUCT-FIELD'));
});

// ---------- 加载校验 ----------

const envOf = (calendar, season, scheme) => ({
  vocab: { families: new Map([['calendar', { entries: calendar }], ['season', { entries: season }], ['season_scheme', { entries: scheme }]]) },
});

test('checkCalendarClimateTables：真实世界 0 错；月序号断档 E-CAL-MONTHS；季节区间留缝 E-SEASON-COVER；闰年序越界、未知枚举各报码', () => {
  assert.deepEqual(checkCalendarClimateTables(W.rules, { vocab: W.vocab }), []);
  const good = { ...base, months: [{ ordinal: 1, days: 3 }, { ordinal: 2, days: 3 }], intercalation: [] };
  const sch = { ssch_a: {} };
  const full = (rows) => rows.map(([order, f, t]) => [`sea_${order}`, { scheme: 'ssch_a', order, phaseFrom: { num: f[0], den: f[1] }, phaseTo: { num: t[0], den: t[1] } }]);
  const okSeasons = Object.fromEntries(full([[0, [0, 2], [1, 2]], [1, [1, 2], [2, 2]]]));
  assert.deepEqual(checkCalendarClimateTables({}, envOf({ cal_a: good }, okSeasons, sch)), []);
  const codes = (e) => checkCalendarClimateTables({}, e).map((x) => x.code);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, months: [{ ordinal: 1, days: 3 }, { ordinal: 3, days: 3 }] } }, okSeasons, sch)), ['E-CAL-MONTHS']);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, months: [{ ordinal: 1, days: 0 }, { ordinal: 2, days: 3 }] } }, okSeasons, sch)), ['E-CAL-MONTHS']);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, intercalation: [{ cycleYears: 2, years: [3], mode: 'month', afterMonth: 1, days: 2, obligationAnchor: true }] } }, okSeasons, sch)), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, intercalation: [{ cycleYears: 2, years: [1], mode: 'weeks', afterMonth: 1, days: 2, obligationAnchor: true }] } }, okSeasons, sch)), ['E-DIM-DOMAIN-ENUM']);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, dayStart: 'noon' } }, okSeasons, sch)), ['E-DIM-DOMAIN-ENUM']);
  assert.deepEqual(codes(envOf({ cal_a: { ...good, weekDays: 0 } }, okSeasons, sch)), ['E-DIM-DOMAIN-RANGE']);
  const gap = Object.fromEntries(full([[0, [0, 2], [1, 3]], [1, [1, 2], [2, 2]]]));
  assert.deepEqual(codes(envOf({}, gap, sch)), ['E-SEASON-COVER']);
  const short = Object.fromEntries(full([[0, [0, 2], [1, 2]]]));
  assert.deepEqual(codes(envOf({}, short, sch)), ['E-SEASON-COVER']);
  const badOrder = Object.fromEntries(full([[0, [0, 2], [1, 2]], [2, [1, 2], [2, 2]]]));
  assert.deepEqual(codes(envOf({}, badOrder, sch)), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(codes(envOf({}, okSeasons, {})), ['E-DIM-REF-MISSING', 'E-DIM-REF-MISSING']);
  // thermalLagPhase 域 [0, 1/4)：上界登记在 kernelConstants（thermalLagMaxNum、thermalLagMaxDen），交叉乘比较。
  const lagRules = (lag, kc = { thermalLagMaxNum: 1, thermalLagMaxDen: 4 }) => ({ astro: { thermalLagPhase: lag }, kernelConstants: kc });
  const lagCodes = (lag, kc) => checkCalendarClimateTables(lagRules(lag, kc), envOf({}, {}, {})).map((x) => x.code);
  assert.deepEqual(lagCodes({ num: 1, den: 12 }), []);
  assert.deepEqual(lagCodes({ num: 0, den: 1 }), []);
  assert.deepEqual(lagCodes({ num: 24, den: 100 }), []);
  assert.deepEqual(lagCodes({ num: 1, den: 4 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(lagCodes({ num: 25, den: 100 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(lagCodes({ num: 12, den: 12 }), ['E-DIM-DOMAIN-RANGE']);
  assert.deepEqual(lagCodes({ num: 1, den: 12 }, {}), ['E-DIM-STRUCT-FIELD']);
  assert.deepEqual(lagCodes({ num: 1, den: 12 }, { thermalLagMaxNum: 1, thermalLagMaxDen: 0 }), ['E-DIM-STRUCT-FIELD']);
  // 真实世界的登记常数是 1/4。
  assert.equal(W.rules.kernelConstants.thermalLagMaxNum, 1);
  assert.equal(W.rules.kernelConstants.thermalLagMaxDen, 4);
});

// ---------- 天气 §4.3.3 第 1–4 条：weightRX 是数据里的 RX 文本，加载期经 compileRXInScope 编，weatherAt 只读编好的树 ----------

const ROOT_DIMS = 'world/ontology/dimensions';
// 抄一份真实 world 到仓库外临时根，改词表行后经统一加载器加载；返回 loadWorld 的结果（成功时 weightRX 树已装入 kernel/weather.mjs）。
function loadEditedWorld(editVocab) {
  const tmp = testTempRoot('wx-load-');
  try {
    for (const f of readdirSync(join(ROOT, ROOT_DIMS)).filter((n) => n.endsWith('.json'))) {
      let text = readFileSync(join(ROOT, ROOT_DIMS, f), 'utf8');
      if (f === '_vocab.json') { const doc = JSON.parse(text); editVocab(doc.families.weather.entries); text = JSON.stringify(doc); }
      writeUnderTempRoot(tmp, `dims/${f}`, text);
    }
    const readRule = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const reg = JSON.parse(readRule('registry.json'));
    writeUnderTempRoot(tmp, 'rules/registry.json', JSON.stringify(reg));
    for (const row of reg.rows) writeUnderTempRoot(tmp, `rules/${row.file}`, readRule(row.file));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, join(tmp, 'dims')), rulesDir: join(tmp, 'rules') });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
// 两个天气行：晴（wx_clear，旧数据 tempOffsetC 2）与雾（wx_fog，旧数据 tempOffsetC −1），权重文本与持续性由夹具给；其余四行不给频度。
const WX_FIELDS = ['weightRX', 'persistence', 'cloud', 'precipMm', 'windMps', 'windDirSpreadDeg', 'precipPhaseFrom'];
const wxEngine = (a, b, table = { anchorDays: 4, weightScale: 1, persistBase: 1 }) => {
  // 真实世界这两行已带太原实测字段；夹具先清掉，只留这里给的字段，验的是读法而不是数据。
  const r = loadEditedWorld((rows) => { for (const id of ['wx_clear', 'wx_fog']) for (const k of WX_FIELDS) delete rows[id][k]; Object.assign(rows.wx_clear, a); Object.assign(rows.wx_fog, b); });
  assert.ok(r.ok, r.text);
  return { vocab: r.vocab, rules: { ...r.rules, weather: table }, units: r.env.units };
};
const wxCtx = (over = {}) => ({ worldSeed: 'seed_one', streamCode: 'weather', cellId: 'plc_cell_one', latitudeDeg: 30, cell: { weatherCommonality: { wx_clear: 1, wx_fog: 1 }, staticDims: {} }, ...over });
const states = (E, ctx, n) => Array.from({ length: n }, (_, d) => weatherAt(E, ctx, d).state.value);
const A = { weightRX: '1', persistence: 3, cloud: 0.5 };
const B = { weightRX: 'env.solarPhase + 1', persistence: 3 };

test('weatherAt：同种子同单元同日的状态与读取顺序无关（先求后一天再求前一天同值）；换种子、换单元在 40 日内必出现不同', () => {
  const E = wxEngine(A, B);
  const forward = states(E, wxCtx(), 40);
  const backward = [];
  for (let d = 39; d >= 0; d -= 1) backward[d] = weatherAt(E, wxCtx(), d).state.value;
  assert.deepEqual(forward, backward);
  assert.ok(forward.every((v) => v === 'wx_clear' || v === 'wx_fog'));
  assert.ok(forward.includes('wx_clear') && forward.includes('wx_fog'));
  assert.notDeepEqual(states(E, wxCtx({ worldSeed: 'seed_two' }), 40), forward);
  assert.notDeepEqual(states(E, wxCtx({ cellId: 'plc_cell_two' }), 40), forward);
  // 另一次独立装载同种子同值。
  assert.deepEqual(states(wxEngine(A, B), wxCtx(), 40), forward);
});

test('weatherAt：锚段首日只按权重抽，与 persistence 无关；persistence 极大时段内各日同前一日（§4.3.3 第 2 条）', () => {
  const loose = states(wxEngine(A, B), wxCtx(), 40);
  const held = states(wxEngine({ ...A, persistence: 1000000 }, { ...B, persistence: 1000000 }), wxCtx(), 40);
  for (let start = 0; start < 40; start += 4) {
    assert.equal(held[start], loose[start]);
    for (let k = 1; k < 4; k += 1) assert.equal(held[start + k], held[start]);
  }
});

test('weatherAt：权重 = 单元频度 × weightRX 文本的值；weightRX 为 0 或频度为 0 的状态抽不到；weightRX 可读 env.solarPhase', () => {
  const E = wxEngine(A, { ...B, weightRX: '0' });
  assert.ok(states(E, wxCtx(), 60).every((v) => v === 'wx_clear'));
  const E2 = wxEngine(A, B);
  assert.ok(states(E2, wxCtx({ cell: { weatherCommonality: { wx_fog: 5 }, staticDims: {} } }), 60).every((v) => v === 'wx_fog'));
  assert.ok(states(E2, wxCtx({ cell: { weatherCommonality: { wx_clear: 0, wx_fog: 1 }, staticDims: {} } }), 60).every((v) => v === 'wx_fog'));
});

test('weightRX 加载期编译：写错的文本（未知维度、非法算符、类型不合）加载即失败 E-MOD-RX；非文本同；结果为负读时报 E-WX-WEIGHT', () => {
  const bad = (rx) => loadEditedWorld((rows) => { rows.wx_clear.weightRX = rx; });
  for (const text of ['nosuchdimension + 1', '1 +', 'env.solarPhase && 1', 'broader(a, b)']) {
    const r = bad(text);
    assert.equal(r.ok, false, text);
    assert.ok(r.errors.some((e) => e.code === 'E-MOD-RX' && e.row === 'wx_clear' && e.dim === 'weightRX'), text + JSON.stringify(r.errors.slice(0, 3)));
  }
  const nonText = bad({ op: 'num', value: 1 });
  assert.equal(nonText.ok, false);
  assert.ok(nonText.errors.some((e) => e.code === 'E-MOD-RX' && e.row === 'wx_clear'));
  // 编得过、读时为负：E-WX-WEIGHT。
  const E = wxEngine({ ...A, weightRX: '0 - 1' }, B);
  assert.throws(() => weatherAt(E, wxCtx(), 0), codeIs('E-WX-WEIGHT'));
  // 行上有文本但没装加载产物（没经加载入口）：按缺口，不读文本。
  const raw = { vocab: { index: new Map([['wx_x', { family: 'weather', entry: { weightRX: '1', persistence: 3 } }]]) }, rules: { ...W.rules, weather: { anchorDays: 4, weightScale: 1, persistBase: 1 } }, units: W.env.units };
  const r = weatherAt(raw, wxCtx({ cell: { weatherCommonality: { wx_x: 1 }, staticDims: {} } }), 0);
  assert.deepEqual([r.state.known, ...r.state.gaps], [false, 'weather_weight_rx']);
});

test('weatherAt：当日量取状态行字段；行上没有的量（cloud）未知并带缺口；权重全 0、缺 weightRX、缺 weightScale、缺种子都未知，不拿某个状态兜底', () => {
  const E = wxEngine(A, B);
  const find = (id) => { for (let d = 0; d < 60; d += 1) { const w = weatherAt(E, wxCtx(), d); if (w.state.value === id) return w; } return null; };
  const clear = find('wx_clear');
  assert.equal(clear.tempOffsetC.value, 2);
  assert.equal(clear.humidity.value, 0.4);
  assert.equal(clear.cloud.value, 0.5);
  const fog = find('wx_fog');
  assert.equal(fog.tempOffsetC.value, -1);
  assert.deepEqual([fog.cloud.known, ...fog.cloud.gaps], [false, 'weather_cloud']);
  const zero = weatherAt(E, wxCtx({ cell: { weatherCommonality: {}, staticDims: {} } }), 0);
  assert.deepEqual([zero.state.known, ...zero.state.gaps], [false, 'weather_weights_zero']);
  const noRx = weatherAt(wxEngine({ persistence: 3 }, { persistence: 3 }), wxCtx(), 0);
  assert.deepEqual([noRx.state.known, ...noRx.state.gaps], [false, 'weather_weight_rx']);
  assert.deepEqual([...weatherAt({ ...E, rules: { ...E.rules, weather: { anchorDays: 4, persistBase: 1 } } }, wxCtx(), 0).state.gaps], ['weather_weight_scale']);
  assert.deepEqual([...weatherAt(E, wxCtx({ worldSeed: undefined }), 0).state.gaps], ['weather_world_seed']);
  // 加载产物是全局装入的最近一次：每次要用某个夹具世界前重新装载它。
  const E2 = wxEngine(A, B, { anchorDays: 4, weightScale: 1 });
  assert.equal(weatherAt(E2, wxCtx(), 0).state.known, true);
  assert.deepEqual([...weatherAt(E2, wxCtx(), 1).state.gaps], ['weather_persist_base']);
  const E3 = wxEngine({ weightRX: '1' }, { weightRX: '1' });
  assert.deepEqual([...weatherAt(E3, wxCtx(), 1).state.gaps], ['weather_persistence']);
});

test('weatherAt：真实世界旧 tempOffsetC、humidity 仍在行上，旧 persistence 0.45 不转（现 persistence 是太原实测换算的整数，见 taiyuan-climate.test.mjs）；日序为负报码', () => {
  assert.equal(W.rules.weather.anchorDays, 360);
  assert.equal(W.vocab.index.get('wx_rain').entry.tempOffsetC, -2);
  assert.equal(W.vocab.index.get('wx_snow').entry.humidity, 0.75);
  for (const [, rec] of W.vocab.index) if (rec.family === 'weather') assert.ok(Number.isInteger(rec.entry.persistence) && rec.entry.persistence >= 1);
  assert.throws(() => weatherAt(ENGINE, wxCtx(), -1), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('weatherCellOf：取包含树上最近的挂天气单元的祖先；一个都没有即未知', () => {
  const chain = [{ id: 'plc_room', cell: null }, { id: 'plc_town', cell: { x: 1 } }, { id: 'plc_root', cell: { x: 2 } }];
  assert.equal(weatherCellOf(chain).value, 'plc_town');
  assert.equal(weatherCellOf([{ id: 'plc_root', cell: { x: 2 } }]).value, 'plc_root');
  assert.deepEqual([weatherCellOf([{ id: 'plc_a' }]).known, ...weatherCellOf([{ id: 'plc_a' }]).gaps], [false, 'weather_cell']);
});

// ---------- 日均温（§4.11.3 第 2 条，勘误 1119k1：解析式、不含昼夜项）、散热能力（卷十九 §4.1 规则 4）、热源功率（§4.5.3 第 3 条） ----------

test('dailyMeanTemp：常年气温 + 季节摆动在该日上的解析式平均 + 当日偏移；按卷文公式手算字面量；与 cloudDamp、diurnalPeakMinute 无关', () => {
  // 手算：−1 + 10 × (cos a0 − cos a1) ÷ (a1 − a0)，a = 2π × (相位 − 1/12)，一日 = 1/360 年；第 0、120、300 日；南半球（相位 + 1/2）第 0 日。
  near(dailyMeanTemp(ENGINE, PASS, 0).fixed, -59242n, 3);
  near(dailyMeanTemp(ENGINE, PASS, 120).fixed, 89995n, 3);
  near(dailyMeanTemp(ENGINE, PASS, 300).fixed, -109995n, 3);
  near(dailyMeanTemp(ENGINE, { ...PASS, latitudeDeg: -35 }, 0).fixed, 39242n, 3);
  assert.deepEqual([...dailyMeanTemp(ENGINE, PASS, 0).gaps], ['weather_temp_offset']);
  const withOffset = dailyMeanTemp(ENGINE, { ...PASS, weather: { tempOffsetC: 2 } }, 0);
  near(withOffset.fixed, -59242n + 20000n, 3);
  assert.deepEqual([...withOffset.gaps], []);
  assert.equal(withOffset.unit, 'celsius');
  // 不读昼夜参数：规则表给了 cloudDamp、diurnalPeakMinute、输入给了昼夜振幅与云量，日均温不变。
  const full = { ...ENGINE, rules: { ...ENGINE.rules,climate: { ...W.rules.climate, cloudDamp: 0.5, diurnalPeakMinute: 840 } } };
  const input = { ...PASS, cell: { ...PASS.cell, diurnalAmpC: 6 }, weather: { cloud: 0.3, tempOffsetC: 0 } };
  assert.equal(dailyMeanTemp(full, input, 120).fixed, dailyMeanTemp(ENGINE, { ...PASS, weather: { tempOffsetC: 0 } }, 120).fixed);
  // 日均温与一日内许多等距点上完整室外温度的平均一致（解析式的独立证据，容差 4 个定点单位）。
  let total = 0n;
  for (let m = 0; m < DAY; m += 10) total += outdoorTemp(full, input, 120 * DAY + m).fixed;
  near(total / BigInt(DAY / 10), dailyMeanTemp(full, input, 120).fixed, 4);
  // 缺输入即未知；旧键 dailySampleMinutes 不再是登记键。
  const u = dailyMeanTemp(ENGINE, { ...PASS, cell: { annualMeanTempC: 12 } }, 0);
  assert.deepEqual([u.known, ...u.gaps], [false, 'cell_temp_amp']);
  assert.equal(Object.hasOwn(W.rules, 'agroclock'), false);
});

test('旧名 dailySampleMinutes 出现在规则数据里加载报错 E-RULES-UNREGISTERED（取样点参数已退役）', () => {
  const tmp = testTempRoot('retired-key-');
  try {
    const readRule = (f) => readFileSync(join(ROOT, 'world/rules', f), 'utf8');
    const reg = JSON.parse(readRule('registry.json'));
    writeUnderTempRoot(tmp, 'registry.json', JSON.stringify(reg));
    for (const row of reg.rows) {
      let text = readRule(row.file);
      if (row.code === 'climate') { const doc = JSON.parse(text); doc.rows.push({ key: 'dailySampleMinutes', value: [0, 720] }); text = JSON.stringify(doc); }
      writeUnderTempRoot(tmp, row.file, text);
    }
    const r = loadWorld(ROOT, { rulesDir: tmp });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === 'E-RULES-UNREGISTERED' && /dailySampleMinutes/.test(e.path + e.row + e.dim)), JSON.stringify(r.errors.slice(0, 3)));
  } finally { rmSync(tmp, { recursive: true, force: true }); }
});

test('两套历法：系统时间 systemTimeView 全世界统一（第几天、日内分钟）；当地历法只经 calendarFrom 按文化解析，解析不到即未知，不用任何默认历法', () => {
  assert.deepEqual({ ...systemTimeView(ENGINE, 0) }, { day: 0, minuteOfDay: 0 });
  assert.deepEqual({ ...systemTimeView(ENGINE, 30 * DAY + 725) }, { day: 30, minuteOfDay: 725 });
  assert.deepEqual({ ...systemTimeView(ENGINE, 43199) }, { day: 29, minuteOfDay: 1439 });
  assert.throws(() => systemTimeView(ENGINE, -1), codeIs('E-DIM-DOMAIN-RANGE'));
  // 同一日序，两种文化的历法给出不同的年月日（各地不同）。
  const a = calendarViewFrom(ENGINE, { cultureCalendar: 'cal_default' }, 885);
  const b = calendarViewFrom(ENGINE, { cultureCalendar: 'cal_legacy_30' }, 885);
  assert.deepEqual({ ...a }, { year: 3, month: 6, day: 1, leap: true, weekOfMonth: 1 });
  assert.deepEqual({ ...b }, { year: 3, month: 6, day: 16, leap: false, weekOfMonth: 2 });
  assert.equal(calendarFrom(ENGINE, { cultureCalendar: 'cal_legacy_30' }), 'cal_legacy_30');
  drain();
  for (const src of [{}, { cultureCalendar: null }, { cultureCalendar: 'cal_nope' }, { cultureCalendar: 'sea_four_spring' }, undefined]) {
    assert.equal(calendarFrom(ENGINE, src), null);
    assert.equal(calendarViewFrom(ENGINE, src, 5), null);
  }
  assert.equal(drain().filter((r) => r.code === 'W-DIM-GAP' && r.fields.field === 'calendar_from').length, 10);
});

const WALL = { envelopeAreaM2: 100, aperture: 0.1, thermalConductivitySum: 0.5, wallThicknessM: 0.2 };
const withOpening = (v) => ({ ...ENGINE, rules: { ...ENGINE.rules,facility: { thermal: { openingWPerM2K: v } } } });

test('envelopeUaWPerK：100 × [(1 − 0.1) × 0.5 ÷ 0.2 + 0.1 × 3] = 255 W/K；开口比例取 0 也要求有 openingWPerM2K；墙厚非正报码；修正键倍率作用在结果上', () => {
  const E = withOpening(3);
  assert.equal(envelopeUaWPerK(E, WALL).fixed, 2550000n);
  assert.equal(envelopeUaWPerK(E, WALL).unit, 'W_per_K');
  // 开口 0：只剩实墙项 100 × 0.5 ÷ 0.2 = 250。
  assert.equal(envelopeUaWPerK(E, { ...WALL, aperture: 0 }).fixed, 2500000n);
  // 修正键（手艺差的墙缝多）：管线给的函数，这里取乘 1.5。
  assert.equal(envelopeUaWPerK(E, { ...WALL, modifyUa: (v) => (v * 15000n) / 10000n }).fixed, 3825000n);
  // 无出处的 openingWPerM2K：真实世界未知，开口比例 0 也不放行。
  drain();
  const E0 = { ...ENGINE, rules: { ...ENGINE.rules,facility: {} } };
  const u = envelopeUaWPerK(E0, WALL);
  assert.deepEqual([u.known, ...u.gaps], [false, 'opening_w_per_m2k']);
  assert.deepEqual([...envelopeUaWPerK(E0, { ...WALL, aperture: 0 }).gaps], ['opening_w_per_m2k']);
  // 世界规则表取 GB 50176-2016 表 C.5.3-1 单层窗 5.8：100 × [(1 − 0.1) × 0.5 ÷ 0.2 + 0.1 × 5.8] = 100 × (2.25 + 0.58) = 283 W/K。
  assert.equal(envelopeUaWPerK(ENGINE, WALL).fixed, 2830000n);
  const none = envelopeUaWPerK(E, {});
  assert.deepEqual([...none.gaps], ['envelope_aperture', 'envelope_area_m2', 'envelope_conductivity_sum', 'wall_thickness_m']);
  assert.throws(() => envelopeUaWPerK(E, { ...WALL, wallThicknessM: 0 }), codeIs('E-DIM-DOMAIN-RANGE'));
});

test('heatPowerW：四项合计（场 强度 × heatWPerScore、燃烧、设施、在场主体）；确实为空的数组计 0；没交的项整项未知，不当 0', () => {
  const all = { fields: [{ intensity: 2, heatWPerScore: 50 }], burning: [], facilities: [30], occupants: [80] };
  assert.equal(heatPowerW(all).fixed, 2100000n);
  assert.equal(heatPowerW({ fields: [], burning: [], facilities: [], occupants: [] }).fixed, 0n);
  assert.equal(heatPowerW({ fields: [], burning: [], facilities: [], occupants: [] }).known, true);
  drain();
  const u = heatPowerW({ fields: [], burning: null, facilities: [], occupants: undefined });
  assert.deepEqual([u.known, ...u.gaps], [false, 'heat_power_burning', 'heat_power_occupants']);
});

test('围护支：交入 envelope 与 heatSources 由卷十九散热能力式、四项热源算室温；热源读入口未建则室温未知（地下围护 8.9 + 210 ÷ 255）', () => {
  const E2 = { ...ENGINE, rules: { ...ENGINE.rules,climate: { ...W.rules.climate, groundDampCurve: [[0, 1], [30, 0]], geothermalGradient: 0.03 }, facility: { thermal: { openingWPerM2K: 3 } } } };
  const cellar = { latitudeDeg: 38, cellElevationM: 0, surfaceRefElevationM: 0, enclosed: true, underground: true, depthM: 30, cell: { annualMeanTempC: 8, tempAmpC: 10 }, envelope: WALL, heatSources: { fields: [{ intensity: 2, heatWPerScore: 50 }], burning: [], facilities: [30], occupants: [80] } };
  // 外侧地下基准 8.9（89000）+ 210 ÷ 255 = 0.8235（fixedDivide 2100000 × 10000 ÷ 2550000 = 8235）。
  assert.equal(tempAt(E2, cellar, 0).fixed, 89000n + 8235n);
  const unbuilt = tempAt(E2, { ...cellar, heatSources: { ...cellar.heatSources, facilities: undefined } }, 0);
  assert.deepEqual([unbuilt.known, ...unbuilt.gaps], [false, 'heat_power_facilities']);
  const noOpening = tempAt({ ...ENGINE, rules: { ...ENGINE.rules,facility: {} } }, cellar, 0);
  assert.equal(noOpening.known, false);
  assert.ok(noOpening.gaps.includes('opening_w_per_m2k'));
});
