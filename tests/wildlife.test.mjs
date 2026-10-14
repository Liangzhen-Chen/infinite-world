import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {loadWorld} from '../tools/load-world.mjs';
import {withWildlife,wildlifeFoundation} from '../world/design/wildlife-foundation.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches} from '../server-plugin/storage.mjs';
import {planWildlifeMigration} from '../server-plugin/wildlife-migration.mjs';
import {planRuleStateMigration} from '../server-plugin/rule-state-migration.mjs';
import {wildlifePriceFactor} from '../server-plugin/wildlife.mjs';
import {validateWorld} from '../tools/validate-world.mjs';
import {monsterStats} from '../server-plugin/combat.mjs';
import {wildlifeLoreIssues,wildlifeLoreSchema} from '../tools/wildlife-content.mjs';
import {readStateSection} from '../extension/state-read.mjs';
const legacy=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const source=withWildlife(await loadWorld());
function setup(){const world=structuredClone(source),engine=new WorldEngine(world),fresh=engine.createCharacter(legacy,{},'wildlife-test'),c=applyPatches(fresh,planRuleStateMigration(fresh,world.rules));c.state.minute=1200;
    const run=async(doc,tool,args,id)=>{const out=await engine.reduce(doc,{tool,args,eventId:id});return{document:applyPatches(doc,out.patches),result:out.result};};return{world,engine,c,run};}
