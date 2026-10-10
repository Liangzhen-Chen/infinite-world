import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),mentor=world.npcs.find(row=>row.id==='npc_hw_xuling');mentor.promotionRanks={profession_mage:6};
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'profession-test');
    document.state.location='bld_hw_riverhome';document.state.npcs.npc_hw_xuling.location=document.state.location;document.state.player.level=10;document.state.player.coins=1000;
    document.state.skills.skill_light.proficiency=100;
    const run=async(c,args,id)=>{const out=await engine.reduce(c,{tool:'world_profession',args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,mentor,engine,document,run};
}
async function success(run,c,args){for(let i=0;i<100;i++){const row=await run(c,args,`profession_${i}`);if(row.result.certified||row.result.promoted)return row;}throw new Error('职业夹具未出现成功');}
test('职业目录：十二战斗各十五技能、六次双方向升职，生活上下游与隐藏条件齐备',async()=>{
    const w=await loadWorld();assert.equal(w.professions.filter(row=>row.kind==='combat').length,12);
    for(const p of w.professions.filter(row=>row.kind==='combat')){
        assert.equal(p.skillTree.length,15);assert.deepEqual(p.promotions.map(row=>row.level),[30,60,90,120,150,180]);
        assert.ok(p.promotions.every(row=>row.choices.length===2));assert.ok(p.skillTree.every(id=>w.skills.some(skill=>skill.id===id)));
    }
    assert.ok(w.professions.filter(row=>row.kind==='life').length>=22);assert.ok(w.professions.filter(row=>row.kind==='life').every(row=>row.upstream.length&&row.downstream.length));
    assert.equal(w.professions.filter(row=>row.kind==='hidden').length,30);assert.ok(w.professions.filter(row=>row.kind==='hidden').every(row=>row.trigger.minimum>0&&row.capacity>0&&row.cost&&row.initiation));
    assert.deepEqual(w.professions.find(row=>row.name==='音乐家').styles,['器乐','合奏','吟游叙唱']);
});
test('认证：技能、费用、导师和名额检查；实际入职，重复申请不再次扣款',async()=>{
    const{document,run}=await setup(),args={profession:'法师',teacher:'许苓'};
    document.state.skills.skill_light.proficiency=99;const before=structuredClone(document);
    await assert.rejects(run(document,args,'unskilled'),/基础技能/);assert.deepEqual(document,before);
    document.state.skills.skill_light.proficiency=100;
    const joined=await success(run,document,args);
    assert.equal(joined.document.state.professions.combat,'profession_mage');assert.equal(joined.document.state.player.coins,970);
    assert.equal(joined.document.state.npcs.npc_hw_xuling.coins,document.state.npcs.npc_hw_xuling.coins+30);assert.equal(joined.document.state.minute,660);
    assert.ok(joined.document.state.careers.profession_mage.certification.source);
    await assert.rejects(run(joined.document,args,'duplicate'),/已经认证/);
    document.state.player.coins=29;await assert.rejects(run(document,args,'poor'),/费用不足/);
});
test('退职：保留熟练度但限制实际修正与增长，费用入账，等待后恢复认证',async()=>{
    const{document,engine,run}=await setup();document.state.professions.combat='profession_mage';document.state.skills.skill_light.proficiency=750;
    const abandoned=await run(document,{profession:'法师',operation:'abandon'},'leave');
    assert.equal(abandoned.document.state.professions.combat,'');assert.equal(abandoned.document.state.player.coins,940);
    assert.equal(abandoned.document.state.skills.skill_light.proficiency,750);assert.equal(abandoned.document.state.careerFunds.abandon_leave.amount,60);
    const practiced=await engine.reduce(abandoned.document,{tool:'world_practice',args:{skill:'照明术',gain:10,target:'木杖'},eventId:'practice'});
    assert.equal(practiced.result.gain,0);assert.equal(practiced.result.effectiveProficiency,299);assert.equal(practiced.result.proficiency,750);
    const check=await engine.reduce(abandoned.document,{tool:'world_check',args:{attribute:'精神',skill:'照明术',difficulty:15},eventId:'capped'});
    assert.equal(check.result.modifier,1);
    await assert.rejects(run(abandoned.document,{profession:'法师',teacher:'许苓'},'tooSoon'),/等待期/);
    const elapsed=await engine.reduce(abandoned.document,{tool:'world_time',args:{minutes:4320},eventId:'wait'}),later=applyPatches(abandoned.document,elapsed.patches);
    const restored=await success(run,later,{profession:'法师',teacher:'许苓'});
    assert.equal(restored.document.state.skills.skill_light.proficiency,750);
    const restoredCheck=await engine.reduce(restored.document,{tool:'world_check',args:{attribute:'精神',skill:'照明术',difficulty:15},eventId:'full'});assert.equal(restoredCheck.result.modifier,5);
});
test('升职：不跳阶，达到等级并有考官资格、真实技能和费用才获得方向',async()=>{
    const{world,document,run}=await setup();document.state.professions.combat='profession_mage';document.state.skills.skill_light.proficiency=600;
    const role=world.professions.find(row=>row.id==='profession_mage'),first=role.promotions[0].choices[0],second=role.promotions[1].choices[0];
    await assert.rejects(run(document,{profession:'法师',teacher:'许苓',operation:'promote',choice:first.id},'early'),/30级/);
    document.state.player.level=60;
    await assert.rejects(run(document,{profession:'法师',teacher:'许苓',operation:'promote',choice:second.id},'skip'),/当前机会/);
    const promoted=await success(run,document,{profession:'法师',teacher:'许苓',operation:'promote',choice:first.id});
    assert.equal(promoted.document.state.careers.profession_mage.promotions.length,1);assert.equal(promoted.document.state.careers.profession_mage.promotions[0].name,first.name);
    assert.equal(promoted.document.state.player.coins,900);assert.equal(promoted.document.state.minute,720);
    await assert.rejects(run(promoted.document,{profession:'法师',teacher:'许苓',operation:'promote',choice:second.id},'missing'),/所需技能/);
});
test('已登记职业导师只自动教授初级核心技能，不借职业资格无限教授高阶',async()=>{
    const{world,document,engine}=await setup(),tree=world.professions.find(row=>row.id==='profession_mage').skillTree;
    const learned=await engine.reduce(document,{tool:'world_learn',args:{entity:tree[1],kind:'skill',source:'许苓'},eventId:'basic'});
    assert.equal(learned.result.source.id,'npc_hw_xuling');assert.equal(learned.result.cost,12);
    document.state.professions.combat='profession_mage';document.state.skills.skill_light.proficiency=600;
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:tree[4],kind:'skill',source:'许苓'},eventId:'advanced'}),/资格/);
});

test('退职保留的高级手艺不能绕过配方与研究阶段上限',async()=>{
    const{world,document}=await setup(),skill='skill_life_5_core';
    world.recipes.push({id:'recipe_test_retired',name:'退职校验样件',skill,minimumProficiency:600,materials:[],minutes:10,difficulty:10,output:{item:'item_staff',quantity:1},tools:[]});
    const engine=new WorldEngine(world);document.state.skills[skill]={proficiency:750,breakthroughs:[],daily:{}};
    const before=structuredClone(document);
    await assert.rejects(engine.reduce(document,{tool:'world_craft',args:{recipe:'recipe_test_retired'},eventId:'retired-craft'}),/技能不足/);
    assert.deepEqual(document,before);
    document.state.projects.research_fixture={id:'research_fixture',type:'研究',skills:[skill],stage:'原型',progress:3,investment:0,days:[1,2,3]};
    const experiment=await engine.reduce(document,{tool:'world_research',args:{project:'research_fixture'},eventId:'retired-research'});
    assert.equal(experiment.result.stage,'原型');
    document.state.professions.life=['profession_life_5'];
    assert.ok((await engine.reduce(document,{tool:'world_craft',args:{recipe:'recipe_test_retired'},eventId:'active-craft'})).result.ok);
});
