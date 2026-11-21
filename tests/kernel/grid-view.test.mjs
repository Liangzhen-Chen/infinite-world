// 格子迁移 G6《细格地形生成》卡内测试之二：gridView 的接线（place.mjs gridView，经 loadWorld 加载夹具世界）与加载期校验。
// 对照表 docs/迁移体检/格子G6-G11-规矩检查对照.md 第 3、5–9、13–16 行；纯函数层（叠层、水面、标志、格块、数量取账）见 tests/kernel/grid-base.test.mjs。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、词表条目与三行材料写进拷贝；期望值手算成字面量（推算写在用例里）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { gridView, zoneAt } from '../../server-plugin/kernel/place.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

// 三种细格生成模板（材料取真实材料行 mat_soil、mat_granite、mat_limestone，三者经 gentemplate 引用，代码里没有材料 id）。
const TEMPLATES = (extra = {}) => ({
  gtpl_land: { surfaceMaterial: 'mat_soil', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] },
  gtpl_steep: { surfaceMaterial: 'mat_granite', soilLayers: 0, soilMaterial: 'mat_soil', rockMaterial: 'mat_limestone', blocks: [] },
  gtpl_road: { surfaceMaterial: 'mat_limestone', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] },
  gtpl_town: { surfaceMaterial: 'mat_granite', soilLayers: 2, soilMaterial: 'mat_soil', rockMaterial: 'mat_limestone', blocks: [] },
  ...extra,
});
const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
// 兜底 land（优先级 1）；steep 坡度 ≥ 0.25（2）；road 道路或航道（3）；town 聚落内（4）。
const CELLCLASS = (extra = {}) => ({
  cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' },
  cellclass_water: { ...ANY, waterAny: ['water_test_fresh'], slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' },
  cellclass_steep: { ...ANY, slopeRange: [0.25, 1], priority: 2, genTemplate: 'gtpl_steep' },
  cellclass_road: { ...ANY, slopeRange: [0, 1], onRoad: true, priority: 3, genTemplate: 'gtpl_road' },
  cellclass_town: { ...ANY, slopeRange: [0, 1], inSettlement: true, priority: 4, genTemplate: 'gtpl_town' },
  ...extra,
});
// 材料四个分态布尔在真实材料表里每行都已填全（修改轮 M1）：夹具直接用真实行，不再在临时世界里补行。
// 空气是一行材料（M7）：每个模板的 airMaterial 默认指向 mat_air（模板里写了别的值则覆盖）。
const withAir = (templates) => Object.fromEntries(Object.entries(templates).map(([k, t]) => [k, { airMaterial: 'mat_air', ...t }]));

function load({ rows, edges = [], spaces, cellclass = CELLCLASS(), templates = TEMPLATES(), keepUnbuilt = false, materialEdit = null } = {}) {
  const tmp = testTempRoot('grid-view-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges, gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    if (!keepUnbuilt) unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    if (materialEdit) {
      const mat = JSON.parse(realText('material.json'));
      materialEdit(mat);
      writeUnderTempRoot(tmp, 'material.json', JSON.stringify(mat));
    }
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = cellclass;
    v.families.gentemplate.entries = withAir(templates);
    v.families.component.entries.comp_settlement = { requires: [], table: 'place' };
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
const edge = (from, to, waterway = false) => ({ from, to, waterway });
const S = {};
// 2 × 3 区格：loc_a 占 (0,1)（海拔 0）、loc_b 占 (1,1)（海拔 30），各一格（targetAreaM2 10000 ÷ 100² = 1）；其余四格归层根。terrain_river 起伏为 0。
const WORLD = (over = {}) => ({
  rows: {
    loc_root: ROOT_ROW(),
    loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000, ...(over.a || {}) }),
    loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000, anchorElevationM: 30, ...(over.b || {}) }),
  },
  spaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 2, cellsY: 3 }, root: 'loc_root' }],
  edges: over.edges || [],
});
function world(spec, loadOver = {}) {
  const r = load({ ...spec, ...loadOver });
  assert.equal(r.ok, true, r.text);
  return { tables: r.tables, vocab: r.vocab, rules: r.rules, template: { seed: 'seed_test' } };
}
const REGION = (e, x, y) => gridView(e, S, { w: 0, region: { x, y } });
const CELLS = (e, c) => gridView(e, S, { w: 0, cells: c });

// ---------- 区格层：地形类、地表、坡度（#14、#16；卷五 §4.3 规则 8、9） ----------

