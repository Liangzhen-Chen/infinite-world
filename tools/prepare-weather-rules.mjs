import fs from 'node:fs/promises';
import path from 'node:path';
import { withWeatherRules } from '../world/design/weather-foundation.mjs';
import { loadWorld } from './load-world.mjs';
import { validateWorld } from './validate-world.mjs';
import { backup } from './backup.mjs';
import { atomicJSON, digest } from '../server-plugin/storage.mjs';

const source=await loadWorld(), candidate=withWeatherRules(source), validation=validateWorld(candidate);
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish'); let directory=null;
if(publish){
    directory=await backup('stage2-weather-rules'); const file='world/meta/rules.json', saved=path.join(directory,'world-source',file);
    await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);
}
const report={published:publish,backup:directory,sourceHash:digest(source),candidateHash:digest(candidate),
    scope:'旬日集市日期与四个气候区天气、昼长及行路/交锋/基础农产影响；节日、纪年历史、全年粮食平衡和完整NPC天气决策尚未完成。只写world源，未部署在线'};
await fs.writeFile('docs/测试报告/天气规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
