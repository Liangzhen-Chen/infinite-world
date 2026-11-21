// 格子迁移 G3《足迹划分、zoneAt、place.mjs 包含校验与纬度》卡内测试之二：place.mjs 的加载期校验、zoneAt 与足迹读入口（卷五 §3.1、§4.1 规则 1–3、8–10、12–14、§4.14 规则 2）。
// 对照表 docs/迁移体检/格子G1-G5-规矩检查对照.md 第 9、17、19、20、21、22、23、24、25、28、29、30、31、32 行（后半移交 G4/G5/G7/G8 的不测）。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表与词表条目写进拷贝，经 loadWorld 加载；
// 期望值按卷文规则手算成字面量（划分过程见 footprint.test.mjs 同一组夹具注释）。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { createHash } from 'node:crypto';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { placeView, routeView, zoneAt, regionCell, landCell, planFootprints, placeNeighbors, locatedChainOf, placeLatitude, straightM, bearingView } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

// 兜底条目齐全的 cellclass（每个地形、有无水体各一条；卷五 §4.3 规则 9：数据给全兜底条目，代码不设缺省）。
// G6 起每个 cellclass 条目必有 genTemplate（卷五 §2.2；卷十 :118 gentemplate 族），夹具给一个共用的测试模板。
const GEN_TEMPLATE = { gtpl_test: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FULL_CELLCLASS = {
  cellclass_land: { terrains: TERRAINS, waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
  cellclass_water: { terrains: TERRAINS, waterAny: ['water_test_fresh'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
};

// 加载一个只改了地点行、边、格空间表与（可选）词表条目的世界；临时目录用完即删。
function load({ rows = {}, edges = [], spaces, cellclass = FULL_CELLCLASS, header, relocatable = [] } = {}) {
  const tmp = testTempRoot('place-fp-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    const doc = { ...HEADER, ...(header || {}), rows, edges };
    if (spaces !== undefined) doc.gridSpaces = spaces;
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify(doc));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    // 真实世界为旧数据没有的列登记了未建（缺值放行）；本文件的用例要核"缺必填即报错"，前提自己造：拷贝里去掉 place 的未建列登记。
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = cellclass === null ? {} : cellclass;
    v.families.gentemplate.entries = GEN_TEMPLATE;
    v.families.bform.entries = { bldform_test: { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, rooms: [] } };
    for (const c of relocatable) v.families.component.entries[c].relocatable = true;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const codes = (r) => r.errors.map((e) => e.code);
const has = (r, code) => codes(r).includes(code);
// 一行区域足迹的地点：always 维度照表头给齐（areaM2 等存储列在 G5 转派生前仍必填）；足迹输入列用 extra 给。
const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
// 区域足迹行带 terrain、coord、anchorElevationM（terrain_river 的 reliefM 为 0，起伏为 0，高度可手算）；建筑、房间行不带 terrain（卷五 §2.1 :105 禁填）。
const ROOT_ROW = (extra = {}) => row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 200, y: 200 }, anchorElevationM: 100, ...extra });
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const BOX4 = { w: 0, box: { x0: 0, y0: 0, cellsX: 4, cellsY: 4 }, root: 'loc_root' };
// 4×4 区格：loc_a 种子 (50,50)、loc_b 种子 (350,350)，各无目标面积 → 各 8 格（划分手算见 footprint.test.mjs）。
const GRID4 = () => ({ rows: { loc_root: ROOT_ROW(), loc_a: region('loc_root', 50, 50), loc_b: region('loc_root', 350, 350, { anchorElevationM: 200 }) }, spaces: [BOX4] });
const engineOf = (r, over = {}) => ({ tables: r.tables, vocab: r.vocab, rules: r.rules, template: { seed: 'seed_test' }, ...over });
const S = {};
const P = (x, y, z = 0, w = 0) => ({ w, x, y, z, coarse: false });

function world(spec) {
  const r = load(spec);
  assert.equal(r.ok, true, r.text);
  return engineOf(r);
}

// ---------- 加载：格世界通过；足迹种类、必填与禁填（对照表第 29 行） ----------

test('格世界正例：层根开格空间、区域足迹子行带种子与控制海拔，加载零错误', () => {
  const r = load(GRID4());
  assert.equal(r.ok, true, r.text);
});

test('byFootprint 必填：区域足迹缺 coord、缺 anchorElevationM、缺 terrain 各报 E-DIM-REQUIRED-MISSING', () => {
  for (const k of ['coord', 'anchorElevationM', 'terrain']) {
    const g = GRID4();
    delete g.rows.loc_a[k];
    assert.ok(has(load(g), 'E-DIM-REQUIRED-MISSING'), k);
  }
});

// 挂 comp_facility 的行另须带卷十九 §2.1 的必填列（G7 第一步登记）：形制、外包宽深、层数、完好度、破口列表。
const BLD_COLUMNS = { form: 'bldform_test', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 } };

test('byFootprint 禁填：建筑足迹行（挂 comp_facility）写 coord、terrain、boundary、targetAreaM2 一律 E-DIM-DOMAIN-RANGE；区域足迹行写 anchor、facing、spanZ 同样', () => {
  const bld = { classes: ['comp_facility'], anchor: { w: 0, x: 10, y: 10, z: 0, coarse: false }, facing: 2, ...BLD_COLUMNS };
  const ok = GRID4();
  ok.rows.loc_h = row('loc_a', bld);
  assert.equal(load(ok).ok, true, load(ok).text);
  for (const [k, v] of [['coord', { x: 5, y: 5 }], ['terrain', 'terrain_river'], ['boundary', [{ x: 0, y: 0 }]], ['targetAreaM2', 100], ['anchorElevationM', 0]]) {
    const g = GRID4();
    g.rows.loc_h = row('loc_a', { ...bld, [k]: v });
    assert.ok(has(load(g), 'E-DIM-DOMAIN-RANGE'), k);
  }
  for (const [k, v] of [['anchor', { w: 0, x: 1, y: 1, z: 0, coarse: false }], ['facing', 1], ['spanZ', 2]]) {
    const g = GRID4();
    g.rows.loc_a = { ...g.rows.loc_a, [k]: v };
    assert.ok(has(load(g), 'E-DIM-DOMAIN-RANGE'), k);
  }
});

test('byFootprint：建筑行缺 anchor、facing 即 E-DIM-REQUIRED-MISSING；anchor 不合 struct:pos（缺 coarse、多字段、非整数）即 E-DIM-STRUCT-FIELD；体积行要 anchorElevationM、spanZ、targetAreaM2、terrain', () => {
  const mk = (extra) => { const g = GRID4(); g.rows.loc_h = row('loc_a', { classes: ['comp_facility'], ...extra }); return g; };
  assert.ok(has(load(mk({ facing: 1 })), 'E-DIM-REQUIRED-MISSING'));
  assert.ok(has(load(mk({ anchor: { w: 0, x: 1, y: 1, z: 0, coarse: false } })), 'E-DIM-REQUIRED-MISSING'));
  for (const anchor of [{ w: 0, x: 1, y: 1, z: 0 }, { w: 0, x: 1, y: 1, z: 0, coarse: false, extra: 1 }, { w: 0, x: 1.5, y: 1, z: 0, coarse: false }]) {
    assert.ok(has(load(mk({ facing: 1, anchor })), 'E-DIM-STRUCT-FIELD') || has(load(mk({ facing: 1, anchor })), 'E-DIM-DOMAIN-RANGE'), JSON.stringify(anchor));
  }
  const vol = (extra) => { const g = GRID4(); g.rows.loc_v = row('loc_a', { classes: ['comp_volume'], ...extra }); return g; };
  const full = { terrain: 'terrain_cave', anchorElevationM: -30, spanZ: 2, targetAreaM2: 500 };
  assert.equal(load(vol(full)).ok, true, load(vol(full)).text);
  for (const k of Object.keys(full)) {
    const g = vol(full);
    delete g.rows.loc_v[k];
    assert.ok(has(load(g), 'E-DIM-REQUIRED-MISSING'), k);
  }
});

test('房间足迹：挂 comp_zone 且有挂 comp_facility 的祖先才是房间（terrain、coord 禁填）；没有建筑祖先的 comp_zone 按区域足迹对待', () => {
  const g = GRID4();
  g.rows.loc_h = row('loc_a', { classes: ['comp_facility'], anchor: { w: 0, x: 10, y: 10, z: 0, coarse: false }, facing: 0, ...BLD_COLUMNS });
  g.rows.loc_room = row('loc_h', { classes: ['comp_zone'] });
  assert.equal(load(g).ok, true, load(g).text);
  g.rows.loc_room = row('loc_h', { classes: ['comp_zone'], terrain: 'terrain_river' });
  assert.ok(has(load(g), 'E-DIM-DOMAIN-RANGE'));
  const lone = GRID4();
  lone.rows.loc_z = region('loc_a', 120, 120, { classes: ['comp_zone'] }); // 没有建筑祖先：区域足迹，需 coord 与 anchorElevationM
  assert.equal(load(lone).ok, true, load(lone).text);
});

// ---------- 加载：包含与不重叠、种子（对照表第 19、20、23 行） ----------

test('包含与不重叠：种子在父足迹外、兄弟边界相交、同父两个种子同区格，各报卷二 1121k1 的码', () => {
  const outside = GRID4();
  outside.rows.loc_c = region('loc_a', 350, 350); // 种子 (3,3) 在 loc_b 里，不在父 loc_a 的足迹内
  assert.ok(has(load(outside), 'E-GRID-FOOTPRINT-OUTSIDE-PARENT'));
  const overlap = GRID4();
  overlap.rows.loc_a = region('loc_root', 50, 50, { boundary: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
  overlap.rows.loc_b = region('loc_root', 350, 350, { boundary: [{ x: 1, y: 0 }, { x: 2, y: 0 }] });
  assert.ok(has(load(overlap), 'E-GRID-SIBLING-OVERLAP'));
  const same = GRID4();
  same.rows.loc_c = region('loc_root', 60, 70); // 与 loc_a 的种子同在区格 (0,0)
  assert.ok(has(load(same), 'E-GRID-SEED-SAME-CELL'));
});

test('由足迹派生的量不许手填（E-DIM-DERIVED-WRITTEN，卷五 S5-6）；gridSpaces 节写成 null、对象也拒收，不当作没登记放过', () => {
  for (const [k, v] of [['centroid', { x: 1, y: 1 }], ['zRange', { zMin: 0, zMax: 1 }]]) {
    const g = GRID4();
    g.rows.loc_a[k] = v;
    assert.ok(has(load(g), 'E-DIM-DERIVED-WRITTEN'), k);
  }
  for (const bad of [null, {}, 'x']) {
    const g = GRID4();
    g.spaces = bad;
    assert.ok(has(load(g), 'E-DIM-STRUCT-FIELD'), JSON.stringify(bad));
  }
  // 节是列表但行不是对象（null、数字、字串）：报结构错，不抛 TypeError。
  for (const bad of [null, 5, 'x']) {
    const g = GRID4();
    g.spaces = [BOX4, bad];
    assert.ok(has(load(g), 'E-DIM-STRUCT-FIELD'), JSON.stringify(bad));
  }
});

// 规则表 grid.json 的 facingDirections 只许卷五 §4.2 规则 13 定的八向（登记取值域 [8,8]）：别的值加载拒收，运行时不再有"档数不是八"的分支。
function rulesTree(dir, base, tmp, patch) {
  for (const ent of readdirSync(join(dir, base), { withFileTypes: true })) {
    const rel = `${base}/${ent.name}`.replace(/^\//, '');
    if (ent.isDirectory()) rulesTree(dir, rel, tmp, patch);
    else writeUnderTempRoot(tmp, `rules/${rel}`, patch(rel, readFileSync(join(dir, rel), 'utf8')));
  }
}

test('规则表 facingDirections 不是八向即加载拒收（E-DIM-DOMAIN-RANGE）；八向放行', () => {
  const tmp = testTempRoot('place-fp-rules-');
  try {
    rulesTree(join(ROOT, 'world/rules'), '', tmp, (rel, text) => (rel === 'tables/grid.json' ? text.replace('"value": 8,', '"value": 16,') : text));
    const r = loadWorld(ROOT, { rulesDir: join(tmp, 'rules') });
    assert.equal(r.ok, false);
    assert.ok(r.errors.some((e) => e.code === 'E-DIM-DOMAIN-RANGE' && /facingDirections/.test(JSON.stringify(e))), r.text);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  assert.equal(loadWorld(ROOT).ok, true);
});

test('等效圆坐标包含已删：子行 coord 离父行很远但仍在父足迹里，不再报错（旧校验按坐标与面积，新校验按足迹）', () => {
  const g = GRID4();
  g.rows.loc_a = region('loc_root', 50, 50, { areaM2: 1 });
  g.rows.loc_b = region('loc_root', 350, 350, { areaM2: 1, anchorElevationM: 200 });
  assert.equal(load(g).ok, true);
});

test('格空间表：根须是层根、层根须有格空间、主世界根须是层根、格空间号与根不重复、外包框须为正', () => {
  const noRootClass = GRID4();
  noRootClass.rows.loc_root = ROOT_ROW({ classes: [] });
  assert.ok(has(load(noRootClass), 'E-DIM-DOMAIN-RANGE'));
  const noSpace = GRID4();
  noSpace.rows.loc_c = region('loc_a', 50, 50, { classes: ['comp_layer_root'] }); // 另一个层根，没有格空间
  assert.ok(has(load(noSpace), 'E-DIM-REF-MISSING'));
  const dupW = GRID4();
  dupW.rows.loc_c = region('loc_a', 50, 50, { classes: ['comp_layer_root'] });
  dupW.spaces = [BOX4, { w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 2 }, root: 'loc_c' }];
  assert.ok(has(load(dupW), 'E-DIM-DUPLICATE-KEY'));
  for (const bad of [{ ...BOX4, box: { x0: 0, y0: 0, cellsX: 0, cellsY: 4 } }, { ...BOX4, box: { x0: 0, y0: 0, cellsX: 4 } }]) {
    const g = GRID4();
    g.spaces = [bad];
    assert.ok(has(load(g), 'E-DIM-DOMAIN-RANGE') || has(load(g), 'E-DIM-STRUCT-FIELD'));
  }
});

test('规则 3 层根除外：另一格空间的层根挂在本树下，它的足迹不在父足迹之内，不报包含错', () => {
  const g = GRID4();
  g.rows.loc_realm = region('loc_a', 10, 10, { classes: ['comp_layer_root'], anchorElevationM: 50 });
  g.rows.loc_r1 = region('loc_realm', 70, 70, { targetAreaM2: 10000 }); // 目标 1 格：格空间 1 里其余区格归层根
  g.spaces = [BOX4, { w: 1, box: { x0: 0, y0: 0, cellsX: 3, cellsY: 3 }, root: 'loc_realm' }];
  const e = world(g);
  assert.equal(zoneAt(e, S, P(70, 70, 0, 1)), 'loc_r1'); // 格空间 1 里 (0,0) 区格 → 种子行 loc_r1 的足迹
  assert.equal(zoneAt(e, S, P(250, 250, 0, 1)), 'loc_realm'); // 格空间 1 的野外归它的层根
  assert.equal(zoneAt(e, S, P(50, 50, 0, 0)), 'loc_a'); // 格空间 0 不受影响
});

// ---------- 加载：每个区格有地形类（对照表第 9 行，G2 欠账） ----------

test('E-GRID-CELL-NO-TERRAIN：划出区格后 cellclass 条目缺失、或缺兜底（有水体类无对应条目、某地形无条目）即加载报错；给全兜底则过', () => {
  assert.ok(has(load({ ...GRID4(), cellclass: null }), 'E-GRID-CELL-NO-TERRAIN'));
  // 只给陆地条目：区格里有水体类（loc_lake 写 waterKind）时水体组合无条目成立。
  const lake = GRID4();
  lake.rows.loc_lake = region('loc_a', 50, 150, { terrain: 'terrain_lake', waterKind: 'water_test_fresh' });
  assert.ok(has(load({ ...lake, cellclass: { cellclass_land: FULL_CELLCLASS.cellclass_land } }), 'E-GRID-CELL-NO-TERRAIN'));
  assert.equal(load({ ...lake, cellclass: FULL_CELLCLASS }).ok, true);
  // 地形缺口：条目只覆盖 terrain_plain，区格地形是 terrain_river。
  assert.ok(has(load({ ...GRID4(), cellclass: { cellclass_plain: { ...FULL_CELLCLASS.cellclass_land, terrains: ['terrain_plain'] } } }), 'E-GRID-CELL-NO-TERRAIN'));
  // 坡度缺口：条目 slopeRange 只覆盖 [0, 0.5]，坡度 1 无条目。
  assert.ok(has(load({ ...GRID4(), cellclass: { cellclass_flat: { ...FULL_CELLCLASS.cellclass_land, slopeRange: [0, 0.5] } } }), 'E-GRID-CELL-NO-TERRAIN'));
  // 没登记格空间表的世界没有区格，不要求 cellclass（真实世界转格世界前）。
  assert.equal(load({ rows: { loc_root: ROOT_ROW({ classes: [] }), loc_a: region('loc_root', 50, 50) }, cellclass: null }).ok, true);
  // 坡度区间之间的空档：[0, 0.1] 与 [0.2, 1] 之间的坡度（如 0.15）无条目成立，端点探针命中但中点探针报出。
  const gapped = { cellclass_low: { ...FULL_CELLCLASS.cellclass_land, slopeRange: [0, 0.1] }, cellclass_high: { ...FULL_CELLCLASS.cellclass_land, slopeRange: [0.2, 1] }, cellclass_water: FULL_CELLCLASS.cellclass_water };
  assert.ok(has(load({ ...GRID4(), cellclass: gapped }), 'E-GRID-CELL-NO-TERRAIN'));
  gapped.cellclass_high.slopeRange = [0.1, 1]; // 两个闭区间在 0.1 相接：没有空档
  assert.equal(load({ ...GRID4(), cellclass: gapped }).ok, true);
});

// ---------- 规则 1：单根（不计离场行）与离场读法（对照表第 17、31 行） ----------

// 离场子树（卷二 §2.6"行改挂"第 3 点）：自己 parent 为 null 且挂了 relocatable 为真的组件类的行，与它的全部后代。
// relocatable 是组件类条目的字段，本用例在测试词表里把 comp_zone 标为可改挂（真实词表里它不可改挂）。
const AWAY = () => {
  const g = GRID4();
  g.rows.loc_away = region(null, 50, 50, { classes: ['comp_zone'] });
  g.rows.loc_away_kid = region('loc_away', 50, 50);
  g.edges = [{ from: 'loc_a', to: 'loc_away', waterway: false }, { from: 'loc_a', to: 'loc_b', waterway: false }];
  return g;
};

test('离场行：没有可改挂的组件类时它是第二个根（E-DIM-DOMAIN-RANGE）；标了可改挂后单根只计不离场行，离场子树不参加划分与校验', () => {
  const g = AWAY();
  assert.ok(has(load(g), 'E-DIM-DOMAIN-RANGE'));
  const r = load({ ...g, relocatable: ['comp_zone'] });
  assert.equal(r.ok, true, r.text);
  // 离场行的种子与 loc_a 同区格也不报 E-GRID-SEED-SAME-CELL（不参加划分）。
  assert.ok(!has(r, 'E-GRID-SEED-SAME-CELL'));
});

test('离场读法：zoneAt 不返回离场子树；足迹、形心等导出量与位置量按未知；exits 为空；routeView 端为离场行时 edge 与 path 为空；离场边不进相邻与出口', () => {
  const e = world({ ...AWAY(), relocatable: ['comp_zone'] });
  assert.equal(zoneAt(e, S, P(50, 50)), 'loc_a'); // 离场行的种子也在 (0,0)，zoneAt 仍给 loc_a
  for (const id of ['loc_away', 'loc_away_kid']) {
    const v = placeView(e, S, id);
    assert.equal(v.footprint, null, id);
    assert.deepEqual(v.exits, [], id);
    for (const k of ['centroid', 'areaM2', 'elevationM', 'zRange']) assert.equal(v.dims[k].known, false, `${id}.${k}`);
  }
  assert.equal(placeView(e, S, 'loc_away').dims.parent.value, null); // 离场的那一行 parent 返回 null
  assert.equal(placeView(e, S, 'loc_away_kid').dims.parent.value, 'loc_away'); // 后代照存储值
  const r = routeView(e, S, 'loc_a', 'loc_away');
  assert.deepEqual([r.edge, r.path], [[], null]);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_b').path.places, ['loc_a', 'loc_b']); // 在树上的边照常
  assert.deepEqual(placeNeighbors(e, S, 'loc_a'), ['loc_b']); // 通往离场行的边不算
  assert.deepEqual(placeView(e, S, 'loc_a').exits.filter((x) => x.kind === 'road').map((x) => x.via.to), ['loc_b']); // 只有在树上的 a–b 一条路，通往离场行的边不算出口
  assert.deepEqual(placeNeighbors(e, S, 'loc_away'), []);
  const out = planFootprints(e, {});
  assert.ok(!('loc_away' in out.footprints) && !('loc_away_kid' in out.footprints));
});

// ---------- 规则 12：zoneAt（对照表第 21 行） ----------

test('zoneAt：区格归属的最深区域足迹；外包框外、格空间不存在为 null；coarse 按存的格；位置形状不合 struct:pos 拒收', () => {
  const e = world(GRID4());
  assert.equal(zoneAt(e, S, P(0, 0)), 'loc_a');
  assert.equal(zoneAt(e, S, P(399, 399)), 'loc_b');
  assert.equal(zoneAt(e, S, { w: 0, x: 399, y: 399, z: 7, coarse: true }), 'loc_b');
  assert.equal(zoneAt(e, S, P(400, 0)), null);
  assert.equal(zoneAt(e, S, P(-1, 0)), null);
  assert.equal(zoneAt(e, S, P(0, 0, 0, 5)), null);
  for (const bad of [{ w: 0, x: 0, y: 0, z: 0 }, { w: 0, x: 0.5, y: 0, z: 0, coarse: false }, null, 5]) assert.throws(() => zoneAt(e, S, bad), (er) => er.code === 'E-DIM-STRUCT-FIELD');
});

test('zoneAt 抽样：4×4 外包框里每个区格中心恰返回一行，且该行足迹含此格（A5-1.2）', () => {
  const e = world(GRID4());
  const seen = { loc_a: 0, loc_b: 0 };
  for (let ry = 0; ry < 4; ry += 1) for (let rx = 0; rx < 4; rx += 1) {
    const z = zoneAt(e, S, P(rx * 100 + 50, ry * 100 + 50));
    const f = placeView(e, S, z).footprint;
    assert.ok(f.regionCells.some((c) => c.x === rx && c.y === ry), `${z} contains ${rx},${ry}`);
    seen[z] += 1;
  }
  assert.deepEqual(seen, { loc_a: 8, loc_b: 8 });
});

test('没登记格空间表的世界：zoneAt 一律为 null（未知），placeView 没有足迹', () => {
  const e = world({ rows: { loc_root: ROOT_ROW({ classes: [] }), loc_a: region('loc_root', 50, 50) }, cellclass: null });
  assert.equal(zoneAt(e, S, P(0, 0)), null);
  assert.equal(placeView(e, S, 'loc_a').footprint, null);
  assert.equal(placeView(e, S, 'loc_a').dims.centroid.known, false);
});

test('located 起点：个体所在地点 = zoneAt(pos)，沿包含树取它与全部祖先；zoneAt 为未知时为 null（按未知传播）', () => {
  const e = world(GRID4());
  assert.deepEqual(locatedChainOf(e, S, P(50, 50)), ['loc_a', 'loc_root']);
  assert.deepEqual(locatedChainOf(e, S, P(399, 399)), ['loc_b', 'loc_root']);
  assert.equal(locatedChainOf(e, S, P(999, 999)), null);
});

// ---------- 规则 13：派生几何量与纬度（对照表第 22、24 行） ----------

test('placeView：footprint 给种类、格空间、区格列表与派生量；dims.centroid 取形心（手算 a：(112.5, 162.5)，根：(200, 200)）', () => {
  const e = world(GRID4());
  const a = placeView(e, S, 'loc_a');
  assert.equal(a.footprint.kind, 'region');
  assert.equal(a.footprint.w, 0);
  assert.equal(a.footprint.cellCount, 8);
  assert.equal(a.footprint.areaM2, 80000); // 8 区格 × 100²
  assert.deepEqual(a.footprint.regionCells.map((c) => [c.x, c.y]), [[0, 0], [0, 1], [0, 2], [0, 3], [1, 0], [1, 1], [1, 2], [2, 0]]);
  assert.deepEqual(a.dims.centroid, { known: true, applicable: true, value: { x: 112.5, y: 162.5 } });
  assert.deepEqual(placeView(e, S, 'loc_root').dims.centroid.value, { x: 200, y: 200 });
  assert.equal(placeView(e, S, 'loc_root').footprint.areaM2, 160000);
});

test('形心随足迹变：1×3 区格的一列，loc_a 目标 1 格，种子 y = 50 → 形心 y 50；种子 y = 250 → 形心 y 250（卷五 §4.1 规则 13；纬度改读形心归 G5）', () => {
  const column = (sy) => world({ rows: { loc_root: ROOT_ROW({ coord: { x: 50, y: 150 } }), loc_a: region('loc_root', 50, sy, { targetAreaM2: 10000 }) }, spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 1, cellsY: 3 }, root: 'loc_root' }] });
  assert.equal(placeView(column(50), S, 'loc_a').dims.centroid.value.y, 50);
  assert.equal(placeView(column(250), S, 'loc_a').dims.centroid.value.y, 250);
});

test('纬度读法照旧（G3 不动，改读形心与"世界必有格空间表"一起归 G5）：latitudeOriginDeg 37.738 + coord.y ÷ 111120——coord.y 5000 → 0.0449 → 37.7829；缺 rules.astro 参数为未知', () => {
  const e = world({ rows: { loc_root: ROOT_ROW({ classes: [] }), loc_a: region('loc_root', 1, 5000) }, cellclass: null });
  const view = placeView(e, S, 'loc_a');
  assert.equal(placeLatitude(e, view), 37.7829);
  assert.equal(placeLatitude({ ...e, rules: { ...e.rules, astro: { ...e.rules.astro, latitudeOriginDeg: undefined } } }, view), null);
});

// 2×1 区格：根（anchorElevationM 100）下 loc_a（目标 1 格，种子 (50,50)，anchorElevationM 0）、loc_b（种子 (150,50)，anchorElevationM 200）；
// terrain_river 的 reliefM = 0，起伏为 0；控制点是各行形心 root (100,50)=100、a (50,50)=0、b (150,50)=200，区格中心恰在 a、b 的形心上 → h 取 0 与 200；层号 floor(h ÷ 3)：0、66。
const HEIGHTS = () => ({ rows: { loc_root: ROOT_ROW({ coord: { x: 100, y: 50 } }), loc_a: region('loc_root', 50, 50, { targetAreaM2: 10000 }), loc_b: region('loc_root', 150, 50, { anchorElevationM: 200 }) }, spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 1 }, root: 'loc_root' }] });

