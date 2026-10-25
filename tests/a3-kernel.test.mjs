import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyLedger,accountKey,auditLedger} from '../server-plugin/ledger.mjs';
import {emptyHoldings} from '../server-plugin/holdings.mjs';
import {createPrimitiveFrame,planPrimitives,commitPrimitives} from '../server-plugin/primitives.mjs';
import {PRIMITIVE_IDS} from '../server-plugin/primitive-policy.mjs';
import {createActionPrimitiveFrame} from '../server-plugin/action-authority.mjs';
import '../server-plugin/stock.mjs';
import {actionSchema,schemaValidator} from '../server-plugin/primitive-schema.mjs';
import fs from 'node:fs';
import {applyPatches} from '../server-plugin/storage.mjs';

const a=accountKey('player','coin_river','purse'),b=accountKey('npc_a','coin_river','purse');

test('A3 schemas: generated contracts match production; proposal provenance and missing fields reject',()=>{
 assert.deepEqual(JSON.parse(fs.readFileSync('schemas/action.schema.json','utf8')),actionSchema);
 const proposal=schemaValidator('proposal'),input={intent:'hand over a coin',effects:[{op:'transfer',from:a,to:b,qty:1}]};
 assert.equal(proposal(input),true);assert.equal(proposal({...input,source:{kind:'rule',id:'forged'}}),false);
 assert.equal(proposal({...input,effects:[{op:'vital',target:'player'}]}),false);
 assert.equal(proposal({...input,effects:[{op:'create',kind:'mark',facts:{intent:'trace',form:'scratch'},tags:['mark:warning']}]}),true);
 const definition=schemaValidator('definition');
 assert.equal(definition({id:'test:signature',label:'test',narration:'test',slots:[],synonyms:[],visibility:{catalog:'here'},signature:['emit'],outcomes:[{op:'emit',verb:'tell',visibility:'private',payload:{}}]}),true,JSON.stringify(definition.errors));
 const {document,frame,effects}=setup(),receipt=commitPrimitives(document,effects,frame).receipt,validReceipt=schemaValidator('receipt');
 assert.equal(validReceipt(receipt),true,JSON.stringify(validReceipt.errors));
});
function setup(){
 const document={state:{minute:0,records:{},player:{coins:10},npcs:{npc_a:{coins:0}}},ledger:emptyLedger(),holdings:emptyHoldings()};
 document.ledger.accounts={[a]:10,[b]:0};
 const frame=createPrimitiveFrame({actor:'player',eventId:'a3-transfer',source:{kind:'catalog',id:'core:give'},
  canAct:()=>({allowed:true,tags:[]}),authority:(_,actor,op,target)=>({allowed:target===a,actedAs:{kind:'self',id:actor}}),location:()=> 'loc_a',
  mirrorTransfer:(d,e)=>{d.set(['state','player','coins'],d.get('state','player','coins')-e.qty);d.set(['state','npcs','npc_a','coins'],d.get('state','npcs','npc_a','coins')+e.qty);}});
 return {document,frame,effects:[{op:'transfer',from:a,to:b,qty:4}]};
}
test('A3 kernel: nineteen primitive names, unknown execution connectors fail explicitly',()=>{
 assert.equal(PRIMITIVE_IDS.length,19);const {document,frame}=setup();
 // Keep the missing-native-connector assertion with a structurally complete
 // learn input now that all 19 shapes are validated before execution (06 §6.3).
 assert.throws(()=>commitPrimitives(document,[{op:'learn',entity:'player',subject:'skill_a',learningSource:'practice'}],frame),{code:'E-PRIMITIVE-CONNECTOR'});
 assert.throws(()=>commitPrimitives(document,[{op:'unknown'}],frame),{code:'E-PRIMITIVE'});
});
test('A3 kernel: preview does not change books, facts, time or persisted receipts',()=>{
 const {document,frame,effects}=setup(),before=structuredClone(document),result=planPrimitives(document,effects,frame);
 assert.equal(result.receipt.status,'preview');assert.equal(result.receipt.applied[0].result,4);assert.equal(result.patches,undefined);assert.deepEqual(document,before);
});
test('A3 kernel: actual ledger transfer, legacy mirror and parent/child provenance',()=>{
 const {document,frame,effects}=setup(),result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches);
 assert.equal(next.ledger.accounts[a],6);assert.equal(next.ledger.accounts[b],4);assert.equal(next.state.player.coins,6);assert.equal(next.state.npcs.npc_a.coins,4);
 assert.equal(next.state.minute,0);assert.deepEqual(next.ledger.drift??[],[]);assert.equal(result.events[1].parent,frame.eventId);assert.deepEqual(result.receipt.applied[0].actedAs,{kind:'self',id:'player'});
 assert.ok(auditLedger(next).length===0);
});
test('A3 kernel: insufficient balance cannot use the legacy drift repair source',()=>{
 const {document,frame,effects}=setup();effects[0].qty=11;assert.throws(()=>commitPrimitives(document,effects,frame),{code:'E-TRANSFER-BALANCE'});
 assert.deepEqual(document.ledger.flows,{});assert.deepEqual(document.ledger.drift??[],[]);
});
test('A3 kernel: JSON cannot forge server frame, writer, authority or rule source',()=>{
 const {document,frame,effects}=setup();assert.throws(()=>commitPrimitives(document,effects,JSON.parse(JSON.stringify(frame))),{code:'E-PRIMITIVE-FRAME'});
 for(const field of ['writer','source','actedAs','checkResult','parent','index','eventId','tags','result'])assert.throws(()=>commitPrimitives(document,[{...effects[0],[field]:'forged'}],frame),{code:'E-PRIMITIVE-SOURCE'});
 assert.throws(()=>commitPrimitives(document,[{...effects[0],actor:'npc_a'}],frame),{code:'E-PRIMITIVE-ACTOR'});
 assert.throws(()=>commitPrimitives(document,[{op:'holding.open',holdingKind:'leases',holder:'__proto__',subject:'item_a'}],frame),{code:'E-PRIMITIVE-FIELD'});
 for(const from of ['src:craft|coin_river|output','src:mint|coin_river|mint'])assert.throws(()=>commitPrimitives(document,[{...effects[0],from}],frame),{code:'E-TRANSFER-ENDPOINT'});
});
test('A3 kernel: empty proposed tags are absent in effect, nonempty tags cannot replace derived tags',()=>{
 const {document,frame,effects}=setup(),before=structuredClone(document);
 const plain=planPrimitives(document,effects,frame),empty=planPrimitives(document,[{...effects[0],tags:[]}],frame);
 assert.deepEqual(empty.receipt.applied,plain.receipt.applied);
 assert.deepEqual(empty.receipt.applied[0].tags,[]);
 for(const tags of [['authorized'],['unconsented'],['capacity:limited']])assert.throws(()=>commitPrimitives(document,[{...effects[0],tags}],frame),{code:'E-PRIMITIVE-SOURCE'});
 assert.deepEqual(document,before);
});
test('A3 kernel: shared action adapter rereads location/capacity and preserves resource lots',()=>{
 const {document}=setup();document.state.location='loc_a';document.state.player.age=20;document.state.npcs.npc_a={age:20,location:'loc_a'};
 // Existing stock policy tracks lots for storage purposes, not loose inventory.
 const from=accountKey('player','item_oats','granary'),to=accountKey('npc_a','item_oats','granary');
 document.ledger.accounts[from]=3;document.ledger.accounts[to]=0;document.ledger.lots[from]=[{id:'harvest-1',qty:3,day:0,quality:80,origin:'farm'}];
 const frame=createActionPrimitiveFrame({document},{actor:'player',eventId:'lot-one',source:{kind:'catalog',id:'core:give'},mirrorTransfer:()=>{}}),effects=[{op:'transfer',from,to,qty:3}];
 planPrimitives(document,effects,frame);document.state.npcs.npc_a.location='loc_b';assert.throws(()=>commitPrimitives(document,effects,frame),{code:'E-TRANSFER-REACH'});
 document.state.npcs.npc_a.location='loc_a';const result=commitPrimitives(document,effects,frame),next=applyPatches(document,result.patches);
 assert.equal(next.ledger.accounts[from],0);assert.equal(next.ledger.accounts[to],3);assert.equal(next.ledger.lots[from],undefined);assert.equal(next.ledger.lots[to][0].origin,'farm');assert.equal(next.ledger.lots[to][0].quality,80);
 assert.equal(result.patches.find(p=>p.path[1]==='lots'&&p.path[2]===from).op,'delete');
 document.state.player.status='昏迷';assert.throws(()=>commitPrimitives(document,effects,frame),{code:'E-CAPACITY'});
});
test('A3 kernel: detained actor can communicate through the actual primitive adapter',()=>{
 const {document}=setup();document.state.player.age=20;
 document.holdings.rows.h1={id:'h1',kind:'guest_of',variant:'detained',holder:'player',subject:'loc_prison'};
 const frame=createActionPrimitiveFrame({document},{actor:'player',eventId:'custody-talk',source:{kind:'catalog',id:'core:talk'},mirrorTransfer:()=>{},verbs:['tell']});
 const result=commitPrimitives(document,[{op:'emit',verb:'tell',target:'npc_a',payload:{text:'请听我说'},visibility:'witnessed'}],frame);
 assert.equal(result.receipt.applied[0].verb,'tell');assert.equal(result.events[1].result.visibility,'witnessed');
});
