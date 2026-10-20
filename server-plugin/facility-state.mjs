import {recordsMemo} from './storage.mjs';
import {aliveHoldings} from './holdings.mjs';
import {workstationFee} from './workstation-services.mjs';
// Facility projections import no runtime modules; domain callbacks are installed below.
const rebuildCatalog=Symbol('facility rebuilds');
export const FACILITY_TYPES=Object.freeze({
 house:{purpose:'住宅',services:['housing'],capacity:4,wood:8,stone:2,work:2},
 workshop:{purpose:'工坊',services:['craft'],capacity:2,wood:8,stone:4,work:3},
 bridge:{purpose:'桥梁',services:['travel'],capacity:20,wood:10,stone:4,work:3},
 road:{purpose:'道路',services:['travel'],capacity:40,wood:2,stone:8,work:3},
 clinic:{purpose:'医馆',services:['medicine'],capacity:4,wood:8,stone:4,work:3},
 school:{purpose:'学堂',services:['teach'],capacity:12,wood:8,stone:4,work:3},
 granary:{purpose:'仓廪',services:['storage'],capacity:100,wood:10,stone:6,work:4},
 public:{purpose:'公共设施',services:[],capacity:0,wood:0,stone:0,work:0},
});
export const facilityDefinition=(engine,state,id)=>state?.created?.[id]??engine.byId.get(id);
export function facilityRepairMaterials(view){
 const units=Math.max(1,Math.ceil((100-view.condition)/25));
 return {wood:view.material==='stone'?units:2*units,stone:view.material==='stone'?2*units:units,work:units};
}
export const isFacility=p=>p?.type==='bld'||p?.id?.startsWith('bld_');
export function facilityKind(base){
 if(base.facilityType)return base.facilityType;
 const purpose=`${base.purpose??''} ${base.name??''}`;
 return /私宅|住宅|居住/.test(purpose)||base.lodging?'house':base.workstations?.length?'workshop':
  /医馆|药铺|药草院/.test(purpose)?'clinic':/学堂|学馆|私塾|书院|义学/.test(purpose)?'school':/仓廪|粮仓/.test(purpose)?'granary':/桥梁/.test(purpose)?'bridge':/道路/.test(purpose)?'road':'public';
}
export function facilityView(engine,state,id){
 const base=facilityDefinition(engine,state,id);if(!isFacility(base)&&!base?.workstations?.length)return null;
 // A place can host an authored station without itself becoming a building
 // that public-works/repair consumers may treat as a whole workshop.
 const row=state.buildings?.[id]??{},authoredKind=isFacility(base)?facilityKind(base):'workstation_site',kind=authoredKind==='public'&&engine.rules.training?.institutions?.some(r=>r.institution===id)?'school':authoredKind,spec=FACILITY_TYPES[kind]??FACILITY_TYPES.public;
 const material=row.material??base.material??(base.tags?.includes('stone')?'stone':'wood');
 const regional=base.generated==='remote'?state.records?.[`facility_region:${base.region}`]:null;
 const condition=row.condition??Math.max(0,100-Math.floor((regional?.wear?.[material]??0)/10)),burning=Boolean(row.burning),factor=burning||condition<25?0:condition<60?0.5:1;
 const units=1+(row.expansions??0),capacity=Math.floor((base.lodging?.rooms??base.capacity??spec.capacity)*units*factor);
 const services=factor?[...new Set([...(base.services??[]),...spec.services])]:[];
 return {kind,material,condition,burning,factor,status:factor===0?'停用':factor<1?'降级':'可用',services,capacity,
  route:row.route??base.route,workstations:factor?(base.workstations??(kind==='workshop'?[{id:`${id}:woodworking`,kind:'woodworking',access:base.access?.mode==='public'?'public':'private',owner:row.owner??base.owner,fee:0}]:[])).map(station=>({...station,fee:workstationFee(state,station)})):[],units};
}

