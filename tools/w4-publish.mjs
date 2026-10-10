import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {highWildlifeFoundation,withHighWildlife} from '../world/design/high-wildlife-foundation.mjs';
import {readApprovedContent} from './content-pipeline.mjs';
import {wildlifeContext,validateWildlifeDraft} from './w4-content.mjs';
import {validateWorld} from './validate-world.mjs';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';

export async function prepareW4(world,root='world/drafts/w4'){
    const bones=highWildlifeFoundation(),source=JSON.parse(await fs.readFile(`${root}/source.json`,'utf8')),ecology=JSON.parse(await fs.readFile(`${root}/ecology.json`,'utf8'));
    if(source.boneHash!==digest(bones)||!ecology.ok||ecology.boneHash!==source.boneHash||ecology.days<1080||ecology.seeds<20)throw new Error('骨架或三年生态审核已过期');
    const rows=await readApprovedContent(root,bones.monsters,{contextFor:entry=>wildlifeContext(entry,world),revision:'w4-v2'});
    for(const row of rows){const entry=bones.monsters.find(b=>b.id===row.id),errors=validateWildlifeDraft(row,entry,wildlifeContext(entry,world)).errors;if(errors.length)throw new Error(`${row.id}: ${errors.join('；')}`);}
    const incoming=rows.map(row=>({...bones.monsters.find(b=>b.id===row.id),...row}));
    const candidate=withHighWildlife(world,incoming),validation=validateWorld(candidate);
    if(!validation.ok)throw new Error(validation.errors.join('\n'));
    return{candidate,incoming,ecology};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
    if(process.argv.slice(2).some(arg=>arg!=='--publish'))throw new Error('用法：node tools/w4-publish.mjs [--publish]');
    const world=await loadWorld(),{candidate,incoming,ecology}=await prepareW4(world);
    const publish=process.argv.includes('--publish');
    if(publish){
        const files=[['world/meta/monsters.json',candidate.monsters],['world/meta/rules.json',candidate.rules],['world/geo/locations.json',candidate.locations],['world/geo/routes.json',candidate.routes]];
        const previous=await Promise.all(files.map(async([file])=>({file,bytes:await fs.readFile(file)})));
        // Refuse a stale read when another content wave publishes meanwhile.
        if(digest(await loadWorld())!==digest(world))throw new Error('发布期间世界源文件已变化，请重新准备');
        try{for(const[file,value]of files)await atomicJSON(file,value);}
        catch(error){for(const{file,bytes}of previous)await fs.writeFile(file,bytes);throw error;}
    }
    const report={published:publish,added:incoming.length,total:candidate.monsters.length,ecology:{seeds:ecology.seeds,days:ecology.days,ok:ecology.ok},sourceHash:digest(world),candidateHash:digest(candidate),scope:'仅正式世界源文件；酒馆尚未部署。首领留待M4。'};
    await fs.mkdir('docs/内容审查',{recursive:true});await fs.writeFile('docs/内容审查/W4-发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
