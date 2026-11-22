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
import { genDiceKey } from '../../server-plugin/kernel/gen/draw.mjs';
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
  layoutGapCells: Object.hasOwn(o, 'layoutGapCells') ? o.layoutGapCells : 2,
  latitudeDegOf: o.latitudeDegOf,
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

test('规则行不适用与形制不对：form 不是 bform 族条目、没有适用规则行、whenRX 不命中都报 E-GEN-ROW-INVALID（缺 form 不在此列：按卷十 R10-7.12 勘误 1123k31 先补形制，见下）', () => {
  const id = 'loc_b1';
  const notForm = vocabOf([['bldform_x', { family: 'gfield', entry: F36 }]]);
  assert.equal(codeOf(() => run({ vocab: notForm, rows: rowsOf([[id, bld({ form: 'bldform_x' })]]), authoredIds: new Set([id]), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID');
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: [] })), 'E-GEN-ROW-INVALID');
  const never = [{ whenRX: '!known(form)', priority: 1, areaM2: point(36), storeys: point(1) }];
  assert.equal(codeOf(() => run({ rows: rowsOf([[id, bld()]]), authoredIds: new Set([id]), bldfillRows: never })), 'E-GEN-ROW-INVALID');
});

test('作者写了 form 却是 null 或登记里没有的条目：作者数据错，E-GEN-ROW-INVALID，不当作"没写"去补（补缺只对 form 键缺的行）', () => {
  for (const form of [null, 'bldform_nope']) {
    assert.equal(codeOf(() => run({ rows: rowsOf([['loc_nl', bld({ form })]]), authoredIds: new Set(['loc_nl']), bldfillRows: fill(36, 1) })), 'E-GEN-ROW-INVALID', String(form));
  }
});

// ---------- 缺 form 的补缺（卷十 R10-7.12 封卷后勘误 1123k31；李白 11-23 事件 08673f69 第 1 条） ----------
// 前提：登记里三个有顶形制 bldform_a（墙厚缺省 0.4）、bldform_b（0.8）、bldform_c（1.2），都 walled；设施类型 facility_any 两个上限都空（无要求），候选 = 登记全部条目，等权按抽取点 site_gen_bldfill_form 取；
// 行上没有 intendedType、类型行不在族里、或筛后无形制，都记缺口 form_type_unmatched、不补。
const thick = (m) => formEntry({ ...F36, wallThicknessDefaultM: m, wallThicknessMinM: m });
const TYPE_ANY = ['facility_any', { family: 'facility_type', entry: { maxSkyExposure: null, maxAperture: null } }];
const THREE = () => vocabOf([['bldform_a', thick(0.4)], ['bldform_b', thick(0.8)], ['bldform_c', thick(1.2)], TYPE_ANY]);
const WALL_OF = { bldform_a: 0.4, bldform_b: 0.8, bldform_c: 1.2 };
const noFormRow = (extra = {}) => ({ parent: null, classes: ['comp_facility'], intendedType: 'facility_any', ...extra });
const manyIds = Array.from({ length: 30 }, (_, i) => `loc_n${String(i).padStart(2, '0')}`);

test('缺 form：从登记里取一个并写进提案，补出的 form 必在登记里；墙厚缺省随所取形制（手算：形制 b 的缺省 0.8，不是别的形制的）；同种子两次逐项相同', () => {
  const entries = manyIds.map((id) => [id, noFormRow()]);
  const authored = new Set(manyIds);
  const a = run({ vocab: THREE(), rows: rowsOf(entries), authoredIds: authored, bldfillRows: fill(36, 1) });
  const b = run({ vocab: THREE(), rows: rowsOf(entries), authoredIds: authored, bldfillRows: fill(36, 1) });
  assert.deepEqual(a, b);
  assert.equal(a.proposals.length, manyIds.length);
  for (const p of a.proposals) {
    assert.ok(Object.hasOwn(WALL_OF, p.dims.form), p.id);
    assert.equal(p.dims.wallThicknessM, WALL_OF[p.dims.form], p.id);
  }
});

