// WATER-1B：食物水分按一条规则派生（液体与固体、有配方与无配方同一条），手写水分只剩参照水本身；含水量不超过自身质量；派生幂等。
import test from 'node:test';
import assert from 'node:assert/strict';
import useTags from '../world/meta/item-use-tags.json' with {type:'json'};
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,craftingParam,deriveItemAttributes} from '../server-plugin/item-class.mjs';

const raw=await loadWorld(),engine=new WorldEngine(structuredClone(raw));
const foods=engine.world.items.filter(i=>isItemClass(engine,i.id,'food'));
// 常数手算：每公斤水的水分 = 参照水 25÷(0.25kg×含水1)=100/kg；门槛 = 0.5×25=12.5；配方保留 = 1−加热损耗 0.1（未加热 0.05），crafting.json nutrition.processLoss。

test('手写水分只剩参照水本身（其余食物的水分都由含水率派生）',()=>{
  assert.deepEqual(raw.items.filter(i=>i.nutrition?.hydration!==undefined).map(i=>i.id),['item_water']);
});

test('代表物品手推值（数据：items.json 重量，mechanics/items.json 与 material-props.json 含水率）',()=>{
  const h=id=>engine.byId.get(id).nutrition?.hydration??0;
  assert.equal(h('item_milk'),44);        // 0.5kg×0.881×100=44.05
  assert.equal(h('item_goat_milk'),26);   // 0.3×0.87×100=26.1
  assert.equal(h('item_animal_milk'),26); // 0.3×0.876×100=26.28
  assert.equal(h('item_bread'),0);        // 0.15×0.36×100=5.4 ＜ 12.5（有含水率数据，门槛所致）
  assert.equal(h('item_oat_flatbread'),0);// (燕麦粉 0.4kg×谷类含水≈0.106 + 水 0.25)×0.9÷4≈0.066kg → 6.6 ＜ 12.5
  assert.equal(h('item_fresh_curd'),0);   // 派生含水量 (2 乳×0.5×0.881)×0.9÷2≈0.4kg 超过自重 0.1kg，封顶 0.1kg → 10 ＜ 12.5
  assert.equal(h('item_mutton_turnip_stew'),83); // (羊肉 0.4×0.67 + 芜菁 0.4×0.919 + 水 0.5)×0.9≈1.02kg 超过自重 0.83kg，封顶 0.83kg → 83
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
  const loss=craftingParam(engine,'nutrition.processLoss');
  let checked=0;
  for(const it of foods){
    const b=engine.byId.get(it.id).nutrientBase;if(!b.recipe||it.id==='item_water')continue;
    const r=engine.world.recipes.find(x=>x.id===b.recipe),heated=r.materials.some(m=>isItemClass(engine,m.item,useTags.heat.materialClass));
    const sum=r.materials.reduce((n,m)=>n+(engine.byId.get(m.item).nutrientBase?.water??0)*m.amount,0);
    const kg=Math.min(it.weight,sum*(1-(heated?loss.heated:loss.unheated))/r.output.quantity);
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
