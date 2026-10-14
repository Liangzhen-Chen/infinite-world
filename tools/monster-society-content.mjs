// T157 content pipeline: 炭阶地宫与苔灯坞. Drafts are authored in
// world/design/monster-society-1.mjs; DeepSeek is used only for L2 review.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {numberValue} from './w4-content.mjs';
import {validateWorld} from './validate-world.mjs';
import {findNpcRuleWording} from './npc-profile-validation.mjs';
import {revision,people,places,settlements,bosses,cultures,households,buildBatch,buildNpc,buildBoss,buildCulture,buildSettlementProfile} from '../world/design/monster-society-1.mjs';
export {revision};
const CARD='T157',MAX_REQUESTS=130,LIMIT_YUAN=1.5;
export const draftRoot=path.resolve('world/drafts/monster-society-1');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld(),blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const itemName=id=>world.items.find(i=>i.id===id)?.name??id;
const placeName=id=>places.find(p=>p.id===id)?.name??world.locations.find(l=>l.id===id)?.name??id;
const personName=id=>people.find(p=>p.id===id)?.name??id;
const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const settlementName=id=>settlements.find(s=>s.id===id).name;
const speciesName=s=>world.monsters.find(m=>m.id===s.species).name;

// ---------------------------------------------------------------- entries
const PERSON_PROSE=['traits','visibleFeature','appearance','currentConcern','voice','personality','familyNotes','relationships','memorySeeds','goals','fears','redLines','secrets','knowledge','opinions','towardPlayer','behaviorRules','hooks','notes','description','portraitPrompt'];
function personSkeleton(p){
 const s=settlements.find(s=>s.id===p.settlement),house=households.find(h=>h.id===p.household);
 const base={id:p.id,category:p.tier==='full'?'person':'roster',name:p.name,age:p.age,sex:p.sex,species:speciesName(s),settlement:s.name,occupation:p.occupation,minor:p.age<18,
  household:house.members.filter(id=>id!==p.id).map(id=>{const o=people.find(x=>x.id===id);return{name:o.name,age:o.age,occupation:o.occupation,role:o.role??null};}),
  home:placeName(p.home),district:placeName(places.find(x=>x.id===p.home).district)};
 if(p.tier!=='full')return base;
 const position=s.society.positions.find(x=>x.members.includes(p.id));
 return{...base,registeredFacts:p.facts,role:p.role,workplace:placeName(p.workplace),coins:p.coins,inventory:Object.entries(p.inventory).map(([id,q])=>({item:itemName(id),quantity:q})),trades:p.services.includes('trade'),
  schedule:p.schedule.map(([a,b,loc,act])=>`${clock(a)}-${clock(b)} ${placeName(loc)}：${act}`),position:position?{name:position.name,claim:position.claim}:'在两派之间',
  leaderOf:bosses.find(b=>b.actor===p.id)?.id??null};
}
export const entries=[
 ...people.map(personSkeleton),
 ...places.map(p=>{const s=settlements.find(s=>s.id===p.settlement),loc=buildLocation(p);
  const present=people.filter(x=>x.tier==='full'&&x.schedule.some(r=>r[2]===p.id)).map(x=>({name:x.name,times:x.schedule.filter(r=>r[2]===p.id).map(([a,b,,act])=>`${clock(a)}-${clock(b)} ${act}`)}));
  return{id:p.id,category:'place',name:p.name,kind:p.kind,registeredFacts:p.facts,settlement:s.name,species:speciesName(s),parent:placeName(loc.parent),access:loc.access??null,present,
   residents:p.kind==='home'?households.find(h=>h.homeLocation===p.id).members.map(personName):undefined,
   site:loc.site?{owner:personName(loc.site.owner),manager:personName(loc.site.manager),resources:loc.site.resources.map(r=>({name:r.name,item:itemName(r.item),quantity:r.quantity})),infiltration:loc.site.infiltration}:undefined,
   ...(p.kind==='seat'?{population:s.population,households:s.householdCount,registered:people.filter(x=>x.settlement===s.id).length,pendingHouseholds:s.pendingHouseholdCount,
    districts:places.filter(x=>x.settlement===s.id&&x.kind==='district').map(x=>x.name),facilities:places.filter(x=>x.settlement===s.id&&x.kind==='facility').map(x=>x.name),
    walkFrom:`${placeName(s.parent)}经${placeName(s.from)}，合计约${s.expectedKm}公里`,neighbors:Object.entries(s.society.neighbors).map(([id,st])=>`${placeName(id)}：${st}`),
    playerStance:s.society.stances.player,motions:s.society.motions.map(m=>m.name),positions:s.society.positions.map(x=>({name:x.name,members:x.members.map(personName)}))}:{})};}),
 ...bosses.map(b=>({id:b.id,category:'boss',registeredFacts:b.history,name:b.name,body:personName(b.actor),species:world.monsters.find(m=>m.id===b.monster).name,level:b.level,lair:placeName(b.lair),
  territory:b.territory.map(placeName),negotiation:{stock:b.negotiation.stock.map(r=>({item:itemName(r.item),quantity:r.quantity})),accepts:b.negotiation.accepts.map(itemName)},
  mechanics:b.mechanics,abilityDuration:'duration 1 即持续一分钟；every 4 指每第4次命中后的反击',cognitionGoal:'avoid_conflict',
  notInTerritory:places.filter(x=>x.settlement===b.settlement&&x.kind!=='seat'&&!b.territory.includes(x.id)).map(x=>`${x.name}（${{home:'私宅，须住户许可',council:'议事区，须负责人许可',store:'由'+personName(buildLocation(x).site?.manager)+'看管的存放洞'}[x.kind]}）`),
  passageCovers:'通行约只覆盖territory中非私宅、非议事区的地点；住区是窑道或林地本身，各户私宅不在其中；notInTerritory中的地点首领不能许诺通行',onClash:'已实现规则：对聚居地成员发起交锋，会使整个聚居地对来者的态度转为敌对',canSign:['互不攻击','贸易','朝贡','通行'],passageExcludes:'私宅与议事区须当面许可'})),
 ...cultures.map(c=>{const s=settlements.find(s=>s.id===c.settlement);return{id:c.id,category:'culture',name:c.name,settlement:s.name,species:speciesName(s),anchor:placeName(c.anchor),witness:personName(c.witness),region:c.region,
  districts:places.filter(x=>x.settlement===s.id&&x.kind==='district').map(x=>x.name),facilities:places.filter(x=>x.settlement===s.id&&x.kind!=='seat'&&x.kind!=='district'&&x.kind!=='home').map(x=>x.name)};}),
];
import {buildLocation} from '../world/design/monster-society-1.mjs';

