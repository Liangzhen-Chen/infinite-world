// T117–T122: authored claims, referenced public evidence, existing L1/L2/L4 pipeline.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomInt} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent,stampL4Notes,requireFlagValue} from './content-pipeline.mjs';

export const counts=[45,45,45,45,40,40];
export const revision='w5-rumors-v1';
export const rootOf=n=>path.resolve(`world/drafts/w5-rumors-${n}`);
export function reference(world,{collection,id,field}){
 const row=collection==='rules'?world.rules:world[collection]?.find(r=>r.id===id);
 if(!row)throw Error(`引用不存在 ${collection}/${id}`);
 const value=field.split('.').reduce((v,k)=>v?.[k],row);
 if(value===undefined)throw Error(`引用字段不存在 ${collection}/${id}/${field}`);
 return {collection,id,field,value};
}
export async function batchContext(n){
 if(!counts[n-1])throw Error('组号须为1至6');
 const world=await loadWorld(),mod=await import(`../world/design/w5-rumors-${n}.mjs`),rows=await mod.rumors(world);
 const entries=rows.map(r=>({id:r.id,truth:r.truth,source:r.source,delivery:r.delivery,evidence:r.evidence}));
 const byId=new Map(rows.map(r=>[r.id,r]));
 const contextFor=e=>({facts:e.evidence.map(ref=>reference(world,ref)),speaker:{id:e.source,name:world.npcs.find(n=>n.id===e.source)?.name},
  distinction:'claim是人物持有的开局说法，不是当前状态公告；真伪以所引已发布事实为准，阶段和结局不冒充已经发生。当前职位、位置、立场、可交谈时间和路线均由运行时派生。'});
 const draftFor=e=>{const r=byId.get(e.id);return{id:r.id,claim:r.claim,fact:r.fact,verification:r.verification,distortion:r.distortion,stance:r.stance};};
 const blocked=JSON.parse(await fs.readFile('world/meta/blocklist.json','utf8'));
 function validateDraft(d,e){
  const errors=[],r=byId.get(e.id),speaker=world.npcs.find(n=>n.id===e.source),target=world.npcs.find(n=>n.id===e.delivery.to);
  if(d.id!==e.id||!['true','half','false'].includes(e.truth))errors.push('编号或真伪无效');
  for(const k of ['claim','fact','verification','distortion','stance'])if(typeof d[k]!=='string'||!d[k].trim())errors.push(`缺少${k}`);
  if(d.claim.length<15||d.claim.length>180||d.claim===d.fact)errors.push('claim长度或作者真相隔离不符');
  if(!speaker||speaker.age<18||!target||target.tier!=='full')errors.push('携带者须为已发布成年人物，收件人为完整档');
  if(e.delivery.channel!=='carry'||!speaker?.relationships?.some(x=>x.with===target?.id&&x.trust>=0))errors.push('没有登记的人际携信渠道');
  for(const ref of e.evidence)try{reference(world,ref);}catch(error){errors.push(error.message);}
  if(!e.evidence.length)errors.push('缺少真实事实引用');
  const text=JSON.stringify(d);for(const word of [...blocked.names,...blocked.realPeople])if(text.includes(word))errors.push(`原创屏蔽词:${word}`);
  if(/提示词|工具调用|系统要求|JSON|schema/.test(d.claim))errors.push('正文出现世界外用语');
  if(r.carriers.length)errors.push('本批通过实际投递取得，不预填收件人知识');
  return{errors,warnings:[]};
 }
 return{world,rows,entries,contextFor,draftFor,validateDraft};
}
export async function l1(n){const b=await batchContext(n),errors=[];
 if(b.rows.length!==counts[n-1])errors.push('本组数量不符');
 const previous=[...b.world.rumors??[],...b.world.settlementProfiles.flatMap(p=>p.details?.rumors??[])].filter(r=>!b.rows.some(x=>x.id===r.id));
 for(const key of ['id','claim']){const values=b.rows.map(r=>r[key]);if(new Set(values).size!==values.length||values.some(v=>previous.some(r=>r[key]===v)))errors.push(`${key}重复`);}
 for(const e of b.entries)errors.push(...b.validateDraft(b.draftFor(e),e).errors.map(x=>`${e.id}: ${x}`));
 return{entries:b.rows.length,errors};
}
export function buildReviewRequest(e,d,c){const r=defaultReviewRequest(e,d,c);r.max_tokens=800;
 r.messages[0].content='你是原创幻想世界的传闻编辑审核员。只返回JSON {"contradictions":[{"quote":"出错原句","field":"字段路径","severity":"hard|soft|style","reason":"具体错误"}]}。审核编辑标注是否准确：skeleton.truth=true时claim应符合facts；half时claim须有真实细节与错误推论；false时claim的核心应与facts相反。half和false的claim故意说错，包括把待议事项说成已成、夸大权利或颠倒原因；这些错误应由fact澄清，绝不能因claim本来是假的就判hard。只有真伪标注错误、fact反而错了、verification没有登记路径等编辑错误才列hard。facts中的value是已发布原文，不凭外部知识。人物听闻的来历和立场是新创作，不要求旧资料已经记录。不能泄露私密目标、未成年隐私或引用未发布战争实体。核对一致的句子不输出；编辑标注准确则只输出 {"contradictions":[]}。';return r;}
