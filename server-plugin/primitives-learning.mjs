// NPC learning consumes real sources and elapsed time. Education's knowledge
// and book gates remain authoritative; native practice owns rate/carry/caps.
import {reject} from './primitive-policy.mjs';
import {canAct} from './action-capacity.mjs';
import {consent} from './action-consent.mjs';
import {knowledgeProficiency,knowsKnowledge,demonstrationAt,teachingAvailable,knowsPracticalKnowledge,practicalKnowledgeRegistry} from './education-state.mjs';
import {canReadLanguage} from './subjective-view.mjs';
import {personCertified} from './entity-view.mjs';
import {obligationClosed} from './obligation-state.mjs';
import {fixedUnits,fixedNumber,fixedMultiply,checkedFixed} from './rx.mjs';
import {digest} from './storage.mjs';

export function initialKnowledgeAction(d,e,tool,args){
 const s=d.get('state');
 if(tool==='site'&&args.operation==='disarm'){
  const target=s.created?.[args.target]??d.get('holdings','entities',args.target)?.facts??e.byId.get(s.location)?.site?.mechanisms?.find(r=>[r.id,r.name].includes(args.target));
  const required=Object.entries(practicalKnowledgeRegistry).find(([,r])=>r.mechanisms.includes(target?.mechanism))?.[0];
  if(required&&!knowsPracticalKnowledge(e,s,'player',required))reject('E-DISARM-KNOWLEDGE','Unknown tripwire disassembly procedure');
 }
}
export function activityTeachingConsent(d,e,args,next){
 const s=d.get('state');
 if(!teachingAvailable(e,s,args.teacher,s.minute+args.minutes)){
  const demo=demonstrationAt(e,s,args.teacher,args.subject);
  if(demo&&demo.toMinute<s.minute+args.minutes)reject('E-LEARN-OBSERVE','The demonstration does not cover the study window');
  return {allowed:false,kind:'busy',reason:'导师没有授课空档'};
 }
 return next();
}
export function learnWithInitialKnowledge(d,e,args,id,next){
 if(args.operation)return next();
 const s=d.get('state');let source=args.source;
 if(typeof source==='string'&&!s.itemInstances?.[source]&&!s.projects?.[source])try{source=e.resolve(source);}catch{/* The native executor owns missing/ambiguous-source diagnostics. */}
 const unit=s.itemInstances?.[source],book=unit?.book??e.byId.get(unit?.item??source)?.book;
 if(book&&args.student===undefined){
  const language=unit?.language??e.byId.get(unit?.item??source)?.language??book.language??'lang:common';
  if(!canReadLanguage(e,s,'player',language))reject('E-LEARN-LANGUAGE','The learner cannot read the book language');
 }
 if(s.npcs?.[source]&&!teachingAvailable(e,s,source))reject('E-LEARN-SOURCE','The teacher is occupied and cannot provide a complete lesson');
 return next();
}

