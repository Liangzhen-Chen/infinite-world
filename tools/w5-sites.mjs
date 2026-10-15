// T113–T115 遗迹据点：三组共用的构建、合并、L1、L2审核与发布逻辑。
// 正文由执行会话写在 world/design/w5-sites-{1,2,3}.mjs；DeepSeek 只做 L2 事实审核。
// 每组各用 world/drafts/w5-sites-N/budget.json 独立预算账。
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {loadWorld} from './load-world.mjs';
import {validateWorld} from './validate-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent,hashContent} from './content-pipeline.mjs';
import {locationTraits} from '../server-plugin/traits.mjs';

export const BATCHES={1:{card:'T113'},2:{card:'T114'},3:{card:'T115'}};
export const MAX_REQUESTS=45,LIMIT_YUAN=2;
const DIFFICULTY={简单:10,普通:15,困难:20,极难:25,近乎不可能:30};
const NO_MECHANICS='据点按登记机关、线索与有限库存结算；不新增工作站、产量或收费服务';
const same=(a,b)=>hashContent(a)===hashContent(b);
export const draftRoot=n=>path.resolve(`world/drafts/w5-sites-${n}`);
export async function design(n){return import(`../world/design/w5-sites-${n}.mjs`);}

// ---------------------------------------------------------------- build
const round=(x,d=2)=>Math.round(x*10**d)/10**d;
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
// A public feature is owned by its place (as in the existing catalog); an NPC-owned one needs that NPC's consent.
function feature(f,place){
 const base={id:f.id,name:f.name,aliases:f.aliases??[],owner:f.owner??place,access:f.owner?'consent':'public',position:f.position??[0,0]};
 if(f.type==='wood')return{...base,kind:'object',state:{material:'wood'},
  thermalModel:{heatCapacityJPerC:1000,maximumC:350,ambientC:15,passiveExchangeJPerMinute:50,burnMgPerMinute:100,fuelJPerMg:20,efficiencyPermille:900,ashPermille:50,ignitionMaximumMg:5000,ignitable:true,dryable:false,fuels:[]},
  thermalInitial:{temperatureC:15,fuelMg:4000,moistureMg:0}};
 if(f.type==='water')return{...base,kind:'water',state:{capacityMl:f.capacityMl??400000,waterMl:f.waterMl??300000,turbidity:f.turbidity??45,saltMg:0,toxinUg:0,pathogenRisk:f.pathogenRisk??20,odor:f.odor??'泥腥味'}};
 throw Error(`未知环境对象模板：${f.type}`);
}
const check=c=>({attribute:c[0],difficulty:DIFFICULTY[c[1]]??c[1],...(c[2]?{skill:c[2]}:{})});
export function buildSite(s){
 const site={owner:s.owner??null,...(s.manager?{manager:s.manager}:{}),occupants:s.occupants??[],entryMechanisms:s.entry??[],
  mechanisms:s.mechanisms.map(m=>({id:m.id,name:m.name,description:m.description,check:check(m.check),minutes:m.minutes,...(m.tool?{tool:m.tool}:{}),
   ...(m.materials?{materials:m.materials.map(([item,quantity])=>({item,quantity}))}:{}),...(m.damage!==undefined?{failureDamage:m.damage}:{}),
   ...(m.element?{element:{feature:m.element[0],tags:m.element.slice(1)}}:{})})),
  clues:s.clues.map(c=>({id:c.id,name:c.name,description:c.description,text:c.text,minutes:c.minutes,...(c.check?{check:check(c.check)}:{}),...(c.mechanisms?{mechanisms:c.mechanisms}:{})})),
  resources:s.resources.map(r=>({id:r.id,name:r.name,item:r.item,quantity:r.quantity,minutes:r.minutes,...(Object.hasOwn(r,'owner')?{owner:r.owner}:{}),...(r.requires?{requires:r.requires}:{}),...(r.mechanisms?{mechanisms:r.mechanisms}:{})})),
  truths:s.truths.map(t=>({id:t.id,requires:t.requires,text:t.text})),
  history:s.history.map(([era,text])=>({era,text})),
  changes:s.changes};
 return site;
}
export function buildRows(spec,world){
 const features=(spec.features??[]).map(f=>feature(f,spec.id));
 const routes=(spec.routes??[]).map(r=>{const from=world.locations.find(l=>l.id===r.from)??null;
  return{id:r.id,from:r.from,to:spec.id,lengthKm:r.km??round(distance(from?.coordinates??spec.coordinates,spec.coordinates)*(r.winding??1.15)),terrainMultiplier:r.terrainMultiplier??0.9,
   modes:r.modes??['walk'],closedSeasons:r.closedSeasons??[],toll:0,risk:r.risk??1};});
 if(spec.existing)return{patch:{id:spec.id,site:buildSite(spec),features,noMechanics:NO_MECHANICS,...(spec.entryRule?{entryRule:spec.entryRule}:{})},routes};
 const location={id:spec.id,name:spec.name,aliases:spec.aliases??[],parent:spec.parent,scope:spec.scope,coordinates:spec.coordinates,terrain:spec.terrain,openHours:[0,1440],
  owner:spec.owner??null,purpose:spec.purpose,rooms:[],inventory:{},...(spec.access?{access:{mode:spec.access}}:{}),
  authoredFacts:{climate:spec.climate,senses:spec.senses,entryRule:spec.entryRule,noMechanics:NO_MECHANICS},description:spec.description,
  ...(features.length?{features}:{}),site:buildSite(spec)};
 return{location,routes};
}
export function buildBatch(sites,world){
 const out={locations:[],patches:[],routes:[]};
 for(const s of sites){const r=buildRows(s,world);if(r.location)out.locations.push(r.location);if(r.patch)out.patches.push(r.patch);out.routes.push(...r.routes);}
 return out;
}
function applyPatch(row,p){
 const next=structuredClone(row);next.site=structuredClone(p.site);
 if(p.features.length)next.features=[...(next.features??[]).filter(f=>!p.features.some(x=>x.id===f.id)),...structuredClone(p.features)];
 if(next.authoredFacts){next.authoredFacts.noMechanics=p.noMechanics;if(p.entryRule)next.authoredFacts.entryRule=p.entryRule;}
 return next;
}
export function mergeSites(world,batch){
 const next=structuredClone(world),index=new Map(next.locations.map((r,i)=>[r.id,i]));
 for(const row of batch.locations){if(index.has(row.id)){if(!same(next.locations[index.get(row.id)],row))throw Error(`正式地点冲突：${row.id}`);}else{next.locations.push(structuredClone(row));index.set(row.id,next.locations.length-1);}}
 for(const p of batch.patches){if(!index.has(p.id))throw Error(`补全的地点不存在：${p.id}`);const i=index.get(p.id),cur=next.locations[i];
  if(cur.site&&!same(cur.site,p.site))throw Error(`已有据点参数冲突：${p.id}`);next.locations[i]=applyPatch(cur,p);}
 const routes=new Map(next.routes.map((r,i)=>[r.id,i]));
 for(const r of batch.routes){if(routes.has(r.id)){if(!same(next.routes[routes.get(r.id)],r))throw Error(`正式路线冲突：${r.id}`);}else{next.routes.push(structuredClone(r));routes.set(r.id,next.routes.length-1);}}
 return next;
}
// The world before this batch: new rows removed, completed rows returned to their prior form.
export function withoutSites(world,batch,priorNoMechanics){
 const next=structuredClone(world),ids=new Set(batch.locations.map(r=>r.id)),routeIds=new Set(batch.routes.map(r=>r.id));
 next.locations=next.locations.filter(r=>!ids.has(r.id)).map(r=>{const p=batch.patches.find(x=>x.id===r.id);if(!p)return r;
  const row=structuredClone(r);delete row.site;row.features=(row.features??[]).filter(f=>!p.features.some(x=>x.id===f.id));if(!row.features.length)delete row.features;
  if(row.authoredFacts&&priorNoMechanics?.[r.id])row.authoredFacts.noMechanics=priorNoMechanics[r.id];return row;});
 next.routes=next.routes.filter(r=>!routeIds.has(r.id));
 return next;
}

