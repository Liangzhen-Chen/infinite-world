import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {verifyWildlifePublication,contentHash,wildlifeGeneratorFiles} from './wildlife-content.mjs';
import {backup} from './backup.mjs';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
const runId=process.argv[2];if(!/^\d+$/.test(runId??''))throw new Error('用法：node tools/prepare-wildlife-catalog.mjs runId [--publish]');
const read=async f=>JSON.parse(await fs.readFile(f,'utf8')),root=`world/drafts/wildlife/${runId}`,world=await loadWorld(),source=await read(`${root}/source.json`),rows=await read(`${root}/lore.json`);
if(source.runId!==runId)throw new Error('起草编号不匹配');
const current=await Promise.all(wildlifeGeneratorFiles.map(async file=>({file,source:await fs.readFile(file,'utf8')})));
if(contentHash(current)!==source.generatorHash||contentHash(await read(`${root}/generator-sources.json`))!==source.generatorHash)throw new Error('生成器证明已变化或损坏，拒绝发布旧起草');
const reviews=await Promise.all(source.reviewSeeds.map((_,batch)=>read(`docs/内容审查/物种-${runId}-批${batch}.json`))),candidate=verifyWildlifePublication(world,source,rows,reviews);
const publish=process.argv.includes('--publish');let directory=null;
if(publish){
    directory=await backup('stage2-wildlife-catalog');const files=[['world/meta/rules.json',candidate.rules],['world/meta/monsters.json',candidate.monsters],
        ...(source.kind==='highWildlife'?[['world/geo/locations.json',candidate.locations],['world/geo/routes.json',candidate.routes]]:[])],original=[];
    for(const[file]of files){let bytes=null;try{bytes=await fs.readFile(file);}catch(e){if(e.code!=='ENOENT')throw e;}
        if(bytes){const saved=path.join(directory,'world-source',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);}original.push({file,bytes});}
    try{for(const[file,value]of files)await atomicJSON(file,value);}catch(e){for(const{file,bytes}of original){if(bytes)await fs.writeFile(file,bytes);else await fs.unlink(file).catch(()=>{});}throw e;}
}
const report={runId,published:publish,backup:directory,sourceHash:digest(world),candidateHash:digest(candidate),monsters:candidate.monsters.length,
    scope:'经审核的物种目录及实际栖地；40首领、觉醒和完整阶段2规则尚未完成，在线未部署'};
await fs.writeFile('docs/测试报告/生态目录发布.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
