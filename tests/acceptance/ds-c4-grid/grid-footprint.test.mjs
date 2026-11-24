// 验收测试（出题方：Claude Haiku 5.5，标识 haiku-test-c4；未参与写码与审卡）。
// 依据：卷五 :274（grid.json：cellM 1 m、regionCellM 100 m、storeyM 3 m）；卷五 :433（区格序号 = floor(x × cellM ÷ regionCellM)，派生不存）；
//       卷五 :321（regionCell 返回区格中心列地表层那一格，coarse 为真）；卷五 :470（直线距离 = fixedSqrtInt(dx²+dy²+dz²)，dz = 层号差 × storeyM，两位置不同格空间为未知）；
//       卷五 :914（扩散：对每一对"有一对四邻接的区格"的足迹相邻地点）；卷五 :1216（相邻：足迹有一对四邻接的区格或有路网边）；
//       卷二 :852（gridKey 三段文本，唯一可逆）；卷五 :465（陆路边在区格八邻寻路，斜向步长 fixedSqrtInt(2 × regionCellM²)）。
// 测什么：
//   T1 区格换算 regionOf：若干细格坐标按 floor(x ÷ 100) 手算成区格序号字面量（含负数）；regionCell 返回区格 (1,2) 的中心列 (150, 250)，再 regionOf 回到 (1,2)。
//   T2 格键往返：gridKeyOf 的三段文本经 gridKeyParse 还原，得到原坐标与里块号（里块 = 10 × 100 ÷ 1 = 1000 细格）的字面量。
//   T3 四邻接：区域足迹 a(0,0)、c(1,0)、b(1,1)、e(2,0)，planFootprints 的 adjacency 与 placeNeighbors 两个公开入口给出的相邻集一致；
//      对角（a、b）与隔一格（a、e）不相邻（卷五 :914、:1216，区格只算四邻接）。
//   T4 直线距离：同一格空间里 (3,4,0) 与 (5,0,0) 到原点的距离相等（都是 5 m）；(0,0,1) 与 (3,0,0) 相等（3 m）；(0,0,4) 与 (12,0,0) 相等（12 m）；
//      对称；不同格空间为 null。卷文只给点对点直线距离，没有"点到足迹的最近点距离"的定义，本测试不测最近点（见出题.md）。
//   T5 足迹种类：建筑 bld_a 与区域 loc_a 经 planFootprints、placeFootprint、placeView 三个公开读口得到的 kind 一致，字面量为 building、region（卷五 :460 次序固定）。
//   八邻寻路的方向次序卷五没有定义（只有步长），本卷不测八邻方向次序（见出题.md）。
// 修前结果：见出题.md（逐条写明修前红或绿）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../../accept/temp-root.mjs';
import { loadWorld } from '../../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../../server-plugin/kernel/save.mjs';
import { regionOf, regionCell, straightM, planFootprints, placeNeighbors, placeFootprint, placeView } from '../../../server-plugin/kernel/place.mjs';
import { gridKeyOf, gridKeyParse } from '../../../server-plugin/kernel/handles/keys.mjs';

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
  const tmp = testTempRoot('ds-c4-grid-footprint-');
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
// 区域行：coord 是细格坐标，取所在区格的中心列（区格 (rx, ry) 的中心细格 = (rx×100+50, ry×100+50)，100 细格一区格，卷五 :274）。
const regionRow = (parent, rx, ry, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x: rx * 100 + 50, y: ry * 100 + 50 }, anchorElevationM: 0, targetAreaM2: 10000, ...extra });
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, wallFlowKg: { laidKg: { mat_granite: 1000 }, takenKg: { mat_granite: 0 }, lostKg: { mat_granite: 0 } }, ...extra,
});

// 四个区域各占一区格（targetAreaM2 = 100² = 10000）：a(0,0)、c(1,0)、b(1,1)、e(2,0)；格空间 3×2 区格（x 0..2，y 0..1）。
const REGION_ROWS = () => ({
  loc_root: ROOT_ROW(),
  loc_a: regionRow('loc_root', 0, 0),
  loc_c: regionRow('loc_root', 1, 0),
  loc_b: regionRow('loc_root', 1, 1),
  loc_e: regionRow('loc_root', 2, 0),
});
const REGION_SPACES = [{ w: 0, box: { x0: 0, y0: 0, cellsX: 3, cellsY: 2 }, root: 'loc_root' }];

