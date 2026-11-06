import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {villageProfileCandidates,villageLedgerRules,villageLawCodes,validateVillageLedger,ledgerRevision} from '../world/design/w1-village-profiles.mjs';
import {w1VillagesFoundation} from '../world/design/w1-villages.mjs';
import {localFacts as wildlifeFacts} from '../world/design/t155-village-wildlife.mjs';

export const revision=ledgerRevision;
export function contextFor(entry,world){
 const people=[...world.npcs,...world.residents].filter(p=>p.settlement===entry.id);
 const {details,...population}=world.settlementProfiles.find(p=>p.id===entry.id);
 // These later notices have their own T155 L2/L4; the original facts stay frozen.
 population.facts=population.facts.filter(text=>!wildlifeFacts.some(f=>f.board===entry.id&&f.text===text));
 // The dossier must not become its own audit evidence on repeat publication.
 if(details)population.pendingProfileSections=w1VillagesFoundation().settlements.find(p=>p.id===entry.id).pendingProfileSections;
 return {population,
  people:people.filter(p=>entry.governance.coordinators.includes(p.id)||entry.problems.some(x=>x.stakeholders.some(s=>s.person===p.id))||entry.calendar.festivals.some(f=>f.host===p.id)).map(p=>({id:p.id,name:p.name,age:p.age,occupation:p.occupation,conflicts:p.socialProfile?.conflicts,workplace:p.workplace,services:p.services})),
  locations:world.locations.filter(p=>p.parent===entry.id).map(p=>({id:p.id,name:p.name,purpose:p.purpose,owner:p.owner,openHours:p.openHours,access:p.access,inventory:p.inventory})),
  charter:{agriculture:villageLedgerRules(world).find(p=>p.settlement===entry.id),law:villageLawCodes(world).find(c=>c.locations.includes(entry.id)),source:ledgerRevision,effectiveDay:0,scope:'本批创作公共开局账和明确村级任命；不回填旧档粮钱，不据职业自动授予协调者权限。苇汀岸上菜圃划出燕麦条田，日常菜圃仍在。'},calendar:world.rules.calendar,limits:'本批新开局账为来源登记；未履约合同、年产潜力与期末结算严格分开。本批新节俗与隐秘处只作为创作种子；不保证人到场，不赋予免费财物或进入权。传闻是待接入的作者种子，不表示携带者当前已经听说或玩家知情。待协商方案不是已完成事件。'};
}
export function validateDraft(draft,entry,world){
 const errors=[],warnings=[],check=(ok,note)=>{if(!ok)errors.push(note);};
 if(!draft||typeof draft!=='object')return {errors:['聚落档案必须为对象'],warnings};
 check(hashContent(draft)===hashContent(entry),'人工骨架发生未审核改写');
 const old=world.settlementProfiles.find(p=>p.id===entry.id),people=new Map([...world.npcs,...world.residents].map(p=>[p.id,p]));
 for(const key of ['id','population','householdCount','buildingIds','ageStructure','coordinates'])check(hashContent(draft[key])===hashContent(old[key]),`登记事实不符：${key}`);
 check(draft.problems?.length>=5,'地方问题不足五项');
 for(const p of draft.problems??[]){
  check(p.status==='unresolved'&&p.public===true,`${p.id}问题须待解决`);
  check(p.options?.length>=2&&new Set(p.options.map(o=>o.proposal)).size===p.options.length,`${p.id}缺不同方案`);
  check(p.options.every(o=>o.proposal.length>=20&&o.costOrLimit.length>=12),`${p.id}缺方案约束`);
  check(world.locations.some(l=>l.id===p.location&&l.parent===entry.id),`${p.id}地点不在本村`);
  check(p.stakeholders.length>=2,`${p.id}缺当事人`);
  for(const s of p.stakeholders){const person=people.get(s.person);check(person?.settlement===entry.id&&person.age>=18,`${p.id}当事人须为本村成年人`);
   check(person?.socialProfile?.conflicts?.some(c=>p.stakeholders.some(other=>other.person===c.with)&&c.position===s.position),`${p.id}当事人立场无既有事实依据：${s.person}`);
  }
 }
 check(draft.rumors?.length>=10,'传闻不足十条');
 check(['true','partial','false'].every(t=>draft.rumors.some(r=>r.truth===t)),'传闻缺真假层次');
 for(const r of draft.rumors??[]){const p=draft.problems.find(p=>p.id===r.sourceProblem);
  check(p&&p.stakeholders.some(s=>s.person===r.source)&&r.witnesses.every(id=>p.stakeholders.some(s=>s.person===id)),`${r.id}来源须为问题当事人`);
  check(r.status==='authored-seed'&&r.propagation==='pending-event',`${r.id}不能虚构已传播事件`);
  check(r.fact?.length>10&&r.verification?.length>=6,`${r.id}缺真相或可查证路径`);
 }
 for(const id of [...draft.governance.coordinators,...draft.calendar.festivals.map(f=>f.host),...draft.hiddenPlaces.flatMap(h=>h.knownBy)])check(people.get(id)?.age>=18&&people.get(id)?.settlement===entry.id,`责任者无效：${id}`);
 for(const error of validateVillageLedger(draft,world))errors.push(error);
 check(draft.outsiderRatio===null&&draft.outsiderRatioReason.length>20,'出生来源未登记不能推算外来比例');
 check(hashContent(draft.calendar.marketDays)===hashContent(world.rules.calendar.marketDays),'集日须沿用世界日历');
 for(const f of draft.calendar.festivals){const place=world.locations.find(l=>l.id===f.location);check(Number.isInteger(f.month)&&f.month>=1&&f.month<=12&&Number.isInteger(f.day)&&f.day>=1&&f.day<=30&&place?.parent===entry.id&&f.status==='custom-only',`节俗地点/日期无效：${f.name}`);}
 check(draft.sensory.seasonal.length===4&&draft.sensory.daily.length===4,'缺四季或昼夜素材');
 for(const h of draft.hiddenPlaces)check(h.status==='unregistered-feature'&&world.locations.some(l=>l.id===h.location&&l.parent===entry.id)&&h.access.length>20,`隐秘处须限制发现/物权：${h.id}`);
 check(draft.pendingProfileSections.length>=4,'未落地项不能标为完成');
 return {errors,warnings};
}
export function buildReviewRequest(e,d,c){const r=defaultReviewRequest(e,d,c);r.max_tokens=2200;r.messages[0].content+=' 本批由人工作者提供完整聚落档案，不需要重写。重点核对publishedFacts人物的身份、已有矛盾立场、地点、人口、日历；方案必须是未执行的提议，不能虚构已完成经历。真假传闻的claim可以故意不实，但fact须正确且不能把传闻种子说成已传播。新增节俗/非功能性隐秘处是本批创作内容，允许合理新增，不要仅因旧地点未提到夹格就报冲突；不能新增可领取库存、可通行密道、自动参加节日、未发生的贸易收付。本批charter是明确创作的新开局公共账与村级任命来源，允许以此登记年粮潜力、库存、合同、税章和官职，不把旧档库存重置。数量与单位周期须守恒，官职来自任命而非职业推断。';return r;}

