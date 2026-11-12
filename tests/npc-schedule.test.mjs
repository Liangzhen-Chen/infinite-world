import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from 'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {scheduleAt,nextNpcService,validateNpcSchedules}from'../server-plugin/npc-schedule.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {personHousehold}from'../server-plugin/entity-view.mjs';
import {householdCash}from'../server-plugin/household-budget.mjs';
import {planWorldUpgrade}from'../server-plugin/world-upgrade.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const teacher='npc_hw_luqing',merchant='npc_hw_linsui';
const slot=(start,end,location,activity,services=[])=>({start,end,location,activity,services});
async function setup(){
    const world=await loadWorld();
    // This fixture replaces the teacher's whole routine with a fixed service
    // timetable. Source errands have their own real schedule tests in K16;
    // the untouched formal-world month comparison below keeps them enabled.
    delete world.rules.householdSubsistence;
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(legacy,'npc-schedule-test');
    document.state.minute=540;
    const home=document.state.location,school='bld_hw_school';
    assert.ok(engine.byId.has(school));
    world.npcs.find(row=>row.id===teacher).schedule={default:[slot(0,480,home,'睡眠'),slot(480,1020,school,'授课',['teach','trade']),slot(1020,1440,home,'休息')],restDays:[10],rest:[slot(0,1440,home,'休息')],market:[slot(0,1440,home,'赶集',['trade'])],seasonal:{'3':{default:[slot(0,1440,home,'冬日整理书稿')]}}};
    document.state.npcs[teacher].location=school;
    const run=async(doc,tool,args,eventId='schedule')=>{
        const out=await engine.reduce(doc,{tool,args,eventId});return {document:applyPatches(doc,out.patches),result:out.result};
    };
    return {world,engine,document,home,school,run};
}

test('作息使用集市、休息日和冬季覆盖；结构拒绝空档与未知地点',async()=>{
    const {world,engine}=await setup();
    assert.equal(scheduleAt(engine,teacher,540).activity,'授课');
    assert.equal(scheduleAt(engine,teacher,4*1440+540).activity,'赶集');
    assert.equal(scheduleAt(engine,teacher,9*1440+540).activity,'休息');
    assert.equal(scheduleAt(engine,teacher,270*1440+540).activity,'冬日整理书稿');
    assert.deepEqual(nextNpcService(engine,teacher,1380,'teach'),{minute:1920,location:'bld_hw_school'});
    assert.deepEqual(validateNpcSchedules(world),[]);
    assert.equal(validateWorld(world).ok,true);
    world.npcs.find(row=>row.id===teacher).schedule.default[1].start=481;
    world.npcs.find(row=>row.id===teacher).schedule.default[1].location='loc_missing';
    const errors=validateNpcSchedules(world);assert.ok(errors.some(row=>row.includes('连续')));assert.ok(errors.some(row=>row.includes('不存在')));
});

test('夜间与临近收课拒绝学习，失败不扣钱、不推进时间',async()=>{
    const {document,home,school,run}=await setup();
    document.state.location=school;delete document.state.skills.skill_literacy;
    document.state.minute=1000;
    const before=structuredClone(document);
    await assert.rejects(run(document,'world_learn',{entity:'skill_literacy',source:teacher}),/剩余服务时间不足/);
    assert.deepEqual(document,before);
    document.state.minute=1380;document.state.location=home;document.state.npcs[teacher].location=home;
    await assert.rejects(run(document,'world_learn',{entity:'skill_literacy',source:teacher}),/不提供授课/);
    assert.equal(document.state.minute,1380);
});

test('开放时段完成课程并守恒转账，场景给出实际服务边界',async()=>{
    const {engine,document,school,run}=await setup();
    document.state.location=school;delete document.state.skills.skill_literacy;
    const result=await run(document,'world_learn',{entity:'skill_literacy',source:teacher});
    assert.equal(result.document.state.minute,600);
    assert.equal(result.document.state.player.coins+result.document.state.npcs[teacher].coins,document.state.player.coins+document.state.npcs[teacher].coins);
    assert.match(engine.scene(document,'陆青'),/当前交易\/授课：授课、交易/);
    assert.match(engine.scene(document,'陆青'),/17:00/);
});

