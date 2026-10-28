import {preconditionFailure} from './precondition.mjs';
import {partyInProcedure} from './contract-state.mjs';
import {installmentState,accruedInterest,currentGrace,pawnDeadline,obligationRow,obligationRows,obligationView} from './obligation-state.mjs';
import {settleObligation,openObligation,amendObligation,adoptLegacyObligation,dueObligation,assertObligationAuthority} from './obligation-runtime.mjs';
import {obligationTransaction} from './transition.mjs';
import {settlementPresent} from './obligation-presence.mjs';
// F1: contract facts are persisted; prices, services and creditworthiness are views.
import {bankRow,openBank,bankById,counterpart,pledge,releasePledge,openLoan,repayCredit,loanSuccessionTerms,collateralValue} from './credit.mjs';
import {placeSettlement,settlementGovernment,groupRepresentative,personConstraint,personBusiness,personOccupation,personAge} from './entity-view.mjs';
import {adminLevel} from './promotion-view.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {standing} from './standing.mjs';
import {explainDerived} from './derived.mjs';
import {decimalFraction,interestAmount,addAccrual,fraction,obligationCalendar,accrualFraction} from './obligation-calendar.mjs';
import creditBalance from '../world/rules/tables/balance/credit.json' with {type:'json'};
import {currencyReserve} from './currency.mjs';
import {bankLiabilities} from './finance-liabilities.mjs';
import {registerCreditDefault,settleCreditCase} from './law.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {changeItems} from './items.mjs';
import {partyAccount,moveCoins,bookSide,BOOKED,vault,source,sink} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('finance-bank');

