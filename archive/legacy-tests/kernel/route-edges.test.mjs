// 格子迁移 G4《路网栅格化、长途选路、routeView 改》卡内测试：路网边栅格化、routeView 的派生量与路网最短路、pathView 区格寻路与离路穿越、门边、缓存（卷五 §4.1 规则 4、5、7；§4.10 规则 1、5）。
// 对照表 docs/迁移体检/格子G1-G5-规矩检查对照.md 第 27、31、34、35、36、37、38、39、40、41 行（后半移交的不测：体积端取顶层区格 G8、细格寻路 G15、建筑房间出入 G7）。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、边、格空间表与词表条目写进拷贝，经 loadWorld 加载；
// 期望值按卷文公式手算成字面量，推算写在用例注释里（步长：正交 100 m、斜向 fixedSqrtInt(2×100²) = 141.4213 m，定点标度 10⁴；
// 地形 terrain_river 起伏为 0、全格空间锚点海拔相同时地表高处处相同，所以坡度项恒为 lookup(slopeCurve, 0) = 1；
// 步进系数取词表 paceFactor：river 4、plain 1、mountain 3；roadPaceFactor 0.8）。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { useReportSink } from '../../server-plugin/kernel/report.mjs';
import { routeView, pathView, placeView, zoneAt } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = (({ rows, edges, gridSpaces, generated, ...head }) => ({ ...head, generated: {} }))(JSON.parse(realText('place.json'))); // 只取表头：真实世界的行、边、格空间表、generated 节不进夹具（generated 留空对象）
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);
// G6 起每个 cellclass 条目必有 genTemplate（卷五 §2.2；卷十 :118 gentemplate 族），夹具给一个共用的测试模板。
const GEN_TEMPLATE = { gtpl_test: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FULL_CELLCLASS = {
  cellclass_land: { terrains: TERRAINS, waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
  cellclass_water: { terrains: TERRAINS, waterAny: ['water_test_nav'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
};

// 加载一个只改了地点行、边、格空间表的世界；水体类只有一条可航的 water_test_nav；临时目录用完即删。
function load({ rows = {}, edges = [], spaces } = {}) {
  const tmp = testTempRoot('route-edges-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges, gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.water.entries = { ...v.families.water.entries, water_test_nav: { navigable: true } };
    v.families.cellclass.entries = FULL_CELLCLASS;
    v.families.gentemplate.entries = GEN_TEMPLATE;
    v.families.bform.entries = { bldform_test: { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, defaultMaterials: { wall: 'mat_soil', frame: 'mat_elm', roof: 'mat_straw' }, rooms: [], facilityTypes: ['fac_house'] }, bldform_shrine: v.families.bform.entries.bldform_shrine, bldform_open_yard: v.families.bform.entries.bldform_open_yard };
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const codes = (r) => r.errors.map((e) => e.code);
const has = (r, code) => codes(r).includes(code);
const row = (parent, extra = {}) => ({
  parent, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
// 层根与区域足迹行：锚点海拔都取 0（控制面处处为 0），terrain_river 起伏为 0，地表高处处为 0。
const ROOT_ROW = (extra = {}) => row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 400, y: 150 }, anchorElevationM: 0, ...extra });
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const SPACE = (cellsX, cellsY) => ({ w: 0, box: { x0: 0, y0: 0, cellsX, cellsY }, root: 'loc_root' });
const edge = (from, to, waterway = false, extra = {}) => ({ from, to, waterway, ...extra });
const engineOf = (r) => ({ tables: r.tables, vocab: r.vocab, rules: r.rules, template: { seed: 'seed_test' } });
const S = {};
const world = (spec) => { const r = load(spec); assert.equal(r.ok, true, r.text); return engineOf(r); };
const P = (x, y, z = 0, w = 0) => ({ w, x, y, z, coarse: false });
const val = (fact) => { assert.equal(fact.known, true); return fact.value; };

// 一排：8 × 3 区格；loc_a 占 (0,1)、loc_b 占 (7,1)、loc_c 占 (3,2)（各一格：targetAreaM2 10000 ÷ 100² = 1）；其余格归层根。
const ROW8 = () => ({
  rows: {
    loc_root: ROOT_ROW(),
    loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }),
    loc_b: region('loc_root', 750, 150, { targetAreaM2: 10000 }),
    loc_c: region('loc_root', 350, 250, { targetAreaM2: 10000 }),
  },
  spaces: [SPACE(8, 3)],
});

// ---------- 对照表第 35 行：路段派生量由栅格化路段派生（卷五 §4.1 规则 4 派生量、§4.10 规则 1） ----------

test('路段派生量（平地陆路）：a(0,1)→b(7,1)，接入格各在两足迹内，七步正交；distanceM 700、ascentM 0、terrainMix 和为 1、speedFactor 1.25、cells 八格', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  const it = routeView(e, S, 'loc_a', 'loc_b').edge[0];
  // 接入格：a 足迹 {(0,1)} 离 b 形心 (750,150) 最近的格就是 (0,1)；b 端同理 (7,1)。区格八邻寻路：每步 100×paceFactor 4（river）= 400，七步 2800 最小且唯一（斜走更贵）。
  assert.deepEqual(val(it.cells), [0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 1 })));
  assert.equal(val(it.distanceM), 700); // 七个正交步长 7 × 100
  assert.equal(val(it.ascentM), 0); // 地表高处处为 0
  assert.deepEqual(val(it.terrainMix), { terrain_river: 1 }); // 全部终点区格都是 river（按步长加权，份额 1）
  assert.equal(val(it.speedFactor), 1.25); // 路程 700 ÷ Σ(100 × roadPaceFactor 0.8 × 坡度项 1 = 80 × 7 = 560) = 1.25
  assert.equal(val(it.waterway), false);
  assert.equal(val(it.portal), null);
});

