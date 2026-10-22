import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
// U7 needs choose a bounded offscreen act. All acts use the ordinary legal case ledger.
import {purse,fund as fundAccount,moveCoins,sink} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('npc-crime',{sinks:['sink:export']});
import {npcNeedGoals,intelligenceOf} from './npc-intelligence.mjs';
import {personConstraint,personSimulation,lawAuthorities} from './entity-view.mjs';
import {npcAgeAt} from './npc-state.mjs';
import {standing} from './standing.mjs';
import {clockRoll} from './world-clock.mjs';
import {presentWitnesses,publishTransitionEvent} from './world-events.mjs';
import {legalCodeAt,legalCodeById} from './law-codes.mjs';
import {registerIncident,evidenceScore,adjudicateLegalCase,caseLoss} from './law.mjs';
import {recoverLoss} from './obligation-claims.mjs';
import {entityTransition,businessSnapshot,businessTransitions} from './entity-transitions.mjs';
import {issueWanted,wantedOfCase,WANTED_REASONS} from './bounty.mjs';
import {monsterStats} from './combat.mjs';
import {transferItems} from './items.mjs';
import {declareHoldingWriter} from './holdings.mjs';
import {holdingSet} from './holding-sources.mjs';
declareHoldingWriter('npc-crime',{kinds:['guest_of','wanted'],entities:['case']});
const DAY=1440,path=id=>['state','records',id];
export const NPC_CRIME_VERSION=1;
const fresh=e=>!e.replaying||e.replayResult?.npcCrimeVersion===NPC_CRIME_VERSION;
const alive=(e,s,id,n)=>n&&!isPhysicallyDead(e,s,id)&&!['濒死','昏迷'].includes(n.status);
const awake=(e,s,id,n)=>alive(e,s,id,n)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|熟睡|睡觉/.test(n.activity??'');
const cases=state=>Object.values(state.records??{}).filter(r=>r.category==='legal_case'&&r.npcCrime);
const available=(e,s,id)=>awake(e,s,id,s.npcs[id])&&npcAgeAt(e,s,id)>=18&&!personConstraint(e,s,id);
function cargoAt(e,s,id){
 const n=s.npcs[id],cp=e.rules.smuggling?.checkpoints?.find(c=>c.location===n.location);if(!cp)return null;
 const item=Object.keys(n.inventory??{}).sort().find(item=>e.quantity({get:(...p)=>p.reduce((v,k)=>v?.[k],{state:s})},id,item)>0&&
  (e.rules.smuggling.contraband.includes(item)||e.byId.get(item)?.tags?.includes('contraband')));
 return item?{item,checkpoint:cp}:null;
}
export function npcCrimePlan(e,s,id){
 const needs=npcNeedGoals(s,id).filter(g=>g.status==='进行中'),food=needs.find(g=>g.need==='food'),money=needs.find(g=>g.need==='money'),safety=needs.find(g=>['safety','status'].includes(g.need)&&!g.ambition);
 if(!food&&!money&&!safety)return null;
 const n=s.npcs[id];if(!available(e,s,id)||!personSimulation(e,s,id).value)return null;
 const mind=intelligenceOf(e,s,id)?.level??0;if(mind<1)return null;
 const peers=Object.keys(s.npcs).filter(other=>other!==id&&s.npcs[other].location===n.location&&alive(e,s,other,s.npcs[other])&&npcAgeAt(e,s,other)>=18).sort();if(!peers.length)return null;
 const traits=JSON.stringify(e.byId.get(id)?.personality??{}),reckless=/贪|投机|狡|好斗|冲动|报复|好胜|狠/.test(traits),restraint=/守法|正直|温和|谨慎|守信/.test(traits);
 const enemy=peers.find(other=>standing(e,s,id,other)<=-30);
 if(safety&&enemy&&reckless&&!restraint)return{actor:id,victim:enemy,offense:'assault',need:safety.need,intelligence:mind};
 if(!food&&!money)return null;
 const cargo=mind>=2&&reckless&&!restraint&&cargoAt(e,s,id);if(cargo)return{actor:id,victim:peers.find(p=>p!==cargo.checkpoint.guards?.[0])??peers[0],offense:'smuggling',need:money?.need??food.need,intelligence:mind,item:cargo.item};
 if(!food&&(!reckless||restraint))return null;
 const grant=money&&mind>=3&&Object.values(s.records??{}).find(r=>r.category==='authorization'&&r.action==='payment'&&r.grantee===id&&peers.includes(r.grantor)&&!r.revoked&&(r.createdAt??0)<=s.minute&&r.expires>s.minute&&(s.npcs[r.grantor]?.coins??0)>0);
 if(grant)return {actor:id,victim:grant.grantor,offense:'fraud',embezzlement:true,authorization:grant.id??Object.keys(s.records).find(k=>s.records[k]===grant),need:'money',intelligence:mind};
 const victim=peers.find(other=>(s.npcs[other].coins??0)>0&&standing(e,s,id,other)<30);if(!victim)return null;
 return{actor:id,victim,offense:!food&&mind>=3?'fraud':'theft',need:food?.need??money.need,intelligence:mind};
}
export function commitNpcCrime(d,e,plan,minute){
 const {actor,victim,offense}=plan,state=d.get('state'),n=state.npcs[actor],v=state.npcs[victim];
 const id=`npc_crime:${actor}:${Math.floor(minute/DAY)}`,caseId=`legal_case:${id}`;
 if(d.get(...path(caseId))||!available(e,state,actor)||!alive(e,state,victim,v)||n.location!==v.location||!legalCodeAt(e,n.location,state))return null;
 if(plan.embezzlement){
  const grant=state.records?.[plan.authorization];
  if(offense!=='fraud'||grant?.category!=='authorization'||grant.action!=='payment'||grant.grantee!==actor||grant.grantor!==victim||grant.revoked||grant.expires<=minute||(grant.createdAt??0)>minute)return null;
 }
 const location=n.location,witnesses=presentWitnesses(state,location,[actor]);let value=0,stolen=null,harm=0;
 if(offense==='theft'||offense==='fraud'){
  value=Math.min(v.coins??0,e.rules.law.npcCrime.maximumCoins);if(value<1)return null;
  moveCoins(d,{from:purse(null,victim),to:purse(null,actor),amount:value,writer:'npc-crime',eventId:caseId});d.set(['state','npcs',victim,'coins'],v.coins-value);d.set(['state','npcs',actor,'coins'],(n.coins??0)+value);stolen={coins:value};
 }else if(offense==='assault'){
  if(!awake(e,state,victim,v))return null;const maxHp=v.maxHp??monsterStats({level:v.level??e.byId.get(victim)?.level??1,template:2},e.rules).maxHp,hp=v.hp??maxHp;
  harm=Math.min(e.rules.law.npcCrime.assaultDamage,Math.max(0,hp-1));if(!harm)return null;
  d.set(['state','npcs',victim,'hp'],hp-harm);d.set(['state','npcs',victim,'maxHp'],maxHp);
 }else if(offense==='smuggling'){
  const cargo=cargoAt(e,state,actor);if(!cargo||cargo.item!==plan.item)return null;
  // Contraband really changes hands at the checkpoint; no sale proceeds are invented.
  value=e.byId.get(plan.item).basePrice;transferItems(d,e,actor,victim,plan.item,1);stolen=null;
 }else throw preconditionFailure('未登记的NPC犯罪来源');
 const key=registerIncident(d,e,{offender:actor,victim:offense==='smuggling'?null:victim,offense,value,stolen,witnesses,eventId:id,location,minute,relationshipApplied:true});
 const code=legalCodeAt(e,location,d.get('state'));let reportAt=null,reportRoute=null;
 if(witnesses.length){try{reportRoute=e.route(location,code.court,'walk',minute,d.document.randomSeed);reportAt=minute+code.reportMinutes+reportRoute.minutes;}catch{}}
 let flight=null;
 const destinations=plan.destination?[plan.destination]:plan.embezzlement?(e.rules.law.codes??[]).filter(c=>c.id!==code.id).map(c=>c.court).filter(Boolean).sort():[];
 for(const destination of destinations){
  try{const route=e.route(location,destination,'walk',minute,d.document.randomSeed),coins=d.get('state','npcs',actor,'coins');
   if(route.minutes>0&&Number.isFinite(route.minutes)&&(route.cost??0)<=coins){
    const cost=route.cost??0;if(cost){moveCoins(d,{from:purse(null,actor),to:sink('export','travel'),amount:cost,writer:'npc-crime',eventId:id});d.set(['state','npcs',actor,'coins'],coins-cost);}
    flight={from:location,to:destination,depart:minute,arrive:minute+route.minutes,edges:route.edges,cost};
    d.set(['state','npcs',actor,'scheduleTravel'],flight);d.set(['state','npcs',actor,'location'],null);d.set(['state','npcs',actor,'activity'],'携款逃亡');
   }if(flight)break;
  }catch(error){if(!/路线|通行|可达|路径|route|destination/i.test(error.message))throw error;}
 }
 holdingSet(d,null,path(key),{...d.get(...path(key)),npcCrime:{version:1,motive:plan.need,intelligence:plan.intelligence,reportAt,reportRoute,sourceEvent:id,...(plan.embezzlement?{embezzlement:true,authorization:plan.authorization}:{}),...(flight?{flight}:{})},nextHearing:reportAt===null?null:reportAt+code.hearingMinutes},'npc-crime');
 const verb=offense==='assault'?'harm':offense==='fraud'?'deceive':offense==='smuggling'?'breach':'steal';
 publishTransitionEvent(d,e,{id,verb,actor,target:victim,value,harm,case:key,location,minute,witnesses,
  tags:['crime','npc_crime','hostile',offense,...(witnesses.length?['discovered','exposed']:[])]});
 return key;
}
function localOfficer(d,e,code,kind){return lawAuthorities(e,d.get('state'),code,kind).find(id=>available(e,d.get('state'),id)&&d.get('state','npcs',id,'location')===code.court);}
function settleNpcSentence(d,e,row,code,minute){
 const n=d.get('state','npcs',row.offender);if(!alive(e,d.get('state'),row.offender,n)||n.location!==code.court)return;
 const loss=row.victim?caseLoss(d,e,row):null;
 const fine=row.fineDischarged?0:Math.max(0,row.judgment.fine-(row.finePaid??0)),compensation=row.compensationPaid?0:Math.min(row.judgment.compensation,loss?.remaining??row.judgment.compensation);
 if((n.coins??0)>=fine+compensation){
  moveCoins(d,{from:purse(null,row.offender),to:fundAccount(`legal_treasury:${row.law}`),amount:fine,writer:'npc-crime',eventId:row.id});moveCoins(d,{from:purse(null,row.offender),to:fundAccount(`legal_deposit:${row.id}`),amount:compensation,writer:'npc-crime',eventId:row.id});
  d.set(['state','npcs',row.offender,'coins'],n.coins-fine-compensation);
  const treasury=`legal_treasury:${row.law}`,fund=d.get(...path(treasury))??{category:'legal_treasury',law:row.law,coins:0};if(fund.category!=='legal_treasury')throw Error('法律资金登记键冲突');holdingSet(d,null,path(treasury),{...fund,coins:fund.coins+fine},'npc-crime');
  if(compensation){const key=`legal_deposit:${row.id}`,escrow=d.get(...path(key));if(escrow?.category&&escrow.category!=='legal_deposit')throw Error('法律资金登记键冲突');holdingSet(d,null,path(key),{category:'legal_deposit',case:row.id,beneficiary:row.victim,coins:(escrow?.coins??0)+compensation,units:[]},'npc-crime');}
  if(compensation&&loss)recoverLoss(d,e,{id:loss.id,amount:compensation,payer:row.offender,kind:'deposit'},`${row.id}:sentence`);
  holdingSet(d,null,path(row.id),{...row,status:'已结案',finePaid:fine,fineDischarged:true,compensationPaid:true,closed:minute},'npc-crime');
 }else if(!row.fineDischarged){
  const key=`legal_custody:${row.id}`;if(d.get(...path(key)))return;
  const shops=businessSnapshot(e,d.get('state'));
  holdingSet(d,null,path(key),{category:'legal_custody',case:row.id,subject:row.offender,reason:'劳役',location:code.court,status:'生效',started:minute,expires:minute+row.judgment.communityMinutes},'npc-crime');
  holdingSet(d,null,path(row.id),{...row,status:'服役中',sentence:'labor',compensationPaid:row.value===0},'npc-crime');
  entityTransition(d,e,{id:`${key}:detain`,verb:'detain',actor:row.judgment.judge,target:row.offender,minute,location:code.court,visibility:row.private?'private':row.visibility??'public',summary:`${e.byId.get(row.offender)?.name??row.offender}依法开始劳役`});
  businessTransitions(d,e,shops,key,minute);
 }
}
export function advanceNpcJustice(d,e,after){
 for(const initial of cases(d.get('state'))){let row=d.get(...path(initial.id));const code=legalCodeById(e,row.law,d.get('state'));if(!code)continue;
  const offender=d.get('state','npcs',row.offender);if(!alive(e,d.get('state'),row.offender,offender)||row.status==='已撤案')continue;
  if(!row.npcCrime.statementsReceived&&row.npcCrime.reportAt!==null&&row.npcCrime.reportAt<=after){
   const receiver=localOfficer(d,e,code,'officer');if(!receiver)continue;
   const witnesses=row.witnesses.filter(id=>d.get('state','npcs',id,'legalKnowledge')?.some(k=>k.case===row.id&&k.source==='亲见或在场受理'));
   row={...row,npcCrime:{...row.npcCrime,statementsReceived:true},reported:true,status:'已报案',reportedAt:after,receiver,evidence:row.evidence.map(r=>r.kind==='eyewitness'&&witnesses.includes(r.witness)?{...r,testified:true,statementAt:after}:r),nextHearing:after+code.hearingMinutes};
   holdingSet(d,null,path(row.id),row,'npc-crime');d.set(['state','npcs',receiver,'legalKnowledge'],[...d.get('state','npcs',receiver,'legalKnowledge')??[],{case:row.id,minute:after,source:'沿路递交的报案'}]);
  }
  if(!row.reported)continue;
  if(['已报案','已到案','证据不足'].includes(row.status)&&!row.judgment&&row.nextHearing<=after){
   const judge=localOfficer(d,e,code,'judge');if(!judge||[row.offender,row.victim].includes(judge))continue;
   if(evidenceScore(d,row)<code.evidenceRequired){if(row.status!=='证据不足')holdingSet(d,null,path(row.id),{...row,status:'证据不足'},'npc-crime');continue;}
   if(offender.location!==code.court){if(!wantedOfCase(d.get('state'),row.id)&&after-row.reportedAt>=e.rules.law.wanted.appearanceMinutes)issueWanted(d,e,row,WANTED_REASONS.unappeared,after);continue;}
   adjudicateLegalCase(d,e,row,code,judge,`${row.sourceEvent}:hearing`,presentWitnesses(d.get('state'),code.court));row=d.get(...path(row.id));
   for(const[key,hold]of Object.entries(d.get('state','records')))if(hold.category==='legal_detention'&&hold.case===row.id&&hold.status==='生效'){
    const shops=businessSnapshot(e,d.get('state'));
    holdingSet(d,null,path(key),{...hold,status:'已结束',ended:after},'npc-crime');
    entityTransition(d,e,{id:`${key}:release`,verb:'release',actor:judge,target:row.offender,minute:after,location:hold.location,visibility:row.private?'private':row.visibility??hold.visibility??'public',summary:`${e.byId.get(row.offender)?.name??row.offender}审结后解除待审拘留`});
    businessTransitions(d,e,shops,`${key}:release`,after);
   }
  }
  if(row.judgment&&['已裁定','已到案','待赔偿'].includes(row.status))settleNpcSentence(d,e,row,code,after);
  row=d.get(...path(row.id));const escrow=d.get(...path(`legal_deposit:${row.id}`));
  if(escrow?.coins>0&&awake(e,d.get('state'),row.victim,d.get('state','npcs',row.victim))&&d.get('state','npcs',row.victim,'location')===code.court){moveCoins(d,{from:fundAccount(`legal_deposit:${row.id}`),to:purse(null,row.victim),amount:escrow.coins,writer:'npc-crime',eventId:row.id});d.set(['state','npcs',row.victim,'coins'],d.get('state','npcs',row.victim,'coins')+escrow.coins);holdingSet(d,null,path(`legal_deposit:${row.id}`),{...escrow,coins:0,claimed:true,claimedAt:after},'npc-crime');}
 }
}
export function nextNpcCrimeMinute(e,d,now){
 if(!e.rules.law?.npcCrime||!fresh(e))return Infinity;
 const state=d.get('state');
 let next=Object.keys(state.npcs??{}).some(id=>state.npcs[id].location!==state.location&&!state.records?.[`legal_case:npc_crime:${id}:${Math.floor(now/DAY)}`]&&npcCrimePlan(e,state,id))?(Math.floor(now/600)+1)*600:Infinity;
 for(const row of cases(d.get('state')))for(const at of [!row.reported?row.npcCrime.reportAt:null,!row.judgment?row.nextHearing:null])if(at>now)next=Math.min(next,at);
 return next;
}
export function advanceNpcCrime(d,e,{before,after}){
 if(!e.rules.law?.npcCrime||!fresh(e))return;
 for(let at=(Math.floor(before/600)+1)*600;at<=after;at+=600){
  const state=d.get('state');
  for(const id of Object.keys(state.npcs??{}).sort()){
   if(state.npcs[id].location===state.location)continue;
   const plan=npcCrimePlan(e,d.get('state'),id);if(!plan)continue;
   if(clockRoll(d.document.randomSeed,`npc-crime:${id}`,Math.floor(at/DAY))>=e.rules.law.npcCrime.dailyChance)continue;
   commitNpcCrime(d,e,plan,at);
  }
 }
 advanceNpcJustice(d,e,after);
}
