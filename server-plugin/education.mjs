import {preconditionFailure} from './precondition.mjs';
import {educationCourses,educationSites,educationStatistics,knowledgeProficiency,knowsKnowledge,courseWindow,educationReservation,sameScheduleInputs} from './education-state.mjs';
export {educationCourses};
import {npcLessonGain,settleNpcLesson} from './npc-growth.mjs';
import {readBook} from './book-gates.mjs';
import {personConstraint,personHousehold,personAge,personCertified} from './entity-view.mjs';
import {currentWorkstationRecipes} from './workstation-services.mjs';
import {facilityView} from './facility-state.mjs';
import {transferItems} from './items.mjs';
import {financeTransfer,financeBalance} from './finance-bank.mjs';
import {settleEmploymentPay,settleArrears} from './labor-market.mjs';
import {serviceClaimsFresh} from './service-queue.mjs';
import {currentEmployment,employmentReservation} from './employment-state.mjs';
import {organizationState} from './organization-state.mjs';
import {advanceWithNpcParticipants} from './npc-schedule.mjs';
import {rosterLifeState} from './population.mjs';
import {npcEntryCheck} from './checks.mjs';
import {npcServices} from './npc-state.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {syncHoldings} from './holding-sources.mjs';
import {changeLegacyHoldings} from './transition.mjs';
declareHoldingWriter('education',{kinds:['member_of','holds_office','employed_by','certified','resides','devotee_of'],entities:['office']});
const DAY=1440,path=id=>['state','records',id];
const capable=(s,id)=>id==='player'||s.npcs?.[id]&&!['死亡','濒死','昏迷','患病'].includes(s.npcs[id].status)&&!s.npcs[id].caring&&!s.npcs[id].levy;
const able=(s,id)=>capable(s,id)&&(id==='player'||!s.npcs[id].cognitionTravel&&!s.npcs[id].scheduleTravel);
const int=(n,min,max,label)=>{if(!Number.isSafeInteger(n)||n<min||n>max)throw preconditionFailure(`${label}无效`);return n;};
const actor=(e,name)=>['player','玩家'].includes(name)?'player':e.resolve(name,'npc');
const location=(s,id)=>id==='player'?s.location:s.npcs[id]?.location;
const definition=(e,s,id)=>s.created?.[id]??e.byId.get(id);
export function prepareEducation(d,e,{before,after}){
 e.educationAttendance=new Map();
 const state=d.get('state'),prepared=d.scheduleEducation;
 // The heap read an immutable draft snapshot. Reuse only when no simulation
 // input changed in phase 2; the clock/cursor writes alone do not change courses.
 const same=prepared?.minute===before&&sameScheduleInputs(prepared.state,state);
 e.educationCourseContext=(same?prepared.courses:educationCourses(e,{...state,minute:before})).filter(c=>!c.school||!e.npcScheduleReservations?.has(c.teacher));
 for(const c of e.educationCourseContext)for(const id of [c.teacher,...c.students].filter(Boolean)){
  // Admission happens at an actual opening bell, never during an unrelated
  // zero-time action or in the middle of an already running class.
  const opening=Math.floor(after/DAY)*DAY+c.start;
  if(!d.get('state','npcs',id)&&after>before&&before<=opening&&opening<=after){
   const n=rosterLifeState(e,d.get('state'),id,opening,'自动入学',{minor:true});
   if(n)holdingSet(d,null,['state','npcs',id],n,'education');
  }
  e.educationAttendance.set(id,[]);
 }
}
function present(d,e,id){const s=d.get('state');if(!able(s,id)||location(s,id)!==s.location||personConstraint(e,s,id))throw preconditionFailure('参与者须清醒在场且不受拘留');}
function teaching(e,s,teacher,entity){
 if(entity.startsWith('recipe_')&&currentWorkstationRecipes(e,s,teacher).some(r=>r.id===entity))return true;
 if(!knowsKnowledge(e,s,teacher,entity))return false;
 const b=definition(e,s,entity);if(entity.startsWith('spell_')&&b.stage>=4)return false;
 return entity.startsWith('skill_')||knowledgeProficiency(e,s,teacher,b.skill)>=(b.minimumProficiency??0);
}
export function studyBook(d,e,holder,source,entity){
 return readBook(d,e,holder,source,entity,{fail:(code,english,chinese)=>{throw Error(chinese);}});
}
function compatible(e,s,student,entity){
 const b=definition(e,s,entity),skill=entity.startsWith('skill_')?entity:b?.skill;if(!b||!skill)return false;
 if(entity.startsWith('spell_')&&b.stage>0&&(!personCertified(e,s,student,skill)||knowledgeProficiency(e,s,student,skill)<b.stage*300))return false;
 if(!entity.startsWith('skill_')&&knowledgeProficiency(e,s,student,skill)<(b.minimumProficiency??0))return false;
 const sk=definition(e,s,skill);
 return [...b.prerequisites??[],...sk?.prerequisites??[]].every(r=>knowledgeProficiency(e,s,student,typeof r==='string'?r:r.skill)>=(typeof r==='string'?1:r.minimum));
}
// A session is credited when the class is dismissed (window end), so the
// result never depends on how the elapsed time was split into events.
function lesson(d,e,c,student,attended,factor,at,dismissed,day){
 const s=d.get('state'),b=definition(e,s,c.entity),skill=c.entity.startsWith('skill_')?c.entity:b.skill,source=c.book?c.source:c.teacher;
 if(!compatible(e,s,student,c.entity))return;
 let ceiling=knowledgeProficiency(e,s,source,skill),required=c.entity.startsWith('skill_')?e.rules.npcGrowth.teach.minutes:b.learnMinutes??e.rules.npcGrowth.teach.minutes;
 if(c.book){try{const book=studyBook(d,e,student,c.source,c.entity);required=Math.max(required,book.minutes);ceiling=book.ceiling;}catch{return;}}
 else if(!teaching(e,s,c.teacher,c.entity))return;
 const key=`education_study:${c.id}:${student}`,old=s.records?.[key]??{category:'education_study',course:c.id,student,entity:c.entity,minutes:0,completedMinutes:0,sessions:0};
 // Effective minutes carry a degraded facility's fractional remainder (factor
 // 0.5) across settlements, so split time advances credit exactly one advance's total.
 const scaled=attended*factor+(old.carry??0),minutes=Math.floor(scaled),carry=scaled-minutes;
 const attendedDay=minutes>0?day:old.attendedDay;
 const total=old.minutes+minutes;let completed=old.completedMinutes,sessions=old.sessions,gain=0;
 if(dismissed&&attendedDay===day&&total-completed>=required){
  if(c.entity.startsWith('skill_')){
   try{gain=npcLessonGain(e,s,student,skill,ceiling,e.rules.npcGrowth.teach.gain);settleNpcLesson(d,e,student,skill,gain,`${key}:${at}`);completed+=required;sessions++;}catch{/* Daily allowance or proficiency ceiling: no free growth. */}
  }else if(!knowsKnowledge(e,s,student,c.entity)){
   const partition=c.entity.startsWith('recipe_')?'recipes':'spells';
   holdingSet(d,null,['state','npcs',student,partition,c.entity],{source:{type:c.book?'book':'teacher',id:source},learnedAt:at,sourceEvent:key},'education');completed+=required;sessions++;
  }
 }
 // Keep at most one uncompleted lesson; unavailable daily allowance cannot be
 // stockpiled to turn an instant visit into many days of teaching. The trim is
 // applied when the class is dismissed, not at every clock settlement inside
 // it, so a class advanced in several steps credits what one advance would.
 // Less than one effective minute does not open a lesson record; once a record
 // exists, its remainder is kept so later settlements credit the exact total.
 if(!minutes&&!gain&&sessions===old.sessions&&(carry===(old.carry??0)||!s.records?.[key]))return gain;
 const row={...old,minutes:dismissed?Math.min(total,completed+required):total,completedMinutes:completed,sessions,...(minutes?{lastAt:at}:{}),...(attendedDay===undefined?{}:{attendedDay}),source,gained:(old.gained??0)+gain};
 if(carry)row.carry=carry;else delete row.carry;
 holdingSet(d,null,path(key),row,'education');
 return gain;
}
export function nextEducationMinute(e,d,now){
 let next=Infinity;for(const c of educationCourses(e,d.get('state')))for(const day of [Math.floor(now/DAY),Math.floor(now/DAY)+1]){
  const w=courseWindow(c,day*DAY);if(w)for(const at of [w.start,w.end])if(at>now)next=Math.min(next,at);
 }return next;
}
export function advanceEducation(d,e,{before,after,beforeState}){
 for(const c of educationCourses(e,d.get('state'))){
  const state=d.get('state'),w=courseWindow(c,before);if(!w)continue;
  const start=Math.max(before,w.start),end=Math.min(after,w.end);if(end<=start)continue;
  const view=facilityView(e,state,c.location),cap=c.book||c.apprentice?1:view?.capacity??0;if(cap<1||view?.factor===0)continue;
  const teacher=c.book?null:c.teacher,prior=beforeState??state;
  const attendance=who=>e.educationAttendance?.get(who)??(location(prior,who)===c.location?[{start,end,location:c.location}]:[]);
  if(teacher&&(!capable(state,teacher)||personConstraint(e,state,teacher)))continue;
  const job=c.contract&&state.records?.[c.contract];if(c.contract&&(!job||settleArrears(d,e,job,end)||!['有效','要求加薪'].includes(job.status)||job.deadline<end))continue;
  const employed=c.employment&&state.records?.[c.employment];if(c.employment&&(!employed||!['有效','要求加薪'].includes(employed.status)||employed.deadline<end))continue;
  let taughtMinutes=0;
  if(c.cohort&&teacher){
   const minutes=attendance(teacher).filter(a=>a.location===c.location).reduce((n,a)=>n+Math.max(0,Math.min(end,a.end)-Math.max(start,a.start)),0);
   if(minutes){
    const key=`education_cohort:${c.id}:${Math.floor(start/DAY)}`,old=d.get(...path(key));
    // A degraded facility (factor 0.5) credits half minutes; the remainder is
    // carried so split time advances credit exactly what one advance would.
    const scaled=minutes*(view?.factor??1)+(old?.carry??0),credited=Math.floor(scaled),carry=scaled-credited;
    holdingSet(d,null,path(key),{category:'education_cohort',course:c.id,...c.cohort,skill:c.entity,teacher,start:old?.start??start,end,minutes:(old?.minutes??0)+credited,ceiling:knowledgeProficiency(e,state,teacher,c.entity),...(carry?{carry}:{})},'education');taughtMinutes=minutes;
   }
  }
  for(const student of c.students.slice(0,cap)){
   const s=d.get('state');if(student==='player'||!capable(s,student)||personConstraint(e,s,student))continue;
   const minutes=attendance(student).filter(a=>a.location===c.location).reduce((n,a)=>n+(teacher?attendance(teacher):[{start,end,location:c.location}]).filter(b=>b.location===c.location).reduce((m,b)=>m+Math.max(0,Math.min(end,a.end,b.end)-Math.max(start,a.start,b.start)),0),0);
   const dismissed=end===w.end;
   if(!minutes&&!(dismissed&&d.get(...path(`education_study:${c.id}:${student}`))?.attendedDay===Math.floor(w.start/DAY)))continue;
   if(minutes)try{e.assertNpcObligationAction?.(d,[student],{start,minutes:end-start,kind:'education'});if(teacher)e.assertNpcObligationAction?.(d,[teacher],{start,minutes:end-start,kind:c.employment?'employment':'education'});e.assertNpcAutonomyAction?.(s,[student,...teacher?[teacher]:[]],{start,minutes:end-start});}catch{continue;}
   lesson(d,e,c,student,minutes,view?.factor??1,end,dismissed,Math.floor(w.start/DAY));taughtMinutes=Math.max(taughtMinutes,minutes);
  }
  if(taughtMinutes&&job){
   const key=`education_pay:${c.id}:${Math.floor(start/DAY)}`,old=d.get(...path(key))??{category:'education_pay',minutes:0,paid:0};
   const total=old.minutes+taughtMinutes;
   const earned=Math.ceil(job.wage*total/480)-Math.ceil(job.wage*old.minutes/480);
   const payment=serviceClaimsFresh(e)?settleEmploymentPay(d,e,job,end,taughtMinutes):earned?settleEmploymentPay(d,e,job,end,480,{earnedOverride:earned}):{paid:0};
   holdingSet(d,null,path(key),{...old,minutes:total,paid:old.paid+payment.paid},'education');
   const current=d.get(...path(job.id));holdingSet(d,null,path(job.id),{...current,paid:(current.paid??0)+payment.paid,workedMinutes:(current.workedMinutes??0)+taughtMinutes},'education');
  }
 }
}
export function educationAction(d,args,id){
 const e=this,s=d.get('state'),operation=args.operation;
 if(operation==='school_inspect')return {schools:educationSites(e,s),courses:educationCourses(e,s),statistics:educationStatistics(e,s,args.location?e.resolve(args.location):personHousehold(e,s,'player').value?.settlement??e.byId.get(s.location)?.parent??s.location)};
 if(operation==='book_give'){
  const student=actor(e,args.student);present(d,e,student);const unit=s.itemInstances?.[args.source],item=unit?.item??e.resolve(args.source,'item');
  if(!definition(e,s,item)?.book&&!unit?.book)throw preconditionFailure('只能转交已登记书本');
  transferItems(d,e,'player',student,item,1,unit?[unit.id]:null);return {student,item,instance:unit?.id};
 }
 if(operation==='school_fund'){
  const org=args.org,school=educationSites(e,s).find(o=>o.id===org);if(!school||school.seat!==s.location)throw preconditionFailure('须在学馆资助');
  if(!s.records?.[`organization:${org}`]&&!e.world.factions?.some(f=>f.id===org)&&!org.startsWith('temple:'))holdingSet(d,null,path(`organization:${org}`),{category:'organization',id:org,source:'education',name:school.name,kind:school.kind,seat:school.seat,treasury:0,members:{},ledger:[]},'education'),syncHoldings(d,e,'org',org,{writer:'education'});
  const coins=int(args.coins,1,1e6,'资助');financeTransfer(d,e,'player',org,coins,id);return {org,coins,balance:financeBalance(d,e,org)};
 }
 if(operation==='school_close'){
  const c=s.records?.[args.course];if(!c||c.category!=='education_course'||c.founder!=='player')throw preconditionFailure('只能停办自己的课程');
  holdingSet(d,null,path(c.id),{...c,status:'停课',until:s.minute},'education');if(c.contract)changeLegacyHoldings(d,e,{holder:c.teacher,source:`contract:${c.contract}`,eventId:id},()=>holdingSet(d,null,path(c.contract),{...s.records[c.contract],status:'已到期',endedAt:s.minute},'education'));return {course:c.id};
 }
 if(operation==='school_open'||operation==='book_study'){
  const book=operation==='book_study',teacher=book?null:actor(e,args.source),entity=e.resolve(args.entity,args.kind),b=definition(e,s,entity);
  if(!['skill','recipe','spell'].includes(entity.split('_')[0]))throw preconditionFailure('课程只接已登记技能、配方或法术');
  const students=[...new Set((args.students??[args.student]).filter(Boolean).map(n=>actor(e,n)))];if(!students.length||students.includes('player'))throw preconditionFailure('须指定实际居民学生');
  for(const who of students)if(!d.get('state','npcs',who)&&args.consent===true){
   const student=rosterLifeState(e,d.get('state'),who,s.minute,'报名受教',{minor:(e.byId.get(who)?.age??18)<18});
   if(student&&student.location===s.location)holdingSet(d,null,['state','npcs',who],student,'education');
  }
  for(const who of [...students,...teacher?[teacher]:[]])present(d,e,who);
  if(teacher&&!teaching(e,s,teacher,entity))throw preconditionFailure('先生没有实际掌握所授内容');
  if(students.includes(teacher))throw preconditionFailure('先生不能同时作自己的学生');
  if(book){if(students.length!==1)throw preconditionFailure('一本书同时只能供一位读者学习');studyBook(d,e,students[0],args.source,entity);}
  const location=s.location,view=facilityView(e,s,location);if(!book&&(!view||view.capacity<students.length||view.factor===0))throw preconditionFailure('场所没有足够的可用教学容量');
  const start=int(args.start??480,0,1439,'每日开课时刻'),minutes=int(args.minutes??e.rules.npcGrowth.teach.minutes,30,480,'课时'),end=start+minutes;if(end>1440)throw preconditionFailure('每日课程不能跨午夜');
  const occupied=educationCourses(e,s).filter(c=>c.location===location&&c.start<end&&c.end>start).reduce((n,c)=>n+c.students.length,0);
  if(!book&&occupied+students.length>view.capacity)throw preconditionFailure('同期课程占用后教学容量不足');
  const since=s.minute,until=since+int(args.days??30,1,360,'开课天数')*DAY;
  for(const who of [...students,...teacher?[teacher]:[]]){
   if(educationReservation(e,s,who,Math.floor(since/DAY)*DAY+start,minutes))throw preconditionFailure('已有重叠课程');
   if(employmentReservation(s,who,Math.floor(since/DAY)*DAY+start,minutes))throw preconditionFailure('与既有雇佣冲突');
  }
  const course=`education:${id}`,org=args.org??`school:${location}`,existing=organizationState(e,s,org);
  const owner=s.buildings?.[location]?.owner??definition(e,s,location)?.owner;
  if(!book&&owner&&owner!=='player'&&!(existing?.members?.player)&&args.consent!==true)throw preconditionFailure('借用场所须负责人同意');
  if(!book&&(!existing||existing.source==='education'))holdingSet(d,null,path(`organization:${org}`),{category:'organization',id:org,source:'created',name:args.name??definition(e,s,location)?.name??'授业班',kind:args.schoolKind??'私塾',seat:location,founder:'player',leader:'player',members:{player:{position:'先生',joinedAt:since,arrears:0}},treasury:0,charter:{mode:'leader',fee:0,dues:0}},'education'),syncHoldings(d,e,'org',org,{writer:'education'});
  if(!book&&(args.coins??0)>0)financeTransfer(d,e,'player',org,int(args.coins,1,1e6,'办学款'),id);
  let contract=null;
  if(teacher&&teacher!=='player'&&(args.wage??0)>0){
   if(args.consent!==true||(personAge(e,s,teacher)?.value??0)<18||currentEmployment(s,teacher))throw preconditionFailure('先生须成年同意且没有其他雇佣');
   const wage=int(args.wage,1,1e6,'先生日薪');contract=`education_contract:${id}`;
   if(financeBalance(d,e,org)<Math.ceil(wage*minutes/480))throw preconditionFailure('学馆不足以支付首课工钱，请先资助');
   holdingSet(d,null,path(contract),{category:'contract',kind:'workshop',education:1,id:contract,owner:org,worker:teacher,location,wage,workMinutes:minutes,task:'授业',starts:since,createdAt:since,deadline:until,status:'有效',paid:0,workedMinutes:0,source:id},'education');
  }
  const row={category:'education_course',id:course,org,name:args.name??b.name,schoolKind:args.schoolKind??'私塾',teacher,source:args.source,book,entity,location,students,start,end,since,until,status:'开课',founder:'player',contract};
  holdingSet(d,null,path(course),row,'education');return {course,...row};
 }
 throw preconditionFailure('未知授业操作；合法 operation：school_inspect、book_give、school_fund、school_close、school_open、book_study；普通师授、单次读书或研究成果学习不填 operation；entity 填学习内容编号或登记名称，source 填导师、书本或研究项目编号；自己学习省略 student 或填 player');
}

