import {factionClockRules} from '../../server-plugin/faction-clock.mjs';
const DAY=1440;
// Fixtures that jump state.minute instead of simulating the gap must also move faction
// clocks (T159 added daily clocks) to their next boundary, as if no clock day elapsed.
export function skipTo(engine,doc,minute){
 doc.state.minute=minute;
 for(const rule of factionClockRules(engine)){
  const key=Object.keys(doc.state.records??{}).find(k=>doc.state.records[k]?.category==='faction_clock'&&doc.state.records[k].id===rule.id);
  if(!key)continue;const row=doc.state.records[key];
  if(row.nextAt<minute)doc.state.records[key]={...row,nextAt:Math.ceil(minute/DAY/rule.intervalDays)*rule.intervalDays*DAY};
 }
 return doc;
}
