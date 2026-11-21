// 块 6 第 6-24 张《地点行与边转换（九省 31 郡）》：真实世界的 place 表（world/ontology/dimensions/place.json 的 rows 与 edges）。
// 卷五《地点地形与资源场》§4.1.3 规则 1–5（单根树、到根步数有限、边两端存在且 from<to、面积和、坐标包含）、§4.14（政区层级单调）、
// §2.1 :82 表头、M5-31、M5-33；卷二《维度表规范与统一入口》§6.3 :2212（地点 458、政区 40、routes 全部搬入 edges）；卷二十 §2.7 天气单元字段；
// docs/迁移体检/块6.md 第四节 6-24 段（旧数据有的值照转，没有的列登记未建，不编数字）。
// 数量与期望一律从旧数据（world/geo/*.json）当场算出，不抄死字面量；转换函数自身另核"重跑结果与入库文件一致"。
// 只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { weatherAt } from '../../server-plugin/kernel/weather.mjs';
import { convertGeo, newId } from '../../tools/convert-geo.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
useReportSink(() => {});
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const OLD = {
  locations: readJson('world/geo/locations.json'),
  regions: readJson('world/geo/regions.json'),
  routes: readJson('world/geo/routes.json'),
  biomes: readJson('world/geo/biomes.json').locations,
  cell: readJson('world/geo/weather-cell.json'),
};
const W = loadWorld(ROOT);
const PLACE = W.tables.get('place').doc;
const ROWS = PLACE.rows;
const IDS = Object.keys(ROWS);
const LABELS = readJson('world/i18n/labels.zh.json');
const VOCAB = readJson('world/ontology/dimensions/_vocab.json');
const provinces = OLD.regions.filter((r) => r.category === 'province');
const counties = OLD.regions.filter((r) => r.category === 'county');
const levelOf = (id) => ROWS[id].regionLevel;
const km = (v) => Number((v * 1000).toFixed(4));

test('真实世界：加载零错误（含规则 1–5 的加载校验、两族词表引用闭合、未建列登记合法）', () => {
  assert.equal(W.ok, true, W.text);
});

test('规模：九省 31 郡与旧数据一致；行数 = 世界根 + 省 + 郡 + 旧地点；边数 = 旧路线数（数量从旧数据算出）', () => {
  assert.equal(IDS.filter((id) => levelOf(id) === 'juris_province').length, provinces.length);
  assert.equal(IDS.filter((id) => levelOf(id) === 'juris_county').length, counties.length);
  assert.equal(IDS.length, 1 + provinces.length + counties.length + OLD.locations.length);
  assert.equal(PLACE.edges.length, OLD.routes.length);
  assert.ok(provinces.length > 0 && counties.length > 0 && OLD.locations.length > 0);
});

test('规则 1：全表恰一个根，每行沿 parent 有限步到根；层级只看 regionLevel：省挂世界根、郡挂其省、政区沿树 rank 严格递增', () => {
  const roots = IDS.filter((id) => ROWS[id].parent === null);
  assert.equal(roots.length, 1);
  assert.equal(levelOf(roots[0]), 'juris_world');
  for (const id of IDS) {
    let p = id; let steps = 0;
    while (ROWS[p].parent !== null) { p = ROWS[p].parent; steps += 1; assert.ok(steps <= IDS.length, `cycle at ${id}`); assert.ok(ROWS[p], `missing parent of ${id}`); }
    assert.equal(p, roots[0]);
  }
  const rank = (lv) => W.vocab.index.get(lv).entry.rank;
  for (const p of provinces) assert.equal(ROWS[newId(p.id)].parent, roots[0]);
  for (const c of counties) assert.equal(ROWS[newId(c.id)].parent, newId(c.province));
  for (const id of IDS) {
    if (!levelOf(id) || ROWS[id].parent === null) continue;
    let up = ROWS[id].parent;
    while (up !== null && !levelOf(up)) up = ROWS[up].parent;
    if (up !== null) assert.ok(rank(levelOf(up)) > rank(levelOf(id)), `${id} rank not below ${up}`);
  }
});

