// 卷十 R10-2.17（水体足迹输入的补缺与河道窄带，封卷后勘误 1121k16）、R10-1.7（手写优先、生成补缺）、A10-2.4 ③④：水体足迹补缺阶段 gstage_waterfoot（kernel/gen/waterfoot.mjs）经 generateFill 的行为测试。
// 前提在测试里造：真实维度表目录拷到临时目录，写一个 10×5 区格的格空间（层根 loc_root）、两块存量单元 loc_t1（种子 (50,50)→区格 (0,0)）、loc_t2（种子 (150,50)→区格 (1,0)，各 1 格），
// 水体行作为作者输入（转换前不在表里）交入；区格边长 100 m、一格 10⁴ m²。
// 手算（河沿下游链连成窄带，卷十 R10-2.17 流水条）：
//   ① 静水 loc_lake（缺 coord、targetAreaM2）：种子取父足迹区格里扣去同父兄弟种子格 (0,0)、(1,0) 后按 (x, y) 字典序的第 floor(均匀 [0, 48)) 个（抽取点 site_gen_water_seed，对象本行 id），
//      目标面积 = max(10⁴, floor(父面积 5×10⁵ × 抽得的份额))（抽取点 site_gen_water_area）；期望按同一公式在测试里独立重算。
//   ② 河 loc_riv 种子 (2,2)、下游湖 loc_lake_d 种子 (8,2)、作者写目标 3 格：中心线 (2,2)…(7,2) 六格，r=0 已超出目标也取 0 → 窄带恰为中心线六格，表序自西向东。
//   ③ 主河 loc_main 同样种子 (2,2)、下游 loc_lake_d、目标 19 格：r=0 为 6 格、r=1 为 7+6+6=19 格（y=2 一行 x 从 1 到 7，(8,2) 是湖种子不入；y=1、y=3 各 x 从 2 到 7）、r=2 为 34 格超目标 → r=1 共 19 格；
//      支流 loc_trib 种子 (5,0)，下游主河：主河窄带含 (5,1) 与种子四邻相接 → 中心线只有 (5,0)，半宽取抽到的整数（site_gen_water_width），带里不含主河、湖已占的格。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { generateFill } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { planFootprints } from '../../server-plugin/kernel/place.mjs';
import { drawByKey } from '../../server-plugin/kernel/sample.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { ROOT, testTempRoot, writeUnderTempRoot } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const DIMS = 'world/ontology/dimensions';
const text = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(text('place.json'));
const VOCAB = JSON.parse(text('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);
const GEN_TEMPLATE = { gtpl_test: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const CELLCLASS = {
  cellclass_land: { terrains: TERRAINS, waterAny: [], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
  cellclass_water: { terrains: TERRAINS, waterAny: ['water_river', 'water_sea', 'water_navigable'], slopeRange: [0, 1], onRoad: null, inSettlement: null, priority: 1, genTemplate: 'gtpl_test' },
};
const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test', waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const region = (parent, x, y, extra = {}) => row(parent, { classes: ['comp_tract'], terrain: 'terrain_river', coord: { x, y }, ...extra });

function loadGrid() {
  const tmp = testTempRoot('gen-wfoot-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, text(f));
    const rows = {
      loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 500, y: 250 }, anchorElevationM: 100 }),
      loc_t1: region('loc_root', 50, 50, { targetAreaM2: 10000, anchorElevationM: 50 }),
      loc_t2: region('loc_root', 150, 50, { targetAreaM2: 10000, anchorElevationM: 30 }),
    };
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: [{ w: 0, box: { x0: 0, y0: 0, cellsX: 10, cellsY: 5 }, root: 'loc_root' }] }));
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