export async function reviewProfiles({world,root=path.resolve('world/drafts/w1/village-ledgers'),budgetRoot=path.resolve('world/drafts/m4-object'),incrementBudgetYuan=1.2}={}){
 if(!(incrementBudgetYuan>0&&incrementBudgetYuan<=1.2))throw Error('四村增量预算须大于0且不超过1.2元');
 world??=await loadWorld();
 const entries=villageProfileCandidates(world),client=new DeepSeekClient({budgetYuan:20,logFile:path.resolve('logs/w1-village-profiles-usage.jsonl')});
 const generate=client.generate.bind(client);
 const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));
 await fs.mkdir(root,{recursive:true});
 const incrementFile=path.join(root,'increment-budget.json');
 const prior=await fs.readFile(incrementFile,'utf8').then(JSON.parse).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
 const increment=prior??{startSpentYuan:ledger.spentYuan+(ledger.reservedYuan??0),limitYuan:incrementBudgetYuan,sharedBudgetRoot:path.resolve(budgetRoot)};
 if(increment.limitYuan!==incrementBudgetYuan||increment.sharedBudgetRoot!==path.resolve(budgetRoot))throw Error('增量预算账不能重置或更换共用预算');
 if(!prior)await fs.writeFile(incrementFile,JSON.stringify(increment,null,2)+'\n');
 const ceiling=Math.min(20,increment.startSpentYuan+increment.limitYuan);
 // The ordinary pipeline still fingerprints, validates, resumes and samples.
 // Drafts are explicitly local authored submissions; only L2 calls the model.
 client.generate=async(body,label)=>{if(body.localAuthoredDraft)return{choices:[{message:{content:JSON.stringify(body.localAuthoredDraft)}}]};const totalLimit=client.budgetYuan;client.budgetYuan=ceiling;try{return await generate(body,label);}finally{client.budgetYuan=totalLimit;}};
 return runContentPipeline({entries,root,budgetRoot,client,revision,concurrency:1,batchSize:4,
  contextFor:e=>contextFor(e,world),buildDraftRequest:(e,feedback)=>{if(feedback)throw Error('人工稿需定点修正，保留上一轮审查意见');return {localAuthoredDraft:e};},buildReviewRequest,validateDraft:(d,e)=>validateDraft(d,e,world)});
}
export async function approvedProfiles({world,root=path.resolve('world/drafts/w1/village-ledgers')}={}){
 world??=await loadWorld();
 const entries=villageProfileCandidates(world),rows=await readApprovedContent(root,entries,{contextFor:e=>contextFor(e,world),revision});
 if(rows.length!==4)throw Error('四村档案尚未全部通过审核');
 for(const row of rows){const v=validateDraft(row,entries.find(e=>e.id===row.id),world);if(v.errors.length)throw Error(v.errors.join('；'));}
 return rows;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const arg=(name,fallback)=>{const at=process.argv.indexOf(name);return at<0?fallback:process.argv[at+1];};
 const root=path.resolve(arg('--root','world/drafts/w1/village-ledgers'));
 if(process.argv.includes('--review'))console.log(JSON.stringify((await reviewProfiles({root,budgetRoot:path.resolve(arg('--budget-root','world/drafts/m4-object')),incrementBudgetYuan:Number(arg('--budget-yuan',1.2))})).summary));
 if(process.argv.includes('--candidate')){const profiles=await approvedProfiles({root});await fs.writeFile(path.join(root,'candidate.json'),JSON.stringify({status:'reviewed-candidate',profiles},null,2)+'\n');console.log(JSON.stringify({profiles:profiles.length,problems:profiles.flatMap(p=>p.problems).length,rumors:profiles.flatMap(p=>p.rumors).length}));}
}
