import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {currentControllers,resolveAuthoritySelector,grantLimitedPermit,limitedPermit,consumeLimitedPermit} from '../server-plugin/action-authority.mjs';
import {recordHistoricalEvent,worldEvent} from '../server-plugin/world-events.mjs';
import {declareHoldingWriter,openHolding,closeHolding,aliveHoldings} from '../server-plugin/holdings.mjs';
import {executeProtocolPrimitive} from '../server-plugin/transition.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const initial=engine.initialFromLegacy(JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8')),'jia2-test');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const save=x=>JSON.parse(JSON.stringify(x)),context=document=>({engine,document});
const load=n=>applyIntentSetup(engine,initial,corpus.find(r=>r.id===`A3V2-${n}`).setup);
function write(document,fn){const d=engine.primitiveDraft(document);fn(d);return {document:applyPatches(document,d.patches),patches:d.patches};}
declareHoldingWriter('jia2-test',{kinds:['owns','operates']});
function grant(document,{subject='feature_hw_pool',issuer='npc_hw_chenbai',scope='destroy',quantityLiters,id='jia2-grant'}={}){
 return write(document,d=>{
  const minute=d.get('state','minute');
  recordHistoricalEvent(d,engine,{id,verb:'permission_granted',actor:issuer,minute,source:{kind:'corpus_premise',row:'jia2-test'},payload:{subject,to:'player',scope}});
  grantLimitedPermit(d,context(d.document),{id,actor:issuer,holder:'player',subject,scope,fromMinute:minute,toMinute:minute+60,sourceEvent:`world_event:${id}`,...(quantityLiters===undefined?{}:{quantityLiters})});
 });
}

test('C: current collective head, host and temple principal derive from existing facts without creating agents',()=>{
 for(const [n,id] of [['013','npc_hw_xuling'],['016','npc_bs_076_3'],['019','npc_hw_chenbai'],['069','npc_hw_chenbai'],['079','npc_hw_chenbai'],['102','npc_bs_076_3']]){
  const out=load(n),row=corpus.find(r=>r.id===`A3V2-${n}`),permit=row.setup.permits[0];
  assert.deepEqual(out.setupUnmet,[],n);
  const restored=save(out.document),c=context(restored);
  assert.equal(resolveAuthoritySelector(c,permit.issuer),id,n);
  assert.equal(worldEvent(restored.state,restored.state.records[`limited_permit:${permit.id}`].sourceEvent).actor,id,n);
  assert.equal(limitedPermit(c,'player',permit.subject,permit.scope,{quantityLiters:permit.quantityLiters??0}).issuer,id,n);
  // Derivation must not pull the offscreen principal into the measured scene.
  if(!row.setup.present.includes(id)&&!initial.state.npcs[id])assert.equal(restored.state.npcs[id],undefined,n);
 }
 assert.deepEqual(currentControllers(context(load('013').document),'bld_hw_riverhome',{ownerOnly:true}),[]);
 assert.throws(()=>resolveAuthoritySelector(context(initial),{role:'existing_legal_town_head',of:'loc_bs'}),{code:'E-AUTHORITY-SELECTOR'});
 const dead=save(load('016').document);dead.state.records['transition:npc_bs_076_3']={entity:'npc_bs_076_3',gone:true,basis:'death'};
 assert.equal(limitedPermit(context(dead),'player','bld_bs_still_temple','practice'),null);
});

test('C: missing ownership is not inferred from proximity, a teacher, or a building containing an object',()=>{
 for(const n of ['008','012','014','018','066','072','085','087','088','120']){
  const out=load(n);
  assert.ok(out.setupUnmet.some(x=>x.item.startsWith('history')||x.item.startsWith('permits')),n);
 }
 const out=load('085');
 for(const alias of ['a3v2_085_bottle_left','a3v2_085_bottle_right']){
  assert.deepEqual(currentControllers(context(save(out.document)),out.bindings[alias],{ownerOnly:true}),[]);
 }
 assert.throws(()=>resolveAuthoritySelector(context(initial),{role:'authorized_manager',of:'site_w5_well_camp',holder:'npc_hw_linsui'}),{code:'E-AUTHORITY-SELECTOR'});
});

