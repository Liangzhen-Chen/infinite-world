// 开局建账（卷十 R10-7.12 末、卷十九 §4.1 规则 11 表第一行与 §4.4 规则 1；封卷后勘误 1123k60，李白 11-23 事件 7fc731e6）：gstage_envelope 对手写建筑行补 materialKg（形制默认料 × 围护体积 × 密度）、
// condition（rules.gen.openingCondition，暂定 1）、wallFlowKg（开局建行砌入，laidKg = materialKg）；作者写了的不动；缺 form 记缺口；同输入同结果；守恒式 laidKg − takenKg − lostKg = materialKg。
// 期望值按卷文公式手算成字面量（细格 1 m、层高 3 m、墙厚 0.4 m；W = D = 3 的一间房，w = ceil(0.4 ÷ 1) = 1）：
//   1 层：外圈 8 格，正面中间一格是正门（不是墙元），7 个外墙元，每个 = 列（1 m × 3 m）× min(1 m, 0.4 m) = 1.2 m³ = 1200 L → 墙 8400 L；中心一格是室内、顶层有屋面：屋面元 = 1 × 1 × 0.4 = 0.4 m³ = 400 L；没有楼梯与楼板 → 梁架 0 L。
//   2 层：每层外圈 8 格，只有零层有正门 → 7 + 8 = 15 个外墙元 = 18000 L；零层中心格是楼梯（楼板同厚 400 L，归梁架），二层中心格是屋面 400 L。
// 夹具材料：mat_a 密度 2（墙）、mat_b 密度 0.5（梁架）、mat_c 密度 0.25（屋顶），千克每升。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadWorld } from '../../server-plugin/kernel/load/world.mjs';
import { installDigestCap } from '../../server-plugin/kernel/save.mjs';
import { blueprintRulesFrom } from '../../server-plugin/kernel/place-building.mjs';
import { checkBlueprintForms } from '../../server-plugin/kernel/blueprint.mjs';
import { buildGenRows } from '../../server-plugin/kernel/gen/rows.mjs';
import { genSiteForm } from '../../server-plugin/kernel/gen/siteform.mjs';
import { genEnvelope } from '../../server-plugin/kernel/gen/envelope.mjs';
import { genPlan } from '../../server-plugin/kernel/gen/stages.mjs';
import { generatorNames } from '../../server-plugin/kernel/gen/worldgen.mjs';
import { makeWhen } from '../../server-plugin/kernel/gen/when.mjs';
import { materialView } from '../../server-plugin/kernel/item.mjs';
import { openingWallFlow } from '../../server-plugin/kernel/wall-flow.mjs';
import { ROOT } from '../accept/temp-root.mjs';

installDigestCap({ sha256Hex: (data, encoding) => createHash('sha256').update(data, encoding === 'base64' ? 'base64' : 'utf8').digest('hex') });
const world = loadWorld(ROOT);
assert.equal(world.ok, true);
const BLUEPRINT = blueprintRulesFrom(world.rules, world.env.units);
assert.notEqual(BLUEPRINT, null);
const START = JSON.parse(readFileSync(join(ROOT, 'world/geo/start-buildings.json'), 'utf8'));

const FORM = { walled: true, roofed: true, deck: false, storeyBase: 0, aspect: 1, windowEvery: 4, wallThicknessDefaultM: 0.4, wallThicknessMinM: 0.4, planSideMaxCells: 64, rooms: [], defaultMaterials: { wall: 'mat_a', frame: 'mat_b', roof: 'mat_c' } };
const vocabOf = (entries) => ({ index: new Map(entries.map(([code, entry]) => [code, { family: 'bform', entry }])) });
const DENSITY = { mat_a: 2, mat_b: 0.5, mat_c: 0.25 };
const rowsOf = (entries) => buildGenRows(new Map(entries), { index: new Map() });
const bld = (extra = {}) => ({ parent: null, classes: ['comp_facility'], form: 'bldform_t', planCells: { widthCells: 3, depthCells: 3 }, storeys: 1, wallThicknessM: 0.4, ...extra });
const run = (entries, o = {}) => genEnvelope({
  table: 'place', stage: 'gstage_envelope', vocab: o.vocab ?? vocabOf([['bldform_t', FORM]]), rows: rowsOf(entries), authoredIds: new Set(entries.map(([id]) => id)),
  roleFacility: 'comp_facility', blueprint: BLUEPRINT, densityOf: (code) => DENSITY[code], openingCondition: o.condition ?? 1, isAuthored: o.isAuthored ?? (() => true), // 夹具行写的维度都是作者写的
});
const dimsOf = (out, id) => (out.proposals.find((p) => p.id === id) || { dims: {} }).dims;

