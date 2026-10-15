import {organizationState as organization,memberOrganizations} from './organization-state.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {opinionAmong} from './public-opinion.mjs';
import {assertAcademyAdmission} from './notables.mjs';

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
const int=(n,min,max)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(`数值需在${min}到${max}之间`);return n;};
const text=n=>{if(typeof n!=='string'||!n.trim()||n.length>1200)throw Error('需要实际文字');return n.trim();};
const awake=n=>n&&!n.scheduleTravel&&!n.cognitionTravel&&!['死亡','濒死','昏迷'].includes(n.status)&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const within=(engine,location,place)=>{const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;};
// Shared selector keeps current removals, vacancies and actor aliases consistent.
export {organizationState as organization} from './organization-state.mjs';
export function organizationsOf(state,member,engine=null){
    if(engine)return memberOrganizations(engine,state,member).map(o=>o.id).sort();
    return Object.values(state.records??{}).filter(r=>r.category==='organization'&&r.members?.[member]).map(r=>r.id).sort();
}
function rowOf(d,engine,org){
    return structuredClone(d.get(...path(org.id))??{category:'organization',id:org.id,source:org.source,members:{},removed:{},treasury:0,ledger:[]});
}
const save=(d,row)=>d.set(path(row.id),row);
const coinPath=who=>who==='player'?['state','player','coins']:['state','npcs',who,'coins'];
function move(d,row,{kind,amount,party,minute,sourceEvent,reason,balance}){
    row.ledger=[...row.ledger??[],{kind,amount,party,minute,sourceEvent,reason,balance}];
}
function pay(d,who,amount){
    const p=coinPath(who),have=d.get(...p)??0;if(have<amount)return false;d.set(p,have-amount);return true;
}
function deciders(state,org){
    const all=Object.keys(org.members).sort();
    if(org.charter.mode==='leader'&&org.leader&&all.includes(org.leader))return {mode:'leader',people:[org.leader]};
    if(org.charter.mode!=='vote'){const e=all.filter(m=>m===org.leader||org.members[m].position===ELDER);if(e.length)return {mode:'elders',people:e};}
    return {mode:'vote',people:all};
}
function tally(p){
    const yes=p.votes.filter(v=>v.opinion==='approve').length,no=p.votes.filter(v=>v.opinion==='reject').length,n=p.deciders.length;
    return yes*2>n?'通过':no*2>=n?'否决':null;
}
function findOrg(engine,d,name){
    const state=d.get('state');let id=name;
    if(!state.records?.[key(id)]&&!engine.world.households?.some(h=>h.id===id))try{id=engine.resolve(name);}catch{throw Error('没有这个组织');}
    const org=organization(engine,state,id);if(!org)throw Error('没有这个组织');return org;
}
function present(d,engine,name){
    const id=engine.resolve(name,'npc'),n=d.get('state','npcs',id);
    if(!awake(n)||n.location!==d.get('state','location'))throw Error('需要此人实际在场且清醒');
    return id;
}
const event=(org,op,extra={})=>({verb:'organize',target:org.id,tags:['organization',`org:${op}`,`kind:${org.kind}`],...extra});

