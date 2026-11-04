import {preconditionFailure} from './precondition.mjs';
import {noteUnlicensedUse} from './offense-notes.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {cloneData} from './storage.mjs';
import {registerMagicEffect}from'./magic-effects.mjs';
import {environmentFeatures,featureRecordMatches,localPlayerPoint,localSightClear}from'./environment.mjs';
import {assertMagicTargeting}from'./magic-targeting.mjs';
import {resolveCreature}from'./wildlife.mjs';
import {trackSingleItem,changeItems,heldUnit}from'./items.mjs';
import {placed as placedStock,moveStock} from './stock.mjs';
import {declareLedgerWriter} from './ledger.mjs';
// S1b: 封存与落地的单件记在所在地点的 placed 账户，取回再转回行囊。
declareLedgerWriter('magic-mind-space');
import {magicContractTrace}from'./contracts.mjs';
import {prepareAnchorCargo}from'./magic-movement.mjs';
import {monsterStats}from'./combat.mjs';
import {assertSpellConsent,hasSpellConsent,spellConsentGrant}from'./magic-consent.mjs';
import {personMental}from'./entity-view.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {hypot} from './det-math.mjs';
declareHoldingWriter('magic-mind-space',{kinds:[],locations:true});

// Bounds describe consumers for unpublished authoring candidates.
export const mindSpaceMechanisms=Object.freeze({
 record_feeling:[1,1440],sense_mind:[1,0],sleep:[20,60],memory_guard:[1,43200],
 rest_bless:[1,120],comfort:[10,30],contract_sense:[1,0],counter_contract:[20,0],corrode:[1,30],
 measure:[1,0],organize:[1,60],retrieve:[2,0],bag_seal:[90,60],store:[2,30],
 lock_space:[1,30],alarm:[1,120],block_space:[1,30],calibrate_anchor:[1,0],anchor_cargo:[2,0],repair_space:[1,0],
});
const mental=new Set(['sense_mind','sleep','memory_guard','rest_bless','comfort']);
const clone=x=>cloneData(x),key=id=>`physical_feature:${id}`;
const distance=(a,b)=>hypot(a[0]-b[0],a[1]-b[1]);
const path=id=>id==='player'?['state','player']:['state',id.startsWith('npc_')?'npcs':'creatures',id];
const number=(n,min,max,label)=>{if(!Number.isFinite(n)||n<min||n>max)throw preconditionFailure(`${label}未登记或超出范围`);return n;};
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
const effects=(d,op)=>Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='mind_space'&&(!op||e.operation===op));
export function mindSpaceState(d,row){
 const r=d.get('state','records',key(row.id));
 if(r&&!featureRecordMatches(d,r,row))throw Error('心契空间对象状态键冲突');
 return clone(r?.state??row.state??{});
}
const storeState=(d,row,state)=>d.set(['state','records',key(row.id)],{...d.get('state','records',key(row.id)),category:'physical_feature',id:row.id,location:row.location,state});
function locate(engine,id,location){
 const rows=environmentFeatures(engine).filter(r=>(!location||r.location===location)&&(r.id===id||r.name===id));
 if(rows.length!==1)throw preconditionFailure('需要登记的真实环境对象');return rows[0];
}
function permission(d,row,args,until,action='environment_use'){
 if(action==='environment_use'&&row.owner==='player')return null;
 const id=[args.authorization,args.permit,...args.authorizations??[]].find(id=>{
  const r=d.get('state','records',id);
  return r?.category==='authorization'&&r.action===action&&r.subject===row.id&&r.grantor===row.owner&&r.grantee==='player'&&!r.revoked&&Number.isSafeInteger(r.expires)&&r.expires>until;
 });
 if(!id)return noteUnlicensedUse(d,row);return id;
}
function access(d,engine,row,c,args,until,read=false){
 const from=localPlayerPoint(d);
 if(!point(row.position)||distance(from,row.position)>c.rangeMeters||!localSightClear(d,engine,row.location,from,row.position))throw preconditionFailure('对象超过实际距离或视线被遮挡');
 return read?null:permission(d,row,args,until);
}
function consent(d,id,authorization,until,spell,location){
 return hasSpellConsent(d,id,authorization,'mental_magic',{id:spell,location},until);
}
function mind(d,id,engine){
 const m=clone(d.get(...path(id),'mental')??(engine?personMental(engine,d.get('state'),id).value:null));
 if(!m)throw preconditionFailure('目标没有登记实际精神与疲劳状态');
 for(const k of ['fatigue','alertness','stress'])number(m[k],0,100,k);
 if(!Array.isArray(m.interference))throw preconditionFailure('精神干扰状态未知');return m;
}
function targetMind(d,engine,c,args,until){
 const id=resolveCreature(engine,d,args.target??'player'),a=d.get(...path(id));
 if(!a||isPhysicallyDead(engine,d,id)||['濒死','昏迷'].includes(a.status)||id!=='player'&&a.location!==d.get('state','location'))throw preconditionFailure('精神观察目标不在场或无法同意');
 assertMagicTargeting(d,engine,c,args,id);
 assertSpellConsent(d,engine,c,args,id,'mental_magic',until);
 if(!id.startsWith('npc_')&&id!=='player'){
  const base=engine.byId.get(id),template=base?.template??engine.byId.get(base?.monster)?.template;
  if(!Number.isFinite(template)||monsterStats({level:a.level??base?.levelRange?.[0]??1,template,bossTier:base?.tier??0},engine.rules).divine)throw preconditionFailure('不能越过神性屏障或未知生命规则');
 }
 // Existing memories and status effects do not require a fatigue subsystem.
 const needsVitals=['sleep','rest_bless','comfort'].includes(c.effectSpec.operation);
 return{id,actor:a,mind:needsVitals||a.mental?mind(d,id,engine):null};
}
function unit(d,engine,id){
 const u=d.get('state','itemInstances',id),def=u&&engine.byId.get(u.item);
 if(!u||!def||u.owner!=='player'||!Number.isFinite(u.durability)||u.durability<0)throw preconditionFailure('需要真实自有且状态已登记的单件物品');
 number(def.weight,0,5000,'单件重量');return{...clone(u),weight:def.weight};
}
function contents(d,engine,row,s){
 if(row.kind!=='container'||!Array.isArray(s.contents))throw preconditionFailure('需要实际袋内单件清单');
 number(s.capacityKg,.01,5000,'袋内容量');
 if(new Set(s.contents).size!==s.contents.length)throw Error('袋内单件重复');
 let weight=0;
 const rows=s.contents.map(id=>{
  const u=unit(d,engine,id);
  if(u.status!=='袋内'||u.container!==row.id)throw Error('袋内归属与清单不符');
  weight+=u.weight;return u;
 });
 if(weight>s.capacityKg)throw preconditionFailure('袋内物品超过实际容量');return rows;
}
export function validateMindSpaceCatalog(c){
 const s=c.effectSpec,m=mindSpaceMechanisms[s.operation],errors=[];
 if(!m)return['心契空间机制尚未接入'];
 if(s.power>m[0]||c.duration!==m[1]||!Number.isSafeInteger(c.minutes)||c.minutes<1||c.minutes>60||!Number.isFinite(c.rangeMeters)||c.rangeMeters<0||c.rangeMeters>40)errors.push('心契空间强度、期限或射程越过固定边界');
 if(mental.has(s.operation)&&(c.targeting?.consent!=='mental_magic'||c.targeting?.lineOfSight!==true))errors.push('精神效果须声明本人同意和实际视线');
 if(c.school==='精神'&&s.operation!=='record_feeling'&&c.targeting?.permit!=='mental_magic')errors.push('精神施法须声明当地许可');
 return errors;
}
export function prepareMindSpace(d,c,args,{completion=false}={}){
 const op=c.effectSpec.operation,location=d.get('state','location'),until=d.get('state','minute')+(completion?0:c.minutes);
 const p={catalog:c,spec:c.effectSpec,args:clone(args),location,origin:localPlayerPoint(d),op};
 if(mental.has(op)){
  Object.assign(p,targetMind(d,this,c,args,until));
  const grant=spellConsentGrant(d,p.id,args.authorization,'mental_magic',c,until,this);
  if(grant?.id)p.args.authorization=grant.id;
  if(op==='sleep'&&mindSleeping(d,p.id))throw preconditionFailure('目标已经在自愿睡眠，不能重复叠加');
  if(op==='memory_guard'){
   const memories=p.id==='player'?Object.entries(d.get('memories')??{}).filter(([,m])=>m.subject==='player').map(([id,m])=>({...m,id})):p.actor.memoryStream??[];
   p.memory=memories.find(m=>m.id===args.source);
   if(!p.memory||p.memory.minute>d.get('state','minute')||d.get(...path(p.id),'cognition','blurred',p.memory.id))throw preconditionFailure('护印只能保护本人已有且未模糊的具体记忆');
  }
  return p;
 }
 if(op==='record_feeling'){
  p.item=this.resolve(args.target,'item');
  if(this.quantity(d,'player',p.item)!==1)throw preconditionFailure('感受载体必须是实际持有单件');
  if(typeof args.text!=='string'||!args.text.trim()||args.text.length>80)throw preconditionFailure('只能封存自己的80字以内简短感受');
  p.feeling=args.text.trim();return p;
 }
 if(['contract_sense','counter_contract'].includes(op)){
  p.contract=magicContractTrace(d,args.target);
  if(!p.contract.parties?.includes('player'))throw preconditionFailure('只能接触本人持有的契约');
  if(op==='counter_contract'){
   const e=p.contract.enforcement;
   if(!e||e.channel!=='shadow'||!e.active||!(e.remaining>0)||e.started>d.get('state','minute')||e.expires<=until)throw preconditionFailure('只能反制正在执行的暗影契约');
   p.id=e.target;
   if(!p.contract.parties.includes(p.id))throw preconditionFailure('契约执行对象不在签约双方');
   for(const id of [...new Set(p.contract.parties)]){
    const authorization=[args.authorization,...args.authorizations??[]].find(key=>d.get('state','records',key,'subject')===id);
    targetMind(d,this,{...c,targeting:{lineOfSight:true,consent:'mental_magic',permit:'mental_magic'}},{...args,target:id,authorization},until);
   }
  }
  return p;
 }
 if(['store','anchor_cargo'].includes(op)){
  p.item=this.resolve(args.target,'item');
  if(this.quantity(d,'player',p.item)!==1)throw preconditionFailure('封存或货运需要持有自有单件');
  const def=this.byId.get(p.item);number(def.weight,0,c.effectSpec.power,'轻物载荷');
  if(op==='anchor_cargo')p.cargo=prepareAnchorCargo.call(this,d,c,args,{completion});
  return p;
 }
 if(op==='retrieve'&&d.get('state','itemInstances',args.target)){
  p.unit=unit(d,this,args.target);
  if(p.unit.status!=='落地'||p.unit.location!==location||!point(p.unit.position)||distance(p.origin,p.unit.position)>c.rangeMeters||!localSightClear(d,this,location,p.origin,p.unit.position))throw preconditionFailure('取回目标不在视野内或仍在别人手中');
  number(p.unit.weight,0,c.effectSpec.power,'取回载荷');return p;
 }
 const row=locate(this,args.target,location),s=mindSpaceState(d,row);p.row=row;p.state=s;
 // Anchor calibration is authorised by the owner's anchor grant below, not an environment grant.
 p.permission=access(d,this,row,c,args,until,['measure','calibrate_anchor'].includes(op));
 if(op==='measure'){
  p.other=locate(this,args.destination,location);access(d,this,p.other,c,args,until,true);
  if(!localSightClear(d,this,location,row.position,p.other.position))throw preconditionFailure('两个可见点之间不能隔墙测距');
 }
 if(['organize','retrieve','bag_seal'].includes(op)){
  p.contents=contents(d,this,row,s);
  if(row.owner!=='player')throw preconditionFailure('袋内整理取物只能作用于自有袋');
  if(op==='retrieve'){
   if(s.locked===true)throw preconditionFailure('袋口上锁，不能隔锁取物');
   p.unit=p.contents.find(u=>u.id===args.source);
   if(!p.unit)throw preconditionFailure('须用source选择真实袋内单件');number(p.unit.weight,0,c.effectSpec.power,'取回载荷');
  }
  if(op==='bag_seal'&&(s.closed!==true||!(s.integrity>0)))throw preconditionFailure('隔湿袋需要完整密封袋口');
 }
 if(op==='corrode'){
  if(row.kind==='plant'||s.alive||!['metal','wood','stone'].includes(s.material))throw preconditionFailure('腐蚀只作用于登记的无生命材料');
  number(s.integrity,.01,100,'材料完整度');number(s.corrosionResistance,0,1,'材料抗蚀性');
 }
 if(['lock_space','alarm','block_space'].includes(op)){
  if(row.kind!=='door'||!point(row.position))throw preconditionFailure('必须使用登记的实际门框或通道');
  number(s.blockRadiusMeters,.01,1,'狭小通道半径');
  if(op==='lock_space'&&(!s.keyItem||!this.byId.get(s.keyItem)||s.locked!==true||!Number.isFinite(s.lockGapMm)))throw preconditionFailure('锁隙术需要真实机械锁与钥匙登记');
  if(op==='block_space'&&(!Array.isArray(row.connects)||row.connects.length!==2))throw preconditionFailure('封界必须有实际通道及公开标示');
 }
 if(op==='calibrate_anchor'){
  if(row.spaceAnchor!==true||s.anchorIntact!==true||!point(s.anchorOffsetMeters)||distance(s.anchorOffsetMeters,[0,0])>.5)throw preconditionFailure('只能校准已有锚点的小幅偏移');
  p.permission=permission(d,row,args,until,'teleport_anchor');
 }
 if(op==='repair_space'){
  const a=s.spaceAnomaly;
  if(!a||a.divine!==false||a.radiusMeters>.5||!(a.radiusMeters>0)||!(a.intensity>0)||a.intensity>1)throw preconditionFailure('只能修补小型非神性空间异常');
 }
 return p;
}
function putEffect(d,p,eventId,extra={}){
 const now=d.get('state','minute'),e={kind:'mind_space',operation:p.op,spell:p.catalog.id,target:p.id??p.row?.id??p.item,owner:'player',power:p.spec.power,location:p.location,started:now,expires:now+p.catalog.duration,sourceEvent:eventId,...(p.args.authorization?{authorization:p.args.authorization}:{}),...(p.args.force===true?{forced:true}:{}),...(p.permission?{permission:p.permission}:{}),...extra};
 d.set(['state','effects',eventId],e);return e;
}
function detach(d,engine,item,eventId,status,extra={}){
 const id=trackSingleItem(d,engine,'player',item,eventId);
 changeItems(d,engine,'player',item,-1,{preserve:true,selection:[id],books:{account:placedStock(engine,extra.location,item),writer:'magic-mind-space',eventId}});
 holdingSet(d,null,['state','itemInstances',id],{...d.get('state','itemInstances',id),status,...extra},'magic-mind-space');return id;
}
function pickup(d,engine,u){
 changeItems(d,engine,'player',u.item,1,{books:{account:placedStock(engine,u.status==='袋内'?u.container:u.location,u.item),writer:'magic-mind-space',eventId:u.id}});
 const bag=engine.bagPath('player');
 d.set([...bag,u.item,'instances'],[...d.get(...bag,u.item,'instances')??[],u.id]);
 const next={...u,status:'持有'};for(const k of ['container','location','position','weight'])delete next[k];
 holdingSet(d,null,['state','itemInstances',u.id],next,'magic-mind-space');
}
export function applyMindSpace(d,initial,eventId){
 const p=prepareMindSpace.call(this,d,initial.catalog,initial.args,{completion:true});
 if(p.location!==initial.location||distance(p.origin,initial.origin)!==0)throw preconditionFailure('施法期间位置改变，效果已回滚');
 const now=d.get('state','minute'),op=p.op,result={target:p.id??p.row?.id??p.item??p.unit?.id,operation:op};
 if(op==='sense_mind'){
  const count=(p.mind?.interference.length??0)+Object.values(d.get('state','effects')??{}).filter(e=>e.kind==='status'&&e.target===p.id&&['illusion','compulsion'].includes(e.status)&&e.expires>now&&e.remainingUses!==0).length;
  return{...result,interference:count>0,interferenceCount:count};
 }
 if(op==='record_feeling'){
  const id=trackSingleItem(d,this,'player',p.item,eventId),record=`feeling:${eventId}`;
  d.set(['state','records',record],{category:'feeling_carrier',owner:'player',targetInstance:id,feeling:p.feeling,minute:now,expires:now+p.catalog.duration,sourceEvent:eventId});
  return{...result,carrier:record,feeling:p.feeling};
 }
 if(op==='sleep'){
  const sleepy=p.mind.fatigue>=40&&p.mind.fatigue>p.mind.alertness;
  if(!sleepy)return{...result,sleeping:false,note:'疲劳不足或警觉过高，未入睡'};
  putEffect(d,p,eventId,{previousActivity:p.actor.activity??null,sleeping:true});
  holdingSet(d,null,[...path(p.id),'activity'],'睡眠','magic-mind-space');return{...result,sleeping:true};
 }
 if(['memory_guard','rest_bless','comfort'].includes(op)){
  const e=putEffect(d,p,eventId,{...(p.memory?{memory:p.memory.id}:{} )});
  if(op==='memory_guard'&&p.id==='player')d.set(['memories',p.memory.id,'guardUntil'],e.expires);
  if(op==='comfort')holdingSet(d,null,[...path(p.id),'mental'],{...p.mind,stress:Math.max(0,p.mind.stress-p.spec.power)},'magic-mind-space');
  return{...result,effect:eventId,expires:e.expires,...(p.memory?{memory:p.memory.id,truthVerified:false}:{})};
 }
 if(op==='contract_sense')return{...result,target:p.args.target,changes:p.contract.changes,legalJudgement:false};
 if(op==='counter_contract'){
  const e=clone(p.contract.enforcement),success=p.spec.power>=e.power;
  if(success){e.active=false;e.endedAt=now;e.counterSource=eventId;d.set(['state','records',p.args.target,'enforcement'],e);}
  else for(const id of [...new Set(p.contract.parties)]){
   if(!d.get(...path(id)))continue;
   const m=mind(d,id,this);holdingSet(d,null,[...path(id),'mental'],{...m,stress:Math.min(100,m.stress+Math.min(20,e.power-p.spec.power))},'magic-mind-space');
  }
  d.set(['state','records',`counter_contract:${eventId}`],{category:'contract_counter',contract:p.args.target,success,minute:now,sourceEvent:eventId});
  return{...result,target:p.args.target,countered:success,backlash:!success};
 }
 if(op==='measure')return{...result,destination:p.other.id,metres:distance(p.row.position,p.other.position)};
 if(op==='retrieve'){
  if(p.row){const s=p.state;s.contents=s.contents.filter(id=>id!==p.unit.id);s.closed=false;storeState(d,p.row,s);}
  pickup(d,this,p.unit);return{...result,item:p.unit.item,instance:p.unit.id};
 }
 if(op==='store'){
  const instance=detach(d,this,p.item,eventId,'封存',{location:p.location,position:p.origin});
  const e=putEffect(d,p,eventId,{instance,point:p.origin});return{...result,instance,expires:e.expires};
 }
 if(op==='anchor_cargo'){
  const to=p.cargo.destination,instance=detach(d,this,p.item,eventId,'落地',{location:to.location,position:[...to.position]});
  d.set(['state','records',`anchor_cargo:${eventId}`],{category:'anchor_cargo',instance,from:p.cargo.source.id,destination:to.id,permissions:p.cargo.permissions,minute:now,sourceEvent:eventId});
  return{...result,instance,destination:to.id,location:to.location};
 }
 const s=p.state;
 if(op==='organize'){
  s.contents=p.contents.sort((a,b)=>a.item.localeCompare(b.item)||a.id.localeCompare(b.id)).map(u=>u.id);
  s.organizedUntil=now+p.catalog.duration;storeState(d,p.row,s);return{...result,contents:s.contents,capacityKg:s.capacityKg};
 }
 if(op==='calibrate_anchor'){s.anchorOffsetMeters=[0,0];s.calibratedAt=now;storeState(d,p.row,s);return{...result,offset:[0,0]};}
 if(op==='repair_space'){
  s.spaceAnomaly.intensity=Math.max(0,s.spaceAnomaly.intensity-p.spec.power);
  if(!s.spaceAnomaly.intensity){s.spaceAnomaly.closedAt=now;s.blocksSpace=Boolean(s.blocksMovement);}
  storeState(d,p.row,s);return{...result,intensity:s.spaceAnomaly.intensity};
 }
 const e=putEffect(d,p,eventId,{...(op==='lock_space'?{gapMm:s.lockGapMm}:{}),...(op==='block_space'?{publicSign:'空间封界：此通道暂时封闭'}:{}),...(op==='alarm'?{signals:[]}:{} )});
 if(op==='corrode')d.set(['state','records',`corrosion_trace:${eventId}`],{category:'corrosion_trace',target:p.row.id,owner:'player',sourceEvent:eventId,minute:now});
 return{...result,effect:eventId,expires:e.expires,...(e.publicSign?{publicSign:e.publicSign}:{})};
}

