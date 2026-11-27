// S2-T1 单测：日历模块（systemTimeView、calendarView 往返与单调、dayPartOf、astroView.solarPhase 有理数）、季节与节气（seasonAt 对相位、solarTermAt 半球归一）、
// 不兜底（无文化表、无纬度、无单元时 null 加缺口）、nowOf 形状、读取时刻无关、菜单 view 带 now。写码方自补，不作验收依据。
// 期望值按卷二十公式（:584–:586、:689–:691）在测试里从世界数据手算；不抄仓库读数。世界数据只在测试副本里改（半球一条改 latitudeOriginDeg 的符号），不造文化行、不造单元。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { controlledEntities } from '../../server-plugin/rules/social/control.mjs';
import { canonical } from '../../server-plugin/kernel/storage.mjs';
import { systemTimeView, calendarFrom, calendarDayIndex, calendarView, dayPartOf, astroView } from '../../server-plugin/rules/time_env/calendar.mjs';
import { latitudeOf, normalizedPhase, seasonAt, solarTermAt, cellOf } from '../../server-plugin/rules/time_env/season.mjs';
import { envAt, nowOf } from '../../server-plugin/rules/time_env/env.mjs';

const W = new URL('../../world/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const ruleOf = (raw, code, key) => raw.tableDocs[code].rows.find((r) => r.key === key).value;

function owners() {
  const dir = new URL('ontology/state-owners.d/', W);
  const names = existsSync(dir) ? readdirSync(dir).sort() : [];
  const shards = names.map((n) => ({ file: `world/ontology/state-owners.d/${n}`, doc: JSON.parse(readFileSync(new URL(n, dir), 'utf8')) }));
  return mergeOwners({ file: 'world/ontology/state-owners.json', doc: json('ontology/state-owners.json') }, shards).doc;
}
function rawWorld() {
  const dims = new URL('ontology/dimensions/', W);
  const acts = new URL('actions/', W);
  const registryRows = json('rules/registry.json').rows;
  return {
    dimensionDocs: readdirSync(dims).filter((f) => f.endsWith('.json') && !f.startsWith('_')).sort().map((f) => JSON.parse(readFileSync(new URL(f, dims), 'utf8'))),
    namedStructsDoc: json('ontology/named-structs.json'),
    owners: clone(owners()),
    registryRows,
    tableDocs: Object.fromEntries(registryRows.map((r) => [r.code, json(`rules/${r.file}`)])),
    digestExclude: json('rules/tables/digest-exclude.json').paths,
    primitivesDoc: json('ontology/primitives.json'),
    vocabDoc: json('ontology/dimensions/_vocab.json'),
    unitsDoc: json('ontology/dimensions/_units.json'),
    distributionsDoc: json('ontology/dimensions/_distributions.json'),
    effectsDoc: json('ontology/dimensions/_effects.json'),
    actionDocs: readdirSync(acts).filter((f) => f.endsWith('.json')).sort().map((f) => JSON.parse(readFileSync(new URL(f, acts), 'utf8'))),
  };
}
const caps = (tag) => ({ digestCap: createDigestCap(), saveRoot: pathToFileURL(join(testTempRoot(tag), '/')), sources: [{ path: 'x.mjs', text: '' }], modifierSources: Object.freeze([]) });
const choose = (g) => {
  const r = g.act({ act: 'act_choose_origin', slots: { species: 0, origin: 0, place: 0, lodge: 0 } });
  assert.equal(r.ok, true, JSON.stringify(r));
  return controlledEntities(g.engine, g.state)[0];
};
const wait = (g, minutes) => assert.equal(g.act({ act: 'act_wait', numbers: { minutes } }).ok, true);

// 手算口径：一日分钟 = 单位表 day.si ÷ minute.si；年长分钟 = yearDays × 一日分钟（卷二十 :689）。
const RAW = rawWorld();
const unitSiOf = (id) => RAW.unitsDoc.units.find((u) => u.id === id).si;
const PER_DAY = unitSiOf('day') / unitSiOf('minute');
const families = RAW.vocabDoc.families;
const calendars = Object.keys(families.calendar.entries).sort();
const gcd = (a, b) => (b === 0n ? a : gcd(b, a % b));
// 太阳相位 frac((m − epoch) × yearDen ÷ (yearNum × 一日分钟))，约分；southern 为真时加二分之一。
function phaseOf(m, southern = false) {
  const y = ruleOf(RAW, 'astro', 'yearDays');
  const epoch = BigInt(ruleOf(RAW, 'astro', 'phaseEpochMinute'));
  let den = BigInt(y.num) * BigInt(PER_DAY);
  let num = ((BigInt(m) - epoch) * BigInt(y.den)) % den;
  if (num < 0n) num += den;
  if (southern) { num = (num + num + den) % (den + den); den += den; }
  const g = gcd(num, den) || 1n;
  return { num: num / g, den: den / g };
}
const inRow = (p, row) => p.num * BigInt(row.phaseFrom.den) >= BigInt(row.phaseFrom.num) * p.den && p.num * BigInt(row.phaseTo.den) < BigInt(row.phaseTo.num) * p.den;
// 历法行逐日展开（卷二十 §2.3 月段与置闰，独立于被测实现）：返回前 n 日的 {year, month, day, leap}。
function walkDays(row, n) {
  const out = [];
  for (let year = 1; out.length < n; year += 1) {
    for (const m of row.months) {
      const segs = [{ days: m.days, leap: false }];
      for (const it of row.intercalation) if (it.afterMonth === m.ordinal && it.years.includes(((year - 1) % it.cycleYears) + 1)) segs.push({ days: it.days, leap: true });
      for (const s of segs) for (let d = 1; d <= s.days; d += 1) out.push({ year, month: m.ordinal, day: d, leap: s.leap });
    }
  }
  return out.slice(0, n);
}

test('1 systemTimeView：第几天 = 分钟整除一日分钟，日内分钟为余数（单位表手算）；负分钟与非整数拒', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-sys-'));
  for (const m of [0, 1, PER_DAY - 1, PER_DAY, PER_DAY * 37 + 5]) {
    assert.deepEqual({ ...systemTimeView(g.engine, m) }, { day: Math.floor(m / PER_DAY), minuteOfDay: m % PER_DAY });
  }
  assert.throws(() => systemTimeView(g.engine, -1), (e) => Object(e).code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => systemTimeView(g.engine, 0.5), (e) => Object(e).code === 'E-DIM-DOMAIN-RANGE');
});

