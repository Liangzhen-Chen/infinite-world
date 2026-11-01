import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {runPrelude} from '../tools/a3-setup/prelude.mjs';
import {subjectiveView} from '../server-plugin/subjective-view.mjs';
import {worldActions} from '../server-plugin/action-affordances.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

// Private report fixtures explicitly place the issuer and unrelated witnesses.
// Keep that presence while native receipt actions elapse, isolating errands;
// source/full-world tests retain the household mechanism.
const reportWorld=await loadWorld();delete reportWorld.rules.householdSubsistence;
const engine=new WorldEngine(reportWorld);
const seed=JSON.parse(await fs.readFile(new URL('./fixtures/legacy/seed.json',import.meta.url),'utf8'));
const venue='bld_hw_council',host='npc_hw_chenbai',issuer='npc_hw_linsui';
const input=(action,slots,eventId)=>({tool:'world_act',args:{action,slots},eventId});
const puzzle={id:'riddle',question:'一口咬掉牛尾巴，打一字',answers:['告'],reward:{item:'item_lantern',quantity:1}};
function scene(owner='player',title=true,location=venue){
 const loaded=applyIntentSetup(engine,engine.createCharacter(seed,{},'a3-producers'),{
  minute:600,location,present:[host,issuer,'npc_hw_wushuo'],coins:100,inventory:{item_wood:2},
  itemInstances:[{id:'original-prize',template:'thing',kind:'item',item:'item_lantern',owner,location,carriedBy:owner}],
  ...(title?{holdings:[{id:'venue-title',kind:'owns',holder:owner,subject:location,terms:{share:1}}]}:{})
 });
 assert.deepEqual(loaded.setupUnmet,[]);return loaded.document;
}
const plan=(document,extra={},id='ordinary-plan')=>input('core:settlement.festival_plan',{
 festival:`festival:${id}`,name:'日常灯谜会',request:{kind:'ordinary',endsAt:document.state.minute+30,riddles:[structuredClone(puzzle)]},...extra
},id);
async function act(document,call){
 const before=structuredClone(document),preview=await engine.previewAction(document,call);
 assert.equal(preview.receipt.status,'preview',JSON.stringify(preview.receipt));assert.deepEqual(document,before);
 const out=await engine.reduce(document,call);assert.equal(out.result.receipt.status,'committed',JSON.stringify(out.result.receipt));
 return {document:applyPatches(document,out.patches),result:out.result};
}
async function refused(document,call,pattern){
 const before=structuredClone(document),out=await engine.reduce(document,call);
 assert.equal(out.result.receipt.status,'rejected');if(pattern)assert.match(out.result.receipt.reason,pattern);
 assert.deepEqual(out.patches,[]);assert.deepEqual(document,before);
}
function balanced(before,after){
 const r=reconcile(engine,after);for(const key of ['mismatches','drift','audit'])assert.deepEqual(r[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
}
async function accepted(){
 const before=scene();
 const loaded=await runPrelude(engine,before,[
  input('core:quest.publish',{publisher:issuer,personal:true,grade:'D',reward:20,content:'交付两份木材',objective:{type:'deliver',item:'item_wood',quantity:2}},'producer-quest'),
  input('core:quest.accept',{quest:'quest_producer-quest'},'producer-accept')
 ]);
 assert.deepEqual(loaded.unmet,[]);return loaded.document;
}

test('producers: private report has a real source, no bystander knowledge, no payment, and survives JSON reload',async()=>{
 const before=await accepted(),quest='quest_producer-quest';
 const call=input('core:quest.report',{quest,progress:.5,content:'已完成一半'},'private-progress');
 const out=await act(before,call),document=JSON.parse(JSON.stringify(out.document));
 assert.equal(document.state.quests[quest].reportedProgress,.5);assert.equal(document.state.quests[quest].status,'进行中');
 assert.equal(document.state.quests[quest].progress,undefined,"a report is a claim, not verified progress");
 assert.equal(document.state.quests[quest].escrow,20);assert.equal(document.state.player.coins,before.state.player.coins);
 const inspected=await act(document,input('core:quest.inspect',{quest},'inspect-private-progress'));
 assert.equal(inspected.result.reportedProgress,.5);assert.equal(inspected.result.report,out.result.report);
 const report=document.state.records[out.result.report];assert.equal(report.sourceEvent,call.eventId);assert.equal(report.issuer,issuer);assert.equal(report.private,true);
 assert.ok(subjectiveView(engine,document,issuer).knowledge.memories.some(m=>m.sourceEvent===call.eventId&&m.content==='已完成一半'));
 assert.equal(subjectiveView(engine,document,'npc_hw_wushuo').knowledge.memories.some(m=>m.sourceEvent===call.eventId),false);
 const replay=await engine.reduce(before,call);assert.deepEqual(applyPatches(before,replay.patches),document);
 balanced(before,document);
});

test('producers: report never substitutes for completion; actual delivery pays exactly once',async()=>{
 const before=await accepted(),quest='quest_producer-quest';
 const reported=await act(before,input('core:quest.report',{quest,progress:.5,content:'备料过半'},'progress-before-delivery'));
 const done=await act(reported.document,input('core:quest.complete',{quest},'deliver-real-items'));
 assert.equal(engine.quantity(engine.primitiveDraft(done.document),'player','item_wood'),0);
 assert.equal(engine.quantity(engine.primitiveDraft(done.document),issuer,'item_wood'),engine.quantity(engine.primitiveDraft(before),issuer,'item_wood')+2);
 assert.equal(done.document.state.quests[quest].rewardPaid,20);assert.equal(done.document.state.quests[quest].escrow,0);
 assert.equal(done.document.state.player.coins,before.state.player.coins+20);
 await refused(done.document,input('core:quest.complete',{quest},'repeat-delivery'),/结算/);
 await refused(done.document,input('core:quest.report',{quest,progress:.5,content:'重复汇报'},'report-after-settlement'),/进行中/);
 balanced(before,done.document);
});

test('producers: report requires the actual taker, issuer, on-site recipient and an unfinished finite progress',async()=>{
 const document=await accepted(),quest='quest_producer-quest';
 for(const progress of [-.1,1,NaN,Infinity,'0.5'])await refused(document,input('core:quest.report',{quest,progress,content:'进度'},'bad-progress'),/进度/);
 for(const patch of [{issuer:'npc_hw_wushuo'},{recipient:'npc_hw_wushuo'},{sourceEvent:'forged'},{rewardSettled:true}])
  await refused(document,input('core:quest.report',{quest,progress:.5,content:'进度',...patch},'bad-report'),/发布人|来源|结算|槽位/);
 const moved=await act(document,input('core:move',{destination:'loc_hw_gate'},'leave-issuer'));
 await refused(moved.document,input('core:quest.report',{quest,progress:.5,content:'隔空汇报'},'absent-issuer'),/在场/);
});

test('producers: player creates a public ordinary event through prelude without minting stock or leaking answers',async()=>{
 const before=scene(),call=plan(before),loaded=await runPrelude(engine,before,[call]);assert.deepEqual(loaded.unmet,[]);
 const document=loaded.document,row=document.state.records['festival:ordinary-plan'];
 assert.equal(row.host,'player');assert.equal(row.status,'held');assert.equal(row.due,before.state.minute);assert.equal(row.endsAt,630);
 assert.equal(row.riddles[0].reward.unit,before.state.inventory.item_lantern.instances[0]);
 assert.equal(engine.quantity(engine.primitiveDraft(document),'player','item_lantern'),1);
 const inspect=await act(document,input('core:settlement.festival_inspect',{},'public-event'));
 const publicRow=inspect.result.events.find(r=>r.id===row.id);assert.equal(publicRow.riddles[0].answers,undefined);
 const created=await act(before,call);assert.equal(created.result.event.riddles[0].answers,undefined);
 balanced(before,document);
});

test('producers: ordinary event opens and ends at its exact future window on the real clock',async()=>{
 const before=scene(),call=plan(before,{request:{kind:'ordinary',due:602,endsAt:605,riddles:[puzzle]}},'future-event');
 const planned=await act(before,call),id=planned.result.festival;assert.equal(planned.document.state.records[id].status,'planned');
 const start=await act(planned.document,input('core:time',{minutes:2},'reach-start'));
 assert.equal(start.document.state.records[id].status,'held');assert.equal(start.document.state.minute,602);
 const end=await act(start.document,input('core:time',{minutes:3},'reach-end'));
 assert.equal(end.document.state.records[id].status,'ended');assert.equal(end.document.state.records[id].resolvedAt,605);
 balanced(before,end.document);
});

test('producers: no venue title, unlawful windows, counterfeit prizes and reuse reject without partial writes',async()=>{
 const missing=scene('player',false);await refused(missing,plan(missing),/场地/);
 const before=scene();
 for(const request of [{due:599},{endsAt:600},{endsAt:600+1441},{due:600+361*1440,endsAt:600+361*1440+1},{riddles:[{...puzzle,claimed:true}]},{riddles:[{...puzzle,reward:{item:'invented'}}]},{riddles:[{...puzzle,reward:{item:'item_lantern',unit:'forged'}}]}]){
  await refused(before,plan(before,{request:{kind:'ordinary',endsAt:630,riddles:[puzzle],...request}}));
 }
 const created=await act(before,plan(before));
 await refused(created.document,plan(created.document,{},'second-event'),/签入/);
 await refused(created.document,plan(created.document,{festival:created.result.festival},'same-event'),/编号/);
 balanced(before,created.document);
});

test('producers: the existing flat catalogue form creates a real riddle and permits a midnight event at an unrestricted venue',async()=>{
 const before=scene('player',true,'bld_hw_home_15'),offered=worldActions(engine,before,{query:'core:settlement.festival_plan',limit:100}).actions.find(a=>a.id==='core:settlement.festival_plan');
 assert.equal(offered.slots.find(s=>s.name==='request').kind,'text');
 const slots={festival:'flat-lantern',name:'夜间灯谜会',speaker:'player',due:1439,minutes:2,request:'flat-riddle',content:puzzle.question,choice:'告',item:'item_lantern',quantity:1};
 const out=await act(before,input('core:settlement.festival_plan',slots,'flat-plan'));
 assert.equal(out.result.festival,'flat-lantern');const row=out.document.state.records['flat-lantern'];
 assert.equal(row.due,1439);assert.equal(row.endsAt,1441);assert.equal(row.status,'planned');
 assert.equal(row.riddles[0].question,puzzle.question);assert.equal(row.riddles[0].reward.unit,before.state.inventory.item_lantern.instances[0]);
 const report=worldActions(engine,before,{query:'core:quest.report',limit:100}).actions.find(a=>a.id==='core:quest.report');
 const progress=report.slots.find(s=>s.name==='progress');assert.equal(progress.min,0);assert.ok(progress.presets.includes(.5));
 balanced(before,out.document);
});

test('producers: NPC host decides before spending, real fee is conserved and a claimed original cannot be signed in again',async()=>{
 const before=scene(host),call=plan(before,{coins:20,request:{kind:'ordinary',host,endsAt:630,riddles:[puzzle]}},'npc-event');
 await refused(before,{...call,args:{...call.args,slots:{...call.args.slots,coins:0}}},/同意/);
 const created=await act(before,call),id=created.result.festival;
 assert.equal(created.document.state.player.coins,before.state.player.coins-20);
 assert.equal(created.document.state.npcs[host].coins,before.state.npcs[host].coins+20);
 assert.equal(created.document.state.records[id].decision.outcome,'agree');
 const claimed=await act(created.document,input('core:settlement.festival_answer',{festival:id,request:'riddle',choice:'告'},'claim-original'));
 const unit=claimed.result.reward.unit;
 assert.equal(unit,before.state.npcs[host].inventory.item_lantern.instances[0]);
 assert.equal(claimed.document.state.itemInstances[unit].owner,'player');
 await refused(claimed.document,input('core:settlement.festival_answer',{festival:id,request:'riddle',choice:'告'},'claim-twice'),/已经领奖/);
 // 原主办者已失去这件奖品，不能将已领原物重开为奖品。
 const ended=await act(claimed.document,input('core:settlement.festival_watch',{festival:id},'watch-to-end'));
 assert.equal(ended.document.state.minute,630);assert.equal(ended.document.state.records[id].status,'ended');
 const second=plan(ended.document,{coins:20,request:{kind:'ordinary',host,endsAt:660,riddles:[{...puzzle,reward:{item:'item_lantern',unit}}]}},'claimed-prize-event');
 await refused(ended.document,second,/库存|单件/);
 balanced(before,ended.document);
});

test('producers: save/reopen/replay retains real private source and paid original exactly once',async t=>{
 const root=await fs.mkdtemp(new URL('../.a3-producers-storage-',import.meta.url));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(document,call,options)=>engine.reduce(document,call,options),store=new CampaignStorage(root,{reducer});
 const before=await accepted(),report=input('core:quest.report',{quest:'quest_producer-quest',progress:.5,content:'已完成一半'},'saved-report');
 await store.create({id:'producers',worldVersion:engine.world.version,document:before});
 await store.transact('producers',{id:'report',anchor:'report',input:report},reducer);
 const saved=await store.load('producers'),reopened=await new CampaignStorage(root,{reducer}).load('producers');
 assert.deepEqual(reopened.document,saved.document);assert.equal(reopened.document.state.quests['quest_producer-quest'].reportedProgress,.5);
 assert.equal(reopened.document.state.npcs[issuer].memoryStream.filter(m=>m.sourceEvent==='saved-report').length,1);
 balanced(before,reopened.document);
 const opening=scene(host),planned=plan(opening,{coins:20,request:{kind:'ordinary',host,endsAt:630,riddles:[puzzle]}},'saved-event');
 await store.create({id:'prizes',worldVersion:engine.world.version,document:opening});
 await store.transact('prizes',{id:'plan',anchor:'plan',input:planned},reducer);
 const claim=input('core:settlement.festival_answer',{festival:'festival:saved-event',request:'riddle',choice:'告'},'saved-prize');
 await store.transact('prizes',{id:'claim',anchor:'claim',input:claim},reducer);
 const paid=await store.load('prizes'),again=await new CampaignStorage(root,{reducer}).load('prizes');
 assert.deepEqual(again.document,paid.document);
 assert.equal(engine.quantity(engine.primitiveDraft(again.document),'player','item_lantern'),1);
 assert.equal(engine.quantity(engine.primitiveDraft(again.document),host,'item_lantern'),0);
 assert.equal(Object.values(again.document.state.records).filter(r=>r.category==='festival_prize'&&r.sourceEvent==='saved-prize').length,1);
 await refused(again.document,{...claim,eventId:'claim-after-reopen'},/已经领奖/);
 balanced(opening,again.document);
});