test('路段派生量不存储：edges 节每条只有 from、to、waterway（A5-1.1），distanceM 等写在边上即加载拒收', () => {
  for (const k of ['distanceM', 'terrainMix', 'speedFactor', 'openness', 'ascentM']) {
    const r = load({ ...ROW8(), edges: [edge('loc_a', 'loc_b', false, { [k]: 10 })] });
    assert.ok(has(r, 'E-DIM-STRUCT-FIELD'), k);
  }
  const edgeDef = HEADER.edgeStruct.fields;
  assert.deepEqual(Object.keys(edgeDef).sort(), ['from', 'portal', 'to', 'waterway']);
});

test('斜向步长：a(0,1)→c(3,2)：先斜后正交最少步数、区格序号字典序小者胜；distanceM = 141.4213 + 2 × 100', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_c')] });
  const it = routeView(e, S, 'loc_a', 'loc_c').edge[0];
  // 接入格 a=(0,1)，c=(3,2)。三步：一斜两正交。代价 = (141.4213 + 100 + 100) × 4，所有"一斜两正交"的排列代价相同、步数相同（三步），
  // 并列取区格序号 (x, y) 序列字典序小的：第二格候选 (1,1)、(1,2)，x 同为 1、y 小者先，取 (1,1)；第三格候选 (2,1)、(2,2)，取 (2,1)；斜步落在末尾：(0,1)(1,1)(2,1)(3,2)。
  assert.deepEqual(val(it.cells), [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 2 }]);
  assert.equal(val(it.distanceM), 341.4213); // 141.4213 + 100 + 100
});

test('bearingDeg：路段取两端形心（卷五 §4.2 规则 12）：东 90、西 270；跨北东 45 以内取 atan', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b'), edge('loc_a', 'loc_c')] });
  assert.equal(val(routeView(e, S, 'loc_a', 'loc_b').edge[0].bearingDeg), 90); // 形心 (50,150) → (750,150)：dy = 0、dx > 0
  assert.equal(val(routeView(e, S, 'loc_b', 'loc_a').edge[0].bearingDeg), 270);
  // (50,150) → (350,250)：dx = 300、dy = 100，atan(300/100) 从正北顺时针：角 = 90 − atan(1/3)°，约 71.57°；只核方位落在 (45, 90) 之间（东偏北）。
  const b = val(routeView(e, S, 'loc_a', 'loc_c').edge[0].bearingDeg);
  assert.ok(b > 45 && b < 90, String(b));
});

test('bearingDeg 正北 0、东北 45（对照表第 27 行；方位角全书唯一算法 bearingView，路段取两端形心）', () => {
  const g = ROW8();
  g.rows.loc_n = region('loc_root', 50, 250, { targetAreaM2: 10000 }); // 占 (0,2)：形心 (50,250)，在 a (50,150) 正北
  g.rows.loc_ne = region('loc_root', 150, 250, { targetAreaM2: 10000 }); // 占 (1,2)：形心 (150,250)，在 a 的东北：dx = dy = 100
  const e = world({ ...g, edges: [edge('loc_a', 'loc_n'), edge('loc_a', 'loc_ne')] });
  assert.equal(val(routeView(e, S, 'loc_a', 'loc_n').edge[0].bearingDeg), 0);
  assert.equal(val(routeView(e, S, 'loc_a', 'loc_ne').edge[0].bearingDeg), 45);
  assert.equal(val(routeView(e, S, 'loc_ne', 'loc_a').edge[0].bearingDeg), 225); // 反向是西南
});

