import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
import {toolDefinitions}from'../extension/tools.mjs';
import Ajv from'ajv';
import {fixtureDefinition} from '../server-plugin/workstation-services.mjs';

const world=await loadWorld(),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const engine=new WorldEngine(world),fresh=()=>{
    const c=engine.initialFromLegacy(seed,'runtime-invention');
    c.state.location='bld_hw_mill';
    c.state.skills.skill_life_6_core={proficiency:600,breakthroughs:[1,2],daily:{}};
    const role=engine.byId.get('skill_life_6_core').profession;
    if(!c.state.professions.life.includes(role))c.state.professions.life.push(role);
    c.state.inventory.item_wood={quantity:6,quality:'木',durability:100,weight:1};
    c.state.inventory.item_whittling_knife={quantity:1,quality:'木',durability:80,weight:0.2};
    return c;
};
const run=async(c,tool,args,eventId)=>{
    const out=await engine.reduce(c,{tool,args,eventId});return{document:applyPatches(c,out.patches),result:out.result};
};
async function observed(c,tool,args,success,prefix){
    for(let i=0;i<100;i++){
        const id=`${prefix}_${i}`,out=await run(c,tool,args,id);
        if(out.result.success===success)return{...out,id};
    }
    throw new Error(`未观察到所需检定 ${prefix}`);
}
async function researched(name='木工研究'){
    const started=await run(fresh(),'world_research',{operation:'start',name,concept:'改变木楔的切削工序',skills:['skill_life_6_core']},'study');
    let c=started.document;
    for(let day=0;day<3;day++){
        const out=await observed(c,'world_research',{operation:'work',project:started.result.project,coins:5,minutes:120},true,`study_day${day}`);
        c=out.document;
        if(day<2)c=(await run(c,'world_time',{minutes:1440},`wait${day}`)).document;
    }
    assert.equal(c.state.projects.research_study.stage,'打磨');
    return c;
}
const data=()=>({skill:'skill_life_6_core',minimumProficiency:120,materials:[{item:'木料',amount:2}],minutes:60,difficulty:15,
    output:{item:'item_wooden_peg',quantity:4},tools:['item_whittling_knife'],workstation:world.recipes.find(row=>row.id==='recipe_wooden_pegs').workstation,location:'bld_hw_mill',
    byproducts:[{item:'item_wood_shavings',amount:1}],toolWear:2,failure:{recoverFraction:0.5,injury:2}});
const register=async(c,type,name='试制木楔法',input=data())=>run(c,'world_create',{type,name,project:'research_study',data:type==='skill'?{}:input},'invention');

test('完成多日研究的技能可从对应项目学习、练习及用于实际检定，阶段受限且来源不可替换',async()=>{
    const c=await researched(),created=await register(c,'skill','顺纹切削');
    const id=created.result.entity,definition=catalogDefinition(engine,created.document,{entity:'顺纹切削',kind:'skill'});
    assert.equal(definition.stage,1);assert.equal(definition.source,'research_study');
    assert.equal(created.document.state.skills[id],undefined);
    assert.deepEqual(created.document.state.inventory,c.state.inventory);
    const args={entity:'顺纹切削',kind:'skill',source:'research_study'};
    const bad=structuredClone(created.document);bad.state.projects.other={...bad.state.projects.research_study,id:'other'};
    await assert.rejects(run(bad,'world_learn',{...args,source:'other'},'wrong'),/完成来源/);
    bad.state.projects.research_study.stage='原型';
    await assert.rejects(run(bad,'world_learn',args,'unfinished'),/完成来源/);
    await assert.rejects(run(created.document,'world_learn',{entity:'skill_light',source:'research_study'},'unrelated'),/完成来源/);
    const failed=await observed(created.document,'world_learn',args,false,'learn_fail');
    assert.equal(failed.document.state.skills[id],undefined);assert.equal(failed.document.state.minute,created.document.state.minute+120);
    const learned=await observed(failed.document,'world_learn',args,true,'learn_ok');
    assert.equal(learned.document.state.skills[id].proficiency,0);
    assert.deepEqual(learned.document.state.skills[id].source,{type:'research',id:'research_study'});
    assert.equal(learned.document.state.player.coins,created.document.state.player.coins);
    // Native practice is timed at the published 1.2 points/hour, not a caller
    // assigned gain. Keep the integer, fractional carry and real cost exact.
    const practiced=await run(learned.document,'world_practice',{skill:'顺纹切削',minutes:120,target:'顺纹试切'},'practice');
    assert.equal(practiced.document.state.skills[id].proficiency,2);
    assert.equal(practiced.document.state.skills[id].practiceCarry,.4);
    assert.equal(practiced.document.state.minute,learned.document.state.minute+120);
    const checked=await run(practiced.document,'world_check',{attribute:'智力',skill:'顺纹切削',difficulty:15},'use');
    assert.equal(checked.result.modifier,Math.floor((practiced.document.state.player.attributes.智力-10)/2)+Math.floor(2/world.rules.check.skillDivisor));
    await assert.rejects(run(learned.document,'world_learn',args,'repeat'),/已经学会/);
    await assert.rejects(register(created.document,'skill','第二项成果'),/已经登记成果/);
});

