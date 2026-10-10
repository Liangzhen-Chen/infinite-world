import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {npcContext}from'../server-plugin/npc-memory.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const merchant='npc_hw_linsui',witness='npc_hw_hezhou',teacher='npc_hw_luqing';
const slot=(start,end,location,activity='营业')=>({start,end,location,activity,services:['trade','teach']});
async function setup(){
    const world=await loadWorld();
    // The reviewed profile is required even while publication is being prepared.
    const candidate=JSON.parse(await fs.readFile('world/drafts/m2-people/candidate.json','utf8'));
    world.npcs=world.npcs.map(n=>({...candidate.npcs.find(x=>x.id===n.id),...n,tier:'full'}));
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'npc-memory');
    document.state.minute=540;
    // Isolate observation from ordinary commuting; the schedule test file uses
    // formal routines. This fixture deliberately gives four actors local shifts.
    for(const id of [merchant,witness,teacher]){
        world.npcs.find(row=>row.id===id).schedule={default:[slot(0,1440,document.state.location)]};
        document.state.npcs[id].location=document.state.location;
        document.state.npcs[id].activity='营业';
    }
    const run=async(doc,tool,args,eventId)=>{const out=await engine.reduce(doc,{tool,args,eventId});return{document:applyPatches(doc,out.patches),result:out.result,patches:out.patches};};
    return{world,engine,document,run};
}
const stream=(document,id)=>document.state.npcs[id].memoryStream??[];

test('真实交易只进入参与者和连续在场者记忆；睡眠、场外与中途离开者不知道',async()=>{
    const {world,document,run}=await setup(),home=document.state.location;
    document.state.npcs[teacher].location='bld_hw_school';
    const sleeper='npc_hw_chenbai',traveller='npc_hw_gucen';
    for(const id of [sleeper,traveller])document.state.npcs[id].location=home;
    document.state.npcs[sleeper].activity='睡眠';
    world.npcs.find(n=>n.id===sleeper).schedule={default:[slot(0,1440,home,'睡眠')]};
    world.npcs.find(n=>n.id===traveller).schedule={default:[slot(0,541,home),slot(541,542,'loc_hw'),slot(542,1440,home)]};
    const before=structuredClone(document);
    const bought=await run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1},'bread');
    assert.deepEqual(document,before);
    assert.equal(stream(bought.document,merchant)[0].sourceType,'亲历');
    assert.equal(stream(bought.document,witness)[0].sourceType,'目击');
    for(const id of [teacher,sleeper,traveller])assert.deepEqual(stream(bought.document,id),[]);
    const memory=stream(bought.document,merchant)[0];
    assert.equal(memory.sourceEvent,'bread');assert.equal(memory.minute,545);assert.equal(memory.location,home);
    assert.match(memory.content,/面包1份/);assert.match(memory.content,new RegExp(`${bought.result.cost}铜`));
    assert.ok(memory.salience>=1&&memory.salience<=5);
    assert.deepEqual(memory.participants,['player',merchant]);
    const replay=await run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1},'bread');
    assert.deepEqual(replay.document,bought.document);
});

test('有费用的学习失败仍被导师记住；无效请求和模型随口记忆不产生人物亲历',async()=>{
    const {engine,document,run}=await setup();delete document.state.skills.skill_literacy;
    let failed;
    for(let i=0;i<100;i++){
        const out=await run(document,'world_learn',{entity:'skill_literacy',source:teacher},`lesson_${i}`);
        if(!out.result.success){failed=out;break;}
    }
    assert.ok(failed,'固定种子集合必须出现一次实际学习失败');
    assert.match(stream(failed.document,teacher)[0].content,/60分钟、2铜，尚未学会/);
    assert.match(engine.scene(failed.document,'陆青'),/尚未学会/);
    const before=structuredClone(failed.document);
    await assert.rejects(run(failed.document,'world_trade',{seller:merchant,item:'item_bread',quantity:10000},'bad'),/库存不足/);
    assert.deepEqual(failed.document,before);
    const forged=structuredClone(document);
    forged.memories.fake={subject:teacher,minute:540,content:'旅人曾替陆青夺回失传王冠',pinned:false};
    assert.deepEqual(npcContext(engine,forged,teacher,'王冠').memories,[]);
    assert.doesNotMatch(engine.scene(forged,'陆青'),/失传王冠/);
});

