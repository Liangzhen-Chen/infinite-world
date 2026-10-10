import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CampaignStorage}from'../server-plugin/storage.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {campaignReducer}from'../server-plugin/campaign-reducer.mjs';
import {migrateLegacyChat}from'../server-plugin/migrations.mjs';
import {loadWorld}from'./load-world.mjs';
const root=path.resolve(import.meta.dirname,'..'),world=await loadWorld(),engine=new WorldEngine(world);
const seed=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
const destination=path.join(root,'backups',`native-migration-verification-${Date.now()}`);
const registry=new WorldRegistry(path.join(destination,'worlds'));const worldHash=await registry.put(world);
const store=new CampaignStorage(path.join(destination,'campaigns'),{reducer:async(document,input)=>{
    const output=await campaignReducer(engine)(document,input);
    if(input.type==='schema_migration')output.patches.push({op:'set',path:['worldHash'],value:input.worldHash});return output;
}});
const directory=path.join(root,'SillyTavern/data/default-user/chats/无限原野·世界主持人'),reports=[];
for(const file of (await fs.readdir(directory)).filter(name=>name.endsWith('.jsonl'))){
    const source=path.join(directory,file),original=await fs.readFile(source,'utf8'),lines=original.split(/\r?\n/).filter(Boolean).map(JSON.parse),old=lines[0].chat_metadata.infinite_fields;
    const id=`native_${reports.length+1}`;
    await migrateLegacyChat({source,oldSeed:seed,store,id});
    await store.transact(id,{id:'schema_v2',input:{type:'schema_migration',randomSeed:'native-test',worldHash}},store.reducer);
    const view=await store.read(id),native=view.document;
    assert.deepEqual(Object.fromEntries(Object.keys(old.state.player).filter(key=>key!=='revivalAnchor').map(key=>[key,native.state.player[key]])),Object.fromEntries(Object.entries(old.state.player).filter(([key])=>key!=='revivalAnchor')));
    for(const [name,count]of Object.entries(old.state.inventory))assert.equal(native.state.inventory[engine.resolve(name,'item')].quantity,count);
    for(const [name,npc]of Object.entries(old.state.npcs)){
        const id=engine.resolve(name,'npc'),actual=native.state.npcs[id];
        assert.equal(actual.trust,npc.trust);assert.equal(actual.affection,npc.affection);assert.equal(actual.location,engine.resolve(npc.location));
        assert.equal(engine.byId.get(id).notes,npc.notes);
    }
    assert.deepEqual(native.memories,old.memories);assert.deepEqual(native.state.records,old.state.records);
    const imported=await store.import(await store.export(id),`copy_${reports.length+1}`);assert.deepEqual(imported.document,native);
    assert.equal(await fs.readFile(source,'utf8'),original);
    reports.push({file,campaignId:id,playerEqual:true,inventoryEqual:true,relationshipsEqual:true,basePersonaEqual:true,memoriesEqual:true,recordsEqual:true,exportImportEqual:true,originalUnchanged:true});
}
const report={date:'2026-10-10',scope:'真实聊天只读副本迁移到永久编号版本；尚未部署',destination,worldHash,reports};
await fs.writeFile('docs/测试报告/阶段1永久编号迁移.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
