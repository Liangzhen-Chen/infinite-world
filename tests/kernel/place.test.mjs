// 块 6 第 6-7 张《地点表与包含树》：卷五《地点地形与资源场》§2.1 :90–:101、:145、:193–:195（表头与边节）；§3.1 :285（placeView、routeView）；
// §4.1.2 :397 起（三个关系）；§4.1.3 规则 1–5（单根树、面积和、边只存一次、几何最短路与并列取法）；A5-1.2；
// 卷二《维度表规范与统一入口》§1.12（关系族的行与反查索引）、§5.6 :1753。对照表第 18、19、21 行。
// 前提都在测试里造：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、边与词表条目写进拷贝，经 loadWorld 加载；
// world/ 下的 place.json 只有表头。期望值按卷文规则手算成字面量，不读仓库此刻的计数。只跑不推进世界的小检查（本机 F 盘）。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { placeView, routeView, relContains, relWithin, relResidents, checkPlaceTable } from '../../server-plugin/kernel/place.mjs';
import { reverseLookup } from '../../server-plugin/kernel/reverse-index.mjs';

const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));

// 加载一个只改了地点行、边与（可选）词表条目的世界；临时目录用完即删。
function load({ rows = {}, edges = [], juris = null } = {}) {
  const tmp = testTempRoot('place-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges }));
    // 物品行（6-22）的 origin 指向真实地点；本文件的临时世界只有自造的地点，物品表只留表头。
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    // 真实世界为旧数据没有的列登记了未建（6-24，缺值放行）；本文件的用例要核"缺 always 列即报错"，前提自己造：拷贝里去掉 place 的未建列登记。
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    // access、water 两族以测试自造的一条进入档与一条水体类替换（真实条目随 6-24 灌行而来），供行填 always 列。
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { water_test_fresh: { navigable: false } };
    if (juris) v.families.juris.entries = juris;
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const codes = (r) => r.errors.map((e) => e.code);
const has = (r, code) => codes(r).includes(code);
// 一行地点：父、面积、海拔；其余 always 维度照表头给齐。
const row = (parent, areaM2, extra = {}) => ({
  parent, coord: { x: 0, y: 0 }, areaM2, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  terrain: 'terrain_plain', waterAccess: ['water_test_fresh'], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const edge = (from, to, distanceM, waterway = false, extra = {}) => ({ from, to, distanceM, waterway, ...extra });
const engineOf = (r) => ({ tables: r.tables, vocab: r.vocab, rules: r.rules });

// 一棵示例树：根 loc_w（1000 m2）下 loc_a、loc_b、loc_c、loc_d、loc_e 各 100 m2。
const TREE = { loc_w: row(null, 1000), loc_a: row('loc_w', 100), loc_b: row('loc_w', 100, { elevationM: 5 }), loc_c: row('loc_w', 100), loc_d: row('loc_w', 100), loc_e: row('loc_w', 100) };

// ---------- 对照表第 18 行：单根树、有限步到根、边两端存在且 from 小于 to、两端加通路类型唯一、面积和 ----------

test('真实世界：place 表（6-24 灌入九省 31 郡的行与边）加载零错误；对真实行的断言在 place-world.test.mjs', () => {
  const r = loadWorld(ROOT);
  assert.equal(r.ok, true, r.text);
});

test('规则 1 正例：单根、各行一步到根，加载通过', () => {
  const r = load({ rows: TREE });
  assert.equal(r.ok, true, r.text);
});

test('规则 1 反例：两行 parent 为 null（多根）即 E-DIM-DOMAIN-RANGE', () => {
  const r = load({ rows: { ...TREE, loc_x: row(null, 10) } });
  assert.equal(r.ok, false);
  assert.ok(has(r, 'E-DIM-DOMAIN-RANGE'), r.text);
});

test('规则 1 反例：父链成环到不了根即 E-DIM-CYCLE', () => {
  const r = load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_b', 10), loc_b: row('loc_a', 10) } });
  assert.equal(r.ok, false);
  assert.ok(has(r, 'E-DIM-CYCLE'), r.text);
});

test('规则 1 反例：自指 parent 即 E-DIM-CYCLE', () => {
  const r = load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_a', 10) } });
  assert.ok(has(r, 'E-DIM-CYCLE'), r.text);
});

test('parent 特殊值：不存在的地点 E-DIM-REF-MISSING；空串 E-DIM-ID-FORMAT；缺键 E-DIM-REQUIRED-MISSING', () => {
  assert.ok(has(load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_zz', 10) } }), 'E-DIM-REF-MISSING'));
  assert.ok(has(load({ rows: { loc_w: row(null, 1000), loc_a: row('', 10) } }), 'E-DIM-ID-FORMAT'));
  const missing = row('loc_w', 10);
  delete missing.parent;
  assert.ok(has(load({ rows: { loc_w: row(null, 1000), loc_a: missing } }), 'E-DIM-REQUIRED-MISSING'));
});

test('规则 3：同父子地点面积和等于父地点通过，多 1 m2 即 E-DIM-DOMAIN-RANGE', () => {
  // 400 + 600 = 1000，不超过；400 + 601 = 1001 > 1000。
  assert.equal(load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_w', 400), loc_b: row('loc_w', 600) } }).ok, true);
  const r = load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_w', 400), loc_b: row('loc_w', 601) } });
  assert.equal(r.ok, false);
  assert.ok(has(r, 'E-DIM-DOMAIN-RANGE'), r.text);
});

test('areaM2 特殊值：0 与负数出取值域 [1, null]，null 不可空', () => {
  for (const a of [0, -5, null]) assert.ok(has(load({ rows: { loc_w: row(null, a) } }), 'E-DIM-DOMAIN-RANGE'), String(a));
});

test('规则 4 正例：from 小于 to；同两端陆路、水路两条边可并存；distanceM 为 0 可存', () => {
  const r = load({ rows: TREE, edges: [edge('loc_a', 'loc_b', 10), edge('loc_a', 'loc_b', 10, true), edge('loc_b', 'loc_c', 0)] });
  assert.equal(r.ok, true, r.text);
});

test('规则 4 反例：from 不小于 to（倒序、两端相同）即 E-DIM-DOMAIN-RANGE', () => {
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_b', 'loc_a', 10)] }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_a', 10)] }), 'E-DIM-DOMAIN-RANGE'));
});

test('规则 4 反例：两端加通路类型重复即 E-DIM-DUPLICATE-KEY', () => {
  const r = load({ rows: TREE, edges: [edge('loc_a', 'loc_b', 10), edge('loc_a', 'loc_b', 12)] });
  assert.ok(has(r, 'E-DIM-DUPLICATE-KEY'), r.text);
});

test('边的两端特殊值：不存在的地点 E-DIM-REF-MISSING；null E-DIM-DOMAIN-RANGE；空串 E-DIM-ID-FORMAT', () => {
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_zz', 10)] }), 'E-DIM-REF-MISSING'));
  assert.ok(has(load({ rows: TREE, edges: [edge(null, 'loc_a', 10)] }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ rows: TREE, edges: [edge('', 'loc_a', 10)] }), 'E-DIM-ID-FORMAT'));
});

