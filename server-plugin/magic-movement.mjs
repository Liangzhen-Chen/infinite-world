import {preconditionFailure} from './precondition.mjs';
import {prunePhysicalContacts} from './record-cleanup.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,localPlayerPoint,localSightClear}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {assertLocationAccess}from'./location-access.mjs';
import {assertNpcObligationAction}from'./npc-obligations.mjs';
import {assertNpcAutonomyAction}from'./npc-autonomy.mjs';
import {enforceLegalRestriction}from'./law.mjs';
import {digest}from'./storage.mjs';
import {assertWaterEarthMovement}from'./magic-water-earth.mjs';
import {assertMindSpacePath,assertMindAwake}from'./magic-mind-space.mjs';
export const movementKinds=Object.freeze(['anchor_sense','blink','teleport']);
const validPoint=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const knownKey=id=>`known_anchor:${id}`;
export function validateMovementCatalog(catalog){
 const s=catalog.effectSpec,errors=[];
 const fields=['kind','power',...(s.kind==='anchor_sense'?[]:['maxDistanceMeters','maxLoadKg','maxCompanions'])];
 if(Object.keys(s).some(k=>!fields.includes(k))||s.power!==1)errors.push('位移效果含未实现参数或强度');
 if(!Number.isSafeInteger(catalog.minutes)||catalog.minutes<1||catalog.minutes>60||catalog.duration!==0||!Number.isFinite(catalog.rangeMeters)||catalog.rangeMeters<0||catalog.rangeMeters>100)errors.push('位移须有1至60分钟施法代价、瞬时效果与有限近端射程');
 if(catalog.targeting?.lineOfSight!==true||catalog.targeting.consent||catalog.targeting.permit)errors.push('位移须声明视线；锚点许可使用独立许可账');
 if(s.kind!=='anchor_sense'){
  if(!Number.isFinite(s.maxDistanceMeters)||s.maxDistanceMeters<=0||s.maxDistanceMeters>(s.kind==='blink'?100:1000000))errors.push('位移距离上限无效');
  if(!Number.isFinite(s.maxLoadKg)||s.maxLoadKg<1||s.maxLoadKg>5000||!Number.isSafeInteger(s.maxCompanions)||s.maxCompanions<0||s.maxCompanions>8)errors.push('位移载荷或同行人数上限无效');
 }
 return errors;
}
const stateOf=(d,row)=>d.get('state','records',`physical_feature:${row.id}`)?.state??row.state;
const fingerprint=row=>digest({id:row.id,location:row.location,owner:row.owner,position:row.position,spaceAnchor:row.spaceAnchor});
function anchor(d,engine,row){
 if(row?.spaceAnchor!==true||typeof row.owner!=='string'||!validPoint(row.position))throw preconditionFailure('目标不是登记的空间锚点');
 if(stateOf(d,row)?.anchorIntact!==true)throw preconditionFailure('锚点损坏或状态未知');
 const offset=stateOf(d,row)?.anchorOffsetMeters;
 if(offset&&(!validPoint(offset)||distance(offset,[0,0])>.05))throw preconditionFailure('锚点偏移，须先取得许可校准');
 return row;
}
function assertKnown(d,row){
 const r=d.get('state','records',knownKey(row.id));
 if(r?.category!=='known_anchor'||r.subject!==row.id||r.owner!==row.owner||r.location!==row.location||r.fingerprint!==fingerprint(row)||!r.sourceEvent||!Number.isSafeInteger(r.discoveredAt)||r.discoveredAt>d.get('state','minute'))throw preconditionFailure('未知锚点或锚点所属及位置已改变，须实地重新辨识');
 return r;
}
function permits(d,row,args,companions,arrival){
 const keys=[args.permit,...args.authorizations??[]].filter(Boolean);
 const id=keys.find(key=>{const r=d.get('state','records',key);return r?.category==='authorization'&&r.action==='teleport_anchor'&&r.subject===row.id&&r.grantor===row.owner&&r.grantee==='player'&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>arrival&&companions.every(n=>r.guests?.includes(n));});
 if(!id)throw preconditionFailure('传送锚点需要所有者给本人及同行者的有效许可');
 return id;
}
function clearSpace(d,engine,location,from,to){
 assertMindSpacePath(d,engine,location,from,to);
 if(engine.byId.get(location)?.access?.spaceBlocked===true)throw preconditionFailure('所在地存在空间封锁');
 for(const row of environmentFeatures(engine).filter(r=>r.location===location)){
  const s=stateOf(d,row);if(!s?.blocksSpace&&!s?.blocksMovement)continue;
  if(!validPoint(row.position)||!Number.isFinite(s.blockRadiusMeters)||s.blockRadiusMeters<0)throw preconditionFailure('空间障碍范围未知');
  const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((row.position[0]-from[0])*dx+(row.position[1]-from[1])*dy)/length)):0;
  if(distance(row.position,[from[0]+t*dx,from[1]+t*dy])<=s.blockRadiusMeters)throw preconditionFailure('墙体或空间封锁阻断位移');
 }
}
function loadOf(d,engine,companions){
 // Body mass uses the existing travel rule; unknown item mass cannot count as zero.
 const mass=engine.rules.petCare?.riderWeightKg??70;
 if(!Number.isFinite(mass)||mass<=0)throw preconditionFailure('角色载荷规则未知');
 let total=mass*(companions.length+1);
 for(const inventory of [d.get('state','inventory'),...companions.map(id=>d.get('state','npcs',id,'inventory'))])for(const[id,entry]of Object.entries(inventory??{})){
  const quantity=typeof entry==='number'?entry:entry.quantity,weight=engine.byId.get(id)?.weight;
  if(!Number.isSafeInteger(quantity)||quantity<0||!Number.isFinite(weight)||weight<0)throw preconditionFailure('载荷物品重量或数量未知');
  total+=quantity*weight;
 }
 return total;
}
export function prepareMovement(d,catalog,args,{completion=false}={}){
 const errors=validateMovementCatalog(catalog);if(errors.length)throw Error(errors.join('；'));
 assertMindAwake(d);
 enforceLegalRestriction(d,'cast',args);
 if(d.get('state','player','status')!=='正常')throw preconditionFailure('当前生命状态无法完成空间施法');
 const location=d.get('state','location'),point=localPlayerPoint(d),rows=environmentFeatures(this),row=rows.find(r=>r.id===args.target);
 if(!validPoint(point)||!row||!validPoint(row.position))throw preconditionFailure('位移需要真实环境落脚点，不能使用自报坐标');
 const s=catalog.effectSpec,arrival=d.get('state','minute')+(completion?0:catalog.minutes);
 if(s.kind==='anchor_sense'){
  anchor(d,this,row);
  if(row.location!==location||distance(point,row.position)>catalog.rangeMeters||!localSightClear(d,this,location,point,row.position))throw preconditionFailure('锚点须在实际射程内且视线无遮挡');
  return{spec:s,catalog,args:{...args},row,location,point};
 }
 for(const target of ['player',...d.get('state','player','companions')??[]]){assertWaterEarthMovement(d,target);assertMindAwake(d,target);}
 const companions=[...d.get('state','player','companions')??[]];
 if(new Set(companions).size!==companions.length||companions.length>s.maxCompanions)throw preconditionFailure('位移同行人数超额');
 if(d.get('state','player','mount')||Object.values(d.get('state','pets')??{}).some(p=>p.following)||Object.values(d.get('state','effects')??{}).some(e=>e.kind==='summon'&&e.owner==='player'))throw preconditionFailure('位移尚不支持坐骑、宠物或召唤物载荷，须先解除同行');
 for(const id of companions){
  const actor=d.get('state','npcs',id),f=areaTargetFacts(d,this,id,location,point);
  if(!actor||isPhysicallyDead(this,d,id)||['濒死','昏迷','患病'].includes(actor.status)||/睡眠|熟睡|睡觉/.test(actor.activity??'')||!f||f.lineOfSight!==true||distance(point,f.point)>catalog.rangeMeters)throw preconditionFailure('同行者缺少实际近端位置或无法清醒同行');
 }
 const loadKg=loadOf(d,this,companions);if(loadKg>s.maxLoadKg)throw preconditionFailure('位移载荷超额');
 let metres,sourceAnchor,permitIds=[];
 if(s.kind==='blink'){
  if(row.location!==location||stateOf(d,row)?.blinkLanding!==true)throw preconditionFailure('短移须使用同地点已登记的可用地形落脚点');
  if(row.owner!=='player'&&row.access!=='public'){
   const r=d.get('state','records',args.authorization);
   if(r?.category!=='authorization'||r.action!=='environment_use'||r.subject!==row.id||r.grantor!==row.owner||r.grantee!=='player'||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=arrival||companions.some(id=>!r.guests?.includes(id)))throw preconditionFailure('短移落脚点需要所有者有效许可');
  }
  metres=distance(point,row.position);
  if(!localSightClear(d,this,location,point,row.position))throw preconditionFailure('短移落脚点视线被遮挡');
  clearSpace(d,this,location,point,row.position);
 }else{
  anchor(d,this,row);assertKnown(d,row);
  const sources=rows.filter(r=>r.spaceAnchor&&r.location===location&&validPoint(r.position)&&distance(point,r.position)<=catalog.rangeMeters);
  if(sources.length!==1)throw preconditionFailure('须站在唯一已知出发锚点的实际射程内');
  sourceAnchor=anchor(d,this,sources[0]);assertKnown(d,sourceAnchor);
  if(sourceAnchor.id===row.id)throw preconditionFailure('传送需要不同的两个已知锚点');
  if(!localSightClear(d,this,location,point,sourceAnchor.position))throw preconditionFailure('出发锚点视线被遮挡');
  clearSpace(d,this,location,point,sourceAnchor.position);clearSpace(d,this,row.location,row.position,row.position);
  const route=this.route(location,row.location,'walk',d.get('state','minute'),d.document.randomSeed);
  metres=route.edges.reduce((sum,id)=>sum+this.world.routes.find(e=>e.id===id).lengthKm*1000,0)+distance(point,sourceAnchor.position)+(location===row.location?distance(sourceAnchor.position,row.position):distance(sourceAnchor.position,[0,0])+distance(row.position,[0,0]));
  permitIds=[permits(d,sourceAnchor,args,companions,arrival),permits(d,row,args,companions,arrival)];
 }
 if(metres>s.maxDistanceMeters)throw preconditionFailure('目标超过位移实际距离上限');
 assertLocationAccess(d,this,row.location,{authorization:args.authorization,companions,arrivalMinute:arrival});
 assertNpcObligationAction(d,this,['player',...companions],{minutes:completion?0:catalog.minutes,location:row.location,kind:'move'});
 assertNpcAutonomyAction(d.get('state'),companions,{minutes:completion?0:catalog.minutes});
 return{spec:s,catalog,args:{...args},row,location,point,companions,loadKg,metres,sourceAnchor,permitIds};
}
export function applyMovement(d,p,eventId){
 // Throwing at completion discards the entire draft, including costs and clock.
 const initial=p;
 p=prepareMovement.call(this,d,p.catalog,p.args,{completion:true});
 if(p.location!==initial.location||distance(p.point,initial.point)!==0||JSON.stringify(p.companions??[])!==JSON.stringify(initial.companions??[]))throw preconditionFailure('施法期间出发位置或同行成员改变，位移已回滚');
 const now=d.get('state','minute');
 if(p.spec.kind==='anchor_sense'){
  const key=knownKey(p.row.id),record={category:'known_anchor',subject:p.row.id,owner:p.row.owner,location:p.row.location,position:[...p.row.position],fingerprint:fingerprint(p.row),discoveredAt:now,sourceEvent:eventId};
  d.set(['state','records',key],record);return{target:p.row.id,anchor:key,intact:true,owner:p.row.owner};
 }
 const destination=p.row.location;
 assertMindSpacePath(d,this,p.location,initial.point,p.row.position,{destination:p.location===destination?undefined:destination,eventId,signal:true});
 d.set(['state','location'],destination);d.set(['state','discoveries',destination],{minute:now,source:'亲历',sourceEvent:eventId});
 d.set(['state','records','local_player_position'],{category:'local_position',subject:'player',location:destination,point:[...p.row.position],anchor:p.row.id,source:eventId,minute:now});
 for(const id of p.companions){
  d.set(['state','npcs',id,'location'],destination);
  const source=`physical_contact:${eventId}:${id}`,expires=now+10,activity=d.get('state','npcs',id,'activity')??null;
  d.set(['state','records',source],{category:'physical_contact',subject:id,location:destination,point:[...p.row.position],visibleFrom:[...p.row.position],event:eventId,minute:now,expires,activity});
  d.set(['state','records',`local_actor_position:${id}`],{category:'local_position',subject:id,location:destination,point:[...p.row.position],source,minute:now,expires,activity});
  prunePhysicalContacts(d);
 }
 if(p.sourceAnchor)for(const row of [p.sourceAnchor,p.row])d.set(['state','records',knownKey(row.id),'permission'],p.permitIds[row===p.sourceAnchor?0:1]);
 const key=`magic_movement:${eventId}`;
 d.set(['state','records',key],{category:'magic_movement',operation:p.spec.kind,from:p.location,destination,point:[...p.row.position],companions:p.companions,loadKg:p.loadKg,metres:p.metres,permissions:p.permitIds,sourceEvent:eventId,minute:now});
 return{target:p.row.id,destination,position:[...p.row.position],companions:p.companions,loadKg:p.loadKg,metres:p.metres,movement:key};
}

