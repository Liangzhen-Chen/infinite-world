import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,accountKey} from '../server-plugin/ledger.mjs';
import {emptyHoldings} from '../server-plugin/holdings.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {createPrimitiveFrame,planPrimitives,commitPrimitives} from '../server-plugin/primitives.mjs';
const a=accountKey('player','coin_river','purse'),b=accountKey('npc_a','coin_river','purse');
function fixture(){
 const document={state:{minute:2,records:{}},ledger:emptyLedger(),holdings:emptyHoldings()};document.ledger.accounts={[a]:10,[b]:0};
 const options={actor:'player',eventId:'tx-one',source:{kind:'open',id:'builder'},canAct:()=>({allowed:true}),authority:()=>({allowed:true}),location:()=> 'loc',mirrorTransfer:()=>{},factPolicy:{project:{condition:{type:'number',min:0,max:100}}},verbs:['tell']};
 document.holdings.entities.project_a={id:'project_a',kind:'project',facts:{condition:20}};
 return {document,options,frame:createPrimitiveFrame(options),effect:{op:'transfer',from:a,to:b,qty:6}};
}
test('A3 transaction: second transfer failure rolls back the whole proposal',()=>{
 const {document,frame,effect}=fixture(),before=structuredClone(document);assert.throws(()=>commitPrimitives(document,[effect,effect],frame),e=>e.code==='E-TRANSFER-BALANCE'&&e.index===1);assert.deepEqual(document,before);
});
test('A3 transaction: commit rechecks facts after preview; no stale authority or balance',()=>{
 const {document,frame,effect,options}=fixture();planPrimitives(document,[effect],frame);document.ledger.accounts[a]=1;
 assert.throws(()=>commitPrimitives(document,[effect],frame),{code:'E-TRANSFER-BALANCE'});
 document.ledger.accounts[a]=10;let permitted=true;const f=createPrimitiveFrame({...options,authority:()=>({allowed:permitted})});planPrimitives(document,[effect],f);permitted=false;
 assert.throws(()=>commitPrimitives(document,[effect],f),{code:'E-AUTHORITY'});
});
test('A3 transaction: duplicate event after JSON save/load is idempotent; changed payload rejects',()=>{
 const {document,frame,effect}=fixture(),first=commitPrimitives(document,[effect],frame),next=JSON.parse(JSON.stringify(applyPatches(document,first.patches))),again=commitPrimitives(next,[effect],frame);
 assert.deepEqual(again.patches,[]);assert.deepEqual(again.events,[]);assert.equal(again.receipt.duplicate,true);
 assert.throws(()=>commitPrimitives(next,[{...effect,qty:1}],frame),{code:'E-PRIMITIVE-DUPLICATE'});
 // Removing the committed patches and recomputing produces identical events.
 assert.deepEqual(commitPrimitives(document,[effect],frame),first);
});
test('A3 transaction: fact.set uses registered writer and whitelist, never accounts or skills',()=>{
 const {document,frame}=fixture(),effect={op:'fact.set',entity:'project_a',field:'condition',delta:5},result=commitPrimitives(document,[effect],frame),next=applyPatches(document,result.patches);
 assert.equal(next.holdings.entities.project_a.facts.condition,25);assert.equal(document.holdings.entities.project_a.facts.condition,20);
 for(const field of ['coin','coins','treasury','inventory','skills','age','belief','minute','__proto__'])assert.throws(()=>commitPrimitives(document,[{...effect,field}],frame),{code:'E-FACT-FIELD'});
 assert.throws(()=>commitPrimitives(document,[{...effect,delta:81}],frame),{code:'E-FACT-RANGE'});
});
test('A3 transaction: reaction-facing event is returned only after all effects succeed',()=>{
 const {document,frame,effect}=fixture(),emit={op:'emit',verb:'tell',target:'npc_a',payload:{text:'hello'},visibility:'private'};
 const result=commitPrimitives(document,[effect,emit],frame);assert.equal(result.events[2].result.visibility,'private');assert.equal(result.events[2].parent,'tx-one');
 assert.throws(()=>commitPrimitives(document,[emit,{...effect,qty:11}],frame),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(document.state.records,{});
});
