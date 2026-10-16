// Contracts and credit (U2). Loans carry interest, a term and an optional pledge;
// a registered counting house keeps deposits and changes coin of other polities
// by its fineness; any registered guest room or spare house can be rented; the
// player can hire out for wages; a partner can buy into the player's shop.
// Loans are ordinary `debt` records (kind loan|partnership), so the existing
// overdue step, scene card and ledger see them. A loan left unpaid past its
// grace period is a default: the pledge is forfeited, a legal case opens under
// the code where it was signed, and a `breach` world event reaches standing.
import {changeItems}from'./items.mjs';
import {purse,vault,escrow as escrowAccount,moveCoins}from'./money.mjs';
import {declareLedgerWriter}from'./ledger.mjs';
declareLedgerWriter('credit');
import {scheduleAt,assertNpcService,advanceWithNpcParticipants}from'./npc-schedule.mjs';
import {npcSchedule}from'./npc-state.mjs';
import {standing}from'./standing.mjs';
import {registerCreditDefault,settleCreditCase}from'./law.mjs';
import {businessReport}from'./business.mjs';
import {personAge,personConstraint}from'./entity-view.mjs';
import {derivedBankAt,derivedBankById,BANK_OPERATIONS,bankTrade,advanceBankFinance}from'./finance-bank.mjs';
import {ASSET_OPERATIONS,assetTrade,advanceFinanceAssets}from'./finance-assets.mjs';
import {groupAccountView,ensureGroupAccount,groupAccountPath}from'./group-account.mjs';

export {CREDIT_OPERATIONS} from './finance-operations.mjs';
export const CREDIT_KINDS=new Set(['loan','partnership','pawn']);
const rec=id=>['state','records',id];
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`${label}必须在${min}到${max}之间`);return n;};
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
export const creditRules=engine=>engine.rules.economy?.credit??null;
function rules(engine){const c=creditRules(engine);if(!c)throw Error('此世界尚未登记借贷与钱庄规则');return c;}
const nameOf=(engine,id)=>engine.byId.get(id)?.name??id;
const valueOf=(engine,item,quantity)=>(engine.byId.get(item)?.basePrice??0)*quantity;

// A present, awake adult who agreed now and has a waking window at this place.
export function counterpart(d,engine,name,{consent,minutes=5}){
    const id=engine.resolve(name),row=engine.actor(d,id),base=engine.byId.get(id);
    if(id==='player'||!id.startsWith('npc_')||!awake(row)||row.location!==d.get('state','location'))throw Error('契约对方须实际在场且清醒');
    if(personConstraint(engine,d.get('state'),id))throw Error('契约对方正在依法拘留，不能提供服务');
    if((personAge(engine,d.get('state'),id).value??0)<18)throw Error('未成年人不能订立借贷、雇佣或合伙契约');
    if(consent!==true)throw Error('契约对方必须明确同意本次条款');
    engine.assertNpcObligationAction(d,['player',id],{minutes});engine.assertNpcAutonomyAction(d.get('state'),['player',id],{minutes});
    const now=d.get('state','minute');
    for(let at=now;at<now+Math.max(1,minutes);){
        const slot=scheduleAt(engine,id,at,d.get('state'));if(!slot)break;
        if(slot.location!==row.location||/睡眠|睡觉|熟睡/.test(slot.activity))throw Error('对方作息没有清醒且在场的履约窗口');at=slot.until;
    }
    return id;
}

