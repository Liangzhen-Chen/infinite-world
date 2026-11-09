// D12 卡 B：营养与燃料读材料属性。夹具世界给类别属性，期望值在测试里按公式算（不写死数字，不用正式世界物品 id）；
// 属性未知时与现行（三档密度、按公斤燃料）结果逐字相等。
import test from 'node:test';
import assert from 'node:assert/strict';
import craftingBalance from '../world/rules/tables/balance/crafting.json' with {type:'json'};
import {deriveItemAttributes,householdUsage,fuelEffectiveHeat,fuelReferenceHeat,usageGrams} from '../server-plugin/item-class.mjs';
import {usageCost,usageItemGrams,itemGrams} from '../server-plugin/household-budget.mjs';

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
const L=P('household.waterLatentHeat'),REF=P('household.fuelReferenceClass');
const eff=(heat,m)=>heat*(1-m)-L*m;
const fuels=()=>[
 {id:'item_fx_ref',tags:['fuel',REF],weight:1,basePrice:10},
 {id:'item_fx_damp',tags:['fuel','dampfuel'],weight:1,basePrice:10},
 {id:'item_fx_soaked',tags:['fuel','soakedfuel'],weight:1,basePrice:10},
 {id:'item_fx_unknown',tags:['fuel'],weight:1,basePrice:10},
 {id:'item_fx_salt',tags:['food'],weight:1}
];
const fuelTable={
 [REF]:{heatValue:18,moisture:0.2,basis:'夹具：参照类'},
 dampfuel:{heatValue:18,moisture:0.5,basis:'夹具'},
 soakedfuel:{heatValue:2,moisture:0.9,basis:'夹具：含水过多烧不出净热'}
};
const engineOf=world=>({world,byId:new Map(world.items.map(i=>[i.id,i])),calendar:()=>({season:0})});
const known=(table=fuelTable)=>engineOf(withTable(fuels(),['dampfuel','soakedfuel',REF],structuredClone(table)));
const legacy=()=>engineOf({items:fuels(),recipes:[]});
const kgPerDay=()=>P('household.fuelKgPerDay').cooking+P('household.fuelKgPerDay').heating[0];

test('燃料：有效热值 = 热值×(1−含水率) − 潜热×含水率；潜热与参照类来自规则表', () => {
 const e=known();
 assert.ok(L>0&&typeof REF==='string');
 assert.equal(fuelEffectiveHeat(e,'item_fx_ref'),eff(18,0.2));
 assert.equal(fuelEffectiveHeat(e,'item_fx_damp'),eff(18,0.5));
 assert.equal(fuelEffectiveHeat(e,'item_fx_unknown'),null);
});

test('燃料：基准热值只取参照类，其他燃料写入属性不改变它；同一热量需求下 MJ 不变，含水多的要烧更多公斤', () => {
 const e=known(),ref=fuelReferenceHeat(e);
 assert.equal(ref,eff(18,0.2));
 const more=structuredClone(fuelTable);more.dampfuel.heatValue=30;
 assert.equal(fuelReferenceHeat(known(more)),ref,'别的燃料改属性，基准不动');
 const usage=householdUsage(e,0,[]).find(u=>u.cls==='fuel'),kg=kgPerDay();
 assert.equal(usage.gramsPerDay,kg*1000);
 assert.equal(usage.demandMJ,kg*ref);
 const need={};
 for(const id of ['item_fx_ref','item_fx_damp']){
  const perKgRef=usageGrams(e,id,'fuel',1000)/1000;
  assert.ok(Math.abs(perKgRef-fuelEffectiveHeat(e,id)/ref)<1e-12);
  need[id]=kg/perKgRef;
  assert.ok(Math.abs(need[id]*fuelEffectiveHeat(e,id)-usage.demandMJ)<1e-9,`${id} MJ 守恒`);
 }
 assert.equal(need.item_fx_ref,kg,'参照燃料本身公斤数同现行');
 assert.ok(need.item_fx_damp>need.item_fx_ref);
});

test('燃料：有效热值不为正的燃料顶 0；非燃料类不折算', () => {
 const e=known();
 assert.ok(fuelEffectiveHeat(e,'item_fx_soaked')<0);
 assert.equal(usageGrams(e,'item_fx_soaked','fuel',1000),0);
 assert.equal(usageGrams(e,'item_fx_salt','salt',1000),1000);
});

test('燃料：比价按 价格 ÷ 顶多少基准克；属性未知时 价格 ÷ 克', () => {
 const e=known();
 assert.equal(usageCost(e,'item_fx_damp'),10/(1000*fuelEffectiveHeat(e,'item_fx_damp')/fuelReferenceHeat(e)));
 assert.equal(usageCost(e,'item_fx_unknown'),10/1000);
 assert.equal(usageCost(legacy(),'item_fx_ref'),10/1000);
});

test('燃料：参照类属性未知（无表、或参照类行缺含水率）时，全部与现行逐字相等', () => {
 const noMoisture=structuredClone(fuelTable);delete noMoisture[REF].moisture;
 for(const e of [legacy(),known(noMoisture)]){
  assert.equal(fuelReferenceHeat(e),null);
  assert.equal(usageGrams(e,'item_fx_damp','fuel',1234),1234);
  assert.deepEqual(householdUsage(e,0,['m1','m2']),[
   {cls:'fuel',purpose:'fuel',gramsPerDay:kgPerDay()*1000},
   {cls:'salt',purpose:'seasoning',gramsPerDay:P('household.saltGramsPerPersonDay')*2}]);
 }
 assert.equal(usageGrams(known(),'item_fx_unknown','fuel',1234),1234,'物品自己没有热值也不折算');
});

test('燃料：自采与持有抵扣共用的 usageItemGrams（household-subsistence 的 unitGrams 与持有量都走它）按有效热值折算，未知时等于重量克', () => {
 const e=known(),ref=fuelReferenceHeat(e);
 assert.equal(usageItemGrams(e,'item_fx_damp','fuel'),itemGrams(e,'item_fx_damp')*fuelEffectiveHeat(e,'item_fx_damp')/ref);
 // 采 portions 个基准克的燃料需要的件数随有效热值反比
 const portions=5000;
 assert.equal(Math.ceil(portions/usageItemGrams(e,'item_fx_damp','fuel')),Math.ceil(portions/(itemGrams(e,'item_fx_damp')*fuelEffectiveHeat(e,'item_fx_damp')/ref)));
 for(const eng of [e,legacy()])assert.equal(usageItemGrams(eng,'item_fx_unknown','fuel'),itemGrams(eng,'item_fx_unknown'));
 assert.equal(usageItemGrams(legacy(),'item_fx_ref','fuel'),itemGrams(legacy(),'item_fx_ref'));
 assert.equal(usageItemGrams(e,'item_fx_soaked','fuel'),0);
});
