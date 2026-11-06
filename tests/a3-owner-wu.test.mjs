import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {initializePersonLanguages,personLanguages,canReadLanguage,conversationLanguage,subjectiveView} from '../server-plugin/subjective-view.mjs';
import {initializePracticalKnowledge,knowsPracticalKnowledge,initializeDemonstration,initializeTeachingActivity,demonstrationAt,teachingAvailable,settleDemonstrations} from '../server-plugin/education-state.mjs';
import {initializeVocation,assertVocationAction} from '../server-plugin/npc-growth.mjs';
import {initialKnowledgeAction} from '../server-plugin/primitives-learning.mjs';
import {personCareer} from '../server-plugin/entity-view.mjs';
import {advocateService} from '../server-plugin/legal-representation.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {facilityView} from '../server-plugin/facility-state.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {recordLocalContact} from '../server-plugin/environment.mjs';
const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-wu');
const rows=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const context={origin:'initial',eventId:'wu-initial'};
const corpus=id=>{
 const setup=structuredClone(rows.find(r=>r.id===`A3V2-${id}`).setup);
 if(id==='099'){
  // 三.2：语言隔阂用例只需商人有足额本金，普通开局已有 200 铜。
  // 显式检查至少 100 铜，保留语言/同意边界；不用测试专用钱袋快照。
  assert.ok(initial.state.npcs.npc_hw_yanzhe.coins>=100);
  setup.accounts=setup.accounts.filter(a=>a.resource!=='coin_river');
  setup.history=setup.history.filter(e=>e.id!=='a3v2_099_account_0');
 }
 return setup;
};
function draft(document=initial){return engine.primitiveDraft(structuredClone(document));}
async function archive(t,document,write,verify){
 const directory=await fs.mkdtemp(path.join(tmpRoot(),'a3-wu-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const reducer=(document)=>{const d=engine.primitiveDraft(document);write(d);return {patches:d.patches,result:{ok:true}};};
 const store=new CampaignStorage(directory,{reducer});
 await store.create({id:'wu',worldVersion:'test',document});
 await store.transact('wu',{id:'initial',anchor:'wu-initial',input:{kind:'initial'}},reducer);
 const saved=(await new CampaignStorage(directory,{reducer}).read('wu')).document;
 const imported=await store.import(await store.export('wu'),'wu_copy');
 assert.deepEqual(imported.document,saved);verify(saved);
 await store.reconcile('wu',[]);
 assert.deepEqual((await store.read('wu')).document,document);
 await store.transact('wu',{id:'initial-again',anchor:'wu-initial',input:{kind:'initial'}},reducer);
 assert.deepEqual((await store.read('wu')).document,saved);
}
test('R: per-person speech and writing use canonical river/coast IDs; dialogue reads the interpreter, not catalogue defaults',async t=>{
 const result=applyIntentSetup(engine,initial,corpus('045'));assert.deepEqual(result.setupUnmet,[]);
 const d=engine.primitiveDraft(result.document),view=subjectiveView(engine,d.document,'npc_hw_yanzhe');
 assert.deepEqual(conversationLanguage(view,engine,d),{degree:1,interpreter:'npc_hw_shendu'});
 assert.deepEqual(personLanguages(engine,d.get('state'),'player'),['lang:river']);
 assert.equal(canReadLanguage(engine,d.get('state'),'player','river'),false);
 const noInterpreter=applyIntentSetup(engine,initial,corpus('099')).document;
 assert.equal(conversationLanguage(subjectiveView(engine,noInterpreter,'npc_hw_yanzhe'),engine,engine.primitiveDraft(noInterpreter)),null);
 const before=structuredClone(initial);
 for(const [person,value,ctx]of [['player',{spokenLanguages:['unknown']},context],['missing',{spokenLanguages:[]},context],['player',{spokenLanguages:['river']},{origin:'proposal',eventId:'fake'}],['player',{writtenLanguages:['river','lang:river']},context]])assert.throws(()=>initializePersonLanguages(draft(),engine,person,value,ctx));
 assert.deepEqual(initial,before);
 await archive(t,initial,d=>initializePersonLanguages(d,engine,'player',{spokenLanguages:['river'],writtenLanguages:['coast']},context),saved=>{
  assert.deepEqual(personLanguages(engine,saved.state,'player'),['lang:river']);assert.equal(canReadLanguage(engine,saved.state,'player','coast'),true);
 });
});
test('R: readable books require the reader written language, even with literacy',()=>{
 const setup={...corpus('045'),abilitiesByActor:{player:{skills:{skill_literacy:200},writtenLanguages:[]}}};
 const document=applyIntentSetup(engine,initial,setup).document,d=engine.primitiveDraft(document);
 assert.throws(()=>engine.learn(d,{entity:'skill_literacy',source:'item_literacy_primer'},'cannot-read'),{code:'E-LEARN-LANGUAGE'});
});
test('S: registered practical knowledge gates actual disarm dispatch and persists without minting a skill or success',async t=>{
 const d=draft();d.set(['state','created','wu_trap'],{id:'wu_trap',kind:'node',mechanism:'tripwire_falling_log'});
 assert.throws(()=>initialKnowledgeAction(d,engine,'site',{operation:'disarm',target:'wu_trap'}),{code:'E-DISARM-KNOWLEDGE'});
 await assert.rejects(engine.reduce(d.document,{tool:'site',eventId:'no-practical-knowledge',args:{operation:'disarm',target:'wu_trap'}}),{code:'E-DISARM-KNOWLEDGE'});
 initializePracticalKnowledge(d,engine,'player',['simple_tripwire_disassembly'],context);
 assert.doesNotThrow(()=>initialKnowledgeAction(d,engine,'site',{operation:'disarm',target:'wu_trap'}));
 assert.deepEqual(d.get('state','skills'),initial.state.skills);
 for(const [id,list,ctx]of [['player',['fake'],context],['player',['simple_tripwire_disassembly'],{origin:'proposal',eventId:'fake'}],['missing',[],context]])assert.throws(()=>initializePracticalKnowledge(draft(),engine,id,list,ctx));
 await archive(t,initial,d=>initializePracticalKnowledge(d,engine,'player',['simple_tripwire_disassembly'],context),saved=>assert.ok(knowsPracticalKnowledge(engine,saved.state,'player','simple_tripwire_disassembly')));
});
test('S: a native registered mechanism consumes practical knowledge, tools, materials, time and its actual check',async()=>{
 // A synthetic native site exercises the consumer independently of the corpus
 // node/authority loaders owned by the other cards. No corpus premise is edited.
 const w=structuredClone(world),place='site_wu_knowledge';
 w.locations.push({id:place,name:'测试绊索工位',parent:'loc_hw',scope:'loc_hw',coordinates:[0,0],terrain:'平地',owner:null,
  site:{owner:null,occupants:[],entryMechanisms:['tripwire'],mechanisms:[{id:'tripwire',name:'测试绊索',mechanism:'tripwire_falling_log',minutes:1,tool:'item_staff',materials:[{item:'item_ration',quantity:1}],check:{attribute:'敏捷',difficulty:10},failureDamage:0}],clues:[],resources:[],truths:[]}});
 const e=new WorldEngine(w),base=e.initialFromLegacy(seed,'wu-practical-action');
 let document=applyIntentSetup(e,base,{location:place,minute:600}).document;
 const seen=await e.reduce(document,{tool:'world_site',eventId:'wu-see-tripwire',args:{operation:'investigate',target:'tripwire'}});document=applyPatches(document,seen.patches);
 const action={tool:'world_site',eventId:'wu-disarm-tripwire',args:{operation:'disarm',target:'tripwire'}};
 const before=structuredClone(document);await assert.rejects(e.reduce(document,action),{code:'E-DISARM-KNOWLEDGE'});assert.deepEqual(document,before);
 const d=e.primitiveDraft(document);initializePracticalKnowledge(d,e,'player',['simple_tripwire_disassembly'],context);document=d.document;
 const quantity=e.quantity(e.primitiveDraft(document),'player','item_ration'),output=await e.reduce(document,action),after=applyPatches(document,output.patches);
 assert.equal(output.result.status,output.result.check.success?'已解除':'未解除');assert.equal(after.state.minute,document.state.minute+1);
 assert.equal(e.quantity(e.primitiveDraft(after),'player','item_ration'),quantity-1);assert.deepEqual(after.state.skills,document.state.skills);
});
test('T: historical qualification restores existing career; consumers read occupation, proficiency and conflict',async t=>{
 const setup=corpus('055'),document=applyIntentSetup(engine,initial,{minute:600,location:setup.location,present:setup.present,history:setup.history.filter(r=>r.verb==='qualified'),abilitiesByActor:setup.abilitiesByActor}).document;
 const row={...setup.vocations[0],sourceEvent:setup.vocations[0].sourceEvent};
 const write=d=>initializeVocation(d,engine,row,context),d=draft(document);write(d);
 assert.equal(personCareer(engine,d.get('state'),row.actor).value.occupation,'讼师');
 assert.equal(advocateService(engine,d.get('state'),row.actor).proficiency,450);
 assert.doesNotThrow(()=>assertVocationAction(engine,d.get('state'),'law',{operation:'hire_advocate',authority:row.actor}));
 const conflict=draft(document);initializeVocation(conflict,engine,{...row,conflictOfInterest:true},context);
 assert.throws(()=>assertVocationAction(engine,conflict.get('state'),'law',{operation:'hire_advocate',authority:row.actor}),/利害冲突/);
 await assert.rejects(engine.reduce(conflict.document,{tool:'law',eventId:'conflicted-advocate',args:{operation:'hire_advocate',authority:row.actor}}),/利害冲突/);
 for(const change of [{actor:'npc_hw_sulan'},{id:'vocation_fake'},{sourceEvent:'missing'},{conflictOfInterest:'false'}])assert.throws(()=>initializeVocation(draft(document),engine,{...row,...change},context));
 assert.throws(()=>initializeVocation(draft(document),engine,row,{origin:'proposal',eventId:'fake'}));
 assert.deepEqual(d.get('state','npcs',row.actor,'growth'),document.state.npcs[row.actor].growth);
 // Native legal-case fixture, independent of the other card's snapshot loader.
 const client=draft(d.document),caseId='legal_case:wu-client',service=advocateService(engine,client.get('state'),row.actor);
 client.set(['state','records',caseId],{category:'legal_case',id:caseId,law:'law_hw_property',offender:'player',victim:'npc_hw_wushuo',offense:'theft',value:1,reported:true,status:'已报案',witnesses:[],evidence:[]});
 const hired=await engine.reduce(client.document,{tool:'world_law',eventId:'wu-hire-qualified',args:{operation:'hire_advocate',case:caseId,authority:row.actor}}),after=applyPatches(client.document,hired.patches);
 assert.equal(after.state.records[caseId].representation.paid,service.fee);assert.equal(after.state.player.coins,client.get('state','player','coins')-service.fee);
 assert.equal(after.state.minute,client.get('state','minute')+service.minutes);
 await archive(t,document,write,saved=>assert.equal(personCareer(engine,saved.state,row.actor).value.occupation,'讼师'));
});
test('U: workstation and full demonstration window are real sources; teaching busy never grants consent',async t=>{
 const setup=corpus('017'),document=applyIntentSetup(engine,initial,{minute:600,location:setup.location,present:setup.present}).document,row=setup.demonstrations[0];
 const write=d=>{initializeDemonstration(d,engine,row,context);initializeTeachingActivity(d,engine,row.actor,{teachingBusy:true},context);};
 const d=draft(document);write(d);
 assert.ok(demonstrationAt(engine,d.get('state'),row.actor,row.subject,660));
 assert.equal(demonstrationAt(engine,d.get('state'),row.actor,row.subject,661),null);
 assert.equal(teachingAvailable(engine,d.get('state'),row.actor),false);
 assert.equal(engine.primitiveTeachingConsent(d,{teacher:row.actor,subject:row.subject,minutes:10}).allowed,false);
 assert.equal(subjectiveView(engine,d.document,row.actor).self.busyUntil,660);
 assert.throws(()=>engine.primitiveTeachingConsent(d,{teacher:row.actor,subject:row.subject,minutes:61}),{code:'E-LEARN-OBSERVE'});
 assert.throws(()=>engine.learn(d,{source:row.actor,entity:row.subject},'busy'),{code:'E-LEARN-SOURCE'});
 assert.deepEqual(d.get('state','consentEvents'),document.state.consentEvents);
 for(const change of [{workstation:'bld_hw_post'},{subject:'skill_fake'},{toMinute:590},{teaching:true},{actor:'missing'},{success:true}])assert.throws(()=>initializeDemonstration(draft(document),engine,{...row,...change},context));
 // The counter-example place is derived from fixtures, not named: a facility whose workstations serve none
 // of the subject skill's recipes. (The post office once served here, but its hearth is a cooking station and
 // the silk-reeling recipe of this skill is worked at one - s5w2b 3c72c91b - so it is a lawful place now.)
 const skillOf=engine.byId.get(row.subject),kinds=new Set(engine.world.recipes.filter(r=>r.skill===(skillOf.skill??skillOf.id)).map(r=>r.workstation));
 const bare=engine.world.locations.map(p=>p.id).sort().find(id=>id!==row.workstation&&facilityView(engine,document.state,id)&&!facilityView(engine,document.state,id).workstations.some(st=>kinds.has(st.kind)));
 assert.ok(bare,'some facility has no station for this subject');
 const wrongStation=draft(document);wrongStation.set(['state','npcs',row.actor,'location'],bare);assert.throws(()=>initializeDemonstration(wrongStation,engine,{...row,workstation:bare},context),/working subject workstation/);
 const post=facilityView(engine,document.state,'bld_hw_post');assert.ok(post.workstations.some(st=>kinds.has(st.kind)),'a cooking hearth serves this subject');
 const atPost=draft(document);atPost.set(['state','npcs',row.actor,'location'],'bld_hw_post');assert.doesNotThrow(()=>initializeDemonstration(atPost,engine,{...row,workstation:'bld_hw_post'},context));
 assert.throws(()=>initializeDemonstration(d,engine,{...row,id:'overlapping'},context),/unoccupied window/);
 assert.throws(()=>initializeDemonstration(draft(document),engine,row,{origin:'proposal',eventId:'fake'}));
 initializeTeachingActivity(d,engine,row.actor,{demonstrating:false},context);assert.equal(demonstrationAt(engine,d.get('state'),row.actor),null);
 d.set(['state','minute'],660);settleDemonstrations(d,engine);
 assert.equal(d.get('state','npcs',row.actor,'practicing'),null);assert.equal(teachingAvailable(engine,d.get('state'),row.actor),true);
 await archive(t,document,write,saved=>assert.ok(demonstrationAt(engine,saved.state,row.actor,row.subject)));
});
test('U: native player observation consumes the timed demonstration and gives only reduced practice, without a complete lesson',()=>{
 const setup={...corpus('017')};delete setup.positions;
 const result=applyIntentSetup(engine,initial,setup);assert.deepEqual(result.setupUnmet,[]);
 const d=engine.primitiveDraft(result.document);assert.equal(recordLocalContact(d,engine,'npc_hw_sulan','wu-actual-contact'),true);
 const effects=[{op:'learn',subject:'skill_life_4_core',learningSource:'npc_hw_sulan'}];
 const frame=createRuntimePrimitiveFrame(engine,d.document,{eventId:'wu-actual-observation',source:{kind:'catalog',id:'test:observation'},limits:{learn:{minutes:20}}});
 const output=commitPrimitives(d.document,effects,frame),observation=output.receipt.applied[0].result;
 assert.equal(output.receipt.status,'committed');assert.equal(observation.observed,true);assert.equal(observation.permission.kind,'busy');
 const after=applyPatches(d.document,output.patches);assert.equal(after.state.minute,d.get('state','minute')+20);
 assert.deepEqual(after.state.learning,d.get('state','learning'));assert.deepEqual(after.state.consentEvents,d.get('state','consentEvents'));
 const expired=createRuntimePrimitiveFrame(engine,d.document,{eventId:'wu-too-long-observation',source:{kind:'catalog',id:'test:observation'},limits:{learn:{minutes:61}}});
 assert.throws(()=>commitPrimitives(d.document,effects,expired),{code:'E-LEARN-OBSERVE'});
});
test('R-U: corpus own connector setup fields are all established; other owners remain explicit',()=>{
 const owned=/^(abilitiesByActor|vocations|demonstrations|actorStates)/;
 for(const id of ['011','017','045','055','066','080','098','099'])assert.deepEqual(applyIntentSetup(engine,initial,corpus(id)).setupUnmet.filter(r=>owned.test(r.item)),[],id);
 for(const id of ['045','098','099'])assert.deepEqual(applyIntentSetup(engine,initial,corpus(id)).setupUnmet,[],id);
});
