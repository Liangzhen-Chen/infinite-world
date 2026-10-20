// Legacy executors retain their clock. Body costs cover exactly that elapsed
// interval, using the same lazy facts as primitive actions (no second advance).
import {beginBodyActivity,endBodyActivity,readBodyNeed} from './primitives-body.mjs';

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