test('B/C: an actual primitive consumes a collective representative permit and replays without repeating destruction',()=>{
 const base=applyIntentSetup(engine,initial,{minute:600,location:'loc_hw_dock',itemInstances:[{id:'jia2_public_crate',template:'thing',kind:'item',owner:'player',carriedBy:'player',location:'loc_hw_dock',quantity:1}]});
 assert.deepEqual(base.setupUnmet,[]);
 const subject=base.bindings.jia2_public_crate;
 const publicTitle=write(base.document,d=>executeProtocolPrimitive(d,engine,{op:'holding.transfer',id:aliveHoldings(d,{kind:'owns',subject})[0].id,holder:'loc_hw'},{eventId:'jia2-public-title'})).document;
 const out=grant(publicTitle,{subject}),document=save(out.document);
 assert.deepEqual(save(applyPatches(publicTitle,out.patches)),document);
 assert.equal(currentControllers(context(document),subject)[0],'npc_hw_chenbai');
 assert.throws(()=>grant(publicTitle,{subject,issuer:'npc_hw_linsui'}),{code:'E-PERMIT-AUTHORITY'});
 assert.throws(()=>grant(publicTitle,{subject,quantityLiters:-1}),{code:'E-PERMIT'});
 assert.equal(limitedPermit(context(document),'player',subject,'transfer'),null);
 const transferred=write(document,d=>executeProtocolPrimitive(d,engine,{op:'holding.transfer',id:aliveHoldings(d,{kind:'owns',subject})[0].id,holder:'npc_hw_linsui'},{eventId:'jia2-title-changed'})).document;
 assert.equal(limitedPermit(context(save(transferred)),'player',subject,'destroy'),null);
 assert.deepEqual(currentControllers(context(transferred),subject),['npc_hw_linsui']);
 const effects=[{op:'destroy',entity:subject}],frame=createRuntimePrimitiveFrame(engine,document,{eventId:'jia2-destroy',source:{kind:'catalog',id:'test:jia2-permit'}});
 const executed=commitPrimitives(document,effects,frame),restored=save(applyPatches(document,executed.patches));
 assert.equal(executed.receipt.applied[0].actedAs.kind,'permit');
 assert.ok(restored.holdings.protocol.entities[subject].gone);
 assert.equal(commitPrimitives(restored,effects,frame).receipt.duplicate,true);
});

test('B/C: issuer incapacity, source mismatch and quantity limits still reject after saving',()=>{
 const base=load('069').document,out=grant(base,{quantityLiters:2}),document=save(out.document),c=context(document);
 assert.equal(limitedPermit(c,'player','feature_hw_pool','destroy',{quantityLiters:2}).id,'jia2-grant');
 const used=write(document,d=>consumeLimitedPermit(d,context(d.document),'jia2-grant',1));
 assert.equal(limitedPermit(context(save(used.document)),'player','feature_hw_pool','destroy',{quantityLiters:2}),null);
 const unconscious=save(document);unconscious.state.npcs.npc_hw_chenbai.capacity='none';
 assert.equal(limitedPermit(context(unconscious),'player','feature_hw_pool','destroy',{quantityLiters:1}),null);
 assert.throws(()=>write(base,d=>grantLimitedPermit(d,context(d.document),{id:'forged',actor:'npc_hw_chenbai',holder:'player',subject:'feature_hw_pool',scope:'destroy',fromMinute:600,toMinute:660,sourceEvent:'missing'})),{code:'E-PERMIT-SOURCE'});
});

test('C: stored operators override catalog hosts and closing the last operator cannot revive a host',()=>{
 const base=load('013').document;let id;
 const out=write(base,d=>{id=openHolding(d,{kind:'operates',holder:'npc_hw_linsui',subject:'bld_hw_riverhome',source:'jia2-test:operator',writer:'jia2-test',engine});});
 assert.deepEqual(currentControllers(context(save(out.document)),'bld_hw_riverhome'),['npc_hw_linsui']);
 const closed=write(out.document,d=>closeHolding(d,{id,reason:'vacated',writer:'jia2-test'}));
 assert.deepEqual(currentControllers(context(save(closed.document)),'bld_hw_riverhome'),[]);
 const overridden=save(base);overridden.state.buildings.bld_hw_riverhome={owner:null};
 assert.deepEqual(currentControllers(context(overridden),'bld_hw_riverhome'),[]);
});
