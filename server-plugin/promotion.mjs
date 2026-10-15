import {settlementHead,personRegistrar} from './entity-view.mjs';
import {authorityOf,playerOffices,residentAdults} from './governance.mjs';
import {standing} from './standing.mjs';
import {knownTopics,opinionOf} from './public-opinion.mjs';
import {promotionRules,adminLevel,marketFactor} from './promotion-view.mjs';
export {promotionRules,adminLevel,rankedOffice,marketFactor} from './promotion-view.mjs';

// U13 settlement promotion. Administrative level (village, town, city,
// county, province; five to one) is kept apart from size: it is set by the
// jurisdiction source and changed only by an approved petition. A village
// meeting the published conditions (population, housing, industry, public
// facilities, order, residents' opinion) is put forward by its sitting head or
// original headman at the Baishi office and decided by the capital domain
// registry, which also keeps the five-to-one cap under the same superior.
// Promotion renames and rescales the offices, widens the tax range, raises the
// quest quota and opens a market (larger shop restocks). Off screen the
// registry looks at every village on its cycle and files or notifies.
const DAY=1440,rec=id=>['state','records',id],rankKey=s=>`settlement_rank:${s}`;
const awake=n=>n&&!['死亡','濒死','昏迷','患病'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡眠|睡觉|熟睡/.test(n.activity??'');
const CAP={村:'villagesPerTown',镇:'townsPerCity',城:'citiesPerCounty',郡:'countiesPerProvince'};
function within(engine,location,place){const seen=new Set();while(location&&!seen.has(location)){if(location===place)return true;seen.add(location);location=engine.byId.get(location)?.parent;}return false;}

function allLevels(engine,state){
    const ids=new Set([...Object.keys(promotionRules(engine)?.jurisdiction??{}),...Object.values(state.records??{}).filter(r=>r.category==='settlement_rank').map(r=>r.settlement)]);
    return [...ids].map(id=>({id,...adminLevel(engine,state,id)}));
}
const stepFor=(engine,level)=>promotionRules(engine)?.steps.find(s=>s.from===level)??null;
// Who answers for the settlement: the player while sitting as head, else the original headman.
const governor=(engine,state,settlement)=>settlementHead(engine,state,settlement).value;
// Residents' view of the governor: what they know of the governor's deeds
// (public opinion), otherwise their own regard.
function opinion(engine,state,settlement,who){
    let support=0,oppose=0;
    for(const id of residentAdults(engine,settlement,state)){
        if(id===who)continue;
        const topics=[...knownTopics(engine,{state},id).values()].filter(t=>t.actor===who);
        const net=topics.length?topics.reduce((n,t)=>{const s=opinionOf(engine,state,id,t).stance;return n+(s==='support'?1:s==='oppose'?-1:0);},0):standing(engine,state,id,who);
        if(net>0)support++;else if(net<0)oppose++;
    }
    return {support,oppose};
}
export function promotionConditions(engine,state,settlement,{survey=false}={}){
    const level=adminLevel(engine,state,settlement),step=level&&stepFor(engine,level.level);
    if(!step)return {settlement,level:level?.level??null,step:null,ok:false,reasons:['没有可升的级别']};
    const q=step.requires,s=state.settlements?.[settlement]??{},profile=engine.world.settlementProfiles?.find(p=>p.id===settlement);
    const created=Object.values(state.created??{}).filter(c=>c.scope===settlement);
    const housing=engine.world.locations.filter(l=>l.access?.mode==='private'&&l.id!==settlement&&within(engine,l.id,settlement)).length+created.filter(c=>c.purpose==='私宅').length;
    const businesses=Object.values(state.records??{}).filter(r=>r.category==='business'&&r.status==='营业'&&within(engine,r.location,settlement)).length;
    const industries=(profile?.details?.economy?.industries?.length??0)+businesses;
    const facilities=created.filter(c=>c.purpose==='公共设施').length;
    const cases=Object.values(state.records??{}).filter(r=>r.category==='legal_case'&&(r.settlement===settlement||within(engine,r.location,settlement))&&r.minute>state.minute-q.caseWindowDays*DAY).length;
    const who=governor(engine,state,settlement),ineligible=(s.population??0)<q.population||housing<q.housing||industries<q.industries||facilities<q.facilities||cases>q.maxCases;
    const views=who&&!(survey&&ineligible)?opinion(engine,state,settlement,who):{support:0,oppose:0};
    const checks={population:{have:s.population??0,need:q.population},housing:{have:housing,need:q.housing},industries:{have:industries,need:q.industries},
        facilities:{have:facilities,need:q.facilities},order:{have:cases,max:q.maxCases},opinion:{...views,governor:who}};
    const LABEL={population:'人口',housing:'住房',industries:'产业',facilities:'公共设施'},reasons=[];
    for(const k of Object.keys(LABEL))if(checks[k].have<checks[k].need)reasons.push(`${LABEL[k]}${checks[k].have}，未满${checks[k].need}`);
    if(cases>q.maxCases)reasons.push(`近${q.caseWindowDays}日立案${cases}起，多于${q.maxCases}`);
    if(views.oppose>views.support)reasons.push(`成年住户反对主事者${views.oppose}多于支持${views.support}`);
    return {settlement,level:level.level,to:step.to,step,checks,ok:!reasons.length,reasons};
}
// Five to one: towns under the same superior may not exceed the published cap.
function capacity(engine,state,settlement,step){
    const level=adminLevel(engine,state,settlement),above=adminLevel(engine,state,level.superior),superior=above?.superior??level.superior;
    const peers=allLevels(engine,state).filter(r=>r.level===step.to&&r.superior===superior&&r.id!==settlement).length,cap=engine.rules.governance[CAP[step.to]];
    return {superior,peers,cap,ok:peers<cap};
}
function registrar(d,engine){
    const charter=authorityOf(engine)?.superiors?.auth_bs_office_charter,state=d.get('state');
    if(!charter||state.location!==charter.seat)throw Error('升格申请须在白石镇公署前厅递件转呈');
    const staff=engine.world.npcs.filter(n=>personRegistrar(engine,state,n.id,charter.seat,charter.registrars.occupations)&&awake(state.npcs[n.id])&&state.npcs[n.id].location===state.location).map(n=>n.id).sort();
    if(!staff.length)throw Error('前厅没有在岗的递件或抄录人，不能登记');
    return staff[0];
}
const pending=(state,settlement)=>Object.values(state.records??{}).some(r=>r.category==='promotion_petition'&&r.status==='待审定'&&r.settlement===settlement);
function file(d,engine,settlement,applicant,clerk,eventId,at){
    const rules=promotionRules(engine),state=d.get('state'),c=promotionConditions(engine,state,settlement),id=`promotion_petition:${settlement}:${eventId}`;
    if(d.get(...rec(id)))throw Error('事务编号已占用');
    const row={category:'promotion_petition',id,settlement,from:c.level,to:c.to,applicant,registrar:clerk,institution:rules.approver.name,filedAt:at,due:at+rules.approver.decisionDays*DAY,
        status:'待审定',attached:c.checks,source:rules.source,sourceEvent:eventId};
    d.set(rec(id),row);return row;
}
function petition(d,engine,args,eventId){
    const rules=promotionRules(engine);if(!rules)throw Error('升格章程未登记');
    const settlement=engine.resolve(args.settlement,'loc'),state=d.get('state');
    if(!playerOffices(state,{settlement,power:'housing'},engine).length)throw Error('只有在任村长或原头人能为本村申请升格');
    const clerk=registrar(d,engine);
    if(pending(state,settlement))throw Error('本村已有待审定的升格申请');
    const c=promotionConditions(engine,state,settlement);if(!c.ok)throw Error(`升格条件未齐：${c.reasons.join('；')}`);
    const row=file(d,engine,settlement,'player',clerk,eventId,state.minute);
    return {petition:row.id,pending:row,note:`已转呈${rules.approver.name}，${rules.approver.decisionDays}日后按当时情形审定。`};
}
function decide(d,engine,p,at){
    const state=d.get('state'),c=promotionConditions(engine,state,p.settlement),reasons=[...c.reasons];
    if(c.level!==p.from)reasons.push('级别已变');
    const cap=c.step?capacity(engine,state,p.settlement,c.step):null;
    if(cap&&!cap.ok)reasons.push(`上级辖下已有${cap.peers}个${c.to}，满五比一上限${cap.cap}`);
    if(reasons.length){d.set(rec(p.id),{...p,status:'未获批准',decidedAt:at,reasons,checks:c.checks});return;}
    const key=rankKey(p.settlement),old=adminLevel(engine,state,p.settlement);
    d.set(rec(key),{category:'settlement_rank',id:key,settlement:p.settlement,level:c.to,superior:cap.superior,since:at,previous:{level:old.level,superior:old.superior},petition:p.id,approvedBy:promotionRules(engine).approver.name,source:promotionRules(engine).source});
    d.set(rec(p.id),{...p,status:'已批准',decidedAt:at,checks:c.checks});

}
// Off screen, on the registry's cycle: a village that meets the conditions is
// put forward by its original headman, or its sitting player head is told.
function survey(d,engine,at){
    const rules=promotionRules(engine),period=Math.floor(at/(rules.checkEveryDays*DAY));
    for(const {id:settlement,level}of allLevels(engine,d.get('state')).sort((a,b)=>a.id.localeCompare(b.id))){
        const state=d.get('state');
        if(!stepFor(engine,level)||pending(state,settlement)||!state.settlements?.[settlement])continue;
        const c=promotionConditions(engine,state,settlement,{survey:true});if(!c.ok)continue;
        const who=c.checks.opinion.governor;
        if(who==='player'){
            const key=`promotion_notice:${settlement}:${period}`;if(d.get(...rec(key)))continue;
            d.set(rec(key),{category:'promotion_notice',id:key,settlement,minute:at,to:c.to,checks:c.checks,note:'条件已齐，可到白石镇公署前厅递件申请升格',sourceEvent:key});
            d.say(`${engine.byId.get(settlement)?.name??settlement}已具备升为${c.to}的条件，可到公署递件`);
        }else if(who&&state.npcs?.[who]?.status!=='死亡')file(d,engine,settlement,who,null,`survey_${period}`,at);
    }
}
export function promotionAction(d,args,eventId){
    if(args.operation==='promotion_petition')return petition(d,this,args,eventId);
    if(args.operation==='promotion_inspect'){
        const settlement=this.resolve(args.settlement,'loc'),state=d.get('state');
        return {settlement,level:adminLevel(this,state,settlement),conditions:promotionConditions(this,state,settlement),marketFactor:marketFactor(this,state,settlement),
            petitions:Object.values(state.records??{}).filter(r=>r.category==='promotion_petition'&&r.settlement===settlement),actionScope:{kind:'instant'}};
    }
    throw Error('未知升格事务');
}
const scheduled=state=>Object.values(state.records??{}).filter(r=>r.category==='promotion_petition'&&r.status==='待审定');
export function nextPromotionMinute(state,now){return Math.min(Infinity,...scheduled(state).map(r=>r.due).filter(m=>m>now));}
export function advancePromotion(d,engine,{before,after}){
    const rules=promotionRules(engine);if(!rules)return;
    for(let guard=0;guard<1000;guard++){
        const r=scheduled(d.get('state')).filter(r=>r.due<=after).sort((a,b)=>a.due-b.due||a.id.localeCompare(b.id))[0];
        if(!r)break;decide(d,engine,r,r.due);
    }
    const every=rules.checkEveryDays*DAY;
    for(let at=(Math.floor(before/every)+1)*every;at<=after;at+=every)survey(d,engine,at);
}
