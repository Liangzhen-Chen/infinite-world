import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {digest} from '../server-plugin/storage.mjs';
import {highWildlifeFoundation} from '../world/design/high-wildlife-foundation.mjs';
import {runContentPipeline} from './content-pipeline.mjs';
import {wildlifeContext,wildlifeDraftRequest,validateWildlifeDraft} from './w4-content.mjs';
const root='world/drafts/w4',bones=highWildlifeFoundation(),ecology=JSON.parse(await fs.readFile(`${root}/ecology.json`,'utf8'));
if(!ecology.ok||ecology.boneHash!==digest(bones)||ecology.days<1080||ecology.seeds<20)throw new Error('高阶骨架尚未通过匹配的三年生态模拟');
const world=await loadWorld();
await fs.writeFile(`${root}/source.json`,JSON.stringify({boneHash:digest(bones),revision:'w4-v2',bones},null,2)+'\n');
try{
    const {summary}=await runContentPipeline({entries:bones.monsters,root,client:new DeepSeekClient({budgetYuan:20,logFile:'logs/w4-usage.jsonl'}),
        contextFor:entry=>wildlifeContext(entry,world),buildDraftRequest:wildlifeDraftRequest,validateDraft:validateWildlifeDraft,concurrency:12,batchSize:50,revision:'w4-v2'});
    console.log(JSON.stringify({total:summary.total,passed:summary.passed,manual:summary.manual,pending:summary.pending,costUpperYuan:summary.costUpperYuan}));
}catch(error){await fs.writeFile(`${root}/failure.json`,JSON.stringify({error:error.message},null,2));process.exitCode=1;}
