// F1: contract facts are persisted; prices, services and creditworthiness are views.
import {bankRow,openBank,bankById,counterpart,pledge,releasePledge,openLoan,repayCredit} from './credit.mjs';
import {placeSettlement,settlementGovernment,groupRepresentative,personConstraint,personBusiness,personOccupation} from './entity-view.mjs';
import {adminLevel} from './promotion-view.mjs';
import {groupAccountView,changeGroupCoins} from './group-account.mjs';
import {standing} from './standing.mjs';
import {hazardPriceFactor} from './hazard-calendar.mjs';
import {registerCreditDefault,settleCreditCase} from './law.mjs';
import {publishTransitionEvent} from './world-events.mjs';
import {changeItems} from './items.mjs';

export const BANK_OPERATIONS=new Set(['bank_inspect','extend','prepay','lend','collect','pawn','redeem','auction','remit','cash_bill']);
export const financePath=id=>['state','records',id];
const DAY=1440,MONTH=30*DAY;
export const financeInt=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}必须在${min}到${max}之间`);return n;};
const cfg=e=>e.rules.economy.credit;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function financeBalance(d,e,id){
    const group=groupAccountView(e,d.get('state'),id);
    if(group)return group.coins;
    const org=d.get(...financePath(`organization:${id}`));
    if(org?.category==='organization')return org.treasury??0;
    const actor=d.get(...e.actorPath(id));if(!actor)throw Error('资金当事人不存在');return actor.coins??0;
}
export function financeChange(d,e,id,delta,sourceEvent){
    if(!Number.isSafeInteger(delta))throw Error('资金变化无效');
    const balance=financeBalance(d,e,id)+delta;if(!Number.isSafeInteger(balance)||balance<0)throw Error('当事人资金不足');
    if(groupAccountView(e,d.get('state'),id))return changeGroupCoins(d,e,id,delta,{kind:'金融契约',sourceEvent,minute:d.get('state','minute')});
    const org=d.get(...financePath(`organization:${id}`));
    if(org?.category==='organization'){d.set(financePath(`organization:${id}`),{...org,treasury:balance,ledger:[...org.ledger??[],{coins:delta,sourceEvent}]});return balance;}
    d.set([...e.actorPath(id),'coins'],balance);return balance;
}
export function financeTransfer(d,e,from,to,n,id){financeInt(n,1,1e9,'支付金额');financeChange(d,e,from,-n,id);financeChange(d,e,to,n,id);}
export function financeEvent(d,e,{id,actor,target,location,minute,value=0,verb='trade',tags=[]}){
    publishTransitionEvent(d,e,{id:`finance:${id}`,verb,actor,target,value,location,minute,witnesses:[],tags:['finance',...tags]});
}
export function derivedBankAt(e,state,location){
    const c=cfg(e);if(!c)return null;
    const fixed=c.banks?.find(b=>b.location===location);if(fixed)return fixed;
    if(!state||!c.derivedBanks)return null;
    const sid=placeSettlement(e,state,location).value,level=adminLevel(e,state,sid)?.level;
    if(!c.derivedBanks.levels.includes(level))return null;
    const site=bankSite(e,state,sid);if(!site||site.location!==location)return null;
    return {id:`bank:${sid}`,name:`${e.byId.get(sid)?.name??sid}钱庄`,location,settlement:sid,keepers:[site.keeper],reserveCopper:0,
        reserveCoins:{},depositFeeCopper:c.derivedBanks.depositFeeCopper,exchangeFeeRate:c.derivedBanks.exchangeFeeRate,
        loanMonthlyInterest:e.rules.economy.loanMonthlyInterest[0],loanMaximumDays:c.loan.maximumDays,loanMaximumCopper:c.derivedBanks.loanMaximumCopper,collateralRatio:1,derived:true};
}
function bankSite(e,state,sid){
    const gov=settlementGovernment(e,state,sid);if(gov.head.value)return {location:gov.seat.value,keeper:gov.head.value};
    // Vacant governments do not turn document clerks into officials. Town
    // merchants with current trading services can run an unfunded private desk.
    for(const id of Object.keys(state.npcs??{}).sort()){
        if(!/钱庄|商旅|商人|掌柜/.test(personOccupation(e,state,id).value??''))continue;
        const shop=personBusiness(e,state,id);if(shop?.open.value&&shop.settlement.value===sid)return {location:shop.location.value,keeper:id};
    }
    return null;
}
export function derivedBankById(e,state,id){
    const fixed=cfg(e)?.banks?.find(b=>b.id===id);if(fixed)return fixed;
    if(!state||!id?.startsWith('bank:'))return null;
    const sid=id.slice(5),site=bankSite(e,state,sid);
    return site?derivedBankAt(e,state,site.location):null;
}
export function depositRate(e,state,b,minute=state.minute){
    const r=cfg(e).depositInterest;if(!r)return 0;
    const item=e.rules.settlementTrade?.item??'item_oats',sid=placeSettlement(e,state,b.location).value;
    const quoted=state.quotes?.[`region:${Math.floor(minute/DAY)}:${sid}:${item}`],base=e.byId.get(item)?.basePrice??1;
    const factor=quoted===undefined?hazardPriceFactor(e,state,item,b.location,minute):quoted/base;
    const seasonal=r.seasonal[Math.floor(minute/(90*DAY))%4]??1;
    return clamp((b.depositMonthlyInterestOverride??r.monthlyRate*(1+(b.exchangeFeeRate??0)))*factor*seasonal,r.minimum,r.maximum);
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
    if(regard<c.loan.refuseBelow||defaults>repaid+1)throw Error('对方信用或立场不足以订立新借贷');
    const cash=financeBalance(d,e,borrower),{income,expense}=borrowerCashFlow(e,state,borrower);
    const credit=clamp(50+regard/2+repaid*10-defaults*30+intellect*2+(income-expense)/Math.max(1,principal)*10,0,100);
    const [lo,hi]=e.rules.economy.loanMonthlyInterest,rate=Math.round((hi-(hi-lo)*credit/100)*10000)/10000;
    financeInt(days,1,c.loan.maximumDays,'借期天数');
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
function loanPayment(d,e,key,row,amount,minute,id){
    financeTransfer(d,e,row.debtor,'player',amount,id);
    const paid=row.paid+amount,status=paid===row.amount?'已还清':row.status;
    d.set(financePath(key),{...row,paid,status,payments:[...row.payments??[],{minute,amount,sourceEvent:id}]});
    if(status==='已还清'){
        if(row.pledgeRecord)releasePledge(d,e,row.pledgeRecord,row.debtor);
        if(row.defaulted?.case)settleCreditCase(d,e,row.defaulted.case,id);
    }else if(row.defaulted?.case){
        const claim=d.get(...financePath(row.defaulted.case));if(claim)d.set(financePath(row.defaulted.case),{...claim,value:row.amount-paid,...(claim.judgment?{judgment:{...claim.judgment,compensation:row.amount-paid}}:{})});
    }
    financeEvent(d,e,{id,actor:row.debtor,target:'player',value:amount,location:row.location,minute,tags:['repay']});
}
export function bankTrade(d,e,args,id){
    const op=args.operation,now=d.get('state','minute'),location=d.get('state','location');
    if(op==='prepay'){
        const row=d.get(...financePath(args.debt));if(row?.kind!=='loan'||row.debtor!=='player'||row.defaulted||row.status==='已还清'||now>=row.deadline)throw Error('借据不符合提前还款条件');
        counterpart(d,e,args.seller,{consent:args.consent});
        const interest=Math.min(row.interest,Math.ceil(row.principal*row.monthlyInterest*Math.max(0,now-row.createdAt)/MONTH));
        const amount=Math.max(row.paid,row.principal+interest);
        d.set(financePath(args.debt),{...row,interest,amount,prepayment:{minute:now,waived:row.amount-amount,source:id}});
        if(amount===row.paid){if(row.pledgeRecord)releasePledge(d,e,row.pledgeRecord,'player');d.set(financePath(args.debt),{...d.get(...financePath(args.debt)),status:'已还清'});return {debt:args.debt,repaid:0};}
        return repayCredit(d,e,{seller:e.resolve(args.seller),debt:args.debt},id);
    }
    if(op==='extend'){
        const key=args.debt,row=d.get(...financePath(key));
        if(row?.kind!=='loan'||row.debtor!=='player'||row.status==='已还清'||row.defaulted)throw Error('需要尚未违约的本人借据');
        const b=row.bank?bankById(e,row.bank,d.get('state')):null;
        const seller=counterpart(d,e,args.seller,{consent:args.consent});
        if(b?!b.keepers.includes(seller)||location!==b.location:seller!==row.creditor)throw Error('须由原债主同意展期');
        const days=financeInt(args.days,1,cfg(e).loan.maximumDays,'展期天数'),principal=Math.max(0,row.principal-row.paid),interest=Math.ceil(principal*row.monthlyInterest*days/30);
        const next={...row,deadline:Math.max(now,row.deadline)+days*DAY,interest:row.interest+interest,amount:row.amount+interest,status:'待偿还',installments:1,installmentOverdueAt:null,
            amendments:[...row.amendments??[],{days,interest,minute:now,consentEvent:id}]};
        d.set(financePath(key),next);return {debt:key,deadline:next.deadline,amount:next.amount,interest};
    }
    if(op==='lend'){
        const principal=financeInt(args.coins,1,1e7,'放贷本金'),days=args.days??30;
        const borrower=args.business?e.resolve(args.business):e.resolve(args.seller);
        const representative=args.business?groupRepresentative(e,d.get('state'),borrower,args.seller):borrower;
        if(!representative)throw Error('组织没有可签约的现任代表');
        counterpart(d,e,representative,{consent:args.consent});
        const terms=borrowerTerms(d,e,borrower,principal,days),key=`debt_lend_${id}`;
        const pledgeKey=args.item?`pledge:${key}`:null;
        if(pledgeKey)pledge(d,e,pledgeKey,e.resolve(args.item,'item'),financeInt(args.quantity??1,1,100000,'抵押数量'),borrower);
        financeTransfer(d,e,'player',borrower,principal,id);
        const count=financeInt(args.item?1:args.quantity??1,1,days,'分期期数');
        d.set(financePath(key),{category:'debt',kind:'player_loan',debtor:borrower,representative,creditor:'player',principal,interest:terms.interest,monthlyInterest:terms.rate,
            amount:principal+terms.interest,paid:0,status:'待偿还',installments:count,nextInstallment:1,createdAt:now,deadline:now+days*DAY,nextPayment:now+Math.ceil(days*DAY/count),
            pledgeRecord:pledgeKey,location,source:id,signedTerms:{principal,days,rate:terms.rate,installments:count}});
        return {debt:key,borrower,principal,interest:terms.interest,monthlyInterest:terms.rate};
    }
    if(op==='collect'){
        const key=args.debt,row=d.get(...financePath(key));if(row?.creditor!=='player'||row.status==='已还清'||!['player_loan','rent'].includes(row.kind))throw Error('没有本人可追收的未清欠款');
        const representative=row.representative??row.debtor;counterpart(d,e,representative,{consent:args.consent});
        const amount=financeInt(args.coins??row.amount-row.paid,1,row.amount-row.paid,'追收金额');
        loanPayment(d,e,key,row,amount,now,id);return {debt:key,repaid:amount};
    }
    const {b,row,keeper}=openBank(d,e,args.seller);
    if(op==='bank_inspect')return {bank:b.id,balance:row.accounts.player??0,depositMonthlyInterest:depositRate(e,d.get('state'),b),reserve:row.coins,
        operations:[...BANK_OPERATIONS],note:'borrow的quantity为分期期数；repay用coins部分还款；remit的location为兑付柜；凭contract兑票或赎回。'};
    if(blocked(e,d.get('state'),b,now))throw Error('钱庄倒闭或战乱导致兑付受阻');
    if(op==='pawn'){
        const item=e.resolve(args.item,'item'),quantity=financeInt(args.quantity??1,1,100000,'典当数量'),value=(e.byId.get(item).basePrice??0)*quantity;
        const maximum=Math.floor(value*cfg(e).pawn.advanceRatio),amount=financeInt(args.coins??maximum,1,maximum,'典当金额');
        const loan=openLoan(d,e,{lender:keeper,bank:{...b,collateralRatio:1,loanMaximumCopper:Math.min(b.loanMaximumCopper,maximum)},keeper,principal:amount,days:args.days??30,collateral:{item,quantity},eventId:id});
        const debt=d.get(...financePath(loan.debt));d.set(financePath(loan.debt),{...debt,kind:'pawn',auctionAt:debt.deadline+cfg(e).pawn.graceDays*DAY});
        return {...loan,contract:loan.debt};
    }
    if(op==='redeem'){
        const debt=d.get(...financePath(args.contract));if(debt?.kind!=='pawn'||debt.bank!==b.id||debt.status==='流当'||debt.auctionAt<=now)throw Error('当票不存在或已经流当');
        return repayCredit(d,e,{seller:keeper,debt:args.contract},id);
    }
    if(op==='auction'){
        const debt=d.get(...financePath(args.contract));if(debt?.kind!=='pawn'||debt.bank!==b.id||debt.status!=='流当')throw Error('当物尚不可拍卖');
        const p=d.get(...financePath(debt.pledgeRecord)),price=financeInt(args.coins,p.value,Math.max(p.value,1e9),'拍卖价');
        const buyer=counterpart(d,e,args.buyer,{consent:args.consent});if(financeBalance(d,e,buyer)<price)throw Error('买方资金不足');
        financeChange(d,e,buyer,-price,id);row.coins+=Math.min(price,debt.amount-debt.paid);d.set(financePath(b.id),row);
        const surplus=Math.max(0,price-(debt.amount-debt.paid));if(surplus)financeChange(d,e,'player',surplus,id);
        releasePledge(d,e,debt.pledgeRecord,buyer);
        d.set(financePath(debt.pledgeRecord),{...d.get(...financePath(debt.pledgeRecord)),status:'已拍卖',holder:buyer});
        const paid=Math.min(debt.amount,debt.paid+price);d.set(financePath(args.contract),{...debt,paid,status:paid===debt.amount?'已还清':'逾期',auction:{buyer,price,surplus,source:id}});
        return {contract:args.contract,buyer,price,surplus};
    }
    if(op==='remit'){
        const dest=derivedBankAt(e,d.get('state'),e.resolve(args.location));if(!dest||dest.id===b.id)throw Error('汇票须指定异地的真实钱庄柜面');
        const amount=financeInt(args.coins,1,1e7,'汇票金额'),fee=Math.max(1,Math.ceil(amount*cfg(e).remittance.feeRate));
        financeChange(d,e,'player',-amount-fee,id);row.coins+=amount+fee;d.set(financePath(b.id),row);
        const key=`bill:${id}`;d.set(financePath(key),{category:'bank_bill',owner:'player',bank:b.id,destination:dest.id,amount,fee,status:'未兑付',createdAt:now,source:id});
        return {contract:key,bank:b.id,destination:dest.id,amount,fee};
    }
    if(op==='cash_bill'){
        const bill=d.get(...financePath(args.contract));if(bill?.category!=='bank_bill'||bill.owner!=='player'||bill.status!=='未兑付'||bill.destination!==b.id)throw Error('汇票无效、已兑付或兑付地不符');
        const source=bankById(e,bill.bank,d.get('state'));if(blocked(e,d.get('state'),source,now))throw Error('出票钱庄倒闭或战乱，汇票暂不能兑付');
        const origin=bankRow(d,source);if(row.coins<bill.amount||origin.coins<bill.amount)throw Error('两地准备金不足，暂不能兑付');
        // Destination pays cash, then receives the same reserve from the issuer.
        row.coins-=bill.amount;financeChange(d,e,'player',bill.amount,id);origin.coins-=bill.amount;row.coins+=bill.amount;
        d.set(financePath(source.id),origin);d.set(financePath(b.id),row);d.set(financePath(args.contract),{...bill,status:'已兑付',paidAt:now,settledBy:id});
        return {contract:args.contract,received:bill.amount};
    }
    throw Error('未知钱庄操作');
}
export function advanceBankFinance(d,e,minute){
    const c=cfg(e);if(!c)return;
    for(const [id,original]of Object.entries(d.get('state','records')??{})){
        if(original.kind==='loan'&&original.debtor==='player'&&original.installments>1&&original.status!=='已还清'&&!original.defaulted){
            const span=(original.deadline-original.createdAt)/original.installments,paidCount=Math.min(original.installments,Math.floor(original.paid*original.installments/original.amount));
            const due=original.createdAt+Math.ceil(span*(paidCount+1));
            d.set(financePath(id),{...original,status:minute>=due?'逾期':'待偿还',installmentOverdueAt:minute>=due?due:null});
        }
        if(original.category==='bank'&&c.depositInterest){
            const b=bankById(e,id,d.get('state'));if(!b)continue;
            const row=structuredClone(original),period=c.depositInterest.periodDays*DAY;
            for(let at=(row.interestAt??minute)+period;at<=minute;at+=period){
                const liabilities=Object.values(row.accounts).reduce((n,v)=>n+v,0)+Object.values(d.get('state','records')).filter(r=>r.category==='bank_bill'&&r.bank===id&&r.status==='未兑付').reduce((n,r)=>n+r.amount,0);
                const due=Math.floor((row.accounts.player??0)*depositRate(e,d.get('state'),b,at)*period/MONTH+(row.interestFraction??0));
                row.interestFraction=(row.accounts.player??0)*depositRate(e,d.get('state'),b,at)*period/MONTH+(row.interestFraction??0)-due;
                const owed=due+(row.interestArrears??0),paid=blocked(e,d.get('state'),b,at)?0:Math.min(owed,Math.max(0,row.coins-liabilities));
                row.interestArrears=owed-paid;
                row.accounts.player=(row.accounts.player??0)+paid;row.interestAt=at;
                row.interestLedger=[...row.interestLedger??[],{minute:at,due,paid,rate:depositRate(e,d.get('state'),b,at)}];
            }
            d.set(financePath(id),row);
        }
        if(original.kind==='pawn'&&original.status!=='已还清'&&original.auctionAt<=minute){d.set(financePath(id),{...original,status:'流当'});continue;}
        if(original.category==='debt'&&original.kind==='player_loan'&&original.status!=='已还清'){
            let row=original;
            for(let at=row.nextPayment;at<=minute&&row.status!=='已还清';at+=DAY){
                const actor=d.get('state','npcs',row.debtor),unable=actor&&(['死亡','濒死','昏迷'].includes(actor.status)||personConstraint(e,d.get('state'),row.debtor,at));
                const cash=financeBalance(d,e,row.debtor),expense=borrowerCashFlow(e,d.get('state'),row.debtor,at).expense;
                const elapsed=Math.floor((at-row.createdAt)/((row.deadline-row.createdAt)/row.installments));
                const completed=Math.min(row.installments,Math.max(1,elapsed)),target=Math.ceil(row.amount*completed/row.installments);
                const amount=unable?0:Math.min(Math.max(0,cash-expense),Math.max(0,target-row.paid));
                if(amount){loanPayment(d,e,id,row,amount,at,`${id}:${at}`);row=d.get(...financePath(id));}
                row={...row,nextPayment:at+DAY};
                if(row.paid<row.amount&&at>=row.deadline+c.loan.defaultGraceMinutes&&!row.defaulted){
                    const p=row.pledgeRecord?releasePledge(d,e,row.pledgeRecord,'player'):null;
                    if(p)row={...row,paid:Math.min(row.amount,row.paid+p.value)};
                    const remaining=row.amount-row.paid,legalCase=remaining?registerCreditDefault(d,e,{debt:id,row,value:remaining,minute:at}):null;
                    row={...row,status:remaining?'逾期':'已还清',defaulted:{minute:at,remaining,case:legalCase}};
                }
                d.set(financePath(id),row);
            }
        }
    }
}
