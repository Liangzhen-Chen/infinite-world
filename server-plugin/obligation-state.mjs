// Shared L1 obligation arithmetic. Queries do not mutate a document or inspect
// an actor's location, consciousness, confinement or lifecycle procedure (I29).
import {accrualFraction,addAccrual,fraction} from './obligation-calendar.mjs';
// Installed by the engine composition root. Pure consumer queries must not
// import the legal/action graph back through entity-view.
let civilGrace=null;
export const registerObligationCivilGrace=resolve=>{civilGrace=resolve;};

export const DAY=1440;
const ended=new Set(['settled','void','cancelled','bad_debt','closed','completed','terminated','expired','已还清','已取消','坏账','已完成','已终止','已到期','取消']);
export const obligationClosed=row=>ended.has(row.status);

// One canonical claim can have an old records projection. Never add their
// balances together. Reads of pre-migration saves do not perform migration.
export function obligationRow(state,id){
    const direct=state.obligations?.[id];if(direct)return direct;
    const legacy=state.records?.[id];
    if(legacy?.obligation&&state.obligations?.[legacy.obligation])return state.obligations[legacy.obligation];
    return Object.values(state.obligations??{}).find(o=>o.legacyRecord===id)??legacy??null;
}
export function obligationRows(state){
    const rows=new Map(Object.entries(state.obligations??{}));
    const projections=new Set([...rows.values()].map(o=>o.legacyRecord).filter(Boolean));
    for(const [id,row]of Object.entries(state.records??{}))if(row.category==='debt'&&!rows.has(row.obligation??id)&&!projections.has(id))rows.set(id,{...row,id});
    return [...rows.values()];
}
// Shared labor valuation input. Consumers supply the current proficiency and
// relationship derivations; an already signed wage is never repriced here.
export function wageQuote({baseHalfDay,proficiency=0,regard=0,minutes=480,signedWage=null}){
    if(!Number.isFinite(baseHalfDay)||baseHalfDay<0||!Number.isFinite(proficiency)||proficiency<0||!Number.isSafeInteger(minutes)||minutes<0)throw Error('Invalid wage quote inputs');
    const daily=signedWage??Math.ceil(baseHalfDay*2*(1+proficiency/3000)*(regard<0?1.2:1));
    if(!Number.isSafeInteger(daily)||daily<0)throw Error('Invalid signed wage');
    return {daily,amount:Math.ceil(daily*minutes/480),minutes};
}
export function obligationAccrued(row,minute){
    const terms=row.terms??row.clauses??row,accrual=terms.accrual;
    if(!accrual)return 0;
    let expires=terms.expires??row.expires??row.deadline??Infinity;
    for(const a of row.amendments??[])if(a.minute<=minute&&a.expires!==undefined)expires=a.expires;
    const start=row.createdAt??terms.starts??0,until=Math.min(minute,row.endedAt??row.closedAt??Infinity,expires);
    if(until<=start)return 0;
    let total=fraction(0n),at=start,current={...terms,...accrual};
    const cumulative=(end,t)=>accrualFraction({...t,from:start,to:end,calendar:terms.calendar,value:t.value,principal:t.principal??terms.principal});
    for(const a of row.amendments??[]){
        if(a.minute>until)break;
        if(a.minute<start)continue;
        total=addAccrual(total,addAccrual(cumulative(a.minute,current),cumulative(at,current),-1n));at=a.minute;
        current={...current,...a,...a.accrual};
    }
    total=addAccrual(total,addAccrual(cumulative(until,current),cumulative(at,current),-1n));
    return Number(total.numerator/total.denominator)-(row.accrualSettled??0);
}
export function obligationView(state,id,minute=state.minute??0,options={}){
    const row=typeof id==='object'?id:obligationRow(state,id);if(!row)return null;
    const paid=row.paid??0,accrued=obligationAccrued(row,minute);
    const gross=(row.amount??row.coins??0)+accrued;
    const remaining=Math.max(0,Math.min(row.remaining!==undefined?row.remaining+accrued:gross-paid,Math.max(0,(row.terms?.liabilityCap??Infinity)-(row.remaining!==undefined?0:paid))));
    const extinguished=['void','cancelled','bad_debt','已取消','坏账'].includes(row.status);
    const owed=extinguished?0:remaining;
    const closed=row.endedAt!==undefined||obligationClosed(row)||['已完成','取消'].includes(row.status);
    const start=row.createdAt??row.terms?.starts??0,deadline=row.called?.effectiveAt??row.deadline??row.terms?.deadline??Infinity;
    const plan=Number.isSafeInteger(deadline)?installmentState({...row,createdAt:start,deadline,amount:gross},minute):{target:0,outstanding:0,nextDue:Infinity,overdueCount:0};
    const effective={...row,terms:{...row.terms}};
    for(const a of row.amendments??[])if(a.minute<=minute&&a.grace!==undefined)effective.terms.grace=a.grace;
    const allowance=options.allowance??grace(effective,minute,options);
    return {id:row.id??(typeof id==='string'?id:null),row,closed,owed,paid,accrued,
        amountDue:owed&&minute>=deadline?owed:Math.min(owed,plan.outstanding),
        overdueCount:owed&&minute>=plan.nextDue+allowance.minutes?plan.overdueCount:0,
        nextDue:owed?plan.nextDue:Infinity,grace:allowance};
}

