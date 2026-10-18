// Signed clauses are facts; current usability is derived, never a stored flag.
import {facilityView} from './facility-state.mjs';

export function leaseClauses(row){
 return {starts:row.createdAt,expires:row.deadline,monthlyRent:row.monthlyRent,
  usability:{minimumCondition:25,reducedBelow:60,reducedFactor:0.5},...row.clauses};
}
export function leaseState(engine,state,row,minute=state.minute){
 const terms=leaseClauses(row),facility=facilityView(engine,state,row.subject);
 // Signed records use termination facts and the agreed interval. The status
 // column remains a compatibility projection for older records only.
 const legacyEnded=!row.clauses&&['已终止','已到期','已取消'].includes(row.status);
 const active=row.endedAt===undefined&&row.resolvedAt===undefined&&!legacyEnded&&minute>=terms.starts&&minute<terms.expires;
 const rule=terms.usability;
 const factor=!active||!facility||facility.burning||facility.condition<rule.minimumCondition?0:facility.condition<rule.reducedBelow?rule.reducedFactor:1;
 return {active,factor,status:!active?'ended':factor===0?'suspended':factor===1?'effective':'reduced',monthlyRent:terms.monthlyRent*factor,clauses:terms};
}
