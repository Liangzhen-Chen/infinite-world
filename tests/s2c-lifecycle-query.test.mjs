import test from 'node:test';
import assert from 'node:assert/strict';
import {lifecycleState,isGone,isLiving,isPhysicallyDead,isEffective,projectionLiving} from '../server-plugin/lifecycle-state.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {recordEntityDeath} from '../server-plugin/npc-life.mjs';
import {restoreTransition,transition,changeHolding} from '../server-plugin/transition.mjs';
import {emptyHoldings,openHolding,createEntity,declareHoldingWriter} from '../server-plugin/holdings.mjs';
import {emptyLedger} from '../server-plugin/ledger.mjs';
import fs from 'node:fs';

const engine=new WorldEngine(await loadWorld()),seed=JSON.parse(fs.readFileSync('tests/fixtures/legacy/seed.json','utf8'));
function fresh(){const document=engine.createCharacter(seed,{},'lifecycle-query');document.holdings=emptyHoldings();document.ledger=emptyLedger();
 return {document,original:structuredClone(document),engine,patches:[],messages:[],
 get(...p){return structuredClone(p.reduce((v,k)=>v?.[k],this.document));},peek(...p){return p.reduce((v,k)=>v?.[k],this.document);},
 set(path,value){this.document=applyPatches(this.document,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
 remove(path){this.document=applyPatches(this.document,[{op:'delete',path}]);this.patches.push({op:'delete',path});},say(){}};}

test('legal declaration, physical death, restoration and generations are distinct',()=>{
 const doc={state:{npcs:{a:{status:'正常',incarnation:0}},records:{}},holdings:{protocol:{entities:{}}}};
 const rows=doc.holdings.protocol.entities;
 assert.equal(isLiving(null,doc,'a'),true);
 rows.a={generation:0,gone:true,basis:'declared'};
 assert.equal(isGone(null,doc,'a'),true);assert.equal(isLiving(null,doc,'a'),true);assert.equal(isEffective(null,doc,'a'),false);
 rows.a.actualDeath=0;assert.equal(isPhysicallyDead(null,doc,'a'),true);
 rows.a={...rows.a,gone:false,restoredAt:1};doc.state.npcs.a.status='死亡';
 assert.equal(isGone(null,doc,'a'),false);assert.equal(isLiving(null,doc,'a'),true);
 rows.a={generation:0,gone:true,basis:'death'};doc.state.npcs.a={incarnation:1,status:'正常'};
 assert.equal(isGone(null,doc,'a'),false);assert.equal(lifecycleState(null,doc,'a').generation,1);
});
test('legacy records, missing actors and nonfatal restrictions are not conflated',()=>{
 for(const status of ['正常','濒死','昏迷','患病','睡眠','在途']){
  const state={npcs:{a:{status}},records:{}};
  assert.equal(isLiving(null,state,'a'),true);assert.equal(isGone(null,state,'a'),false);
 }
 const state={npcs:{a:{status:'死亡'}},records:{}};
 assert.equal(isPhysicallyDead(null,state,'a'),true);assert.equal(isLiving(null,state,'missing'),false);
 state.records['transition:a']={generation:0,gone:false,restoredAt:0};
 assert.equal(isLiving(null,state,'a'),true);
 assert.equal(projectionLiving(undefined),false);assert.equal(projectionLiving({status:'濒死'}),true);
});

test('player death entry, restore and another death use distinct lives and only one XP loss per death',()=>{
 const d=fresh();d.set(['state','player','xp'],100);d.set(['state','player','level'],1);
 const first=recordEntityDeath(d,engine,'player',d.get('state','minute'),'fall');
 assert.equal(first.gone,true);assert.equal(first.generation,0);assert.equal(d.get('state','player','xp'),90);
 recordEntityDeath(d,engine,'player',d.get('state','minute'),'fall');assert.equal(d.get('state','player','xp'),90);
 restoreTransition(d,engine,{entity:'player',origin:'registered_action',action:{produces:'restored'},vital:{hp:2}});
 assert.equal(lifecycleState(engine,d,'player').restored,true);assert.equal(isLiving(engine,d,'player'),true);
 d.document=JSON.parse(JSON.stringify(d.document));
 const second=recordEntityDeath(d,engine,'player',d.get('state','minute'),'fall');
 assert.equal(second.generation,1);assert.notEqual(second.successor,first.successor);assert.equal(d.get('state','player','xp'),80);
});

declareHoldingWriter('lifecycle-query-test',{kinds:['holds_office'],entities:['office']});
test('gone and ordinary vacancy publish reusable succession facts and restore never reinstates the old office',()=>{
 const W={writer:'lifecycle-query-test',engine},d=fresh(),person='npc_hw_linsui';
 createEntity(d,{id:'office_query_test',kind:'office',facts:{succession:'election'},...W});
 const id=openHolding(d,{kind:'holds_office',holder:person,subject:'office_query_test',...W});
 changeHolding(d,engine,{op:'close',id,reason:'vacated',eventId:'query-vacancy'});
 const event=Object.values(d.get('state','records')).find(r=>r.verb==='succession');
 assert.equal(event.previousHolder,person);assert.equal(event.holding,id);assert.equal(event.subject,'office_query_test');assert.equal(event.rule,'election');
 transition(d,engine,{entity:person,basis:'declared',origin:'declaration_judgment'});
 assert.equal(isLiving(engine,d,person),true);assert.equal(isEffective(engine,d,person),false);
 restoreTransition(d,engine,{entity:person,origin:'declaration_revoked'});
 assert.equal(isEffective(engine,d,person),true);
 assert.equal(d.get('holdings','rows',id,'until'),d.get('state','minute'));
});

test('a getter-only legacy draft restores every partition and exposes the original protocol rejection',()=>{
 const d=fresh();d.set(['state','obligations','invalid'],{id:'invalid',kind:'compensation',debtor:'npc_hw_linsui',creditor:'player',amount:1,status:'pending',terms:{onDebtorGone:'unknown'}});
 let current=d.document;const before=structuredClone(current);
 const getter={...d,patches:[],get document(){return current;},
 set(path,value){current=applyPatches(current,[{op:'set',path,value}]);this.patches.push({op:'set',path,value});},
 remove(path){current=applyPatches(current,[{op:'delete',path}]);this.patches.push({op:'delete',path});}};
 assert.throws(()=>transition(getter,engine,{entity:'npc_hw_linsui',basis:'death',origin:'death_rule'}),/Unknown debtor gone route/);
 assert.deepEqual(getter.document,before);assert.deepEqual(getter.patches,[]);
});
