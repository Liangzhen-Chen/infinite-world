import test from 'node:test';
import assert from 'node:assert/strict';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {emptyHoldings,openHolding,declareHoldingWriter,aliveHoldings} from '../server-plugin/holdings.mjs';
import {emptyLedger} from '../server-plugin/ledger.mjs';
import {registerObligationKind,snapshotObligationTerms,obligationGoneRoute} from '../server-plugin/obligation-kinds.mjs';
import {transition,transitionState,changeLegacyHoldings} from '../server-plugin/transition.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {leaseClauses,leaseState} from '../server-plugin/contract-state.mjs';
import fs from 'node:fs';
const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
const person='npc_hw_linsui',heir='npc_hw_chenbai';
declareHoldingWriter('s2c-test',{kinds:['*'],entities:['*'],locations:true});
function fresh(){const document=engine.createCharacter(seed,{},'s2c');document.holdings=emptyHoldings();document.ledger=emptyLedger();return {document,engine,patches:[],messages:[],
 get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
 set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
 remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(){}};}

test('a declared package kind uses the protocol without installing handover code',()=>{
 registerObligationKind({id:'s2c-service',onDebtorGone:'void',onCreditorGone:'estate'});
 const d=fresh(),o=snapshotObligationTerms({id:'service',kind:'s2c-service',debtor:person,creditor:heir,status:'pending'});
 d.set(['state','obligations',o.id],o);
 transition(d,engine,{entity:person,basis:'death',origin:'death_rule'});
 assert.equal(d.get('state','obligations',o.id,'status'),'void');
 assert.equal(obligationGoneRoute(o,'debtor',{onDebtorGone:{'s2c-service':'accelerate'}}),'accelerate');
 assert.equal(obligationGoneRoute({...o,onDebtorGone:'accelerate'},'debtor'),'void','signed terms outrank a later mutable field');
});
test('an unknown obligation declaration rolls back the complete transition',()=>{
 const d=fresh();d.set(['state','obligations','unknown'],{id:'unknown',kind:'s2c-unknown',debtor:person,creditor:heir,status:'pending'});
 const before=structuredClone(d.document);
 assert.throws(()=>transition(d,engine,{entity:person,basis:'death',origin:'death_rule'}),/Undeclared obligation/);
 assert.deepEqual(d.document,before);
});
test('actual creature death uses gone and personal appointments follow declared void',()=>{
 const d=fresh(),id='creature_s2c';
 d.set(['state','creatures',id],{species:world.monsters[0].id,location:d.get('state','location'),hp:2,status:'正常',incarnation:0,inheritance:false});
 d.set(['state','obligations','personal'],snapshotObligationTerms({id:'personal',reservationVersion:1,promisor:id,promisee:'player',status:'待履行'}));
 recordEntityDeath(d,engine,id,d.get('state','minute'),'测试规则致命');
 assert.equal(transitionState(d,id)?.gone,true);
 assert.equal(d.get('state','obligations','personal','status'),'取消');
 assert.equal(d.get('state','obligations','personal','resolution','kind'),'void');
});
test('legacy mutation failure restores protocol holdings and emitted events',()=>{
 const d=fresh();openHolding(d,{kind:'member_of',holder:person,subject:'org_s2c',source:'org:org_s2c',writer:'s2c-test',engine});
 const before=structuredClone(d.document);
 assert.throws(()=>changeLegacyHoldings(d,engine,{holder:person,source:'org:org_s2c',eventId:'leave'},()=>{d.set(['state','marker'],true);throw Error('writer failed');}),/writer failed/);
 assert.deepEqual(d.document,before);assert.equal(aliveHoldings(d,{holder:person}).length,1);
});
test('lease status and rent derive from signed usability clauses without rewriting the contract',()=>{
 const b=world.locations.find(b=>b.id.startsWith('bld_')),state={minute:10,buildings:{[b.id]:{condition:45}}};
 const row={subject:b.id,createdAt:0,deadline:100,monthlyRent:100,status:'有效'};row.clauses=leaseClauses(row);
 const before=structuredClone(row);assert.equal(leaseState(engine,state,row).monthlyRent,50);
 state.buildings[b.id].condition=0;assert.equal(leaseState(engine,state,row).status,'suspended');
 state.buildings[b.id].condition=100;assert.equal(leaseState(engine,state,row).monthlyRent,100);
 row.monthlyRent=999;assert.equal(leaseState(engine,state,row).monthlyRent,100,'subsequent defaults do not alter signed rent');
 row.monthlyRent=100;assert.deepEqual(row,before);assert.equal(leaseState(engine,state,row,100).active,false);
});
