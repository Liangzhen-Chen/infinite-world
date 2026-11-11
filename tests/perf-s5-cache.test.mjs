import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,withRecordIndex,setRecordIndexCheck,stateMemo,recordsMemo,recordIndexCheck} from '../server-plugin/storage.mjs';
import {currentEmployment} from '../server-plugin/employment-state.mjs';
import {snapshotContractTerms} from '../server-plugin/contract-state.mjs';
import {obligationRows} from '../server-plugin/obligation-state.mjs';
import {personRoutine,personConstraints} from '../server-plugin/entity-view.mjs';
import {sameScheduleInputs,educationCourses,knowledgeProficiency} from '../server-plugin/education-state.mjs';
import {facilityRouteStates} from '../server-plugin/facility-state.mjs';
import {sameNpcScheduleInputs} from '../server-plugin/npc-schedule.mjs';
import {npcHousehold,householdMembers} from '../server-plugin/npc-state.mjs';
import {personHousehold} from '../server-plugin/entity-view.mjs';

const document=()=>({state:{minute:0,records:{job:snapshotContractTerms({id:'job',category:'contract',kind:'workshop',worker:'a',createdAt:0,starts:0,deadline:100,wage:10,status:'有效',amendments:[{minute:20,wage:20}]})},obligations:{}}});

test('household membership memo follows entry, departure, created households and lease expiry',()=>{
 const engine={world:{households:[{id:'h',members:['a','b'],homeLocation:'home',settlement:'town'}]},byId:new Map()};
 const cursor=new PatchCursor({state:{minute:0,records:{},created:{},family:{households:{},meals:{}}}});
 const set=(path,value)=>cursor.apply({op:'set',path:['state',...path],value});
 withRecordIndex(()=>{
  assert.deepEqual(householdMembers(engine,cursor.root.state,'h'),['a','b']);
  householdMembers(engine,cursor.root.state,'h').reverse();
  set(['family','meals','h'],{shortfall:{satiety:0}});
  assert.deepEqual(npcHousehold(engine,cursor.root.state,'a').members,['a','b']);
  set(['family','households','h'],{left:['b'],members:['c']});
  assert.deepEqual(personHousehold(engine,cursor.root.state,'a').value.members,['a','c']);
  assert.equal(npcHousehold(engine,cursor.root.state,'b'),null);
  set(['created','d'],{id:'d',generated:'population',householdId:'new',settlement:'town',home:{location:'new-home'}});
  assert.deepEqual(npcHousehold(engine,cursor.root.state,'d').members,['d']);
  set(['records','rent'],{id:'rent',kind:'asset_lease',tenant:'a',status:'有效',createdAt:0,deadline:10,use:'home',settlement:'town',subject:'rented'});
  assert.equal(personHousehold(engine,cursor.root.state,'a').value.homeLocation,'rented');
  set(['minute'],10);
  assert.equal(personHousehold(engine,cursor.root.state,'a').value.homeLocation,'home');
 });
});

