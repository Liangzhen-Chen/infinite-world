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
const TOL = crafting.params.find(x => x.id === 'processing.roundingTolerance').value;
// 夹具里放一条作者配方，单种原料 8 份：批量上限 = 作者手写配方里单种原料的最大份数（world 里没有加工场所的装料数据）
const FIXTURE_CAP = 8;
const dimensions = {
  moisture: {unit: '质量分数', min: 0, max: 1}, edibleFraction: {unit: '质量分数', min: 0, max: 1},
  energyDensity: {unit: '饱腹/kg 干物质', min: 0, max: 100000}, heatValue: {unit: 'MJ/kg 干物质', min: 0, max: 60}, charYield: {unit: '质量分数', min: 0, max: 1},
};
const CHAR = {recipe: 'recipe_kc_char_wood_charcoal', input: 'item_wood', output: 'item_charcoal', constant: 0.25};
const MILL = {recipe: 'recipe_kc_mill_oats_oat_flour', input: 'item_oats', output: 'item_oat_flour', constant: 0.8};

// 夹具树：正式物品表，只有一条与被测原料无关的作者配方（作者配方覆盖同对原料时会跳过生成），覆盖层只给被测原料的 props
function fixtureRoot({props = {}, withTable = true} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kcprops-'));
  const w = (rel, data) => {fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true}); fs.writeFileSync(path.join(root, rel), JSON.stringify(data));};
  w('world/meta/items.json', ITEMS);
  w('world/meta/recipes.json', [{id: 'recipe_fixture_big', output: {item: 'item_fixture_out', quantity: 1}, materials: [{item: 'item_fixture_in', amount: FIXTURE_CAP}]}]);
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

// 批量规则：取整丢掉的部分（理论份数 − 取整份数）不超过 roundingTolerance 份产物，且没有更小的批量也能做到；批量上限内都做不到时，丢得最少者（同则批量小）。
const lost = (kind, u, y) => { const q = u * kgOf(kind.input) * y / kgOf(kind.output); return q - Math.floor(q + 1e-9); };
function assertBatchRule(kind, o, y) {
  const ok = u => lost(kind, u, y) <= TOL + 1e-12 && expectQty(kind, u, y) >= 1;
  assert.ok(o.units <= FIXTURE_CAP || !ok(FIXTURE_CAP), `批量不超过上限 ${FIXTURE_CAP}：${JSON.stringify(o)}`);
  if (ok(o.units)) { for (let u = 1; u < o.units; u++) assert.ok(!ok(u), `批量 ${u} 已达标，不该取 ${o.units}`); }
  else for (let u = 1; u <= FIXTURE_CAP; u++) assert.ok(expectQty(kind, u, y) < 1 || lost(kind, u, y) >= lost(kind, o.units, y) - 1e-12, `上限内应取丢得最少者 ${JSON.stringify(o)}`);
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