test('2 calendarView 往返与单调：两部现有历法行，日序 → 年月日与逐日展开手算逐项相同，年月日（闰月排本月后）严格递增；calendarDayIndex = 分钟整除一日分钟', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-cal-'));
  assert.ok(calendars.length >= 2);
  const firstYears = new Set();
  for (const id of calendars) {
    const row = families.calendar.entries[id];
    const cycle = row.intercalation.reduce((l, it) => Math.max(l, it.cycleYears), 1);
    const n = cycle * 400;
    const want = walkDays(row, n);
    let prev = null;
    for (let i = 0; i < n; i += 1) {
      const v = calendarView(g.engine, id, i);
      assert.deepEqual({ year: v.year, month: v.month, day: v.day, leap: v.leap }, want[i], `${id} day ${i}`);
      assert.equal(v.weekOfMonth, Math.floor((v.day - 1) / row.weekDays) + 1);
      const key = [v.year, v.month, v.leap ? 1 : 0, v.day];
      if (prev) assert.ok(key.join(',') !== prev.join(',') && key.some((x, k) => x !== prev[k] && key.slice(0, k).every((y, j) => y === prev[j]) && x > prev[k]), `${id} not increasing at ${i}`);
      prev = key;
    }
    // 第一年年长：第一个 year = 2 的日序。
    firstYears.add(want.findIndex((d) => d.year === 2));
    for (const m of [row.epochMinute, row.epochMinute + PER_DAY * 400 + 3]) assert.equal(calendarDayIndex(g.engine, id, m), Math.floor((m - row.epochMinute) / PER_DAY));
  }
  // 两部历法年长不同，同一日序投影出的年月日不同。
  assert.equal(firstYears.size, calendars.length);
  const late = PER_DAY * 1000;
  const views = calendars.map((id) => JSON.stringify(calendarView(g.engine, id, calendarDayIndex(g.engine, id, late))));
  assert.equal(new Set(views).size, calendars.length);
  assert.throws(() => calendarView(g.engine, calendars[0], -1), (e) => Object(e).code === 'E-DIM-DOMAIN-RANGE');
  assert.throws(() => calendarView(g.engine, 'not_a_calendar', 0), (e) => Object(e).code === 'E-DIM-REF-MISSING');
});

