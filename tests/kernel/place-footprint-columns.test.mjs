// 夹具照 place-footprint.test.mjs（原样复制开头至 world(spec) 函数结束；本文件只测足迹输入列与格空间表的特殊值，不碰其加载正例）。
// 卡：格子迁移 G3 足迹输入列特殊值。卷五 §2.1 :96–:105 取值域、§4.1.1 :422 格空间表、§4.1.3 规则 10 :486–:489。
// 0、负数、空、null、缺字段、越界、空列表：每种都必须被拒绝（或按卷文明确放行），不许有绕过口子。只跑不推进世界的小检查（本机 F 盘）。
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
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    // 真实世界为旧数据没有的列登记了未建（缺值放行）；本文件的用例要核"缺必填即报错"，前提自己造：拷贝里去掉 place 的未建列登记。
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = cellclass === null ? {} : cellclass;
    v.families.gentemplate.entries = GEN_TEMPLATE;
    v.families.bform.entries = { bldform_test: { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, rooms: [], facilityTypes: ['fac_house'] }, bldform_shrine: v.families.bform.entries.bldform_shrine };
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

// ---------- 特殊值用例的驱动（每条用例单一：一条拒收或一条放行） ----------

function mustReject(name, mutate, wantCodes) {
  const g = GRID4();
  mutate(g);
  const r = load(g);
  assert.equal(r.ok, false, `${name}: load accepted`);
  assert.ok(wantCodes.some((c) => has(r, c)), `${name}: want ${wantCodes.join(' or ')}, got [${codes(r).join(', ')}] — ${r.text}`);
}

function mustPass(name, mutate) {
  const g = GRID4();
  mutate(g);
  const r = load(g);
  assert.equal(r.ok, true, `${name}: ${r.text}`);
}

// ---------- 区域足迹输入列（卷五 §2.1 :96–:105） ----------

test('区域足迹 targetAreaM2 取值域 [1,null]：0、负数、小数、null 拒收；1 放行', () => {
  const cases = [
    ['targetAreaM2=0', 0, 'E-DIM-DOMAIN-RANGE'],
    ['targetAreaM2=-5', -5, 'E-DIM-DOMAIN-RANGE'],
    ['targetAreaM2=0.5', 0.5, 'E-DIM-DOMAIN-RANGE'],
    ['targetAreaM2=null', null, 'E-DIM-DOMAIN-RANGE'],
  ];
  for (const [name, v, code] of cases) mustReject(name, (g) => { g.rows.loc_a.targetAreaM2 = v; }, [code]);
  mustPass('targetAreaM2=1（最小合法值）', (g) => { g.rows.loc_a.targetAreaM2 = 1; });
});

test('区域足迹 anchorElevationM 取值域 [-12000, 9000]：越界与 null 拒收；两端点放行', () => {
  for (const v of [-12001, 9001, null]) mustReject(`anchorElevationM=${v}`, (g) => { g.rows.loc_a.anchorElevationM = v; }, ['E-DIM-DOMAIN-RANGE']);
  for (const v of [-12000, 9000]) mustPass(`anchorElevationM=${v}（端点）`, (g) => { g.rows.loc_a.anchorElevationM = v; });
});

test('区域足迹 coord：缺 y、空对象报 E-DIM-STRUCT-FIELD；null 报 E-DIM-DOMAIN-RANGE', () => {
  const cases = [
    ['coord={x:1}（缺 y）', { x: 1 }, 'E-DIM-STRUCT-FIELD'],
    ['coord={}（空）', {}, 'E-DIM-STRUCT-FIELD'],
    ['coord=null', null, 'E-DIM-DOMAIN-RANGE'],
  ];
  for (const [name, v, code] of cases) mustReject(name, (g) => { g.rows.loc_a.coord = v; }, [code]);
});

test('区域足迹 boundary：空列表放行；缺 y、非整数、外包框外、不四邻连通各自拒收', () => {
  mustPass('boundary=[]（没有作者覆盖，按派生划分）', (g) => { g.rows.loc_a.boundary = []; });
  const cases = [
    ['boundary=[{x:0}]（缺 y）', [{ x: 0 }], 'E-DIM-STRUCT-FIELD'],
    ['boundary=[{x:0.5,y:0}]（非整数）', [{ x: 0.5, y: 0 }], 'E-DIM-DOMAIN-RANGE'],
    ['boundary=[{x:9,y:9}]（在 4×4 外包框之外）', [{ x: 9, y: 9 }], 'E-GRID-FOOTPRINT-OUTSIDE-PARENT'],
    ['boundary=[{x:0,y:0},{x:3,y:3}]（两格不四邻连通）', [{ x: 0, y: 0 }, { x: 3, y: 3 }], 'E-DIM-DOMAIN-RANGE'],
  ];
  for (const [name, v, code] of cases) mustReject(name, (g) => { g.rows.loc_a.boundary = v; }, [code]);
});

