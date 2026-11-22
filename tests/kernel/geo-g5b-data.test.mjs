// 格子迁移 G5b 数据改齐（李白 11-23 裁定 A、B，附表-1122勘误）：只读 world/geo 数据，不加载真实世界（不 loadWorld；足迹划分一遍约 6 秒、数组峰值约 650 MB）。
// ① 大河改道：3 条水路边 4 个端点（河湾村、河神矶、雁渡、琥珀港）的种子区格（100 米区格）四邻里有河格、且种子格本身不是河格；
// ② 地点归属：旧地点 11 行（含河湾村）与改挂的另 5 行，种子都落在现挂的郡（或省野外）的足迹里，旧坐标没动；改挂清单钉死。
// 期望值全部按改后的数据手算成字面量（千米 × 10 = 100 米区格序号），不抄实测。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFixedConstants } from '../../server-plugin/kernel/det-math.mjs';
import { planRegionFootprints, keyOf, ownerIdAt } from '../../server-plugin/kernel/footprint.mjs';
import { convertGeo, newId } from '../../tools/convert-geo-g5b.mjs';

installFixedConstants({ BASE: 10, SCALE: 10000, PERMILLE: 1000, BPS: 10000 });
const out = convertGeo(join(dirname(fileURLToPath(import.meta.url)), '../../world/geo'));
const cellOf = (m) => Math.floor(m / 100); // 区格 100 米（rules.grid.regionCellM）

const riverCells = new Set();
for (const [id, r] of Object.entries(out.rows)) if (id.startsWith('loc_water_river_')) for (const c of r.boundary) riverCells.add(`${c.x},${c.y}`);

// 4 个端点：[id, 旧坐标（米，手算 = 千米 × 1000）, 种子区格, 手算出的一个河格邻格]
// 河湾村 (0,0) 千米 → 区格 (0,0)，河折点 (−1,8)→(−1,−5) 一列的千米格 (−1,0) = 区格 x −10…−1、y 0…9，含 (−1,0)；
// 雁渡 (0,−32) → (0,−320)，折点 (−1,−32) 的千米格含 (−1,−320)；
// 河神矶 (−1.5,−17) → (−15,−170)，折点 (−2,−18) 的千米格 y −180…−171 含 (−15,−171)；
// 琥珀港 (−10,−160) → (−100,−1600)，折点 (−10,−161) 的千米格 y −1610…−1601 含 (−100,−1601)。
const ENDPOINTS = [
  ['loc_hw', [0, 0], [0, 0], [-1, 0]],
  ['loc_yandu', [0, -32000], [0, -320], [-1, -320]],
  ['loc_site_w5_ferry_shrine', [-1500, -17000], [-15, -170], [-15, -171]],
  ['loc_far_hupo', [-10000, -160000], [-100, -1600], [-100, -1601]],
];

test('大河改道（勘误 E1）：3 条水路边的端点恰是这 4 个地点', () => {
  const water = out.edges.filter((e) => e.waterway);
  assert.deepEqual(water.map((e) => [e.from, e.to]).sort(), [['loc_far_hupo', 'loc_yandu'], ['loc_hw', 'loc_site_w5_ferry_shrine'], ['loc_hw', 'loc_yandu']]);
  assert.deepEqual([...new Set(water.flatMap((e) => [e.from, e.to]))].sort(), ENDPOINTS.map((e) => e[0]).sort());
});

for (const [id, [mx, my], [sx, sy], [rx, ry]] of ENDPOINTS) {
  test(`大河改道（勘误 E1）：${id} 的种子区格 (${sx},${sy}) 四邻有河格 (${rx},${ry})，种子格本身不是河格，旧坐标没动`, () => {
    assert.deepEqual(out.rows[id].coord, { x: mx, y: my });
    assert.deepEqual([cellOf(mx), cellOf(my)], [sx, sy]);
    assert.equal(riverCells.has(`${sx},${sy}`), false);
    assert.equal(riverCells.has(`${rx},${ry}`), true);
    assert.equal(Math.abs(rx - sx) + Math.abs(ry - sy), 1); // 四邻
  });
}

