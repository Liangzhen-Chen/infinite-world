import fs from 'node:fs/promises';
import {loadWorld} from './load-world.mjs';
import {w1HewanFoundation} from '../world/design/w1-hewan.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {validateFoundation,validateDraft,contextFor,buildDraftRequest,applyProse,validateProseSimilarity,revision} from './w1-hewan-content.mjs';
const root='world/drafts/w1/hewan',write=(name,value)=>fs.writeFile(`${root}/${name}.json`,JSON.stringify(value,null,2)+'\n');await fs.mkdir(root,{recursive:true});
const world=await loadWorld();let bones;try{bones=JSON.parse(await fs.readFile(`${root}/foundation.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;bones=w1HewanFoundation(world);bones.preservedHashes=Object.fromEntries(world.npcs.filter(n=>bones.preservedIds.includes(n.id)).map(n=>[n.id,hashContent(n)]));validateFoundation(bones,world);await write('foundation',bones);}
for(const id of bones.preservedIds)if(hashContent(world.npcs.find(n=>n.id===id))!==bones.preservedHashes[id])throw new Error(`已发布原档变化，需定点核对 ${id}`);
const report=validateFoundation(bones,world),context=e=>contextFor(e,bones,world);
if(process.argv.includes('--prepare')){console.log(JSON.stringify(report));process.exit(0);}
if(process.argv.includes('--candidate')){
 const result={...bones};for(const kind of ['npcs','residents','locations']){const drafts=await readApprovedContent(`${root}/${kind}`,bones[kind],{contextFor:context,revision});if(drafts.length!==bones[kind].length)throw new Error(`${kind}仍有待审`);result[kind]=bones[kind].map(e=>{const draft=drafts.find(d=>d.id===e.id),check=validateDraft(draft,e);if(check.errors.length)throw new Error(e.id+':'+check.errors.join('；'));return applyProse(e,draft);});}
 validateFoundation(result,world);const similarity=validateProseSimilarity(result,world);await write('candidate',{...result,status:'reviewed-candidate',formalWrite:false});await write('validation',{...report,similarity,L1:'passed',L2:'passed',L4:'passed',formalWrite:false});console.log(JSON.stringify(report));
}else{
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/w1-usage.jsonl'});
 try{for(const kind of ['npcs','residents','locations']){const result=await runContentPipeline({entries:bones[kind],root:`${root}/${kind}`,budgetRoot:'world/drafts/w1',client,contextFor:context,revision,buildDraftRequest,validateDraft,concurrency:8,batchSize:Math.min(40,bones[kind].length)});console.log(JSON.stringify({kind,...result.summary}));}await write('terminal',{status:'finished',costUpperYuan:client.spent});}catch(e){await write('terminal',{status:'error',error:e.message,costUpperYuan:client.spent});throw e;}
}