test('course household memo follows changed membership and ignores unrelated bags',async()=>{
 const {fixture}=await import('./fixtures/education.mjs');
 const f=fixture(),cursor=new PatchCursor(f.doc),set=(path,value)=>cursor.apply({op:'set',path:['state',...path],value});
 withRecordIndex(()=>{
  const read=()=>educationCourses(f.e,cursor.expose(cursor.root.state));
  const initial=read();assert.ok(initial.some(c=>c.school&&c.teacher===f.teacher));
  const unrelated=Object.keys(cursor.root.state.npcs).find(id=>id!==f.teacher&&(npcHousehold(f.e,cursor.root.state,id)?.members??[id]).every(member=>knowledgeProficiency(f.e,cursor.root.state,member,'skill_literacy')<=100));
  assert.ok(unrelated);
  // A non-teaching household consuming one bread unit changes zero classes.
  set(['npcs',unrelated,'inventory'],{item_water:1});assert.equal(read(),initial);
  const house=npcHousehold(f.e,cursor.root.state,f.teacher),old=npcHousehold(f.e,cursor.root.state,unrelated);
  assert.ok(house);
  if(old)set(['family','households',old.id],{...cursor.root.state.family?.households?.[old.id],left:[...(cursor.root.state.family?.households?.[old.id]?.left??[]),unrelated]});
  set(['family','households',house.id],{...cursor.root.state.family?.households?.[house.id],members:[...(cursor.root.state.family?.households?.[house.id]?.members??[]),unrelated]});
  const joined=read();
  set(['npcs',unrelated,'inventory'],{item_water:2});
  // Membership must refresh before the next inventory comparison. FIELDS
  // recomputes the remembered peer index here as well as the final courses.
  assert.deepEqual(read(),joined);
  set(['npcs',f.teacher,'skills','skill_literacy'],0);
  assert.ok(read().every(c=>!c.school||c.teacher!==f.teacher));
 });
});

test('frozen household decisions keep healthy peers reusable while the ill actor refreshes',()=>{
 // R5 moves cross-person allocation to persisted morning plans. Personal
 // illness/travel must still invalidate the affected actor's own routine.
 const a={worker:{status:'healthy'},sibling:{status:'healthy',coins:10}};
 const ordinary={...a,sibling:{...a.sibling,coins:9}};
 assert.equal(sameNpcScheduleInputs(a.worker,ordinary.worker),true);
 assert.equal(sameNpcScheduleInputs(a.sibling,ordinary.sibling),true);
 const ill={...ordinary,sibling:{...ordinary.sibling,status:'ill'}};
 assert.equal(sameNpcScheduleInputs(ordinary.worker,ill.worker),true);
 assert.equal(sameNpcScheduleInputs(ordinary.sibling,ill.sibling),false);
 for(const subsistence of [false,true]){
  const booked={...a.sibling,scheduleTravel:{depart:1,arrive:40,subsistence}};
  assert.equal(sameNpcScheduleInputs(a.sibling,booked),false);
 }
});

test('positive record dependencies preserve unrelated writes and include legacy kinds under any category',()=>{
 const d=new PatchCursor({state:{records:{job:{category:'contract',kind:'workshop',wage:10},rock:{category:'physical_feature',value:1}}}}),key={},deps={kinds:['workshop']};
 withRecordIndex(()=>{
  const read=()=>{const records=d.expose(d.root.state.records);return recordsMemo(records,key,()=>Object.values(records).filter(r=>r.kind==='workshop'),deps);};
  const first=read();d.apply({op:'set',path:['state','records','rock','value'],value:2});assert.equal(read(),first);
  d.apply({op:'set',path:['state','records','legacy'],value:{category:'legacy-job',kind:'workshop',wage:20}});assert.equal(read().reduce((n,r)=>n+r.wage,0),30);
  d.apply({op:'set',path:['state','records','legacy','kind'],value:'other'});assert.equal(read().reduce((n,r)=>n+r.wage,0),10);
  d.apply({op:'delete',path:['state','records','job']});assert.deepEqual(read(),[]);
 });
});

