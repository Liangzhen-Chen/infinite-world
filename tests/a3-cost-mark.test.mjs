import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger,accountKey} from '../server-plugin/ledger.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-cost-mark');
 document.state.player.coins=20;document.state.inventory.item_charcoal={quantity:3};
 const observer='npc_hw_linsui';
 Object.assign(document.state.npcs[observer],{location:document.state.location,activity:'闲坐',status:'正常',scheduleTravel:null,cognitionTravel:null});
 document.ledger=openLedger(engine,document);
 return {engine,document,observer};
}
const consume={op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey('sink:consume','coin_river','action'),qty:1};
function install(engine,outcomes){
 const action={id:'test:cost_mark',label:'花钱留下话语',narration:'test.cost_mark',slots:[],synonyms:[],visibility:{catalog:'here'},cost:{owner:'primitives',time:1,resources:[{resource:'coin_river',qty:1}]},outcomes};
 engine.world.actionDefinitions={format:1,actions:[action]};return action;
}
const tell={op:'emit',verb:'tell',visibility:'public',payload:{text:'hello'}};
function checkBooks(engine,document){
 assert.deepEqual(auditLedger(document.ledger),[]);
 assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});
}

test('A3 costs: native cost indices, sources and roles survive preview, commit and replay',()=>{
 const {engine,document}=fixture(),action=install(engine,[tell]),input={eventId:'cost-derived',args:{action:action.id,slots:{}}},before=structuredClone(document);
 action.cost.resources.push({resource:'coin_river',qty:1});
 const preview=primitiveRuntime.execute(engine,document,input,{preview:true});assert.deepEqual(document,before);
 const out=primitiveRuntime.execute(engine,document,input),after=applyPatches(document,out.patches),cost=out.receipt.cost.resources[0];
 assert.equal(cost.role,'additional_cost');assert.deepEqual(cost.source,{kind:'catalog',id:action.id});
 assert.equal(cost.index,0);assert.equal(cost.costIndex,0);
 assert.deepEqual(out.receipt.cost.resources.map(row=>row.index),[0,1]);
 for(const row of out.receipt.cost.resources)for(const [key,value] of Object.entries(row))assert.deepEqual(out.receipt.applied[row.index][key],value);
 assert.deepEqual(out.receipt.applied,preview.receipt.applied);assert.equal(after.state.player.coins,18);checkBooks(engine,after);
 assert.equal(primitiveRuntime.execute(engine,JSON.parse(JSON.stringify(after)),input).receipt.duplicate,true);
});

test('A3 costs: requested consumption is distinct from an identical additional fee',()=>{
 for(const outcomeConsumes of [false,true]){
  const {engine,document}=fixture(),action=install(engine,outcomeConsumes?[consume,tell]:[tell]);
  const requested=[consume,tell],openProposal={proposal:{intent:'付钱并说话',effects:requested},prepared:{signature:['transfer','emit'],candidates:[]}};
  const out=primitiveRuntime.execute(engine,document,{eventId:`cost-request-${outcomeConsumes}`,args:{action:action.id,slots:{}}},{openProposal});
  const after=applyPatches(document,out.patches),cost=out.receipt.cost.resources[0];
  assert.equal(cost.role,outcomeConsumes?'additional_cost':'requested_consumption');
  assert.equal(cost.requestIndex,outcomeConsumes?undefined:0);
  assert.equal(after.state.player.coins,outcomeConsumes?18:19);checkBooks(engine,after);
 }
});

function markInput(document,id='mark-described'){
 return {tool:'world_propose',eventId:id,args:{intent:'画一张提醒来客的怪画',effects:[
  {op:'transfer',resource:'item_charcoal',from:'self',to:'sink:consume',qty:1},
  {op:'create',kind:'mark',facts:{intent:'画一张提醒来客的怪画',form:'画有箭头的提醒图',location:document.state.location,author:'self'},tags:['mark:warning','mark:art'],materials:[{resource:'item_charcoal',qty:1}]}
 ]}};
}

