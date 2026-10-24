// Lossless conversion of published jurisdictions. No new law, court or penalty.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from '../../tools/content-pipeline.mjs';
import {previousLawEdition} from './s4-law-content-approval.mjs';

const root='world/drafts/s4-law-bindings',revision='s403-bindings-1';
const rules=JSON.parse(await fs.readFile('world/meta/rules.json','utf8'));
// New procedures and the Baishi binding supersede this exact historical gate.
// Verify the complete new edition before projecting the old receipt's facts.
const prior=await previousLawEdition(rules.law.codes,JSON.parse(await fs.readFile('world/law/bindings.json','utf8')));
rules.law.codes=prior.codes;
const row=rules.law.codes.flatMap(code=>code.locations.map(place=>({place,slot:'place.lawCode',value:code.id,source:`world/meta/rules.json#law.codes/${code.id}`})));
const entries=[{id:'s403_existing_law_bindings',row}];
const draftFor=e=>({id:e.id,row:e.row});
const contextFor=()=>({published:rules.law.codes,boundary:'仅将现有法典 locations 原样转换为 place.lawCode 绑定，地点子树依包含关系继承。不新增地点、组织、法典、刑罚、程序、授权或法院，不依据字段缺失补充语义。适用法与当前能否执行分离。来源：设计 05 §5.2.2、12 §12.4.4；现有 meta/rules.json law.codes。'});
const validateDraft=(d,e)=>{try{assert.deepEqual(d,draftFor(e));assert.equal(new Set(d.row.map(r=>r.place)).size,d.row.length);return [];}catch(error){return [error.message];}};

export async function run(args=process.argv.slice(2)){
 if(args.includes('--publish')||args.includes('--review'))throw Error('旧绑定版已被 S4LAW 审批取代，请使用 s4-law-content-approval.mjs');
 if(args.includes('--review')){
  await fs.mkdir(root,{recursive:true});
  try{await fs.access(`${root}/budget.json`);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(`${root}/budget.json`,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:1,cards:{S403:{limitYuan:1,spentYuan:0,reservedYuan:0,maxRequests:30}},requests:{}}));}
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('固定转换，不调用模型起草');},buildReviewRequest:defaultReviewRequest,client:new DeepSeekClient({budgetYuan:1,logFile:`${root}/usage.jsonl`}),cardId:'S403',allocation:{cardId:'S403',incrementLimitYuan:1,maxRequests:30,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:1});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S403}));
 }
 if(args.includes('--publish')||args.includes('--verify')){
  const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});assert.equal(approved.length,1);
  assert.deepEqual(approved[0],draftFor(entries[0]));
  if(args.includes('--publish')){await fs.mkdir('world/law',{recursive:true});await fs.writeFile('world/law/bindings.json',JSON.stringify(approved[0].row,null,2)+'\n');}
  if(args.includes('--verify'))assert.deepEqual(prior.bindings,approved[0].row);
  console.log(JSON.stringify({bindings:approved[0].row.length,published:args.includes('--publish'),verified:args.includes('--verify')}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
