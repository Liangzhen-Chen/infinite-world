// L1 composition of primitive transactions with the existing resource and
// obligation protocols. Only native callers supply frames and runtime options.
import {createActionPrimitiveFrame,authority,validMandateScope,mandateParent} from './action-authority.mjs';
import {canAct,legacyCanAct,legacyActionFamily} from './action-capacity.mjs';
import {commitPrimitives,commitPrimitiveConsequences,planPrimitives,queuePrimitiveProposal,registerPrimitiveActionRuntime,createPrimitiveFrame,recordResourceCosts} from './primitives.mjs';
import {reject} from './primitive-policy.mjs';
import {parseAccount,isSink,LEDGER_COIN} from './ledger.mjs';
import {partyAccount,mirrorPartyCoins} from './money.mjs';
import {BOOKED} from './stock.mjs';
import {changeItems} from './items.mjs';
import {openObligation,settleObligation,closeObligation} from './obligation-protocol.mjs';
import {obligationRow} from './obligation-state.mjs';
import {loadActionRegistry,actionCall,findAction,actionOfCall} from './action-registry.mjs';
import {legalCodeAt,legalCodeById} from './law-codes.mjs';
import {personOffices,personLawRoles} from './entity-view.mjs';
import {aliveHoldings,holdingKind,ensureHoldings,isPhysicallyDead,isGone} from './holdings.mjs';
import {actionReader} from './action-capacity.mjs';
import {compileRX,evaluateRX,fixedUnits,fixedNumber,fixedInteger,fixedMultiply,fixedDivide,checkedFixed} from './rx.mjs';
import {createRXLibrary} from './rx-library.mjs';
import {consent,applyConsentEvent} from './action-consent.mjs';
import {executeRuntimeEffect} from './primitives-effects.mjs';
import {publishTransitionEvent,SOCIAL_VERBS,privateWorldEvent,drainWorldReactions} from './world-events.mjs';
import {accountKey} from './ledger.mjs';
import {digest,applyPatches,recordsWhere} from './storage.mjs';
import {bodyFact,readBodyState,writeBodyNeed,beginBodyActivity} from './primitives-body.mjs';
import {normativeAuthoritySources} from './action-authority-sources.mjs';
import {moveLocally} from './primitives-movement.mjs';
import {checkActor} from './primitives-checks.mjs';
import {learnNpc,studyBook} from './primitives-learning.mjs';
import {primitiveRuleRegistry} from './primitive-rules.mjs';
import {subjectiveView} from './subjective-view.mjs';
import {applyMarkPrimitive,executeLeaveMark,prepareMarkEffects} from './mark-actions.mjs';
import {reactToMark} from './mark-reactions.mjs';
import {executeRite,riteProjectInterruptions,settleRiteInterruptions} from './action-rite.mjs';
import {registerAdvanceHook} from './advance-hooks.mjs';
import {beginSleep,finishSleep} from './body-needs.mjs';
import {openUsageEntry} from './action-limits.mjs';
import {resolvePrimitiveTransfer,primitiveStockProjection} from './primitive-accounts.mjs';
import {ensureGroupAccount} from './group-account.mjs';
import {holdingSet,declareHoldingWriter} from './holdings.mjs';
declareHoldingWriter('primitives-runtime',{kinds:['owns','contains']});
import {adaptLegacyExecution,legacyReceiptKey,legacyIdentity} from './legacy-primitives.mjs';
import {familyDegree,degreeFamily,degreeConsequences,finishDegreeConsequences} from './action-degrees.mjs';

// B supplies current-world visibility, slots and source bounds at the native
// composition root. This function is never read from proposal JSON or saves.
let openContextFactory=null;
export function registerOpenActionContext(factory){
 if(factory!==null&&typeof factory!=='function')throw TypeError('Expected native open-action context factory');
 const previous=openContextFactory;openContextFactory=factory;return previous;
}
const proposalRouting=(proposal,prepared)=>({intent:proposal.intent,proposal:structuredClone(proposal),...structuredClone(prepared)});

export function primitiveClaims(engine,document,effects){
 const claims=new Map(),draw=new Map(),occupancy=new Map(),d=actionReader(document);
 for(const raw of effects){
  const effect=resolvePrimitiveTransfer(engine,document,raw);
  if(effect.op==='transfer'){
   const target=`account:${effect.from}`,old=claims.get(target),needed=(draw.get(effect.from)??0)+effect.qty;
   draw.set(effect.from,needed);draw.set(effect.to,(draw.get(effect.to)??0)-effect.qty);
   claims.set(target,{target,targetKind:'resource',quantity:Math.max(old?.quantity??0,needed),capacity:document.ledger?.accounts?.[effect.from]??0});
  }
  if(effect.op==='holding.close'){
   const row=document.holdings?.rows?.[effect.holding??effect.id];
   if(row){const target=`holding:${row.kind}:${row.subject}`;occupancy.set(target,(occupancy.get(target)??0)-1);}
  }
  if(effect.op==='holding.open'){
   const kind=holdingKind(effect.holdingKind),variant=kind?.variants?.[effect.variant];
   if(!kind)reject('E-HOLDING-KIND','Unknown holding kind');
   if(!kind.exclusive&&!kind.capacity&&!variant?.contest)continue;
   const total=kind.exclusive?1:engine.byId.get(effect.subject)?.[kind.capacity]??document.state.created?.[effect.subject]?.[kind.capacity];
   if(!Number.isSafeInteger(total))reject('E-PRIMITIVE-CONNECTOR','Missing holding capacity');
   const target=`holding:${kind.id}:${effect.subject}`,old=claims.get(target),needed=(occupancy.get(target)??0)+1;
   occupancy.set(target,needed);
   claims.set(target,{target,targetKind:kind.id,contest:variant?.contest??kind.contest,quantity:Math.max(old?.quantity??0,needed),capacity:Math.max(0,total-aliveHoldings(d,{kind:kind.id,subject:effect.subject}).length)});
  }
 }
 return [...claims.values()].filter(claim=>claim.quantity>0);
}

export function primitiveContext(engine,document,{source=null,identity=null,eventId=null}={}){
  return {engine,document,rescaleConsent:({document,actor,holder,subject})=>consent({engine,document},holder,actor,'property',{purpose:`holding.rescale:${subject}`,onRefusal:'abort'}),authoritySources:({actor,op,target,kind,holding,effect,document:current})=>{
  const state=current.state,location=actor==='player'?state.location:state.npcs?.[actor]?.location;
  const sources=[];
   if(op==='transition'&&effect?.id){
    const row=state.records?.[effect.id],judgment=row?.judgment,record=judgment?.eventId&&state.records?.[`world_event:${judgment.eventId}`],law=row?.law&&legalCodeById(engine,row.law,state);
    if(row?.category==='legal_case'&&row.status==='已裁定'&&(row.subject??row.offender)===target&&judgment?.effect===effect.cause&&record?.verb==='judgment'&&record.id===judgment.eventId&&record.case===effect.id&&record.target===target&&record.actor===judgment.judge&&law&&location===law.court&&personLawRoles(engine,state,actor,law).includes('judge'))sources.push({kind:'judgment',id:judgment.eventId,case:effect.id,law:law.id,version:digest({row,law,record}),allowed:true});
   }
  for(const office of personOffices(engine,state,actor)){
   // Existing powers are scoped to their settlement, never universal money access.
   if(office.value.settlement===target&&office.value.powers?.includes(op))sources.push({kind:'office',id:office.source,version:digest(office.value),allowed:true});
  }
  const code=legalCodeAt(engine,location,state),legalKind=kind??holding?.kind;
  if(code&&['holding.open','holding.close'].includes(op)&&(['wanted','banished','frozen'].includes(legalKind)||legalKind==='guest_of')){
   const targetLocation=holding?.subject??target;
   const roles=personLawRoles(engine,state,actor,code);
   if((code.locations.includes(targetLocation)||targetLocation===code.court||targetLocation===code.settlement||targetLocation===code.faction)&&roles.length){
    const record=holding?.source?.startsWith('custody:')?state.records?.[holding.source.slice(8)]:null,expired=(record?.expires??holding?.terms?.until??Infinity)<=state.minute;
    sources.push({kind:'law',id:code.id,role:roles[0],version:digest(code),allowed:true,...(op==='holding.close'&&!expired?{tags:['offense:unlawful_release']}:{})});
   }
  }
  // S3's actual, revocable authorizations are not proposal-supplied actedAs.
  for(const [id,row] of Object.entries(state.records??{})){
   if(row.category!=='authorization'||row.grantee!==actor||row.grantor!==target||row.revoked||row.endedAt!==undefined||(row.since??row.createdAt??0)>state.minute||(row.expires??Infinity)<=state.minute)continue;
   const operation=op==='obligation.settle'?'payment':op.startsWith('obligation.')?'contract':op;
   if(row.action===operation||row.actions?.includes(operation))sources.push({kind:'authorization',id,source:id,version:digest(row),allowed:true});
  }
  sources.push(...normativeAuthoritySources({engine,document:current},{actor,op,target,code,roles:code?personLawRoles(engine,state,actor,code):[],source,identity,eventId}));
  return sources;
 }};
}