test('缺 form：登记只有一个形制时恰取它（手算：等权三取一退化为一取一）；换世界种子，30 行里至少一行取到不同的形制', () => {
  const only = () => vocabOf([['bldform_a', thick(0.4)], TYPE_ANY]);
  const entries = manyIds.map((id) => [id, noFormRow()]);
  const authored = new Set(manyIds);
  const one = run({ vocab: only(), rows: rowsOf(entries), authoredIds: authored, bldfillRows: fill(36, 1) });
  assert.deepEqual(one.proposals.map((p) => p.dims.form), manyIds.map(() => 'bldform_a'));
  const x = run({ worldSeed: 'seed_form_x', vocab: THREE(), rows: rowsOf(entries), authoredIds: authored, bldfillRows: fill(36, 1) });
  const y = run({ worldSeed: 'seed_form_y', vocab: THREE(), rows: rowsOf(entries), authoredIds: authored, bldfillRows: fill(36, 1) });
  assert.ok(x.proposals.some((p, i) => p.dims.form !== y.proposals[i].dims.form));
});

test('缺 form：作者写了 form 的行原样不动（提案不带 form，墙厚照作者所写形制的缺省补）；作者已写的 form 不因登记里别的形制而改', () => {
  const entries = [['loc_w1', bld({ form: 'bldform_b' })], ['loc_w2', noFormRow()]];
  const out = run({ vocab: THREE(), rows: rowsOf(entries), authoredIds: new Set(['loc_w1', 'loc_w2']), bldfillRows: fill(36, 1) });
  const kept = out.proposals.find((p) => p.id === 'loc_w1');
  assert.equal(Object.hasOwn(kept.dims, 'form'), false);
  assert.equal(kept.dims.wallThicknessM, 0.8);
  assert.equal(Object.hasOwn(out.proposals.find((p) => p.id === 'loc_w2').dims, 'form'), true);
});

test('缺 form：补出的 form 记在提案里、来源标记取形制抽取点的骰值键（与面积抽取点的键不同）；作者写了 form 的行仍用面积抽取点的键', () => {
  const entries = [['loc_w1', bld({ form: 'bldform_b' })], ['loc_w2', noFormRow()]];
  const out = run({ vocab: THREE(), rows: rowsOf(entries), authoredIds: new Set(['loc_w1', 'loc_w2']), bldfillRows: fill(36, 1) });
  const seedOf = (id) => out.proposals.find((p) => p.id === id).seedKey;
  assert.notEqual(seedOf('loc_w1'), seedOf('loc_w2'));
  assert.equal(seedOf('loc_w2'), genDiceKey('gen_siteform', 'site_gen_bldfill_form', 'seed_siteform', 'loc_w2', 0));
  assert.equal(seedOf('loc_w1'), genDiceKey('gen_siteform', 'site_gen_bldfill_area', 'seed_siteform', 'loc_w1', 0));
});

test('缺 form：行上没有设施类型、类型行不在 facility_type 族、登记为空 → 不报错、不补、不自造，该行进缺口 form_type_unmatched，无提案；不计入站点占地（手算：另一栋 6 × 6 → 36 m² → N = 1 格 = 10,000 m²）', () => {
  const rows = siteRows([['bld_x', noFormRow({ parent: 'loc_site', intendedType: undefined })], ['bld_y', noFormRow({ parent: 'loc_site', intendedType: 'bldform_a' })], ['bld_z', noFormRow({ parent: 'loc_site' })]]);
  const out = run({ vocab: THREE(), rows, authoredIds: new Set(['loc_site', 'bld_x', 'bld_y', 'bld_z']), bldfillRows: fill(36, 1) });
  assert.deepEqual(out.proposals.map((p) => p.id), ['bld_z', 'loc_site']); // 有类型的 bld_z 补出；bld_x 无类型、bld_y 的类型不在族里
  assert.equal(targetOf(out, 'loc_site'), 10000);
  assert.deepEqual(out.deferred.filter((d) => d.reason === 'form_type_unmatched'), [{ id: 'bld_x', reason: 'form_type_unmatched', gaps: ['form'] }, { id: 'bld_y', reason: 'form_type_unmatched', gaps: ['form'] }]);
  const empty = run({ vocab: vocabOf([TYPE_ANY]), rows: siteRows([['bld_z', noFormRow({ parent: 'loc_site' })]]), authoredIds: new Set(['loc_site', 'bld_z']), bldfillRows: fill(36, 1) });
  assert.deepEqual(empty.deferred.filter((d) => d.reason === 'form_type_unmatched').map((d) => d.id), ['bld_z']);
});

