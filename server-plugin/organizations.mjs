import {recordsWhere,recordEntriesWhere} from './storage.mjs';
import {topUpNpc,payFromNpc} from './npc-payment.mjs';
import {preconditionFailure} from './precondition.mjs';
import {changeLegacyHoldings,changeHolding,transition} from './transition.mjs';
import {isEffective} from './lifecycle-state.mjs';
import {personView,groupView} from './entity-view.mjs';
import {actorId,actorPath} from './npc-state.mjs';
import {changeGroupCoins} from './group-account.mjs';
import {purse,treasury as treasuryAccount,escrow as escrowAccount,moveCoins,bookSide} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('organizations');
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {storedOrganization} from './organization-state.mjs';
import {orgLeaderOffice} from './holding-sources.mjs';
declareHoldingWriter('organizations',{kinds:['member_of','business_member_of','holds_office'],entities:['office','motion']});
import {entityTransition} from './entity-transitions.mjs';
import {personName} from './entity-view.mjs';
import {presentWitnesses,registerWorldEventSubscriber} from './world-events.mjs';
import {resolveCreature} from './wildlife.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {opinionAmong,knownTopics} from './public-opinion.mjs';
import {assertAcademyAdmission} from './notables.mjs';
import {familyOrganizationProjection,familyAdult} from './family-state.mjs';
import {subjectiveView,conversationLanguage} from './subjective-view.mjs';
import {npcDecision} from './npc-decision.mjs';
import {requestContractConsent} from './action-consent.mjs';
import {actionCostRule,assertActionTime,advanceActionParticipants,beginActionActivity,finishActionActivity} from './action-costs.mjs';

