// D12 卡 D 整类修复：含水、可食部分、能量密度由出处原值（sources）推出；L1 校验出处字段与一致性。期望值在测试里按公式算。
import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveFromSources, materialProps, validateMaterialProps} from '../server-plugin/item-class.mjs';

const KPS = 24;
const dimensions = {
  moisture: {unit: '质量分数', min: 0, max: 1}, edibleFraction: {unit: '质量分数', min: 0, max: 1},
  energyDensity: {unit: '饱腹/kg 干物质', min: 0, max: 100000}, heatValue: {unit: 'MJ/kg 干物质', min: 0, max: 60}, charYield: {unit: '质量分数', min: 0, max: 1}
};
const src = (name, o) => ({name, citation: `夹具：${name}`, ...o});
const A = src('甲', {moistureFraction: 0.8125, kcalPer100gWet: 50, refuseFraction: 0.1});
const B = src('乙', {moistureFraction: 0.9, kcalPer100gWet: 30, refuseFraction: 0.3});
const formula = (kcal, m) => Math.round(kcal * 10 / (1 - Math.round(m * 1000) / 1000) / KPS);
const mean = (a, b) => (a + b) / 2;

test('推算：single / mean / representative，公式在测试内算', () => {
  const single = deriveFromSources({sources: [A], selection: {method: 'single', reason: 'r'}}, KPS);
  assert.equal(single.moisture, Math.round(A.moistureFraction * 1000) / 1000);
  assert.equal(single.energyDensity, formula(A.kcalPer100gWet, A.moistureFraction));
  assert.equal(single.edibleFraction, Math.round((1 - A.refuseFraction) * 1000) / 1000);
  const avg = deriveFromSources({sources: [A, B], selection: {method: 'mean', reason: 'r'}}, KPS);
  assert.equal(avg.energyDensity, formula(mean(A.kcalPer100gWet, B.kcalPer100gWet), mean(A.moistureFraction, B.moistureFraction)));
  assert.equal(avg.edibleFraction, Math.round((1 - mean(A.refuseFraction, B.refuseFraction)) * 1000) / 1000);
  const rep = deriveFromSources({sources: [A, B], selection: {method: 'representative', representative: '乙', reason: 'r'}}, KPS);
  assert.equal(rep.energyDensity, formula(B.kcalPer100gWet, B.moistureFraction));
  assert.deepEqual(deriveFromSources({}, KPS), {});
  assert.equal(deriveFromSources({sources: [A], selection: {method: 'single', reason: 'r'}}, undefined).energyDensity, undefined);
});

const world = (rows, items = []) => ({items: [{id: 'item_fx', tags: ['tagA']}, ...items], recipes: [],
  materialProps: {dimensions: structuredClone(dimensions), kcalPerSatiety: KPS, kcalPerSatietyBasis: 'calibrate（夹具）', precedence: Object.keys(rows), classes: rows}});
const good = () => ({tagA: {basis: 'b', sources: [A, B], selection: {method: 'mean', reason: 'r'}, heatValue: 10}});

test('materialProps 读推算值；物品覆盖的出处优先', () => {
  const w = world(good(), [{id: 'item_ov', tags: ['tagA'], props: {basis: 'b', sources: [src('丙', {moistureFraction: 0.3})], selection: {method: 'single', reason: 'r'}}}]);
  const e = {world: w, byId: new Map(w.items.map(i => [i.id, i]))};
  const p = materialProps(e, 'item_fx');
  assert.equal(p.energyDensity.value, formula(mean(A.kcalPer100gWet, B.kcalPer100gWet), mean(A.moistureFraction, B.moistureFraction)));
  assert.equal(p.heatValue.value, 10);
  const o = materialProps(e, 'item_ov');
  assert.deepEqual([o.moisture.source, o.moisture.value, o.energyDensity.source], ['item', 0.3, 'tagA']);
});

const errorsOf = mutate => { const rows = good(); const w = world(rows); mutate(rows.tagA, w.materialProps); return validateMaterialProps(w); };

test('L1：合法数据无错；存了的推算维度必须与推算值一致', () => {
  assert.deepEqual(errorsOf(() => {}), []);
  const d = deriveFromSources(good().tagA, KPS);
  assert.deepEqual(errorsOf(r => { r.moisture = d.moisture; r.energyDensity = d.energyDensity; r.edibleFraction = d.edibleFraction; }), []);
  assert.ok(errorsOf(r => { r.energyDensity = d.energyDensity + 1; }).some(x => /energyDensity 与出处推算值不一致/.test(x)));
  assert.ok(errorsOf(r => { r.moisture = d.moisture + 0.01; }).some(x => /moisture 与出处推算值不一致/.test(x)));
});

test('L1：出处字段缺失或越界报错', () => {
  assert.ok(errorsOf(r => { delete r.selection; }).some(x => /selection/.test(x)));
  assert.ok(errorsOf(r => { r.selection.reason = ''; }).some(x => /selection/.test(x)));
  assert.ok(errorsOf(r => { delete r.sources[0].citation; }).some(x => /citation/.test(x)));
  assert.ok(errorsOf(r => { r.sources[0].moistureFraction = 1.2; }).some(x => /出处越界/.test(x)));
  assert.ok(errorsOf(r => { r.sources[0].range = {moistureFraction: [0.1, 0.2]}; }).some(x => /公认区间/.test(x)));
  assert.ok(errorsOf(r => { r.selection = {method: 'single', reason: 'r'}; }).some(x => /single/.test(x)));
  assert.ok(errorsOf(r => { r.selection = {method: 'representative', representative: '无', reason: 'r'}; }).some(x => /representative/.test(x)));
  assert.ok(errorsOf(r => { delete r.sources[1].moistureFraction; }).some(x => /mean 要求各出处都写/.test(x)));
  assert.ok(errorsOf((r, h) => { delete h.kcalPerSatiety; }).some(x => /kcalPerSatiety/.test(x)));
  assert.ok(errorsOf((r, h) => { h.kcalPerSatiety = 24; delete h.kcalPerSatietyBasis; }).some(x => /标定依据/.test(x)));
  assert.ok(errorsOf(r => { r.sources[0].kcalPer100gWet = 50; r.sources[1].kcalPer100gWet = 30; delete r.sources[0].moistureFraction; delete r.sources[1].moistureFraction; }).some(x => /缺含水分数/.test(x)));
});
