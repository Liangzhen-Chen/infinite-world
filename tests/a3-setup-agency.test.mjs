import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {runSetupLoaders,registerSetupLoader} from '../tools/a3-setup/index.mjs';
import {ensureHoldings,openHoldings,aliveHoldings,holdingSet} from '../server-plugin/holdings.mjs';
import {knowledgeProficiency,knowsPracticalKnowledge,demonstrationAt,teachingAvailable} from '../server-plugin/education-state.mjs';
import {subjectiveView,personLanguages,canReadLanguage} from '../server-plugin/subjective-view.mjs';
import {personCareer,institutionOffices,officeOnDuty} from '../server-plugin/entity-view.mjs';
import {officeCall,officeScene} from './helpers/office-actions.mjs';
import {applyPatches} from '../server-plugin/storage.mjs';
import {authority} from '../server-plugin/action-authority.mjs';
import {primitiveContext} from '../server-plugin/primitives-runtime.mjs';
import {advocateService} from '../server-plugin/legal-representation.mjs';
import {mapView} from '../server-plugin/ui-map.mjs';
import {summonAction} from '../server-plugin/summons.mjs';
import {charteredWorld} from './helpers/charter-world.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const initial=engine.initialFromLegacy(seed,'a3-agency');
const rows=JSON.parse(await fs.readFile(new URL('./fixtures/a3-intents-v2-r7.json',import.meta.url),'utf8'));
const corpus=id=>rows.find(r=>r.id===`A3V2-${id}`).setup;
// Domain contexts can receive bindings established by earlier loader modules.
// These are fixture event records, not successful measured actions.
function domain(setup,{document=initial,bindings={}}={}){
 let current=structuredClone(document);
 const setupUnmet=[],ctx={engine,setup,bindings:{...bindings},ref:id=>ctx.bindings[id]??(id==='self'?'player':id),
  actor:id=>id==='player'||id==='self'?current.state.player:current.state.npcs[id]??current.state.creatures?.[id],
  unmet:(item,reason)=>setupUnmet.push({item,reason}),note:()=>{},
  get document(){return current;},set document(v){current=v;},
  native(item,write){try{const d=engine.primitiveDraft(current);ensureHoldings(d,engine);write(d);current=d.document;return true;}catch(e){setupUnmet.push({item,reason:e.message});return false;}}};
 runSetupLoaders(ctx,setup);
 return {document:current,setupUnmet,bindings:ctx.bindings};
}
const eventFixture=(event)=>{
 const document=structuredClone(initial);document.state.minute=600;
 document.state.records[`world_event:${event.id}`]={category:'world_event',minute:599,...event};
 return document;
};
const rejects=(result,item,reason)=>assert.ok(result.setupUnmet.some(r=>r.item===item&&(!reason||reason.test(r.reason))),JSON.stringify(result.setupUnmet));

