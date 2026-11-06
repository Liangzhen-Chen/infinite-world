import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {applyIntentSetup,scoreRows} from '../tools/a3-score.mjs';
import {consent,applyConsentEvent} from '../server-plugin/action-consent.mjs';
import {authority,currentControllers,resolveAuthoritySelector,grantLimitedPermit,limitedPermit,consumeLimitedPermit,revokeLimitedPermit} from '../server-plugin/action-authority.mjs';
import {recordHistoricalEvent,worldEvent,knownWorldEventReference} from '../server-plugin/world-events.mjs';
import {createRuntimePrimitiveFrame} from '../server-plugin/primitives-runtime.mjs';
import {commitPrimitives} from '../server-plugin/primitives.mjs';
import {partyAccount} from '../server-plugin/money.mjs';
import {executeProtocolPrimitive} from '../server-plugin/transition.mjs';
import {aliveHoldings} from '../server-plugin/holdings.mjs';
import {reconcile} from './helpers/ledger-audit.mjs';
import {hasSpellConsent} from '../server-plugin/magic-consent.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-jia');
const corpus=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
const npc='npc_hw_ayan',other='npc_hw_linsui',subject='feature_hw_kitchen_bucket';
const scene=()=>applyIntentSetup(engine,initial,{minute:600,present:[npc,other],location:'bld_hw_mill'}).document;
const context=document=>({engine,document});
const save=document=>JSON.parse(JSON.stringify(document));
function write(document,fn){const d=engine.primitiveDraft(document),result=fn(d);return {document:applyPatches(document,d.patches),patches:d.patches,result};}
function event(document,id,verb,payload,actor=npc){return write(document,d=>recordHistoricalEvent(d,engine,{id,verb,actor,minute:599,source:{kind:'corpus_premise',row:'A3-OWNER-TEST'},payload:{...payload,actor,verb}})).document;}
function given(document,{id='lesson',actor=npc,from,terms={fee:4,minutes:30},scope='teach',purpose='recipe_wooden_pegs',to='player',until=800}={}){
 return write(document,d=>applyConsentEvent(d,context(d.document),{actor,eventId:id,verb:'consent_given',to,payload:{scope,purpose:[purpose],subject:purpose,terms,until,...(from?{from}:{})}}));
}
function permit(document,{id='permit',actor=other,holder='player',scope='destroy',quantityLiters=20,target=subject}={}){
 document=event(document,`source-${id}`,'permission_granted',{subject:target,to:holder,scope},actor);
 return write(document,d=>grantLimitedPermit(d,context(d.document),{id,actor,holder,subject:target,scope,...(quantityLiters===null?{}:{quantityLiters}),fromMinute:599,toMinute:800,sourceEvent:`world_event:source-${id}`}));
}

test('A: conditional donor grant is persisted, replayed, subject-bound and never widened',()=>{
 const document=scene(),out=given(document),restored=save(out.document),query=options=>consent(context(restored),npc,'player','teach',{purpose:'recipe_wooden_pegs',...options});
 assert.deepEqual(save(applyPatches(document,out.patches)),restored);
 assert.equal(query({terms:{fee:4,minutes:30}}).allowed,true);
 assert.equal(query({terms:{fee:0,minutes:30}}).allowed,false);
 assert.equal(query({terms:{fee:4,minutes:60}}).allowed,false);
 assert.equal(query({}).allowed,false);
 assert.equal(query({subject:'recipe_other',terms:{fee:4,minutes:30}}).allowed,false);
 assert.equal(query({until:800,terms:{fee:4,minutes:30}}).allowed,false);
 const teaching=engine.primitiveTeachingConsent(engine.primitiveDraft(restored),{teacher:npc,subject:'recipe_wooden_pegs',fee:4,minutes:30,eventId:'lesson-native'});
 assert.equal(teaching.source,'lesson');
 const changed=engine.primitiveTeachingConsent(engine.primitiveDraft(restored),{teacher:npc,subject:'recipe_wooden_pegs',fee:0,minutes:30,eventId:'different-lesson'});
 assert.notEqual(changed.source,'lesson');
 const revoked=write(restored,d=>applyConsentEvent(d,context(d.document),{actor:npc,eventId:'revoke',verb:'consent_revoked',payload:{consent:'lesson'}})).document;
 assert.equal(consent(context(save(revoked)),npc,'player','teach',{purpose:'recipe_wooden_pegs',terms:{fee:4,minutes:30}}).allowed,false);
 assert.throws(()=>given(document,{actor:'player',from:npc}),{code:'E-CONSENT'});
 assert.throws(()=>given(document,{terms:{fee:-1}}),{code:'E-CONSENT'});
 assert.deepEqual(document,scene());
});