test('边的字段：distanceM 负数或 null 拒收；缺 waterway、多出未登记字段即 E-DIM-STRUCT-FIELD', () => {
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_b', -1)] }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_b', null)] }), 'E-DIM-DOMAIN-RANGE'));
  const noWay = { from: 'loc_a', to: 'loc_b', distanceM: 10 };
  assert.ok(has(load({ rows: TREE, edges: [noWay] }), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_b', 10, false, { bearingDeg: 90 })] }), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(load({ rows: TREE, edges: [edge('loc_a', 'loc_b', 10, false, { openness: 2 })] }), 'E-DIM-DOMAIN-RANGE'));
});

test('checkPlaceTable 直调：没载入 place 表无事可核；边节不是列表即 E-DIM-STRUCT-FIELD', () => {
  assert.deepEqual(checkPlaceTable({ vocab: { index: new Map() }, tables: new Map(), env: {} }), { ok: true, errors: [] });
  const r = loadWorld(ROOT);
  const t = r.tables.get('place');
  const broken = new Map([['place', { ...t, doc: { ...t.doc, edges: null } }]]);
  const out = checkPlaceTable({ vocab: r.vocab, tables: broken, env: r.env });
  assert.equal(out.ok, false);
  assert.ok(out.errors.some((e) => e.startsWith('E-DIM-STRUCT-FIELD')), out.errors.join('\n'));
});

