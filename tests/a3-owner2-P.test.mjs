import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {restoreBodySnapshot,restoreRevivalBinding,restoreDeathSnapshot} from '../server-plugin/primitives-body.mjs';
import {restorePhysicalSnapshot,restoreLiquidSnapshot} from '../server-plugin/primitives-effects.mjs';
import {restoreBossTactic,bossCounter,restoreBossInstance} from '../server-plugin/bosses.mjs';
import {restoreWoundSnapshot,medicalConditions} from '../server-plugin/medicine-state.mjs';
import {capacity} from '../server-plugin/action-capacity.mjs';
import {physicalItem,containerUnits} from '../server-plugin/items.mjs';
import {environmentFeatures} from '../server-plugin/environment.mjs';
import {isPhysicallyDead} from '../server-plugin/holdings.mjs';
import {recordHistoricalEvent} from '../server-plugin/world-events.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const initial=()=>engine.createCharacter(seed,{},'a3-owner2-p');
const setupOf=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`).setup);
const load=setup=>applyIntentSetup(engine,initial(),setup);
const source={origin:'initial',sourceEvent:'initial-physical-test'};

test('P1: sleeping presence stays asleep, is not coma, and cannot buy a night service',async()=>{
 const loaded=load(setupOf(131));
 assert.equal(loaded.setupUnmet.some(r=>r.item.startsWith('actorStates')||r.item.startsWith('present.')),false,JSON.stringify(loaded.setupUnmet));
 const actor=loaded.document.state.npcs.npc_hw_linsui;
 assert.equal(actor.status,'正常');assert.equal(actor.activity,'睡眠');
 const before=structuredClone(loaded.document);
 await assert.rejects(engine.reduce(before,{tool:'world_trade',args:{seller:'npc_hw_linsui',item:'item_bread',quantity:1},eventId:'sleep-trade'}));
 assert.deepEqual(loaded.document,before);
 const d=engine.primitiveDraft(loaded.document);
 assert.throws(()=>restoreBodySnapshot(d,engine,'npc_hw_linsui',{conscious:true},source),/Sleeping/);
});

test('P1: explicit vitals preserve level and source; coma has no voluntary capacity',()=>{
 const loaded=load(setupOf(208)),p=loaded.document.state.player;
 assert.ok(loaded.setupUnmet.some(r=>r.item==='body.player'&&/structured/.test(r.reason)));
 assert.equal(p.hp,initial().state.player.hp);assert.equal(p.maxHp,initial().state.player.maxHp);
 assert.equal(p.level,initial().state.player.level);
 const d=engine.primitiveDraft(loaded.document);
 recordHistoricalEvent(d,engine,{id:'explicit-body-contract',verb:'body_initialized',actor:'player',minute:599,source:{kind:'corpus_premise',row:'native-test'},payload:{maxHp:80}});
 restoreBodySnapshot(d,engine,'player',{hp:60,maxHp:80},{origin:'initial',sourceEvent:'world_event:explicit-body-contract'});
 assert.equal(d.get('state','player','hp'),60);assert.equal(d.get('state','player','maxHp'),80);assert.equal(d.get('state','player','level'),p.level);
 assert.equal(d.get('state','player','vitalOverride','sourceEvent'),'world_event:explicit-body-contract');
 const complete=setupOf(208);complete.history.push({id:'explicit-body-contract',verb:'body_initialized',actor:'player',at:599,source:{kind:'corpus_premise',row:'native-test'},maxHp:80});complete.body.player.maxHpSource='explicit-body-contract';
 const sourced=load(complete);assert.equal(sourced.setupUnmet.some(r=>r.item.startsWith('body')),false);assert.equal(sourced.document.state.player.hp,60);assert.equal(sourced.document.state.player.maxHp,80);
 restoreBodySnapshot(d,engine,'npc_hw_taozhi',{conscious:false},source);
 assert.equal(d.get('state','npcs','npc_hw_taozhi','status'),'昏迷');
 assert.equal(capacity({engine,document:d.document},'npc_hw_taozhi','healing').level,'none');
 for(const row of [{hp:81,maxHp:80},{hp:1},{hp:-1,maxHp:80},{hp:1,maxHp:0},{conscious:'false'},{activity:'sleeping',conscious:true}])assert.throws(()=>restoreBodySnapshot(d,engine,'player',row,source));
 assert.throws(()=>restoreBodySnapshot(d,engine,'player',{hp:60,maxHp:80},{...source,origin:'proposal'}),/authority/);
 assert.throws(()=>restoreBodySnapshot(d,engine,'missing',{conscious:false},source),/authority/);
});

test('P1: death runs the lifecycle once and revival consumes the registered original anchor',async()=>{
 const loaded=load(setupOf(170));assert.deepEqual(loaded.setupUnmet,[]);
 const before=loaded.document,p=before.state.player;
 assert.equal(isPhysicallyDead(engine,before,'player'),true);assert.equal(p.hp,0);assert.equal(p.revivalAnchor,'bld_hw_altar');
 assert.equal(p.xp,Math.max(0,100-p.level*10));assert.equal(p.deathSource,'world_event:a3v2_170_event');
 assert.throws(()=>restoreDeathSnapshot(engine.primitiveDraft(before),engine,{sourceEvent:p.deathSource},{origin:'initial'}),/already/);
 assert.throws(()=>restoreRevivalBinding(engine.primitiveDraft(before),engine,{actor:'player',location:'loc_bs',sourceEvent:'world_event:a3v2_170_anchor_event'},{origin:'initial'}),/Invalid/);
 const out=await engine.reduce(before,{tool:'world_revive',args:{},eventId:'initial-revive'}),after=applyPatches(before,out.patches);
 assert.equal(after.state.location,'bld_hw_altar');assert.equal(isPhysicallyDead(engine,after,'player'),false);assert.ok(after.state.player.hp>0);
 assert.equal(after.state.player.xp,p.xp);
});

test('P2: same native boss stores sourced tactics and existing combat counter consumes them',()=>{
 const raw=load(setupOf(172));assert.ok(raw.setupUnmet.some(r=>r.item==='instances[0]'&&/unambiguous/.test(r.reason)));
 const explicit=setupOf(172);explicit.instances[0].boss='boss_mud_tusk';
 const loaded=load(explicit),d=engine.primitiveDraft(loaded.document),boss='boss_mud_tusk';
 assert.equal(d.get('state','creatures',boss,'boss'),boss);
 assert.equal(loaded.setupUnmet.some(r=>r.item==='instances[0]'),false,JSON.stringify(loaded.setupUnmet));
 assert.ok(loaded.setupUnmet.some(r=>r.item.startsWith('history')&&/date/.test(r.reason)));
 assert.equal(d.get('state','creatures',boss,'battleMemory','tactics','armed'),undefined);
 recordHistoricalEvent(d,engine,{id:'known-armed',verb:'combat_observed',actor:boss,minute:599,source:{kind:'corpus_premise',row:'native-test'},payload:{target:'player',tactic:'armed',count:2}});
 restoreBossTactic(d,engine,boss,{sourceEvent:'world_event:known-armed',tactic:'armed',count:2},{origin:'initial'});
 assert.equal(bossCounter(d,engine,boss,'armed').adapted,true);
 const memory=structuredClone(d.get('state','creatures',boss,'battleMemory'));
 restoreBossTactic(d,engine,boss,{sourceEvent:'world_event:known-armed',tactic:'armed',count:2},{origin:'initial'});
 assert.deepEqual(d.get('state','creatures',boss,'battleMemory'),memory);
 for(const args of [{sourceEvent:'forged',tactic:'armed',count:2},{sourceEvent:'world_event:known-armed',tactic:'unarmed',count:2},{sourceEvent:'world_event:known-armed',tactic:'armed',count:-1}])assert.throws(()=>restoreBossTactic(d,engine,boss,args,{origin:'initial'}));
 assert.throws(()=>restoreBossInstance(d,engine,{boss,location:'loc_bs'},source));
});

test('P3: same-stock liquid and negative tests survive inspection without duplicating water',async()=>{
 const loaded=load(setupOf(186)),id='item_a3v2_186_water',d=engine.primitiveDraft(loaded.document);
 assert.equal(loaded.setupUnmet.some(r=>r.item.startsWith('objects')),false,JSON.stringify(loaded.setupUnmet));
 assert.equal(engine.quantity(d,'player','item_water'),0);
 assert.equal(containerUnits(d,id).filter(u=>u.item==='item_water').length,8);
 // bindContainerWater preserves the native item_water baseline salt amount.
 assert.deepEqual(d.get('state','records',`physical_feature:${id}`,'state'),{waterMl:2000,turbidity:55,toxinUg:0,pathogenRisk:0,saltMg:0});
 assert.deepEqual(physicalItem(d,engine,id).qualityTest,{dissolvedToxins:false,pathogens:false});
 assert.equal(environmentFeatures(engine.scoped(loaded.document),loaded.document).some(f=>f.id===id),true);
 const inspected=await engine.reduce(loaded.document,{tool:'world_environment',args:{operation:'inspect',target:id},eventId:'inspect-original-water'});
 assert.equal(inspected.result.physical.turbidity,55);assert.equal(inspected.result.units.length,8);
 assert.throws(()=>restoreLiquidSnapshot(d,engine,id,{...source,origin:'proposal'}));
 assert.throws(()=>restoreLiquidSnapshot(d,engine,'forged',source));
 assert.throws(()=>restoreLiquidSnapshot(d,engine,id,source),/already/);
 const bad=setupOf(186);bad.objects[0].qualityTest.pathogens='safe';
 assert.ok(load(bad).setupUnmet.some(r=>r.item.startsWith('objects')));
 const forged=setupOf(186);forged.objects[0].contents[0].quantity=9;
 const rejected=load(forged);assert.ok(rejected.setupUnmet.some(r=>/conflicts/.test(r.reason)));assert.equal(rejected.document.state.inventory.item_water.quantity,8);
});

test('P3: existing water magic consumes the original stocked liquid with native carried reach',async()=>{
 // This positive native input has an explicit carrier; the corpus's 0.5m
 // ground placement remains an S4 blocker and is never silently changed.
 const setup=setupOf(186);setup.objects[0].carriedBy='player';
 const loaded=load(setup),id='item_a3v2_186_water',e=engine.scoped(loaded.document);
 const before=loaded.document.state.records[`physical_feature:${id}`].state;
 assert.equal(environmentFeatures(e,loaded.document).find(f=>f.id===id).position[0],0);
 const out=await engine.reduce(loaded.document,{tool:'world_cast',args:{spell:'spell_water_02',target:id},eventId:'clean-original-liquid'}),after=applyPatches(loaded.document,out.patches);
 assert.equal(after.state.records[`physical_feature:${id}`].state.waterMl,before.waterMl);
 assert.ok(after.state.records[`physical_feature:${id}`].state.turbidity<before.turbidity);
 assert.equal(after.state.records[`physical_feature:${id}`].state.toxinUg,0);assert.equal(after.state.records[`physical_feature:${id}`].state.pathogenRisk,0);
 assert.equal(containerUnits(engine.primitiveDraft(after),id).length,8);
});

test('P4: original engraved object has real 20/100 durability and inspectable inscription',async()=>{
 const loaded=load(setupOf(205)),id='item_a3v2_205_sword',d=engine.primitiveDraft(loaded.document);
 assert.equal(loaded.setupUnmet.some(r=>r.item.startsWith('itemInstances')),false,JSON.stringify(loaded.setupUnmet));
 const facts=physicalItem(d,engine,id);
 assert.equal(facts.inscription,setupOf(205).itemInstances[0].inscription);assert.equal(facts.durability,20);assert.equal(facts.maxDurability,100);assert.equal(facts.condition,20);
 assert.equal(engine.quantity(d,'player',id),1);
 const out=await engine.reduce(loaded.document,{tool:'world_environment',args:{operation:'inspect',target:id},eventId:'inspect-original-sword'});
 assert.equal(out.result.physical.inscription,setupOf(205).itemInstances[0].inscription);assert.equal(out.result.physical.maxCondition,100);
 for(const row of [{inscription:123},{maxCondition:0},{condition:101},{owner:'player'}])assert.throws(()=>restorePhysicalSnapshot(d,engine,id,row,source));
 assert.throws(()=>restorePhysicalSnapshot(d,engine,id,{inscription:'forged'},{...source,origin:'proposal'}));
});

test('P1: untreated left-arm bite is a real medical condition, with unknown geometry preserved',()=>{
 const loaded=load(setupOf(208)),conditions=medicalConditions(loaded.document.state,'player');
 assert.equal(loaded.setupUnmet.some(r=>r.item.startsWith('status')),false);
 assert.equal(conditions.length,1);assert.equal(conditions[0].record.kind,'bite');assert.equal(conditions[0].record.site,'left_arm');assert.equal(conditions[0].record.treated,false);
 assert.equal(conditions[0].record.depthMm,undefined);assert.equal(conditions[0].record.healed,false);
 const d=engine.primitiveDraft(loaded.document);
 for(const row of [{site:'left_arm',treated:'yes'},{site:'forged',treated:false}])assert.throws(()=>restoreWoundSnapshot(d,engine,'player',row,source));
 assert.throws(()=>restoreWoundSnapshot(d,engine,'player',{site:'right_arm',treated:false},{...source,origin:'proposal'}));
});

test('P1-P4: campaign save/reopen and transaction replay retain physical premises',async t=>{
 const root=await fs.mkdtemp(path.join(process.cwd(),'.a3p-storage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(d,input,options)=>engine.reduce(d,input,options),store=new CampaignStorage(root,{reducer});
 for(const n of [170,172,186,205,208]){
  const id=`p-roundtrip-${n}`,loaded=load(setupOf(n));
  await store.create({id,worldVersion:world.version,document:loaded.document});
  const before=await store.load(id),again=await new CampaignStorage(root,{reducer}).load(id);
  assert.deepEqual(again.document,before.document);
 }
 const id='p-roundtrip-170';
 await store.transact(id,{id:'revive',anchor:'revive',input:{tool:'world_revive',args:{},eventId:'storage-revive'}},reducer);
 const settled=await store.load(id),replayed=await new CampaignStorage(root,{reducer}).load(id);
 assert.deepEqual(replayed.document,settled.document);assert.equal(replayed.document.state.location,'bld_hw_altar');
});

test('P: static prompt remains within the required ceiling',async()=>{const {budget}=await loadPromptBundle();assert.ok(budget.estimatedTokens<=10593,`${budget.estimatedTokens}`);});
