import fs from'node:fs/promises';
import path from'node:path';
import {repairFoundation}from'../world/design/repair-foundation.mjs';
import {loadWorld}from'./load-world.mjs';
import {validateWorld}from'./validate-world.mjs';
import {atomicJSON,digest}from'../server-plugin/storage.mjs';
import {backup}from'./backup.mjs';
const world=await loadWorld(),candidate=structuredClone(world),ids=new Set(repairFoundation.map(row=>row.id));
candidate.rules.repairs=[...(candidate.rules.repairs??[]).filter(row=>!ids.has(row.id)),...repairFoundation];
const validation=validateWorld(candidate);if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');let directory=null;
if(publish){
    directory=await backup('stage2-repair-rules');const file='world/meta/rules.json',saved=path.join(directory,'world-source',file);
    await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);
}
const report={published:publish,backup:directory,sourceHash:digest(world),candidateHash:digest(candidate),repairs:candidate.rules.repairs.length,
    scope:'两种木作修整工序；未覆盖所有工具装备维修，未部署在线'};
await fs.writeFile('docs/测试报告/维修规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
