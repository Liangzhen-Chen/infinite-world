import {preconditionFailure} from './precondition.mjs';
import {noteUnlicensedUse} from './offense-notes.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {facilityRuntime,isFacility} from './facility-state.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,featureRecordMatches,localPlayerPoint,localSightClear}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {assertMagicTargeting}from'./magic-targeting.mjs';
import {heldUnit,trackSingleItem}from'./items.mjs';
import {weatherAt}from'./weather.mjs';
import {modelToolCall}from'../extension/tools.mjs';
import {hypot,sqrt,exp} from './det-math.mjs';

// Fixed bounds for authoring candidates; this module publishes no world content.
export const lightMechanisms=Object.freeze({
 focus_light:[80,30],reveal_wear:[1,0],reflect:[50,30],color:[1,0],shadow_measure:[1,0],
 light_screen:[1,10],waymark:[1,90],trace:[1440,0],fog_light:[2,30],reveal:[1,0],
 dim:[90,30],privacy:[1,30],bind_shadow:[1,2],decoy:[3,1],dark_area:[90,10],
});
const clone=x=>structuredClone(x),distance=(a,b)=>hypot(a[0]-b[0],a[1]-b[1]);
const active=(d,op)=>Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='optics'&&(!op||e.operation===op)&&e.started<=d.get('state','minute')&&e.expires>d.get('state','minute'));
const numeric=(v,min,max,name)=>{if(!Number.isFinite(v)||v<min||v>max)throw preconditionFailure(`${name}无效`);return v;};
const stateOf=(d,row)=>{
 const r=d.get('state','records',`physical_feature:${row.id}`);
 if(r&&!featureRecordMatches(d,r,row))throw Error('光学对象状态键冲突');
 return clone(r?.state??row.state??{});
};
const store=(d,row,state)=>d.set(['state','records',`physical_feature:${row.id}`],{category:'physical_feature',id:row.id,location:row.location,state});
function locate(engine,id,location){
 const rows=environmentFeatures(engine).filter(r=>r.location===location&&(r.id===id||r.name===id));
 if(rows.length!==1)throw preconditionFailure('需要同地登记的真实光学对象');return rows[0];
}
function permission(d,engine,row,args){
 if(row.owner==='player'||row.access==='public')return;
 const ids=[args.authorization,...args.authorizations??[]];
 if(!ids.some(id=>{
  const r=d.get('state','records',id);return r?.category==='authorization'&&r.subject===row.id&&r.action==='environment_use'&&r.grantor===row.owner&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>d.get('state','minute')&&(!row.owner?.startsWith('npc_')||!isPhysicallyDead(engine,d,row.owner)&&d.get('state','npcs',row.owner,'status')!=='濒死');
 }))noteUnlicensedUse(d,row);
}
function access(d,engine,row,args,range,read=false){
 if(distance(localPlayerPoint(d),row.position)>range||!localSightClear(d,engine,row.location,localPlayerPoint(d),row.position))throw preconditionFailure('光学对象超过实际距离或视线被遮挡');
 if(!read)permission(d,engine,row,args);
}
function touches(point,radius,from,to){
 const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((point[0]-from[0])*dx+(point[1]-from[1])*dy)/length)):0;
 return distance(point,[from[0]+dx*t,from[1]+dy*t])<=radius;
}
export function opticalSightClear(d,engine,location,from,to){
 for(const [,e]of active(d)){
  if(e.location!==location||!['light_screen','privacy'].includes(e.operation))continue;
  const row=locate(engine,e.target,location),s=stateOf(d,row);
  if(e.operation==='privacy'&&(s.open||s.apertureMeters>.1))continue;
  if(e.operation==='light_screen'&&(from[0]-e.point[0])*e.side[0]+(from[1]-e.point[1])*e.side[1]<0)continue;
  if(touches(e.point,e.radius,from,to))return false;
 }
 return true;
}
function lighting(d,engine,location,{ambientLight=true}={}){
 const place=engine.byId.get(location),weather=weatherAt(engine,d.get('randomSeed'),location,d.get('state','minute'));
 const explicit=place?.lighting;
 // Ordinary indoor activity includes tending the room's lights. Explicit
 // lighting and actual lamps override this derived fallback, including lamps
 // that have been extinguished. Merely entering an empty room creates no lamp.
 const indoor=weather?.indoors||isFacility(place);
 const ordinaryNeeded=ambientLight&&indoor&&explicit?.ambientLux===undefined&&!place?.combatTags?.includes('dark');
 const lamps=ordinaryNeeded?environmentFeatures(engine,d.document,r=>r.location===location).filter(r=>r.kind==='lamp'||stateOf(d,r).emissionLuxAt1m!==undefined):[];
 const occupied=ordinaryNeeded&&!lamps.length&&Object.entries(d.get('state','npcs')??{}).some(([id,n])=>{
  if(n.location!==location||n.scheduleTravel||n.cognitionTravel||isPhysicallyDead(engine,d,id)||
   ['睡眠','濒死','昏迷'].includes(n.status))return false;
  const slot=facilityRuntime().scheduleAt?.(engine,id,d.get('state','minute'),d.get('state'));
  const activity=slot?.location===location?slot.activity:n.activity;
  return typeof activity==='string'&&Boolean(activity.trim())&&!/睡眠|熟睡|睡觉|熄灯/.test(activity);
 });
 const ordinary=occupied?engine.rules.environment?.occupiedIndoorAmbientLux:undefined;
 const ambient=explicit?.ambientLux??(place?.combatTags?.includes('dark')?0:indoor?ordinary:weather?(weather.daylight?100:weather.kind==='clear'?.2:0):undefined);
 const fog=explicit?.fogDensity??(weather&&!weather.indoors&&weather.kind==='fog'?1:0);
 if(ambient!==undefined)numeric(ambient,0,100000,'环境光照');numeric(fog,0,10,'雾密度');
 return{ambient,fog};
}
function lightOrigin(d,e){
 if(e.owner!=='player'||e.covered||e.expires<=d.get('state','minute'))return null;
 if(e.target!=='player'){
  if((d.get('state','inventory',e.target,'quantity')??0)<1)return null;
  if(e.targetInstance&&(d.get('state','itemInstances',e.targetInstance,'owner')!=='player'||d.get('state','itemInstances',e.targetInstance,'status')!=='持有'))return null;
 }
 return{point:localPlayerPoint(d),location:d.get('state','location'),lux:e.power*10,height:1.5};
}
function source(d,engine,id,location){
 const e=d.get('state','effects',id);
 if(e?.kind==='light'){
  const o=lightOrigin(d,e);if(!o||o.location!==location)throw preconditionFailure('光源已经遮挡、熄灭或离开');return{...o,id};
 }
 const row=locate(engine,id,location),s=stateOf(d,row);
 if(s.covered||s.lit===false)throw preconditionFailure('光源已遮挡或熄灭');
 numeric(s.emissionLuxAt1m,.01,100000,'实际光源强度');
 return{id:row.id,row,point:row.position,location,lux:s.emissionLuxAt1m,height:s.heightMeters};
}
const dimFactor=(d,id)=>1-active(d,'dim').filter(([,e])=>e.target===id).reduce((p,[,e])=>Math.max(p,e.power),0)/100;
function sources(d,engine,location){
 const out=[];
 for(const row of environmentFeatures(engine).filter(r=>r.location===location)){
  const s=stateOf(d,row);if(s.emissionLuxAt1m>0&&!s.covered&&s.lit!==false)out.push({id:row.id,point:row.position,lux:s.emissionLuxAt1m,height:s.heightMeters,location});
 }
 for(const [id,e]of Object.entries(d.get('state','effects')??{})){
  if(e.kind==='light'){const o=lightOrigin(d,e);if(o?.location===location)out.push({...o,id});}
  if(e.kind==='summon'&&e.summonType==='fire_projection'&&e.owner==='player'&&e.location===location&&e.expires>d.get('state','minute'))out.push({id,point:localPlayerPoint(d),lux:20,location});
 }
 for(const [id,e]of active(d,'fog_light'))if(e.location===location)out.push({id,point:e.point,lux:e.power*10,location});
 for(const [id,e]of active(d,'waymark'))if(e.location===location)out.push({id,point:e.point,lux:1,location});
 return out;
}
const clearRay=(d,engine,location,from,to)=>localSightClear(d,engine,location,from,to,{optical:false,fog:false});
export function lightAt(d,engine,location,point){
 const {ambient,fog}=lighting(d,engine,location);let lux=ambient??0;
 const redirect=active(d).filter(([,e])=>e.location===location&&['focus_light','reflect'].includes(e.operation));
 for(const s of sources(d,engine,location)){
  const redirected=redirect.filter(([,e])=>e.medium===s.id).reduce((p,[,e])=>Math.max(p,e.power),0)/100;
  const metres=distance(s.point,point);
  if(clearRay(d,engine,location,s.point,point)&&opticalSightClear(d,engine,location,s.point,point))lux+=s.lux*dimFactor(d,s.id)*(1-redirected)/(1+metres*metres)*exp(-fog*metres/10);
 }
 for(const [,e]of redirect){
  let s;try{s=source(d,engine,e.medium,location);}catch{continue;}
  if(!clearRay(d,engine,location,s.point,e.point)||!opticalSightClear(d,engine,location,s.point,e.point))continue;
  const target=locate(engine,e.target,location),ts=stateOf(d,target);
  if(e.operation==='reflect'&&ts.reflectivityPercent<=0)continue;
  if(e.operation==='reflect'&&distance(point,e.observerPoint)>1)continue;
  const metres=distance(e.point,point);
  if(e.operation==='focus_light'&&metres>sqrt(e.beamAreaM2/Math.PI))continue;
  if(clearRay(d,engine,location,e.point,point)&&opticalSightClear(d,engine,location,e.point,point))lux+=s.lux*dimFactor(d,s.id)*e.power/100/(e.beamAreaM2??1)/(1+distance(s.point,e.point)**2)/(1+metres*metres)*exp(-fog*(metres+distance(s.point,e.point))/10);
 }
 const dark=active(d,'dark_area').filter(([,e])=>e.location===location&&distance(e.point,point)<=e.radius).reduce((p,[,e])=>Math.max(p,e.power),0);
 lux*=1-dark/100;
 return{lux,illumination:lux>=1?'lit':lux>0?'dim':ambient===undefined&&!sources(d,engine,location).length?undefined:'dark',fogDensity:fog};
}
export function opticalVisibility(d,engine,location,from,to){
 const fog=lighting(d,engine,location,{ambientLight:false}).fog;
 if(!fog)return true;
 // A fog lamp improves a thin local patch; dense fog keeps a finite upper bound.
 const lamp=active(d,'fog_light').some(([,e])=>e.location===location&&distance(e.point,from)<=3);
 const limit=Math.min(100,(lamp?20:10)/fog);
 return distance(from,to)<=limit;
}
export function validateLightCatalog(c){
 const s=c.effectSpec,errors=[];
 if(s.kind==='light'){
  if(s.power>100)errors.push('手持光源强度超限');return errors;
 }
 const m=lightMechanisms[s.operation];if(!m)return['光学机制尚未接入'];
 if(c.mechanism!==s.operation||s.power>m[0]||c.duration!==m[1])errors.push('光学机制、强度或期限越过固定边界');
 if(!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>40)errors.push('光学射程无效');
 if(['bind_shadow','decoy','reveal'].includes(s.operation)&&c.targeting?.lineOfSight!==true)errors.push('活体光学效果须声明真实视线边界');
 return errors;
}
export function prepareLight(d,c,args){
 const target=args.target??'player';
 if(target==='player'){
  if(d.get('state','player','status')!=='正常')throw preconditionFailure('掌心光源需要清醒持有者');
  return{target,catalog:c,spec:c.effectSpec,args:clone(args)};
 }
 const id=this.resolve(target,'item');
 if(this.quantity(d,'player',id)!==1)throw preconditionFailure('光源需要实际持有的单件物品');
 heldUnit(d,this,'player',id);return{target:id,catalog:c,spec:c.effectSpec,args:{...clone(args),target:id}};
}
export function applyLight(d,p,id){
 try{p=prepareLight.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 const expires=d.get('state','minute')+p.catalog.duration;
 d.set(['state','effects',id],{kind:'light',target:p.target,power:p.spec.power,owner:'player',source:id,spell:p.catalog.id,expires,covered:false,...(p.target==='player'?{}:{targetInstance:trackSingleItem(d,this,'player',p.target,id)})});
 return{target:p.target,effect:id,expires,illuminated:true,controls:lightControls(id,['遮光','复光','熄灭'])};
}
function lightControls(target,texts){return texts.map(text=>modelToolCall('world_environment',{operation:'inspect',target,text}));}
const lightCommands=Object.freeze({'遮光':'cover_light','复光':'uncover_light','熄灭':'extinguish_light','开门':'open_aperture','关门':'close_aperture'});
export function normalLightAction(d,args){
 if((args.operation??'inspect')!=='inspect')return null;
 const effect=d.get('state','effects',args.target);
 if(effect?.kind==='light'){
  if(args.text&&lightCommands[args.text])return lightEnvironmentAction.call(this,d,{...args,operation:lightCommands[args.text]});
  const held=Boolean(lightOrigin(d,{...effect,covered:false}));
  return{target:args.target,held,covered:Boolean(effect.covered),expires:effect.expires,controls:held?lightControls(args.target,['遮光','复光','熄灭']):[],actionScope:{kind:'instant',instantaneous:true}};
 }
 if(args.text&&lightCommands[args.text])return lightEnvironmentAction.call(this,d,{...args,operation:lightCommands[args.text]});
 if(this.world.routes.some(r=>r.id===args.target))return lightEnvironmentAction.call(this,d,{...args,operation:'inspect_light'});
 return null;
}
const readOps=new Set(['reveal_wear','color','shadow_measure','trace']);
export function prepareOptics(d,c,args){
 const op=c.effectSpec.operation,location=d.get('state','location'),p={catalog:c,spec:c.effectSpec,args:clone(args),location};
 if(op==='dim'&&d.get('state','effects',args.target,'kind')==='light'){
  p.target=args.target;p.source=source(d,this,args.target,location);p.point=p.source.point;return p;
 }
 if(['bind_shadow','decoy','reveal'].includes(op)){
  p.target=args.target??'player';p.facts=areaTargetFacts(d,this,p.target,location);
  if(!p.facts)throw preconditionFailure('缺少真实在场目标位置');assertMagicTargeting(d,this,c,args,p.target);
  p.point=p.facts.point;
  if(op==='bind_shadow'){
   const l=lightAt(d,this,location,p.point);if(l.illumination!=='dim')throw preconditionFailure('阴影束缚需要实际微光阴影');
  }
  if(op==='decoy'){
   p.observer=args.destination;if(!p.observer||p.observer===p.target)throw preconditionFailure('分影需要另一名实际观察者');
   const f=areaTargetFacts(d,this,p.observer,location);
   if(!f||!f.lineOfSight||distance(f.point,p.point)>c.rangeMeters||distance(f.point,localPlayerPoint(d))>c.rangeMeters||!localSightClear(d,this,location,localPlayerPoint(d),f.point)||!localSightClear(d,this,location,f.point,p.point)||lightAt(d,this,location,p.point).lux<=0)throw preconditionFailure('分影观察者缺少有效视觉光路');
   const actor=d.get('state',p.observer.startsWith('npc_')?'npcs':'creatures',p.observer);
   if(actor.hasVision===false||actor.eyesClosed||['睡眠','熟睡','昏迷'].includes(actor.activity)||['昏迷','濒死'].includes(actor.status))throw preconditionFailure('闭眼或无视觉者不受分影干扰');
  }
  return p;
 }
 if(op==='waymark'){
  const route=this.world.routes.find(r=>r.id===args.target);
  if(!route||![route.from,route.to].includes(location)||!d.get('state','discoveries',route.from)||!d.get('state','discoveries',route.to))throw preconditionFailure('光标只能标记已亲历两端的实际路线');
  // Reuse the normal route resolver; markers never grant access or reveal routes.
  const destination=route.from===location?route.to:route.from;
  const usable=this.route(location,destination,'walk',d.get('state','minute'),d.get('randomSeed'));
  if(!usable.edges.includes(route.id))throw preconditionFailure('指定路线当前不可通行');
  return{...p,target:route.id,route:clone(route),point:localPlayerPoint(d)};
 }
 p.row=locate(this,args.target,location);p.target=p.row.id;p.point=p.row.position;
 access(d,this,p.row,args,c.rangeMeters,readOps.has(op));const s=stateOf(d,p.row);
 if(readOps.has(op)&&lightAt(d,this,location,p.point).lux<=0)throw preconditionFailure('完全无光不能读取表面证据');
 if(op==='color'){
  if(p.row.kind!=='sample'||!['mineral','dye'].includes(s.sampleType)||!(s.sampleGrams>0)||!Array.isArray(s.spectrum)||!s.spectrum.length||s.spectrum.some(x=>!Number.isFinite(x.wavelengthNm)||x.wavelengthNm<380||x.wavelengthNm>780||!Number.isFinite(x.reflectance)||x.reflectance<0||x.reflectance>1))throw preconditionFailure('辨色需要真实矿物或染料样品光谱');
 }
 if(op==='reveal_wear'&&!Array.isArray(s.wear))throw preconditionFailure('材料缺少真实表面磨损记录');
 if(op==='trace'&&!Array.isArray(s.traces))throw preconditionFailure('材料缺少真实表面痕迹记录');
 if(['focus_light','reflect','shadow_measure'].includes(op)){
  p.source=source(d,this,args.source,location);
  if(p.source.row)access(d,this,p.source.row,args,c.rangeMeters,op==='shadow_measure');
  else if(op!=='shadow_measure')noteUnlicensedUse(d,{id:p.source.id,owner:d.get('state','effects',p.source.id,'owner')},{kind:'light'});
  if(!localSightClear(d,this,location,p.source.point,p.point))throw preconditionFailure('已有光源到表面的光路被遮挡');
  if(['focus_light','reflect'].includes(op)&&active(d).some(([,e])=>e.medium===p.source.id&&['focus_light','reflect'].includes(e.operation)))throw preconditionFailure('光源已有分光，不能重复放大');
 }
 if(op==='reflect'){
  numeric(s.reflectivityPercent,1,100,'表面反射率');numeric(s.reflectionAreaM2,.1,1,'有限反射面积');p.observer=locate(this,args.destination,location);access(d,this,p.observer,args,c.rangeMeters,true);
  if(!localSightClear(d,this,location,p.point,p.observer.position))throw preconditionFailure('反射方向被遮挡');
 }
 if(op==='focus_light')numeric(s.focusAreaM2,.1,1,'聚光表面面积');
 if(op==='shadow_measure'){
  if(p.row.kind!=='surface')throw preconditionFailure('投影需要真实墙面或测量表面');
  p.sample=locate(this,args.destination,location);access(d,this,p.sample,args,c.rangeMeters,true);const sample=stateOf(d,p.sample);
  numeric(sample.heightMeters,.01,10,'被测物高度');numeric(p.source.height,sample.heightMeters+.01,20,'光源高度');
  if(!localSightClear(d,this,location,p.source.point,p.sample.position)||!localSightClear(d,this,location,p.sample.position,p.point))throw preconditionFailure('投影光路被遮挡');
 }
 if(['light_screen','privacy'].includes(op)){
  if(!['passage','aperture'].includes(p.row.kind))throw preconditionFailure('遮光需要真实通道或缝隙');numeric(s.widthMeters,.01,2,'遮光宽度');
  if(op==='privacy'){numeric(s.apertureMeters,.001,.1,'私密缝隙');if(s.open!==false)throw preconditionFailure('私密遮光只能覆盖闭合的小缝隙');}
 }
 if(['fog_light','dark_area'].includes(op))numeric(s.radiusMeters,.1,3,'有限光照范围');
 if(op==='dim')p.source=source(d,this,p.target,location);
 return p;
}
function observation(d,p){
 const s=stateOf(d,p.row),op=p.spec.operation;
 if(op==='color')return{sampleType:s.sampleType,sampleGrams:s.sampleGrams,spectrum:s.spectrum.map(x=>({wavelengthNm:x.wavelengthNm,reflectance:x.reflectance}))};
 if(op==='reveal_wear')return{wear:s.wear.filter(x=>x.surface!==false).map(x=>({kind:x.kind,depthMm:x.depthMm,lengthMm:x.lengthMm}))};
 if(op==='trace')return{traces:s.traces.filter(x=>x.surface!==false&&Number.isFinite(x.minute)&&x.minute<=d.get('state','minute')&&d.get('state','minute')-x.minute<=p.spec.power).map(x=>({kind:x.kind,minute:x.minute,areaCm2:x.areaCm2}))};
 const sample=stateOf(d,p.sample),span=distance(p.source.point,p.sample.position),ratio=sample.heightMeters/(p.source.height-sample.heightMeters);
 const edgePoint=p.sample.position.map((v,i)=>v+(v-p.source.point[i])*ratio);
 return{heightMeters:sample.heightMeters,shadowLengthMeters:span*ratio,edgePoint,sourceHeightMeters:p.source.height};
}
export function applyOptics(d,p,id){
 try{p=prepareOptics.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 const op=p.spec.operation,now=d.get('state','minute');
 if(readOps.has(op)){
  const out=observation(d,p);d.set(['state','records',`optical_observation:${id}`],{category:'optical_observation',target:p.target,location:p.location,operation:op,observation:out,minute:now,source:id});
  return{target:p.target,observation:out,evidence:`optical_observation:${id}`};
 }
 if(op==='reveal'){
  const removed=[];
  for(const [key,e]of Object.entries(d.get('state','effects')??{}))if(e.target===p.target&&e.kind==='status'&&e.status==='camouflage'&&e.expires>now){d.remove(['state','effects',key]);removed.push(key);}
  d.set(['state','records',`optical_observation:${id}`],{category:'optical_observation',target:p.target,location:p.location,operation:op,minute:now,source:id,observation:{opticalEffects:removed}});
  return{target:p.target,revealed:removed};
 }
 const e={kind:'optics',operation:op,target:p.target,power:p.spec.power,owner:'player',location:p.location,point:clone(p.point),started:now,expires:now+p.catalog.duration,source:id};
 if(p.source)e.medium=p.source.id;
 if(op==='focus_light')e.beamAreaM2=stateOf(d,p.row).focusAreaM2;
 if(op==='reflect'){e.observerPoint=clone(p.observer.position);e.power=Math.min(e.power,stateOf(d,p.row).reflectivityPercent);e.beamAreaM2=stateOf(d,p.row).reflectionAreaM2;}
 if(['light_screen','privacy'].includes(op)){
  e.radius=stateOf(d,p.row).widthMeters/2;const origin=localPlayerPoint(d);const n=distance(origin,p.point);
  e.side=n?[(origin[0]-p.point[0])/n,(origin[1]-p.point[1])/n]:[1,0];
 }
 if(['dark_area','fog_light'].includes(op))e.radius=stateOf(d,p.row).radiusMeters;
 if(op==='waymark')e.route={id:p.route.id,from:p.route.from,to:p.route.to};
 if(op==='decoy'){e.observer=p.observer;e.remainingUses=1;}
 d.set(['state','effects',id],e);
 return{target:p.target,effect:id,expires:e.expires,...(op==='waymark'?{route:e.route}:{}),...(op==='decoy'?{observer:p.observer,physical:false}: {})};
}
export function shadowBound(d,engine,target='player'){
 const location=target==='player'?d.get('state','location'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target,'location');
 const f=areaTargetFacts(d,engine,target,location);if(!f)return false;
 return active(d,'bind_shadow').some(([,e])=>e.target===target&&e.location===location&&distance(f.point,e.point)<=.5&&lightAt(d,engine,location,f.point).illumination==='dim');
}
export function assertLightMovement(d,engine,target='player'){
 if(shadowBound(d,engine,target))throw preconditionFailure('阴影扰乱脚步，须先照亮、移出阴影或等其失效');
}
export function decoyPenalty(d,target,context){
 if(context.eyesClosed!==false||!['lit','dim'].includes(context.illumination))return 0;
 return active(d,'decoy').filter(([,e])=>e.observer===target&&e.remainingUses===1&&e.location===d.get('state','location')).reduce((p,[,e])=>Math.max(p,e.power*.02),0);
}
export function consumeDecoy(d,target,context){
 if(!decoyPenalty(d,target,context))return[];const used=[];
 for(const [id,e]of active(d,'decoy'))if(e.observer===target&&e.remainingUses===1){d.set(['state','effects',id,'remainingUses'],0);used.push(id);}
 return used;
}
export function lightDamageMultiplier(d,engine,target,spec){
 const location=d.get('state','location'),f=areaTargetFacts(d,engine,target,location,localPlayerPoint(d));
 if(!f)return 0;
 const from=localPlayerPoint(d),metres=distance(from,f.point);
 if(spec.lightDecay){
  const actor=target==='player'?d.get('state','player'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target);
  const sighted=actor.hasVision!==false&&!actor.eyesClosed&&!['昏迷','濒死'].includes(actor.status)&&!isPhysicallyDead(engine,d,target)&&!['睡眠','熟睡'].includes(actor.activity);
  return(sighted?1:.25)/(1+metres*metres/25);
 }
 let brightest=0;
 const samples=Array.from({length:11},(_,i)=>[from[0]+(f.point[0]-from[0])*i/10,from[1]+(f.point[1]-from[1])*i/10]);
 const dx=f.point[0]-from[0],dy=f.point[1]-from[1],length=dx*dx+dy*dy;
 for(const s of [...sources(d,engine,location),...active(d).filter(([,e])=>e.location===location&&['focus_light','reflect'].includes(e.operation)).map(([,e])=>e)]){
  const t=length?Math.max(0,Math.min(1,((s.point[0]-from[0])*dx+(s.point[1]-from[1])*dy)/length)):0;
  samples.push([from[0]+dx*t,from[1]+dy*t]);
 }
 for(const point of samples)brightest=Math.max(brightest,lightAt(d,engine,location,point).lux);
 return 1/(1+brightest/10);
}
export function inspectLight(d,engine,row){
 const from=localPlayerPoint(d),l=lightAt(d,engine,row.location,row.position),visible=localSightClear(d,engine,row.location,from,row.position)&&l.lux>0;
 const observations=visible?Object.values(d.get('state','records')??{}).filter(r=>r.category==='optical_observation'&&r.target===row.id&&r.location===row.location).map(r=>({operation:r.operation,minute:r.minute,observation:clone(r.observation)})):[];
 const routeMarkers=active(d,'waymark').filter(([,e])=>e.location===row.location&&localSightClear(d,engine,row.location,from,e.point)).map(([,e])=>({route:clone(e.route),point:clone(e.point),expires:e.expires}));
 const s=stateOf(d,row),texts=s.emissionLuxAt1m>0?['遮光','复光']:row.kind==='aperture'?['开门','关门']:[];
 return{...l,visible,observations,routeMarkers,...(texts.length?{controls:lightControls(row.id,texts)}:{})};
}
export function lightEnvironmentAction(d,args){
 const operation=args.operation,location=d.get('state','location');
 if(operation==='inspect_light'&&this.world.routes.some(r=>r.id===args.target)){
  const route=this.world.routes.find(r=>r.id===args.target);
  if(![route.from,route.to].includes(location)||!d.get('state','discoveries',route.from)||!d.get('state','discoveries',route.to))throw preconditionFailure('光标检查需要已亲历的邻接路线');
  return{target:route.id,markers:active(d,'waymark').filter(([,e])=>e.target===route.id&&e.location===location&&localSightClear(d,this,location,localPlayerPoint(d),e.point)).map(([,e])=>({route:clone(e.route),point:clone(e.point),expires:e.expires})),actionScope:{kind:'instant',instantaneous:true}};
 }
 if(['cover_light','uncover_light','extinguish_light'].includes(operation)){
  const e=d.get('state','effects',args.target);
  if(e?.kind==='light'){
   if(!lightOrigin(d,{...e,covered:false}))throw preconditionFailure('没有实际持有的光源');
   if(operation==='extinguish_light')d.remove(['state','effects',args.target]);else d.set(['state','effects',args.target,'covered'],operation==='cover_light');
   return{target:args.target,covered:operation==='cover_light',extinguished:operation==='extinguish_light',actionScope:{kind:'instant',instantaneous:true}};
  }
 }
 const row=locate(this,args.target,location);
 if(operation==='inspect_light')access(d,this,row,args,3,true);
 else if(distance(localPlayerPoint(d),row.position)>3||!clearRay(d,this,location,localPlayerPoint(d),row.position))throw preconditionFailure('光学操作超过接触距离或实体遮挡');
 if(operation==='inspect_light')return{target:row.id,...inspectLight(d,this,row),actionScope:{kind:'instant',instantaneous:true}};
 permission(d,this,row,args);const s=stateOf(d,row);
 if(['open_aperture','close_aperture'].includes(operation)){
  if(row.kind!=='aperture')throw preconditionFailure('需要实际可开合缝隙');s.open=operation==='open_aperture';
 }else{
  numeric(s.emissionLuxAt1m,.01,100000,'实际光源');
  if(operation==='extinguish_light'){
   // Optical controls never rewrite combustion, oxygen or fuel accounts.
   throw preconditionFailure('燃烧光源请用实际灭火操作；光学操作只能遮挡');
  }
  s.covered=operation==='cover_light';
 }
 store(d,row,s);return{target:row.id,covered:s.covered,open:s.open,actionScope:{kind:'instant',instantaneous:true}};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['light'],validate:validateLightCatalog,prepare(d,c,args){return prepareLight.call(this,d,c,args);},apply(d,p,id){return applyLight.call(this,d,p,id);}});
registerMagicEffect({kinds:['optics'],validate:validateLightCatalog,prepare(d,c,args){return prepareOptics.call(this,d,c,args);},apply(d,p,id){return applyOptics.call(this,d,p,id);}});
