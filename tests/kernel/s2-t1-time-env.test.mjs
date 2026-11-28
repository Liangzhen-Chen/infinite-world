// S2-T1 单测：日历模块（systemTimeView、calendarView 往返与单调、dayPartOf、astroView.solarPhase 有理数）、季节与节气（seasonAt 对相位、S2-T1b 单元本地相位与方案）、
// 不兜底（无文化表、单元缺偏移或方案、无单元时 null 加缺口）、单元内无足迹的区域地点可求、nowOf 形状、读取时刻无关、菜单 view 带 now。写码方自补，不作验收依据。
// 期望值按卷二十公式（:584–:586、:689–:691，S2-T1b 勘误：本地相位 = 世界相位 + 单元 phaseOffset 取小数）在测试里从世界数据手算；不抄仓库读数。
// 世界数据只在测试副本里改（第 6 例给另两个已挂单元类的地点行填偏移与方案、加一套测试节气方案行），不造文化行，不进真仓库世界。
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
import { localPhase, seasonAt, solarTermAt, cellOf } from '../../server-plugin/rules/time_env/season.mjs';
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
// 太阳相位 frac((m − epoch) × yearDen ÷ (yearNum × 一日分钟))，约分；half 为真时加二分之一（偏移 1/2 的单元）。
function phaseOf(m, half = false) {
  const y = ruleOf(RAW, 'astro', 'yearDays');
  const epoch = BigInt(ruleOf(RAW, 'astro', 'phaseEpochMinute'));
  let den = BigInt(y.num) * BigInt(PER_DAY);
  let num = ((BigInt(m) - epoch) * BigInt(y.den)) % den;
  if (num < 0n) num += den;
  if (half) { num = (num + num + den) % (den + den); den += den; }
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

test('6 单元本地节律（S2-T1b）：起始单元走满一年本方案节气都出现；测试副本另一单元 phaseOffset 差 1/2 时同一时刻季节、节气相反；termScheme 不同时节气取该方案的行、与起始单元不同', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-term-'));
  choose(g);
  const place = g.menu(null).here.place;
  const home = cellOf(g.engine, place);
  const homeRow = g.engine.registry.tables.get('place').rows[home];
  const terms = families.solar_term.entries;
  const ofScheme = (sch) => Object.keys(terms).filter((k) => terms[k].scheme === sch);
  const seen = new Set();
  for (let d = 0; d < 370; d += 1) {
    const t = solarTermAt(g.engine, g.state, place, d * PER_DAY + 30);
    assert.ok(inRow(phaseOf(d * PER_DAY), terms[t.value]));
    assert.equal(terms[t.value].scheme, homeRow.termScheme);
    seen.add(t.value);
  }
  assert.deepEqual([...seen].sort(), ofScheme(homeRow.termScheme).sort());
  // 测试副本：另取两个挂单元类、不在起始地点链上的地点行 A、B；A 偏移 1/2、方案同起始单元；B 偏移 0、节气指一套测试方案（两行各占半年）。
  const raw = clone(RAW);
  const pdoc = raw.dimensionDocs.find((d) => d.kind === 'place');
  const cls = ruleOf(RAW, 'season', 'cellClass');
  const chain = g.menu(null).here.chain;
  const [a, b] = Object.keys(pdoc.rows).filter((k) => (pdoc.rows[k].classes || []).includes(cls) && !chain.includes(k)).sort();
  Object.assign(pdoc.rows[a], { phaseOffset: { num: 1, den: 2 }, seasonScheme: homeRow.seasonScheme, termScheme: homeRow.termScheme });
  const fam = raw.vocabDoc.families;
  const tsch = `${fam.term_scheme.prefix}t1b_test`;
  fam.term_scheme.entries[tsch] = { basis: 'test' };
  const halves = [[0, 1], [1, 2]].map(([from, to], i) => [`${fam.solar_term.prefix}t1b_test_${i}`, { basis: 'test', scheme: tsch, order: i, phaseFrom: { num: from, den: 2 }, phaseTo: { num: to, den: 2 } }]);
  Object.assign(fam.solar_term.entries, Object.fromEntries(halves));
  Object.assign(pdoc.rows[b], { phaseOffset: { num: 0, den: 1 }, seasonScheme: homeRow.seasonScheme, termScheme: tsch });
  const s = mountKernel(raw, caps('s2t1-term2-'));
  choose(s);
  const seasons = families.season.entries;
  const nSeason = Object.keys(seasons).filter((k) => seasons[k].scheme === homeRow.seasonScheme).length;
  const nTerm = ofScheme(homeRow.termScheme).length;
  for (const d of [0, 45, 91, 180, 270]) {
    const m = d * PER_DAY;
    const pa = localPhase(s.engine, s.state, a, m).value;
    const want = phaseOf(m, true);
    assert.deepEqual([BigInt(pa.num), BigInt(pa.den)], [want.num, want.den]);
    const homeSea = seasonAt(s.engine, s.state, place, m).value.season;
    const aSea = seasonAt(s.engine, s.state, a, m).value.season;
    assert.ok(inRow(phaseOf(m, true), seasons[aSea]), `A season day ${d}`);
    assert.equal((seasons[aSea].order - seasons[homeSea].order + nSeason) % nSeason, nSeason / 2);
    const homeT = solarTermAt(s.engine, s.state, place, m).value;
    const aT = solarTermAt(s.engine, s.state, a, m).value;
    assert.ok(inRow(phaseOf(m, true), terms[aT]), `A term day ${d}`);
    assert.equal((terms[aT].order - terms[homeT].order + nTerm) % nTerm, nTerm / 2);
    const bT = solarTermAt(s.engine, s.state, b, m).value;
    assert.equal(fam.solar_term.entries[bT].scheme, tsch);
    assert.ok(inRow(phaseOf(m), fam.solar_term.entries[bT]), `B term day ${d}`);
    assert.notEqual(bT, homeT);
    assert.equal(fam.solar_term.entries[homeT].scheme, homeRow.termScheme);
  }
});

