import {preconditionFailure} from './precondition.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {MEDICAL_SKILL,medicineRows,medicineSites,medicineReservation,medicalConditions,medicalSkill,waterDiseaseExposure} from './medicine-state.mjs';
import {npcSchedule} from './npc-state.mjs';
import {personConstraint,placeSettlement} from './entity-view.mjs';
import {educationReservation} from './education-state.mjs';
import {employmentReservation,currentEmployment} from './employment-state.mjs';
import {financeBalance,financeTransfer,financeChange,financeInt} from './finance-bank.mjs';
import {fund as fundAccount} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
import {store,moveStock,itemResource} from './stock.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('medicine',{kinds:['employed_by']});
// S1b: 诊疗与防疫用掉的药材进 sink:consume。
declareLedgerWriter('medicine',{sources:{'src:craft':{item_external_medicine:100000}},sinks:['sink:consume']});
const HERB_USE=(purpose,eventId)=>({flow:'sink:consume',purpose,writer:'medicine',eventId});
import {transferItems} from './items.mjs';
import {isItemClass,pickHeldOfClass,pickStockOfClass,classItems} from './item-class.mjs';
// K4: 药按类别（item-use-tags 的 medicine 类），不按"药草"那一件。
const MEDICINE='medicine';
const heldMedicine=(d,e,holder,amount=1)=>pickHeldOfClass(d,e,holder,MEDICINE,amount);
// 没有实物在手时估价用的参照药材：本类里基价最低的一件（同价按 id）。
const referenceMedicine=e=>classItems(e,MEDICINE).map(id=>e.byId.get(id)).filter(x=>x?.basePrice>0).sort((a,b)=>a.basePrice-b.basePrice||a.id.localeCompare(b.id))[0]?.id;
import {clockRoll} from './world-clock.mjs';
import {recoverIllness,contractIllness} from './npc-life.mjs';
import {temples} from './faith-catalog.mjs';
import {ensureGroupAccount,groupAccountPath,groupAccountView} from './group-account.mjs';
import {settleEmploymentPay} from './labor-market.mjs';
import {counterpart} from './credit.mjs';
import {applyEffects} from './effects.mjs';
import {personOffices} from './entity-view.mjs';
import {registerEarnedClaim,settleClaim,claimLimitation} from './obligation-claims.mjs';
import {marketQuote} from './market.mjs';
import {obligationView as dueObligation} from './obligation-state.mjs';
import {settlementPresent} from './obligation-presence.mjs';
import {obligationTransaction} from './transition.mjs';
import {serviceUrgency,orderServices,displaceable,waitingInOrder,queuePosition,serviceCapacityView,nextServiceOrder} from './service-queue.mjs';
const DAY=1440,rec=id=>['state','records',id],actor=(s,id)=>id==='player'?s.player:s.npcs?.[id];
const present=(s,id)=>id==='player'?s.location:s.npcs?.[id]?.location;
const capable=(e,s,id)=>actor(s,id)&&!isPhysicallyDead(e,s,id)&&!['濒死','昏迷'].includes(actor(s,id).status);
const dayLoad=(s,doctor,day)=>medicineRows(s).filter(r=>r.doctor===doctor&&['预约','已诊'].includes(r.status)&&Math.floor(r.start/DAY)===day).length;
const pending=(s,id)=>medicineRows(s).some(r=>r.patient===id&&['预约','排队'].includes(r.status));
function windows(e,s,id,minute){
 const routine=npcSchedule(e,s,id,minute);if(!routine)return [];
 const cal=e.calendar(minute),variant=cal.market?'market':routine.restDays?.includes(cal.day)?'rest':'default',season=routine.seasonal?.[String(cal.season)];
 return season?.[variant]??routine[variant]??season?.default??routine.default??[];
}
function available(e,s,id,start,end,location){
 const a=actor(s,id);if(!a||isPhysicallyDead(e,s,id)||['濒死','昏迷','患病'].includes(a.status)||a.caring||a.levy||a.scheduleTravel||a.cognitionTravel||s.player.companions?.includes(id)||personConstraint(e,s,id,start)||medicineReservation(s,id,start,end-start)||educationReservation(e,s,id,start,end-start))return false;
 const job=currentEmployment(s,id,start);if(employmentReservation(s,id,start,end-start)&&(!job||job.location!==location||!/诊疗|药童/.test(job.task??'')))return false;
 return windows(e,s,id,start).some(w=>w.location===location&&w.start<=start%DAY&&w.end>=start%DAY+end-start&&!/睡|午饭|休息|家务/.test(w.activity??''));
}
const SEEK_AFTER=2*DAY;
const needsCare=(c,now)=>c.kind==='illness'?now-c.record.since>=SEEK_AFTER:c.record.bleedingMlPerMinute>0||c.record.contamination>0||c.record.infected;
function fundAt(s,location){return Object.values(s.records??{}).find(r=>r.category==='medicine_fund'&&r.location===location&&r.coins>0);}
function templeSponsor(e,s,location,fee){
 const sid=placeSettlement(e,s,location).value;
 return temples(e).find(t=>placeSettlement(e,s,t.seat).value===sid&&(groupAccountView(e,s,t.id)?.coins??0)>=fee&&pickStockOfClass(e,groupAccountView(e,s,t.id)?.items,MEDICINE));
}
// 诊费里的药材成本取草药在医馆所在地的市场估值（市场报价投影的 value，不含商家价差与立场），不读目录基价。
function herbValue(d,e,site,holder){
 const item=heldMedicine(d,e,holder)??referenceMedicine(e);if(!item)throw preconditionFailure('世上没有登记的药材，无从估价');
 const value=marketQuote(d,e,{item,location:site.seat,seller:holder}).explanation.value.value;
 if(!Number.isFinite(value))throw preconditionFailure('草药无法估值');
 return value;
}
function book(d,e,args,id){return obligationTransaction(d,()=>bookVisit(d,e,args,id));}
export {book as bookMedicine};
function bookVisit(d,e,{patient='player',clinic,source=null,credit=false,charity=false,consent=false,only=()=>true},id){
 let s=d.get('state');const now=s.minute;
 if(!capable(e,s,patient)||personConstraint(e,s,patient)||pending(s,patient))throw preconditionFailure('病人不能赴诊或已有预约');
 const conditions=medicalConditions(s,patient).filter(only);if(!conditions.length)throw preconditionFailure('没有登记的疾病或未愈创伤');
 const site=medicineSites(e,s).find(c=>c.id===clinic||c.seat===clinic||c.name===clinic);if(!site||site.factor===0||!site.capacity)throw preconditionFailure('医馆不存在或已停用');
 if(patient==='player'&&s.location!==site.seat)throw preconditionFailure('须到医馆求医');
 if(patient!=='player'&&!consent)throw preconditionFailure('诊疗须病人自愿求医');
 // A bedridden grave patient is visited at home; everyone else walks to the clinic.
 const house=patient!=='player'&&actor(s,patient).status==='患病'&&conditions.some(c=>c.severity==='重'),place=house?present(s,patient):site.seat;
 let travel=0;
 if(present(s,patient)!==site.seat){try{travel=e.route(present(s,patient),site.seat,'walk',now,d.get('randomSeed')).minutes;}catch{throw preconditionFailure('病人没有可行赴诊路线');}}
 if(!Number.isFinite(travel)||travel>DAY)throw preconditionFailure('病人路程过远，需先安排运输');
 const urgency=serviceUrgency(conditions),displaced=[];
 // A new acute patient may take an unstarted lower-priority appointment.
 // The displaced patient remains in the queue with their original arrival.
 const urgencyOf=v=>v.urgency??serviceUrgency(medicalConditions(s,v.patient));
 for(const visit of displaceable(medicineRows(s),{urgency,now,same:v=>v.clinic===site.id,urgencyOf})){
  holdingSet(d,null,rec(visit.id),{...visit,status:'排队',urgency:urgencyOf(visit),queuedAt:now},'medicine');displaced.push(visit);
 }
 s=d.get('state');
 let chosen=null;
 for(let day=Math.floor(now/DAY);day<=Math.floor(now/DAY)+7&&!chosen;day++)for(let at=Math.max(day*DAY+480,Math.ceil((now+travel)/30)*30);at+30<=day*DAY+1080;at+=30){
  const end=at+30;
  if(medicineRows(s).filter(r=>r.status==='预约'&&r.clinic===site.id&&r.start<end&&r.end>at).length>=site.capacity)continue;
  if(patient!=='player'&&(educationReservation(e,s,patient,at-travel,30+travel)||employmentReservation(s,patient,at-travel,30+travel)||medicineReservation(s,patient,at-travel,30+travel)||e.npcAutonomyBusy?.(s,patient,at)))continue;
  // 医师每日接诊数受槽 service:capacity 约束（技能阶 × 药童 × 医馆完好度）；满了顺延到下一个有名额的时段。
  const helpers=house?[]:site.assistants.filter(who=>available(e,s,who,at,end,site.seat));
  const capacityOf=who=>serviceCapacityView(e,d,{provider:who,service:'medicine',proficiency:medicalSkill(e,s,who),helpers:helpers.length,factor:site.factor});
  const doctor=site.doctors.find(who=>who!==patient&&dayLoad(s,who,day)<capacityOf(who).capacity&&(house?available(e,s,who,at-travel,end+travel,site.seat):available(e,s,who,at,end,site.seat)));if(!doctor)continue;
  const assistants=helpers.slice(0,1);
  const fee=Math.max(1,Math.ceil((e.rules.economy.wageCopperPerHalfDay?.[0]??10)/2))+Math.round(herbValue(d,e,site,doctor)*(1+medicineRows(s).filter(r=>r.status==='预约'&&r.clinic===site.id).length/Math.max(1,site.capacity)));
  chosen={doctor,assistants,start:at,end,fee,capacitySource:capacityOf(doctor)};break;
 }
 if(!chosen)throw preconditionFailure('医师七日内没有可用排期');
 const fund=charity?fundAt(s,site.seat):null,temple=charity&&!fund?templeSponsor(e,s,site.seat,chosen.fee):null;
 if(financeBalance(d,e,patient)<chosen.fee&&!credit&&!fund&&!temple)throw preconditionFailure('诊费不足，可求赊欠或义诊');
 const prior=s.records?.[`medicine:${id}`];
 const row={id:`medicine:${id}`,category:'medicine_visit',patient,clinic:site.id,location:place,houseCall:house,owner:site.owner??chosen.doctor,...chosen,urgency,depart:chosen.start-travel,travel,from:present(s,patient),source,conditions:conditions.map(c=>({kind:c.kind,id:c.id})),credit,charity:fund?.id??temple?.id??null,consent:true,status:'预约',createdAt:prior?.createdAt??now,arrivalOrder:prior?.arrivalOrder??nextServiceOrder(medicineRows(s))};
 // 回执写明位次与预计受理时刻：排在它前面（紧迫度更高或同级先到）的未开始诊疗数 + 1。
 row.position=queuePosition([...medicineRows(d.get('state')),row],row,{same:r=>r.clinic===site.id,now});row.etaAt=row.start;
 holdingSet(d,null,rec(row.id),row,'medicine');return row;
}
function stockSource(d,e,r){
 if(r.charity?.startsWith('medicine_fund:')){
  const f=d.get(...rec(r.charity)),item=f&&heldMedicine(d,e,f.holder);if(f?.coins>=r.fee&&item)return {holder:f.holder,fund:f,item};
 }
 if(r.charity){const a=groupAccountView(e,d.get('state'),r.charity),item=pickStockOfClass(e,a?.items,MEDICINE);if(a?.coins>=r.fee&&item)return {temple:r.charity,item};}
 for(const holder of [...new Set([r.patient,r.owner,r.doctor])]){const item=heldMedicine(d,e,holder);if(item)return {holder,item};}
 return null;
}
function pay(d,e,r,stock){

 if(stock.fund){financeChange(d,e,r.owner,r.fee,r.id,{account:fundAccount(stock.fund.id),writer:'medicine',eventId:r.id});holdingSet(d,null,rec(stock.fund.id),{...stock.fund,coins:stock.fund.coins-r.fee,spent:stock.fund.spent+r.fee},'medicine');return {paid:r.fee,sponsor:stock.fund.id};}
 if(stock.temple){financeTransfer(d,e,stock.temple,r.owner,r.fee,r.id);return {paid:r.fee,sponsor:stock.temple};}
 const paid=Math.min(financeBalance(d,e,r.patient),r.fee);if(paid<r.fee&&!r.credit)return null;
 if(paid&&r.patient!==r.owner)financeTransfer(d,e,r.patient,r.owner,paid,r.id);
 if(paid<r.fee)registerEarnedClaim(d,e,{id:`debt:${r.id}`,kind:'compensation',service:'medicine',debtor:r.patient,creditor:r.owner,amount:r.fee-paid,paid:0,createdAt:r.end,deadline:r.end+30*DAY,location:r.location,source:r.id});
 return {paid,debt:r.fee-paid};
}
function finish(d,e,r){
 let s=d.get('state'),site=medicineSites(e,s).find(c=>c.id===r.clinic);
 const cancel=reason=>holdingSet(d,null,rec(r.id),{...r,status:'未诊',reason,endedAt:r.end},'medicine');
 if(!site?.capacity||!site.doctors.includes(r.doctor)||!capable(e,s,r.patient)||personConstraint(e,s,r.doctor)||personConstraint(e,s,r.patient)||present(s,r.patient)!==r.location||present(s,r.doctor)!==r.location)return cancel('场所、人员或到诊条件变化');
 const stock=stockSource(d,e,r);if(!stock)return cancel('药材短缺');
 const payment=pay(d,e,r,stock);if(!payment)return cancel('诊费不足');
 const herb=stock.item;
 if(stock.temple){const a=ensureGroupAccount(d,e,stock.temple);moveStock(d,{from:store(e,stock.temple,herb),to:`sink:consume|${itemResource(e,herb)}|treatment`,amount:1,writer:'medicine',eventId:r.id});d.set(groupAccountPath(stock.temple),{...a,items:{...a.items,[herb]:a.items[herb]-1},ledger:[...a.ledger,{kind:'义诊耗药',coins:0,items:{[herb]:-1},sourceEvent:r.id}]});}
 else e.itemDelta(d,stock.holder,herb,-1,HERB_USE('treatment',r.id));
 const score=Math.min(.95,.35+medicalSkill(e,s,r.doctor)/1500+(r.assistants.length?.05:0)),roll=clockRoll(d.get('randomSeed'),`medicine-diagnosis:${r.id}`,r.start),correct=roll<score;
 const outcome=[];
 for(const c of medicalConditions(s,r.patient).filter(c=>r.conditions.some(x=>x.id===c.id&&x.kind===c.kind))){
  if(c.kind==='illness'){
   const ill=structuredClone(c.record),history=[...ill.treatments??[],{visit:r.id,minute:r.end,doctor:r.doctor,correct,herb:1}];
   // Medicine shortens a light illness; a grave one still runs its course but with better odds.
   const reduction=correct&&ill.severity!=='重'?Math.min(DAY,Math.max(0,ill.endsAt-r.end-DAY)):0;
   ill.endsAt-=reduction;ill.treatments=history;ill.lastConsultedAt=r.end;
   if(correct){const odds=ill.fatality??e.rules.npcLife?.health?.graveFatality;if(odds)ill.fatality={cared:odds.cared*.75,alone:odds.alone*.75};ill.treated=r.id;}
   else ill.misdiagnosedAt=r.end;
   d.set(['state','family','illnesses',ill.id],ill);outcome.push({kind:c.kind,id:c.id,courseReduced:reduction});
  }else{
   const path=r.patient==='player'?['state','player','medical']:['state','npcs',r.patient,'medical'],m=structuredClone(d.get(...path)),w=m.wounds.find(w=>w.id===c.id);
   w.treatments=[...w.treatments??[],{visit:r.id,correct,minute:r.end}];
   // Ordinary care cannot remove a foreign body, toxin or seal deep trauma.
   if(correct&&!w.foreignBody&&!(w.toxinUg>0)&&w.depthMm<=3&&w.areaCm2<=20){w.bleedingMlPerMinute=0;w.contamination=Math.max(0,w.contamination-10);w.infectionRisk=Math.max(0,w.infectionRisk-10);w.careDue=r.end+DAY;}
   d.set(path,m);outcome.push({kind:c.kind,id:c.id,careDue:w.careDue??null});
  }
 }
 const wages=[];
 for(const who of [r.doctor,...r.assistants]){const job=currentEmployment(d.get('state'),who,r.start);if(job?.medicine===1&&job.location===r.location)wages.push({worker:who,...settleEmploymentPay(d,e,job,r.end,r.end-r.start)});}
 const takeHome=e.rules.medicine?.takeHome;
 let dispensed=null;
 if(takeHome&&correct&&r.conditions.some(c=>c.kind==='wound')){
  e.itemDelta(d,r.patient,takeHome.item,takeHome.quantity,{flow:'src:craft',purpose:'prescription',writer:'medicine',eventId:r.id});
  dispensed={...takeHome,material:{item:herb,quantity:1,from:stock.temple??stock.holder},patient:r.patient,source:r.id};

 }
 const row={...r,status:'已诊',endedAt:r.end,payment,wages,prescription:{item:herb,quantity:1,identified:correct,consumedFrom:stock.temple??stock.holder,...(dispensed?{dispensed}:{})},diagnosis:{correct,skill:medicalSkill(e,s,r.doctor),roll},outcome,followUpAt:r.end+DAY};
 holdingSet(d,null,rec(r.id),row,'medicine');
}
export function nextMedicineMinute(e,d,now){

 const s=d.get('state');
 return [...medicineRows(s).filter(r=>r.status==='预约').flatMap(r=>[r.depart,r.start,r.end]),
  ...[s.player,...Object.values(s.npcs??{})].flatMap(a=>(a.medical?.wounds??[]).filter(w=>!w.healed).map(w=>w.careDue)),
  ...Object.values(s.family?.illnesses??{}).filter(r=>r.patient==='player'&&r.status==='患病中').map(r=>r.endsAt)]
  .filter(at=>Number.isSafeInteger(at)&&at>now).reduce((a,b)=>Math.min(a,b),Infinity);
}
function autonomous(d,e,now){

 const s=d.get('state'),sites=medicineSites(e,s);if(!sites.some(c=>c.doctors.length&&c.capacity))return;
 const patients=new Set([...Object.values(s.family?.illnesses??{}).filter(r=>r.status==='患病中').map(r=>r.patient),...Object.keys(s.npcs??{}).filter(id=>s.npcs[id].medical?.wounds?.some(w=>!w.healed&&(!w.closed||w.infected)))]);
 for(const {id:patient} of orderServices([...patients].map(id=>({id,urgency:serviceUrgency(medicalConditions(s,id))})))){
  if(patient==='player'||pending(d.get('state'),patient)||!capable(e,s,patient)||s.player.companions?.includes(patient)||s.npcs[patient]?.cognitionTravel||s.npcs[patient]?.scheduleTravel)continue;
  const previous=medicineRows(s).filter(r=>r.patient===patient).sort((a,b)=>b.createdAt-a.createdAt)[0];if(previous&&(previous.followUpAt??previous.createdAt+DAY)>now)continue;
  // People first rest at home; a sickness that lingers or an acute wound sends them to a doctor.
  const condition=medicalConditions(d.get('state'),patient).find(c=>needsCare(c,now));if(!condition)continue;
  const sid=placeSettlement(e,s,present(s,patient)).value,site=sites.find(c=>c.capacity&&c.doctors.some(id=>id!==patient)&&placeSettlement(e,s,c.seat).value===sid);if(!site)continue;
  const poor=financeBalance(d,e,patient)<8,charity=poor,credit=poor&&condition.severity==='重';
  if(poor&&!credit&&!fundAt(s,site.seat)&&!templeSponsor(e,s,site.seat,8)){
   holdingSet(d,null,rec(`medicine_delay:${patient}`),{category:'medicine_delay',patient,clinic:site.id,reason:'诊费不足，暂缓求医',minute:now,condition:condition.id},'medicine');continue;
  }
  try{book(d,e,{patient,clinic:site.id,source:previous?.id??condition.id,credit,charity,consent:true,only:c=>needsCare(c,now)},`auto:${patient}:${now}`);}catch(error){holdingSet(d,null,rec(`medicine_delay:${patient}`),{category:'medicine_delay',patient,clinic:site.id,reason:error.message,minute:now,condition:condition.id},'medicine');}
 }
}
export function prepareMedicine(d,e,{before,after}){
 if(after<=before)return;
 if(Math.floor(before/DAY)<Math.floor(after/DAY)||before%DAY===480)autonomous(d,e,before);
 e.medicineParticipants=new Set();
 for(const r of medicineRows(d.get('state')))if(r.status==='预约'&&r.depart<after&&r.end>before){
  for(const id of [r.doctor,...r.assistants,...r.houseCall?[]:[r.patient]])if(id!=='player')e.medicineParticipants.add(id);
 }
}
export function advanceMedicine(d,e,{before,after}){

 if(after<=before)return;
 for(const queued of waitingInOrder(medicineRows(d.get('state')))){
  // Retry only on real advance boundaries. Failed scheduling leaves the same
  // queue fact, rather than rewriting a daily delay cursor.
  try{obligationTransaction(d,()=>{
   holdingSet(d,null,rec(queued.id),{...queued,status:'重排'},'medicine');
   const visit=book(d,e,{patient:queued.patient,clinic:queued.clinic,source:queued.source,credit:queued.credit,charity:Boolean(queued.charity),consent:true},queued.id.slice('medicine:'.length));
   holdingSet(d,null,rec(queued.id),{...visit,createdAt:queued.createdAt,arrivalOrder:queued.arrivalOrder},'medicine');
  });}catch(error){if(!/排期|预约|路线|赴诊|诊费|医馆|疾病|创伤/.test(error.message))throw error;}
 }
 for(const r of medicineRows(d.get('state')))if(r.status==='预约'){
  if(r.houseCall&&after>=r.start&&before<r.end&&capable(e,d.get('state'),r.doctor)&&!personConstraint(e,d.get('state'),r.doctor)){d.set(['state','npcs',r.doctor,'location'],r.location);d.set(['state','npcs',r.doctor,'activity'],'出诊');}
  else if(r.patient!=='player'&&after>=r.start&&before<r.end&&capable(e,d.get('state'),r.patient)&&!personConstraint(e,d.get('state'),r.patient)){
   // The stored route duration is elapsed before arrival; no stock or coins move in transit.
   d.set(['state','npcs',r.patient,'location'],r.location);d.set(['state','npcs',r.patient,'activity'],'求医');
  }
  if(after>=r.end){finish(d,e,r);const row=d.get(...rec(r.id));if(row?.status==='已诊'&&r.patient!=='player'&&!r.houseCall)d.set(['state','npcs',r.patient,'activity'],'复诊休养');}
 }
 for(const ill of Object.values(d.get('state','family','illnesses')??{}))if(ill.patient==='player'&&ill.status==='患病中'&&ill.endsAt<=after)recoverIllness(d,e,ill,after);
 // Daily dressing and rest can heal limited uncomplicated wounds; missed
 // follow-up or renewed contamination leaves infection in the original wound.
 {
  for(const id of ['player',...Object.keys(d.get('state','npcs')??{})]){
   const path=id==='player'?['state','player','medical']:['state','npcs',id,'medical'],m=d.get(...path);if(!m?.wounds?.some(w=>w.careDue<=after))continue;
   const next=structuredClone(m);for(const w of next.wounds)if(w.careDue<=after&&!w.healed){
    const recent=medicineRows(d.get('state')).some(r=>r.patient===id&&r.status==='已诊'&&r.diagnosis.correct&&after-r.end<=2*DAY);
    if(recent&&!w.infected&&w.contamination===0&&w.bleedingMlPerMinute===0){w.closed=true;w.healed=true;w.healedAt=after;}
    else{w.relapsedAt=after;if(w.infectionRisk>=50)w.infected=true;}
    delete w.careDue;
   }d.set(path,next);
  }
 }
 if(Math.floor(before/DAY)<Math.floor(after/DAY)){
  for(const debt of Object.values(d.get('state','records')??{}))if(debt.category==='debt'&&(debt.kind==='medicine'||debt.service==='medicine')&&settlementPresent(e,d.get('state'),debt.debtor,debt.creditor)&&claimLimitation(d.get('state'),debt.id,after).enforceable){
   const amount=Math.min(dueObligation(d.get('state'),debt.id).owed,Math.max(0,financeBalance(d,e,debt.debtor)-8));
   if(amount)settleClaim(d,e,{id:debt.id,payer:debt.debtor,amount},`${debt.id}:collect:${after}`);
  }
  if(Object.values(d.get('state','records')??{}).some(r=>r.category==='water_exposure'))for(const n of Object.keys(d.get('state','npcs')??{}))for(const exposure of waterDiseaseExposure(d.get('state'),present(d.get('state'),n))){
   const disease=e.rules.hazardClock?.diseases?.find(x=>x.id===exposure.disease);if(disease&&clockRoll(d.get('randomSeed'),`water-exposure:${n}:${exposure.id}`,Math.floor(after/DAY))<exposure.risk)contractIllness(d,e,n,after,{severity:'轻',days:disease.courseDays[0],disease});
  }
 }
 delete e.medicineParticipants;
}
export function medicineAction(d,args,id){
 const e=this,s=d.get('state'),op=args.operation,site=medicineSites(e,s).find(c=>c.id===args.business||c.seat===args.business||c.name===args.business||!args.business&&c.seat===s.location);
 if(op==='medicine_cancel'){
  const visit=s.records?.[args.contract];if(!visit||visit.patient!=='player'||!['预约','排队'].includes(visit.status)||visit.status==='预约'&&visit.start<=s.minute)throw preconditionFailure('只能取消本人尚未开始的诊疗');
  const row={...visit,status:'已取消',endedAt:s.minute};holdingSet(d,null,rec(visit.id),row,'medicine');return row;
 }
 if(op==='medicine_inspect')return {clinics:medicineSites(e,s),visits:medicineRows(s).filter(r=>r.patient==='player'||r.location===s.location),conditions:medicalConditions(s,'player'),funds:Object.values(s.records??{}).filter(r=>r.category==='medicine_fund'&&r.location===s.location)};
 if(!site||site.seat!==s.location)throw preconditionFailure('须到医馆办理');
 if(op==='medicine_seek'){
  if(args.beneficiaries?.some(x=>x!=='player'))throw preconditionFailure('NPC须自主求医，不能代替其同意');
  if(!args.consent)throw preconditionFailure('求医需本人同意');
  return book(d,e,{clinic:site.id,credit:args.action==='credit',charity:args.action==='charity',consent:true},id);
 }
 if(op==='medicine_fund'){
  const coins=financeInt(args.budget??0,0,1e8,'义诊资助'),quantity=financeInt(args.quantity??args.wood??0,0,100000,'施药数量');if(!coins&&!quantity)throw preconditionFailure('须提供实际钱或药材');
  const key=`medicine_fund:${site.seat}`,old=d.get(...rec(key));
  // Escrow is counted here once and paid out only for an actual consultation.
  // 施药收任何药性物品（medicine 类）；指名的东西不是药就拒收，不另找替代。
  const named=quantity&&args.item!==undefined?e.resolve(args.item,'item'):null;
  if(named&&!isItemClass(e,named,MEDICINE))throw preconditionFailure(`${e.byId.get(named)?.name??'这件东西'}不是药材，医馆不收作施药`);
  const herb=quantity?named??heldMedicine(d,e,'player',quantity):null;
  if(quantity&&!herb)throw preconditionFailure(`行囊里没有够${quantity}份的药材`);
  if(coins)financeChange(d,e,'player',-coins,id,{account:fundAccount(key),writer:'medicine',eventId:id});
  const holder=old?.holder??site.owner;if(!holder)throw preconditionFailure('医馆没有接收药材的经营者');
  if(quantity)transferItems(d,e,'player',holder,herb,quantity);
  const row={id:key,category:'medicine_fund',location:site.seat,holder,coins:(old?.coins??0)+coins,spent:old?.spent??0,herbsDonated:(old?.herbsDonated??0)+quantity,donations:[...old?.donations??[],{source:id,coins,quantity,...(herb?{item:herb}:{}),minute:s.minute}]};holdingSet(d,null,rec(key),row,'medicine');return row;
 }
 if(op==='medicine_hire'){
  // The clinic owner signs; doctor or helper role follows the worker's current skill.
  if(site.owner!=='player')throw preconditionFailure('须是本人经营的医馆才能雇人');
  const worker=e.resolve(args.member);counterpart(d,e,worker,{consent:args.consent});
  if(currentEmployment(s,worker)||personOffices(e,s,worker).length)throw preconditionFailure('对方已有雇佣或公职');
  const wage=financeInt(args.proposedFee,1,1e6,'日薪'),days=financeInt(args.days??30,1,360,'雇佣天数'),key=`medicine_contract:${id}`;
  const task=medicalSkill(e,s,worker)>0?'医师诊疗':'药童';
  const row={category:'contract',kind:'workshop',medicine:1,id:key,owner:'player',worker,location:site.seat,wage,workMinutes:480,task,starts:s.minute,createdAt:s.minute,deadline:s.minute+days*DAY,status:'有效',paid:0,workedMinutes:0,source:id};
  holdingSet(d,null,rec(key),row,'medicine');return {contract:key,worker,task,wage};
 }
 if(op==='medicine_health'){
  // U3 public-health measures run through the registered epidemic effect; the clinic supplies staff and herbs.
  const settlement=placeSettlement(e,s,site.seat).value,ep=Object.values(s.records??{}).find(r=>r.category==='epidemic'&&r.status==='流行'&&r.settlements.includes(settlement));
  if(!ep)throw preconditionFailure('本地眼下没有流行疫病');
  const measure=args.choice??'treatment';if(!['treatment','quarantine'].includes(measure))throw preconditionFailure('医馆只能施治或隔离');
  const doctor=site.doctors.find(who=>present(s,who)===site.seat&&!personConstraint(e,s,who));if(!doctor)throw preconditionFailure('医馆眼下没有在场医师');
  const sick=Object.values(ep.households).filter(h=>h.settlement===settlement&&h.status==='发病').length,need=measure==='treatment'?Math.max(1,sick):0;
  const holder=[site.owner,doctor,'player'].find(h=>h&&(!need||heldMedicine(d,e,h,need)));if(need&&!holder)throw preconditionFailure(`药材短缺，施治需${need}份`);
  const herb=need?heldMedicine(d,e,holder,need):null;
  const clock=ep.id.slice(9,ep.id.lastIndexOf(':')),minutes=financeInt(args.days??7,1,90,'防疫天数')*DAY;
  const receipt=applyEffects(d,e,[{kind:'epidemic_measure',measure,minutes,settlement}],{settlement,minute:s.minute,sourceEvent:id,clock},'world');
  if(!receipt.applied)throw Error(receipt.reason??'防疫没有作用对象');
  if(need)e.itemDelta(d,holder,herb,-need,HERB_USE('epidemic',id));
  return {epidemic:ep.id,measure,doctor,herbs:need,consumedFrom:holder??null};
 }
 throw preconditionFailure('未知诊疗操作');
}
