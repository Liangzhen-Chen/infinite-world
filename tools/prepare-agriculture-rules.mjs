import fs from'node:fs/promises';
import path from'node:path';
import{withAgricultureRules}from'../world/design/agriculture-foundation.mjs';
import{loadWorld}from'./load-world.mjs';
import{validateWorld}from'./validate-world.mjs';
import{backup}from'./backup.mjs';
import{atomicJSON,digest}from'../server-plugin/storage.mjs';
const source=await loadWorld(),candidate=withAgricultureRules(source),validation=validateWorld(candidate);
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');let directory=null;
if(publish){directory=await backup('stage2-agriculture-rules');const file='world/meta/rules.json',saved=path.join(directory,'world-source',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);}
const report={published:publish,backup:directory,sourceHash:digest(source),candidateHash:digest(candidate),
    scope:'新战役源开局与公共农业粮仓；旧存档只保守迁移，不回填源粮。私人土地、全产业、周贸易、个体NPC农事和行囊保存期尚未完成，在线未部署'};
await fs.writeFile('docs/测试报告/农业规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
