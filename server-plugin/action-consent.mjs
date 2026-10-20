import {capacity,actionEntity,actionAge} from './action-capacity.mjs';
import {authority} from './action-authority.mjs';
import {PrimitiveRejected} from './primitive-policy.mjs';
import {declareHoldingWriter,holdingSet} from './holdings.mjs';
import {legalCodeAt} from './law-codes.mjs';

declareHoldingWriter('action-consent',{kinds:['permit']});
const minorIntimacy=(context,from,to,scope,purpose)=>/romance|intima|恋爱|亲密/.test(`${scope} ${purpose??''}`)&&[from,to].some(id=>id!=='player'&&(actionEntity(context,id)?.minor||actionEntity(context,id)?.flags?.minor||actionAge(context,id)<18));

// events are persisted, engine-observed consent facts, not a proposal's args.
export function consent(context,from,to,scope,{purpose=null,until=context.document.state?.minute??0,onRefusal='contest'}={}){
 if(minorIntimacy(context,from,to,scope,purpose))return {allowed:false,kind:'none',source:null,check:'abort',tags:[],reason:'未成年人物只进行正常互动'};
 const now=context.document.state?.minute??0,level=capacity(context,from,scope).level;
 if(!Number.isSafeInteger(until)||until<now)return {allowed:false,kind:'none',source:null,check:'abort',tags:[],reason:'Consent must cover the current or a future minute'};
 const events=context.consentEvents??context.document.state?.consentEvents??[];
 const result=(kind,source)=>({allowed:true,kind,source,check:null,tags:[]});
 const needsProxy=level==='none'||level==='limited'&&['mind','memory','property','transfer','mental_magic'].includes(scope);
 let purposeMismatch=false;
 for(let i=events.length-1;i>=0;i--){
  const e=events[i];if(e.type!=='consent_given'||typeof e.id!=='string'||!Number.isSafeInteger(e.at)||e.from!==from||e.to!==to||!(Array.isArray(e.scope)?e.scope.includes(scope):e.scope===scope)||e.at>now||e.until!==undefined&&(!Number.isSafeInteger(e.until)||e.until<=until))continue;
  if(events.slice(i+1).some(r=>r.type==='consent_revoked'&&r.from===from&&(r.consent===e.id||r.to===to&&(r.scope===undefined||r.scope===scope))&&(r.at??0)<=now))continue;
  if(e.purpose!==undefined&&!Array.isArray(e.purpose))continue;
  if(e.purpose?.length&&!e.purpose.includes(purpose)){purposeMismatch=true;continue;}
  if(!e.by||e.by===from){if(!needsProxy&&level!=='none')return result('given',e.id);continue;}
  const a=authority(context,e.by,'consent',from,{consentScope:scope});
  if(capacity(context,e.by,scope).level==='full'&&a.allowed&&a.sources.some(s=>s.kind!=='self'&&s.kind!=='owns'&&s.kind!=='operates'))return result('proxy',e.id);
 }
 // Existing spell permissions are factual grants, with their actual purpose,
 // spell/location limits and revocation. Free text is never widened to all uses.
 const action=({mind:'mental_magic',memory:'mental_magic'})[scope]??scope;
 if(!needsProxy)for(const [id,row] of Object.entries(context.document.state?.records??{})){
  if(row.category!=='authorization'||row.action!==action||row.subject!==from||row.grantor!==from||row.grantee!==to||row.revoked||row.endedAt!==undefined||!Number.isSafeInteger(row.expires)||row.expires<=until||(row.createdAt??0)>now)continue;
  const location=to==='player'?context.document.state.location:actionEntity(context,to)?.location;
  if(row.scope?.location&&row.scope.location!==location)continue;
  if(row.scope?.spell?row.scope.spell!==purpose:!row.purpose?.includes?.(purpose)&&row.content!==purpose){purposeMismatch=true;continue;}
  return result('given',id);
 }
 let emergency=context.emergencyConsent?.({from,to,scope,purpose,until});
 if(!emergency&&scope==='healing'&&until===now&&context.engine){
  const engine=context.engine,rule=engine.rules.law?.emergencyHealing,catalog=engine.byId?.get(purpose),location=catalog?.location??context.document.state.location,code=legalCodeAt(engine,location,context.document.state);
  if(rule&&code&&catalog&&rule.laws.includes(code.id)&&rule.statuses.includes(actionEntity(context,from)?.status)&&rule.operations.includes(catalog.effectSpec?.operation??catalog.effectSpec?.kind))emergency={allowed:true,source:`rules.law.emergencyHealing:${code.id}`};
 }
 if(emergency?.allowed&&emergency.source)return result('emergency',emergency.source);
 // NPC decision adapter returns the observed A2 decision with a provenance id.
 if(!needsProxy){const decision=context.consentDecision?.({from,to,scope,purpose,until});if(decision?.decision==='agree'&&decision.source)return result('given',decision.source);}
 return {allowed:false,kind:'none',source:null,check:onRefusal==='abort'?'abort':'contest',tags:purposeMismatch?['unconsented','unconsented:purpose']:['unconsented'],reason:'没有覆盖本次用途与期限的有效同意'};
}

