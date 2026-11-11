// Signed clauses are facts; current usability is derived, never a stored flag.
import {facilityView} from './facility-state.mjs';

// Composition installs the finance adapter; ecology depends on contract
// semantics without importing another L2 package or creating an import cycle.
let leaseSettlement;
export const installLeaseSettlement=runtime=>{leaseSettlement=runtime;};
export function settleCropLease(d,e,farm,eventId){
 const row=farm.lease&&d.get('state','records',farm.lease);
 if(contractTerms(row??{}).tenancy?.rentMode!=='share')return null;
 if(!leaseSettlement)throw Error('分成租结算适配器未安装');
 return leaseSettlement.harvest(d,e,{farm,eventId});
}
export const finishCropLease=(d,e,farm)=>leaseSettlement?.finish(d,e,farm);

// The registered public warehouse owns its stock, lots and reception rules.
// Finance and obligations reach that ecology implementation through L1.
let leaseGrainReceiver;
export const installLeaseGrainReceiver=receive=>{leaseGrainReceiver=receive;};
export function receiveLeaseGrain(d,e,args){
 if(!leaseGrainReceiver)throw Error('Public rent grain receiver is not installed');
 return leaseGrainReceiver(d,e,args);
}

const fields=['parties','owner','worker','employer','tenant','holder','issuer','partner','subject','room','location','kind','quantity','cost','wage','workMinutes','minutes','recipe','task','share','stake','baselineNet','baselineProfit','unitPrice','targetQuantity','demandSource','supplier','item','project','farm','monthlyRent','starts','createdAt','deadline','expires','onHolderGone','onEmployerGone','onWorkerGone','actedAs','inName','signingPlace','signingLaw','signingLawVersion','calendar','days','grace','exclusive','autoSettle','limitation','accrual'];
fields.push('liability','rentDueAt','tenancy','unharvestedCrops');
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
  ...(row.prepayment!==undefined?{prepayment:row.prepayment}:{}),
  ...(row.rentBasis!==undefined?{rentBasis:structuredClone(row.rentBasis)}:{}),
  ...(row.tenancy!==undefined?{tenancy:structuredClone(row.tenancy)}:{}),
  ...(row.unharvestedCrops!==undefined?{unharvestedCrops:row.unharvestedCrops}:{}),
  usability:{minimumCondition:25,reducedBelow:60,reducedFactor:0.5},...row.clauses};
}

// Gross is physical output. Net excludes only inputs actually consumed for
// this crop, valued at the signed prices. Round the cumulative bill once.
export function tenancyRentAmount(tenancy,gross,inputs=[]){
 const price=tenancy.cropPrice??{numerator:1,denominator:1};
 let n=BigInt(gross)*BigInt(price.numerator),d=BigInt(price.denominator);
 if(tenancy.outputBasis==='net')for(const input of inputs){
  if(tenancy.netInputs==='consumed-seed'&&input.kind!=='seed')continue;
  const p=input.price;n=n*BigInt(p.denominator)-BigInt(input.quantity)*BigInt(p.numerator)*d;d*=BigInt(p.denominator);
 }
 if(n<=0n)return 0;
 n*=BigInt(tenancy.shareNumerator);d*=BigInt(tenancy.shareDenominator);
 if(tenancy.rentPayment==='kind'){n*=BigInt(price.denominator);d*=BigInt(price.numerator);}
 const amount=Number(n/d);if(!Number.isSafeInteger(amount))throw Error('租金超出整数范围');return amount;
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
