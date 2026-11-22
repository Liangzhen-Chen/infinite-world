// G10 现场泡展开收起测试共用夹具（tests/kernel/bubble.test.mjs、bubble-scale.test.mjs）：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、词表条目写进拷贝；材料取真实行。
//   格空间 w0：12 × 3 区格（区格边长 100 细格，cellM 1 m、storeyM 3 m、里块边长 1000 细格），所有控制点海拔 0、terrain_river 起伏 0，所以地表高处处 0 m、地表层 0：
//   z=0 是地表（mat_soil）、z=−1 土、z≤−2 岩（mat_granite）、z≥1 空气（mat_air）；细格 (x, y, z=1) 是站立层。区格 (0,1)、(1,1) 各是一个地点行（loc_a、loc_b，目标面积 10000 m² = 一个区格），
//   其余区格归层根 loc_root；一栋 6 × 6 小屋 bld_a 锚点 (20, 120, z=0)（外墙厚 1 格，一层）在区格 (0,1) 的 loc_a 里。
//   格空间 w1：24 × 6 区格（w0 面积的 4 倍），层根 loc_root2，区格 (2,2) 是地点行 loc_c；用来验"泡的大小与格空间大小无关"与"加一个格空间不改泡的代码"。
//   个体都用 state.created 的偏离行造（只带 pos），玩家席位边直接写进 state.holdings（持有写者不是泡的事）；泡半径取真实规则表首值 1。
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';

export { ROOT };
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok); // 先装配命名 struct、定点常数与 sqrt 表（夹具世界的加载校验要读 anchor）
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const HEADER = JSON.parse(realText('place.json'));
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, rooms: [] };

function load(rows, spaces) {
  const tmp = testTempRoot('bubble-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    const v = structuredClone(VOCAB);
    v.families.access.entries = { access_test_open: { rank: 0, needsGrant: false } };
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = { bldform_hut: FORM };
    v.families.roomrole.entries = {};
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp) });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({
  parent, areaM2: 1, elevationM: 0, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, ...extra,
});

const loaded = load({
  loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0 }),
  loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }),
  loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }),
  bld_a: building('loc_a', [20, 120, 0]),
  loc_root2: region('loc_root', 1200, 300, { classes: ['comp_layer_root'] }), // 另一格空间的层根挂在本树下，足迹不在父足迹之内（卷五 §4.1 规则 3 层根除外）
  loc_c: region('loc_root2', 250, 250, { targetAreaM2: 10000 }),
}, [
  { w: 0, box: { x0: 0, y0: 0, cellsX: 12, cellsY: 3 }, root: 'loc_root' },
  { w: 1, box: { x0: 0, y0: 0, cellsX: 24, cellsY: 6 }, root: 'loc_root2' },
]);
assert.equal(loaded.ok, true, loaded.text);

export const ENGINE = { tables: loaded.tables, vocab: loaded.vocab, rules: loaded.rules, units: loaded.env.units, template: { seed: 'seed_test' } };
export const SEAT = 'hk_player_seat'; // 真实规则表 rules.control.seatKind 的值
export const pos = (x, y, z = 1, w = 0, coarse = false) => ({ w, x, y, z, coarse });
export const seatEdge = (who) => ({ kind: SEAT, holder: who, subject: who, terms: { since: 0, until: null }, grantedBy: null });
export const seats = (who) => (who === null ? {} : { [who]: { hld_1: seatEdge(who) } });
/** 个体偏离行：只带 pos。persons = {id: pos}。 */
export const created = (persons) => Object.fromEntries(Object.entries(persons).map(([id, p]) => [id, { props: p === null ? {} : { pos: p } }]));
/** 世界分钟 1234（第 0 日）的夹具状态；seatHolder 为玩家受控个体 id（null 为无）。 */
export const fresh = (persons, seatHolder) => ({ clock: { minute: 1234, seq: 0 }, created: created(persons), holdings: seats(seatHolder) });
export const withRules = (engine, patch) => ({ ...engine, rules: { ...engine.rules, ...patch } });