export function reviewDraftFor(e){
 if(e.category==='person')return{id:e.id,...Object.fromEntries(PERSON_PROSE.map(k=>[k,people.find(p=>p.id===e.id).prose[k]]))};
 if(e.category==='roster')return{id:e.id,...people.find(p=>p.id===e.id).prose};
 if(e.category==='place'){const p=places.find(p=>p.id===e.id);const d={id:e.id,description:p.prose.description,authoredFacts:p.prose.authoredFacts};
  if(p.prose.clues)d.clues=p.prose.clues;if(p.kind==='seat')d.profileFacts=buildSettlementProfile(settlements.find(s=>s.id===p.id)).facts;return d;}
 if(e.category==='boss')return{id:e.id,...bosses.find(b=>b.id===e.id).prose};
 return{id:e.id,...cultures.find(c=>c.id===e.id).prose};
}
export function contextFor(e){
 const s=settlements.find(s=>s.name===e.settlement)??settlements.find(s=>bosses.find(b=>b.id===e.id)?.settlement===s.id);
 const c=cultures.find(c=>c.settlement===s.id);
 return{settlement:s.name,species:speciesName(s),speciesFacts:world.monsters.find(m=>m.id===s.species).habits,culture:{name:c.name,facts:c.prose.facts},
  members:people.filter(p=>p.settlement===s.id).map(p=>({name:p.name,age:p.age,occupation:p.occupation,role:p.role??null,home:placeName(p.home)})),
  places:places.filter(p=>p.settlement===s.id).map(p=>`${p.name}（${{seat:'聚居地',facility:'公共设施',district:'住区',home:'私宅',council:'议事区',store:'存放洞'}[p.kind]}）`),
  positions:s.society.positions.map(x=>({name:x.name,claim:x.claim,members:x.members.map(personName)})),
  registeredFacts:places.filter(p=>p.settlement===s.id&&p.facts).flatMap(p=>p.facts.map(f=>`${p.name}：${f}`)),
  facts:['正文中的外貌、往事、情绪、习惯与日常细节是人物塑造，只要不与骨架、作息、库存和人数相反即可。','“结缘”在本作指与外人结下互助往来的恩义，不是恋爱。','夜议、换季、熄炉、轮养等是本聚居地文化的说法。']};
}

