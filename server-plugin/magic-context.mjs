import{localWeather}from'./weather.mjs';
import{environmentFeatures,localSightClear}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {lightAt,shadowBound}from'./magic-light.mjs';
export function targetFacts(d,engine,target){
 if(target==='player')return{distanceMeters:0,lineOfSight:true};
 const p=d.get('state','records','local_player_position'),origin=p?.location===d.get('state','location')?p.point:[0,0];
 const actor=areaTargetFacts(d,engine,target,d.get('state','location'));
 if(actor)return{distanceMeters:Math.hypot(origin[0]-actor.point[0],origin[1]-actor.point[1]),lineOfSight:actor.lineOfSight&&localSightClear(d,engine,d.get('state','location'),origin,actor.point)};
 // Presence alone does not provide NPC coordinates or an occlusion map.
 const row=environmentFeatures(engine).find(x=>x.id===target&&x.location===d.get('state','location'));
 if(!row)return null;
 const point=p?.location===row.location?p.point:[0,0];
 if(!Array.isArray(point)||point.length!==2||point.some(x=>!Number.isFinite(x))||!Array.isArray(row.position)||row.position.some(x=>!Number.isFinite(x)))return null;
 const distanceMeters=Math.hypot(point[0]-row.position[0],point[1]-row.position[1]);
 return{distanceMeters,lineOfSight:distanceMeters===0?true:null};
}
export function statusContext(d,engine,target){
 const actor=target==='player'?d.get('state','player'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target);
 if(!actor||target!=='player'&&actor.location!==d.get('state','location'))return{};
 const weather=localWeather(engine,d.document);
 const eyesClosed=actor.hasVision===false||actor.eyesClosed===true||['死亡','濒死','昏迷'].includes(actor.status)||['睡眠','熟睡'].includes(actor.activity);
 // Coarse game visibility: dark terrain stays dark; clear outdoor nights are dim.
 // An unlit interior has no known illumination level.
 const facts=areaTargetFacts(d,engine,target,d.get('state','location'));
 const illumination=facts?lightAt(d,engine,d.get('state','location'),facts.point).illumination:undefined;
 return{eyesClosed,illumination,shadowBound:shadowBound(d,engine,target),...(weather?{raining:!weather.indoors&&['rain','storm'].includes(weather.kind)}:{raining:false}),moving:Boolean(actor.scheduleTravel||actor.cognitionTravel)};
}
export function visibilityPenalty(base,magic,context){
 return base<0&&context.illumination==='dim'?Math.min(0,base+(magic.nightVision??0)):base;
}
