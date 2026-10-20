// L1 runtime adapters. Limits are native derivations, never proposal fields.
import {reject} from './primitive-policy.mjs';
import {createEntity,setLocation,openHolding,declareHoldingWriter,templatesOf,isPhysicallyDead,isGone} from './holdings.mjs';
import {transition,executeProtocolPrimitive,applyProtocolJudgment} from './transition.mjs';
import {consent} from './action-consent.mjs';
import {capacity,canAct,actionEntity} from './action-capacity.mjs';
import {interactionOf} from './interactions.mjs';
import {personTeaching} from './entity-view.mjs';
import {npcProficiency} from './checks.mjs';
import {digest} from './storage.mjs';
import {normalize} from './retrieval.mjs';
import {fixedUnits,fixedNumber,fixedInteger,fixedMultiply,fixedDivide,checkedFixed} from './rx.mjs';
import {applyBodyVital,beginBodyActivity,endBodyActivity} from './primitives-body.mjs';
export {applyBodyVital} from './primitives-body.mjs';

declareHoldingWriter('primitives',{entities:['person','creature','item','building','mark'],locations:true,kinds:['owns']});
const integer=(n,min,max,code='E-PRIMITIVE-AMOUNT')=>{if(!Number.isSafeInteger(n)||n<min||n>max)reject(code,'Amount is outside the native bound');return n;};
const pathOf=(d,id)=>id==='player'?['state','player']:d.get('state','npcs',id)?['state','npcs',id]:d.get('state','creatures',id)?['state','creatures',id]:null;
const currentLocation=(d,id)=>id==='player'?d.get('state','location'):d.get('state','npcs',id,'location')??d.get('state','creatures',id,'location')??d.get('holdings','locations',id,'at');
const here=(d,actor,target)=>{const place=currentLocation(d,actor);if(!place||currentLocation(d,target)!==place)reject('E-PRIMITIVE-REACH','The target is not present');return place;};
function reach(d,engine,actor,target,range){
 const location=here(d,actor,target);
 if(target!==actor){
  const facts=engine.primitiveTargetFacts?.(d,actor,target);
  if(!facts||facts.lineOfSight!==true||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters<0||facts.distanceMeters>range)reject('E-PRIMITIVE-REACH','The target is out of reach or behind an obstruction');
 }
 return location;
}
function placeLimit(engine,d,location,op){
 const place=engine.byId.get(location)??d.get('state','created',location),limit=place?.primitiveLimits?.[op];
 if(limit===false||limit==='forbidden'||limit?.allowed===false)reject('E-PRIMITIVE-PLACE','This place prevents the effect');
 return limit;
}
function contested(d,engine,context,frame,target,scope,child,tags,{purpose=frame.source.id,until=d.get('state','minute'),checkId=null}={}){
 if(target===frame.actor)return {permission:{allowed:true,kind:'self',source:frame.eventId,tags:[],check:null}};
 let permission=consent({...context,document:d.document},target,frame.actor,scope,{purpose:context.consentPurpose??purpose,until});
 if(!permission.allowed&&context.consentPurpose&&context.consentPurpose!==purpose)permission=consent({...context,document:d.document},target,frame.actor,scope,{purpose,until});
 if(permission.allowed)return {permission};
 tags.push(...permission.tags);
 const previous=checkId===`${frame.eventId}:action-check`?d.get('state','checks',checkId):null;
 if(previous?.opponent?.npc===target)return {permission,check:previous,failed:!previous.success};
 if(target!=='player'&&!d.get('state','npcs',target))reject('E-PRIMITIVE-CONNECTOR','This opposed pair requires a person');
 const check=engine.primitiveCheck(d,{attribute:'精神',opponent:{npc:target,attribute:'精神'}},`${child}:consent`,frame.actor);
 return {permission,check,failed:!check.success};
}

