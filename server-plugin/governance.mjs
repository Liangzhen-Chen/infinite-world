import {preconditionFailure} from './precondition.mjs';
import {treasury as treasuryAccount,bookSide,coinRead} from './money.mjs';
import {reviewUpperOffice} from './high-nobility.mjs';
import {domainAuthority} from './noble-state.mjs';
import {entityTransition} from './entity-transitions.mjs';
import {qualificationForApplication} from './local-exams.mjs';
import {knowledgeProficiency} from './education-state.mjs';
import {personOffices,personRegistrar,settlementHead,personSimulation,institutionOffices,officeOnDuty,personAge,questQuotaMonth} from './entity-view.mjs';
import {bookExaminationSeat,qualifiedExaminers} from './local-exams.mjs';
import {organizationState} from './organization-state.mjs';
import {digest,recordsWhere} from './storage.mjs';
import {openObligation,closeObligation} from './obligation-runtime.mjs';
import {npcPresenceAt} from './npc-cognition.mjs';
import {npcObligationAt} from './npc-obligations.mjs';
import {societyGovernance} from './monster-society.mjs';
import {opinionAmong} from './public-opinion.mjs';
import {npcHousehold,householdMembers,npcAgeAt} from './npc-life.mjs';
import {standing} from './standing.mjs';
import {contributionTotal} from './civic.mjs';
import {institutionOriginal} from './obligation-state.mjs';
import {documentAction,documentView} from './documents.mjs';
import {grantHousingSteward,revokeHousingSteward,fileHousingApplication} from './public-projects.mjs';
import {rankedOffice} from './promotion.mjs';
import {declareHoldingWriter,holdingSet,holdingsView,aliveHoldings,entityRow,ensureHoldings,holdingsActive,createEntity} from './holdings.mjs';
import {changeHolding} from './transition.mjs';
import {syncHoldingRecord,officeEntity} from './holding-sources.mjs';
import {isEffective} from './lifecycle-state.mjs';
import fs from 'node:fs';
import {registerWorldEventSubscriber,publishTransitionEvent} from './world-events.mjs';
import {domainRules} from './domain-rules.mjs';
const successionRules=JSON.parse(fs.readFileSync(new URL('../world/lore/office-succession.json',import.meta.url),'utf8'));
declareHoldingWriter('governance',{kinds:['holds_office','appointed','permit'],entities:['office','motion','item'],locations:true});

const DAY=1440;
export function institutionInputsFor(engine,document,settlement,actor='player'){
    const d=holdingsView(document),s=document.state;
    const reviewer=aliveHoldings(d,{kind:'holds_office',holder:actor}).some(h=>{
        const facts=entityRow(d,h.subject)?.facts;
        const powers=h.terms?.authority??facts?.authority?.operations??facts?.authority;
        return isEffective(engine,s,actor)&&facts?.organization===settlement&&Array.isArray(powers)&&powers.includes(domainRules(engine).governance?.reviewOperation);
    });
    const applications=Object.values(s.records??{}).filter(r=>r.category==='governance_application'&&r.settlement===settlement&&(reviewer||r.applicant===actor));
    const ids=new Set(applications.map(r=>r.id));
    return {applications:structuredClone(applications),documents:Object.values(s.records??{}).filter(r=>r.category==='governance_document'&&ids.has(r.describes)).map(r=>({id:r.id,content:r.content,sourceEvent:r.sourceEvent}))};
}
// A text document is evidence of its text/source, never a monetary claim or
// an executable ordinance. Public visibility does not reveal private history.
export function institutionDocumentView(engine,document,id,actor='player'){
    if(document.state.itemInstances?.[id]?.document?.issuedEvent)return documentView(engine,document,id,actor);
    const s=document.state,paper=institutionOriginal(engine,document,id),row=paper?.document??s.records?.[`institution_document:${id}`];
    const location=actor==='player'?s.location:s.npcs?.[actor]?.location;
    if(!row?.kind||!s.records?.[row.sourceEvent]||row.owner!==actor&&!(row.public===true&&paper?.location===location)||paper&&(paper.location!==location||row.public!==true&&paper.owner!==actor||paper.durability<=0||paper.destroyedAt!==undefined))return null;
    if(row.public===true&&knowledgeProficiency(engine,s,actor,'skill_literacy')<engine.rules.books.minimumLiteracy)return null;
    return {id,kind:row.kind,content:row.content,valid:row.valid??null,sourceEvent:row.sourceEvent,describes:row.describes??null,public:row.public};
}
function publicInstitutionDocuments(engine,document){
    // Only objects that carry an institutional text (on the unit, its entity, or a stored record) can be public documents.
    const s=document.state,carries=id=>s.itemInstances?.[id]?.document!==undefined||document.holdings?.entities?.[id]?.facts?.document!==undefined||s.records?.[`institution_document:${id}`]!==undefined;
    return [...new Set([...Object.keys(s.itemInstances??{}),...Object.keys(document.holdings?.entities??{})])].filter(carries).map(id=>institutionDocumentView(engine,document,id)).filter(r=>r?.public);
}
const path=id=>['state','records',id];
const safe=n=>Number.isSafeInteger(n)&&n>=0;
const awake=n=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const number=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure('事务数值不在允许范围');return n;};
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>1200)throw preconditionFailure('需要实际事务文字');return n.trim();};
const unavailable='现有任命未授予建房审批、公共工程支出或转授审批权；须转交白石镇议事机构，转交不等于批准';

