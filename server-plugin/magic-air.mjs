import {preconditionFailure} from './precondition.mjs';
import {noteUnlicensedUse} from './offense-notes.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {recordEntityDeath}from'./npc-life.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,featureRecordMatches,localPlayerPoint,localSightClear} from './environment.mjs';
import {assertMagicTargeting} from './magic-targeting.mjs';
import {areaTargetFacts} from './magic-area.mjs';
import {derivedStats,monsterStats}from'./combat.mjs';
import {waterEarthSoundLoss,assertWaterEarthMovement,cutWaterMedium}from'./magic-water-earth.mjs';
import {hypot} from './det-math.mjs';

// All quantities below are stored in the save, including transferred pollution.
export const airMechanisms=Object.freeze({airflow:[2000,5],smoke:[2000,5],clean_air:[1000,0],sense_air:[1,0],carry_voice:[80,0],quiet:[80,5],dry_grain:[1000,10],slow_fall:[80,2],lift:[2000,2],sail:[30,5],air_bubble:[600,1],deflect:[60,2],area_wind:[100,5]});
const key=id=>`physical_feature:${id}`,clone=x=>structuredClone(x);
const finite=(x,min,max,label)=>{if(!Number.isFinite(x)||x<min||x>max)throw preconditionFailure(`${label}无效`);return x;};
const integer=(x,min,max,label)=>{if(!Number.isSafeInteger(x)||x<min||x>max)throw preconditionFailure(`${label}无效`);return x;};
const dist=(a,b)=>hypot(a[0]-b[0],a[1]-b[1]);
function carriedKg(d,engine,target='player'){
 const inventory=target==='player'?d.get('state','inventory'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target,'inventory')??{};
 return Object.entries(inventory).reduce((sum,[id,held])=>sum+(typeof held==='number'?held:held.quantity??0)*(engine.byId.get(id)?.weight??held.weight??0),0);
}
const state=(d,row)=>{
 const r=d.get('state','records',key(row.id));
 if(r&&!featureRecordMatches(d,r,row))throw Error('空气对象状态键冲突');
 return clone(r?.state??row.state??{});
};
const store=(d,row,s)=>d.set(['state','records',key(row.id)],{id:row.id,category:'physical_feature',location:row.location,state:s});
function locate(engine,d,id){
 const rows=environmentFeatures(engine).filter(r=>r.location===d.get('state','location')&&(r.id===id||r.name===id));
 if(rows.length!==1)throw preconditionFailure('缺少同地登记的真实空气对象');return rows[0];
}
function access(d,engine,row,args,range,readOnly=false,acoustic=false){
 if(dist(localPlayerPoint(d),row.position)>range||!localSightClear(d,engine,row.location,localPlayerPoint(d),row.position,{waterCurtain:!acoustic}))throw preconditionFailure('空气对象超过实际距离或被遮挡');
 if(readOnly||row.owner==='player'||row.access==='public')return;
 const ids=[args.authorization,...args.authorizations??[]];
 const allowed=ids.some(id=>{const r=d.get('state','records',id);return r?.category==='authorization'&&r.subject===row.id&&r.action==='environment_use'&&r.grantor===row.owner&&!r.revoked&&r.expires>d.get('state','minute')&&(!row.owner?.startsWith('npc_')||!['死亡','濒死'].includes(d.get('state','npcs',row.owner,'status')));});
 if(!allowed)noteUnlicensedUse(d,row);
}
export function validateAirCatalog(c){
 const s=c.effectSpec,m=airMechanisms[s?.operation];
 if(!m)return['风族机制尚未接入'];const errors=[];
 if(s.power>m[0]||c.duration!==m[1])errors.push('风族强度或期限越过固定边界');
 if(!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>40)errors.push('风族射程无效');
 if(c.mechanism!==s.operation)errors.push('风族机制与处理器不一致');
 if(['slow_fall','air_bubble','deflect'].includes(s.operation)&&c.targeting?.consent!=='support_magic')errors.push('活体风族支持需要本人同意');
 return errors;
}
function roomState(d,row,minute){
 const m=row.airModel;if(row.kind!=='room'||!m)throw preconditionFailure('需要登记的真实空气容量');
 integer(m.capacityMg,1,100000000,'氧气容量');integer(m.ventilationMgPerMinute,0,m.capacityMg,'通风量');
 const s=state(d,row);s.air??={lastMinute:minute,oxygenMg:m.capacityMg,smokeMg:0,smokeInputMg:0,burnedFuelMg:0,ventedSmokeMg:0,oxygenUsedMg:0,oxygenAddedMg:0,spreadCount:0};
 const a=s.air;
 for(const field of ['oxygenMg','smokeMg','lastMinute','smokeInputMg','ventedSmokeMg','oxygenUsedMg','oxygenAddedMg'])integer(a[field],0,Number.MAX_SAFE_INTEGER,field);
 if(a.oxygenMg>m.capacityMg||a.oxygenMg!==m.capacityMg+a.oxygenAddedMg-a.oxygenUsedMg||a.smokeMg+a.ventedSmokeMg!==a.smokeInputMg)throw Error('空气账不守恒');
 return s;
}
function linkedPath(d,engine,args,origin,range,readOnly=false,acoustic=false){
 const ids=args.path??[origin.id,args.destination];
 if(!Array.isArray(ids)||ids.length<2||ids.length>8||ids.some(id=>typeof id!=='string'||!id)||ids[0]!==origin.id||new Set(ids).size!==ids.length)throw preconditionFailure('需要明确的连通出口路径');
 const rows=ids.map(id=>locate(engine,d,id));
 for(let i=0;i<rows.length;i++){
  const row=rows[i];access(d,engine,row,args,range,readOnly,acoustic);roomState(d,row,d.get('state','minute'));
  if(i&&(!rows[i-1].links?.exits?.includes(row.id)||state(d,rows[i-1]).closedExits?.includes(row.id)))throw preconditionFailure('石墙或关闭出口阻断气流与回声');
 }
 return rows;
}
function living(d,engine,c,args){
 const target=args.target??'player',path=target==='player'?['state','player']:['state',target.startsWith('npc_')?'npcs':'creatures',target];
 const actor=d.get(...path);
 if(!actor||isPhysicallyDead(engine,d,target)||target!=='player'&&(actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel))throw preconditionFailure('风族活体目标不在场或已死亡');
 assertMagicTargeting(d,engine,c,args,target);return{target,path,actor};
}
export function prepareAirMagic(d,c,args){
 const op=c.effectSpec.operation,now=d.get('state','minute');
 if(['slow_fall','deflect','air_bubble'].includes(op)){
  const actor=living(d,this,c,args);
  if(op==='slow_fall'&&carriedKg(d,this,actor.target)>20)throw preconditionFailure('缓降不能承托重型货物');
  let room;
  if(op==='air_bubble'){
   room=locate(this,d,args.source);access(d,this,room,args,c.rangeMeters);const s=roomState(d,room,now);
   if(s.air.oxygenMg<c.effectSpec.power||s.air.smokeMg||(s.air.dustMg??0)>0||room.airModel.breathable===false)throw preconditionFailure('气泡需要现有洁净可呼吸空气，不能凭空造氧');
  }
  return{...actor,room,catalog:c,spec:c.effectSpec,args:{...args}};
 }
 const row=locate(this,d,args.target),s=state(d,row),readOnly=op==='sense_air';
 access(d,this,row,args,c.rangeMeters,readOnly);
 let rows;
 if(['airflow','smoke','sense_air','carry_voice'].includes(op))rows=linkedPath(d,this,args,row,c.rangeMeters,readOnly||op==='carry_voice',['sense_air','carry_voice'].includes(op));
 if(['airflow','smoke'].includes(op)&&rows.at(-1).id===row.id)throw preconditionFailure('封闭空间不能凭空净化');
 if(op==='sense_air'){
  const wind=row.airModel.windVector; if(!Array.isArray(wind)||wind.length!==2||!wind.every(Number.isFinite))throw preconditionFailure('缺少真实风向数据');
  if(!Number.isFinite(rows.at(-1).airModel.echoDelayMs))throw preconditionFailure('缺少实际回声数据');
 }
 if(op==='carry_voice'&&(typeof args.text!=='string'||!args.text.trim()||Array.from(args.text).length>c.effectSpec.power))throw preconditionFailure('传话需要限定长度的实际文字');
 if(op==='quiet')roomState(d,row,now);
 if(op==='clean_air'&&(!Number.isSafeInteger(s.looseDustMg)||s.looseDustMg<=0||!row.links?.air))throw preconditionFailure('物品表面没有可吹走的松散尘土或真实接收空气');
 if(['clean_air','dry_grain'].includes(op)){const air=locate(this,d,row.links?.air);access(d,this,air,args,c.rangeMeters);roomState(d,air,now);}
 if(op==='dry_grain'){
  if(row.kind!=='grain'||!s.turned||!s.exposed||s.moistureMg<=0)throw preconditionFailure('谷物需要实际翻动并摊开，密封或未翻谷不能排湿');
  const air=locate(this,d,row.links.air);if(!air.links?.exits?.length||s.sealed||(roomState(d,air,now).air.waterVaporMg??0)>=air.airModel.vaporCapacityMg)throw preconditionFailure('封闭或饱和空气不能继续排湿');
  integer(air.airModel.vaporCapacityMg,1,100000000,'空气水汽容量');
 }
 if(op==='lift'){
  assertWaterEarthMovement(d,row.id);
  integer(s.massMg,1,2000000,'轻物质量');if(s.fixed||s.massMg>c.effectSpec.power*1000)throw preconditionFailure('风柱不能托起固定物或超重物');
  if(Object.values(d.get('state','effects')??{}).some(e=>e.kind==='air'&&e.operation==='lift'&&e.target===row.id&&e.expires>now))throw preconditionFailure('轻物已有风柱承托，不能叠加载荷');
  for(const r of environmentFeatures(this).filter(r=>r.location===row.location&&r.id!==row.id&&dist(r.position,row.position)<=2)){
   const loose=state(d,r);if(loose.loose&&!loose.fixed&&Number.isSafeInteger(loose.massMg)&&loose.massMg<=c.effectSpec.power*1000)access(d,this,r,args,c.rangeMeters);
  }
 }
 if(op==='sail'){
  if(row.kind!=='sail'||!s.deployed||s.torn||row.owner!=='player'||!row.links?.route)throw preconditionFailure('需要自有船只上实际张开的完整船帆');
  const route=this.world.routes.find(r=>r.id===row.links.route);
  if(!route?.modes.includes('boat')||![route.from,route.to].includes(row.location))throw preconditionFailure('船帆未连接可航行路线');
  const air=locate(this,d,row.links.air);const v=air.airModel?.windVector,b=route.bearing;
  if(!Array.isArray(v)||!Array.isArray(b)||v.length!==2||b.length!==2||![...v,...b].every(Number.isFinite)||hypot(...v)===0||hypot(...b)===0)throw preconditionFailure('缺少船帆真实风向和航向');
 }
 if(op==='area_wind'&&(row.kind!=='road'||!row.links?.route||!this.world.routes.some(r=>r.id===row.links.route)||!Number.isFinite(s.resistanceMinutes)))throw preconditionFailure('道路风阻需要真实道路与通行时长');
 return{target:row.id,row,rows,catalog:c,spec:c.effectSpec,args:{...args}};
}
function transfer(d,from,to,field,amount){
 const src=state(d,from),dst=state(d,to);src.air[field]-=amount;dst.air[field]=(dst.air[field]??0)+amount;
 if(field==='smokeMg'){src.air.ventedSmokeMg+=amount;dst.air.smokeInputMg+=amount;}
 if(field==='oxygenMg'){src.air.oxygenUsedMg+=amount;dst.air.oxygenAddedMg+=amount;}
 store(d,from,src);store(d,to,dst);
}
function sendSound(d,engine,rows,text,volume,id){
 const now=d.get('state','minute'),heard=[];
 for(const [index,row]of rows.entries()){
  if(index)volume=Math.max(0,volume-waterEarthSoundLoss(d,row.location,rows[index-1].position,row.position));
  const silence=Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='air'&&e.operation==='quiet'&&e.target===row.id&&e.started<=now&&e.expires>now).reduce((m,e)=>Math.max(m,e.power),0);
  volume=Math.max(0,volume-silence);if(!volume)break;
  const actors=[['player',d.get('state','player')],...Object.entries(d.get('state','npcs')??{}),...Object.entries(d.get('state','creatures')??{})];
  for(const [target,actor] of actors){
   if(heard.includes(target)||isPhysicallyDead(engine,d,target))continue;
   const f=areaTargetFacts(d,engine,target,row.location);
   if(!f||dist(f.point,row.position)>(row.airModel.hearingRadiusMeters??2))continue;
   const audible=Math.max(0,volume-waterEarthSoundLoss(d,row.location,row.position,f.point));if(!audible)continue;
   heard.push(target);d.set(['state','records',`air_heard:${id}:${target}`],{category:'heard_sound',subject:target,text,volume:audible,room:row.id,minute:now,source:id});
  }
 }
 return{heard,remainingVolume:volume};
}
export function applyAirMagic(d,p,id){
 try{p=prepareAirMagic.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 const {operation,power}=p.spec,now=d.get('state','minute');
 if(operation==='sense_air'){
  d.set(['state','records',`air_weather:${d.get('state','location')}`],{category:'air_weather',location:d.get('state','location'),windVector:[...p.row.airModel.windVector],minute:now,expires:now+1,source:id});
  return{target:p.target,windVector:[...p.row.airModel.windVector],echoDelayMs:p.rows.at(-1).airModel.echoDelayMs,path:p.rows.map(r=>r.id)};
 }
 if(operation==='carry_voice')return{target:p.target,...sendSound(d,this,p.rows,p.args.text,80,id),alongPath:p.rows.map(r=>r.id)};
 if(operation==='clean_air'){
  const s=state(d,p.row),air=locate(this,d,p.row.links.air),a=roomState(d,air,now),removed=Math.min(power,s.looseDustMg);
  s.looseDustMg-=removed;s.blownDustMg=(s.blownDustMg??0)+removed;a.air.dustMg=(a.air.dustMg??0)+removed;store(d,p.row,s);store(d,air,a);return{target:p.target,removedDustMg:removed,receiver:air.id,stainMg:s.stainMg??0};
 }
 if(operation==='lift'){
  const s=state(d,p.row);s.heightMeters=(s.heightMeters??0)+1;store(d,p.row,s);
  const scattered=[];
  for(const r of environmentFeatures(this).filter(r=>r.location===p.row.location&&r.id!==p.row.id&&dist(r.position,p.row.position)<=2)){
   const loose=state(d,r);if(!loose.loose||loose.fixed||!Number.isSafeInteger(loose.massMg)||loose.massMg>power*1000)continue;
   access(d,this,r,p.args,p.catalog.rangeMeters);loose.displacementMeters=(loose.displacementMeters??0)+1;store(d,r,loose);scattered.push(r.id);
  }
  // Returns to its recorded support when the short-lived lift ends.
  p.returnHeight=s.heightMeters-1;p.scattered=scattered;
 }
 if(operation==='air_bubble'){
  const s=roomState(d,p.room,now);s.air.oxygenMg-=power;s.air.oxygenUsedMg+=power;store(d,p.room,s);
 }
 if(p.rows)for(const row of p.rows)store(d,row,roomState(d,row,now));
 if(operation==='quiet')store(d,p.row,roomState(d,p.row,now));
 if(operation==='dry_grain'){const air=locate(this,d,p.row.links.air);store(d,air,roomState(d,air,now));}
 const effect={kind:'air',operation,target:p.target,power,started:now,expires:now+p.catalog.duration,source:id,location:d.get('state','location'),args:clone(p.args),catalog:clone(p.catalog),lastMinute:now};
 if(p.rows)effect.path=p.rows.map(r=>r.id);
 if(operation==='air_bubble')Object.assign(effect,{oxygenMg:power,initialOxygenMg:power,consumedOxygenMg:0,actorPath:p.path});
 if(operation==='lift')effect.returnHeight=p.returnHeight;
 if(operation==='sail')effect.route=p.row.links.route;
 if(operation==='area_wind')effect.route=p.row.links.route;
 d.set(['state','effects',id],effect);
 return{target:p.target,effect:id,expires:effect.expires,...(p.scattered?{scattered:p.scattered}:{}),...(operation==='air_bubble'?{oxygenMg:power,volumeMl:2000}:{}),...(operation==='lift'?{heightMeters:state(d,p.row).heightMeters}: {})};
}

// Called inside the existing heat loop after each minute of real smoke production.
export function advanceAirMinute(d,engine,rooms,minute){
 for(const x of rooms)store(d,x.row,x.state);
 const effects=Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='air').sort(([a],[b])=>a.localeCompare(b));
 const used=new Set();
 for(const [id,e] of effects){
  if(e.lastMinute>minute||e.started>minute)continue;
  if(e.expires<=minute){settleLift(d,engine,e);continue;}
  if(['airflow','smoke'].includes(e.operation)){
   try{
    const origin=locateAt(engine,e.path[0],e.location),rows=e.path.map(n=>locateAt(engine,n,e.location));
    if(rows.some((r,i)=>i&&(!rows[i-1].links?.exits?.includes(r.id)||state(d,rows[i-1]).closedExits?.includes(r.id))))continue;
    if(used.has(origin.id))continue;used.add(origin.id);
    // Reverse traversal limits movement to one linked segment per minute.
    for(let i=rows.length-2;i>=0;i--){
     const from=rows[i],to=rows[i+1];
     if(Object.values(d.get('state','effects')??{}).some(h=>h.kind==='heat'&&h.operation==='contain_fire'&&[from.id,to.id].includes(h.target)&&h.started<=minute&&h.expires>minute))continue;
     const a=roomState(d,from,minute).air,b=roomState(d,to,minute).air;
     transfer(d,from,to,'smokeMg',Math.min(e.power,a.smokeMg));
     // Existing oxygen flows back, bounded by receiver capacity, never created.
     transfer(d,to,from,'oxygenMg',Math.min(e.power,b.oxygenMg,from.airModel.capacityMg-a.oxygenMg));
    }
   }catch{e.expires=minute;}
  }
  if(e.operation==='dry_grain'){
   const row=locateAt(engine,e.target,e.location),s=state(d,row),air=locateAt(engine,row.links.air,e.location),a=roomState(d,air,minute);
   if(s.turned&&s.exposed&&!s.sealed&&air.links?.exits?.some(n=>!a.closedExits?.includes(n))){
    const amount=Math.max(0,Math.min(e.power,s.moistureMg,air.airModel.vaporCapacityMg-(a.air.waterVaporMg??0)));
    s.moistureMg-=amount;s.evaporatedMg=(s.evaporatedMg??0)+amount;a.air.waterVaporMg=(a.air.waterVaporMg??0)+amount;store(d,row,s);store(d,air,a);
   }
  }
  if(e.operation==='air_bubble'){
   const actor=d.get(...e.actorPath),location=e.target==='player'?d.get('state','location'):actor?.location;
   if(!actor||isPhysicallyDead(engine,d,e.target)||location!==e.location){e.expires=minute;}
   else{const demand=actor.breathingExertion?1200:600,used=Math.min(demand,e.oxygenMg);e.oxygenMg-=used;e.consumedOxygenMg+=used;if(!e.oxygenMg)e.expires=minute+1;}
  }
  e.lastMinute=minute+1;d.set(['state','effects',id],e);
  if(e.expires<=minute+1)settleLift(d,engine,e);
 }
 for(const x of rooms)x.state=roomState(d,x.row,minute+1);
}
const locateAt=(engine,id,location)=>{const row=environmentFeatures(engine).find(r=>r.id===id&&r.location===location);if(!row)throw preconditionFailure('空气路径对象已不存在');return row;};
function settleLift(d,engine,e){
 if(e.operation!=='lift'||e.settled)return;
 const row=locateAt(engine,e.target,e.location),s=state(d,row);s.heightMeters=e.returnHeight;store(d,row,s);e.settled=true;
}
export function advanceAirEffects(d,engine,before,after){
 // Heat rooms own the per-minute clock. Air-only scenes use the same loop.
 if(!environmentFeatures(engine,null,r=>r.kind==='room'&&r.airModel).length)for(let minute=before;minute<after;minute++)advanceAirMinute(d,engine,[],minute);
 for(const [id,e]of Object.entries(d.get('state','effects')??{}))if(e.kind==='air'&&e.expires<=after){settleLift(d,engine,e);d.set(['state','effects',id],e);}
}
export function windArmorMultiplier(material){return ['iron','steel','stone','metal','铁','钢','石'].includes(material)?.25:1;}
export function projectileAirPenalty(d,target,massMg){
 if(massMg===undefined)return 0;integer(massMg,1,100000000,'投射物质量');
 const now=d.get('state','minute'),power=Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='air'&&e.operation==='deflect'&&e.target===target&&e.expires>now&&e.started<=now).reduce((n,e)=>Math.max(n,e.power),0);
 if(!power)return 0;
 return -Math.min(.6,power/100)*Math.min(1,50000/massMg);
}
export function adjustAirTravel(d,engine,route,mode,{minute=d.get('state','minute'),from=d.get('state','location'),sail=true,segments=[]}={}){
 // P2: with no air effect at all neither wind nor sail can change the route.
 if(!Object.values(d.get('state','effects')??{}).some(e=>e.kind==='air'))return route;
 const now=minute;let elapsed=route.minutes,offset=0,cursor=from;
 for(const edgeId of route.edges){
  const effects=Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='air'&&e.route===edgeId&&e.started<=now+offset&&e.expires>now+offset);
  const wind=effects.filter(e=>e.operation==='area_wind').reduce((n,e)=>Math.max(n,Math.min(e.power,state(d,locateAt(engine,e.target,e.location)).resistanceMinutes,e.expires-now-offset)),0);
  elapsed+=wind;offset+=wind;
  const edge=engine.world.routes.find(r=>r.id===edgeId),edgeMinutes=segments.find(r=>r.id===edgeId)?.minutes??route.movingMinutes;
  let saving=0;
  if(mode==='boat'&&sail){
   for(const e of effects.filter(e=>e.operation==='sail')){
    const row=locateAt(engine,e.target,e.location),s=state(d,row),edge=engine.world.routes.find(r=>r.id===edgeId),air=locateAt(engine,row.links.air,e.location),v=air.airModel.windVector,b=edge.bearing;
    if(e.location!==from||!s.deployed||s.torn)continue;
    if((v[0]*b[0]+v[1]*b[1])*(cursor===edge.from?1:-1)<=0)continue;
    saving=Math.max(saving,Math.floor(Math.min(edgeMinutes,e.expires-now-offset)*e.power/100));
   }
   elapsed-=saving;
  }
  offset+=edgeMinutes-saving;cursor=cursor===edge.from?edge.to:edge.from;
 }
 return elapsed===route.minutes?route:{...route,minutes:Math.max(1,elapsed),airMinutes:elapsed-route.minutes};
}
export function airEnvironmentAction(d,args,id){
 const op=args.operation,row=locate(this,d,args.target),s=state(d,row);access(d,this,row,args,op==='sound'?40:1);
 if(op==='turn_grain'){
  if(row.kind!=='grain'||s.sealed)throw preconditionFailure('需要可翻动的实际散装谷物');s.turned=true;s.exposed=true;store(d,row,s);this.advance(d,1,id);return{target:row.id,turned:true,minutes:1};
 }
 if(op==='sound'){
  const rows=linkedPath(d,this,args,row,40,true,true);if(typeof args.text!=='string'||!args.text.trim()||Array.from(args.text).length>80)throw preconditionFailure('声音需要实际文字');
  return{...sendSound(d,this,rows,args.text,80,id),actionScope:{kind:'instant',instantaneous:true}};
 }
 if(op==='fall'){
  finite(s.fallHeightMeters,.1,100,'实际坠落高度');if(row.kind!=='ledge')throw preconditionFailure('坠落需要实际高差');
  const target=args.subject??'player',actor=living(d,this,{rangeMeters:0,targeting:{lineOfSight:true,consent:'support_magic'}},{...args,target});
  const position=d.get('state','records',target==='player'?'local_player_position':`local_actor_position:${target}`);
  if(position?.location!==row.location||position.elevationMeters!==s.fallHeightMeters||dist(position.point,row.position)>0)throw preconditionFailure('角色没有实际处于该坠落高度，需先走近高处');
  const now=d.get('state','minute'),e=Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='air'&&e.operation==='slow_fall'&&e.target===target&&e.expires>now&&e.started<=now).sort((a,b)=>b.power-a.power)[0];
  const percentage=e&&carriedKg(d,this,target)<=20?100-e.power:100,factor=percentage/100,damage=Math.floor(s.fallHeightMeters*5*percentage/100);
  if(target==='player'){
   this.health(d,{delta:-damage},id);d.set(['state','records','local_player_position'],{category:'local_position',subject:target,location:row.location,point:[...row.position],elevationMeters:0,source:id,minute:now});
  }else{
   const definition=this.byId.get(target),stats=target.startsWith('npc_')?derivedStats({level:actor.actor.level??definition.level??1,attributes:definition.attributes},this.rules):monsterStats({level:actor.actor.level??definition.levelRange?.[0]??1,template:definition.template??2},this.rules);
   const hp=Math.max(0,(actor.actor.hp??stats.maxHp)-damage);d.set([...actor.path,'hp'],hp);d.set([...actor.path,'maxHp'],actor.actor.maxHp??stats.maxHp);d.set([...actor.path,'elevationMeters'],0);if(!hp)recordEntityDeath(d,this,target,now,'坠落身亡');
   d.remove(['state','records',`local_actor_position:${target}`]);
  }
  this.advance(d,1,id);return{subject:target,damage,descentFactor:factor,elevationMeters:0};
 }
 if(op==='breathe'){
  const a=roomState(d,row,d.get('state','minute'));if(row.airModel.breathable!==false&&a.air.smokeMg===0&&a.air.oxygenMg>=600){a.air.oxygenMg-=600;a.air.oxygenUsedMg+=600;store(d,row,a);this.advance(d,1,id);return{oxygenUsedMg:600,damage:0};}
  const bubble=Object.values(d.get('state','effects')??{}).find(e=>e.kind==='air'&&e.operation==='air_bubble'&&e.target==='player'&&e.expires>d.get('state','minute')&&e.oxygenMg>0);
  const demand=d.get('state','player','breathingExertion')?1200:600,available=bubble?.oxygenMg??0,damage=available>=demand?0:5;
  if(damage)this.health(d,{delta:-damage},id);this.advance(d,1,id);return{oxygenUsedMg:Math.min(demand,available),damage};
 }
 throw preconditionFailure('风族环境操作未实现');
}
export function prepareWindObject(d,c,args){
 const row=locate(this,d,args.target);access(d,this,row,args,c.rangeMeters);const s=state(d,row);
 if(Object.values(d.get('state','effects')??{}).some(e=>e.kind==='water_earth'&&e.medium===row.id&&e.expires>d.get('state','minute')))return{target:row.id,row,spec:c.effectSpec,catalog:c,args:{...args},windObject:true,waterMedium:true};
 if(!['cloth','leather','wood','iron','steel','stone','metal'].includes(s.material)||!Number.isSafeInteger(s.integrity)||s.integrity<=0)throw preconditionFailure('风刃需要有真实材质和完整度的软物或甲材');
 return{target:row.id,row,spec:c.effectSpec,catalog:c,args:{...args},windObject:true};
}
export function applyWindObject(d,p){
 try{p=prepareWindObject.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 if(p.waterMedium)return cutWaterMedium(d,this,p.target);
 const s=state(d,p.row),damage=Math.min(s.integrity,Math.floor(p.catalog.effectSpec.power*windArmorMultiplier(s.material)));
 s.integrity-=damage;s.cutDamage=(s.cutDamage??0)+damage;store(d,p.row,s);return{target:p.target,damage,integrity:s.integrity,material:s.material};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['air'],validate:validateAirCatalog,prepare(d,c,args){return prepareAirMagic.call(this,d,c,args);},apply(d,p,id){return applyAirMagic.call(this,d,p,id);}});
