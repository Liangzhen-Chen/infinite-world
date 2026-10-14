import fs from 'node:fs/promises';
import path from 'node:path';
import {loadWorld} from './load-world.mjs';
import {DeepSeekClient} from './deepseek-client.mjs';
import {runContentPipeline,defaultReviewRequest,readApprovedContent} from './content-pipeline.mjs';
import {numberValue} from './w4-content.mjs';
import {revision,species,speciesProse,items,places,proseFields,clockText} from '../world/design/creatures-mixed.mjs';
export {revision};
// 2026-10-14 主会话追加：上限由50次/1.5元改为56次/1.6元，账内有修订记录。
const CARD='T154',MAX_REQUESTS=56;
export const draftRoot=path.resolve('world/drafts/creatures-mixed');
const budgetRoot=path.resolve('world/drafts/m4-object');
const world=await loadWorld(),blocklist=JSON.parse(await fs.readFile(new URL('../world/meta/blocklist.json',import.meta.url),'utf8'));
const batchSpecies=new Set(species.map(s=>s.id)),batchItems=new Map(items.map(i=>[i.id,i]));
const itemFact=id=>{const b=batchItems.get(id);if(b)return{id,name:b.name,weight:b.weight,shelfLifeDays:b.shelfLifeDays,use:b.skeleton.use};const i=world.items.find(r=>r.id===id);return i&&{id,name:i.name,weight:i.weight,shelfLifeDays:i.shelfLifeDays,use:i.use};};
const habitatFact=id=>{const p=places.find(p=>p.habitat.id===id);if(p)return{habitat:p.habitat,location:{id:p.id,name:p.name,village:p.mapHierarchy.at(-1).name,routeKm:p.route.lengthKm}};
 const h=world.rules.wildlife.habitats.find(h=>h.id===id),l=world.locations.find(l=>l.id===h.location),v=world.locations.find(v=>v.id===l.parent);return{habitat:h,location:{id:l.id,name:l.name,village:v?.name}};};
