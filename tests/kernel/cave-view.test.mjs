// 格子迁移 G8《洞穴与地下体积》卡内测试之二：体积足迹接进格世界（place.mjs / place-volume.mjs：gridView 体积凿空叠层、zoneAt、placeView 的派生量与洞口出口、landCell、加载期与种子已知后的校验）。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 37、38、41–45 行（#43 叠层与顶面、#44 嵌套与区域子行、#45 派生量与出口）；纯函数层（caveCellsOf、volumeDerived）见 tests/kernel/cave.test.mjs。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、词表条目写进拷贝；材料取真实材料行 mat_granite、mat_soil、mat_air。
// 地表：区格行 anchorElevationM 30 m、terrain_river（reliefM 0，处处平）→ 地表高 30 m、地表层 floor(30 ÷ 3) = 10；地表层 mat_soil、其下一层土（z 9）、再往下 mat_granite（模板 TEMPLATE）。
// 洞：顶面 15 m → t = 5；两层（层 4、5）；目标 4 m² → 4 列。哈希次序决定先长哪一列，断言只写与次序无关的性质（集合大小、连通、材料、层段、归属）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { gridView, zoneAt, placeView, landCell, checkVolumeCells, volumesUnderRegionRows } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok); // 先装配命名 struct、定点常数与 sqrt 表
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' }, cellclass_water: { ...ANY, waterAny: ['water_test_fresh'], slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };

// 形制条目是测试前提（同 blueprint-view.test.mjs）：walled 真、一层、屋面、墙厚缺省 0.4。
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, defaultMaterials: { wall: 'mat_soil', frame: 'mat_elm', roof: 'mat_straw' }, rooms: [] };

function load({ rows, spaces } = {}) {
  const tmp = testTempRoot('cave-view-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false, flowing: false } }; // 保留真实条目：规则表 worldgen 的 waterRows 引用 water_river
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = { bldform_hut: { ...FORM, facilityTypes: ['fac_house'] }, bldform_shrine: v.families.bform.entries.bldform_shrine }; // 只为"体积挂在建筑行之下"那个反例有一栋合法的建筑行
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const ROOT_ROW = row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0 });
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 30, ...extra });
// 体积行：挂 comp_volume，卷五 §2.1 体积足迹必填列照数填（顶面海拔、层数、目标面积、洞口、地形）。
const volume = (parent, extra = {}) => row(parent, { classes: ['comp_volume'], terrain: 'terrain_cave', anchorElevationM: 15, spanZ: 2, targetAreaM2: 4, mouth: true, ...extra });
// 2 × 3 区格：loc_a 占区格 (0,1)（细格 x 0..99、y 100..199，中心列 (50, 150)），loc_b 占 (1,1)，其余归层根；全部控制点海拔 30 m。
const WORLD = (extra = {}) => ({
  rows: { loc_root: ROOT_ROW, loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }), loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }), ...extra },
  spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 3 }, root: 'loc_root' }],
});
const S = {};
function world(spec, over = {}) {
  const r = load({ ...spec, ...over });
  assert.equal(r.ok, true, r.text);
  return { tables: r.tables, vocab: r.vocab, rules: r.rules, units: r.env.units, template: { seed: 'seed_test' } };
}
const codesOf = (r) => r.errors.map((e) => e.code);
const box = (e, x0, y0, z0, x1, y1, z1) => new Map(gridView(e, S, { w: 0, cells: { x0, y0, z0, x1, y1, z1 } }).cells.map((c) => [`${c.x},${c.y},${c.z}`, c]));
const at = (e, x, y, z) => box(e, x, y, z, x, y, z).get(`${x},${y},${z}`);
const posOf = (x, y, z) => ({ w: 0, x, y, z, coarse: false });

