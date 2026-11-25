// 前置卡 D（李白 11-23 事件 36015fd8 G5b-K 第 D 条）数据：海湖水深规则行、设施类型与形制、公库分区、出生地开放。
// 只读 world/ 数据（不 loadWorld）；期望值按卷文与设定原文手算成字面量，不抄仓库当前读数。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { convertGeo, newId } from '../../tools/convert-geo-g5b.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
const WORLD = join(dirname(fileURLToPath(import.meta.url)), '../../world');
const readJson = (p) => JSON.parse(readFileSync(join(WORLD, p), 'utf8'));
const vocab = readJson('ontology/dimensions/_vocab.json').families;
const worldgen = readJson('rules/tables/worldgen.json').rows;
const waterRows = worldgen.find((r) => r.key === 'waterRows').value;
const startBuildings = readJson('geo/start-buildings.json').rows;
const out = convertGeo(join(WORLD, 'geo'));

// ---- ① 水体规则行：每种水体类（河、海、湖）都有行，水深下限 > 0；海的上限受整升数安全上限约束 ----
test('水深规则行：地理模型里出现的每种水体类都有一行，三角分布 min > 0、min ≤ mode ≤ max', () => {
  const kinds = new Set(Object.values(out.rows).filter((r) => r.waterKind !== undefined).map((r) => r.waterKind));
  assert.deepEqual([...kinds].sort(), ['water_lake', 'water_river', 'water_saltlake', 'water_sea']);
  for (const k of kinds) {
    const rows = waterRows.filter((r) => r.waterKind === k);
    assert.equal(rows.length, 1, `${k} has exactly one rule row`);
    const d = rows[0].depthM;
    assert.equal(d.dist, 'triangular');
    assert.ok(d.min > 0 && d.min <= d.mode && d.mode <= d.max, `${k} depth triangular is well-formed`);
  }
});

test('海深：没有 100 m 上限（水体存量改立方米，勘误 1123k53）；最大的海（南湾）按 geo-model 矩形手算面积 (360×220 + 45×26) km² = 80,370 km²，水深上限 × 面积（m³）远在 2^53 − 1 以内，深度取陆架外缘 200 m', () => {
  const model = readJson('geo/geo-model.json');
  const south = model.seas.loc_water_sea_south;
  const areaKm2 = south.rectsKm.reduce((s, [x0, x1, y0, y1]) => s + (x1 - x0) * (y1 - y0), 0);
  assert.equal(areaKm2, 80370);
  const sea = waterRows.find((r) => r.waterKind === 'water_sea').depthM;
  assert.equal(sea.max, 200); // 不再是 100：原 100 m 由整升数上限压出，单位改立方米后撤掉
  assert.equal(sea.max * areaKm2 * 1e6, 1.6074e13); // 200 m × 8.037×10^10 m² = 1.6074×10^13 m³
  assert.ok(sea.max * areaKm2 * 1e6 <= Number.MAX_SAFE_INTEGER);
  // 另两片海更小（北海 890×20 + 50×25 = 19,050 km²，西海 20×580 + 190×100 = 30,600 km² 未扣岛），同一上限下必然也装得下。
  for (const [id, want] of [['loc_water_sea_north', 19050], ['loc_water_sea_west', 30600]]) {
    const a = model.seas[id].rectsKm.reduce((s, [x0, x1, y0, y1]) => s + (x1 - x0) * (y1 - y0), 0);
    assert.equal(a, want);
    assert.ok(a <= areaKm2);
  }
});

test('两湖（P10-5）：镜沼 water_lake 可航（渡口，regions.json:644）、灰盐池 water_saltlake 不可航（干热盐碱洼地，附表 :144、:203）、都是静水；灰盐池液体取现有最近的咸水材料 mat_seawater（无卤水行，不自造）；两类水深都比海浅', () => {
  const w = vocab.water.entries;
  assert.deepEqual([w.water_lake.navigable, w.water_lake.flowing, w.water_saltlake.navigable, w.water_saltlake.flowing], [true, false, false, false]);
  assert.equal(out.rows.loc_water_lake_jingzhao.waterKind, 'water_lake');
  assert.equal(out.rows.loc_water_lake_huiyan.waterKind, 'water_saltlake');
  assert.equal(out.rows.loc_water_lake_jingzhao.liquid, 'mat_water');
  assert.equal(out.rows.loc_water_lake_huiyan.liquid, 'mat_seawater');
  assert.ok(vocab.cellclass.entries.cellclass_water.waterAny.includes('water_saltlake'));
  const d = (k) => waterRows.find((r) => r.waterKind === k).depthM;
  assert.ok(d('water_saltlake').max < d('water_lake').max && d('water_lake').max < d('water_sea').min);
});

// ---- ② 设施类型与形制 ----
const TYPE_OF = {
  bld_hw_qingdeng: 'fac_inn', bld_hw_mill: 'fac_mill', bld_hw_council: 'fac_office', bld_hw_riverhome: 'fac_house', bld_hw_forge: 'fac_forge',
  bld_hw_weaving: 'fac_workshop', bld_hw_school: 'fac_school', bld_hw_post: 'fac_inn', bld_hw_altar: 'fac_shrine', bld_hw_grain_annex: 'fac_granary',
  bld_hw_home_15: 'fac_house', bld_hw_home_16: 'fac_house', bld_hw_home_17: 'fac_house', bld_hw_home_18: 'fac_house',
  bld_hw_home_19: 'fac_house', bld_hw_home_20: 'fac_house', bld_hw_home_21: 'fac_house', bld_hw_home_22: 'fac_house',
  bld_hw_herbs: 'fac_clinic',
};