// Mirror only supported projections. Unsupported storage purposes fail before
// a patch escapes, rather than leaving a second truth or repairing ledger drift.
export function mirrorPrimitiveTransfer(d,engine,effect){
 const from=parseAccount(effect.from),to=parseAccount(effect.to),sink=isSink(to.owner);
 if(from.resource===LEDGER_COIN){
  if(effect.from!==partyAccount(engine,d.get('state'),from.owner)||!sink&&effect.to!==partyAccount(engine,d.get('state'),to.owner))reject('E-TRANSFER-PROJECTION','This account requires its resource adapter');
  mirrorPartyCoins(d,engine,from.owner,-effect.qty,effect.eventId,'primitives');
  if(!sink)mirrorPartyCoins(d,engine,to.owner,effect.qty,effect.eventId,'primitives');
  return;
 }
 const source=primitiveStockProjection(engine,d.get('state'),effect.from),destination=sink?null:primitiveStockProjection(engine,d.get('state'),effect.to);
 const instances=d.get(...source.path)?.instances??[];
 if(instances.length&&destination&&!destination.inventory)reject('E-TRANSFER-PROJECTION','带单件身份的物品须通过保留单件归属的仓储协议转移');
 const change=(projection,owner,delta)=>{
  if(projection.inventory)return changeItems(d,engine,owner,projection.item,delta,{preserve:!sink,books:BOOKED});
  if(projection.group)ensureGroupAccount(d,engine,projection.group);
  const value=(d.get(...projection.path)??0)+delta;
  if(!Number.isSafeInteger(value)||value<0)reject('E-TRANSFER-BALANCE','库存不足或溢出');
  if(projection.path[1]==='records')holdingSet(d,engine,projection.path,value,'primitives-runtime',effect.eventId);
  else d.set(projection.path,value);
  return {instances:[]};
 };
 const moved=change(source,from.owner,-effect.qty);
 if(!sink){
  change(destination,to.owner,effect.qty);
  if(moved.instances.length){
   const path=[...engine.bagPath(to.owner),destination.item,'instances'];
   d.set(path,[...d.get(...path)??[],...moved.instances]);
   for(const id of moved.instances)holdingSet(d,engine,['state','itemInstances',id,'owner'],to.owner,'primitives-runtime',effect.eventId);
  }
 }
}

export function createRuntimePrimitiveFrame(engine,document,{actor='player',eventId,source,createDraft,factPolicy=engine.world.primitiveFacts??{},verbs=['tell','request','claim','consent_given','consent_revoked'],validate=null,limits={},prepare=null,finish=null,identity=null,purpose=source?.id,movementAuthority=null,consequence=null}={}){
 const context=primitiveContext(engine,document,{source,identity,eventId});
 context.consentPurpose=purpose;
 if(movementAuthority!==null&&typeof movementAuthority!=='function')reject('E-PRIMITIVE-FRAME','Movement authority must be a native derivation');
 context.movementAuthority=movementAuthority;
 if(typeof limits!=='function')limits=structuredClone(limits);
 const declared=source?.kind==='catalog'?findAction(primitiveRuntime.registry(engine),source.id):null;
 {
  const base=context.authoritySources;
  context.authoritySources=options=>{
   const sources=base(options),current=options.document,checkId=`${eventId}:action-check`,check=current.state.checks?.[checkId],effect=options.effect;
   if(options.op==='transfer'&&effect&&options.target!==actor){
    for(const scope of ['property','transfer']){
     let permission=consent({...context,document:current},options.target,actor,scope,{purpose,onRefusal:'abort'});
     if(!permission.allowed&&purpose!==source.id)permission=consent({...context,document:current},options.target,actor,scope,{purpose:source.id,onRefusal:'abort'});
     if(permission.allowed){sources.push({kind:'consent',id:permission.source,allowed:true});break;}
    }
   }
   if(options.op==='learn'&&effect&&options.target!==actor){
    const bound=typeof limits==='function'?limits(current):limits,until=options.until??current.state.minute+(bound.learn?.minutes??0);
    let permission=consent({...context,document:current},options.target,actor,'learn',{purpose:effect.subject,until,onRefusal:'abort'});
    if(!permission.allowed)permission=consent({...context,document:current},options.target,actor,'learn',{purpose,until,onRefusal:'abort'});
    if(permission.allowed)sources.push({kind:'consent',id:permission.source,allowed:true});
   }
   if(declared?.theft===true&&options.op==='transfer'&&effect&&check?.success===true&&parseAccount(effect.to).owner===actor&&options.target!==actor){
    const facts=engine.primitiveTargetFacts({...actionReader(current),document:current},actor,options.target);
    if(facts?.lineOfSight===true&&facts.distanceMeters>=0&&facts.distanceMeters<=1.5)sources.push({kind:'theft',id:checkId,allowed:true,tags:['unconsented','theft']});
   }
   return sources;
  };
 }
 createDraft??=doc=>engine.primitiveDraft(doc);
 const makeDraft=createDraft;
 createDraft=doc=>{const d=makeDraft(doc);ensureHoldings(d,engine);return d;};
 const factUsage=new Map();
 return createActionPrimitiveFrame(context,{actor,eventId,source,createDraft,factPolicy,verbs,validate,finish,identity,consequence,
  validateFact:(d,effect,{row,value})=>{
   if(typeof value!=='number')return;
   const bound=(typeof limits==='function'?limits(d.document):limits).fact?.[effect.field];
   const change=Math.abs(value-(row.facts?.[effect.field]??0)),used=(factUsage.get(effect.field)??0)+change;
   if(!Number.isSafeInteger(bound)||bound<0||!Number.isSafeInteger(used)||used>bound)reject('E-FACT-BOUND','Fact work exceeds its native source bound');
   factUsage.set(effect.field,used);
  },
  prepare:(d,meta)=>{
   factUsage.clear();
   const normalize=effects=>effects.map(effect=>resolvePrimitiveTransfer(engine,d.document,effect,{actor}));
   const normalized={...meta,effects:normalize(meta.effects)},selected=prepareMarkEffects(engine,d.document,normalize(prepare?.(d,normalized)??normalized.effects),{actor});
   return declared?.theft===true?trimTheft(d,engine,declared,selected,actor,meta.receipt):selected;
  },
  accountExists:(document,key)=>{
   const account=parseAccount(key),s=document.state;
   if(account.resource===LEDGER_COIN){
    const known=account.owner==='player'||s.npcs?.[account.owner]||s.creatures?.[account.owner]||s.settlements?.[account.owner]||s.records?.[`organization:${account.owner}`]||s.records?.[`faction-assets:${account.owner}`]||engine.world.factions?.some(f=>f.id===account.owner)||engine.rules.economy?.credit?.banks?.some(b=>b.id===account.owner)||s.records?.[account.owner]?.category==='bank';
    return known&&key===partyAccount(engine,s,account.owner);
   }
   try{return Boolean(primitiveStockProjection(engine,s,key));}catch{return false;}
  },
  mirrorTransfer:(d,effect)=>mirrorPrimitiveTransfer(d,engine,effect),
  transferLot:(document,effect)=>{
   const to=parseAccount(effect.to);
   return to.resource===LEDGER_COIN||isSink(to.owner)?null:primitiveStockProjection(engine,document.state,effect.to).lot??null;
  },
  executePrimitive:(d,effect,{frame,index,requireAuthority,tags})=>{
   if(consequence?.(d.document,effect)===true&&['vital','status'].includes(effect.op)&&(isPhysicallyDead(engine,d,effect.target)||isGone(engine,d,effect.target)))return {applied:false,reason:'target_not_living',target:effect.target};
   const child=`${frame.eventId}:${index}`,s=d.get('state');
   const signing=a=>({authorize:({state,actor,party})=>{
    const live={...context,document:{...d.document,state}},permission=canAct(live,actor,effect.op);
    const current=authority(live,actor,effect.op,party,{effect});
    return {allowed:permission.allowed&&current.allowed&&current.actedAs?.id===a.actedAs?.id};
   }});
   if(effect.op==='emit'&&['consent_given','consent_revoked'].includes(effect.verb))return applyConsentEvent(d,primitiveContext(engine,d.document),{actor:frame.actor,eventId:child,verb:effect.verb,to:effect.target,payload:effect.payload});
   if(effect.op==='obligation.create'){
    const a=requireAuthority(effect.op,effect.debtor,{effect});
    let terms=effect.terms;
    if(effect.obligationKind==='mandate'){
      if(!validMandateScope(terms?.scope)||terms.subdelegate!==undefined&&typeof terms.subdelegate!=='boolean'||['until','expires'].some(k=>terms[k]!==undefined&&(!Number.isSafeInteger(terms[k])||terms[k]<=s.minute))||terms.parentMandate!==undefined&&(typeof terms.parentMandate!=='string'||!terms.parentMandate))reject('E-MANDATE-SCOPE','A mandate needs a valid scope and future expiry');
      const live={...context,document:d.document},parent=terms.parentMandate?mandateParent(live,effect):null;
     const permission=consent({...context,document:d.document},effect.creditor,frame.actor,'mandate',{purpose:context.consentPurpose,onRefusal:'abort'});
     if(!permission.allowed)reject('E-CONSENT','A mandate requires its principal to authorize this commission');
      if(permission.kind==='proxy'){
       const grant=d.get('state','consentEvents')?.find(e=>e.id===permission.source);
       if(!parent||grant?.by!==parent.debtor)reject('E-MANDATE-SCOPE','Proxy commission requires its actual parent mandate and delegating agent');
      }
     terms={...terms,principalConsent:{source:permission.source,at:s.minute,purpose:context.consentPurpose}};
    }
    // Signing facts and protocol capabilities always come from the frame.
    return openObligation(d,engine,{id:effect.id,obligationKind:effect.obligationKind,debtor:effect.debtor,creditor:effect.creditor,amount:effect.amount,deadline:effect.deadline,subject:effect.subject,terms,actor:frame.actor,actedAs:a.actedAs},child,signing(a));
   }
   if(effect.op==='obligation.settle'){
    const row=obligationRow(s,effect.id);if(!row)reject('E-OBLIGATION','Obligation does not exist');
    const payer=effect.payer??row.debtor,a=requireAuthority(effect.op,payer,{effect});
    if(effect.with!==undefined)reject('E-PRIMITIVE-CONNECTOR','In-kind settlement requires its performance adapter');
    return settleObligation(d,engine,{id:effect.id,amount:effect.amount,payer,actor:frame.actor,actedAs:a.actedAs},child,signing(a));
   }
   if(effect.op==='obligation.cancel'){
    const row=obligationRow(s,effect.id);if(!row)reject('E-OBLIGATION','Obligation does not exist');
    const a=requireAuthority(effect.op,row.creditor,{effect});
    // closeObligation retains earned claims; cancellation cannot erase money.
    return closeObligation(d,engine,{id:effect.id,party:row.creditor,actor:frame.actor,reason:effect.reason,actedAs:a.actedAs},child,signing(a));
   }
   const oldDraft=engine.airDraft;
   if(effect.op==='move')engine.airDraft=d;
   try{return executeRuntimeEffect(d,engine,effect,{frame,index,requireAuthority,tags},context,typeof limits==='function'?limits(d.document):limits);}
   finally{if(effect.op==='move')engine.airDraft=oldDraft;}
  }});
}