test('区格 gridView：所属最深区域足迹、中心列地表高与层号、坡度（相邻区格中心高差最大者 ÷ regionCellM）、地形类；中心恰在控制点上取该点海拔', () => {
  const e = world(WORLD());
  // 控制点 loc_a (50,150) 海拔 0、loc_b (150,150) 海拔 30（K = 4 > 2，两点都入选）。
  // (0,1) 中心 (50,150) 恰在 loc_a 上 → 0 m、层 floor(0 ÷ 3) = 0；(1,1) 中心恰在 loc_b 上 → 30 m、层 10。
  const a = REGION(e, 0, 1);
  assert.equal(a.owner, 'loc_a');
  assert.equal(a.surfaceHeightM, 0);
  assert.equal(a.surfaceStorey, 0);
  assert.equal(REGION(e, 1, 1).surfaceHeightM, 30);
  assert.equal(REGION(e, 1, 1).surfaceStorey, 10);
  // (0,0) 中心 (50,50)：到 a 的 d² = 10000、到 b 的 d² = 20000，权 w_a = 20000、w_b = 10000 → (0×20000 + 30×10000) ÷ 30000 = 10 m；层 floor(10 ÷ 3) = 3；所属层根。
  const c00 = REGION(e, 0, 0);
  assert.equal(c00.owner, 'loc_root');
  assert.equal(c00.surfaceHeightM, 10);
  assert.equal(c00.surfaceStorey, 3);
  // (1,0) 中心 (150,50)：同理 20 m。
  assert.equal(REGION(e, 1, 0).surfaceHeightM, 20);
  // 坡度：(0,1) 的邻格 (1,1)=30、(0,0)=10、(0,2)=10 → 最大差 30 ÷ 100 = 0.3；(0,0) 的邻格 (1,0)=20、(0,1)=0 → 差 10 ÷ 100 = 0.1。
  assert.equal(a.slope, 0.3);
  assert.equal(c00.slope, 0.1);
  // 地形类：坡度 0.3 落在 steep 的 [0.25, 1]（优先级 2）；0.1 只有兜底 land。
  assert.equal(a.cellClass, 'cellclass_steep');
  assert.equal(a.genTemplate, 'gtpl_steep');
  assert.equal(c00.cellClass, 'cellclass_land');
  assert.equal(c00.genTemplate, 'gtpl_land');
  assert.equal(a.onRoad, false);
  // 格空间不存在、区格在外包框外为 null。
  assert.equal(gridView(e, S, { w: 9, region: { x: 0, y: 0 } }), null);
  assert.equal(REGION(e, 5, 5), null);
});

test('道路与航道区格：路段经过的区格地形类取 onRoad 为真的条目（优先级高者），细格地表铺出该模板的路面；不经过的不变；不产生任何状态写入', () => {
  const e = world(WORLD({ edges: [edge('loc_a', 'loc_b')] }));
  // 路段 a→b 的区格串是 (0,1)、(1,1)（接入格各在两端足迹内）；两格都是 onRoad，priority 3 胜过 steep（2）。
  assert.equal(REGION(e, 0, 1).onRoad, true);
  assert.equal(REGION(e, 0, 1).cellClass, 'cellclass_road');
  assert.equal(REGION(e, 1, 1).cellClass, 'cellclass_road');
  assert.equal(REGION(e, 0, 0).onRoad, false);
  assert.equal(REGION(e, 0, 0).cellClass, 'cellclass_land');
  // 路面材料来自 road 模板的 surfaceMaterial（mat_limestone），在 (50,150) 列：地表层 0 的格就是它。
  const col = CELLS(e, { x0: 50, y0: 150, z0: 0, x1: 50, y1: 150, z1: 1 }).cells;
  assert.deepEqual(col.map((c) => [c.z, c.material]), [[0, 'mat_limestone'], [1, 'mat_air']]);
  // 纯读：状态对象原样（没有差分、没有任何写入）。
  assert.deepEqual(S, {});
});

test('聚落内区格（挂 comp_settlement 的行的足迹）取 inSettlement 条目的模板：街巷地面由所在区格地形类的模板给，不另建行、不写格', () => {
  const e = world(WORLD({ a: { classes: ['comp_settlement'] } }));
  assert.equal(REGION(e, 0, 1).inSettlement, true);
  assert.equal(REGION(e, 0, 1).cellClass, 'cellclass_town'); // priority 4 胜 steep
  assert.equal(REGION(e, 1, 1).inSettlement, false);
  const col = CELLS(e, { x0: 50, y0: 150, z0: -3, x1: 50, y1: 150, z1: 0 }).cells;
  // town 模板：地表 mat_granite，soilLayers 2（z=−1、−2 为 mat_soil），再往下 mat_limestone（z=−3）。
  assert.deepEqual(col.map((c) => [c.z, c.material]), [[-3, 'mat_limestone'], [-2, 'mat_soil'], [-1, 'mat_soil'], [0, 'mat_granite']]);
});

