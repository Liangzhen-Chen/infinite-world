// T108 festival publication: L1 checks, real DeepSeek L2 review, L4 wave and
// the write of world/lore/festivals.json. Prose comes from the L1/L2/L4
// approved W5 candidate; this card only adds venue locations, running
// parameters, effects and (for venues without a resident) the host requirement.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {validateFestivalRuntime} from '../server-plugin/festival.mjs';
import {assertEffect} from '../server-plugin/effects.mjs';
import {scheduleAt} from '../server-plugin/npc-schedule.mjs';
import {revision,overlays,publishFestivals} from '../world/design/w5-festival-publication.mjs';
export {revision};
const CARD='T108',MAX_REQUESTS=70,LIMIT_YUAN=1.5;
const w5Root=path.resolve(import.meta.dirname,'../world/drafts/w5');
export const draftRoot=path.join(w5Root,'festival-publication');
// Independent ledger for this card (user instruction): never shared with other cards.
const budgetRoot=draftRoot;
export const ENTRY_REVISIONS={};
const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
// Review context is the world without festivals, identical before and after publication.
const loaded=await loadWorld(),world=structuredClone(loaded);delete world.festivals;
export const candidate=JSON.parse(await fs.readFile(path.join(w5Root,'festivals-candidate.json'),'utf8'));
export const published=publishFestivals(candidate);
const byId=id=>Object.values(world).filter(Array.isArray).flat().find(r=>r?.id===id);
const name=id=>byId(id)?.name??id;
const time=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const effectText=e=>e.kind==='standing'?`${name(e.holder)}对参加者的观感${e.delta>0?'提升':'下降'}${Math.abs(e.delta)}（${e.reason}）`:e.kind==='rumor'?`在场者${e.carriers.map(name).join('、')}之后会讲起：${e.claim}`:e.kind;

// ---------------------------------------------------------------- entries
export const entries=published.map(f=>({id:f.id,rev:ENTRY_REVISIONS[f.id]??1,name:f.name,date:`春历${f.calendar.month}月${f.calendar.day}日（年度候选日，条件不满足则不办）`,
 venue:{region:f.venue.region,place:name(f.venue.location),spot:f.venue.description},condition:f.condition,custom:f.custom,
 participation:{...f.participation,materials:f.resourceNeeds.map(n=>`${name(n.item)}×${n.quantity}（${{consume:'用掉',borrow:'借用后归还',transfer:'当面交换'}[n.use]}，参加者自带）`)},
 permission:f.permission,
 running:{status:f.runtime.status==='active'?'可以正式举办':'暂不举办，等候主办人',kind:f.runtime.kind==='market'?'集市':'仪式',start:time(f.runtime.startMinute),durationMinutes:f.runtime.durationMinutes,minimumParticipants:f.runtime.minimumParticipants,
  ...(f.runtime.host?{host:`${name(f.runtime.host)}（${byId(f.runtime.host).occupation}）`}:{}),effectsWhenHeld:f.runtime.effects.map(effectText)}}));
export function reviewDraftFor(e){
 const f=published.find(f=>f.id===e.id),rumors=f.runtime.effects.filter(x=>x.kind==='rumor');
 return {id:f.id,prose:f.prose,...(rumors.length?{rumors:rumors.map(r=>r.claim)}:{}),effectReasons:f.runtime.effects.filter(x=>x.kind==='standing').map(x=>x.reason),...(f.runtime.hostRequirement?{hostRequirement:f.runtime.hostRequirement}:{})};
}
const shortText=(t,n=140)=>t?String(t).slice(0,n):undefined;
export function contextFor(e){
 const f=published.find(f=>f.id===e.id),loc=byId(f.venue.location),host=f.runtime.host&&byId(f.runtime.host);
 return {facts:['节日是有条件的年度活动：到日期不自动发生，条件、场地同意、主办人到场与参加者自带材料都满足才举办。',
   '活动免费旁听；材料由参加者自带，借用物归还、交换物当面交换，只有用掉的材料扣除。','举办后只产生已列出的观感变化与在场者的传述，不发放钱物、不迁移人物。',
   '远方地点目前没有登记在册的常住人物，因此那里的节日暂不举办，也不会把远方的人移到现场。'],
  venue:{name:loc.name,description:shortText(loc.description,160)},
  ...(host?{host:{name:host.name,occupation:host.occupation,notes:shortText(host.notes,120)}}:{}),
  culture:shortText(byId(f.culture)?.description,160),organizer:{name:name(f.organizer),publicDescription:shortText(byId(f.organizer)?.publicDescription,160)}};
}

