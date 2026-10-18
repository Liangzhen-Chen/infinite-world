import {isPhysicallyDead} from './lifecycle-state.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {cloneData}from'./storage.mjs';
import {recordRitualCare}from'./magic-ritual.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear}from'./environment.mjs';
import {assertMagicTargeting}from'./magic-targeting.mjs';
import {ambientHeatC}from'./magic-object.mjs';
import {resolveCreature}from'./wildlife.mjs';
import {derivedStats,monsterStats}from'./combat.mjs';
import {recordEntityDeath}from'./npc-life.mjs';
import {assertSpellConsent}from'./magic-consent.mjs';

// Authoring bounds only. The formal catalog is not changed by these consumers.
export const careMechanisms=Object.freeze({
 hemostasis:[5,0],close_wound:[10,0],clean_wound:[90,0],disease_sense:[1,0],
 pain:[3,30],stabilize:[1,30],parasite:[1,0],restore_tendon:[50,1440],
 herb_sense:[1,0],seedling:[3,1440],roots:[10,4320],graft:[50,4320],
 preserve:[50,60],preserve_food:[50,1440],
});
const medicalOps=new Set(['hemostasis','close_wound','clean_wound','disease_sense','pain','stabilize','parasite','restore_tendon']);
const clone=x=>cloneData(x),key=id=>`physical_feature:${id}`;
const number=(v,min,max,label)=>{if(!Number.isFinite(v)||v<min||v>max)throw Error(`${label}无效或未登记`);return v;};
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const actorPath=target=>target==='player'?['state','player']:['state',target.startsWith('npc_')?'npcs':'creatures',target];
const active=(d,target,op,minute=d.get('state','minute'))=>Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='care'&&e.target===target&&e.operation===op&&e.started<=minute&&e.expires>minute);
const strongest=(d,target,op,minute)=>active(d,target,op,minute).reduce((n,e)=>Math.max(n,e.power),0);
// P2: rows are read here only to be copied (peek), and the simulation hands
// each freshly built row to the draft (adopt) instead of having it copied.
const peekRecord=(d,id)=>typeof d.peek==='function'?d.peek('state','records',id):d.get('state','records',id);
function stateOf(d,row){
 const r=peekRecord(d,key(row.id));
 if(r&&(r.category!=='physical_feature'||r.id!==row.id||r.location!==row.location))throw Error('照护对象状态键冲突');
 return clone(r?.state??row.state??{});
}
const store=(d,row,state)=>d.set(['state','records',key(row.id)],{id:row.id,category:'physical_feature',location:row.location,state});
const storeFresh=(d,row,state)=>{const path=['state','records',key(row.id)],value={id:row.id,category:'physical_feature',location:row.location,state};if(typeof d.adopt==='function')d.adopt(path,value);else d.set(path,value);};
function locate(engine,id,location){
 const rows=environmentFeatures(engine).filter(r=>r.location===location&&(r.id===id||r.name===id));
 if(rows.length!==1)throw Error('需要同地登记的真实植物、食物或容器');return rows[0];
}
function featureAccess(d,engine,row,args,range,read=false){
 if(!Array.isArray(row.position)||row.position.some(v=>!Number.isFinite(v))||distance(localPlayerPoint(d),row.position)>range||!localSightClear(d,engine,row.location,localPlayerPoint(d),row.position))throw Error('照护对象超出实际距离或视线');
 if(read||row.owner==='player')return;
 const ids=[args.authorization,...args.authorizations??[]];
 if(!ids.some(id=>{
  const r=d.get('state','records',id);
  return r?.category==='authorization'&&r.subject===row.id&&r.action==='environment_use'&&r.grantor===row.owner&&r.grantee==='player'&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>d.get('state','minute')&&(!row.owner?.startsWith('npc_')||!['死亡','濒死'].includes(d.get('state','npcs',row.owner,'status')));
 }))throw Error('照护对象需要所有者有效授权');
}
function medical(d,target){
 const m=clone(d.get(...actorPath(target),'medical'));
 if(!m||!Array.isArray(m.wounds))throw Error('目标没有登记具体伤病状态');
 number(m.bloodMl,0,10000,'实际血量');number(m.pain,0,10,'局部疼痛');
 return m;
}
function wound(m,args){
 const rows=m.wounds.filter(w=>w.id===args.source);
 if(rows.length!==1)throw Error('须用source选择已登记的具体创面');
 const w=rows[0];
 number(w.depthMm,0,100,'创面深度');number(w.areaCm2,0,10000,'创面面积');
 number(w.bleedingMlPerMinute,0,1000,'出血速度');number(w.contamination,0,100,'创面污染');
 number(w.infectionRisk,0,100,'感染风险');
 return w;
}
function living(d,engine,c,args){
 const target=resolveCreature(engine,d,args.target??'player'),path=actorPath(target),a=d.get(...path),location=d.get('state','location');
 if(!a||target!=='player'&&a.location!==location||isPhysicallyDead(engine,d,target))throw Error('治疗目标不在场或已经死亡');
 assertMagicTargeting(d,engine,c,args,target);
 assertSpellConsent(d,engine,c,args,target,'healing');
 if(target!=='player'){
  const def=engine.byId.get(target),stats=target.startsWith('npc_')?derivedStats({level:a.level??def.level??1,attributes:def.attributes,profession:Boolean(def.combatProfession)},engine.rules):monsterStats({level:a.level??def.level??def.levelRange?.[0]??1,template:def.template??engine.byId.get(def.monster)?.template??2,bossTier:def.tier??0},engine.rules);
  if(stats.divine&&!d.get('state','divinePermissions',target))throw Error('不能越过神性屏障');
 }
 return{target,path,actor:a,medical:medical(d,target)};
}
function plantState(s){
 const p=s.plant;
 if(!p||p.alive!==true||!['seedling','mature'].includes(p.stage))throw Error('缺少实际活植株状态');
 number(p.health,0,100,'植株活力');number(s.waterMl,0,100000000,'植株水量');number(s.nutrientMg,0,100000000,'植株营养');
 number(p.waterMlPerMinute,.001,100,'植株耗水');number(p.nutrientMgPerMinute,.001,100,'植株耗肥');
 return p;
}
function foodState(row,s){
 if(row.kind!=='container'||s.closed!==true||!(s.integrity>0)||!Array.isArray(s.foodLots)||!s.foodLots.length)throw Error('保鲜需要完整封闭容器和实际食物批次');
 for(const b of s.foodLots){
  number(b.amountGrams,0,100000000,'食物重量');number(b.spoiledGrams,0,100000000,'已腐坏重量');
  number(b.decayGramsPerMinute,0,100000,'腐败速度');
  number(b.badGrams??0,0,100000000,'未剔除坏果重量');
  if(!b.id||b.badGrams>0||b.rotten===true||b.amountGrams<=0)throw Error('必须先剔除坏果，不能保鲜已腐败批次');
 }
}
export function validateCareCatalog(c){
 const s=c.effectSpec,m=careMechanisms[s.operation],errors=[];
 if(!m)return['照护机制尚未接入'];
 if(s.power>m[0]||c.duration!==m[1])errors.push('照护强度或期限越过固定边界');
 const mechanism=['hemostasis','close_wound'].includes(s.operation)?'healing':s.operation;
 if(c.mechanism!==mechanism)errors.push('照护效果与所述机制不一致');
 if(!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>3)errors.push('照护只支持实际三米内');
 if(medicalOps.has(s.operation)&&c.targeting?.lineOfSight!==true)errors.push('医疗需要真实视线边界');
 return errors;
}
export function prepareCare(d,c,args){
 const op=c.effectSpec.operation,p={catalog:c,spec:c.effectSpec,args:clone(args),location:d.get('state','location')};
 if(medicalOps.has(op)){
  Object.assign(p,living(d,this,c,args));const m=p.medical;
  if(['hemostasis','close_wound','clean_wound'].includes(op)){
   const w=wound(m,args);p.wound=w.id;
   if(w.closed)throw Error('创面已经闭合');
   if(op==='hemostasis'&&(w.depthMm>3||w.areaCm2>20||w.bleedingMlPerMinute<=0||w.bleedingMlPerMinute>c.effectSpec.power))throw Error('止血只支持有限浅表出血');
   if(op==='close_wound'&&(w.depthMm>5||w.areaCm2>c.effectSpec.power||w.simple!==true||w.foreignBody||w.toxinUg>0||w.bleedingMlPerMinute>0))throw Error('闭合需要简单、已止血且无异物毒素的创面');
   if(op==='clean_wound'&&w.contamination<=0)throw Error('创面没有可清洁的污染');
  }
  if(op==='disease_sense'){
   if(!Array.isArray(m.symptoms)||!m.symptoms.some(s=>s.observable===true&&['fever','redness','swelling','discharge'].includes(s.kind)))throw Error('没有已登记的常见感染征象');
  }
  if(op==='pain'&&m.pain<=0)throw Error('没有已登记的局部疼痛');
  if(op==='stabilize'){
   if(p.actor.status!=='濒死'||!Number.isFinite(p.actor.dyingSince)||m.bloodMl<=0||m.wounds.some(w=>w.bleedingMlPerMinute>0))throw Error('稳定需要已止血、仍有血量的实际濒死者');
   if(active(d,p.target,op).length)throw Error('濒死稳定不能叠加');
  }
  if(op==='parasite'){
   const rows=m.parasites?.filter(r=>r.id===args.source);
   if(rows?.length!==1||rows[0].identified!==true||rows[0].accessible!==true||!Number.isFinite(rows[0].sizeMm)||rows[0].sizeMm<=0||rows[0].sizeMm>5||!Number.isSafeInteger(rows[0].count)||rows[0].count<1)throw Error('驱除需要可识别、可达的小型寄生物');
   p.parasite=rows[0].id;number(rows[0].hostDamage,0,10,'驱除宿主损伤');
  }
  if(op==='restore_tendon'){
   const t=m.tendon;
   if(!t||t.ruptured!==true||t.aligned!==true||t.infection!==false||t.foreignBody)throw Error('肌腱恢复需要对齐、无感染的实际断裂肌腱');
   number(t.integrity,0,100,'肌腱完整度');number(t.maxLoadKg,0,100,'恢复负重上限');
   if(active(d,p.target,op).length)throw Error('肌腱修复不能叠加');
  }
  return p;
 }
 p.row=locate(this,args.target,p.location);p.target=p.row.id;
 featureAccess(d,this,p.row,args,c.rangeMeters,op==='herb_sense');const s=stateOf(d,p.row);
 if(['preserve','preserve_food'].includes(op)){
  if(p.row.careProcess!=='food')throw Error('食物缺少实际腐败过程登记');
  foodState(p.row,s);
  if(op==='preserve_food'&&s.foodLots.some(b=>b.kind!=='fruit'))throw Error('果藏只支持真实果实批次');
  if(op==='preserve'){
   number(s.temperatureC,1,40,'储柜温度');number(s.insulationPercent,0,100,'储柜隔热率');
   const upkeep=1+Math.ceil((100-s.insulationPercent)/25);
   if(d.get('state','player','mp')<c.mp+upkeep)throw Error('隔热差的储柜缺少额外维持魔力');
  }
 }else{
  if(p.row.kind!=='plant'||p.row.careProcess!=='plant')throw Error('需要实际植株与生理过程登记');const plant=plantState(s);
  if(op==='herb_sense'){
   if(plant.herbKnown!==true||!Array.isArray(plant.commonProperties)||!plant.commonProperties.length)throw Error('未知药草仍需研究');
  }
  if(op==='seedling'){
   if(plant.stage!=='seedling')throw Error('护芽只作用于幼苗');number(plant.frostToleranceC,-20,10,'幼苗耐霜温度');
  }
  if(op==='roots'){
   if(plant.stage!=='seedling')throw Error('根系引导只作用于幼根');
   number(plant.rootLengthMeters,0,10,'幼根长度');
   p.source=locate(this,args.source,p.location);featureAccess(d,this,p.source,args,c.rangeMeters);
   const water=stateOf(d,p.source);number(water.waterMl,1,100000000,'现有水源');
   if(p.source.id===p.target||distance(p.row.position,p.source.position)>1||!localSightClear(d,this,p.location,p.row.position,p.source.position))throw Error('幼根水源须在一米内可达');
   if(s.waterMl<plant.waterMlPerMinute||s.nutrientMg<plant.nutrientMgPerMinute)throw Error('幼根生长仍需实际水肥');
  }
  if(op==='graft'){
   p.source=locate(this,args.source,p.location);featureAccess(d,this,p.source,args,c.rangeMeters);const scion=stateOf(d,p.source),sp=plantState(scion),g=plant.graft;
   if(p.source.id===p.target||!g||g.scion!==p.source.id||g.cutAligned!==true||g.attached!==true||plant.graftGroup!==sp.graftGroup||!plant.graftGroup)throw Error('嫁接需要已接合且兼容的真实砧木和接穗');
   const skill=this.world.skills.find(r=>r.id==='skill_gardening'||r.name.includes('园艺'));
   if(!skill||(d.get('state','skills',skill.id,'proficiency')??0)<100)throw Error('嫁接需要实际园艺手艺');
   number(g.rejection,0,100,'嫁接排异');number(g.union,0,100,'嫁接口愈合');
   if(s.waterMl<plant.waterMlPerMinute||s.nutrientMg<plant.nutrientMgPerMinute)throw Error('嫁接仍需实际水肥');
  }
 }
 if(c.duration&&active(d,p.target,op).length)throw Error('同类照护不能叠加');
 return p;
}
export function applyCare(d,p,id){
 try{p=prepareCare.call(this,d,p.catalog,p.args);}catch(e){return{target:p.target,effectFailed:e.message};}
 const op=p.spec.operation,now=d.get('state','minute'),out={target:p.target,operation:op};
 if(p.medical){
  const m=p.medical,w=m.wounds.find(w=>w.id===p.wound);
  if(op==='hemostasis'){out.stoppedMlPerMinute=w.bleedingMlPerMinute;w.bleedingMlPerMinute=0;w.hemostasisSource=id;}
  if(op==='clean_wound'){const cleaned=Math.min(w.contamination,p.spec.power);w.contamination-=cleaned;out.cleaned=cleaned;out.toxinUg=w.toxinUg??0;out.foreignBody=Boolean(w.foreignBody);}
  if(op==='close_wound'){
   w.closed=true;w.closedSource=id;
   if(w.contamination>0)w.infectionRisk=Math.min(100,w.infectionRisk+w.contamination);
   out.closed=true;out.infectionRisk=w.infectionRisk;
  }
  if(op==='disease_sense'){
   out.observation={signs:m.symptoms.filter(s=>s.observable===true&&['fever','redness','swelling','discharge'].includes(s.kind)).map(s=>({kind:s.kind,...(Number.isFinite(s.temperatureC)?{temperatureC:s.temperatureC}: {})})),pathogenConfirmed:false};
  }
  if(op==='parasite'){
   const parasite=m.parasites.find(r=>r.id===p.parasite);parasite.count--;out.removed=1;out.remaining=parasite.count;
   if(parasite.hostDamage>0){
    const a=d.get(...p.path),damage=Math.min(a.hp,parasite.hostDamage);
    if(p.target==='player')this.health(d,{delta:-damage},id);
    else{d.set([...p.path,'hp'],a.hp-damage);if(a.hp===damage){d.set([...p.path,'status'],'濒死');d.set([...p.path,'dyingSince'],now);}}
    m.pain=Math.min(10,m.pain+parasite.hostDamage);out.hostDamage=damage;
   }
  }
  d.set([...p.path,'medical'],m);
 }else if(op==='herb_sense'){
  const plant=stateOf(d,p.row).plant;
  out.observation={commonProperties:plant.commonProperties.filter(x=>typeof x==='string').slice(0,8),unknown:false};
 }
 if(out.observation){
  const evidence=`care_observation:${id}`;
  d.set(['state','records',evidence],{category:'care_observation',target:p.target,operation:op,location:p.location,minute:now,observation:out.observation,owner:'player',source:id});out.evidence=evidence;
 }
 if(p.catalog.duration){
  const e={kind:'care',operation:op,target:p.target,owner:'player',power:p.spec.power,started:now,expires:now+p.catalog.duration,location:p.location,source:id};
  if(p.source)e.medium=p.source.id;
  if(op==='restore_tendon')e.initialIntegrity=p.medical.tendon.integrity;
  if(op==='preserve'){
   const s=stateOf(d,p.row);e.initialTemperatureC=s.temperatureC;e.upkeepMp=1+Math.ceil((100-s.insulationPercent)/25);
  }
  d.set(['state','effects',id],e);out.effect=id;out.expires=e.expires;
 }
 return out;
}

