// 卷十 R10-1.14（事务内经卷五 planFootprints 读尚未落盘的行提案的足迹与派生量）+ R10-2.12（水体）：水体阶段接真实的足迹派生，不再手造足迹。
// 前提在测试里造：真实维度表目录拷到临时目录，写一个 4×1 区格的格空间（层根 loc_root）、两块存量单元 loc_t1、loc_t2，水体行作为作者输入（转换前不在表里）交入。
// 手算（区格边长 100 m，一格 10⁴ m²）：loc_t1 目标 1 格、种子 (50,50) → 区格 (0,0)；loc_t2 目标 1 格、种子 (150,50) → 区格 (1,0)；
// 水体 loc_wa 目标 2 格、种子 (350,50) → 区格 (3,0) 加上唯一剩下的 (2,0)。控制海拔 loc_t1 50、loc_t2 30、loc_wa 0：区格 (0,0)、(1,0)、(3,0) 恰在各自控制点上取点值，
// 区格 (2,0) 介于 loc_t2 与 loc_wa 之间——所以 loc_wa 的代表海拔严格低于 loc_t2、loc_t2 低于 loc_t1：排水 loc_t1 → loc_t2 → loc_wa。
// 期望：surfaceM2 = 2 × 10⁴ = 20000；catchmentM2 = loc_t1 10000 + loc_t2 10000 + loc_wa 20000 = 40000；downstream 空；capacityM3 = floor(20000 × 水深)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { drawByKey } from '../../server-plugin/kernel/sample.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const text = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = (({ rows, edges, gridSpaces, generated, ...head }) => ({ ...head, generated: {} }))(JSON.parse(text('place.json'))); // 只取表头：真实世界的行、边、格空间表、generated 节不进夹具（generated 留空对象）
const VOCAB = JSON.parse(text('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);
const GEN_TEMPLATE = { gtpl_test: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const CELLCLASS = {
  cellclass_land: { terrains: TERRAINS, waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
  cellclass_water: { terrains: TERRAINS, waterAny: ['water_river'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
};
const row = (parent, extra = {}) => ({
  parent, skyExposure: 1, ledgerHolder: false, basis: 'test', waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const region = (parent, x, y, extra = {}) => row(parent, { classes: ['comp_tract'], terrain: 'terrain_river', coord: { x, y }, ...extra });

function loadGrid() {
  const tmp = testTempRoot('gen-grid-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, text(f));
    const rows = {
      loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 200, y: 50 }, anchorElevationM: 100 }),
      loc_t1: region('loc_root', 50, 50, { targetAreaM2: 10000, anchorElevationM: 50 }),
      loc_t2: region('loc_root', 150, 50, { targetAreaM2: 10000, anchorElevationM: 30 }),
    };
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 4, cellsY: 1 }, root: 'loc_root' }] }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(text('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(text('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    const unbuilt = JSON.parse(text('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = GEN_TEMPLATE;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

test('水体阶段经 planFootprints 读足迹：surfaceM2 = 足迹面积、catchmentM2 沿排水去处累加、capacityM3 = 面积 × 水深（立方米，手算）', () => {
  const world = loadGrid();
  assert.equal(world.ok, true, world.text);
  const authored = new Map([['loc_wa', {
    parent: 'loc_root', classes: ['comp_tract', 'comp_waterbody'], waterKind: 'water_river', liquid: 'mat_water', downstream: null,
    terrain: 'terrain_river', coord: { x: 350, y: 50 }, targetAreaM2: 20000, anchorElevationM: 0, forestCover: 0,
  }]]);
  const r = generateFill(world, { worldSeed: 'seed_one', genesisMinute: 0, geo: { authored, downhill: [], buildingIds: [] } });
  // 开局政体阶段（gstage_polity，前置卡 A）已登记，真实世界缺落位文化等输入时它整段进 deferred（卷十缺输入口径）；本用例只核水体阶段无缺口。
  assert.deepEqual(r.deferred.filter((d) => d.stage !== 'gstage_polity'), []);
  const wa = r.pending.find((p) => p.id === 'loc_wa');
  const rule = world.rules.gen.waterRows[0];
  const d4 = Math.round(drawByKey('seed_one', 'gen_water', 'loc_wa', 0, 'site_gen_water_depth', rule.depthM) * 10000);
  // 立方米 = 面积 × 水深 = 20000 × (d4 ÷ 10000) = 20000 × d4 ÷ 10000 = 2 × d4，向下取整（勘误 1123k53，P10-4）。
  assert.equal(wa.dims.surfaceM2, 20000);
  assert.equal(wa.dims.catchmentM2, 40000);
  assert.equal(wa.dims.capacityM3, Math.floor((20000 * d4) / 10000));
  assert.equal('downstream' in wa.dims, false, 'downstream 作者已写（空），不补');
  // 这条河（flowing 真）作者没写 boundary：水体足迹补缺阶段（卷十 R10-2.17，排在自然量之前）先给它补出窄带，同一行后被自然量阶段补 runoffCoef，来源记先写的阶段（R10-1.2）。
  // 手算（r 的搜索）：种子区格 (3,0)、下游空、目标 20000 m2 = 2 个区格；r=0 一格、r=1 取 (2,0)(3,0) 共两格（(4,0) 出父足迹）、r=2 三格超目标，停在 r=1——
  // 窄带恰两格，所以上面 surfaceM2、catchmentM2、capacityM3 的手算数不变。
  assert.equal(wa.by, 'gstage_waterfoot');
  assert.ok(wa.dims.runoffCoef >= 0 && wa.dims.runoffCoef <= 1);
});
