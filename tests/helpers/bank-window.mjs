import {scheduleAt} from '../../server-plugin/npc-schedule.mjs';
// Read actual arrival as well as the schedule. Jumping from a departure to
// the end of its slot can miss every office visit indefinitely.
export function nextBankWindow(engine,document,keeper,venue){
 const {state}=document,now=state.minute,n=state.npcs[keeper];
 if(!n||['患病','昏迷','濒死','死亡'].includes(n.status))return Infinity;
 const asleep=text=>/睡眠|睡觉|熟睡/.test(text??'');
 for(let cursor=now;cursor<now+31*1440;){
  const slot=scheduleAt(engine,keeper,cursor,state);if(!slot)break;
  if(slot.location===venue&&!asleep(slot.activity)){
   const trip=n.scheduleTravel;
   if(cursor===now&&trip?.to===venue&&trip.arrive>now&&trip.arrive+5<=slot.until)return trip.arrive;
   const present=cursor>now||n.location===venue&&!n.scheduleTravel&&!n.cognitionTravel&&!asleep(n.activity);
   if(present&&slot.until-cursor>=5)return cursor;
  }
  if(slot.until<=cursor)break;cursor=slot.until;
 }
 return Infinity;
}