test('placeView：zRange 取层号最小最大、footprint.elevationM 取区格代表地表高平均（手算 a 0、[0,0]；b 200、[66,66]；根 100、[0,66]）', () => {
  const e = world(HEIGHTS());
  assert.deepEqual(placeView(e, S, 'loc_a').dims.zRange.value, { zMin: 0, zMax: 0 });
  assert.deepEqual(placeView(e, S, 'loc_b').dims.zRange.value, { zMin: 66, zMax: 66 });
  assert.deepEqual(placeView(e, S, 'loc_root').dims.zRange.value, { zMin: 0, zMax: 66 });
  assert.equal(placeView(e, S, 'loc_root').footprint.elevationM, 100);
  assert.equal(placeView(e, S, 'loc_b').footprint.elevationM, 200);
  // 世界种子缺失：高度算不出，elevationM 与 zRange 按未知（面积与形心不受影响）。
  const noSeed = engineOf(load(HEIGHTS()), { template: {} });
  assert.equal(placeView(noSeed, S, 'loc_b').footprint.elevationM, null);
  assert.equal(placeView(noSeed, S, 'loc_b').dims.zRange.known, false);
  assert.equal(placeView(noSeed, S, 'loc_b').footprint.areaM2, 10000);
});

test('regionCell：区格中心列地表层那一格；landCell：落在 zoneAt 恰为该地点的区格里，同输入同结果；coarse 为假要细格基底，拒收', () => {
  const e = world(HEIGHTS());
  assert.deepEqual(regionCell(e, S, { w: 0, region: { x: 1, y: 0 } }), { w: 0, x: 150, y: 50, z: 66, coarse: true });
  assert.equal(regionCell(e, S, { w: 0, region: { x: 5, y: 0 } }), null);
  assert.equal(regionCell(e, S, { w: 3, region: { x: 0, y: 0 } }), null);
  const spot = landCell(e, S, { place: 'loc_b', kind: 'person', seedKey: 'k1', coarse: true });
  assert.deepEqual(spot, { w: 0, x: 150, y: 50, z: 66, coarse: true });
  assert.deepEqual(landCell(e, S, { place: 'loc_b', kind: 'person', seedKey: 'k1', coarse: true }), spot);
  assert.equal(zoneAt(e, S, spot), 'loc_b');
  assert.equal(landCell(e, S, { place: 'loc_root', kind: 'person', seedKey: 'k1', coarse: true }), null); // 根的两个区格都在子行里
  assert.throws(() => landCell(e, S, { place: 'loc_b', kind: 'person', seedKey: 'k1', coarse: false }), (er) => er.code === 'E-DET-DOMAIN');
});

