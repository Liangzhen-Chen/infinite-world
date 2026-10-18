import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotContractTerms,contractTerms,contractState} from '../server-plugin/contract-state.mjs';
import {currentEmployment} from '../server-plugin/employment-state.mjs';

test('employment reads the signed wage and interval, with explicit amendment and termination facts',()=>{
 const row=snapshotContractTerms({id:'job',category:'contract',kind:'workshop',owner:'a',worker:'b',wage:10,createdAt:0,starts:0,deadline:100,status:'有效'});
 row.wage=999;row.deadline=1;row.status='已到期';
 const state={minute:10,records:{job:row}};
 assert.equal(currentEmployment(state,'b').wage,10);
 assert.equal(currentEmployment(state,'b').deadline,100);
 row.amendments=[{minute:20,wage:12}];
 assert.equal(currentEmployment(state,'b',20).wage,12);
 row.endedAt=30;assert.equal(currentEmployment(state,'b',30),null);
 assert.equal(contractState(row,30).active,false);
});
test('new supported contract kinds snapshot parties and terms; legacy rows retain their fallback',()=>{
 for(const kind of ['lease','asset_lease','workshop','employment','partnership','equity','hire','procurement','sale']){
  const row=snapshotContractTerms({kind,parties:['a','b'],createdAt:0,deadline:100,cost:20,status:'有效'});
  row.parties[0]='c';row.cost=0;row.deadline=1;
  assert.deepEqual(contractTerms(row,10).parties,['a','b']);
  assert.equal(contractTerms(row,10).cost,20);assert.equal(contractState(row,10).active,true);
 }
 assert.equal(contractState({kind:'workshop',status:'已到期',createdAt:0,deadline:100},10).active,false);
});