const world = loadGrid();
assert.equal(world.ok, true, world.text);
const SEED = 'seed_one';
const water = (kind, extra = {}) => ({ parent: 'loc_root', classes: ['comp_tract', 'comp_waterbody'], waterKind: kind, liquid: 'mat_water', downstream: null, terrain: 'terrain_river', ...extra });
const run = (entries, seed = SEED) => generateFill(world, { worldSeed: seed, genesisMinute: 0, geo: { authored: new Map(entries), downhill: [], buildingIds: [] } });
const pendingOf = (r, id) => r.pending.find((p) => p.id === id);
const at = (x, y) => ({ x, y });
const key = (c) => `${c.x},${c.y}`;
const cellOfCoord = (c) => at(Math.floor(c.x / 100), Math.floor(c.y / 100));
const RULES = world.rules.gen;
const fillRule = (kind) => RULES.waterFillRows.find((r) => r.whenRX === `waterKind == ${kind}`);
// 四邻前缀连通。
const prefixConnected = (cells) => cells.every((c, i) => i === 0 || cells.slice(0, i).some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1));

test('静水缺 coord 与 targetAreaM2：补种子区格（父足迹区格按 (x, y) 字典序、扣去兄弟种子格后取第 floor(均匀) 个）与目标面积；写成待转换提案 by gstage_waterfoot；同种子可复现', () => {
  const r = run([['loc_lake', water('water_sea')]]);
  const p = pendingOf(r, 'loc_lake');
  assert.equal(p.by, 'gstage_waterfoot', '水体足迹补缺排在自然量之前，来源记先写的阶段（R10-1.2）');
  assert.match(p.seedKey, /^[0-9a-f]{64}$/);
  // 独立重算：候选 = 10×5 区格按 (x, y) 字典序，扣去兄弟种子格 (0,0)、(1,0)，共 48 个。
  const candidates = [];
  for (let x = 0; x < 10; x += 1) for (let y = 0; y < 5; y += 1) if (!(x === 0 && y === 0) && !(x === 1 && y === 0)) candidates.push(at(x, y));
  assert.equal(candidates.length, 48);
  const draw = drawByKey(SEED, 'gen_water', 'loc_lake', 0, 'site_gen_water_seed', { dist: 'uniform', min: 0, max: 48 });
  const pick = candidates[Math.floor(draw)];
  assert.deepEqual(p.dims.coord, { x: pick.x * 100 + 50, y: pick.y * 100 + 50 });
  const share = drawByKey(SEED, 'gen_water', 'loc_lake', 0, 'site_gen_water_area', fillRule('water_sea').areaShare);
  assert.equal(p.dims.targetAreaM2, Math.max(10000, Math.floor(500000 * share)));
  assert.ok(share > 0 && share <= 1 && p.dims.targetAreaM2 >= 10000);
  assert.equal(p.dims.boundary, undefined, '静水不生成窄带');
  // 同种子逐字节相同。
  assert.equal(JSON.stringify(run([['loc_lake', water('water_sea')]])), JSON.stringify(r));
});

test('手写优先：作者写了的维度一律不补（不出提案维度）；只缺一项只补那一项；boundary 非空者足迹即作者所画，coord 与窄带都不补', () => {
  const r = run([
    ['loc_both', water('water_sea', { coord: { x: 750, y: 250 }, targetAreaM2: 30000 })],
    ['loc_coord_only', water('water_sea', { coord: { x: 650, y: 350 } })],
    ['loc_drawn', water('water_river', { boundary: [at(1, 3), at(2, 3)] })],
  ]);
  const both = pendingOf(r, 'loc_both');
  assert.equal(both.dims.coord, undefined);
  assert.equal(both.dims.targetAreaM2, undefined);
  const only = pendingOf(r, 'loc_coord_only');
  assert.equal(only.dims.coord, undefined);
  assert.equal(typeof only.dims.targetAreaM2, 'number');
  const drawn = pendingOf(r, 'loc_drawn');
  assert.equal(drawn.dims.coord, undefined);
  assert.equal(drawn.dims.boundary, undefined);
  assert.equal(drawn.dims.targetAreaM2, undefined);
});

