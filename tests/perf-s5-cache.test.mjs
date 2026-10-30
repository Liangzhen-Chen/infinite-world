import test from 'node:test';
import assert from 'node:assert/strict';
import {PatchCursor,withRecordIndex,setRecordIndexCheck,stateMemo} from '../server-plugin/storage.mjs';
import {currentEmployment} from '../server-plugin/employment-state.mjs';
import {snapshotContractTerms} from '../server-plugin/contract-state.mjs';
import {obligationRows} from '../server-plugin/obligation-state.mjs';
import {personRoutine} from '../server-plugin/entity-view.mjs';

const document=()=>({state:{minute:0,records:{job:snapshotContractTerms({id:'job',category:'contract',kind:'workshop',worker:'a',createdAt:0,starts:0,deadline:100,wage:10,status:'有效',amendments:[{minute:20,wage:20}]})},obligations:{}}});

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
