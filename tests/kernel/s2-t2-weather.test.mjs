// S2-T2 单测：天气单元当日天气 weatherAt（卷二十 §4.3.3 第 2–4 条 :636–:642）。写码方自补，不作验收依据（草案 §5 第 1–4、8 条）。
// 前提只在测试副本里改真实数据（克隆 docData，改真实已有天气数据单元行的值、改 rules.gen.worldSeed），不造单元、不抄代号：单元取「挂单元类且有 weatherCommonality 的地点行」。
// 期望值按卷文与数据手算：分布 clamp、风向 = 盛行风 ± spread、cloud/humidity = 行字段、季节曲线为 0 的相位段不出现该行。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { testTempRoot } from '../accept/temp-root.mjs';
import { mountKernel } from '../../server-plugin/rules/load/mount.mjs';
import { mergeOwners } from '../../server-plugin/rules/load/registry-shards.mjs';
import { createDigestCap } from '../../server-plugin/textcore/digest.mjs';
import { localPhase } from '../../server-plugin/rules/time_env/season.mjs';
import { weatherAt } from '../../server-plugin/rules/time_env/weather.mjs';

const W = new URL('../../world/', import.meta.url);
const SRC = new URL('../../server-plugin/', import.meta.url);
const json = (rel) => JSON.parse(readFileSync(new URL(rel, W), 'utf8'));
const clone = (v) => JSON.parse(JSON.stringify(v));
const rowOf = (raw, code, key) => raw.tableDocs[code].rows.find((r) => r.key === key);

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

const RAW = rawWorld();
const placeRows = (raw) => raw.dimensionDocs.find((d) => d.kind === 'place').rows;
const CELL_CLASS = rowOf(RAW, 'season', 'cellClass').value;
// 有天气数据的单元：挂单元类且行上有 weatherCommonality（不写 id）。
const CELL = Object.keys(placeRows(RAW)).sort().find((k) => (placeRows(RAW)[k].classes || []).includes(CELL_CLASS) && Object.hasOwn(placeRows(RAW)[k], 'weatherCommonality'));
const WX = RAW.vocabDoc.families.weather.entries;
const ANCHOR = rowOf(RAW, 'weather', 'anchorDays').value;
const unitSiOf = (id) => RAW.unitsDoc.units.find((u) => u.id === id).si;
const PER_DAY = unitSiOf('day') / unitSiOf('minute');
const FULL_TURN = rowOf(RAW, 'grid', 'fullTurnDeg').value;

const mount = (raw, tag) => mountKernel(raw, caps(tag));
const states = (g, days) => days.map((d) => {
  const w = weatherAt(g.engine, g.state, CELL, d);
  assert.equal(w.known, true, `day ${d}: ${w.gaps}`);
  return w.value.state;
});
// 各锚段的末日与段内若干日（取样日；每次求值至多 anchorDays 步）。
const SAMPLE = Array.from({ length: 24 }, (_, j) => j * ANCHOR + ((j * 97) % ANCHOR));

test('0 前提：真实数据里有带天气数据的单元', () => {
  assert.equal(typeof CELL, 'string');
});

test('1 同（种子, 单元, 日）同天气；换种子后 60 日序列不全同', () => {
  const a = mount(clone(RAW), 's2t2-a-');
  const b = mount(clone(RAW), 's2t2-b-');
  for (const d of [0, 1, 100, ANCHOR - 1, ANCHOR, ANCHOR * 3 + 17]) assert.deepEqual(weatherAt(a.engine, a.state, CELL, d), weatherAt(b.engine, b.state, CELL, d), `day ${d}`);
  const raw2 = clone(RAW);
  rowOf(raw2, 'gen', 'worldSeed').value += 1;
  const c = mount(raw2, 's2t2-c-');
  const days = Array.from({ length: 60 }, (_, i) => i);
  assert.notDeepEqual(states(a, days), states(c, days));
});

test('2 读取顺序无关；锚段边界照常', () => {
  const g = mount(clone(RAW), 's2t2-order-');
  const d = 250;
  const later = weatherAt(g.engine, g.state, CELL, d + 100);
  const early = weatherAt(g.engine, g.state, CELL, d);
  const h = mount(clone(RAW), 's2t2-order2-');
  assert.deepEqual(weatherAt(h.engine, h.state, CELL, d), early);
  assert.deepEqual(weatherAt(h.engine, h.state, CELL, d + 100), later);
  for (const x of [ANCHOR - 1, ANCHOR]) assert.equal(weatherAt(g.engine, g.state, CELL, x).known, true);
});

test('3a 某行 weatherCommonality 设 0 → 取样日从不出现该行；只留一行非 0 → 每日都是该行', () => {
  const ids = Object.keys(WX).sort();
  const common = placeRows(RAW)[CELL].weatherCommonality;
  const top = ids.reduce((m, k) => ((common[k] ?? 0) > (common[m] ?? 0) ? k : m), ids[0]);
  const raw0 = clone(RAW);
  placeRows(raw0)[CELL].weatherCommonality[top] = 0;
  assert.ok(!states(mount(raw0, 's2t2-zero-'), SAMPLE).includes(top));
  const only = ids.find((k) => k !== top && (common[k] ?? 0) > 0);
  const raw1 = clone(RAW);
  for (const k of ids) if (k !== only && Object.hasOwn(placeRows(raw1)[CELL].weatherCommonality, k)) placeRows(raw1)[CELL].weatherCommonality[k] = 0;
  const g1 = mount(raw1, 's2t2-only-');
  // 唯一非 0 行在季节曲线为 0 的日子权重全 0 → 当日未知（不兜底），其余日都是该行。
  for (const d of SAMPLE) {
    const w = weatherAt(g1.engine, g1.state, CELL, d);
    if (w.known) assert.equal(w.value.state, only, `day ${d}`);
    else assert.ok(w.gaps.includes('weather_weights_zero'), `day ${d}: ${w.gaps}`);
  }
});

