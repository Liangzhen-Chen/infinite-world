// T105/T106: review and publication entry for the W4-B2/B3 boss batches,
// modelled on w4-b1. Prose is authored in world/design; DeepSeek only reviews.
// Each card keeps its own budget ledger inside its drafts folder.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,hashContent,rowFingerprintShape} from './content-pipeline.mjs';
import {validateDraft as validateBossDraft} from './m4-batch2-content.mjs';
import {validateBossEcology} from '../server-plugin/bosses.mjs';
import {validateBossCognition} from '../server-plugin/boss-cognition.mjs';
import {validateBossNegotiation} from '../server-plugin/boss-negotiation.mjs';
import {TACTIC_NAMES} from '../world/design/w4-boss-batch.mjs';

export const BATCHES={
 'w4-b2':{card:'T105',design:'../world/design/w4-b2.mjs',limitYuan:.75,maxRequests:30},
 'w4-b3':{card:'T106',design:'../world/design/w4-b3.mjs',limitYuan:.75,maxRequests:30},
};
const world=await loadWorld();
const name=id=>world.items.find(i=>i.id===id)?.name??world.locations.find(l=>l.id===id)?.name??world.monsters.find(m=>m.id===id)?.name??id;

export async function bossBatch(batch){
 const spec=BATCHES[batch];if(!spec)throw Error(`未知批次 ${batch}`);
 const design=await import(new URL(spec.design,import.meta.url));
 const {revision,bosses,bossDraft,elements}=design;
 const entries=bosses.map(b=>({...b,category:'boss'}));
 const draftRoot=path.resolve(`world/drafts/${batch}`);
 function contextFor(e){
  const s=world.monsters.find(m=>m.id===e.monster),npc=e.actor?world.npcs.find(n=>n.id===e.actor):null;
  const itemIds=[...new Set([...e.drops.map(d=>d.item),...(e.negotiation?.stock??[]).map(d=>d.item),...(e.negotiation?.accepts??[])])];
  return {
   species:{id:s.id,name:s.name,habits:s.habits,grouping:s.grouping,tags:s.tags,...(s.nature?{nature:{lineage:s.nature.lineage,group:s.nature.group,affinity:s.nature.affinity}}:{})},
   location:{id:e.lair,name:name(e.lair)},
   ...(e.residence.habitat?{habitat:{id:e.residence.habitat,location:name(world.rules.wildlife.habitats.find(h=>h.id===e.residence.habitat).location)},replacement:name(e.residence.replacementSpecies[0])}:{}),
   items:itemIds.map(id=>({id,name:name(id)})),
   elementMultipliers:Object.fromEntries(Object.entries(elements[e.id]).map(([t,m])=>[TACTIC_NAMES[t],m])),
   combat:'同类战术自第二次既往使用后开始适应，每步减少10%伤害，最高30%；只有实际命中的反击计数，按every与belowHpPercent触发effectSpec状态，最多duration分钟。dazzle弱点须睁眼且状态未消耗未过期；fear弱点须恐惧未过期。体表与材质标签(tags)经交互规则表给出各元素伤害倍数(elementMultipliers)，物种明确的弱点/抗性优先。',
   ecology:e.actor?'社会首领：身体即聚居地完整居民，死亡后不从野生种群补刷，由聚居地自己的争端决定后续。':'巢穴原个体不复生，死亡后空置vacancyDays天才从当地实际种群迁入replacementSpecies。掉落留在尸体，取材后才到背包。部下为同种，按minionCount从当地种群抽取。',
   ...(npc?{resident:{name:npc.name,occupation:npc.occupation,age:npc.age,society:name(npc.society),currentConcern:npc.currentConcern,redLines:npc.redLines,inventory:npc.inventory}}:{}),
   ...(e.negotiation?{negotiation:'仅记录实际在场到访与交锋。defend_territory只接受respect_territory，曾在领地内进攻者拒绝交换与结盟；avoid_conflict接受两种和平条件，曾进攻者只能和平不能结盟。只收accepts物品，按目录价格估值，交付价值不少于所索且双方有实物才成交。进攻破约，盟约不提供自动援战或驯服。'+(e.actor?'居民首领的库存就是其完整档的随身物品；非聚居地首领不能代表聚居地立贸易、朝贡或通行约定。对聚居地成员发起交锋会使整个聚居地转为敌对。':'')}:{}),
  };
 }
 function validateDraft(d,e){
  const v=validateBossDraft(d,e),locations=new Set(world.locations.map(l=>l.id)),items=new Set(world.items.map(i=>i.id));
  v.errors.push(...validateBossEcology({...world,bosses:[...world.bosses.filter(b=>b.id!==e.id&&!bosses.some(x=>x.id===b.id)),e]}),...validateBossCognition(e,locations),...validateBossNegotiation(e,items));
  return v;
 }
 async function review({retryManual=false}={}){
  if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
  const ledger=path.join(draftRoot,'budget.json');
  try{await fs.access(ledger);}catch{await fs.mkdir(draftRoot,{recursive:true});await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,limitYuan:20},null,2)+'\n');}
  return runContentPipeline({entries,root:draftRoot,budgetRoot:draftRoot,revision,contextFor,validateDraft,reviewDraftFor:bossDraft,reuseFrozenDrafts:true,retryManual,
   cardId:spec.card,allocation:{cardId:spec.card,incrementLimitYuan:spec.limitYuan,waveLimitYuan:20,maxRequests:spec.maxRequests,startingSpentYuan:0,startingReservedYuan:0},concurrency:4,batchSize:entries.length,
   client:new DeepSeekClient({budgetYuan:20,logFile:path.join(draftRoot,'usage.jsonl')}),
   buildDraftRequest:()=>{throw Error(`${spec.card}正文由执行会话起草，禁止模型起草`);},
   buildReviewRequest:(e,d,c)=>{const r=defaultReviewRequest(e,d,c);r.messages[0].content+='本条是原创幻想世界的首领。按skeleton.mechanics与publishedFacts逐句核对：适应战术、反击触发次数与生命阈值、状态与时长、弱点所需状态、elementMultipliers给出的元素伤害倍数（多五成=1.5，减半=0.5，少两成半=0.75）、巢穴与迁入者、部下、掉落、驯服与谈判条件。核对一致的句子不输出。相容的感官与巢穴细节允许；外貌不代表额外能力；对没有自动援战或驯服的否定不是新增功能。minionCount只数部下不含首领。物资名称以publishedFacts.items的id/name对应为准。居民首领的来历只核对是否与resident事实相容，不要求重述全部生平。每个hard必须指出实际不相等或不相容的两个值。无矛盾则空数组。';return r;}});
 }
 // Approved drafts. Same gates as readApprovedContent; in addition an entry
 // left manual after its single allowed rerun counts only when the L4 reader
 // recorded, for every hard item, the exact quote ruled a false positive
 // (the reviewer's own reason states the values agree). Nothing else is waived.
 async function approvedContent(root){
  const read=async f=>{try{return JSON.parse(await fs.readFile(path.join(root,f),'utf8'));}catch(e){if(e.code==='ENOENT')return null;throw e;}};
  const summary=await read('summary.json');if(!summary)throw Error('缺少流水线摘要');
  const batches=await Promise.all(summary.batches.map(b=>read(`batch-${b.index}.json`)));
  const ruled=(b,id,quote)=>(b.l4.adjudications??[]).some(a=>a.id===id&&a.quote===quote&&a.ruling==='误报'&&typeof a.note==='string'&&a.note.trim());
  const out=[];
  for(const [i,b]of batches.entries()){
   if(!b?.l4?.approved||b.fingerprint!==summary.batches[i].fingerprint||!Array.isArray(b.ids))throw Error(`批 ${i} 尚未完成 L4`);
   const rows=await Promise.all(b.ids.map(id=>read(`${id}.json`)));
   if(rows.some(r=>!r)||hashContent(rows.map(rowFingerprintShape))!==b.fingerprint)throw Error(`批 ${i} 审查后内容已改变`);
   for(const id of [...b.sample,...b.flagged,...b.manual])if(!b.l4.notes?.some(n=>n.id===id&&typeof n.note==='string'&&n.note.trim()))throw Error(`缺少 L4 阅读记录 ${id}`);
   const unresolved=rows.filter(r=>r.status==='manual'&&!(r.errors.length&&r.errors.every(h=>h?.severity==='hard'&&ruled(b,r.id,h.quote))));
   if(rows.some(r=>r.status==='pending')||unresolved.length/b.count>.1)throw Error(`批 ${i} 人工队列超过 10%`);
   for(const r of rows){
    const e=entries.find(x=>x.id===r.id);if(!e)throw Error(`批次含未知条目 ${r.id}`);
    if(r.fingerprint!==hashContent({entry:e,context:contextFor(e),revision}))throw Error(`发布骨架或引用事实已改变 ${e.id}`);
    if(r.status==='passed'&&r.errors.length)throw Error(`条目事实审查未通过 ${e.id}`);
    if(r.status==='passed'||!unresolved.includes(r))out.push(r.draft);
   }
  }
  return entries.map(e=>out.find(d=>d.id===e.id)).filter(Boolean);
 }
 async function candidate(){
  const rows=await approvedContent(draftRoot);if(rows.length!==bosses.length)throw Error(`${batch}首领未全部通过`);
  const out={bosses:bosses.map(b=>({...b,...rows.find(d=>d.id===b.id).prose}))};
  await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(out,null,2)+'\n');return out;
 }
 async function readPublication(root=draftRoot){
  const approved=await approvedContent(root);
  if(approved.length!==bosses.length)throw Error(`${batch}首领未完成审核`);
  for(const e of entries){const v=validateDraft(approved.find(d=>d.id===e.id),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
  const publication={bosses:bosses.map(b=>({...b,...approved.find(d=>d.id===b.id).prose}))};
  if(hashContent(JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8')))!==hashContent(publication))throw Error('候选与已审核内容不符');
  const b=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8')),wave=b.l4.wave,ids=new Set(bosses.map(x=>x.id));
  if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||wave.flatMap(r=>r.scores).reduce((a,n)=>a+n,0)/60<4)throw Error('波次随机10条六项评分未达标');
  return publication;
 }
 function merge(base,publication){
  const next=structuredClone(base),map=new Map(next.bosses.map(b=>[b.id,b]));
  for(const b of publication.bosses){if(map.has(b.id)&&hashContent(map.get(b.id))!==hashContent(b))throw Error(`正式条目冲突：${b.id}`);map.set(b.id,structuredClone(b));}
  next.bosses=[...map.values()];return next;
 }
 async function publish({root=path.resolve('world'),publish=false}={}){
  const base=await loadWorld(root),publication=await readPublication(path.join(root,`drafts/${batch}`)),next=merge(base,publication),validation=validateWorld(next);
  if(!validation.ok)throw Error(validation.errors.join('\n'));
  const file='meta/bosses.json',target=path.join(root,file),changed=hashContent(base.bosses)===hashContent(next.bosses)?[]:[file];
  if(publish&&changed.length){const old=await fs.readFile(target,'utf8'),newline=old.includes('\r\n')?'\r\n':'\n',indent=old.trimEnd().includes('\n')?2:undefined,temp=`${target}.${randomUUID()}.tmp`,handle=await fs.open(temp,'wx');try{await handle.writeFile((JSON.stringify(next.bosses,null,indent)+'\n').replaceAll('\n',newline));await handle.sync();}finally{await handle.close();}await fs.rename(temp,target);}
  return {published:publish,changed,formalBossCount:next.bosses.length,batchBossIds:publication.bosses.map(b=>b.id),validation:{ok:validation.ok,errors:validation.errors}};
 }
 return {spec,design,revision,bosses,entries,draftRoot,contextFor,validateDraft,reviewDraftFor:bossDraft,review,candidate,readPublication,merge,publish};
}

if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const i=process.argv.indexOf('--batch'),b=await bossBatch(process.argv[i+1]);
 if(process.argv.includes('--l1')){for(const e of b.entries){const v=b.validateDraft(b.reviewDraftFor(e),e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}console.log(JSON.stringify({L1:'passed',bosses:b.bosses.length}));}
 if(process.argv.includes('--review')){const {summary:s}=await b.review({retryManual:process.argv.includes('--retry-manual')});console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget.cards[b.spec.card]}));}
 if(process.argv.includes('--candidate'))console.log(JSON.stringify({bosses:(await b.candidate()).bosses.length}));
 if(process.argv.includes('--publish')||process.argv.includes('--dry-publish'))console.log(JSON.stringify(await b.publish({publish:process.argv.includes('--publish')})));
}
