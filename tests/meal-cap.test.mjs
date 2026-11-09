// D12 单餐可食量上限（材料属性维度 mealCap，g/人·餐）：按类推导、按时间累计的额度（累计额度 + 整件开封后的余量，存档 state.family.mealCap）。
// 夹具类别（fxsweet 带上限、fxstaple 无上限、fxfruit 按干物质基准）与夹具物品都是测试里临时构造的，期望值按公式在测试里算，不写死数字，不用正式世界的物品名单；
// 注入点都是生产代码自己的参数：世界的 materialProps 表（类别行、表头 mealsPerDay）、物品 tags/props、householdResources 的 days/marketSubstitution、
// household-budget 导出的 householdMealPlan 与 registerHouseholdFoodSources（与 shop.mjs 同一个登记口）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {householdResources,householdMealPlan,registerHouseholdFoodSources} from '../server-plugin/household-budget.mjs';
import {materialProps,mealCapOf,mealCapPools,validateMaterialProps,itemMg} from '../server-plugin/item-class.mjs';

const dimensions={
 moisture:{unit:'质量分数',min:0,max:1},edibleFraction:{unit:'质量分数',min:0,max:1},
 energyDensity:{unit:'饱腹/kg 干物质',min:0,max:100000},heatValue:{unit:'MJ/kg 干物质',min:0,max:60},charYield:{unit:'质量分数',min:0,max:1},
 mealCap:{unit:'g/人·餐',min:0,max:2000}
};
const capRow=(grams,extra={})=>({sources:[{name:'夹具',citation:'夹具',moistureFraction:0,kcalPer100gWet:240,mealGrams:grams,...extra}],selection:{method:'single',reason:'夹具'},basis:'夹具：带单餐上限的佐餐类'});
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
 assert.equal(a.mg,20000);assert.deepEqual(a,b);
 assert.equal(mealCapOf(e,'item_fx_c'),null,'类别没写上限就是没有上限，不给默认值');
 assert.equal(materialProps(e,'item_fx_c').mealCap.known,false);
});

test('干物质基准：类别里存干物质量，每件物品按自己的含水折回鲜重，鲜的与干的是同一个类值、不按名字区分', () => {
 const table=header(20,{precedence:['fxfruit'],classes:{fxfruit:{sources:[{name:'夹具',citation:'夹具',moistureFraction:0.8,kcalPer100gWet:60,mealGrams:100,mealBasis:'dryMatter'}],selection:{method:'single',reason:'夹具'},basis:'夹具'}}});
 const dried={id:'item_fx_dried',tags:['food','fxfruit'],weight:0.05,props:{sources:[{name:'干',citation:'夹具',moistureFraction:0.2}],selection:{method:'single',reason:'夹具'},basis:'夹具：只覆盖含水'}};
 const fresh={id:'item_fx_fresh',tags:['food','fxfruit'],weight:0.05};
 const e=pureEngine([dried,fresh],table);
 const dryGrams=100*(1-0.8);
 assert.equal(materialProps(e,'item_fx_fresh').mealCap.value,Math.round(dryGrams/(1-0.8)*10)/10);
 assert.equal(materialProps(e,'item_fx_dried').mealCap.value,Math.round(dryGrams/(1-0.2)*10)/10);
 assert.ok(mealCapOf(e,'item_fx_dried').mg<mealCapOf(e,'item_fx_fresh').mg,'同样的干物质，干的鲜重量更小');
 assert.equal(mealCapOf(e,'item_fx_dried').pool,mealCapOf(e,'item_fx_fresh').pool,'同一个类，同一个池');
 const bad=structuredClone(table);delete bad.classes.fxfruit.sources[0].moistureFraction;
 assert.ok(validateMaterialProps({items:[fresh],recipes:[],materialProps:bad}).some(m=>m.includes('mealBasis')));
 const mixed=structuredClone(table);mixed.classes.fxfruit.sources.push({name:'鲜',citation:'夹具',moistureFraction:0.5,kcalPer100gWet:60,mealGrams:50});mixed.classes.fxfruit.selection={method:'mean',reason:'夹具'};
 assert.ok(validateMaterialProps({items:[fresh],recipes:[],materialProps:mixed}).some(m=>m.includes('混用')));
});

