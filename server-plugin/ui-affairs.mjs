import {questPublishingRights} from './quest-board.mjs';
const closed=new Set(['已完成','取消','已取消','已还清','已终止','已到期','已否决','违约','失败','超期']);
const finite=value=>Number.isFinite(value)?value:null;
const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row?.[key]??null]));
const fiscal=row=>row?pick(row,['salesGrossCopper','salesNetCopper','taxReceiptsCopper','advanceCopper','purchasesCopper','exportedFood','importedFood']):null;
const byDeadline=(a,b)=>(a.deadline??Infinity)-(b.deadline??Infinity)||a.id.localeCompare(b.id);

// A view of saved records only. Residence, contributions and public engineering
// do not supply ownership, and an entry/home authorization cannot open a ledger.
export function affairs(engine,document){
    const s=document.state,records=s.records??{},now=s.minute??0;
    const name=id=>id==='player'?s.player?.name??'本人':engine.byId.get(id)?.name??s.created?.[id]?.name??'未识别对象';
    const date=minute=>Number.isFinite(minute)?engine.calendar(minute).text:null;
    const commitment=(id,row,kind,from,to,deadline,details)=>{
        const due=finite(deadline),active=!closed.has(row.status);
        return {id,kind,content:row.content??row.name??'内容未记录',status:row.status??'未记录',active,
            direction:from==='player'?'outgoing':'incoming',counterparty:to===null&&from==='player'?'尚无人承接':name(from==='player'?to:from),
            deadline:due,deadlineText:date(due),overdue:active&&due!==null&&due<=now,...details};
    };
    const tasks=Object.entries(s.quests??{}).filter(([,r])=>r&&[r.publisher,r.taker].includes('player'))
        .map(([id,r])=>commitment(id,r,'任务',r.publisher,r.taker,r.deadline,{grade:r.grade??null,reward:r.reward??null})).sort(byDeadline);
    const obligations=Object.entries(s.obligations??{}).filter(([,r])=>r&&[r.promisor,r.promisee].includes('player'))
        .map(([id,r])=>commitment(id,r,r.type??'约定',r.promisor,r.promisee,r.deadline,
            {reason:r.reason??null,item:r.item?name(r.item):null,quantity:r.quantity??null,coins:r.coins??null}));
    for(const [id,r]of Object.entries(records)){
        if(r?.category==='debt'&&[r.debtor,r.creditor].includes('player'))obligations.push(commitment(id,r,'债务',r.debtor,r.creditor,r.deadline,{outstanding:r.amount!==undefined&&r.paid!==undefined?r.amount-r.paid:null}));
        if(r?.category==='contract'&&r.parties?.includes('player'))obligations.push(commitment(id,r,'合同','player',r.parties.find(id=>id!=='player'),r.deadline??r.expires,
            {content:r.content??r.name??(r.subject?name(r.subject):'内容未记录'),kindName:r.kind??null,cost:r.cost??null,paid:r.paid??null,fulfilled:r.fulfilled??null,quantity:r.quantity??null}));
    }
    obligations.sort(byDeadline);
    const month=Math.floor(now/(1440*30)),limit=finite(engine.byId.get('player')?.monthlyQuotaD)??(questPublishingRights(engine,s).limitD||null),used=finite(s.questQuota?.[`${month}_player`]);
    const quota={month:month+1,limitD:limit,usedD:used,remainingD:limit===null||used===null?null:Math.max(0,limit-used),personal:questPublishingRights(engine,s).personal,units:{...engine.rules.quests?.quotaUnits}};
    const local=new Set();let location=s.location;
    while(location&&!local.has(location)){local.add(location);location=engine.byId.get(location)?.parent;}
    const holdings=Object.entries(s.buildings??{}).filter(([,r])=>r?.owner==='player')
        .map(([id,r])=>({id,name:name(id),condition:r.condition??null}));
    const settlements=Object.entries(s.settlements??{}).filter(([id,r])=>r&&(r.owner==='player'||local.has(id))).map(([id,r])=>{
        const profile=engine.world.settlementProfiles?.find(row=>row.id===id),farm=records[`agriculture:${id}`];
        const pending=Object.entries(records).filter(([,row])=>row?.settlement===id&&
            (row.category==='governance_request'&&['待办理','待权限决定'].includes(row.status)||
             row.category==='governance_proposal'&&['议事中','意见已确认'].includes(row.status)||
             row.category==='governance_referral'&&row.status==='待上级决定'))
            .map(([key,row])=>({id:key,name:row.name??row.requestedOffice??(row.kind==='account_report'?'公账核对':'建房事务'),
                status:row.status,deadline:finite(row.due),deadlineText:date(row.due),reason:row.reason??null})).sort(byDeadline);
        const reports=Object.entries(records).filter(([,row])=>row?.settlement===id&&row.category==='governance_execution')
            .map(([key,row])=>({id:key,steward:name(row.steward),status:row.status,minute:row.minute??null,time:date(row.minute),reason:row.reason??null,
                report:row.report?{...pick(row.report,['treasury','wood','stone']),fiscal:fiscal(row.report.fiscal)}:null}))
            .sort((a,b)=>(b.minute??-Infinity)-(a.minute??-Infinity));
        const projects=Object.entries(s.projects??{}).filter(([,row])=>row?.type==='工程'&&row.settlement===id)
            .map(([key,row])=>({id:key,...pick(row,['name','status','remainingDays','wood','stone'])}));
        return {id,name:name(id),scope:r.owner==='player'?'owned':'public',population:r.population??profile?.population??null,
            households:profile?.householdCount??null,stock:{...pick(r,['food','treasury','wood','stone','iron']),seed:farm?.field?.seedBank??null},
            fiscal:fiscal(records[`village-fiscal:${id}`]),projects,pending,reports};
    });
    return {minute:now,time:date(now),tasks,obligations,quota,holdings,settlements};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/affairs',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...affairs(engine,document)};});
}
