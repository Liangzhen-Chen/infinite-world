// 真实世界上格收尾：试玩地区以外建筑行的设施类型 intendedType（作者数据，world/geo/building-classes.json）。
// 只读 world/ 数据；不抄当前计数：期望由旧数据字段（purpose）与设施类型表现算。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { convertGeo, newId } from '../../tools/convert-geo-g5b.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { createHash } from 'node:crypto';
import { planBlueprint, planCellsOf, volumeByMaterialRole } from '../../server-plugin/kernel/blueprint.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const WORLD = join(dirname(fileURLToPath(import.meta.url)), '../../world');
const readJson = (p) => JSON.parse(readFileSync(join(WORLD, p), 'utf8'));
const typeTable = readJson('ontology/dimensions/facility_type.json').rows;
const classRows = readJson('geo/building-classes.json').rows;
const startRows = readJson('geo/start-buildings.json').rows;
const locations = readJson('geo/locations.json');
const locLines = readFileSync(join(WORLD, 'geo/locations.json'), 'utf8').split(/\r?\n/);
const out = convertGeo(join(WORLD, 'geo'));
const buildings = Object.entries(out.rows).filter(([, r]) => (r.classes ?? []).includes('comp_facility'));

test('每栋写了 intendedType 的建筑行，类型都是设施类型表的行（转换后的行与作者清单都核）', () => {
  assert.ok(buildings.length > 0);
  for (const [id, r] of buildings) if (r.intendedType !== undefined) assert.ok(Object.hasOwn(typeTable, r.intendedType), `${id}: ${r.intendedType}`);
  for (const r of [...classRows, ...startRows]) if (r.intendedType !== undefined) assert.ok(Object.hasOwn(typeTable, r.intendedType), `${r.id}: ${r.intendedType}`);
});

// 第 n 行（从 1 起）属于哪条旧记录：往上找最近的顶层 "id" 行（4 空格缩进）。
const ownerOf = (n) => {
  for (let i = n - 1; i >= 0; i -= 1) { const m = /^    "id": "([^"]+)"/.exec(locLines[i] ?? ''); if (m) return m[1]; }
  return null;
};

test('作者清单里写了类型的行都是真建筑行、来源标作者、依据所引的每个行号都落在它自己的旧记录里', () => {
  const ids = new Set(buildings.map(([id]) => id));
  for (const r of classRows.filter((x) => x.intendedType !== undefined)) {
    assert.ok(ids.has(newId(r.id)), `${r.id} is a building row`);
    assert.equal(r.source, '作者');
    const m = /依据：world\/geo\/locations\.json:([\d、]+)$/.exec(r.intendedBasis);
    assert.ok(m, `${r.id} intendedBasis ends with a 依据 citation`);
    const cited = m[1].split('、').map(Number);
    for (const n of cited) assert.equal(ownerOf(n), r.id, `${r.id}: cited line ${n} lies inside its own record`);
  }
});

test('旧数据用途为私宅的建筑行一律是住宅类（同一规则，不按 id 取）', () => {
  const houses = locations.filter((l) => /^bld_/.test(l.id) && l.purpose === '私宅').map((l) => l.id);
  assert.ok(houses.length > 0);
  const typeOf = new Map(buildings.map(([id, r]) => [id, r.intendedType]));
  for (const id of houses) assert.equal(typeOf.get(newId(id)), 'fac_house', id);
});

test('李白 11-24 S6-2：交易点、露天场地、共用灶房三类在设施类型表里（前缀 fac_，字段同已有类型）；每栋建筑行都有设施类型', () => {
  const some = typeTable.fac_forge;
  for (const t of ['fac_trading_post', 'fac_open_ground', 'fac_common_kitchen']) {
    assert.ok(Object.hasOwn(typeTable, t), t);
    assert.deepEqual(Object.keys(typeTable[t]).sort(), Object.keys(some).sort(), `${t} has the same columns as an existing row`);
  }
  for (const [id, r] of buildings) assert.equal(typeof r.intendedType, 'string', `${id} has an intendedType`);
});

test('每个设施类型都能挑到至少一个形制（形制 facilityTypes 含它）；形制适用的类型都是表的行', () => {
  const forms = readJson('ontology/dimensions/_vocab.json').families.bform.entries;
  const covered = new Set(Object.values(forms).flatMap((f) => f.facilityTypes));
  assert.deepEqual(Object.keys(typeTable).filter((t) => !covered.has(t)), []);
  for (const [name, f] of Object.entries(forms)) for (const t of f.facilityTypes) assert.ok(Object.hasOwn(typeTable, t), `${name}: ${t}`);
});

