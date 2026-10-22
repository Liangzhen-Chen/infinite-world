// T162 content pipeline: 回汐埠、灰棚集与个体成精路线。
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {numberValue} from './w4-content.mjs';
import {validateWorld} from './validate-world.mjs';
import {findNpcRuleWording} from './npc-profile-validation.mjs';
import {revision,people,places,settlements,bosses,cultures,households,organizations,ORG_PROSE,buildBatch,buildLocation,buildSettlementProfile,buildFaction,routeRules,applySpiritRules} from '../world/design/monster-society-3.mjs';
export {revision};
const CARD='T162',MAX_REQUESTS=150,LIMIT_YUAN=1.8;
export const draftRoot=path.resolve('world/drafts/monster-society-3');
const budgetRoot=draftRoot;
const world=await loadWorld(),blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const allPeople=people,allPlaces=places;
const itemName=id=>world.items.find(i=>i.id===id)?.name??id;
const placeName=id=>allPlaces.find(p=>p.id===id)?.name??world.locations.find(l=>l.id===id)?.name??id;
const personName=id=>allPeople.find(p=>p.id===id)?.name??id;
// A3 收口修复：存放处/公秤改归组织后，骨架须让审查看到所有者和归属依据。
const ownerName=id=>allPeople.find(p=>p.id===id)?.name??organizations.find(o=>o.id===id)?.name??id;
const clock=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const speciesName=id=>world.monsters.find(m=>m.id===id).name;
const seatOf=id=>settlements.find(s=>s.id===id);