test('planFootprints：同一套算法求足迹与派生量；proposals 新增行、assumptions 改生成输入只供试排，不进状态', () => {
  const e = world(HEIGHTS());
  const base = planFootprints(e, {});
  assert.deepEqual(base.errors, []);
  assert.equal(base.footprints.loc_b.elevationM, 200);
  assert.deepEqual(base.adjacency.loc_a, ['loc_b']);
  // 假设 loc_b 的控制海拔 300：区格中心 (150,50) 恰在 b 的形心上 → h = 300，层号 100；根的平均 (0 + 300) ÷ 2 = 150。
  const what = planFootprints(e, { assumptions: { loc_b: { anchorElevationM: 300 } } });
  assert.equal(what.footprints.loc_b.elevationM, 300);
  assert.deepEqual(what.footprints.loc_b.zRange, { zMin: 100, zMax: 100 });
  assert.equal(what.footprints.loc_root.elevationM, 150);
  assert.equal(placeView(e, S, 'loc_b').footprint.elevationM, 200); // 世界数据没动
  // 提案新增一个子行：种子 (150,50) 与 loc_b 同区格 → 报 E-GRID-SEED-SAME-CELL，行不划格。
  const clash = planFootprints(e, { proposals: { loc_c: region('loc_root', 150, 50) } });
  assert.deepEqual(clash.errors.map((x) => `${x.code} ${x.id}`), ['E-GRID-SEED-SAME-CELL loc_c']);
});