// Contractual grace is a signed fact. Procedural grace is queried now, so a
// caller supplies the currently selected civil clause, never a signing snapshot.
export function grace(row,minute,{civil=null,fallbackMinutes=0}={}){
    const clause=row.clauses?.grace??row.terms?.grace??civil;
    const minutes=typeof clause==='number'?clause:clause?.minutes??(clause?.days===undefined?fallbackMinutes:clause.days*DAY);
    if(!Number.isSafeInteger(minutes)||minutes<0)throw Error('义务宽限必须是非负整数分钟');
    return {minutes,basis:row.clauses?.grace!==undefined||row.terms?.grace!==undefined?'contract':civil!==null?'civil':'kind',at:minute};
}
export function currentGrace(engine,state,row,minute,{fallbackMinutes=0}={}){
    if(engine.world&&!civilGrace)throw Error('Current civil grace resolver is not installed');
    const civil=engine.world?civilGrace(engine,state,row,minute):null;
    return grace(row,minute,{civil,fallbackMinutes});
}

export function installmentState(row,minute){
    const count=row.installments??1,start=row.createdAt??row.terms?.starts??0,end=row.deadline;
    if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||end<start||count>1&&end===start)throw Error('分期义务的期数或期限无效');
    const paid=row.paid??0,total=row.amount??0;
    // Invert ceil(total * n / count) without rounding individual installments.
    const completed=total>0?Math.min(count,Math.floor(paid*count/total)):count;
    const dueAt=n=>start+Math.ceil((end-start)*n/count);
    let dueCount=end===start?(minute>=end?1:0):Math.min(count,Math.max(0,Math.floor((minute-start)*count/(end-start))));
    if(dueCount<count&&dueAt(dueCount+1)<=minute)dueCount++;
    return {count,completed,dueCount,target:Math.ceil(total*dueCount/count),
        outstanding:Math.max(0,Math.ceil(total*dueCount/count)-paid),
        nextDue:completed<count?dueAt(completed+1):Infinity,
        overdueCount:Math.max(0,dueCount-completed)};
}

export function pawnDeadline(row,engine,minute,state=engine.document?.state??{}){
    return row.deadline+currentGrace(engine,state,row,minute,{fallbackMinutes:(engine.rules.economy.credit.pawn.graceDays??0)*DAY}).minutes;
}