test('河沿下游链连成窄带：种子 (2,2)、下游湖种子 (8,2)、作者写目标 3 格——中心线 (2,2)…(7,2)，r=0 已超出目标也取 0，窄带即中心线六格；展开后与湖足迹四邻相接', () => {
  const entries = [
    ['loc_lake_d', water('water_sea', { coord: { x: 850, y: 250 }, targetAreaM2: 30000 })],
    ['loc_riv', water('water_river', { coord: { x: 250, y: 250 }, targetAreaM2: 30000, downstream: 'loc_lake_d' })],
  ];
  const r = run(entries);
  const riv = pendingOf(r, 'loc_riv');
  assert.deepEqual(riv.dims.boundary, [at(2, 2), at(3, 2), at(4, 2), at(5, 2), at(6, 2), at(7, 2)]);
  assert.equal(riv.dims.coord, undefined);
  assert.equal(riv.dims.targetAreaM2, undefined);
  assert.equal(pendingOf(r, 'loc_lake_d').dims.boundary, undefined, '湖是团块，不生成窄带');
  // 把补出的值交回卷五 planFootprints：河六格，与湖足迹四邻相接，且无划分错误。
  const base = {};
  for (const [id, d] of entries) base[id] = { ...d, ...(pendingOf(r, id) ? pendingOf(r, id).dims : {}) };
  base.loc_root = world.tables.get('place').flat.rows.get('loc_root');
  base.loc_t1 = world.tables.get('place').flat.rows.get('loc_t1');
  base.loc_t2 = world.tables.get('place').flat.rows.get('loc_t2');
  const fp = planFootprints({ ...world, template: { seed: SEED } }, { base, withCells: true });
  assert.deepEqual(fp.errors, []);
  assert.equal(fp.footprints.loc_riv.cellCount, 6);
  assert.ok(fp.adjacency.loc_riv.includes('loc_lake_d'));
});

test('作者写的目标面积定宽度：主河目标 19 格 → r=1 共 19 格；支流汇入主河窄带，不削平主河、窄带只取未被占的格且前缀连通、半宽取抽到的整数', () => {
  const entries = [
    ['loc_lake_d', water('water_sea', { coord: { x: 850, y: 250 }, targetAreaM2: 30000 })],
    ['loc_main', water('water_river', { coord: { x: 250, y: 250 }, targetAreaM2: 190000, downstream: 'loc_lake_d' })],
    ['loc_trib', water('water_river', { coord: { x: 550, y: 50 }, downstream: 'loc_main' })],
  ];
  const r = run(entries);
  const main = pendingOf(r, 'loc_main').dims.boundary;
  assert.equal(main.length, 19);
  // r=1：每格到中心线 (2..7, 2) 的曼哈顿距离不超过 1，且含全部中心线格、不含湖种子 (8,2)。
  for (const c of [at(2, 2), at(3, 2), at(4, 2), at(5, 2), at(6, 2), at(7, 2)]) assert.ok(main.some((m) => key(m) === key(c)));
  assert.equal(main.some((m) => key(m) === '8,2'), false);
  assert.ok(prefixConnected(main));
  const trib = pendingOf(r, 'loc_trib').dims.boundary;
  const rule = fillRule('water_river');
  const width = Math.floor(drawByKey(SEED, 'gen_water', 'loc_trib', 0, 'site_gen_water_width', rule.halfWidthCells));
  assert.ok(width >= 0);
  assert.ok(trib.some((c) => key(c) === '5,0'), '含种子区格');
  assert.deepEqual(trib[0], at(5, 0), '表序首格是中心线（种子区格）');
  const taken = new Set([...main.map(key), '8,2', '0,0', '1,0']);
  for (const c of trib) {
    assert.equal(taken.has(key(c)), false, `支流带不占主河与湖已占的格 ${key(c)}`);
    assert.ok(c.x >= 0 && c.x < 10 && c.y >= 0 && c.y < 5, '在父足迹内');
    assert.ok(Math.abs(c.x - 5) + Math.abs(c.y - 0) <= width, `到中心线距离不超过半宽 ${width}`);
  }
  assert.ok(prefixConnected(trib));
  assert.equal(new Set(trib.map(key)).size, trib.length);
  // 汇入：支流的种子 (5,0) 与主河窄带的 (5,1) 四邻相接。
  assert.ok(main.some((m) => key(m) === '5,1'));
});

test('跨父：下游目标一格都不在本行父足迹内 → E-GEN-WATER-FOOTPRINT，事由 cross_parent；作者的 parent 不改', () => {
  const entries = [
    ['loc_lake_d', water('water_sea', { coord: { x: 850, y: 250 }, targetAreaM2: 30000 })],
    ['loc_riv', water('water_river', { parent: 'loc_t1', coord: { x: 50, y: 50 }, targetAreaM2: 10000, downstream: 'loc_lake_d' })],
  ];
  assert.throws(() => run(entries), (e) => e.code === 'E-GEN-WATER-FOOTPRINT' && e.fields.reason === 'cross_parent');
});

