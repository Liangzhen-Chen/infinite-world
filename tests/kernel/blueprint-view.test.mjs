// 格子迁移 G7《建筑蓝图生成》卡内测试之二：蓝图接进格世界（place.mjs / place-building.mjs：gridView 叠层、zoneAt、placeView 的足迹与出口、blueprintOf、landCell）与加载期校验。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 18、23–25、28、31–34 行；纯函数层（planBlueprint 等）见 tests/kernel/blueprint.test.mjs。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、词表条目写进拷贝；材料取真实材料行 mat_granite、mat_soil、mat_air。期望值手算成字面量，推算写在用例里。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { gridView, zoneAt, placeView, blueprintOf, landCell } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok); // 先装配命名 struct、定点常数与 sqrt 表（夹具世界的加载校验要读 anchor）
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' }, cellclass_water: { ...ANY, waterAny: ['water_test_fresh'], slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
// 地表材料 mat_soil、地表以下一层土再岩；空气取真实材料行 mat_air。
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
// 形制条目是测试前提：walled 真、一层、屋面、墙厚缺省 0.4（w = 1）；rooms 为空或两间。
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, rooms: [] };
const FORMS = (extra = {}) => ({
  bldform_hut: FORM,
  bldform_tower: { ...FORM, rooms: [] },
  bldform_halls: { ...FORM, rooms: [{ role: 'roomrole_front', share: 0.5, level: 0, open: false }, { role: 'roomrole_back', share: 0.5, level: 0, open: false }] },
  bldform_bridge: { ...FORM, walled: false, roofed: false, deck: true },
  ...extra,
});
const ROLES = { roomrole_front: {}, roomrole_back: {} };

function load({ rows, edges = [], spaces, forms = FORMS(), mutateRules } = {}) {
  const tmp = testTempRoot('blueprint-view-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges, gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = forms;
    v.families.roomrole.entries = ROLES;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const ROOT_ROW = (extra = {}) => row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0, ...extra });
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
// 建筑行：挂 comp_facility，卷十九 §2.1 的必填列照数填（形制、外包宽深、层数、完好度、破口、料）。
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, ...extra,
});
const room = (parent, role) => row(parent, { classes: ['comp_zone'], roomRole: role });
// 2 × 3 区格，所有控制点海拔 0（地表高处处 0 m，地表层 0）：loc_a 占区格 (0,1)（细格 x 0..99、y 100..199）、loc_b 占 (1,1)，其余归层根。
const WORLD = (extra = {}) => ({
  rows: {
    loc_root: ROOT_ROW(),
    loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }),
    loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }),
    ...extra,
  },
  spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 3 }, root: 'loc_root' }],
});
const S = {};
// 劣化规则表 wear（卷十九 §2.5）世界里还没有数值，用例自带夹具值（测试前提）；noWear 为真时不带，用来核"表缺失按未知往下传"。
const WEAR = { breachShare: 0.5, roofCurve: [[0, 0], [1, 1]], wallOrderCode: 'k_wall', roofOrderCode: 'k_roof' };
function world(spec, over = {}) {
  const { noWear = false, ...loadOver } = over;
  const r = load({ ...spec, ...loadOver });
  assert.equal(r.ok, true, r.text);
  const rules = noWear ? r.rules : { ...r.rules, facility: { ...r.rules.facility, wear: WEAR } };
  return { tables: r.tables, vocab: r.vocab, rules, units: r.env.units, template: { seed: 'seed_test' } };
}
const codesOf = (r) => r.errors.map((e) => e.code);
const at = (e, x, y, z) => gridView(e, S, { w: 0, cells: { x0: x, y0: y, z0: z, x1: x, y1: y, z1: z } }).cells[0];

// 6×6 的一栋小屋：锚点 (20, 120, z=0)（z 是地表层号，勘误 1121k14），facing 0：局部 (u, v) → 世界 (20 + u, 120 − v)，层 ℓ=0 在 z = 0 + 1 + 0 = 1（地表层 0 是地面，室内在其上）。
const HUT = () => world(WORLD({ bld_a: building('loc_a', [20, 120, 0]) }));

