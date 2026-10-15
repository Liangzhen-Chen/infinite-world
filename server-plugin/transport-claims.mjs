// Carriage contract follow-through: weather exposure on the road lowers the
// arrival value of sensitive cargo and the carrier pays the contract's claim;
// escort pay accrues by the days actually spent moving or stranded.
import {financeBalance,financeTransfer,financeChange} from './finance-bank.mjs';
import {precipitationAt} from './weather.mjs';

const DAY=1440,path=id=>['state','records',id];
const sensitive=(e,terms,item)=>(e.byId.get(item)?.tags??[]).some(tag=>terms.sensitiveTags.includes(tag));
// Terms are copied into the waybill when it is signed.
export function carriageTerms(e,cargo){
 const c=e.rules.economy?.credit?.carriage;if(!c||!cargo.length)return null;
 return {damagePerExposedDay:c.damagePerExposedDay,maximumDamage:c.maximumDamage,liabilityRate:c.liabilityRate,sensitiveTags:[...c.sensitiveTags]};
}
export function escortTerms(fee,departAt,arrivalAt){
 if(!fee)return null;const plannedDays=Math.max(1,Math.ceil((arrivalAt-departAt)/DAY));
 return {fee,plannedDays,dailyRate:fee/plannedDays};
}
const accrued=(terms,days)=>Math.round(terms.fee*days/terms.plannedDays);
// A stranded waybill keeps its escort engaged: the escort commission's term
// follows the shipment's next node instead of lapsing unpaid.
export function holdEscort(d,row){
 const q=row.escortQuest&&d.get('state','quests',row.escortQuest),next=row.transport?.nextAt;
 if(q?.status==='进行中'&&Number.isFinite(next)&&q.deadline<next+DAY)d.set(['state','quests',q.id],{...q,deadline:next+DAY});
}
// Called at every waybill node: one exposure per calendar day in rain or snow
// at the shipment's current open-air node.
export function exposeCargo(d,e,row,minute){
 if(row.escortTerms){const days=Math.max(1,Math.ceil((minute-row.departAt)/DAY));row.escortAccrued={days,copper:accrued(row.escortTerms,days)};}
 const terms=row.carriageTerms;if(!terms||!row.cargo.some(c=>sensitive(e,terms,c.item)))return;
 const day=Math.floor(minute/DAY);if(row.exposure?.some(x=>x.day===day))return;
 const kind=precipitationAt(e,d.document.randomSeed,row.transport.location,minute);if(!kind)return;
 row.exposure=[...row.exposure??[],{day,kind,location:row.transport.location,minute}];
}
function debt(d,e,id,{kind,debtor,creditor,amount,minute,contract,location}){
 d.set(path(id),{category:'debt',kind,debtor,creditor,amount,paid:0,status:'待偿还',createdAt:minute,deadline:minute+e.rules.economy.credit.loan.defaultGraceMinutes,contract,location});return id;
}
export function settleCarriage(d,e,row,minute){
 const terms=row.carriageTerms;if(!terms||row.claim)return;
 const days=row.exposure?.length??0,damage=Math.min(terms.maximumDamage,terms.damagePerExposedDay*days);
 row.cargo=row.cargo.map(c=>{
  const value=c.quantity*(e.byId.get(c.item)?.basePrice??0),hit=damage>0&&sensitive(e,terms,c.item),arrivalValue=hit?Math.floor(value*(1-damage)):value;
  return {...c,damage:hit?damage:0,value,arrivalValue,loss:value-arrivalValue};
 });
 const loss=row.cargo.reduce((n,c)=>n+c.loss,0);if(!loss||row.carrier===row.owner){row.claim={exposedDays:days,damage,loss,claim:0,paid:0,owed:0,minute};return;}
 const claim=Math.ceil(loss*terms.liabilityRate),paid=Math.min(claim,financeBalance(d,e,row.carrier));
 if(paid)financeTransfer(d,e,row.carrier,row.owner,paid,`${row.id}:claim`);
 const owed=claim-paid,ref=owed?debt(d,e,`debt_transport_claim:${row.id}`,{kind:'transport_claim',debtor:row.carrier,creditor:row.owner,amount:owed,minute,contract:row.id,location:row.to}):null;
 row.claim={exposedDays:days,damage,loss,claim,paid,owed,debt:ref,minute};
}
// Escrow pays the escort up to the accrued wage; any surplus returns to the
// shipper, and days beyond the escrow are paid by the shipper or owed.
export function settleEscort(d,e,row,quest,minute){
 const days=Math.max(1,Math.ceil((minute-row.departAt)/DAY)),due=row.escortTerms?accrued(row.escortTerms,days):quest.escrow;
 const fromEscrow=Math.min(quest.escrow,due),refund=quest.escrow-fromEscrow,extra=due-fromEscrow;
 if(fromEscrow)financeChange(d,e,row.escort,fromEscrow,`${row.id}:escort`);
 if(refund)financeChange(d,e,row.owner,refund,`${row.id}:escort_refund`);
 const extraPaid=extra?Math.min(extra,financeBalance(d,e,row.owner)):0;
 if(extraPaid)financeTransfer(d,e,row.owner,row.escort,extraPaid,`${row.id}:escort_extra`);
 const owed=extra-extraPaid,ref=owed?debt(d,e,`debt_escort_wage:${row.id}`,{kind:'escort_wage',debtor:row.owner,creditor:row.escort,amount:owed,minute,contract:row.id,location:row.to}):null;
 row.escortLedger={days,plannedDays:row.escortTerms?.plannedDays??null,due,fromEscrow,refund,extraPaid,owed,debt:ref};
 return {paid:fromEscrow+extraPaid,refund};
}