const tacticNames={armed:'刀剑等兵刃',unarmed:'拳脚及棍棒砸击',magic_fire:'火焰类法术',magic_cold:'寒冷类法术',magic_wind:'风类法术',magic_earth:'土石类法术',magic_light:'光类法术',magic_shadow:'暗影类法术',magic_mind:'迷惑心神的法术',magic_physical:'物理类法术'};
const tacticWords={armed:/刀|剑|兵刃/,unarmed:/拳|棍|砸/,magic_fire:/火/,magic_cold:/寒|冷|冻/,magic_wind:/风/,magic_earth:/石|土/,magic_mind:/心神|迷惑/};
const seasonNames=['春','夏','秋','冬'];
// Final L2 round: two kiln species share one review call (both skeletons and drafts, reviewed part by part).
// The combined call failed on rows the reviewer itself called consistent; the
// 2026-10-14 supplement reviews both species separately again.
export const pairs=[];
const paired=new Set(pairs.flatMap(([,ids])=>ids));
const speciesEntry=s=>({...s,category:'species'});
export const entries=[
 ...species.filter(s=>!paired.has(s.id)).map(speciesEntry),
 ...pairs.map(([id,ids])=>({id,category:'pair',parts:ids.map(i=>speciesEntry(species.find(s=>s.id===i)))})),
 ...items.map(({skeleton,prose,...i})=>({...i,...skeleton,category:'item'})),
 ...places.map(({prose,...p})=>({...p,category:'place'})),
];
export function reviewDraftFor(e){
 if(e.category==='pair')return{id:e.id,parts:e.parts.map(reviewDraftFor)};
 if(e.category==='species')return{id:e.id,...speciesProse[e.id]};
 if(e.category==='item')return{id:e.id,...items.find(i=>i.id===e.id).prose};
 return{id:e.id,...places.find(p=>p.id===e.id).prose};
}
export function contextFor(e){
 if(e.category==='pair')return{parts:e.parts.map(contextFor)};
 if(e.category==='item'){const sources=species.filter(s=>s.drops.some(d=>d.item===e.id));return{droppedBy:sources.map(s=>({id:s.id,name:s.name,gather:{minutes:s.wildlife.gather.minutes,tool:s.wildlife.gather.tool&&itemFact(s.wildlife.gather.tool).name,consumes:s.wildlife.gather.consumes.map(c=>({...c,name:itemFact(c.item).name}))}})),
  origin:habitatFact(places.find(p=>p.id===e.origin).habitat.id).location,facts:['新材料只能从对应物种取材取得，没有登记任何配方、药效或施法用途；可按价出售。']};}
 if(e.category==='place')return{village:e.mapHierarchy.at(-1).name,routeKm:e.route.lengthKm,species:species.filter(s=>s.wildlife.habitat===e.habitat.id).map(s=>({name:s.name,activeHours:clockText(s.wildlife.activeHours)})),
  facts:['地点只登记步行路线、栖地和描述，没有工作站、库存、产量或收费服务。距离由路线给出，描述不另写里程。']};
 const w=e.wildlife,h=habitatFact(w.habitat),n=e.nature;
 const cohabitants=[...world.monsters.filter(m=>m.wildlife?.habitat===w.habitat&&!batchSpecies.has(m.id)).map(m=>m.name),...species.filter(s=>s.wildlife.habitat===w.habitat&&s.id!==e.id).map(s=>s.name)];
 return{...h,activity:clockText(w.activeHours),cohabitants,
  drops:e.drops.map(d=>({...d,catalog:itemFact(d.item)})),gather:{minutes:w.gather.minutes,tool:w.gather.tool&&itemFact(w.gather.tool),consumes:w.gather.consumes.map(c=>({...c,catalog:itemFact(c.item)}))},
  exchange:(n.exchange??[]).map(itemFact),
  combat:`弱点：${n.affinity.weak.map(t=>tacticNames[t]).join('、')||'无'}，伤害×1.5；抗性：${n.affinity.resist.map(t=>tacticNames[t]).join('、')||'无'}，伤害×0.5（即只有一半）。其余进攻按常规结算。`,
  spirit:n.spirit?'低阶邪秽灵体：接触时以灵体状态出现，可被驱邪/净场仪式驱离；驱离的个体直接消失、不留尸体或材料。':n.group==='亡灵'?'有实体的亡灵，不是灵体：驱邪仪式会误判，只造成1点擦伤，不能驱离。':null,
  reproduction:w.manifest?`不繁殖：每周最多新起${w.manifest.perWeek}个，只在${w.manifest.seasons.map(i=>seasonNames[i]).join('、')}季，数量不超过栖地容量；条件：${w.manifest.cause}。`:'按普通繁殖恢复，需要至少两只同类。',
  civilized:n.civilized?'文明族群：不进入猎物掉落表，杀死后无材料；资源以exchange物品交换表达。另有定居同族不计在野外种群。':null,
  facts:['predatorOf为空只表示不参与数量模型的捕食，小虫小兽等背景食源与偶发捕食描述允许。','遭遇默认不开战；接触只是看见或追踪到实际个体。','民间误解必须在同段明确纠正。','gather的时间、工具与耗材是一次取材的总量；drops是取材所得，不是击杀自动获得。']};
}
const clockOf=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
const outside=/主持人|提示词|schema|JSON|生成器|骨架字段|编号|系统要求|原地重生|无限刷新|塑料|电池|电动|\b(?:activity|grouping|drops|manifest|affinity)\b/;
function common(text,errors){
 for(const word of [...blocklist.names,...blocklist.realPeople])if(text.includes(word))errors.push(`命中原创屏蔽词 ${word}`);
 if(outside.test(text))errors.push('世界外术语或未设定技术');
 if(/[0-9零一二两三四五六七八九十百千]+\s*(公里|千米|里路|铜币|铜钱|银币)/.test(text))errors.push('未给定的距离或价格');
}
export function validateDraft(d,e){
 const errors=[],warnings=[];
 if(!d||d.id!==e.id)return{errors:['id 与骨架不符'],warnings};
 if(e.category==='pair'){if(Object.keys(d).sort().join()!=='id,parts'||!Array.isArray(d.parts)||d.parts.length!==e.parts.length)return{errors:['合审条目须逐个给出说明'],warnings};e.parts.forEach((p,i)=>{const v=validateDraft(d.parts[i],p);errors.push(...v.errors.map(x=>`${p.id}: ${x}`));warnings.push(...v.warnings.map(x=>`${p.id}: ${x}`));});return{errors,warnings};}
 if(e.category==='place'){
  const keys=Object.keys(d).sort().join(),f=d.authoredFacts;
  if(keys!=='authoredFacts,description,id')errors.push('地点只许输出描述与authoredFacts');
  if(typeof d.description!=='string'||d.description.length<80||d.description.length>260)errors.push('地点描述长度不符');
  if(!f||typeof f.climate!=='string'||!Array.isArray(f.senses)||f.senses.length!==3||f.senses.some(s=>typeof s!=='string'||!s)||typeof f.entryRule!=='string'||f.noMechanics!=='无新增工作站、可领取库存、产量或收费服务')errors.push('authoredFacts 不完整');
  if(!d.description.includes(e.name)||!d.description.includes(e.mapHierarchy.at(-1).name.replace(/村|镇$/,'')))errors.push('描述须点明地点和所属聚落');
  common(JSON.stringify(d),errors);return{errors,warnings};
 }
 if(e.category==='item'){
  const keys=Object.keys(d).sort().join();if(keys!=='description,id,inspection,seasonality,storage')errors.push('物品只许输出描述、检验、保存与季节');
  for(const k of ['description','inspection','storage','seasonality'])if(typeof d[k]!=='string'||!d[k].trim())errors.push(`缺少 ${k}`);
  if(errors.length)return{errors,warnings};
  const text=[d.description,d.inspection,d.storage].join('。');common(text,errors);
  const grams=Math.round(e.weight*1000);for(const m of text.matchAll(/([0-9零一二两三四五六七八九十百千]+)\s*克/g))if(numberValue(m[1])!==grams)errors.push(`重量 ${m[0]} 不符`);
  for(const m of text.matchAll(/([0-9零一二两三四五六七八九十百千]+)\s*(?:天|日)/g))if(numberValue(m[1])!==e.shelfLifeDays)errors.push(`保存期 ${m[0]} 不符`);
  if(e.shelfLifeDays===null&&!/无固定保存期/.test(d.storage))errors.push('无保存期物品须写明无固定保存期');
  if(/可(?:治|疗|解毒|驱邪|施法)|能治|入药方/.test(text)&&!/没有|尚无|不能|不可/.test(text))errors.push('新增未登记的药效或施法用途');
  return{errors,warnings};
 }
 const keys=Object.keys(d);if(keys.some(k=>!['id',...proseFields].includes(k)))errors.push('只许输出指定说明字段');
 for(const f of proseFields){if(typeof d[f]!=='string'||!d[f].trim())errors.push(`缺少 ${f}`);else if(d[f].length<25||d[f].length>240)warnings.push(`${f} 长度需要抽读`);}
 if(errors.length)return{errors,warnings};
 const text=proseFields.map(f=>d[f]).join('。'),w=e.wildlife,n=e.nature;common(text,errors);
 const times=[...d.habits.matchAll(/\d{2}:\d{2}/g)].map(m=>m[0]),activity=w.activeHours.map(clockOf);
 if(times.join(',')!==activity.join(',')||!new RegExp(`${activity[0]}至(?:次日)?${activity[1]}`).test(d.habits))errors.push(`habits 活动时段应只写 ${activity.join(' 至 ')}`);
 if(!d.habits.includes(e.grouping))errors.push(`habits 应写明群居情况：${e.grouping}`);
 for(const m of text.matchAll(/([0-9零一二两三四五六七八九十百千]+)\s*分钟/g))if(numberValue(m[1])!==w.gather.minutes)errors.push(`时长 ${m[0]} 与取材不符`);
 if(w.manifest){
  if(/产仔|产卵|下蛋|幼崽|交配|繁殖|怀胎|分裂|生下/.test(text))errors.push('非繁殖物种不能写繁殖');
  if(!/不会生养|不靠生养/.test(d.habits))errors.push('非繁殖物种须在习性中写明不会生养及生成条件');
 }
 for(const t of n.affinity.weak)if(!tacticWords[t]||!d.threat.split(/[。；]/).some(s=>tacticWords[t].test(s)&&/更重/.test(s)))errors.push(`threat 未写明弱点 ${t}`);
 for(const t of n.affinity.resist)if(!tacticWords[t]||!d.threat.split(/[。；]/).some(s=>tacticWords[t].test(s)&&/一半/.test(s)))errors.push(`threat 未写明抗性 ${t}`);
 if(n.spirit&&!/驱离/.test(d.threat))errors.push('灵体须写明可被法事驱离');
 if(!n.spirit&&n.group==='亡灵'&&!/驱邪的法事(?:对它无效|不能驱离它)/.test(d.threat))errors.push('有实体亡灵须写明驱邪不能驱离');
 if(n.civilized){if(!/不当猎物取材/.test(d.materials))errors.push('文明族群不能写成猎物材料');for(const id of n.exchange)if(!d.materials.includes(itemFact(id).name.replace(/小袋|片$/,'').slice(0,2)))errors.push(`交换产物未写明 ${id}`);}
 else if(!e.drops.length){if(/可(?:剥取|采集|提炼|得到|获取|收获)/.test(d.materials)||!/没有可用的材料/.test(d.materials))errors.push('无材料物种须写明没有可用材料');}
 else{for(const drop of e.drops)if(!d.materials.includes(itemFact(drop.item).name))errors.push(`材料须写明 ${drop.item}`);
  if(w.gather.tool&&!d.materials.includes(itemFact(w.gather.tool).name))errors.push('材料须写明取材工具');
  for(const c of w.gather.consumes)if(!d.materials.includes(itemFact(c.item).name.replace('一份','')))errors.push('材料须写明取材耗材');}
 if(e.intelligence<2&&/[“「][^”」]*[我你您他她谁请要让别是的][^”」]*[”」]/.test(d.voice))errors.push('低灵智物种不能说人话');
 return{errors,warnings};
}
export function buildReviewRequest(e,d,c){
 const r=defaultReviewRequest(e,d,c);r.max_tokens=2000;
 r.messages[0].content+='这是原创中西混合幻想世界的生物、材料与野外地点条目。publishedFacts中的combat、spirit、reproduction、civilized是已实现规则，正文写“伤害更重/只有一半/法事可驱离/驱邪无效/不会生养”与之一致即可。nature.group的妖怪、亡灵、异族、灵兽、元素体、魔物是门类，民间说法会在同段纠正，被纠正的传言不是能力。习性中的取暖、发冷、行为偏好、背景食源、地形风险属于正常描写，不是新增机制，最多soft。外观尺寸用尺、人高等约数不算新增数值。cohabitants是同栖地已有或本批物种，relations可引用它们及乌鸦野狗等背景动物。地点描述的步行到达方式与routeKm相容即可。skeleton.parts与draft.parts、publishedFacts.parts按顺序一一对应时，逐个物种审查，只引用对应物种的事实。打倒（生命归零后按gather取材得drops）与仪式驱离（直接消失不留材料）是两条不同路径，同时写出不矛盾；“只造成1点擦伤”可写成最多擦伤一点。breeding物种写生养幼崽是正常的。同栖地物种之间的避让、各不相干等描写不是新增机制。每个hard必须指出实际不相容的两个值；reason认为一致、不构成矛盾的句子绝不能列出，也不能标hard；核对通过的句子一律不输出。示例：若所有句子都与骨架和publishedFacts一致，唯一正确的输出是 {"contradictions":[]}；把一致的句子写进数组属于输出格式错误。';
 return r;
}
export async function reviewMixed({retryManual=false,ids=null}={}){
 if(!process.env.DEEPSEEK_API_KEY)throw Error('DEEPSEEK_API_KEY 环境变量未配置');
 const chosen=ids?entries.filter(e=>ids.includes(e.id)):entries;
 return runContentPipeline({entries:chosen,root:draftRoot,budgetRoot,revision,contextFor,validateDraft,reviewDraftFor,reuseFrozenDrafts:true,retryManual,
  cardId:CARD,allocation:{cardId:CARD,incrementLimitYuan:1.6,waveLimitYuan:25,maxRequests:MAX_REQUESTS},concurrency:1,batchSize:50,
  client:new DeepSeekClient({budgetYuan:25,logFile:path.join(draftRoot,'usage.jsonl')}),
  buildDraftRequest:()=>{throw Error('T154正文由执行会话起草，禁止模型起草');},buildReviewRequest,
  requestTransform:async({body})=>{const ledger=JSON.parse(await fs.readFile(path.join(budgetRoot,'budget.json'),'utf8'));const issued=Object.values(ledger.requests??{}).filter(r=>r.card===CARD&&['sent','settled','unknown'].includes(r.status)).length;if(issued>=MAX_REQUESTS)throw Object.assign(Error(`${CARD}已达${MAX_REQUESTS}次L2调用上限`),{code:'CONTENT_BUDGET_STOP'});return {body};}});
}
export function assemble(input){
 const rows=input.flatMap(r=>r.parts??[r]);
 const draft=id=>{const r=rows.find(r=>r.id===id);if(!r)throw Error(`未审核：${id}`);const {id:_,...rest}=r;return rest;};
 // Species whose L2 is still manual are held back; materials and places must all pass.
 const ready=species.filter(s=>rows.some(r=>r.id===s.id));
 return{monsters:ready.map(s=>({...s,...draft(s.id)})),held:species.filter(s=>!ready.includes(s)).map(s=>s.id),
  items:items.map(({skeleton,prose,...i})=>({...i,...skeleton,...draft(i.id)})),
  locations:places.map(({habitat,route,prose,...p})=>({...p,...draft(p.id)})),
  habitats:places.map(p=>p.habitat),routes:places.map(p=>p.route)};
}
export function assertOnlySpeciesHeld(rows){
 const missing=entries.filter(e=>!rows.some(r=>r.id===e.id));
 if(missing.some(e=>!['species','pair'].includes(e.category)))throw Error(`材料或地点未通过审核：${missing.map(e=>e.id).join(',')}`);
 return missing.map(e=>e.id);
}
export async function candidateMixed(){
 const rows=await readApprovedContent(draftRoot,entries,{contextFor,revision});assertOnlySpeciesHeld(rows);
 const candidate=assemble(rows);await fs.writeFile(path.join(draftRoot,'candidate.json'),JSON.stringify(candidate,null,2)+'\n');return candidate;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename)){
 if(process.argv.includes('--l1')){const bad=[],warn=[];for(const e of entries){const v=validateDraft(reviewDraftFor(e),e);if(v.errors.length)bad.push(`${e.id}: ${v.errors.join(';')}`);if(v.warnings.length)warn.push(`${e.id}: ${v.warnings.join(';')}`);}if(bad.length)throw Error(bad.join('\n'));console.log(JSON.stringify({L1:'passed',entries:entries.length,warnings:warn}));}
 if(process.argv.includes('--review')){const i=process.argv.indexOf('--ids');const {summary:s}=await reviewMixed({retryManual:process.argv.includes('--retry-manual'),ids:i<0?null:process.argv[i+1].split(',')});console.log(JSON.stringify({total:s.total,passed:s.passed,manual:s.manual,pending:s.pending,card:s.budget.cards[CARD]}));}
 if(process.argv.includes('--candidate')){const c=await candidateMixed();console.log(JSON.stringify({monsters:c.monsters.length,items:c.items.length,locations:c.locations.length}));}
}
