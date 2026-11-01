// Basin water shares physical_feature state with spells and manual transfers.
import {locationHabitatTypes,speciesHabitatTypes} from './wildlife-habitats.mjs';
import {weatherAt} from './weather.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {derived} from './derived.mjs';
import {hypot} from './det-math.mjs';
import {registerSubsistenceResources} from './household-subsistence.mjs';

const DAY=1440,clone=v=>structuredClone(v),record=id=>['state','records',`water-cycle:${id}`];
const level=(l,r)=>l.elevationMeters??(/山|岭|崖|高地/.test(l.terrain??'')?r.highland:/丘|坡/.test(l.terrain??'')?r.hill:/谷|河|滩|沼/.test(l.terrain??'')?r.lowland:r.plain);
export function waterBasins(engine,state={}){
 const r=engine.rules.forestWater?.water;if(!r)return[];
 const riverEnds=new Set(engine.world.routes.filter(e=>e.modes?.includes('boat')).flatMap(e=>[e.from,e.to]));
 const rows=[];
 for(const l of engine.world.locations){
  const features=(l.features??[]).filter(f=>f.kind==='water');
  for(const f of features)rows.push({id:f.id,location:l.id,feature:f,capacity:f.state.capacityMl,elevation:level(l,r.terrainElevationMeters)});
  const farm=engine.rules.agriculture?.settlements.find(p=>p.settlement===l.id);
  if(!features.length&&(farm||riverEnds.has(l.id)||locationHabitatTypes(l).includes('wetland')&&!l.owner&&!l.access&&!l.rooms?.length)){
   rows.push({id:`basin:${l.id}`,location:l.id,capacity:r.capacityMl,elevation:level(l,r.terrainElevationMeters)});
  }
 }
 // P3 food-producing statistical settlements also use a finite basin. A child
 // with an existing ancestor source shares it instead of creating more water.
 const covered=new Set(rows.map(b=>b.location));
 const producers=Object.entries(state.settlements??{}).filter(([,s])=>s.granary!==false&&s.foodPerDay>0).map(([id])=>id)
  .sort((a,b)=>ancestor(engine,a).length-ancestor(engine,b).length||a.localeCompare(b));
 for(const id of producers){const l=engine.byId.get(id);if(!l||ancestor(engine,id).some(id=>covered.has(id)))continue;
  rows.push({id:`basin:${id}`,location:id,capacity:r.capacityMl,elevation:level(l,r.terrainElevationMeters)});covered.add(id);
 }
 return rows;
}
function ancestor(engine,location){const out=[];while(location&&!out.includes(location)){out.push(location);location=engine.byId.get(location)?.parent;}return out;}
function basinWeather(engine,seed,location,minute){
 for(const id of ancestor(engine,location)){const weather=weatherAt(engine,seed,id,minute);if(weather)return weather;}
 // Unexpanded counties have no local station yet. Use the nearest registered
 // climate in the geographic catalog until their own climate is materialized.
 const point=engine.byId.get(location)?.coordinates;if(!point)return null;
 let station=null,distance=Infinity;
 for(const region of engine.rules.weather?.regions??[])for(const id of region.locations){
  const p=engine.byId.get(id)?.coordinates;if(!p||region.indoor.includes(id))continue;
  const delta=hypot(p[0]-point[0],p[1]-point[1]);if(delta<distance){distance=delta;station=id;}
 }
 return station?weatherAt(engine,seed,station,minute):null;
}
function precipitationShare(engine,document,location,weather,day,rains){
 const natural=engine.rules.forestWater.water.rainShare[weather?.kind]??0;
 const sources=[];
 for(const effect of rains){
  const area=effect.coverage.find(r=>r.location===location),overlap=Math.max(0,Math.min((day+1)*DAY,effect.expires)-Math.max(day*DAY,effect.since))/DAY;
  if(area?.share>0&&overlap>0)sources.push({sourceEvent:effect.sourceEvent,temple:effect.temple,rite:effect.rite,until:effect.expires,share:area.share*overlap*(engine.rules.forestWater.water.rainShare.rain??0)});
 }
 const extra=sources.reduce((n,r)=>n+r.share,0),share=derived(engine,document,'weather:precipitation',location,{base:natural+extra});
 const naturalShare=extra?derived(engine,document,'weather:precipitation',location,{base:natural}):share,scale=engine.rules.forestWater.water.cropRainShare;
 const credit=Math.max(0,Math.min(1,share/scale)-Math.min(1,naturalShare/scale));
 return {share,sources:sources.map(r=>({...r,share:extra?r.share/extra*credit:0})).filter(r=>r.share>0)};
}
export function waterConnections(engine,basins=waterBasins(engine)){
 const edges=[],seen=new Set(),byLocation=new Map();
 for(const b of basins){if(!byLocation.has(b.location))byLocation.set(b.location,[]);byLocation.get(b.location).push(b);}
 // A strict potential makes every derived connection acyclic, including flat rivers.
 const compare=(a,b)=>b.elevation-a.elevation||((engine.byId.get(b.location)?.coordinates?.[1]??0)-(engine.byId.get(a.location)?.coordinates?.[1]??0))||a.id.localeCompare(b.id);
 const order=[...basins].sort(compare),rank=new Map(order.map((b,i)=>[b.id,i]));
 const add=(a,b,source)=>{if(a.id===b.id)return;const[from,to]=rank.get(a.id)<rank.get(b.id)?[a,b]:[b,a],key=`${from.id}:${to.id}`;
  if(!seen.has(key)){seen.add(key);edges.push({id:key,from:from.id,to:to.id,source});}
 };
 for(const b of basins){
  // Tributary features join the registered settlement river, never a sibling well.
  const parent=ancestor(engine,b.location).slice(1).find(id=>byLocation.has(id));
  if(parent)for(const to of byLocation.get(parent))add(b,to,'terrain');
 }
 for(const route of engine.world.routes){
  const from=byLocation.get(route.from),to=byLocation.get(route.to);if(!from||!to)continue;
  const wet=locationHabitatTypes(engine.byId.get(route.from)).includes('wetland')&&locationHabitatTypes(engine.byId.get(route.to)).includes('wetland');
  if(route.modes?.includes('boat')||wet)for(const a of from)for(const b of to)add(a,b,route.id);
 }
 return {edges,order};
}
function waterShares(engine,document,basin,water,edges){
 const declared=water.outflow??engine.byId.get(basin.location)?.outflow;
 if(declared!==undefined){
  if(!Array.isArray(declared)||declared.length!==edges.length||new Set(declared.map(r=>r.edge)).size!==edges.length||
   declared.some(r=>!edges.some(e=>e.id===r.edge)||!Number.isFinite(r.share)||r.share<0||r.share>1)||
   Math.abs(declared.reduce((n,r)=>n+r.share,0)-1)>1e-9)throw Error('河段分水须覆盖实际出边且份额合计为一');
 }
 const shares=edges.map(edge=>({edge,share:derived(engine,document,'hydrology:split',basin.location,
  {base:declared?declared.find(r=>r.edge===edge.id).share:1/edges.length,target:edge.to})}));
 // Facilities alter relative shares, never create water. All gates closed means
 // no managed outflow; excess water still leaves through the overflow ledger.
 const total=shares.reduce((n,r)=>n+r.share,0);
 return total?shares.filter(r=>r.share>0).map(r=>({...r,share:r.share/total})):[];
}
export function basinState(engine,state,basin){
 const physical=state.records?.[`physical_feature:${basin.id}`];
 if(basin.feature&&physical&&(physical.category!=='physical_feature'||physical.id!==basin.id))throw Error('流域环境登记键冲突');
 return basin.feature?(state.records?.[`physical_feature:${basin.id}`]?.state??basin.feature.state):state.records?.[`water-cycle:${basin.id}`]?.water??{capacityMl:basin.capacity,waterMl:Math.floor(basin.capacity*engine.rules.forestWater.water.initialShare),saltMg:0,toxinUg:0,turbidity:0,pathogenRisk:0,odor:'原水'};
}
function store(d,b,water,ledger){
 if(b.feature)d.set(['state','records',`physical_feature:${b.id}`],{id:b.id,category:'physical_feature',location:b.location,state:water});
 d.set(record(b.id),{category:'water_cycle',location:b.location,...ledger,water:clone(water)});
}
function withdraw(w,amount){
 amount=Math.max(0,Math.min(w.waterMl,Math.floor(amount)));
 const part={waterMl:amount,saltMg:0,toxinUg:0,turbidity:w.turbidity??0,pathogenRisk:w.pathogenRisk??0,odor:w.odor};
 for(const k of ['saltMg','toxinUg']){part[k]=(w[k]??0)*(amount/Math.max(1,w.waterMl));w[k]=(w[k]??0)-part[k];}
 w.waterMl-=amount;return part;
}
function receive(w,part){
 const total=w.waterMl+part.waterMl;if(!part.waterMl)return;
 for(const k of ['pathogenRisk','turbidity'])w[k]=((w[k]??0)*w.waterMl+(part[k]??0)*part.waterMl)/total;
 for(const k of ['saltMg','toxinUg'])w[k]=(w[k]??0)+(part[k]??0);
 w.waterMl=total;
}
export function basinForLocation(engine,location,basins=waterBasins(engine)){
 const chain=ancestor(engine,location);
 for(const id of chain){const b=basins.find(b=>b.location===id);if(b)return b;}
 // A town's river access may be catalogued in one of its public districts.
 // A neighbouring village has its own scope and cannot supply the town by
 // ancestry alone. Prefer the main water body to a small incidental pool.
 const scope=engine.byId.get(location)?.scope;
 if(engine.rules.householdSubsistence){const scoped=basins.find(b=>b.location===scope);if(scoped)return scoped;}
 if(engine.rules.householdSubsistence)for(const id of chain){
  if(id!==(scope??location))continue;
  const local=basins.filter(b=>b.feature?.access==='public'&&engine.byId.get(b.location)?.scope===id&&ancestor(engine,b.location).includes(id))
   .sort((a,b)=>b.capacity-a.capacity||a.id.localeCompare(b.id));
  if(local.length)return local[0];
 }
 return null;
}
export function waterExposure(engine,state,settlement){
 const b=basinForLocation(engine,settlement,waterBasins(engine,state));if(!b)return null;
 const row=state.records?.[`water-cycle:${b.id}`];return row?.drinking?.[settlement]??null;
}
export function farmWaterFactor(engine,state,settlement,day){
 if(!engine.rules.forestWater)return 1;
 const b=basinForLocation(engine,settlement,waterBasins(engine,state)),row=b&&state.records?.[`water-cycle:${b.id}`];
 return row?.day===day?row.farms?.[settlement]?.factor??1:1;
}
export function waterResourceFactor(engine,state,location){
 const b=basinForLocation(engine,location,waterBasins(engine,state));if(!b)return 1;
 const w=basinState(engine,state,b),r=engine.rules.forestWater.water;
 return Math.min(r.maximumPriceFactor,Math.max(1,(b.feature?w.capacityMl:b.capacity)*r.initialShare/Math.max(1,w.waterMl)));
}
// Direct household use outside the already-withdrawn settlement cohort.
// Keep the same physical volume and basin conservation ledger as irrigation.
export function takeHouseholdWater(d,engine,basin,requiredMl,day){
 const old=d.get(...record(basin.id)),w=clone(basinState(engine,d.get('state'),basin));
 const part=withdraw(w,requiredMl);
 const ledger=old?{...old}: {initial:w.waterMl+part.waterMl,rain:0,inflow:0,outflow:0,consumed:0,evaporated:0,overflow:0,externalDelta:0,day:day-1,farms:{},drinking:{}};
 delete ledger.water;delete ledger.category;delete ledger.location;
 ledger.consumed+=part.waterMl;ledger.householdMl=(ledger.householdMl??0)+part.waterMl;
 store(d,basin,w,ledger);return part.waterMl;
}
export function advanceWaterCycle(d,engine,day){
 const rules=engine.rules.forestWater?.water;if(!rules)return;
 const basins=waterBasins(engine,d.get('state')),{edges,order}=waterConnections(engine,basins),rows=new Map();
 const rains=Object.values(d.get('state','records')??{}).filter(r=>r.category==='faith_rain'&&r.since<(day+1)*DAY&&r.expires>day*DAY);
 for(const b of basins){
  const old=d.get(...record(b.id));if(old?.day>=day){if(old.day===day)continue;throw Error('流域日结时间倒退');}
  if(old&&old.category!=='water_cycle')throw Error('流域账登记键冲突');
  const w=clone(basinState(engine,d.get('state'),b));
  if(b.feature)b.capacity=w.capacityMl;
  if(!Number.isSafeInteger(b.capacity)||b.capacity<=0||!Number.isSafeInteger(w.waterMl)||w.waterMl<0||w.waterMl+(w.reservedWaterMl??0)>b.capacity)throw Error('流域实际水量越界');
  // Existing spells can add/remove water between days. Observe the actual change
  // separately from rainfall, so it cannot be reported as natural regeneration.
  const external=w.waterMl-(old?.water.waterMl??w.waterMl),weather=basinWeather(engine,d.document.randomSeed,b.location,day*DAY+720);
  const rain=Math.floor(b.capacity*precipitationShare(engine,d.document,b.location,weather,day,rains).share);
  receive(w,{waterMl:rain});
  const ledger={initial:old?.initial??w.waterMl-rain,rain:(old?.rain??0)+rain,inflow:old?.inflow??0,outflow:old?.outflow??0,consumed:old?.consumed??0,evaporated:old?.evaporated??0,overflow:old?.overflow??0,externalDelta:(old?.externalDelta??0)+external,day,farms:{},drinking:{}};
  const downstream=edges.filter(e=>e.from===b.id),shares=waterShares(engine,d.document,b,w,downstream);
  rows.set(b.id,{b,w,ledger,old,weather,shares});
 }
 // Consumers withdraw before outflow; upstream use therefore reduces downstream supply.
 for(const b of order){
  const row=rows.get(b.id);if(!row)continue;const {w,ledger,old,weather}=row;
  const settlements=Object.entries(d.get('state','settlements')??{}).filter(([id])=>basinForLocation(engine,id,basins)?.id===b.id);
  for(const [id,s] of settlements){
   const frozen=(w.frozenUntil??0)>(day+1)*DAY;
   const need=s.population*rules.drinkingMlPerPerson,drunk=withdraw(w,frozen?0:need);ledger.consumed+=drunk.waterMl;
   ledger.drinking[id]={settlement:id,day,requiredMl:need,takenMl:drunk.waterMl,pathogenRisk:drunk.pathogenRisk,toxinUgPerMl:drunk.toxinUg/Math.max(1,drunk.waterMl)};
   const farm=engine.rules.agriculture?.settlements.find(p=>p.settlement===id),crop=engine.rules.agriculture?.crop;
   const area=farm?(d.get('state','records',`agriculture:${id}`)?.field?.areaUnits??farm.areaUnits):
    s.granary!==false&&s.foodPerDay>0&&crop?Math.ceil(s.foodPerDay*360*crop.areaUnitsPerHa/crop.yieldPerHa):0;
   if(!area)continue;
   const local=basinWeather(engine,d.document.randomSeed,id,day*DAY+720);
   const precipitation=precipitationShare(engine,d.document,id,local,day,rains);
   const needFarm=Math.ceil(area*rules.irrigationMlPerArea),rainShare=Math.min(1,precipitation.share/rules.cropRainShare);
   const irrigation=withdraw(w,frozen?0:needFarm*(1-rainShare));ledger.consumed+=irrigation.waterMl;
   const supplied=Math.min(1,rainShare+irrigation.waterMl/Math.max(1,needFarm)),pollution=Math.min(rules.maximumCropPollutionLoss,(irrigation.pathogenRisk/rules.cropPollutionScale+irrigation.toxinUg/Math.max(1,irrigation.waterMl)/rules.toxinScale)*irrigation.waterMl/Math.max(1,needFarm));
   ledger.farms[id]={requiredMl:needFarm,takenMl:irrigation.waterMl,rainShare,factor:(rules.droughtYieldFloor+(1-rules.droughtYieldFloor)*supplied)*(1-pollution)};
   for(const source of precipitation.sources){
    const key=`rain-benefit:${source.sourceEvent}:${id}`,prior=d.get('state','records',key);
    if(prior?.lastDay>=day)continue;
    d.set(['state','records',key],{category:'rain_benefit',settlement:id,sourceEvent:source.sourceEvent,temple:source.temple,rite:source.rite,until:source.until,lastDay:day,share:(prior?.share??0)+source.share,donors:prior?.donors??[]});
   }
  }
  // Evaporation leaves dissolved substances behind.
  const evaporated=Math.min(w.waterMl,Math.floor(b.capacity*rules.evaporationShare));w.waterMl-=evaporated;ledger.evaporated+=evaporated;
  const downstream=row.shares.filter(r=>rows.has(r.edge.to)),capacity=b.capacity-(w.reservedWaterMl??0),excess=Math.max(0,w.waterMl-capacity);
  const flowing=downstream.length?Math.min(w.waterMl,Math.max(excess,Math.floor(w.waterMl*rules.dailyFlowShare))):0;
  if(flowing){let sent=0,share=0;for(const [i,{edge:e,share:weight}]of downstream.entries()){
   share+=weight;
   const amount=(i===downstream.length-1?flowing:Math.floor(flowing*share))-sent,part=withdraw(w,amount);sent+=part.waterMl;ledger.outflow+=part.waterMl;
   const next=rows.get(e.to);receive(next.w,part);next.ledger.inflow+=part.waterMl;
  }}
  const overflow=withdraw(w,Math.max(0,w.waterMl-capacity));ledger.overflow+=overflow.waterMl;
  if(Math.abs(ledger.initial+ledger.rain+ledger.inflow+ledger.externalDelta-ledger.outflow-ledger.consumed-ledger.evaporated-ledger.overflow-w.waterMl)>0.001)throw Error('流域水量账不守恒');
  store(d,b,w,ledger);
  const polluted=Math.max(w.pathogenRisk??0,...Object.values(ledger.drinking).map(r=>r.pathogenRisk))>=rules.diseaseThreshold,dry=w.waterMl<b.capacity*rules.shortageShare;
  const priorPolluted=Math.max(old?.water.pathogenRisk??0,...Object.values(old?.drinking??{}).map(r=>r?.pathogenRisk??0))>=rules.diseaseThreshold,priorDry=old?old.water.waterMl<b.capacity*rules.shortageShare:false;
  if(polluted!==priorPolluted||dry!==priorDry){
   const name=engine.byId.get(b.location)?.name??b.location;
   // Untested pathogen facts stay private; symptoms still enter the existing
   // U3 illness/public knowledge path. Observable water shortage is public.
   entityTransition(d,engine,{id:`water:${b.id}:${day}`,verb:'close',actor:b.location,target:b.id,location:b.location,minute:(day+1)*DAY,
    visibility:polluted?'private':'public',witnesses:polluted?[]:undefined,participants:[],tags:['resource',polluted?'water_pollution':dry?'water_shortage':'water_recovered'],detail:{waterMl:w.waterMl},
    summary:polluted?`${name}来水污染影响饮水和灌溉`:dry?`${name}水源供给不足`:`${name}水源供给恢复`});
  }
 }
}

registerSubsistenceResources({waterBasins,basinForLocation,basinState,waterResourceFactor,takeHouseholdWater,locationHabitatTypes,speciesHabitatTypes});
