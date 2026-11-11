// S5-A 提交与回执的完成语义：认证/升职期间租金入账与账本一致（F073）。
import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {personHousehold}from'../server-plugin/entity-view.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const home='bld_hw_riverhome',tenant='npc_hw_ayan',DAY=1440;
async function rentedSetup(){
    const world=await loadWorld(),mentor=world.npcs.find(row=>row.id==='npc_hw_xuling');mentor.promotionRanks={profession_mage:6};delete mentor.schedule;mentor.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:['teach']}]};
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'s5ca-rent');
    document.state.location=home;document.state.npcs.npc_hw_xuling.location=home;document.state.player.level=10;document.state.player.coins=1000;document.state.skills.skill_light.proficiency=100;
    // 玩家名下的私宅，租客是真实人物：由原生 rent_out 立约，月租在推进中到期入账。
    engine.byId.get(home).purpose='私宅';document.state.buildings[home]={owner:'player',condition:100};
    const person=world.npcs.find(n=>n.id===tenant);delete person.schedule;person.schedule={default:[{start:0,end:1440,location:home,activity:'休息',services:['trade']}]};
    Object.assign(document.state.npcs[tenant],{location:home,status:'正常',activity:'休息',coins:500});
    const oldHome=personHousehold(engine,document.state,tenant).value.homeLocation;document.state.buildings[oldHome]={...document.state.buildings[oldHome],condition:0};
    return{world,engine,document};
}
const reduce=async(engine,c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
test('认证期间租金入账：现金随推进后的余额扣费，账本核对照常通过',async()=>{
    const{engine,document}=await rentedSetup();
    const rent=await reduce(engine,document,'world_trade',{operation:'rent_out',seller:tenant,location:home,days:90,consent:true},'lease');
    const lease=rent.document.state.records[rent.result.contract];assert.ok(lease,'租约已立');
    // 把时钟拨到月租到期前 60 分钟（认证要走 120 分钟）。
    rent.document.state.minute=lease.nextRent-60;
    const before=rent.document.state.player.coins;let joined=null;
    for(let i=0;i<100&&!joined;i++){const row=await reduce(engine,rent.document,'world_profession',{profession:'法师',teacher:'许苓'},`cert_${i}`);if(row.result.certified)joined=row;}
    assert.ok(joined,'认证成功（对账未拒绝）');
    const state=joined.document.state;
    assert.equal(state.professions.combat,'profession_mage');
    assert.ok(state.records[rent.result.contract].paid>lease.paid,'推进期间结算了租金');
    const rentIn=state.records[rent.result.contract].paid-lease.paid;
    assert.equal(state.player.coins,before+rentIn-30,'现金=原有+期间收租-认证费');
});
test('升职期间租金入账：升职费按推进后的余额扣，提交成功',async()=>{
    const{world,engine,document}=await rentedSetup();
    document.state.professions.combat='profession_mage';document.state.skills.skill_light.proficiency=600;document.state.player.level=60;
    const first=world.professions.find(row=>row.id==='profession_mage').promotions[0].choices[0];
    const rent=await reduce(engine,document,'world_trade',{operation:'rent_out',seller:tenant,location:home,days:90,consent:true},'lease');
    const lease=rent.document.state.records[rent.result.contract];rent.document.state.minute=lease.nextRent-90;
    const before=rent.document.state.player.coins;let promoted=null;
    for(let i=0;i<100&&!promoted;i++){const row=await reduce(engine,rent.document,'world_profession',{profession:'法师',teacher:'许苓',operation:'promote',choice:first.id},`promote_${i}`);if(row.result.promoted)promoted=row;}
    assert.ok(promoted,'升职成功（对账未拒绝）');
    const state=promoted.document.state,rentIn=state.records[rent.result.contract].paid-lease.paid;
    assert.ok(rentIn>0,'推进期间结算了租金');assert.equal(state.player.coins,before+rentIn-first.fee);
});

// ---- F052：长等待分段，重试取回与首次完全相同的回执 ----
import {uiSession}from'./helpers/ui-script.mjs';
import {scene,monthDayMinute,primed}from'./helpers/daily-b2.mjs';
import {CampaignStorage}from'../server-plugin/storage.mjs';
test('长等待 43200+100 分钟：首次与重试的分钟、总耗时、段数完全相同，重试不再多等',async t=>{
    const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(3,5,9,0))});await primed(ui);
    const first=await ui.choose('time',{minutes:43200+100},{eventId:'wait-a'});assert.ok(first.ok,first.error);
    assert.equal(first.result.segments,2);assert.equal(first.result.elapsed,43300);assert.equal(first.result.interrupted,undefined);
    const after=await ui.read();
    const again=await ui.retry('time',{minutes:43200+100},'wait-a');
    assert.equal(again.duplicate,true);assert.deepEqual(again.result,first.result,'重试回执与首次完全相同');
    assert.equal((await ui.read()).state.minute,after.state.minute,'重试不多等');
});
test('按钟点等 45 天：重试仍取回完整回执，不会因时钟已走而当成新请求再等一遍',async t=>{
    const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(3,5,9,0))});await primed(ui);
    const slots={until:{dayOffset:45,hour:9,minute:1}};
    const first=await ui.choose('time',slots,{eventId:'wait-until'});assert.ok(first.ok,first.error);assert.equal(first.result.segments,2);
    const after=await ui.read(),n=(await ui.server.api('export',{campaignId:ui.campaignId})).events.length;
    const again=await ui.retry('time',slots,'wait-until');
    assert.equal(again.duplicate,true);assert.deepEqual(again.result,first.result);
    assert.equal((await ui.read()).state.minute,after.state.minute);
    assert.equal((await ui.server.api('export',{campaignId:ui.campaignId})).events.length,n,'重试没有新增事件');
});
test('第二段失败：回执照实显示第一段已发生与中断原因，重试取回同一份回执而不再多等',async t=>{
    const ui=await uiSession(t,{mutate:scene('loc_hw',monthDayMinute(3,5,9,0))});await primed(ui);
    // 只替换存储的写入函数，让 #2 段落盘失败一次；产品代码不变。
    const original=CampaignStorage.prototype.transact;let failed=false;
    CampaignStorage.prototype.transact=function(id,request,reducer){
        if(!failed&&request.id==='wait-b#2'){failed=true;return Promise.reject(new Error('磁盘写入失败'));}
        return original.call(this,id,request,reducer);
    };
    t.after(()=>{CampaignStorage.prototype.transact=original;});
    const before=(await ui.read()).state.minute;
    const first=await ui.choose('time',{minutes:43200+100},{eventId:'wait-b'});
    assert.ok(first.ok,first.error);assert.equal(first.result.segments,1);assert.equal(first.result.elapsed,43200);assert.match(first.result.interrupted,/磁盘写入失败/);
    const mid=await ui.read();assert.equal(mid.state.minute,before+43200,'第一段已经发生');
    const again=await ui.retry('time',{minutes:43200+100},'wait-b');
    assert.equal(again.duplicate,true);assert.deepEqual(again.result,first.result,'重试回执与首次相同：第一段已发生、第二段中断');
    assert.equal((await ui.read()).state.minute,mid.state.minute);
});