test('record projections retain ignored progress only; changed terms, removal and reclassification invalidate',()=>{
 const d=new PatchCursor({state:{records:{job:{category:'contract',kind:'workshop',wage:10,workedMinutes:0}}}}),key={};
 const fields=[{category:'contract',kind:'workshop',fields:['workedMinutes']}];
 withRecordIndex(()=>{
  const read=()=>{const records=d.expose(d.root.state.records);return recordsMemo(records,key,()=>Object.values(records).filter(r=>r.category==='contract').map(({workedMinutes,...terms})=>terms),{ignoreFields:fields});};
  const first=read(),snapshot=d.root.state.records;d.apply({op:'set',path:['state','records','job','workedMinutes'],value:60});assert.equal(read(),first);
  // Both projections are still valid: the exposed source was copied, not
  // mutated. Discarding its memo would force a full old-record scan.
  assert.equal(recordsMemo(snapshot,key,()=>Object.values(snapshot).map(({workedMinutes,...terms})=>terms)),first);
  d.apply({op:'set',path:['state','records','job'],value:{category:'contract',kind:'workshop',wage:10,workedMinutes:120}});assert.equal(read(),first);
  d.apply({op:'set',path:['state','records','job','wage'],value:20});assert.equal(read()[0].wage,20);
  d.apply({op:'set',path:['state','records','job','category'],value:'knowledge'});assert.deepEqual(read(),[]);
  d.apply({op:'delete',path:['state','records','job']});assert.deepEqual(read(),[]);
 });
});

test('scoped state memos survive unrelated writes but invalidate subtree replacement, categories and resets',()=>{
 const d=new PatchCursor({state:{records:{job:{category:'contract',wage:10},rock:{category:'physical_feature',wage:1}},family:{},npcs:{a:{coins:5}}}}),scope={};
 const deps=[{path:['records'],categories:['contract']},['npcs','a','coins']];
 const query=(state=d.root.state,observer='a')=>stateMemo(state,scope,['wages',observer],()=>({wages:Object.values(state.records).filter(r=>r.category==='contract').reduce((n,r)=>n+r.wage,0),coins:state.npcs.a.coins,observer}),deps);
 withRecordIndex(()=>{
  const first=query();assert.equal(first.wages,10);
  d.apply({op:'set',path:['state','family','meals','home'],value:{missingMeals:0}});
  assert.equal(query(),first);assert.equal(query(d.root.state,'b').observer,'b');
  d.apply({op:'set',path:['state','records','rock','wage'],value:9});assert.equal(query(),first);
  const snapshot=d.expose(d.root.state);
  d.apply({op:'set',path:['state','npcs','a','coins'],value:7});
  assert.equal(query().coins,7);assert.equal(query(snapshot).coins,5);
  d.apply({op:'set',path:['state','records','rock','category'],value:'contract'});assert.equal(query().wages,19);
  d.apply({op:'delete',path:['state','records','job']});assert.equal(query().wages,9);
  d.apply({op:'set',path:['state','records'],value:{next:{category:'contract',wage:20}}});assert.equal(query().wages,20);
  d.reset({state:{records:{next:{category:'contract',wage:30}},npcs:{a:{coins:1}}}});assert.equal(query().wages,30);
 });
});

test('scoped memo checking still detects a writer that bypasses the cursor',()=>{
 const state={npcs:{a:{coins:5}}},deps=[['npcs']],scope={},before=recordIndexCheck.violations.length;
 setRecordIndexCheck(true);
 try{withRecordIndex(()=>{
  const query=()=>stateMemo(state,scope,['coins'],()=>({coins:state.npcs.a.coins}),deps);
  query();state.npcs.a.coins=6;
  assert.throws(query,/state memo/);assert.equal(recordIndexCheck.violations.length,before+1);
 });}finally{recordIndexCheck.violations.splice(before);setRecordIndexCheck(process.env.FIELDS_INDEX_CHECK==='1');}
});

test('routine indexing preserves a revoked dismissal on the default read path',()=>{
 const base={id:'a',schedule:{default:[]}},engine={world:{factions:[],settlementProfiles:[],npcs:[base]},byId:new Map([['a',base]]),rules:{}};
 const state={minute:0,npcs:{a:{}},records:{dismissal:{category:'legal_dismissal',subject:'a',status:'撤销'}}};
 // The default path historically excludes revoked dismissals; sharing the
 // office/organization buckets must not substitute a different dismissal test.
 withRecordIndex(()=>assert.equal(personRoutine(engine,state,'a'),null));
});

