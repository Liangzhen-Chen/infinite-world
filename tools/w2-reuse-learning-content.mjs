import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent} from './content-pipeline.mjs';
import {validateDraft as validateBookDraft} from './m4-books-content.mjs';
import {sources,entries as books,contextFor as bookContext,reviewDraftFor as bookDraft,revision} from '../world/design/w2-reuse-learning.mjs';
import {reuseSpellCandidates} from '../world/design/w2-reuse-candidates.mjs';

export {revision};
export const entries=[...books,...sources.mappings.map(mapping=>({id:`source_${mapping.spell}`,category:'learning-source',mapping}))];
const world=await loadWorld(),spells=reuseSpellCandidates();
export function contextFor(entry,sourceWorld=world){
 if(!entry.mapping)return bookContext(entry,sourceWorld);
 const book=books.find(row=>row.id===entry.mapping.book),context=bookContext(book,sourceWorld);
 // The mapping under review is not its own factual authority.
 return {...context,teaches:undefined,spell:spells.find(row=>row.id===entry.mapping.spell),book,
  literacy:sourceWorld.skills.find(row=>row.id==='skill_literacy'),
  certification:sourceWorld.professions.find(row=>row.id==='profession_mage')};
}
export const reviewDraftFor=entry=>entry.mapping?{id:entry.id,source:structuredClone(entry.mapping)}:bookDraft(entry);
export function validateDraft(draft,entry){
 if(!entry.mapping)return validateBookDraft(draft,entry);
 const errors=[],mapping=entry.mapping,spell=spells.find(row=>row.id===mapping.spell),book=books.find(row=>row.id===mapping.book);
 if(hashContent(draft)!==hashContent(reviewDraftFor(entry)))errors.push('学习来源与冻结候选不符');
 if(!book?.book.teaches.includes(spell?.id)||mapping.skill.id!==spell?.skill||mapping.skill.stage!==spell?.stage||mapping.skill.profession!=='profession_mage')errors.push('学习来源引用不闭合');
 if(mapping.readingMinutes!==world.rules.books.readingMinutes[spell?.stage]||mapping.minimumLiteracy!==100||mapping.requiresCertification!==(spell?.stage?'profession_mage':null)||mapping.sourceOwner!==book?.stock.owner||mapping.teachers.length)errors.push('阅读或出售条件不符');
 return {errors,warnings:[]};
}
export async function reviewReuseLearning({retryManual=false}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const root=path.resolve('world/drafts/w2-reuse/learning'),budgetRoot=path.resolve('world/drafts/m4-object');
 const client=new DeepSeekClient({budgetYuan:20,logFile:'logs/t19-learning-usage.jsonl'});
 const requestTransform=async ({body})=>{
  const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
  const issued=Object.values(ledger.requests??{}).filter(row=>row.card==='T19'&&['sent','settled','unknown'].includes(row.status)).length;
  if(issued>=20)throw Object.assign(Error('T19 已达20次调用上限'),{code:'CONTENT_BUDGET_STOP'});
  return {body};
 };
 return runContentPipeline({entries,root,budgetRoot,client,revision,contextFor,validateDraft,
  cardId:'T19',allocation:{cardId:'T19',incrementLimitYuan:1,waveLimitYuan:20},
  concurrency:1,batchSize:17,reuseFrozenDrafts:true,reviewDraftFor,retryManual,requestTransform,
  buildDraftRequest:()=>{throw Error('来源审核禁止模型起草');},
  buildReviewRequest:(entry,draft,context)=>{
   const request=defaultReviewRequest(entry,draft,context);
   request.messages[0].content+=' 本次只审三册书和14条学习来源增量，不重审法术正文。若draft.source存在，逐字段审该学习映射本身，spell、book、seller和actualRules为外部依据；skill.learnFee是原法术教学费，书籍研读不收此费。保存建议不承诺自动耐久变化。';
   request.messages.push({role:'user',content:JSON.stringify({consumerEvidence:{file:'server-plugin/learning.mjs',readingCheck:"this.check(d,{attribute:'智力',difficulty:catalog.learnDifficulty??10},id)",scope:'阅读检定使用智力；skill.attribute=精神是施法属性，不能用它推导阅读检定属性。'}})});
   return request;
  }});
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const result=await reviewReuseLearning({retryManual:process.argv.includes('--retry-manual')});
 console.log(JSON.stringify({total:result.summary.total,passed:result.summary.passed,manual:result.summary.manual,pending:result.summary.pending,card:result.summary.budget.cards.T19}));
}
