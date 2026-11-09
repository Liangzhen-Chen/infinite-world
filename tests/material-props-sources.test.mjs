// D12 卡 D 整类修复：含水、可食部分、能量密度由出处原值（sources）推出，类别代表值 = 各成员逐项推算后取平均；
// 成员偏差超阈值必须有覆盖行；L1 校验出处字段与一致性。期望值在测试里按公式算。
import test from 'node:test';
import assert from 'node:assert/strict';
import {deriveFromSources, memberDeviations, materialProps, validateMaterialProps} from '../server-plugin/item-class.mjs';
import {explainEntry} from '../world/design/matprops-approval.mjs';

const KPS = 24, THR = 0.05;
const dimensions = {
  moisture: {unit: '质量分数', min: 0, max: 1}, edibleFraction: {unit: '质量分数', min: 0, max: 1},
  energyDensity: {unit: '饱腹/kg 干物质', min: 0, max: 100000}, heatValue: {unit: 'MJ/kg 干物质', min: 0, max: 60}, charYield: {unit: '质量分数', min: 0, max: 1}
};
const src = (name, o) => ({name, citation: `夹具：${name}`, ...o});
const A = src('甲', {moistureFraction: 0.8125, kcalPer100gWet: 50, refuseFraction: 0.1, item: 'item_a'});
const B = src('乙', {moistureFraction: 0.9, kcalPer100gWet: 30, refuseFraction: 0.3, item: 'item_b'});
const R = src('丙', {moistureFraction: 0.85, kcalPer100gWet: 40});
const round3 = x => Math.round(x * 1000) / 1000;
// 成员逐项：干基能量（饱腹/kg 干物质，不取整）= kcal×10÷(1−含水)÷KPS
const e = x => x.kcalPer100gWet * 10 / (1 - x.moistureFraction) / KPS;
const mean = xs => xs.reduce((n, x) => n + x, 0) / xs.length;
const noItem = x => { const {item, ...rest} = x; return rest; };

test('推算：single；mean = 各成员逐项推算后取平均（不是先平均出处原值）', () => {
  const single = deriveFromSources({sources: [A], selection: {method: 'single', reason: 'r'}}, KPS);
  assert.deepEqual(single, {moisture: round3(A.moistureFraction), energyDensity: Math.round(e(A)), edibleFraction: round3(1 - A.refuseFraction)});
  const avg = deriveFromSources({sources: [A, B], selection: {method: 'mean', reason: 'r'}}, KPS);
  assert.equal(avg.moisture, round3(mean([A.moistureFraction, B.moistureFraction])));
  assert.equal(avg.energyDensity, Math.round(mean([e(A), e(B)])));
  assert.equal(avg.edibleFraction, round3(mean([1 - A.refuseFraction, 1 - B.refuseFraction])));
  const wrong = Math.round(mean([A.kcalPer100gWet, B.kcalPer100gWet]) * 10 / (1 - mean([A.moistureFraction, B.moistureFraction])) / KPS);
  assert.notEqual(avg.energyDensity, wrong, '与「先平均原值再推算」不同，证明确实是逐项推算后平均');
  assert.deepEqual(deriveFromSources({}, KPS), {});
  assert.equal(deriveFromSources({sources: [A], selection: {method: 'single', reason: 'r'}}, undefined).energyDensity, undefined);
});

test('成员偏差：干物质比例、干基能量、鲜重能量三项相对偏差，按公式在测试内算；无 item 的参照成员不计', () => {
  const row = {sources: [A, B, R], selection: {method: 'mean', reason: 'r'}};
  const cls = deriveFromSources(row, KPS), devs = memberDeviations(row, KPS);
  assert.deepEqual(devs.map(d => d.item), ['item_a', 'item_b']);
  const rel = (a, b) => (a - b) / b, d = devs[0];
  assert.ok(Math.abs(d.dev.dryFraction - rel(1 - A.moistureFraction, 1 - cls.moisture)) < 1e-12);
  assert.ok(Math.abs(d.dev.dmEnergy - rel(e(A), cls.energyDensity)) < 1e-12);
  assert.ok(Math.abs(d.dev.freshEnergy - rel(e(A) * (1 - A.moistureFraction), cls.energyDensity * (1 - cls.moisture))) < 1e-12);
  assert.equal(d.max, Math.max(...Object.values(d.dev).map(Math.abs)));
});