const ecology=(c,h='habitat_hw_wood')=>c.state.records[`ecology:${h}`];
function conservation(c){for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations)){
    assert.equal(p.initial+p.born+(p.arisen??0)-p.predated-p.starved-p.withdrawn,p.count);assert.ok(p.count>=0);
}}
async function track(run,c,species='monster_red_ear_fox',label='track'){
    for(let i=0;i<60;i++){const out=await run(c,'world_wildlife',{operation:'track',species},`${label}${i}`);if(out.result.success)return out;}
    throw new Error('隔离检定夹具没有找到成功种子');
}
test('50物种骨架、等级带、栖地、食物和捕食引用有效，错误数据拒绝',()=>{
    assert.equal(wildlifeFoundation().monsters.length,50);assert.equal(validateWorld(source).ok,true);
    for(const mutate of [w=>w.monsters[0].levelRange=[1,30],w=>w.monsters[0].wildlife.population=1000,
        w=>w.monsters[0].wildlife.predatorOf=['monster_missing'],w=>w.monsters[0].wildlife.habitat='habitat_missing',
        w=>w.rules.wildlife.habitats[0].location='loc_missing',w=>w.monsters[0].wildlife.gather.tool='item_missing']){
        const bad=structuredClone(source);mutate(bad);assert.equal(validateWorld(bad).ok,false);
    }
});
test('鸣叫引号不会误判人类台词；野兽人类台词仍拒绝，字数门槛不降低',()=>{
    const bone=source.monsters[0],row=Object.fromEntries(Object.entries(wildlifeLoreSchema.properties).map(([key,s])=>[key,key==='id'?bone.id:'声'.repeat(s.minLength)]));
    row.voice='低声的“唧、唧、唧——啾”随尾巴摆动，踏足时又转为一声尖鸣，随后低头寻找藏穴。';assert.deepEqual(wildlifeLoreIssues(row,bone),[]);
    row.voice='它直视旅人说：“你别走，我要跟你谈谈。”随后把一只前足搭在树根上，等对方停下。';assert.ok(wildlifeLoreIssues(row,bone).some(e=>e.includes('人类台词')));
    row.appearance='太短';assert.ok(wildlifeLoreIssues(row,bone).some(e=>e.includes('minLength')));
});
test('旧文档迁移只建立当前种群，不改人物、财物、时钟和记忆，幂等且拒绝冲突',()=>{
    const{engine}=setup(),old=engine.initialFromLegacy(legacy,'wildlife-import',{prepare:false});old.state.minute=100*1440;const before=structuredClone(old);
    const migrated=applyPatches(old,planWildlifeMigration(old,engine.rules,engine.world.monsters));assert.deepEqual(old,before);
    for(const key of ['player','inventory','npcs','settlements','minute'])assert.deepEqual(migrated.state[key],before.state[key]);assert.deepEqual(migrated.memories,before.memories);
    assert.equal(ecology(migrated).initializedDay,100);assert.equal(ecology(migrated).lastDay,99);conservation(migrated);
    assert.deepEqual(planWildlifeMigration(migrated,engine.rules,engine.world.monsters),[]);ecology(migrated).format=2;
    assert.throws(()=>planWildlifeMigration(migrated,engine.rules,engine.world.monsters),/冲突/);
});
test('观察只列真实在场个体，不生成动物或泄漏未见种群；异地不能隔空追踪',async()=>{
    const{c,run}=setup();c.state.location='loc_hw_northwood';const before=structuredClone(c),out=await run(c,'world_wildlife',{operation:'observe'},'observe');
    assert.deepEqual(out.document,before);assert.deepEqual(out.result.animals,[]);assert.equal(out.result.populations,undefined);
    const records=readStateSection(c.state,'记录');assert.equal(records.ok,undefined);
    assert.ok(Object.values(records).every(r=>r.category!=='ecology'));assert.deepEqual(c,before);
    c.state.location='bld_hw_qingdeng';await assert.rejects(run(c,'world_wildlife',{operation:'track',species:'monster_red_ear_fox'},'remote'),/栖地/);
});
test('实际追踪扣有限种群、耗时并建独立实例；同名多只要显式编号',async()=>{
    const{c,run}=setup();c.state.location='loc_hw_northwood';const first=await track(run,c),second=await track(run,first.document,'monster_red_ear_fox','second');
    assert.notEqual(first.result.found.id,second.result.found.id);assert.equal(first.document.state.minute,c.state.minute+60);
    assert.equal(ecology(second.document).populations.monster_red_ear_fox.count,source.monsters.find(s=>s.id==='monster_red_ear_fox').wildlife.population-2);conservation(second.document);
    const before=structuredClone(second.document);await assert.rejects(run(second.document,'world_pet',{operation:'inspect',target:'赤耳林狐'},'ambiguous'),/多个同名/);
    assert.deepEqual(second.document,before);const out=await run(second.document,'world_pet',{operation:'inspect',target:first.result.found.id},'one');assert.equal(out.result.target,first.result.found.id);
    assert.deepEqual(second.document.state.inventory,c.state.inventory);
});
test('无种群或休眠时段不能靠目录召出动物，种群不会在空栖地原地重生',async()=>{
    const{c,run}=setup();c.state.location='loc_hw_northwood';const p=ecology(c).populations.monster_red_ear_fox;p.withdrawn=p.count;p.count=0;
    await assert.rejects(run(c,'world_wildlife',{operation:'track',species:'monster_red_ear_fox'},'none'),/活动线索/);
    const later=(await run(c,'world_time',{minutes:30*1440},'month')).document;assert.equal(ecology(later).populations.monster_red_ear_fox.count,0);conservation(later);
    const sleeping=setup().c;sleeping.state.location='loc_hw_northwood';sleeping.state.minute=540;await assert.rejects(run(sleeping,'world_wildlife',{operation:'track',species:'monster_red_ear_fox'},'sleep'),/活动线索/);
});
test('周度出生与捕食、饥饿死亡改变实际种群；长短等待全年一致',async()=>{
    const{c,run}=setup();let long=c,split=c;
    for(let i=0;i<12;i++)long=(await run(long,'world_time',{minutes:30*1440},`m${i}`)).document;
    for(let i=0;i<360;i++)split=(await run(split,'world_time',{minutes:1440},`d${i}`)).document;
    for(const h of source.rules.wildlife.habitats)assert.deepEqual(ecology(long,h.id),ecology(split,h.id));conservation(long);
    assert.ok(ecology(long).populations.monster_leaf_hare.predated>0);
    for(const h of source.rules.wildlife.habitats)for(const [id,p]of Object.entries(ecology(long,h.id).populations))assert.ok(p.count>0,`未受猎杀种群应保持存续 ${id}`);
    const hungry=structuredClone(c),prey=ecology(hungry).populations.monster_leaf_hare;prey.withdrawn=prey.count;prey.count=0;
    const starvation=(await run(hungry,'world_time',{minutes:30*1440},'starvation')).document;assert.ok(ecology(starvation).populations.monster_grey_ridge_wolf.starved>0);conservation(starvation);
});
test('怪物生命整数化兼容照料；驯兽不反击也不给野外经验',async()=>{
    const{engine,c,run}=setup();for(let level=0;level<=200;level++)for(const tier of [0,1])assert.ok(Number.isInteger(monsterStats({level,template:2,bossTier:tier},engine.rules).maxHp));
    assert.equal(monsterStats({level:1,template:0},engine.rules).attacks,0);
    c.state.location='loc_hw_northwood';const out=await track(run,c);const id=out.result.found.id;out.document.state.creatures[id].owner='player';out.document.state.creatures[id].hp=1;
    // Combat boundary fixture gives the player high HP; not a normal levelling demonstration.
    out.document.state.player.level=30;out.document.state.player.hp=500;out.document.state.player.maxHp=500;
    let doc=out.document;for(let i=0;i<40&&doc.state.creatures[id].status!=='死亡';i++)doc=(await run(doc,'world_combat',{target:id},`kill_owned${i}`)).document;
    assert.equal(doc.state.player.xp,c.state.player.xp);assert.equal(doc.state.creatures[id].status,'死亡');
});
test('击杀不自动掉进背包；取材需要刀水，已处理或腐坏尸体不能刷',async()=>{
    const{c,run}=setup();c.state.location='loc_hw_northwood';const out=await track(run,c);const id=out.result.found.id;let doc=out.document;
    // Isolated short-combat fixture, preserves actual tracked instance and stock withdrawal.
    doc.state.creatures[id].hp=1;doc.state.player.level=30;doc.state.player.hp=500;doc.state.player.maxHp=500;
    for(let i=0;i<40&&doc.state.creatures[id].status!=='死亡';i++)doc=(await run(doc,'world_combat',{target:id},`kill${i}`)).document;
    assert.equal(doc.state.creatures[id].status,'死亡');assert.equal(doc.state.inventory.item_rawhide,undefined);
    await assert.rejects(run(doc,'world_wildlife',{operation:'gather',target:id},'no_tools'),/刀具/);
    doc.state.inventory.item_kitchen_knife={quantity:1};doc.state.inventory.item_water={quantity:1};
    const expired=structuredClone(doc);expired.state.minute=expired.state.creatures[id].corpse.expires;
    await assert.rejects(run(expired,'world_wildlife',{operation:'gather',target:id},'expired'),/腐坏/);
    let gathered;for(let i=0;i<60;i++){gathered=await run(doc,'world_wildlife',{operation:'gather',target:id},`skin${i}`);if(gathered.result.success)break;}
    assert.equal(gathered.result.success,true);assert.equal(gathered.document.state.inventory.item_rawhide.quantity,1);assert.equal(gathered.document.state.inventory.item_water,undefined);
    assert.equal(gathered.document.state.minute,doc.state.minute+20);conservation(gathered.document);
    await assert.rejects(run(gathered.document,'world_wildlife',{operation:'gather',target:id},'twice'),/已处理/);
});
test('猎物变少使相关材料基础报价上涨，其他物品与旧世界不变',()=>{
    const{engine,c,world}=setup();assert.equal(wildlifePriceFactor(engine,c,'item_rawhide','loc_hw'),1);
    for(const r of Object.values(c.state.records).filter(r=>r.category==='ecology'))for(const p of Object.values(r.populations)){p.withdrawn=p.count;p.count=0;}
    assert.equal(wildlifePriceFactor(engine,c,'item_rawhide','loc_hw'),2);assert.equal(wildlifePriceFactor(engine,c,'item_bread','loc_hw'),1);
    delete world.rules.wildlife;assert.equal(wildlifePriceFactor(new WorldEngine(world),c,'item_rawhide','loc_hw'),1);
});
test('仅追踪活体不使材料涨价；实际死亡或驯服才减少野外资源',async()=>{
    const{engine,c,run}=setup();c.state.location='loc_hw_northwood';
    const tracked=await track(run,c),doc=tracked.document,id=tracked.result.found.id;
    assert.equal(wildlifePriceFactor(engine,doc,'item_rawhide','loc_hw'),1);
    const dead=structuredClone(doc);dead.state.creatures[id].hp=0;dead.state.creatures[id].status='死亡';
    assert.ok(wildlifePriceFactor(engine,dead,'item_rawhide','loc_hw')>1);
    const pet=structuredClone(doc);pet.state.creatures[id].owner='player';assert.ok(wildlifePriceFactor(engine,pet,'item_rawhide','loc_hw')>1);
});
test('动物实例、生态账与尸体状态在存储重启/导入导出/删除消息回滚中一致',async t=>{
    const{engine,c,run}=setup();c.state.location='loc_hw_northwood';
    const tracked=await track(run,c),start=tracked.document,id=tracked.result.found.id;
    start.state.creatures[id].hp=1;start.state.player.level=30;start.state.player.hp=500;start.state.player.maxHp=500;
    const directory=await fs.mkdtemp(path.join(os.tmpdir(),'wildlife-store-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const reducer=(doc,input)=>engine.reduce(doc,input),store=new CampaignStorage(directory,{reducer});await store.create({id:'wild',worldVersion:engine.world.version,document:start});
    for(let i=0;i<40;i++){
        if((await store.read('wild')).document.state.creatures[id].status==='死亡')break;
        await store.transact('wild',{id:`kill${i}`,anchor:'a1',input:{tool:'world_combat',args:{target:id},eventId:`kill${i}`}},reducer);
    }
    const saved=(await store.read('wild')).document;assert.deepEqual((await new CampaignStorage(directory,{reducer}).read('wild')).document,saved);conservation(saved);
    assert.equal(saved.state.creatures[id].status,'死亡');assert.equal(saved.state.creatures[id].corpse.status,'未取材');
    assert.deepEqual((await store.import(await store.export('wild'),'copy')).document,saved);assert.deepEqual((await store.reconcile('wild',[],null)).document,start);
});
test('生态迁移CLI只写独立副本，保留旧动物/记忆，重复输出或密钥路径拒绝',async t=>{
    const{engine}=setup(),base=path.resolve(os.tmpdir()),directory=await fs.mkdtemp(path.join(base,'wildlife-migration-'));
    assert.ok(path.resolve(directory).startsWith(base+path.sep));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
    const old=engine.initialFromLegacy(legacy,'wildlife-cli',{prepare:false});old.state.minute=100*1440;
    old.state.creatures={old_animal:{name:'旧动物',species:'monster_red_ear_fox',hp:8,maxHp:8,status:'正常',owner:'player',location:'loc_hw_northwood'}};
    const bytes=JSON.stringify(old),input=path.join(directory,'old.json'),output=path.join(directory,'new.json');await fs.writeFile(input,bytes);
    const command=(a,b)=>spawnSync(process.execPath,['tools/migrate-wildlife.mjs',a,b],{encoding:'utf8'});
    const result=command(input,output);assert.equal(result.status,0,result.stderr);assert.equal(await fs.readFile(input,'utf8'),bytes);
    const saved=await fs.readFile(output,'utf8'),migrated=JSON.parse(saved);
    assert.deepEqual(migrated.memories,old.memories);assert.deepEqual(migrated.state.creatures,old.state.creatures);
    assert.deepEqual(migrated.state.player,old.state.player);assert.deepEqual(migrated.state.inventory,old.state.inventory);
    assert.equal(ecology(migrated).initializedDay,100);assert.equal(ecology(migrated).lastDay,99);
    assert.equal(Object.values(migrated.state.records).filter(r=>r.category==='ecology').length,(await loadWorld()).rules.wildlife.habitats.length);
    assert.notEqual(command(input,output).status,0);assert.equal(await fs.readFile(output,'utf8'),saved);
    assert.notEqual(command(input,input).status,0);const forbidden=command(path.join(directory,'secrets.json'),path.join(directory,'forbidden.json'));
    assert.notEqual(forbidden.status,0);assert.match(forbidden.stderr,/拒绝接触密钥/);
});