// ---------- K6-46：regionLevel 词表与列；comp_enclosure 的 aperture ----------

test('regionLevel：挂 comp_region 的行必填，取 juris 族条目；juris 条目须带整数 rank', () => {
  const juris = { juris_province: { rank: 2 }, juris_county: { rank: 1 } };
  const region = (lv) => ({ ...TREE, loc_r: row('loc_w', 100, { classes: ['comp_region'], ...(lv === undefined ? {} : { regionLevel: lv }) }) });
  assert.equal(load({ rows: region('juris_county'), juris }).ok, true);
  assert.ok(has(load({ rows: region(undefined), juris }), 'E-DIM-REQUIRED-MISSING'));
  assert.ok(has(load({ rows: region('juris_nope'), juris }), 'E-DIM-DOMAIN-ENUM'));
  assert.ok(has(load({ rows: TREE, juris: { juris_county: {} } }), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(load({ rows: TREE, juris: { juris_county: { rank: 1.5 } } }), 'E-DIM-STRUCT-FIELD'));
});

test('aperture：挂 comp_enclosure 的行必填，取值域 [0,1]', () => {
  const enc = (extra) => ({ ...TREE, bld_house: row('loc_a', 50, { classes: ['comp_enclosure'], skyExposure: 0, ...extra }) });
  assert.equal(load({ rows: enc({ aperture: 0 }) }).ok, true);
  assert.ok(has(load({ rows: enc({}) }), 'E-DIM-REQUIRED-MISSING'));
  assert.ok(has(load({ rows: enc({ aperture: 1.5 }) }), 'E-DIM-DOMAIN-RANGE'));
});

// ---------- 规则 3 前半：坐标包含（子地点 coord 与父地点 coord 之差 ≤ √(父 areaM2 ÷ π)） ----------

// 手算：父 1000 m2，等效半径 √(1000/π) = 17.84124… m。定点判 π·dx² ≤ areaM2（π 取 atan 表 π/4 = 0.78539816 的四倍）：
// dx = 17.8412 时 314159264 × 178412² = 9 999 953 814 795 516 416 ≤ 10¹⁹，过；dx = 17.8413（多 1 个定点单位）时 10 000 065 914 674 893 216 > 10¹⁹，拒。
const contain = (x, y = 0, parentArea = 1000) => load({ rows: { loc_w: row(null, parentArea, { coord: { x: 100, y: 100 } }), loc_a: row('loc_w', 1, { coord: { x: 100 + x, y: 100 + y } }) } });

test('坐标包含正例：恰在等效半径以内（17.8412 m）通过；反方向同样', () => {
  assert.equal(contain(17.8412).ok, true, contain(17.8412).text);
  assert.equal(contain(-17.8412).ok, true);
  assert.equal(contain(0, 17.8412).ok, true);
});

test('坐标包含反例：越出 1 个定点单位（17.8413 m）即 E-DIM-DOMAIN-RANGE', () => {
  const r = contain(17.8413);
  assert.equal(r.ok, false);
  assert.ok(has(r, 'E-DIM-DOMAIN-RANGE'), r.text);
  assert.ok(has(contain(0, -17.8413), 'E-DIM-DOMAIN-RANGE'));
});

test('坐标包含特殊值：子与父同点（距离 0）在最小面积 1 m2 的父下也过；父 1 m2 半径 0.5641 m 过、0.5642 m 拒', () => {
  // √(1/π) = 0.564189… m：314159264 × 5641² ≤ 10¹⁶ 过，× 5642² > 10¹⁶ 拒。
  assert.equal(contain(0, 0, 1).ok, true);
  assert.equal(contain(0.5641, 0, 1).ok, true);
  assert.ok(has(contain(0.5642, 0, 1), 'E-DIM-DOMAIN-RANGE'));
});

test('坐标特殊值：空坐标 {}、缺 y 即 E-DIM-STRUCT-FIELD；null 不可空 E-DIM-DOMAIN-RANGE', () => {
  const at = (coord) => load({ rows: { loc_w: row(null, 1000), loc_a: row('loc_w', 1, { coord }) } });
  assert.ok(has(at({}), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(at({ x: 1 }), 'E-DIM-STRUCT-FIELD'));
  assert.ok(has(at(null), 'E-DIM-DOMAIN-RANGE'));
});

// ---------- 表头 always 存储列（卷五 §2.1 :93、:129、:136、:144、:168） ----------

test('always 列：terrain 取封闭 10 项、waterAccess 取 water 族、forestCover [0,1]、hiddenness [0,100]、accessClass 取 access 族；缺任一即 E-DIM-REQUIRED-MISSING', () => {
  for (const k of ['terrain', 'waterAccess', 'forestCover', 'hiddenness', 'accessClass']) {
    const r = row(null, 1000);
    delete r[k];
    assert.ok(has(load({ rows: { loc_w: r } }), 'E-DIM-REQUIRED-MISSING'), k);
  }
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { terrain: 'terrain_swamp' }) } }), 'E-DIM-DOMAIN-ENUM'));
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { accessClass: 'access_nope' }) } }), 'E-DIM-DOMAIN-ENUM'));
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { waterAccess: ['water_nope'] }) } }), 'E-DIM-REF-MISSING'));
  assert.equal(load({ rows: { loc_w: row(null, 1000, { waterAccess: [] }) } }).ok, true);
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { forestCover: 1.5 }) } }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { hiddenness: -1 }) } }), 'E-DIM-DOMAIN-RANGE'));
  assert.ok(has(load({ rows: { loc_w: row(null, 1000, { hiddenness: null }) } }), 'E-DIM-DOMAIN-RANGE'));
});

