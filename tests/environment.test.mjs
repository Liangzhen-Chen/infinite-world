import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import fc from'fast-check';
import {loadWorld}from'../tools/load-world.mjs';
import {withWaterEnvironment}from'../tools/prepare-water-environment.mjs';
import {spellBlueprints}from'../world/design/spell-blueprints.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {catalogDefinition}from'../server-plugin/catalog.mjs';
import {readStateSection}from'../extension/state-read.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const operations=['condense','clean_water','sense_water','irrigate','clear_silt','soil_water'];
async function setup(){
    const world=withWaterEnvironment(await loadWorld()),bones=spellBlueprints().filter(row=>operations.includes(row.mechanism));
    // Publication now supplies these IDs; keep the published entries when present.
    for(const bone of bones){if(!world.spells.some(row=>row.id===bone.id))world.spells.push(bone);if(!world.skills.some(row=>row.id===bone.skill))world.skills.push({id:bone.skill,name:bone.name,attribute:'精神',profession:'profession_mage'});}
    const engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'environment-test');
    // This suite isolates the existing water mechanics at registered 70% humidity;
    // generated outdoor humidity is exercised separately by weather.test.mjs.
    document.state.weather.loc_hw_dock={humidityPercent:70};
    document.state.location='loc_hw_dock';document.state.player.level=60;document.state.player.mp=500;document.state.player.maxMp=500;
    document.state.inventory.item_resin={quantity:4,quality:'木',durability:100,weight:0.1};
    // Isolate casting from the separate acquisition and learning tests.
    for(const bone of bones){document.state.spells[bone.id]={source:{type:'fixture'}};document.state.skills[bone.skill]={proficiency:120,daily:{},breakthroughs:[]};}
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    const spell=operation=>bones.find(row=>row.mechanism===operation).id;
    return{world,engine,document,run,spell};
}
function state(c,world,id){return c.state.records[`physical_feature:${id}`]?.state??world.locations.flatMap(p=>p.features??[]).find(f=>f.id===id).state;}
function change(c,world,id,values){const location=world.locations.find(row=>row.features?.some(feature=>feature.id===id)).id;c.state.records[`physical_feature:${id}`]={category:'physical_feature',id,location,state:{...state(c,world,id),...values}};}
async function cast(run,c,spell,target,success=true,args={}){
    for(let i=0;i<100;i++){
        const id=`water_fixture_${i}`,out=await run(c,'world_cast',{spell,target,...args},id);
        if(out.result.success===success)return{...out,id};
    }
    throw new Error('未找到所需独立检定样本');
}

test('真实容器容量和湿度限制凝露，空杯不会获得毒素负荷，满杯/干空气/远处施法不耗魔',async()=>{
    const{world,document,run,spell}=await setup();
    const first=await cast(run,document,spell('condense'),'公用水盏');let c=first.document;
    assert.equal(first.result.condensedMl,35);assert.equal(state(c,world,'feature_hw_cup').waterMl,35);
    assert.equal(state(c,world,'feature_hw_cup').toxinUg,0);assert.equal(Object.keys(c.state.effects).length,0);
    for(let i=0;i<6;i++)c=(await cast(run,c,spell('condense'),'公用水盏')).document;
    const last=await cast(run,c,spell('condense'),'公用水盏');c=last.document;
    assert.equal(last.result.condensedMl,5);assert.equal(state(c,world,'feature_hw_cup').waterMl,250);
    const full=structuredClone(c);await assert.rejects(cast(run,c,spell('condense'),'公用水盏'),/已满/);assert.deepEqual(c,full);
    const dry=structuredClone(document);dry.state.weather.loc_hw_dock={humidityPercent:0};
    await assert.rejects(cast(run,dry,spell('condense'),'公用水盏'),/湿度/);assert.equal(dry.state.player.mp,500);
    const far=structuredClone(document);far.state.location='bld_hw_mill';await assert.rejects(cast(run,far,spell('condense'),'feature_hw_cup'),/当前位置/);
});

