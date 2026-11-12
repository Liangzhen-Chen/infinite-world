import {preconditionFailure} from './precondition.mjs';
import {recordsWhere,recordsMemo,stateMemo} from './storage.mjs';
import {contractTerms} from './contract-state.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {obligationView} from './obligation-state.mjs';
// Contracts are facts. Current employment and occupied time are read-only views.
export const employmentActive=(r,state=null)=>r?.kind==='workshop'&&r.endedAt===undefined&&r.resolvedAt===undefined&&(!r.serviceObligation||!state||obligationView(state,r.serviceObligation)?.closed===false)&&(!!r.clauses||['有效','要求加薪','罢工'].includes(r.status));
export const employmentInputs=[{path:['records'],kinds:['workshop']},['minute']];
export function currentEmployment(state,id,minute=state?.minute??0){
    // The state scope survives unrelated cursor writes. Keep the records-only
    // view too: several projected states at one minute share the same records.
    const workers=stateMemo(state,currentEmployment,[minute],()=>recordsMemo(state?.records,`employment terms:${minute}`,()=>{
        const workers=new Map();
        for(const row of recordsWhere(state?.records,'kind','workshop')){
            const r=contractTerms(row,minute),rows=workers.get(r.worker)??[];
            rows.push(r);workers.set(r.worker,rows);
        }
        return workers;
    }),employmentInputs);
    return (workers.get(id)??[]).find(r=>employmentActive(r,state)&&r.createdAt<=minute&&minute<r.deadline)??null;
}
export function employmentReservation(state,id,start,minutes=0,restDays=[]){
    const end=start+Math.max(1,minutes);
    const crew=projectAssignment(state,id);
    if(crew&&end>crew.starts&&Array.from({length:Math.ceil((end-start)/1440)+1},(_,i)=>Math.floor(start/1440)+i).some(day=>{
        if(restDays.includes((day%30+30)%30+1))return false;
        return [[480,720],[780,1020]].some(([lo,hi])=>start<day*1440+hi&&end>day*1440+lo&&day*1440+hi>crew.starts);
    }))return crew;
    return recordsWhere(state.records,'kind','workshop').map(r=>contractTerms(r,start)).find(r=>employmentActive(r,state)&&!r.education&&r.worker===id&&r.status!=='罢工'&&end>r.starts&&start<r.deadline&&
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
// Minutes a person really spends in each work window between start and end: the two daily work windows,
// minus anything that already occupies them (running autonomous tasks and booked obligations).
function attendedMinutes(state,id,start,end){
    const blocked=Object.values(state.npcAutonomy?.tasks??{}).filter(t=>t.status==='进行中'&&[t.npc,t.action?.seller].includes(id)).map(t=>[t.start,t.finish]);
    for(const o of Object.values(state.obligations??{}))if(o.reservationVersion===1&&['待履行','进行中'].includes(o.status)&&(o.deliveryVersion===1?o.promisor===id:[o.promisor,o.promisee].includes(id))&&!(o.type==='等候'&&o.promisee===id&&o.attendance?.[id]>0))blocked.push([o.departures?.[id]??o.start,o.deadline]);
    const out={};
    for(let day=Math.floor(start/1440);day<=Math.floor(end/1440);day++)for(const [lo,hi]of [[480,720],[780,1020]]){
        let spans=[[Math.max(start,day*1440+lo),Math.min(end,day*1440+hi)]];
        for(const [from,to]of blocked)spans=spans.flatMap(([a,b])=>from>=b||to<=a?[[a,b]]:[[a,Math.min(b,from)],[Math.max(a,to),b]]).filter(([a,b])=>b>a);
        const minutes=spans.reduce((n,[a,b])=>n+Math.max(0,b-a),0);
        if(minutes)out[day]=(out[day]??0)+minutes;
    }
    return out;
}
const unavailable=(d,id,worker)=>!worker||worker.caring||worker.levy||worker.cognitionTravel||isPhysicallyDead(null,d,id)||['濒死','昏迷','患病'].includes(worker.status)||d.get('state','player','companions')?.includes(id);
export function recordEmploymentAttendance(d,id,start,end,location){
    const job=currentEmployment(d.get('state'),id,start);if(!job||job.education||job.status==='罢工'||location!==job.location)return;
    if(unavailable(d,id,d.get('state','npcs',id)))return;
    start=Math.max(start,job.starts,job.attendanceThrough??0);end=Math.min(end,job.deadline);
    if(end<=start)return;
    const attendance={...job.attendance};let added=0;
    for(const [day,minutes]of Object.entries(attendedMinutes(d.get('state'),id,start,end))){attendance[day]=Math.min(480,(attendance[day]??0)+minutes);added+=minutes;}
    if(added)d.set(['state','records',job.id],{...job,attendance,attendanceThrough:end});
}

// F083: a public works crew is on the schedule like any hired hand. The assignment is a fact (state.records);
// the person is at the site only when their real day takes them there, and only those minutes count.
export const PROJECT_ACTIVITY='公共工程施工';
export const projectAssignmentId=(project,worker)=>`project_assignment:${project}:${worker}`;
export const projectAssignment=(state,id)=>{
    // Most worlds, most of the time, have no works crew at all: skip the record scan then.
    if(!Object.values(state?.projects??{}).some(p=>p.public&&p.status==='施工中'))return null;
    return recordsWhere(state?.records,'category','project_assignment').find(r=>r.worker===id&&r.status==='有效')??null;
};
export function recordProjectAttendance(d,id,start,end,location){
    const state=d.get('state'),a=projectAssignment(state,id);if(!a||location!==a.location)return;
    const p=state.projects?.[a.project];if(!p?.public||p.status!=='施工中'||p.building&&state.buildings?.[p.building]?.burning||unavailable(d,id,state.npcs?.[id]))return;
    const row=p.public.attendance?.[id]??{days:{},through:0};
    start=Math.max(start,a.starts,row.through);
    if(end<=start)return;
    const days={...row.days};let added=0;
    for(const [day,minutes]of Object.entries(attendedMinutes(state,id,start,end))){days[day]=Math.min(480,(days[day]??0)+minutes);added+=minutes;}
    if(added)d.set(['state','projects',p.id,'public','attendance',id],{days,through:end});
}

export function assertVocationAction(engine,state,tool,args){
 if(tool==='law'&&args.operation==='hire_advocate'&&args.authority!==undefined){
  const actor=engine.resolve(args.authority,'npc');
  if(state.npcs?.[actor]?.vocation?.conflictOfInterest===true)throw preconditionFailure('代理人与本案存在利害冲突');
 }
}
