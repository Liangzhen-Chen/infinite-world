import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld();
    if(!world.skills.some(row=>row.id==='skill_literacy'))world.skills.push({id:'skill_literacy',name:'识字',attribute:'智力',profession:null});
    world.skills.push({id:'skill_joinery',name:'木榫制作',attribute:'敏捷',profession:null,prerequisites:[]});
    world.recipes.push({id:'recipe_staff_pair',name:'双杖削制',skill:'skill_joinery',minimumProficiency:0,materials:[{item:'item_wood',amount:1}],minutes:20,difficulty:10,output:{item:'item_staff',quantity:2},tools:[],learningRequired:true});
    const makeBook=(id,name,teaches,grade='初级')=>({id,name,quality:'木',weight:0.2,durability:100,basePrice:30,
        book:{grade,author:'npc_hw_luqing',edition:'第一版',origin:'loc_hw',teaches,readingMinutes:120}});
    world.items.push(makeBook('item_test_spellbook','照明习术本',['spell_light']),
        makeBook('item_test_skillbook','榫工入门',['skill_joinery']),makeBook('item_test_recipebook','削杖工序',['recipe_staff_pair']));
    world.npcs.find(row=>row.id==='npc_hw_luqing').services.push('skill_joinery','recipe_staff_pair');
    const engine=new WorldEngine(world),document=engine.initialFromLegacy({state:seed.state,memories:seed.memories},'learning-test');
    document.state.skills.skill_literacy={proficiency:100,daily:{},breakthroughs:[]};
    document.state.location='bld_hw_school';
    document.state.npcs.npc_hw_luqing.location=document.state.location;
    document.state.npcs.npc_hw_linsui.location=document.state.location; // Present but unqualified teacher fixture.
    for(const id of ['item_test_spellbook','item_test_skillbook','item_test_recipebook'])document.state.inventory[id]={quantity:1,quality:'木',durability:100,weight:0.2};
    const run=async(c,tool,args,id='learn')=>{const output=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,output.patches),result:output.result};};
    return{world,engine,document,run};
}
// Choose an observed result without replacing the engine's dice function.
async function outcome(run,document,tool,args,success){
    for(let index=0;index<100;index++){
        const id=`attempt_${index}`,result=await run(document,tool,args,id);
        if(result.result.success===success)return {...result,id};
    }
    throw new Error('夹具未出现所需检定结果');
}
test('书籍学习：识字与实物要求，保留来源版次，重复学习拒绝且不重置既有技能',async()=>{
    const{document,run}=await setup();delete document.state.spells.spell_light;
    document.state.skills.skill_light.proficiency=777;
    const before=structuredClone(document);
    document.state.skills.skill_literacy.proficiency=99;
    await assert.rejects(run(document,'world_learn',{entity:'spell_light',source:'item_test_spellbook'}),/识字/);
    document.state.skills.skill_literacy.proficiency=100;delete document.state.inventory.item_test_spellbook;
    await assert.rejects(run(document,'world_learn',{entity:'spell_light',source:'item_test_spellbook'}),/没有这本书/);
    const learned=await outcome(run,before,'world_learn',{entity:'spell_light',source:'item_test_spellbook'},true);
    assert.equal(learned.document.state.minute,before.state.minute+120);assert.equal(learned.document.state.player.coins,before.state.player.coins);
    assert.deepEqual(learned.document.state.spells.spell_light.source,{type:'book',id:'item_test_spellbook',author:'npc_hw_luqing',edition:'第一版'});
    assert.equal(learned.document.state.skills.skill_light.proficiency,777);assert.equal(learned.document.state.inventory.item_test_spellbook.quantity,1);
    await assert.rejects(run(learned.document,'world_learn',{entity:'spell_light',source:'item_test_spellbook'}),/已经学会/);
    assert.deepEqual(before.state.spells,{});
});
test('学习失败实际花时间并留下可重放记录，虚假来源拒绝不扣费',async()=>{
    const{document,engine,run}=await setup();
    const failed=await outcome(run,document,'world_learn',{entity:'skill_joinery',source:'npc_hw_luqing'},false);
    assert.equal(failed.document.state.skills.skill_joinery,undefined);
    assert.equal(failed.document.state.minute,document.state.minute+120);
    assert.equal(failed.document.state.player.coins,document.state.player.coins-12);
    assert.equal(failed.document.state.npcs.npc_hw_luqing.coins,document.state.npcs.npc_hw_luqing.coins+12);
    assert.equal(failed.document.state.learning[failed.id].success,false);
    assert.ok(failed.result.notices.some(row=>row.text==='木榫制作尚未学会，本次已花费 12铜、120 分钟'));
    const replay=await engine.reduce(document,{tool:'world_learn',args:{entity:'skill_joinery',source:'npc_hw_luqing'},eventId:failed.id});
    assert.deepEqual(applyPatches(document,replay.patches),failed.document);
    const before=structuredClone(document);
    await assert.rejects(run(document,'world_learn',{entity:'skill_joinery',source:'item_test_spellbook'}),/没有所需学习内容/);
    await assert.rejects(run(document,'world_learn',{entity:'skill_joinery',source:'npc_hw_linsui'}),/资格/);
    assert.deepEqual(document,before);
});
test('技能与配方可从实际书籍学得，未学配方无法制作',async()=>{
    const{document,run}=await setup();
    await assert.rejects(run(document,'world_craft',{recipe:'recipe_staff_pair'}),/尚未学会/);
    const skill=await outcome(run,document,'world_learn',{entity:'skill_joinery',source:'item_test_skillbook'},true);
    const recipe=await outcome(run,skill.document,'world_learn',{entity:'recipe_staff_pair',source:'item_test_recipebook'},true);
    assert.equal(recipe.document.state.recipes.recipe_staff_pair.source.id,'item_test_recipebook');
    recipe.document.state.inventory.item_wood={quantity:1,quality:'木',durability:100,weight:2};
    const crafted=await outcome(run,recipe.document,'world_craft',{recipe:'recipe_staff_pair'},true);
    assert.equal(crafted.document.state.inventory.item_wood,undefined);assert.equal(crafted.document.state.inventory.item_staff.quantity,3);
    assert.ok(Object.values(crafted.document.state.crafted).some(row=>row.maker==='player'));
});
test('前置、品级与法术阶段消耗不能通过书籍绕过',async()=>{
    const{world,document}=await setup();
    world.spells[0].stage=1;world.spells[0].mp=6;world.spells[0].prerequisites=[{skill:'skill_joinery',minimum:300}];delete document.state.spells.spell_light;
    let engine=new WorldEngine(world);
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'item_test_spellbook'},eventId:'bad'}),/前置/);
    document.state.skills.skill_joinery={proficiency:300};
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'item_test_spellbook'},eventId:'bad'}),/认证/);
    document.state.professions.combat='profession_mage';
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'item_test_spellbook'},eventId:'bad'}),/品级/);
    world.spells[0].mp=1;engine=new WorldEngine(world);
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'item_test_spellbook'},eventId:'bad'}),/阶段目录/);
});
test('书籍的短式前置和损坏状态拒绝，旧版可选分区缺失时按需建立',async()=>{
    const{world,document}=await setup();
    world.items.find(row=>row.id==='item_test_skillbook').book.prerequisites=['skill_joinery'];
    let engine=new WorldEngine(world);
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'skill_joinery',source:'item_test_skillbook'},eventId:'string'}),/书籍前置/);
    world.items.find(row=>row.id==='item_test_skillbook').book.prerequisites=[];engine=new WorldEngine(world);
    document.state.inventory.item_test_skillbook.durability=0;
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'skill_joinery',source:'item_test_skillbook'},eventId:'broken'}),/书页已损坏/);
    document.state.inventory.item_test_skillbook.durability=100;delete document.state.learning;delete document.state.recipes;
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const result=await outcome(run,document,'world_learn',{entity:'skill_joinery',source:'item_test_skillbook'},true);
    assert.ok(result.document.state.learning[result.id]);assert.equal(document.state.learning,undefined);
});
test('独立识字技能有突破要求，合格授课者能指导；不占正式职业名额',async()=>{
    const{document,engine}=await setup();document.state.skills.skill_literacy.proficiency=299;
    let result=null;
    for(let i=0;i<100;i++){
        const out=await engine.reduce(document,{tool:'world_practice',args:{skill:'识字',breakthroughSource:'陆青'},eventId:`literacy_${i}`});
        if(out.result.success){result=applyPatches(document,out.patches);break;}
    }
    assert.ok(result);assert.ok(result.state.skills.skill_literacy.breakthroughs.includes(1));
    const out=await engine.reduce(result,{tool:'world_practice',args:{skill:'识字',target:'田契课本',gain:10},eventId:'read_practice'});
    result=applyPatches(result,out.patches);assert.equal(result.state.skills.skill_literacy.proficiency,309);
    assert.deepEqual(result.state.professions,document.state.professions);
});
test('专家级以上法术不由普通导师或普通书授予，稀有终极典籍遵守最低阅读时间',async()=>{
    const{world,document}=await setup();world.spells[0].stage=4;world.spells[0].mp=81;
    const book=world.items.find(row=>row.id==='item_test_spellbook');book.book.grade='终极';
    delete document.state.spells.spell_light;document.state.professions.combat='profession_mage';document.state.npcs.npc_hw_xuling.location=document.state.location;
    let engine=new WorldEngine(world);
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'npc_hw_xuling'},eventId:'teacher'}),/研究或稀有典籍/);
    await assert.rejects(engine.reduce(document,{tool:'world_learn',args:{entity:'spell_light',source:'item_test_spellbook'},eventId:'common'}),/稀有典籍/);
    book.book.rare=true;engine=new WorldEngine(world);
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const learned=await outcome(run,document,'world_learn',{entity:'spell_light',source:'item_test_spellbook'},true);
    assert.equal(learned.result.minutes,1920);assert.equal(learned.document.state.minute,document.state.minute+1920);
});
