// 卷十 R10-7.12（docs/统一底层设计/卷十-世界随机生成.md :684–:689；A10-2.4 ⑤ :471）与封卷后勘误 1121k16（李白 11-21 裁定 0b824a66、b58f7dca）：
// 手写建筑行缺的维度由生成规则补——墙厚取形制 wallThicknessDefaultM；planCells 按规则行 areaM2 分布抽面积再 planCellsOf；storeys 按同一规则行的分布抽
// 并夹进 [max(1, 1 − 形制 storeyBase), storeysMax]；补出的房子必须能展开，ok 为假（房间分不下、平面太小）时面积加倍重做，作者写了 planCells 的不重做；
// 没有规则行适用即 E-GEN-ROW-INVALID，不拿常量兜底；补出的值只含缺的维度，by 记 gstage_siteform；同种子同结果；房间行只列缺口、不造行。
// 期望值按卷文公式手算（细格 1 m、层高 3 m、墙厚 0.4 m）：w = ceil(0.4 ÷ 1) = 1、m = 2w + 1 = 3；面积 36 m²（aspect 1）→ D = W = 6；
// 三房间形制（各 level 0、share 0.34）面积 4 m² 时 D = 3、d = D − 2w = 1、spare = d − (r − 1) = −1 < r 不可行，逐次加倍 8（仍 3×3）、16（4×4）、32（7×5，spare 1 < 3）都不可行，64 时 8×8、d = 6、spare = 4 ≥ 3 才可分。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { blueprintRulesFrom } from '../../server-plugin/kernel/place-building.mjs';
import { planBlueprint, planFeasible } from '../../server-plugin/kernel/blueprint.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genSiteForm } from '../../server-plugin/kernel/gen/siteform.mjs';
import { makeWhen } from '../../server-plugin/kernel/gen/when.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const world = loadWorld(ROOT);
assert.equal(world.ok, true);
const BLUEPRINT = blueprintRulesFrom(world.rules, world.env.units);
assert.notEqual(BLUEPRINT, null);
const WHEN = makeWhen(world);
const json = (p) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const START = json('world/geo/start-buildings.json');

// 形制条目（卷十九 §2.4 :203）：无房间的围墙形制、三个房间的形制。
// planSideMaxCells：形制自己登记的外包边长上限（卷十九 §2.4，封卷后勘误 1121k21）；夹具取 64，各用例要测上限时另造形制改它。
const F36 = { walled: true, roofed: true, deck: false, storeyBase: 0, aspect: 1, windowEvery: 4, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.4, planSideMaxCells: 64, rooms: [] };
const F3R = {
  ...F36,
  rooms: [{ role: 'roomrole_a', share: 0.34, level: 0, open: false }, { role: 'roomrole_b', share: 0.34, level: 0, open: false }, { role: 'roomrole_c', share: 0.34, level: 0, open: false }],
};

// 分布取单点即恒取该值（卷十 R10-7.12 的 areaM2、storeys 取 rules.gen.bldfill.rows 的分布）。
const point = (v) => ({ dist: 'triangular', min: v, mode: v, max: v });
const fill = (area, storeys) => [{ whenRX: 'known(form)', priority: 1, areaM2: point(area), storeys: point(storeys) }];
const formEntry = (form) => ({ family: 'bform', entry: form });
const vocabOf = (pairs) => ({ index: new Map(pairs) });
const VOCAB = () => vocabOf([['bldform_t', formEntry(F36)], ['bldform_r', formEntry(F3R)]]);
const rowsOf = (entries) => buildGenRows(new Map(entries), { index: new Map() });
const bld = (extra = {}) => ({ parent: null, classes: ['comp_facility'], form: 'bldform_t', ...extra });
const codeOf = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };

const run = (o) => genSiteForm({
  table: 'place',
  stage: 'gstage_siteform',
  worldSeed: o.worldSeed ?? 'seed_siteform',
  genesisMinute: 0,
  vocab: o.vocab ?? VOCAB(),
  rows: o.rows,
  authoredIds: o.authoredIds,
  bldfillRows: o.bldfillRows ?? [],
  roleFacility: 'comp_facility',
  blueprint: o.blueprint ?? BLUEPRINT,
  when: o.when ?? WHEN,
  footprints: o.footprints,
  gridSpaceCount: o.gridSpaceCount,
  layoutCoverage: o.layoutCoverage ?? 0.4,
  regionCellM: 100,
  roleTract: 'comp_tract',
  roleWaterbody: 'comp_waterbody',
});

