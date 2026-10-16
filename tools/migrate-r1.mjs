import fs from'node:fs/promises';
import{tmpRoot}from'./tmp-root.mjs';
import path from'node:path';
import {pathToFileURL}from'node:url';
import {CampaignStorage,digest}from'../server-plugin/storage.mjs';
import {WorldRegistry}from'../server-plugin/world-registry.mjs';
import {archivedReducer}from'../server-plugin/archived-reducer.mjs';

// Portable server exports only. Source history is verified by replay before R1.
export async function migrateR1Export(input,output){
    const source=path.resolve(input),destination=path.resolve(output);
    if([source,destination].some(file=>path.basename(file).toLowerCase()==='secrets.json'))throw new Error('拒绝接触密钥文件');
    if(source.toLowerCase()===destination.toLowerCase())throw new Error('必须使用独立输出副本');
    try{await fs.access(destination);throw new Error('输出已存在，拒绝覆盖');}catch(error){if(error.code!=='ENOENT')throw error;}
    const bytes=await fs.readFile(source),bundle=JSON.parse(bytes);
    if(bundle.format!=='infinite-fields-server-v2'||!bundle.initial?.worldHash)throw new Error('需要含世界归档的服务器导出；旧聊天请使用副本启用入口');
    const scratch=await fs.mkdtemp(path.join(tmpRoot(),'fields-r1-export-'));
    try{
        const registry=new WorldRegistry(path.join(scratch,'worlds'));
        for(const[hash,world]of Object.entries(bundle.worlds??{})){
            if(digest(world)!==hash)throw new Error('世界归档校验失败');await registry.put(world);
        }
        const store=new CampaignStorage(path.join(scratch,'campaigns'),{reducer:archivedReducer(registry)});
        await store.import(bundle,'copy');
        const migrated=await store.transact('copy',{id:'release_r1',input:{type:'release_migration',release:'R1'},anchor:null},store.reducer);
        const exported=await store.export('copy');exported.worlds=bundle.worlds;
        const roundtrip=await store.import(exported,'roundtrip');
        if(digest(roundtrip.document)!==exported.documentHash)throw new Error('R1 往返校验失败');
        if(!(await fs.readFile(source)).equals(bytes))throw new Error('迁移期间源文件已改变，拒绝输出');
        exported.r1MigrationReport={...migrated.result,sourceUnchanged:true,sourceEvents:bundle.events.length,exportImportEqual:true};
        await fs.writeFile(destination,JSON.stringify(exported,null,2)+'\n',{flag:'wx'});
        return exported.r1MigrationReport;
    }finally{
        const resolved=await fs.realpath(scratch),temp=await fs.realpath(tmpRoot());
        if(path.dirname(resolved).toLowerCase()!==temp.toLowerCase()||!path.basename(resolved).startsWith('fields-r1-export-'))throw new Error('临时路径校验失败');
        await fs.rm(resolved,{recursive:true,force:true});
    }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
    const[input,output,...extra]=process.argv.slice(2);
    if(!input||!output||extra.length)throw new Error('用法：node tools/migrate-r1.mjs 原导出.json 新副本.json');
    console.log(JSON.stringify(await migrateR1Export(input,output)));
}
