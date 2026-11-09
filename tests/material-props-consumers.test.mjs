// D12 卡 B：营养与燃料读材料属性。夹具世界给类别属性，期望值在测试里按公式算（不写死数字，不用正式世界物品 id）；
// 属性未知时与现行（三档密度、按公斤燃料）结果逐字相等。
import test from 'node:test';
import assert from 'node:assert/strict';
import craftingBalance from '../world/rules/tables/balance/crafting.json' with {type:'json'};
import {deriveItemAttributes,householdUsage,fuelEffectiveHeat,fuelReferenceHeat,usageGrams} from '../server-plugin/item-class.mjs';

const dimensions={
 moisture:{unit:'质量分数',min:0,max:1},edibleFraction:{unit:'质量分数',min:0,max:1},
 energyDensity:{unit:'饱腹/kg 干物质',min:0,max:100000},heatValue:{unit:'MJ/kg 干物质',min:0,max:60},charYield:{unit:'质量分数',min:0,max:1}
};
const P=id=>craftingBalance.params.find(p=>p.id===id).value;
const withTable=(items,precedence,classes)=>({items,recipes:[],materialProps:{dimensions:structuredClone(dimensions),precedence,classes}});

// —— 营养 ——
const foods=()=>[
 {id:'item_fx_a',tags:['food','plantish'],weight:0.5},
 {id:'item_fx_b',tags:['food','wetish'],weight:0.5},
 {id:'item_fx_half',tags:['food','halfish'],weight:0.5},
 {id:'item_fx_none',tags:['food'],weight:0.5},
 {id:'item_fx_hand',tags:['food','plantish'],weight:0.5,nutrition:{satiety:7}}
];
const foodTable={
 plantish:{energyDensity:4000,moisture:0.2,basis:'夹具'},
 wetish:{energyDensity:4000,moisture:0.8,basis:'夹具'},
 halfish:{energyDensity:4000,basis:'夹具：只写能量密度，含水率未知'}
};
const derive=table=>{
 const world=table?withTable(foods(),['plantish','wetish','halfish'],table):{items:foods(),recipes:[]};
 deriveItemAttributes(world);return new Map(world.items.map(i=>[i.id,i]));
};

test('营养：能量密度与含水率已知时，饱腹 = 重量 × 能量密度 ×（1−含水率），含水率变则按公式变', () => {
 const got=derive(foodTable),c=foodTable;
 for(const [id,cls] of [['item_fx_a','plantish'],['item_fx_b','wetish']]){
  const expected=Math.floor(0.5*c[cls].energyDensity*(1-c[cls].moisture));
  assert.equal(got.get(id).nutrition.satiety,expected,id);
  assert.equal(got.get(id).nutrientContent.satiety,expected,id);
 }
 assert.ok(got.get('item_fx_a').nutrition.satiety>got.get('item_fx_b').nutrition.satiety,'含水多的同重食物饱腹低');
});

test('营养：手写营养不动', () => {
 assert.deepEqual(derive(foodTable).get('item_fx_hand').nutrition,{satiety:7});
});

test('营养：属性未知（无表、没覆盖的类别、只知一项）与现行三档密度逐字相等', () => {
 const legacy=derive(null),got=derive(foodTable);
 const dflt=Math.floor(0.5*P('nutrition.densityPerKg').default);
 assert.equal(legacy.get('item_fx_none').nutrition.satiety,dflt);
 assert.deepEqual(got.get('item_fx_none').nutrition,legacy.get('item_fx_none').nutrition);
 assert.deepEqual(got.get('item_fx_half').nutrition,legacy.get('item_fx_half').nutrition,'只知能量密度、含水率未知，退回现行');
 assert.deepEqual(got.get('item_fx_half').nutrientContent,legacy.get('item_fx_half').nutrientContent);
});

