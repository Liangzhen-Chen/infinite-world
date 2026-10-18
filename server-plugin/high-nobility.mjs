import {changeLegacyHoldings} from './transition.mjs';
import {nobleRules,highTitle,titlesOf,currentDomains,containsDomain,domainSettlements,appointmentSource,territoryController,rulerNation} from './noble-state.mjs';
import {personOffices,personRegistrar,questPublisher,personConstraint} from './entity-view.mjs';
import {npcAgeAt} from './npc-life.mjs';
import {standing} from './standing.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {currentEmployment} from './employment-state.mjs';
import {postGeneratedQuest} from './quest-sources.mjs';
import {armies,armyKey,raiseLevy} from './military.mjs';
import {tradeTax} from './finance-tax.mjs';
import {grantHousingSteward,processEmployedHousing} from './public-projects.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {syncHoldingRecord} from './holding-sources.mjs';
import {closeOfficeIncumbents,appointOfficeRecord} from './governance.mjs';
import {isEffective} from './lifecycle-state.mjs';
declareHoldingWriter('high-nobility',{kinds:['holds_office','employed_by'],entities:['office']});
const DAY=1440,rec=id=>['state','records',id],rows=s=>Object.values(s.records??{});
const able=(s,id)=>s.npcs?.[id]&&!['死亡','濒死','昏迷','患病'].includes(s.npcs[id].status)&&!s.npcs[id].levy&&!s.npcs[id].cognitionTravel;
const awake=(s,id)=>able(s,id)&&!s.npcs[id].scheduleTravel&&!/睡眠|睡觉|熟睡/.test(s.npcs[id].activity??'');
export const royalServices=(s,who)=>rows(s).filter(r=>r.category==='world_event'&&r.actor===who&&r.tags?.includes('royal_service')&&r.minute<=s.minute);
function service(d,who,kind,source,at,location,evidence){
 const id=`royal-service:${kind}:${source}`;if(d.get(...rec(`world_event:${id}`)))return;
 holdingSet(d,null,rec(`world_event:${id}`),{category:'world_event',id,verb:'help',actor:who,target:'loc_capital',minute:at,location,witnesses:[],tags:['royal_service',kind],sourceEvent:source,evidence,claim:`王室服务已核记：${kind}`},'high-nobility');
}
export function advanceRoyalService(d,e,{before,after}){
 const r=nobleRules(e);if(!r||e.replaying&&!e.replayResult?.sovereigntyVersion)return;
 for(const q of Object.values(d.get('state','quests')??{}))if(q.status==='已完成'&&q.source?.generator==='effect_table'&&q.source?.cause==='royal_commission'&&q.fundedBy?.treasury===r.royal.questBoard&&q.location===r.royal.questBoard&&q.taker&&q.rewardPaid===r.royal.questReward&&d.get('state','records',`${q.id}:outcome`)?.royal)service(d,q.taker,'委托',q.id,q.resolvedAt,q.location,{quest:q.id,receipt:`${q.id}:outcome`});
 for(const w of rows(d.get('state')).filter(w=>w.category==='war'&&w.winner&&w.endedAt)){
  const royal=e.world.regions?.some(c=>c.id===w.winner&&c.ruler?.polity?.startsWith('王国'));if(!royal)continue;
  for(const a of armies(d.get('state')).filter(a=>w.armyIds.includes(a.id)&&a.party===w.winner)){
   const enlisted=d.get('state','records','military_service:player');if(enlisted?.army===a.id&&enlisted.since<=w.since)service(d,'player','战功',w.id,w.endedAt,w.front,{war:`war:${w.id}`,service:'military_service:player'});
   for(const p of a.levy.people??[])if(p.id)service(d,p.id,'战功',w.id,w.endedAt,w.front,{war:`war:${w.id}`,army:armyKey(a.id)});
  }
 }
 for(const o of rows(d.get('state')).filter(o=>o.category==='governance_office'&&o.status==='在任'&&o.reviews?.length&&after-o.since>=r.governDays*DAY)){
  const county=e.world.regions?.find(c=>c.id===o.settlement)??e.world.regions?.find(c=>c.category==='county'&&containsDomain(e,d.get('state'),c.id,o.settlement));
  if(county?.ruler?.polity?.startsWith('王国'))service(d,o.holder,'考评',`${o.id}:${o.reviews.at(-1)}`,o.reviews.at(-1),o.settlement,{office:o.id,reviewAt:o.reviews.at(-1)});
 }
 for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++)if(day%r.royal.questEveryDays===0){
  const s=d.get('state'),publisher=questPublisher(e,s,r.royal.questBoard).value;
  if(publisher&&publisher!=='player'&&s.settlements?.[r.royal.questBoard])postGeneratedQuest(d,e,{key:`royal:${day}`,generator:'effect_table',cause:'royal_commission',label:'王都公事',grade:'D',reward:r.royal.questReward,days:30,content:'为王都交付十份木料，入库后核记王室服务。',objective:{type:'deliver',location:r.royal.questBoard,item:r.royal.questItem,quantity:r.royal.questQuantity},board:r.royal.questBoard,publisher,funding:{treasury:r.royal.questBoard},minute:day*DAY});
 }
}
export function upperAppointment(d,e,args,id){
 const s=d.get('state'),source=appointmentSource(e,s,args.settlement);if(!source)throw Error('该辖区没有王国任免来源');
 if(args.name&&!['office_village_head','镇长','城主','郡守','省督'].includes(args.name))throw Error('该任免来源不授予此官职');
 if(s.location!==source.channel&&s.location!==source.seat)throw Error('须到任免机构或公署前厅递件');
 const clerks=e.world.npcs.filter(n=>s.npcs[n.id]?.location===s.location&&able(s,n.id)&&personRegistrar(e,s,n.id,s.location,e.rules.governance.authority.superiors.auth_bs_office_charter.registrars.occupations));
 if(!clerks.length&&s.location!==source.seat)throw Error('前厅没有在岗递件人');
 if(rows(s).some(r=>r.category==='upper_application'&&r.settlement===args.settlement&&r.status==='待审定'))throw Error('同一辖区已有待审定申请');
 const row={category:'upper_application',id:`upper_application:${id}`,holder:'player',settlement:args.settlement,source,status:'待审定',filedAt:s.minute,due:s.minute+source.decisionDays*DAY,sourceEvent:id};holdingSet(d,null,rec(row.id),row,'high-nobility');return {application:row.id,pending:row};
}
function appointmentReasons(e,s,row){
 const r=nobleRules(e),governed=rows(s).filter(o=>o.category==='governance_office'&&o.holder===row.holder&&o.status==='在任'&&s.minute-o.since>=r.governDays*DAY);
 const reasons=[];if(!governed.length)reasons.push('缺少九十日治理任职');if(!royalServices(s,row.holder).length)reasons.push('缺少王室服务世界事件');
 const source=appointmentSource(e,s,row.settlement);if(!source||source.id!==row.source.id)reasons.push('任免来源已改变');
 if(rows(s).some(c=>c.category==='legal_case'&&c.offender===row.holder&&c.judgment))reasons.push('有犯罪裁定');
 const controlled=currentDomains(e,s,row.holder),within=controlled.some(id=>containsDomain(e,s,row.settlement,id));if(!within)reasons.push('没有下辖任职或实际控制');
 return reasons;
}
function appoint(d,e,holder,settlement,at,id,source){
 closeOfficeIncumbents(d,e,settlement,'office_village_head',at,id);
 const key=`governance_office:${settlement}:office_village_head:${holder}`,row={category:'governance_office',id:key,holder,settlement,office:'office_village_head',status:'在任',since:at,until:at+360*DAY,nextReview:at+30*DAY,appointedBy:source.institution??source,source:source.id??source,sourceEvent:id,upper:true};appointOfficeRecord(d,e,row,id);syncHoldingRecord(d,e,key,{writer:'high-nobility',eventId:id});
 entityTransition(d,e,{id:`${id}:appoint`,verb:'appoint',actor:source.id??source,target:holder,minute:at,location:settlement,office:row.office,summary:`上级任命已登记`});return row;
}
export function reviewUpperOffice(d,e,row,at){
 const s=d.get('state'),reason=at>=row.until?'任期届满':!isEffective(e,d,row.holder)?'失去履职能力':rows(s).some(c=>c.category==='legal_case'&&c.offender===row.holder&&c.judgment)?'犯罪裁定':null;
 if(reason){changeLegacyHoldings(d,e,{holder:row.holder,source:`office:${row.settlement}|${row.office}`,reason:at>=row.until?'expired':'vacated',eventId:`${row.id}:dismiss:${at}`},()=>{holdingSet(d,e,rec(row.id),{...row,status:'已免职',removedAt:at,reason},'high-nobility');syncHoldingRecord(d,e,row.id,{writer:'high-nobility'});});entityTransition(d,e,{id:`${row.id}:dismiss:${at}`,verb:'dismiss',actor:row.appointedBy,target:row.holder,minute:at,location:row.settlement,office:row.office,reason,summary:`上级免职：${reason}`});}
 else holdingSet(d,null,rec(row.id),{...row,nextReview:at+30*DAY,reviews:[...row.reviews??[],at]},'high-nobility');
}
export function advanceUpperAppointments(d,e,{after}){
 if(!nobleRules(e)||e.replaying&&!e.replayResult?.sovereigntyVersion)return;
 for(const row of rows(d.get('state')).filter(r=>r.category==='upper_application'&&r.status==='待审定'&&r.due<=after)){
  const reasons=appointmentReasons(e,d.get('state'),row);if(!reasons.length)appoint(d,e,row.holder,row.settlement,row.due,row.id,row.source);
  holdingSet(d,null,rec(row.id),{...row,status:reasons.length?'未获任命':'已任命',reasons,decidedAt:row.due},'high-nobility');
 }
}
function lord(e,s,who='player'){
 if(!titlesOf(s,who).some(highTitle)&&!rows(s).some(n=>n.category==='nation'&&n.ruler===who&&['独立','独立待定','谈判中','内乱'].includes(n.status)))throw Error('须有男爵以上受封领地或独立国家');
 return currentDomains(e,s,who);
}
function assertScope(e,s,settlement,who='player'){
 if(!lord(e,s,who).some(id=>containsDomain(e,s,id,settlement)))throw Error('事务超出当前受封辖区');
 const controller=territoryController(e,s,settlement);if(controller&&controller!==(rulerNation(s,who)?.id??who))throw Error('该辖区已失去控制');
 if(e.byId.get(settlement)?.monsterSociety||e.world.settlementProfiles?.find(p=>p.id===settlement)?.council)throw Error('非人自治地不在任免范围');
}
export function upperGovernanceAction(d,args,id){
 const e=this,s=d.get('state'),settlement=args.settlement;
 if(args.operation==='domain_inspect'){
  const domains=lord(e,s);return {domains,settlements:domainSettlements(e,s,domains),appointments:domainSettlements(e,s,domains).map(id=>appointmentSource(e,s,id)),requests:rows(s).filter(r=>r.category==='domain_request'),actionScope:{kind:'instant'}};
 }
 assertScope(e,s,settlement);
 if(args.operation==='domain_appoint'){
  const holder=e.resolve(args.member,'npc');if(lord(e,s).includes(settlement)||!awake(s,holder)||(npcAgeAt(e,s,holder)??0)<18||s.npcs[holder].location!==s.location||args.consent!==true||personConstraint(e,s,holder)||personOffices(e,s,holder).some(o=>o.value.settlement!==settlement))throw Error('只可任命下级；候选须成年清醒在场自愿且没有另一辖区任职');
  return {appointment:appoint(d,e,holder,settlement,s.minute,id,`title:player`)};
 }
 if(args.operation==='domain_steward'){
  const worker=e.resolve(args.steward,'npc');if(!awake(s,worker)||(npcAgeAt(e,s,worker)??0)<18||s.npcs[worker].location!==s.location||args.consent!==true||currentEmployment(s,worker)||personOffices(e,s,worker).length||personConstraint(e,s,worker))throw Error('管事须成年清醒在场自愿，且无任职或雇佣冲突');
  const key=`workshop:${id}`,row={category:'contract',kind:'workshop',id:key,laborMarket:1,domainSteward:true,task:'领地管事',owner:'player',worker,location:s.location,settlement,wage:nobleRules(e).steward.wageDay,status:'有效',createdAt:s.minute,starts:(Math.floor(s.minute/DAY)+1)*DAY+480,nextWork:(Math.floor(s.minute/DAY)+1)*DAY+1020,deadline:s.minute+nobleRules(e).steward.days*DAY,paid:0,produced:0,workedMinutes:0,targetQuantity:0,shifts:[],source:id};
  e.assertNpcObligationAction(d,[worker],{start:row.starts,minutes:480,kind:'employment'});holdingSet(d,null,rec(key),row,'high-nobility');
  let housing=null;if(args.action==='housing'){
   const hall=e.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.meetingPlace;if(!hall)throw Error('该地没有已登记宅基审批处');
   housing=grantHousingSteward(d,e,args,id,settlement,hall);holdingSet(d,null,rec(housing.authorization),{...housing.steward,employment:key},'high-nobility');
  }
  return {contract:key,worker,...(housing?{authorization:housing.authorization}:{})};
 }
 if(args.operation==='domain_request'){
  if(!['tax','levy','account_report'].includes(args.choice))throw Error('批复支持tax、levy或account_report');
  const contract=args.authorization&&s.records?.[args.authorization];if(args.authorization&&(!contract?.domainSteward||contract.owner!=='player'||contract.status!=='有效'||contract.settlement!==settlement))throw Error('没有该辖区有效管事合同');
  const key=`domain_request:${id}`,row={category:'domain_request',id:key,settlement,holder:'player',kind:args.choice,taxBps:args.taxBps??null,army:args.org??null,contract:args.authorization??null,status:contract?'待办理':'待批复',minute:s.minute,sourceEvent:id};holdingSet(d,null,rec(key),row,'high-nobility');
  if(!contract)return {request:executeDomainRequest(d,e,row,id)};return {request:row};
 }
 throw Error('未知上位治理事务');
}
export function executeDomainRequest(d,e,row,id){
 const s=d.get('state');assertScope(e,s,row.settlement,row.holder);
 let result;
 if(row.kind==='tax'){
  if(!Number.isSafeInteger(row.taxBps)||row.taxBps<0||row.taxBps>nobleRules(e).maxTaxBps)throw Error('税率超出辖区权限');
  holdingSet(d,null,rec(`domain-tax:${row.settlement}`),{category:'domain_tax',holder:row.holder,settlement:row.settlement,bps:row.taxBps,sourceEvent:id},'high-nobility');result={...tradeTax(e,d.get('state'),row.settlement),bps:row.taxBps};
 }else if(row.kind==='levy'){
  const a=s.records?.[armyKey(row.army)];if(!a||a.party!==(rulerNation(s,row.holder)?.id??row.holder)||!a.levySettlements.includes(row.settlement))throw Error('征兵须为本人军队及其登记征召地');
  const next=structuredClone(a);raiseLevy(d,e,next,s.minute,id);holdingSet(d,null,rec(armyKey(next.id)),next,'high-nobility');result={army:a.id,levy:next.levy.count};
 }else result={treasury:s.settlements?.[row.settlement]?.treasury??null,population:s.settlements?.[row.settlement]?.population??null};
 const next={...row,status:'已完成',resolvedAt:s.minute,result};holdingSet(d,null,rec(row.id),next,'high-nobility');return next;
}
export function settleStewardRequests(d,e,contract,id){
 if(!contract.domainSteward)return;
 processEmployedHousing(d,e,contract,d.get('state','minute'));
 for(const row of rows(d.get('state')).filter(r=>r.category==='domain_request'&&r.contract===contract.id&&r.status==='待办理')){
  try{executeDomainRequest(d,e,row,id);}catch(error){holdingSet(d,null,rec(row.id),{...row,status:'退回',reason:error.message},'high-nobility');}
 }
}
