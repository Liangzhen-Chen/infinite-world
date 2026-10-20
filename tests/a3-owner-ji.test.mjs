import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup,scoreRows,executeIntent,signatureMatches,validateCheckBranch} from '../tools/a3-score.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {tmpRoot} from '../tools/tmp-root.mjs';
import {initializeEncounter,activeEncounters} from '../server-plugin/combat.mjs';
import {initializeConversation,activeConversation} from '../server-plugin/dialogue.mjs';
import {initializeHostedRite} from '../server-plugin/faith.mjs';
import {prepareOpenAction} from '../server-plugin/open-actions.mjs';
const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=engine.initialFromLegacy(seed,'a3-owner-ji');
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r7.json','utf8'));
const row=id=>corpus.find(r=>r.id===`A3V2-${id}`);
const context={origin:'initial',eventId:'ji-initial'};
function setup(id,change=()=>{}){
 const premise=structuredClone(row(id).setup);change(premise);
 const out=applyIntentSetup(engine,initial,premise);assert.deepEqual(out.setupUnmet,[]);return out.document;
}
const act=(action,slots,eventId)=>({tool:'world_act',eventId,args:{action,slots}});
const participate=eventId=>act('core:settlement.faith_rite',{org:'bld_hw_altar',choice:'a3v2_074_rite'},eventId);

test('V: native initializer preserves unfinished hostility without spending a turn, harm, stock or time',()=>{
 const document=setup('059'),s=document.state,r=activeEncounters(engine,s)[0];
 assert.equal(r.id,'a3v2_059_combat');assert.equal(r.active,true);assert.equal(r.round,1);assert.equal(r.playerActedThisRound,false);
 const premise=structuredClone(row('059').setup);delete premise.combats;
 const beforeCombat=applyIntentSetup(engine,initial,premise).document;
 assert.deepEqual(s.player,beforeCombat.state.player);assert.deepEqual(document.ledger,beforeCombat.ledger);assert.deepEqual(s.inventory,beforeCombat.state.inventory);
 assert.equal(s.minute,600);assert.equal(s.inventory.item_staff.durability,100);
 assert.equal(s.npcs.npc_hw_wushuo.hp,initial.state.npcs.npc_hw_wushuo.hp);
 for(const id of ['059','060','061','062']){
  const source=structuredClone(row(id).setup);delete source.history;
  if(!source.combats)continue;
  const bad=applyIntentSetup(engine,initial,source);
  assert.ok(bad.setupUnmet.some(r=>r.item==='combats[0]'));assert.equal(activeEncounters(engine,bad.document.state).length,0);
 }
});

test('V: real combat spends the current round, includes retaliation, opens the next round and rejects an already spent turn',async()=>{
 const document=setup('060');document.state.player.hp=1000;document.state.player.maxHp=1000;
 const before=structuredClone(document),input=act('core:combat',{target:'npc_hw_wushuo',weapon:'item_staff',intent:'defend'},'ji-defend');
 const out=await engine.reduce(document,input),after=applyPatches(document,out.patches),r=after.state.records['combat_encounter:a3v2_060_combat'];
 assert.deepEqual(document,before);assert.equal(r.lastRound.actor,'player');assert.equal(r.lastRound.intent,'defend');assert.equal(r.lastRound.playerActed,true);
 assert.equal(r.round,2);assert.equal(r.playerActedThisRound,false);assert.equal(r.active,true);
 assert.equal(after.state.inventory.item_staff.durability,99);assert.ok(out.result.received>=0);assert.equal(after.state.player.hp,1000-out.result.received);
 const again=await engine.reduce(after,{...input,eventId:'ji-next-round'});assert.equal(applyPatches(after,again.patches).state.records['combat_encounter:a3v2_060_combat'].round,3);
 const spent=setup('060',s=>s.combats[0].playerActedThisRound=true),snapshot=structuredClone(spent);
 await assert.rejects(engine.reduce(spent,input),/already acted this round/);assert.deepEqual(spent,snapshot);
 const remote=structuredClone(document);remote.state.npcs.npc_hw_wushuo.location='loc_hw_gate';assert.deepEqual(activeEncounters(engine,remote.state),[]);
});

test('V: a lone bystander is not inferred to be an opponent from guard prose',()=>{
 const document=setup('060');delete document.state.records['combat_encounter:a3v2_060_combat'];delete document.state.records['world_event:a3v2_060_hostile'];
 const proposal={...row('060').proposal,intent:'用手里的木杖防守'};
 const plan=prepareOpenAction(engine,document,proposal);
 assert.equal(plan.status,'needs_slots');assert.ok(plan.needsSlots.missing.includes('target'));
});