// ---------------------------------------------------------------- L1
const outside=/引擎|M5|工具调用|festival_|faction_|item_|npc_|loc_|玩家|候选|编号|系统|JSON|提示词/;
export function validateDraft(d,e){
 const errors=[],warnings=[],f=published.find(f=>f.id===e.id);
 if(!d||d.id!==e.id)return{errors:['id 与条目不符'],warnings};
 if(hashContent(d.prose)!==hashContent(candidate.festivals.find(r=>r.id===e.id).prose))errors.push('已审核正文被改写');
 const extra=[...(d.rumors??[]),...(d.effectReasons??[]),d.hostRequirement??''].join('\n');
 for(const word of [...blocklist.names,...blocklist.realPeople])if(extra.includes(word))errors.push(`原创屏蔽:${word}`);
 if(outside.test(extra))errors.push('场外信息泄漏');
 if(/\d/.test(extra))errors.push('新增文字含未经设计的数字');
 for(const claim of d.rumors??[])if(claim.length<20||claim.length>80)errors.push('传述长度不符');
 if(d.hostRequirement&&!/尚无登记在册的(常住人物|值守人)/.test(d.hostRequirement))errors.push('等候主办须说明原因');
 if(f.runtime.status!=='active'&&!d.hostRequirement)errors.push('暂不举办的节日缺少主办条件');
 return{errors,warnings};
}
// Global L1: the merged world passes the release build, the runtime check, the
// effect table, and each active host is at the venue at the start time.
export function validateBatch(){
 const errors=[],next={...structuredClone(loaded),festivals:published};
 errors.push(...validateFestivalRuntime(next));
 const v=validateWorld(next,{stage:'release'});if(!v.ok)errors.push(...v.errors);
 let engine;try{engine=new WorldEngine(next);}catch(err){return [...errors,err.message];}
 for(const f of published){
  if(!engine.world.locations.some(l=>l.id===f.venue.location))errors.push(`${f.id}:场地不存在`);
  for(const e of f.runtime.effects)try{assertEffect(engine,e,'festival');}catch(err){errors.push(`${f.id}:${err.message}`);}
  if(f.runtime.status==='active'){
   const day=((f.calendar.month-1)*30+f.calendar.day-1)*1440,slot=scheduleAt(engine,f.runtime.host,day+f.runtime.startMinute);
   if(slot?.location!==f.venue.location||slot.end<f.runtime.startMinute+f.runtime.durationMinutes)errors.push(`${f.id}:主办人按作息不在场`);
  }
 }
 return errors;
}

// ---------------------------------------------------------------- L2
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创中世纪幻想世界里一条已审核节日的正式发布核对。draft.prose是此前审核通过的节日正文；skeleton给出本次落实的举办地、开始时刻、时长、主办人（或暂不举办的原因）以及举办后产生的观感变化与传述。'+
  '只核对：正文、传述与主办条件是否与skeleton或publishedFacts相反（例如时间段明显冲突、举办地或主办人身份不符、把借用物写成用掉、把有条件活动写成必然发生、传述新增了未列出的钱物或处罚）。节日正文写的是习俗过程，不必重述地点名、时刻或主办人；正常的感官细节不是新增机制。每个hard必须指出实际不相容的两个值。'+
  '核对一致的句子不输出：一律不出现在数组中，也不能标hard；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 r.messages.push({role:'user',content:'再次说明：contradictions 数组只放与 skeleton 或 publishedFacts 实际相反的句子。核对一致的句子不输出；只是概括、省略或塑造的句子也不输出。没有矛盾时只输出 {"contradictions":[]}。'});
 return r;
}
export async function reviewPublication({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 await fs.mkdir(budgetRoot,{recursive:true});
 const ledger=path.join(budgetRoot,'budget.json');
 try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:'T108 独立预算账（用户指定）；不与其他卡共用'},null,2)+'\n');}
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T108正文沿用已审核候选，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}

// ---------------------------------------------------------------- publication
export async function readFestivalPublication(root=draftRoot){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 const missing=entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of entries){const d=approved.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);const v=validateDraft(d,e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const summary=JSON.parse(await fs.readFile(path.join(root,'summary.json'),'utf8')),ids=new Set(entries.map(e=>e.id));
 const wave=(await Promise.all(summary.batches.map(async b=>JSON.parse(await fs.readFile(path.join(root,`batch-${b.index}.json`),'utf8')).l4?.wave??[]))).flat();
 if(wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return published;
}
async function writeLike(target,value){
 const text=JSON.stringify(value,null,2)+'\n',temp=`${target}.${randomUUID()}.tmp`;
 await fs.writeFile(temp,text);await fs.rename(temp,target);
}
export async function publishFestivalsCatalog({root=path.resolve(import.meta.dirname,'../world'),publish=false}={}){
 const rows=await readFestivalPublication(),errors=validateBatch();if(errors.length)throw Error(errors.join('\n'));
 if(publish)await writeLike(path.join(root,'lore/festivals.json'),rows);
 return {published:publish,festivals:rows.length,active:rows.filter(r=>r.runtime.status==='active').map(r=>r.id)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);}
  bad.push(...validateBatch().map(x=>`batch: ${x}`));if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,active:overlays.filter(o=>o.host).length}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewPublication({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--publish')||process.argv.includes('--check'))console.log(JSON.stringify(await publishFestivalsCatalog({publish:process.argv.includes('--publish')})));
}