// ---------- 细格：叠层、标志、坡的连通（#3、#5、#7） ----------

test('细格基底：地表层号以下依次是土、岩，地表层是模板地表料，以上是空气（地表层号 = floor(h ÷ storeyM)）', () => {
  const e = world(WORLD());
  // (50,50) 在区格 (0,0)：h = 10 m → 地表层 3；land 模板：地表 mat_soil、soilLayers 1（z=2 土）、其下 mat_granite（z=1 及以下）。
  const col = CELLS(e, { x0: 50, y0: 50, z0: 0, x1: 50, y1: 50, z1: 5 }).cells;
  assert.deepEqual(col.map((c) => [c.z, c.material, c.state]), [
    [0, 'mat_granite', 'solid'], [1, 'mat_granite', 'solid'], [2, 'mat_soil', 'solid'], [3, 'mat_soil', 'solid'], [4, 'mat_air', 'gas'], [5, 'mat_air', 'gas'],
  ]);
  // 地表层号以下全是岩土（实心）、以上全是空气，逐列核（A5-3.2）：取一整排列。
  const cells = CELLS(e, { x0: 0, y0: 50, z0: -2, x1: 99, y1: 50, z1: 12 }).cells;
  for (const c of cells) assert.ok(c.known);
  const surfaceOf = new Map();
  for (const c of cells) if (c.state === 'solid' && (!surfaceOf.has(c.x) || c.z > surfaceOf.get(c.x))) surfaceOf.set(c.x, c.z);
  for (const c of cells) assert.equal(c.state === 'solid', c.z <= surfaceOf.get(c.x), `x ${c.x} z ${c.z}`);
});

test('标志：材料行布尔写齐时，地面上一层空气可立足、再上一层不可；土层遮天；材料行没写（缺值放行）时按未知，不当成假', () => {
  const e = world(WORLD());
  const col = CELLS(e, { x0: 50, y0: 50, z0: 2, x1: 50, y1: 50, z1: 6 }).cells;
  const at = (z) => col.find((c) => c.z === z);
  assert.deepEqual([at(4).standable, at(5).standable], [true, false]); // 地表层 3 之上一层空气、脚下 mat_soil 承托
  assert.equal(at(4).bearsLoad, false); // 空气
  assert.equal(at(2).blocksSky, true); // 土层之上有地表实心遮天
  assert.equal(at(5).blocksSky, false);
  // 空气是一行材料（mat_air）：标志来自它的材料行（气栏四项皆假），不是代码里的特例。
  assert.deepEqual([at(4).material, at(4).state, at(4).blocksSky, at(4).bearsLoad], ['mat_air', 'gas', false, false]);
  // 地表层本身（mat_soil 固栏：遮天真、承托真）：不可穿行所以不可立足。
  assert.deepEqual([at(3).bearsLoad, at(3).standable], [true, false]);
});

test('材料四布尔是必填，gridView 读到缺失即内核错误（加载期已保证，不当未知、不当假）：临时世界里删掉 mat_soil 的 bearsLoad 加载就失败', () => {
  const r = load({ ...WORLD(), materialEdit: (m) => { delete m.rows.mat_soil.bearsLoad; delete m.rows.mat_soil.cellGrades['bearsLoad.solid']; delete m.rows.mat_soil.cellGrades['bearsLoad.liquid']; delete m.rows.mat_soil.cellGrades['bearsLoad.gas']; } });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((x) => x.code === 'E-DIM-REQUIRED-MISSING' && x.row === 'mat_soil' && x.dim === 'bearsLoad'));
});

test('自然坡连通：沿一排相邻列，相邻两列地表层号至多差一层（本世界缓坡），每列地表层上一层都有可立足格，一步走得通', () => {
  const e = world(WORLD());
  // (0..199, 150)：横跨 a 与 b 两区格，海拔 0 → 30（控制面平滑），每米升不到 0.3 m：相邻列差 ≤ 1 层。
  const cells = CELLS(e, { x0: 0, y0: 150, z0: -1, x1: 199, y1: 150, z1: 12 }).cells;
  const stand = new Map();
  for (const c of cells) if (c.standable === true) stand.set(c.x, c.z);
  assert.equal(stand.size, 200); // 每列恰一个可立足层（地表层上一层）
  for (let x = 1; x < 200; x += 1) assert.ok(Math.abs(stand.get(x) - stand.get(x - 1)) <= 1, `x ${x}`);
  assert.ok(stand.get(199) > stand.get(0)); // 确实在升
});

