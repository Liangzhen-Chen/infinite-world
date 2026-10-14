import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import {init} from '../server-plugin/index.mjs';
import {loadWorld} from '../tools/load-world.mjs';
import {modelToolCall,toolDefinitions} from '../extension/tools.mjs';
import {evaluateAssertions} from '../tools/playtest-assertions.mjs';

const world=await loadWorld();
const qty=value=>typeof value==='number'?value:value?.quantity??0;
const script=async id=>JSON.parse(await fs.readFile(new URL(`playtests/${id}.json`,import.meta.url),'utf8'));

async function session(t,id){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-m1-preconditions-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const app=express();app.use(express.json({limit:'500mb'}));const router=express.Router();
    let providerCalls=0;
    const forbidden=()=>{providerCalls++;throw new Error('本卡不允许调用模型');};
    // Fixed once for reproducibility; never search seeds/event IDs for a desired roll.
    await init(router,{world,baseRoot:root,newCampaignSeed:()=> 'm1-preconditions',
        npcPlanningEnabled:false,npcPlanner:forbidden,consistencyEnabled:false,consistencyClient:forbidden});
    app.use(router);const server=app.listen(0,'127.0.0.1');await once(server,'listening');
    t.after(()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())));
    const request=async(endpoint,body)=>{
        const response=await fetch(`http://127.0.0.1:${server.address().port}${endpoint}`,{
            method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        return{status:response.status,body:await response.json()};
    };
    const created=await request('/create',{character:{}});assert.equal(created.status,200,created.body.error);
    const campaignId=created.body.reference.campaignId,scenario=await script(id);let sequence=0;
    let document=(await request('/read',{campaignId})).body.document;
    const read=async()=>{document=(await request('/read',{campaignId})).body.document;return document;};
    const lessons=[],repairs=[],trace=[],publicNames=new Set(toolDefinitions().map(row=>row.function.name));
    async function call(tool,args){
        const routed=modelToolCall(tool,args),eventId=`${id}_offline_${sequence++}`,before=document;
        assert.ok(publicNames.has(routed.tool)||tool==='world_turn',`${tool}必须经过公共工具路由`);
        const response=await request('/execute',{campaignId,...routed,eventId,anchor:eventId});
        assert.equal(response.status,200,`${tool}: ${response.body.error}`);
        document=response.body.document??await read();const result=response.body.result;
        if(tool==='world_learn'){
            const record=document.state.learning[eventId];assert.ok(record);
            assert.equal(result.ok,true);assert.equal(typeof result.success,'boolean');
            assert.ok(Number.isSafeInteger(result.die));assert.ok(result.die>=1&&result.die<=20);
            assert.equal(document.state.minute-before.state.minute,result.minutes);
            assert.equal(document.state.player.coins-before.state.player.coins,-result.cost);
            assert.equal(document.state.npcs[result.teacher].coins-before.state.npcs[result.teacher].coins,result.cost);
            assert.deepEqual(document.state.inventory,before.state.inventory);
            assert.equal(record.success,result.success);assert.equal(record.end-record.start,result.minutes);
            const partition={skill:'skills',recipe:'recipes',spell:'spells'}[result.entity.split('_')[0]];
            assert.equal(Boolean(document.state[partition][result.entity]),result.success);
            if(!result.success)assert.ok(result.notices.some(row=>row.text.includes('尚未学会')));
            lessons.push({eventId,success:result.success,cost:result.cost,minutes:result.minutes});
        }
        if(tool==='world_craft'&&args.operation==='repair'){
            assert.equal(result.ok,true);assert.equal(document.state.minute-before.state.minute,20);
            assert.equal(document.state.player.coins-before.state.player.coins,-2);
            assert.equal(document.state.workshopFunds.station_hw_mill_bench-before.state.workshopFunds.station_hw_mill_bench,2);
            assert.equal(document.state.inventory.item_whittling_knife.durability,before.state.inventory.item_whittling_knife.durability-1);
            assert.deepEqual(result.spent.materials,[]);assert.deepEqual(document.state.inventory.item_wood,before.state.inventory.item_wood);
            assert.equal(qty(document.state.inventory.item_staff),qty(before.state.inventory.item_staff));
            assert.equal(document.state.records[result.receipt].success,result.success);
            if(result.success){assert.equal(result.after.maxDurability,result.before.maxDurability-1);assert.ok(result.restored>0);}
            else{assert.deepEqual(result.after,result.before);assert.equal(result.restored,0);}
            repairs.push({eventId,success:result.success,die:result.die,total:result.total,helpers:result.helpers??[],before:result.before,after:result.after});
        }
        return{...routed,result,eventId};
    }
    async function reject(tool,args,pattern){
        const before=document,routed=modelToolCall(tool,args),eventId=`${id}_offline_${sequence++}`;
        const response=await request('/execute',{campaignId,...routed,eventId,anchor:eventId});
        assert.equal(response.status,400);assert.match(response.body.error,pattern);
        assert.deepEqual(await read(),before,'前置拒绝不得改变钱物、时间或事件状态');
        return response.body.error;
    }
    async function turn(index,act=async()=>[],extraMinutes=0){
        const before=document,calls=await act();
        await call('world_turn',{startMinute:before.state.minute,extraMinutes,
            outOfCharacter:scenario.turns[index].input.startsWith('（场外）')});
        const checked=evaluateAssertions(scenario.turns[index].assertions,{before,after:document,calls,reply:''});
        assert.ok(checked.every(row=>row.pass),JSON.stringify({id,index,failed:checked.filter(row=>!row.pass)}));
        trace.push({turn:index,minute:document.state.minute,coins:document.state.player.coins,location:document.state.location});
        return{before,after:document,calls};
    }
    async function roundTrip(){
        const before=document,bundle=(await request('/export',{campaignId})).body;
        const restored=await request('/import',{bundle});assert.equal(restored.status,200,restored.body.error);
        assert.deepEqual(restored.body.document,before);
        assert.deepEqual(await read(),before);assert.equal(providerCalls,0);
    }
    t.after(()=>t.diagnostic(JSON.stringify({scope:'隔离公共HTTP前置，模型0；不代表真实提示栈验收',id,trace,lessons,repairs,providerCalls})));
    return{scenario,call,reject,turn,roundTrip,request,campaignId,lessons,repairs,get document(){return document;}};
}

test('制造真实磨损小刀；实际交锋磨损正式木杖后经公共repair路由结算，前置拒绝无钱物时间变化',async t=>{
    const s=await session(t,'craft');assert.ok(s.scenario.turns.length>=8&&s.scenario.turns.length<=20);
    await s.turn(0,async()=>[await s.call('world_move',{destination:'旧磨坊'})]);
    await s.reject('world_craft',{operation:'repair',item:'旧木杖'},/可恢复的耐久空间/);
    await s.reject('world_craft',{operation:'manufacture',recipe:'削制榫用木楔'},/尚未学会/);
    const bought=await s.turn(1,async()=>[await s.call('world_trade',{seller:'阿砚',item:'削木小刀',quantity:1}),await s.call('world_trade',{seller:'阿砚',item:'木料',quantity:2})]);
    assert.equal(bought.after.state.inventory.item_whittling_knife.durability,80);
    assert.equal(bought.before.state.player.coins-bought.after.state.player.coins,
        bought.after.state.npcs.npc_hw_ayan.coins-bought.before.state.npcs.npc_hw_ayan.coins);
    await s.turn(2,async()=>[await s.call('world_learn',{entity:'木匠基础手艺',source:'阿砚'})]);
    for(const index of[3,4,5])await s.turn(index,async()=>{
        if(!s.document.state.skills.skill_life_6_core)return[await s.call('world_learn',{entity:'skill_life_6_core',source:'阿砚'})];
        if(!s.document.state.recipes.recipe_wooden_pegs)return[await s.call('world_learn',{entity:'recipe_wooden_pegs',source:'阿砚'})];
        return[];
    });
    assert.ok(s.document.state.skills.skill_life_6_core);assert.ok(s.document.state.recipes.recipe_wooden_pegs);
    const made=await s.turn(6,async()=>[await s.call('world_craft',{operation:'manufacture',recipe:'削制榫用木楔'})]);
    assert.equal(made.after.state.inventory.item_whittling_knife.durability,79);
    assert.equal(qty(made.after.state.inventory.item_wooden_peg)-qty(made.before.state.inventory.item_wooden_peg),made.calls[0].result.success?4:0);
    await s.turn(7,async()=>[await s.call('world_move',{destination:'北林边'})]);
    await s.turn(8,async()=>[await s.call('world_time',{minutes:1200-s.document.state.minute,activity:'休息'})]);
    let animal;
    await s.turn(9,async()=>{const calls=[];for(let attempt=0;attempt<3&&!animal;attempt++){
        const call=await s.call('world_wildlife',{operation:'track',species:'路鬃野猪'});calls.push(call);animal=call.result.found?.id;
    }assert.ok(animal,'三次实际付时追踪仍无个体，不能伪造交锋');return calls;});
    await s.turn(10,async()=>{const calls=[];for(let i=0;i<2;i++){
        assert.equal(s.document.state.player.status,'正常');assert.notEqual(s.document.state.creatures[animal].status,'死亡');
        calls.push(await s.call('world_combat',{target:animal,weapon:'旧木杖',intent:'defend'}));
    }return calls;});
    await s.turn(11,async()=>{
        const calls=[];if(s.document.state.player.status==='濒死')calls.push(await s.call('world_time',{minutes:10,activity:'等待'}));
        if(s.document.state.player.status==='死亡')calls.push(await s.call('world_time',{minutes:1,activity:'等待'}));
        calls.push(await s.call('world_time',{minutes:180,activity:'休息'}));return calls;
    });
    await s.reject('world_craft',{operation:'repair',item:'旧木杖'},/工作台/);
    await s.turn(12,async()=>[await s.call('world_move',{destination:'旧磨坊'})]);
    await s.reject('world_craft',{operation:'repair',item:'旧木杖',repairPlan:'用小刀修整杖身'},/工序编号未识别/);
    const repaired=await s.turn(13,async()=>[await s.call('world_craft',{operation:'repair',item:'旧木杖'})]);
    const result=repaired.calls[0].result;assert.equal(result.before.durability,98);
    assert.equal(result.provenance.maker,null);assert.equal(result.provenance.recipe,null);
    // Retry transmission of this actual event, never another roll; fees/time/wear remain single.
    const repeated=await s.request('/execute',{campaignId:s.campaignId,...modelToolCall('world_craft',{operation:'repair',item:'旧木杖'}),eventId:repaired.calls[0].eventId});
    assert.equal(repeated.body.duplicate,true);assert.deepEqual(repeated.body.result,result);
    await s.turn(14,async()=>result.success?[]:[await s.call('world_craft',{operation:'repair',item:'旧木杖'})]);
    await s.turn(15,async()=>s.repairs.at(-1).success?[]:[await s.call('world_craft',{operation:'repair',item:'旧木杖'})]);
    await s.turn(16);await s.roundTrip();
    // The public promise is the supplied lawful agreement for this engine precondition.
    // This does not claim autonomous NPC consent in a real model conversation.
    const waited=await s.turn(17,async()=>[await s.call('world_time',{minutes:2010-s.document.state.minute,activity:'休息'})]);
    // 登记的实体（果实、渗漏缸、积淤堤岸、药柜等）会随时间自然腐败渗漏，各法术批次陆续增加；它们由各自测试核对。
    // 这里核对其余记录不变、记录键集合不变，果实的总量守恒在下面单独核对。
    const nonPerishable=records=>Object.fromEntries(Object.entries(records).filter(([id])=>!id.startsWith('physical_feature:')));
    assert.deepEqual(Object.keys(waited.after.state.records).sort(),Object.keys(waited.before.state.records).sort());
    assert.deepEqual(nonPerishable(waited.after.state.records),nonPerishable(waited.before.state.records));
    const oldFruit=waited.before.state.records['physical_feature:feature_s1_fruit'].state.foodLots[0],newFruit=waited.after.state.records['physical_feature:feature_s1_fruit'].state.foodLots[0];
    assert.ok(Math.abs(oldFruit.amountGrams+oldFruit.spoiledGrams-newFruit.amountGrams-newFruit.spoiledGrams)<1e-8);
    assert.ok(newFruit.spoiledGrams>oldFruit.spoiledGrams);
    const teacher=s.document.state.npcs.npc_hw_ayan;
    assert.equal(teacher.location,s.document.state.location);
    assert.ok(!teacher.scheduleTravel&&!teacher.cognitionTravel);
    assert.ok(!['死亡','濒死','昏迷','患病'].includes(teacher.status));
    assert.doesNotMatch(teacher.activity??'',/睡眠|熟睡|睡觉/);
    assert.equal(world.npcs.find(row=>row.id==='npc_hw_ayan').skills.skill_life_6_core,120);
    await s.reject('world_promise',{operation:'create',promisor:'阿砚',type:'协助',skill:'识字',attribute:'智力',content:'指点认字'},/协助者技能不足/);
    const promised=await s.turn(18,async()=>[await s.call('world_promise',{operation:'create',promisor:'阿砚',
        promisee:'player',type:'协助',skill:'木匠基础手艺',attribute:'敏捷',deadline:s.document.state.minute+60,
        content:'在木工台指导这一次旧木杖修整'})]);
    const obligation=promised.calls[0].result.obligation;
    assert.equal(obligation.skill,'skill_life_6_core');assert.equal(obligation.status,'待履行');
    await s.reject('world_craft',{operation:'repair',item:'旧木杖',helpers:['阿砚']},/协助需要/);
    const assisted=await s.turn(19,async()=>[await s.call('world_craft',{operation:'repair',item:'旧木杖',helpers:[obligation.id]})]);
    const helped=assisted.calls[0],helper=helped.result.helpers[0];
    assert.equal(helped.result.helpers.length,1);assert.equal(helper.obligation,obligation.id);assert.equal(helper.npc,'npc_hw_ayan');
    assert.equal(helper.bonus,helper.success?2:0);
    assert.equal(helped.result.modifier,1+helper.bonus,'原角色敏捷与工艺没有被测试改写');
    assert.equal(s.document.state.obligations[obligation.id].status,'已完成');
    assert.equal(s.document.state.obligations[obligation.id].completion.source,helped.eventId);
    assert.equal(s.document.state.obligations[obligation.id].completion.success,helper.success);
    assert.equal(s.document.state.npcs.npc_hw_ayan.developments.filter(row=>row.source===helped.eventId&&row.type==='协助行动').length,1);
    const after=structuredClone(s.document);
    const retry=await s.request('/execute',{campaignId:s.campaignId,...modelToolCall('world_craft',{
        operation:'repair',item:'旧木杖',helpers:[obligation.id]}),eventId:helped.eventId});
    assert.equal(retry.body.duplicate,true);assert.deepEqual(retry.body.result,helped.result);
    assert.deepEqual((await s.request('/read',{campaignId:s.campaignId})).body.document,after);
    await s.reject('world_check',{attribute:'敏捷',skill:'木匠基础手艺',difficulty:10,helpers:[obligation.id]},/尚有效且未履行/);
    await s.roundTrip();
    assert.deepEqual(s.repairs.slice(0,3).map(row=>[row.eventId,row.success]),[
        ['craft_offline_33',false],['craft_offline_35',false],['craft_offline_37',false]]);
    assert.ok(s.lessons.some(row=>!row.success));assert.ok(s.lessons.some(row=>row.success));
    assert.ok(s.repairs.some(row=>!row.success),'保留第一轮实际失败');
    assert.ok(s.repairs.some(row=>row.success),'前三次失败及一次正规协助修整中保留实际成功证据');
});

test('识字真实付费学习与合法检定失败分别对账；按保存结果练习，原学会目标保留',async t=>{
    const s=await session(t,'literacy');assert.ok(s.scenario.turns.length>=8&&s.scenario.turns.length<=20);
    await s.turn(0,async()=>[await s.call('world_move',{destination:'小学堂'})]);
    await s.turn(1,async()=>[],5);
    await s.reject('world_learn',{entity:'基础识字',source:'阿砚'},/导师不在场/);
    await s.reject('world_learn',{entity:'基础识字',source:'田契识字课本'},/没有这本书/);
    await s.turn(2,async()=>[await s.call('world_learn',{entity:'基础识字',source:'陆青'})]);
    for(const index of[3,4])await s.turn(index,async()=>s.document.state.skills.skill_literacy?
        [await s.call('world_practice',{skill:'识字',target:'识字课本',gain:10})]:
        [await s.call('world_learn',{entity:'skill_literacy',source:'陆青'})]);
    await s.turn(5);
    await s.reject('world_learn',{entity:'基础识字',source:'陆青'},/已经学会/);
    await s.turn(6,async()=>[await s.call('world_practice',{skill:'识字',target:'识字课本',gain:10})]);
    await s.turn(7,async()=>[await s.call('world_move',{destination:'河湾村'})]);
    await s.roundTrip();
});
