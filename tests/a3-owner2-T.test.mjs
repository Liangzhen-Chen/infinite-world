import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {runSetupLoaders} from '../tools/a3-setup/index.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {minuteForCalendarDate,localWeather,historicalMinute,restoreCalendarSnapshot} from '../server-plugin/weather.mjs';
import {questPublishingRights,restoreQuestSnapshot} from '../server-plugin/quest-board.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {festivalScene,nextFestivalMinute} from '../server-plugin/festival.mjs';
import {closeHolding,ensureHoldings} from '../server-plugin/holdings.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2.json','utf8'));
const initial=()=>engine.createCharacter(seed,{},'a3-owner2-t');
const setupOf=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`).setup);
const load=setup=>applyIntentSetup(engine,initial(),setup);
const run=async(document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,out.patches),result:out.result};};
function balanced(before,after){
 const r=reconcile(engine,after);for(const key of ['mismatches','drift','audit'])assert.deepEqual(r[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}

test('T1: native absolute dates use real short/leap months and derive autumn darkness without an item',()=>{
 const date={calendar:'core:calendar_default',year:1,month:8,day:15,hour:18,minute:50};
 const minute=minuteForCalendarDate(engine,date);
 const loaded=load({date,minute,location:'loc_hw_gate',present:[],coins:0,inventory:{}});
 assert.deepEqual(loaded.setupUnmet,[]);
 assert.equal(loaded.document.state.minute,minute);
 const view=engine.scoped(loaded.document).calendar(minute);
 assert.equal(view.month,8);assert.equal(view.day,15);assert.equal(view.season,2);
 const sky=localWeather(engine,loaded.document);assert.equal(sky.season,2);assert.equal(sky.daylight,false);
 const seasonal=Object.create(engine.scoped(loaded.document));
 seasonal.world={...world,settlementProfiles:[],festivals:[{id:'festival_native_clock',name:'日期核验灯会',calendar:{month:9,day:1},venue:{location:'loc_hw'},resourceNeeds:[],runtime:{status:'active',host:'npc_hw_chenbai',kind:'market',startMinute:720,durationMinutes:60}}]};
 assert.equal(nextFestivalMinute(loaded.document.state,seasonal,minute),minuteForCalendarDate(engine,{...date,month:9,day:1,hour:12,minute:0}));
 assert.equal(Object.values(loaded.document.state.records).some(r=>Object.hasOwn(r,'season')),false);
 const leap={...date,year:3,month:6,day:29,leap:true};
 assert.equal(engine.scoped(load({date:leap,minute:minuteForCalendarDate(engine,leap)}).document).calendar(minuteForCalendarDate(engine,leap)).leap,true);
 for(const bad of [{...date,month:2,day:30},{...date,year:1,month:6,leap:true},{...date,season:2},{...date,day:0}])assert.throws(()=>minuteForCalendarDate(engine,bad),/date|Date/);
 assert.ok(load({date,minute:600}).setupUnmet.some(r=>r.item==='date'));
 assert.throws(()=>restoreCalendarSnapshot(engine.primitiveDraft(initial()),engine,{date,sourceEvent:'forged',origin:'proposal'}),/authority/);
});

test('T1: two/three/nine days require actual elapsed days, never the previous minute',()=>{
 for(const daysAgo of [2,3,9]){
  assert.equal(historicalMinute({state:{minute:daysAgo*1440+600}},{at:599,daysAgo}),599);
  assert.throws(()=>historicalMinute({state:{minute:600}},{at:599,daysAgo}),/consistent/);
 }
 for(const n of [141,172])assert.ok(load(setupOf(n)).setupUnmet.some(r=>r.item.endsWith('.at')&&/absolute date/.test(r.reason)));
});

test('T3: settled quest is inspectable, cannot pay again, and retains declared current cash',async()=>{
 const loaded=load(setupOf(135));assert.deepEqual(loaded.setupUnmet,[]);
 const q=loaded.document.state.quests.a3v2_135_roof_task;
 assert.equal(q.status,'已完成');assert.equal(q.rewardSettled,true);assert.equal(q.escrow,0);
 assert.equal(loaded.document.state.player.coins,0);
 const before=structuredClone(loaded.document);
 const inspected=await run(before,'world_quest',{operation:'inspect',quest:q.id},'inspect-settled');
 assert.equal(inspected.result.status,'已完成');
 await assert.rejects(run(before,'world_quest',{operation:'complete',quest:q.id},'pay-again'),/历史任务/);
 assert.deepEqual(loaded.document,before);balanced(before,inspected.document);
});

test('T3: half-complete private report is known by issuer and not an unrelated present NPC',async()=>{
 const loaded=load(setupOf(149));assert.deepEqual(loaded.setupUnmet,[]);
 const document=loaded.document;
 assert.equal(document.state.quests.a3v2_149_task.progress,.5);
 const issuer=subjectiveView(engine,document,'npc_hw_linsui'),other=subjectiveView(engine,document,'npc_hw_wushuo');
 assert.ok(issuer.knowledge.memories.some(m=>m.sourceEvent==='a3v2_149_event'&&m.content==='已修一半'));
 assert.equal(other.knowledge.memories.some(m=>m.sourceEvent==='a3v2_149_event'),false);
 await assert.rejects(run(document,'world_quest',{operation:'complete',quest:'a3v2_149_task'},'invent-completion'),/历史任务/);
 await assert.rejects(run(document,'world_quest',{operation:'cancel',quest:'a3v2_149_task'},'invent-refund'),/历史任务/);
});

test('T3: mismatched issuer, forged source, false settlement and unrelated report recipient are rejected',()=>{
 for(const patch of [{issuer:'npc_hw_wushuo'},{sourceEvent:'not-a-source'},{rewardSettled:false},{progress:1}]){
  const setup=setupOf(135);Object.assign(setup.objects[0],patch);
  const loaded=load(setup);assert.ok(loaded.setupUnmet.some(r=>r.item.startsWith('objects')));
  assert.equal(loaded.document.state.quests.a3v2_135_roof_task,undefined);
 }
 const setup=setupOf(149);setup.knowledge[0].holder='npc_hw_wushuo';
 assert.ok(load(setup).setupUnmet.some(r=>r.item.startsWith('knowledge')));
 const loaded=load(setupOf(149));
 assert.throws(()=>restoreQuestSnapshot(engine.primitiveDraft(loaded.document),engine,{...setupOf(149).objects[0],id:'another',sourceEvent:'a3v2_149_event'},{origin:'initial'}),/Invalid historical/);
});

test('T2: ordinary lantern event consumes its exact real prize once and watches to declared ending',async()=>{
 const loaded=load(setupOf(210));assert.deepEqual(loaded.setupUnmet,[]);
 let document=loaded.document;const before=structuredClone(document);
 const inspected=await run(document,'world_settlement',{operation:'festival_inspect'},'inspect-lantern');
 const event=inspected.result.events.find(r=>r.id==='a3v2_210_festival');
 assert.equal(event.riddles[0].question,'一口咬掉牛尾巴，打一字');assert.equal(event.riddles[0].answers,undefined);assert.equal(event.riddles[0].claimed,false);
 assert.match(festivalScene(engine,document),/一口咬掉牛尾巴/);
 const args={operation:'festival_answer',festival:'a3v2_210_festival',request:'a3v2_210_riddle',choice:'错'};
 const wrong=await run(document,'world_settlement',args,'wrong-answer');assert.equal(wrong.result.correct,false);
 assert.equal(wrong.document.state.records['festival-prize:a3v2_210_festival:a3v2_210_riddle:player'],undefined);
 const correct=await run(wrong.document,'world_settlement',{...args,choice:'告'},'correct-answer');document=correct.document;
 assert.equal(correct.result.correct,true);
 assert.equal(engine.quantity(engine.primitiveDraft(document),'player','item_lantern'),1);
 assert.equal(engine.quantity(engine.primitiveDraft(document),'npc_hw_chenbai','item_lantern'),0);
 const prize=correct.result.reward.unit;
 assert.ok(Object.values(document.holdings.rows).some(h=>h.kind==='owns'&&h.subject===prize&&h.holder==='player'&&h.until===undefined));
 await assert.rejects(run(document,'world_settlement',{...args,choice:'告'},'repeat-answer'),/已经领奖/);
 balanced(before,document);
 const watched=await run(document,'world_settlement',{operation:'festival_watch',festival:args.festival},'watch-until-end');
 assert.equal(watched.document.state.minute,1260);assert.equal(watched.document.state.records[args.festival].status,'ended');
 await assert.rejects(run(watched.document,'world_settlement',{...args,choice:'告'},'after-end'),/正在举行/);
 balanced(document,watched.document);
 const waited=await run(before,'world_time',{minutes:60},'ordinary-time-ending');
 assert.equal(waited.document.state.records[args.festival].status,'ended');
});

test('T2: missing host ownership, illegal time window and already-claimed prize cannot be initialized',()=>{
 for(const change of [s=>s.rites[0].host='npc_hw_wushuo',s=>s.rites[0].endsAt=1000,s=>s.rites[0].riddle.claimed=true,s=>s.rites[0].riddle.reward='invented',s=>s.rites[0].id='__proto__']){
  const setup=setupOf(210);change(setup);const loaded=load(setup);
  assert.ok(loaded.setupUnmet.some(r=>r.item.startsWith('rites')));
  assert.equal(loaded.document.state.records.a3v2_210_festival,undefined);
 }
});

// Exercise the registered domain stage with the original corpus contract.
// Q owns the generic pre-domain dispatch; this helper does not hide its failures
// in the separately produced full-corpus score.
function loadPublisher(setup=setupOf(179)){
 // date belongs to the domain stage below, and must be initialized only once.
 const base=Object.fromEntries(['location','present','coins','inventory','minute'].filter(k=>Object.hasOwn(setup,k)).map(k=>[k,setup[k]]));
 const loaded=load(base),bindings=loaded.bindings;
 let document=loaded.document;
 const ctx={engine,bindings,ref:id=>bindings[id]??(id==='self'?'player':id),
  actor:id=>id==='player'?document.state.player:document.state.npcs[id]??document.state.creatures?.[id],
  unmet:(item,reason)=>loaded.setupUnmet.push({item,reason}),note:()=>{},
  native(item,write){try{const draft=engine.primitiveDraft(document);if(!ensureHoldings(draft,engine))throw Error('unsupported holdings version');write(draft);document=draft.document;return true;}catch(error){this.unmet(item,error.message);return false;}},
  get document(){return document;}};
 runSetupLoaders(ctx,setup);return {...loaded,document};
}
const publication={operation:'publish',publisher:'player',personal:false,grade:'D',reward:40,deadline:600+5*1440,content:'查看村口',objective:{type:'visit',location:'loc_hw_gate'},escrow:'a3v2_179_escrow'};
test('T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota',async()=>{
 const loaded=loadPublisher();assert.deepEqual(loaded.setupUnmet,[]);
 const rights=questPublishingRights(engine.scoped(loaded.document),loaded.document.state);
 assert.equal(rights.limitD,1);assert.equal(rights.usedD,0);
 const posted=await run(loaded.document,'world_quest',publication,'publish-test');
 assert.equal(posted.document.state.player.coins,0);assert.equal(posted.document.state.quests.a3v2_179_escrow.escrow,40);
 assert.equal(posted.document.state.quests.a3v2_179_escrow.taker,null);
 assert.equal(questPublishingRights(engine.scoped(posted.document),posted.document.state).usedD,1);
 balanced(loaded.document,posted.document);
 const cancelled=await run(posted.document,'world_quest',{operation:'cancel',quest:'a3v2_179_escrow'},'cancel-test');
 assert.equal(cancelled.document.state.player.coins,40);assert.equal(cancelled.document.state.quests.a3v2_179_escrow.escrow,0);
 assert.equal(questPublishingRights(engine.scoped(cancelled.document),cancelled.document.state).usedD,1);
 await assert.rejects(run(cancelled.document,'world_quest',{...publication,escrow:undefined},'over-quota'),/额度/);
 balanced(posted.document,cancelled.document);
 const gate=setupOf(179);gate.location='loc_hw_gate';const local=loadPublisher(gate);
 assert.equal(questPublishingRights(engine.scoped(local.document),local.document.state).limitD,1);
 assert.equal((await run(local.document,'world_quest',publication,'same-village-publication')).document.state.quests.a3v2_179_escrow.escrow,40);
});

test('T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail',async()=>{
 for(const mutate of [s=>s.instances[0].authority.push('treasury.spend'),s=>s.holdings[0].terms.quotaUsed=1,s=>s.accounts[0].balance=40,s=>s.instances[0].id='constructor']){
  const setup=setupOf(179);mutate(setup);assert.ok(loadPublisher(setup).setupUnmet.length>0);
 }
 const noTerm=setupOf(179);noTerm.holdings=[];const absent=loadPublisher(noTerm);assert.deepEqual(absent.setupUnmet,[]);
 await assert.rejects(run(absent.document,'world_quest',publication,'no-term'),/额度/);
 const loaded=loadPublisher(),draft=engine.primitiveDraft(loaded.document);
 closeHolding(draft,{id:loaded.bindings.a3v2_179_term,reason:'vacated',writer:'a3-temporal-setup'});
 assert.equal(questPublishingRights(engine.scoped(draft.document),draft.document.state).limitD,0);
 const elsewhere=setupOf(179);elsewhere.location='loc_bs';const moved=loadPublisher(elsewhere);
 await assert.rejects(run(moved.document,'world_quest',publication,'wrong-seat'),/额度|本地/);
});

test('T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota',async()=>{
 const loaded=loadPublisher();assert.deepEqual(loaded.setupUnmet,[]);
 const posted=await run(loaded.document,'world_quest',{...publication,deadline:601},'short-lived-publication');
 const ended=await run(posted.document,'world_time',{minutes:1},'reach-deadline');
 const quest=ended.document.state.quests.a3v2_179_escrow;
 // advanceQuestBoard uses 超期 for ordinary tasks; 已过期 is the transport branch.
 assert.equal(quest.status,'超期');assert.equal(quest.refund,40);assert.equal(quest.escrow,0);
 assert.equal(ended.document.state.player.coins,40);
 assert.ok(Object.values(ended.document.state.records).some(r=>r.category==='quest_receipt'&&r.quest===quest.id&&r.status==='超期'));
 assert.equal(questPublishingRights(engine.scoped(ended.document),ended.document.state).usedD,1);
 balanced(posted.document,ended.document);
});

test('T1/T4: a native skipped leap month does not create another publishing allowance',async()=>{
 const setup=setupOf(179),date={calendar:'core:calendar_default',year:3,month:6,day:29,hour:23,minute:59};
 setup.date=date;setup.minute=minuteForCalendarDate(engine,date);
 const loaded=loadPublisher(setup);assert.deepEqual(loaded.setupUnmet,[]);
 const posted=await run(loaded.document,'world_quest',{...publication,deadline:setup.minute+60},'before-leap');
 const rights=questPublishingRights(engine.scoped(posted.document),posted.document.state);assert.equal(rights.usedD,1);
 const entered=await run(posted.document,'world_time',{minutes:1},'enter-leap');
 assert.equal(engine.scoped(entered.document).calendar(entered.document.state.minute).leap,true);
 const leapRights=questPublishingRights(engine.scoped(entered.document),entered.document.state);
 assert.equal(leapRights.month,rights.month);assert.equal(leapRights.usedD,1);
 balanced(posted.document,entered.document);
});

test('T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once',async t=>{
 const root=await fs.mkdtemp(path.join(process.cwd(),'.a3t-storage-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const setup=setupOf(210),privateSetup=setupOf(149);
 setup.history.push(...privateSetup.history);setup.objects=privateSetup.objects;setup.knowledge=privateSetup.knowledge;
 const date={calendar:'legacy:30-day',year:1,month:1,day:1,hour:20,minute:0};setup.date=date;
 const loaded=load(setup);assert.deepEqual(loaded.setupUnmet,[]);
 const reducer=(d,input,options)=>engine.reduce(d,input,options),store=new CampaignStorage(root,{reducer});
 await store.create({id:'a3t-roundtrip',worldVersion:world.version,document:loaded.document});
 await store.transact('a3t-roundtrip',{id:'claim',anchor:'claim',input:{tool:'world_settlement',args:{operation:'festival_answer',festival:'a3v2_210_festival',request:'a3v2_210_riddle',choice:'告'},eventId:'storage-claim'}},reducer);
 const before=await store.load('a3t-roundtrip'),again=await new CampaignStorage(root,{reducer}).load('a3t-roundtrip');
 assert.deepEqual(again.document,before.document);
 assert.equal(again.document.state.quests.a3v2_149_task.progress,.5);
 assert.equal(engine.quantity(engine.primitiveDraft(again.document),'player','item_lantern'),1);
 assert.equal(localWeather(engine,again.document).daylight,false);
 const publishing=loadPublisher();assert.deepEqual(publishing.setupUnmet,[]);
 await store.create({id:'a3t-publish-roundtrip',worldVersion:world.version,document:publishing.document});
 await store.transact('a3t-publish-roundtrip',{id:'publish',anchor:'publish',input:{tool:'world_quest',args:publication,eventId:'storage-publish'}},reducer);
 const posted=await store.load('a3t-publish-roundtrip'),replayed=await new CampaignStorage(root,{reducer}).load('a3t-publish-roundtrip');
 assert.deepEqual(replayed.document,posted.document);
 assert.equal(questPublishingRights(engine.scoped(replayed.document),replayed.document.state).usedD,1);
 assert.equal(replayed.document.state.quests.a3v2_179_escrow.escrow,40);
 const nativeDate={calendar:'core:calendar_default',year:3,month:6,day:29,leap:true,hour:10,minute:0};
 const clock=load({date:nativeDate,minute:minuteForCalendarDate(engine,nativeDate)});assert.deepEqual(clock.setupUnmet,[]);
 await store.create({id:'a3t-clock-roundtrip',worldVersion:world.version,document:clock.document});
 await store.transact('a3t-clock-roundtrip',{id:'wait',anchor:'wait',input:{tool:'world_time',args:{minutes:1},eventId:'storage-clock'}},reducer);
 const time=await store.load('a3t-clock-roundtrip'),clockReplay=await new CampaignStorage(root,{reducer}).load('a3t-clock-roundtrip');
 assert.deepEqual(clockReplay.document,time.document);
 assert.equal(engine.scoped(clockReplay.document).calendar(clockReplay.document.state.minute).leap,true);
});

test('T: static prompt stays at the A3 ceiling',async()=>{const {budget}=await loadPromptBundle();assert.ok(budget.estimatedTokens<=10593,`${budget.estimatedTokens}`);});