// Executing a decided motion. Returns the outcome text stored on the proposal.
function execute(d,engine,org,p,minute,sourceEvent){
    const row=rowOf(d,engine,org),m=p.motion,start=row.treasury,treasury=()=>org.treasury+row.treasury-start;
    let outcome='已执行';
    if(m.action==='admit'){
        row.members[m.member]={position:MEMBER,joinedAt:minute,arrears:0};delete row.removed?.[m.member];
        if(p.escrow){row.treasury+=p.escrow;move(d,row,{kind:'入会费',amount:p.escrow,party:m.member,minute,sourceEvent,balance:treasury()});}
    }else if(m.action==='expel'){
        if(org.members[m.member]){delete row.members[m.member];row.removed={...row.removed,[m.member]:{minute,sourceEvent}};}
    }else if(m.action==='appoint'){
        if(!org.members[m.member])outcome='执行失败：此人已不是成员';
        else{
            if(m.name===org.leaderTitle){
                if(org.leader&&org.members[org.leader])row.members[org.leader]={...org.members[org.leader],position:MEMBER};
                row.leader=m.member;
            }
            row.members[m.member]={...org.members[m.member],...row.members[m.member],position:m.name};
        }
    }else if(m.action==='withdraw'){
        if(org.treasury<m.coins)outcome='执行失败：公库不足';
        else if(m.member!=='player'&&!d.get('state','npcs',m.member))outcome='执行失败：收款人不在世';
        else{
            row.treasury-=m.coins;d.set(coinPath(m.member),(d.get(...coinPath(m.member))??0)+m.coins);
            move(d,row,{kind:'支取',amount:-m.coins,party:m.member,minute,sourceEvent,reason:p.content,balance:treasury()});
        }
    }else if(m.action==='charter'){
        row.charter={...row.charter,...m.charter};
        if((m.charter.dues??0)>0&&!row.nextDues)row.nextDues=minute+DUES_PERIOD;
    }
    save(d,row);return outcome;
}
function settle(d,engine,proposalId,minute,sourceEvent){
    const p=d.get('state','records',proposalId),org=organization(engine,d.get('state'),p.org),status=tally(p);
    if(!status)return p;
    let outcome=null;
    if(status==='通过')outcome=execute(d,engine,org,p,minute,sourceEvent);
    else if(p.escrow){d.set(coinPath(p.motion.member),(d.get(...coinPath(p.motion.member))??0)+p.escrow);outcome='入会费已退还';}
    const closed={...p,status,outcome,closedAt:minute,closeEvent:sourceEvent};d.set(['state','records',proposalId],closed);return closed;
}
function motionOf(engine,d,org,args){
    const action=args.action,state=d.get('state');
    if(action==='charter'){
        const charter={};
        if(args.choice!==undefined){if(!MODES[args.choice])throw Error('议事方式须为leader、vote或elders');charter.mode=args.choice;}
        if(args.coins!==undefined)charter.dues=int(args.coins,0,100000);
        if(args.cost!==undefined)charter.fee=int(args.cost,0,100000);
        if(args.consent!==undefined)charter.approval=args.consent===true;
        if(args.content!==undefined)charter.rules=[text(args.content)];
        if(!Object.keys(charter).length)throw Error('章程修订至少改一项');
        return {action,charter};
    }
    if(!['expel','appoint','withdraw'].includes(action))throw Error('组织议案须为expel、appoint、withdraw或charter');
    const member=args.member==='player'?'player':engine.resolve(args.member,'npc');
    if(action==='expel'){if(!org.members[member])throw Error('此人不是成员');if(member===org.leader)throw Error('不能除名现任首脑，先改任');}
    if(action==='appoint'){if(!org.members[member])throw Error('只能任命现有成员');return {action,member,name:text(args.name)};}
    if(action==='withdraw'){
        if(member!=='player'&&!state.npcs?.[member])throw Error('收款人须是现存人物');
        return {action,member,coins:int(args.coins,1,1e9)};
    }
    return {action,member};
}
function propose(d,engine,org,motion,proposer,eventId,{escrow=0,content=null}={}){
    const id=`organization_proposal:${eventId}`;if(d.get('state','records',id))throw Error('议案编号已占用');
    const {mode,people}=deciders(d.get('state'),org),minute=d.get('state','minute');
    const votes=people.includes(proposer)&&motion.action!=='admit'?[{voter:proposer,opinion:'approve',minute,sourceEvent:eventId}]:[];
    d.set(['state','records',id],{category:'organization_proposal',id,org:org.id,motion,proposer,mode,deciders:people,votes,escrow,content,status:'议事中',minute,sourceEvent:eventId});
    return settle(d,engine,id,minute,eventId);
}

