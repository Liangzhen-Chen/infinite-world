// T110/T111 faction clock publication. --batch 1 (T110: first 20 W5 factions by
// ID) or --batch 2 (T111: the other 20 plus the three T142 polities). Each batch
// has its own draft root and independent budget ledger. Modes: --l1, --review,
// --check, --publish (writes world/lore/factions.json and, for reverse relation
// entries and the T142 clocks, the matching sections of world/meta/rules.json).
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {WorldEngine} from '../server-plugin/engine.mjs';
import {assertFactionClockRules} from '../server-plugin/faction-clock.mjs';
import {EXECUTION,REVERSE as REVERSE_1,buildClocks as buildClocks1,batchIds as ids1} from '../world/design/w5-clock-1.mjs';
import {REVERSE as REVERSE_2,LOCKED_REVERSE,buildClocks as buildClocks2,buildFarClocks,batchIds as ids2,farIds} from '../world/design/w5-clock-2.mjs';
export const revision='w5-clock-publication-v1';
const ROOT=path.resolve(import.meta.dirname,'..');
const blocklist=JSON.parse(await fs.readFile(path.join(ROOT,'world/meta/blocklist.json'),'utf8'));

// Reverse relation entries: a relation A->B whose B lacks B->A gets B->A with
// A's score and reason. The lists are fixed in the batch designs; rows that are
// reviewed verbatim elsewhere (T142 polities, T159 societies) are never edited.
export const LOCKED=id=>id.startsWith('faction_far_')||id.startsWith('faction_ms_');
export function missingReverse(factions){
 const out=[];
 for(const f of factions)for(const r of f.relations??[]){
  const target=factions.find(x=>x.id===r.faction);if(target&&!(target.relations??[]).some(x=>x.faction===f.id))out.push([target.id,f.id]);
 }
 return out;
}
const reverseList=batch=>batch===1?REVERSE_1:REVERSE_2;
export function reverseFor(batch,factions){
 return reverseList(batch).map(([target,source])=>{const r=factions.find(f=>f.id===source)?.relations?.find(x=>x.faction===target);if(!r)throw Error(`反向关系缺原条目：${source}->${target}`);return {target,entry:{faction:source,score:r.score,reason:r.reason}};});
}

// The published world after a batch: runtime on W5 rows, reverse relations on
// their targets, reputation relation copies kept equal, T142 clocks in rules.
export function mergeClockBatch(world,batch){
 const next=structuredClone(world),built=batch===1?buildClocks1(next.factions):buildClocks2(next.factions);
 for(const {id,runtime} of built){const f=next.factions.find(f=>f.id===id);f.clock={...f.clock,...runtime,execution:EXECUTION};}
 for(const {target,entry} of reverseFor(batch,world.factions)){
  const f=next.factions.find(f=>f.id===target);if((f.relations??[]).some(r=>r.faction===entry.faction))continue;
  f.relations=[...f.relations??[],entry];if(f.references&&!f.references.includes(entry.faction))f.references=[...f.references,entry.faction];
  const manual=next.rules.reputation?.factions?.find(r=>r.id===target);if(manual)manual.relations=structuredClone(f.relations);
 }
 if(batch===2){
  const far=buildFarClocks(next.factions),old=next.rules.factionClock?.clocks??[];
  next.rules.factionClock={version:1,clocks:[...old.filter(c=>!far.some(x=>x.id===c.id)),...far]};
 }
 return next;
}
// The world as it was before a batch, for review context and world_upgrade tests.
export function withoutClockBatch(world,batch){
 const next=structuredClone(world),own=batch===1?ids1:ids2;
 for(const f of next.factions)if(own.includes(f.id)&&f.clock?.stages){const {settlement,source,cycle,contact,stages,interventions,...plan}=f.clock;f.clock={...plan,execution:'声明式计划，M5接入前不自动推进或兑现'};}
 for(const [target,source] of reverseList(batch)){
  const f=next.factions.find(f=>f.id===target);if(!f)continue;f.relations=(f.relations??[]).filter(r=>r.faction!==source);
  if(f.references?.includes(source)&&!JSON.stringify(f.clock??{}).includes(source))f.references=f.references.filter(id=>id!==source);
  const manual=next.rules.reputation?.factions?.find(r=>r.id===target);if(manual)manual.relations=structuredClone(f.relations);
 }
 if(batch===2&&next.rules.factionClock){next.rules.factionClock.clocks=next.rules.factionClock.clocks.filter(c=>!farIds.includes(c.faction));if(!next.rules.factionClock.clocks.length)delete next.rules.factionClock;}
 // RW-07 faith competition (rules.faith.competition) was published after both
 // clock batches; the pre-batch edition derives no faith:* clocks for its
 // churches, so the materialised rows leave with the switch.
 if(next.rules.faith?.competition!==undefined)delete next.rules.faith.competition;
 if(next.rules.factionClock){next.rules.factionClock.clocks=next.rules.factionClock.clocks.filter(c=>!String(c.id).startsWith('faith:'));if(!next.rules.factionClock.clocks.length)delete next.rules.factionClock;}
 return next;
}

