import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {withFarmPests} from '../world/design/farm-pests-foundation.mjs';
import {backup} from './backup.mjs';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
const source=await loadWorld(),candidate=withFarmPests(source),validation=validateWorld(candidate);
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');let directory=null;
if(publish){directory=await backup('stage2-farm-pests-rules');const file='world/meta/rules.json',saved=path.join(directory,'world-source',file);await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);}
const report={published:publish,backup:directory,sourceHash:digest(source),candidateHash:digest(candidate),
    scope:'一处公共燕麦田的田鼠压力、有限跨栖地捕食与非战斗巡田；数值是原创开发初值。完整产业/全部害兽/灾害自治未完成，未部署在线'};
await fs.writeFile('docs/测试报告/害兽规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
