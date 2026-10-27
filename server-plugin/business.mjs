import {preconditionFailure} from './precondition.mjs';
import {contractTerms} from './contract-state.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {purse,escrow as escrowAccount,moveCoins,coinRead,dedicatedCoinAccount,dedicatedCoinKey,spendCounterCoins,mirrorPartyCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('business');
import {chargeTrade,repayDebt,createBusinessContract,finishBusinessContract,refundContractEscrow,releaseBusinessLease} from './contracts.mjs';
import {laborValue,subjectiveMarketQuote,saleableStock,marketQuote,recordMarketDeal} from './market.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {openLoan} from './credit.mjs';
import {transferItems} from './items.mjs';
import {assertNpcService,scheduleAt,advanceWithNpcParticipants} from './npc-schedule.mjs';
import {regionalTradeBase} from './settlement-trade.mjs';
import {wildlifePriceFactor} from './wildlife.mjs';
import {assessTradeTax,tradeTax} from './finance-tax.mjs';
import {recordFinanceSale} from './finance-assets.mjs';
import {declareHoldingWriter,holdingSet,aliveHoldings} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {presentWitnesses} from './world-events.mjs';
declareHoldingWriter('business',{kinds:['operates','leases','employed_by']});

const path=id=>['state','records',id];
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}必须在${min}到${max}之间`);return n;};
const live=shop=>['筹备','营业'].includes(shop.status);
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'')&&!n.scheduleTravel&&!n.cognitionTravel;
const quantities=bag=>Object.fromEntries(Object.entries(bag??{}).map(([item,row])=>[item,typeof row==='number'?row:row.quantity??0]));
const assets=state=>({coins:state.player.coins,goods:quantities(state.inventory)});
const counterAssets=state=>({...assets(state),coins:dedicatedCoinAccount(state,'player','counter')?.coins??0});
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
        hold(d,deposit,`contract_lease_${eventId}`);
        const payment=chargeTrade(d,this,{buyer:'player',seller,cost,payment:args.payment,creditMinutes:args.creditMinutes,description:'铺面租金'},eventId);
        const row=createBusinessContract(d,{kind:'lease',parties:['player',seller],subject:location,quantity:days,
            deadline:d.get('state','minute')+days*1440,business:shopId,cost,escrow:deposit,quote:key,...(payment.debt?{debt:payment.debt}:{})},eventId);
        const lease={...row,status:'有效',paid:payment.debt?0:cost,fulfilled:days};holdingSet(d,null,path(row.id),lease,'business');
        holdingSet(d,null,path(shopId),{id:shopId,category:'business',owner:'player',location,lease:row.id,status:'筹备',createdAt:d.get('state','minute'),source:eventId,
            opening,openingSource:{event:eventId,kind:'期初已有现金和行囊；制作者未知的旧物不补造来源'}},'business');
        d.set(['state','quotes',key],cost);this.advance(d,5,eventId);
        return {business:shopId,contract:row.id,cost,deposit,...payment};
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
        const loan=args.payment==='credit'?openLoan(d,this,{lender:seller,principal:cost,days:Math.max(1,Math.ceil((args.creditMinutes??7*1440)/1440)),eventId,
            purpose:`${operation==='hire'?'雇工报酬':'货款'}向${this.byId.get(seller)?.name}借款`,toPlayer:false,escrowTo:escrowAccount(`contract_${operation==='hire'?'hire':'procurement'}_${eventId}`)}):null;
        const counter=counterFor(d,shop),atCounter=counter.seat===d.get('state','location');
        // An owner carrying stock off-site may personally advance the expense.
        // That is a real purse -> escrow payment, never remote counter access.
        const fundingAccount=atCounter?counterFor(d,shop,{spend:!loan}).account:purse(this,'player');
        if(!loan)hold(d,cost,`contract_${operation==='hire'?'hire':'procurement'}_${eventId}`,fundingAccount);
        const row=createBusinessContract(d,{kind:operation==='hire'?'hire':'procurement',parties:['player',seller],subject:item,quantity,deadline,business:shop.id,cost,escrow:cost,fundingAccount,location:d.get('state','location'),consentEvent:eventId,...terms,...(loan?{loan:loan.debt}:{})},eventId);
        return {business:shop.id,contract:row.id,cost,escrow:cost,status:row.status,...(loan?{debt:loan.debt,loanAmount:loan.amount,loanDeadline:loan.deadline}:{})};
    }
    if(operation==='sell'){
        if(shop.status!=='营业')throw preconditionFailure('店铺未营业');
        if(args.payment&&args.payment!=='cash')throw preconditionFailure('顾客须用现有现金成交，不能自动赊购');
        const buyer=party(d,this,args.buyer,{consent:args.consent,minutes:5});
        const item=this.resolve(args.item,'item'),quantity=int(args.quantity,1,100000,'售出数量');
        if(this.quantity(d,'player',item)<quantity)throw preconditionFailure('店铺现有库存不足');
        const q=quote(d,this,'player',buyer,item,quantity,args.unitPrice,shop),cost=q.cost;
        const day=Math.floor(d.get('state','minute')/1440);
        const purchases=Object.values(d.get('state','records')??{}).filter(row=>row.kind==='sale'&&row.parties?.[1]===buyer&&Math.floor(row.createdAt/1440)===day);
        const capacity=purchases[0]?.customerBudget??Math.floor(coinRead(d,{point:'business.cash',account:purse(this,buyer),legacy:()=>this.actor(d,buyer).coins})/4);
        const spent=purchases.reduce((sum,row)=>sum+row.cost,0);
        if(spent+cost>capacity)throw preconditionFailure(`顾客当日店铺消费上限${capacity}铜，不无限消费`);
        const incomeBefore=this.actor(d,buyer).coins;
        const counter=counterFor(d,shop);
        if(this.actor(d,buyer).coins<cost)throw preconditionFailure('买方余额不足');
        moveCoins(d,{from:purse(this,buyer),to:counter.account,amount:cost,writer:'business',eventId});
        mirrorPartyCoins(d,this,buyer,-cost,eventId,'business');
        fundSettlement(d,this,shop,Math.floor(cost*tradeTax(this,d.get('state'),shop.location).bps/10000),eventId);
        const tax=assessTradeTax(d,this,{seller:'player',cost,location:shop.location,sourceEvent:eventId});
        const moved=transferItems(d,this,'player',buyer,item,quantity,args.instances??null);
        recordFinanceSale(d,this,{buyer,seller:'player',item,quantity,cost,tax:tax.amount,eventId});
        recordMarketDeal(d,q.bill,cost,quantity,eventId);
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
        if(counterFor(d,shop).seat===d.get('state','location'))fundSettlement(d,this,shop,debt.amount-debt.paid,eventId);
        return {business:shop.id,contract:row.id,...repayDebt(d,this,{buyer:'player',seller,debt:row.debt},eventId)};
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
    moveCoins(d,{from:escrowAccount(row.id),to:purse(this,seller),amount:row.escrow,writer:'business',eventId});d.set([...this.actorPath(seller),'coins'],this.actor(d,seller).coins+row.escrow);
    const next=finishBusinessContract(d,{...row,escrow:0,...(audit?{audit}:{})},{status:'已完成',fulfilled:row.quantity,paid:row.cost,source:eventId});
    if(row.kind==='procurement')recordMarketDeal(d,{...row.marketBill,day:Math.floor(d.get('state','minute')/1440)},row.cost,row.quantity,eventId);
    if(row.kind==='procurement')this.advance(d,5,eventId);
    return {business:shop.id,contract:row.id,status:next.status,...(row.kind==='procurement'?{buyer:'player',seller,item:row.subject,quantity:row.quantity,cost:row.cost,instances:moved.instances}:{audit,cost:row.cost})};
}

// Receipts describe actual tool patches. All balances remain in player/NPC/escrow state.
export function recordBusinessReceipt(d,before,{tool,args,eventId,detail}){
    const shops=Object.values(d.get('state','records')??{}).filter(row=>row.category==='business'&&(live(row)||live(before.records?.[row.id]??{})||row.source===eventId));
    if(!shops.length)return;
    const start=counterAssets(before),end=counterAssets(d.get('state')),goods={};
    for(const item of new Set([...Object.keys(start.goods),...Object.keys(end.goods)])){
        const delta=(end.goods[item]??0)-(start.goods[item]??0);if(delta)goods[item]=delta;
    }
    const coins=end.coins-start.coins;
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
            trade:detail.item&&detail.quantity&&detail.cost!==undefined?{buyer:detail.buyer,seller:detail.seller,item:detail.item,quantity:detail.quantity,cost:detail.cost}:null},'business');
    }
    for(const shop of shops)if(!live(shop)&&!shop.closing)holdingSet(d,null,path(shop.id),{...shop,closing:end,closingSource:eventId},'business');
}

export function businessReport(d,engine,shop){
    const receipts=Object.values(d.get('state','records')??{}).filter(row=>row.category==='business_receipt'&&row.businesses.includes(shop.id));
    const contracts=Object.values(d.get('state','records')??{}).filter(row=>row.category==='contract'&&row.version===1&&row.business===shop.id);
    const closing=shop.closing??counterAssets(d.get('state')),cashSources=[{source:shop.source,kind:'期初',amount:shop.opening.coins},...receipts.filter(r=>r.coins).map(r=>({source:r.source,receipt:r.id,amount:r.coins,tool:r.tool,operation:r.operation}))];
    const goods={},lots=new Map();let stockCostOfSales=0;
    for(const [item,quantity]of Object.entries(shop.opening.goods))lots.set(item,[{quantity,price:engine.byId.get(item)?.basePrice??0}]);
    for(const receipt of receipts)for(const [item,delta]of Object.entries(receipt.goods)){
        if(!goods[item])goods[item]={opening:shop.opening.goods[item]??0,sources:[]};
        goods[item].sources.push({source:receipt.source,receipt:receipt.id,quantity:delta,tool:receipt.tool,operation:receipt.operation});
        const stock=lots.get(item)??[];
        if(delta>0)stock.push({quantity:delta,price:receipt.trade?.buyer==='player'&&receipt.trade.item===item?receipt.trade.cost/receipt.trade.quantity:engine.byId.get(item)?.basePrice??0});
        else{
            let remaining=-delta,cost=0;
            while(remaining&&stock.length){const n=Math.min(remaining,stock[0].quantity);cost+=n*stock[0].price;stock[0].quantity-=n;remaining-=n;if(!stock[0].quantity)stock.shift();}
            if(receipt.operation==='sell')stockCostOfSales+=cost;
        }
        lots.set(item,stock);
    }
    for(const item of new Set([...Object.keys(shop.opening.goods),...Object.keys(closing.goods),...Object.keys(goods)])){
        const row=goods[item]??{opening:shop.opening.goods[item]??0,sources:[]};row.openingSource=shop.source;row.closing=closing.goods[item]??0;
        row.reconciled=row.opening+row.sources.reduce((sum,r)=>sum+r.quantity,0)===row.closing;goods[item]=row;
    }
    const revenue=contracts.filter(r=>r.kind==='sale'&&r.status==='已完成').reduce((sum,r)=>sum+r.paid,0);
    const rent=contracts.filter(r=>r.kind==='lease').reduce((sum,r)=>sum+r.cost,0),wages=contracts.filter(r=>r.kind==='hire'&&r.status==='已完成').reduce((sum,r)=>sum+r.paid,0)
        +Object.values(d.get('state','records')??{}).filter(r=>r.kind==='workshop'&&r.location===shop.location&&r.createdAt>=shop.createdAt).reduce((n,r)=>n+r.paid,0);
    const taxes=Object.values(d.get('state','records')??{}).filter(r=>r.category==='trade_tax'&&r.payer==='player'&&r.minute>=shop.createdAt&&r.minute<=(shop.endedAt??Infinity)).reduce((n,r)=>n+r.amount,0);
    const state=d.get('state'),claimIds=new Set(contracts.flatMap(c=>[c.debt,c.loan]).filter(Boolean)),debts=obligationRows(state).filter(r=>claimIds.has(r.id)||claimIds.has(r.legacyRecord))
        .map(r=>({id:r.legacyRecord??r.id,amount:obligationView(state,r).owed,status:state.records?.[r.legacyRecord]?.status??r.status}));
    return {business:shop.id,status:shop.status,period:{from:shop.createdAt,to:shop.endedAt??d.get('state','minute')},
        cash:{opening:shop.opening.coins,closing:closing.coins,net:closing.coins-shop.opening.coins,sources:cashSources,reconciled:cashSources.reduce((sum,r)=>sum+r.amount,0)===closing.coins},goods,
        profit:{revenue,stockCostOfSales,rent,wages,taxes,net:revenue-stockCostOfSales-rent-wages-taxes,method:'已成交收入减先进先出销货成本、整期租金、已付工钱与实缴税；未售库存为资产，期初旧货按目录基价估值'},
        escrow:contracts.filter(r=>r.escrow).map(r=>({contract:r.id,amount:r.escrow,source:r.source})),debts,
        contracts:contracts.map(r=>({id:r.id,kind:r.kind,parties:r.parties,subject:r.subject,quantity:r.quantity,location:r.location??shop.location,deadline:r.deadline,paid:r.paid,fulfilled:r.fulfilled,status:r.status,source:r.source,performance:r.performance,breaches:r.breaches})),
        quoteAnchor:engine.rules.economy.dailyIncomeBySkillStage,note:'日收入表仅供报价参考；营业和等待不会生成钱或顾客交易。'};
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
    const capacity=working.reduce((n,r)=>n+(r.workMinutes??0),0);
    if(capacityKnown&&requiredMinutes>capacity)for(const worker of view.observable.people.filter(p=>p.id!==owner&&!jobs.some(r=>r.worker===p.id))){
        const wage=laborValue(engine,document,{worker:worker.id,observer:owner}).daily;
        if(wage<=cash)options.push({kind:'hire',worker:worker.id,wage,requiredMinutes:requiredMinutes-capacity});
    }
    if(capacityKnown&&capacity>requiredMinutes)for(const job of jobs)options.push({kind:'dismiss',contract:job.id,worker:job.worker,excessMinutes:capacity-requiredMinutes});
    return {observer:owner,location:view.self.location,counterCash:cash,options};
}

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
    if(dedicatedCoinAccount(d.get('state'),owner,'counter'))throw preconditionFailure('Counter already exists');
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
        if(!Object.values(quantities(d.get('state','inventory'))).some(q=>q>0))throw preconditionFailure('须有现有库存才能开店');
        holdingSet(d,null,path(shop.id),{...shop,status:'营业',openedAt:d.get('state','minute')},'business');return {business:shop.id,status:'营业'};
    }
    if(!['business_close','business_bankrupt'].includes(args.operation))throw preconditionFailure('未知店铺操作');
    const bankrupt=args.operation==='business_bankrupt';
    if(bankrupt){
        const contracts=Object.values(d.get('state','records')??{}).filter(r=>r.category==='contract'&&r.business===shop.id);
        const keys=new Set(contracts.flatMap(c=>[c.debt,c.loan]).filter(Boolean)),state=d.get('state');
        const debt=obligationRows(state).filter(r=>keys.has(r.id)||keys.has(r.legacyRecord)).reduce((sum,r)=>sum+obligationView(state,r).owed,0);
        const refundable=contracts.reduce((sum,c)=>sum+c.escrow,0);
        if(debt<=(dedicatedCoinAccount(d.get('state'),'player','counter')?.coins??0)+refundable)throw preconditionFailure('现有现金和托管款足以偿债，不符合现金破产条件');
    }
    endShop(d,this,shop,bankrupt?'破产':'停业',eventId,bankrupt?'无力用现金偿还现有欠款，欠款保留':'店主主动停业');
    if(bankrupt)entityTransition(d,this,{id:`${eventId}:business-breach`,verb:'breach',actor:shop.id,location:shop.location,visibility:'public',witnesses:presentWitnesses(d.get('state'),shop.location),participants:[shop.owner],tags:['business'],summary:`${shop.id}无力偿还经营欠款，宣告破产；债务保留`});
    return {business:shop.id,status:bankrupt?'破产':'停业',inventoryRetained:true,note:'剩余实物保留，未偿欠款仍在原债务记录中。'};
}