test('state projections distinguish engines, observers and minutes and invalidate in-place writes and resets',()=>{
 const cursor=new PatchCursor({state:{minute:0,npcs:{a:{coins:10}}}}),scope={},other={};
 const query=(observer,minute,engine=scope)=>stateMemo(cursor.root.state,engine,['coins',observer,minute],()=>({coins:cursor.root.state.npcs.a.coins,observer,minute,engine:engine===scope?'first':'other'}));
 withRecordIndex(()=>{
  assert.deepEqual(query('a',0),{coins:10,observer:'a',minute:0,engine:'first'});
  assert.equal(query('b',1,other).engine,'other');
  assert.equal(query('b',1).observer,'b');assert.equal(query('a',2).minute,2);
  // Prime the owned root, then write it again without exposing it: identity
  // alone cannot distinguish the 20 and 30 coin states of this draft.
  cursor.apply({op:'set',path:['state','npcs','a','coins'],value:20});
  const root=cursor.root.state;assert.equal(query('a',0).coins,20);
  cursor.apply({op:'set',path:['state','npcs','a','coins'],value:30});
  assert.equal(cursor.root.state,root);assert.equal(query('a',0).coins,30);
  cursor.reset({state:{minute:0,npcs:{a:{coins:40}}}});assert.equal(query('a',0).coins,40);
 });
 // Outside a cursor-backed advance the same mutable adapter is uncached.
 cursor.root.state.npcs.a.coins=50;assert.equal(query('a',0).coins,50);
 withRecordIndex(()=>assert.equal(query('a',0).coins,50));
});

test('employment memo keeps exact minute, amendments, obligation closure and document isolation',()=>{
 // Signed wage 10 becomes 20 at minute 20; a later fact changes it to 30.
 // No contract query may carry that wage into the earlier minute or another save.
 const a=new PatchCursor(document()),b=new PatchCursor(document());
 setRecordIndexCheck(true);
 try{withRecordIndex(()=>{
  assert.equal(currentEmployment(a.root.state,'a',19).wage,10);
  assert.equal(currentEmployment(a.root.state,'a',20).wage,20);
  const employed=currentEmployment(a.root.state,'a',20);
  a.apply({op:'set',path:['state','records','rock'],value:{category:'physical_feature'}});
  assert.equal(currentEmployment(a.root.state,'a',20),employed);
  assert.equal(currentEmployment(a.root.state,'a',20).wage,20);
  assert.equal(currentEmployment(a.root.state,'a',19).wage,10);
  a.apply({op:'set',path:['state','records','job','amendments','0','wage'],value:30});
  assert.equal(currentEmployment(a.root.state,'a',20).wage,30);
  assert.equal(currentEmployment(b.root.state,'a',20).wage,20);
  a.apply({op:'set',path:['state','records','job','serviceObligation'],value:'service'});
  a.apply({op:'set',path:['state','obligations','service'],value:{id:'service',status:'effective',amount:10}});
  assert.equal(currentEmployment(a.root.state,'a',20).wage,30);
  a.apply({op:'set',path:['state','obligations','service','status'],value:'settled'});
  assert.equal(currentEmployment(a.root.state,'a',20),null);
  assert.equal(currentEmployment(b.root.state,'a',100),null);
 });}finally{setRecordIndexCheck(process.env.FIELDS_INDEX_CHECK==='1');}
});

test('debt bucket preserves canonical projection suppression, order and writes',()=>{
 // One native debt plus its projection is one claim, followed by the legacy debt.
 const cursor=new PatchCursor({state:{records:{unrelated:{category:'knowledge'},projection:{category:'debt',obligation:'native'},legacy:{category:'debt',amount:7}},obligations:{native:{id:'native',legacyRecord:'projection',amount:5}}}});
 withRecordIndex(()=>{
  assert.deepEqual(obligationRows(cursor.root.state).map(r=>r.id),['native','legacy']);
  assert.deepEqual(obligationRows(cursor.root.state).map(r=>r.amount),[5,7]);
  cursor.apply({op:'set',path:['state','records','legacy','amount'],value:9});
  assert.deepEqual(obligationRows(cursor.root.state).map(r=>r.amount),[5,9]);
 });
});

