import {preconditionFailure} from './precondition.mjs';
import {relationView} from './npc-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {purse,escrow as escrowAccount,moveCoins,partyAccount,mirrorPartyCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
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
declareHoldingWriter('contracts',{kinds:['employed_by','leases','lodges','operates']});
const debtRows=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row.category==='debt');
import {canonical}from'./storage.mjs';
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
 for(const [id,row]of Object.entries(d.get('state','records')??{})){
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
    if(row.escrow){moveCoins(d,{from:escrowAccount(row.id),to:partyAccount(engine,d.get('state'),recipient),amount:row.escrow,writer:'contracts'});mirrorPartyCoins(d,engine,recipient,row.escrow,row.source,'contracts');row={...row,escrow:0};holdingSet(d,null,contractPath(row.id),row,'contracts');}
    return row;
}
export function releaseBusinessLease(d,engine,row,{status='已终止',reason,source}={}){
    // A deposit pays only an existing rent debt. Remaining deposit goes back to its owner.
    const debt=row.debt&&d.get(...contractPath(row.debt));let used=0;
    if(debt&&debt.status!=='已还清'){
        used=Math.min(row.escrow,debt.amount-debt.paid);
        if(used){const paid=debt.paid+used;
            if(!engine.replaying||engine.replayResult?.obligationRuntimeVersion===1){
                adoptLegacyObligation(d,engine,row.debt);
                settleObligation(d,engine,{id:row.debt,payer:debt.debtor,amount:used,escrowContract:row.id},`${source??row.id}:escrow`);
            }else{
            moveCoins(d,{from:escrowAccount(row.id),to:purse(engine,debt.creditor),amount:used,writer:'contracts'});
            d.set([...engine.actorPath(debt.creditor),'coins'],engine.actor(d,debt.creditor).coins+used);
            holdingSet(d,null,contractPath(row.debt),{...debt,paid,status:paid===debt.amount?'已还清':debt.status,...(paid===debt.amount?{paidAt:d.get('state','minute')}:{})},'contracts');
            }
        }
    }
    row=refundContractEscrow(d,{...row,escrow:row.escrow-used,paid:row.paid+used});
    return finishBusinessContract(d,row,{status,reason,by:reason?'player':undefined,source});
}
export function validateTradeCharge(d,engine,{buyer,seller,cost,payment='cash',creditMinutes,description},eventId){
    if(buyer===seller||!Number.isSafeInteger(cost)||cost<0)throw preconditionFailure('交易当事人或金额无效');
    if(payment==='cash'){
        const source=engine.actor(d,buyer),target=engine.actor(d,seller);
        if(source.coins<cost)throw preconditionFailure('买方余额不足');
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
    const outstanding=debts.reduce((sum,row)=>sum+row.amount-row.paid,0);
    if(outstanding+cost>policy.limitCopper)throw preconditionFailure(`未还欠款与本次合计不得超过${policy.limitCopper}铜，当前已欠${outstanding}铜`);
    const minutes=creditMinutes??policy.maximumMinutes;
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>policy.maximumMinutes)throw preconditionFailure(`赊账期限必须为1至${policy.maximumMinutes}分钟`);
    return {payment:'credit',minutes};
}
export function chargeTrade(d,engine,args,eventId){
    const {buyer,seller,cost,payment='cash',description}=args,plan=validateTradeCharge(d,engine,args,eventId),minutes=plan.minutes;
    if(payment==='cash'){
        const source=engine.actor(d,buyer),target=engine.actor(d,seller);
        moveCoins(d,{from:purse(engine,buyer),to:purse(engine,seller),amount:cost,writer:'contracts',eventId});
        d.set([...engine.actorPath(buyer),'coins'],source.coins-cost);
        d.set([...engine.actorPath(seller),'coins'],target.coins+cost);
        return{};
    }
    const id=`debt_${eventId}`;if(d.get('state','records',id))throw preconditionFailure('欠款编号已存在');
    const debt={category:'debt',name:description,debtor:buyer,creditor:seller,amount:cost,paid:0,createdAt:d.get('state','minute'),
        deadline:d.get('state','minute')+minutes,status:'待偿还',source:eventId};
    holdingSet(d,null,['state','records',id],debt,'contracts');
    if(!engine.replaying||engine.replayResult?.obligationRuntimeVersion===1)adoptLegacyObligation(d,engine,id);
    return{debt:id,amount:cost,deadline:debt.deadline,payment:'credit'};
}
export function repayDebt(d,engine,{buyer,seller,debt:id},eventId){
    const row=d.get('state','records',id);
    if(row?.category!=='debt'||row.debtor!==buyer||row.creditor!==seller||buyer!=='player')throw preconditionFailure('需要 debt 指定本人对该商家的真实欠款');
    if(row.status==='已还清')throw preconditionFailure('这笔欠款已经还清，不重复付款');
    assertSettlementPresent(engine,d.get('state'),buyer,seller);
    const amount=row.amount-row.paid;
    const runtime=!engine.replaying||engine.replayResult?.obligationRuntimeVersion===1;
    if(runtime){adoptLegacyObligation(d,engine,id);settleObligation(d,engine,{id,payer:buyer,amount},eventId);}
    else chargeTrade(d,engine,{buyer,seller,cost:amount},eventId);
    // Settling a credit sale taxes the same goods a cash sale would (finance-tax.mjs taxableSale).
    if(row.sale){const tax=taxableSale(engine,d.get('state'),seller,row.sale.item)?assessTradeTax(d,engine,{seller,cost:amount,location:row.sale.location,sourceEvent:eventId}):{amount:0};recordFinanceSale(d,engine,{...row.sale,settledBasis:row.sale.basis,tax:tax.amount,eventId});}
    holdingSet(d,null,['state','records',id],{...d.get('state','records',id),...(!runtime?{paid:row.amount,status:'已还清'}:{}),paidAt:d.get('state','minute')},'contracts');
    for(const[key,contract]of Object.entries(d.get('state','records')??{}))if(contract.category==='contract'&&contract.debt===id)holdingSet(d,null,['state','records',key],{...contract,paid:row.amount},'contracts');
    engine.advance(d,5,eventId);d.say(`偿还${engine.byId.get(seller)?.name}欠款${amount}铜`);
    return{debt:id,cost:amount,status:'已还清'};
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
            if(row.debtor==='player'&&d.get('state','npcs',row.creditor)&&engine.byId.get(row.creditor)?.tier!=='full')engine.relation(d,{npc:row.creditor,eventType:'违约',sourceEvent:id},id);
            d.say(`欠${engine.byId.get(row.creditor)?.name??'商家'}的${row.amount-row.paid}铜已到期，尚未偿还`);
        }
    }
}
