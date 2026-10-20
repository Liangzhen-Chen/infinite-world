// L1 composition of primitive transactions with the existing resource and
// obligation protocols. Only native callers supply frames and runtime options.
import {createActionPrimitiveFrame} from './action-authority.mjs';
import {canAct} from './action-capacity.mjs';
import {commitPrimitives,planPrimitives,queuePrimitiveProposal,registerPrimitiveActionRuntime} from './primitives.mjs';
import {reject} from './primitive-policy.mjs';
import {parseAccount,isSink,LEDGER_COIN} from './ledger.mjs';
import {partyAccount,mirrorPartyCoins} from './money.mjs';
import {BOOKED} from './stock.mjs';
import {changeItems} from './items.mjs';
import {openObligation,settleObligation,closeObligation} from './obligation-protocol.mjs';
import {obligationRow} from './obligation-state.mjs';
import {loadActionRegistry,actionCall,findAction,actionOfCall} from './action-registry.mjs';
import {legalCodeAt} from './law-codes.mjs';
import {personOffices,personLawRoles} from './entity-view.mjs';
import {aliveHoldings,holdingKind,ensureHoldings} from './holdings.mjs';
import {actionReader} from './action-capacity.mjs';
import {compileRX,evaluateRX} from './rx.mjs';
import {createRXLibrary} from './rx-library.mjs';
import {consent,applyConsentEvent} from './action-consent.mjs';