test('下课按实际路线离开；途中不能服务，抵达产生可见通知',async()=>{
    const {engine,document,school,home,run}=await setup();
    document.state.minute=1019;document.state.location=school;
    const departure=await run(document,'world_time',{minutes:1});
    const npc=departure.document.state.npcs[teacher],route=engine.route(school,home,'walk',1020,document.randomSeed);
    assert.equal(npc.location,null);assert.equal(npc.scheduleTravel.arrive,1020+route.minutes);
    assert.ok(departure.result.notices.some(row=>row.text==='陆青离开了这里'));
    await assert.rejects(run(departure.document,'world_trade',{seller:teacher,item:'item_bread',quantity:1}),/不在场/);
    departure.document.state.location=home;
    const arrived=await run(departure.document,'world_time',{minutes:route.minutes},'arrival');
    assert.equal(arrived.document.state.npcs[teacher].location,home);
    assert.equal(arrived.document.state.npcs[teacher].scheduleTravel,undefined);
    assert.ok(arrived.result.notices.some(row=>row.text==='陆青来到这里'));
});

test('分段等待和单次等待产生相同NPC状态，回放稳定',async()=>{
    const {engine,document,run}=await setup();document.state.minute=1019;
    const long=await run(document,'world_time',{minutes:180},'long');
    let current=document;for(const [i,minutes]of [1,1,5,20,153].entries())current=(await run(current,'world_time',{minutes},`part_${i}`)).document;
    assert.deepEqual(current.state.npcs,long.document.state.npcs);
    const replay=await engine.reduce(document,{tool:'world_time',args:{minutes:180},eventId:'long'},{replay:true});
    assert.deepEqual(applyPatches(document,replay.patches),long.document);
});

test('路费在出发时只收一次；封路和缺钱不会瞬移',async()=>{
    const {world,engine,document,home,school,run}=await setup();
    world.routes=[{id:'route_schedule',from:school,to:home,modes:['walk'],closedSeasons:[],lengthKm:1,toll:3}];
    // 本例把路网换成一条合成路线；U3灾害时钟只引用正式路线，合成路网下不加载。
    delete world.rules.hazardClock;
    document.state.minute=1019;
    const coins=document.state.npcs[teacher].coins;
    const first=await run(document,'world_time',{minutes:1});
    assert.equal(first.document.state.npcs[teacher].coins,coins-3);
    const route=engine.route(school,home,'walk',1020,document.randomSeed);
    const arrived=await run(first.document,'world_time',{minutes:route.minutes});
    // EC-1b：顾客可用窗从到达起算（business.mjs arrivalStart），老师 1020 出发、到家那一刻起就是顾客，窗内店营业时会在当天唯一的一次客流里买东西。
    // 所以到家时钱袋 = 起始 − 路费 3（只收一次）− 这趟客流里他自己的成交（货款 paid 与客流路费 travel.paid，均读自客流记录，且都在出发之后）。
    const bought=Object.values(arrived.document.state.records).filter(r=>r.category==='customer_flow'&&r.minute>1019).flatMap(r=>r.visits??[]).filter(v=>v.npc===teacher&&v.outcome==='bought');
    const spent=bought.reduce((n,v)=>n+v.paid+(v.travel?.paid??0),0);
    assert.equal(arrived.document.state.npcs[teacher].coins,coins-3-spent,`toll once (3) plus own flow purchases ${JSON.stringify(bought.map(v=>[v.item,v.paid]))}`);
    // EC-1a 共用钱袋：路费不足按户池判（本人钱袋不够，同户成员钱袋够就由户池补足出发）。所以“缺钱”要整户都付不起：把同户其他成员的钱袋清零，再用前置断言确认户池合计低于路费。
    for(const id of personHousehold(engine,document.state,teacher).value?.members??[])if(id!==teacher&&document.state.npcs[id])document.state.npcs[id].coins=0;
    document.state.npcs[teacher].coins=2;
    assert.ok(householdCash(engine.primitiveDraft(document),engine,teacher)<world.routes[0].toll,'前置：户池合计也付不起路费，才是真正缺钱');
    const poor=await run(document,'world_time',{minutes:20});assert.equal(poor.document.state.npcs[teacher].location,school);
    assert.match(poor.document.state.npcs[teacher].activity,/路费不足/);
    world.routes[0].closedSeasons=[0];
    const closed=await run(document,'world_time',{minutes:20});assert.equal(closed.document.state.npcs[teacher].location,school);
    assert.equal(closed.document.state.npcs[teacher].activity,'行程受阻');
});

