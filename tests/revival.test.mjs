import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import{tmpRoot}from'../tools/tmp-root.mjs';
import path from'node:path';
import {loadWorld}from'../tools/load-world.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {CampaignStorage,applyPatches}from'../server-plugin/storage.mjs';
import {planRuleStateMigration}from'../server-plugin/rule-state-migration.mjs';
import {migrateRuleState}from'../tools/migrate-rule-state.mjs';
import {validateWorld}from'../tools/validate-world.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {archivedReducer}from'../server-plugin/archived-reducer.mjs';
import {execFile}from'node:child_process';
import {promisify}from'node:util';
const seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
async function setup(){
    const world=await loadWorld(),engine=new WorldEngine(world),document=engine.initialFromLegacy(seed,'revival-test');
    const run=async(c,tool,args,id)=>{const out=await engine.reduce(c,{tool,args,eventId:id});return{document:applyPatches(c,out.patches),result:out.result};};
    return{world,engine,document,run};
}
test('复活登记须亲自在祭坛，等级和费用满足，收支守恒且再次登记不重复收费',async()=>{
    const{document,run}=await setup(),before=structuredClone(document);
    await assert.rejects(run(document,'world_revival',{location:'白石归途殿'},'remote'),/亲自/);assert.deepEqual(document,before);
    document.state.location='bld_bs_shrine';document.state.player.level=4;
    await assert.rejects(run(document,'world_revival',{},'low'),/5级/);
    document.state.player.level=5;document.state.player.coins=29;
    const poor=structuredClone(document);await assert.rejects(run(document,'world_revival',{},'poor'),/费用不足/);assert.deepEqual(document,poor);
    document.state.player.coins=100;
    const registered=await run(document,'world_revival',{},'register');assert.equal(registered.result.fee,30);
    assert.equal(registered.document.state.player.coins,70);assert.equal(registered.document.state.shrineTreasuries.bld_bs_shrine,30);
    assert.equal(registered.document.state.minute,555);assert.equal(registered.document.state.player.revivalAnchor,'bld_bs_shrine');
    assert.ok(registered.document.state.revivalPoints.bld_hw_altar);assert.ok(registered.document.state.revivalPoints.bld_bs_shrine);
    const duplicate=await run(registered.document,'world_revival',{},'again');assert.equal(duplicate.result.fee,0);
    assert.equal(duplicate.document.state.player.coins,70);assert.equal(duplicate.document.state.minute,555);
});
test('濒死倒计时不因追加伤害重置，不能移动交易或攻击，超时死亡只扣一次经验',async()=>{
    const{document,run}=await setup();document.state.player.xp=100;
    let c=(await run(document,'world_health',{delta:-12},'wound')).document;
    c=(await run(c,'world_time',{minutes:9},'wait')).document;
    const before=structuredClone(c);
    for(const[tool,args]of[['world_move',{destination:'河湾村'}],['world_trade',{seller:'林穗',service:'住宿'}],['world_combat',{target:'林穗'}]])await assert.rejects(run(c,tool,args,'incapacitated'),/濒死/);
    assert.deepEqual(c,before);
    c=(await run(c,'world_health',{delta:-1},'another-wound')).document;assert.equal(c.state.player.dyingSince,540);
    c=(await run(c,'world_time',{minutes:1},'timeout')).document;
    assert.equal(c.state.player.status,'死亡');assert.equal(c.state.player.xp,90);
    const repeated=await run(c,'world_turn',{startMinute:550,minutes:1},'dead-tail');assert.equal(repeated.document.state.player.xp,90);
});
test('复活只到已登记祭坛，恢复一半生命魔力；同伴留在死亡地，损毁时使用其他登记点',async()=>{
    const{document,run}=await setup();document.state.location='bld_bs_shrine';document.state.player.level=5;
    let c=(await run(document,'world_revival',{},'register')).document;
    c.state.location='loc_hw_northwood';c.state.player.companions=['npc_hw_wushuo'];c.state.npcs.npc_hw_wushuo.location='loc_hw_northwood';
    c=(await run(c,'world_health',{delta:-100},'fatal')).document;
    assert.equal(c.state.player.status,'死亡');assert.deepEqual(c.state.player.companions,[]);
    const revived=await run(c,'world_time',{minutes:1},'wake');assert.equal(revived.document.state.location,'bld_bs_shrine');
    assert.equal(revived.document.state.player.hp,6);assert.equal(revived.document.state.player.mp,5);
    assert.equal(revived.document.state.npcs.npc_hw_wushuo.location,'loc_hw_northwood');
    c.state.buildings.bld_bs_shrine={condition:0};
    const fallback=await run(c,'world_time',{minutes:1},'fallback');assert.equal(fallback.document.state.location,'bld_hw_altar');
    c.state.buildings.bld_hw_altar={condition:0};
    const ruins=await run(c,'world_time',{minutes:1},'none');assert.equal(ruins.document.state.player.status,'正常');
    assert.equal(ruins.document.state.location,'bld_hw_altar');
});
async function dieAt(location,edit){
    const{document,run}=await setup();document.state.location='bld_bs_shrine';document.state.player.level=5;
    let c=(await run(document,'world_revival',{},'register')).document;
    c.state.location=location;edit(c);
    c=(await run(c,'world_health',{delta:-100},'fatal')).document;assert.equal(c.state.player.status,'死亡');
    return run(c,'world_time',{minutes:1},'wake');
}
test('没有登记点时复活到离死亡地最近的可用点，而不是规则表里第一个；同档同输入结果一致',async()=>{
    const edit=c=>{c.state.player.revivalAnchor=null;};
    const a=await dieAt('bld_bs_shrine',edit),b=await dieAt('bld_bs_shrine',edit);
    assert.equal(a.document.state.location,'bld_bs_shrine');assert.deepEqual(a.document,b.document);
    assert.equal((await dieAt('loc_hw_northwood',edit)).document.state.location,'bld_hw_altar');
});
test('登记点被毁时去最近的可用点，并说明登记点被改写',async()=>{
    const r=await dieAt('loc_hw_northwood',c=>{c.state.buildings.bld_bs_shrine={condition:0};});
    assert.equal(r.document.state.location,'bld_hw_altar');assert.equal(r.document.state.player.revivalAnchor,'bld_hw_altar');
    assert.match(JSON.stringify(r),/已不可用.*登记点改为/);
});
test('没有可用复活点时仍不会永久死亡，如实说明是未登记还是废墟，且不改写登记点',async()=>{
    const unreg=await dieAt('bld_bs_shrine',c=>{c.state.revivalPoints={};});
    assert.equal(unreg.document.state.player.status,'正常');assert.equal(unreg.document.state.location,'bld_bs_shrine');
    assert.equal(unreg.document.state.player.revivalAnchor,'bld_bs_shrine');assert.match(JSON.stringify(unreg),/尚未登记/);
    const ruined=await dieAt('loc_hw_northwood',c=>{c.state.buildings.bld_bs_shrine={condition:0};c.state.buildings.bld_hw_altar={condition:0};});
    assert.equal(ruined.document.state.player.status,'正常');assert.equal(ruined.document.state.location,'bld_hw_altar');
    assert.match(JSON.stringify(ruined),/废墟中醒来/);
});
test('永久死亡居民不能交易、发布或接收任务物品，资金和库存不改动',async()=>{
    const{document,run}=await setup();
    const publish={operation:'publish',publisher:'林穗',personal:true,grade:'D',reward:20,content:'补货',objective:{type:'deliver',item:'干粮',quantity:1}};
    const posted=await run(document,'world_quest',publish,'post');
    const accepted=await run(posted.document,'world_quest',{operation:'accept',quest:posted.result.quest},'take');
    accepted.document.state.npcs.npc_hw_linsui.status='死亡';const before=structuredClone(accepted.document);
    await assert.rejects(run(accepted.document,'world_quest',{operation:'complete',quest:posted.result.quest},'dead-delivery'),/无法接收/);
    await assert.rejects(run(accepted.document,'world_quest',publish,'dead-publisher'),/清醒履约/);
    await assert.rejects(run(accepted.document,'world_trade',{seller:'林穗',service:'住宿'},'dead-trade'),/清醒履约/);
    assert.deepEqual(accepted.document,before);assert.equal(before.state.quests[posted.result.quest].escrow,20);
});
test('规则分区迁移保留旧财物、关系和记忆，有备份、可重启及导入回退，重复迁移无变化',async t=>{
    const{world,engine}=await setup(),document=engine.initialFromLegacy(seed,'old-rule',{prepare:false}),before=structuredClone(document);
    document.memories.promise={content:'林穗答应借厨房。'};document.state.npcs.npc_hw_linsui.trust=40;
    const dir=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-rule-migrate-'));t.after(()=>fs.rm(dir,{recursive:true,force:true}));
    const reducer=(c,input)=>engine.reduce(c,input),store=new CampaignStorage(dir,{reducer});
    await store.create({id:'original',worldVersion:world.version,document});
    const out=await migrateRuleState(store,'original',engine);assert.equal(out.changed,true);
    const migrated=(await new CampaignStorage(dir,{reducer}).read('original')).document;
    for(const key of['player','inventory','npcs','skills','spells','records'])assert.deepEqual(migrated.state[key],document.state[key]);
    assert.deepEqual(migrated.memories,document.memories);assert.equal(migrated.state.runtimeRuleVersion,2);
    assert.equal(migrated.state.revivalPoints.bld_hw_altar.fee,0);assert.deepEqual(planRuleStateMigration(migrated,engine.rules),[]);
    assert.equal((await migrateRuleState(store,'original',engine)).changed,false);
    assert.deepEqual((await store.import(JSON.parse(await fs.readFile(out.backup,'utf8')),'restored')).document,document);
    assert.equal(document.state.runtimeRuleVersion,undefined);assert.equal(before.state.runtimeRuleVersion,undefined);
    const upgradedBundle=await store.export('original');assert.deepEqual((await store.import(upgradedBundle,'copy')).document,migrated);
});
test('复活点世界数据的错聚落、重复、收费负值与缺少新手点阻止构建',async()=>{
    const{world}=await setup();assert.equal(validateWorld(world).ok,true);
    for(const change of[
        w=>w.rules.death.points[0].settlement='loc_bs',w=>w.rules.death.points.push({...w.rules.death.points[0]}),
        w=>w.rules.death.points[0].fee=-1,w=>w.rules.death.points[0].minimumLevel=1,
    ]){const bad=structuredClone(world);change(bad);assert.equal(validateWorld(bad).ok,false);}
});