test('W: finished topic remains a live conversation until goodbye; goodbye does not move either actor or mint agreement',async()=>{
 const document=setup('050'),before=structuredClone(document),r=activeConversation(document.state,'npc_hw_chenbai');
 assert.equal(r.mainTopicFinished,true);assert.equal(r.active,true);assert.deepEqual(document.state.dialogues,initial.state.dialogues);
 const out=await engine.reduce(document,act('core:dialogue.leave',{subject:'npc_hw_chenbai'},'ji-leave')),after=applyPatches(document,out.patches);
 assert.equal(activeConversation(after.state,'npc_hw_chenbai'),null);
 assert.equal(after.state.records[`conversation:${r.id}`].active,false);assert.equal(after.state.records[`conversation:${r.id}`].mainTopicFinished,true);
 assert.equal(after.state.location,before.state.location);assert.equal(after.state.npcs.npc_hw_chenbai.location,before.state.npcs.npc_hw_chenbai.location);
 assert.deepEqual(after.state.consentEvents,before.state.consentEvents);assert.deepEqual(document,before);
 const unfinished=setup('050',s=>s.conversations[0].mainTopicFinished=false);
 const leave=await engine.reduce(unfinished,act('core:dialogue.leave',{subject:'npc_hw_chenbai'},'ji-unfinished-leave'));
 assert.equal(applyPatches(unfinished,leave.patches).state.records['conversation:a3v2_050_conversation'].mainTopicFinished,false);
});

test('X: scheduled source binding grants one hosted role without an office, expenditure, participation or omen',()=>{
 const document=setup('074'),r=document.state.records['hosted_rite:a3v2_074_rite'];
 assert.equal(r.sourceEvent,'world_event:a3v2_074_rite_scheduled');assert.equal(r.host,'npc_hw_chenbai');assert.equal(r.hostAuthorized,true);
 assert.equal(document.state.inventory.item_ration.quantity,1);assert.equal(document.state.minute,600);
 assert.deepEqual(document.state.effects,initial.state.effects);assert.equal(Object.values(document.state.records).filter(r=>r.category==='faith_ritual').length,0);
 const premise=structuredClone(row('074').setup);delete premise.rites;
 const beforeRite=applyIntentSetup(engine,initial,premise).document;
 assert.deepEqual(document.holdings.rows,beforeRite.holdings.rows);
 for(const change of [s=>s.rites[0].host='npc_hw_wushuo',s=>s.history[0].location='bld_hw_council',s=>s.rites[0].sourceEvent='missing',s=>s.rites[0].hostAuthorized=false]){
  const s=structuredClone(row('074').setup);change(s);const out=applyIntentSetup(engine,initial,s);
  assert.ok(out.setupUnmet.some(r=>r.item==='rites[0]'));assert.equal(out.document.state.records['hosted_rite:a3v2_074_rite'],undefined);
 }
});

test('X: actual hosted participation consumes only its declared supply and time, exposes a native receipt and cannot be repeated',async()=>{
 const document=setup('074'),before=structuredClone(document),out=await engine.reduce(document,participate('ji-participate')),after=applyPatches(document,out.patches);
 assert.deepEqual(document,before);assert.equal(engine.quantity(engine.primitiveDraft(after),'player','item_ration'),0);
 assert.equal(after.state.minute,600+engine.rules.faith.ordinaryRite.minutes);assert.equal(after.state.player.coins,before.state.player.coins);
 const record=after.state.records['hosted_participation:a3v2_074_rite:player'];assert.equal(record.host,'npc_hw_chenbai');assert.equal(record.response.applied,false);
 assert.deepEqual(after.state.effects,before.state.effects);assert.ok(out.result.receipt.applied.some(e=>e.op==='emit'&&e.payload.kind==='ritual_participation'));
 assert.ok(out.result.receipt.applied.some(e=>e.op==='time'&&e.mode==='rite_stage'));
 await assert.rejects(engine.reduce(after,participate('ji-repeat')),/already completed/);
});

