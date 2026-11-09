import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {takePopulation,addPopulation} from './population-health.mjs';
import {mealMouthsOf} from './primitives-body.mjs';
// RW-04. Stocks are facts; species, capacity and catchments are derived views.
import {locationHabitatTypes,rangeSpec} from './wildlife-habitats.mjs';
import {locationTraits,itemTraits,featureTraits} from './traits.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {advanceWaterCycle,waterResourceFactor} from './water-cycle.mjs';
import {reservedMigrationCapacity} from './seasonal-migration.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {derived} from './derived.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {reserve as reserveAccount,settlementStock,granary as granaryAccount,moveStock,bookStock,priceRead,moveFishPopulation,logisticStock} from './stock.mjs';
import {exp} from './det-math.mjs';
import {registerSubsistenceResources} from './household-subsistence.mjs';
// The one item the forest ledger accounts for; household subsistence reads it from here instead of naming a product.
const FOREST_ITEM='item_wood',forestItem=()=>FOREST_ITEM;
registerSubsistenceResources({forestSites,forestView,harvestForest,forestItem});
// S1b: 林木存量是资源点账户 forest:<地点>|item_wood|reserve：首次触及时按世界数据（site.capacity）经 src:genesis 开户，
// 生长来自 src:regrowth，采伐转入聚落木料或采伐者行囊；聚落烧柴进 sink:consume。没有林木规则时聚落日产木料来自 src:regrowth。
declareLedgerWriter('forest-water',{sources:{'src:genesis':{item_wood:10000000},'src:regrowth':{item_wood:10000000}},sinks:['sink:consume']});
const forestAccount=(engine,location)=>reserveAccount(engine,`forest:${location}`,FOREST_ITEM);
function bookForest(d,engine,location,old,row,eventId){
 const account=forestAccount(engine,location);
 if(!old)moveStock(d,{from:'src:genesis|item_wood|forest',to:account,amount:row.initial,writer:'forest-water',eventId});
 moveStock(d,{from:'src:regrowth|item_wood|forest',to:account,amount:row.grown-(old?.grown??0),writer:'forest-water',eventId});
}