test('A: actual loan authority consumes exact principal, term and interest, not caller consent flags',()=>{
 let document=given(scene(),{id:'loan',scope:'loan',purpose:'player',terms:{principal:50,days:10,interest:0}}).document;
 document=save(document);
 const effect={op:'obligation.create',id:'native-loan',obligationKind:'loan',debtor:npc,creditor:'player',amount:50,deadline:600+10*1440,terms:{principal:50,days:10,interest:0}};
 assert.equal(authority(context(document),'player','obligation.create',npc,{effect}).allowed,true);
 assert.equal(authority(context(document),'player','obligation.create',npc,{effect:{...effect,terms:{...effect.terms,principal:51}}}).allowed,false);
 assert.equal(authority(context(document),'player','obligation.create',npc,{effect:{...effect,amount:100}}).allowed,false);
 assert.equal(authority(context(document),'player','obligation.create',npc,{effect:{...effect,deadline:600+11*1440}}).allowed,false);
 assert.equal(authority(context(document),'player','obligation.create',npc,{effect:{...effect,terms:{...effect.terms,resource:'item_gold'}}}).allowed,false);
 assert.equal(authority(context(document),'player','obligation.create',other,{effect:{...effect,debtor:other}}).allowed,false);
 assert.equal(authority(context(scene()),'player','obligation.create',npc,{effect:{...effect,consent:true}}).allowed,false);
});

test('A: native funded loan commits under exact donor terms and replays once',()=>{
 const base=applyIntentSetup(engine,initial,{minute:600,coins:50,present:[npc],location:'bld_hw_mill'}).document;
 const document=given(base,{id:'loan',scope:'loan',purpose:'player',terms:{principal:50,days:10,interest:0}}).document;
 const effects=[{op:'transfer',from:partyAccount(engine,document.state,'player'),to:partyAccount(engine,document.state,npc),qty:50},{op:'obligation.create',id:'funded-loan',obligationKind:'loan',debtor:npc,creditor:'player',amount:50,deadline:600+10*1440,terms:{principal:50,days:10,interest:0}}];
 const frame=createRuntimePrimitiveFrame(engine,document,{actor:'player',eventId:'loan-execution',source:{kind:'catalog',id:'test:conditional-loan'}});
 const out=commitPrimitives(document,effects,frame),restored=save(applyPatches(document,out.patches));
 assert.equal(restored.state.player.coins,0);
 assert.equal(restored.state.obligations['funded-loan'].amount,50);
 assert.equal(restored.state.obligations['funded-loan'].debtor,npc);
 assert.equal(out.receipt.applied[1].actedAs.kind,'consent');
 assert.deepEqual(reconcile(engine,restored),{mismatches:[],lots:[],drift:[],audit:[]});
 const replay=commitPrimitives(restored,effects,frame);
 assert.equal(replay.receipt.duplicate,true);assert.deepEqual(replay.patches,[]);
 const agreed=given(restored,{id:'repay',scope:'repay',purpose:'funded-loan',terms:{amount:50}}).document;
 const repayment={op:'obligation.settle',id:'funded-loan',amount:50};
 assert.equal(authority(context(agreed),'player','obligation.settle',npc,{effect:{...repayment,amount:51}}).allowed,false);
 const repayFrame=createRuntimePrimitiveFrame(engine,agreed,{actor:'player',eventId:'repay-execution',source:{kind:'catalog',id:'test:conditional-repayment'}});
 const settled=commitPrimitives(agreed,[repayment],repayFrame),saved=save(applyPatches(agreed,settled.patches));
 assert.equal(saved.state.player.coins,50);assert.equal(settled.receipt.applied[0].actedAs.kind,'consent');
 assert.deepEqual(reconcile(engine,saved),{mismatches:[],lots:[],drift:[],audit:[]});
});