test('新配方仅登记规则；学会后使用原制造链扣真实材料、费用、时间与工具磨损，产物有署名及副产品',async()=>{
    const c=await researched(),created=await register(c,'recipe'),id=created.result.entity;
    assert.deepEqual(created.document.state.inventory,c.state.inventory);
    assert.equal(created.document.state.projects.research_study.result,id);
    assert.equal(created.document.state.recipes[id],undefined);
    const definition=catalogDefinition(engine,created.document,{entity:'试制木楔法',kind:'recipe'});
    assert.equal(definition.materials[0].item,'item_wood');assert.equal(definition.learningRequired,true);
    assert.ok(catalogDefinition(engine,created.document,{kind:'recipe'}).count>world.recipes.length);
    await assert.rejects(run(created.document,'world_craft',{recipe:id},'unknown'),/尚未学会/);
    const learned=await observed(created.document,'world_learn',{entity:id,kind:'recipe',source:'research_study'},true,'recipe_learn');
    const out=await observed(learned.document,'world_craft',{recipe:'试制木楔法'},true,'make'),made=out.document;
    assert.equal(made.state.inventory.item_wood.quantity,learned.document.state.inventory.item_wood.quantity-2);
    assert.equal(made.state.inventory.item_whittling_knife.durability,78);
    assert.equal(made.state.player.coins,learned.document.state.player.coins-2);
    assert.equal(made.state.minute,learned.document.state.minute+60);
    assert.equal(made.state.inventory.item_wooden_peg.quantity,4);assert.equal(made.state.inventory.item_wood_shavings.quantity,1);
    assert.equal(out.result.instances.length,5);
    for(const instance of out.result.instances){assert.equal(made.state.itemInstances[instance].maker,'player');assert.equal(made.state.itemInstances[instance].recipe,id);}
    assert.equal(made.state.crafted[out.result.receipt].recipe,id);
    assert.deepEqual((await run(learned.document,'world_craft',{recipe:'试制木楔法'},out.id)).document,made);
});

test('自创配方失败仍扣费耗时并按比例回收；缺料、坏工具、缺工作台均不改变账本；缺工作台许可照做并命中擅用',async()=>{
    const created=await register(await researched(),'recipe');
    const learned=await observed(created.document,'world_learn',{entity:created.result.entity,source:'research_study'},true,'recipe_learn');
    const out=await observed(learned.document,'world_craft',{recipe:created.result.entity},false,'failure'),c=out.document;
    assert.equal(c.state.inventory.item_wood.quantity,5);assert.equal(c.state.inventory.item_wooden_peg,undefined);
    assert.equal(c.state.inventory.item_wood_shavings,undefined);assert.equal(out.result.instances.length,0);
    assert.deepEqual(out.result.salvage,[{item:'item_wood',amount:1}]);
    assert.equal(c.state.player.coins,learned.document.state.player.coins-2);assert.equal(c.state.minute,learned.document.state.minute+60);
    assert.equal(c.state.inventory.item_whittling_knife.durability,78);
    assert.equal(c.state.player.hp,learned.document.state.player.hp-(out.result.degree==='大失败'?2:0));
    for(const change of[
        doc=>doc.state.inventory.item_wood.quantity=1,doc=>doc.state.inventory.item_whittling_knife.durability=0,
        doc=>doc.state.location='bld_hw_qingdeng',doc=>delete doc.state.skills.skill_life_6_core,
    ]){
        const bad=structuredClone(learned.document);change(bad);const before=structuredClone(bad);
        await assert.rejects(run(bad,'world_craft',{recipe:created.result.entity},'bad'));assert.deepEqual(bad,before);
    }
    // K5：去掉主人公开的收费，磨坊的设备就只供主人及其许可的人使用（原为手写 access='consent'）。
    // A1：引擎在自己的运行时副本上工作，设备在运行时世界上；私宅夹具从引擎的世界复制（断言不动）
    const privateWorld=structuredClone(engine.world),station=privateWorld.locations.find(row=>row.id==='bld_hw_mill').fixtures.find(row=>fixtureDefinition(row.fixture).affords===data().workstation);
    delete station.fee;
    // K6 依据（审查 C-b manufacturing:86、D1 本文件:121）：没有工作台许可照样能做，命中擅用他人之物。
    {const out=await new WorldEngine(privateWorld).reduce(learned.document,{tool:'world_craft',args:{recipe:created.result.entity},eventId:'no_permit'});const o=out.result.offenses?.find(o=>o.offense==='unauthorized_use');assert.ok(o,'命中擅用他人之物');assert.equal(o.victim,'loc_hw');}
});