// ---------------------------------------------------------------- review entries
const itemName=(world,id)=>world.items.find(i=>i.id===id)?.name??id;
const who=(world,id)=>{if(!id)return'无主';const n=world.npcs.find(x=>x.id===id);if(n)return`${n.name}（${n.age}岁，${n.occupation}）`;
 const f=world.factions.find(x=>x.id===id);if(f)return`${f.name}（组织）`;const b=world.bosses.find(x=>x.id===id);return b?`${b.name}（首领）`:id;};
export function skeleton(spec,world,all){
 const place=world.locations.find(l=>l.id===spec.id),parent=world.locations.find(l=>l.id===(spec.parent??place?.parent))??all.find(s=>s.id===spec.parent);
 const name=spec.name??place.name,lairs=world.bosses.filter(b=>b.residence?.location===spec.id);
 const rows=buildRows(spec,world);
 return{id:spec.id,category:'site',name,completesExistingPlace:Boolean(spec.existing),parent:parent?.name??null,county:spec.county,terrain:spec.terrain??place?.terrain,
  traitTags:locationTraits({id:spec.id,terrain:spec.terrain??place?.terrain}).tags.filter(t=>t!=='location'),
  routes:rows.routes.map(r=>({from:world.locations.find(l=>l.id===r.from)?.name??all.find(s=>s.id===r.from)?.name,km:r.lengthKm,modes:r.modes.map(m=>({walk:'步行',horse:'骑马',cart:'车马',boat:'船'})[m]),closedSeasons:r.closedSeasons.map(x=>'春夏秋冬'[x]+'季')})),
  owner:who(world,spec.owner),manager:spec.manager?who(world,spec.manager):null,access:spec.access==='public'?'公开可入，采集仍须物主许可':null,
  occupants:[...(spec.occupants??[]).map(id=>who(world,id)),...lairs.map(b=>`${b.name}（首领，${b.tier}阶，巢穴：${b.residence.name}；败亡或离开后空置${b.residence.vacancyDays}天可被同地生物迁占）`)],
  features:(spec.features??[]).map(f=>({name:f.name,material:f.type==='wood'?'干木，可被火点燃':'积水，可被寒冷冻结'})),
  mechanisms:spec.mechanisms.map(m=>({name:m.name,blocksEntry:(spec.entry??[]).includes(m.id),check:`${m.check[0]}${m.check[1]}${m.check[2]?'（'+world.skills.find(s=>s.id===m.check[2])?.name+'）':''}`,minutes:m.minutes,
   tool:m.tool?itemName(world,m.tool):null,consumes:(m.materials??[]).map(([i,q])=>`${itemName(world,i)}${q}`),failureDamage:m.damage??0,
   elementBypass:m.element?`${spec.features.find(f=>f.id===m.element[0]).name}处于${m.element.slice(1).map(t=>({burning:'燃烧',frozen:'冻结',wet:'浸湿',hot:'灼热'})[t]).join('或')}状态时可直接解除`:null})),
  clues:spec.clues.map(c=>({name:c.name,minutes:c.minutes,check:c.check?`${c.check[0]}${c.check[1]}`:null,afterMechanisms:(c.mechanisms??[]).map(id=>spec.mechanisms.find(m=>m.id===id).name)})),
  resources:spec.resources.map(r=>({name:r.name,item:itemName(world,r.item),quantity:r.quantity,minutes:r.minutes,owner:Object.hasOwn(r,'owner')?who(world,r.owner):'同据点物主',
   requiresClues:(r.requires??[]).map(id=>spec.clues.find(c=>c.id===id).name),afterMechanisms:(r.mechanisms??[]).map(id=>spec.mechanisms.find(m=>m.id===id).name)})),
  truths:spec.truths.map(t=>({requiresClues:t.requires.map(id=>spec.clues.find(c=>c.id===id).name)})),
  timeChanges:spec.changes.map(c=>c.kind==='regrow'?`${spec.resources.find(r=>r.id===c.resource).name}每${c.everyDays}天补回${c.quantity}，最多回到${c.max}`:`${spec.mechanisms.find(m=>m.id===c.mechanism).name}解除后每${c.everyDays}天复原一次`)};
}
export function draftOf(spec){
 return{id:spec.id,...(spec.existing?{}:{name:spec.name,description:spec.description,climate:spec.climate,senses:spec.senses,entryRule:spec.entryRule,purpose:spec.purpose}),
  ...(spec.existing&&spec.entryRule?{entryRule:spec.entryRule}:{}),
  featureNames:(spec.features??[]).map(f=>f.name),
  history:spec.history.map(([era,text])=>`${era}：${text}`),
  mechanisms:spec.mechanisms.map(m=>({name:m.name,description:m.description})),
  clues:spec.clues.map(c=>({name:c.name,description:c.description,text:c.text})),
  resources:spec.resources.map(r=>r.name),truths:spec.truths.map(t=>t.text)};
}
function placeBrief(world,id,all){const l=world.locations.find(x=>x.id===id);if(l)return`${l.name}：${String(l.description??'').slice(0,160)}`;const s=all.find(x=>x.id===id);return s?`${s.name}：${s.description.slice(0,160)}`:null;}
export function contextFor(spec,world,all){
 const place=world.locations.find(l=>l.id===spec.id),lairs=world.bosses.filter(b=>b.residence?.location===spec.id);
 const county=world.regions?.find(r=>r.id===spec.county);
 const people=[spec.owner,spec.manager,...(spec.occupants??[]),...spec.resources.map(r=>r.owner)].filter(id=>id&&id.startsWith('npc_'));
 return{facts:['遗迹据点：进入前须解除登记的入口机关；线索要实际调查才得；有限资源采完不会因重访刷新，只有登记的随时间变化会补回或复原；隐藏真相要凑齐所列线索才解锁。',
   '机关检定沿用六项属性和简单10/普通15/困难20/极难25/近乎不可能30的难度；失败按登记伤害结算。',
   '首领巢穴里的首领在场时，外人须先解决占据关系才能进入据点；首领败亡或离开后巢穴空置，过一段时间会被同地实际生物迁占。'],
  county:county?{name:county.name,overview:county.prose?.overview??county.description?.slice(0,200)}:null,
  existingPlace:place?{description:place.description,climate:place.authoredFacts?.climate??null,senses:place.authoredFacts?.senses??null,entryRule:place.authoredFacts?.entryRule??null}:null,
  parent:placeBrief(world,spec.parent??place?.parent,all),
  lairs:lairs.map(b=>({name:b.name,lair:b.residence.name,lairDescription:b.lairDescription,origin:b.origin})),
  people:[...new Set(people)].map(id=>{const n=world.npcs.find(x=>x.id===id);return{name:n.name,age:n.age,occupation:n.occupation,description:String(n.description??'').slice(0,160)};}),
  organizations:[spec.owner,...spec.resources.map(r=>r.owner)].filter(id=>id?.startsWith('faction_')).map(id=>world.factions.find(f=>f.id===id)).filter(Boolean).map(f=>`${f.name}：${f.publicDescription??''}`),
  related:(spec.links??[]).map(id=>placeBrief(world,id,all)).filter(Boolean),
  notes:spec.reviewNotes??[]};
}