// ---------------------------------------------------------------- content
const cfg=batch=>({card:batch===1?'T110':'T111',root:path.join(ROOT,`world/drafts/w5/clock-${batch}`)});
const loaded=await loadWorld();
const MAX_REQUESTS=70,LIMIT_YUAN=1.5;
export function batchContext(batch){
 // Review context is the world before this batch, stable before and after publication.
 const before=batch===1?withoutClockBatch(withoutClockBatch(loaded,2),1):withoutClockBatch(loaded,2),after=mergeClockBatch(before,batch);
 const byId=id=>Object.values(after).filter(Array.isArray).flat().find(r=>r?.id===id);
 const name=id=>byId(id)?.name??id;
 const rules=[...after.factions.filter(f=>f.clock?.stages&&(batch===1?ids1:ids2).includes(f.id)).map(f=>({...f.clock,faction:f.id})),...(batch===2?after.rules.factionClock.clocks.filter(c=>farIds.includes(c.faction)):[])];
 const cost=c=>[c.coins?`${c.coins}铜`:'',...Object.entries(c.items??{}).map(([i,n])=>`${name(i)}×${n}`)].filter(Boolean).join('、')||'无';
 const cond=c=>({always:'无前置条件',asset:`公库至少${c.minimum?.coins??0}铜`,relation:`与${name(c.target)}的关系不低于${c.minimum}`,dispute:`与${name(c.target)}的争端处于${{open:'进行中',settled:'已了结',escalated:'升级'}[c.status]}`,intervention:'仅在玩家改道成功后'}[c.kind]);
 const effect=e=>({rumor:`由${(e.carriers??[]).map(name).join('、')}传开：${e.claim}`,relation:`对${name(e.target)}的关系${e.delta>0?'+':''}${e.delta}`,dispute:`与${name(e.target)}的争端转为${{open:'进行中',settled:'已了结',escalated:'升级'}[e.status]}`,
  standing:`${name(e.holder)}对本势力的观感${e.delta>0?'+':''}${e.delta}`,regional_quote:'当地粮价按现有余粮重新登记',wildlife_stir:`${name(after.rules.wildlife.habitats.find(h=>h.id===e.habitat)?.location)}一带野物躁动一周`}[e.kind]??e.kind);
 const reverse=reverseFor(batch,before.factions);
 const entries=rules.map(r=>{const f=after.factions.find(f=>f.id===r.faction);return {id:f.id,rev:1,name:f.name,kind:f.kind,region:f.region,contactPlace:name(f.contactAnchor),treasuryCopper:f.resources.treasuryCopper,
  relations:(f.relations??[]).map(x=>({with:name(x.faction),score:x.score})),
  clock:{name:r.name,trigger:f.clock.trigger,proseStages:f.clock.stageEffects.map(s=>s.effect),counterplay:f.clock.counterplay,everyDays:r.intervalDays,probability:r.probability,restartsYearly:r.cycle==='year'},
  running:r.stages.map(s=>({name:s.name,condition:cond(s.condition),cost:cost(s.cost??{}),effects:(s.effects??[]).map(effect)})),
  interventions:r.interventions.map(a=>({name:a.name,at:r.stages.find(s=>s.id===a.stage).name,place:name(a.location),cost:cost(a.cost??{}),check:a.attribute?`${a.attribute}检定难度${a.difficulty}`:'无检定',result:{pause:'暂缓',resume:'恢复',redirect:`改走“${r.stages.find(s=>s.id===a.nextStage)?.name}”`}[a.effect]})),
  reverseRelations:reverse.filter(x=>x.target===f.id).map(x=>({from:name(x.entry.faction),score:x.entry.score}))};});
 const draftFor=e=>{const r=rules.find(r=>r.faction===e.id),f=after.factions.find(f=>f.id===e.id);
  return {id:e.id,altStage:r.stages.find(s=>s.id==='alt').name,rumors:r.stages.flatMap(s=>s.effects.filter(x=>x.kind==='rumor').map(x=>x.claim)),
   interventions:r.interventions.map(a=>a.name),...(farIds.includes(e.id)?{}:{execution:f.clock.execution}),reverseReasons:reverse.filter(x=>x.target===e.id).map(x=>x.entry.reason)};};
 const contextFor=e=>{const f=after.factions.find(f=>f.id===e.id),loc=byId(f.contactAnchor);
  return {facts:['势力时钟按周或按月到期，按概率核对条件；条件满足才扣势力公库并产生效果，资源不足就停在原阶段。','传述由列出的居民带回，说的是“听说”，不等于他们亲见；不新增钱物、官职或处罚。',
   '玩家只能在势力登记联络点办理暂缓、撤回或改道，登记点不是总部，也不会把远方的人叫到现场。'],
   faction:{publicDescription:f.publicDescription,conduct:f.prose?.conduct},contactPlace:{name:loc?.name,description:loc?.description?String(loc.description).slice(0,140):undefined},
   partners:(f.relations??[]).map(x=>({name:name(x.faction),publicDescription:String(byId(x.faction)?.publicDescription??'').slice(0,120),reason:x.reason}))};};
 return {before,after,entries,draftFor,contextFor,reverse};
}

