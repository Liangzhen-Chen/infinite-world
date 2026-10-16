import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine,xpRequired}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {toolResultWithClock,parseTurn}from'../extension/turn.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'growth-test');
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
async function completeQuest(run,document,id='one',item='item_ration'){
    let row=await run(document,'world_quest',{operation:'publish',publisher:'林穗',grade:'D',personal:true,reward:20,content:'帮忙补货',objective:{type:'deliver',item,quantity:1}},`publish_${id}`);
    const quest=row.result.quest;
    row=await run(row.document,'world_quest',{operation:'accept',quest},`accept_${id}`);
    return run(row.document,'world_quest',{operation:'complete',quest},`complete_${id}`);
}
test('任务经验有实际交付，跨级、属性点和上限由引擎计算，不自动回血',async()=>{
    const{document,run}=await setup();document.state.player.xp=100;document.state.player.hp=3;
    const completed=await completeQuest(run,document);
    assert.equal(completed.result.experience,150);assert.equal(completed.document.state.player.level,2);
    assert.equal(completed.document.state.player.xp,50);assert.equal(completed.document.state.player.freeAttributePoints,2);
    assert.equal(completed.document.state.player.maxHp,16);assert.equal(completed.document.state.player.hp,3);
    assert.equal(completed.document.state.inventory.item_ration.quantity,document.state.inventory.item_ration.quantity-1);
    await assert.rejects(run(completed.document,'world_quest',{operation:'complete',quest:completed.result.quest},'duplicate'),/可结算/);
    await assert.rejects(run(document,'world_experience',{amount:100000},'fake-xp'),/未知工具/);
});
test('重复任务按真实发布者和目标递减，别名和不同编号不绕过24小时限制',async()=>{
    const{document,run}=await setup();document.state.inventory.item_ration.quantity=5;
    const first=await completeQuest(run,document,'one'),second=await completeQuest(run,first.document,'two','干粮');
    assert.equal(first.result.experience,150);assert.equal(second.result.experience,75);assert.equal(second.result.repeatIndex,1);
    const waited=await run(second.document,'world_time',{minutes:1440},'next-day');
    assert.equal((await completeQuest(run,waited.document,'three')).result.experience,150);
});
test('新角色属性总和60且单项8至16，未继承旧技能、关系或记忆，幸运不进公开状态',async()=>{
    const{engine}=await setup(),attributes={力量:16,敏捷:12,体质:8,智力:8,精神:8,魅力:8};
    const a=engine.createCharacter(seed,{name:'新旅人',attributes},'new-character'),b=engine.createCharacter(seed,{name:'新旅人',attributes},'new-character');
    assert.deepEqual(a,b);assert.equal(a.state.player.level,0);assert.equal(a.state.location,'loc_hw');
    assert.deepEqual(a.state.player.attributes,attributes);assert.deepEqual(a.state.skills,{});assert.deepEqual(a.state.spells,{});assert.deepEqual(a.memories,{});
    assert.ok(a.privateState.luck>=1&&a.privateState.luck<=100);assert.equal(a.state.player.luck,undefined);
    assert.equal(engine.scene(a).includes('hidden-luck'),false);
    assert.throws(()=>engine.createCharacter(seed,{attributes:{...attributes,力量:17}},'bad'),/范围/);
    assert.throws(()=>engine.createCharacter(seed,{attributes:{...attributes,力量:15}},'bad'),/总值/);
    assert.throws(()=>engine.createCharacter(seed,{birthplace:'王都'},'bad'),/尚未开放/);
    assert.throws(()=>engine.createCharacter(seed,{luck:100},'bad'),/系统字段/);
});
test('属性分配只使用已有点，派生上限改变而伤势不变，非法操作原子拒绝',async()=>{
    const{document,run}=await setup();document.state.player.freeAttributePoints=4;document.state.player.hp=2;document.state.player.mp=1;
    const before=structuredClone(document);
    for(const attributes of[{体质:5},{幸运:1},{体质:-1},{体质:1.2},{}])await assert.rejects(run(document,'world_attributes',{attributes},'bad-points'));
    assert.deepEqual(document,before);
    const grown=await run(document,'world_attributes',{attributes:{体质:2,精神:2}},'allocate');
    assert.equal(grown.document.state.player.attributes.体质,12);assert.equal(grown.document.state.player.freeAttributePoints,0);
    assert.equal(grown.document.state.player.maxHp,16);assert.equal(grown.document.state.player.maxMp,14);
    assert.equal(grown.document.state.player.hp,2);assert.equal(grown.document.state.player.mp,1);
    assert.equal(document.state.player.attributes.体质,10);
});
test('首次发现、制造和实际完工一次奖励；走回旧地点与重做旧配方不重复拿里程碑',async()=>{
    const{world,document}=await setup();world.recipes.push({id:'recipe_growth',name:'成长试件',skill:'skill_light',minimumProficiency:0,materials:[],minutes:1,difficulty:10,output:{item:'item_staff',quantity:1},tools:[]});
    const engine=new WorldEngine(world),run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const discovered=await run(document,'world_move',{destination:'河湾村'},'discover');assert.equal(discovered.result.experience,50);
    const away=await run(discovered.document,'world_move',{destination:'青灯酒馆'},'away');
    assert.equal((await run(away.document,'world_move',{destination:'河湾村'},'return')).result.experience,0);
    let crafted;for(let i=0;i<30;i++){crafted=await run(document,'world_craft',{recipe:'recipe_growth'},`craft_${i}`);if(crafted.result.success)break;}
    assert.equal(crafted.result.experience,30);
    let again;for(let i=0;i<30;i++){again=await run(crafted.document,'world_craft',{recipe:'recipe_growth'},`another_${i}`);if(again.result.success)break;}
    assert.equal(again.result.experience,0);
    document.state.records.public={category:'authorization',settlement:'loc_hw'};
    const project=await run(document,'world_settlement',{operation:'start_project',settlement:'河湾村',authorization:'public',name:'修补渡口',wood:1,days:1},'build');
    const unfinished=await run(project.document,'world_time',{minutes:1},'short-wait');assert.deepEqual(unfinished.document.state.experienceLedger,{});
    const finished=await run(unfinished.document,'world_time',{minutes:1440},'full-day');
    assert.equal(finished.document.state.experienceLedger[`publicContribution:${project.result.project}`].amount,100);
    const day2=await run(finished.document,'world_time',{minutes:1440},'day2');
    assert.equal(Object.keys(day2.document.state.experienceLedger).length,1);
});
test('死亡扣当前等级的前次门槛，200级封顶；累积门槛符合0至10共5500',async()=>{
    const{world,document}=await setup();assert.equal(Array.from({length:10},(_,i)=>xpRequired(i+1)).reduce((sum,n)=>sum+n,0),5500);
    document.state.player.level=200;document.state.player.xp=100;
    const engine=new WorldEngine(world),out=await engine.reduce(document,{tool:'world_move',args:{destination:'河湾村'},eventId:'cap'}),c=applyPatches(document,out.patches);
    assert.equal(out.result.experience,0);assert.equal(c.state.player.level,200);assert.equal(c.state.player.freeAttributePoints,0);assert.equal(c.state.player.xp,0);
    document.state.player.level=10;document.state.player.xp=2000;
    const death=await engine.reduce(document,{tool:'world_health',args:{delta:-100000},eventId:'death'});
    assert.equal(applyPatches(document,death.patches).state.player.xp,1000);
});
test('成长日志可重启、编辑回滚和导出导入，新增分区不改旧原件',async t=>{
    const{engine,document}=await setup(),directory=await fs.mkdtemp(path.join(tmpRoot(),'growth-replay-'));
    t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    document.state.player.xp=175;const before=structuredClone(document);
    const store=new CampaignStorage(directory,{reducer:(c,input)=>engine.reduce(c,input)});
    await store.create({id:'growth',worldVersion:engine.world.version,document});
    await store.transact('growth',{id:'discover',anchor:'travel',input:{tool:'world_move',args:{destination:'河湾村'},eventId:'discover'}},store.reducer);
    const awarded=await store.read('growth');assert.equal(awarded.document.state.player.level,2);
    await store.transact('growth',{id:'points',anchor:'allocate',input:{tool:'world_attributes',args:{attributes:{体质:2}},eventId:'points'}},store.reducer);
    const live=await store.read('growth'),fresh=new CampaignStorage(directory,{reducer:(c,input)=>engine.reduce(c,input)});
    assert.deepEqual((await fresh.read('growth')).document,live.document);
    assert.deepEqual((await fresh.import(await store.export('growth'),'copy')).document,live.document);
    await assert.rejects(store.reconcile('growth',['allocate']),/属性点不足/);
    const restored=await store.reconcile('growth',[]);assert.deepEqual(restored.document,before);assert.deepEqual(document,before);
});