// Medical pain affects normal combat accuracy; relief leaves the wound intact.
export function carePain(d,target){
 const m=d.get(...actorPath(target),'medical');if(!m)return 0;
 return Math.max(0,number(m.pain,0,10,'局部疼痛')-strongest(d,target,'pain',d.get('state','minute')));
}
export function strainCare(d,engine,target,minutes){
 const m=d.get(...actorPath(target),'medical');if(!m?.tendon||minutes<30)return;
 const load=target==='player'?Object.entries(d.get('state','inventory')??{}).reduce((sum,[id,unit])=>sum+(engine.byId.get(id)?.weight??0)*unit.quantity,0):d.get(...actorPath(target),'carriedKg')??0;
 if(load<=m.tendon.maxLoadKg)return;
 for(const [id,e]of Object.entries(d.get('state','effects')??{})){
  if(e.kind!=='care'||e.target!==target||e.operation!=='restore_tendon'||e.expires<=d.get('state','minute'))continue;
  const next=clone(m);next.tendon.integrity=Math.min(next.tendon.integrity,e.initialIntegrity);next.tendon.ruptured=true;next.tendon.strainedAt=d.get('state','minute');
  d.set([...actorPath(target),'medical'],next);d.remove(['state','effects',id]);
 }
}
function advanceMedical(d,engine,target,minute){
 const path=actorPath(target),a=d.get(...path);if(!a?.medical||isPhysicallyDead(engine,d,target))return;
 const m=medical(d,target),loss=m.wounds.reduce((n,w)=>n+number(w.bleedingMlPerMinute,0,1000,'出血速度'),0);
 if(loss){m.bloodMl=Math.max(0,m.bloodMl-loss);m.lostBloodMl=(m.lostBloodMl??0)+Math.min(loss,a.medical.bloodMl);}
 for(const w of m.wounds)if(w.closed&&w.contamination>0&&w.infectionRisk>=50){
  w.infectionProgress=(w.infectionProgress??0)+w.infectionRisk/100/1440;
  if(w.infectionProgress>=1-1e-8){
   w.infected=true;m.symptoms??=[];
   if(!m.symptoms.some(s=>s.kind==='swelling'&&s.wound===w.id))m.symptoms.push({kind:'swelling',wound:w.id,observable:true});
  }
 }
 if(strongest(d,target,'restore_tendon',minute)&&m.tendon?.ruptured&&m.tendon.aligned&&m.tendon.infection===false){
  m.tendon.integrity=Math.min(100,m.tendon.integrity+strongest(d,target,'restore_tendon',minute)/1440);
  if(m.tendon.integrity>=100-1e-8){m.tendon.integrity=100;m.tendon.ruptured=false;}
 }
 d.set([...path,'medical'],m);
 if(a.status==='濒死'&&active(d,target,'stabilize',minute).length&&m.bloodMl>0&&!loss)d.set([...path,'dyingSince'],a.dyingSince+1);
 if(m.bloodMl===0&&a.status!=='濒死'){
  if(target==='player'){engine.health(d,{delta:-a.hp},`bleeding:${minute}`);d.set([...path,'dyingSince'],minute+1);}
  else{d.set([...path,'hp'],0);d.set([...path,'status'],'濒死');d.set([...path,'dyingSince'],minute);}
 }
 const latest=d.get(...path);
 if(target!=='player'&&latest.status==='濒死'&&minute+1-latest.dyingSince>=engine.rules.death.dyingMinutes)recordEntityDeath(d,engine,target,minute+1,'伤重身亡');
}
function advancePlant(d,engine,row,minute){
 const s=stateOf(d,row);if(s.plant?.alive!==true)return;const p=plantState(s);
 const temp=Number.isFinite(s.temperatureC)?s.temperatureC:ambientHeatC(d,engine,row.location);
 if(p.stage==='seedling'&&temp<p.frostToleranceC){
  const protect=strongest(d,row.id,'seedling',minute),lightFrost=temp>=p.frostToleranceC-3;
  if(!protect||!lightFrost)p.health=Math.max(0,p.health-(p.frostToleranceC-temp)/60);
 }
 const dry=s.waterMl<p.waterMlPerMinute,starved=s.nutrientMg<p.nutrientMgPerMinute;
 if(dry)p.health=Math.max(0,p.health-1/60);
 const root=active(d,row.id,'roots',minute)[0],graft=active(d,row.id,'graft',minute)[0];
 if((root||graft)&&!dry&&!starved){
  s.waterMl-=p.waterMlPerMinute;s.nutrientMg-=p.nutrientMgPerMinute;
  s.careConsumedWaterMl=(s.careConsumedWaterMl??0)+p.waterMlPerMinute;s.careConsumedNutrientMg=(s.careConsumedNutrientMg??0)+p.nutrientMgPerMinute;
  if(root){
   const water=locate(engine,root.medium,row.location),ws=stateOf(d,water);
   if(ws.waterMl>0){
    p.rootDirection=water.position.map((v,i)=>v-row.position[i]);
    p.rootLengthMeters=Math.min(1,p.rootLengthMeters+root.power/100/1440);
    if(p.rootLengthMeters>=distance(row.position,water.position)){
     const amount=Math.min(ws.waterMl,p.waterMlPerMinute);ws.waterMl-=amount;s.waterMl+=amount;
     s.rootDrawnWaterMl=(s.rootDrawnWaterMl??0)+amount;ws.rootRemovedWaterMl=(ws.rootRemovedWaterMl??0)+amount;storeFresh(d,water,ws);
    }
   }
  }
  if(graft){
   const scion=stateOf(d,locate(engine,graft.medium,row.location));
   if(p.graft?.attached&&scion.plant?.alive&&p.graftGroup===scion.plant.graftGroup){
    p.graft.rejection=Math.max(0,p.graft.rejection-graft.power/1440);
    p.graft.union=Math.min(100,p.graft.union+graft.power/1440);
    p.graft.accepted=p.graft.union>=100-1e-8&&p.graft.rejection<=1e-8;
   }
  }
 }
 if(p.health<=0)p.alive=false;storeFresh(d,row,s);
}
function advanceFood(d,engine,row,minute){
 const s=stateOf(d,row);if(!Array.isArray(s.foodLots)||!s.foodLots.length)return;
 const closed=s.closed===true&&s.integrity>0;
 let factor=1;
 const cooling=active(d,row.id,'preserve',minute)[0];
 if(cooling&&closed){
  const mp=d.get('state','player','mp');
  if(mp>=cooling.upkeepMp){
   d.set(['state','player','mp'],mp-cooling.upkeepMp);
   s.temperatureC=Math.max(1,s.temperatureC-.5);factor=1-cooling.power/100;
  }else{
   d.set(['state','effects',cooling.source,'expires'],minute);s.temperatureC=cooling.initialTemperatureC;
  }
 }
 for(const b of s.foodLots){
  const preserved=closed&&b.kind==='fruit'?strongest(d,row.id,'preserve_food',minute):0;
  const lost=Math.min(b.amountGrams,number(b.decayGramsPerMinute,0,100000,'腐败速度')*Math.min(factor,1-preserved/100));
  b.amountGrams-=lost;b.spoiledGrams=(b.spoiledGrams??0)+lost;s.spoiledGrams=(s.spoiledGrams??0)+lost;
 }
 storeFresh(d,row,s);
}
export function advanceCare(d,engine,before,after){
 // A record with nothing that bleeds, festers, heals or is dying stays as it
 // is minute by minute (e.g. only an illness fever), so it is not stepped.
 const changing=a=>a?.medical&&(a.status==='濒死'||!(a.medical.bloodMl>0)||a.medical.tendon?.ruptured||a.medical.wounds?.some(w=>w.bleedingMlPerMinute>0||w.closed&&w.contamination>0&&w.infectionRisk>=50)||!Array.isArray(a.medical.wounds));
 const actors=['player',...Object.keys(d.get('state','npcs')??{}),...Object.keys(d.get('state','creatures')??{})].filter(id=>!isPhysicallyDead(engine,d,id)&&changing(d.get(...actorPath(id))));
 const rows=environmentFeatures(engine).filter(r=>r.careProcess==='plant'||r.careProcess==='food'||Object.values(d.get('state','effects')??{}).some(e=>e.kind==='care'&&e.target===r.id));
 if(!actors.length&&!rows.length)return;
 for(let minute=before;minute<after;minute++){
  for(const target of actors)advanceMedical(d,engine,target,minute);
  for(const row of rows){
   if(row.kind==='plant')advancePlant(d,engine,row,minute);
   if(row.kind==='container')advanceFood(d,engine,row,minute);
  }
 }
 for(const e of Object.values(d.get('state','effects')??{}))if(e.kind==='care'&&e.operation==='preserve'&&e.expires<=after){
  const row=locate(engine,e.target,e.location),s=stateOf(d,row);s.temperatureC=e.initialTemperatureC;storeFresh(d,row,s);
 }
}
export function inspectCare(d,engine,args){
 const location=d.get('state','location'),target=args.target;
 if(target==='player'||d.get(...actorPath(target??''))){
  const a=d.get(...actorPath(target));if(!a?.medical)return null;
  // Medical examination follows the same consent and presence gate as casting.
  const c={effectSpec:{operation:'disease_sense'},rangeMeters:3,targeting:{lineOfSight:true}};
  living(d,engine,c,args);
  return{target,status:a.status,bloodMl:a.medical.bloodMl,pain:carePain(d,target),wounds:a.medical.wounds.map(w=>({id:w.id,closed:w.closed??false,bleedingMlPerMinute:w.bleedingMlPerMinute,contamination:w.contamination,infectionRisk:w.infectionRisk})),tendon:clone(a.medical.tendon??null),stableUntil:active(d,target,'stabilize')[0]?.expires??null};
 }
 const rows=environmentFeatures(engine).filter(r=>r.location===location&&(r.id===target||r.name===target));
 if(rows.length!==1)return null;const row=rows[0],s=stateOf(d,row);
 if(!s.plant&&!s.foodLots)return null;
 featureAccess(d,engine,row,args,3,true);
 return{target:row.id,...(s.plant?{plant:{stage:s.plant.stage,alive:s.plant.alive,health:s.plant.health,rootLengthMeters:s.plant.rootLengthMeters,graft:clone(s.plant.graft??null)},waterMl:s.waterMl,nutrientMg:s.nutrientMg}:{}),...(s.foodLots?{foodLots:s.foodLots.map(b=>({id:b.id,kind:b.kind,amountGrams:b.amountGrams,spoiledGrams:b.spoiledGrams})),temperatureC:s.temperatureC}:{}),observations:Object.values(d.get('state','records')??{}).filter(r=>r.category==='care_observation'&&r.owner==='player'&&r.target===row.id&&r.location===location).map(r=>({operation:r.operation,observation:clone(r.observation)}))};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['care'],validate:validateCareCatalog,prepare(d,c,args){return prepareCare.call(this,d,c,args);},apply(d,p,id){const result=applyCare.call(this,d,p,id);recordRitualCare(d,p,result,id);return result;}});