test('3b 季节曲线在某相位段为 0 的行，在该段相位的日子不出现', () => {
  const g = mount(clone(RAW), 's2t2-curve-');
  const proto = placeRows(RAW)[CELL].climateProto;
  const curves = RAW.tableDocs.climateProto.rows.find((r) => r.key === proto).value.seasonCurve;
  // 相邻两点 y 都为 0 的区间 [x0, x1]：线性插值在区间内恒为 0。
  const zeroSpans = Object.entries(curves).flatMap(([row, pts]) => pts.slice(1).map((p, i) => [row, pts[i], p]).filter(([, a, b]) => a[1] === 0 && b[1] === 0).map(([r, a, b]) => [r, a[0], b[0]]));
  assert.ok(zeroSpans.length > 0, '数据里应有曲线为 0 的相位段');
  let hits = 0;
  for (let d = 0; d < 2 * ANCHOR && hits < 30; d += 7) {
    const ph = localPhase(g.engine, g.state, CELL, d * PER_DAY);
    const x = ph.value.num / ph.value.den;
    const banned = zeroSpans.filter(([, x0, x1]) => x >= x0 && x <= x1).map(([r]) => r);
    if (banned.length === 0) continue;
    hits += 1;
    const w = weatherAt(g.engine, g.state, CELL, d);
    assert.equal(w.known, true);
    assert.ok(!banned.includes(w.value.state), `day ${d} phase ${x}: ${w.value.state}`);
  }
  assert.ok(hits > 0);
});

test('4 当日量：降水在该行分布 clamp 内或 null 带缺口；风向在 [0, 一周) 且偏离盛行风不超过 spread；cloud、humidity 等于行字段', () => {
  const g = mount(clone(RAW), 's2t2-qty-');
  const prevailing = placeRows(RAW)[CELL].prevailingWindDeg;
  const seen = new Set();
  for (const d of SAMPLE) {
    const w = weatherAt(g.engine, g.state, CELL, d);
    assert.equal(w.known, true);
    const v = w.value;
    const row = WX[v.state];
    seen.add(v.state);
    if (row.precipMm) {
      assert.ok(v.precipMm >= row.precipMm.clamp[0] && v.precipMm <= row.precipMm.clamp[1], `precip ${v.precipMm}`);
    } else {
      assert.equal(v.precipMm, null);
      assert.ok(v.gaps.includes('weather_precip'));
    }
    assert.ok(v.windMps >= row.windMps.clamp[0] && v.windMps <= row.windMps.clamp[1]);
    assert.ok(v.windDirDeg >= 0 && v.windDirDeg < FULL_TURN);
    const diff = Math.abs(((v.windDirDeg - prevailing + FULL_TURN * 1.5) % FULL_TURN) - FULL_TURN / 2);
    assert.ok(diff <= row.windDirSpreadDeg + 1e-3, `wind dir ${v.windDirDeg} vs ${prevailing}±${row.windDirSpreadDeg}`);
    assert.equal(v.cloud, row.cloud);
    assert.equal(v.humidity, row.humidity);
  }
  assert.ok(seen.size > 1, '取样日应不止一种天气');
});

test('5 不兜底：挂单元类但无 weatherCommonality 的真实单元为未知带缺口', () => {
  const g = mount(clone(RAW), 's2t2-gap-');
  const bare = Object.keys(placeRows(RAW)).sort().find((k) => (placeRows(RAW)[k].classes || []).includes(CELL_CLASS) && !Object.hasOwn(placeRows(RAW)[k], 'weatherCommonality'));
  const w = weatherAt(g.engine, g.state, bare, 10);
  assert.equal(w.known, false);
  assert.equal(w.value, null);
  assert.deepEqual([...w.gaps], ['weather_commonality']);
});

test('8 扫描：weather.mjs 无天气、单元、原型代号字面量与顶层 Map/WeakMap；weatherAt 只由 env.mjs import', () => {
  const src = readFileSync(new URL('rules/time_env/weather.mjs', SRC), 'utf8');
  assert.ok(!/['"`](wx|sea|loc|cpr)_/.test(src));
  assert.ok(!/^(let|const|var)\s+\w+\s*=\s*new\s+(Weak)?Map\b/m.test(src));
  const files = [];
  const walk = (u) => {
    for (const e of readdirSync(u, { withFileTypes: true })) {
      if (e.isDirectory()) walk(new URL(`${e.name}/`, u));
      else if (e.name.endsWith('.mjs')) files.push(new URL(e.name, u));
    }
  };
  walk(SRC);
  const importers = files.filter((f) => /import\s*\{[^}]*\bweatherAt\b[^}]*\}\s*from/.test(readFileSync(f, 'utf8'))).map((f) => f.href.slice(SRC.href.length));
  assert.deepEqual(importers, ['rules/time_env/env.mjs']);
});