// ---------------------------------------------------------------- L1
const outside=/引擎|M5|faction_|item_|npc_|loc_|玩家|候选|编号|系统|JSON|提示词|阶段/;
export function validateDraft(d,e){
 const errors=[],warnings=[];
 if(!d||d.id!==e.id)return{errors:['id 与条目不符'],warnings};
 const text=[d.altStage,...d.rumors,...d.interventions].join('\n');
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`原创屏蔽:${word}`);
 if(outside.test(text))errors.push('场外信息泄漏');
 if(/\d/.test(text))errors.push('新增文字含未经设计的数字');
 for(const claim of d.rumors)if(claim.length<20||claim.length>80)errors.push('传述长度不符');
 if(new Set(d.interventions).size!==d.interventions.length)errors.push('干预名称重复');
 if(!d.altStage||d.altStage.length>16)errors.push('改道阶段名长度不符');
 return{errors,warnings};
}
export function validateBatch(batch,{after}=batchContext(batch)){
 const errors=[];const v=validateWorld(after,{stage:'release'});if(!v.ok)errors.push(...v.errors);
 try{assertFactionClockRules(new WorldEngine(after));}catch(err){errors.push(err.message);}
 const ids=batch===1?ids1:[...ids2,...farIds];
 for(const id of ids){const f=after.factions.find(f=>f.id===id);const rule=f.clock?.stages?f.clock:after.rules.factionClock?.clocks.find(c=>c.faction===id);
  if(!rule?.stages?.length)errors.push(`${id}:缺少可执行阶段`);else if(rule.stages.length!==f.clock.stageEffects.length+1)errors.push(`${id}:阶段与已审核计划不符`);}
 for(const r of after.rules.reputation?.factions??[]){const f=after.factions.find(f=>f.id===r.id);if(f&&hashContent(f.relations??[])!==hashContent(r.relations??[]))errors.push(`${r.id}:声望关系副本不一致`);}
 return errors;
}

