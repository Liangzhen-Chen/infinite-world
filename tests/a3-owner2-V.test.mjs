import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {personTeaching,personCareer} from '../server-plugin/entity-view.mjs';
import {initializePersonCapabilities,knowsKnowledge} from '../server-plugin/education-state.mjs';
import {initializeRecipeDuration,currentServiceQuotes,recordServiceQuote,conditionalTradeQuote} from '../server-plugin/workstation-services.mjs';
import {ownedRestBed,registerOwnedRestBed} from '../server-plugin/facility-state.mjs';
import {consent,validConsentTerms} from '../server-plugin/action-consent.mjs';
import {primitiveRuntime} from '../server-plugin/primitives-runtime.mjs';
import {createRoutingContext,routeAction} from '../server-plugin/action-router.mjs';
import {readBodyState} from '../server-plugin/primitives-body.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const row=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`));
const load=setup=>applyIntentSetup(engine,engine.createCharacter(seed,{},'a3-v'),setup);
const fixture=n=>load(row(n).setup);
const act=async(document,action,slots,id)=>{
 const out=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId:id});
 return {document:applyPatches(document,out.patches),result:out.result};
};
function balanced(before,after){
 const r=reconcile(engine,after);for(const k of ['mismatches','drift','audit'])assert.deepEqual(r[k],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}

test('V2: explicit recipe duration persists, affects production clock and preserves world catalog',async()=>{
 const f=fixture(204);assert.deepEqual(f.setupUnmet,[]);
 const scoped=engine.scoped(f.document),original=world.recipes.find(r=>r.id==='recipe_bake_flatbread').minutes;
 assert.equal(scoped.byId.get('recipe_bake_flatbread').minutes,60);
 const out=await act(f.document,'core:craft.manufacture',{recipe:'recipe_bake_flatbread'},'v-recipe');
 assert.equal(out.document.state.minute-f.document.state.minute,60);
 assert.equal(world.recipes.find(r=>r.id==='recipe_bake_flatbread').minutes,original);
 balanced(f.document,out.document);
 for(const minutes of [-1,0,1.5,43201])assert.throws(()=>initializeRecipeDuration(engine.primitiveDraft(f.document),engine,{id:'recipe_bake_flatbread',minutes,source:'native-test'},{origin:'initial',eventId:'bad'}));
 assert.throws(()=>initializeRecipeDuration(engine.primitiveDraft(f.document),engine,{id:'missing',minutes:60,source:'native-test'},{origin:'initial',eventId:'bad'}));
});

test('V3: initial teaching qualification keeps the same person and confers no profession or consent',()=>{
 const f=fixture(206);assert.deepEqual(f.setupUnmet,[]);
 const scoped=engine.scoped(f.document),person='npc_hw_ayan';
 assert.equal(personTeaching(scoped,f.document.state,person,'skill_life_1_core'),true);
 assert.equal(knowsKnowledge(scoped,f.document.state,person,'skill_life_1_core'),true);
 assert.deepEqual(personCareer(scoped,f.document.state,person).value.roles,personCareer(engine,f.document.state,person).value.roles);
 assert.equal(f.document.state.skills.skill_life_1_core,undefined);
 const noAgreement=load({location:'bld_hw_mill',present:[person],minute:600,abilitiesByActor:{[person]:{teaches:['skill_life_1_core']}}});
 assert.deepEqual(noAgreement.setupUnmet,[]);
 assert.equal(consent({engine:engine.scoped(noAgreement.document),document:noAgreement.document},person,'player','teach',{purpose:'skill_life_1_core',until:620}).allowed,false);
 for(const values of [{teaches:['missing']},{serviceCapability:{arbitrary:true}},{teaches:'skill_life_1_core'}])assert.throws(()=>initializePersonCapabilities(engine.primitiveDraft(f.document),engine,person,values,{origin:'initial',eventId:'invalid'}));
 assert.throws(()=>initializePersonCapabilities(engine.primitiveDraft(f.document),engine,person,{teaches:['skill_life_1_core']},{origin:'proposal',eventId:'forged'}));
});

test('V3: a three-day agreed course charges once and grants knowledge only after the third lesson',async()=>{
 let f=fixture(206);assert.deepEqual(f.setupUnmet,[]);const before=f.document;
 const slots={source:'npc_hw_ayan',entity:'skill_life_1_core',kind:'skill'};
 let out=await act(f.document,'core:learn',slots,'v-course-1');
 assert.equal(out.document.state.player.coins,50);assert.equal(out.document.state.skills.skill_life_1_core,undefined);
 const early=await act(out.document,'core:learn',slots,'v-course-early');
 assert.equal(early.result.receipt.status,'rejected');assert.deepEqual(early.document,out.document);
 for(let day=1;day<3;day++){
  const until=600+day*1440,wait=await act(out.document,'core:time',{minutes:until-out.document.state.minute},`v-wait-${day}`);
  out=await act(wait.document,'core:learn',slots,`v-course-${day+1}`);
 }
 assert.equal(out.document.state.player.coins,50);
 const course=Object.values(out.document.state.records).find(r=>r.category==='teaching_course');
 assert.equal(course.teacher,'npc_hw_ayan');assert.equal(course.lessons.length,3);assert.ok(course.completedAt>=3480);
 // 06 §6.5: finishing the course still uses its real final learning check.
 // A failed check must not manufacture knowledge or charge the fee again.
 assert.equal(Boolean(out.document.state.skills.skill_life_1_core),course.lessons.at(-1).success);
 balanced(before,out.document);
});

test('V4: owned room bed supplies room recovery without a lodging lease',async()=>{
 const f=fixture(209);assert.deepEqual(f.setupUnmet,[]);
 assert.ok(ownedRestBed(engine,f.document));
 assert.equal(Object.values(f.document.holdings.rows).some(h=>h.kind==='lodges'&&h.holder==='player'),false);
 const out=await act(f.document,'core:time.sleep',{until:{dayOffset:1,hour:6,minute:0}},'v-owned-sleep');
 assert.equal(out.document.state.minute,1800);assert.equal(readBodyState(engine,out.document,'player','stamina').value,100);assert.equal(readBodyState(engine,out.document,'player','satiety').value,92);
 assert.equal(out.document.state.player.coins,0);balanced(f.document,out.document);
 const bed=ownedRestBed(engine,f.document);
 assert.throws(()=>registerOwnedRestBed(engine.primitiveDraft(f.document),engine,{...bed,id:'missing'},{origin:'initial',eventId:'forged'}));
 const bad=row(209).setup;delete bad.objects[0].owner;assert.ok(load(bad).setupUnmet.some(r=>r.item==='objects[0].available'));
});

test('V1: conditional quotes retain source terms and reject forged, expired and unknown batches',()=>{
 const f=fixture(186),q=currentServiceQuotes(f.document.state)[0];
 assert.ok(q);assert.deepEqual(q.conditions,{turbidityAtMost:15});
 assert.equal(validConsentTerms({resource:'item_water',quantity:2,totalCoins:4,maxTurbidity:15}),true);
 assert.equal(validConsentTerms({maxTurbidity:101}),false);
 assert.throws(()=>recordServiceQuote(engine.primitiveDraft(f.document),engine,{...q,id:'forged',totalCoins:400}));
 assert.throws(()=>conditionalTradeQuote(engine.primitiveDraft(f.document),engine.scoped(f.document),{seller:'player',buyer:'npc_hw_linsui',item:'item_water',quantity:2}),/same bound water/);
 const d=engine.primitiveDraft(f.document);d.set(['state','minute'],720);assert.deepEqual(currentServiceQuotes(d.get('state')),[]);
 // The unresolved physical/spatial premises stay visible; this card does not
 // turn them into a successful purification or transaction.
 assert.ok(f.setupUnmet.some(r=>r.item==='objects[0].contents'));
});

test('V1: two distinct native quotes form one paid meal, preserving preexisting food and accounts',async()=>{
 const setup=row(198).setup;
 // Domain positive uses an existing edible side with authored nutrition. The
 // corpus's raw mutton lacks nutrition and is separately tested as a refusal.
 for(const entry of [...setup.history,...setup.quotes,...setup.accounts])if(entry.resource==='item_mutton')entry.resource='item_bread';
 const f=load(setup);assert.deepEqual(f.setupUnmet,[]);
 const out=await act(f.document,'core:eat.order',{subject:'npc_hw_linsui',item:'item_oat_flatbread',side:'item_bread'},'v-bundle');
 assert.equal(out.document.state.player.coins,37);
 assert.equal(engine.quantity(engine.primitiveDraft(out.document),'player','item_bread'),1);
 assert.equal(out.document.state.minute-f.document.state.minute,25);
 const bundle=out.document.state.records['quote_bundle:meal:v-bundle'];
 assert.deepEqual(bundle.quotes,['a3v2_198_flatbread_quote','a3v2_198_mutton_quote']);assert.equal(bundle.totalCoins,23);
 balanced(f.document,out.document);
 const forged=row(198).setup;forged.quotes[0].totalCoins=1;assert.ok(load(forged).setupUnmet.some(r=>r.item==='quotes[0]'));
});

test('V1: conditional sale extracts only the quoted owned water units from one measured native batch',async()=>{
 const setup=row(186).setup;delete setup.positions;delete setup.abilities;delete setup.body;
 setup.objects=[{id:'feature_hw_kitchen_bucket',location:'bld_hw_qingdeng',waterLiters:2,turbidity:15,contents:[{inventoryBinding:{item:'item_water',quantity:8,mode:'same_stock'},owner:'player'}]}];
 const f=load(setup);assert.deepEqual(f.setupUnmet,[]);
 const before=structuredClone(f.document),binding=f.document.state.records['liquid_binding:feature_hw_kitchen_bucket'];
 assert.equal(binding.units.length,8);
 const out=await act(f.document,'core:trade.sell_to',{buyer:'npc_hw_linsui',item:'item_water',quantity:2},'v-water-sale');
 assert.equal(out.document.state.player.coins,4);assert.equal(out.document.state.npcs.npc_hw_linsui.coins,0);
 const remaining=binding.units.filter(id=>out.document.state.itemInstances[id].container==='feature_hw_kitchen_bucket');
 const sold=binding.units.filter(id=>out.document.state.itemInstances[id].owner==='npc_hw_linsui');
 assert.equal(remaining.length,6);assert.equal(sold.length,2);
 assert.equal(out.document.state.records['physical_feature:feature_hw_kitchen_bucket'].state.waterMl,1500);
 assert.deepEqual(currentServiceQuotes(out.document.state),[]);balanced(before,out.document);
 const bad=structuredClone(setup);bad.objects[0].turbidity=16;const dirty=load(bad);
 const failed=await act(dirty.document,'core:trade.sell_to',{buyer:'npc_hw_linsui',item:'item_water',quantity:2},'v-water-dirty');
 assert.equal(failed.result.receipt.status,'rejected');assert.deepEqual(failed.document,dirty.document);
});

test('V1/V3: native quoted repair keeps the original catalog unit and exact maximum',async()=>{
 const setup=row(205).setup,definition=world.items.find(item=>item.id==='item_iron_sword');assert.ok(definition);
 setup.itemInstances=[{id:'a3v2_205_sword',template:'thing',kind:'item',item:definition.id,owner:'player',location:'bld_hw_mill',carriedBy:'player',condition:20}];
 const f=load(setup);assert.deepEqual(f.setupUnmet,[]);const instance=f.bindings.a3v2_205_sword;
 const before=f.document.state.itemInstances[instance],out=await act(f.document,'core:craft.repair',{item:definition.id,instance,maker:'npc_hw_ayan',repairPlan:'a3v2_205_quote'},'v-repair');
 assert.equal(out.document.state.player.coins,55);assert.equal(out.document.state.minute-f.document.state.minute,60);
 const after=out.document.state.itemInstances[instance];assert.equal(after.durability,after.maxDurability);assert.equal(after.maxDurability,before.maxDurability);assert.equal(after.item,before.item);assert.equal(after.id,before.id);
 balanced(f.document,out.document);
 const wrong=await act(f.document,'core:craft.repair',{item:definition.id,instance,maker:'npc_hw_linsui',repairPlan:'a3v2_205_quote'},'v-repair-forged');
 assert.equal(wrong.result.receipt.status,'rejected');assert.deepEqual(wrong.document,f.document);
});

test('V1: actual corpus meal routes to the registered consumer and never grants access to unrelated accounts',async()=>{
 const f=fixture(198),proposal=row(198).proposal;
 for(const effect of proposal.effects)for(const key of ['from','to','target'])if(effect[key]==='self')effect[key]='player';
 const routed=routeAction(proposal,primitiveRuntime.registry(engine),createRoutingContext(engine,f.document));
 assert.equal(routed.routed,'core:eat.order');
 const refused=await act(f.document,'core:eat.order',{subject:'npc_hw_linsui',item:'item_oat_flatbread',side:'item_mutton'},'v-raw-mutton');
 assert.equal(refused.result.receipt.status,'rejected');assert.deepEqual(refused.document,f.document);
 const bad={tool:'world_propose',eventId:'v-stolen-coins',args:{intent:'拿走别人的钱',effects:[{op:'transfer',resource:'coin',from:'npc_hw_linsui',to:'self',qty:10}]}};
 await assert.rejects(()=>engine.reduce(f.document,bad),/账户|authority|consent/);
 assert.equal(f.document.state.player.coins,60);
});

test('V1-V4: saved premises and native action replay survive storage reopening',async t=>{
 const root=await fs.mkdtemp(path.join(process.cwd(),'.a3v-storage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(d,input,options)=>engine.reduce(d,input,options),store=new CampaignStorage(root,{reducer});
 for(const n of [204,206,209,186,205]){
  const f=fixture(n),id=`v-${n}`;await store.create({id,worldVersion:world.version,document:f.document});
  if(n===209)await store.transact(id,{id:'sleep',anchor:'sleep',input:{tool:'world_act',args:{action:'core:time.sleep',slots:{until:{dayOffset:1,hour:6,minute:0}}},eventId:'v-storage-sleep'}},reducer);
  const before=await store.load(id),after=await new CampaignStorage(root,{reducer}).load(id);
  assert.deepEqual(after.document,before.document);
  if(n===204)assert.equal(engine.scoped(after.document).byId.get('recipe_bake_flatbread').minutes,60);
  if(n===206)assert.equal(personTeaching(engine.scoped(after.document),after.document.state,'npc_hw_ayan','skill_life_1_core'),true);
  if(n===209)assert.ok(ownedRestBed(engine,after.document));
  if([186,205].includes(n))assert.equal(currentServiceQuotes(after.document.state).length,1);
 }
});