// Native emit adapter. The actor comes from the frame. A proposal cannot assert
// another person's agreement; proxy grants require current authority facts.
export function applyConsentEvent(d,context,{actor,eventId,verb,to,payload={}}){
 const fail=message=>{throw new PrimitiveRejected('E-CONSENT',message);},document=d.document,live={...context,document},now=document.state.minute;
 if(!payload||typeof payload!=='object'||Array.isArray(payload)||Object.keys(payload).some(k=>!['from','scope','purpose','until','consent'].includes(k)))fail('Invalid consent event payload');
 const events=d.get('state','consentEvents')??[],old=payload.consent&&(events.find(e=>e.id===payload.consent&&e.type==='consent_given')??d.get('state','records',payload.consent));
 const from=verb==='consent_revoked'?(old?.from??old?.subject):payload.from??actor;
 const recipient=verb==='consent_revoked'?(old?.to??old?.grantee):to,scope=verb==='consent_revoked'?(old?.category==='authorization'?old.action:old?.scope):payload.scope;
 if(!from||!recipient||payload.from&&payload.from!==from||to&&to!==recipient)fail('Consent must refer to its actual donor and recipient');
 const realAgent=id=>id==='player'||Object.hasOwn(document.state.npcs??{},id)||Object.hasOwn(document.state.creatures??{},id);
 if(!realAgent(from)||!realAgent(recipient))fail('Consent parties must be current agents');
 if(actor!==from){const grant=authority(live,actor,'consent',from,{consentScope:scope});if(capacity(live,actor,scope).level!=='full'||!grant.allowed||!grant.sources.some(s=>!['self','owns','operates'].includes(s.kind)))fail('No current proxy authority');}
 if(verb==='consent_given'){
  if(typeof scope!=='string'||!scope||scope.length>120||!Number.isSafeInteger(payload.until)||payload.until<=now)fail('Consent needs a scope and future expiry');
  if(payload.purpose!==undefined&&(!Array.isArray(payload.purpose)||!payload.purpose.length||payload.purpose.length>16||payload.purpose.some(p=>typeof p!=='string'||!p||p.length>120)))fail('Invalid consent purposes');
  if(minorIntimacy(live,from,recipient,scope,payload.purpose))fail('Minor NPC cannot consent to intimacy');
  const level=capacity(live,from,scope).level;
  if(actor===from&&(level==='none'||level==='limited'&&['mind','memory','property','transfer','mental_magic'].includes(scope)))fail('This donor requires a genuine proxy');
  const row={id:eventId,type:verb,from,to:recipient,scope,at:now,until:payload.until,...(payload.purpose?{purpose:[...payload.purpose]}:{}),...(actor!==from?{by:actor}:{})};
  d.set(['state','consentEvents'],[...events,row]);
  return row;
 }
 if(verb!=='consent_revoked'||!old||old.revoked||(old.until??old.expires??Infinity)<=now||events.some(e=>e.type==='consent_revoked'&&e.consent===payload.consent&&e.at<=now))fail('No active consent to revoke');
 if(old.category&&old.category!=='authorization')fail('Record is not a consent authorization');
 const row={id:eventId,type:verb,from,to:recipient,consent:payload.consent,at:now};
 if(old.category==='authorization')holdingSet(d,context.engine,['state','records',payload.consent],{...old,revoked:true,revokedAt:now,revokedBy:actor},'action-consent',eventId);
 d.set(['state','consentEvents'],[...events,row]);return row;
}
