import {isPhysicallyDead} from './lifecycle-state.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
// Areas use trusted world/state coordinates. Presence alone never implies range.
import {environmentFeatures,localSightClear}from'./environment.mjs';
import {validateEffectSpec}from'./magic-primitives.mjs';
import {validateMagicCatalog,prepareMagic,applyMagic}from'./magic.mjs';
import {assertSpellConsent,recordSpellViolation}from'./magic-consent.mjs';
const pointValid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const living=(d,target)=>target==='player'?d.get('state','player'):d.get('state',target.startsWith('npc_')?'npcs':'creatures',target);
const locationOf=(d,target)=>target==='player'?d.get('state','location'):living(d,target)?.location;
const childId=(area,target)=>`${area}:member:${target}`;
export function areaTargetFacts(d,engine,target,location,center){
 const actor=living(d,target);if(!actor||isPhysicallyDead(engine,d,target)||locationOf(d,target)!==location||actor.scheduleTravel||actor.cognitionTravel)return null;
 const transit=d.get('state','records','magic_area_transit');
 if(transit?.subjects?.includes(target)&&d.get('state','minute')<transit.arrival)return null;
 if(target==='player'){
  const row=d.get('state','records','local_player_position'),point=row?.location===location?row.point:[0,0];
  return pointValid(point)?{point,lineOfSight:(!center||Math.hypot(point[0]-center[0],point[1]-center[1])===0)&&localSightClear(d,engine,location,center??point,point)}:null;
 }
 const row=d.get('state','records',`local_actor_position:${target}`);
 if(row?.category!=='local_position'||row.subject!==target||row.location!==location||typeof row.source!=='string'||!row.source||!pointValid(row.point))return null;
 const proof=d.get('state','records',row.source),now=d.get('state','minute');
 if(proof?.category!=='physical_contact'||proof.subject!==target||proof.location!==location||typeof proof.event!=='string'||!proof.event||row.source!==`physical_contact:${proof.event}:${target}`||!pointValid(proof.point)||proof.point.some((x,i)=>x!==row.point[i])||!Number.isSafeInteger(proof.minute)||proof.minute>now||proof.expires!==proof.minute+10||proof.expires<=now||row.minute!==proof.minute||row.expires!==proof.expires)return null;
 const origin=center??row.point,visible=pointValid(proof.visibleFrom)&&(origin.every((x,i)=>x===row.point[i])||origin.every((x,i)=>x===proof.visibleFrom[i]));
 return{point:row.point,lineOfSight:visible&&row.lineOfSight!==false&&localSightClear(d,engine,location,origin,row.point)};
}
function facts(d,engine,target,location,center){
 const actor=living(d,target),transit=d.get('state','records','magic_area_transit');
 if(!actor||isPhysicallyDead(engine,d,target)||locationOf(d,target)!==location||actor.scheduleTravel||actor.cognitionTravel||transit?.subjects?.includes(target)&&d.get('state','minute')<transit.arrival)return null;
 const value=engine.magicAreaTargetFacts?.(d,target,location,center)??areaTargetFacts(d,engine,target,location,center);
 return value&&pointValid(value.point)?value:null;
}
export function validateAreaCatalog(catalog){
 if(!catalog||typeof catalog!=='object')return['区域规则目录缺失'];
 const errors=validateEffectSpec(catalog.effectSpec),s=catalog.effectSpec;
 if(s?.kind!=='area')return['此处理器只接受区域'];
 if(!catalog.targeting||catalog.targeting.lineOfSight!==true)errors.push('区域须声明实际距离与视线边界');
 if(!Number.isSafeInteger(catalog.duration)||catalog.duration<1||catalog.duration>43200)errors.push('区域持续时间非法');
 if(['damage','heal','protection'].includes(s.effect?.kind))errors.push(...validateMagicCatalog({...catalog,effectSpec:s.effect,duration:s.effect.kind==='protection'?catalog.duration:0,rangeMeters:s.radiusMeters}));
 return errors;
}
function childCatalog(area){return{...area.catalog,location:area.location,effectSpec:area.catalog.effectSpec.effect,rangeMeters:area.radiusMeters,duration:Math.max(1,area.expires-area.created)};}
function targetArgs(d,engine,area,target){
 const catalog=childCatalog(area),action=catalog.effectSpec.kind==='heal'?'healing':catalog.effectSpec.kind==='protection'?'support_magic':catalog.targeting?.consent;
 const authorization=area.authorizations.find(key=>d.get('state','records',key)?.subject===target);
 if(action&&target!=='player'){
  assertSpellConsent(d,engine,catalog,{authorization,force:area.force},target,action);
 }
 return{target,authorization,permit:area.permit,...(area.force?{force:true}:{})};
}
export function prepareAreaMagic(d,catalog,args,context={}){
 const errors=validateAreaCatalog(catalog);if(errors.length)throw Error(errors.join('；'));
 const source=context.source??'player',location=context.location??locationOf(d,source),origin=facts(d,this,source,location);
 if(!origin||origin.lineOfSight!==true)throw Error('区域来源缺少实际位置与视线事实');
 if(source!=='player'&&catalog.effectSpec.effect.kind!=='damage')throw Error('非玩家区域目前只支持伤害消费者');
 let center;
 const target=args.target??source;
 if(target===source||target==='player'&&source==='player')center=origin.point;
 else{
  const feature=environmentFeatures(this).find(row=>row.location===location&&(row.id===target||row.name===target));
  if(!feature||!pointValid(feature.position))throw Error('区域中心须为来源当前位置或已登记环境对象');
  center=feature.position;
  // Existing physical resolver knows clear sight only at contact.
  if(Math.hypot(center[0]-origin.point[0],center[1]-origin.point[1])!==0)throw Error('缺少区域中心无遮挡视线事实');
 }
 if(Math.hypot(center[0]-origin.point[0],center[1]-origin.point[1])>catalog.rangeMeters)throw Error('区域中心超过实际施法射程');
 const authorizations=[...new Set([args.authorization,...args.authorizations??[]].filter(Boolean))];
 if(authorizations.length>8||authorizations.some(k=>typeof k!=='string'))throw Error('区域授权编号无效');
 return{spec:catalog.effectSpec,catalog,target,location,center:[...center],owner:source,authorizations,permit:args.permit,completionArgs:{...args},context};
}
export function applyAreaMagic(d,prepared,id){
 if(d.get('state','effects',id))throw Error('区域效果编号重复');
 try{prepared=prepareAreaMagic.call(this,d,prepared.catalog,prepared.completionArgs,prepared.context);}
 catch(error){return{target:prepared.target,effectFailed:`施法完成前条件失效：${error.message}`};}
 const now=d.get('state','minute'),s=prepared.spec;
 const area={kind:'area',owner:prepared.owner,source:id,spell:prepared.catalog.id,location:prepared.location,center:prepared.center,radiusMeters:s.radiusMeters,created:now,expires:now+prepared.catalog.duration,nextPulse:now+s.intervalMinutes,cursor:now,authorizations:prepared.authorizations,...(prepared.completionArgs.force===true?{force:true}:{}),...(prepared.permit?{permit:prepared.permit}:{}),catalog:structuredClone(prepared.catalog),members:{}};
 d.set(['state','effects',id],area);
 const outcomes=settleOne(d,this,id,area,true);
 return{target:prepared.target,effect:id,expires:area.expires,location:area.location,radiusMeters:area.radiusMeters,outcomes};
}
function leave(d,id,target,member){
 const key=childId(id,target),child=d.get('state','effects',key);
 const next={...member,inside:false};
 if(child?.areaSource===id){next.remaining=child.remaining;d.remove(['state','effects',key]);}
 return next;
}
function assertAreaRecord(area,now){
 const errors=validateAreaCatalog(area.catalog),interval=area.catalog?.effectSpec?.intervalMinutes;
 if(errors.length||typeof area.source!=='string'||!area.source||typeof area.owner!=='string'||typeof area.location!=='string'||!pointValid(area.center)||area.radiusMeters!==area.catalog.effectSpec.radiusMeters||!Number.isSafeInteger(area.created)||area.created>now||area.expires!==area.created+area.catalog.duration||!Number.isSafeInteger(area.nextPulse)||area.nextPulse<=area.created||(area.nextPulse-area.created)%interval!==0||!Number.isSafeInteger(area.cursor)||area.cursor<area.created||area.cursor>now||!area.members||Array.isArray(area.members)||!Array.isArray(area.authorizations)||area.authorizations.some(k=>typeof k!=='string'))throw Error('区域记录或触发游标损坏，拒绝结算');
 for(const member of Object.values(area.members))if(typeof member?.inside!=='boolean'||!Number.isSafeInteger(member.lastTrigger)||member.lastTrigger>now||member.lastTrigger < -1||member.remaining!==undefined&&(!Number.isSafeInteger(member.remaining)||member.remaining<0||member.remaining>area.catalog.effectSpec.power))throw Error('区域成员游标损坏，拒绝结算');
}
function settleOne(d,engine,id,area,pulse=false){
 const now=d.get('state','minute');assertAreaRecord(area,now);
 const members={...area.members},outcomes=[],targets=[...new Set(['player',...Object.keys(d.get('state','npcs')??{}),...Object.keys(d.get('state','creatures')??{}),...Object.keys(members)])].sort();
 for(const target of targets){
  const member=members[target]??{inside:false,lastTrigger:-1},f=facts(d,engine,target,area.location,area.center);
  const distance=f?Math.hypot(f.point[0]-area.center[0],f.point[1]-area.center[1]):Infinity;
  if(now>=area.expires||distance>area.radiusMeters||f?.lineOfSight!==true){if(member.inside)members[target]=leave(d,id,target,member);continue;}
  let prepared;
  try{prepared=prepareMagic.call(engine,d,childCatalog(area),targetArgs(d,engine,area,target),{location:area.location,source:area.owner,targetFacts:{distanceMeters:distance,lineOfSight:true}});}
  catch(error){if(member.inside)members[target]=leave(d,id,target,member);outcomes.push({target,skipped:error.message});continue;}
  const entry=!member.inside,s=area.catalog.effectSpec;
  if(area.force){
   const incident=`${area.source}:consent:${target}`;
   if(!d.get('state','records',`legal_case:${incident}`))recordSpellViolation(d,engine,childCatalog(area),targetArgs(d,engine,area,target),target,incident);
  }
  if(s.trigger==='presence'){
   const key=childId(id,target);
   if(entry&&member.remaining!==0){
    const result=applyMagic.call(engine,d,{...prepared,catalog:{...prepared.catalog,duration:area.expires-now}},key);
    const child=d.get('state','effects',key);
    if(child){d.set(['state','effects',key],{...child,source:area.source,areaSource:id,owner:area.owner,location:area.location,...(member.remaining!==undefined?{remaining:member.remaining}:{})});outcomes.push(result);}
   }
   members[target]={...member,inside:true};
  }else{
   if((entry||pulse)&&member.lastTrigger!==now){
    const result=applyMagic.call(engine,d,prepared,`${id}:trigger:${now}:${target}`);
    outcomes.push(result);members[target]={...member,inside:true,lastTrigger:now};
   }else members[target]={...member,inside:true};
  }
 }
 if(now>=area.expires){d.remove(['state','effects',id]);return outcomes;}
 const nextPulse=pulse?now+area.catalog.effectSpec.intervalMinutes:area.nextPulse;
 d.set(['state','effects',id],{...area,members,cursor:now,nextPulse});
 return outcomes;
}
export function settleMagicAreas(d,engine){
 const now=d.get('state','minute'),outcomes=[];
 for(const area of Object.values(d.get('state','effects')??{}))if(area.kind==='area')assertAreaRecord(area,now);
 // Withdraw invalid auras before any area deals damage, independent of IDs.
 for(const[id,area]of Object.entries(d.get('state','effects')??{}))if(area.kind==='area'&&area.catalog?.effectSpec?.trigger==='presence'){
  const members={...area.members};let changed=false;
  for(const[target,member]of Object.entries(members))if(member.inside){
   const f=facts(d,engine,target,area.location,area.center);let allowed=now<area.expires&&f?.lineOfSight===true&&Math.hypot(f.point[0]-area.center[0],f.point[1]-area.center[1])<=area.radiusMeters;
   if(allowed)try{targetArgs(d,engine,area,target);}catch{allowed=false;}
   if(!allowed){members[target]=leave(d,id,target,member);changed=true;}
  }
  if(changed)d.set(['state','effects',id],{...area,members});
 }
 for(const[id,area]of Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='area').sort(([a],[b])=>a.localeCompare(b))){
  if(area.nextPulse<now&&area.nextPulse<area.expires)throw Error('区域触发游标被跳过，须沿世界时间边界结算');
  outcomes.push(...settleOne(d,engine,id,area,area.nextPulse===now));
 }
 return outcomes;
}
export function nextMagicAreaMinute(state,now){
 let next=Infinity;
 for(const area of Object.values(state.effects??{}))if(area.kind==='area'){
  if(!Number.isSafeInteger(area.nextPulse)||area.nextPulse<=now||!Number.isSafeInteger(area.expires)||area.expires<=now)throw Error('区域触发游标损坏');
  next=Math.min(next,area.nextPulse,area.expires);
  for(const row of Object.values(state.records??{}))if(row.category==='local_position'&&row.subject!=='player'&&Number.isSafeInteger(row.expires)&&row.expires>now)next=Math.min(next,row.expires);
  for(const key of [...area.authorizations,area.permit].filter(Boolean)){const expires=state.records?.[key]?.expires;if(Number.isSafeInteger(expires)&&expires>now)next=Math.min(next,expires);}
 }
 return next;
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['area'],validate:validateAreaCatalog,prepare(d,c,args,context){return prepareAreaMagic.call(this,d,c,args,context);},apply(d,p,id){return applyAreaMagic.call(this,d,p,id);}});
