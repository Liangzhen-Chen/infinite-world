// 验收测试（出题方：Claude Sonnet 5.5 中档；写修复的是另一个模型，审卡的是第三方）。
// 依据：卷五 :504 落格 landCell "只在 place 的足迹内、且 zoneAt 恰为 place 的格里取（落在更深后代足迹里的格不算）……区域足迹按 hash(seedKey, 区格序号) 依次看各区格，
//       取该区格中心列地表层那一格，第一个满足条件的即是……都没有返回未知"；卷五 :321 "zoneAt 照该格实际所在求（中心列地表层格落在建筑、房间足迹里就是那处）"；
//       验收卷五 :542；偏离清查-1122 甲 4（06a #1、06e #2）。
// 测什么：区域 loc_a 唯一区格的中心列地表层格被一栋带地下室的建筑压着（zoneAt 为建筑）时，landCell(loc_a, coarse) 的落点 zoneAt 必须恰为 loc_a 或无落点（null）；
//         对照：建筑不压中心列时仍落中心列。期望：落点格 (50,150,0) 手算自夹具（区格 (0,1)，每区格 100 细格，中心 = 0×100+50、1×100+50）。
// 为什么修前失败：footprint.mjs:691-701 landRegionCell 只筛 plan.owner[k] === me（区域归属），不核 zoneAt，直接返回中心列地表层格，落点 zoneAt 是 bld_a。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../../accept/temp-root.mjs';
import { loadWorld } from '../../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { gridView, zoneAt, placeView, landCell, regionCell } from '../../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok);
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = (({ rows, edges, gridSpaces, generated, ...head }) => ({ ...head, generated: {} }))(JSON.parse(realText('place.json')));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' }, cellclass_water: { ...ANY, waterAny: ['water_test_fresh'], slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, defaultMaterials: { wall: 'mat_soil', frame: 'mat_elm', roof: 'mat_straw' }, rooms: [], facilityTypes: ['fac_house'] };
const FORMS = { bldform_hut: FORM, bldform_cellar: { ...FORM, storeyBase: -1 } };
const ROLES = { roomrole_front: {}, roomrole_back: {} };

function load({ rows, spaces }) {
  const tmp = testTempRoot('land-cell-region-zone-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} }));
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = { ...FORMS, bldform_shrine: v.families.bform.entries.bldform_shrine, bldform_open_yard: v.families.bform.entries.bldform_open_yard };
    v.families.roomrole.entries = ROLES;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({ parent, skyExposure: 1, ledgerHolder: false, basis: 'test', waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra });
const ROOT_ROW = () => row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0 });
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, wallFlowKg: { laidKg: { mat_granite: 1000 }, takenKg: { mat_granite: 0 }, lostKg: { mat_granite: 0 } }, ...extra,
});
const WORLD = (extra = {}) => ({
  rows: { loc_root: ROOT_ROW(), loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }), loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }), ...extra },
  spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 3 }, root: 'loc_root' }],
});
const S = {};
const WEAR = { breachShare: 0.5, roofCurve: [[0, 0], [1, 1]], wallOrderCode: 'k_wall', roofOrderCode: 'k_roof' };
function world(spec) {
  const r = load(spec);
  assert.equal(r.ok, true, r.text);
  const rules = { ...r.rules, facility: { ...r.rules.facility, wear: WEAR } };
  return { tables: r.tables, vocab: r.vocab, rules, units: r.env.units, template: { seed: 'seed_test' } };
}

// 夹具：区域 loc_a 只占区格 (0,1)（细格 x 0..99、y 100..199），中心列 (50,150)，地表层 z = 0（所有控制点海拔 0）。
// 带地下室的形制（storeyBase -1）：首层在 z = 0 + 1 + (−1) = 0，即压在地表层上。锚点 (48,152) 6×6 的建筑覆盖中心列 (50,150)。
// 前提自检：这时 zoneAt(中心列地表层格) 是建筑行，不是 loc_a（若夹具失效，这条先断）。
const CENTRE = { w: 0, x: 50, y: 150, z: 0, coarse: true };

test('前提：建筑（含地下室）压在区格中心列地表层上，那一格的 zoneAt 是建筑行（卷五 :321）', () => {
  const e = world(WORLD({ bld_a: building('loc_a', [48, 152, 0], { form: 'bldform_cellar' }) }));
  assert.equal(zoneAt(e, S, CENTRE), 'bld_a');
});

test('区域足迹 coarse 落格：唯一的区格中心列地表层格落在建筑里（zoneAt 是 bld_a），落点不得是这一格：要么没有可落格（null，未知），要么 zoneAt 恰为 loc_a（卷五 :504）', () => {
  const e = world(WORLD({ bld_a: building('loc_a', [48, 152, 0], { form: 'bldform_cellar' }) }));
  for (const seedKey of ['k0', 'k1', 'k2', 'k3']) {
    const p = landCell(e, S, { place: 'loc_a', kind: 'person', seedKey, coarse: true });
    assert.ok(p === null || zoneAt(e, S, p) === 'loc_a', `${seedKey}: 落点 ${JSON.stringify(p)} 的 zoneAt 是 ${p === null ? '-' : zoneAt(e, S, p)}，不是 loc_a`);
  }
});

test('对照：建筑不在区格中心列上时，区域 coarse 落格就是中心列地表层格 (50,150,0)，zoneAt 恰为 loc_a（不因修复而丢掉本该落的格）', () => {
  const e = world(WORLD({ bld_a: building('loc_a', [10, 190, 0], { form: 'bldform_cellar' }) }));
  const p = landCell(e, S, { place: 'loc_a', kind: 'person', seedKey: 'k0', coarse: true });
  assert.deepEqual(p, { w: 0, x: 50, y: 150, z: 0, coarse: true });
  assert.equal(zoneAt(e, S, p), 'loc_a');
});
