import {authorityOf,playerOffices} from './governance.mjs';
import {titleMilitaryService,militaryFresh} from './military.mjs';

// T127 titles. A petition is filed at the Baishi office with a registrar and
// forwarded to the capital registry, which decides after its published days
// from the attached bases only (contribution points are never a basis). A
// granted title gives its quest quota and, for a fief title, a monthly share of
// what the fief actually took in (tax receipts and housing fees) while the
// holder still heads that village; the holder owes tribute on that income, a
// yearly levy of service days and a yearly report. A missed year stops the
// stipend and lowers the rank; a second consecutive miss strips the title.
const DAY=1440,MONTH=30*DAY,YEAR=360*DAY,GOVERN_DAYS=90;
const KEY='title:player',rec=id=>['state','records',id];
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const titleDef=(engine,name)=>authorityOf(engine)?.titles?.find(t=>t.name===name||t.id===name)??null;
export const playerTitle=state=>{const t=state.records?.[KEY];return t?.category==='title'&&t.status!=='已除爵'?t:null;};
export function titleQuotaD(engine,state){
    const t=playerTitle(state);if(!t)return 0;
    const def=titleDef(engine,t.title);return def?.monthlyQuotaD[def.ranks.indexOf(t.rank)]??0;
}
function office(d,engine){
    const charter=authorityOf(engine)?.superiors?.auth_bs_office_charter,state=d.get('state');
    if(!charter||state.location!==charter.seat)throw Error('封爵申请须在白石镇公署前厅递件转呈');
    const staff=engine.world.npcs.filter(n=>n.workplace?.location===charter.seat&&charter.registrars.occupations.includes(n.occupation)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===state.location);
    if(!staff.length)throw Error('前厅没有在岗的递件或抄录人，不能登记');
    return staff[0].id;
}
const heads=(state,settlement)=>playerOffices(state,{settlement,power:'housing'});
// Bases are read from records that exist; each lists its evidence.
export function titleBases(engine,state,fief){
    const out={};
    const governed=Object.values(state.records??{}).filter(r=>r.category==='governance_office'&&r.holder==='player'&&
        (r.status==='在任'?state.minute:r.reason==='任期届满'?r.removedAt:r.since)-r.since>=GOVERN_DAYS*DAY);
    if(governed.length)out['治理']=governed.map(r=>r.id);
    const military=[...Object.values(state.records??{}).filter(r=>r.category==='legal_detention'&&r.deliveredBy==='player').map(r=>r.wanted),
        ...Object.entries(state.careerMetrics?.evidence??{}).filter(([,e])=>e.kind==='battle').map(([k])=>k)];
    if(military.length)out['军功']=military;
    const ruled=[...new Set(playerOffices(state,{power:'housing'}).map(r=>r.settlement))],people=ruled.reduce((n,s)=>n+(state.settlements?.[s]?.population??0),0);
    if(people>=engine.rules.governance.titleDomainPopulation)out['领地规模']=ruled;
    return out;
}
function qualifies(engine,state,def,fief){
    const bases=titleBases(engine,state,fief),have=def.bases.from.filter(b=>bases[b]);
    const reasons=[];
    if(have.length<def.bases.min)reasons.push(`凭据不足：需${def.bases.min}样（${def.bases.from.join('、')}），现有${have.join('、')||'无'}`);
    if(def.bases.required&&!bases[def.bases.required])reasons.push(`缺少必需的${def.bases.required}凭据`);
    if(def.fief==='一村'&&(!fief||!heads(state,fief).length))reasons.push('封地须是现任村长所辖之村');
    return {reasons,bases:Object.fromEntries(have.map(b=>[b,bases[b]]))};
}
function petition(d,engine,args,eventId){
    const def=titleDef(engine,args.name);
    if(!def)throw Error('册上没有这个爵位');
    if(!def.grantable)throw Error(`封册署眼下不受理${def.name}的请封`);
    const clerk=office(d,engine),state=d.get('state'),current=playerTitle(state);
    const order=authorityOf(engine).titles.map(t=>t.name);
    if(current&&order.indexOf(current.title)>=order.indexOf(def.name))throw Error('已有同级或更高爵位');
    if(Object.values(state.records??{}).some(r=>r.category==='title_petition'&&r.status==='待审定'))throw Error('已有待审定的请封');
    const fief=def.fief==='一村'?engine.resolve(args.settlement,'loc'):null;
    const {reasons,bases}=qualifies(engine,state,def,fief);
    if(!Object.keys(bases).length)throw Error(reasons.join('；'));
    const id=`title_petition:${eventId}`;
    if(d.get(...rec(id)))throw Error('事务编号已占用');
    const registry=authorityOf(engine).superiors.auth_capital_title_registry;
    const row={category:'title_petition',id,title:def.name,fief,bases,registrar:clerk,filedAt:state.minute,due:state.minute+registry.decisionDays*DAY,status:'待审定',sourceEvent:eventId};
    d.set(rec(id),row);
    return {petition:id,pending:row,note:`已转呈王都封册署，${registry.decisionDays}日后按凭据审定；贡献度不作凭据。`};
}
function decide(d,engine,p){
    const def=titleDef(engine,p.title),state=d.get('state'),{reasons,bases}=qualifies(engine,state,def,p.fief);
    if(reasons.length){d.set(rec(p.id),{...p,status:'未获册封',decidedAt:p.due,reasons});return;}
    const old=playerTitle(state);
    d.set(rec(KEY),{category:'title',id:KEY,holder:'player',title:def.name,rank:def.ranks[0],fief:p.fief,grantedAt:p.due,status:'受封',petition:p.id,bases,
        nextIncome:p.due+MONTH,incomeMark:receipts(state,p.fief),levy:{men:def.levy.men,days:def.levy.days,personal:Boolean(def.levy.personal),due:p.due+YEAR,served:0,attended:false},breaches:0,
        history:[...(old?.history??[]),...(old?[{title:old.title,until:p.due}]:[])],source:def.source});
    d.set(rec(p.id),{...p,status:'已册封',decidedAt:p.due});
}
// What the fief has actually taken in: tax receipts from its ledger plus housing fees.
function receipts(state,fief){
    if(!fief)return 0;
    const tax=state.records?.[`village-fiscal:${fief}`]?.taxReceiptsCopper??0;
    const fees=Object.values(state.records??{}).filter(r=>r.category==='housing_fee'&&r.settlement===fief).reduce((n,r)=>n+r.copper,0);
    return tax+fees;
}
function income(d,engine,t,at){
    const def=titleDef(engine,t.title),state=d.get('state'),mark=receipts(state,t.fief),next={...t,nextIncome:t.nextIncome+MONTH,incomeMark:mark};
    const month=Math.floor(at/MONTH),row={category:'title_income',holder:'player',title:t.title,fief:t.fief,minute:at,base:mark-t.incomeMark,income:0,tribute:0};
    if(!t.fief||!def.incomeBps){d.set(rec(KEY),next);return;}
    if(t.status==='停俸')row.reason='停俸期间不发封地收入';
    else if(!heads(state,t.fief).length){row.reason='不再任该村村长，封地收入停发';next.status='失封地';}
    else{
        const owed=Math.floor(row.base*def.incomeBps/10000),treasury=state.settlements[t.fief].treasury,reserve=authorityOf(engine).treasury.reserveCopper;
        row.income=Math.max(0,Math.min(owed,treasury-reserve));if(row.income<owed)row.shortfall=owed-row.income;
        row.tribute=Math.floor(row.income*def.tributeBps/10000);
        d.set(['state','settlements',t.fief,'treasury'],treasury-row.income);
        d.set(['state','player','coins'],state.player.coins+row.income-row.tribute);
        if(t.status==='失封地')next.status='受封';
    }
    d.set(rec(`title_income:${month}`),row);d.set(rec(KEY),next);
}
function yearEnd(d,engine,t,at){
    const def=titleDef(engine,t.title),need=(t.levy.men??0)*(t.levy.days??0),kept=t.levy.served>=need&&t.levy.attended;
    const record={year:Math.floor(t.levy.due/YEAR),served:t.levy.served,required:need,attended:t.levy.attended,kept};
    let next={...t,levy:{...t.levy,due:t.levy.due+YEAR,served:0,attended:false},years:[...(t.years??[]),record]};
    if(kept){next.breaches=0;if(next.status==='停俸')next.status='受封';}
    else if(t.breaches>=1){next={...next,status:'已除爵',strippedAt:at,reason:'连续两年未应兵役或报到'};}
    else{
        const i=def.ranks.indexOf(t.rank);
        next={...next,breaches:1,status:'停俸',rank:def.ranks[Math.max(0,i-1)],reason:'未应兵役或报到：停俸一年并降等'};
    }
    d.set(rec(KEY),next);
}
// Service is done in person at the Baishi office (with companions counting as
// men); a zero-day visit is the yearly report.
function service(d,engine,args,eventId){
    office(d,engine);
    const t=playerTitle(d.get('state'));if(!t||!t.levy.men)throw Error('没有需要应役的爵位');
    const days=args.days??0;if(!Number.isSafeInteger(days)||days<0||days>60)throw Error('应役日数须在0到60之间');
    if(engine.rules.military&&militaryFresh(engine))return titleMilitaryService(d,engine,days,eventId);
    const men=t.levy.personal?1:Math.min(t.levy.men,1+(d.get('state','player','companions')?.length??0));
    if(days)engine.advance(d,days*DAY,eventId);
    const now=playerTitle(d.get('state'));if(!now)throw Error('爵位已除');
    d.set(rec(KEY),{...now,levy:{...now.levy,served:now.levy.served+men*days,attended:true}});
    return {title:now.title,served:now.levy.served+men*days,required:now.levy.men*now.levy.days,men};
}
export function titleAction(d,args,eventId){
    if(args.operation==='title_petition')return petition(d,this,args,eventId);
    if(args.operation==='title_service')return service(d,this,args,eventId);
    if(args.operation==='title_inspect'){const state=d.get('state');return {title:playerTitle(state),quotaD:titleQuotaD(this,state),petitions:Object.values(state.records??{}).filter(r=>r.category==='title_petition'),actionScope:{kind:'instant'}};}
    throw Error('未知爵位事务');
}
function dueOf(r){return r.category==='title_petition'?r.due:Math.min(r.nextIncome,r.levy.due);}
const scheduled=state=>Object.values(state.records??{}).filter(r=>r.category==='title_petition'&&r.status==='待审定'||r.category==='title'&&r.status!=='已除爵');
export function nextTitleMinute(state,now){return Math.min(Infinity,...scheduled(state).map(dueOf).filter(m=>m>now));}
export function advanceTitles(d,engine,{after}){
    for(let guard=0;guard<1000;guard++){
        const r=scheduled(d.get('state')).filter(r=>dueOf(r)<=after).sort((a,b)=>dueOf(a)-dueOf(b))[0];
        if(!r)return;
        if(r.category==='title_petition')decide(d,engine,r);
        else if(r.nextIncome<=r.levy.due)income(d,engine,r,r.nextIncome);
        else yearEnd(d,engine,r,r.levy.due);
    }
}
