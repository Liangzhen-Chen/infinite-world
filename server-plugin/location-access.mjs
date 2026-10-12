import {environmentFeatures}from'./environment.mjs';
// Existing authorization records govern entry; the route alone is not consent.
export function assertLocationAccess(d,engine,destination,{authorization,companions=[],arrivalMinute=d.get('state','minute')}={}){
 const place=engine.byId.get(destination),access=place?.access;
 if(access?.mode!=='private'||access.requiresConsent!==true)return;
 const permission=authorization?d.get('state','records',authorization):null;
 const residents=new Set(access.residents??[]),grantor=engine.byId.get(permission?.grantor);
 const allowed=permission?.category==='authorization'&&permission.subject===destination&&permission.action==='enter_home'
  &&permission.grantee==='player'&&residents.has(permission.grantor)&&(grantor?.age??0)>=18
  &&permission.revoked!==true&&Number.isSafeInteger(permission.expires)&&permission.expires>arrivalMinute
  &&companions.every(id=>residents.has(id)||permission.guests?.includes(id));
 if(!allowed)throw new Error(`进入${place.name}需要成年住户给本人及同行者的有效许可；许可须覆盖抵达时刻，未进入或扣除路费`);
}

// Register the host's NPC decision using the existing authorization ledger.
// A named resident in the roster cannot act or consent without an active NPC.
export function homePermission(d,engine,args,eventId){
 if(!['grant_access','revoke_access'].includes(args.operation))return null;
 const anchorResult=anchorPermission(d,engine,args,eventId);if(anchorResult)return anchorResult;
 const grantor=engine.resolve(args.promisor,'npc'),base=engine.byId.get(grantor),actor=d.get('state','npcs',grantor),now=d.get('state','minute');
 if(!actor||base.tier!=='full'||base.age<18||actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel
    ||['死亡','濒死','昏迷','患病'].includes(actor.status)||/睡眠|熟睡|睡觉/.test(actor.activity??''))throw Error('私宅许可须由实际在场且清醒的成年住户作出');
 if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw Error('当前私宅许可只登记给玩家及指定同行者');
 if(args.operation==='revoke_access'){
  const old=d.get('state','records',args.authorization);
  if(old?.category!=='authorization'||old.action!=='enter_home'||old.grantor!==grantor||old.grantee!=='player')throw Error('只有原签发住户能撤销这份私宅许可');
  if(old.revoked)return{authorization:args.authorization,permission:old,duplicate:true};
  const permission={...old,revoked:true,revokedAt:now,revokedBy:grantor};d.set(['state','records',args.authorization],permission);
  d.say(`${base.name}收回了进入${engine.byId.get(old.subject).name}的许可`);return{authorization:args.authorization,permission};
 }
 const location=engine.resolve(args.location??args.destination),place=engine.byId.get(location);
 if(place?.access?.mode!=='private'||!place.access.requiresConsent||!place.access.residents?.includes(grantor))throw Error('签发者不是这处私宅的登记住户');
 const minutes=args.minutes??60;
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)throw Error('私宅许可有效时长须为1到1440分钟');
 if(typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw Error('需要记录住户同意的拜访用途');
 if(args.guests!==undefined&&(!Array.isArray(args.guests)||args.guests.length>8))throw Error('获准同行者须为最多8人的名单');
 const guests=(args.guests??[]).map(name=>engine.resolve(name,'npc'));
 if(new Set(guests).size!==guests.length)throw Error('获准同行者重复');
 for(const id of guests){const guest=d.get('state','npcs',id);
  if(!guest||guest.location!==actor.location||!d.get('state','player','companions')?.includes(id))throw Error('获准同行者必须是当前实际在场的同行人');
 }
 const authorization=`permission_${eventId}`;
 if(d.get('state','records',authorization))throw Error('私宅许可编号已经存在');
 const permission={category:'authorization',action:'enter_home',subject:location,grantor,grantee:'player',guests,createdAt:now,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId};
 d.set(['state','records',authorization],permission);d.say(`${base.name}同意你${guests.length?'和已登记同行者':''}进入${place.name}，许可至${engine.formatCalendar(permission.expires)}`);
 return{authorization,permission};
}

// The existing grant/revoke action also records owner-issued anchor permits.
function anchorPermission(d,engine,args,eventId){
 const old=args.authorization?d.get('state','records',args.authorization):null;
 const feature=environmentFeatures(engine).find(row=>row.id===(args.location??args.destination??old?.subject)&&row.spaceAnchor===true);
 if(!feature&&old?.action!=='teleport_anchor')return null;
 if(!feature)throw Error('许可所属锚点已不存在');
 const grantor=engine.resolve(args.promisor,'npc'),base=engine.byId.get(grantor),actor=d.get('state','npcs',grantor),now=d.get('state','minute');
 if(feature.owner!==grantor||base?.tier!=='full'||base.age<18||!actor||actor.location!==feature.location||actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel||['死亡','濒死','昏迷','患病'].includes(actor.status)||/睡眠|熟睡|睡觉/.test(actor.activity??''))throw Error('锚点许可须由实际在场且清醒的成年所有者签发或撤销');
 if(args.promisee!==undefined&&engine.resolve(args.promisee)!=='player')throw Error('锚点许可只登记给玩家及指定同行者');
 if(args.operation==='revoke_access'){
  if(old?.category!=='authorization'||old.action!=='teleport_anchor'||old.subject!==feature.id||old.grantor!==grantor||old.grantee!=='player')throw Error('只有原签发所有者能撤销锚点许可');
  if(old.revoked)return{authorization:args.authorization,permission:old,duplicate:true};
  const permission={...old,revoked:true,revokedAt:now,revokedBy:grantor};d.set(['state','records',args.authorization],permission);d.say(`${base.name}撤销了${feature.name}的传送许可`);return{authorization:args.authorization,permission};
 }
 const minutes=args.minutes??60;
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440||typeof args.content!=='string'||!args.content.trim()||args.content.length>1200)throw Error('锚点许可须记录用途及1至1440分钟有效时长');
 if(args.guests!==undefined&&(!Array.isArray(args.guests)||args.guests.length>8))throw Error('获准同行者须为最多8人的名单');
 const guests=(args.guests??[]).map(name=>engine.resolve(name,'npc'));
 if(new Set(guests).size!==guests.length||guests.some(id=>d.get('state','npcs',id,'location')!==actor.location||!d.get('state','player','companions')?.includes(id)))throw Error('获准同行者必须是当前实际在场且不重复的同行人');
 const authorization=`permission_${eventId}`;
 if(d.get('state','records',authorization))throw Error('锚点许可编号已存在');
 const permission={category:'authorization',action:'teleport_anchor',subject:feature.id,grantor,grantee:'player',guests,createdAt:now,expires:now+minutes,revoked:false,content:args.content.trim(),sourceEvent:eventId};
 d.set(['state','records',authorization],permission);
 const key=`known_anchor:${feature.id}`,known=d.get('state','records',key);
 if(known?.category==='known_anchor'&&known.subject===feature.id&&known.owner===grantor)d.set(['state','records',key,'permission'],authorization);
 d.say(`${base.name}同意你和已登记同行者使用${feature.name}，许可至${engine.formatCalendar(permission.expires)}`);return{authorization,permission};
}
