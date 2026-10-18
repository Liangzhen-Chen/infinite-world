// Signed clauses are facts; current usability is derived, never a stored flag.
import {facilityView} from './facility-state.mjs';

const fields=['parties','owner','worker','employer','tenant','holder','issuer','subject','location','kind','quantity','cost','wage','workMinutes','minutes','recipe','task','share','stake','monthlyRent','starts','createdAt','deadline','expires'];
export function snapshotContractTerms(row){
 if(row.clauses)return row;
 const terms=Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,structuredClone(row[k])]));
 return {...row,clauses:{...terms,starts:row.starts??row.createdAt??0,expires:row.expires??row.deadline,
  ...(row.kind==='asset_lease'?leaseClauses(row):{})}};
}
export function contractTerms(row,minute=Infinity){
 if(!row.clauses)return row;
 const terms={...row,...row.clauses};
 // Party substitution is a protocol fact; economic terms are signed facts.
 for(const field of ['owner','employer','worker','tenant','parties'])if(row.substitutedAt!==undefined)terms[field]=row[field];
 for(const a of row.amendments??[])if(a.minute<=minute)for(const k of fields)if(a[k]!==undefined)terms[k]=a[k];
 terms.deadline=terms.expires;return terms;
}
export function contractState(row,minute){
 const terms=contractTerms(row,minute),ended=row.endedAt??row.resolvedAt;
 const legacyEnded=!row.clauses&&['已终止','已到期','已取消','已解除','已辞退','已辞职','已完成','违约'].includes(row.status);
 const active=ended===undefined&&!legacyEnded&&minute>=(terms.starts??0)&&minute<(terms.deadline??Infinity);
 return {active,status:active?(row.suspendedAt!==undefined?'suspended':'effective'):'ended',terms};
}

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