test('X: revoked, wrong-role and expired permission, absent host, closed window and missing supply fail without consuming',async()=>{
 const variants=[
  d=>d.state.consentEvents.push({type:'consent_revoked',from:'npc_hw_chenbai',consent:'a3v2_074_participate_1',at:600}),
  d=>d.state.consentEvents.find(r=>r.scope==='participate').terms.role='host',
  d=>d.state.consentEvents.find(r=>r.scope==='participate').until=600,
  d=>d.state.npcs.npc_hw_chenbai.location='loc_hw_gate',
  d=>d.state.minute=720,
  d=>d.state.minute=539,
  d=>d.state.minute=720-engine.rules.faith.ordinaryRite.minutes+1,
  d=>{delete d.state.inventory.item_ration;}
 ];
 for(const mutate of variants){
  const document=setup('074');mutate(document);const before=structuredClone(document);
  let out,error;
  try{out=await engine.reduce(document,participate('ji-reject'));}catch(caught){error=caught;}
  // An unavailable participant is rejected by the outer action precondition;
  // host permission/window/material failures reject in the native handler.
  if(out){assert.equal(out.result.ok,false);assert.equal(out.result.receipt.status,'rejected');assert.deepEqual(out.patches,[]);}else assert.ok(error);
  assert.deepEqual(document,before);
 }
});

test('V/W/X: native initializers reject proposal origin; setup rejects undeclared success fields',()=>{
 for(const [id,field,initialize]of [['059','combats',initializeEncounter],['050','conversations',initializeConversation],['074','rites',initializeHostedRite]]){
  const document=setup(id),d=engine.primitiveDraft(document),before=structuredClone(document);
  assert.throws(()=>initialize(d,engine,row(id).setup[field][0],{origin:'proposal',eventId:'fake'}));assert.deepEqual(d.document,before);
  const s=structuredClone(row(id).setup);s[field][0].success=true;
  const out=applyIntentSetup(engine,initial,s);assert.ok(out.setupUnmet.some(r=>r.item===`${field}[0]`));
 }
});