test('净水仅降低悬浮污物，毒素盐分与病原保持，观察和world_read不泄漏尚未检验的污染',async()=>{
    const{world,engine,document,run,spell}=await setup();document.state.location='bld_hw_qingdeng';
    document.state.records.water_permission={category:'authorization',subject:'feature_hw_kitchen_bucket',action:'environment_use',grantor:'npc_hw_linsui',expires:document.state.minute+20};
    const before=state(document,world,'feature_hw_kitchen_bucket'),out=await cast(run,document,spell('clean_water'),'后厨水桶',true,{authorization:'water_permission'}),after=state(out.document,world,'feature_hw_kitchen_bucket');
    assert.equal(after.turbidity,15);for(const field of['waterMl','saltMg','toxinUg','pathogenRisk'])assert.equal(after[field],before[field]);
    const sensed=await cast(run,out.document,spell('sense_water'),'后厨水桶');assert.equal(sensed.result.observation.salinityPpt,0.1);
    assert.match(sensed.result.observation.limits,/未检验毒素或病原/);
    for(const view of[catalogDefinition(engine,out.document,{entity:'feature_hw_kitchen_bucket'}),readStateSection(out.document.state,'记录'),sensed.result.observation]){
        const text=JSON.stringify(view);for(const field of['toxinUg','pathogenRisk','saltMg'])assert.ok(!text.includes(field));
    }
});

test('私人物件需要确切所有者许可，错误授予者、过期许可、死亡所有者和错误对象均拒绝',async()=>{
    const{document,run,spell}=await setup();document.state.location='bld_hw_qingdeng';
    for(const authorization of[undefined,{category:'authorization',subject:'feature_hw_kitchen_bucket',action:'environment_use',grantor:'player'},
        {category:'authorization',subject:'feature_hw_kitchen_bucket',action:'environment_use',grantor:'npc_hw_linsui',expires:document.state.minute}]){
        const c=structuredClone(document);if(authorization)c.state.records.permit=authorization;
        const before=structuredClone(c);await assert.rejects(cast(run,c,spell('clean_water'),'后厨水桶',true,{authorization:'permit'}),/授权/);assert.deepEqual(c,before);
    }
    document.state.records.permit={category:'authorization',subject:'feature_hw_kitchen_bucket',action:'environment_use',grantor:'npc_hw_linsui',expires:document.state.minute+10};
    document.state.npcs.npc_hw_linsui.status='死亡';await assert.rejects(cast(run,document,spell('clean_water'),'后厨水桶',true,{authorization:'permit'}),/履约/);
    await assert.rejects(cast(run,document,spell('clean_water'),'feature_hw_fake'),/未登记/);
});

test('引水和回潮只沿真实沟渠转移有限水，污染负荷守恒，堵塞和田垄处理情况影响结果',async()=>{
    const{world,document,run,spell}=await setup();change(document,world,'feature_hw_pool',{toxinUg:60000});
    const sourceBefore=state(document,world,'feature_hw_pool'),first=await cast(run,document,spell('irrigate'),'引水沟');
    assert.equal(first.result.movedMl,6000);const src=state(first.document,world,'feature_hw_pool'),dst=state(first.document,world,'feature_hw_plot');
    assert.equal(src.waterMl,24000);assert.equal(dst.waterMl,6000);assert.equal(dst.moisturePercent,45);
    assert.equal(src.toxinUg+dst.toxinUg,sourceBefore.toxinUg);assert.equal(src.saltMg+dst.saltMg,sourceBefore.saltMg);
    const second=await cast(run,first.document,spell('soil_water'),'菜圃田垄');assert.equal(second.result.movedMl,6000);
    assert.equal(second.document.state.inventory.item_resin.quantity,3);
    assert.equal(state(second.document,world,'feature_hw_pool').waterMl+state(second.document,world,'feature_hw_plot').waterMl,30000);
    for(const alter of[c=>change(c,world,'feature_hw_channel',{blockagePercent:100}),c=>change(c,world,'feature_hw_pool',{waterMl:0,saltMg:0,toxinUg:0}),
        c=>change(c,world,'feature_hw_plot',{waterMl:20000}),c=>change(c,world,'feature_hw_plot',{worked:false})]){
        const bad=structuredClone(document);alter(bad);const before=structuredClone(bad);
        await assert.rejects(cast(run,bad,spell('soil_water'),'菜圃田垄'));assert.deepEqual(bad,before);
    }
});

