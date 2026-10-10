import fs from'node:fs/promises';
import path from'node:path';
import {loadWorld}from'./load-world.mjs';
import {validateWorld}from'./validate-world.mjs';
import {environmentFoundation,environmentRules}from'../world/design/water-foundation.mjs';
import {backup}from'./backup.mjs';
import {atomicJSON,digest}from'../server-plugin/storage.mjs';
export function withWaterEnvironment(world){
    const candidate=structuredClone(world);candidate.rules.environment={...candidate.rules.environment,...environmentRules};
    for(const[location,features]of Object.entries(environmentFoundation)){
        const place=candidate.locations.find(row=>row.id===location);if(!place)throw new Error(`环境地点不存在${location}`);
        const known=new Set(features.map(row=>row.id));place.features=[...(place.features??[]).filter(row=>!known.has(row.id)),...structuredClone(features)];
        place.microclimate={...place.microclimate,humidityPercent:70};
    }
    return candidate;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
    const world=await loadWorld(),candidate=withWaterEnvironment(world),validation=validateWorld(candidate);
    if(!validation.ok)throw new Error(validation.errors.join('\n'));
    const publish=process.argv.includes('--publish');let directory=null;
    if(publish){
        directory=await backup('stage2-water-source');const originals=[];
        for(const file of['world/meta/rules.json','world/geo/locations.json']){
            const bytes=await fs.readFile(file),saved=path.join(directory,'world-source',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);originals.push({file,bytes});
        }
        try{await atomicJSON('world/meta/rules.json',candidate.rules);await atomicJSON('world/geo/locations.json',candidate.locations);}
        catch(error){for(const{file,bytes}of originals)await fs.writeFile(file,bytes);throw error;}
    }
    const report={published:publish,sourceHash:digest(world),candidateHash:digest(candidate),backup:directory,features:Object.values(environmentFoundation).flat().length,
        scope:'六个物理环境对象，六种水法术处理器尚未发布正式法术；完整魔法/长期作物/天气反馈未完成，在线未部署'};
    await fs.writeFile('docs/测试报告/水环境发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