// Read the four existing charters. Neither occupation nor a player-authored
// authorization record can supply an appointment missing from these sources.
function profile(engine,settlement){
    const p=engine.world.settlementProfiles?.find(p=>p.id===settlement);
    const g=p?.details?.governance,ag=engine.rules.agriculture?.settlements.find(p=>p.settlement===settlement);
    if(!g?.appointment?.source||g.referral?.status!=='referral-only'||!ag||g.head!==ag.manager)throw preconditionFailure('本流程仅支持已有村级任命与转交机构的四村');
    return {p,g,ag};
}
function source(engine,settlement,at,state=null){
    if(state){const head=settlementHead(engine,state,settlement).value;const office=head&&personOffices(engine,state,head,{settlement}).find(e=>e.value.office==='office_village_head');if(office?.override)return office.value.source??office.source;}
    const {g,ag}=profile(engine,settlement),a=g.appointment;
    const law=engine.rules.law?.codes.find(c=>c.id===a.lawCode);
    if(!safe(a.effectiveDay)||a.effectiveDay*DAY>at||a.head!==g.head||!law?.judges.includes(g.head)||!law.locations.includes(ag.counter))throw preconditionFailure('任命来源、主体、法典或生效日不能核验');
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
    return [...people].filter(id=>npcHousehold(engine,state,id)?.settlement===settlement&&isEffective(engine,state,id)
        &&(npcAgeAt(engine,state,id)??0)>=18).sort();
}
function person(d,engine,name){
    const id=engine.resolve(name,'npc'),actor=d.get('state','npcs',id);
    if(!(engine.world.npcs.some(n=>n.id===id)||personSimulation(engine,d.get('state'),id).value)||!isEffective(engine,d,id)||!awake(actor)||actor.location!==d.get('state','location'))throw preconditionFailure('需要既有人物实际在场且清醒；名册不代替参与');
    return id;
}
function chair(d,engine,settlement,name){
    const {g}=profile(engine,settlement);
    if(d.get('state','location')!==g.meetingPlace)throw preconditionFailure('须在本村登记议事屋办理');
    const current=settlementHead(engine,d.get('state'),settlement).value;
    if(!name||!current||(name==='player'?'player':person(d,engine,name))!==current)throw preconditionFailure('须指定有来源的本村在场头人');
    source(engine,settlement,d.get('state','minute'),d.get('state'));return current;
}
function record(d,id,category,settlement){
    const r=d.get(...path(id));
    if(r?.category!==category||r.settlement!==settlement)throw preconditionFailure('事务编号不存在或属于其他村');
    return r;
}
// Deliberation reads only what the people actually in the hall have learned.
function hallOpinion(d,engine,settlement){
    const {g}=profile(engine,settlement),state=d.get('state'),all=eligible(engine,settlement,state);
    const present=Object.entries(state.npcs).filter(([id,n])=>all.includes(id)&&awake(n)&&n.location===g.meetingPlace).map(([id])=>id);
    return {place:g.meetingPlace,present:present.sort(),topics:opinionAmong(engine,d.document,present),note:'只计在场且实际获知的人；未获知者不计入比例。'};
}
function unique(d,id){if(d.get(...path(id)))throw preconditionFailure('事务编号已占用');}
function proposal(d,engine,args,eventId,settlement){
    const {g,p}=profile(engine,settlement);
    if(d.get('state','location')!==g.meetingPlace)throw preconditionFailure('须在本村登记议事屋提出议案');
    const plot=engine.resolve(args.plot);
    if(!engine.world.locations.some(p=>p.id===plot)||!local(engine,plot,settlement))throw preconditionFailure('地块不属于本村');
    const issue=args.issue?p.details.problems.find(i=>i.id===args.issue):null;
    if(args.issue&&(!issue||issue.location!==plot))throw preconditionFailure('议案问题与现有地点不相符');
    const all=eligible(engine,settlement,d.get('state')),affected=issue?[...new Set(issue.stakeholders.map(s=>s.person))].sort():all;
    if(affected.some(id=>!all.includes(id)))throw preconditionFailure('当事人资格缺少成年住户依据');
    const id=`governance_proposal:${eventId}`;unique(d,id);
    const row={category:'governance_proposal',id,settlement,proposer:'player',name:text(args.name),plot,
        issue:issue?.id??null,wood:number(args.wood??0,0,10000),stone:number(args.stone??0,0,10000),days:number(args.days??1,1,365),
        budget:number(args.budget??0,0,1000000),fee:number(args.proposedFee??0,0,1000000),
        taxBps:number(args.taxBps??p.details.economy.tax.rateBps,0,10000),
        eligible:all,affected,opinions:[],status:'议事中',minute:d.get('state','minute'),sourceEvent:eventId};
    holdingSet(d,null,path(id),row,'governance');return {proposal:id,meeting:row,note:'须逐人当面登记意见；意见通过不授予官职、地权或支出权限。'};
}

function permission(d,engine,id,settlement,at){
    const a=record(d,id,'authorization',settlement),{g}=profile(engine,settlement);
    const signedFacts=row=>{const {registeredSeq,...facts}=row;return facts;};
    // Only the normal grant tool's receipt and the unchanged source appointment
    // support this permission; a bare category/action record is insufficient.
    const receipt=d.get(...path(`governance_source:${a.sourceEvent}`));
    if(a.action!=='account_report'||a.grantor!==settlementHead(engine,d.get('state'),settlement).value||a.appointmentSource!==source(engine,settlement,at,d.get('state'))||
        receipt?.result?.authorization!==id||receipt?.result?.permission?.sourceEvent!==a.sourceEvent||
        receipt.result.permission.grantee!==a.grantee||digest(signedFacts(a))!==digest(signedFacts(receipt.result.permission))||
        !safe(a.createdAt)||a.createdAt>at||!safe(a.expires)||a.expires<=at||a.revoked||
        a.scope?.actions?.length!==1||a.scope.actions[0]!=='account_report'||a.scope.budget!==0||a.scope.fee!==0||
        !eligible(engine,settlement,d.get('state')).includes(a.grantee))throw preconditionFailure('授权来源不成立、已撤销、到期或超出范围');
    return a;
}
function runRequest(d,engine,requestId,authorization,at,presence=d.get('state')){
    const request=d.get(...path(requestId));
    if(request?.category!=='governance_request')throw preconditionFailure('没有该待办事务');
    const a=permission(d,engine,authorization,request.settlement,at);
    if(request.authorization!==authorization)throw preconditionFailure('待办未交给该管事');
    const old=d.get(...path(`governance_execution:${requestId}`));
    if(old)return {...old,duplicate:true};
    if(at<request.due)throw preconditionFailure('待办尚未到约定办理时间');
    const actor=presence.npcs[a.grantee],actual=d.get('state','npcs',a.grantee);
    if(!awake(actor)||!awake(actual)||actor.location!==a.scope.counter||presence.player.companions?.includes(a.grantee))throw preconditionFailure('管事未实际在登记议事屋清醒办事');
    if(npcObligationAt(d.get('state'),a.grantee,at)||Object.values(d.get('state','npcAutonomy','tasks')??{}).some(t=>t.status==='进行中'&&[t.npc,t.action.seller].includes(a.grantee)&&t.start<=at&&at<t.finish))throw preconditionFailure('管事正在履行已登记约定或自主工作，不能同时代办');
    if(request.kind!=='account_report'){
        const result={category:'governance_execution',request:requestId,settlement:request.settlement,authorization,steward:a.grantee,
            status:'待权限决定',reason:unavailable,minute:at,sourceEvent:`governance_execution:${requestId}`,charged:0};
        holdingSet(d,null,path(result.sourceEvent),result,'governance');holdingSet(d,null,path(requestId),{...request,status:result.status},'governance');return result;
    }
    const account=d.get('state','settlements',request.settlement);
    if(!account||!safe(account.treasury)||!safe(account.wood))throw preconditionFailure('公账余额或库存未知，不能报结算成功');
    const result={category:'governance_execution',request:requestId,settlement:request.settlement,authorization,steward:a.grantee,
        status:'已完成',minute:at,sourceEvent:`governance_execution:${requestId}`,charged:0,
        report:{treasury:account.treasury,wood:account.wood,stone:account.stone??null,
            fiscal:structuredClone(d.get(...path(`village-fiscal:${request.settlement}`))??null)}};
    holdingSet(d,null,path(result.sourceEvent),result,'governance');holdingSet(d,null,path(requestId),{...request,status:'已完成'},'governance');
    if(request.obligation)closeObligation(d,engine,{id:request.obligation,actor:a.grantee,reason:'performed',execution:result.sourceEvent},`${result.sourceEvent}:fulfilled`);
    d.set(['state','npcs',a.grantee,'memoryStream'],[...d.get('state','npcs',a.grantee,'memoryStream')??[],{
        id:result.sourceEvent,sourceEvent:result.sourceEvent,kind:'governance',minute:at,location:a.scope.counter,
        participants:[a.grantee],sourceType:'亲历',content:`按限期授权核对${engine.byId.get(request.settlement).name}现存公账：公款${account.treasury}铜，木料${account.wood}。`,salience:3}]);
    return result;
}