// ---------------------------------------------------------------- L2
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创中世纪幻想世界里一个势力计划的正式运行设定核对。skeleton给出该势力已审核的计划（名称、触发、三个阶段、对策）与本次落实的运行阶段：每阶段的条件、公库代价、产生的效果（关系、争端、观感、传述等），以及玩家在登记联络点可办理的干预；draft是本次新写的文字：改道后的结局名、传述、干预名称、执行说明与补上的反向关系理由。'+
  '只核对draft是否与skeleton或publishedFacts相反：传述内容与对应阶段不符、干预名称与已审核对策或势力做法相反、改道结局与势力目标或对策矛盾、反向关系理由与原关系相反、执行说明夸大为必然发生。传述是听来的说法，可用“听说”“据说”；正常的概括与感官细节不是新增机制。每个hard必须指出实际不相容的两个值。'+
  '核对一致的句子不输出：一律不出现在数组中，也不能标hard；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 r.messages.push({role:'user',content:'再次说明：contradictions 数组只放与 skeleton 或 publishedFacts 实际相反的句子。核对一致的句子不输出；只是概括、省略或塑造的句子也不输出。没有矛盾时只输出 {"contradictions":[]}。'});
 return r;
}
export async function reviewClockBatch(batch,{retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const {card,root}=cfg(batch),ctx=batchContext(batch);await fs.mkdir(root,{recursive:true});
 const ledger=path.join(root,'budget.json');
 try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:`${card} 独立预算账（用户指定）；不与其他卡共用`},null,2)+'\n');}
 const chosen=ids?ctx.entries.filter(e=>ids.includes(e.id)):ctx.entries;
 return runContentPipeline({entries:chosen,root,budgetRoot:root,revision,contextFor:ctx.contextFor,validateDraft,reviewDraftFor:ctx.draftFor,reuseFrozenDrafts:true,retryManual,
  cardId:card,allocation:{cardId:card,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(root,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error(`${card}文字由执行会话起草，禁止模型起草`);},buildReviewRequest,
  requestTransform:async({body})=>{const l=JSON.parse(await fs.readFile(ledger,'utf8'));const issued=Object.values(l.requests??{}).filter(r=>r.card===card&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${card}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}

// ---------------------------------------------------------------- publication
export async function readClockPublication(batch){
 const {root}=cfg(batch),ctx=batchContext(batch);
 const approved=await readApprovedContent(root,ctx.entries,{contextFor:ctx.contextFor,revision});
 const missing=ctx.entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of ctx.entries){const d=approved.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(ctx.draftFor(e)))throw Error(`已审核文字与设计稿不符：${e.id}`);}
 const summary=JSON.parse(await fs.readFile(path.join(root,'summary.json'),'utf8')),idset=new Set(ctx.entries.map(e=>e.id));
 const wave=(await Promise.all(summary.batches.map(async b=>JSON.parse(await fs.readFile(path.join(root,`batch-${b.index}.json`),'utf8')).l4?.wave??[]))).flat();
 if(wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!idset.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return ctx;
}
async function writeJSONLike(target,value){
 const old=await fs.readFile(target,'utf8'),crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,/^[[{]\n/.test(plain)?2:undefined)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`;await fs.writeFile(temp,text);await fs.rename(temp,target);
}
export async function publishClockBatch(batch,{publish=false}={}){
 const ctx=await readClockPublication(batch),current=mergeClockBatch(loaded,batch);// idempotent on the loaded world
 const errors=validateBatch(batch,{after:current});if(errors.length)throw Error(errors.join('\n'));
 if(publish){
  await writeJSONLike(path.join(ROOT,'world/lore/factions.json'),current.factions);
  // rules.json: only the reputation relation copies and factionClock change;
  // factionClock sits before worldClock so later sections stay untouched.
  const file=path.join(ROOT,'world/meta/rules.json'),rules=JSON.parse(await fs.readFile(file,'utf8'));
  rules.reputation.factions=current.rules.reputation.factions;
  // Only authored clocks are written; the faith:* rows are derived at load (materializeFaithClocks).
  const authored=current.rules.factionClock&&{...current.rules.factionClock,clocks:current.rules.factionClock.clocks.filter(c=>!String(c.id).startsWith('faith:'))};
  let out=rules;
  if(authored&&!rules.factionClock){out={};for(const [k,v] of Object.entries(rules)){if(k==='worldClock')out.factionClock=authored;out[k]=v;}}
  else if(authored)out.factionClock=authored;
  await writeJSONLike(file,out);
 }
 return {published:publish,batch,clocks:ctx.entries.length,reverse:ctx.reverse.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const i=process.argv.indexOf('--batch'),batch=Number(process.argv[i+1]);if(![1,2].includes(batch))throw Error('需要 --batch 1|2');
 if(process.argv.includes('--l1')){const ctx=batchContext(batch),bad=[];for(const e of ctx.entries){const v=validateDraft(ctx.draftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);}
  bad.push(...validateBatch(batch,ctx).map(x=>`batch: ${x}`));if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',batch,entries:ctx.entries.length,reverse:ctx.reverse.length,lockedReverse:LOCKED_REVERSE.length}));}
 if(process.argv.includes('--review')){const j=process.argv.indexOf('--ids');const {summary:s}=await reviewClockBatch(batch,{retryManual:process.argv.includes('--retry-manual'),ids:j<0?null:process.argv[j+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[cfg(batch).card]}));}
 if(process.argv.includes('--publish')||process.argv.includes('--check'))console.log(JSON.stringify(await publishClockBatch(batch,{publish:process.argv.includes('--publish')})));
}
