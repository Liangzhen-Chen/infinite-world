// WATER-1B：食物水分按一条规则派生（液体与固体、有配方与无配方同一条），手写水分只剩参照水本身。
import test from 'node:test';
import assert from 'node:assert/strict';
import useTags from '../world/meta/item-use-tags.json' with {type:'json'};
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {isItemClass,materialProps,craftingParam} from '../server-plugin/item-class.mjs';

const raw=await loadWorld(),engine=new WorldEngine(structuredClone(raw));
const ref=engine.byId.get('item_water'),refMoisture=materialProps(engine,ref.id).moisture.value;
const loss=craftingParam(engine,'nutrition.processLoss');
// 手算锚点：每公斤水的水分 = 参照水 25÷(0.25kg×含水1)=100/kg；一份水分 = 含水量(kg)×100；低于参照水一份的一半（12.5）记 0；缺含水率数据记 0。
// 无配方的食物：含水量 = 重量×含水率。有配方的产物：含水量 = Σ(原料含水量×用量) × (1−保留损耗：加热 0.1、未加热 0.05) ÷ 产出份数，原料是配方产物时递归；有配方以配方为准。
const producers=new Map();
for(const r of engine.world.recipes??[])if(r.output?.item&&r.output.quantity>0)producers.set(r.output.item,[...producers.get(r.output.item)??[],r]);
const water=id=>{
  const it=engine.byId.get(id);
  if(!it||!isItemClass(engine,id,'food'))return {kg:0,known:false};
  const rs=producers.get(id)??[];
  if(rs.length>1)return null;// 多个配方按饱腹最小者选，不在此复刻选择
  if(rs.length===1){
    const r=rs[0],inputs=r.materials.map(m=>({m,w:water(m.item)}));
    if(inputs.some(x=>x.w===null))return null;
    const heated=r.materials.some(m=>isItemClass(engine,m.item,useTags.heat.materialClass)),keep=1-(heated?loss.heated:loss.unheated);
    return {kg:inputs.reduce((n,x)=>n+x.w.kg*x.m.amount,0)*keep/r.output.quantity,known:inputs.some(x=>x.w.known)};
  }
  const m=materialProps(engine,id).moisture;
  return m.known?{kg:it.weight*m.value,known:true}:{kg:0,known:false};
};
const expected=id=>{
  const w=water(id);if(w===null)return null;
  if(!w.known)return 0;
  const h=w.kg*ref.nutrition.hydration/(ref.weight*refMoisture);
  return h>=0.5*ref.nutrition.hydration?Math.floor(h):0;
};

test('手写水分只剩参照水本身（其余食物的水分都由含水率派生）',()=>{
  assert.deepEqual(raw.items.filter(i=>i.nutrition?.hydration!==undefined).map(i=>i.id),['item_water']);
});

test('任一食物的水分 = 含水量×100/kg（配方产物的含水量由原料派生），低于 12.5 记 0；缺含水率且无配方可派生为 0（面包 5.4＜12.5 为门槛所致）',()=>{
  let checked=0,derivedFromRecipe=0;
  for(const it of engine.world.items.filter(i=>i.id!=='item_water'&&isItemClass(engine,i.id,'food'))){
    const e=expected(it.id);if(e===null)continue;
    assert.equal(engine.byId.get(it.id).nutrition?.hydration??0,e,it.id);
    checked++;if((producers.get(it.id)??[]).length===1)derivedFromRecipe++;
  }
  assert.ok(checked>0&&derivedFromRecipe>0,'配方派生分支必须被覆盖');
});

test('牛乳不再手写水分：派生 floor(0.5×0.881×100)=44',()=>{
  assert.equal(engine.byId.get('item_milk').nutrition.hydration,44);
});