// 建筑夹具：bld_a 在区域 loc_a 的区格 (0,0) 里（锚点 (10,10,0)，6×6 蓝图，形制 hut）。
const BUILDING_ROWS = () => ({ ...REGION_ROWS(), bld_a: building('loc_a', [10, 10, 0]) });
const SPACES_ONE = [{ w: 0, box: { x0: 0, y0: 0, cellsX: 3, cellsY: 2 }, root: 'loc_root' }];

const S = {};
const WEAR = { breachShare: 0.5, roofCurve: [[0, 0], [1, 1]], wallOrderCode: 'k_wall', roofOrderCode: 'k_roof' };
function world(rows, spaces) {
  const r = load({ rows, spaces });
  assert.equal(r.ok, true, r.text);
  const rules = { ...r.rules, facility: { ...r.rules.facility, wear: WEAR } };
  return { tables: r.tables, vocab: r.vocab, rules, units: r.env.units, template: { seed: 'seed_test' } };
}

// 前提：卷五 :274 的格尺度字面量（cellM 1、regionCellM 100、storeyM 3）。
test('前提：格尺度是卷五 :274 的字面量（cellM 1 m、regionCellM 100 m、storeyM 3 m）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  assert.equal(e.rules.grid.cellM, 1);
  assert.equal(e.rules.grid.regionCellM, 100);
  assert.equal(e.rules.grid.storeyM, 3);
});

// T1 区格换算（卷五 :433：区格序号 = floor(x × cellM ÷ regionCellM)）。
test('T1a 区格换算：细格 (x, y) 的区格序号 = floor(x ÷ 100)、floor(y ÷ 100)，负数向下取整（卷五 :433）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const pos = (x, y) => ({ w: 0, x, y, z: 0, coarse: false });
  assert.deepEqual(regionOf(e, pos(0, 0)), { x: 0, y: 0 });
  assert.deepEqual(regionOf(e, pos(99, 199)), { x: 0, y: 1 });
  assert.deepEqual(regionOf(e, pos(100, 0)), { x: 1, y: 0 });
  assert.deepEqual(regionOf(e, pos(250, 350)), { x: 2, y: 3 });
  assert.deepEqual(regionOf(e, pos(-1, -1)), { x: -1, y: -1 });
  assert.deepEqual(regionOf(e, pos(-100, -101)), { x: -1, y: -2 });
});

test('T1b 区格换算往返：regionCell 给区格 (1,1) 的中心列 (150, 150)（区格 100 细格的中间列，卷五 :321、:433）；regionOf 回到 (1,1)', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const p = regionCell(e, S, { w: 0, region: { x: 1, y: 1 } });
  assert.ok(p !== null, '区格 (1,1) 在格空间里，应有中心列地表层格');
  assert.equal(p.x, 150);
  assert.equal(p.y, 150);
  assert.deepEqual(regionOf(e, p), { x: 1, y: 1 });
});

// T2 格键往返（卷二 :852 gridKey 三段文本，唯一可逆；里块边长 = 10 × 100 ÷ 1 = 1000 细格）。
test('T2 格键往返：gridKeyOf 的三段文本经 gridKeyParse 还原出原坐标与里块号（里块边长 1000 细格）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  for (const [x, y, z] of [[-1, 250, -2], [1000, 0, 0], [1999, 2000, 5]]) {
    const k = gridKeyOf(e.rules.grid, { w: 0, x, y, z });
    const back = gridKeyParse([k.w, k.chunk, k.cell]);
    const cx = Math.floor(x / 1000);
    const cy = Math.floor(y / 1000);
    assert.deepEqual(back, { w: 0, cx, cy, x, y, z }, `坐标 (${x}, ${y}, ${z}) 往返不一致`);
  }
});