// ---------- 对照表第 19 行：几何最短路（§4.1.3 规则 5） ----------

const routeWorld = (edges) => { const r = load({ rows: TREE, edges }); assert.equal(r.ok, true, r.text); return engineOf(r); };
const S = {};

test('最短路：路程最小者胜（a→b→d 20 < a→d 25）', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 10), edge('loc_b', 'loc_d', 10), edge('loc_a', 'loc_d', 25)]);
  const p = routeView(e, S, 'loc_a', 'loc_d').path;
  assert.deepEqual(p.places, ['loc_a', 'loc_b', 'loc_d']);
  assert.equal(p.distanceM, 20);
});

test('并列一：路程相同取边数少的（直达 20 对 a→b→d 20）', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 10), edge('loc_b', 'loc_d', 10), edge('loc_a', 'loc_d', 20)]);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_d').path.places, ['loc_a', 'loc_d']);
});

test('并列二：路程、边数都同，从代号小的一端写起比地点序列；反向调用是同一条路倒写', () => {
  // a→b→d 与 a→c→d 都是 20、两条边；从 loc_a 写起 [a,b,d] < [a,c,d]。
  const e = routeWorld([edge('loc_a', 'loc_c', 10), edge('loc_c', 'loc_d', 10), edge('loc_a', 'loc_b', 10), edge('loc_b', 'loc_d', 10)]);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_d').path.places, ['loc_a', 'loc_b', 'loc_d']);
  assert.deepEqual(routeView(e, S, 'loc_d', 'loc_a').path.places, ['loc_d', 'loc_b', 'loc_a']);
});

test('并列二（取法看较小端）：从两端写起胜者不同时，一律按代号小的一端 loc_a 写起比，与调用方向无关', () => {
  // P = a–b–e–d，Q = a–c–bb–d，各三条 10 m 的边。从 loc_a 写起 [a,b,e,d] < [a,c,bb,d]，P 胜；
  // 若从 loc_d 写起则 [d,bb,c,a] < [d,e,b,a]，Q 会胜——所以这一例能分辨取法是否固定在较小端。
  const r = load({ rows: { ...TREE, loc_bb: row('loc_w', 100) }, edges: [edge('loc_a', 'loc_b', 10), edge('loc_b', 'loc_e', 10), edge('loc_d', 'loc_e', 10), edge('loc_a', 'loc_c', 10), edge('loc_bb', 'loc_c', 10), edge('loc_bb', 'loc_d', 10)] });
  assert.equal(r.ok, true, r.text);
  const e = engineOf(r);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_d').path.places, ['loc_a', 'loc_b', 'loc_e', 'loc_d']);
  assert.deepEqual(routeView(e, S, 'loc_d', 'loc_a').path.places, ['loc_d', 'loc_e', 'loc_b', 'loc_a']);
  assert.equal(routeView(e, S, 'loc_d', 'loc_a').path.distanceM, 30);
});