// ---------- 对照表第 36、41 行：routeView 路网最短路与 edge 形状 ----------

test('path：去程回程路程相同、互为逆序；edge 只含直接的边；两地相同为零长路径；不连通为 null', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_c'), edge('loc_b', 'loc_c')] });
  const fwd = routeView(e, S, 'loc_a', 'loc_b');
  const back = routeView(e, S, 'loc_b', 'loc_a');
  assert.deepEqual(fwd.path.places, ['loc_a', 'loc_c', 'loc_b']);
  assert.deepEqual(back.path.places, ['loc_b', 'loc_c', 'loc_a']);
  assert.equal(fwd.path.distanceM, back.path.distanceM);
  assert.deepEqual(fwd.edge, []); // a、b 之间没有直接的边
  assert.deepEqual(fwd.path.edges.map((x) => val(x.cells)).flat().length, 4 + 5); // a→c 四格（见上一例）+ c→b 五格
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_a').path, { places: ['loc_a'], edges: [], distanceM: 0 });
  const lone = world({ ...ROW8(), edges: [edge('loc_a', 'loc_c')] });
  assert.equal(routeView(lone, S, 'loc_a', 'loc_b').path, null);
  assert.equal(routeView(lone, S, 'loc_a', 'loc_b').overCap, false); // 真不连通：不是超限
});

test('path 并列取法从实际出发端起比（卷五 :470 勘误 1121k12，分辨性）：两条等长三边路线上下镜像，正向得 P、反向得 Q（不是 P 的倒写），路程相同', () => {
  // 6 × 3 区格，各地点一格：a (0,1)、d (5,1)；P = a–b–e–d 走上行 b (1,2)、e (4,2)；Q = a–c–bb–d 走下行 c (1,0)、bb (4,0)。
  // 每条路线：两个斜步 + 一段三个正交步的边 = 2 × 141.4213 + 300 = 582.8426，上下镜像、地形与高度一致，两条路程逐位相同、边数都是三。
  // 从 loc_a 写起 [a,b,e,d] < [a,c,bb,d]，P 胜；从 loc_d 写起 [d,bb,c,a] < [d,e,b,a]（"bb" < "e"），Q 胜——
  // 所以反向调用得 Q（地点序列 d,bb,c,a），而不是把 P 倒过来（d,e,b,a）：若仍固定从较小端求再倒写，就会得到后者。
  const one = (x, y) => region('loc_root', x, y, { targetAreaM2: 10000 });
  const rows = { loc_root: ROOT_ROW({ coord: { x: 300, y: 150 } }), loc_a: one(50, 150), loc_d: one(550, 150), loc_b: one(150, 250), loc_e: one(450, 250), loc_c: one(150, 50), loc_bb: one(450, 50) };
  const edges = [edge('loc_a', 'loc_b'), edge('loc_b', 'loc_e'), edge('loc_d', 'loc_e'), edge('loc_a', 'loc_c'), edge('loc_bb', 'loc_c'), edge('loc_bb', 'loc_d')];
  const e = world({ rows, spaces: [SPACE(6, 3)], edges });
  const fwd = routeView(e, S, 'loc_a', 'loc_d').path;
  const back = routeView(e, S, 'loc_d', 'loc_a').path;
  assert.deepEqual(fwd.places, ['loc_a', 'loc_b', 'loc_e', 'loc_d']);
  assert.deepEqual(back.places, ['loc_d', 'loc_bb', 'loc_c', 'loc_a']);
  assert.equal(fwd.distanceM, 582.8426);
  assert.equal(back.distanceM, 582.8426);
});

test('edge 形状：同两端的陆路、水路各一项，陆路在前；path 并列时取陆路（通路类型序列陆路先于水路）', () => {
  const e = world({ ...WITH_SEA(), edges: [edge('loc_a', 'loc_b', true), edge('loc_a', 'loc_b', false)] });
  const r = routeView(e, S, 'loc_b', 'loc_a');
  assert.deepEqual(r.edge.map((x) => val(x.waterway)), [false, true]);
  for (const it of r.edge) assert.deepEqual(Object.keys(it).sort(), ['ascentM', 'bearingDeg', 'cells', 'distanceM', 'portal', 'requirement', 'speedFactor', 'terrainMix', 'waterway']);
  assert.deepEqual(r.path.edges.map((x) => val(x.waterway)), [false]); // 两条都是 700 m、一条边：取陆路
});

// ---------- 对照表第 34 行：水路只走可航水体足迹区格；两端之间没有通航水域即加载报错 ----------

