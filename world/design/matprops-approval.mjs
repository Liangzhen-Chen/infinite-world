// D12 卡 D：材料属性表（类别行与物品覆盖行）的审批入口：L1 确定性检查、L2 真实模型事实核对、L4 阅读记录核验。
// 沿用 a3w-props-approval 的冻结候选做法：候选就是盘上的数据，只请求审查，不请求改写；预算走 tools/content-budget.mjs
// 的单卡账（调用前按请求上界预留，累计到单卡上限即停并写 budgetStop），调用记录（请求、响应、费用）落在 draftRoot。
// 用法：node world/design/matprops-approval.mjs --l1 | --review | --verify   （--review 需环境变量 DEEPSEEK_API_KEY）
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, readApprovedContent, hashContent, parseModelJSON} from '../../tools/content-pipeline.mjs';
import {loadRuntimeWorld} from '../../tools/load-world.mjs';
import {validateMaterialProps, MATERIAL_DIMENSIONS} from '../../server-plugin/item-class.mjs';

export const revision='d12-matprops-1';
export const draftRoot='world/drafts/d12-matprops';
export const reviewRoot=path.join(draftRoot,'review-1');
export const cardId='D12-MATPROPS';
export const cardLimitYuan=1.5, maxRequests=40, maxOverrideRatio=0.15;
const readJSON=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const tableFile='world/meta/mechanics/material-props.json', overlayFile='world/meta/mechanics/items.json';

// 条目：每个类别行一条（class_<类别键>），每个物品覆盖行一条（物品 id）。
export async function entriesFor(){
 const table=await readJSON(tableFile),overlay=await readJSON(overlayFile);
 const classes=Object.entries(table.classes).map(([key,row])=>({id:`class_${key}`,kind:'material-props-class',key,row,source:{path:`${tableFile}#classes.${key}`,detail:row.basis}}));
 const items=Object.entries(overlay).filter(([,patch])=>patch.props).map(([id,patch])=>({id,kind:'material-props-item',row:patch.props,source:{path:`${overlayFile}#${id}.props`,detail:patch.props.basis}}));
 return [...classes,...items];
}
export const draftFor=entry=>({id:entry.id,row:structuredClone(entry.row)});
let worldCache;
const runtime=async()=>worldCache??=await loadRuntimeWorld();
// 上下文：表头单位与范围、饱腹换算说明；类别行带上属于该类别的物品（名称、重量、标签），物品行带上该物品自身与它所属的类别值。
export async function contextFor(entry){
 const world=await runtime(),table=await readJSON(tableFile);
 const dimensions=Object.fromEntries(Object.entries(table.dimensions).map(([k,v])=>[k,`${v.unit}，范围 ${v.min}–${v.max}`]));
 const brief=i=>({id:i.id,name:i.name,weight:i.weight,tags:i.tags});
 if(entry.kind==='material-props-class')return {dimensions,note:table.note,members:world.items.filter(i=>(i.tags??[]).includes(entry.key)).map(brief)};
 const item=world.items.find(i=>i.id===entry.id);
 return {dimensions,note:table.note,item:{...brief(item),use:item.use,description:item.description},classValues:Object.fromEntries((item.tags??[]).filter(t=>table.classes[t]).map(t=>[t,table.classes[t]]))};
}
export async function validateDraft(draft,entry){
 try{assert.deepEqual(draft,draftFor(entry));assert.ok(typeof entry.row.basis==='string'&&entry.row.basis.trim());return [];}
 catch{return ['候选须与盘上数据完全一致且带 basis'];}
}
export function reviewRequest(entry,draft,context){
 return {thinking:{type:'disabled'},temperature:0,max_tokens:900,response_format:{type:'json_object'},messages:[
  {role:'system',content:'你是游戏世界物性数据的事实审查员。逐项核对材料属性行里每个数值：(1) 是否落在公认的真实世界范围内（对照 basis 里写的出处与你所知的权威数据：USDA FoodData Central、FAO、木材与燃料手册等）；(2) 是否与 basis 自己写的数字和算式一致；(3) 单位与含义是否符合 dimensions（含水率是水占鲜重的质量分数；能量密度是饱腹/kg 干物质，饱腹=kcal÷24 是本游戏的标定约定，不要质疑该约定本身，只核算术）；(4) 类别行的含水率与能量对 members 里的物品是否说得通。只返回 JSON {"contradictions":[{"quote":"basis 或数值原文","field":"维度名或 basis","severity":"hard|soft|style","reason":"具体原因，给出你认为的正确范围"}]}。hard 表示数值明显超出公认范围、算式错、单位错或出处与数值相反；取值在公认区间内但偏边缘、或出处无法确认的写 soft；不要因为 basis 没有穷举所有数据而报错，不要编造你不确定的数据库条目，不确定就用 soft 说明。无问题则空数组。'},
  {role:'user',content:JSON.stringify({entry:{id:entry.id,kind:entry.kind,row:entry.row},context})}]};
}
export function extractReview(response){
 try{
  const review=parseModelJSON(response);
  assert.ok(Array.isArray(review?.contradictions),'Missing contradictions array');
  for(const issue of review.contradictions){
   assert.ok(['hard','soft','style'].includes(issue.severity));
   for(const key of ['quote','field','reason'])assert.ok(typeof issue[key]==='string'&&issue[key].trim());
  }
  return review;
 }catch(error){throw Object.assign(new Error(`Invalid contradictions JSON: ${error.message}`),{code:'CONTENT_BUDGET_STOP'});}
}
const draftRequest=()=>{throw Error('候选已冻结；不请求模型改写');};
export async function l1(){
 const entries=await entriesFor(),world=await runtime(),errors=[];
 errors.push(...validateMaterialProps(world));
 for(const e of entries)errors.push(...(await validateDraft(draftFor(e),e)).map(x=>`${e.id}: ${x}`));
 const overrides=entries.filter(e=>e.kind==='material-props-item').length;
 if(overrides/world.items.length>maxOverrideRatio)errors.push(`覆盖行占物品总数 ${overrides}/${world.items.length} 超过 ${maxOverrideRatio*100}%：类别划得不对，回头改类别`);
 assert.deepEqual(errors,[]);
 return {L1:'passed',entries:entries.length,overrides,items:world.items.length};
}
export async function verifyPublished(){
 const entries=await entriesFor();
 const approved=await readApprovedContent(reviewRoot,entries,{revision,contextFor});
 assert.equal(approved.length,entries.length,'L1/L2 未全部通过');
 for(const d of approved)assert.deepEqual(d,draftFor(entries.find(e=>e.id===d.id)),`${d.id} 盘上数据与审批回执不符`);
 return {approved:approved.length,dimensions:MATERIAL_DIMENSIONS.length};
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--l1'))console.log(JSON.stringify(await l1()));
 if(args.includes('--review')){
  await l1();
  const entries=await entriesFor();
  console.log(JSON.stringify({pid:process.pid,mode:'review',entries:entries.length}));
  const {summary}=await runContentPipeline({entries,root:reviewRoot,budgetRoot:draftRoot,revision,contextFor,
   validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,buildDraftRequest:draftRequest,buildReviewRequest:reviewRequest,extractReview,
   client:new DeepSeekClient({budgetYuan:cardLimitYuan,logFile:path.join(draftRoot,'usage.jsonl')}),cardId,
   allocation:{cardId,incrementLimitYuan:cardLimitYuan,maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:25});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards[cardId]}));
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
