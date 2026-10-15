import {advanceLayerPlan} from './advance-layers.mjs';

// Read-only selection, shared by scene and retrieval. Authored entries keep
// their original order; generated detail follows the player's nearby counties.
const plans=new WeakMap();
export function promptScope(engine,state){
    let locations=plans.get(engine.world);
    if(!locations){locations=new Map();plans.set(engine.world,locations);}
    let plan=locations.get(state.location);
    if(!plan){plan=advanceLayerPlan(engine,state);locations.set(state.location,plan);if(locations.size>4)locations.delete(locations.keys().next().value);}
    const nearby=id=>{const county=plan.countyOf(id);return !county||plan.layers.get(county)!=='statistics';};
    return {nearby,plan,profiles:engine.world.settlementProfiles?.filter(p=>p.generated!=='remote'||nearby(p.id))??[]};
}
