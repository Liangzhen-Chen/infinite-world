import {authorityOf} from './governance.mjs';
import {standing,adjustStanding} from './standing.mjs';
import {organization} from './organizations.mjs';
import {playerTitle} from './titles.mjs';

// U13 notables. A social identity earned by scholarly, artistic or teaching
// achievement (signed works, career metrics, people actually taught), put
// forward by an academy, guild or a person of standing, and recognised by the
// capital letters registry from the petition filed at the Baishi office. It
// sits beside offices and titles. Rights: joining academies, audiences with
// noble houses, and a monthly quota of cultural quests. The registry reviews
// the roll; fame falling below the line or a scandal (an exposed lie told
// after recognition, a judged crime) strikes the name off.
const DAY=1440,KEY='notable:player',rec=id=>['state','records',id];
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
export const notableRules=engine=>engine.rules.governance?.notables??null;
export const playerNotable=state=>{const r=state.records?.[KEY];return r?.category==='notable'&&r.status==='在册'?r:null;};
export function notableCulturalQuotaD(engine,state){return playerNotable(state)?notableRules(engine).rights.culturalQuotaD:0;}

// Achievements are read from what exists: works, career metrics and pupils.
export function notableAchievements(engine,state){
    const works=Object.values(state.works??{}).filter(w=>w.author==='player');
    const m=state.careerMetrics,research=Object.values(state.projects??{}).filter(p=>p.type==='研究'&&p.stage==='打磨').map(p=>p.id);
    const found={
        学术:[...works.filter(w=>w.kind==='manuscript'&&w.editions?.length).map(w=>w.id),...research],
        艺术:works.filter(w=>['performance','art','map'].includes(w.kind)).map(w=>w.id),
        教育:Object.keys(m?.students??{}).sort(),
    };
    const rules=notableRules(engine).achievements,out={};
    for(const [k,ids]of Object.entries(found))if(ids.length>=rules[k].minimum)out[k]=ids;
    return {qualified:out,counts:Object.fromEntries(Object.entries(found).map(([k,v])=>[k,v.length]))};
}
// Fame net of notoriety across every settlement account.
export function notableFame(state){
    return Object.values(state.records??{}).filter(r=>r.category==='reputation'&&r.subject==='player'&&r.scope==='settlement').reduce((n,r)=>n+(r.fame??0)-(r.notoriety??0),0);
}
const judged=state=>Object.values(state.records??{}).filter(r=>r.category==='legal_case'&&r.offender==='player'&&r.judgment).map(r=>r.id);
const exposedSince=(state,since)=>Object.entries(state.records??{}).filter(([,r])=>r?.category==='lie'&&r.liar==='player'
    &&Object.values(r.exposures??{}).some(e=>e.minute>=since)).map(([id])=>id);
export function notableScandals(state,since){
    return [...judged(state).map(id=>({kind:'犯罪裁定',record:id})),...exposedSince(state,since).map(id=>({kind:'谎言被揭穿',record:id}))];
}