test('3 dayPartOf：段序号 = floor(((日内分钟 − offsetMinutes) mod 一日分钟) × count ÷ 一日分钟)，读历法行 dayParts', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-part-'));
  for (const id of calendars) {
    const { count, offsetMinutes } = families.calendar.entries[id].dayParts;
    for (let m = 0; m < PER_DAY * 2; m += 37) {
      const inDay = m % PER_DAY;
      const want = Math.floor(((((inDay - offsetMinutes) % PER_DAY) + PER_DAY) % PER_DAY) * count / PER_DAY);
      assert.equal(dayPartOf(g.engine, id, m), want);
    }
  }
  // 行上没有 dayParts 即 null（测试副本删去该字段，不兜底）。
  const raw = clone(RAW);
  delete raw.vocabDoc.families.calendar.entries[calendars[0]].dayParts;
  const g2 = mountKernel(raw, caps('s2t1-part2-'));
  assert.equal(dayPartOf(g2.engine, calendars[0], 100), null);
});

test('4 astroView.solarPhase：有理数 {num, den} 已约分、0 ≤ num < den，与手算相等；历元为 0，过 yearDen 个回归年回到 0', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-astro-'));
  const a = astroView(g.engine);
  const y = ruleOf(RAW, 'astro', 'yearDays');
  for (const m of [0, 1, 777, PER_DAY * 91, PER_DAY * 400 + 12, -5]) {
    const p = a.solarPhase(m);
    const want = phaseOf(m);
    assert.ok(Number.isSafeInteger(p.num) && Number.isSafeInteger(p.den) && p.num >= 0 && p.num < p.den);
    assert.deepEqual([BigInt(p.num), BigInt(p.den)], [want.num, want.den]);
  }
  assert.deepEqual({ ...a.solarPhase(ruleOf(RAW, 'astro', 'phaseEpochMinute')) }, { num: 0, den: 1 });
  assert.deepEqual({ ...a.solarPhase(y.num * PER_DAY) }, { num: 0, den: 1 });
});

test('5 seasonAt 对相位：起始建筑沿包含链取天气单元；每一日的季节行区间含当日起始分钟的归一相位、属单元方案；数值维度取该行；走满一年覆盖方案全部行', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-season-'));
  choose(g);
  const place = g.menu(null).here.place;
  const cell = cellOf(g.engine, place);
  assert.ok(g.menu(null).here.chain.includes(cell));
  const scheme = g.engine.registry.tables.get('place').rows[cell].seasonScheme;
  const seen = new Set();
  for (let d = 0; d < 380; d += 3) {
    const m = d * PER_DAY + 600;
    const s = seasonAt(g.engine, g.state, place, m);
    assert.equal(s.known, true);
    const row = families.season.entries[s.value.season];
    assert.equal(row.scheme, scheme);
    assert.ok(inRow(phaseOf(d * PER_DAY), row), `day ${d}`);
    assert.deepEqual([s.value.growth, s.value.wetness, s.value.warmth], [row.growth, row.wetness, row.warmth]);
    seen.add(s.value.season);
  }
  assert.deepEqual([...seen].sort(), Object.keys(families.season.entries).filter((k) => families.season.entries[k].scheme === scheme).sort());
});

test('6 solarTermAt 半球归一：北半球取原相位、走满一年 24 行都出现；测试副本把纬度原点取负（建筑落到南半球）后同一时刻的节气 = 原相位加二分之一所在的行', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-term-'));
  choose(g);
  const place = g.menu(null).here.place;
  assert.ok(latitudeOf(g.engine, g.state, place).value > 0);
  const terms = families.solar_term.entries;
  const seen = new Set();
  for (let d = 0; d < 370; d += 1) {
    const t = solarTermAt(g.engine, g.state, place, d * PER_DAY + 30);
    assert.ok(inRow(phaseOf(d * PER_DAY), terms[t.value]));
    seen.add(t.value);
  }
  assert.equal(seen.size, Object.keys(terms).length);
  const raw = clone(RAW);
  const row = raw.tableDocs.astro.rows.find((r) => r.key === 'latitudeOriginDeg');
  row.value = -row.value;
  const s = mountKernel(raw, caps('s2t1-term2-'));
  choose(s);
  const sp = s.menu(null).here.place;
  assert.ok(latitudeOf(s.engine, s.state, sp).value < 0);
  for (const d of [0, 45, 91, 180, 270]) {
    const t = solarTermAt(s.engine, s.state, sp, d * PER_DAY);
    assert.ok(inRow(phaseOf(d * PER_DAY, true), terms[t.value]), `south day ${d}`);
    const north = solarTermAt(g.engine, g.state, place, d * PER_DAY).value;
    assert.equal((terms[t.value].order - terms[north].order + 24) % 24, Object.keys(terms).length / 2);
  }
});

