import {reviewUpperOffice} from './high-nobility.mjs';
import {domainAuthority} from './noble-state.mjs';
import {entityTransition,settleHolderGone} from './entity-transitions.mjs';
import {qualificationForApplication} from './local-exams.mjs';
import {personOffices,personRegistrar,settlementHead,settlementGovernment,personSimulation,personName} from './entity-view.mjs';
import {digest} from './storage.mjs';
import {npcPresenceAt} from './npc-cognition.mjs';
import {npcObligationAt} from './npc-obligations.mjs';
import {societyGovernance} from './monster-society.mjs';
import {opinionAmong} from './public-opinion.mjs';
import {npcHousehold,householdMembers,npcAgeAt} from './npc-life.mjs';
import {standing} from './standing.mjs';
import {contributionTotal} from './civic.mjs';
import {grantHousingSteward,revokeHousingSteward,fileHousingApplication} from './public-projects.mjs';
import {rankedOffice} from './promotion.mjs';

const DAY=1440;
const path=id=>['state','records',id];
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=n=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const number=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error('事务数值不在允许范围');return n;};
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>1200)throw Error('需要实际事务文字');return n.trim();};
const unavailable='现有任命未授予建房审批、公共工程支出或转授审批权；须转交白石镇议事机构，转交不等于批准';

