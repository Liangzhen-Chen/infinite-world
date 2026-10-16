import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld}from'./load-world.mjs';
import {DeepSeekClient}from'./deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent}from'./content-pipeline.mjs';
import {validateWorld}from'./validate-world.mjs';
import {entries,offers,localFacts,revision,draftFor,applyBatch}from'../world/design/t155-village-wildlife.mjs';
import {WorldEngine}from'../server-plugin/engine.mjs';
import {questPublisher}from'../server-plugin/entity-view.mjs';
export {entries,draftFor};
export const draftRoot=path.resolve('world/drafts/t155-wildlife');
const world=await loadWorld(),engine=new WorldEngine(world),blocklist=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
// V3 derives a board's publisher from the settlement's head instead of the old
// rules.questSources.publishers entry; the reviewed context names that person.
const publisher=board=>questPublisher(engine,{},board).value;
export function contextFor(e){
 const row=offers.find(o=>o.id===e.id),o=(row??(e.id==='t155_wt_rites'?offers.find(o=>o.id==='t155_wt_soul'):null))?.objective;
 const ids=[e.board,publisher(e.board),o?.location,o?.target,o?.species,o?.item,...(o?.offer??[]).map(r=>r.item),...(o?.request??[]).map(r=>r.item)];
 const catalogs=[...world.locations,...world.npcs,...world.monsters,...world.items];
 return {references:ids.filter(Boolean).map(id=>{const x=catalogs.find(x=>x.id===id);return x?{id,name:x.name,...(x.nature?{nature:x.nature}:{}),...(x.basePrice?{basePrice:x.basePrice}:{})}:null;}),
  bosses:world.bosses.filter(b=>(b.actor??b.id)===o?.target).map(b=>({id:b.id,name:b.name,cognition:b.cognition,negotiation:b.negotiation})),
  rules:['八条都是公款托管报酬，D级60铜，期限十日；实际个体在场才出清理单；接单后的指定个体死亡、驱离、度亡回执才可领取一次。',
   '供物和交易复用首领交涉，守界须当面接受；价值与库存限制不变。公署备药沿实物交付。NPC只有交付、到访、建造的执行能力。',
   '驱邪符只驱离非神性低阶恶灵。度亡只用于无主低阶游魂，送至feature_s4_rest_tablet安魂牌，不复活。',
   '地方说明是本批新告示规则的解释，不声称旧有历史；妖怪或异族身份本身不决定敌意。']};
}
export function validateDraft(d,e){
 const errors=[];if(d?.id!==e.id||typeof d.text!=='string'||d.text.length<30||d.text.length>200)errors.push('正文或ID无效');
 if(hashContent(d)!==hashContent(draftFor(e)))errors.push('正文与定稿不符');
 for(const word of [...blocklist.names,...blocklist.realPeople])if(d?.text?.includes(word))errors.push(`原创屏蔽词：${word}`);
 if(/JSON|schema|提示词|生成器/.test(d?.text??''))errors.push('世界外术语');
 return {errors,warnings:[]};
}
function reviewRequest(e,d,c){const r=defaultReviewRequest(e,d,c);r.max_tokens=1000;
 r.messages[0].content+=' 本批是村镇委托及告示规则解释。publishedFacts.rules是本批已实现机制；不虚构原有历史。只报告实际不相容的句子，核对一致的句子不输出。缺省权利与省略不算矛盾。';return r;}
export async function review(){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 await fs.mkdir(draftRoot,{recursive:true});
 try{await fs.access(path.join(draftRoot,'budget.json'));}catch{await fs.writeFile(path.join(draftRoot,'budget.json'),JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:0.8,note:'T155 独立账，单卡最高0.8元'},null,2)+'\n');}
 return runContentPipeline({entries,root:draftRoot,budgetRoot:draftRoot,revision,contextFor,validateDraft,reviewDraftFor:draftFor,reuseFrozenDrafts:true,
  retryManual:process.argv.includes('--retry-manual'),cardId:'T155',allocation:{cardId:'T155',incrementLimitYuan:0.8,waveLimitYuan:25,maxRequests:24,startingSpentYuan:0,startingReservedYuan:0},
  concurrency:1,batchSize:50,client:new DeepSeekClient({budgetYuan:0.8,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('正文由执行会话起草');},buildReviewRequest:reviewRequest,
  requestTransform:async({body,entry})=>{const ledger=JSON.parse(await fs.readFile(path.join(draftRoot,'budget.json'),'utf8'));
   const count=Object.values(ledger.requests??{}).filter(r=>r.label?.includes(`-${entry.id}-review`)&&['sent','settled','unknown'].includes(r.status)).length;
   if(count>=2)throw Object.assign(Error('同条两次L2已用尽'),{code:'CONTENT_BUDGET_STOP'});return {body};}});
}
export async function publish({write=false}={}){
 const approved=await readApprovedContent(draftRoot,entries,{revision,contextFor});
 if(approved.length!==entries.length)throw Error('本批未全部完成L1/L2/L4');
 for(const e of entries)if(hashContent(approved.find(d=>d.id===e.id))!==hashContent(draftFor(e)))throw Error(`定稿已变：${e.id}`);
 const batch=JSON.parse(await fs.readFile(path.join(draftRoot,'batch-0.json'),'utf8')),wave=batch.l4.wave;
 if(wave?.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!entries.some(e=>e.id===r.id)||r.scores?.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5))||wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('L4随机十条评分不足');
 const current=await loadWorld(),next=applyBatch(current),v=validateWorld(next,{stage:'release'});if(!v.ok)throw Error(v.errors.join('\n'));
 if(write){
  // K8 habitats are derived at load time; persist only this card's rule field.
  const rulesFile='world/meta/rules.json',rawRules=JSON.parse(await fs.readFile(rulesFile,'utf8'));rawRules.questSources.wildlife=structuredClone(offers);
  for(const [file,value] of [[rulesFile,rawRules],['world/geo/settlements.json',next.settlementProfiles]]){
   const old=await fs.readFile(file,'utf8'),newline=old.includes('\r\n')?'\r\n':'\n';await fs.writeFile(file,(JSON.stringify(value,null,2)+(old.endsWith('\n')?'\n':'')).replaceAll('\n',newline));}}
 return {published:write,offers:offers.map(o=>o.id),facts:localFacts.map(f=>f.id),release:v.ok};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const errors=entries.flatMap(e=>validateDraft(draftFor(e),e).errors);errors.push(...validateWorld(applyBatch(world),{stage:'release'}).errors);if(errors.length)throw Error(errors.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length}));}
 if(process.argv.includes('--review')){const {summary:s}=await review();console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,budget:s.budget.cards.T155}));}
 if(process.argv.includes('--publish'))console.log(JSON.stringify(await publish({write:true})));
}
