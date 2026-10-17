import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('training');
import {personCareer} from './entity-view.mjs';
import {assertNpcService} from './npc-schedule.mjs';
import {digest} from './storage.mjs';
import {convertFaith} from './faith.mjs';
import {temples} from './faith-catalog.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('training',{kinds:['mentor_of','devotee_of','permit','certified'],entities:['office']});

const record=id=>['state','records',id];
const awake=a=>a&&!['死亡','濒死','昏迷','患病'].includes(a.status)&&!['睡眠','熟睡'].includes(a.activity)&&!a.scheduleTravel&&!a.cognitionTravel;
const roles=d=>{const p=d.get('state','professions');return[p.combat,...p.life,...p.hidden];};
export function trainingInstitution(engine,institution,profession,teacher,state={}){
 const entry=engine.rules.training?.institutions?.find(e=>e.institution===institution&&e.profession===profession&&e.teacher===teacher);
 const mentor=engine.byId.get(teacher),place=engine.byId.get(institution);
 if(!entry||!place?.openHours||!personCareer(engine,state,teacher).value.roles.includes(profession)||!(engine.byId.get(profession)?.trainingInstitutions??[]).includes(institution))throw Error('导师、职业与登记机构不相符');
 return entry;
}
function present(d,engine,entry,minutes){
 const mentor=d.get('state','npcs',entry.teacher);
 if(d.get('state','location')!==entry.institution||!awake(mentor)||mentor.location!==entry.institution)throw Error('须在登记机构与清醒导师当面办理');
 assertNpcService(d,engine,entry.teacher,'teach',minutes);
}
function pay(d,engine,entry,fee,minutes,id){
 if(!Number.isSafeInteger(fee)||fee<0||!Number.isSafeInteger(minutes)||minutes<1)throw Error('登记的学费或考核时间无效');
 if(d.get('state','player','coins')<fee)throw Error('入门或仪式考核费用不足');
 moveCoins(d,{from:purse(engine,'player'),to:purse(engine,entry.teacher),amount:fee,writer:'training',eventId:id});
 d.set(['state','player','coins'],d.get('state','player','coins')-fee);
 d.set(['state','npcs',entry.teacher,'coins'],d.get('state','npcs',entry.teacher,'coins')+fee);
 engine.advance(d,minutes,id);
}
export function initiation(d,engine,args,id){
 const role=engine.resolve(args.profession,'profession'),teacher=engine.resolve(args.teacher,'npc'),institution=engine.resolve(args.institution);
 const entry=trainingInstitution(engine,institution,role,teacher,d.get('state')),catalog=engine.byId.get(role);
 if(args.rule!==undefined&&args.rule!==entry.rule)throw Error(`只能接受登记师规：${entry.rule}`);
 if(d.get(...record(`training_initiation:${id}`)))throw Error('入门编号已使用，拒绝覆盖历史');
 if(catalog.kind==='combat'&&d.get('state','professions','combat')&&d.get('state','professions','combat')!==role)throw Error('已有其他正式战斗职业，不能另拜战斗师门');
 const previous=d.get('state','careers',role,'initiation');
 if(previous?.institution===institution&&previous.status==='守戒中')throw Error('已经入门，不能重复收费或重置守戒起日');
 present(d,engine,entry,entry.initiationMinutes);pay(d,engine,entry,entry.initiationFee,entry.initiationMinutes,id);
 const now=d.get('state','minute'),key=`training_initiation:${id}`,row={category:'training_initiation',profession:role,teacher,institution,rule:entry.rule,observedSince:now,lastBreach:previous?.lastBreach??-1,status:'守戒中',sourceEvent:id,cost:entry.initiationFee};
 d.set(record(key),row);d.set(record(`training_source:${id}`),{initiation:structuredClone(row)});
 d.set(['state','careers',role,'initiation'],{...row,record:key});
 if(entry.ritual&&engine.rules.faith){
  const t=temples(engine).find(t=>t.seat===institution&&t.teacher===teacher),current=d.get('state','player','faith');
  // Re-entering one's own temple (after a breach) renews the observance from
  // today and keeps the breach on record; only a first entry or a change of
  // temple is a conversion with its membership and standing effects.
  if(current?.temple===t?.id&&Number.isSafeInteger(current.observedSince))holdingSet(d,null,['state','player','faith'],{...current,observedSince:now,initiation:key},'training');
  else{convertFaith(d,engine,{...t,organization:{leader:teacher}},'player',id,{paid:true});holdingSet(d,null,['state','player','faith'],{...d.get('state','player','faith'),initiation:key},'training');}
 }else if(entry.ritual){const deity=entry.deity&&engine.byId.get(entry.deity);
  holdingSet(d,null,['state','player','faith'],{deity:deity?.id??null,institution,church:deity?.church.name??entry.church,taboo:deity?.taboo??entry.rule,observedSince:now,lastBreach:row.lastBreach,initiation:key},'training');
 }
 return{initiated:true,profession:role,institution,teacher,initiation:key,rule:entry.rule,cost:entry.initiationFee,minutes:entry.initiationMinutes};
}
function actualInitiation(d,entry){
 const current=d.get('state','careers',entry.profession,'initiation'),row=d.get(...record(current?.record));
 const source=row&&d.get(...record(`training_source:${row.sourceEvent}`));
 if(!row||!source?.initiation||digest(row)!==digest(source.initiation)||current?.profession!==entry.profession||current.institution!==entry.institution||current.teacher!==entry.teacher||current.rule!==entry.rule||current.status!=='守戒中'||current.observedSince!==row.observedSince||current.lastBreach>=current.observedSince)throw Error('尚无真实入门或守戒已中断');
 return current;
}
export function ritualOfficiate(d,engine,args,id){
 const profession=engine.resolve(args.profession,'profession'),teacher=engine.resolve(args.teacher,'npc'),institution=engine.resolve(args.institution),entry=trainingInstitution(engine,institution,profession,teacher,d.get('state'));
 const mentor=engine.byId.get(teacher),issuerRoles=[mentor.combatProfession,...mentor.lifeProfessions??[]];
 if(!entry.ritual||!issuerRoles.includes(profession)||!roles(d).includes(profession)||d.get('state','careers',profession,'certification','teacher')!==teacher)throw Error('主持仪式需要本机构导师认证的实际职业');
 const init=actualInitiation(d,entry),now=d.get('state','minute');
 if(d.get(...record(`ritual_permission:${id}`)))throw Error('仪式资格编号已使用，拒绝重复收费');
 if(now-init.observedSince<1440)throw Error('主持仪式需要至少一天实际持续守戒');
 const deity=args.deity?engine.resolve(args.deity):null;
 if(deity!==(entry.deity??null))throw Error('神祇不属于登记师承；独立师承不借用其他教派');
 const duration=args.minutes??1440;if(!Number.isSafeInteger(duration)||duration<1||duration>10080)throw Error('仪式资格期限须为1至10080分钟');
 present(d,engine,entry,entry.ritualMinutes);pay(d,engine,entry,entry.ritualFee,entry.ritualMinutes,id);
 const start=d.get('state','minute'),key=`ritual_permission:${id}`,god=deity&&engine.byId.get(deity);
 const permission={category:'authorization',action:'ritual_officiate',subject:'player',grantee:'player',grantor:teacher,institution,profession:engine.byId.get(profession).name,professionId:profession,deity,church:god?.church.name??entry.church,createdAt:start,expires:start+duration,revoked:false,sourceType:'training',sourceEvent:id,initiation:init.record};
 d.set(record(key),permission);d.set(record(`ritual_source:${id}`),{permission:structuredClone(permission)});
 return{permit:key,permission,cost:entry.ritualFee,minutes:entry.ritualMinutes};
}
export function assertTrainingRitual(d,engine,key,until){
 const r=d.get(...record(key)),receipt=r&&d.get(...record(`ritual_source:${r.sourceEvent}`));
 if(r?.sourceType!=='training'||r.category!=='authorization'||r.action!=='ritual_officiate'||r.subject!=='player'||r.grantee!=='player'||!receipt?.permission||digest(r)!==digest(receipt.permission)||r.revoked||!Number.isSafeInteger(r.expires)||r.expires<=until||r.createdAt>d.get('state','minute'))throw Error('仪式资格来源不成立或已到期');
 const entry=trainingInstitution(engine,r.institution,r.professionId,r.grantor),init=actualInitiation(d,entry);
 const mentor=engine.byId.get(entry.teacher),issuerRoles=[mentor.combatProfession,...mentor.lifeProfessions??[]];
 if(!entry.ritual||!d.get('state','npcs',entry.teacher)||!issuerRoles.includes(entry.profession)||init.record!==r.initiation||!roles(d).includes(entry.profession)||d.get('state','careers',entry.profession,'certification','teacher')!==entry.teacher)throw Error('仪式资格与真实入门或当前职业不符');
 return{entry,tradition:entry.deity?engine.byId.get(entry.deity):{id:entry.institution,category:'tradition',church:{name:entry.church,profession:engine.byId.get(entry.profession).name},taboo:entry.rule}};
}
export function recordDisciplineBreach(d,engine,kind,eventId){
 const now=d.get('state','minute');
 for(const e of engine.rules.training?.institutions??[]){
  const init=d.get('state','careers',e.profession,'initiation');
  if(init?.institution!==e.institution||init.status!=='守戒中'||!e.breaches.includes(kind))continue;
  d.set(['state','careers',e.profession,'initiation'],{...init,lastBreach:now,status:'违戒',breachEvent:eventId});
  const f=d.get('state','player','faith');if(f?.initiation===init.record)holdingSet(d,null,['state','player','faith'],{...f,lastBreach:now},'training');
  for(const [key,r]of Object.entries(d.get('state','records')??{}))if(r.sourceType==='training'&&r.initiation===init.record&&!r.revoked)d.set(record(key),{...r,revoked:true,revokedAt:now,reason:'违戒',breachEvent:eventId});
  d.say('师门守戒已中断，相关主持资格停止；重新入门须当面承担费用和守戒时间');
 }
}
