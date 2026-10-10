import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {applyPatches}from'../server-plugin/storage.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld();
    world.npcs.find(row=>row.id==='npc_hw_linsui').skills={skill_light:450};
    world.npcs.find(row=>row.id==='npc_hw_linsui').attributes={精神:14};
    world.npcs.find(row=>row.id==='npc_hw_hezhou').skills={skill_light:300};
    world.items.find(row=>row.id==='item_staff').checkBonus={bonus:2,attributes:['精神'],skills:['skill_light']};
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'checks-test');
    document.state.player.attributes.精神=12;document.state.professions.combat='profession_mage';document.state.skills.skill_light.proficiency=300;
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
test('对抗检定读取在场对手的真实属性技能，不能传入修正或骰点，重放确定',async()=>{
    const{document,run}=await setup();
    const args={attribute:'精神',skill:'照明术',opponent:{npc:'老板娘',attribute:'精神',skill:'照明术'}};
    const a=await run(document,'world_check',args,'contest'),b=await run(document,'world_check',args,'contest');
    assert.deepEqual(a.result,b.result);assert.equal(a.result.modifier,3);assert.equal(a.result.opponent.modifier,5);assert.equal(a.result.opponent.npc,'npc_hw_linsui');
    assert.equal(a.result.difficulty,a.result.opponent.total);
    await assert.rejects(run(document,'world_check',{...args,difficulty:10},'both'),/不同时指定/);
    await assert.rejects(run(document,'world_check',{...args,opponent:{...args.opponent,modifier:-10}},'fake'),/不能指定/);
    document.state.npcs.npc_hw_linsui.location='loc_bs';const before=structuredClone(document);
    await assert.rejects(run(document,'world_check',args,'remote'),/不在场/);assert.deepEqual(document,before);
});
test('对抗平局守方胜，天然1与20优先，结果程度与成功一致',async()=>{
    const{document,run}=await setup();document.state.player.attributes.精神=14;document.state.skills.skill_light.proficiency=450;
    const args={attribute:'精神',skill:'照明术',opponent:{npc:'林穗',attribute:'精神',skill:'照明术'}};
    let tie=false,naturalFailure=false,naturalSuccess=false;
    for(let i=0;i<250&&!(tie&&naturalFailure&&naturalSuccess);i++){
        const{result}=await run(document,'world_check',args,`contest_${i}`);
        assert.equal(result.success,['勉强成功','成功','大成功'].includes(result.degree));
        if(result.die===result.opponent.die){tie=true;assert.equal(result.success,false);}
        if(result.die===1){naturalFailure=true;assert.equal(result.success,false);assert.equal(result.degree,'大失败');}
        if(result.die===20&&result.opponent.die!==20){naturalSuccess=true;assert.equal(result.success,true);assert.equal(result.degree,'大成功');}
    }
    assert.equal(tie&&naturalFailure&&naturalSuccess,true);
});
test('协助须实际有效承诺，合格人物掷骰，最多两人，同一承诺只能履行一次',async()=>{
    const{document,run}=await setup();
    const args={attribute:'精神',skill:'照明术',difficulty:20};
    await assert.rejects(run(document,'world_check',{...args,helpers:['林穗']},'madeup'),/协助需要/);
    let c=(await run(document,'world_promise',{promisor:'林穗',type:'协助',attribute:'精神',skill:'照明术',content:'帮你辨认光点'},'help1')).document;
    c=(await run(c,'world_promise',{promisor:'贺舟',type:'协助',attribute:'精神',skill:'照明术',content:'帮你记录光点'},'help2')).document;
    const before=structuredClone(c);
    const out=await run(c,'world_check',{...args,helpers:['obl_help1','obl_help2']},'assisted');
    assert.equal(out.result.helpers.length,2);assert.equal(out.result.modifier,3+out.result.helpers.filter(row=>row.success).length*2);
    for(const helper of out.result.helpers){assert.equal(out.document.state.obligations[helper.obligation].status,'已完成');assert.equal(out.document.state.npcs[helper.npc].developments.at(-1).source,'assisted');}
    assert.deepEqual(c,before);
    await assert.rejects(run(out.document,'world_check',{...args,helpers:['obl_help1']},'reuse'),/未履行/);
    await assert.rejects(run(c,'world_check',{...args,helpers:['obl_help1','obl_help1']},'duplicates'),/重复/);
    await assert.rejects(run(c,'world_check',{...args,helpers:['obl_help1','obl_help2','fake']},'excess'),/超限/);
});
test('过期、错技能、技能不足及死亡协助者都不能提供加值，也不能作为对手同时协助',async()=>{
    const{document,run}=await setup();
    const args={attribute:'精神',skill:'照明术',difficulty:20};
    const c=(await run(document,'world_promise',{promisor:'林穗',type:'协助',attribute:'精神',skill:'照明术',content:'帮忙'},'help')).document;
    for(const alter of[
        x=>x.state.obligations.obl_help.deadline=540,x=>x.state.obligations.obl_help.skill='skill_literacy',
        x=>x.state.npcs.npc_hw_linsui.skills={skill_light:99},x=>x.state.npcs.npc_hw_linsui.status='死亡',
    ]){const bad=structuredClone(c);alter(bad);const before=structuredClone(bad);await assert.rejects(run(bad,'world_check',{...args,helpers:['obl_help']},'bad'));assert.deepEqual(bad,before);}
    await assert.rejects(run(c,'world_check',{attribute:'精神',skill:'照明术',opponent:{npc:'林穗'},helpers:['obl_help']},'both-sides'),/同时作为对手/);
});
test('真实工具加值受技能属性、持有、品质等级和耐久限制，不允许重复工具堆叠',async()=>{
    const{document,run}=await setup();const args={attribute:'精神',skill:'照明术',difficulty:15,tools:['旧木杖']};
    const out=await run(document,'world_check',args,'tool');assert.equal(out.result.modifier,5);assert.equal(out.result.toolBonus,2);
    assert.equal((await run(document,'world_check',{...args,attribute:'敏捷'},'unrelated')).result.toolBonus,0);
    await assert.rejects(run(document,'world_check',{...args,tools:['旧木杖','木杖']},'repeat'),/重复/);
    document.state.inventory.item_staff.durability=0;await assert.rejects(run(document,'world_check',args,'broken'),/损坏/);
    document.state.inventory.item_staff.durability=100;document.state.inventory.item_staff.quality='金';await assert.rejects(run(document,'world_check',args,'high'),/等级不足/);
    delete document.state.inventory.item_staff;await assert.rejects(run(document,'world_check',args,'missing'),/没有所需工具/);
});
test('固定检定五档结果、优势劣势与对消可重放，不能突破情境上限',async()=>{
    const{document,run}=await setup();const args={attribute:'精神',difficulty:15};
    const a=await run(document,'world_check',args,'roll'),adv=await run(document,'world_check',{...args,advantage:true},'roll'),dis=await run(document,'world_check',{...args,disadvantage:true},'roll');
    assert.equal(adv.result.die,Math.max(...adv.result.rolls));assert.equal(dis.result.die,Math.min(...dis.result.rolls));
    assert.equal((await run(document,'world_check',{...args,advantage:true,disadvantage:true},'roll')).result.die,a.result.die);
    await assert.rejects(run(document,'world_check',{...args,context:6,contextReason:'自认为有利'},'too-much'),/范围/);
    await assert.rejects(run(document,'world_check',{...args,context:1,contextReason:'  '},'no-reason'),/理由/);
});
test('人物技能映射和工具加值的坏引用、越界数值、假属性阻止世界构建',async()=>{
    const{world}=await setup();assert.equal(validateWorld(world).ok,true);
    for(const alter of[w=>w.npcs[0].skills={skill_missing:300},w=>w.npcs[0].skills={skill_light:2700},w=>w.items[1].checkBonus.attributes=['幸运'],w=>w.items[1].checkBonus.bonus=99]){
        const bad=structuredClone(world);alter(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
