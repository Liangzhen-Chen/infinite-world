// Native local walking uses the same physical paths and position evidence as
// environment/contact actions. Co-presence alone does not invent a coordinate.
import {isPhysicallyDead} from './holdings.mjs';
import {reject} from './primitive-policy.mjs';
import {recordsWhere} from './storage.mjs';
import {prunePhysicalContacts} from './record-cleanup.mjs';
import {placeLayout,zoneOf,destinationZone,localRoute,edgeOpen} from './place-layout.mjs';
import {isDomainRejection} from './action-rejection.mjs';
import {perceptionPosition,perceives} from './perception.mjs';
import {hypot} from './det-math.mjs';

export function moveLocally(d,engine,{entity,destination,mode},eventId,{environmentFeatures,localPlayerPoint,areaTargetFacts,recordLocalContact,assertMindAwake,assertMindSpacePath,assertWaterEarthMovement,waterEarthWalkMinutes,assertLightMovement,assertFirePath,preparePetTravel,movePets,scheduleAt}){
 const partition=d.get('state','npcs',entity)?'npcs':'creatures',body=entity==='player'?d.get('state','player'):d.get('state',partition,entity),feature=environmentFeatures(engine,d.document).find(row=>row.id===destination);
 const agent=destination==='player'||d.get('state','npcs',destination)||d.get('state','creatures',destination);
 const location=entity==='player'?d.get('state','location'):body?.location;
 const layout=placeLayout(engine,d.document,location),zone=layout.zones.find(z=>z.id===destination);
 if(!feature&&!agent&&!zone)return null;
 if(mode!=='walk'&&(mode!=='horse'||entity!=='player'&&partition!=='npcs'))reject('E-MOVE-MODE','Local approach requires walking or an actual rider and mount');
 if(!body||!location||body.scheduleTravel||body.cognitionTravel)reject('E-MOVE-ORIGIN','Actor is missing or already travelling');
 if(recordsWhere(d.peek?d.peek('state','records'):d.get('state','records'),'category','transport').some(r=>['booked','moving','delayed','intercepted'].includes(r.status)&&r.passengers?.includes(entity)))reject('E-MOVE-ORIGIN','Actor is aboard an active transport');
 const currentZone=zoneOf(engine,d.document,entity,layout);
 const priorPosition=d.get('state','records',entity==='player'?'local_player_position':`local_actor_position:${entity}`);
 const knownZoneMove=priorPosition?.location===location&&priorPosition.zone===currentZone?.id&&typeof priorPosition.source==='string';
 // A visible actor has a real zone position before the first contact. Walking
 // to it creates contact; requiring contact here made that first approach impossible.
 const actorPosition=()=>areaTargetFacts(d,engine,destination,location)??(perceives(engine,d.document,entity,{actor:destination,location,volume:0},{layout}).visual?perceptionPosition(engine,d.document,destination,layout):null);
 const origin=areaTargetFacts(d,engine,entity,location)??((zone||knownZoneMove)&&currentZone?.point?{point:currentZone.point}:null),target=zone?{point:zone.point??origin?.point}:feature?.location===location?{point:feature.position}:agent?actorPosition():null;
 if(!origin||!target||!Array.isArray(target.point)||target.point.length!==2||!target.point.every(Number.isFinite))reject('E-MOVE-POSITION','Local movement requires actual origin and destination positions in the same node');
 assertMindAwake(d,entity);assertWaterEarthMovement(d,entity);assertLightMovement(d,engine,entity);
 const endZone=zone??destinationZone(engine,d.document,destination,layout)??(agent?zoneOf(engine,d.document,destination,layout):null);
 const zonePoint=id=>layout.zones.find(z=>z.id===id)?.point;
 const checkPath=(from,to,signal=false)=>{assertMindSpacePath(d,engine,location,from,to,{eventId,signal});assertFirePath(d,engine,from,to,location);};
 let pathFailure;
 const canCross=segment=>{try{const from=zonePoint(segment.from),to=zonePoint(segment.to);if(from&&to)checkPath(from,to);return true;}catch(error){if(!isDomainRejection(error))throw error;pathFailure=error;return false;}};
 const route=currentZone&&endZone?localRoute(engine,d.document,currentZone.id,endZone.id,{layout,canCross}):null;
 if(currentZone&&endZone&&!route)reject('E-MOVE-PATH',pathFailure?.message??'分区之间没有可通行的邻接路径');
 const finalOrigin=endZone?.point??origin.point;
 if(!zone)checkPath(route?finalOrigin:origin.point,target.point);
 const view={get:(...p)=>p.length===2&&p[0]==='state'&&p[1]==='location'?location:d.get(...p)};
 const approachMetres=zone||knownZoneMove&&!priorPosition.zoneOnly&&priorPosition.anchor===destination?0:layout.approachMetres;
 const metres=route?(route.metres+approachMetres):hypot(target.point[0]-origin.point[0],target.point[1]-origin.point[1]),speed=engine.rules.environment?.walkingMetresPerMinute*(mode==='horse'?engine.rules.travel.horseMultiplier:1);
 if(!Number.isFinite(speed)||speed<=0)reject('E-MOVE-SPEED','Local walking speed is missing');
 const segments=route?.segments??[],segmentMud=segments.map(s=>waterEarthWalkMinutes(view,engine,zonePoint(s.from)??origin.point,zonePoint(s.to)??origin.point));
 const mudMinutes=segmentMud.reduce((n,m)=>n+m,0)+(zone?0:waterEarthWalkMinutes(view,engine,route?finalOrigin:origin.point,target.point));
 const minutes=(route?segments.reduce((n,s)=>n+Math.ceil(s.metres/speed),0)+Math.ceil(approachMetres/speed):Math.ceil(metres/speed))+mudMinutes;
 if(entity==='player'||partition==='npcs'){
  try{preparePetTravel(d,engine,mode,minutes,entity);}catch(error){reject('E-MOVE-MOUNT',error.message);}
 }
 const mount=mode==='horse'?body.mount:null;
 if(mount){
  assertMindAwake(d,mount);assertWaterEarthMovement(d,mount);assertLightMovement(d,engine,mount);
  const actual=areaTargetFacts(d,engine,mount,location);
  if(actual?.point.some((n,i)=>n!==origin.point[i]))reject('E-MOVE-MOUNT','The mount is not at the rider position');
 }
 engine.assertNpcObligationAction(d,[entity],{minutes,location,kind:'move'});
 engine.assertNpcAutonomyAction(d.get('state'),[entity],{minutes});
 const previous=engine.npcScheduleReservations;
 engine.npcScheduleReservations=new Set([...previous??[],entity]);
 if(mount)movePets(d,engine,location,location,minutes,entity);
 let elapsed=0,interrupted=false;
 const standingExpiry=subject=>{const until=scheduleAt?.(engine,subject,d.get('state','minute'),d.get('state'))?.until;return Number.isSafeInteger(until)?{until}:{};};
 const storeZone=(id,subject=entity)=>{
  const z=layout.zones.find(z=>z.id===id),p=z?.point??origin.point,minute=d.get('state','minute');
  const record={category:'local_position',subject,location,point:[...p],zone:id,zoneOnly:true,source:eventId,minute,activity:d.get('state',d.get('state','npcs',subject)?'npcs':'creatures',subject,'activity')??null,...(subject!=='player'?standingExpiry(subject):{})};
  d.set(['state','records',subject==='player'?'local_player_position':`local_actor_position:${subject}`],record);
 };
 try{
  for(const [index,segment] of segments.entries()){
   if(!edgeOpen(engine,d.document,segment)||!canCross(segment)){interrupted=true;break;}
   const from=zonePoint(segment.from)??origin.point,to=zonePoint(segment.to)??from;
   const duration=Math.ceil(segment.metres/speed)+segmentMud[index];
   engine.advance(d,duration,eventId);elapsed+=duration;
   if((entity==='player'?d.get('state','location'):d.get('state',partition,entity,'location'))!==location||isPhysicallyDead(engine,d,entity)||entity==='player'&&d.get('state','player','status')!=='正常'||!edgeOpen(engine,d.document,segment)||!canCross(segment)){interrupted=true;break;}
   checkPath(from,to,true);storeZone(segment.to);if(mount)storeZone(segment.to,mount);
  }
  if(!interrupted){engine.advance(d,minutes-elapsed,eventId);elapsed=minutes;}
 }finally{engine.npcScheduleReservations=previous;}
 if(interrupted)return {entity,target:destination,metres,minutes:elapsed,mudMinutes,arrived:false,path:route?.zones};
 const place=entity==='player'?d.get('state','location'):d.get('state',partition,entity,'location');
 if(place!==location||isPhysicallyDead(engine,d,entity)||entity==='player'&&d.get('state','player','status')!=='正常')return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};
 if(mount&&(isPhysicallyDead(engine,d,mount)||d.get('state','creatures',mount,'location')!==location||d.get('state','creatures',mount,'owner')!==entity))return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};
 if(agent){const current=actorPosition();if(!current||!Array.isArray(current.point)||current.point.some((n,i)=>n!==target.point[i]))return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};}
 if(feature){const current=environmentFeatures(engine,d.document,r=>r.id===destination)[0];if(!current||current.location!==location||current.position?.some((n,i)=>n!==target.point[i]))return {entity,target:destination,metres,minutes,mudMinutes,arrived:false};}
 if(zone){storeZone(zone.id);if(mount)storeZone(zone.id,mount);return {entity,target:destination,zone:zone.id,metres,minutes,mudMinutes,arrived:true,path:route.zones};}
 checkPath(route?finalOrigin:origin.point,target.point,true);
 // Actual arrival at a physical feature/body supplies the existing contact
 // evidence. Retain its ten-minute lifetime and consumer validation verbatim.
 const minute=d.get('state','minute'),expires=minute+10,point=[...target.point];
 const visibleFrom=d.get('state','location')===location?localPlayerPoint(d):point;
 const height=feature?.kind==='ledge'?{elevationMeters:(d.get('state','records',`physical_feature:${feature.id}`)?.state??feature.state)?.fallHeightMeters}:{};
 const storePosition=(subject,activity)=>{
  const proof=`physical_contact:${eventId}:${subject}`;
  d.set(['state','records',proof],{category:'physical_contact',subject,location,point,visibleFrom,event:eventId,minute,expires,activity});
  prunePhysicalContacts(d);
  d.set(['state','records',`local_actor_position:${subject}`],{category:'local_position',subject,location,point,source:proof,minute,expires,anchor:destination,activity,...(endZone?{zone:endZone.id,...standingExpiry(subject)}:{}),...height});
 };
 if(mount)storePosition(mount,d.get('state','creatures',mount,'activity')??null);
 if(entity==='player'){
  d.set(['state','records','local_player_position'],{category:'local_position',subject:entity,location,point,source:eventId,minute,anchor:destination,...(endZone?{zone:endZone.id}:{}),...height});
  if(agent&&destination!=='player')recordLocalContact(d,engine,destination,eventId);
  return {entity,target:destination,metres,minutes,mudMinutes,position:point,arrived:true};
 }
 storePosition(entity,d.get('state',partition,entity,'activity')??null);
 return {entity,target:destination,metres,minutes,mudMinutes,position:point,arrived:true};
}
