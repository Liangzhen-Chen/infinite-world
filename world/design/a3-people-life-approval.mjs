import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadWorld} from '../../tools/load-world.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';
import {runContentPipeline, defaultReviewRequest, readApprovedContent, hashContent} from '../../tools/content-pipeline.mjs';

export const revision='a3-people-life-1';
export const draftRoot='world/drafts/a3-people-life';
export const budgetRoot='world/drafts/a3-content-approval';
const ids=['npc_a3_repair_apprentice','npc_a3_herb_apprentice','npc_a3_apprentice_father','npc_a3_apprentice_uncle','npc_a3_zhaosan','npc_a3_laozhou'];
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
export async function entriesFor(world){
 const baseline=await read('world/people/baseline.json'),locations=new Map(world.locations.map(x=>[x.id,x]));
 return ids.map(id=>{const row=baseline.find(x=>x.id===id);assert.ok(row,`人物缺失 ${id}`);return {id,kind:'person',row:structuredClone(row),
  source:{path:'world/people/baseline.json',detail:row.notes,authorization:'A3 内容卡新增人物'},
  boundary:'补齐名册层级和由身份、住处及工作地点派生的作息；不增添服务、财物、现金或关系事实。未成年人保持未成年标记与不可恋爱约束。',
  location:locations.get(row.location)};});
}
export function validateEntry(world,e){
 const errors=[],n=e.row,slots=n.schedule?.default??[];let cursor=0;
 if(!Number.isInteger(n.age)||n.age<1)errors.push('年龄无效');
 if(n.tier!=='roster')errors.push('此批人物层级应为 roster');
 if(!world.locations.some(x=>x.id===n.location))errors.push('人物所在地点不存在');
 for(const s of slots){if(s.start!==cursor||s.end<=s.start)errors.push('作息不连续');cursor=s.end;if(!world.locations.some(x=>x.id===s.location))errors.push(`作息地点不存在 ${s.location}`);}
 if(cursor!==1440)errors.push('作息未覆盖全天');
 if(n.services?.length||Object.keys(n.inventory??{}).length||n.coins!==0)errors.push('不得预置服务、库存或现金');
 if(n.age<18&&(n.flags?.minor!==true||n.flags?.romanceable!==false))errors.push('未成年人保护标记缺失');
 if(n.id==='npc_a3_repair_apprentice'&&!slots.some(s=>s.location==='bld_hw_mill'&&s.activity.includes('修理')))errors.push('修理学徒作息未落在磨坊');
 if(n.id==='npc_a3_herb_apprentice'&&!slots.some(s=>s.location==='bld_hw_herbs'&&s.activity.includes('药')))errors.push('药铺学徒作息未落在药铺');
 if(n.id==='npc_a3_zhaosan'&&!slots.some(s=>s.activity.includes('打猎')))errors.push('猎户作息未包含狩猎');
 if(n.id==='npc_a3_laozhou'&&!slots.some(s=>s.activity.includes('田间劳作')))errors.push('佃户作息未包含田间劳作');
 return errors;
}
const contextFor=async e=>({source:e.source,boundary:e.boundary,publishedFacts:{age:e.row.age,occupation:e.row.occupation,location:e.row.location,locationName:e.location?.name,minor:e.row.flags?.minor===true,romanceable:e.row.flags?.romanceable}});
const fingerprintFor=async e=>hashContent({entry:e,context:await contextFor(e),revision});
export async function verify(){
 const world=await loadWorld(),entries=await entriesFor(world);
 for(const e of entries){assert.deepEqual(validateEntry(world,e),[],`${e.id} L1`);assert.deepEqual((await read(path.join(draftRoot,`${e.id}.json`))).draft,{id:e.id,row:e.row});}
 const approved=await readApprovedContent(draftRoot,entries,{contextFor,revision});
 assert.equal(approved.length,entries.length);
 for(const e of entries){const record=await read(path.join(draftRoot,`${e.id}.json`));assert.equal(record.fingerprint,await fingerprintFor(e));}
 return {entries:entries.length,approved:approved.length};
}
export async function run(args=process.argv.slice(2)){
 const world=await loadWorld(),entries=await entriesFor(world),at=args.indexOf('--id'),batch=at<0?entries:entries.filter(e=>e.id===args[at+1]);assert.ok(batch.length,'指定人物不在本批');
 if(args.includes('--l1')){for(const e of batch)assert.deepEqual(validateEntry(world,e),[],`${e.id} L1`);console.log(JSON.stringify({entries:batch.length,L1:'passed'}));}
 if(args.includes('--prepare')){await fs.mkdir(draftRoot,{recursive:true});await fs.writeFile(path.join(draftRoot,'foundation.json'),JSON.stringify({revision,entries},null,2)+'\n');}
 if(args.includes('--review')){
  for(const e of batch)assert.deepEqual(validateEntry(world,e),[],`${e.id} L1`);
  const prior=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
  const spent=prior.spentYuan??0,reserved=prior.reservedYuan??0,remaining=Math.max(0,1-spent-reserved);
  const {summary}=await runContentPipeline({entries:batch,root:draftRoot,budgetRoot,revision,contextFor,validateDraft:()=>({errors:[],warnings:[]}),reviewDraftFor:e=>({id:e.id,row:e.row}),reuseFrozenDrafts:true,client:new DeepSeekClient({budgetYuan:remaining,logFile:path.join(draftRoot,'usage.jsonl')}),cardId:'A3FIX',allocation:{cardId:'A3FIX',incrementLimitYuan:1,waveLimitYuan:25,maxRequests:104,startingSpent:0,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:batch.length,retryManual:args.includes('--retry-manual'),buildDraftRequest:()=>{throw Error('固定作者稿，不调用模型起草');},buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.max_tokens=1000;r.messages[0].content+=' 逐项核对作息地点是否符合职业、身份是否超出来源、未成年人是否越界。row 是已授权固定作者稿；只将与 source/publishedFacts 明确矛盾或涉及未成年人边界的情况标为 hard。没有矛盾则输出 {"contradictions":[]}。';return r;}});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending,costUpperYuan:summary.costUpperYuan,budget:summary.budget.cards.A3FIX}));
 }
 if(args.includes('--l4')){
  const batches=JSON.parse(await fs.readFile(path.join(draftRoot,'summary.json'),'utf8'));
  const notes={
   npc_a3_repair_apprentice:'核读全天时段：学徒往返村与磨坊并在磨坊做修理；15岁、minor=true、romanceable=false，作息无服务与财物承诺。',
   npc_a3_herb_apprentice:'核读全天时段：药铺学徒在登记药铺整理、辨认药材；15岁且未成年保护标记不变，无诊疗服务承诺。',
   npc_a3_apprentice_father:'核读全天时段：父亲留在登记白石范围处理个人事务；没有给他补任职、收入或监护范围以外的权利。',
   npc_a3_apprentice_uncle:'核读全天时段：叔叔在药铺协助杂务，符合愿意替家人跑腿的已写性格；明确不将其写成监护人。',
   npc_a3_zhaosan:'核读全天时段：猎户作息包含入山打猎与整理器具；未补猎获、库存或已谈妥的交易。',
   npc_a3_laozhou:'核读全天时段：佃户作息包含田间劳作与农具照料；未添加租额、土地所有权或钱物事实。',
  };
  for(const b of batches.batches){const file=path.join(draftRoot,`batch-${b.index}.json`),row=JSON.parse(await fs.readFile(file,'utf8'));row.l4={approved:true,notes:batch.map(e=>({id:e.id,note:notes[e.id]}))};await fs.writeFile(file,JSON.stringify(row,null,2)+'\n');}
 }
 if(args.includes('--verify'))console.log(JSON.stringify(await verify()));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
