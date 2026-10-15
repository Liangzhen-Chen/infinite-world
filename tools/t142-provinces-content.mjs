// T142 content pipeline: 九省三十一郡纲要、十个远程节点、两种文化、三个非人势力及其名册首领。
// Drafts are authored in world/design/t142-provinces.mjs; DeepSeek is used only for L2 review.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {validateWorld} from './validate-world.mjs';
import {revision,provinces,counties,nodes,routes,cultures,factions,factionPeople,buildBatch} from '../world/design/t142-provinces.mjs';
import {withoutT142,mergeT142} from './t142-merge.mjs';
export {revision};
const CARD='T142',MAX_REQUESTS=110,LIMIT_YUAN=1.5;
export const draftRoot=path.resolve('world/drafts/t142-provinces');
// Independent ledger for this card (user instruction): never shared with other cards.
const budgetRoot=draftRoot;
// Per-entry revision: a fixed draft gets a new fingerprint and a fresh L2 record.
export const ENTRY_REVISIONS={county_xingwan_xuedeng:2,prov_xingwan:2};
// Review context is the world without this batch, so it is identical before and after publication.
const world=withoutT142(await loadWorld()),blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const regionRows=[...provinces,...counties],regionName=id=>regionRows.find(r=>r.id===id)?.name??id;
const allLocations=[...world.locations,...nodes],placeName=id=>allLocations.find(l=>l.id===id)?.name??id;
const factionRows=[...world.factions,...factions],factionName=id=>factionRows.find(f=>f.id===id)?.name??id;
const cultureName=id=>[...world.cultures,...cultures].find(c=>c.id===id)?.name??id;
const personRows=[...world.factionPeople,...factionPeople,...world.npcs],person=id=>personRows.find(p=>p.id===id);
const SEASONS=['春','夏','秋','冬'],MODES={walk:'步行',horse:'骑马',cart:'车马',boat:'船'};
const people=row=>row.keyPeople.map(p=>({name:p.name,role:p.role,culture:cultureName(p.culture)}));
const tie=t=>({with:regionName(t.with),kind:t.kind,terms:t.terms});
const routeText=id=>routes.filter(r=>r.from===id||r.to===id).map(r=>({to:placeName(r.from===id?r.to:r.from),modes:r.modes.map(m=>MODES[m]),closed:r.closedSeasons.map(s=>SEASONS[s]+'季')}));

// ---------------------------------------------------------------- entries
const withRev=e=>({...e,rev:ENTRY_REVISIONS[e.id]??1});
export const entries=[
 ...provinces.map(p=>({id:p.id,category:'province',name:p.name,terrain:p.terrain,climate:p.climate,industry:p.industry,polity:p.polity,seat:p.seat.name,
  counties:p.counties.map(id=>{const c=counties.find(c=>c.id===id);return{name:c.name,ruler:c.ruler.title,polity:c.ruler.polity,control:c.control}}),
  neighbors:p.neighbors.map(tie),keyPeople:people(p)})),
 ...counties.map(c=>({id:c.id,category:'county',name:c.name,province:regionName(c.province),terrain:c.terrain,climate:c.climate,industry:c.industry,population:c.population,
  control:{human:'人类治理',shared:'非人主导、与人类共治',nonhuman:'非人统治'}[c.control],ruler:{title:c.ruler.title,polity:c.ruler.polity,faction:c.ruler.faction?factionName(c.ruler.faction):null},
  seat:c.seat.name,attachedPlaces:c.places.map(placeName),factions:c.factions.map(factionName),ties:c.ties.map(tie),keyPeople:people(c)})),
 ...nodes.map(n=>({id:n.id,category:'place',name:n.name,county:regionName(n.county),province:regionName(counties.find(c=>c.id===n.county).province),
  kind:{seat:'郡或省的治所',border_market:'对外互市与联络地点，不是首府'}[n.kind],terrain:n.terrain,routes:routeText(n.id),
  contactFor:factions.filter(f=>f.contactAnchor===n.id).map(f=>f.name)})),
 ...cultures.map(c=>({id:c.id,category:'culture',name:c.name,region:c.region,anchor:placeName(c.anchor),witness:person(c.witness).name,witnessRelation:'可询问相关实践；接触不等于出生于该文化',
  counties:counties.filter(x=>x.keyPeople.some(p=>p.culture===c.id)).map(x=>x.name)})),
 ...factions.map(f=>({id:f.id,category:'faction',name:f.name,culture:cultureName(f.culture),region:f.region,contactPlace:placeName(f.contactAnchor),foundedYearsAgo:-f.foundedYear,
  leader:person(f.leader).name,coreMembers:f.coreMembers.map(id=>person(id).name),memberCount:f.memberCount,treasuryCopper:f.treasuryCopper,
  relations:f.relations.map(r=>({with:factionName(r.faction),score:r.score})),clockName:f.clock.name,clockStages:f.clock.stages.length,
  governs:counties.filter(c=>c.ruler.faction===f.id).map(c=>c.name)})),
 ...factionPeople.map(p=>({id:p.id,category:'roster',name:p.name,age:p.age,culture:cultureName(p.culture),faction:factionName(p.faction),region:p.region,
  listedAs:regionRows.flatMap(r=>r.keyPeople.filter(k=>k.person===p.id).map(k=>`${r.name}：${k.role}`))})),
].map(withRev);

