// WATER-1A：口渴先找水。本户当日取水（journey('water')）能取到水时，当日可取量从预算的水分缺口里扣除，只剩取不到的部分才去买。
// 手算锚点沿用 s5-law-water-source：一户两口，每人每日水分 3×24=72，两口 144；住处就在水源地点，往返 0 分钟，走 near 分支。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger} from '../server-plugin/ledger.mjs';
import {waterBasins,basinState,waterResourceFactor} from '../server-plugin/water-cycle.mjs';
import {householdResources,registerHouseholdFreeWater} from '../server-plugin/household-budget.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {PatchCursor} from '../server-plugin/storage.mjs';
import {stateReader} from '../server-plugin/valuation.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan';
function fixture({near,bread=0}={}){
 const w=structuredClone(world);
 w.households=[{id:'water-house',members:[A,B],homeLocation:'loc_hw',settlement:'loc_hw'}];
 for(const n of w.npcs){delete n.tier;n.schedule={default:[[0,480],[480,720],[720,780],[780,1020],[1020,1440]].map(([start,end])=>({start,end,location:'loc_hw',activity:start===720?'午饭':start===0||start===1020?'睡眠':'日常起居',services:[]}))};}
 if(near!==undefined)w.rules.householdSubsistence.nearWaterRoundTripMinutes=near;
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'free-water');
 doc.state.minute=0;doc.state.npcs=Object.fromEntries([A,B].map(id=>[id,{...doc.state.npcs[id],location:'loc_hw',inventory:id===A&&bread?{item_bread:bread}:{},coins:0,status:'正常'}]));
 delete doc.state.records['agriculture:loc_hw'];
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:2,granary:false,food:0,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);return {e,doc,d:e.primitiveDraft(doc)};
}
const basinOf=f=>waterBasins(f.e,f.d.get('state')).find(b=>b.location==='loc_hw');
const waterRecord=(f,patch)=>{const basin=basinOf(f),w={...structuredClone(basinState(f.e,f.d.get('state'),basin)),...patch};
 return [`water-cycle:${basin.id}`,{category:'water_cycle',location:basin.location,water:w,day:0,initial:w.waterMl,rain:0,inflow:0,outflow:0,consumed:0,evaporated:0,overflow:0,externalDelta:0,drinking:{},farms:{}}];};
const FAILURES={dry:()=>({waterMl:0}),frozen:()=>({frozenUntil:2*1440}),polluted:f=>({pathogenRisk:f.e.rules.forestWater.water.diseaseThreshold})};
const read=(d,f,options={})=>householdResources(d,f.e,A,{days:1,marketSubstitution:false,...options});
const cursorDraft=f=>{const cursor=new PatchCursor(f.d.document);return {cursor,d:{cursor,get document(){return cursor.expose(cursor.root);},get:(...p)=>cursor.expose(p.reduce((v,k)=>v?.[k],cursor.root)),peek:(...p)=>p.reduce((v,k)=>v?.[k],cursor.root)}};};

test('免费水注册：引擎加载后注册函数存在；未注册时预算读取直接抛错，不回退为 0',()=>{
 const f=fixture();
 assert.equal(typeof registerHouseholdFreeWater.fn,'function');
 const saved=registerHouseholdFreeWater.fn;
 try{
  registerHouseholdFreeWater.fn=undefined;
  assert.throws(()=>read(f.d,f),/household free water not registered/);
 }finally{registerHouseholdFreeWater.fn=saved;}
 assert.equal(read(f.d,f).market.freeWater.hydration,144);
});

