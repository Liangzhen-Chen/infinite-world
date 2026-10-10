import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {npcM2Foundation} from '../world/design/npc-m2.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,readApprovedContent} from './content-pipeline.mjs';
import {validateFoundation,validateDraft,contextFor,buildDraftRequest,revision} from './m2-people-content.mjs';
const root=path.resolve('world/drafts/m2-people');await fs.mkdir(root,{recursive:true});
const write=(name,value)=>fs.writeFile(path.join(root,name),JSON.stringify(value,null,2)+'\n');
let bones;
try{bones=JSON.parse(await fs.readFile(path.join(root,'foundation.json'),'utf8'));}
catch(error){if(error.code!=='ENOENT')throw error;const world=await loadWorld();bones=npcM2Foundation(world);validateFoundation(bones,world);await write('foundation.json',bones);await write('baseline.json',world.npcs);}
if(process.argv.includes('--prepare')){console.log(JSON.stringify({prepared:bones.npcs.length}));process.exit(0);}
if(process.argv.includes('--candidate')){
 const world=await loadWorld();world.npcs=JSON.parse(await fs.readFile(path.join(root,'baseline.json'),'utf8'));validateFoundation(bones,world);
 const drafts=await readApprovedContent(root,bones.npcs,{contextFor,revision});
 if(drafts.length!==18)throw Error('必须18人全部通过');
 for(const draft of drafts){const errors=validateDraft(draft,bones.npcs.find(n=>n.id===draft.id)).errors;if(errors.length)throw Error(`${draft.id}: ${JSON.stringify(errors)}`);}
 const npcs=bones.npcs.map(n=>{const d=drafts.find(x=>x.id===n.id);return {...n,description:d.description,voice:{...n.voice,samples:d.voiceSamples}};});
 await write('candidate.json',{...bones,npcs,status:'reviewed-candidate',formalWrite:false});console.log(JSON.stringify({candidates:npcs.length}));
}else{
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/m2-people-usage.jsonl'});
 try{const result=await runContentPipeline({entries:bones.npcs,root,client,contextFor,revision,buildDraftRequest,validateDraft,concurrency:8,batchSize:18});await write('terminal.json',{state:'finished',...result.summary});console.log(JSON.stringify(result.summary));}
 catch(error){await write('terminal.json',{state:'error',error:String(error.message),costUpperYuan:client.spent});throw error;}
}
