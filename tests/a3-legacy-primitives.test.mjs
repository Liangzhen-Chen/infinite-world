import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {withLedger,accountKey,auditLedger,transfer,declareLedgerWriter} from '../server-plugin/ledger.mjs';
import {openHoldings,openHolding,closeHolding,declareHoldingWriter,updateEntity} from '../server-plugin/holdings.mjs';
import {loadActionRegistry} from '../server-plugin/action-registry.mjs';
import {executeOpenSequence} from '../server-plugin/open-actions.mjs';
import {readBodyState} from '../server-plugin/primitives-body.mjs';
import {legacyLedgerEffects,adaptLegacyExecution} from '../server-plugin/legacy-primitives.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import '../server-plugin/primitives-runtime.mjs';

const original=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const SELLER='npc_hw_linsui',INN='bld_hw_qingdeng',BREAD='item_oat_flatbread',TEACHER='npc_hw_luqing',SKILL='skill_a3_receipt_lesson';
function fixture(){
 const world=structuredClone(original);
 for(const n of world.npcs){n.tier='fixture';delete n.schedule;}
 for(const key of ['weather','settlementTrade','worldClock','hazardClock','factionClock'])delete world.rules[key];
 for(const f of world.factions)delete f.clock;
 const seller=world.npcs.find(n=>n.id===SELLER);
 seller.schedule={default:[{start:0,end:1440,location:INN,activity:'营业',services:['trade']}]};
 world.items.find(r=>r.id===BREAD).basePrice=8;
 const tutor=world.npcs.find(n=>n.id===TEACHER);tutor.profileStatus='full';tutor.services.push(SKILL);
 world.skills.push({id:SKILL,name:'回执工艺',attribute:'智力',stage:0,profession:null,prerequisites:[],learnMinutes:120,learnFee:12});
 const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'a3-legacy-receipt');
 document.state.location=INN;document.state.player.coins=100;
 Object.assign(document.state.npcs[SELLER],{location:INN,status:'正常',activity:'营业',goals:{}});
 document.state.npcs[SELLER].inventory[BREAD]={quantity:5,quality:'良',durability:100,weight:.2};
 Object.assign(document.state.npcs[TEACHER],{location:INN,status:'正常',activity:'休息',trust:80,goals:{},skills:{[SKILL]:500}});
 const now=document.state.minute;
 document.state.player.body={stamina:{value:40,asOf:now,activity:'rest'},fatigue:{value:40,asOf:now,activity:'rest'},satiety:{value:30,asOf:now,activity:'rest'},hydration:{value:70,asOf:now,activity:'rest'}};
 const booked=withLedger(engine,document).document;booked.holdings=openHoldings(engine,booked);
 return {engine,document:booked};
}
const call=(action,slots,eventId)=>({tool:'world_act',eventId,args:{action,slots}});
function books(engine,document){assert.deepEqual(auditLedger(document.ledger),[]);assert.deepEqual(reconcile(engine,document),{mismatches:[],lots:[],drift:[],audit:[]});}
function postings(before,after,receipt){
 const delta=new Map();
 for(const e of receipt.applied.filter(e=>e.op==='transfer')){
  delta.set(e.from,(delta.get(e.from)??0)-e.qty);delta.set(e.to,(delta.get(e.to)??0)+e.qty);
 }
 for(const [key,value] of delta){
  if(key.startsWith('sink:'))assert.equal((after.ledger.flows[key]??0)-(before.ledger.flows[key]??0),value);
  else if(key.startsWith('src:'))assert.equal((after.ledger.flows[key]??0)-(before.ledger.flows[key]??0),-value);
  else assert.equal((after.ledger.accounts[key]??0)-(before.ledger.accounts[key]??0),value);
 }
}

