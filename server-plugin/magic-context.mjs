import{localWeather}from'./weather.mjs';
import{magicIlluminates}from'./magic-status.mjs';
import{environmentFeatures}from'./environment.mjs';
export function targetFacts(d,engine,target){
 if(target==='player')return{distanceMeters:0,lineOfSight:true};
 // Presence alone does not provide NPC coordinates or an occlusion map.
 const row=environmentFeatures(engine).find(x=>x.id===target&&x.location===d.get('state','location'));
 if(!row)return null;
 const p=d.get('state','records','local_player_position'),point=p?.location===row.location?p.point:[0,0];
 if(!Array.isArray(point)||point.length!==2||point.some(x=>!Number.isFinite(x))||!Array.isArray(row.position)||row.position.some(x=>!Number.isFinite(x)))return null;
 const distanceMeters=Math.hypot(point[0]-row.position[0],point[1]-row.position[1]);
 return{distanceMeters,lineOfSight:distanceMeters===0?true:null};
}
export function statusContext(d,engine,target){
 const actor=target==='player'?d.get('state','player'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target);
 if(!actor||target!=='player'&&actor.location!==d.get('state','location'))return{};
 const weather=localWeather(engine,d.document),location=engine.byId.get(d.get('state','location'));
 const eyesClosed=['死亡','濒死','昏迷'].includes(actor.status)||['睡眠','熟睡'].includes(actor.activity);
 // Coarse game visibility: dark terrain stays dark; clear outdoor nights are dim.
 // An unlit interior has no known illumination level.
 const illumination=magicIlluminates(d)?'lit':location.combatTags?.includes('dark')?'dark':weather&&!weather.indoors?(weather.daylight?'lit':weather.kind==='clear'?'dim':'dark'):undefined;
 return{eyesClosed,illumination,...(weather?{raining:!weather.indoors&&['rain','storm'].includes(weather.kind)}:{}),moving:Boolean(actor.scheduleTravel||actor.cognitionTravel)};
}
export function visibilityPenalty(base,magic,context){
 return base<0&&context.illumination==='dim'?Math.min(0,base+(magic.nightVision??0)):base;
}
