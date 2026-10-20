import {facilityView} from './facility-state.mjs';
import {knowledgeProficiency} from './education-state.mjs';

// Like derived shops, recipes are capabilities of current work, never edits to
// a published person. A service-bearing or explicit production slot marks work;
// merely sleeping or eating in a workshop does not put its resident on duty.
// Schedule projections omit presence; actual consumers still require arrival.
export function workstationRecipes(engine,state,id,slot,{present=false}={}){
    if(!state||!slot?.location||!slot.services?.length&&slot.production!==true)return [];
    const actor=state.npcs?.[id];
    if(present&&(!actor||actor.location!==slot.location||actor.scheduleTravel||actor.cognitionTravel||actor.caring||actor.levy||['死亡','濒死','昏迷','患病'].includes(actor.status)))return [];
    const location=state.created?.[slot.location]??engine.byId.get(slot.location);
    const facility=facilityView(engine,state,slot.location);
    if(facility?.factor===0)return [];
    const stations=facility?.workstations??location?.workstations??[];
    if(!stations.length)return [];
    return [...engine.world.recipes??[],...Object.values(state.created??{}).filter(r=>r.id?.startsWith('recipe_'))].filter(r=>
        r.workstation&&(!r.location||r.location===slot.location)&&stations.some(s=>s.kind===r.workstation)&&
        knowledgeProficiency(engine,state,id,r.skill)>=(r.minimumProficiency??0));
}

export function currentWorkstationRecipes(engine,state,id){
    const slot=engine.protocolScheduleAt?.(engine,id,state.minute,state);
    return workstationRecipes(engine,state,id,slot,{present:true});
}
