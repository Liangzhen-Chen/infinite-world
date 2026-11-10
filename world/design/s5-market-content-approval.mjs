// Fixed parameter candidate through the same frozen-content gate as S4 law.
// Frozen candidate; paid review is capped by the S502C authorization (0.3 yuan).
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultReviewRequest,readApprovedContent,runContentPipeline} from '../../tools/content-pipeline.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

const file='world/rules/tables/market.json',root='world/drafts/s5-market-content';
const regionalPricing='基价仅作市场基准；现价按可售供需、品质、环境、立场及修正派生，日深度次日复位，报价不入存档。周贸易冻结整数合同单价，交割退款依合同；240日仅为采购目标。';
export const revision='s5-market-parameters-1';
export const entries=[{id:'s5-market-parameters',row:JSON.parse(await fs.readFile(file,'utf8'))},{id:'s5-regional-pricing',row:{pricing:regionalPricing}}];
export const draftFor=entry=>({id:entry.id,row:entry.row});
export const contextFor=entry=>entry?.id==='s5-regional-pricing'?{basis:'15 §15.2、§15.4；S502C 区域价归并。仅同步旧价格说明，不改数值、税章、路线、人物或权限。',sourceFacts:{implementation:'regionalTradePrice 转调只读市场；regionalTradeBase 保留道路、天气、季节；普通报价不写 quotes。',contract:'现有周贸易发运时冻结整数 unitPriceCopper，交割、损失及退款按合同，240日 targetDays 仍限制采购需求。',targets:['world/meta/rules.json#settlementTrade.pricing','world/design/m5-trade-rules.mjs#pricing']}}:({basis:'15 §15.2、§15.4；S5-02 第1会话。基价仅作基准，报价不作存档真相。',sourceFacts:{retail:'零售总额一次取整；默认阈值5或供给5%。',depth:'大宗积分；方向价差；日内成交深度，次日压力复位。',retention:'自用按身体消耗表与营养派生；扣除已签约/预订数量。',calibration:'品质步进、日深度、价差、水质阈值与篮子权重均为待标定候选，不冒充实测。'}});
async function approvedDrafts(){
 const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});
 assert.equal(approved.length,entries.length,'市场规则候选尚未完成审批');
 for(const entry of entries)assert.deepEqual(approved.find(d=>d.id===entry.id),draftFor(entry),'市场规则与审批内容不同');
 return approved;
}
export async function verifyPublished(){
 const approved=await approvedDrafts();
 assert.equal(JSON.parse(await fs.readFile('world/meta/rules.json','utf8')).settlementTrade.pricing,regionalPricing);
 assert.ok((await fs.readFile('world/design/m5-trade-rules.mjs','utf8')).includes(`pricing: ${JSON.stringify(regionalPricing)},`));
 return {verified:approved.length};
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--review')){
  assert.ok(process.env.DEEPSEEK_API_KEY,'DEEPSEEK_API_KEY unavailable; run review outside sandbox');
  await fs.mkdir(root,{recursive:true});
  const budgetFile=`${root}/budget.json`;
  try{await fs.access(budgetFile);}catch(error){if(error.code!=='ENOENT')throw error;await fs.writeFile(budgetFile,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.3,cards:{S502C:{limitYuan:0.3,spentYuan:0,reservedYuan:0,maxRequests:3}},requests:{}},null,2)+'\n');}
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,
   validateDraft:(draft,entry)=>{try{assert.deepEqual(draft,draftFor(entry));return [];}catch(error){return [error.message];}},
   reviewDraftFor:async entry=>draftFor(entry),reuseFrozenDrafts:true,buildDraftRequest:()=>{throw Error('Fixed market candidate');},buildReviewRequest:defaultReviewRequest,
   client:new DeepSeekClient({budgetYuan:0.3,logFile:`${root}/usage.jsonl`}),cardId:'S502C',
   // The shared allocator accepts its original wave denomination; the actual
   // ledger and this card both remain capped at 0.3, never at that denomination.
   // 11-10 李白批复（5 元内小额授权）：S502C 次数上限 3→5，金额仍 0.3 元；只限本账本、只限 s5-market-parameters 这一轮重审。
   allocation:{cardId:'S502C',incrementLimitYuan:0.3,maxRequests:5,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:1});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,budget:summary.budget.cards.S502C}));
 }
 if(args.includes('--prepare')){
  await fs.mkdir(root,{recursive:true});
  await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,entries,drafts:entries.map(draftFor),context:contextFor()},null,2)+'\n');
  await fs.writeFile(`${root}/review-request.json`,JSON.stringify(defaultReviewRequest(entries[0],draftFor(entries[0]),contextFor()),null,2)+'\n');
  console.log('market-content: prepared; pending review; model calls=0');
 }
 if(args.includes('--publish')){
  await approvedDrafts();
  await fs.writeFile(file,JSON.stringify(entries[0].row,null,2)+'\n');
  // Preserve both existing files byte-for-byte outside the approved field.
  const rulesFile='world/meta/rules.json',text=await fs.readFile(rulesFile,'utf8'),old=JSON.parse(text).settlementTrade.pricing,needle=JSON.stringify(old);
  assert.equal(text.split(needle).length,2,'区域价格说明须唯一定位');
  await fs.writeFile(rulesFile,text.replace(needle,JSON.stringify(regionalPricing)));
  const authorFile='world/design/m5-trade-rules.mjs',author=await fs.readFile(authorFile,'utf8');
  assert.equal((author.match(/^    pricing: .+,$/gm)??[]).length,1);
  await fs.writeFile(authorFile,author.replace(/^    pricing: .+,$/m,`    pricing: ${JSON.stringify(regionalPricing)},`));
  console.log('market-content: approved parameters published to world source');
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verifyPublished()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