// ---------- 站点面积由占地反推（R10-7.5 不分片站点；G5b） ----------
// 前提：区格边长 100 m（面积 10,000 m²）、layoutCoverage 0.4（分母 0.4 × 10,000 = 4,000 m²）、细格 1 m；形制 bldform_t 无房间、planSideMaxCells 64。
const siteRows = (extra = []) => rowsOf([['loc_root', { parent: null }], ['loc_site', { parent: 'loc_root' }], ...extra]);
const home = (id, w, d) => [id, bld({ parent: 'loc_site', planCells: { widthCells: w, depthCells: d }, storeys: 1, wallThicknessM: 0.4 })];
const targetOf = (out, id) => (out.proposals.find((p) => p.id === id) || { dims: {} }).dims.targetAreaM2;

test('站点面积：N = max(1, ceil(占地 ÷ (coverage × 区格面积)))，targetAreaM2 = N × 10,000；占地取各建筑平面格数（宽 × 深 × 1 m²），手算：72 m² → ceil(72 ÷ 4,000) = 1；2 × 50 × 50 = 5,000 m² → ceil(5,000 ÷ 4,000) = 2', () => {
  const small = run({ rows: siteRows([home('bld_a', 6, 6), home('bld_b', 6, 6)]), authoredIds: new Set(['loc_site', 'bld_a', 'bld_b']) });
  assert.equal(targetOf(small, 'loc_site'), 10000);
  const big = run({ rows: siteRows([home('bld_a', 50, 50), home('bld_b', 50, 50)]), authoredIds: new Set(['loc_site', 'bld_a', 'bld_b']) });
  assert.equal(targetOf(big, 'loc_site'), 20000);
  // 手写优先：作者写了 targetAreaM2 或 boundary 的站点不动。
  const authored = rowsOf([['loc_root', { parent: null }], ['loc_site', { parent: 'loc_root', targetAreaM2: 50000 }], home('bld_a', 50, 50)]);
  assert.equal(targetOf(run({ rows: authored, authoredIds: new Set(['loc_site', 'bld_a']) }), 'loc_site'), undefined);
  const drawn = rowsOf([['loc_root', { parent: null }], ['loc_site', { parent: 'loc_root', boundary: [{ x: 0, y: 0 }] }], home('bld_a', 50, 50)]);
  assert.equal(targetOf(run({ rows: drawn, authoredIds: new Set(['loc_site', 'bld_a']) }), 'loc_site'), undefined);
});

test('站点面积：N 只由占地决定，不按子行加量（R10-7.5）：站点下挂一个目标 30,000 m² 的子行，建筑占地 72 m² 仍写 1 格 = 10,000 m²', () => {
  const kid = ['loc_k1', { parent: 'loc_site', targetAreaM2: 30000 }];
  const out = run({ rows: siteRows([home('bld_a', 6, 6), kid]), authoredIds: new Set(['loc_site', 'bld_a', 'loc_k1']) });
  assert.equal(targetOf(out, 'loc_site'), 10000);
});

test('站点面积：起始 N 超过所在存量单元足迹格数即 E-GEN-ROW-INVALID（R10-7.5 末，站点的父行是存量单元时判）：2 × 50 × 50 = 5,000 m² → N = ceil(5,000 ÷ 4,000) = 2；存量单元 1 格报错，2 格放行；划不出足迹记缺口 tract_footprint_unplanned；父行不是存量单元不判', () => {
  const rows = () => rowsOf([['loc_root', { parent: null }], ['loc_tract', { parent: 'loc_root', classes: ['comp_tract'] }], ['loc_site', { parent: 'loc_tract' }], home('bld_a', 50, 50), home('bld_b', 50, 50)]);
  const authored = new Set(['loc_site', 'bld_a', 'bld_b']);
  const cells = (n) => () => ({ footprints: { loc_tract: { cellCount: n } } });
  assert.equal(codeOf(() => run({ rows: rows(), authoredIds: authored, footprints: cells(1), gridSpaceCount: 1 })), 'E-GEN-ROW-INVALID');
  assert.equal(targetOf(run({ rows: rows(), authoredIds: authored, footprints: cells(2), gridSpaceCount: 1 }), 'loc_site'), 20000);
  const unplanned = run({ rows: rows(), authoredIds: authored, footprints: () => null, gridSpaceCount: 0 });
  assert.deepEqual(unplanned.deferred.filter((d) => d.reason === 'tract_footprint_unplanned'), [{ id: 'loc_site', reason: 'tract_footprint_unplanned', gaps: ['loc_tract'] }]);
  assert.equal(targetOf(unplanned, 'loc_site'), 20000);
  // 父行不是存量单元：即使给了只有 1 格的足迹也不判。
  const notTract = run({ rows: siteRows([home('bld_a', 50, 50), home('bld_b', 50, 50)]), authoredIds: authored, footprints: () => ({ footprints: { loc_root: { cellCount: 1 } } }) });
  assert.equal(targetOf(notTract, 'loc_site'), 20000);
});