test('A3 legacy receipt: buy preview/commit/reload use actual two-sided postings, with no second payment',async()=>{
 const {engine,document}=fixture(),input=call('core:trade.buy',{seller:SELLER,item:BREAD,quantity:2},'legacy-buy'),before=structuredClone(document);
 const preview=await engine.previewAction(document,input);assert.deepEqual(document,before);
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=out.result.receipt;
 assert.deepEqual(preview.receipt.applied,r.applied);assert.equal(r.status,'committed');
 const money=r.applied.find(e=>e.resource==='coin_river'),goods=r.applied.find(e=>e.resource===BREAD);
 assert.equal(money.from,accountKey('player','coin_river','purse'));assert.equal(money.to,accountKey(SELLER,'coin_river','purse'));assert.equal(money.qty,16);
 assert.equal(goods.from,accountKey(SELLER,BREAD,'inventory'));assert.equal(goods.to,accountKey('player',BREAD,'inventory'));assert.equal(goods.qty,2);
 r.applied.forEach((e,index)=>{assert.equal(e.index,index);assert.deepEqual(e.source,{kind:'catalog',id:'core:trade.buy'});assert.equal(e.role,'outcome');});
 postings(document,after,r);books(engine,after);
 assert.deepEqual(after.state.records['primitive:legacy-buy'].receipt,r);
 const retry=await engine.reduce(JSON.parse(JSON.stringify(after)),input);assert.deepEqual(retry.patches,[]);assert.equal(retry.result.receipt.duplicate,true);assert.equal(retry.result.duplicate,true);
 await assert.rejects(engine.reduce(after,call('core:trade.buy',{seller:SELLER,item:BREAD,quantity:1},input.eventId)),{code:'E-PRIMITIVE-DUPLICATE'});
 const poor=structuredClone(document);poor.state.player.coins=0;poor.ledger.accounts[money.from]=0;const snapshot=structuredClone(poor);
 await assert.rejects(engine.reduce(poor,{...input,eventId:'legacy-poor'}));assert.deepEqual(poor,snapshot);
});

test('A3 legacy receipt: ordering and eating retains purchase and consumption even when bag net change is zero',async()=>{
 const {engine,document}=fixture(),out=await engine.reduce(document,call('core:eat.order',{subject:SELLER,item:BREAD},'legacy-meal')),after=applyPatches(document,out.patches),r=out.result.receipt;
 const item=r.applied.filter(e=>e.op==='transfer'&&e.resource===BREAD);assert.equal(item.length,2);
 assert.equal(item[0].qty,1);assert.equal(item[1].qty,1);assert.equal(item[0].to,item[1].from);assert.match(item[1].to,/^sink:consume\|/);
 assert.equal(engine.quantity(engine.primitiveDraft(after),'player',BREAD),engine.quantity(engine.primitiveDraft(document),'player',BREAD));
 const nutrition=r.applied.find(e=>e.op==='vital'&&e.need==='satiety');assert.ok(nutrition.delta>0);
 assert.equal(nutrition.delta,out.result.nutrition.satiety);
 assert.deepEqual(nutrition.result.after,readBodyState(engine,after,'player','satiety'));postings(document,after,r);books(engine,after);
});

test('A3 legacy receipt: sleep/rest expose effective body deltas and exact elapsed time without touching preview input',async()=>{
 for(const action of ['core:time.sleep','core:time.rest']){
  const {engine,document}=fixture(),slots=action==='core:time.sleep'?{until:{dayOffset:0,hour:11}}:{minutes:60},input=call(action,slots,`legacy-${action}`),before=structuredClone(document),preview=await engine.previewAction(document,input);
  assert.deepEqual(document,before);const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=out.result.receipt;
  assert.deepEqual(r.applied,preview.receipt.applied);assert.equal(r.applied.find(e=>e.op==='time').minutes,after.state.minute-document.state.minute);
  for(const need of ['stamina','fatigue']){
   const e=r.applied.find(e=>e.op==='vital'&&e.need===need);
   if(action==='core:time.rest'){assert.deepEqual(readBodyState(engine,after,'player',need),readBodyState(engine,document,'player',need));assert.equal(e,undefined);continue;}
   assert.ok(e,`${action}: ${need}`);
   assert.equal(e.target,'player');assert.equal(e.type,`body:${need}`);assert.deepEqual(e.result.before,readBodyState(engine,document,'player',need));assert.deepEqual(e.result.after,readBodyState(engine,after,'player',need));
  }
  books(engine,after);
 }
});

test('A3 legacy receipt: teacher fee has A3-A provenance, lesson outcome equals actual learned state and refusal is atomic',async()=>{
 const {engine,document}=fixture(),input=call('core:learn',{entity:SKILL,source:TEACHER},'legacy-learn'),out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=out.result.receipt;
 const cost=r.cost.resources[0],effect=r.applied[cost.index];assert.equal(cost.role,'additional_cost');assert.equal(cost.costIndex,0);assert.deepEqual(cost.source,r.source);assert.deepEqual(cost,effect);
 const learn=r.applied.find(e=>e.op==='learn'&&e.subject===SKILL);assert.equal(learn.learningSource,TEACHER);assert.equal(learn.mode,'teacher');assert.equal(learn.signatureKind,'person');assert.equal(learn.result.after.success,Boolean(after.state.skills[SKILL]));
 assert.deepEqual(learn.result.after,after.state.learning[input.eventId]);postings(document,after,r);books(engine,after);
 engine.world.npcs.find(n=>n.id===TEACHER).redLines=['teach'];const before=structuredClone(document);
 await assert.rejects(engine.reduce(document,{...input,eventId:'legacy-refused'}));assert.deepEqual(document,before);
});

