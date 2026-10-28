import {preconditionFailure} from './precondition.mjs';
import {reject} from './action-rejection.mjs';
import {contractTerms,partyInProcedure} from './contract-state.mjs';
import {currentGrace} from './obligation-state.mjs';
import {recordsWhere} from './storage.mjs';
import {openObligation,adoptLegacyObligation,settleObligation,obligationInstrument} from './obligation-runtime.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {consent as nativeConsent} from './action-consent.mjs';
// Contracts and credit (U2). Loans carry interest, a term and an optional pledge;
// a registered counting house keeps deposits and changes coin of other polities
// by its fineness; any registered guest room or spare house can be rented; the
// player can hire out for wages; a partner can buy into the player's shop.
// Loans are ordinary `debt` records (kind loan|partnership), so the existing
// overdue step, scene card and ledger see them. A loan left unpaid past its
// grace period is a default: the pledge is forfeited, a legal case opens under
// the code where it was signed, and a `breach` world event reaches standing.
import {changeItems,transferItems}from'./items.mjs';
import {purse,vault,partyAccount,mirrorPartyCoins,escrow as escrowAccount,moveCoins}from'./money.mjs';
import {declareLedgerWriter}from'./ledger.mjs';
import {bag,store,pledged,vaultGoods,moveStock,BOOKED as STOCK_BOOKED} from './stock.mjs';
declareLedgerWriter('credit');
import {scheduleAt,assertNpcService,advanceWithNpcParticipants}from'./npc-schedule.mjs';
import {npcSchedule}from'./npc-state.mjs';
import {standing}from'./standing.mjs';
import {registerCreditDefault,settleCreditCase}from'./law.mjs';
import {businessReport}from'./business.mjs';
import {personAge,personConstraint}from'./entity-view.mjs';
import {derivedBankAt,derivedBankById,BANK_OPERATIONS,bankTrade,advanceBankFinance,settleFinancialClaim,interestRate,settleDepositInterest} from './finance-bank.mjs';
import {ASSET_OPERATIONS,assetTrade,advanceFinanceAssets}from'./finance-assets.mjs';
import {groupAccountView,ensureGroupAccount,groupAccountPath}from'./group-account.mjs';
import {currencyExchange,currencyRow,currencyTradePrice} from './currency.mjs';
import {claimCopper,contractFreeze,copperToUnits,resourceItem} from './tender.mjs';
import {claimUnit} from './claim-unit.mjs';
import {holdGoods,releaseGoods} from './goods-escrow.mjs';
import {interestAmount} from './obligation-calendar.mjs';
import {valuation} from './valuation.mjs';