test('站点面积：没有建筑清单的地点也写面积（占地 0 → 最少 1 格 = 10,000 m²，卷五 §4.1 规则 2、13）；政区（有 regionLevel）、存量单元（comp_tract）、水体、层根下的直接子行外的根行不写，仍照规则 10 平分；每个地点的格数来自它自己的目标面积', () => {
  const rows = rowsOf([
    ['loc_root', { parent: null }],
    ['loc_county', { parent: 'loc_root', regionLevel: 'juris_county' }],
    ['loc_place', { parent: 'loc_county' }],
    ['loc_field', { parent: 'loc_county', classes: ['comp_tract'] }],
    ['loc_river', { parent: 'loc_root', classes: ['comp_waterbody'] }],
  ]);
  const out = run({ rows, authoredIds: new Set(['loc_root', 'loc_county', 'loc_place', 'loc_field', 'loc_river']) });
  assert.deepEqual(out.proposals.map((p) => p.id), ['loc_place']);
  assert.equal(targetOf(out, 'loc_place'), 10000);
});

test('站点面积：有格空间表、存量单元却没有足迹（不在 footprints 里，或足迹结果为 null）即 E-GEN-ROW-INVALID，不记缺口放行（R10-7.5 排不下同一口径）', () => {
  const rows = () => rowsOf([['loc_root', { parent: null }], ['loc_tract', { parent: 'loc_root', classes: ['comp_tract'] }], ['loc_site', { parent: 'loc_tract' }], home('bld_a', 6, 6)]);
  const authored = new Set(['loc_site', 'bld_a']);
  for (const footprints of [() => ({ footprints: {} }), () => null]) {
    assert.equal(codeOf(() => run({ rows: rows(), authoredIds: authored, footprints, gridSpaceCount: 1 })), 'E-GEN-ROW-INVALID');
  }
});

test('站点面积：layoutCoverage 出域（0、大于 1、负、不是数）即 E-GEN-ROW-INVALID', () => {
  for (const bad of [0, 1.5, -1, 'x']) {
    assert.equal(codeOf(() => run({ rows: siteRows([home('bld_a', 6, 6)]), authoredIds: new Set(['loc_site', 'bld_a']), layoutCoverage: bad })), 'E-GEN-ROW-INVALID', String(bad));
  }
});

