// D12 调味佐餐：单餐可食量上限（材料属性维度 mealCap，g/人·餐）按类推导；口粮替代的两处（allocateMeals 的物理自留与市场替代）按它封顶。
// 夹具类别（fxsweet 带上限、fxstaple 无上限）与夹具物品都是测试里临时构造的，期望值按公式在测试里算，不写死数字，不用正式世界的物品名单；
// 注入点都是生产代码自己的参数：世界的 materialProps 表（类别行、表头 mealsPerDay）、物品 tags、householdResources 的 days/marketSubstitution、
// household-budget 导出的 registerHouseholdFoodSources（与 shop.mjs 同一个登记口）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources,registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {materialProps,mealCapOf,mealCapPools,validateMaterialProps} from '../server-plugin/item-class.mjs';

const dimensions={
 moisture:{unit:'质量分数',min:0,max:1},edibleFraction:{unit:'质量分数',min:0,max:1},
 energyDensity:{unit:'饱腹/kg 干物质',min:0,max:100000},heatValue:{unit:'MJ/kg 干物质',min:0,max:60},charYield:{unit:'质量分数',min:0,max:1},
 mealCap:{unit:'g/人·餐',min:0,max:2000}
};
const capRow=grams=>({sources:[{name:'夹具',citation:'夹具',moistureFraction:0,kcalPer100gWet:240,mealGrams:grams}],selection:{method:'single',reason:'夹具'},basis:'夹具：带单餐上限的佐餐类'});
const stapleRow={sources:[{name:'夹具',citation:'夹具',moistureFraction:0,kcalPer100gWet:240}],selection:{method:'single',reason:'夹具'},basis:'夹具：没有上限的主体食物类'};
const header=(grams=20,extra={})=>({dimensions:structuredClone(dimensions),precedence:['fxsweet','fxstaple'],kcalPerSatiety:24,kcalPerSatietyBasis:'夹具',mealsPerDay:3,mealsPerDayBasis:'夹具',classes:{fxsweet:capRow(grams),fxstaple:structuredClone(stapleRow)},...extra});
const pureEngine=(items,table)=>({world:{items,recipes:[],materialProps:table},byId:new Map(items.map(i=>[i.id,i]))});
const foods=()=>[
 {id:'item_fx_a',tags:['food','fxsweet'],weight:0.05},
 {id:'item_fx_b',tags:['food','fxsweet'],weight:0.05},
 {id:'item_fx_c',tags:['food','fxstaple'],weight:0.05}
];

test('mealCap 按类取值：同类新物品不写任何属性就得到同一上限与同一个池，无上限的类别没有上限', () => {
 const e=pureEngine(foods(),header(20));
 assert.equal(materialProps(e,'item_fx_a').mealCap.value,20);
 assert.equal(materialProps(e,'item_fx_a').mealCap.source,'fxsweet');
 const a=mealCapOf(e,'item_fx_a'),b=mealCapOf(e,'item_fx_b');
 assert.equal(a.kg,0.02);assert.deepEqual(a,b);
 assert.equal(mealCapOf(e,'item_fx_c'),null,'类别没写上限就是没有上限，不给默认值');
 assert.equal(materialProps(e,'item_fx_c').mealCap.known,false);
});

test('上限池：同类物品共用一个池，个数按重量整件向下取整，随人·天数与表头 mealsPerDay 线性放大，无上限者不受限', () => {
 const e=pureEngine(foods(),header(20)),perDay=e.world.materialProps.mealsPerDay;
 const pools=mealCapPools(e,2),totalKg=0.02*2*perDay,unit=0.05;
 assert.equal(pools.room('item_fx_a'),Math.floor(totalKg/unit+1e-9));
 pools.take('item_fx_a',1);
 assert.equal(pools.room('item_fx_b'),Math.floor((totalKg-unit)/unit+1e-9),'另一件同类物品看到的是同一个池的余量');
 assert.equal(pools.room('item_fx_c'),Infinity);
 // 上限值来自表：改表里的出处值，余量随之变，不改代码
 const twice=pureEngine(foods(),header(40));
 assert.equal(mealCapPools(twice,2).room('item_fx_a'),Math.floor(0.04*2*perDay/unit+1e-9));
 // 表头没有 mealsPerDay：没有任何上限（不猜每日餐数）
 const none=header(20);delete none.mealsPerDay;
 assert.equal(mealCapPools(pureEngine(foods(),none),2).room('item_fx_a'),Infinity);
});

test('物品自己的 props 写了上限就自成一个池，覆盖类别值', () => {
 const items=[...foods(),{id:'item_fx_own',tags:['food','fxsweet'],weight:0.05,props:{sources:[{name:'自有',citation:'夹具',moistureFraction:0,kcalPer100gWet:240,mealGrams:10}],selection:{method:'single',reason:'夹具'},basis:'夹具'}}];
 const e=pureEngine(items,header(20));
 const own=mealCapOf(e,'item_fx_own');
 assert.equal(own.kg,0.01);assert.notEqual(own.pool,mealCapOf(e,'item_fx_a').pool);
});

