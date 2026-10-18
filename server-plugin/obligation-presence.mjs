// Settlement is physical: a claim does not make a remote purse reachable.
// This query is deliberately separate from due/default arithmetic (I29).
export function settlementLocation(engine,state,id,seen=new Set()){
    if(!id||seen.has(id))return null;
    seen.add(id);
    if(id==='player')return state.location??null;
    const bank=engine.rules.economy?.credit?.banks?.find(b=>b.id===id);
    if(bank)return bank.location;
    const row=state.npcs?.[id]??state.creatures?.[id]??state.created?.[id]??state.records?.[id]??state.records?.[`organization:${id}`]??engine.byId.get(id);
    if(row?.scheduleTravel||row?.cognitionTravel)return null;
    const location=row?.seat??row?.location??row?.home?.location;
    if(location)return location;
    // Projects and procedural estates keep money at their site/executor.
    const entity=state.projects?.[id]??state.records?.[`protocol_assets:${id}`];
    if(entity?.location||entity?.seat)return entity.location??entity.seat;
    return entity?.executor?settlementLocation(engine,state,entity.executor,seen):null;
}
export function settlementPresent(engine,state,payer,collector){
    const source=settlementLocation(engine,state,payer),target=settlementLocation(engine,state,collector);
    return source!==null&&source===target;
}
export function assertSettlementPresent(engine,state,payer,collector){
    if(!settlementPresent(engine,state,payer,collector))throw Error('清偿双方须实际在场；异地款项须经钱庄寄汇或承运送达');
}
