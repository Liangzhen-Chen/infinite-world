import {temples} from './faith-catalog.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {recordsWhere,recordsMemo,recordIndexActive} from './storage.mjs';
// Course agreements and completed study are facts. Seats, teachers and resident
// skill distributions are projections of the current campaign.
import {facilityView} from './facility-state.mjs';
import {npcSchedule,npcAgeAt} from './npc-state.mjs';
import {personConstraints} from './entity-view.mjs';
import {advanceLayerPlan} from './advance-layers.mjs';
import {cohortSeats,expandedEducation} from './education-cohorts.mjs';
import {employmentActive} from './employment-state.mjs';
import {contractTerms} from './contract-state.mjs';
const DAY=1440;
const scheduleRecords=Symbol('schedule records');
const scheduleReservations=Symbol('schedule reservations');
const scheduleIgnoredCategories=['physical_feature','education_study','education_pay','world_event','bank','debt','office_salary'];
const reservationInputs=s=>recordsMemo(s.obligations,scheduleReservations,()=>['promise','delivery',undefined].flatMap(kind=>recordsWhere(s.obligations,'kind',kind)).filter(r=>r.reservationVersion===1));
// Physical state, study/pay progress and event receipts are not inputs to
// course/routine derivation. Completed learning changes the actor's skills or
// recipes; changed employment still invalidates through its contract record.
export function sameScheduleInputs(a,b){
 if(Object.keys(a).length!==Object.keys(b).length||Object.keys(a).some(k=>!['minute','scheduler','records','obligations','npcObligationClock','npcCognition'].includes(k)&&a[k]!==b[k]))return false;
 if(a.obligations!==b.obligations){
  const x=reservationInputs(a),y=reservationInputs(b);
  if(x.length!==y.length||x.some((r,i)=>r!==y[i]))return false;
  // A teaching employment may end through its unified service obligation.
  // Financial accrual elsewhere does not change anybody's routine or class.
  for(const job of recordsWhere(b.records,'kind','workshop'))if(job.serviceObligation&&a.obligations?.[job.serviceObligation]!==b.obligations?.[job.serviceObligation])return false;
 }
 if(a.records===b.records)return true;
 const rows=s=>recordsMemo(s.records,scheduleRecords,()=>Object.entries(s.records??{}).filter(([,r])=>!scheduleIgnoredCategories.includes(r.category)),scheduleIgnoredCategories);
 const x=rows(a),y=rows(b);
 return x===y||x.length===y.length&&x.every(([id,row],i)=>id===y[i][0]&&row===y[i][1]);
}
// Catalog identity follows immutable world/created partitions, never the clock,
// skills or legal state. Those remain live inputs to every course derivation.
const emptyCreated=Object.freeze({});
const advanceCourses=new WeakMap();
const courseUnchangedNpcFields=new Set(['activity','coins','scheduleTravel','cognitionTravel','cognition','memoryStream','developments','growth']);
function sameCourseInputs(e,a,b){
 if(!sameScheduleInputs({...a,npcs:b.npcs},b))return false;
 const ids=Object.keys(a.npcs??{});if(ids.length!==Object.keys(b.npcs??{}).length)return false;
 for(const id of ids){
  const x=a.npcs[id],y=b.npcs[id];if(x===y)continue;if(!y)return false;
  const keys=Object.keys(x);if(keys.length!==Object.keys(y).length){
   // Optional movement/cognition fields may appear or disappear as a trip ends.
   if(keys.filter(k=>!courseUnchangedNpcFields.has(k)).length!==Object.keys(y).filter(k=>!courseUnchangedNpcFields.has(k)).length)return false;
  }
  const home=x.residence?.home??e.byId.get(id)?.home?.location;
  for(const k of new Set([...keys,...Object.keys(y)]))if(!courseUnchangedNpcFields.has(k)&&!(k==='location'&&home)&&x[k]!==y[k])return false;
 }
 return true;
}
function courseCacheUntil(s){
 let until=(Math.floor(s.minute/DAY)+1)*DAY;
 for(const r of Object.values(s.records??{})){
  if(scheduleIgnoredCategories.includes(r.category))continue;
  for(const k of ['minute','createdAt','since','starts','until','expires','deadline'])if(Number.isSafeInteger(r[k])&&r[k]>s.minute)until=Math.min(until,r[k]);
  for(const a of r.amendments??[])if(a.minute>s.minute)until=Math.min(until,a.minute);
 }
 return until;
}
const householdCatalog=Symbol('education households');
const catalogs=new WeakMap();
function educationCatalog(e,s){
 let worldCache=catalogs.get(e.world);
 if(!worldCache||worldCache.locations!==e.world.locations||worldCache.npcs!==e.world.npcs||worldCache.residents!==e.world.residents){
  worldCache={locations:e.world.locations,npcs:e.world.npcs,residents:e.world.residents,created:new WeakMap()};catalogs.set(e.world,worldCache);
 }
 const created=s.created??emptyCreated,hit=worldCache.created.get(created);if(hit)return hit;
 const catalog=(()=>{
  const entities=Object.values(s.created??{});
  return {people:[...new Map([...e.world.residents??[],...e.world.npcs,...entities].filter(p=>p.id?.startsWith('npc_')).map(p=>[p.id,p])).values()],
   sites:[...e.world.locations,...entities.filter(x=>x.id?.startsWith('bld_'))].filter(p=>/学堂|学馆|私塾|书院|义学/.test(`${p.name??''} ${p.purpose??''}`)||p.facilityType==='school')};
 })();worldCache.created.set(created,catalog);return catalog;
}
export const educationFresh=e=>!e.replaying||e.replayResult?.educationVersion===1;
export const educationRows=s=>recordsWhere(s.records,'category','education_course').filter(r=>r.status==='开课');
export const knowledgeProficiency=(e,s,id,skill)=>{
 const b=s.created?.[id]??e.byId.get(id),v=id==='player'?s.skills?.[skill]:s.npcs?.[id]?.skills?.[skill]??b?.proficiencies?.[skill]??b?.skills?.[skill];
 return typeof v==='number'?v:v?.proficiency??0;
};
export function knowsKnowledge(e,s,id,entity){
 const b=s.created?.[entity]??e.byId.get(entity);if(!b)return false;
 if(entity.startsWith('skill_'))return knowledgeProficiency(e,s,id,entity)>0;
 const partition=entity.startsWith('recipe_')?'recipes':'spells';
 return Boolean(id==='player'?s[partition]?.[entity]:s.npcs?.[id]?.[partition]?.[entity]||b.teachers?.includes(id));
}
export function educationSites(e,s){
 const out=educationCatalog(e,s).sites.map(p=>({id:`school:${p.id}`,name:p.name,kind:/书院/.test(p.name)?'书院':/私塾/.test(p.name)?'私塾':'学馆',seat:p.id,leader:null}));
 for(const t of temples(e))if(t.seat&&!out.some(o=>o.seat===t.seat))out.push({id:t.id,name:t.name,kind:'寺观义学',seat:t.seat,leader:t.teacher});
 for(const r of educationRows(s))if(!out.some(o=>o.id===r.org))out.push({id:r.org,name:r.name,kind:r.schoolKind,seat:r.location,leader:r.teacher});
 return out.map(o=>({...o,capacity:facilityView(e,s,o.seat)?.capacity??0}));
}
function settlement(e,s,id){
 const n=s.npcs?.[id],b=s.created?.[id]??e.byId.get(id);
 if(n?.residence?.settlement)return n.residence.settlement;
 const hid=n?.residence?.household??n?.householdId??b?.householdId;
 const h=recordIndexActive()?recordsMemo(e.world.households,householdCatalog,()=>new Map((e.world.households??[]).map(h=>[h.id,h]))).get(hid):e.world.households?.find(h=>h.id===hid);
 return h?.settlement??b?.settlement??b?.scope;
}
// A read-only pass over one fixed state (engine.scene) may set e.educationCourseMemo
// (WeakMap state→courses): the same state object derives the same courses.
export function educationCourses(e,s){
 if(e.educationCourseContext)return e.educationCourseContext;
 if(recordIndexActive()){
  const previous=advanceCourses.get(e);
  if(previous&&s.minute>=previous.state.minute&&s.minute<previous.until&&sameCourseInputs(e,previous.state,s)){previous.state=s;return previous.courses;}
  const courses=deriveEducationCourses(e,s);advanceCourses.set(e,{state:s,courses,until:courseCacheUntil(s)});return courses;
 }
 const memo=e.educationCourseMemo;if(!memo||!s||typeof s!=='object')return deriveEducationCourses(e,s);
 let hit=memo.get(s);if(!hit){hit=deriveEducationCourses(e,s);memo.set(s,hit);}
 return hit;
}
function deriveEducationCourses(e,s){
 if(!educationFresh(e))return [];
 const rows=educationRows(s),out=[...rows];
 // Derive classes from the teacher's current work, not just the authored
 // schedule. Hired teachers and changed livelihoods use the same entrance.
 const people=educationCatalog(e,s).people;
 const layers=Object.keys(s.population??{}).length?(e.advanceLayerContext??advanceLayerPlan(e,s)):null;
 const settlements=new Set((e.world.settlementProfiles??[]).map(p=>p.id));
 // Teachers, their routines and teaching contracts do not depend on the site:
 // one legal index (personConstraints) serves every routine read, and each
 // person's settlement, age and literacy are read once for the whole derivation.
 const constraints=personConstraints(e,s),calendar=e.calendar(s.minute);
 const teachers=Object.keys(s.npcs??{}).filter(id=>knowledgeProficiency(e,s,id,'skill_literacy')>100).sort();
 const routines=new Map(teachers.map(id=>[id,npcSchedule(e,s,id,undefined,constraints)]));
 const jobs=recordsWhere(s.records,'category','contract').map(r=>contractTerms(r,s.minute)).filter(r=>employmentActive(r,s)&&r.status!=='罢工'&&r.starts<=s.minute&&r.deadline>s.minute&&/授业|先生|教学/.test(r.task??''));
 const memo=(f)=>{const m=new Map();return id=>{if(!m.has(id))m.set(id,f(id));return m.get(id);};};
 const homeOf=memo(id=>settlement(e,s,id)),literacyOf=memo(id=>knowledgeProficiency(e,s,id,'skill_literacy'));
 // Each school used to rescan the entire expanded population for every
 // teacher and slot. Group the same ordered candidates once per derivation.
 const pupilsByTown=new Map();
 for(const p of people){
  const age=npcAgeAt(e,s,p.id);
  if((age??0)<(e.rules.education?.minimumAge??6)||(age??99)>(e.rules.education?.maximumAge??17)||isPhysicallyDead(e,s,p.id))continue;
  const town=homeOf(p.id);if(!pupilsByTown.has(town))pupilsByTown.set(town,[]);
  pupilsByTown.get(town).push(p);
 }
 for(const site of educationSites(e,s)){
  if(!site.capacity)continue;
  for(const teacher of teachers){
   const routine=routines.get(teacher),variant=calendar.market?'market':routine?.restDays?.includes(calendar.day)?'rest':'default';
   const seasonal=routine?.seasonal?.[String(calendar.season)],slots=seasonal?.[variant]??routine?.[variant]??seasonal?.default??routine?.default??[];
   const job=jobs.find(r=>r.worker===teacher&&r.location===site.seat);
   const teaching=slots.filter(w=>w.location===site.seat&&(w.services?.includes('teach')||job&&w.activity===job.task));
   for(const slot of teaching){
    const occupied=out.filter(c=>c.location===site.seat&&c.start<slot.end&&c.end>slot.start).reduce((n,c)=>n+c.students.length+(c.cohort?.roster.length??0),0),seats=Math.max(0,site.capacity-occupied);
    if(!seats)continue;
    const available=id=>!out.some(c=>[c.teacher,...c.students].includes(id)&&c.start<slot.end&&c.end>slot.start);
    if(!available(teacher))continue;
    let town=site.seat;const seen=new Set();while(town&&!settlements.has(town)&&!seen.has(town)){seen.add(town);const place=s.created?.[town]??e.byId.get(town);town=place?.parent??place?.scope;}
    town??=homeOf(teacher);
    const statistical=layers?.layers.get(layers.countyOf(town))==='statistics',ceiling=literacyOf(teacher)-e.rules.npcGrowth.teach.teacherMargin;
    const students=(pupilsByTown.get(town)??[]).filter(p=>p.id!==teacher&&
     !(statistical&&p.generated==='population'&&!s.npcs?.[p.id])&&literacyOf(p.id)<ceiling&&available(p.id))
     .map(p=>p.id).sort().slice(0,seats);
    const previous=s.records?.[`education_cohort:education:auto:${site.id}:${teacher}:${slot.start}:${Math.floor(s.minute/DAY)}`];
    const roster=statistical?(previous?.roster??cohortSeats(e,s,town,'skill_literacy',knowledgeProficiency(e,s,teacher,'skill_literacy'),seats-students.length,s.minute)):[];
    if(students.length||roster.length)out.push({id:`education:auto:${site.id}:${teacher}:${slot.start}`,org:site.id,teacher,entity:'skill_literacy',students,location:site.seat,start:slot.start,end:slot.end,since:0,until:Infinity,status:'开课',automatic:true,school:true,...(job?.laborMarket?{employment:job.id}:{}),...(roster.length?{cohort:{settlement:town,roster}}:{})});
   }
  }
 }
 // A carried copy can be studied without the player scheduling each page.
 for(const unit of Object.values(s.itemInstances??{}))if(unit.book?.teaches?.length&&unit.owner?.startsWith('npc_')&&unit.status==='持有'&&unit.durability!==0){
  const student=unit.owner;if(rows.some(c=>c.students.includes(student)))continue;
  const entity=unit.book.teaches.find(k=>k.startsWith('skill_')?knowledgeProficiency(e,s,student,k)<Math.min(unit.book.ceilings?.[k]??Infinity,(e.rules.books.grades.indexOf(unit.book.grade)+1)*300)-100:!knowsKnowledge(e,s,student,k));
  if(!entity||knowledgeProficiency(e,s,student,'skill_literacy')<(e.rules.books?.minimumLiteracy??100))continue;
  const n=s.npcs[student],home=n?.residence?.home??e.byId.get(student)?.home?.location??n?.location;
  out.push({id:`education:book:${unit.id}:${student}`,org:null,teacher:null,source:unit.id,book:true,entity,students:[student],location:home,start:1080,end:1200,since:unit.minute??0,until:Infinity,status:'开课',automatic:true});
 }
 // The apprenticeship relationship supplies the obligation; the master's
 // current residence supplies the destination after migration or study travel.
 for(const [student,n]of Object.entries(s.npcs??{})){
  if(out.some(c=>c.students.includes(student)))continue;
  const rel=Object.entries(n.relationships??{}).find(([,r])=>r.type==='师父'),base=e.byId.get(student);
  const teacher=rel?.[0]??base?.relationships?.find(r=>r.type==='师父')?.with,master=s.npcs?.[teacher];if(!master)continue;
  const entity=Object.keys(master.recipes??{}).sort().find(k=>!knowsKnowledge(e,s,student,k));if(!entity)continue;
  const home=master.residence?.home??e.byId.get(teacher)?.home?.location??master.location;
  if(settlement(e,s,student)!==settlement(e,s,teacher))continue;
  out.push({id:`education:apprentice:${teacher}:${student}:${entity}`,org:null,teacher,entity,students:[student],location:home,start:1080,end:1200,since:master.recipes[entity].learnedAt??0,until:Infinity,status:'开课',automatic:true,apprentice:true});
 }
 return out;
}
export function courseWindow(c,minute){
 const day=Math.floor(minute/DAY),start=day*DAY+c.start,end=day*DAY+c.end;
 return start>=c.since&&start<c.until&&!c.restDays?.includes(day%30+1)?{start,end}:null;
}
const coursesByPerson=new WeakMap();
export function personCourses(e,s,id){
 const courses=educationCourses(e,s);let people=coursesByPerson.get(courses);
 if(!people){
  people=new Map();for(const c of courses)for(const who of new Set([c.teacher,...c.students].filter(Boolean))){
   if(!people.has(who))people.set(who,[]);people.get(who).push(c);
  }coursesByPerson.set(courses,people);
 }
 return people.get(id)??[];
}
export function educationSlot(e,s,id,minute){
 for(const c of personCourses(e,s,id))if((!c.automatic||c.apprentice)&&c.teacher===id||c.students.includes(id)){
  const w=courseWindow(c,minute);if(w&&minute>=w.start&&minute<w.end)return {location:c.location,activity:c.teacher===id?'授课':'受教',services:[],until:w.end,education:c.id};
 }
 return null;
}
export function educationReservation(e,s,id,start,minutes,{automatic=false}={}){
 return (automatic?educationCourses(e,s):educationRows(s)).find(c=>[c.teacher,...c.students].includes(id)&&Array.from({length:Math.ceil(Math.max(1,minutes)/DAY)+1},(_,i)=>courseWindow(c,Math.floor(start/DAY)*DAY+i*DAY)).some(w=>w&&start<w.end&&start+Math.max(1,minutes)>w.start));
}
export function educationStatistics(e,s,location){
 const ids=[...new Set([...e.world.npcs.map(n=>n.id),...(e.world.residents??[]).map(n=>n.id),...Object.values(s.created??{}).filter(n=>n.id?.startsWith('npc_')).map(n=>n.id),...Object.keys(s.npcs??{})])];
 const residents=ids.filter(id=>!isPhysicallyDead(e,s,id)&&settlement(e,s,id)===location),distribution={},record=s.population?.[location],progress=record?expandedEducation(e,s,location):new Map();let literate=0;
 const proficiency=(id,skill)=>Math.max(knowledgeProficiency(e,s,id,skill),s.npcs?.[id]?0:progress.get(id)?.skills[skill]??0);
 for(const id of residents){if(proficiency(id,'skill_literacy')>=(e.rules.books?.minimumLiteracy??100))literate++;
  for(const skill of e.world.skills){const p=proficiency(id,skill.id);if(p>0){const bin=Math.floor(p/300),counts=distribution[skill.id]??{};counts[bin]=(counts[bin]??0)+1;distribution[skill.id]=counts;}}
 }
 let count=residents.length;
 if(record){
  const known=new Set(residents);
  for(const [id,p]of progress){if(known.has(id))continue;for(const [skill,value]of Object.entries(p.skills)){const bins=distribution[skill]??={};bins[Math.floor(value/300)]=(bins[Math.floor(value/300)]??0)+1;}if((p.skills.skill_literacy??0)>=(e.rules.books?.minimumLiteracy??100))literate++;}
  // Seeded people exist even while compacted; profiles and individual states
  // above replace their projections, without adding another population.
  count=Math.max(count,record.basis.pendingPopulation+(residents.filter(id=>!id.startsWith('npc_pop_')).length));
 }
 return {residents:count,literate,literacyRate:count?literate/count:0,distribution};
}