// Read the four existing charters. Neither occupation nor a player-authored
// authorization record can supply an appointment missing from these sources.
function profile(engine,settlement){
    const p=engine.world.settlementProfiles?.find(p=>p.id===settlement);
    const g=p?.details?.governance,ag=engine.rules.agriculture?.settlements.find(p=>p.settlement===settlement);
    if(!g?.appointment?.source||g.referral?.status!=='referral-only'||!ag||g.head!==ag.manager)throw Error('本流程仅支持已有村级任命与转交机构的四村');
    return {p,g,ag};
}
function source(engine,settlement,at,state=null){
    if(state){const head=settlementHead(engine,state,settlement).value;const office=head&&personOffices(engine,state,head,{settlement}).find(e=>e.value.office==='office_village_head');if(office?.override)return office.value.source??office.source;}
    const {g,ag}=profile(engine,settlement),a=g.appointment;
    const law=engine.rules.law?.codes.find(c=>c.id===a.lawCode);
    if(!safe(a.effectiveDay)||a.effectiveDay*DAY>at||a.head!==g.head||!law?.judges.includes(g.head)||!law.locations.includes(ag.counter))throw Error('任命来源、主体、法典或生效日不能核验');
    return a.source;
}
function local(engine,location,settlement){
    const seen=new Set();
    while(location&&!seen.has(location)){if(location===settlement)return true;seen.add(location);location=engine.byId.get(location)?.parent;}
    return false;
}
// Adult members of the settlement's households as they stand in this
// campaign: someone who moved away no longer counts, a newcomer who moved in
// does, the dead do not, and campaign-born children count once grown.
export function eligible(engine,settlement,state){
    const {p}=profile(engine,settlement);
    return residentAdults(engine,settlement,state,p);
}
// Population membership does not imply appointment powers. Promotion also
// reads residents in remote settlements which have no four-village charter.
export function residentAdults(engine,settlement,state,p=engine.world.settlementProfiles?.find(p=>p.id===settlement)){
    const houses=(engine.world.households??[]).filter(h=>h.settlement===settlement);
    const people=new Set([...p?.residentIds??[],...houses.flatMap(h=>householdMembers(engine,state,h.id)),
        ...Object.values(state.created??{}).filter(p=>p.generated==='population'&&p.settlement===settlement).map(p=>p.id)]);
    return [...people].filter(id=>npcHousehold(engine,state,id)?.settlement===settlement&&state.npcs?.[id]?.status!=='死亡'
        &&(npcAgeAt(engine,state,id)??0)>=18).sort();
}
function person(d,engine,name){
    const id=engine.resolve(name,'npc'),actor=d.get('state','npcs',id);
    if(!(engine.world.npcs.some(n=>n.id===id)||personSimulation(engine,d.get('state'),id).value)||!awake(actor)||actor.location!==d.get('state','location'))throw Error('需要既有人物实际在场且清醒；名册不代替参与');
    return id;
}
function chair(d,engine,settlement,name){
    const {g}=profile(engine,settlement);
    if(d.get('state','location')!==g.meetingPlace)throw Error('须在本村登记议事屋办理');
    const gov=settlementGovernment(engine,d.get('state'),settlement),current=gov.head.value??gov.acting?.value;
    if(!name||!current||(name==='player'?'player':person(d,engine,name))!==current)throw Error('须指定有来源的本村在场头人或代理人');
    source(engine,settlement,d.get('state','minute'),d.get('state'));return current;
}
function record(d,id,category,settlement){
    const r=d.get(...path(id));
    if(r?.category!==category||r.settlement!==settlement)throw Error('事务编号不存在或属于其他村');
    return r;
}
// Deliberation reads only what the people actually in the hall have learned.
function hallOpinion(d,engine,settlement){
    const {g}=profile(engine,settlement),state=d.get('state'),all=eligible(engine,settlement,state);
    const present=Object.entries(state.npcs).filter(([id,n])=>all.includes(id)&&awake(n)&&n.location===g.meetingPlace).map(([id])=>id);
    return {place:g.meetingPlace,present:present.sort(),topics:opinionAmong(engine,d.document,present),note:'只计在场且实际获知的人；未获知者不计入比例。'};
}
function unique(d,id){if(d.get(...path(id)))throw Error('事务编号已占用');}
function proposal(d,engine,args,eventId,settlement){
    const {g,p}=profile(engine,settlement);
    if(d.get('state','location')!==g.meetingPlace)throw Error('须在本村登记议事屋提出议案');
    const plot=engine.resolve(args.plot);
    if(!engine.world.locations.some(p=>p.id===plot)||!local(engine,plot,settlement))throw Error('地块不属于本村');
    const issue=args.issue?p.details.problems.find(i=>i.id===args.issue):null;
    if(args.issue&&(!issue||issue.location!==plot))throw Error('议案问题与现有地点不相符');
    const all=eligible(engine,settlement,d.get('state')),affected=issue?[...new Set(issue.stakeholders.map(s=>s.person))].sort():all;
    if(affected.some(id=>!all.includes(id)))throw Error('当事人资格缺少成年住户依据');
    const id=`governance_proposal:${eventId}`;unique(d,id);
    const row={category:'governance_proposal',id,settlement,proposer:'player',name:text(args.name),plot,
        issue:issue?.id??null,wood:number(args.wood??0,0,10000),stone:number(args.stone??0,0,10000),days:number(args.days??1,1,365),
        budget:number(args.budget??0,0,1000000),fee:number(args.proposedFee??0,0,1000000),
        taxBps:number(args.taxBps??p.details.economy.tax.rateBps,0,10000),
        eligible:all,affected,opinions:[],status:'议事中',minute:d.get('state','minute'),sourceEvent:eventId};
    d.set(path(id),row);return {proposal:id,meeting:row,note:'须逐人当面登记意见；意见通过不授予官职、地权或支出权限。'};
}

