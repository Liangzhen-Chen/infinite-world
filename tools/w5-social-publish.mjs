import fs from'node:fs/promises';
import {approvedSocialCandidate}from'./w5-social.mjs';
import {loadWorld}from'./load-world.mjs';
import {validateWorld}from'./validate-world.mjs';
import {atomicJSON}from'../server-plugin/storage.mjs';

const candidate=await approvedSocialCandidate(),world={...await loadWorld(),...candidate};
const validation=validateWorld(world,{stage:'release'});
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const files=Object.entries(candidate).map(([key,rows])=>[`world/lore/${key}.json`,rows]),publish=process.argv.includes('--publish');
if(publish){
    const previous=await Promise.all(files.map(async([file])=>{try{return[file,await fs.readFile(file)];}catch(error){if(error.code==='ENOENT')return[file,null];throw error;}}));
    try{for(const[file,rows]of files)await atomicJSON(file,rows);}
    catch(error){for(const[file,bytes]of previous){if(bytes)await fs.writeFile(file,bytes);else await fs.rm(file,{force:true});}throw error;}
}
console.log(JSON.stringify({published:publish,files:files.map(([file])=>file),counts:validation.counts,
    scope:'正式世界资料目录；不部署、不生成新居民、组织资产或时钟状态'}));
