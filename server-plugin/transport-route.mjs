import {weatherTravel} from './weather.mjs';
import {facilityRouteStates} from './facility-state.mjs';
import {hazardRouteClosed,warRouteClosed} from './hazard-calendar.mjs';

const DAY=1440;
// Both public grain caravans and hired carriers consume the same route state.
export function transportSegment(engine,state,seed,t,mode,minute){
 const edge=engine.world.routes.find(e=>e.id===t.edges[t.edgeIndex]),budget=engine.rules.travel.dailyTravelMinutes;
 if(mode!=='boat'&&t.movingMinutes>0&&t.movingMinutes%budget===0&&t.restedBudgets<t.movingMinutes/budget)
  return {kind:'rest',minutes:DAY-budget};
 const condition=edge?weatherTravel(engine,seed,{...edge,from:t.location},mode,minute):null;
 const facility=facilityRouteStates(engine,state).get(edge?.id);
 if(!edge||!edge.modes.includes(mode)||facility?.factor===0||warRouteClosed(state,edge.id,minute)||edge.closedSeasons.includes(engine.calendar(minute).season)||condition?.closed||hazardRouteClosed(engine,seed,edge.id,minute))
  return {kind:'wait',minutes:DAY-minute%DAY,reason:'道路或天气不通'};
 const base=mode==='cart'?engine.rules.travel.cartKmh:engine.rules.travel.walkKmh*(mode==='horse'?engine.rules.travel.horseMultiplier:1);
 const speed=(edge.speedKmh??base)*(edge.terrainMultiplier??1)*(facility?1.25*facility.factor:1),rate=speed/(condition?.multiplier??1)/60;
 const remaining=t.remainingKm??edge.lengthKm;
 const duration=Math.min(DAY-minute%DAY,mode==='boat'?Infinity:budget-t.movingMinutes%budget,Math.max(1,Math.ceil(remaining/rate)));
 return {kind:'move',minutes:duration,distanceKm:Math.min(remaining,duration*rate),destination:edge.from===t.location?edge.to:edge.from};
}
export function stepTransport(engine,t,segment){
 if(segment.kind==='rest')t.restedBudgets++;
 if(segment.kind!=='move')return false;
 const edge=engine.world.routes.find(e=>e.id===t.edges[t.edgeIndex]);
 t.remainingKm=Math.max(0,(t.remainingKm??edge.lengthKm)-segment.distanceKm);t.movingMinutes+=segment.minutes;
 if(t.remainingKm>1e-9)return false;
 t.location=segment.destination;t.edgeIndex++;t.remainingKm=null;return true;
}
