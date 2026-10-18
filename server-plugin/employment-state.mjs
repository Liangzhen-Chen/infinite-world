import {recordsWhere} from './storage.mjs';
import {contractTerms} from './contract-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
// Contracts are facts. Current employment and occupied time are read-only views.
export const employmentActive=r=>r?.kind==='workshop'&&r.endedAt===undefined&&r.resolvedAt===undefined&&(!!r.clauses||['有效','要求加薪','罢工'].includes(r.status));
export function currentEmployment(state,id,minute=state?.minute??0){
    return recordsWhere(state?.records,'kind','workshop').map(r=>contractTerms(r,minute)).find(r=>employmentActive(r)&&r.worker===id&&r.createdAt<=minute&&minute<r.deadline)??null;
}
export function employmentReservation(state,id,start,minutes=0,restDays=[]){
    const end=start+Math.max(1,minutes);
    return recordsWhere(state.records,'kind','workshop').find(r=>employmentActive(r)&&!r.education&&r.worker===id&&r.status!=='罢工'&&end>r.starts&&start<r.deadline&&
        Array.from({length:Math.ceil((end-start)/1440)+1},(_,i)=>Math.floor(start/1440)+i).some(day=>{
            if(restDays.includes((day%30+30)%30+1))return false;
            return [[480,720],[780,1020]].some(([lo,hi])=>{
                const begin=day*1440+lo,finish=day*1440+hi;
                return start<finish&&end>begin&&finish>r.starts&&begin<r.deadline;
            });
        }))??null;
}
// Daily production consumes already measured hours, including a short shift.
export function agriculturalEmployment(state,settlement,day){
    let hired=0,unavailable=0;
    for(const r of recordsWhere(state.records,'kind','workshop'))if(r.laborMarket===1){
        const shift=r.shifts?.find(s=>!s.aggregate&&Math.floor(s.start/1440)===day);
        if(r.farm===settlement)hired+=(r.attendance?.[String(day)]??shift?.minutes??0)/480;
        else if(r.settlement===settlement&&shift)unavailable+=shift.minutes/480;
    }
    return {hired,unavailable};
}
export function recordEmploymentAttendance(d,id,start,end,location){
    const job=currentEmployment(d.get('state'),id,start);if(!job?.laborMarket||job.status==='罢工'||location!==job.location)return;
    const worker=d.get('state','npcs',id);if(worker?.caring||worker?.levy||worker?.cognitionTravel||isPhysicallyDead(null,d,id)||['濒死','昏迷','患病'].includes(worker?.status)||d.get('state','player','companions')?.includes(id))return;
    start=Math.max(start,job.starts,job.attendanceThrough??0);end=Math.min(end,job.deadline);
    if(end<=start)return;
    const attendance={...job.attendance};let added=0;
    const state=d.get('state'),blocked=Object.values(state.npcAutonomy?.tasks??{}).filter(t=>t.status==='进行中'&&[t.npc,t.action?.seller].includes(id)).map(t=>[t.start,t.finish]);
    for(const o of Object.values(state.obligations??{}))if(o.reservationVersion===1&&['待履行','进行中'].includes(o.status)&&(o.deliveryVersion===1?o.promisor===id:[o.promisor,o.promisee].includes(id))&&!(o.type==='等候'&&o.promisee===id&&o.attendance?.[id]>0))blocked.push([o.departures?.[id]??o.start,o.deadline]);
    for(let day=Math.floor(start/1440);day<=Math.floor(end/1440);day++)for(const [lo,hi]of [[480,720],[780,1020]]){
        let spans=[[Math.max(start,day*1440+lo),Math.min(end,day*1440+hi)]];
        for(const [from,to]of blocked)spans=spans.flatMap(([a,b])=>from>=b||to<=a?[[a,b]]:[[a,Math.min(b,from)],[Math.max(a,to),b]]).filter(([a,b])=>b>a);
        const minutes=spans.reduce((n,[a,b])=>n+Math.max(0,b-a),0);
        if(minutes){attendance[day]=Math.min(480,(attendance[day]??0)+minutes);added+=minutes;}
    }
    if(added)d.set(['state','records',job.id],{...job,attendance,attendanceThrough:end});
}
