import fs from'node:fs/promises';
import path from'node:path';
import {loadWorld}from'./load-world.mjs';
import {contentHash,checkEconomyPublication}from'./economy-content.mjs';
import {backup}from'./backup.mjs';
import {atomicJSON}from'../server-plugin/storage.mjs';
const runId=process.argv[2];if(!/^\d+$/.test(runId??''))throw new Error('用法：node tools/prepare-economy-catalog.mjs runId [--publish]，默认只检查');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8')),root=`world/drafts/economy/${runId}`;
const world=await loadWorld(),source=await read(`${root}/source.json`),lore=await read(`${root}/lore.json`),reviews=[];
for(let batch=0;batch<Math.ceil(lore.length/50);batch++)reviews.push(await read(`docs/内容审查/器物-${runId}-批${batch}.json`));
const candidate=checkEconomyPublication(world,source,lore,reviews);
const publish=process.argv.includes('--publish');
if(publish){
 const directory=await backup('stage2-economic-catalog'),files=[['world/meta/items.json',candidate.items],['world/meta/recipes.json',candidate.recipes],['world/geo/locations.json',candidate.locations]],original=[];
 for(const[file]of files){const bytes=await fs.readFile(file),saved=path.join(directory,'world-source',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);original.push({file,bytes});}
 try{for(const[file,value]of files)await atomicJSON(file,value);}
 catch(error){for(const{file,bytes}of original)await fs.writeFile(file,bytes);throw error;}
 await fs.writeFile('docs/测试报告/经济目录发布.json',JSON.stringify({runId,sourceHash:source.sourceWorldHash,candidateHash:contentHash(candidate),backup:directory,items:candidate.items.length,recipes:candidate.recipes.length,
    scope:'经自动与人工审核发布这一批源目录；在线未部署，400物品/200配方及阶段2未完成'},null,2)+'\n');
}
console.log(JSON.stringify({runId,eligible:true,published:publish,items:candidate.items.length,recipes:candidate.recipes.length,scope:'局部目录审核；不代表完整阶段2通过'}));