test('死亡居民的到期付款记录违约，钱不转移，也不能新增带路承诺',async()=>{
    const{document,run}=await setup();
    const promised=await run(document,'world_promise',{promisor:'林穗',type:'付款',content:'归还十铜',coins:10,deadline:541},'promise');
    promised.document.state.npcs.npc_hw_linsui.status='死亡';
    const checked=await run(promised.document,'world_time',{minutes:1},'deadline');
    assert.equal(checked.document.state.obligations.obl_promise.status,'违约');
    assert.equal(checked.document.state.player.coins,180);assert.equal(checked.document.state.npcs.npc_hw_linsui.coins,450);
    await assert.rejects(run(checked.document,'world_promise',{promisor:'林穗',type:'带路',destination:'河湾村',content:'出去看看'},'ghost-guide'),/清醒履约/);
});

test('独立迁移命令重放世界升级历史，备份附所需世界版本，旧档原初快照保留',async t=>{
    const{world,engine}=await setup(),document=engine.initialFromLegacy(seed,'old-rule-cli',{prepare:false});
    const root=await fs.mkdtemp(path.join(tmpRoot(),'infinite-fields-rule-cli-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const registry=new WorldRegistry(path.join(root,'infinite-fields-worlds')),store=new CampaignStorage(path.join(root,'infinite-fields'),{reducer:archivedReducer(registry)});
    document.worldHash=await registry.put(world);await store.create({id:'cli',worldVersion:world.version,document});
    const incoming=structuredClone(world);incoming.version='migration-world-next';
    const incomingHash=await registry.put(incoming);
    await store.transact('cli',{id:'upgrade',input:{type:'world_upgrade',worldHash:incomingHash,eventId:'upgrade'}},store.reducer);
    const before=await store.export('cli');
    const{stdout}=await promisify(execFile)(process.execPath,['tools/migrate-rule-state.mjs',store.root,'cli'],{cwd:process.cwd()});
    const result=JSON.parse(stdout);assert.equal(result.changed,true);
    const restarted=new CampaignStorage(store.root,{reducer:archivedReducer(registry)});
    const after=await restarted.read('cli');assert.equal(after.document.state.runtimeRuleVersion,2);
    assert.equal(after.document.worldVersion,'migration-world-next');assert.deepEqual(after.document.state.player,document.state.player);
    const backup=JSON.parse(await fs.readFile(result.backup,'utf8'));assert.deepEqual(backup.initial,before.initial);
    assert.equal(backup.events.length,before.events.length);assert.equal(Object.keys(backup.worlds).length,2);
    assert.equal(JSON.parse((await promisify(execFile)(process.execPath,['tools/migrate-rule-state.mjs',store.root,'cli'],{cwd:process.cwd()})).stdout).changed,false);
});