export function primitiveClaims(engine,document,effects){
 const claims=new Map(),draw=new Map(),occupancy=new Map(),d=actionReader(document);
 for(const effect of effects){
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

export function primitiveContext(engine,document){
 return {engine,document,rescaleConsent:({document,actor,holder,subject})=>consent({engine,document},holder,actor,'property',{purpose:`holding.rescale:${subject}`,onRefusal:'abort'}),authoritySources:({actor,op,target,kind,holding,document:current})=>{
  const state=current.state,location=actor==='player'?state.location:state.npcs?.[actor]?.location;
  const sources=[];
  for(const office of personOffices(engine,state,actor)){
   // Existing powers are scoped to their settlement, never universal money access.
   if(office.value.settlement===target&&office.value.powers?.includes(op))sources.push({kind:'office',id:office.source,allowed:true});
  }
  const code=legalCodeAt(engine,location,state),legalKind=kind??holding?.kind;
  if(code&&['holding.open','holding.close'].includes(op)&&(['wanted','banished','frozen'].includes(legalKind)||legalKind==='guest_of')){
   const targetLocation=holding?.subject??target;
   const roles=personLawRoles(engine,state,actor,code);
   if((code.locations.includes(targetLocation)||targetLocation===code.court||targetLocation===code.settlement||targetLocation===code.faction)&&roles.length){
    const record=holding?.source?.startsWith('custody:')?state.records?.[holding.source.slice(8)]:null,expired=(record?.expires??holding?.terms?.until??Infinity)<=state.minute;
    sources.push({kind:'law',id:code.id,role:roles[0],allowed:true,...(op==='holding.close'&&!expired?{tags:['offense:unlawful_release']}:{})});
   }
  }
  // S3's actual, revocable authorizations are not proposal-supplied actedAs.
  for(const [id,row] of Object.entries(state.records??{})){
   if(row.category!=='authorization'||row.grantee!==actor||row.grantor!==target||row.revoked||row.endedAt!==undefined||(row.since??row.createdAt??0)>state.minute||(row.expires??Infinity)<=state.minute)continue;
   const operation=op.startsWith('obligation.')?'contract':op;
   if(row.action===operation||row.actions?.includes(operation))sources.push({kind:'authorization',id,source:id,allowed:true});
  }
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
 if(from.purpose!=='inventory'||!sink&&to.purpose!=='inventory'||!engine.byId.has(from.resource))reject('E-TRANSFER-PROJECTION','This stock purpose requires its resource adapter');
 const moved=changeItems(d,engine,from.owner,from.resource,-effect.qty,{preserve:!sink,books:BOOKED});
 if(!sink){
  changeItems(d,engine,to.owner,to.resource,effect.qty,{books:BOOKED});
  if(moved.instances.length){
   const path=[...engine.bagPath(to.owner),to.resource,'instances'];
   d.set(path,[...d.get(...path)??[],...moved.instances]);
   for(const id of moved.instances)d.set(['state','itemInstances',id,'owner'],to.owner);
  }
 }
}

export function createRuntimePrimitiveFrame(engine,document,{actor='player',eventId,source,createDraft,factPolicy={},verbs=['tell','request','claim','consent_given','consent_revoked'],validate=null}={}){
 const context=primitiveContext(engine,document);
 createDraft??=doc=>engine.primitiveDraft(doc);
 const makeDraft=createDraft;
 createDraft=doc=>{const d=makeDraft(doc);ensureHoldings(d,engine);return d;};
 return createActionPrimitiveFrame(context,{actor,eventId,source,createDraft,factPolicy,verbs,validate,
  accountExists:(document,key)=>{
   const account=parseAccount(key),s=document.state,agent=account.owner==='player'||s.npcs?.[account.owner]||s.creatures?.[account.owner];
   return agent&&(account.resource===LEDGER_COIN?key===partyAccount(engine,s,account.owner):account.purpose==='inventory'&&engine.byId.has(account.resource));
  },
  mirrorTransfer:(d,effect)=>mirrorPrimitiveTransfer(d,engine,effect),
  executePrimitive:(d,effect,{frame,index,requireAuthority})=>{
   const child=`${frame.eventId}:${index}`,s=d.get('state');
   if(effect.op==='emit'&&['consent_given','consent_revoked'].includes(effect.verb))return applyConsentEvent(d,primitiveContext(engine,d.document),{actor:frame.actor,eventId:child,verb:effect.verb,to:effect.target,payload:effect.payload});
   if(effect.op==='obligation.create'){
    const a=requireAuthority(effect.op,effect.debtor);
    // Signing facts and protocol capabilities always come from the frame.
    return openObligation(d,engine,{id:effect.id,obligationKind:effect.obligationKind,debtor:effect.debtor,creditor:effect.creditor,amount:effect.amount,deadline:effect.deadline,subject:effect.subject,terms:effect.terms,actor:frame.actor,actedAs:a.actedAs?.source?{source:a.actedAs.source}:null},child);
   }
   if(effect.op==='obligation.settle'){
    const row=obligationRow(s,effect.id);if(!row)reject('E-OBLIGATION','Obligation does not exist');
    const payer=effect.payer??row.debtor,a=requireAuthority(effect.op,payer);
    if(effect.with!==undefined)reject('E-PRIMITIVE-CONNECTOR','In-kind settlement requires its performance adapter');
    return settleObligation(d,engine,{id:effect.id,amount:effect.amount,payer,actor:frame.actor,actedAs:a.actedAs?.source?{source:a.actedAs.source}:null},child);
   }
   if(effect.op==='obligation.cancel'){
    const row=obligationRow(s,effect.id);if(!row)reject('E-OBLIGATION','Obligation does not exist');
    const a=requireAuthority(effect.op,row.creditor);
    // closeObligation retains earned claims; cancellation cannot erase money.
    return closeObligation(d,engine,{id:effect.id,party:row.creditor,actor:frame.actor,reason:effect.reason,actedAs:a.actedAs?.source?{source:a.actedAs.source}:null},child);
   }
   reject('E-PRIMITIVE-CONNECTOR',`Missing primitive connector: ${effect.op}`);
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

function validatePreconditions(engine,current,action,slots,conditions=action.preconditions??[]){
 const library=createRXLibrary(engine,current,{context:primitiveContext(engine,current)}),slotSchema=Object.fromEntries(action.slots.map(slot=>[slot.name,slot.schema??(['quantity','coins','minutes'].includes(slot.kind)?'number':slot.kind==='flag'?'boolean':'string')]));
 for(const condition of conditions){
  const source=typeof condition==='string'?condition:condition.value;
  if(typeof source!=='string')reject('E-PRIMITIVE-CONNECTOR','Precondition requires an RX expression');
  const compiled=compileRX(source,{schema:{actor:'string',target:'string',slots:slotSchema},functions:library.signatures});
  if(evaluateRX(compiled,{actor:'player',target:slots.target??'player',slots},{functions:library.functions})!==true)reject('E-PRECONDITION',condition.reason??'Action precondition is not satisfied');
 }
}

export const primitiveRuntime={
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
  if(!aliveHoldings(actionReader(document),{kind:'guest_of',holder:'player'}).some(h=>h.variant==='detained'))return null;
  const family=({time:'wait',turn:'talk',dialogue:'talk',practice:'learn',trade:'transfer',promise:'obligation.create'})[tool]??tool;
  const to=tool==='move'?engine.resolve(args.destination):undefined;
  return this.canAct(engine,document,'player',family,{to});
 },
 validateLegacy(engine,document,tool,args,{replay=false}={}){
  if(replay&&!engine.world.actionDefinitions)return;
  const action=actionOfCall(this.registry(engine),tool,args);if(!action)return;
  validatePreconditions(engine,document,action,args,(action.preconditions??[]).filter(condition=>condition?.source));
  if(action.consent?.scope?.some?.(scope=>scope?.source))reject('E-PRIMITIVE-CONNECTOR','Additional consent scope requires its adjudication connector');
 },
 resolve(engine,input){
  const registry=this.registry(engine),action=findAction(registry,input.args?.action);
  if(registry.errors?.length)reject('E-ACTION-REGISTRY',registry.errors.join('; '));
  if(!action)reject('E-ACTION','Unknown registered action');
  if(!action.outcomes)return actionCall(registry,action.id,input.args?.slots??{});
  if(!engine.actionRegistry&&!engine.world.actionDefinitions)reject('E-ACTION-ARCHIVE','Primitive definitions must be part of the archived world');
  const slots=input.args?.slots??{};
  if(!slots||typeof slots!=='object'||Array.isArray(slots)||Object.keys(slots).some(k=>!action.slots.some(s=>s.name===k)))reject('E-ACTION-SLOT','Invalid action slots');
  for(const slot of action.slots)if(slot.required&&!Object.hasOwn(slots,slot.name))reject('E-ACTION-SLOT',`Missing slot: ${slot.name}`);
  // Programs needing adjudication must use its connector; never run them as
  // unconditional effects merely because an outcomes array exists.
  if(action.check||action.theft||action.rite||action.consent)reject('E-PRIMITIVE-CONNECTOR','This action requires its adjudication connector');
  return {action,effects:actionEffects(action,slots,'player')};
 },
 execute(engine,document,input,{createDraft,preview=false}={}){
  const resolved=this.resolve(engine,input);
  if(!resolved.effects)return {legacy:resolved};
  const {action}=resolved;
  if(action.cost?.owner!=='primitives'&&action.cost!==undefined)reject('E-ACTION-COST','Primitive actions must declare their cost owner');
  if(action.cost?.time||action.cost?.body)reject('E-PRIMITIVE-CONNECTOR','Action cost requires its time/body connector');
  const slots=input.args?.slots??{},validate=current=>validatePreconditions(engine,current,action,slots);
  const frame=createRuntimePrimitiveFrame(engine,document,{eventId:input.eventId,source:{kind:'catalog',id:action.id},createDraft,validate});
  const claims=primitiveClaims(engine,document,resolved.effects);
  if(claims.length&&!preview){
   const d=createDraft(structuredClone(document));let events=[];
   const pending=queuePrimitiveProposal(d,resolved.effects,frame,{claims,onCommitted:result=>{events=result.events;}});
   if(pending.receipt.duplicate)return {patches:[],events:[],receipt:pending.receipt};
   if(pending.receipt.status==='pending')engine.advance(d,0,input.eventId);
   if(pending.receipt.status==='pending')reject('E-PRIMITIVE-CONTEST','Scheduler did not finalize the proposal');
   if(d.scheduler){d.set(['state','scheduler','seq'],d.scheduler.seq);d.set(['state','scheduler','lastSettled'],d.scheduler.lastSettled);}
   return {patches:d.patches,receipt:pending.receipt,events};
  }
  return preview?planPrimitives(document,resolved.effects,frame):commitPrimitives(document,resolved.effects,frame);
 },
 canAct(engine,document,actor,family,effect){return canAct(primitiveContext(engine,document),actor,family,effect);}
};
registerPrimitiveActionRuntime(primitiveRuntime);
