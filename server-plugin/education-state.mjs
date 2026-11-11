import {temples} from './faith-catalog.mjs';
import {isPhysicallyDead} from './lifecycle-state.mjs';
import {recordsWhere,recordsMemo,stateMemo,recordIndexActive,canonicalEqual,recordIndexCheck,recordReadEpoch} from './storage.mjs';
// Course agreements and completed study are facts. Seats, teachers and resident
// skill distributions are projections of the current campaign.
import {facilityView} from './facility-state.mjs';
import {fixtureStations,stationLicence} from './workstation-services.mjs';
import {npcSchedule,npcAgeAt,serviceAppointmentSources} from './npc-state.mjs';
import {personConstraints} from './entity-view.mjs';
import {advanceLayerPlan} from './advance-layers.mjs';
import {cohortSeats,expandedEducation} from './education-cohorts.mjs';
import {employmentActive} from './employment-state.mjs';
import {contractTerms} from './contract-state.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {practicalKnowledgeRegistry} from './domain-rules.mjs';
declareHoldingWriter('education-initial');
declareHoldingWriter('education');
const personPath=id=>id==='player'?['state','player']:['state','npcs',id];
function initialAuthority(d,id,context){
 if(context?.origin!=='initial'||!context.eventId||!d.get(...personPath(id)))throw Error('Initial person authority required');
}
export function initializePracticalKnowledge(d,e,id,knowledge,context){
 initialAuthority(d,id,context);
 if(!Array.isArray(knowledge)||new Set(knowledge).size!==knowledge.length||knowledge.some(k=>!Object.hasOwn(practicalKnowledgeRegistry(e),k)))throw Error('Unregistered practical knowledge');
 holdingSet(d,e,[...personPath(id),'practicalKnowledge'],[...knowledge],'education-initial',context.eventId);
}
export function knowsPracticalKnowledge(e,s,id,knowledge){
 return Object.hasOwn(practicalKnowledgeRegistry(e),knowledge)&&Boolean((id==='player'?s.player:s.npcs?.[id])?.practicalKnowledge?.includes(knowledge));
}
// A person visibly practising or teaching a subject without a timed
// demonstration record: the native practising field is the evidence.
export function practisingOpenly(e,s,id,subject){
 const n=id==='player'?s.player:s.npcs?.[id];
 return Boolean(n)&&(n.practicing??n.teaching)===subject&&n.demonstrating!==false&&!recordsWhere(s.records,'category','education_demonstration').some(r=>r.actor===id);
}
export function demonstrationAt(e,s,id,subject,until=s.minute){
 const n=id==='player'?s.player:s.npcs?.[id],location=id==='player'?s.location:n?.location;
 if(n?.demonstrating===false)return null;
 return recordsWhere(s.records,'category','education_demonstration').find(r=>r.actor===id&&(!subject||r.subject===subject)&&r.fromMinute<=s.minute&&r.toMinute>=until&&s.minute<r.toMinute&&r.workstation===location&&facilityView(e,s,r.workstation)?.factor!==0)??null;
}
export function initializeDemonstration(d,e,row,context){
 initialAuthority(d,row.actor,context);
 const s=d.get('state'),n=s.npcs?.[row.actor],subject=e.byId.get(row.subject),station=e.byId.get(row.workstation)??s.created?.[row.workstation];
 if(Object.keys(row).some(k=>!['id','actor','subject','workstation','fromMinute','toMinute','teaching'].includes(k))||!row.id||typeof row.id!=='string'||s.records?.[row.id]||!n||isPhysicallyDead(e,s,row.actor)||['濒死','昏迷'].includes(n.status)||n.scheduleTravel||n.cognitionTravel||!subject||!station||n.location!==row.workstation||!e.world.locations.some(p=>p.id===row.workstation)||!Number.isSafeInteger(row.fromMinute)||row.fromMinute<0||!Number.isSafeInteger(row.toMinute)||row.toMinute<=row.fromMinute||row.fromMinute>s.minute||row.toMinute<=s.minute||row.teaching!==false||!knowsKnowledge(e,s,row.actor,row.subject))throw Error('Invalid demonstration subject, workstation or active window');
 const facility=facilityView(e,s,row.workstation),stations=facility?.workstations??[];
 if(facility?.factor===0||!stations.some(st=>e.world.recipes.some(r=>r.skill===(subject.skill??subject.id)&&r.workstation===st.kind))||recordsWhere(s.records,'category','education_demonstration').some(r=>r.actor===row.actor&&r.fromMinute<row.toMinute&&r.toMinute>row.fromMinute))throw Error('Demonstration requires a working subject workstation and an unoccupied window');
 holdingSet(d,e,['state','records',row.id],{...row,category:'education_demonstration',sourceEvent:context.eventId,activityBefore:n.activity??'',practicingBefore:n.practicing??null},'education-initial',context.eventId);
 // Legacy observation reads these fields; the timed record remains authoritative.
 holdingSet(d,e,[...personPath(row.actor),'practicing'],row.subject,'education-initial',context.eventId);
 holdingSet(d,e,[...personPath(row.actor),'activeDemonstration'],row.id,'education-initial',context.eventId);
 holdingSet(d,e,[...personPath(row.actor),'activity'],`演示：${subject.name}`,'education-initial',context.eventId);
}
export function initializeTeachingActivity(d,e,id,values,context){
 initialAuthority(d,id,context);
 if(!Object.keys(values).length||Object.entries(values).some(([k,v])=>!['teachingBusy','demonstrating'].includes(k)||typeof v!=='boolean')||values.demonstrating===true&&!demonstrationAt(e,d.get('state'),id))throw Error('Invalid teaching activity');
 for(const [k,v]of Object.entries(values))holdingSet(d,e,[...personPath(id),k],v,'education-initial',context.eventId);
 if(values.demonstrating===false)for(const field of ['practicing','teaching'])holdingSet(d,e,[...personPath(id),field],null,'education-initial',context.eventId);
}
export function teachingAvailable(e,s,id,until=s.minute){
 const n=id==='player'?s.player:s.npcs?.[id];
 return !n?.teachingBusy&&!demonstrationAt(e,s,id,undefined,Math.min(until,s.minute));
}
// Runtime settlement is the education module's own write, not an initial-campaign one.
export function settleDemonstrations(d,e){
 const s=d.get('state');
 for(const r of recordsWhere(s.records,'category','education_demonstration'))if(r.toMinute<=s.minute&&s.npcs?.[r.actor]?.activeDemonstration===r.id){
  const path=personPath(r.actor),activity=`演示：${e.byId.get(r.subject)?.name}`;
  if(d.get(...path,'activity')===activity)holdingSet(d,e,[...path,'activity'],r.activityBefore,'education');
  holdingSet(d,e,[...path,'practicing'],r.practicingBefore,'education');
  holdingSet(d,e,[...path,'activeDemonstration'],null,'education');
  holdingSet(d,e,[...personPath(r.actor),'teachingBusy'],false,'education');
 }
}
const DAY=1440;
const scheduleRecords=Symbol('schedule records');
const scheduleReservations=Symbol('schedule reservations');
// Union of the records actually read by routines, household work, courses,
// legal holds, facilities, appointments and workstation capabilities.
export const scheduleRecordDependencies={categories:['governance_office','organization','housing_steward','legal_dismissal','festival','legal_detention','legal_custody','legal_case','transition','war_disruption','title','notable','settlement_rank','market_trip','private_farm','project_assignment','education_course','education_demonstration','education_cohort','service_appointment','service_appointment_receipt','facility_region','subsistence_plan','water_cycle','physical_feature','physical_item'],kinds:['workshop','asset_lease']};
const scheduleCategorySet=new Set(scheduleRecordDependencies.categories),scheduleKindSet=new Set(scheduleRecordDependencies.kinds);
export const isScheduleRecord=r=>Boolean(r&&(r.category!=='physical_feature'||r.state?.waterMl!==undefined)&&(scheduleCategorySet.has(r.category)||scheduleKindSet.has(r.kind)));
export const isScheduleEvent=r=>r?.category==='world_event'&&r.verb==='appointment_agreed';
// Attendance and settlement progress do not change the agreed routine or
// course. Keep comparing all other fields, including legacy terms, clauses,
// amendments, status, deadlines and termination/substitution facts.
const workshopProgressFields=new Set(['attendance','attendanceThrough','shifts','workedMinutes','aggregateMinutes','paid','produced','nextWork']);
const ignoredScheduleFields=[{category:'contract',kind:'workshop',fields:[...workshopProgressFields]}];
scheduleRecordDependencies.ignoreFields=ignoredScheduleFields;
const waterRecord=r=>r?.category==='water_cycle'||r?.category==='physical_feature'&&r.state?.waterMl!==undefined;
function scheduleRecordInput(r){
 if(waterRecord(r)){
  const w=r.water??r.state;
  // Schedule duties depend on potability/availability, not the amount of
  // safe water still in the river. Actual intake reads live volume at meals.
  return {category:r.category,location:r.location,waterScheduleFacts:[w.waterMl>0,w.frozenUntil??0,w.pathogenRisk??0,(w.toxinUg??0)/Math.max(1,w.waterMl),(w.saltMg??0)/Math.max(1,w.waterMl)],drinking:Object.entries(r.drinking??{}).map(([id,row])=>[id,row.day,row.takenMl>0])};
 }
 return r?.category==='contract'&&r.kind==='workshop'?Object.fromEntries(Object.entries(r).filter(([key])=>!workshopProgressFields.has(key))):r;
}
export const sameScheduleRecordInputs=(a,b)=>sameScheduleRecord(scheduleRecordInput(a),scheduleRecordInput(b));
function sameScheduleRecord(a,b){
 if(a===b)return true;
 if(a?.waterScheduleFacts&&b?.waterScheduleFacts)return canonicalEqual(a,b);
 if(a?.category!=='contract'||b?.category!=='contract'||a.kind!=='workshop'||b.kind!=='workshop')return false;
 const keys=Object.keys(a).filter(k=>!workshopProgressFields.has(k));
 return keys.length===Object.keys(b).filter(k=>!workshopProgressFields.has(k)).length&&keys.every(k=>Object.hasOwn(b,k)&&canonicalEqual(a[k],b[k]));
}
const reservationInputs=s=>recordsMemo(s.obligations,scheduleReservations,()=>['promise','delivery',undefined].flatMap(kind=>recordsWhere(s.obligations,'kind',kind)).filter(r=>r.reservationVersion===1));
// Physical state, study/pay progress, perception evidence and event receipts are not inputs to
// course/routine derivation. Completed learning changes the actor's skills or
// recipes; changed employment still invalidates through its contract record.
export function sameScheduleInputs(a,b){
 if(a&&a===b)return true;
 // Air-route resistance is physical-feature state. Avoid retaining a course
 // projection across record writes while those live route wind effects exist.
 if(a.records!==b.records&&[...Object.values(a.effects??{}),...Object.values(b.effects??{})].some(effect=>effect.kind==='air'&&effect.operation==='area_wind'&&effect.route))return false;
 if(Object.keys(a).filter(k=>k!=='family').length!==Object.keys(b).filter(k=>k!=='family').length||Object.keys(a).some(k=>!['minute','scheduler','records','obligations','npcObligationClock','npcCognition','family'].includes(k)&&a[k]!==b[k]))return false;
 // Source choice reads current finite stocks, never yesterday's failed stop.
 // Meal receipts themselves do not change anybody's allocation.
 if(a.family!==b.family){
  // 吃饭记账字段（meals、mealDays、单餐累计额度 mealCap）不影响课程分配；与 npc-schedule.mjs invalidateSchedule 同步。
  const relevant=f=>Object.keys(f??{}).filter(k=>k!=='meals'&&k!=='mealDays'&&k!=='mealCap');
  const x=relevant(a.family),y=relevant(b.family);
  if(x.length!==y.length||x.some(k=>a.family[k]!==b.family?.[k]))return false;
 }
 if(a.obligations!==b.obligations){
  const x=reservationInputs(a),y=reservationInputs(b);
  if(x.length!==y.length||x.some((r,i)=>r!==y[i]))return false;
  // A teaching employment may end through its unified service obligation.
  // Financial accrual elsewhere does not change anybody's routine or class.
  for(const job of recordsWhere(b.records,'kind','workshop'))if(job.serviceObligation&&a.obligations?.[job.serviceObligation]!==b.obligations?.[job.serviceObligation])return false;
 }
 if(a.records===b.records)return true;
 const ax=serviceAppointmentSources(a),bx=serviceAppointmentSources(b);
 if(ax.length!==bx.length||ax.some((event,i)=>!canonicalEqual(event,bx[i])))return false;
 const rows=s=>recordsMemo(s.records,scheduleRecords,()=>{const out=[],all=s.records??{};for(const id of Object.keys(all)){const r=all[id];if(isScheduleRecord(r))out.push([id,scheduleRecordInput(r)]);}return out;},scheduleRecordDependencies);
 const x=rows(a),y=rows(b);
 return x===y||x.length===y.length&&x.every(([id,row],i)=>id===y[i][0]&&sameScheduleRecord(row,y[i][1]));
}
registerAdvanceHook('sameScheduleInputs',sameScheduleInputs);
// Catalog identity follows immutable world/created partitions, never the clock,
// skills or legal state. Those remain live inputs to every course derivation.
const emptyCreated=Object.freeze({});
const advanceCourses=new WeakMap();
// Risk-age accumulation is a mortality input. Course ages come from
// npcAgeAt (catalog/family birth), never this per-clock floating accumulator.
const courseUnchangedNpcFields=new Set(['aging','activity','coins','inventory','scheduleTravel','cognitionTravel','cognition','memoryStream','developments','growth']);
const coursePupilAges=Symbol('course pupil ages'),courseAgeDependencies=[
 ['created','npc_*','birth'],['created','npc_*','age'],['created','npc_*','id'],
 ['family','people','*','birth'],['family','people','*','age'],['family','people','*','id']
];
const courseTeacherKey=Symbol('course teacher eligibility'),courseTeacherDependencies=[
 ['npcs','*','skills','skill_literacy'],['created','npc_*','skills','skill_literacy'],['created','npc_*','proficiencies','skill_literacy']
];
const courseMasterKey=Symbol('course master edges'),courseMasterDependencies=[['npcs','*','relationships','*','type']];
const courseBooksKey=Symbol('course book owners'),courseBookDependencies=[['itemInstances']];
function coursePupils(e,s,minute=s.minute){
 return stateMemo(s,e,[coursePupilAges,Math.floor(minute/DAY)],()=>new Set(educationCatalog(e,s).people.filter(p=>{
  const age=npcAgeAt(e,s,p.id,minute);return age>=(e.rules.education?.minimumAge??6)&&age<=(e.rules.education?.maximumAge??17);
 }).map(p=>p.id)),courseAgeDependencies);
}
function courseTeachers(e,s){
 return stateMemo(s,e,[courseTeacherKey],()=>{const ids=Object.keys(s.npcs??{});return {ids,teachers:new Set(ids.filter(id=>knowledgeProficiency(e,s,id,'skill_literacy')>100))};},courseTeacherDependencies);
}
function courseMasters(e,s){
 return stateMemo(s,e,[courseMasterKey],()=>new Map(Object.entries(s.npcs??{}).flatMap(([id,n])=>{
  const teacher=Object.entries(n.relationships??{}).find(([,r])=>r.type==='师父')?.[0]??e.byId.get(id)?.relationships?.find(r=>r.type==='师父')?.with;
  return teacher?[[id,teacher]]:[];
 })),courseMasterDependencies);
}
const sameSet=(a,b)=>a===b||a.size===b.size&&[...a].every(v=>b.has(v));
const sameEdges=(a,b)=>a===b||a.size===b.size&&[...a].every(([id,to])=>to===b.get(id));
function sameCourseInputs(e,a,b,minute){
 if(a&&a===b)return true;
 if(!canonicalEqual(courseEnvironment(e,a),courseEnvironment(e,b)))return false;
 if(a.npcs===b.npcs)return true;
 const oldTeachers=courseTeachers(e,a),teachers=courseTeachers(e,b);
 if(oldTeachers!==teachers&&(oldTeachers.ids.length!==teachers.ids.length||oldTeachers.ids.some((id,i)=>id!==teachers.ids[i])||!sameSet(oldTeachers.teachers,teachers.teachers)))return false;
 // Routines are read only for teachers. Pupils, carried books and actual
 // apprenticeship edges supply the other people-dependent course inputs.
 // Household errands are frozen in subsistence_plan, not sibling inventories.
 const books=stateMemo(b,e,[courseBooksKey],()=>new Set(Object.values(b.itemInstances??{}).filter(u=>u.book?.teaches?.length).map(u=>u.owner)),courseBookDependencies);
 const pupils=coursePupils(e,b,minute);
 const masters=courseMasters(e,b);if(!sameEdges(courseMasters(e,a),masters))return false;
 const related=new Set([...teachers.teachers,...pupils,...books,...masters.keys(),...masters.values()]);
 for(const id of related){
  const x=a.npcs[id],y=b.npcs[id];if(x===y)continue;if(!y)return false;
  if(!x)return false;
  const keys=Object.keys(x);if(keys.length!==Object.keys(y).length){
   // Optional movement/cognition fields may appear or disappear as a trip ends.
   if(keys.filter(k=>!courseUnchangedNpcFields.has(k)).length!==Object.keys(y).filter(k=>!courseUnchangedNpcFields.has(k)).length)return false;
  }
  const home=x.residence?.home??e.byId.get(id)?.home?.location;
  for(const k of new Set([...keys,...Object.keys(y)]))if(!courseUnchangedNpcFields.has(k)&&!(k==='location'&&home)&&x[k]!==y[k])return false;
 }
 return true;
}
const courseEnvironmentKey=Symbol('education course environment');
// Course derivation reads frozen subsistence duties, not today's source
// volume or pollution. Actual water/forage intake still reads live resources.
// Keep the broader schedule dependency set for physical travel consumers.
const courseRecordDependencies={categories:['governance_office','organization','housing_steward','legal_dismissal','festival','legal_detention','legal_custody','legal_case','transition','war_disruption','title','notable','settlement_rank','market_trip','private_farm','project_assignment','education_course','education_demonstration','education_cohort','service_appointment','service_appointment_receipt','facility_region','subsistence_plan','physical_item'],kinds:['workshop','asset_lease'],ignoreFields:ignoredScheduleFields};
const isCourseRecord=r=>Boolean(r&&(courseRecordDependencies.categories.includes(r.category)||courseRecordDependencies.kinds.includes(r.kind)));
const courseEnvironmentDependencies=[
 {path:['records'],categories:[...courseRecordDependencies.categories,'world_event']},
 {path:['records'],kinds:scheduleRecordDependencies.kinds},
 ['obligations'],['created'],['population'],['remote'],['location'],['buildings'],['effects'],['itemInstances'],['settlements'],
 ['family','households'],['family','people'],['family','illnesses'],['player','companions']
];
function courseEnvironment(e,s){
 return stateMemo(s,e,[courseEnvironmentKey],()=>({
  records:recordsMemo(s.records,courseEnvironmentKey,()=>Object.entries(s.records??{}).filter(([,r])=>isCourseRecord(r)).map(([id,r])=>[id,scheduleRecordInput(r)]),courseRecordDependencies),
  obligations:reservationInputs(s),employmentObligations:recordsWhere(s.records,'kind','workshop').filter(r=>r.serviceObligation).map(r=>s.obligations?.[r.serviceObligation]),services:serviceAppointmentSources(s),created:s.created,population:s.population,remote:s.remote,location:s.location,
  buildings:s.buildings,effects:s.effects,itemInstances:s.itemInstances,settlements:s.settlements,
  households:s.family?.households,people:s.family?.people,illnesses:s.family?.illnesses,companions:s.player?.companions,
 }),courseEnvironmentDependencies);
}
function courseCacheUntil(s){
 let until=(Math.floor(s.minute/DAY)+1)*DAY;
 for(const r of Object.values(s.records??{})){
  if(!isScheduleRecord(r))continue;
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

export const educationRows=s=>recordsWhere(s.records,'category','education_course').filter(r=>r.status==='开课'&&(r.until??Infinity)>s.minute);
export const knowledgeProficiency=(e,s,id,skill)=>{
 const b=s.created?.[id]??e.byId.get(id),v=id==='player'?s.skills?.[skill]:s.npcs?.[id]?.skills?.[skill]??b?.proficiencies?.[skill]??b?.skills?.[skill];
 return typeof v==='number'?v:v?.proficiency??0;
};
export function knowsKnowledge(e,s,id,entity){
 const b=s.created?.[entity]??e.byId.get(entity);if(!b)return false;
 if(entity.startsWith('skill_'))return knowledgeProficiency(e,s,id,entity)>0;
 const partition=entity.startsWith('recipe_')?'recipes':'spells';
 return Boolean(id==='player'?s[partition]?.[entity]:s.npcs?.[id]?.[partition]?.[entity]||b.teachers?.includes(id)||partition==='recipes'&&stationMaster(e,s,id,b));
}
// A master teaches where the craft is done: present at a station of the
// recipe's kind where they work or live, or may lawfully use, awake and not travelling, sleeping or at a
// meal. Not limited to a booked teaching slot in the routine.
const RESTING=/睡眠|睡觉|熟睡|吃饭|用饭|进食/;
export function teachingAtStation(e,s,id,recipe){
 const n=s.npcs?.[id];
 if(!n||!stationMaster(e,s,id,recipe)||n.scheduleTravel||n.cognitionTravel||['濒死','昏迷','患病','睡眠'].includes(n.status))return false;
 const slot=e.protocolScheduleAt?.(e,id,s.minute,s),activity=slot&&slot.location===n.location?slot.activity:n.activity;
 if(RESTING.test(activity??''))return false;
 // Where they work or live is where they practise; elsewhere they need a lawful use of the station.
 const own=[n.residence?.home,n.vocation?.location,e.byId.get(id)?.home?.location,e.byId.get(id)?.workplace?.location].includes(n.location);
 return (facilityView(e,s,n.location)?.workstations??[]).some(st=>st.kind===recipe.workstation&&(own||stationLicence(e,{state:s},st,id)));
}
// K5: masters follow the stations. A person practising a craft at a station of
// its kind where they live or work knows that station's recipes within their
// proficiency, the same capability currentWorkstationRecipes gives on duty.
// Knowledge stays with the person when the station is damaged.
export function stationMaster(e,s,id,recipe){
 if(id==='player'||!recipe?.workstation||!s.npcs?.[id])return false;
 const proficiency=knowledgeProficiency(e,s,id,recipe.skill);
 if(proficiency<=0||proficiency<(recipe.minimumProficiency??0))return false;
 const n=s.npcs[id],b=e.byId.get(id);
 const places=new Set([n.residence?.home,n.vocation?.location,b?.home?.location,b?.workplace?.location].filter(Boolean));
 return [...places].some(place=>(!recipe.location||recipe.location===place)&&fixtureStations(s.created?.[place]??e.byId.get(place)).some(st=>st.kind===recipe.workstation));
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
export function educationCourses(e,s,minute=s.minute){
 if(e.educationCourseContext)return e.educationCourseContext;
 if(recordIndexActive()){
  const previous=advanceCourses.get(e);
  const epoch=recordReadEpoch();
  if(previous&&previous.epoch===epoch&&minute>=previous.minute&&minute<previous.until&&sameCourseInputs(e,previous.state,s,minute)){
   if(process.env.FIELDS_INDEX_CHECK==='1'&&!canonicalEqual(previous.courses,deriveEducationCourses(e,s,minute))){
    recordIndexCheck.violations.push('education courses');throw Error('education course cache mismatch');
   }
   previous.state=s;previous.minute=minute;return previous.courses;
  }
  const courses=deriveEducationCourses(e,s,minute);advanceCourses.set(e,{state:s,minute,courses,epoch,until:courseCacheUntil(minute===s.minute?s:{...s,minute})});return courses;
 }
 const memo=e.educationCourseMemo;if(minute!==s.minute||!memo||!s||typeof s!=='object')return deriveEducationCourses(e,s,minute);
 let hit=memo.get(s);if(!hit){hit=deriveEducationCourses(e,s);memo.set(s,hit);}
 return hit;
}
function deriveEducationCourses(e,input,minute=input.minute){
 const s=minute===input.minute?input:{...input,minute};

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
 const teachers=[...courseTeachers(e,input).teachers].sort();
 const routines=new Map(teachers.map(id=>[id,npcSchedule(e,s,id,undefined,constraints)]));
 const jobs=recordsWhere(s.records,'category','contract').map(r=>contractTerms(r,s.minute)).filter(r=>employmentActive(r,s)&&r.status!=='罢工'&&r.starts<=s.minute&&r.deadline>s.minute&&/授业|先生|教学/.test(r.task??''));
 const memo=(f)=>{const m=new Map();return id=>{if(!m.has(id))m.set(id,f(id));return m.get(id);};};
 const homeOf=memo(id=>settlement(e,s,id)),literacyOf=memo(id=>knowledgeProficiency(e,s,id,'skill_literacy'));
 // Each school used to rescan the entire expanded population for every
 // teacher and slot. Group the same ordered candidates once per derivation.
 const pupilsByTown=new Map();
 const pupils=coursePupils(e,input,minute);
 for(const p of people){
  if(!pupils.has(p.id)||isPhysicallyDead(e,s,p.id))continue;
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
 for(const [student,teacher]of courseMasters(e,input)){
  if(out.some(c=>c.students.includes(student)))continue;
  const master=s.npcs?.[teacher];if(!master)continue;
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

registerAdvanceHook('settleDemonstrations',settleDemonstrations);