test('带路优先作息，到达后结束同行，下一次行动再自行返程',async()=>{
    const {document,home,school,run}=await setup();document.state.location=school;document.state.minute=1019;
    const promised=await run(document,'world_promise',{promisor:teacher,type:'带路',destination:home,content:'送到门口'},'guide');
    const moved=await run(promised.document,'world_move',{destination:home},'walk');
    assert.equal(moved.document.state.obligations.obl_guide.status,'已完成');
    assert.equal(moved.document.state.npcs[teacher].location,home);
    assert.deepEqual(moved.document.state.player.companions,[]);
    assert.equal(moved.document.state.npcs[teacher].scheduleTravel,undefined);
    const morning=await run(moved.document,'world_time',{until:{dayOffset:1,hour:8}},'morning');
    assert.equal(morning.document.state.npcs[teacher].location,null);
    assert.equal(morning.document.state.npcs[teacher].scheduleTravel.to,school);
});

test('服务窗口同样约束交易，旧世界无作息时保留已有行为',async()=>{
    const {world,document,home,run}=await setup();
    world.npcs.find(row=>row.id===merchant).schedule={default:[slot(0,600,home,'营业',['trade']),slot(600,1440,home,'休息')]};
    document.state.minute=598;
    document.state.npcs[merchant].activity='营业';
    const closed=await run(document,'world_time',{minutes:2});
    assert.ok(closed.result.notices.some(row=>row.text==='林穗此刻：休息'));
    await assert.rejects(run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1}),/剩余服务时间不足/);
    document.state.minute=601;
    await assert.rejects(run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1}),/不提供交易/);
    delete world.npcs.find(row=>row.id===merchant).schedule;
    const result=await run(document,'world_trade',{seller:merchant,item:'item_bread',quantity:1});
    assert.equal(result.document.state.minute,606);
});

test('患病人员停工，远处人物移动不暴露给玩家',async()=>{
    const {engine,document,run,school}=await setup();document.state.minute=1019;
    document.state.location='loc_bs';
    const result=await run(document,'world_time',{minutes:1});assert.ok(!result.result.notices.some(row=>row.type==='presence'));
    document.state.npcs[teacher].status='患病';document.state.location=school;
    const sick=await run(document,'world_time',{minutes:30});assert.equal(sick.document.state.npcs[teacher].location,school);
    assert.match(engine.scene(sick.document,'陆青'),/此刻：患病/);assert.match(engine.scene(sick.document,'陆青'),/当前交易\/授课：暂停/);
});