// Organizations as running entities: members and positions, a treasury whose
// every movement is a ledger line, a charter (entry, fee, dues, rules) and a
// way of deciding (leader, member vote, elders) whose results are executed.
// Player-founded organizations live in `organization:<id>` records. World
// factions and households are read as organizations from their own data; a
// record for them only holds what changed in this campaign (joins, removals,
// appointments, treasury delta), never a copy of the catalog.
const DAY=1440;
export const DUES_PERIOD=30*DAY,PROPOSAL_LAPSE=7*DAY,EXPEL_ARREARS=3;
export const MODES=Object.freeze({leader:'会长定',vote:'成员投票',elders:'长老定'});
export const KINDS=Object.freeze(['行会','帮派','商号','教会','会社']);
// U12: armies are organizations of kind 军团 (created by military.mjs, not by world_create).
const LEADER={行会:'会长',帮派:'帮主',商号:'掌柜',教会:'主祭',会社:'会长',家户:'家长',军团:'统领'};
const ELDER='长老',MEMBER='成员';
const key=id=>`organization:${id}`;
const path=id=>['state','records',key(id)];
const int=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`数值需在${min}到${max}之间`);return n;};
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>1200)throw preconditionFailure('需要实际文字');return n.trim();};
const awake=(n,engine,source,id)=>n&&isEffective(engine,source,id)&&!n.scheduleTravel&&!n.cognitionTravel&&!['濒死','昏迷'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const within=(engine,location,place)=>{const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;};
// Shared selector keeps current removals, vacancies and actor aliases consistent.
export const organization=(engine,state,id)=>groupView(engine,state,id)?.organization.value??null;
export function organizationsOf(state,member,engine=null){
    if(engine&&state.records?.[member]?.category==='business')return recordsWhere(state.records,'category','organization').filter(r=>r.category==='organization'&&organization(engine,state,r.id)?.members[member]).map(r=>r.id).sort();
    if(engine)return (personView(engine,state,member)?.organizations??[]).map(o=>o.value.id).sort();
    return recordsWhere(state.records,'category','organization').filter(r=>r.category==='organization'&&r.members?.[member]).map(r=>r.id).sort();
}
function rowOf(d,engine,org){
    return structuredClone({category:'organization',id:org.id,source:org.source,members:{},removed:{},treasury:0,ledger:[],...d.get(...path(org.id))});
}
// S2a：会籍与首领职位双写进持有存储（holding-sources 的 org 来源）。
const save=(d,row,engine)=>holdingSet(d,engine,path(row.id),row,'organizations');
// Close precisely the changed membership/office, then open its replacement.
// The old-source observer only projects these already chosen protocol edges.
function saveMembership(d,row,engine,eventId){
    const before=storedOrganization(engine,d.get('state'),row.id)??{members:{},leader:null};
    const members={...before.members};
    for(const m of Object.keys(row.removed??{}))delete members[m];
    for(const [m,entry]of Object.entries(row.members??{}))members[m]=entry.position;
    const leader=Object.hasOwn(row,'leader')?row.leader:before.leader;
    const changed=Object.keys(before.members).filter(m=>before.members[m]!==members[m]);
    const closures=changed.map(holder=>({holder,kinds:['member_of','business_member_of']}));
    if(before.leader&&before.leader!==leader)closures.push({holder:before.leader,kinds:['holds_office']});
    const apply=()=>{
        for(const [holder,rank]of Object.entries(members))if(before.members[holder]!==rank)
            changeHolding(d,engine,{op:'open',kind:membershipKind(d.get('state'),holder),holder,subject:row.id,terms:membershipTerms(d.get('state'),row,holder,rank),source:`org:${row.id}`,eventId:`${eventId}:member:${holder}`});
        if(leader&&leader!==before.leader)
            changeHolding(d,engine,{op:'open',kind:'holds_office',holder:leader,subject:orgLeaderOffice(row.id),source:`org:${row.id}`,eventId:`${eventId}:leader`});
        return save(d,row,engine);
    };
    const close=i=>i===closures.length?apply():changeLegacyHoldings(d,engine,{...closures[i],source:`org:${row.id}`,reason:'vacated',eventId:`${eventId}:close:${i}`},()=>close(i+1));
    return close(0);
}
const memberOwner=(state,who)=>state.records?.[who]?.category==='business'?state.records[who].owner:who;
const coinPath=(engine,who,state)=>[...actorPath(engine.world,memberOwner(state,who)),'coins'];
const memberPurse=(d,engine,who)=>purse(engine,memberOwner(d.get('state'),who));
const membershipKind=(state,who)=>state.records?.[who]?.category==='business'?'business_member_of':'member_of';
const membershipTerms=(state,row,who,rank)=>({rank,...(state.records?.[who]?.category==='business'?{representative:row.members[who].representative,feeAccount:row.members[who].feeAccount}:{})});

function organizationConsent(d,engine,org,who,{scope,role,fee=0,feePayer,eventId}){
    if(who==='player')return {allowed:true,source:eventId};
    present(d,engine,who);
    const dues=scope==='org.join'?org.charter.dues??0:0;
    const sponsored=scope==='org.join'&&feePayer==='player';
    const agreement=requestContractConsent(d,engine,{from:who,scope,subject:org.id,purpose:scope,
        terms:{fee:sponsored?0:fee,...(scope==='org.join'?{amount:sponsored?0:dues}:{}),...(role?{role}:{})},cost:{coins:sponsored?0:fee+dues},eventId});
    if(!agreement.allowed&&scope==='org.join'&&!sponsored&&fee+dues>0)return {...agreement,reason:`${String(agreement.reason).replace(/。$/,"")}；若是因为费用，可由你代付入会费和首期会费`};
    return agreement;
}
function businessMembership(d,engine,org,who,consent,eventId,scope,feePayer){
    const shop=d.get('state','records',who);if(shop?.category!=='business')return null;
    if(!['行会','商会'].includes(org.kind))throw preconditionFailure('商号须加入商会或行会');
    if(!['筹备','营业'].includes(shop.status)||!isEffective(engine,d,shop.owner))throw preconditionFailure('需要有效商号与现任代表');
    if(!within(engine,d.get('state','location'),org.seat))throw preconditionFailure('请到商会驻地办理');
    if(shop.owner!=='player')present(d,engine,shop.owner);
    {
        const agreement=organizationConsent(d,engine,org,shop.owner,{scope,fee:scope==='org.join'?org.charter.fee??0:0,feePayer,eventId});
        if(!agreement.allowed)throw preconditionFailure(`商号代表未接受会籍与会费：${agreement.reason}`);
    }
    return {representative:shop.owner,feeAccount:purse(engine,shop.owner)};
}
const actor=(d,engine,who)=>d.get(...actorPath(engine.world,who));
const resolveActor=(engine,state,name)=>{
    const direct=actorId(engine.world,name);
    if(state.npcs?.[direct]||state.creatures?.[direct])return direct;
    const id=actorId(engine.world,resolveCreature(engine,{get:(...p)=>p.slice(1).reduce((o,k)=>o?.[k],state)},name));
    if(!personView(engine,state,id))throw preconditionFailure('没有这个成员');return id;
};
// S1a: books = 账本对方账户（缴款人钱袋、入会费托管）。
function move(d,engine,row,{kind,amount,party,minute,sourceEvent,reason,balance},books){
    if(['faction','temple'].includes(row.source))changeGroupCoins(d,engine,row.id,amount,{kind,party,minute,sourceEvent,reason},books);
    else{bookSide(d,treasuryAccount(row.id),amount,books);row.treasury+=amount;}
    row.ledger=[...row.ledger??[],{kind,amount,party,minute,sourceEvent,reason,balance}];
}
function pay(d,engine,who,amount){
    topUpNpc(d,engine,memberOwner(d.get('state'),who),amount,`organization-pay:${who}`);// EC-1a 共用钱袋：NPC 入会者本人钱袋不够先从户池补足（玩家不补）
    const p=coinPath(engine,who,d.get('state')),have=d.get(...p)??0;if(have<amount)return false;d.set(p,have-amount);return true;
}
// New sponsored deposits belong to the already registered motion entity.
// Old events keep their original account key on replay.
const admissionEscrow=p=>escrowAccount(p.feePayer?`motion_${p.id}`:p.id);
function refundAdmission(d,engine,p,eventId){
    if(!p.escrow)return;
    const payer=p.feePayer??p.motion.member;
    moveCoins(d,{from:admissionEscrow(p),to:memberPurse(d,engine,payer),amount:p.escrow,writer:'organizations',eventId});
    const path=coinPath(engine,payer,d.get('state'));d.set(path,(d.get(...path)??0)+p.escrow);
}
function bookAdmission(d,engine,row,{member,fee,dues=0,payer=member,account,minute,eventId}){
    for(const [kind,amount]of [['入会费',fee],['首期会费',dues]])if(amount){
        const balance=['faction','temple'].includes(row.source)?groupView(engine,d.get('state'),row.id).treasury.value:row.treasury;
        move(d,engine,row,{kind,amount,party:member,minute,sourceEvent:eventId,balance:balance+amount,...(payer!==member?{reason:`${payer}代付`}:{})},{account,writer:'organizations',eventId});
    }
}
function deciders(state,org){
    const all=Object.keys(org.members).filter(m=>state.records?.[m]?.category!=='business').sort();
    if(org.charter.mode==='leader'&&org.leader&&all.includes(org.leader))return {mode:'leader',people:[org.leader]};
    if(org.charter.mode!=='vote'){const e=all.filter(m=>m===org.leader||org.members[m].position===ELDER);if(e.length)return {mode:'elders',people:e};}
    return {mode:'vote',people:all};
}
function tally(p){
    const yes=p.votes.filter(v=>p.deciders.includes(v.voter)&&v.opinion==='approve').length,no=p.votes.filter(v=>p.deciders.includes(v.voter)&&v.opinion==='reject').length,n=p.deciders.length;
    if(!n)return null;
    return yes*2>n?'通过':no*2>=n?'否决':null;
}
function findOrg(engine,d,name){
    const state=d.get('state');let id=name;
    if(!state.records?.[key(id)]&&!engine.world.households?.some(h=>h.id===id)&&!organization(engine,state,id))try{id=engine.resolve(name);}catch{throw preconditionFailure('没有这个组织');}
    const org=organization(engine,state,id);if(!org)throw preconditionFailure('没有这个组织');return org;
}
function present(d,engine,name){
    const id=resolveActor(engine,d.get('state'),name),n=actor(d,engine,id);
    if(!awake(n,engine,d,id)||n.location!==d.get('state','location'))throw preconditionFailure('需要此人实际在场且清醒');
    return id;
}
const event=(org,op,extra={})=>({verb:'organize',target:org.id,tags:['organization',`org:${op}`,`kind:${org.kind}`],...extra});

// Executing a decided motion. Returns the outcome text stored on the proposal.
function execute(d,engine,org,p,minute,sourceEvent){
    const row=rowOf(d,engine,org),m=p.motion,treasury=()=>['faction','temple'].includes(row.source)?groupView(engine,d.get('state'),org.id).treasury.value:row.treasury;
    let outcome='已执行';
    if(m.action==='admit'){
        row.members[m.member]={position:MEMBER,joinedAt:minute,arrears:0,...m.membership};delete row.removed?.[m.member];
        if(p.escrow)bookAdmission(d,engine,row,{member:m.member,fee:p.escrow-(p.firstDues??0),dues:p.firstDues??0,payer:p.feePayer??m.member,account:admissionEscrow(p),minute,eventId:sourceEvent});
    }else if(m.action==='expel'){
        if(org.members[m.member]){delete row.members[m.member];row.removed={...row.removed,[m.member]:{minute,sourceEvent}};}
    }else if(m.action==='appoint'){
        if(!org.members[m.member])outcome='执行失败：此人已不是成员';
        else{
            {
                // Charter approval and the appointee's acceptance are separate.
                // A player's own proposal/vote accepts their own appointment;
                // another caller's speaker/consent slots cannot do so for them.
                if(m.member==='player'){
                    if(p.proposer!=='player'&&!p.votes?.some(v=>v.voter==='player'&&v.opinion==='approve')&&!p.acceptance)return '待本人接受';
                    p.acceptance??={source:sourceEvent,member:'player',minute};
                }else if(!p.acceptance){
                    const person=actor(d,engine,m.member);
                    if(!awake(person,engine,d,m.member)||person.location!==d.get('state','location'))return '待本人接受';
                    const agreement=organizationConsent(d,engine,org,m.member,{scope:'org.appoint',role:m.name,eventId:`${sourceEvent}:appointment`});
                    if(!agreement.allowed)return `本人未接受：${agreement.reason}`;
                    p.acceptance={source:agreement.source,member:m.member,minute};
                }
            }
            if(m.name===org.leaderTitle){
                if(org.leader&&org.members[org.leader])row.members[org.leader]={...org.members[org.leader],position:MEMBER};
                row.leader=m.member;
            }
            row.members[m.member]={...org.members[m.member],...row.members[m.member],position:m.name,...(p.acceptance?{appointment:{proposal:p.id??null,...p.acceptance}}:{})};
        }
    }else if(m.action==='withdraw'){
        if(org.treasury<m.coins)outcome='执行失败：公库不足';
        else if(!isEffective(engine,d,m.member))outcome='执行失败：收款人不在世';
        else{
            d.set(coinPath(engine,m.member,d.get('state')),(d.get(...coinPath(engine,m.member,d.get('state')))??0)+m.coins);
            move(d,engine,row,{kind:'支取',amount:-m.coins,party:m.member,minute,sourceEvent,reason:p.content,balance:treasury()-m.coins},{account:memberPurse(d,engine,m.member),writer:'organizations',eventId:sourceEvent});
        }
    }else if(m.action==='charter'){
        row.charter={...row.charter,...m.charter};
        if((m.charter.dues??0)>0&&!row.nextDues)row.nextDues=minute+DUES_PERIOD;
    }
    if(['admit','expel','appoint'].includes(m.action))saveMembership(d,row,engine,sourceEvent);
    else save(d,row,engine);
    return outcome;
}
function recordSupport(d,engine,p){
    if(p.motion.action!=='appoint')return;
    for(const v of p.votes)if(p.deciders.includes(v.voter)&&['approve','reject'].includes(v.opinion))
        adjustStanding(d,engine,p.motion.member,v.voter,v.opinion==='approve'?5:-5,{sourceEvent:`org_support:${p.id}:${v.voter}`,reason:v.opinion==='approve'?'支持任命':'反对任命',minute:v.minute});
}
function settle(d,engine,proposalId,minute,sourceEvent){
    const prior=d.get('state','records',proposalId),org=organization(engine,d.get('state'),prior.org),decision=deciders(d.get('state'),org);
    const p={...prior,mode:decision.mode,deciders:decision.people},status=tally(p);
    recordSupport(d,engine,p);
    if(!status)return p;
    let outcome=null;
    if(status==='通过'){
        if(p.motion.action==='appoint')p.appointmentHolder=org.leader;
        outcome=execute(d,engine,org,p,minute,sourceEvent);
    }
    else if(p.escrow){refundAdmission(d,engine,p,sourceEvent);outcome='入会费已退还';}
    const closed={...p,status,outcome,closedAt:minute,closeEvent:sourceEvent};holdingSet(d,null,['state','records',proposalId],closed,'organizations');
    worldEvent(d,engine,org,`${proposalId}:close`,minute,{target:closed.motion.member??null,participants:[...closed.deciders,closed.motion.member].filter(Boolean),
        tags:['organization','org:decide',`motion:${closed.motion.action}`,status==='通过'?'passed':'rejected'],
        summary:`${org.name}${status==='通过'&&outcome==='已执行'?{admit:'接纳',expel:'除名',appoint:'任命'}[p.motion.action]??'议定':'议决未执行'}${p.motion.member?personName(engine,d.get('state'),p.motion.member).value??p.motion.member:'章程事项'}${p.motion.action==='appoint'?`为${p.motion.name}`:''}`});
    return closed;
}
function motionOf(engine,d,org,args){
    const action=args.action,state=d.get('state');
    if(org.source==='family'&&action==='expel')throw preconditionFailure('族亲由真实亲属关系派生，不能用组织除名抹去');
    if(org.source==='family'&&action==='appoint'&&args.name===org.leaderTitle&&!familyAdult(engine,state,args.member))throw preconditionFailure('族长须为成年成员');
    if(action==='charter'){
        const charter={};
        if(args.choice!==undefined){if(!MODES[args.choice])throw preconditionFailure('议事方式须为leader、vote或elders');charter.mode=args.choice;}
        if(args.coins!==undefined)charter.dues=int(args.coins,0,100000);
        if(args.cost!==undefined)charter.fee=int(args.cost,0,100000);
        if(args.consent!==undefined)charter.approval=args.consent===true;
        if(args.content!==undefined)charter.rules=[text(args.content)];
        if(!Object.keys(charter).length)throw preconditionFailure('章程修订至少改一项');
        return {action,charter};
    }
    if(!['expel','appoint','withdraw'].includes(action))throw preconditionFailure('组织议案须为expel、appoint、withdraw或charter');
    const member=state.records?.[args.member]?.category==='business'?args.member:args.member==='player'?'player':resolveActor(engine,state,args.member);
    if(action==='expel'){if(!org.members[member])throw preconditionFailure('此人不是成员');if(member===org.leader)throw preconditionFailure('不能除名现任首脑，先改任');}
    if(action==='appoint'){if(state.records?.[member]?.category==='business')throw preconditionFailure('职位须由人物担任，商号会籍不授予人物职位');if(!org.members[member])throw preconditionFailure('只能任命现有成员');return {action,member,name:text(args.name)};}
    if(action==='withdraw'){
        if(!isEffective(engine,d,member))throw preconditionFailure('收款人须是现存人物');
        return {action,member,coins:int(args.coins,1,1e9)};
    }
    return {action,member};
}
function propose(d,engine,org,motion,proposer,eventId,{escrow=0,feePayer,firstDues=0,content=null,response=null}={}){
    const id=`organization_proposal:${eventId}`;if(d.get('state','records',id))throw preconditionFailure('议案编号已占用');
    const {mode,people}=deciders(d.get('state'),org),minute=d.get('state','minute');
    const votes=people.includes(proposer)&&motion.action!=='admit'?[{voter:proposer,opinion:'approve',minute,sourceEvent:eventId,...(response?{basis:response.basis,decision:response.decision}:{})}]:[];
    if(escrow)payFromNpc(d,engine,{payer:memberOwner(d.get('state'),feePayer??motion.member),to:admissionEscrow({id,feePayer}),amount:escrow,writer:'organizations',eventId});
    holdingSet(d,null,['state','records',id],{category:'organization_proposal',id,org:org.id,motion,proposer,mode,deciders:people,votes,escrow,...(feePayer?{feePayer,firstDues}:{}),content,status:'议事中',minute,sourceEvent:eventId},'organizations');
    return settle(d,engine,id,minute,eventId);
}

// Elections use the same proposal, majority and appointment executor as ordinary U1 motions.
export function electOrganizationLeader(d,engine,org,eventId){
    if(org.charter.mode!=='vote'||!org.members.player)throw preconditionFailure('本组织不实行成员选任或玩家不是成员');
    const p=propose(d,engine,org,{action:'appoint',member:'player',name:org.leaderTitle},'player',eventId);
    if(p.status!=='议事中')return p;
    const votes=[...p.votes];
    for(const voter of p.deciders.filter(v=>v!=='player')){
        const [opinion,basis]=npcVote(engine,d.get('state'),org,voter,p);
        votes.push({voter,opinion,basis,minute:d.get('state','minute'),sourceEvent:eventId});
    }
    holdingSet(d,null,['state','records',p.id],{...p,votes},'organizations');return settle(d,engine,p.id,d.get('state','minute'),eventId);
}

// NPC deciders who did not vote in person vote at the next day boundary by
// their own regard; recorded with the basis so the result can be read back.
function npcVote(engine,state,org,voter,p){
    const m=p.motion,regard=who=>personView(engine,state,voter)?standing(engine,state,voter,who):standing(engine,state,org.id,who);
    if(m.member===voter)return ['approve','本人事项'];
    if(m.action==='admit')return regard(m.member)>-20?['approve','不反感申请人']:['reject','对申请人有敌意'];
    if(m.action==='expel'&&state.records?.[m.member]?.category==='business'){
        const topics=[...knownTopics(engine,{state},voter).values()].filter(t=>t.actor===m.member&&t.act==='harm');
        if(topics.length)return ['approve',`商号失信：${topics.map(t=>t.memoryId).join(',')}`];
    }
    if(m.action==='expel')return org.members[m.member]?.arrears>0||regard(m.member)<=-30?['approve','欠费或交恶']:['reject','无除名理由'];
    if(m.action==='appoint')return regard(m.member)>=10?['approve','信任被任命者']:['reject','信任不足'];
    if(m.action==='withdraw')return m.coins*5<=org.treasury&&org.members[m.member]&&regard(m.member)>=0?['approve','支出在公库五分之一内且付给成员']:['reject','支出过大或付给外人'];
    const c=m.charter;
    return (c.dues??org.charter.dues)<=org.charter.dues*2+5&&(c.fee??org.charter.fee)<=org.charter.fee*2+20?['approve','负担可承受']:['reject','会费涨幅过大'];
}
function appointmentOpinion(d,engine,org,voter,p){
    const [opinion,basis]=npcVote(engine,d.get('state'),org,voter,p);
    const view=subjectiveView(engine,d.document,voter),decision=npcDecision(view,{kind:'org.appoint',from:p.proposer??'player',cost:{coins:0}});
    if(!conversationLanguage(view,engine,d)||decision.outcome!=='agree')throw preconditionFailure(`任免机关尚未同意：${decision.reason}`);
    return {opinion,basis,decision};
}
function worldEvent(d,engine,org,id,minute,extra){
    if(d.get('state','records',`world_event:${id}`))return;
    entityTransition(d,engine,{id,minute,location:org.seat??null,witnesses:[],verb:'organize',actor:org.id,
        visibility:org.source==='faction'&&org.charter?.mode==='vote'?'public':'members',
        summary:`${org.name}成员资格发生变化`,...extra});
}

// Only an explicit charter can make a witnessed duel decide a vacancy.
export function organizationDuelContext(d,engine,id,challenger,target){
    const org=organization(engine,d.get('state'),id);
    if(!org||org.leader||!org.charter.rules?.some(r=>/约斗|比试/.test(r)&&/继任|承继|继位/.test(r)))throw preconditionFailure('章程未授权以约斗决定空缺首脑');
    if([challenger,target].some(m=>org.members[m]?.position!==ELDER))throw preconditionFailure('争位双方须为本组织合法长老');
    return {org:org.id};
}
export const SPLIT_MARGIN=20;
export function settleOrganizationDuel(d,engine,duel,winner,eventId){
    if(!duel.org)return null;
    const org=organization(engine,d.get('state'),duel.org);
    // The vacancy may have been filled legally while the duel was in progress.
    if(!org||org.leader)return null;
    const loser=duel.challenger===winner?duel.target:duel.challenger;
    if(!org.members[winner]||org.members[winner].position!==ELDER)return null;
    const leaves=isEffective(engine,d,loser)&&standing(engine,d.get('state'),loser,winner)<=-SPLIT_MARGIN&&standing(engine,d.get('state'),loser,org.id)<10;
    const departed=leaves?Object.keys(org.members).filter(m=>m!==winner&&m!=='player'&&
        (m===loser||standing(engine,d.get('state'),m,loser)-standing(engine,d.get('state'),m,winner)>=SPLIT_MARGIN)).sort():[];
    let acceptance;
    {
        const recorded=d.get('state','records',duel.id);
        if(recorded?.category!=='duel'||recorded.status!=='已结束'||recorded.org!==org.id||recorded.winner!==winner||![recorded.challenger,recorded.target].includes(winner))throw preconditionFailure('继任须有本人参加并已结算的章程约斗');
        organizationDuelContext(d,engine,org.id,recorded.challenger,recorded.target);
        acceptance={source:recorded.id,member:winner,minute:d.get('state','minute')};
    }
    execute(d,engine,org,{motion:{action:'appoint',member:winner,name:org.leaderTitle},...(acceptance?{acceptance}:{})},d.get('state','minute'),`${eventId}:succession`);
    const row=rowOf(d,engine,organization(engine,d.get('state'),org.id));
    for(const m of departed){delete row.members[m];row.removed={...row.removed,[m]:{minute:d.get('state','minute'),sourceEvent:eventId,reason:'争位后自愿离群',following:loser}};}
    row.succession={duel:duel.id,winner,loser,departed,sourceEvent:eventId};
    saveMembership(d,row,engine,`${eventId}:split`);
    worldEvent(d,engine,org,`${eventId}:succession`,d.get('state','minute'),{target:winner,participants:Object.keys(org.members),tags:['organization','org:succession'],summary:`${org.name}依章程由${personName(engine,d.get('state'),winner).value??winner}继任；${departed.length}名成员离群`});
    return row.succession;
}
function organizationSuccessionEvents(d,engine,events){
    for(const e of events){
        if(e.verb!=='succession'||!String(e.subject??e.entity).startsWith('office_org:'))continue;
        const office=e.subject??e.entity,id=office.slice('office_org:'.length,-':leader'.length);
        if(office!==orgLeaderOffice(id))continue;
        const org=organization(engine,d.get('state'),id),key=`organization_vacancy:${e.id}`;
        if(!org||org.leader||d.get('state','records',key))continue;
        const candidates=Object.keys(org.members).filter(m=>org.members[m].position===ELDER).sort();
        holdingSet(d,engine,['state','records',key],{category:'organization_vacancy',org:id,office,previousHolder:e.previousHolder,candidates,cause:e.id,minute:e.minute??d.get('state','minute')},'organizations');
    }
}
registerWorldEventSubscriber({id:'organization_succession',order:55,on:(d,engine,events)=>organizationSuccessionEvents(d,engine,events)});

export function advanceOrganizations(d,engine,{before,after}){
    const records=category=>recordEntriesWhere(d.get('state','records'),'category',category).slice().sort(([a],[b])=>a.localeCompare(b));
    for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
        const at=day*DAY;
        for(const [id,v]of records('organization_vacancy')){
            if(v.category!=='organization_vacancy'||v.proposal)continue;
            const org=organization(engine,d.get('state'),v.org);
            if(!org||org.leader||org.charter.rules?.some(r=>/约斗|比试/.test(r)&&/继任|承继|继位/.test(r)))continue;
            const candidates=v.candidates.filter(m=>org.members[m]);
            if(!candidates.length)continue;
            const people=deciders(d.get('state'),org).people;
            candidates.sort((a,b)=>people.reduce((n,m)=>n+standing(engine,d.get('state'),m,b)-standing(engine,d.get('state'),m,a),0)||a.localeCompare(b));
            const nominee=candidates[0],p=propose(d,engine,org,{action:'appoint',member:nominee,name:org.leaderTitle},nominee,`vacancy:${v.cause}`);
            holdingSet(d,engine,['state','records',id],{...v,proposal:p.id},'organizations');
        }
        for(const [id,p]of records('organization_proposal')){
            if(p.category!=='organization_proposal'||p.status!=='议事中'||p.minute>=at)continue;
            const state=d.get('state'),org=organization(engine,state,p.org);
            if(!org){holdingSet(d,null,['state','records',id],{...p,status:'搁置',closedAt:at,outcome:'组织已不存在'},'organizations');continue;}
            const votes=[...p.votes];
            for(const voter of deciders(state,org).people)if(voter!=='player'&&!votes.some(v=>v.voter===voter)&&org.members[voter]){
                const [opinion,basis]=npcVote(engine,state,org,voter,p);votes.push({voter,opinion,basis,minute:at,offscreen:true});
            }
            holdingSet(d,null,['state','records',id],{...p,votes},'organizations');
            const closed=settle(d,engine,id,at,`${id}:${day}`);
            if(closed.status==='议事中'&&at-p.minute>=PROPOSAL_LAPSE){
                refundAdmission(d,engine,p,id);
                holdingSet(d,null,['state','records',id],{...closed,status:'搁置',closedAt:at,outcome:p.escrow?'逾期未决，入会费已退还':'逾期未决'},'organizations');
            }
        }
    }
    for(const [,r]of records('organization')){
        if(r.category!=='organization'||!r.nextDues||r.nextDues>after)continue;
        let row=structuredClone(r);
        while(row.nextDues<=after){
            const at=row.nextDues,org=organization(engine,{...d.get('state'),records:{...d.get('state','records'),[key(row.id)]:row}},row.id),dues=org.charter.dues;
            let balance=org.treasury;
            if(!dues){delete row.nextDues;break;}
            for(const m of Object.keys(org.members).sort()){
                if(!isEffective(engine,d,memberOwner(d.get('state'),m)))continue;
                const entry=org.members[m],owed=dues*(1+(entry.arrears??0)),have=d.get(...coinPath(engine,m,d.get('state')))??0;
                const paid=have>=owed?owed:have>=dues?dues:0,settled=paid?paid/dues:0,arrears=(entry.arrears??0)+1-settled;
                if(paid){d.set(coinPath(engine,m,d.get('state')),have-paid);move(d,engine,row,{kind:org.kind==='教会'?'香火供献':'会费',amount:paid,party:m,minute:at,sourceEvent:`organization_dues:${row.id}:${at}`,balance:balance+=paid},{account:memberPurse(d,engine,m),writer:'organizations'});}
                else move(d,engine,row,{kind:'欠费',amount:0,party:m,minute:at,sourceEvent:`organization_dues:${row.id}:${at}`});
                if(arrears>=EXPEL_ARREARS&&m!==org.leader){
                    delete row.members[m];row.removed={...row.removed,[m]:{minute:at,sourceEvent:`organization_dues:${row.id}:${at}`,reason:`欠费${EXPEL_ARREARS}期除名`}};
                    saveMembership(d,row,engine,`organization_dues:${row.id}:${at}:${m}`);
                    worldEvent(d,engine,org,`organization_dues:${row.id}:${at}:${m}`,at,{target:m,tags:['organization','org:expel','arrears']});
                }else row.members[m]={...entry,arrears};
            }
            row.nextDues=at+DUES_PERIOD;
        }
        save(d,row,engine);
    }
}
export function nextOrganizationMinute(state){
    let next=Infinity;for(const r of recordsWhere(state.records,'category','organization'))if(r.category==='organization'&&r.nextDues)next=Math.min(next,r.nextDues);return next;
}