test('A3 legacy receipt: an explicitly requested teacher payment keeps the actual cost index and source',async()=>{
 const {engine,document}=fixture(),input=call('core:learn',{entity:SKILL,source:TEACHER},'legacy-requested-fee');
 const fee={op:'transfer',from:accountKey('player','coin_river','purse'),to:accountKey(TEACHER,'coin_river','purse'),qty:12};
 const out=await engine.reduce(document,input,{openProposal:{proposal:{effects:[fee]},prepared:{}}}),r=out.result.receipt,cost=r.cost.resources[0];
 assert.equal(cost.role,'requested_consumption');assert.equal(cost.requestIndex,0);assert.equal(cost.costIndex,0);assert.equal(cost.index,0);assert.deepEqual(cost,r.applied[cost.index]);
 assert.equal(applyPatches(document,out.patches).state.player.coins,88);
});

test('A3 legacy receipt: dialogue reports only the saved actual utterance, and raw registered entry shares the adapter',async()=>{
 const {engine,document}=fixture();engine.world.actionDefinitions={format:1,actions:loadActionRegistry().actions};
 const out=await engine.reduce(document,{tool:'world_remember',eventId:'legacy-greet',args:{subject:SELLER,...engine.world.actionDefinitions.actions.find(a=>a.id==='core:dialogue.greet').call.fixed}}),after=applyPatches(document,out.patches),r=out.result.receipt;
 const speech=r.applied.find(e=>e.op==='emit');assert.equal(speech.target,SELLER);assert.equal(speech.verb,'greet');assert.equal(speech.signatureKind,'person');assert.deepEqual(speech.result.after,after.state.dialogues[SELLER]);
 assert.equal(speech.result.after.sourceEvent,'legacy-greet');assert.equal(r.routed,'core:dialogue.greet');
});

declareLedgerWriter('legacy-receipt-test');
declareHoldingWriter('legacy-receipt-test',{kinds:['companion'],entities:['*']});
test('A3 legacy journal: equal-and-opposite transfers remain distinct; unpaired writes cannot produce a receipt',()=>{
 const {engine,document}=fixture(),d=engine.primitiveDraft(document),from=accountKey('player','coin_river','purse'),to=accountKey(SELLER,'coin_river','purse');
 transfer(d,{from,to,amount:3,writer:'legacy-receipt-test'});transfer(d,{from:to,to:from,amount:3,writer:'legacy-receipt-test'});
 assert.deepEqual(legacyLedgerEffects(document,d.document,d.patches).map(e=>[e.from,e.to,e.qty]),[[from,to,3],[to,from,3]]);
 assert.equal(d.document.ledger.accounts[from],document.ledger.accounts[from]);
 const bad=engine.primitiveDraft(document);bad.set(['ledger','accounts',from],1);
 assert.throws(()=>legacyLedgerEffects(document,bad.document,bad.patches),{code:'E-LEGACY-RECONCILE'});
 const unmirrored=engine.primitiveDraft(document);transfer(unmirrored,{from,to,amount:3,writer:'legacy-receipt-test'});
 const snapshot=structuredClone(document);
 assert.throws(()=>adaptLegacyExecution(engine,document,unmirrored,{action:{id:'test:unmirrored'},tool:'trade',args:{seller:SELLER},eventId:'legacy-unmirrored',result:{}}),{code:'E-LEGACY-RECONCILE'});
 assert.deepEqual(document,snapshot);assert.equal(unmirrored.document.state.records['primitive:legacy-unmirrored'],undefined);
});

test('A3 legacy protocol adapter: actual holding open/close and entity facts retain canonical IDs and values',()=>{
 const {engine,document}=fixture(),d=engine.primitiveDraft(document);
 const id=openHolding(d,{kind:'companion',holder:'player',subject:SELLER,terms:{},writer:'legacy-receipt-test',eventId:'legacy-protocol',engine});
 closeHolding(d,{id,reason:'expired',writer:'legacy-receipt-test',eventId:'legacy-protocol'});
 const entity=Object.values(document.holdings.entities).find(row=>row.goneAt===undefined);
 updateEntity(d,{id:entity.id,facts:{condition:23},writer:'legacy-receipt-test',eventId:'legacy-protocol'});
 const r=adaptLegacyExecution(engine,document,d,{action:{id:'test:old-protocol'},tool:'test',args:{},eventId:'legacy-protocol',result:{}});
 const effects=r.applied.filter(e=>e.holding===id);assert.deepEqual(effects.map(e=>e.op),['holding.open','holding.close']);assert.equal(effects[0].result.after.until,undefined);assert.equal(effects[1].result.after.until,d.document.state.minute);assert.deepEqual(effects[1].result.before,effects[0].result.after);
 const fact=r.applied.find(e=>e.op==='fact.set'&&e.entity===entity.id&&e.field==='condition');assert.equal(fact.value,23);assert.equal(fact.result.after,d.document.holdings.entities[entity.id].facts.condition);
});