test('A: actual spell-consent consumer retains the exact cast subject and spell after save',()=>{
 const setup=corpus.find(r=>r.id==='A3V2-071').setup,loaded=applyIntentSetup(engine,initial,setup),document=save(loaded.document),d=engine.primitiveDraft(document),catalog=engine.byId.get('spell_fire_11');
 assert.deepEqual(loaded.setupUnmet.filter(r=>r.item.startsWith('history')),[]);
 assert.equal(hasSpellConsent(d,'npc_hw_taozhi','a3v2_071_cast_0','support_magic',catalog,690,engine),true);
 assert.equal(hasSpellConsent(d,'npc_hw_taozhi','a3v2_071_cast_0','support_magic',{...catalog,id:'spell_other'},690,engine),false);
 assert.equal(hasSpellConsent(d,npc,'a3v2_071_cast_0','support_magic',catalog,690,engine),false);
 const revoked=write(document,d=>applyConsentEvent(d,context(d.document),{actor:'npc_hw_taozhi',eventId:'revoke-shield',verb:'consent_revoked',payload:{consent:'a3v2_071_cast_0'}})).document;
 assert.equal(hasSpellConsent(engine.primitiveDraft(save(revoked)),'npc_hw_taozhi','a3v2_071_cast_0','support_magic',catalog,690,engine),false);
});

test('B: finite permit authorizes its actual operation only; quantities, expiry and revocation survive save',()=>{
 const out=permit(scene()),document=save(out.document),c=context(document);
 assert.equal(limitedPermit(c,'player',subject,'destroy',{quantityLiters:20}).id,'permit');
 assert.equal(authority(c,'player','destroy',subject,{effect:{quantityLiters:20}}).allowed,true);
 assert.equal(authority(c,'player','transfer',subject).allowed,false);
 assert.equal(authority(c,'player','consent',subject).allowed,false);
 assert.equal(limitedPermit(c,other,subject,'destroy'),null);
 assert.equal(limitedPermit(c,'player','other-subject','destroy'),null);
 const used=write(document,d=>consumeLimitedPermit(d,context(d.document),'permit',15)).document;
 assert.equal(limitedPermit(context(save(used)),'player',subject,'destroy',{quantityLiters:6}),null);
 assert.throws(()=>write(used,d=>consumeLimitedPermit(d,context(d.document),'permit',6)),{code:'E-PERMIT'});
 assert.throws(()=>permit(scene(),{actor:npc}),{code:'E-PERMIT-AUTHORITY'});
 assert.throws(()=>permit(scene(),{quantityLiters:-1}),{code:'E-PERMIT'});
 assert.throws(()=>write(document,d=>revokeLimitedPermit(d,context(d.document),{actor:'player',id:'permit'})),{code:'E-PERMIT-AUTHORITY'});
 const revoked=write(document,d=>revokeLimitedPermit(d,context(d.document),{actor:other,id:'permit'})).document;
 assert.equal(limitedPermit(context(save(revoked)),'player',subject,'destroy'),null);
 const expired=save(document);expired.state.minute=800;
 assert.equal(limitedPermit(context(expired),'player',subject,'destroy'),null);
});

