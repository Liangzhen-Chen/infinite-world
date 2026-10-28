// S5-F 多法域计价。设计 15 §15.3：本地一切报价以法域的法定计价单位 legalTender.unit 计，
// 合同记资源种类与数量、从不换算。这里只放派生与付款换算，不存任何新账：
//   - 报价单位 = 所在法域法典的 legalTender.unit（派生，缺省为基准币 coin_river）；
//   - 单位对基准币的比价走 currency.mjs 的兑换率（通货）或 market.mjs 的市场估值（商品单位，如羊）；
//   - 市场报价的内部尺度仍是基准币（目录基价），报价单位数量 = 基准币总额 ÷ 比价，取整数：
//     买方向上取整、卖方向下取整，所以不会出现“半只羊”这种小数实物。
import {currencyRow,currencyAccepted,exchangeRate} from './currency.mjs';
import {marketQuote} from './market.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {decimalFraction,fraction} from './obligation-calendar.mjs';
import {preconditionFailure} from './precondition.mjs';
import {transferItems,changeItems} from './items.mjs';
import {vaultGoods} from './stock.mjs';
import {holdingSet} from './holdings.mjs';
import {partyAccount,moveCoins,mirrorPartyCoins} from './money.mjs';

export const REFERENCE='coin_river';
const F=decimalFraction,ONE=fraction(1n,1n);
const decode=a=>fraction(BigInt(a.numerator),BigInt(a.denominator)),encode=a=>({numerator:String(a.numerator),denominator:String(a.denominator)});
// copper (integer) ÷ value (fraction) rounded to an integer unit count.
const divide=(copper,value,up)=>{
 const n=BigInt(copper)*value.denominator,den=value.numerator;
 if(den<=0n)throw preconditionFailure('计价单位当前没有可成交比价');
 return Number(up?(n+den-1n)/den:n/den);
};

export function tenderUnit(e,s,location){
 return legalCodeAt(e,location,s)?.recognition?.legalTender?.unit??REFERENCE;
}
// Reference copper in one unit of `resource` at `location` (derived, never stored).
export function resourceValue(d,e,{resource,location=d.get('state','location')}){
 if(resource===REFERENCE)return ONE;
 if(currencyRow(e,resource))return decode(exchangeRate(d,e,{from:resource,to:REFERENCE,location}).exact);
 const item=e.byId.get(resource);
 if(!item)throw preconditionFailure('这种计价物没有可派生的市场比价');
 return F(marketQuote(d,e,{item:resource,location,quantity:1}).listPrice);
}
// The item that physically changes hands for a resource (a coin is its coinage item).
export const resourceItem=(e,resource)=>currencyRow(e,resource)?.item??resource;

// Display quote of a reference-copper total in the place's legal-tender unit.
// Only integers and exact fractions leave this function (they may reach receipts); floats stay out.
export function tenderQuote(d,e,{location,copper,side='buy'}){
 const s=d.get('state'),unit=tenderUnit(e,s,location);
 if(unit===REFERENCE)return {unit,amount:copper,exactRate:encode(ONE)};
 try{
  const value=resourceValue(d,e,{resource:unit,location});
  return {unit,amount:divide(copper,value,side==='buy'),exactRate:encode(value)};
 }catch(error){
  if(error?.code!=='E-ACTION-PRECONDITION')throw error;
  return {unit,amount:null,unavailable:error.message};
 }
}
// What the payer must hand over, in the resource actually used, for a reference-copper bill.
export function paymentPlan(d,e,{resource,copper,location=d.get('state','location')}){
 if(resource!==REFERENCE&&currencyRow(e,resource)&&!currencyAccepted(e,d.get('state'),location,resource))throw preconditionFailure('此地不接受这种钱付款');
 if(resource!==REFERENCE&&!currencyRow(e,resource)&&!e.byId.get(resource))throw preconditionFailure('不是可付款的资源');
 const value=resourceValue(d,e,{resource,location});
 return {resource,item:resourceItem(e,resource),amount:divide(copper,value,true),exactRate:encode(value),copper};
}
// Hand over `plan.amount` of the planned resource: reference coins move between purses/treasuries,
// every other resource is its physical item (a coin item, a bag of wool...). Nothing is made up.
export function payInKind(d,e,{payer,payee,plan,eventId,writer='contracts'}){
 if(plan.resource===REFERENCE){
  const s=d.get('state'),from=partyAccount(e,s,payer),to=partyAccount(e,s,payee);
  if((d.get('ledger','accounts',from)??0)<plan.amount)throw preconditionFailure('现钱不足');
  moveCoins(d,{from,to,amount:plan.amount,writer,eventId});mirrorPartyCoins(d,e,payer,-plan.amount,eventId,writer);mirrorPartyCoins(d,e,payee,plan.amount,eventId,writer);
 }else{
  if(e.quantity(d,payer,plan.item)<plan.amount)throw preconditionFailure(`${e.byId.get(plan.item)?.name??plan.resource}不足：需要${plan.amount}`);
  if(isBank(e,d.get('state'),payee))bankTakeGoods(d,e,{payer,bank:payee,item:plan.item,amount:plan.amount,eventId,writer});
  else transferItems(d,e,payer,payee,plan.item,plan.amount,null,{eventId});
 }
 return {resource:plan.resource,amount:plan.amount,...(plan.resource===REFERENCE?{}:{name:resourceName(e,plan.resource)})};
}
// Contract terms freeze at signing: the claim is `amount` of `resource`, never re-expressed afterwards.
export function contractTerms(d,e,{location,copper}){
 const q=tenderQuote(d,e,{location,copper,side:'buy'});
 return q.unit!==REFERENCE&&q.amount!==null?{resource:q.unit,amount:q.amount}:null;
}
// Freeze every money field of one contract in the place's tender unit with the same contractTerms path.
// `coppers` = {field: reference-copper bill}; returns null in a coin_river place (or when a field has no unit price),
// otherwise {resource,resourceName,amounts:{field:integer units},referenceCopper:{field:bill}} - one resource for the whole contract.
export function contractFreeze(d,e,{location,coppers}){
 const amounts={};let resource=null;
 for(const [field,copper] of Object.entries(coppers)){
  const t=contractTerms(d,e,{location,copper});
  if(!t||(resource&&t.resource!==resource))return null;
  resource=t.resource;amounts[field]=t.amount;
 }
 return resource?{resource,resourceName:resourceName(e,resource),amounts,referenceCopper:{...coppers}}:null;
}
// Repayment in another resource converts at repayment time. The debtor hands over
// ceil(owed x value(claim) / value(pay)) whole units; the claim is cleared by exactly the owed
// quantity, and the sub-unit rounding stays with the creditor (coins are indivisible, no change is made).
export function repaymentPlan(d,e,{resource,quantity,payWith,location=d.get('state','location')}){
 if(!payWith||payWith===resource)return {resource:resource,item:resourceItem(e,resource),amount:quantity};
 const claim=resourceValue(d,e,{resource,location}),pay=resourceValue(d,e,{resource:payWith,location});
 if(currencyRow(e,payWith)&&payWith!==REFERENCE&&!currencyAccepted(e,d.get('state'),location,payWith))throw preconditionFailure('此地不接受这种钱还款');
 const copper=fraction(claim.numerator*BigInt(quantity),claim.denominator),n=copper.numerator*pay.denominator,den=copper.denominator*pay.numerator;
 if(den<=0n)throw preconditionFailure('还款币种当前没有可成交比价');
 return {resource:payWith,item:resourceItem(e,payWith),amount:Number((n+den-1n)/den)};
}
// Reference-copper value of a claim at today's rate (derived only; used for credit limits and comparison).
export function claimCopper(d,e,row,location=d.get('state','location')){
 if(!row.resource||row.resource===REFERENCE)return (row.amount??0)-(row.paid??0);
 const left=(row.amount??0)-(row.paid??0),v=resourceValue(d,e,{resource:row.resource,location});
 const n=v.numerator*BigInt(left);return Number((n+v.denominator-1n)/v.denominator);
}

