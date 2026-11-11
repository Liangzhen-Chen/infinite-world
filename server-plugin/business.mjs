import {preconditionFailure} from './precondition.mjs';
import {contractTerms} from './contract-state.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {purse,escrow as escrowAccount,moveCoins,coinRead,dedicatedCoinAccount,dedicatedCoinKey,spendCounterCoins,mirrorPartyCoins,sink} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('business');
import {chargeTrade,repayDebt,createBusinessContract,finishBusinessContract,refundContractEscrow,releaseBusinessLease} from './contracts.mjs';
import {contractFreeze,claimCopper,REFERENCE} from './tender.mjs';
import {holdGoods,releaseGoods} from './goods-escrow.mjs';
import {claimUnit} from './claim-unit.mjs';
import {laborValue,subjectiveMarketQuote,saleableStock,marketQuote,quoteSupply,recordMarketDeal,customerReachMinutes,assertMarketDepth,upkeepDemand} from './market.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {residentSellers,settleSale,SALE_ORDER} from './market-seller.mjs';
import {openLoan} from './credit.mjs';
import {transferItems} from './items.mjs';
import {assertNpcService,scheduleAt,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {regionalTradeBase} from './settlement-trade.mjs';
import {wildlifePriceFactor} from './wildlife.mjs';
import {assessTradeTax,tradeTax,taxableSale} from './finance-tax.mjs';
import {recordFinanceSale} from './finance-assets.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {presentWitnesses} from './world-events.mjs';
import {currentShops} from './shop.mjs';
import {placeSettlement,personConstraint,personSimulation,personBusiness,personConstraints,personHousehold} from './entity-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {householdBudget,householdOptions,householdPoolTopUp} from './household-budget.mjs';
import {stateReader,valuation} from './valuation.mjs';
import {rollDice} from './scheduler.mjs';
import {actionCostRule} from './action-costs.mjs';
import {householdWorkTime} from './npc-state.mjs';
import {registerAutonomyProvider,registerAutonomyKind} from './autonomy-candidates.mjs';
import {recordsWhere,recordsMemo,stateMemo} from './storage.mjs';
import {toRational,fromRational} from './det-math.mjs';
declareHoldingWriter('business',{kinds:['operates','leases','employed_by']});

const path=id=>['state','records',id];
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}必须在${min}到${max}之间`);return n;};
const live=shop=>['筹备','营业'].includes(shop.status);
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
const quantities=bag=>Object.fromEntries(Object.entries(bag??{}).map(([item,row])=>[item,typeof row==='number'?row:row.quantity??0]));
const markupOf=shop=>typeof shop.markup==='number'?shop.markup:shop.markup?fromRational(shop.markup):1;
const assets=state=>({coins:state.player.coins,goods:quantities(state.inventory)});
const counterAssets=(state,business)=>{const row=dedicatedCoinAccount(state,'player','counter');return {...assets(state),coins:row&&(!business||row.business===business)?row.coins:0};};
function counterFor(d,shop,{spend=false}={}){
    const row=dedicatedCoinAccount(d.get('state'),shop.owner,'counter');
    if(!row||row.business!==shop.id)throw preconditionFailure('须先为本店开户并调拨柜台资金');
    if(spend&&aliveHoldings(d,{kind:'frozen',subject:row.account}).length)throw preconditionFailure('柜台资金已冻结，不能支用');
    return row;
}
function business(d,id){const shop=d.get(...path(id));if(shop?.category!=='business'||shop.owner!=='player')throw preconditionFailure('需要本人的真实店铺编号');return shop;}
function localBusiness(d,id){const shop=business(d,id);if(!live(shop))throw preconditionFailure(`店铺已${shop.status}`);if(shop.location!==d.get('state','location'))throw preconditionFailure('店主尚未到达铺面');return shop;}
function leaseFor(d,shop){const lease=contractTerms(d.get(...path(shop.lease))??{},d.get('state','minute'));if(lease?.kind!=='lease'||lease.status!=='有效'||lease.deadline<=d.get('state','minute'))throw preconditionFailure('店铺没有有效合法租赁');return lease;}
function party(d,engine,name,{consent=false,minutes=0,service=false}={}){
    const id=engine.resolve(name),row=engine.actor(d,id);
    if(id==='player'||!awake(row)||row.location!==d.get('state','location'))throw preconditionFailure('合同对方须实际在场且清醒');
    if(consent!==true)throw preconditionFailure('合同对方必须明确同意本次条款');
    engine.assertNpcObligationAction(d,['player',id],{minutes});engine.assertNpcAutonomyAction(d.get('state'),['player',id],{minutes});
    if(service)assertNpcService(d,engine,id,'trade',minutes);
    else for(let at=d.get('state','minute');at<d.get('state','minute')+Math.max(1,minutes);){
        const slot=scheduleAt(engine,id,at,d.get('state'));if(!slot)break;
        if(slot.location!==row.location||/睡眠|睡觉|熟睡/.test(slot.activity))throw preconditionFailure('对方作息没有清醒且在场的履约窗口');at=slot.until;
    }
    return id;
}
// S1a: 托管款转入将要订立的合同（contracts.createBusinessContract 的编号 contract_<kind>_<事件>）。
function hold(d,amount,contract,account=purse(null,'player')){
    if((d.get('ledger','accounts',account)??0)<amount)throw preconditionFailure('资金不足以托管');
    moveCoins(d,{from:account,to:escrowAccount(contract),amount,writer:'business'});
    if(account===purse(null,'player'))d.set(['state','player','coins'],d.get('state','player','coins')-amount);
}
// Tax/debt adapters currently accept a person's purse. Transfer only the exact
// settlement amount through that account in this transaction; its net is zero.
function fundSettlement(d,e,shop,amount,eventId){
    const counter=counterFor(d,shop,{spend:amount>0});
    if(counter.seat!==d.get('state','location'))throw preconditionFailure('柜台现金不在此处，不能远程支用');
    if(counter.coins<amount)throw preconditionFailure('柜台资金不足以清偿');
    moveCoins(d,{from:counter.account,to:purse(e,shop.owner),amount,writer:'business',eventId});
    mirrorPartyCoins(d,e,shop.owner,amount,eventId,'business');
}
function quote(d,engine,seller,buyer,item,quantity,unitPrice,shop){
    const location=d.get('state','location'),base=regionalTradeBase(d,engine,item,location)*wildlifePriceFactor(engine,d.document,item,location);
    const projected=marketQuote(d,engine,{seller,buyer,item,quantity,location,base,business:seller===shop.owner?{keeper:seller,markup:shop.markup??1}:null});
    const price=unitPrice===undefined?projected.listPrice:int(unitPrice,Math.ceil(projected.listPrice*.8),Math.ceil(projected.listPrice*1.5),'单价');
    const cost=unitPrice===undefined?projected.totalCoins:Math.trunc(price*quantity);
    const bill=Object.fromEntries(['day','place','goods','item','seller','buyer','business','side','quantity'].map(k=>[k,projected[k]]));
    return {price,cost,bill,key:`market:${item}:${d.get('state','minute')}`};
}
function workWindow(d,engine,worker,minutes){
    if(engine.byId.get(worker)?.tier!=='full'||engine.byId.get(worker)?.flags?.minor||engine.byId.get(worker)?.age<18)throw preconditionFailure('雇工须为现有成年完整人物');
    for(let at=d.get('state','minute');at<d.get('state','minute')+minutes;){
        const slot=scheduleAt(engine,worker,at,d.get('state'));
        if(!slot||slot.production===false||slot.location!==d.get('state','location')||slot.services.length||!/休息|歇|闲|散步|聊天/.test(slot.activity)||/睡眠|睡觉|熟睡/.test(slot.activity))throw preconditionFailure('雇工没有完整空档，不得占用原工作或休息睡眠');
        at=slot.until;
    }
}
function endShop(d,engine,shop,status,eventId,reason){
    return changeLegacyHoldings(d,engine,{holder:shop.owner,subject:shop.id,kinds:['operates'],eventId},()=>{
    const lease=contractTerms(d.get(...path(shop.lease))??{},d.get('state','minute'));
    if(lease?.status==='有效')releaseBusinessLease(d,engine,lease,{source:eventId});
    for(const row of Object.values(d.get('state','records')??{}))if(row.category==='contract'&&row.version===1&&row.business===shop.id&&row.status==='待履行'){
        finishBusinessContract(d,refundContractEscrow(d,row),{status:'已取消',reason,by:'player',source:eventId});
    }
    holdingSet(d,null,path(shop.id),{...shop,status,reason,endedAt:d.get('state','minute'),endSource:eventId},'business');
    });
}

export async function businessTrade(d,args,eventId){
    const operation=args.operation;
    if(operation==='lease'){
        if(Object.values(d.get('state','records')??{}).some(row=>row.category==='business'&&live(row)))throw preconditionFailure('须先结束已有店铺，行囊与现金不能同时计入两店');
        const location=this.resolve(args.location??d.get('state','location'));
        const building=d.get('state','buildings',location),definition=this.byId.get(location);
        const seller=party(d,this,args.seller,{consent:args.consent,minutes:5,service:true});
        if(location!==d.get('state','location')||!location.startsWith('bld_')||!building||building.owner!==seller||building.condition<=0)throw preconditionFailure('出租者没有该处合法且可用的铺面');
        if(definition?.access?.mode==='private')throw preconditionFailure('现有私宅不能作为公开营业铺面');
        if(Object.values(d.get('state','records')??{}).some(row=>row.kind==='lease'&&row.subject===location&&row.status==='有效'))throw preconditionFailure('铺面已出租');
        const days=int(args.days??1,1,30,'租赁天数'),economy=this.rules.economy;
        const anchor=days===7?economy.rentalCopperPerWeek:days*economy.rentalCopperPerNight;
        const key=`lease:${Math.floor(d.get('state','minute')/1440)}:${location}:${days}`;
        const cost=d.get('state','quotes',key)??int(args.coins??anchor,Math.ceil(anchor*.8),Math.ceil(anchor*1.5),'租金');
        const deposit=int(args.deposit??0,0,1e9,'押金'),shopId=`business_${eventId}`;
        if(d.get(...path(shopId)))throw preconditionFailure('店铺编号已存在');
        const opening={...assets(d.original?.state??d.get('state')),coins:0};
        // S5-F2: where the legal tender is not coin_river, rent and deposit freeze together as one resource in whole units (contractFreeze = tender.contractTerms per field).
        const freeze=contractFreeze(d,this,{location,coppers:{cost,deposit}}),unit=freeze&&{resource:freeze.resource,resourceName:freeze.resourceName,referenceCopper:freeze.referenceCopper};
        if(freeze)holdGoods(d,this,{contract:`contract_lease_${eventId}`,payer:'player',resource:freeze.resource,amount:freeze.amounts.deposit,writer:'business',eventId});
        else hold(d,deposit,`contract_lease_${eventId}`);
        const payment=chargeTrade(d,this,{buyer:'player',seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:'铺面租金',...(freeze?{terms:{resource:freeze.resource,amount:freeze.amounts.cost},payCurrency:args.payCurrency}:{})},eventId);
        const owed=freeze?freeze.amounts.cost:cost,held=freeze?freeze.amounts.deposit:deposit;
        const row=createBusinessContract(d,{kind:'lease',parties:['player',seller],subject:location,quantity:days,
            deadline:d.get('state','minute')+days*1440,business:shopId,cost:owed,escrow:held,quote:key,...unit,...(payment.debt?{debt:payment.debt}:{})},eventId);
        const lease={...row,status:'有效',paid:payment.debt?0:owed,fulfilled:days};holdingSet(d,null,path(row.id),lease,'business');
        holdingSet(d,null,path(shopId),{id:shopId,category:'business',owner:'player',location,lease:row.id,status:'筹备',createdAt:d.get('state','minute'),source:eventId,
            opening,openingSource:{event:eventId,kind:'期初已有现金和行囊；制作者未知的旧物不补造来源'}},'business');
        d.set(['state','quotes',key],cost);this.advance(d,5,eventId);
        return {business:shopId,contract:row.id,cost:owed,deposit:held,...(unit?{resource:unit.resource,resourceName:unit.resourceName,referenceCopper:unit.referenceCopper}:{}),...payment};
    }
    const shop=operation==='sell'?localBusiness(d,args.business):business(d,args.business);
    if(operation!=='pay'){
        if(!live(shop))throw preconditionFailure(`店铺已${shop.status}`);
        leaseFor(d,shop);
    }
    if(operation==='procure'||operation==='hire'){
        const minutes=operation==='hire'?int(args.minutes??30,1,240,'工作时长'):5;
        const seller=party(d,this,args.seller,{consent:args.consent,minutes,service:operation==='procure'});
        // Credit is a loan from the counterparty under its own terms (credit.mjs), never an unagreed deferral.
        if(args.payment&&!['cash','credit'].includes(args.payment))throw preconditionFailure('采购与雇工按现金托管，或经对方同意改为向其借款（payment=credit）');
        const deadline=int(args.deadline??d.get('state','minute')+1440,d.get('state','minute')+minutes+1,d.get('state','minute')+30*1440,'合同到期时间');
        const item=this.resolve(args.item,'item'),quantity=int(args.quantity,1,100000,'标的数量');
        let cost,terms;
        if(operation==='procure'){
            if(saleableStock(d,this,seller,item).available<quantity)throw preconditionFailure('供货者当前可售库存不足；自用与已承诺订单不能重复出售');
            const q=quote(d,this,seller,'player',item,quantity,args.unitPrice,shop);cost=q.cost;terms={unitPrice:q.price,quote:q.key,marketBill:q.bill};
        }else{
            if(args.task!=='stocktake')throw preconditionFailure('雇工工作须为可核验的 stocktake 库存盘点');
            workWindow(d,this,seller,minutes);
            if(this.quantity(d,'player',item)<quantity)throw preconditionFailure('没有已到货库存可盘点');
            const daily=laborValue(this,d.document,{worker:seller,observer:'player'}).daily;
            const minimum=Math.max(1,Math.ceil(daily*minutes/480));
            const [low,high]=this.rules.economy.wageCopperPerHalfDay;
            cost=int(args.coins??minimum,minimum,Math.max(minimum,Math.ceil(daily*high/low*minutes/480)),'报酬');
            terms={minutes,task:'stocktake'};
        }
        const contractId=`contract_${operation==='hire'?'hire':'procurement'}_${eventId}`;
        // S5-F2: in a place whose legal tender is not coin_river the fee/price freezes as that resource in whole units (the reference bill stays only as record).
        const freeze=contractFreeze(d,this,{location:d.get('state','location'),coppers:{cost}}),owed=freeze?freeze.amounts.cost:cost;
        const unit=freeze&&{resource:freeze.resource,resourceName:freeze.resourceName,referenceCopper:{cost,...(terms.unitPrice!==undefined?{unitPrice:terms.unitPrice}:{})}};
        if(freeze&&terms.unitPrice!==undefined){terms={...terms};delete terms.unitPrice;}
        const loan=args.payment==='credit'?openLoan(d,this,{lender:seller,principal:owed,days:Math.max(1,Math.ceil((args.creditMinutes??7*1440)/1440)),eventId,
            purpose:`${operation==='hire'?'雇工报酬':'货款'}向${this.byId.get(seller)?.name}借款`,toPlayer:false,escrowTo:escrowAccount(contractId),
            ...(freeze?{frozen:{resource:freeze.resource,resourceName:freeze.resourceName,referenceCopper:cost,escrowContract:contractId}}:{})}):null;
        let fundingAccount;
        if(freeze){
            // In kind the owner hands the resource over personally; the counter holds coins only.
            counterFor(d,shop);fundingAccount=purse(this,'player');
            if(!loan)holdGoods(d,this,{contract:contractId,payer:'player',resource:freeze.resource,amount:owed,writer:'business',eventId});
        }else{
            const counter=counterFor(d,shop),atCounter=counter.seat===d.get('state','location');
            // An owner carrying stock off-site may personally advance the expense.
            // That is a real purse -> escrow payment, never remote counter access.
            fundingAccount=atCounter?counterFor(d,shop,{spend:!loan}).account:purse(this,'player');
            if(!loan)hold(d,cost,contractId,fundingAccount);
        }
        const row=createBusinessContract(d,{kind:operation==='hire'?'hire':'procurement',parties:['player',seller],subject:item,quantity,deadline,business:shop.id,cost:owed,escrow:owed,fundingAccount,location:d.get('state','location'),consentEvent:eventId,...terms,...unit,...(loan?{loan:loan.debt}:{})},eventId);
        return {business:shop.id,contract:row.id,cost:owed,escrow:owed,status:row.status,...(unit?{resource:unit.resource,resourceName:unit.resourceName,referenceCopper:cost}:{}),...(loan?{debt:loan.debt,loanAmount:loan.amount,loanDeadline:loan.deadline}:{})};
    }
    if(operation==='sell'){
        if(shop.suspended)throw preconditionFailure('店铺暂闭，须先恢复营业');
        if(shop.status!=='营业')throw preconditionFailure('店铺未营业');
        if(args.payment&&args.payment!=='cash')throw preconditionFailure('顾客须用现有现金成交，不能自动赊购');
        const buyer=party(d,this,args.buyer,{consent:args.consent,minutes:5});
        const item=this.resolve(args.item,'item'),quantity=int(args.quantity,1,100000,'售出数量');
        if(this.quantity(d,'player',item)<quantity)throw preconditionFailure('店铺现有库存不足');
        const q=quote(d,this,'player',buyer,item,quantity,args.unitPrice,shop),cost=q.cost;
        const budget=householdBudget(d,this,buyer);
        const capacity=Math.max(0,Math.min(budget.cash,...budget.timeline.map(r=>r.balance))-(this.byId.get(item)?.nutrition?0:budget.resources.market.spent));
        if(cost>capacity||!householdOptions(budget,{item,quantity,totalCoins:cost}).find(o=>o.operation==='buy').feasible)throw preconditionFailure(`顾客家庭当前采购预算不足：可付${capacity}铜`);
        householdPoolTopUp(d,this,buyer,cost,eventId);
        const incomeBefore=this.actor(d,buyer).coins;
        const counter=counterFor(d,shop);
        if(this.actor(d,buyer).coins<cost)throw preconditionFailure('买方余额不足');
        // 零售成交的账只走 market-seller.settleSale（手动售出与客流同一处）；这里只给出玩家店的付款（进柜台、商税划给聚落）与应税判定。
        const {moved}=settleSale(d,this,{seller:'player',buyer,item,quantity,cost,bill:q.bill,eventId,location:shop.location,writer:'business',instances:args.instances??null,order:SALE_ORDER.counter,
            pay:()=>{
                moveCoins(d,{from:purse(this,buyer),to:counter.account,amount:cost,writer:'business',eventId});
                mirrorPartyCoins(d,this,buyer,-cost,eventId,'business');
                fundSettlement(d,this,shop,Math.floor(cost*tradeTax(this,d.get('state'),shop.location).bps/10000),eventId);
            },
            tax:()=>assessTradeTax(d,this,{seller:'player',cost,location:shop.location,sourceEvent:eventId}).amount});
        const row=createBusinessContract(d,{kind:'sale',parties:['player',buyer],subject:item,quantity,deadline:d.get('state','minute')+5,business:shop.id,cost,unitPrice:q.price,quote:q.key,consentEvent:eventId,customerCashBefore:incomeBefore,customerBudget:capacity},eventId);
        finishBusinessContract(d,row,{status:'已完成',fulfilled:quantity,paid:cost,source:eventId});this.advance(d,5,eventId);
        return {business:shop.id,contract:row.id,buyer,seller:'player',item,quantity,cost,instances:moved.instances};
    }
    const row=contractTerms(d.get(...path(args.contract))??{},d.get('state','minute'));
    if(row?.category!=='contract'||row.version!==1||row.business!==shop.id)throw preconditionFailure('需要属于该店铺的合同编号');
    if(operation==='pay'){
        if(!row.debt)throw preconditionFailure('该合同没有待偿还欠款，托管款在履约时支付');
        const seller=this.resolve(args.seller);if(row.parties[1]!==seller)throw preconditionFailure('还款对象不是合同当事人');
        party(d,this,seller,{consent:true});
        const debt=d.get(...path(row.debt));
        if(debt?.status==='已还清')throw preconditionFailure('这笔欠款已经还清，不重复付款');
        // A debt frozen in a tender-unit resource is paid in kind from the owner's bag, never out of the coin counter.
        if(!(debt.resource&&debt.resource!==REFERENCE)&&counterFor(d,shop).seat===d.get('state','location'))fundSettlement(d,this,shop,debt.amount-debt.paid,eventId);
        return {business:shop.id,contract:row.id,...repayDebt(d,this,{buyer:'player',seller,debt:row.debt,payCurrency:args.payCurrency},eventId)};
    }
    if(!['fulfill','cancel'].includes(operation))throw preconditionFailure('未知经营交易操作');
    if(row.status!=='待履行')throw preconditionFailure(`合同已${row.status}，不能重复履行或退款`);
    if(operation==='cancel'){
        const next=finishBusinessContract(d,refundContractEscrow(d,row),{status:'已取消',reason:'店主取消',by:'player',source:eventId});
        return {business:shop.id,contract:row.id,status:next.status};
    }
    if(row.deadline<=d.get('state','minute'))throw preconditionFailure('合同已到期');
    if(row.location!==d.get('state','location'))throw preconditionFailure('须在合同约定的实际交付或工作地点履行');
    const seller=party(d,this,row.parties[1],{consent:true,minutes:row.minutes??5,service:row.kind==='procurement'});
    if(args.seller&&this.resolve(args.seller)!==seller)throw preconditionFailure('履约对象与合同当事人不一致');
    if(row.escrow!==row.cost)throw preconditionFailure('约定报酬或货款尚未足额托管');
    if(d.get('state','minute')+(row.minutes??5)>row.deadline)throw preconditionFailure('剩余时间不足以履行');
    if(d.get('state','minute')+(row.minutes??5)>leaseFor(d,shop).deadline)throw preconditionFailure('铺面租期不足以完整履行');
    let moved={instances:[]},audit;
    if(row.kind==='procurement'){
        if(this.quantity(d,seller,row.subject)<row.quantity)throw preconditionFailure('供货库存不足，尚未到货不能完成');
        moved=transferItems(d,this,seller,'player',row.subject,row.quantity,args.instances??null);
    }else if(row.kind==='hire'){
        workWindow(d,this,seller,row.minutes);
        if(this.quantity(d,'player',row.subject)<row.quantity)throw preconditionFailure('约定库存尚未到货或已不足，不能完成盘点');
        audit={item:row.subject,quantity:this.quantity(d,'player',row.subject),worker:seller,start:d.get('state','minute')};
        holdingSet(d,null,path(row.id),{...row,status:'履行中'},'business');
        advanceWithNpcParticipants(d,this,row.minutes,eventId,[seller]);
        if(!awake(this.actor(d,seller))||this.actor(d,seller).location!==row.location){
            finishBusinessContract(d,refundContractEscrow(d,row),{status:'违约',reason:'工作期间雇工无法继续履行',by:seller,source:eventId});return {business:shop.id,contract:row.id,status:'违约'};
        }
        audit.finish=d.get('state','minute');
    }else throw preconditionFailure('此类合同不能用 fulfill 履行');
    if(row.resource&&row.resource!==REFERENCE)releaseGoods(d,this,{contract:row.id,to:seller,resource:row.resource,amount:row.escrow,writer:'business',eventId});
    else{moveCoins(d,{from:escrowAccount(row.id),to:purse(this,seller),amount:row.escrow,writer:'business',eventId});d.set([...this.actorPath(seller),'coins'],this.actor(d,seller).coins+row.escrow);}
    const next=finishBusinessContract(d,{...row,escrow:0,...(audit?{audit}:{})},{status:'已完成',fulfilled:row.quantity,paid:row.cost,source:eventId});
    if(row.kind==='procurement')recordMarketDeal(d,{...row.marketBill,day:Math.floor(d.get('state','minute')/1440)},row.referenceCopper?.cost??row.cost,row.quantity,eventId);
    if(row.kind==='procurement')this.advance(d,5,eventId);
    return {business:shop.id,contract:row.id,status:next.status,...(row.resource&&row.resource!==REFERENCE?{resource:row.resource,resourceName:row.resourceName,referenceCopper:row.referenceCopper?.cost}:{}),...(row.kind==='procurement'?{buyer:'player',seller,item:row.subject,quantity:row.quantity,cost:row.cost,instances:moved.instances}:{audit,cost:row.cost})};
}

// Receipts describe actual tool patches. All balances remain in player/NPC/escrow state.
export function recordBusinessReceipt(d,before,{tool,args,eventId,detail}){
    const shops=Object.values(d.get('state','records')??{}).filter(row=>row.category==='business'&&row.owner==='player'&&(live(row)||live(before.records?.[row.id]??{})||row.source===eventId));
    if(!shops.length)return;
    const start=counterAssets(before,shops[0].id),end=counterAssets(d.get('state'),shops[0].id),goods={};
    for(const item of new Set([...Object.keys(start.goods),...Object.keys(end.goods)])){
        const delta=(end.goods[item]??0)-(start.goods[item]??0);if(delta)goods[item]=delta;
    }
    let coins=end.coins-start.coins;
    // 居民上门买（advanceCustomerFlow）在时间推进里已各自开了经营回执；工具回执只记其余变化，不重复记同一笔现金与实物。
    for(const r of Object.values(d.get('state','records')??{}))if(r.category==='business_receipt'&&r.operation==='customer_sale'&&!before.records?.[r.id]){
        coins-=r.coins;
        for(const [item,n] of Object.entries(r.goods)){goods[item]=(goods[item]??0)-n;if(!goods[item])delete goods[item];}
    }
    const contracts=Object.values(d.get('state','records')??{}).filter(row=>row.category==='contract'&&row.version===1&&(row.performance?.some(p=>p.source===eventId)||row.source===eventId)).map(row=>row.id);
    if(coins||Object.keys(goods).length||contracts.length){
        const id=`business_receipt_${eventId}`;if(d.get(...path(id)))throw preconditionFailure('经营来源事件已登记，不能重复改账');
        const counterparties=Object.entries(d.get('state','npcs')??{}).flatMap(([actor,row])=>{
            const old=before.npcs?.[actor];if(!old)return[];
            const cash=row.coins-old.coins,items={},a=quantities(old.inventory),b=quantities(row.inventory);
            for(const item of new Set([...Object.keys(a),...Object.keys(b)])){const n=(b[item]??0)-(a[item]??0);if(n)items[item]=n;}
            return cash||Object.keys(items).length?[{actor,coins:cash,goods:items}]:[];
        });
        holdingSet(d,null,path(id),{id,category:'business_receipt',businesses:shops.map(s=>s.id),source:eventId,tool,operation:args.operation??args.payment??'trade',minute:d.get('state','minute'),coins,goods,contracts,counterparties,
            trade:detail.item&&detail.quantity&&detail.cost!==undefined?{buyer:detail.buyer,seller:detail.seller,item:detail.item,quantity:detail.quantity,cost:detail.referenceCopper??detail.cost}:null},'business');
    }
    for(const shop of shops)if(!live(shop)&&!shop.closing)holdingSet(d,null,path(shop.id),{...shop,closing:end,closingSource:eventId},'business');
}

export function businessReport(d,engine,shop){
    const receipts=Object.values(d.get('state','records')??{}).filter(row=>row.category==='business_receipt'&&row.businesses.includes(shop.id));
    const contracts=Object.values(d.get('state','records')??{}).filter(row=>row.category==='contract'&&row.version===1&&row.business===shop.id);
    const closing=shop.closing??counterAssets(d.get('state'),shop.id),cashSources=[{source:shop.source,kind:'期初',amount:shop.opening.coins},...receipts.filter(r=>r.coins).map(r=>({source:r.source,receipt:r.id,amount:r.coins,tool:r.tool,operation:r.operation}))];
    const goods={},lots=new Map();let stockCostOfSales=0;
    // 成本批次：期初库存和非交易入库没有成交记录可查，成本只能取目录基准价作“无记录时的参照”（历史成本，不随现价回改）；
    // 有成交记录的入库用实付价。这里是账面成本核算，不是现价/估值，故不走估值角色。
    for(const [item,quantity]of Object.entries(shop.opening.goods))lots.set(item,[{quantity,price:engine.byId.get(item)?.basePrice??0}]);
    for(const receipt of receipts)for(const [item,delta]of Object.entries(receipt.goods)){
        if(!goods[item])goods[item]={opening:shop.opening.goods[item]??0,sources:[]};
        goods[item].sources.push({source:receipt.source,receipt:receipt.id,quantity:delta,tool:receipt.tool,operation:receipt.operation});
        const stock=lots.get(item)??[];
        if(delta>0)stock.push({quantity:delta,price:receipt.trade?.buyer==='player'&&receipt.trade.item===item?receipt.trade.cost/receipt.trade.quantity:engine.byId.get(item)?.basePrice??0});
        else{
            let remaining=-delta,cost=0;
            while(remaining&&stock.length){const n=Math.min(remaining,stock[0].quantity);cost+=n*stock[0].price;stock[0].quantity-=n;remaining-=n;if(!stock[0].quantity)stock.shift();}
            if(['sell','customer_sale'].includes(receipt.operation))stockCostOfSales+=cost;
        }
        lots.set(item,stock);
    }
    for(const item of new Set([...Object.keys(shop.opening.goods),...Object.keys(closing.goods),...Object.keys(goods)])){
        const row=goods[item]??{opening:shop.opening.goods[item]??0,sources:[]};row.openingSource=shop.source;row.closing=closing.goods[item]??0;
        row.reconciled=row.opening+row.sources.reduce((sum,r)=>sum+r.quantity,0)===row.closing;goods[item]=row;
    }
    // 居民上门买（business.mjs 的 advanceCustomerFlow）没有合同行，成交记在经营回执里，与手动成交一并计入收入、销货成本与商税。
    const sales=contracts.filter(r=>r.kind==='sale'&&r.status==='已完成'),walkIns=receipts.filter(r=>r.operation==='customer_sale'),revenue=sales.reduce((sum,r)=>sum+r.paid,0)+walkIns.reduce((sum,r)=>sum+r.coins,0);
    // F025: the books are the shop's. Capital the owner puts in or draws out of the counter moves cash but is neither
    // revenue nor expense; wages are the owner's own hired hands at this shop; tax is only what its own sales incurred.
    const capital=receipts.reduce((n,r)=>n+(['business_counter_open','business_counter_fund','business_counter_spend'].includes(r.operation)?r.coins:0),0);
    // Contracts frozen in a tender-unit resource keep their reference-copper bill; the profit statement stays in one yardstick (reference copper).
    const bill=r=>r.referenceCopper?.cost??r.cost,rent=contracts.filter(r=>r.kind==='lease').reduce((sum,r)=>sum+bill(r),0),wages=contracts.filter(r=>r.kind==='hire'&&r.status==='已完成').reduce((sum,r)=>sum+(r.referenceCopper?.cost??r.paid),0)
        +Object.values(d.get('state','records')??{}).filter(r=>r.kind==='workshop'&&r.owner===shop.owner&&r.location===shop.location&&r.createdAt>=shop.createdAt&&r.createdAt<=(shop.endedAt??Infinity)).reduce((n,r)=>n+r.paid,0);
    const saleEvents=new Set([...sales,...walkIns].map(r=>r.source)),taxes=Object.values(d.get('state','records')??{}).filter(r=>r.category==='trade_tax'&&r.payer==='player'&&saleEvents.has(r.sourceEvent)).reduce((n,r)=>n+r.amount,0);
    const state=d.get('state'),claimIds=new Set(contracts.flatMap(c=>[c.debt,c.loan]).filter(Boolean)),debts=obligationRows(state).filter(r=>claimIds.has(r.id)||claimIds.has(r.legacyRecord))
        .map(r=>({id:r.legacyRecord??r.id,amount:obligationView(state,r).owed,status:state.records?.[r.legacyRecord]?.status??r.status,...(r.resource&&r.resource!==REFERENCE?{resource:r.resource}:{})}));
    return {business:shop.id,status:shop.status,suspended:Boolean(shop.suspended),lifecycle:businessLifecycle(engine,d.document,shop),period:{from:shop.createdAt,to:shop.endedAt??d.get('state','minute')},
        cash:{opening:shop.opening.coins,closing:closing.coins,net:closing.coins-shop.opening.coins,capital,sources:cashSources,reconciled:cashSources.reduce((sum,r)=>sum+r.amount,0)===closing.coins},goods,
        profit:{revenue,stockCostOfSales,rent,wages,taxes,net:revenue-stockCostOfSales-rent-wages-taxes,method:'已成交收入减先进先出销货成本、整期租金、已付工钱与实缴税；未售库存为资产，期初旧货按目录基价估值'},
        escrow:contracts.filter(r=>r.escrow).map(r=>({contract:r.id,amount:r.escrow,source:r.source,...(r.resource&&r.resource!==REFERENCE?{resource:r.resource}:{})})),debts,
        contracts:contracts.map(r=>({id:r.id,kind:r.kind,parties:r.parties,subject:r.subject,quantity:r.quantity,location:r.location??shop.location,deadline:r.deadline,paid:r.paid,fulfilled:r.fulfilled,status:r.status,source:r.source,performance:r.performance,breaches:r.breaches})),
        quoteAnchor:engine.rules.economy.dailyIncomeBySkillStage,note:'日收入表仅供报价参考；营业和等待不会生成钱或顾客交易。'};
}

// 05 §5.1 laborHours: draft animals (herds the owner holds whose species declares husbandry.labor {factor,hoursPerDay})
// work without being employed. A herd's daily minutes are its live head count x factor x hours x 60; a herd that has
// lost heads or changed hands is counted as it now stands, so disease, sale or death lower the capacity at once.
export function draftMinutes(engine,state,owner){
    let minutes=0;
    for(const herd of Object.values(state.records??{})){
        if(herd.category!=='husbandry'||herd.owner!==owner)continue;
        const labor=engine.byId.get(herd.species)?.husbandry?.labor;
        if(labor)minutes+=Math.floor(herd.count*labor.factor*labor.hoursPerDay*60);
    }
    return minutes;
}
// Signed receipts and payments are a timeline, never today's spendable cash.
export function cashFlowWindow({cash,from,until,receipts=[],payments=[]}){
    const incoming=receipts.filter(r=>r.at>=from&&r.at<=until),outgoing=payments.filter(r=>r.at>=from&&r.at<=until);
    const times=[...new Set([...incoming,...outgoing].map(r=>r.at))].sort((a,b)=>a-b);
    let balance=cash,shortfall=Math.max(0,-cash);
    const timeline=times.map(at=>{balance+=incoming.filter(r=>r.at===at).reduce((n,r)=>n+r.amount,0)-outgoing.filter(r=>r.at===at).reduce((n,r)=>n+r.amount,0);shortfall=Math.max(shortfall,-balance);return {at,balance,shortfall:Math.max(0,-balance)};});
    return {cash,timeline,shortfall,closing:balance};
}
// Only future avoidable costs belong in the operating comparison. Outstanding
// rent/wages/loans remain cash obligations even when the business is suspended.
export function operatingOptions({revenue,variableCost,switchCost=0,reopenCost=switchCost,suspended=false,cashFlow,attachmentPermille=0,noisePermille=0,terminal=false,evidenceSufficient=true,resumeAllowed=true}){
    const incremental=revenue-variableCost;
    const utility=incremental+Math.trunc((Math.abs(incremental)+switchCost)*attachmentPermille/1000)+Math.trunc(revenue*noisePermille/1000);
    const options=[{kind:suspended?'resume':'continue',incremental,utility:utility-(suspended?reopenCost:0),cashShortfall:cashFlow.shortfall,requiresFunding:cashFlow.shortfall>0,available:!suspended||resumeAllowed},
        {kind:'suspend',incremental:suspended?0:-switchCost,utility:suspended?0:-switchCost,outstandingCashShortfall:cashFlow.shortfall},
        {kind:'exit',incremental:-switchCost,utility:-switchCost,outstandingCashShortfall:cashFlow.shortfall}];
    if(terminal)return {incremental,cashFlow,options:[],preferred:null};
    const feasible=options.filter(o=>!o.requiresFunding&&o.available!==false);
    const preferred=!evidenceSufficient&&cashFlow.shortfall===0?(suspended?'suspend':'continue'):[...feasible].sort((a,b)=>b.utility-a.utility)[0].kind;
    return {incremental,cashFlow,options,preferred};
}
const businessPlanDays=e=>e.rules.businessLifecycle?.horizonDays??e.rules.calendar.daysPerMonth;
function nextBusinessResume(e,state,shop,at){
    const period=businessPlanDays(e)*1440,periodEnd=(Math.floor(at/period)+1)*period;
    const native=currentShops(e,state).find(r=>r.id===shop.id||r.keeper===shop.owner&&r.location===shop.location);
    const cycle=(native?.cycleDays??e.world.marketRules.personalReserveDays)*1440,phase=(native?.firstDay??0)*1440;
    const nextRestock=phase+(Math.floor((at-phase)/cycle)+1)*cycle;
    return Math.max(periodEnd,nextRestock);
}
const resumeDeadline=(e,state,shop)=>shop.resumeNotBefore??nextBusinessResume(e,state,shop,shop.suspendedAt??shop.createdAt??0);
function businessPreference(engine,document,owner){
    const rule=engine.rules.businessLifecycle;
    return document.state.npcs?.[owner]?.businessAttachmentPermille??(rollDice(document.randomSeed,'business:tail',owner,0,0,1000)<=(rule?.stubbornPermille??0)?rule.tailAttachmentPermille*(rollDice(document.randomSeed,'business:tail-sign',owner,0,0,2)===1?-1:1):
        rollDice(document.randomSeed,'business:attachment',owner,0,0,(rule?.attachmentMaxPermille??0)+1)-1);
}
// Exact empty-candidate cases from operatingOptions, using a superset of the
// observer's payable obligations. No receipts can create a cash deficit.
// Otherwise defer to the full subjective budget and comparison as before.
function businessMayChange(e,document,shop){
    const state=document.state,from=state.minute,period=businessPlanDays(e)*1440;
    if(shop.suspended)return from>=resumeDeadline(e,state,shop);
    const counter=dedicatedCoinAccount(state,shop.owner,'counter');
    const cash=counter?.business===shop.id?counter.coins:document.ledger?.accounts?.[purse(e,shop.owner)]??state.npcs?.[shop.owner]?.coins??0;
    if(!(cash>=0)||Object.values(state.obligations??{}).some(r=>(r.debtor??r.promisor)===shop.owner&&Number.isFinite(r.deadline)))return true;
    const historyFrom=Math.max(from-period,shop.createdAt??0);
    // Insufficient evidence + no cash shortfall always preserves the status quo.
    if(from-historyFrom<period)return false;
    // With no observed sales R=V=0. For attachment >= -1000permille,
    // trunc(switchCost*attachment/1000) >= -switchCost (the suspend utility).
    // Stable option ordering keeps 'continue' even on equality. Tail owners
    // below this bound still get the complete comparison every day.
    if(businessPreference(e,document,shop.owner)<-1000)return true;
    if(shop.native)return recordsWhere(state.records,'category','customer_flow').some(r=>r.shop===shop.id&&r.minute<=from&&r.minute>historyFrom&&r.visits.some(v=>v.outcome==='bought'));
    return recordsWhere(state.records,'category','business_receipt').some(r=>r.businesses?.includes(shop.id)&&r.trade?.seller===shop.owner&&r.minute<=from&&r.minute>historyFrom);
}
export function businessLifecycle(engine,document,shop,{view=subjectiveView(engine,document,shop.owner)}={}){
    const state=document.state,read=stateReader(state);
    const rule=engine.rules.businessLifecycle,days=businessPlanDays(engine),from=state.minute,periodMinutes=days*1440,until=from+periodMinutes;
    const periodFrom=Math.floor(from/periodMinutes)*periodMinutes,historyFrom=Math.max(from-periodMinutes,shop.createdAt??0),observedMinutes=Math.max(0,from-historyFrom),evidenceSufficient=observedMinutes>=periodMinutes;
    const budget=householdBudget(read,engine,shop.owner,{view});
    const counter=dedicatedCoinAccount(state,shop.owner,'counter');
    const cash=counter?.business===shop.id?counter.coins:shop.owner==='player'?0:budget.cash;
    const sales=recordsWhere(state.records,'category','business_receipt').filter(r=>r.businesses?.includes(shop.id)&&r.trade?.seller===shop.owner&&r.minute<=from&&r.minute>historyFrom);
    const sold={};if(!shop.native)for(const r of sales)sold[r.trade.item]=(sold[r.trade.item]??0)+r.trade.quantity;
    // Native shops already keep their actual visits, payments and quantities.
    // Reuse that history without creating synthetic invoices on a preview.
    if(shop.native)for(const row of recordsWhere(state.records,'category','customer_flow')){
        if(row.shop!==shop.id||row.minute>from||row.minute<=historyFrom)continue;
        for(const visit of row.visits)if(visit.outcome==='bought')sold[visit.item]=(sold[visit.item]??0)+visit.quantity;
    }
    const projected=[];let revenue=0,variableCost=0;
    for(const [item,n]of Object.entries(sold)){
        const expectedQuantity=observedMinutes?Math.floor(n*periodMinutes/observedMinutes):0;
        const quantity=Math.min(expectedQuantity,quantities(view.self.inventory)[item]??0);if(!quantity)continue;
        const sale=subjectiveMarketQuote(engine,document,view,{item,seller:shop.owner,quantity,business:{keeper:shop.owner,markup:markupOf(shop)}});
        const replacement=subjectiveMarketQuote(engine,document,view,{item,buyer:shop.owner,quantity});
        // Current recoverable stock is an opportunity cost, not its sunk invoice.
        const tax=Math.floor(sale.totalCoins*tradeTax(engine,state,shop.location).bps/10000);
        revenue+=sale.totalCoins;variableCost+=replacement.totalCoins+tax;
        projected.push({item,quantity,observedQuantity:n,expectedQuantity,revenue:sale.totalCoins,variableCost:replacement.totalCoins+tax,tax,knownFrom:sale.knownFrom});
    }
    const receipts=budget.future.filter(r=>r.resource===REFERENCE&&r.reliable),payments=budget.payments.filter(r=>r.resource===REFERENCE);
    const cashFlow=cashFlowWindow({cash,from,until,receipts,payments});
    const closeMinutes=engine.world.openActionRules.generic.transferMinutes,openMinutes=closeMinutes;
    const labor=laborValue(engine,document,{worker:shop.owner,observer:shop.owner,view}).daily;
    const closeCost=Math.ceil(labor*closeMinutes/480),reopenCost=Math.ceil(labor*openMinutes/480),switchCost=closeCost+reopenCost;
    const preference=businessPreference(engine,document,shop.owner);
    const noise=rollDice(document.randomSeed,'business:choice',`${shop.owner}:${shop.id}`,periodFrom,0,2*(rule?.noisePermille??0)+1)-1-(rule?.noisePermille??0);
    const resumeNotBefore=shop.suspended?resumeDeadline(engine,state,shop):null;
    const comparison=operatingOptions({revenue,variableCost,switchCost,reopenCost,suspended:shop.suspended,cashFlow,attachmentPermille:shop.owner==='player'?0:preference,noisePermille:shop.owner==='player'?0:noise,terminal:!live(shop),evidenceSufficient,resumeAllowed:resumeNotBefore===null||from>=resumeNotBefore});
    if(shop.owner==='player')for(const option of comparison.options){
        if(option.kind==='continue')continue;
        option.action=option.kind==='resume'?'core:settlement.business_open':'core:settlement.business_close';
        option.slots={business:shop.id,...(option.kind==='resume'?{}:{choice:option.kind})};
    }
    const property=valuation(read,engine,{role:'property',subject:shop.location,right:'leases',holder:shop.owner,contract:shop.lease});
    return {...comparison,horizon:{from,until,days,periodFrom,periodUntil:periodFrom+periodMinutes},history:{from:historyFrom,until:from,observedMinutes,requiredMinutes:periodMinutes,sufficient:evidenceSufficient,note:evidenceSufficient?'完整计划期观察':'依据不足：按已观察时长折算，正常情况下维持现状'},resumeNotBefore,conversion:{closeMinutes,openMinutes,closeCost,reopenCost,switchCost},projected,revenue,variableCost,switchCost,attachmentPermille:preference,noisePermille:noise,ownerCash:budget.cash,
        funding:cashFlow.shortfall?[{kind:'fund_counter',action:'business:fund_counter',available:budget.cash,required:cashFlow.shortfall},{kind:'loan',action:'core:trade.borrow',required:cashFlow.shortfall,requires:'真实出借人同意并交付；不自动授信'}]:[],
        propertyValue:property,transfer:{action:'core:settlement.business_close',slots:{business:shop.id,choice:'transfer'},requiredSlots:['member','coins'],requires:'产权人实际在场、同意并付款；全部现有库存随经营权转移',cashAvailable:0},
        note:'历史租金、已付报酬与旧进货账面亏损不重复扣除；未清义务不会因暂闭或退出消失。'};
}
export function businessOptions(engine,document,owner){
    const view=subjectiveView(engine,document,owner),s=document.state,inventory=quantities(view.self.inventory);
    const cash=Object.entries(view.self.accounts??{}).filter(([key])=>key.endsWith('|counter')).reduce((n,[,r])=>n+r.balance,0);
    const sales=Object.values(s.records??{}).filter(r=>r.category==='business_receipt'&&r.trade?.seller===owner&&r.minute<=view.minute&&r.minute>view.minute-7*1440);
    const sold={};for(const r of sales)sold[r.trade.item]=(sold[r.trade.item]??0)+r.trade.quantity;
    const options=[];
    for(const item of new Set([...Object.keys(inventory),...Object.keys(sold)])){
        if((inventory[item]??0)>0){const quote=subjectiveMarketQuote(engine,document,view,{item,seller:owner,quantity:1});options.push({kind:'price',item,unitPrice:quote.listPrice,knownFrom:quote.knownFrom});}
        const needed=Math.max(0,(sold[item]??0)-(inventory[item]??0));
        for(const supplier of view.observable.people.filter(p=>p.id!==owner&&p.services.includes('trade'))){
            if(!needed)break;
            const quote=subjectiveMarketQuote(engine,document,view,{item,seller:supplier.id,buyer:owner,quantity:needed});
            if(quote.totalCoins<=cash)options.push({kind:'procure',seller:supplier.id,item,quantity:needed,estimatedCost:quote.totalCoins,knownFrom:quote.knownFrom});
        }
    }
    const requiredMinutes=Object.values(sold).reduce((n,q)=>n+q*engine.world.openActionRules.generic.transferMinutes,0);
    const jobs=Object.values(s.records??{}).filter(r=>r.kind==='workshop'&&r.owner===owner&&r.endedAt===undefined&&r.deadline>view.minute);
    const working=jobs.filter(r=>r.status!=='罢工'),capacityKnown=working.every(r=>Number.isSafeInteger(r.workMinutes));
    const capacity=working.reduce((n,r)=>n+(r.workMinutes??0),0)+draftMinutes(engine,s,owner);
    if(capacityKnown&&requiredMinutes>capacity)for(const worker of view.observable.people.filter(p=>p.id!==owner&&!jobs.some(r=>r.worker===p.id))){
        const wage=laborValue(engine,document,{worker:worker.id,observer:owner}).daily;
        if(wage<=cash)options.push({kind:'hire',worker:worker.id,wage,requiredMinutes:requiredMinutes-capacity});
    }
    if(capacityKnown&&capacity>requiredMinutes)for(const job of jobs)options.push({kind:'dismiss',contract:job.id,worker:job.worker,excessMinutes:capacity-requiredMinutes});
    const lifecycle=managedShops(engine,s).filter(r=>r.owner===owner).map(shop=>({business:shop.id,...businessLifecycle(engine,document,shop,{view})}));
    return {observer:owner,location:view.self.location,counterCash:cash,options,lifecycle};
}

// A native shop is already a legal operating business. Its first real state
// change materializes the same identity, never a second stock or money balance.
function managedShops(e,state){
    return recordsMemo(state,managedShops,()=>{
        const rows=recordsWhere(state.records,'category','business'),ids=new Set(rows.map(r=>r.id));
        return [...rows,...currentShops(e,state).filter(s=>!ids.has(s.id)&&!rows.some(r=>r.owner===s.keeper&&r.location===s.location)).map(s=>({id:s.id,category:'business',native:true,owner:s.keeper,location:s.location,status:'营业',markup:s.markup,openedAt:0}))];
    });
}
function hasManagedShops(e,state,who){
    if(recordsWhere(state.records,'category','business').some(r=>r.owner===who&&live(r)))return true;
    // A native shop's owner must be an open personBusiness. The same
    // catalogue/vocation gate used by personBusinesses rules out a person
    // with no possible trading service before deriving every shop in town.
    const base=state.created?.[who]??state.family?.people?.[who]??e.byId.get(who),actor=state.npcs?.[who]??state.creatures?.[who];
    if(!base||!actor||!actor.vocation&&!(base.services??[]).includes('trade')&&!(base.serviceCatalog??[]).some(s=>s.kind==='trade'))return false;
    const business=personBusiness(e,state,who,personConstraints(e,state));if(!business?.open.value)return false;
    // Being available for person-to-person trade alone does not create a
    // native shop. Untyped traders can only keep or succeed a registered store;
    // derivedShops requires a string shopType.
    if(typeof business.shopType.value!=='string'&&!(e.rules.economy?.shops?.stores??[]).some(store=>{
        if(store.keeper===who)return true;
        const original=e.byId.get(store.keeper),location=original?.workplace?.location??original?.location;
        return business.location.value===location&&(business.shopType.value===(store.shopType??original?.shopType)||store.channels.includes(business.shopType.value));
    }))return false;
    return managedShops(e,state).some(r=>r.owner===who&&live(r));
}
registerAutonomyProvider('business_lifecycle',{
    relevant:hasManagedShops,
    candidateRelevant(e,document,who,presence){
        if(!hasManagedShops(e,document.state,who))return false;
        return managedShops(e,document.state).some(r=>r.owner===who&&live(r)&&r.location===presence.location&&businessMayChange(e,document,r));
    },
    candidates(e,view,document){
        if(!hasManagedShops(e,document.state,view.observer))return [];
        return managedShops(e,document.state).filter(r=>r.owner===view.observer&&live(r)&&r.location===view.self.location).flatMap(shop=>{
            if(!businessMayChange(e,document,shop))return [];
            const w=businessLifecycle(e,document,shop,{view}),best=w.options.find(o=>o.kind===w.preferred);
            const current=w.options.find(o=>o.kind===(shop.suspended?'suspend':'continue'));
            if(!best||best.utility<=current.utility||best.kind==='continue'||best.kind==='exit')return [];
            if(best.kind==='resume'&&(!awake(document.state.npcs[shop.owner])||!Object.values(quantities(view.self.inventory)).some(n=>n>0)))return [];
            return [{id:`business:${shop.id}:${best.kind}`,kind:'business_lifecycle',legacy:{kind:'business_lifecycle',business:shop.id,choice:best.kind},cost:{},needSatisfaction:100,utility:best.utility-current.utility}];
        });
    }
});
registerAutonomyKind('business_lifecycle',{
    minutes:e=>e.world.openActionRules.generic.transferMinutes,
    validate(d,e,who,action,{at=d.get('state','minute'),actor}={}){
        const raw=d.get('state'),state={...raw,minute:at,npcs:actor?{...raw.npcs,[who]:actor}:raw.npcs},shop=managedShops(e,state).find(r=>r.id===action.business);
        if(!shop||shop.owner!==who||!live(shop)||shop.location!==state.npcs?.[who]?.location||!awake(state.npcs[who]))throw preconditionFailure('经营者不在可管理的商铺内');
        if(!['suspend','resume'].includes(action.choice)||Boolean(shop.suspended)===(action.choice==='suspend'))throw preconditionFailure('经营状态已经变化');
        const premise=state.buildings?.[shop.location],lease=contractTerms(state.records?.[shop.lease]??{},state.minute);
        const native=shop.native&&currentShops(e,state).some(r=>r.id===shop.id&&r.keeper===who&&r.location===shop.location);
        if(premise?.condition<=0||premise?.burning||(!native&&premise?.owner!==who&&(lease.status!=='有效'||lease.deadline<=state.minute)))throw preconditionFailure('经营者没有可用的合法场地');
        if(action.choice==='resume'&&(!Object.values(quantities(state.npcs[who].inventory)).some(n=>n>0)||!scheduleAt(e,who,state.minute,state)?.services?.includes('trade')))throw preconditionFailure('恢复经营须有库存和实际服务窗口');
        if(action.choice==='resume'&&at<resumeDeadline(e,state,shop))throw preconditionFailure('尚在最短暂停期内，须等下一计划期和补货周期再恢复');
    },
    execute(d,e,who,action,{actionId}){
        const state={...d.get('state'),minute:d.get('state','minute')},shop=managedShops(e,state).find(r=>r.id===action.business),w=businessLifecycle(e,{...d.document,state},shop);
        if(d.get('state','npcs',who,'businessAttachmentPermille')===undefined)d.set(['state','npcs',who,'businessAttachmentPermille'],w.attachmentPermille);
        const markup=markupOf(shop);
        holdingSet(d,null,path(shop.id),{...shop,markup:Number.isInteger(markup)?markup:toRational(markup),suspended:action.choice==='suspend',...(action.choice==='resume'?{openedAt:state.minute}:{suspendedAt:state.minute,resumeNotBefore:nextBusinessResume(e,state,shop,state.minute)}),lifecycleSource:actionId},'business',actionId);
        return {summary:`经营者${action.choice==='suspend'?'暂闭':'恢复'}商铺${shop.id}；未清义务保留。`};
    }
});

// 05 §5.1: a counter is funded by a real transfer, never by an opening balance snapshot.
function counterAction(d,e,args,eventId){
    const owner=args.owner??'player';
    if(owner!=='player')throw preconditionFailure('Counter requires its owner');
    if(args.operation==='business_counter_spend')return spendCounterCoins(d,e,{owner,actor:'player',to:args.to??'player',amount:args.coins,eventId});
    if(args.operation==='business_counter_fund'){
        const row=dedicatedCoinAccount(d.get('state'),owner,'counter'),amount=int(args.coins,1,1e9,'调拨资金');
        if(!row||row.seat!==d.get('state','location')||d.get('state','player','coins')<amount)throw preconditionFailure('须在本人柜台用钱袋现钱调拨');
        moveCoins(d,{from:purse(e,owner),to:row.account,amount,writer:'business',eventId});mirrorPartyCoins(d,e,owner,-amount,eventId,'business');
        return {account:row.account,amount};
    }
    const shop=localBusiness(d,args.business);leaseFor(d,shop);
    const source=args.sourceEvent??shop.source,lease=d.get(...path(shop.lease));
    if(source!==shop.source||lease.source!==source||lease.business!==shop.id||lease.parties?.[0]!==owner)throw preconditionFailure('Invalid counter opening source');
    if((args.purpose??'counter')!=='counter')throw preconditionFailure('Invalid counter purpose');
    const amount=int(args.coins??0,0,1e9,'开户资金');
    const previous=dedicatedCoinAccount(d.get('state'),owner,'counter');
    if(previous){
        const old=d.get(...path(previous.business));
        if(!old||live(old))throw preconditionFailure('Counter already exists');
        if(previous.coins!==0||(d.get('ledger','accounts',previous.account)??0)!==0)throw preconditionFailure('须先在旧柜台实际提清资金，才能为新店开户');
        if(aliveHoldings(d,{kind:'frozen',subject:previous.account}).length)throw preconditionFailure('旧柜台资金账户已冻结，不能重新开户');
    }
    if(d.get('state','player','coins')<amount)throw preconditionFailure('Insufficient counter opening funds');
    const account=`${owner}|coin_river|counter`;
    holdingSet(d,e,path(dedicatedCoinKey(owner,'counter')),{category:'money_account',owner,purpose:'counter',account,coins:0,seat:shop.location,business:shop.id,sourceEvent:source,openedBy:eventId},'business',eventId);
    moveCoins(d,{from:purse(e,owner),to:account,amount,writer:'business',eventId});
    d.set(['state','player','coins'],d.get('state','player','coins')-amount);
    return {account,owner,coins:amount,sourceEvent:source};
}
export function businessAction(d,args,eventId){
    if(['business_counter_open','business_counter_spend','business_counter_fund'].includes(args.operation))return counterAction(d,this,args,eventId);
    const shop=business(d,args.business);
    if(args.operation==='business_options')return {...businessOptions(this,d.document,shop.owner),actionScope:{kind:'instant'}};
    if(args.operation==='business_report')return businessReport(d,this,shop);
    if(args.operation==='business_bankrupt'&&shop.status==='停业'){
        if(shop.location!==d.get('state','location'))throw preconditionFailure('店主尚未到达铺面');
    }else localBusiness(d,shop.id);
    if(args.operation==='business_open'){
        leaseFor(d,shop);
        const building=d.get('state','buildings',shop.location);
        if(building?.condition<=0||building?.burning)throw preconditionFailure('铺面已不可用，须先修缮');
        if(!awake(d.get('state','player')))throw preconditionFailure('店主须清醒且能实际营业');
        counterFor(d,shop);
        if(!Object.values(quantities(d.get('state','inventory'))).some(q=>q>0))throw preconditionFailure('须有现有库存才能开店');
        if(shop.status==='营业'&&!shop.suspended)throw preconditionFailure('店铺已经营业');
        if(shop.suspended&&d.get('state','minute')<resumeDeadline(this,d.get('state'),shop))throw preconditionFailure('尚在最短暂停期内，须等下一计划期和补货周期再恢复');
        holdingSet(d,null,path(shop.id),{...shop,status:'营业',suspended:false,openedAt:d.get('state','minute')},'business');
        if(shop.suspended)this.advance(d,this.world.openActionRules.generic.transferMinutes,eventId);
        return {business:shop.id,status:d.get(...path(shop.id)).status};
    }
    if(!['business_close','business_bankrupt'].includes(args.operation))throw preconditionFailure('未知店铺操作');
    if(args.operation==='business_close'&&args.choice==='suspend'){
        leaseFor(d,shop);
        if(shop.suspended)throw preconditionFailure('店铺已经暂闭');
        holdingSet(d,null,path(shop.id),{...shop,suspended:true,suspendedAt:d.get('state','minute'),resumeNotBefore:nextBusinessResume(this,d.get('state'),shop,d.get('state','minute')),suspendSource:eventId},'business');
        this.advance(d,this.world.openActionRules.generic.transferMinutes,eventId);
        return {business:shop.id,status:d.get(...path(shop.id)).status,suspended:true,inventoryRetained:true,note:'暂闭保留经营权、租约、合同与未清义务；恢复须重新满足营业条件'};
    }
    if(args.operation==='business_close'&&args.choice==='transfer'){
        leaseFor(d,shop);
        if(!args.member)throw preconditionFailure('转让需要实际买方，不能将资产估值自动变成现钱');
        // The buyer's decision below supplies consent. A caller-filled boolean
        // cannot substitute for that decision through the action gateway.
        const buyer=party(d,this,args.member,{consent:true,minutes:5});
        if(d.get('state','buildings',shop.location)?.owner!==buyer)throw preconditionFailure('本次转让须由铺面产权人接手；其他买方须先另行取得合法场地');
        const cost=int(args.coins,1,1e9,'转让价款');
        if(this.actor(d,buyer).coins<cost)throw preconditionFailure('买方现钱不足，资产估值不能自动变现');
        const stock=quantities(d.get('state','inventory'));
        let value=0;for(const [item,quantity]of Object.entries(stock)){
            const q=valuation(d,this,{role:'goods',holder:'player',location:shop.location,item,quantity});
            if(q.value!==null)value+=q.value;
        }
        const decision=npcDecision(subjectiveView(this,d.document,buyer),{kind:'purchase',from:'player',cost:{coins:cost},reward:value,needSatisfaction:0});
        if(decision.outcome!=='agree')throw preconditionFailure(`买方未接受转让：${decision.reason}`);
        // Terminate the old lease and contracts normally; outstanding personal
        // debts do not move to the buyer. Cash and all shared stock move once.
        const nextId=`business_${eventId}`;
        if(d.get(...path(nextId)))throw preconditionFailure('接手经营编号已存在');
        endShop(d,this,shop,'已转让',eventId,'店主转让经营');
        moveCoins(d,{from:purse(this,buyer),to:purse(this,'player'),amount:cost,writer:'business',eventId});
        mirrorPartyCoins(d,this,buyer,-cost,eventId,'business');mirrorPartyCoins(d,this,'player',cost,eventId,'business');
        for(const [item,quantity]of Object.entries(stock))if(quantity>0)transferItems(d,this,'player',buyer,item,quantity);
        holdingSet(d,null,path(nextId),{id:nextId,category:'business',owner:buyer,location:shop.location,status:'营业',openedAt:d.get('state','minute'),createdAt:d.get('state','minute'),source:eventId,predecessor:shop.id,opening:{coins:0,goods:stock}},'business',eventId);
        holdingSet(d,null,path(shop.id),{...d.get(...path(shop.id)),successor:nextId,transferPrice:cost},'business',eventId);
        this.advance(d,5,eventId);
        return {business:shop.id,status:'已转让',successor:nextId,buyer,cost,inventoryRetained:false,goods:stock};
    }
    if(args.choice!==undefined&&!['exit','suspend','transfer'].includes(args.choice))throw preconditionFailure('经营选择须为 suspend、transfer 或 exit');
    const bankrupt=args.operation==='business_bankrupt';
    if(bankrupt){
        const contracts=Object.values(d.get('state','records')??{}).filter(r=>r.category==='contract'&&r.business===shop.id);
        const keys=new Set(contracts.flatMap(c=>[c.debt,c.loan]).filter(Boolean)),state=d.get('state');
        // Debts and deposits frozen in a tender-unit resource are compared with the counter's coins at today's reference value.
        const debt=obligationRows(state).filter(r=>keys.has(r.id)||keys.has(r.legacyRecord)).reduce((sum,r)=>sum+claimCopper(d,this,{resource:r.resource,amount:obligationView(state,r).owed,paid:0}),0);
        const refundable=contracts.reduce((sum,c)=>sum+claimCopper(d,this,{resource:c.resource,amount:c.escrow,paid:0}),0);
        if(debt<=(dedicatedCoinAccount(d.get('state'),'player','counter')?.coins??0)+refundable)throw preconditionFailure('现有现金和托管款足以偿债，不符合现金破产条件');
    }
    endShop(d,this,shop,bankrupt?'破产':'停业',eventId,bankrupt?'无力用现金偿还现有欠款，欠款保留':'店主主动停业');
    if(args.choice==='exit')this.advance(d,this.world.openActionRules.generic.transferMinutes,eventId);
    if(bankrupt)entityTransition(d,this,{id:`${eventId}:business-breach`,verb:'breach',actor:shop.id,location:shop.location,visibility:'public',witnesses:presentWitnesses(d.get('state'),shop.location),participants:[shop.owner],tags:['business'],summary:`${shop.id}无力偿还经营欠款，宣告破产；债务保留`});
    return {business:shop.id,status:bankrupt?'破产':'停业',inventoryRetained:true,note:'剩余实物保留，未偿欠款仍在原债务记录中。'};
}

// F026 客流（营业商铺迎居民上门，属经营域）：商铺营业时，附近真实居民按自己的需求、钱袋与路程决定要不要上门买。
// 不刷出凭空顾客：上门的是 state.npcs 里的居民，要的是他们自己缺的东西（口粮储备缺口、本行当缺的工具），
// Purchases use the household budget and actual round-trip reach.
// 买不买由 NPC 决策路径（npc-decision）当场判定，成交走与手动交易相同的报价、商税、账本与成交记录。
// 没有需求、没钱、太远、或决策不愿意的人不会出现在成交里（只有真正上门又没买的才留下“未购”记录）。
const DAY=1440,NOON=720;// 客流：每日正午
const quantities1=v=>typeof v==='number'?v:v?.quantity??0;
const SLEEPING=/睡眠|睡觉|熟睡/;
// 同一店同一日可有多个营业窗口各结算一次：记录键 customer_flow:店:日:当日分钟（结算时刻），正午也不例外，规则只一版。
const flowKey=(shop,day,t)=>["state","records",`customer_flow:${shop}:${day}:${t-day*DAY}`];

// 本次营业的商铺：玩家已开张的店（店主在场、租约有效、柜台在铺内），以及作息里此刻接待交易的商铺。
function openShops(d,engine,t){
    const state=d.get('state'),out=[];
    for(const shop of Object.values(state.records??{})){
        if(shop.category!=='business'||shop.suspended||shop.status!=='营业'||(shop.openedAt??Infinity)>t)continue;
        if(state.buildings?.[shop.location]?.condition<=0||state.buildings?.[shop.location]?.burning)continue;
        if(shop.owner!=='player'){
            const npc=state.npcs?.[shop.owner],slot=npc&&scheduleAt(engine,shop.owner,t,state);
            const native=shop.native&&currentShops(engine,state).find(r=>r.id===shop.id&&r.keeper===shop.owner&&r.location===shop.location);
            const location=native?slot?.location:shop.location;
            if((!native&&state.buildings?.[shop.location]?.owner!==shop.owner)||!npc||!isEffective(engine,state,shop.owner)||['死亡','濒死','昏迷','患病'].includes(npc.status)||slot?.location!==location||npc.scheduleTravel||npc.cognitionTravel||!slot.services?.includes('trade'))continue;
            out.push({kind:'npc',id:shop.id,keeper:shop.owner,location,until:slot.until,settlement:placeSettlement(engine,state,location).value,markup:markupOf(shop),goods:native?native.restock.map(r=>r.item):Object.keys(quantities(npc.inventory))});continue;
        }
        if(shop.location!==state.location)continue;
        const lease=contractTerms(state.records?.[shop.lease]??{},t),counter=dedicatedCoinAccount(state,'player','counter');
        if(lease?.kind!=='lease'||lease.status!=='有效'||lease.deadline<=t||!counter||counter.business!==shop.id||counter.seat!==shop.location)continue;
        out.push({kind:'player',id:shop.id,keeper:'player',location:shop.location,until:lease.deadline,settlement:placeSettlement(engine,state,shop.location).value,markup:shop.markup??1,counter});
    }
    for(const shop of currentShops(engine,state)){
        if(recordsWhere(state.records,'category','business').some(row=>row.owner===shop.keeper&&row.location===shop.location))continue;
        if(out.some(row=>row.keeper===shop.keeper&&row.location===shop.location))continue;
        const keeper=state.npcs?.[shop.keeper],slot=keeper&&scheduleAt(engine,shop.keeper,t,state);
        if(!keeper||!isEffective(engine,state,shop.keeper)||['死亡','濒死','昏迷','患病'].includes(keeper.status)||!slot||keeper.scheduleTravel||keeper.cognitionTravel||!slot.services?.includes('trade'))continue;
        out.push({kind:'npc',id:shop.id,keeper:shop.keeper,location:slot.location,until:slot.until,settlement:placeSettlement(engine,state,slot.location).value,markup:shop.markup??1,goods:shop.restock.map(r=>r.item)});
    }
    // 居民卖方（有可售余量的居民）与店铺同走 serve：market-seller.residentSellers，已登记的店主不重复。
    const keepers=new Set([...currentShops(engine,state).map(s=>s.keeper),...recordsWhere(state.records,'category','business').map(r=>r.owner)]);// 店主不论此刻开不开门，都不以居民身份卖店里的货
    return [...out,...residentSellers(d,engine,t,keepers)].sort((a,b)=>a.id.localeCompare(b.id));
}
const shelfOf=(d,engine,shop)=>shop.kind==='player'
    ?Object.entries(d.get('state','inventory')??{}).filter(([item,v])=>quantities1(v)>0&&engine.byId.get(item)?.basePrice).map(([item])=>item)
    :shop.kind==='resident'?shop.goods.filter(item=>saleableStock(d,engine,shop.keeper,item).available>=1)
    :shop.goods.filter(item=>engine.quantity(d,shop.keeper,item)>0);

// 居民此刻想买的：口粮与饮水按户预算的购买计划（household-budget 的 market.purchases，每铜有效覆盖次序）取这件货的份数，
// 与预算同一口径，不再逐件独立折算；本行当要用而手边没有完好的工具买一件。
// 计划只认得它读到的来源（NPC 店铺货架、有交易服务的人）；计划之外的货架（玩家自己的店）没有来源条目，按这户的储备缺口折成份数。
// 未能并入同一次序的阻碍：来源由 shop.mjs:323-396 的 registerHouseholdFoodSources 按 currentShops（NPC 店，shop.mjs 的店铺清单）生成；
// 跟进卡 WATER-1C：玩家柜台以注入方式登记为家户食物来源，并入单一购买次序。
// 玩家店只在 business.mjs 的 openShops（本文件 :655-670，按租约柜台与 state.inventory 现算）里存在，shop.mjs 不能反向 import business（环），
// 且玩家店的报价要走柜台、商税与主观报价，household-budget 的来源需要 unitPrice/at/quantity 的预算口径，没有现成读法。
// 实测（探针取证）：serve 里 NPC 顾客读到的是主观预算，主观来源只含本人店（shop.mjs:346 view&&shop.keeper!==owner，已批准的知识规则），
// 所以真实客流里原生店也不在计划来源里，成交实际全走下面的储备缺口路径；“同序”（所有货架共用预算购买次序）待 WATER-1C：让顾客在店内可观察该店货价，并连同玩家店、非原生店一并并入。
// 计划读取（read）与成交判定用同一份正午投影文档（居民正午位置、正午分钟）。判定只看“这家店是不是计划的来源”（market.offered，来源编号）：
// 在则按 market.purchases 取这件货的份数（计划里没有就是 0），不在则按储备缺口折份数；不随前一件货的结局切换，也不按店型或编号特判。
// 不在计划来源里的店目前有玩家店与非原生 NPC 自营商户（openShops :658-665，开门条件在本文件，shop.mjs 不能反向 import 本文件，复制一份开门判定会造成两处口径）；
// 跟进卡 WATER-1C 覆盖玩家店与非原生自营商户，并入单一购买次序。
function wants(d,engine,id,item,gaps,t,shop,read){
    const def=engine.byId.get(item),state=d.get('state'),out={quantity:0,severity:0};
    if(def?.nutrition){
        if(!gaps.has(id))gaps.set(id,householdBudget(read,engine,id).resources);
        const plan=gaps.get(id);
        let units=0;
        if(plan.market.offered.includes(shop.id))units=plan.market.purchases.filter(p=>p.source===shop.id&&p.item===item&&p.at<=t+customerReachMinutes(engine)).reduce((n,p)=>n+p.quantity,0);
        else for(const need of ['satiety','hydration']){
            const gain=def.nutrition[need]??0;if(gain<=0||!(plan.procurementShortfall[need]>0))continue;
            units=Math.max(units,Math.ceil(plan.procurementShortfall[need]/gain));
        }
        if(units>out.quantity){out.quantity=units;out.severity=100;}
    }
    // 家户日用欠量（柴、盐……，market.upkeepDemand 读 F 卡的 householdUpkeepGap）也是要买的量。
    const upkeep=upkeepDemand(state,engine,id,item);
    if(upkeep>out.quantity){out.quantity=Math.ceil(upkeep);out.severity=Math.max(out.severity,80);}
    const trade=engine.world.recipes.filter(r=>r.tools?.includes(item)&&(r.teachers?.includes(id)||state.npcs[id]?.recipes?.[r.id]));
    if(trade.length&&(!engine.quantity(d,id,item)||(state.npcs[id]?.inventory?.[item]?.durability??1)<=0)&&out.quantity<1){out.quantity=1;out.severity=60;}
    return out;
}
function walkMinutes(engine,from,to,t,seed,cache){
    if(from===to)return {minutes:0,coins:0};
    const key=`${from}|${to}|${t}`;if(cache.has(key))return cache.get(key);
    let trip;try{const route=engine.route(from,to,'walk',t,seed);trip={minutes:route.minutes,coins:route.cost??0,edges:route.edges??[]};}catch{trip={minutes:Infinity,coins:0,edges:[]};}
    cache.set(key,trip);return trip;
}

function sell(d,engine,shop,buyer,item,quantity,t,quote,eventId){
    const state=d.get('state'),cost=quote.totalCoins,player=shop.kind==='player';
    // 零售成交的账只走 market-seller.settleSale（店铺、玩家店、居民卖方同一处）；玩家店只有付款（进柜台、商税先由柜台划到店主钱袋）与应税判定是它自己的。
    const {tax}=settleSale(d,engine,{seller:shop.keeper,buyer,item,quantity,cost,bill:quote,eventId,location:shop.location,writer:player?'business':'shop',order:player?SALE_ORDER.counter:SALE_ORDER.retail,
        ...(player?{
            pay:()=>{
                const counter=shop.counter;
                moveCoins(d,{from:purse(engine,buyer),to:counter.account,amount:cost,writer:'business',eventId});
                mirrorPartyCoins(d,engine,buyer,-cost,eventId,'business');
                const due=Math.floor(cost*tradeTax(engine,state,shop.location).bps/10000);
                if(due){moveCoins(d,{from:counter.account,to:purse(engine,'player'),amount:due,writer:'business',eventId});mirrorPartyCoins(d,engine,'player',due,eventId,'business');}
            },
            tax:()=>assessTradeTax(d,engine,{seller:'player',cost,location:shop.location,sourceEvent:eventId}).amount
        }:{})});
    if(shop.kind==='player'){
        // 与手动成交同口径的经营回执：现金、实物与成交，供店铺报表对账。
        holdingSet(d,null,path(`business_receipt_${eventId}`),{id:`business_receipt_${eventId}`,category:'business_receipt',businesses:[shop.id],source:eventId,tool:'customer_flow',operation:'customer_sale',minute:t,
            coins:cost,goods:{[item]:-quantity},contracts:[],counterparties:[{actor:buyer,coins:-cost,goods:{[item]:quantity}}],trade:{buyer,seller:'player',item,quantity,cost}},'business');
    }else if(d.get(...path(shop.id))?.category==='business'){
        holdingSet(d,null,path(`business_receipt_${eventId}`),{id:`business_receipt_${eventId}`,category:'business_receipt',businesses:[shop.id],source:eventId,tool:'customer_flow',operation:'customer_sale',minute:t,
            coins:cost,goods:{[item]:-quantity},contracts:[],counterparties:[{actor:buyer,coins:-cost,goods:{[item]:quantity}}],trade:{buyer,seller:shop.keeper,item,quantity,cost}},'business');
    }
    return {cost,tax};
}

// 当天正午可能上门的居民：活着、成年、有钱、清醒、没有义务冲突；他们的位置按作息在正午的安排。每天只算一次。
function walkIns(d,engine,t){
    const state=d.get('state'),out=[];
    for(const id of Object.keys(state.npcs??{}).sort()){
        const npc=state.npcs[id];
        // 只有有独立生活记录的完整人物自己上门；背景居民的吃用并在聚落账里（粮仓、周贸易），不单独采买。
        if(!npc||!personSimulation(engine,{},id).value||(npc.coins??0)<1||['死亡','濒死','昏迷','患病'].includes(npc.status)||state.player.companions?.includes(id))continue;// 路上与否按正午的作息算（slot），不看结算时刻的临时移动状态，使等待的切分不影响客流
        if((engine.byId.get(id)?.age??engine.rules.npcLife.adultAge)<engine.rules.npcLife.adultAge)continue;
        if(npc.scheduleTravel||npc.cognitionTravel||npc.caring||npc.levy||householdWorkTime(engine,state,id,t).unattended)continue;
        const slot=scheduleAt(engine,id,t,state);
        if(!slot||SLEEPING.test(slot.activity??'')||personConstraint(engine,state,id,t)||engine.npcObligationAt(state,id,t))continue;
        out.push({id,slot,settlement:placeSettlement(engine,state,slot.location).value});
    }
    return out;
}

function serve(d,engine,shop,t,residents,gaps,routes){
    const state=d.get('state'),day=Math.floor(t/DAY),reach=customerReachMinutes(engine),seed=d.get('randomSeed');
    if(d.get(...flowKey(shop.id,day,t)))return;
    const shelf=shelfOf(d,engine,shop);if(!shelf.length)return;
    const serviceMinutes=actionCostRule(engine,'trade.retail').timeMin;
    const visits=[],keeperHome=shop.kind==='resident'?new Set(personHousehold(engine,state,shop.keeper).value?.members??[]):null;// 居民卖方不向自己同户的人卖（同一灶，不是买卖）
    for(const {id,slot,settlement} of residents){
        const departAt=Math.max(t,routes.get(`customer-free:${id}`)??t);
        const outbound=walkMinutes(engine,slot.location,shop.location,departAt,seed,routes);
        if(id===shop.keeper||keeperHome?.has(id)||settlement!==shop.settlement||outbound.minutes>reach)continue;
        const inbound=walkMinutes(engine,shop.location,slot.location,departAt+outbound.minutes,seed,routes);
        const travelCoins=outbound.coins+inbound.coins;
        let travelled=false,atShop=departAt+outbound.minutes,tripRecord=null;
        for(const item of shelf){
            const serviceAt=Math.max(atShop,routes.get(`shop-free:${shop.id}`)??t),finishAt=serviceAt+serviceMinutes,returnAt=finishAt+inbound.minutes;
            if(returnAt>(slot.until??(day+1)*DAY)||finishAt>(shop.until??(day+1)*DAY))break;
            const duration=returnAt-(travelled?atShop:departAt);
            try{
                engine.assertNpcAutonomyAction(state,[id,shop.keeper],{start:departAt,minutes:returnAt-departAt});
                engine.assertNpcObligationAction(d,[id],{start:departAt,minutes:returnAt-departAt,location:slot.location,kind:'trade'});
                engine.assertNpcObligationAction(d,[shop.keeper],{start:serviceAt,minutes:serviceMinutes,location:shop.location,kind:'trade'});
            }catch(error){if(error.code==='E-ACTION-PRECONDITION')continue;throw error;}
            // Recompute the current household budget after every real purchase.
            const projected={...d.document,state:{...d.get('state'),minute:t,npcs:{...d.get('state','npcs'),[id]:{...d.get('state','npcs',id),location:slot.location,activity:slot.activity}}}};
            const read={document:projected,get:(...p)=>p.reduce((v,k)=>v?.[k],projected)};
            const want=wants(d,engine,id,item,gaps,t,shop,read);if(!want.quantity)continue;
            const view=subjectiveView(engine,projected,id);
            // 同一登记户共灶：预算按户池算一次（成员背包与钱袋并入，household-budget 唯一口径）；成交时钱袋不够的部分先在户内转账（householdPoolTopUp）。
            const budget=householdBudget(read,engine,id,{view});
            // Food buys replace the buffer with provisions. Other purchases
            // also leave the planned food money and known obligations intact.
            const floor=Math.min(budget.cash,...budget.timeline.map(r=>r.balance));
            const tripCost=travelled?0:travelCoins;
            const cap=Math.max(0,floor-tripCost-(engine.byId.get(item)?.nutrition?0:budget.resources.market.spent));
            if(cap<1)break;
            const available=saleableStock(d,engine,shop.keeper,item,{business:shop.kind!=='resident'}).available;
            let quantity=Math.min(want.quantity,available),quote=null;
            // No write happens inside this descent: supply and base are read once for all quantities tried.
            const business={keeper:shop.keeper,markup:shop.markup};let supply=null,baseValue=null;
            for(;quantity>0;quantity--){
                supply??=quoteSupply(d,engine,{item,location:shop.location,business});
                baseValue??=regionalTradeBase(d,engine,item,shop.location,t)*wildlifePriceFactor(engine,d.document,item,shop.location);
                const q=marketQuote(d,engine,{seller:shop.keeper,buyer:id,item,quantity,location:shop.location,minute:t,base:baseValue,business,supply});
                const option=householdOptions(budget,{item,quantity,totalCoins:q.totalCoins+tripCost}).find(o=>o.operation==='buy');
                if(q.totalCoins>=1&&q.totalCoins<=cap&&option.feasible){
                    try{assertMarketDepth(d,engine,q);}catch(error){if(error.code==='E-ACTION-PRECONDITION')continue;throw error;}
                    quote=q;break;
                }
            }
            if(!quote)continue;// 买不起哪怕一份：不上门
            // The decision uses the same noon facts as its stock and cash budget.
            const estimate=subjectiveMarketQuote(engine,projected,view,{item,seller:shop.keeper,buyer:id,quantity});
            const noise=engine.world.marketRules.customerChoice?.noisePermille??0;
            const draw=rollDice(seed,'market:purchase',`${id}:${shop.id}:${item}`,t,0,2*noise+1)-1-noise;
            // A payable without an appointment reserves money in the budget,
            // not every minute before its deadline in the service-conflict gate.
            const decisionView={...view,self:{...view.self,coins:Math.max(view.self.coins,budget.cash),obligations:view.self.obligations.filter(o=>o.resource!==REFERENCE||o.start!==undefined||o.terms?.service)}};
            const decision=npcDecision(decisionView,{kind:'purchase',from:shop.keeper,cost:{coins:quote.totalCoins+tripCost,minutes:duration},reward:Math.floor(estimate.explanation.value.value*quantity),needSatisfaction:Math.trunc(want.severity*(1000+draw)/1000)});
            if(decision.outcome!=='agree'){visits.push({npc:id,item,quantity,quoted:quote.totalCoins,outcome:decision.outcome,reason:decision.reason});if(decision.outcome==='defer')break;continue;}
            const eventId=`customer:${shop.id}:${t}:${id}:${item}`;
            householdPoolTopUp(d,engine,id,tripCost+quote.totalCoins,eventId);
            if(tripCost){moveCoins(d,{from:purse(engine,id),to:sink('export','travel'),amount:tripCost,writer:'shop',eventId:`${eventId}:travel`});mirrorPartyCoins(d,engine,id,-tripCost,eventId,'shop');}
            const result=sell(d,engine,shop,id,item,quantity,t,quote,eventId);
            for(const member of personHousehold(engine,d.get('state'),id).value?.members??[id])gaps.delete(member);// 买到了东西，户里的储备缺口要重算（同户成员共用一份户池预算，一并作废）
            visits.push({npc:id,item,quantity,paid:result.cost,tax:result.tax,outcome:'bought',sourceEvent:eventId,travel:{from:slot.location,to:shop.location,departAt,arriveAt:departAt+outbound.minutes,serviceAt,finishAt,returnAt,paid:tripCost},budget:{cash:budget.cash,maximum:cap,until:budget.until}});
            travelled=true;atShop=finishAt;
            routes.set(`customer-free:${id}`,returnAt);routes.set(`shop-free:${shop.id}`,finishAt);
            const key=`market_trip:${shop.id}:${t}:${id}`;
            tripRecord={id:key,category:'market_trip',actor:id,keeper:shop.keeper,from:slot.location,to:shop.location,
                departAt,arriveAt:departAt+outbound.minutes,finishAt,returnAt,outboundEdges:outbound.edges??[],inboundEdges:inbound.edges??[],
                serviceWindows:[...tripRecord?.serviceWindows??[],{start:serviceAt,end:finishAt}],paid:travelCoins,sourceEvent:eventId};
        }
        // One visit may buy several needed goods. Commit its full interval
        // after the basket, so an actor never conflicts with their own visit.
        if(tripRecord)holdingSet(d,null,path(tripRecord.id),tripRecord,'business');
    }
    if(visits.length)holdingSet(d,null,flowKey(shop.id,day,t),{category:'customer_flow',shop:shop.id,keeper:shop.keeper,day,minute:t,visits},'business');
}

// 营业窗口的结算时刻（EC-1b）：每个营业窗口各结算一次，而不是每天只在正午采样一次。
// 窗口 = 营业店主（店铺清单 currentShops 与非玩家经营记录的店主）作息里含 trade 服务的时段，一段一段枚举（scheduleAt 的 slot.until 接着往下走）。
// 窗口起点一律取窗口自己的起点分钟（含正午的窗口也不折成正午）；另外每日恒加正午一个结算时刻：玩家店没有作息窗口（按租约与在场判开门），只能在固定时刻采样，正午沿用此用途。
// 确定性：输入只有世界定义（作息）、当前状态与日历日，不含随机数与墙钟；返回升序去重的绝对分钟。缓存键 = [窗口符号, 日序]，按 state 对象（只读作用域内）
// 缓存依据（storage.mjs stateMemo）：只在 recordIndex 作用域内生效，按 state 对象身份分键，作用域外每次重算；与 scheduleAt/currentShops 的约定相同——作用域内不原地改写已暴露的 state，状态一变即换对象、缓存失效。
const windowMemo=Symbol('customer flow trade windows');
export function tradeWindowStarts(engine,state,day){
    return stateMemo(state,engine,[windowMemo,day],()=>{
        const keepers=new Set(currentShops(engine,state).map(s=>s.keeper));
        for(const r of recordsWhere(state.records,'category','business'))if(r.owner&&r.owner!=='player')keepers.add(r.owner);
        const starts=new Set(),noon=day*DAY+NOON;
        for(const id of [...keepers].sort()){
            for(let at=day*DAY,guard=0;at<(day+1)*DAY&&guard<48;guard++){
                const slot=scheduleAt(engine,id,at,state);
                if(!slot)break;
                const end=slot.until>at?slot.until:(day+1)*DAY;
                if(slot.services?.includes('trade'))starts.add(at);
                at=end;
            }
        }
        return [...starts].sort((a,b)=>a-b);
    });
}
// (before, after] 内全部客流结算时刻，升序：每日正午 ∪ 当日营业窗口起点。shop.mjs 用它定时钟边界与补货/客流的先后。
export function customerFlowTimes(engine,state,before,after){
    const times=[];
    for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
        for(const t of new Set([day*DAY+NOON,...tradeWindowStarts(engine,state,day)]))if(t>before&&t<=after&&t>=0)times.push(t);
    }
    return times.sort((a,b)=>a-b);
}
// 在 t 这一刻结算一次客流：此刻营业的店与卖方、此刻会上门的居民。
export function settleCustomerFlow(d,engine,t){
    const order=(purpose,id)=>rollDice(d.get('randomSeed'),`market:${purpose}`,id,t,0,4294967296);
    const shops=openShops(d,engine,t).sort((a,b)=>order('shop-order',a.id)-order('shop-order',b.id)||a.id.localeCompare(b.id));
    if(!shops.length)return;
    const residents=walkIns(d,engine,t).sort((a,b)=>order('customer-order',a.id)-order('customer-order',b.id)||a.id.localeCompare(b.id)),gaps=new Map(),routes=new Map();
    for(const shop of shops)serve(d,engine,shop,t,residents,gaps,routes);
}
// Settle consumers at every trade-window time in (before, after]; the registry splits the clock at these times (shop.mjs nextShopMinute).
export function advanceCustomerFlow(d,engine,before,after){
    for(const t of customerFlowTimes(engine,d.get('state'),before,after))settleCustomerFlow(d,engine,t);
}
