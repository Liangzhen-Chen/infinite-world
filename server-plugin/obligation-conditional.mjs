import {preconditionFailure} from './precondition.mjs';
// Actual goods performance for signed forward and non-financial promises.
// The canonical row is the claim; receipts contain evidence, never a balance.
import {openObligation,amendObligation,closeObligation,dueObligation,settleObligation,assertObligationAuthority} from './obligation-runtime.mjs';
import {obligationRow,obligationClosed} from './obligation-state.mjs';
import {requestContractConsent} from './action-consent.mjs';
import {obligationTransaction} from './transition.mjs';
import {settlementLocation,settlementPresent} from './obligation-presence.mjs';
import {transferItems} from './items.mjs';
import {canonical} from './storage.mjs';
import {ledgerActive} from './ledger.mjs';
import {marketQuote} from './market.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings,closeHolding} from './holdings.mjs';

declareHoldingWriter('obligation-conditional',{kinds:['pledged']});

const supported=new Set(['forward','delivery','pact','gratitude','vow']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
export function openGoodsObligation(d,e,args,eventId){
 return obligationTransaction(d,()=>{
  const {kind='forward',debtor,creditor,item,quantity,prepayment=0,deadline,location=d.get('state','location')}=args;
  if(!supported.has(kind)||debtor===creditor||!e.byId.get(item)||!positive(quantity)||!Number.isSafeInteger(prepayment)||prepayment<0||!Number.isSafeInteger(deadline)||deadline<d.get('state','minute')||!e.byId.has(location))throw preconditionFailure('交付条款无效');
  if(prepayment&&!ledgerActive(d))throw Error('远期预付须在已开账的引擎事务中执行');
  if(kind!=='forward'&&prepayment)throw preconditionFailure('只有远期买卖可在本入口预付');
  const id=args.id??`conditional:${eventId}`,terms={...args.terms,performance:{item,location},onDebtorGone:args.terms?.onDebtorGone??(kind==='forward'?'assume_by_heirs':undefined)};
  if(terms.onDebtorGone===undefined)delete terms.onDebtorGone;
  if(kind==='forward')terms.forward={consideration:Math.max(1,Math.ceil(marketQuote(d,e,{item,location,seller:debtor,buyer:creditor}).listPrice*quantity))};
  const result=openObligation(d,e,{...args,id,kind,debtor,creditor,resource:item,amount:quantity,deadline,terms},eventId);
  if(prepayment){
   const payment=`${id}:prepayment`;
   openObligation(d,e,{id:payment,kind:'promise',debtor:creditor,creditor:debtor,actor:creditor,amount:prepayment,deadline:d.get('state','minute'),subject:id},`${eventId}:prepayment-open`);
   settleObligation(d,e,{id:payment,payer:creditor,amount:prepayment},`${eventId}:prepayment`);
  }
  return result;
 });
}
export function performGoodsObligation(d,e,{id,actor,quantity,...authority},eventId){
 return obligationTransaction(d,()=>{
  if(!eventId)throw preconditionFailure('交付须有事件编号');
  const row=obligationRow(d.get('state'),id),terms=row?.terms?.performance;
  if(!row||!supported.has(row.kind)||!terms||row.resource!==terms.item)throw preconditionFailure('没有可执行的实物交付条款');
  id=row.id;
  const signature=canonical({id,actor:actor??null,quantity,...authority}),key=`conditional_receipt:${id}:${eventId}`,prior=d.get('state','records',key);
  if(prior){if(prior.signature!==signature)throw preconditionFailure('交付事件编号已用于其他输入');return prior.result;}
  actor??=row.debtor;
  const s=d.get('state'),view=dueObligation(s,row);
  const procedure=s.records?.[`transition_procedure:${row.debtor}`],inherited=s.records?.[`transition_procedure:${row.inheritanceFrom}`];
  if(procedure&&procedure.phase!=='closed'||inherited&&inherited.phase!=='closed'&&inherited.reopenedClaims?.includes(id))throw preconditionFailure('交付债权正由转移程序控制');
  if(row.inheritanceFrom&&row.terms?.liabilityCap!==undefined)throw preconditionFailure('实物继承责任限额需要共享计价接点');
  if(!positive(quantity)||quantity>view.owed)throw preconditionFailure('交付数量超过未履行数量');
  // Termination stops new service, but cannot erase already prepaid goods.
  if(['void','cancelled','bad_debt'].includes(row.status))throw preconditionFailure('该交付义务已消灭');
  assertObligationAuthority(e,s,{...authority,actor,debtor:row.debtor},'contract');
  if(!settlementPresent(e,s,actor,row.creditor)||settlementLocation(e,s,actor)!==terms.location||settlementLocation(e,s,row.debtor)!==terms.location)throw preconditionFailure('须在约定地点实际交货');
  if(e.quantity(d,row.debtor,terms.item)<quantity)throw preconditionFailure('实际库存不足，短交部分仍欠付');
  transferItems(d,e,row.debtor,row.creditor,terms.item,quantity);
  const remaining=view.owed-quantity,next={...row,paid:(row.paid??0)+quantity,...(row.remaining!==undefined?{remaining}:{}),...(row.inheritanceFrom?{inheritedPaid:(row.inheritedPaid??0)+quantity}:{}),status:remaining?'pending':'completed',...(remaining?{}:{resolvedAt:s.minute}),events:[...row.events??[],{eventId,minute:s.minute,actor,quantity}]};
  d.set(['state','obligations',id],next);
  const result={id,transferred:quantity,remaining,evidence:key};
  holdingSet(d,null,['state','records',key],{category:'conditional_receipt',id:key,signature,result,obligation:id,minute:s.minute,item:terms.item,parties:[row.debtor,row.creditor]},'obligation-conditional');
  publishTransitionEvent(d,e,{id:key,verb:'trade',actor,target:row.creditor,minute:s.minute,location:terms.location,visibility:'private',witnesses:[],participants:[row.debtor,row.creditor],tags:['obligation'],obligation:id,value:quantity});
  return result;
 });
}
export function extendGoodsObligation(d,e,args,eventId){
 const row=obligationRow(d.get('state'),args.id);
 if(!row?.terms?.performance||!supported.has(row.kind))throw preconditionFailure('没有可展期的交付义务');
 return amendObligation(d,e,{...args,changes:{deadline:args.deadline}},eventId);
}
export function cancelGoodsObligation(d,e,{id,actor='player'},eventId){
 return obligationTransaction(d,()=>{
  const key=`conditional_cancel:${id}:${eventId}`,prior=d.get('state','records',key);
  if(prior){if(prior.actor!==actor)throw preconditionFailure('取消回执不属于本次当事人');return prior.result;}
  const s=d.get('state'),row=obligationRow(s,id);
  if(!eventId||row?.kind!=='forward'||!row.terms?.performance||!row.terms.forward||obligationClosed(row)||row.endedAt!==undefined)throw preconditionFailure('没有可合意取消的远期义务');
  const initiatingDebtor=actor===row.debtor,party=initiatingDebtor?row.debtor:row.creditor,other=initiatingDebtor?row.creditor:row.debtor;
  assertObligationAuthority(e,s,{actor,debtor:party},'contract');
  if(!settlementPresent(e,s,row.debtor,row.creditor))throw preconditionFailure('双方须在场商议取消远期');
  const remaining=dueObligation(s,row).owed,payment=s.obligations?.[`${row.id}:prepayment`];
  const refund=Number(BigInt(payment?.paid??0)*BigInt(remaining)/BigInt(row.amount)),terms={quantity:remaining,prepayment:refund,deadline:row.deadline};
  const releasedValue=row.terms.forward.consideration*remaining/row.amount;
  const agreement=requestContractConsent(d,e,{from:other,to:party,scope:'amend',purpose:row.id,subject:row.id,terms,cost:initiatingDebtor?{value:releasedValue}:{coins:refund},reward:initiatingDebtor?refund:releasedValue,eventId});
  if(!agreement.allowed)throw preconditionFailure('对方未同意本次取消及退款条款');
  if(refund){
   const claim=`${row.id}:refund`;
   openObligation(d,e,{id:claim,kind:'promise',debtor:row.debtor,creditor:row.creditor,actor:row.debtor,amount:refund,deadline:s.minute,subject:row.id},`${eventId}:refund-open`);
   settleObligation(d,e,{id:claim,payer:row.debtor,actor:row.debtor,amount:refund},`${eventId}:refund`);
  }
  closeObligation(d,e,{id:row.id,actor:initiatingDebtor?row.creditor:actor,party:row.creditor,reason:'creditor_waiver'},`${eventId}:close`);
  for(const pledge of aliveHoldings(d,{kind:'pledged',holder:row.id}))closeHolding(d,{id:pledge.id,reason:'released',writer:'obligation-conditional',eventId});
  const closed=d.get('state','obligations',row.id);
  d.set(['state','obligations',row.id],{...closed,endReason:'mutual_cancellation',cancellation:{eventId,consent:agreement.source,refund}});
  const result={id:row.id,cancelled:remaining,refund,consent:agreement.source};
  holdingSet(d,null,['state','records',key],{category:'conditional_receipt',actor,obligation:row.id,minute:s.minute,result},'obligation-conditional');
  return result;
 });
}
