// 06 §§6.3/6.5/6.9.1: current native state supplies identity, custody and
// authority. Narrative setup notes grant none of those capabilities.
import test from 'node:test';
import assert from 'node:assert/strict';
import {assertActionRejected} from './helpers/action-refusal.mjs';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup,scoreRows} from '../tools/a3-score.mjs';
import {openHoldings,declareHoldingWriter,createEntity,setLocation,holdingSet} from '../server-plugin/holdings.mjs';
import {reactToMark} from '../server-plugin/mark-reactions.mjs';
import {createRoutingContext,resolveProposalEntities} from '../server-plugin/action-router.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r5.json','utf8'));
declareHoldingWriter('a3-native-state-test',{entities:['item','building'],locations:true,kinds:['*']});
function fixture(suffix){
 const row=corpus.find(r=>r.id.endsWith(suffix)),engine=new WorldEngine(structuredClone(world)),initial=engine.createCharacter(seed,{},'a3-r9-native');
 initial.holdings=openHoldings(engine,initial);
 const {document,setupUnmet}=applyIntentSetup(engine,initial,row?.setup??{});
 assert.deepEqual(setupUnmet,[]);
 return {engine,document,row};
}

test('A3 native: live share identifies its organization without making it a physical target',async()=>{
 const {engine,document,row}=fixture('106'),before=structuredClone(document),context=createRoutingContext(engine,document);
 assert.equal(context.resolve('faction_saltboat').value,null);
 const resolved=resolveProposalEntities(row.proposal,context);
 assert.deepEqual(resolved.ambiguities,[]);assert.equal(resolved.proposal.effects[0].subject,'faction_saltboat');
 const input={tool:'world_propose',eventId:'r9-no-issuance',args:row.proposal};
 // Issuance authority is unchanged; both public entries now return its refusal.
 for(const method of ['previewAction','reduce'])await assertActionRejected(engine[method](document,input),/权能|权限|同意/,'E-AUTHORITY');
 assert.throws(()=>resolveProposalEntities({intent:'xyzzy',effects:[{op:'vital',target:'faction_saltboat',delta:-1}]},context),{code:'E-OPEN-ENTITY'});
 assert.deepEqual(document,before);
});

test('A3 native: custody refuses ordinary departure on its actual regime while permitting speech',async()=>{
 const {engine,document,row}=fixture('091'),before=structuredClone(document);
 // The native custody regime remains enforced; no departure is applied.
 for(const method of ['previewAction','reduce'])await assertActionRejected(engine[method](document,{tool:'world_propose',eventId:'r9-custody-walk',args:row.proposal}),/羁押|拘禁/,'E-CAPACITY');
 const target='npc_bs_032_1',speech={intent:'xyzzy',target,effects:[{op:'emit',actor:'self',target,verb:'tell',payload:{version:'我记得的天气',source:'self'},visibility:'present'}]};
 const out=await engine.reduce(document,{tool:'world_propose',eventId:'r9-custody-talk',args:speech});
 assert.ok(out.result.receipt.applied.some(e=>e.op==='emit'&&e.target===target));
 assert.deepEqual(document,before);
});

test('A3 native: current locations resolve carried items, moved features and people without duplicating their old sites',()=>{
 const {engine,document}=fixture('079'),draft=engine.primitiveDraft(document),writer='a3-native-state-test';
 createEntity(draft,{id:'item_r9_shoe',kind:'item',facts:{name:'唯一破底旧鞋',condition:0},source:'test',writer});
 setLocation(draft,{entity:'item_r9_shoe',at:'player',mode:'carried',writer,engine});
 setLocation(draft,{entity:'feature_hw_kitchen_bucket',at:document.state.location,mode:'place',writer,engine});
 const person='npc_hw_linsui';
 setLocation(draft,{entity:person,at:document.state.location,mode:'place',writer,engine});
 const present=applyPatches(document,draft.patches),context=createRoutingContext(engine,present);
 assert.equal(context.resolve('唯一破底旧鞋','item').value,'item_r9_shoe');
 assert.equal(context.resolve('feature_hw_kitchen_bucket').value,'feature_hw_kitchen_bucket');
 assert.equal(context.resolve(person).value,person);
 const proposal={intent:'留个纪念',effects:[{op:'transfer',from:'self',to:'sink:consume',resource:'唯一破底旧鞋',qty:1}]};
 assert.equal(resolveProposalEntities(proposal,context).proposal.effects[0].resource,'item_r9_shoe');
 const away=structuredClone(present);away.state.location='bld_hw_qingdeng';
 assert.equal(createRoutingContext(engine,away).resolve('feature_hw_kitchen_bucket').value,null);
 assert.equal(createRoutingContext(engine,away).resolve(person).value,null);
});

