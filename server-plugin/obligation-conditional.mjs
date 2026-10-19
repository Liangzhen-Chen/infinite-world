// Actual goods performance for signed forward and non-financial promises.
// The canonical row is the claim; receipts contain evidence, never a balance.
import {openObligation,amendObligation,dueObligation,settleObligation,assertObligationAuthority} from './obligation-runtime.mjs';
import {obligationRow} from './obligation-state.mjs';
import {obligationTransaction} from './transition.mjs';
import {settlementLocation,settlementPresent} from './obligation-presence.mjs';
import {transferItems} from './items.mjs';
import {canonical} from './storage.mjs';
import {ledgerActive} from './ledger.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';

declareHoldingWriter('obligation-conditional',{kinds:[]});

const supported=new Set(['forward','delivery','pact','gratitude','vow']);
const positive=n=>Number.isSafeInteger(n)&&n>0;
export function openGoodsObligation(d,e,args,eventId){
 return obligationTransaction(d,()=>{
  const {kind='forward',debtor,creditor,item,quantity,prepayment=0,deadline,location=d.get('state','location')}=args;
  if(!supported.has(kind)||debtor===creditor||!e.byId.get(item)||!positive(quantity)||!Number.isSafeInteger(prepayment)||prepayment<0||!Number.isSafeInteger(deadline)||deadline<d.get('state','minute')||!e.byId.has(location))throw Error('交付条款无效');
  if(prepayment&&!ledgerActive(d))throw Error('远期预付须在已开账的引擎事务中执行');
  if(kind!=='forward'&&prepayment)throw Error('只有远期买卖可在本入口预付');
  const id=args.id??`conditional:${eventId}`,terms={...args.terms,performance:{item,location},onDebtorGone:args.terms?.onDebtorGone??(kind==='forward'?'assume_by_heirs':undefined)};
  if(terms.onDebtorGone===undefined)delete terms.onDebtorGone;
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
  if(!eventId)throw Error('交付须有事件编号');
  const row=obligationRow(d.get('state'),id),terms=row?.terms?.performance;
  if(!row||!supported.has(row.kind)||!terms||row.resource!==terms.item)throw Error('没有可执行的实物交付条款');
  id=row.id;
  const signature=canonical({id,actor:actor??null,quantity,...authority}),key=`conditional_receipt:${id}:${eventId}`,prior=d.get('state','records',key);
  if(prior){if(prior.signature!==signature)throw Error('交付事件编号已用于其他输入');return prior.result;}
  actor??=row.debtor;
  const s=d.get('state'),view=dueObligation(s,row);
  const procedure=s.records?.[`transition_procedure:${row.debtor}`],inherited=s.records?.[`transition_procedure:${row.inheritanceFrom}`];
  if(procedure&&procedure.phase!=='closed'||inherited&&inherited.phase!=='closed'&&inherited.reopenedClaims?.includes(id))throw Error('交付债权正由转移程序控制');
  if(row.inheritanceFrom&&row.terms?.liabilityCap!==undefined)throw Error('实物继承责任限额需要共享计价接点');
  if(!positive(quantity)||quantity>view.owed)throw Error('交付数量超过未履行数量');
  // Termination stops new service, but cannot erase already prepaid goods.
  if(['void','cancelled','bad_debt'].includes(row.status))throw Error('该交付义务已消灭');
  assertObligationAuthority(e,s,{...authority,actor,debtor:row.debtor},'contract');
  if(!settlementPresent(e,s,actor,row.creditor)||settlementLocation(e,s,actor)!==terms.location||settlementLocation(e,s,row.debtor)!==terms.location)throw Error('须在约定地点实际交货');
  if(e.quantity(d,row.debtor,terms.item)<quantity)throw Error('实际库存不足，短交部分仍欠付');
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
 if(!row?.terms?.performance||!supported.has(row.kind))throw Error('没有可展期的交付义务');
 return amendObligation(d,e,{...args,changes:{deadline:args.deadline}},eventId);
}
