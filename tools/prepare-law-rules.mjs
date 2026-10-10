import fs from 'node:fs/promises';
import path from 'node:path';
import { withLawRules } from '../world/design/law-foundation.mjs';
import { loadWorld } from './load-world.mjs';
import { validateWorld } from './validate-world.mjs';
import { backup } from './backup.mjs';
import { atomicJSON, digest } from '../server-plugin/storage.mjs';

const source=await loadWorld(),candidate=withLawRules(source),validation=validateWorld(candidate);
if(!validation.ok)throw new Error(validation.errors.join('\n'));
const publish=process.argv.includes('--publish');let directory=null;
if(publish){
    directory=await backup('stage2-law-rules');const file='world/meta/rules.json',saved=path.join(directory,'world-source',file);
    await fs.mkdir(path.dirname(saved),{recursive:true});await fs.copyFile(file,saved);await atomicJSON(file,candidate.rules);
}
const report={published:publish,backup:directory,sourceHash:digest(source),candidateHash:digest(candidate),
    scope:'河湾局部偷窃、证据和诉讼判罚规则；其他政体、欺诈和全面NPC舆论尚未实现，未部署在线'};
await fs.writeFile('docs/测试报告/法律规则发布.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
