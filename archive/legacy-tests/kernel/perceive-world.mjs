// G13（6-8）感知与视线测试共用夹具（tests/kernel/sight.test.mjs、perceive.test.mjs）：真实维度表目录拷到仓库外临时目录，只把本用例的地点行、格空间表、身体图行、物种行与词表条目写进拷贝；材料、sense 族、能力族取真实行。
//   格空间 w0：12 × 3 区格（区格边长 100 细格，cellM 1 m、storeyM 3 m），所有控制点海拔 0（山脊区格除外）、terrain_river 起伏 0，所以平地地表高 0 m、地表层 0：z=0 是地表（mat_soil）、z≥1 是空气（mat_air），
//   细格 (x, y, z=1) 是站立层。区格 (0,1)、(1,1) 各是一个地点行（loc_a、loc_b）；区格 (5,1) 是地点行 loc_ridge，控制点海拔 60 m（远景视线的山脊）。其余区格归层根 loc_root。
//   格空间 w1：24 × 6 区格，层根 loc_root2，区格 (2,2) 是地点行 loc_c（新增一个格空间只加数据，视线、方位照常可用，跨空间一律未知）。
//   一栋 6 × 6 小屋 bld_a 锚点 (20, 120, z=0)（外墙厚 1 格，一层）在区格 (0,1) 的 loc_a 里：外墙在 z=1，屋面是格的顶面（ceiling）；南墙 (23,120,1) 是一个空气洞（门洞）。
//   个体用 state.created 的偏离行造（pos、species），玩家席位边直接写进 state.holdings；泡半径取真实规则表首值 1。
//   身体图：body_test_humanoid（头 contributes consciousness、sight、hearing、smell、touch 各 1）；body_test_blind（头没有 sight 贡献）。物种 species_test_a（人形）、species_test_blind（盲）、species_test_keen（嗅觉阈值低）。
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { testTempRoot, writeUnderTempRoot, ROOT } from '../accept/temp-root.mjs';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { speciesRow, TEST_ATTR_DIST } from './body-world.mjs';

export { ROOT };
installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
assert.ok(loadWorld(ROOT).ok);
const DIMS = 'world/ontology/dimensions';
const realText = (f) => readFileSync(join(ROOT, DIMS, f), 'utf8');
const clone = (v) => JSON.parse(JSON.stringify(v));
const HEADER = (({ rows, edges, gridSpaces, generated, ...head }) => ({ ...head, generated: {} }))(JSON.parse(realText('place.json'))); // 只取表头：真实世界的行、边、格空间表、generated 节不进夹具（generated 留空对象）
const VOCAB = JSON.parse(realText('_vocab.json'));
const TERRAINS = Object.keys(VOCAB.families.terrain.entries);

const ANY = { terrains: TERRAINS, waterAny: [], onRoad: null, inSettlement: null };
const CELLCLASS = { cellclass_land: { ...ANY, slopeRange: [0, 1], priority: 1, genTemplate: 'gtpl_land' } };
const TEMPLATE = { gtpl_land: { surfaceMaterial: 'mat_soil', airMaterial: 'mat_air', soilLayers: 1, soilMaterial: 'mat_soil', rockMaterial: 'mat_granite', blocks: [] } };
const FORM = { walled: true, aspect: 1, storeyBase: 0, roofed: true, deck: false, windowEvery: 0, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.2, planSideMaxCells: 64, defaultMaterials: { wall: 'mat_soil', frame: 'mat_elm', roof: 'mat_straw' }, rooms: [] };

const part = (id, parent, sizeFraction, contributes, vital, extra = {}) => ({ id, parent, sizeFraction, contributes, vital, ...extra });
const HEAD_HUMAN = { cap_consciousness: 1, cap_sight: 1, cap_hearing: 1, cap_smell: 1, cap_touch: 1 };
const HEAD_BLIND = { cap_consciousness: 1, cap_hearing: 1, cap_smell: 1, cap_touch: 1 };
const PLANS = {
  body_test_humanoid: { tissueFractions: { tissue_flesh: 0.6, tissue_bone: 0.4 }, parts: [part('bpart_torso', null, 0.9, { cap_breathing: 1 }, true), part('bpart_head', 'bpart_torso', 0.1, HEAD_HUMAN, true)], basis: 'test' },
  body_test_blind: { tissueFractions: { tissue_flesh: 0.6, tissue_bone: 0.4 }, parts: [part('bpart_torso', null, 0.9, { cap_breathing: 1 }, true), part('bpart_head', 'bpart_torso', 0.1, HEAD_BLIND, true)], basis: 'test' },
};

// 感官阈值与一次性源强（单位随感官，都是测试数；期望值在各用例里按判定式手算）。
// sense_test_aura 是夹具里新增的第五个通道（A5-2.3：只加数据，perceive 照常判定）：条目、物种阈值、源强、perception.json 两个键都只是数据。
const SENSES_A = { sense_hearing: 0.2, sense_sight: 0.2, sense_smell: 0.3, sense_test_aura: 0.1, sense_vibration: 0.1 };
const SENSES_KEEN = { ...SENSES_A, sense_smell: 0.05 };
const SENSES_NOSCENT = { ...SENSES_A, sense_smell: null }; // 物种没有嗅觉：阈值为 null（没有这个感官）
const STRENGTH = { sense_hearing: 40, sense_sight: 20, sense_smell: 10, sense_test_aura: 30, sense_vibration: 5 };

