// Signed clauses are facts; current usability is derived, never a stored flag.
import {facilityView} from './facility-state.mjs';

const fields=['parties','owner','worker','employer','tenant','holder','issuer','partner','subject','room','location','kind','quantity','cost','wage','workMinutes','minutes','recipe','task','share','stake','baselineNet','baselineProfit','unitPrice','targetQuantity','demandSource','supplier','item','project','farm','monthlyRent','starts','createdAt','deadline','expires','onHolderGone','onEmployerGone','onWorkerGone','actedAs','inName','signingPlace','signingLaw','signingLawVersion','calendar','days','grace','exclusive','autoSettle','limitation','accrual'];
fields.push('liability','rentDueAt');
const signingFacts=new Set(['actedAs','inName','signingPlace','signingMinute','signingLaw','signingLawVersion','liability']);
export const contractSigningFacts=terms=>Object.fromEntries([...signingFacts].filter(k=>terms[k]!==undefined).map(k=>[k,structuredClone(terms[k])]));
export function snapshotContractTerms(row){
 if(row.clauses)return row;
 const terms=Object.fromEntries(fields.filter(k=>row[k]!==undefined).map(k=>[k,structuredClone(row[k])]));
 const clauses={...terms,initialStatus:row.status,starts:row.starts??row.createdAt??0,expires:row.expires??row.deadline,
  ...(row.kind==='asset_lease'?leaseClauses(row):{})};
 return {...row,clauses:Object.fromEntries(Object.entries(clauses).filter(([,v])=>v!==undefined))};
}
export function contractTerms(row,minute=Infinity){
 if(!row.clauses)return row;
 const terms={...row,...row.clauses};
 // Party substitution is a protocol fact; economic terms are signed facts.
 for(const field of ['owner','employer','worker','tenant','holder','issuer','partner','parties'])if(row.substitutedAt!==undefined){if(Object.hasOwn(row,field))terms[field]=row[field];else delete terms[field];}
 for(const a of row.amendments??[])if(a.minute<=minute){for(const k of fields)if(!signingFacts.has(k)&&a[k]!==undefined)terms[k]=a[k];if(a.deadline!==undefined)terms.expires=a.deadline;}
 if(terms.expires!==undefined)terms.deadline=terms.expires;
 else{delete terms.deadline;delete terms.expires;}
 if(row.endedAt===undefined&&row.resolvedAt===undefined&&row.settledAt===undefined&&['已终止','已到期','已取消','已解除','已辞退','已辞职','已辞工','已完成','已结算','已转让','中止','违约'].includes(row.status))terms.status=row.clauses.initialStatus??'有效';
 return terms;
}
export const partyInProcedure=(state,id)=>{const p=state.records?.[`transition_procedure:${id}`];return Boolean(p&&p.phase!=='closed');};
export function contractState(row,minute){
 const terms=contractTerms(row,minute),ended=row.endedAt??row.resolvedAt??row.settledAt;
 const legacyEnded=!row.clauses&&['已终止','已到期','已取消','已解除','已辞退','已辞职','已辞工','已完成','已结算','已转让','中止','违约'].includes(row.status);
 const active=ended===undefined&&!legacyEnded&&minute>=(terms.starts??0)&&minute<(terms.deadline??Infinity);
 return {active,status:active?(row.suspendedAt!==undefined?'suspended':'effective'):'ended',terms};
}

export function leaseClauses(row){
 return {starts:row.starts??row.createdAt,expires:row.expires??row.deadline,monthlyRent:row.monthlyRent,
  ...(row.rentDueAt!==undefined?{rentDueAt:row.rentDueAt}:{}),
  usability:{minimumCondition:25,reducedBelow:60,reducedFactor:0.5},...row.clauses};
}
export function leaseState(engine,state,row,minute=state.minute){
 const terms={...leaseClauses(row),...contractTerms(row,minute)},facility=facilityView(engine,state,terms.subject);
 // Signed records use termination facts and the agreed interval. The status
 // column remains a compatibility projection for older records only.
 const legacyEnded=!row.clauses&&['已终止','已到期','已取消'].includes(row.status);
 const active=row.endedAt===undefined&&row.resolvedAt===undefined&&!legacyEnded&&minute>=terms.starts&&minute<terms.expires;
 const rule=terms.usability;
 // Land rent is not discounted by a building-condition projection (05 §5.1).
 const factor=!active?0:terms.use==='field'?1:!facility||facility.burning||facility.condition<rule.minimumCondition?0:facility.condition<rule.reducedBelow?rule.reducedFactor:1;
 return {active,factor,status:!active?'ended':factor===0?'suspended':factor===1?'effective':'reduced',monthlyRent:terms.monthlyRent*factor,clauses:terms};
}