test('A3 native: known buildings can be destinations without becoming perceivable; private discoveries stay private',()=>{
 const {engine,document}=fixture('006'),id='bld_bs_watch';
 document.state.discoveries[id]={minute:document.state.minute,source:'亲历'};
 const context=createRoutingContext(engine,document);
 assert.equal(context.resolveDestination(id).value,id);assert.equal(context.resolve(id).value,null);
 document.state.discoveries[id].private=true;
 assert.equal(createRoutingContext(engine,document).resolveDestination(id).value,null);
});

test('A3 native: a real stone building still needs a matching repair program, tools and work',()=>{
 const {engine,document,row}=fixture('088'),draft=engine.primitiveDraft(document),writer='a3-native-state-test';
 createEntity(draft,{id:'building_r9_gate',kind:'building',facts:{name:row.proposal.effects[0].entity,condition:40},source:'test',writer});
 setLocation(draft,{entity:'building_r9_gate',at:document.state.location,mode:'place',writer,engine});
 const present=applyPatches(document,draft.patches),before=structuredClone(present);
 assert.throws(()=>prepareOpenAction(engine,present,row.proposal),error=>{
  assert.equal(error.code,'E-OPEN-REPAIR');assert.match(error.message,/技能.*工具.*材料.*工时/);return true;
 });
 assert.deepEqual(present,before);
 // Missing material/target descriptions remain questions, never invented stock.
 assert.equal(prepareOpenAction(engine,document,row.proposal).status,'needs_entities');
});

test('A3 native: an already owned and tamed herbivore routes feeding and reports the native hunger reduction',async()=>{
 const row=corpus.find(r=>r.id.endsWith('009'));
 const report=await scoreRows([row],{world:structuredClone(world),seed});
 const actual=report.results[0].actual;
 assert.equal(actual.route,'core:pet.feed');assert.equal(actual.committed,true);assert.equal(actual.fallback,false);
 const satiety=actual.signatureEffects.find(e=>e.op==='vital'&&e.type==='body:satiety');
 assert.ok(satiety?.delta>0);assert.equal(satiety.target,'a3v2_009_goat');
 assert.ok(actual.signatureEffects.some(e=>e.op==='transfer'&&e.resource==='item_oats'&&e.qty===1));
});

test('A3 native: unresolved mark materials retain clarification and offer a separately confirmed trace',async()=>{
 for(const suffix of ['117','120']){
  const {engine,document,row}=fixture(suffix),before=structuredClone(document);
  const prepared=prepareOpenAction(engine,document,row.proposal);
  assert.equal(prepared.status,'needs_entities');assert.ok(prepared.ambiguities.length);
  assert.equal(prepared.fallback.available,true);assert.equal(prepared.fallback.action,'open:leave_mark');
  assert.match(prepared.fallback.reason,/原物件不会被消耗/);assert.deepEqual(prepared.effects,[]);assert.deepEqual(document,before);
  const out=await engine.reduce(document,{tool:'world_act',eventId:`r9-trace-${suffix}`,args:{action:prepared.fallback.action,slots:{intent:prepared.fallback.intent,form:'歌谣',tags:row.proposal.effects.find(e=>e.kind==='mark').tags}}});
  assert.ok(out.result.receipt.applied.some(e=>e.op==='create'&&e.kind==='mark'));
  assert.equal(out.result.receipt.applied.some(e=>e.op==='transfer'),false);
  let after=applyPatches(document,out.patches);
  // 06 §6.9.5: an empty site reacts on a later real perception opportunity,
  // rather than inventing a witness when the material-free trace is created.
  if(suffix==='120'){
   assert.equal(Object.values(after.state.records).some(r=>r.category==='world_event'&&r.payload?.kind==='mark_reaction'),false);
   const seen=engine.primitiveDraft(after),writer='a3-native-state-test';
   holdingSet(seen,engine,['state','npcs','npc_hw_meiling','location'],after.state.location,writer);
   setLocation(seen,{entity:'npc_hw_meiling',at:after.state.location,mode:'place',writer,engine});
   const mark=Object.values(after.state.records).find(r=>r.category==='mark'&&r.active);
   const reaction=reactToMark(seen,engine,mark,{eventId:'r9-later-observation'});
   assert.equal(reaction.triggered,true);after=applyPatches(after,seen.patches);
  }
  assert.ok(Object.values(after.state.records).some(r=>r.category==='world_event'&&r.verb==='tell'&&r.payload?.kind==='mark_reaction'));
  assert.deepEqual(document,before);
 }
});