test('agency abilities: declared NPC skills use native facts; teachers retain qualification without consent or certification',()=>{
 const before=structuredClone(initial),setup=corpus('015'),result=applyIntentSetup(engine,initial,setup);
 assert.equal(result.setupUnmet.filter(r=>r.item.startsWith('abilitiesByActor')).length,0);
 assert.equal(knowledgeProficiency(engine,result.document.state,'npc_hw_luqing','skill_literacy'),450);
 assert.deepEqual(result.document.state.npcs.npc_hw_luqing.certifications,initial.state.npcs.npc_hw_luqing.certifications);
 assert.deepEqual(initial,before);
 const bad=domain({abilitiesByActor:{npc_hw_luqing:{skills:{skill_literacy:-1,missing_skill:10},teaches:['missing_recipe']},missing_actor:{skills:{skill_literacy:10}}}});
 for(const item of ['abilitiesByActor.npc_hw_luqing.skills.skill_literacy','abilitiesByActor.npc_hw_luqing.skills.missing_skill','abilitiesByActor.npc_hw_luqing.teaches[0]','abilitiesByActor.missing_actor'])rejects(bad,item);
});
test('agency abilities: native language/practical premises retain literacy and credential boundaries',()=>{
 const result=domain({abilitiesByActor:{player:{spokenLanguages:['river'],writtenLanguages:[],practicalKnowledge:['simple_tripwire_disassembly']}}});
 // 05 §5.4 / 06 §6.3: R/S initial writers now exist; assert the actual readers.
 assert.deepEqual(result.setupUnmet,[]);
 assert.deepEqual(personLanguages(engine,result.document.state,'player'),['lang:river']);
 assert.equal(canReadLanguage(engine,result.document.state,'player','river'),false);
 assert.ok(knowsPracticalKnowledge(engine,result.document.state,'player','simple_tripwire_disassembly'));
 assert.deepEqual(result.document.state.skills,initial.state.skills);
 assert.deepEqual(result.document.state.professions,initial.state.professions);
 assert.equal(result.document.state.minute,initial.state.minute);
 assert.equal(result.document.state.player.coins,initial.state.player.coins);
 rejects(domain({abilitiesByActor:{player:{spokenLanguages:42}}}),'abilitiesByActor.player.spokenLanguages');
 // An empty spoken list must not silently retain lang:common defaults.
 const empty=domain({abilitiesByActor:{player:{spokenLanguages:[]}}});
 assert.deepEqual(empty.setupUnmet,[]);assert.deepEqual(personLanguages(engine,empty.document.state,'player'),[]);
 rejects(domain({abilitiesByActor:{player:{practicalKnowledge:['missing']}}}),'abilitiesByActor.player.practicalKnowledge');
});
test('agency abilities: known spells/recipes and literacy initialize no lessons, money or elapsed time',()=>{
 const spell=world.spells.find(s=>world.skills.some(k=>k.id===s.skill)),recipe=world.recipes.find(s=>world.skills.some(k=>k.id===s.skill));
 const result=domain({abilitiesByActor:{npc_hw_luqing:{literacy:100,spells:[spell.id],recipes:[recipe.id]}}});
 assert.deepEqual(result.setupUnmet,[]);
 const npc=result.document.state.npcs.npc_hw_luqing;
 assert.ok(npc.spells[spell.id]);assert.ok(npc.recipes[recipe.id]);
 assert.equal(result.document.state.minute,initial.state.minute);assert.equal(npc.coins,initial.state.npcs.npc_hw_luqing.coins);
 assert.deepEqual(result.document.state.learning,initial.state.learning);
 rejects(domain({abilitiesByActor:{player:{literacy:50,skills:{skill_literacy:100}}}}),'abilitiesByActor.player.literacy',/conflicting/);
});
test('agency practiceState: unpracticed/unlimited is checked without clearing native daily history',()=>{
 const setup=corpus('013'),base=applyIntentSetup(engine,initial,{...setup,practiceState:undefined});
 const result=domain({practiceState:setup.practiceState},{document:base.document});
 assert.deepEqual(result.setupUnmet,[]);assert.deepEqual(result.document.state.skills,base.document.state.skills);
 const doc=structuredClone(base.document),day=String(Math.floor(doc.state.minute/1440));
 doc.state.skills.skill_light.daily[day]={gain:1,targets:{target:1}};
 const bad=domain({practiceState:setup.practiceState},{document:doc});rejects(bad,'practiceState[0]',/cannot be erased/);
 assert.deepEqual(bad.document,doc);
 rejects(domain({practiceState:[{actor:'player',subject:'missing',practicedToday:false}]}),'practiceState[0]');
 rejects(domain({practiceState:[{actor:'player',subject:'skill_literacy',practicedToday:true}]}),'practiceState[0]');
});
test('agency reading: the same physical book and literacy determine canRead, without learning its contents',()=>{
 const document=structuredClone(initial),item='item_literacy_primer',id='agency_book';
 document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
 document.state.inventory[item]={...document.state.inventory[item],quantity:1,durability:100};
 document.state.itemInstances??={};document.state.itemInstances[id]={id,item,owner:'player',status:'持有',durability:100};
 // Open the fixture's native ownership projection before testing read-only
 // validation; creating that projection is not a change in reading ability.
 document.holdings=openHoldings(engine,document);
 const setup={reading:[{reader:'self',item:id,canRead:true,source:'setup.facts'}]},result=domain(setup,{document});
 assert.deepEqual(result.setupUnmet,[]);assert.deepEqual(result.document,document);
 document.state.skills.skill_literacy.proficiency=0;setup.reading[0].canRead=false;
 assert.deepEqual(domain(setup,{document}).setupUnmet,[]);
 setup.reading[0].canRead=true;rejects(domain(setup,{document}),'reading[0]',/conflicts/);
 rejects(domain({reading:[{reader:'player',item:'missing',canRead:true,source:'setup.facts'}]}),'reading[0]');
});
test('agency knowledge: bound native observed events enter only the observer knowledge, never current visibility',()=>{
 const event={id:'native_seen',verb:'observed',observer:'player',subject:{species:'monster_bent_horn_goat',count:1},currentlyVisible:false,summary:'observed previously'},document=eventFixture(event);
 const setup={knowledge:[{holder:'player',event:'alias_seen',source:'direct_observation'}]},result=domain(setup,{document,bindings:{alias_seen:event.id}});
 assert.deepEqual(result.setupUnmet,[]);
 const memory=subjectiveView(engine,result.document,'player').knowledge.memories.find(m=>m.sourceEvent===event.id);
 assert.ok(memory);assert.equal(memory.value.currentlyVisible,false);
 assert.ok(!subjectiveView(engine,result.document,'npc_hw_luqing').knowledge.memories.some(m=>m.sourceEvent===event.id));
 assert.deepEqual(result.document.state.creatures,document.state.creatures);
 const bad=domain({knowledge:[{holder:'npc_hw_luqing',event:'alias_seen',source:'direct_observation'}]},{document,bindings:{alias_seen:event.id}});
 rejects(bad,'knowledge[0]',/does not establish/);assert.deepEqual(bad.document,document);
 rejects(domain(setup),'knowledge[0]',/unresolved/);
});
test('agency knowledge: own action and historical weather remain source-bound, scopes are never broadened',()=>{
 const event={id:'native_action',verb:'steal',actor:'player',summary:'own act'},document=eventFixture(event),bindings={alias:event.id};
 assert.deepEqual(domain({knowledge:[{holder:'player',event:'alias',source:'own_action'}]},{document,bindings}).setupUnmet,[]);
 rejects(domain({knowledge:[{holder:'player',event:'alias',source:'own_action',only:['fact']}]},{document,bindings}),'knowledge[0]',/scoped/);
 rejects(domain({knowledge:[{holder:'player',event:'alias',source:'direct_observation',currentOutsideWeather:true}]},{document,bindings}),'knowledge[0]');
});
test('agency mapKnowledge: known map opens a memory and existing routes, with no discovery, visit or remote contact',()=>{
 const result=applyIntentSetup(engine,initial,{minute:600,mapKnowledge:corpus('006').mapKnowledge});
 assert.deepEqual(result.setupUnmet,[]);
 // ui-map exposes published places without mapHierarchy as transit stops.
 const map=mapView(engine,result.document);
 assert.ok([...map.locations,...map.transit].some(p=>p.id==='loc_bs'));
 assert.deepEqual(result.document.state.discoveries,initial.state.discoveries);
 assert.equal(result.document.state.location,initial.state.location);
 assert.deepEqual(result.document.state.npcs,initial.state.npcs);
 rejects(domain({mapKnowledge:[{holder:'player',destination:'missing',source:'known_map'}]}),'mapKnowledge[0]');
 rejects(domain({mapKnowledge:[{...corpus('006').mapKnowledge[0],route:{...corpus('006').mapKnowledge[0].route,from:'missing'}}]}),'mapKnowledge[0]');
});
test('agency summons: a source-bound existing water cup opens its native contract without casting costs',()=>{
 const event={id:'native_summoned',verb:'summoned',actor:'player',subject:'agency_summon',spell:'spell_summon_04'},document=eventFixture(event),bindings={alias:event.id};
 const declaration={id:'agency_summon',name:'existing water cup',spell:event.spell,summonType:'water_cup',owner:'player',location:document.state.location,active:true,sourceEvent:'alias'};
 const result=domain({summons:[declaration]},{document,bindings});assert.deepEqual(result.setupUnmet,[]);
 const effect=result.document.state.effects.agency_summon,contract=result.document.state.records[effect.contract];
 assert.equal(effect.kind,'summon');assert.equal(effect.owner,'player');assert.equal(contract.effect,'agency_summon');assert.equal(contract.started,599);
 assert.equal(effect.name,declaration.name);
 assert.equal(effect.nextUpkeep,604);assert.equal(contract.paidUpkeep,0);
 assert.equal(result.document.state.player.mp,document.state.player.mp);assert.equal(result.document.state.minute,600);
 const d=engine.primitiveDraft(result.document),inspected=summonAction.call(engine,d,{operation:'inspect',summon:result.bindings.agency_summon},'inspect');
 assert.ok(inspected);
 rejects(domain({summons:[{...declaration,spell:'missing'}]},{document,bindings}),'summons[0]');
 rejects(domain({summons:[declaration]}),'summons[0]',/unresolved/);
 const expired=structuredClone(document);expired.state.minute=605;
 const bad=domain({summons:[declaration]},{document:expired,bindings});rejects(bad,'summons[0]',/upkeep/);assert.deepEqual(bad.document,expired);assert.equal(bad.bindings.agency_summon,undefined);
});
test('agency native activities: unfinished combat and conversation import premises without resolving them',()=>{
 // A3 V/W / 06 §6.8–6.9: native initializers now exist. Preserve the
 // original no-fabricated-outcome guarantee rather than demanding a gap.
 for(const [field,setup] of [['combats',corpus('059')],['conversations',corpus('050')]]){
  const premise=structuredClone(setup);delete premise[field];
  const document=applyIntentSetup(engine,initial,premise).document;
  const result=domain({[field]:setup[field]},{document});assert.deepEqual(result.setupUnmet,[]);
  const key=field==='combats'?'combat_encounter':'conversation',activity=result.document.state.records[`${key}:${setup[field][0].id}`];
  assert.equal(activity.active,true);
  if(field==='combats'){assert.equal(activity.round,1);assert.equal(activity.playerActedThisRound,false);}
  else assert.equal(activity.mainTopicFinished,true);
  for(const key of ['player','npcs','inventory','minute','consentEvents'])assert.deepEqual(result.document.state[key],document.state[key]);
  assert.deepEqual(result.document.ledger,document.ledger);
  if(field==='combats'){
   const withoutHistory=structuredClone(document);delete withoutHistory.state.records['world_event:a3v2_059_hostile'];
   const bad=domain({[field]:setup[field]},{document:withoutHistory});rejects(bad,`${field}[0]`,/native hostile event/);assert.deepEqual(bad.document,withoutHistory);
  }
  rejects(domain({[field]:[{...setup[field][0],participants:['player','missing']}]}),`${field}[0]`);
 }
});
test('agency timed demonstration: native active window never manufactures teaching consent',()=>{
 // 05 §5.4 / 06 §6.3: U now imports a real workstation-bound timed record.
 const setup=corpus('017'),document=applyIntentSetup(engine,initial,{minute:setup.minute,location:setup.location,present:setup.present}).document;
 const result=domain({demonstrations:setup.demonstrations},{document}),row=setup.demonstrations[0];
 assert.deepEqual(result.setupUnmet,[]);
 assert.ok(demonstrationAt(engine,result.document.state,row.actor,row.subject,row.toMinute));
 assert.equal(demonstrationAt(engine,result.document.state,row.actor,row.subject,row.toMinute+1),null);
 assert.equal(teachingAvailable(engine,result.document.state,row.actor),false);
 assert.deepEqual(result.document.state.consentEvents,document.state.consentEvents);
 assert.equal(result.document.state.minute,document.state.minute);
 const expired=structuredClone(result.document);expired.state.minute=row.toMinute;
 assert.equal(demonstrationAt(engine,expired.state,row.actor,row.subject),null);
 rejects(domain({demonstrations:[{...row,toMinute:0}]},{document}),'demonstrations[0]',/invalid/i);
});
test('agency vocations: qualified historical source is not replayed as a new change, no false credentials',()=>{
 // 05 §5.7 / 06 §6.5: T restores qualification, but still requires its skill.
 const event={id:'native_qualified',verb:'qualified',actor:'npc_hw_luqing',vocation:'vocation_advocate'},document=domain({abilitiesByActor:{npc_hw_luqing:{skills:{skill_literacy:450}}}},{document:eventFixture(event)}).document,bindings={alias:event.id};
 const declaration={actor:'npc_hw_luqing',id:'vocation_advocate',sourceEvent:'alias',conflictOfInterest:false};
 const result=domain({vocations:[declaration]},{document,bindings});assert.deepEqual(result.setupUnmet,[]);
 assert.equal(result.document.state.npcs.npc_hw_luqing.vocation.sourceEvent,event.id);
 assert.equal(advocateService(engine,result.document.state,event.actor).proficiency,450);
 assert.ok(personCareer(engine,result.document.state,event.actor).value.occupation);
 assert.deepEqual(result.document.state.npcs[event.actor].growth,document.state.npcs[event.actor].growth);
 assert.deepEqual(result.document.state.npcs[event.actor].certifications,document.state.npcs[event.actor].certifications);
 assert.deepEqual(result.document.state.records,document.state.records);
 assert.equal(result.document.state.minute,document.state.minute);
 rejects(domain({vocations:[{...declaration,id:'missing'}]},{document,bindings}),'vocations[0]',/invalid/i);
 const unqualified=domain({abilitiesByActor:{npc_hw_luqing:{skills:{skill_literacy:0}}}},{document:eventFixture(event)}).document;
 rejects(domain({vocations:[declaration]},{document:unqualified,bindings}),'vocations[0]',/invalid/i);
});
test('agency rites: native host/time/offerings remain scheduled and unconsumed until real participation',()=>{
 // A3 X / 13 §13.5: importing a one-stage hosted schedule is now supported;
 // it must still neither consume offerings nor fabricate a completed project.
 const premise=structuredClone(corpus('074')),declaration=premise.rites[0];delete premise.rites;
 const base=applyIntentSetup(engine,initial,premise),document=base.document,bindings=base.bindings;
 const result=domain({rites:[declaration]},{document,bindings});assert.deepEqual(result.setupUnmet,[]);
 const rite=result.document.state.records[`hosted_rite:${declaration.id}`];
 assert.equal(rite.host,declaration.host);assert.equal(rite.start,declaration.start);assert.equal(rite.end,declaration.end);assert.equal(rite.hostAuthorized,true);
 assert.deepEqual(rite.offerings,declaration.offerings);assert.equal(rite.sourceEvent,'world_event:a3v2_074_rite_scheduled');
 for(const key of ['player','npcs','inventory','minute','effects','consentEvents'])assert.deepEqual(result.document.state[key],document.state[key]);
 assert.deepEqual(result.document.ledger,document.ledger);assert.deepEqual(result.document.holdings.rows,document.holdings.rows);
 assert.equal(Object.values(result.document.state.records).some(r=>r.category==='faith_ritual'||r.category==='rite_project'),false);
 rejects(domain({rites:[{...declaration,offerings:[{item:'missing',quantity:1}]}]},{document,bindings}),'rites[0]',/invalid/i);
});
test('agency each field: illegal container and unknown declaration fields are unmet',()=>{
 for(const field of ['abilitiesByActor','vocations','reading','practiceState','knowledge','mapKnowledge','demonstrations','combats','conversations','summons','rites']){
  rejects(domain({[field]:null}),field);
  if(field!=='abilitiesByActor')rejects(domain({[field]:[{invented:true}]}),`${field}[0]`);
 }
});
test('agency existing presence: an explicitly unconscious teacher stays present and unconscious, not cured or removed',()=>{
 const result=applyIntentSetup(engine,initial,corpus('101'));
 assert.ok(!result.setupUnmet.some(r=>/^(present|abilitiesByActor)/.test(r.item)),JSON.stringify(result.setupUnmet));
 assert.equal(result.document.state.npcs.npc_bs_076_3.status,'昏迷');assert.equal(result.document.state.npcs.npc_bs_076_3.location,corpus('101').location);
 const dead=structuredClone(initial);dead.state.npcs.npc_hw_luqing.hp=0;
 rejects(applyIntentSetup(engine,dead,{present:['npc_hw_luqing'],status:{npc_hw_luqing:'昏迷'}}),'present[0]',/dead or gone/);
});
test('agency existing holdings: identical native ownership is reused, conflicting terms remain rejected',()=>{
 const setup=corpus('081'),result=applyIntentSetup(engine,initial,{location:setup.location,holdings:setup.holdings});
 assert.deepEqual(result.setupUnmet,[]);
 assert.ok(result.bindings[setup.holdings[0].id]);
 const d=engine.primitiveDraft(result.document);
 assert.equal(aliveHoldings(d,{kind:'owns',holder:'npc_hw_linsui',subject:'bld_hw_qingdeng'}).length,1);
 const bad=applyIntentSetup(engine,initial,{holdings:[{...setup.holdings[0],terms:{share:0.5}}]});rejects(bad,'holdings[0]');
});
test('agency existing office holder selector: no present-clerk substitution or appointment',()=>{
 const setup=corpus('105'),result=applyIntentSetup(engine,initial,{instances:setup.instances,holdings:setup.holdings});
 rejects(result,'holdings[0]',/existing_legal_town_head/);
 assert.ok(!aliveHoldings(engine.primitiveDraft(result.document),{kind:'holds_office',subject:result.bindings[setup.instances[0].id]}).length);
});