// ---------------------------------------------------------------- entries
const PERSON_PROSE=['traits','visibleFeature','appearance','currentConcern','voice','personality','familyNotes','relationships','memorySeeds','goals','fears','redLines','secrets','knowledge','opinions','towardPlayer','behaviorRules','hooks','notes','description','portraitPrompt'];
const ORG_TEXT=['kind','contactMode','assets','resourceScope','publicGoal','privateGoal','method','divisions','offers','demands','reputation','relationReason','trigger','stageEffects','counterplay','prose'];
const positionsText=s=>s.society.positions.map(x=>({name:x.name,claim:x.claim,members:x.members.map(personName),stances:Object.fromEntries(Object.entries(x.stances).map(([m,v])=>[s.society.motions.find(y=>y.id===m).name,v==='approve'?'赞成':'反对']))}));
function personSkeleton(p){
 const s=settlements.find(s=>s.id===p.settlement),house=households.find(h=>h.id===p.household);
 const base={id:p.id,category:p.tier==='full'?'person':'roster',name:p.name,age:p.age,sex:p.sex,species:speciesName(p.species),settlement:s.name,occupation:p.occupation,minor:p.age<18,
  household:house.members.filter(id=>id!==p.id).map(id=>{const o=people.find(x=>x.id===id);return{name:o.name,age:o.age,species:speciesName(o.species),occupation:o.occupation,role:o.role??null};}),
  home:placeName(p.home),district:placeName(places.find(x=>x.id===p.home).district)};
 if(p.tier!=='full')return base;
 const position=s.society.positions.find(x=>x.members.includes(p.id));
 return{...base,registeredFacts:p.facts,role:p.role,workplace:placeName(p.workplace),coins:p.coins,inventory:Object.entries(p.inventory).map(([id,q])=>({item:itemName(id),quantity:q})),trades:p.services.includes('trade'),
  schedule:p.schedule.map(([a,b,loc,act])=>`${clock(a)}-${clock(b)} ${placeName(loc)}：${act}`),position:position?{name:position.name,claim:position.claim}:'在两派之间',
  leaderOf:bosses.find(b=>b.actor===p.id)?.id??null};
}
function orgSkeleton(o){
 const s=seatOf(o.settlement),f=buildFaction(o);
 return{id:o.id,category:'faction',name:o.name,settlement:s.name,leader:personName(o.leader),coreMembers:o.coreMembers.map(personName),memberCount:o.memberCount,foundedYearsAgo:-o.foundedYear,
  contactPlace:placeName(o.contact),treasuryCopper:o.treasuryCopper,accountItems:Object.entries(o.items).map(([id,n])=>({item:itemName(id),quantity:n})),
  motions:s.society.motions.map(m=>m.name),positions:s.society.positions.map(x=>({name:x.name,claim:x.claim,members:x.members.map(personName)})),
  relations:o.relations.map(r=>({with:organizations.find(x=>x.id===r.faction).name,score:r.score})),
  governance:'已实现规则：议题在议事处提出，在场成年成员表态，首领闭合；成员违背所属立场表态须玩家说服（魅力检定），未发言的在场成员按所属立场计票。外人进议事处须负责人当面许可。',
  leaderExchange:(b=>({gives:b.negotiation.stock.map(r=>`${itemName(r.item)}${r.quantity}`),accepts:b.negotiation.accepts.map(itemName),canSign:['互不攻击','贸易','朝贡','通行']}))(bosses.find(b=>b.actor===o.leader)),
  termRules:s.society.motions.filter(m=>m.opens||m.closes).map(m=>`已实现规则：${m.opens?`首领所属立场反对“${m.name}”时，此议通过以前首领不与外人立${{trade:'贸易',tribute:'朝贡',passage:'通行'}[m.opens]}约`:''}${m.closes?`；此议通过以后不再立${{trade:'贸易',tribute:'朝贡',passage:'通行'}[m.closes]}约`:''}`),
  clock:{name:o.clock.name,everyDays:f.clock.intervalDays,stages:o.clock.stages.map(st=>({name:st.name,costFromAccount:Object.entries(st.cost?.items??{}).map(([id,n])=>`${itemName(id)}${n}`),
   ...(st.effect.outcomes?{outcomes:Object.fromEntries(Object.entries(st.effect.outcomes).map(([k,v])=>[k,{result:v.result,extraCost:Object.entries(v.cost?.items??{}).map(([id,n])=>`${itemName(id)}${n}`),
    shares:(v.shares??[]).map(r=>`${personName(r.to)}得${itemName(r.item)}${r.quantity}`),news:(v.news??[]).map(n=>`${placeName(n.target)}：${n.act==='aid'?'好消息':'坏消息'}`)}]))}:{})})),
   interventions:(o.clock.interventions??[]).map(a=>`${placeName(a.location)}：${a.effect==='pause'?'在决议落实以前请首领暂缓（魅力检定）':'请首领恢复落实'}`)}};
}
export const entries=[
 ...[...routeRules.conditions,...routeRules.stages,{id:'settlement',name:'定居',text:routeRules.settlement}].map(x=>({id:`rule_t162_${x.id}`,category:'route-rule',name:x.name,registeredRules:applySpiritRules(world.rules).wildlifeAwakening})),
 ...people.map(personSkeleton),
 ...places.map(p=>{const s=settlements.find(s=>s.id===p.settlement),loc=buildLocation(p);
  const present=people.filter(x=>x.tier==='full'&&x.schedule.some(r=>r[2]===p.id)).map(x=>({name:x.name,times:x.schedule.filter(r=>r[2]===p.id).map(([a,b,,act])=>`${clock(a)}-${clock(b)} ${act}`)}));
  return{id:p.id,category:'place',name:p.name,kind:p.kind,registeredFacts:p.facts,settlement:s.name,parent:placeName(loc.parent),access:loc.access??null,present,
   residents:p.kind==='home'?households.find(h=>h.homeLocation===p.id).members.map(personName):undefined,
   ...(loc.owner?{owner:ownerName(loc.owner)}:{}),...(loc.authoredFacts?.ownershipBasis?{ownershipBasis:loc.authoredFacts.ownershipBasis}:{}),
   site:loc.site?{owner:ownerName(loc.site.owner),manager:personName(loc.site.manager),watchers:loc.site.occupants.map(personName),resources:loc.site.resources.map(r=>({name:r.name,item:itemName(r.item),quantity:r.quantity})),infiltration:loc.site.infiltration}:undefined,
   ...(p.kind==='seat'?{population:s.population,households:s.householdCount,registered:people.filter(x=>x.settlement===s.id).length,pendingHouseholds:s.pendingHouseholdCount,
    speciesQuota:Object.entries(s.pendingSpeciesStructure).map(([sp,g])=>({species:speciesName(sp),named:people.filter(x=>x.settlement===s.id&&x.species===sp).length,pending:g.population,pendingHouseholds:g.households,district:placeName(g.districts[0])})),
    districts:places.filter(x=>x.settlement===s.id&&x.kind==='district').map(x=>x.name),facilities:places.filter(x=>x.settlement===s.id&&x.kind==='facility').map(x=>x.name),
    walkFrom:`${placeName(s.parent)}经${placeName(s.from)}，合计约${s.expectedKm}公里`,neighbors:Object.entries(s.society.neighbors).map(([id,st])=>`${placeName(id)}：${st}`),
    playerStance:s.society.stances.player,motions:s.society.motions.map(m=>m.name),positions:positionsText(s),
    supplies:s.society.supplies.map(r=>`${itemName(r.item)}：${r.species?speciesName(r.species):placeName(r.from)+'换来'}，在${placeName(r.place)}`)}:{})};}),
 ...bosses.map(b=>({id:b.id,category:'boss',registeredFacts:b.history,name:b.name,body:personName(b.actor),species:speciesName(b.monster),level:b.level,lair:placeName(b.lair),
  territory:b.territory.map(placeName),negotiation:{stock:b.negotiation.stock.map(r=>({item:itemName(r.item),quantity:r.quantity})),accepts:b.negotiation.accepts.map(itemName)},
  mechanics:b.mechanics,abilityDuration:'duration 1 即持续一分钟；every 4 指每第4次命中后的反击',cognitionGoal:'avoid_conflict',
  notInTerritory:places.filter(x=>x.settlement===b.settlement&&x.kind!=='seat'&&!b.territory.includes(x.id)).map(x=>`${x.name}（${{home:'私宅，须住户许可',council:'议事区，须负责人许可'}[x.kind]}）`),
  passageCovers:'通行约只覆盖territory中非私宅、非议事区的地点；住区是林地、窟道或营地本身，各户私宅不在其中',onClash:'已实现规则：对聚居地成员发起交锋，会使整个聚居地对来者的态度转为敌对',canSign:['互不攻击','贸易','朝贡','通行'],
  termGate:'已实现规则：立约时读取赞成与反对此类约定的内部立场'})),
 ...cultures.map(c=>{const s=settlements.find(s=>s.id===c.settlement);return{id:c.id,category:'culture',name:c.name,settlement:s.name,species:Object.keys(s.pendingSpeciesStructure).map(speciesName),anchor:placeName(c.anchor),witness:personName(c.witness),region:c.region,
  districts:places.filter(x=>x.settlement===s.id&&x.kind==='district').map(x=>x.name),facilities:places.filter(x=>x.settlement===s.id&&x.kind!=='seat'&&x.kind!=='district'&&x.kind!=='home').map(x=>x.name)};}),
 ...organizations.map(orgSkeleton),
];