// Registered outcomes are authored programs. Slot substitution is explicit and
// never accepts effect/source/writer fields from a client as a program.
export function actionEffects(action,slots,actor){
 const bind=value=>{
  if(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===1&&typeof value.slot==='string'){
   if(!Object.hasOwn(slots,value.slot))reject('E-ACTION-SLOT',`Missing slot: ${value.slot}`);
   return structuredClone(slots[value.slot]);
  }
  if(value==='$actor')return actor;
  if(Array.isArray(value))return value.map(bind);
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,bind(v)]));
  return value;
 };
 return bind(action.outcomes);
}

function validatePreconditions(engine,current,action,slots,conditions=action.preconditions??[],actor='player'){
 const library=createRXLibrary(engine,current,{observer:actor,context:primitiveContext(engine,current)}),slotSchema=Object.fromEntries(action.slots.map(slot=>[slot.name,slot.schema??(['quantity','coins','minutes'].includes(slot.kind)?'number':slot.kind==='flag'?'boolean':'string')]));
 for(const condition of conditions){
  const source=typeof condition==='string'?condition:condition.value;
  if(typeof source!=='string')reject('E-PRIMITIVE-CONNECTOR','Precondition requires an RX expression');
  const compiled=compileRX(source,{schema:{actor:'string',target:'string',slots:slotSchema},functions:library.signatures});
  if(evaluateRX(compiled,{actor,target:slots.target??actor,slots},{functions:library.functions})!==true)reject('E-PRECONDITION',condition.reason??'Action precondition is not satisfied');
 }
}

function rxValue(engine,document,action,slots,value,actor){
 if(typeof value!=='string')return value;
 const library=createRXLibrary(engine,document,{observer:actor,context:primitiveContext(engine,document)}),schema={actor:'string',target:'string',slots:Object.fromEntries(action.slots.map(s=>[s.name,s.schema??(['quantity','coins','minutes'].includes(s.kind)?'number':s.kind==='flag'?'boolean':'string')]))};
 return evaluateRX(compileRX(value,{schema,functions:library.signatures}),{actor,target:slots.target??actor,slots},{functions:library.functions});
}
function validateSlots(engine,document,action,slots,actor){
 for(const slot of action.slots){
  const value=slots[slot.name];if(value===undefined)continue;
  const type=slot.schema??(['quantity','coins','minutes'].includes(slot.kind)?'number':slot.kind==='flag'?'boolean':null);
  if(type==='number'&&(!Number.isSafeInteger(value)||value<0&&slot.min===undefined)||type==='boolean'&&typeof value!=='boolean'||type==='string'&&typeof value!=='string')reject('E-ACTION-SLOT',`Invalid slot type: ${slot.name}`);
  if(slot.options&&Array.isArray(slot.options)&&!slot.options.includes(value))reject('E-ACTION-SLOT',`Invalid slot choice: ${slot.name}`);
  if(slot.min!==undefined&&value<rxValue(engine,document,action,slots,slot.min,actor)||slot.max!==undefined&&value>rxValue(engine,document,action,slots,slot.max,actor))reject('E-ACTION-SLOT',`Slot outside native bounds: ${slot.name}`);
 }
}
// Numeric effects authored as constants are their own bound. Client-bound
// magnitude slots must have a finite catalog maximum, evaluated on current facts.
function actionLimits(engine,document,action,slots,actor){
 const outcomes=Array.isArray(action.outcomes)?[action.outcomes]:Object.values(action.outcomes),limits={time:0,fact:{}};
 const numeric=(value)=>{
  if(value&&typeof value==='object'&&typeof value.slot==='string'){
   const slot=action.slots.find(s=>s.name===value.slot),max=slot?.max===undefined?undefined:rxValue(engine,document,action,slots,slot.max,actor),min=slot?.min===undefined?0:rxValue(engine,document,action,slots,slot.min,actor);
   if(!Number.isSafeInteger(max)||!Number.isSafeInteger(min)||min>max)reject('E-ACTION-BOUND',`Effect slot requires native bounds: ${value.slot}`);
   return Math.max(Math.abs(min),Math.abs(max));
  }
  if(!Number.isSafeInteger(value))reject('E-ACTION-BOUND','Effect requires a constant or bounded numeric slot');
  return Math.abs(value);
 };
 for(const effects of outcomes){
  const factTotal={};
  if(!Array.isArray(effects))reject('E-ACTION-OUTCOME','An outcome must be a primitive list');
  for(const effect of effects){
   if(effect.op==='fact.set'){
    if(typeof effect.field!=='string')reject('E-ACTION-BOUND','Fact fields must be authored');
    const entity=actionEffects({outcomes:effect.entity},slots,actor),kind=document.holdings?.entities?.[entity]?.kind,rule=engine.world.primitiveFacts?.[kind]?.[effect.field];
    if(!rule)reject('E-FACT-FIELD','Fact field is not registered for this entity kind');
    const bound=effect.delta===undefined?rule.max-rule.min:numeric(effect.delta);
    factTotal[effect.field]=(factTotal[effect.field]??0)+bound;
   }
   if(effect.op==='time')limits.time+=numeric(effect.minutes);
   if(effect.op==='vital'){
    const n=numeric(effect.delta);limits.vital??={harm:0,heal:0,rangeMeters:action.rangeMeters??1.5};
    if(effect.type?.startsWith('body:')){limits.vital.body??={};limits.vital.body[effect.type.slice(5)]=n;}
    // A bounded delta slot can select either direction. Both remain bounded.
    if(typeof effect.delta==='number')limits.vital[effect.delta<0?'harm':'heal']=Math.max(limits.vital[effect.delta<0?'harm':'heal'],effect.delta<0&&action.check&&Array.isArray(action.outcomes)?fixedInteger(fixedMultiply(fixedUnits(n),fixedUnits(engine.rules.combat.criticalMultiplier))):n);
    else {limits.vital.harm=Math.max(limits.vital.harm,fixedInteger(fixedMultiply(fixedUnits(n),fixedUnits(action.check&&Array.isArray(action.outcomes)?engine.rules.combat.criticalMultiplier:1))));limits.vital.heal=Math.max(limits.vital.heal,n);}
   }
   if(effect.op==='status'){
    if(typeof effect.status!=='string')reject('E-ACTION-BOUND','Status identifiers must be authored');
    limits.status??={statuses:[],magnitude:0,duration:0,rangeMeters:action.rangeMeters??1.5};
    limits.status.statuses.push(effect.status);limits.status.magnitude=Math.max(limits.status.magnitude,numeric(effect.magnitude));limits.status.duration=Math.max(limits.status.duration,numeric(effect.duration));
   }
  }
  for(const [field,total] of Object.entries(factTotal))limits.fact[field]=Math.max(limits.fact[field]??0,total);
 }
 return limits;
}
function actionDuration(engine,document,action,slots,actor){
 const table=engine.world.primitiveTables?.['action-costs']?.rows??[],key=action.id.replace(/^core:/,''),row=table.find(r=>r.selector===key);
 let duration=rxValue(engine,document,action,slots,action.cost?.time??row?.timeMin??row?.minutesPerBout??0,actor);
 if(action.durationSlot){
  const rule=action.durationSlot,name=typeof rule==='string'?rule:rule.slot??rule.name;
  duration=slots[name];
  if(!Number.isSafeInteger(duration)||duration<(rule.min??row?.durationMin??1)||duration>(rule.max??row?.durationMax??43200))reject('E-ACTION-DURATION','Duration is outside the activity bounds');
 }
 if(!Number.isSafeInteger(duration)||duration<0||duration>43200)reject('E-ACTION-COST','Invalid native action duration');
 const effects=Array.isArray(action.outcomes)?action.outcomes:Object.values(action.outcomes??{}).flat();
 return {duration,activity:action.activity??row?.activity??(effects.some(e=>e.op==='move')||key.startsWith('move')?'travel':effects.some(e=>e.op==='time')||key.startsWith('time')||key==='sleep'?'rest':'light')};
}