// Legacy daily-rate contracts have a fixed 30-day interest basis. Keep that
// signed convention separate from calendar-anchor contracts.
export function accruedInterest(row,minute,{round='trunc'}={}){
    const from=row.accruedTo??row.createdAt,until=Math.min(minute,row.deadline??minute,row.endedAt??minute);
    const principal=row.principal??row.terms?.principal??0,rate=row.monthlyInterest??row.terms?.monthlyInterest??0;
    if(!Number.isSafeInteger(from)||!Number.isFinite(until)||!Number.isFinite(principal)||!Number.isFinite(rate)||principal<0||rate<0)throw Error('义务累计条款无效');
    const amount=principal*rate*Math.max(0,until-from)/(30*DAY);
    if(!['ceil','trunc'].includes(round))throw Error('累计取整方式无效');
    return Math[round](amount);
}

// The same due query drives contracts, defaults and scheduler wakeups.
export function debtDue(row,minute,options={}){
    const allowance=options.allowance??grace(row,minute,options);
    const plan=installmentState(row,minute);
    const deadline=plan.nextDue+allowance.minutes;
    return {...plan,deadline,grace:allowance,overdue:!obligationClosed(row)&&minute>=deadline&&(row.paid??0)<row.amount};
}

// Add obligations to S2b's heap, including installments and procedural grace
// that are not represented by the legacy record.deadline field.
export function addObligationSchedule(heap,engine,row,now,end,state={}){
    if(obligationClosed(row))return;
    const add=minute=>{if(Number.isSafeInteger(minute)&&minute>now&&minute<=end)heap.add({kind:'due',minute,dueClass:'义务',anchorId:row.debtor??row.id??''});};
    if(row.category==='debt'&&row.deadline>row.createdAt){
        const plan=installmentState(row,now),allowance=currentGrace(engine,state,row,now);
        add(plan.nextDue+allowance.minutes);
        if(row.status==='逾期'&&!row.defaulted)
            add((row.installmentOverdueAt??row.deadline)+currentGrace(engine,state,row,now,{fallbackMinutes:engine.rules.economy?.credit?.loan?.defaultGraceMinutes??0}).minutes);
        add(row.nextPayment);
        if(row.kind==='pawn')add(pawnDeadline(row,engine,now,state));
    }
    const period=engine.rules.economy?.credit?.depositInterest?.periodDays;
    if(row.category==='bank'&&period&&row.interestAt!==undefined)add(row.interestAt+period*DAY);
    if(row.category==='contract'){add(row.nextRent);add(row.nextDividend);}
}


export function claimLimitation(state,id,minute=state.minute){
    const row=typeof id==='object'?id:obligationRow(state,id),terms=row?.terms?.limitation;
    if(!terms)return {enforceable:true,elapsed:0,remaining:Infinity};
    const period=typeof terms==='number'?terms:terms.minutes;
    if(!Number.isSafeInteger(period)||period<0)throw Error('Invalid limitation period');
    let start=row.deadline??row.createdAt??0,paused=null,elapsed=0;
    const events=Object.values(state.records??{}).filter(r=>r.category==='claim_procedure'&&r.claim===row.id&&r.minute<=minute).sort((a,b)=>a.minute-b.minute||a.id.localeCompare(b.id));
    for(const fact of events){
        if(fact.minute<start)continue;
        if(fact.action==='restart'){elapsed=0;start=fact.minute;paused=null;}
        if(fact.action==='suspend'&&paused===null){elapsed+=fact.minute-start;paused=fact.minute;}
        if(fact.action==='resume'&&paused!==null){start=fact.minute;paused=null;}
    }
    elapsed+=paused===null?Math.max(0,minute-start):0;
    return {enforceable:elapsed<=period,elapsed,remaining:Math.max(0,period-elapsed),suspended:paused!==null};
}

export function claimEnforceable(d,row,minute){return claimLimitation(d.get('state'),row,minute).enforceable;}