// ---------- 模板格块（#8；卷十 R10-2.15） ----------

test('模板格块经 gridView 叠在基底之后：千分数 1000 必中；块在区格中心列地表层之上、只落本区格内（超出截掉）；自承托标志随格；不中的区格不变', () => {
  const blockTpl = { surfaceMaterial: 'mat_soil', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [{ material: 'mat_limestone', selfSupport: true, liftLayers: 1, thickLayers: 2, radiusCells: 80, permille: 1000 }] };
  const noBlock = { ...blockTpl, blocks: [{ ...blockTpl.blocks[0], permille: 0 }] };
  const e = world(WORLD(), { templates: TEMPLATES({ gtpl_land: blockTpl }), cellclass: CELLCLASS() });
  // 区格 (0,0)：中心 (50,50)、地表层 3；块 z 从 3 + 1 + 1 = 5 起 2 层（5、6）；x、y 水平 50 ± 80 → 截到区格内 0..99。
  const inside = CELLS(e, { x0: 0, y0: 0, z0: 4, x1: 0, y1: 0, z1: 7 }).cells;
  assert.deepEqual(inside.map((c) => [c.z, c.material, c.selfSupport]), [[4, 'mat_air', false], [5, 'mat_limestone', true], [6, 'mat_limestone', true], [7, 'mat_air', false]]);
  // 区格 (0,0) 以外（x = 100 属区格 (1,0)，其模板同为 land，但它有自己的区格种子与中心）：格块只落本区格内，(99,0) 有、(100,0) 的块来自 (1,0) 自己的命中。
  const edge99 = CELLS(e, { x0: 99, y0: 0, z0: 5, x1: 99, y1: 0, z1: 5 }).cells[0];
  assert.equal(edge99.material, 'mat_limestone');
  // 千分数 0：没有格块。
  const e0 = world(WORLD(), { templates: TEMPLATES({ gtpl_land: noBlock }) });
  assert.equal(CELLS(e0, { x0: 0, y0: 0, z0: 5, x1: 0, y1: 0, z1: 5 }).cells[0].material, 'mat_air');
});

test('高度未知：控制点（loc_b）海拔未知时，最近控制点里有它的区格与列整体未知——区格的地表、坡度、地形类为 null，细格 known 为 false、内容全 null，不借别的值也不抛错', () => {
  // 行上没有 anchorElevationM（真实旧数据的状态；place.anchorElevationM 登在未建列里缺值放行，保留这条登记）。
  const spec = WORLD();
  delete spec.rows.loc_b.anchorElevationM;
  const e = world(spec, { keepUnbuilt: true });
  const r = REGION(e, 0, 0); // (0,0) 的最近控制点是 a 与 b（K = 4 > 2），b 未知 → 未知
  assert.equal(r.surfaceStorey, null);
  assert.equal(r.surfaceHeightM, null);
  assert.equal(r.slope, null);
  assert.equal(r.cellClass, null);
  const cells = CELLS(e, { x0: 50, y0: 50, z0: 0, x1: 50, y1: 50, z1: 1 }).cells;
  assert.deepEqual(cells.map((c) => [c.known, c.material, c.standable]), [[false, null, null], [false, null, null]]);
  // 恰在有值控制点上的区格（(0,1) 中心在 loc_a 上，取该点值 0），其本身已知；但它的框内邻格 (1,1)（loc_b 未知）的高度未知，
  // 坡度要最大高差，最大者未知 → 坡度未知（卷二 §1.12 往下传，M3），地形类跟着未知，细格整列 known 为 false，gridView 不抛 E-GRID-CELL-NO-TERRAIN。
  const a = REGION(e, 0, 1);
  assert.equal(a.surfaceHeightM, 0);
  assert.equal(a.slope, null);
  assert.equal(a.cellClass, null);
  assert.deepEqual(CELLS(e, { x0: 50, y0: 150, z0: 0, x1: 50, y1: 150, z1: 0 }).cells.map((c) => c.known), [false]);
});

