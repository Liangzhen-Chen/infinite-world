// 卷十 R10-7.11（落位）、R10-3.12（手写建筑缺 anchor、facing 由站点面积阶段补写）、R10-7.5（站点面积阶段试排）：站点面积阶段接真实的足迹划分（经卷五 planFootprints）与真实的落位，
// 不手造足迹。前提在测试里造：真实维度表目录拷到临时目录，写一个 6×1 区格的格空间（层根 loc_root）、存量单元 loc_tr 目标 5 格、站点 loc_site（种子 (250, 50) → 区格 (2,0)）、
// 两栋手写建筑（形制 bldform_river_house，平面 12 × 12、一层、墙厚 0.4）。区格边 100 m（每区格 100 × 100 细格）、gapCells 2、细格 1 m；控制海拔全取 46 m，地形 terrain_plain（起伏 reliefM 0.5）。
// 手算：占地 2 × 144 = 288 m² → N = ceil(288 ÷ (0.4 × 10,000)) = 1，站点足迹 = 区格 (2,0)，细格 x 200..299、y 0..99；纬度 37.738 + 50 ÷ 111120 ≥ 0 → 朝向 4（面向赤道），外包 {−11, 0, 0, 11}。
// 地表层号：控制面恒 46，起伏幅度 ≤ 0.5 × (1 + 0.5 + 0.25 + 0.125) = 0.94 → 地表高 ∈ [45.06, 46.94] → floor(h ÷ 3) = 15。
// 无障碍：外扩 2 须 x0 ≥ 202、y0 ≥ 2 → 矩形 [202..213]×[2..13]，锚点 (202 + 11, 2 − 0) = (213, 2)。
// 有障碍：作者把 bld_2 写在锚点 (213, 13)、朝向 0（外包 {0, −11, 11, 0} → 矩形 [213..224]×[2..13]）：行 y=2 上 x0 = 202..226 外扩 2 后都与它相交（须 x0 > 224 + 2 = 226），
// 第一个可放的是 x0 = 227：矩形 [227..238]×[2..13]，锚点 (227 + 11, 2) = (238, 2)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const text = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(text('place.json'));
const VOCAB = JSON.parse(text('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);
const GEN_TEMPLATE = { gtpl_test: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const CELLCLASS = { cellclass_land: { terrains: TERRAINS, waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' } };
const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test', waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const house = (extra = {}) => row('loc_site', { classes: ['comp_facility'], form: 'bldform_river_house', planCells: { widthCells: 12, depthCells: 12 }, storeys: 1, wallThicknessM: 0.4, ...extra });

// 不校验整体（作者行缺必填的 anchor、facing 正是本阶段要补的，同转换脚本的读法）：只要读得出表、词表与规则。
function loadFixture(buildings, siteExtra = {}) {
  const tmp = testTempRoot('gen-layout-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, text(f));
    const rows = {
      loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_plain', coord: { x: 300, y: 50 }, anchorElevationM: 46 }),
      loc_tr: row('loc_root', { classes: ['comp_tract'], terrain: 'terrain_plain', coord: { x: 50, y: 50 }, targetAreaM2: 50000, anchorElevationM: 46 }),
      loc_site: row('loc_tr', { terrain: 'terrain_plain', coord: { x: 250, y: 50 }, anchorElevationM: 46, ...siteExtra }),
      ...buildings,
    };
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 6, cellsY: 1 }, root: 'loc_root' }] }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(text('item.json')), rows: {} }));
    const unbuilt = JSON.parse(text('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = GEN_TEMPLATE;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}
const fill = (buildings, seed = 'seed_layout', siteExtra = {}) => generateFill(loadFixture(buildings, siteExtra), { worldSeed: seed, genesisMinute: 0, geo: { authored: new Map(), downhill: [], buildingIds: [] } });
const layoutGaps = (r) => r.deferred.filter((d) => /^(layout_|anchor_z_|facing_)/.test(d.reason));

test('真划分上的落位：缺 anchor、facing 的手写建筑由站点面积阶段排出来：锚点 (213, 2)、朝向 4、层号 15，格空间序号 0，写成 generated 偏离行（来源 gstage_siteform）；站点写 1 格 = 10,000 m²', () => {
  const r = fill({ bld_1: house() });
  assert.deepEqual(r.generated.bld_1.anchor, { w: 0, x: 213, y: 2, z: 15, coarse: false });
  assert.equal(r.generated.bld_1.facing, 4);
  assert.equal(r.generated.bld_1.generated.by, 'gstage_siteform');
  assert.equal(r.generated.loc_site.targetAreaM2, 10000);
  assert.deepEqual(layoutGaps(r), []);
});

test('真划分上的落位：作者写了 anchor、facing 的建筑不动（无偏离行）并作障碍：bld_1 绕到 x0 = 227，锚点 (238, 2)', () => {
  const r = fill({ bld_1: house(), bld_2: house({ anchor: { w: 0, x: 213, y: 13, z: 15, coarse: false }, facing: 0 }) });
  assert.equal(Object.hasOwn(r.generated, 'bld_2'), false);
  assert.deepEqual(r.generated.bld_1.anchor, { w: 0, x: 238, y: 2, z: 15, coarse: false });
  assert.equal(r.generated.bld_1.facing, 4);
  assert.equal(r.generated.loc_site.targetAreaM2, 10000);
});

test('落位读地表层号要全部控制海拔：站点面积阶段排在自然量、次序投影之后；站点作者没写海拔（由自然量阶段补出）时 z 照样读得到，不记 anchor_z_unknown', () => {
  const r = fill({ bld_1: house() }, 'seed_layout', { anchorElevationM: undefined });
  const order = r.plan.map((s) => s.stage);
  assert.ok(order.indexOf('gstage_fields') < order.indexOf('gstage_order') && order.indexOf('gstage_order') < order.indexOf('gstage_siteform'));
  assert.equal(typeof r.generated.loc_site.anchorElevationM, 'number'); // 自然量阶段补的
  assert.ok(Number.isInteger(r.generated.bld_1.anchor.z));
  assert.deepEqual(layoutGaps(r), []);
});

test('真划分上的落位：站点一路往上没有存量单元（真实世界现状，李白 11-23 da3cd65a 甲的临时退路）：N 加一上界退回父行足迹格数，建筑照常排位，结果同挂存量单元之下：锚点 (213, 2)、层 15', () => {
  const r = fill({ bld_1: house() }, 'seed_layout', { parent: 'loc_root' });
  assert.deepEqual(r.generated.bld_1.anchor, { w: 0, x: 213, y: 2, z: 15, coarse: false });
  assert.equal(r.generated.bld_1.facing, 4);
  assert.deepEqual(layoutGaps(r), []);
});

test('真划分上的落位：同种子同结果（整个返回值逐项相同）', () => {
  const buildings = { bld_1: house(), bld_2: house({ facing: 2 }) };
  assert.equal(JSON.stringify(fill(buildings)), JSON.stringify(fill(buildings)));
});