// —— 燃料 ——
const L=P('household.waterLatentHeat');
const eff=(heat,m)=>heat*(1-m)-L*m;
const fuels=()=>[
 {id:'item_fx_dry',tags:['fuel','dryfuel'],weight:1},
 {id:'item_fx_damp',tags:['fuel','dampfuel'],weight:1},
 {id:'item_fx_soaked',tags:['fuel','soakedfuel'],weight:1},
 {id:'item_fx_unknown',tags:['fuel'],weight:1},
 {id:'item_fx_salt',tags:['food'],weight:1}
];
const fuelTable={
 dryfuel:{heatValue:18,moisture:0.1,basis:'夹具'},
 dampfuel:{heatValue:18,moisture:0.4,basis:'夹具'},
 soakedfuel:{heatValue:2,moisture:0.9,basis:'夹具：含水过多烧不出净热'}
};
const engineOf=world=>({world,byId:new Map(world.items.map(i=>[i.id,i])),calendar:()=>({season:0})});
const known=()=>engineOf(withTable(fuels(),['dryfuel','dampfuel','soakedfuel'],fuelTable));
const legacy=()=>engineOf({items:fuels(),recipes:[]});

test('燃料：有效热值 = 热值×(1−含水率) − 潜热×含水率；潜热来自规则表', () => {
 const e=known();
 assert.ok(L>0);
 assert.equal(fuelEffectiveHeat(e,'item_fx_dry'),eff(18,0.1));
 assert.equal(fuelEffectiveHeat(e,'item_fx_damp'),eff(18,0.4));
 assert.equal(fuelEffectiveHeat(e,'item_fx_unknown'),null);
});

test('燃料：基准热值是已知且为正的燃料的平均；同一热量需求下 MJ 不变，含水多的要烧更多公斤', () => {
 const e=known(),ref=fuelReferenceHeat(e);
 assert.equal(ref,(eff(18,0.1)+eff(18,0.4))/2);
 const usage=householdUsage(e,0,[]).find(u=>u.cls==='fuel');
 const kg=P('household.fuelKgPerDay').cooking+P('household.fuelKgPerDay').heating[0];
 assert.equal(usage.gramsPerDay,kg*1000);
 assert.equal(usage.demandMJ,kg*ref);
 const needKg={};
 for(const id of ['item_fx_dry','item_fx_damp']){
  const perKgRef=usageGrams(e,id,'fuel',1000)/1000;            // 烧 1 公斤这种燃料顶多少基准公斤
  assert.ok(Math.abs(perKgRef-eff(id==='item_fx_dry'?18:18,id==='item_fx_dry'?0.1:0.4)/ref)<1e-12);
  needKg[id]=kg/perKgRef;                                       // 满足日需求要烧的公斤
  assert.ok(Math.abs(needKg[id]*fuelEffectiveHeat(e,id)-usage.demandMJ)<1e-9,`${id} MJ 守恒`);
 }
 assert.ok(needKg.item_fx_damp>needKg.item_fx_dry);
});

test('燃料：有效热值不为正的燃料顶 0；非燃料类不折算', () => {
 const e=known();
 assert.ok(fuelEffectiveHeat(e,'item_fx_soaked')<0);
 assert.equal(usageGrams(e,'item_fx_soaked','fuel',1000),0);
 assert.equal(usageGrams(e,'item_fx_salt','salt',1000),1000);
});

test('燃料：属性未知（物品没有热值、或整个世界无表）时与现行逐字相等', () => {
 const e=known(),old=legacy();
 assert.equal(usageGrams(e,'item_fx_unknown','fuel',1234),1234);
 assert.equal(usageGrams(old,'item_fx_dry','fuel',1234),1234);
 assert.equal(fuelReferenceHeat(old),null);
 const kg=P('household.fuelKgPerDay').cooking+P('household.fuelKgPerDay').heating[0];
 assert.deepEqual(householdUsage(old,0,['m1','m2']),[
  {cls:'fuel',purpose:'fuel',gramsPerDay:kg*1000},
  {cls:'salt',purpose:'seasoning',gramsPerDay:P('household.saltGramsPerPersonDay')*2}]);
});