test('A3 mark: descriptive form consumes once, creates a real mark and notifies real observers',async()=>{
 const {engine,document,observer}=fixture(),input=markInput(document),before=structuredClone(document);
 const preview=await engine.previewAction(document,input);assert.deepEqual(document,before);
 assert.equal(preview.receipt.status,'preview');
 const out=await engine.reduce(document,input),receipt=out.result.receipt,after=applyPatches(document,out.patches);
 const effect=receipt.applied.find(e=>e.op==='create'),id=effect.result.entity;
 assert.equal(receipt.status,'committed');assert.equal(receipt.fallback.originalIntentFulfilled,false);
 assert.equal(after.state.inventory.item_charcoal.quantity,2);
 assert.equal(after.holdings.entities[id].kind,'mark');assert.equal(after.holdings.locations[id].at,document.state.location);
 assert.equal(after.state.created[id].form,input.args.effects[1].facts.form);
 assert.deepEqual(after.state.created[id].tags,['mark:warning','mark:art']);
 assert.ok(effect.result.reactions.some(r=>r.observer===observer));
 for(const reaction of effect.result.reactions){
  const event=after.state.records[`world_event:${reaction.event}`];assert.equal(event.payload.kind,'mark_reaction');assert.equal(event.payload.mark,id);assert.equal(event.actor,reaction.observer);
 }
 assert.equal(receipt.cost.resources.length,0);checkBooks(engine,after);
 const consumed=receipt.applied.find(e=>e.op==='transfer');
 assert.equal(consumed.role,'requested_consumption');assert.equal(consumed.requestIndex,0);
 assert.deepEqual(consumed.source,receipt.source);assert.equal(consumed.appliedEvent,input.eventId);
 assert.equal(effect.role,'outcome');assert.deepEqual(effect.source,receipt.source);
 const again=await engine.reduce(JSON.parse(JSON.stringify(after)),input);assert.equal(again.result.receipt.duplicate,true);assert.deepEqual(again.patches,[]);
});

test('A3 costs: a different requested quantity cannot relabel a derived fee',()=>{
 const {engine,document}=fixture(),action=install(engine,[tell]);
 const out=primitiveRuntime.execute(engine,document,{eventId:'cost-different-quantity',args:{action:action.id,slots:{}}},{openProposal:{proposal:{effects:[{...consume,qty:2}]},prepared:{}}});
 const fee=out.receipt.cost.resources[0];
 assert.equal(fee.role,'additional_cost');assert.equal(fee.requestIndex,undefined);
 assert.equal(fee.qty,1);assert.equal(applyPatches(document,out.patches).state.player.coins,19);
 checkBooks(engine,applyPatches(document,out.patches));
});

test('A3 mark: declarations cannot fake consumption, authors, locations or numeric effects',async()=>{
 const mutations=[
  input=>{input.args.effects.shift();},
  input=>{input.args.effects[1].materials[0].qty=2;},
  input=>{input.args.effects[1].facts.author='npc_hw_linsui';},
  input=>{input.args.effects[1].facts.location='loc_not_here';},
  input=>{input.args.effects[1].facts.coins=100;},
  input=>{input.args.effects[1].facts.carrier='item_not_real';},
  input=>{input.args.effects[0].qty=4;input.args.effects[1].materials[0].qty=4;}
 ];
 for(const mutate of mutations){
  const {engine,document}=fixture(),before=structuredClone(document),input=markInput(document);mutate(input);
  await assert.rejects(engine.reduce(document,input),error=>error.code?.startsWith('E-'));
  assert.deepEqual(document,before);checkBooks(engine,document);
 }
});

test('A3 mark: confirmation rechecks capability, inventory and place restrictions after preview',async()=>{
 const changes=[
  document=>{document.state.player.status='昏迷';},
  document=>{document.state.inventory.item_charcoal.quantity=0;document.ledger.accounts[accountKey('player','item_charcoal','inventory')]=0;},
  (document,engine)=>{engine.byId.get(document.state.location).primitiveLimits={create:false};}
 ];
 for(const change of changes){
  const {engine,document}=fixture(),input=markInput(document);
  assert.equal((await engine.previewAction(document,input)).receipt.status,'preview');
  change(document,engine);const before=structuredClone(document);
  await assert.rejects(engine.reduce(document,input),error=>error.code?.startsWith('E-'));
  assert.deepEqual(document,before);
 }
});
