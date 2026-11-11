// B18.5 fixture + RX assertions. Each row carries its independent arithmetic anchor.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {officeScene} from './helpers/office-actions.mjs';
import {initializeVocation} from '../server-plugin/npc-growth.mjs';
import {contractIllness} from '../server-plugin/npc-life.mjs';
import {bookMedicine,advanceMedicine,medicineAction} from '../server-plugin/medicine.mjs';
import {medicineRows,MEDICAL_SKILL} from '../server-plugin/medicine-state.mjs';
import {educationAction,advanceEducation} from '../server-plugin/education.mjs';
import {educationCourses} from '../server-plugin/education-state.mjs';
import {damageFacility} from '../server-plugin/facilities.mjs';
import {transferItems,wearItem,trackSingleItem} from '../server-plugin/items.mjs';
import {orderServices,serviceTickets} from '../server-plugin/service-queue.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const questions=JSON.parse(await fs.readFile('tests/fixtures/w8e4-capacity-set.json','utf8'));
const intents=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const DAY=1440,DOCTOR='npc_hw_taozhi',HELPER='npc_hw_fanrong',TEACHER='npc_hw_luqing',SMITH='npc_hw_duanyan';
const disease=world.rules.hazardClock.diseases.find(r=>r.id==='disease_river_flux');
const PEOPLE=['npc_hw_linsui','npc_hw_shendu','npc_hw_zhengshuisheng'];
function scene(location,people,mutate=()=>{}){
 const w=structuredClone(world);
 for(const id of people){const n=w.npcs.find(n=>n.id===id);n.schedule={default:[{start:0,end:1440,location,activity:'在岗',services:['trade','law']}]};}
 mutate(w);
 const e=new WorldEngine(w),doc=e.initialFromLegacy({state:seed.state,memories:seed.memories},'w8e4-capacity');
 Object.assign(doc.state,{location,minute:400});doc.state.player.coins=2000;
 for(const id of people)doc.state.npcs[id]={...doc.state.npcs[id],location,status:'正常',activity:'在岗',coins:100};
 const d=e.primitiveDraft(doc);e.airDraft=d;return {w,e,d};
}
function base(w,service,value){
 const health=structuredClone(world.balance.health);
 health.params.find(p=>p.id==='service.capacity').value[service]={base:value,perTier:0};
 w.balance={...world.balance,health};
}
async function run(f,tool,args,eventId){
 const out=await f.e.reduce(f.d.document,{tool,args,eventId});
 assert.notEqual(out.result?.receipt?.status,'rejected',JSON.stringify(out.result));
 f.d.document=applyPatches(f.d.document,out.patches);
 return out.result?.receipt?.legacy??out.result;
}
function source(v,capacity,extra={}){
 assert.ok(v,'capacity source must be visible');assert.equal(v.capacity,capacity);
 assert.equal(v.sources.table,'service.capacity');assert.equal(v.sources.slot,'service:capacity');
 const s=v.sources;
 assert.equal(s.base,s.seats??s.rule.base+s.rule.perTier*s.tier);
 assert.equal(s.raw,Math.floor(s.base*(1+s.helpers*s.helperShare)*s.facilityFactor));
 assert.equal(v.capacity,Math.min(50,v.sources.raw));
 for(const [key,value] of Object.entries(extra))assert.equal(v.sources[key],value,JSON.stringify(v));
}
async function medical(q){
 const cfg=q.setup,CLINIC='bld_hw_herbs';
 const f=scene(CLINIC,[DOCTOR,HELPER,...PEOPLE],w=>{
  base(w,'medicine',cfg.base);w.npcs.find(n=>n.id===DOCTOR).proficiencies[MEDICAL_SKILL]=600;
  for(const id of [DOCTOR,HELPER])w.npcs.find(n=>n.id===id).schedule.default[0].activity='坐诊配药';
  if(!cfg.helpers)w.npcs.find(n=>n.id===HELPER).schedule={default:[{start:0,end:1440,location:CLINIC,activity:'休息'}]};
  if(cfg.helperOff)w.npcs.find(n=>n.id===HELPER).schedule.restDays=[1];
  if(cfg.absent)w.npcs.find(n=>n.id===DOCTOR).schedule={default:[{start:0,end:1440,location:CLINIC,activity:'休息'}]};
 });
 f.d.set(['state','buildings',CLINIC],{...f.d.get('state','buildings',CLINIC),owner:'player'});
 if(cfg.helpers)medicineAction.call(f.e,f.d,{operation:'medicine_hire',member:HELPER,proposedFee:40,consent:true},'hire-helper');
 if(cfg.factor===.5)damageFacility(f.d,f.e,CLINIC,45,{sourceEvent:q.id});
 // Real U3 infection creates symptoms and illness history, never seeded queue rows.
 for(const [i,id] of PEOPLE.entries())assert.ok(contractIllness(f.d,f.e,id,400,{severity:cfg.urgent&&i===2?'重':'轻',days:10,disease}));
 const visit=(i,event)=>bookMedicine(f.d,f.e,{patient:PEOPLE[i],clinic:CLINIC,consent:true},event);
 if(cfg.absent){assert.throws(()=>visit(0,'z-first'),/排期/);assert.equal(medicineRows(f.d.get('state')).length,0);return;}
 // Reverse lexical IDs at one minute must retain actual arrival order.
 const receipts=[visit(0,'z-first'),visit(1,'y-second'),visit(2,'a-last')];
 if(cfg.helpers&&!cfg.urgent&&!cfg.helperOff)assert.deepEqual(receipts[0].assistants,[HELPER]);
 if(cfg.urgent)advanceMedicine(f.d,f.e,{before:400,after:401});
 const rows=medicineRows(f.d.get('state')).sort((a,b)=>a.start-b.start);
 assert.deepEqual(rows.map(r=>'ABC'[PEOPLE.indexOf(r.patient)]),q.expected.order,q.anchor);
 assert.deepEqual(rows.map(r=>r.start),q.expected.starts,q.anchor);
 // Rebooked receipts must preserve the original arrival order.
 assert.deepEqual(rows.map(r=>r.position),q.expected.positions,q.anchor);
 for(const [i,r] of receipts.entries())source(r.capacitySource,q.expected.capacities?.[i]??q.expected.capacity,{helpers:q.expected.helpers?.[i]??(cfg.helpers&&!r.houseCall?1:0),facilityFactor:cfg.factor});
}
async function school(q){
 const SCHOOL='bld_hw_school',mode=q.setup.mode;
 const SCHOLAR='npc_bs_077_2'; // Existing authored literacy600; no test-created teacher.
 const f=scene(SCHOOL,[TEACHER,SCHOLAR,HELPER,...PEOPLE],w=>{w.locations.find(p=>p.id===SCHOOL).capacity=mode==='twofree'?2:q.setup.seats;});
 f.d.set(['state','skills','skill_literacy'],{proficiency:450});
 if(mode==='damage')damageFacility(f.d,f.e,SCHOOL,45,{sourceEvent:q.id});
 const open=(students,id,extra={})=>educationAction.call(f.e,f.d,{operation:'school_open',source:TEACHER,entity:'skill_literacy',kind:'skill',students,start:1200,minutes:120,days:10,consent:true,...extra},id);
 const labels=ids=>ids.map(id=>id===HELPER?'D':'ABC'[PEOPLE.indexOf(id)]);
 if(mode==='crosscourse'){
  const blocking=open([PEOPLE[0]],'occupier');
  const first=open([PEOPLE[1]],'z-first',{source:'player'}),second=open([PEOPLE[2]],'a-second',{source:SCHOLAR});
  source(first.capacitySource,1);source(second.capacitySource,1);
  assert.deepEqual([first.waitlist[0].position,second.waitlist[0].position],q.expected.positions,q.anchor);
  educationAction.call(f.e,f.d,{operation:'school_close',course:blocking.course},'close-blocker');
  // W8-D admission settles at a real opening/dismissal bell, not an unrelated tick.
  await run(f,'world_time',{minutes:1200-f.d.get('state','minute')},'promote-by-clock');
  assert.deepEqual(labels(f.d.get('state','records',first.course).students),q.expected.admitted,q.anchor);
  assert.deepEqual(f.d.get('state','records',second.course).students,[],'The one released seat cannot be used twice');
  assert.equal(f.d.get('state','records',second.waitlist[0].ticket).status,'排队');
  return;
 }
 if(['close','twofree','finish'].includes(mode)){
  // Both the blocking class and the waiting class are opened by real actions.
  const blocking=open(PEOPLE.slice(0,mode==='twofree'?2:1),'occupier',mode==='finish'?{days:1}:{});
  const waiting=PEOPLE.slice(mode==='twofree'?2:1);
  // Use another existing resident to check two admissions in one settlement.
  const students=mode==='twofree'?[PEOPLE[2],HELPER]:waiting;
  const queued=educationAction.call(f.e,f.d,{operation:'school_open',source:'player',entity:'skill_literacy',kind:'skill',students,start:1200,minutes:120,days:10,consent:true},'waiters');
  source(queued.capacitySource,mode==='twofree'?2:1);
  assert.deepEqual(labels(queued.waitlist.map(t=>t.student)),q.expected.waiting,q.anchor);
  assert.deepEqual(queued.waitlist.map(t=>t.position),q.expected.positions,q.anchor);
  if(mode==='finish'){
   assert.equal(queued.waitlist[0].eta,1840,'400 + 1 day is the blocking course end');
   await run(f,'world_time',{minutes:DAY},'finish-blocker');
   assert.ok(!educationCourses(f.e,f.d.get('state')).some(c=>c.id===blocking.course));
  }else{
   educationAction.call(f.e,f.d,{operation:'school_close',course:blocking.course},'close-blocker');
   advanceEducation(f.d,f.e,{before:400,after:401});
  }
  const admitted=f.d.get('state','records',queued.course).students;
  assert.deepEqual(labels(admitted),q.expected.admitted,q.anchor);
  assert.deepEqual(labels(queued.waitlist.filter(t=>f.d.get('state','records',t.ticket).status==='排队').map(t=>t.student)),q.expected.remaining,q.anchor);
  if(mode!=='twofree')assert.equal(f.d.get('state','records',queued.waitlist[1].ticket).status,'排队');
  else for(const t of queued.waitlist)assert.equal(f.d.get('state','records',t.ticket).status,'已受理');
  return;
 }
 const r=open(PEOPLE,'z-course'),cap=q.expected.capacity;
 source(r.capacitySource,cap);assert.deepEqual(labels(r.students),q.expected.students,q.anchor);
 assert.equal(r.capacitySource.sources.facility.id,SCHOOL);
 assert.equal(r.capacitySource.sources.facility.factor,mode==='damage'?.5:1);
 assert.deepEqual(labels(r.waitlist.map(t=>t.student)),q.expected.waiting,q.anchor);
 assert.deepEqual(r.waitlist.map(t=>t.position),q.expected.positions,q.anchor);
 for(const t of r.waitlist)assert.equal(t.eta,null,'No known seat release means no promised time');
}
async function legal(q){
 const cfg=q.setup,LAWYER=TEACHER,GUARD='npc_hw_gucen',HANDLER='npc_bs_035_1';
 const f=scene('bld_hw_qingdeng',[LAWYER,GUARD,...PEOPLE],w=>base(w,'law',cfg.base));
 const setup=intents.find(r=>r.id==='A3V2-055').setup;
 f.d.document=applyIntentSetup(f.e,f.d.document,{minute:600,history:setup.history.filter(r=>r.verb==='qualified'),abilitiesByActor:setup.abilitiesByActor}).document;
 initializeVocation(f.d,f.e,setup.vocations[0],{origin:'initial',eventId:'qualified-initial'});
 const cases=[];
 // Theft, confession and the independent officer decision create every case.
 for(let i=0;i<cfg.base+2;i++){
  f.d.document=officeScene(f.e,f.d.document,{location:'bld_hw_qingdeng',minute:f.d.get('state','minute'),present:[GUARD,PEOPLE[0]]});
  const crime=await run(f,'world_crime',{operation:'steal',target:PEOPLE[0],coins:1},`crime-${cfg.base+2-i}`);
  const confession=await run(f,'world_law',{operation:'confess',case:crime.case,authority:GUARD},`confess-${i}`);
  f.d.document=officeScene(f.e,f.d.document,{location:'bld_bs_watch',minute:f.d.get('state','minute'),present:[HANDLER]});
  const accepted=await run(f,'world_act',{action:'law:request_decision',slots:{request:confession.request,authority:HANDLER}},`file-${i}`);
  assert.equal(accepted.accepted,true);cases.push(accepted.case);
 }
 f.d.document=officeScene(f.e,f.d.document,{location:'bld_bs_office',minute:f.d.get('state','minute'),present:[LAWYER]});
 const hire=(id,event)=>run(f,'world_law',{operation:'hire_advocate',case:id,authority:LAWYER},event);
 if(cfg.mode==='off'){
  contractIllness(f.d,f.e,LAWYER,f.d.get('state','minute'),{severity:'轻',days:10,disease});
  await assert.rejects(hire(cases[0],'off'),/服务|患病|接待/);assert.equal(serviceTickets(f.d.get('state'),'law',LAWYER).length,0);return;
 }
 for(let i=0;i<cfg.base;i++)source((await hire(cases[i],`serve-${i}`)).capacitySource,cfg.base);
 const a=await hire(cases[cfg.base],'z-first'),b=await hire(cases[cfg.base+1],'a-last');
 source(a.capacitySource,cfg.base);source(b.capacitySource,cfg.base);
 assert.deepEqual([a.position,b.position],q.expected.positions);
 const day=Math.floor(f.d.get('state','minute')/DAY);
 assert.equal(a.eta,(day+1)*DAY+480);assert.equal(b.eta,(day+1+Math.floor(1/cfg.base))*DAY+480);
 const tickets=orderServices(serviceTickets(f.d.get('state'),'law',LAWYER).filter(t=>t.status==='排队'));
 assert.deepEqual(tickets.map(t=>'BC'[cases.slice(cfg.base).indexOf(t.subject)]),q.expected.order,q.anchor);
 if(cfg.mode==='retry'){const at=f.d.get('state','records',a.ticket).createdAt;assert.equal((await hire(cases[cfg.base],'retry')).position,1);assert.equal(f.d.get('state','records',a.ticket).createdAt,at);}
 if(cfg.mode==='nextday'){
  await run(f,'world_time',{minutes:(day+1)*DAY+660-f.d.get('state','minute')},'next-day');
  // The advocate commutes from the existing home. Wait for the actual trip,
  // rather than placing him back at the counter or editing a queue record.
  const trip=f.d.get('state','npcs',LAWYER).scheduleTravel;
  assert.equal(trip.arrive,(day+1)*DAY+926,'480 opening + 446 minute authored route');
  await run(f,'world_time',{minutes:trip.arrive-f.d.get('state','minute')},'arrive-at-desk');
  assert.equal(f.d.get('state','npcs',LAWYER).location,f.d.get('state','location'));
  const later=await hire(cases[cfg.base+1],'later-arrives-first');assert.equal(later.queued,true);assert.equal(later.position,2);
  const served=await hire(cases[cfg.base],'serve-next');assert.ok(served.representation);
  assert.equal(f.d.get('state','records',a.ticket).status,'已受理');assert.equal((await hire(cases[cfg.base+1],'still-wait')).position,1);
 }
}
async function craft(q){
 const cfg=q.setup,FORGE='bld_hw_forge',SWORD='item_steel_arming_sword',HOLDER=PEOPLE[0],count=cfg.base+2;
 const f=scene(FORGE,[SMITH,HOLDER],w=>{base(w,'craft',cfg.base);w.npcs.find(n=>n.id===SMITH).proficiencies.skill_life_5_core=500;});
 // Initially intact units are transferred, worn, stored and collected using real inventory operations.
 f.d.set(['state','inventory'],{});f.d.set(['state','npcs',SMITH,'inventory',SWORD],{quantity:count,durability:300,maxDurability:300,quality:'铁'});
 const units=[];
 for(let i=0;i<count;i++){
  transferItems(f.d,f.e,SMITH,'player',SWORD,1);
  const id=trackSingleItem(f.d,f.e,'player',SWORD,`unit-${String(count-i).padStart(2,'0')}`);units.push(id);
  const unit=f.d.get('state','itemInstances',id),target=cfg.mode==='urgent'&&i===count-1?60:150;
  wearItem(f.d,f.e,'player',SWORD,unit.durability-target);
  assert.equal(f.d.get('state','itemInstances',id).durability,target);
  transferItems(f.d,f.e,'player',HOLDER,SWORD,1,[id]);
 }
 transferItems(f.d,f.e,HOLDER,'player',SWORD,count,units);
 if(cfg.mode!=='urgent')units.sort().reverse();
 if(cfg.mode==='damage')damageFacility(f.d,f.e,FORGE,45,{sourceEvent:q.id});
 const repair=(i,event,extra={})=>run(f,'world_craft',{operation:'repair',item:SWORD,instance:units[i],maker:SMITH,...extra},event);
 if(cfg.mode==='off'){
  contractIllness(f.d,f.e,SMITH,400,{severity:'轻',days:10,disease});await assert.rejects(repair(0,'off'),/服务|患病|接待/);assert.equal(serviceTickets(f.d.get('state'),'craft',SMITH).length,0);return;
 }
 const cap=q.expected.capacity;
 for(let i=0;i<cap;i++){const r=await repair(i,`serve-${i}`);assert.equal(r.success,true);source(r.quote.capacitySource,cap);}
 const before=f.d.document;
 const a=await repair(cap,'z-first'),b=await repair(cap+1,'a-last');
 source(a.capacitySource,cap);source(b.capacitySource,cap);
 assert.deepEqual([a.position,b.position],q.expected.initialPositions,q.anchor);
 const again=await repair(cap,'repeat');assert.equal(again.position,q.expected.refreshedPosition,q.anchor);
 const waiting=orderServices(serviceTickets(f.d.get('state'),'craft',SMITH).filter(t=>t.status==='排队'));
 assert.deepEqual(waiting.map(t=>'AB'[units.slice(cap).indexOf(t.subject)]),q.expected.order,q.anchor);
 assert.equal(f.d.get('state','minute'),before.state.minute);assert.equal(f.d.get('state','player','coins'),before.state.player.coins);
 const day=Math.floor(before.state.minute/DAY);assert.equal(b.eta,(day+1+(cfg.mode==='urgent'?0:Math.floor(1/cap)))*DAY+480);
 if(cfg.mode==='nextday'){
  await run(f,'world_time',{minutes:(day+1)*DAY+480-f.d.get('state','minute')},'next-day');
  const later=await repair(cap+1,'later-arrives-first');assert.equal(later.queued,true);assert.equal(later.position,2);
  const r=await repair(cap,'complete-next-day');assert.equal(r.success,true);assert.equal(f.d.get('state','records',a.ticket).status,'已受理');
 }
}
const runners={medicine:medical,law:legal,school,craft};
for(const q of questions)test(`${q.id} ${q.domain} ${q.intent}`,()=>runners[q.domain](q));