test('水体足迹里的区格（waterKind 非空）：地表以上的水层要读水体账户，代码里还没有——返回未知，不报成干地可立足；地表层及以下照常（M4）', () => {
  const e = world(WORLD({ b: { waterKind: 'water_test_fresh' } }));
  // loc_b 占区格 (1,1)，中心列 (150,150)：地表高 30 m、地表层 10（取该点海拔）。
  const col = CELLS(e, { x0: 150, y0: 150, z0: 8, x1: 150, y1: 150, z1: 12 }).cells;
  const at = (z) => col.find((c) => c.z === z);
  assert.deepEqual([8, 9, 10].map((z) => at(z).known), [true, true, true]);
  assert.equal(at(10).state, 'solid'); // 地表层是模板地表料
  assert.deepEqual([11, 12].map((z) => [at(z).known, at(z).material, at(z).standable, at(z).blocksSky]), [[false, null, null, null], [false, null, null, null]]);
  // 地表层及以下格的遮天取决于头顶（含未读的冰）：地表以下的格头顶有实心地表料，已确定遮天为真，保持为真；地表层本身头顶只有未读的水层 → 未知。
  assert.equal(at(9).blocksSky, true);
  assert.equal(at(10).blocksSky, null);
  // 不在水体足迹里的区格（loc_a 的 (0,1)）不受影响：地表之上是空气。
  assert.equal(CELLS(e, { x0: 50, y0: 150, z0: 1, x1: 50, y1: 150, z1: 1 }).cells[0].material, 'mat_air');
});

// ---------- 纯读、确定、不存数量（#13、#14、#15） ----------

test('gridView 纯读：读前后状态原样；同一区格不同读序、重复读结果逐位相同；返回结构里没有余额、件数、千克数这类数量字段（S5-8）', () => {
  const e = world(WORLD({ edges: [edge('loc_a', 'loc_b')] }));
  const before = JSON.stringify(S);
  const first = CELLS(e, { x0: 10, y0: 140, z0: -1, x1: 40, y1: 160, z1: 4 });
  const reg1 = REGION(e, 0, 1);
  // 另读别处、再读同一范围（不同读序）：结果逐位相同。
  CELLS(e, { x0: 120, y0: 10, z0: 0, x1: 130, y1: 20, z1: 6 });
  REGION(e, 1, 0);
  assert.deepEqual(CELLS(e, { x0: 10, y0: 140, z0: -1, x1: 40, y1: 160, z1: 4 }), first);
  assert.deepEqual(REGION(e, 0, 1), reg1);
  assert.equal(JSON.stringify(S), before);
  // 重载同一世界（缓存从空重建）：同一区间逐格相同。
  const again = world(WORLD({ edges: [edge('loc_a', 'loc_b')] }));
  assert.deepEqual(CELLS(again, { x0: 10, y0: 140, z0: -1, x1: 40, y1: 160, z1: 4 }), first);
  // 结构：区格与细格的键集固定，没有数量类键。
  assert.deepEqual(Object.keys(reg1).sort(), ['cellClass', 'genTemplate', 'inSettlement', 'onRoad', 'owner', 'region', 'slope', 'surfaceHeightM', 'surfaceStorey', 'w']);
  assert.deepEqual(Object.keys(first.cells[0]).sort(), ['bearsLoad', 'blocksSky', 'ceiling', 'fixture', 'kind', 'known', 'mark', 'material', 'selfSupport', 'standable', 'state', 'x', 'y', 'z', 'zone']);
  const quantity = /balance|qty|quantity|count|kg|余额|件数|千克/i;
  for (const k of [...Object.keys(reg1), ...Object.keys(first.cells[0])]) assert.ok(!quantity.test(k), k);
  assert.equal(first.cells[0].zone, 'loc_a'); // 所属地点（(10,140) 在区格 (0,1)）：本卡只有区域足迹（建筑、房间、体积随 G7、G8）
  assert.equal(zoneAt(e, S, { w: 0, x: 50, y: 150, z: 0, coarse: false }), 'loc_a');
});

