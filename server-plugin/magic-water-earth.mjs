import {registerMagicEffect}from'./magic-effects.mjs';
import {cloneData}from'./storage.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {assertMagicTargeting}from'./magic-targeting.mjs';
import {assertLiquidWater}from'./interactions.mjs';

// Fixed consumer bounds. Candidates do not publish new formal world content.
export const waterEarthMechanisms=Object.freeze({
 seal:[20,10],bind_water:[2000,2],survey_water:[5,0],slow_flow:[50,5],veil_water:[1000,3],
 sense_soil:[1,0],till:[4,0],survey_earth:[3,0],mud_seal:[5,10],levee:[50,10],
 level_ground:[4,0],ore:[1,0],structural_sense:[1,0],mud_trap:[4,5],support:[500,2],fracture:[5,0],
});
const clone=x=>cloneData(x),key=id=>`physical_feature:${id}`;
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const number=(v,min,max,label)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(`${label}无效`);return v;};
const integer=(v,min,max,label)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(`${label}无效`);return v;};
// P2: rows are read here only to be copied (peek), and the per-minute
// simulation hands each freshly built row to the draft (adopt).
export function waterEarthState(d,row){
 const r=typeof d.peek==='function'?d.peek('state','records',key(row.id)):d.get('state','records',key(row.id));
 if(r&&(r.category!=='physical_feature'||r.id!==row.id||r.location!==row.location))throw Error('水土对象状态键冲突');
 return clone(r?.state??row.state??{});
}
const store=(d,row,state)=>d.set(['state','records',key(row.id)],{id:row.id,category:'physical_feature',location:row.location,state});
const storeFresh=(d,row,state)=>{const path=['state','records',key(row.id)],value={id:row.id,category:'physical_feature',location:row.location,state};if(typeof d.adopt==='function')d.adopt(path,value);else d.set(path,value);};
// P2: a daily advance passes one feature index (the world does not change
// inside it) instead of rebuilding every feature row each simulated minute.
const featureIndex=engine=>{const index=new Map();for(const r of environmentFeatures(engine)){if(!index.has(r.location))index.set(r.location,[]);index.get(r.location).push(r);}return index;};
function locate(engine,id,location,index=null){
 const rows=(index?index.get(location)??[]:environmentFeatures(engine)).filter(r=>r.location===location&&(r.id===id||r.name===id));
 if(rows.length!==1)throw Error('需要同地登记的真实水土对象');return rows[0];
}
function access(d,engine,row,args,range,read=false){
 if(dist(localPlayerPoint(d),row.position)>range||!localSightClear(d,engine,row.location,localPlayerPoint(d),row.position))throw Error('水土对象超过实际距离或视线被遮挡');
 if(read||row.owner==='player'||row.access==='public')return;
 const allowed=[args.authorization,...args.authorizations??[]].some(id=>{
  const r=d.get('state','records',id);return r?.category==='authorization'&&r.subject===row.id&&r.action==='environment_use'&&r.grantor===row.owner&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>d.get('state','minute')&&(!row.owner?.startsWith('npc_')||!['死亡','濒死'].includes(d.get('state','npcs',row.owner,'status')));
 });
 if(!allowed)throw Error('水土对象需要有效所有者授权');
}
const active=(d,op,minute=d.get('state','minute'))=>Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='water_earth'&&e.operation===op&&e.started<=minute&&e.expires>minute);
const strongest=(d,op,target,minute)=>active(d,op,minute).filter(([,e])=>e.target===target).reduce((n,[,e])=>Math.max(n,e.power),0);
export function validateWaterEarthCatalog(c){
 const s=c.effectSpec,m=waterEarthMechanisms[s?.operation],errors=[];
 if(!m)return['水土机制尚未接入'];
 if(c.mechanism!==s.operation||s.power>m[0]||c.duration!==m[1])errors.push('水土机制、强度或期限越过固定边界');
 if(!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>20)errors.push('水土射程无效');
 if(s.operation==='bind_water'&&c.targeting?.lineOfSight!==true)errors.push('水绳须声明活体视线边界');
 return errors;
}
const readOperations=new Set(['survey_water','sense_soil','survey_earth','ore','structural_sense']);
function water(s){
 integer(s.waterMl,0,100000000,'实际水量');integer(s.capacityMl,1,100000000,'容量');
 integer(s.reservedWaterMl??0,0,100000000,'预留水量');
 if(s.waterMl+(s.reservedWaterMl??0)>s.capacityMl)throw Error('实际水量与预留水量超过容量');
 for(const f of ['saltMg','toxinUg'])number(s[f]??0,0,1e12,f);
}
function reserveWater(d,row,amount){
 const s=waterEarthState(d,row),held={waterMl:amount,turbidity:s.turbidity??0,pathogenRisk:s.pathogenRisk??0,odor:s.odor??''};
 for(const f of ['saltMg','toxinUg']){held[f]=(s[f]??0)*amount/s.waterMl;s[f]=(s[f]??0)-held[f];}
 s.waterMl-=amount;s.reservedWaterMl=(s.reservedWaterMl??0)+amount;store(d,row,s);return held;
}
function returnWater(d,engine,e,index=null){
 if(!e.held||e.returned)return;
 const row=locate(engine,e.medium,e.location,index),s=waterEarthState(d,row),h=e.held;
 // A reserved volume still occupies its original container capacity.
 s.turbidity=s.waterMl?(s.waterMl*(s.turbidity??0)+h.waterMl*h.turbidity)/(s.waterMl+h.waterMl):h.turbidity;
 s.waterMl+=h.waterMl;s.reservedWaterMl-=h.waterMl;
 for(const f of ['saltMg','toxinUg'])s[f]=(s[f]??0)+h[f];
 s.pathogenRisk=Math.max(s.pathogenRisk??0,h.pathogenRisk);s.odor=h.odor;store(d,row,s);e.returned=true;
}
export function prepareWaterEarthMagic(d,c,args){
 const op=c.effectSpec.operation,location=d.get('state','location'),read=readOperations.has(op);
 let row,actor,facts;
 if(op==='bind_water'&&!args.target?.startsWith('feature_')){
  const target=args.target??'player';actor=target==='player'?d.get('state','player'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target);
  facts=areaTargetFacts(d,this,target,location,localPlayerPoint(d));
  if(!actor||actor.status==='死亡'||!facts)throw Error('水绳缺少真实在场肢体');
  const limbMass=actor.limbMassGrams??this.byId.get(target)?.limbMassGrams??(target==='player'||target.startsWith('npc_')?1500:undefined);
  assertMagicTargeting(d,this,c,args,target);integer(limbMass,1,c.effectSpec.power,'肢体载荷');
 }else{
  row=locate(this,args.target,location);access(d,this,row,args,c.rangeMeters,read);
 }
 const s=row?waterEarthState(d,row):{},p={target:row?.id??args.target??'player',row,actor,catalog:c,spec:c.effectSpec,args:clone(args),location};
 if(['seal','mud_seal'].includes(op)){
  if(!['container','seam'].includes(row.kind)||op==='seal'&&row.kind!=='container')throw Error('密封需要真实容器漏口或泥缝');
  if(row.waterEarthProcess!=='leak')throw Error('漏口没有实际泄漏过程');
  number(s.leakMlPerMinute,1,100000,'实际漏口');number(s.pressureKpa,0,c.effectSpec.power,'漏口压力');
  p.receiver=locate(this,row.links?.drain,location);access(d,this,p.receiver,args,c.rangeMeters);water(s);water(waterEarthState(d,p.receiver));
  if(op==='mud_seal'){
   p.source=locate(this,args.source,location);access(d,this,p.source,args,c.rangeMeters);const clay=waterEarthState(d,p.source);
   if(p.source.kind!=='soil'||clay.texture!=='clay')throw Error('泥封需要现有黏土');integer(clay.clayGrams,200,100000000,'可用黏土');
  }
 }
 if(['survey_water','slow_flow'].includes(op)){
  if(row.kind!=='channel')throw Error('需要真实小段水道');number(s.lengthMeters,.1,5,'水道段长度');
  number(s.depthCm,0,500,'实测水深');number(s.flowLimitMl,1,100000,'实测流量');number(s.velocityMetersPerSecond,0,10,'实测流速');
  if(op==='slow_flow'&&(s.floodPeak||s.flowLimitMl>20000))throw Error('缓流不能阻断洪峰');
 }
 if(['bind_water','veil_water'].includes(op)){
  p.source=locate(this,args.source,location);access(d,this,p.source,args,c.rangeMeters);const src=waterEarthState(d,p.source);water(src);
  if(!['container','water'].includes(p.source.kind)||src.waterMl<c.effectSpec.power)throw Error('媒介实际水量不足');
  assertLiquidWater(this,d,p.source);
  const point=row?.position??facts.point;if(dist(p.source.position,point)>3)throw Error('水体媒介与目标不连通');
  if(op==='bind_water'&&row){integer(s.massGrams,1,c.effectSpec.power,'物件载荷');if(s.fixed)throw Error('水绳不能牵动固定物');}
  if(op==='veil_water'){
   if(row.kind!=='passage')throw Error('水帘需要真实通道');number(s.widthMeters,.1,2,'通道宽度');
  }
 }
 if(['sense_soil','till','level_ground','mud_trap'].includes(op)){
  if(row.kind!=='soil')throw Error('需要实际耕土');
  if(op==='sense_soil'&&!['clay','sand','loam'].includes(s.texture))throw Error('土样缺少真实质地');
  if(op!=='sense_soil'){number(s.areaM2,.1,c.effectSpec.power,'有限表土面积');if(s.frozen||s.bedrock)throw Error('冻结或基岩不能作为软表土处理');}
  if(op==='till'){number(s.compactionPercent,1,100,'土壤板结');}
  if(op==='level_ground'){number(s.reliefCm,1,10,'表土高差');number(s.soilVolumeLitres,1,100000,'实际表土体积');}
  if(op==='mud_trap'){number(s.moisturePercent,60,100,'湿土湿度');if(s.planked)throw Error('铺板已隔离湿土');number(s.radiusMeters,.1,2,'湿土范围');}
 }
 if(['survey_earth','ore','fracture'].includes(op)){
  if(row.kind!=='rock')throw Error('需要真实岩层');
  if(op==='survey_earth'){
   if(!Array.isArray(s.strata)||!s.strata.length||!s.strata.every(x=>Number.isFinite(x.depthMeters)&&x.depthMeters>=0&&typeof x.material==='string'&&Number.isFinite(x.echoMs)&&x.echoMs>=0))throw Error('缺少岩层回声样本');
   number(s.echoErrorMeters,0,3,'岩层回声误差');
  }
  if(op==='ore'&&(!Array.isArray(s.oreBands)||!s.oreBands.length||!s.oreBands.every(x=>typeof x.mineral==='string'&&Number.isFinite(x.depthMeters)&&x.depthMeters>=0)))throw Error('缺少可见矿物条带');
  if(op==='fracture'){
   number(s.crackMm,.1,100,'已有岩石裂隙');integer(s.integrity,1,100000,'岩石完整度');
   p.neighbors=(row.links?.structures??[]).map(id=>locate(this,id,location));
   for(const other of p.neighbors){access(d,this,other,args,c.rangeMeters);if(dist(row.position,other.position)>3)throw Error('震动邻接距离无效');integer(waterEarthState(d,other).integrity,1,100000,'邻接结构完整度');}
  }
 }
 if(['structural_sense','support'].includes(op)){
  if(row.kind!=='structure')throw Error('需要真实承重结构');number(s.loadKg,1,100000,'结构实际受力');number(s.capacityKg,1,100000,'结构承载');
  if(op==='support'){if(row.waterEarthProcess!=='sink')throw Error('顶板没有实际下沉过程');number(s.sinkMmPerMinute,.1,100,'顶板下沉速度');integer(s.integrity,1,100000,'顶板完整度');if(s.loadKg<=s.capacityKg||s.loadKg>s.capacityKg+c.effectSpec.power)throw Error('支撑只适用于有限超载的下沉顶板');}
 }
 if(op==='levee'){
  if(row.kind!=='levee')throw Error('需要真实土堤');integer(s.earthGrams,1,100000000,'土堤土量');number(s.erosionGramsPerMinute,1,100000,'冲刷量');
  if(row.waterEarthProcess!=='erosion')throw Error('土堤没有实际冲刷过程');
  p.receiver=locate(this,row.links?.silt,location);access(d,this,p.receiver,args,c.rangeMeters);
  if(p.receiver.kind!=='silt_heap')throw Error('土堤需要真实冲刷沉积处');
 }
 return p;
}
export function applyWaterEarthMagic(d,p,id){
 try{p=prepareWaterEarthMagic.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 const {operation:op,power}=p.spec,s=p.row?waterEarthState(d,p.row):{},now=d.get('state','minute');
 if(op==='survey_water')return{target:p.target,observation:{lengthMeters:s.lengthMeters,depthCm:s.depthCm,flowMlPerMinute:waterEarthFlow(d,p.row,s),velocityMetersPerSecond:s.velocityMetersPerSecond*(1-strongest(d,'slow_flow',p.target)/100)},scope:'只测这段水道，不预测整条河'};
 if(op==='sense_soil')return{target:p.target,observation:{texture:s.texture,moisturePercent:s.moisturePercent,compactionPercent:s.compactionPercent},scope:'土样不提供地契归属'};
 if(op==='survey_earth')return{target:p.target,observation:{strata:clone(s.strata.filter(x=>x.depthMeters<=power)),errorMeters:s.echoErrorMeters},scope:'近处空隙回声；误差由实际岩层决定'};
 if(op==='ore')return{target:p.target,observation:{bands:clone(s.oreBands.filter(x=>x.depthMeters<=power))},extracted:0};
 if(op==='structural_sense')return{target:p.target,observation:{loadKg:s.loadKg,capacityKg:s.capacityKg,overloadKg:Math.max(0,s.loadKg-s.capacityKg),integrity:s.integrity},repaired:0};
 if(op==='till'){s.compactionPercent=Math.max(0,s.compactionPercent-40);s.worked=true;s.tilledAreaM2=s.areaM2;}
 if(op==='level_ground'){s.reliefCm=0;s.leveledAreaM2=s.areaM2;}
 if(op==='fracture'){
  s.crackMm+=power;s.integrity=Math.max(0,s.integrity-power);
  for(const other of p.neighbors){const n=waterEarthState(d,other);n.integrity=Math.max(0,n.integrity-power);n.vibrationDamage=(n.vibrationDamage??0)+power;store(d,other,n);}
 }
 if(['till','level_ground','fracture'].includes(op)){store(d,p.row,s);return{target:p.target,...s,...(p.neighbors?{affectedStructures:p.neighbors.map(r=>r.id)}:{})};}
 const e={kind:'water_earth',operation:op,target:p.target,power,location:p.location,started:now,expires:now+p.catalog.duration,source:id};
 if(p.source&&['bind_water','veil_water'].includes(op)){e.medium=p.source.id;e.held=reserveWater(d,p.source,power);e.point=clone(p.row?.position??areaTargetFacts(d,this,p.target,p.location).point);}
 if(op==='mud_seal'){
  const src=waterEarthState(d,p.source);src.clayGrams-=200;store(d,p.source,src);s.sealedClayGrams=(s.sealedClayGrams??0)+200;store(d,p.row,s);e.lastChecked=now;
 }
 d.set(['state','effects',id],e);
 if(op==='veil_water')waterCurtainNoise(d,this,e,id,now);
 return{target:p.target,effect:id,expires:e.expires,...(e.held?{reservedWaterMl:e.held.waterMl}:{}),...(op==='mud_seal'?{usedClayGrams:200}: {})};
}

// These functions are consumed by normal watering, walking, sight and sound.
export function waterEarthFlow(d,row,s,minute=d.get('state','minute')){
 return Math.floor(s.flowLimitMl*(1-strongest(d,'slow_flow',row.id,minute)/100));
}
const crossing=(point,radius,from,to)=>{
 const dx=to[0]-from[0],dy=to[1]-from[1],n=dx*dx+dy*dy;
 const t=n?Math.max(0,Math.min(1,((point[0]-from[0])*dx+(point[1]-from[1])*dy)/n)):0;
 return dist(point,[from[0]+dx*t,from[1]+dy*t])<=radius;
};
export function waterEarthSightClear(d,location,from,to){
 return !active(d,'veil_water').some(([,e])=>e.location===location&&crossing(e.point,.5,from,to));
}
export function waterEarthSoundLoss(d,location,from,to){
 return active(d,'veil_water').some(([,e])=>e.location===location&&crossing(e.point,.5,from,to))?60:0;
}
export function waterEarthHeldUntil(state,target,minute,knownAt=minute){
 return Object.values(state.effects??{}).filter(e=>e.kind==='water_earth'&&e.operation==='bind_water'&&e.target===target&&e.started<=knownAt&&e.expires>minute).reduce((n,e)=>Math.max(n,e.expires),minute);
}
export function assertWaterEarthMovement(d,target='player'){
 if(waterEarthHeldUntil(d.get('state'),target,d.get('state','minute'))>d.get('state','minute'))throw Error('水绳束住一肢或轻物，须先切断水体媒介或等其失效');
}
export function waterEarthMudPenalty(d,engine,target='player'){
 const location=d.get('state','location'),f=areaTargetFacts(d,engine,target,location);if(!f)return 0;
 for(const [,e]of active(d,'mud_trap')){
  if(e.location!==location)continue;const row=locate(engine,e.target,location),s=waterEarthState(d,row);
  if(s.moisturePercent>=60&&!s.planked&&dist(f.point,row.position)<=s.radiusMeters)return 2;
 }
 return 0;
}
export function waterEarthWalkMinutes(d,engine,from,to){
 let minutes=0;const location=d.get('state','location');
 for(const [,e]of active(d,'mud_trap')){
  if(e.location!==location)continue;const row=locate(engine,e.target,location),s=waterEarthState(d,row);
  if(s.moisturePercent>=60&&!s.planked&&crossing(row.position,s.radiusMeters,from,to))minutes=Math.max(minutes,Math.min(2,e.expires-d.get('state','minute')));
 }
 return minutes;
}
function waterCurtainNoise(d,engine,e,id,minute){
 for(const [subject,actor]of [['player',d.get('state','player')],...Object.entries(d.get('state','npcs')??{}),...Object.entries(d.get('state','creatures')??{})]){
  if(actor.status==='死亡')continue;const f=areaTargetFacts(d,engine,subject,e.location);
  if(f&&dist(f.point,e.point)<=5)d.set(['state','records',`water_heard:${id}:${subject}`],{category:'heard_sound',subject,text:'通道的水帘声',volume:60,location:e.location,point:clone(e.point),minute,source:id});
 }
}
function drain(d,from,to,amount){
 const a=waterEarthState(d,from),b=waterEarthState(d,to);water(a);water(b);
 amount=Math.floor(Math.min(amount,a.waterMl,b.capacityMl-b.waterMl-(b.reservedWaterMl??0)));if(amount<=0)return 0;
 for(const f of ['saltMg','toxinUg']){const moved=(a[f]??0)*amount/a.waterMl;a[f]=(a[f]??0)-moved;b[f]=(b[f]??0)+moved;}
 b.turbidity=((b.turbidity??0)*b.waterMl+(a.turbidity??0)*amount)/(b.waterMl+amount);
 b.pathogenRisk=Math.max(b.pathogenRisk??0,a.pathogenRisk??0);b.odor=a.odor??'';
 a.waterMl-=amount;b.waterMl+=amount;a.drainedWaterMl=(a.drainedWaterMl??0)+amount;b.receivedWaterMl=(b.receivedWaterMl??0)+amount;
 storeFresh(d,from,a);storeFresh(d,to,b);return amount;
}
export function advanceWaterEarth(d,engine,before,after){
 const rows=environmentFeatures(engine).filter(r=>r.waterEarthProcess);
 if(!rows.length&&!Object.values(d.get('state','effects')??{}).some(e=>e.kind==='water_earth'))return;
 const index=featureIndex(engine);
 for(let minute=before;minute<after;minute++){
  for(const [id,e]of Object.entries(d.get('state','effects')??{})){
   if(e.kind!=='water_earth'||e.started>minute)continue;
   if(['seal','mud_seal'].includes(e.operation)){
    const row=locate(engine,e.target,e.location,index),s=waterEarthState(d,row);
    if(s.pressureKpa>e.power||e.operation==='mud_seal'&&minute-e.lastChecked>=3)e.expires=Math.min(e.expires,minute);
   }
   if(e.expires<=minute)returnWater(d,engine,e,index);
   d.set(['state','effects',id],e);
  }
  for(const row of rows){
   const s=waterEarthState(d,row);
   if(row.waterEarthProcess==='leak'){
    number(s.pressureKpa,0,100000,'实际压力');number(s.leakMlPerMinute,0,100000,'实际漏量');
    if(!strongest(d,'seal',row.id,minute)&&!strongest(d,'mud_seal',row.id,minute))drain(d,row,locate(engine,row.links.drain,row.location,index),s.leakMlPerMinute);
   }
   if(row.waterEarthProcess==='erosion'){
    const receiver=locate(engine,row.links.silt,row.location,index),dst=waterEarthState(d,receiver);
    integer(s.earthGrams,0,100000000,'土堤土量');number(s.erosionGramsPerMinute,0,100000,'冲刷量');
    const grams=Math.min(s.earthGrams,Math.ceil(s.erosionGramsPerMinute*(1-strongest(d,'levee',row.id,minute)/100)));
    s.earthGrams-=grams;s.erodedGrams=(s.erodedGrams??0)+grams;dst.siltGrams=(dst.siltGrams??0)+grams;storeFresh(d,row,s);storeFresh(d,receiver,dst);
   }
   if(row.waterEarthProcess==='sink'){
    number(s.loadKg,0,100000,'结构负载');number(s.capacityKg,0,100000,'结构承载');number(s.sinkMmPerMinute,0,100,'下沉速度');integer(s.integrity,0,100000,'结构完整度');
    if(s.integrity&&s.loadKg>s.capacityKg+strongest(d,'support',row.id,minute)){s.sagMm=(s.sagMm??0)+s.sinkMmPerMinute;s.integrity=Math.max(0,s.integrity-1);s.collapsed=s.integrity===0;storeFresh(d,row,s);}
   }
  }
 }
 for(const [id,e]of Object.entries(d.get('state','effects')??{}))if(e.kind==='water_earth'&&e.expires<=after){returnWater(d,engine,e,index);d.set(['state','effects',id],e);}
}
export function inspectWaterEarth(d,engine,row,{check=false}={}){
 if(check)for(const [id,e]of active(d,'mud_seal'))if(e.target===row.id){e.lastChecked=d.get('state','minute');d.set(['state','effects',id],e);}
 const s=waterEarthState(d,row),observed={};
 for(const field of ['reservedWaterMl','pressureKpa','leakMlPerMinute','drainedWaterMl','receivedWaterMl','sealedClayGrams','clayGrams','worked','compactionPercent','reliefCm','soilVolumeLitres','planked','sagMm','integrity','collapsed','earthGrams','erodedGrams','crackMm','vibrationDamage','stoneCount','launchedStones'])if(s[field]!==undefined)observed[field]=s[field];
 return{observed,effects:Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='water_earth'&&e.target===row.id&&e.expires>d.get('state','minute')).map(([id,e])=>({id,operation:e.operation,expires:e.expires,power:e.power,...(e.operation==='veil_water'?{noiseVolume:60}:{})}))};
}
export function cutWaterMedium(d,engine,target){
 const effects=Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='water_earth'&&['bind_water','veil_water'].includes(e.operation)&&e.medium===target&&e.expires>d.get('state','minute'));
 for(const [id,e]of effects){returnWater(d,engine,e);d.remove(['state','effects',id]);}
 return{target,severed:effects.map(([id])=>id)};
}

