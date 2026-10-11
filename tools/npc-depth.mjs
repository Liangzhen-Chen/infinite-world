import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,hashContent} from './content-pipeline.mjs';
import {depthBatches,depthEntries,contextFor,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft} from './npc-depth-content.mjs';
const batchAt=process.argv.indexOf('--batch'),batch=batchAt<0?'yupo-depth':process.argv[batchAt+1],config=depthBatches[batch];if(!config)throw Error('未登记人物批次');
const {depthRows,revision}=config,root=`world/drafts/w1/${batch}`,world=await loadWorld();await fs.mkdir(root,{recursive:true});
const write=(file,value)=>fs.writeFile(`${root}/${file}.json`,JSON.stringify(value,null,2)+'\n');
let base;try{base=JSON.parse(await fs.readFile(`${root}/base.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;base=depthRows.map(r=>world.npcs.find(n=>n.id===r.id));await write('base',base);}
const entries=depthEntries(base,batch),context=e=>contextFor(e,world),foundation={revision,entries:entries.map(e=>({id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:context(e)}))};
try{const old=JSON.parse(await fs.readFile(`${root}/foundation.json`,'utf8'));if(hashContent(old)!==hashContent(foundation))throw Error('骨架或引用已变，先逐条复核，不覆盖冻结审核');}catch(e){if(e.code!=='ENOENT')throw e;await write('foundation',foundation);}
if(process.argv.includes('--prepare')){console.log(JSON.stringify({entries:entries.length,formalWrite:false}));process.exit(0);}
const budgetAt=process.argv.indexOf('--budget-root');if(budgetAt<0)throw Error('必须显式提供本批获授权的共用预算目录');
const budgetRoot=path.resolve(process.argv[budgetAt+1]);const start=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
let allocation;try{allocation=JSON.parse(await fs.readFile(`${root}/allocation.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const incrementLimitYuan=batch==='yupo-depth-next'?.3:.8;allocation={wave:batch==='yupo-depth-next'?'M4-shared':'W1',waveLimitYuan:20,startingSpentYuan:start.spentYuan,startingReservedYuan:start.reservedYuan??0,incrementLimitYuan,limitYuan:Math.min(20,start.spentYuan+(start.reservedYuan??0)+incrementLimitYuan)};await write('allocation',allocation);}
const client=new DeepSeekClient({budgetYuan:allocation.limitYuan,logFile:`logs/w1-${batch}-usage.jsonl`});
try{const result=await runContentPipeline({entries,root,budgetRoot,client,contextFor:context,revision,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,concurrency:batch==='yupo-depth-next'?2:8,batchSize:25});await write('terminal',{status:'finished',summary:result.summary,incrementSpentYuan:client.spent-allocation.startingSpentYuan});console.log(JSON.stringify(result.summary));}catch(e){await write('terminal',{status:'error',error:e.message,incrementSpentYuan:client.spent-allocation.startingSpentYuan});throw e;}
finally{const file=path.join(budgetRoot,'budget.json'),ledger=JSON.parse(await fs.readFile(file,'utf8'));ledger.limitYuan=allocation.waveLimitYuan;if(Math.abs(ledger.reservedYuan??0)<1e-12)ledger.reservedYuan=0;await fs.writeFile(file,JSON.stringify(ledger,null,2)+'\n');}
