// Shared L1 obligation arithmetic. Queries do not mutate a document or inspect
// an actor's location, consciousness, confinement or lifecycle procedure (I29).
import {legalCodeAt} from './law-codes.mjs';

export const DAY=1440;
const ended=new Set(['settled','void','cancelled','bad_debt','已还清','已取消','坏账']);
export const obligationClosed=row=>ended.has(row.status);

// Contractual grace is a signed fact. Procedural grace is queried now, so a
// caller supplies the currently selected civil clause, never a signing snapshot.
export function grace(row,minute,{civil=null,fallbackMinutes=0}={}){
    const clause=row.clauses?.grace??row.terms?.grace??civil;
    const minutes=typeof clause==='number'?clause:clause?.minutes??(clause?.days===undefined?fallbackMinutes:clause.days*DAY);
    if(!Number.isSafeInteger(minutes)||minutes<0)throw Error('义务宽限必须是非负整数分钟');
    return {minutes,basis:row.clauses?.grace!==undefined||row.terms?.grace!==undefined?'contract':civil!==null?'civil':'kind',at:minute};
}
export function currentGrace(engine,state,row,minute,{fallbackMinutes=0}={}){
    const location=row.location??state.location;
    const civil=engine.world?legalCodeAt(engine,location,{...state,minute})?.civil?.grace??null:null;
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

