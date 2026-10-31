import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,withRecordIndex,setRecordIndexCheck,stateMemo,recordsMemo,recordIndexCheck} from '../server-plugin/storage.mjs';
import {currentEmployment} from '../server-plugin/employment-state.mjs';
import {snapshotContractTerms} from '../server-plugin/contract-state.mjs';
import {obligationRows} from '../server-plugin/obligation-state.mjs';
import {personRoutine} from '../server-plugin/entity-view.mjs';
import {facilityRouteStates} from '../server-plugin/facility-state.mjs';

const document=()=>({state:{minute:0,records:{job:snapshotContractTerms({id:'job',category:'contract',kind:'workshop',worker:'a',createdAt:0,starts:0,deadline:100,wage:10,status:'有效',amendments:[{minute:20,wage:20}]})},obligations:{}}});

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
