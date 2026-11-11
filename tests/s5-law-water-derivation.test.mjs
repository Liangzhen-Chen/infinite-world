// WATER-1B：食物水分按一条规则派生（液体与固体、有配方与无配方同一条），手写水分只剩参照水本身；含水量不超过自身质量；派生幂等。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,deriveItemAttributes} from '../server-plugin/item-class.mjs';

const raw=await loadWorld(),engine=new WorldEngine(structuredClone(raw));
const foods=engine.world.items.filter(i=>isItemClass(engine,i.id,'food'));
// 常数手算：每公斤水的水分 = 参照水 25÷(0.25kg×含水1)=100/kg；门槛 = 0.5×25=12.5。
// 配方产物含水量按质量守恒：= clamp(成品质量 − Σ原料干物质÷份数, 0, Σ原料含水量÷份数)，原料干物质 = 质量 − 含水量，非食物原料（燃料、刨花）不进成品。

test('手写水分只剩参照水本身（其余食物的水分都由含水率派生）',()=>{
  assert.deepEqual(raw.items.filter(i=>i.nutrition?.hydration!==undefined).map(i=>i.id),['item_water']);
});

test('代表物品手推值（数据：items.json 重量，mechanics/items.json 与 material-props.json 含水率）',()=>{
  const h=id=>engine.byId.get(id).nutrition?.hydration??0;
  assert.equal(h('item_milk'),44);        // 0.5kg×0.881×100=44.05
  assert.equal(h('item_goat_milk'),26);   // 0.3×0.87×100=26.1
  assert.equal(h('item_animal_milk'),26); // 0.3×0.876×100=26.28
  assert.equal(h('item_bread'),0);        // 0.15×0.36×100=5.4 ＜ 12.5（有含水率数据，门槛所致）
  // 烙饼：燕麦粉干物质 0.4×(1−0.106)=0.358kg÷4 份=0.0894，成品 0.12kg → 含水 0.0306kg → 3.06 ＜ 12.5。
  assert.equal(h('item_oat_flatbread'),0);
  // 燕麦脆饼：干物质 0.358kg（粉 0.4×0.894；水 0.25 全是水）＞成品 0.28kg → 含水 0（烤干），不是一杯水。
  assert.equal(h('item_oat_crisp'),0);
  // 鲜凝块：2 乳干物质 2×(0.5−0.5×0.881)=0.119 + 果醋干物质≈0.003（燃料不计），÷2 份=0.061；成品 0.1kg → 含水 0.039kg → 3.9 ＜ 12.5。
  assert.equal(h('item_fresh_curd'),0);
  // 咸凝块：2 鲜凝块（各含水 0.039、干物质 0.061）+ 盐干物质 0.02×0.998；总干物质 0.1222+0.0200=0.1422，成品 0.16kg → 含水 0.018kg → 1.8 ＜ 12.5（近干）。
  assert.equal(h('item_salted_curd'),0);
  // 盐渍核桃：核桃 0.15×(1−0.04)=0.144 + 盐 0.0200 ＞ 成品 0.15kg → 含水 0。
  assert.equal(h('item_salted_walnut'),0);
  // 鱼汤：干物质 鱼 0.3×(1−0.761)=0.0717 + 盐 0.0200=0.0917（水 2 份全是水）；成品 0.65kg → 含水 0.5583kg → 55.8 → 55（≤ 原料带入的水 0.728，不被它封顶）。
  assert.equal(h('item_fish_broth'),55);
  // 羊肉芜菁煨：干物质 羊肉 0.4×0.33=0.132 + 芜菁 0.4×0.081=0.0324 + 盐 0.0200=0.1844；成品 0.83kg → 含水 0.6456kg → 64.6 → 64。
  assert.equal(h('item_mutton_turnip_stew'),64);
});

test('整类不变量：食物含水量 ≤ 自身质量，水分 ≥ 0 且 ≤ 自重×100',()=>{
  assert.ok(foods.length>0);
  for(const it of foods){
    const b=engine.byId.get(it.id).nutrientBase,hyd=engine.byId.get(it.id).nutrition?.hydration??0;
    assert.ok(b.water<=it.weight+1e-12,`${it.id} 含水量 ${b.water} > 自重 ${it.weight}`);
    assert.ok(hyd>=0&&hyd<=Math.floor(it.weight*100),`${it.id} 水分 ${hyd}`);
  }
});

test('有配方的食物：水分等于其被选配方（引擎记下的 nutrientBase.recipe）按原料含水量推出的值，且不超过质量上限',()=>{
  let checked=0;
  for(const it of foods){
    const b=engine.byId.get(it.id).nutrientBase;if(!b.recipe||it.id==='item_water')continue;
    const r=engine.world.recipes.find(x=>x.id===b.recipe),q=r.output.quantity;
    const wet=r.materials.reduce((n,m)=>n+(engine.byId.get(m.item).nutrientBase?.water??0)*m.amount,0)/q;
    const dry=r.materials.reduce((n,m)=>{const x=engine.byId.get(m.item);return n+(isItemClass(engine,m.item,'food')?Math.max(0,x.weight-(x.nutrientBase?.water??0))*m.amount:0);},0)/q;
    const kg=Math.min(wet,Math.max(0,it.weight-dry));
    assert.ok(Math.abs(b.water-kg)<1e-9,`${it.id}：含水量 ${b.water} ≠ ${kg}`);
    const h=kg*100;assert.equal(engine.byId.get(it.id).nutrition?.hydration??0,h>=12.5?Math.floor(h):0,it.id);
    checked++;
  }
  assert.ok(checked>0);
});

test('派生幂等：对已派生的世界再派生一次，逐物品 nutrition 与 nutrientBase 相等',()=>{
  const once=structuredClone(engine.world),twice=structuredClone(engine.world);
  deriveItemAttributes(twice);
  for(const a of once.items){
    const b=twice.items.find(i=>i.id===a.id);
    assert.deepEqual(b.nutrition,a.nutrition,a.id);assert.deepEqual(b.nutrientBase,a.nutrientBase,a.id);
  }
});
