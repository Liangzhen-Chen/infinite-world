import {preconditionFailure} from './precondition.mjs';
// Native sleep boundary: body needs settle after the time executor.
import {beginActionActivity,finishActionActivity} from './action-costs.mjs';
import {bodyRule,readBodyState,writeBodyNeed} from './primitives-body.mjs';
import {fixedUnits,fixedNumber,fixedMultiply} from './rx.mjs';
import {aliveHoldings} from './holdings.mjs';
import {derived} from './derived.mjs';
import {pow} from './det-math.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';

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
 if(location!==span.location)throw preconditionFailure('睡眠结束前已离开原住处，须按实际中断时段结算');
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

// The time executor owns the single HP write. Damage during advance is included.
export function restHealth(d,engine,minutes){
 const p=d.get('state','player'),wounds=p.medical?.wounds??[];
 if(!wounds.length)return Math.min(p.maxHp,p.hp+Math.floor(minutes/30));
 const table=engine.world.primitiveTables.health;
 const days=Math.max(...wounds.map(w=>{
  const key=w.fracture||w.kind==='fracture'?'wound:fracture':w.infected||w.depthMm>3?'wound:severe':'wound:light';
  return table.rows.find(r=>r.key===key).healDays*(w.treatments?.some(t=>t.correct)?table.params.find(r=>r.id==='medicine.healMul').value:1);
 }));
 const rate=derived(engine,d.document,'health:recoveryRate','player',{base:1/days});
 const signature=JSON.stringify([rate,wounds.map(w=>[w.id,w.depthMm,w.infected,w.fracture,w.kind,w.treatments])]);
 let fact=structuredClone(p.medical.recovery??{});
 if(fact.hp!==p.hp||fact.maxHp!==p.maxHp||fact.wounds!==signature)fact={hp:p.hp,maxHp:p.maxHp,missing:p.maxHp-p.hp,wounds:signature,restMinutes:0,gained:0};
 fact.restMinutes+=minutes;
 // Anchor the full segment so splitting/restoring does not discard fractions.
 const gained=Math.floor(fact.missing-fact.missing*pow(1-rate,fact.restMinutes/1440));
 fact.hp=p.hp+Math.min(p.maxHp-p.hp,gained-fact.gained);fact.gained=gained;
 d.set(['state','player','medical','recovery'],fact);
 return fact.hp;
}

registerAdvanceHook('restHealth',restHealth);