// Stone ammunition remains an actual physical object after the hit.
export function prepareStone(d,c,args){
 const source=locate(this,args.source,d.get('state','location'));access(d,this,source,args,c.rangeMeters);const s=waterEarthState(d,source);
 if(source.kind!=='stones'||s.fixed||!s.loose)throw Error('石弹需要已有松散小石');integer(s.massGrams,1,500,'小石质量');integer(s.stoneCount,1,100000,'已有小石数量');
 let row,point;
 if(args.target?.startsWith('feature_')){row=locate(this,args.target,source.location);access(d,this,row,args,c.rangeMeters);integer(waterEarthState(d,row).integrity,1,100000,'实体目标完整度');point=row.position;}
 else{assertMagicTargeting(d,this,c,args,args.target);const f=areaTargetFacts(d,this,args.target,source.location,localPlayerPoint(d));if(!f)throw Error('石弹缺少实际目标位置');point=f.point;}
 if(dist(source.position,point)>c.rangeMeters)throw Error('小石飞行距离超过实际射程');
 return{source,row,point:clone(point),massGrams:s.massGrams,catalog:c,args:clone(args)};
}
export function launchStone(d,p,id){
 const s=waterEarthState(d,p.source);s.stoneCount--;s.launchedStones=(s.launchedStones??0)+1;store(d,p.source,s);
 const landing=`stone_landing:${id}`;
 d.set(['state','records',landing],{category:'physical_projectile',source:p.source.id,owner:p.source.owner,target:p.args.target,location:p.source.location,point:clone(p.point),massGrams:p.massGrams,stoneCount:1,minute:d.get('state','minute')});
 return{projectile:landing,projectileMassGrams:p.massGrams};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['water_earth'],validate:validateWaterEarthCatalog,prepare(d,c,args){return prepareWaterEarthMagic.call(this,d,c,args);},apply(d,p,id){return applyWaterEarthMagic.call(this,d,p,id);}});