import {BANK_OPERATIONS} from './finance-operations.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {reportDepositLost} from './documents.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {canAct} from './action-capacity.mjs';
import {consent as nativeConsent,agreedLoan,requestContractConsent} from './action-consent.mjs';
import {authority} from './action-authority.mjs';
declareHoldingWriter('finance-bank',{kinds:['pledged','member_of','holds_office'],entities:['office']});
export {BANK_OPERATIONS};
export const financePath=id=>['state','records',id];
const DAY=1440,MONTH=30*DAY;
export const financeInt=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}必须在${min}到${max}之间`);return n;};
const cfg=e=>e.rules.economy.credit;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function financeBalance(d,e,id){
    const group=groupAccountView(e,d.get('state'),id);
    if(group)return group.coins;
    const org=d.get(...financePath(`organization:${id}`));
    if(org?.category==='organization')return org.treasury??0;
    const estate=d.get('state','records',`protocol_assets:${id}`);if(estate)return estate.coins??0;
    const actor=d.get(...e.actorPath(id));if(!actor)throw preconditionFailure('资金当事人不存在');return actor.coins??0;
}
// S1a: books = 账本对方账户（money.bookSide），成对的另一边已记账时传 BOOKED。
export function financeChange(d,e,id,delta,sourceEvent,books){
    if(!Number.isSafeInteger(delta))throw Error('资金变化无效');
    const balance=financeBalance(d,e,id)+delta;if(!Number.isSafeInteger(balance)||balance<0)throw preconditionFailure('当事人资金不足');
    if(groupAccountView(e,d.get('state'),id))return changeGroupCoins(d,e,id,delta,{kind:'金融契约',sourceEvent,minute:d.get('state','minute')},books);
    bookSide(d,partyAccount(e,d.get('state'),id),delta,books);
    const estate=d.get('state','records',`protocol_assets:${id}`);if(estate){holdingSet(d,e,['state','records',`protocol_assets:${id}`,'coins'],balance,'finance-bank');return balance;}
    const org=d.get(...financePath(`organization:${id}`));
    if(org?.category==='organization'){holdingSet(d,e,financePath(`organization:${id}`),{...org,treasury:balance,ledger:[...org.ledger??[],{coins:delta,sourceEvent}]},'finance-bank');return balance;}
    d.set([...e.actorPath(id),'coins'],balance);return balance;
}
export function financeTransfer(d,e,from,to,n,id,writer='finance-bank'){
    financeInt(n,1,1e9,'支付金额');const state=d.get('state');
    moveCoins(d,{from:partyAccount(e,state,from),to:partyAccount(e,state,to),amount:n,writer,eventId:id});
    financeChange(d,e,from,-n,id,BOOKED);financeChange(d,e,to,n,id,BOOKED);
}
// C/D call this with an actual payer; the shared runtime enforces arrival,
// authority, replay receipts and the inheritance cap in one transaction.
export function settleFinancialClaim(d,e,{claim,payer,actor,amount,actedAs,payWith},eventId){
    return obligationTransaction(d,()=>{
        const view=dueObligation(d.get('state'),claim);
        if(!view)throw preconditionFailure('金融债权不存在');
        adoptLegacyObligation(d,e,claim);
        return settleObligation(d,e,{id:claim,payer:payer??view.row.debtor,actor:actor??payer??view.row.debtor,
            amount:amount??view.owed,...(actedAs?{actedAs}:{}),...(payWith?{payWith}:{})},eventId);
    });
}
export function financeEvent(d,e,{id,actor,target,location,minute,value=0,verb='trade',tags=[]}){
    publishTransitionEvent(d,e,{id:`finance:${id}`,verb,actor,target,value,location,minute,witnesses:[],tags:['finance',...tags]});
}
export function derivedBankAt(e,state,location){
    const c=cfg(e);if(!c)return null;
    const fixed=c.banks?.find(b=>b.location===location);if(fixed)return fixed;
    if(!state||!c.derivedBanks)return null;
    const sid=placeSettlement(e,state,location).value,level=adminLevel(e,state,sid)?.level;
    if(!c.derivedBanks.levels.includes(level))return null;
    const site=bankSite(e,state,sid,location);if(!site)return null;
    return {id:`bank:${sid}`,name:`${e.byId.get(sid)?.name??sid}钱庄`,location,settlement:sid,keepers:[site.keeper],reserveCopper:0,
        reserveCoins:{},depositFeeCopper:c.derivedBanks.depositFeeCopper,exchangeFeeRate:c.derivedBanks.exchangeFeeRate,
        loanMaximumDays:c.loan.maximumDays,loanMaximumCopper:c.derivedBanks.loanMaximumCopper,collateralRatio:1,derived:true};
}
function bankSite(e,state,sid,location=null){
    // Resolve the requested physical counter. A staffed office must not hide a
    // merchant's existing counter elsewhere in the same settlement (or vice versa).
    const gov=settlementGovernment(e,state,sid);
    if(gov.head.value&&(location===null||gov.seat.value===location))return {location:gov.seat.value,keeper:gov.head.value};
    for(const id of Object.keys(state.npcs??{}).sort()){
        if(!/钱庄|商旅|商人|掌柜/.test(personOccupation(e,state,id).value??''))continue;
        const shop=personBusiness(e,state,id);if(shop?.open.value&&shop.settlement.value===sid&&(location===null||shop.location.value===location))return {location:shop.location.value,keeper:id};
    }
    return null;
}
export function derivedBankById(e,state,id){
    const fixed=cfg(e)?.banks?.find(b=>b.id===id);if(fixed)return fixed;
    if(!state||!id?.startsWith('bank:'))return null;
    const sid=id.slice(5),site=bankSite(e,state,sid,state.location)??bankSite(e,state,sid);
    return site?derivedBankAt(e,state,site.location):null;
}
const creditParameter=(e,id)=>(e.world.balance?.credit??creditBalance).params.find(row=>row.id===id).value;
// D15 §15.5: balances are facts; reserves, loanable cash and rates are views.
export function bankCredit(e,state,b,minute=state.minute){
    const row=state.records?.[b.id],cash=row?.coins??b.reserveCopper??0;
    const liabilities=bankLiabilities(state,b.id,minute).total;
    const reserveRatio=b.reserveRatio??creditParameter(e,'reserve.ratio');
    if(!Number.isFinite(reserveRatio)||reserveRatio<0||reserveRatio>1)throw preconditionFailure('准备金率须在零与一之间');
    // Integer cash minus an exact decimal reserve: .14*100 must protect
    // fourteen copper, not 14.000000000000002 and one extra spendable coin.
    const ratio=decimalFraction(reserveRatio),reserved=ratio.numerator*BigInt(liabilities);
    const issueReserve=(e.world.currencyRules?.currencies??[]).filter(c=>c.money.issuer===b.id&&c.money.backedBy).reduce((n,c)=>n+currencyReserve(e,state,c.resource).required,0);
    const reserve=Number(reserved)/Number(ratio.denominator)+issueReserve;
    const loanable=Math.max(0,cash-Number((reserved+ratio.denominator-1n)/ratio.denominator)-issueReserve);
    const demand=obligationRows(state).filter(o=>o.kind==='loan'&&o.creditor===b.id&&o.createdAt>minute-MONTH&&o.createdAt<=minute)
        .reduce((sum,o)=>sum+(o.principal??o.terms?.principal??o.amount),0);
    return {cash,liabilities,reserveRatio,reserve,loanable,demand};
}
export function interestRate(e,state,b,{borrower='player',principal=0,minute=state.minute,document={state}}={}){
    const credit=bankCredit(e,state,b,minute),terms=b.rateTerms??{},[low,high]=e.rules.economy.loanMonthlyInterest;
    const per=terms.per??'anchor',calendar=terms.calendar??'core:calendar_default';
    if(!['day','anchor'].includes(per))throw preconditionFailure('存贷利率须按日或月锚点计息');
    const basis=per==='day'?(obligationCalendar(calendar).rateBasis?.month??30):1;
    const minimum=terms.minRate??low/basis,maximum=terms.maxRate??high/basis;
    const base=terms.base??creditParameter(e,'rate.base')/basis;
    const pressure=1+(credit.demand+principal)/Math.max(1,credit.loanable);
    // A lender knows its own signed defaults, not another bank's private book.
    const history=obligationRows(state).filter(o=>o.kind==='loan'&&o.debtor===borrower&&o.creditor===b.id);
    const defaults=history.filter(o=>o.defaulted||o.status==='bad_debt').length;
    const regard=borrower===null?0:standing(e,state,b.keepers?.[0],borrower);
    const defaultRisk=clamp(1+defaults+Math.max(0,-regard)/100,1,creditParameter(e,'rate.mult.default').max);
    const correction=explainDerived(e,document,'lending:interestRate',b.id,{base:base*pressure*defaultRisk,holder:borrower});
    return {...credit,base,pressure,defaultRisk,correction,rate:clamp(correction.value,minimum,maximum),per,calendar};
}
export function regionalCredit(e,state,location){
    const place=placeSettlement(e,state,location).value;
    const banks=new Map((cfg(e)?.banks??[]).map(b=>[b.id,b]));
    for(const row of Object.values(state.records??{}))if(row.category==='bank'&&!banks.has(row.id)){const b=derivedBankById(e,state,row.id);if(b)banks.set(b.id,b);}
    return [...banks.values()].filter(b=>placeSettlement(e,state,b.location).value===place&&!blocked(e,state,b,state.minute))
        .reduce((sum,b)=>sum+bankCredit(e,state,b).loanable,0);
}
export function depositRate(e,state,b,minute=state.minute,document={state}){
    const spread=b.depositSpread??creditParameter(e,'deposit.spread');
    if(!Number.isFinite(spread)||spread<0||spread>=1)throw preconditionFailure('存息利差须大于等于零且小于一');
    return interestRate(e,state,b,{borrower:null,minute,document}).rate*spread;
}
function blocked(e,state,b,minute){
    if(!b||state.records?.[b.id]?.status==='倒闭')return true;
    const sid=placeSettlement(e,state,b.location).value;
    return Object.values(state.records??{}).some(r=>r.category==='war_disruption'&&r.since<=minute&&(r.until??Infinity)>minute&&r.locations?.some(l=>l===b.location||l===sid));
}
export function borrowerTerms(d,e,borrower,principal,days){
    const c=cfg(e),state=d.get('state'),n=state.npcs?.[borrower],base=state.created?.[borrower]??e.byId.get(borrower);
    const debts=Object.values(state.records??{}).filter(r=>r.category==='debt'&&r.debtor===borrower);
    const defaults=debts.filter(r=>r.defaulted).length,repaid=debts.filter(r=>r.status==='已还清').length;
    const regard=standing(e,state,borrower,'player'),intellect=n?.intelligence?.level??base?.intelligence?.level??1;
    if(regard<c.loan.refuseBelow||defaults>repaid+1)throw preconditionFailure('对方信用或立场不足以订立新借贷');
    const cash=financeBalance(d,e,borrower),{income,expense}=borrowerCashFlow(e,state,borrower);
    const credit=clamp(50+regard/2+repaid*10-defaults*30+intellect*2+(income-expense)/Math.max(1,principal)*10,0,100);
    const [lo,hi]=e.rules.economy.loanMonthlyInterest,rate=Math.round((hi-(hi-lo)*credit/100)*10000)/10000;
    financeInt(days,1,Math.max(360,c.loan.maximumDays),'借期天数');
    return {rate,interest:Math.ceil(principal*rate*days/30),credit,cash,income,expense};
}
export function borrowerCashFlow(e,state,id,minute=state.minute){
    const since=minute-MONTH,rows=Object.values(state.records??{});let income=0,expense=0;
    for(const r of rows){
        if(r.category==='office_salary'&&r.holder===id)income+=(r.payments??[]).filter(p=>p.minute>=since&&p.minute<=minute).reduce((n,p)=>n+p.copper,0);
        if(r.kind==='workshop'&&r.worker===id)income+=(r.shifts??[]).filter(p=>p.minute>=since&&p.minute<=minute).reduce((n,p)=>n+p.wage,0);
        if(r.kind==='asset_lease'&&r.tenant===id&&r.deadline>minute)expense+=r.monthlyRent;
        if(r.category==='finance_profit'&&r.issuer===id)for(const l of r.entries??[])if(l.minute>=since&&l.minute<=minute){income+=l.revenue;expense+=l.cost+l.tax;}
    }
    const account=groupAccountView(e,state,id);
    for(const l of account?.ledger??[])if(l.kind==='trade'&&l.minute>=since&&l.minute<=minute){if(l.coins>0)income+=l.coins;else expense-=l.coins;}
    return {income:Math.ceil(income/30),expense:Math.max(account?0:e.rules.economy.rentalCopperPerNight,Math.ceil(expense/30))};
}
// F049 (D15 §15.5, 附录 A.15.6): interest accrues over the actual balance
// intervals. The balance only changes by settlement events recorded on the
// claim, so each interval's principal is today's balance plus whatever was paid
// out after the interval began. Anchors always count from the signing minute
// (createdAt): a settlement date never becomes a new signing date, and the sum
// of consecutive intervals equals one interval over the same span.
const mulFraction=(a,b)=>fraction(a.numerator*b.numerator,a.denominator*b.denominator);
export function depositAccrual(state,claim,basis,signedRate,to){
    const from=claim.accruedTo??claim.createdAt,rateFraction=decimalFraction(signedRate);
    const paidOut=(claim.events??[]).filter(ev=>ev.transferred>0);
    const cuts=[...new Set(paidOut.map(ev=>ev.minute).filter(m=>m>from&&m<to))].sort((a,b)=>a-b);
    const owed=obligationView(state,claim,to).owed,points=[from,...cuts,to];
    const units=t=>accrualFraction({from:claim.createdAt,to:t,per:basis.per,calendar:basis.calendar,value:1});
    let total=fraction(0n),last=units(from);
    for(let i=1;i<points.length;i++){
        const here=units(points[i]),principal=owed+paidOut.filter(ev=>ev.minute>points[i-1]).reduce((n,ev)=>n+ev.transferred,0);
        total=addAccrual(total,mulFraction(mulFraction(decimalFraction(principal),rateFraction),addAccrual(here,last,-1n)));
        last=here;
    }
    return total;
}
// One claim, one settlement event: interest earned since the claim's cursor is
// capitalized into the original claim up to the bank's free cash; the rest is
// carried as arrears and the sub-copper remainder is carried exactly.
export function accrueDepositClaim(state,e,claim,at,{quote,rate,capacity,frozen}){
    const basis=claim.terms.rateTerms??{per:'anchor',calendar:'core:calendar_default'},month=obligationCalendar(basis.calendar).rateBasis?.month??30;
    const signedRate=quote.per===basis.per?rate:rate*(basis.per==='day'?1/month:month);
    // The cursor never moves backwards: nothing accrues for a span already settled.
    const cursor=claim.accruedTo??claim.createdAt;
    if(at<cursor||at===cursor&&!claim.interestArrears)return {earned:0,capitalized:0,arrears:claim.interestArrears??0,claim};
    const previous=claim.interestRemainder;
    const exact=addAccrual(depositAccrual(state,claim,basis,signedRate,at),previous?fraction(BigInt(previous.numerator),BigInt(previous.denominator)):fraction(0n));
    const earned=Number(exact.numerator/exact.denominator),remainder=fraction(exact.numerator%exact.denominator,exact.denominator);
    const owed=earned+(claim.interestArrears??0),capitalized=frozen?0:Math.min(owed,Math.max(0,capacity));
    return {earned,capitalized,arrears:owed-capitalized,claim:{...claim,amount:claim.amount+capitalized,interest:(claim.interest??0)+capitalized,accruedTo:at,
        interestRemainder:{numerator:String(remainder.numerator),denominator:String(remainder.denominator)},interestArrears:owed-capitalized}};
}
// Interest already earned is a real debt of the bank: at a withdrawal it is capitalized
// in full (never left as arrears on a claim that may close); paying it out is limited
// only by cash, and an unpaid remainder stays on the open claim.
// A withdrawal is a settlement event for the claims it draws on (A.15.6: the
// cursor advances and accrued interest joins the claim). Rate is the quote at
// that moment; it never rewrites earlier intervals.
export function settleDepositInterest(d,e,b,claimIds,at=d.get('state','minute')){
    // No claim to settle (e.g. a withdrawal before any deposit): nothing accrues, and the bank may not have a record yet.
    if(!claimIds.length)return 0;
    const state=d.get('state'),bank=state.records[b.id];
    const quote=interestRate(e,state,b,{borrower:null,minute:at,document:d.document}),rate=depositRate(e,state,b,at,d.document);
    const issueReserve=(e.world.currencyRules?.currencies??[]).filter(c=>c.money.issuer===b.id&&c.money.backedBy).reduce((n,c)=>n+currencyReserve(e,state,c.resource).required,0);
    let liabilities=bankLiabilities(state,b.id,at).total;const accounts={...bank.accounts};let capitalizedTotal=0;
    for(const id of claimIds){
        const claim=obligationRow(d.get('state'),id),step=accrueDepositClaim(d.get('state'),e,claim,at,{quote,rate,capacity:Infinity,frozen:false});
        d.set(['state','obligations',id],step.claim);accounts[claim.creditor]=(accounts[claim.creditor]??0)+step.capitalized;liabilities+=step.capitalized;capitalizedTotal+=step.capitalized;
    }
    holdingSet(d,e,financePath(b.id),{...bank,accounts},'finance-bank');return capitalizedTotal;
}
function loanPayment(d,e,key,row,amount,minute,id){
    const canonical=obligationRow(d.get('state'),key);
    const migrated=canonical&&d.get('state','obligations',canonical.id);
    if(migrated)settleObligation(d,e,{id:key,amount},id);
    else financeTransfer(d,e,row.debtor,row.creditor??'player',amount,id);
    const paid=migrated?d.get(...financePath(key),'paid'):row.paid+amount,status=paid===row.amount?'已还清':row.status;
    holdingSet(d,e,financePath(key),{...(migrated?d.get(...financePath(key)):row),kind:row.kind,paid,status,payments:[...row.payments??[],{minute,amount,sourceEvent:id}]},'finance-bank');
    if(status==='已还清'){
        if(row.pledgeRecord)releasePledge(d,e,row.pledgeRecord,row.debtor);
        if(row.defaulted?.case&&!d.get(...financePath(row.defaulted.case),'compensationPaid'))settleCreditCase(d,e,row.defaulted.case,id);
    }else if(row.defaulted?.case){
        const claim=d.get(...financePath(row.defaulted.case));if(claim)holdingSet(d,e,financePath(row.defaulted.case),{...claim,value:row.amount-paid,...(claim.judgment?{judgment:{...claim.judgment,compensation:row.amount-paid}}:{})},'finance-bank');
    }
    financeEvent(d,e,{id,actor:row.debtor,target:'player',value:amount,location:row.location,minute,tags:['repay']});
}
// C's crime and guardianship paths must pass the real signer and property owner.
// This adapter never uses the player's presence or purse for an NPC pawn.
export function pawnForActor(d,e,{actor,owner=actor,representative=actor,actedAs,bank,keeper,item,quantity=1,coins,days=30,consent},eventId){
    return obligationTransaction(d,()=>{
        const state=d.get('state'),b=derivedBankById(e,state,bank),signer=actor==='player'?{...state.player,location:state.location}:state.npcs?.[actor];
        if(!b||blocked(e,state,b,state.minute))throw preconditionFailure('典当柜面不可用');
        if(representative!==actor||!signer||signer.location!==b.location||['死亡','昏迷','濒死','患病'].includes(signer.status)||/睡眠|睡觉|熟睡/.test(signer.activity??'')||signer.scheduleTravel||signer.cognitionTravel)throw preconditionFailure('典当签署人须实际在场且清醒');
        if(actor!=='player'&&(personAge(e,state,actor).value??0)<18)throw preconditionFailure('未成年人不能直接典当');
        if(personConstraint(e,state,actor))throw preconditionFailure('签署人正在依法拘留');
        if(consent!==true)throw preconditionFailure('典当须明确同意本次条款');
        assertObligationAuthority(e,state,{actor,debtor:owner,actedAs});
        const teller=state.npcs?.[keeper];
        if(!b.keepers.includes(keeper)||!teller||teller.location!==b.location||['死亡','昏迷','濒死'].includes(teller.status)||/睡眠|睡觉|熟睡/.test(teller.activity??'')||teller.scheduleTravel||teller.cognitionTravel||personConstraint(e,state,keeper))throw preconditionFailure('须由当前在场柜员经手');
        e.assertNpcObligationAction(d,[actor,keeper],{minutes:5});e.assertNpcAutonomyAction(state,[actor,keeper],{minutes:5});
        item=e.resolve(item,'item');quantity=financeInt(quantity,1,100000,'典当数量');
        const maximum=Math.floor(collateralValue(d,e,item,quantity,b.location,owner)*cfg(e).pawn.advanceRatio),principal=financeInt(coins??maximum,1,maximum,'典当金额');
        const loan=openLoan(d,e,{lender:keeper,bank:{...b,collateralRatio:1,loanMaximumCopper:Math.min(b.loanMaximumCopper,maximum)},keeper,principal,days,collateral:{item,quantity},eventId,kind:'pawn',debtor:owner,actor,actedAs});
        const row=d.get(...financePath(loan.debt));holdingSet(d,e,financePath(loan.debt),{...row,kind:'pawn',auctionAt:row.deadline+cfg(e).pawn.graceDays*DAY},'finance-bank');
        return {...loan,contract:loan.debt,owner,actor,bank:b.id};
    });
}
export function bankTrade(d,e,args,id,{remittanceFee}={}){
    const op=args.operation,now=d.get('state','minute'),location=d.get('state','location');
    if(op==='prepay'){
        const row=d.get(...financePath(args.debt));if(row?.kind!=='loan'||row.debtor!=='player'||row.defaulted||row.status==='已还清'||now>=row.deadline)throw preconditionFailure('借据不符合提前还款条件');
        counterpart(d,e,args.seller,{consent:args.consent});
        const interest=Math.min(row.interest,accruedInterest(row,now,{round:'ceil'}));
        const amount=Math.max(row.paid,row.principal+interest);
        holdingSet(d,e,financePath(args.debt),{...row,interest,amount,contractualAmount:amount,prepayment:{minute:now,waived:row.amount-amount,source:id}},'finance-bank');
        if(amount===row.paid){if(row.pledgeRecord)releasePledge(d,e,row.pledgeRecord,'player');holdingSet(d,e,financePath(args.debt),{...d.get(...financePath(args.debt)),status:'已还清'},'finance-bank');return {debt:args.debt,repaid:0};}
        return repayCredit(d,e,{seller:e.resolve(args.seller),debt:args.debt},id);
    }
    if(op==='extend'){
        const key=args.debt,row=d.get(...financePath(key));
        if(row?.kind!=='loan'||row.debtor!=='player'||row.status==='已还清'||row.defaulted)throw preconditionFailure('需要尚未违约的本人借据');
        const b=row.bank?bankById(e,row.bank,d.get('state')):null;
        const seller=e.resolve(args.seller);
        if(b?!b.keepers.includes(seller)||location!==b.location:seller!==row.creditor)throw preconditionFailure('须由原债主同意展期');
        const days=financeInt(args.days,1,cfg(e).loan.maximumDays,'展期天数'),principal=Math.max(0,row.principal-row.paid),basis=row.terms?.rateTerms??{},interest=interestAmount({principal,rate:row.monthlyInterest,from:now,to:now+days*DAY,per:basis.per,calendar:basis.calendar});
        const next={...row,deadline:Math.max(now,row.deadline)+days*DAY,interest:row.interest+interest,amount:row.amount+interest,contractualAmount:row.amount+interest,status:'待偿还',installments:1,installmentOverdueAt:null,
            amendments:[...row.amendments??[],{days,interest,minute:now}]};
        counterpart(d,e,seller,{consent:true});
        const changes={deadline:next.deadline,amount:next.amount,interest:next.interest,installments:1};
        const agreement=requestContractConsent(d,e,{from:seller,scope:'amend',subject:row.obligation??key,terms:changes,cost:{coins:interest},reward:interest,eventId:id,until:now+5});
        counterpart(d,e,seller,{consent:agreement.allowed});
        next.amendments.at(-1).consentEvent=agreement.source;
        if(row.obligation)amendObligation(d,e,{id:row.obligation,actor:'player',changes},`${id}:extend`);
        holdingSet(d,e,financePath(key),next,'finance-bank');return {debt:key,deadline:next.deadline,amount:next.amount,interest};
    }
    if(op==='lend'){
        const principal=financeInt(args.coins,1,1e7,'放贷本金'),days=args.days??30;
        const borrower=args.business?e.resolve(args.business):e.resolve(args.seller);
        const representative=args.business?groupRepresentative(e,d.get('state'),borrower,args.seller):borrower;
        if(!representative)throw preconditionFailure('组织没有可签约的现任代表');
        let agreement=agreedLoan({engine:e,document:d.document},representative,'player',{principal,days,interest:args.interest,subject:borrower===representative?'player':borrower,until:now+5});
        if(args.interest!==undefined&&!agreement)counterpart(d,e,representative,{consent:false});
        const quoted=borrowerTerms(d,e,borrower,principal,days);
        if(!agreement&&borrower===representative){
            counterpart(d,e,representative,{consent:true});
            const terms={principal,days,interest:quoted.interest};
            const permission=requestContractConsent(d,e,{from:borrower,scope:'loan',purpose:'player',subject:'player',terms,cost:{coins:terms.interest,minutes:5},reward:principal,eventId:id,until:now+5});
            if(permission.allowed)agreement={terms,permission};
        }
        counterpart(d,e,representative,{consent:agreement?.permission.allowed});
        const terms=agreement?{...quoted,interest:agreement.terms.interest,rate:agreement.terms.interest*30/(principal*days)}:quoted,key=`debt_lend_${id}`;
        const pledgeKey=args.item?`pledge:${key}`:null;
        if(pledgeKey)pledge(d,e,pledgeKey,e.resolve(args.item,'item'),financeInt(args.quantity??1,1,100000,'抵押数量'),borrower);
        financeTransfer(d,e,'player',borrower,principal,id);
        const count=financeInt(args.item?1:args.quantity??1,1,days,'分期期数');
        const succession=loanSuccessionTerms(d,e);
        holdingSet(d,e,financePath(key),{category:'debt',kind:'player_loan',debtor:borrower,representative,creditor:'player',principal,interest:terms.interest,monthlyInterest:terms.rate,
            amount:principal+terms.interest,paid:0,status:'待偿还',installments:count,nextInstallment:1,createdAt:now,deadline:now+days*DAY,nextPayment:now+Math.ceil(days*DAY/count),
            pledgeRecord:pledgeKey,location,source:id,...(succession?{terms:succession}:{}),
            signedTerms:{principal,days,rate:terms.rate,installments:count,...(agreement?{consent:agreement.permission.source}:{}),...succession}},'finance-bank');
        if(borrower===representative){
            openObligation(d,e,{...d.get(...financePath(key)),id:`finance:${key}`,legacyRecord:key,actor:borrower},`${id}:claim`);
            holdingSet(d,e,financePath(key),{...d.get(...financePath(key)),kind:'player_loan'},'finance-bank');
        }
        return {debt:key,borrower,principal,interest:terms.interest,monthlyInterest:terms.rate};
    }
    if(op==='collect'){
        const key=args.debt,row=d.get(...financePath(key)),canonical=obligationRow(d.get('state'),key);
        if(canonical?.kind==='loan'&&!['rent','dividend'].includes(row?.kind)&&canonical.creditor==='player'&&!obligationView(d.get('state'),canonical).closed){
            const view=obligationView(d.get('state'),canonical),amount=financeInt(args.coins??view.owed,1,view.owed,'追收金额');
            const agreement=nativeConsent({engine:e,document:d.document},canonical.debtor,'player','repay',{purpose:canonical.id,subject:canonical.id,terms:{amount},until:now,onRefusal:'abort'});
            // Settlement is instantaneous. Validate the real present signer,
            // rather than a five-minute service reservation that is not used.
            counterpart(d,e,canonical.debtor,{consent:agreement.allowed,minutes:0});
            const result=settleObligation(d,e,{id:canonical.id,payer:canonical.debtor,actor:'player',amount},id,{authorize:request=>authority({engine:e,document:d.document},request.actor,'obligation.settle',request.party,{effect:{id:canonical.id,amount}})});
            return {debt:key,repaid:amount,settlement:result};
        }
        if(row?.creditor!=='player'||row.status==='已还清'||!['player_loan','rent','dividend'].includes(row.kind))throw preconditionFailure('没有本人可追收的未清欠款');
        const representative=row.representative??row.debtor;counterpart(d,e,representative,{consent:args.consent});
        const amount=financeInt(args.coins??row.amount-row.paid,1,row.amount-row.paid,'追收金额');
        loanPayment(d,e,key,row,amount,now,id);return {debt:key,repaid:amount};
    }
    const {b,row,keeper}=openBank(d,e,args.seller);
    if(op==='bank_inspect'){
        // The balance shown is what a withdrawal now settles against: interest earned
        // since each claim's cursor is projected here (read only, nothing written).
        const state=d.get('state'),quote=interestRate(e,state,b,{borrower:null,minute:now,document:d.document}),rate=depositRate(e,state,b,now,d.document);
        const projected=new Map(obligationRows(state).filter(o=>o.kind==='deposit'&&o.debtor===b.id&&o.creditor==='player').map(o=>{
            const step=accrueDepositClaim(state,e,o,now,{quote,rate,capacity:Infinity,frozen:false});
            return [o.id,{row:o,owed:obligationView({...state,obligations:{...state.obligations,[o.id]:step.claim}},step.claim,now).owed,accrued:step.capitalized}];
        }));
        const accrued=[...projected.values()].reduce((n,v)=>n+v.accrued,0);
        return {bank:b.id,balance:(row.accounts.player??0)+accrued,accruedInterest:accrued,depositInterest:{rate:depositRate(e,d.get('state'),b,now,d.document),per:b.rateTerms?.per??'anchor',calendar:b.rateTerms?.calendar??'core:calendar_default'},reserve:row.coins,
        credit:interestRate(e,d.get('state'),b,{document:d.document}),
        deposits:[...projected.values()].map(({row:o,owed})=>({claim:o.id,principal:o.terms.principal,paid:o.paid,balance:owed,original:o.terms.requiresInstrument??null,sourceEvent:o.terms.sourceEvent,rateTerms:o.terms.rateTerms})),
        regionalLoanable:regionalCredit(e,d.get('state'),b.location),
        operations:[...BANK_OPERATIONS],note:'borrow的quantity为分期期数；repay用coins部分还款；withdraw可用debt指定存款债权，已签发存单须持有具名原件；remit的location为兑付柜；凭contract兑票或赎回。'};
    }
    if(blocked(e,d.get('state'),b,now))throw preconditionFailure('钱庄倒闭或战乱导致兑付受阻');
    if(op==='pawn'){
        const item=e.resolve(args.item,'item'),quantity=financeInt(args.quantity??1,1,100000,'典当数量'),value=collateralValue(d,e,item,quantity,b.location);
        const maximum=Math.floor(value*cfg(e).pawn.advanceRatio),amount=financeInt(args.coins??maximum,1,maximum,'典当金额');
        const loan=openLoan(d,e,{lender:keeper,bank:{...b,collateralRatio:1,loanMaximumCopper:Math.min(b.loanMaximumCopper,maximum)},keeper,principal:amount,days:args.days??30,collateral:{item,quantity},eventId:id,kind:'pawn'});
        const debt=d.get(...financePath(loan.debt));holdingSet(d,e,financePath(loan.debt),{...debt,kind:'pawn',auctionAt:debt.deadline+cfg(e).pawn.graceDays*DAY},'finance-bank');
        return {...loan,contract:loan.debt};
    }
    if(op==='redeem'){
        const debt=d.get(...financePath(args.contract));if(debt?.kind!=='pawn'||debt.bank!==b.id||debt.status==='流当'||pawnDeadline(debt,e,now,d.get('state'))<=now)throw preconditionFailure('当票不存在或已经流当');
        // The receipt names the pawnshop that took the money back, as every other counter operation names its bank.
        return {...repayCredit(d,e,{seller:keeper,debt:args.contract},id),bank:b.id};
    }
    if(op==='auction'){
        const debt=d.get(...financePath(args.contract));if(debt?.kind!=='pawn'||debt.bank!==b.id||debt.status!=='流当')throw preconditionFailure('当物尚不可拍卖');
        if(debt.auction||d.get(...financePath(debt.pledgeRecord),'status')!=='质押中')throw preconditionFailure('当物已经拍卖处置，不能再次出售或交付；余欠请按普通还款清偿');
        const p=d.get(...financePath(debt.pledgeRecord)),price=financeInt(args.coins,p.value,Math.max(p.value,1e9),'拍卖价');
        const buyer=counterpart(d,e,args.buyer,{consent:args.consent});if(financeBalance(d,e,buyer)<price)throw preconditionFailure('买方资金不足');
        const toBank=Math.min(price,debt.amount-debt.paid),surplus=Math.max(0,price-(debt.amount-debt.paid)),state=d.get('state');
        moveCoins(d,{from:partyAccount(e,state,buyer),to:vault(b.id),amount:toBank,writer:'finance-bank',eventId:id});
        moveCoins(d,{from:partyAccount(e,state,buyer),to:partyAccount(e,state,debt.debtor),amount:surplus,writer:'finance-bank',eventId:id});
        financeChange(d,e,buyer,-price,id,BOOKED);row.coins+=toBank;holdingSet(d,e,financePath(b.id),row,'finance-bank');
        if(surplus)financeChange(d,e,debt.debtor,surplus,id,BOOKED);
        releasePledge(d,e,debt.pledgeRecord,buyer);
        holdingSet(d,e,financePath(debt.pledgeRecord),{...d.get(...financePath(debt.pledgeRecord)),status:'已拍卖',holder:buyer},'finance-bank');
        const paid=Math.min(debt.amount,debt.paid+price);holdingSet(d,e,financePath(args.contract),{...debt,paid,status:paid===debt.amount?'已还清':'逾期',auction:{buyer,price,surplus,source:id}},'finance-bank');
        return {contract:args.contract,buyer,price,surplus};
    }
    if(op==='report_lost')return reportDepositLost(d,e,{bank:b,keeper,claim:args.debt,eventId:id});
    if(op==='remit'){
        const dest=derivedBankAt(e,d.get('state'),e.resolve(args.location));if(!dest||dest.id===b.id)throw preconditionFailure('汇票须指定异地的真实钱庄柜面');
        const beneficiary=args.buyer===undefined?null:e.resolve(args.buyer,'npc');
        if(beneficiary&&(!d.get('state','npcs',beneficiary)||isPhysicallyDead(e,d,beneficiary)))throw preconditionFailure('记名汇票须指定真实且有效的收款人');
        const amount=financeInt(args.coins,1,1e7,'汇票金额'),fee=remittanceFee??Math.max(1,Math.ceil(amount*cfg(e).remittance.feeRate));
        financeChange(d,e,'player',-amount-fee,id,{account:vault(b.id),writer:'finance-bank',eventId:id});row.coins+=amount+fee;holdingSet(d,e,financePath(b.id),row,'finance-bank');
        const key=`bill:${id}`,payable=beneficiary?`${key}:payable`:null;
        holdingSet(d,e,financePath(key),{category:'bank_bill',owner:'player',bank:b.id,destination:dest.id,amount,fee,status:'未兑付',createdAt:now,source:id,...(beneficiary?{beneficiary,payable}: {})},'finance-bank');
        if(payable){
            // A named instrument is the issuer's payment promise, not a remote
            // cash delivery. Native issuance supplies its claim evidence.
            holdingSet(d,e,financePath(payable),{id:payable,category:'debt',kind:'bill',debtor:b.id,creditor:beneficiary,amount,paid:0,status:'待偿还',createdAt:now,deadline:now,location:b.location,source:id,bill:key,billPayable:true},'finance-bank');
            adoptLegacyObligation(d,e,payable);
        }
        return {contract:key,bank:b.id,destination:dest.id,amount,fee,...(beneficiary?{beneficiary,payable}: {})};
    }
    if(op==='cash_bill'){
        const bill=d.get(...financePath(args.contract));if(bill?.category!=='bank_bill'||bill.owner!=='player'||bill.status!=='未兑付'||bill.destination!==b.id)throw preconditionFailure('汇票无效、已兑付或兑付地不符');
        const source=bankById(e,bill.bank,d.get('state'));if(blocked(e,d.get('state'),source,now))throw preconditionFailure('出票钱庄倒闭或战乱，汇票暂不能兑付');
        if(row.coins<bill.amount)throw preconditionFailure('兑付柜准备金不足，暂不能兑付');
        // The paying branch delivers its own cash. Interbank clearing remains
        // a claim on the issuer until an actual transfer reaches this branch.
        if(bill.payable){
            const claim=obligationRow(d.get('state'),bill.payable),payee=claim?.creditor;
            if(!claim||obligationView(d.get('state'),claim).owed!==bill.amount||!settlementPresent(e,d.get('state'),b.id,payee))throw preconditionFailure('记名汇票须由当前债权人在兑付柜面实际收款');
            settleObligation(d,e,{id:bill.payable,payer:b.id,actor:keeper,amount:bill.amount},`${id}:payee`,{authorize:({engine,state,actor,party,action})=>({
                allowed:action==='payment'&&party===b.id&&actor===keeper&&derivedBankById(engine,state,party)?.keepers.includes(actor)&&
                    settlementPresent(engine,state,actor,party)&&canAct({engine,document:d.document},actor,'transfer').allowed
            })});
            Object.assign(row,d.get(...financePath(b.id)));
        }else {row.coins-=bill.amount;financeChange(d,e,'player',bill.amount,id,{account:vault(b.id),writer:'finance-bank',eventId:id});}
        const clearing=`bill_clearing:${args.contract}`;
        holdingSet(d,e,financePath(clearing),{category:'debt',kind:'bill',debtor:source.id,creditor:b.id,amount:bill.amount,paid:0,status:'待偿还',createdAt:now,deadline:now,location:b.location,source:id,bill:args.contract},'finance-bank');
        adoptLegacyObligation(d,e,clearing);
        holdingSet(d,e,financePath(b.id),row,'finance-bank');holdingSet(d,e,financePath(args.contract),{...bill,status:'已兑付',paidAt:now,settledBy:id,clearing},'finance-bank');
        return {contract:args.contract,received:bill.amount};
    }
    throw preconditionFailure('未知钱庄操作');
}
export function advanceBankFinance(d,e,minute,recordIds){
    const c=cfg(e);if(!c)return;
    for(const [id,original]of (recordIds?recordIds.map(id=>[id,d.get('state','records',id)]).filter(([,row])=>row):Object.entries(d.get('state','records')??{}))){
        if(original.category==='debt'&&partyInProcedure(d.get('state'),original.debtor))continue;
        if(original.category==='debt'&&original.status==='坏账')continue;
        if(original.kind==='loan'&&original.debtor==='player'&&original.installments>1&&original.status!=='已还清'&&!original.defaulted){
            const plan=installmentState(original,minute),due=plan.nextDue+currentGrace(e,d.get('state'),original,minute).minutes;
            const status=minute>=due?'逾期':'待偿还',overdueAt=minute>=due?plan.nextDue:null;
            if(status!==original.status||overdueAt!==original.installmentOverdueAt)
                holdingSet(d,e,financePath(id),{...original,status,installmentOverdueAt:overdueAt},'finance-bank');
        }
        if(original.category==='bank'&&c.depositInterest){
            const b=bankById(e,id,d.get('state'));if(!b)continue;
            if(original.interestAt===undefined||original.interestAt+c.depositInterest.periodDays*DAY>minute)continue;
            const row=structuredClone(original),period=c.depositInterest.periodDays*DAY;
            for(let at=(row.interestAt??minute)+period;at<=minute;at+=period){
                const state=d.get('state');
                let liabilities=bankLiabilities(state,id,at).total;
                // Interest is settled only at the agreed interest event. Its
                // cursor moves here, never during a daily accumulation pass.
                const quote=interestRate(e,state,b,{borrower:null,minute:at,document:d.document}),rate=depositRate(e,state,b,at,d.document);
                let due=0,paid=0,arrears=0;
                const issueReserve=(e.world.currencyRules?.currencies??[]).filter(c=>c.money.issuer===id&&c.money.backedBy).reduce((n,c)=>n+currencyReserve(e,state,c.resource).required,0);
                for(const claim of obligationRows(state).filter(o=>o.kind==='deposit'&&o.debtor===id&&o.createdAt<=at&&obligationView(state,o,at).owed>0)){
                    const step=accrueDepositClaim(state,e,claim,at,{quote,rate,capacity:row.coins-liabilities-issueReserve,frozen:blocked(e,state,b,at)});
                    // The original claim and original paper remain the only debt.
                    d.set(['state','obligations',claim.id],step.claim);
                    row.accounts[claim.creditor]=(row.accounts[claim.creditor]??0)+step.capitalized;
                    due+=step.earned;paid+=step.capitalized;arrears+=step.arrears;liabilities+=step.capitalized;
                }
                row.interestArrears=arrears;row.interestAt=at;row.accruedTo=at;
                row.interestLedger=[...row.interestLedger??[],{minute:at,due,paid,rate}];
            }
            holdingSet(d,e,financePath(id),row,'finance-bank');
        }
        // F028: once the collateral is sold the pledge is final. A residual deficit
        // stays an ordinary overdue claim, repayable through the common repay path;
        // it must not flip back to "流当" and re-offer the same sold goods.
        if(original.kind==='pawn'&&original.status!=='已还清'&&!original.auction&&pawnDeadline(original,e,minute,d.get('state'))<=minute){
            if(original.status!=='流当')holdingSet(d,e,financePath(id),{...original,status:'流当'},'finance-bank');
            continue;
        }
        if(original.category==='debt'&&original.kind==='player_loan'&&original.status!=='已还清'){
            let row=original;
            const span=row.deadline-row.createdAt,count=row.installments??1;
            // Scheduled installments, not a daily retry cursor. Failed payments
            // retain the debt and can be collected at a later real encounter.
            for(let at=row.nextPayment;at<=minute&&at<=row.deadline&&row.status!=='已还清';){
                const actor=d.get('state','npcs',row.debtor),unable=actor&&(isPhysicallyDead(e,d,row.debtor)||['濒死','昏迷'].includes(actor.status)||personConstraint(e,d.get('state'),row.debtor,at));
                const cash=financeBalance(d,e,row.debtor),expense=borrowerCashFlow(e,d.get('state'),row.debtor,at).expense;
                const elapsed=Math.floor((at-row.createdAt)/((row.deadline-row.createdAt)/row.installments));
                const completed=Math.min(row.installments,Math.max(1,elapsed)),target=Math.ceil(row.amount*completed/row.installments);
                const representative=groupAccountView(e,d.get('state'),row.debtor)?groupRepresentative(e,d.get('state'),row.debtor):row.debtor;
                const present=settlementPresent(e,d.get('state'),representative,row.creditor??'player');
                const amount=unable||!present?0:Math.min(Math.max(0,cash-expense),Math.max(0,target-row.paid));
                if(amount){loanPayment(d,e,id,row,amount,at,`${id}:${at}`);row=d.get(...financePath(id));}
                const nextIndex=Math.min(count,Math.floor((at-row.createdAt)*count/span))+1;
                row={...row,nextPayment:nextIndex>count?row.deadline+currentGrace(e,d.get('state'),row,at,{fallbackMinutes:c.loan.defaultGraceMinutes??0}).minutes:row.createdAt+Math.ceil(span*nextIndex/count)};
                if(row.paid<row.amount&&at>=row.deadline+currentGrace(e,d.get('state'),row,at,{fallbackMinutes:c.loan.defaultGraceMinutes??0}).minutes&&!row.defaulted){
                    const p=row.pledgeRecord?releasePledge(d,e,row.pledgeRecord,'player'):null;
                    if(p)row={...row,paid:Math.min(row.amount,row.paid+p.value)};
                    const remaining=row.amount-row.paid,legalCase=remaining?registerCreditDefault(d,e,{debt:id,row,value:remaining,minute:at}):null;
                    row={...row,status:remaining?'逾期':'已还清',defaulted:{minute:at,remaining,case:legalCase}};
                }
                holdingSet(d,e,financePath(id),row,'finance-bank');
                at=nextIndex>count?Infinity:row.nextPayment;
            }
            row=d.get(...financePath(id));
            const due=row.deadline+currentGrace(e,d.get('state'),row,minute,{fallbackMinutes:c.loan.defaultGraceMinutes??0}).minutes;
            if(row.paid<row.amount&&minute>=due&&!row.defaulted){
                const p=row.pledgeRecord?releasePledge(d,e,row.pledgeRecord,row.creditor??'player'):null;
                if(p)row={...row,paid:Math.min(row.amount,row.paid+p.value)};
                const remaining=row.amount-row.paid,legalCase=remaining?registerCreditDefault(d,e,{debt:id,row,value:remaining,minute:due}):null;
                holdingSet(d,e,financePath(id),{...row,status:remaining?'逾期':'已还清',defaulted:{minute:due,remaining,case:legalCase}},'finance-bank');
            }
        }
    }
}