test('叠层：外墙读墙料（固态）、室内读空气、顶面是屋面元的料；正门洞读空气；蓝图覆盖基底、叠在模板格块之后', () => {
  const e = HUT();
  // 局部 (0,0) 是外墙角：世界 (20,120)、层 1：材料 mat_granite（唯一的料，派给每个体元）、固态；所属地点是建筑行。
  const wall = at(e, 20, 120, 1);
  assert.equal(wall.known, true);
  assert.equal(wall.material, 'mat_granite');
  assert.equal(wall.state, 'solid');
  assert.equal(wall.zone, 'bld_a');
  assert.equal(wall.kind, null);
  // 局部 (2,2)：室内。世界 (22, 118, 1)：读空气行 mat_air（气态）；顶面是屋面元的料 mat_granite。
  const inner = at(e, 22, 118, 1);
  assert.equal(inner.material, 'mat_air');
  assert.equal(inner.state, 'gas');
  assert.equal(inner.ceiling, 'mat_granite');
  assert.equal(inner.zone, 'bld_a');
  // 正门：局部 (3, 0)（u = floor(6÷2) = 3，沿墙厚 w=1 格）→ 世界 (23, 120, 1)：开口读空气、没有顶面。
  const door = at(e, 23, 120, 1);
  assert.equal(door.material, 'mat_air');
  assert.equal(door.ceiling, null);
  // 建筑外的格不受影响：(30, 120, 1) 是空气、没有顶面、所属地点是区域足迹行；地表层 (20,120,0) 仍是地表材料 mat_soil（蓝图只占 z=1 一层）。
  assert.equal(at(e, 30, 120, 1).material, 'mat_air');
  assert.equal(at(e, 30, 120, 1).zone, 'loc_a');
  assert.equal(at(e, 20, 120, 0).material, 'mat_soil');
});

test('标志：屋面遮天、室内可立足（脚下是地表）、墙格不可立足；顶面托住上一层', () => {
  const e = HUT();
  // 室内格 (22,118,1)：头顶有屋面（顶面的料 mat_granite 遮天）→ blocksSky 真；本格气态且下一格地表 mat_soil 能承托 → 可立足。
  const inner = at(e, 22, 118, 1);
  assert.equal(inner.blocksSky, true);
  assert.equal(inner.standable, true);
  // 屋顶之上的格 (22,118,2)：不再被遮；下一格有顶面（屋面料 mat_granite 能承托）→ 可立足（站在屋顶上）。
  const roof = at(e, 22, 118, 2);
  assert.equal(roof.blocksSky, false);
  assert.equal(roof.standable, true);
  // 墙格本身固态，不可立足；它的承托标志是材料的能承托（花岗岩为真）。
  const wall = at(e, 20, 120, 1);
  assert.equal(wall.standable, false);
  assert.equal(wall.bearsLoad, true);
  // 没有建筑的地方对照：露天空气格 (30,120,1) 不被遮天。
  assert.equal(at(e, 30, 120, 1).blocksSky, false);
});

test('楼梯格：格种类是"楼梯"、读作空气（不是实心料）、本格可立足；楼梯正上方一格不被楼板遮', () => {
  const e = world(WORLD({ bld_a: building('loc_a', [20, 120, 0], { storeys: 2 }) }));
  // 两层：楼梯在层 0 的局部 (w, D−w−1) = (1, 4) → 世界 (21, 116, 1)。
  const stairs = at(e, 21, 116, 1);
  assert.equal(stairs.kind, 'stairs');
  assert.equal(stairs.material, 'mat_air');
  assert.equal(stairs.state, 'gas');
  assert.equal(stairs.standable, true);
  assert.equal(stairs.ceiling, null); // 楼梯井：没有顶面
  // 同一格上层（层 1，z=2）：普通室内，有屋面顶面。
  assert.equal(at(e, 21, 116, 2).kind, null);
  assert.equal(at(e, 21, 116, 2).ceiling, 'mat_granite');
  // 层 0 的其他室内格 (22,118,1)：楼板顶面（15 格 floor 之一），料同为 mat_granite。
  assert.equal(at(e, 22, 118, 1).ceiling, 'mat_granite');
});

