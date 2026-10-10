import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'npc-integration');
    const run=async(c,tool,args,eventId)=>{const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
test('约定实际占用服务窗口，拒绝动作不扣款；原地等待履约有可见状态',async()=>{
    const {engine,document,run}=await setup();
    const reserved=(await run(document,'world_promise',{promisor:'林穗',type:'会面',content:'一起核账半小时',start:540,deadline:570},'meeting')).document;
    assert.match(engine.scene(reserved,'林穗'),/此刻：会面/);
    const before=structuredClone(reserved);
    await assert.rejects(run(reserved,'world_trade',{seller:'林穗',item:'面包',quantity:1},'buy'),/时段冲突/);assert.deepEqual(reserved,before);
    const done=await run(reserved,'world_time',{minutes:30},'meet');
    assert.equal(done.document.state.obligations.obl_meeting.status,'已完成');
    assert.equal(done.document.state.obligations.obl_meeting.togetherMinutes,30);
    assert.ok(done.result.notices.some(row=>row.type==='obligations'&&row.text.includes('已完成')));
    assert.ok(done.document.state.npcs.npc_hw_linsui.memoryStream.some(row=>row.kind==='obligation'&&row.content.includes('已完成')));
});
test('到期交付不能隔空转移财物，位置不符给出违约原因并保留双方钱袋',async()=>{
    const {document,run}=await setup();
    const promised=(await run(document,'world_promise',{promisor:'林穗',type:'付款',coins:2,content:'当面归还两铜',deadline:550},'pay')).document;
    const left=(await run(promised,'world_move',{destination:'loc_hw'},'leave')).document;
    const source=left.state.npcs.npc_hw_linsui.coins,target=left.state.player.coins;
    const late=await run(left,'world_time',{minutes:Math.max(1,550-left.state.minute)},'due');
    assert.equal(late.document.state.npcs.npc_hw_linsui.coins,source);assert.equal(late.document.state.player.coins,target);
    const obligation=late.document.state.obligations.obl_pay;
    assert.equal(obligation.status,'违约');assert.match(obligation.reason,/同一地点|隔空/);
});
test('真实交锋进入参与和目击记忆，包括使用公共combat入口的推搡',async()=>{
    const {document,run}=await setup();
    const out=await run(document,'world_combat',{target:'林穗',intent:'shove'},'shove');
    const memory=out.document.state.npcs.npc_hw_linsui.memoryStream.find(row=>row.sourceEvent==='shove');
    assert.ok(memory);assert.equal(memory.kind,'conflict');assert.equal(memory.sourceType,'亲历');
    assert.match(memory.content,new RegExp(`对方受伤${out.result.damage}`));
});

test('完整引擎离开十天有真实自主账本；五分钟步进与一次长等待保持人物结果一致',async()=>{
    const {engine,document,run}=await setup();document.state.location='loc_capital';
    const long=await run(document,'world_time',{minutes:14400},'ten-days');
    let short=document;
    // Cross the first daily start and completion in small steps; later days
    // use daily boundaries to exercise both caller partition patterns.
    for(let i=0;i<24;i++)short=(await run(short,'world_time',{minutes:5},`small-${i}`)).document;
    for(let i=0;i<9;i++)short=(await run(short,'world_time',{minutes:1440},`day-${i}`)).document;
    short=(await run(short,'world_time',{minutes:1320},'last')).document;
    assert.deepEqual(short.state.npcs,long.document.state.npcs);
    assert.deepEqual(short.state.npcAutonomy,long.document.state.npcAutonomy);
    assert.deepEqual(short.state.settlements,long.document.state.settlements);
    const actions=Object.values(long.document.state.npcAutonomy.actions);
    assert.ok(actions.some(row=>row.kind==='craft'));assert.ok(actions.some(row=>row.kind==='audit_inventory'));
    assert.ok(long.document.state.npcs.npc_hw_ayan.inventory.item_wood.quantity<20);
    const visiting=structuredClone(long.document);visiting.state.location=visiting.state.npcs.npc_hw_ayan.location;
    assert.match(engine.scene(visiting,'阿砚这几天做了什么'),/本人近期经历，玩家未必知情/);
    assert.equal(long.result.notices.some(row=>row.text.includes('盘点了本人')),false);
});

test('实际推搡在耗时结算前中断NPC工作，不会边交锋边完成原制作',async()=>{
    const {document,run}=await setup();document.state.location='bld_hw_mill';document.state.minute=600;
    const npc=document.state.npcs.npc_hw_ayan;npc.location='bld_hw_mill';npc.activity='修整木件';
    document.state.npcAutonomy={tasks:{work:{id:'work',npc:'npc_hw_ayan',action:{kind:'craft',recipe:'recipe_wooden_pegs'},start:590,finish:601,status:'进行中',presence:{npcs:{npc_hw_ayan:{location:'bld_hw_mill',activity:'修整木件',status:'正常'}}}}}};
    const before=structuredClone(npc.inventory);
    const result=await run(document,'world_combat',{target:'阿砚',intent:'shove'},'interrupt');
    assert.equal(result.document.state.npcAutonomy.tasks.work.status,'中断');
    assert.equal(result.document.state.npcAutonomy.actions?.work,undefined);
    assert.deepEqual(result.document.state.npcs.npc_hw_ayan.inventory,before);
});