test('在途存档重启、导出和撤销均保持位置与提示一致',async t=>{
    const {engine,document,school}=await setup();document.state.minute=1019;document.state.location=school;
    const root=await fs.mkdtemp(path.join(tmpRoot(),'dnd-npc-schedule-'));
    t.after(async()=>{assert.ok(path.resolve(root).startsWith(path.resolve(tmpRoot())+path.sep+'dnd-npc-schedule-'));await fs.rm(root,{recursive:true,force:true});});
    const reducer=(doc,input,options)=>engine.reduce(doc,input,options),store=new CampaignStorage(root,{reducer});
    await store.create({id:'schedule',worldVersion:document.worldVersion,document});
    await store.transact('schedule',{id:'depart',anchor:'first',input:{tool:'world_time',args:{minutes:1},eventId:'depart'}},reducer);
    const departed=await store.read('schedule');assert.equal(departed.document.state.npcs[teacher].location,null);
    const restart=new CampaignStorage(root,{reducer});assert.deepEqual((await restart.read('schedule')).document,departed.document);
    const copied=await restart.import(await restart.export('schedule'),'copy');assert.deepEqual(copied.document,departed.document);
    const feedback=await restart.feedback('schedule');assert.ok(feedback.events[0].notices.some(row=>row.text==='陆青离开了这里'));
    await restart.reconcile('schedule',[],null);
    assert.deepEqual((await restart.read('schedule')).document,document);
    assert.deepEqual((await restart.feedback('schedule')).events,[]);
});

test('正式人物整月与逐日等待一致，中间作息不膨胀存档补丁',async()=>{
    const engine=new WorldEngine(await loadWorld()),document=engine.createCharacter(legacy,{},'schedule-month');
    const long=await engine.reduce(document,{tool:'world_time',args:{minutes:43200},eventId:'month'});
    let daily=document;
    for(let day=0;day<30;day++){
        const out=await engine.reduce(daily,{tool:'world_time',args:{minutes:1440},eventId:`day_${day}`});daily=applyPatches(daily,out.patches);
    }
    assert.deepEqual(applyPatches(document,long.patches).state.npcs,daily.state.npcs);
    const npcPatches=long.patches.filter(row=>row.path[1]==='npcs');
    assert.equal(npcPatches.length,new Set(npcPatches.map(row=>row.path[2])).size,'整月每人只写一次最终状态，不随经过天数重复');
    assert.ok(npcPatches.every(row=>row.op==='set'&&row.path.length===3),'人物补丁是最终完整状态');
    // Family life (T164) may bring roster relatives and newborns into state during the month.
    assert.ok(npcPatches.length<=Object.keys(applyPatches(document,long.patches).state.npcs).length,'补丁不超过实际人物数');
    assert.equal(engine.world.npcs.filter(row=>row.schedule).length,engine.world.npcs.length);
});

test('旧世界启用作息只更新目录，不改旧档位置财物；旧事件仍按旧目录回放',async()=>{
    const world=await loadWorld(),oldWorld=structuredClone(world);
    for(const npc of oldWorld.npcs)delete npc.schedule;
    const archived=new WorldEngine(oldWorld),old=archived.initialFromLegacy(legacy,'schedule-upgrade');
    old.state.minute=1380;old.state.location='bld_hw_school';old.state.npcs[teacher].location='bld_hw_school';
    const plan=planWorldUpgrade(old,oldWorld,world,{worldHash:'schedule-edition',eventId:'schedules'}),upgraded=applyPatches(old,plan.patches);
    assert.deepEqual(Object.fromEntries(Object.keys(old.state.npcs).map(id=>[id,upgraded.state.npcs[id]])),old.state.npcs);
    assert.deepEqual(Object.keys(upgraded.state.npcs).sort(),world.npcs.map(n=>n.id).sort());
    assert.ok(world.residents.every(n=>!upgraded.state.npcs[n.id]));assert.deepEqual(upgraded.state.player,old.state.player);assert.deepEqual(upgraded.state.inventory,old.state.inventory);
    const beforeRejected=structuredClone(upgraded);
    const input={tool:'world_learn',args:{entity:'skill_literacy',source:teacher},eventId:'historical_lesson'};
    assert.equal((await archived.reduce(old,input,{replay:true})).result.minutes,60);
    await assert.rejects(new WorldEngine(world).reduce(upgraded,input),/不提供授课/);
    assert.deepEqual(upgraded,beforeRejected);
});