test('一层 3×3：墙 8400 L × 2 = 16800 kg（mat_a）、屋顶 400 L × 0.25 = 100 kg（mat_c）、梁架 0 L 不出现；condition 取 1；开局流水账砌入等于 materialKg', () => {
  const out = run([['bld_1', bld()]]);
  assert.deepEqual(out.deferred, []);
  assert.deepEqual(dimsOf(out, 'bld_1'), {
    materialKg: { mat_a: 16800, mat_c: 100 },
    condition: 1,
    wallFlowKg: { mat_a: { laidKg: 16800, takenKg: 0, lostKg: 0 }, mat_c: { laidKg: 100, takenKg: 0, lostKg: 0 } },
  });
  const p = out.proposals[0];
  assert.equal(p.by, 'gstage_envelope');
  assert.equal(p.table, 'place');
});

test('两层 3×3：墙 18000 L × 2 = 36000 kg、梁架（楼梯 400 L）× 0.5 = 200 kg（mat_b）、屋顶 100 kg', () => {
  const out = run([['bld_2', bld({ storeys: 2 })]]);
  assert.deepEqual(dimsOf(out, 'bld_2').materialKg, { mat_a: 36000, mat_b: 200, mat_c: 100 });
});

test('两个角色同一种料则质量相加：墙与屋顶都用 mat_a → 8400 L × 2 + 400 L × 2 = 17600 kg', () => {
  const vocab = vocabOf([['bldform_t', { ...FORM, defaultMaterials: { wall: 'mat_a', frame: 'mat_b', roof: 'mat_a' } }]]);
  assert.deepEqual(dimsOf(run([['bld_1', bld()]], { vocab }), 'bld_1').materialKg, { mat_a: 17600 });
});

test('作者写了的不动：写了 materialKg、condition 的行不出这两项提案，流水账仍按作者的 materialKg 记（0 也照记 0）；只缺 condition 的只补 condition', () => {
  const authored = bld({ materialKg: { mat_x: 5, mat_y: 0 }, condition: 0.6 });
  const out = run([['bld_a', authored], ['bld_b', bld({ materialKg: { mat_x: 7 } })]]);
  assert.deepEqual(dimsOf(out, 'bld_a'), { wallFlowKg: { mat_x: { laidKg: 5, takenKg: 0, lostKg: 0 }, mat_y: { laidKg: 0, takenKg: 0, lostKg: 0 } } });
  assert.deepEqual(dimsOf(out, 'bld_b'), { condition: 1, wallFlowKg: { mat_x: { laidKg: 7, takenKg: 0, lostKg: 0 } } });
});

test('流水账是账、作者不写（卷十九 :419）：作者在行上写了 wallFlowKg 即 E-GEN-ROW-INVALID；先行阶段生成的（非作者值）不重写也不报错', () => {
  const row = bld({ materialKg: { mat_x: 5 }, condition: 1, wallFlowKg: { mat_x: { laidKg: 5, takenKg: 0, lostKg: 0 } } });
  const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  assert.equal(code(() => run([['bld_c', row]])), 'E-GEN-ROW-INVALID');
  const out = run([['bld_c', row]], { isAuthored: () => false });
  assert.deepEqual(out.proposals, []);
});

test('同输入同结果，与行输入次序无关', () => {
  const rows = [['bld_a', bld()], ['bld_b', bld({ storeys: 2 })], ['bld_c', bld({ condition: 0.5 })]];
  assert.deepEqual(run(rows), run(rows));
  assert.deepEqual(run(rows), run([...rows].reverse()));
});

test('缺 form 的行：materialKg 不补、不报错，记缺口 form_type_unmatched；condition 与形制无关，照补；作者写了 materialKg 的缺 form 行仍记流水账', () => {
  const noForm = { parent: null, classes: ['comp_facility'] };
  const out = run([['bld_n', noForm], ['bld_m', { ...noForm, materialKg: { mat_x: 3 }, condition: 1 }]]);
  assert.deepEqual(out.deferred, [{ id: 'bld_n', reason: 'form_type_unmatched', gaps: ['materialKg'] }]);
  assert.deepEqual(out.proposals.map((p) => p.id), ['bld_m', 'bld_n']);
  assert.deepEqual(dimsOf(out, 'bld_n'), { condition: 1 });
  assert.deepEqual(dimsOf(out, 'bld_m'), { wallFlowKg: { mat_x: { laidKg: 3, takenKg: 0, lostKg: 0 } } });
});

