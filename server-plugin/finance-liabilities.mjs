import {obligationRows,obligationView} from './obligation-state.mjs';

// Deposits and interbank clearing use canonical claims. An uncashed bill is
// counted once at its issuer; its beneficiary claim is the same liability.
export function bankLiabilities(state,bank,minute=state.minute){
    const claims=obligationRows(state).filter(o=>o.debtor===bank);
    const deposits=claims.filter(o=>o.kind==='deposit').reduce((n,o)=>n+obligationView(state,o,minute).owed,0);
    const clearing=claims.filter(o=>o.kind==='bill'&&!o.billPayable).reduce((n,o)=>n+obligationView(state,o,minute).owed,0);
    const bills=Object.values(state.records??{}).filter(r=>r.category==='bank_bill'&&r.bank===bank&&r.status==='未兑付').reduce((n,r)=>n+r.amount,0);
    return {deposits,bills,clearing,total:deposits+bills+clearing};
}