function action(d,args,eventId){
    if(args.operation?.startsWith('governance_office_')||args.operation==='governance_exam_refer')return institutionalAction(d,this,args,eventId);
    const society=this.world.locations.find(l=>l.id===this.resolve(args.settlement,'loc')&&l.monsterSociety);
    if(society){
        const out=societyGovernance(d,this,args,eventId,society.id);
        if(args.operation!=='governance_inspect')return out;
        const c=society.monsterSociety,meeting=c.meetingPlace??this.world.bosses.find(b=>b.id===c.leader)?.residence?.location,state=d.get('state');
        const present=this.world.npcs.filter(n=>n.society===society.id&&awake(state.npcs[n.id])&&state.npcs[n.id].location===meeting).map(n=>n.id).sort();
        return {...out,publicOpinion:{place:meeting,present,topics:opinionAmong(this,d.document,present),note:'只计在场且实际获知的成员；未获知者不计入比例。'}};
    }
    const settlement=this.resolve(args.settlement,'loc'),now=d.get('state','minute');
    if(args.operation==='governance_inspect'&&!this.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.appointment){
        return {settlement,institutionalInputs:institutionInputsFor(this,d.document,settlement),documents:publicInstitutionDocuments(this,d.document),actionScope:{kind:'instant'}};
    }
    const {g,p}=profile(this,settlement);
    switch(args.operation){
    case 'governance_inspect':{
        const state=d.get('state'),head=settlementHead(this,state,settlement).value,office=head&&personOffices(this,state,head,{settlement}).find(o=>o.value.office==='office_village_head');
        return {settlement,documents:publicInstitutionDocuments(this,d.document),institutionalInputs:institutionInputsFor(this,d.document,settlement),appointment:office?.override?{...office.value,head}:head?structuredClone(g.appointment):null,
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
        if(row.status!=='议事中')throw preconditionFailure('议案已闭合，不能追加或改写意见');
        if(d.get('state','location')!==g.meetingPlace)throw preconditionFailure('须在本村登记议事屋发言');
        const speaker=args.speaker==='player'?'player':person(d,this,args.speaker);
        if(speaker==='player'){
            const citizen=d.get(...path(`civic_citizen:${settlement}:player`));
            if(citizen?.category!=='civic_citizen'||citizen.subject!=='player'||citizen.settlement!==settlement||citizen.status!=='已登记')throw preconditionFailure('玩家参加大会表决须有本村公民登记');
        }else if(!row.eligible.includes(speaker)||!eligible(this,settlement,d.get('state')).includes(speaker))throw preconditionFailure('发言人没有本村成年住户资格');
        if(!['approve','reject','abstain'].includes(args.opinion))throw preconditionFailure('意见须为approve、reject或abstain');
        const entry={speaker,opinion:args.opinion,content:text(args.content),minute:now,sourceEvent:eventId};
        const old=row.opinions.find(o=>o.speaker===speaker);
        if(old){if(old.opinion!==entry.opinion||old.content!==entry.content)throw preconditionFailure('该参与者已有意见，不能替换原话');return {proposal:row.id,opinion:old,duplicate:true};}
        holdingSet(d,null,path(row.id),{...row,opinions:[...row.opinions,entry]},'governance');return {proposal:row.id,opinion:entry};
    }
    case 'governance_close':{
        const authority=chair(d,this,settlement,args.authority),row=record(d,args.proposal,'governance_proposal',settlement);
        if(row.status!=='议事中')return {proposal:row.id,meeting:row,duplicate:true};
        const rejected=row.opinions.filter(o=>o.opinion==='reject'),missing=row.affected.filter(id=>!row.opinions.some(o=>o.speaker===id&&o.opinion==='approve'));
        if(!rejected.length&&missing.length)return {proposal:row.id,status:'议事中',missing,note:'受影响住户未逐人同意；不代投、不按先到者人数推算多数。'};
        const closed={...row,status:rejected.length?'已否决':'意见已确认',closedAt:now,authority,appointmentSource:source(this,settlement,now,d.get('state')),closeEvent:eventId,publicOpinion:hallOpinion(d,this,settlement)};
        holdingSet(d,null,path(row.id),closed,'governance');return {proposal:row.id,meeting:closed,note:rejected.length?'否决后不得开工、收费或扣公共材料。':unavailable};
    }
    case 'governance_appointment':{
        chair(d,this,settlement,args.authority);
        const id=`governance_referral:${eventId}`;unique(d,id);
        const row={category:'governance_referral',settlement,applicant:'player',requestedOffice:text(args.name),
            status:'待上级决定',authority:settlementHead(this,d.get('state'),settlement).value,appointmentSource:source(this,settlement,now,d.get('state')),referral:structuredClone(g.referral),minute:now,sourceEvent:eventId,reason:'村长由上级依据贡献与村民意见任命；上级执行主体未登记，不能签发玩家官职'};
        holdingSet(d,null,path(id),row,'governance');return {referral:id,request:row,granted:false};
    }
    case 'governance_grant':{
        // T126: a sitting village head (the player) delegates housing review by written rules.
        if(args.authority==='player'&&args.action==='housing')return grantHousingSteward(d,this,args,eventId,settlement,g.meetingPlace);
        const authority=chair(d,this,settlement,args.authority);
        if(args.action!=='account_report')throw Error(unavailable);
        // A report only copies public balances, within the source head's existing
        // ledger duties. It confers no fiscal, judicial or land approval powers.
        if(!g.permissions.head.includes('在登记议事屋核验粮约、分列已收税款'))throw preconditionFailure('任命没有可核验的公账记录权限');
        const steward=person(d,this,args.steward);
        if(steward===authority||!eligible(this,settlement,d.get('state')).includes(steward)||args.consent!==true)throw preconditionFailure('管事须为另一个在场成年住户并明确同意');
        if((args.budget??0)!==0||(args.proposedFee??0)!==0||args.taxBps!==undefined&&args.taxBps!==p.details.economy.tax.rateBps)throw preconditionFailure('公账报告授权无支出或收费额度，不能修改税率');
        const minutes=number(args.minutes,1,30*DAY),id=`governance_permission:${eventId}`;unique(d,id);
        const a={category:'authorization',action:'account_report',settlement,grantor:authority,grantee:steward,appointmentSource:source(this,settlement,now,d.get('state')),
            scope:{actions:['account_report'],counter:g.meetingPlace,budget:0,fee:0,taxBps:p.details.economy.tax.rateBps},
            createdAt:now,expires:now+minutes,revoked:false,consentEvent:eventId,sourceEvent:eventId};
        holdingSet(d,null,path(id),a,'governance');return {authorization:id,permission:d.get(...path(id))};
    }
    case 'governance_revoke':{
        const housing=d.get(...path(args.authorization));
        if(housing?.category==='housing_steward'&&housing.settlement===settlement)return revokeHousingSteward(d,housing,this);
        const authority=chair(d,this,settlement,args.authority),a=record(d,args.authorization,'authorization',settlement);
        if(a.grantor!==authority||a.action!=='account_report')throw preconditionFailure('只有原签发者可撤销该范围的授权');
        if(a.revoked)return {authorization:args.authorization,permission:a,duplicate:true};
        const revoked={...a,revoked:true,revokedAt:now,revokedBy:authority};holdingSet(d,null,path(args.authorization),revoked,'governance');return {authorization:args.authorization,permission:revoked};
    }
    case 'governance_queue':{
        const housing=d.get(...path(args.authorization));
        if(housing?.category==='housing_steward'&&housing.settlement===settlement)return fileHousingApplication(d,this,args,eventId,settlement,housing);
        const a=permission(d,this,args.authorization,settlement,now);
        chair(d,this,settlement,args.authority);
        if(!['account_report','housing'].includes(args.action))throw preconditionFailure('待办类型未实现');
        let proposal=null;
        if(args.action==='housing'){
            const r=record(d,args.proposal,'governance_proposal',settlement);
            if(r.status==='已否决')throw preconditionFailure('大会已否决，不能交管事开工或收费');
            proposal=r.id;
        }
        const due=number(args.due??(Math.floor(now/DAY)*DAY+600>now?Math.floor(now/DAY)*DAY+600:(Math.floor(now/DAY)+1)*DAY+600),now,now+30*DAY);
        if(due>=a.expires)throw preconditionFailure('约定办理时间超出授权期限');
        const id=`governance_request:${eventId}`;unique(d,id);
        const row={category:'governance_request',id,settlement,authorization:args.authorization,steward:a.grantee,kind:args.action,proposal,
            status:'待办理',due,minute:now,sourceEvent:eventId,obligation:`approval:${id}`};
        openObligation(d,this,{id:row.obligation,kind:'approval',debtor:a.grantee,creditor:'player',actor:a.grantee,subject:id,amount:0,deadline:due,terms:{authorization:args.authorization,expires:a.expires}},`${eventId}:approval`);
        holdingSet(d,null,path(id),row,'governance');return {request:id,pending:row};
    }
    case 'governance_process':{
        const a=permission(d,this,args.authorization,settlement,now);
        if(person(d,this,args.steward)!==a.grantee)throw preconditionFailure('此人不是获授权管事');
        record(d,args.request,'governance_request',settlement);
        return {execution:runRequest(d,this,args.request,args.authorization,now)};
    }
    default:throw preconditionFailure('未知治理操作');
    }
}
export function governanceAction(d,args,eventId){
    if(args.operation?.startsWith('governance_document_'))return documentAction(d,this,args,eventId);
    const key=`governance_source:${eventId}`,old=d.get(...path(key)),fingerprint=digest(args);
    if(old){if(old.category!=='governance_receipt'||old.fingerprint!==fingerprint)throw preconditionFailure('治理sourceEvent已占用，不能改写事务');return {...structuredClone(old.result),duplicate:true};}
    const result=action.call(this,d,args,eventId);
    if(args.operation!=='governance_inspect'&&args.operation!=='governance_office_inspect'){
        // The办理 receipt is the producer; reading/printing it never performs
        // the business again.
        {

            publishTransitionEvent(d,this,{id:eventId,verb:'request',actor:'player',target:null,minute:d.get('state','minute'),location:d.get('state','location'),source:{receipt:key},tags:['institution'],summary:'办理机构事务'});
        }
        holdingSet(d,null,path(key),{category:'governance_receipt',...(args.settlement?{settlement:this.resolve(args.settlement,'loc')}:{}),fingerprint,result:structuredClone(result)},'governance');
    }
    return result;
}

function saveInstitutionAppointment(d,engine,key,row,office,holder,eventId){
    for(const h of aliveHoldings(d,{kind:'holds_office',subject:office.id}))changeHolding(d,engine,{op:'close',id:h.id,reason:'vacated',eventId:`${eventId}:close`});
    if(holder)changeHolding(d,engine,{op:'open',kind:'holds_office',holder,subject:office.id,source:`org:${office.organization}`,eventId:`${eventId}:open`});
    holdingSet(d,engine,path(key),row,'governance',eventId);
}
function institutionalAction(d,engine,args,eventId){
    ensureHoldings(d,engine);
    const state=d.get('state'),now=state.minute,offices=institutionOffices(engine,state),office=offices.find(o=>o.id===args.name);
    if(args.operation==='governance_office_inspect')return {offices:offices.filter(o=>o.seat===state.location||o.holder==='player').map(o=>({...o,onDuty:officeOnDuty(engine,state,o)})),applications:Object.values(state.records??{}).filter(r=>r.category==='institution_application'&&r.applicant==='player'),actionScope:{kind:'instant'}};
    if(args.operation==='governance_exam_refer'){
        const profession=engine.resolve(args.profession,'profession'),examiner=engine.resolve(args.teacher,'npc'),role=engine.byId.get(profession);
        const desks=offices.filter(o=>o.seat===state.location&&o.authority?.profession===profession&&o.authority.operations?.some(p=>['certify','refer_examiner'].includes(p))&&officeOnDuty(engine,state,o));
        const desk=desks.find(o=>o.authority.operations.includes('refer_examiner'))??desks.find(o=>o.holder===examiner);
        if(!desk||!qualifiedExaminers(engine,state,profession,state.location).includes(examiner))throw preconditionFailure('没有在岗且有转介权限的登记席位或合格考官');
        const row=bookExaminationSeat(d,engine,{id:`exam:${eventId}`,profession,examiner,registrar:desk.holder,location:state.location,minutes:role.entry?.minutes??120,fee:role.fee,available:true,passed:false});
        return {examination:row.id,seat:row};
    }
    if(!office?.appointment)throw preconditionFailure('此席位没有已发布的任免链');
    const policy=office.appointment;
    const issuer=aliveHoldings(d,{kind:'holds_office',subject:policy.issuer})[0]?.holder;
    const issuerOffice=offices.find(o=>o.id===policy.issuer)||{id:policy.issuer,holder:issuer,seat:policy.receiveAt,receptionHours:engine.rules.governance?.officeHours?[engine.rules.governance.officeHours]:[]};
    if(args.operation==='governance_office_apply'){
        if(state.location!==policy.receiveAt)throw preconditionFailure('须到任免机关的接待地点申请');
        if(!issuer||!officeOnDuty(engine,state,issuerOffice,issuer))throw preconditionFailure('任免机关当前无人清醒在岗接待');
        if(office.holder==='player')throw preconditionFailure('已经在任此席位');
        if(Object.values(state.records??{}).some(r=>r.category==='institution_application'&&r.office===office.id&&r.applicant==='player'&&r.status==='待决定'))throw preconditionFailure('已有待决定申请');
        const row={category:'institution_application',id:`institution_application:${eventId}`,office:office.id,organization:office.organization,applicant:'player',receivedBy:issuer,filedAt:now,due:now+policy.decisionAfterMinutes,status:'待决定',sourceEvent:eventId};
        holdingSet(d,engine,path(row.id),row,'governance');return {application:row.id,pending:row};
    }
    if(!issuer||args.authority!==issuer||!officeOnDuty(engine,state,issuerOffice,issuer)||state.location!==policy.receiveAt)throw preconditionFailure('须由现任任免机关在岗办理；收件人不能代行');
    const key=`organization:${office.organization}`,old=state.records?.[key]??{category:'organization',id:office.organization,source:'faction',members:{}};
    if(args.operation==='governance_office_decide'){
        const application=state.records?.[args.request];
        if(application?.category!=='institution_application'||application.office!==office.id||application.applicant!=='player'||application.status!=='待决定'||now<application.due)throw preconditionFailure('申请不存在、已决定或尚未到审定时间');
        const reasons=[],req=policy.requires??{},profession=req.profession&&engine.byId.get(req.profession),skill=profession?.entry?.skill;
        if(req.adult&&(personAge(engine,state,'player')?.value??0)<18)reasons.push('未成年');
        if(skill&&(state.skills?.[skill]?.proficiency??0)<(profession.entry.minimumProficiency??100))reasons.push('实际技能未达到任职要求');
        if(standing(engine,state,issuer,'player')<policy.minimumStanding)reasons.push('任免机关不信任申请人');
        if(crimeJudged(state))reasons.push('有犯罪裁定');
        const decision={...application,status:reasons.length?'未获任命':'已批准',decidedAt:now,decidedBy:issuer,reasons,decisionEvent:eventId};
        holdingSet(d,engine,path(application.id),decision,'governance');
        return {decision};
    }
    if(args.operation==='governance_office_appoint'){
        const application=state.records?.[args.request];
        if(application?.category!=='institution_application'||application.office!==office.id||application.status!=='已批准'||application.decidedBy!==issuer)throw preconditionFailure('须由当前任免机关先作出批准决定');
        const appointment={holder:application.applicant,since:now,sourceEvent:eventId,application:application.id,decisionEvent:application.decisionEvent,appointedBy:issuer,issuerOffice:policy.issuer};
        saveInstitutionAppointment(d,engine,key,{...old,offices:{...old.offices,[office.id]:appointment}},office,appointment.holder,eventId);
        holdingSet(d,engine,path(application.id),{...application,status:'已任命',appointedAt:now,appointmentEvent:eventId},'governance');
        return {appointment:{office:office.id,...appointment}};
    }
    if(args.operation==='governance_office_remove'){
        const holder=office.holder;
        if(!holder||policy.removal!=='holder_request_or_judgment'||holder!=='player'&&!crimeJudged(state,holder))throw preconditionFailure('免职须由持有人请求或已有犯罪裁定，不接受自报理由');
        const prior=old.offices?.[office.id]??{holder,since:0,source:office.source};
        saveInstitutionAppointment(d,engine,key,{...old,offices:{...old.offices,[office.id]:{holder:null,since:now,removedAt:now,removedBy:issuer,sourceEvent:eventId,previous:prior}}},office,null,eventId);
        const application=prior.application&&state.records?.[prior.application];
        if(application)holdingSet(d,engine,path(application.id),{...application,status:'已免职',removedAt:now,removalEvent:eventId},'governance');
        return {office:office.id,removed:holder,removedAt:now,appointedAt:prior.since};
    }
    throw preconditionFailure('未知席位操作');
}

// Existing autonomy boundaries visit minute 600 each day. Requests share the
// same executor with the manual tool and retain a stable per-request receipt.
export function advanceGovernance(d,engine,before,after,{beforeState}={}){
    if(!beforeState)return [];
    const results=[];
    for(let day=Math.floor(before/DAY);day<=Math.floor(after/DAY);day++){
        const at=day*DAY+600;if(at<=before||at>after||at<beforeState.minute)continue;
        const presence=at===beforeState.minute?beforeState:at===after?d.get('state'):npcPresenceAt(engine,beforeState,before,at,d.get('randomSeed'));
        for(const [id,r]of Object.entries(d.get('state','records')??{}).sort(([a],[b])=>a.localeCompare(b))){
            if(r.category!=='governance_request'||r.status!=='待办理'||r.due>at||presence.npcs[r.steward]?.location===presence.location)continue;
            const grant=d.get(...path(r.authorization));
            if(grant?.revoked||grant?.expires<=at){
                holdingSet(d,null,path(id),{...r,status:'已退回',resolvedAt:at,reason:'授权已撤销或到期'},'governance');
                const key=`governance_attempt:${day}:${id}`;
                if(!d.get(...path(key)))holdingSet(d,null,path(key),{category:'governance_attempt',settlement:r.settlement,request:id,steward:r.steward,minute:at,sourceEvent:key,status:'未执行',reason:'授权已撤销或到期',charged:0},'governance');
                if(r.obligation&&isEffective(engine,d,r.steward)&&!['昏迷','濒死','死亡'].includes(d.get('state','npcs',r.steward,'status')))closeObligation(d,engine,{id:r.obligation,actor:r.steward,reason:'authorization_expired'},`${id}:expired`);
                continue;
            }
            try{results.push(runRequest(d,engine,id,r.authorization,at,presence));}
            catch(error){
                const key=`governance_attempt:${day}:${id}`;
                if(!d.get(...path(key)))holdingSet(d,null,path(key),{category:'governance_attempt',settlement:r.settlement,request:id,steward:r.steward,minute:at,sourceEvent:key,status:'未执行',reason:error.message,charged:0},'governance');
            }
        }
    }
    return results;
}

export function assertGovernedProject(d,engine,settlement,args){
    if(!engine.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.appointment)return;
    profile(engine,settlement);
    if(args.proposal){const r=record(d,args.proposal,'governance_proposal',settlement);if(r.status==='已否决')throw preconditionFailure('大会已否决，不能落公共工程');}
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
    if(!row||row.appointedBy!=='auth_bs_office_charter')throw preconditionFailure('没有可向公署申请的这个官职；不受理自报官职');
    return row;
}
function registrar(d,engine){
    const charter=authorityOf(engine)?.superiors?.auth_bs_office_charter;
    if(!charter)throw preconditionFailure('公署任免章未登记');
    const place=d.get('state','location'),state=d.get('state');
    if(place!==charter.seat)throw preconditionFailure('须在白石镇公署前厅递件');
    const staff=engine.world.npcs.filter(n=>personRegistrar(engine,state,n.id,charter.seat,charter.registrars.occupations)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===place).map(n=>n.id).sort();
    if(!staff.length)throw preconditionFailure('前厅没有在岗的递件或抄录人，不能登记');
    return {charter,registrar:staff[0]};
}
const crimeJudged=(state,holder='player')=>Object.values(state.records??{}).some(r=>r.category==='legal_case'&&r.offender===holder&&r.judgment);
function residentViews(engine,state,settlement,holder='player'){
    let support=0,oppose=0;
    for(const id of eligible(engine,settlement,state)){const v=standing(engine,state,id,holder);if(v>0)support++;else if(v<0)oppose++;}
    return {support,oppose};
}
// The same test is used at the decision and at every review.
function appraise(engine,state,settlement,office,{holder='player',vacancy=false}={}){
    const {g}=profile(engine,settlement),reasons=[],req=office.requires;
    const citizen=state.records?.[`civic_citizen:${settlement}:${holder}`];
    if(req.citizen&&citizen?.status!=='已登记')reasons.push('不是本村登记公民');
    const points=contributionTotal(state,settlement,holder);
    if(points<req.contribution)reasons.push(`本村贡献${points}，未达${req.contribution}`);
    const head=standing(engine,state,g.head,holder),headAvailable=isEffective(engine,state,g.head);
    if(!(vacancy&&!headAvailable)&&(!headAvailable||head<req.headRecommendation.minStanding))reasons.push(`原头人不举荐（看法${head}，需${req.headRecommendation.minStanding}）`);
    const views=residentViews(engine,state,settlement,holder);
    if(views.oppose>views.support)reasons.push(`成年住户反对${views.oppose}多于支持${views.support}`);
    if(crimeJudged(state,holder))reasons.push('有犯罪裁定');
    return {reasons,points,head,views};
}
function apply(d,engine,args,eventId,settlement){
    const qualification=args.sourceEvent?qualificationForApplication(engine,d.get('state'),args.sourceEvent,settlement):null;
    const office=findOffice(engine,args.name);
    if(!office.settlements.includes(settlement))throw preconditionFailure('该官职不辖此村');
    const {charter,registrar:clerk}=registrar(d,engine),now=d.get('state','minute');
    const state=d.get('state'),held=state.records?.[officeKey(settlement,office.id)];
    if(held?.status==='在任'&&held.until>now)throw preconditionFailure('已在任此职');
    if(Object.values(state.records??{}).some(r=>r.category==='governance_application'&&r.status==='待审定'&&r.settlement===settlement&&r.office===office.id))throw preconditionFailure('同一官职已有待审定的申请');
    const id=`governance_application:${eventId}`;unique(d,id);
    const row={category:'governance_application',id,applicant:'player',settlement,office:office.id,officeName:office.name,registrar:clerk,institution:charter.institution,
        filedAt:now,due:now+charter.decisionAfterDays*DAY,status:'待审定',source:office.source,sourceEvent:eventId,...(qualification?{qualification}:{})};
    holdingSet(d,null,path(id),row,'governance');
    return {application:id,pending:row,note:`公署按章程于登记满${charter.decisionAfterDays}日后审定；递件人只登记，不当场许诺。`};
}
function decide(d,engine,row,at){
    const state=d.get('state'),office=rankedOffice(engine,state,row.settlement,authorityOf(engine).offices[row.office]),{reasons,points,head,views}=appraise(engine,state,row.settlement,office);
    if(row.election&&(state.records[row.election]?.status!=='当选'||state.records[row.election]?.disqualified))reasons.push('推选资格已撤销');
    const basis={contribution:points,headStanding:head,residents:views};
    if(reasons.length){holdingSet(d,null,path(row.id),{...row,status:'未获任命',decidedAt:at,reasons,basis},'governance');return;}
    const key=officeKey(row.settlement,office.id);
    closeOfficeIncumbents(d,engine,row.settlement,office.id,at,row.id);
    appointOfficeRecord(d,engine,{category:'governance_office',id:key,holder:'player',settlement:row.settlement,office:office.id,name:office.name,status:'在任',
        since:at,until:at+office.termDays*DAY,nextReview:at+authorityOf(engine).superiors.auth_bs_office_charter.reviewEveryDays*DAY,
        appointedBy:office.appointingInstitution,application:row.id,basis,source:office.source,sourceEvent:row.id},row.id);
    syncHoldingRecord(d,engine,key,{writer:'governance',eventId:row.id});
    holdingSet(d,null,path(row.id),{...row,status:'已任命',decidedAt:at,basis},'governance');
    entityTransition(d,engine,{id:`${row.id}:appoint`,verb:'appoint',actor:office.appointingInstitution,target:'player',minute:at,location:row.settlement,office:office.id,summary:`${state.player.name}获任${office.name}`});
}
// Domain decisions close an incumbent through the protocol before writing the
// compatibility appointment. The office, rather than its former holder, owns
// subordinate appointments.
export function closeOfficeIncumbents(d,engine,settlement,office,at,eventId){
    ensureHoldings(d,engine);
    const subject=currentOfficeSubject(d,settlement,office);
    for(const h of aliveHoldings(d,{kind:'holds_office',subject}))changeHolding(d,engine,{op:'close',id:h.id,reason:'vacated',eventId:`${eventId}:${h.id}`});
    for(const row of Object.values(d.get('state','records')??{}).filter(r=>r.category==='governance_office'&&r.settlement===settlement&&r.office===office&&r.status==='在任'))
        holdingSet(d,engine,path(row.id),{...row,status:'已免职',removedAt:at,reason:'上级改任'},'governance');
}
function currentOfficeSubject(d,settlement,office){
    const remote=office==='office_village_head'?Object.values(d.get('state','remote')??{}).flatMap(r=>r.skeleton?.offices??[]).find(o=>o.settlement===settlement&&o.source==='generated'):null;
    return officeEntity(settlement,remote?.id??office);
}
export function appointOfficeRecord(d,engine,row,eventId){
    ensureHoldings(d,engine);const subject=currentOfficeSubject(d,row.settlement,row.office);
    if(holdingsActive(d)){
        const office=subject.startsWith('office_rg_')?subject:row.office,source=`office:${row.settlement}|${office}`;
        if(!entityRow(d,subject))createEntity(d,{id:subject,kind:'office',facts:{settlement:row.settlement,office},source,writer:'governance'});
        changeHolding(d,engine,{op:'open',kind:'holds_office',holder:row.holder,subject,source,eventId:`${eventId}:office`});
    }
    holdingSet(d,engine,path(row.id),row,'governance');return row;
}
export function consumeOfficeVacancies(d,engine,after=d.get('state','minute')){
    ensureHoldings(d,engine);
    const events=recordsWhere(d.get('state','records'),'kind','holds_office').filter(r=>r.category==='world_event'&&r.verb==='succession'&&r.kind==='holds_office'&&r.minute<=after).sort((a,b)=>a.minute-b.minute||a.id.localeCompare(b.id));
    for(const event of events){
        const key=`governance_vacancy:${event.id}`;if(d.get(...path(key)))continue;
        const facts=entityRow(d,event.subject)?.facts;if(!facts?.settlement||!facts.office)continue;
        const state=d.get('state'),settlement=facts.settlement,office=facts.office;
        const source=authorityOf(engine)?.offices?.[office],election=engine.rules.governance?.elections?.[office];
        const filled=aliveHoldings(d,{kind:'holds_office',subject:event.subject}).length>0;
        const due=event.minute+(engine.rules.elections?.campaignDays??0)*DAY;
        holdingSet(d,engine,path(key),{category:'governance_vacancy',id:key,subject:event.subject,settlement,office,previousHolder:event.previousHolder,cause:event.id,
            status:filled?'已有继任':election?.settlements.includes(settlement)&&source?'补选中':'待原任免机构决定',due,source:successionRules.source,sourceEvent:event.id},'governance');
    }
    for(const vacancy of recordsWhere(d.get('state','records'),'category','governance_vacancy').filter(r=>r.category==='governance_vacancy'&&r.status==='补选中'&&r.due<=after)){
        if(aliveHoldings(d,{kind:'holds_office',subject:vacancy.subject}).length){holdingSet(d,engine,path(vacancy.id),{...vacancy,status:'已有继任'},'governance');continue;}
        const state=d.get('state'),{g}=profile(engine,vacancy.settlement),electorate=eligible(engine,vacancy.settlement,state);
        const candidates=(g.coordinators??[]).filter(id=>id!==vacancy.previousHolder&&electorate.includes(id)&&isEffective(engine,d,id)&&!['濒死','昏迷','患病'].includes(state.npcs?.[id]?.status)&&
            !appraise(engine,state,vacancy.settlement,authorityOf(engine).offices[vacancy.office],{holder:id,vacancy:true}).reasons.length);
        const votes=electorate.map(voter=>{const choices=candidates.map(id=>({id,value:standing(engine,state,voter,id)})).filter(c=>c.value>0).sort((a,b)=>b.value-a.value||a.id.localeCompare(b.id));return {voter,candidate:choices[0]?.id??null};});
        const winner=candidates.find(id=>votes.filter(v=>v.candidate===id).length*2>electorate.length);
        let appointment=null;
        if(winner){
            const office=authorityOf(engine).offices[vacancy.office],charter=authorityOf(engine).superiors[office.appointedBy];
            const id=`governance_office:${vacancy.settlement}:${vacancy.office}:${winner}`;
            appointment={category:'governance_office',id,holder:winner,settlement:vacancy.settlement,office:vacancy.office,status:'在任',since:vacancy.due,until:vacancy.due+office.termDays*DAY,
                nextReview:vacancy.due+charter.reviewEveryDays*DAY,appointedBy:office.appointingInstitution,source:office.source,sourceEvent:vacancy.id,election:vacancy.id};
            changeHolding(d,engine,{op:'open',kind:'holds_office',holder:winner,subject:vacancy.subject,source:`office:${vacancy.settlement}|${vacancy.office}`,eventId:`${vacancy.id}:appoint`});
            holdingSet(d,engine,path(id),appointment,'governance');
        }
        holdingSet(d,engine,path(vacancy.id),{...vacancy,status:winner?'已继任':'无人过半待补选',votes,appointment:appointment?.id??null,decidedAt:vacancy.due},'governance');
    }
}
function review(d,engine,row,at){
    if(row.upper)return reviewUpperOffice(d,engine,row,at);
    const charter=authorityOf(engine).superiors.auth_bs_office_charter,state=d.get('state');
    let reason=null;
    if(at>=row.until)reason='任期届满';
    else if(!isEffective(engine,d,row.holder))reason='失去履职资格';
    else if(crimeJudged(state,row.holder))reason='犯罪裁定';
    else{const v=residentViews(engine,state,row.settlement,row.holder);if(v.oppose>v.support)reason=`成年住户反对${v.oppose}多于支持${v.support}`;}
    if(reason){
        for(const h of aliveHoldings(d,{kind:'holds_office',holder:row.holder,subject:officeEntity(row.settlement,row.office)}))changeHolding(d,engine,{id:h.id,op:'close',reason:'vacated',eventId:`${row.id}:vacate:${at}`});
        const name=personOffices(engine,{...state,minute:Math.min(at,row.until-1)},row.holder,{settlement:row.settlement}).find(o=>o.value.id===row.id)?.value.name??row.name;
        holdingSet(d,null,path(row.id),{...row,status:'已免职',removedAt:at,reason},'governance');syncHoldingRecord(d,engine,row.id,{writer:'governance'});
        entityTransition(d,engine,{id:`${row.id}:dismiss:${at}`,verb:'dismiss',actor:row.appointedBy,target:row.holder,minute:at,location:row.settlement,office:row.office,reason,summary:`${row.holder==='player'?state.player.name:engine.byId.get(row.holder)?.name??row.holder}卸任${name}：${reason}`});
    }
    else holdingSet(d,null,path(row.id),{...row,nextReview:row.nextReview+charter.reviewEveryDays*DAY,reviews:[...(row.reviews??[]),at]},'governance');
}
const dueAt=r=>r.category==='governance_application'?r.due:Math.min(r.nextReview,r.until);
const scheduled=(state,after)=>{
 const eligible=r=>r.category==='governance_application'&&r.status==='待审定'||r.category==='governance_office'&&r.status==='在任';
 const due=r=>eligible(r)&&dueAt(r)<=after;
 const candidates=[...recordsWhere(state.records,'category','governance_application'),...recordsWhere(state.records,'category','governance_office')].filter(due);
 // Multiple due rows retain the original enumeration order before stable sorting.
 return candidates.length>1?Object.values(state.records??{}).filter(due):candidates;
};
export function nextOfficeMinute(state,now){return Math.min(Infinity,...[...recordsWhere(state.records,'category','governance_application'),...recordsWhere(state.records,'category','governance_office')].filter(r=>r.category==='governance_application'&&r.status==='待审定'||r.category==='governance_office'&&r.status==='在任').map(dueAt).filter(m=>m>now),...recordsWhere(state.records,'category','governance_vacancy').filter(r=>r.category==='governance_vacancy'&&r.status==='补选中'&&r.due>now).map(r=>r.due));}
export function advanceOffices(d,engine,{after}){
    consumeOfficeVacancies(d,engine,after);
    for(;;){
        const rows=scheduled(d.get('state'),after).sort((a,b)=>dueAt(a)-dueAt(b)||a.id.localeCompare(b.id));
        if(!rows.length){consumeOfficeVacancies(d,engine,after);return;}
        const r=rows[0];
        if(r.category==='governance_application')decide(d,engine,r,r.due);else review(d,engine,r,dueAt(r));
    }
}
function governanceVacancyEvents(d,engine,events){
    if(events.some(e=>e.verb==='succession'&&e.kind==='holds_office'))consumeOfficeVacancies(d,engine,d.get('state','minute'));
}
registerWorldEventSubscriber({id:'governance_vacancy',order:85,on:(d,engine,events)=>governanceVacancyEvents(d,engine,events)});

// Public money: each draw is a ledger record under an office's power and
// monthly cap, and never takes the treasury below the charter reserve.
export const monthOf=minute=>Math.floor(minute/MONTH);
export function publicSpent(state,settlement,month){
    return Object.values(state.records??{}).filter(r=>r.category==='governance_spend'&&r.settlement===settlement&&r.month===month).reduce((n,r)=>n+r.copper,0);
}
// S1a: books = 账本对方账户（工程或委托托管）。
export function spendPublic(d,engine,{settlement,copper,power,purpose,sourceEvent,books,actor='player'}){
    if(!Number.isSafeInteger(copper)||copper<0)throw preconditionFailure('公款数额无效');
    const state=d.get('state'),offices=actor==='player'?playerOffices(state,{settlement,power},engine):personOffices(engine,state,actor,{settlement,power}).map(e=>e.value);
    if(!offices.length)throw preconditionFailure('没有在任官职授予此项公款权限');
    const cap=Math.max(...offices.map(o=>o.monthlyBudgetCopper)),month=questQuotaMonth(engine,state),used=publicSpent(state,settlement,month);
    if(used+copper>cap)throw preconditionFailure(`本月公款额度不足（已用${used}/${cap}铜）`);
    const treasury=d.get('state','settlements',settlement,'treasury'),reserve=authorityOf(engine).treasury.reserveCopper;
    const held=coinRead(d,{point:'public.treasury',account:treasuryAccount(settlement),legacy:()=>treasury});
    if(!safe(treasury)||held-copper<reserve)throw preconditionFailure(`公账余额不足：动用后须留底${reserve}铜`);
    const id=`governance_spend:${sourceEvent}`;
    if(d.get(...path(id)))throw preconditionFailure('公款支出编号已占用');
    bookSide(d,treasuryAccount(settlement),-copper,books);
    d.set(['state','settlements',settlement,'treasury'],treasury-copper);
    const row={category:'governance_spend',id,settlement,holder:actor,office:offices[0].office,month,copper,purpose,minute:state.minute,sourceEvent};
    holdingSet(d,null,path(id),row,'governance');return row;
}
// Money returned to the treasury (refund, unused wages) nets against the month it was drawn in.
export function refundPublic(d,{settlement,copper,month,purpose,sourceEvent,books,actor='player'}){
    const id=`governance_spend:${sourceEvent}`;
    if(!copper||d.get(...path(id)))return d.get(...path(id))??null;
    bookSide(d,treasuryAccount(settlement),copper,books);
    d.set(['state','settlements',settlement,'treasury'],d.get('state','settlements',settlement,'treasury')+copper);
    const row={category:'governance_spend',id,settlement,holder:actor,month,copper:-copper,purpose,minute:d.get('state','minute'),sourceEvent};
    holdingSet(d,null,path(id),row,'governance');return row;
}