test('waterAccess：本行足迹与其四邻区格内各水体行足迹的 waterKind 之并（手算：湖占 (1,1)，属 loc_a；loc_a 的格里有湖，loc_b 的格 (2,1) 紧邻湖格）', () => {
  // 4×4 区格划分同上例：a 含 (1,1)（见 footprint.test.mjs），b 含 (2,1)。湖行是 loc_a 的子行，目标 1 格，种子 (150,150) → 区格 (1,1)。
  const g = GRID4();
  g.rows.loc_lake = region('loc_a', 150, 150, { terrain: 'terrain_lake', waterKind: 'water_test_fresh', targetAreaM2: 10000 });
  const e = world(g);
  assert.deepEqual(placeView(e, S, 'loc_lake').footprint.regionCells.map((c) => [c.x, c.y]), [[1, 1]]);
  assert.deepEqual(placeView(e, S, 'loc_a').footprint.waterAccess, ['water_test_fresh']); // 本行足迹含湖格
  assert.deepEqual(placeView(e, S, 'loc_b').footprint.waterAccess, ['water_test_fresh']); // b 的 (2,1) 四邻含湖格 (1,1)
  assert.deepEqual(placeView(e, S, 'loc_root').footprint.waterAccess, ['water_test_fresh']); // 根的足迹含湖
  // 湖挪到 (0,0)（a 的西南角）：b 的格都不与 (0,0) 四邻接 → b 没有可及水体。
  const far = GRID4();
  far.rows.loc_lake = region('loc_a', 50, 50, { terrain: 'terrain_lake', waterKind: 'water_test_fresh', targetAreaM2: 10000 });
  const f = world(far);
  assert.deepEqual(placeView(f, S, 'loc_a').footprint.waterAccess, ['water_test_fresh']);
  assert.deepEqual(placeView(f, S, 'loc_b').footprint.waterAccess, []);
  // waterKind 只许引用 water 族条目（引用闭合）。
  const bad = GRID4();
  bad.rows.loc_lake = region('loc_a', 150, 150, { waterKind: 'water_nope', targetAreaM2: 10000 });
  assert.ok(has(load(bad), 'E-DIM-REF-MISSING'));
});

