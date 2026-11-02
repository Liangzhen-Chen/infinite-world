import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceHouseholdMeals} from '../server-plugin/npc-life.mjs';
import {householdWorkTime,npcSchedule} from '../server-plugin/npc-state.mjs';
import {advanceWaterCycle,waterBasins,basinState} from '../server-plugin/water-cycle.mjs';
import {householdSubsistencePlan,prepareHouseholdSubsistence} from '../server-plugin/household-subsistence.mjs';
import {unfoldRemoteAt,remoteEngine} from '../server-plugin/remote-generation.mjs';
import {withRecordIndex} from '../server-plugin/storage.mjs';

const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',DAY=1440;
export function fixture({source=true,stock=20,granary=true}={}){
 const w=structuredClone(world);
 w.households=[{id:'water-house',members:[A,B],homeLocation:'loc_hw',settlement:'loc_hw'}];
 // TI1b: this two-person river edition excludes the formal Baishi estate
 // together with its households; all finite-source assertions stay intact.
 w.townIncome.settlements=[];
 // Preserve existing work/housework edges for the aligned real journeys.
 for(const n of w.npcs){delete n.tier;n.schedule={default:[[0,480],[480,720],[720,780],[780,1020],[1020,1440]].map(([start,end])=>({start,end,location:'loc_hw',activity:start===720?'午饭':start===0||start===1020?'睡眠':'日常起居',services:[]}))};}
 if(!source)delete w.rules.forestWater;
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'k16-mechanism');
 doc.state.minute=0;doc.state.npcs=Object.fromEntries([A,B].map(id=>[id,{...doc.state.npcs[id],location:'loc_hw',inventory:{item_water:id===A?stock:0},coins:0,status:'正常'}]));
 delete doc.state.records['agriculture:loc_hw'];
 doc.state.settlements={loc_hw:{...doc.state.settlements.loc_hw,population:2,granary,food:1000,foodPerDay:0,woodPerDay:0}};
 doc.ledger=openLedger(e,doc);return {e,doc,d:e.primitiveDraft(doc)};
}
const receipt=f=>f.d.get('state','family','meals','water-house');

test('a public dock derives a finite basin from its published use without rewriting reviewed locations',()=>{
 const e=new WorldEngine(structuredClone(world)),dock=e.byId.get('loc_bs_hebu'),before=structuredClone(dock);
 assert.equal(dock.purpose,'码头与船户');assert.equal(dock.features,undefined);
 const source=waterBasins(e,{}).find(b=>b.location===dock.id);
 // The existing water table supplies500000000ml capacity at an80% initial
 // share. A derived dock basin has the same400000000ml, not an infinite tap.
 assert.equal(source.id,`basin:${dock.id}`);assert.equal(source.capacity,500000000);
 assert.equal(basinState(e,{},source).waterMl,400000000);
 assert.deepEqual(dock,before);
});

test('a road closed after morning cancels the near-water execution without replacing the plan',()=>{
 const f=fixture({stock:0});delete f.e.rules.weather;f.e.airDraft=f.d;
 f.e.world.households[0].homeLocation='loc_hw_northwood';
 const edge={...world.routes.find(r=>r.id==='route_loc_hw_northwood'),lengthKm:0.31};f.e.world.routes=[edge];
 prepareHouseholdSubsistence(f.d,f.e,0);
 const key='subsistence-plan:loc_hw',plan=structuredClone(f.d.get('state','records',key));
 assert.equal(plan.households['water-house'].water.travelMinutes,10);
 f.d.set(['state','records','late-water-road-closure'],{category:'war_disruption',since:0,until:1440,routes:[edge.id]});
 advanceHouseholdMeals(f.d,f.e,0,new Map([['loc_hw',{mouths:2,eaten:2}]]));
 // Two mouths still need144 hydration; the10-minute round trip is now
 // impossible, and there are zero stored portions or unplanned substitutes.
 assert.equal(receipt(f).shortfall.hydration,144);
 assert.ok(!receipt(f).sources?.some(s=>s.kind==='water'));
 assert.deepEqual(f.d.get('state','records',key),plan);
});

