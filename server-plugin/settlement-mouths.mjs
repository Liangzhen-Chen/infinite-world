// 聚落餐口与目标持有天数（原在 primitives-body.mjs，下放到只依赖 storage/holdings 的模块）。
// 原因：公开聚落资料（settlement-profile.mjs）要按同一条目标持有规律推导开局存粮，而 primitives-body 的导入闭包经 items 一路连到 retrieval，
// 再回到 settlement-profile，会形成导入环；这些函数不需要那些依赖，放在这里两边都能直接导入。primitives-body.mjs 重新导出，既有调用方不变。
import {isPhysicallyDead} from './holdings.mjs';
import {stateMemo} from './storage.mjs';
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
// Mouths for a head count after `levy` of them left (soldiers keep the settlement's make-up).
export function mealMouthsOf(engine,state,sid,population,{levy=0,need='satiety'}={}){
 const full=settlementMouths(engine,state,sid,population,need);
 return levy>0&&population>0?full*Math.max(0,population-levy)/population:full;
}