// ---------------------------------------------------------------- L1
const outside=/主持人|提示词|schema|JSON|生成器|骨架|编号|系统要求|玩家(?:不能|不得|必须)|塑料|电池|电动|检定|难度/;
const textOf=v=>typeof v==='string'?v:Array.isArray(v)?v.map(textOf).join('；'):v&&typeof v==='object'?Object.values(v).map(textOf).join('；'):'';
export function validateDraft(d,spec,world,blocklist){
 const errors=[];
 if(!d||d.id!==spec.id)return{errors:['id 与条目不符'],warnings:[]};
 const text=textOf(Object.fromEntries(Object.entries(d).filter(([k])=>k!=='id')));
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽词 ${word}`);
 if(outside.test(text))errors.push('世界外或规则术语');
 if(/[0-9零一二两三四五六七八九十百千]+\s*(公里|千米|里路|铜币|铜钱|银币|文钱)/.test(text))errors.push('正文写了未给定的距离或价格');
 if(!spec.existing){
  if(typeof d.description!=='string'||d.description.length<60||d.description.length>320)errors.push('描述长度不符');
  if(!d.description?.includes(spec.name))errors.push('描述须点明地点');
  if(!Array.isArray(d.senses)||d.senses.length!==3)errors.push('感官须三条');
 }
 if(d.history.length<3)errors.push('历史须至少三段，含建成、废弃或易手与现状');
 for(const m of spec.mechanisms)if(!m.description||m.description.length<12)errors.push(`机关说明过短：${m.name}`);
 for(const c of spec.clues)if(c.text.length<25||c.text.length>200)errors.push(`线索正文长度不符：${c.name}`);
 for(const t of spec.truths)if(t.text.length<40||t.text.length>260)errors.push('真相正文长度不符');
 for(const c of spec.clues)for(const t of spec.truths)if(c.text===t.text)errors.push('线索不得原样泄露真相');
 if(!spec.mechanisms.length||spec.clues.length<2||!spec.resources.length||!spec.truths.length||!spec.changes.length)errors.push('据点须有机关、两条以上线索、资源、真相与时间变化');
 for(const r of spec.resources){const item=world.items.find(i=>i.id===r.item);if(!item)errors.push(`资源物品未登记：${r.item}`);}
 return{errors,warnings:[]};
}

// ---------------------------------------------------------------- L2 and pipeline
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=900;
 r.messages[0].content+='这是原创仙武幻想世界中的遗迹据点条目。skeleton是登记的机制事实（物主、管理人、占据者、路线、机关的检定与耗时、可用环境对象、线索的调查条件、有限资源的物品与数量、真相解锁条件、随时间的变化）；publishedFacts是世界中已登记的地点、人物、首领与组织。draft是正文：历史分段、机关与线索说明、真相正文。'+
  '只把与skeleton或publishedFacts相反、或给出没有依据的新机制（新的数量、价格、距离、天数、法术效果、额外的物主或占据者、额外可取的财物）的句子列为hard。历史分段、旧日人物群体、建筑来历与传说是遗迹塑造，不是新增机制，只要不与已登记事实相反即可；线索正文与真相正文本来就允许写出前人留下的具体痕迹与事情经过。'+
  '季节写法：春夏秋冬。每个hard必须指出实际不相容的两个值。核对一致的句子不输出：一律不出现在数组中，也不能标hard；reason里认为一致、不构成矛盾的句子不得出现在数组中。若所有句子都相容，唯一正确的输出是 {"contradictions":[]}。';
 r.messages.push({role:'user',content:'再次说明：contradictions 数组只放与 skeleton 或 publishedFacts 实际相反的句子。核对一致的句子不输出；只是概括、省略或塑造的句子也不输出。没有矛盾时只输出 {"contradictions":[]}。'});
 return r;
}
export async function loadBatch(n){
 const mod=await design(n),world=await loadWorld();
 const blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
 const batch=buildBatch(mod.sites,world);
 // Review context is the world without this batch, identical before and after publication.
 const base=withoutSites(world,batch,mod.priorNoMechanics);
 const revs=mod.ENTRY_REVISIONS??{};
 const entries=mod.sites.map(s=>({...skeleton(s,base,mod.sites),rev:revs[s.id]??1}));
 const spec=id=>mod.sites.find(s=>s.id===id);
 return{mod,world,base,batch,entries,spec,blocklist,
  contextFor:e=>contextFor(spec(e.id),base,mod.sites),
  reviewDraftFor:e=>draftOf(spec(e.id)),
  validateDraft:(d,e)=>validateDraft(d,spec(e.id),base,blocklist)};
}
export async function review(n,{retryManual=false,ids=null}={}){
 // A normal review answers in seconds; calls that hang count against the card either way,
 // so this CLI process gives up after 90 s instead of the shared client's 180 s.
 if(!AbortSignal.timeout.w5){const base=AbortSignal.timeout.bind(AbortSignal);AbortSignal.timeout=Object.assign(ms=>base(Math.min(ms,90000)),{w5:true});}
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const card=BATCHES[n].card,root=draftRoot(n),b=await loadBatch(n);
 await fs.mkdir(root,{recursive:true});
 const ledger=path.join(root,'budget.json');
 try{await fs.access(ledger);}catch{await fs.writeFile(ledger,JSON.stringify({spentYuan:0,reservedYuan:0,waveLimitYuan:25,note:`${card} 独立预算账（用户指定）；不与其他卡共用`},null,2)+'\n');}
 const chosen=ids?b.entries.filter(e=>ids.includes(e.id)):b.entries;
 return runContentPipeline({entries:chosen,root,budgetRoot:root,revision:b.mod.revision,contextFor:b.contextFor,validateDraft:b.validateDraft,reviewDraftFor:b.reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:card,allocation:{cardId:card,incrementLimitYuan:LIMIT_YUAN,waveLimitYuan:25,maxRequests:MAX_REQUESTS,startingSpentYuan:0,startingReservedYuan:0},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(root,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error(`${card}正文由执行会话起草，禁止模型起草`);},buildReviewRequest,
  requestTransform:async({body})=>{const l=JSON.parse(await fs.readFile(ledger,'utf8'));const issued=Object.values(l.requests??{}).filter(r=>r.card===card&&['sent','settled','unknown'].includes(r.status)).length;
   if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${card}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return{body};}});
}
// One entry per pipeline call: a busy or unreachable service stops the round after
// one lost request instead of spending the card's request cap. When every entry has
// passed, a final whole-batch call (no new requests) writes summary and batch files.
export async function reviewSequential(n,{retryManual=false}={}){
 const b=await loadBatch(n),root=draftRoot(n),read=async id=>{try{return JSON.parse(await fs.readFile(path.join(root,`${id}.json`),'utf8'));}catch{return null;}};
 for(const e of b.entries){
  await review(n,{retryManual,ids:[e.id]});
  const after=await read(e.id),text=JSON.stringify(after?.errors??[]);
  if(after?.status==='pending'&&/503|too busy|timeout|fetch failed|HTTP 5\d\d|HTTP 429/i.test(text))return{stopped:e.id,reason:text.slice(0,200)};
 }
 const {summary}=await review(n,{retryManual:false});
 return{total:summary.total,passed:summary.passed,manual:summary.manual,pending:summary.pending,card:summary.budget?.cards?.[BATCHES[n].card]};
}
export async function l1(n){
 const b=await loadBatch(n),bad=[];
 for(const e of b.entries){const v=b.validateDraft(b.reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);}
 const merged=mergeSites(b.base,b.batch),v=validateWorld(merged,{stage:'release'});
 bad.push(...v.errors.map(x=>`world: ${x}`));
 return{bad,entries:b.entries.length};
}
// Reads the L1/L2/L4-approved drafts and returns the batch to publish.
export async function approved(n){
 const b=await loadBatch(n),root=draftRoot(n);
 const ok=await readApprovedContent(root,b.entries,{contextFor:b.contextFor,revision:b.mod.revision});
 const missing=b.entries.filter(e=>!ok.some(d=>d.id===e.id));if(missing.length)throw Error(`未通过审核：${missing.map(e=>e.id).join(',')}`);
 for(const e of b.entries){const d=ok.find(d=>d.id===e.id);if(hashContent(d)!==hashContent(b.reviewDraftFor(e)))throw Error(`已审核正文与设计稿不符：${e.id}`);}
 const summary=JSON.parse(await fs.readFile(path.join(root,'summary.json'),'utf8')),ids=new Set(b.entries.map(e=>e.id));
 const wave=(await Promise.all(summary.batches.map(async x=>JSON.parse(await fs.readFile(path.join(root,`batch-${x.index}.json`),'utf8')).l4?.wave??[]))).flat();
 if(wave.length!==10||new Set(wave.map(r=>r.id)).size!==10||wave.some(r=>!ids.has(r.id)||!Array.isArray(r.scores)||r.scores.length!==6||r.scores.some(x=>!Number.isInteger(x)||x<3||x>5)||typeof r.note!=='string'||!r.note.trim())||
  wave.flatMap(r=>r.scores).reduce((a,c)=>a+c,0)/60<4)throw Error('波次随机10条六项评分未达标');
 return b;
}
async function writeLike(target,value){
 const old=await fs.readFile(target,'utf8'),crlf=old.includes('\r\n'),plain=crlf?old.replace(/\r\n/g,'\n'):old,trailing=plain.endsWith('\n');
 let text=JSON.stringify(value,null,2)+(trailing?'\n':'');if(crlf)text=text.replace(/\n/g,'\r\n');
 const temp=`${target}.${randomUUID()}.tmp`;await fs.writeFile(temp,text);await fs.rename(temp,target);
}
export async function publish(n,{write=false}={}){
 const b=await approved(n),world=await loadWorld(),next=mergeSites(world,b.batch),v=validateWorld(next,{stage:'release'});
 if(!v.ok)throw Error(v.errors.join('\n'));
 const changed=[['geo/locations.json','locations'],['geo/routes.json','routes']].filter(([,k])=>!same(world[k],next[k]));
 if(write)for(const [file,key] of changed)await writeLike(path.resolve('world',file),next[key]);
 return{published:write,changed:changed.map(([f])=>f),ids:b.entries.map(e=>e.id)};
}
// L4: record the executor's reading notes and the wave scores into batch-0.json.
export async function recordL4(n,file){
 const root=draftRoot(n),notes=JSON.parse(await fs.readFile(file,'utf8')),batchFile=path.join(root,'batch-0.json'),batch=JSON.parse(await fs.readFile(batchFile,'utf8'));
 for(const id of [...batch.sample,...batch.flagged])if(!notes.notes.some(r=>r.id===id))throw Error(`缺少 L4 阅读记录 ${id}`);
 batch.l4={approved:true,reviewer:`${BATCHES[n].card}执行会话`,notes:notes.notes,wave:notes.wave,waveMean:notes.wave.flatMap(r=>r.scores).reduce((a,c)=>a+c,0)/(notes.wave.length*6)};
 await fs.writeFile(batchFile,JSON.stringify(batch,null,2)+'\n');return batch.l4;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 const arg=k=>{const i=process.argv.indexOf(k);return i<0?null:process.argv[i+1];},n=Number(arg('--batch'));
 if(!BATCHES[n])throw Error('须指定 --batch 1|2|3');
 if(process.argv.includes('--l1')){const r=await l1(n);if(r.bad.length)throw Error(r.bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:r.entries}));}
 if(process.argv.includes('--review')){const ids=arg('--ids');const {summary:s}=await review(n,{retryManual:process.argv.includes('--retry-manual'),ids:ids?ids.split(','):null});
  console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget?.cards?.[BATCHES[n].card]}));}
 if(process.argv.includes('--review-seq'))console.log(JSON.stringify(await reviewSequential(n,{retryManual:process.argv.includes('--retry-manual')})));
 if(process.argv.includes('--l4'))console.log(JSON.stringify(await recordL4(n,arg('--l4'))));
 if(process.argv.includes('--publish')||process.argv.includes('--dry-run'))console.log(JSON.stringify(await publish(n,{write:process.argv.includes('--publish')})));
}
