// RW-03. Construction facts live in created/buildings; availability and service
// capacity are read from those facts. No second stored service/road status.
import {traitsOf} from './traits.mjs';
import {resolveInteraction} from './interactions.mjs';
import {weatherAt} from './weather.mjs';
import {publishTransitionEvent,presentWitnesses} from './world-events.mjs';
import {advanceLayerPlan} from './advance-layers.mjs';

import {FACILITY_TYPES,facilityDefinition,facilityView,allFacilities,within} from './facility-state.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('facilities',{kinds:['owns']});
const DAY=1440,HOUR=60;
function event(d,engine,id,verb,building,summary,{minute=d.get('state','minute'),actor,sourceEvent=id,...facts}={}){
 const state=d.get('state'),base=facilityDefinition(engine,state,building),location=base?.parent??building;
 publishTransitionEvent(d,engine,{id,verb,actor:actor??building,target:building,subject:building,
  minute,location,witnesses:presentWitnesses(state,location),visibility:'public',tags:['entity-transition','facility'],summary,sourceEvent,...facts});
}
export function damageFacility(d,engine,building,amount,{cause='损毁',minute=d.get('state','minute'),sourceEvent=`${cause}:${minute}`,actor}={}){
 const state=d.get('state'),view=facilityView(engine,state,building);if(!view||!(amount>0))return null;
 const marker=`facility_damage:${sourceEvent}:${building}`;if(state.records?.[marker])return view;
 const row=state.buildings?.[building]??{},condition=Math.max(0,view.condition-amount);
 if(condition===view.condition)return view;
 holdingSet(d,null,['state','buildings',building],{...row,condition,...(condition===0?{burning:false}:{})},'facilities');
 d.set(['state','records',marker],{category:'facility_damage',building,amount:view.condition-condition,cause,minute,sourceEvent});
 const after=facilityView(engine,d.get('state'),building),base=facilityDefinition(engine,state,building);
 event(d,engine,`${sourceEvent}:facility:${building}`,'harm',building,`${base.name}因${cause}受损${after.status==='可用'?'':`，用途${after.status}`}`,{minute,actor,sourceEvent,cause,damage:view.condition-condition});
 return after;
}
export function damageFacilities(d,engine,locations,amount,context={}){
 const state=d.get('state');return allFacilities(engine,state).filter(b=>locations.some(loc=>within(engine,state,b.id,loc))).map(b=>damageFacility(d,engine,b.id,amount,context));
}
// Called only after K2 resolved the material rule. Water and rain use the same
// extinguishing result as features. Flood additionally damages the structure.
export function applyFacilityInteraction(d,engine,target,outcome,{minute=d.get('state','minute'),sourceEvent=`${outcome.agent}:${minute}`,depth=0}={}){
 const view=facilityView(engine,d.get('state'),target),changed={added:[],removed:[]};if(!view)return changed;
 const row={...(d.get('state','buildings',target)??{}),condition:view.condition};
 if(outcome.remove.includes('burning')&&row.burning){row.burning=false;changed.removed.push('burning');}
 if(outcome.add.includes('wet')){row.wetUntil=minute+DAY;changed.added.push('wet');}
 if(outcome.add.includes('burning')&&!view.burning&&view.condition>0){
  row.burning=true;row.fireDepth=depth;row.fireSince=minute;row.fireTick=minute;row.fireSpread=false;changed.added.push('burning');
 }
 if(changed.added.length||changed.removed.length)holdingSet(d,null,['state','buildings',target],row,'facilities');
 if(changed.added.includes('burning'))event(d,engine,`${sourceEvent}:ignite:${target}`,'harm',target,`${facilityDefinition(engine,d.get('state'),target).name}起火，已经停用`,{minute,sourceEvent,cause:'火灾'});
 if(outcome.agent==='flood')damageFacility(d,engine,target,view.material==='stone'?8:20,{cause:'洪水',minute,sourceEvent});
 return changed;
}
function weather(engine,d,id,at){
 let place=id;const state=d.get('state'),seen=new Set();
 while(place&&!seen.has(place)){const w=weatherAt(engine,d.document.randomSeed,place,at);if(w)return w;seen.add(place);place=facilityDefinition(engine,state,place)?.parent;}
 return null;
}
function distance(a,b){
 // Explicit neighbours cover authored close pairs. Otherwise only siblings
 // with coordinates are candidates; a shared town alone is no adjacency.
 if(a.neighbours?.includes(b.id))return a.neighbourDistances?.[b.id]??5;
 if(a.parent!==b.parent)return Infinity;
 const p=a.position??a.coordinates,q=b.position??b.coordinates;
 return p&&q?Math.hypot((p.x??p[0])-(q.x??q[0]),(p.y??p[1])-(q.y??q[1]))*(a.position&&b.position?1:1000):Infinity;
}
export function advanceFacilityFire(d,engine,{after}){
 const ids=Object.entries(d.get('state','buildings')??{}).filter(([,r])=>r.burning).map(([id])=>id).sort();
 for(const id of ids){
  let row=d.get('state','buildings',id);const tick=row.fireTick??row.fireSince??after;
  for(let at=tick+HOUR;at<=after&&row.burning;at+=HOUR){
   const w=weather(engine,d,id,at),rain=['rain','storm'].includes(w?.kind),base=facilityDefinition(engine,d.get('state'),id);
   if(rain){applyFacilityInteraction(d,engine,id,resolveInteraction('rain',traitsOf(engine,d.get('state'),id)),{minute:at});break;}
   if(!row.fireSpread&&(row.fireDepth??0)<2){
    const air=facilityDefinition(engine,d.get('state'),base.parent)?.features?.find(f=>f.airModel?.windVector),vector=air?.airModel?.windVector;
    const wind=base.windKmh??w?.windKmh??(vector?Math.hypot(...vector)*3.6:0),reach=8+Math.min(12,wind/2);
    const neighbours=allFacilities(engine,d.get('state')).filter(b=>b.id!==id&&distance(base,b)<=reach).sort((a,b)=>distance(base,a)-distance(base,b)||a.id.localeCompare(b.id)).slice(0,2);
    for(const b of neighbours){const outcome=resolveInteraction('fire',traitsOf(engine,d.get('state'),b.id));applyFacilityInteraction(d,engine,b.id,outcome,{minute:at,sourceEvent:`fire:${id}:${at}`,depth:(row.fireDepth??0)+1});}
   }
   const view=facilityView(engine,d.get('state'),id);
   damageFacility(d,engine,id,view.material==='stone'?4:25,{cause:'火灾',minute:at,sourceEvent:`fire:${id}:${at}`});
   row={...d.get('state','buildings',id),fireTick:at,fireSpread:true};holdingSet(d,null,['state','buildings',id],row,'facilities');
  }
 }
}
export function nextFacilityMinute(state,now){
 return Math.min(Infinity,...Object.values(state.buildings??{}).filter(b=>b.burning).map(b=>Math.max(now+1,(b.fireTick??b.fireSince??now)+HOUR)));
}
export function advanceFacilities(d,engine,{before,after}){
 advanceFacilityFire(d,engine,{after});
 if(Math.floor(before/DAY)===Math.floor(after/DAY))return;
 const plan=engine.advanceLayerContext??advanceLayerPlan(engine,d.get('state'));
 for(let day=Math.floor(before/DAY);day<Math.floor(after/DAY);day++){
  const at=(day+1)*DAY,state=d.get('state'),occupied=new Set(Object.values(state.npcs??{}).map(n=>n.location));occupied.add(state.location);
  const distant=new Map();
  for(const base of allFacilities(engine,state)){
   const row=d.get('state','buildings',base.id)??{};
   if(base.generated==='remote'&&row.condition===undefined&&plan.layers.get(base.region)==='statistics'){
    distant.set(base.region,base.id);continue;
   }
   // A building finished at this midnight has not yet experienced a day's wear.
   if((row.builtAt??-1)>=at||(row.lastWearDay??-1)>=day)continue;
   const view=facilityView(engine,d.get('state'),base.id);if(view.condition<=0)continue;
   const w=weather(engine,d,base.id,day*DAY+720),weatherWear=w?.kind==='storm'?4:w?.kind==='rain'?1:0;
   const usage=occupied.has(base.id)?1:0,wear=(row.wearUnits??0)+(view.material==='stone'?1:3)+weatherWear+usage;
   const loss=Math.floor(wear/10);
   // Store the fractional wear; integer arithmetic makes partitioned advances
   // and one long advance agree. Ordinary wear emits only at a use threshold.
   const condition=Math.max(0,view.condition-loss);
   holdingSet(d,null,['state','buildings',base.id],{...row,condition,wearUnits:wear%10,lastWearDay:day},'facilities');
   const next=facilityView(engine,d.get('state'),base.id);
   if(view.status!==next.status)event(d,engine,`wear:${base.id}:${day}`,'harm',base.id,`${base.name}年久失修，用途${next.status}`,{minute:at,cause:'损耗'});
  }
  for(const [county,representative] of distant){
   const key=`facility_region:${county}`,old=d.get('state','records',key);if((old?.throughDay??-1)>=day)continue;
   const w=weather(engine,d,representative,day*DAY+720),extra=w?.kind==='storm'?4:w?.kind==='rain'?1:0;
   d.set(['state','records',key],{category:'facility_region',county,throughDay:day,wear:{wood:(old?.wear?.wood??0)+3+extra,stone:(old?.wear?.stone??0)+1+extra}});
  }
 }
}
export function completeFacilityProject(d,engine,p,minute=d.get('state','minute')){
 const previous=d.get('state','records',`world_event:${p.id}:complete`);if(previous)return previous.target;
 const target=p.building,kind=p.facilityType??'public';
 if(target){
  const row=d.get('state','buildings',target)??{},view=facilityView(engine,d.get('state'),target);
  if(!view)throw Error('施工建筑不存在');
  holdingSet(d,null,['state','buildings',target],p.projectWork==='repair'?{...row,condition:100,burning:false,wearUnits:0,lastRepair:minute}:
   {...row,condition:view.condition,expansions:(row.expansions??0)+1},'facilities');
  event(d,engine,`${p.id}:complete`,'help',target,`${facilityDefinition(engine,d.get('state'),target).name}${p.projectWork==='repair'?'修缮完成，用途恢复':'扩建完成，服务容量增加'}`,{minute,actor:p.creator,sourceEvent:p.id});return target;
 }
 const id=`bld_${p.type==='建房'?'house':'built'}_${p.id.replace(/[^a-zA-Z0-9_-]/g,'_')}`;if(d.get('state','created',id))return id;
 const owner=p.public&&!p.public.payer||p.civicApproval?p.settlement:p.creator??'player';
 holdingSet(d,null,['state','created',id],{id,name:p.name,aliases:[],type:'bld',scope:p.settlement,parent:p.location??p.settlement,owner,
  access:{mode:owner===p.settlement?'public':'private'},purpose:FACILITY_TYPES[kind].purpose,facilityType:kind,material:p.material??'wood',builtProject:p.id,openHours:[0,1440]},'facilities');
 holdingSet(d,null,['state','buildings',id],{owner,condition:100,project:p.id,builtAt:minute,...(p.route?{route:p.route}:{})},'facilities');
 event(d,engine,`${p.id}:complete`,'help',id,`${p.name}建成，${FACILITY_TYPES[kind].purpose}投入使用`,{minute,actor:p.creator,sourceEvent:p.id});return id;
}
