// WATER-1B：食物水分按一条规则派生（液体与固体、有配方与无配方同一条），手写水分只剩参照水本身。
import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,materialProps} from '../server-plugin/item-class.mjs';

const raw=await loadWorld(),engine=new WorldEngine(structuredClone(raw));
const ref=engine.byId.get('item_water'),refMoisture=materialProps(engine,ref.id).moisture.value;
// 手算锚点：每公斤水的水分 = 参照水 25÷(0.25kg×含水1)=100/kg；一份水分 = 重量×含水率×100；低于参照水一份的一半（12.5）记 0；缺含水率数据记 0。
const expected=it=>{
  const mp=materialProps(engine,it.id).moisture;if(!mp.known)return 0;
  const h=it.weight*mp.value*ref.nutrition.hydration/(ref.weight*refMoisture);
  return h>=0.5*ref.nutrition.hydration?Math.floor(h):0;
};

test('手写水分只剩参照水本身（其余食物的水分都由含水率派生）',()=>{
  assert.deepEqual(raw.items.filter(i=>i.nutrition?.hydration!==undefined).map(i=>i.id),['item_water']);
});

test('任一食物的水分 = 含水率×重量×100/kg，低于一半份水记 0；缺含水率为 0（面包 5.4＜12.5 为门槛所致）',()=>{
  const foods=engine.world.items.filter(i=>i.id!=='item_water'&&isItemClass(engine,i.id,'food'));
  assert.ok(foods.length>0);
  for(const it of foods)assert.equal(engine.byId.get(it.id).nutrition?.hydration??0,expected(it),it.id);
});

test('牛乳不再手写水分：派生 floor(0.5×0.881×100)=44',()=>{
  assert.equal(engine.byId.get('item_milk').nutrition.hydration,44);
});