function permission(d,engine,id,settlement,at){
    const a=record(d,id,'authorization',settlement),{g}=profile(engine,settlement);
    // Only the normal grant tool's receipt and the unchanged source appointment
    // support this permission; a bare category/action record is insufficient.
    const receipt=d.get(...path(`governance_source:${a.sourceEvent}`));
    if(a.action!=='account_report'||a.grantor!==g.head||a.appointmentSource!==source(engine,settlement,at)||
        receipt?.result?.authorization!==id||receipt?.result?.permission?.sourceEvent!==a.sourceEvent||
        receipt.result.permission.grantee!==a.grantee||digest(a)!==digest(receipt.result.permission)||
        !safe(a.createdAt)||a.createdAt>at||!safe(a.expires)||a.expires<=at||a.revoked||
        a.scope?.actions?.length!==1||a.scope.actions[0]!=='account_report'||a.scope.budget!==0||a.scope.fee!==0||
        !eligible(engine,settlement,d.get('state')).includes(a.grantee))throw Error('授权来源不成立、已撤销、到期或超出范围');
    return a;
}
function runRequest(d,engine,requestId,authorization,at,presence=d.get('state')){
    const request=d.get(...path(requestId));
    if(request?.category!=='governance_request')throw Error('没有该待办事务');
    const a=permission(d,engine,authorization,request.settlement,at);
    if(request.authorization!==authorization)throw Error('待办未交给该管事');
    const old=d.get(...path(`governance_execution:${requestId}`));
    if(old)return {...old,duplicate:true};
    if(at<request.due)throw Error('待办尚未到约定办理时间');
    const actor=presence.npcs[a.grantee],actual=d.get('state','npcs',a.grantee);
    if(!awake(actor)||!awake(actual)||actor.location!==a.scope.counter||presence.player.companions?.includes(a.grantee))throw Error('管事未实际在登记议事屋清醒办事');
    if(npcObligationAt(d.get('state'),a.grantee,at)||Object.values(d.get('state','npcAutonomy','tasks')??{}).some(t=>t.status==='进行中'&&[t.npc,t.action.seller].includes(a.grantee)&&t.start<=at&&at<t.finish))throw Error('管事正在履行已登记约定或自主工作，不能同时代办');
    if(request.kind!=='account_report'){
        const result={category:'governance_execution',request:requestId,settlement:request.settlement,authorization,steward:a.grantee,
            status:'待权限决定',reason:unavailable,minute:at,sourceEvent:`governance_execution:${requestId}`,charged:0};
        d.set(path(result.sourceEvent),result);d.set(path(requestId),{...request,status:result.status});return result;
    }
    const account=d.get('state','settlements',request.settlement);
    if(!account||!safe(account.treasury)||!safe(account.wood))throw Error('公账余额或库存未知，不能报结算成功');
    const result={category:'governance_execution',request:requestId,settlement:request.settlement,authorization,steward:a.grantee,
        status:'已完成',minute:at,sourceEvent:`governance_execution:${requestId}`,charged:0,
        report:{treasury:account.treasury,wood:account.wood,stone:account.stone??null,
            fiscal:structuredClone(d.get(...path(`village-fiscal:${request.settlement}`))??null)}};
    d.set(path(result.sourceEvent),result);d.set(path(requestId),{...request,status:'已完成'});
    d.set(['state','npcs',a.grantee,'memoryStream'],[...d.get('state','npcs',a.grantee,'memoryStream')??[],{
        id:result.sourceEvent,sourceEvent:result.sourceEvent,kind:'governance',minute:at,location:a.scope.counter,
        participants:[a.grantee],sourceType:'亲历',content:`按限期授权核对${engine.byId.get(request.settlement).name}现存公账：公款${account.treasury}铜，木料${account.wood}。`,salience:3}]);
    return result;
}