test('桥面层：deck 形制最低层下一层的格保留基底（地表材料）、只加顶面；其上一层可立足', () => {
  // 桥：walled 假、deck 真、不 roofed。锚点 z=0（地表层号）：层 −1 在 z = 0 + 1 + 0 − 1 = 0（地表层），层 0 在 z = 1。
  const e = world(WORLD({ bld_br: building('loc_a', [20, 120, 0], { form: 'bldform_bridge', planCells: { widthCells: 5, depthCells: 3 } }) }));
  const deck = at(e, 22, 119, 0);
  assert.equal(deck.material, 'mat_soil'); // 格本身保留基底
  assert.equal(deck.ceiling, 'mat_granite'); // 顶面是桥面元的料
  assert.equal(deck.kind, null);
  const above = at(e, 22, 119, 1);
  assert.equal(above.material, 'mat_air');
  assert.equal(above.ceiling, null); // 不 roofed
  assert.equal(above.standable, true);
});

test('zoneAt：建筑格返回建筑行，房间格返回房间行，内门格返回建筑行；建筑外是区域足迹行', () => {
  // 6×7 两间房（share 0.5/0.5，w=1）：房间 0 行 v = 1..2、隔墙行 v = 3（内门 u = 3）、房间 1 行 v = 4..5。锚点 (20, 120)：局部 (u, v) → 世界 (20+u, 120−v)。
  const e = world(WORLD({
    bld_a: building('loc_a', [20, 120, 0], { form: 'bldform_halls', planCells: { widthCells: 6, depthCells: 7 } }),
    loc_room_f: room('bld_a', 'roomrole_front'),
    loc_room_b: room('bld_a', 'roomrole_back'),
  }));
  const pos = (x, y, z) => ({ w: 0, x, y, z, coarse: false });
  assert.equal(zoneAt(e, S, pos(22, 118, 1)), 'loc_room_f'); // (u=2, v=2)
  assert.equal(zoneAt(e, S, pos(22, 115, 1)), 'loc_room_b'); // (u=2, v=5)
  assert.equal(zoneAt(e, S, pos(23, 117, 1)), 'bld_a'); // (u=3, v=3) 内门格不属任何房间
  assert.equal(zoneAt(e, S, pos(21, 117, 1)), 'bld_a'); // (u=1, v=3) 隔墙格
  assert.equal(zoneAt(e, S, pos(20, 120, 1)), 'bld_a'); // 外墙格
  assert.equal(zoneAt(e, S, pos(40, 120, 1)), 'loc_a'); // 建筑外
  assert.equal(zoneAt(e, S, pos(22, 118, 5)), 'loc_a'); // 建筑上空（蓝图只占 z=1）
  // 房间格在 gridView 里的所属地点同一口径。
  assert.equal(at(e, 22, 118, 1).zone, 'loc_room_f');
  assert.equal(at(e, 23, 117, 1).zone, 'bld_a');
});