test('route projections survive clock/account writes and invalidate physical changes and rebuilds',()=>{
 // Hand anchors: bridge capacity20 × factor1/.5 =20/10; remote
 // condition100-floor(800/10)=20 is below25, so factor/capacity are0.
 const bases=[{id:'bld_bridge',type:'bld',facilityType:'bridge',route:'road'},
  {id:'bld_remote',type:'bld',facilityType:'road',route:'remote',generated:'remote',region:'r'}];
 const engine={byId:new Map(bases.map(b=>[b.id,b])),rules:{}},d=new PatchCursor({state:{minute:0,created:{},records:{},buildings:{bld_bridge:{condition:100},bld_remote:{}}}});
 const read=()=>facilityRouteStates(engine,d.root.state);
 withRecordIndex(()=>{
  const first=read();assert.deepEqual(first.get('road'),{factor:1,capacity:20});
  d.apply({op:'set',path:['state','minute'],value:1440});assert.equal(read(),first);
  d.apply({op:'set',path:['ledger','accounts','a|coin_river|purse'],value:10});assert.equal(read(),first);
  d.apply({op:'set',path:['state','records','trade'],value:{category:'market_trade'}});assert.equal(read(),first);
  d.apply({op:'set',path:['state','buildings','bld_bridge','condition'],value:50});
  assert.deepEqual(read().get('road'),{factor:0.5,capacity:10});assert.equal(first.get('road').factor,1);
  d.apply({op:'set',path:['state','records','facility_region:r'],value:{category:'facility_region',wear:{wood:800},wearDenominator:10}});
  assert.deepEqual(read().get('remote'),{factor:0,capacity:0});
  d.apply({op:'set',path:['state','created','bld_new'],value:{id:'bld_new',type:'bld',facilityType:'bridge',route:'road',rebuiltFrom:'bld_bridge'}});
  d.apply({op:'set',path:['state','buildings','bld_new'],value:{condition:100}});
  assert.deepEqual(read().get('road'),{factor:1,capacity:20});
  d.apply({op:'set',path:['state','buildings'],value:{}});assert.equal(read().size,0);
 });
});


test('constraint dependencies retain new unrelated records and invalidate case subjects and legacy kinds',()=>{
 const a={id:'a'},b={id:'b'},engine={world:{factions:[]},byId:new Map([['a',a],['b',b]])};
 const cursor=new PatchCursor({state:{minute:0,records:{case:{category:'legal_case',offender:'a'},hold:{category:'legal_custody',case:'case',status:'生效'}}}});
 withRecordIndex(()=>{
  const read=()=>personConstraints(engine,cursor.expose(cursor.root.state)),first=read();
  assert.equal(first.get('a').length,1);
  cursor.apply({op:'set',path:['state','records','forage'],value:{category:'household_forage',reserve:20}});
  assert.equal(read(),first);
  cursor.apply({op:'set',path:['state','records','case','offender'],value:'b'});
  assert.equal(read().has('a'),false);assert.equal(read().get('b').length,1);
  cursor.apply({op:'set',path:['state','records','lease'],value:{category:'legacy',kind:'asset_lease',tenant:'a',status:'有效'}});
  assert.equal(read().leases.get('a').length,1);
  cursor.apply({op:'set',path:['state','records','lease','kind'],value:'other'});
  assert.equal(read().leases.has('a'),false);
 });
});