const regionDraft=row=>({id:row.id,...row.prose});
export function reviewDraftFor(e){
 if(e.category==='province'||e.category==='county')return regionDraft(regionRows.find(r=>r.id===e.id));
 if(e.category==='place')return{id:e.id,description:nodes.find(n=>n.id===e.id).description};
 if(e.category==='culture'){const c=cultures.find(c=>c.id===e.id);return{id:e.id,focus:c.focus,naming:c.naming,facts:c.facts,...c.prose};}
 if(e.category==='faction'){const f=factions.find(f=>f.id===e.id);
  return{id:e.id,kind:f.kind,contactMode:f.contactMode,assets:f.assets,publicGoal:f.publicGoal,privateGoal:f.privateGoal,method:f.method,divisions:f.divisions,offers:f.offers,demands:f.demands,
   reputation:f.reputation,relationReasons:Object.fromEntries(f.relations.map(r=>[factionName(r.faction),r.reason])),trigger:f.clock.trigger,stageEffects:f.clock.stages.map(s=>s[0]),counterplay:f.clock.counterplay,prose:f.prose};}
 const p=factionPeople.find(p=>p.id===e.id);return{id:e.id,occupation:p.occupation,traits:p.traits,concern:p.concern,visibleFeature:p.visibleFeature};
}
const publicFaction=id=>{const f=factionRows.find(f=>f.id===id);return f?`${f.name}：${f.publicDescription}`:null;};
const shortPlace=id=>{const l=allLocations.find(l=>l.id===id);return`${l.name}${l.description?'：'+String(l.description).slice(0,90):''}`;};
function titleTexts(){const out=[];const walk=v=>{if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object'){if(/^title_[0-9]_/.test(v.id??'')&&['伯爵','侯爵','公爵','国王'].includes(v.name))out.push(v.text);Object.values(v).forEach(walk);}};walk(world.rules);return [...new Set(out)];}
const RULE_FACTS=[...titleTexts(),'聚落升格：由在任村长或原头人到白石镇公署前厅递件，公署转呈王都版籍署。',
 '远方势力在雁渡、王都、白石镇等处的登记点只能登记询问或寄信，不是总部坐标，也不承诺即时到场。'];
export function contextFor(e){
 const facts=['本条目是远方省郡纲要：只写地形、产业、统治、邻里与关键人物的身份，聚落骨架与人物完整档以后按需生成，因此正文不写具体街巷、户数与人物经历。',
  '“郡”“省”是王国的行政与地理分区，并非每个郡都归王国管辖；非人统治的郡不认王国的官，也不纳税。','王国内的行政级别与爵位规则如下（仅供核对，不必复述）：',...RULE_FACTS];
 if(e.category==='province'){const p=provinces.find(p=>p.id===e.id);
  return{facts,factions:[...new Set(p.counties.flatMap(id=>counties.find(c=>c.id===id).factions))].map(publicFaction).filter(Boolean),
   rosterPeople:p.keyPeople.filter(k=>k.person).map(k=>({name:k.name,occupation:person(k.person).occupation})),seatDescription:p.seat.location?shortPlace(p.seat.location):null};}
 if(e.category==='county'){const c=counties.find(c=>c.id===e.id);
  return{facts,attachedPlaces:c.places.map(shortPlace),factions:c.factions.map(publicFaction).filter(Boolean),
   neighborRulers:c.ties.map(t=>{const x=regionRows.find(r=>r.id===t.with);return x?.ruler?`${x.name}：${x.ruler.title}`:null;}).filter(Boolean),
   rosterPeople:c.keyPeople.filter(k=>k.person).map(k=>({name:k.name,occupation:person(k.person).occupation})),
   ...(c.id==='county_xichui_longqu'?{monsterSettlements:['loc_ms_tanjie','loc_ms_taideng','loc_ms_yugen','loc_ms_lielu'].map(shortPlace)}:{}),
   ...(c.id==='county_feicui_xiudao'?{published:[cultureFocus('culture_ms_taideng')]}:{}),
   ...(c.id==='county_wushan_shanyi'?{published:[cultureFocus('culture_ms_yugen'),shortPlace('loc_ms_yugen')]}:{}),
   ...(c.id==='county_wushan_guanxue'?{published:[publicFaction('faction_starpact')]}:{}),
   seatDescription:c.seat.location?shortPlace(c.seat.location):null};}
 if(e.category==='place'){const n=nodes.find(n=>n.id===e.id),c=counties.find(c=>c.id===n.county);
  return{facts,county:{name:c.name,ruler:c.ruler.title,overview:c.prose.overview},contactFactions:factions.filter(f=>f.contactAnchor===n.id).map(f=>({name:f.name,contactMode:f.contactMode}))};}
 if(e.category==='culture'){const c=cultures.find(c=>c.id===e.id),w=person(c.witness);
  return{facts,witness:{name:w.name,occupation:w.occupation,settlement:placeName(w.society)},anchorDescription:nodes.find(n=>n.id===c.anchor).description,
   countyOverviews:counties.filter(x=>x.keyPeople.some(p=>p.culture===c.id)).map(x=>`${x.name}：${x.prose.overview}${x.prose.rule}`)};}
 if(e.category==='faction'){const f=factions.find(f=>f.id===e.id);
  return{facts:[...facts,'组织的私下目标和内部分歧只记在主持者可见的说明里，不在公开说明中出现。','势力时钟目前是声明式计划，不自动推进。'],
   members:[f.leader,...f.coreMembers].map(id=>({name:person(id).name,age:person(id).age,occupation:person(id).occupation})),
   related:f.relations.map(r=>publicFaction(r.faction)).filter(Boolean),contactPlace:nodes.find(n=>n.id===f.contactAnchor).description,
   counties:counties.filter(c=>c.ruler.faction===f.id).map(c=>`${c.name}：${c.prose.rule}${c.prose.relations}`)};}
 const p=factionPeople.find(p=>p.id===e.id),f=factions.find(f=>f.id===p.faction);
 return{facts,factionPublic:`${f.name}活动于${f.region}，公开目标是${f.publicGoal}。`,factionInternal:f.prose.internalLife,
  counties:counties.filter(c=>c.keyPeople.some(k=>k.person===p.id)).map(c=>`${c.name}：${c.prose.people}`)};
}
function cultureFocus(id){const c=world.cultures.find(c=>c.id===id);return`${c.name}：${c.focus}；${c.facts.arts??''}`;}

// ---------------------------------------------------------------- L1
const outside=/主持人|提示词|schema|JSON|生成器|骨架|编号|系统要求|玩家(?:不能|不得|必须)|塑料|电池|电动/;
const textOf=v=>typeof v==='string'?v:Array.isArray(v)?v.map(textOf).join('；'):v&&typeof v==='object'?Object.values(v).map(textOf).join('；'):'';
const given=name=>name.split('·')[0];
export function validateDraft(d,e){
 const errors=[],warnings=[];
 if(!d||d.id!==e.id)return{errors:['id 与条目不符'],warnings};
 const text=textOf(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='id')));
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽词 ${word}`);
 if(outside.test(text))errors.push('世界外术语');
 if(/[0-9零一二两三四五六七八九十百千]+\s*(公里|千米|里路|铜币|铜钱|银币|天路|日路)/.test(text))errors.push('正文写了未给定的距离或价格');
 if(e.category==='province'||e.category==='county'){
  const keys=e.category==='province'?['overview','polities','people']:['overview','rule','relations','people'];
  for(const k of keys)if(typeof d[k]!=='string'||d[k].length<25||d[k].length>360)errors.push(`段落长度不符：${k}`);
  if(Object.keys(d).length!==keys.length+1)errors.push('段落字段不符');
  if(!d.overview?.includes(e.name))errors.push('概述须点明本地名称');
  for(const p of e.keyPeople)if(!d.people?.includes(given(p.name)))errors.push(`人物段未提到 ${p.name}`);
  if(e.category==='county'&&e.control!=='人类治理'&&!d.rule?.includes(e.ruler.faction?.slice(0,2)??'')&&!d.rule?.includes(e.ruler.polity.slice(0,2)))errors.push('非人统治须在治理段点明统治方');
  return{errors,warnings};
 }
 if(e.category==='place'){
  if(typeof d.description!=='string'||d.description.length<40||d.description.length>260)errors.push('描述长度不符');
  if(!d.description?.includes(e.name))errors.push('描述须点明地点');
  if(e.contactFor.length&&!/不是/.test(d.description))errors.push('联络地点须说明不是首府或议事处');
  return{errors,warnings};
 }
 if(e.category==='culture'){
  for(const k of ['focus','naming','facts','dailyLife','familyAndLaw','faithAndFestivals','voice','proverbs'])if(!d[k])errors.push(`缺少 ${k}`);
  if(!Array.isArray(d.proverbs)||d.proverbs.length<10||new Set(d.proverbs).size!==d.proverbs.length)errors.push('谚语须至少10条且不重复');
  if(!/葬|归根|亡者|枯亡/.test(d.faithAndFestivals))errors.push('须写丧葬');if(!/幼|新生/.test(d.familyAndLaw))errors.push('须写育幼');if(!/忌/.test(d.faithAndFestivals))errors.push('须写禁忌');
  return{errors,warnings};
 }
 if(e.category==='faction'){
  for(const k of ['kind','contactMode','assets','publicGoal','privateGoal','method','divisions','offers','demands','reputation','trigger','stageEffects','counterplay','prose'])if(d[k]===undefined||!textOf(d[k]).trim())errors.push(`缺少 ${k}`);
  const f=factions.find(f=>f.id===e.id);
  if(`${f.publicGoal}${f.method}${f.offers}${f.demands}`.includes(d.privateGoal))errors.push('公开说明混入私下目标');
  if(!d.prose.internalLife.includes('私下'))errors.push('内部说明须点明私下目标');
  if(d.stageEffects.length!==e.clockStages)errors.push('阶段说明与时钟阶段数不符');
  for(const k of ['conduct','internalLife','playerEncounter'])if(typeof d.prose[k]!=='string'||d.prose[k].length<60)errors.push(`组织正文过短：${k}`);
  if(!/不是/.test(d.contactMode))errors.push('联络方式须说明联络点不是总部');
  return{errors,warnings};
 }
 for(const k of ['occupation','traits','concern','visibleFeature'])if(!textOf(d[k]).trim())errors.push(`缺少 ${k}`);
 return{errors,warnings};
}
// Global L1: the assembled batch must pass the release build.
export async function validateBatch(){
 return validateWorld(mergeT142(world,buildBatch()),{stage:'release'}).errors;
}

// ---------------------------------------------------------------- L2
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创仙武幻想世界中远方省、郡的纲要条目（及其远程节点、新文化、非人势力与名册首领）。skeleton是本条的登记事实（地形、产业、人口量级、统治方、治所、所辖已登记地点、邻里关系、关键人物身份），publishedFacts是世界中已登记的地点、势力公开说明、规则与相关条目。'+
  '只把与skeleton或publishedFacts相反、或给出没有依据的新机制（新的数量、价格、距离、天数、法术效果、额外官署或额外的统治方）的句子列为hard。地貌、气候、风俗、人物的性格与说话习惯、日常景象是纲要塑造，不是新增机制；人物段里对关键人物的性情、习惯描写只要不与其身份相反即可。'+
  '“郡”“省”是地理与行政分区，非人统治的郡不归王国；同一人可同时列在省和郡的关键人物里。季节写法：春夏秋冬对应地名中的季节封路。每个hard必须指出实际不相容的两个值。核对一致的句子不输出：一律不出现在数组中，也不能标hard；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 r.messages.push({role:'user',content:'再次说明：contradictions 数组只放与 skeleton 或 publishedFacts 实际相反的句子。核对一致的句子不输出；只是概括、省略或塑造的句子也不输出。没有矛盾时只输出 {"contradictions":[]}。'});
 return r;
}
export async function reviewT142({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 await fs.mkdir(budgetRoot,{recursive:true});
 const ledger=path.join(budgetRoot,'budget.json');
 try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:'T142 独立预算账（用户指定）；不与其他卡共用'},null,2)+'\n');}
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T142正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}

// ---------------------------------------------------------------- publication
export async function readT142Publication(root=draftRoot){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 const missing=entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of entries){const d=approved.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);const v=validateDraft(d,e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const summary=JSON.parse(await fs.readFile(path.join(root,'summary.json'),'utf8')),ids=new Set(entries.map(e=>e.id));
 const wave=(await Promise.all(summary.batches.map(async b=>JSON.parse(await fs.readFile(path.join(root,`batch-${b.index}.json`),'utf8')).l4?.wave??[]))).flat();
 if(wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return buildBatch();
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);}
  bad.push(...(await validateBatch()).map(x=>`batch: ${x}`));if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewT142({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
}