// ---- 成交统计分币种 ----------------------------------------------------------------
// A market_trade row keeps totalCoins (the reference-copper bill, unchanged). When the deal settled
// in another resource it also records settled:{resource,amount}; rows without it settled in coin_river.
export function turnoverByResource(state,{place,since=-Infinity,until=Infinity}){
 const out={};
 for(const r of Object.values(state.records??{})){
  if(r.category!=='market_trade'||r.place!==place||!(r.minute>since&&r.minute<=until))continue;
  const key=r.settled?.resource??REFERENCE;out[key]=(out[key]??0)+(r.settled?.amount??r.totalCoins);
 }
 return out;
}
// Comparison only: every resource's turnover valued in reference copper at the rate of `location` now,
// as an exact fraction {numerator,denominator}.
export function turnoverReference(d,e,{place,location=d.get('state','location'),since,until}){
 const by=turnoverByResource(d.get('state'),{place,since,until});
 const sum=Object.entries(by).reduce((acc,[resource,amount])=>{
  const v=resourceValue(d,e,{resource,location}),part=fraction(v.numerator*BigInt(amount),v.denominator);
  return fraction(acc.numerator*part.denominator+part.numerator*acc.denominator,acc.denominator*part.denominator);
 },fraction(0n,1n));
 return encode(sum);
}
// ---- W8-B 钱庄收放实物 -------------------------------------------------------------
// A counting house keeps its coin items in its own vault (bank record goods + the vault stock account), not in anybody's bag.
// A loan frozen in a tender-unit resource is paid out of and repaid into that vault in kind.
const bankBase=(e,id)=>e.rules.economy?.credit?.banks?.find(b=>b.id===id);
export const isBank=(e,s,id)=>s.records?.[id]?.category==='bank'||Boolean(bankBase(e,id));
const bankRowOf=(d,e,id)=>structuredClone(d.get('state','records',id)??(base=>({category:'bank',id,name:base.name,location:base.location,coins:base.reserveCopper??0,goods:{...base.reserveCoins??{}},accounts:{}}))(bankBase(e,id)));
// payer's bag -> the bank's vault
export function bankTakeGoods(d,e,{payer,bank,item,amount,eventId=null,writer='contracts'}){
 const row=bankRowOf(d,e,bank);
 changeItems(d,e,payer,item,-amount,{books:{account:vaultGoods(e,bank,item),writer,eventId}});
 row.goods[item]=(row.goods[item]??0)+amount;holdingSet(d,e,['state','records',bank],row,writer,eventId);
}
// Whole `resource` units worth `copper` reference copper at `location` now; up = the creditor's side rounds up, otherwise down.
export function copperToUnits(d,e,{resource,copper,location=d.get('state','location'),up=true}){
 return divide(copper,resourceValue(d,e,{resource,location}),up);
}
export const resourceName=(e,resource)=>e.byId.get(resourceItem(e,resource))?.name??resource;