// ---------- 体积足迹行（卷五 §2.1 :97、:101、:102） ----------

// 体积行必填列含 mouth（卷五 §2.1 :102，封卷后勘误 1121k3；G8 登记维度）：夹具补 mouth: false，值与本测试无关。
const volRow = (extra = {}) => row('loc_a', { classes: ['comp_volume'], terrain: 'terrain_cave', anchorElevationM: -30, spanZ: 2, targetAreaM2: 500, mouth: false, ...extra });

test('体积足迹 spanZ 取值域 [1,null]、targetAreaM2 取值域 [1,null]：0、小数、null 拒收；完整合法值放行', () => {
  mustPass('体积足迹完整合法值', (g) => { g.rows.loc_v = volRow(); });
  const cases = [
    ['spanZ=0', { spanZ: 0 }, 'E-DIM-DOMAIN-RANGE'],
    ['spanZ=1.5', { spanZ: 1.5 }, 'E-DIM-DOMAIN-RANGE'],
    ['spanZ=null', { spanZ: null }, 'E-DIM-DOMAIN-RANGE'],
    ['targetAreaM2=0', { targetAreaM2: 0 }, 'E-DIM-DOMAIN-RANGE'],
  ];
  for (const [name, extra, code] of cases) mustReject(name, (g) => { g.rows.loc_v = volRow(extra); }, [code]);
});

// ---------- 建筑足迹行（卷五 §2.1 :99、:100） ----------

// 挂 comp_facility 的行另须带卷十九 §2.1 的必填列（G7 第一步登记）：形制、外包宽深、层数、完好度、破口列表。
const BLD_COLUMNS = { form: 'bldform_test', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 } };
const bldRow = (extra = {}) => row('loc_a', { classes: ['comp_facility'], anchor: { w: 0, x: 10, y: 10, z: 0, coarse: false }, facing: 2, ...BLD_COLUMNS, ...extra });

test('建筑足迹 facing 取值域 [0,7]：越界、负数、小数、null 拒收；anchor 缺 coarse、anchor 为 null 拒收；完整合法值放行', () => {
  mustPass('建筑足迹完整合法值', (g) => { g.rows.loc_h = bldRow(); });
  for (const v of [8, -1, 1.5, null]) mustReject(`facing=${v}`, (g) => { g.rows.loc_h = bldRow({ facing: v }); }, ['E-DIM-DOMAIN-RANGE']);
  mustReject('anchor 缺 coarse', (g) => { g.rows.loc_h = bldRow({ anchor: { w: 0, x: 10, y: 10, z: 0 } }); }, ['E-DIM-STRUCT-FIELD', 'E-DIM-DOMAIN-RANGE']);
  mustReject('anchor=null', (g) => { g.rows.loc_h = bldRow({ anchor: null }); }, ['E-DIM-DOMAIN-RANGE', 'E-DIM-STRUCT-FIELD']);
});

// ---------- 格空间表（卷五 §4.1.1 :422；§4.1.3 规则 10 :486–:489） ----------

test('格空间表：w 负数、外包框边长为 0 或小数、box 缺 y0、缺 root、root 不存在、root 为 null、整张表空列表，各自拒收', () => {
  const box = () => ({ ...BOX4.box });
  const withBox = (patch) => (g) => { g.spaces = [{ ...BOX4, box: { ...box(), ...patch } }]; };
  mustReject('w=-1', (g) => { g.spaces = [{ ...BOX4, w: -1 }]; }, ['E-DIM-DOMAIN-RANGE']);
  mustReject('box.cellsX=0', withBox({ cellsX: 0 }), ['E-DIM-DOMAIN-RANGE']);
  mustReject('box.cellsX=1.5', withBox({ cellsX: 1.5 }), ['E-DIM-DOMAIN-RANGE']);
  mustReject('box.cellsY=0', withBox({ cellsY: 0 }), ['E-DIM-DOMAIN-RANGE']);
  mustReject('box 缺 y0', (g) => { const b = box(); delete b.y0; g.spaces = [{ ...BOX4, box: b }]; }, ['E-DIM-STRUCT-FIELD']);
  mustReject('缺 root', (g) => { g.spaces = [{ w: 0, box: box() }]; }, ['E-DIM-STRUCT-FIELD']);
  mustReject('root=loc_zz（不存在的地点）', (g) => { g.spaces = [{ ...BOX4, root: 'loc_zz' }]; }, ['E-DIM-REF-MISSING']);
  mustReject('root=null', (g) => { g.spaces = [{ ...BOX4, root: null }]; }, ['E-DIM-DOMAIN-RANGE']);
  mustReject('整张表是空列表（层根与主世界根都没有格空间）', (g) => { g.spaces = []; }, ['E-DIM-REF-MISSING']);
});