test('L1：写了 mealGrams 的表必须有 mealsPerDay 及依据、表头 mealCap 单位与范围；出处值越界报错；存值与推算值不一致报错', () => {
 const ok=()=>({items:foods(),recipes:[],materialProps:header(20)});
 assert.deepEqual(validateMaterialProps(ok()),[]);
 const noPerDay=ok();delete noPerDay.materialProps.mealsPerDay;
 assert.ok(validateMaterialProps(noPerDay).some(m=>m.includes('mealsPerDay')));
 const noBasis=ok();delete noBasis.materialProps.mealsPerDayBasis;
 assert.ok(validateMaterialProps(noBasis).some(m=>m.includes('mealsPerDayBasis')));
 const noUnit=ok();delete noUnit.materialProps.dimensions.mealCap;
 assert.ok(validateMaterialProps(noUnit).some(m=>m.includes('mealCap')));
 const wild=ok();wild.materialProps.classes.fxsweet.sources[0].mealGrams=5000;
 assert.ok(validateMaterialProps(wild).some(m=>m.includes('越界')));
 const stored=ok();stored.materialProps.classes.fxsweet.mealCap=99;
 assert.ok(validateMaterialProps(stored).some(m=>m.includes('mealCap')&&m.includes('不一致')));
 // 不含单餐上限的旧式表（没有 mealCap 维度）仍然合格
 const legacyTable={items:[{id:'item_fx_a',tags:['food','fxstaple'],weight:0.05}],recipes:[],materialProps:{dimensions:Object.fromEntries(Object.entries(dimensions).filter(([k])=>k!=='mealCap')),precedence:['fxstaple'],kcalPerSatiety:24,kcalPerSatietyBasis:'夹具',classes:{fxstaple:structuredClone(stapleRow)}}};
 assert.deepEqual(validateMaterialProps(legacyTable),[]);
});

