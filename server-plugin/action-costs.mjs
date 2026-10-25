// Legacy executors retain their clock. Body costs cover exactly that elapsed
// interval, using the same lazy facts as primitive actions (no second advance).
import {beginBodyActivity,endBodyActivity,readBodyNeed} from './primitives-body.mjs';
import {fixedUnits,fixedMultiply,fixedNumber,checkedFixed} from './rx.mjs';

// Work has already advanced the clock. Reuse practice's carry, repeated-target
// decay, daily cap and breakthrough ceiling without charging a second interval.
export function learnFromWork(d,engine,skill,minutes,target,eventId){
 const old=d.get('state','skills',skill);
 if(!old)return null;
 const rows=engine.world.primitiveTables?.learning?.rows??[],stage=Math.floor(old.proficiency/300);
 const rate=rows.find(r=>r.facet==='perHour'&&r.selector==='skill:*')?.perHour?.work;
 const factor=rows.find(r=>r.facet==='tierFactor')?.tierFactor?.[stage];
 if(!Number.isFinite(rate)||!Number.isFinite(factor))throw Error('工作学习数值未登记');
 const gain=fixedNumber(checkedFixed(fixedMultiply(fixedUnits(rate),fixedUnits(factor))*BigInt(minutes)/60n));
 return {...engine.practice(d,{skill,target},eventId,gain),learningSource:'practice',context:'work',minutes};
}

export function actionCostRule(engine,key){
 const row=engine.world.primitiveTables?.['action-costs']?.rows?.find(r=>r.selector===key);
 if(!row)throw Error(`动作成本未登记：${key}`);
 return row;
}
export function assertActionTime(d,engine,minutes,actors=['player']){
 engine.assertNpcObligationAction(d,actors,{minutes,location:d.get('state','location')});
 engine.assertNpcAutonomyAction(d.get('state'),actors,{minutes});
}
export function advanceActionParticipants(d,engine,minutes,eventId,participants){
 const previous=engine.npcScheduleReservations;
 engine.npcScheduleReservations=new Set([...previous??[],...participants]);
 try{engine.advance(d,minutes,eventId);}
 finally{engine.npcScheduleReservations=previous;}
}
export function beginActionActivity(d,engine,activity,actor='player'){
 const start=d.get('state','minute');
 // Archived pre-A3 worlds have no body table. Their original replay remains
 // unchanged; newly archived A3 worlds always provide the table.
 const legacy=engine.replaying&&!engine.replayResult?.cost;
 const enabled=Boolean(engine.world.primitiveTables?.body)&&!legacy;
 if(enabled)beginBodyActivity(d,engine,actor,activity);
 return {start,actor,activity,enabled,legacy};
}
export function finishActionActivity(d,engine,span){
 if(span.legacy)return null;
 if(span.enabled)endBodyActivity(d,engine,span.actor);
 return {time:d.get('state','minute')-span.start,body:span.enabled?Object.fromEntries(
  ['stamina','satiety','hydration','fatigue'].map(need=>[need,{value:readBodyNeed(engine,d.document,span.actor,need),asOf:d.get('state','minute')}])):{}};
}