// T3 四邻接（卷五 :914、:1216：足迹相邻只看四邻接的区格；对角与隔一格不相邻）。
// 手算：a(0,0) 只与 c(1,0) 四邻接；c 与 a、b(1,1)、e(2,0) 四邻接；b 只与 c；e 只与 c。
test('T3 四邻接：planFootprints 的足迹相邻集为手算值；对角（a、b）与隔一格（a、e）不相邻', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const fp = planFootprints(e, { base: REGION_ROWS() });
  assert.deepEqual(fp.adjacency.loc_a, ['loc_c']);
  assert.deepEqual(fp.adjacency.loc_c, ['loc_a', 'loc_b', 'loc_e']);
  assert.deepEqual(fp.adjacency.loc_b, ['loc_c']);
  assert.deepEqual(fp.adjacency.loc_e, ['loc_c']);
});

test('T3b 四邻接两入口一致：planFootprints 的相邻集与 placeNeighbors（无路网边）给出的相邻集相同（卷五 :1216）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const fp = planFootprints(e, { base: REGION_ROWS() });
  for (const id of ['loc_a', 'loc_b', 'loc_c', 'loc_e']) {
    assert.deepEqual(placeNeighbors(e, S, id), fp.adjacency[id], `${id} 的相邻集两入口不一致`);
  }
});

// T4 直线距离（卷五 :470：fixedSqrtInt(dx²+dy²+dz²)，dx、dy 为细格序号差 × 1 m，dz 为层号差 × 3 m）。
// 手算：(3,4,0) 距原点 5 m；(0,0,1) 距原点 3 m；(0,0,4) 距原点 12 m。返回值是同一定点标度，故用等式表达。
test('T4 直线距离：(3,4,0) 与 (5,0,0) 距原点相等（均 5 m）；(0,0,1) 与 (3,0,0) 相等（3 m）；(0,0,4) 与 (12,0,0) 相等（12 m）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const P = (x, y, z) => ({ w: 0, x, y, z, coarse: false });
  const O = P(0, 0, 0);
  assert.equal(straightM(e, O, P(3, 4, 0)), straightM(e, O, P(5, 0, 0)));
  assert.equal(straightM(e, O, P(0, 0, 1)), straightM(e, O, P(3, 0, 0)));
  assert.equal(straightM(e, O, P(0, 0, 4)), straightM(e, O, P(12, 0, 0)));
});

test('T4b 直线距离：对称；不同格空间为未知（null，卷五 :470）', () => {
  const e = world(REGION_ROWS(), REGION_SPACES);
  const A = { w: 0, x: 3, y: 4, z: 0, coarse: false };
  const B = { w: 0, x: 0, y: 0, z: 2, coarse: false };
  assert.equal(straightM(e, A, B), straightM(e, B, A));
  assert.equal(straightM(e, A, { ...B, w: 1 }), null);
});

// T5 足迹种类（卷五 :460：组件类决定，次序固定：comp_facility 为建筑，其余区域行为区域）。
// 手算：bld_a 是建筑，loc_a 是区域；三个公开读口给出的 kind 必须一致。
test('T5a 足迹种类（按读口）：bld_a 经 placeFootprint、placeView 都是 building；loc_a 都是 region', () => {
  const e = world(BUILDING_ROWS(), SPACES_ONE);
  assert.equal(placeFootprint(e, S, 'bld_a')?.kind, 'building');
  assert.equal(placeView(e, S, 'bld_a')?.footprint?.kind, 'building');
  assert.equal(placeFootprint(e, S, 'loc_a')?.kind, 'region');
  assert.equal(placeView(e, S, 'loc_a')?.footprint?.kind, 'region');
});

test('T5b 足迹种类（生成读口）：planFootprints 的 footprints 含每个行（卷五 :322 "返回各行的 footprint"），bld_a 的 kind 为 building，loc_a 为 region', () => {
  const e = world(BUILDING_ROWS(), SPACES_ONE);
  const fp = planFootprints(e, { base: BUILDING_ROWS() });
  assert.equal(fp.footprints.loc_a?.kind, 'region');
  assert.equal(fp.footprints.bld_a?.kind, 'building');
});
