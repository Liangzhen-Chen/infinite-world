import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {npcCognitionView} from '../server-plugin/npc-cognition.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {loadPromptBundle} from '../tools/build-card.mjs';
import {sceneCard} from '../server-plugin/scene-card.mjs';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const npc='npc_hw_ayan',other='npc_hw_linsui',board='loc_hw',destination='bld_hw_mill';
function setup(){
 const w=structuredClone(world),engine=new WorldEngine(w),document=engine.initialFromLegacy(seed,'quest-board-test');
 document.state.minute=540;document.state.location=board;
 for(const id of [npc,other]){
  w.npcs.find(n=>n.id===id).schedule={default:[{start:0,end:1440,location:board,activity:'日常工作',services:['trade']}]};
  Object.assign(document.state.npcs[id],{location:board,activity:'日常工作',status:'正常'});
 }
 document.state.npcs[npc].inventory.item_wood=10;
 const run=async(c,tool,args,eventId)=>{const output=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,output.patches),result:output.result,patches:output.patches};};
 const publish=(c,patch={},event='offer')=>run(c,'world_quest',{operation:'publish',publisher:'player',grade:'D',reward:20,content:'送一份木料',objective:{type:'deliver',item:'item_wood',quantity:1},...patch},event);
 const accept=c=>run(c,'world_quest',{operation:'accept',quest:'quest_offer',taker:npc,consent:true},'take');
 const wait=(c,minutes,event='wait')=>run(c,'world_time',{minutes},event);
 return {w,engine,document,run,publish,accept,wait};
}
const total=c=>c.state.player.coins+Object.values(c.state.npcs).reduce((n,x)=>n+x.coins,0)+Object.values(c.state.quests).reduce((n,q)=>n+q.escrow,0);