test('A10-2.4 ⑤：缺墙厚、平面格数、层数时按规则行补出，值可与作者值一起展开成蓝图', () => {
  const id = 'loc_b1';
  const out = run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.equal(out.proposals.length, 1);
  const p = out.proposals[0];
  assert.equal(p.table, 'place');
  assert.equal(p.id, id);
  assert.deepEqual(p.dims, { wallThicknessM: 0.4, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  assert.equal(p.by, 'gstage_siteform');
  assert.match(p.seedKey, /^[0-9a-f]{64}$/);
  // 层数是用 planBlueprint 输入域上限夹出的（卷十九 buildPlan 的材料上限还没有）：如实记缺口 storeys_max_unchecked（修改轮 M5）。
  assert.deepEqual(out.deferred, [{ id, reason: 'storeys_max_unchecked', gaps: ['storeys'] }]);
  const bp = planBlueprint({ form: F36, planCells: { widthCells: 6, depthCells: 6 }, storeys: 1, wallThicknessM: 0.4, facing: 0 }, BLUEPRINT);
  assert.equal(bp.ok, true);
});

test('手写优先：作者写了的维度原样当输入读，提案不带该维度；三项都写了就没有提案', () => {
  const id = 'loc_b1';
  const onlyPlan = run({ rows: rowsOf([[id, bld({ planCells: { widthCells: 8, depthCells: 5 } })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(onlyPlan.proposals[0].dims, { wallThicknessM: 0.4, storeys: 1 });
  const onlyWall = run({ rows: rowsOf([[id, bld({ wallThicknessM: 0.5 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(onlyWall.proposals[0].dims, { planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  const all = run({ rows: rowsOf([[id, bld({ wallThicknessM: 0.5, planCells: { widthCells: 8, depthCells: 5 }, storeys: 2 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(all.proposals, []);
  assert.deepEqual(all.deferred, []);
});

test('不带墙的形制（walled 假）不补墙厚', () => {
  const id = 'loc_b1';
  const noWall = { ...F36, walled: false };
  const out = run({ vocab: vocabOf([['bldform_nw', formEntry(noWall)]]), rows: rowsOf([[id, bld({ form: 'bldform_nw' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.proposals[0].dims, { planCells: { widthCells: 6, depthCells: 6 }, storeys: 1 });
  assert.equal(Object.hasOwn(out.proposals[0].dims, 'wallThicknessM'), false);
});

test('房间分不下时面积逐次加倍：4 → 8 → 16 → 32 → 64 m²，补出的平面格数与蓝图都能展开', () => {
  const id = 'loc_b1';
  const out = run({ vocab: VOCAB(), rows: rowsOf([[id, bld({ form: 'bldform_r' })]]), authoredIds: new Set([id]), bldfillRows: fill(4, 1) });
  assert.deepEqual(out.proposals[0].dims.planCells, { widthCells: 8, depthCells: 8 });
  const bp = planBlueprint({ form: F3R, planCells: { widthCells: 8, depthCells: 8 }, storeys: out.proposals[0].dims.storeys, wallThicknessM: out.proposals[0].dims.wallThicknessM, facing: 0 }, BLUEPRINT);
  assert.equal(bp.ok, true);
});

test('作者写的 planCells 分不下一房间也不加倍：E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const code = codeOf(() => run({ vocab: VOCAB(), rows: rowsOf([[id, bld({ form: 'bldform_r', planCells: { widthCells: 3, depthCells: 3 } })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }));
  assert.equal(code, 'E-GEN-ROW-INVALID');
});

test('缺必填与规则行不适用：缺 form、form 不是 bform 族条目、没有适用规则行、whenRX 不命中都报 E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const noForm = rowsOf([[id, { parent: null, classes: ['comp_facility'] }]]);
  assert.equal(codeOf(() => run({ rows: noForm, authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID');
  const notForm = vocabOf([['bldform_x', { family: 'gfield', entry: F36 }]]);
  assert.equal(codeOf(() => run({ vocab: notForm, rows: rowsOf([[id, bld({ form: 'bldform_x' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID');
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: [] })), 'E-GEN-ROW-INVALID');
  const never = [{ whenRX: '!known(form)', priority: 1, areaM2: point(36), storeys: point(1) }];
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: never })), 'E-GEN-ROW-INVALID');
});

test('form 写 null 或不存在的条目同缺 form：E-GEN-ROW-INVALID，没有"未建列"例外（卷十 :684；真实世界建筑缺形制由数据补齐）', () => {
  for (const form of [null, 'bldform_nope']) {
    assert.equal(codeOf(() => run({ rows: rowsOf([['loc_nl', bld({ form })]]), authoredIds: new Set(['loc_nl']), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID', String(form));
  }
});

test('层数夹进 [max(1, 1 − storeyBase), storeysMax]：形制 storeyBase −2 时下限 3，区间为空即 E-GEN-ROW-INVALID', () => {
  const id = 'loc_b1';
  const vocab = () => vocabOf([['bldform_sb', formEntry({ ...F36, storeyBase: -2 })]]);
  const rows = () => rowsOf([[id, bld({ form: 'bldform_sb' })]]);
  assert.equal(run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }).proposals[0].dims.storeys, 3);
  assert.equal(run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 10) }).proposals[0].dims.storeys, 10);
  const capped = { ...BLUEPRINT, limits: { ...BLUEPRINT.limits, storeysMax: 2 } };
  assert.equal(codeOf(() => run({ vocab: vocab(), rows: rows(), authoredIds: new Set([id]), bldfillRows: fill(36, 1), blueprint: capped })), 'E-GEN-ROW-INVALID');
});

test('确定性：同种子两次逐项相同，换种子至少一行的平面格数不同，每行补出的平面都能展开', () => {
  const ids = ['loc_b1', 'loc_b2', 'loc_b3', 'loc_b4', 'loc_b5', 'loc_b6', 'loc_b7', 'loc_b8'];
  const entries = ids.map((id) => [id, bld()]);
  const authored = new Set(ids);
  const uniform = [{ whenRX: 'known(form)', priority: 1, areaM2: { dist: 'uniform', min: 20, max: 60 }, storeys: point(1) }];
  const a = run({ worldSeed: 'seed_same', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  const b = run({ worldSeed: 'seed_same', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  assert.deepEqual(a, b);
  const c = run({ worldSeed: 'seed_other', rows: rowsOf(entries), authoredIds: authored, bldfillRows: uniform });
  const cells = (out) => new Map(out.proposals.map((p) => [p.id, p.dims.planCells]));
  assert.notDeepEqual(cells(a), cells(c));
  assert.equal(a.proposals.length, ids.length);
  for (const p of a.proposals) {
    const bp = planBlueprint({ form: F36, planCells: p.dims.planCells, storeys: p.dims.storeys, wallThicknessM: p.dims.wallThicknessM, facing: 0 }, BLUEPRINT);
    assert.equal(bp.ok, true, `${p.id} 补出的平面应能展开`);
  }
});

test('范围：只处理作者写的、挂 roleFacility 的建筑行，其余行不出提案', () => {
  const rows = rowsOf([
    ['loc_a', bld()],
    ['loc_b', bld({ classes: [] })],
    ['loc_c', bld()],
  ]);
  const out = run({ rows, authoredIds: new Set(['loc_b', 'loc_c']), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.proposals.map((p) => p.id), ['loc_c']);
});

test('房间行缺口：缺的房间按 roomRole 与序号列出，补上房间行后缺口收窄', () => {
  const F2R = {
    ...F36,
    rooms: [{ role: 'roomrole_x', share: 0.5, level: 0, open: false }, { role: 'roomrole_y', share: 0.5, level: 0, open: false }],
  };
  const vocab = vocabOf([['bldform_2r', formEntry(F2R)]]);
  const building = ['loc_b', { parent: null, classes: ['comp_facility'], form: 'bldform_2r', planCells: { widthCells: 8, depthCells: 8 }, storeys: 1 }];
  const first = run({ vocab, rows: rowsOf([building]), authoredIds: new Set(['loc_b']) });
  assert.equal(first.deferred.length, 1);
  assert.equal(first.deferred[0].id, 'loc_b');
  assert.equal(first.deferred[0].reason, 'room_rows_unbuilt');
  assert.deepEqual([...first.deferred[0].gaps].sort(), ['roomrole_x#0', 'roomrole_y#0']);
  const room = ['loc_b_r1', { parent: 'loc_b', classes: ['comp_zone'], roomRole: 'roomrole_x' }];
  const second = run({ vocab, rows: rowsOf([building, room]), authoredIds: new Set(['loc_b']) });
  assert.equal(second.deferred.length, 1);
  assert.equal(second.deferred[0].id, 'loc_b');
  assert.deepEqual(second.deferred[0].gaps, ['roomrole_y#0']);
});

// ---------- 修改轮（Opus 只核 M1、M3）：不铺格的可行性预判与终止 ----------

test('planFeasible 与 planBlueprint 的 ok、reason 逐项相同（不铺格的预判，覆盖四种不可行与可行）', () => {
  const open = (o) => ({ role: 'roomrole_a', share: 1, level: 0, open: o });
  const forms = [
    F36, F3R,
    { ...F36, rooms: [open(true), { role: 'roomrole_b', share: 1, level: 1, open: false }] }, // 楼面压在开敞房间上
    { ...F36, rooms: [open(true), { role: 'roomrole_b', share: 1, level: 1, open: true }] }, // 上下都开敞：可行
    { ...F36, rooms: [open(false), { role: 'roomrole_b', share: 1, level: 1, open: true }] },
    { ...F36, storeyBase: -3 }, // 纯地下
    { ...F36, walled: false },
  ];
  let seen = 0;
  for (const form of forms) {
    for (const storeys of [1, 2, 3, 4]) {
      for (const [widthCells, depthCells] of [[3, 3], [4, 4], [6, 6], [7, 5], [8, 8], [9, 12], [5, 20]]) {
        const input = { form, planCells: { widthCells, depthCells }, storeys, wallThicknessM: 0.4, facing: 0 };
        const bp = planBlueprint(input, BLUEPRINT);
        const f = planFeasible(input, BLUEPRINT);
        assert.equal(f.ok, bp.ok, JSON.stringify([form.rooms.length, form.storeyBase, storeys, widthCells, depthCells]));
        assert.equal(f.reason, bp.reason);
        seen += 1;
      }
    }
  }
  assert.equal(seen, 7 * 4 * 7);
});

test('终止靠卷十 :688 的形制登记上限：面积无关的 floorOverOpenRoom 一律加倍到 planCells 越形制 planSideMaxCells（夹具 64）上限，报 E-GEN-ROW-INVALID，预判不铺格所以不耗内存', () => {
  const id = 'loc_b1';
  const stack = { ...F36, rooms: [{ role: 'roomrole_a', share: 1, level: 0, open: true }, { role: 'roomrole_b', share: 1, level: 1, open: false }] };
  const vocab = vocabOf([['bldform_stack', formEntry(stack)]]);
  const e = (() => { try { run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_stack' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 2) }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  // 面积 36 逐次加倍（A = 36·2ᵏ，aspect 1、墙厚 0.4 → m = 3）：k = 6（2304）时 D = 48、W = 48 仍在上限 64 内；k = 7（4608）时 D = ⌊√4608⌋ = 67、W = ceil(4608 ÷ 67) = 69 > 64，拒收。
  assert.match(e.message, /planSideMaxCells is 64/);
  assert.deepEqual({ ...e.fields }, { building: id, form: 'bldform_stack', max_cells: 64, need_depth_cells: 67, need_width_cells: 69, reason: 'plan_cells_over_form_cap' });
});

test('entranceNotAdjacent 与面积无关（只读 storeyBase 与 storeys）：提前报 E-GEN-ROW-INVALID，不加倍', () => {
  const id = 'loc_b1';
  const vocab = vocabOf([['bldform_ug', formEntry({ ...F36, storeyBase: -3 })]]);
  const e = (() => { try { run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_ug', storeys: 1 })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.match(e.message, /bp_entrance_not_adjacent/);
});

test('层数缺口：用域上限夹过层数的行才记 storeys_max_unchecked；作者写了层数的行不记', () => {
  const rows = rowsOf([['loc_b1', bld()], ['loc_b2', bld({ storeys: 1 })]]);
  const out = run({ rows, authoredIds: new Set(['loc_b1', 'loc_b2']), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.deferred.filter((d) => d.reason === 'storeys_max_unchecked').map((d) => d.id), ['loc_b1']);
});

// ---------- 封卷后勘误 1121k20/k21：形制登记上限（李白 11-22 裁定事件 3ce50e60 取甲） ----------

test('超出形制上限：加倍到上限就停，仍放不下即 E-GEN-ROW-INVALID，日志字段写明哪栋、哪个形制、要多大、上限多少；恰到上限的形制放行，不截断、不缩房间', () => {
  const id = 'loc_b1';
  // 三房间形制（见文件头手算）：面积 4 → 8 → 16 → 32 逐次加倍都不可行；64 时外包 8×8（D = ⌊√64⌋ = 8，W = ceil(64 ÷ 8) = 8）才可分。
  const at = (cap) => vocabOf([['bldform_r', formEntry({ ...F3R, planSideMaxCells: cap })]]);
  const run4 = (cap) => run({ vocab: at(cap), rows: rowsOf([[id, bld({ form: 'bldform_r' })]]), authoredIds: new Set([id]), bldfillRows: fill(4, 1) });
  // 上限 8：8×8 恰在上限，放行，补出的平面就是 8×8（没有被缩小）。
  assert.deepEqual(run4(8).proposals[0].dims.planCells, { widthCells: 8, depthCells: 8 });
  // 上限 7：32 m² 时外包 7×5（W = ceil(32 ÷ 5) = 7，D = ⌊√32⌋ = 5）在上限内但房间分不下；64 m² 要 8×8 > 7：拒收。
  const e = (() => { try { run4(7); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e.fields }, { building: id, form: 'bldform_r', max_cells: 7, need_depth_cells: 8, need_width_cells: 8, reason: 'plan_cells_over_form_cap' });
  // 上限来自形制：同一栋换一个上限 9 的形制，同样的规则行就放行。
  assert.deepEqual(run4(9).proposals[0].dims.planCells, { widthCells: 8, depthCells: 8 });
});

test('作者写的 planCells 超过形制上限：同样拒收并带字段，不截断', () => {
  const id = 'loc_b1';
  const vocab = vocabOf([['bldform_cap8', formEntry({ ...F36, planSideMaxCells: 8 })]]);
  const e = (() => { try { run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_cap8', planCells: { widthCells: 9, depthCells: 3 } })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e.fields }, { building: id, form: 'bldform_cap8', max_cells: 8, need_depth_cells: 3, need_width_cells: 9, reason: 'plan_cells_over_form_cap' });
});

test('形制没登记上限（缺、0、非整数）：补缺入口一律拒收 E-GEN-ROW-INVALID，没有默认放大', () => {
  const id = 'loc_b1';
  for (const cap of [undefined, null, 0, 8.5]) {
    const vocab = vocabOf([['bldform_nocap', formEntry({ ...F36, planSideMaxCells: cap })]]);
    assert.equal(codeOf(() => run({ vocab, rows: rowsOf([[id, bld({ form: 'bldform_nocap' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID', String(cap));
  }
});

test('起始地区现有全部手写建筑在真实形制上限下都排得下，补出的蓝图总格数不超过形制上限推出的界，内存在正常范围', () => {
  const rowsIn = START.rows.filter((r) => typeof r.form === 'string');
  assert.ok(rowsIn.length > 0);
  const ids = new Set(rowsIn.map((r) => r.id));
  const out = (() => {
    const before = process.memoryUsage().heapUsed;
    const res = genSiteForm({
      table: 'place', stage: 'gstage_siteform', worldSeed: 'seed_start_region', genesisMinute: 0, vocab: world.vocab,
      rows: rowsOf(rowsIn.map((r) => [r.id, { parent: null, classes: ['comp_facility'], form: r.form }])), authoredIds: ids,
      bldfillRows: world.rules.gen.bldfillRows, roleFacility: world.rules.gen.roleFacility, blueprint: BLUEPRINT, when: WHEN,
      layoutCoverage: world.rules.gen.layoutCoverage, regionCellM: world.rules.grid.regionCellM, roleTract: world.rules.gen.roleTract, roleWaterbody: world.rules.gen.roleWaterbody,
    });
    return { res, grown: process.memoryUsage().heapUsed - before };
  })();
  assert.equal(out.res.proposals.length, rowsIn.length);
  let totalCells = 0;
  let totalBound = 0;
  for (const r of rowsIn) {
    const cap = world.vocab.index.get(r.form).entry.planSideMaxCells;
    const d = out.res.proposals.find((p) => p.id === r.id).dims;
    assert.ok(d.planCells.widthCells <= cap && d.planCells.depthCells <= cap, `${r.id} 平面在形制上限内`);
    const bp = planBlueprint({ form: world.vocab.index.get(r.form).entry, planCells: d.planCells, storeys: d.storeys, wallThicknessM: d.wallThicknessM, facing: 0 }, BLUEPRINT);
    assert.equal(bp.ok, true, `${r.id} 能展开`);
    totalCells += bp.cells.length;
    totalBound += cap * cap * (d.storeys + 2); // 每层至多 cap² 格，加最低一层之下的地板与屋面共两层
  }
  assert.ok(totalCells <= totalBound);
  assert.ok(out.grown < 256 * 1024 * 1024, `堆增长 ${out.grown} 字节应在正常范围`);
});

test('统一硬数 4096 已删：规则表 rules.facility.blueprint 没有 planCellsMax，planCells 维度域没有上界', () => {
  assert.equal(Object.hasOwn(world.rules.facility.blueprint, 'planCellsMax'), false);
  const dom = json('world/ontology/dimensions/place.json').dimensions.planCells.fields;
  assert.equal(dom.widthCells.domain[1], null);
  assert.equal(dom.depthCells.domain[1], null);
});
