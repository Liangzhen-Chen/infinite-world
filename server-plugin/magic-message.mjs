import {localPlayerPoint}from'./environment.mjs';
import {areaTargetFacts}from'./magic-area.mjs';
import {heldUnit}from'./items.mjs';
import {enforceLegalRestriction}from'./law.mjs';
export const messageKinds=Object.freeze(['message','mind_message','consent_link','team_link']);
const moods=Object.freeze(['平静','紧张','高兴','难过']),rhythms=Object.freeze(['前进','撤退','防守','合围','停步']);
const permissionLabels={mental_message:'接收限距传讯',consent_link:'自愿精神连接',team_link:'多人战术节奏连接'};
const isLink=kind=>['consent_link','team_link'].includes(kind);
const isEffect=e=>isLink(e?.kind);
const membersOf=e=>e.kind==='team_link'?e.members:{[e.target]:{authorization:e.authorization}};
const participantsOf=e=>['player',...Object.keys(membersOf(e))];
const integer=(n,min,max)=>Number.isSafeInteger(n)&&n>=min&&n<=max;
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|熟睡|睡觉/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
export function validateMessageCatalog(catalog){
 const s=catalog.effectSpec,errors=[],link=isLink(s.kind);
 const fields=['kind','power','maxChars','maxDistanceMeters','delayMinutes','markRequired','markText',...(link?['upkeepMp','upkeepMinutes']:[]),...(s.kind==='team_link'?['maxMembers']:[])];
 if(Object.keys(s).some(k=>!fields.includes(k))||s.power!==1)errors.push('传讯含未实现参数或强度');
 if(!integer(s.maxChars,1,80)||!Number.isFinite(s.maxDistanceMeters)||s.maxDistanceMeters<=0||s.maxDistanceMeters>1000000||!integer(s.delayMinutes,1,60))errors.push('传讯须声明有限字数、距离与1至60分钟到达延迟');
 if(!integer(catalog.minutes,1,60)||catalog.targeting!==undefined)errors.push('传讯须有有限施法时间，使用独立距离与本人许可规则');
 if(link?(!integer(catalog.duration,1,1440)||!integer(s.upkeepMp,1,500)||!integer(s.upkeepMinutes,1,1440)):catalog.duration!==0)errors.push('精神连接须声明有限时限和维持魔力，单次传讯须为瞬时');
 if(s.kind==='team_link'&&!integer(s.maxMembers,3,9))errors.push('多人连接须声明3至9人上限，包含玩家');
 if(s.markRequired!==undefined&&typeof s.markRequired!=='boolean')errors.push('符记要求必须为明确布尔值');
 if((s.kind==='mind_message'||s.markRequired)&&!(typeof s.markText==='string'&&s.markText.trim()===s.markText&&s.markText.length>=1&&s.markText.length<=80))errors.push('符记传讯须声明有限符文文字');
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
const permissionAction=kind=>isLink(kind)?kind:'mental_message';
export function messageConsent(d,target,key,kind,until){
 const r=d.get('state','records',key);
 if(r?.category!=='authorization'||r.action!==permissionAction(kind)||r.subject!==target||r.grantor!==target||r.grantee!=='player'||r.revoked||!r.sourceEvent||!integer(r.createdAt,0,d.get('state','minute'))||!Number.isSafeInteger(r.expires)||r.expires<=until)throw Error('传讯需要本人仍有效的自愿同意，许可须覆盖到达时刻');
 return r;
}
function routeDistance(d,engine,from,to){
 const route=engine.route(from,to,'walk',d.get('state','minute'),d.document.randomSeed);
 let meters=0;for(const id of route.edges){const edge=engine.world.routes.find(e=>e.id===id);if(!edge||!Number.isFinite(edge.lengthKm)||edge.lengthKm<0)throw Error('消息路线缺少真实距离');meters+=edge.lengthKm*1000;}
 if(!route.edges.length||meters<=0)throw Error('消息路线缺少真实距离');return{meters,basis:'route_length',edges:[...route.edges]};
}
function participantDistance(d,engine,from,to){
 if(from==='player')return messageDistance(d,engine,to);
 if(to==='player')return messageDistance(d,engine,from);
 const a=d.get('state','npcs',from),b=d.get('state','npcs',to);
 if(!awake(a)||!awake(b)||!a.location||!b.location)throw Error('连接成员缺少清醒状态或实际位置');
 if(a.location!==b.location)return routeDistance(d,engine,a.location,b.location);
 const x=areaTargetFacts(d,engine,from,a.location),y=areaTargetFacts(d,engine,to,b.location);
 if(!x||!y)throw Error('缺少连接成员实际距离事实');return{meters:Math.hypot(x.point[0]-y.point[0],x.point[1]-y.point[1]),basis:'local_contact',edges:[]};
}
function assertMark(d,engine,key,spec,until){
 if(spec.kind!=='mind_message'&&!spec.markRequired)return;
 const mark=d.get('state','records',key),instance=mark?.targetInstance?d.get('state','itemInstances',mark.targetInstance):null;
 if(mark?.category!=='magic_mark'||mark.text!==spec.markText||!mark.source||d.get('state','checks',mark.source,'success')!==true||!Number.isSafeInteger(mark.expires)||mark.expires<=until||!mark.target?.startsWith('item_')||engine.quantity(d,'player',mark.target)!==1||!instance||instance.owner!=='player'||instance.status!=='持有'||instance.item!==mark.target||heldUnit(d,engine,'player',mark.target)?.instance!==mark.targetInstance||(instance.durability??0)<=0)throw Error('需要实际持有且仍有效的指定传讯符记，须覆盖到达时刻');
}
function authorizeMembers(d,engine,catalog,args,target,until){
 const s=catalog.effectSpec;if(s.kind!=='team_link'){messageConsent(d,target,args.authorization,s.kind,until);return{[target]:{authorization:args.authorization}};}
 const keys=[args.authorization,...args.authorizations??[]].filter(Boolean),members={};
 if(keys.length<2||keys.length>8||new Set(keys).size!==keys.length)throw Error('多人连接须逐人引用独立且不重复的自愿许可');
 for(const key of keys){const id=d.get('state','records',key,'subject');messageConsent(d,id,key,'team_link',until);if(members[id]||engine.byId.get(id)?.tier!=='full')throw Error('连接成员重复或不是完整人物');members[id]={authorization:key};}
 if(!members[target]||Object.keys(members).length+1>s.maxMembers)throw Error('目标未在许可名单或连接成员超限');
 const participants=['player',...Object.keys(members)];
 for(const[id,m]of Object.entries(members)){const r=d.get('state','records',m.authorization);if(participants.some(p=>p!==id&&!r.recipients?.includes(p)))throw Error('本人许可未覆盖这些连接成员');}
 for(let i=0;i<participants.length;i++)for(let j=i+1;j<participants.length;j++)if(participantDistance(d,engine,participants[i],participants[j]).meters>s.maxDistanceMeters)throw Error('成员超过传讯实际距离上限');
 return members;
}
export function prepareMessage(d,catalog,args,{completion=false}={}){
 const errors=validateMessageCatalog(catalog);if(errors.length)throw Error(errors.join('；'));enforceLegalRestriction(d,'cast',args);
 const target=this.resolve(args.target,'npc');if(this.byId.get(target)?.tier!=='full'||!d.get('state','npcs',target))throw Error('传讯收者须为实际登记的完整人物');
 const s=catalog.effectSpec,now=d.get('state','minute');
 if(isLink(s.kind)&&args.text==='断开'){
  const links=Object.entries(d.get('state','effects')??{}).filter(([,e])=>e.kind===s.kind&&e.owner==='player'&&membersOf(e)[target]);
  if(!links.length)throw Error('没有本人可断开的精神连接');return{target,catalog,spec:s,disconnect:links.map(([id])=>id),args:{...args}};
 }
 const text=args.text;
 if(!isLink(s.kind)&&(typeof text!=='string'||!text.trim()))throw Error('传讯须给出本人主动发送的文字');
 if(text!==undefined&&(typeof text!=='string'||!text.trim()||text!==text.trim()||[...text].length>s.maxChars||text.length>80))throw Error('传讯文字为空或超过字数上限');
 if(isLink(s.kind)&&text!==undefined&&!(s.kind==='team_link'?rhythms:moods).includes(text))throw Error('精神连接只发送本人主动声明的有限情绪或战术节奏');
 const arrive=now+(completion?0:catalog.minutes)+s.delayMinutes,until=text===undefined?now+(completion?0:catalog.minutes):arrive;
 const members=authorizeMembers(d,this,catalog,args,target,until),distance=messageDistance(d,this,target);if(distance.meters>s.maxDistanceMeters)throw Error('收者超过传讯实际距离上限');
 assertMark(d,this,args.permit,s,until);
 const existing=isLink(s.kind)?Object.entries(d.get('state','effects')??{}).find(([,e])=>e.kind===s.kind&&e.owner==='player'&&e.spell===catalog.id&&membersOf(e)[target]&&e.expires>now):null;
 if(existing&&(text===undefined||Object.entries(members).some(([id,m])=>membersOf(existing[1])[id]?.authorization!==m.authorization)||Object.keys(members).length!==Object.keys(membersOf(existing[1])).length||existing[1].mark!==args.permit))throw Error('已有连接须引用原许可和成员发送，或先断开');
 if(isLink(s.kind)&&text!==undefined&&(existing?.[1].expires??now+(completion?0:catalog.minutes)+catalog.duration)<=arrive)throw Error('精神连接时限不足以覆盖消息到达');
 return{target,catalog,spec:s,text,distance,arrive,members,existingLink:existing?.[0],args:{...args,target}};
}
function queueMessage(d,engine,{id,from,to,text,spec,authorization,link,mark,sourceEvent,knownBy}){
 const distance=participantDistance(d,engine,from,to),now=d.get('state','minute');
 const row={id,from,to,channel:'magic',status:'在途',sourceEvent,depart:now,arrive:now+spec.delayMinutes,content:text,charCount:[...text].length,distanceMeters:distance.meters,distanceBasis:distance.basis,routeEdges:distance.edges,maxDistanceMeters:spec.maxDistanceMeters,authorization,consentKind:spec.kind,knownBy, ...(link?{link}:{}),...(mark?{mark,markSpec:spec}:{})};
 d.set(['state','npcCognition','messages',id],row);return row;
}
export function applyMessage(d,initial,id){
 let p;try{p=prepareMessage.call(this,d,initial.catalog,initial.args,{completion:true});}catch(error){return{target:initial.target,effectFailed:`施法完成前条件失效：${error.message}`};}
 if(p.disconnect){for(const key of p.disconnect)endLink(d,key,'本人断开',d.get('state','minute'));return{target:p.target,disconnected:p.disconnect};}
 const now=d.get('state','minute'),s=p.spec;let expires,link=p.existingLink;
 if(link)expires=d.get('state','effects',link,'expires');
 else if(isLink(s.kind)){
  link=id;expires=s.kind==='team_link'?now+p.catalog.duration:Math.min(now+p.catalog.duration,d.get('state','records',p.args.authorization,'expires'));
  d.set(['state','effects',id],{kind:s.kind,spell:p.catalog.id,owner:'player',target:p.target,source:id,authorization:p.args.authorization,createdAt:now,expires,maxDistanceMeters:s.maxDistanceMeters,upkeepMp:s.upkeepMp,upkeepMinutes:s.upkeepMinutes,nextUpkeep:now+s.upkeepMinutes,spentMp:0,maxChars:s.maxChars,delayMinutes:s.delayMinutes,...(p.args.permit?{mark:p.args.permit,markSpec:s}:{}),...(s.kind==='team_link'?{members:p.members}:{} )});
 }
 const recipients=s.kind==='team_link'?Object.keys(p.members):[p.target],ids=[];
 if(p.text!==undefined)for(const to of recipients){const messageId=`magic_message_${id}${s.kind==='team_link'?`:${to}`:''}`;ids.push(messageId);queueMessage(d,this,{id:messageId,from:'player',to,text:p.text,spec:s,authorization:p.members[to].authorization,link,mark:p.args.permit,sourceEvent:id,knownBy:['player',to]});}
 if(ids.length)d.say(`传讯已发出，将于${this.formatCalendar(p.arrive)}抵达${recipients.map(to=>this.byId.get(to).name).join('、')}`);
 return{target:p.target,...(ids.length?{messageId:ids[0],messageIds:ids,arrive:p.arrive,text:p.text,charCount:[...p.text].length,distanceMeters:p.distance.meters}:{}),...(expires?{effect:link,expires,upkeepMp:s.upkeepMp,upkeepMinutes:s.upkeepMinutes,...(s.kind==='team_link'?{members:['player',...recipients],upkeepTotalMp:s.upkeepMp*recipients.length}:{} )}:{} )};
}
function cancelMessages(d,id,reason,member){
 for(const m of Object.values(d.get('state','npcCognition','messages')??{}))if(m.link===id&&m.status==='在途'&&(!member||m.from===member||m.to===member)){d.set(['state','npcCognition','messages',m.id,'status'],'中止');d.set(['state','npcCognition','messages',m.id,'reason'],reason);}
}
function endLink(d,id,reason,minute){
 const e=d.get('state','effects',id);if(!e)return;
 d.set(['state','records',`ended_link:${id}`],{category:'ended_magic_link',sourceEvent:e.source,target:e.target,endedAt:minute,reason,spentMp:e.spentMp});d.remove(['state','effects',id]);cancelMessages(d,id,reason);
}
function removeMember(d,id,member,reason,minute){
 const e=d.get('state','effects',id);if(!e)return;
 if(e.kind!=='team_link'){endLink(d,id,reason,minute);return;}
 const members={...e.members};delete members[member];cancelMessages(d,id,reason,member);
 d.set(['state','effects',id,'members'],members);d.set(['state','records',`link_departure:${id}:${member}`],{category:'magic_link_departure',sourceEvent:e.source,member,minute,reason});
 if(Object.keys(members).length<2)endLink(d,id,'多人连接人数不足',minute);
}
function validMember(d,engine,e,id,until){
 messageConsent(d,id,membersOf(e)[id]?.authorization,e.kind,until);if(messageDistance(d,engine,id).meters>e.maxDistanceMeters)throw Error('连接超距');
}
export function advanceMagicMessages(d,engine,before,after){
 let delivered=0;
 for(const[id,initial]of Object.entries(d.get('state','effects')??{}).sort(([a],[b])=>a.localeCompare(b))){
  if(!isEffect(initial))continue;
  if(after>=initial.expires){endLink(d,id,'连接到期',after);continue;}
  try{assertMark(d,engine,initial.mark,initial.markSpec??{kind:initial.kind},after);}catch(error){endLink(d,id,error.message,after);continue;}
  for(const member of Object.keys(membersOf(initial)))try{validMember(d,engine,initial,member,after);}catch(error){removeMember(d,id,member,error.message,after);}
  let e=d.get('state','effects',id);if(!e)continue;
  if(e.kind==='team_link'){
   const ids=Object.keys(e.members).sort();for(let i=0;i<ids.length;i++)for(let j=i+1;j<ids.length;j++){if(!d.get('state','effects',id,'members',ids[i])||!d.get('state','effects',id,'members',ids[j]))continue;try{if(participantDistance(d,engine,ids[i],ids[j]).meters>e.maxDistanceMeters)throw Error('成员彼此超距');}catch(error){removeMember(d,id,ids[j],error.message,after);}}
   e=d.get('state','effects',id);if(!e)continue;
  }
  let next=e.nextUpkeep,spent=e.spentMp,reason;
  while(next<=after&&next<e.expires){
   const cost=e.upkeepMp*Object.keys(membersOf(e)).length,mp=d.get('state','player','mp');if(mp<cost){reason='维持魔力不足';break;}
   d.set(['state','player','mp'],mp-cost);spent+=cost;next+=e.upkeepMinutes;
  }
  d.set(['state','effects',id,'spentMp'],spent);if(reason)endLink(d,id,reason,after);else d.set(['state','effects',id,'nextUpkeep'],next);
 }
 for(const message of Object.values(d.get('state','npcCognition','messages')??{}).sort((a,b)=>a.arrive-b.arrive||a.id.localeCompare(b.id))){
  if(message.channel!=='magic'||message.status!=='在途'||message.arrive>after)continue;let reason;
  try{
   if(message.link){const link=d.get('state','effects',message.link);if(!link||![message.from,message.to].every(id=>participantsOf(link).includes(id)))throw Error('精神连接已断开或成员退出');for(const id of [message.from,message.to].filter(id=>id!=='player'))validMember(d,engine,link,id,after);}
   else messageConsent(d,message.to,message.authorization,message.consentKind,after);
   assertMark(d,engine,message.mark,message.markSpec??{kind:message.consentKind},after);
   if(participantDistance(d,engine,message.from,message.to).meters>message.maxDistanceMeters)throw Error('抵达时收者超距');
  }catch(error){reason=error.message;}
  if(reason){d.set(['state','npcCognition','messages',message.id,'status'],'中止');d.set(['state','npcCognition','messages',message.id,'reason'],reason);continue;}
  const memoryId=`heard_${message.id}`,row={id:memoryId,rootMemoryId:memoryId,kind:'magic_message',sourceEvent:message.sourceEvent,minute:after,occurredAt:message.depart,location:message.to==='player'?d.get('state','location'):d.get('state','npcs',message.to,'location'),participants:[message.from,message.to],content:message.content,sourceType:'听说',heardFrom:message.from,channel:'magic',messageId:message.id,salience:2,emotion:'待核实',private:true,visibility:'private',knownBy:[...message.knownBy],permittedRecipients:[...message.knownBy],reliability:'未经亲历核实',transmissionChain:[{from:message.from,to:message.to,minute:after,channel:'magic'}]};
  if(message.to==='player'){
   const key=`player::${memoryId}`;if(!d.get('memories',key))d.set(['memories',key],{...row,subject:'player',key:memoryId,source:message.from,keywords:['传讯'],pinned:false});
   d.say(`${engine.byId.get(message.from).name}主动传来：${message.content}`);
  }else{const stream=d.get('state','npcs',message.to,'memoryStream')??[];if(!stream.some(m=>m.id===memoryId))d.set(['state','npcs',message.to,'memoryStream'],[...stream,row]);d.say(`传讯已抵达${engine.byId.get(message.to).name}`);}
  d.set(['state','npcCognition','messages',message.id,'status'],'已交付');d.set(['state','npcCognition','messages',message.id,'deliveredAt'],after);delivered++;
 }
 return delivered;
}
export function nextMagicMessageMinute(state,after){
 const links=Object.values(state.effects??{}).filter(isEffect);
 return Math.min(Infinity,...links.flatMap(e=>[e.nextUpkeep,e.expires,state.records?.[e.mark]?.expires,...Object.values(membersOf(e)).map(m=>state.records?.[m.authorization]?.expires)].filter(n=>Number.isSafeInteger(n)&&n>after)));
}
// Reuses world_promise grant_access/revoke_access, with a narrow named purpose.
// The integration point is homePermission; no generic mental-magic permit is issued.
export function magicMessagePermission(d,engine,args,eventId){
 if(!['grant_access','revoke_access'].includes(args.operation))return null;
 const old=d.get('state','records',args.authorization),action=args.location??args.destination??old?.action;
 if(!['mental_message','consent_link','team_link'].includes(action))return null;
 const target=engine.resolve(args.promisor,'npc'),base=engine.byId.get(target),actor=d.get('state','npcs',target),now=d.get('state','minute');
 if(args.operation==='grant_access'&&args.authorization){if(base?.tier!=='full'||base.age<18||!awake(actor))throw Error('主动声明须由清醒的成年本人作出');return publishDeclaration(d,engine,args,eventId,target,action);}
 if(base?.tier!=='full'||base.age<18||!awake(actor)||args.operation!=='revoke_access'&&actor.location!==d.get('state','location'))throw Error('精神同意须由实际在场且清醒的成年本人给出或收回');

 if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw Error('精神同意只登记给玩家');
 if(action!=='team_link'&&args.guests?.length)throw Error('精神同意不能代替其他人的自愿许可');
 if(args.operation==='revoke_access'){
  if(old?.category!=='authorization'||old.action!==action||old.subject!==target||old.grantor!==target||old.grantee!=='player')throw Error('只有原签发本人能收回精神同意');
  if(old.revoked)return{authorization:args.authorization,consent:old,duplicate:true};
  const permission={...old,revoked:true,revokedAt:now,revokedBy:target};d.set(['state','records',args.authorization],permission);
  for(const[id,e]of Object.entries(d.get('state','effects')??{}))if(isEffect(e)&&membersOf(e)[target]?.authorization===args.authorization)removeMember(d,id,target,'本人收回同意',now);
  rememberConsent(d,target,action,eventId,true);d.say(`${base.name}收回了${permissionLabels[action]}同意`);return{authorization:args.authorization,consent:permission};
 }
 if(Object.values(d.get('state','effects')??{}).some(e=>e.kind==='status'&&e.target===target&&e.expires>now&&e.power>0&&['fear','illusion','compulsion'].includes(e.status)))throw Error('精神干扰期间不能登记自愿同意');
 messageDistance(d,engine,target);
 const minutes=args.minutes??60;
 if(!integer(minutes,1,1440)||typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw Error('精神同意须记录用途及1至1440分钟有效时长');
 if(args.guests!==undefined&&!Array.isArray(args.guests))throw Error('多人许可名单须为数组');
 const guests=action==='team_link'?(args.guests??[]).map(name=>engine.resolve(name,'npc')):[];
 if(guests.length>7||new Set(guests).size!==guests.length||guests.includes(target))throw Error('多人许可的其他成员名单重复或超限');
 for(const id of guests){if(engine.byId.get(id)?.tier!=='full'||!awake(d.get('state','npcs',id))||d.get('state','npcs',id,'location')!==actor.location)throw Error('多人许可名单须是本人实际在场的清醒成员');messageDistance(d,engine,id);}
 const authorization=`permission_${eventId}`;if(d.get('state','records',authorization))throw Error('精神同意编号已经存在');
 const permission={category:'authorization',action,subject:target,grantor:target,grantee:'player',createdAt:now,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId,...(action==='team_link'?{recipients:['player',...guests]}:{})};
 d.set(['state','records',authorization],permission);rememberConsent(d,target,action,eventId,false);d.say(`${base.name}同意${permissionLabels[action]}，许可至${engine.formatCalendar(permission.expires)}`);
 return{authorization,consent:permission};
}

function rememberConsent(d,target,action,eventId,revoked){
 const stream=d.get('state','npcs',target,'memoryStream')??[],id=`${eventId}:magic_consent`;
 if(stream.some(row=>row.id===id))return;
 d.set(['state','npcs',target,'memoryStream'],[...stream,{id,sourceEvent:eventId,kind:'magic_consent',minute:d.get('state','minute'),location:d.get('state','location'),participants:['player',target],content:`本人${revoked?'收回':'给予'}玩家${permissionLabels[action]}同意`,sourceType:'亲历',salience:3,emotion:'认真',private:true,knownBy:['player',target],permittedRecipients:['player',target]}]);
}

function publishDeclaration(d,engine,args,eventId,from,kind){
 if(!isLink(kind)||(kind==='team_link'?rhythms:moods).includes(args.content)!==true)throw Error('NPC只能主动声明有限情绪或战术节奏，不能自动读取秘密或替人承诺');
 const now=d.get('state','minute');messageConsent(d,from,args.authorization,kind,now);
 if(Object.values(d.get('state','effects')??{}).some(e=>e.kind==='status'&&e.target===from&&e.expires>now&&e.power>0&&['fear','illusion','compulsion'].includes(e.status)))throw Error('精神干扰期间不能主动声明自愿情绪');
 const links=Object.entries(d.get('state','effects')??{}).filter(([id,e])=>e.kind===kind&&e.expires>now&&membersOf(e)[from]?.authorization===args.authorization&&(!args.obligation||args.obligation===id));
 if(links.length!==1)throw Error('主动声明须引用本人参与的唯一有效连接');const[id,e]=links[0],spec={kind,power:1,maxChars:e.maxChars,maxDistanceMeters:e.maxDistanceMeters,delayMinutes:e.delayMinutes};
 const recipients=args.promisee!==undefined?[engine.resolve(args.promisee)]:kind==='team_link'?participantsOf(e).filter(id=>id!==from):['player'];
 if(recipients.some(to=>to===from||!participantsOf(e).includes(to)))throw Error('主动声明收者不在本人自愿连接中');
 if(now+e.delayMinutes>=e.expires||[...args.content].length>e.maxChars)throw Error('连接期限或字数不足以发送主动声明');
 for(const member of Object.keys(membersOf(e)))validMember(d,engine,e,member,now+e.delayMinutes);
 assertMark(d,engine,e.mark,e.markSpec??spec,now+e.delayMinutes);
 if(Object.values(d.get('state','npcCognition','messages')??{}).some(m=>m.link===id&&m.from===from&&m.status==='在途'))throw Error('本人上一条主动声明尚在传送，不能重复排队');
 for(const to of recipients)if(participantDistance(d,engine,from,to).meters>e.maxDistanceMeters)throw Error('主动声明收者超过实际距离上限');
 const messageIds=[];
 for(const to of recipients){const messageId=`magic_message_${eventId}:${to}`;messageIds.push(messageId);queueMessage(d,engine,{id:messageId,from,to,text:args.content,spec,authorization:args.authorization,link:id,mark:e.mark,sourceEvent:eventId,knownBy:[from,to]});}
 const stream=d.get('state','npcs',from,'memoryStream')??[];d.set(['state','npcs',from,'memoryStream'],[...stream,{id:`${eventId}:declaration`,kind:'magic_declaration',sourceEvent:eventId,minute:now,location:d.get('state','npcs',from,'location'),participants:[from,...recipients],content:`本人主动传出：${args.content}`,sourceType:'亲历',salience:2,private:true,knownBy:[from],permittedRecipients:[from]}]);
 // Transmission uses the caster-maintained channel; NPCs do not cast a second
 // spell and no unrecorded NPC mana is created or spent.
 d.say(`${engine.byId.get(from).name}主动发出有限声明，将于${engine.formatCalendar(now+e.delayMinutes)}抵达`);
 return{from,recipients,link:id,messageIds,arrive:now+e.delayMinutes,declared:args.content,upkeepPayer:'player'};
}
