import {isEffective} from './lifecycle-state.mjs';
import {isPhysicallyDead} from './holdings.mjs';
import {recordsWhere} from './storage.mjs';
export const combatActor=(s,id)=>id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id];
export const combatLocation=(s,id)=>id==='player'?s.location:combatActor(s,id)?.location;
// A historic hostile event alone does not keep an encounter active.
export function activeEncounters(e,s,actor='player'){
 return recordsWhere(s.records,'category','combat_encounter').filter(r=>r.active&&r.participants.includes(actor)&&r.participants.every(id=>combatActor(s,id)&&!isPhysicallyDead(e,s,id)&&combatLocation(s,id)===combatLocation(s,actor)));
}

const awake=(n,engine,source,id)=>n&&isEffective(engine,source,id)&&!['濒死','昏迷'].includes(n.status)&&!n.scheduleTravel&&!n.cognitionTravel&&!/睡/.test(n.activity??'');
export function activeDuel(d,engine,target,challenger='player'){
    const now=d.get('state','minute'),location=d.get('state','location');
    return Object.values(d.get('state','records')??{}).find(r=>r.category==='duel'&&r.status==='已接受'&&[r.challenger,r.target].includes(challenger)&&[r.challenger,r.target].includes(target)&&challenger!==target&&r.location===location&&r.expires>now
        &&[r.challenger,r.target].every(id=>awake(id==='player'?d.get('state','player'):d.get('state','npcs',id),engine,d,id)&&(id==='player'||d.get('state','npcs',id,'location')===location))
        &&awake(d.get('state','npcs',r.witness),engine,d,r.witness)&&d.get('state','npcs',r.witness,'location')===location);
}
