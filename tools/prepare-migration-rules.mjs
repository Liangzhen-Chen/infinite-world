import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {withSeasonalMigration} from '../world/design/seasonal-migration-foundation.mjs';
import {backup} from './backup.mjs';
import {atomicJSON,digest} from '../server-plugin/storage.mjs';
const source=await loadWorld(),candidate=withSeasonalMigration(source),validation=validateWorld(candidate);
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');let directory=null;
if(publish){
    directory=await backup('stage2-seasonal-migration-rules');const file='world/meta/rules.json',saved=path.join(directory,'world-source',file);
    await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);
}
const report={published:publish,backup:directory,sourceHash:digest(source),candidateHash:digest(candidate),routes:candidate.rules.wildlife.migration.routes.length,
    scope:'两种动物四条季节路线与未见种群/实际个体守恒迁徙；数量、比例、日程为开发初值。未启用玩家酒馆；全部物种路线、农田害兽和怪物觉醒未完成'};
await fs.writeFile('docs/测试报告/迁徙规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
