import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from '../tools/load-world.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {applyIntentSetup} from '../tools/a3-score.mjs';
import {applyPatches,CampaignStorage} from '../server-plugin/storage.mjs';
import {questPublishingRights} from '../server-plugin/quest-board.mjs';
import {questQuotaMonth} from '../server-plugin/entity-view.mjs';
import {calendarDateAt,minuteForCalendarDate,localWeather} from '../server-plugin/weather.mjs';
import {affairs} from '../server-plugin/ui-affairs.mjs';
import {appointedClaimClerk} from './helpers/office-actions.mjs';
import {reconcile,conservation} from './helpers/ledger-audit.mjs';

const world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const initial=()=>engine.createCharacter(seed,{},'s408-quota');
const scene=(options={})=>{
 const loaded=applyIntentSetup(engine,initial(),{location:'bld_bs_office',present:['npc_bs_townhead'],coins:200,inventory:{item_wood:2},...options});
 assert.deepEqual(loaded.setupUnmet,[]);return loaded.document;
};
const run=async(document,action,slots,eventId)=>{
 let out;try{out=await engine.reduce(document,{tool:'world_act',args:{action,slots},eventId});}catch(error){throw Error(`${eventId}: ${error.message}`,{cause:error});}
 assert.notEqual(out.result.receipt?.status,'rejected',JSON.stringify(out.result));
 return {document:applyPatches(document,out.patches),result:out.result};
};
const rights=(document,publisher='player')=>questPublishingRights(engine.scoped(document),document.state,publisher);
const publication={publisher:'npc_bs_townhead',personal:false,grade:'C',reward:40,content:'核看公署前厅',objective:{type:'visit',location:'bld_bs_office'}};
async function fundedScene(){
 const created=await run(scene(),'core:promise.create',{promisor:'player',promisee:publication.publisher,type:'付款',coins:80,content:'交付委托筹资',deadline:1980},'fund-promise');
 return (await run(created.document,'core:promise.settle',{obligation:created.result.obligation.id,coins:80},'fund-pay')).document;
}
const clean=(before,after)=>{
 const audit=reconcile(engine,after);for(const key of ['mismatches','drift','audit'])assert.deepEqual(audit[key],[]);
 assert.deepEqual(conservation(engine,before,after),[]);
};

test('新战役统一原生开局；导入旧档保留旧历与原时刻，缺失历法不猜测迁移',()=>{
 const otherSeed=structuredClone(seed);otherSeed.state.minute=987654;
 const native=engine.createCharacter(otherSeed,{},'other-opening');
 assert.equal(native.state.minute,initial().state.minute);assert.equal(native.state.minute,540);
 assert.equal(native.state.records['calendar:active'].calendar,'core:calendar_default');
 assert.equal(engine.scoped(native).calendar(540).calendar,'core:calendar_default');
 assert.deepEqual([affairs(engine,native).quota.limitD,affairs(engine,native).quota.usedD,affairs(engine,native).quota.remainingD],[0,0,0]);
 const old=engine.initialFromLegacy(otherSeed,'old-clock');
 assert.equal(old.state.minute,987654);assert.equal(old.state.records['calendar:active'],undefined);
 assert.equal(questQuotaMonth(engine,old.state),Math.floor(987654/43200));
 assert.equal(affairs(engine,old).time,engine.scoped(old).calendar(old.state.minute).text);
});

test('T1 原生日历短月、闰月与秋夜派生；日期换算是纯计算，不恢复历史状态',()=>{
 const date={calendar:'core:calendar_default',year:1,month:8,day:15,hour:18,minute:50};
 const minute=minuteForCalendarDate(engine,date),view=calendarDateAt(engine,minute,date.calendar);
 assert.deepEqual([view.month,view.day,view.season],[8,15,2]);
 const document=initial();
 // A pure weather/calendar projection, never passed to reduce as a campaign.
 const sky=localWeather(engine,{...document,state:{...document.state,minute}});
 assert.equal(sky.season,2);assert.equal(sky.daylight,false);
 for(const bad of [{...date,month:2,day:30},{...date,month:6,leap:true},{...date,season:2},{...date,day:0}])assert.throws(()=>minuteForCalendarDate(engine,bad),/date|Date/);
 const at=d=>minuteForCalendarDate(engine,{...date,...d});
 assert.equal(at({month:3,day:1,hour:0,minute:0})-at({month:2,day:29,hour:0,minute:0}),1440);
 const before=at({year:3,month:6,day:29,hour:23,minute:59}),after=before+1;
 assert.equal(calendarDateAt(engine,after,date.calendar).leap,true);
 assert.equal(questQuotaMonth(engine,{...document.state,minute:before}),questQuotaMonth(engine,{...document.state,minute:after}));
 assert.notEqual(questQuotaMonth(engine,{...document.state,minute:at({year:3,month:7,day:1})}),questQuotaMonth(engine,{...document.state,minute:after}));
});