test('有可达可用水源：当日水分缺口被免费水扣光，其余缺口不受影响；多日预算只扣当日份',()=>{
 const f=fixture();
 const one=read(f.d,f);
 assert.equal(one.market.freeWater.source,basinOf(f).id);
 assert.equal(one.market.freeWater.hydration,144);
 assert.equal(one.procurementShortfall.hydration,0);
 // 满饱腹（有面包）、只缺水分且水源可达：任何带水分的物品都不该被买（wants 读的就是这个缺口）。
 const fed=fixture({bread:400}),r=read(fed.d,fed);
 assert.equal(r.procurementShortfall.satiety,0);
 for(const item of fed.e.world.items.filter(i=>i.nutrition?.hydration>0))assert.equal(Math.ceil(r.procurementShortfall.hydration/item.nutrition.hydration),0,item.id);
 // 两天预算：第 1 天由免费水覆盖，第 2 天的 144 仍是缺口（不外推）。
 assert.equal(read(f.d,f,{days:2}).procurementShortfall.hydration,144);
});

test('水量只够部分缺口：免费水等于可取量折成的水分，不超过缺口',()=>{
 const f=fixture(),basin=basinOf(f),rules=f.e.rules.forestWater.water;
 const ml=1000,waterMl=Math.ceil(ml*waterResourceFactor(f.e,f.d.get('state'),basin.location));
 const [key,row]=waterRecord(f,{waterMl});f.d.set(['state','records',key],row);
 const available=Math.floor(waterMl/waterResourceFactor(f.e,f.d.get('state'),basin.location));
 const r=read(f.d,f);
 assert.ok(available>0&&available<2*rules.drinkingMlPerPerson);
 assert.equal(r.market.freeWater.hydration,available*72/rules.drinkingMlPerPerson);
 assert.equal(r.procurementShortfall.hydration,144-available*72/rules.drinkingMlPerPerson);
});

for(const failure of Object.keys(FAILURES)){
 test(`水体变为${failure}：同日再读免费水立即归零（游标读与 d.memo 回退读各验一次）`,()=>{
  // 游标路径：先读热缓存，再经游标写入水体，同一游标上再读。
  const f=fixture(),{cursor,d}=cursorDraft(f);
  assert.equal(read(d,f).market.freeWater.hydration,144);
  const [key,row]=waterRecord(f,FAILURES[failure](f));
  cursor.apply({op:'set',path:['state','records',key],value:row});
  const after=read(d,f);
  assert.equal(after.market.freeWater.hydration,0,failure);assert.equal(after.procurementShortfall.hydration,144,failure);
  // d.memo 回退路径（只读快照读取器，按 state 对象身份分键）：旧 state 读到 144，新 state 读到 0。
  const g=fixture(),state=g.d.get('state'),before=read(stateReader(state),g);
  assert.equal(before.market.freeWater.hydration,144);
  const [k2,r2]=waterRecord(g,FAILURES[failure](g));
  const next={...state,records:{...state.records,[k2]:r2}};
  assert.equal(read(stateReader(next),g).market.freeWater.hydration,0,failure);
  assert.equal(read(stateReader(state),g).market.freeWater.hydration,144);
 });
}

test('主观读：只凭住处往返分钟（near 分支）知道有水可取，不读水质与水量；近处水源即使被污染也先扣，远处不扣',()=>{
 const f=fixture();
 const polluted=waterRecord(f,FAILURES.polluted(f));f.d.set(['state','records',polluted[0]],polluted[1]);
 const seen=read(f.d,f,{view:subjectiveView(f.e,f.d.document,A)});
 assert.equal(seen.market.freeWater.source,basinOf(f).id);
 assert.equal(seen.market.freeWater.hydration,144);assert.equal(seen.procurementShortfall.hydration,0);
 // 同一状态的客观读看得到水被污染：免费水为 0（主观与客观的差额由午夜实取记入缺口，不在读时预知）。
 assert.equal(read(f.d,f).market.freeWater.hydration,0);
 // 远处水源：把邻近阈值降到不可达，主观读不扣，只买。
 const far=fixture({near:-1});
 assert.equal(read(far.d,far,{view:subjectiveView(far.e,far.d.document,A)}).market.freeWater.hydration,0);
});
