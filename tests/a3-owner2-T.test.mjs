// todo 的阶段与真实前提逐条登记：docs/A3-后续阶段登记.md S5CT CT02（保留原阶段边界）。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {runSetupLoaders} from '../tools/a3-setup/index.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {minuteForCalendarDate,localWeather,historicalMinute} from '../server-plugin/weather.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {festivalScene,nextFestivalMinute} from '../server-plugin/festival.mjs';
import {closeHolding,ensureHoldings} from '../server-plugin/holdings.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';

// This authority/private-document fixture fixes the on-duty recipient and
// bystanders while its native actions advance time. Household errands belong
// to the separate source/full-world tests; all duty/privacy assertions remain.
const world=await loadWorld();delete world.rules.householdSubsistence;
const engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const corpus=JSON.parse(await fs.readFile('tests/fixtures/a3-intents-v2-r12.json','utf8'));
const initial=()=>engine.createCharacter(seed,{},'a3-owner2-t');
const setupOf=n=>structuredClone(corpus.find(r=>r.id===`A3V2-${n}`).setup);
const load=setup=>applyIntentSetup(engine,initial(),setup);
const run=async(document,tool,args,eventId)=>{const out=await engine.reduce(document,{tool,args,eventId});return {document:applyPatches(document,out.patches),result:out.result};};
function balanced(before,after){
 const r=reconcile(engine,after);for(const key of ['mismatches','drift','audit'])assert.deepEqual(r[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}

test.todo('T1: native absolute dates use real short/leap months and derive autumn darkness without an item〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',()=>{
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

// T3's settled-quest consumer moved to a3-prelude.test.mjs. Publication,
// acceptance, delivery and banking now establish its paid, zero-cash premise.

const privateQuest='quest_a3v2_149_task',ordinaryId='a3v2_210_festival';
async function act(document,action,slots,eventId){
 const call={tool:'world_act',args:{action,slots},eventId};
 const preview=await engine.previewAction(document,call);
 assert.equal(preview.receipt.status,'preview',JSON.stringify(preview.receipt));
 return run(document,call.tool,call.args,eventId);
}
async function privateTask(){
 const loaded=load({minute:600,location:'loc_hw',present:['npc_hw_linsui','npc_hw_wushuo'],inventory:{item_wood:1}});
 assert.deepEqual(loaded.setupUnmet,[]);
 const posted=await act(loaded.document,'core:quest.publish',{publisher:'npc_hw_linsui',personal:true,grade:'D',reward:20,content:'送两份木材',objective:{type:'deliver',item:'item_wood',quantity:2}},'a3v2_149_task');
 return (await act(posted.document,'core:quest.accept',{quest:privateQuest},'accept-private')).document;
}
const reportSlots={quest:privateQuest,progress:.5,content:'已修一半'};
function ordinaryPremise(){
 // 产品原则三.2：只初始化当前场地权属与一件原始花灯；活动本身由公开动作建立。
 return load({minute:1200,location:'bld_hw_council',present:['npc_hw_chenbai'],coins:38,inventory:{},
  itemInstances:[{id:'a3v2_210_lantern',template:'thing',kind:'item',item:'item_lantern',owner:'npc_hw_chenbai',location:'bld_hw_council',carriedBy:'npc_hw_chenbai'}],
  holdings:[{id:'ordinary-venue-title',kind:'owns',holder:'npc_hw_chenbai',subject:'bld_hw_council',terms:{share:1}}]});
}
const ordinarySlots={festival:ordinaryId,name:'中秋灯会',coins:20,request:{kind:'ordinary',host:'npc_hw_chenbai',endsAt:1260,riddles:[{id:'a3v2_210_riddle',question:'一口咬掉牛尾巴，打一字',answers:['告'],reward:{item:'item_lantern',quantity:1}}]}};
async function ordinaryEvent(){
 const loaded=ordinaryPremise();assert.deepEqual(loaded.setupUnmet,[]);
 return (await act(loaded.document,'core:settlement.festival_plan',ordinarySlots,'create-lantern')).document;
}

test('T3: half-complete private report is known by issuer and not an unrelated present NPC',async()=>{
 const accepted=await privateTask();
 const document=(await act(accepted,'core:quest.report',reportSlots,'a3v2_149_event')).document;
 assert.equal(document.state.quests[privateQuest].reportedProgress,.5);
 const issuer=subjectiveView(engine,document,'npc_hw_linsui'),other=subjectiveView(engine,document,'npc_hw_wushuo');
 assert.ok(issuer.knowledge.memories.some(m=>m.sourceEvent==='a3v2_149_event'&&m.content==='已修一半'));
 assert.equal(other.knowledge.memories.some(m=>m.sourceEvent==='a3v2_149_event'),false);
 // 原历史快照不可完成/退款；现为真实托管任务：汇报仍不能伪造完成，取消只能退回实际托管。
 await assert.rejects(run(document,'world_quest',{operation:'complete',quest:privateQuest},'invent-completion'),/交付物品不足/);
 assert.equal(document.state.quests[privateQuest].escrow,20);assert.equal(document.state.quests[privateQuest].rewardPaid,undefined);
 const cancelled=await act(document,'core:quest.cancel',{quest:privateQuest},'real-refund');
 assert.equal(cancelled.document.state.quests[privateQuest].refund,20);assert.equal(cancelled.document.state.quests[privateQuest].escrow,0);
 balanced(accepted,cancelled.document);
});

test('T3: mismatched issuer, forged source, false settlement and unrelated report recipient are rejected',async()=>{
 const document=await privateTask(),before=structuredClone(document);
 // 用真实动作拒绝伪造请求，保留原先不创建伪任务、不泄露私下来源的断言意图。
 for(const patch of [{issuer:'npc_hw_wushuo'},{sourceEvent:'not-a-source'},{rewardSettled:false},{progress:1},{recipient:'npc_hw_wushuo'}]){
  const refused=await run(document,'world_act',{action:'core:quest.report',slots:{...reportSlots,...patch}},'reject-report');
  assert.equal(refused.result.receipt.status,'rejected');assert.match(refused.result.receipt.reason,/发布人|来源|结算|进度|槽位/);
  assert.deepEqual(refused.document,before);
  assert.deepEqual(document,before);assert.equal(document.state.quests.another,undefined);
 }
 const reported=(await act(document,'core:quest.report',reportSlots,'a3v2_149_event')).document;
 await assert.rejects(run(reported,'world_quest',{operation:'report',...reportSlots,sourceEvent:'a3v2_149_event'},'forged-report'),/来源/);
});

test('T2: ordinary lantern event consumes its exact real prize once and watches to declared ending',async()=>{
 let document=await ordinaryEvent();const before=structuredClone(document);
 const inspected=await run(document,'world_settlement',{operation:'festival_inspect'},'inspect-lantern');
 const event=inspected.result.events.find(r=>r.id===ordinaryId);
 assert.equal(event.riddles[0].question,'一口咬掉牛尾巴，打一字');assert.equal(event.riddles[0].answers,undefined);assert.equal(event.riddles[0].claimed,false);
 assert.match(festivalScene(engine,document),/一口咬掉牛尾巴/);
 const args={operation:'festival_answer',festival:ordinaryId,request:'a3v2_210_riddle',choice:'错'};
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

test('T2: missing host ownership, illegal time window and already-claimed prize cannot be initialized',async()=>{
 const loaded=ordinaryPremise();assert.deepEqual(loaded.setupUnmet,[]);
 const document=loaded.document,before=structuredClone(document);
 // 删除快照接口后，逐项改为通过相同公开创建入口拒绝无权、坏时段、已领/虚构奖品及危险ID。
 for(const mutate of [s=>s.request.host='npc_hw_wushuo',s=>s.request.endsAt=1000,s=>s.request.riddles[0].claimed=true,s=>s.request.riddles[0].reward.item='invented',s=>s.festival='__proto__']){
  const slots=structuredClone(ordinarySlots);mutate(slots);
  const refused=await run(document,'world_act',{action:'core:settlement.festival_plan',slots},'bad-event');
  assert.equal(refused.result.receipt.status,'rejected');assert.deepEqual(refused.document,before);
  assert.equal(document.state.records[ordinaryId],undefined);assert.deepEqual(document,before);
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
test.todo('T4: native office derives one monthly quota; publish escrows real money and cancellation refunds without restoring quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',async()=>{
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

test.todo('T4: forged powers/usage/escrow, absent office term, closed office and wrong-seat publishing fail〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',async()=>{
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

test.todo('T4: a dedicated escrow expires through the real clock, refunds its owner and retains the failure and used quota〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',async()=>{
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

test.todo('T1/T4: a native skipped leap month does not create another publishing allowance〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',async()=>{
 const setup=setupOf(179),date={calendar:'core:calendar_default',year:3,month:6,day:29,hour:23,minute:59};
 setup.date=date;setup.minute=minuteForCalendarDate(engine,date);
 const loaded=loadPublisher(setup);assert.deepEqual(loaded.setupUnmet,[]);
 // A premise placed on a far date (day 884 here) must start the day-bound ledgers (farm, lair, ecology, migration)
 // at that day, exactly as a mid-campaign import does (agriculture-migration.mjs: lastDay = day - 1, no backfilled
 // harvest). The setup loader only moves the clock, so without this the first real day boundary is correctly
 // refused as a non-contiguous settlement ("顺序不连续"), which this test is not about.
 const day=Math.floor(loaded.document.state.minute/1440);
 for(const record of Object.values(loaded.document.state.records))if(Number.isInteger(record?.lastDay)&&record.lastDay<day-1)record.lastDay=day-1;
 const posted=await run(loaded.document,'world_quest',{...publication,deadline:setup.minute+60},'before-leap');
 const rights=questPublishingRights(engine.scoped(posted.document),posted.document.state);assert.equal(rights.usedD,1);
 const entered=await run(posted.document,'world_time',{minutes:1},'enter-leap');
 assert.equal(engine.scoped(entered.document).calendar(entered.document.state.minute).leap,true);
 const leapRights=questPublishingRights(engine.scoped(entered.document),entered.document.state);
 assert.equal(leapRights.month,rights.month);assert.equal(leapRights.usedD,1);
 balanced(posted.document,entered.document);
});

test.todo('T1–T4: real save/reopen/replay retains native clock, private task and paid prize exactly once〔前提待真实动作：激活原生日历并从真实任职建立专用委托托管和月配额；归 S4〕',async t=>{
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
 assert.equal(again.document.state.quests.a3v2_149_task.reportedProgress,.5);
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