const world = (rows, items = [], header = {}) => ({
  items: [{id: 'item_a', tags: ['tagA']}, {id: 'item_b', tags: ['tagA']}, ...items],
  recipes: [],
  materialProps: {dimensions: structuredClone(dimensions), kcalPerSatiety: KPS, kcalPerSatietyBasis: 'calibrate（夹具）',
    memberDeviationThreshold: THR, memberDeviationBasis: '夹具阈值', precedence: Object.keys(rows), classes: rows, ...header}
});
const own = x => ({basis: 'b', sources: [noItem(x)], selection: {method: 'single', reason: 'r'}});
const good = () => ({tagA: {basis: 'b', sources: [A, B], selection: {method: 'mean', reason: 'r'}, heatValue: 10}});

test('偏差超阈值而无覆盖行报错；有覆盖行且与出处一致则通过；覆盖行与出处不一致报错', () => {
  const rows = good();
  assert.equal(memberDeviations(rows.tagA, KPS).filter(d => d.max > THR).length, 2, '夹具里甲、乙都应超阈值');
  assert.equal(validateMaterialProps(world(rows)).filter(x => /须单独写覆盖行/.test(x)).length, 2);
  const ok = world(good());
  ok.items[0].props = own(A); ok.items[1].props = own(B);
  assert.deepEqual(validateMaterialProps(ok), []);
  const bad = world(good());
  bad.items[0].props = own({...A, kcalPer100gWet: 51}); bad.items[1].props = own(B);
  assert.ok(validateMaterialProps(bad).some(x => /覆盖行 energyDensity 与类别里它的出处不一致/.test(x)));
});

test('偏差未超阈值的成员不需要覆盖；成员物品不存在、表头缺阈值或依据报错', () => {
  const near = src('近', {moistureFraction: 0.8125, kcalPer100gWet: 50.2, item: 'item_a'}), near2 = src('近2', {moistureFraction: 0.8125, kcalPer100gWet: 49.8, item: 'item_b'});
  const rows = {tagA: {basis: 'b', sources: [near, near2], selection: {method: 'mean', reason: 'r'}}};
  assert.ok(memberDeviations(rows.tagA, KPS).every(d => d.max <= THR));
  assert.deepEqual(validateMaterialProps(world(rows)), []);
  const ghost = {tagA: {basis: 'b', sources: [{...near, item: 'item_nope'}, near2], selection: {method: 'mean', reason: 'r'}}};
  assert.ok(validateMaterialProps(world(ghost)).some(x => /成员物品不存在/.test(x)));
  assert.ok(validateMaterialProps(world(rows, [], {memberDeviationThreshold: undefined})).some(x => /memberDeviationThreshold/.test(x)));
  assert.ok(validateMaterialProps(world(rows, [], {memberDeviationBasis: ''})).some(x => /memberDeviationBasis/.test(x)));
});

test('materialProps 读推算值；物品覆盖的出处优先', () => {
  const w = world(good(), [{id: 'item_ov', tags: ['tagA'], props: {basis: 'b', sources: [src('丁', {moistureFraction: 0.3})], selection: {method: 'single', reason: 'r'}}}]);
  const eng = {world: w, byId: new Map(w.items.map(i => [i.id, i]))};
  const p = materialProps(eng, 'item_a');
  assert.equal(p.energyDensity.value, Math.round(mean([e(A), e(B)])));
  assert.equal(p.heatValue.value, 10);
  const o = materialProps(eng, 'item_ov');
  assert.deepEqual([o.moisture.source, o.moisture.value, o.energyDensity.source], ['item', 0.3, 'tagA']);
});

// 不带 item 的成员（参照成员），只测出处字段与一致性
const errorsOf = mutate => {
  const rows = {tagA: {basis: 'b', sources: [noItem(A), noItem(B)], selection: {method: 'mean', reason: 'r'}, heatValue: 10}};
  const w = world(rows); mutate(rows.tagA, w.materialProps); return validateMaterialProps(w);
};

test('L1：合法数据无错；存了的推算维度必须与推算值一致', () => {
  assert.deepEqual(errorsOf(() => {}), []);
  const d = deriveFromSources({sources: [A, B], selection: {method: 'mean', reason: 'r'}}, KPS);
  assert.deepEqual(errorsOf(r => { r.moisture = d.moisture; r.energyDensity = d.energyDensity; r.edibleFraction = d.edibleFraction; }), []);
  assert.ok(errorsOf(r => { r.energyDensity = d.energyDensity + 1; }).some(x => /energyDensity 与出处推算值不一致/.test(x)));
  assert.ok(errorsOf(r => { r.moisture = d.moisture + 0.01; }).some(x => /moisture 与出处推算值不一致/.test(x)));
});