// 改挂清单（勘误 B，写进 geo-model.json 的 reparent）：地点 → 新父（郡或所在省野外）。旧父与旧郡随清单留痕，转换脚本把新父写进地点行。
const REPARENT = {
  loc_site_peat_islets: 'loc_county_feicui_xiudao',
  loc_site_w5_scent_watch: 'loc_county_feicui_xiudao',
  loc_site_w5_ferry_shrine: 'loc_county_xichui_longqu',
  loc_site_w5_reed_salt: 'loc_county_xichui_shangzha',
  loc_site_w5_boundary_pavilion: 'loc_prov_xichui',
  loc_site_w5_way_temple: 'loc_prov_xichui',
  loc_site_salt_reeds: 'loc_prov_xichui',
};
// [地点, 旧坐标（米，手算 = 千米 × 1000）, 种子应落进足迹的郡（或省野外）]：前 11 行是李白裁定 B 点名的旧地点（含河湾村），后 5 行是随省界与河道改动才落到别处、改挂的（见 REPARENT）。
// 其中 5 行本来就在原郡：河湾村与垄渠 (20,5) 同在大河东岸；乌岩阶、断钟寺、盘根洼在垄渠；透砂坡在下渡；圆月断崖在赤褶；废冶炉台在铜脊；断契旧堡在赭牙谷。
const PLACES = [
  ['loc_hw', [0, 0], 'loc_county_xichui_longqu'],
  ['loc_site_basalt_steps', [76000, -14000], 'loc_county_xichui_longqu'],
  ['loc_site_w5_boundary_pavilion', [128000, 5600], 'loc_prov_xichui'],
  ['loc_site_w5_broken_bell', [10500, -14000], 'loc_county_xichui_longqu'],
  ['loc_site_w5_way_temple', [96000, 4200], 'loc_prov_xichui'],
  ['loc_site_peat_islets', [-82000, -109000], 'loc_county_feicui_xiudao'],
  ['loc_site_root_hollow', [56000, 20000], 'loc_county_xichui_longqu'],
  ['loc_site_glass_dunes', [36000, -78000], 'loc_county_xichui_xiadu'],
  ['loc_site_moon_cliffs', [566000, -64000], 'loc_county_zhonglu_chizhe'],
  ['loc_site_w5_cold_smelter', [52000, 48000], 'loc_county_hanlu_tongji'],
  ['loc_site_w5_raid_fort', [98000, 70500], 'loc_county_hanlu_zheya'],
  ['loc_site_w5_scent_watch', [-52000, -108000], 'loc_county_feicui_xiudao'],
  ['loc_site_w5_ferry_shrine', [-1500, -17000], 'loc_county_xichui_longqu'],
  ['loc_site_w5_reed_salt', [-6000, -38500], 'loc_county_xichui_shangzha'],
  ['loc_site_salt_reeds', [92000, -24000], 'loc_prov_xichui'],
  ['loc_site_silt_canyon', [49000, -98000], 'loc_county_xichui_xiadu'],
];

// 现挂的最近一个郡或省（沿 parent 往上）
const regionAbove = (rows, id) => {
  let p = id;
  while (p !== null && p !== undefined && !/^loc_(county|prov)_/.test(p)) p = rows[p]?.parent;
  return p;
};

test('改挂清单钉死（勘误 B）：转换后的地点行 parent 即清单里的新父；清单之外的地点 parent 仍是旧父', () => {
  for (const [id, parent] of Object.entries(REPARENT)) assert.equal(out.rows[id].parent, parent, id);
  assert.equal(out.rows.loc_yandu.parent, 'loc_county_xichui_xiadu'); // 两份清单之外的地点 parent 仍是旧父
});

// 子站点改挂（李白 11-23 事件 47df4cc8 G5b-D 选甲、事件 08673f69 第 2、4 条；world/geo/subsite-reparent.json）：旧父站点的足迹不含本行种子的地点行，坐标不动、按坐标改挂所在郡，
// 原父站点写进作者字段 originSite（"属于某村"不靠 parent 包含，卷八 R8-18.9 ③ 按它连统治边）。期望值：原属站点取旧数据 locations.json 里该行的旧父（独立的来源）；新挂处逐行核"种子区格在它的足迹里"，不抄清单的行数与郡数（清单由 tools/derive-subsite-reparent.mjs 推出，--check 核对）。
const here = dirname(fileURLToPath(import.meta.url));
const readJson = (p) => JSON.parse(readFileSync(join(here, '../../world/geo', p), 'utf8'));
const SUBSITES = readJson('subsite-reparent.json').rows;
const OLD_LOCATIONS = new Map(readJson('locations.json').map((o) => [newId(o.id), o])); // 旧 id 整类加 loc_ 前缀（卷二 :287）

test('子站点改挂（G5b-D）：每行原属站点就是旧数据里该行的旧父（独立来源 locations.json），坐标没动', () => {
  const ids = Object.keys(SUBSITES);
  assert.ok(ids.length > 0);
  for (const id of ids) {
    const old = OLD_LOCATIONS.get(id);
    assert.ok(old, `${id} is an old location row`);
    assert.equal(SUBSITES[id].originSite, newId(old.parent), `${id} originSite is its old parent`);
    assert.deepEqual(out.rows[id].coord, { x: Number((old.coordinates[0] * 1000).toFixed(4)), y: Number((old.coordinates[1] * 1000).toFixed(4)) }, `${id} coord unchanged`);
  }
});