function effective(d,e,minute){
 if(e.started>minute||e.expires<=minute)return false;
 if(mental.has(e.operation))return e.forced===true||consent(d,e.target,e.authorization,minute,e.spell,e.location);
 if(e.permission){const r=d.get('state','records',e.permission);return r?.grantee==='player'&&!r.revoked&&r.expires>minute;}
 return true;
}
export function memoryGuardUntil(d,id,memory,now){
 return effects(d,'memory_guard').filter(([,e])=>e.target===id&&e.memory===memory&&effective(d,e,now)).reduce((n,[,e])=>Math.max(n,e.expires),0);
}
export function mindSleeping(d,id){return effects(d,'sleep').some(([,e])=>e.target===id&&e.sleeping&&effective(d,e,d.get('state','minute')));}
export function mindSleepUntil(d,id,now){
 return effects(d,'sleep').filter(([,e])=>e.target===id&&e.sleeping&&effective(d,e,now)).reduce((n,[,e])=>{
  const permission=spellConsentGrant(d,e.target,e.authorization,'mental_magic',{id:e.spell,location:e.location},now);
  return Math.max(n,Math.min(e.expires,permission?.expires??Infinity));
 },now);
}
export function assertMindAwake(d,id='player'){
 if(mindSleeping(d,id))throw preconditionFailure('正在自愿睡眠，只能等待休养结束');
}
export function advanceMindSpace(d,engine,before,after){
 const byTarget=new Map();
 for(const [id,e]of effects(d)){
  let end=Math.min(after,e.expires),start=Math.max(before,e.started);
  if(mental.has(e.operation)&&e.target!=='player'&&!e.forced){
   const grant=spellConsentGrant(d,e.target,e.authorization,'mental_magic',{id:e.spell,location:e.location},start,engine);
   end=!grant?start:Math.min(end,grant.expires);
  }
  if(e.permission){const r=d.get('state','records',e.permission);end=r?.revoked||!r?start:Math.min(end,r.expires);}
  const minutes=Math.max(0,end-start);
  if(e.operation==='store'&&e.expires<=after){
   const u=d.get('state','itemInstances',e.instance);
   if(u?.status==='封存'){moveStock(d,{from:placedStock(engine,u.location,u.item),to:placedStock(engine,e.location,u.item),amount:1,writer:'magic-mind-space',eventId:e.sourceEvent});holdingSet(d,null,['state','itemInstances',e.instance],{...u,status:'落地',location:e.location,position:e.point,droppedAt:e.expires},'magic-mind-space');}
  }
  if(mental.has(e.operation)){
   const a=d.get(...path(e.target));if(!a)continue;
   if(e.operation==='sleep'&&e.sleeping){
    if(minutes>0&&!isPhysicallyDead(engine,d,e.target)){
     const m=mind(d,e.target,engine);m.fatigue=Math.max(0,m.fatigue-minutes/2);holdingSet(d,null,[...path(e.target),'mental'],m,'magic-mind-space');
     holdingSet(d,null,[...path(e.target),'activity'],'睡眠','magic-mind-space');
    }
    if(!effective(d,e,after)||isPhysicallyDead(engine,d,e.target)){
     d.set(['state','effects',id,'sleeping'],false);
     if(d.get(...path(e.target),'activity')==='睡眠')holdingSet(d,null,[...path(e.target),'activity'],e.previousActivity,'magic-mind-space');
    }
   }
   if(e.operation==='rest_bless'&&minutes>0&&!isPhysicallyDead(engine,d,e.target)&&(e.target==='player'?d.get('state','records','mind_rest_activity')===true:/休息|睡眠|熟睡|睡觉/.test(a.activity??''))){
    byTarget.set(e.target,Math.max(byTarget.get(e.target)??0,minutes));
   }
   continue;
  }
  if(!e.target?.startsWith('feature_')||minutes===0)continue;
  const row=locate(engine,e.target,e.location),s=mindSpaceState(d,row);
  if(e.operation==='corrode'){
   s.integrity=Math.max(0,s.integrity-minutes*e.power*(1-s.corrosionResistance));
   if(!s.integrity){s.blocksSight=false;s.blocksMovement=false;}
   storeState(d,row,s);
  }
 }
 for(const [target,minutes]of byTarget){
  const m=mind(d,target,engine);m.fatigue=Math.max(0,m.fatigue-minutes/4);m.stress=Math.max(0,m.stress-minutes/10);holdingSet(d,null,[...path(target),'mental'],m,'magic-mind-space');
 }
 // Physical water ingress continues without a spell; holes always leak.
 // Preserve validation of every materialized record, including non-containers.
 // Untouched non-containers have neither ingress nor a state-key conflict.
 for(const row of environmentFeatures(engine,undefined,r=>r.kind==='container'&&Number.isFinite(r.state?.mouthIngressMlPerMinute)||d.get('state','records',key(r.id)))){
  const s=mindSpaceState(d,row);
  if(row.kind!=='container'||!Number.isFinite(s.mouthIngressMlPerMinute))continue;
  const seals=effects(d,'bag_seal').filter(([,e])=>e.target===row.id),cuts=new Set([before,after]);
  for(const [,e]of seals)for(const at of [e.started,e.expires])if(at>before&&at<after)cuts.add(at);
  const times=[...cuts].sort((a,b)=>a-b);let water=0;
  for(let i=1;i<times.length;i++){
   const power=s.closed?seals.filter(([,e])=>effective(d,e,times[i-1])).reduce((n,[,e])=>Math.max(n,e.power),0):0;
   water+=(times[i]-times[i-1])*(s.mouthIngressMlPerMinute*(1-power/100)+(s.holeIngressMlPerMinute??0));
  }
  if(water){s.wetMl=(s.wetMl??0)+water;storeState(d,row,s);}
 }
}
function crosses(row,s,from,to){
 const dx=to[0]-from[0],dy=to[1]-from[1],length=dx*dx+dy*dy;
 const t=length?Math.max(0,Math.min(1,((row.position[0]-from[0])*dx+(row.position[1]-from[1])*dy)/length)):0;
 return distance(row.position,[from[0]+t*dx,from[1]+t*dy])<=s.blockRadiusMeters;
}
export function assertMindSpacePath(d,engine,location,from,to,{destination,eventId,signal=false}={}){
 for(const [id,e]of effects(d)){
  if(!['alarm','block_space','lock_space'].includes(e.operation)||!effective(d,e,d.get('state','minute')))continue;
  const row=locate(engine,e.target),s=mindSpaceState(d,row);
  const hit=destination?row.connects?.includes(location)&&row.connects.includes(destination):row.location===location&&crosses(row,s,from,to);
  if(!hit)continue;
  if(e.operation==='block_space'||e.operation==='lock_space'&&s.locked)throw preconditionFailure('封界或机械锁阻断通道');
  if(e.operation==='alarm'&&signal){
   const signals=[...e.signals??[]];if(signals.some(r=>r.eventId===eventId))continue;
   signals.push({minute:d.get('state','minute'),eventId,identified:false});d.set(['state','effects',id,'signals'],signals);
   d.set(['state','records',`door_alarm:${id}:${eventId}`],{category:'door_alarm',target:row.id,minute:d.get('state','minute'),identified:false,sourceEvent:eventId});
   d.say(`${row.name}的门框警号响起`);
  }
 }
}
export function unlockMindSpaceDoor(d,engine,args){
 const row=environmentFeatures(engine).find(r=>r.id===args.target&&r.kind==='door'&&r.location===d.get('state','location'));
 if(!row||!effects(d,'lock_space').some(([,e])=>e.target===row.id&&effective(d,e,d.get('state','minute'))))return;
 const s=mindSpaceState(d,row);
 if(!s.locked)return;
 if(args.item!==s.keyItem||engine.quantity(d,'player',s.keyItem)<1)throw preconditionFailure('机械锁必须用实际持有的真实钥匙打开');
 if(distance(localPlayerPoint(d),row.position)>1)throw preconditionFailure('开锁需要实际接触门锁');
 s.locked=false;s.open=true;storeState(d,row,s);
}
export function inspectMindSpace(d,engine,row){
 const s=mindSpaceState(d,row),out={};
 if(row.owner==='player'&&Array.isArray(s.contents)){out.contents=contents(d,engine,row,s).map(u=>({id:u.id,item:u.item}));out.organized=s.organizedUntil>d.get('state','minute');out.capacityKg=s.capacityKg;}
 for(const [,e]of effects(d))if(e.target===row.id&&effective(d,e,d.get('state','minute'))){
  if(e.publicSign)out.publicSign=e.publicSign;
  if(row.owner==='player'&&e.operation==='alarm')out.signals=clone(e.signals);
 }
 return out;
}
export function inspectMindCarrier(d,engine,args){
 if(!args.target?.startsWith('item_'))return null;
 const item=engine.resolve(args.target,'item');
 if(engine.quantity(d,'player',item)<1)throw preconditionFailure('感受载体需要实际持有');
 const held=heldUnit(d,engine,'player',item),now=d.get('state','minute');
 const feelings=Object.values(d.get('state','records')??{}).filter(r=>r.category==='feeling_carrier'&&r.owner==='player'&&r.targetInstance===held?.instance&&r.expires>now).map(r=>({feeling:r.feeling,minute:r.minute,sourceEvent:r.sourceEvent}));
 return{item,feelings,actionScope:{kind:'instant',instantaneous:true}};
}
// Spell effect family (dispatched by magic.mjs through magic-effects.mjs).
registerMagicEffect({kinds:['mind_space'],validate:validateMindSpaceCatalog,prepare(d,c,args){return prepareMindSpace.call(this,d,c,args);},apply(d,p,id){return applyMindSpace.call(this,d,p,id);}});