export {CREDIT_OPERATIONS} from './finance-operations.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
declareHoldingWriter('credit',{kinds:['pledged','employed_by','leases','share'],locations:true});
export const CREDIT_KINDS=new Set(['loan','partnership','pawn']);
const rec=id=>['state','records',id];
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}必须在${min}到${max}之间`);return n;};
import {projectionLiving} from './lifecycle-state.mjs';
const awake=n=>projectionLiving(n)&&!['濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
export const creditRules=engine=>engine.rules.economy?.credit??null;
function rules(engine){const c=creditRules(engine);if(!c)throw preconditionFailure('此世界尚未登记借贷与钱庄规则');return c;}
const nameOf=(engine,id)=>engine.byId.get(id)?.name??id;
// F007：押品、典当物的价值走估值角色（市场估值投影），不是目录基价也不是成交价；没有估值依据的物品不能作押。
const valueOf=(d,engine,item,quantity,location=d.get('state','location'),holder='player')=>{
    const r=valuation(d,engine,{role:'goods',item,quantity,location,holder});
    if(r.value===null)throw preconditionFailure(`${nameOf(engine,item)}没有可派生的估值依据，不能作押：${r.unvaluable}`);
    return r.value;
};
export const collateralValue=valueOf;

// A present, awake adult who agreed now and has a waking window at this place.
export function counterpart(d,engine,name,{consent,minutes=5}){
    if(!Number.isSafeInteger(minutes)||minutes<0)throw preconditionFailure('契约占用时间无效');
    const id=engine.resolve(name),row=engine.actor(d,id),base=engine.byId.get(id);
    if(id==='player'||!id.startsWith('npc_')||!awake(row)||row.location!==d.get('state','location'))throw preconditionFailure('契约对方须实际在场且清醒');
    if(personConstraint(engine,d.get('state'),id))throw preconditionFailure('契约对方正在依法拘留，不能提供服务');
    if((personAge(engine,d.get('state'),id).value??0)<18)throw preconditionFailure('未成年人不能订立借贷、雇佣或合伙契约');
    if(consent!==true)reject('E-ACTION-CONSENT','契约对方必须明确同意本次条款',{missing:['需要契约对方对本次条款的明确同意'],repair:['先向对方提出本次条款，取得明确同意后重试']});
    engine.assertNpcObligationAction(d,['player',id],{minutes});engine.assertNpcAutonomyAction(d.get('state'),['player',id],{minutes});
    const now=d.get('state','minute');
    for(let at=now;at<now+minutes;){
        const slot=scheduleAt(engine,id,at,d.get('state'));if(!slot)break;
        if(slot.location!==row.location||/睡眠|睡觉|熟睡/.test(slot.activity))throw preconditionFailure('对方作息没有清醒且在场的履约窗口');at=slot.until;
    }
    return id;
}

// ---- counting house ----------------------------------------------------------
export const bankAt=(engine,location,state=engine.document?.state)=>derivedBankAt(engine,state,location);
export const bankById=(engine,id,state)=>derivedBankById(engine,state,id);
export function bankRow(d,b){return structuredClone(d.get(...rec(b.id))??{category:'bank',id:b.id,name:b.name,location:b.location,coins:b.reserveCopper??0,goods:{...b.reserveCoins??{}},accounts:{}});}
export function openBank(d,engine,keeperName){
    const b=bankAt(engine,d.get('state','location'),d.get('state'));if(!b)throw preconditionFailure('此处没有登记钱庄或汇兑柜');
    if(d.get(...rec(b.id),'status')==='倒闭')throw preconditionFailure('钱庄已经倒闭，暂不能兑付');
    const keeper=counterpart(d,engine,keeperName,{consent:true,minutes:5});
    if(!b.keepers.includes(keeper))throw preconditionFailure(`${b.name}只由登记柜员经手`);
    return {b,row:bankRow(d,b),keeper};
}
const coinage=(engine,item)=>(rules(engine).coinages??[]).find(c=>c.item===item)??null;

// ---- pledges ---------------------------------------------------------------
export function pledge(d,engine,key,item,quantity,owner='player'){
    const signedValue=valueOf(d,engine,item,quantity);
    if(groupAccountView(engine,d.get('state'),owner)){
        const account=ensureGroupAccount(d,engine,owner);if((account.items[item]??0)<quantity)throw preconditionFailure('组织公库没有足够抵押实物');
        moveStock(d,{from:store(engine,owner,item),to:pledged(engine,key,item),amount:quantity,writer:'credit',eventId:key});
        d.set(groupAccountPath(owner),{...account,items:{...account.items,[item]:account.items[item]-quantity},ledger:[...account.ledger,{kind:'pledge',sourceEvent:key,items:{[item]:-quantity},minute:d.get('state','minute')}]});
        const row={category:'pledge',owner,item,quantity,instances:[],value:signedValue,status:'质押中',createdAt:d.get('state','minute')};holdingSet(d,engine,rec(key),row,'credit');return row;
    }
    if(engine.quantity(d,owner,item)<quantity)throw preconditionFailure('抵押物不在当事人的行囊中');
    const moved=changeItems(d,engine,owner,item,-quantity,{preserve:true,books:{account:pledged(engine,key,item),writer:'credit',eventId:key}});
    for(const unit of moved.instances)holdingSet(d,engine,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:key,status:'质押'},'credit');
    const row={category:'pledge',owner,item,quantity,instances:moved.instances,value:signedValue,status:'质押中',createdAt:d.get('state','minute')};
    holdingSet(d,engine,rec(key),row,'credit');return row;
}
export function releasePledge(d,engine,key,to,bank=null){
    const p=d.get(...rec(key));if(p?.category!=='pledge'||p.status!=='质押中')return null;
    if(bank){
        const row=bankRow(d,bank);row.goods[p.item]=(row.goods[p.item]??0)+p.quantity;holdingSet(d,engine,rec(bank.id),row,'credit');
        moveStock(d,{from:pledged(engine,key,p.item),to:vaultGoods(engine,bank.id,p.item),amount:p.quantity,writer:'credit',eventId:key});
        for(const unit of p.instances)holdingSet(d,engine,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:bank.id,status:'没收'},'credit');
    }else if(groupAccountView(engine,d.get('state'),to)){
        const account=ensureGroupAccount(d,engine,to);moveStock(d,{from:pledged(engine,key,p.item),to:store(engine,to,p.item),amount:p.quantity,writer:'credit',eventId:key});d.set(groupAccountPath(to),{...account,items:{...account.items,[p.item]:(account.items[p.item]??0)+p.quantity},ledger:[...account.ledger,{kind:'pledge_return',sourceEvent:key,items:{[p.item]:p.quantity},minute:d.get('state','minute')}]});
    }else{
        changeItems(d,engine,to,p.item,p.quantity,{books:{account:pledged(engine,key,p.item),writer:'credit',eventId:key}});
        if(p.instances.length){
            const bag=[...engine.bagPath(to),p.item,'instances'];d.set(bag,[...d.get(...bag)??[],...p.instances]);
            const estateOwner=d.get('holdings','entities',to,'facts','of'),container=estateOwner&&d.get('holdings','protocol','entities',estateOwner,'wreck');
            for(const unit of p.instances)holdingSet(d,engine,['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:to,status:'持有',...(container?{container}:{})},'credit');
        }
    }
    const next={...p,status:to===(p.owner??'player')?'已退还':'已没收',releasedAt:d.get('state','minute'),holder:bank?.id??to};holdingSet(d,engine,rec(key),next,'credit');return next;
}

// ---- loans -----------------------------------------------------------------
// Interest follows the lender's regard: the existing monthly band
// rules.economy.loanMonthlyInterest, cheapest for the most trusted borrower.
export function loanTerms(d,engine,{lender,bank,principal,days,collateralValue,borrower='player'}){
    const c=rules(engine),[low,high]=engine.rules.economy.loanMonthlyInterest;
    let rate,maximumDays,limit,per='anchor',calendar='core:calendar_default';
    if(bank){
        const credit=interestRate(engine,d.get('state'),bank,{borrower,principal,document:d.document});
        rate=credit.rate;per=credit.per;calendar=credit.calendar;maximumDays=bank.loanMaximumDays;limit=Math.min(bank.loanMaximumCopper,credit.loanable);
        if(collateralValue<Math.ceil(principal*bank.collateralRatio))throw preconditionFailure(`${bank.name}放款须有值${Math.ceil(principal*bank.collateralRatio)}铜以上的抵押`);
    }else{
        const regard=standing(engine,d.get('state'),lender,borrower);
        if(regard<c.loan.refuseBelow)throw preconditionFailure(`${nameOf(engine,lender)}不信任你，不肯借钱`);
        if(regard<c.loan.collateralBelow&&collateralValue<principal)throw preconditionFailure(`${nameOf(engine,lender)}与你交情不足，须有足值抵押才肯借`);
        rate=Math.round((high-(high-low)*Math.max(0,Math.min(100,regard))/100)*10000)/10000;
        maximumDays=c.loan.maximumDays;limit=Math.floor(engine.actor(d,lender).coins*c.loan.lenderCashShare);
    }
    if(!bank&&(rate<low||rate>high))throw preconditionFailure('利率超出世界登记的月息范围');
    int(days,1,maximumDays,'借期天数');
    if(principal>limit)throw preconditionFailure(`对方此刻至多能借出${Math.max(0,limit)}铜`);
    const now=d.get('state','minute');return {rate,per,calendar,interest:interestAmount({principal,rate,per,calendar,from:now,to:now+days*1440})};
}
// Creates the debt; the principal goes to the player or into a contract's escrow.
// S1a: escrowTo = 本金不给玩家时转入的托管账户（合同托管）。
export function loanSuccessionTerms(d,engine){
    return {onDebtorGone:'assume_by_heirs'};
}
// S5-F2: `frozen` = {resource,resourceName,referenceCopper,escrowContract} makes the principal that many units of a tender-unit
// resource, handed over by the lender in kind into the contract's goods escrow; rate/limit are judged on the reference bill and interest
// is whole units of the same resource.
export function openLoan(d,engine,{lender,bank=null,keeper=null,principal,days,collateral=null,eventId,purpose,toPlayer=true,escrowTo=null,installments=1,kind='loan',debtor='player',actor=debtor,actedAs,consentSource,frozen=null}){
    principal=int(principal,1,1e7,'借款本金');
    const collateralValue=collateral?valueOf(d,engine,collateral.item,collateral.quantity):0;
    const quoted=loanTerms(d,engine,{lender,bank,principal:frozen?frozen.referenceCopper:principal,days,collateralValue,borrower:debtor});
    const {rate,per,calendar}=quoted,interest=frozen?interestAmount({principal,rate,per,calendar,from:d.get('state','minute'),to:d.get('state','minute')+days*1440}):quoted.interest;
    const id=`debt_loan_${eventId}`;if(d.get(...rec(id)))throw preconditionFailure('借据编号已存在');
    const now=d.get('state','minute'),pledgeKey=collateral?`pledge:${id}`:null;
    if(collateral)pledge(d,engine,pledgeKey,collateral.item,collateral.quantity,debtor);
    if(!toPlayer&&!escrowTo)throw preconditionFailure('借款本金须有去处');
    if(frozen){
        if(frozen.escrowContract){
            if(bank||toPlayer)throw preconditionFailure('按法定单位冻结的借款只用于合同托管，且由出借人本人付出');
            holdGoods(d,engine,{contract:frozen.escrowContract,payer:lender,resource:frozen.resource,amount:principal,writer:'credit',eventId});
        }else{
            // W8-B: a counting house or private lender hands the frozen units over in kind, from the vault or the lender's own bag.
            if(!toPlayer)throw preconditionFailure('按法定单位冻结的借款须直接交到借款人手里');
            const item=resourceItem(engine,frozen.resource);
            if(bank){
                const row=bankRow(d,bank);
                if((row.goods[item]??0)<principal)throw preconditionFailure(`${bank.name}没有足够的${nameOf(engine,item)}可放：需要${principal}`);
                changeItems(d,engine,debtor,item,principal,{books:{account:vaultGoods(engine,bank.id,item),writer:'credit',eventId}});
                row.goods[item]-=principal;holdingSet(d,engine,rec(bank.id),row,'credit');
            }else transferItems(d,engine,lender,debtor,item,principal,null,{eventId});
        }
    }else{
    moveCoins(d,{from:bank?vault(bank.id):purse(engine,lender),to:toPlayer?partyAccount(engine,d.get('state'),debtor):escrowTo,amount:principal,writer:'credit',eventId});
    if(bank){const row=bankRow(d,bank);row.coins-=principal;holdingSet(d,engine,rec(bank.id),row,'credit');}
    else d.set([...engine.actorPath(lender),'coins'],engine.actor(d,lender).coins-principal);
    }
    if(toPlayer&&!frozen)mirrorPartyCoins(d,engine,debtor,principal,eventId,'credit');
    // New loans explicitly continue their signed schedule through the estate.
    // Old records without this clause retain the package's accelerate route.
    const succession=kind==='loan'?loanSuccessionTerms(d,engine):null;
    const terms={debtor,creditor:bank?.id??lender,principal,interest,monthlyInterest:rate,days,deadline:now+days*1440,pledge:collateral?{...collateral,value:collateralValue}:null,
        terms:{...succession,rateTerms:{per,calendar},...(frozen?{referenceCopper:frozen.referenceCopper}:{}),...(consentSource?{consent:consentSource}:{})}};
    const row={category:'debt',kind,name:purpose??`向${bank?.name??nameOf(engine,lender)}借款`,...terms,...(bank?{bank:bank.id,keeper}:{}),installments,
        amount:principal+interest,paid:0,createdAt:now,status:'待偿还',location:d.get('state','location'),source:eventId,pledgeRecord:pledgeKey,signedTerms:structuredClone(terms),
        ...(frozen?{resource:frozen.resource,resourceName:frozen.resourceName,referenceCopper:frozen.referenceCopper}:{})};
    holdingSet(d,engine,rec(id),row,'credit');
    openObligation(d,engine,{...row,id:`finance:${id}`,legacyRecord:id,actor,...(actedAs?{actedAs}:{})},`${eventId}:claim`);
    return {debt:id,principal,interest,amount:row.amount,monthlyInterest:rate,per,deadline:row.deadline,...(pledgeKey?{pledge:pledgeKey}:{}),...(frozen?{resource:frozen.resource,resourceName:frozen.resourceName,referenceCopper:frozen.referenceCopper}:{})};
}
// W8-B: the whole loan principal is frozen in the signing place's tender unit (null in a coin_river place, or for a debtor with no bag).
// `copper` is the bill the parties quoted in reference copper; limits and rates are judged on it, the units are what is lent and owed.
// The resource comes from the same contractFreeze path, but the lender never lends more than the quoted bill: the principal rounds DOWN to
// whole units (a pawn advance or a bank limit is a ceiling), and a bill worth less than one unit is refused instead of lent as a whole one.
export function loanFreeze(d,engine,{copper,debtor='player',location=d.get('state','location')}){
    if(debtor!=='player'&&!String(debtor).startsWith('npc_'))return null;
    const bill=int(copper,1,1e7,'借款本金'),fz=contractFreeze(d,engine,{location,coppers:{principal:bill}});
    if(!fz)return null;
    const units=copperToUnits(d,engine,{resource:fz.resource,copper:bill,location,up:false});
    if(units<1)throw preconditionFailure(`按今日兑换率，${bill}铜折不足一${fz.resourceName}，放不出更小的单位`);
    return {...fz,amounts:{principal:units}};
}
export const isCreditDebt=row=>row?.category==='debt'&&CREDIT_KINDS.has(row.kind);
// Repayment through the ordinary trade repay call; the creditor or the bank's keeper must be present.
export function repayCredit(d,engine,{seller,debt:id,coins:partial,payCurrency},eventId){
    const row=d.get(...rec(id));
    if(!isCreditDebt(row)||row.debtor!=='player')throw preconditionFailure('需要 debt 指定本人的真实借据');
    if(row.status==='已还清')throw preconditionFailure('这笔欠款已经还清，不重复付款');
    const bank=row.bank?bankById(engine,row.bank,d.get('state')):null;
    if(bank?!(bank.keepers.includes(seller)&&d.get('state','location')===bank.location):row.creditor!==seller)throw Error(bank?`须到${bank.name}向登记柜员还款`:'还款对象不是债主');
    counterpart(d,engine,seller,{consent:true});
    const amount=partial===undefined?row.amount-row.paid:int(partial,1,row.amount-row.paid,'还款金额'),coins=d.get('state','player','coins');
    if(!row.resource&&coins<amount)throw preconditionFailure(`还款${amount}铜，现钱不足`);
    const priorPledge=row.pledgeRecord&&d.get(...rec(row.pledgeRecord));
    settleFinancialClaim(d,engine,{claim:id,payer:'player',amount,...(payCurrency?{payWith:payCurrency}:{})},eventId);
    const now=d.get('state','minute');
    const paid=row.paid+amount,status=paid===row.amount?'已还清':row.status;
    holdingSet(d,engine,rec(id),{...d.get(...rec(id)),kind:row.kind,paid,status,...(status==='已还清'?{paidAt:now}:{})},'credit');
    const returned=status==='已还清'&&row.pledgeRecord?(releasePledge(d,engine,row.pledgeRecord,'player')??(priorPledge?.status==='质押中'?d.get(...rec(row.pledgeRecord)):null)):null;
    if(status==='已还清'&&row.defaulted?.case&&!d.get(...rec(row.defaulted.case),'compensationPaid'))settleCreditCase(d,engine,row.defaulted.case,eventId);
    if(status!=='已还清'&&row.defaulted?.case){const claim=d.get(...rec(row.defaulted.case));if(claim)holdingSet(d,engine,rec(row.defaulted.case),{...claim,value:copperLeft(d,engine,row,row.amount-paid),...(claim.judgment?{judgment:{...claim.judgment,compensation:copperLeft(d,engine,row,row.amount-paid)}}:{})},'credit');}
    engine.advance(d,5,eventId);d.say(`偿还${bank?.name??nameOf(engine,row.creditor)}欠款${amount}${claimUnit(row)}，${status}${returned?`，取回抵押${nameOf(engine,returned.item)}×${returned.quantity}`:''}`);
    return {debt:id,repaid:amount,status,...(returned?{pledgeReturned:returned.item}:{})};
}
// A claim frozen in a tender-unit resource is judged in court at today's reference-copper value (derived, never stored back).
const copperLeft=(d,engine,row,units)=>row.resource&&row.resource!=='coin_river'?claimCopper(d,engine,{resource:row.resource,amount:units,paid:0}):units;
function defaultDebt(d,engine,id,row){
    const allowance=currentGrace(engine,d.get('state'),row,d.get('state','minute'),{fallbackMinutes:rules(engine).loan.defaultGraceMinutes??0});
    const minute=(row.installmentOverdueAt??row.deadline)+allowance.minutes,bank=row.bank?bankById(engine,row.bank,d.get('state')):null;
    let next={...row};
    const forfeited=row.pledgeRecord?releasePledge(d,engine,row.pledgeRecord,row.creditor,bank):null;
    if(forfeited){const value=row.resource&&row.resource!=='coin_river'?copperToUnits(d,engine,{resource:row.resource,copper:forfeited.value,location:row.location,up:false}):forfeited.value,covered=Math.min(value,next.amount-next.paid);next.paid+=covered;if(next.paid===next.amount)Object.assign(next,{status:'已还清',paidAt:minute,settledBy:'pledge'});}
    const remaining=next.amount-next.paid;
    const legalCase=remaining>0?registerCreditDefault(d,engine,{debt:id,row:next,value:copperLeft(d,engine,next,remaining),minute}):null;
    next.defaulted={minute,remaining,grace:allowance,pledge:forfeited?{item:forfeited.item,quantity:forfeited.quantity,value:forfeited.value}:null,case:legalCase};
    holdingSet(d,engine,rec(id),next,'credit');
    d.say(`欠${bank?.name??nameOf(engine,row.creditor)}的${row.kind==='loan'?'借款':'合伙款'}过宽限仍未还，按契约违约${forfeited?`，抵押${nameOf(engine,forfeited.item)}已归债主`:''}${legalCase?`，已在当地立案（${legalCase}）`:''}`);
}

// ---- partnership -------------------------------------------------------------
function settlePartnership(d,engine,id,row,{minute,eventId}){
    row=contractTerms(row,minute);
    const shop=d.get(...rec(row.business)),net=businessReport(d,engine,shop).profit.net,profit=net-row.baselineNet;
    const shareCopper=Math.floor(profit*row.share/100),frozen=row.resource&&row.resource!=='coin_river',unitsOf=(copper,up)=>copperToUnits(d,engine,{resource:row.resource,copper,location:row.location,up});
    // W8-B: a stake frozen in a tender unit is returned in that unit; the profit share (reference copper) converts at today's rate and the rounding stays with the partner who is owed.
    const payout=Math.max(0,row.stake+(frozen?(shareCopper>=0?unitsOf(shareCopper,true):-unitsOf(-shareCopper,false)):shareCopper));
    let debt=null;
    if(payout>0){
        debt=`debt_partner_${eventId}`;
        holdingSet(d,engine,rec(debt),{category:'debt',kind:'partnership',name:`${nameOf(engine,row.partner)}合伙退股与分成`,debtor:'player',creditor:row.partner,amount:payout,paid:0,principal:payout,interest:0,
            createdAt:minute,deadline:minute+rules(engine).partnership.payoutDays*1440,status:'待偿还',location:row.location,contract:id,source:eventId,
            ...(frozen?{resource:row.resource,resourceName:row.resourceName,referenceCopper:{stake:row.referenceCopper?.stake,share:shareCopper}}:{})},'credit');
        adoptLegacyObligation(d,engine,debt);
    }
    const next={...row,status:'已结算',settledAt:minute,profit,payout,debt};holdingSet(d,engine,rec(id),next,'credit');
    d.say(`与${nameOf(engine,row.partner)}的合伙结算：期间盈亏${profit}铜，应付退股与分成${payout}${claimUnit(row)}`);
    return next;
}

// ---- lodging -----------------------------------------------------------------
// Any location with `lodging:{host,kind,rooms}` rents rooms at the economy anchors.
export function lodgingOf(engine,host,location){
    const places=engine.world.locations.filter(l=>l.lodging?.host===host&&(l.lodging.rooms??0)>0);
    return places.find(l=>l.id===location)??(places.length===1?places[0]:null);
}
export function assertLodgingHost(d,engine,host,place,consent){
    const schedule=npcSchedule(engine,d.get('state'),host);
    if(!schedule||JSON.stringify(schedule).includes('"trade"'))return assertNpcService(d,engine,host,'trade',10);
    if(consent!==true)throw preconditionFailure('房东须当面明确同意出租（consent=true）');
    counterpart(d,engine,host,{consent,minutes:10});
}
export function grantLodgingAccess(d,engine,place,host,{starts,expires,eventId}){
    if(!['private','council'].includes(place.access?.mode))return null;
    const key=`permission_room_${eventId}`;
    holdingSet(d,engine,rec(key),{category:'authorization',action:'enter_home',subject:place.id,grantor:host,grantee:'player',guests:[],createdAt:starts,expires,revoked:false,content:`租住${place.name}`,sourceEvent:eventId},'credit');
    return key;
}

// ---- operations (world_trade) -----------------------------------------------
export async function creditTrade(d,args,eventId,terms){
    const engine=this,op=args.operation;
    if(BANK_OPERATIONS.has(op))return bankTrade(d,engine,args,eventId,terms);
    if(ASSET_OPERATIONS.has(op))return assetTrade(d,engine,args,eventId);
    if(op==='borrow'){
        const bankHere=bankAt(engine,d.get('state','location'),d.get('state')),lender=engine.resolve(args.seller);
        const days=args.days??7,collateral=args.item?{item:engine.resolve(args.item,'item'),quantity:int(args.quantity??1,1,100000,'抵押数量')}:null;
        let bank=null,keeper=null,agreement=null;
        if(bankHere?.keepers.includes(lender)){({b:bank,keeper}=openBank(d,engine,lender));}
        else{
            const quoted=loanTerms(d,engine,{lender,principal:args.coins,days,collateralValue:collateral?valueOf(d,engine,collateral.item,collateral.quantity):0});
            agreement=nativeConsent({engine,document:d.document},lender,'player','loan',{purpose:'player',subject:'player',terms:{principal:args.coins,days,interest:quoted.interest},until:d.get('state','minute')+5,onRefusal:'abort'});
            counterpart(d,engine,lender,{consent:agreement.allowed,minutes:5});
        }
        const installments=args.quantity&&!args.item?int(args.quantity,1,days,'分期期数'):1;
        const fz=loanFreeze(d,engine,{copper:args.coins,location:bank?.location}),loan=openLoan(d,engine,{lender,bank,keeper,principal:fz?fz.amounts.principal:args.coins,days,collateral,eventId,installments,consentSource:agreement?.source,...(fz?{frozen:{resource:fz.resource,resourceName:fz.resourceName,referenceCopper:args.coins}}:{})});
        if(args.quantity&&!args.item){const count=int(args.quantity,1,days,'分期期数'),row=d.get(...rec(loan.debt));holdingSet(d,engine,rec(loan.debt),{...row,installments:count,nextInstallment:1},'credit');}
        engine.advance(d,5,eventId);
        d.say(`向${bank?.name??nameOf(engine,lender)}借${loan.principal}${claimUnit(loan)}，${loan.per==='day'?'日息':'月息'}${loan.monthlyInterest*100}%，${days}天后还本息${loan.amount}${claimUnit(loan)}`);
        return {lender:bank?.id??lender,...loan};
    }
    if(['deposit','withdraw','exchange'].includes(op)){
        const {b,row,keeper}=openBank(d,engine,args.seller),coins=d.get('state','player','coins');
        let detail;
        if(op==='deposit'){
            const amount=int(args.coins,b.depositFeeCopper+1,1e7,'存入铜钱');if(coins<amount)throw preconditionFailure('现钱不足');
            row.coins+=amount;row.accounts.player=(row.accounts.player??0)+amount-b.depositFeeCopper;
            row.interestAt??=d.get('state','minute');
            moveCoins(d,{from:purse(engine,'player'),to:vault(b.id),amount,writer:'credit',eventId});d.set(['state','player','coins'],coins-amount);
            // Materialized branches carry the current teller and physical seat,
            // so the shared signer protocol resolves the same operating bank.
            row.keepers=[...b.keepers];holdingSet(d,engine,rec(b.id),row,'credit');
            const claim=`deposit:${b.id}:${eventId}`;
            const rateTerms=interestRate(engine,d.get('state'),b,{borrower:null,document:d.document});
            holdingSet(d,engine,rec(`bank_deposit:${eventId}`),{category:'bank_deposit',claim,bank:b.id,depositor:'player',keeper,
                gross:amount,principal:amount-b.depositFeeCopper,fee:b.depositFeeCopper,minute:d.get('state','minute'),
                from:purse(engine,'player'),to:vault(b.id),sourceEvent:eventId},'credit');
            openObligation(d,engine,{id:claim,kind:'deposit',debtor:b.id,creditor:'player',actor:keeper,amount:amount-b.depositFeeCopper,
                terms:{sourceEvent:eventId,bank:b.id,principal:amount-b.depositFeeCopper,fee:b.depositFeeCopper,rateTerms:{per:rateTerms.per,calendar:rateTerms.calendar}}},`${eventId}:deposit`);
            detail={deposited:amount-b.depositFeeCopper,fee:b.depositFeeCopper,claim};
        }else if(op==='withdraw'){
            const state=d.get('state');
            if(args.debt){
                const named=obligationRows(state).find(o=>o.id===args.debt&&o.kind==='deposit'&&o.debtor===b.id&&o.creditor==='player');
                const original=named?.terms?.requiresInstrument,paper=typeof original==='string'?state.itemInstances?.[original]:null;
                if(paper?.document?.lost)throw preconditionFailure('该存单已挂失作废，不能凭原件兑付；请凭补发的新存单支取');
            }
            const claims=obligationRows(state).filter(o=>o.kind==='deposit'&&o.debtor===b.id&&o.creditor==='player'&&obligationView(state,o).owed>0&&
                (args.debt?o.id===args.debt:!o.terms?.requiresInstrument||obligationInstrument(engine,state,o,b.id)));
            // F049: a withdrawal is a settlement event for the claims it draws on.
            // Interest earned so far joins the claims first, so the balance checked
            // here is the one bank_inspect shows; the player receives exactly what is asked.
            const gained=settleDepositInterest(d,engine,b,claims.map(o=>o.id));
            Object.assign(row,d.get(...rec(b.id)));
            const balance=row.accounts.player??0,amount=args.coins;
            if(!Number.isSafeInteger(amount)||amount<1||amount>balance)reject('E-ACTION-WITHDRAWAL',`支取铜钱必须在1到${balance}之间`,{missing:['支取数额须大于零且不超过当前存款'],repair:['核对当前存款，存入钱款或调低支取数额后重试']});
            if(row.coins<amount)throw preconditionFailure(`${b.name}现银不足，暂不能兑付`);
            if(claims.reduce((n,o)=>n+obligationView(d.get('state'),o.id).owed,0)<amount)throw preconditionFailure('支取须对应本人足额的真实存款债权');
            let left=amount;
            for(const claim of claims){
                if(!left)break;
                const paid=Math.min(left,obligationView(d.get('state'),claim.id).owed);
                settleObligation(d,engine,{id:claim.id,payer:b.id,actor:keeper,amount:paid},`${eventId}:${claim.id}`);left-=paid;
            }
            // Protocol settlement already moved the cash and updated its one account projection.
            Object.assign(row,d.get(...rec(b.id)));detail={withdrawn:amount,...(gained?{interestCapitalized:gained}:{})};
        }else{
            const item=engine.resolve(args.item,'item'),c=coinage(engine,item),quantity=int(args.quantity,1,100000,'兑换枚数');
            if(!c)throw preconditionFailure('这不是登记的铸币');
            const buy=args.buyer!==undefined&&engine.resolve(args.buyer)==='player';
            const credit=interestRate(engine,d.get('state'),b,{document:d.document});
            detail=currencyExchange(d,engine,{bank:b,row,item,quantity,buy,mode:args.mode,eventId,loanable:credit.loanable});
        }

        const depositMinutes=engine.world.primitiveTables?.['action-costs']?.rows?.find(r=>r.selector==='bank.deposit')?.timeMin;
        const calibratedDeposit=op==='deposit'&&depositMinutes;
        holdingSet(d,engine,rec(b.id),row,'credit');engine.advance(d,calibratedDeposit?depositMinutes:5,eventId);
        return {bank:b.id,keeper,balance:row.accounts.player??0,...detail};
    }
    if(op==='work'){
        const minutes=int(args.minutes??240,30,480,'工时'),employer=counterpart(d,engine,args.seller,{consent:args.consent,minutes});
        const [low,high]=engine.rules.economy.wageCopperPerHalfDay,min=Math.max(1,Math.ceil(low*minutes/240)),max=Math.max(1,Math.ceil(high*minutes/240));
        const wage=int(args.coins??min,min,max,'工钱'),boss=engine.actor(d,employer),fz=contractFreeze(d,engine,{location:d.get('state','location'),coppers:{wage}});
        if(!fz&&boss.coins<wage)throw preconditionFailure('雇主现钱不足以支付工钱');
        const skills=engine.byId.get(employer)?.skills,skill=(Array.isArray(skills)?skills:Object.keys(skills??{})).find(s=>String(s).startsWith('skill_'))??null;
        const id=`contract_work_${eventId}`,location=d.get('state','location');if(d.get(...rec(id)))throw preconditionFailure('雇佣契约编号已存在');
        // W8-B: in a tender-unit place the wage is frozen as whole units of that resource, held in kind in the contract's goods escrow.
        if(fz)holdGoods(d,engine,{contract:id,payer:employer,resource:fz.resource,amount:fz.amounts.wage,writer:'credit',eventId});
        else{moveCoins(d,{from:purse(engine,employer),to:escrowAccount(id),amount:wage,writer:'credit',eventId});d.set([...engine.actorPath(employer),'coins'],boss.coins-wage);}
        const pay=fz?fz.amounts.wage:wage,unit=fz?fz.resourceName:'铜',terms={parties:['player',employer],minutes,wage:pay,skill,location,...(fz?{resource:fz.resource,resourceName:fz.resourceName,referenceCopper:{wage}}:{})};
        holdingSet(d,engine,rec(id),{category:'contract',kind:'employment',name:`受雇于${nameOf(engine,employer)}`,...terms,escrow:pay,status:'履行中',createdAt:d.get('state','minute'),source:eventId,signedTerms:structuredClone(terms)},'credit');
        advanceWithNpcParticipants(d,engine,minutes,eventId,[employer]);
        const finished=d.get('state','location')===location&&d.get('state','player','status')==='正常';
        const row=d.get(...rec(id));
        if(!finished){if(fz)releaseGoods(d,engine,{contract:id,to:employer,resource:fz.resource,amount:pay,writer:'credit',eventId});else{moveCoins(d,{from:escrowAccount(id),to:purse(engine,employer),amount:wage,writer:'credit',eventId});d.set([...engine.actorPath(employer),'coins'],engine.actor(d,employer).coins+wage);}holdingSet(d,engine,rec(id),{...row,escrow:0,status:'中止',endedAt:d.get('state','minute')},'credit');return {contract:id,employer,status:'中止'};}
        if(fz)releaseGoods(d,engine,{contract:id,to:'player',resource:fz.resource,amount:pay,writer:'credit',eventId});else{moveCoins(d,{from:escrowAccount(id),to:purse(engine,'player'),amount:wage,writer:'credit',eventId});d.set(['state','player','coins'],d.get('state','player','coins')+wage);}
        holdingSet(d,engine,rec(id),{...row,escrow:0,paid:pay,status:'已完成',endedAt:d.get('state','minute')},'credit');
        const practiced=skill&&d.get('state','skills',skill)?engine.practice(d,{skill,gain:Math.max(1,Math.floor(minutes/80)),target:`受雇:${employer}`},eventId):null;
        d.say(`为${nameOf(engine,employer)}做工${minutes}分钟，得工钱${pay}${unit}`);
        return {contract:id,employer,minutes,wage:pay,...(fz?{resource:fz.resource,resourceName:fz.resourceName}:{}),status:'已完成',skill,skillGain:practiced?.gain??0};
    }
    if(op==='partner'){
        if(args.contract){
            const row=d.get(...rec(args.contract));
            if(row?.category!=='contract'||row.kind!=='partnership'||row.status!=='有效')throw preconditionFailure('需要有效的合伙契约编号');
            counterpart(d,engine,row.partner,{consent:args.consent,minutes:5});
            const settled=settlePartnership(d,engine,row.id,row,{minute:d.get('state','minute'),eventId});
            const frozenPay=settled.resource&&settled.resource!=='coin_river',paid=settled.debt&&(frozenPay?engine.quantity(d,'player',resourceItem(engine,settled.resource)):d.get('state','player','coins'))>=settled.payout?repayCredit(d,engine,{seller:row.partner,debt:settled.debt},eventId):null;
            if(!paid)engine.advance(d,5,eventId);
            return {contract:row.id,status:settled.status,profit:settled.profit,payout:settled.payout,debt:settled.debt,paid:Boolean(paid),...(frozenPay?{resource:settled.resource,resourceName:settled.resourceName}:{})};
        }
        const shop=d.get(...rec(args.business));
        if(shop?.category!=='business'||shop.owner!=='player'||!['筹备','营业'].includes(shop.status))throw preconditionFailure('合伙需要本人正在经营的店铺编号');
        if(shop.location!==d.get('state','location'))throw preconditionFailure('须在铺面当面订立合伙');
        const partner=counterpart(d,engine,args.seller,{consent:args.consent,minutes:5}),p=rules(engine).partnership;
        const fz=Number.isSafeInteger(args.coins)&&args.coins>=1&&args.coins<=1e7?contractFreeze(d,engine,{location:shop.location,coppers:{stake:args.coins}}):null;
        const stake=fz?fz.amounts.stake:int(args.coins,1,engine.actor(d,partner).coins,'合伙出资'),share=int(args.quantity,p.minimumShare,p.maximumShare,'分成百分比'),days=int(args.days??30,1,p.maximumDays,'合伙天数');
        const id=`contract_partner_${eventId}`;if(d.get(...rec(id)))throw preconditionFailure('合伙契约编号已存在');
        const now=d.get('state','minute'),baselineNet=businessReport(d,engine,shop).profit.net;
        // W8-B: in a tender-unit place the partner hands over the frozen units from his own bag.
        if(fz)transferItems(d,engine,partner,'player',resourceItem(engine,fz.resource),stake,null,{eventId});
        else{moveCoins(d,{from:purse(engine,partner),to:purse(engine,'player'),amount:stake,writer:'credit',eventId});d.set([...engine.actorPath(partner),'coins'],engine.actor(d,partner).coins-stake);d.set(['state','player','coins'],d.get('state','player','coins')+stake);}
        const terms={parties:['player',partner],partner,business:shop.id,stake,share,deadline:now+days*1440,...(fz?{resource:fz.resource,resourceName:fz.resourceName,referenceCopper:{stake:args.coins}}:{})};
        holdingSet(d,engine,rec(id),{category:'contract',kind:'partnership',version:2,name:`与${nameOf(engine,partner)}合伙经营`,...terms,baselineNet,location:shop.location,status:'有效',createdAt:now,source:eventId,signedTerms:structuredClone(terms)},'credit');
        engine.advance(d,5,eventId);d.say(`${nameOf(engine,partner)}出资${stake}${fz?fz.resourceName:'铜'}入伙，期满按${share}%分成并退股`);
        return {contract:id,partner,business:shop.id,stake,share,deadline:terms.deadline,...(fz?{resource:fz.resource,resourceName:fz.resourceName}:{})};
    }
    throw preconditionFailure('未知契约操作');
}

// ---- time --------------------------------------------------------------------
export function nextCreditMinute(engine,d,now){
    const period=creditRules(engine)?.depositInterest?.periodDays*1440;
    if(!Number.isSafeInteger(period)||period<=0)return Infinity;
    return recordsWhere(d.get('state','records'),'category','bank').filter(r=>Number.isSafeInteger(r.interestAt))
        .reduce((next,r)=>Math.min(next,r.interestAt+(Math.floor(Math.max(0,now-r.interestAt)/period)+1)*period),Infinity);
}
export function advanceCredit(d,engine,minute,recordIds){
    const c=creditRules(engine);if(!c)return;
    advanceBankFinance(d,engine,minute,recordIds);
    advanceFinanceAssets(d,engine,minute,recordIds);
    const rows=()=>(recordIds?recordIds.map(id=>[id,d.get('state','records',id)]).filter(([,row])=>row):Object.entries(d.get('state','records')??{})).map(([id,row])=>[id,row.category==='contract'?contractTerms(row,minute):row]);
    for(const [id,row]of rows())
        if(row.category==='contract'&&row.kind==='partnership'&&row.status==='有效'&&row.deadline<=minute)settlePartnership(d,engine,id,row,{minute:row.deadline,eventId:`deadline_${id}`});
    for(const [id,row]of rows())
        if(isCreditDebt(row)&&row.kind!=='pawn'&&row.status==='逾期'&&!row.defaulted&&(row.installmentOverdueAt??row.deadline)+currentGrace(engine,d.get('state'),row,minute,{fallbackMinutes:c.loan.defaultGraceMinutes??0}).minutes<=minute)defaultDebt(d,engine,id,row);
}