test('足迹派生几何：areaM2 = 最低一层细格数 × cellM²、zRange、elevationM = zMin × storeyM、centroid；房间足迹是它那个房间的格', () => {
  const e = world(WORLD({
    bld_a: building('loc_a', [20, 120, 0], { form: 'bldform_halls', planCells: { widthCells: 6, depthCells: 7 } }),
    loc_room_f: room('bld_a', 'roomrole_front'),
    loc_room_b: room('bld_a', 'roomrole_back'),
  }));
  const b = placeView(e, S, 'bld_a').footprint;
  // 6×7 = 42 格，一层：areaM2 = 42；zRange z=1；elevationM = 1 × 3 = 3；
  // 细格 x 20..25、y 114..120；中心 = x + 0.5：x 中心 20.5..25.5 平均 23，y 中心 114.5..120.5 平均 117.5。
  assert.equal(b.kind, 'building');
  assert.equal(b.areaM2, 42);
  assert.deepEqual(b.zRange, { zMin: 1, zMax: 1 });
  assert.equal(b.elevationM, 3);
  assert.deepEqual(b.centroid, { x: 23, y: 117.5 });
  assert.equal(b.cellCount, 42);
  // 房间 0：4 列 × 2 行 = 8 格；房间 1 同样 8 格。areaM2 = 8。
  const f = placeView(e, S, 'loc_room_f').footprint;
  assert.equal(f.areaM2, 8);
  assert.equal(f.cellCount, 8);
  assert.equal(f.kind, 'room');
  assert.equal(placeView(e, S, 'loc_room_b').footprint.areaM2, 8);
  // 房间行上没有任何几何存储列：换形制后足迹变、行不改（卷五 §4.1 规则 11）——表头里房间行只带 roomRole。
  assert.equal(Object.hasOwn(HEADER.dimensions, 'roomRole'), true);
  assert.equal(HEADER.dimensions.roomRole.required, 'never');
});

test('placeView 的出口：建筑与房间的"门"由蓝图门格派生，不建路网边；内门是房间的出口、不是建筑的', () => {
  const e = world(WORLD({
    bld_a: building('loc_a', [20, 120, 0], { form: 'bldform_halls', planCells: { widthCells: 6, depthCells: 7 } }),
    loc_room_f: room('bld_a', 'roomrole_front'),
    loc_room_b: room('bld_a', 'roomrole_back'),
  }));
  const doors = (id) => placeView(e, S, id).exits.filter((x) => x.kind === 'door');
  // 建筑：正门一处（局部 (3, 0) → 世界 (23, 120, 1)）；内门不是建筑与外面之间的出入。
  const b = doors('bld_a');
  assert.equal(b.length, 1);
  assert.deepEqual({ x: b[0].cell.x, y: b[0].cell.y, z: b[0].cell.z }, { x: 23, y: 120, z: 1 });
  assert.equal(b[0].via, null);
  // 前房间（行 1..2）：与它四邻相接的开口 = 正门（局部 (3,0) 紧邻 (3,1)）与内门（局部 (3,3) 紧邻 (3,2)），共 2 项，按格坐标 (x, y, z) 排：内门 y=117 在正门 y=120 之前。
  const f = doors('loc_room_f');
  assert.deepEqual(f.map((x) => [x.cell.x, x.cell.y]), [[23, 117], [23, 120]]);
  // 后房间（行 4..5）：只有内门 (3,3) 与它相邻。
  assert.deepEqual(doors('loc_room_b').map((x) => [x.cell.x, x.cell.y]), [[23, 117]]);
  // 区域足迹行没有门类出口（只有路与开阔）。
  assert.equal(placeView(e, S, 'loc_a').exits.some((x) => x.kind === 'door'), false);
});