function speciesRows(vocabKeys) {
  const rows = {
    species_test_a: { ...speciesRow('body_test_humanoid'), senses: SENSES_A, sourceStrength: STRENGTH },
    species_test_blind: { ...speciesRow('body_test_blind'), senses: SENSES_A, sourceStrength: STRENGTH },
    species_test_keen: { ...speciesRow('body_test_humanoid'), senses: SENSES_KEEN, sourceStrength: STRENGTH },
    species_test_noscent: { ...speciesRow('body_test_humanoid'), senses: SENSES_NOSCENT, sourceStrength: STRENGTH },
  };
  for (const row of Object.values(rows)) {
    row.crossbreeds = Object.fromEntries(Object.keys(rows).map((k) => [k, null]));
    row.dietShares = Object.fromEntries(vocabKeys('diet').map((k) => [k, null]));
    row.attributesBase = Object.fromEntries(vocabKeys('attr').map((k) => [k, clone(TEST_ATTR_DIST)]));
    for (const [d, fam] of [['gaits', 'gait'], ['sexes', 'sex']]) for (const k of vocabKeys(fam)) if (!Object.hasOwn(row[d], k)) row[d][k] = null;
  }
  return rows;
}

function load(rows, spaces) {
  const tmp = testTempRoot('perceive-');
  try {
    for (const f of readdirSync(join(ROOT, DIMS)).filter((n) => n.endsWith('.json'))) writeUnderTempRoot(tmp, f, realText(f));
    const v = structuredClone(VOCAB);
    const keysOf = (fam) => [...Object.keys(v.families[fam].entries), ...{ tissue: ['tissue_flesh', 'tissue_bone'], attr: ['attr_test'], sex: ['sex_test'], gait: ['gait_test'], diet: [] }[fam]];
    writeUnderTempRoot(tmp, 'place.json', JSON.stringify({ ...HEADER, rows, edges: [], gridSpaces: spaces }));
    writeUnderTempRoot(tmp, 'item.json', JSON.stringify({ ...JSON.parse(realText('item.json')), rows: {} }));
    writeUnderTempRoot(tmp, 'org.json', JSON.stringify({ ...JSON.parse(realText('org.json')), rows: {} })); // 真实组织行的驻地不在夹具地点表里
    const unbuilt = JSON.parse(realText('_unbuilt-derived.json'));
    unbuilt.columns = unbuilt.columns.filter((c) => c.table !== 'place');
    writeUnderTempRoot(tmp, '_unbuilt-derived.json', JSON.stringify(unbuilt));
    v.families.access.entries = { ...v.families.access.entries, access_test_open: { rank: 0, needsGrant: false } }; // 真实设施类型表的缺省档要在族里
    v.families.water.entries = { ...v.families.water.entries, water_test_fresh: { navigable: false } };
    v.families.cellclass.entries = CELLCLASS;
    v.families.gentemplate.entries = TEMPLATE;
    v.families.bform.entries = { bldform_hut: { ...FORM, facilityTypes: ['fac_house'] }, bldform_shrine: v.families.bform.entries.bldform_shrine, bldform_open_yard: v.families.bform.entries.bldform_open_yard };
    v.families.roomrole.entries = {};
    // 6-23 起真实世界带人类行及其组织、部位、分类条目；本夹具自带测试词表与物种行，先把这几族与两张表的真实行还原成空。
    for (const k of ['tissue', 'body_part', 'taxon']) v.families[k].entries = {};
    for (const id of ['bpart_torso', 'bpart_head']) v.families.body_part.entries[id] = {};
    Object.assign(v.families.tissue.entries, { tissue_flesh: { depthOrder: 2, reserve: false }, tissue_bone: { depthOrder: 3, reserve: false } });
    Object.assign(v.families.attr.entries, { attr_test: { physical: true, hidden: false, heritability: 0.5, residualFactor: 0.9354, agingCurve: 'flat' } });
    Object.assign(v.families.sex.entries, { sex_test: { bears: true } });
    Object.assign(v.families.gait.entries, { gait_test: { drivenBy: 'cap_moving', exertion: 1 } });
    Object.assign(v.families.taxon.entries, { taxon_test: {} });
    Object.assign(v.families.sense.entries, { sense_test_aura: { perceivedAsleep: true, capability: 'cap_consciousness', rangeDim: null, basis: 'test' } });
    writeUnderTempRoot(tmp, '_vocab.json', JSON.stringify(v));
    // 规则目录抄到临时根，只把 perception.json 加上第五个通道的两个键。
    const reg = JSON.parse(readFileSync(join(ROOT, 'world/rules/registry.json'), 'utf8'));
    for (const r of reg.rows) {
      let text = readFileSync(join(ROOT, 'world/rules', r.file), 'utf8');
      if (r.code === 'perception') {
        const doc = JSON.parse(text);
        for (const x of doc.rows) {
          if (x.key === 'marginBase') x.value = { ...x.value, sense_test_aura: 0 };
          if (x.key === 'candidateRadiusM') x.value = { ...x.value, sense_test_aura: 60 };
        }
        text = JSON.stringify(doc);
      }
      if (r.code === 'env') { // 新增通道须在 channelLaw 给一种衰减（卷二十 §2.9 :404，E-PROP-LAW）：同样只是数据
        const doc = JSON.parse(text);
        for (const x of doc.rows) if (x.key === 'channelLaw') x.value = { ...x.value, sense_test_aura: 'sound' };
        text = JSON.stringify(doc);
      }
      writeUnderTempRoot(tmp, `rules/${r.file}`, text);
    }
    writeUnderTempRoot(tmp, 'rules/registry.json', JSON.stringify(reg));
    const plan = JSON.parse(realText('body_plan.json'));
    plan.rows = {};
    Object.assign(plan.rows, clone(PLANS));
    writeUnderTempRoot(tmp, 'body_plan.json', JSON.stringify(plan));
    const sp = JSON.parse(realText('species.json'));
    sp.rows = {};
    Object.assign(sp.rows, speciesRows(keysOf));
    writeUnderTempRoot(tmp, 'species.json', JSON.stringify(sp));
    return loadWorld(ROOT, { dimensionsDir: relative(ROOT, tmp), rulesDir: join(tmp, 'rules') });
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

const row = (parent, extra = {}) => ({
  parent, skyExposure: 1, ledgerHolder: false, basis: 'test',
  waterAccess: [], forestCover: 0, hiddenness: 0, accessClass: 'access_test_open', ...extra,
});
const region = (parent, x, y, extra = {}) => row(parent, { terrain: 'terrain_river', coord: { x, y }, anchorElevationM: 0, ...extra });
const building = (parent, anchorXYZ, extra = {}) => row(parent, {
  classes: ['comp_facility'], anchor: { w: 0, x: anchorXYZ[0], y: anchorXYZ[1], z: anchorXYZ[2], coarse: false }, facing: 0,
  form: 'bldform_hut', intendedType: 'fac_house', planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, condition: 1, breaks: [], materialKg: { mat_granite: 1000 }, wallFlowKg: { laidKg: { mat_granite: 1000 }, takenKg: { mat_granite: 0 }, lostKg: { mat_granite: 0 } }, ...extra,
});

const loaded = load({
  loc_root: row(null, { classes: ['comp_layer_root'], terrain: 'terrain_river', coord: { x: 100, y: 150 }, anchorElevationM: 0 }),
  loc_a: region('loc_root', 50, 150, { targetAreaM2: 10000 }),
  loc_b: region('loc_root', 150, 150, { targetAreaM2: 10000 }),
  loc_ridge: region('loc_root', 550, 150, { targetAreaM2: 10000, anchorElevationM: 60 }),
  bld_a: building('loc_a', [20, 120, 0]),
  loc_root2: region('loc_root', 1200, 300, { classes: ['comp_layer_root'] }), // 另一格空间的层根挂在本树下（卷五 §4.1 规则 3 层根除外）
  loc_c: region('loc_root2', 250, 250, { targetAreaM2: 10000 }),
}, [
  { w: 0, box: { x0: 0, y0: 0, cellsX: 12, cellsY: 3 }, root: 'loc_root' },
  { w: 1, box: { x0: 0, y0: 0, cellsX: 24, cellsY: 6 }, root: 'loc_root2' },
]);
assert.equal(loaded.ok, true, loaded.text);

export const ENGINE = { tables: loaded.tables, vocab: loaded.vocab, rules: loaded.rules, units: loaded.env.units, template: { seed: 'seed_test' } };
export const OWNERS = loaded.owners;
export const SEAT = 'hk_player_seat'; // 真实规则表 rules.control.seatKind 的值
export const pos = (x, y, z = 1, w = 0, coarse = false) => ({ w, x, y, z, coarse });
export const seatEdge = (who) => ({ kind: SEAT, holder: who, subject: who, terms: { since: 0, until: null }, grantedBy: null });
export const seats = (who) => (who === null ? {} : { [who]: { hld_1: seatEdge(who) } });
/** 个体偏离行：persons = {id: {pos, species}}。 */
export const created = (persons) => Object.fromEntries(Object.entries(persons).map(([id, p]) => [id, { props: { ...(p.pos === null || p.pos === undefined ? {} : { pos: p.pos }), ...(p.species === undefined ? {} : { species: p.species }) } }]));
/** 世界分钟 1234（第 0 日）的夹具状态；seatHolder 为玩家受控个体 id（null 为无）。 */
export const fresh = (persons, seatHolder = null) => ({ clock: { minute: 1234, seq: 0 }, created: created(persons), holdings: seats(seatHolder) });
export const withRules = (engine, patch) => ({ ...engine, rules: { ...engine.rules, ...patch } });