// —— 家户预算：生产引擎上，用夹具类别与夹具物品 ——
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const owner='npc_hw_linsui',DAYS=5;
function fixture(stock,{coins=0}={}){
 const w=structuredClone(world);
 // 夹具类别与同类的两件新物品（只带 tags，不写任何属性）；另有一件无上限的主体食物。物品行借现成食物行的形状，id、标签、重量是夹具的。
 // 引擎构造时才把 mechanics 并进运行时世界并派生营养，所以夹具写在 mechanics.materialProps 上。
 const table=w.mechanics.materialProps;
 table.classes.fxsweet=capRow(20);table.classes.fxstaple=structuredClone(stapleRow);
 table.precedence.unshift('fxsweet','fxstaple');
 const shape=w.items.find(i=>(i.tags??[]).includes('food')&&!w.recipes.some(r=>r.output?.item===i.id));
 const make=(id,tags)=>({...structuredClone(shape),id,name:id,tags:['food',...tags],weight:0.1,aliases:[]});
 for(const x of [make('item_fx_sweet_a',['fxsweet']),make('item_fx_sweet_b',['fxsweet']),make('item_fx_main',['fxstaple'])]){
  delete x.nutrition;delete x.props;w.items.push(x);
 }
 // 一户只有 owner 一人（与 s5-law-household-budget 的夹具同法）。
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>id!==owner)})).filter(h=>h.members.length);
 w.households.push({id:'house_meal_cap_fixture',members:[owner],settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'});
 // 手算锚点：每个居民每天需 10 饱腹。
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'meal-cap');
 document.state.minute=0;
 document.state.npcs[owner].inventory={...stock};document.state.npcs[owner].coins=coins;
 document.ledger=openLedger(engine,document);
 const d={get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
 return {engine,d,state:document.state};
}
const foodOf=(r,item)=>r.rows.find(x=>x.item===item)?.food??0;
const unitsAllowed=(engine,item,days)=>{const c=mealCapOf(engine,item);return Math.floor(c.kg*days*engine.world.materialProps.mealsPerDay/engine.byId.get(item).weight+1e-9);};
const satOf=(f,item)=>f.engine.byId.get(item).nutrition.satiety;

test('夹具里调味佐餐品与主体食物同能量、单件饱腹足以补满需求，所以只有上限能拦住佐餐品', () => {
 const f=fixture({});
 assert.ok(satOf(f,'item_fx_sweet_a')>0&&satOf(f,'item_fx_sweet_a')===satOf(f,'item_fx_main'),'差别只在类别有无单餐上限');
 assert.ok(satOf(f,'item_fx_sweet_a')*12>10*DAYS,'手里 12 件足够补满需求');
});

test('自留：带单餐上限的类别只吃到上限，主体食物不足时补不满缺口；无上限的同能量食物补满', () => {
 const capped=fixture({item_fx_sweet_a:12}),r=householdResources(capped.d,capped.engine,owner,{days:DAYS,marketSubstitution:false});
 const sat=satOf(capped,'item_fx_sweet_a'),units=unitsAllowed(capped.engine,'item_fx_sweet_a',DAYS);
 assert.ok(units>0&&units<12,'夹具上限确实在起作用');
 assert.equal(foodOf(r,'item_fx_sweet_a'),units);
 assert.equal(r.shortfall.satiety,10*DAYS-units*sat);
 const plain=fixture({item_fx_main:12}),p=householdResources(plain.d,plain.engine,owner,{days:DAYS,marketSubstitution:false});
 assert.equal(p.shortfall.satiety,0);assert.ok(foodOf(p,'item_fx_main')>units);
});

test('自留：同类两件物品共用一个上限池；主体食物先吃，佐餐品只补池里剩下的', () => {
 const f=fixture({item_fx_sweet_a:6,item_fx_sweet_b:6}),r=householdResources(f.d,f.engine,owner,{days:DAYS,marketSubstitution:false});
 const units=unitsAllowed(f.engine,'item_fx_sweet_a',DAYS);
 assert.equal(foodOf(r,'item_fx_sweet_a')+foodOf(r,'item_fx_sweet_b'),units,'两件同类物品合起来不超过一个类的上限');
 const mixed=fixture({item_fx_sweet_a:12,item_fx_main:3}),m=householdResources(mixed.d,mixed.engine,owner,{days:DAYS,marketSubstitution:false});
 const sat=satOf(mixed,'item_fx_main');
 assert.equal(foodOf(m,'item_fx_main'),3);
 assert.equal(foodOf(m,'item_fx_sweet_a'),Math.min(units,Math.ceil((10*DAYS-3*sat)/sat)));
});

test('上限只由表决定：改类别行里的出处值，封顶件数随之变化', () => {
 const base=fixture({item_fx_sweet_a:12}),before=foodOf(householdResources(base.d,base.engine,owner,{days:DAYS,marketSubstitution:false}),'item_fx_sweet_a');
 const f=fixture({item_fx_sweet_a:12});
 f.engine.world.materialProps.classes.fxsweet=capRow(40);// 换一整行（行上的推算值按行对象缓存）
 const r=householdResources(f.d,f.engine,owner,{days:DAYS,marketSubstitution:false});
 assert.equal(foodOf(r,'item_fx_sweet_a'),Math.min(12,unitsAllowed(f.engine,'item_fx_sweet_a',DAYS),Math.ceil(10*DAYS/satOf(f,'item_fx_sweet_a'))));
 assert.ok(foodOf(r,'item_fx_sweet_a')>before);
});

test('市场替代：调味佐餐品的购买量同样封顶，同能量的无上限食物买到补满为止', () => {
 const before=registerHouseholdFoodSources.fn;
 try{
  const buy=item=>{
   const f=fixture({},{coins:1000});
   registerHouseholdFoodSources((d)=>[{source:'fx_shop',seller:'npc_fx_seller',item,at:d.get('state').minute,quantity:100,unitPrice:1}]);
   const r=householdResources(f.d,f.engine,owner,{days:DAYS});
   return {f,quantity:r.market.purchases.reduce((n,p)=>n+p.quantity,0),r};
  };
  const sweet=buy('item_fx_sweet_a'),main=buy('item_fx_main');
  const units=unitsAllowed(sweet.f.engine,'item_fx_sweet_a',DAYS),sat=satOf(sweet.f,'item_fx_sweet_a');
  assert.equal(sweet.quantity,units);
  assert.equal(sweet.r.market.coverage.satiety,units*sat);
  assert.ok(sweet.r.shortfall.satiety>0,'佐餐品买满上限也补不满缺口');
  assert.equal(main.quantity,Math.ceil(10*DAYS/sat));
  assert.equal(main.r.shortfall.satiety,0);
 }finally{registerHouseholdFoodSources(before);}
});

test('市场与自留共用一个池：同类佐餐品的自留与购买合起来不超过类的上限', () => {
 const before=registerHouseholdFoodSources.fn;
 try{
  const f=fixture({item_fx_sweet_a:1},{coins:1000});
  registerHouseholdFoodSources((d)=>[{source:'fx_shop',seller:'npc_fx_seller',item:'item_fx_sweet_b',at:d.get('state').minute,quantity:100,unitPrice:1}]);
  const r=householdResources(f.d,f.engine,owner,{days:DAYS}),units=unitsAllowed(f.engine,'item_fx_sweet_a',DAYS);
  const bought=r.market.purchases.reduce((n,p)=>n+p.quantity,0),own=foodOf(r,'item_fx_sweet_a');
  assert.ok(own+bought<=units,`自留 ${own} + 购买 ${bought} 不超过类的上限 ${units}`);
 }finally{registerHouseholdFoodSources(before);}
});