test('试玩地区建筑行：19 栋都写了设施类型（名称与用途、设计数据对应卷二 §5.7 的首批类型）', () => {
  for (const [id, type] of Object.entries(TYPE_OF)) assert.equal(out.rows[newId(id)].intendedType, type, id);
  const startIds = new Set(startBuildings.map((b) => newId(b.id)));
  assert.equal(startIds.size, 19);
  assert.deepEqual([...startIds].filter((id) => out.rows[id].intendedType === undefined), []);
});

test('设施类型是维度表（卷十九 §2.2，P10-2）：词表里没有 facility_type 族；表头 kind facility_type、行 id 前缀 fac_；试玩地区用到的每个类型都是表的行，围合上限显式写（数或 null）、进入缺省档是 access 族条目', () => {
  assert.equal(Object.hasOwn(vocab, 'facility_type'), false);
  const table = readJson('ontology/dimensions/facility_type.json');
  assert.equal(table.kind, 'facility_type');
  assert.deepEqual(table.entity.idPrefix, ['fac_']);
  for (const k of ['functionNeeds', 'maxSkyExposure', 'maxAperture', 'accessDefault', 'services', 'ratingWeights', 'wearPerDay']) assert.ok(Object.hasOwn(table.dimensions, k), `header declares ${k}`);
  const place = readJson('ontology/dimensions/place.json').dimensions.intendedType;
  assert.deepEqual([place.type, place.kind, place.vocab], ['ref', 'facility_type', undefined]);
  const fam = { entries: table.rows };
  for (const type of new Set(Object.values(TYPE_OF))) {
    const e = fam.entries[type];
    assert.ok(e, `${type} is a row of the table`);
    for (const k of ['maxSkyExposure', 'maxAperture']) assert.ok(Object.hasOwn(e, k) && (e[k] === null || (e[k] >= 0 && e[k] <= 1)), `${type}.${k} written explicitly (卷十九 :169)`);
    assert.ok(Object.hasOwn(vocab.access.entries, e.accessDefault), `${type}.accessDefault is an access entry`);
    assert.deepEqual(e.functionNeeds, {}); // 固定装置族与功能词表未建，功能下限写空 map（卷十九 :168 允许）
    assert.ok(typeof e.basis === 'string' && e.basis.length > 0);
  }
  // 8 处私宅旧数据 access.mode 都是 private（locations.json:3289 起），住宅类缺省档取私
  assert.equal(fam.entries.fac_house.accessDefault, 'access_private');
});

test('形制：试玩地区建筑行写的每个 form 都在 bform 登记里；bldform_shrine 的 planSideMaxCells 按设定占地上限 20 m² 折外包 = ⌊√20⌋ = 4、ceil(20 ÷ 4) = 5', () => {
  for (const b of startBuildings) if (typeof b.form === 'string') assert.ok(Object.hasOwn(vocab.bform.entries, b.form), b.form);
  assert.equal(out.rows[newId('bld_hw_altar')].form, 'bldform_shrine');
  const shrine = vocab.bform.entries.bldform_shrine;
  const depth = Math.floor(Math.sqrt(20));
  assert.equal(depth, 4);
  assert.equal(shrine.planSideMaxCells, Math.ceil(20 / depth));
  assert.equal(shrine.planSideMaxCells, 5);
  assert.equal(shrine.walled, true);
  assert.equal(shrine.roofed, true);
  assert.deepEqual(shrine.rooms, []);
  // 适用设施类型（勘误 1123k52）：祠庙形制只适用 fac_shrine（模板 uses 恰为 shrine，13-建筑 :109）；每个形制列的类型都是类型表的行。
  assert.deepEqual(shrine.facilityTypes, ['fac_shrine']);
  const rowIds = new Set(Object.keys(readJson('ontology/dimensions/facility_type.json').rows));
  for (const [code, f] of Object.entries(vocab.bform.entries)) for (const t of f.facilityTypes) assert.ok(rowIds.has(t), `${code} lists ${t}`);
  assert.equal(vocab.bform.entries.bldform_river_house.facilityTypes.includes('fac_shrine'), false);
  assert.equal(vocab.bform.entries.bldform_shrine.facilityTypes.includes('fac_granary'), false);
  assert.ok(shrine.wallThicknessMinM <= shrine.wallThicknessDefaultM);
});

// ---- ③ 公库分区 ----
test('用途分区：purpose_general 四列写全，trackOutflow 假（卷八 :1371）、locksFor 空；purpose_escrow 照卷六 :1031（四列 假、空、假、假）', () => {
  const e = vocab.purpose.entries;
  assert.equal(vocab.purpose.prefix, 'purpose_');
  assert.deepEqual(Object.keys(e.purpose_general).filter((k) => k !== 'basis').sort(), ['locksFor', 'spendable', 'trackOutflow', 'visibleToMarket']);
  assert.equal(e.purpose_general.trackOutflow, false);
  assert.equal(e.purpose_general.locksFor, null);
  assert.equal(typeof e.purpose_general.spendable, 'boolean');
  assert.equal(typeof e.purpose_general.visibleToMarket, 'boolean');
  assert.deepEqual({ ...e.purpose_escrow, basis: undefined }, { basis: undefined, locksFor: null, spendable: false, trackOutflow: false, visibleToMarket: false });
});

// ---- ④ 出生地开放范围 ----
test('genOpen：place 表头登记 boolean、never、gap；试玩地区出生地（河湾村）写 true，全世界只此一行', () => {
  const dim = readJson('ontology/dimensions/place.json').dimensions.genOpen;
  assert.equal(dim.type, 'boolean');
  assert.equal(dim.required, 'never');
  assert.equal(dim.onUnknown, 'gap');
  const open = Object.entries(out.rows).filter(([, r]) => r.genOpen !== undefined);
  assert.deepEqual(open.map(([id, r]) => [id, r.genOpen]), [['loc_hw', true]]);
});
