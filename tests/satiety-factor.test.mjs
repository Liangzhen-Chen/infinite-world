// 饱腹不等于热量：饱腹 = kcal ÷ kcalPerSatiety × 系数，系数 = Π 各因子（现只有能量密度一个）。参数一律读生产 crafting.json。
import test from 'node:test';
import assert from 'node:assert/strict';
import crafting0 from '../world/rules/tables/balance/crafting.json' with {type:'json'};
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {satietyFactor,materialProps,craftingParam} from '../server-plugin/item-class.mjs';

const world=await loadWorld();
const engine=new WorldEngine(structuredClone(world));
const spec=craftingParam(engine,'nutrition.satietyFactor');
const ed=spec.energyDensity,kps=engine.world.materialProps.kcalPerSatiety;
// 1 公斤重、能量密度为 e kcal/g 的食物，饱腹值 = e × 1000 ÷ kps
const probe=e=>({id:'probe',weight:1,satiety:e*1000/kps});
const factorAt=e=>{const p=probe(e);return satietyFactor(engine.world,p,p.satiety);};

test('系数随能量密度单调下降：越稀越饱，越浓越不饱', () => {
  const es=[0.3,0.5,0.9,1.5,2.2,3,4,5.5,7],fs=es.map(factorAt);
  for(let i=1;i<fs.length;i++)assert.ok(fs[i]<=fs[i-1]+1e-12,`${es[i]}: ${fs[i]} > ${fs[i-1]}`);
  assert.ok(fs[0]>1&&fs.at(-1)<1);
});

test('能量密度等于参照（主食）时系数为 1，中间段按 (ED/ref)^k', () => {
  assert.ok(Math.abs(factorAt(ed.ref)-1)<1e-9);
  const e=ed.ref*0.5;
  assert.ok(Math.abs(factorAt(e)-Math.min(ed.max,Math.max(ed.min,0.5**ed.k)))<1e-9);
});

test('上下限生效：极稀取 max，极浓取 min', () => {
  assert.equal(factorAt(1e-4),ed.max);
  assert.equal(factorAt(1e3),ed.min);
});

test('没有克数或没有饱腹的物品因子取 1', () => {
  assert.equal(satietyFactor(engine.world,{id:'x',weight:0},10),1);
  assert.equal(satietyFactor(engine.world,{id:'x',weight:1},0),1);
});

test('扩展因子接口：没有数据的维度因子取 1，有数据时按配置追加', () => {
  const w=structuredClone(engine.world);
  const crafting=structuredClone(crafting0);
  const p=crafting.params.find(x=>x.id==='nutrition.satietyFactor');
  // 蛋白不是现有材料维度，任何物品都没有数据 → 因子仍为 1
  p.value.dimensions={protein:{k:0.3,ref:0.2,min:0.8,max:1.5}};
  w.balance={...w.balance,crafting};
  const item=engine.byId.get('item_hen_egg'),sat=item.nutrientContent.satiety;
  assert.equal(satietyFactor(w,item,sat),satietyFactor(engine.world,item,sat));
  // 含水是现有材料维度：已知含水的物品多乘一个因子，未知的不变
  p.value.dimensions={moisture:{k:-0.2,ref:0.5,min:0.8,max:1.25}};
  const known=engine.byId.get('item_oats'),mp=materialProps({world:w,byId:engine.byId},known.id);
  assert.ok(mp.moisture.known);
  const base=satietyFactor(engine.world,known,40),want=Math.min(1.25,Math.max(0.8,(mp.moisture.value/0.5)**-0.2));
  assert.ok(Math.abs(satietyFactor(w,known,40)-base*want)<1e-9);
  const unknown=engine.byId.get('item_water');
  assert.equal(materialProps({world:w,byId:engine.byId},unknown.id).moisture.known,false);
  assert.equal(satietyFactor(w,unknown,12),satietyFactor(engine.world,unknown,12));
});