test('C: authority selectors use current real owner, never a present bystander; current ownership invalidates old permits',()=>{
 const document=scene();
 assert.equal(resolveAuthoritySelector(context(document),{role:'authorized_manager',of:subject}),other);
 assert.equal(resolveAuthoritySelector(context(save(document)),{role:'authorized_manager',of:subject}),other);
 assert.throws(()=>resolveAuthoritySelector(context(document),{role:'authorized_manager',of:'missing'}),{code:'E-AUTHORITY-SELECTOR'});
 // fix3-world：白石镇已有经审批的合法镇长（npc_bs_townhead，镇务署首领）；无首长的聚落仍被选择器拒绝。
 assert.equal(resolveAuthoritySelector(context(document),{role:'existing_legal_town_head',of:'loc_bs'}),'npc_bs_townhead');
 assert.throws(()=>resolveAuthoritySelector(context(document),{role:'existing_legal_town_head',of:'missing'}),{code:'E-AUTHORITY-SELECTOR'});
 assert.throws(()=>resolveAuthoritySelector(context(document),{role:'authorized_manager',of:subject,holder:other}),{code:'E-AUTHORITY-SELECTOR'});
 const school='bld_hw_qingdeng',owner=currentControllers(context(document),school)[0];
 assert.ok(owner);
 const changed=save(document);changed.state.buildings[school]??={};changed.state.buildings[school].owner=null;
 assert.deepEqual(currentControllers(context(changed),school),[]);
});

test('B/C: actual destruction reads owner-issued subject permission, and rejects an expired saved grant',()=>{
 // The physical stock connector requires an existing carried item. Custody
 // does not change title: permission still has to come from `other`.
 const setup={minute:600,present:[other],location:'bld_hw_mill',itemInstances:[{id:'jia_crate',template:'thing',kind:'item',name:'permit test crate',owner:other,carriedBy:'player',location:'bld_hw_mill',quantity:1}]};
 const loaded=applyIntentSetup(engine,initial,setup);assert.deepEqual(loaded.setupUnmet,[]);
 const target=loaded.bindings.jia_crate,document=save(permit(loaded.document,{target,quantityLiters:null}).document);
 const effects=[{op:'destroy',entity:target}],frame=createRuntimePrimitiveFrame(engine,document,{eventId:'permitted-destroy',source:{kind:'catalog',id:'test:finite-permit'}});
 const out=commitPrimitives(document,effects,frame),restored=save(applyPatches(document,out.patches));
 assert.equal(out.receipt.applied[0].actedAs.kind,'permit');
 assert.ok(restored.holdings.protocol.entities[target].gone);
 const title=aliveHoldings(engine.primitiveDraft(document),{kind:'owns',subject:target})[0];
 const transferred=write(document,d=>executeProtocolPrimitive(d,engine,{op:'holding.transfer',id:title.id,holder:npc},{eventId:'title-changed'})).document;
 assert.equal(limitedPermit(context(save(transferred)),'player',target,'destroy'),null);
 assert.deepEqual(currentControllers(context(transferred),target),[npc]);
 // K6 (76365571, legality is a consequence): an expired saved grant no longer licenses the act. Destroying
 // the crate in hand still physically happens, without acting under the permit, and is committed as
 // property damage against the owner who issued it.
 const expired=save(document);expired.state.minute=800;
 const late=commitPrimitives(expired,effects,frame),broken=save(applyPatches(expired,late.patches));
 assert.notEqual(late.receipt.applied[0].actedAs?.kind,'permit');assert.ok(broken.holdings.protocol.entities[target].gone);
 const offense=late.receipt.consequences.find(c=>c.type==='offense'),row=broken.state.records[offense?.record];
 assert.equal(offense?.offense,'property_damage');assert.equal(offense.victim,other);assert.equal(row.sourceEvent,'permitted-destroy');assert.equal(row.offender,'player');
 assert.equal((out.receipt.consequences??[]).some(c=>c.type==='offense'),false);
});