test('怪物战果按模板与等级差结算，武器或法术击败都只发一次，杀居民不发经验',async()=>{
    const{world,document}=await setup();
    world.monsters.push({id:'monster_growth_beast',name:'试炼野兽',template:1,levelRange:[1,3]});
    world.skills.push({id:'skill_growth_damage',name:'试炼伤害',attribute:'精神',profession:null});
    world.spells.push({...world.spells[0],id:'spell_growth_damage',name:'试炼伤害',mp:1,skill:'skill_growth_damage',duration:0,effectSpec:{kind:'damage',power:20}});
    const engine=new WorldEngine(world),run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    document.state.creatures={monster_growth_beast:{level:1,hp:1,status:'正常',location:document.state.location}};
    let won;for(let i=0;i<50;i++){won=await run(document,'world_combat',{target:'monster_growth_beast'},`kill_${i}`);if(won.result.targetHp===0)break;}
    assert.equal(won.result.experience,10);
    await assert.rejects(run(won.document,'world_combat',{target:'monster_growth_beast'},'dead-again'),/已经死亡/);
    const respawn=structuredClone(won.document);respawn.state.creatures.monster_growth_beast={level:1,hp:1,status:'正常',location:document.state.location,incarnation:1};
    respawn.state.spells.spell_growth_damage={source:{type:'fixture'}};respawn.state.skills.skill_growth_damage={proficiency:10,breakthroughs:[],daily:{}};
    let spellKill;for(let i=0;i<50;i++){spellKill=await run(respawn,'world_cast',{spell:'spell_growth_damage',target:'monster_growth_beast'},`spell_kill_${i}`);if(spellKill.result.success)break;}
    assert.equal(spellKill.result.experience,5);
    document.state.player.level=20;
    let overlevel;for(let i=0;i<50;i++){overlevel=await run(document,'world_combat',{target:'monster_growth_beast'},`high_kill_${i}`);if(overlevel.result.targetHp===0)break;}
    assert.equal(overlevel.result.experience,0);
    document.state.npcs.npc_hw_linsui.hp=1;
    let citizen;for(let i=0;i<50;i++){citizen=await run(document,'world_combat',{target:'林穗'},`citizen_${i}`);if(citizen.result.targetHp===0)break;}
    assert.equal(citizen.result.experience,0);
});

