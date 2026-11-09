import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';
import {advanceHouseholdMeals} from '../server-plugin/npc-life.mjs';
import {householdSubsistencePlan,prepareHouseholdSubsistence} from '../server-plugin/household-subsistence.mjs';
import {withScheduleCache,scheduleAt,nextNpcService} from '../server-plugin/npc-schedule.mjs';
import {householdWorkTime,npcSchedule,subsistenceScheduleAt,bookServiceAppointment} from '../server-plugin/npc-state.mjs';
import {personHousehold} from '../server-plugin/entity-view.mjs';
import {assertSiteHarvest} from '../server-plugin/sites.mjs';
import {assertTransitionInvariants} from '../server-plugin/transition.mjs';
import {applyPatches,withRecordIndex,setRecordIndexCheck} from '../server-plugin/storage.mjs';
import {advanceHook} from '../server-plugin/advance-hooks.mjs';
import {fuelEffectiveHeat,fuelReferenceHeat,householdUsage} from '../server-plugin/item-class.mjs';
import {itemGrams} from '../server-plugin/household-budget.mjs';
import craftingBalance from '../world/rules/tables/balance/crafting.json' with {type:'json'};
import {pinSatiety} from './helpers/satiety-pin.mjs';
const world=await loadWorld(),legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const A='npc_hw_luowei',B='npc_hw_duanyan',home='loc_hw_northwood';
function fixture({capacity=2000,separate=false,owned=false,location=home,settlement='loc_hw',food=0,fullClock=false}={}){
 const w=structuredClone(world);
 // 手算锚点按每份野食 15 饱腹（8 份 = 120）；手写基值要乘饱腹系数，这里用生产系数反解，使最终仍是 15。
 pinSatiety(w,'item_wild_food',15);
 w.rules.householdSubsistence.portionsPerKm2=capacity;
 if(!fullClock)w.rules.wildlife.habitats=w.rules.wildlife.habitats.filter(h=>h.location===location);
 // Arithmetic fixtures isolate one reachable commons, including plant-only
 // terrain: other published places remain in the catalog for I6 references.
 if(!fullClock)w.routes=w.routes.filter(edge=>[home,location,settlement].includes(edge.from)&&[home,location,settlement].includes(edge.to));
 w.locations.find(l=>l.id===location).areaKm2=1;
 if(owned)w.locations.find(l=>l.id===location).owner='player';
 w.households=separate?[{id:'forage-a',members:[A],settlement,homeLocation:location},{id:'forage-b',members:[B],settlement,homeLocation:location}]:[{id:'forage',members:[A,B],settlement,homeLocation:location}];
 // Work is assigned only at existing routine edges, not an invented08:00
 // boundary inside a single all-day fixture slot.
 for(const n of w.npcs){delete n.tier;n.schedule={default:[[0,480],[480,720],[720,780],[780,1020],[1020,1440]].map(([start,end])=>({start,end,location,activity:start===720?'午饭':start===0||start===1020?'睡眠':'日常起居',services:[]}))};}
 const e=new WorldEngine(w),doc=e.createCharacter(legacy,{},'k16-forage');
 doc.state.npcs=Object.fromEntries([A,B].map(id=>[id,{...doc.state.npcs[id],inventory:{...(id===A&&food?{item_wild_food:food}:{}),...(id===A?{item_wood:1000}:{})},coins:0,location,status:'正常'}]));
 delete doc.state.records['agriculture:loc_hw'];
 doc.state.settlements={...(fullClock?doc.state.settlements:{}),[settlement]:{...doc.state.settlements[settlement],granary:false,population:2,food:0}};
 doc.state.minute=0;doc.ledger=openLedger(e,doc);return {e,doc,d:e.primitiveDraft(doc)};
}
const meals=f=>Object.values(f.d.get('state','family','meals'));

test('native office hours without service flags cannot be replaced by a household forage trip',()=>{
 const e=new WorldEngine(structuredClone(world)),doc=e.createCharacter(legacy,{},'k16-office-duty'),d=e.primitiveDraft(doc),id='npc_bs_townhead';
 const routine=npcSchedule(e,d.get('state'),id,480,null,false);
 // The native mayor has two240-minute office shifts with empty services.
 // His60-minute outward commute cannot contain the203-minute food journey.
 assert.equal(routine.default.filter(s=>s.location==='bld_bs_office').reduce((n,s)=>n+s.end-s.start,0),480);
 assert.ok(routine.default.filter(s=>s.location==='bld_bs_office').every(s=>!s.services.length));
 prepareHouseholdSubsistence(d,e,0);
 const plan=d.get('state','records','subsistence-plan:loc_bs');
 assert.deepEqual(plan.households[id].foodTrips,[]);
 assert.equal(subsistenceScheduleAt(e,d.get('state'),id,600),null);
 assert.equal(scheduleAt(e,id,600,d.get('state')).location,'bld_bs_office');
});

test('a sparse incumbent keeps the post reception hours free of household subsistence work',()=>{
 const e=new WorldEngine(structuredClone(world)),id='npc_bs_townhead';delete e.byId.get(id).schedule;
 const doc=e.createCharacter(legacy,{},'k16-sparse-office'),d=e.primitiveDraft(doc);
 // With no authored routine the planner falls back to a home day; the
 // published reception windows are still the holder's, so no duty lands there.
 assert.ok(!npcSchedule(e,d.get('state'),id,600,null,false));
 prepareHouseholdSubsistence(d,e,0);
 const plan=d.get('state','records','subsistence-plan:loc_bs');
 assert.equal(subsistenceScheduleAt(e,d.get('state'),id,600),null);
 assert.deepEqual((plan.workers?.[id]?.duties??[]).filter(row=>row.start<1020&&row.end>480),[]);
});

test('an initial afternoon plan cannot fabricate an earlier morning departure',()=>{
 const f=fixture();delete f.e.rules.forestWater;f.d.set(['state','minute'],600);
 prepareHouseholdSubsistence(f.d,f.e,0);
 const row=f.d.get('state','records','subsistence-plan:loc_hw'),p=row.households.forage;
 // Eight local portions need80 minutes. The480 edge is past and nobody
 // abandons a running slot; the next authored work edge is780, so the real
 // basket runs780..860, not480..560 and not from the plan minute600.
 const duties=row.workers[p.foodTrips[0].worker].duties;
 assert.equal(duties[0].start,780);assert.equal(duties.at(-1).end,860);
 assert.ok(duties.every(d=>d.start>=600));
 assert.equal(subsistenceScheduleAt(f.e,f.d.get('state'),p.foodTrips[0].worker,600),null);
});