test('pollution after morning is checked at withdrawal while the saved water assignment stays fixed',()=>{
 const f=fixture({stock:0});prepareHouseholdSubsistence(f.d,f.e,0);
 const key='subsistence-plan:loc_hw',plan=structuredClone(f.d.get('state','records',key));
 const source=plan.households['water-house'].water,basin=waterBasins(f.e,f.d.get('state')).find(b=>b.id===source.id);
 const water={...basinState(f.e,f.d.get('state'),basin),pathogenRisk:99};
 if(basin.feature)f.d.set(['state','records',`physical_feature:${basin.id}`],{category:'physical_feature',id:basin.id,location:basin.location,state:water});
 else f.d.set(['state','records',`water-cycle:${basin.id}`],{category:'water_cycle',location:basin.location,water});
 advanceHouseholdMeals(f.d,f.e,0,new Map([['loc_hw',{mouths:2,eaten:2}]]));
 // The whole144 hydration requirement remains unmet; choosing this source
 // in the morning never entitles a household to unsafe or imaginary water.
 assert.equal(receipt(f).shortfall.hydration,144);
 assert.equal(receipt(f).sourceNutrition?.hydration??0,0);
 assert.deepEqual(f.d.get('state','records',key),plan);
});
test('river water feeds two mouths, retains recipe water and shares the already withdrawn cohort exactly once',()=>{
 const f=fixture(),before=f.e.quantity(f.d,A,'item_water');
 advanceWaterCycle(f.d,f.e,0);
 const basin=waterBasins(f.e,f.d.get('state')).find(b=>b.location==='loc_hw'),volume=basinState(f.e,f.d.get('state'),basin).waterMl;
 advanceHouseholdMeals(f.d,f.e,0,new Map([['loc_hw',{mouths:2,eaten:2}]]));
 // Hand anchor: two bodies drain2*72=144 hydration; river cohort2*2000=4000mL.
 assert.equal(receipt(f).needs.hydration,144);assert.equal(receipt(f).sourceNutrition.hydration,144);assert.equal(receipt(f).shortfall.hydration,0);
 assert.equal(receipt(f).sources.find(s=>s.kind==='water').millilitres,4000);
 assert.equal(f.e.quantity(f.d,A,'item_water'),before);assert.equal(basinState(f.e,f.d.get('state'),basin).waterMl,volume);
 const once=JSON.stringify(f.d.document);advanceHouseholdMeals(f.d,f.e,0);assert.equal(JSON.stringify(f.d.document),once);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('unavailable sources consume stored water, then record real thirst',()=>{
 const f=fixture({source:false,stock:6});
 // Hand anchor: 144/day, six stored portions*25=150; next day has none.
 advanceHouseholdMeals(f.d,f.e,0);assert.equal(receipt(f).shortfall.hydration,0);assert.equal(f.e.quantity(f.d,A,'item_water'),0);
 advanceHouseholdMeals(f.d,f.e,1);assert.equal(receipt(f).shortfall.hydration,144);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a stale population cohort does not force a real extra resident to drink recipe reserves',()=>{
 const f=fixture();f.d.set(['state','settlements','loc_hw','population'],1);
 advanceWaterCycle(f.d,f.e,0);
 const basin=waterBasins(f.e,f.d.get('state')).find(b=>b.location==='loc_hw'),before=basinState(f.e,f.d.get('state'),basin).waterMl;
 advanceHouseholdMeals(f.d,f.e,0,new Map([['loc_hw',{mouths:2,eaten:2}]]));
 // Two mouths need4000mL: reuse the one-person2000mL cohort, withdraw2000mL.
 assert.equal(receipt(f).sourceNutrition.hydration,144);assert.equal(receipt(f).shortfall.hydration,0);
 assert.equal(receipt(f).sources.find(s=>s.kind==='water').millilitres,4000);
 assert.equal(before-basinState(f.e,f.d.get('state'),basin).waterMl,2000);
 assert.equal(f.e.quantity(f.d,A,'item_water'),20);assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('drought, frozen and polluted water cannot supply hydration',()=>{
 for(const failure of ['dry','frozen','polluted']){
  const f=fixture({stock:0}),basin=waterBasins(f.e,f.d.get('state')).find(b=>b.location==='loc_hw'),w=structuredClone(basinState(f.e,f.d.get('state'),basin));
  if(failure==='dry')w.waterMl=0;
  if(failure==='frozen')w.frozenUntil=2*DAY;
  if(failure==='polluted')w.pathogenRisk=f.e.rules.forestWater.water.diseaseThreshold;
  f.d.set(['state','records',`water-cycle:${basin.id}`],{category:'water_cycle',location:basin.location,water:w,day:0,initial:w.waterMl,rain:0,inflow:0,outflow:0,consumed:0,evaporated:0,overflow:0,externalDelta:0,drinking:{},farms:{}});
  advanceHouseholdMeals(f.d,f.e,0);
  // Hand anchor: zero usable river supply +zero reserve leaves all144 unmet.
  assert.equal(receipt(f).shortfall.hydration,144,failure);
 }
});
test('near-home water reserves work time without a separate NPC schedule node',()=>{
 const f=fixture(),p=householdSubsistencePlan(f.e,f.d.get('state'),A,480),worker=p.water.worker;
 prepareHouseholdSubsistence(f.d,f.e,0);
 const time=householdWorkTime(f.e,f.d.get('state'),worker,480),schedule=npcSchedule(f.e,f.d.get('state'),worker,480);
 // Hand anchor: local source needs no road trip, fifteen minutes gathering;
 // 480 available work minutes minus15 leaves465, rather than two full shifts.
 assert.equal(p.water.travelMinutes,0);assert.equal(p.water.minutes,15);
 assert.equal(time.reservedMinutes,15);assert.equal(time.workMinutes,465);
 // R3 design: the same15 minutes remain in the work ledger, while local
 // chores add no travel or public-service boundary to the daily routine.
 assert.equal(schedule.default.filter(s=>s.activity==='家户取水').reduce((n,s)=>n+s.end-s.start,0),0);
});
test('nearby fractional road lengths debit integer round-trip minutes without schedule slivers',()=>{
 const f=fixture();delete f.e.rules.weather;
 f.e.world.households[0].homeLocation='loc_hw_northwood';
 f.e.world.routes=[{...world.routes.find(r=>r.id==='route_loc_hw_northwood'),lengthKm:0.31}];
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480),worker=p.water.worker;
 //0.31km /4km/h =4.65min: ceil each leg gives10, plus15 =25.
 assert.equal(p.water.travelMinutes,10);assert.equal(p.water.minutes,25);
 prepareHouseholdSubsistence(f.d,f.e,0);
 assert.equal(householdWorkTime(f.e,f.d.get('state'),worker,480).reservedMinutes,25);
 assert.deepEqual(p.duties,[]);
 assert.ok(p.chores.every(row=>Number.isSafeInteger(row.start)&&Number.isSafeInteger(row.end)));
});

test('near-water chores cannot cross a road closed by the existing war rules',()=>{
 const f=fixture();delete f.e.rules.weather;f.e.airDraft=f.d;
 f.e.world.households[0].homeLocation='loc_hw_northwood';
 const edge={...world.routes.find(r=>r.id==='route_loc_hw_northwood'),lengthKm:0.31};f.e.world.routes=[edge];
 withRecordIndex(()=>{
  //The open0.31km road needs10 round-trip minutes, as above.
  assert.equal(householdSubsistencePlan(f.e,f.d.get('state'),A,480).water.travelMinutes,10);
  f.d.set(['state','records','blocked-water-road'],{category:'war_disruption',since:0,until:1440,routes:[edge.id]});
  //A closure removes the only accessible source; no invented crossing.
  assert.equal(householdSubsistencePlan(f.e,f.d.get('state'),A,480).water,null);
 });
});

test('generated public settlements feed their registered resident workers without inventing extra visitor portions',()=>{
 const f=fixture();unfoldRemoteAt(f.d,f.e,'loc_far_tongji');
 const e=remoteEngine(f.e,f.d.document,w=>new WorldEngine(w));
 const residents=Object.entries(f.d.get('state','npcs')).filter(([,n])=>n.materialized?.county&&f.d.get('state','settlements',n.materialized.settlement)?.granary!==false);
 assert.ok(residents.length);
 e.advance(f.d,DAY,'remote-source');
 // Hand anchor: each materialized resident is one of the settlement's
 // already counted mouths; a standard public portion supplies60, not zero.
 for(const [id]of residents){const meal=Object.values(f.d.get('state','family','meals')).find(m=>m.owner===id);assert.equal(meal.publicNutrition.satiety,60);assert.equal(meal.shortfall.satiety,0);}
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});


test('reachable water may use the existing full workday instead of an arbitrary four-hour round-trip cutoff',()=>{
 const f=fixture();delete f.e.rules.weather;
 f.e.world.households[0].homeLocation='loc_hw_northwood';
 f.e.world.routes=[{...world.routes.find(r=>r.id==='route_loc_hw_northwood'),lengthKm:10}];
 for(const id of [A,B])f.d.set(['state','npcs',id,'location'],'loc_hw_northwood');
 const plan=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 //10km /4km/h =150min each way, plus15min:315 of480 work minutes.
 assert.equal(plan.water.travelMinutes,300);assert.equal(plan.water.minutes,315);
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(receipt(f).shortfall.hydration,0);
 assert.equal(f.e.quantity(f.d,A,'item_water'),20);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a newly operating public producer exposes its real derived basin without changing settlement IDs',()=>{
 const f=fixture({granary:false});f.e.rules.agriculture.settlements=[];f.e.world.routes=[];
 assert.equal(householdSubsistencePlan(f.e,f.d.get('state'),A,480).water,null);
 f.d.set(['state','settlements','loc_hw','granary'],true);
 f.d.set(['state','settlements','loc_hw','foodPerDay'],2);
 const plan=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 assert.equal(plan.water.id,'basin:loc_hw');assert.equal(plan.water.minutes,15);
});
