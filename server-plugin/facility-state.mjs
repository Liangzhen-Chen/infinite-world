// Facility projections import no runtime modules; domain callbacks are installed below.
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
 const base=facilityDefinition(engine,state,id);if(!isFacility(base))return null;
 const row=state.buildings?.[id]??{},authoredKind=facilityKind(base),kind=authoredKind==='public'&&engine.rules.training?.institutions?.some(r=>r.institution===id)?'school':authoredKind,spec=FACILITY_TYPES[kind]??FACILITY_TYPES.public;
 const material=row.material??base.material??(base.tags?.includes('stone')?'stone':'wood');
 const regional=base.generated==='remote'?state.records?.[`facility_region:${base.region}`]:null;
 const condition=row.condition??Math.max(0,100-Math.floor((regional?.wear?.[material]??0)/10)),burning=Boolean(row.burning),factor=burning||condition<25?0:condition<60?0.5:1;
 const units=1+(row.expansions??0),capacity=Math.floor((base.lodging?.rooms??base.capacity??spec.capacity)*units*factor);
 const services=factor?[...new Set([...(base.services??[]),...spec.services])]:[];
 return {kind,material,condition,burning,factor,status:factor===0?'停用':factor<1?'降级':'可用',services,capacity,
  route:row.route??base.route,workstations:factor?(base.workstations??(kind==='workshop'?[{id:`${id}:woodworking`,kind:'woodworking',access:base.access?.mode==='public'?'public':'private',owner:row.owner??base.owner,fee:0}]:[])):[],units};
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
 for(const [id,row] of Object.entries(state.buildings??{})){
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
export function facilityRuntime(){return facilityRuntime.handlers??={};}
export function installFacilityRuntime(handlers){Object.assign(facilityRuntime(),handlers);}