test('清渠只松泥，人工真实运走之后堵塞下降，失败搬运不移泥但花时间',async()=>{
    const{world,document,run,spell}=await setup(),loosened=await cast(run,document,spell('clear_silt'),'引水沟');
    const current=state(loosened.document,world,'feature_hw_channel');assert.equal(current.loosenedSiltGrams,2000);assert.equal(current.siltGrams,8000);assert.equal(current.blockagePercent,70);
    for(const success of[true,false]){
        let sample;for(let i=0;i<100;i++){
            const out=await run(loosened.document,'world_environment',{operation:'carry_silt',target:'引水沟',destination:'堆泥地',grams:1000},`carry_${i}`);
            if(out.result.success===success){sample=out;break;}
        }
        assert.ok(sample);const ch=state(sample.document,world,'feature_hw_channel'),heap=state(sample.document,world,'feature_hw_silt_heap');
        assert.equal(ch.siltGrams+heap.siltGrams,8000);assert.equal(ch.blockagePercent,success?61.25:70);
        assert.equal(sample.document.state.minute,loosened.document.state.minute+20);assert.equal(sample.result.removedGrams,success?1000:0);
    }
    await assert.rejects(run(loosened.document,'world_environment',{operation:'carry_silt',target:'引水沟',destination:'堆泥地',grams:1001},'too_much'),/重量/);
    await assert.rejects(run(document,'world_environment',{operation:'carry_silt',target:'引水沟',destination:'堆泥地'},'not_loose'),/松动/);
});

test('法术失败仍耗魔时间与练习但不修改水，许可施法中到期不生效，局部走近实际改变距离',async()=>{
    const{world,document,run,spell}=await setup(),failed=await cast(run,document,spell('condense'),'公用水盏',false);
    assert.equal(failed.document.state.player.mp,499);assert.equal(failed.document.state.minute,document.state.minute+1);
    assert.equal(state(failed.document,world,'feature_hw_cup').waterMl,0);
    // Other registered processes may initialize their own records as time advances.
    assert.equal(failed.document.state.records['physical_feature:feature_hw_cup'],undefined);
    const far=structuredClone(document);far.state.records.local_player_position={category:'local_position',location:'loc_hw_dock',point:[10,0]};
    await assert.rejects(cast(run,far,spell('condense'),'公用水盏'),/距离/);
    const approached=await run(far,'world_environment',{operation:'approach',target:'公用水盏'},'walk_to_cup');
    assert.equal(approached.document.state.minute,far.state.minute+1);assert.equal((await cast(run,approached.document,spell('condense'),'公用水盏')).result.condensedMl,35);
    const near=structuredClone(document);near.state.location='bld_hw_qingdeng';
    near.state.records.expiring={category:'authorization',subject:'feature_hw_kitchen_bucket',action:'environment_use',grantor:'npc_hw_linsui',expires:near.state.minute+20};
    const valid=await cast(run,near,spell('clean_water'),'后厨水桶',true,{authorization:'expiring'});
    near.state.records.expiring.expires=near.state.minute+1;
    const denied=await run(near,'world_cast',{spell:spell('clean_water'),target:'后厨水桶',authorization:'expiring'},valid.id);
    assert.equal(denied.result.checkSuccess,true);assert.equal(denied.result.success,false);assert.match(denied.result.effectFailed,/授权/);
    assert.equal(denied.document.state.player.mp,near.state.player.mp-2);
    assert.equal(state(denied.document,world,'feature_hw_kitchen_bucket').turbidity,55);
});

test('水和污染转移性质验证：任意有限源量、空余容量与堵塞程度不越界或凭空补水',async()=>{
    const{world,document,run,spell}=await setup();
    await fc.assert(fc.asyncProperty(fc.integer({min:1,max:60000}),fc.integer({min:0,max:19999}),fc.integer({min:0,max:99}),async(water,filled,blockage)=>{
        const c=structuredClone(document);change(c,world,'feature_hw_pool',{waterMl:water,toxinUg:water*2,saltMg:water*0.2});
        change(c,world,'feature_hw_plot',{waterMl:filled,toxinUg:filled*3,saltMg:filled*0.1});change(c,world,'feature_hw_channel',{blockagePercent:blockage});
        const out=await cast(run,c,spell('irrigate'),'引水沟'),src=state(out.document,world,'feature_hw_pool'),dst=state(out.document,world,'feature_hw_plot');
        assert.equal(src.waterMl+dst.waterMl,water+filled);assert.ok(src.waterMl>=0&&dst.waterMl<=20000);
        assert.ok(Math.abs(src.toxinUg+dst.toxinUg-water*2-filled*3)<0.000001);
        assert.ok(Math.abs(src.saltMg+dst.saltMg-water*0.2-filled*0.1)<0.000001);
    }),{numRuns:40,seed:112022});
});