// 在 ROW8 上加一条水体行 loc_sea（waterKind 可航）：占 (1,1)…(6,1) 六格，作者给出 boundary（四邻连通）。
const SEA_CELLS = (xs) => xs.map((x) => ({ x, y: 1 }));
const WITH_SEA = (xs = [1, 2, 3, 4, 5, 6]) => { const g = ROW8(); g.rows.loc_sea = region('loc_root', 350, 150, { waterKind: 'water_test_nav', boundary: SEA_CELLS(xs) }); return g; };

test('水路边：沿可航水体足迹区格走，一步代价 = 步长（不看地形系数）；distanceM 700、terrainMix 和为 1、speedFactor 1.25（航道区格取 roadPaceFactor、坡度项按 1 计）', () => {
  const e = world({ ...WITH_SEA(), edges: [edge('loc_a', 'loc_b', true)] });
  const it = routeView(e, S, 'loc_a', 'loc_b').edge[0];
  assert.deepEqual(val(it.cells), [0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ x, y: 1 })));
  assert.equal(val(it.distanceM), 700);
  assert.deepEqual(val(it.terrainMix), { terrain_river: 1 });
  assert.equal(val(it.speedFactor), 1.25); // 700 ÷ (7 × 100 × 0.8 × 1)
  assert.equal(val(it.ascentM), 0);
});

test('水路边：两端之间没有通航水域即加载报错 E-GRID-WATERWAY-NO-CHANNEL（无水体、水体断开各一例）；陆路边不受影响', () => {
  assert.ok(has(load({ ...ROW8(), edges: [edge('loc_a', 'loc_b', true)] }), 'E-GRID-WATERWAY-NO-CHANNEL'));
  // 水体断成 (1,1)-(2,1) 与 (4,1)-(6,1) 两段：(3,1) 不是水体，水路走不过去。
  const split = { rows: { ...WITH_SEA().rows }, spaces: ROW8().spaces };
  split.rows.loc_sea = region('loc_root', 150, 150, { waterKind: 'water_test_nav', boundary: SEA_CELLS([1, 2]) });
  split.rows.loc_sea2 = region('loc_root', 550, 150, { waterKind: 'water_test_nav', boundary: SEA_CELLS([4, 5, 6]) });
  assert.ok(has(load({ ...split, edges: [edge('loc_a', 'loc_b', true)] }), 'E-GRID-WATERWAY-NO-CHANNEL'));
  assert.equal(load({ ...ROW8(), edges: [edge('loc_a', 'loc_b', false)] }).ok, true);
});

// ---------- 对照表第 33、34 行：边两端的足迹种类、同一格空间 ----------

test('边两端只许区域或体积足迹的行：建筑行、房间行作端点即 E-DIM-DOMAIN-RANGE；体积端加载通过（其栅格化归 G8，派生量按未知）', () => {
  // 挂 comp_facility 的行另须带卷十九 §2.1 的必填列（G7 第一步登记）：形制、外包宽深、层数、完好度、破口列表。
  const bld = { classes: ['comp_facility'], anchor: { w: 0, x: 10, y: 150, z: 0, coarse: false }, facing: 0, form: 'bldform_test', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, wallFlowKg: { laidKg: { mat_granite: 1000 }, takenKg: { mat_granite: 0 }, lostKg: { mat_granite: 0 } } };
  const g = ROW8();
  g.rows.loc_h = row('loc_a', bld);
  assert.ok(has(load({ ...g, edges: [edge('loc_a', 'loc_h')] }), 'E-DIM-DOMAIN-RANGE'));
  g.rows.loc_room = row('loc_h', { classes: ['comp_zone'] });
  assert.ok(has(load({ ...g, edges: [edge('loc_h', 'loc_room')] }), 'E-DIM-DOMAIN-RANGE'));
  const v = ROW8();
  v.rows.loc_v = row('loc_a', { classes: ['comp_volume'], terrain: 'terrain_cave', anchorElevationM: -30, spanZ: 2, targetAreaM2: 500, mouth: false }); // mouth 是体积行必填列（卷五 §2.1 :102，勘误 1121k3；G8 登记），值与本测试无关
  const e = world({ ...v, edges: [edge('loc_a', 'loc_v')] });
  const r = routeView(e, S, 'loc_a', 'loc_v');
  assert.equal(r.edge.length, 1);
  assert.equal(r.edge[0].distanceM.known, false);
  assert.equal(r.path, null);
});

// ---------- 对照表第 39 行：门边 ----------