test('blueprintOf：每格带世界坐标与此刻的材料、顶面、是否开口；不是建筑行为 null；设计面积数与手算例同', () => {
  const e = HUT();
  const bp = blueprintOf(e, S, 'bld_a');
  // 6×6 一层：36 格；外墙 20 格（正门 1 格开口、无窗），所以 wall 材料格 19、开口格 1、室内 16 格。
  assert.equal(bp.cells.length, 36);
  assert.equal(bp.cells.filter((c) => c.material === 'mat_granite').length, 19);
  assert.equal(bp.cells.filter((c) => c.open).length, 1);
  assert.equal(bp.cells.filter((c) => c.ceiling === 'mat_granite').length, 16);
  assert.equal(bp.cells.every((c) => c.zone === 'bld_a' && c.fixture === null), true);
  // 世界坐标：局部 (0,0) → (20,120)、z=1。
  const c00 = bp.cells.find((c) => c.u === 0 && c.v === 0);
  assert.deepEqual({ x: c00.x, y: c00.y, z: c00.z }, { x: 20, y: 120, z: 1 });
  // 外壳：朝外 24 面 × 3 + 屋面 16 = 88；开口 1 处（门）= 3；openingAreas 里没有磨损、没装扇、没拆开：leafClosed 0、break 0。
  assert.equal(bp.areas.envelopeM2, 88);
  assert.equal(bp.openingAreas.shellM2, 88);
  assert.equal(bp.openingAreas.designOpenM2, 3);
  assert.equal(bp.openingAreas.leafClosedM2, 0);
  assert.equal(bp.openingAreas.breakM2, 0);
  // 夹具世界带了 wear 表：磨损已派生（condition 1：K_w = 0、K_r = 0）。
  assert.equal(bp.wearDerived, true);
  assert.equal(blueprintOf(e, S, 'loc_a'), null);
});

test('breaks：行上拆开的元读作开口（外墙读空气、屋面顶面读无）；改行不改蓝图设计值', () => {
  // 拆开局部 (1, 0) 的外墙元和 (2, 2) 的屋面元（层 0）。
  const breaks = [{ u: 1, v: 0, level: 0, remainL: 1200 }, { u: 2, v: 2, level: 0, remainL: 400 }];
  const e = world(WORLD({ bld_a: building('loc_a', [20, 120, 0], { breaks }) }));
  assert.equal(at(e, 21, 120, 1).material, 'mat_air'); // (1,0) 墙元被拆
  assert.equal(at(e, 22, 118, 1).ceiling, null); // (2,2) 屋面元被拆
  assert.equal(at(e, 23, 118, 1).ceiling, 'mat_granite'); // 旁边没拆的
  const bp = blueprintOf(e, S, 'bld_a');
  // 面积：拆开的外墙处 1 面 × 3 = 3，屋面元 1 × 1 = 1 → breakM2 = 4；设计值不变（外壳 88、设计开口 3）。
  assert.equal(bp.openingAreas.breakM2, 4);
  assert.equal(bp.openingAreas.shellM2, 88);
  assert.equal(bp.openingAreas.designOpenM2, 3);
  // 门也出现在出口里，拆开的墙元也出现（破洞格）。
  const kinds = placeView(e, S, 'bld_a').exits.filter((x) => x.kind === 'door').map((x) => [x.cell.x, x.cell.y]);
  assert.deepEqual(kinds, [[21, 120], [23, 120]]);
});

test('landCell：建筑、房间 coarse 落格在它自己的室内格里，同 seedKey 同结果，且 zoneAt 回到该地点；coarse 假仍不落', () => {
  const e = world(WORLD({
    bld_a: building('loc_a', [20, 120, 0], { form: 'bldform_halls', planCells: { widthCells: 6, depthCells: 7 } }),
    loc_room_f: room('bld_a', 'roomrole_front'),
    loc_room_b: room('bld_a', 'roomrole_back'),
  }));
  const a = landCell(e, S, { place: 'loc_room_f', kind: 'any', seedKey: 'k1', coarse: true });
  const b = landCell(e, S, { place: 'loc_room_f', kind: 'any', seedKey: 'k1', coarse: true });
  assert.deepEqual(a, b);
  assert.equal(a.coarse, true);
  assert.equal(zoneAt(e, S, a), 'loc_room_f');
  assert.equal(a.z, 1);
  assert.equal(zoneAt(e, S, landCell(e, S, { place: 'loc_room_b', kind: 'any', seedKey: 'k1', coarse: true })), 'loc_room_b');
  // 建筑的候选格是 zoneAt 恰为建筑行的格（墙、隔墙、门、窗、内门），不含房间格：落点 zoneAt 恰为 'bld_a'（卷五 §4.1 规则 14 :501），对多个 seedKey 都成立。
  for (const k of ['k0', 'k1', 'k2', 'k3', 'k4', 'k5', 'k6', 'k7']) {
    const p = landCell(e, S, { place: 'bld_a', kind: 'any', seedKey: k, coarse: true });
    assert.equal(zoneAt(e, S, p), 'bld_a', k);
  }
  assert.throws(() => landCell(e, S, { place: 'bld_a', kind: 'any', seedKey: 'k1', coarse: false }), (x) => x && x.code === 'E-DET-DOMAIN');
});