function action(d,args,eventId){
    const society=this.world.locations.find(l=>l.id===this.resolve(args.settlement,'loc')&&l.monsterSociety);
    if(society){
        const out=societyGovernance(d,this,args,eventId,society.id);
        if(args.operation!=='governance_inspect')return out;
        const c=society.monsterSociety,meeting=c.meetingPlace??this.world.bosses.find(b=>b.id===c.leader)?.residence?.location,state=d.get('state');
        const present=this.world.npcs.filter(n=>n.society===society.id&&awake(state.npcs[n.id])&&state.npcs[n.id].location===meeting).map(n=>n.id).sort();
        return {...out,publicOpinion:{place:meeting,present,topics:opinionAmong(this,d.document,present),note:'只计在场且实际获知的成员；未获知者不计入比例。'}};
    }
    const settlement=this.resolve(args.settlement,'loc'),{g,p}=profile(this,settlement),now=d.get('state','minute');
    switch(args.operation){
    case 'governance_inspect':{
        const state=d.get('state'),head=settlementHead(this,state,settlement).value,office=head&&personOffices(this,state,head,{settlement}).find(o=>o.value.office==='office_village_head');
        return {settlement,appointment:office?.override?{...office.value,head}:head?structuredClone(g.appointment):null,
        permissions:office?.override?{head:office.value.powers,scope:settlement}:head?structuredClone(g.permissions):{head:[]},foundingAppointment:structuredClone(g.appointment),
        eligible:eligible(this,settlement,d.get('state')),referral:structuredClone(g.referral),note:unavailable,
        offices:playerOffices(d.get('state'),{settlement},this),applyAt:authorityOf(this)?.superiors?.auth_bs_office_charter?.seat??null,publicOpinion:hallOpinion(d,this,settlement),
        records:Object.entries(d.get('state','records')??{}).filter(([,r])=>r.settlement===settlement&&
            (r.category?.startsWith('governance_')||r.category==='authorization'&&r.action==='account_report')).map(([id,row])=>({id,...row})),actionScope:{kind:'instant'}};
    }
    case 'governance_propose':return proposal(d,this,args,eventId,settlement);
    case 'governance_apply':return apply(d,this,args,eventId,settlement);
    case 'governance_opinion':{
        const row=record(d,args.proposal,'governance_proposal',settlement);
        if(row.status!=='议事中')throw Error('议案已闭合，不能追加或改写意见');
        if(d.get('state','location')!==g.meetingPlace)throw Error('须在本村登记议事屋发言');
        const speaker=args.speaker==='player'?'player':person(d,this,args.speaker);
        if(speaker==='player'){
            const citizen=d.get(...path(`civic_citizen:${settlement}:player`));
            if(citizen?.category!=='civic_citizen'||citizen.subject!=='player'||citizen.settlement!==settlement||citizen.status!=='已登记')throw Error('玩家参加大会表决须有本村公民登记');
        }else if(!row.eligible.includes(speaker)||!eligible(this,settlement,d.get('state')).includes(speaker))throw Error('发言人没有本村成年住户资格');
        if(!['approve','reject','abstain'].includes(args.opinion))throw Error('意见须为approve、reject或abstain');
        const entry={speaker,opinion:args.opinion,content:text(args.content),minute:now,sourceEvent:eventId};
        const old=row.opinions.find(o=>o.speaker===speaker);
        if(old){if(old.opinion!==entry.opinion||old.content!==entry.content)throw Error('该参与者已有意见，不能替换原话');return {proposal:row.id,opinion:old,duplicate:true};}
        d.set(path(row.id),{...row,opinions:[...row.opinions,entry]});return {proposal:row.id,opinion:entry};
    }
    case 'governance_close':{
        const authority=chair(d,this,settlement,args.authority),row=record(d,args.proposal,'governance_proposal',settlement);
        if(row.status!=='议事中')return {proposal:row.id,meeting:row,duplicate:true};
        const rejected=row.opinions.filter(o=>o.opinion==='reject'),missing=row.affected.filter(id=>!row.opinions.some(o=>o.speaker===id&&o.opinion==='approve'));
        if(!rejected.length&&missing.length)return {proposal:row.id,status:'议事中',missing,note:'受影响住户未逐人同意；不代投、不按先到者人数推算多数。'};
        const closed={...row,status:rejected.length?'已否决':'意见已确认',closedAt:now,authority,appointmentSource:source(this,settlement,now,d.get('state')),closeEvent:eventId,publicOpinion:hallOpinion(d,this,settlement)};
        d.set(path(row.id),closed);return {proposal:row.id,meeting:closed,note:rejected.length?'否决后不得开工、收费或扣公共材料。':unavailable};
    }
    case 'governance_appointment':{
        chair(d,this,settlement,args.authority);
        const id=`governance_referral:${eventId}`;unique(d,id);
        const row={category:'governance_referral',settlement,applicant:'player',requestedOffice:text(args.name),
            status:'待上级决定',authority:settlementHead(this,d.get('state'),settlement).value,appointmentSource:source(this,settlement,now,d.get('state')),referral:structuredClone(g.referral),minute:now,sourceEvent:eventId,reason:'村长由上级依据贡献与村民意见任命；上级执行主体未登记，不能签发玩家官职'};
        d.set(path(id),row);return {referral:id,request:row,granted:false};
    }
    case 'governance_grant':{
        // T126: a sitting village head (the player) delegates housing review by written rules.
        if(args.authority==='player'&&args.action==='housing')return grantHousingSteward(d,this,args,eventId,settlement,g.meetingPlace);
        const authority=chair(d,this,settlement,args.authority);
        if(args.action!=='account_report')throw Error(unavailable);
        // A report only copies public balances, within the source head's existing
        // ledger duties. It confers no fiscal, judicial or land approval powers.
        if(!g.permissions.head.includes('在登记议事屋核验粮约、分列已收税款'))throw Error('任命没有可核验的公账记录权限');
        const steward=person(d,this,args.steward);
        if(steward===authority||!eligible(this,settlement,d.get('state')).includes(steward)||args.consent!==true)throw Error('管事须为另一个在场成年住户并明确同意');
        if((args.budget??0)!==0||(args.proposedFee??0)!==0||args.taxBps!==undefined&&args.taxBps!==p.details.economy.tax.rateBps)throw Error('公账报告授权无支出或收费额度，不能修改税率');
        const minutes=number(args.minutes,1,30*DAY),id=`governance_permission:${eventId}`;unique(d,id);
        const a={category:'authorization',action:'account_report',settlement,grantor:authority,grantee:steward,appointmentSource:source(this,settlement,now,d.get('state')),
            scope:{actions:['account_report'],counter:g.meetingPlace,budget:0,fee:0,taxBps:p.details.economy.tax.rateBps},
            createdAt:now,expires:now+minutes,revoked:false,consentEvent:eventId,sourceEvent:eventId};
        d.set(path(id),a);return {authorization:id,permission:a};
    }
    case 'governance_revoke':{
        const housing=d.get(...path(args.authorization));
        // The current head (the player, or a successor in the hall) replaces stewards through this same entry.
        if(housing?.category==='housing_steward'&&housing.settlement===settlement)return revokeHousingSteward(d,housing,this,playerOffices(d.get('state'),{settlement,power:'steward'},this).length?'player':chair(d,this,settlement,args.authority));
        const authority=chair(d,this,settlement,args.authority),a=record(d,args.authorization,'authorization',settlement);
        if(a.grantor!==authority||a.action!=='account_report')throw Error('只有原签发者可撤销该范围的授权');
        if(a.revoked)return {authorization:args.authorization,permission:a,duplicate:true};
        const revoked={...a,revoked:true,revokedAt:now,revokedBy:authority};d.set(path(args.authorization),revoked);return {authorization:args.authorization,permission:revoked};
    }
    case 'governance_queue':{
        const housing=d.get(...path(args.authorization));
        if(housing?.category==='housing_steward'&&housing.settlement===settlement)return fileHousingApplication(d,this,args,eventId,settlement,housing);
        const a=permission(d,this,args.authorization,settlement,now);
        chair(d,this,settlement,args.authority);
        if(!['account_report','housing'].includes(args.action))throw Error('待办类型未实现');
        let proposal=null;
        if(args.action==='housing'){
            const r=record(d,args.proposal,'governance_proposal',settlement);
            if(r.status==='已否决')throw Error('大会已否决，不能交管事开工或收费');
            proposal=r.id;
        }
        const due=number(args.due??(Math.floor(now/DAY)*DAY+600>now?Math.floor(now/DAY)*DAY+600:(Math.floor(now/DAY)+1)*DAY+600),now,now+30*DAY);
        if(due>=a.expires)throw Error('约定办理时间超出授权期限');
        const id=`governance_request:${eventId}`;unique(d,id);
        const row={category:'governance_request',id,settlement,authorization:args.authorization,steward:a.grantee,kind:args.action,proposal,
            status:'待办理',due,minute:now,sourceEvent:eventId};d.set(path(id),row);return {request:id,pending:row};
    }
    case 'governance_process':{
        const a=permission(d,this,args.authorization,settlement,now);
        if(person(d,this,args.steward)!==a.grantee)throw Error('此人不是获授权管事');
        record(d,args.request,'governance_request',settlement);
        return {execution:runRequest(d,this,args.request,args.authorization,now)};
    }
    default:throw Error('未知治理操作');
    }
}
export function governanceAction(d,args,eventId){
    const key=`governance_source:${eventId}`,old=d.get(...path(key)),fingerprint=digest(args);
    if(old){if(old.category!=='governance_receipt'||old.fingerprint!==fingerprint)throw Error('治理sourceEvent已占用，不能改写事务');return {...structuredClone(old.result),duplicate:true};}
    const result=action.call(this,d,args,eventId);
    if(args.operation!=='governance_inspect')d.set(path(key),{category:'governance_receipt',settlement:this.resolve(args.settlement,'loc'),fingerprint,result:structuredClone(result)});
    return result;
}

