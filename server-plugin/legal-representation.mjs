import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('legal-representation');
import {personCareer,personConstraint} from './entity-view.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {assertNpcService,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {requestContractConsent} from './action-consent.mjs';
import {openObligation} from './obligation-runtime.mjs';
import {obligationRow,obligationClosed} from './obligation-state.mjs';
import {npcDecision} from './npc-decision.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {serviceCapacityView,deskRequest,deskServed,queueReceipt} from './service-queue.mjs';
const path=id=>['state','records',id];
export function advocateService(engine,state,id){
 const career=personCareer(engine,state,id).value,r=engine.rules.law?.advocates?.occupations?.[career.occupation];
 if(!r||npcAgeAt(engine,state,id)<18||personConstraint(engine,state,id)||isPhysicallyDead(engine,state,id)||['濒死','昏迷'].includes(state.npcs?.[id]?.status))return null;
 const base=engine.byId.get(id),skill=state.npcs?.[id]?.skills?.[r.skill]??base?.skills?.[r.skill];
 const proficiency=typeof skill==='number'?skill:skill?.proficiency??0;
 return{npc:id,occupation:career.occupation,fee:r.baseFee+Math.floor(proficiency/100)*r.feePerHundred,proficiency,
  discount:Math.min(r.maximumDiscount,Math.floor(proficiency/100)*r.discountPerHundred),minutes:r.minutes,skill:r.skill};
}
export function hireAdvocate(d,engine,row,args,eventId){
 const id=engine.resolve(args.authority??args.request?.target,'npc'),service=advocateService(engine,d.get('state'),id),state=d.get('state');
 if(!service||[row.offender,row.victim,row.judgment?.judge,...row.witnesses??[]].includes(id))throw preconditionFailure('代理人须为无涉案且能接待的成年讼师或代书人');
 if(!['未报案','已报案','证据不足','已裁定'].includes(row.status))throw preconditionFailure('案件当前阶段不接受委托');
 if(row.representation)throw preconditionFailure('本案已委托代理，不重复收费');
 if(state.player.coins<service.fee)throw preconditionFailure('代理费用不足');
 assertNpcService(d,engine,id,'law',service.minutes);
 const terms={case:row.id,fee:service.fee,minutes:service.minutes,subject:row.offender};

 if(args.request?.terms?.quoteOnly===true||args.quoteOnly===true){
  const decision=npcDecision(subjectiveView(engine,d.document,id),{kind:'negotiate_defence',from:'player',cost:{minutes:0}});
  if(decision.outcome!=='agree')throw preconditionFailure(decision.reason);
  const key=`legal_request:${eventId}`,request=args.request??{kind:'defense',target:id,terms:{case:row.id,quoteOnly:true}},payload={...request,case:row.id,sourceEvents:row.sourceEvent?[row.sourceEvent]:[],evidence:[],receiver:id};
  const old=d.get(...path(key));if(old&&(old.case!==row.id||old.receiver!==id))throw Error('Legal request event reused');
  if(!old)d.set(path(key),{category:'legal_request',actor:'player',receiver:id,case:row.id,sourceEvent:eventId,minute:state.minute,location:state.location,request,payload});
  return {request:key,case:row.id,submitted:true,accepted:null,quote:terms,decision,worldEvent:{verb:'request',actor:'player',target:id,payload,tags:['legal_request'],visibility:'private'}};
 }
 // 讼师日容量用尽时不拒绝而是排队：被拘者最急，已裁定待上诉者次之，其余先到先得；回执写明位次与预计受理时刻。
 const urgency=personConstraint(engine,state,row.offender)?3:row.status==='已裁定'?2:1,capacitySource=serviceCapacityView(engine,d,{provider:id,service:'law',proficiency:service.proficiency}),capacity=capacitySource.capacity;
 const desk=deskRequest(d,engine,{service:'law',provider:id,requester:'player',subject:row.id,urgency,capacity});
 if(!desk.admitted)return{case:row.id,...queueReceipt(desk),capacitySource,note:`讼师今日代理已满（日容量${capacity}）：已登记排队号，排第${desk.position}位，预计${engine.calendar(desk.eta).text}可受理；届时再提出委托，不收费、不耗时`};
 const agreement=requestContractConsent(d,engine,{from:id,scope:'negotiate_defence',subject:row.id,purpose:row.id,terms:{fee:service.fee,minutes:service.minutes,role:'defence',purpose:row.id},cost:{minutes:service.minutes},reward:service.fee,eventId});
 if(!agreement.allowed)throw preconditionFailure(agreement.reason??'讼师本人未同意该委托');
 advanceWithNpcParticipants(d,engine,service.minutes,eventId,[id]);
 const current=advocateService(engine,d.get('state'),id);
 if(!current||d.get('state','npcs',id,'location')!==d.get('state','location')||/睡/.test(d.get('state','npcs',id,'activity')??''))throw preconditionFailure('代理人办理期间无法履约');
 if(d.get('state','player','coins')<service.fee)throw preconditionFailure('办理期间余额不足');
 moveCoins(d,{from:purse(null,'player'),to:purse(null,id),amount:service.fee,writer:'legal-representation',eventId:eventId});d.set(['state','player','coins'],d.get('state','player','coins')-service.fee);d.set(['state','npcs',id,'coins'],(d.get('state','npcs',id,'coins')??0)+service.fee);
 const contract=openObligation(d,engine,{actor:id,debtor:id,creditor:'player',kind:'service',subject:row.id,amount:0,terms:{...terms,consentSource:agreement.source}},`${eventId}:service`);
 const representation={npc:id,paid:service.fee,skill:service.skill,minute:d.get('state','minute'),sourceEvent:eventId,subject:row.offender,contract:contract.id,consentSource:agreement.source};
 d.set(path(row.id),{...d.get(...path(row.id)),representation});deskServed(d,{service:'law',provider:id,requester:'player',subject:row.id,urgency,eventId});
 return{case:row.id,representation,capacitySource,minutes:service.minutes,note:'代理费已实付；代理人可核查证词并提出量罚意见，不能制造证据或保证胜诉'};
}
export function representationEffect(d,engine,row){
 const id=row.representation?.npc,service=id&&advocateService(engine,d.get('state'),id);
 const contract=row.representation?.contract&&obligationRow(d.get('state'),row.representation.contract);
 if(row.representation?.contract&&(!contract||contract.endedAt!==undefined||obligationClosed(contract)))return null;
 if(!service||d.get('state','npcs',id,'location')!==d.get('state','location')||/睡/.test(d.get('state','npcs',id,'activity')??''))return null;
 return{npc:id,proficiency:service.proficiency,discount:service.discount};
}