// 第二个格空间 w=1：层根 loc_realm（挂在 loc_a 下）开 3×3 区格，loc_x 占 (1,1)；门边 a 在 loc_a 的足迹 (0,1) 内、b 在 loc_x 的足迹 (1,1) 内。
const DOOR = { a: { w: 0, x: 50, y: 150, z: 0, coarse: true }, b: { w: 1, x: 150, y: 150, z: 0, coarse: true } };
const TWO_SPACES = () => {
  const g = ROW8();
  g.rows.loc_realm = region('loc_a', 150, 150, { classes: ['comp_layer_root'] });
  g.rows.loc_x = region('loc_realm', 150, 150, { targetAreaM2: 10000 });
  g.spaces = [...g.spaces, { w: 1, box: { x0: 0, y0: 0, cellsX: 3, cellsY: 3 }, root: 'loc_realm' }];
  return g;
};

test('门边：穿门一步、路程 0，不栅格化（没有地形构成、爬升、路况），跨格空间不给方位；path 经门边长 0', () => {
  const e = world({ ...TWO_SPACES(), edges: [edge('loc_a', 'loc_x', false, { portal: DOOR })] });
  const it = routeView(e, S, 'loc_a', 'loc_x').edge[0];
  assert.equal(val(it.distanceM), 0);
  assert.deepEqual(val(it.portal), DOOR);
  for (const k of ['terrainMix', 'ascentM', 'speedFactor', 'cells']) assert.deepEqual(it[k], { known: false, applicable: false }, k); // 门不做除法，speedFactor 无值
  assert.equal(it.bearingDeg.known, false); // 两侧不在同一格空间
  const p = routeView(e, S, 'loc_x', 'loc_a').path;
  assert.deepEqual(p.places, ['loc_x', 'loc_a']);
  assert.equal(p.distanceM, 0);
});

test('pathView 跨格空间：经门的"起点到门 + 门到终点"，门计 0；步串含门两侧的格；没有门则为未知', () => {
  const e = world({ ...TWO_SPACES(), edges: [edge('loc_a', 'loc_x', false, { portal: DOOR })] });
  // w0 的 (2,1) 走到门 a 所在区格 (0,1)：两个正交步 200；w1 里从门 b 所在区格 (1,1) 走到 (2,1)：一步 100；门 0；合计 300。
  const r = pathView(e, S, P(250, 150, 0, 0), P(250, 150, 0, 1));
  assert.equal(r.distanceM, 300);
  assert.deepEqual(r.steps, [{ w: 0, x: 2, y: 1 }, { w: 0, x: 1, y: 1 }, { w: 0, x: 0, y: 1 }, { w: 1, x: 1, y: 1 }, { w: 1, x: 2, y: 1 }]);
  // 反向各算各的（不倒写）：这一段是一条直线上的唯一最小代价路径，所以反向恰是逆序、路程相同。
  const back = pathView(e, S, P(250, 150, 0, 1), P(250, 150, 0, 0));
  assert.equal(back.distanceM, 300);
  assert.deepEqual(back.steps, [...r.steps].reverse());
  assert.equal(pathView(world(TWO_SPACES()), S, P(250, 150, 0, 0), P(250, 150, 0, 1)), null); // 没有门
});

test('门边加载校验：a 不在 from 足迹内、b 不在 to 足迹内、门边是水路、portal 缺 b、非门边跨格空间，各报 E-DIM-DOMAIN-RANGE 或 E-DIM-STRUCT-FIELD', () => {
  const bad = (portal, extra = {}) => load({ ...TWO_SPACES(), edges: [edge('loc_a', 'loc_x', false, { portal, ...extra })] });
  assert.equal(bad(DOOR).ok, true, bad(DOOR).text);
  assert.ok(has(bad({ ...DOOR, a: { ...DOOR.a, x: 750 } }), 'E-DIM-DOMAIN-RANGE')); // a 落在 loc_b 的格里
  assert.ok(has(bad({ ...DOOR, b: { ...DOOR.b, x: 50 } }), 'E-DIM-DOMAIN-RANGE')); // b 落在 realm 的根格里，不在 loc_x 内
  assert.ok(has(bad({ ...DOOR, b: { w: 7, x: 0, y: 0, z: 0, coarse: true } }), 'E-DIM-DOMAIN-RANGE')); // 格空间不存在
  assert.ok(has(load({ ...TWO_SPACES(), edges: [edge('loc_a', 'loc_x', true, { portal: DOOR })] }), 'E-DIM-DOMAIN-RANGE')); // 门不是水路
  assert.ok(has(bad({ a: DOOR.a }), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(load({ ...TWO_SPACES(), edges: [edge('loc_a', 'loc_x')] }), 'E-DIM-DOMAIN-RANGE')); // 非门边跨格空间
});

// ---------- 对照表第 37、38 行：pathView 区格寻路、离路穿越、步进系数 ----------

test('pathView 沿路：路网区格取 roadPaceFactor，平地上走路与路网边同路程；这条直路是唯一最小代价路径，回程恰为逆序', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  const r = pathView(e, S, P(50, 150), P(750, 150));
  assert.equal(r.distanceM, 700);
  assert.deepEqual(r.steps, [0, 1, 2, 3, 4, 5, 6, 7].map((x) => ({ w: 0, x, y: 1 })));
  const back = pathView(e, S, P(750, 150), P(50, 150));
  assert.equal(back.distanceM, 700);
  assert.deepEqual(back.steps, [...r.steps].reverse());
  assert.deepEqual(pathView(e, S, P(50, 150), P(50, 150)), { steps: [{ w: 0, x: 0, y: 1 }], distanceM: 0 }); // 同一区格
});

