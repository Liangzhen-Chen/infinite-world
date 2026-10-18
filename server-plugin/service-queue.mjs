// Capacity belongs to the actual clinic/course; ordering only chooses who
// gets its next available slot. Arrival/id break equal-urgency ties stably.
export const serviceClaimsFresh=e=>!e.replaying||e.replayResult?.serviceClaimsVersion===1;
export function serviceUrgency(conditions){
    return conditions.reduce((n,c)=>Math.max(n,c.record?.bleedingMlPerMinute>0?3:c.severity==='重'||c.record?.infected?2:1),0);
}
export function orderServices(rows){
    return [...rows].sort((a,b)=>(b.urgency??0)-(a.urgency??0)||(a.createdAt??0)-(b.createdAt??0)||a.id.localeCompare(b.id));
}
