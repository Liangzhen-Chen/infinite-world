import {preconditionFailure} from './precondition.mjs';
import {REFERENCE,claimCopper,resourceName,repaymentPlan,payInKind,paymentPlan,contractFreeze,contractTerms as tenderTerms} from './tender.mjs';
import {reject} from './action-rejection.mjs';
import {releaseGoods} from './goods-escrow.mjs';
import {claimUnit} from './claim-unit.mjs';
import {relationView} from './npc-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,escrow as escrowAccount,moveCoins,partyAccount,mirrorPartyCoins,dedicatedCoinAccount} from './money.mjs';
import {npcCanPay,payFromNpc} from './npc-payment.mjs';
import {declareLedgerWriter,parseAccount,accountKey} from './ledger.mjs';
declareLedgerWriter('contracts');
import {advanceRituals}from'./magic-ritual.mjs';
export {advanceRituals,advanceRitualEffects}from'./magic-ritual.mjs';
import {recordFinanceSale}from'./finance-assets.mjs';
import {assessTradeTax,taxableSale}from'./finance-tax.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {changeLegacyHoldings} from './transition.mjs';
import {contractTerms,partyInProcedure,snapshotContractTerms} from './contract-state.mjs';
import {debtDue,currentGrace} from './obligation-state.mjs';
import {assertSettlementPresent} from './obligation-presence.mjs';
import {adoptLegacyObligation,settleObligation} from './obligation-runtime.mjs';
import {advanceHook} from './advance-hooks.mjs';
declareHoldingWriter('contracts',{kinds:['employed_by','leases','lodges','operates']});
const debtRows=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row.category==='debt');
import {canonical,recordEntriesWhere}from'./storage.mjs';
const signedTerms=row=>Object.fromEntries(['parties','subject','quantity','deadline','cost','kind'].map(k=>[k,row[k]??null]));
const contractPath=id=>['state','records',id];
export function magicContractTrace(d,id){
 const row=d.get(...contractPath(id));
 if(row?.category!=='contract'||!row.signedTerms)throw preconditionFailure('需要本人持有且有原签条款的真实契约');
 const current=signedTerms(row),changes=[];
 for(const [field,value]of Object.entries(row.signedTerms))if(canonical(current[field])!==canonical(value))changes.push({field,before:structuredClone(value),after:structuredClone(current[field])});
 return{parties:row.parties,changes,enforcement:row.enforcement};
}
export function advanceShadowContracts(d,before,after){
 for(const [id,row]of recordEntriesWhere(d.get('state','records'),'category','contract')){
  const e=row.category==='contract'&&row.enforcement;
  if(!e?.active||e.channel!=='shadow')continue;
  if(!row.parties?.includes(e.target)||!Number.isFinite(e.power)||e.power<=0||!Number.isFinite(e.stressPerMinute)||e.stressPerMinute<=0||!Number.isFinite(e.remaining)||e.remaining<0||!Number.isSafeInteger(e.started)||!Number.isSafeInteger(e.expires))throw Error('暗影契约执行状态损坏');
  const permission=d.get('state','records',e.authorization);
  if(e.target!=='player'&&(permission?.category!=='authorization'||permission.action!=='mental_magic'||permission.subject!==e.target||permission.grantor!==e.target||permission.grantee!=='player'||permission.revoked||permission.expires<=before)){holdingSet(d,null,[...contractPath(id),'enforcement','active'],false,'contracts');continue;}
  const until=Math.min(after,e.expires,e.target==='player'?Infinity:permission.expires),minutes=Math.max(0,until-Math.max(before,e.started));
  const path=e.target==='player'?['state','player']:['state','npcs',e.target],actor=d.get(...path);
  if(!actor?.mental||isPhysicallyDead(d.engine,d,e.target)){holdingSet(d,null,[...contractPath(id),'enforcement','active'],false,'contracts');continue;}
  const amount=Math.min(e.remaining,minutes*e.stressPerMinute);
  d.set([...path,'mental','stress'],Math.min(100,actor.mental.stress+amount));
  holdingSet(d,null,[...contractPath(id),'enforcement'],{...e,remaining:e.remaining-amount,active:e.remaining>amount&&until===after&&after<e.expires},'contracts');
 }
}
export function createBusinessContract(d,{kind,parties,subject,quantity,deadline,business,cost,escrow=0,...terms},eventId){
    const id=`contract_${kind}_${eventId}`;
    if(d.get(...contractPath(id)))throw preconditionFailure('合同编号已存在');
    const row=snapshotContractTerms({...terms,id,category:'contract',version:1,kind,parties,subject,quantity,deadline,business,cost,
        escrow,paid:0,fulfilled:0,status:'待履行',createdAt:d.get('state','minute'),source:eventId,performance:[],breaches:[]});
    row.signedTerms=structuredClone(signedTerms(row));
    holdingSet(d,null,contractPath(id),row,'contracts');return row;
}
export function finishBusinessContract(d,row,{status,fulfilled=row.fulfilled,paid=row.paid,reason,by,source}){
    const minute=d.get('state','minute'),next={...row,status,fulfilled,paid,resolvedAt:minute,
        performance:[...row.performance,{status,quantity:fulfilled,paid,minute,source}],
        breaches:reason?[...row.breaches,{reason,by,minute,source}]:row.breaches};
    return changeLegacyHoldings(d,d.engine,{source:`contract:${row.id}`,kinds:['leases','employed_by','lodges'],eventId:source},()=>{
        holdingSet(d,null,contractPath(row.id),next,'contracts');return next;
    });
}
export function refundContractEscrow(d,row,engine=d.engine){
    const recipient=row.parties?.[0]??row.owner??'player';
    // S5-F2: a deposit/fee frozen in a tender-unit resource is held and returned as that resource, unit for unit.
    if(row.escrow&&row.resource&&row.resource!==REFERENCE){
        releaseGoods(d,engine,{contract:row.id,to:recipient,resource:row.resource,amount:row.escrow,writer:'contracts'});
        row={...row,escrow:0};holdingSet(d,null,contractPath(row.id),row,'contracts');
    }else if(row.escrow){
        const funding=row.fundingAccount&&parseAccount(row.fundingAccount),purpose=funding?.purpose;
        let counter=dedicatedCoinAccount(d.get('state'),recipient,'counter');
        const to=purpose==='counter'?accountKey(recipient,'coin_river','counter'):partyAccount(engine,d.get('state'),recipient);
        // The original funding account is provenance, not the current owner:
        // inherited refunds follow the contract's live recipient and keep purpose.
        if(purpose==='counter'&&!counter){
            const origin=dedicatedCoinAccount(d.get('state'),funding.owner,'counter');
            const key=`money_account:${to}`;
            counter={...origin,category:'money_account',owner:recipient,account:to,purpose:'counter',coins:0,originAccount:row.fundingAccount};
            holdingSet(d,engine,['state','records',key],counter,'contracts');
        }
        moveCoins(d,{from:escrowAccount(row.id),to,amount:row.escrow,writer:'contracts'});
        if(to!==counter?.account)mirrorPartyCoins(d,engine,recipient,row.escrow,row.source,'contracts');
        row={...row,escrow:0};holdingSet(d,null,contractPath(row.id),row,'contracts');
    }
    return row;
}
export function releaseBusinessLease(d,engine,row,{status='已终止',reason,source}={}){
    // A deposit pays only an existing rent debt. Remaining deposit goes back to its owner.
    const debt=row.debt&&d.get(...contractPath(row.debt));let used=0;
    if(debt&&debt.status!=='已还清'){
        used=Math.min(row.escrow,debt.amount-debt.paid);
        if(used){
            adoptLegacyObligation(d,engine,row.debt);
            settleObligation(d,engine,{id:row.debt,payer:debt.debtor,amount:used,escrowContract:row.id},`${source??row.id}:escrow`);
        }
    }
    row=refundContractEscrow(d,{...row,escrow:row.escrow-used,paid:row.paid+used});
    return finishBusinessContract(d,row,{status,reason,by:reason?'player':undefined,source});
}
// S5-F/F2 (15 §15.3): the legal-tender side of engine-dispatched trade and lodging lives here, so the
// L0 dispatcher reaches tender pricing only through the economy pack it already calls for charges.
// Lodging: where the legal tender is not coin_river the room fee freezes as that resource in whole units
// (same contractTerms path as a credit sale); a cash payer must already hold the bill in the chosen currency.
export function lodgingFee(d,engine,{location,cost,buyer,payment='cash',payCurrency}){
    const freeze=contractFreeze(d,engine,{location,coppers:{cost}});if(!freeze)return null;
    const fee={resource:freeze.resource,amount:freeze.amounts.cost};
    if(payment==='cash'){const pay=repaymentPlan(d,engine,{resource:fee.resource,quantity:fee.amount,payWith:payCurrency});if((pay.resource===REFERENCE?engine.actor(d,buyer).coins:engine.quantity(d,buyer,pay.item))<pay.amount)reject('E-ACTION-PRECONDITION',`房钱不足：需要${pay.amount}${pay.resource===REFERENCE?'铜':resourceName(engine,pay.resource)}（房钱按${freeze.resourceName}计，可用 payCurrency 改用别的币）`);}
    return {fee,name:freeze.resourceName};
}
// Goods: a buyer may hand over a named resource instead of reference coins; the bill is converted at today's rate.
export function tradeInKindPlan(d,engine,{buyer,payment='cash',payCurrency,copper,location}){
    if(payCurrency===undefined||payCurrency===REFERENCE)return null;
    if(buyer!=='player'||payment!=='cash')reject('E-ACTION-PRECONDITION','只有玩家现付时可指定付款币种');
    const plan=paymentPlan(d,engine,{resource:payCurrency,copper,location});
    if(engine.quantity(d,buyer,plan.item)<plan.amount)reject('E-ACTION-PRECONDITION',`买方${engine.byId.get(plan.item)?.name??plan.resource}不足：需要${plan.amount}`);
    return plan;
}
export const payTradeInKind=(d,engine,{buyer,seller,plan,eventId})=>({paidWith:payInKind(d,engine,{payer:buyer,payee:seller,plan,eventId})});
// A credit sale freezes its terms in the place's tender unit: the claim is that resource and quantity (null in a coin_river place).
export const creditSaleTerms=(d,engine,{location,copper})=>tenderTerms(d,engine,{location,copper});
export function validateTradeCharge(d,engine,{buyer,seller,cost,payment='cash',creditMinutes,description,terms=null},eventId){
    if(buyer===seller||!Number.isSafeInteger(cost)||cost<0)throw preconditionFailure('交易当事人或金额无效');
    if(payment==='cash'){
        // S5-F2: a bill frozen in the place's tender unit is paid in kind (see chargeTrade), not from the copper purse.
        if(terms)return {payment:'cash'};
        const source=engine.actor(d,buyer),target=engine.actor(d,seller);
        if(!npcCanPay(d,engine,buyer,cost,source.coins))throw preconditionFailure('买方余额不足');
        return {payment:'cash'};
    }
    if(payment!=='credit'||buyer!=='player')throw preconditionFailure('只支持玩家按商家的赊账规则购买');
    const policy=engine.byId.get(seller)?.creditPolicy;
    if(!policy)throw preconditionFailure('该商家尚未接受赊账');
    if(!Number.isSafeInteger(policy.limitCopper)||policy.limitCopper<1||!Number.isSafeInteger(policy.maximumMinutes)||policy.maximumMinutes<1
        ||!Number.isSafeInteger(policy.minimumTrust))throw preconditionFailure('商家赊账规则无效');
    if(relationView(engine,d.get('state'),seller,buyer).trust<policy.minimumTrust)throw preconditionFailure('商家目前不信任你的还款承诺，要求现付');
    const debts=debtRows(d).map(([,row])=>row).filter(row=>row.debtor===buyer&&row.creditor===seller&&row.status!=='已还清');
    if(debts.some(row=>row.status==='逾期'))throw preconditionFailure('旧欠款已逾期，先还清才能继续申请赊账');
    const outstanding=debts.reduce((sum,row)=>sum+claimCopper(d,engine,row),0);
    if(outstanding+cost>policy.limitCopper)throw preconditionFailure(`未还欠款与本次合计不得超过${policy.limitCopper}铜，当前已欠${outstanding}铜`);
    const minutes=creditMinutes??policy.maximumMinutes;
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>policy.maximumMinutes)throw preconditionFailure(`赊账期限必须为1至${policy.maximumMinutes}分钟`);
    return {payment:'credit',minutes};
}
export function chargeTrade(d,engine,args,eventId){
    const {buyer,seller,cost,payment='cash',description,terms=null,payCurrency}=args,plan=validateTradeCharge(d,engine,args,eventId),minutes=plan.minutes;
    if(payment==='cash'&&terms){
        // The bill is `terms.amount` of `terms.resource`; another currency converts at today's rate, rounded up to whole units (rest stays with the payee).
        const pay=repaymentPlan(d,engine,{resource:terms.resource,quantity:terms.amount,payWith:payCurrency});
        return{paidWith:payInKind(d,engine,{payer:buyer,payee:seller,plan:pay,eventId})};
    }
    if(payment==='cash'){
        const source=engine.actor(d,buyer),target=engine.actor(d,seller);
        payFromNpc(d,engine,{payer:buyer,to:purse(engine,seller),amount:cost,writer:'contracts',eventId});
        d.set([...engine.actorPath(buyer),'coins'],d.get(...engine.actorPath(buyer),'coins')-cost);
        d.set([...engine.actorPath(seller),'coins'],d.get(...engine.actorPath(seller),'coins')+cost);
        return{};
    }
    const id=`debt_${eventId}`;if(d.get('state','records',id))throw preconditionFailure('欠款编号已存在');
    // A claim in the place's tender unit is that resource and quantity, frozen here; `referenceCopper` is only the bill at signing.
    const debt={category:'debt',name:description,debtor:buyer,creditor:seller,amount:terms?.amount??cost,...(terms?{resource:terms.resource,resourceName:resourceName(engine,terms.resource),referenceCopper:cost}:{}),paid:0,createdAt:d.get('state','minute'),
        deadline:d.get('state','minute')+minutes,status:'待偿还',source:eventId};
    holdingSet(d,null,['state','records',id],debt,'contracts');
    adoptLegacyObligation(d,engine,id);
    return{debt:id,amount:debt.amount,...(terms?{resource:terms.resource,resourceName:resourceName(engine,terms.resource)}:{}),deadline:debt.deadline,payment:'credit'};
}
export function repayDebt(d,engine,{buyer,seller,debt:id,payCurrency},eventId){
    const row=d.get('state','records',id);
    if(row?.category!=='debt'||row.debtor!==buyer||row.creditor!==seller||buyer!=='player')throw preconditionFailure('需要 debt 指定本人对该商家的真实欠款');
    if(row.status==='已还清')throw preconditionFailure('这笔欠款已经还清，不重复付款');
    assertSettlementPresent(engine,d.get('state'),buyer,seller);
    const amount=row.amount-row.paid;

    adoptLegacyObligation(d,engine,id);settleObligation(d,engine,{id,payer:buyer,amount,...(payCurrency?{payWith:payCurrency}:{})},eventId);
    // Settling a credit sale taxes the same goods a cash sale would (finance-tax.mjs taxableSale).
    if(row.sale){const tax=taxableSale(engine,d.get('state'),seller,row.sale.item)?assessTradeTax(d,engine,{seller,cost:row.resource&&row.resource!==REFERENCE?row.sale.cost:amount,location:row.sale.location,sourceEvent:eventId}):{amount:0};recordFinanceSale(d,engine,{...row.sale,settledBasis:row.sale.basis,tax:tax.amount,eventId});}
    holdingSet(d,null,['state','records',id],{...d.get('state','records',id),paidAt:d.get('state','minute')},'contracts');
    for(const[key,contract]of Object.entries(d.get('state','records')??{}))if(contract.category==='contract'&&contract.debt===id)holdingSet(d,null,['state','records',key],{...contract,paid:row.amount},'contracts');
    engine.advance(d,5,eventId);d.say(`偿还${engine.byId.get(seller)?.name}欠款${amount}${claimUnit(row)}`);
    return{debt:id,cost:amount,status:'已还清',...(row.resource&&row.resource!==REFERENCE?{resource:row.resource,resourceName:claimUnit(row)}:{})};
}
export function advanceContracts(d,engine,minute,recordIds){
    if(!recordIds)advanceRituals(d,engine,minute);
    for(const[id,stored]of (recordIds?recordIds.map(id=>[id,d.get('state','records',id)]).filter(([,row])=>row):Object.entries(d.get('state','records')??{}))){
        const row=stored.category==='contract'?contractTerms(stored,minute):stored;
        if(row.category==='contract'&&row.version===1&&row.business&&['有效','待履行'].includes(row.status)){
            if(row.endedAt!==undefined||row.resolvedAt!==undefined)continue;
            const overdue=row.debt&&d.get('state','records',row.debt)?.deadline<=minute&&d.get('state','records',row.debt)?.status!=='已还清';
            if(row.deadline<=minute||overdue){
                const reason=overdue?'租金未按期偿还':row.kind==='lease'?undefined:'到期未履行';
                const ended=row.kind==='lease'?releaseBusinessLease(d,engine,row,{status:reason?'违约':'已到期',reason,source:id})
                    :finishBusinessContract(d,refundContractEscrow(d,row),{status:'违约',reason,by:row.parties[1],source:id});
                if(row.kind==='lease'){
                    const shop=d.get('state','records',row.business);
                    if(shop&&['筹备','营业'].includes(shop.status))holdingSet(d,null,contractPath(shop.id),{...shop,status:'停业',reason:reason??'租赁到期',endedAt:minute},'contracts');
                    for(const pending of Object.values(d.get('state','records')??{}))if(pending.category==='contract'&&pending.version===1&&pending.business===row.business&&pending.status==='待履行'){
                        finishBusinessContract(d,refundContractEscrow(d,pending),{status:'已取消',reason:'铺面租赁结束',by:'player',source:id});
                    }
                }
                d.say(`${row.kind}合同${ended.status}${reason?`：${reason}`:''}`);
            }
        }
        if(row.category==='contract'&&row.room&&row.status==='有效'&&row.expires<=minute){
            changeLegacyHoldings(d,engine,{holder:row.parties?.[0]??'player',subject:row.room,kinds:['lodges'],reason:'expired',eventId:`${id}:expired`},()=>holdingSet(d,null,['state','records',id],{...row,status:'已到期',endedAt:row.expires},'contracts'));d.say(`${row.name}已到期，需要退房或另行续住`);
        }
        const allowance=row.category==='debt'&&row.status==='待偿还'?currentGrace(engine,d.get('state'),row,minute):null;
        if(row.category==='debt'&&!partyInProcedure(d.get('state'),row.debtor)&&row.status==='待偿还'&&debtDue(row,minute,{allowance}).overdue){
            const due=debtDue(row,minute,{allowance});
            holdingSet(d,null,['state','records',id],{...row,status:'逾期',overdueAt:due.deadline,graceBasis:due.grace},'contracts');
            advanceHook('recordNpcDebtOverdue')?.(d,engine,id,d.get('state','records',id));
            if(row.debtor==='player'&&d.get('state','npcs',row.creditor)&&engine.byId.get(row.creditor)?.tier!=='full')engine.relation(d,{npc:row.creditor,eventType:'违约',sourceEvent:id},id);
            d.say(`欠${engine.byId.get(row.creditor)?.name??'商家'}的${row.amount-row.paid}${claimUnit(row)}已到期，尚未偿还`);
        }
    }
}
