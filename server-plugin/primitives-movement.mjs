// Native local walking uses the same physical paths and position evidence as
// environment/contact actions. Co-presence alone does not invent a coordinate.
import {isPhysicallyDead} from './holdings.mjs';
import {reject} from './primitive-policy.mjs';

export function moveLocally(d,engine,{entity,destination,mode},eventId,{environmentFeatures,localPlayerPoint,areaTargetFacts,assertMindAwake,assertMindSpacePath,assertWaterEarthMovement,waterEarthWalkMinutes,assertLightMovement,assertFirePath}){
 const body=entity==='player'?d.get('state','player'):d.get('state','npcs',entity),feature=environmentFeatures(engine).find(row=>row.id===destination);
 const agent=destination==='player'||d.get('state','npcs',destination)||d.get('state','creatures',destination);
 if(!feature&&!agent)return null;
 if(mode!=='walk')reject('E-MOVE-MODE','Local approach uses walking');
 const location=entity==='player'?d.get('state','location'):body?.location;
 if(!body||!location||body.scheduleTravel||body.cognitionTravel)reject('E-MOVE-ORIGIN','Actor is missing or already travelling');
 if(Object.values(d.get('state','records')??{}).some(r=>r.category==='transport'&&['booked','moving','delayed','intercepted'].includes(r.status)&&r.passengers?.includes(entity)))reject('E-MOVE-ORIGIN','Actor is aboard an active transport');
 const origin=areaTargetFacts(d,engine,entity,location),target=feature?.location===location?{point:feature.position}:agent?areaTargetFacts(d,engine,destination,location):null;
 if(!origin||!target||!Array.isArray(target.point)||target.point.length!==2||!target.point.every(Number.isFinite))reject('E-MOVE-POSITION','Local movement requires actual origin and destination positions in the same node');
 assertMindAwake(d,entity);assertWaterEarthMovement(d,entity);assertLightMovement(d,engine,entity);
 const path=()=>{assertMindSpacePath(d,engine,location,origin.point,target.point);assertFirePath(d,engine,origin.point,target.point,location);};
 path();
 const view={get:(...p)=>p.length===2&&p[0]==='state'&&p[1]==='location'?location:d.get(...p)};
 const metres=Math.hypot(target.point[0]-origin.point[0],target.point[1]-origin.point[1]),speed=engine.rules.environment?.walkingMetresPerMinute;
 if(!Number.isFinite(speed)||speed<=0)reject('E-MOVE-SPEED','Local walking speed is missing');
 const mudMinutes=waterEarthWalkMinutes(view,engine,origin.point,target.point),minutes=Math.ceil(metres/speed)+mudMinutes;
 engine.assertNpcObligationAction(d,[entity],{minutes,location,kind:'move'});
 engine.assertNpcAutonomyAction(d.get('state'),[entity],{minutes});
 const previous=engine.npcScheduleReservations;
 engine.npcScheduleReservations=new Set([...previous??[],entity]);
 try{engine.advance(d,minutes,eventId);}finally{engine.npcScheduleReservations=previous;}
 const place=entity==='player'?d.get('state','location'):d.get('state','npcs',entity,'location');
 if(place!==location||isPhysicallyDead(engine,d,entity)||entity==='player'&&d.get('state','player','status')!=='正常')return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};
 if(agent){const current=areaTargetFacts(d,engine,destination,location);if(!current||current.point.some((n,i)=>n!==target.point[i]))return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};}
 path();assertMindSpacePath(d,engine,location,origin.point,target.point,{eventId,signal:true});
 // Actual arrival at a physical feature/body supplies the existing contact
 // evidence. Retain its ten-minute lifetime and consumer validation verbatim.
 const minute=d.get('state','minute'),expires=minute+10,source=`physical_contact:${eventId}:${entity}`,point=[...target.point];
 const visibleFrom=d.get('state','location')===location?localPlayerPoint(d):point;
 const height=feature?.kind==='ledge'?{elevationMeters:(d.get('state','records',`physical_feature:${feature.id}`)?.state??feature.state)?.fallHeightMeters}:{};
 if(entity==='player'){
  d.set(['state','records','local_player_position'],{category:'local_position',subject:entity,location,point,source:eventId,minute,anchor:destination,...height});
  return {entity,target:destination,metres,minutes,mudMinutes,position:point,arrived:true};
 }
 d.set(['state','records',source],{category:'physical_contact',subject:entity,location,point,visibleFrom,event:eventId,minute,expires,activity:d.get('state','npcs',entity,'activity')??null});
 d.set(['state','records',`local_actor_position:${entity}`],{category:'local_position',subject:entity,location,point,source,minute,expires,anchor:destination,activity:d.get('state','npcs',entity,'activity')??null,...height});
 return {entity,target:destination,metres,minutes,mudMinutes,position:point,arrived:true};
}
