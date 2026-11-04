// L1 runtime adapters. Limits are native derivations, never proposal fields.
import {reject} from './primitive-policy.mjs';
import {createEntity,setLocation,openHolding,closeHolding,aliveHoldings,declareHoldingWriter,templatesOf,isPhysicallyDead,isGone,holdingSet} from './holdings.mjs';
import {physicalLocation,changeItems,trackTransferUnit} from './items.mjs';
import {placed} from './stock.mjs';
import {advanceHook} from './advance-hooks.mjs';
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
import {demonstrationAt,teachingAvailable} from './education-state.mjs';
import {studyBook} from './primitives-learning.mjs';
import {moveCoins,purse} from './money.mjs';
export {applyBodyVital} from './primitives-body.mjs';

declareHoldingWriter('primitives',{entities:['person','creature','item','building','mark'],locations:true,kinds:['owns']});
const integer=(n,min,max,code='E-PRIMITIVE-AMOUNT')=>{if(!Number.isSafeInteger(n)||n<min||n>max)reject(code,'Amount is outside the native bound');return n;};
const pathOf=(d,id)=>id==='player'?['state','player']:d.get('state','npcs',id)?['state','npcs',id]:d.get('state','creatures',id)?['state','creatures',id]:null;
const currentLocation=(d,id)=>physicalLocation(d,null,id);
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