test('local catch-up only recruits journeys touching the pending global clock interval',()=>{
 const f=fixture();delete f.e.rules.forestWater;prepareHouseholdSubsistence(f.d,f.e,0);
 const state=f.d.get('state'),worker=Object.keys(state.records['subsistence-plan:loc_hw'].workers).find(id=>state.records['subsistence-plan:loc_hw'].workers[id].duties.length);
 const actors=advanceHook('householdSubsistenceActors');
 // The80-minute480..560 basket cannot move a body during0..5. It remains
 // part of the whole480..600 pending interval so the global tick cannot count twice.
 assert.deepEqual(actors(f.e,state,0,5),[]);
 assert.deepEqual(actors(f.e,state,480,500),[worker]);
 assert.deepEqual(actors(f.e,state,480,600),[worker]);
 assert.deepEqual(actors(f.e,state,600,620),[]);
});

test('signed service appointments reserve physical work even when the base routine has no services',()=>{
 const f=fixture();delete f.e.rules.forestWater;
 for(const actor of [A,B]){
  const sourceEvent=`world_event:appointment:${actor}`;
  f.d.set(['state','records',sourceEvent],{id:`appointment:${actor}`,category:'world_event',verb:'appointment_agreed',actor,minute:0,payload:{service:'teach'}});
  bookServiceAppointment(f.d,f.e,{id:`lesson:${actor}`,actor,sourceEvent,location:home,start:480,end:1020,services:['teach']});
 }
 // Two mouths need120 satiety; both480-minute work allowances are already
 // committed to the lesson, so harvesting remains zero rather than double booked.
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 assert.deepEqual(p.foodTrips,[]);assert.deepEqual(p.duties,[]);
 advanceHouseholdMeals(f.d,f.e,0);assert.equal(meals(f)[0].shortfall.satiety,120);
});

test('a market keeper reserves the signed customer windows as well as the travelling customer',()=>{
 const f=fixture();delete f.e.rules.forestWater;
 for(const keeper of [A,B])f.d.set(['state','records',`market:${keeper}`],{category:'market_trip',actor:'player',keeper,departAt:0,returnAt:1440,serviceWindows:[{start:480,end:720},{start:780,end:1020}]});
 // Both keepers have480 actual serving minutes. The household cannot also
 // credit the80-minute local forage basket to either of those same minutes.
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 assert.deepEqual(p.foodTrips,[]);assert.deepEqual(p.duties,[]);
});

test('repeated routine overlays retain exact boundaries and respond to live worker illness',()=>{
 const f=fixture();delete f.e.rules.forestWater;
 prepareHouseholdSubsistence(f.d,f.e,0);
 const workers=f.d.get('state','records','subsistence-plan:loc_hw','workers');
 const worker=Object.keys(workers).find(id=>workers[id].duties.length),duty=workers[worker].duties[0];
 // Two mouths need8 portions ×10 minutes: an80-minute basket inside the
 // authored480–720 shift. Reusing its projection must retain the560 return.
 assert.equal(workers[worker].duties.reduce((sum,row)=>sum+row.end-row.start,0),80);
 assert.deepEqual([duty.start,duty.end],[480,560]);
 const expected=npcSchedule(f.e,f.d.get('state'),worker,480);
 withScheduleCache(f.e,f.d,()=>{
  for(const minute of [0,480,duty.end,1020]){
   assert.deepEqual(npcSchedule(f.e,f.d.get('state'),worker,minute),expected);
   const active=subsistenceScheduleAt(f.e,f.d.get('state'),worker,minute);
   assert.equal(Boolean(active),duty.start<=minute&&minute<duty.end);
  }
  f.d.set(['state','npcs',worker,'status'],'患病');
  assert.equal(subsistenceScheduleAt(f.e,f.d.get('state'),worker,duty.start),null);
  assert.deepEqual(npcSchedule(f.e,f.d.get('state'),worker,480),f.e.byId.get(worker).schedule);
  f.d.set(['state','npcs',worker,'status'],'正常');
  assert.deepEqual(npcSchedule(f.e,f.d.get('state'),worker,480),expected);
 });
});

test('one settlement record freezes all household plans through depletion and save reload',()=>{
 const f=fixture({separate:true});delete f.e.rules.forestWater;
 prepareHouseholdSubsistence(f.d,f.e,0);
 const key='subsistence-plan:loc_hw',record=structuredClone(f.d.get('state','records',key));
 // Two single mouths need four15-satiety portions each; one settlement row,
 // two40-minute assignments, and zero physical withdrawals during planning.
 assert.equal(Object.values(f.d.get('state','records')).filter(r=>r.category==='subsistence_plan').length,1);
 assert.equal(Object.keys(record.households).length,2);
 assert.deepEqual(Object.values(record.households).map(p=>p.foodTrips[0].minutes),[40,40]);
 assert.equal(f.d.get('state','records',`forage:${home}`),undefined);
 f.d.set(['state','records',`forage:${home}`],{category:'household_forage',location:home,reserve:0,initial:2000,grown:0,harvested:2000,updatedDay:0});
 const patches=f.d.patches.length;prepareHouseholdSubsistence(f.d,f.e,0);
 assert.equal(f.d.patches.length,patches);assert.deepEqual(f.d.get('state','records',key),record);
 const loaded=f.e.primitiveDraft(JSON.parse(JSON.stringify(f.d.document)));
 advanceHouseholdMeals(f.d,f.e,0);advanceHouseholdMeals(loaded,f.e,0);
 assert.equal(meals(f).reduce((sum,m)=>sum+m.shortfall.satiety,0),120);
 assert.deepEqual(f.d.get('state','records',key),record);
 assert.deepEqual(f.d.get('state','family','meals'),loaded.get('state','family','meals'));
});