// world_create type org.
export function foundOrganization(d,engine,entity,eventId){
    const kind=KINDS.includes(entity.occupation)?entity.occupation:'行会',minute=d.get('state','minute');
    const row={category:'organization',id:entity.id,source:'created',name:entity.name,kind,seat:entity.scope,founder:'player',foundedAt:minute,leader:'player',
        members:{player:{position:LEADER[kind],joinedAt:minute,arrears:0}},removed:{},
        charter:{mode:'leader',approval:true,fee:0,dues:0,rules:[entity.notes]},treasury:0,ledger:[],sourceEvent:eventId};
    save(d,row,engine);entity.kind=kind;
    return {organization:entity.id,kind,leaderTitle:LEADER[kind],charter:row.charter,organizationEvent:event(organization(engine,d.get('state'),entity.id),'found')};
}

export function inspectOrganization(engine,document,org){
    if(org.source==='family'){
        const view=familyOrganizationProjection(engine,document.state,org,Object.keys(org.members)[0]);
        return {...view,organization:org.id,kind:org.kind,source:org.source,seat:org.seat,leaderTitle:org.leaderTitle,treasury:org.treasury,actionScope:{kind:'instant'}};
    }
    const state=document.state,people=Object.keys(org.members).filter(m=>{const view=personView(engine,state,m);return m!=='player'&&view&&awake(view.actorPath.value.slice(1).reduce((o,k)=>o?.[k],state),engine,state,m)&&view.location.value===state.location;});
    return {organization:org.id,name:org.name,kind:org.kind,source:org.source,seat:org.seat,leader:org.leader,leaderTitle:org.leaderTitle,
        mode:MODES[org.charter.mode],charter:org.charter,treasury:org.treasury,nextDues:org.nextDues,
        members:Object.entries(org.members).map(([id,m])=>({id,name:id==='player'?state.player.name:engine.byId.get(id)?.name??id,...m})),
        deciders:deciders(state,org),ledger:org.ledger.slice(-20),
        proposals:Object.values(state.records??{}).filter(r=>r.category==='organization_proposal'&&r.org===org.id).slice(-10),
        publicOpinion:{present:people.sort(),topics:opinionAmong(engine,document,people)},actionScope:{kind:'instant'}};
}