test('守恒式：每栋每种料 laidKg − takenKg − lostKg = materialKg（补出的与作者写的都成立）；开局 takenKg、lostKg 为 0', () => {
  const out = run([['bld_a', bld()], ['bld_b', bld({ storeys: 2 })], ['bld_c', bld({ materialKg: { mat_x: 12.5, mat_z: 0 } })]]);
  const had = new Map([['bld_c', { mat_x: 12.5, mat_z: 0 }]]);
  for (const p of out.proposals) {
    const kg = p.dims.materialKg ?? had.get(p.id);
    assert.deepEqual(Object.keys(p.dims.wallFlowKg), Object.keys(kg));
    for (const [code, flow] of Object.entries(p.dims.wallFlowKg)) {
      assert.equal(flow.takenKg, 0);
      assert.equal(flow.lostKg, 0);
      assert.equal(flow.laidKg - flow.takenKg - flow.lostKg, kg[code], `${p.id}/${code}`);
    }
  }
  assert.deepEqual(openingWallFlow({ mat_b: 1, mat_a: 2 }), { mat_a: { laidKg: 2, takenKg: 0, lostKg: 0 }, mat_b: { laidKg: 1, takenKg: 0, lostKg: 0 } });
});

test('出错：形制没有默认用料、密度读不到或不为正、开局 condition 出域，都是错误，不拿常量兜底', () => {
  const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  const { defaultMaterials, ...noDefault } = FORM;
  assert.equal(code(() => run([['bld_1', bld()]], { vocab: vocabOf([['bldform_t', noDefault]]) })), 'E-GEN-ROW-INVALID');
  assert.equal(code(() => run([['bld_1', bld()]], { vocab: vocabOf([['bldform_t', { ...FORM, defaultMaterials: { wall: 'mat_none', frame: 'mat_b', roof: 'mat_c' } }]]) })), 'E-GEN-ROW-INVALID');
  assert.equal(code(() => run([['bld_1', bld()]], { condition: 2 })), 'E-RULES-UNREGISTERED');
});

test('加载期校验：形制默认用料必填，墙、梁架、屋顶各是材料表的一行；不交材料判定则不核', () => {
  const LIMITS = world.rules.facility.blueprint;
  const has = (code) => code in DENSITY;
  const codes = (entry, hasMaterial) => checkBlueprintForms(vocabOf([['bldform_t', entry]]).index, LIMITS, undefined, hasMaterial).map((s) => s.split(' ')[0]);
  const { defaultMaterials, ...noDefault } = FORM;
  assert.deepEqual(codes(FORM, has), []);
  assert.deepEqual(codes(noDefault, has), ['E-DIM-REQUIRED-MISSING']);
  assert.deepEqual(codes({ ...FORM, defaultMaterials: { wall: 'mat_a', frame: 'mat_none', roof: 'mat_c' } }, has), ['E-DIM-REF-MISSING']);
  assert.deepEqual(codes({ ...FORM, defaultMaterials: { wall: 'mat_a', roof: 'mat_c' } }, has), ['E-DIM-REF-MISSING']);
  assert.deepEqual(codes(noDefault, undefined), []);
});

test('加载期校验（卷十九 :408 规则 10，李白 11-24 裁）：默认料的 density、thermalConductivity、soundAttenuation、corrosionRate、strength 须已知，缺哪项报哪项；物性齐全放行', () => {
  const LIMITS = world.rules.facility.blueprint;
  const full = { density: { solid: 1 }, thermalConductivity: { solid: 0.5 }, soundAttenuation: 1, corrosionRate: 0.001, strength: { stress_bend: 10 } };
  const rows = { mat_a: full, mat_b: full, mat_c: full };
  const run2 = (rowsBy) => checkBlueprintForms(vocabOf([['bldform_t', FORM]]).index, LIMITS, undefined, (c) => c in rowsBy, (c) => rowsBy[c]);
  assert.deepEqual(run2(rows), []);
  const lack = (patch) => run2({ ...rows, mat_b: { ...full, ...patch } });
  assert.match(lack({ strength: {} })[0], /mat_b lacks strength/);
  assert.match(lack({ soundAttenuation: undefined })[0], /mat_b lacks soundAttenuation/);
  assert.match(lack({ thermalConductivity: { gas: 0.02 } })[0], /mat_b lacks thermalConductivity/);
  assert.match(lack({ corrosionRate: undefined, density: { solid: 0 } })[0], /mat_b lacks density, corrosionRate/);
});