test('没有规则行适用即 E-GEN-ROW-INVALID：水体类 water_navigable（静水）缺 targetAreaM2 而 rules.gen.water.fill.rows 没有行写它，不拿常量兜底', () => {
  assert.throws(() => run([['loc_x', water('water_navigable', { coord: { x: 650, y: 350 } })]]), (e) => e.code === 'E-GEN-ROW-INVALID');
});

test('种子无候选：父足迹 loc_t1 只有一格，第一个水体行取走它，第二个无格可取 → E-GEN-WATER-FOOTPRINT，事由 no_candidate（修改轮 M3）', () => {
  const entries = [
    ['loc_la', water('water_sea', { parent: 'loc_t1' })],
    ['loc_lb', water('water_sea', { parent: 'loc_t1' })],
  ];
  assert.throws(() => run(entries), (e) => e.code === 'E-GEN-WATER-FOOTPRINT' && e.fields.reason === 'no_candidate');
  // 只有一个时恰能取到那一格 (0,0)。
  const r = run([entries[0]]);
  assert.deepEqual(pendingOf(r, 'loc_la').dims.coord, { x: 50, y: 50 });
});

test('确定性：同种子同结果；作者输入的遍历次序打乱仍相同；换种子至少一项补出值不同', () => {
  // 两个静水行补种子；河 loc_c 作者写了 coord（区格 (4,1)）、没有下游（中心线只有种子），所以随机种子不会落在它的路上。
  const entries = [
    ['loc_a', water('water_sea')],
    ['loc_b', water('water_sea')],
    ['loc_c', water('water_river', { coord: { x: 450, y: 150 } })],
  ];
  const a = JSON.stringify(run(entries));
  assert.equal(a, JSON.stringify(run(entries)));
  assert.equal(a, JSON.stringify(run([...entries].reverse())));
  assert.notEqual(a, JSON.stringify(run(entries, 'seed_two')));
  // 两个补种子的行互不同格，也不落在河的种子格 (4,1) 上（先处理者取的种子格与同父兄弟种子格都是占用格）。
  const r = run(entries);
  const seeds = ['loc_a', 'loc_b'].map((id) => key(cellOfCoord(pendingOf(r, id).dims.coord)));
  assert.equal(new Set([...seeds, '4,1']).size, 3);
  assert.equal(pendingOf(r, 'loc_c').dims.coord, undefined, '作者写了 coord，不补');
  assert.ok(pendingOf(r, 'loc_c').dims.boundary.some((c) => key(c) === '4,1'), '河的窄带含它的种子区格');
});

test('卷五规则 10 衔接：补出的窄带交回 planFootprints 后每条河足迹恰为窄带格、无划分错误（E-GRID-WATER-BAND 不报）', () => {
  const entries = [
    ['loc_lake_d', water('water_sea', { coord: { x: 850, y: 250 }, targetAreaM2: 30000 })],
    ['loc_main', water('water_river', { coord: { x: 250, y: 250 }, targetAreaM2: 190000, downstream: 'loc_lake_d' })],
    ['loc_trib', water('water_river', { coord: { x: 550, y: 50 }, downstream: 'loc_main' })],
  ];
  const r = run(entries);
  const base = {};
  for (const [id, d] of entries) base[id] = { ...d, ...pendingOf(r, id).dims };
  for (const id of ['loc_root', 'loc_t1', 'loc_t2']) base[id] = world.tables.get('place').flat.rows.get(id);
  const fp = planFootprints({ ...world, template: { seed: SEED } }, { base, withCells: true });
  assert.deepEqual(fp.errors, []);
  assert.equal(fp.footprints.loc_main.cellCount, 19);
  assert.equal(fp.footprints.loc_trib.cellCount, pendingOf(r, 'loc_trib').dims.boundary.length);
  assert.ok(fp.adjacency.loc_trib.includes('loc_main'));
  assert.ok(fp.adjacency.loc_main.includes('loc_lake_d'));
});