export function executeRuntimeEffect(d,engine,effect,{frame,index,requireAuthority,tags},context,limits={}){
 const child=`${frame.eventId}:${index}`,now=d.get('state','minute'),actor=frame.actor;
 if(effect.op==='time'){
  const minutes=integer(effect.minutes,0,limits.time??0,'E-TIME-BOUND');
  if(!limits.costManaged)beginBodyActivity(d,engine,actor,'rest');
  engine.advance(d,minutes,child);
  if(!limits.costManaged)endBodyActivity(d,engine,actor);
  return {elapsed:minutes,minute:d.get('state','minute')};
 }
 if(effect.op==='move'){
  const entity=effect.entity??actor;
  if(effect.mount!==undefined&&entity==='player')reject('E-MOVE-MOUNT','Player boarding uses the existing pet mount action');
  if(entity!==actor){requireAuthority('move',entity);here(d,actor,entity);}
  if(typeof effect.to!=='string')reject('E-MOVE-DESTINATION','A registered destination is required');
  if(entity!=='player'){
   const permission=canAct({...context,document:d.document},entity,'move',{to:effect.to});
   if(!permission.allowed)reject('E-CAPACITY',permission.reason);
   tags.push(...permission.tags??[]);
   if(!limits.costManaged||entity!==actor)beginBodyActivity(d,engine,entity,'travel');
   const result=engine.primitiveMoveNpc(d,{entity,destination:effect.to,mode:effect.mode??'walk',mount:effect.mount},child);
   if(!limits.costManaged||entity!==actor)endBodyActivity(d,engine,entity);
   return result;
  }
  if(d.get('state','npcs',effect.to)||d.get('state','creatures',effect.to)||effect.to==='player'){
   if(!limits.costManaged)beginBodyActivity(d,engine,actor,'travel');
   const result=engine.primitiveMoveLocal(d,{entity,destination:effect.to,mode:effect.mode??'walk'},child);
   if(!limits.costManaged)endBodyActivity(d,engine,actor);
   return result;
  }
  const feature=engine.world.locations.some(l=>l.features?.some(f=>f.id===effect.to));
  if(feature&&effect.mode==='horse'){
   if(!limits.costManaged)beginBodyActivity(d,engine,actor,'travel');
   const result=engine.primitiveMoveLocal(d,{entity,destination:effect.to,mode:'horse'},child);
   if(!limits.costManaged)endBodyActivity(d,engine,actor);
   return result;
  }
  if(feature&&effect.mode!==undefined&&effect.mode!=='walk')reject('E-MOVE-MODE','Local approach uses walking or riding');
  const old=engine.npcObligationAction;engine.npcObligationAction=feature?{tool:'environment',args:{operation:'approach',target:effect.to}}:{tool:'move',args:{destination:effect.to,mode:effect.mode??'walk'}};
  try{
   if(!limits.costManaged)beginBodyActivity(d,engine,actor,'travel');
   const result=feature?engine.environment(d,{operation:'approach',target:effect.to},child):engine.move(d,{destination:effect.to,mode:effect.mode??'walk'},child);
   if(!limits.costManaged)endBodyActivity(d,engine,actor);
   return result;
  }finally{engine.npcObligationAction=old;}
 }
 if(effect.op==='vital'||effect.op==='status'){
  const target=effect.target,path=pathOf(d,target);
  if(!path||isPhysicallyDead(engine,d,target)||isGone(engine,d,target))reject('E-VITAL-TARGET','The target is not a living body');
  const bound=limits[effect.op];if(!bound)reject('E-PRIMITIVE-BOUND','A native effect bound is required');
  const location=reach(d,engine,actor,target,bound.rangeMeters??1.5),local=placeLimit(engine,d,location,effect.op);
  if(effect.op==='vital'){
   if(typeof effect.type==='string'&&effect.type.startsWith('body:')){
    if(target!==actor)reject('E-BODY-TARGET','Body needs require their own consumption action');
    return applyBodyVital(d,engine,actor,effect.type.slice(5),effect.delta,bound);
   }
   const delta=integer(effect.delta,-(bound.harm??0),bound.heal??0),cap=typeof local==='number'?local:local?.max;
   let amount=Math.min(Math.abs(delta),cap??Infinity);
   if(!Number.isSafeInteger(amount))reject('E-VITAL-BOUND','Invalid place effect bound');
   const adjudication=delta>0?contested(d,engine,context,frame,target,'healing',child,tags,{checkId:limits.consentChecks?.find(row=>row.target===target&&row.scope==='healing')?.id}):{};
   if(adjudication.failed)return {target,applied:false,...adjudication};
   if(!amount)return {target,delta:0,...adjudication};
   const type=effect.type??'physical',interaction=delta<0?interactionOf(engine,d.document,type,target):null;
   const finalCap=Math.min(delta<0?bound.harm:bound.heal,cap??Infinity);
   // The legacy magic writer applies K2 internally. Bound its input before it
   // writes health or runs lethal lifecycle hooks; clamping HP afterwards would
   // leave false deaths/loot. Resistance, armor and adaptation only reduce this.
   if(delta<0)amount=Math.min(amount,fixedInteger(fixedDivide(fixedUnits(finalCap),fixedUnits(Math.max(1,interaction?.multiplier??1)))));
   if(amount<1)return {target,applied:false,reason:'vital_limit_below_minimum',...adjudication};
   const result=engine.primitiveMagicEffect(d,{target,spec:{kind:delta>0?'heal':'damage',power:amount,...(delta<0?{damageType:type}:{})},source:frame.source.id,actor},child);
   if(result.effectFailed)reject('E-VITAL-TARGET',result.effectFailed);
   return {...result,interaction,...(amount<Math.abs(delta)?{trimmed:{reason:'final_vital_limit',requested:Math.abs(delta),power:amount,cap:finalCap}}:{}),...adjudication};
  }
  if(!bound.statuses?.includes(effect.status))reject('E-STATUS','The status is not supplied by this action');
  const duration=integer(effect.duration,1,bound.duration??0),power=integer(effect.magnitude,1,bound.magnitude??0);
  const mental=['fear','illusion','compulsion'].includes(effect.status),forced=effect.status==='compulsion';
  const scope=mental?'mind':'support_magic';
  const adjudication=contested(d,engine,context,frame,target,scope,child,tags,{until:now+duration,checkId:limits.consentChecks?.find(row=>row.target===target&&row.scope===scope)?.id});
  if(forced)tags.push('forced');
  if(adjudication.failed)return {target,applied:false,...adjudication};
  const result=engine.primitiveMagicEffect(d,{target,spec:{kind:'status',status:effect.status,power},duration,source:frame.source.id,actor},child);
  if(result.effectFailed)reject('E-STATUS',result.effectFailed);
  return {...result,...adjudication};
 }
 if(effect.op==='destroy'||effect.op==='transition'){
  const entity=effect.entity,types=templatesOf(d,entity,engine)??[];
  if(effect.op==='transition'&&['declared','declaration_revoked','insolvency'].includes(effect.cause)){
   const expected=effect.cause==='declaration_revoked'?'restored':'gone';
   if(effect.kind!==expected)reject('E-TRANSITION-KIND',`Judicial ${effect.cause} requires kind ${expected}`);
   const proof=requireAuthority('transition',entity,{effect}).sources.find(source=>source.kind==='judgment'&&source.case===effect.id);
   if(!proof)reject('E-TRANSITION-PROOF','A current court and authenticated judgment must establish this transition');
   const applied=d.get('holdings','protocol','judgments',proof.id),life=d.get('holdings','protocol','entities',entity);
   if(applied&&(effect.cause==='declared'&&!life?.gone||effect.cause==='declaration_revoked'&&life?.gone))reject('E-TRANSITION-PROOF','This judgment has been superseded by the current lifecycle state');
   const result=applyProtocolJudgment(d,engine,{id:proof.id,verb:'judgment',case:proof.case});
   if(!result)reject('E-TRANSITION-PROOF','The judgment no longer establishes this transition');
   return result;
  }
  if(!types.length||isGone(engine,d,entity))reject('E-TRANSITION-ENTITY','The entity is missing or already gone');
  const basis=effect.op==='destroy'?'destruction':effect.cause;
  if(effect.op==='transition'&&effect.kind!=='gone')reject('E-TRANSITION-KIND','A registered lifecycle transition is required');
  if(basis==='destruction'){
   if(!types.includes('thing')||types.includes('agent'))reject('E-DESTROY-KIND','Living bodies require vital effects');
   requireAuthority('destroy',entity);
   const location=currentLocation(d,entity),at=currentLocation(d,actor);
   if(location!==actor&&location!==at)reject('E-PRIMITIVE-REACH','The object is not present or carried');
  }else if(basis==='dissolution'){
   if(!types.includes('collective'))reject('E-TRANSITION-KIND','Dissolution requires an organization');
   // Executing the organization's actual approved resolution is the source,
   // not a proposal-supplied "approved" flag (05 §5.3 / 06 §6.3).
   const permission=requireAuthority('transition',entity,{effect});
   if(!permission.sources.some(source=>source.kind==='resolution'))reject('E-TRANSITION-PROOF','Dissolution requires a current approved execution resolution');
   return transition(d,engine,{entity,kind:'gone',basis,origin:'dissolution',eventId:child,location:currentLocation(d,entity),causes:[frame.eventId]});
  }else if(basis==='death'){
   const body=actionEntity({...context,document:d.document},entity);
   if(!types.includes('agent')||!Number.isFinite(body?.hp)||body.hp>0)reject('E-TRANSITION-PROOF','Death requires an actual lethal vital result');
   requireAuthority('transition',entity);
   if(entity==='player'){
    if(!Number.isSafeInteger(body.dyingSince)||now<body.dyingSince+engine.rules.death.dyingMinutes)reject('E-TRANSITION-PROOF','The dying interval has not elapsed');
    engine.death(d);
    return d.get('holdings','protocol','entities','player');
   }
  }else reject('E-TRANSITION-PROOF','A judgment or domain transition adapter must establish this transition');
  return transition(d,engine,{entity,kind:'gone',basis,origin:basis==='death'?'vital':'destruction',eventId:child,location:currentLocation(d,entity),causes:[frame.eventId]});
 }
 if(effect.op==='schedule'){
  const at=integer(effect.at,now+1,Number.MAX_SAFE_INTEGER,'E-SCHEDULE-TIME');
  const program=effect.rule===undefined?{op:'primitive.action',action:effect.action}:{op:'primitive.rule',rule:effect.rule};
  engine.primitiveValidateScheduledAction(d,{action:effect.action,rule:effect.rule,slots:effect.args??{}},actor);
  return executeProtocolPrimitive(d,engine,{op:'schedule',at,do:[{...program,slots:structuredClone(effect.args??{}),actor}]},{entity:actor,eventId:child});
 }
 if(effect.op==='learn'){
  const learner=effect.entity??actor;
  if(!limits.costManaged||learner!==actor)beginBodyActivity(d,engine,learner,'light');
  const result=learnEffect(d,engine,effect,{frame,child,tags,requireAuthority,context,limits});
  if(!limits.costManaged||learner!==actor)endBodyActivity(d,engine,learner);
  return result;
 }
 if(effect.op==='create')return createNarrative(d,engine,effect,{frame,child,context,limits});
 reject('E-PRIMITIVE-CONNECTOR',`Missing primitive connector: ${effect.op}`);
}