// Elections use the same proposal, majority and appointment executor as ordinary U1 motions.
export function electOrganizationLeader(d,engine,org,eventId){
    if(org.charter.mode!=='vote'||!org.members.player)throw Error('本组织不实行成员选任或玩家不是成员');
    const p=propose(d,engine,org,{action:'appoint',member:'player',name:org.leaderTitle},'player',eventId);
    if(p.status!=='议事中')return p;
    const votes=[...p.votes];
    for(const voter of p.deciders.filter(v=>v!=='player')){
        const [opinion,basis]=npcVote(engine,d.get('state'),org,voter,p);
        votes.push({voter,opinion,basis,minute:d.get('state','minute'),sourceEvent:eventId});
    }
    d.set(['state','records',p.id],{...p,votes});return settle(d,engine,p.id,d.get('state','minute'),eventId);
}

// NPC deciders who did not vote in person vote at the next day boundary by
// their own regard; recorded with the basis so the result can be read back.
function npcVote(engine,state,org,voter,p){
    const m=p.motion,regard=who=>state.npcs?.[voter]?standing(engine,state,voter,who):standing(engine,state,org.id,who);
    if(m.member===voter)return ['approve','本人事项'];
    if(m.action==='admit')return regard(m.member)>-20?['approve','不反感申请人']:['reject','对申请人有敌意'];
    if(m.action==='expel')return org.members[m.member]?.arrears>0||regard(m.member)<=-30?['approve','欠费或交恶']:['reject','无除名理由'];
    if(m.action==='appoint')return regard(m.member)>=10?['approve','信任被任命者']:['reject','信任不足'];
    if(m.action==='withdraw')return m.coins*5<=org.treasury&&org.members[m.member]&&regard(m.member)>=0?['approve','支出在公库五分之一内且付给成员']:['reject','支出过大或付给外人'];
    const c=m.charter;
    return (c.dues??org.charter.dues)<=org.charter.dues*2+5&&(c.fee??org.charter.fee)<=org.charter.fee*2+20?['approve','负担可承受']:['reject','会费涨幅过大'];
}
function worldEvent(d,org,id,minute,extra){
    d.set(['state','records',`world_event:${id}`],{category:'world_event',id,minute,location:org.seat??null,witnesses:[],tool:'advance',verb:'organize',actor:org.id,...extra});
}

export function advanceOrganizations(d,engine,{before,after}){
    const records=()=>Object.entries(d.get('state','records')??{}).sort(([a],[b])=>a.localeCompare(b));
    for(let day=Math.floor(before/DAY)+1;day*DAY<=after;day++){
        const at=day*DAY;
        for(const [id,p]of records()){
            if(p.category!=='organization_proposal'||p.status!=='议事中'||p.minute>=at)continue;
            const state=d.get('state'),org=organization(engine,state,p.org);
            if(!org){d.set(['state','records',id],{...p,status:'搁置',closedAt:at,outcome:'组织已不存在'});continue;}
            const votes=[...p.votes];
            for(const voter of p.deciders)if(voter!=='player'&&!votes.some(v=>v.voter===voter)&&org.members[voter]){
                const [opinion,basis]=npcVote(engine,state,org,voter,p);votes.push({voter,opinion,basis,minute:at,offscreen:true});
            }
            d.set(['state','records',id],{...p,votes});
            const closed=settle(d,engine,id,at,`${id}:${day}`);
            if(closed.status!=='议事中')worldEvent(d,org,`${id}:close`,at,{target:closed.motion.member??null,tags:['organization','org:decide',`motion:${closed.motion.action}`,closed.status==='通过'?'passed':'rejected']});
            else if(at-p.minute>=PROPOSAL_LAPSE){
                if(p.escrow)d.set(coinPath(p.motion.member),(d.get(...coinPath(p.motion.member))??0)+p.escrow);
                d.set(['state','records',id],{...closed,status:'搁置',closedAt:at,outcome:p.escrow?'逾期未决，入会费已退还':'逾期未决'});
            }
        }
    }
    for(const [,r]of records()){
        if(r.category!=='organization'||!r.nextDues||r.nextDues>after)continue;
        let row=structuredClone(r);
        while(row.nextDues<=after){
            const at=row.nextDues,org=organization(engine,{...d.get('state'),records:{...d.get('state','records'),[key(row.id)]:row}},row.id),dues=org.charter.dues;
            let balance=org.treasury;
            if(!dues){delete row.nextDues;break;}
            for(const m of Object.keys(org.members).sort()){
                if(m!=='player'&&!d.get('state','npcs',m))continue;
                const entry=org.members[m],owed=dues*(1+(entry.arrears??0)),have=d.get(...coinPath(m))??0;
                const paid=have>=owed?owed:have>=dues?dues:0,settled=paid?paid/dues:0,arrears=(entry.arrears??0)+1-settled;
                if(paid){d.set(coinPath(m),have-paid);row.treasury+=paid;move(d,row,{kind:'会费',amount:paid,party:m,minute:at,sourceEvent:`organization_dues:${row.id}:${at}`,balance:balance+=paid});}
                else move(d,row,{kind:'欠费',amount:0,party:m,minute:at,sourceEvent:`organization_dues:${row.id}:${at}`});
                if(arrears>=EXPEL_ARREARS&&m!==org.leader){
                    delete row.members[m];row.removed={...row.removed,[m]:{minute:at,sourceEvent:`organization_dues:${row.id}:${at}`,reason:`欠费${EXPEL_ARREARS}期除名`}};
                    worldEvent(d,org,`organization_dues:${row.id}:${at}:${m}`,at,{target:m,tags:['organization','org:expel','arrears']});
                }else row.members[m]={...entry,arrears};
            }
            row.nextDues=at+DUES_PERIOD;
        }
        save(d,row);
    }
}
export function nextOrganizationMinute(state){
    let next=Infinity;for(const r of Object.values(state.records??{}))if(r.category==='organization'&&r.nextDues)next=Math.min(next,r.nextDues);return next;
}