function adjudicateAction(d,engine,action,slots,actor,eventId,effects,receipt,{duration=0,purpose=action.id,limits={},quote={}}={}){
 effects=effects.map(effect=>resolvePrimitiveTransfer(engine,d.document,effect,{actor}));
 let permission=null,check=action.check,failed=false;
 const scopeRules=action.consent?.scope;
 if(action.consent){
  const rule=action.consent,from=rule.from==='self'?actor:rule.from==='party'?slots[rule.slot]:slots[rule.from]??slots.target;
  const scopes=Array.isArray(scopeRules)?scopeRules:[scopeRules??'property'];
  for(const entry of scopes){
   const scope=typeof entry==='string'?entry:entry?.value;
   if(typeof from!=='string'||typeof scope!=='string')reject('E-CONSENT','Consent requires a target and scope');
   const onRefusal=rule.onRefusal??(['mind','memory','healing','support_magic'].includes(scope)?'contest':'abort'),until=d.get('state','minute')+duration;
   permission=from===actor?{allowed:true,kind:'self',source:eventId,tags:[],check:null}:consent(primitiveContext(engine,d.document),from,actor,scope,{purpose,until,onRefusal});
   if(!permission.allowed&&purpose!==action.id)permission=consent(primitiveContext(engine,d.document),from,actor,scope,{purpose:action.id,until,onRefusal});
   if(!permission.allowed&&from!=='player'&&d.get('state','npcs',from)){
    // A declaration asks the other party; it cannot supply their answer. A2
    // receives only that NPC's subjective projection and a native request.
    const transferred=effects.filter(e=>e.op==='transfer'),money=transferred.filter(e=>parseAccount(e.from).owner===from).reduce((n,e)=>n+e.qty*(parseAccount(e.from).resource===LEDGER_COIN?1:engine.byId.get(parseAccount(e.from).resource)?.basePrice??0),0),reward=transferred.filter(e=>parseAccount(e.to).owner===from).reduce((n,e)=>n+e.qty*(parseAccount(e.to).resource===LEDGER_COIN?1:engine.byId.get(parseAccount(e.to).resource)?.basePrice??0),0);
    const library=createRXLibrary(engine,d.document,{observer:actor,context:primitiveContext(engine,d.document)}),decision=library.functions.npcDecision(from,{kind:scope,purpose:action.id,cost:{minutes:duration,coins:money},reward});
    receipt.decisions??=[];receipt.decisions.push({from,scope,...decision});
    if(decision.outcome==='agree'){
     const id=`${eventId}:consent:${receipt.decisions.length}`,payload={scope,purpose:[purpose],until:until+1};
     applyConsentEvent(d,primitiveContext(engine,d.document),{actor:from,eventId:id,verb:'consent_given',to:actor,payload});
     SOCIAL_VERBS.add('consent_given');
     publishTransitionEvent(d,engine,{id,parent:eventId,verb:'consent_given',actor:from,target:actor,minute:d.get('state','minute'),location:d.get('state','location'),visibility:'private',witnesses:[],tags:[],payload,source:{kind:'catalog',id:action.id}});
     permission=consent(primitiveContext(engine,d.document),from,actor,scope,{purpose,until,onRefusal});
    }
   }
   if(!permission.allowed){
    if(permission.check==='abort')reject('E-CONSENT',entry?.reason??permission.reason);
    if(from!=='player'&&!d.get('state','npcs',from))reject('E-PRIMITIVE-CONNECTOR','The opposed pair requires a person');
    check={...(check??{}),opponent:{npc:from,attribute:'精神'}};
    receipt.consequences.push({tags:permission.tags,scope,from,source:entry?.source??action.id});
   }
  }
 }
 if(check){
  const args=actionEffects({outcomes:check},slots,actor);
  if(args.opponent)delete args.difficulty;
  if(args.difficulty!==undefined)args.difficulty=rxValue(engine,d.document,action,slots,args.difficulty,actor);
  receipt.check=engine.primitiveCheck(d,args,`${eventId}:action-check`,actor);failed=!receipt.check.success;
 }
 if(permission)receipt.consent=permission;
 if(action.theft===true&&!check)reject('E-THEFT-CHECK','Theft requires an authored native check');
 const grade=receipt.check?({'大失败':'fumble','失败':'failure','勉强成功':'partial','成功':'success','大成功':'critical'})[receipt.check.degree]:'success';
 if(Array.isArray(action.outcomes)){
  receipt.outcome=grade;
  return defaultGrade(d,engine,action,effects,slots,actor,receipt,grade,{limits,quote});
 }
 const selected=action.outcomes[grade]??(failed?[]:action.outcomes.success??action.outcomes.accepted??[]);
 receipt.outcome=grade;return actionEffects({outcomes:selected},slots,actor);
}

function defaultGrade(d,engine,action,effects,slots,actor,receipt,grade,{limits,quote}){
 if(!receipt.check)return effects;
 degreeConsequences(d,engine,action,effects,slots,actor,receipt,grade,{limits,quote});
  const row=Object.values(engine.world.openActionRules?.degrees??{}).find(row=>row.key===grade);
 if(grade==='failure'||grade==='fumble'){
  receipt.narrate.mustNot.push(...effects.map((e,index)=>({op:e.op,index})));
  receipt.trimmed.push(...effects.map((effect,index)=>({effect,index,reason:'check_failed'})));
  receipt.consequences.push({kind:'exposure',actor,action:action.id});
   quote.duration*=row?.timeMultiplier??(grade==='fumble'?2:1);
  const backfire=effects.find(e=>e.op==='vital'&&e.delta<0);
  const target=slotsTarget(effects,actor),extra=[];
  if(grade==='fumble'){
   const fall=effects.some(e=>e.op==='move')?familyDegree(engine,'move',grade).fallDamage:0;
   const harm=backfire?Math.max(1,Math.floor(Math.abs(backfire.delta)*familyDegree(engine,'vital',grade).selfHarmRatio)):fall;
   if(harm){limits.vital??={harm:0,heal:0,rangeMeters:1.5};limits.vital.harm=Math.max(limits.vital.harm,harm);extra.push({op:'vital',target:actor,delta:-harm,type:'physical'});}
   for(const effect of effects.filter(e=>e.op==='fact.set')){
    const entity=d.get('holdings','entities',effect.entity),rule=engine.world.primitiveFacts?.[entity?.kind]?.condition,old=entity?.facts?.condition;
    if(rule&&Number.isSafeInteger(old)&&old>rule.min){const loss=Math.min(old-rule.min,familyDegree(engine,'fact.set',grade).conditionLoss);limits.fact.condition=(limits.fact.condition??0)+loss;extra.push({op:'fact.set',entity:effect.entity,field:'condition',delta:-loss});}
   }
  }
  return [...extra,...effects.filter(e=>degreeFamily(e)==='request').map(e=>({...e,payload:{...e.payload,outcome:receipt.decisions?.find(row=>row.target===e.target)?.outcome??'refuse'}})),
   {op:'emit',verb:'tell',...(target?{target}:{}),visibility:'witnessed',payload:{kind:'action_exposed',action:action.id,outcome:grade}}];
 }
 if(!['partial','success','critical'].includes(grade))return effects;
 return effects.flatMap((effect,index)=>{
  let next=effect;
  if(effect.op==='vital'){
    const family=familyDegree(engine,'vital',grade),multiplier=family.multiplier==='combat.criticalMultiplier'?(effect.delta<0?engine.rules.combat.criticalMultiplier:1):family.multiplier??1;
   next={...effect,delta:fixedInteger(fixedMultiply(fixedUnits(effect.delta),fixedUnits(multiplier)))};
  }else if(effect.op==='fact.set'&&grade==='partial'){
    const multiplier=familyDegree(engine,'fact.set',grade).multiplier;
    if(typeof effect.delta==='number')next={...effect,delta:fixedInteger(fixedMultiply(fixedUnits(effect.delta),fixedUnits(multiplier)))};
   else if(typeof effect.value==='number'){
     const old=d.get('holdings','entities',effect.entity,'facts',effect.field)??0;next={...effect,value:old+fixedInteger(fixedMultiply(checkedFixed(fixedUnits(effect.value)-fixedUnits(old)),fixedUnits(multiplier)))};
   }
  }else if(effect.op==='learn'&&effect.learningSource!=='practice'){
    const multiplier=familyDegree(engine,'learn',grade).multiplier;
   if(limits.learn)limits.learn.multiplier=multiplier;
   if(effect.amount!==undefined)next={...effect,amount:fixedInteger(fixedMultiply(fixedUnits(effect.amount),fixedUnits(multiplier)))};
  }
  if(effect.op==='create')next={...effect,facts:{...effect.facts,quality:limits.quality??familyDegree(engine,'create',grade).quality}};
  if(degreeFamily(effect)==='request')next={...effect,payload:{...effect.payload,outcome:receipt.decisions?.find(row=>row.target===effect.target)?.outcome??familyDegree(engine,'request',grade).response}};
  if(['move','fact.set'].includes(effect.op)&&familyDegree(engine,effect.op,grade).unnoticed)next={...next,visibility:'private'};
  if(next!==effect)receipt.trimmed.push({index,effect,applied:next,reason:`degree:${grade}`});
  if(next.op==='vital'&&next.delta===0){receipt.narrate.mustNot.push({op:next.op,index});return [];}
  return [next];
 });
}
function slotsTarget(effects,actor){
 for(const e of effects){if(e.target&&e.target!==actor)return e.target;if(e.op==='transfer'){const from=parseAccount(e.from).owner;if(from!==actor)return from;}}
 return null;
}