// ---------- §4.14 规则 2：相邻；规则 9：出口（对照表第 28、32 行） ----------

// 6×1 区格：loc_a 取 (0,0)、loc_b 取 (1,0)、loc_t 取 (5,0)，各目标 1 格；(2,0)…(4,0) 归根。
const STRIP = () => ({ rows: { loc_root: ROOT_ROW({ coord: { x: 300, y: 50 } }), loc_a: region('loc_root', 50, 50, { targetAreaM2: 10000 }), loc_b: region('loc_root', 150, 50, { targetAreaM2: 10000 }), loc_t: region('loc_root', 550, 50, { targetAreaM2: 10000 }) }, spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 6, cellsY: 1 }, root: 'loc_root' }] });

test('placeNeighbors：足迹有一对四邻接区格即相邻；路网边两端在双方包含子树内也相邻（跨海航线）；祖先后代不算；离场行不参加', () => {
  const e = world(STRIP());
  assert.deepEqual(placeNeighbors(e, S, 'loc_a'), ['loc_b']);
  assert.deepEqual(placeNeighbors(e, S, 'loc_t'), []); // (5,0) 的左邻 (4,0) 属根：根是 t 的祖先，不算
  const withEdge = world({ ...STRIP(), edges: [{ from: 'loc_a', to: 'loc_t', waterway: false }] });
  assert.deepEqual(placeNeighbors(withEdge, S, 'loc_a'), ['loc_b', 'loc_t']);
  assert.deepEqual(placeNeighbors(withEdge, S, 'loc_t'), ['loc_a']);
});