export function reviewDraftFor(e){
 if(e.category==='route-rule'){const x=[...routeRules.conditions,...routeRules.stages,{id:'settlement',text:routeRules.settlement}].find(x=>e.id===`rule_t162_${x.id}`);return{id:e.id,text:x.text};}
 if(e.category==='person')return{id:e.id,...Object.fromEntries(PERSON_PROSE.map(k=>[k,people.find(p=>p.id===e.id).prose[k]]))};
 if(e.category==='roster')return{id:e.id,...people.find(p=>p.id===e.id).prose};
 if(e.category==='place'){const p=places.find(p=>p.id===e.id);const d={id:e.id,description:p.prose.description,authoredFacts:p.prose.authoredFacts};
  if(p.prose.clues)d.clues=p.prose.clues;if(p.kind==='seat')d.profileFacts=buildSettlementProfile(settlements.find(s=>s.id===p.id)).facts;return d;}
 if(e.category==='boss')return{id:e.id,...bosses.find(b=>b.id===e.id).prose};
 if(e.category==='faction')return{id:e.id,...Object.fromEntries(ORG_TEXT.map(k=>[k,ORG_PROSE[e.id][k]]))};
 return{id:e.id,...cultures.find(c=>c.id===e.id).prose};
}
export function contextFor(e){
 const org=organizations.find(o=>o.id===e.id);
 if(org){
  const s=seatOf(org.settlement),list=people,placeList=places;
  return{settlement:s.name,members:list.filter(p=>p.settlement===s.id&&p.tier==='full').map(p=>({name:p.name,role:p.role,occupation:p.occupation,home:placeName(p.home)})),
   places:placeList.filter(p=>p.settlement===s.id).map(p=>p.name),registeredFacts:[...placeList.filter(p=>p.settlement===s.id&&p.facts),...list.filter(p=>p.settlement===s.id&&p.facts)].flatMap(p=>p.facts.map(f=>`${p.name}：${f}`)),
   meetingAttendees:list.filter(p=>p.schedule?.some(r=>r[2]===s.society.meetingPlace)).map(p=>p.name),note:'coreMembers是组织核心成员；在议事处夜议或议事的人按作息另计，不必都是核心成员。组织名下的物资记在公账上，与treasuryCopper铜钱无关。',
   leaderSchedule:(list.find(p=>p.id===org.leader).schedule).map(([a,b,loc,act])=>`${clock(a)}-${clock(b)} ${placeName(loc)}：${act}`),
   leaderSecrets:list.find(p=>p.id===org.leader).prose.secrets.map(x=>x.content),
   meetingPlace:(m=>({name:m.name,description:m.prose.description,entry:m.prose.authoredFacts.entryRule}))(placeList.find(p=>p.id===s.society.meetingPlace)),
   seatDescription:placeList.find(p=>p.id===s.id).prose.description,
   storeClues:placeList.filter(p=>p.settlement===s.id&&p.prose.clues).flatMap(p=>Object.values(p.prose.clues).map(t=>`${p.name}：${t}`)),
   ...(s.society.supplies?{supplies:s.society.supplies.map(r=>`${itemName(r.item)}：${r.species?speciesName(r.species):placeName(r.from)+'换来'}，在${placeName(r.place)}；${r.use}`)}:{}),
   facts:['组织的私下目标和内部分歧只记在主持者可见的说明里，不在公开说明中出现。','“结缘”在本作指与外人结下互助往来的恩义，不是恋爱。']};
 }
 if(e.category==='route-rule')return{rules:applySpiritRules(world.rules).wildlifeAwakening,training:world.rules.training,population:buildSettlementProfile(settlements[0]),sourcePlaces:places.filter(p=>['site_ms_hx_dew','loc_ms_huixi'].includes(p.id)).map(p=>p.name),...(e.id==='rule_t162_borrow_form'?{consumerFacts:'wildlife-society.mjs spiritAction：先匹配 borrowForm.forms；不匹配时 resolve(species, monster)，只要物种已登记 wildlife 即可借其形。本相不可重复借；因此 forms 不是全部形貌白名单。'}:{})};
 const s=settlements.find(s=>s.name===e.settlement)??settlements.find(s=>bosses.find(b=>b.id===e.id)?.settlement===s.id);
 const c=cultures.find(c=>c.settlement===s.id);
 return{settlement:s.name,species:Object.keys(s.pendingSpeciesStructure).map(sp=>({name:speciesName(sp),habits:world.monsters.find(m=>m.id===sp).habits})),culture:{name:c.name,facts:c.prose.facts},
  members:people.filter(p=>p.settlement===s.id).map(p=>({name:p.name,age:p.age,species:speciesName(p.species),occupation:p.occupation,role:p.role??null,home:placeName(p.home)})),
  places:places.filter(p=>p.settlement===s.id).map(p=>`${p.name}（${{seat:'聚居地',facility:'公共设施',district:'住区',home:'私宅',council:'议事区',store:'存放处'}[p.kind]}）`),
  positions:positionsText(s),
  registeredFacts:[...places.filter(p=>p.settlement===s.id&&p.facts).flatMap(p=>p.facts.map(f=>`${p.name}：${f}`)),...people.filter(p=>p.settlement===s.id&&p.facts).flatMap(p=>p.facts.map(f=>`${p.name}：${f}`))],
  facts:['正文中的外貌、往事、情绪、习惯与日常细节是人物塑造，只要不与骨架、作息、库存和人数相反即可。','“开灵智”“立意”指野兽开了灵智、能以言语和动作表达意愿；本聚居地的穴鼬和林獾都是已立意的成员。','黄昏议事、交班、归根葬、炉灰画契、首火等是本聚居地文化的说法。']};
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
 if(e.category==='route-rule'){if(typeof d.text!=='string'||!d.text.trim())errors.push('缺少路线正文');return{errors,warnings};}
 if(e.category==='person'||e.category==='roster'){
  const p=people.find(p=>p.id===e.id);
  for(const k of e.category==='person'?PERSON_PROSE:['traits','currentConcern','visibleFeature'])if(d[k]===undefined||d[k]===null||textOf(d[k]).trim()==='')errors.push(`缺少 ${k}`);
  for(const m of text.matchAll(/([0-9一二两三四五六七八九十百]+)岁/g))if(numberValue(m[1])!==p.age&&!people.some(o=>o.age===numberValue(m[1])&&text.includes(o.name)))errors.push(`年龄 ${m[0]} 不符`);
  if(p.age<18&&ROMANCE.test(text))errors.push('未成年人出现恋爱或亲密情节');
  if(ROMANCE.test(text))warnings.push('含亲密字样需抽读');
  if(p.age<18&&/挖沟|下矿|搬运|服劳役|做工/.test(p.occupation))errors.push('幼体不服劳役');
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
  if(!/私宅/.test(d.behavior))errors.push('须写明通行不含私宅');
  return{errors,warnings};
 }
 if(e.category==='culture'){
  for(const k of ['focus','naming','facts','dailyLife','familyAndLaw','faithAndFestivals','voice','proverbs'])if(!d[k])errors.push(`缺少 ${k}`);
  if(!Array.isArray(d.proverbs)||d.proverbs.length<10||new Set(d.proverbs).size!==d.proverbs.length)errors.push('谚语须至少10条且不重复');
  if(!/送|葬|归根|亡者/.test(d.faithAndFestivals))errors.push('须写丧葬');if(!/幼/.test(d.familyAndLaw))errors.push('须写育幼');
  if(!/芦记|绳签/.test(d.voice))errors.push('须写传讯方式');if(!/忌/.test(d.faithAndFestivals))errors.push('须写禁忌');
  return{errors,warnings};
 }
 if(e.category==='faction'){
  for(const k of ORG_TEXT)if(d[k]===undefined||!textOf(d[k]).trim())errors.push(`缺少 ${k}`);
  const o=organizations.find(o=>o.id===e.id),f=buildFaction(o);
  if(f.publicDescription.includes(d.privateGoal))errors.push('公开说明混入私下目标');
  if(!d.prose.internalLife.includes('私下'))errors.push('内部说明须点明私下目标');
  if(d.stageEffects.length!==o.clock.stages.length)errors.push('阶段说明与时钟阶段数不符');
  for(const k of ['conduct','internalLife','playerEncounter'])if(typeof d.prose[k]!=='string'||d.prose[k].length<60)errors.push(`组织正文过短：${k}`);
  return{errors,warnings};
 }
 return{errors:['未知类别'],warnings};
}
// Global L1: the assembled batch must pass the release build and depth audit.
export async function validateBatch(){
 const {mergeMonsterSociety3}=await import('./publish-monster-society-3.mjs');
 const next=mergeMonsterSociety3(world,buildBatch()),v=validateWorld(next,{stage:'release'});
 return v.errors;
}

