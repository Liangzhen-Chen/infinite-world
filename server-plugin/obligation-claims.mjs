// Domain facts (earned wages, delivered care and adjudicated losses) import
// through the existing legacy bridge. There is only one payable claim.
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {adoptLegacyObligation,dueObligation,settleObligation} from './obligation-runtime.mjs';
import {obligationRow,obligationRows,currentGrace} from './obligation-state.mjs';
import {obligationTransaction} from './transition.mjs';
import {canonical} from './storage.mjs';
import {ledgerActive} from './ledger.mjs';
declareHoldingWriter('obligation-claims',{kinds:[]});
const path=id=>['state','records',id];

export function registerEarnedClaim(d,e,row){
    return obligationTransaction(d,()=>registerClaim(d,e,row));
}
function registerClaim(d,e,row){
    const old=d.get(...path(row.id));
    if(old){
        for(const k of ['debtor','creditor','amount','kind','source'])if(canonical(old[k]??null)!==canonical(row[k]??null))throw Error('Claim identity reused with different facts');
        return adoptLegacyObligation(d,e,row.id);
    }
    holdingSet(d,e,path(row.id),{category:'debt',paid:0,status:'待偿还',...row},'obligation-claims');
    return adoptLegacyObligation(d,e,row.id);
}
// Limitation never erases the underlying debt. Only recorded legal events
// suspend or restart the procedural clock; a caller's arbitrary flag cannot.
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
export function recordClaimProcedure(d,e,{claim,action,minute=d.get('state','minute'),evidence},eventId){
    const row=obligationRow(d.get('state'),claim),fact=d.get(...path(evidence));
    if(!row||!['suspend','resume','restart'].includes(action)||!Number.isSafeInteger(minute)||minute>d.get('state','minute'))throw Error('Invalid claim procedure');
    // Filing/hearing suspends; a recorded payment or acknowledgment restarts.
    if(!fact||!(fact.category==='legal_case'&&fact.debt===row.legacyRecord||fact.category==='legal_case'&&fact.debt===row.id||fact.category==='world_event'&&fact.obligation===row.id&&fact.verb==='obligation_settled'))throw Error('Claim procedure requires its actual case or payment');
    const id=`claim_procedure:${eventId}`,next={id,category:'claim_procedure',claim:row.id,action,minute,evidence},old=d.get(...path(id));
    if(old){if(canonical(old)!==canonical(next))throw Error('Procedure event reused');return old;}
    holdingSet(d,e,path(id),next,'obligation-claims');return next;
}
export function claimEnforceable(d,row,minute){return claimLimitation(d.get('state'),row,minute).enforceable;}
export function settleClaim(d,e,args,eventId){
    // The runtime returns the actual ledger transfer. A legacy, unopened
    // draft would otherwise debit its mirror while reporting transferred=0.
    if(!ledgerActive(d))throw Error('须在已开账的引擎事务中清偿债权');
    const adapter=Object.create(e);adapter.obligationClaimEnforceable=claimEnforceable;
    return obligationTransaction(d,()=>{
        adoptLegacyObligation(d,e,args.id);
        const result=settleObligation(d,adapter,args,eventId),row=obligationRow(d.get('state'),result.id);
        if(row.terms?.limitation)recordClaimProcedure(d,e,{claim:row.id,action:'restart',evidence:`world_event:obligation:${row.id}:${eventId}`},`${eventId}:payment-restart`);
        return result;
    });
}
export function claimDue(e,state,id,minute=state.minute){
    const row=obligationRow(state,id);if(!row)return null;
    return dueObligation(state,row,minute,{allowance:currentGrace(e,state,row,minute)});
}

export function lossView(state,id){
    const row=state.records?.[id];if(row?.category!=='obligation_loss')return null;
    const recovered=Object.values(row.recoveries??{}).reduce((n,r)=>n+r.amount,0);
    return {...row,recovered,remaining:Math.max(0,row.amount-recovered)};
}
export function registerLoss(d,e,{id,victim,amount,source}){
    if(!id||!victim||!Number.isSafeInteger(amount)||amount<0)throw Error('Invalid loss');
    const old=lossView(d.get('state'),id);
    if(old){if(old.victim!==victim||old.amount!==amount||old.source!==source)throw Error('Loss identity reused');return old;}
    holdingSet(d,e,path(id),{id,category:'obligation_loss',victim,amount,source,recoveries:{}},'obligation-claims');return lossView(d.get('state'),id);
}
// The caller performs the actual transfer/return inside this transaction.
// Transport insurance, restitution and judgments can share the same loss id.
export function recoverLoss(d,e,{id,amount,payer,kind='payment'},eventId,transfer){
    return obligationTransaction(d,()=>{
        const row=lossView(d.get('state'),id);if(!row)throw Error('Unknown loss');
        const old=row.recoveries[eventId];
        if(old){if(old.amount!==amount||old.payer!==payer||old.kind!==kind)throw Error('Recovery event reused');return old;}
        if(!Number.isSafeInteger(amount)||amount<0||amount>row.remaining)throw Error('Recovery exceeds remaining loss');
        transfer?.(amount);
        const result={amount,payer,kind,minute:d.get('state','minute')};
        holdingSet(d,e,path(id),{...d.get(...path(id)),recoveries:{...row.recoveries,[eventId]:result}},'obligation-claims');return result;
    });
}
export function wagePriorityClaims(state,debtor){
    return obligationRows(state).filter(r=>r.debtor===debtor&&r.kind==='wage'&&dueObligation(state,r).owed>0)
        .sort((a,b)=>(a.createdAt??0)-(b.createdAt??0)||a.id.localeCompare(b.id));
}