function trimTheft(d,engine,action,effects,actor,receipt){
 if(action.theft!==true)return effects;
 let coins=engine.rules.law.maximumTheftCoins;const used=new Map();
 return effects.flatMap((effect,index)=>{
  if(effect.op!=='transfer'||parseAccount(effect.from).owner===actor)return [effect];
  const from=parseAccount(effect.from),to=parseAccount(effect.to);
  if(to.owner!==actor||!['purse','inventory'].includes(from.purpose))reject('E-THEFT-ACCOUNT','Theft only takes reachable personal property into the actor inventory');
  if(from.resource!==LEDGER_COIN)reject('E-PRIMITIVE-CONNECTOR','Item theft requires its original-owner claim adapter; use the registered theft action');
  const qty=Math.min(effect.qty,coins,Math.max(0,(d.get('ledger','accounts',effect.from)??0)-(used.get(effect.from)??0)));
  if(qty!==effect.qty)receipt.trimmed.push({index,effect,applied:qty,reason:'theft_limit'});
  if(!qty)return [];
  used.set(effect.from,(used.get(effect.from)??0)+qty);
  coins-=qty;
  return [{...effect,qty}];
 });
}

function settleActionCost(d,engine,action,slots,actor,start,quote,receipt,eventId){
 const remaining=Math.max(0,quote.duration-(d.get('state','minute')-start));
 if(remaining)engine.advance(d,remaining,`${eventId}:cost`);
 const elapsed=d.get('state','minute')-start,body={},rows=engine.world.primitiveTables?.body?.rows;
 if(elapsed||action.cost?.body){
  if(!rows)reject('E-BODY-TABLE','The archived body table is required');
  for(const row of rows.filter(r=>r.selector==='person')){
   const explicit=action.cost?.body?.[row.need],fact=bodyFact(engine,d.document,actor,row.need);
   if(explicit===undefined){
    const state=readBodyState(engine,d.document,actor,row.need);writeBodyNeed(d,engine,actor,row.need,state.value,{remainder:state.remainder});body[row.need]={value:state.value,asOf:d.get('state','minute')};
   }else{
    const amount=rxValue(engine,d.document,action,slots,explicit,actor);
    if(!Number.isFinite(amount)||amount<0)reject('E-ACTION-COST','Invalid body cost');
    const value=writeBodyNeed(d,engine,actor,row.need,fixedNumber(checkedFixed(fixedUnits(fact.value)+(row.need==='fatigue'?1n:-1n)*fixedUnits(amount))),{remainder:fact.remainder??0});body[row.need]={value,asOf:d.get('state','minute')};
   }
  }
 }
 receipt.cost={time:elapsed,body};
 finishDegreeConsequences(d,engine,receipt);
 // Practice's native learning executor advances the world itself. Expose that
 // committed span alongside learning, rather than leaving time only in cost.
 if(elapsed&&receipt.applied.some(e=>e.op==='learn'&&e.learningSource==='practice')&&!receipt.applied.some(e=>e.op==='time')){
  receipt.applied.push({op:'time',entity:'world',minutes:elapsed,mode:'practice',index:receipt.applied.length,source:receipt.source,role:'outcome',appliedEvent:eventId,result:{before:start,after:d.get('state','minute')}});
 }
}

function actionResourceCosts(engine,document,action,slots,actor){
 return (action.cost?.resources??[]).map(row=>{
  if(!row||typeof row.resource!=='string')reject('E-ACTION-COST','A resource cost requires a registered resource');
  const resource=row.resource,qty=rxValue(engine,document,action,slots,row.qty??row.amount,actor);
  if(!Number.isSafeInteger(qty)||qty<1||resource!==LEDGER_COIN&&!engine.byId.has(resource))reject('E-ACTION-COST','Invalid resource cost');
  return {op:'transfer',from:resource===LEDGER_COIN?partyAccount(engine,document.state,actor):accountKey(actor,resource,'inventory'),to:accountKey('sink:consume',resource,'action'),qty};
 });
}

// Consequences of an existing rite are not new initiatives by its officiant.
// Re-derive the complete plan here; neither a caller's effects nor its claimed
// reason can grant a rule frame. Ordinary action frames keep their capacity gate.
function interruptRite(engine,document,requested,{scheduler=null,reactionContext=null}={}){
 const plan=riteProjectInterruptions(engine,document).find(p=>p.project===requested.project);
 if(!plan||digest(plan)!==digest(requested))reject('E-RITE-INTERRUPTION','The rite interruption is no longer current');
 const action=findAction(primitiveRuntime.registry(engine),plan.action),limits=action.rite.limits??{},context=primitiveContext(engine,document),factUsage=new Map();
 const frame=createPrimitiveFrame({actor:plan.actor,eventId:plan.eventId,source:{kind:'rule',id:`rite:${plan.action}:interrupt`},engine,
  identity:{project:plan.project,reason:plan.reason},verbs:['tell','request','claim'],factPolicy:engine.world.primitiveFacts??{},
  createDraft:doc=>{const d=engine.primitiveDraft(doc);ensureHoldings(d,engine);if(d.scheduler&&scheduler){d.scheduler.seq=Math.max(d.scheduler.seq,scheduler.seq);d.scheduler.lastSettled=scheduler.lastSettled;}return d;},
  validate:current=>{const live=riteProjectInterruptions(engine,current).find(p=>p.project===plan.project);if(!live||digest(live)!==digest(plan))reject('E-RITE-INTERRUPTION','The rite interruption changed');},
  canAct:()=>({allowed:true,tags:[]}),
  // A rule may consume the officiant's own committed resources even when they
  // are incapacitated. Third-party property still needs its actual authority.
  authority:(current,actor,op,target,options)=>{
   const owner=op==='transfer'?parseAccount(target).owner:target;
   return op==='transfer'&&owner===actor?{allowed:true,tags:[],actedAs:null}:authority({...context,document:current},actor,op,target,options);
  },
  location:(current,id)=>id===plan.actor?plan.location:id==='player'?current.state.location:current.state.npcs?.[id]?.location??current.state.creatures?.[id]?.location,
  mirrorTransfer:(d,effect)=>mirrorPrimitiveTransfer(d,engine,effect),
  validateFact:(d,effect,{row,value})=>{
   if(typeof value!=='number')return;
   const bound=limits.fact?.[effect.field],used=(factUsage.get(effect.field)??0)+Math.abs(value-(row.facts?.[effect.field]??0));
   if(!Number.isSafeInteger(bound)||bound<0||!Number.isSafeInteger(used)||used>bound)reject('E-FACT-BOUND','Rite consequence exceeds its declared bound');
   factUsage.set(effect.field,used);
  },
  executePrimitive:(d,effect,meta)=>{
   // A corpse cannot receive a second injury/status. Keep the actual no-effect
   // result rather than aborting the project's already-triggered termination.
   if(['vital','status'].includes(effect.op)&&(isPhysicallyDead(engine,d,effect.target)||isGone(engine,d,effect.target)))return {applied:false,reason:'target_not_living',target:effect.target};
   return executeRuntimeEffect(d,engine,effect,meta,{...context,document:d.document},limits);
  }});
 return commitPrimitiveConsequences(document,plan.effects,frame,{reactionContext});
}
const settlingRites=new WeakSet();
function settleRites(d,engine){
 if(settlingRites.has(engine))return [];
 settlingRites.add(engine);
 try{const plans=settleRiteInterruptions(d,engine);if(plans.length)drainWorldReactions(d);return plans;}finally{settlingRites.delete(engine);}
}
function nextRiteMinute(engine,d,now){
 let next=Infinity;
 for(const project of recordsWhere(d.get('state','records'),'category','rite_project')){
  if(project.status!=='active')continue;
  const action=findAction(primitiveRuntime.registry(engine),project.action),stage=action?.rite?.stages?.[project.stage];
  for(const at of [project.deadline,typeof stage?.window==='object'?stage.window.to:null,...(d.get('state','consentEvents')??[]).filter(e=>e.type==='consent_given'&&Object.values(project.slots.roles??{}).flat().includes(e.from)).map(e=>e.until)])if(Number.isSafeInteger(at)&&at>now)next=Math.min(next,at);
 }
 return next;
}
registerAdvanceHook('riteLifecycle',()=>({nextMinute:nextRiteMinute,settle:settleRites}));

