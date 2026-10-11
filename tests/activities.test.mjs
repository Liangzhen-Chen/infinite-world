import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),fresh=()=>engine.initialFromLegacy({state:seed.state,memories:seed.memories},'activities-test');
const run=async(c,tool,args,eventId='test')=>{const output=await engine.reduce(c,{tool,args,eventId});return {document:applyPatches(c,output.patches),result:output.result};};
test('公共工程：没有授权拒绝，有授权消耗材料并按日完工',async()=>{
    let c=fresh();await assert.rejects(run(c,'world_settlement',{settlement:'河湾村',operation:'start_project',wood:5,days:2,name:'补桥'}),/授权/);
    c.state.records.authorized={category:'authorization',settlement:'loc_hw'};
    c=(await run(c,'world_settlement',{settlement:'河湾村',authorization:'authorized',operation:'start_project',wood:5,days:2,name:'补桥'},'bridge')).document;
    assert.equal(c.state.settlements.loc_hw.wood,23);
    c=(await run(c,'world_time',{minutes:2880},'days')).document;assert.equal(c.state.projects.project_bridge.status,'已完成');
});
test('任务：身份额度、托管、领取、可核验交付和一次结算',async()=>{
    let c=fresh();await assert.rejects(run(c,'world_quest',{operation:'publish',publisher:'林穗',grade:'B',reward:20,content:'交粮',objective:{type:'deliver',item:'干粮',quantity:1}}),/额度/);
    c=(await run(c,'world_quest',{operation:'publish',publisher:'林穗',personal:true,grade:'D',reward:20,content:'买一份干粮',objective:{type:'deliver',item:'干粮',quantity:1}},'offer')).document;
    assert.equal(c.state.npcs.npc_hw_linsui.coins,430);assert.equal(c.state.quests.quest_offer.escrow,20);
    c=(await run(c,'world_quest',{operation:'accept',quest:'quest_offer'},'accept')).document;
    c=(await run(c,'world_quest',{operation:'complete',quest:'quest_offer'},'done')).document;
    assert.equal(c.state.player.coins,200);assert.equal(c.state.inventory.item_ration.quantity,2);assert.equal(c.state.quests.quest_offer.escrow,0);
    await assert.rejects(run(c,'world_quest',{operation:'complete',quest:'quest_offer'},'repeat'),/可结算/);
});

test('无效任务操作直接提示支持的操作且不改变账本',async()=>{
    const c=fresh(),before=structuredClone(c);
    for(const operation of ['create','finish',undefined]){
        await assert.rejects(run(c,'world_quest',{operation,publisher:'林穗',personal:true,grade:'D',reward:20,content:'交粮',objective:{type:'deliver',item:'干粮',quantity:1}}),/发布用publish.*接受用accept.*完成用complete/);
        assert.deepEqual(c,before);
    }
});
test('运行时 NPC：稳定编号、年龄标记、重复名称拒绝、不能白送钱物',async()=>{
    const c=fresh();const created=await run(c,'world_create',{type:'npc',name:'测试赶车人',data:{age:16,occupation:'赶车人学徒',notes:'正在等舅舅修轮轴',coins:1000}},'cartboy');
    assert.equal(created.document.state.created.npc_created_cartboy.flags.minor,true);
    assert.equal(created.document.state.created.npc_created_cartboy.flags.romanceable,false);assert.equal(created.document.state.npcs.npc_created_cartboy.coins,0);
    await assert.rejects(run(created.document,'world_create',{type:'npc',name:'测试赶车人',data:{age:30,occupation:'车夫',notes:'另一个人'}},'duplicate'),/已存在/);
    await assert.rejects(run(c,'world_create',{type:'item',name:'免费神剑',data:{}},'sword'),/不能凭空/);
    await assert.rejects(run(c,'world_create',{type:'spell',name:'陨石术',data:{mp:1}},'meteor'),/多日研究/);
});
test('NPC 冲突：交锋生命由引擎计算，生命归零是永久死亡',async()=>{
    let c=fresh();c.state.npcs.npc_hw_linsui.hp=1;
    for(let i=0;i<20&&c.state.npcs.npc_hw_linsui.status!=='死亡';i++)c=(await run(c,'world_combat',{target:'林穗',weapon:'旧木杖'},`attack_${i}`)).document;
    assert.equal(c.state.npcs.npc_hw_linsui.status,'死亡');assert.equal(c.state.npcs.npc_hw_linsui.hp,0);
    await assert.rejects(run(c,'world_combat',{target:'林穗'}),/已经死亡|你已经死亡/);
});
test('研究：记录构想、资金和失败；不能跳过多日研究直接获得能力',async()=>{
    const c=fresh(),started=await run(c,'world_research',{operation:'start',name:'防雨光点',concept:'让照明光点附着在雨披上',skills:['照明术']},'study');
    const worked=await run(started.document,'world_research',{operation:'work',project:'research_study',coins:5,minutes:120},'study1');
    assert.equal(worked.document.state.player.coins,175);assert.equal(worked.document.state.projects.research_study.investment,5);
    assert.equal(Object.keys(worked.document.state.spells).length,1);
});
