import {preconditionFailure} from './precondition.mjs';
import {purse,treasury as treasuryAccount,transit,sink,moveCoins} from './money.mjs';
import {declareLedgerWriter} from './ledger.mjs';
declareLedgerWriter('titles',{sinks:['sink:export']});
import {fiefCandidates,nobleRules,currentDomains,domainPopulation,domainSettlements,highTitle,nobleLords,rulerNation,containsDomain,localLevel} from './noble-state.mjs';
import {royalServices} from './high-nobility.mjs';
import {partyPay} from './military.mjs';
import {personRegistrar,personOffices} from './entity-view.mjs';
import {actorPath,npcAgeAt} from './npc-state.mjs';
import {authorityOf,playerOffices} from './governance.mjs';
import {titleMilitaryService,militaryFresh} from './military.mjs';
import {declareHoldingWriter,aliveHoldings,createEntity,entityRow,ensureHoldings} from './holdings.mjs';
import {holdingSet} from './holding-sources.mjs';
import {changeHolding,changeLegacyHoldings} from './transition.mjs';
import {isEffective} from './lifecycle-state.mjs';
declareHoldingWriter('titles',{kinds:['holds_office','fief'],entities:['office']});

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
    if(!charter||state.location!==charter.seat)throw preconditionFailure('封爵申请须在白石镇公署前厅递件转呈');
    const staff=engine.world.npcs.filter(n=>personRegistrar(engine,state,n.id,charter.seat,charter.registrars.occupations)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===state.location);
    if(!staff.length)throw preconditionFailure('前厅没有在岗的递件或抄录人，不能登记');
    return staff[0].id;
}
const heads=(engine,state,settlement)=>playerOffices(state,{settlement,power:'housing'},engine);
// Bases are read from records that exist; each lists its evidence.
export function titleBases(engine,state,fief){
    const out={};
    const governed=Object.values(state.records??{}).filter(r=>r.category==='governance_office'&&r.holder==='player'&&
        (r.status==='在任'?state.minute:r.reason==='任期届满'?r.removedAt:r.since)-r.since>=GOVERN_DAYS*DAY);
    const services=royalServices(state,'player');if(services.length)out['王室服务']=services.map(r=>r.id);
    if(governed.length)out['治理']=governed.map(r=>r.id);
    const military=[...Object.values(state.records??{}).filter(r=>r.category==='legal_detention'&&r.deliveredBy==='player').map(r=>r.wanted),
        ...Object.entries(state.careerMetrics?.evidence??{}).filter(([,e])=>e.kind==='battle').map(([k])=>k)];
    if(military.length)out['军功']=military;
    const ruled=[...new Set(playerOffices(state,{power:'housing'},engine).map(r=>r.settlement))],people=ruled.reduce((n,s)=>n+(state.settlements?.[s]?.population??0),0);
    const domains=currentDomains(engine,state,'player');
    if(Math.max(people,domainPopulation(engine,state,domains))>=engine.rules.governance.titleDomainPopulation)out['领地规模']=domains.length?domains:ruled;
    return out;
}
function qualifies(engine,state,def,fief){
    const bases=titleBases(engine,state,fief),have=def.bases.from.filter(b=>bases[b]);
    const reasons=[];
    if(have.length<def.bases.min)reasons.push(`凭据不足：需${def.bases.min}样（${def.bases.from.join('、')}），现有${have.join('、')||'无'}`);
    if(def.bases.required&&!bases[def.bases.required])reasons.push(`缺少必需的${def.bases.required}凭据`);
    if(def.fief==='一村'&&(!fief||!heads(engine,state,fief).length))reasons.push('封地须是现任村长所辖之村');
    if(['男爵','子爵','伯爵','侯爵','公爵'].includes(def.name)&&!fiefCandidates(engine,state,def.name).some(c=>c.id===fief&&c.eligible))reasons.push('封地须为有来源且无重封的现任辖区');
    return {reasons,bases:Object.fromEntries(have.map(b=>[b,bases[b]]))};
}
function petition(d,engine,args,eventId){
    const def=titleDef(engine,args.name);
    if(!def)throw preconditionFailure('册上没有这个爵位');
    if(!def.grantable&&!fiefCandidates(engine,d.get('state'),def.name).some(c=>c.eligible))throw preconditionFailure(`封册署眼下不受理${def.name}的请封`);
    const clerk=office(d,engine),state=d.get('state'),current=playerTitle(state);
    const order=authorityOf(engine).titles.map(t=>t.name);
    if(current&&order.indexOf(current.title)>=order.indexOf(def.name))throw preconditionFailure('已有同级或更高爵位');
    if(Object.values(state.records??{}).some(r=>r.category==='title_petition'&&r.status==='待审定'))throw preconditionFailure('已有待审定的请封');
    const fief=def.fief==='一村'?engine.resolve(args.settlement,'loc'):['男爵','子爵','伯爵','侯爵','公爵'].includes(def.name)?args.settlement:null;
    const {reasons,bases}=qualifies(engine,state,def,fief);
    if(!Object.keys(bases).length)throw Error(reasons.join('；'));
    const id=`title_petition:${eventId}`;
    if(d.get(...rec(id)))throw preconditionFailure('事务编号已占用');
    const registry=authorityOf(engine).superiors.auth_capital_title_registry;
    const row={category:'title_petition',id,title:def.name,fief,...(fiefCandidates(engine,state,def.name).find(c=>c.id===fief)?{domains:fiefCandidates(engine,state,def.name).find(c=>c.id===fief).domains}:{}),bases,registrar:clerk,filedAt:state.minute,due:state.minute+registry.decisionDays*DAY,status:'待审定',sourceEvent:eventId};
    holdingSet(d,null,rec(id),row,'titles');
    return {petition:id,pending:row,note:`已转呈王都封册署，${registry.decisionDays}日后按凭据审定；贡献度不作凭据。`};
}
function decide(d,engine,p){
    const def=titleDef(engine,p.title),state=d.get('state'),{reasons,bases}=qualifies(engine,state,def,p.fief);
    if(reasons.length){holdingSet(d,engine,rec(p.id),{...p,status:'未获册封',decidedAt:p.due,reasons},'titles');return;}
    const old=playerTitle(state);
    holdingSet(d,engine,rec(KEY),{category:'title',id:KEY,holder:'player',title:def.name,rank:def.ranks[0],fief:p.fief,...(p.domains?{domains:p.domains}:{}),grantedAt:p.due,status:'受封',petition:p.id,bases,
        nextIncome:p.due+MONTH,incomeMark:p.domains?domainReceipts(engine,state,p.domains):receipts(state,p.fief),levy:{men:def.levy.men,days:def.levy.days,personal:Boolean(def.levy.personal),due:p.due+YEAR,served:0,attended:false},breaches:0,
        history:[...(old?.history??[]),...(old?[{title:old.title,until:p.due}]:[])],source:def.source},'titles');
    holdingSet(d,engine,rec(p.id),{...p,status:'已册封',decidedAt:p.due},'titles');
}
// What the fief has actually taken in: tax receipts from its ledger plus housing fees.
function receipts(state,fief){
    if(!fief)return 0;
    const tax=state.records?.[`village-fiscal:${fief}`]?.taxReceiptsCopper??0;
    const fees=Object.values(state.records??{}).filter(r=>r.category==='housing_fee'&&r.settlement===fief).reduce((n,r)=>n+r.copper,0);
    return tax+fees;
}
const domainReceipts=(e,s,domains)=>domainSettlements(e,s,domains).reduce((sum,id)=>sum+receipts(s,id)+Object.values(s.records??{}).filter(r=>r.category==='trade_tax'&&r.settlement===id).reduce((n,r)=>n+r.amount,0),0);
function income(d,engine,t,at){
    if(t.domains)return upperIncome(d,engine,t,at);
    const def=titleDef(engine,t.title),state=d.get('state'),mark=receipts(state,t.fief),next={...t,nextIncome:t.nextIncome+MONTH,incomeMark:mark};
    const month=Math.floor(at/MONTH),row={category:'title_income',holder:'player',title:t.title,fief:t.fief,minute:at,base:mark-t.incomeMark,income:0,tribute:0};
    if(!t.fief||!def.incomeBps){holdingSet(d,engine,rec(t.id??KEY),next,'titles');return;}
    if(t.status==='停俸')row.reason='停俸期间不发封地收入';
    else if(!personOffices(engine,state,t.holder??'player',{settlement:t.fief,power:'housing'}).length){row.reason='不再任该村村长，封地收入停发';next.status='失封地';}
    else{
        const owed=Math.floor(row.base*def.incomeBps/10000),treasury=state.settlements[t.fief].treasury,reserve=authorityOf(engine).treasury.reserveCopper;
        row.income=Math.max(0,Math.min(owed,treasury-reserve));if(row.income<owed)row.shortfall=owed-row.income;
        row.tribute=Math.floor(row.income*def.tributeBps/10000);
        moveCoins(d,{from:treasuryAccount(t.fief),to:purse(engine,t.holder??'player'),amount:row.income-row.tribute,writer:'titles',eventId:`title:${t.id??KEY}:${month}`});
        moveCoins(d,{from:treasuryAccount(t.fief),to:sink('export','tribute'),amount:row.tribute,writer:'titles',eventId:`title:${t.id??KEY}:${month}`});
        d.set(['state','settlements',t.fief,'treasury'],treasury-row.income);
        const holderPath=actorPath(engine.world,t.holder??'player');d.set([...holderPath,'coins'],(d.get(...holderPath,'coins')??0)+row.income-row.tribute);
        if(t.status==='失封地')next.status='受封';
    }
    holdingSet(d,engine,rec(t.holder&&t.holder!=='player'?`title_income:${t.id}:${month}`:`title_income:${month}`),{...row,holder:t.holder??'player'},'titles');holdingSet(d,engine,rec(t.id??KEY),next,'titles');
}
function upperIncome(d,e,t,at){
 const state=d.get('state'),def=titleDef(e,t.title),mark=domainReceipts(e,state,t.domains),base=Math.max(0,mark-t.incomeMark);
 let owed=t.status==='停俸'?0:Math.floor(base*def.incomeBps/10000),paid=0;
 const owned=currentDomains(e,state,t.holder??'player');
 for(const sid of domainSettlements(e,state,t.domains).filter(sid=>owned.some(id=>id===sid||domainSettlements(e,state,[id]).includes(sid)))){const n=partyPay(d,e,sid,owed,{sourceEvent:`title:${t.id}:${at}`,reason:'封地收入',books:{account:transit(`title:${t.id}`),writer:'titles',eventId:`title:${t.id}:${at}`}});paid+=n;owed-=n;if(!owed)break;}
 const tribute=Math.floor(paid*def.tributeBps/10000),holderPath=actorPath(e.world,t.holder??'player');
 moveCoins(d,{from:transit(`title:${t.id}`),to:purse(e,t.holder??'player'),amount:paid-tribute,writer:'titles',eventId:`title:${t.id}:${at}`});
 moveCoins(d,{from:transit(`title:${t.id}`),to:treasuryAccount('loc_capital'),amount:tribute,writer:'titles',eventId:`title:${t.id}:${at}`});
 d.set([...holderPath,'coins'],(d.get(...holderPath,'coins')??0)+paid-tribute);
 if(tribute){const balance=d.get('state','settlements','loc_capital','treasury')??0;d.set(['state','settlements','loc_capital','treasury'],balance+tribute);}
 holdingSet(d,e,rec(`title_income:${t.id}:${Math.floor(at/MONTH)}`),{category:'title_income',holder:t.holder,title:t.title,fief:t.fief,base,income:paid,tribute,minute:at},'titles');
 holdingSet(d,e,rec(t.id??KEY),{...t,nextIncome:t.nextIncome+MONTH,incomeMark:mark},'titles');
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
    if(next.status==='已除爵')changeLegacyHoldings(d,engine,{holder:t.holder,source:`title:${t.id??KEY}`,reason:'vacated',eventId:`${t.id??KEY}:strip:${at}`},()=>holdingSet(d,engine,rec(t.id??KEY),next,'titles'));
    else holdingSet(d,engine,rec(t.id??KEY),next,'titles');
}
// Service is done in person at the Baishi office (with companions counting as
// men); a zero-day visit is the yearly report.
function service(d,engine,args,eventId){
    office(d,engine);
    const t=playerTitle(d.get('state'));if(!t||!t.levy.men)throw preconditionFailure('没有需要应役的爵位');
    const days=args.days??0;if(!Number.isSafeInteger(days)||days<0||days>60)throw preconditionFailure('应役日数须在0到60之间');
    if(engine.rules.military&&militaryFresh(engine))return titleMilitaryService(d,engine,days,eventId);
    const men=t.levy.personal?1:Math.min(t.levy.men,1+(d.get('state','player','companions')?.length??0));
    if(days)engine.advance(d,days*DAY,eventId);
    const now=playerTitle(d.get('state'));if(!now)throw preconditionFailure('爵位已除');
    holdingSet(d,engine,rec(KEY),{...now,levy:{...now.levy,served:now.levy.served+men*days,attended:true}},'titles');
    return {title:now.title,served:now.levy.served+men*days,required:now.levy.men*now.levy.days,men};
}
export function titleAction(d,args,eventId){
    if(args.operation==='title_grant')return grantTitle(d,this,args,eventId);
    if(args.operation==='title_strip')return stripTitle(d,this,args,eventId);
    if(args.operation==='title_petition')return petition(d,this,args,eventId);
    if(args.operation==='title_service')return service(d,this,args,eventId);
    if(args.operation==='title_inspect'){const state=d.get('state');return {title:playerTitle(state),quotaD:titleQuotaD(this,state),candidates:Object.fromEntries(['男爵','子爵','伯爵','侯爵','公爵'].map(name=>[name,fiefCandidates(this,state,name)])),royalServices:royalServices(state,'player'),petitions:Object.values(state.records??{}).filter(r=>r.category==='title_petition'),actionScope:{kind:'instant'}};}
    throw preconditionFailure('未知爵位事务');
}
// Authored remote lords receive the same canonical title/fief edges as a
// campaign grant, before any title decision operates on them.
export function ensureNobleTitles(d,engine){
    ensureHoldings(d,engine);
    for(const t of nobleLords(engine,d.get('state')).filter(t=>!t.id)){
        const def=titleDef(engine,t.title);if(!def)continue;
        const row={...t,id:`title:${t.holder}`,rank:def.ranks[0],grantedAt:d.get('state','minute'),nextIncome:d.get('state','minute')+MONTH,incomeMark:domainReceipts(engine,d.get('state'),t.domains),
            levy:{...def.levy,due:d.get('state','minute')+YEAR,served:0,attended:false},breaches:0};
        writeGrantedTitle(d,engine,row,`authored-title:${t.holder}`);
    }
}
function writeGrantedTitle(d,e,row,eventId){
    const subject=`office_title:${row.id}`,source=`title:${row.id}`;
    if(!entityRow(d,subject))createEntity(d,{id:subject,kind:'office',facts:{title:row.title,rank:row.rank},source,writer:'titles'});
    changeHolding(d,e,{op:'open',kind:'holds_office',holder:row.holder,subject,source,eventId:`${eventId}:office`});
    for(const domain of row.domains??[row.fief].filter(Boolean))changeHolding(d,e,{op:'open',kind:'fief',holder:row.holder,subject:domain,grantedBy:subject,source,eventId:`${eventId}:fief:${domain}`});
    holdingSet(d,e,rec(row.id),row,'titles');return row;
}
export function grantTitle(d,e,args,eventId){
    ensureNobleTitles(d,e);
    const s=d.get('state'),nation=rulerNation(s,'player'),holder=e.resolve(args.member,'npc'),def=titleDef(e,args.name),domain=args.settlement;
    if(!nation||!isEffective(e,d,'player'))throw preconditionFailure('只有现任君主可以授爵');
    if(!def||!highTitle({title:def.name,status:'受封'})||!nation.domains.some(id=>containsDomain(e,s,id,domain))||!currentDomains(e,s,'player').some(id=>containsDomain(e,s,id,domain)))throw preconditionFailure('爵位或封地不在君主可授范围');
    if(!isEffective(e,d,holder)||(npcAgeAt(e,s,holder)??0)<18)throw preconditionFailure('受封者须为现存成年人物');
    const level=localLevel(e,s,domain);
    if(def.name==='男爵'&&!['镇','城'].includes(level)||def.name==='子爵'&&level!=='城'||def.name==='伯爵'&&level!=='郡'||['侯爵','公爵'].includes(def.name)&&level!=='省')throw preconditionFailure('爵位与封地级别不符');
    if(def.name==='侯爵'&&(e.world.regions?.find(r=>r.id===domain)?.counties?.length??0)<2)throw preconditionFailure('侯爵须至少两郡');
    if(args.consent!==true||d.get('state','npcs',holder,'location')!==s.location||!awake(s.npcs?.[holder]))throw preconditionFailure('受封者须清醒在场并同意');
    const prior=s.records?.[`title:${holder}`];
    if(prior&&prior.sourceEvent===eventId)return {title:prior,duplicate:true};
    if(prior&&prior.status!=='已除爵')throw preconditionFailure('已有爵位，须先依法处理原爵');
    if(nobleLords(e,s).some(t=>t.holder!==nation.ruler&&t.holder!==holder&&(t.domains??[t.fief]).some(id=>containsDomain(e,s,id,domain)||containsDomain(e,s,domain,id))))throw preconditionFailure('封地已有受封者');
    const row={category:'title',id:`title:${holder}`,holder,title:def.name,rank:def.ranks[0],fief:domain,domains:[domain],status:'受封',grantor:nation.id,grantedAt:s.minute,source:`nation:${nation.id}`,sourceEvent:eventId,
        nextIncome:s.minute+MONTH,incomeMark:domainReceipts(e,s,[domain]),levy:{...def.levy,due:s.minute+YEAR,served:0,attended:false},breaches:0};
    return {title:writeGrantedTitle(d,e,row,eventId)};
}
export function stripTitle(d,e,args,eventId){
    ensureNobleTitles(d,e);
    const s=d.get('state'),holder=args.member==='player'?'player':e.resolve(args.member,'npc'),row=s.records?.[`title:${holder}`],nation=rulerNation(s,'player');
    if(!row||!nation||row.grantor!==nation.id||!isEffective(e,d,'player'))throw preconditionFailure('没有剥夺该爵位的任免权限');
    if(row.status==='已除爵')return {title:row,duplicate:true};
    if(typeof args.reason!=='string'||!args.reason.trim())throw preconditionFailure('除爵须登记裁决理由');
    const next={...row,status:'已除爵',strippedAt:s.minute,strippedBy:nation.id,reason:args.reason,decisionEvent:eventId};
    changeLegacyHoldings(d,e,{holder,source:`title:${row.id}`,reason:'vacated',eventId},()=>holdingSet(d,e,rec(row.id),next,'titles'));
    return {title:next};
}
function dueOf(r){return r.category==='title_petition'?r.due:Math.min(r.nextIncome,r.levy.due);}
const scheduled=state=>Object.values(state.records??{}).filter(r=>r.category==='title_petition'&&r.status==='待审定'||r.category==='title'&&!['已除爵','独立'].includes(r.status));
export function nextTitleMinute(state,now){return Math.min(Infinity,...scheduled(state).map(dueOf).filter(m=>m>now));}
export function advanceTitles(d,engine,{after}){
    ensureNobleTitles(d,engine);
    for(let guard=0;guard<1000;guard++){
        const r=scheduled(d.get('state')).filter(r=>dueOf(r)<=after).sort((a,b)=>dueOf(a)-dueOf(b))[0];
        if(!r)return;
        if(r.category==='title_petition')decide(d,engine,r);
        else if(r.nextIncome<=r.levy.due)income(d,engine,r,r.nextIncome);
        else yearEnd(d,engine,r,r.levy.due);
    }
}
