import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger,accountKey} from '../server-plugin/ledger.mjs';
import {partyAccount} from '../server-plugin/money.mjs';
import {bag,store,settlementStock} from '../server-plugin/stock.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {openHoldings} from '../server-plugin/holdings.mjs';
import {planPrimitives,commitPrimitives} from '../server-plugin/primitives.mjs';
import {createRuntimePrimitiveFrame,primitiveClaims} from '../server-plugin/primitives-runtime.mjs';
import {resolvePrimitiveTransfer} from '../server-plugin/primitive-accounts.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-transfer-accounts');
 const npc='npc_hw_yanzhe',location=document.state.location,org='org_a3_accounts';
 Object.assign(document.state.npcs[npc],{location,status:'正常',scheduleTravel:null,cognitionTravel:null});
 document.state.player.coins=100;document.state.inventory.item_ration={quantity:10};
 document.state.records[`organization:${org}`]={id:org,category:'organization',location,treasury:0,items:{}};
 document.holdings=openHoldings(engine,document);
 document.holdings.entities[org]={id:org,kind:'organization',facts:{location}};
 document.holdings.locations[org]={at:location,mode:'place',since:document.state.minute};
 document.ledger=openLedger(engine,document);
 const frame=id=>createRuntimePrimitiveFrame(engine,document,{eventId:id,source:{kind:'open',id:'test:transfer'}});
 return {engine,document,npc,org,frame};
}
function reconciled(engine,document){
 assert.deepEqual(auditLedger(document.ledger),[]);assert.deepEqual(document.ledger.drift??[],[]);
 assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
}
test('A3 accounts: entity cash endpoints preview and commit to purses, preserve replay and conservation',()=>{
 const {engine,document,npc,frame}=fixture(),effects=[{op:'transfer',resource:'coin_river',from:'player',to:npc,qty:7}],before=structuredClone(document),f=frame('cash-entities');
 const preview=planPrimitives(document,effects,f);assert.deepEqual(document,before);
 assert.equal(preview.receipt.applied[0].from,partyAccount(engine,document.state,'player'));
 assert.equal(preview.receipt.applied[0].to,partyAccount(engine,document.state,npc));
 const result=commitPrimitives(document,effects,f),next=JSON.parse(JSON.stringify(applyPatches(document,result.patches)));
 assert.deepEqual(result.receipt.applied,preview.receipt.applied);assert.equal(next.state.player.coins,93);
 assert.equal(next.state.npcs[npc].coins,before.state.npcs[npc].coins+7);reconciled(engine,next);
 assert.deepEqual(commitPrimitives(next,effects,f).patches,[]);
 assert.throws(()=>commitPrimitives(next,[{...effects[0],qty:8}],f),{code:'E-PRIMITIVE-DUPLICATE'});
 assert.equal(primitiveClaims(engine,document,effects)[0].target,`account:${partyAccount(engine,document.state,'player')}`);
});
test('A3 accounts: self aliases and bare consumption map to bag and sink; mixed endpoint infers resource',()=>{
 const {engine,document,frame}=fixture(),effects=[{op:'transfer',resource:'item_ration',from:'自己',to:'sink:consume',qty:1}];
 const result=commitPrimitives(document,effects,frame('eat-entities')),next=applyPatches(document,result.patches);
 assert.equal(next.state.inventory.item_ration.quantity,9);assert.equal(result.receipt.applied[0].from,bag(engine,'player','item_ration'));
 assert.equal(next.ledger.flows['sink:consume|item_ration|action'],1);reconciled(engine,next);
 const inferred=resolvePrimitiveTransfer(engine,document,{op:'transfer',from:'player',to:'sink:consume|item_ration|meal',qty:1});
 assert.equal(inferred.from,bag(engine,'player','item_ration'));assert.equal(inferred.to,'sink:consume|item_ration|meal');
});
test('A3 accounts: organization donations use treasury/store and open legitimate zero accounts',()=>{
 const {engine,document,org,frame}=fixture(),effects=[{op:'transfer',resource:'coin_river',from:'player',to:org,qty:5},{op:'transfer',resource:'item_ration',from:'player',to:org,qty:2}];
 const next=applyPatches(document,commitPrimitives(document,effects,frame('org-entities')).patches);
 assert.equal(next.state.records[`organization:${org}`].treasury,5);assert.equal(next.state.records[`organization:${org}`].items.item_ration,2);
 assert.equal(next.ledger.accounts[store(engine,org,'item_ration')],2);reconciled(engine,next);
 assert.equal(next.state.npcs[org],undefined);
});
test('A3 accounts: settlement resource selects treasury, granary or material stock; ordinary place rejects',()=>{
 const {engine,document}=fixture(),sid=Object.keys(document.state.settlements)[0];
 for(const [resource,expected] of [['coin_river',partyAccount(engine,document.state,sid)],['item_oats',settlementStock(engine,sid,'food')],['item_wood',settlementStock(engine,sid,'wood')]]){
  assert.equal(resolvePrimitiveTransfer(engine,document,{op:'transfer',from:'player',to:sid,resource,qty:1}).to,expected);
 }
 assert.throws(()=>resolvePrimitiveTransfer(engine,document,{op:'transfer',from:'player',to:'bld_hw_qingdeng',resource:'coin_river',qty:1}),e=>e.code==='E-TRANSFER-ACCOUNT'&&/账户/.test(e.message));
 assert.throws(()=>resolvePrimitiveTransfer(engine,document,{op:'transfer',from:'player',to:sid,resource:'item_ration',qty:1}),e=>e.code==='E-TRANSFER-ACCOUNT'&&/公仓/.test(e.message));
});
test('A3 accounts: actor aliases use npc-state mapping; explicit purposes survive normalization',()=>{
 const {engine,document,npc}=fixture(),boss='boss_a3_accounts';engine.world.bosses.push({id:boss,actor:npc});
 const effect={op:'transfer',from:boss,to:'player|coin_river|escrow',qty:1};
 const normalized=resolvePrimitiveTransfer(engine,document,effect);
 assert.equal(normalized.from,partyAccount(engine,document.state,npc));assert.equal(normalized.to,effect.to);
 assert.equal(resolvePrimitiveTransfer(engine,document,{op:'transfer',from:'self',to:'player',resource:'coin_river',qty:1},{actor:npc}).from,partyAccount(engine,document.state,npc));
});
test('A3 accounts: settlement deposits and authorized withdrawals preserve treasury, material stock and nonmanaged grain lots',()=>{
 const {engine,document,frame}=fixture(),sid=Object.keys(document.state.settlements)[0];
 delete document.state.records[`agriculture:${sid}`];
 document.holdings.locations[sid]={at:document.state.location,mode:'place',since:document.state.minute};
 document.state.inventory.item_oats={quantity:5};document.state.inventory.item_wood={quantity:5};
 document.ledger=openLedger(engine,document);
 const effects=['coin_river','item_oats','item_wood'].map(resource=>({op:'transfer',from:'player',to:sid,resource,qty:2}));
 const next=applyPatches(document,commitPrimitives(document,effects,frame('settlement-deposit')).patches);
 assert.equal(next.state.settlements[sid].treasury,document.state.settlements[sid].treasury+2);
 assert.equal(next.state.settlements[sid].food,document.state.settlements[sid].food+2);assert.equal(next.state.settlements[sid].wood,document.state.settlements[sid].wood+2);reconciled(engine,next);
 const withdrawals=effects.map(effect=>({...effect,from:sid,to:'player',qty:1})),f=createRuntimePrimitiveFrame(engine,next,{eventId:'settlement-withdraw',source:{kind:'open',id:'test:transfer'}});
 assert.throws(()=>commitPrimitives(next,withdrawals,f),{code:'E-AUTHORITY'});
 next.state.records['authorization:a3-test']={category:'authorization',grantee:'player',grantor:sid,action:'transfer'};
 const after=applyPatches(next,commitPrimitives(next,withdrawals,f).patches);reconciled(engine,after);
 assert.equal(after.state.inventory.item_oats.quantity,4);assert.equal(after.state.inventory.item_wood.quantity,4);
});
test('A3 accounts: faction stock donations use shared assets and retain a single spendable treasury',()=>{
 const {engine,document,frame}=fixture(),faction=engine.world.factions.find(f=>!document.state.settlements[f.id]).id;
 document.holdings.locations[faction]={at:document.state.location,mode:'place',since:document.state.minute};
 const effects=[{op:'transfer',resource:'coin_river',from:'player',to:faction,qty:2},{op:'transfer',resource:'item_ration',from:'player',to:faction,qty:1}];
 const next=applyPatches(document,commitPrimitives(document,effects,frame('faction-deposit')).patches);
 assert.equal(next.ledger.accounts[partyAccount(engine,next.state,faction)],document.ledger.accounts[partyAccount(engine,document.state,faction)]+2);
 assert.equal(next.state.records[`faction-assets:${faction}`].items.item_ration,(document.state.records[`faction-assets:${faction}`]?.items.item_ration??engine.byId.get(faction)?.resources?.items?.item_ration??0)+1);reconciled(engine,next);
});
test('A3 accounts: managed granary and remote recipient reject atomically with specific reasons',()=>{
 const {engine,document,npc,frame}=fixture(),sid=Object.keys(document.state.settlements)[0];
 // D05 5.5: a field producer includes its real crop inventory/cohorts. Use
 // the native new-character granary, retaining the batch-protocol rejection.
 assert.equal(document.state.records[`agriculture:${sid}`].mode,'managed');
 document.holdings.locations[sid]={at:document.state.location,mode:'place',since:document.state.minute};
 document.state.inventory.item_oats={quantity:5};document.ledger=openLedger(engine,document);
 // Keep a real existing destination account so the batch protocol is the reason.
 document.ledger.accounts[settlementStock(engine,sid,'food')]??=0;
 const before=structuredClone(document);
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',resource:'item_oats',from:'player',to:sid,qty:1}],frame('managed-grain')),e=>e.code==='E-TRANSFER-PROJECTION'&&/批次/.test(e.message));assert.deepEqual(document,before);
 document.state.npcs[npc].location='loc_remote';document.holdings.locations[npc]={at:'loc_remote',mode:'place',since:document.state.minute};
 const remote=structuredClone(document);
 assert.throws(()=>commitPrimitives(document,[{op:'transfer',resource:'coin_river',from:'player',to:npc,qty:1}],frame('remote-cash')),{code:'E-TRANSFER-REACH'});assert.deepEqual(document,remote);
});
test('A3 accounts: unknown/missing resource, foreign source, source mint, protected purposes and atomic shortage still reject',()=>{
 const {engine,document,npc,frame}=fixture(),before=structuredClone(document),cash={op:'transfer',from:'player',to:npc,resource:'coin_river',qty:1};
 for(const [effect,code] of [[{...cash,resource:undefined},'E-TRANSFER-RESOURCE'],[{...cash,to:'npc_missing'},'E-TRANSFER-ACCOUNT'],[{...cash,from:'src:genesis'},'E-TRANSFER-ENDPOINT'],[{...cash,from:'player|coin_river|purse',to:`${npc}|item_ration|inventory`},'E-TRANSFER-ENDPOINT'],[{...cash,qty:101},'E-TRANSFER-BALANCE']]){
  assert.throws(()=>commitPrimitives(document,[effect],frame(`reject-${code}`)),{code});assert.deepEqual(document,before);
 }
 // K6 (abc65508/76365571, legality is a consequence): taking from a present person's purse without consent
 // physically happens and is committed as theft with that person as victim; reaching a purse that is
 // elsewhere still refuses physically and leaves nothing.
 {const out=commitPrimitives(document,[{...cash,from:npc,to:'player'}],frame('foreign-source')),after=applyPatches(document,out.patches);assert.deepEqual(document,before);
  assert.equal(out.receipt.applied.length,1);assert.equal(after.state.player.coins,101);
  const offense=out.receipt.consequences.find(c=>c.type==='offense'),row=after.state.records[offense?.record];
  assert.equal(offense?.offense,'theft');assert.equal(offense.victim,npc);assert.equal(row.sourceEvent,'foreign-source');assert.equal(row.offender,'player');assert.deepEqual(row.stolen,{coins:1});reconciled(engine,after);
  const here=document.state.npcs[npc].location;document.state.npcs[npc].location='loc_bs';const away=structuredClone(document);
  assert.throws(()=>commitPrimitives(document,[{...cash,from:npc,to:'player'}],frame('foreign-remote')),{code:'E-TRANSFER-REACH'});assert.deepEqual(document,away);document.state.npcs[npc].location=here;}
 const escrow=accountKey('player','coin_river','escrow');document.ledger.accounts[escrow]=1;
 assert.throws(()=>commitPrimitives(document,[{...cash,from:escrow}],frame('protected')),{code:'E-TRANSFER-PURPOSE'});
 delete document.ledger.accounts[escrow];
 assert.throws(()=>commitPrimitives(document,[{...cash,qty:60},{...cash,qty:60}],frame('atomic-shortage')),{code:'E-TRANSFER-BALANCE'});assert.deepEqual(document,before);
});
test('A3 accounts: registered action preview and contested commit resolve entity endpoints before adjudication',async()=>{
 const {engine,document,npc}=fixture(),action={id:'test:entity-payment',slots:[],cost:{owner:'primitives'},outcomes:[{op:'transfer',resource:'coin_river',from:'player',to:npc,qty:3}]};
 engine.actionRegistry={actions:[action],byId:new Map([[action.id,action]]),errors:[]};
 const input={tool:'world_act',eventId:'native-entity-payment',args:{action:action.id,slots:{}}},before=structuredClone(document);
 const preview=await engine.previewAction(document,input);assert.equal(preview.receipt.applied[0].from,partyAccount(engine,document.state,'player'));assert.deepEqual(document,before);
 const result=await engine.reduce(document,input),next=applyPatches(document,result.patches);
 assert.equal(result.result.receipt.status,'committed');assert.equal(next.state.player.coins,97);reconciled(engine,next);
 const again=await engine.reduce(next,input);assert.deepEqual(again.patches,[]);
});
test('A3 accounts: public proposal with self and bare sink reaches bounds without malformed-account errors',async()=>{
 const {engine,document}=fixture(),before=structuredClone(document),input={tool:'world_propose',eventId:'public-entity-transfer',args:{intent:'把一份干粮中的物质消耗掉xyzzy',effects:[{op:'transfer',from:'self',to:'sink:consume',resource:'item_ration',qty:1}]}};
 const preview=await engine.previewAction(document,input);assert.equal(preview.receipt.applied[0].from,bag(engine,'player','item_ration'));assert.deepEqual(document,before);
 const result=await engine.reduce(document,input),next=applyPatches(document,result.patches);
 assert.equal(next.state.inventory.item_ration.quantity,9);reconciled(engine,next);assert.equal(result.result.receipt.status,'committed');
});