const DAY=1440,clone=v=>structuredClone(v),path=id=>['state','records',`forest:${id}`];
// Ancient wood is an age-class subset of the same reserve, never another copy
// of the forest. Its capacity share comes from the opening stock facts; r is
// the published annual ecology rate. Keep the continuous anchor across clock
// steps so flooring the visible reserve cannot erase fractional regrowth.
function ancientProjection(engine,document,site,row,minute){
 const a=row.ancient;if(!a)return null;
 const annual=(engine.world.balance?.ecology??engine.world.primitiveTables?.ecology)?.rows.find(r=>r.key==='r:ancientTree')?.r;
 if(!Number.isFinite(annual))throw Error('古树再生缺少已发布的年率');
 const capacity=site.capacity*a.initial/row.initial,rate=derived(engine,document,'economy:yield',site.location,{base:annual/360});
 const at=(anchor,time)=>{
  if(anchor.reserve<=0||anchor.capacity<=0)return 0;
  return anchor.capacity/(1+(anchor.capacity/anchor.reserve-1)*exp(-anchor.rate*(time-anchor.minute)/DAY));
 };
 let anchor=a.growthAnchor??{minute:row.updatedAt,reserve:a.reserve,capacity,rate};
 if(anchor.capacity!==capacity||anchor.rate!==rate)anchor={minute:row.updatedAt,reserve:at(anchor,row.updatedAt),capacity,rate};
 a.growthAnchor=anchor;
 return {capacity,rate,reserve:Math.max(a.reserve,at(anchor,minute))};
}
function projectForest(engine,document,site,row,minute){
 if(minute<row.updatedAt)throw Error('林木更新时间倒退');
 const days=(minute-row.updatedAt)/DAY;if(!days)return row;
 const a=row.ancient,ancient=ancientProjection(engine,document,site,row,row.updatedAt+days*DAY);
 if(a&&(a.initial+a.grown-a.harvested!==a.reserve||a.reserve<0||a.reserve>row.reserve||a.initial>row.initial))throw Error('古树子存量不守恒');
 const normalCapacity=site.capacity-(ancient?.capacity??0),normalReserve=row.reserve-(a?.reserve??0);
 const ordinary=logisticStock(row,'ordinary',{reserve:normalReserve,capacity:normalCapacity,
  rate:derived(engine,document,'economy:yield',site.location,{base:site.growthPerDay}),from:row.updatedAt,to:row.updatedAt+days*DAY})-normalReserve;
 const slow=ancient?Math.max(0,Math.floor(ancient.reserve)-a.reserve):0;
 if(a){a.reserve+=slow;a.grown+=slow;}
 row.reserve+=ordinary+slow;row.grown+=ordinary+slow;row.updatedAt+=days*DAY;return row;
}
const present=(d,species,location)=>Object.entries(d.get('state','creatures')??{}).filter(([id,a])=>a.location===location&&a.species===species&&!a.owner&&!a.mind?.awakened&&a.hp>0&&!isPhysicallyDead(null,d,id)).length;
export function resourceSettlement(engine,location,state={}){
 const seen=new Set(),settlements=new Set([...Object.keys(state.settlements??{}),...(engine.rules.agriculture?.settlements??[]).map(p=>p.settlement)]);
 while(location&&!seen.has(location)){if(settlements.has(location))return location;seen.add(location);location=engine.byId.get(location)?.parent;}
 return null;
}
// Sites derive only from the catalog; memoize per catalog array (not persisted).
const siteCache=new WeakMap();
export function forestSites(engine){
 const r=engine.rules.forestWater;if(!r)return[];
 const list=engine.world.locations,hit=siteCache.get(list);
 if(hit?.rules===r&&hit.length===list.length)return hit.rows;
 const rows=list.filter(l=>locationHabitatTypes(l).includes('forest')||
  (l.features??[]).some(f=>featureTraits(f).tags.includes('wood'))&&(l.site?.resources??[]).some(resource=>resource.item===FOREST_ITEM&&l.site.changes?.some(c=>c.kind==='regrow'&&c.resource===resource.id))).map(l=>{
  const tags=locationTraits(l).tags,kind=tags.includes('frost')||/针|松|杉/.test(l.terrain)?'conifer':tags.includes('wet')?'wetwood':'broadleaf';
  const species=r.forest.species[kind],area=l.areaKm2??r.forest.defaultAreaKm2;
  return {location:l.id,kind,capacity:Math.max(1,Math.floor(area*r.forest.stockPerKm2)),growthPerDay:species.growthPerDay};
 }).map(Object.freeze);
 siteCache.set(list,{rules:r,length:list.length,rows});return rows;
}
function stock(d,engine,site,minute){
 const old=d.get(...path(site.location));
 if(old&&(old.category!=='forest'||old.location!==site.location||old.initial+old.grown-old.harvested!==old.reserve||old.reserve<0))throw Error('林木存量账不守恒');
 const row=clone(old??{category:'forest',location:site.location,initial:site.capacity,reserve:site.capacity,grown:0,harvested:0,updatedAt:minute,...(engine.rules.forestWater.forest.opening?.find(r=>r.location===site.location)?.ancient?{ancient:{initial:engine.rules.forestWater.forest.opening.find(r=>r.location===site.location).ancient,reserve:engine.rules.forestWater.forest.opening.find(r=>r.location===site.location).ancient,grown:0,harvested:0}}:{})});
  return projectForest(engine,d.document,site,row,minute);
}
// books（草稿或文档）给出时，林木存量读林木账户（S1c 价格输入）；没有时读旧记录。
export function forestView(engine,state,location,site=forestSites(engine).find(s=>s.location===location),books=null){
 if(!site)return null;
 const row=state.records?.[`forest:${location}`];
  const initial=row&&books?priceRead(books,{point:'forest.reserve',account:forestAccount(engine,location),legacy:()=>row.reserve}):row?.reserve??site.capacity;
  const projected=row?projectForest(engine,books?.document??{state},site,{...clone(row),reserve:initial},Math.max(state.minute??row.updatedAt,row.updatedAt)):null,reserve=projected?.reserve??initial;
 return {...site,reserve,cover:Math.min(1,reserve/site.capacity),updatedAt:row?.updatedAt??null};
}
export function forestHabitatCapacity(engine,state,habitat,species,forest=forestView(engine,state,habitat.location)){
 const capacity=rangeSpec(habitat,species).capacity;
 return forest?Math.floor(capacity*(engine.rules.forestWater.forest.minimumHabitatShare+(1-engine.rules.forestWater.forest.minimumHabitatShare)*forest.cover)):capacity;
}
registerAdvanceHook('wildlifeCapacity',forestHabitatCapacity);
// S1b: to = 采得木料的去处（聚落木料或采伐者行囊的账户键）。
export function harvestForest(d,engine,location,quantity,minute=d.get('state','minute'),{to,eventId=null}={}){
 if(!Number.isSafeInteger(quantity)||quantity<0)throw preconditionFailure('采伐量须为非负整数');
 const site=forestSites(engine).find(s=>s.location===location);if(!site)return 0;
 const old=d.get(...path(location)),row=stock(d,engine,site,minute),taken=Math.min(quantity,row.reserve),before=row.reserve;
  if(row.ancient){
   const a=row.ancient,used=Math.max(0,taken-(row.reserve-a.reserve));
   if(used){const projected=ancientProjection(engine,d.document,site,row,minute);a.reserve-=used;a.harvested+=used;a.growthAnchor={minute,reserve:Math.max(0,projected.reserve-used),capacity:projected.capacity,rate:projected.rate};}
  }
 row.reserve-=taken;row.harvested+=taken;bookForest(d,engine,location,old,row,eventId);
 // 未给去处的直接调用（测试夹具）不拦旧结算，记未入账漂移。
 if(to)moveStock(d,{from:forestAccount(engine,location),to,amount:taken,writer:'forest-water',eventId});else bookStock(d,engine,forestAccount(engine,location),-taken,undefined);d.set(path(location),row);
 if(before>=site.capacity*engine.rules.forestWater.forest.shortageCover&&row.reserve<site.capacity*engine.rules.forestWater.forest.shortageCover)event(d,engine,location,Math.floor(minute/DAY),'forest_depleted',{reserve:row.reserve},minute);
 return taken;
}
// Bounded route search: a village's work crew cannot harvest an arbitrary forest.
export function nearbyResourceLocations(engine,location,maxEdges=engine.rules.forestWater?.forest.maximumRouteEdges??2,state={}){
 const found=new Set([location]),distances=new Map([[location,0]]);let frontier=[location];
 for(let i=0;i<maxEdges;i++){
  const next=[];for(const edge of engine.world.routes??[]){if(!edge.modes?.includes('walk')||edge.closedSeasons?.includes(engine.calendar(state.minute??0).season))continue;
   const from=frontier.includes(edge.from)?edge.from:frontier.includes(edge.to)?edge.to:null,id=from===edge.from?edge.to:from===edge.to?edge.from:null;
   const distance=(distances.get(from)??Infinity)+(edge.lengthKm??0);
   if(id&&distance<=(engine.rules.forestWater?.forest.maximumDistanceKm??20)&&distance<(distances.get(id)??Infinity)){found.add(id);distances.set(id,distance);next.push(id);}
  }frontier=next;if(!frontier.length)break;
 }return found;
}
export function settlementForests(engine,state,settlement){
 const near=nearbyResourceLocations(engine,settlement,engine.rules.forestWater?.forest.maximumRouteEdges,state);
 return forestSites(engine).filter(s=>{
  const place=engine.byId.get(s.location),owner=place.site?.owner??place.owner;
  return (!owner||owner===settlement)&&near.has(s.location)&&!place.access?.requiresConsent;
 });
}
export function harvestSettlementWood(d,engine,settlement,quantity,minute){
 const to=settlementStock(engine,settlement,'wood'),eventId=`day_${Math.floor(minute/DAY)-1}`;
 if(!engine.rules.forestWater){moveStock(d,{from:'src:regrowth|item_wood|wood',to,amount:quantity,writer:'forest-water',eventId});return quantity;}
 if(quantity===0)return 0;
 let left=quantity;for(const site of settlementForests(engine,d.get('state'),settlement)){left-=harvestForest(d,engine,site.location,left,minute,{to,eventId});if(!left)break;}
 return quantity-left;
}
function event(d,engine,location,day,kind,detail,minute=(day+1)*DAY){
 const name=engine.byId.get(location)?.name??location;
 const summary=kind==='fuel_shortage'?`${name}缺柴${detail.shortage}份`:kind==='fuel_recovered'?`${name}柴料供应恢复`:kind==='forest_depleted'?`${name}可采木料剩${detail.reserve}份`:kind==='forest_recovered'?`${name}林木存量逐步恢复`:
  detail.moved?`${name}的${engine.byId.get(detail.species)?.name??'野物'}迁出${detail.moved}只`:`${name}栖地缩减，野物减少${detail.starved}只`;
 entityTransition(d,engine,{id:`resource:${location}:${day}:${kind}`,verb:'close',actor:location,target:location,location,minute,tags:['resource',kind],detail,summary});
}
export function settleFuel(d,engine,id,s,produced,day){
 if(!engine.rules.forestWater){s.wood+=produced;return;}
 s.wood+=produced;
 const demand=Math.ceil(s.population/engine.rules.forestWater.forest.peoplePerFuel),used=Math.min(s.wood,demand),shortage=demand-used;
 s.wood-=used;moveStock(d,{from:settlementStock(engine,id,'wood'),to:'sink:consume|item_wood|fuel',amount:used,writer:'forest-water',eventId:`day_${day}`});
 const key=`forest-supply:${id}`,old=d.get('state','records',key);
 d.set(['state','records',key],{category:'forest_supply',settlement:id,day,produced,demand,used,shortage,consumed:(old?.consumed??0)+used});
 if(Boolean(shortage)!==Boolean(old?.shortage))event(d,engine,id,day,shortage?'fuel_shortage':'fuel_recovered',{shortage,produced});
}
// Displaced unseen animals move along an existing walk edge into a compatible
// range. Immigration/emigration use the existing population conservation terms.
export function displaceForestWildlife(d,engine,day){
 const forests=new Map(forestSites(engine).map(site=>[site.location,forestView(engine,d.get('state'),site.location,site)]));
 for(const h of engine.rules.wildlife?.habitats??[]){
  const forest=forests.get(h.location);if(!forest||forest.cover>=1)continue;
  for(const s of engine.world.monsters.filter(s=>s.wildlife)){
   const original=d.get('state','records',`ecology:${h.id}`);if(!original?.populations[s.id])continue;
   const source=clone(original),p=source.populations[s.id],capacity=forestHabitatCapacity(engine,d.get('state'),h,s,forest);
   let excess=Math.max(0,p.count+present(d,s.id,h.location)-capacity),moved=0;if(!excess)continue;
   const near=nearbyResourceLocations(engine,h.location,1);
   for(const to of engine.rules.wildlife.habitats){
    if(to.id===h.id||!near.has(to.location))continue;
    const target=clone(d.get('state','records',`ecology:${to.id}`)),q=target?.populations[s.id];if(!q)continue;
    const actors=present(d,s.id,to.location),transit=reservedMigrationCapacity(d,to.id,s.id);
    const amount=Math.min(excess,p.count,Math.max(0,forestHabitatCapacity(engine,d.get('state'),to,s,forests.get(to.location)??null)-q.count-actors-transit));
    if(!amount)continue;moveFishPopulation(d,engine,s.id,h.location,to.location,amount,`forest-move:${day}`);addPopulation(q,takePopulation(p,amount));p.emigrated=(p.emigrated??0)+amount;q.immigrated=(q.immigrated??0)+amount;excess-=amount;moved+=amount;
    d.set(['state','records',`ecology:${to.id}`],target);if(!excess)break;
   }
   const starved=day%7===6?Math.min(excess,p.count):0;
   if(starved){takePopulation(p,starved);p.starved+=starved;}
   if(moved||starved){d.set(['state','records',`ecology:${h.id}`],source);event(d,engine,h.location,day,`wildlife_migration:${s.id}`,{species:s.id,moved,starved});}
  }
 }
}
export function advanceForestWater(d,engine,day){
 if(!engine.rules.forestWater)return;
 const minute=(day+1)*DAY;
 // P3 statistical unit: one stock per location, no simulated individual trees.
 for(const site of forestSites(engine)){
  const old=d.get(...path(site.location));if(!old)continue;
  const plan=engine.advanceLayerContext,layer=plan?.layers.get(plan.countyOf(site.location));
  // P3 distant stocks settle in weekly aggregates. Actual harvests still bring
  // that one location current before deducting, so promotion never refreshes stock.
  if(layer==='statistics'&&minute-old.updatedAt<7*DAY)continue;
  const row=stock(d,engine,site,minute);if(row.updatedAt!==old.updatedAt){bookForest(d,engine,site.location,old,row,`day_${day}`);d.set(path(site.location),row);}
  const threshold=site.capacity*engine.rules.forestWater.forest.shortageCover;
  if(old.reserve<threshold&&row.reserve>=threshold)event(d,engine,site.location,day,'forest_recovered',{reserve:row.reserve});
 }
 advanceWaterCycle(d,engine,day);
}
export function forestWaterPriceFactor(engine,state,item,location,books=null){
 if(!engine.rules.forestWater)return 1;
 const settlement=resourceSettlement(engine,location,state);
 if(item==='item_water')return waterResourceFactor(engine,state,location);
 if(settlement&&item===engine.rules.settlementTrade?.item&&!engine.rules.agriculture?.settlements.some(p=>p.settlement===settlement)){
  const s=state.settlements[settlement],limits=engine.rules.economy.priceFactorLimits.region;
  if(s.granary===false||!(s.foodPerDay>0))return 1;
  const food=priceRead(books,{point:'forest.food',account:granaryAccount(engine,settlement),legacy:()=>s.food});
  return Math.max(limits[0],Math.min(limits[1],mealMouthsOf(engine,settlement,s.population)*engine.rules.settlementTrade.targetDays/Math.max(1,food)));
 }
 if(item!=='item_wood'&&!itemTraits(engine.byId.get(item)).tags.includes('wood'))return 1;
 const forests=settlement?settlementForests(engine,state,settlement):forestSites(engine).filter(s=>s.location===location);
 const capacity=forests.reduce((n,s)=>n+s.capacity,0),reserve=forests.reduce((n,s)=>n+forestView(engine,state,s.location,undefined,books).reserve,0);
 const shortage=state.records?.[`forest-supply:${settlement}`]?.shortage??0;
 return capacity?Math.min(engine.rules.forestWater.forest.maximumPriceFactor,Math.max(1,capacity/Math.max(1,reserve),shortage?2:1)):shortage?engine.rules.forestWater.forest.maximumPriceFactor:1;
}