test('面包不再手写饱腹：按物品自己的出处推导（重量 × 能量密度 ×（1 − 含水）× 系数），量级与主食相当', () => {
  const raw=world.items.find(i=>i.id==='item_bread');
  assert.equal(raw.nutrition,undefined);
  const bread=engine.byId.get('item_bread'),mp=materialProps(engine,bread.id);
  assert.equal(mp.moisture.source,'item');
  assert.equal(mp.energyDensity.source,'item');
  const base=bread.weight*mp.energyDensity.value*(1-mp.moisture.value);
  assert.equal(bread.nutrition.satiety,Math.floor(base*satietyFactor(engine.world,bread,base)));
  // 成品能量密度落在主食参照的 0.5–1.5 倍内
  const e=bread.nutrition.satiety*kps/(bread.weight*1000);
  assert.ok(e>ed.ref*0.5&&e<ed.ref*1.5,String(e));
});

test('手写饱腹视为按热量的基值，同样乘系数；手写只给部分维度时，没给的维度用推导值', () => {
  const authored=world.items.filter(i=>i.nutrition?.satiety!==undefined&&i.nutrition.satiety>0);
  assert.ok(authored.length>0);
  for(const a of authored){
    const it=engine.byId.get(a.id),b=a.nutrition.satiety;
    assert.equal(it.nutrition.satiety,Math.floor(b*satietyFactor(engine.world,it,b)),a.id);
  }
  // 只手写了 hydration 的物品：hydration 用手写，satiety 由类别推导（牛奶）
  const milkRaw=world.items.find(i=>i.id==='item_milk'),milk=engine.byId.get('item_milk'),mp=materialProps(engine,milk.id);
  assert.equal(milkRaw.nutrition.satiety,undefined);
  assert.equal(milk.nutrition.hydration,milkRaw.nutrition.hydration);
  const base=milk.weight*mp.energyDensity.value*(1-mp.moisture.value);
  assert.equal(milk.nutrition.satiety,Math.floor(base*satietyFactor(engine.world,milk,base)));
  assert.ok(milk.nutrition.satiety>0);
});

test('烙饼、鱼汤、炖菜不再手写饱腹，由配方派生；能量密度：烙饼近主食，鱼汤远低于主食', () => {
  for(const id of ['item_oat_flatbread','item_fish_broth','item_mutton_turnip_stew'])assert.equal(world.items.find(i=>i.id===id).nutrition,undefined,id);
  const flat=engine.byId.get('item_oat_flatbread'),broth=engine.byId.get('item_fish_broth');
  const eOf=it=>it.nutrition.satiety*kps/(it.weight*1000);
  assert.ok(eOf(flat)>ed.ref*0.6&&eOf(flat)<ed.ref*1.4);
  assert.ok(eOf(broth)<ed.ref*0.5,'汤的能量密度远低于主食');
});

test('多个维度叠加后，系数整体仍夹在 [min,max] 内', () => {
  const w=structuredClone(engine.world),crafting=structuredClone(crafting0);
  const p=crafting.params.find(x=>x.id==='nutrition.satietyFactor');
  // 含水、可食部分两个现有维度各自最大放大 2.5 倍，叠加（连同能量密度）远超上限
  p.value.dimensions={moisture:{k:-3,ref:0.5,min:0.1,max:3},edibleFraction:{k:-3,ref:0.5,min:0.1,max:3}};
  w.balance={...w.balance,crafting};
  const item=engine.byId.get('item_oats');
  const mp=materialProps({world:w,byId:engine.byId},item.id);
  assert.ok(mp.moisture.known);
  for(const sat of [0.5,5,50,500]){
    const f=satietyFactor(w,item,sat);
    assert.ok(f>=ed.min-1e-12&&f<=ed.max+1e-12,`${sat}: ${f}`);
  }
  // 极稀（能量密度因子已到 max）再叠加含水因子大于 1：仍封顶在 max
  p.value.dimensions={moisture:{k:-3,ref:0.9,min:0.1,max:3}};
  assert.equal(satietyFactor(w,item,1e-4*item.weight),ed.max);
});