export const primitiveRuntime={
 context:primitiveContext,
 legacyAction(engine,tool,args,options={}){
  if(options.replay&&!options.result?.receipt)return null;
  // Unarchived raw legacy calls retain their historical event format. An
  // explicit world_act or an archived catalog opts into primitive receipts.
  if(!options.legacyAction&&!engine.world.actionDefinitions)return null;
  const registry=this.registry(engine);
  return options.legacyAction?findAction(registry,options.legacyAction.id):actionOfCall(registry,tool,args);
 },
 legacyPrior(document,{action,tool,args,eventId}){
  const row=document.state.records?.[legacyReceiptKey(eventId)];if(!row)return null;
  if(row.fingerprint!==legacyIdentity(action,tool,args))reject('E-PRIMITIVE-DUPLICATE','同一事件编号不能改换动作或参数');
  const receipt=structuredClone(row.receipt);receipt.duplicate=true;
  return {patches:[],result:{...receipt.legacy,duplicate:true,receipt}};
 },
 completeLegacy(engine,before,d,context){return adaptLegacyExecution(engine,before,d,context);},
 interruptRite,settleRites,
 beginSleep,finishSleep,
 applyMark(d,engine,effect,meta){
  const result=applyMarkPrimitive(d,engine,effect,meta);
  return {...result,...reactToMark(d,engine,d.get('state','created',result.entity),{eventId:meta.child,suppressed:result.suppressed})};
 },
 isNativeAction(engine,input){const action=findAction(this.registry(engine),input.args?.action);return action?.projection==='scene'||action?.id==='open:leave_mark'||Boolean(action?.rite);},
 nativeAction(engine,document,input,{preview=false}={}){
  const action=findAction(this.registry(engine),input.args?.action);
  if(action?.projection==='scene')return {patches:[],receipt:{eventId:input.eventId,actor:'player',routed:action.id,status:preview?'preview':'committed',applied:[],cost:{time:0},scene:engine.scene(document,'')}};
  if(action?.id==='open:leave_mark')return executeLeaveMark(engine,document,input,{preview});
  if(action?.rite)return executeRite(engine,document,input,{preview});
  return null;
 },
 moveLocally,
 checkActor,
 learnNpc,
 studyPlayer(d,engine,{subject,source,mode},eventId){
  const state=d.get('state'),catalog=engine.byId.get(subject),person=state.npcs?.[source],project=state.projects?.[source];
  if(mode==='observe'&&!person)reject('E-LEARN-SOURCE','Observation requires a present demonstrator');
  const book=person||project?null:studyBook(d,engine,'player',source,subject);
  const minutes=book?.minutes??catalog.learnMinutes??120;
  const context=primitiveContext(engine,d.document),frame={actor:'player',eventId,source:{kind:'catalog',id:'core:learn'}};
  const result=executeRuntimeEffect(d,engine,{op:'learn',entity:'player',subject,learningSource:source},{frame,index:0,tags:[],requireAuthority:()=>reject('E-AUTHORITY','Study only controls the learner')},context,{learn:{minutes,multiplier:1,ceiling:book?.ceiling??2699},studyFee:person?(catalog.learnFee??12):0,observeOnly:mode==='observe'});
  const unit=state.itemInstances?.[source];
  // Keep learning.learn's catalog source identity and retain the exact physical
  // copy separately; instance selection is not a new book definition.
  if(result.source.type==='book'&&unit?.item)result.source={type:'book',id:unit.item,instance:source};
  d.set(['state','learning',eventId],{entity:subject,source:{...result.source,type:result.observed?'observation':result.source.type},start:state.minute,end:d.get('state','minute'),cost:result.cost,success:true});
  return result;
 },
 async propose(engine,document,input,{preview=false,options={}}={}){
  const proposal=input.args,eventId=input.eventId;
  if(typeof eventId!=='string'||!eventId||eventId.length>120)reject('E-OPEN-EVENT','A valid event id is required');
  const fingerprint=digest(proposal),key=`open_proposal:${eventId}`,prior=document.state.records?.[key];
  if(prior){
   if(prior.fingerprint!==fingerprint)reject('E-PRIMITIVE-DUPLICATE','Event id belongs to a different proposal');
   const result=structuredClone(prior.result);result.receipt.duplicate=true;
   return preview?{receipt:result.receipt,routing:result.receipt.routing}:{patches:[],result};
  }
   const mode=document.state.records?.action_config?.openActions??'full';
   if(mode==='off')reject('E-OPEN-DISABLED','此战役已关闭开放提案，请使用注册动作');
   if(mode==='limited'&&proposal?.effects?.some(e=>!['fact.set','vital','move','emit','learn'].includes(e.op)&&!(e.op==='create'&&e.kind==='mark')||e.op==='emit'&&!['request','tell'].includes(e.verb)))reject('E-OPEN-MODE','受限模式下此效果须通过注册动作执行');
  // open-actions already consumes this runtime for its registry. Load the
  // service after runtime initialization so B can register its native context.
   const {prepareOpenAction,createOpenActionContext,executeOpenSequence}=await import('./open-actions.mjs');
   const native=(openContextFactory??createOpenActionContext)(engine,document,proposal),prepared=prepareOpenAction(engine,document,proposal,native),routing=proposalRouting(proposal,prepared);
   if(prepared.status==='sequence'){
    const applied=await executeOpenSequence(engine,document,input,prepared,{preview});
    if(preview)return applied;
    if(applied.result.receipt.status==='rejected')return applied;
    const d=engine.primitiveDraft(applyPatches(document,applied.patches));
    holdingSet(d,engine,['state','records',key],{category:'open_proposal',fingerprint,result:applied.result},'primitives-runtime',eventId);
    return {...applied,patches:[...applied.patches,...d.patches]};
   }
   if(prepared.status==='open'&&prepared.effects.length){
    const applied=engine.primitiveOpenAction(document,input,prepared,{preview});
    if(preview)return applied;
    const d=engine.primitiveDraft(applyPatches(document,applied.patches));
    holdingSet(d,engine,['state','records',key],{category:'open_proposal',fingerprint,result:applied.result},'primitives-runtime',eventId);
    return {...applied,patches:[...applied.patches,...d.patches]};
   }
   if(prepared.status!=='routed'){
   if(!preview)reject('E-OPEN-NOT-ROUTED','Only matched registered actions can be submitted; preview this proposal first');
   return {prepared,receipt:{eventId,actor:'player',status:'not_submitted',applied:[],routing,signature:prepared.signature,candidates:prepared.candidates,trimmed:prepared.trimmed??[]}};
  }
  const actionInput={tool:'world_act',eventId,args:{action:prepared.routed,slots:prepared.slots}};
  if(this.registry(engine).byId.get(prepared.routed)?.projection==='scene'){
   const result=this.nativeAction(engine,document,actionInput,{preview});
   Object.assign(result.receipt,{routing,signature:prepared.signature,candidates:prepared.candidates});
   return preview?result:{patches:[],result:{action:prepared.routed,receipt:result.receipt}};
  }
  if(preview){
   const result=await engine.previewAction(document,actionInput,{openProposal:{proposal,prepared}});
   if(result.receipt.status==='rejected'&&result.receipt.routing?.fallback){
    result.receipt.routing={...routing,...result.receipt.routing,intent:proposal.intent,proposal:structuredClone(proposal)};
    result.receipt.routing.fallback.intent=proposal.intent;
    return {...result,routing:result.receipt.routing};
   }
   Object.assign(result.receipt,{routing,signature:prepared.signature,candidates:prepared.candidates});
   return {...result,routing};
  }
  const applied=await engine.reduce(document,actionInput,{...options,openProposal:{proposal,prepared}});
  if(applied.result.ok===false&&applied.result.receipt?.status==='rejected'){
   applied.result.receipt.routing={...routing,...applied.result.receipt.routing,intent:proposal.intent,proposal:structuredClone(proposal)};
   applied.result.receipt.routing.fallback.intent=proposal.intent;
   return applied;
  }
  if(!applied.result.receipt){
   const resolved=this.resolve(engine,actionInput);
   applied.result.receipt={...this.legacyPreview(engine,document,actionInput,resolved,applied),status:'committed',routing,signature:prepared.signature,candidates:prepared.candidates};
  }
   Object.assign(applied.result.receipt,{routing,signature:prepared.signature,candidates:prepared.candidates});
   applied.result.receipt.openUsage=openUsageEntry(prepared,applied.result.receipt,applyPatches(document,applied.patches).state.minute);
   const d=engine.primitiveDraft(applyPatches(document,applied.patches));
   const primitive=d.get('state','records',`primitive:${eventId}`);
   if(primitive)holdingSet(d,engine,['state','records',`primitive:${eventId}`],{...primitive,receipt:applied.result.receipt},'primitives-runtime',eventId);
  holdingSet(d,engine,['state','records',key],{category:'open_proposal',fingerprint,result:applied.result},'primitives-runtime',eventId);
  return {...applied,patches:[...applied.patches,...d.patches]};
 },
 executeOpen(engine,document,input,prepared,{preview=false}={}){
  const actor='player',eventId=input.eventId,proposal=input.args,effects=prepared.effects;
  let limits,quote,start,resources,resourceSources;
  const tested=prepared.sources.some(s=>s.difficulty>0),difficulty=Object.values(engine.rules.check.difficulties).sort((a,b)=>Math.abs(a-prepared.difficulty)-Math.abs(b-prepared.difficulty))[0];
  const action={id:'open:proposal',slots:[],outcomes:effects,check:tested?{attribute:prepared.sources.find(s=>s.skill)?engine.byId.get(prepared.sources.find(s=>s.skill).skill)?.attribute??'精神':'力量',...(prepared.sources.find(s=>s.skill)?{skill:prepared.sources.find(s=>s.skill).skill}:{}),difficulty,context:difficulty-prepared.difficulty,contextReason:prepared.context?.reason??'开放动作来源难度及无近邻修正'}:null};
  const degreeSlots={tool:prepared.sources.find(source=>engine.byId.get(source.id)?.tags?.includes('tool'))?.id};
  const frame=createRuntimePrimitiveFrame(engine,document,{actor,eventId,source:{kind:'open',id:'open:proposal'},identity:{proposal},limits:()=>limits,
   prepare:(d,{receipt})=>{
    Object.assign(receipt,{routing:proposalRouting(proposal,prepared),signature:prepared.signature,candidates:prepared.candidates});
    receipt.trimmed.push(...prepared.trimmed);
    limits=actionLimits(engine,d.document,action,{},actor);limits.costManaged=true;
    limits.improvised=prepared.sources.some(source=>source.improvised===true);
    for(const op of ['vital','status'])if(limits[op])limits[op].rangeMeters=Math.min(...prepared.sources.filter((s,i)=>effects[i].op===op).map(s=>s.rangeMeters??1.5));
    if(limits.vital)for(const kind of ['harm','heal'])limits.vital[kind]=Math.max(0,...prepared.sources.filter((s,i)=>effects[i].op==='vital'&&(effects[i].delta<0?'harm':'heal')===kind).map(s=>s.bounds.delta));
    quote={duration:prepared.cost.time,activity:'light'};start=d.get('state','minute');
    beginBodyActivity(d,engine,actor,quote.activity);
    resources=[];resourceSources=[];let mp=0,stamina=0;
    // A shared source is paid once, even when it supplies several effects.
    for(const source of new Map(prepared.sources.map(s=>[s.id,s])).values()){
     const req=source.requirements??{};
     for(const [key,value] of Object.entries({mp:req.mp??0,stamina:req.stamina??0}))if(!Number.isSafeInteger(value)||value<0)reject('E-OPEN-COST',`Invalid native ${key}`);
     if(source.skill&&!d.get('state','skills',source.skill))reject('E-OPEN-SKILL','The source skill is no longer known');
     mp+=req.mp??0;stamina+=req.stamina??0;
     for(const material of req.materials??[]){resources.push({op:'transfer',from:accountKey(actor,material.item,'inventory'),to:accountKey('sink:consume',material.item,'action'),qty:material.amount});resourceSources.push({kind:'open',id:source.id});}
    }
    if(d.get('state','player','mp')<mp)reject('E-OPEN-MP','法力不足');
    const body=readBodyState(engine,d.document,actor,'stamina');if(body.value<stamina)reject('E-OPEN-STAMINA','体力不足');
    if(mp)d.set(['state','player','mp'],d.get('state','player','mp')-mp);
    if(stamina)writeBodyNeed(d,engine,actor,'stamina',body.value-stamina,{activity:'light',remainder:body.remainder});
    receipt.requirements={mp,stamina};
    const selected=adjudicateAction(d,engine,action,degreeSlots,actor,eventId,effects,receipt,{duration:quote.duration,limits,quote}).map(effect=>{
     if(effect.op!=='vital')return effect;
     const cap=limits.vital[effect.delta<0?'harm':'heal'],delta=Math.sign(effect.delta)*Math.min(Math.abs(effect.delta),cap);
     if(delta!==effect.delta)receipt.trimmed.push({effect,applied:delta,reason:'source_final_bound'});
     return {...effect,delta};
    });
    if(quote.materialMultiplier!==undefined)resources=resources.map(effect=>({...effect,qty:Math.ceil(effect.qty*quote.materialMultiplier)})).filter(effect=>effect.qty>0);
    return [...resources,...selected];
   },
   finish:(d,{receipt})=>{
    settleActionCost(d,engine,action,{},actor,start,quote,receipt,eventId);recordResourceCosts(receipt,resources,{requested:effects,sources:resourceSources});
    const mark=receipt.applied.find(e=>e.op==='create'&&e.kind==='mark');
    if(mark)receipt.fallback={originalIntentFulfilled:false,entity:mark.result.entity};
    receipt.openUsage=openUsageEntry(prepared,receipt,d.get('state','minute'));
   }});
  const planned=planPrimitives(document,effects,frame);
  if(preview)return planned;
  const claims=primitiveClaims(engine,document,planned.receipt.applied);
  if(!claims.length)return commitPrimitives(document,effects,frame);
  const d=engine.primitiveDraft(structuredClone(document));let events=[];
  const pending=queuePrimitiveProposal(d,effects,frame,{claims,preview:planned.receipt,onCommitted:result=>{events=result.events;}});
  if(pending.receipt.duplicate)return {patches:[],events:[],receipt:pending.receipt};
  if(pending.receipt.status==='pending')engine.advance(d,0,eventId);
  if(pending.receipt.status==='pending')reject('E-PRIMITIVE-CONTEST','Scheduler did not finalize the proposal');
  if(d.scheduler){d.set(['state','scheduler','seq'],d.scheduler.seq);d.set(['state','scheduler','lastSettled'],d.scheduler.lastSettled);}
  return {patches:d.patches,receipt:pending.receipt,events};
 },
 actionPermission(engine,document,{action,slots={},actor='player'}={}){
  const resolved=this.resolve(engine,{args:{action,slots}},{actor});
   if(resolved.tool==='world_propose'){
    const allowed=document.state.records?.action_config?.openActions!=='off';
    return {action:resolved.action.id,actor,allowed,reason:allowed?null:'此战役已关闭开放提案',checks:[]};
   }
  let checks;
  if(resolved.effects){
   const context=primitiveContext(engine,document);
   checks=resolved.effects.map(effect=>({family:effect.op,...canAct(context,actor,effect.op,effect)}));
  }else{
   if(actor!=='player')reject('E-PRIMITIVE-ACTOR','Legacy actions use the player actor');
   const call=engine.primitiveNormalizeCall(resolved.tool,resolved.args),tool=call.tool.replace(/^world_/,'');
   const permission=legacyCanAct(engine,document,tool,call.args);
   checks=[{family:legacyActionFamily(tool,call.args),...canAct(primitiveContext(engine,document),actor,legacyActionFamily(tool,call.args),{to:tool==='move'?engine.resolve(call.args.destination):undefined}),...(permission??{})}];
   if(!permission){const old=engine.primitiveLegacyRestriction(document,tool,call.args);if(old)checks[0]={...checks[0],allowed:false,reason:old};}
  }
  const denied=checks.find(check=>!check.allowed);
  return {action:resolved.action.id,actor,allowed:!denied,reason:denied?.reason??null,checks};
 },
 legacyPreview(engine,document,input,resolved,reduced){
  const after=applyPatches(document,reduced.patches),detail=reduced.result;
  const check=detail.receipt?.check??after.state.checks?.[input.eventId]??(typeof detail.success==='boolean'&&Number.isFinite(detail.roll)?detail:null);
  const known=new Set(['player',...subjectiveView(engine,document,'player').observable.people.map(person=>person.id)]);
  const events=Object.values(after.state.records??{}).filter(row=>row.category==='world_event'&&(row.id===input.eventId||row.sourceEvent===input.eventId)&&
   (!privateWorldEvent(row)||row.actor==='player'||row.witnesses?.includes('player'))&&(row.actor==='player'||row.witnesses?.includes('player')));
  const consequences=events.map(row=>({source:row.id,type:row.verb,tags:[...row.tags??[]],...(row.reason?{reason:row.reason}:{})}));
  // Only the player's own/witnessed events and currently observable witnesses.
  // Unknown details stay null; elapsed-span autonomous events aren't forecasts.
  const witnesses=events.length?[...new Set(events.flatMap(row=>row.witnesses??[]).filter(id=>known.has(id)))].sort():null;
   return {...structuredClone(detail.receipt??{}),eventId:input.eventId,status:'preview',routed:resolved.action.id,applied:structuredClone(detail.receipt?.applied??[]),legacy:structuredClone({...detail,receipt:undefined}),
    cost:{...(detail.cost&&typeof detail.cost==='object'?detail.cost:{}),...detail.receipt?.cost,time:after.state.minute-document.state.minute,coins:Number.isFinite(detail.paid)?detail.paid:Number.isFinite(detail.cost)?detail.cost:null,resources:detail.receipt?.cost?.resources??detail.cost?.resources??null},
   check,consequences,witnesses,permission:this.actionPermission(engine,document,{action:resolved.action.id,slots:input.args?.slots??{}})};
 },
 registry(engine){
  if(engine.actionRegistry)return engine.actionRegistry;
  const snapshot=engine.world.actionDefinitions;
  if(snapshot){
   if(snapshot.format!==1||!Array.isArray(snapshot.actions))reject('E-ACTION-REGISTRY','Invalid archived action definitions');
   return {actions:snapshot.actions,byId:new Map(snapshot.actions.map(a=>[a.id,a])),namespaces:[...new Set(snapshot.actions.map(a=>a.namespace??a.id.split(':')[0]))],errors:[]};
  }
  return loadActionRegistry();
 },
 legacyPermission(engine,document,tool,args){
   return legacyCanAct(engine,document,tool,args);
 },
 validateLegacy(engine,document,tool,args,{replay=false,legacyAction=null}={}){
  if(replay&&!engine.world.actionDefinitions)return;
  const registry=this.registry(engine),action=legacyAction?findAction(registry,legacyAction.id):actionOfCall(registry,tool,args);if(!action)return;
  if(action.cost?.owner==='primitives')reject('E-ACTION-COST','A legacy handler owns its cost until its outcomes are migrated');
  validatePreconditions(engine,document,action,legacyAction?.slots??args,(action.preconditions??[]).filter(condition=>condition?.source));
  if(action.consent?.scope?.some?.(scope=>scope?.source))reject('E-PRIMITIVE-CONNECTOR','Additional consent scope requires its adjudication connector');
 },
 resolve(engine,input,{actor='player',sourceKind='catalog'}={}){
  const registry=sourceKind==='rule'?primitiveRuleRegistry(engine.world):this.registry(engine),action=findAction(registry,input.args?.action);
  if(registry.errors?.length)reject('E-ACTION-REGISTRY',registry.errors.join('; '));
  if(!action)reject('E-ACTION','Unknown registered action');
  if(!action.outcomes)return actionCall(registry,action.id,input.args?.slots??{});
  if(sourceKind!=='rule'&&!engine.actionRegistry&&!engine.world.actionDefinitions)reject('E-ACTION-ARCHIVE','Primitive definitions must be part of the archived world');
  const slots=input.args?.slots??{};
  if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).some(k=>!action.slots.some(s=>s.name===k)))reject('E-ACTION-SLOT','Invalid action slots');
  for(const slot of action.slots)if(slot.required&&!Object.hasOwn(slots,slot.name))reject('E-ACTION-SLOT',`Missing slot: ${slot.name}`);
  // Programs needing adjudication must use its connector; never run them as
  // unconditional effects merely because an outcomes array exists.
  const program=Array.isArray(action.outcomes)?action.outcomes:action.outcomes.success??action.outcomes.accepted;
  if(!Array.isArray(program)||!program.length)reject('E-ACTION-OUTCOME','A primary success outcome is required');
  return {action,effects:actionEffects({outcomes:program},slots,actor)};
 },
 execute(engine,document,input,{createDraft,preview=false,actor='player',sourceKind='catalog',openProposal=null}={}){
  const resolved=this.resolve(engine,input,{actor,sourceKind});
  if(!resolved.effects)return {legacy:resolved};
  const {action}=resolved;
   if(action.rite)reject('E-PRIMITIVE-CONNECTOR','This action requires its rite connector');
  if(action.cost?.owner!=='primitives'&&action.cost!==undefined)reject('E-ACTION-COST','Primitive actions must declare their cost owner');
  const slots=input.args?.slots??{},validate=current=>{validateSlots(engine,current,action,slots,actor);validatePreconditions(engine,current,action,slots,action.preconditions??[],actor);};
  let limits,quote,start,resourceCosts,escapeCheck=null,escapeClosures=new Set();
  const effects=resolved.effects;
  const purpose=`action:${digest({action:action.id,eventId:input.eventId})}`;
   const frame=createRuntimePrimitiveFrame(engine,document,{actor,eventId:input.eventId,source:{kind:sourceKind,id:action.id},createDraft,validate,identity:{action:action.id,slots,...(openProposal?{proposal:openProposal.proposal}:{})},limits:()=>limits,purpose,
   movementAuthority:({actor:who,to,custody,document:current})=>{
    if(who!==actor||to!==null||!escapeCheck?.success||!escapeClosures.has(custody.id)||custody.holder!==actor)return null;
    const guard=escapeCheck.opponent?.npc,state=current.state,place=actor==='player'?state.location:state.npcs?.[actor]?.location;
    const record=custody.source?.startsWith('custody:')?state.records?.[custody.source.slice(8)]:null;
    const caseRow=record?.case&&state.records?.[record.case],code=caseRow&&legalCodeById(engine,caseRow.law,state);
    const currentGuard=record?.captor??custody.terms?.guard;
    if(!guard||state.npcs?.[guard]?.location!==place||!canAct({engine,document:current},guard,'observe').allowed||!(currentGuard?guard===currentGuard:code&&personLawRoles(engine,state,guard,code).includes('officer')))return null;
    return {allowed:true,kind:'escape',source:`${input.eventId}:action-check`};
   },
   prepare:(d,{receipt})=>{
     if(openProposal)Object.assign(receipt,{routing:proposalRouting(openProposal.proposal,openProposal.prepared),signature:openProposal.prepared.signature,candidates:openProposal.prepared.candidates});
    limits=actionLimits(engine,d.document,action,slots,actor);limits.costManaged=true;quote=actionDuration(engine,d.document,action,slots,actor);start=d.get('state','minute');
    if(quote.duration||action.cost?.body||effects.some(e=>['move','learn','time'].includes(e.op)))beginBodyActivity(d,engine,actor,quote.activity);
    resourceCosts=actionResourceCosts(engine,d.document,action,slots,actor);
    if(effects.some(e=>e.op==='learn'))limits.learn={minutes:quote.duration};
    const selected=adjudicateAction(d,engine,action,slots,actor,input.eventId,effects,receipt,{duration:Math.max(quote.duration,limits.status?.duration??0),purpose,limits,quote});
    if(quote.materialMultiplier!==undefined)resourceCosts=resourceCosts.map(effect=>parseAccount(effect.from).resource===LEDGER_COIN?effect:{...effect,qty:Math.ceil(effect.qty*quote.materialMultiplier)}).filter(effect=>effect.qty>0);
    escapeCheck=receipt.check;escapeClosures=new Set(selected.filter(e=>e.op==='holding.close'&&e.reason==='escaped').map(e=>e.holding??e.id));
    limits.consentChecks=receipt.consequences.filter(row=>row.tags?.includes('unconsented')&&row.from&&row.scope).map(row=>({target:row.from,scope:row.scope,id:`${input.eventId}:action-check`}));
    return [...resourceCosts,...selected];
   },
   finish:(d,{receipt})=>{settleActionCost(d,engine,action,slots,actor,start,quote,receipt,input.eventId);recordResourceCosts(receipt,resourceCosts,{requested:(openProposal?.proposal.effects??[]).map(effect=>resolvePrimitiveTransfer(engine,document,effect,{actor}))});}});
  const planned=planPrimitives(document,effects,frame),claims=primitiveClaims(engine,document,planned.receipt.applied);
  if(preview)return planned;
  if(claims.length&&!preview){
   const d=(createDraft??(doc=>engine.primitiveDraft(doc)))(structuredClone(document));let events=[];
   const pending=queuePrimitiveProposal(d,effects,frame,{claims,preview:planned.receipt,onCommitted:result=>{events=result.events;}});
   if(pending.receipt.duplicate)return {patches:[],events:[],receipt:pending.receipt};
   if(pending.receipt.status==='pending')engine.advance(d,0,input.eventId);
   if(pending.receipt.status==='pending')reject('E-PRIMITIVE-CONTEST','Scheduler did not finalize the proposal');
   if(d.scheduler){d.set(['state','scheduler','seq'],d.scheduler.seq);d.set(['state','scheduler','lastSettled'],d.scheduler.lastSettled);}
   return {patches:d.patches,receipt:pending.receipt,events};
  }
  return commitPrimitives(document,effects,frame);
 },
 validateScheduled(engine,document,{action,rule,slots},actor){
  const resolved=this.resolve(engine,{args:{action:rule??action,slots}},{actor,sourceKind:rule===undefined?'catalog':'rule'});
  if(!resolved.effects)reject('E-SCHEDULE-ACTION','Only primitive programs can be scheduled');
  validateSlots(engine,document,resolved.action,slots,actor);
  return resolved.action.id;
 },
 runScheduled(engine,d,effect,context){
  const key=`primitive_schedule_result:${context.eventId}`;
  try{
   const result=this.execute(engine,d.document,{eventId:`scheduled:${digest({schedule:context.eventId})}`,args:{action:effect.rule??effect.action,slots:effect.slots}},{actor:effect.actor,sourceKind:effect.op==='primitive.rule'?'rule':'catalog'});
   for(const patch of result.patches)if(patch.op==='set')d.set(patch.path,patch.value);else d.remove(patch.path);
   if(d.scheduler)d.scheduler.seq=Math.max(d.scheduler.seq,d.get('state','scheduler','seq')??0);
   holdingSet(d,engine,['state','records',key],{category:'primitive_schedule_result',status:'committed',receipt:result.receipt},'primitives-runtime',context.eventId);
   return result.receipt;
  }catch(error){
   // Domain rejection is a terminal result, not an immortal due item that
   // prevents the whole world advancing. Unexpected engine errors still abort.
   if(!error.code?.startsWith('E-'))throw error;
   const result={category:'primitive_schedule_result',status:'rejected',code:error.code,reason:error.message};
   holdingSet(d,engine,['state','records',key],result,'primitives-runtime',context.eventId);return result;
  }
 },
 canAct(engine,document,actor,family,effect){return canAct(primitiveContext(engine,document),actor,family,effect);}
};
registerPrimitiveActionRuntime(primitiveRuntime);