export async function review(n,{ids=null,retryManual=false}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const b=await batchContext(n),root=rootOf(n),card=`T${116+n}`,ledger=path.join(root,'budget.json');await fs.mkdir(root,{recursive:true});
 try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:`${card}独立账，含失败未知预留；整卡≤1.5元，25为共用流水线账格式，卡额度仍为1.5`},null,2)+'\n');}
 return runContentPipeline({entries:ids?b.entries.filter(e=>ids.includes(e.id)):b.entries,root,budgetRoot:root,revision,contextFor:b.contextFor,validateDraft:b.validateDraft,reviewDraftFor:b.draftFor,reuseFrozenDrafts:true,retryManual,
  cardId:card,allocation:{cardId:card,incrementLimitYuan:1.5,waveLimitYuan:25,maxRequests:n<5?75:70,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(root,'usage.jsonl')}),buildDraftRequest:()=>{throw Error('本卡只授权模型审核');},buildReviewRequest,
  requestTransform:async({body,entry,phase})=>{if(phase==='review'){
   const l=JSON.parse(await fs.readFile(ledger,'utf8')),sent=Object.values(l.requests??{}).filter(r=>r.label?.includes(entry.id)&&['sent','settled','unknown'].includes(r.status));
   if(sent.length>=2)throw Object.assign(Error(`${entry.id}已用完首次及一次重跑`),{code:'CONTENT_BUDGET_STOP'});
  }return{body};}});
}
export async function reviewSequential(n,{retryManual=false}={}){
 const b=await batchContext(n);for(const e of b.entries){await review(n,{ids:[e.id],retryManual});const r=JSON.parse(await fs.readFile(path.join(rootOf(n),`${e.id}.json`),'utf8'));
  if(r.status==='pending')return{stopped:e.id,errors:r.errors};
 }const {summary:s}=await review(n);return{total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,costUpperYuan:s.costUpperYuan};
}
export async function approved(n){const b=await batchContext(n),root=rootOf(n),ok=await readApprovedContent(root,b.entries,{contextFor:b.contextFor,revision});
 if(ok.length!==b.entries.length)throw Error('本组尚有未通过条目');
 for(const e of b.entries)if(hashContent(ok.find(r=>r.id===e.id))!==hashContent(b.draftFor(e)))throw Error(`审核后正文改变 ${e.id}`);
 const batch=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8')),wave=batch.l4.wave;
 if(wave?.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!b.rows.some(x=>x.id===r.id)||r.scores?.length!==6||r.scores.some(x=>!Number.isInteger(x)||x<3||x>5)||!r.note?.trim())||wave.flatMap(r=>r.scores).reduce((a,c)=>a+c,0)/60<4)throw Error('L4波次评分不足');return b;
}
export async function publish(n,{write=false}={}){const b=await approved(n),existing=b.world.rumors??[],next=[...existing];
 for(const row of b.rows){const prior=next.find(r=>r.id===row.id);if(prior&&hashContent(prior)!==hashContent(row))throw Error(`正式条目冲突 ${row.id}`);if(!prior)next.push(row);}
 if(write&&hashContent(existing)!==hashContent(next))await fs.writeFile('world/lore/rumors.json',JSON.stringify(next,null,2)+'\n');
 return{published:write,added:next.length-existing.length,total:next.length};}
export async function sampleL4(n){const b=await batchContext(n),root=rootOf(n),batch=JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8'));
 if(batch.passed!==b.rows.length)throw Error('L2尚未全过');
 const pool=b.rows.map(r=>r.id);for(let i=pool.length-1;i>0;i--){const j=randomInt(i+1);[pool[i],pool[j]]=[pool[j],pool[i]];}
 const selection={fingerprint:batch.fingerprint,wave:pool.slice(0,10),read:[...new Set([...batch.sample,...batch.flagged,...pool.slice(0,10)])]};
 await fs.writeFile(path.join(root,'l4-selection.json'),JSON.stringify(selection,null,2)+'\n');
 return selection.read.map(id=>{const e=b.entries.find(e=>e.id===id);return{...b.draftFor(e),truth:e.truth,wave:selection.wave.includes(id)};});}
export async function recordL4(n,file,by){const root=rootOf(n),batchFile=path.join(root,'batch-0.json'),batch=JSON.parse(await fs.readFile(batchFile,'utf8')),selection=JSON.parse(await fs.readFile(path.join(root,'l4-selection.json'),'utf8')),notes=JSON.parse(await fs.readFile(file,'utf8'));
 if(selection.fingerprint!==batch.fingerprint||selection.read.some(id=>!notes.notes.some(r=>r.id===id&&r.note?.trim()))||selection.wave.some(id=>!notes.wave.some(r=>r.id===id)))throw Error('L4缺少实际抽样阅读或评分');
 batch.l4={approved:true,reviewer:`T${116+n}执行会话`,...notes,notes:stampL4Notes(notes.notes,by)};await fs.writeFile(batchFile,JSON.stringify(batch,null,2)+'\n');return batch.l4;}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const n=Number(process.argv[3]);if(process.argv[2]==='--l1'){const r=await l1(n);console.log(JSON.stringify(r));if(r.errors.length)process.exitCode=1;}
 else if(process.argv[2]==='--review')console.log(JSON.stringify(await reviewSequential(n,{retryManual:process.argv.includes('--retry-manual')})));
 else if(process.argv[2]==='--publish')console.log(JSON.stringify(await publish(n,{write:true})));
 else if(process.argv[2]==='--sample')console.log(JSON.stringify(await sampleL4(n)));
 else if(process.argv[2]==='--l4')console.log(JSON.stringify(await recordL4(n,process.argv[4],requireFlagValue(process.argv,'--by'))));
}