test('landCell：格序号含层——两层建筑（无房间行）的落点不总落在最低层；每个落点 zoneAt 恰为建筑行', () => {
  const e = world(WORLD({ bld_a: building('loc_a', [20, 120, 0], { storeys: 2 }) }));
  const seen = new Set();
  for (let i = 0; i < 16; i += 1) {
    const p = landCell(e, S, { place: 'bld_a', kind: 'any', seedKey: `seed${i}`, coarse: true });
    assert.equal(zoneAt(e, S, p), 'bld_a');
    seen.add(p.z);
  }
  // 两层在 z = 1、2：16 个 seedKey 里两层都出现（键含 z；若键不含层，同列恒落最低层，只会看到 z = 1）。
  assert.deepEqual([...seen].sort(), [1, 2]);
});

test('breaks 一元拆开即整处开：墙厚 2.5 m（w=3）拆正面一处最外一格，该处 3 格在 gridView 都是空气、breakM2 = 3、出口里出现这一处破洞', () => {
  // 8×8、w = 3、锚点 (20,120,0)：正面墙段 u = 3 的处是局部 (3,0..2) → 世界 (23, 120/119/118, 1)；u = 4 是正门；u = 5 的处完好。
  const e = world(WORLD({ bld_a: building('loc_a', [20, 120, 0], { form: 'bldform_hut', planCells: { widthCells: 8, depthCells: 8 }, wallThicknessM: 2.5, breaks: [{ u: 3, v: 0, level: 0, remainL: 3000 }] }) }));
  for (const y of [120, 119, 118]) assert.equal(at(e, 23, y, 1).material, 'mat_air', `y=${y}`);
  assert.equal(at(e, 25, 120, 1).material, 'mat_granite'); // u = 5 的处没拆
  assert.equal(blueprintOf(e, S, 'bld_a').openingAreas.breakM2, 3);
  // 出口：正门（局部 (4, 0) → (24, 120)）与破洞（该处首格 (23, 120)），按格坐标排。
  const doors = placeView(e, S, 'bld_a').exits.filter((x) => x.kind === 'door').map((x) => [x.cell.x, x.cell.y]);
  assert.deepEqual(doors, [[23, 120], [24, 120]]);
});

test('劣化表缺失：依赖它的格与面积项报未知（known 为假、null），不报完好；condition 为 1 时墙格已知、屋面仍未知', () => {
  const half = world(WORLD({ bld_a: building('loc_a', [20, 120, 0], { condition: 0.5 }) }), { noWear: true });
  // 候选墙处 (1,0)（非墙角非开口）：世界 (21,120,1)，condition 0.5 时可否破口取决于表，未知。
  assert.equal(at(half, 21, 120, 1).known, false);
  assert.equal(at(half, 21, 120, 1).material, null);
  assert.equal(at(half, 21, 120, 1).zone, 'bld_a');
  // 墙角 (0,0) 与正门 (3,0) 不是候选：已知。
  assert.equal(at(half, 20, 120, 1).material, 'mat_granite');
  assert.equal(at(half, 23, 120, 1).known, true);
  // 屋面元（候选）：室内格 (22,118,1) 的顶面依赖屋面曲线，未知；屋顶上一格 (22,118,2) 的可立足随之未知，遮天不再有顶面格在上，为假。
  assert.equal(at(half, 22, 118, 1).known, false);
  assert.equal(at(half, 22, 118, 2).standable, null);
  const bp = blueprintOf(half, S, 'bld_a');
  assert.equal(bp.wearDerived, false);
  assert.equal(bp.openingAreas.wearBreachM2, null);
  assert.equal(bp.openingAreas.roofGapM2, null);
  assert.equal(bp.cells.find((c) => c.u === 1 && c.v === 0).open, null);
  // condition 1：墙项恒 0，墙格已知；屋面项仍未知。
  const full = world(WORLD({ bld_a: building('loc_a', [20, 120, 0]) }), { noWear: true });
  assert.equal(at(full, 21, 120, 1).material, 'mat_granite');
  assert.equal(at(full, 22, 118, 1).known, false);
  assert.equal(blueprintOf(full, S, 'bld_a').openingAreas.wearBreachM2, 0);
  assert.equal(blueprintOf(full, S, 'bld_a').openingAreas.roofGapM2, null);
});