test('schedule inputs follow frozen plans while execution reads live forage stock',()=>{
 const base={minute:0,npcs:{},records:{},obligations:{},family:{meals:{home:{shortfall:{satiety:0}}}}};
 const ordinary={...base,family:{meals:{home:{shortfall:{satiety:0},sources:[{kind:'forage',location:'wood',quantity:8,maximumHarvest:8}]}}}};
 assert.equal(sameScheduleInputs(base,ordinary),true);
 const empty={...base,family:{meals:{home:{shortfall:{satiety:60},sources:[{kind:'forage',location:'wood',quantity:4,maximumHarvest:8}]}}}};
 // R3 source choice no longer reads yesterday's receipt: either meal shape
 // is irrelevant until the physical source stock itself changes.
 assert.equal(sameScheduleInputs(ordinary,empty),true);
 const same={...empty,family:{meals:{home:{shortfall:{satiety:90},sources:[{kind:'forage',location:'wood',quantity:2,maximumHarvest:8}]}}}};
 assert.equal(sameScheduleInputs(empty,same),true);
 const other={...empty,family:{meals:{home:{shortfall:{satiety:60},sources:[{kind:'forage',location:'river',quantity:4,maximumHarvest:8}]}}}};
 assert.equal(sameScheduleInputs(empty,other),true);
 const stocked={...base,records:{forage:{category:'household_forage',location:'wood',reserve:8}}};
 const exhausted={...stocked,records:{forage:{...stocked.records.forage,reserve:0}}};
 // R5:8 real portions becoming0 changes execution, never the morning plan.
 assert.equal(sameScheduleInputs(stocked,exhausted),true);
 const planned={...stocked,records:{...stocked.records,plan:{category:'subsistence_plan',day:0,households:{home:{foodTrips:[]}}}}};
 const tomorrow={...planned,records:{...planned.records,plan:{...planned.records.plan,day:1}}};
 assert.equal(sameScheduleInputs(stocked,planned),false);
 assert.equal(sameScheduleInputs(planned,tomorrow),false);
});

test('schedule water dependencies follow availability and potability rather than harmless volume changes',()=>{
 const water={waterMl:10000,frozenUntil:0,pathogenRisk:0,toxinUg:0,saltMg:0};
 const base={minute:0,npcs:{},records:{river:{category:'water_cycle',location:'river',water}},obligations:{},family:{}};
 const less={...base,records:{river:{...base.records.river,water:{...water,waterMl:9000},consumed:1000}}};
 //Both quantities are positive and potable: no work/schedule input changed.
 assert.equal(sameScheduleInputs(base,less),true);
 const empty={...base,records:{river:{...base.records.river,water:{...water,waterMl:0}}}};
 assert.equal(sameScheduleInputs(base,empty),false);
 const polluted={...base,records:{river:{...base.records.river,water:{...water,pathogenRisk:99}}}};
 assert.equal(sameScheduleInputs(base,polluted),false);
 const frozen={...base,records:{river:{...base.records.river,water:{...water,frozenUntil:14400}}}};
 assert.equal(sameScheduleInputs(base,frozen),false);
});


test('routine projection retains unrelated knowledge/history but follows the appointment original',()=>{
 const cursor=new PatchCursor({state:{minute:0,npcs:{},family:{},effects:{},records:{
  appointment:{category:'service_appointment',actor:'a',sourceEvent:'meeting'},
  'world_event:meeting':{id:'meeting',category:'world_event',verb:'appointment_agreed',actor:'a',payload:{service:'teach'}}
 },obligations:{}}});
 withRecordIndex(()=>{
  const before=cursor.expose(cursor.root.state);
  cursor.apply({op:'set',path:['state','records','learning'],value:{category:'knowledge',actor:'a'}});
  cursor.apply({op:'set',path:['state','records','history'],value:{category:'world_event',id:'history',verb:'arrived'}});
  assert.equal(sameScheduleInputs(before,cursor.root.state),true);
  const previous=cursor.expose(cursor.root.state);
  cursor.apply({op:'set',path:['state','records','world_event:meeting','actor'],value:'b'});
  assert.equal(sameScheduleInputs(previous,cursor.root.state),false);
 });
});