test('每处旧地点都有一行，坐标照旧值（千米折米），父按旧 parent；旧 parent 与所属郡（county.places）冲突的以郡为父', () => {
  const countyOfPlace = new Map();
  for (const c of counties) for (const p of c.places ?? []) countyOfPlace.set(p, newId(c.id));
  for (const o of OLD.locations) if (o.region) countyOfPlace.set(o.id, newId(o.region));
  for (const o of OLD.locations) {
    const row = ROWS[newId(o.id)];
    assert.ok(row, o.id);
    assert.deepEqual(row.coord, { x: km(o.coordinates[0]), y: km(o.coordinates[1]) }, o.id);
    const listed = countyOfPlace.get(o.id);
    assert.ok(listed || o.parent !== null, `${o.id} has neither parent nor county`);
    assert.equal(row.parent, listed ?? newId(o.parent), o.id);
    assert.ok(typeof LABELS[newId(o.id)]?.label === 'string' && LABELS[newId(o.id)].label === o.name, `label ${o.id}`);
  }
  for (const r of OLD.regions) {
    assert.equal(LABELS[newId(r.id)]?.label, r.name, r.id);
    assert.deepEqual(ROWS[newId(r.id)].coord, { x: km(r.center[0]), y: km(r.center[1]) }, r.id);
  }
});

test('面积：biomes.json 登记了面积的地点按平方千米折平方米照转，其余不写（缺值登记未建，不编）', () => {
  for (const o of OLD.locations) {
    const a = OLD.biomes[o.id]?.areaKm2;
    const row = ROWS[newId(o.id)];
    if (a === undefined) assert.equal(Object.hasOwn(row, 'areaM2'), false, o.id);
    else assert.equal(row.areaM2, Number((a * 1e6).toFixed(4)), o.id);
  }
});

test('进入档：旧 access.mode 都折成 access 族条目，没有旧 access 的行不写（不借缺省）；族里每条都有行在用', () => {
  const entries = Object.keys(VOCAB.families.access.entries);
  assert.ok(entries.length > 0);
  const used = new Set();
  for (const o of OLD.locations) {
    const row = ROWS[newId(o.id)];
    if (!o.access) { assert.equal(Object.hasOwn(row, 'accessClass'), false, o.id); continue; }
    assert.ok(entries.includes(row.accessClass), o.id);
    used.add(row.accessClass);
  }
  assert.deepEqual([...used].sort(), [...entries].sort());
  const same = (m) => new Set(OLD.locations.filter((o) => o.access?.mode === m).map((o) => ROWS[newId(o.id)].accessClass));
  for (const m of new Set(OLD.locations.filter((o) => o.access).map((o) => o.access.mode))) assert.equal(same(m).size, 1, `mode ${m} maps to one entry`);
});

test('边：旧路线逐条搬入；from 小于 to；两端加通路类型唯一；仅含 boat 方式的旧路线是水路边；不存路长（拍板第 12 条，卷五 §4.1 规则 4：路程由栅格化路段派生）', () => {
  const key = (e) => [e.from, e.to, e.waterway].join('|');
  const seen = new Set();
  for (const e of PLACE.edges) {
    assert.ok(e.from < e.to, key(e));
    assert.ok(ROWS[e.from] && ROWS[e.to], key(e));
    assert.equal(seen.has(key(e)), false, `dup ${key(e)}`);
    seen.add(key(e));
  }
  for (const r of OLD.routes) {
    const a = newId(r.from); const b = newId(r.to);
    const water = r.modes.length === 1 && r.modes[0] === 'boat';
    const e = PLACE.edges.find((x) => x.from === (a < b ? a : b) && x.to === (a < b ? b : a) && x.waterway === water);
    assert.ok(e, r.id);
    assert.deepEqual(Object.keys(e).sort(), ['from', 'to', 'waterway'], r.id); // 路长、地形构成、路况、通畅度都不存（A5-1.1）
  }
  assert.equal(PLACE.edges.filter((e) => e.waterway).length, OLD.routes.filter((r) => r.modes.length === 1 && r.modes[0] === 'boat').length);
});

test('水体类：waterAccess 只给旧水路边的两端，条目都有行在用；其余行不写', () => {
  const entries = Object.keys(VOCAB.families.water.entries);
  assert.ok(entries.length > 0);
  const ends = new Set(PLACE.edges.filter((e) => e.waterway).flatMap((e) => [e.from, e.to]));
  const used = new Set();
  for (const id of IDS) {
    if (!ends.has(id)) { assert.equal(Object.hasOwn(ROWS[id], 'waterAccess'), false, id); continue; }
    for (const w of ROWS[id].waterAccess) { assert.ok(entries.includes(w), id); used.add(w); }
  }
  // 水体类条目由旧行的 waterAccess 用，或由转换输入里的水体行（world/geo/water-bodies.json，G5b 转换后才进表）用；两处都没用的条目才算多余。
  const bodies = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'world/geo/water-bodies.json'), 'utf8')).bodies;
  for (const b of bodies) used.add(b.waterKind);
  assert.deepEqual([...used].sort(), [...entries].sort());
});

