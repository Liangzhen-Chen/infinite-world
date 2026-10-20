import {isPhysicallyDead} from './holdings.mjs';
import {recordsWhere} from './storage.mjs';
export const combatActor=(s,id)=>id==='player'?s.player:s.npcs?.[id]??s.creatures?.[id];
export const combatLocation=(s,id)=>id==='player'?s.location:combatActor(s,id)?.location;
// A historic hostile event alone does not keep an encounter active.
export function activeEncounters(e,s,actor='player'){
 return recordsWhere(s.records,'category','combat_encounter').filter(r=>r.active&&r.participants.includes(actor)&&r.participants.every(id=>combatActor(s,id)&&!isPhysicallyDead(e,s,id)&&combatLocation(s,id)===combatLocation(s,actor)));
}