// 洞所在的检视盒：起点是区格 (0,1) 的中心列 (50, 150)，4 列四邻相连，列都在 x 46..54、y 146..154 内；z 从 3（洞底以下一层）到 11（地表之上一层）。
const BOX = [44, 144, 3, 56, 156, 11];
function caveColumns(cells) {
  const out = [];
  for (let x = BOX[0]; x <= BOX[3]; x += 1) for (let y = BOX[1]; y <= BOX[4]; y += 1) {
    const c = cells.get(`${x},${y},5`);
    if (c.material === 'mat_air') out.push({ x, y });
  }
  return out;
}
// 从洞底一格出发，只走气态格（空气、梯格），能否走到地表之上（z 11）：对照表 #41"地下与外界相通当且仅当有一串可通行格连到地表"。
function reachesSurface(cells, from) {
  const seen = new Set([`${from.x},${from.y},${from.z}`]);
  const stack = [from];
  while (stack.length) {
    const c = stack.pop();
    if (c.z >= 11) return true;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const k = `${c.x + dx},${c.y + dy},${c.z + dz}`;
      const n = cells.get(k);
      if (n && !seen.has(k) && n.state === 'gas') { seen.add(k); stack.push({ x: c.x + dx, y: c.y + dy, z: c.z + dz }); }
    }
  }
  return false;
}