// world_create type org.
export function foundOrganization(d,engine,entity,eventId){
    const kind=KINDS.includes(entity.occupation)?entity.occupation:'行会',minute=d.get('state','minute');
    const row={category:'organization',id:entity.id,source:'created',name:entity.name,kind,seat:entity.scope,founder:'player',foundedAt:minute,leader:'player',
        members:{player:{position:LEADER[kind],joinedAt:minute,arrears:0}},removed:{},
        charter:{mode:'leader',approval:true,fee:0,dues:0,rules:[entity.notes]},treasury:0,ledger:[],sourceEvent:eventId};
    save(d,row);entity.kind=kind;
    return {organization:entity.id,kind,leaderTitle:LEADER[kind],charter:row.charter,organizationEvent:event(organization(engine,d.get('state'),entity.id),'found')};
}

export function inspectOrganization(engine,document,org){
    const state=document.state,people=Object.keys(org.members).filter(m=>m!=='player'&&awake(state.npcs?.[m])&&state.npcs[m].location===state.location);
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
        if(org.source==='household')throw Error('家户成员随婚育迁居变化，不能申请加入');
        const who=args.member&&args.member!=='player'?present(d,engine,args.member):'player';
        if(who!=='player'&&args.consent!==true)throw Error('入会须本人当面同意');
        if(org.members[who])throw Error('已是成员');
        if(org.source==='faction'){
            if(!within(engine,state.location,org.seat))throw Error('须到该组织登记联络处申请');
            if(standing(engine,state,org.id,who)<=-20)throw Error('该组织不接受与其交恶者入会');
            assertAcademyAdmission(engine,state,org,who);
        }
        if(who==='player'&&org.source==='created'&&!within(engine,state.location,org.seat))throw Error('须到组织所在地申请');
        const fee=org.charter.fee??0;
        if(fee&&!pay(d,who,fee))throw Error('入会费不足');
        if(!org.charter.approval){
            const row=rowOf(d,engine,org);row.members[who]={position:MEMBER,joinedAt:minute,arrears:0};delete row.removed?.[who];
            if(fee){row.treasury+=fee;move(d,row,{kind:'入会费',amount:fee,party:who,minute,sourceEvent:eventId,balance:org.treasury+fee});}
            save(d,row);if(who==='player')adjustStanding(d,engine,org.id,'player',5,{sourceEvent:eventId,reason:'入会'});
            return {organization:org.id,member:who,joined:true,organizationEvent:event(org,'join',{member:who,value:fee})};
        }
        const p=propose(d,engine,org,{action:'admit',member:who},who,eventId,{escrow:fee});
        if(p.status==='通过'&&who==='player')adjustStanding(d,engine,org.id,'player',5,{sourceEvent:eventId,reason:'入会'});
        return {organization:org.id,member:who,proposal:p.id,status:p.status,joined:p.status==='通过',note:'入会须按章程议决；入会费暂存，否决或逾期退还。',organizationEvent:event(org,'apply',{member:who,value:fee})};
    }
    case 'org_leave':{
        const who=args.member&&args.member!=='player'?present(d,engine,args.member):'player';
        if(who!=='player'&&args.consent!==true)throw Error('退会须本人当面同意');
        if(!org.members[who])throw Error('不是成员');
        if(who===org.leader&&Object.keys(org.members).length>1)throw Error('首脑须先改任他人再退会');
        const row=rowOf(d,engine,org);delete row.members[who];row.removed={...row.removed,[who]:{minute,sourceEvent:eventId,reason:'退会'}};
        if(who===org.leader)row.leader=null;save(d,row);
        return {organization:org.id,member:who,left:true,organizationEvent:event(org,'leave',{member:who})};
    }
    case 'org_deposit':{
        const coins=int(args.coins,1,1e9);if(!pay(d,'player',coins))throw Error('铜币不足');
        const row=rowOf(d,engine,org);row.treasury+=coins;move(d,row,{kind:'存入',amount:coins,party:'player',minute,sourceEvent:eventId,reason:args.content??null,balance:org.treasury+coins});save(d,row);
        adjustStanding(d,engine,org.id,'player',Math.min(10,2+Math.floor(coins/10)),{sourceEvent:eventId,reason:'捐入公库'});
        return {organization:org.id,deposited:coins,treasury:org.treasury+coins,organizationEvent:event(org,'deposit',{value:coins})};
    }
    case 'org_propose':{
        if(!player)throw Error('只有成员能提出议案');
        const motion=motionOf(engine,d,org,args),p=propose(d,engine,org,motion,'player',eventId,{content:args.content??null});
        return {organization:org.id,proposal:p.id,mode:MODES[p.mode],deciders:p.deciders,status:p.status,outcome:p.outcome??null,
            note:p.status==='议事中'?'在场决策人可当面表态；未表态的人物在次日按各自立场表态，七日未决搁置。':undefined,
            organizationEvent:event(org,'propose',{motion:motion.action,...(motion.member?{member:motion.member}:{}),...(p.status!=='议事中'?{decided:p.status}:{})})};
    }
    case 'org_vote':{
        const id=args.proposal,p=d.get('state','records',id);
        if(p?.category!=='organization_proposal'||p.org!==org.id)throw Error('没有这个议案');
        if(p.status!=='议事中')return {proposal:id,status:p.status,duplicate:true};
        const voter=args.speaker&&args.speaker!=='player'?present(d,engine,args.speaker):'player';
        if(!p.deciders.includes(voter)||!org.members[voter])throw Error('此人在本议案无表决权');
        if(!['approve','reject','abstain'].includes(args.opinion))throw Error('意见须为approve、reject或abstain');
        if(p.votes.some(v=>v.voter===voter))throw Error('已表态，不能改写');
        d.set(['state','records',id],{...p,votes:[...p.votes,{voter,opinion:args.opinion,minute,sourceEvent:eventId,...(args.content?{content:text(args.content)}:{})}]});
        const closed=settle(d,engine,id,minute,eventId);
        return {proposal:id,status:closed.status,outcome:closed.outcome??null,organizationEvent:event(org,'vote',{...(closed.status!=='议事中'?{decided:closed.status,motion:closed.motion.action}:{})})};
    }
    default:throw Error('未知组织操作');
    }
}