test('额度池：同类共用一个池，额度 = 现有累计额度 + 预算期内新增（每人每餐上限 × mealsPerDay × 人·天数），无上限者不受限', () => {
 const e=pureEngine(foods(),header(20)),perDay=e.world.materialProps.mealsPerDay,w=itemMg(e,'item_fx_a');
 const pools=mealCapPools(e,{days:[1,1]});
 const total=20000*perDay*2;
 assert.equal(pools.roomMg('item_fx_a'),total);
 assert.equal(pools.unitsRoom('item_fx_a'),Math.floor(total/w+1e-9));
 pools.take('item_fx_a',{eatMg:w});
 assert.equal(pools.roomMg('item_fx_b'),total-w,'另一件同类物品看到的是同一个池的余量');
 assert.equal(pools.roomMg('item_fx_c'),Infinity);
 assert.deepEqual(pools.violations(),[]);
 pools.take('item_fx_a',{eatMg:total});
 assert.deepEqual(pools.violations(),['fxsweet'],'吃超过额度记为违反不变量');
 // 现有累计额度并入总额；手里没有这个池时不带旧额度
 const saved={allow:{fxsweet:30000},open:{}},held=mealCapPools(e,{days:[1],saved});held.markHeld('item_fx_a');
 assert.equal(held.allowMg('item_fx_a'),30000+20000*perDay);
 assert.equal(mealCapPools(e,{days:[1],saved}).allowMg('item_fx_a'),20000*perDay,'手里没有就不带旧额度');
 // 货到手后才开始累计：晚到 1 天，少 1 天的新增额度
 const late=mealCapPools(e,{days:[3]});
 assert.equal(late.allowMg('item_fx_a',1),20000*perDay*2);
 // 开封余量：先吃，且视为持有
 const opened=mealCapPools(e,{days:[1],saved:{allow:{},open:{item_fx_a:12345}}});
 assert.equal(opened.openMg('item_fx_a'),12345);
 opened.take('item_fx_a',{fromOpen:2345});assert.equal(opened.openMg('item_fx_a'),10000);
 // 表里改值，额度随之变；表头没有 mealsPerDay 时没有任何上限
 assert.equal(mealCapPools(pureEngine(foods(),header(40)),{days:[1]}).roomMg('item_fx_a'),40000*perDay);
 const none=header(20);delete none.mealsPerDay;
 assert.equal(mealCapPools(pureEngine(foods(),none),{days:[1]}).roomMg('item_fx_a'),Infinity);
});