test('placeView().exits：路与开阔边界两种，排序按（种类 路、门、开阔；区格序号 (x,y)；两端）；根的足迹是整个外包框，没有开阔边界', () => {
  const e = world({ ...STRIP(), edges: [{ from: 'loc_a', to: 'loc_t', waterway: false }, { from: 'loc_b', to: 'loc_t', waterway: false }] });
  const a = placeView(e, S, 'loc_a').exits;
  // a 只占 (0,0)：一条路（到 t 的陆路，接入格 (0,0)），一格开阔边界（(0,0) 的右邻 (1,0) 在外侧）。
  assert.deepEqual(a.map((x) => [x.kind, x.regionCell.x, x.regionCell.y]), [['road', 0, 0], ['open', 0, 0]]);
  assert.deepEqual(a[0].via, { from: 'loc_a', to: 'loc_t', waterway: false });
  assert.equal(a[0].inner, 'loc_a');
  // 根：子树含 a、b、t 与自己，两条边都在子树内，没有路；外包框之外没有格，没有开阔边界。
  assert.deepEqual(placeView(e, S, 'loc_root').exits, []);
  // b：路 (b, t) 的接入格 (1,0)；开阔边界 (1,0)。
  assert.deepEqual(placeView(e, S, 'loc_b').exits.map((x) => [x.kind, x.regionCell.x, x.regionCell.y]), [['road', 1, 0], ['open', 1, 0]]);
});