// ---------------------------------------------------------------- L1
const outside=/主持人|提示词|schema|JSON|生成器|骨架|编号|系统要求|玩家(?:不能|不得|必须)|塑料|电池|电动/;
const ROMANCE=/恋爱|恋人|情人|相好|心上人|婚约|订婚|成亲|成婚|嫁|娶|求爱|约会|调情|暗恋|爱慕|亲吻|同床|共枕|私奔/;
const textOf=v=>typeof v==='string'?v:Array.isArray(v)?v.map(textOf).join('；'):v&&typeof v==='object'?Object.values(v).map(textOf).join('；'):'';
function common(text,errors){
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽词 ${word}`);
 if(outside.test(text))errors.push('世界外术语');
 if(/[0-9零一二两三四五六七八九十百千]+\s*(公里|千米|里路|铜币|铜钱|银币)/.test(text))errors.push('正文写了未给定的距离或价格');
}
export function validateDraft(d,e){
 const errors=[],warnings=[];
 if(!d||d.id!==e.id)return{errors:['id 与条目不符'],warnings};
 const text=textOf(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='id')));common(text,errors);
 if(e.category==='person'||e.category==='roster'){
  const p=people.find(p=>p.id===e.id);
  for(const k of e.category==='person'?PERSON_PROSE:['traits','currentConcern','visibleFeature'])if(d[k]===undefined||d[k]===null||textOf(d[k]).trim()==='')errors.push(`缺少 ${k}`);
  for(const m of text.matchAll(/([0-9一二两三四五六七八九十]+)岁/g))if(numberValue(m[1])!==p.age&&!people.some(o=>o.age===numberValue(m[1])&&text.includes(o.name)))errors.push(`年龄 ${m[0]} 不符`);
  if(p.age<18&&ROMANCE.test(text))errors.push('未成年人出现恋爱或亲密情节');
  if(ROMANCE.test(text))warnings.push('含亲密字样需抽读');
  if(e.category==='person'){
   if(!d.description.includes(p.name))errors.push('描述须点名本人');
   for(const r of d.relationships){const name=personName(r.with);if(!r.note.includes(name.slice(0,2))&&!r.note.includes(name))errors.push(`关系备注未点明 ${name}`);}
   for(const issue of findNpcRuleWording({id:p.id,...d}))errors.push(`规则口吻：${issue.text}`);
   for(const m of d.memorySeeds)if(!m.knownBy.includes(p.id))errors.push('记忆知情者须含本人');
  }
  return{errors,warnings};
 }
 if(e.category==='place'){
  if(typeof d.description!=='string'||d.description.length<60||d.description.length>320)errors.push('描述长度不符');
  if(!d.description.includes(e.name))errors.push('描述须点明地点');
  const f=d.authoredFacts;if(!f||typeof f.climate!=='string'||!Array.isArray(f.senses)||f.senses.length!==3||typeof f.entryRule!=='string')errors.push('authoredFacts 不完整');
  if(e.kind==='home'&&!e.residents.every(n=>d.description.includes(n)))errors.push('私宅描述须列明住户');
  return{errors,warnings};
 }
 if(e.category==='boss'){
  for(const k of ['territoryText','tactics','weakness','taming','originSeed','origin','lairDescription','behavior'])if(!d[k]||!textOf(d[k]).trim())errors.push(`缺少 ${k}`);
  if(!/一半/.test(d.behavior)||!/第四次/.test(d.behavior)||!/恐惧/.test(d.behavior)||!/眩光/.test(d.behavior))errors.push('行为须写明半血反击与眩光弱点');
  if(!/私宅|根洞/.test(d.behavior))errors.push('须写明通行不含私宅');
  return{errors,warnings};
 }
 if(e.category==='culture'){
  for(const k of ['focus','naming','facts','dailyLife','familyAndLaw','faithAndFestivals','voice','proverbs'])if(!d[k])errors.push(`缺少 ${k}`);
  if(!Array.isArray(d.proverbs)||d.proverbs.length<10||new Set(d.proverbs).size!==d.proverbs.length)errors.push('谚语须至少10条且不重复');
  if(!/送|葬|归土|亡者/.test(d.faithAndFestivals))errors.push('须写丧葬');if(!/幼/.test(d.familyAndLaw))errors.push('须写育幼');
  if(!/敲管|气味绳/.test(d.voice))errors.push('须写传讯方式');if(!/忌/.test(d.faithAndFestivals))errors.push('须写禁忌');
  return{errors,warnings};
 }
 return{errors:['未知类别'],warnings};
}
// Global L1: the assembled batch must pass the release build and depth audit.
export async function validateBatch(){
 const {mergeMonsterSociety}=await import('./publish-monster-society.mjs');
 const next=mergeMonsterSociety(world,buildBatch()),v=validateWorld(next,{stage:'release'});
 return v.errors;
}

// ---------------------------------------------------------------- L2
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是原创幻想世界中有灵智的非人聚居地条目（灰窟哥布林的地宫、苔灯狐族的林下坞子）。skeleton是机制事实（年龄、职业、同户、住处、作息、库存、人数、立场、议题、首领机制），publishedFacts是同一聚居地已登记的成员、地点、文化和立场。'+
  '只把与skeleton或publishedFacts相反、或给出没有依据的新机制（新的数量、库存、价格、距离、法术效果、额外设施、额外成员身份）的句子列为hard；人物的外貌、性格、往事、情绪、打算、对他人的看法和日常细节是塑造，不是新增机制。'+
  '作息中的时段可以概括说成“夜里”“黄昏后”等。人物知道的事、怀疑和秘密只是此人的认知，不必与他人的认知一致，除非与机制相反。条目中的禁忌、规矩是文化说法。'+
  '正文里的往事、个人行为、看法、打算和心愿是人物塑造：不能只因“骨架未记载”“无依据”就标hard，只有与已登记的数值、身份、作息、库存或事实相反才是hard。物品可用简称（干菌片即干栽培蘑菇片，盐即粗盐小包，干果即干果小袋）。每个hard必须指出实际不相容的两个值；核对一致的句子一律不输出，也不能标hard；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都与骨架和publishedFacts相容，唯一正确的输出是 {"contradictions":[]}。';
 return r;
}
export async function reviewMonsterSociety({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T157正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}

// ---------------------------------------------------------------- publication
export async function readMonsterSocietyPublication(root=draftRoot){
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 const missing=entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of entries){const d=approved.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);const v=validateDraft(d,e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const batch=buildBatch(),candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
 if(hashContent(candidate)!==hashContent(batch))throw Error('候选与已审核内容不符');
 const wave=(JSON.parse(await fs.readFile(path.join(root,'batch-0.json'),'utf8'))).l4?.wave,ids=new Set(entries.map(e=>e.id));
 if(!Array.isArray(wave)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return batch;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}
  bad.push(...(await validateBatch()).map(x=>`batch: ${x}`));if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewMonsterSociety({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--candidate')){await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(buildBatch(),null,2)+'\n');console.log('candidate written');}
}