test('并列三：陆路、水路两条边等长，取陆路；edge 两项陆路在前', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 10, true), edge('loc_a', 'loc_b', 10, false)]);
  const r = routeView(e, S, 'loc_b', 'loc_a');
  assert.deepEqual(r.path.edges.map((x) => x.waterway.value), [false]);
  assert.deepEqual(r.edge.map((x) => x.waterway.value), [false, true]);
});

test('边表存放顺序打乱，任何两点的 path 不变', () => {
  const list = [edge('loc_a', 'loc_c', 10), edge('loc_c', 'loc_d', 10), edge('loc_a', 'loc_b', 10), edge('loc_b', 'loc_d', 10), edge('loc_a', 'loc_d', 20, true)];
  const e1 = routeWorld(list);
  const e2 = routeWorld([...list].reverse());
  for (const [x, y] of [['loc_a', 'loc_d'], ['loc_d', 'loc_a'], ['loc_b', 'loc_c'], ['loc_c', 'loc_b']]) {
    assert.deepEqual(routeView(e1, S, x, y).path, routeView(e2, S, x, y).path);
  }
});

test('distanceM 为 0 的边照常参加；两地相同是没有边、distanceM 为 0 的路径', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 0), edge('loc_b', 'loc_c', 0)]);
  const p = routeView(e, S, 'loc_a', 'loc_c').path;
  assert.deepEqual(p.places, ['loc_a', 'loc_b', 'loc_c']);
  assert.equal(p.distanceM, 0);
  assert.deepEqual(routeView(e, S, 'loc_a', 'loc_a').path, { places: ['loc_a'], edges: [], distanceM: 0 });
});

test('不连通：path 为 null（距离未知），edge 为空', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 10)]);
  const r = routeView(e, S, 'loc_a', 'loc_e');
  assert.equal(r.path, null);
  assert.deepEqual(r.edge, []);
});

test('路程按定点相加：0.1 + 0.2 恰为 0.3', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 0.1), edge('loc_b', 'loc_c', 0.2)]);
  assert.equal(routeView(e, S, 'loc_a', 'loc_c').path.distanceM, 0.3);
});

test('边的属性组：ascentM 是 to 端减 from 端的海拔；未建的四项按未知带出', () => {
  const e = routeWorld([edge('loc_a', 'loc_b', 10)]);
  const fwd = routeView(e, S, 'loc_a', 'loc_b').edge[0];
  assert.deepEqual(fwd.ascentM, { known: true, applicable: true, value: 5 });
  assert.equal(routeView(e, S, 'loc_b', 'loc_a').edge[0].ascentM.value, -5);
  for (const k of ['terrainMix', 'requirement', 'bearingDeg', 'speedFactor', 'openness']) assert.equal(fwd[k].known, false, k);
  assert.deepEqual(fwd.distanceM, { known: true, applicable: true, value: 10 });
});

test('routeView、placeView 对非地点 id 拒收（E-DIM-REF-MISSING），不给默认值', () => {
  const e = routeWorld([]);
  assert.throws(() => routeView(e, S, 'loc_a', 'loc_zz'), (err) => err.code === 'E-DIM-REF-MISSING');
  assert.throws(() => placeView(e, S, 'loc_zz'), (err) => err.code === 'E-DIM-REF-MISSING');
});

// ---------- 对照表第 21 行：三关系与 placeView().tree ----------

const REGION = { ...TREE, loc_r: row('loc_w', 300, { classes: ['comp_region'], regionLevel: 'juris_county' }), loc_r1: row('loc_r', 100), loc_r2: row('loc_r1', 50) };
const regionEngine = () => { const r = load({ rows: REGION, juris: { juris_county: { rank: 1 } } }); assert.equal(r.ok, true, r.text); return engineOf(r); };