// ---------- 规则 5、§4.2：straightM 与 bearingView 的入口形状 ----------

test('straightM、bearingView 入口：位置须合 struct:pos；同格空间给定点米与方位，跨格空间为未知', () => {
  const e = world(GRID4());
  assert.equal(straightM(e, P(0, 0), P(3, 4)), 50000n); // 5 m，SCALE 10⁴
  assert.equal(straightM(e, P(0, 0, 0, 0), P(3, 4, 0, 1)), null);
  assert.equal(bearingView(e, S, P(0, 0), P(10, 0)).bearingDeg, 90);
  assert.equal(bearingView(e, S, P(0, 0), P(0, 0)), null);
  assert.throws(() => straightM(e, { w: 0, x: 0, y: 0, z: 0 }, P(1, 1)), (er) => er.code === 'E-DIM-STRUCT-FIELD');
  assert.throws(() => bearingView(e, S, P(0, 0), { w: 0, x: 0, y: 0 }), (er) => er.code === 'E-DIM-STRUCT-FIELD');
});

test('没有格空间表的世界：边没有足迹可栅格化，派生量与路径按未知（不抛错、不借别的量顶替）；边本身照常读出', () => {
  const e = world({ rows: { loc_root: ROOT_ROW({ classes: [] }), loc_a: region('loc_root', 1, 1), loc_b: region('loc_root', 2, 2) }, edges: [{ from: 'loc_a', to: 'loc_b', waterway: false }], cellclass: null });
  const r = routeView(e, S, 'loc_a', 'loc_b');
  assert.equal(r.edge.length, 1);
  for (const k of ['distanceM', 'terrainMix', 'ascentM', 'speedFactor', 'cells', 'bearingDeg']) assert.equal(r.edge[0][k].known, false, k);
  assert.equal(r.edge[0].waterway.value, false);
  assert.equal(r.path, null);
});