test('#43 叠层：洞的格读空气（气态）、四周仍是岩土；顶面比地表低；洞外的格不受影响；格内容在体积层段、不在体积层段分得清', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  const cells = box(e, ...BOX);
  const cols = caveColumns(cells);
  // 4 列（目标 4 m² ÷ cellM² 1）、含起点 (50, 150)、四邻连通。
  assert.equal(cols.length, 4);
  assert.ok(cols.some((c) => c.x === 50 && c.y === 150));
  const set = new Set(cols.map((c) => `${c.x},${c.y}`));
  const reach = new Set(['50,150']);
  const stack = [{ x: 50, y: 150 }];
  while (stack.length) {
    const c = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${c.x + dx},${c.y + dy}`;
      if (set.has(k) && !reach.has(k)) { reach.add(k); stack.push({ x: c.x + dx, y: c.y + dy }); }
    }
  }
  assert.equal(reach.size, 4);
  for (const c of cols) {
    // 层 4、5 是体积足迹的格：空气、气态、所属地点是体积行；层 3 仍是花岗岩（地表层 10 以下第二层起是岩）。
    for (const z of [4, 5]) {
      const cell = cells.get(`${c.x},${c.y},${z}`);
      assert.equal(cell.material, 'mat_air');
      assert.equal(cell.state, 'gas');
      assert.equal(cell.zone, 'loc_va');
    }
    assert.equal(cells.get(`${c.x},${c.y},3`).material, 'mat_granite');
  }
  // 顶面（层 5）至少比地表（层 10）低一层：封闭的洞里每列层 6 起到地表层 10 都是岩土、不是空气（有口洞的洞口列见下一条）。
  const sealed = box(world(WORLD({ loc_va: volume('loc_a', { mouth: false }) })), ...BOX);
  for (const c of cols) for (let z = 6; z <= 10; z += 1) assert.notEqual(sealed.get(`${c.x},${c.y},${z}`).material, 'mat_air', `${c.x},${c.y},${z}`);
  // 洞外的列（46, 150）：4 列从 (50, 150) 四邻相连，最远离起点 3 格（x ≥ 47），所以它在洞外：层 4、5 仍是花岗岩、归属区域行 loc_a。
  assert.equal(cells.get('46,150,5').material, 'mat_granite');
  assert.equal(cells.get('46,150,5').zone, 'loc_a');
  assert.equal(cells.get('46,150,10').material, 'mat_soil'); // 地表层
  // 洞底可立足（脚下 z 3 是花岗岩，承托）；头顶有岩土遮天。
  const floor = cells.get(`${cols[0].x},${cols[0].y},4`);
  assert.equal(floor.standable, true);
  assert.equal(floor.blocksSky, true);
});

test('#41 洞口：mouth 真时恰一列从洞顶之上凿到地表层（梯、可立足、不属体积、属区域足迹），洞底经气态格走得到地表；封闭的洞走不到', () => {
  const open = world(WORLD({ loc_va: volume('loc_a') }));
  const cells = box(open, ...BOX);
  const cols = caveColumns(cells);
  // 洞口列：层 6 到 10（t + 1 到地表层）都是空气且格种类是梯，恰一列。
  const shafts = cols.filter((c) => cells.get(`${c.x},${c.y},6`).material === 'mat_air');
  assert.equal(shafts.length, 1);
  const m = shafts[0];
  for (const z of [6, 7, 8, 9, 10]) {
    const cell = cells.get(`${m.x},${m.y},${z}`);
    assert.equal(cell.material, 'mat_air', `z ${z}`);
    assert.equal(cell.kind, 'ladder');
    assert.equal(cell.standable, true);
    assert.equal(cell.zone, 'loc_a'); // 通路格不属体积足迹，属所在区域足迹
  }
  assert.equal(cells.get(`${m.x},${m.y},4`).kind, null); // 体积足迹的格不是梯
  assert.equal(cells.get(`${m.x},${m.y},11`).kind, null);
  // 其余三列层 6 起仍是岩土。
  for (const c of cols.filter((x) => x !== m)) assert.notEqual(cells.get(`${c.x},${c.y},6`).material, 'mat_air');
  assert.equal(reachesSurface(cells, { x: m.x, y: m.y, z: 4 }), true);
  assert.equal(reachesSurface(cells, { x: cols[0].x, y: cols[0].y, z: 4 }), true); // 洞里任一格都通
  // 洞口通路格出现在 exits：开阔边界一项，格是通路最上一格（地表层 10）。
  const exits = placeView(open, S, 'loc_va').exits;
  assert.equal(exits.length, 1);
  assert.equal(exits[0].kind, 'open');
  assert.deepEqual({ x: exits[0].cell.x, y: exits[0].cell.y, z: exits[0].cell.z }, { x: m.x, y: m.y, z: 10 });
  // 封闭的洞：同样的体积足迹（mouth 假不改 H），没有通路格，洞底走不到地表，exits 为空。
  const closed = world(WORLD({ loc_va: volume('loc_a', { mouth: false }) }));
  const cc = box(closed, ...BOX);
  const ccols = caveColumns(cc);
  assert.deepEqual(ccols.map((c) => `${c.x},${c.y}`).sort(), cols.map((c) => `${c.x},${c.y}`).sort());
  assert.equal([...cc.values()].filter((c) => c.kind === 'ladder').length, 0);
  assert.equal(reachesSurface(cc, { x: ccols[0].x, y: ccols[0].y, z: 4 }), false);
  assert.equal(placeView(closed, S, 'loc_va').exits.length, 0);
});

test('zoneAt：体积格的最深足迹是体积行；洞口通路格、体积层段之外、洞外都归所在区域足迹', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  const cells = box(e, ...BOX);
  const cols = caveColumns(cells);
  const m = cols.find((c) => cells.get(`${c.x},${c.y},6`).material === 'mat_air');
  assert.equal(zoneAt(e, S, posOf(cols[0].x, cols[0].y, 4)), 'loc_va');
  assert.equal(zoneAt(e, S, posOf(cols[0].x, cols[0].y, 5)), 'loc_va');
  assert.equal(zoneAt(e, S, posOf(cols[0].x, cols[0].y, 3)), 'loc_a'); // 洞底之下
  assert.equal(zoneAt(e, S, posOf(m.x, m.y, 8)), 'loc_a'); // 洞口通路格
  assert.equal(zoneAt(e, S, posOf(46, 150, 5)), 'loc_a'); // 洞外（离起点 4 格，4 列的洞够不到）
  assert.equal(zoneAt(e, S, posOf(150, 150, 5)), 'loc_b');
});

test('#45 派生量：areaM2、zRange、elevationM、depthM、underground、surfaceRefElevationM；洞穴 enclosed 假', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  const v = placeView(e, S, 'loc_va');
  // 4 列 × cellM² 1 = 4 m²；层 4..5；elevationM = 4 × 3 = 12；地表 30 m；depthM = 30 − (5 + 1) × 3 = 12 > 0 → underground 真。
  assert.equal(v.footprint.kind, 'volume');
  assert.equal(v.footprint.areaM2, 4);
  assert.deepEqual({ ...v.footprint.zRange }, { zMin: 4, zMax: 5 });
  assert.equal(v.footprint.elevationM, 12);
  assert.equal(v.footprint.cellCount, 8);
  assert.equal(v.dims.surfaceRefElevationM.value, 30);
  assert.equal(v.dims.depthM.value, 12);
  assert.equal(v.dims.underground.value, true);
  assert.ok(v.dims.depthM.value >= 0);
  // 区域足迹行不带这三项：仍按未知。
  assert.equal(placeView(e, S, 'loc_a').dims.depthM.known, false);
});

test('#44 三级嵌套体积：逐级 depthM 增大、各自层段不相交、子体积的列落在父体积的列里；顶面不低于父底层的子行拒收', () => {
  // 父 p：顶面 24 m → t 8，两层 7..8，100 列；子 c：15 m → t 5，两层 4..5，4 列；孙 g：6 m → t 2，一层 2，1 列。起点都是区格中心列 (50, 150)，它在每一级的列里。
  const rows = { loc_vp: volume('loc_a', { anchorElevationM: 24, targetAreaM2: 100, mouth: false }), loc_vc: volume('loc_vp', { anchorElevationM: 15, targetAreaM2: 4, mouth: false }), loc_vg: volume('loc_vc', { anchorElevationM: 6, spanZ: 1, targetAreaM2: 1, mouth: false }) };
  const e = world(WORLD(rows));
  const d = (id) => placeView(e, S, id).dims.depthM.value;
  // 地表 30 m：p 30 − (8 + 1) × 3 = 3；c 30 − 6 × 3 = 12；g 30 − 3 × 3 = 21。
  assert.equal(d('loc_vp'), 3);
  assert.equal(d('loc_vc'), 12);
  assert.equal(d('loc_vg'), 21);
  assert.equal(zoneAt(e, S, posOf(50, 150, 8)), 'loc_vp');
  assert.equal(zoneAt(e, S, posOf(50, 150, 5)), 'loc_vc');
  assert.equal(zoneAt(e, S, posOf(50, 150, 2)), 'loc_vg');
  assert.equal(zoneAt(e, S, posOf(50, 150, 3)), 'loc_a'); // g 与 c 之间的岩
  assert.equal(placeView(e, S, 'loc_vp').footprint.areaM2, 100);
  assert.equal(placeView(e, S, 'loc_vc').footprint.areaM2, 4);
  assert.equal(placeView(e, S, 'loc_vg').footprint.areaM2, 1);
  // 子的 4 列在父的 100 列里：层 4..5 的空气格全在父的列里。
  const cells = box(e, 40, 140, 4, 60, 160, 5);
  const inP = new Set([...box(e, 40, 140, 8, 60, 160, 8).values()].filter((c) => c.zone === 'loc_vp').map((c) => `${c.x},${c.y}`));
  for (const c of cells.values()) if (c.zone === 'loc_vc') assert.ok(inP.has(`${c.x},${c.y}`));
  // 子行顶面不低于父底层（t 8 对父底层 7）：加载期拒收（E-GEN-ROW-INVALID，不依赖世界种子）。
  const bad = load(WORLD({ loc_vp: volume('loc_a', { anchorElevationM: 24, targetAreaM2: 100 }), loc_vc: volume('loc_vp', { anchorElevationM: 24, targetAreaM2: 4 }) }));
  assert.ok(codesOf(bad).includes('E-GEN-ROW-INVALID'));
});

test('#44 父行种类与覆盖：父行是建筑（既非区域也非体积）拒收；体积列不压在更深区域足迹的区格上；在已凿空的列上方建区域子行被拒', () => {
  // 父行是区域足迹 loc_a 之下的建筑行：体积挂到它之下，E-GRID-FOOTPRINT-OUTSIDE-PARENT。
  const building = row('loc_a', { classes: ['comp_facility'], anchor: { w: 0, x: 20, y: 120, z: 0, coarse: false }, facing: 0, form: 'bldform_hut', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 } });
  assert.ok(codesOf(load(WORLD({ bld_a: building, loc_vx: volume('bld_a') }))).includes('E-GRID-FOOTPRINT-OUTSIDE-PARENT'));
  // 目标面积超过 rules.gen.under.maxAreaM2（200000）拒收：特殊值不绕过。
  assert.ok(codesOf(load(WORLD({ loc_va: volume('loc_a', { targetAreaM2: 200001 }) }))).includes('E-GEN-ROW-INVALID'));
  // 父足迹被更深的区域足迹占：loc_a 的区格 (0,1) 是中心列所在区格，把区格 (0,1) 整个划给子行 loc_a2（站点），则 loc_a 再没有自己的区格，体积（挂 loc_a）无起点。
  const e = world(WORLD({ loc_a2: region('loc_a', 50, 150, { targetAreaM2: 10000 }), loc_va: volume('loc_a') }));
  assert.equal(checkVolumeCells(e, S).some((m) => m.startsWith('E-GEN-ROW-INVALID place/loc_va')), true);
  assert.equal(placeView(e, S, 'loc_va').footprint, null);
  // 而挂到更深的区域行 loc_a2 之下的体积有起点：区格 (0,1) 归 loc_a2，体积在 loc_a2 的列下凿出。
  const ok = world(WORLD({ loc_a2: region('loc_a', 50, 150, { targetAreaM2: 10000 }), loc_va: volume('loc_a2') }));
  assert.deepEqual(checkVolumeCells(ok, S), []);
  assert.equal(zoneAt(ok, S, posOf(50, 150, 5)), 'loc_va');
});

test('#44 兄弟体积按列不相交：同父两个体积足迹的列没有交集，id 小者先占；运行期在体积列上方新建区域子行由写者按这里的核对读（volumesUnderRegionCells）', () => {
  const e = world(WORLD({ loc_va: volume('loc_a', { targetAreaM2: 30, mouth: false }), loc_vb: volume('loc_a', { targetAreaM2: 30, mouth: false }) }));
  const cells = box(e, 40, 140, 5, 62, 162, 5);
  const a = [...cells.values()].filter((c) => c.zone === 'loc_va').map((c) => `${c.x},${c.y}`);
  const b = [...cells.values()].filter((c) => c.zone === 'loc_vb').map((c) => `${c.x},${c.y}`);
  assert.equal(a.length, 30); // 起点（区格中心列）归 id 小者 loc_va，loc_vb 的起点列被占，loc_vb 的区格里没有可凿起点
  assert.equal(b.length, 0);
  assert.equal(checkVolumeCells(e, S).some((m) => m.includes('place/loc_vb')), true);
});

test('#44 在已凿空的体积列上方新建区域足迹子行要被拒：volumesUnderRegionRows 给出压到的体积行', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  // 洞在区格 (0,1) 里：新子行要占区格 (0,1) 就压到 loc_va，占区格 (1,1)（loc_b 的）不压。
  assert.deepEqual(volumesUnderRegionRows(e, S, { w: 0, regionCells: [{ x: 0, y: 1 }] }), ['loc_va']);
  assert.deepEqual(volumesUnderRegionRows(e, S, { w: 0, regionCells: [{ x: 1, y: 1 }] }), []);
  assert.deepEqual(volumesUnderRegionRows(e, S, { w: 0, regionCells: [] }), []);
});

test('#37 缓存与输入版本：偏离行改 anchorElevationM（输入版本变）结果跟着变；与输入无关的状态变动不改结果', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  const before = box(e, ...BOX);
  // 无关状态（时钟、别的偏离行）变动：结果逐格相同。
  const other = { clock: { minute: 12345 }, created: { loc_zzz: { props: { basis: 'x' } } } };
  const cellsOther = new Map(gridView(e, other, { w: 0, cells: { x0: BOX[0], y0: BOX[1], z0: BOX[2], x1: BOX[3], y1: BOX[4], z1: BOX[5] } }).cells.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  for (const [k, c] of before) assert.deepEqual(cellsOther.get(k), c, k);
  // 偏离行把顶面海拔从 15 m 改成 21 m（t = 7，层 6..7）：输入版本变，缓存失效，洞的层段变。
  const moved = { created: { loc_va: { props: { anchorElevationM: 21 } } } };
  const cells2 = new Map(gridView(e, moved, { w: 0, cells: { x0: BOX[0], y0: BOX[1], z0: BOX[2], x1: BOX[3], y1: BOX[4], z1: BOX[5] } }).cells.map((c) => [`${c.x},${c.y},${c.z}`, c]));
  assert.equal(cells2.get('50,150,7').material, 'mat_air');
  assert.equal(cells2.get('50,150,6').material, 'mat_air');
  assert.equal(cells2.get('50,150,5').material, 'mat_granite');
  assert.equal(before.get('50,150,5').material, 'mat_air');
  assert.equal(zoneAt(e, moved, posOf(50, 150, 7)), 'loc_va');
  assert.equal(zoneAt(e, S, posOf(50, 150, 7)), 'loc_a');
});

test('落格：landCell 在 zoneAt 恰为体积行的格里按 hash(seedKey, 格序号) 取最小者；同 seedKey 同结果；封闭的洞也有落点', () => {
  const e = world(WORLD({ loc_va: volume('loc_a', { mouth: false }) }));
  const p = landCell(e, S, { place: 'loc_va', kind: 'x', seedKey: 'k1', coarse: true });
  assert.deepEqual(p, landCell(e, S, { place: 'loc_va', kind: 'x', seedKey: 'k1', coarse: true }));
  assert.equal(p.coarse, true);
  assert.ok(p.z === 4 || p.z === 5);
  assert.equal(zoneAt(e, S, p), 'loc_va');
});

test('世界种子没绑定时体积读作未知：足迹为 null、checkVolumeCells 不报错，不借别的值', () => {
  const e = world(WORLD({ loc_va: volume('loc_a') }));
  const noSeed = { ...e, template: { seed: undefined } };
  assert.equal(placeView(noSeed, S, 'loc_va').footprint, null);
  assert.deepEqual(checkVolumeCells(noSeed, S), []);
  // 不知道有没有洞不是"没有洞"（卷二 :387、:389）：该体积父区格的地下格 zoneAt 为 null（未知）、gridView 整列 known 为假、exits 为 null；洞外区格（loc_b）不受影响。
  assert.equal(zoneAt(noSeed, S, posOf(46, 150, 5)), null);
  assert.equal(placeView(noSeed, S, 'loc_va').exits, null);
  const cells = gridView(noSeed, S, { w: 0, cells: { x0: 46, y0: 150, z0: 4, x1: 46, y1: 150, z1: 6 } }).cells;
  assert.equal(cells.length, 3);
  for (const c of cells) assert.equal(c.known, false);
  assert.equal(zoneAt(e, S, posOf(46, 150, 5)), 'loc_a'); // 有种子时同一格是已知的"洞外"
});

test('含水层（体积行挂水体）的体积格不画成干空气：读 known 为假，水体账户接上后再改；洞口通路格与洞外不受影响', () => {
  const e = world(WORLD({ loc_va: volume('loc_a', { waterKind: 'water_test_fresh' }) }));
  const cells = box(e, ...BOX);
  const cols = [];
  for (let x = BOX[0]; x <= BOX[3]; x += 1) for (let y = BOX[1]; y <= BOX[4]; y += 1) if (!cells.get(`${x},${y},5`).known) cols.push({ x, y });
  assert.equal(cols.length, 4); // 四列体积格（层 4、5）未知
  for (const c of cols) { assert.equal(cells.get(`${c.x},${c.y},4`).known, false); assert.equal(cells.get(`${c.x},${c.y},5`).known, false); }
  assert.equal(cells.get('46,150,5').known, true); // 洞外仍是已知的花岗岩
  assert.equal(cells.get('46,150,5').material, 'mat_granite');
  const shaft = cols.find((c) => cells.get(`${c.x},${c.y},7`).known && cells.get(`${c.x},${c.y},7`).material === 'mat_air');
  assert.ok(shaft); // mouth 为真：洞口通路格（层 6..10）仍是已知的空气与梯
});

test('控制点海拔未知（偏离行把父区格行的 anchorElevationM 清掉）时体积读作未知：不当"没有洞"，兄弟同样未知', () => {
  const e = world(WORLD({ loc_va: volume('loc_a', { targetAreaM2: 30 }), loc_vb: volume('loc_a', { targetAreaM2: 30 }) }));
  const broken = { created: { loc_a: { props: { anchorElevationM: null } } } };
  assert.equal(zoneAt(e, broken, posOf(46, 150, 5)), null);
  assert.equal(placeView(e, broken, 'loc_va').footprint, null);
  assert.equal(placeView(e, broken, 'loc_vb').footprint, null); // 先序兄弟 loc_va 未知，loc_vb 占哪些列取决于它，也未知
  assert.equal(placeView(e, broken, 'loc_vb').exits, null);
  assert.equal(zoneAt(e, S, posOf(46, 150, 5)), 'loc_a'); // 输入齐时同一格是已知的
});
