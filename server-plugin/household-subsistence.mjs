// Daily self-provisioning: bounded journeys, shared work time, finite stocks.
import {personHousehold,personAge,personConstraint,personRoutine,personEmployment,placeSettlement} from './entity-view.mjs';
import {registerSubsistenceDuties,householdWorkTime,npcSchedule,lifeRoutine} from './npc-state.mjs';
import {isEffective,isPhysicallyDead} from './lifecycle-state.mjs';
import {bodyRule} from './primitives-body.mjs';
import {recordsWhere,recordsMemo,canonicalEqual,stateMemo} from './storage.mjs';
import {compileRX,evaluateRX} from './rx.mjs';
import {householdMealPlan} from './household-budget.mjs';
import {warClosedRoutes} from './hazard-calendar.mjs';
import {facilityRouteStates} from './facility-state.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {reserve,moveStock,registerLegacyStock,accrueStock} from './stock.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';

const DAY=1440,config=e=>e.rules.householdSubsistence;
const workerPreference=compileRX('roll("subsistence-worker")');
const seedOf=e=>e.scheduleReadCache?.seed??e.physicalDocument?.randomSeed??e.airDraft?.peek?.('randomSeed')??'default-campaign';
// Ecology supplies physical source readers/withdrawal; this shared household
// allocation model does not import a gameplay pack into the ontology layer.
let ecology={waterBasins:()=>[],locationHabitatTypes:()=>[]};
export function registerSubsistenceResources(resources){ecology={...ecology,...resources};}
declareLedgerWriter('household-subsistence',{sources:{'src:genesis':{'*':Infinity},'src:regrowth':{'*':Infinity}},sinks:['sink:consume']});
const stockKey=id=>`forage:${id}`,account=(e,id)=>reserve(e,id,config(e).foodItem);
registerLegacyStock('household-subsistence',(e,state,add)=>{
 if(!config(e))return;
 for(const row of Object.values(state.records??{}))if(row.category==='household_forage')add(account(e,row.location),row.reserve);
});
const geography=new WeakMap();
function sources(e,state){
 let hit=geography.get(e);
 const locations=e.world.locations,routes=e.world.routes,water=ecology.waterBasins(e,state);
 if(hit?.locations===locations&&hit.routes===routes&&hit.water===water)return hit;
 const r=config(e),forests=new Set(ecology.forestSites?.(e).map(s=>s.location)??[]);
 // Animal ranges are only one projection of the geography. Public natural
 // terrain can yield plants even when no registered animal species lives there.
 const habitats=new Map((e.rules.wildlife?.habitats??[]).map(h=>[h.location,h]));
 for(const place of locations)if(!habitats.has(place.id)&&!place.rooms?.length&&!place.workstations?.length&&!place.lodging&&!place.monsterSociety&&place.scope!==place.id&&ecology.locationHabitatTypes(place).length)habitats.set(place.id,{location:place.id});
 const food=[...habitats.values()].flatMap(h=>{
  const place=e.byId.get(h.location),types=[...ecology.locationHabitatTypes(place),...h.types??[]];
  if(forests.has(h.location))types.push('forest');
  if(!types.length)for(const species of e.world.monsters.filter(s=>s.wildlife?.habitat===h.id))types.push(...ecology.speciesHabitatTypes(e.world,species,e.rules.wildlife.habitats));
  // An owned plot or a gated site is never a free household commons.
  if(!place||place.owner||place.site?.owner||place.access?.requiresConsent)return [];
  // This stock belongs to the outdoor habitat fringe, not to the authored
  // site interior behind its mechanisms. Existing site stocks/gates are untouched.
  const fertility=Math.max(0,...types.map(type=>r.forageTypes[type]??0));if(!fertility)return [];
  // Population rarity/defaultScale is not an area measurement. In the absence
  // of authored area use the ecology table's reference square kilometres.
  const area=place.areaKm2??e.rules.habitatDerivation?.referenceAreaKm2;
  return [{location:place.id,capacity:Math.floor(area*r.portionsPerKm2*fertility),minutesPerPortion:Math.ceil(r.forageMinutes/fertility)}];
 }).filter(s=>s.capacity>0);
 hit={locations,routes,water,waterById:new Map(water.map(row=>[row.id,row])),food,distances:new Map(),walking:new Map()};geography.set(e,hit);return hit;
}
// The engine route resolver owns weather, closed roads, local rooms and tolls.
// Only the bounded candidate ordering is retained across reads; live route
// validation is repeated at the day's first use, not for every person/tick.
const journeyMemo=Symbol('household source journey'),waterSignatureMemo=Symbol('household usable water');
const sourceCandidates=new WeakMap(),routePairMemo=Symbol('household route pair');
// Walking routes only read physical air fields when route wind is active;
// that case bypasses this memo below. Water intake cannot change a road.
const routePairInputs=[['effects'],['created'],{path:['records'],categories:['war_disruption','facility_region']}];
// Facility route factors as one value string, per facilityRouteStates result.
const facilitySignatures=new WeakMap();
function facilitySignature(index,facilities){
 let sig=facilitySignatures.get(facilities);
 if(sig===undefined){sig=index.routes.map(edge=>facilities.has(edge.id)?`built:${facilities.get(edge.id).factor}`:'none').join(',');facilitySignatures.set(facilities,sig);}
 return sig;
}
const waterSignatureInputs=[['created'],['remote'],['settlements'],{path:['records'],categories:['water_cycle','physical_feature']}];
function waterSignature(e,state,day,memoState=state){
 return stateMemo(memoState,e,[waterSignatureMemo,day],()=>JSON.stringify(sources(e,state).water.map(source=>[source.id,Boolean(usableWater(e,state,source,day))])),waterSignatureInputs);
}
const waterJourneyInputs=[['buildings'],['created'],['settlements'],['effects'],['remote'],{path:['records'],categories:['facility_region','war_disruption']}];
function journey(e,state,home,kind,minute,portions=0,avoid=null,memoState=state,context=null){
 if(context){
  const key=`${home}|${kind}`;
  if(kind==='water'&&context.waterJourneys.has(home))return context.waterJourneys.get(home);
  if(!context.geography.has(key))context.geography.set(key,sourceGeography(e,state,home,kind,minute,context));
  const result=readJourney(e,state,home,kind,minute,portions,avoid,memoState,context.geography.get(key),context);
  if(kind==='water')context.waterJourneys.set(home,result);return result;
 }
 if(Object.values(state.effects??{}).some(effect=>effect.kind==='air'&&effect.operation==='area_wind'&&effect.route))return readJourney(e,state,home,kind,minute,portions,avoid);
 const day=Math.floor(minute/DAY),waterKey=kind==='water'?waterSignature(e,state,day,memoState):null;
 const geography=kind==='food'?sourceGeography(e,state,home,kind,minute):null;
 const stockKey=geography?candidateStockKey(state,geography.candidates):null;
 return stateMemo(memoState,e,[journeyMemo,home,kind,day,portions,avoid,seedOf(e),waterKey,stockKey],()=>readJourney(e,state,home,kind,minute,portions,avoid,memoState,geography),waterJourneyInputs);
}
function candidateStockKey(state,candidates){
 return JSON.stringify(candidates.map(source=>{const row=state.records?.[stockKey(source.location)];return [source.location,row?.reserve??source.capacity,row?.updatedDay??null,row?.accruals?.regrowth??null];}));
}
function sourceSkeleton(e,state,home,seed,context){
 if(!context)return ecology.remoteSkeleton?.(e,state,home,seed);
 if(!context.skeletons.has(home))context.skeletons.set(home,ecology.remoteSkeleton?.(e,state,home,seed));
 return context.skeletons.get(home);
}
function sourceGeography(e,state,home,kind,minute,context=null){
 // Distances and candidates below already have pure value-keyed indexes.
 // Do not memoize the index container itself: switching physical snapshots
 // can reconstruct that mutable cache without changing any geographic fact.
 const index=context?.index??sources(e,state),seed=context?.seed??seedOf(e);
 const r=config(e),skeleton=sourceSkeleton(e,state,home,seed,context);
 // Skeleton children have no physical ledger before a visit. Use sources
 // already represented in this county; an unopened child is unknown stock.
 const season=context?.calendar.season??e.calendar(minute).season;
 const closed=context?.closed??warClosedRoutes(state,minute),facilities=context?.facilities??facilityRouteStates(e,state);
 // Walking distance is a pure function of static geography and these values:
 // home, season, closed routes and each route's facility factor. Keyed by the
 // values themselves (not state identity), daily building decay elsewhere does
 // not force a fresh shortest-path search for every household.
 const signature=context?.geographySignature??`${season}|${[...closed].sort().join(',')}|${facilitySignature(index,facilities)}`;
 const distanceKey=`${home}|${signature}`;
 if(!index.distances.has(distanceKey)&&index.distances.size>=4096){index.distances.clear();index.walking.clear();}
 if(!index.distances.has(distanceKey))index.distances.set(distanceKey,(()=>{
  const distances=new Map([[home,0]]),pending=new Set([home]);
  let edges=index.walking.get(signature);
  if(!edges){
   edges=new Map();
   for(const edge of index.routes)if(edge.modes?.includes('walk')&&!edge.closedSeasons?.includes(season)&&!(edge.toll>0)&&!closed.has(edge.id)&&(facilities.get(edge.id)?.factor??1)>0)for(const from of [edge.from,edge.to]){const rows=edges.get(from)??[];rows.push(edge);edges.set(from,rows);}
   index.walking.set(signature,edges);
  }
  while(pending.size){let from;for(const id of pending)if(from===undefined||distances.get(id)<distances.get(from))from=id;pending.delete(from);
   for(const edge of edges.get(from)??[]){const to=edge.from===from?edge.to:edge.from,value=distances.get(from)+(edge.lengthKm??0)/(facilities.get(edge.id)?.factor??1);if(value<(distances.get(to)??Infinity)){distances.set(to,value);pending.add(to);}}
  }return distances;
 })());
 const distances=index.distances.get(distanceKey);
 // The candidate locations and walking distances depend only on geography.
 // Finite stock is read below, after this pure projection, on every re-choice.
 let candidates=sourceCandidates.get(distances);if(!candidates)sourceCandidates.set(distances,candidates=new Map());
 const candidateKey=`${kind}|${skeleton?.county??''}|${r.maximumJourneyMinutes??e.rules.travel.dailyTravelMinutes}|${e.rules.travel.walkKmh}`;
 if(!candidates.has(candidateKey)){
  const represented=skeleton?new Set([skeleton.seat,...skeleton.locations.filter(l=>e.byId.has(l.id)).map(l=>l.id)]):null;
  const list=(kind==='water'?index.water:index.food).filter(s=>!represented||represented.has(s.location));
  candidates.set(candidateKey,list.filter(s=>distances.has(s.location)&&2*distances.get(s.location)*60/e.rules.travel.walkKmh<=(r.maximumJourneyMinutes??e.rules.travel.dailyTravelMinutes)).map(s=>({...s,distance:distances.get(s.location)})).sort((a,b)=>a.distance-b.distance||a.location.localeCompare(b.location)));
 }
 return {index,distanceKey,candidates:candidates.get(candidateKey)};
}
function sourceAccessible(e,state,source){
 const place=e.byId.get(source.location),property=state.buildings?.[source.location];
 return !place?.access?.requiresConsent&&(source.feature?.access==='public'||!(place?.owner||place?.site?.owner||property?.owner||Object.values(property?.owners??{}).some(share=>share>0)));
}
function readJourney(e,state,home,kind,minute,portions,avoid,memoState=state,geography=null,context=null){
 const day=Math.floor(minute/DAY),seed=seedOf(e),r=config(e);
 const {index,distanceKey,candidates}=geography??sourceGeography(e,state,home,kind,minute);
 const points=candidates.map(s=>{
  if(kind==='food'&&context&&!context.stocks.has(s.location))context.stocks.set(s.location,forageStock(e,state,s,day));
  const distance=s.distance,remaining=kind==='food'?(context?.stocks.get(s.location)??forageStock(e,state,s,day)).reserve:0,quantity=Math.min(portions,remaining);
  const effort=2*distance*60/e.rules.travel.walkKmh+quantity*(s.minutesPerPortion??0);
  // Per-portion efficiency includes the real shared journey. Comparing only
  // harvest time sends a hungry lone worker across the county for one extra
  // unit of reserve, leaving no time to collect an otherwise affordable meal.
  return {...s,distance,remaining,effort,foodScore:remaining*quantity/Math.max(1,effort)};
 })
  // A source outside even the still-weather workday is not reachable for
  // this chore. Reject it before resolving real weather/room/toll routes.
  .filter(s=>kind!=='food'||s.remaining>0)
  .sort((a,b)=>kind==='food'?(b.foodScore-a.foodScore)||a.effort-b.effort||a.location.localeCompare(b.location):a.effort-b.effort||a.location.localeCompare(b.location));
 let best=null;
 for(const source of points){
  if(!sourceAccessible(e,state,source))continue;
  if(kind==='water'&&!(context?context.water.get(source.id):usableWater(e,state,source,day)))continue;
  try{
   // Match route()'s integer-minute legs. Fractional boundaries can round
   // back to the query minute when added to an absolute calendar minute.
   const nearOutbound=Math.ceil(source.distance*60/e.rules.travel.walkKmh),nearMinutes=2*nearOutbound;
   if(kind==='water'&&nearMinutes<=(r.nearWaterRoundTripMinutes??0)){
    best={...source,home,near:true,travelMinutes:nearMinutes,outboundMinutes:nearOutbound,outboundEdges:[],inboundEdges:[]};break;
   }
   const pair=()=>{
    const outbound=home===source.location?{minutes:0,cost:0,edges:[]}:e.route(home,source.location,'walk',day*DAY+480,seed);
    return {outbound,inbound:home===source.location?outbound:e.route(source.location,home,'walk',day*DAY+480+outbound.minutes,seed)};
   };
   const wind=!context&&Object.values(state.effects??{}).some(effect=>effect.kind==='air'&&effect.operation==='area_wind'&&effect.route);
   const pairKey=`${distanceKey}|${source.location}`;
   if(context&&!context.pairs.has(pairKey))context.pairs.set(pairKey,pair());
   const {outbound,inbound}=context?context.pairs.get(pairKey):wind?pair():stateMemo(memoState,e,[routePairMemo,index,distanceKey,source.location,day,seed],pair,routePairInputs);
   if(outbound.cost||inbound.cost||outbound.minutes+inbound.minutes>(r.maximumJourneyMinutes??e.rules.travel.dailyTravelMinutes))continue;
   const minutes=outbound.minutes+inbound.minutes;
   best={...source,home,travelMinutes:minutes,outboundMinutes:outbound.minutes,outboundEdges:outbound.edges??[],inboundEdges:inbound.edges??[]};break;
  }catch(error){if(error.code!=='E-ACTION-PRECONDITION')throw error;}
 }
 return best;
}
function usableWater(e,state,source,day){
 const w=ecology.basinState(e,state,source),rules=e.rules.forestWater?.water,r=config(e);
 const cohort=state.records?.[`water-cycle:${source.id}`]?.drinking;
 const available=w.waterMl>0||Object.values(cohort??{}).some(row=>row.day===day&&row.takenMl>0);
 return rules&&available&&(w.frozenUntil??0)<=(day+1)*DAY&&(w.pathogenRisk??0)<rules.diseaseThreshold&&(w.toxinUg??0)/Math.max(1,w.waterMl)<rules.toxinScale&&(w.saltMg??0)/Math.max(1,w.waterMl)<r.maximumSaltMgPerMl;
}
function forageStock(e,state,source,day){
 const existing=state.records?.[stockKey(source.location)];
 // Most choices happen after today's regrowth has already been settled by
 // another household. Reading its live reserve needs no cloned accrual row.
 if(existing?.updatedDay===day)return {reserve:existing.reserve};
 const old=state.records?.[stockKey(source.location)],row=structuredClone(old??{category:'household_forage',location:source.location,reserve:source.capacity,initial:source.capacity,grown:0,harvested:0,updatedDay:day});
 let grown=0;
 for(let at=row.updatedDay;at<day;at++){
  const recovery=e.rules.wildlife.seasonRecovery[e.calendar(at*DAY).season]??1;
  const increment=Math.min(source.capacity-row.reserve,accrueStock(row,'regrowth',source.capacity*config(e).dailyRegrowthPercent*recovery,1,100));
  row.reserve+=increment;grown+=increment;
 }
 row.updatedDay=day;row.grown+=grown;return {row,reserve:row.reserve,grown};
}
function mealDeficit(e,state,owner,settlement,members){
 const s=state.settlements?.[settlement],h=personHousehold(e,state,owner).value;
 const resident=Boolean(h||state.npcs?.[owner]?.materialized?.settlement);
 const publicShare=resident&&s&&s.granary!==false?Math.min(1,Math.max(0,s.food??0)/Math.max(1,s.population??0)):0;
 // A guaranteed complete public ration already covers native daily satiety.
 // No private unit, seed or promise can increase a zero food deficit. Keep
 // the full meal allocator for partial shares and installed drain modifiers.
 if(publicShare===1&&!e.world.derived?.modifiers?.length){
  const needs=Object.fromEntries(['satiety','hydration'].map(need=>[need,members.length*bodyRule(e,need).drainPerHour.light*24]));
  return {needs,shortfall:{satiety:0,hydration:needs.hydration}};
 }
 // A read-only meal projection keeps only copied quantities/selection rows.
 // Exposing Draft.document here would freeze the entire ledger on every
 // routine read and force a new full account map at its next write.
 const reader=e.scheduleReadCache?.draft??e.airDraft;
 const document={...(reader?.peek?.()??e.physicalDocument),state,randomSeed:seedOf(e)};
 const d={document,get:(...path)=>path.reduce((v,k)=>v?.[k],document)};
 return householdMealPlan(d,e,owner,{publicShare});
}
export function householdSubsistencePlan(e,state,owner,minute=state.minute,memoState=state,mealOverride=null,context=null){
 if(!config(e))return null;
 const h=personHousehold(e,state,owner).value,person=e.byId.get(owner),home=h?.homeLocation??person?.home?.location??person?.location??state.npcs?.[owner]?.location;
 const members=(h?.members??[owner]).filter(id=>id!=='player'&&!isPhysicallyDead(e,state,id)&&!state.npcs?.[id]?.levy&&!state.npcs?.[id]?.materialized?.folded);
 const day=Math.floor(minute/DAY),r=config(e),settlement=h?.settlement??placeSettlement(e,state,home).value;
 const meal=mealOverride??mealDeficit(e,state,owner,settlement,members),portions=Math.ceil(meal.shortfall.satiety/(e.byId.get(r.foodItem)?.nutrition?.satiety??1));
 const water=meal.needs.hydration>0?journey(e,state,home,'water',minute,0,null,memoState,context):null;
 if(!portions&&!water)return {worker:null,home,members,water:null,food:null,foodTrips:[],duties:[],chores:[]};
 const preference=id=>evaluateRX(workerPreference,{}, {rollKey:{seed:seedOf(e),pack:'household',rule:'subsistence-worker',object:`${h?.id??owner}:${id}`,date:0}});
 const opportunity=id=>{
  const routine=personRoutine(e,state,id)??state.npcs[id]?.routine??e.byId.get(id)?.schedule,calendar=context?.calendar??e.calendar(day*DAY+480);
  const variant=calendar.market?'market':routine?.restDays?.includes(calendar.day)?'rest':'default',season=routine?.seasonal?.[String(calendar.season)];
  const slots=season?.[variant]??routine?.[variant]??season?.default??routine?.default??[];
  // Work now follows the person's real shift, including nocturnal service.
  // Counting only08:00–17:00 would assign a night trader ahead of an idle
  // adult in the same household and close an otherwise staffed market.
  const service=slots.filter(s=>s.services?.length).reduce((n,s)=>n+Math.max(0,s.end-s.start),0);
  const job=personEmployment(e,state,id,day*DAY+480)?.value;
  return service+(job&&['有效','要求加薪'].includes(job.status)?job.workMinutes??480:0);
 };
 // Only severe household illness can make this particular work-time flag
 // true. Avoid building farm/market work budgets for healthy households.
 const carePatients=new Set(context?members.filter(id=>context.carePatients.has(id)):Object.values(state.family?.illnesses??{}).filter(row=>row.status==='患病中'&&row.severity==='重'&&members.includes(row.patient)&&row.since<=day*DAY+480&&day*DAY+480<row.endsAt).map(row=>row.patient));
 const eligibleRows=members.filter(id=>{
  const n=state.npcs[id];return (n?isEffective(e,state,id):Boolean(e.byId.get(id)))&&(personAge(e,state,id).value??0)>=(r.minimumAge??e.rules.npcLife.adultAge)&&!n?.caring&&!state.player?.companions?.includes(id)&&!['患病','濒死','昏迷'].includes(n?.status)&&!personConstraint(e,state,id,day*DAY+480)&&(![...carePatients].some(patient=>patient!==id)||!householdWorkTime(e,state,id,day*DAY+480,{workMinutes:0,subsistence:false}).unattended);
 }).map(id=>({id,cost:opportunity(id),preference:preference(id)})).sort((a,b)=>a.cost-b.cost||a.preference-b.preference||a.id.localeCompare(b.id));
 const eligible=eligibleRows.map(row=>row.id),costs=new Map(eligibleRows.map(row=>[row.id,row.cost]));
 if(!eligible.length||!home)return null;
 const skeleton=sourceSkeleton(e,state,home,context?.seed??seedOf(e),context);
 const worker=eligible[0];
 const publicStore=state.settlements?.[settlement],resident=Boolean(h||state.npcs?.[owner]?.materialized?.settlement);
 const publicSource=resident&&publicStore&&publicStore.granary!==false&&((publicStore.food??0)>0||(publicStore.foodPerDay??0)>0||e.rules.agriculture?.settlements.some(s=>s.settlement===settlement));
 // Unvisited registered societies have no opened public ledger. Absence of
 // a ledger is not an imaginary public meal; visitors likewise have no share.
 const food=portions?journey(e,state,home,'food',minute,portions,null,memoState,context):null;
 const waterMinutes=water?water.travelMinutes+r.waterMinutes:0;
 const foodMinutes=food?food.travelMinutes+portions*food.minutesPerPortion:0;
 // Signed appointments and real market journeys outrank daily work. Split
 // work across the same two windows as agriculture/employment; no overtime.
 const lunchBlocked=new Set(),workerSlots=new Map(),workerWindows=new Map(eligible.map(worker=>{
 const blocked=[];
  for(const o of context?(context.reservations.get(worker)??[]):Object.values(state.obligations??{}))if(o.reservationVersion===1&&!['已取消','取消','void','cancelled'].includes(o.status)&&[o.promisor,o.promisee].includes(worker))blocked.push({start:(o.departures?.[worker]??o.start)-day*DAY,end:(o.fulfilledAt??o.deadline)-day*DAY});
 for(const trip of [state.npcs[worker]?.scheduleTravel,state.npcs[worker]?.cognitionTravel])if(trip&&!trip.subsistence)blocked.push({start:trip.depart-day*DAY,end:trip.arrive-day*DAY});
  for(const trip of context?(context.marketTrips.get(worker)??[]):recordsWhere(state.records,'category','market_trip'))if(trip.actor===worker)blocked.push({start:trip.departAt-day*DAY,end:trip.returnAt-day*DAY});
 if(blocked.some(b=>b.start<780&&b.end>720))lunchBlocked.add(worker);
  const routine=npcSchedule(e,state,worker,day*DAY+480,null,false)??lifeRoutine(home,{occupation:e.byId.get(worker)?.occupation}),calendar=context?.calendar??e.calendar(day*DAY+480),variant=calendar.market?'market':routine?.restDays?.includes(calendar.day)?'rest':'default',season=routine?.seasonal?.[String(calendar.season)];
 const slots=season?.[variant]??routine?.[variant]??season?.default??routine?.default??[];
 const physical=[];
 // A day off cancels paid work, not the household's need for food. The
 // authored all-day rest slot can contain household work; an explicit sleep
 // or meal slot still cannot. Keep its existing edges rather than inventing
 // a morning departure inside it.
 for(const slot of slots.filter(s=>!/睡|吃饭|用餐|早饭|午饭|晚饭/.test(s.activity??'')&&(variant==='rest'||!/歇息|休息/.test(s.activity??'')))){
  let at=slot.start;
  for(const b of blocked.filter(b=>b.start<slot.end&&b.end>slot.start).sort((a,b)=>a.start-b.start)){
   if(b.start>at)physical.push({start:at,end:Math.min(slot.end,b.start),boundaryEnd:Math.min(slot.end,b.start)});
   at=Math.max(at,b.end);
  }
  if(at<slot.end)physical.push({start:at,end:slot.end,boundaryEnd:slot.end});
 }
 const physicalRuns=[];
 for(const span of physical){
  const prior=physicalRuns.at(-1)?.at(-1);
  if(prior&&!blocked.some(b=>b.start<span.start&&b.end>prior.end))physicalRuns.at(-1).push(span);
  else physicalRuns.push([span]);
 }
 workerSlots.set(worker,physicalRuns);
 const free=[];for(const [lo,hi]of [[480,720],[780,1020]]){
  let at=lo;for(const b of blocked.filter(b=>b.start<hi&&b.end>lo).sort((a,b)=>a.start-b.start)){if(b.start>at)free.push({start:at,end:Math.min(hi,b.start)});at=Math.max(at,b.end);}if(at<hi)free.push({start:at,end:hi});
 }return [worker,free];}));
 const duties=[],chores=[];
 const runs=(worker,free)=>{
  const out=[];for(const window of free.filter(w=>w.end>w.start)){
   const last=out.at(-1),previous=last?.at(-1);
   if(previous?.end===720&&window.start===780&&!lunchBlocked.has(worker))last.push(window);else out.push([window]);
  }return out;
 };
 const workCapacity=(worker,free)=>Math.min(
  Math.max(0,...runs(worker,free).map(run=>run.reduce((n,w)=>n+w.end-w.start,0))),
  Math.max(0,...workerSlots.get(worker).map(run=>run.reduce((n,w)=>n+w.end-w.start,0)))
 );
 const allocate=(kind,source,minutes)=>{
  if(!source)return null;
  let chosen;
  // Equal-opportunity members share the accumulated chores. Packing every
  // errand onto the first tie winner can erase all of a public service window.
  const available=free=>free.reduce((n,w)=>n+w.end-w.start,0);
  const candidates=[...workerWindows].sort(([a,x],[b,y])=>costs.get(a)-costs.get(b)||available(y)-available(x));
  // Keep the cheapest feasible adult's long food run intact when the small
  // water errand would force that whole basket onto a serving adult. Water
  // still falls back to that adult if nobody else can actually fetch it.
  if(kind==='water'&&food){
   const preferred=candidates.find(([id,free])=>workCapacity(id,free)>=foodMinutes);
   if(preferred&&workCapacity(...preferred)<foodMinutes+minutes)candidates.sort(([a],[b])=>Number(a===preferred[0])-Number(b===preferred[0]));
  }
  for(const [worker,free]of candidates){
   const physical=workerSlots.get(worker).find(spans=>spans.reduce((n,s)=>n+s.end-s.start,0)>=minutes);
   if(!(kind==='water'&&source.near)&&!physical)continue;
   const run=runs(worker,free).find(run=>run.reduce((n,w)=>n+w.end-w.start,0)>=minutes);if(run){chosen={worker,run,physical};break;}
  }
  if(!chosen)return null;
  const {worker,run,physical}=chosen,windows=[];let left=minutes;
  for(const w of kind==='water'&&source.near?[...run].reverse():run){const used=Math.min(left,w.end-w.start);if(used){
   if(kind==='water'&&source.near){windows.push({start:w.end-used,end:w.end});w.end-=used;}
   else {windows.push({start:w.start,end:w.start+used});w.start+=used;}
   left-=used;
  }}
  windows.sort((a,b)=>a.start-b.start);
  let start=windows[0].start,end=windows.at(-1).end;const base={worker,services:[]};
  if(kind==='water'&&source.near){
   chores.push(...windows.map(w=>({...base,...w,location:home,activity:'家户取水'})));
   return {...source,worker,minutes,windows};
  }
  // The480-minute household budget is a labour allowance, not everybody's
  // authored shift. A06:00–18:00 worker departs at06:00, while spending the
  // same real140 minutes of that allowance as an08:00–12:00 worker.
  const actual=[];let remaining=minutes;
  for(const slot of physical){const used=Math.min(remaining,slot.end-slot.start);if(used){actual.push({start:slot.start,end:slot.start+used,boundaryEnd:slot.boundaryEnd});slot.start+=used;}remaining-=used;}
  chores.push(...windows.map(w=>({...base,...w,location:home,activity:kind==='water'?'家户取水':'家户觅食',subsistence:true})));
  start=actual[0].start;end=actual.at(-1).end;
  const clock=(offset,startOfPhase=false)=>{
   for(let i=0;i<actual.length;i++){const w=actual[i],length=w.end-w.start;if(offset<length||offset===length&&(!startOfPhase||i===actual.length-1))return w.start+offset;offset-=length;}
   return end;
  };
  const arrive=clock(source.outboundMinutes),finish=clock(minutes-(source.travelMinutes-source.outboundMinutes),true);
  const boundaryEnd=actual.at(-1).boundaryEnd;
  Object.assign(base,{boundaryEnd,subsistence:true});
  const travel=(from,to,depart,arrive,edges)=>({from,to,depart:day*DAY+depart,arrive:day*DAY+arrive,edges,subsistence:true,subsistenceUntil:day*DAY+boundaryEnd});
  if(arrive>start)duties.push({...base,start,end:arrive,location:null,activity:'生计出行',travel:travel(home,source.location,start,arrive,source.outboundEdges)});
  for(const w of actual){const lo=Math.max(arrive,w.start),hi=Math.min(finish,w.end);if(hi>lo)duties.push({...base,start:lo,end:hi,location:source.location,activity:kind==='water'?'家户取水':'家户觅食'});}
  for(let i=1;i<actual.length;i++)if(actual[i-1].end<actual[i].start&&arrive<=actual[i-1].end&&finish>=actual[i].start)duties.push({...base,start:actual[i-1].end,end:actual[i].start,location:source.location,activity:'野外歇息'});
  if(end>finish)duties.push({...base,start:finish,end,location:null,activity:'生计返程',travel:travel(source.location,home,finish,end,source.inboundEdges)});
  return {...source,worker,minutes,windows};
 };
 const waterWork=allocate('water',water,waterMinutes),foodTrips=[];
 let remaining=portions;
 if(food){
  const full=allocate('food',food,foodMinutes);
  if(full){foodTrips.push(full);remaining=0;}
  // A large household may send two adults or make two separate journeys;
  // never discard all food merely because its whole basket exceeds one slot.
  while(remaining){
   const capacity=Math.max(0,...[...workerWindows].map(([worker,free])=>workCapacity(worker,free)));
   const quantity=Math.min(remaining,Math.max(0,Math.floor((capacity-food.travelMinutes)/food.minutesPerPortion)));
   if(!quantity)break;
   const trip=allocate('food',food,food.travelMinutes+quantity*food.minutesPerPortion);
   if(!trip)break;
   foodTrips.push(trip);remaining-=quantity;
  }
 }
 return {worker,home,members,...(skeleton&&!water&&!food?{sourceStatus:'unknown',sourceCounty:skeleton.county}:{}),publicSource:Boolean(publicSource),water:waterWork,food:foodTrips[0]??null,foodTrips,duties,chores};
}
// Morning decisions are campaign facts, not a process-local decision cache.
const planKey=settlement=>`subsistence-plan:${settlement??'unregistered'}`;
const mealMember=(e,state,id)=>id!=='player'&&!isPhysicallyDead(e,state,id)&&!state.npcs?.[id]?.levy&&!state.npcs?.[id]?.materialized?.folded;
export function householdSubsistenceGroups(e,state){
 const groups=new Map();
 for(const id of [...new Set([...Object.keys(state.npcs??{}),...(e.world.households??[]).flatMap(h=>h.members),...Object.values(state.family?.households??{}).flatMap(h=>h.members??[])])].sort()){
  if(!mealMember(e,state,id))continue;
  const h=personHousehold(e,state,id).value,key=h?.id??id,remote=state.npcs?.[id]?.materialized?.settlement;
  if(!groups.has(key))groups.set(key,{owner:id,key,registered:Boolean(h||remote),mouths:h?.members.filter(member=>mealMember(e,state,member)).length??(remote?1:0),settlement:h?.settlement??remote??placeSettlement(e,state,state.npcs?.[id]?.location).value});
 }
 return [...groups.values()].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
}
// Called at the day boundary after yesterday's meals/life, and once when a
// legacy save first advances. One compact replacement per settlement/day.
export function prepareHouseholdSubsistence(d,e,day=Math.floor(d.get('state','minute')/DAY)){
 if(!config(e)||d.get('state','family','subsistence')?.[0]===day)return;
 const state=d.get('state'),morning={...state,minute:day*DAY+480,records:{...state.records}},rows=new Map(),people={};
 // One immutable morning water/geography projection and one explicit finite
 // food ledger serve all settlements. Reservations below update that ledger;
 // no process-local decision survives this call or a save/reload boundary.
 const index=sources(e,morning),calendar=e.calendar(morning.minute),closed=warClosedRoutes(morning,morning.minute),facilities=facilityRouteStates(e,morning);
 const reservations=new Map(),marketTrips=new Map();
 for(const o of Object.values(morning.obligations??{}))if(o.reservationVersion===1&&!['已取消','取消','void','cancelled'].includes(o.status))for(const id of new Set([o.promisor,o.promisee])){
  const rows=reservations.get(id)??[];rows.push(o);reservations.set(id,rows);
 }
 for(const trip of recordsWhere(morning.records,'category','market_trip')){const rows=marketTrips.get(trip.actor)??[];rows.push(trip);marketTrips.set(trip.actor,rows);}
 const context={index,calendar,closed,facilities,seed:seedOf(e),skeletons:new Map(),reservations,marketTrips,
  geographySignature:`${calendar.season}|${[...closed].sort().join(',')}|${facilitySignature(index,facilities)}`,
  carePatients:new Set(Object.values(morning.family?.illnesses??{}).filter(row=>row.status==='患病中'&&row.severity==='重'&&row.since<=morning.minute&&morning.minute<row.endsAt).map(row=>row.patient)),
  water:new Map(index.water.map(source=>[source.id,usableWater(e,morning,source,day)])),stocks:new Map(),geography:new Map(),waterJourneys:new Map(),pairs:new Map()};
 for(const g of householdSubsistenceGroups(e,morning)){
  const sid=g.settlement??'unregistered';let row=rows.get(sid);
  if(!row){row={category:'subsistence_plan',day,households:{},workers:{}};rows.set(sid,row);}
  for(const id of personHousehold(e,morning,g.owner).value?.members??[g.owner])people[id]=[sid,g.key];
  const p=householdSubsistencePlan(e,morning,g.owner,morning.minute,morning,null,context);
  if(!p){row.households[g.key]=null;continue;}
  const compact=source=>source&&Object.fromEntries(['id','location','home','near','capacity','minutesPerPortion','worker','minutes','travelMinutes','outboundEdges','inboundEdges'].filter(key=>source[key]!==undefined).map(key=>[key,source[key]]));
  row.households[g.key]={water:compact(p.water),foodTrips:p.foodTrips.map(compact),...(p.sourceStatus?{sourceStatus:p.sourceStatus,sourceCounty:p.sourceCounty}:{})};
  // Reserve tomorrow's assigned baskets only in this planning snapshot.
  // Actual finite stock and its ledger are touched by execution, never here.
  for(const source of p.foodTrips){
   const stock=forageStock(e,morning,source,day),quantity=Math.floor((source.minutes-source.travelMinutes)/source.minutesPerPortion);
   morning.records[stockKey(source.location)]={...(stock.row??morning.records[stockKey(source.location)]),reserve:Math.max(0,stock.reserve-quantity),updatedDay:day};
   context.stocks.set(source.location,{reserve:morning.records[stockKey(source.location)].reserve});
  }
  for(const [kind,duties] of [['duties',p.duties],['chores',p.chores]])for(const duty of duties){
   const worker=row.workers[duty.worker]??={duties:[],chores:[]};worker[kind].push(duty);
  }
 }
 const ordered=rows=>Object.fromEntries(Object.keys(rows).sort().map(id=>[id,rows[id]]));
 for(const [sid,row]of rows)d.set(['state','records',planKey(sid)],{...row,households:ordered(row.households),workers:ordered(row.workers)});
 // diffPatches merges object children. Keep this daily directory atomic so
 // new births/members cannot acquire different insertion order in short steps.
 d.set(['state','family','subsistence'],[day,ordered(people)]);
}
registerAdvanceHook('prepareHouseholdSubsistence',prepareHouseholdSubsistence);
const scheduleActorsMemo=Symbol('household schedule actors');
registerAdvanceHook('householdSubsistenceActors',(e,state,minute)=>{
 const days=recordsMemo(state.records,scheduleActorsMemo,()=>{
  const out=new Map();
  for(const row of recordsWhere(state.records,'category','subsistence_plan')){
   const ids=out.get(row.day)??new Set();
   for(const [id,worker]of Object.entries(row.workers))if(worker.duties.length)ids.add(id);
   out.set(row.day,ids);
  }
  return out;
 },{categories:['subsistence_plan']});
 const ids=days.get(Math.floor(minute/DAY));
 return ids?Object.keys(state.npcs).filter(id=>ids.has(id)&&!state.npcs[id].materialized?.folded):[];
});
function planRecord(state,id,minute){
 const entry=state.family?.subsistence?.[1]?.[id];if(!entry)return null;
 const row=state.records?.[planKey(entry[0])];return row?.day===Math.floor(minute/DAY)?row:null;
}
function availableWorker(e,state,id,minute){
 const n=state.npcs?.[id];
 return mealMember(e,state,id)&&!n?.caring&&!state.player?.companions?.includes(id)&&!['患病','濒死','昏迷'].includes(n?.status)&&!personConstraint(e,state,id,minute);
}
function storedWork(e,state,id,minute,kind,activeOnly=false){
 const work=config(e)&&planRecord(state,id,minute)?.workers[id]?.[kind];
 // An inactive slot cannot override this instant, regardless of availability.
 // Full routine readers still receive every slot to retain future boundaries.
 if(activeOnly&&!work?.some(row=>row.start<=minute%DAY&&minute%DAY<row.end))return [];
 return work?.length&&availableWorker(e,state,id,minute)?work:[];
}
registerSubsistenceDuties((e,state,id,minute,activeOnly)=>storedWork(e,state,id,minute,'duties',activeOnly),(e,state,id,minute)=>storedWork(e,state,id,minute,'chores'));
function executableSource(e,state,source,day){
 if(!sourceAccessible(e,state,source)||!availableWorker(e,state,source.worker,(day+1)*DAY-1))return false;
 const members=personHousehold(e,state,source.worker).value?.members;
 if(members&&Object.values(state.family?.illnesses??{}).some(row=>row.status==='患病中'&&row.severity==='重'&&row.patient!==source.worker&&members.includes(row.patient)&&row.since<(day+1)*DAY&&row.endsAt>day*DAY)
  &&householdWorkTime(e,state,source.worker,(day+1)*DAY-1,{workMinutes:0,subsistence:false}).unattended)return false;
 const closed=warClosedRoutes(state,(day+1)*DAY-1);
 if(source.near&&source.home!==source.location){
  const candidate=sourceGeography(e,state,source.home,'water',(day+1)*DAY-1).candidates.find(row=>row.location===source.location);
  if(!candidate||2*Math.ceil(candidate.distance*60/e.rules.travel.walkKmh)>source.travelMinutes)return false;
 }
 const facilities=source.outboundEdges.length||source.inboundEdges.length?facilityRouteStates(e,state):null;
 return ![...source.outboundEdges,...source.inboundEdges].some(edge=>closed.has(edge)||(facilities?.get(edge)?.factor??1)===0);
}

