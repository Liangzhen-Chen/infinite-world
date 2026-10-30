// Frozen content proposal, NOT loaded by the game. L2/L4 must precede publish.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {defaultReviewRequest,readApprovedContent,runContentPipeline} from '../../tools/content-pipeline.mjs';
import {DeepSeekClient} from '../../tools/deepseek-client.mjs';

export const revision='k10b-public-maintenance-1',root='world/drafts/k10b-public-maintenance';
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const locations=await read('world/geo/locations.json'),people=await read('world/people/baseline.json'),settlements=await read('world/geo/settlements.json'),rules=await read('world/meta/rules.json');
const proposal=(target,file,field,before,after,basis)=>({id:`${target}-${field.replaceAll('.','-')}`,target,file,field,before,after,basis,
 boundary:'新增待审世界事实，不能从管理人、抄记职业或现实惯例推定产权。不增钱物、不改个人资产、私信与教学器具产权；沿用现有工程、月限额、公库留底、材料与实际工资结算。'});
const gov=settlements.find(r=>r.id==='loc_hw').publicMaintenance;
export const entries=[
 proposal('bld_hw_school','world/geo/locations.json','owner',locations.find(r=>r.id==='bld_hw_school').owner,'loc_hw',[
  'world/geo/locations.json:830-840：学堂在河湾，site.manager=陆青，仅证明管理；没有产权。',
  'world/people/baseline.json:8993 起：陆青为村中教师；notes只证明教学、晚间抄书换收入。',
  '05 §5.1.2（44-46行）：公共资产须有责任主体；拟补登村社公产，属于新增设定，非历史事实复原。']),
 proposal('bld_hw_post','world/geo/locations.json','owner',locations.find(r=>r.id==='bld_hw_post').owner,'faction_bs_government',[
  'world/geo/locations.json:1212-1248：小驿站位于河湾；lodging.host=沈渡，没有产权。',
  'world/people/baseline.json:10972-10985：沈渡抄记官道时刻、信件与公开公告，不证明官产。',
  'world/lore/factions.json:1：白石镇务署为地方官署，原列资产责任仅公署与镇巡值房。拟新增驿站官产，不能声称已有明确驿传主管组织。']),
 proposal('bld_hw_post','world/geo/locations.json','publicMaintenance',undefined,{owner:'faction_bs_government',settlement:'loc_hw',source:'K10b public postal building maintenance delegation'},[
  'world/geo/settlements.json：河湾 parent=loc_bs。拟由产权官署委托河湾负责建筑维护；不把公务邮件或个人休息位置交给村长。']),
 proposal('loc_hw','world/geo/settlements.json','publicMaintenance',gov,{budgetFrom:'ranked_office',powers:['public_project'],source:'K10b village public maintenance charter'},[
  'world/meta/rules.json：agriculture.settlements[loc_hw].manager=陈柏；当前首领身份不等于公共工程拨款权。',
  'world/meta/rules.json:984-1014：现有村长职权及月度额度；拟以同级职务额度为上限，实际可付额仍受公库、留底与已用月额约束，不新增税收或现金。']),
 proposal('treasury','world/meta/rules.json','governance.authority.treasury.settlements',rules.governance.authority.treasury.settlements,[...new Set([...rules.governance.authority.treasury.settlements,'loc_hw'])],[
  'world/meta/rules.json:1151-1182：现有四村公库收支章程不含河湾。此候选只把既有维护支出、留底与工钱规则扩展到河湾现有公账，不扩展税率或征税权。']),
 ...['npc_hw_luqing','npc_hw_shendu'].map(id=>{const n=people.find(r=>r.id===id);return proposal(id,'world/people/baseline.json','relationships',n.relationships,[...n.relationships,{with:'npc_hw_chenbai',type:'公事报修',trust:0,affection:0,note:'设施当班发现失修可向现任河湾负责人报知；实际送达按消息渠道与路程，不披露私人邮件。'}],[
  `world/people/baseline.json#${id}：既有工作地点及职业；目前没有对陈柏的报修关系。新增公事联络渠道，不虚构友谊或信任加分。`,
  '05 §5.4 主观认知/转述通道：消息须有讲者、收件人与实际运输时间。']);})
];
export const draftFor=e=>({id:e.id,field:e.field,value:e.after});
export const contextFor=e=>({sourceFacts:e.basis,before:e.before??null,boundary:e.boundary,ownershipStatus:'候选产权与授权均未发布；既有资料没有确切设立者。'});
export function applyCandidate(world){
 const w=structuredClone(world);
 for(const e of entries){
  const row=e.file.includes('locations')?w.locations.find(r=>r.id===e.target):e.file.includes('baseline')?w.npcs.find(r=>r.id===e.target):e.file.includes('settlements')?w.settlementProfiles.find(r=>r.id===e.target):w.rules;
  const parts=e.field.split('.');let target=row;
  for(const part of parts.slice(0,-1))target=target[part]??={};
  target[parts.at(-1)]=structuredClone(e.after);
 }
 return w;
}
export function validateDraft(d,e){
 try{assert.deepEqual(d,draftFor(e));assert.ok(e.basis.length);assert.ok(e.boundary);return [];}catch(error){return [error.message];}
}
export async function run(args=process.argv.slice(2)){
 if(args.includes('--prepare')||args.includes('--l1')){
  // Reuse the project's world/schema/domain L1; do not substitute a new
  // manifest validator for actual consumers of the proposed world facts.
  const {loadWorld}=await import('../../tools/load-world.mjs');
  const {validateWorld}=await import('../../tools/validate-world.mjs');
  const world=await loadWorld(),baseline=validateWorld(world),candidate=validateWorld(applyCandidate(world));
  const errors=candidate.errors.filter(e=>!baseline.errors.includes(e));
  assert.deepEqual(errors,[],'候选新增 L1 错误');
  await fs.mkdir(root,{recursive:true});
  const rates=new DeepSeekClient().rates;
  const requests=entries.map(e=>defaultReviewRequest(e,draftFor(e),contextFor(e)));
  const firstPassCeilingYuan=requests.reduce((sum,r)=>sum+(Buffer.byteLength(JSON.stringify({model:'deepseek-flash',stream:false,...r}))*rates.miss+r.max_tokens*rates.output)/1e6,0);
  const referenceBudget=await read('world/drafts/s4-offices/budget.json');
  await fs.writeFile(`${root}/cost-estimate.json`,JSON.stringify({rates,requests:requests.length,firstPassCeilingYuan,reference:{file:'world/drafts/s4-offices/budget.json',spentYuan:referenceBudget.spentYuan},modelCalls:0},null,2)+'\n');
  await fs.writeFile(`${root}/candidate.json`,JSON.stringify({revision,entries,drafts:entries.map(draftFor),contexts:entries.map(contextFor)},null,2)+'\n');
  await fs.writeFile(`${root}/l1.json`,JSON.stringify({revision,entries:entries.length,errors,baselineErrors:baseline.errors,candidateErrors:candidate.errors,modelCalls:0,published:false},null,2)+'\n');
  console.log(JSON.stringify({entries:entries.length,errors:errors.length,baselineErrors:baseline.errors.length,modelCalls:0,published:false}));
 }
 if(args.includes('--review')){
  // A main-session supplied budget is required; preparing candidates grants
  // no paid allowance. Same shared-budget gate as the other fixed waves.
  const budget=await read(`${root}/budget.json`),limit=budget.cards?.K10B?.limitYuan;
  assert.ok(Number.isFinite(limit)&&limit>0,'主会话须先提供K10B预算账');
  const {summary}=await runContentPipeline({entries,root:`${root}/review`,budgetRoot:root,revision,contextFor,validateDraft,reviewDraftFor:async e=>draftFor(e),reuseFrozenDrafts:true,
   buildDraftRequest:()=>{throw Error('Frozen candidate');},buildReviewRequest:defaultReviewRequest,client:new DeepSeekClient({budgetYuan:limit,logFile:`${root}/usage.jsonl`}),cardId:'K10B',
   allocation:{cardId:'K10B',incrementLimitYuan:limit,maxRequests:budget.cards.K10B.maxRequests,waveLimitYuan:20,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:2});
  console.log(JSON.stringify({passed:summary.passed,manual:summary.manual,pending:summary.pending}));
 }
 if(args.includes('--publish')){
  const approved=await readApprovedContent(`${root}/review`,entries,{revision,contextFor});assert.equal(approved.length,entries.length);
  for(const e of entries)assert.deepEqual(approved.find(d=>d.id===e.id),draftFor(e));
  // Publication is deliberately a separate, explicit main-session operation.
  // Check all targets before any writes; preserve every unrelated field.
  const files=new Map();
  for(const e of entries){
   if(!files.has(e.file))files.set(e.file,await read(e.file));
   const data=files.get(e.file),row=Array.isArray(data)?data.find(r=>r.id===e.target):data;
   const parts=e.field.split('.');let target=row;
   for(const part of parts.slice(0,-1))target=target[part]??={};
   assert.deepEqual(target[parts.at(-1)],e.before,`${e.id}: 发布前事实已改变`);
   target[parts.at(-1)]=e.after;
  }
  for(const [file,data] of files)await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
  console.log(JSON.stringify({published:approved.length}));
 }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await run();
