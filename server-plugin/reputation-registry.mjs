// Directory discovery stays catalog-based; current membership is a live view.
import {reputationFactions as catalogFactions} from './reputation-catalog.mjs';
import {organizationState} from './organization-state.mjs';
export {deriveReputationRegistry,reputationSettlements,isReputationSettlement} from './reputation-catalog.mjs';
export function reputationFactions(engine,state){
    const rows=catalogFactions(engine);
    if(!state)return rows;
    return rows.map(f=>({...f,members:Object.keys(organizationState(engine,state,f.id)?.members??{})}));
}