test('环境动态状态经重启、导出导入与删消息回滚一致，改变源初始水量不会补满已有对象',async t=>{
    const{world,engine,document,run,spell}=await setup(),sample=await cast(run,document,spell('irrigate'),'引水沟');
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'infinite-fields-water-'));t.after(()=>{
        const resolved=path.resolve(directory),relative=path.relative(path.resolve(os.tmpdir()),resolved);
        if(relative.startsWith('..')||path.isAbsolute(relative)||!path.basename(resolved).startsWith('infinite-fields-water-'))throw new Error('拒绝清理非本测试临时目录');
        return fs.rm(resolved,{recursive:true,force:true});
    });
    const reducer=(c,input)=>engine.reduce(c,input),store=new CampaignStorage(directory,{reducer});
    await store.create({id:'water',worldVersion:engine.world.version,document});
    await store.transact('water',{id:'irrigate_event',anchor:'watered',input:{tool:'world_cast',args:{spell:spell('irrigate'),target:'引水沟'},eventId:sample.id}},reducer);
    const view=await store.read('water');assert.equal(state(view.document,world,'feature_hw_pool').waterMl,24000);
    assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('water')).document,view.document);
    assert.deepEqual((await store.import(await store.export('water'),'water_copy')).document,view.document);
    const changed=structuredClone(world);changed.locations.find(x=>x.id==='loc_hw_dock').features.find(x=>x.id==='feature_hw_pool').state.waterMl=50000;
    const changedEngine=new WorldEngine(changed);assert.equal(catalogDefinition(changedEngine,view.document,{entity:'feature_hw_pool'}).waterMl,24000);
    assert.deepEqual((await store.reconcile('water',[])).document,document);
});

test('环境骨架可重复构建且保留其他对象，坏引用、超容量、重复名字与越界法术拒绝',async()=>{
    const{world}=await setup();assert.equal(validateWorld(world).ok,true);assert.deepEqual(withWaterEnvironment(withWaterEnvironment(world)),withWaterEnvironment(world));
    // Later batches insert other features before these water fixtures.
    const feature=(w,id)=>w.locations.find(x=>x.id==='loc_hw_dock').features.find(x=>x.id===id);
    const changes=[w=>feature(w,'feature_hw_pool').state.waterMl=60001,
        w=>feature(w,'feature_hw_channel').links.source='feature_missing',
        w=>feature(w,'feature_hw_channel').links.source='feature_hw_silt_heap',
        w=>feature(w,'feature_hw_channel').state.loosenedSiltGrams=9000,
        w=>feature(w,'feature_hw_cup').name='渡口取水凹池',
        w=>w.spells.find(x=>x.mechanism==='irrigate').effectSpec.power=21,
        w=>w.spells.find(x=>x.mechanism==='condense').effectSpec.unit='litre',
        w=>w.locations.find(x=>x.id==='bld_bs_dock').parent='loc_bs_yupo',
        w=>w.locations.find(x=>x.id==='loc_bs_hebu').parent='loc_bs_hebu'];
    for(const alter of changes){const bad=structuredClone(world);alter(bad);assert.equal(validateWorld(bad).ok,false);}
});

test('查看环境与局部走近不暴露可变世界引用，登记键冲突不覆盖既有记录',async()=>{
    const{world,engine,document,run,spell}=await setup(),before=structuredClone(world);
    const view=catalogDefinition(engine,document,{entity:'feature_hw_channel'});view.position[0]=999;view.links.source='fake';assert.deepEqual(world,before);
    const approached=await run(document,'world_environment',{operation:'approach',target:'引水沟'},'readonly_move');
    approached.result.position[0]=777;assert.deepEqual(world,before);
    document.state.records['physical_feature:feature_hw_cup']={category:'contract',content:'旧契约'};
    const original=structuredClone(document);await assert.rejects(cast(run,document,spell('condense'),'公用水盏'),/冲突/);assert.deepEqual(document,original);
});

test('私有引水网络逐个检查源头、沟渠与田垄许可，多个有效授权可共同使用',async()=>{
    const{world,document,spell}=await setup();
    const privateIds=['feature_hw_pool','feature_hw_channel','feature_hw_plot'];
    for(const row of world.locations.find(x=>x.id==='loc_hw_dock').features)if(privateIds.includes(row.id)){row.owner='npc_hw_linsui';row.access='consent';}
    const engine=new WorldEngine(world),run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    for(const[id,index]of privateIds.map((id,index)=>[id,index]))document.state.records[`permit_${index}`]={category:'authorization',subject:id,action:'environment_use',grantor:'npc_hw_linsui',expires:document.state.minute+30};
    await assert.rejects(cast(run,document,spell('irrigate'),'引水沟',true,{authorization:'permit_1'}),/授权/);
    const out=await cast(run,document,spell('irrigate'),'引水沟',true,{authorizations:['permit_0','permit_1','permit_2']});
    assert.equal(out.result.movedMl,6000);assert.equal(state(out.document,world,'feature_hw_pool').waterMl,24000);
});
