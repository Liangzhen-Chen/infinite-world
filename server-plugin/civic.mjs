import {settlementHead,personSimulation} from './entity-view.mjs';
import {civicRules} from '../world/design/m5-civic-rules.mjs';
import {npcHousehold} from './npc-life.mjs';
import {workContribution} from './works.mjs';

const recordPath=id=>['state','records',id];
const key=(kind,settlement)=>`civic_${kind}:${settlement}:player`;
const alive=actor=>actor&&!['死亡','濒死','昏迷','患病'].includes(actor.status)&&!['睡眠','熟睡'].includes(actor.activity);
const integer=n=>Number.isSafeInteger(n)&&n>=0;
function profile(engine,settlement){
    const p=engine.rules.agriculture?.settlements.find(row=>row.settlement===settlement);
    if(!p||!engine.world.npcs.some(row=>row.id===p.manager))throw Error('聚落缺少正式管理人');
    return p;
}
function belongs(engine,location,settlement){
    const visited=new Set();
    while(location&&!visited.has(location)){
        if(location===settlement)return true;
        visited.add(location);location=engine.byId.get(location)?.parent;
    }
    return false;
}
function present(d,engine,name){
    const id=engine.resolve(name,'npc'),actor=d.get('state','npcs',id);
    if(!(engine.world.npcs.some(row=>row.id===id)||personSimulation(engine,d.get('state'),id).value)||!alive(actor)||actor.location!==d.get('state','location')||actor.scheduleTravel||actor.cognitionTravel)throw Error('需要实际在场且清醒的既有人物');
    return id;
}
function manager(d,engine,p,name){
    if(d.get('state','location')!==p.counter)throw Error('须在本村登记柜台办理');
    if(!name)throw Error('需要 authority 指定正式在场管理人');
    const id=name==='player'?'player':present(d,engine,name);
    if(id!==settlementHead(engine,d.get('state'),p.settlement).value)throw Error('此人不是当地正式管理人');
    return id;
}
// Only recorded contracts establish dates. A home roster and narrative cannot
// establish how long the player has lived here.
function residenceProof(d,engine,settlement){
    const now=d.get('state','minute');
    const contracts=Object.entries(d.get('state','records')??{}).filter(([,r])=>
        r.category==='contract'&&r.parties?.includes('player')&&(r.status==='有效'||r.status==='已到期'&&r.expires<=now)&&belongs(engine,r.room,settlement)&&integer(r.starts)&&integer(r.expires)&&r.starts<r.expires&&r.starts<=now);
    let start=now,end=now,found=false;
    const sources=new Set();
    for(let changed=true;changed;){
        changed=false;
        for(const[id,r]of contracts)if(r.starts<=end&&r.expires>=start&&!sources.has(id)){
            sources.add(id);start=Math.min(start,r.starts);end=Math.max(end,r.expires);changed=true;found=true;
        }
    }
    if(!found||end<=now)throw Error('居住史未知或住宿已中断；需要当前连续有效的真实住宿契约');
    return {since:start,until:end,sources:[...sources].sort(),days:Math.floor((now-start)/1440)};
}
function reviewCrime(d){
    for(const row of Object.values(d.get('state','records')??{})){
        if(row.category!=='legal_case'||row.offender!=='player')continue;
        if(!['证据不足','已结案'].includes(row.status))throw Error('有未处理犯罪案件，须先按法典审理履行');
        if(row.status==='已结案'&&(!row.fineDischarged||!row.compensationPaid))throw Error('犯罪案件判罚尚未实际履行');
        if(row.judgment)throw Error('已有犯罪裁定记录，不能满足无犯罪记录条件；履行判罚不抹去裁定');
        if(row.status==='已结案')throw Error('旧结案档缺少犯罪审核依据，不能视为无犯罪记录');
    }
}
export function contributionTotal(state,settlement,subject='player'){
    return Object.values(state.records??{}).filter(r=>r.category==='civic_contribution'&&r.settlement===settlement&&r.subject===subject).reduce((n,r)=>n+r.points,0);
}
const total=(d,settlement,subject='player')=>contributionTotal(d.get('state'),settlement,subject);
function credit(d,{sourceEvent,settlement,subject='player',kind,points,minute}){
    const id=`civic_source:${sourceEvent}`,old=d.get(...recordPath(id));
    if(old){
        if(old.category!=='civic_contribution'||old.settlement!==settlement||old.subject!==subject||old.kind!==kind||old.points!==points)throw Error('贡献来源已登记或编号冲突，不能转村或重复记账');
        return {...old,duplicate:true};
    }
    if(!Number.isSafeInteger(points)||points<1)throw Error('实际贡献未达到最小记分量');
    const row={category:'civic_contribution',sourceEvent,settlement,subject,kind,points,minute};
    d.set(recordPath(id),row);return row;
}
export function recordDonationContribution(d,engine,result,eventId){
    if(result.operation!=='donate')return null;
    const points=Math.floor(result.quantity/civicRules.donationGrainPerPoint);
    if(!points)return null;
    return credit(d,{sourceEvent:eventId,settlement:result.settlement,kind:'donation',points,minute:d.get('state','minute')});
}
export function donationReceipt(d,engine,args,eventId){
    if(args.operation!=='donate')return null;
    const old=d.get(...recordPath(`civic_donation:${eventId}`));
    if(!old)return null;
    if(old.category!=='civic_donation'||old.result.settlement!==engine.resolve(args.settlement??old.result.settlement,'loc')||old.result.quantity!==args.quantity)throw Error('捐赠 sourceEvent 已占用，不能改村或改数量');
    return {...old.result,duplicate:true};
}
export function saveDonationReceipt(d,result,eventId){
    if(result.operation==='donate')d.set(recordPath(`civic_donation:${eventId}`),{category:'civic_donation',subject:'player',result});
}
export function publicProjectApproval(d,engine,settlement,authorization,beneficiaries){
    // Four village charters currently provide tax-ledger and judicial duties,
    // without public construction approval. A bare authorization cannot add it.
    if(engine.world.settlementProfiles?.find(p=>p.id===settlement)?.details?.governance?.appointment)return null;
    const p=profile(engine,settlement),a=d.get(...recordPath(authorization)),now=d.get('state','minute');
    if(a?.category!=='authorization'||a.action!=='public_project'||a.settlement!==settlement||a.grantor!==p.manager||a.grantee!=='player'||a.revoked||!integer(a.expires)||a.expires<=now||!beneficiaries?.includes(settlement)||beneficiaries.includes('player'))return null;
    const actor=d.get('state','npcs',p.manager);
    if(!alive(actor)||actor.location!==d.get('state','location')||d.get('state','location')!==p.counter)return null;
    return {authorization,grantor:p.manager,settlement,minute:now,expires:a.expires};
}
function contribution(d,engine,args,settlement){
    if(typeof args.sourceEvent!=='string'||!args.sourceEvent)throw Error('需要真实 sourceEvent');
    const old=d.get(...recordPath(`civic_source:${args.sourceEvent}`));
    if(old){
        if(old.category!=='civic_contribution'||old.settlement!==settlement)throw Error('贡献来源已在其他聚落登记或编号冲突');
        return {...old,duplicate:true};
    }
    const project=d.get('state','projects',args.sourceEvent);
    if(project){
        const approval=project.civicApproval;
        if(project.type!=='工程'||project.status!=='已完成'||project.creator!=='player'||project.settlement!==settlement||!approval||approval.settlement!==settlement||project.sourceEvent===undefined)throw Error('工程未完成、属于私人或缺正式公共授权，不能记贡献');
        return credit(d,{sourceEvent:args.sourceEvent,settlement,kind:'project',points:civicRules.projectPoints,minute:d.get('state','minute')});
    }
    const learning=d.get('state','learning',args.sourceEvent);
    if(learning){
        const teacher=learning.source?.id,npc=d.get('state','npcs',teacher);
        const memory=npc?.memoryStream?.find(row=>row.id===`${args.sourceEvent}:learn`&&row.sourceEvent===args.sourceEvent&&row.kind==='learn'&&row.participants?.includes('player')&&row.participants.includes(teacher)&&row.minute===learning.end);
        if(learning.success!==true||learning.source.type!=='teacher'||!memory||!belongs(engine,memory.location,settlement)||!engine.world.npcs.some(row=>row.id===teacher)||!integer(learning.start)||!integer(learning.end)||learning.end<=learning.start)throw Error('教学缺少成功与当地亲历证据，不能记贡献');
        return credit(d,{sourceEvent:args.sourceEvent,settlement,subject:teacher,kind:'teaching',points:civicRules.teachingPoints,minute:learning.end});
    }
    // U6: a publication, counted performance or survey made in this settlement.
    const work=workContribution(d.get('state'),args.sourceEvent);
    if(work){
        if(!work.settlement||!belongs(engine,work.location,settlement))throw Error('作品不在本聚落发表，不能记贡献');
        return credit(d,{sourceEvent:args.sourceEvent,settlement,kind:`work_${work.kind}`,points:work.points,minute:work.minute});
    }
    throw Error('没有可核验的工程、教学、作品或实际捐赠 sourceEvent');
}
export function civicAction(d,args,eventId){
    const settlement=this.resolve(args.settlement,'loc'),p=profile(this,settlement);
    if(!d.get('state','settlements',settlement))throw Error('聚落公共账未登记');
    const operation=args.operation;
    if(operation==='civic_inspect'){
        const resident=d.get(...recordPath(key('resident',settlement))),citizen=d.get(...recordPath(key('citizen',settlement))),points=total(d,settlement);
        let proof=null;try{proof=residenceProof(d,this,settlement);}catch{}
        return {settlement,residence:proof,resident:resident??null,citizen:citizen??null,contribution:points,canApplyCitizen:Boolean(resident&&proof?.days>=civicRules.citizen.days&&points>=civicRules.citizen.contribution),requirements:civicRules,note:'达标只开放申请；土地与官职另需授权。',actionScope:{kind:'instant'}};
    }
    if(operation==='civic_contribution')return {contribution:contribution(d,this,args,settlement)};
    if(operation==='civic_residence'){
        const proof=residenceProof(d,this,settlement),row={category:'civic_residence',subject:'player',settlement,...proof};
        const id=key('residence',settlement),old=d.get(...recordPath(id));
        if(old&&old.category!=='civic_residence')throw Error('居住登记编号冲突');
        d.set(recordPath(id),row);return {residence:row};
    }
    if(operation==='civic_sponsor'){
        const sponsor=present(d,this,args.sponsor),base=this.byId.get(sponsor);
        if((base.age??0)<18||npcHousehold(this,d.get('state'),sponsor)?.settlement!==settlement)throw Error('担保人须为当地成年登记住户');
        if(!belongs(this,d.get('state','location'),settlement))throw Error('须在当地当面确认担保');
        const id=key('sponsor',settlement),old=d.get(...recordPath(id));
        if(old&&old.category!=='civic_sponsor')throw Error('担保编号冲突');
        const row={category:'civic_sponsor',subject:'player',settlement,sponsor,minute:d.get('state','minute'),sourceEvent:eventId};
        d.set(recordPath(id),row);return {sponsor:row};
    }
    const kind=operation==='civic_apply_resident'?'resident':operation==='civic_apply_citizen'?'citizen':null;
    if(!kind)throw Error('未知户籍操作');
    const id=key(kind,settlement),old=d.get(...recordPath(id));
    if(old){if(old.category!==`civic_${kind}`||old.subject!=='player'||old.settlement!==settlement)throw Error('申请编号冲突');return {application:old,duplicate:true};}
    const authority=manager(d,this,p,args.authority),proof=residenceProof(d,this,settlement),registered=d.get(...recordPath(key('residence',settlement)));
    if(registered?.category!=='civic_residence'||registered.since!==proof.since)throw Error('须先登记当前真实居住起日');
    const gate=civicRules[kind];
    if(proof.days<gate.days)throw Error(`连续居住不足${gate.days}天`);
    const sponsor=d.get(...recordPath(key('sponsor',settlement)));
    if(sponsor?.category!=='civic_sponsor'||sponsor.subject!=='player'||sponsor.settlement!==settlement||sponsor.sponsor!==present(d,this,args.sponsor))throw Error('需要当面登记的当地担保人');
    if((this.byId.get(sponsor.sponsor)?.age??0)<18||npcHousehold(this,d.get('state'),sponsor.sponsor)?.settlement!==settlement)throw Error('担保人须为当地成年登记住户');
    if(kind==='citizen'&&d.get(...recordPath(key('resident',settlement)))?.category!=='civic_resident')throw Error('公民申请需要已登记居民身份');
    if(total(d,settlement)<gate.contribution)throw Error('本聚落贡献不足，不能申请公民');
    reviewCrime(d);
    if(d.get('state','player','coins')<gate.fee)throw Error('申请费用不足');
    const treasury=d.get('state','settlements',settlement,'treasury');
    if(!integer(treasury))throw Error('公库余额未知或非法，不能收费');
    const row={category:`civic_${kind}`,subject:'player',settlement,status:'已登记',since:proof.since,sources:proof.sources,sponsor:sponsor.sponsor,authority,fee:gate.fee,minute:d.get('state','minute'),sourceEvent:eventId,crimeReview:'已核验案件状态'};
    d.set(['state','player','coins'],d.get('state','player','coins')-gate.fee);
    d.set(['state','settlements',settlement,'treasury'],treasury+gate.fee);
    d.set(recordPath(id),row);return {application:row,note:'身份登记不授予土地、官职或公共物资权限。'};
}
