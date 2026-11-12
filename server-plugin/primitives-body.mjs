// Body needs are bounded slow facts, not accounts. The timestamp and activity
// make reads closed-form; no per-minute events or copied derived statuses.
import {reject} from './primitive-policy.mjs';
import {fixedUnits,fixedNumber,checkedFixed} from './rx.mjs';
import {physicalItem} from './items.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {stateMemo} from './storage.mjs';
const pathOf=(document,actor)=>actor==='player'?['state','player']:document.state.npcs?.[actor]?['state','npcs',actor]:document.state.creatures?.[actor]?['state','creatures',actor]:null;
const atPath=(document,path)=>path?.reduce((v,k)=>v?.[k],document);
export function bodyRule(engine,need){
 const row=engine.world.primitiveTables?.body?.rows?.find(r=>r.need===need&&r.selector==='person');
 if(!row)reject('E-BODY-TABLE','The archived body table is required');
 return row;
}
// The single entry for how fast an actor's need falls. The species' nature.metabolism
// scales the person table per need (absent = 1, 0 = never falls); player and
// speciesless actors follow the table as is. Every drain reader goes through here.
export function speciesMetabolism(engine,speciesId,need){
 const factor=engine.byId?.get(speciesId)?.nature?.metabolism?.[need];
 return factor===undefined?1:factor;
}
export function metabolismFactor(engine,state,actor,need){
 if(actor==='player')return 1;
 const row=state?.npcs?.[actor]??state?.creatures?.[actor];
 return speciesMetabolism(engine,row?.species??engine.byId?.get(actor)?.species,need);
}
// Mouths a settlement's granary must feed, derived from the live state: living named residents
// count by their own species factor; the rest of the head count follows the world's authored
// species make-up (pendingSpeciesStructure), or eats as people when there is none.
// Real-valued: callers round once, at the step that removes whole portions.
// Static per engine: can any species tied to this settlement (resident or authored make-up) have a
// non-1 factor? If not, the head count is the answer and nothing is derived (every human settlement).
const mayDiffer=new WeakMap();
function settlementMayDiffer(engine,sid,need){
 const cache=mayDiffer.get(engine)??new Map();mayDiffer.set(engine,cache);
 const key=`${sid}|${need}`;if(cache.has(key))return cache.get(key);
 const profile=engine.world?.settlementProfiles?.find(p=>p.id===sid);
 const species=profile?[...(profile.residentIds??[]).map(id=>engine.byId?.get(id)?.species),...Object.keys(profile.pendingSpeciesStructure??{})]:[];
 const result=species.some(sp=>sp!==undefined&&speciesMetabolism(engine,sp,need)!==1);
 cache.set(key,result);return result;
}
// Index of residents with a non-1 species, by settlement. It reads only each npc's species and
// materialized settlement, so stateMemo drops it exactly when an npc is added/removed or those change.
// Without an active record index stateMemo just builds: one O(npcs) pass per call.
const oddArrivalInputs=[['npcs','*','species'],['npcs','*','materialized','settlement'],['created'],['remote']];
const oddDefinedCache=new WeakMap();
function oddDefined(engine,odd){
 let byOdd=oddDefinedCache.get(engine);if(!byOdd)oddDefinedCache.set(engine,byOdd=new Map());
 if(!byOdd.has(odd))byOdd.set(odd,(engine.world?.npcs??[]).filter(n=>odd.has(n.species)).map(n=>n.id));
 return byOdd.get(odd);
}
function oddArrivals(engine,state,need,odd){
 return stateMemo(state,engine,['oddArrivals',need],()=>{
  // 只看可能属于非 1 因子物种的人：世界定义里该物种的 NPC（按引擎静态缓存）加运行时新建的人物，而不是遍历全体 NPC。
  const map=new Map(),seen=new Set();
  // 远方生成的人物直接写入 npcs，来源是 state.remote 各县骨架的 people（带物种）；只取物种属非 1 集合者。
  const remote=Object.values(state?.remote??{}).flatMap(rec=>(rec?.skeleton?.people??[]).filter(p=>odd.has(p.species)).map(p=>p.id));
  for(const id of [...oddDefined(engine,odd),...Object.keys(state?.created??{}),...remote]){
   if(seen.has(id))continue;seen.add(id);
   const n=state?.npcs?.[id],sid=n?.materialized?.settlement;if(!sid||!odd.has(n.species??engine.byId?.get(id)?.species))continue;
   (map.get(sid)??map.set(sid,[]).get(sid)).push(id);
  }
  return map;
 },oddArrivalInputs);
}
const oddSets=new WeakMap();
function oddSpecies(engine,need){
 const cache=oddSets.get(engine)??new Map();oddSets.set(engine,cache);
 if(!cache.has(need))cache.set(need,new Set((engine.world?.monsters??[]).filter(m=>speciesMetabolism(engine,m.id,need)!==1).map(m=>m.id)));
 return cache.get(need);
}
export function settlementMouths(engine,state,sid,population,need='satiety'){
 const staticDiffer=settlementMayDiffer(engine,sid,need),odd=staticDiffer?null:oddSpecies(engine,need);
 // Late arrivals (migrants, generated residents) of a non-1 species also change the answer. They come
 // from a per-state index (settlement -> ids), built once per state revision and then O(1) per call.
 const arrivals=odd?.size?oddArrivals(engine,state,need,odd).get(sid)??[]:[];
 if(!staticDiffer&&!arrivals.length)return population;
 const profile=engine.world?.settlementProfiles?.find(p=>p.id===sid)??{};
 const mixed=profile.pendingSpeciesStructure,ids=new Set(profile.residentIds??[]);
 if(mixed)for(const [id,n] of Object.entries(state?.npcs??{}))if(n.materialized?.settlement===sid)ids.add(id);
 for(const id of arrivals)ids.add(id);
 let named=0,weighted=0;
 for(const id of ids){if(state?.npcs?.[id]&&isPhysicallyDead(engine,state,id))continue;named++;weighted+=metabolismFactor(engine,state,id,need);}
 let share=1;
 if(mixed){const total=Object.values(mixed).reduce((n,g)=>n+g.population,0);if(total>0)share=Object.entries(mixed).reduce((n,[sp,g])=>n+g.population*speciesMetabolism(engine,sp,need),0)/total;}
 if(weighted===named&&share===1)return population;
 if(population<named)return named>0?weighted*population/named:0;
 return weighted+(population-named)*share;
}
export function settlementMealRatio(engine,state,sid,need='satiety'){
 const population=state?.settlements?.[sid]?.population??0;
 return population>0?settlementMouths(engine,state,sid,population,need)/population:1;
}
// 农事聚落的目标持有天数(t) = 距下次收获天数(t) + reserveDays：刚收完要撑到下次收获，再留一段结转储备。
// 收获日（年内第几日）= 作物最后一批成熟日 = crop.sowDays[1] + crop.growthDays（rules.agriculture.crop；agriculture.mjs:194 播种窗、:204 成熟条件 grownDays >= growthDays，
// 之后收获完成）；一年 360 日（engine.calendar 的 floor(日/360)）。当日就是收获日则距下次收获 0 天，收获日之后的次日起为 359 天。
export function farmTargetDays(engine,minute,profile){
 const crop=engine.rules.agriculture.crop,harvest=crop.sowDays[1]+crop.growthDays,dayOfYear=Math.floor(minute/1440)%360;
 return ((harvest-dayOfYear)%360+360)%360+profile.reserveDays;
}
// 非农事聚落的补给间隔（天）：粮从农事聚落（agriculture.settlements，唯一有粮食生产的聚落类）运来，间隔 = 最近供粮聚落的 walk 往返路程天数
// （路线按季节开闭，取一年各月里最快的一条＝路开着时的正常路程；route.minutes 已含每日歇息）。周贸易班线两端都是农事聚落，不覆盖非农事聚落，所以不是这里的来源。
// 一年里到不了任何供粮聚落：直接报错列出聚落，不编造天数。同一世界数据对象内按聚落记忆。市场的目标持有与远方聚落的开局存粮共用这一条规律（常态 = 目标）。
const resupplyMemo=new WeakMap();
export function resupplyDays(engine,seed,place){
 const memo=resupplyMemo.get(engine.world)??new Map();resupplyMemo.set(engine.world,memo);
 if(memo.has(place))return memo.get(place);
 let best=null;
 // 供粮聚落不含本聚落自己（农事聚落的非粮补给来自最近的别的农事聚落；本聚落到本聚落路程为 0 不是补给）。
 for(const p of engine.rules.agriculture?.settlements??[])for(let month=0;month<12;month++){
  if(p.settlement===place)break;
  try{const r=engine.route(p.settlement,place,'walk',month*30*1440,seed);if(best===null||r.minutes<best)best=r.minutes;}
  catch(error){if(!error.message.startsWith('没有当前季节'))throw error;}
 }
 if(best===null)throw Error(`聚落 ${place} 到不了任何供粮（农事）聚落，推不出补给间隔`);
 const days=2*best/1440;memo.set(place,days);return days;
}
// Mouths for a head count after `levy` of them left (soldiers keep the settlement's make-up).
export function mealMouthsOf(engine,state,sid,population,{levy=0,need='satiety'}={}){
 const full=settlementMouths(engine,state,sid,population,need);
 return levy>0&&population>0?full*Math.max(0,population-levy)/population:full;
}
export function bodyDrain(engine,state,actor,need,activity='light'){
 return bodyRule(engine,need).drainPerHour[activity]*metabolismFactor(engine,state,actor,need);
}
export function bodyFact(engine,document,actor,need){
 const path=pathOf(document,actor);if(!path)reject('E-BODY-TARGET','The actor has no body');
 const rule=bodyRule(engine,need),stored=atPath(document,path)?.body?.[need];
 const fact=stored&&typeof stored==='object'?stored:{value:stored??(need==='fatigue'?0:rule.max),asOf:document.state.minute,activity:'rest'};
 if(!Number.isFinite(fact.value)||fact.value<0||fact.value>rule.max||!Number.isSafeInteger(fact.asOf)||fact.asOf>document.state.minute||fact.asOf<0||!Number.isInteger(fact.remainder??0)||(fact.remainder??0)<0||(fact.remainder??0)>=60||!Object.hasOwn(rule.drainPerHour,fact.activity??'rest'))reject('E-BODY-FACT','Invalid body fact');
 return {...fact,activity:fact.activity??'rest'};
}
export function readBodyState(engine,document,actor,need,minute=document.state.minute){
 const fact=bodyFact(engine,document,actor,need),rule=bodyRule(engine,need);
 if(!Number.isSafeInteger(minute)||minute<fact.asOf)reject('E-BODY-TIME','A body read cannot precede its saved fact');
 const rate=fixedUnits(bodyDrain(engine,document.state,actor,need,fact.activity));
 let numerator=checkedFixed(fixedUnits(fact.value)*60n+BigInt(fact.remainder??0)+(need==='fatigue'?1n:-1n)*rate*BigInt(minute-fact.asOf));
 const maximum=fixedUnits(rule.max)*60n;numerator=numerator<0n?0n:numerator>maximum?maximum:numerator;
 // remainder is an integer division carry for minutes/hour, not a second
 // numeric precision. Saving it preserves split/whole-duration equivalence.
 return {value:fixedNumber(numerator/60n),remainder:Number(numerator%60n)};
}
export function readBodyNeed(engine,document,actor,need,minute=document.state.minute){return readBodyState(engine,document,actor,need,minute).value;}
export function writeBodyNeed(d,engine,actor,need,value,{activity='rest',minute=d.get('state','minute'),remainder=0}={}){
 const path=pathOf(d.document,actor),rule=bodyRule(engine,need);
 if(!path||!Number.isFinite(value)||!Number.isSafeInteger(minute)||minute!==d.get('state','minute')||!Number.isInteger(remainder)||remainder<0||remainder>=60||!Object.hasOwn(rule.drainPerHour,activity))reject('E-BODY-FACT','Invalid body update');
 value=Math.max(0,Math.min(rule.max,fixedNumber(fixedUnits(value))));
 if(value===0||value===rule.max)remainder=0;
 d.set([...path,'body',need],{value,asOf:minute,activity,...(remainder?{remainder}:{})});return value;
}
export function beginBodyActivity(d,engine,actor,activity){
 for(const need of ['stamina','satiety','hydration','fatigue']){const state=readBodyState(engine,d.document,actor,need);writeBodyNeed(d,engine,actor,need,state.value,{activity,remainder:state.remainder});}
}
export function endBodyActivity(d,engine,actor){beginBodyActivity(d,engine,actor,'rest');}
// The units this nourishment comes from: those consumed at this minute that
// are food or drink (a caller that knows them passes `consumed`). Without the
// draft's patches, or an explicit list, the source cannot be verified.
function nourishingUnits(d,engine,minute,consumed){
 if(Array.isArray(consumed))return consumed;
 if(!Array.isArray(d.patches))reject('E-BODY-FOOD','The consumed food cannot be verified without the action patches');
 const latest=new Map();
 for(const patch of d.patches)if(patch.op==='set'&&patch.path?.[1]==='itemInstances'&&patch.path.length===3)latest.set(patch.path[2],patch.value);
 return [...latest].filter(([,unit])=>{
  if(unit?.status!=='已消耗'||unit.consumedAt!==minute)return false;
  const catalog=engine.byId.get(unit.item);
  return unit.physicalOnly===true||catalog?.nutrition!==undefined||catalog?.tags?.some(t=>t==='food'||t==='water');
 }).map(([id])=>id);
}
export function applyBodyVital(d,engine,actor,need,delta,bound,{consumed}={}){
 if(delta>0&&['satiety','hydration'].includes(need)){
  for(const id of nourishingUnits(d,engine,d.get('state','minute'),consumed)){
   const facts=physicalItem(d,engine,id);
   if(facts.contaminated===true||facts.toxic===true||facts.condition===0)reject('E-BODY-FOOD','Unsafe consumed food cannot supply this nourishment');
  }
 }
 if(!['stamina','satiety','hydration','fatigue'].includes(need)||!Number.isFinite(delta)||Math.abs(delta)>(bound.body?.[need]??0))reject('E-BODY-BOUND','Body change exceeds its native bound');
 const state=readBodyState(engine,d.document,actor,need),old=state.value,value=writeBodyNeed(d,engine,actor,need,fixedNumber(checkedFixed(fixedUnits(old)+fixedUnits(delta))),{remainder:state.remainder});
 return {target:actor,need,delta:fixedNumber(fixedUnits(value)-fixedUnits(old)),value,asOf:d.get('state','minute')};
}
