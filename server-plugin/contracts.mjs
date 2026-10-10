const debtRows=d=>Object.entries(d.get('state','records')??{}).filter(([,row])=>row.category==='debt');
export function chargeTrade(d,engine,{buyer,seller,cost,payment='cash',creditMinutes,description},eventId){
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
    for(const[id,row]of Object.entries(d.get('state','records')??{})){
        if(row.category==='contract'&&row.room&&row.status==='有效'&&row.expires<=minute){
            d.set(['state','records',id],{...row,status:'已到期'});d.say(`${row.name}已到期，需要退房或另行续住`);
        }
        if(row.category==='debt'&&row.status==='待偿还'&&row.deadline<=minute){
            d.set(['state','records',id],{...row,status:'逾期',overdueAt:row.deadline});
            if(row.debtor==='player'&&d.get('state','npcs',row.creditor))engine.relation(d,{npc:row.creditor,eventType:'违约',sourceEvent:id},id);
            d.say(`欠${engine.byId.get(row.creditor)?.name??'商家'}的${row.amount-row.paid}铜已到期，尚未偿还`);
        }
    }
}
