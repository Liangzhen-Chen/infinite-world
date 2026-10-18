import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('legal-representation');
import {personCareer,personConstraint} from './entity-view.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {assertNpcService,advanceWithNpcParticipants} from './npc-schedule.mjs';
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
 const id=engine.resolve(args.authority,'npc'),service=advocateService(engine,d.get('state'),id),state=d.get('state');
 if(!service||[row.offender,row.victim,row.judgment?.judge,...row.witnesses??[]].includes(id))throw Error('代理人须为无涉案且能接待的成年讼师或代书人');
 if(!['未报案','已报案','证据不足','已裁定'].includes(row.status))throw Error('案件当前阶段不接受委托');
 if(row.representation)throw Error('本案已委托代理，不重复收费');
 if(state.player.coins<service.fee)throw Error('代理费用不足');
 assertNpcService(d,engine,id,'law',service.minutes);
 advanceWithNpcParticipants(d,engine,service.minutes,eventId,[id]);
 const current=advocateService(engine,d.get('state'),id);
 if(!current||d.get('state','npcs',id,'location')!==d.get('state','location')||/睡/.test(d.get('state','npcs',id,'activity')??''))throw Error('代理人办理期间无法履约');
 if(d.get('state','player','coins')<service.fee)throw Error('办理期间余额不足');
 moveCoins(d,{from:purse(null,'player'),to:purse(null,id),amount:service.fee,writer:'legal-representation',eventId:eventId});d.set(['state','player','coins'],d.get('state','player','coins')-service.fee);d.set(['state','npcs',id,'coins'],(d.get('state','npcs',id,'coins')??0)+service.fee);
 const representation={npc:id,paid:service.fee,skill:service.skill,minute:d.get('state','minute'),sourceEvent:eventId,subject:row.offender};
 d.set(path(row.id),{...d.get(...path(row.id)),representation});return{case:row.id,representation,minutes:service.minutes,note:'代理费已实付；代理人可核查证词并提出量罚意见，不能制造证据或保证胜诉'};
}
export function representationEffect(d,engine,row){
 const id=row.representation?.npc,service=id&&advocateService(engine,d.get('state'),id);
 if(!service||d.get('state','npcs',id,'location')!==d.get('state','location')||/睡/.test(d.get('state','npcs',id,'activity')??''))return null;
 return{npc:id,proficiency:service.proficiency,discount:service.discount};
}