function learnEffect(d,engine,effect,{frame,child,tags,requireAuthority,context,limits}){
 const learner=effect.entity??frame.actor;
 if(learner!=='player')return engine.primitiveLearnNpc(d,effect,{frame,child,tags,requireAuthority,context,limits});
 if(learner!==frame.actor)requireAuthority('learn',learner,{effect});
 const subject=engine.byId.get(effect.subject),old=d.get('state','skills',effect.subject);
 if(!subject)reject('E-LEARN-SUBJECT','Learning subject is not registered');
 // Initial acquisition keeps the existing prerequisite, book, fee, time and
 // research proof checks. Person willingness is additionally checked here.
 const source=effect.learningSource,person=d.get('state','npcs',source);
 if(source==='practice'&&!old)reject('E-LEARN-SOURCE','Practice requires a known skill');
 let permission,detection,observed=false;
 if(person){
  here(d,frame.actor,source);
  if(capacity({...context,document:d.document},source,'learn').level==='none'||person.scheduleTravel||person.cognitionTravel)reject('E-LEARN-SOURCE','The teacher cannot currently teach');
  if(!personTeaching(engine,d.get('state'),source,effect.subject)&&npcProficiency(d,engine,source,subject.skill??subject.id)<1)reject('E-LEARN-SOURCE','The source does not know how to demonstrate this subject');
   // First acquisition belongs to learning.learn: it validates the actual
   // teacher/service, prerequisites, price and duration before deciding once.
   if(!old){
    if(effect.amount!==undefined)reject('E-LEARN-AMOUNT','First acquisition uses the registered learning protocol');
    return engine.learn(d,{entity:effect.subject,source,kind:subject.id.split('_')[0]},child);
   }
   const minutes=integer(limits.learn?.minutes,1,43200,'E-LEARN-BOUND'),until=d.get('state','minute')+minutes;
  permission=consent({...context,document:d.document},source,learner,'teach',{purpose:effect.subject,until});
  if(!permission.allowed&&context.consentPurpose)permission=consent({...context,document:d.document},source,learner,'teach',{purpose:context.consentPurpose,until});
   if(!permission.allowed)permission=engine.primitiveTeachingConsent(d,{teacher:source,student:learner,subject:effect.subject,minutes,fee:0,eventId:child});
   if(!permission.allowed){
   const activity=person.activity??'',skill=person.practicing??person.teaching;
   if(skill!==effect.subject||!/(练|教|演|practice|teach)/.test(activity))reject('E-LEARN-OBSERVE','There is no observable demonstration of this subject');
   const facts=engine.primitiveTargetFacts(d,frame.actor,source);
   if(!facts?.lineOfSight||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters>30)reject('E-LEARN-OBSERVE','The demonstration is not actually visible');
   observed=true;tags.push('unconsented');
   detection=engine.check(d,{attribute:'敏捷',opponent:{npc:source,attribute:'精神'}},`${child}:notice`);
  }
 }
 if(old){
  const bound=limits.learn;if(!bound)reject('E-LEARN-BOUND','Practice requires a native learning/time bound');
  const minutes=integer(bound.minutes,1,43200),tables=engine.world.primitiveTables?.learning?.rows??[],stage=Math.floor(old.proficiency/300);
  const rates=tables.find(r=>r.facet==='perHour'&&r.selector==='skill:*')?.perHour,factors=tables.find(r=>r.facet==='tierFactor')?.tierFactor;
  if(!rates||!factors)reject('E-LEARN-TABLE','The archived learning table is required');
  let sourceKind=source==='practice'?'practice':person?'teacher':null;
  if(!sourceKind){
   const instance=d.get('state','itemInstances',source),bookId=instance?.item??source,definition=engine.byId.get(bookId),book=instance?.book??definition?.book;
   if(book){
    if(!(book.teaches??[]).includes(effect.subject)||(instance?instance.owner!=='player'||instance.status!=='持有'||instance.durability===0:engine.quantity(d,'player',bookId)<1||d.get('state','inventory',bookId,'durability')===0))reject('E-LEARN-SOURCE','The required book is not actually held and readable');
    if((d.get('state','skills','skill_literacy','proficiency')??0)<engine.rules.books.minimumLiteracy)reject('E-LEARN-LITERACY','The learner cannot read this book');
    sourceKind='book';
   }else{
    const project=d.get('state','projects',source);
    if(project?.type==='研究'&&project.stage==='打磨'&&project.result===effect.subject&&subject.source===source)sourceKind='research';
   }
  }
  if(!sourceKind)reject('E-LEARN-SOURCE','There is no real learning source');
  const multiplier=bound.multiplier??1;
  if(!Number.isFinite(multiplier)||multiplier<0||multiplier>2)reject('E-LEARN-BOUND','Invalid native learning degree');
  const hourly=fixedMultiply(fixedMultiply(fixedUnits(person?rates.taught:rates.practice),fixedUnits(factors[stage])),fixedUnits(observed?.25:1));
  const ceiling=fixedNumber(checkedFixed(fixedMultiply(hourly,fixedUnits(multiplier))*BigInt(minutes)/60n));
  const requested=effect.amount===undefined?ceiling:integer(effect.amount,0,100000),gain=Math.min(requested,ceiling);
  engine.advance(d,minutes,child);
  if(person&&(currentLocation(d,source)!==currentLocation(d,learner)||capacity({...context,document:d.document},source,'learn').level==='none'))reject('E-LEARN-SOURCE','The demonstration ended before the study period was complete');
  const result=engine.practice(d,{skill:effect.subject,target:`primitive:${source}`},child,gain);
  return {...result,minutes,observed,sourceKind,...(person?{teacher:source}:{}),...(permission?{permission}:{}),...(detection?{detection,noticedBy:detection.success?[]:[source]}:{})};
 }
 if(observed)reject('E-LEARN-OBSERVE','A first acquisition from observation requires its reduced-rate adapter');
 if(effect.amount!==undefined)reject('E-LEARN-AMOUNT','First acquisition uses the registered learning protocol');
 return engine.learn(d,{entity:effect.subject,source,kind:subject.id.split('_')[0]},child);
}

