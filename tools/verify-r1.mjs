import fs from'node:fs/promises';
import path from'node:path';
import assert from'node:assert/strict';
import {CampaignStorage,applyPatches,digest}from'../server-plugin/storage.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {archivedReducer}from'../server-plugin/archived-reducer.mjs';
import {migrateLegacyChat}from'../server-plugin/migrations.mjs';
import {planR1}from'../server-plugin/migrations/r1.mjs';
import {loadWorld}from'./load-world.mjs';

const root=path.resolve(import.meta.dirname,'..'),world=await loadWorld();
const seed=JSON.parse(await fs.readFile(path.join(root,'tests/fixtures/legacy/seed.json'),'utf8'));
const destination=path.join(root,'backups',`r1-rehearsal-${Date.now()}`),registry=new WorldRegistry(path.join(destination,'worlds'));
const worldHash=await registry.put(world),engine=await registry.get(worldHash),store=new CampaignStorage(path.join(destination,'campaigns'),{reducer:archivedReducer(registry,engine)});
const directory=path.join(root,'SillyTavern/data/default-user/chats/无限原野·世界主持人'),reports=[];
for(const file of(await fs.readdir(directory)).filter(name=>name.endsWith('.jsonl'))){
    const source=path.join(directory,file),bytes=await fs.readFile(source,'utf8');
    const metadata=JSON.parse(bytes.split(/\r?\n/).find(Boolean)).chat_metadata.infinite_fields;
    if(metadata?.format===2)throw new Error('原生格式2聊天需通过服务器导出后使用 migrate-r1；不猜测服务器路径');
    const id=`rehearsal_${reports.length+1}`;await migrateLegacyChat({source,oldSeed:seed,store,id});
    const raw=engine.initialFromLegacy((await store.read(id)).document,'r1-rehearsal',{prepare:false}),expected=planR1(raw,world);
    const migrated=await store.transact(id,{id:'r1',input:{type:'schema_migration',release:'R1',randomSeed:'r1-rehearsal',worldHash},anchor:null},store.reducer);
    const native=(await store.read(id)).document,wanted=applyPatches(raw,expected.patches);wanted.worldHash=worldHash;
    // The source document can retain legacy top-level metadata; compare all converted fields.
    for(const[key,value]of Object.entries(wanted))assert.deepEqual(native[key],value);
    const exported=await store.export(id),imported=await store.import(exported,`${id}_roundtrip`);assert.deepEqual(imported.document,native);
    assert.deepEqual((await new CampaignStorage(store.root,{reducer:store.reducer}).read(id)).document,native);
    let simulated=structuredClone(native);const months=[],opening=structuredClone(native.state.settlements),conservationFailures=[];
    for(let month=1;month<=36;month++){
        const out=await engine.reduce(simulated,{tool:'world_time',args:{minutes:30*1440},eventId:`r1_sim_${month}`});simulated=applyPatches(simulated,out.patches);
        for(const profile of world.rules.agriculture.settlements){
            const settlement=simulated.state.settlements[profile.settlement],record=simulated.state.records[`agriculture:${profile.settlement}`],l=record.ledger;
            if(l.openingFood+l.openingSeed+l.freshProduced+l.harvested+l.donated!==settlement.food+record.field.seedBank+l.eaten+l.spoiled+l.overflow+l.seedSpent+l.sold)conservationFailures.push({month,settlement:profile.settlement});
        }
        months.push({month,population:simulated.state.settlements.loc_hw.population,food:simulated.state.settlements.loc_hw.food,unmetMeals:simulated.state.settlements.loc_hw.unmetMeals??0});
    }
    assert.deepEqual(conservationFailures,[]);assert.equal(await fs.readFile(source,'utf8'),bytes);
    reports.push({file,sourceHash:digest(bytes),migration:migrated.result.releaseReport,originalUnchanged:true,restartEqual:true,exportImportEqual:true,
        agriculture:{years:3,opening,final:simulated.state.settlements,conservation:true,stablePopulation:months.every(row=>row.population===opening.loc_hw.population),noNewMissedMeals:months.every(row=>row.unmetMeals===(opening.loc_hw.unmetMeals??0)),months}});
}
const report={date:new Date().toISOString(),scope:'真实聊天只读，备份目录副本R1迁移；三年仿真不写回副本和用户存档，未补粮；尚未做模型五回合或酒馆验收',destination,worldHash,reports};
await fs.writeFile(path.join(root,'docs/测试报告/最新/R1迁移.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({campaigns:reports.length,originalsUnchanged:reports.every(row=>row.originalUnchanged),conservation:reports.every(row=>row.agriculture.conservation),stablePopulation:reports.every(row=>row.agriculture.stablePopulation),noNewMissedMeals:reports.every(row=>row.agriculture.noNewMissedMeals),destination}));