// Existing autonomy boundaries visit minute 600 each day. Requests share the
// same executor with the manual tool and retain a stable per-request receipt.
export function advanceGovernance(d,engine,before,after,{beforeState}={}){
    if(!beforeState)return [];
    const results=[];
    for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
        const at=day*DAY+600;if(at<=before||at>after)continue;
        const presence=at===after?d.get('state'):npcPresenceAt(engine,beforeState,before,at,d.document.randomSeed);
        for(const [id,r]of Object.entries(d.get('state','records')??{}).sort(([a],[b])=>a.localeCompare(b))){
            if(r.category!=='governance_request'||r.status!=='待办理'||r.due>at||presence.npcs[r.steward]?.location===presence.location)continue;
            try{results.push(runRequest(d,engine,id,r.authorization,at,presence));}
            catch(error){
                const key=`governance_attempt:${day}:${id}`;
                if(!d.get(...path(key)))d.set(path(key),{category:'governance_attempt',settlement:r.settlement,request:id,steward:r.steward,minute:at,sourceEvent:key,status:'未执行',reason:error.message,charged:0});
            }
        }
    }
    return results;
}

export function assertGovernedProject(d,engine,settlement,args){
    if(!engine.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.appointment)return;
    profile(engine,settlement);
    if(args.proposal){const r=record(d,args.proposal,'governance_proposal',settlement);if(r.status==='已否决')throw Error('大会已否决，不能落公共工程');}
    // All four current appointments explicitly lack this power. Do not accept
    // a hand-written authorization as a replacement for a normal source tool.
    throw Error(unavailable);
}