// ---------------------------------------------------------------- L2
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=1800;
 r.messages[0].content+='这是回汐埠已立意的狐鼬獭龟共居地、灰棚集哥布林与兽人地上市集、地方组织与个体成精路线的原创条目。route-rule按registeredRules核对数值、消耗与阶段边界，不能把个体点化说成创造族群或整乡。skeleton是机制事实（年龄、物种、职业、同户、住处、作息、库存、人数与分物种配额、立场、议题、首领机制、组织公账与时钟阶段），publishedFacts是同一聚居地已登记的成员、地点、文化和立场。'+
  '只把与skeleton或publishedFacts相反、或给出没有依据的新机制（新的数量、库存、价格、距离、法术效果、额外设施、额外成员身份）的句子列为hard；人物的外貌、性格、往事、情绪、打算、对他人的看法和日常细节是塑造，不是新增机制。组织的私下目标、内部分歧和对玩家的接触方式是组织塑造，只要不与机制相反即可。'+
  '作息中的时段可以概括说成“白天”“黄昏”“夜里”等。人物知道的事、怀疑和秘密只是此人的认知，不必与他人的认知一致，除非与机制相反。条目中的禁忌、规矩是文化说法。'+
  '正文里的往事、个人行为、看法、打算和心愿是人物塑造：不能只因“骨架未记载”“无依据”就标hard，只有与已登记的数值、身份、作息、库存或事实相反才是hard。物品可用简称（榛仁即去壳榛仁，核桃即碎壳净核桃仁，干果即干果小袋，铲柄即小工具木柄，镐即普通矿镐，铁钉即小铁钉，贡粮即干粮）。每个hard必须指出实际不相容的两个值；核对一致的句子不输出，一律不出现在数组中，也不能标hard；物品常用简称（燕麦即带壳燕麦，粗盐即粗盐小包，干粮即贡粮）；组织的核心成员与在议事处议事的人是两回事；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都与骨架和publishedFacts相容，唯一正确的输出是 {"contradictions":[]}。';
 r.messages.push({role:'user',content:'再次说明：contradictions 数组只放与 skeleton 或 publishedFacts 实际相反的句子。凡是核对后一致、相容、只是概括数量或省略未提机制的句子，一律不放进数组；reason 若要写“一致”“不构成矛盾”，该项就不应出现。没有矛盾时只输出 {"contradictions":[]}。'});
 return r;
}
export async function reviewMonsterSociety3({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T162正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body,entry})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const sent=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)),issued=sent.length;
   // site_ms_hx_store 已在 T162 期间发出两次审核；A3 收口修复把所有者由私人改为组织、改变了骨架，
   // 因此该条目允许一次基于新骨架的审核（其余条目仍是首审加一次重跑）。
   const allowance=2+(entry.id==='site_ms_hx_store'?1:0);
   if(sent.filter(r=>r.label.startsWith(`content-monster-society-3-${entry.id}-review`)).length>=allowance)throw Object.assign(Error(`${entry.id}已首审及重跑，不再调用`),{code:'CONTENT_BUDGET_STOP'});
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}