test('正式镇长身份额度来自已发布职位；真实托管、取消退款不返还额度、不重复退款',async()=>{
 const before=await fundedScene(),publisher=publication.publisher,coins=before.state.npcs[publisher].coins;
 const entitlement=rights(before,publisher);
 assert.equal(entitlement.limitD,Math.max(...entitlement.sources.map(s=>s.value)));assert.ok(entitlement.limitD>=10);assert.equal(entitlement.usedD,0);
 let {document}=await run(before,'core:quest.publish',publication,'official-post');
 const id='quest_official-post';
 assert.equal(document.state.npcs[publisher].coins,coins-40);assert.equal(document.state.quests[id].escrow,40);
 assert.equal(rights(document,publisher).usedD,10);
 document=(await run(document,'core:quest.accept',{quest:id},'official-take')).document;
 const accepted=document;
 document=(await run(document,'core:quest.cancel',{quest:id},'official-cancel')).document;
 assert.equal(document.state.npcs[publisher].coins,coins);assert.equal(document.state.quests[id].refund,40);assert.equal(document.state.quests[id].escrow,0);
 assert.equal(rights(document,publisher).usedD,10);
 const rejected=await engine.reduce(document,{tool:'world_act',eventId:'over-quota',args:{action:'core:quest.publish',slots:{...publication,grade:'B'}}});
 assert.equal(rejected.result.receipt.status,'rejected');assert.match(rejected.result.receipt.reason,/额度/);assert.deepEqual(rejected.patches,[]);
 const later=(await run(document,'core:time',{minutes:1},'after-cancel')).document;
 assert.equal(later.state.npcs[publisher].coins,coins);assert.equal(later.state.quests[id].refund,40);
 clean(before,document);clean(document,later);
 let visited=(await run(accepted,'core:move',{destination:'loc_bs_guanqian',mode:'walk'},'official-leave')).document;
 visited=(await run(visited,'core:move',{destination:'bld_bs_office',mode:'walk'},'official-return')).document;
 const completed=(await run(visited,'core:quest.complete',{quest:id},'official-deliver')).document;
 assert.equal(completed.state.quests[id].rewardPaid,40);assert.equal(completed.state.player.coins,accepted.state.player.coins+40);
 const duplicate=await engine.reduce(completed,{tool:'world_act',eventId:'repeat-deliver',args:{action:'core:quest.complete',slots:{quest:id}}});
 assert.equal(duplicate.result.receipt.status,'rejected');assert.deepEqual(duplicate.patches,[]);clean(accepted,completed);
});

test('实际等到期限才退回发布人；保留失败回执与当月额度',async()=>{
 const before=await fundedScene(),publisher=publication.publisher;
 const posted=(await run(before,'core:quest.publish',{...publication,deadline:before.state.minute+1},'expiry-post')).document;
 const ended=(await run(posted,'core:time',{minutes:1},'expiry-wait')).document,q=ended.state.quests['quest_expiry-post'];
 assert.equal(q.status,'超期');assert.equal(q.escrow,0);assert.equal(q.refund,40);
 assert.equal(ended.state.npcs[publisher].coins,before.state.npcs[publisher].coins);
 assert.equal(rights(ended,publisher).usedD,10);
 assert.equal(ended.state.records[`${q.id}:超期`].sourceEvent,`${q.id}:超期`);
 clean(posted,ended);
});

test('真实申请、等待、任命收件席位，不臆造其未发布的发单额度',async()=>{
 const {document}=await appointedClaimClerk(engine,initial());
 assert.equal(rights(document).limitD,0);
 const view=affairs(engine,document);assert.equal(view.offices.some(o=>o.own),true);assert.equal(view.quota.limitD,0);
 const refused=await engine.reduce(document,{tool:'world_act',eventId:'clerk-no-quota',args:{action:'core:quest.publish',slots:{...publication,publisher:'player'}}});
 assert.equal(refused.result.receipt.status,'rejected');assert.match(refused.result.receipt.reason,/额度/);assert.deepEqual(refused.patches,[]);
});

test('真实创会职位取最大额度；实际跨正常月与短月只换一个月账',async()=>{
 // Existing organization gameplay is an independent identity consumer. This
 // does not replace T4's missing formal 1D office/escrow charter.
 let document=scene({location:'loc_hw',present:[]});
 const found=async(name,event)=>run(document,'core:create',{type:'org',name,data:{notes:'共同核账，按章程议事',occupation:'行会'}},event);
 const one=await found('河谷行旅会','found-one');document=one.document;
 const two=await found('河谷营造会','found-two');document=two.document;
 assert.equal(rights(document).limitD,10);
 const posted=(await run(document,'core:quest.publish',{...publication,publisher:'player',objective:{type:'visit',location:'loc_hw_gate'}},'guild-post')).document;
 assert.equal(rights(posted).usedD,10);const oldPeriod=rights(posted).month;
 document=(await run(posted,'core:time',{minutes:30*1440-posted.state.minute},'month-two')).document;
 assert.equal(engine.scoped(document).calendar(document.state.minute).month,2);
 assert.notEqual(rights(document).month,oldPeriod);assert.equal(rights(document).usedD,0);
 assert.equal(document.state.questQuota[`${oldPeriod}_player`],10);
 const month2=rights(document).month;
 document=(await run(document,'core:time',{minutes:29*1440},'month-three')).document;
 assert.equal(engine.scoped(document).calendar(document.state.minute).month,3);assert.notEqual(rights(document).month,month2);
 assert.equal(affairs(engine,document).quota.period,rights(document).month);
 assert.ok(document.state.quests['quest_guild-post']);
 assert.equal(document.state.questQuota[`${oldPeriod}_player`],10);
});

