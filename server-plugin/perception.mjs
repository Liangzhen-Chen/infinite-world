// Local perception uses the published zone graph. Fine points only adapt the
// existing optical/water spell geometry; they never replace ordinary distance.
import {placeLayout,zoneOf,destinationZone} from './place-layout.mjs';
import {environmentFeatures} from './environment-state.mjs';
import {weatherAt} from './weather.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {installEventPerception} from './world-events.mjs';

// Existing spell handlers register their optical/acoustic adapters once. The
// shared ontology and event store do not import a gameplay pack.
function runtime(){return runtime.handlers??={};}
export function installPerceptionRuntime(handlers){Object.assign(runtime(),handlers);}
installEventPerception(eventPerception);

function reader(document){return {document,get:(...p)=>p.reduce((v,k)=>v?.[k],document)};}
function body(document,id){return id==='player'?document.state.player:document.state.npcs?.[id]??document.state.creatures?.[id];}
function validPoint(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);}
export function perceptionPosition(engine,document,id,layout=placeLayout(engine,document)){
 const actor=body(document,id),s=document.state;
 if(actor){
  const zone=zoneOf(engine,document,id,layout);if(!zone)return null;
  const row=s.records?.[id==='player'?'local_player_position':`local_actor_position:${id}`];
  const current=row?.location===layout.location&&(id==='player'||row.activity===(actor.activity??null)&&s.minute<(row.until??row.expires??Infinity));
  return {zone,point:current&&validPoint(row.point)?row.point:zone.point,actor};
 }
 const unit=s.itemInstances?.[id],posted=unit?.document?.posted;
 if(posted&&unit.status==='落地'&&posted.location===layout.location){
  const zone=layout.zones.find(z=>z.id===posted.zone);
  if(zone)return {zone,point:validPoint(posted.point)?posted.point:zone.point,feature:unit};
 }
 const feature=environmentFeatures(engine,document,r=>r.id===id)[0];
 if(!feature||feature.location!==layout.location)return null;
 const zone=destinationZone(engine,document,id,layout);return zone?{zone,point:feature.position,feature}:null;
}
function barrierState(engine,document,edge){
 const row=edge.barrier&&environmentFeatures(engine,document,r=>r.id===edge.barrier)[0];
 return row?(document.state.records?.[`physical_feature:${row.id}`]?.state??row.state):null;
}
// Every edge on a visible path must pass sight. Sound pays the accumulated
// attenuation on its path, including closed barriers.
function pathCost(engine,document,layout,from,to,channel){
 const costs=new Map([[from,0]]),pending=new Set([from]);
 while(pending.size){
  const id=[...pending].sort((a,b)=>costs.get(a)-costs.get(b)||a.localeCompare(b))[0];pending.delete(id);
  if(id===to)return costs.get(id);
  for(const edge of layout.edges){
   const next=edge.from===id?edge.to:edge.to===id?edge.from:null;if(!next)continue;
   const state=barrierState(engine,document,edge),closed=state?.open===false;
   if(channel==='vision'&&(edge.blocksSight||state?.blocksSight||state?.blocksSpace||closed))continue;
   const cost=channel==='vision'?edge.metres:edge.metres+(edge.soundLoss??0)+(state?.soundLoss??(closed?20:0));
   if(!Number.isFinite(cost)||cost<0)continue;
   const value=costs.get(id)+cost;if(value>=(costs.get(next)??Infinity))continue;
   costs.set(next,value);pending.add(next);
  }
 }
 return Infinity;
}
export function perceives(engine,document,observer,event,{layout=placeLayout(engine,document,event.location??document.state.location)}={}){
 const raw=body(document,observer),who=raw&&{...engine.byId.get(observer),...raw},origin=perceptionPosition(engine,document,observer,layout);
 const empty={visual:false,auditory:false,tactile:false,identified:false,complete:false};
 if(!who||!origin||isPhysicallyDead(engine,document,observer)||['濒死','昏迷'].includes(who.status)||/(睡眠|熟睡|睡觉)/.test(who.activity??'')||runtime().mindSleepUntil?.(reader(document),observer,document.state.minute)>document.state.minute)return empty;
 const source=event.actor??event.subject??event.target,at=perceptionPosition(engine,document,source,layout);
 if(!at||event.location&&event.location!==layout.location)return empty;
 const d=reader(document),from=origin.point,to=at.point,geometry=validPoint(from)&&validPoint(to);
 const metres=pathCost(engine,document,layout,origin.zone.id,at.zone.id,'vision');
 const weather=engine.rules?.weather?weatherAt(engine,document.randomSeed,layout.location,document.state.minute,null,document.state.records?.['calendar:active']?.calendar??engine.calendarId):null;
 const light=geometry?runtime().lightAt?.(d,engine,layout.location,to):null;
 // Unspecified interior lighting retains ordinary daytime visibility. Explicit
 // darkness and active optical effects always win over that fallback.
 const illumination=light?.illumination??(weather?.daylight===false?'dark':'lit');
 // The design's 30 m example is not a universal sight radius. Published sense
 // limits apply when present; light sources and weather supply the other bounds.
 const range=illumination==='dark'?0:who.sightRangeMeters??Infinity;
 const form={...engine.byId.get(source),...(at.actor??at.feature??{})},invisible=form.invisible===true||form.visible===false||form.hidden===true||form.private===true||form.form==='intangible';
 const visual=who.hasVision!==false&&!who.eyesClosed&&!invisible&&metres<=range&&range>0&&(!geometry||runtime().localSightClear?.(d,engine,layout.location,from,to)!==false);
 const volume=event.volume??(event.verb==='harm'||event.verb==='clash'?40:event.verb==='steal'?5:20);
 const soundDistance=pathCost(engine,document,layout,origin.zone.id,at.zone.id,'sound');
 const silence=Object.values(document.state.effects??{}).filter(e=>e.kind==='air'&&e.operation==='quiet'&&e.location===layout.location&&e.started<=document.state.minute&&e.expires>document.state.minute&&destinationZone(engine,document,e.target,layout)?.id===origin.zone.id).reduce((n,e)=>Math.max(n,e.power??0),0);
 const loss=geometry?(runtime().waterEarthSoundLoss?.(d,layout.location,from,to)??0):0;
 const noise=engine.byId.get(layout.location)?.noise??0;
 const auditory=who.hasHearing!==false&&volume>0&&volume-soundDistance-loss-silence-noise>(who.hearingThreshold??0);
 // Contact is an established physical fact, never inferred from co-location.
 const contact=document.state.records?.[`local_actor_position:${observer}`];
 const proof=contact?.source&&document.state.records?.[contact.source];
 const tactile=who.hasTouch!==false&&event.target===observer&&origin.zone.id===at.zone.id&&geometry&&from.every((n,i)=>n===to[i])&&proof?.category==='physical_contact'&&contact.source===`physical_contact:${proof.event}:${observer}`&&proof.subject===observer&&proof.location===layout.location&&proof.activity===(who.activity??null)&&proof.minute<=document.state.minute&&proof.expires===proof.minute+10&&proof.expires>document.state.minute&&validPoint(proof.point)&&proof.point.every((n,i)=>n===from[i]);
 return {visual,auditory,tactile,identified:visual||tactile,complete:visual||tactile,zone:origin.zone.id,sourceZone:at.zone.id,distanceMeters:Number.isFinite(metres)?metres:null};
}
export function eventPerception(engine,document,event,{exclude=[]}={}){
 const layout=placeLayout(engine,document,event.location??document.state.location),versions={};
 const candidates=[...(document.state.location===layout.location?['player']:[]),...Object.entries(document.state.npcs??{}).filter(([,n])=>n.location===layout.location).map(([id])=>id),...Object.entries(document.state.creatures??{}).filter(([,n])=>n.location===layout.location).map(([id])=>id)];
 for(const id of candidates.sort()){
  if(exclude.includes(id))continue;
  const version=perceives(engine,document,id,event,{layout});
  if(version.visual||version.auditory||version.tactile)versions[id]=version;
 }
 return {version:1,minute:document.state.minute,location:layout.location,sourceZone:perceptionPosition(engine,document,event.actor??event.subject??event.target,layout)?.zone.id??null,versions};
}
export function visibleEntity(engine,document,target,observer='player'){
 return perceives(engine,document,observer,{actor:target,location:document.state.location,volume:0}).visual;
}
// A visible zone supplies a ranged/observational measurement, never contact or
// the exact point required by a radius spell. Walking up supplies that proof.
export function perceptionTargetFacts(engine,document,observer,target){
 if(engine.replaying&&engine.replayResult?.perceptionVersion!==1)return null;
 const p=perceives(engine,document,observer,{actor:target,location:document.state.location,volume:0});
 if(p.distanceMeters===undefined)return null;
 if(p.distanceMeters===null)return {distanceMeters:Infinity,lineOfSight:false};
 return {distanceMeters:Math.max(placeLayout(engine,document).approachMetres,p.distanceMeters),lineOfSight:p.visual};
}
export function localSounds(engine,document,observer='player'){
 const sounds=[];
 for(const r of Object.values(document.state.records??{})){
  if(r.category!=='knowledge'||r.kind!=='sound'||r.observer!==observer||r.location!==document.state.location||r.minute>document.state.minute||document.state.minute-r.minute>10)continue;
  if(!sounds.some(s=>s.zone===r.zone))sounds.push({zone:r.zone,text:r.content});
 }
 return sounds;
}