// A recommender is an academy or guild, or a person of standing in one (or a
// noble house, or a village's original head), who thinks well enough of you.
function persons(engine,kinds){
    const ids=new Set();
    for(const f of engine.world.factions??[])if(kinds.includes(f.kind)){if(f.leader)ids.add(f.leader);for(const m of f.coreMembers??[])ids.add(m);}
    for(const p of engine.world.settlementProfiles??[])if(p.details?.governance?.appointment&&p.details.governance.head)ids.add(p.details.governance.head);
    return ids;
}
export function recommendation(engine,state,sponsor){
    const r=notableRules(engine).recommenders,rights=notableRules(engine).rights;
    if(!sponsor)return {ok:false,reason:'没有举荐者'};
    const org=engine.world.factions?.some(f=>f.id===sponsor)?organization(engine,state,sponsor):null;
    if(org){
        if(!r.organizationKinds.includes(org.kind))return {ok:false,reason:`${org.name}不是学院或行会，不能举荐名士`};
        const v=standing(engine,state,sponsor,'player');
        return v>=r.organizationStanding?{ok:true,by:sponsor,kind:'organization',standing:v}:{ok:false,reason:`${org.name}对你的看法${v}，不到${r.organizationStanding}，不肯举荐`};
    }
    if(!persons(engine,[...r.organizationKinds,...rights.nobleKinds]).has(sponsor))return {ok:false,reason:'举荐者须是学院、行会或贵族家族的首领长老，或四村原头人'};
    if(state.npcs?.[sponsor]?.status==='死亡')return {ok:false,reason:'举荐者已不在世'};
    const v=standing(engine,state,sponsor,'player');
    return v>=r.personStanding?{ok:true,by:sponsor,kind:'person',standing:v}:{ok:false,reason:`举荐者对你的看法${v}，不到${r.personStanding}`};
}
function appraise(engine,state,petition){
    const rules=notableRules(engine),{qualified,counts}=notableAchievements(engine,state),fame=notableFame(state),reasons=[];
    if(Object.keys(qualified).length<rules.minAchievements)reasons.push(`成就不够数：学术${counts.学术}/${rules.achievements.学术.minimum}，艺术${counts.艺术}/${rules.achievements.艺术.minimum}，教育${counts.教育}/${rules.achievements.教育.minimum}`);
    if(fame<rules.minFame)reasons.push(`名望${fame}，不到${rules.minFame}`);
    const sponsor=recommendation(engine,state,petition.sponsor);if(!sponsor.ok)reasons.push(sponsor.reason);
    const scandals=notableScandals(state,petition.filedAt);
    if(judged(state).length)reasons.push('有犯罪裁定');
    if(scandals.some(s=>s.kind==='谎言被揭穿'))reasons.push('递件后有谎言被揭穿');
    return {reasons,achievements:qualified,fame,recommendation:sponsor.ok?sponsor:null};
}
function registrar(d,engine){
    const charter=authorityOf(engine)?.superiors?.auth_bs_office_charter,state=d.get('state');
    if(!charter||state.location!==charter.seat)throw Error('须在白石镇公署前厅递件转呈');
    const staff=engine.world.npcs.filter(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===state.location).map(n=>n.id).sort();
    if(!staff.length)throw Error('前厅没有在岗的递件或抄录人，不能登记');
    return staff[0];
}
function petition(d,engine,args,eventId){
    const rules=notableRules(engine);if(!rules)throw Error('名士章程未登记');
    const clerk=registrar(d,engine),state=d.get('state');
    if(playerNotable(state))throw Error('已在名士册上');
    if(Object.values(state.records??{}).some(r=>r.category==='notable_petition'&&r.status==='待审定'))throw Error('已有待审定的名士申请');
    const sponsor=args.sponsor?(engine.world.factions?.some(f=>f.id===args.sponsor)||engine.world.factionPeople?.some(p=>p.id===args.sponsor)?args.sponsor:engine.resolve(args.sponsor,'npc')):null;
    const id=`notable_petition:${eventId}`;if(d.get(...rec(id)))throw Error('事务编号已占用');
    const row={category:'notable_petition',id,sponsor,registrar:clerk,institution:rules.registry.name,filedAt:state.minute,due:state.minute+rules.registry.decisionDays*DAY,status:'待审定',source:rules.source,sourceEvent:eventId};
    const now=appraise(engine,state,row);
    if(!now.recommendation)throw Error(now.reasons.find(r=>/举荐/.test(r))??'需要举荐者');
    d.set(rec(id),{...row,attached:{achievements:now.achievements,fame:now.fame,recommendation:now.recommendation}});
    return {petition:id,pending:row,note:`已转呈${rules.registry.name}，${rules.registry.decisionDays}日后按成就、名望与举荐审定。`};
}
function decide(d,engine,p,at){
    const rules=notableRules(engine),state=d.get('state'),{reasons,achievements,fame,recommendation:by}=appraise(engine,state,p);
    if(reasons.length){d.set(rec(p.id),{...p,status:'未获认定',decidedAt:at,reasons});return;}
    d.set(rec(KEY),{category:'notable',id:KEY,holder:'player',status:'在册',since:at,petition:p.id,achievements,fame,recommendation:by,
        rights:[...rules.rights.list],culturalQuotaD:rules.rights.culturalQuotaD,institution:rules.registry.name,nextReview:at+rules.registry.reviewEveryDays*DAY,
        history:[...(state.records?.[KEY]?.history??[]),...(state.records?.[KEY]?[{since:state.records[KEY].since,until:state.records[KEY].removedAt,reason:state.records[KEY].reason}]:[])],source:rules.source});
    d.set(rec(p.id),{...p,status:'已认定',decidedAt:at});
}
function review(d,engine,n,at){
    const rules=notableRules(engine),state=d.get('state'),fame=notableFame(state),scandals=notableScandals(state,n.since);
    const reason=scandals.length?`丑闻：${scandals[0].kind}`:fame<rules.removal.minFame?`名望${fame}跌破${rules.removal.minFame}`:null;
    if(reason)d.set(rec(KEY),{...n,status:'已除名',removedAt:at,reason,scandals,fame});
    else d.set(rec(KEY),{...n,fame,nextReview:n.nextReview+rules.registry.reviewEveryDays*DAY,reviews:[...(n.reviews??[]),at]});
}
// Audience: a notable (or a titled player) is received by a noble house (its
// head, or a named elder) at its seat. A simulated host must be there and
// awake. The meeting is recorded and the house's regard rises a little.
function audience(d,engine,args,eventId){
    const rules=notableRules(engine),state=d.get('state');
    if(!playerNotable(state)&&!playerTitle(state))throw Error('觐见贵族须有名士身份或爵位');
    const house=engine.world.factions?.find(f=>rules.rights.nobleKinds.includes(f.kind)&&(f.id===args.sponsor||f.leader===args.sponsor||f.coreMembers?.includes(args.sponsor)));
    if(!house)throw Error('对方不是贵族家族或其首领、长老');
    const target=house.id===args.sponsor?house.leader:args.sponsor;
    if(!within(engine,state.location,house.contactAnchor))throw Error(`须到${house.name}所在地求见`);
    const npc=state.npcs[target];
    if(npc&&(!awake(npc)||!within(engine,npc.location,house.contactAnchor)))throw Error('主人不在府中或不便见客');
    const id=`notable_audience:${eventId}`;if(d.get(...rec(id)))throw Error('事务编号已占用');
    engine.advance(d,rules.rights.audienceMinutes,eventId);
    const at=d.get('state','minute');
    d.set(rec(id),{category:'notable_audience',id,house:house.id,host:target,minute:at,basis:playerNotable(state)?'名士':'爵位',sourceEvent:eventId});
    adjustStanding(d,engine,house.id,'player',rules.rights.audienceStanding,{sourceEvent:eventId,reason:'觐见'});
    if(engine.byId.get(target)?.tier==='full'){
        const stream=d.get('state','npcs',target,'memoryStream')??[];
        d.set(['state','npcs',target,'memoryStream'],[...stream,{id,sourceEvent:eventId,kind:'meeting',minute:at,location:state.location,participants:[target,'player'],content:`接见了${state.player.name}`,sourceType:'亲历',salience:2}]);
    }
    return {audience:id,house:house.id,host:target,minutes:rules.rights.audienceMinutes};
}
// Academies admit only notables (the academy right).
export function assertAcademyAdmission(engine,state,org,who){
    const rules=notableRules(engine);
    if(rules&&who==='player'&&org.source==='faction'&&rules.rights.academyKinds.includes(org.kind)&&!playerNotable(state))throw Error(`${org.name}只收名士入院，须先经典籍署认定`);
}
export function notableAction(d,args,eventId){
    if(args.operation==='notable_petition')return petition(d,this,args,eventId);
    if(args.operation==='notable_audience')return audience(d,this,args,eventId);
    if(args.operation==='notable_inspect'){
        const state=d.get('state');
        return {notable:state.records?.[KEY]??null,achievements:notableAchievements(this,state),fame:notableFame(state),culturalQuotaD:notableCulturalQuotaD(this,state),
            petitions:Object.values(state.records??{}).filter(r=>r.category==='notable_petition'),actionScope:{kind:'instant'}};
    }
    throw Error('未知名士事务');
}
const dueOf=r=>r.category==='notable_petition'?r.due:r.nextReview;
const scheduled=state=>Object.values(state.records??{}).filter(r=>r.category==='notable_petition'&&r.status==='待审定'||r.category==='notable'&&r.status==='在册');
export function nextNotableMinute(state,now){return Math.min(Infinity,...scheduled(state).map(dueOf).filter(m=>m>now));}
export function advanceNotables(d,engine,{after}){
    for(let guard=0;guard<1000;guard++){
        const r=scheduled(d.get('state')).filter(r=>dueOf(r)<=after).sort((a,b)=>dueOf(a)-dueOf(b)||a.id.localeCompare(b.id))[0];
        if(!r)return;
        if(r.category==='notable_petition')decide(d,engine,r,r.due);else review(d,engine,r,r.nextReview);
    }
}