test('真实改任撤回新增发单额度，原托管合同与已用额度保留',async()=>{
 let document=scene({location:'bld_hw_qingdeng',present:['npc_hw_linsui']});
 const orgs=[];
 for(const [name,event]of [['河谷行旅会','found-one'],['河谷营造会','found-two']]){
  const out=await run(document,'core:create',{type:'org',name,data:{notes:'共同核账，按章程议事',occupation:'行会'}},event);
  document=out.document;orgs.push(out.result.organization);
 }
 // Keep this actual-action prerequisite visible when the organization consent
 // route cannot establish it. No raw-tool bypass or injected membership.
 for(const org of orgs){
  const joined=await run(document,'core:settlement.org_join',{org,member:'npc_hw_linsui',consent:true},`join:${org}`);document=joined.document;
  document=(await run(document,'core:settlement.org_vote',{org,proposal:joined.result.proposal,opinion:'approve'},`admission:${org}`)).document;
 }
 const posted=(await run(document,'core:quest.publish',{...publication,publisher:'player',objective:{type:'visit',location:'loc_hw_gate'}},'guild-post')).document;
 const oldPeriod=rights(posted).month;let removed=posted;
 for(const org of orgs)removed=(await run(removed,'core:settlement.org_propose',{org,action:'appoint',member:'npc_hw_linsui',name:'会长'},`replace:${org}`)).document;
 assert.equal(rights(removed).limitD,0);
 assert.deepEqual(removed.state.quests['quest_guild-post'],posted.state.quests['quest_guild-post']);
 assert.equal(removed.state.questQuota[`${oldPeriod}_player`],10);
 const refused=await engine.reduce(removed,{tool:'world_act',eventId:'after-leaving',args:{action:'core:quest.publish',slots:{...publication,publisher:'player'}}});
 assert.equal(refused.result.receipt.status,'rejected');assert.match(refused.result.receipt.reason,/额度/);assert.deepEqual(refused.patches,[]);
});

test('真实发单经存盘、重开和事件复演保持托管与额度一次，取消可查',async t=>{
 const root=await fs.mkdtemp(path.join(process.cwd(),'.s408-store-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const reducer=(d,input,options)=>engine.reduce(d,input,options),store=new CampaignStorage(root,{reducer});
 const document=scene();await store.create({id:'quota-save',worldVersion:world.version,document});
 for(const [id,action,slots]of [
  ['fund-promise','core:promise.create',{promisor:'player',promisee:publication.publisher,type:'付款',coins:80,content:'交付委托筹资',deadline:1980}],
  ['fund-pay','core:promise.settle',{obligation:'obl_fund-promise',coins:80}]
 ])await store.transact('quota-save',{id,anchor:id,input:{tool:'world_act',args:{action,slots},eventId:id}},reducer);
 const input={tool:'world_act',args:{action:'core:quest.publish',slots:publication},eventId:'saved-post'};
 await store.transact('quota-save',{id:'post',anchor:'post',input},reducer);
 const posted=await store.load('quota-save');
 const reopened=await new CampaignStorage(root,{reducer}).load('quota-save');
 assert.deepEqual(reopened.document,posted.document);assert.equal(rights(reopened.document,publication.publisher).usedD,10);
 assert.equal(reopened.document.state.quests['quest_saved-post'].escrow,40);
 clean(document,reopened.document);
 await store.transact('quota-save',{id:'take',anchor:'take',input:{tool:'world_act',args:{action:'core:quest.accept',slots:{quest:'quest_saved-post'}},eventId:'saved-take'}},reducer);
 const cancellation={id:'cancel',anchor:'cancel',input:{tool:'world_act',args:{action:'core:quest.cancel',slots:{quest:'quest_saved-post'}},eventId:'saved-cancel'}};
 await store.transact('quota-save',cancellation,reducer);const cancelled=await store.load('quota-save');
 await store.transact('quota-save',cancellation,reducer);
 const ended=await new CampaignStorage(root,{reducer}).load('quota-save');assert.deepEqual(ended.document,cancelled.document);
 assert.equal(ended.document.state.quests['quest_saved-post'].refund,40);assert.equal(ended.document.state.quests['quest_saved-post'].escrow,0);
 assert.equal(rights(ended.document,publication.publisher).usedD,10);clean(posted.document,ended.document);
});
