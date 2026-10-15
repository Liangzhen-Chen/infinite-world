// Statistical teaching stores bounded seat/lesson facts against the captured
// population seed. It never stores a second settlement literacy score.
const DAY=1440;
export function cohortRoster(e,record){
 return e.populationPlan(record.template,record.basis).households.flatMap(h=>h.members.map(m=>({...m,district:h.district}))).sort((a,b)=>a.id.localeCompare(b.id));
}
export function cohortLearning(e,s,settlement){
 const out=new Map(),rows=Object.values(s.records??{}).filter(r=>r.category==='education_cohort'&&r.settlement===settlement).sort((a,b)=>a.start-b.start||a.course.localeCompare(b.course));
 for(const r of rows)for(const index of r.roster){
  let p=out.get(index);if(!p){p={skills:{},growth:{},sessions:{},minutes:{},today:{}};out.set(index,p);}
  const pending=(p.minutes[r.course]??0)+r.minutes,required=e.rules.npcGrowth.teach.minutes,day=Math.floor(r.start/DAY);
  p.minutes[r.course]=Math.min(required,pending);
  if(pending<required||(p.today[day]??0)>=e.rules.npcGrowth.teach.dailySessions)continue;
  const value=p.skills[r.skill]??0,gained=p.growth[r.skill]??0;
  const gain=Math.max(0,Math.min(e.rules.npcGrowth.teach.gain,r.ceiling-e.rules.npcGrowth.teach.teacherMargin-value,e.rules.npcGrowth.maximumGain-gained,(e.rules.npcGrowth.uncertifiedMaximumProficiency??e.rules.npcGrowth.maximumProficiency)-value));
  if(!gain)continue;
  p.skills[r.skill]=value+gain;p.growth[r.skill]=gained+gain;p.sessions[r.skill]=(p.sessions[r.skill]??0)+1;p.minutes[r.course]=Math.min(required,pending-required);p.today[day]=(p.today[day]??0)+1;
 }
 return out;
}
export function cohortSeats(e,s,settlement,skill,ceiling,capacity,minute){
 const record=s.population?.[settlement];if(!record||capacity<1)return [];
 const progress=cohortLearning(e,s,settlement),minimum=e.rules.education?.minimumAge??6,maximum=e.rules.education?.maximumAge??17;
 return cohortRoster(e,record).map((p,index)=>({...p,index})).filter(p=>{
  const age=p.age+Math.floor(minute/(360*DAY));
  return age>=minimum&&age<=maximum&&!s.npcs?.[p.id]&&s.created?.[p.id]?.profileStatus!=='full'&&
   (progress.get(p.index)?.skills[skill]??0)<Math.min(ceiling-e.rules.npcGrowth.teach.teacherMargin,e.rules.npcGrowth.uncertifiedMaximumProficiency??e.rules.npcGrowth.maximumProficiency);
 }).slice(0,capacity).map(p=>p.index);
}
export function expandedEducation(e,s,settlement){
 const record=s.population?.[settlement];if(!record)return new Map();
 const roster=cohortRoster(e,record),out=new Map();
 for(const [index,p]of cohortLearning(e,s,settlement))if(roster[index])out.set(roster[index].id,p);
 return out;
}