// Exercise the public cross-module contract without depending on unmerged
// loaders. The unique test field is absent from the corpus and all other tests.
registerSetupLoader({fields:['agencyTestPremises'],order:60,load(ctx,setup){
 const r=setup.agencyTestPremises;
 if(ctx.native('agencyTestPremises',d=>{
  holdingSet(d,engine,['state','itemInstances','native_staff'],{id:'native_staff',item:'item_staff',owner:'player',status:'持有',location:'bld_hw_post',durability:100},'a3-score-setup');
  holdingSet(d,engine,['state','obligations','native_loan'],{id:'native_loan',kind:'loan',debtor:'player',creditor:'bank_hw_post',amount:2,paid:0},'a3-score-setup');
  holdingSet(d,engine,['state','records','world_event:native_order'],{id:'native_order',category:'world_event',verb:'arrest_order',minute:599,target:'npc_hw_wushuo'},'a3-score-setup');
 }))Object.assign(ctx.bindings,{[r.staff]:'native_staff',[r.loan]:'native_loan',[r.order]:'native_order'});
}});
test('agency existing holdings wait for native item/instrument bindings and resolve nested references',()=>{
 const setup=corpus('037'),staff=setup.itemInstances[0].id,loan=setup.obligations[0].id;
 const result=applyIntentSetup(engine,initial,{minute:600,holdings:setup.holdings,itemInstances:setup.itemInstances,obligations:setup.obligations,agencyTestPremises:{staff,loan,order:'unused'}});
 // Unmerged domain fields are intentionally still unmet; the builtin holdings
 // must use native records supplied by the earlier registered fixture loader.
 assert.ok(!result.setupUnmet.some(r=>r.item.startsWith('holdings')),JSON.stringify(result.setupUnmet));
 const pledge=result.document.holdings.rows[result.bindings.a3v2_037_pledge];
 assert.equal(pledge.holder,'native_loan');assert.equal(pledge.subject,'native_staff');assert.equal(pledge.terms.obligation,'native_loan');
 const owns=result.document.holdings.rows[result.bindings.a3v2_037_owns];assert.equal(owns.subject,'native_staff');
});
// S4: replace a snapshot whose basis alias manufactured authority with a real
// appointment source. The published arrest seat keeps its exact operation;
// an alias to an event cannot extend it to raw movement or arbitrary detention.
test('agency office authority resolves its real appointment source without broadening scope',async()=>{
 const name='office_bs_arrest_officer',issuer='npc_bs_townhead';
 let document=officeScene(engine,initial);
 let out=await officeCall(engine,document,'apply',{name},'agency-office-apply');document=out.document;
 const request=out.result.application;
 out=await engine.reduce(document,{tool:'world_time',args:{minutes:60},eventId:'agency-office-wait'});document=applyPatches(document,out.patches);
 out=await officeCall(engine,document,'decide',{name,request,authority:issuer},'agency-office-decide');document=out.document;
 out=await officeCall(engine,document,'appoint',{name,request,authority:issuer},'agency-office-appoint');document=out.document;
 for(const destination of ['loc_bs_guanqian','bld_bs_watch']){
  const moved=await engine.reduce(document,{tool:'world_act',eventId:`agency-walk:${destination}`,args:{action:'core:move',slots:{destination,mode:'walk'}}});
  assert.equal(moved.result.receipt.status,'committed');document=applyPatches(document,moved.patches);
 }
 const current=institutionOffices(engine,document.state).find(o=>o.id===name);
 assert.equal(officeOnDuty(engine,document.state,current),true);
 assert.equal(authority(primitiveContext(engine,document),'player','execute_arrest',name).allowed,true);
 assert.equal(current.sourceEvent,'agency-office-appoint');
 assert.equal(document.state.records['governance_source:agency-office-appoint'].result.appointment.sourceEvent,current.sourceEvent);
 const forged=applyIntentSetup(engine,document,{instances:[corpus('057').instances[0]]});
 assert.ok(forged.setupUnmet.some(e=>e.item==='instances[0]'));
 assert.deepEqual(institutionOffices(engine,forged.document.state).find(o=>o.id===name).authority,current.authority);
 assert.deepEqual(current.authority.operations,['execute_arrest']);
 assert.equal(authority(primitiveContext(engine,document),'player','holding.open','npc_hw_wushuo',{kind:'guest_of',variant:'detained'}).allowed,false);
 assert.equal(authority(primitiveContext(engine,document),'player','collect_fine',name).allowed,false);
});