test('玩家默认合法私人D身份；自称官职、公账授权不能增加额度，资金不足原子拒绝',async()=>{
 const {engine,document,publish}=setup(),before=structuredClone(document);
 for(const patch of [{grade:'C'},{personal:false},{grade:'S',authorization:'report-only'},{reward:1000000}])await assert.rejects(publish(document,patch),/额度|托管/);
 assert.deepEqual(document,before);
 const posted=await publish(document);assert.equal(posted.document.state.player.coins,document.state.player.coins-20);assert.equal(posted.document.state.quests.quest_offer.escrow,20);
 assert.equal(total(posted.document),total(document));assert.deepEqual(questPublishingRights(engine,document.state),{month:0,limitD:0,usedD:0,personal:true,kinds:['personal'],rule:'各身份取最大值；名士仅文化类；monthlyQuotaD 显式覆盖全部身份额度',sources:[],override:null});
 const view=affairs(engine,posted.document);assert.equal(view.quota.personal,true);assert.equal(view.quota.limitD,null);assert.equal(view.tasks[0].direction,'outgoing');
});
test('测试授权身份沿D–S单位扣减，取消退托管不补发月额度',async()=>{
 const {w,document,run}=setup();w.npcs.find(n=>n.id===other).monthlyQuotaD=10;const posted=await run(document,'world_quest',{operation:'publish',publisher:other,grade:'C',reward:100,content:'看磨坊',objective:{type:'visit',location:destination}},'official');
 assert.equal(posted.document.state.questQuota[`0_${other}`],10);
 const accepted=await run(posted.document,'world_quest',{operation:'accept',quest:'quest_official'},'player');
 const cancelled=await run(accepted.document,'world_quest',{operation:'cancel',quest:'quest_official'},'cancel');assert.equal(cancelled.document.state.questQuota[`0_${other}`],10);assert.equal(cancelled.document.state.quests.quest_official.escrow,0);
});
test('full NPC当面同意接单，真实库存交付并一次领取报酬；占时冲突拒绝',async()=>{
 const {document,publish,accept,wait,run}=setup();const posted=(await publish(document)).document,accepted=(await accept(posted)).document;
 await assert.rejects(run(accepted,'world_quest',{operation:'accept',quest:'quest_offer',taker:other,consent:true},'抢单'),/不能接受/);
 const done=(await wait(accepted,1)).document,q=done.state.quests.quest_offer;
 assert.equal(q.status,'已完成');assert.equal(q.escrow,0);assert.equal(done.state.npcs[npc].coins,document.state.npcs[npc].coins+20);assert.equal(done.state.inventory.item_wood.quantity,1);assert.equal(done.state.npcs[npc].inventory.item_wood.quantity,9);assert.equal(total(done),total(document));
 await assert.rejects(run(done,'world_quest',{operation:'complete',quest:q.id},'again'),/可结算/);
 assert.equal((await wait(done,1,'later')).document.state.npcs[npc].coins,done.state.npcs[npc].coins);
});
test('NPC无法凭名字、低详情档、缺货或睡眠接单；失败不扣托管或创建预约',async()=>{
 for(const kind of ['stock','sleep','tier','consent','absent','booking']){
  const {w,document,publish,accept,run}=setup(),posted=(await publish(document)).document;
  if(kind==='stock')posted.state.npcs[npc].inventory.item_wood=0;
  if(kind==='sleep')posted.state.npcs[npc].activity='睡眠';
  if(kind==='tier')w.npcs.find(n=>n.id===npc).tier='name';
  if(kind==='absent')posted.state.npcs[npc].location=destination;
  if(kind==='booking')posted.state.obligations.busy={id:'busy',reservationVersion:1,type:'会面',promisor:npc,promisee:'player',start:540,deadline:600,departures:{[npc]:540,player:540},status:'进行中'};
  const before=structuredClone(posted);
  if(kind==='consent')await assert.rejects(run(posted,'world_quest',{operation:'accept',quest:'quest_offer',taker:npc},'bad'),/同意/);else await assert.rejects(accept(posted));
  assert.deepEqual(posted,before);
 }
});
test('visit沿真实路线抵达，到时才完成；路费只扣一次，途中不在端点',async()=>{
 const {engine,document,publish,accept,wait}=setup(),route=engine.route(board,destination,'walk',540,document.randomSeed);
 const posted=(await publish(document,{objective:{type:'visit',location:destination}})).document,accepted=(await accept(posted)).document;
 const middle=(await wait(accepted,1)).document;assert.equal(middle.state.quests.quest_offer.status,'进行中');assert.equal(middle.state.npcs[npc].location,null);assert.equal(middle.state.npcs[npc].coins,document.state.npcs[npc].coins-route.cost);
 const done=(await wait(middle,route.minutes)).document;assert.equal(done.state.quests.quest_offer.status,'已完成');assert.equal(done.state.npcs[npc].location,destination);assert.equal(done.state.npcs[npc].coins,document.state.npcs[npc].coins-route.cost+20);
 assert.equal(done.state.records['quest_offer:已完成'].minute,540+route.minutes+1);
});
test('实际路费、封路、睡眠窗口、私宅边界均在接单前检查',async()=>{
 for(const kind of ['fare','route','window','private']){
  const {w,engine,document,publish,accept}=setup();const target=kind==='private'?'bld_hw_home_15':destination;
  const posted=(await publish(document,{objective:{type:'visit',location:target}})).document;
  if(kind==='fare'){posted.state.npcs[npc].coins=0;const route=engine.route.bind(engine);engine.route=(...args)=>({...route(...args),cost:3});}
  if(kind==='route')engine.route=()=>{throw Error('封路');};
  if(kind==='window')w.npcs.find(n=>n.id===npc).schedule.default=[{start:0,end:541,location:board,activity:'工作',services:[]},{start:541,end:1440,location:board,activity:'睡眠',services:[]}];
  const before=structuredClone(posted);await assert.rejects(accept(posted),undefined,kind);assert.deepEqual(posted,before);
 }
});
test('取消、临时失能、收件人离开和货物丢失有退款原因，实物不隔空转移',async()=>{
 for(const kind of ['cancel','ill','absent','stock']){
  const {document,publish,accept,wait,run}=setup();let accepted=(await accept((await publish(document)).document)).document;
  if(kind==='ill')accepted.state.npcs[npc].status='患病';if(kind==='absent')accepted.state.location='loc_capital';if(kind==='stock')accepted.state.npcs[npc].inventory.item_wood=0;
  const outcome=kind==='cancel'?await run(accepted,'world_quest',{operation:'cancel',quest:'quest_offer'},'cancel'):await wait(accepted,1);
  const q=outcome.document.state.quests.quest_offer;assert.equal(q.status,kind==='cancel'?'取消':'失败');assert.equal(q.refund,20);assert.equal(q.escrow,0);assert.ok(q.reason);assert.equal(outcome.document.state.player.coins,document.state.player.coins);assert.equal(outcome.document.state.inventory.item_wood?.quantity??0,0);
 }
});
test('未接任务按期限退托管；取消后重复推进不再退款，私人月额度不冒充官职额度',async()=>{
 const {document,publish,wait}=setup(),posted=(await publish(document,{deadline:541})).document,expired=(await wait(posted,1)).document;
 assert.equal(expired.state.quests.quest_offer.status,'超期');assert.equal(expired.state.player.coins,document.state.player.coins);assert.equal((await wait(expired,10)).document.state.player.coins,document.state.player.coins);
});
test('玩家返回交付地点仍在途中时不能提前收货，路费结算与退款不改变原货物',async()=>{
 const {document,publish,accept,run}=setup(),accepted=(await accept((await publish(document)).document)).document;
 accepted.state.location=destination;
 const moving=(await run(accepted,'world_move',{destination:board},'return')).document;
 assert.equal(moving.state.quests.quest_offer.status,'失败');assert.match(moving.state.quests.quest_offer.reason,/途中/);assert.equal(moving.state.quests.quest_offer.refund,20);
 assert.equal(moving.state.inventory.item_wood?.quantity??0,0);assert.equal(moving.state.npcs[npc].inventory.item_wood,10);
});
test('build须实际木工、材料、完好工具及在场劳动，等待已有工程完成才支付',async()=>{
 const {document,publish,accept,wait}=setup();document.state.projects.project_fixture={id:'project_fixture',type:'工程',creator:'player',location:board,settlement:board,status:'施工中',wood:5,stone:0,remainingDays:1};
 const posted=(await publish(document,{objective:{type:'build',project:'project_fixture'}})).document;
 const accepted=(await accept(posted)).document,worked=(await wait(accepted,30)).document;
 assert.equal(worked.state.quests.quest_offer.status,'进行中',worked.state.quests.quest_offer.reason);assert.equal(worked.state.quests.quest_offer.escrow,20);assert.equal(worked.state.projects.project_fixture.questWork.quest_offer.minutes,30);
 const done=(await wait(worked,1440-worked.state.minute)).document;assert.equal(done.state.projects.project_fixture.status,'已完成');assert.equal(done.state.quests.quest_offer.status,'已完成');assert.equal(done.state.quests.quest_offer.escrow,0);
});
test('build材料、工具和能力不足拒绝；停止工程退款且保留已发生劳动',async()=>{
 for(const kind of ['materials','tool','skill','stop']){
  const {document,publish,accept,wait}=setup();document.state.projects.p={id:'p',type:'工程',creator:'player',location:board,status:'施工中',wood:5,remainingDays:2};
  if(kind==='materials')document.state.projects.p.wood=0;
  if(kind==='materials'){await assert.rejects(publish(document,{objective:{type:'build',project:'p'}}),/材料/);continue;}
  const posted=(await publish(document,{objective:{type:'build',project:'p'}})).document;
  if(kind==='tool')posted.state.npcs[npc].inventory.item_whittling_knife=0;if(kind==='skill')posted.state.npcs[npc].skills={skill_life_6_core:0};
  if(kind!=='stop'){await assert.rejects(accept(posted),/工具|能力/);continue;}
  const worked=(await wait((await accept(posted)).document,30)).document;worked.state.projects.p.status='停工';const failed=(await wait(worked,1)).document;
  assert.equal(failed.state.quests.quest_offer.status,'失败');assert.equal(failed.state.quests.quest_offer.refund,20);assert.ok(failed.state.projects.p.questWork.quest_offer);
 }
});
test('离开十日自动看见告示接单，visit回执可追查，无关NPC不知道履约',async()=>{
 const {engine,document,publish,wait,run}=setup(),posted=(await publish(document,{objective:{type:'visit',location:destination}})).document;posted.state.location='loc_capital';
 const done=(await wait(posted,10*1440)).document,q=done.state.quests.quest_offer;
 assert.equal(q.status,'已完成');assert.ok(q.taker);assert.ok(done.state.records['quest_offer:accept']);assert.ok(done.state.records['quest_offer:已完成']);
 const unrelated=q.taker===npc?other:npc;assert.equal(npcCognitionView(engine,done,unrelated).memories.some(m=>m.kind==='quest'&&m.participants.includes(q.taker)),false);
 assert.equal((await run(done,'world_quest',{operation:'inspect',quest:q.id},'inspect')).result.status,'已完成');
 assert.ok(done.state.npcs[q.taker].memoryStream.some(m=>m.id==='quest_offer:已完成'&&m.private));
});
test('远处NPC不凭空抢单，旁观者不获知私密委托；场景只给本人和当地告示',async()=>{
 const {engine,document,publish,wait,run}=setup(),posted=(await publish(document,{objective:{type:'visit',location:destination}})).document;
 posted.state.quests.quest_offer.location='loc_capital';const later=(await wait(posted,100)).document;assert.equal(later.state.quests.quest_offer.taker,null);
 later.state.quests.secret={id:'secret',publisher:npc,taker:other,content:'暗处委托内容',status:'进行中',location:destination};
 assert.doesNotMatch(sceneCard(engine,later),/暗处委托内容/);await assert.rejects(run(later,'world_quest',{operation:'inspect',quest:'secret'},'hidden'),/渠道/);
});
test('一段与分段推进相同，补丁复演保留托管、路线及履约证据',async()=>{
 const {document,publish,accept,wait}=setup(),accepted=(await accept((await publish(document,{objective:{type:'visit',location:destination}})).document)).document;
 const one=await wait(accepted,50,'long');let split=accepted;for(let n=0;n<50;n++)split=(await wait(split,1,`part_${n}`)).document;
 assert.deepEqual(split.state.quests,one.document.state.quests);assert.deepEqual(split.state.records['quest_offer:已完成'],one.document.state.records['quest_offer:已完成']);assert.equal(split.state.npcs[npc].coins,one.document.state.npcs[npc].coins);
 assert.deepEqual(applyPatches(accepted,one.patches),one.document);assert.equal(accepted.state.quests.quest_offer.escrow,20);
});
test('真实存储并发争单仅一个承接者成功',async t=>{
 const {engine,document,publish}=setup();const posted=(await publish(document,{objective:{type:'visit',location:destination}})).document;
 const root=await fs.mkdtemp(path.join(tmpRoot(),'quests-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const store=new CampaignStorage(root);await store.create({id:'quest-race',worldVersion:world.version,document:posted});
 const reducer=(d,input)=>engine.reduce(d,input);
 const outputs=await Promise.allSettled([npc,other].map((taker,i)=>store.transact('quest-race',{id:`claim-${i}`,anchor:`claim-${i}`,input:{tool:'world_quest',args:{operation:'accept',quest:'quest_offer',taker,consent:true},eventId:`claim-${i}`}},reducer)));
 assert.equal(outputs.filter(o=>o.status==='fulfilled').length,1);assert.equal(outputs.filter(o=>o.status==='rejected').length,1);
});
test('静态提示预算遵守统一硬上限',async()=>{const {budget}=await loadPromptBundle();assert.ok(budget.estimatedTokens<=budget.limit);});
