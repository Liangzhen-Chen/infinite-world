// Directory discovery stays catalog-based; current membership is a live view.
import {reputationFactions as catalogFactions} from './reputation-catalog.mjs';
import {groupView} from './entity-view.mjs';
export {deriveReputationRegistry,reputationSettlements,isReputationSettlement} from './reputation-catalog.mjs';
export function reputationFactions(engine,state){
    const rows=catalogFactions(engine);
    if(!state)return rows;
    return rows.map(f=>({...f,members:Object.keys(groupView(engine,state,f.id)?.members.value??{})}));
}

// Separate relation supplements leave reviewed society council rows intact.
// Existing catalog directions win; campaign account values win at their reader.
export function factionRelations(engine,id){
    const base=engine.world.factions?.find(f=>f.id===id)?.relations??[];
    return [...base,...(engine.rules.factionRelations?.[id]??[]).filter(r=>!base.some(b=>b.faction===r.faction))];
}