test('A3 legacy sequence: parent indices are unique and retain actual child provenance',async()=>{
 const {engine,document}=fixture();
 // Routing order is covered by a3-routing-order. Exercise the composition's
 // receipt contract with its actual registered steps, independent of text rank.
 const input={eventId:'legacy-sequence',args:{intent:'买一份饼并吃掉'}};
 const prepared={steps:[{action:'core:trade.buy',slots:{seller:SELLER,item:BREAD,quantity:1}},{action:'core:eat.meal',slots:{item:BREAD}}]};
 const out=await executeOpenSequence(engine,document,input,prepared),r=out.result.receipt,after=applyPatches(document,out.patches);
 assert.equal(r.steps.length,2);assert.ok(r.applied.length>=4);
 r.applied.forEach((effect,index)=>{assert.equal(effect.index,index);const child=r.steps[effect.stepIndex].applied[effect.stepEffectIndex];assert.equal(effect.appliedEvent,child.appliedEvent);assert.deepEqual(effect.source,child.source);});
 for(const cost of r.cost.resources)for(const [key,value] of Object.entries(cost))assert.deepEqual(r.applied[cost.index][key],value);
 postings(document,after,r);books(engine,after);
});

test('A3 legacy combat: absent NPC HP uses the exchange initial value, never a fabricated heal',async()=>{
 const {engine,document}=fixture();delete document.state.npcs[SELLER].hp;
 const input=call('core:combat',{target:SELLER,intent:'attack'},'legacy-combat-initial-hp'),before=structuredClone(document);
 const preview=await engine.previewAction(document,input);assert.deepEqual(document,before);
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=out.result.receipt;
 assert.deepEqual(preview.receipt.applied,r.applied);
 const vitals=out.result.vitals[SELLER],effect=r.applied.find(e=>e.op==='vital'&&e.target===SELLER&&e.need==='hp');
 assert.ok(vitals.before>0);assert.equal(vitals.after,after.state.npcs[SELLER].hp);
 assert.equal(vitals.before-vitals.after,out.result.damage);
 if(out.result.damage){assert.equal(effect.type,'harm');assert.equal(effect.delta,-out.result.damage);assert.equal(effect.result.before,vitals.before);assert.equal(effect.result.after,vitals.after);}
 else assert.equal(effect,undefined);
 assert.ok(!r.applied.some(e=>e.op==='vital'&&e.target===SELLER&&e.type==='heal'));books(engine,after);
});

test('A3 legacy obligations: adopted payment promise exposes actual parties, amount and deadline',async()=>{
 const {engine,document}=fixture(),deadline=document.state.minute+1440;
 const out=await engine.reduce(document,call('core:dialogue.promise',{promisee:SELLER,type:'付款',coins:10,deadline,content:'Pay ten coins tomorrow'},'legacy-payment-promise'));
 const after=applyPatches(document,out.patches),e=out.result.receipt.applied.find(e=>e.op==='obligation.create');
 assert.ok(e);assert.equal(e.from,'player');assert.equal(e.to,SELLER);assert.equal(e.amount,10);assert.equal(e.deadline,deadline);
 assert.deepEqual(e.result.after,after.state.obligations[e.id]);assert.equal(e.debtor,e.from);assert.equal(e.creditor,e.to);books(engine,after);
});

test('A3 legacy sequence: explicit teacher fee keeps parent request and cost provenance',async()=>{
 const {engine,document}=fixture(),fee={op:'transfer',from:'self',to:TEACHER,resource:'coin',qty:12};
 const input={eventId:'legacy-sequence-fee',args:{intent:'Learn and buy bread',effects:[fee]}};
 const prepared={steps:[{action:'core:learn',slots:{entity:SKILL,source:TEACHER}},{action:'core:trade.buy',slots:{seller:SELLER,item:BREAD,quantity:1}}]};
 const out=await executeOpenSequence(engine,document,input,prepared),r=out.result.receipt,cost=r.cost.resources[0],e=r.applied[cost.index];
 assert.equal(cost.role,'requested_consumption');assert.equal(cost.requestIndex,0);assert.equal(cost.stepIndex,0);assert.equal(cost.stepCostIndex,0);
 for(const [key,value] of Object.entries(cost))assert.deepEqual(e[key],value);
 assert.deepEqual(e.source,{kind:'catalog',id:'core:learn'});assert.equal(e.appliedEvent,r.steps[0].eventId);
 const after=applyPatches(document,out.patches);assert.equal(after.state.player.coins,80);postings(document,after,r);books(engine,after);
});
