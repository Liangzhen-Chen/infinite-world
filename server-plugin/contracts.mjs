import {advanceRituals}from'./magic-ritual.mjs';
const debtRows=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row.category==='debt');
import {canonical}from'./storage.mjs';
const signedTerms=row=>Object.fromEntries(['parties','subject','quantity','deadline','cost','kind'].map(k=>[k,row[k]??null]));
const contractPath=id=>['state','records',id];
export function magicContractTrace(d,id){
 const row=d.get(...contractPath(id));
 if(row?.category!=='contract'||!row.signedTerms)throw Error('需要本人持有且有原签条款的真实契约');
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
  if(e.target!=='player'&&(permission?.category!=='authorization'||permission.action!=='mental_magic'||permission.subject!==e.target||permission.grantor!==e.target||permission.grantee!=='player'||permission.revoked||permission.expires<=before)){d.set([...contractPath(id),'enforcement','active'],false);continue;}
  const until=Math.min(after,e.expires,e.target==='player'?Infinity:permission.expires),minutes=Math.max(0,until-Math.max(before,e.started));
  const path=e.target==='player'?['state','player']:['state','npcs',e.target],actor=d.get(...path);
  if(!actor?.mental||actor.status==='死亡'){d.set([...contractPath(id),'enforcement','active'],false);continue;}
  const amount=Math.min(e.remaining,minutes*e.stressPerMinute);
  d.set([...path,'mental','stress'],Math.min(100,actor.mental.stress+amount));
  d.set([...contractPath(id),'enforcement'],{...e,remaining:e.remaining-amount,active:e.remaining>amount&&until===after&&after<e.expires});
 }
}
export function createBusinessContract(d,{kind,parties,subject,quantity,deadline,business,cost,escrow=0,...terms},eventId){
    const id=`contract_${kind}_${eventId}`;
    if(d.get(...contractPath(id)))throw new Error('合同编号已存在');
    const row={...terms,id,category:'contract',version:1,kind,parties,subject,quantity,deadline,business,cost,
        escrow,paid:0,fulfilled:0,status:'待履行',createdAt:d.get('state','minute'),source:eventId,performance:[],breaches:[]};
    row.signedTerms=structuredClone(signedTerms(row));
    d.set(contractPath(id),row);return row;
}
export function finishBusinessContract(d,row,{status,fulfilled=row.fulfilled,paid=row.paid,reason,by,source}){
    const minute=d.get('state','minute'),next={...row,status,fulfilled,paid,resolvedAt:minute,
        performance:[...row.performance,{status,quantity:fulfilled,paid,minute,source}],
        breaches:reason?[...row.breaches,{reason,by,minute,source}]:row.breaches};
    d.set(contractPath(row.id),next);return next;
}
export function refundContractEscrow(d,row){
    if(row.escrow){d.set(['state','player','coins'],d.get('state','player','coins')+row.escrow);row={...row,escrow:0};d.set(contractPath(row.id),row);}
    return row;
}
export function releaseBusinessLease(d,engine,row,{status='已终止',reason,source}={}){
    // A deposit pays only an existing rent debt. Remaining deposit goes back to its owner.
    const debt=row.debt&&d.get(...contractPath(row.debt));let used=0;
    if(debt&&debt.status!=='已还清'){
        used=Math.min(row.escrow,debt.amount-debt.paid);
        if(used){const paid=debt.paid+used;
            d.set([...engine.actorPath(debt.creditor),'coins'],engine.actor(d,debt.creditor).coins+used);
            d.set(contractPath(row.debt),{...debt,paid,status:paid===debt.amount?'已还清':debt.status,...(paid===debt.amount?{paidAt:d.get('state','minute')}:{})});
        }
    }
    row=refundContractEscrow(d,{...row,escrow:row.escrow-used,paid:row.paid+used});
    return finishBusinessContract(d,row,{status,reason,by:reason?'player':undefined,source});
}
export function chargeTrade(d,engine,{buyer,seller,cost,payment='cash',creditMinutes,description},eventId){
    if(buyer===seller||!Number.isSafeInteger(cost)||cost<0)throw new Error('交易当事人或金额无效');
    if(payment==='cash'){
        const source=engine.actor(d,buyer),target=engine.actor(d,seller);
        if(source.coins<cost)throw new Error('买方余额不足');
        d.set([...engine.actorPath(buyer),'coins'],source.coins-cost);
        d.set([...engine.actorPath(seller),'coins'],target.coins+cost);
        return{};
    }
    if(payment!=='credit'||buyer!=='player')throw new Error('只支持玩家按商家的赊账规则购买');
    const policy=engine.byId.get(seller)?.creditPolicy;
    if(!policy)throw new Error('该商家尚未接受赊账');
    if(!Number.isSafeInteger(policy.limitCopper)||policy.limitCopper<1||!Number.isSafeInteger(policy.maximumMinutes)||policy.maximumMinutes<1
        ||!Number.isSafeInteger(policy.minimumTrust))throw new Error('商家赊账规则无效');
    if(engine.actor(d,seller).trust<policy.minimumTrust)throw new Error('商家目前不信任你的还款承诺，要求现付');
    const debts=debtRows(d).map(([,row])=>row).filter(row=>row.debtor===buyer&&row.creditor===seller&&row.status!=='已还清');
    if(debts.some(row=>row.status==='逾期'))throw new Error('旧欠款已逾期，先还清才能继续申请赊账');
    const outstanding=debts.reduce((sum,row)=>sum+row.amount-row.paid,0);
    if(outstanding+cost>policy.limitCopper)throw new Error(`未还欠款与本次合计不得超过${policy.limitCopper}铜，当前已欠${outstanding}铜`);
    const minutes=creditMinutes??policy.maximumMinutes;
    if(!Number.isSafeInteger(minutes)||minutes<1||minutes>policy.maximumMinutes)throw new Error(`赊账期限必须为1至${policy.maximumMinutes}分钟`);
    const id=`debt_${eventId}`;if(d.get('state','records',id))throw new Error('欠款编号已存在');
    const debt={category:'debt',name:description,debtor:buyer,creditor:seller,amount:cost,paid:0,createdAt:d.get('state','minute'),
        deadline:d.get('state','minute')+minutes,status:'待偿还',source:eventId};
    d.set(['state','records',id],debt);
    return{debt:id,amount:cost,deadline:debt.deadline,payment:'credit'};
}
export function repayDebt(d,engine,{buyer,seller,debt:id},eventId){
    const row=d.get('state','records',id);
    if(row?.category!=='debt'||row.debtor!==buyer||row.creditor!==seller||buyer!=='player')throw new Error('需要 debt 指定本人对该商家的真实欠款');
    if(row.status==='已还清')throw new Error('这笔欠款已经还清，不重复付款');
    const amount=row.amount-row.paid;
    chargeTrade(d,engine,{buyer,seller,cost:amount},eventId);
    d.set(['state','records',id],{...row,paid:row.amount,status:'已还清',paidAt:d.get('state','minute')});
    for(const[key,contract]of Object.entries(d.get('state','records')??{}))if(contract.category==='contract'&&contract.debt===id)d.set(['state','records',key],{...contract,paid:row.amount});
    engine.advance(d,5,eventId);d.say(`偿还${engine.byId.get(seller)?.name}欠款${amount}铜`);
    return{debt:id,cost:amount,status:'已还清'};
}
export function advanceContracts(d,engine,minute){
    advanceRituals(d,engine,minute);
    for(const[id,row]of Object.entries(d.get('state','records')??{})){
        if(row.category==='contract'&&row.version===1&&row.business&&['有效','待履行'].includes(row.status)){
            if(d.get('state','records',id)?.status!==row.status)continue;
            const overdue=row.debt&&d.get('state','records',row.debt)?.deadline<=minute&&d.get('state','records',row.debt)?.status!=='已还清';
            if(row.deadline<=minute||overdue){
                const reason=overdue?'租金未按期偿还':row.kind==='lease'?undefined:'到期未履行';
                const ended=row.kind==='lease'?releaseBusinessLease(d,engine,row,{status:reason?'违约':'已到期',reason,source:id})
                    :finishBusinessContract(d,refundContractEscrow(d,row),{status:'违约',reason,by:row.parties[1],source:id});
                if(row.kind==='lease'){
                    const shop=d.get('state','records',row.business);
                    if(shop&&['筹备','营业'].includes(shop.status))d.set(contractPath(shop.id),{...shop,status:'停业',reason:reason??'租赁到期',endedAt:minute});
                    for(const pending of Object.values(d.get('state','records')??{}))if(pending.category==='contract'&&pending.version===1&&pending.business===row.business&&pending.status==='待履行'){
                        finishBusinessContract(d,refundContractEscrow(d,pending),{status:'已取消',reason:'铺面租赁结束',by:'player',source:id});
                    }
                }
                d.say(`${row.kind}合同${ended.status}${reason?`：${reason}`:''}`);
            }
        }
        if(row.category==='contract'&&row.room&&row.status==='有效'&&row.expires<=minute){
            d.set(['state','records',id],{...row,status:'已到期'});d.say(`${row.name}已到期，需要退房或另行续住`);
        }
        if(row.category==='debt'&&row.status==='待偿还'&&row.deadline<=minute){
            d.set(['state','records',id],{...row,status:'逾期',overdueAt:row.deadline});
            if(row.debtor==='player'&&d.get('state','npcs',row.creditor)&&engine.byId.get(row.creditor)?.tier!=='full')engine.relation(d,{npc:row.creditor,eventType:'违约',sourceEvent:id},id);
            d.say(`欠${engine.byId.get(row.creditor)?.name??'商家'}的${row.amount-row.paid}铜已到期，尚未偿还`);
        }
    }
}
