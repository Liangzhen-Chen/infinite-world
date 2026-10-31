// U3: read-only side of the seasonal hazard clocks (rules.hazardClock).
// Kept free of the effect table so weather, trade and NPC modules can ask
// "is this route flooded / what is the price swing / is there famine here"
// without import cycles. The writers live in seasonal-hazards.mjs.
//
// Clocks whose stage conditions are all pure (always, seeded weather) have a
// stage history that is a function of campaign seed, clock and year alone, so
// route closures are decided the same way for planning, replays and NPCs.
import {createHash} from 'node:crypto';
import {weatherAt} from './weather.mjs';
import {recordsWhere} from './storage.mjs';

const DAY=1440,YEAR=360*DAY;
export const PURE_CONDITIONS=Object.freeze(['always','weather']);
const NONE=Object.freeze([]);
export function hazardClocks(engine){return engine.rules?.hazardClock?.clocks??NONE;}
export const hazardKey=id=>`hazard-clock:${id}`;
// Same construction as world-clock clockRoll: campaign, subject and absolute
// day; the number and size of time steps never change the stream.
export function hazardRoll(seed,id,day){return createHash('sha256').update(JSON.stringify([seed,id,day])).digest().readUInt32LE(0)/2**32;}
export const isPureClock=rule=>rule.stages.every(s=>PURE_CONDITIONS.includes(s.condition?.kind));
// Days of the year (0..359) on which a clock checks its next stage.
export function hazardTickDays(rule){
 const first=Math.min(...rule.seasons)*90,last=(Math.max(...rule.seasons)+1)*90,out=[];
 for(let day=first;day<last;day+=rule.intervalDays)out.push(day);
 return out;
}
export function isHazardTick(rule,day){const d=day%360,first=Math.min(...rule.seasons)*90;return rule.seasons.includes(Math.floor(d/90))&&(d-first)%rule.intervalDays===0;}
export function pureConditionMet(engine,seed,rule,condition,day){
 if(condition.kind==='always')return {met:true};
 const w=weatherAt(engine,seed,condition.location??rule.settlement,day*DAY+720);
 return {met:Boolean(w)&&condition.kinds.includes(w.kind),value:w?.kind??null,evidence:'seeded-weather'};
}
// Stage fires of a pure clock in one campaign year: [{minute,phase,stage}].
const fireCache=new WeakMap();
export function pureHazardFires(engine,seed,rule,year){
 let byRule=fireCache.get(rule);if(!byRule){byRule=new Map();fireCache.set(rule,byRule);}
 const key=`${seed}|${year}`;if(byRule.has(key))return byRule.get(key);
 const out=[];let phase=0;
 for(const d of hazardTickDays(rule)){
  const stage=rule.stages[phase];if(!stage)break;
  const day=year*360+d,trigger=pureConditionMet(engine,seed,rule,stage.condition,day),roll=hazardRoll(seed,rule.id,day);
  if(trigger.met&&roll<stage.probability){phase++;out.push({minute:day*DAY,phase,stage:stage.id,roll,trigger});}
 }
 byRule.set(key,out);if(byRule.size>32)byRule.delete(byRule.keys().next().value);
 return out;
}
// Current phase (number of stages passed this year) of a pure clock.
export function pureHazardPhase(engine,seed,rule,minute){
 const year=Math.floor(minute/YEAR);return pureHazardFires(engine,seed,rule,year).filter(f=>f.minute<=minute).length;
}
// A flooded route is closed for the closure's minutes after the stage fired.
// Closures may outlast the year boundary, so the previous year is consulted.
// Route -> [{stage, effect}] for the pure clocks of one rules table, built once.
const closureIndex=new WeakMap();
function closuresOf(engine){
 const rules=hazardClocks(engine);let index=closureIndex.get(rules);
 if(!index){
  index=new Map();
  for(const rule of rules)if(isPureClock(rule))for(const s of rule.stages)for(const e of s.effects)if(e.kind==='route_closure')
   for(const route of e.routes){if(!index.has(route))index.set(route,[]);index.get(route).push({rule,stage:s.id,effect:e});}
  closureIndex.set(rules,index);
 }
 return index;
}
export function hazardRouteClosure(engine,seed,routeId,minute){
 const rows=closuresOf(engine).get(routeId);if(!rows)return null;
 const year=Math.floor(minute/YEAR);
 for(const {rule,stage,effect:e} of rows)for(const y of [year-1,year])if(y>=0)for(const fire of pureHazardFires(engine,seed,rule,y))
  if(fire.stage===stage&&fire.minute<=minute&&minute<fire.minute+e.minutes)return {clock:rule.id,stage,since:fire.minute,until:fire.minute+e.minutes,reason:e.reason??null};
 return null;
}
export const hazardRouteClosed=(engine,seed,routeId,minute)=>Boolean(hazardRouteClosure(engine,seed,routeId,minute));

// Region of a location: the nearest ancestor (or itself) among `ids`.
export function regionWithin(engine,location,ids){
 const seen=new Set();
 while(location&&!seen.has(location)){if(ids.includes(location))return location;seen.add(location);location=engine.byId.get(location)?.parent;}
 return null;
}
const active=(r,minute)=>r.since<=minute&&minute<r.until;
const ancestors=(engine,location)=>{const out=[],seen=new Set();while(location&&!seen.has(location)){out.push(location);seen.add(location);location=engine.byId.get(location)?.parent;}return out;};
// Product of the price swings in force for this item at this place. Each
// settlement keeps one record, `hazard-price:<settlement>`, with one shift per
// clock; a later stage of the same clock replaces the earlier shift.
export function hazardPriceFactor(engine,state,item,location,minute=state.minute){
 let factor=1;
 for(const r of recordsWhere(state.records,'category','war_disruption'))if(active(r,minute)&&r.locations.some(l=>ancestors(engine,location).includes(l)))factor*=r.factor;
 for(const place of ancestors(engine,location)){
  const r=state.records?.[`hazard-price:${place}`];if(r?.category!=='hazard_price')continue;
  for(const s of Object.values(r.shifts))if(active(s,minute)&&(!s.items||s.items.includes(item)))factor*=s.factor;
 }
 return factor;
}
// Field output multiplier for an unmanaged settlement after crop damage.
export function hazardYieldFactor(state,settlement,minute=state.minute){
 const r=state.records?.[`hazard-yield:${settlement}`];let factor=1;
 if(r?.category==='hazard_yield')for(const s of Object.values(r.shifts))if(active(s,minute))factor*=s.factor;
 return factor;
}
export function famineAt(state,settlement,minute=state.minute){
 const r=state.records?.[`hazard-famine:${settlement}`];
 return r?.category==='hazard_famine'&&active(r,minute)?r:null;
}

// Campaign closures are stateful and shared by travel, NPC schedules and trade.
export function warRouteClosed(state,route,minute){return recordsWhere(state?.records,'category','war_disruption').some(r=>active(r,minute)&&r.routes.includes(route));}
export function warClosedRoutes(state,minute){return new Set(recordsWhere(state?.records,'category','war_disruption').filter(r=>active(r,minute)).flatMap(r=>r.routes));}