test('必过项③：起始地区（旧数据里 places 含 loc_hw 的郡）挂 comp_weather_cell，字段与 weather-cell.json 逐项相等，引用 cpr_taiyuan，经 weatherAt 可算', () => {
  const start = counties.filter((c) => (c.places ?? []).includes('loc_hw'));
  assert.equal(start.length, 1);
  const row = ROWS[newId(start[0].id)];
  assert.ok(row.classes.includes('comp_weather_cell'));
  for (const [k, v] of Object.entries(OLD.cell.cell)) assert.deepEqual(row[k], v, k);
  assert.equal(row.elevationM, OLD.cell.cellElevationM);
  assert.equal(row.climateProto, 'cpr_taiyuan');
  const cell = Object.fromEntries(Object.keys(OLD.cell.cell).map((k) => [k, row[k]]));
  const w = weatherAt({ vocab: W.vocab, rules: W.rules, units: W.env.units }, { worldSeed: 'seed_one', streamCode: 'weather', cellId: newId(start[0].id), latitudeDeg: OLD.cell.latitudeDeg, cell }, 10);
  assert.equal(w.state.known, true);
});

test('必过项④：其余郡的天气单元没有气候数据：不引原型、不写值，登记为未建列；当日天气按未知并报缺口，不借太原', () => {
  const startId = newId(counties.find((c) => (c.places ?? []).includes('loc_hw')).id);
  const others = counties.map((c) => newId(c.id)).filter((id) => id !== startId);
  assert.equal(others.length, counties.length - 1);
  const unbuilt = readJson('world/ontology/dimensions/_unbuilt-derived.json').columns.filter((c) => c.table === 'place').map((c) => c.dimension);
  for (const d of ['climateProto', 'annualMeanTempC', 'annualPrecipMm', 'tempAmpC', 'diurnalAmpC', 'perennialSnowMm', 'precipLiquid']) assert.ok(unbuilt.includes(d), d);
  for (const id of others) {
    const row = ROWS[id];
    assert.ok(row.classes.includes('comp_weather_cell'), id);
    for (const k of Object.keys(OLD.cell.cell)) assert.equal(Object.hasOwn(row, k), false, `${id}.${k}`);
    const w = weatherAt({ vocab: W.vocab, rules: W.rules, units: W.env.units }, { worldSeed: 'seed_one', streamCode: 'weather', cellId: id, latitudeDeg: null, cell: {} }, 10);
    assert.equal(w.state.known, false, id);
  }
});

test('未建列登记：旧数据没有值的 always 列都登记在 _unbuilt-derived.json（place），且各行缺值而不是被填缺省', () => {
  const cols = readJson('world/ontology/dimensions/_unbuilt-derived.json').columns.filter((c) => c.table === 'place').map((c) => c.dimension);
  for (const d of ['areaM2', 'elevationM', 'skyExposure', 'ledgerHolder', 'waterAccess', 'forestCover', 'hiddenness', 'accessClass']) assert.ok(cols.includes(d), d);
  for (const o of OLD.locations) for (const d of ['elevationM', 'skyExposure', 'ledgerHolder', 'forestCover', 'hiddenness']) assert.equal(Object.hasOwn(ROWS[newId(o.id)], d), false, `${o.id}.${d}`);
});

test('转换脚本可重跑：同一份旧数据重转的 rows、edges、labels 与入库文件一致；旧 id 折新 id 的规则是整类的（loc_、bld_ 原样，其余加 loc_ 前缀）', () => {
  const out = convertGeo(join(ROOT, 'world/geo'));
  assert.deepEqual(out.rows, ROWS);
  assert.deepEqual(out.edges, PLACE.edges);
  for (const [id, label] of Object.entries(out.labels)) assert.deepEqual(LABELS[id], label, id);
  for (const o of OLD.locations) {
    const want = /^(loc|bld)_/.test(o.id) ? o.id : `loc_${o.id}`;
    assert.equal(newId(o.id), want);
  }
  assert.equal(new Set(OLD.locations.map((o) => newId(o.id))).size, OLD.locations.length);
});

test('juris 族（卷五 :1060）：郡<省<王国<世界；王国级旧数据没有行，不挂行', () => {
  const e = VOCAB.families.juris.entries;
  const order = ['juris_county', 'juris_province', 'juris_kingdom', 'juris_world'];
  for (let i = 1; i < order.length; i += 1) assert.ok(e[order[i - 1]].rank < e[order[i]].rank, order[i]);
  assert.equal(IDS.some((id) => ROWS[id].regionLevel === 'juris_kingdom'), false);
});