// This is registration of a named narrative fact, never a stock/resource mint.
// Recipe manufacture, population individuation and mark reactions belong to
// their domain adapters and cannot be smuggled through these generic templates.
function createNarrative(d,engine,effect,{frame,child,limits={}}){
 if(effect.kind==='mark')return engine.primitiveApplyMark(d,effect,{frame,child});
 const crude=limits.improvised===true&&frame.source.kind==='open'&&effect.kind==='item'&&effect.facts?.quality==='crude';
 const templates=engine.world.primitiveTemplates??[],template=templates.find(t=>t.id===(crude&&effect.template==='thing'?'core:item':effect.template)&&t.kind===effect.kind);
 if(!template)reject('E-CREATE-TEMPLATE','A core narrative template is required');
 const facts=effect.facts;
 if(!facts||typeof facts!=='object'||Array.isArray(facts)||Object.keys(facts).some(k=>!template.fields.includes(k)&&!(crude&&['quality','author','location'].includes(k)))||typeof facts.name!=='string'||!facts.name.trim()||facts.name.length>100||Object.values(facts).some(v=>typeof v!=='string'||v.length>1200))reject('E-CREATE-FACT','Only the narrative template facts may be registered');
 if(effect.materials?.length&&!crude||effect.population!==undefined)reject('E-CREATE-MATERIALS','Valued manufacture and individuation require their resource adapter');
 const location=currentLocation(d,frame.actor),limit=placeLimit(engine,d,location,'create');
 if(limit==='mark_only'||limit?.mode==='mark_only')reject('E-CREATE-PLACE','Only a trace can be left at this place');
 const name=facts.name.trim(),key=normalize(name),names=[...engine.byId.values(),d.get('state','player'),...Object.values(d.get('state','npcs')??{}),...Object.values(d.get('state','creatures')??{}),...Object.values(d.get('state','created')??{}),...Object.values(d.get('holdings','entities')??{}).map(e=>e.facts)];
 if(names.some(e=>normalize(e?.name??'')===key||e?.aliases?.some(alias=>normalize(alias)===key)))reject('E-CREATE-NAME','This name is already registered');
 const id=`${effect.kind}_${digest({eventId:frame.eventId,child}).slice(0,32)}`;
 const nativeFacts={...facts,name,author:frame.actor,...(crude?{quality:'crude',durability:10,location}: {})};
 createEntity(d,{id,kind:effect.kind,facts:nativeFacts,source:frame.source.id,writer:'primitives',eventId:child});
 setLocation(d,{entity:id,at:location,mode:'place',writer:'primitives',eventId:child,engine});
 // The authoritative object remains in holdings. The legacy resolver only
 // receives descriptive fields; there is no bag, balance, HP or numeric value.
 d.set(['state','created',id],{id,kind:effect.kind,...nativeFacts,name,location,scope:location,author:frame.actor,template:template.id});
 if(['item','building'].includes(effect.kind))openHolding(d,{kind:'owns',holder:frame.actor,subject:id,terms:{share:1},writer:'primitives',eventId:child,engine});
 return {entity:id,template:template.id,location};
}