// Existing certification remains the player's entrance. Resident candidates
// take the same registered entry task with the present qualified examiner.
export function examineNpc(d,e,args,id){
 const student=actor(e,args.student),teacher=actor(e,args.teacher),role=e.resolve(args.profession,'profession'),b=e.byId.get(role),s=d.get('state');
 present(d,e,student);present(d,e,teacher);
 if(student===teacher||!npcServices(e,s,teacher).includes(role))throw preconditionFailure('考官没有本职业认证资格');
 if(!['life','combat'].includes(b.kind))throw preconditionFailure('隐藏身份不由普通考试授予');
 const entry=b.entry;if((s.npcs[student]?.level??e.byId.get(student)?.level??1)<b.minimumLevel||entry&&knowledgeProficiency(e,s,student,entry.skill)<entry.minimumProficiency)throw preconditionFailure('尚未达到报考技能或等级要求');
 if(s.npcs[student]?.certifications?.[role])throw preconditionFailure('已经通过该职业考核');
 const roles=Object.keys(s.npcs[student]?.certifications??{}).map(r=>e.byId.get(r));if(b.kind==='combat'&&roles.some(r=>r?.kind==='combat')||b.kind==='life'&&roles.filter(r=>r?.kind==='life').length>=2)throw preconditionFailure('正式职业名额已满');
 if((s.npcs[student]?.coins??0)<b.fee)throw preconditionFailure('考生认证费用不足');
 const minutes=entry?.minutes??120;
 e.assertNpcObligationAction?.(d,[teacher,student],{minutes,kind:'exam'});e.assertNpcAutonomyAction?.(s,[teacher,student],{minutes});
 advanceWithNpcParticipants(d,e,minutes,id,[student,teacher]);
 const current=d.get('state');if(!able(current,student)||!able(current,teacher))throw preconditionFailure('考核中途失去行动能力');
 // A real completed entry task, with skill and attribute requirements, is the
 // evidence. No rumour or donation can manufacture this certification.
 const attribute=current.npcs[student]?.attributes?.[b.attribute]??e.byId.get(student)?.attributes?.[b.attribute]??10;
 const outcome=npcEntryCheck(d,e,student,{attribute:b.attribute??'智力',skill:entry?.skill,difficulty:entry?.difficulty??15},id),success=attribute>=(entry?.minimumAttribute??0)&&outcome.success;
 const row={category:'education_exam',student,teacher,profession:role,skill:entry?.skill,...outcome,success,minute:current.minute,source:id};holdingSet(d,null,path(`education_exam:${id}`),row,'education');
 if(success){financeTransfer(d,e,student,teacher,b.fee,id);holdingSet(d,null,['state','npcs',student,'certifications',role],{teacher,minute:current.minute,source:id,task:entry?.name??b.name},'education');}
 return row;
}
