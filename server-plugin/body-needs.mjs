// Native sleep boundary for A's time executor. Call begin after validating the
// actual duration, finish after the existing advance/HP/MP recovery. Neither
// function advances time or touches money, HP or NPC schedules.
import {beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {bodyRule,readBodyState,writeBodyNeed} from './primitives-body.mjs';
import {fixedUnits,fixedNumber,fixedMultiply} from './rx.mjs';
import {aliveHoldings} from './holdings.mjs';

export function beginSleep(d,engine,actor='player'){
 const span=beginActionActivity(d,engine,'rest',actor),s=d.get('state');
 const location=actor==='player'?s.location:s.npcs?.[actor]?.location,place=engine.byId.get(location);
 const lodgingKind=({客房:'room',空屋:'room',通铺:'hostel',room:'room',hostel:'hostel'})[place?.lodging?.kind];
 // A room name alone is no permission to sleep in it. Keep the real rental
 // intervals, including legitimate credit bookings, rather than copying a
 // derived "has lodging" flag into the body.
 const bookings=lodgingKind?Object.values(s.records??{}).filter(r=>r.category==='contract'&&r.status==='有效'&&r.room===location&&r.parties?.includes(actor)&&Number.isSafeInteger(r.starts)&&Number.isSafeInteger(r.expires)).map(r=>({start:r.starts,end:r.expires})):[];
 // Native lodges holdings may have no legacy contract projection (06 §6.3).
 // Only their actual bounded term covers sleep; presence is not a booking.
 if(lodgingKind)for(const row of aliveHoldings(d,{kind:'lodges',holder:actor,subject:location})){
  const {from,until}=row.terms??{};
  if(Number.isSafeInteger(from)&&Number.isSafeInteger(until)&&until>from)bookings.push({start:from,end:until});
 }
 return {...span,location,lodgingKind,bookings};
}
export function finishSleep(d,engine,span){
 if(!span.enabled)return null;
 const end=d.get('state','minute'),s=d.get('state'),location=span.actor==='player'?s.location:s.npcs?.[span.actor]?.location;
 if(location!==span.location)throw Error('睡眠结束前已离开原住处，须按实际中断时段结算');
 const intervals=span.bookings.map(r=>({start:Math.max(span.start,r.start),end:Math.min(end,r.end)})).filter(r=>r.end>r.start).sort((a,b)=>a.start-b.start);
 let covered=0,cursor=span.start;
 for(const row of intervals){covered+=Math.max(0,row.end-Math.max(cursor,row.start));cursor=Math.max(cursor,row.end);}
 const minutes=end-span.start,stamina=bodyRule(engine,'stamina'),fatigue=bodyRule(engine,'fatigue');
 const hourly=factor=>fixedMultiply(fixedUnits(stamina.sleepRecoverPerHour),fixedUnits(factor));
 const recovered=hourly(stamina.lodgingFactor[span.lodgingKind]??stamina.lodgingFactor.camp)*BigInt(covered)+hourly(stamina.lodgingFactor.camp)*BigInt(minutes-covered);
 const recovery={};
 for(const [need,amount] of [['stamina',recovered],['fatigue',fixedUnits(fatigue.sleepRecoverPerHour)*BigInt(minutes)]]){
  const before=readBodyState(engine,d.document,span.actor,need),max=fixedUnits(bodyRule(engine,need).max)*60n;
  let numerator=fixedUnits(before.value)*60n+BigInt(before.remainder)+amount;
  numerator=numerator<0n?0n:numerator>max?max:numerator;
  const value=writeBodyNeed(d,engine,span.actor,need,fixedNumber(numerator/60n),{remainder:Number(numerator%60n)});
  recovery[need]={value,delta:fixedNumber(fixedUnits(value)-fixedUnits(before.value)),asOf:end};
 }
 return {...finishActionActivity(d,engine,span),sleep:{minutes,lodging:span.lodgingKind??'camp',coveredMinutes:covered,recovery}};
}