export function supplyHousehold(d,e,owner,day,meal,{registered=false,settlement=null,waterCohorts=new Map()}={}){
 const state=d.get('state'),r=config(e),hit=r&&planRecord(state,owner,day*DAY+480),p=hit?.households[state.family.subsistence[1][owner][1]],nutrition={satiety:0,hydration:0},sources=[];
 if(!p)return {nutrition,sources};
 if(p.sourceStatus)sources.push({kind:'unknown',county:p.sourceCounty,reason:'unexpanded-stock'});
 const basin=p.water&&sourcesIndex(e,d.get('state')).waterById.get(p.water.id),water=basin?{...basin,...p.water}:null;
 if(water&&executableSource(e,d.get('state'),water,day)&&meal.needs.hydration>0&&e.rules.forestWater.water.drinkingMlPerPerson>0){
  const state=d.get('state'),w=ecology.basinState(e,state,water),rules=e.rules.forestWater.water;
  const safe=(w.frozenUntil??0)<=(day+1)*DAY&&(w.pathogenRisk??0)<rules.diseaseThreshold&&(w.toxinUg??0)/Math.max(1,w.waterMl)<rules.toxinScale&&(w.saltMg??0)/Math.max(1,w.waterMl)<r.maximumSaltMgPerMl;
  const baseHydration=bodyRule(e,'hydration').drainPerHour.light*24;
  const ordinaryMl=meal.members.length*rules.drinkingMlPerPerson;
  const need=baseHydration>0?Math.ceil(meal.needs.hydration*rules.drinkingMlPerPerson/baseHydration):0;
  let ml=0,cohort=false;
  const local=registered&&ecology.basinForLocation(e,settlement,sourcesIndex(e,state).water)?.id===water.id;
  const exposure=local&&state.records?.[`water-cycle:${water.id}`]?.drinking?.[settlement];
  if(safe&&exposure?.day===day){
   const used=waterCohorts.get(settlement)??0,den=Math.max(state.settlements[settlement]?.population??0,meal.members.length);
   ml=Math.min(need,Math.max(0,exposure.takenMl-used),Math.floor(ordinaryMl*Math.min(1,exposure.takenMl/Math.max(1,den*rules.drinkingMlPerPerson))));
   waterCohorts.set(settlement,used+ml);cohort=true;
   // Population cohorts can lag a birth or household change. They are a
   // reuse credit, never a ration ceiling while this real source still holds water.
   const extra=Math.min(Math.max(0,need-ml),Math.floor(w.waterMl/ecology.waterResourceFactor(e,state,water.location)));
   if(extra)ml+=ecology.takeHouseholdWater(d,e,water,extra,day);
  }else if(safe)ml=ecology.takeHouseholdWater(d,e,water,Math.min(need,Math.floor(w.waterMl/ecology.waterResourceFactor(e,state,water.location))),day);
  nutrition.hydration=Math.min(meal.needs.hydration,ml*baseHydration/rules.drinkingMlPerPerson);
  sources.push({kind:'water',source:water.id,location:water.location,worker:water.worker,minutes:water.minutes,travelMinutes:water.travelMinutes,millilitres:ml,cohort});
 }
 for(const source of p.foodTrips??[])if(meal.shortfall.satiety>nutrition.satiety&&executableSource(e,d.get('state'),source,day)){
  const key=stockKey(source.location),old=d.get('state','records',key),row=structuredClone(old??{category:'household_forage',location:source.location,reserve:source.capacity,initial:source.capacity,grown:0,harvested:0,updatedDay:day});
  let grown=0;
  // The active calendar may have short or leap months. Only the source's
  // unaccrued days are visited; a quarter is not assumed to be90 absolute days.
  for(let at=row.updatedDay;at<day;at++){
   const recovery=e.rules.wildlife.seasonRecovery[e.calendar(at*DAY).season]??1;
   const increment=Math.min(source.capacity-row.reserve,accrueStock(row,'regrowth',source.capacity*r.dailyRegrowthPercent*recovery,1,100));
   row.reserve+=increment;grown+=increment;
  }
  row.updatedDay=day;
  row.grown+=grown;row.updatedDay=day;
  const gain=e.byId.get(r.foodItem).nutrition.satiety,quantity=Math.min(row.reserve,Math.ceil((meal.shortfall.satiety-nutrition.satiety)/gain),Math.floor((source.minutes-source.travelMinutes)/source.minutesPerPortion));
  const eventId=`subsistence:${day}:${meal.household??owner}`,to=account(e,source.location);
  if(!old)moveStock(d,{from:`src:genesis|${r.foodItem}|forage`,to,amount:row.initial,writer:'household-subsistence',eventId});
  if(grown)moveStock(d,{from:`src:regrowth|${r.foodItem}|forage`,to,amount:grown,writer:'household-subsistence',eventId});
  if(quantity)moveStock(d,{from:to,to:`sink:consume|${r.foodItem}|meal`,amount:quantity,writer:'household-subsistence',eventId});
  row.reserve-=quantity;row.harvested+=quantity;
  if(!canonicalEqual(old,row))d.set(['state','records',key],row);
  nutrition.satiety+=quantity*gain;
  sources.push({kind:'forage',source:key,location:source.location,worker:source.worker,minutes:source.minutes,travelMinutes:source.travelMinutes,item:r.foodItem,quantity,maximumHarvest:Math.floor((source.minutes-source.travelMinutes)/source.minutesPerPortion)});
 }
 return {nutrition,sources};
}
const sourcesIndex=sources;