test('D: actorless history keeps payload and identity, replays without social/wealth effects and rejects forged bindings',()=>{
 const document=scene(),before=save(document);
 const out=write(document,d=>recordHistoricalEvent(d,engine,{id:'fire',verb:'ignited',actor:null,minute:599,source:{kind:'corpus_premise',row:'A3-OWNER-TEST'},payload:{subject:'crate',fireIntensity:1}}));
 const restored=save(out.document),read=worldEvent(restored.state,'world_event:fire');
 assert.equal(read.id,'fire');assert.equal(read.actor,null);assert.equal(read.subject,'crate');assert.equal(read.fireIntensity,1);
 assert.deepEqual(save(applyPatches(document,out.patches)),restored);
 assert.deepEqual(document,before);assert.deepEqual(restored.state.player,before.state.player);
 assert.throws(()=>write(restored,d=>recordHistoricalEvent(d,engine,{...read,payload:read.payload})),/already exists/);
 assert.throws(()=>write(document,d=>recordHistoricalEvent(d,engine,{...read,id:'future',minute:601})),/Invalid historical/);
 const forged=save(restored);forged.state.records['world_event:fire'].id='other';
 assert.equal(worldEvent(forged.state,'world_event:fire'),null);
 const result=applyIntentSetup(engine,initial,{minute:600,history:[{id:'weather',verb:'observed',at:599,observer:'player',subject:'weather',source:{kind:'corpus_premise',row:'A3-OWNER-TEST'}}],knowledge:[{holder:'player',event:'weather',source:'direct_observation'}]});
 assert.deepEqual(result.setupUnmet,[]);
 assert.equal(worldEvent(result.document.state,result.bindings.weather).observer,'player');
});

test('A/B/D corpus premises load via native writers, with other-card blockers still reported',()=>{
 for(const num of ['012','015','034','039','043','053','064','068','071','074','078','095','104','110']){
  const row=corpus.find(r=>r.id===`A3V2-${num}`),result=applyIntentSetup(engine,initial,row.setup);
  assert.deepEqual(result.setupUnmet.filter(x=>x.item.startsWith('history')),[],row.id);
 }
 for(const num of ['008','012']){
  const row=corpus.find(r=>r.id===`A3V2-${num}`),result=applyIntentSetup(engine,initial,row.setup);
  // 05 §5.3 / 01 §1.3: these issuers now have actual native authority.
  assert.deepEqual(result.setupUnmet.filter(x=>x.item.startsWith('permits')),[],row.id);
 }

});

test('D: actual tell routes from a known historical version without granting an uninformed speaker access',async()=>{
 const row=corpus.find(r=>r.id==='A3V2-043'),loaded=applyIntentSetup(engine,initial,row.setup),state=loaded.document.state,content=row.setup.history[0].name;
 assert.equal(knownWorldEventReference(state,'player',{reference:'self',content}),'a3v2_043_observed_goat');
 assert.equal(knownWorldEventReference(state,other,{reference:'self',content}),null);
 assert.equal(knownWorldEventReference(state,'player',{reference:'self',content:'invented'}),null);
 const result=await scoreRows([row],{world,document:initial});
 assert.deepEqual(result.results[0].setupUnmet,[]);
 assert.equal(result.results[0].scores.route,true);
 // 06 §6.7 / review 10-22 P0: every signature descriptor must be structurally verified. The corpus label
 // tell:witnessed_beast names no payload topic, event id or catalog term (corpus-owned, reported to the main
 // session), so the full row no longer earns the signature; the verifiable part (a tell to this person) does.
 assert.equal(result.results[0].scores.signature,false);
 assert.equal(result.results[0].signatureDiagnostics[0].reason,'unverified qualifiers: tell:witnessed_beast');
 const subjectOnly=structuredClone(row);subjectOnly.expected.signature=['emit(person:npc_hw_wushuo)'];
 const verified=await scoreRows([subjectOnly],{world,document:initial});
 assert.equal(verified.results[0].scores.route,true);
 assert.equal(verified.results[0].scores.signature,true);
});