// ---- counting house ----------------------------------------------------------
export const bankAt=(engine,location,state=engine.document?.state)=>derivedBankAt(engine,state,location);
export const bankById=(engine,id,state)=>derivedBankById(engine,state,id);
export function bankRow(d,b){return structuredClone(d.get(...rec(b.id))??{category:'bank',id:b.id,name:b.name,location:b.location,coins:b.reserveCopper??0,goods:{...b.reserveCoins??{}},accounts:{}});}
export function openBank(d,engine,keeperName){
    const b=bankAt(engine,d.get('state','location'),d.get('state'));if(!b)throw Error('此处没有登记钱庄或汇兑柜');
    if(d.get(...rec(b.id),'status')==='倒闭')throw Error('钱庄已经倒闭，暂不能兑付');
    const keeper=counterpart(d,engine,keeperName,{consent:true,minutes:5});
    if(!b.keepers.includes(keeper))throw Error(`${b.name}只由登记柜员经手`);
    return {b,row:bankRow(d,b),keeper};
}
const coinage=(engine,item)=>(rules(engine).coinages??[]).find(c=>c.item===item)??null;
const coinRate=c=>c.faceCopper*c.fineness;

// ---- pledges ---------------------------------------------------------------
export function pledge(d,engine,key,item,quantity,owner='player'){
    if(groupAccountView(engine,d.get('state'),owner)){
        const account=ensureGroupAccount(d,engine,owner);if((account.items[item]??0)<quantity)throw Error('组织公库没有足够抵押实物');
        d.set(groupAccountPath(owner),{...account,items:{...account.items,[item]:account.items[item]-quantity},ledger:[...account.ledger,{kind:'pledge',sourceEvent:key,items:{[item]:-quantity},minute:d.get('state','minute')}]});
        const row={category:'pledge',owner,item,quantity,instances:[],value:valueOf(engine,item,quantity),status:'质押中',createdAt:d.get('state','minute')};d.set(rec(key),row);return row;
    }
    if(engine.quantity(d,owner,item)<quantity)throw Error('抵押物不在当事人的行囊中');
    const moved=changeItems(d,engine,owner,item,-quantity,{preserve:true});
    for(const unit of moved.instances)d.set(['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:key,status:'质押'});
    const row={category:'pledge',owner,item,quantity,instances:moved.instances,value:valueOf(engine,item,quantity),status:'质押中',createdAt:d.get('state','minute')};
    d.set(rec(key),row);return row;
}
export function releasePledge(d,engine,key,to,bank=null){
    const p=d.get(...rec(key));if(p?.category!=='pledge'||p.status!=='质押中')return null;
    if(bank){
        const row=bankRow(d,bank);row.goods[p.item]=(row.goods[p.item]??0)+p.quantity;d.set(rec(bank.id),row);
        for(const unit of p.instances)d.set(['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:bank.id,status:'没收'});
    }else if(groupAccountView(engine,d.get('state'),to)){
        const account=ensureGroupAccount(d,engine,to);d.set(groupAccountPath(to),{...account,items:{...account.items,[p.item]:(account.items[p.item]??0)+p.quantity},ledger:[...account.ledger,{kind:'pledge_return',sourceEvent:key,items:{[p.item]:p.quantity},minute:d.get('state','minute')}]});
    }else{
        changeItems(d,engine,to,p.item,p.quantity);
        if(p.instances.length){
            const bag=[...engine.bagPath(to),p.item,'instances'];d.set(bag,[...d.get(...bag)??[],...p.instances]);
            for(const unit of p.instances)d.set(['state','itemInstances',unit],{...d.get('state','itemInstances',unit),owner:to,status:'持有'});
        }
    }
    const next={...p,status:to===(p.owner??'player')?'已退还':'已没收',releasedAt:d.get('state','minute'),holder:bank?.id??to};d.set(rec(key),next);return next;
}

// ---- loans -----------------------------------------------------------------
// Interest follows the lender's regard: the existing monthly band
// rules.economy.loanMonthlyInterest, cheapest for the most trusted borrower.
export function loanTerms(d,engine,{lender,bank,principal,days,collateralValue}){
    const c=rules(engine),[low,high]=engine.rules.economy.loanMonthlyInterest;
    let rate,maximumDays,limit;
    if(bank){
        rate=bank.loanMonthlyInterest;maximumDays=bank.loanMaximumDays;limit=Math.min(bank.loanMaximumCopper,bankRow(d,bank).coins);
        if(collateralValue<Math.ceil(principal*bank.collateralRatio))throw Error(`${bank.name}放款须有值${Math.ceil(principal*bank.collateralRatio)}铜以上的抵押`);
    }else{
        const regard=standing(engine,d.get('state'),lender,'player');
        if(regard<c.loan.refuseBelow)throw Error(`${nameOf(engine,lender)}不信任你，不肯借钱`);
        if(regard<c.loan.collateralBelow&&collateralValue<principal)throw Error(`${nameOf(engine,lender)}与你交情不足，须有足值抵押才肯借`);
        rate=Math.round((high-(high-low)*Math.max(0,Math.min(100,regard))/100)*10000)/10000;
        maximumDays=c.loan.maximumDays;limit=Math.floor(engine.actor(d,lender).coins*c.loan.lenderCashShare);
    }
    if(rate<low||rate>high)throw Error('利率超出世界登记的月息范围');
    int(days,1,maximumDays,'借期天数');
    if(principal>limit)throw Error(`对方此刻至多能借出${Math.max(0,limit)}铜`);
    return {rate,interest:Math.ceil(principal*rate*days/30)};
}
// Creates the debt; the principal goes to the player or into a contract's escrow.
// S1a: escrowTo = 本金不给玩家时转入的托管账户（合同托管）。
export function openLoan(d,engine,{lender,bank=null,keeper=null,principal,days,collateral=null,eventId,purpose,toPlayer=true,escrowTo=null}){
    principal=int(principal,1,1e7,'借款本金');
    const collateralValue=collateral?valueOf(engine,collateral.item,collateral.quantity):0;
    const {rate,interest}=loanTerms(d,engine,{lender,bank,principal,days,collateralValue});
    const id=`debt_loan_${eventId}`;if(d.get(...rec(id)))throw Error('借据编号已存在');
    const now=d.get('state','minute'),pledgeKey=collateral?`pledge:${id}`:null;
    if(collateral)pledge(d,engine,pledgeKey,collateral.item,collateral.quantity);
    if(!toPlayer&&!escrowTo)throw Error('借款本金须有去处');
    moveCoins(d,{from:bank?vault(bank.id):purse(engine,lender),to:toPlayer?purse(engine,'player'):escrowTo,amount:principal,writer:'credit',eventId});
    if(bank){const row=bankRow(d,bank);row.coins-=principal;d.set(rec(bank.id),row);}
    else d.set([...engine.actorPath(lender),'coins'],engine.actor(d,lender).coins-principal);
    if(toPlayer)d.set(['state','player','coins'],d.get('state','player','coins')+principal);
    const terms={debtor:'player',creditor:bank?.id??lender,principal,interest,monthlyInterest:rate,days,deadline:now+days*1440,pledge:collateral?{...collateral,value:collateralValue}:null};
    const row={category:'debt',kind:'loan',name:purpose??`向${bank?.name??nameOf(engine,lender)}借款`,...terms,...(bank?{bank:bank.id,keeper}:{}),
        amount:principal+interest,paid:0,createdAt:now,status:'待偿还',location:d.get('state','location'),source:eventId,pledgeRecord:pledgeKey,signedTerms:structuredClone(terms)};
    d.set(rec(id),row);
    return {debt:id,principal,interest,amount:row.amount,monthlyInterest:rate,deadline:row.deadline,...(pledgeKey?{pledge:pledgeKey}:{})};
}
export const isCreditDebt=row=>row?.category==='debt'&&CREDIT_KINDS.has(row.kind);
// Repayment through the ordinary trade repay call; the creditor or the bank's keeper must be present.
export function repayCredit(d,engine,{seller,debt:id,coins:partial},eventId){
    const row=d.get(...rec(id));
    if(!isCreditDebt(row)||row.debtor!=='player')throw Error('需要 debt 指定本人的真实借据');
    if(row.status==='已还清')throw Error('这笔欠款已经还清，不重复付款');
    const bank=row.bank?bankById(engine,row.bank,d.get('state')):null;
    if(bank?!(bank.keepers.includes(seller)&&d.get('state','location')===bank.location):row.creditor!==seller)throw Error(bank?`须到${bank.name}向登记柜员还款`:'还款对象不是债主');
    counterpart(d,engine,seller,{consent:true});
    const amount=partial===undefined?row.amount-row.paid:int(partial,1,row.amount-row.paid,'还款金额'),coins=d.get('state','player','coins');
    if(coins<amount)throw Error(`还款${amount}铜，现钱不足`);
    moveCoins(d,{from:purse(engine,'player'),to:bank?vault(bank.id):purse(engine,row.creditor),amount,writer:'credit',eventId});
    d.set(['state','player','coins'],coins-amount);
    if(bank){const b=bankRow(d,bank);b.coins+=amount;d.set(rec(bank.id),b);}
    else d.set([...engine.actorPath(row.creditor),'coins'],engine.actor(d,row.creditor).coins+amount);
    const now=d.get('state','minute');
    const paid=row.paid+amount,status=paid===row.amount?'已还清':row.status;
    d.set(rec(id),{...row,paid,status,...(status==='已还清'?{paidAt:now}:{})});
    const returned=status==='已还清'&&row.pledgeRecord?releasePledge(d,engine,row.pledgeRecord,'player'):null;
    if(status==='已还清'&&row.defaulted?.case)settleCreditCase(d,engine,row.defaulted.case,eventId);
    if(status!=='已还清'&&row.defaulted?.case){const claim=d.get(...rec(row.defaulted.case));if(claim)d.set(rec(row.defaulted.case),{...claim,value:row.amount-paid,...(claim.judgment?{judgment:{...claim.judgment,compensation:row.amount-paid}}:{})});}
    engine.advance(d,5,eventId);d.say(`偿还${bank?.name??nameOf(engine,row.creditor)}欠款${amount}铜，${status}${returned?`，取回抵押${nameOf(engine,returned.item)}×${returned.quantity}`:''}`);
    return {debt:id,repaid:amount,status,...(returned?{pledgeReturned:returned.item}:{})};
}
function defaultDebt(d,engine,id,row){
    const minute=(row.installmentOverdueAt??row.deadline)+(rules(engine).loan.defaultGraceMinutes??0),bank=row.bank?bankById(engine,row.bank,d.get('state')):null;
    let next={...row};
    const forfeited=row.pledgeRecord?releasePledge(d,engine,row.pledgeRecord,row.creditor,bank):null;
    if(forfeited){const covered=Math.min(forfeited.value,next.amount-next.paid);next.paid+=covered;if(next.paid===next.amount)Object.assign(next,{status:'已还清',paidAt:minute,settledBy:'pledge'});}
    const remaining=next.amount-next.paid;
    const legalCase=remaining>0?registerCreditDefault(d,engine,{debt:id,row:next,value:remaining,minute}):null;
    next.defaulted={minute,remaining,pledge:forfeited?{item:forfeited.item,quantity:forfeited.quantity,value:forfeited.value}:null,case:legalCase};
    d.set(rec(id),next);
    d.say(`欠${bank?.name??nameOf(engine,row.creditor)}的${row.kind==='loan'?'借款':'合伙款'}过宽限仍未还，按契约违约${forfeited?`，抵押${nameOf(engine,forfeited.item)}已归债主`:''}${legalCase?`，已在当地立案（${legalCase}）`:''}`);
}

// ---- partnership -------------------------------------------------------------
function settlePartnership(d,engine,id,row,{minute,eventId}){
    const shop=d.get(...rec(row.business)),net=businessReport(d,engine,shop).profit.net,profit=net-row.baselineNet;
    const payout=Math.max(0,row.stake+Math.floor(profit*row.share/100));
    let debt=null;
    if(payout>0){
        debt=`debt_partner_${eventId}`;
        d.set(rec(debt),{category:'debt',kind:'partnership',name:`${nameOf(engine,row.partner)}合伙退股与分成`,debtor:'player',creditor:row.partner,amount:payout,paid:0,principal:payout,interest:0,
            createdAt:minute,deadline:minute+rules(engine).partnership.payoutDays*1440,status:'待偿还',location:row.location,contract:id,source:eventId});
    }
    const next={...row,status:'已结算',settledAt:minute,profit,payout,debt};d.set(rec(id),next);
    d.say(`与${nameOf(engine,row.partner)}的合伙结算：期间盈亏${profit}铜，应付退股与分成${payout}铜`);
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
    if(consent!==true)throw Error('房东须当面明确同意出租（consent=true）');
    counterpart(d,engine,host,{consent,minutes:10});
}
export function grantLodgingAccess(d,engine,place,host,{starts,expires,eventId}){
    if(!['private','council'].includes(place.access?.mode))return null;
    const key=`permission_room_${eventId}`;
    d.set(rec(key),{category:'authorization',action:'enter_home',subject:place.id,grantor:host,grantee:'player',guests:[],createdAt:starts,expires,revoked:false,content:`租住${place.name}`,sourceEvent:eventId});
    return key;
}

// ---- operations (world_trade) -----------------------------------------------
export async function creditTrade(d,args,eventId){
    const engine=this,op=args.operation;
    if(BANK_OPERATIONS.has(op))return bankTrade(d,engine,args,eventId);
    if(ASSET_OPERATIONS.has(op))return assetTrade(d,engine,args,eventId);
    if(op==='borrow'){
        const bankHere=bankAt(engine,d.get('state','location'),d.get('state')),lender=engine.resolve(args.seller);
        const days=args.days??7,collateral=args.item?{item:engine.resolve(args.item,'item'),quantity:int(args.quantity??1,1,100000,'抵押数量')}:null;
        let bank=null,keeper=null;
        if(bankHere?.keepers.includes(lender)){({b:bank,keeper}=openBank(d,engine,lender));}
        else counterpart(d,engine,lender,{consent:args.consent,minutes:5});
        const loan=openLoan(d,engine,{lender,bank,keeper,principal:args.coins,days,collateral,eventId});
        if(args.quantity&&!args.item){const count=int(args.quantity,1,days,'分期期数'),row=d.get(...rec(loan.debt));d.set(rec(loan.debt),{...row,installments:count,nextInstallment:1});}
        engine.advance(d,5,eventId);
        d.say(`向${bank?.name??nameOf(engine,lender)}借${loan.principal}铜，月息${loan.monthlyInterest*100}%，${days}天后还本息${loan.amount}铜`);
        return {lender:bank?.id??lender,...loan};
    }
    if(['deposit','withdraw','exchange'].includes(op)){
        const {b,row,keeper}=openBank(d,engine,args.seller),coins=d.get('state','player','coins');
        let detail;
        if(op==='deposit'){
            const amount=int(args.coins,b.depositFeeCopper+1,1e7,'存入铜钱');if(coins<amount)throw Error('现钱不足');
            row.coins+=amount;row.accounts.player=(row.accounts.player??0)+amount-b.depositFeeCopper;
            row.interestAt??=d.get('state','minute');
            moveCoins(d,{from:purse(engine,'player'),to:vault(b.id),amount,writer:'credit',eventId});d.set(['state','player','coins'],coins-amount);detail={deposited:amount-b.depositFeeCopper,fee:b.depositFeeCopper};
        }else if(op==='withdraw'){
            const amount=int(args.coins,1,row.accounts.player??0,'支取铜钱');if(row.coins<amount)throw Error(`${b.name}现银不足，暂不能兑付`);
            moveCoins(d,{from:vault(b.id),to:purse(engine,'player'),amount,writer:'credit',eventId});row.coins-=amount;row.accounts.player-=amount;d.set(['state','player','coins'],coins+amount);detail={withdrawn:amount};
        }else{
            const item=engine.resolve(args.item,'item'),c=coinage(engine,item),quantity=int(args.quantity,1,100000,'兑换枚数');
            if(!c)throw Error('这不是登记的铸币');
            const buy=args.buyer!==undefined&&engine.resolve(args.buyer)==='player',gross=quantity*coinRate(c);
            if(buy){
                const cost=Math.ceil(gross*(1+b.exchangeFeeRate));
                if((row.goods[item]??0)<quantity)throw Error(`${b.name}库存${c.name}不足`);if(coins<cost)throw Error('现钱不足');
                moveCoins(d,{from:purse(engine,'player'),to:vault(b.id),amount:cost,writer:'credit',eventId});row.goods[item]-=quantity;row.coins+=cost;d.set(['state','player','coins'],coins-cost);changeItems(d,engine,'player',item,quantity);
                detail={item,quantity,paid:cost,fineness:c.fineness,polity:c.polity};
            }else{
                const paid=Math.floor(gross*(1-b.exchangeFeeRate));
                if(engine.quantity(d,'player',item)<quantity)throw Error(`你没有这么多${c.name}`);if(row.coins<paid)throw Error(`${b.name}现钱不足`);
                changeItems(d,engine,'player',item,-quantity);row.goods[item]=(row.goods[item]??0)+quantity;row.coins-=paid;
                moveCoins(d,{from:vault(b.id),to:purse(engine,'player'),amount:paid,writer:'credit',eventId});d.set(['state','player','coins'],coins+paid);detail={item,quantity,received:paid,fineness:c.fineness,polity:c.polity};
            }
        }
        d.set(rec(b.id),row);engine.advance(d,5,eventId);
        return {bank:b.id,keeper,balance:row.accounts.player??0,...detail};
    }
    if(op==='work'){
        const minutes=int(args.minutes??240,30,480,'工时'),employer=counterpart(d,engine,args.seller,{consent:args.consent,minutes});
        const [low,high]=engine.rules.economy.wageCopperPerHalfDay,min=Math.max(1,Math.ceil(low*minutes/240)),max=Math.max(1,Math.ceil(high*minutes/240));
        const wage=int(args.coins??min,min,max,'工钱'),boss=engine.actor(d,employer);
        if(boss.coins<wage)throw Error('雇主现钱不足以支付工钱');
        const skills=engine.byId.get(employer)?.skills,skill=(Array.isArray(skills)?skills:Object.keys(skills??{})).find(s=>String(s).startsWith('skill_'))??null;
        const id=`contract_work_${eventId}`,location=d.get('state','location');if(d.get(...rec(id)))throw Error('雇佣契约编号已存在');
        moveCoins(d,{from:purse(engine,employer),to:escrowAccount(id),amount:wage,writer:'credit',eventId});d.set([...engine.actorPath(employer),'coins'],boss.coins-wage);
        const terms={parties:['player',employer],minutes,wage,skill,location};
        d.set(rec(id),{category:'contract',kind:'employment',name:`受雇于${nameOf(engine,employer)}`,...terms,escrow:wage,status:'履行中',createdAt:d.get('state','minute'),source:eventId,signedTerms:structuredClone(terms)});
        advanceWithNpcParticipants(d,engine,minutes,eventId,[employer]);
        const finished=d.get('state','location')===location&&d.get('state','player','status')==='正常';
        const row=d.get(...rec(id));
        if(!finished){moveCoins(d,{from:escrowAccount(id),to:purse(engine,employer),amount:wage,writer:'credit',eventId});d.set([...engine.actorPath(employer),'coins'],engine.actor(d,employer).coins+wage);d.set(rec(id),{...row,escrow:0,status:'中止',endedAt:d.get('state','minute')});return {contract:id,employer,status:'中止'};}
        moveCoins(d,{from:escrowAccount(id),to:purse(engine,'player'),amount:wage,writer:'credit',eventId});d.set(['state','player','coins'],d.get('state','player','coins')+wage);
        d.set(rec(id),{...row,escrow:0,paid:wage,status:'已完成',endedAt:d.get('state','minute')});
        const practiced=skill&&d.get('state','skills',skill)?engine.practice(d,{skill,gain:Math.max(1,Math.floor(minutes/80)),target:`受雇:${employer}`},eventId):null;
        d.say(`为${nameOf(engine,employer)}做工${minutes}分钟，得工钱${wage}铜`);
        return {contract:id,employer,minutes,wage,status:'已完成',skill,skillGain:practiced?.gain??0};
    }
    if(op==='partner'){
        if(args.contract){
            const row=d.get(...rec(args.contract));
            if(row?.category!=='contract'||row.kind!=='partnership'||row.status!=='有效')throw Error('需要有效的合伙契约编号');
            counterpart(d,engine,row.partner,{consent:args.consent,minutes:5});
            const settled=settlePartnership(d,engine,row.id,row,{minute:d.get('state','minute'),eventId});
            const paid=settled.debt&&d.get('state','player','coins')>=settled.payout?repayCredit(d,engine,{seller:row.partner,debt:settled.debt},eventId):null;
            if(!paid)engine.advance(d,5,eventId);
            return {contract:row.id,status:settled.status,profit:settled.profit,payout:settled.payout,debt:settled.debt,paid:Boolean(paid)};
        }
        const shop=d.get(...rec(args.business));
        if(shop?.category!=='business'||shop.owner!=='player'||!['筹备','营业'].includes(shop.status))throw Error('合伙需要本人正在经营的店铺编号');
        if(shop.location!==d.get('state','location'))throw Error('须在铺面当面订立合伙');
        const partner=counterpart(d,engine,args.seller,{consent:args.consent,minutes:5}),p=rules(engine).partnership;
        const stake=int(args.coins,1,engine.actor(d,partner).coins,'合伙出资'),share=int(args.quantity,p.minimumShare,p.maximumShare,'分成百分比'),days=int(args.days??30,1,p.maximumDays,'合伙天数');
        const id=`contract_partner_${eventId}`;if(d.get(...rec(id)))throw Error('合伙契约编号已存在');
        const now=d.get('state','minute'),baselineNet=businessReport(d,engine,shop).profit.net;
        moveCoins(d,{from:purse(engine,partner),to:purse(engine,'player'),amount:stake,writer:'credit',eventId});d.set([...engine.actorPath(partner),'coins'],engine.actor(d,partner).coins-stake);d.set(['state','player','coins'],d.get('state','player','coins')+stake);
        const terms={parties:['player',partner],partner,business:shop.id,stake,share,deadline:now+days*1440};
        d.set(rec(id),{category:'contract',kind:'partnership',version:2,name:`与${nameOf(engine,partner)}合伙经营`,...terms,baselineNet,location:shop.location,status:'有效',createdAt:now,source:eventId,signedTerms:structuredClone(terms)});
        engine.advance(d,5,eventId);d.say(`${nameOf(engine,partner)}出资${stake}铜入伙，期满按${share}%分成并退股`);
        return {contract:id,partner,business:shop.id,stake,share,deadline:terms.deadline};
    }
    throw Error('未知契约操作');
}

// ---- time --------------------------------------------------------------------
export function advanceCredit(d,engine,minute){
    const c=creditRules(engine);if(!c)return;
    advanceBankFinance(d,engine,minute);
    advanceFinanceAssets(d,engine,minute);
    for(const [id,row]of Object.entries(d.get('state','records')??{}))
        if(row.category==='contract'&&row.kind==='partnership'&&row.status==='有效'&&row.deadline<=minute)settlePartnership(d,engine,id,row,{minute:row.deadline,eventId:`deadline_${id}`});
    for(const [id,row]of Object.entries(d.get('state','records')??{}))
        if(isCreditDebt(row)&&row.kind!=='pawn'&&row.status==='逾期'&&!row.defaulted&&(row.installmentOverdueAt??row.deadline)+(c.loan.defaultGraceMinutes??0)<=minute)defaultDebt(d,engine,id,row);
}
