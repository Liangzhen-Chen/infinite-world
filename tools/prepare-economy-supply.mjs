import fs from'node:fs/promises';
import path from'node:path';
import {loadWorld}from'./load-world.mjs';
import {applyEconomySupply,economySupplyPlan}from'../world/design/economy-supply.mjs';
import {validateWorld}from'./validate-world.mjs';
import {contentHash}from'./economy-content.mjs';
import {backup}from'./backup.mjs';
import {atomicJSON}from'../server-plugin/storage.mjs';
const world=await loadWorld(),candidate=applyEconomySupply(world),validation=validateWorld(candidate,{stage:'engine'});
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');
let directory=null;
if(publish){
 directory=await backup('stage2-economic-supply');
 const file='world/people/baseline.json',saved=path.join(directory,'world-source',file),bytes=await fs.readFile(file);
 await fs.mkdir(path.dirname(saved),{recursive:true});await fs.writeFile(saved,bytes);
 try{await atomicJSON(file,candidate.npcs);}catch(error){await fs.writeFile(file,bytes);throw error;}
}
const report={sourceHash:contentHash(world),candidateHash:contentHash(candidate),planHash:contentHash(economySupplyPlan),published:publish,backup:directory,
 suppliers:economySupplyPlan.length,stockLines:economySupplyPlan.reduce((n,row)=>n+Object.keys(row.stock).length,0),
 scope:'有限初始供货；只更改源世界，未补充现有战役库存；补货、鲜货变质与年度供需仍待实现'};
await fs.writeFile('docs/测试报告/经济初始供货.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