test('欠款到期由当事人核对，远处位置不被伪造成目击地点，旁人不知道违约',async()=>{
    const {document,run}=await setup();
    let c=(await run(document,'world_trade',{seller:merchant,service:'住宿',payment:'credit',creditMinutes:60},'credit')).document;
    c.state.location='loc_bs';
    c=(await run(c,'world_time',{minutes:50},'due')).document;
    const overdue=stream(c,merchant).find(row=>row.kind==='debt');
    assert.match(overdue.content,/欠款6铜现为逾期/);assert.equal(overdue.sourceType,'约定核对');
    assert.equal(overdue.location,null);assert.equal(overdue.minute,600);
    assert.ok(!stream(c,witness).some(row=>row.kind==='debt'));
    const again=(await run(c,'world_time',{minutes:10},'later')).document;
    assert.deepEqual(stream(again,merchant),stream(c,merchant));
    again.state.location=again.state.npcs[merchant].location;
    const paid=(await run(again,'world_trade',{seller:merchant,payment:'repay',debt:'debt_credit'},'repay')).document;
    const repayment=stream(paid,merchant).filter(row=>row.kind==='debt').at(-1);
    assert.match(repayment.content,/已还清/);assert.equal(repayment.minute,610);
});

test('未被察觉的偷窃不会给受害者或其他房间的人补全知识',async()=>{
    const {world,document,run}=await setup();
    for(const [id,npc]of Object.entries(document.state.npcs))if(id!==merchant)npc.location='loc_bs';
    for(const npc of world.npcs)delete npc.schedule;
    let unseen;
    for(let i=0;i<300;i++){
        const out=await run(document,'world_crime',{operation:'steal',target:merchant,item:'item_bread'},`unseen_${i}`);
        if(out.result.success&&!out.result.witnesses.length){unseen=out;break;}
    }
    assert.ok(unseen,'固定种子集合必须出现一次未被看见的实际偷窃');
    assert.deepEqual(stream(unseen.document,merchant),[]);
    assert.ok(Object.values(unseen.document.state.npcs).every(npc=>!npc.memoryStream));
    assert.equal(unseen.document.state.inventory.item_bread.quantity,1);
});

test('任务领取和当面交付由发布者记住，不传播给同屋无关人物',async()=>{
    const {document,run}=await setup();
    let c=(await run(document,'world_quest',{operation:'publish',publisher:merchant,grade:'D',personal:true,reward:20,content:'补充干粮',objective:{type:'deliver',item:'item_ration',quantity:1}},'job')).document;
    assert.deepEqual(stream(c,merchant),[],'公开任务不等于玩家已经参与');
    c=(await run(c,'world_quest',{operation:'accept',quest:'quest_job'},'accept')).document;
    c=(await run(c,'world_quest',{operation:'complete',quest:'quest_job'},'deliver')).document;
    assert.deepEqual(stream(c,merchant).map(row=>row.kind),['quest','quest']);
    assert.match(stream(c,merchant)[1].content,/已完成/);
    assert.deepEqual(stream(c,witness),[]);
});