test('子站点改挂（G5b-D）：转换后的地点行 parent 是新挂处（郡）、originSite 是原父站点；清单之外的行没有 originSite', () => {
  for (const [id, s] of Object.entries(SUBSITES)) {
    assert.equal(out.rows[id].parent, s.parent, id);
    assert.equal(out.rows[id].originSite, s.originSite, id);
  }
  assert.equal(Object.values(out.rows).filter((r) => r.originSite !== undefined).length, Object.keys(SUBSITES).length); // 清单之外没有 originSite
});

test('子站点改挂（G5b-D）：逐行核——每行的种子区格落在新挂处的足迹里（新挂处在该格最深拥有者的祖先链上），且不在原父站点的足迹里（所以才改挂）', () => {
  const { plan, rows } = countyPartition();
  for (const [id, s] of Object.entries(SUBSITES)) {
    const key = keyOf(out.box, cellOf(out.rows[id].coord.x), cellOf(out.rows[id].coord.y));
    const chain = new Set();
    for (let p = ownerIdAt(plan, key); p; p = rows.get(p)?.parent) chain.add(p);
    assert.equal(chain.has(s.parent), true, `${id} seed lies in the footprint of its new parent ${s.parent}`);
    assert.equal(chain.has(s.originSite), false, `${id} seed is outside the footprint of its old parent ${s.originSite}`);
  }
});

test('子站点改挂（G5b-D）：每个写了 originSite 的行都能从原属站点查回原村——原属站点行存在、不是政区、也不再是本行的祖先（归属靠 originSite，不靠 parent 包含）', () => {
  const ancestors = (id) => { const a = new Set(); for (let p = out.rows[id].parent; p; p = out.rows[p]?.parent) a.add(p); return a; };
  for (const [id, r] of Object.entries(out.rows)) {
    if (r.originSite === undefined) continue;
    const site = out.rows[r.originSite];
    assert.ok(site, `${id}: originSite ${r.originSite} exists`);
    assert.equal(site.regionLevel, undefined, `${id}: originSite is a site, not a jurisdiction`);
    assert.equal(ancestors(id).has(r.originSite), false, `${id}: originSite is no longer an ancestor`);
  }
});

// 站点面积阶段之后的区域足迹划分近似（100 米区格、全外包框）：作者写的地点行（非政区、非存量单元与水体、没写面积与边界）取 1 区格的目标（R10-7.5：占地 0 至少 1 格），
// 其余行照作者的 boundary 与存量单元面积；只用来判一个地点的种子落在哪个郡的足迹里（站点自身的大小对郡足迹的影响不到一个千分点）。
function countyPartition() {
  const rows = new Map();
  for (const [id, r] of Object.entries(out.rows)) {
    const cl = r.classes ?? [];
    if (cl.includes('comp_facility')) continue;
    const isSite = !r.regionLevel && !cl.includes('comp_tract') && !cl.includes('comp_waterbody') && !r.boundary && !Number.isFinite(r.targetAreaM2) && Boolean(r.parent);
    rows.set(id, { parent: r.parent ?? null, kind: 'region', offstage: false, coord: r.coord ?? null, targetAreaM2: isSite ? 100 * 100 : (Number.isFinite(r.targetAreaM2) ? r.targetAreaM2 : null), boundary: Array.isArray(r.boundary) ? r.boundary : null, flowing: r.waterKind === 'water_river', downstream: r.downstream ?? null });
  }
  const { plans } = planRegionFootprints({ regionCellM: 100 }, [{ w: 0, box: out.box, root: 'loc_world' }], rows);
  return { plan: plans.get(0), rows };
}

test('地点归属（勘误 B）：旧地点 11 行（含河湾村）与改挂 5 行，旧坐标没动，现挂的郡（或省）就是种子区格所在足迹的郡（或省）', () => {
  const { plan } = countyPartition();
  for (const [id, [mx, my], want] of PLACES) {
    assert.deepEqual(out.rows[id].coord, { x: mx, y: my }, `${id} coord unchanged`);
    assert.equal(regionAbove(out.rows, out.rows[id].parent), want, `${id} parent chain reaches ${want}`);
    const deepest = ownerIdAt(plan, keyOf(out.box, cellOf(mx), cellOf(my)));
    assert.equal(regionAbove(out.rows, deepest), want, `${id} seed cell (${cellOf(mx)},${cellOf(my)}) lies in the footprint of ${want}`);
  }
});