test('L1：出处字段缺失或越界报错；representative 不再允许', () => {
  assert.ok(errorsOf(r => { delete r.selection; }).some(x => /selection/.test(x)));
  assert.ok(errorsOf(r => { r.selection.reason = ''; }).some(x => /selection/.test(x)));
  assert.ok(errorsOf(r => { r.selection.method = 'representative'; }).some(x => /selection/.test(x)));
  assert.ok(errorsOf(r => { delete r.sources[0].citation; }).some(x => /citation/.test(x)));
  assert.ok(errorsOf(r => { r.sources[0].moistureFraction = 1.2; }).some(x => /出处越界/.test(x)));
  assert.ok(errorsOf(r => { r.sources[0].range = {moistureFraction: [0.1, 0.2]}; }).some(x => /公认区间/.test(x)));
  assert.ok(errorsOf(r => { r.selection = {method: 'single', reason: 'r'}; }).some(x => /single/.test(x)));
  assert.ok(errorsOf(r => { delete r.sources[1].moistureFraction; }).some(x => /mean 要求各出处都写/.test(x)));
  assert.ok(errorsOf((r, h) => { delete h.kcalPerSatiety; }).some(x => /kcalPerSatiety/.test(x)));
  assert.ok(errorsOf((r, h) => { delete h.kcalPerSatietyBasis; }).some(x => /标定依据/.test(x)));
  assert.ok(errorsOf(r => { delete r.sources[0].moistureFraction; delete r.sources[1].moistureFraction; }).some(x => /缺含水分数/.test(x)));
});

test('--show 输出：出处字段带单位、推算中间量、推算值与一致性结论，数值按公式在测试内算', () => {
  const row = {basis: 'b', sources: [A, B], selection: {method: 'mean', reason: 'r'}};
  const table = {kcalPerSatiety: KPS, kcalPerSatietyBasis: 'calibrate（夹具）', memberDeviationThreshold: THR};
  const entry = {id: 'class_x', kind: 'material-props-class', key: 'tagA', row};
  const text = explainEntry(entry, table, []).join('\n');
  for (const x of [A, B]) {
    assert.ok(text.includes(`moistureFraction = ${x.moistureFraction}（水占鲜重，质量分数）`));
    assert.ok(text.includes(`kcalPer100gWet = ${x.kcalPer100gWet}（kcal/100g 鲜重）`));
    assert.ok(text.includes(`refuseFraction = ${x.refuseFraction}（质量分数）`));
    assert.ok(text.includes(`干物质比例 = 1 − ${x.moistureFraction} = ${(1 - x.moistureFraction).toFixed(4)}`));
    assert.ok(text.includes(`${(x.kcalPer100gWet * 10 / (1 - x.moistureFraction)).toFixed(1)}（kcal/kg 干物质）`));
    assert.ok(text.includes(`${e(x).toFixed(3)}（饱腹/kg 干物质）`));
  }
  const d = deriveFromSources(row, KPS);
  assert.ok(text.includes(`moisture = ${d.moisture}（3 位小数）；energyDensity = ${d.energyDensity}（饱腹/kg 干物质，取整）；edibleFraction = ${d.edibleFraction}`));
  assert.ok(text.includes('没有另存 moisture/energyDensity/edibleFraction'));
  assert.ok(text.includes('成员偏差 item_a'));
  assert.ok(text.includes('L1 检查：通过'));
  assert.ok(explainEntry(entry, table, ['材料属性 classes.tagA 出了问题']).join('\n').includes('L1 检查：1 项问题'));
});

test('成员链接放在表头 memberItems：类别行不带 item 也按链接检查偏差；链接的出处不存在报错', () => {
  const rows = {tagA: {basis: 'b', sources: [noItem(A), noItem(B)], selection: {method: 'mean', reason: 'r'}}};
  const links = {tagA: {[A.name]: 'item_a', [B.name]: 'item_b'}};
  const devs = memberDeviations(rows.tagA, KPS, links.tagA);
  assert.deepEqual(devs.map(d => d.item), ['item_a', 'item_b']);
  assert.deepEqual(memberDeviations(rows.tagA, KPS), [], '没有链接的出处是参照成员，不计偏差');
  const errs = validateMaterialProps(world(rows, [], {memberItems: links}));
  assert.equal(errs.filter(x => /须单独写覆盖行/.test(x)).length, 2);
  const ok = world({tagA: structuredClone(rows.tagA)}, [], {memberItems: links});
  ok.items[0].props = own(A); ok.items[1].props = own(B);
  assert.deepEqual(validateMaterialProps(ok), []);
  assert.ok(validateMaterialProps(world(rows, [], {memberItems: {tagA: {无此出处: 'item_a'}}})).some(x => /memberItems 的出处不存在/.test(x)));
});
