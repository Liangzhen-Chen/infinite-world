import test from'node:test';
import assert from'node:assert/strict';
import fs from'node:fs/promises';
import os from'node:os';
import path from'node:path';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {loadWorld}from'../tools/load-world.mjs';
import {applyPatches,CampaignStorage}from'../server-plugin/storage.mjs';
import {planR1}from'../server-plugin/migrations/r1.mjs';
import {campaignReducer}from'../server-plugin/campaign-reducer.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {archivedReducer}from'../server-plugin/archived-reducer.mjs';
import {migrateR1Export}from'../tools/migrate-r1.mjs';
const world=await loadWorld(),engine=new WorldEngine(world),seed=JSON.parse(await fs.readFile('tests/fixtures/legacy/seed.json','utf8'));
const old=()=>engine.initialFromLegacy(seed,'r1-old',{prepare:false});

test('R1 导出迁移验证历史并往返，拒绝覆盖源或已有文件',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-r1-cli-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const registry=new WorldRegistry(path.join(root,'worlds')),document=old();document.worldHash=await registry.put(world);
    const store=new CampaignStorage(path.join(root,'store'),{reducer:archivedReducer(registry)});
    await store.create({id:'old',worldVersion:world.version,document});
    const bundle=await store.export('old');bundle.worlds={[document.worldHash]:world};
    const input=path.join(root,'source.json'),output=path.join(root,'copy.json'),bytes=JSON.stringify(bundle);await fs.writeFile(input,bytes);
    const report=await migrateR1Export(input,output);assert.equal(report.exportImportEqual,true);assert.equal(report.preserved.player,true);
    assert.equal(await fs.readFile(input,'utf8'),bytes);
    const imported=await store.import(JSON.parse(await fs.readFile(output,'utf8')),'result');assert.equal(imported.document.releaseVersion,1);
    await assert.rejects(migrateR1Export(input,input),/独立/);await assert.rejects(migrateR1Export(input,output),/已存在/);
    await assert.rejects(migrateR1Export(path.join(root,'secrets.json'),output),/密钥/);
});

test('R1 一次初始化保留角色、财物和粮食，只改精确旧身份模板，重复迁移无变化',()=>{
    const before=old();before.state.minute=500*1440;before.state.player.coins=137;
    before.memories.custom={subject:'玩家',key:'别号',content:'邻居给我起了再生者这个别号。',pinned:true};
    const original=structuredClone(before),migration=planR1(before,world),after=applyPatches(before,migration.patches);
    assert.deepEqual(before,original);assert.equal(after.releaseVersion,1);
    for(const key of['player','inventory','npcs','skills','spells','minute','location'])assert.deepEqual(after.state[key],before.state[key]);
    assert.equal(after.state.settlements.loc_hw.food,before.state.settlements.loc_hw.food);
    assert.equal(after.state.records['agriculture:loc_hw'].mode,'managed');
    assert.equal(after.state.records['agriculture:loc_hw'].batches.reduce((sum,row)=>sum+row.amount,0),before.state.settlements.loc_hw.food);
    assert.equal(after.state.records['agriculture:loc_hw'].field.seedBank,0);
    assert.match(after.memories['玩家::身份'].content,/成年冒险者/);assert.deepEqual(after.memories.custom,before.memories.custom);
    assert.deepEqual(migration.report.changedMemories,['玩家::身份']);assert.equal(migration.report.foodPreserved,true);
    assert.deepEqual(planR1(after,world).patches,[]);
});

test('旧战役普通写入拒绝隐式迁移，旧事件可核实重放，R1 后撤销与重启仍一致',async t=>{
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'fields-r1-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const reducer=campaignReducer(engine),store=new CampaignStorage(root,{reducer}),document=old();
    const action={tool:'world_trade',args:{seller:'林穗',service:'住宿'},eventId:'old-rent'};
    await assert.rejects(engine.reduce(document,action),/显式迁移/);
    // Replay is a storage-owned option, never accepted from an HTTP request or tool arguments.
    await assert.rejects(engine.reduce(document,{...action,replay:true}),/显式迁移/);
    await store.create({id:'old',worldVersion:world.version,document});
    await store.transact('old',{id:'old-rent',input:action,anchor:'rent'},(doc,input)=>reducer(doc,input,{replay:true}));
    const bundle=await store.export('old'),copy=await store.import(bundle,'copy');
    assert.equal(copy.document.state.player.coins,174);assert.equal(copy.document.releaseVersion,undefined);
    const migrated=await store.transact('copy',{id:'r1',input:{type:'release_migration',release:'R1'},anchor:null},reducer);
    assert.equal(migrated.result.preserved.player,true);
    const after=await store.read('copy');assert.equal(after.document.releaseVersion,1);
    const undone=await store.reconcile('copy',[]);assert.equal(undone.document.state.player.coins,180);assert.equal(undone.document.releaseVersion,1);
    const restarted=new CampaignStorage(root,{reducer});assert.deepEqual((await restarted.read('copy')).document,undone.document);
    assert.equal((await restarted.read('old')).document.releaseVersion,undefined);assert.equal((await restarted.read('old')).document.state.player.coins,174);
});
