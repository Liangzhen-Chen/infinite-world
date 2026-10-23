import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {routeAction,createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {openLedger,auditLedger} from '../server-plugin/ledger.mjs';

const kindOf=id=>id==='player'||id==='npc_one'?'person':id==='item_one'?'item':null;
const context={actor:'player',kindOf,visible:()=>true,slotsFor:()=>({target:'npc_one'})};
const effect={op:'emit',target:'npc_one',verb:'tell'};
const action=(id,label='递交说明',effects=[effect])=>({id,label,synonyms:[],outcomes:effects});
const proposal={intent:'递交说明',effects:[effect]};

test('A3 structural: unique complete signature routes both catalog and zero-overlap wording',()=>{
 const registry={actions:[action('test:tell')]};
 const named=routeAction(proposal,registry,context);
 const novel=routeAction({...proposal,intent:'xyzzy quux'},registry,context);
 assert.equal(novel.nearest.textScore,0);assert.equal(novel.nearest.score,.6);
 assert.equal(named.routed,'test:tell');assert.equal(novel.routed,named.routed);
 assert.deepEqual(novel.nearest.slots,named.nearest.slots);
 assert.match(novel.reason,/按.*递交说明.*结算/);
});

test('A3 structural: strong catalog wording cannot overcome contradictory effects',()=>{
 const result=routeAction({...proposal,effects:[{op:'vital',target:'npc_one',type:'blunt',delta:-1}]},{actions:[action('test:tell')]},context);
 assert.equal(result.nearest.textScore,1);assert.equal(result.nearest.signatureScore,0);
 assert.equal(result.routed,null);assert.equal(result.needsSlots,null);
});

test('A3 structural: partial signatures retain the original weighted threshold',()=>{
 const registry={actions:[action('test:partial','递交说明',[effect,{op:'status',target:'npc_one',status:'busy'}])]};
 const named=routeAction(proposal,registry,context),novel=routeAction({...proposal,intent:'xyzzy'},registry,context);
 assert.equal(named.nearest.signatureScore,.5);assert.equal(named.nearest.score,.7);assert.equal(named.routed,'test:partial');
 assert.equal(novel.nearest.score,.3);assert.equal(novel.routed,null);
});

test('A3 structural: effect-free bare intents keep their existing text threshold',()=>{
 const registry={actions:[action('test:bare')]},native={...context,bareIntent:()=>true};
 const named=routeAction({intent:'递交说明',effects:[]},registry,native);
 const novel=routeAction({intent:'xyzzy',effects:[]},registry,native);
 assert.equal(named.routed,'test:bare');assert.equal(novel.routed,null);
 assert.equal(novel.nearest.signatureScore,1);assert.equal(novel.nearest.textScore,0);
});

test('A3 structural: unique exact program precedes a higher weighted partial candidate',()=>{
 const effects=[effect,{op:'status',target:'npc_one',status:'busy'},{op:'emit',target:'npc_one',verb:'request'}];
 const exact=action('test:exact','甲乙',effects),partial=action('test:partial','xyzzy',[...effects,{op:'status',target:'npc_one',status:'ready'}]);
 const result=routeAction({intent:'xyzzy',effects},{actions:[partial,exact]},context);
 assert.equal(result.routed,exact.id);assert.equal(result.candidates[0].id,exact.id);assert.equal(result.nearest.id,exact.id);
 assert.ok(result.candidates[1].score>result.nearest.score);
});

test('A3 structural: target kinds, resources and actor-relative transfer direction remain distinct',()=>{
 const tell=action('test:person'),item=action('test:item','xyzzy',[{...effect,target:'item_one'}]);
 assert.equal(routeAction({...proposal,intent:'xyzzy'},{actions:[tell,item]},context).routed,tell.id);
 const gift={op:'transfer',resource:'coin',from:'player',to:'npc_one',qty:1};
 const outgoing=action('test:out','给予',[gift]);
 const incoming=action('test:in','xyzzy',[{...gift,from:'npc_one',to:'player'}]);
 const ore=action('test:ore','xyzzy',[{...gift,resource:'item_ore'}]);
 const registry={actions:[outgoing,incoming,ore]};
 const result=routeAction({intent:'xyzzy',effects:[gift]},registry,context);
 assert.equal(result.routed,outgoing.id);assert.equal(result.nearest.textScore,0);
 assert.equal(result.candidates.find(c=>c.id===incoming.id).signatureScore,0);
 assert.equal(result.candidates.find(c=>c.id===ore.id).signatureScore,0);
 assert.equal(routeAction({intent:'给予',effects:incoming.outcomes},registry,context).routed,incoming.id);
});

test('A3 structural: wording distinguishes greeting from asking within identical signatures',()=>{
 const a=action('test:greet','打招呼'),z=action('test:ask','询问'),registry={actions:[a,z]};
 // a3r-route2: explicit wording selects an exact candidate; it no longer
 // merely sorts alternatives that the player already distinguished.
 for(const intent of ['打招呼','询问']){
  const result=routeAction({...proposal,intent},registry,context);
  const expected=intent==='打招呼'?a:z;
  assert.equal(result.routed,expected.id);assert.equal(result.needsSlots,null);
  assert.equal(result.candidates[0].id,expected.id);assert.match(result.reason,/按文字区分为/);
  assert.deepEqual(result,routeAction({...proposal,intent},{actions:[z,a]},context));
 }
});

test('A3 structural: tied or absent wording leaves alternatives for the bounded open path',()=>{
 const a=action('test:greet','打招呼'),z=action('test:ask','询问'),registry={actions:[a,z]};
 for(const intent of ['打招呼或询问','xyzzy']){
  const result=routeAction({...proposal,intent},registry,context);
  // a3r-route3: preserve the tie and both alternatives without inventing a
  // missing action slot that would block an otherwise complete proposal.
  assert.equal(result.routed,null);assert.equal(result.needsSlots,null);
  assert.ok(result.candidates.every(c=>/也可按/.test(c.reason)));
  assert.deepEqual(new Set(result.candidates.map(c=>c.id)),new Set([a.id,z.id]));
  assert.match(result.reason,/开放路径/);
  assert.equal(result.candidates[0].textScore,result.candidates[1].textScore);
  assert.deepEqual(result,routeAction({...proposal,intent},{actions:[z,a]},context));
 }
});

test('A3 structural: both matching wordings require a 0.2 lead to disambiguate',()=>{
 for(const sharedCount of [1,30]){
  const shared=Array.from({length:sharedCount},(_,i)=>`topic${i}`).join(' ');
  const a=action('test:a',`${shared} alpha`),b=action('test:b',`${shared} beta`);
  const result=routeAction({...proposal,intent:a.label},{actions:[a,b]},context);
  const [first,second]=result.candidates;
  assert.equal(first.textScore,1);assert.ok(second.textScore>0);
  const lead=first.textScore-second.textScore;assert.ok(lead>0);
  if(sharedCount===1){assert.ok(lead>=.2);assert.equal(result.routed,a.id);assert.match(result.reason,/按文字区分为/);}
  // a3r-route3: a weak lead retains open execution, rather than clarification.
  else {assert.ok(lead<.2);assert.equal(result.routed,null);assert.equal(result.needsSlots,null);}
 }
});

test('A3 structural: wording for a contradictory action cannot resolve exact alternatives',()=>{
 const a=action('test:greet','打招呼'),z=action('test:ask','询问');
 const attack=action('test:attack','攻击',[{op:'vital',target:'npc_one',type:'blunt',delta:-1}]);
 const result=routeAction({...proposal,intent:'攻击'},{actions:[attack,a,z]},context);
 // a3r-route3: contradictory wording still cannot select that program; the
 // complete effects remain available to the bounded open path.
 assert.equal(result.routed,null);assert.equal(result.needsSlots,null);
 assert.deepEqual(new Set(result.candidates.map(c=>c.id)),new Set([a.id,z.id]));
});

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
function fixture(){
 const engine=new WorldEngine(structuredClone(world)),document=engine.createCharacter(seed,{},'a3-structural');
 document.state.location='bld_hw_qingdeng';document.state.minute=600;
 Object.assign(document.state.npcs.npc_hw_linsui,{location:document.state.location,scheduleTravel:null,cognitionTravel:null});
 document.ledger=openLedger(engine,document);
 return {engine,document};
}

test('A3 structural: actual registered purchase has identical settlement for unrelated wording',async()=>{
 const {engine,document}=fixture(),target='npc_hw_linsui',before=structuredClone(document);
 const effects=[{op:'transfer',resource:'coin',from:'self',to:target,qty:4},{op:'transfer',resource:'item_bread',from:target,to:'self',qty:2}];
 const run=intent=>engine.reduce(document,{tool:'world_propose',eventId:'same-structural-purchase',args:{intent,target,effects}});
 const named=await run('买两份面饼'),novel=await run('xyzzy quux');
 assert.equal(named.result.receipt.routed,'core:trade.buy');assert.equal(novel.result.receipt.routed,named.result.receipt.routed);
 assert.deepEqual(novel.result.receipt.applied,named.result.receipt.applied);
 assert.deepEqual(novel.result.receipt.cost,named.result.receipt.cost);
 const after=applyPatches(document,novel.patches),other=applyPatches(document,named.patches);
 // Audit records retain the player's actual words; settlement is identical.
 assert.deepEqual(after.state.inventory,other.state.inventory);assert.deepEqual(after.state.player,other.state.player);
 assert.equal(after.state.minute,other.state.minute);assert.deepEqual(after.ledger,other.ledger);
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(document,before);
});

test('A3 structural: native repayment and withdrawal distinguish opposite money directions',()=>{
 const {engine,document}=fixture(),target='npc_hw_linsui',native=createRoutingContext(engine,document);
 const actions=engine.world.actionDefinitions.actions.filter(a=>a.id==='core:trade.repay'||a.call?.tool==='world_trade'&&a.call.operation==='withdraw');
 assert.equal(actions.length,2);
 for(const incoming of [false,true]){
  const effects=[{op:'transfer',resource:'coin',from:incoming?target:'player',to:incoming?'player':target,qty:5},{op:'obligation.settle',id:'debt',amount:5}];
  const result=routeAction({intent:'xyzzy',target,effects},{actions},native);
  const expected=actions.find(a=>incoming?a.call.operation==='withdraw':a.id==='core:trade.repay');
  assert.equal(result.nearest.id,expected.id);assert.equal(result.nearest.signatureScore,1);
  // a3r-route3 may return only executable alternatives on the open path.
  // Test the opposite program directly so the direction guard stays explicit.
  const opposite=routeAction({intent:'xyzzy',target,effects},{actions:actions.filter(a=>a.id!==expected.id)},native);
  assert.equal(opposite.nearest.signatureScore,0);assert.equal(opposite.routed,null);
 }
});

test('A3 structural: ambiguous tell executes openly with alternatives and native bounds',async()=>{
 const {engine,document}=fixture();
 const emitted={op:'emit',target:'player',verb:'tell',visibility:'private',payload:{text:'先观察周围'}};
 const program={...action('test:one','甲乙',[emitted]),cost:{time:5}};
 engine.world.actionDefinitions={format:1,actions:[program,{...structuredClone(program),id:'test:two',label:'丙丁',cost:{time:9}}]};
 const args={intent:'xyzzy',effects:[emitted]},before=structuredClone(document);
 // a3r-route3 replaces action-choice clarification with actual open execution.
 // Keep preview immutability and verify the registered cost floor, candidates,
 // actual emitted event, ledger integrity and replay's no-duplicate guarantee.
 const plan=prepareOpenAction(engine,document,args);
 assert.equal(plan.status,'open');assert.equal(plan.routed,null);assert.equal(plan.needsSlots,null);
 assert.deepEqual(plan.candidates.map(c=>c.id).sort(),['test:one','test:two']);
 const preview=await engine.previewAction(document,{tool:'world_propose',eventId:'ambiguous-through-engine',args});
 assert.equal(preview.receipt.status,'preview');assert.equal(preview.receipt.routing.status,'open');assert.ok(preview.receipt.cost.time>=9);
 assert.ok(preview.receipt.routing.candidates.every(c=>/也可按/.test(c.reason)));assert.deepEqual(document,before);
 const input={tool:'world_propose',eventId:'ambiguous-through-engine',args},result=await engine.reduce(document,input),after=applyPatches(document,result.patches);
 assert.equal(result.result.receipt.status,'committed');assert.equal(result.result.receipt.applied.filter(e=>e.op==='emit').length,1);
 assert.ok(Object.values(after.state.records).some(row=>row.category==='world_event'&&row.payload?.text===emitted.payload.text));
 assert.deepEqual(auditLedger(after.ledger),[]);assert.deepEqual(document,before);
 assert.deepEqual((await engine.reduce(after,input)).patches,[]);
});

test('A3 structural: required proposal information precedes stronger wording',()=>{
 const ready={...action('test:ready','甲乙'),slots:[{name:'target',required:true}]};
 const missing={...action('test:missing','xyzzy'),slots:[{name:'terms',required:true}]};
 const result=routeAction({...proposal,intent:'xyzzy'},{actions:[missing,ready]},context);
 assert.equal(result.routed,ready.id);assert.equal(result.candidates[0].id,ready.id);
 // Name the protocol here: its absent terms are genuinely requested input,
 // rather than an unnamed program's requirements imposed on a generic act.
 const absent=routeAction({...proposal,intent:'xyzzy'},{actions:[missing,{...missing,id:'test:other'}]},context);
 assert.equal(absent.routed,null);assert.deepEqual(absent.needsSlots,{action:null,missing:['terms']});
});

test('A3 structural: a generic act does not inherit an unnamed program missing slots',()=>{
 const sourced={...action('test:sourced','甲乙'),slots:[{name:'source',required:true}]};
 const registry={actions:[sourced]};
 const generic=routeAction({...proposal,intent:'xyzzy'},registry,context);
 assert.equal(generic.routed,null);assert.equal(generic.needsSlots,null);assert.equal(generic.candidates[0].missing[0],'source');
 assert.match(generic.candidates[0].reason,/也可按/);
 const named=routeAction({...proposal,intent:'甲乙'},registry,context);
 assert.deepEqual(named.needsSlots,{action:sourced.id,missing:['source']});
});

test('A3 structural: practice uses an explicitly supplied duration, not an invented default',()=>{
 const {engine,document}=fixture(),native=createRoutingContext(engine,document);
 const args={intent:'xyzzy',means:{skill:'skill_light'},effects:[{op:'learn',entity:'player',subject:'skill_light',learningSource:'practice',amount:1.2}]};
 const registry={actions:engine.world.actionDefinitions.actions};
 for(const minutes of [undefined,60,120]){
  const means={...args.means,...(minutes===undefined?{}:{minutes})};
  const result=routeAction({...args,means},registry,native);
  assert.equal(result.routed,minutes===undefined?'core:practice':'core:practice.session');
  assert.match(result.reason,/按结构区分为/);
  if(minutes!==undefined)assert.equal(result.nearest.slots.minutes,minutes);
 }
});

test('A3 structural: hidden person stays unresolvable by id, name and alias',()=>{
 const {engine,document}=fixture(),id='npc_hw_linsui';
 document.state.npcs[id].hidden=true;
 const native=createRoutingContext(engine,document),row=engine.byId.get(id);
 for(const reference of [id,row.name,...row.aliases??[]]){
  assert.equal(native.resolve(reference).value,null);assert.deepEqual(native.resolve(reference).candidates,[]);
  const args={intent:'xyzzy',effects:[{...effect,target:reference}]};
  if(reference===id)assert.throws(()=>resolveProposalEntities(args,native),{code:'E-OPEN-ENTITY'});
  else {const unresolved=resolveProposalEntities(args,native);assert.equal(unresolved.ambiguities.length,1);assert.deepEqual(unresolved.ambiguities[0].candidates,[]);}
 }
});

test('A3 structural: dousing consumption derives volume and footprint from item hydration and weight',()=>{
 const {engine,document}=fixture(),native=createRoutingContext(engine,document);
 const program=engine.world.actionDefinitions.actions.find(a=>a.call?.tool==='world_field'&&a.call.operation==='environment_douse_fire');
 assert.ok(program);const field=program.signature.factFields[0];
 for(const id of ['item_water','item_milk']){
  const item=engine.byId.get(id),args={effects:[{op:'transfer',resource:id,from:'player',to:'sink:consume',qty:2},{op:'fact.set',entity:'player',field,value:0}]};
  const slots=native.slotsFor(program,args);
  assert.equal(slots.millilitres,2*item.weight*1000);
  assert.ok(native.nativeSignatures(program,slots,args).flat().some(token=>JSON.parse(token)[2]===id));
 }
 const dry={effects:[{op:'transfer',resource:'item_bread',from:'player',to:'sink:consume',qty:2},{op:'fact.set',entity:'player',field,value:0}]};
 const slots=native.slotsFor(program,dry);assert.equal(slots.millilitres,undefined);assert.deepEqual(native.nativeSignatures(program,slots,dry),[]);
});