// Cargo reuses the same anchor identity, owner grants and blockade checks.
export function prepareAnchorCargo(d,catalog,args,{completion=false}={}){
 const location=d.get('state','location'),origin=localPlayerPoint(d),rows=environmentFeatures(this);
 const source=rows.find(r=>r.id===args.source),destination=rows.find(r=>r.id===args.destination);
 const until=d.get('state','minute')+(completion?0:catalog.minutes);
 for(const row of [source,destination]){anchor(d,this,row);assertKnown(d,row);}
 if(source.id===destination.id||source.location!==location||distance(origin,source.position)>catalog.rangeMeters||!localSightClear(d,this,location,origin,source.position))throw preconditionFailure('货运需要两个不同已知锚点及实际近端距离');
 clearSpace(d,this,location,origin,source.position);clearSpace(d,this,destination.location,destination.position,destination.position);
 const route=this.route(location,destination.location,'walk',d.get('state','minute'),d.document.randomSeed);
 const metres=route.edges.reduce((n,id)=>n+this.world.routes.find(e=>e.id===id).lengthKm*1000,0);
 if(metres>100000)throw preconditionFailure('货运锚点超过100公里');
 const permissions=[permits(d,source,args,[],until),permits(d,destination,args,[],until)];
 // Entry permission remains distinct from an anchor-use grant.
 assertLocationAccess(d,this,destination.location,{authorization:args.authorization,arrivalMinute:until});
 return{source,destination,permissions,metres};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:movementKinds,validateSpec:validateMovementCatalog,prepare(d,c,args){return prepareMovement.call(this,d,c,args);},apply(d,p,id){return applyMovement.call(this,d,p,id);}});