test('露天场地形制：无墙无顶无桥面（卷十九 §2.4 开关），只适用露天场地；蓝图没有外墙、屋面、承托元，围护各角色体积为 0，开局 materialKg 取空映射（卷十九 :337、:346）', () => {
  const forms = readJson('ontology/dimensions/_vocab.json').families.bform.entries;
  const f = forms.bldform_open_yard;
  assert.deepEqual([f.walled, f.roofed, f.deck], [false, false, false]);
  assert.deepEqual(f.facilityTypes, ['fac_open_ground']);
  for (const [name, o] of Object.entries(forms)) if (name !== 'bldform_open_yard') assert.equal(o.facilityTypes.includes('fac_open_ground'), false, name);
  const W = loadWorld(join(WORLD, '..')); // 装入定点函数表；世界必须能加载（新形制过加载期的形制校验，含默认用料物性）
  assert.ok(W.ok, W.text);
  const tables = Object.fromEntries(readJson('rules/tables/grid.json').rows.map((r) => [r.key, r.value]));
  const fac = Object.fromEntries(readJson('rules/tables/facility.json').rows.map((r) => [r.key, r.value]));
  const rules = { cellM: tables.cellM, storeyM: tables.storeyM, m3PerL: 0.001, facingDirections: tables.facingDirections, limits: fac.blueprint };
  // 36 m²、无墙：w = 0、m = 1；D = max(1, ⌊√36⌋) = 6、W = max(1, ceil(36 ÷ 6)) = 6（卷十九 §4.5 规则 7 第 1 点，cellM 1 m）。
  const pc = planCellsOf({ form: f, areaM2: 36, wallThicknessM: f.wallThicknessDefaultM }, rules);
  assert.deepEqual(pc, { widthCells: 6, depthCells: 6 });
  const bp = planBlueprint({ form: f, planCells: pc, storeys: 1, wallThicknessM: f.wallThicknessDefaultM, facing: 0 }, rules);
  assert.equal(bp.ok, true);
  assert.deepEqual(volumeByMaterialRole(bp), { wall: 0n, frame: 0n, roof: 0n });
});

// ---- 住区下的 19 栋私宅（李白 11-22 回 1122-1125 取③）：父行是建筑行的建筑改挂到第一个非建筑祖先，原父记 originSite，落位照常排 ----
// 期望按改挂前的旧数据（locations.json 里这 19 栋的 parent 是 site_ms_ 住区行，住区的 parent 是营地站点）逐栋列成字面量：[私宅 id, 原住区 id, 营地站点 id]。
const HOMES = [
  ['bld_ms_gs_01', 'loc_site_ms_gs_tents', 'loc_ms_huipeng'], ['bld_ms_gs_02', 'loc_site_ms_gs_tents', 'loc_ms_huipeng'], ['bld_ms_gs_03', 'loc_site_ms_gs_carts', 'loc_ms_huipeng'],
  ['bld_ms_hx_01', 'loc_site_ms_hx_water', 'loc_ms_huixi'], ['bld_ms_hx_02', 'loc_site_ms_hx_water', 'loc_ms_huixi'], ['bld_ms_hx_03', 'loc_site_ms_hx_land', 'loc_ms_huixi'], ['bld_ms_hx_04', 'loc_site_ms_hx_land', 'loc_ms_huixi'],
  ['bld_ms_ll_home_01', 'loc_site_ms_ll_tents', 'loc_ms_lielu'], ['bld_ms_ll_home_02', 'loc_site_ms_ll_huts', 'loc_ms_lielu'], ['bld_ms_ll_home_03', 'loc_site_ms_ll_rocks', 'loc_ms_lielu'],
  ['bld_ms_td_home_01', 'loc_site_ms_td_tai', 'loc_ms_taideng'], ['bld_ms_td_home_02', 'loc_site_ms_td_qing', 'loc_ms_taideng'], ['bld_ms_td_home_03', 'loc_site_ms_td_li', 'loc_ms_taideng'],
  ['bld_ms_tj_home_01', 'loc_site_ms_tj_yan', 'loc_ms_tanjie'], ['bld_ms_tj_home_02', 'loc_site_ms_tj_ding', 'loc_ms_tanjie'], ['bld_ms_tj_home_03', 'loc_site_ms_tj_li', 'loc_ms_tanjie'],
  ['bld_ms_yg_home_01', 'loc_site_ms_yg_crown', 'loc_ms_yugen'], ['bld_ms_yg_home_02', 'loc_site_ms_yg_stone', 'loc_ms_yugen'], ['bld_ms_yg_home_03', 'loc_site_ms_yg_sett', 'loc_ms_yugen'],
];

test('父行是建筑行的建筑：转换后改挂到第一个非建筑祖先、原父记 originSite；这 19 栋逐栋核；住区行自身仍是建筑行（规则按“父行是建筑行”认，不按 id）', () => {
  const isBuilding = (r) => (r.classes ?? []).includes('comp_facility');
  const nested = Object.entries(out.rows).filter(([, r]) => isBuilding(r) && r.originSite !== undefined && isBuilding(out.rows[r.originSite] ?? {}));
  assert.deepEqual(nested.map(([id]) => id).sort(), HOMES.map((h) => h[0]).sort());
  for (const [home, quarter, camp] of HOMES) {
    assert.equal(out.rows[home].originSite, quarter, home);
    assert.equal(out.rows[home].parent, camp, home);
    assert.equal(isBuilding(out.rows[quarter]), true, `${quarter} stays a building row`);
    assert.equal(isBuilding(out.rows[camp]), false, `${camp} is a site, not a building`);
  }
  for (const [id, r] of buildings) assert.equal(isBuilding(out.rows[r.parent] ?? {}), false, `${id} hangs directly under a non-building row`);
});
// 19 栋落位（anchor、facing）要真实世界整段补缺约两分钟，已挪到 tests/cloud/building-types-world.test.mjs（长测，腾讯云块验收跑）。
