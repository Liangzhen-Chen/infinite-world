// D12 卡 C：初加工产率读原料属性。夹具树用正式物品表（只清空配方表与属性表、按用例给覆盖层 props），
// 期望值在测试内按公式与物品重量算，不写死数。
// 磨粉：出粉率 = 可食部分比例 ×（1 − 加工损耗）；烧炭：得率 = charYield ×（1 − 含水率）；属性未知：沿用类常数产率。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {generate, processYield} from '../tools/kc-processing.mjs';

const J = rel => JSON.parse(fs.readFileSync(rel, 'utf8'));
const crafting = J('world/rules/tables/balance/crafting.json');
const LOSS = crafting.params.find(x => x.id === 'nutrition.processLoss').value.unheated;
const ITEMS = J('world/meta/items.json'), kgOf = id => ITEMS.find(i => i.id === id).weight;
const dimensions = {
  moisture: {unit: '质量分数', min: 0, max: 1}, edibleFraction: {unit: '质量分数', min: 0, max: 1},
  energyDensity: {unit: '饱腹/kg 干物质', min: 0, max: 100000}, heatValue: {unit: 'MJ/kg 干物质', min: 0, max: 60}, charYield: {unit: '质量分数', min: 0, max: 1},
};
const CHAR = {recipe: 'recipe_kc_char_wood_charcoal', input: 'item_wood', output: 'item_charcoal', constant: 0.25};
const MILL = {recipe: 'recipe_kc_mill_oats_oat_flour', input: 'item_oats', output: 'item_oat_flour', constant: 0.8};

// 夹具树：正式物品表，空配方表（作者配方会让同对原料跳过生成），覆盖层只给被测原料的 props
function fixtureRoot({props = {}, withTable = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kcprops-'));
  const w = (rel, data) => {fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.writeFileSync(path.join(root, rel), JSON.stringify(data));};
  w('world/meta/items.json', ITEMS);
  w('world/meta/recipes.json', []);
  w('world/meta/mechanics/items.json', Object.fromEntries(Object.entries(props).map(([id, p]) => [id, {props: {...p, basis: '夹具'}}])));
  if (withTable) w('world/meta/mechanics/material-props.json', {dimensions, precedence: [], classes: {}});
  w('world/rules/tables/balance/crafting.json', crafting);
  return root;
}
const build = (kind, props, opts) => {
  const g = generate(fixtureRoot({props: props ? {[kind.input]: props} : {}, ...opts}));
  const r = g.recipes.find(x => x.id === kind.recipe);
  return r && {units: r.materials[0].amount, qty: r.output.quantity};
};
const expectQty = (kind, units, y) => Math.floor(units * kgOf(kind.input) * y / kgOf(kind.output) + 1e-9);
// 实际产率的倒数：每公斤成品耗多少公斤原料（取整后产率越低，这个数越大）
const inPerOut = (kind, o) => o.units * kgOf(kind.input) / (o.qty * kgOf(kind.output));

// 批量规则：取整后的实际产率不低于派生产率的 90%，且没有更小的批量也能做到；批量内都做不到时，实际产率是批量内最高的。
const realYield = (kind, u, y) => Math.min(200, expectQty(kind, u, y)) * kgOf(kind.output) / (u * kgOf(kind.input));
function assertBatchRule(kind, o, y) {
  const ok = u => realYield(kind, u, y) >= y * 0.9 - 1e-12 && expectQty(kind, u, y) >= 1;
  if (ok(o.units)) { for (let u = 1; u < o.units; u++) assert.ok(!ok(u), `批量 ${u} 已达标，不该取 ${o.units}`); }
  else for (let u = 1; u <= 12; u++) assert.ok(realYield(kind, u, y) <= realYield(kind, o.units, y) + 1e-12, `批量内应取实际产率最高者 ${JSON.stringify(o)}`);
}

test('磨粉：可食部分比例不同，同一类加工的投入与出粉量按公式变化', () => {
  const rows = [0.95, 0.6, 0.3].map(edibleFraction => {
    const o = build(MILL, {edibleFraction});
    const y = edibleFraction * (1 - LOSS);
    assert.equal(o.qty, expectQty(MILL, o.units, y));
    assertBatchRule(MILL, o, y);
    return o;
  });
  assert.ok(inPerOut(MILL, rows[0]) < inPerOut(MILL, rows[2]), JSON.stringify(rows));
});

test('烧炭：含水率与炭化得率不同，同一类加工的投入与出炭量按公式变化', () => {
  const cases = [{moisture: 0.1, charYield: 0.3}, {moisture: 0.8, charYield: 0.3}, {moisture: 0.1, charYield: 0.1}];
  const rows = cases.map(p => {
    const o = build(CHAR, p);
    assert.equal(o.qty, expectQty(CHAR, o.units, p.charYield * (1 - p.moisture)));
    assertBatchRule(CHAR, o, p.charYield * (1 - p.moisture));
    return o;
  });
  assert.ok(inPerOut(CHAR, rows[0]) < inPerOut(CHAR, rows[1]), JSON.stringify(rows));
  assert.ok(inPerOut(CHAR, rows[0]) < inPerOut(CHAR, rows[2]), JSON.stringify(rows));
});

test('属性未知：与现行常数产率逐字相等（无属性表、空表、属性只给一半都一样）', () => {
  const none = generate(fixtureRoot({withTable: false})), empty = generate(fixtureRoot());
  const half = generate(fixtureRoot({props: {item_wood: {charYield: 0.3}}})); // 烧炭缺含水率：整体按未知处理
  assert.deepEqual(empty.recipes, none.recipes);
  assert.deepEqual(half.recipes, none.recipes);
  for (const k of [CHAR, MILL]) {
    const r = none.recipes.find(x => x.id === k.recipe);
    assert.equal(r.output.quantity, expectQty(k, r.materials[0].amount, k.constant));
  }
});

test('processYield：非属性驱动的类返回 null；属性推出零产率时不生成该配方', () => {
  assert.equal(processYield({}, {edibleFraction: {known: true, value: 0.5}}, LOSS), null);
  assert.equal(processYield({yieldFrom: 'mill'}, {edibleFraction: {known: false}}, LOSS), null);
  assert.equal(build(MILL, {edibleFraction: 0}), undefined);
});