// ---------------------------------------------------------------- offices (T124)
// The Baishi office appoints by its published charter (rules.governance.authority):
// an application filed in person with a registrar is decided after the charter's
// waiting days from the citizen record, the village contribution ledger, the
// sitting head's view of the applicant and the adult residents' views. Holders
// are reviewed on the charter's cycle; removal stops new quota and spending but
// leaves earlier contracts as they are.
export const authorityOf=engine=>engine.rules.governance?.authority??null;
const officeKey=(settlement,office)=>`governance_office:${settlement}:${office}:player`;
const MONTH=30*DAY;
export function playerOffices(state,{settlement=null,power=null}={},engine=null){
    if(engine){const own=personOffices(engine,state,'player',{settlement,power}).map(e=>e.value),upper=domainAuthority(engine,state,'player',settlement,power);return upper&&!own.length?[upper]:own;}
    return Object.values(state.records??{}).filter(r=>r.category==='governance_office'&&r.holder==='player'&&r.status==='在任'&&r.until>state.minute
        &&(!settlement||r.settlement===settlement)&&(!power||r.powers.includes(power)));
}
// Identity quota is the largest one held, never a sum (一等男爵兼城主 = 120D).
export function officeQuotaD(state,engine){return Math.max(0,...playerOffices(state,{},engine).map(r=>r.monthlyQuotaD??0));}
function findOffice(engine,name){
    const offices=authorityOf(engine)?.offices??{};
    const row=offices[name]??Object.values(offices).find(o=>o.name===name);
    if(!row||row.appointedBy!=='auth_bs_office_charter')throw Error('没有可向公署申请的这个官职；不受理自报官职');
    return row;
}
function registrar(d,engine){
    const charter=authorityOf(engine)?.superiors?.auth_bs_office_charter;
    if(!charter)throw Error('公署任免章未登记');
    const place=d.get('state','location'),state=d.get('state');
    if(place!==charter.seat)throw Error('须在白石镇公署前厅递件');
    const staff=engine.world.npcs.filter(n=>personRegistrar(engine,state,n.id,charter.seat,charter.registrars.occupations)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===place).map(n=>n.id).sort();
    if(!staff.length)throw Error('前厅没有在岗的递件或抄录人，不能登记');
    return {charter,registrar:staff[0]};
}
const crimeJudged=(state,who='player')=>Object.values(state.records??{}).some(r=>r.category==='legal_case'&&r.offender===who&&r.judgment);
function residentViews(engine,state,settlement,who='player'){
    let support=0,oppose=0;
    for(const id of eligible(engine,settlement,state)){if(id===who)continue;const v=standing(engine,state,id,who);if(v>0)support++;else if(v<0)oppose++;}
    return {support,oppose};
}
// The same test is used at the decision and at every review.
function appraise(engine,state,settlement,office){
    const {g}=profile(engine,settlement),reasons=[],req=office.requires;
    const citizen=state.records?.[`civic_citizen:${settlement}:player`];
    if(req.citizen&&citizen?.status!=='已登记')reasons.push('不是本村登记公民');
    const points=contributionTotal(state,settlement);
    if(points<req.contribution)reasons.push(`本村贡献${points}，未达${req.contribution}`);
    const head=standing(engine,state,g.head,'player');
    if(state.npcs[g.head]?.status==='死亡'||head<req.headRecommendation.minStanding)reasons.push(`原头人不举荐（看法${head}，需${req.headRecommendation.minStanding}）`);
    const views=residentViews(engine,state,settlement);
    if(views.oppose>views.support)reasons.push(`成年住户反对${views.oppose}多于支持${views.support}`);
    if(crimeJudged(state))reasons.push('有犯罪裁定');
    return {reasons,points,head,views};
}
function apply(d,engine,args,eventId,settlement){
    const qualification=args.sourceEvent?qualificationForApplication(engine,d.get('state'),args.sourceEvent,settlement):null;
    const office=findOffice(engine,args.name);
    if(!office.settlements.includes(settlement))throw Error('该官职不辖此村');
    const {charter,registrar:clerk}=registrar(d,engine),now=d.get('state','minute');
    const state=d.get('state'),held=state.records?.[officeKey(settlement,office.id)];
    if(held?.status==='在任'&&held.until>now)throw Error('已在任此职');
    if(Object.values(state.records??{}).some(r=>r.category==='governance_application'&&r.status==='待审定'&&r.settlement===settlement&&r.office===office.id))throw Error('同一官职已有待审定的申请');
    const id=`governance_application:${eventId}`;unique(d,id);
    const row={category:'governance_application',id,applicant:'player',settlement,office:office.id,officeName:office.name,registrar:clerk,institution:charter.institution,
        filedAt:now,due:now+charter.decisionAfterDays*DAY,status:'待审定',source:office.source,sourceEvent:eventId,...(qualification?{qualification}:{})};
    d.set(path(id),row);
    return {application:id,pending:row,note:`公署按章程于登记满${charter.decisionAfterDays}日后审定；递件人只登记，不当场许诺。`};
}
function decide(d,engine,row,at){
    const state=d.get('state'),office=rankedOffice(engine,state,row.settlement,authorityOf(engine).offices[row.office]),{reasons,points,head,views}=appraise(engine,state,row.settlement,office);
    if(row.election&&(state.records[row.election]?.status!=='当选'||state.records[row.election]?.disqualified))reasons.push('推选资格已撤销');
    const basis={contribution:points,headStanding:head,residents:views};
    if(reasons.length){d.set(path(row.id),{...row,status:'未获任命',decidedAt:at,reasons,basis});return;}
    const key=officeKey(row.settlement,office.id);
    d.set(path(key),{category:'governance_office',id:key,holder:'player',settlement:row.settlement,office:office.id,name:office.name,status:'在任',
        since:at,until:at+office.termDays*DAY,nextReview:at+authorityOf(engine).superiors.auth_bs_office_charter.reviewEveryDays*DAY,
        appointedBy:office.appointingInstitution,application:row.id,basis,source:office.source,sourceEvent:row.id});
    d.set(path(row.id),{...row,status:'已任命',decidedAt:at,basis});
    entityTransition(d,engine,{id:`${row.id}:appoint`,verb:'appoint',actor:office.appointingInstitution,target:'player',minute:at,location:row.settlement,office:office.id,summary:`${state.player.name}获任${office.name}`});
}
function review(d,engine,row,at){
    if(row.upper)return reviewUpperOffice(d,engine,row,at);
    const charter=authorityOf(engine).superiors.auth_bs_office_charter,state=d.get('state');
    let reason=null;
    if(at>=row.until)reason='任期届满';
    else if(crimeJudged(state,row.holder))reason='犯罪裁定';
    else{const v=residentViews(engine,state,row.settlement,row.holder);if(v.oppose>v.support)reason=`成年住户反对${v.oppose}多于支持${v.support}`;}
    if(reason){
        const name=personOffices(engine,{...state,minute:Math.min(at,row.until-1)},row.holder,{settlement:row.settlement}).find(o=>o.value.id===row.id)?.value.name??row.name;
        d.set(path(row.id),{...row,status:'已免职',removedAt:at,reason});
        settleHolderGone(engine,d,row.holder,'removed',{minute:at,eventId:`${row.id}:dismiss:${at}`,location:row.settlement});
        entityTransition(d,engine,{id:`${row.id}:dismiss:${at}`,verb:'dismiss',actor:row.appointedBy,target:row.holder,minute:at,location:row.settlement,office:row.office,reason,summary:`${personName(engine,state,row.holder).value??row.holder}卸任${name}：${reason}`});
    }
    else d.set(path(row.id),{...row,nextReview:row.nextReview+charter.reviewEveryDays*DAY,reviews:[...(row.reviews??[]),at]});
}
const dueAt=r=>r.category==='governance_application'?r.due:Math.min(r.nextReview,r.until);
const scheduled=state=>Object.values(state.records??{}).filter(r=>r.category==='governance_application'&&r.status==='待审定'||r.category==='governance_office'&&r.status==='在任');
export function nextOfficeMinute(state,now){return Math.min(Infinity,...scheduled(state).map(dueAt).filter(m=>m>now));}
export function advanceOffices(d,engine,{after}){
    for(;;){
        const rows=scheduled(d.get('state')).filter(r=>dueAt(r)<=after).sort((a,b)=>dueAt(a)-dueAt(b)||a.id.localeCompare(b.id));
        if(!rows.length)return;
        const r=rows[0];
        if(r.category==='governance_application')decide(d,engine,r,r.due);else review(d,engine,r,dueAt(r));
    }
}