test('物品自己的 props 写了上限就自成一个池，覆盖类别值', () => {
 const items=[...foods(),{id:'item_fx_own',tags:['food','fxsweet'],weight:0.05,props:{sources:[{name:'自有',citation:'夹具',moistureFraction:0,kcalPer100gWet:240,mealGrams:10}],selection:{method:'single',reason:'夹具'},basis:'夹具'}}];
 const e=pureEngine(items,header(20));
 const own=mealCapOf(e,'item_fx_own');
 assert.equal(own.mg,10000);assert.notEqual(own.pool,mealCapOf(e,'item_fx_a').pool);
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

// —— 家户预算与每日吃饭：生产引擎上，用夹具类别与夹具物品 ——
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const owner='npc_hw_linsui',DAYS=5,HOUSE='house_meal_cap_fixture';
function fixture(stock,{coins=0,grams=20}={}){
 const w=structuredClone(world);
 // 夹具类别与同类的两件新物品（只带 tags，不写任何属性）；另有一件无上限的主体食物。物品行借现成食物行的形状，id、标签、重量是夹具的。
 // 引擎构造时才把 mechanics 并进运行时世界并派生营养，所以夹具写在 mechanics.materialProps 上。
 const table=w.mechanics.materialProps;
 table.classes.fxsweet=capRow(grams);table.classes.fxstaple=structuredClone(stapleRow);
 table.precedence.unshift('fxsweet','fxstaple');
 const shape=w.items.find(i=>(i.tags??[]).includes('food')&&!w.recipes.some(r=>r.output?.item===i.id));
 const make=(id,tags)=>({...structuredClone(shape),id,name:id,tags:['food',...tags],weight:0.1,aliases:[]});
 for(const x of [make('item_fx_sweet_a',['fxsweet']),make('item_fx_sweet_b',['fxsweet']),make('item_fx_main',['fxstaple'])]){
  delete x.nutrition;delete x.props;w.items.push(x);
 }
 // 一户只有 owner 一人（与 s5-law-household-budget 的夹具同法）。
 w.households=w.households.map(h=>({...h,members:h.members.filter(id=>id!==owner)})).filter(h=>h.members.length);
 w.households.push({id:HOUSE,members:[owner],settlement:'loc_hw',homeLocation:'bld_hw_qingdeng',tenure:'沿用已发布住处，独立登记家计'});
 // 手算锚点：每个居民每天需 10 饱腹。
 for(const r of w.primitiveTables.body.rows)if(r.need==='satiety'&&r.selector==='person')r.drainPerHour.light=10/24;
 w.marketRules.householdBuffer.profiles=[{id:'ordinary',through:20,cycles:1}];
 const engine=new WorldEngine(w);let document=engine.initialFromLegacy(legacy,'meal-cap');
 document.state.minute=0;
 document.state.npcs[owner].inventory={...stock};document.state.npcs[owner].coins=coins;
 const sync=()=>{document.ledger=openLedger(engine,document);};sync();
 const d={get document(){return document;},get:(...p)=>p.reduce((v,k)=>v?.[k],document)};
 return {engine,d,state:document.state,sync};
}
const foodOf=(r,item)=>r.rows.find(x=>x.item===item)?.food??0;
const eatOf=(r,item)=>r.rows.find(x=>x.item===item)?.eatMg??0;
const perDayOf=engine=>engine.world.materialProps.mealsPerDay;
const allowMg=(engine,item,days)=>mealCapOf(engine,item).mg*perDayOf(engine)*days;
const satOf=(f,item)=>f.engine.byId.get(item).nutrition.satiety;
const satPerMg=(f,item)=>satOf(f,item)/itemMg(f.engine,item);

test('夹具里调味佐餐品与主体食物同能量、单件饱腹足以补满需求，所以只有上限能拦住佐餐品', () => {
 const f=fixture({});
 assert.ok(satOf(f,'item_fx_sweet_a')>0&&satOf(f,'item_fx_sweet_a')===satOf(f,'item_fx_main'),'差别只在类别有无单餐上限');
 assert.ok(satOf(f,'item_fx_sweet_a')*12>10*DAYS,'手里 12 件足够补满需求');
});

test('自留：带单餐上限的类别按毫克吃到额度为止，主体食物不足时补不满缺口；无上限的同能量食物补满', () => {
 const capped=fixture({item_fx_sweet_a:12}),r=householdResources(capped.d,capped.engine,owner,{days:DAYS,marketSubstitution:false});
 const allow=allowMg(capped.engine,'item_fx_sweet_a',DAYS),w=itemMg(capped.engine,'item_fx_sweet_a');
 assert.ok(allow>0&&allow<12*w,'夹具上限确实在起作用');
 assert.equal(eatOf(r,'item_fx_sweet_a'),allow);
 assert.equal(foodOf(r,'item_fx_sweet_a'),Math.ceil(allow/w-1e-9),'额度不是整件的倍数时，最后一件开封、吃一部分');
 assert.ok(Math.abs(r.shortfall.satiety-(10*DAYS-allow*satPerMg(capped,'item_fx_sweet_a')))<1e-6);
 const plain=fixture({item_fx_main:12}),p=householdResources(plain.d,plain.engine,owner,{days:DAYS,marketSubstitution:false});
 assert.equal(p.shortfall.satiety,0);assert.ok(foodOf(p,'item_fx_main')*w>allow);
});

test('自留：整件大于一天的额度时分几天吃（额度累计），不是首件向上取整就整件吃掉', () => {
 // 额度 25 g/餐 × 3 = 75 g/天，一件 100 g：一天只吃得下 75 g，不会把整件算进当天
 const f=fixture({item_fx_sweet_a:3},{grams:25}),r=householdResources(f.d,f.engine,owner,{days:1,marketSubstitution:false});
 assert.equal(eatOf(r,'item_fx_sweet_a'),allowMg(f.engine,'item_fx_sweet_a',1));
 assert.ok(eatOf(r,'item_fx_sweet_a')<itemMg(f.engine,'item_fx_sweet_a'));
});

test('自留：同类两件物品共用一个额度池；主体食物先吃，佐餐品只补池里剩下的', () => {
 const f=fixture({item_fx_sweet_a:6,item_fx_sweet_b:6}),r=householdResources(f.d,f.engine,owner,{days:DAYS,marketSubstitution:false});
 const allow=allowMg(f.engine,'item_fx_sweet_a',DAYS);
 assert.equal(eatOf(r,'item_fx_sweet_a')+eatOf(r,'item_fx_sweet_b'),allow,'两件同类物品合起来不超过一个类的额度');
 const mixed=fixture({item_fx_sweet_a:12,item_fx_main:3}),m=householdResources(mixed.d,mixed.engine,owner,{days:DAYS,marketSubstitution:false});
 const sat=satOf(mixed,'item_fx_main'),needMg=Math.ceil((10*DAYS-3*sat)/satPerMg(mixed,'item_fx_sweet_a'));
 assert.equal(foodOf(m,'item_fx_main'),3);
 assert.equal(eatOf(m,'item_fx_sweet_a'),Math.min(allow,needMg));
});

test('上限只由表决定：改类别行里的出处值，额度随之变化', () => {
 const base=fixture({item_fx_sweet_a:12}),before=eatOf(householdResources(base.d,base.engine,owner,{days:DAYS,marketSubstitution:false}),'item_fx_sweet_a');
 const f=fixture({item_fx_sweet_a:12});
 f.engine.world.materialProps.classes.fxsweet=capRow(40);// 换一整行（行上的推算值按行对象缓存）
 const r=householdResources(f.d,f.engine,owner,{days:DAYS,marketSubstitution:false});
 assert.ok(eatOf(r,'item_fx_sweet_a')>before);
 assert.equal(eatOf(r,'item_fx_sweet_a'),Math.min(allowMg(f.engine,'item_fx_sweet_a',DAYS),Math.ceil(10*DAYS/satPerMg(f,'item_fx_sweet_a'))));
});

test('市场替代：调味佐餐品的购买量同样受额度限制，同能量的无上限食物买到补满为止', () => {
 const before=registerHouseholdFoodSources.fn;
 try{
  const buy=item=>{
   const f=fixture({},{coins:1000});
   registerHouseholdFoodSources((d)=>[{source:'fx_shop',seller:'npc_fx_seller',item,at:d.get('state').minute,quantity:100,unitPrice:1}]);
   const r=householdResources(f.d,f.engine,owner,{days:DAYS});
   return {f,quantity:r.market.purchases.reduce((n,p)=>n+p.quantity,0),r};
  };
  const sweet=buy('item_fx_sweet_a'),main=buy('item_fx_main');
  const w=itemMg(sweet.f.engine,'item_fx_sweet_a'),units=Math.floor(allowMg(sweet.f.engine,'item_fx_sweet_a',DAYS)/w+1e-9),sat=satOf(sweet.f,'item_fx_sweet_a');
  assert.equal(sweet.quantity,units);
  assert.equal(sweet.r.market.coverage.satiety,units*sat);
  assert.ok(sweet.r.shortfall.satiety>0,'佐餐品买满额度也补不满缺口');
  assert.equal(main.quantity,Math.ceil(10*DAYS/sat));
  assert.equal(main.r.shortfall.satiety,0);
 }finally{registerHouseholdFoodSources(before);}
});

test('市场与自留共用一个池：同类佐餐品的自留与购买合起来不超过类的额度', () => {
 const before=registerHouseholdFoodSources.fn;
 try{
  const f=fixture({item_fx_sweet_a:1},{coins:1000});
  registerHouseholdFoodSources((d)=>[{source:'fx_shop',seller:'npc_fx_seller',item:'item_fx_sweet_b',at:d.get('state').minute,quantity:100,unitPrice:1}]);
  const r=householdResources(f.d,f.engine,owner,{days:DAYS}),allow=allowMg(f.engine,'item_fx_sweet_a',DAYS),w=itemMg(f.engine,'item_fx_sweet_b');
  const bought=r.market.purchases.reduce((n,p)=>n+p.quantity,0)*w,own=eatOf(r,'item_fx_sweet_a');
  assert.ok(own+bought<=allow,`自留 ${own} + 购买 ${bought} 不超过类的额度 ${allow}`);
 }finally{registerHouseholdFoodSources(before);}
});

// 每日吃饭：与 npc-life.advanceHouseholdMeals 同一条路径（householdMealPlan 算、按 row.food 扣背包、capState 写进存档），这里按同样顺序推进几天。
function eatDay(f){
 const plan=householdMealPlan(f.d,f.engine,owner);
 const inv=f.state.npcs[owner].inventory;
 for(const r of plan.rows)if(r.food>0)inv[r.item]=(inv[r.item]??0)-r.food;
 f.state.family??={};f.state.family.mealCap??={};f.state.family.mealCap[HOUSE]=plan.capState;
 f.sync();
 return plan;
}
test('累计额度：整件分几天吃完，额度吃完后清零，状态走存档 state.family.mealCap 且逐日可重复', () => {
 const run=()=>{
  const f=fixture({item_fx_sweet_a:1}),perDay=perDayOf(f.engine),w=itemMg(f.engine,'item_fx_sweet_a'),dayMg=mealCapOf(f.engine,'item_fx_sweet_a').mg*perDay;
  assert.ok(dayMg<w&&2*dayMg>w,'夹具：一天的额度小于一件，两天的额度大于一件');
  const eaten=[],states=[];
  for(let day=0;day<3;day++){const plan=eatDay(f);eaten.push(plan.rows.reduce((n,r)=>n+(r.eatMg??0),0));states.push(structuredClone(f.state.family.mealCap[HOUSE]));}
  assert.equal(eaten[0],dayMg,'第一天吃一天的额度，整件开封');
  assert.equal(eaten[1],w-dayMg,'第二天吃开封后剩下的（小于当天额度）');
  assert.equal(eaten[2],0,'第三天家里没有了');
  assert.equal(f.state.npcs[owner].inventory.item_fx_sweet_a,0);
  assert.deepEqual(states[0].open,{item_fx_sweet_a:w-dayMg},'开封余量写进存档');
  assert.deepEqual(states[2],{allow:{},open:{}},'手里没了，额度与余量清零');
  return JSON.stringify({eaten,states});
 };
 assert.equal(run(),run(),'同一夹具两次推进结果一致');
});

test('不变量：预算期内买进的调味佐餐品，按额度逐日都吃得掉，不会买了不吃', () => {
 const before=registerHouseholdFoodSources.fn;
 try{
  const f=fixture({},{coins:1000});
  registerHouseholdFoodSources((d)=>[{source:'fx_shop',seller:'npc_fx_seller',item:'item_fx_sweet_a',at:d.get('state').minute,quantity:100,unitPrice:1}]);
  const r=householdResources(f.d,f.engine,owner,{days:DAYS}),bought=r.market.purchases.reduce((n,p)=>n+p.quantity,0);
  assert.ok(bought>0);
  // 买进的件数放进背包，逐日按额度吃满预算期：需求每天都有缺口，所以每天吃到额度为止，期末家里不该剩下（件与开封余量都吃完）。
  f.state.npcs[owner].inventory.item_fx_sweet_a=bought;f.sync();
  const w=itemMg(f.engine,'item_fx_sweet_a');
  let eaten=0;
  for(let day=0;day<DAYS;day++)eaten+=eatDay(f).rows.reduce((n,x)=>n+(x.eatMg??0),0);
  assert.equal(eaten,bought*w,'买进的每一毫克都按额度吃掉');
  assert.equal(f.state.npcs[owner].inventory.item_fx_sweet_a,0);
  assert.deepEqual(f.state.family.mealCap[HOUSE].open,{});
 }finally{registerHouseholdFoodSources(before);}
});