// Same education source gates, expressed against the L1 knowledge/holding
// view. education.mjs is owned by C and cannot become an upward L1 dependency.
function studyBook(d,e,holder,source,entity){
 const s=d.get('state'),unit=s.itemInstances?.[source],item=unit?.item??source,b=e.byId.get(item)??s.created?.[item],content=e.byId.get(entity)??s.created?.[entity];
 if(e.quantity(d,holder,item)<1||unit&&(unit.owner!==holder||unit.status!=='持有'||unit.durability===0))reject('E-LEARN-SOURCE','The learner does not hold this intact book');
 const held=d.get(...e.bagPath(holder),item),copies=(held?.instances??[]).map(id=>s.itemInstances?.[id]).filter(u=>u&&u.owner===holder&&u.status==='持有');
 if(held?.durability===0||!unit&&copies.length>=e.quantity(d,holder,item))reject('E-LEARN-SOURCE','A readable physical copy must be selected');
 const book=unit?.book??b?.book;
 if(!book||!book.teaches?.includes(entity)||!content)reject('E-LEARN-SOURCE','This book does not contain the registered subject');
 if(!canReadLanguage(e,s,holder,unit?.language??b?.language??book.language??'lang:common'))reject('E-LEARN-LANGUAGE','The learner cannot read the book language');
 if(knowledgeProficiency(e,s,holder,'skill_literacy')<e.rules.books.minimumLiteracy)reject('E-LEARN-LITERACY','The learner cannot read this book');
 const grade=e.rules.books.grades.indexOf(book.grade),stage=content.stage??Math.floor((content.minimumProficiency??0)/300);
 if(grade<0||grade<Math.min(stage,4)||entity.startsWith('spell_')&&stage>=4&&book.rare!==true)reject('E-LEARN-SOURCE','The book grade or rarity does not cover this subject');
 for(const row of b?.book?.prerequisites??[])if(knowledgeProficiency(e,s,holder,typeof row==='string'?row:row.skill)<(typeof row==='string'?1:row.minimum))reject('E-LEARN-PREREQUISITE','A book prerequisite is not met');
 return {minutes:Math.max(content.learnMinutes??0,book.readingMinutes??0,e.rules.books.readingMinutes[grade]),ceiling:Math.min((grade+1)*300,book.ceilings?.[entity]??Infinity)};
}
export function learnNpc(d,engine,effect,{frame,child,tags,requireAuthority,context,limits},{advanceWithNpcParticipants}){
 const learner=effect.entity??frame.actor,state=d.get('state'),body=state.npcs?.[learner],subject=engine.byId.get(effect.subject),source=effect.learningSource;
 if(!body||!canAct({...context,document:d.document},learner,'learn').allowed||body.scheduleTravel||body.cognitionTravel)reject('E-LEARN-ACTOR','The learner cannot currently study');
 if(learner!==frame.actor){requireAuthority('learn',learner,{effect});const place=frame.actor==='player'?state.location:state.npcs?.[frame.actor]?.location;if(body.location!==place)reject('E-LEARN-SOURCE','The learner is not present');}
 const kind=effect.subject?.split('_')[0],skill=kind==='skill'?effect.subject:subject?.skill;
 if(!subject||!['skill','recipe','spell'].includes(kind)||!engine.byId.has(skill))reject('E-LEARN-SUBJECT','The knowledge and its skill must be registered');
 const proficiency=knowledgeProficiency(engine,state,learner,skill),stage=subject.stage??Math.floor((subject.minimumProficiency??0)/300);
 if(stage>0&&!personCertified(engine,state,learner,skill)||kind!=='skill'&&proficiency<(subject.minimumProficiency??(kind==='spell'?stage*300:0)))reject('E-LEARN-PREREQUISITE','The learner lacks the required certification or proficiency');
 for(const row of [...subject.prerequisites??[],...engine.byId.get(skill).prerequisites??[]])if(knowledgeProficiency(engine,state,learner,typeof row==='string'?row:row.skill)<(typeof row==='string'?1:row.minimum))reject('E-LEARN-PREREQUISITE','A prerequisite is not met');
 const minutes=limits.learn?.minutes,multiplier=limits.learn?.multiplier??1;
 if(!Number.isSafeInteger(minutes)||minutes<1||minutes>43200||!Number.isFinite(multiplier)||multiplier<0||multiplier>2)reject('E-LEARN-BOUND','NPC study requires its native duration and degree');
 const teacher=source==='player'?state.player:state.npcs?.[source];
 let sourceKind,ceiling=2699,required=subject.learnMinutes??engine.rules.npcGrowth.teach.minutes,permission,detection,observed=false;
 const teachingPermission=(current,until)=>{
  if(source===frame.actor)return {allowed:true,kind:'self',source:frame.eventId};
  let result=consent({...context,document:current},source,learner,'teach',{purpose:effect.subject,until});
  if(!result.allowed&&context.consentPurpose)result=consent({...context,document:current},source,learner,'teach',{purpose:context.consentPurpose,until});
  return result;
 };
 const serviceAt=(current,until)=>Object.values(current.obligations??{}).some(o=>(o.kind??o.obligationKind)==='service'&&o.debtor===source&&o.creditor===learner&&!obligationClosed(o)&&o.endedAt===undefined&&!o.revoked&&(o.start??o.createdAt??0)<=current.minute&&(o.deadline??o.until??Infinity)>=until&&(o.subject===effect.subject||o.terms?.subject===effect.subject));
 if(teacher){
  const location=source==='player'?state.location:teacher.location;
  if(source===learner||location!==body.location||teacher.scheduleTravel||teacher.cognitionTravel||!canAct({...context,document:d.document},source,'learn').allowed)reject('E-LEARN-SOURCE','The teacher is not available at the learner location');
  if(!knowsKnowledge(engine,state,source,effect.subject))reject('E-LEARN-SOURCE','The teacher does not know this subject');
  if(kind==='spell'&&stage>=4)reject('E-LEARN-SOURCE','Advanced spells require research or a rare book');
  const until=state.minute+minutes;
  permission=teachingAvailable(engine,state,source,until)?teachingPermission(d.document,until):{allowed:false,kind:'busy'};
  const service=serviceAt(state,until);
  if(!permission.allowed&&!service){
   const timed=demonstrationAt(engine,state,source,effect.subject,until);
   if(!timed&&((teacher.practicing??teacher.teaching)!==effect.subject||!/(练|教|演|practice|teach)/.test(teacher.activity??'')||teacher.demonstrating===false||Object.values(state.records??{}).some(r=>r.category==='education_demonstration'&&r.actor===source)))reject('E-LEARN-OBSERVE','There is no observable demonstration');
   const facts=engine.primitiveTargetFacts(d,learner,source);
   if(!facts?.lineOfSight||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters>30)reject('E-LEARN-OBSERVE','The demonstration is not actually visible');
   observed=true;tags.push('unconsented');detection=engine.primitiveCheck(d,{attribute:'敏捷',opponent:{npc:source,attribute:'精神'}},`${child}:notice`,learner);
  }
  sourceKind='teacher';ceiling=knowledgeProficiency(engine,state,source,skill)-engine.rules.npcGrowth.teach.teacherMargin;
 }else if(source==='practice'){
  if(kind!=='skill'||!knowsKnowledge(engine,state,learner,effect.subject))reject('E-LEARN-SOURCE','Practice requires a known skill');
  sourceKind='practice';
 }else if(state.projects?.[source]){
  const p=state.projects[source];
  if(p.type!=='研究'||p.stage!=='打磨'||p.result!==effect.subject||subject.source!==source||(p.researcher??p.owner??learner)!==learner)reject('E-LEARN-SOURCE','Research does not establish this knowledge');
  sourceKind='research';
 }else{
  const book=studyBook(d,engine,learner,source,effect.subject);sourceKind='book';ceiling=book.ceiling;required=Math.max(required,book.minutes);
 }
 if(kind!=='skill'&&effect.amount!==undefined)reject('E-LEARN-AMOUNT','First acquisition uses elapsed study rather than an assigned proficiency');
 if(kind!=='skill'&&knowsKnowledge(engine,state,learner,effect.subject))reject('E-LEARN-KNOWN','This knowledge is already learned');
 const rows=engine.world.primitiveTables?.learning?.rows??[],rates=rows.find(r=>r.facet==='perHour'&&r.selector==='skill:*')?.perHour,factors=rows.find(r=>r.facet==='tierFactor')?.tierFactor;
 if(!rates||!factors)reject('E-LEARN-TABLE','The archived learning table is required');
 const hourly=fixedMultiply(fixedMultiply(fixedUnits(sourceKind==='teacher'?rates.taught:rates.practice),fixedUnits(factors[Math.floor(proficiency/300)])),fixedUnits((observed?.25:1)*multiplier));
 const maximum=fixedNumber(checkedFixed(hourly*BigInt(minutes)/60n));
 if(effect.amount!==undefined&&(!Number.isSafeInteger(effect.amount)||effect.amount<0||effect.amount>100000))reject('E-LEARN-AMOUNT','Learning amount is outside its native bound');
 engine.assertNpcObligationAction(d,[learner,...teacher?[source]:[]],{minutes,location:body.location,kind:'learn'});
 engine.assertNpcAutonomyAction(state,[learner,...teacher&&source!=='player'?[source]:[]],{minutes});
 advanceWithNpcParticipants(d,engine,minutes,child,[learner,...teacher&&source!=='player'?[source]:[]]);
 if(!canAct({...context,document:d.document},learner,'learn').allowed)reject('E-LEARN-ACTOR','The learner became unable to study');
 if(sourceKind==='book')studyBook(d,engine,learner,source,effect.subject);
 if(learner!==frame.actor)requireAuthority('learn',learner,{effect,until:d.get('state','minute')});
 if(teacher){
  const current=d.get('state');
  if((source==='player'?current.location:current.npcs?.[source]?.location)!==current.npcs[learner].location||!canAct({...context,document:d.document},source,'learn').allowed)reject('E-LEARN-SOURCE','The demonstration ended before study completed');
  if(!observed&&!teachingPermission(d.document,current.minute).allowed&&!serviceAt(current,current.minute))reject('E-LEARN-SOURCE','Instruction was withdrawn before study completed');
 }
 let result;
 if(kind==='skill'){
  const path=['state','npcs',learner,'skills',skill],raw=d.get(...path)??engine.byId.get(learner)?.skills?.[skill]??engine.byId.get(learner)?.proficiencies?.[skill];
  if(raw===undefined)d.set(path,{proficiency:0,breakthroughs:[],daily:{},source:{type:sourceKind,id:source}});
  const current=d.get('state'),growth=current.npcs[learner].growth??{},row=growth.skills?.[skill]??{base:proficiency,teach:0,work:0,sessions:0},day=Math.floor(current.minute/1440),today=growth.today?.day===day?growth.today:{day,teach:0,work:0},r=engine.rules.npcGrowth;
  const taught=sourceKind==='teacher',remaining=taught?(today.teach<r.teach.dailySessions?r.teach.gain:0):Math.max(0,r.work.dailyGain-today.work);
  const amount=Math.max(0,Math.min(effect.amount??maximum,maximum,remaining,r.maximumGain-(row.teach??0)-(row.work??0)));
  const cap=Math.min(ceiling,personCertified(engine,current,learner,skill)?r.maximumProficiency:r.uncertifiedMaximumProficiency??r.maximumProficiency);
  result=engine.practice(d,{skill,target:`primitive:${source}`},child,amount,learner,cap);
  d.set(['state','npcs',learner,'growth','skills',skill],{...row,[taught?'teach':'work']:(row[taught?'teach':'work']??0)+result.gain,sessions:row.sessions+1});
  d.set(['state','npcs',learner,'growth','today'],{...today,[taught?'teach':'work']:today[taught?'teach':'work']+(taught?1:result.gain)});
 }else{
  const key=`primitive_study:${digest({learner,subject:effect.subject,source})}`,old=d.get('state','records',key),effective=minutes*(observed?.25:1)*multiplier,total=Math.min(required,(old?.minutes??0)+effective),learned=total>=required;
  d.set(['state','records',key],{category:'primitive_study',learner,subject:effect.subject,source,minutes:total,required,lastAt:d.get('state','minute')});
  if(learned)d.set(['state','npcs',learner,kind==='spell'?'spells':'recipes',effect.subject],{source:{type:sourceKind,id:source},learnedAt:d.get('state','minute'),sourceEvent:child});
  result={subject:effect.subject,learned,studiedMinutes:total,required,gain:0};
 }
 return {...result,learner,minutes,sourceKind,observed,...(teacher?{teacher:source}:{}),...(permission?{permission}:{}),...(detection?{detection,noticedBy:detection.success?[]:[source]}:{})};
}