// Public money: each draw is a ledger record under an office's power and
// monthly cap, and never takes the treasury below the charter reserve.
export const monthOf=minute=>Math.floor(minute/MONTH);
export function publicSpent(state,settlement,month){
    return Object.values(state.records??{}).filter(r=>r.category==='governance_spend'&&r.settlement===settlement&&r.month===month).reduce((n,r)=>n+r.copper,0);
}
export function spendPublic(d,engine,{settlement,copper,power,purpose,sourceEvent}){
    if(!Number.isSafeInteger(copper)||copper<0)throw Error('公款数额无效');
    const state=d.get('state'),offices=playerOffices(state,{settlement,power},engine);
    if(!offices.length)throw Error('没有在任官职授予此项公款权限');
    const cap=Math.max(...offices.map(o=>o.monthlyBudgetCopper)),month=monthOf(state.minute),used=publicSpent(state,settlement,month);
    if(used+copper>cap)throw Error(`本月公款额度不足（已用${used}/${cap}铜）`);
    const treasury=d.get('state','settlements',settlement,'treasury'),reserve=authorityOf(engine).treasury.reserveCopper;
    if(!safe(treasury)||treasury-copper<reserve)throw Error(`公账余额不足：动用后须留底${reserve}铜`);
    const id=`governance_spend:${sourceEvent}`;
    if(d.get(...path(id)))throw Error('公款支出编号已占用');
    d.set(['state','settlements',settlement,'treasury'],treasury-copper);
    const row={category:'governance_spend',id,settlement,holder:'player',office:offices[0].office,month,copper,purpose,minute:state.minute,sourceEvent};
    d.set(path(id),row);return row;
}
// Money returned to the treasury (refund, unused wages) nets against the month it was drawn in.
export function refundPublic(d,{settlement,copper,month,purpose,sourceEvent}){
    const id=`governance_spend:${sourceEvent}`;
    if(!copper||d.get(...path(id)))return d.get(...path(id))??null;
    d.set(['state','settlements',settlement,'treasury'],d.get('state','settlements',settlement,'treasury')+copper);
    const row={category:'governance_spend',id,settlement,holder:'player',month,copper:-copper,purpose,minute:d.get('state','minute'),sourceEvent};
    d.set(path(id),row);return row;
}
