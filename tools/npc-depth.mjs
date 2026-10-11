import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,hashContent} from './content-pipeline.mjs';
import {migrateDepthBudget} from './content-budget.mjs';
import {depthBatches,depthEntries,contextFor,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,patchDraft,validatePatchResults} from './npc-depth-content.mjs';
export const depthHelp='npc-depth --batch <旧批次> | --design <设计.mjs> --root <world候选目录> --prepare | --budget-root <共用预算目录> --card <T编号> [--recover-protocol <id,id>]\ncard 是稳定授权编号，换目录或 revision 仍使用原编号。recover-protocol 只为指定的合同失败提供一次恢复，保留 attempts 与原错误，仍须 L1/L2/L4。新设计导出 revision, patchRows:[{id,before,baseHash,issues:[{id,field,code}],patches:[{path,value}]}]。prepare 不调用模型；正式文件由 publish-npc-depth --manifest <manifest.json> [--publish] 写入。';
export function depthOptions(argv=process.argv.slice(2)){
 const option=name=>{const i=argv.indexOf(name);if(i<0)return undefined;if(!argv[i+1]||argv[i+1].startsWith('--'))throw Error(`缺少参数 ${name}`);return argv[i+1];};
 const batch=option('--batch')??'yupo-depth',design=option('--design');
  return {batch,design:design&&path.resolve(design),root:path.resolve(option('--root')??`world/drafts/w1/${batch}`),budgetRoot:option('--budget-root')&&path.resolve(option('--budget-root')),cardId:option('--card'),protocolRecoveryIds:option('--recover-protocol')?.split(',')??[],prepare:argv.includes('--prepare'),help:argv.includes('--help')};
}
export async function loadDepthConfig({design,batch}){const config=design?await import(pathToFileURL(design).href+'?hash='+hashContent(await fs.readFile(design,'utf8'))):depthBatches[batch];if(!config)throw Error('未登记人物批次');if(design&&!config.patchRows)throw Error('新 design 须导出 patchRows');return config;}
export function depthFoundation(entries,world,revision){return{revision,entries:entries.map(e=>e.contract?{...e,context:contextFor(e,world)}:{id:e.id,baseHash:hashContent(e.before),facts:e.facts,sharedEvent:e.sharedEvent,context:contextFor(e,world)})};}
export async function prepareDepth({worldRoot=path.resolve('world'),...options}){
 const config=await loadDepthConfig(options),{root}=options,world=await loadWorld(worldRoot),rows=config.patchRows??config.depthRows;
 await fs.mkdir(root,{recursive:true});const write=(name,value)=>fs.writeFile(path.join(root,name+'.json'),JSON.stringify(value,null,2)+'\n');
 let base;try{base=JSON.parse(await fs.readFile(path.join(root,'base.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;base=rows.map(r=>world.npcs.find(n=>n.id===r.id));if(base.some(n=>!n))throw Error('缺少原人物');await write('base',base);}
 const reference={...world,npcs:world.npcs.map(n=>base.find(b=>b.id===n.id)??n)};
 const entries=depthEntries(base,options.design?config:options.batch,reference),foundation=depthFoundation(entries,reference,config.revision);
 if(config.patchRows)validatePatchResults(entries,reference);
 try{const old=JSON.parse(await fs.readFile(path.join(root,'foundation.json'),'utf8'));if(hashContent(old)!==hashContent(foundation))throw Error('骨架或引用已变，先逐条复核，不覆盖冻结审核');}catch(e){if(e.code!=='ENOENT')throw e;await write('foundation',foundation);}
 if(config.patchRows){
  for(const file of [options.design,root]){const relative=path.relative(path.resolve(worldRoot),path.resolve(file));if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('新设计和候选目录须位于 world/ 内');}
  const candidate=entries.map(patchDraft);try{const old=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));if(hashContent(old)!==hashContent(candidate))throw Error('冻结候选已改变');}catch(e){if(e.code!=='ENOENT')throw e;await write('candidate',candidate);}
  const manifest={contract:'audit-patch-v1',design:path.relative(worldRoot,options.design).replaceAll('\\','/'),root:path.relative(worldRoot,root).replaceAll('\\','/'),worldRoot:path.relative(root,worldRoot).replaceAll('\\','/'),foundationHash:hashContent(foundation)};
  try{const old=JSON.parse(await fs.readFile(path.join(root,'manifest.json'),'utf8'));if(hashContent(old)!==hashContent(manifest))throw Error('冻结发布清单已改变');}catch(e){if(e.code!=='ENOENT')throw e;await write('manifest',manifest);}
 }
 return{config,entries,world:reference,foundation,write};
}
export async function runDepth(options=depthOptions()){
 if(options.help){console.log(depthHelp);return;}
 const {config,entries,world,write}=await prepareDepth(options),{root,batch,budgetRoot}=options,revision=config.revision;
 if(options.prepare){console.log(JSON.stringify({entries:entries.length,formalWrite:false,modelCalls:0}));return;}
 if(!budgetRoot)throw Error('必须显式提供本批获授权的共用预算目录');
 if(!options.cardId)throw Error('必须显式提供稳定授权 --card T编号');
 const start=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
 let allocation;try{allocation=JSON.parse(await fs.readFile(path.join(root,'allocation.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;const incrementLimitYuan=config.patchRows?config.incrementLimitYuan:batch==='yupo-depth-next'?.3:.8;if(!Number.isFinite(incrementLimitYuan)||incrementLimitYuan<=0)throw Error('新 design 须声明获授权 incrementLimitYuan');allocation={cardId:options.cardId,wave:config.patchRows?config.revision:batch==='yupo-depth-next'?'M4-shared':'W1',waveLimitYuan:20,startingSpentYuan:start.spentYuan,startingReservedYuan:start.reservedYuan??0,incrementLimitYuan};migrateDepthBudget(start,options.cardId,allocation);await write('allocation',allocation);}
 if(allocation.cardId&&allocation.cardId!==options.cardId)throw Error('allocation card 不匹配');
 if(!allocation.cardId){migrateDepthBudget(start,options.cardId,allocation);allocation.cardId=options.cardId;await write('allocation',allocation);}
 const client=new DeepSeekClient({budgetYuan:20,logFile:`logs/w1-${batch}-usage.jsonl`});
 try{const result=await runContentPipeline({entries,root,budgetRoot,client,cardId:options.cardId,allocation,protocolRecoveryIds:options.protocolRecoveryIds,contextFor:e=>contextFor(e,world),revision,buildDraftRequest,buildReviewRequest,extractDraft,validateDraft,concurrency:config.patchRows?1:batch==='yupo-depth-next'?2:8,batchSize:25});await write('terminal',{status:'finished',summary:result.summary,budgetBefore:start,budgetAfter:result.summary.budget,card:result.summary.budget.cards[options.cardId]});console.log(JSON.stringify(result.summary));}catch(e){const after=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));await write('terminal',{status:'error',error:e.message,budgetBefore:start,budgetAfter:after});throw e;}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await runDepth();