test('缺 form：按设施类型筛（卷十九 §4.5 规则 2 ③）：类型 facility_dry 要求设计露天比例 ≤ 0，有顶形制 bldform_a（roofed 真，设计露天 0）留下，无顶形制 bldform_open（roofed 假，露天 > 0）剔除，所以只取 bldform_a；类型 facility_open 无要求时两者都可取', () => {
  const open = formEntry({ ...F36, roofed: false });
  const vocab = vocabOf([['bldform_a', thick(0.4)], ['bldform_open', open], ['facility_dry', { family: 'facility_type', entry: { maxSkyExposure: 0, maxAperture: null } }], ['facility_open', { family: 'facility_type', entry: { maxSkyExposure: null, maxAperture: null } }]]);
  const ids = manyIds;
  const dry = run({ vocab, rows: rowsOf(ids.map((id) => [id, noFormRow({ intendedType: 'facility_dry' })])), authoredIds: new Set(ids), bldfillRows: fill(36, 1) });
  assert.deepEqual([...new Set(dry.proposals.map((p) => p.dims.form))], ['bldform_a']);
  const any = run({ vocab, rows: rowsOf(ids.map((id) => [id, noFormRow({ intendedType: 'facility_open' })])), authoredIds: new Set(ids), bldfillRows: fill(36, 1) });
  assert.deepEqual([...new Set(any.proposals.map((p) => p.dims.form))].sort(), ['bldform_a', 'bldform_open']);
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

// ---------- 落位（卷十 R10-7.11、R10-3.12；R10-7.5 末排不下 N 加一重排；卷十九 §4.5 规则 11） ----------
// 前提（测试自造，不读仓库此刻的计数）：区格边 100 m = 100 × 100 细格（细格 1 m）、gapCells 2、layoutCoverage 0.4；站点 loc_site 挂在存量单元 loc_tract 下；
// 站点足迹由 strip 夹具给：N 个区格沿 x 排成一行 (0,0)…(N−1,0)（N 取试排写的 targetAreaM2 ÷ 10,000；真划分在 gen-layout-fill.test.mjs 用真内核走一遍），地表层号恒为 3、格空间序号 w = 0。
// 行架手算见各用例；站点区格 (0,0) 外包 x 0..99、y 0..99，一栋放得下当且仅当外扩 2 格后全在足迹内：x0 ≥ 2、y0 ≥ 2。
const BIGF = formEntry({ ...F36, planSideMaxCells: 256 });
const LAY_VOCAB = () => vocabOf([['bldform_big', BIGF], TYPE_ANY]);
const layRows = (kids, siteExtra = {}) => rowsOf([['loc_root', { parent: null }], ['loc_tract', { parent: 'loc_root', classes: ['comp_tract'] }], ['loc_site', { parent: 'loc_tract', coord: { x: 50, y: 50 }, ...siteExtra }], ...kids]);
const kid = (id, w, d, extra = {}) => [id, bld({ parent: 'loc_site', form: 'bldform_big', planCells: { widthCells: w, depthCells: d }, storeys: 1, wallThicknessM: 0.4, ...extra })];
const strip = ({ tract = 8, fixed = 1, z = 3 } = {}) => (o = {}) => {
  const target = o.extra && o.extra.loc_site ? o.extra.loc_site.targetAreaM2 : fixed * 10000;
  const n = target / 10000;
  return { footprints: { loc_tract: { cellCount: tract }, loc_site: { w: 0, cellCount: n } }, probe: { cells: function* cells(id) { if (id === 'loc_site') for (let x = 0; x < n; x += 1) yield { x, y: 0 }; }, surfaceStoreyAt: () => z } };
};
const layRun = (kids, o = {}) => run({
  vocab: o.vocab ?? LAY_VOCAB(), rows: layRows(kids, o.site), authoredIds: new Set(['loc_site', ...kids.map((k) => k[0])]), bldfillRows: fill(36, 1),
  footprints: o.footprints ?? strip(o.strip), gridSpaceCount: o.grid ?? 1, latitudeDegOf: o.lat === null ? () => null : () => (o.lat ?? 31),
});
const dimsOf = (out, id) => out.proposals.filter((p) => p.id === id).reduce((a, p) => ({ ...a, ...p.dims }), {});
const pos = (x, y, z = 3) => ({ w: 0, x, y, z, coarse: false });

test('落位手算：三栋 6×6、8×4（作者写 facing 0）、6×6，站点 1 格（占地 36 + 32 + 36 = 104 m² → N = 1），纬度 31 → 朝向 4（面向赤道）：(7,2)、(10,5)、(25,2)', () => {
  // 蓝图局部 (u, v) → 偏移 (x, y) = (u, −v)，再顺时针每个四分之一圈 (x, y) → (y, −x)（卷十九 §4.5 规则 7 第 2 点）；朝向 4 = 转两个四分之一圈 → (−u, v)：6×6 外包 {−5, 0, 0, 5}；
  // 朝向 0：8×4 外包 {0, −3, 7, 0}。三栋无锚点，同遍按行 id 序：a、b、c。游标从 (0,0) 起：
  // a：行 y=0、y=1 外扩出界（y − 2 < 0）；行 y=2：x=0、1 外扩出界，x=2 外扩 [0..9]×[0..9] 在足迹内 → 矩形 [2..7]×[2..7]，锚点 = (x0 − dx0, y0 − dy0) = (2 + 5, 2 − 0) = (7, 2)；游标挪到 x = 2 + 6 + 2 = 10。
  // b：x=10：外扩 [8..19]×[0..7] 在内，与 a 外包外扩 2（x ≤ 9）不相交（10 > 7 + 2）→ [10..17]×[2..5]，锚点 (10 − 0, 2 + 3) = (10, 5)；游标 x = 10 + 8 + 2 = 20，本行已放最深 6。
  // c：x=20：与 b 外扩（x ≤ 19）不相交（20 > 17 + 2）→ [20..25]×[2..7]，锚点 (20 + 5, 2 − 0) = (25, 2)。
  const kids = [kid('bld_a', 6, 6), kid('bld_b', 8, 4, { facing: 0 }), kid('bld_c', 6, 6)];
  const out = layRun(kids);
  assert.deepEqual(dimsOf(out, 'bld_a'), { anchor: pos(7, 2), facing: 4 });
  assert.deepEqual(dimsOf(out, 'bld_b'), { anchor: pos(10, 5) }); // 作者写了 facing 0：不出 facing 提案
  assert.deepEqual(dimsOf(out, 'bld_c'), { anchor: pos(25, 2), facing: 4 });
  assert.equal(targetOf(out, 'loc_site'), 10000);
  for (const id of ['bld_a', 'bld_b', 'bld_c']) {
    const p = out.proposals.find((q) => q.id === id);
    assert.equal(p.by, 'gstage_siteform');
    assert.equal(p.seedKey, ''); // 落位不抽取：来源标记为空（R10-9.2）
  }
  assert.deepEqual(out.deferred, []);
});

test('落位：同种子同结果，与行输入次序无关', () => {
  const kids = [kid('bld_a', 6, 6), kid('bld_b', 8, 4, { facing: 0 }), kid('bld_c', 6, 6)];
  assert.deepEqual(layRun(kids), layRun(kids));
  assert.deepEqual(layRun(kids), layRun([...kids].reverse()));
  assert.deepEqual(layRun(kids), layRun([kids[1], kids[2], kids[0]]));
});

test('落位：作者写了 anchor、facing 的建筑不动（无提案），并作障碍让别的栋绕开；只缺一项的只补那一项', () => {
  // a 作者写 anchor (7,2)、facing 4（外包 {−5, 0, 0, 5} → 矩形 [2..7]×[2..7]）。b（8×4，作者 facing 0，外包 {0, −3, 7, 0}）第一个排：x=2..9 外扩 2 后与 a 相交，x=10 起不相交 → 矩形 [10..17]×[2..5]，
  // 锚点 (10, 5)（没有障碍时它会排在矩形 [2..9]×[2..5]、锚点 (2, 5)）；c 接着 x = 20 → 锚点 (25, 2)，朝向取默认 4。再加 d：作者写了 anchor (60,60) 却没写 facing，只补 facing（面向赤道 4），不动 anchor，也不排位。
  const a = kid('bld_a', 6, 6, { anchor: pos(7, 2), facing: 4 });
  const out = layRun([a, kid('bld_b', 8, 4, { facing: 0 }), kid('bld_c', 6, 6)]);
  assert.equal(out.proposals.some((p) => p.id === 'bld_a'), false);
  assert.deepEqual(dimsOf(out, 'bld_b'), { anchor: pos(10, 5) });
  assert.deepEqual(dimsOf(out, 'bld_c'), { anchor: pos(25, 2), facing: 4 });
  const onlyFacing = layRun([kid('bld_d', 6, 6, { anchor: pos(60, 60) })]);
  assert.deepEqual(dimsOf(onlyFacing, 'bld_d'), { facing: 4 });
});

test('落位：排不下 N 加一重排（R10-7.5）：一栋 97 × 4（外扩后 101 格宽）一个区格（外包宽 100）排不下，N = 2 时排得下：站点写 2 × 10,000 m²，锚点 (2, 5)', () => {
  // 占地 388 m² → 起始 N = 1。N = 1：行 y=2 时 2 + 96 + 2 = 100 > 99 行到头，各行都到头，最后 cy + 3 + 2 > 99 放不下 → 排不下；N 加一 = 2：足迹 x 0..199，
  // 行 y=2：x=2 外扩 [0..100] 在足迹内（区格 (0,0)、(1,0) 都在）→ 矩形 [2..98]×[2..5]，朝向 0 外包 {0, −3, 96, 0}，锚点 (2 − 0, 2 + 3) = (2, 5)。
  const out = layRun([kid('bld_w', 97, 4, { facing: 0 })]);
  assert.equal(targetOf(out, 'loc_site'), 20000);
  assert.deepEqual(dimsOf(out, 'bld_w'), { anchor: pos(2, 5) });
});

test('落位：N 加到所在存量单元的区格数仍排不下即 E-GEN-ROW-INVALID；上限够就恰在上限处排下（R10-7.5 末）', () => {
  // 197 × 4 朝向 0：占地 788 m² → N = 1；要 2 + 196 + 2 = 200 ≤ 足迹最右格号，N = 3（x 0..299）才排得下，N = 2（x 0..199）不行。
  const wide = [kid('bld_w', 197, 4, { facing: 0 })];
  const ok = layRun(wide, { strip: { tract: 3 } });
  assert.equal(targetOf(ok, 'loc_site'), 30000);
  assert.deepEqual(dimsOf(ok, 'bld_w'), { anchor: pos(2, 5) }); // 矩形 [2..198]×[2..5]，外包 {0, −3, 196, 0}
  const e = (() => { try { layRun(wide, { strip: { tract: 2 } }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e.fields }, { site: 'loc_site', reason: 'layout_no_fit', need_cells: 2, max_cells: 2 });
});

test('落位：作者定了面积（targetAreaM2）的站点 N 取作者足迹的区格数、不加，排不下即 E-GEN-ROW-INVALID；排得下的照排，站点面积不动', () => {
  const author = { targetAreaM2: 10000 };
  const e = (() => { try { layRun([kid('bld_w', 97, 4, { facing: 0 })], { site: author, strip: { fixed: 1 } }); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e.fields }, { site: 'loc_site', reason: 'layout_no_fit', need_cells: 1, max_cells: 1 });
  const out = layRun([kid('bld_w', 90, 4, { facing: 0 })], { site: author, strip: { fixed: 1 } }); // 2 + 89 + 2 = 93 ≤ 99；矩形 [2..91]×[2..5]，外包 {0, −3, 89, 0}
  assert.deepEqual(dimsOf(out, 'bld_w'), { anchor: pos(2, 5) });
  assert.equal(targetOf(out, 'loc_site'), undefined);
});

test('落位：朝向缺时面向赤道（纬度 ≥ 0 取 4，< 0 取 0，0 档也写）；读不到纬度记缺口 facing_latitude_unknown、该栋不排不写；z 读不到记缺口 anchor_z_unknown、anchor 与 facing 都不写', () => {
  const one = [kid('bld_a', 6, 6)];
  assert.deepEqual(dimsOf(layRun(one, { lat: -10 }), 'bld_a'), { anchor: pos(2, 7), facing: 0 }); // 朝向 0：外包 {0, −5, 5, 0}，矩形 [2..7]×[2..7]，锚点 (2 − 0, 2 + 5) = (2, 7)
  assert.deepEqual(dimsOf(layRun(one, { lat: 0 }), 'bld_a').facing, 4);
  const noLat = layRun(one, { lat: null });
  assert.equal(noLat.proposals.some((p) => p.id === 'bld_a'), false);
  assert.deepEqual(noLat.deferred.filter((d) => d.reason === 'facing_latitude_unknown'), [{ id: 'bld_a', reason: 'facing_latitude_unknown', gaps: ['facing'] }]);
  const noZ = layRun(one, { footprints: (o) => { const f = strip()(o); return { ...f, probe: { ...f.probe, surfaceStoreyAt: () => null } }; } });
  assert.equal(noZ.proposals.some((p) => p.id === 'bld_a'), false);
  assert.deepEqual(noZ.deferred.filter((d) => d.reason === 'anchor_z_unknown'), [{ id: 'bld_a', reason: 'anchor_z_unknown', gaps: ['anchor'] }]);
});

test('落位：缺 form 的建筑（缺口 form_type_unmatched）不排位、不当障碍、不写 anchor 与 facing；别的栋照常排', () => {
  const out = layRun([kid('bld_a', 6, 6), ['bld_x', noFormRow({ parent: 'loc_site', intendedType: undefined })]]);
  assert.equal(out.proposals.some((p) => p.id === 'bld_x'), false);
  assert.deepEqual(out.deferred.filter((d) => d.reason === 'form_type_unmatched').map((d) => d.id), ['bld_x']);
  assert.deepEqual(dimsOf(out, 'bld_a'), { anchor: pos(7, 2), facing: 4 }); // 与 bld_x 不存在时相同：朝向 4 的 6×6 在站点第一格排在矩形 [2..7]×[2..7]，锚点 (7, 2)
});

test('落位：世界没有格空间表记缺口 layout_grid_missing（列出缺的建筑），不写 anchor、facing；足迹读不到记 layout_footprint_unplanned；规则 layoutGapCells 缺（或 0）即 E-RULES-UNREGISTERED', () => {
  const one = [kid('bld_a', 6, 6)];
  const noGrid = layRun(one, { grid: 0 });
  assert.equal(noGrid.proposals.some((p) => p.id === 'bld_a'), false);
  assert.deepEqual(noGrid.deferred.filter((d) => d.reason === 'layout_grid_missing'), [{ id: 'loc_site', reason: 'layout_grid_missing', gaps: ['bld_a'] }]);
  const noFp = layRun(one, { footprints: () => ({ footprints: { loc_tract: { cellCount: 8 } } }) });
  assert.equal(noFp.proposals.some((p) => p.id === 'bld_a'), false);
  assert.deepEqual(noFp.deferred.filter((d) => d.reason === 'layout_footprint_unplanned'), [{ id: 'loc_site', reason: 'layout_footprint_unplanned', gaps: ['footprint'] }]);
  for (const gapCells of [undefined, 0]) {
    assert.equal(codeOf(() => run({ vocab: LAY_VOCAB(), rows: layRows(one), authoredIds: new Set(['loc_site', 'bld_a']), footprints: strip(), gridSpaceCount: 1, layoutGapCells: gapCells, latitudeDegOf: () => 31 })), 'E-RULES-UNREGISTERED', String(gapCells));
  }
});

test('所在存量单元 = 沿 parent 往上第一个存量单元（卷十 R10-7.5，勘误 1123k45，李白 11-23 b41e0801 第⑩条）：站点的父行不是存量单元、祖父是时按祖父的足迹格数判起始 N 与 N 加一的上界；一路往上没有存量单元时临时退回父行足迹格数作上界、照常排位', () => {
  const rows = (siteParent) => rowsOf([['loc_root', { parent: null }], ['loc_tract', { parent: 'loc_root', classes: ['comp_tract'] }], ['loc_mid', { parent: 'loc_tract' }], ['loc_other', { parent: 'loc_root' }], ['loc_site', { parent: siteParent, coord: { x: 50, y: 50 } }], kid('bld_w', 197, 4, { facing: 0, parent: 'loc_site' })]);
  const go = (siteParent, tract) => run({ vocab: LAY_VOCAB(), rows: rows(siteParent), authoredIds: new Set(['loc_site', 'bld_w']), bldfillRows: fill(36, 1), footprints: strip({ tract }), gridSpaceCount: 1, latitudeDegOf: () => 31 });
  // 197 × 4 → 占地 788 m²，起始 N = 1；N = 3 才排得下（见上"N 加到…"用例）。祖父 loc_tract 3 格：排下，N = 3；2 格：N = 2 仍排不下报错，上界 2 来自祖父。
  const ok = go('loc_mid', 3);
  assert.equal(targetOf(ok, 'loc_site'), 30000);
  assert.deepEqual(dimsOf(ok, 'bld_w'), { anchor: pos(2, 5) });
  const e = (() => { try { go('loc_mid', 2); return null; } catch (err) { return err; } })();
  assert.ok(e && e.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e.fields }, { site: 'loc_site', reason: 'layout_no_fit', need_cells: 2, max_cells: 2 });
  // 一路往上没有存量单元（loc_other 的祖先只有 loc_root）：临时退路（李白 11-23 da3cd65a 甲，存量单元卡补后撤）——N 加一的上界取父行 loc_other 的足迹格数，建筑照常排位。父行 3 格：排下，N = 3；2 格：报错 need 2 max 2。
  const orphan = (cells) => run({ vocab: LAY_VOCAB(), rows: rows('loc_other'), authoredIds: new Set(['loc_site', 'bld_w']), bldfillRows: fill(36, 1), gridSpaceCount: 1, latitudeDegOf: () => 31,
    footprints: (o) => { const f = strip({ tract: 1 })(o); f.footprints.loc_other = { cellCount: cells }; return f; } });
  const none = orphan(3);
  assert.equal(targetOf(none, 'loc_site'), 30000);
  assert.deepEqual(dimsOf(none, 'bld_w'), { anchor: pos(2, 5) });
  const e2 = (() => { try { orphan(2); return null; } catch (err) { return err; } })();
  assert.ok(e2 && e2.code === 'E-GEN-ROW-INVALID');
  assert.deepEqual({ ...e2.fields }, { site: 'loc_site', reason: 'layout_no_fit', need_cells: 2, max_cells: 2 });
});

test('统一硬数 4096 已删：规则表 rules.facility.blueprint 没有 planCellsMax，planCells 维度域没有上界', () => {
  assert.equal(Object.hasOwn(world.rules.facility.blueprint, 'planCellsMax'), false);
  const dom = json('world/ontology/dimensions/place.json').dimensions.planCells.fields;
  assert.equal(dom.widthCells.domain[1], null);
  assert.equal(dom.depthCells.domain[1], null);
});
