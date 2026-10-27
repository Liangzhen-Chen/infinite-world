// Currency is a commodity projection. Only transfers/activity and issuance
// are facts; quotes, confidence and purchasing power are never stored.
import {registerTransferObserver,parseAccount,isSource,isSink,accountKey,declareLedgerWriter,transfer} from './ledger.mjs';
import {marketQuote,purchasingPower} from './market.mjs';
import {placeSettlement} from './entity-view.mjs';
import {settlementLocation} from './obligation-presence.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {explainDerived} from './derived.mjs';
import {preconditionFailure} from './precondition.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeItems} from './items.mjs';
import {itemResource,vaultGoods} from './stock.mjs';
import {purse,vault,moveCoins} from './money.mjs';
import economyBalance from '../world/rules/tables/balance/economy.json' with {type:'json'};
import {decimalFraction,fraction} from './obligation-calendar.mjs';
import {bankLiabilities} from './finance-liabilities.mjs';
import {turnoverByResource} from './tender.mjs';

declareHoldingWriter('currency',{kinds:[]});declareLedgerWriter('currency');
const DAY=1440,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const F=decimalFraction,mul=(a,b)=>fraction(a.numerator*b.numerator,a.denominator*b.denominator),div=(a,b)=>fraction(a.numerator*b.denominator,a.denominator*b.numerator);
const plus=(a,b)=>fraction(a.numerator*b.denominator+b.numerator*a.denominator,a.denominator*b.denominator);
const minus=(a,b)=>fraction(a.numerator*b.denominator-b.numerator*a.denominator,a.denominator*b.denominator);
const compare=(a,b)=>a.numerator*b.denominator-b.numerator*a.denominator;
const bounded=(a,lo,hi)=>compare(a,lo)<0n?lo:compare(a,hi)>0n?hi:a;
const number=a=>Number(a.numerator)/Number(a.denominator),encode=a=>({numerator:String(a.numerator),denominator:String(a.denominator)}),decode=a=>fraction(BigInt(a.numerator),BigInt(a.denominator));
const ceil=a=>Number((a.numerator+a.denominator-1n)/a.denominator),floor=a=>Number(a.numerator/a.denominator);
const parameter=(e,id)=>(e.world.balance?.economy??economyBalance).params.find(p=>p.id===id).value;
const table=e=>e.world.currencyRules;
export const currencyRow=(e,id)=>table(e)?.currencies.find(c=>[c.resource,c.coinage,c.item].includes(id))??null;
const local=(e,s,id)=>{const location=settlementLocation(e,s,id);return location?(placeSettlement(e,s,location).value??location):null;};
const place=(e,s,location)=>placeSettlement(e,s,location).value??location;
registerTransferObserver('currency-activity',(d,{from,to,fromAccount:a,toAccount:b})=>{
 const e=d.engine;if(!e||!currencyRow(e,a.resource))return;
 const minute=d.get('state','minute');
 for(const [key,ac]of [[from,a],[to,b]])if(!isSource(ac.owner)&&!isSink(ac.owner))d.set(['ledger','currencyActivity',key],minute);
});
function balances(d,e,location,resource,{active=false}={}){
 const s=d.get('state'),p=place(e,s,location),ledger=d.get('ledger')??{},window=parameter(e,'money.activeWindow')*DAY;
 return Object.entries(ledger.accounts??{}).reduce((n,[key,amount])=>{
  const ac=parseAccount(key),at=ledger.currencyActivity?.[key];
  if(ac.resource!==resource||['cargo','freight','transit'].includes(ac.purpose)||local(e,s,ac.owner)!==p||active&&!(at!==undefined&&at>s.minute-window&&at<=s.minute))return n;
  return n+amount;
 },0);
}
export function currencyAccepted(e,s,location,resource,{bank=null}={}){
 const tender=legalCodeAt(e,location,s)?.recognition?.legalTender;
 const accepted=tender?.accepted;
 return resource===tender?.unit||Array.isArray(accepted)&&accepted.includes(resource)||!Array.isArray(accepted)&&Number(accepted?.[resource])>0||
  table(e)?.issuer.id===bank&&table(e).issuer.exchangeAccepted.includes(resource);
}
function intrinsic(d,e,location,c,seen=new Set()){
 if(seen.has(c.resource))throw preconditionFailure('货币挂钩形成循环');seen=new Set([...seen,c.resource]);
 const m=c.money;
 if(m.metal==='none'){
  if(m.backedBy){const backing=currencyRow(e,m.backedBy.coin);if(!backing)throw preconditionFailure('兑付币种尚未登记');return mul(intrinsic(d,e,location,backing,seen),F(m.backedBy.ratio));}
  const tender=legalCodeAt(e,location,d.get('state'))?.recognition?.legalTender;
  return F(tender?.unit===c.resource?1:Array.isArray(tender?.accepted)?1:Number(tender?.accepted?.[c.resource]??0));
 }
 const metal=table(e).metals[m.metal],item=e.byId.get(metal?.item);
 if(!item?.weight||!m.weight)throw preconditionFailure('铸币金属或实重尚未登记');
 const quote=marketQuote(d,e,{item:item.id,location,quantity:1});
 // Minted local metal is also available metal, including inactive hoards.
 const minted=table(e).currencies.filter(x=>x.money.metal===m.metal).reduce((n,x)=>plus(n,div(mul(F(balances(d,e,location,x.resource)),mul(F(x.money.weight),F(x.money.fineness))),F(item.weight))),F(0));
 const limits=e.rules.economy.priceFactorLimits.region,supply=plus(F(quote.supply),minted),denominator=compare(supply,F(1))>0n?supply:F(1);
 const scarcity=bounded(div(F(quote.demand),denominator),F(limits[0]),F(limits[1]));
 return div(mul(div(F(quote.listPrice),F(quote.explanation.scarcity)),mul(scarcity,mul(F(m.weight),F(m.fineness)))),F(item.weight));
}
export function issuedCurrency(e,s,resource){
 return s.records?.[`currency_issue:${resource}`]??{category:'currency_issue',resource,issued:0,redeemed:0};
}
export function currencyReserve(e,s,resource){
 const c=currencyRow(e,resource),m=c?.money;if(!m?.backedBy)return {outstanding:0,reserve:0,ratio:1,confidence:1,required:0};
 const issuance=issuedCurrency(e,s,resource),outstanding=issuance.issued-issuance.redeemed;
 const bank=s.records?.[m.issuer],base=e.rules.economy.credit.banks.find(b=>b.id===m.issuer);
 // Cash already owed to depositors or bill holders cannot also back notes.
 const reserve=Math.max(0,(bank?.coins??base?.reserveCopper??0)-bankLiabilities(s,m.issuer).total);
 const ratio=outstanding?reserve/(outstanding*m.backedBy.ratio):1;
 const minimum=table(e).issuer.minReserveRatio,requirement=mul(F(outstanding),mul(F(m.backedBy.ratio),F(minimum)));
 const confidence=outstanding?bounded(div(F(reserve),requirement),F(0),F(1)):F(1);
 return {outstanding,reserve,ratio,confidence:number(confidence),exactConfidence:encode(confidence),required:ceil(requirement)};
}
export function currencyValue(d,e,{currency,location=d.get('state','location'),bank=null,viewer=null},seen=new Set()){
 const c=currencyRow(e,currency),s=d.get('state');
 if(!c||!currencyAccepted(e,s,location,c.resource,{bank}))throw preconditionFailure('此地或柜台不接受这种钱，无法按通货报价');
 if(seen.has(c.resource))throw preconditionFailure('货币挂钩形成循环');seen=new Set([...seen,c.resource]);
 const base=intrinsic(d,e,location,c),reference=currencyRow(e,'coin_river'),referenceValue=intrinsic(d,e,location,reference);
 const window=parameter(e,'money.activeWindow')*DAY,p=place(e,s,location);
 const deals=Object.values(s.records??{}).filter(r=>r.category==='market_trade'&&r.place===p&&r.minute>s.minute-window&&r.minute<=s.minute);
 const turnoverCopper=deals.reduce((n,r)=>n+r.totalCoins,0),volume=base.numerator?div(mul(F(turnoverCopper),referenceValue),base):F(0);
 const active=balances(d,e,location,c.resource,{active:true}),floor=parameter(e,'money.kFloor');
 // Approved bootstrap: no fabricated history. Once actual goods trade exists,
 // the exact same volume/active-stock rule governs metal and credit money.
 const lower=mul(volume,F(floor)),denominator=compare(F(active),lower)>0n?F(active):lower;
 const abundance=!deals.length||!active?F(1):bounded(div(volume,denominator),F(0),div(F(1),F(floor)));
 const credit=explainDerived(e,d.document,'economy:coinCredit',c.item??c.resource,{base:1,holder:viewer});
 const reserve=currencyReserve(e,s,c.resource);
 let peg=base;
 if(c.money.backedBy)peg=mul(decode(currencyValue(d,e,{currency:c.money.backedBy.coin,location,bank,viewer},seen).exact),F(c.money.backedBy.ratio));
 const exact=mul(peg,mul(reserve.exactConfidence?decode(reserve.exactConfidence):F(1),mul(F(credit.value),abundance)));
 return {resource:c.resource,branch:c.money.metal==='none'?'credit':'metal',value:number(exact),exact:encode(exact),explanation:{intrinsic:number(base),peg:number(peg),credit,turnoverCopper,turnoverByResource:turnoverByResource(s,{place:p,since:s.minute-window}),volume:number(volume),active,abundance:number(abundance),reserve}};
}
export function exchangeRate(d,e,{from,to='coin_river',...frame}){
 const a=currencyValue(d,e,{currency:from,...frame}),b=currencyValue(d,e,{currency:to,...frame});
 if(!(a.value>0&&b.value>0))throw preconditionFailure('通货无法兑现，当前没有可成交汇率');
 const exact=div(decode(a.exact),decode(b.exact));return {rate:number(exact),exact:encode(exact),from:a,to:b};
}
export function currencyPurchasingPower(d,e,{currency,quantity=1,location=d.get('state','location')}){
 const money=currencyValue(d,e,{currency,location}),basket=purchasingPower(d,e,location);
 // The locked market projection supplies internal commodity values (15 §15.2),
 // not a second currency truth. Nominal money is valued against that basket.
 return {quantity,money,ppi:basket.ppi,realValue:basket.ppi?quantity*money.value/basket.ppi:0};
}
export function currencyTradePrice(d,e,{currency,quantity,location,spread=1,relation=1}){
 const pricing=exchangeRate(d,e,{from:currency,location}),unit=mul(decode(pricing.exact),mul(F(spread),F(relation))),exact=mul(unit,F(quantity));
 return {listPrice:number(unit),exactTotal:number(exact),totalCoins:floor(exact),pricing};
}
export function currencyExchange(d,e,{bank:b,row,item,quantity,buy,mode,eventId,loanable}){
 const c=currencyRow(e,item),location=d.get('state','location');
 if(!c)throw preconditionFailure('这不是登记的通货');
 const m=c.money;
 const issue=mode==='issue',redeem=mode==='redeem';
 if((issue||redeem)&&(!m.backedBy||m.issuer!==b.id||table(e).issuer.id!==b.id))throw preconditionFailure('须到已登记发行网点办理发行或兑付');
 if(issue&&!buy||redeem&&buy)throw preconditionFailure('发行须领取通货，兑付须交回通货');
 // D15 §15.3: backedBy is the issuer's promise, not a market quote.
 // Keep the market explanation even at zero confidence; a funded issuer
 // can redeem without a positive third-party exchange rate.
 const pricing=issue||redeem?{rate:m.backedBy.ratio,exact:encode(F(m.backedBy.ratio)),from:currencyValue(d,e,{currency:c.resource,location,bank:b.id})}:exchangeRate(d,e,{from:c.resource,location,bank:b.id});
 const coins=d.get('state','player','coins');
 if(buy){
  const cost=ceil(mul(F(quantity),mul(decode(pricing.exact),plus(F(1),F(b.exchangeFeeRate)))));if(coins<cost)throw preconditionFailure('现钱不足');
  if(issue){
   const required=ceil(mul(F(quantity),mul(F(m.backedBy.ratio),F(table(e).issuer.minReserveRatio))));
   if(required>loanable+cost)throw preconditionFailure('发行后的准备金低于章程约束');
   const resource=itemResource(e,item);declareLedgerWriter('currency',{sources:{'src:issue':{[resource]:table(e).issuer.issueDailyMaximum}},sinks:['sink:redeem']});
   transfer(d,{from:accountKey('src:issue',resource,b.id),to:vaultGoods(e,b.id,item),amount:quantity,writer:'currency',eventId});
   row.goods[item]=(row.goods[item]??0)+quantity;
   const r=issuedCurrency(e,d.get('state'),c.resource);holdingSet(d,e,['state','records',`currency_issue:${c.resource}`],{...r,issued:r.issued+quantity,issuer:b.id},'currency');
  }
  if((row.goods[item]??0)<quantity)throw preconditionFailure('柜台这种通货存量不足');
  moveCoins(d,{from:purse(e,'player'),to:vault(b.id),amount:cost,writer:'currency',eventId});row.coins+=cost;row.goods[item]-=quantity;d.set(['state','player','coins'],coins-cost);
  changeItems(d,e,'player',item,quantity,{books:{account:vaultGoods(e,b.id,item),writer:'currency',eventId}});
  return {item,quantity,paid:cost,issued:issue?quantity:0,pricing};
 }
 const gross=mul(F(quantity),redeem?F(m.backedBy.ratio):decode(pricing.exact)),paid=floor(mul(gross,minus(F(1),F(b.exchangeFeeRate))));
 if(e.quantity(d,'player',item)<quantity)throw preconditionFailure('没有足够的真实通货');if(row.coins<paid)throw preconditionFailure('发行网点现银不足，暂不能兑付');
 if(redeem){
  const r=issuedCurrency(e,d.get('state'),c.resource);if(quantity>r.issued-r.redeemed)throw preconditionFailure('交回数量超过真实发行余额');
  declareLedgerWriter('currency',{sinks:['sink:redeem']});
  changeItems(d,e,'player',item,-quantity,{books:{account:accountKey('sink:redeem',c.resource,b.id),writer:'currency',eventId}});
  holdingSet(d,e,['state','records',`currency_issue:${c.resource}`],{...r,redeemed:r.redeemed+quantity},'currency');
 }else{changeItems(d,e,'player',item,-quantity,{books:{account:vaultGoods(e,b.id,item),writer:'currency',eventId}});row.goods[item]=(row.goods[item]??0)+quantity;}
 row.coins-=paid;moveCoins(d,{from:vault(b.id),to:purse(e,'player'),amount:paid,writer:'currency',eventId});d.set(['state','player','coins'],coins+paid);
 return {item,quantity,received:paid,redeemed:redeem?quantity:0,pricing};
}