// Creatures a herd stock adapter led out in one frame; create(creature) in the
// same proposal names them, it never makes a living body from nothing.
const individuated=new WeakMap();
export function executeRuntimeEffect(d,engine,effect,{frame,index,requireAuthority,tags},context,limits={}){
 const child=`${frame.eventId}:${index}`,now=d.get('state','minute'),actor=frame.actor;
 if(effect.op==='transfer'&&effect.to?.startsWith('sink:individuated|')){
  const herd=d.get('state','records',`husbandry:${effect.from.split('|')[0]}`);
  if(!herd)reject('E-TRANSFER-SINK','只有畜群的头数能牵出成为个体');
  if(currentLocation(d,actor)!==herd.location)reject('E-PRIMITIVE-REACH','畜群不在眼前');
  const individuateHerd=advanceHook('individuateHerd');if(!individuateHerd)reject('E-PRIMITIVE-CONNECTOR','畜牧未启用，不能从畜群中牵出个体');
  const ids=individuateHerd(d,engine,{population:herd.id,count:integer(effect.qty,1,herd.count),eventId:child});
  individuated.set(frame,[...individuated.get(frame)??[],...ids]);
  return {population:herd.id,individuated:ids};
 }
 if(effect.op==='create'&&effect.kind==='creature'){
  const pool=individuated.get(frame)??[],id=pool.find(id=>d.get('state','creatures',id)?.species===effect.template);
  if(!id)reject('E-CREATE-CREATURE','活体不能凭空造出：须从自家畜群中牵出，或经繁育出生');
  individuated.set(frame,pool.filter(row=>row!==id));
  return {entity:id,individuated:true};
 }
 if(effect.op==='time'){
  const minutes=integer(effect.minutes,0,limits.time??0,'E-TIME-BOUND');
  if(!limits.costManaged)beginBodyActivity(d,engine,actor,'rest');
  engine.advance(d,minutes,child);
  if(!limits.costManaged)endBodyActivity(d,engine,actor);
  return {elapsed:minutes,minute:d.get('state','minute')};
 }
 if(effect.op==='move'){
  // Dropping "one of the X I carry" names a stack; it lets go of one unit of it.
  const named=effect.entity??actor,stack=effect.mode==='drop'&&!d.get('state','itemInstances',named)&&engine.byId.get(named)&&engine.quantity(d,actor,named)>0;
  const entity=stack?trackTransferUnit(d,engine,actor,named,child):named;
  if(effect.mount!==undefined&&entity==='player')reject('E-MOVE-MOUNT','Player boarding uses the existing pet mount action');
  if(entity!==actor){requireAuthority('move',entity);here(d,actor,entity);}
  if(typeof effect.to!=='string')reject('E-MOVE-DESTINATION','A registered destination is required');
  if(effect.mode==='place'){
   const object=d.get('holdings','entities',entity),at=d.get('holdings','locations',entity),location=currentLocation(d,actor);
   if(object?.kind!=='item'||object.goneAt!==undefined||at?.mode!=='carried'||at.at!==actor||!location||effect.to!==location)reject('E-MOVE-PLACE','只能在当前地点放下本人携带的原物件');
   placeLimit(engine,d,location,'move');
   setLocation(d,{entity,at:location,mode:'place',writer:'primitives',eventId:child,engine});
   return {entity,destination:location,mode:'place'};
  }
  if(effect.mode==='drop'){
   // Abandonment (K7): the owner lets go of a carried unit where they stand.
   // It leaves the pack for this place's placed stock and has no owner.
   const unit=d.get('state','itemInstances',entity),location=currentLocation(d,actor);
   if(!unit||unit.status!=='持有'||unit.owner!==actor||!location||effect.to!==location)reject('E-MOVE-DROP','只能在当前地点丢下本人携带的自有物件');
   placeLimit(engine,d,location,'move');
   changeItems(d,engine,actor,unit.item,-1,{preserve:true,selection:[entity],books:{account:placed(engine,location,unit.item),writer:'primitives',eventId:child}});
   for(const row of aliveHoldings(d,{kind:'owns',subject:entity}))closeHolding(d,{id:row.id,reason:'released',writer:'primitives',eventId:child});
   holdingSet(d,null,['state','itemInstances',entity],{...d.get('state','itemInstances',entity),owner:null,status:'落地',location,droppedAt:now,abandonedBy:actor},'primitives');
   setLocation(d,{entity,at:location,mode:'place',writer:'primitives',eventId:child,engine});
   return {entity,destination:location,mode:'drop',abandoned:true};
  }
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
  // Destroying "one of the X I carry" names a stack; it destroys one unit of it.
  const stack=effect.op==='destroy'&&typeof effect.entity==='string'&&!d.get('state','itemInstances',effect.entity)&&engine.byId.get(effect.entity)&&engine.quantity(d,actor,effect.entity)>0;
  const entity=stack?trackTransferUnit(d,engine,actor,effect.entity,child):effect.entity,types=templatesOf(d,entity,engine)??[];
  // A herd is a stock of living bodies, not one destructible manufactured
  // object. Its losses must settle the same population and resource accounts.
  // Its owner leads head out through the stock adapter (transfer → sink:individuated)
  // and kills individuals; a living herd is never wiped out as an object.
  if(d.get('holdings','entities',entity,'kind')==='population')reject('E-POPULATION-ADAPTER','活的畜群不能当器物毁掉：先从群里牵出个体，再逐只宰杀');
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
   // A registered unit in a pack leaves that pack's stock for the destruction sink.
   const unit=d.get('state','itemInstances',entity);
   if(unit?.status==='持有'&&unit.owner){
    changeItems(d,engine,unit.owner,unit.item,-1,{preserve:true,selection:[entity],books:{flow:'sink:destroy',purpose:'destruction',writer:'primitives',eventId:child}});
    holdingSet(d,null,['state','itemInstances',entity],{...d.get('state','itemInstances',entity),status:'已毁',destroyedAt:now},'primitives');
   }
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
  const fee=limits.studyFee??0;
  permission=!limits.observeOnly&&teachingAvailable(engine,d.get('state'),source,until)?consent({...context,document:d.document},source,learner,'teach',{purpose:effect.subject,terms:{fee,minutes},until}):{allowed:false,kind:limits.observeOnly?'observation':'busy'};
  if(!permission.allowed&&!limits.observeOnly&&context.consentPurpose)permission=consent({...context,document:d.document},source,learner,'teach',{purpose:context.consentPurpose,until});
   if(!permission.allowed&&!limits.observeOnly)permission=engine.primitiveTeachingConsent(d,{teacher:source,student:learner,subject:effect.subject,minutes,fee,eventId:child});
   if(!permission.allowed){
   const activity=person.activity??'',skill=person.practicing??person.teaching;
   const timed=demonstrationAt(engine,d.get('state'),source,effect.subject,until);
   if(!timed&&(skill!==effect.subject||!/(练|教|演|practice|teach)/.test(activity)||Object.values(d.get('state','records')??{}).some(r=>r.category==='education_demonstration'&&r.actor===source)))reject('E-LEARN-OBSERVE','There is no observable demonstration of this subject');
   const facts=engine.primitiveTargetFacts(d,frame.actor,source);
   if(!facts?.lineOfSight||!Number.isFinite(facts.distanceMeters)||facts.distanceMeters>30)reject('E-LEARN-OBSERVE','The demonstration is not actually visible');
   observed=true;tags.push('unconsented');
   detection=engine.check(d,{attribute:'敏捷',opponent:{npc:source,attribute:'精神'}},`${child}:notice`);
  }
  if(!observed&&limits.studyFee!==undefined)engine.primitiveAssertTeachingService(d,source,minutes);
  if(!observed&&fee){
   moveCoins(d,{from:purse(null,'player'),to:purse(null,source),amount:fee,writer:'learning',eventId:child});
   d.set(['state','player','coins'],d.get('state','player','coins')-fee);
   d.set(['state','npcs',source,'coins'],d.get('state','npcs',source,'coins')+fee);
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
    studyBook(d,engine,'player',source,effect.subject);
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
  if(person&&!observed&&['given','proxy'].includes(permission?.kind)&&!consent({...context,document:d.document},source,learner,'teach',{purpose:effect.subject,terms:{fee:limits.studyFee??0,minutes},until:d.get('state','minute')}).allowed)reject('E-LEARN-SOURCE','Instruction was withdrawn before study completed');
  if(sourceKind==='book')studyBook(d,engine,'player',source,effect.subject);
  const result=engine.practice(d,{skill:effect.subject,target:`primitive:${source}`},child,gain,'player',bound.ceiling??2699);
  return {...result,entity:effect.subject,source:{type:sourceKind,id:source},cost:observed?0:limits.studyFee??0,minutes,observed,sourceKind,...(person?{teacher:source}:{}),...(permission?{permission}:{}),...(detection?{detection,noticedBy:detection.success?[]:[source]}:{})};
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
 const crude=limits.improvised===true&&effect.kind==='item'&&['crude',limits.quality].includes(effect.facts?.quality);
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
 const nativeFacts={...facts,name,author:frame.actor,...(crude?{quality:limits.quality??'crude',durability:({crude:10,ordinary:30,fine:50})[limits.quality]??10,location}: {})};
 createEntity(d,{id,kind:effect.kind,facts:nativeFacts,source:frame.source.id,writer:'primitives',eventId:child});
 setLocation(d,{entity:id,at:location,mode:'place',writer:'primitives',eventId:child,engine});
 // The authoritative object remains in holdings. The legacy resolver only
 // receives descriptive fields; there is no bag, balance, HP or numeric value.
 holdingSet(d,engine,['state','created',id],{id,kind:effect.kind,...nativeFacts,name,location,scope:location,author:frame.actor,template:template.id},'primitives',child);
 if(['item','building'].includes(effect.kind))openHolding(d,{kind:'owns',holder:frame.actor,subject:id,terms:{share:1},writer:'primitives',eventId:child,engine});
 return {entity:id,template:template.id,location};
}