test('pathView 位置只到区格精度：同一区格内任意细格同结果；位置在外包框外或格空间不存在为未知；位置须合 struct:pos', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  assert.deepEqual(pathView(e, S, P(1, 101), P(799, 199)), pathView(e, S, P(50, 150), P(750, 150)));
  assert.equal(pathView(e, S, P(50, 150), P(5000, 150)), null);
  assert.equal(pathView(e, S, P(50, 150), P(50, 150, 0, 3)), null);
  assert.throws(() => pathView(e, S, { w: 0, x: 0, y: 0 }, P(1, 1)), (er) => er.code === 'E-DIM-STRUCT-FIELD');
});

// 捕获内核报告出口（report.mjs）的记录；用完恢复原出口。
function captured(fn) {
  const logs = [];
  const prev = useReportSink((rec) => logs.push(rec));
  try { fn(); } finally { useReportSink(prev); }
  return logs;
}

test('pathView 展开上限（勘误 1121k12）：超 longCostCap 返回明确的超限结果、不返回空、读路程仍得未知，并记 E-GRID-PATH-OVER-CAP；与"没有路"可区分；上限够用则找得到', () => {
  const r = load({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  assert.equal(r.ok, true, r.text);
  const small = { ...engineOf(r), rules: { ...r.rules, grid: { ...r.rules.grid, longCostCap: 3 } } };
  let over;
  const logs = captured(() => { over = pathView(small, S, P(50, 150), P(750, 150)); });
  assert.deepEqual(over, { overCap: true, steps: null, distanceM: null });
  // 展开第 4 个节点时超过上限 3：expanded = 4（regionPath 在 done.size > cap 的那一刻返回）。
  assert.deepEqual(logs, [{ code: 'E-GRID-PATH-OVER-CAP', fields: { cap: 3, expanded: 4 } }]);
  // 真没有路（位置在外包框外、没有门的跨格空间）仍是 null，且不记超限。
  const none = captured(() => {
    assert.equal(pathView(small, S, P(50, 150), P(5000, 150)), null);
    assert.equal(pathView(small, S, P(50, 150), P(50, 150, 0, 3)), null);
  });
  assert.deepEqual(none, []);
  assert.notEqual(pathView(engineOf(r), S, P(50, 150), P(750, 150)), null);
});

test('pathView：路网边自身超限时整体超限，不用残缺的路网区格集返回一条较差的路（Opus 核 M1）', () => {
  const r = load({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  assert.equal(r.ok, true, r.text);
  const small = { ...engineOf(r), rules: { ...r.rules, grid: { ...r.rules.grid, longCostCap: 3 } } };
  // 相邻两格 (0,1)→(1,1)：自身只展开 2 个节点（≤3），但路网边 a–b 七步栅格化在第 4 个节点超限（expanded 4）。
  let v;
  const logs = captured(() => { v = pathView(small, S, P(50, 150), P(150, 150)); });
  assert.deepEqual(v, { overCap: true, steps: null, distanceM: null });
  assert.deepEqual(logs, [{ code: 'E-GRID-PATH-OVER-CAP', fields: { cap: 3, expanded: 4 } }]);
  // 上限够用时同一对位置正常返回：一个正交步 100 m。
  assert.equal(pathView(engineOf(r), S, P(50, 150), P(150, 150)).distanceM, 100);
});

test('routeView 展开上限（勘误 1121k12）：路网边因超 longCostCap 算不出路程时 path 为 null 且 overCap 为 true（并记 E-GRID-PATH-OVER-CAP），真不连通 overCap 为 false；上限够用则有 path', () => {
  const r = load({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  assert.equal(r.ok, true, r.text);
  const small = { ...engineOf(r), rules: { ...r.rules, grid: { ...r.rules.grid, longCostCap: 3 } } };
  let v;
  const logs = captured(() => { v = routeView(small, S, 'loc_a', 'loc_b'); });
  assert.equal(v.path, null);
  assert.equal(v.overCap, true);
  assert.equal(v.edge[0].distanceM.known, false); // 边的路程同样算不出（未知），不是 0
  assert.deepEqual(logs, [{ code: 'E-GRID-PATH-OVER-CAP', fields: { cap: 3, expanded: 4 } }]);
  const ok = routeView(engineOf(r), S, 'loc_a', 'loc_b');
  assert.equal(ok.overCap, false);
  assert.equal(ok.path.distanceM, 700);
});

// 方向不对称夹具：3 × 2 区格，全是 terrain_river（paceFactor 4、起伏 0，坡度项恒为 1）；loc_m1 占 (1,1)、loc_m2 占 (1,0)，路网边 m1–m2 使这两格成为道路格（步进系数 roadPaceFactor 0.8）。
// 起点 S = 区格 (0,0)、终点 T = 区格 (2,1)，都不是道路格。步价只看落脚格（规则 5），一步 = 步长 × 终点格系数，步长正交 100、斜向 141.4213。
//  正向 S→T：经 m1（先斜后正交）= 141.4213 × 0.8 + 100 × 4 = 513.1370；经 m2（先正交后斜）= 100 × 0.8 + 141.4213 × 4 = 645.6852；S→m2→m1→T = 80 + 80 + 400 = 560。最小是经 m1。
//  反向 T→S：经 m2（先斜后正交）= 141.4213 × 0.8 + 100 × 4 = 513.1370；经 m1（先正交后斜）= 100 × 0.8 + 141.4213 × 4 = 645.6852；T→m1→m2→S = 560。最小是经 m2。
// 所以正反两次调用的格子串不同，反向不是正向的倒写；路程（步长之和）都是 141.4213 + 100 = 241.4213。
test('pathView 方向不同、代价最小路径可不同（勘误 1121k12，A5-1.2）：正向经 m1、反向经 m2，反向不是正向的倒写；路程各按所走格子的步长之和', () => {
  const rows = {
    loc_root: ROOT_ROW({ coord: { x: 150, y: 100 } }),
    loc_m1: region('loc_root', 150, 150, { targetAreaM2: 10000 }),
    loc_m2: region('loc_root', 150, 50, { targetAreaM2: 10000 }),
  };
  const e = world({ rows, spaces: [SPACE(3, 2)], edges: [edge('loc_m1', 'loc_m2')] });
  const fwd = pathView(e, S, P(50, 50), P(250, 150));
  const back = pathView(e, S, P(250, 150), P(50, 50));
  assert.deepEqual(fwd.steps, [{ w: 0, x: 0, y: 0 }, { w: 0, x: 1, y: 1 }, { w: 0, x: 2, y: 1 }]);
  assert.deepEqual(back.steps, [{ w: 0, x: 2, y: 1 }, { w: 0, x: 1, y: 0 }, { w: 0, x: 0, y: 0 }]);
  assert.notDeepEqual(back.steps, [...fwd.steps].reverse());
  assert.equal(fwd.distanceM, 241.4213);
  assert.equal(back.distanceM, 241.4213);
});

// 离路穿越夹具（卷五 §4.1.6 A5-1.2；只放测试目录）：16 × 11 区格，一道山脊 loc_ridge（terrain_mountain，锚点海拔 90 m）竖在 x = 8、y = 0…7（八格）；
// 脊南端留出口 (8,8)…(8,10)；loc_a 在脊西 (4,2)，loc_b 在脊东 (12,2)，loc_c 在脊南 (8,10)；路网边只有 a–c、c–b（沿山脚绕行，路经 c）。
const RIDGE = () => {
  const ys = [0, 1, 2, 3, 4, 5, 6, 7];
  return {
    rows: {
      loc_root: ROOT_ROW({ terrain: 'terrain_plain', coord: { x: 800, y: 550 } }),
      loc_a: region('loc_root', 450, 250, { terrain: 'terrain_plain', targetAreaM2: 10000 }),
      loc_b: region('loc_root', 1250, 250, { terrain: 'terrain_plain', targetAreaM2: 10000 }),
      loc_c: region('loc_root', 850, 1050, { terrain: 'terrain_plain', targetAreaM2: 10000 }),
      loc_ridge: region('loc_root', 850, 350, { terrain: 'terrain_mountain', anchorElevationM: 90, boundary: ys.map((y) => ({ x: 8, y })) }),
    },
    spaces: [SPACE(16, 11)],
    edges: [edge('loc_a', 'loc_c'), edge('loc_b', 'loc_c')],
  };
};

test('离路穿越：翻脊代价小于绕路代价时，pathView 离开路网翻过山脊，路程小于沿路的路程；仍返回区格串里有非道路格与山脊格', () => {
  const e = world(RIDGE());
  const viaRoad = routeView(e, S, 'loc_a', 'loc_b').path; // 沿路：a→c→b
  assert.deepEqual(viaRoad.places, ['loc_a', 'loc_c', 'loc_b']);
  const r = pathView(e, S, P(450, 250), P(1250, 250));
  assert.notEqual(r, null);
  const roadCells = new Set(viaRoad.edges.flatMap((it) => val(it.cells).map((c) => `${c.x},${c.y}`)));
  assert.ok(r.steps.some((c) => !roadCells.has(`${c.x},${c.y}`)), 'at least one off-road step');
  assert.ok(r.steps.some((c) => c.x === 8 && c.y <= 7), 'crosses the ridge'); // 翻过山脊区格（x = 8、y ≤ 7 是脊）
  assert.ok(r.distanceM < viaRoad.distanceM, `${r.distanceM} < ${viaRoad.distanceM}`);
});

test('荒野里也有路径：两位置离任何路网区格至少 20 区格，pathView 仍返回非空；玩家与 NPC 同一入口', () => {
  const rows = { loc_root: ROOT_ROW({ terrain: 'terrain_plain', coord: { x: 1500, y: 1500 } }), loc_a: region('loc_root', 50, 50, { terrain: 'terrain_plain', targetAreaM2: 10000 }), loc_b: region('loc_root', 150, 50, { terrain: 'terrain_plain', targetAreaM2: 10000 }) };
  const e = world({ rows, spaces: [SPACE(30, 30)], edges: [edge('loc_a', 'loc_b')] }); // 路网只在 y = 0 一行的 (0,0)(1,0)
  const r = pathView(e, S, P(1050, 2550), P(2850, 2850)); // 区格 (10,25) 与 (28,28)：离 (0..1, 0) 至少 25 区格
  assert.notEqual(r, null);
  assert.deepEqual([r.steps[0], r.steps[r.steps.length - 1]], [{ w: 0, x: 10, y: 25 }, { w: 0, x: 28, y: 28 }]);
  const roadCells = new Set(['0,0', '1,0']);
  assert.ok(r.steps.every((c) => !roadCells.has(`${c.x},${c.y}`)));
});

// ---------- 对照表第 35、38 行：有高差时的派生量；第 40 行：缓存与确定性 ----------

test('有高差：ascentM 大于 0、speedFactor 大于 0 且不超过平地值 1.25；terrainMix 各项和为 1', () => {
  const g = ROW8();
  g.rows.loc_b = region('loc_root', 750, 150, { targetAreaM2: 10000, anchorElevationM: 300 });
  const e = world({ ...g, edges: [edge('loc_a', 'loc_b')] });
  const it = routeView(e, S, 'loc_a', 'loc_b').edge[0];
  assert.ok(val(it.ascentM) > 0);
  assert.ok(val(it.speedFactor) > 0 && val(it.speedFactor) < 1.25, String(val(it.speedFactor)));
  assert.equal(Object.values(val(it.terrainMix)).reduce((s, v) => s + Math.round(v * 10000), 0), 10000);
});

test('缓存与确定性：同一输入两次栅格化逐格相同；输入变（偏离行改锚点海拔）后按新输入重算，旧输入的读法不变', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  const first = routeView(e, S, 'loc_a', 'loc_b');
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_b'), first);
  assert.deepEqual(routeView(world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] }), S, 'loc_a', 'loc_b'), first); // 重新加载同样的世界，逐格相同
  assert.equal(val(first.edge[0].ascentM), 0);
  const changed = { holdings: {}, created: { loc_b: { props: { anchorElevationM: 300 } } } };
  assert.ok(val(routeView(e, changed, 'loc_a', 'loc_b').edge[0].ascentM) > 0);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_b'), first); // 输入版本回到原来：读到原来的结果
});

test('placeView().exits 的路与路段首格一致：from 端出口的接入格就是路段区格串的首格（对照表第 32 行 G4 部分）', () => {
  const e = world({ ...ROW8(), edges: [edge('loc_a', 'loc_b')] });
  const road = placeView(e, S, 'loc_a').exits.find((x) => x.kind === 'road');
  const it = routeView(e, S, 'loc_a', 'loc_b').edge[0];
  assert.deepEqual(road.regionCell, val(it.cells)[0]);
  const back = placeView(e, S, 'loc_b').exits.find((x) => x.kind === 'road');
  assert.deepEqual(back.regionCell, val(it.cells)[val(it.cells).length - 1]);
});