test('未完成研究、过高阶段、无关知识、空耗材、未知产物和非法工序在登记时拒绝；不能直接造物或覆盖规则',async()=>{
    await assert.rejects(register(fresh(),'recipe'),/多日研究/);
    const c=await researched();
    for(const input of[
        {...data(),minimumProficiency:600},{...data(),skill:'skill_light'},{...data(),materials:[]},
        {...data(),output:{item:'item_unknown',quantity:1}},{...data(),materials:[{item:'item_wood',amount:0}]},
        {...data(),minutes:0},{...data(),difficulty:1},{...data(),failure:{recoverFraction:2}},
        {...data(),tools:['item_wood']},{...data(),workstation:'unknown'},
        {...data(),byproducts:[{item:'item_wooden_peg',amount:1}]},
    ]){
        const before=structuredClone(c);await assert.rejects(register(c,'recipe','无效试制',input));assert.deepEqual(c,before);
    }
    await assert.rejects(run(c,'world_create',{type:'item',name:'白送成品',project:'research_study',data:{}},'free'),/不能凭空/);
    await assert.rejects(run(c,'world_create',{type:'spell',name:'自由施法',project:'research_study',data:{}},'spell'),/不能直接登记/);
    const spoofed=await run(c,'world_create',{type:'skill',name:'有限切削',project:'research_study',data:{stage:8,profession:'profession_life_6',learnDifficulty:1,aliases:['木料']}},'limited');
    assert.equal(spoofed.document.state.created[spoofed.result.entity].stage,1);
    assert.equal(spoofed.document.state.created[spoofed.result.entity].profession,null);
    assert.deepEqual(spoofed.document.state.created[spoofed.result.entity].aliases,[]);
    assert.equal(engine.scoped(spoofed.document).resolve('木料','item'),'item_wood');
});

test('公开工具及共享schema能表示自创配方，重启、导入与回滚保留对应成果而不污染其他战役',async t=>{
    const created=await register(await researched(),'recipe'),id=created.result.entity;
    const definition=toolDefinitions().find(row=>row.function.name==='world_create').function;
    assert.ok(new Ajv({strict:false}).compile(definition.parameters)({type:'recipe',name:'试制木楔法',project:'research_study',data:data()}));
    const schema=JSON.parse(await fs.readFile('schemas/world.schema.json','utf8'));
    assert.ok(new Ajv({strict:false}).compile(schema.$defs.recipe)(created.document.state.created[id]));
    const dir=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-invention-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const reducer=(c,input)=>new WorldEngine(world).reduce(c,input),store=new CampaignStorage(dir,{reducer});
    await store.create({id:'invention',worldVersion:world.version,document:created.document});
    const args={entity:id,source:'research_study'},learned=await observed(created.document,'world_learn',args,true,'stored_learn');
    await store.transact('invention',{id:'learn',anchor:'learned',input:{tool:'world_learn',args,eventId:learned.id}},reducer);
    const craft=await observed(learned.document,'world_craft',{recipe:id},true,'stored_craft');
    await store.transact('invention',{id:'make',anchor:'made',input:{tool:'world_craft',args:{recipe:id},eventId:craft.id}},reducer);
    const view=await store.read('invention');assert.deepEqual(view.document,craft.document);
    assert.deepEqual((await new CampaignStorage(dir,{reducer}).read('invention')).document,view.document);
    assert.deepEqual((await store.import(await store.export('invention'),'copy')).document,view.document);
    assert.deepEqual((await store.reconcile('invention',[])).document,created.document);
    assert.equal(new WorldEngine(world).scoped(view.document).resolve('试制木楔法','recipe'),id);
    assert.throws(()=>engine.scoped(fresh()).resolve(id,'recipe'),/未登记/);
});

test('F050 配方守恒：同一种东西无转化地多出来被拒并给世界内原因；不同材料的转化按工序裁决，不设估值产出上限',async()=>{
    const c=await researched();
    // 1 木 -> 200 木: 投入1份、产出200份同一种东西，没有任何转化。拒绝并写明世界内原因，零写入。
    for(const input of[
        {...data(),materials:[{item:'item_wood',amount:1}],output:{item:'item_wood',quantity:200}},
        {...data(),materials:[{item:'item_wood',amount:5}],output:{item:'item_wood',quantity:5}},
        {...data(),materials:[{item:'item_wood',amount:2}],byproducts:[{item:'item_wood',amount:2}]},
    ]){
        const before=structuredClone(c);
        await assert.rejects(register(c,'recipe','木生木',input),/凭空多出同一种东西/);assert.deepEqual(c,before);
    }
    // 同一种东西投入5份、产出4份是有损耗的加工，不是增殖，仍可登记；不同材料之间的转化倍率由材料数量、
    // 工具、工时与技能阶段裁决，不设按估值算的上限：1 木料 -> 200 木楔（单次成品数量本就最多200）照常登记。
    const loss=await register(c,'recipe','削耗',{...data(),materials:[{item:'item_wood',amount:5}],output:{item:'item_wood',quantity:4},byproducts:[]});
    assert.ok(loss.result.entity);
    const big=await register(c,'recipe','千楔法',{...data(),materials:[{item:'item_wood',amount:1}],output:{item:'item_wooden_peg',quantity:200}});
    assert.equal(catalogDefinition(engine,big.document,{entity:'千楔法',kind:'recipe'}).output.quantity,200);
});