// A bed is a physical allocation within a lodging facility, not a stored
// "available" boolean. Occupancy comes from current lodging rights/contracts.
export function registerLodgingBed(d,engine,{id,location}){
 const state=d.get('state'),object=d.get('holdings','entities',id)??state.created?.[id]??engine.byId.get(id),place=facilityDefinition(engine,state,location);
 if(typeof id!=='string'||!id.startsWith('item_')||!object||!place?.lodging||state.itemInstances?.[id]?.location&&state.itemInstances[id].location!==location||d.get('holdings','locations',id)?.at!==location)throw Error('Bed must be a real object in a lodging facility');
 const key=`lodging_bed:${id}`,old=state.records?.[key];
 if(old){if(old.location!==location)throw Error('Bed allocation location mismatch');return old;}
 const capacity=facilityView(engine,state,location)?.capacity??place.lodging.rooms;
 if(Object.values(state.records??{}).filter(r=>r.category==='lodging_bed'&&r.location===location).length>=capacity)throw Error('Bed allocations exceed lodging capacity');
 const row={category:'lodging_bed',id,location};d.set(['state','records',key],row);return row;
}
export function lodgingOccupancy(document,location,minute=document.state.minute){
 const state=document.state,rows=[];
 for(const h of aliveHoldings({get:(...path)=>path.reduce((value,key)=>value?.[key],document)},{kind:'lodges',subject:location})){
  if(h.source?.startsWith('contract:room|'))continue; // Legacy projection has no time/bed terms; its contracts below are authoritative.
  const start=h.terms?.from??h.terms?.starts??h.since??0,end=h.terms?.until??h.terms?.expires??Infinity;
  if(start<=minute&&minute<end)rows.push({holder:h.holder,bed:h.terms?.bed??null,source:h.source});
 }
 for(const [id,r] of Object.entries(state.records??{}))if(r.category==='contract'&&r.room===location&&r.status==='有效'&&r.starts<=minute&&minute<r.expires){
  const old=rows.find(h=>h.source===id||h.holder===r.parties?.[0]);
  if(old){old.bed??=r.bed??null;}else rows.push({holder:r.parties?.[0],bed:r.bed??null,source:id});
 }
 return rows;
}
export function lodgingAvailability(engine,document,location,{actor='player',bed=null,minute=document.state.minute}={}){
 const state=document.state,place=facilityDefinition(engine,state,location),view=facilityView(engine,state,location);
 if(!place?.lodging||view?.factor===0)return {available:false,free:0,capacity:0};
 const capacity=view?.capacity??place.lodging.rooms,occupants=lodgingOccupancy(document,location,minute);
 const aliases=id=>document.holdings?.entities?.[id]?.facts?.aliases??state.created?.[id]?.aliases??[];
 const sameBed=(a,b)=>a===b||aliases(b).includes(a)||aliases(a).includes(b);
 if(bed){
  const definition=state.records?.[`lodging_bed:${bed}`];
  const object=document.holdings?.entities?.[bed],position=document.holdings?.locations?.[bed];
  if(!definition||definition.location!==location||object?.goneAt!==undefined||position?.at!==location||position?.mode!=='place')return {available:false,free:0,capacity};
  const occupied=occupants.filter(h=>h.bed&&sameBed(h.bed,bed));
  if(occupied.length)return {available:occupied.every(h=>h.holder===actor),free:Math.max(0,capacity-occupants.length),capacity};
 }
 return {available:occupants.length<capacity,free:Math.max(0,capacity-occupants.length),capacity};
}
export function assertLodgingCapacity(engine,document,location,start,end){
 const boundaries=new Set([start]);
 for(const h of aliveHoldings({get:(...path)=>path.reduce((value,key)=>value?.[key],document)},{kind:'lodges',subject:location}))for(const minute of [h.terms?.from,h.terms?.starts,h.terms?.until,h.terms?.expires])if(start<minute&&minute<end)boundaries.add(minute);
 for(const r of Object.values(document.state.records??{}))if(r.room===location)for(const minute of [r.starts,r.expires])if(start<minute&&minute<end)boundaries.add(minute);
 for(const minute of boundaries)if(!lodgingAvailability(engine,document,location,{minute}).available)throw Error('住宿床位已满');
}
export function selectLodgingBed(engine,document,location,start,end){
 const boundaries=new Set([start]);
 for(const row of Object.values(document.holdings?.rows??{}))if(row.kind==='lodges'&&row.subject===location&&row.until===undefined)for(const minute of [row.terms?.from,row.terms?.until])if(start<minute&&minute<end)boundaries.add(minute);
 for(const row of Object.values(document.state.records??{}))if(row.room===location)for(const minute of [row.starts,row.expires])if(start<minute&&minute<end)boundaries.add(minute);
 return Object.values(document.state.records??{}).find(row=>row.category==='lodging_bed'&&row.location===location&&[...boundaries].every(minute=>lodgingAvailability(engine,document,location,{bed:row.id,minute}).available))?.id??null;
}
export function assertRestBed(engine,document){
 const state=document.state,beds=Object.values(state.records??{}).filter(r=>r.category==='lodging_bed'&&r.location===state.location);
 if(!beds.length)return; // Worlds without allocated physical beds retain their native rest rules.
 if(!beds.some(b=>lodgingAvailability(engine,document,state.location,{bed:b.id}).available))throw Error('没有可供本人使用的床位');
}
export function allFacilities(engine,state){
 return [...new Map([...engine.world.locations,...Object.values(state.created??{})].filter(isFacility).map(b=>[b.id,b])).values()];
}
export function within(engine,state,id,location){
 const seen=new Set();while(id&&!seen.has(id)){if(id===location)return true;seen.add(id);id=facilityDefinition(engine,state,id)?.parent;}return false;
}
// Existing routes stay authoritative for topology. Building a bridge or road
// binds its physical condition/capacity to that edge, including all planners.
export function facilityRouteStates(engine,state){
 const out=new Map();if(!state)return out;
 const rebuilt=recordsMemo(state.created,rebuildCatalog,()=>Object.values(state.created??{}).filter(b=>b.rebuiltFrom));
 const replaced=new Set(rebuilt.filter(b=>state.buildings?.[b.id]).map(b=>b.rebuiltFrom));
 for(const [id,row] of Object.entries(state.buildings??{})){
  if(replaced.has(id))continue;
  const route=row.route??facilityDefinition(engine,state,id)?.route;if(!route)continue;
  const v=facilityView(engine,state,id);if(!v)continue;
  const previous=out.get(route);
  out.set(route,{factor:Math.min(previous?.factor??1,v.factor),capacity:Math.min(previous?.capacity??Infinity,v.capacity)});
 }
 return out;
}
export function facilityServices(engine,state,location){
 const capacities={};
 for(const b of allFacilities(engine,state))if(within(engine,state,b.id,location)){
  const view=facilityView(engine,state,b.id);for(const service of view.services)capacities[service]=(capacities[service]??0)+view.capacity;
 }
 return capacities;
}
export function granaryCapacity(engine,state,settlement,baseCapacity){
 let capacity=baseCapacity;
 for(const b of Object.values(state.created??{}))if(b.builtProject&&b.facilityType==='granary'&&within(engine,state,b.id,settlement)&&
  (state.buildings?.[b.id]?.owner??b.owner)===settlement)capacity+=facilityView(engine,state,b.id).capacity;
 return capacity;
}
const positive=(n,label)=>{if(!Number.isSafeInteger(n)||n<1||n>1000)throw Error(`${label}无效`);return n;};
// Shared preparation for public works, private work, and NPC housing callers.
export function prepareFacilityProject(engine,state,args,settlement){
 const projectWork=args.projectWork??(['repair','expand'].includes(args.action)?args.action:'build');if(!['build','repair','expand'].includes(projectWork))throw Error('工程工序无效');
 const requested=args.building??(projectWork!=='build'?args.plot:null);
 const target=requested?engine.resolve(requested):null,base=target?facilityDefinition(engine,state,target):null,view=target?facilityView(engine,state,target):null;
 if(projectWork!=='build'&&!view)throw Error('修缮或扩建需要现有建筑');
 if(projectWork==='build'&&target)throw Error('新建不能覆盖已有建筑');
 const kind=args.facilityType??view?.kind??'public';if(!FACILITY_TYPES[kind])throw Error('设施用途类型无效');
 if(view&&kind!==view.kind)throw Error('修缮扩建不能改变原用途');
 const location=base?.parent??engine.resolve(args.plot??settlement);
 if(!within(engine,state,location,settlement))throw Error('工程地点不在本村');
 if(target&&Object.values(state.projects??{}).some(p=>p.building===target&&p.status==='施工中'))throw Error('该建筑已有施工工程');
 if(projectWork==='repair'&&view.condition===100&&!view.burning)throw Error('建筑无需修缮');
 const spec=FACILITY_TYPES[kind],units=projectWork==='repair'?Math.max(1,Math.ceil((100-view.condition)/25)):1;
 const required=projectWork==='repair'?facilityRepairMaterials(view):spec;
 const route=args.route??view?.route;
 if(['road','bridge'].includes(kind)){
  const edge=engine.world.routes.find(r=>r.id===route);
  if(!edge||![edge.from,edge.to].some(id=>within(engine,state,id,settlement)))throw Error('桥路工程须连接本村的已登记路线');
 }
 const material=view?.material??args.material??((args.stone??0)>(args.wood??0)?'stone':'wood');
 if(!['wood','stone'].includes(material))throw Error('建筑材质须为木或石');
 if((args.wood??0)<required.wood||(args.stone??0)<required.stone)throw Error(`工程材料不足，须木料${required.wood}、石料${required.stone}`);
 const days=positive(args.days,'工期');
 if(days*(args.workers?.length??1)<required.work)throw Error('工程工时不足');
 return {facilityType:kind,projectWork,location,material,...(target?{building:target}:{}),...(route?{route}:{}),requiredWork:required.work};
}

// Installed consumers keep fire, storage and repair calls out of pack imports.
import {registerAdvanceHook} from './advance-hooks.mjs';
export function facilityRuntime(){return facilityRuntime.handlers??={};}
export function installFacilityRuntime(handlers){Object.assign(facilityRuntime(),handlers);}
registerAdvanceHook('facilityRuntime',facilityRuntime);
