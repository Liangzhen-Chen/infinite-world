import path from'node:path';
import {fileURLToPath}from'node:url';
import {CampaignStorage,atomicJSON}from'../server-plugin/storage.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {planRuleStateMigration,runtimeRuleVersion}from'../server-plugin/rule-state-migration.mjs';
import {archivedReducer}from'../server-plugin/archived-reducer.mjs';

export async function migrateRuleState(store,id,engine){
    const view=await store.read(id),patches=planRuleStateMigration(view.document,engine.rules);
    if(!patches.length)return{changed:false};
    const backup=path.join(store.directory(id),`before-rule-state-${view.reference.sequence}.json`);
    const bundle=await store.export(id);
    if(store.worldRegistry){
        const hashes=new Set([bundle.initial.worldHash,...bundle.events.flatMap(event=>[event.input?.worldHash,event.result?.worldHash])].filter(Boolean));
        bundle.worlds={};for(const hash of hashes)bundle.worlds[hash]=(await store.worldRegistry.get(hash)).world;
    }
    await atomicJSON(backup,bundle);
    const eventId=`rules_state_${runtimeRuleVersion}_${view.reference.sequence}`;
    await store.transact(id,{id:eventId,input:{type:'rules_state_migration',eventId},expectedSequence:view.reference.sequence},store.reducer);
    const after=await store.read(id);
    if(after.document.state.runtimeRuleVersion!==runtimeRuleVersion)throw new Error('规则迁移未写入版本，停止后续操作');
    return{changed:true,backup,reference:after.reference};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
    // Offline utility: do not share a store with a running server process.
    // The server applies the same additive migration inside its own transaction.
    const[root,id]=process.argv.slice(2);if(!root||!id)throw new Error('用法：node tools/migrate-rule-state.mjs 存档目录 战役编号');
    const registry=new WorldRegistry(path.join(path.dirname(path.resolve(root)),'infinite-fields-worlds'));
    const store=new CampaignStorage(root,{reducer:archivedReducer(registry)});store.worldRegistry=registry;
    const view=await store.read(id),engine=await registry.get(view.document.worldHash);
    console.log(JSON.stringify(await migrateRuleState(store,id,engine)));
}