test('7 不兜底：文化表未建 → calendarFrom 为 null、now.calendar 与 dayPart 为 null 且 gaps 含 calendar_from；区域地点无足迹 → 纬度、相位、季节、节气未知带缺口；没有单元 → weather_cell；地点未知整组未知', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-gap-'));
  const me = choose(g);
  assert.equal(calendarFrom(g.engine, g.state, me), null);
  const now = nowOf(g.engine, g.state, me);
  assert.equal(now.calendar, null);
  assert.equal(now.dayPart, null);
  assert.ok(now.gaps.includes('calendar_from'));
  assert.equal(now.weather, null);
  assert.ok(now.gaps.includes('weather_unbuilt'));
  const chain = g.menu(null).here.chain;
  const cell = cellOf(g.engine, chain[0]);
  for (const f of [latitudeOf(g.engine, g.state, cell), normalizedPhase(g.engine, g.state, cell, 0), seasonAt(g.engine, g.state, cell, 0), solarTermAt(g.engine, g.state, cell, 0)]) {
    assert.equal(f.known, false);
    assert.equal(f.value, null);
    assert.ok(f.gaps.includes('latitude_deg'));
  }
  const root = chain[chain.length - 1];
  assert.equal(cellOf(g.engine, root), null);
  assert.deepEqual([...seasonAt(g.engine, g.state, root, 0).gaps], ['weather_cell']);
  const far = envAt(g.engine, g.state, { w: 0, x: 987654321, y: 987654321, z: 0, coarse: true }, 0);
  for (const k of Object.keys(far)) assert.equal(far[k].known, false);
});

test('8 nowOf 形状：键集合与类型；无化身只给系统时间；minute 取时钟；season 与 envAt 的 env.season 同值', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-shape-'));
  const keys = ['calendar', 'day', 'dayPart', 'gaps', 'minute', 'minuteOfDay', 'season', 'solarTerm', 'weather'];
  const n0 = nowOf(g.engine, g.state, null);
  assert.deepEqual(Object.keys(n0).sort(), keys);
  assert.deepEqual([n0.calendar, n0.dayPart, n0.season, n0.solarTerm, n0.weather], [null, null, null, null, null]);
  assert.ok(n0.gaps.includes('no_subject'));
  const me = choose(g);
  wait(g, 700);
  const n = nowOf(g.engine, g.state, me);
  assert.deepEqual(Object.keys(n).sort(), keys);
  const minute = g.state.clock.minute;
  assert.deepEqual([n.minute, n.day, n.minuteOfDay], [minute, Math.floor(minute / PER_DAY), minute % PER_DAY]);
  assert.deepEqual(Object.keys(n.season).sort(), ['growth', 'id', 'warmth', 'wetness']);
  const env = Object(envAt(g.engine, g.state, g.menu(null).here.place, minute)['env.season'].value);
  assert.deepEqual({ id: env.season, growth: env.growth, wetness: env.wetness, warmth: env.warmth }, { ...n.season });
  assert.ok(Object.hasOwn(families.solar_term.entries, n.solarTerm));
  assert.deepEqual([...n.gaps], [...n.gaps].sort());
});

test('9 读取时刻无关与不落盘：先读后读顺序不影响结果；一次等一日与分两次等到同一分钟 now 相同；菜单 view 带 now 后 state 逐位不变', () => {
  const a = mountKernel(clone(RAW), caps('s2t1-order-a-'));
  const pa = (choose(a), a.menu(null).here.place);
  const fwd = [0, 100, 250].map((d) => canonical([seasonAt(a.engine, a.state, pa, d * PER_DAY), solarTermAt(a.engine, a.state, pa, d * PER_DAY)]));
  const back = [250, 100, 0].map((d) => canonical([seasonAt(a.engine, a.state, pa, d * PER_DAY), solarTermAt(a.engine, a.state, pa, d * PER_DAY)])).reverse();
  assert.deepEqual(fwd, back);
  const b = mountKernel(clone(RAW), caps('s2t1-order-b-'));
  const mb = choose(b);
  const ma = controlledEntities(a.engine, a.state)[0];
  wait(a, PER_DAY);
  wait(b, PER_DAY / 2);
  b.menu(null);
  wait(b, PER_DAY / 2);
  const before = canonical(b.state);
  assert.equal(canonical(a.menu(null).now), canonical(b.menu(null).now));
  assert.equal(canonical(nowOf(a.engine, a.state, ma)), canonical(nowOf(b.engine, b.state, mb)));
  assert.equal(canonical(b.state), before);
});
