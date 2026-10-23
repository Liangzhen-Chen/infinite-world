import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {routeAction,createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {prepareOpenAction,executeRoutedOpenAction} from '../server-plugin/open-actions.mjs';
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

test('A3 structural: tied or absent wording leaves identical signatures for clarification',()=>{
 const a=action('test:greet','打招呼'),z=action('test:ask','询问'),registry={actions:[a,z]};
 for(const intent of ['打招呼或询问','xyzzy']){
  const result=routeAction({...proposal,intent},registry,context);
  assert.equal(result.routed,null);assert.deepEqual(result.needsSlots,{action:null,missing:['action']});
  assert.deepEqual(new Set(result.candidates.map(c=>c.id)),new Set([a.id,z.id]));
  assert.match(result.reason,/请选择/);
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
  else {assert.ok(lead<.2);assert.equal(result.routed,null);assert.deepEqual(result.needsSlots,{action:null,missing:['action']});}
 }
});

test('A3 structural: wording for a contradictory action cannot resolve exact alternatives',()=>{
 const a=action('test:greet','打招呼'),z=action('test:ask','询问');
 const attack=action('test:attack','攻击',[{op:'vital',target:'npc_one',type:'blunt',delta:-1}]);
 const result=routeAction({...proposal,intent:'攻击'},{actions:[attack,a,z]},context);
 assert.equal(result.routed,null);assert.deepEqual(result.needsSlots,{action:null,missing:['action']});
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
  assert.equal(result.candidates.find(c=>c.id!==expected.id).signatureScore,0);
 }
});

test('A3 structural: ambiguous registered programs return clarification with no state writes',async()=>{
 const {engine,document}=fixture();
 const program=engine.world.actionDefinitions.actions.find(a=>a.id==='core:practice');
 engine.world.actionDefinitions={format:1,actions:[program,{...structuredClone(program),id:'test:other_practice',label:'另一种练习'}]};
 const args={intent:'练习',means:{skill:'skill_light'},effects:[{op:'learn',entity:'self',subject:'skill_light',learningSource:'practice',amount:5}]},before=structuredClone(document);
 const plan=prepareOpenAction(engine,document,args);
 assert.equal(plan.status,'needs_slots');assert.equal(plan.routed,null);assert.deepEqual(plan.effects,[]);
 assert.deepEqual(plan.candidates.map(c=>c.id).sort(),['core:practice','test:other_practice']);
 const result=await executeRoutedOpenAction(engine,document,{eventId:'ambiguous-program',args});
 assert.equal(result.receipt.status,'not_submitted');assert.deepEqual(result.receipt.applied,[]);
 assert.equal(Object.hasOwn(result,'patches'),false);assert.deepEqual(document,before);
 const preview=await engine.previewAction(document,{tool:'world_propose',eventId:'ambiguous-through-engine',args});
 assert.equal(preview.receipt.status,'not_submitted');assert.deepEqual(preview.receipt.applied,[]);assert.equal(preview.prepared.status,'needs_slots');
 await assert.rejects(engine.reduce(document,{tool:'world_propose',eventId:'ambiguous-through-engine',args}),{code:'E-OPEN-NOT-ROUTED'});
 assert.deepEqual(document,before);
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