// ---------- 加载期校验（卷五 §4.1 规则 11；卷十九 §2.4） ----------

test('加载校验：锚点在父足迹外、兄弟足迹相交、蓝图不可行、形制条目越域各自拒收；不相交的兄弟与父内的锚点放行', () => {
  const ok = (extra) => load({ ...WORLD(extra) });
  // 放行：两栋相距足够的小屋（6 格宽，锚点 x 20 与 60）。
  assert.equal(ok({ bld_1: building('loc_a', [20, 120, 0]), bld_2: building('loc_a', [60, 120, 0]) }).ok, true);
  // 锚点在父足迹外：父是 loc_a，锚点 (150, 150) 落在 loc_b 的区格。
  assert.ok(codesOf(ok({ bld_x: building('loc_a', [150, 150, 0]) })).includes('E-GRID-FOOTPRINT-OUTSIDE-PARENT'));
  // 兄弟足迹相交：b2 锚点 (23, 118, 1) 与 b1（x 20..25、y 115..120）重叠格。
  assert.ok(codesOf(ok({ bld_1: building('loc_a', [20, 120, 0]), bld_2: building('loc_a', [23, 118, 0]) })).includes('E-GRID-SIBLING-OVERLAP'));
  // 同一位置但层号不同（b2 在 z=5）：三维不相交，放行。
  assert.equal(ok({ bld_1: building('loc_a', [20, 120, 0]), bld_2: building('loc_a', [20, 120, 5]) }).ok, true);
  // 蓝图不可行：两间房要 R = d − 1 ≥ 2，深 4（d = 2）不够。
  assert.ok(codesOf(ok({ bld_h: building('loc_a', [20, 120, 0], { form: 'bldform_halls', planCells: { widthCells: 6, depthCells: 4 } }) })).includes('E-DIM-DOMAIN-RANGE'));
  // planCells 越域（0、4097）由维度登记的取值域拒收。
  for (const bad of [0, 4097]) assert.ok(codesOf(ok({ bld_z: building('loc_a', [20, 120, 0], { planCells: { widthCells: bad, depthCells: 6 } }) })).includes('E-DIM-DOMAIN-RANGE'), `planCells ${bad}`);
  // 形制条目越域：aspect 9 → 加载拒收（登记表上限 8）。
  const wrong = load({ ...WORLD({ bld_1: building('loc_a', [20, 120, 0]) }), forms: FORMS({ bldform_hut: { ...FORM, aspect: 9 } }) });
  assert.ok(codesOf(wrong).includes('E-DIM-DOMAIN-RANGE'));
  // 只加数据：新增一条形制条目并让建筑行引用它，不改代码即被用（形制代号在词表里，不在代码里）。
  const extra = load({ ...WORLD({ bld_1: building('loc_a', [20, 120, 0], { form: 'bldform_new', planCells: { widthCells: 9, depthCells: 5 } }) }), forms: FORMS({ bldform_new: { ...FORM, windowEvery: 2 } }) });
  assert.equal(extra.ok, true, extra.text);
});