test('morning baskets reserve shared finite stock before later households choose a source',()=>{
 const f=fixture({capacity:4,separate:true});delete f.e.rules.forestWater;delete f.e.rules.weather;
 f.e.rules.wildlife.habitats.push({location:'loc_hw',types:['open']});
 f.e.world.locations.find(l=>l.id==='loc_hw').areaKm2=1;
 prepareHouseholdSubsistence(f.d,f.e,0);
 const plans=Object.values(f.d.get('state','records','subsistence-plan:loc_hw','households'));
 // Local four portions feed one mouth; the second basket uses the remote
 // four-portion habitat, rather than promising the same local four twice.
 assert.deepEqual(plans.map(p=>p.foodTrips[0].location).sort(),[home,'loc_hw'].sort());
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(meals(f).reduce((sum,m)=>sum+m.shortfall.satiety,0),0);
 assert.equal(Object.values(f.d.get('state','records')).filter(r=>r.category==='household_forage').reduce((sum,r)=>sum+r.harvested,0),8);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('an unassigned gravely ill dependent cancels the planned worker harvest at execution',()=>{
 const f=fixture();delete f.e.rules.forestWater;prepareHouseholdSubsistence(f.d,f.e,0);
 const key='subsistence-plan:loc_hw',plan=structuredClone(f.d.get('state','records',key));
 const worker=plan.households.forage.foodTrips[0].worker,patient=worker===A?B:A;
 f.d.set(['state','npcs',patient,'status'],'患病');
 f.d.set(['state','family','illnesses','late-grave'],{id:'late-grave',patient,status:'患病中',severity:'重',since:600,endsAt:2880});
 advanceHouseholdMeals(f.d,f.e,0);
 // No invented caretaker may release the only healthy adult. Zero harvested
 // portions leaves the two mouths'120 satiety unmet, with the plan unchanged.
 assert.equal(meals(f)[0].shortfall.satiety,120);
 assert.equal(f.d.get('state','records',`forage:${home}`),undefined);
 assert.deepEqual(f.d.get('state','records',key),plan);
});

test('replaying an already settled older meal day cannot rewind the current saved plan',()=>{
 const f=fixture();advanceHouseholdMeals(f.d,f.e,0);advanceHouseholdMeals(f.d,f.e,1);
 const before=JSON.stringify(f.d.document);
 // Both days have already consumed their eight portions. A replay of day0
 // must preserve day1's plan, stock, receipts and ledger byte for byte.
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(JSON.stringify(f.d.document),before);
 assert.equal(f.d.get('state','family','subsistence')[0],1);
});

test('a commons becoming privately owned after morning cannot be harvested under the saved assignment',()=>{
 const f=fixture();delete f.e.rules.forestWater;prepareHouseholdSubsistence(f.d,f.e,0);
 const key='subsistence-plan:loc_hw',plan=structuredClone(f.d.get('state','records',key));
 f.d.set(['state','buildings',home],{owner:'player'});
 advanceHouseholdMeals(f.d,f.e,0);
 // The planned eight portions confer no right to another owner's stock.
 // Zero withdrawal leaves120 satiety unmet, without rewriting the plan.
 assert.equal(meals(f)[0].shortfall.satiety,120);
 assert.equal(f.d.get('state','records',`forage:${home}`),undefined);
 assert.deepEqual(f.d.get('state','records',key),plan);
});

test('household grouping and allocation use the same morning rental validity',()=>{
 const f=fixture();delete f.e.rules.forestWater;
 f.d.set(['state','records','expired-before-work'],{id:'expired-before-work',category:'contract',kind:'asset_lease',use:'home',tenant:A,subject:home,settlement:'loc_hw',createdAt:-1,deadline:60,status:'有效'});
 assert.equal(personHousehold(f.e,f.d.get('state'),A).value.id,'expired-before-work');
 prepareHouseholdSubsistence(f.d,f.e,0);
 const row=f.d.get('state','records','subsistence-plan:loc_hw');
 // The rental expires at01:00, before the08:00 workday. Both mouths then
 // belong to their original household: one basket of8, not duplicate plans.
 assert.deepEqual(Object.keys(row.households),['forage']);
 assert.deepEqual(f.d.get('state','family','subsistence')[1][A],['loc_hw','forage']);
 assert.equal(row.households.forage.foodTrips[0].minutes,80);
});

test('private food removes only the covered daily deficit and produces no unnecessary forage journey',()=>{
 const full=fixture({food:8});delete full.e.rules.forestWater;
 //120 need -8*15 private nutrition =0: no duty and no forage receipt.
 const p=householdSubsistencePlan(full.e,full.d.get('state'),A,480);
 assert.equal(p.food,null);assert.deepEqual(p.duties,[]);
 advanceHouseholdMeals(full.d,full.e,0);
 assert.equal(meals(full)[0].shortfall.satiety,0);
 assert.equal(Object.values(full.d.get('state','records')).filter(r=>r.category==='household_forage').length,0);
 const partial=fixture({food:7});delete partial.e.rules.forestWater;
 //120 -7*15 =15: exactly one10-minute portion is needed.
 assert.equal(householdSubsistencePlan(partial.e,partial.d.get('state'),A,480).food.minutes,10);
 advanceHouseholdMeals(partial.d,partial.e,0);
 assert.equal(meals(partial)[0].sources.find(s=>s.kind==='forage').quantity,1);
 assert.equal(meals(partial)[0].shortfall.satiety,0);
 assert.deepEqual(auditLedger(partial.d.get('ledger')),[]);
});

test('exhausted commons are excluded even when yesterday named a different failed source',()=>{
 const f=fixture();delete f.e.rules.forestWater;delete f.e.rules.weather;
 f.e.rules.wildlife.habitats.push({location:'loc_hw',types:['open']});
 f.e.world.locations.find(l=>l.id==='loc_hw').areaKm2=1;
 f.d.set(['state','records',`forage:${home}`],{category:'household_forage',location:home,reserve:0,initial:2000,grown:0,harvested:2000,updatedDay:0});
 const e=new WorldEngine(f.e.world),p=householdSubsistencePlan(e,f.d.get('state'),A,480);
 //Local0 loses to reachable2000; eight portions still cost80+60 road minutes.
 assert.equal(p.food.location,'loc_hw');assert.equal(p.food.minutes,140);
 advanceHouseholdMeals(f.d,e,0);
 assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.equal(f.d.get('state','records',`forage:${home}`,'harvested'),2000);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('food source efficiency includes travel rather than chasing one more distant portion',()=>{
 const f=fixture();delete f.e.rules.forestWater;delete f.e.rules.weather;
 f.e.rules.wildlife.habitats.push({location:'loc_hw',types:['open']});
 f.e.world.locations.find(l=>l.id==='loc_hw').areaKm2=1;
 f.d.set(['state','records',`forage:${home}`],{category:'household_forage',location:home,reserve:1999,initial:2000,grown:0,harvested:1,updatedDay:0});
 const e=new WorldEngine(f.e.world),p=householdSubsistencePlan(e,f.d.get('state'),A,480);
 //Local score1999*8/80=199.9; distant score2000*8/(60+80)=114.28.
 //Both commons have food: the one extra distant portion cannot erase travel.
 assert.equal(p.food.location,home);assert.equal(p.food.minutes,80);
 assert.equal(p.food.travelMinutes,0);assert.equal(p.food.remaining,1999);
 assert.equal(f.d.get('state','records',`forage:${home}`,'reserve'),1999,'planning does not harvest');
});

test('same-cursor source choice follows reachable stock while unrelated forage receipts leave the plan unchanged',()=>{
 const f=fixture();delete f.e.rules.forestWater;delete f.e.rules.weather;
 f.e.rules.wildlife.habitats.push({location:'loc_hw',types:['open']});
 f.e.world.locations.find(l=>l.id==='loc_hw').areaKm2=1;
 const e=new WorldEngine(f.e.world);e.airDraft=f.d;
 withRecordIndex(()=>withScheduleCache(e,f.d,()=>{
  const first=householdSubsistencePlan(e,f.d.get('state'),A,480);
  assert.equal(first.food.location,home);assert.equal(first.food.minutes,80);
  f.d.set(['state','records','forage:unreachable'],{category:'household_forage',location:'unreachable',reserve:0,updatedDay:0});
  assert.deepEqual(householdSubsistencePlan(e,f.d.get('state'),A,480),first);
  f.d.set(['state','records',`forage:${home}`],{category:'household_forage',location:home,reserve:0,initial:2000,grown:0,harvested:2000,updatedDay:0});
  const changed=householdSubsistencePlan(e,f.d.get('state'),A,480);
  // Eight portions cost80 work minutes; the remaining commons adds60 road
  // minutes. A cached local choice cannot retain its now-exhausted stock.
  assert.equal(changed.food.location,'loc_hw');assert.equal(changed.food.minutes,140);
  const loaded=JSON.parse(JSON.stringify(f.d.document));
  assert.deepEqual(householdSubsistencePlan(e,loaded.state,A,480),changed);
  f.d.set(['state','records','forage:loc_hw'],{category:'household_forage',location:'loc_hw',reserve:0,initial:2000,grown:0,harvested:2000,updatedDay:0});
  assert.equal(householdSubsistencePlan(e,f.d.get('state'),A,480).food,null);
 }));
});

test('a new complete road differs from no facility even though both physical factors are one',()=>{
 const f=fixture({location:'loc_hw'});delete f.e.rules.forestWater;delete f.e.rules.weather;
 f.e.airDraft=f.d;
 const edge=f.e.world.routes.find(r=>[r.from,r.to].includes(home)&&[r.from,r.to].includes('loc_hw'));
 assert.ok(edge);
 // Catalogued route binding precedes its physical completion. Activating
 // this building changes only buildings, not the created partition.
 f.d.set(['state','created','bld_k16_road'],{id:'bld_k16_road',type:'bld',facilityType:'road',parent:'loc_hw',route:edge.id});
 withRecordIndex(()=>{
  const read=()=>householdSubsistencePlan(f.e,f.d.get('state'),A,480);
  const before=read();assert.equal(before.food.travelMinutes,60);
  f.d.set(['state','buildings','bld_k16_road'],{condition:100});
  // Two ordinary30-minute legs become ceil(30/1.25)*2=48. Both
  // factors are1, but only the built road receives route()'s speed bonus.
  const built=read();assert.equal(built.food.travelMinutes,48);assert.equal(built.food.minutes,128);
  f.d.set(['state','records','water-change'],{category:'physical_feature',state:{waterMl:1000}});
  assert.deepEqual(read(),built);
  f.d.set(['state','buildings','bld_k16_road','condition'],50);
  // The same road at factor0.5 gives ceil(30/(1.25*0.5))*2=96.
  assert.equal(read().food.travelMinutes,96);
 });
});

test('geographic reads in other save branches preserve an unchanged household plan and its index self-check',()=>{
 const f=fixture();delete f.e.rules.forestWater;f.e.airDraft=f.d;
 setRecordIndexCheck(true);
 try{withRecordIndex(()=>{
  const original=f.d.get('state'),house=personHousehold(f.e,original,A).value;
  const before=householdSubsistencePlan(f.e,original,A,480);
  // Populate a second home's distance entry without changing the original
  // save. Both branches still have the same real geography and finite stock.
  const other=structuredClone(original);
  other.family??={};other.family.households??={};
  other.family.households[house.id]={...house,homeLocation:'loc_hw'};
  householdSubsistencePlan(f.e,other,A,480);
  // This production flag selects another read context, not another river,
  // habitat or road. Returning to the first save must preserve its80 minutes
  // and must not compare the incidental contents of two cache containers.
  const third=structuredClone(other),store=third.settlements.loc_hw;
  store.foodPerDay=store.foodPerDay>0?0:1;
  householdSubsistencePlan(f.e,third,A,480);
  assert.equal(before.food.minutes,80);
  assert.deepEqual(householdSubsistencePlan(f.e,original,A,480),before);
 });}finally{setRecordIndexCheck(process.env.FIELDS_INDEX_CHECK==='1');}
});
test('a household without a granary gathers finite food, charges shared work and consumes from the reserve',()=>{
 const f=fixture(),p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 advanceHouseholdMeals(f.d,f.e,0);
 // Hand anchor: two people120 satiety /15 =8 portions; local8*10=80min.
 const meal=meals(f)[0],forage=meal.sources.find(s=>s.kind==='forage');
 assert.equal(forage.quantity,8);assert.equal(forage.minutes,80);assert.equal(forage.travelMinutes,0);
 assert.equal(meal.shortfall.satiety,0);assert.equal(f.d.get('state','records',`forage:${home}`,'reserve'),1992);
 assert.equal(f.d.get('ledger','flows','sink:consume|item_wild_food|meal'),8);
 assert.ok(householdWorkTime(f.e,f.d.get('state'),p.food.worker,480).reservedMinutes>=80);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('real-world forage reserves retain valid account destinations during later entity transitions',async()=>{
 // I6 uses the complete holding graph: the arithmetic fixtures above
 // deliberately remove unrelated NPCs/households and their animal owners.
 const e=new WorldEngine(world),doc=e.createCharacter(legacy,{},'k16-i6');
 const result=await e.reduce(doc,{tool:'world_time',args:{minutes:1440},eventId:'k16-i6'}),saved=applyPatches(doc,result.patches);
 const active=e.scoped(saved),d=active.primitiveDraft(saved);
 assert.ok(Object.values(saved.state.records).some(r=>r.category==='household_forage'));
 assert.doesNotThrow(()=>assertTransitionInvariants(d,active));assert.deepEqual(auditLedger(saved.ledger),[]);
});

test('a nonlocal food source charges both real road legs and stays unavailable beyond the journey limit',()=>{
 const f=fixture();delete f.e.rules.weather;
 f.e.world.households[0].homeLocation='loc_hw';
 for(const id of [A,B])f.d.set(['state','npcs',id,'location'],'loc_hw');
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Authored road:2km /4km/h =30min each way;8*10=80min harvesting.
 assert.equal(p.food.outboundMinutes,30);assert.equal(p.food.travelMinutes,60);assert.equal(p.food.minutes,140);
 assert.deepEqual(p.food.outboundEdges,['route_loc_hw_northwood']);assert.deepEqual(p.food.inboundEdges,['route_loc_hw_northwood']);
 f.e.rules.householdSubsistence.maximumJourneyMinutes=59;
 // A fresh read model is needed after changing author rules, not world time.
 const limited=new WorldEngine(f.e.world),plan=householdSubsistencePlan(limited,f.d.get('state'),A,480);
 assert.equal(plan.food,null);
});

test('real journey phases share existing work boundaries without hiding the worker location or charging idle time',()=>{
 const f=fixture();delete f.e.rules.weather;delete f.e.rules.forestWater;
 f.e.world.households[0].homeLocation='loc_hw';
 // The remaining original work is at home; otherwise resuming that work
 // would correctly require a further real commute to the habitat fixture.
 for(const n of f.e.world.npcs)for(const slot of n.schedule.default){slot.location='loc_hw';if([480,780].includes(slot.start))slot.services=['trade'];}
 for(const id of [A,B])f.d.set(['state','npcs',id,'location'],'loc_hw');
 prepareHouseholdSubsistence(f.d,f.e,0);
 const p=f.d.get('state','records','subsistence-plan:loc_hw','households','forage'),worker=p.foodTrips[0].worker,state=f.d.get('state');
 // 08:00 departure,30 road +80 harvest +30 road =10:20 return.
 // All three phases keep the existing12:00 work boundary. At09:00 the
 // worker is at the habitat; at10:00 on the return road, not at either end.
 const at=minute=>scheduleAt(f.e,worker,minute,state);
 assert.equal(at(480).travel.arrive,510);assert.equal(at(480).until,510);assert.equal(at(480).boundaryUntil,720);
 assert.equal(at(540).location,home);assert.equal(at(540).until,590);assert.equal(at(540).boundaryUntil,720);
 assert.equal(at(600).location,null);assert.equal(at(600).travel.arrive,620);assert.equal(at(600).until,620);assert.equal(at(600).boundaryUntil,720);
 assert.equal(at(630).location,'loc_hw');assert.equal(at(630).until,720);
 // Availability searches still see the real10:20 return; only the global
 // clock uses12:00, so a caller must not be told to wait until afternoon.
 assert.equal(nextNpcService(f.e,worker,480,'trade',state).minute,620);
 assert.equal(householdWorkTime(f.e,state,worker,480).reserved.filter(r=>r.subsistence).reduce((n,r)=>n+r.end-r.start,0),140);
});

test('a read between existing clock ticks catches up the real body and reload preserves the same journey result',async()=>{
 const f=fixture({fullClock:true});delete f.e.rules.weather;delete f.e.rules.forestWater;
 f.e.world.households[0].homeLocation='loc_hw';
 for(const n of f.e.world.npcs)for(const slot of n.schedule.default)slot.location='loc_hw';
 f.d.set(['state','location'],'loc_hw');for(const id of [A,B])f.d.set(['state','npcs',id,'location'],'loc_hw');
 const initial=f.d.document;
 const run=async(doc,minutes,id)=>applyPatches(doc,(await f.e.reduce(doc,{tool:'world_time',args:{minutes},eventId:id})).patches);
 const whole=await run(initial,801,'tail-whole');
 const plan=whole.state.records['subsistence-plan:loc_hw'],worker=plan.households.forage.foodTrips[0].worker;
 // The selected6km commons costs90+80+90=260 work minutes. Lunch adds
 //60 rest:08:00–13:20. At13:21, last global tick13:00 stays unchanged,
 // but the actual body has arrived; an expired travel pointer is not presence.
 assert.equal(plan.households.forage.foodTrips[0].minutes,260);
 assert.equal(whole.state.scheduler.lastSettled,780);
 assert.equal(whole.state.npcs[worker].location,'loc_hw');assert.equal(whole.state.npcs[worker].scheduleTravel,undefined);
 let parts=await run(JSON.parse(JSON.stringify(initial)),571,'tail-part-a');
 parts=await run(JSON.parse(JSON.stringify(parts)),230,'tail-part-b');
 assert.deepEqual(parts.state.npcs,whole.state.npcs);
 assert.deepEqual(parts.state.scheduler.subsistence,whole.state.scheduler.subsistence);
 assert.equal(parts.state.scheduler.lastSettled,whole.state.scheduler.lastSettled);
 assert.deepEqual(auditLedger(whole.ledger),[]);assert.deepEqual(auditLedger(parts.ledger),[]);
});

test('nocturnal work uses the existing night slots and keeps daytime sleep out of its labour allowance',()=>{
 const f=fixture();delete f.e.rules.forestWater;f.e.rules.householdSubsistence.forageMinutes=40;
 for(const n of f.e.world.npcs)n.schedule={default:[{start:0,end:300,location:home,activity:'夜间劳作',services:[]},{start:300,end:1080,location:home,activity:'睡眠',services:[]},{start:1080,end:1440,location:home,activity:'夜间劳作',services:[]}]};
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Eight40-minute portions use300+20 awake minutes. The780-minute sleep
 // between the two existing work slots is rest at the source, never harvest.
 assert.equal(p.food.minutes,320);
 assert.equal(p.duties.filter(r=>r.activity==='家户觅食').reduce((n,r)=>n+r.end-r.start,0),320);
 assert.equal(p.duties.filter(r=>r.activity==='野外歇息').reduce((n,r)=>n+r.end-r.start,0),780);
 assert.equal(p.duties[0].start,0);assert.ok(p.duties.every(r=>r.boundaryEnd===1440));
 advanceHouseholdMeals(f.d,f.e,0);assert.equal(meals(f)[0].shortfall.satiety,0);
});

test('a day off still permits household food work inside the existing rest slot',()=>{
 const f=fixture();delete f.e.rules.forestWater;
 const calendar=f.e.calendar(480);
 for(const n of f.e.world.npcs)n.schedule={default:n.schedule.default,restDays:[calendar.day],rest:[{start:0,end:1440,location:home,activity:'休息',services:[]}]};
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Eight portions still cost80 of480 labour minutes. The all-day rest
 // framework has only00:00/24:00 edges; it never means a household fasts.
 assert.equal(p.food.minutes,80);assert.equal(p.duties[0].start,0);assert.equal(p.duties[0].boundaryEnd,1440);
 advanceHouseholdMeals(f.d,f.e,0);assert.equal(meals(f)[0].shortfall.satiety,0);
});

test('an existing appointment breaks a physical work run rather than becoming a rest stop on the forage road',()=>{
 const f=fixture();delete f.e.rules.weather;delete f.e.rules.forestWater;
 f.e.world.households[0].homeLocation='loc_hw';
 for(const id of [A,B]){
  f.d.set(['state','npcs',id,'location'],'loc_hw');
  f.d.set(['state','obligations',`meeting:${id}`],{id:`meeting:${id}`,reservationVersion:1,status:'待履行',promisor:id,promisee:'player',start:600,deadline:660,location:'loc_hw'});
 }
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 //30+80+30=140 cannot fit before the10:00 appointment (120min).
 // Start at its existing11:00 release edge, retain the12:00–13:00 lunch
 // pause, then return14:20. No journey or harvest overlaps the meeting.
 assert.equal(p.food.minutes,140);assert.equal(p.duties[0].start,660);
 assert.ok(p.duties.every(r=>r.end<=600||r.start>=660));
 assert.equal(p.duties.find(r=>r.activity==='生计返程').end,860);
});

test('night appointments truncate baskets by real contiguous work capacity and charge every repeated road leg',()=>{
 const f=fixture();delete f.e.rules.weather;delete f.e.rules.forestWater;f.e.rules.householdSubsistence.forageMinutes=40;
 f.e.world.households[0].homeLocation='loc_hw';f.d.set(['state','npcs',B,'status'],'患病');
 for(const n of f.e.world.npcs)n.schedule={default:[{start:0,end:300,location:'loc_hw',activity:'夜间家务',services:[]},{start:300,end:1080,location:'loc_hw',activity:'睡眠',services:[]},{start:1080,end:1440,location:'loc_hw',activity:'夜间家务',services:[]}]};
 for(const [start,deadline]of [[60,120],[1140,1200]])f.d.set(['state','obligations',`night:${start}`],{id:`night:${start}`,reservationVersion:1,status:'待履行',promisor:A,promisee:'player',start,deadline,location:'loc_hw'});
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Longest appointment-free work run240; each basket carries floor((240
 // -60 road)/40)=4 portions. Two journeys cost2*(60+4*40)=440<=480,
 // supply8 portions, and neither borrows time from either meeting.
 assert.deepEqual(p.foodTrips.map(t=>t.minutes),[220,220]);
 assert.equal(p.foodTrips.reduce((n,t)=>n+t.travelMinutes,0),120);
 assert.ok(p.duties.every(r=>[[60,120],[1140,1200]].every(([lo,hi])=>r.end<=lo||r.start>=hi)));
 advanceHouseholdMeals(f.d,f.e,0);assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.equal(f.d.get('state','records',`forage:${home}`,'harvested'),8);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('a nocturnal trader retains service when an otherwise idle household adult can do the same subsistence work',()=>{
 const f=fixture();delete f.e.rules.weather;
 for(const n of f.e.world.npcs)n.schedule={default:[{start:0,end:300,location:home,activity:'夜间劳作',services:n.id===A?['trade']:[]},{start:300,end:1080,location:home,activity:'睡眠',services:[]},{start:1080,end:1440,location:home,activity:'夜间劳作',services:n.id===A?['trade']:[]}]};
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // The real2km water road costs30+30, plus15 collection; local food
 // costs8*10=80. B can perform all155 minutes. A's660 service minutes
 // are real even though all lie outside
 // the old08:00–17:00 cost window; no service needs to be displaced.
 assert.equal(p.water.worker,B);assert.equal(p.food.worker,B);
 assert.equal(p.water.minutes,75);assert.equal(p.food.minutes,80);
 assert.equal(p.water.minutes+p.food.minutes,155);
 assert.ok(p.duties.every(r=>r.worker===B));
});

test('water assignment preserves the idle adult long food run instead of forcing the larger task onto the night trader',()=>{
 const f=fixture();delete f.e.rules.weather;f.e.rules.householdSubsistence.forageMinutes=40;
 f.e.world.routes=f.e.world.routes.map(edge=>({...edge,lengthKm:10}));
 for(const n of f.e.world.npcs)n.schedule={default:[{start:0,end:300,location:home,activity:'夜间劳作',services:n.id===A?['trade']:[]},{start:300,end:1080,location:home,activity:'睡眠',services:[]},{start:1080,end:1440,location:home,activity:'夜间劳作',services:n.id===A?['trade']:[]}]};
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Water315 + food320 exceeds one480-minute allowance. Assign the short
 // water job to A and the320-minute food job to idle B; giving B water
 // first would waste B's remaining165 and send A on the larger food job.
 assert.equal(p.water.minutes,315);assert.equal(p.food.minutes,320);
 assert.equal(p.water.worker,A);assert.equal(p.food.worker,B);
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(meals(f)[0].shortfall.satiety,0);assert.equal(meals(f)[0].shortfall.hydration,0);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('two households share one stock and cannot create food when it runs out',()=>{
 const f=fixture({capacity:5,separate:true});advanceHouseholdMeals(f.d,f.e,0);
 // Hand anchor:5 portions*15=75 against120; total shortage45, not two stocks.
 assert.equal(meals(f).reduce((n,m)=>n+m.shortfall.satiety,0),45);
 assert.equal(f.d.get('state','records',`forage:${home}`,'reserve'),0);
 assert.equal(f.d.get('ledger','flows','sink:consume|item_wild_food|meal'),5);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('private habitat is not a free commons and an entirely occupied worker cannot forage',()=>{
 const privatePlace=fixture({owned:true});advanceHouseholdMeals(privatePlace.d,privatePlace.e,0);
 assert.equal(meals(privatePlace)[0].shortfall.satiety,120);
 const busy=fixture();
 for(const id of [A,B])busy.d.set(['state','obligations',`work:${id}`],{id:`work:${id}`,reservationVersion:1,status:'待履行',promisor:id,promisee:'player',start:0,deadline:1440,location:home});
 advanceHouseholdMeals(busy.d,busy.e,0);
 // Hand anchor: zero uncommitted work minutes means zero harvested portions.
 assert.equal(meals(busy)[0].shortfall.satiety,120);
});

test('care begun after a schedule read releases cached subsistence work',()=>{
 const f=fixture();prepareHouseholdSubsistence(f.d,f.e,0);
 assert.ok(householdWorkTime(f.e,f.d.get('state'),A,480).reservedMinutes>0||householdWorkTime(f.e,f.d.get('state'),B,480).reservedMinutes>0);
 for(const id of [A,B])f.d.set(['state','npcs',id,'caring'],{patient:'player',location:home});
 advanceHouseholdMeals(f.d,f.e,0);
 // Both real workers are caring; yesterday's/read-ahead allocation cannot feed them.
 assert.equal(meals(f)[0].shortfall.satiety,120);
 assert.ok(!meals(f)[0].sources?.some(s=>s.kind==='forage'));
});
test('regrowth follows seasons, and saved receipts never harvest the same day twice',()=>{
 const f=fixture();advanceHouseholdMeals(f.d,f.e,0);
 const loaded=f.e.primitiveDraft(JSON.parse(JSON.stringify(f.d.document))),once=JSON.stringify(loaded.document);
 advanceHouseholdMeals(loaded,f.e,0);assert.equal(JSON.stringify(loaded.document),once);
 advanceHouseholdMeals(loaded,f.e,1);
 // Hand anchor: daily growth100 is capped by8 missing stock; 2000-8=1992.
 assert.equal(loaded.get('state','records',`forage:${home}`,'grown'),8);
 assert.equal(loaded.get('state','records',`forage:${home}`,'harvested'),16);
 assert.equal(loaded.get('state','records',`forage:${home}`,'reserve'),1992);
 assert.deepEqual(auditLedger(loaded.get('ledger')),[]);
});
test('five days regrow two spring portions but less than one winter portion from the same eight-portion habitat',()=>{
 const spring=fixture({capacity:8}),winter=fixture({capacity:8});
 advanceHouseholdMeals(spring.d,spring.e,0);advanceHouseholdMeals(winter.d,winter.e,270);
 advanceHouseholdMeals(spring.d,spring.e,5);advanceHouseholdMeals(winter.d,winter.e,275);
 // Hand anchor:8*5%*5=2; winter recovery1/4 gives1/2, retained rationally.
 assert.equal(spring.d.get('state','records',`forage:${home}`,'grown'),2);
 assert.equal(winter.d.get('state','records',`forage:${home}`,'grown'),0);
 assert.equal(meals(spring)[0].shortfall.satiety,90);assert.equal(meals(winter)[0].shortfall.satiety,120);
 assert.deepEqual(auditLedger(spring.d.get('ledger')),[]);assert.deepEqual(auditLedger(winter.d.get('ledger')),[]);
});
test('one foraging journey can rest at the source over lunch without charging a second journey or counting rest as harvest',()=>{
 const f=fixture();f.e.rules.householdSubsistence.forageMinutes=40;
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Hand anchor:8 portions*40=320 work minutes, plus60 on-site rest.
 // A240-minute morning limit must not turn this feasible day into hunger.
 assert.equal(p.food.minutes,320);assert.equal(p.foodTrips.length,1);assert.equal(p.food.windows.length,2);
 assert.equal(p.duties.filter(r=>r.activity==='家户觅食').reduce((n,r)=>n+r.end-r.start,0),320);
 assert.equal(p.duties.filter(r=>r.activity==='野外歇息').reduce((n,r)=>n+r.end-r.start,0),60);
 advanceHouseholdMeals(f.d,f.e,0);
 assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.equal(f.d.get('ledger','flows','sink:consume|item_wild_food|meal'),8);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('an outdoor habitat fringe does not open or withdraw resources behind the site entrance mechanism',()=>{
 const location='loc_wild_yp_north',f=fixture({location,settlement:'loc_bs_yupo'}),place=f.e.byId.get(location);
 assert.ok(place.site.entryMechanisms.length);
 const before=structuredClone(place.site.resources);
 advanceHouseholdMeals(f.d,f.e,0);
 // Hand anchor:8 wild portions come from the separate finite habitat stock;
 // all four authored branch units remain behind the unchanged fallen elm.
 assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.equal(f.d.get('state','records',`forage:${location}`,'harvested'),8);
 assert.deepEqual(place.site.resources,before);
 assert.throws(()=>assertSiteHarvest(f.d,f.e,place,{}),/机关尚未解除/);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});
test('registered roster relatives count as mouths and available labour without daily NPC materialization',()=>{
 const f=fixture(),relative=world.npcs.find(n=>n.tier==='roster'&&n.age>=world.rules.npcLife.adultAge).id;
 f.e.world.households[0].members.push(relative);f.e.byId.get(relative).tier='roster';
 for(const id of [A,B])f.d.set(['state','npcs',id,'status'],'患病');
 assert.equal(f.d.get('state','npcs',relative),undefined);
 advanceHouseholdMeals(f.d,f.e,0);
 // Hand anchor: three registered mouths need180, hence12*15 wild portions.
 // The healthy adult relative supplies those120 work minutes statistically.
 const meal=meals(f)[0],source=meal.sources.find(s=>s.kind==='forage');
 assert.equal(meal.needs.satiety,180);assert.equal(source.worker,relative);assert.equal(source.quantity,12);
 assert.equal(meal.shortfall.satiety,0);assert.equal(f.d.get('state','npcs',relative),undefined);
 assert.ok(householdWorkTime(f.e,f.d.get('state'),relative,480).reservedMinutes>=120);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});


test('a fully roster household receives real meals without creating any NPC state',()=>{
 const f=fixture();f.d.set(['state','npcs'],{});
 advanceHouseholdMeals(f.d,f.e,0);
 // Two mouths are120 satiety even when neither has an individual state row.
 assert.equal(meals(f).length,1);assert.equal(meals(f)[0].needs.satiety,120);
 assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.deepEqual(f.d.get('state','npcs'),{});
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('time advancement and source projection do not unfold an unvisited county',()=>{
 const f=fixture(),location='loc_far_tongji';
 // Time advancement validates the full clock table against its habitats.
 f.e.rules.wildlife.habitats=structuredClone(world.rules.wildlife.habitats);
 f.e.world.routes=structuredClone(world.routes);
 f.e.world.households[0].homeLocation=location;f.e.world.households[0].settlement=location;
 for(const id of [A,B])f.d.set(['state','npcs',id,'location'],location);
 const remote=structuredClone(f.d.get('state','remote')??{}),created=structuredClone(f.d.get('state','created')??{});
 const plan=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 assert.equal(plan.sourceStatus,'unknown');
 f.e.advance(f.d,1,'unvisited-source');
 advanceHouseholdMeals(f.d,f.e,0);
 assert.deepEqual(f.d.get('state','remote')??{},remote);
 assert.deepEqual(f.d.get('state','created')??{},created);
 assert.equal(meals(f)[0].sources.find(s=>s.kind==='unknown').reason,'unexpanded-stock');
 // No represented source or pantry: the ordinary two-mouth need stays120.
 assert.equal(meals(f)[0].shortfall.satiety,120);
});


test('public natural plant habitat supplies finite food without a registered animal range',()=>{
 const f=fixture();f.e.rules.wildlife.habitats=[];
 advanceHouseholdMeals(f.d,f.e,0);
 // The same forest area has8 consumed plant portions and1992 remaining,
 // independently of whether an animal-population projection was registered.
 assert.equal(meals(f)[0].shortfall.satiety,0);
 assert.equal(f.d.get('state','records',`forage:${home}`,'reserve'),1992);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

test('persisted household plans release work on care and reloading has the same result',()=>{
 const f=fixture();prepareHouseholdSubsistence(f.d,f.e,0);
 withRecordIndex(()=>{
  assert.ok(householdWorkTime(f.e,f.d.get('state'),A,480).reservedMinutes||householdWorkTime(f.e,f.d.get('state'),B,480).reservedMinutes);
  for(const id of [A,B])f.d.set(['state','npcs',id,'caring'],{patient:'player',location:home});
  const loaded=f.e.primitiveDraft(JSON.parse(JSON.stringify(f.d.document)));
  advanceHouseholdMeals(f.d,f.e,0);advanceHouseholdMeals(loaded,f.e,0);
  assert.equal(meals(f)[0].shortfall.satiety,120);
  assert.deepEqual(f.d.get('state','family','meals'),loaded.get('state','family','meals'));
 });
});


test('lazy plant regrowth follows an actual calendar season change, not a fixed ninety-day quarter',()=>{
 const f=fixture({capacity:8});f.e.rules.wildlife.seasonRecovery=[1,1,1,0.1];
 f.e.calendar=minute=>({season:minute<2*1440?0:3});
 advanceHouseholdMeals(f.d,f.e,0);advanceHouseholdMeals(f.d,f.e,5);
 //8 portions*5%*(2 spring days+3 winter days*0.1)=0.92;
 // integer accrual leaves zero new portions, rather than two spring portions.
 assert.equal(f.d.get('state','records',`forage:${home}`,'grown'),0);
 assert.equal(meals(f)[0].shortfall.satiety,120);
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});


test('illness cancels execution without rewriting the household morning assignment',()=>{
 const f=fixture();f.e.airDraft=f.d;
 // Isolate food-worker reassignment. The next case verifies concurrent
 // water/food sharing, where the other member already owns a water duty.
 delete f.e.rules.forestWater;
 withRecordIndex(()=>withScheduleCache(f.e,f.d,()=>{
  prepareHouseholdSubsistence(f.d,f.e,0);
  const frozen=JSON.stringify(f.d.get('state','records','subsistence-plan:loc_hw'));
  const plan=householdSubsistencePlan(f.e,f.d.get('state'),A,480),worker=plan.food.worker,other=worker===A?B:A;
  assert.equal(scheduleAt(f.e,worker,480,f.d.get('state')).worker,worker);
  assert.equal(scheduleAt(f.e,other,480,f.d.get('state')).worker,undefined);
  f.d.set(['state','npcs',worker,'status'],'患病');
  // R5: zero replacement journeys today; tomorrow assigns the healthy adult.
  assert.equal(scheduleAt(f.e,other,480,f.d.get('state')).worker,undefined);
  assert.equal(scheduleAt(f.e,worker,480,f.d.get('state')).worker,undefined);
  assert.equal(JSON.stringify(f.d.get('state','records','subsistence-plan:loc_hw')),frozen);
  advanceHouseholdMeals(f.d,f.e,0);assert.equal(meals(f)[0].shortfall.satiety,120);
  f.d.set(['state','minute'],1440);prepareHouseholdSubsistence(f.d,f.e,1);
  assert.equal(scheduleAt(f.e,other,1920,f.d.get('state')).worker,other);
 }));
});


test('equal-opportunity adults share water and forage work instead of losing one whole service day',()=>{
 const f=fixture(),place=f.e.world.locations.find(l=>l.id===home);
 const sample=world.locations.flatMap(l=>l.features??[]).find(feature=>feature.kind==='water');
 place.features=[{...structuredClone(sample),id:'feature_k16_shared_source',access:'public'}];
 // This case measures concurrent chores, so explicitly supply potable water.
 // Source-safety failures are exercised separately in water-source tests.
 Object.assign(place.features[0].state,{waterMl:place.features[0].state.capacityMl,pathogenRisk:0,toxinUg:0,saltMg:0,frozenUntil:0});
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Two mouths need8*15=120 satiety: local forage80min plus water15min.
 // Equal opportunity cost keeps95 total minutes, shared between two adults.
 assert.equal(p.water.minutes,15);assert.equal(p.food.minutes,80);
 assert.notEqual(p.water.worker,p.food.worker);
 assert.equal(p.water.minutes+p.food.minutes,95);
});

test('a household with no fuel fetches it from a public forest in its shared work time and the books stay balanced',()=>{
 const f=fixture();f.d.set(['state','npcs',A,'inventory'],{});
 const p=householdSubsistencePlan(f.e,f.d.get('state'),A,480);
 // Fuel is an upkeep class like food: a bounded, finite, public source journey charged to the same workers.
 const trip=p.upkeepTrips.find(t=>t.cls==='fuel');
 assert.ok(trip&&trip.kind==='forest'&&trip.units>0);
 assert.ok(p.duties.some(r=>r.activity==='家户采集'));
 const before=f.e.quantity(f.d,trip.worker,trip.item);
 advanceHouseholdMeals(f.d,f.e,0);
 const held=[A,B].reduce((n,id)=>n+f.e.quantity(f.d,id,trip.item),0);
 assert.ok(held>before,'fetched fuel reaches the household members, net of the day\'s burning');
 assert.ok(meals(f)[0].sources.some(s=>s.kind==='upkeep'&&s.cls==='fuel'&&s.quantity>0));
 assert.deepEqual(auditLedger(f.d.get('ledger')),[]);
});

// D12 卡 B：自采燃料的每件顶多少基准克与持有抵扣，和 npc-life 消耗同口径（有效热值折算）；去掉属性表时与现行一致。
test('self-gathered fuel and held-fuel offset follow effective heat; without material props they equal the current weight rule',()=>{
 const REF=craftingBalance.params.find(p=>p.id==='household.fuelReferenceClass').value;
 const plan=(table,wood,held)=>{
  const f=fixture();f.d.set(['state','npcs',A,'inventory'],held?{item_wood:held}:{});
  f.e.world.materialProps=table;
  const it=f.e.byId.get('item_wood');delete it.props;if(wood)it.props=wood;
  return {f,p:householdSubsistencePlan(f.e,f.d.get('state'),A,480)};
 };
 const table={dimensions:{},precedence:[],classes:{[REF]:{heatValue:18,moisture:0.2,basis:'夹具：参照类'}}};
 const damp={moisture:0.5,heatValue:18,basis:'夹具：含水更多的木料'};
 const L=craftingBalance.params.find(p=>p.id==='household.waterLatentHeat').value;
 const eff=(h,m)=>h*(1-m)-L*m,ref=eff(18,0.2);
 const legacy=plan({dimensions:{},precedence:[],classes:{}},null,0),known=plan(table,damp,0);
 const tripOf=r=>r.p.upkeepTrips.find(t=>t.cls==='fuel');
 const grams=itemGrams(legacy.f.e,'item_wood');
 assert.equal(tripOf(legacy).unitGrams,grams,'无属性：每件按重量克');
 assert.equal(fuelReferenceHeat(known.f.e),ref);
 assert.equal(fuelEffectiveHeat(known.f.e,'item_wood'),eff(18,0.5));
 assert.equal(tripOf(known).unitGrams,grams*eff(18,0.5)/ref,'有属性：每件按有效热值折算');
 // 持有抵扣：缺口 = 日用度 × 交易周期 −（持有件数 × 每件顶的基准克）；有无缺口（是否要出门采柴）按公式。
 const cycle=legacy.f.e.rules.economy?.tradeCycleDays??1;
 const need=householdUsage(known.f.e,0,[A,B]).find(u=>u.cls==='fuel').gramsPerDay*cycle;
 for(const [label,args,unit] of [['legacy',[{dimensions:{},precedence:[],classes:{}},null],grams],['known',[table,damp],grams*eff(18,0.5)/ref]])
  for(const held of [1,Math.ceil(need/unit)+1]){
   const r=plan(...args,held);
   assert.equal(Boolean(tripOf(r)),Math.ceil(need-held*unit)>0,`${label} held=${held}`);
  }
});