test('新增一个区域行：tree、rel_contains、rel_within 对新行即可用', () => {
  const e = regionEngine();
  const v = placeView(e, S, 'loc_r2');
  assert.deepEqual(v.tree, { ancestors: ['loc_r1', 'loc_r', 'loc_w'], children: [], depth: 3 });
  assert.deepEqual(placeView(e, S, 'loc_r').tree.children, ['loc_r1']);
  assert.deepEqual(placeView(e, S, 'loc_w').tree, { ancestors: [], children: ['loc_a', 'loc_b', 'loc_c', 'loc_d', 'loc_e', 'loc_r'], depth: 0 });
  assert.deepEqual(relContains(e, S, 'loc_r2'), ['loc_r1']);
  assert.deepEqual(relContains(e, S, 'loc_w'), []);
  assert.deepEqual(relWithin(e, S, 'loc_r2'), ['loc_r2', 'loc_r1', 'loc_r', 'loc_w']);
  assert.deepEqual(relWithin(e, S, 'loc_w'), ['loc_w']);
});

test('placeView().dims：存储维度读基值；byClass 不适用；登记未建的派生按未知带出', () => {
  const e = regionEngine();
  const d = placeView(e, S, 'loc_r').dims;
  assert.equal(d.parent.value, 'loc_w');
  assert.equal(d.regionLevel.value, 'juris_county');
  assert.equal(d.areaM2.value, 300);
  assert.equal(placeView(e, S, 'loc_a').dims.regionLevel.applicable, false);
  assert.equal(placeView(e, S, 'loc_a').dims.aperture.applicable, false);
  for (const k of ['enclosed', 'surfaceRefElevationM', 'depthM', 'underground']) assert.equal(d[k].known, false, k);
});

test('placeView 与 routeView 纯读：读前读后 state 逐位相同', () => {
  const e = regionEngine();
  const state = { holdings: {}, created: {} };
  const before = JSON.stringify(state);
  placeView(e, state, 'loc_r');
  routeView(e, state, 'loc_a', 'loc_r');
  relResidents(e, state, 'loc_r');
  assert.equal(JSON.stringify(state), before);
});

// 持有边形状照卷二 §1.5 struct:holding：holdings.<持有者>.<边句柄> = {kind, holder, subject, terms, grantedBy}。
const hold = (kind, holder, subject, until = null) => ({ kind, holder, subject, terms: { since: 0, until, endReason: null, suspended: false, consentAct: null, grantor: null }, grantedBy: null });

test('rel_residents：本行及后代上 domicile 为真且未关闭的持有者；常住边变化后随之', () => {
  const e = regionEngine();
  const state = {
    holdings: {
      npc_a: { h1: hold('hk_resides', 'npc_a', 'loc_r2') },      // 后代上的常住：算
      npc_b: { h1: hold('hk_lodges', 'npc_b', 'loc_r') },        // 种类行 domicile 为假：不算
      npc_c: { h1: hold('hk_resides', 'npc_c', 'loc_r1', 5) },   // 已关闭：不算
      npc_d: { h1: hold('hk_resides', 'npc_d', 'loc_a') },       // 不在 loc_r 子树：不算
    },
  };
  assert.deepEqual(relResidents(e, state, 'loc_r'), ['npc_a']);
  assert.deepEqual(relResidents(e, state, 'loc_w'), ['npc_a', 'npc_d']);
  state.holdings.npc_a.h1.terms.until = 9;
  state.holdings.npc_e = { h1: hold('hk_resident_of', 'npc_e', 'loc_r') };
  assert.deepEqual(relResidents(e, state, 'loc_r'), ['npc_e']);
});

test('reverseLookup：以标的为键反查持有者，不分种类、按代号序；无指向为 []；非反查关系拒收', () => {
  regionEngine();
  const state = { holdings: { npc_b: { h1: hold('hk_lodges', 'npc_b', 'loc_r') }, npc_a: { h1: hold('hk_resides', 'npc_a', 'loc_r'), h2: hold('hk_owns', 'npc_a', 'loc_r') } } };
  assert.deepEqual(reverseLookup(state, 'rel_residents', 'loc_r'), ['npc_a', 'npc_b']);
  assert.deepEqual(reverseLookup(state, 'rel_residents', 'loc_a'), []);
  assert.deepEqual(reverseLookup({}, 'rel_residents', 'loc_r'), []);
  assert.throws(() => reverseLookup(state, 'rel_contains', 'loc_r'), (err) => err.code === 'E-DIM-REF-MISSING');
  assert.throws(() => reverseLookup(state, 'hk_resides', 'loc_r'), (err) => err.code === 'E-DIM-REF-MISSING');
});