test('V/W/X: native state and real consumers survive storage reload, export/import, rollback and replay',async t=>{
 for(const [id,input]of [['060',act('core:combat',{target:'npc_hw_wushuo',intent:'defend'},'ji-archive-combat')],['050',act('core:dialogue.leave',{subject:'npc_hw_chenbai'},'ji-archive-leave')],['074',participate('ji-archive-rite')]]){
  const directory=await fs.mkdtemp(path.join(tmpRoot(),'a3-ji-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const document=setup(id);if(id==='060'){document.state.player.hp=1000;document.state.player.maxHp=1000;}
  const reducer=(document,input)=>engine.reduce(document,input);
  const store=new CampaignStorage(directory,{reducer});await store.create({id:'ji',worldVersion:'test',document});
  const event={id:input.eventId,anchor:'ji-action',input};await store.transact('ji',event,reducer);
  const saved=(await new CampaignStorage(directory,{reducer}).read('ji')).document;
  const imported=await store.import(await store.export('ji'),'ji_copy');assert.deepEqual(imported.document,saved);
  await store.reconcile('ji',[]);assert.deepEqual((await store.read('ji')).document,document);
  await store.transact('ji',{...event,id:`${event.id}-again`},reducer);
  const replay=(await store.read('ji')).document;
  assert.deepEqual(replay,saved);
  assert.ok(Object.values(replay.state.records).some(r=>['combat_encounter','conversation','hosted_rite'].includes(r.category)));
  if(id==='074')assert.equal(engine.quantity(engine.primitiveDraft(replay),'player','item_ration'),0);
  if(id==='050')assert.equal(activeConversation(replay.state,'npc_hw_chenbai'),null);
  if(id==='060')assert.equal(replay.state.records['combat_encounter:a3v2_060_combat'].round,2);
 }
});

test('W/X: unchanged corpus routes, commits, signs and constructs through native consumers',async()=>{
 const result=await scoreRows([row('050'),row('074')],{world});
 for(const r of result.results)assert.deepEqual(r.scores,{route:true,signature:true,outOfBounds:true,supported:true,constructor:true});
});

test('V: unchanged attack, defense and retreat signatures include real native outcomes and both escape branches',async()=>{
 const scored=await scoreRows(['059','060','061'].map(row),{world});
 for(const r of scored.results)assert.deepEqual(r.scores,{route:true,signature:true,outOfBounds:true,supported:true,constructor:true},JSON.stringify({id:r.id,effects:r.actual.signatureEffects,branches:r.checkBranches}));
 const attack=scored.results[0];
 assert.ok(attack.actual.signatureEffects.some(e=>e.op==='vital'&&e.target==='npc_hw_wushuo'&&e.weapon==='item_staff'));
 const defend=scored.results[1].actual.signatureEffects.find(e=>e.op==='status'&&e.status==='combat_defense');
 assert.equal(defend.consumed,true);assert.equal(defend.result.after.defense.incomingMultiplier,0.5);
 const retreat=scored.results[2];
 for(const branch of ['success','failure'])assert.equal(retreat.checkBranches[branch].ok,true);
 assert.ok(retreat.checkBranches.success.actual.signatureEffects.some(e=>e.op==='move'&&e.to==='loc_hw_gate'));
 assert.equal(retreat.checkBranches.failure.actual.signatureEffects.some(e=>e.op==='move'),false);
});

test('V: retreat success walks every edge of the known path; failure preserves position and the live encounter',async()=>{
 const scored=(await scoreRows([row('061')],{world})).results[0];
 for(const branch of ['success','failure']){
  const base={...initial,randomSeed:scored.checkBranches[branch].randomSeed};
  const run=await executeIntent(engine,base,row('061'));
  assert.equal(run.actual.error,null);const s=run.document.state,r=s.records['combat_encounter:a3v2_061_combat'];
  assert.equal(r.lastRound.escaped,branch==='success');
  if(branch==='success'){
   assert.equal(s.location,'loc_hw_gate');assert.equal(r.active,false);
   // The authored northwood -> gate route passes through loc_hw. Preserve both
   // native edges and their travel time; do not invent a direct adjacent edge.
   const route=engine.route('loc_hw_northwood','loc_hw_gate','walk',600,base.randomSeed);
   assert.ok(r.lastRound.movement.minutes>0);assert.deepEqual(r.lastRound.movement.edges,route.edges);
   assert.equal((s.minute-600)*60+(s.subMinuteSeconds??0),r.lastRound.movement.minutes*60+engine.rules.combat.exchangeSeconds);
   assert.equal(r.location,'loc_hw_northwood');
  }else{
   assert.equal(s.location,'loc_hw_northwood');assert.equal(r.active,true);assert.equal(r.lastRound.movement,undefined);
   // The branch validator must catch a forged successful movement on failure.
   const forged=structuredClone(run);forged.document.state.location='loc_hw_gate';
   assert.equal(validateCheckBranch(engine,forged,row('061'),'failure').ok,false);
  }
 }
 const document=setup('061'),snapshot=structuredClone(document);
 await assert.rejects(engine.reduce(document,act('core:combat',{target:'npc_hw_wushuo',intent:'flee',destination:'loc_bs'},'ji-remote-retreat')),/known passable path/);
 await assert.rejects(engine.reduce(document,act('core:combat',{target:'npc_hw_wushuo',intent:'flee',destination:'invented moon'},'ji-unknown-retreat')),/Unknown/);
 assert.deepEqual(document,snapshot);
 const privatePath=structuredClone(document);
 Object.assign(privatePath.memories['loc_hw_gate::a3-map:known_path'],{private:true,permittedRecipients:['npc_hw_wushuo']});
 const privateBefore=structuredClone(privatePath);
 await assert.rejects(engine.reduce(privatePath,act('core:combat',{target:'npc_hw_wushuo',intent:'flee',destination:'loc_hw_gate'},'ji-private-path')),/known passable path/);
 assert.deepEqual(privatePath,privateBefore);
});

test('V: native retaliation and wear evidence cannot excuse unrelated or inflated effects',async()=>{
 const run=await executeIntent(engine,initial,row('059'));
 assert.equal(signatureMatches(row('059').expected.signature,run.effects,run.receipt,run.requested,world),true);
 const retaliation=run.effects.find(e=>e.op==='vital'&&e.target==='player');assert.ok(retaliation);
 const inflated=structuredClone(run.effects);inflated.find(e=>e===retaliation||e.op==='vital'&&e.target==='player').delta--;
 assert.equal(signatureMatches(row('059').expected.signature,inflated,run.receipt,run.requested,world),false);
 const extra={...structuredClone(retaliation),target:'npc_hw_ayan'};
 assert.equal(signatureMatches(row('059').expected.signature,[...run.effects,extra],run.receipt,run.requested,world),false);
 const wear=run.effects.find(e=>e.op==='fact.set'&&e.field==='durability');assert.ok(wear);
 const receipt=structuredClone(run.receipt);receipt.legacy.spent.toolWear[0].after--;
 assert.equal(signatureMatches(row('059').expected.signature,run.effects,receipt,run.requested,world),false);
});