test('7 无足迹区域地点与不兜底：单元内的区域地点（单元本身、挂在单元下的子地点）可求本地相位、季节、节气；文化表未建 → calendarFrom 为 null、gaps 含 calendar_from；单元缺偏移与方案 → phase_offset、season_scheme、term_scheme；没有单元 → weather_cell；地点未知整组未知', () => {
  const g = mountKernel(clone(RAW), caps('s2t1-gap-'));
  const me = choose(g);
  assert.equal(calendarFrom(g.engine, g.state, me), null);
  const now = nowOf(g.engine, g.state, me);
  assert.equal(now.calendar, null);
  assert.equal(now.dayPart, null);
  assert.ok(now.gaps.includes('calendar_from'));
  // S2-T2：天气已建，开局地点所在单元有天气数据时 weather 为词表 weather 行；数值项为数或 null，有 null 时 gaps 非空（不兜底，不当 0）。
  assert.ok(Object.hasOwn(families.weather.entries, String(now.weather?.state)), 'now.weather.state 应是词表族 weather 的条目');
  for (const k of ['precipMm', 'windMps', 'windDirDeg', 'cloud', 'humidity']) {
    assert.ok(now.weather[k] === null || typeof now.weather[k] === 'number', k);
    if (now.weather[k] === null) assert.ok(now.gaps.some((x) => x.startsWith('weather_')), `${k} 为 null 时 gaps 应有天气缺口`);
  }
  const chain = g.menu(null).here.chain;
  const cell = cellOf(g.engine, chain[0]);
  const rows = g.engine.registry.tables.get('place').rows;
  const child = Object.keys(rows).sort().find((k) => rows[k].parent === cell && !chain.includes(k));
  const dayStart = PER_DAY * 100;
  const m = dayStart + 300;
  for (const p of [cell, child]) {
    assert.equal(cellOf(g.engine, p), cell);
    const ph = localPhase(g.engine, g.state, p, m);
    assert.equal(ph.known, true, p);
    const want = phaseOf(m);
    assert.deepEqual([BigInt(ph.value.num), BigInt(ph.value.den)], [want.num, want.den]);
    const sea = seasonAt(g.engine, g.state, p, m);
    assert.equal(sea.known, true, p);
    assert.ok(inRow(phaseOf(dayStart), families.season.entries[sea.value.season]));
    const t = solarTermAt(g.engine, g.state, p, m);
    assert.equal(t.known, true, p);
    assert.ok(inRow(phaseOf(dayStart), families.solar_term.entries[t.value]));
    assert.deepEqual(envAt(g.engine, g.state, p, m)['env.season'].value, sea.value);
  }
  const cls = ruleOf(RAW, 'season', 'cellClass');
  const bare = Object.keys(rows).sort().find((k) => (rows[k].classes || []).includes(cls) && !['phaseOffset', 'seasonScheme', 'termScheme'].some((d) => Object.hasOwn(rows[k], d)));
  assert.deepEqual([...localPhase(g.engine, g.state, bare, 0).gaps], ['phase_offset']);
  assert.deepEqual([...seasonAt(g.engine, g.state, bare, 0).gaps], ['season_scheme']);
  assert.deepEqual([...solarTermAt(g.engine, g.state, bare, 0).gaps], ['term_scheme']);
  const root = chain[chain.length - 1];
  assert.equal(cellOf(g.engine, root), null);
  for (const f of [localPhase(g.engine, g.state, root, 0), seasonAt(g.engine, g.state, root, 0), solarTermAt(g.engine, g.state, root, 0)]) {
    assert.equal(f.known, false);
    assert.equal(f.value, null);
    assert.deepEqual([...f.gaps], ['weather_cell']);
  }
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