test('真实世界的三种默认料（mat_soil、mat_elm、mat_straw）物性齐全，形制装载校验通过', () => {
  const mt = world.tables.get('material');
  const errs = checkBlueprintForms(world.vocab.index, world.rules.facility.blueprint, undefined, (c) => mt.flat.rows.has(c), (c) => mt.flat.rows.get(c));
  assert.deepEqual(errs, []);
});

test('阶段次序：gstage_envelope 排在 gstage_siteform 之后，生成器已登记', () => {
  const order = genPlan(world.vocab, generatorNames()).map((s) => s.stage);
  assert.ok(order.indexOf('gstage_siteform') >= 0 && order.indexOf('gstage_siteform') < order.indexOf('gstage_envelope'));
});

// 手算的单栋用例（上面）守公式；这一条只守"试玩地区每一栋都补上了、料属该形制默认料、非零、账对平"，不抄任何生成数字。
test('起始地区全部手写建筑（含作者没写形制的 grain_annex）：每栋都补了 materialKg、料都属该栋形制的默认料、全部非零，condition 取规则值，流水账与材料量对平', () => {
  const rowsIn = START.rows;
  assert.equal(rowsIn.length, 19); // 试玩地区作者写的 19 栋（world/geo/start-buildings.json），是作者数据的栋数，不是生成输出
  const ids = new Set(rowsIn.map((r) => r.id));
  const authoredDims = (r) => ({ parent: null, classes: ['comp_facility'], ...(typeof r.form === 'string' ? { form: r.form } : {}), ...(typeof r.intendedType === 'string' ? { intendedType: r.intendedType } : {}) });
  const site = genSiteForm({
    table: 'place', stage: 'gstage_siteform', worldSeed: 'seed_start_region', genesisMinute: 0, vocab: world.vocab,
    rows: rowsOf(rowsIn.map((r) => [r.id, authoredDims(r)])), authoredIds: ids,
    bldfillRows: world.rules.gen.bldfillRows, roleFacility: world.rules.gen.roleFacility, blueprint: BLUEPRINT, when: makeWhen(world),
    layoutCoverage: world.rules.gen.layoutCoverage, regionCellM: world.rules.grid.regionCellM, roleTract: world.rules.gen.roleTract, roleWaterbody: world.rules.gen.roleWaterbody,
  });
  const merged = rowsIn.map((r) => [r.id, { ...authoredDims(r), ...site.proposals.filter((p) => p.id === r.id).reduce((a, p) => ({ ...a, ...p.dims }), {}) }]);
  const engine = { vocab: world.vocab, rules: world.rules, units: world.env.units, tables: world.tables };
  const out = genEnvelope({
    table: 'place', stage: 'gstage_envelope', vocab: world.vocab, rows: rowsOf(merged), authoredIds: ids, roleFacility: world.rules.gen.roleFacility, blueprint: BLUEPRINT,
    densityOf: (code) => materialView(engine, {}, code).dims.density.value.solid, openingCondition: world.rules.gen.openingCondition, isAuthored: () => true,
  });
  assert.deepEqual(out.deferred, []);
  assert.equal(out.proposals.length, rowsIn.length);
  for (const r of rowsIn) {
    const d = dimsOf(out, r.id);
    const formCode = merged.find(([id]) => id === r.id)[1].form; // 作者写的，或 siteform 按设施类型补的
    const defaults = new Set(Object.values(world.vocab.index.get(formCode).entry.defaultMaterials));
    assert.ok(Object.keys(d.materialKg).length > 0, `${r.id} 补了材料`);
    for (const code of Object.keys(d.materialKg)) {
      assert.ok(defaults.has(code), `${r.id} 的 ${code} 属形制 ${formCode} 的默认料`);
      assert.ok(d.materialKg[code] > 0, `${r.id}/${code} 质量非零`);
      assert.deepEqual(d.wallFlowKg[code], { laidKg: d.materialKg[code], takenKg: 0, lostKg: 0 });
    }
    assert.equal(d.condition, world.rules.gen.openingCondition);
  }
});
