import {localPlayerPoint}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {enforceLegalRestriction}from'./law.mjs';
export const messageKinds=Object.freeze(['message','consent_link']);
const moods=Object.freeze(['平静','紧张','高兴','难过']);
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|熟睡|睡觉/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
export function validateMessageCatalog(catalog){
 const s=catalog.effectSpec,errors=[],link=s.kind==='consent_link';
 const fields=['kind','power','maxChars','maxDistanceMeters','delayMinutes',...(link?['upkeepMp','upkeepMinutes']:[])];
 if(Object.keys(s).some(k=>!fields.includes(k))||s.power!==1)errors.push('传讯含未实现参数或强度');
 if(!integer(s.maxChars,1,80)||!Number.isFinite(s.maxDistanceMeters)||s.maxDistanceMeters<=0||s.maxDistanceMeters>1000000||!integer(s.delayMinutes,1,60))errors.push('传讯须声明有限字数、距离与1至60分钟到达延迟');
 if(!integer(catalog.minutes,1,60)||catalog.targeting!==undefined)errors.push('传讯须有有限施法时间，使用独立距离与本人许可规则');
 if(link?(!integer(catalog.duration,1,1440)||!integer(s.upkeepMp,1,500)||!integer(s.upkeepMinutes,1,1440)):catalog.duration!==0)errors.push('精神连接须声明有限时限和维持魔力，单次传讯须为瞬时');
 return errors;
}
// Same-place actors need actual contact evidence. Between places the trusted
// route length is the distance rule; an unknown route length never becomes zero.
export function messageDistance(d,engine,target){
 const actor=d.get('state','npcs',target),location=d.get('state','location'),action=engine.npcObligationAction;
 if(action?.tool==='move'&&d.get('state','minute')<action.arrivalMinute)throw Error('玩家正在途中，没有可确认的传讯位置');
 if(action?.tool==='time'&&action.args?.activity==='睡眠')throw Error('玩家正在睡眠，不能维持自愿精神连接或传讯');
 if(!awake(actor)||!actor.location||!awake(d.get('state','player')))throw Error('传讯双方须清醒且有实际位置，途中不能传讯');
 if(actor.location===location){
  const point=localPlayerPoint(d),facts=areaTargetFacts(d,engine,target,location,point);
  if(!facts)throw Error('缺少收者实际距离事实，须先实际接触');
  return{meters:Math.hypot(point[0]-facts.point[0],point[1]-facts.point[1]),basis:'local_contact',edges:[]};
 }
 const route=engine.route(location,actor.location,'walk',d.get('state','minute'),d.document.randomSeed);
 let meters=0;
 for(const id of route.edges){const edge=engine.world.routes.find(e=>e.id===id);if(!edge||!Number.isFinite(edge.lengthKm)||edge.lengthKm<0)throw Error('消息路线缺少真实距离');meters+=edge.lengthKm*1000;}
 if(!route.edges.length||!Number.isFinite(meters)||meters<=0)throw Error('消息路线缺少真实距离');
 return{meters,basis:'route_length',edges:[...route.edges]};
}
const permissionAction=kind=>kind==='consent_link'?'consent_link':'mental_message';
export function messageConsent(d,target,key,kind,until){
 const r=d.get('state','records',key);
 if(r?.category!=='authorization'||r.action!==permissionAction(kind)||r.subject!==target||r.grantor!==target||r.grantee!=='player'||r.revoked||!r.sourceEvent||!integer(r.createdAt,0,d.get('state','minute'))||!Number.isSafeInteger(r.expires)||r.expires<=until)throw Error('传讯需要本人仍有效的自愿同意，许可须覆盖到达时刻');
 return r;
}
export function prepareMessage(d,catalog,args,{completion=false}={}){
 const errors=validateMessageCatalog(catalog);if(errors.length)throw Error(errors.join('；'));
 enforceLegalRestriction(d,'cast',args);
 const target=this.resolve(args.target,'npc'),base=this.byId.get(target);
 if(base?.tier!=='full'||!d.get('state','npcs',target))throw Error('传讯收者须为实际登记的完整人物');
 const s=catalog.effectSpec,now=d.get('state','minute');
 if(s.kind==='consent_link'&&args.text==='断开'){
  const links=Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind==='consent_link'&&e.owner==='player'&&e.target===target);
  if(!links.length)throw Error('没有本人可断开的精神连接');
  return{target,catalog,spec:s,disconnect:links.map(([id])=>id),args:{...args}};
 }
 let text=args.text;
 if(s.kind==='message'&&(typeof text!=='string'||!text.trim()))throw Error('传讯须给出本人主动发送的文字');
 if(text!==undefined&&(typeof text!=='string'||!text.trim()||text!==text.trim()||[...text].length>s.maxChars||text.length>80))throw Error('传讯文字为空或超过字数上限');
 if(s.kind==='consent_link'&&text!==undefined&&!moods.includes(text))throw Error('精神连接只发送本人主动声明的有限情绪');
 const arrive=now+(completion?0:catalog.minutes)+s.delayMinutes;
 messageConsent(d,target,args.authorization,s.kind,text===undefined?now+(completion?0:catalog.minutes):arrive);
 const distance=messageDistance(d,this,target);
 if(distance.meters>s.maxDistanceMeters)throw Error('收者超过传讯实际距离上限');
 const existing=s.kind==='consent_link'?Object.entries(d.get('state','effects')??{}).find(([,e])=>e.kind==='consent_link'&&e.owner==='player'&&e.target===target&&e.expires>now):null;
 if(existing&&(text===undefined||existing[1].authorization!==args.authorization||existing[1].spell!==catalog.id))throw Error('本人已有此收者的精神连接，须引用原许可发送情绪或先断开');
 if(s.kind==='consent_link'&&text!==undefined&&(existing?.[1].expires??now+(completion?0:catalog.minutes)+catalog.duration)<=arrive)throw Error('精神连接时限不足以覆盖消息到达');
 return{target,catalog,spec:s,text,distance,arrive,existingLink:existing?.[0],args:{...args,target}};
}
export function applyMessage(d,initial,id){
 let p;try{p=prepareMessage.call(this,d,initial.catalog,initial.args,{completion:true});}catch(error){return{target:initial.target,effectFailed:`施法完成前条件失效：${error.message}`};}
 if(p.disconnect){for(const key of p.disconnect)endLink(d,key,'本人断开',d.get('state','minute'));return{target:p.target,disconnected:p.disconnect};}
 const now=d.get('state','minute'),s=p.spec,permission=d.get('state','records',p.args.authorization);
 let expires;
 if(p.existingLink)expires=d.get('state','effects',p.existingLink,'expires');
 else if(s.kind==='consent_link'){
  expires=Math.min(now+p.catalog.duration,permission.expires);
  d.set(['state','effects',id],{kind:'consent_link',spell:p.catalog.id,owner:'player',target:p.target,source:id,authorization:p.args.authorization,createdAt:now,expires,maxDistanceMeters:s.maxDistanceMeters,upkeepMp:s.upkeepMp,upkeepMinutes:s.upkeepMinutes,nextUpkeep:now+s.upkeepMinutes,spentMp:0});
 }
 let messageId;
 if(p.text!==undefined){
  messageId=`magic_message_${id}`;
  d.set(['state','npcCognition','messages',messageId],{id:messageId,from:'player',to:p.target,channel:'magic',status:'在途',sourceEvent:id,depart:now,arrive:p.arrive,content:p.text,charCount:[...p.text].length,distanceMeters:p.distance.meters,distanceBasis:p.distance.basis,routeEdges:p.distance.edges,maxDistanceMeters:s.maxDistanceMeters,authorization:p.args.authorization,consentKind:s.kind,knownBy:['player',p.target],...(s.kind==='consent_link'?{link:p.existingLink??id}:{} )});
  d.say(`传讯已发出，将于${this.formatCalendar(p.arrive)}抵达${this.byId.get(p.target).name}`);
 }
 return{target:p.target,...(messageId?{messageId,arrive:p.arrive,text:p.text,charCount:[...p.text].length,distanceMeters:p.distance.meters}:{}),...(expires?{effect:p.existingLink??id,expires,upkeepMp:s.upkeepMp,upkeepMinutes:s.upkeepMinutes}:{} )};
}
function endLink(d,id,reason,minute){
 const e=d.get('state','effects',id);if(!e)return;
 d.set(['state','records',`ended_link:${id}`],{category:'ended_magic_link',sourceEvent:e.source,target:e.target,endedAt:minute,reason,spentMp:e.spentMp});
 d.remove(['state','effects',id]);
 for(const m of Object.values(d.get('state','npcCognition','messages')??{}))if(m.link===id&&m.status==='在途'){
  d.set(['state','npcCognition','messages',m.id,'status'],'中止');d.set(['state','npcCognition','messages',m.id,'reason'],reason);
 }
}
export function advanceMagicMessages(d,engine,before,after){
 let delivered=0;
 for(const[id,e]of Object.entries(d.get('state','effects')??{}).sort(([a],[b])=>a.localeCompare(b))){
  if(e.kind!=='consent_link')continue;
  let reason;
  if(after>=e.expires)reason='连接到期';
  else try{messageConsent(d,e.target,e.authorization,'consent_link',after);if(messageDistance(d,engine,e.target).meters>e.maxDistanceMeters)reason='连接超距';}catch(error){reason=error.message;}
  if(reason){endLink(d,id,reason,after);continue;}
  // The cognition clock visits every upkeep boundary. Never charge past an
  // interruption, and never charge twice when an event is replayed.
  let next=e.nextUpkeep,spent=e.spentMp;
  while(next<=after&&next<e.expires){
   const mp=d.get('state','player','mp');if(mp<e.upkeepMp){reason='维持魔力不足';break;}
   d.set(['state','player','mp'],mp-e.upkeepMp);spent+=e.upkeepMp;next+=e.upkeepMinutes;
  }
  d.set(['state','effects',id,'spentMp'],spent);
  if(reason)endLink(d,id,reason,after);else d.set(['state','effects',id,'nextUpkeep'],next);
 }
 for(const message of Object.values(d.get('state','npcCognition','messages')??{}).sort((a,b)=>a.arrive-b.arrive||a.id.localeCompare(b.id))){
  if(message.channel!=='magic'||message.status!=='在途'||message.arrive>after)continue;
  let reason;
  try{
   messageConsent(d,message.to,message.authorization,message.consentKind,after);
   if(message.link&&!d.get('state','effects',message.link))throw Error('精神连接已断开');
   if(messageDistance(d,engine,message.to).meters>message.maxDistanceMeters)throw Error('抵达时收者超距');
  }catch(error){reason=error.message;}
  if(reason){d.set(['state','npcCognition','messages',message.id,'status'],'中止');d.set(['state','npcCognition','messages',message.id,'reason'],reason);continue;}
  const stream=d.get('state','npcs',message.to,'memoryStream')??[],memoryId=`heard_${message.id}`;
  if(!stream.some(m=>m.id===memoryId))d.set(['state','npcs',message.to,'memoryStream'],[...stream,{id:memoryId,rootMemoryId:memoryId,kind:'magic_message',sourceEvent:message.sourceEvent,minute:after,occurredAt:message.depart,location:d.get('state','npcs',message.to,'location'),participants:['player',message.to],content:message.content,sourceType:'听说',heardFrom:'player',channel:'magic',messageId:message.id,salience:2,emotion:'待核实',private:true,visibility:'private',knownBy:[...message.knownBy],permittedRecipients:[...message.knownBy],reliability:'未经亲历核实',transmissionChain:[{from:'player',to:message.to,minute:after,channel:'magic'}]}]);
  d.set(['state','npcCognition','messages',message.id,'status'],'已交付');d.set(['state','npcCognition','messages',message.id,'deliveredAt'],after);delivered++;
  d.say(`传讯已抵达${engine.byId.get(message.to).name}`);
 }
 return delivered;
}
export function nextMagicMessageMinute(state,after){
 const links=Object.values(state.effects??{}).filter(e=>e.kind==='consent_link');
 return Math.min(Infinity,...links.flatMap(e=>[e.nextUpkeep,e.expires,state.records?.[e.authorization]?.expires].filter(n=>Number.isSafeInteger(n)&&n>after)));
}
// Reuses world_promise grant_access/revoke_access, with a narrow named purpose.
// The integration point is homePermission; no generic mental-magic permit is issued.
export function magicMessagePermission(d,engine,args,eventId){
 if(!['grant_access','revoke_access'].includes(args.operation))return null;
 const old=d.get('state','records',args.authorization),action=args.location??args.destination??old?.action;
 if(!['mental_message','consent_link'].includes(action))return null;
 const target=engine.resolve(args.promisor,'npc'),base=engine.byId.get(target),actor=d.get('state','npcs',target),now=d.get('state','minute');
 if(base?.tier!=='full'||base.age<18||!awake(actor)||actor.location!==d.get('state','location'))throw Error('精神同意须由实际在场且清醒的成年本人给出或收回');
 if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw Error('精神同意只登记给玩家');
 if(args.guests?.length)throw Error('精神同意不能代替其他人的自愿许可');
 if(args.operation==='revoke_access'){
  if(old?.category!=='authorization'||old.action!==action||old.subject!==target||old.grantor!==target||old.grantee!=='player')throw Error('只有原签发本人能收回精神同意');
  if(old.revoked)return{authorization:args.authorization,consent:old,duplicate:true};
  const permission={...old,revoked:true,revokedAt:now,revokedBy:target};d.set(['state','records',args.authorization],permission);
  for(const[id,e]of Object.entries(d.get('state','effects')??{}))if(e.kind==='consent_link'&&e.authorization===args.authorization)endLink(d,id,'本人收回同意',now);
  rememberConsent(d,target,action,eventId,true);d.say(`${base.name}收回了${action==='consent_link'?'精神连接':'限距传讯'}同意`);return{authorization:args.authorization,consent:permission};
 }
 if(Object.values(d.get('state','effects')??{}).some(e=>e.kind==='status'&&e.target===target&&e.expires>now&&e.power>0&&['fear','illusion','compulsion'].includes(e.status)))throw Error('精神干扰期间不能登记自愿同意');
 messageDistance(d,engine,target);
 const minutes=args.minutes??60;
 if(!integer(minutes,1,1440)||typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw Error('精神同意须记录用途及1至1440分钟有效时长');
 const authorization=`permission_${eventId}`;if(d.get('state','records',authorization))throw Error('精神同意编号已经存在');
 const permission={category:'authorization',action,subject:target,grantor:target,grantee:'player',createdAt:now,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId};
 d.set(['state','records',authorization],permission);rememberConsent(d,target,action,eventId,false);d.say(`${base.name}同意${action==='consent_link'?'自愿精神连接':'接收限距传讯'}，许可至${engine.formatCalendar(permission.expires)}`);
 return{authorization,consent:permission};
}

function rememberConsent(d,target,action,eventId,revoked){
 const stream=d.get('state','npcs',target,'memoryStream')??[],id=`${eventId}:magic_consent`;
 if(stream.some(row=>row.id===id))return;
 d.set(['state','npcs',target,'memoryStream'],[...stream,{id,sourceEvent:eventId,kind:'magic_consent',minute:d.get('state','minute'),location:d.get('state','location'),participants:['player',target],content:`本人${revoked?'收回':'给予'}玩家${action==='consent_link'?'自愿精神连接':'接收限距传讯'}同意`,sourceType:'亲历',salience:3,emotion:'认真',private:true,knownBy:['player',target],permittedRecipients:['player',target]}]);
}