test('人物私有流不经全局读取泄漏；场景区分本人往事、台词范例和玩家经历',async()=>{
    const {engine,document,run}=await setup();
    const c=(await run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1},'bread')).document;
    const secret='私密暗号紫色布扣',base=engine.byId.get(merchant);
    base.secrets.push({content:secret,knownBy:[merchant]});
    c.state.npcs[teacher].memoryStream=[{id:'remote',participants:['player',teacher],content:secret,salience:5,minute:540}];
    c.state.npcs[teacher].location='bld_hw_school';
    const view=readStateSection(c.state,'人物');
    assert.equal(view[merchant].memoryStream,undefined);assert.doesNotMatch(JSON.stringify(view),new RegExp(secret));
    const card=engine.scene(c,'林穗');
    assert.match(card,/涉及你的经历：.*面包1份/);assert.match(card,/台词范例，非既往经历/);
    assert.match(card,/本人旧事，不代表玩家参与/);assert.doesNotMatch(card,new RegExp(secret));
    assert.ok(card.length<=6000);
    const before=structuredClone(c);engine.scene(c,'林穗');readStateSection(c.state,'人物');assert.deepEqual(c,before);
});

test('重提具体物品能找回较早交易，不只按最近时间或高显著度截取',async()=>{
    const {engine,document,run}=await setup();
    let c=(await run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1},'old_bread')).document;
    for(let i=0;i<4;i++)c=(await run(c,'world_trade',{seller:merchant,service:'住宿'},`room_${i}`)).document;
    for(const query of ['上次买的面包','上次我在你这里买的吃食是什么','之前买过什么物品']){
        const memories=npcContext(engine,c,merchant,query).memories;
        assert.ok(memories.some(row=>row.sourceEvent==='old_bread'),query);assert.ok(memories.length<=3);
    }
});

test('存储幂等、重启、导出和撤销保持记忆与真实账本同步',async t=>{
    const {engine,document}=await setup();
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'dnd-npc-memory-'));
    t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir())+path.sep+'dnd-npc-memory-'));await fs.rm(root,{recursive:true,force:true});});
    const reducer=(doc,input,options)=>engine.reduce(doc,input,options),store=new CampaignStorage(root,{reducer});
    await store.create({id:'memory',worldVersion:document.worldVersion,document});
    const event={id:'bread',anchor:'bread',input:{tool:'world_trade',args:{seller:merchant,item:'item_bread',quantity:1},eventId:'bread'}};
    await store.transact('memory',event,reducer);await store.transact('memory',event,reducer);
    const bought=(await store.read('memory')).document;assert.equal(stream(bought,merchant).length,1);
    const restarted=new CampaignStorage(root,{reducer});assert.deepEqual((await restarted.read('memory')).document,bought);
    assert.deepEqual((await restarted.import(await restarted.export('memory'),'copy')).document,bought);
    await restarted.reconcile('memory',[],null);
    const undone=(await restarted.read('memory')).document;assert.deepEqual(undone,document);
    assert.doesNotMatch(engine.scene(undone,'林穗'),/办理面包1份/);
});

test('旧世界回放不补记忆；目录升级保留财物关系，只记录升级后真实经历',async()=>{
    const {world,document}=await setup(),oldWorld=structuredClone(world);
    for(const npc of oldWorld.npcs)delete npc.tier;
    const archived=new WorldEngine(oldWorld),input={tool:'world_trade',args:{seller:merchant,item:'item_bread',quantity:1},eventId:'old_trade'};
    const old=applyPatches(document,(await archived.reduce(document,input,{replay:true})).patches);
    assert.ok(Object.values(old.state.npcs).every(npc=>!npc.memoryStream));
    const plan=planWorldUpgrade(old,oldWorld,world,{worldHash:'full-profile',eventId:'upgrade'}),upgraded=applyPatches(old,plan.patches);
    assert.deepEqual(Object.fromEntries(Object.keys(old.state.npcs).map(id=>[id,upgraded.state.npcs[id]])),old.state.npcs);
    assert.deepEqual(Object.keys(upgraded.state.npcs).sort(),world.npcs.map(n=>n.id).sort());
    assert.ok(world.residents.every(n=>!upgraded.state.npcs[n.id]));assert.deepEqual(upgraded.state.player,old.state.player);
    const out=await new WorldEngine(world).reduce(upgraded,{...input,eventId:'new_trade'}),fresh=applyPatches(upgraded,out.patches);
    assert.deepEqual(stream(fresh,merchant).map(row=>row.sourceEvent),['new_trade']);
});
