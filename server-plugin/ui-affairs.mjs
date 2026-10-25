import {questPublishingRights} from './quest-board.mjs';
import {placeView,personName,institutionOffices,officeOnDuty} from './entity-view.mjs';
import {obligationRows,obligationView} from './obligation-state.mjs';
import {calendarDateAt} from './weather.mjs';
import {documentAccessible,documentView} from './documents.mjs';
import {visibleEntity} from './perception.mjs';
const closed=new Set(['已完成','取消','已取消','已还清','已终止','已到期','已否决','违约','失败','超期']);
const finite=value=>Number.isFinite(value)?value:null;
const pick=(row,keys)=>Object.fromEntries(keys.map(key=>[key,row?.[key]??null]));
const fiscal=row=>row?pick(row,['salesGrossCopper','salesNetCopper','taxReceiptsCopper','advanceCopper','purchasesCopper','exportedFood','importedFood']):null;
const byDeadline=(a,b)=>(a.deadline??Infinity)-(b.deadline??Infinity)||a.id.localeCompare(b.id);

// A view of saved records only. Residence, contributions and public engineering
// do not supply ownership, and an entry/home authorization cannot open a ledger.
export function affairs(engine,document){
    const s=document.state,records=s.records??{},now=s.minute??0;
    const name=id=>personName(engine,s,id).value??engine.byId.get(id)?.name??s.created?.[id]?.name??'未识别对象';
    const calendar=records['calendar:active']?.calendar??engine.calendarId??'legacy:30-day';
    const date=minute=>Number.isFinite(minute)?calendarDateAt(engine,minute,calendar).text:null;
    const commitment=(id,row,kind,from,to,deadline,details)=>{
        const due=finite(deadline),active=!closed.has(row.status);
        return {id,kind,content:row.content??row.name??'内容未记录',status:row.status??'未记录',active,
            direction:from==='player'?'outgoing':'incoming',counterparty:to===null&&from==='player'?'尚无人承接':name(from==='player'?to:from),
            deadline:due,deadlineText:date(due),overdue:active&&due!==null&&due<=now,...details};
    };
    const tasks=Object.entries(s.quests??{}).filter(([,r])=>r&&[r.publisher,r.taker].includes('player'))
        .map(([id,r])=>commitment(id,r,'任务',r.publisher,r.taker,r.deadline,{grade:r.grade??null,reward:r.reward??null,
            escrow:finite(r.escrow),refund:finite(r.refund),rewardPaid:finite(r.rewardPaid),reason:r.reason??null})).sort(byDeadline);
    const obligations=Object.entries(s.obligations??{}).filter(([,r])=>r&&!r.runtimeVersion&&[r.promisor,r.promisee].includes('player'))
        .map(([id,r])=>commitment(id,r,r.type??'约定',r.promisor,r.promisee,r.deadline,
            {reason:r.reason??null,item:r.item?name(r.item):null,quantity:r.quantity??null,coins:r.coins??null}));
    for(const r of obligationRows(s))if([r.debtor,r.creditor].includes('player')){
        const view=obligationView(s,r);
        obligations.push(commitment(r.id,r,r.resource&&!['coin_river','core:coin_river'].includes(r.resource)?'实物义务':r.kind==='service'?'服务':'债务',r.debtor,r.creditor,r.deadline,{resource:r.resource??'coin_river',outstanding:view.owed,active:!view.closed,overdue:view.overdueCount>0,amountDue:view.amountDue}));
    }
    for(const [id,r]of Object.entries(records)){
        if(r?.category==='contract'&&r.parties?.includes('player'))obligations.push(commitment(id,r,'合同','player',r.parties.find(id=>id!=='player'),r.deadline??r.expires,
            {content:r.content??r.name??(r.subject?name(r.subject):'内容未记录'),kindName:r.kind??null,cost:r.cost??null,paid:r.paid??null,fulfilled:r.fulfilled??null,quantity:r.quantity??null}));
    }
    obligations.sort(byDeadline);
    const rights=questPublishingRights(engine,s,'player',{document}),known=Boolean(records['calendar:active']),limit=known?rights.limitD:(rights.limitD||null),used=known?rights.usedD:finite(s.questQuota?.[`${rights.month}_player`]);
    const quota={month:calendarDateAt(engine,now,calendar).month,period: rights.month,time:date(now),limitD:limit,usedD:used,remainingD:limit===null||used===null?null:Math.max(0,limit-used),personal:rights.personal,sources:rights.sources,units:{...engine.rules.quests?.quotaUnits}};
    const local=new Set();let location=s.location;
    while(location&&!local.has(location)){local.add(location);location=engine.byId.get(location)?.parent;}
    const holdings=Object.entries(s.buildings??{}).filter(([,r])=>r?.owner==='player')
        .map(([id,r])=>({id,name:name(id),condition:r.condition??null}));
    const settlements=Object.entries(s.settlements??{}).filter(([id,r])=>r&&(r.owner==='player'||local.has(id))).map(([id,r])=>{
        const current=placeView(engine,s,id),farm=records[`agriculture:${id}`];
        const pending=Object.entries(records).filter(([,row])=>row?.settlement===id&&
            (row.category==='governance_request'&&['待办理','待权限决定'].includes(row.status)||
             row.category==='governance_proposal'&&['议事中','意见已确认'].includes(row.status)||
             row.category==='governance_referral'&&row.status==='待上级决定'||
             row.category==='housing_application'&&row.status==='待管事办理'))
            .map(([key,row])=>({id:key,name:row.name??row.requestedOffice??(row.kind==='account_report'?'公账核对':row.category==='housing_application'?'建房申请':'建房事务'),
                status:row.status,deadline:finite(row.due),deadlineText:date(row.due),reason:row.reason??null})).sort(byDeadline);
        const reports=Object.entries(records).filter(([,row])=>row?.settlement===id&&row.category==='governance_execution')
            .map(([key,row])=>({id:key,steward:name(row.steward),status:row.status,minute:row.minute??null,time:date(row.minute),reason:row.reason??null,
                report:row.report?{...pick(row.report,['treasury','wood','stone']),fiscal:fiscal(row.report.fiscal)}:null}))
            .sort((a,b)=>(b.minute??-Infinity)-(a.minute??-Infinity));
        const projects=Object.entries(s.projects??{}).filter(([,row])=>row?.type==='工程'&&row.settlement===id)
            .map(([key,row])=>({id:key,...pick(row,['name','status','remainingDays','wood','stone'])}));
        return {id,name:name(id),scope:r.owner==='player'?'owned':'public',population:current?.population.population.value??null,
            head:current?.government.head.value?name(current.government.head.value):null,
            households:current?.population.householdCount.value??null,stock:{...pick(r,['food','treasury','wood','stone','iron']),seed:farm?.field?.seedBank??null},
            fiscal:fiscal(records[`village-fiscal:${id}`]),projects,pending,reports};
    });
    const offices=institutionOffices(engine,s).filter(o=>o.holder==='player'||o.seat===s.location).map(o=>({id:o.id,name:o.name,organization:o.organization,holder:o.holder?name(o.holder):null,own:o.holder==='player',seat:name(o.seat),onDuty:officeOnDuty(engine,s,o),powers:o.authority?.operations??[],scope:o.authority?.scope??o.name,limits:o.authority?.limits??[],applyAt:o.appointment?name(o.appointment.receiveAt):null}));
    const officeApplications=Object.values(records).filter(r=>r.category==='institution_application'&&r.applicant==='player').map(r=>({id:r.id,name:institutionOffices(engine,s).find(o=>o.id===r.office)?.name??r.office,status:r.status,deadlineText:date(r.due),reasons:r.reasons??[]}));
    const cases=Object.values(records).filter(r=>r.category==='legal_case'&&(r.parties?.includes('player')||r.offender==='player'||r.victim==='player')).map(r=>({id:r.id,status:r.status,stage:r.stage??(r.judgment?'judged':'pending'),court:name(r.court),courtId:r.court,
        fine:r.judgment?.fine??null,finePaid:r.finePaid??0,fineDischarged:r.fineDischarged??false,appeal:structuredClone(r.appeal??null),appealDeadlineText:date(r.appealDeadline),evidenceScore:r.judgment?.evidenceScore??null,
        evidence:(r.evidence??[]).map(x=>({kind:x.kind,document:x.document??null,witness:x.witness?name(x.witness):null,verified:x.verification?x.verification.authentic:null,completeness:x.verification?.completeness??null})),
        canRequestAppeal:Boolean(r.judgment&&!r.appeal&&(r.appealDeadline??Infinity)>=now)}));
    const legalPeople=Object.entries(s.npcs??{}).filter(([id,n])=>n.location===s.location&&visibleEntity(engine,document,id)).map(([id])=>({id,name:name(id)}));
    const legalPapers=Object.keys(s.itemInstances??{}).filter(id=>documentAccessible(engine,document,id)).map(id=>({id,name:documentView(engine,document,id)?.content?.slice(0,40)??'无法阅读的文书原件'}));
    return {minute:now,time:date(now),location:{id:s.location??null,name:s.location?name(s.location):null},tasks,obligations,quota,holdings,settlements,offices,officeApplications,cases,legalPeople,legalPapers};
}

export function registerUIRoutes({post,readCampaign}){
    post('/ui/affairs',async req=>{const {engine,document,reference}=await readCampaign(req);return {reference,...affairs(engine,document)};});
}