test('换种子换起伏：reliefM 大于 0 的地形上列地表随世界种子变，同种子逐位相同；控制点处的列等于该点海拔不受起伏影响（卷五 :656 取该点的值）', () => {
  const rough = TERRAINS.find((t) => VOCAB.families.terrain.entries[t].reliefM > 0);
  assert.ok(rough, 'a terrain with relief');
  const mk = (seed) => { const e = world({ ...WORLD(), rows: { loc_root: ROOT_ROW({ terrain: rough }), loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000, terrain: rough }), loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000, anchorElevationM: 30, terrain: rough }) } }); return { ...e, template: { seed } }; };
  const range = { x0: 60, y0: 160, z0: -400, x1: 70, y1: 165, z1: 400 };
  const surfaces = (e) => CELLS(e, range).cells.filter((c) => c.material !== null && c.state === 'solid').reduce((m, c) => { const k = `${c.x},${c.y}`; m[k] = m[k] === undefined || c.z > m[k] ? c.z : m[k]; return m; }, {});
  const s1 = surfaces(mk('seed_one'));
  assert.deepEqual(surfaces(mk('seed_one')), s1);
  assert.notDeepEqual(surfaces(mk('seed_two')), s1);
});

// ---------- 加载期校验：gentemplate 族与 cellclass.genTemplate（#6） ----------

test('加载期：cellclass 缺 genTemplate 或指向不存在的模板、模板引用不存在的材料、soilLayers 或格块越域，都使世界加载失败（E-DIM-REF-MISSING / E-DIM-DOMAIN-RANGE）；数据给全则过', () => {
  const codes = (r) => r.errors.map((x) => x.code);
  assert.equal(load({ ...WORLD() }).ok, true);
  const noRef = CELLCLASS(); delete noRef.cellclass_land.genTemplate;
  assert.ok(codes(load({ ...WORLD(), cellclass: noRef })).includes('E-DIM-REF-MISSING'));
  assert.ok(codes(load({ ...WORLD(), cellclass: CELLCLASS({ cellclass_land: { ...CELLCLASS().cellclass_land, genTemplate: 'gtpl_none' } }) })).includes('E-DIM-REF-MISSING'));
  assert.ok(codes(load({ ...WORLD(), templates: TEMPLATES({ gtpl_land: { ...TEMPLATES().gtpl_land, surfaceMaterial: 'mat_no_such' } }) })).includes('E-DIM-REF-MISSING'));
  assert.ok(codes(load({ ...WORLD(), templates: TEMPLATES({ gtpl_land: { ...TEMPLATES().gtpl_land, soilLayers: -1 } }) })).includes('E-DIM-DOMAIN-RANGE'));
  // 空气是一行材料：模板缺 airMaterial 或指向不存在的材料行，加载失败。
  assert.ok(codes(load({ ...WORLD(), templates: TEMPLATES({ gtpl_land: { ...TEMPLATES().gtpl_land, airMaterial: undefined } }) })).includes('E-DIM-REF-MISSING'));
  assert.ok(codes(load({ ...WORLD(), templates: TEMPLATES({ gtpl_land: { ...TEMPLATES().gtpl_land, airMaterial: 'mat_no_such' } }) })).includes('E-DIM-REF-MISSING'));
  const badBlock = { ...TEMPLATES().gtpl_land, blocks: [{ material: 'mat_soil', selfSupport: true, liftLayers: 0, thickLayers: 0, radiusCells: 1, permille: 500 }] };
  assert.ok(codes(load({ ...WORLD(), templates: TEMPLATES({ gtpl_land: badBlock }) })).includes('E-DIM-DOMAIN-RANGE'));
});

test('扩展性（A5-3.3）：只加数据——新增一条 cellclass 与它的 gentemplate，条件成立的区格自动改用它，不改代码', () => {
  const extra = { cellclass_flat: { ...ANY, slopeRange: [0, 0.05], priority: 9, genTemplate: 'gtpl_flat' } };
  const e = world(WORLD(), { cellclass: CELLCLASS(extra), templates: TEMPLATES({ gtpl_flat: { surfaceMaterial: 'mat_limestone', soilLayers: 0, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } }) });
  // 本世界没有坡度 ≤ 0.05 的区格（最小 0.1）：无区格改用；把条件放宽成 [0, 0.15]，(0,0) 的坡度 0.1 命中，其细格地表即新模板地表料。
  assert.equal(REGION(e, 0, 0).cellClass, 'cellclass_land');
  const e2 = world(WORLD(), { cellclass: CELLCLASS({ cellclass_flat: { ...extra.cellclass_flat, slopeRange: [0, 0.15] } }), templates: TEMPLATES({ gtpl_flat: { surfaceMaterial: 'mat_limestone', soilLayers: 0, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } }) });
  assert.equal(REGION(e2, 0, 0).cellClass, 'cellclass_flat');
  assert.equal(CELLS(e2, { x0: 50, y0: 50, z0: 3, x1: 50, y1: 50, z1: 3 }).cells[0].material, 'mat_limestone');
});