// ---------------------------------------------------------------- publication
export async function readMonsterSociety3Publication(root=draftRoot){
 // A deletion after two reviews may close only the flagged clause; retain both
 // provider receipts and reject any new wording under that editorial resolution.
 const narrowed=JSON.parse(await fs.readFile(path.join(root,'rule_t162_borrow_form.json'),'utf8'));
 if(narrowed.narrowing){const n=narrowed.narrowing,p=n.prior;
  if(n.kind!=='L4-delete-flagged-clause'||n.removed!=='或已登记野生物种之形'||p?.errors?.length!==1||p.errors[0].quote!=='可选人形或已登记野生物种之形'||!p.responseEvidence?.length||narrowed.draft.text!==p.draft.text.replace(n.removed,''))throw Error('借形人工收窄必须只删除原审核标记的分句');
 }
 const approved=await readApprovedContent(root,entries,{contextFor,revision});
 const missing=entries.filter(e=>!approved.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of entries){const d=approved.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);const v=validateDraft(d,e);if(v.errors.length)throw Error(`${e.id}: ${v.errors.join(';')}`);}
 const batch=buildBatch(),candidate=JSON.parse(await fs.readFile(path.join(root,'candidate.json'),'utf8'));
 if(hashContent(candidate)!==hashContent(batch))throw Error('候选与已审核内容不符');
 const summary=JSON.parse(await fs.readFile(path.join(root,'summary.json'),'utf8')),ids=new Set(entries.map(e=>e.id));
 const wave=(await Promise.all(summary.batches.map(async b=>JSON.parse(await fs.readFile(path.join(root,`batch-${b.index}.json`),'utf8')).l4?.wave??[]))).flat();
 const scores=Array.from({length:6},(_,i)=>wave.reduce((n,r)=>n+r.scores[i],0)/10);
 if(scores.some(n=>n<4)||wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(n=>!Number.isInteger(n)||n<3||n>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,b)=>a+b,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return batch;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}
  bad.push(...(await validateBatch()).map(x=>`batch: ${x}`));if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewMonsterSociety3({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[CARD]}));}
 if(process.argv.includes('--candidate')){await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(buildBatch(),null,2)+'\n');console.log('candidate written');}
}