test('累计经验跨多个等级且200封顶，剩余点可分配，超额经验不能再升级',async()=>{
    const{world,engine}=await setup();world.quests=world.quests??{};
    const requirements=Array.from({length:200},(_,i)=>xpRequired(i+1)),total=requirements.reduce((sum,n)=>sum+n,0);
    world.rules.quests.experienceRanges.D=[total+999,total+999];
    const current=new WorldEngine(world),document=current.createCharacter(seed,{},'maximum-test');
    document.state.location=document.state.npcs.npc_hw_linsui.location;
    const run=async(c,tool,args,id)=>{const out=await current.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const completed=await completeQuest(run,document,'maximum');
    assert.equal(completed.document.state.player.level,200);assert.equal(completed.document.state.player.xp,0);
    assert.equal(completed.document.state.player.freeAttributePoints,400);assert.equal(completed.result.levels,200);
    const again=await completeQuest(run,completed.document,'after-cap');assert.equal(again.result.experience,0);assert.equal(again.document.state.player.level,200);
});

test('工具时间提示来自实际账本，尾注不重复叠加教学与普通对话',async()=>{
    const{engine,document}=await setup();document.state.location='bld_hw_school';
    const out=await engine.reduce(document,{tool:'world_learn',args:{entity:'skill_literacy',kind:'skill',source:'陆青'},eventId:'clock_learning'});
    const learned=applyPatches(document,out.patches),result=toolResultWithClock(out.result,{startMinute:540,minute:learned.state.minute});
    assert.equal(result.turnClock.elapsedMinutes,60);assert.equal(result.turnClock.tailRule,undefined);
    const tail=parseTurn('<回合 额外="0分" 地点="bld_hw_school" 在场="npc_hw_luqing"/>',{startMinute:result.turnClock.startMinute,location:learned.state.location});
    const closed=await engine.reduce(learned,{tool:'world_turn',args:tail.args,eventId:'clock_finish'});
    assert.equal(closed.result.elapsed,0);assert.equal(closed.result.minute,600);
});