export function organizationAction(d,args,eventId){
    const engine=this,org=findOrg(engine,d,args.org),state=d.get('state'),minute=state.minute,player=org.members.player;
    switch(args.operation){
    case 'org_inspect':return inspectOrganization(engine,d.document,org);
    case 'org_join':{
        const receiptKey=`org_join:${eventId}`,previous=d.get('state','records',receiptKey);
        if(previous){
            if(previous.org!==org.id||(args.member??'player')!=='player')throw preconditionFailure('同一事件编号不能改换入会申请');
            return {...previous.result,duplicate:true};
        }
        if(['household','family'].includes(org.source))throw preconditionFailure('家户家族成员随亲属迁居变化，不能申请加入');
        if(args.feePayer!==undefined&&args.feePayer!=='player')throw preconditionFailure("feePayer 只支持 'player'，缺省由入会者本人付款");
        const feePayer=args.feePayer==='player'?'player':undefined;
        const firstDues=feePayer?org.charter.dues??0:0;
        if(feePayer&&(d.get('state','player','coins')??0)<(org.charter.fee??0)+firstDues)throw preconditionFailure('代付入会费和首期会费的钱不足');
        const membership=businessMembership(d,engine,org,args.member,args.consent,eventId,'org.join',feePayer);
        const who=membership?args.member:args.member&&args.member!=='player'?present(d,engine,args.member):'player';
        if(who!=='player'&&!membership){
            {
                const agreement=organizationConsent(d,engine,org,who,{scope:'org.join',fee:org.charter.fee??0,feePayer,eventId});
                if(!agreement.allowed)throw preconditionFailure(`入会须本人当面同意：${agreement.reason}`);
            }
        }
        if(org.members[who])throw preconditionFailure('已是成员');
        if(org.source==='faction'){
            if(!within(engine,state.location,org.seat))throw preconditionFailure('须到该组织登记联络处申请');
            if(standing(engine,state,org.id,who)<=-20)throw preconditionFailure('该组织不接受与其交恶者入会');
            assertAcademyAdmission(engine,state,org,who);
        }
        if(who==='player'&&org.source==='created'&&!within(engine,state.location,org.seat))throw preconditionFailure('须到组织所在地申请');
        // A3 D36: an available NPC leader can decide in person. Pre-A3 events
        // retain their original zero-time proposal and next-day vote on replay.
        const leader=org.leader,npc=state.npcs[leader];
        if(who==='player'&&org.charter.approval&&org.charter.mode==='leader'&&leader!=='player'&&
            npc?.location===state.location&&awake(npc,engine,d,leader)&&(!engine.replaying||engine.replayResult?.cost)){
            const rule=actionCostRule(engine,'org.join');assertActionTime(d,engine,rule.timeMin,['player',leader]);
            const view=subjectiveView(engine,d.document,leader),communicates=conversationLanguage(view,engine,d);
            let decision=npcDecision(view,{kind:'org.join',from:who,cost:{minutes:rule.timeMin},tags:['admit',org.id]});
            // The charter's existing admission stance remains a policy gate;
            // a generic willingness to talk cannot overrule a hostile vote.
            const [opinion,basis]=npcVote(engine,state,org,leader,{motion:{action:'admit',member:who}});
            if(opinion==='reject')decision={...decision,outcome:'refuse',reason:basis,conditions:null};
            if(!communicates)decision={...decision,outcome:'defer',reason:'言语不通，请先找通译。',conditions:null};
            const span=beginActionActivity(d,engine,rule.activity);
            advanceActionParticipants(d,engine,rule.timeMin,eventId,[leader]);
            const current=organization(engine,d.get('state'),org.id),person=d.get('state','npcs',leader);
            if(!current||current.leader!==leader||current.charter.mode!=='leader'||!awake(person,engine,d,leader)||person.location!==d.get('state','location'))throw preconditionFailure('入会交谈中断，须按当前组织与会长重新申请');
            let result={organization:org.id,member:who,joined:false,status:decision.outcome==='refuse'?'否决':'待答复',decision};
            if(decision.outcome==='agree'){
                const fee=current.charter.fee??0,dues=feePayer?current.charter.dues??0:0;
                if(fee+dues&&!pay(d,engine,feePayer??who,fee+dues))throw preconditionFailure('入会费不足');
                const p=propose(d,engine,current,{action:'admit',member:who,membership},who,eventId,{escrow:fee+dues,feePayer,firstDues:dues});
                holdingSet(d,null,['state','records',p.id],{...p,votes:[...p.votes,{voter:leader,opinion:'approve',basis:decision.reason,decision,minute:d.get('state','minute'),sourceEvent:eventId}]},'organizations');
                const closed=settle(d,engine,p.id,d.get('state','minute'),eventId);
                if(closed.status==='通过')adjustStanding(d,engine,org.id,'player',5,{sourceEvent:eventId,reason:'入会'});
                result={...result,proposal:p.id,status:closed.status,joined:closed.status==='通过',organizationEvent:event(org,'apply',{member:who,value:fee})};
            }
            const name=engine.byId.get(leader)?.name??leader;
            result.admissionText=result.joined?`${name}同意，你已加入${org.name}。`:`${name}：${decision.reason} 入会未完成。`;
            result.cost=finishActionActivity(d,engine,span);
            holdingSet(d,null,['state','records',receiptKey],{category:'organization_join',org:org.id,result,sourceEvent:eventId},'organizations');
            return result;
        }
        const fee=org.charter.fee??0;
        if(fee+firstDues&&!pay(d,engine,feePayer??who,fee+firstDues))throw preconditionFailure('入会费不足');
        if(!org.charter.approval){
            const row=rowOf(d,engine,org);row.members[who]={position:MEMBER,joinedAt:minute,arrears:0,...membership};delete row.removed?.[who];
            bookAdmission(d,engine,row,{member:who,fee,dues:firstDues,payer:feePayer??who,account:memberPurse(d,engine,feePayer??who),minute,eventId});
            saveMembership(d,row,engine,eventId);if(who==='player')adjustStanding(d,engine,org.id,'player',5,{sourceEvent:eventId,reason:'入会'});
            worldEvent(d,engine,org,`${eventId}:join`,minute,{target:who,value:fee,witnesses:presentWitnesses(d.get('state'),state.location),participants:[who,org.leader].filter(Boolean),tags:['organization','org:join'],summary:`${personName(engine,d.get('state'),who).value??who}加入${org.name}`});
            return {organization:org.id,member:who,joined:true};
        }
        const p=propose(d,engine,org,{action:'admit',member:who,membership},membership?.representative??who,eventId,{escrow:fee+firstDues,feePayer,firstDues});
        if(p.status==='通过'&&who==='player')adjustStanding(d,engine,org.id,'player',5,{sourceEvent:eventId,reason:'入会'});
        return {organization:org.id,member:who,proposal:p.id,status:p.status,joined:p.status==='通过',note:'入会须按章程议决；入会费暂存，否决或逾期退还。',organizationEvent:event(org,'apply',{member:who,value:fee})};
    }
    case 'org_leave':{
        if(org.source==='family')throw preconditionFailure('退出居住家户用分家，族亲关系不因组织退会消失');
        const membership=businessMembership(d,engine,org,args.member,args.consent,eventId,'org.leave');
        const who=membership?args.member:args.member&&args.member!=='player'?present(d,engine,args.member):'player';
        if(who!=='player'&&!membership){
            {
                const agreement=organizationConsent(d,engine,org,who,{scope:'org.leave',eventId});
                if(!agreement.allowed)throw preconditionFailure(`退会须本人当面同意：${agreement.reason}`);
            }
        }
        if(!org.members[who])throw preconditionFailure('不是成员');
        if(who===org.leader&&Object.keys(org.members).length>1)throw preconditionFailure('首脑须先改任他人再退会');
        const row=rowOf(d,engine,org);delete row.members[who];row.removed={...row.removed,[who]:{minute,sourceEvent:eventId,reason:'退会'}};
        if(who===org.leader)row.leader=null;saveMembership(d,row,engine,eventId);
        if(org.source==='created'&&d.get('state','created',org.id)&&!Object.keys(organization(engine,d.get('state'),org.id)?.members??{}).length)
            transition(d,engine,{entity:org.id,basis:'dissolution',origin:'dissolution',eventId:`${eventId}:dissolution`});
        worldEvent(d,engine,org,`${eventId}:leave`,minute,{target:who,witnesses:presentWitnesses(d.get('state'),state.location),participants:[who,org.leader].filter(Boolean),tags:['organization','org:leave'],summary:`${personName(engine,d.get('state'),who).value??who}退出${org.name}`});
        return {organization:org.id,member:who,left:true};
    }
    case 'org_deposit':{
        const coins=int(args.coins,1,1e9);if(!pay(d,engine,'player',coins))throw preconditionFailure('铜币不足');
        const row=rowOf(d,engine,org);move(d,engine,row,{kind:'存入',amount:coins,party:'player',minute,sourceEvent:eventId,reason:args.content??null,balance:org.treasury+coins},{account:purse(engine,'player'),writer:'organizations',eventId});save(d,row,engine);
        adjustStanding(d,engine,org.id,'player',Math.min(10,2+Math.floor(coins/10)),{sourceEvent:eventId,reason:'捐入公库'});
        return {organization:org.id,deposited:coins,treasury:org.treasury+coins,organizationEvent:event(org,'deposit',{value:coins})};
    }
    case 'org_propose':{
        const proposer=args.speaker&&args.speaker!=='player'?present(d,engine,args.speaker):'player';
        if(!org.members[proposer])throw preconditionFailure('只有成员能提出议案');
        const motion=motionOf(engine,d,org,args);let response=null;
        if(motion.action==='appoint'&&proposer!=='player'){
            response=appointmentOpinion(d,engine,org,proposer,{motion,proposer:'player'});
            if(response.opinion!=='approve')throw preconditionFailure(`任免机关尚未同意：${response.basis}`);
        }
        const p=propose(d,engine,org,motion,proposer,eventId,{content:args.content??null,response});
        return {organization:org.id,proposal:p.id,mode:MODES[p.mode],deciders:p.deciders,status:p.status,outcome:p.outcome??null,
            note:p.status==='议事中'?'在场决策人可当面表态；未表态的人物在次日按各自立场表态，七日未决搁置。':undefined,
            organizationEvent:event(org,'propose',{motion:motion.action,...(motion.member?{member:motion.member}:{}),...(p.status!=='议事中'?{decided:p.status}:{})})};
    }
    case 'org_vote':{
        const id=args.proposal,p=d.get('state','records',id);
        if(p?.category!=='organization_proposal'||p.org!==org.id)throw preconditionFailure('没有这个议案');
        if(p.status==='通过'&&p.motion.action==='appoint'&&p.outcome==='待本人接受'){
            if(args.speaker&&args.speaker!=='player'||!['approve','reject'].includes(args.opinion)||args.opinion==='reject'&&p.motion.member!=='player')throw preconditionFailure('须本人接受，不能代填他人的接受意见');
            if(args.opinion==='reject'){
                holdingSet(d,null,['state','records',id],{...p,outcome:'本人拒绝',refusal:{member:'player',source:eventId,minute}},'organizations');
                return {proposal:id,status:p.status,outcome:'本人拒绝'};
            }
            const current=deciders(state,org).people;
            if(current.length!==p.deciders.length||current.some(v=>!p.deciders.includes(v))||p.motion.name===org.leaderTitle&&org.leader!==p.appointmentHolder)throw preconditionFailure('任免机关或现任已变化，须按现行章程重新议定');
            const accepted={...p,...(p.motion.member==='player'?{acceptance:{source:eventId,member:'player',minute}}:{})};
            const outcome=execute(d,engine,org,accepted,minute,eventId);
            holdingSet(d,null,['state','records',id],{...accepted,outcome,acceptanceEvent:eventId},'organizations');
            return {proposal:id,status:p.status,outcome};
        }
        if(p.status!=='议事中')return {proposal:id,status:p.status,duplicate:true};
        const voter=args.speaker&&args.speaker!=='player'?present(d,engine,args.speaker):'player';
        if(!deciders(state,org).people.includes(voter)||!org.members[voter])throw preconditionFailure('此人在本议案无表决权');
        if(!['approve','reject','abstain'].includes(args.opinion))throw preconditionFailure('意见须为approve、reject或abstain');
        if(p.votes.some(v=>v.voter===voter))throw preconditionFailure('已表态，不能改写');
        const response=p.motion.action==='appoint'&&voter!=='player'?appointmentOpinion(d,engine,org,voter,p):null;
        if(response&&response.opinion!==args.opinion)throw preconditionFailure(`不能代填任免机关的意见：${response.basis}`);
        holdingSet(d,null,['state','records',id],{...p,votes:[...p.votes,{voter,opinion:args.opinion,minute,sourceEvent:eventId,...(response?{basis:response.basis,decision:response.decision}:{}),...(args.content?{content:text(args.content)}:{})}]},'organizations');
        const closed=settle(d,engine,id,minute,eventId);
        return {proposal:id,status:closed.status,outcome:closed.outcome??null,organizationEvent:event(org,'vote',{...(closed.status!=='议事中'?{decided:closed.status,motion:closed.motion.action}:{})})};
    }
    default:throw preconditionFailure('未知组织操作');
    }
}
