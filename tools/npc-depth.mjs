import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,hashContent} from './content-pipeline.mjs';
import {depthRows} from '../world/design/w1-yupo-depth.mjs';
import {depthEntries,contextFor,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,revision} from './npc-depth-content.mjs';
const root='world/drafts/w1/yupo-depth',world=await loadWorld();await fs.mkdir(root,{recursive:true});
const write=(file,value)=>fs.writeFile(`${root}/${file}.json`,JSON.stringify(value,null,2)+'\n');
let base;try{base=JSON.parse(await fs.readFile(`${root}/base.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;base=depthRows.map(r=>world.npcs.find(n=>n.id===r.id));await write('base',base);}
const entries=depthEntries(base),context=e=>contextFor(e,world),foundation={revision,entries:entries.map(e=>({id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:context(e)}))};
try{const old=JSON.parse(await fs.readFile(`${root}/foundation.json`,'utf8'));if(hashContent(old)!==hashContent(foundation))throw Error('骨架或引用已变，先逐条复核，不覆盖冻结审核');}catch(e){if(e.code!=='ENOENT')throw e;await write('foundation',foundation);}
if(process.argv.includes('--prepare')){console.log(JSON.stringify({entries:entries.length,formalWrite:false}));process.exit(0);}
const budgetAt=process.argv.indexOf('--budget-root');if(budgetAt<0)throw Error('必须显式提供本批获授权的共用W1预算目录');
const budgetRoot=path.resolve(process.argv[budgetAt+1]);const start=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
let allocation;try{allocation=JSON.parse(await fs.readFile(`${root}/allocation.json`,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;allocation={wave:'W1',waveLimitYuan:20,startingSpentYuan:start.spentYuan,startingReservedYuan:start.reservedYuan??0,incrementLimitYuan:.8,limitYuan:Math.min(20,start.spentYuan+(start.reservedYuan??0)+.8)};await write('allocation',allocation);}
const client=new DeepSeekClient({budgetYuan:allocation.limitYuan,logFile:'logs/w1-yupo-depth-usage.jsonl'});
try{const result=await runContentPipeline({entries,root,budgetRoot,client,contextFor:context,revision,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,concurrency:8,batchSize:25});await write('terminal',{status:'finished',summary:result.summary,incrementSpentYuan:client.spent-allocation.startingSpentYuan});console.log(JSON.stringify(result.summary));}catch(e){await write('terminal',{status:'error',error:e.message,incrementSpentYuan:client.spent-allocation.startingSpentYuan});throw e;}
