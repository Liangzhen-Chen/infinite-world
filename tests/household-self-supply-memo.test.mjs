import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {withRecordIndex,setRecordIndexCheck,recordIndexCheck} from '../server-plugin/storage.mjs';
import {upkeepSelfSupply,upkeepSelfTrips} from '../server-plugin/household-subsistence.mjs';
import {householdUsage,usageItemGrams} from '../server-plugin/household-budget.mjs';

// 户内自给的状态记忆：声明的依赖要覆盖规划读到的状态。打开既有的记忆校验开关（storage 的 setRecordIndexCheck：命中后复算比对，过期即抛，并记入 recordIndexCheck.violations）。
// 夹具：一户一人（A），住处只有一条 2 km 步行路通到一片公共林（面积 2 km²，满存），A 无雇佣无官职。
// 手推期望（与 market-food-pool 的 handSelfSupply 同一推导）：日用度 N = householdUsage 的燃料行克数；一件柴顶 unit = usageItemGrams(wood,'fuel') 基准克；
// 要采 ceil(ceil(N) ÷ unit) 件，此处 unit ≥ N，所以一件；往返 60 分钟，一趟工时 (480 − 60) ÷ 15 分钟/件 = 28 件 ≥ 1，林存远大于 1：自给 = 1 × unit 基准克。
// 公共工程（F083，npc-state.mjs:231-236）：有“有效”的做工记录、且有公共工程处于“施工中”时，该人在两个工作窗（08:00-12:00、13:00-17:01）里的位置是工地而不是家；
// 采集家用燃料只用在家的时段（household-subsistence.mjs 的 upkeep 只用 off 的时段），整个工作日都不在家 → 没有可用时段，自给 = 0 件，行程为空。
// 只有做工记录、工程还没开工（没有“施工中”的公共工程）时，不算做工，自给不变；完工后恢复。
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));

function fixture(seed){
 const w=structuredClone(world);for(const n of w.npcs){delete n.schedule;delete n.tier;}
 const north=w.locations.find(l=>l.id==='loc_hw_northwood'),spot=id=>({id,name:id,parent:'loc_hw',scope:'loc_hw',coordinates:[0,0],terrain:'平地',openHours:[0,1440],owner:null});
 w.locations.push({...structuredClone(north),id:'loc_mk_grove',name:'测试林',areaKm2:2},spot('loc_mk_home_a'));
 w.routes.push({id:'route_mk_grove',from:'loc_mk_home_a',to:'loc_mk_grove',modes:['walk'],lengthKm:2,closedSeasons:[]});
 const adultAge=w.rules.householdSubsistence.minimumAge+10;
 const template=w.npcs.find(n=>n.scope==='loc_hw'&&n.age>=adultAge&&!n.shopType&&!(n.services??[]).length);
 assert.ok(template,'前置：聚落里有一位不开店、不提供服务的成年基线人物可作新建居民的模板');
 const A='npc_mk_a',n=structuredClone(template);
 Object.assign(n,{id:A,name:A,aliases:[],age:adultAge,householdId:`house_${A}`,household:[],home:{location:'loc_mk_home_a',access:'夹具新建'},location:'loc_mk_home_a',inventory:{},coins:0});
 for(const k of ['occupation','shopType','services','schedule','tier','notes','socialProfile'])delete n[k];
 w.npcs.push(n);w.households.push({id:`house_${A}`,settlement:'loc_hw',homeLocation:'loc_mk_home_a',members:[A],tenure:'夹具新建'});
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},seed);
 return {e,doc,A};
}

test('upkeepSelfSupply 记忆：成交写入保留记忆；做工记录、公共工程开工与完工各按手推期望改变自给；校验开关无违例',()=>{
 setRecordIndexCheck(true);
 const before=recordIndexCheck.violations.length,hitsBefore=recordIndexCheck.memoHits;
 try{
  const {e,doc,A}=fixture('self-supply-memo'),d=e.primitiveDraft(doc);
  const unit=usageItemGrams(e,'item_wood','fuel'),N=householdUsage(e,doc.state,[null]).find(u=>u.cls==='fuel').gramsPerDay;
  assert.ok(unit>=N&&Math.ceil(Math.ceil(N)/unit)===1,'前置：一件柴即可抵光一户的日需');
  withRecordIndex(()=>{
   const supply=()=>upkeepSelfSupply(e,d.get('state'),A),trips=()=>upkeepSelfTrips(e,d.get('state'),A);
   const first=trips();
   assert.equal(first.length,1);assert.equal(first[0].cls,'fuel');assert.equal(first[0].units,1);assert.equal(first[0].unitGrams,unit);
   assert.deepEqual(supply(),{fuel:unit},'手推：一趟一件柴 = unit 基准克');
   assert.equal(trips(),first,'同状态再读命中同一份记忆');
   // 成交只写持有与钱：记忆保留（同一份），读数不变。
   d.set(['state','npcs',A,'coins'],(d.get('state','npcs',A,'coins')??0)+1);
   assert.equal(trips(),first,'钱变了不该重算自给');
   // 只有做工记录、工程未开工：不算做工，自给不变（记录类别 project_assignment 在依赖里，记忆重算但值同）。
   const m=d.get('state','minute');
   d.set(['state','records',`project_assignment:proj_memo:${A}`],{id:`project_assignment:proj_memo:${A}`,category:'project_assignment',project:'proj_memo',worker:A,settlement:'loc_hw',location:'loc_hw',starts:m,status:'有效',source:'memo'});
   assert.deepEqual(supply(),{fuel:unit},'工程未开工：自给不变');
   // 工程开工：state.projects 变了，记忆必须作废；整个工作日在工地，自给 0。
   d.set(['state','projects','proj_memo'],{id:'proj_memo',public:{},status:'施工中'});
   assert.deepEqual(trips(),[],'开工后整个工作日不在家：没有采集行程');
   assert.deepEqual(supply(),{},'开工后自给为 0');
   // 完工：恢复。
   d.set(['state','projects','proj_memo','status'],'完工');
   assert.deepEqual(supply(),{fuel:unit},'完工后恢复一趟一件柴');
  });
  assert.ok(recordIndexCheck.memoHits>hitsBefore,'记忆校验确有命中（否则测试空过）');
  assert.equal(recordIndexCheck.violations.length,before,'校验开关没有记下任何过期违例');
 }finally{setRecordIndexCheck(false);}
});
